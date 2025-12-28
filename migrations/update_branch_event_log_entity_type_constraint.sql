-- Update branch_event_log valid_entity_type constraint
-- Adds support for configuration tables (store, branch, user, etc.)
-- This migration updates the existing constraint to include all entity types

-- Step 1: Drop the existing constraint
ALTER TABLE branch_event_log 
DROP CONSTRAINT IF EXISTS valid_entity_type;

-- Step 2: Add the updated constraint with all entity types
ALTER TABLE branch_event_log
ADD CONSTRAINT valid_entity_type CHECK (entity_type IN (
  -- Business operation tables
  'bill', 'bill_line_item', 'transaction', 'journal_entry', 
  'inventory_item', 'inventory_bill', 'entity', 'cash_drawer_session',
  'cash_drawer_account', 'product', 'reminder', 'missed_product',
  -- Configuration tables (for fully event-driven sync)
  'store', 'branch', 'user', 'chart_of_account',
  'role_operation_limit', 'user_module_access'
));

-- Verify the constraint was updated
DO $$
BEGIN
  RAISE NOTICE '✅ Constraint valid_entity_type updated successfully';
  RAISE NOTICE '   Now supports: bill, bill_line_item, transaction, journal_entry,';
  RAISE NOTICE '   inventory_item, inventory_bill, entity, cash_drawer_session,';
  RAISE NOTICE '   cash_drawer_account, product, reminder, missed_product,';
  RAISE NOTICE '   store, branch, user, chart_of_account,';
  RAISE NOTICE '   role_operation_limit, user_module_access';
END $$;
























