-- Add advance payment tracking fields to suppliers table
-- This migration adds fields to track advance payments made to suppliers

ALTER TABLE suppliers
ADD COLUMN IF NOT EXISTS advance_lb_balance DECIMAL(15, 2) DEFAULT 0,
ADD COLUMN IF NOT EXISTS advance_usd_balance DECIMAL(15, 2) DEFAULT 0;

-- Add comments to document the fields
COMMENT ON COLUMN suppliers.advance_lb_balance IS 'Advance payments made to supplier in LBP currency';
COMMENT ON COLUMN suppliers.advance_usd_balance IS 'Advance payments made to supplier in USD currency';

-- Update existing suppliers to have 0 advance balance (if NULL)
UPDATE suppliers
SET 
  advance_lb_balance = COALESCE(advance_lb_balance, 0),
  advance_usd_balance = COALESCE(advance_usd_balance, 0)
WHERE advance_lb_balance IS NULL OR advance_usd_balance IS NULL;

-- Add check constraint to ensure advance balances are non-negative
ALTER TABLE suppliers
ADD CONSTRAINT suppliers_advance_lb_balance_non_negative CHECK (advance_lb_balance >= 0),
ADD CONSTRAINT suppliers_advance_usd_balance_non_negative CHECK (advance_usd_balance >= 0);


