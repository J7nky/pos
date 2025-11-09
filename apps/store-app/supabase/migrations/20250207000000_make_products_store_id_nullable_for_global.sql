-- Migration: Make products.store_id nullable for global products
-- Global products have is_global = true and store_id = NULL
-- Store-specific products have is_global = false and store_id IS NOT NULL

-- Step 1: Make store_id nullable (if not already)
DO $$
BEGIN
  -- Check if store_id is currently NOT NULL
  IF EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'products' 
    AND column_name = 'store_id'
    AND is_nullable = 'NO'
  ) THEN
    -- Make store_id nullable for global products
    ALTER TABLE products 
    ALTER COLUMN store_id DROP NOT NULL;
    
    COMMENT ON COLUMN products.store_id IS 'Store ID for store-specific products. NULL for global products (is_global = true).';
  ELSE
    RAISE NOTICE 'Column products.store_id is already nullable';
  END IF;
END $$;

-- Step 2: Add check constraint to ensure data integrity
-- Global products must have store_id = NULL
-- Store-specific products must have store_id IS NOT NULL
DO $$
BEGIN
  -- Drop existing constraint if it exists
  IF EXISTS (
    SELECT 1 FROM pg_constraint 
    WHERE conname = 'products_global_store_id_check'
  ) THEN
    ALTER TABLE products DROP CONSTRAINT products_global_store_id_check;
  END IF;
  
  -- Add constraint: if is_global is true, store_id must be NULL
  -- If is_global is false, store_id must be NOT NULL
  ALTER TABLE products 
  ADD CONSTRAINT products_global_store_id_check 
  CHECK (
    (is_global = true AND store_id IS NULL) OR
    (is_global = false AND store_id IS NOT NULL) OR
    (is_global IS NULL AND store_id IS NOT NULL) -- Backwards compatibility: if is_global is NULL, treat as store-specific
  );
  
  COMMENT ON CONSTRAINT products_global_store_id_check ON products IS 
  'Ensures global products have NULL store_id and store-specific products have a store_id';
END $$;

-- Step 3: Update existing global products (if any) to have NULL store_id
-- This handles any existing data that might have been created incorrectly
UPDATE products 
SET store_id = NULL 
WHERE is_global = true AND store_id IS NOT NULL;

-- Step 4: Update indexes to handle NULL values
-- The existing index on store_id should work fine with NULLs
-- But we can add a partial index for better performance on global products
CREATE INDEX IF NOT EXISTS idx_products_global 
ON products(is_global) 
WHERE is_global = true;

CREATE INDEX IF NOT EXISTS idx_products_store_specific 
ON products(store_id) 
WHERE is_global = false AND store_id IS NOT NULL;

