-- =====================================================
-- BILL SCHEMA OPTIMIZATION MIGRATION
-- =====================================================
-- This migration removes redundant and denormalized fields
-- from the bills and bill_line_items tables
-- =====================================================

-- BACKUP REMINDER: Always backup your database before running migrations!

BEGIN;

-- =====================================================
-- PART 1: Remove fields from bills table
-- =====================================================

-- Remove computed fields that should be calculated dynamically
ALTER TABLE public.bills 
  DROP COLUMN IF EXISTS subtotal,
  DROP COLUMN IF EXISTS total_amount,
  DROP COLUMN IF EXISTS amount_due;

-- Remove redundant timestamp field
ALTER TABLE public.bills 
  DROP COLUMN IF EXISTS last_modified_at;

-- =====================================================
-- PART 2: Remove fields from bill_line_items table
-- =====================================================

-- Remove denormalized supplier information
ALTER TABLE public.bill_line_items 
  DROP COLUMN IF EXISTS supplier_id,
  DROP COLUMN IF EXISTS supplier_name;

-- Remove denormalized product information
ALTER TABLE public.bill_line_items 
  DROP COLUMN IF EXISTS product_name;

-- Remove bill-level fields that don't belong in line items
ALTER TABLE public.bill_line_items 
  DROP COLUMN IF EXISTS payment_method,
  DROP COLUMN IF EXISTS customer_id,
  DROP COLUMN IF EXISTS created_by;

-- =====================================================
-- VERIFICATION QUERIES
-- =====================================================

-- Verify bills table structure
SELECT column_name, data_type 
FROM information_schema.columns 
WHERE table_schema = 'public' 
  AND table_name = 'bills'
ORDER BY ordinal_position;

-- Verify bill_line_items table structure
SELECT column_name, data_type 
FROM information_schema.columns 
WHERE table_schema = 'public' 
  AND table_name = 'bill_line_items'
ORDER BY ordinal_position;

-- =====================================================
-- EXPECTED FINAL SCHEMA
-- =====================================================

/*
bills table should have:
- id (uuid)
- store_id (uuid)
- bill_number (text)
- customer_id (uuid, nullable)
- payment_method (text)
- payment_status (text)
- amount_paid (numeric)
- bill_date (date)
- notes (text, nullable)
- status (text)
- created_by (uuid)
- created_at (timestamptz)
- updated_at (timestamptz)
- last_modified_by (uuid, nullable)

bill_line_items table should have:
- id (uuid)
- store_id (uuid)
- bill_id (uuid)
- product_id (uuid)
- inventory_item_id (uuid, nullable)
- quantity (numeric)
- unit_price (numeric)
- line_total (numeric)
- weight (numeric, nullable)
- received_value (numeric)
- notes (text, nullable)
- line_order (integer)
- created_at (timestamptz)
- updated_at (timestamptz)
*/

COMMIT;

-- =====================================================
-- ROLLBACK SCRIPT (if needed)
-- =====================================================
-- IMPORTANT: This rollback script cannot restore data
-- that was in the dropped columns. Only use if you
-- haven't committed the transaction yet.

/*
BEGIN;

-- Restore bills columns
ALTER TABLE public.bills 
  ADD COLUMN IF NOT EXISTS subtotal numeric(13, 2) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS total_amount numeric(13, 2) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS amount_due numeric(13, 2) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS last_modified_at date;

-- Restore bill_line_items columns
ALTER TABLE public.bill_line_items 
  ADD COLUMN IF NOT EXISTS supplier_id uuid,
  ADD COLUMN IF NOT EXISTS supplier_name text,
  ADD COLUMN IF NOT EXISTS product_name text,
  ADD COLUMN IF NOT EXISTS payment_method text DEFAULT 'cash',
  ADD COLUMN IF NOT EXISTS customer_id uuid,
  ADD COLUMN IF NOT EXISTS created_by uuid;

COMMIT;
*/
