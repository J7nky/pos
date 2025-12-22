-- Migration: Remove Balance Fields from Entities Table
-- Date: January 30, 2025
-- 
-- This migration removes usd_balance and lb_balance fields from the entities table.
-- Entity balances are now calculated from journal_entries (source of truth).
-- This follows accounting best practices: balances are DERIVED, not STORED.
--
-- IMPORTANT: This migration assumes the entities table may have been created
-- with balance fields in a previous version. If the fields don't exist,
-- the migration will complete successfully (using IF EXISTS).

-- =============================================================================
-- 1. REMOVE BALANCE FIELDS FROM ENTITIES TABLE
-- =============================================================================

-- Drop balance columns if they exist
-- Using IF EXISTS to handle cases where the table was created without these fields
DO $$
BEGIN
    -- Check if usd_balance column exists and drop it
    IF EXISTS (
        SELECT 1 
        FROM information_schema.columns 
        WHERE table_schema = 'public' 
        AND table_name = 'entities' 
        AND column_name = 'usd_balance'
    ) THEN
        ALTER TABLE public.entities DROP COLUMN usd_balance;
        RAISE NOTICE 'Dropped usd_balance column from entities table';
    ELSE
        RAISE NOTICE 'usd_balance column does not exist - skipping';
    END IF;

    -- Check if lb_balance column exists and drop it
    IF EXISTS (
        SELECT 1 
        FROM information_schema.columns 
        WHERE table_schema = 'public' 
        AND table_name = 'entities' 
        AND column_name = 'lb_balance'
    ) THEN
        ALTER TABLE public.entities DROP COLUMN lb_balance;
        RAISE NOTICE 'Dropped lb_balance column from entities table';
    ELSE
        RAISE NOTICE 'lb_balance column does not exist - skipping';
    END IF;
END $$;

-- =============================================================================
-- 2. UPDATE TABLE COMMENT
-- =============================================================================

COMMENT ON TABLE public.entities IS 
'Unified abstraction for customers, suppliers, employees, and system entities. 
IMPORTANT: Entity balances are NOT stored in this table. 
Balances are calculated from journal_entries WHERE account_code IN (''1200'', ''2100'') AND entity_id = entities.id.
This ensures data integrity and follows double-entry bookkeeping principles.
Use balance_snapshots table for performance optimization of historical queries.';

-- =============================================================================
-- 3. VERIFICATION
-- =============================================================================

-- Verify that balance fields have been removed
DO $$
DECLARE
    usd_balance_exists BOOLEAN;
    lb_balance_exists BOOLEAN;
BEGIN
    -- Check if usd_balance still exists
    SELECT EXISTS (
        SELECT 1 
        FROM information_schema.columns 
        WHERE table_schema = 'public' 
        AND table_name = 'entities' 
        AND column_name = 'usd_balance'
    ) INTO usd_balance_exists;

    -- Check if lb_balance still exists
    SELECT EXISTS (
        SELECT 1 
        FROM information_schema.columns 
        WHERE table_schema = 'public' 
        AND table_name = 'entities' 
        AND column_name = 'lb_balance'
    ) INTO lb_balance_exists;

    IF usd_balance_exists OR lb_balance_exists THEN
        RAISE WARNING 'Balance fields still exist after migration!';
        IF usd_balance_exists THEN
            RAISE WARNING '  - usd_balance column still exists';
        END IF;
        IF lb_balance_exists THEN
            RAISE WARNING '  - lb_balance column still exists';
        END IF;
    ELSE
        RAISE NOTICE '✅ Successfully removed all balance fields from entities table';
        RAISE NOTICE '✅ Entity balances will now be calculated from journal_entries';
    END IF;
END $$;

-- =============================================================================
-- MIGRATION COMPLETE
-- =============================================================================

-- Log completion
DO $$
BEGIN
    RAISE NOTICE '========================================';
    RAISE NOTICE 'Entity Balance Fields Removal Complete';
    RAISE NOTICE '========================================';
    RAISE NOTICE 'Removed: usd_balance, lb_balance from entities table';
    RAISE NOTICE 'Balances are now calculated from journal_entries (source of truth)';
    RAISE NOTICE 'Use entityBalanceService.getEntityBalances() in application code';
    RAISE NOTICE '========================================';
END $$;

