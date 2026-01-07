-- =====================================================
-- TRANSACTIONS TABLE RLS POLICIES
-- =====================================================
-- This migration adds Row Level Security policies for the transactions table
-- Users can only access transactions in their own store and branch
-- =====================================================

-- First, ensure RLS is enabled on the transactions table
ALTER TABLE public.transactions ENABLE ROW LEVEL SECURITY;

-- Drop existing policies if they exist (for idempotency)
DROP POLICY IF EXISTS "Users can view transactions for their store and branch" ON public.transactions;
DROP POLICY IF EXISTS "Users can insert transactions for their store and branch" ON public.transactions;
DROP POLICY IF EXISTS "Users can update transactions for their store and branch" ON public.transactions;
DROP POLICY IF EXISTS "Users can delete transactions for their store and branch" ON public.transactions;

-- Ensure helper function exists (may already exist from other migrations)
-- This avoids recursion issues when querying the users table
CREATE OR REPLACE FUNCTION get_current_user_store_id()
RETURNS UUID
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT store_id FROM public.users WHERE id = auth.uid()
$$;

-- Create helper function to get current user's branch_id
-- This avoids recursion issues when querying the users table
CREATE OR REPLACE FUNCTION get_current_user_branch_id()
RETURNS UUID
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT branch_id FROM public.users WHERE id = auth.uid()
$$;

-- =====================================================
-- SELECT POLICY
-- =====================================================
-- Users can view transactions in their store
-- - Admins (branch_id IS NULL): Can view all transactions in their store
-- - Managers/Cashiers (branch_id IS NOT NULL): Can only view transactions in their assigned branch
CREATE POLICY "Users can view transactions for their store and branch"
ON public.transactions FOR SELECT
TO authenticated
USING (
  -- Must belong to user's store
  store_id = get_current_user_store_id()
  AND (
    -- Admin users (branch_id IS NULL) can see all branches in their store
    get_current_user_branch_id() IS NULL
    OR
    -- Manager/Cashier users can only see their assigned branch
    branch_id = get_current_user_branch_id()
  )
);

-- =====================================================
-- INSERT POLICY
-- =====================================================
-- Users can only create transactions in their store and branch
-- - Admins can create transactions in any branch of their store
-- - Managers/Cashiers can only create transactions in their assigned branch
CREATE POLICY "Users can insert transactions for their store and branch"
ON public.transactions FOR INSERT
TO authenticated
WITH CHECK (
  -- Must belong to user's store
  store_id = get_current_user_store_id()
  AND (
    -- Admin users (branch_id IS NULL) can create in any branch of their store
    get_current_user_branch_id() IS NULL
    OR
    -- Manager/Cashier users can only create in their assigned branch
    branch_id = get_current_user_branch_id()
  )
  -- Ensure created_by matches the authenticated user
  AND created_by = auth.uid()
);

-- =====================================================
-- UPDATE POLICY
-- =====================================================
-- Users can only update transactions in their store and branch
-- - Admins can update transactions in any branch of their store
-- - Managers/Cashiers can only update transactions in their assigned branch
CREATE POLICY "Users can update transactions for their store and branch"
ON public.transactions FOR UPDATE
TO authenticated
USING (
  -- Must belong to user's store
  store_id = get_current_user_store_id()
  AND (
    -- Admin users (branch_id IS NULL) can update in any branch of their store
    get_current_user_branch_id() IS NULL
    OR
    -- Manager/Cashier users can only update in their assigned branch
    branch_id = get_current_user_branch_id()
  )
)
WITH CHECK (
  -- Ensure store_id and branch_id cannot be changed to unauthorized values
  store_id = get_current_user_store_id()
  AND (
    get_current_user_branch_id() IS NULL
    OR
    branch_id = get_current_user_branch_id()
  )
);

-- =====================================================
-- DELETE POLICY
-- =====================================================
-- Users can only delete transactions in their store and branch
-- - Admins can delete transactions in any branch of their store
-- - Managers/Cashiers can only delete transactions in their assigned branch
CREATE POLICY "Users can delete transactions for their store and branch"
ON public.transactions FOR DELETE
TO authenticated
USING (
  -- Must belong to user's store
  store_id = get_current_user_store_id()
  AND (
    -- Admin users (branch_id IS NULL) can delete in any branch of their store
    get_current_user_branch_id() IS NULL
    OR
    -- Manager/Cashier users can only delete in their assigned branch
    branch_id = get_current_user_branch_id()
  )
);

-- =====================================================
-- GRANT PERMISSIONS
-- =====================================================
-- Grant necessary permissions to authenticated users
GRANT SELECT, INSERT, UPDATE, DELETE ON public.transactions TO authenticated;

-- =====================================================
-- VERIFICATION QUERIES
-- =====================================================
-- Run these queries to verify the policies are working correctly:

-- Check that RLS is enabled
-- SELECT tablename, rowsecurity FROM pg_tables WHERE schemaname = 'public' AND tablename = 'transactions';
-- Should return: rowsecurity = true

-- Check all policies on transactions table
-- SELECT schemaname, tablename, policyname, permissive, roles, cmd, qual, with_check
-- FROM pg_policies 
-- WHERE schemaname = 'public' AND tablename = 'transactions';
-- Should return 4 policies (SELECT, INSERT, UPDATE, DELETE)

-- =====================================================
-- MIGRATION COMPLETE
-- =====================================================
-- ✅ RLS enabled on transactions table
-- ✅ Helper function created for branch_id lookup
-- ✅ SELECT policy: Users can view transactions in their store/branch
-- ✅ INSERT policy: Users can create transactions in their store/branch
-- ✅ UPDATE policy: Users can update transactions in their store/branch
-- ✅ DELETE policy: Users can delete transactions in their store/branch
-- ✅ Permissions granted to authenticated users
-- =====================================================

