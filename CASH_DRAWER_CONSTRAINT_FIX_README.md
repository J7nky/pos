# Cash Drawer Accounts Constraint Fix

## Problem
The database has a constraint `unique_store_account` that only allows **one cash drawer account per store**. However, the system needs **one cash drawer account per branch**.

## Error Symptoms
```
duplicate key value violates unique constraint "unique_store_account"
```

This error occurs when trying to create a cash drawer account for a new branch when the store already has an account for another branch.

## Solution
We need to change the database constraint from per-store to per-branch.

## How to Apply the Fix

### Option 1: Using Supabase SQL Editor (Recommended)

1. **Go to your Supabase Dashboard**
   - Navigate to: https://supabase.com/dashboard/project/YOUR_PROJECT_ID

2. **Open SQL Editor**
   - Click on "SQL Editor" in the left sidebar
   - Click "New query"

3. **Run the Fix Script**
   - Open the file: `FIX_CASH_DRAWER_CONSTRAINT.sql`
   - Copy all the SQL code
   - Paste it into the SQL Editor
   - Click "Run" or press `Ctrl+Enter`

4. **Verify Success**
   - You should see messages like:
     ```
     ✅ Dropped constraint: unique_store_account
     ✅ Created constraint: unique_branch_cash_drawer_account
     ✅ No duplicate cash drawer accounts per branch
     ✅ Migration completed successfully!
     ```

### Option 2: Using Supabase CLI (If installed)

If you have the Supabase CLI installed:

```bash
# Navigate to the store-app directory
cd apps/store-app

# Apply the migration
supabase db push
```

## What Changed

### Before
- **Constraint**: One cash drawer account per store
- **Database Constraint**: `unique_store_account` on `store_id`
- **Problem**: Multiple branches couldn't have their own cash drawer accounts

### After
- **Constraint**: One cash drawer account per branch
- **Database Constraint**: `unique_branch_cash_drawer_account` on `(store_id, branch_id, account_code)`
- **Solution**: Each branch can have its own cash drawer account

## Verification

After applying the fix, you can verify it worked by:

1. **Check the constraint exists**:
```sql
SELECT conname, conrelid::regclass, pg_get_constraintdef(oid)
FROM pg_constraint
WHERE conname = 'unique_branch_cash_drawer_account';
```

2. **Try creating a cash drawer account for a new branch**:
   - Open a new branch in your application
   - The system should automatically create a cash drawer account without errors

## Files Modified

1. **Migration File**: 
   - `apps/store-app/supabase/migrations/20251211000000_fix_cash_drawer_accounts_unique_constraint.sql`
   
2. **Standalone Script** (for direct execution):
   - `FIX_CASH_DRAWER_CONSTRAINT.sql`

## Impact

- ✅ **No code changes needed** - The application code already queries by both `store_id` and `branch_id`
- ✅ **Backward compatible** - Existing cash drawer accounts will continue to work
- ✅ **Solves the issue** - New branches can now have their own cash drawer accounts

## Related Code

The application code in `db.ts` already handles branch-specific queries correctly:

```typescript
async getCashDrawerAccount(storeId: string, branchId: string): Promise<CashDrawerAccount | null> {
  const allAccounts = await this.cash_drawer_accounts
    .where(['store_id', 'branch_id'])
    .equals([storeId, branchId])
    .toArray();
  // ... rest of the code
}
```

## Testing

After applying the fix:

1. Create a new branch
2. Try to open a cash drawer session for that branch
3. Verify that the system creates a cash drawer account without errors
4. Verify that different branches have their own separate cash drawer accounts

## Rollback (If needed)

If you need to rollback, you can drop the new constraint and recreate the old one:

```sql
ALTER TABLE public.cash_drawer_accounts 
DROP CONSTRAINT IF EXISTS unique_branch_cash_drawer_account;

ALTER TABLE public.cash_drawer_accounts 
ADD CONSTRAINT unique_store_account UNIQUE (store_id);
```

**⚠️ Warning**: Only rollback if absolutely necessary, as this will bring back the original problem.
