# Branch ID Journal Entry Fix

## Problem

Two critical issues were identified:

1. **`branch_id` was always `null` in journal entries** - Even though transactions had `branch_id` set, journal entries were hardcoded to `null`
2. **Cash drawer balance calculation returned $0** - Because journal entries had `branch_id: null`, the balance calculation query couldn't find them when filtering by branch

### Console Error
```
💰 Balance discrepancy detected: Stored: $1000.00, Calculated: $0.00
💰 Balance reconciled: $1000.00 → $0.00
```

## Root Cause

1. **Journal Entry Creation**: In `journalService.ts`, `branch_id` was hardcoded to `null`:
   ```typescript
   branch_id: null,  // ❌ Always null
   ```

2. **Missing Parameter**: The `CreateJournalEntryParams` interface didn't include `branchId`, so it couldn't be passed from transactions

3. **Balance Calculation**: The fallback query used `[store_id+branch_id]` index with exact match, which couldn't find entries with `branch_id: null`

## Solution

### 1. Added `branchId` to `CreateJournalEntryParams`

**File:** `apps/store-app/src/types/accounting.ts`

```typescript
export interface CreateJournalEntryParams {
  // ... existing fields ...
  branchId?: string | null;  // ✅ Branch ID - should match transaction.branch_id
}
```

### 2. Updated `journalService.createJournalEntry` to Use `branchId`

**File:** `apps/store-app/src/services/journalService.ts`

**Before:**
```typescript
branch_id: null,  // ❌ Hardcoded
```

**After:**
```typescript
branch_id: branchId,  // ✅ Use branch_id from transaction
```

### 3. Pass `branchId` from Transaction to Journal Entry

**File:** `apps/store-app/src/services/transactionService.ts`

**Before:**
```typescript
await journalService.createJournalEntry({
  transactionId: transaction.id,
  // ... other params ...
  // ❌ branchId not passed
});
```

**After:**
```typescript
await journalService.createJournalEntry({
  transactionId: transaction.id,
  // ... other params ...
  branchId: transaction.branch_id  // ✅ Pass branch_id from transaction
});
```

### 4. Fixed Balance Calculation Query

**File:** `apps/store-app/src/utils/balanceCalculation.ts`

**Before:**
```typescript
// ❌ Includes null branch_id entries (backward compatibility)
.and(e => e.is_posted === true && (!e.branch_id || e.branch_id === branchId))
```

**After:**
```typescript
// ✅ Only matches exact branch_id (no backward compatibility)
.and(e => e.is_posted === true && e.branch_id === branchId)
```

**Fallback query also updated:**
```typescript
// ✅ Uses [store_id+branch_id] index for exact match
const entries = await db.journal_entries
  .where('[store_id+branch_id]')
  .equals([storeId, branchId])
  .and(e => 
    e.account_code === '1100' &&
    e.currency === currency && 
    e.is_posted === true
  )
  .toArray();
```

## Impact

### ✅ Fixed Issues

1. **Journal entries now require `branch_id`** - All journal entries must have a valid `branch_id` matching the transaction
2. **Cash drawer balance calculation will work** - Only finds journal entries with exact `branch_id` match
3. **Strict branch-level accounting** - No null `branch_id` entries allowed, ensuring accurate branch-level financial tracking

### ⚠️ Important Notes

- **`branch_id` is now required** - Journal entry creation will fail if `branch_id` is missing
- **Transactions must have `branch_id`** - Validation added to ensure transactions always include `branch_id`
- **Balance calculations are branch-specific** - Only entries with matching `branch_id` are included

### 📝 Notes

- **`branch_id` is now required** - No backward compatibility for null values
- **Validation added** - Both `journalService` and `transactionService` validate that `branch_id` is present
- **Strict branch filtering** - Balance calculations only include entries with exact `branch_id` match
- **Convenience methods** - Legacy methods in `journalService` (like `recordCashSale`, `recordCreditSale`, etc.) will need to be updated to pass `branchId` if they're used

## Testing

After this fix:

1. **Create a new sale** - Journal entries should have `branch_id` matching the transaction
2. **Check cash drawer balance** - Should calculate correctly from journal entries with matching `branch_id`
3. **Verify journal entries** - Query `journal_entries` table and confirm `branch_id` is set (never null)
4. **Test validation** - Try creating a transaction without `branch_id` - should fail with clear error

## Related Files

- `apps/store-app/src/types/accounting.ts` - Added `branchId` parameter
- `apps/store-app/src/services/journalService.ts` - Use `branchId` in journal entries
- `apps/store-app/src/services/transactionService.ts` - Pass `branchId` to journal entry creation
- `apps/store-app/src/utils/balanceCalculation.ts` - Fixed fallback query to handle null `branch_id`

## Accounting Pattern Compliance

This fix ensures compliance with the **Atomic Posting Pattern**:

✅ **Step 3 — Create journal_entries** - Journal entries now correctly include `branch_id` matching the transaction
✅ **Step 4 — Apply cache updates** - Cash drawer balance calculation can now find journal entries by branch

The system now properly tracks branch-level financial data in journal entries, which is essential for:
- Branch-specific cash drawer balances
- Branch-level financial reporting
- Multi-branch accounting accuracy

