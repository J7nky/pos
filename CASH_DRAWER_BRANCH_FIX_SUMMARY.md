# Cash Drawer Branch Fix - Implementation Summary

**Date**: December 11, 2025  
**Issue**: Cash drawer accounts were constrained to one per store instead of one per branch

## Problem Description

### Original Constraint
The database had a unique constraint `unique_store_account` that only allowed **one cash drawer account per store**. This prevented multiple branches within the same store from having their own cash drawer accounts.

### Error Symptoms
```
duplicate key value violates unique constraint "unique_store_account"
❌ No cash drawer account exists for store <store_id>, branch <branch_id>
```

### Business Requirement
Each branch should have its own cash drawer account to manage cash independently.

---

## Solution Implementation

### 1. Database Migration

#### File: `apps/store-app/supabase/migrations/20251211000000_fix_cash_drawer_accounts_unique_constraint.sql`

**Changes:**
- ✅ Drops the old `unique_store_account` constraint
- ✅ Creates new `unique_branch_cash_drawer_account` constraint on `(store_id, branch_id, account_code)`
- ✅ Cleans up any existing duplicate accounts
- ✅ Reassigns unassigned accounts to appropriate branches
- ✅ Adds performance index on `(store_id, branch_id, account_code)`

**Constraint Change:**
```sql
-- OLD (WRONG)
UNIQUE (store_id)

-- NEW (CORRECT)
UNIQUE (store_id, branch_id, account_code)
```

### 2. Standalone SQL Script

#### File: `FIX_CASH_DRAWER_CONSTRAINT.sql`

A standalone SQL script that can be run directly in Supabase SQL Editor for immediate fixes without migration tooling.

### 3. Code Updates

#### File: `apps/store-app/src/contexts/OfflineDataContext.tsx`

**Before:**
```typescript
const cleanupResult = await cashDrawerUpdateService.cleanupDuplicateAccounts(storeId);
```

**After:**
```typescript
// Get all branches for this store
const branches = await db.branches
  .where('store_id')
  .equals(storeId)
  .filter(b => !b.is_deleted)
  .toArray();

// Clean up duplicates for each branch
let totalDuplicatesRemoved = 0;
for (const branch of branches) {
  const cleanupResult = await cashDrawerUpdateService.cleanupDuplicateAccounts(storeId, branch.id);
  if (cleanupResult.success && cleanupResult.duplicatesRemoved > 0) {
    totalDuplicatesRemoved += cleanupResult.duplicatesRemoved;
  }
}
```

**Why**: The `cleanupDuplicateAccounts` method signature was already updated to require `branchId`, but the calling code wasn't updated. Now it cleans up duplicates for each branch separately.

---

## Files Created/Modified

### Created
1. ✅ `apps/store-app/supabase/migrations/20251211000000_fix_cash_drawer_accounts_unique_constraint.sql`
2. ✅ `FIX_CASH_DRAWER_CONSTRAINT.sql` (standalone script)
3. ✅ `CASH_DRAWER_CONSTRAINT_FIX_README.md` (documentation)
4. ✅ `CASH_DRAWER_BRANCH_FIX_SUMMARY.md` (this file)

### Modified
1. ✅ `apps/store-app/src/contexts/OfflineDataContext.tsx`
   - Updated `cleanupDuplicateAccounts` call to loop through all branches

### Already Correct (No Changes Needed)
1. ✅ `apps/store-app/src/services/cashDrawerUpdateService.ts`
   - Method signature already includes `branchId` parameter
   - Already queries by both `store_id` and `branch_id`
   
2. ✅ `apps/store-app/src/lib/db.ts`
   - `getCashDrawerAccount()` already queries by both `store_id` and `branch_id`

---

## How to Apply

### Option 1: Supabase SQL Editor (Recommended)

1. Go to Supabase Dashboard → SQL Editor
2. Open `FIX_CASH_DRAWER_CONSTRAINT.sql`
3. Copy and paste the entire script
4. Click "Run" or press `Ctrl+Enter`
5. Verify success messages in the output

### Option 2: Migration (If using Supabase CLI)

```bash
cd apps/store-app
supabase db push
```

---

## Verification

### 1. Check Constraint Exists
```sql
SELECT conname, conrelid::regclass, pg_get_constraintdef(oid)
FROM pg_constraint
WHERE conname = 'unique_branch_cash_drawer_account';
```

**Expected Output:**
```
conname: unique_branch_cash_drawer_account
conrelid: cash_drawer_accounts
pg_get_constraintdef: UNIQUE (store_id, branch_id, account_code)
```

### 2. Test Creating Cash Drawer Account

1. Create a new branch in the system
2. Open a cash drawer session for that branch
3. Verify that a cash drawer account is created without errors
4. Check that different branches have separate accounts:

```sql
SELECT store_id, branch_id, account_code, name, current_balance
FROM cash_drawer_accounts
WHERE store_id = '<your-store-id>'
ORDER BY branch_id;
```

### 3. Test Application Flow

1. **Open Branch Selection Screen**
   - Select a branch
   - Verify branch loads without errors

2. **Open Cash Drawer**
   - Navigate to cash drawer screen
   - Open a new session
   - Verify no constraint errors

3. **Multiple Branches**
   - Switch between different branches
   - Open cash drawer in each branch
   - Verify each branch maintains its own balance

---

## Database Schema Changes

### Before
```
cash_drawer_accounts
├── id (PK)
├── store_id (FK)
├── branch_id (FK) 
├── account_code
└── CONSTRAINT unique_store_account UNIQUE (store_id)  ❌
```

### After
```
cash_drawer_accounts
├── id (PK)
├── store_id (FK)
├── branch_id (FK)
├── account_code
└── CONSTRAINT unique_branch_cash_drawer_account UNIQUE (store_id, branch_id, account_code) ✅
```

---

## Impact Analysis

### ✅ Positive Impacts
1. **Multiple branches can operate independently** - Each branch now has its own cash drawer
2. **Better accounting** - Cash flow is tracked per branch
3. **No code changes to application logic** - The code was already written correctly
4. **Backward compatible** - Existing single-branch stores continue to work

### ⚠️ Potential Issues (Handled)
1. **Existing duplicate accounts** - Migration script cleans these up automatically
2. **Orphaned sessions** - Migration script reassigns sessions to the correct account
3. **Balance consolidation** - If duplicates exist, balances are merged

### 📊 Performance
- **New index added** on `(store_id, branch_id, account_code)` for fast lookups
- **No performance degradation** - Query patterns remain the same

---

## Testing Checklist

- [ ] Run migration script in Supabase SQL Editor
- [ ] Verify constraint was created successfully
- [ ] Test opening a new branch
- [ ] Test creating a cash drawer session for new branch
- [ ] Test switching between branches
- [ ] Verify each branch has its own cash drawer account
- [ ] Check that balances are tracked separately per branch
- [ ] Test offline sync (if applicable)
- [ ] Verify no console errors related to cash drawer

---

## Rollback Plan

If you need to rollback (not recommended):

```sql
-- Drop the new constraint
ALTER TABLE public.cash_drawer_accounts 
DROP CONSTRAINT IF EXISTS unique_branch_cash_drawer_account;

-- Recreate the old constraint (this will bring back the original problem)
ALTER TABLE public.cash_drawer_accounts 
ADD CONSTRAINT unique_store_account UNIQUE (store_id);
```

**⚠️ Warning**: Only rollback if absolutely necessary, as this will prevent branches from having their own cash drawer accounts.

---

## Related Documentation

- `CASH_DRAWER_CONSTRAINT_FIX_README.md` - Detailed instructions
- `FIX_CASH_DRAWER_CONSTRAINT.sql` - Standalone SQL script
- `apps/store-app/supabase/migrations/20251211000000_fix_cash_drawer_accounts_unique_constraint.sql` - Migration file

---

## Success Criteria

✅ **The fix is successful when:**
1. Multiple branches can have their own cash drawer accounts
2. Opening a new branch automatically creates its cash drawer account
3. No `unique_store_account` constraint errors appear
4. Cash drawer balances are tracked separately per branch
5. All branches can open/close cash drawer sessions independently

---

## Support

If you encounter any issues:
1. Check the console for specific error messages
2. Verify the migration was applied successfully
3. Check that `currentBranchId` is set correctly in the application
4. Review the Supabase logs for any RLS policy issues

---

**Status**: ✅ **READY TO DEPLOY**

All files have been created and code has been updated. The migration is ready to be applied to the database.
