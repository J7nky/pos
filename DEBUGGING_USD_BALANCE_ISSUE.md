# Debugging USD Balance Update Issue

## Problem
When making a payment in USD, the USD balance doesn't increase or decrease.

## Debugging Steps Added

### 1. Added Logging in `processPayment` (OfflineDataContext.tsx)
- Logs entity name and currency
- Logs current balances (LBP and USD)  
- Logs payment amount
- Logs before/after update values
- Verifies entity in memory after update

### 2. Added Logging in `crudHelperService.updateEntity`
- Logs the table name and ID being updated
- Logs the update data
- Logs the Dexie update result
- Fetches and logs the entity after update to verify it saved

## How to Test

1. Open browser console (F12)
2. Go to Customers page
3. Make a payment in USD
4. Watch the console logs

### Expected Console Output:

```
💳 Payment Processing - Entity: John Doe, Currency: USD
💳 Current Balances - LBP: 0, USD: 100
💳 Payment Amount: 50
💳 Updating USD balance from 100 to 50
🔧 CRUDHelper: Updating customers with ID abc-123 { usd_balance: 50 }
🔧 CRUDHelper: Update result for customers: 1
🔧 CRUDHelper: Entity after update: { id: 'abc-123', name: 'John Doe', usd_balance: 50, ... }
💳 After update - LBP: 0, USD: 100 (this will be old - before refreshData)
```

## Possible Issues to Look For

### Issue 1: Update returns 0 (Not Found)
```
🔧 CRUDHelper: Update result for customers: 0
```
**Cause:** Entity ID doesn't exist in database
**Solution:** Check entity ID is correct

### Issue 2: Entity after update shows old value
```
🔧 CRUDHelper: Entity after update: { usd_balance: 100 }  // Should be 50!
```
**Cause:** Update didn't save properly
**Solution:** Check Dexie update syntax or field name

### Issue 3: Field name mismatch
```
🔧 CRUDHelper: Entity after update: { usdBalance: 100 }  // camelCase instead of snake_case
```
**Cause:** Database schema uses snake_case, code uses camelCase
**Solution:** Ensure field mapping is correct

### Issue 4: No logs appear
**Cause:** Function not being called
**Solution:** Check if processPayment is being invoked

## Next Steps

1. Run the test and check console logs
2. Look for which issue pattern matches
3. Fix accordingly

## Common Fixes

### Fix 1: Field Name Mapping
If database uses `usd_balance` but update sends `usdBalance`:

```typescript
// In database schema (Supabase/IndexedDB)
usd_balance: number

// Must match in update
{ usd_balance: 50 }  // ✅ Correct
{ usdBalance: 50 }    // ❌ Wrong
```

### Fix 2: Refresh Data Issue
If update works but UI doesn't show changes:
- Check refreshData() is called
- Check React state is updating
- Check component is re-rendering with new data

### Fix 3: Race Condition
If multiple updates happen simultaneously:
- Add transaction wrapping
- Use locks for critical updates
- Ensure updates are sequential

## Database Schema Reference

### Customers Table
```sql
CREATE TABLE customers (
  id UUID PRIMARY KEY,
  name VARCHAR,
  phone VARCHAR,
  email VARCHAR,
  address VARCHAR,
  lb_balance DECIMAL(15,2) DEFAULT 0,  -- snake_case!
  usd_balance DECIMAL(15,2) DEFAULT 0, -- snake_case!
  is_active BOOLEAN DEFAULT true,
  store_id UUID,
  created_at TIMESTAMP,
  updated_at TIMESTAMP
);
```

### Suppliers Table  
```sql
CREATE TABLE suppliers (
  id UUID PRIMARY KEY,
  name VARCHAR,
  phone VARCHAR,
  email VARCHAR,
  address VARCHAR,
  lb_balance DECIMAL(15,2) DEFAULT 0,  -- snake_case!
  usd_balance DECIMAL(15,2) DEFAULT 0, -- snake_case!
  store_id UUID,
  created_at TIMESTAMP,
  updated_at TIMESTAMP
);
```

## Manual Database Check

To manually verify the update is saved:

1. Open browser DevTools
2. Go to Application → IndexedDB → pos-db → customers (or suppliers)
3. Find the entity by ID
4. Check if `usd_balance` changed after payment

If it's not changing in IndexedDB, the issue is in the update logic.
If it IS changing in IndexedDB but UI doesn't update, the issue is in refreshData/React rendering.

