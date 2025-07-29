-- Add store_id column to sale_items table for easier querying
-- This will fix the sync issue where sale_items was being queried with store_id filter

ALTER TABLE sale_items 
ADD COLUMN IF NOT EXISTS store_id uuid REFERENCES stores(id) ON DELETE CASCADE;

-- Update existing sale_items to have the correct store_id from their parent sales
UPDATE sale_items 
SET store_id = sales.store_id 
FROM sales 
WHERE sale_items.id = sales.id;

-- Make store_id NOT NULL after populating existing records
ALTER TABLE sale_items 
ALTER COLUMN store_id SET NOT NULL;

-- Add index for better performance
CREATE INDEX IF NOT EXISTS idx_sale_items_store_id ON sale_items(store_id);

-- Update the RLS policy to use store_id directly
DROP POLICY IF EXISTS "Users can access own store sale items" ON sale_items;
CREATE POLICY "Users can access own store sale items" ON sale_items
  FOR ALL TO authenticated
  USING (store_id IN (SELECT store_id FROM users WHERE id = auth.uid()));

COMMENT ON COLUMN sale_items.store_id IS 'Store ID for easier querying and RLS policies'; 