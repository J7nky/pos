-- Migration: Fix cash drawer accounts unique constraint
-- Date: December 11, 2025
-- Purpose: Change unique constraint from per-store to per-branch
--          Each branch should have its own cash drawer account, not just one per store

-- =============================================================================
-- 1. DROP THE OLD CONSTRAINT (if it exists)
-- =============================================================================

-- Drop the constraint that enforces one account per store
DO $$
BEGIN
    -- Check if constraint exists and drop it
    IF EXISTS (
        SELECT 1 FROM pg_constraint 
        WHERE conname = 'unique_store_account' 
        AND conrelid = 'public.cash_drawer_accounts'::regclass
    ) THEN
        ALTER TABLE public.cash_drawer_accounts 
        DROP CONSTRAINT unique_store_account;
        RAISE NOTICE 'Dropped constraint: unique_store_account';
    ELSE
        RAISE NOTICE 'Constraint unique_store_account does not exist, skipping drop';
    END IF;
END $$;

-- =============================================================================
-- 2. ADD NEW UNIQUE CONSTRAINT PER BRANCH
-- =============================================================================

-- Create a unique constraint that allows one cash drawer account per branch
-- Using (store_id, branch_id, account_code) ensures:
-- - Each branch can have its own cash drawer account
-- - Multiple branches in the same store can each have their own account
-- - A branch cannot have duplicate accounts for the same account_code
DO $$
BEGIN
    -- Check if constraint already exists
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint 
        WHERE conname = 'unique_branch_cash_drawer_account' 
        AND conrelid = 'public.cash_drawer_accounts'::regclass
    ) THEN
        ALTER TABLE public.cash_drawer_accounts
        ADD CONSTRAINT unique_branch_cash_drawer_account 
        UNIQUE (store_id, branch_id, account_code);
        RAISE NOTICE 'Created constraint: unique_branch_cash_drawer_account';
    ELSE
        RAISE NOTICE 'Constraint unique_branch_cash_drawer_account already exists, skipping creation';
    END IF;
END $$;

-- =============================================================================
-- 3. CLEAN UP DUPLICATE ACCOUNTS (if any exist)
-- =============================================================================

-- If there are multiple cash drawer accounts for the same store that need to be
-- assigned to different branches, this will help identify them
DO $$
DECLARE
    account_record RECORD;
    branch_cursor CURSOR FOR 
        SELECT DISTINCT b.id as branch_id, b.store_id
        FROM public.branches b
        WHERE EXISTS (
            SELECT 1 FROM public.cash_drawer_accounts cda
            WHERE cda.store_id = b.store_id
            GROUP BY cda.store_id
            HAVING COUNT(*) > 1
        )
        AND NOT EXISTS (
            SELECT 1 FROM public.cash_drawer_accounts cda2
            WHERE cda2.store_id = b.store_id 
            AND cda2.branch_id = b.id
        )
        ORDER BY b.created_at ASC;
    unassigned_account_id uuid;
BEGIN
    -- Assign unassigned cash drawer accounts to branches that don't have one
    FOR account_record IN branch_cursor LOOP
        -- Find an account for this store that either has no branch_id or is assigned to a non-existent branch
        SELECT id INTO unassigned_account_id
        FROM public.cash_drawer_accounts
        WHERE store_id = account_record.store_id
        AND (
            branch_id IS NULL 
            OR branch_id != account_record.branch_id
            OR NOT EXISTS (
                SELECT 1 FROM public.branches 
                WHERE id = branch_id
            )
        )
        LIMIT 1;
        
        IF unassigned_account_id IS NOT NULL THEN
            -- Assign this account to the branch
            UPDATE public.cash_drawer_accounts
            SET branch_id = account_record.branch_id,
                updated_at = now()
            WHERE id = unassigned_account_id;
            
            RAISE NOTICE 'Assigned cash drawer account % to branch %', 
                unassigned_account_id, account_record.branch_id;
        END IF;
    END LOOP;
END $$;

-- =============================================================================
-- 4. ADD INDEX FOR PERFORMANCE
-- =============================================================================

-- Create an index on the new unique constraint for faster lookups
CREATE INDEX IF NOT EXISTS idx_cash_drawer_accounts_branch_account_code 
ON public.cash_drawer_accounts(store_id, branch_id, account_code);

-- =============================================================================
-- 5. VERIFICATION QUERIES
-- =============================================================================

-- Check for any stores that have multiple branches but share cash drawer accounts
-- This should return 0 rows after the migration
DO $$
DECLARE
    problem_count integer;
BEGIN
    SELECT COUNT(*) INTO problem_count
    FROM (
        SELECT cda.store_id, cda.branch_id, COUNT(*) as account_count
        FROM public.cash_drawer_accounts cda
        GROUP BY cda.store_id, cda.branch_id
        HAVING COUNT(*) > 1
    ) duplicates;
    
    IF problem_count > 0 THEN
        RAISE WARNING 'Found % branches with duplicate cash drawer accounts', problem_count;
    ELSE
        RAISE NOTICE '✅ No duplicate cash drawer accounts per branch found';
    END IF;
END $$;

-- =============================================================================
-- MIGRATION COMPLETE
-- =============================================================================

DO $$
BEGIN
    RAISE NOTICE '========================================';
    RAISE NOTICE 'Migration completed successfully!';
    RAISE NOTICE '========================================';
    RAISE NOTICE '✅ Changed constraint from per-store to per-branch';
    RAISE NOTICE '✅ Each branch can now have its own cash drawer account';
    RAISE NOTICE '✅ Constraint: unique_branch_cash_drawer_account (store_id, branch_id, account_code)';
    RAISE NOTICE '========================================';
END $$;
