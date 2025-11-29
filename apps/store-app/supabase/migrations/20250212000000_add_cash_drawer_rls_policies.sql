-- Migration: Add RLS policies for cash_drawer_accounts and cash_drawer_sessions
-- This fixes the "new row violates row-level security policy" error when creating stores

-- =============================================================================
-- CASH_DRAWER_ACCOUNTS RLS POLICIES
-- =============================================================================

-- Enable RLS on cash_drawer_accounts (if not already enabled)
ALTER TABLE cash_drawer_accounts ENABLE ROW LEVEL SECURITY;

-- Drop existing policies if they exist (to make migration idempotent)
DROP POLICY IF EXISTS "Super admins can view all cash drawer accounts" ON cash_drawer_accounts;
DROP POLICY IF EXISTS "Users can view cash drawer accounts for their store" ON cash_drawer_accounts;
DROP POLICY IF EXISTS "Super admins can insert cash drawer accounts" ON cash_drawer_accounts;
DROP POLICY IF EXISTS "Users can insert cash drawer accounts for their store" ON cash_drawer_accounts;
DROP POLICY IF EXISTS "Super admins can update all cash drawer accounts" ON cash_drawer_accounts;
DROP POLICY IF EXISTS "Users can update cash drawer accounts for their store" ON cash_drawer_accounts;
DROP POLICY IF EXISTS "Super admins can delete cash drawer accounts" ON cash_drawer_accounts;

-- SELECT policies
CREATE POLICY "Super admins can view all cash drawer accounts"
ON cash_drawer_accounts FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM users
    WHERE id = auth.uid()
    AND role = 'super_admin'
    AND store_id IS NULL
  )
);

CREATE POLICY "Users can view cash drawer accounts for their store"
ON cash_drawer_accounts FOR SELECT
TO authenticated
USING (
  store_id IN (
    SELECT store_id FROM users 
    WHERE id = auth.uid() 
    AND store_id IS NOT NULL
  )
);

-- INSERT policies
CREATE POLICY "Super admins can insert cash drawer accounts"
ON cash_drawer_accounts FOR INSERT
TO authenticated
WITH CHECK (
  EXISTS (
    SELECT 1 FROM users
    WHERE id = auth.uid()
    AND role = 'super_admin'
    AND store_id IS NULL
  )
);

CREATE POLICY "Users can insert cash drawer accounts for their store"
ON cash_drawer_accounts FOR INSERT
TO authenticated
WITH CHECK (
  store_id IN (
    SELECT store_id FROM users 
    WHERE id = auth.uid() 
    AND store_id IS NOT NULL
  )
);

-- UPDATE policies
CREATE POLICY "Super admins can update all cash drawer accounts"
ON cash_drawer_accounts FOR UPDATE
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM users
    WHERE id = auth.uid()
    AND role = 'super_admin'
    AND store_id IS NULL
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1 FROM users
    WHERE id = auth.uid()
    AND role = 'super_admin'
    AND store_id IS NULL
  )
);

CREATE POLICY "Users can update cash drawer accounts for their store"
ON cash_drawer_accounts FOR UPDATE
TO authenticated
USING (
  store_id IN (
    SELECT store_id FROM users 
    WHERE id = auth.uid() 
    AND store_id IS NOT NULL
  )
)
WITH CHECK (
  store_id IN (
    SELECT store_id FROM users 
    WHERE id = auth.uid() 
    AND store_id IS NOT NULL
  )
);

-- DELETE policies
CREATE POLICY "Super admins can delete cash drawer accounts"
ON cash_drawer_accounts FOR DELETE
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM users
    WHERE id = auth.uid()
    AND role = 'super_admin'
    AND store_id IS NULL
  )
);

-- =============================================================================
-- CASH_DRAWER_SESSIONS RLS POLICIES
-- =============================================================================

-- Enable RLS on cash_drawer_sessions (if not already enabled)
ALTER TABLE cash_drawer_sessions ENABLE ROW LEVEL SECURITY;

-- Drop existing policies if they exist (to make migration idempotent)
DROP POLICY IF EXISTS "Super admins can view all cash drawer sessions" ON cash_drawer_sessions;
DROP POLICY IF EXISTS "Users can view cash drawer sessions for their store" ON cash_drawer_sessions;
DROP POLICY IF EXISTS "Super admins can insert cash drawer sessions" ON cash_drawer_sessions;
DROP POLICY IF EXISTS "Users can insert cash drawer sessions for their store" ON cash_drawer_sessions;
DROP POLICY IF EXISTS "Super admins can update all cash drawer sessions" ON cash_drawer_sessions;
DROP POLICY IF EXISTS "Users can update cash drawer sessions for their store" ON cash_drawer_sessions;
DROP POLICY IF EXISTS "Super admins can delete cash drawer sessions" ON cash_drawer_sessions;

-- SELECT policies
CREATE POLICY "Super admins can view all cash drawer sessions"
ON cash_drawer_sessions FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM users
    WHERE id = auth.uid()
    AND role = 'super_admin'
    AND store_id IS NULL
  )
);

CREATE POLICY "Users can view cash drawer sessions for their store"
ON cash_drawer_sessions FOR SELECT
TO authenticated
USING (
  store_id IN (
    SELECT store_id FROM users 
    WHERE id = auth.uid() 
    AND store_id IS NOT NULL
  )
);

-- INSERT policies
CREATE POLICY "Super admins can insert cash drawer sessions"
ON cash_drawer_sessions FOR INSERT
TO authenticated
WITH CHECK (
  EXISTS (
    SELECT 1 FROM users
    WHERE id = auth.uid()
    AND role = 'super_admin'
    AND store_id IS NULL
  )
);

CREATE POLICY "Users can insert cash drawer sessions for their store"
ON cash_drawer_sessions FOR INSERT
TO authenticated
WITH CHECK (
  store_id IN (
    SELECT store_id FROM users 
    WHERE id = auth.uid() 
    AND store_id IS NOT NULL
  )
);

-- UPDATE policies
CREATE POLICY "Super admins can update all cash drawer sessions"
ON cash_drawer_sessions FOR UPDATE
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM users
    WHERE id = auth.uid()
    AND role = 'super_admin'
    AND store_id IS NULL
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1 FROM users
    WHERE id = auth.uid()
    AND role = 'super_admin'
    AND store_id IS NULL
  )
);

CREATE POLICY "Users can update cash drawer sessions for their store"
ON cash_drawer_sessions FOR UPDATE
TO authenticated
USING (
  store_id IN (
    SELECT store_id FROM users 
    WHERE id = auth.uid() 
    AND store_id IS NOT NULL
  )
)
WITH CHECK (
  store_id IN (
    SELECT store_id FROM users 
    WHERE id = auth.uid() 
    AND store_id IS NOT NULL
  )
);

-- DELETE policies
CREATE POLICY "Super admins can delete cash drawer sessions"
ON cash_drawer_sessions FOR DELETE
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM users
    WHERE id = auth.uid()
    AND role = 'super_admin'
    AND store_id IS NULL
  )
);

-- =============================================================================
-- VERIFICATION
-- =============================================================================

-- Log completion
DO $$
BEGIN
    RAISE NOTICE 'Cash drawer RLS policies created successfully!';
    RAISE NOTICE 'Super admins and store users can now manage cash drawer accounts and sessions';
END $$;
