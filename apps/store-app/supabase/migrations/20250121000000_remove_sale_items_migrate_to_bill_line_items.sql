-- Migration: Remove sale_items table and enhance bill_line_items for testing environment
-- Since this is a testing environment, we can simply drop sale_items and enhance bill_line_items

-- Step 1: Add missing fields to bill_line_items to support all sale functionality
ALTER TABLE bill_line_items 
ADD COLUMN IF NOT EXISTS payment_method text NOT NULL DEFAULT 'cash' CHECK (payment_method IN ('cash', 'card', 'credit')),
ADD COLUMN IF NOT EXISTS customer_id uuid REFERENCES customers(id) ON DELETE SET NULL,
ADD COLUMN IF NOT EXISTS created_by uuid NOT NULL REFERENCES users(id),
ADD COLUMN IF NOT EXISTS received_value numeric(15,2) NOT NULL DEFAULT 0 CHECK (received_value >= 0);

-- Step 2: Create indexes for the new fields
CREATE INDEX IF NOT EXISTS idx_bill_line_items_payment_method ON bill_line_items(payment_method);
CREATE INDEX IF NOT EXISTS idx_bill_line_items_customer_id ON bill_line_items(customer_id);
CREATE INDEX IF NOT EXISTS idx_bill_line_items_created_by ON bill_line_items(created_by);

-- Step 3: Drop the sale_items table (no data migration needed for testing)
DROP TABLE IF EXISTS sale_items CASCADE;

-- Step 4: Add comments to document the changes
COMMENT ON COLUMN bill_line_items.payment_method IS 'Payment method for this line item (cash/card/credit)';
COMMENT ON COLUMN bill_line_items.customer_id IS 'Customer ID for customer-specific sales';
COMMENT ON COLUMN bill_line_items.created_by IS 'User who created this line item';
COMMENT ON COLUMN bill_line_items.received_value IS 'Actual amount received for this line item';

-- Migration complete - sale_items table removed, functionality moved to bill_line_items
