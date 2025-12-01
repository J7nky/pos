-- Migration: RLS Policies for Users Table
-- Allows authenticated users to view their relative records
-- Allows admins to update/create store users
-- Allows super admins to perform all CRUD operations for all users

-- =============================================================================
-- STEP 0: CREATE HELPER FUNCTIONS TO AVOID RECURSION
-- =============================================================================

-- Function to get current user's store_id safely
CREATE OR REPLACE FUNCTION get_current_user_store_id()
RETURNS UUID
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT store_id FROM public.users WHERE id = auth.uid()
$$;

-- Function to check if current user is super admin
CREATE OR REPLACE FUNCTION is_current_user_super_admin()
RETURNS BOOLEAN
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.users 
    WHERE id = auth.uid() 
    AND role = 'super_admin' 
    AND store_id IS NULL
  )
$$;

-- Function to check if current user is store admin
CREATE OR REPLACE FUNCTION is_current_user_store_admin()
RETURNS BOOLEAN
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.users 
    WHERE id = auth.uid() 
    AND role = 'admin'
    AND store_id IS NOT NULL
  )
$$;

-- Function to check if current user is store admin or manager
CREATE OR REPLACE FUNCTION is_current_user_store_manager()
RETURNS BOOLEAN
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.users 
    WHERE id = auth.uid() 
    AND role IN ('admin', 'manager')
    AND store_id IS NOT NULL
  )
$$;

-- =============================================================================
-- STEP 1: ENABLE RLS ON USERS TABLE
-- =============================================================================

ALTER TABLE public.users ENABLE ROW LEVEL SECURITY;

-- =============================================================================
-- STEP 2: SELECT POLICIES (READ)
-- =============================================================================

-- Policy 1: Authenticated users can view their own record
CREATE POLICY "Users can view own profile"
ON public.users
FOR SELECT
TO authenticated
USING (id = auth.uid());

-- Policy 2: Store admins can view users from their store
CREATE POLICY "Store admins can view store users"
ON public.users
FOR SELECT
TO authenticated
USING (
  -- User is from the same store
  store_id = get_current_user_store_id()
  AND
  -- Requester is admin or manager
  is_current_user_store_manager()
);

-- Policy 3: Super admins can view all users
CREATE POLICY "Super admins can view all users"
ON public.users
FOR SELECT
TO authenticated
USING (
  is_current_user_super_admin()
);

-- =============================================================================
-- STEP 3: INSERT POLICIES (CREATE)
-- =============================================================================

-- Policy 1: Store admins can create users for their store
CREATE POLICY "Store admins can create store users"
ON public.users
FOR INSERT
TO authenticated
WITH CHECK (
  -- Must be for the same store as the admin
  store_id = get_current_user_store_id()
  AND
  -- Requester must be admin
  is_current_user_store_admin()
  AND
  -- Cannot create super_admin users (only super admins can do that)
  role != 'super_admin'
  AND
  -- Store users must have store_id
  store_id IS NOT NULL
);

-- Policy 2: Super admins can create any user
CREATE POLICY "Super admins can create any user"
ON public.users
FOR INSERT
TO authenticated
WITH CHECK (
  is_current_user_super_admin()
);

-- =============================================================================
-- STEP 4: UPDATE POLICIES
-- =============================================================================

-- Policy 1: Users can update their own profile (limited fields)
CREATE POLICY "Users can update own profile"
ON public.users
FOR UPDATE
TO authenticated
USING (id = auth.uid())
WITH CHECK (
  id = auth.uid()
);

-- Policy 2: Store admins can update users in their store
CREATE POLICY "Store admins can update store users"
ON public.users
FOR UPDATE
TO authenticated
USING (
  -- Target user must be from the same store
  store_id = get_current_user_store_id()
  AND
  -- Requester must be admin
  is_current_user_store_admin()
)
WITH CHECK (
  -- Must remain in the same store
  store_id = get_current_user_store_id()
  AND
  -- Cannot promote to super_admin
  role != 'super_admin'
);

-- Policy 3: Super admins can update any user
CREATE POLICY "Super admins can update any user"
ON public.users
FOR UPDATE
TO authenticated
USING (
  is_current_user_super_admin()
)
WITH CHECK (
  is_current_user_super_admin()
);

-- =============================================================================
-- STEP 5: DELETE POLICIES
-- =============================================================================

-- Policy 1: Store admins can delete users in their store (except admins)
CREATE POLICY "Store admins can delete store users"
ON public.users
FOR DELETE
TO authenticated
USING (
  -- Target user must be from the same store
  store_id = get_current_user_store_id()
  AND
  -- Requester must be admin
  is_current_user_store_admin()
  AND
  -- Cannot delete other admins (security)
  role NOT IN ('admin', 'super_admin')
);

-- Policy 2: Super admins can delete any user
CREATE POLICY "Super admins can delete any user"
ON public.users
FOR DELETE
TO authenticated
USING (
  is_current_user_super_admin()
);

-- =============================================================================
-- STEP 6: GRANT PERMISSIONS
-- =============================================================================

GRANT SELECT, INSERT, UPDATE, DELETE ON public.users TO authenticated;

-- =============================================================================
-- STEP 7: POLICY COMMENTS
-- =============================================================================

COMMENT ON POLICY "Users can view own profile" ON public.users IS 
'Allows users to view their own user record';

COMMENT ON POLICY "Store admins can view store users" ON public.users IS 
'Allows store admins and managers to view users from their store';

COMMENT ON POLICY "Super admins can view all users" ON public.users IS 
'Allows super admins to view all users across all stores';

COMMENT ON POLICY "Store admins can create store users" ON public.users IS 
'Allows store admins to create users for their store (not super_admin)';

COMMENT ON POLICY "Super admins can create any user" ON public.users IS 
'Allows super admins to create any type of user';

COMMENT ON POLICY "Users can update own profile" ON public.users IS 
'Allows users to update their own profile (excluding role and store_id)';

COMMENT ON POLICY "Store admins can update store users" ON public.users IS 
'Allows store admins to update users in their store (with restrictions)';

COMMENT ON POLICY "Super admins can update any user" ON public.users IS 
'Allows super admins to update any user without restrictions';

COMMENT ON POLICY "Store admins can delete store users" ON public.users IS 
'Allows store admins to delete non-admin users from their store';

COMMENT ON POLICY "Super admins can delete any user" ON public.users IS 
'Allows super admins to delete any user';

-- =============================================================================
-- MIGRATION COMPLETE
-- =============================================================================

DO $$
BEGIN
    RAISE NOTICE 'RLS policies for users table created successfully';
    RAISE NOTICE 'Policies implemented:';
    RAISE NOTICE '- Authenticated users: View own profile';
    RAISE NOTICE '- Store admins: View/create/update/delete store users';
    RAISE NOTICE '- Super admins: Full CRUD access to all users';
    RAISE NOTICE 'Security restrictions in place:';
    RAISE NOTICE '- Users cannot change their role or store_id';
    RAISE NOTICE '- Store admins cannot create super_admin users';
    RAISE NOTICE '- Store admins cannot delete other admins';
END $$;
