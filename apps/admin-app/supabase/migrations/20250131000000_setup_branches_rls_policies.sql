-- Migration: Setup RLS Policies for Branches Table
-- Date: January 31, 2025
-- Purpose: Create comprehensive Row Level Security policies for branches table
-- Security Model:
--   - Users can view branches in their store (excluding deleted ones)
--   - Only admin users can create/update branches in their store
--   - Direct DELETE is prevented (soft-delete only via function)

-- =============================================================================
-- 1. ENABLE ROW LEVEL SECURITY
-- =============================================================================

ALTER TABLE public.branches ENABLE ROW LEVEL SECURITY;

-- =============================================================================
-- 2. DROP EXISTING POLICIES (IF ANY)
-- =============================================================================

DROP POLICY IF EXISTS "branches_select_policy" ON public.branches;
DROP POLICY IF EXISTS "branches_insert_policy" ON public.branches;
DROP POLICY IF EXISTS "branches_update_policy" ON public.branches;
DROP POLICY IF EXISTS "branches_delete_policy" ON public.branches;

-- =============================================================================
-- 3. SELECT POLICY - Users can view branches in their store
-- =============================================================================

-- All authenticated users can view branches in their store
-- Excludes soft-deleted branches (is_deleted = true)
CREATE POLICY "branches_select_policy" ON public.branches
    FOR SELECT
    TO authenticated
    USING (
        -- User must be authenticated
        auth.uid() IS NOT NULL
        -- Branch must belong to user's store
        AND store_id IN (
            SELECT store_id 
            FROM public.users 
            WHERE id = auth.uid()
        )
        -- Exclude soft-deleted branches
        AND (is_deleted = false OR is_deleted IS NULL)
    );

-- =============================================================================
-- 4. INSERT POLICY - Only admin users can create branches
-- =============================================================================

-- Only admin users can create new branches in their store
CREATE POLICY "branches_insert_policy" ON public.branches
    FOR INSERT
    TO authenticated
    WITH CHECK (
        -- User must be authenticated
        auth.uid() IS NOT NULL
        -- User must be an admin
        AND EXISTS (
            SELECT 1 
            FROM public.users 
            WHERE id = auth.uid()
            AND role = 'admin'
        )
        -- Branch must belong to user's store
        AND store_id IN (
            SELECT store_id 
            FROM public.users 
            WHERE id = auth.uid()
        )
        -- New branches should not be marked as deleted
        AND (is_deleted = false OR is_deleted IS NULL)
    );

-- =============================================================================
-- 5. UPDATE POLICY - Only admin users can update branches
-- =============================================================================

-- Only admin users can update branches in their store
CREATE POLICY "branches_update_policy" ON public.branches
    FOR UPDATE
    TO authenticated
    USING (
        -- User must be authenticated
        auth.uid() IS NOT NULL
        -- User must be an admin
        AND EXISTS (
            SELECT 1 
            FROM public.users 
            WHERE id = auth.uid()
            AND role = 'admin'
        )
        -- Branch must belong to user's store
        AND store_id IN (
            SELECT store_id 
            FROM public.users 
            WHERE id = auth.uid()
        )
    )
    WITH CHECK (
        -- After update, branch must still belong to user's store
        store_id IN (
            SELECT store_id 
            FROM public.users 
            WHERE id = auth.uid()
        )
    );

-- =============================================================================
-- 6. DELETE POLICY - Prevent direct DELETE operations
-- =============================================================================

-- Direct DELETE operations are NOT allowed
-- Branches must be soft-deleted using the soft_delete_branch() function
-- This policy explicitly denies DELETE to enforce soft-delete pattern
-- (No policy = deny by default, but we're being explicit)

-- Note: If you need to allow DELETE for specific cases, you can create a policy
-- that uses SECURITY DEFINER function, but it's recommended to use soft-delete only

-- =============================================================================
-- 7. ADD COMMENTS FOR DOCUMENTATION
-- =============================================================================

COMMENT ON POLICY "branches_select_policy" ON public.branches IS 
'Allows authenticated users to view non-deleted branches in their store. Regular users can see all branches in their store, but application layer filters to current branch.';

COMMENT ON POLICY "branches_insert_policy" ON public.branches IS 
'Allows only admin users to create new branches in their store. New branches must belong to the admin''s store and cannot be marked as deleted.';

COMMENT ON POLICY "branches_update_policy" ON public.branches IS 
'Allows only admin users to update branches in their store. This includes updating name, address, phone, logo, and is_active status. Store_id cannot be changed.';

-- =============================================================================
-- 8. VERIFICATION QUERIES
-- =============================================================================

-- Verify RLS is enabled
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 
        FROM pg_tables t
        JOIN pg_class c ON c.relname = t.tablename
        JOIN pg_namespace n ON n.oid = c.relnamespace
        WHERE t.schemaname = 'public' 
        AND t.tablename = 'branches'
        AND c.relrowsecurity = true
    ) THEN
        RAISE EXCEPTION 'RLS is not enabled on branches table';
    END IF;
    
    RAISE NOTICE '✅ RLS is enabled on branches table';
END $$;

-- Verify policies exist
DO $$
DECLARE
    policy_count INTEGER;
BEGIN
    SELECT COUNT(*) INTO policy_count
    FROM pg_policies
    WHERE schemaname = 'public'
    AND tablename = 'branches';
    
    IF policy_count < 3 THEN
        RAISE EXCEPTION 'Expected at least 3 policies on branches table, found %', policy_count;
    END IF;
    
    RAISE NOTICE '✅ Found % policies on branches table', policy_count;
END $$;

-- =============================================================================
-- MIGRATION COMPLETE
-- =============================================================================

DO $$
BEGIN
    RAISE NOTICE 'Migration completed: RLS policies created for branches table';
    RAISE NOTICE 'Policies created:';
    RAISE NOTICE '  - branches_select_policy: All authenticated users can view branches in their store';
    RAISE NOTICE '  - branches_insert_policy: Only admin users can create branches';
    RAISE NOTICE '  - branches_update_policy: Only admin users can update branches';
    RAISE NOTICE '  - DELETE: Explicitly denied (use soft_delete_branch() function instead)';
END $$;

