-- Migration: Add Super Admin Support to Users Table
-- Minimum implementation: Use existing users table for super admins
-- Super admins have: role = 'super_admin' AND store_id = NULL
-- Regular admins have: role = 'admin' AND store_id IS NOT NULL
--
-- This is the minimum implementation approach - no new table needed

-- =============================================================================
-- USERS TABLE - Add Super Admin Support
-- =============================================================================

-- Step 1: Make store_id nullable (if not already)
DO $$
BEGIN
  -- Check if store_id is currently NOT NULL
  IF EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'users' 
    AND column_name = 'store_id'
    AND is_nullable = 'NO'
  ) THEN
    -- Make store_id nullable for super admins
    ALTER TABLE users 
    ALTER COLUMN store_id DROP NOT NULL;
    
    COMMENT ON COLUMN users.store_id IS 'Store ID for regular admins/managers/cashiers. NULL for super admins.';
  ELSE
    RAISE NOTICE 'Column store_id is already nullable';
  END IF;
END $$;

-- Step 2: Update role enum to include 'super_admin' (if using enum type)
-- Note: If role is stored as VARCHAR/TEXT, this step is not needed
-- Check if role column uses an enum type
DO $$
BEGIN
  -- If role is VARCHAR/TEXT (most common), no enum update needed
  -- The application will handle 'super_admin' as a valid role value
  RAISE NOTICE 'Role column is VARCHAR/TEXT - no enum update needed. Application will handle super_admin role.';
END $$;

-- Step 3: Add check constraint to ensure super_admin has NULL store_id
-- This ensures data integrity: super admins cannot be assigned to a store
DO $$
BEGIN
  -- Drop existing constraint if it exists
  IF EXISTS (
    SELECT 1 FROM pg_constraint 
    WHERE conname = 'users_super_admin_store_id_check'
  ) THEN
    ALTER TABLE users DROP CONSTRAINT users_super_admin_store_id_check;
  END IF;
  
  -- Add constraint: if role is 'super_admin', store_id must be NULL
  ALTER TABLE users 
  ADD CONSTRAINT users_super_admin_store_id_check 
  CHECK (
    (role = 'super_admin' AND store_id IS NULL) OR
    (role != 'super_admin')
  );
  
  COMMENT ON CONSTRAINT users_super_admin_store_id_check ON users IS 
  'Ensures super_admin users have NULL store_id (platform-level access)';
END $$;

-- Step 4: Update RLS policies to allow super_admin access to all stores
-- Note: This assumes you have RLS enabled. Adjust based on your existing policies.

-- Example: Allow super_admin to view all stores
-- (Uncomment and adjust based on your existing RLS setup)
/*
CREATE POLICY "Super admin can view all stores"
ON stores FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM users
    WHERE id = auth.uid()
    AND role = 'super_admin'
    AND store_id IS NULL
  )
);
*/

-- =============================================================================
-- NOTES
-- =============================================================================
-- 
-- To create a super admin user:
-- 1. Create user in Supabase Auth
-- 2. Insert into users table:
--    INSERT INTO users (id, email, name, role, store_id, created_at, updated_at)
--    VALUES (
--      'USER_ID_FROM_AUTH',
--      'superadmin@example.com',
--      'Super Admin',
--      'super_admin',
--      NULL,  -- store_id must be NULL for super_admin
--      NOW(),
--      NOW()
--    );
--
-- To create a regular admin user (store-specific):
--    INSERT INTO users (id, email, name, role, store_id, created_at, updated_at)
--    VALUES (
--      'USER_ID_FROM_AUTH',
--      'admin@store.com',
--      'Store Admin',
--      'admin',
--      'STORE_ID',  -- store_id required for regular admin
--      NOW(),
--      NOW()
--    );

