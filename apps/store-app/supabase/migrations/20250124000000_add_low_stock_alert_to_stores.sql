-- Add low_stock_alert column to stores table
-- This migration adds a boolean field to control low stock alert functionality

-- Add the low_stock_alert column with a default value of true
ALTER TABLE stores 
ADD COLUMN low_stock_alert BOOLEAN NOT NULL DEFAULT true;

-- Add a comment to document the column
COMMENT ON COLUMN stores.low_stock_alert IS 'Controls whether low stock alerts are enabled for this store';

-- Update existing stores to have low_stock_alert enabled by default
-- (This is already handled by the DEFAULT true above, but being explicit)
UPDATE stores 
SET low_stock_alert = true 
WHERE low_stock_alert IS NULL;
