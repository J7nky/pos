-- Add received_quantity field to inventory_items table
-- This field tracks the original quantity received, separate from the current quantity

ALTER TABLE inventory_items 
ADD COLUMN IF NOT EXISTS received_quantity integer NOT NULL DEFAULT 0;

-- Update existing records to set received_quantity equal to quantity
-- This ensures existing data has the correct received_quantity value
UPDATE inventory_items 
SET received_quantity = quantity 
WHERE received_quantity = 0 OR received_quantity IS NULL;

-- Add a check constraint to ensure received_quantity is always positive
ALTER TABLE inventory_items 
ADD CONSTRAINT check_received_quantity_positive 
CHECK (received_quantity > 0);

-- Add an index on received_quantity for better query performance
CREATE INDEX IF NOT EXISTS idx_inventory_items_received_quantity 
ON inventory_items(received_quantity); 