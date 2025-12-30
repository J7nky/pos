-- Migration: Add usd_balance and lbp_balance columns to cash_drawer_accounts
-- Date: January 30, 2025
-- Purpose: Add performance cache fields for dual currency balance tracking
--          Keep current_balance for backward compatibility

-- =============================================================================
-- 1. ADD BALANCE COLUMNS (if they don't exist)
-- =============================================================================

-- Add usd_balance column if it doesn't exist
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_schema = 'public' 
        AND table_name = 'cash_drawer_accounts' 
        AND column_name = 'usd_balance'
    ) THEN
        ALTER TABLE public.cash_drawer_accounts 
        ADD COLUMN usd_balance NUMERIC(15, 2) DEFAULT 0;
        
        RAISE NOTICE 'Added column: usd_balance';
    ELSE
        RAISE NOTICE 'Column usd_balance already exists, skipping';
    END IF;
END $$;

-- Add lbp_balance column if it doesn't exist
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_schema = 'public' 
        AND table_name = 'cash_drawer_accounts' 
        AND column_name = 'lbp_balance'
    ) THEN
        ALTER TABLE public.cash_drawer_accounts 
        ADD COLUMN lbp_balance NUMERIC(15, 2) DEFAULT 0;
        
        RAISE NOTICE 'Added column: lbp_balance';
    ELSE
        RAISE NOTICE 'Column lbp_balance already exists, skipping';
    END IF;
END $$;

-- Ensure current_balance exists (for backward compatibility)
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_schema = 'public' 
        AND table_name = 'cash_drawer_accounts' 
        AND column_name = 'current_balance'
    ) THEN
        ALTER TABLE public.cash_drawer_accounts 
        ADD COLUMN current_balance NUMERIC(15, 2) DEFAULT 0;
        
        RAISE NOTICE 'Added column: current_balance (for backward compatibility)';
    ELSE
        RAISE NOTICE 'Column current_balance already exists, skipping';
    END IF;
END $$;

-- =============================================================================
-- 2. INITIALIZE EXISTING RECORDS
-- =============================================================================

-- Set default values for existing records that might have NULL
UPDATE public.cash_drawer_accounts
SET 
    usd_balance = COALESCE(usd_balance, 0),
    lbp_balance = COALESCE(lbp_balance, 0),
    current_balance = COALESCE(current_balance, 0)
WHERE usd_balance IS NULL OR lbp_balance IS NULL OR current_balance IS NULL;

-- =============================================================================
-- 3. UPDATE initialize_cash_drawer_accounts FUNCTION
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
        usd_balance,
        lbp_balance,
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
        0, -- current_balance (backward compatibility)
        0, -- usd_balance
        0, -- lbp_balance
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
-- 4. ADD COMMENTS
-- =============================================================================

COMMENT ON COLUMN public.cash_drawer_accounts.usd_balance 
IS 'Performance cache: USD balance calculated from journal entries, updated atomically';

COMMENT ON COLUMN public.cash_drawer_accounts.lbp_balance 
IS 'Performance cache: LBP balance calculated from journal entries, updated atomically';

COMMENT ON COLUMN public.cash_drawer_accounts.current_balance 
IS 'Deprecated: Use usd_balance and lbp_balance instead. Kept for backward compatibility.';

-- =============================================================================
-- MIGRATION COMPLETE
-- =============================================================================

DO $$
BEGIN
    RAISE NOTICE 'Migration completed: Added usd_balance and lbp_balance columns to cash_drawer_accounts';
    RAISE NOTICE 'Updated initialize_cash_drawer_accounts function to include new columns';
    RAISE NOTICE 'All existing records initialized with default values';
END $$;

