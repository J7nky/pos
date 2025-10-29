-- Migration: Increase numeric precision for price and amount fields
-- Updates all numeric(10,2) fields to numeric(13,2) to support values up to 10^13 (10,000,000,000,000)
-- This prevents numeric overflow errors when dealing with large amounts

-- =============================================================================
-- BILLS TABLE
-- =============================================================================
-- Update bills table numeric fields
ALTER TABLE bills 
  ALTER COLUMN subtotal TYPE numeric(13,2),
  ALTER COLUMN total_amount TYPE numeric(13,2),
  ALTER COLUMN amount_paid TYPE numeric(13,2),
  ALTER COLUMN amount_due TYPE numeric(13,2);

-- =============================================================================
-- BILL_LINE_ITEMS TABLE
-- =============================================================================
-- Update bill_line_items table numeric fields
-- Note: received_value may be numeric(15,2) from previous migration, will be updated to numeric(13,2) if needed
ALTER TABLE bill_line_items 
  ALTER COLUMN unit_price TYPE numeric(13,2),
  ALTER COLUMN line_total TYPE numeric(13,2),
  ALTER COLUMN weight TYPE numeric(13,2);

-- Update received_value if it exists with higher precision
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'bill_line_items' 
    AND column_name = 'received_value' 
    AND data_type = 'numeric'
    AND numeric_precision > 13
  ) THEN
    ALTER TABLE bill_line_items ALTER COLUMN received_value TYPE numeric(13,2);
  END IF;
END $$;

-- =============================================================================
-- TRANSACTIONS TABLE (if it exists with amount field)
-- =============================================================================
-- Check and update transactions table if it has numeric amount field
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'transactions' 
    AND column_name = 'amount' 
    AND data_type = 'numeric'
    AND numeric_precision < 13
  ) THEN
    ALTER TABLE transactions ALTER COLUMN amount TYPE numeric(13,2);
  END IF;
END $$;

-- =============================================================================
-- CUSTOMERS TABLE (balance fields)
-- =============================================================================
-- Update customers table balance fields if they exist with limited precision
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'customers' 
    AND column_name = 'lb_balance' 
    AND data_type = 'numeric'
    AND numeric_precision < 13
  ) THEN
    ALTER TABLE customers ALTER COLUMN lb_balance TYPE numeric(13,2);
  END IF;
  
  IF EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'customers' 
    AND column_name = 'usd_balance' 
    AND data_type = 'numeric'
    AND numeric_precision < 13
  ) THEN
    ALTER TABLE customers ALTER COLUMN usd_balance TYPE numeric(13,2);
  END IF;
END $$;

-- =============================================================================
-- SUPPLIERS TABLE (balance fields)
-- =============================================================================
-- Update suppliers table balance fields if they exist with limited precision
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'suppliers' 
    AND column_name = 'lb_balance' 
    AND data_type = 'numeric'
    AND numeric_precision < 13
  ) THEN
    ALTER TABLE suppliers ALTER COLUMN lb_balance TYPE numeric(13,2);
  END IF;
  
  IF EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'suppliers' 
    AND column_name = 'usd_balance' 
    AND data_type = 'numeric'
    AND numeric_precision < 13
  ) THEN
    ALTER TABLE suppliers ALTER COLUMN usd_balance TYPE numeric(13,2);
  END IF;
END $$;

-- =============================================================================
-- CASH_DRAWER_ACCOUNTS TABLE (if it has balance fields)
-- =============================================================================
-- Update cash_drawer_accounts table if it has balance fields
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'cash_drawer_accounts' 
    AND column_name = 'current_balance' 
    AND data_type = 'numeric'
    AND numeric_precision < 13
  ) THEN
    ALTER TABLE cash_drawer_accounts ALTER COLUMN current_balance TYPE numeric(13,2);
  END IF;
  
  IF EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'cash_drawer_accounts' 
    AND column_name = 'opening_balance' 
    AND data_type = 'numeric'
    AND numeric_precision < 13
  ) THEN
    ALTER TABLE cash_drawer_accounts ALTER COLUMN opening_balance TYPE numeric(13,2);
  END IF;
END $$;

-- =============================================================================
-- INVENTORY_ITEMS TABLE (price fields if they exist)
-- =============================================================================
-- Update inventory_items table if it has price fields
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'inventory_items' 
    AND column_name = 'price' 
    AND data_type = 'numeric'
    AND numeric_precision < 13
  ) THEN
    ALTER TABLE inventory_items ALTER COLUMN price TYPE numeric(13,2);
  END IF;
  
  IF EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'inventory_items' 
    AND column_name = 'selling_price' 
    AND data_type = 'numeric'
    AND numeric_precision < 13
  ) THEN
    ALTER TABLE inventory_items ALTER COLUMN selling_price TYPE numeric(13,2);
  END IF;
END $$;

-- =============================================================================
-- UPDATE TRIGGER FUNCTIONS
-- =============================================================================
-- Update the trigger function that uses numeric(10,2) for new_subtotal
CREATE OR REPLACE FUNCTION update_bill_totals()
RETURNS TRIGGER AS $$
DECLARE
  bill_record bills%ROWTYPE;
  new_subtotal numeric(13,2);
BEGIN
  -- Get the bill record
  SELECT * INTO bill_record FROM bills WHERE id = COALESCE(NEW.bill_id, OLD.bill_id);
  
  -- Calculate new subtotal from all line items
  SELECT COALESCE(SUM(line_total), 0) INTO new_subtotal
  FROM bill_line_items 
  WHERE bill_id = bill_record.id;
  
  -- Update bill totals
  UPDATE bills SET
    subtotal = new_subtotal,
    updated_at = now()
  WHERE id = bill_record.id;
  
  RETURN COALESCE(NEW, OLD);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- =============================================================================
-- VALIDATION
-- =============================================================================
-- Verify the changes were applied
DO $$
DECLARE
  v_count integer;
BEGIN
  -- Check bills table
  SELECT COUNT(*) INTO v_count
  FROM information_schema.columns
  WHERE table_name = 'bills'
    AND column_name IN ('subtotal', 'total_amount', 'amount_paid', 'amount_due')
    AND numeric_precision = 13
    AND numeric_scale = 2;
  
  IF v_count < 4 THEN
    RAISE WARNING 'Not all bills columns were updated to numeric(13,2). Found % columns.', v_count;
  ELSE
    RAISE NOTICE 'Successfully updated bills table: % columns to numeric(13,2)', v_count;
  END IF;
  
  -- Check bill_line_items table
  SELECT COUNT(*) INTO v_count
  FROM information_schema.columns
  WHERE table_name = 'bill_line_items'
    AND column_name IN ('unit_price', 'line_total', 'weight')
    AND numeric_precision = 13
    AND numeric_scale = 2;
  
  IF v_count < 3 THEN
    RAISE WARNING 'Not all bill_line_items columns were updated to numeric(13,2). Found % columns.', v_count;
  ELSE
    RAISE NOTICE 'Successfully updated bill_line_items table: % columns to numeric(13,2)', v_count;
  END IF;
END $$;
