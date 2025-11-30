-- Migration: Create function to initialize cash drawer accounts for a branch
-- Date: November 29, 2025
-- Purpose: After chart_of_accounts is created, initialize cash_drawer_accounts with branch_id

-- =============================================================================
-- 1. CREATE FUNCTION TO INITIALIZE CASH DRAWER ACCOUNTS
-- =============================================================================

CREATE OR REPLACE FUNCTION public.initialize_cash_drawer_accounts(
    p_store_id uuid,
    p_branch_id uuid DEFAULT NULL
)
RETURNS void AS $$
DECLARE
    v_branch_id uuid;
BEGIN
    -- If branch_id not provided, get the first (main) branch for the store
    IF p_branch_id IS NULL THEN
        SELECT id INTO v_branch_id
        FROM public.branches
        WHERE store_id = p_store_id
          AND (is_deleted IS NULL OR is_deleted = false)
        ORDER BY created_at ASC
        LIMIT 1;
        
        IF v_branch_id IS NULL THEN
            RAISE EXCEPTION 'No branch found for store %', p_store_id;
        END IF;
    ELSE
        v_branch_id := p_branch_id;
    END IF;
    
    -- Create cash drawer account for Cash (1100) account
    -- Only if it doesn't already exist for this branch
    INSERT INTO public.cash_drawer_accounts (
        store_id,
        branch_id,
        account_code,
        name,
        currency,
        is_active,
        current_balance,
        created_at,
        updated_at
    )
    SELECT 
        p_store_id,
        v_branch_id,
        '1100', -- Cash account code
        'Main Cash Drawer', -- Default name
        'USD', -- Default currency
        true,
        0,
        now(),
        now()
    WHERE EXISTS (
        -- Ensure the chart_of_accounts entry exists
        SELECT 1 FROM public.chart_of_accounts 
        WHERE store_id = p_store_id AND account_code = '1100'
    )
    AND NOT EXISTS (
        -- Don't create duplicate
        SELECT 1 FROM public.cash_drawer_accounts
        WHERE store_id = p_store_id 
          AND branch_id = v_branch_id 
          AND account_code = '1100'
    );
    
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- =============================================================================
-- 2. MODIFY create_default_chart_of_accounts TO ALSO INITIALIZE CASH DRAWER
-- =============================================================================

-- Update the function to call initialize_cash_drawer_accounts after creating chart
CREATE OR REPLACE FUNCTION public.create_default_chart_of_accounts(store_uuid UUID)
RETURNS VOID AS $$
BEGIN
    -- Insert default chart of accounts
    INSERT INTO public.chart_of_accounts (store_id, account_code, account_name, account_type, requires_entity, is_active)
    VALUES 
        -- ASSETS (1000-1999)
        (store_uuid, '1100', 'Cash', 'asset', true, true),
        (store_uuid, '1200', 'Accounts Receivable', 'asset', true, true),
        (store_uuid, '1300', 'Inventory', 'asset', false, true),
        (store_uuid, '1400', 'Prepaid Expenses', 'asset', false, true),
        (store_uuid, '1500', 'Equipment', 'asset', false, true),
        
        -- LIABILITIES (2000-2999)
        (store_uuid, '2100', 'Accounts Payable', 'liability', true, true),
        (store_uuid, '2200', 'Accrued Expenses', 'liability', false, true),
        (store_uuid, '2300', 'Short-term Loans', 'liability', true, true),
        
        -- EQUITY (3000-3999)
        (store_uuid, '3100', 'Owner''s Equity', 'equity', false, true),
        (store_uuid, '3200', 'Retained Earnings', 'equity', false, true),
        
        -- REVENUE (4000-4999)
        (store_uuid, '4100', 'Sales Revenue', 'revenue', true, true),
        (store_uuid, '4200', 'Service Revenue', 'revenue', true, true),
        (store_uuid, '4300', 'Other Income', 'revenue', false, true),
        
        -- EXPENSES (5000-5999)
        (store_uuid, '5100', 'Cost of Goods Sold', 'expense', false, true),
        (store_uuid, '5200', 'Salaries Expense', 'expense', true, true),
        (store_uuid, '5300', 'Rent Expense', 'expense', false, true),
        (store_uuid, '5400', 'Utilities Expense', 'expense', false, true),
        (store_uuid, '5500', 'Office Supplies', 'expense', false, true),
        (store_uuid, '5600', 'Marketing Expense', 'expense', false, true),
        (store_uuid, '5700', 'Professional Fees', 'expense', true, true),
        (store_uuid, '5800', 'Bank Charges', 'expense', false, true),
        (store_uuid, '5900', 'Miscellaneous Expense', 'expense', false, true)
    ON CONFLICT (store_id, account_code) DO NOTHING;
    
    -- Now initialize cash drawer accounts for the main branch
    PERFORM public.initialize_cash_drawer_accounts(store_uuid);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- =============================================================================
-- 3. ADD COMMENTS
-- =============================================================================

COMMENT ON FUNCTION public.initialize_cash_drawer_accounts(uuid, uuid) 
IS 'Initializes cash drawer accounts for a branch. Creates a cash_drawer_account linked to the Cash (1100) account. Must be called after chart_of_accounts is created.';

COMMENT ON FUNCTION public.create_default_chart_of_accounts(uuid)
IS 'Creates default chart of accounts for a store and initializes cash drawer accounts for the main branch.';

-- =============================================================================
-- MIGRATION COMPLETE
-- =============================================================================

DO $$
BEGIN
    RAISE NOTICE 'Migration completed: Cash drawer accounts initialization';
    RAISE NOTICE 'Functions created:';
    RAISE NOTICE '  - initialize_cash_drawer_accounts(store_id, branch_id)';
    RAISE NOTICE '  - create_default_chart_of_accounts(store_id) [updated]';
    RAISE NOTICE 'Cash drawer accounts now created WITH branch_id after chart is initialized.';
END $$;
