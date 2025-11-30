-- Migration: Create system entities function
-- Date: November 29, 2025
-- Purpose: Ensure create_system_entities_for_store function exists

-- =============================================================================
-- CREATE FUNCTION
-- =============================================================================

CREATE OR REPLACE FUNCTION public.create_system_entities_for_store(store_uuid UUID)
RETURNS VOID AS $$
BEGIN
    -- Insert system entities if they don't exist
    -- Note: entities table may not exist yet - this is OK, function will be available when needed
    -- System entities are identified by entity_code (unique per store), not by hardcoded IDs
    INSERT INTO public.entities (store_id, entity_type, entity_code, name, is_system_entity, is_active, customer_data, supplier_data)
    VALUES 
        -- Customer entities
        (store_uuid, 'cash', 'CASH-CUST', 'Cash Customer', true, true, '{"lb_max_balance": 0, "credit_limit": 0, "payment_terms": "immediate"}', null),
        
        -- Supplier entities
        (store_uuid, 'cash', 'CASH-SUPP', 'Cash Supplier', true, true, null, '{"type": "direct", "payment_terms": "immediate"}'),
        
        -- Employee entities
        (store_uuid, 'employee', 'SALARIES', 'Employee Salaries', true, true, null, null),
        
        -- Internal entities
        (store_uuid, 'internal', 'INTERNAL', 'Internal Operations', true, true, null, null),
        (store_uuid, 'internal', 'OWNER', 'Owner Equity', true, true, null, null),
        
        -- Financial entities
        (store_uuid, 'cash', 'BANK', 'Bank Account', true, true, null, null),
        (store_uuid, 'internal', 'TAX', 'Tax Authority', true, true, null, null),
        (store_uuid, 'internal', 'UTILITIES', 'Utilities', true, true, null, null),
        (store_uuid, 'internal', 'RENT', 'Rent Payments', true, true, null, null)
    ON CONFLICT (store_id, entity_code) DO NOTHING;
EXCEPTION
    WHEN undefined_table THEN
        -- entities table doesn't exist yet - that's OK, just skip
        RAISE NOTICE 'entities table does not exist yet - skipping system entities creation';
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- =============================================================================
-- COMMENTS
-- =============================================================================

COMMENT ON FUNCTION public.create_system_entities_for_store(uuid)
IS 'Creates default system entities for a store. Used in accounting foundation setup. Safe to call if entities table does not exist yet.';

-- =============================================================================
-- MIGRATION COMPLETE
-- =============================================================================

DO $$
BEGIN
    RAISE NOTICE 'Function created: create_system_entities_for_store(store_id)';
    RAISE NOTICE 'This function is called during store initialization';
END $$;
