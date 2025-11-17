# Status Revert Bug Fix - ReceivedBills Component

## Problem Description

When closing a bill in the `handleCloseReceivedBill` function, the status was correctly set to `"CLOSED"` in the database. However, after the UI updated, the status would revert back to `"Completed"` instead of staying as `"Closed"`.

## Root Cause

The issue was in the `ReceivedBills.tsx` component's status calculation logic (lines 302-309 and 486-495). The component was:

1. **Calculating status based on progress percentage** (e.g., if 100% sold → "completed")
2. **Then checking for closed status** as an afterthought
3. **Using incorrect case comparison** - checking for `'closed'` (lowercase) when the database stores `'CLOSED'` (uppercase)
4. **Not prioritizing the actual batch status** from the `inventory_bills` table

### The Flow of the Bug

1. User closes a bill → `handleCloseReceivedBill` sets `batch.status = "CLOSED"` in database ✅
2. UI refreshes and re-renders `ReceivedBills` component
3. Component calculates status based on progress: `if (validProgress >= 100) status = 'completed'` ❌
4. Component then checks: `if ((item as any).status === 'closed')` - but it's `'CLOSED'` (uppercase) ❌
5. Status remains as `'completed'` instead of `'closed'` ❌

## Solution

Modified the status calculation logic to **prioritize the actual batch status** from the database over the progress-based calculation.

### Changes Made

#### 1. Individual Bills Status Calculation (lines 302-323)

**Before:**
```typescript
let status = 'pending';
if (validProgress >= 100) status = 'completed';
else if (validProgress >= 75) status = 'nearly-complete';
else if (validProgress >= 50) status = 'halfway';
else if (validProgress > 0) status = 'in-progress';

const isClosed = closedBillIds.has(item.id) || (item as any).status === 'closed' || (item as any).is_closed === true;
if (isClosed) status = 'closed';
```

**After:**
```typescript
// Check batch status first - it takes precedence over calculated status
const batchStatus = batch?.status ? batch.status.toUpperCase() : null;

let status = 'pending';
if (batchStatus === 'CLOSED') {
  // If batch is closed, status is always closed regardless of progress
  status = 'closed';
} else if (batchStatus === 'COMPLETED') {
  status = 'completed';
} else if (batchStatus === 'PROGRESS') {
  status = 'in-progress';
} else if (batchStatus === 'RECEIVED') {
  status = 'pending';
} else {
  // Fallback to progress-based calculation if no batch status
  if (validProgress >= 100) status = 'completed';
  else if (validProgress >= 75) status = 'nearly-complete';
  else if (validProgress >= 50) status = 'halfway';
  else if (validProgress > 0) status = 'in-progress';
}

const isClosed = status === 'closed' || closedBillIds.has(item.id);
```

#### 2. Grouped Bills Status Calculation (lines 497-528)

**Before:**
```typescript
let status = 'pending';
if (progress >= 100) status = 'completed';
else if (progress >= 75) status = 'nearly-complete';
else if (progress >= 50) status = 'halfway';
else if (progress > 0) status = 'in-progress';
// If all items in the group are closed, mark the group as closed
const allClosed = g.items.length > 0 && g.items.every((it: any) => it.isClosed === true);
if (allClosed) {
  status = 'closed';
}
```

**After:**
```typescript
// Get the actual batch status from the first item (all items in a batch share the same status)
const firstItemBatchStatus = g.items.length > 0 && g.items[0].batchId 
  ? inventoryBills.find((b: any) => b.id === g.items[0].batchId)?.status 
  : null;
const batchStatus = firstItemBatchStatus ? firstItemBatchStatus.toUpperCase() : null;

let status = 'pending';
if (batchStatus === 'CLOSED') {
  status = 'closed';
} else if (batchStatus === 'COMPLETED') {
  status = 'completed';
} else if (batchStatus === 'PROGRESS') {
  status = 'in-progress';
} else if (batchStatus === 'RECEIVED') {
  status = 'pending';
} else {
  // Fallback to progress-based calculation
  if (progress >= 100) status = 'completed';
  else if (progress >= 75) status = 'nearly-complete';
  else if (progress >= 50) status = 'halfway';
  else if (progress > 0) status = 'in-progress';
}

// If all items in the group are closed, mark the group as closed
const allClosed = status === 'closed' || (g.items.length > 0 && g.items.every((it: any) => it.isClosed === true));
if (allClosed) {
  status = 'closed';
}
```

## Key Improvements

1. ✅ **Database status is now the source of truth** - The actual `batch.status` from `inventory_bills` table takes precedence
2. ✅ **Case-insensitive comparison** - Using `.toUpperCase()` to handle both `'CLOSED'` and `'closed'`
3. ✅ **Proper status hierarchy** - Checks database status first, then falls back to progress-based calculation
4. ✅ **Consistent behavior** - Both individual and grouped bills use the same logic

## Testing

To verify the fix:

1. Open a received bill
2. Close the bill using the "Close Bill" action
3. Verify the status shows as "Closed" (not "Completed")
4. Refresh the page
5. Verify the status remains "Closed"

## Files Modified

- `/home/janky/Desktop/pos-1/apps/store-app/src/components/accountingPage/tabs/ReceivedBills.tsx`
  - Lines 302-323: Individual bills status calculation
  - Lines 497-528: Grouped bills status calculation

## Related Issues

This fix ensures that the status workflow is respected:
- `RECEIVED` → `PROGRESS` → `COMPLETED` → `CLOSED`
- Once a bill is `CLOSED`, it should remain closed regardless of sales progress
- The UI should always reflect the actual database state
