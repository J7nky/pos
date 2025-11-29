-- Migration: Add foreign key relationship between cash_drawer_accounts and chart_of_accounts
-- Date: November 29, 2025
-- Purpose: Link cash_drawer_accounts.account_code to chart_of_accounts for accounting integrity

-- =============================================================================
-- 1. ADD FOREIGN KEY CONSTRAINT
-- =============================================================================

-- First, ensure all existing cash_drawer_accounts have valid account_codes
-- Default to '1100' (Cash) for any accounts without a valid code
UPDATE public.cash_drawer_accounts cda
SET account_code = '1100'
WHERE NOT EXISTS (
    SELECT 1 FROM public.chart_of_accounts coa 
    WHERE coa.store_id = cda.store_id 
    AND coa.account_code = cda.account_code
);

-- Add the foreign key constraint
-- Using (store_id, account_code) as composite key to ensure store-level isolation
ALTER TABLE public.cash_drawer_accounts
ADD CONSTRAINT fk_cash_drawer_accounts_chart_of_accounts
FOREIGN KEY (store_id, account_code) 
REFERENCES public.chart_of_accounts(store_id, account_code)
ON DELETE RESTRICT
ON UPDATE CASCADE;

-- =============================================================================
-- 2. ADD INDEX FOR PERFORMANCE
-- =============================================================================

-- Create index on the foreign key columns for faster lookups
CREATE INDEX IF NOT EXISTS idx_cash_drawer_accounts_store_account_code 
ON public.cash_drawer_accounts(store_id, account_code);

-- =============================================================================
-- 3. ADD COMMENTS FOR DOCUMENTATION
-- =============================================================================

COMMENT ON CONSTRAINT fk_cash_drawer_accounts_chart_of_accounts ON public.cash_drawer_accounts 
IS 'Links cash drawer accounts to chart of accounts for accounting integrity. Each cash drawer must reference a valid account in the chart of accounts.';

-- =============================================================================
-- 4. VERIFICATION QUERY (for manual testing)
-- =============================================================================

-- Run this query to verify the relationship is working:
-- SELECT 
--     cda.id as drawer_id,
--     cda.name as drawer_name,
--     cda.account_code,
--     coa.account_name,
--     coa.account_type
-- FROM cash_drawer_accounts cda
-- JOIN chart_of_accounts coa ON cda.store_id = coa.store_id AND cda.account_code = coa.account_code;

-- =============================================================================
-- MIGRATION COMPLETE
-- =============================================================================

DO $$
BEGIN
    RAISE NOTICE 'Migration completed: cash_drawer_accounts now linked to chart_of_accounts';
    RAISE NOTICE 'Foreign key: fk_cash_drawer_accounts_chart_of_accounts';
    RAISE NOTICE 'This ensures all cash drawers reference valid accounting codes';
END $$;
