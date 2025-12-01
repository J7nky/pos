-- Fix for infinite recursion in users RLS policies
-- Run this in Supabase SQL Editor to fix the issue

-- First, drop all existing policies to avoid conflicts
DROP POLICY IF EXISTS "Users can view own profile" ON public.users;
DROP POLICY IF EXISTS "Store admins can view store users" ON public.users;
DROP POLICY IF EXISTS "Super admins can view all users" ON public.users;
DROP POLICY IF EXISTS "Store admins can create store users" ON public.users;
DROP POLICY IF EXISTS "Super admins can create any user" ON public.users;
DROP POLICY IF EXISTS "Users can update own profile" ON public.users;
DROP POLICY IF EXISTS "Store admins can update store users" ON public.users;
DROP POLICY IF EXISTS "Super admins can update any user" ON public.users;
DROP POLICY IF EXISTS "Store admins can delete store users" ON public.users;
DROP POLICY IF EXISTS "Super admins can delete any user" ON public.users;

-- Create helper functions to avoid recursion
CREATE OR REPLACE FUNCTION get_current_user_store_id()
RETURNS UUID
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT store_id FROM public.users WHERE id = auth.uid()
$$;

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

-- Create the fixed policies
-- SELECT policies
CREATE POLICY "Users can view own profile"
ON public.users FOR SELECT
TO authenticated
USING (id = auth.uid());

CREATE POLICY "Store admins can view store users"
ON public.users FOR SELECT
TO authenticated
USING (
  store_id = get_current_user_store_id()
  AND is_current_user_store_manager()
);

CREATE POLICY "Super admins can view all users"
ON public.users FOR SELECT
TO authenticated
USING (is_current_user_super_admin());

-- INSERT policies
CREATE POLICY "Store admins can create store users"
ON public.users FOR INSERT
TO authenticated
WITH CHECK (
  store_id = get_current_user_store_id()
  AND is_current_user_store_admin()
  AND role != 'super_admin'
  AND store_id IS NOT NULL
);

CREATE POLICY "Super admins can create any user"
ON public.users FOR INSERT
TO authenticated
WITH CHECK (is_current_user_super_admin());

-- UPDATE policies
CREATE POLICY "Users can update own profile"
ON public.users FOR UPDATE
TO authenticated
USING (id = auth.uid())
WITH CHECK (id = auth.uid());

CREATE POLICY "Store admins can update store users"
ON public.users FOR UPDATE
TO authenticated
USING (
  store_id = get_current_user_store_id()
  AND is_current_user_store_admin()
)
WITH CHECK (
  store_id = get_current_user_store_id()
  AND role != 'super_admin'
);

CREATE POLICY "Super admins can update any user"
ON public.users FOR UPDATE
TO authenticated
USING (is_current_user_super_admin())
WITH CHECK (is_current_user_super_admin());

-- DELETE policies
CREATE POLICY "Store admins can delete store users"
ON public.users FOR DELETE
TO authenticated
USING (
  store_id = get_current_user_store_id()
  AND is_current_user_store_admin()
  AND role NOT IN ('admin', 'super_admin')
);

CREATE POLICY "Super admins can delete any user"
ON public.users FOR DELETE
TO authenticated
USING (is_current_user_super_admin());

-- Ensure RLS is enabled
ALTER TABLE public.users ENABLE ROW LEVEL SECURITY;

-- Grant permissions
GRANT SELECT, INSERT, UPDATE, DELETE ON public.users TO authenticated;
