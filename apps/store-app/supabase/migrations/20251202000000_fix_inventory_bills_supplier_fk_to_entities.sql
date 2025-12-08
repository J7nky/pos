/*
  # Fix inventory_bills.supplier_id foreign key constraint
  
  Problem:
  - inventory_bills.supplier_id has a foreign key constraint pointing to suppliers table
  - suppliers table has been deleted (migrated to entities table)
  - This causes sync failures with error: "Key is not present in table 'suppliers'"
  
  Solution:
  1. Drop the old foreign key constraint pointing to suppliers table
  2. Add new foreign key constraint pointing to entities table
  3. Add check constraint to ensure entity_type = 'supplier'
*/

-- Step 1: Drop the old foreign key constraint if it exists
-- Since suppliers table doesn't exist, we find constraints on supplier_id column directly
DO $$
DECLARE
    constraint_name text;
    constraint_record RECORD;
BEGIN
    -- Find all foreign key constraints on inventory_bills.supplier_id column
    -- We check by column name since we can't reference the suppliers table
    FOR constraint_record IN
        SELECT con.conname
        FROM pg_constraint con
        JOIN pg_class rel ON rel.oid = con.conrelid
        JOIN pg_namespace nsp ON nsp.oid = rel.relnamespace
        JOIN pg_attribute att ON att.attrelid = con.conrelid AND att.attnum = ANY(con.conkey)
        WHERE rel.relname = 'inventory_bills'
          AND nsp.nspname = 'public'
          AND att.attname = 'supplier_id'
          AND con.contype = 'f'
    LOOP
        EXECUTE format('ALTER TABLE inventory_bills DROP CONSTRAINT IF EXISTS %I', constraint_record.conname);
        RAISE NOTICE 'Dropped foreign key constraint: %', constraint_record.conname;
    END LOOP;
    
    -- Also try common constraint names as fallback (in case the above doesn't catch it)
    ALTER TABLE inventory_bills DROP CONSTRAINT IF EXISTS inventory_batches_supplier_id_fkey;
    ALTER TABLE inventory_bills DROP CONSTRAINT IF EXISTS inventory_bills_supplier_id_fkey;
    ALTER TABLE inventory_bills DROP CONSTRAINT IF EXISTS inventory_bills_supplier_id_suppliers_id_fk;
    ALTER TABLE inventory_bills DROP CONSTRAINT IF EXISTS inventory_bills_supplier_id_fkey1;
    
    RAISE NOTICE 'Completed constraint cleanup';
END $$;

-- Step 2: Add new foreign key constraint pointing to entities table
ALTER TABLE inventory_bills
ADD CONSTRAINT inventory_bills_supplier_id_fkey
FOREIGN KEY (supplier_id)
REFERENCES entities(id)
ON DELETE RESTRICT
ON UPDATE CASCADE;

-- Step 3: Create index if it doesn't exist (for performance)
CREATE INDEX IF NOT EXISTS idx_inventory_bills_supplier_id ON inventory_bills(supplier_id)
WHERE supplier_id IS NOT NULL;

-- Step 4: Create trigger function to validate entity_type = 'supplier'
-- This ensures data integrity at the database level
CREATE OR REPLACE FUNCTION validate_inventory_bills_supplier()
RETURNS TRIGGER AS $$
BEGIN
    -- Validate that supplier_id references an entity with entity_type = 'supplier'
    IF NEW.supplier_id IS NOT NULL THEN
        IF NOT EXISTS (
            SELECT 1
            FROM entities
            WHERE id = NEW.supplier_id
              AND entity_type = 'supplier'
        ) THEN
            RAISE EXCEPTION 'supplier_id must reference an entity with entity_type = ''supplier''. Found: %',
                (SELECT entity_type FROM entities WHERE id = NEW.supplier_id);
        END IF;
    END IF;
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Step 5: Create trigger to enforce validation
DROP TRIGGER IF EXISTS trigger_validate_inventory_bills_supplier ON inventory_bills;
CREATE TRIGGER trigger_validate_inventory_bills_supplier
    BEFORE INSERT OR UPDATE ON inventory_bills
    FOR EACH ROW
    EXECUTE FUNCTION validate_inventory_bills_supplier();

-- Add comment for documentation
COMMENT ON CONSTRAINT inventory_bills_supplier_id_fkey ON inventory_bills IS 
'Foreign key to entities table. Must reference an entity with entity_type = ''supplier''.';

COMMENT ON FUNCTION validate_inventory_bills_supplier() IS 
'Validates that supplier_id references an entity with entity_type = ''supplier''.';

