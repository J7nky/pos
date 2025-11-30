-- Migration: Fix default branch trigger to not create cash_drawer_accounts
-- Date: November 29, 2025
-- Purpose: Update trigger to only create branch, not cash_drawer_accounts
-- Reason: cash_drawer_accounts must be created AFTER chart_of_accounts exists

-- =============================================================================
-- UPDATE FUNCTION
-- =============================================================================

CREATE OR REPLACE FUNCTION public.create_default_branch_for_store()
RETURNS TRIGGER AS $$
DECLARE
    new_branch_id uuid;
BEGIN
    -- Create a default "Main Branch" for the new store
    INSERT INTO public.branches (
        id,
        store_id,
        name,
        address,
        phone,
        is_active,
        created_at,
        updated_at
    ) VALUES (
        gen_random_uuid(),
        NEW.id,
        'Main Branch',
        NEW.address,
        NEW.phone,
        true,
        now(),
        now()
    )
    RETURNING id INTO new_branch_id;
    
    -- Note: cash_drawer_accounts will be created after chart_of_accounts
    -- is initialized via create_default_chart_of_accounts() which calls
    -- initialize_cash_drawer_accounts()
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- =============================================================================
-- MIGRATION COMPLETE
-- =============================================================================

DO $$
BEGIN
    RAISE NOTICE 'Fixed: create_default_branch_for_store() now only creates branch';
    RAISE NOTICE 'Cash drawer accounts are created by create_default_chart_of_accounts()';
END $$;
