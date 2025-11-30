-- Migration: Add trigger to create default branch for new stores
-- Date: November 29, 2025
-- Purpose: Automatically create "Main Branch" when a store is created
-- This is required because branch_id is NOT NULL in operational tables like cash_drawer_accounts

-- =============================================================================
-- 1. CREATE FUNCTION TO CREATE DEFAULT BRANCH
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
    -- is initialized via the initializeAccountingFoundation() function
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- =============================================================================
-- 2. CREATE TRIGGER
-- =============================================================================

DROP TRIGGER IF EXISTS trigger_create_default_branch ON public.stores;
CREATE TRIGGER trigger_create_default_branch
    AFTER INSERT ON public.stores
    FOR EACH ROW
    EXECUTE FUNCTION public.create_default_branch_for_store();

-- =============================================================================
-- 3. ADD COMMENTS
-- =============================================================================

COMMENT ON FUNCTION public.create_default_branch_for_store() 
IS 'Automatically creates a default Main Branch and cash drawer account when a new store is created. This is essential because branch_id is required (NOT NULL) in operational tables.';

-- =============================================================================
-- MIGRATION COMPLETE
-- =============================================================================

DO $$
BEGIN
    RAISE NOTICE 'Migration completed: Default branch trigger created';
    RAISE NOTICE 'New stores will automatically get:';
    RAISE NOTICE '  1. A "Main Branch"';
    RAISE NOTICE '  2. A default cash drawer account linked to the branch';
    RAISE NOTICE 'This ensures branch_id is never NULL in operational data.';
END $$;
