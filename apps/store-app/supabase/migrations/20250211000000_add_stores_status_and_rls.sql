-- Migration: Add status column to stores table and configure RLS policies
-- This migration adds the missing 'status' column required by the admin app
-- and sets up Row-Level Security policies for admin access

-- Add status column to stores table
ALTER TABLE stores 
ADD COLUMN IF NOT EXISTS status text DEFAULT 'active' 
CHECK (status IN ('active', 'suspended', 'archived'));

-- Create index for status column
CREATE INDEX IF NOT EXISTS idx_stores_status ON stores(status);

-- Enable Row-Level Security on stores table
ALTER TABLE stores ENABLE ROW LEVEL SECURITY;

-- Drop existing policies if they exist (to make migration idempotent)
DROP POLICY IF EXISTS "Super admins can view all stores" ON stores;
DROP POLICY IF EXISTS "Users can view own store" ON stores;
DROP POLICY IF EXISTS "Anonymous users can view own store via token" ON stores;
DROP POLICY IF EXISTS "Super admins can create stores" ON stores;
DROP POLICY IF EXISTS "Super admins can update all stores" ON stores;
DROP POLICY IF EXISTS "Users can update own store" ON stores;
DROP POLICY IF EXISTS "Super admins can delete stores" ON stores;
DROP POLICY IF EXISTS "Authenticated users can view stores" ON stores;
DROP POLICY IF EXISTS "Authenticated users can create stores" ON stores;
DROP POLICY IF EXISTS "Authenticated users can update stores" ON stores;
DROP POLICY IF EXISTS "Authenticated users can delete stores" ON stores;

-- =============================================================================
-- RLS POLICIES FOR STORES TABLE
-- =============================================================================
-- IMPORTANT: These policies assume you have a properly configured users table
-- If you get errors about store_id not existing, you need to:
-- 1. Ensure the users table exists in your database
-- 2. Run migration: 20250206000000_add_super_admin_support.sql
-- 
-- For now, we'll use SIMPLIFIED policies that work without the users table
-- You can replace these with the full policies once your users table is ready
-- =============================================================================

DO $$
BEGIN
  -- Check if users table exists and has store_id column
  IF EXISTS (
    SELECT 1 FROM information_schema.tables 
    WHERE table_schema = 'public' AND table_name = 'users'
  ) AND EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'users' AND column_name = 'store_id'
  ) THEN
    -- Full RLS policies with users table integration
    
    -- Super admins can view all stores
    EXECUTE 'CREATE POLICY "Super admins can view all stores"
    ON stores FOR SELECT
    TO authenticated
    USING (
      EXISTS (
        SELECT 1 FROM users
        WHERE id = auth.uid()
        AND role = ''super_admin''
        AND store_id IS NULL
      )
    )';
    
    -- Regular users can view their own store
    EXECUTE 'CREATE POLICY "Users can view own store"
    ON stores FOR SELECT
    TO authenticated
    USING (
      id IN (
        SELECT store_id FROM users 
        WHERE id = auth.uid() 
        AND store_id IS NOT NULL
      )
    )';
    
    -- Super admins can create stores
    EXECUTE 'CREATE POLICY "Super admins can create stores"
    ON stores FOR INSERT
    TO authenticated
    WITH CHECK (
      EXISTS (
        SELECT 1 FROM users
        WHERE id = auth.uid()
        AND role = ''super_admin''
        AND store_id IS NULL
      )
    )';
    
    -- Super admins can update all stores
    EXECUTE 'CREATE POLICY "Super admins can update all stores"
    ON stores FOR UPDATE
    TO authenticated
    USING (
      EXISTS (
        SELECT 1 FROM users
        WHERE id = auth.uid()
        AND role = ''super_admin''
        AND store_id IS NULL
      )
    )
    WITH CHECK (
      EXISTS (
        SELECT 1 FROM users
        WHERE id = auth.uid()
        AND role = ''super_admin''
        AND store_id IS NULL
      )
    )';
    
    -- Regular users can update their own store
    EXECUTE 'CREATE POLICY "Users can update own store"
    ON stores FOR UPDATE
    TO authenticated
    USING (
      id IN (
        SELECT store_id FROM users 
        WHERE id = auth.uid() 
        AND store_id IS NOT NULL
      )
    )
    WITH CHECK (
      id IN (
        SELECT store_id FROM users 
        WHERE id = auth.uid() 
        AND store_id IS NOT NULL
      )
    )';
    
    -- Super admins can delete stores
    EXECUTE 'CREATE POLICY "Super admins can delete stores"
    ON stores FOR DELETE
    TO authenticated
    USING (
      EXISTS (
        SELECT 1 FROM users
        WHERE id = auth.uid()
        AND role = ''super_admin''
        AND store_id IS NULL
      )
    )';
    
    RAISE NOTICE 'Created full RLS policies with users table integration';
    
  ELSE
    -- SIMPLIFIED policies without users table
    -- All authenticated users can do everything (TEMPORARY - replace after users table is ready)
    
    EXECUTE 'CREATE POLICY "Authenticated users can view stores"
    ON stores FOR SELECT
    TO authenticated
    USING (true)';
    
    EXECUTE 'CREATE POLICY "Authenticated users can create stores"
    ON stores FOR INSERT
    TO authenticated
    WITH CHECK (true)';
    
    EXECUTE 'CREATE POLICY "Authenticated users can update stores"
    ON stores FOR UPDATE
    TO authenticated
    USING (true)
    WITH CHECK (true)';
    
    EXECUTE 'CREATE POLICY "Authenticated users can delete stores"
    ON stores FOR DELETE
    TO authenticated
    USING (true)';
    
    RAISE WARNING 'Users table or store_id column not found. Created SIMPLIFIED RLS policies.';
    RAISE WARNING 'All authenticated users have full access. Update policies after setting up users table!';
    
  END IF;
END $$;

-- RLS Policy: Anonymous users with valid tokens can view their store
-- This is for the store-app to access its own store data via QR codes
-- Note: Joins through customers table since public_access_tokens has customer_id, not store_id
CREATE POLICY "Anonymous users can view own store via token"
ON stores FOR SELECT
TO anon
USING (
  id IN (
    SELECT c.store_id 
    FROM public_access_tokens pat
    JOIN customers c ON c.id = pat.customer_id
    WHERE pat.token = current_setting('request.jwt.claims', true)::json->>'token'
    AND pat.revoked = false
    AND pat.expires_at > now()
  )
);

-- Update existing stores to have 'active' status if NULL
UPDATE stores SET status = 'active' WHERE status IS NULL;

-- Add comment to the status column
COMMENT ON COLUMN stores.status IS 'Store status: active, suspended, or archived. Used by admin app for store lifecycle management.';
