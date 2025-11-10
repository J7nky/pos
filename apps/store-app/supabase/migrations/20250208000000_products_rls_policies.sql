-- Migration: Comprehensive RLS Policies for Products Table
-- Allows authenticated users to CRUD their store products + read global products
-- Allows super admins to CRUD global products

-- =============================================================================
-- SELECT POLICIES (READ)
-- =============================================================================

-- Policy 1: Authenticated users can read their store products + global products
CREATE POLICY "Authenticated users can read store and global products"
ON "public"."products"
FOR SELECT
TO authenticated
USING (
  -- Allow reading global products
  is_global = true
  OR
  -- Allow reading products from user's store
  store_id IN (
    SELECT users.store_id
    FROM users
    WHERE users.id = auth.uid()
    AND users.store_id IS NOT NULL
  )
);

-- Policy 2: Super admins can read all products (including all store products)
CREATE POLICY "Super admins can read all products"
ON "public"."products"
FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM users
    WHERE users.id = auth.uid()
    AND users.role = 'super_admin'
    AND users.store_id IS NULL
  )
);

-- =============================================================================
-- INSERT POLICIES (CREATE)
-- =============================================================================

-- Policy 3: Authenticated users can insert products into their store (not global)
CREATE POLICY "Authenticated users can insert store products"
ON "public"."products"
FOR INSERT
TO authenticated
WITH CHECK (
  -- Must be store-specific (not global)
  is_global = false
  AND
  -- Must belong to user's store
  store_id IN (
    SELECT users.store_id
    FROM users
    WHERE users.id = auth.uid()
    AND users.store_id IS NOT NULL
  )
);

-- Policy 4: Super admins can insert global products
CREATE POLICY "Super admins can insert global products"
ON "public"."products"
FOR INSERT
TO authenticated
WITH CHECK (
  EXISTS (
    SELECT 1 FROM users
    WHERE users.id = auth.uid()
    AND users.role = 'super_admin'
    AND users.store_id IS NULL
  )
  AND
  -- Super admins can create global products
  is_global = true
);

-- =============================================================================
-- UPDATE POLICIES
-- =============================================================================

-- Policy 5: Authenticated users can update their store products (not global)
CREATE POLICY "Authenticated users can update store products"
ON "public"."products"
FOR UPDATE
TO authenticated
USING (
  -- Can only update store-specific products
  is_global = false
  AND
  -- Must belong to user's store
  store_id IN (
    SELECT users.store_id
    FROM users
    WHERE users.id = auth.uid()
    AND users.store_id IS NOT NULL
  )
)
WITH CHECK (
  -- Ensure they can't change it to global or change store_id
  is_global = false
  AND
  store_id IN (
    SELECT users.store_id
    FROM users
    WHERE users.id = auth.uid()
    AND users.store_id IS NOT NULL
  )
);

-- Policy 6: Super admins can update global products
CREATE POLICY "Super admins can update global products"
ON "public"."products"
FOR UPDATE
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM users
    WHERE users.id = auth.uid()
    AND users.role = 'super_admin'
    AND users.store_id IS NULL
  )
  AND
  is_global = true
)
WITH CHECK (
  EXISTS (
    SELECT 1 FROM users
    WHERE users.id = auth.uid()
    AND users.role = 'super_admin'
    AND users.store_id IS NULL
  )
  AND
  -- Ensure it remains global
  is_global = true
);

-- =============================================================================
-- DELETE POLICIES
-- =============================================================================

-- Policy 7: Authenticated users can delete their store products (not global)
CREATE POLICY "Authenticated users can delete store products"
ON "public"."products"
FOR DELETE
TO authenticated
USING (
  -- Can only delete store-specific products
  is_global = false
  AND
  -- Must belong to user's store
  store_id IN (
    SELECT users.store_id
    FROM users
    WHERE users.id = auth.uid()
    AND users.store_id IS NOT NULL
  )
);

-- Policy 8: Super admins can delete global products
CREATE POLICY "Super admins can delete global products"
ON "public"."products"
FOR DELETE
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM users
    WHERE users.id = auth.uid()
    AND users.role = 'super_admin'
    AND users.store_id IS NULL
  )
  AND
  is_global = true
);

-- =============================================================================
-- COMMENTS
-- =============================================================================

COMMENT ON POLICY "Authenticated users can read store and global products" ON "public"."products" IS 
'Allows authenticated users to read products from their store and all global products';

COMMENT ON POLICY "Super admins can read all products" ON "public"."products" IS 
'Allows super admins to read all products (global and from all stores)';

COMMENT ON POLICY "Authenticated users can insert store products" ON "public"."products" IS 
'Allows authenticated users to create products in their own store (not global)';

COMMENT ON POLICY "Super admins can insert global products" ON "public"."products" IS 
'Allows super admins to create global products';

COMMENT ON POLICY "Authenticated users can update store products" ON "public"."products" IS 
'Allows authenticated users to update products in their own store (not global)';

COMMENT ON POLICY "Super admins can update global products" ON "public"."products" IS 
'Allows super admins to update global products';

COMMENT ON POLICY "Authenticated users can delete store products" ON "public"."products" IS 
'Allows authenticated users to delete products from their own store (not global)';

COMMENT ON POLICY "Super admins can delete global products" ON "public"."products" IS 
'Allows super admins to delete global products';

