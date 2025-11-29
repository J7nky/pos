-- Migration: Add soft-delete columns to stores and branches
-- Date: November 29, 2025
-- Purpose: Implement industry-standard soft-delete pattern
-- Rule: Stores and branches should NEVER be hard-deleted

-- =============================================================================
-- 1. ADD SOFT-DELETE COLUMNS TO STORES
-- =============================================================================

ALTER TABLE public.stores 
ADD COLUMN IF NOT EXISTS is_deleted boolean DEFAULT false;

ALTER TABLE public.stores 
ADD COLUMN IF NOT EXISTS deleted_at timestamp with time zone;

ALTER TABLE public.stores 
ADD COLUMN IF NOT EXISTS deleted_by uuid REFERENCES auth.users(id);

-- Add index for efficient filtering of non-deleted stores
CREATE INDEX IF NOT EXISTS idx_stores_is_deleted 
ON public.stores(is_deleted) 
WHERE is_deleted = false;

-- Add comment for documentation
COMMENT ON COLUMN public.stores.is_deleted IS 'Soft-delete flag. When true, store is considered deleted but data is preserved.';
COMMENT ON COLUMN public.stores.deleted_at IS 'Timestamp when the store was soft-deleted.';
COMMENT ON COLUMN public.stores.deleted_by IS 'User ID who performed the soft-delete.';

-- =============================================================================
-- 2. ADD SOFT-DELETE COLUMNS TO BRANCHES
-- =============================================================================

ALTER TABLE public.branches 
ADD COLUMN IF NOT EXISTS is_deleted boolean DEFAULT false;

ALTER TABLE public.branches 
ADD COLUMN IF NOT EXISTS deleted_at timestamp with time zone;

ALTER TABLE public.branches 
ADD COLUMN IF NOT EXISTS deleted_by uuid REFERENCES auth.users(id);

-- Add index for efficient filtering of non-deleted branches
CREATE INDEX IF NOT EXISTS idx_branches_is_deleted 
ON public.branches(is_deleted) 
WHERE is_deleted = false;

-- Add comment for documentation
COMMENT ON COLUMN public.branches.is_deleted IS 'Soft-delete flag. When true, branch is considered deleted but data is preserved.';
COMMENT ON COLUMN public.branches.deleted_at IS 'Timestamp when the branch was soft-deleted.';
COMMENT ON COLUMN public.branches.deleted_by IS 'User ID who performed the soft-delete.';

-- =============================================================================
-- 3. CREATE HELPER FUNCTIONS FOR SOFT-DELETE
-- =============================================================================

-- Function to soft-delete a store
CREATE OR REPLACE FUNCTION soft_delete_store(
    store_uuid uuid,
    deleted_by_uuid uuid DEFAULT NULL
)
RETURNS void AS $$
BEGIN
    UPDATE public.stores
    SET 
        is_deleted = true,
        deleted_at = now(),
        deleted_by = deleted_by_uuid,
        status = 'archived',
        updated_at = now()
    WHERE id = store_uuid;
    
    -- Also soft-delete all branches of this store
    UPDATE public.branches
    SET 
        is_deleted = true,
        deleted_at = now(),
        deleted_by = deleted_by_uuid,
        is_active = false,
        updated_at = now()
    WHERE store_id = store_uuid AND is_deleted = false;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to soft-delete a branch
CREATE OR REPLACE FUNCTION soft_delete_branch(
    branch_uuid uuid,
    deleted_by_uuid uuid DEFAULT NULL
)
RETURNS void AS $$
DECLARE
    active_branch_count integer;
    branch_store_id uuid;
BEGIN
    -- Get the store_id for this branch
    SELECT store_id INTO branch_store_id
    FROM public.branches
    WHERE id = branch_uuid;
    
    -- Count active, non-deleted branches for this store (excluding the one being deleted)
    SELECT COUNT(*) INTO active_branch_count
    FROM public.branches
    WHERE store_id = branch_store_id
      AND id != branch_uuid
      AND is_active = true
      AND is_deleted = false;
    
    -- Prevent deleting the last active branch
    IF active_branch_count = 0 THEN
        RAISE EXCEPTION 'Cannot delete the last active branch. A store must have at least one active branch.';
    END IF;
    
    -- Perform soft-delete
    UPDATE public.branches
    SET 
        is_deleted = true,
        deleted_at = now(),
        deleted_by = deleted_by_uuid,
        is_active = false,
        updated_at = now()
    WHERE id = branch_uuid;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to restore a soft-deleted store
CREATE OR REPLACE FUNCTION restore_store(store_uuid uuid)
RETURNS void AS $$
BEGIN
    UPDATE public.stores
    SET 
        is_deleted = false,
        deleted_at = NULL,
        deleted_by = NULL,
        status = 'active',
        updated_at = now()
    WHERE id = store_uuid;
    
    -- Restore the main branch (first branch created)
    UPDATE public.branches
    SET 
        is_deleted = false,
        deleted_at = NULL,
        deleted_by = NULL,
        is_active = true,
        updated_at = now()
    WHERE store_id = store_uuid
      AND is_deleted = true
    ORDER BY created_at ASC
    LIMIT 1;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to restore a soft-deleted branch
CREATE OR REPLACE FUNCTION restore_branch(branch_uuid uuid)
RETURNS void AS $$
BEGIN
    UPDATE public.branches
    SET 
        is_deleted = false,
        deleted_at = NULL,
        deleted_by = NULL,
        is_active = true,
        updated_at = now()
    WHERE id = branch_uuid;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- =============================================================================
-- 4. UPDATE RLS POLICIES TO EXCLUDE DELETED RECORDS
-- =============================================================================

-- Drop existing policies if they exist and recreate with soft-delete filter
-- Note: This is a safe approach - policies are idempotent

-- For stores: Only show non-deleted stores
DROP POLICY IF EXISTS "stores_select_policy" ON public.stores;
CREATE POLICY "stores_select_policy" ON public.stores
    FOR SELECT
    USING (is_deleted = false OR is_deleted IS NULL);

-- For branches: Only show non-deleted branches
DROP POLICY IF EXISTS "branches_select_policy" ON public.branches;
CREATE POLICY "branches_select_policy" ON public.branches
    FOR SELECT
    USING (is_deleted = false OR is_deleted IS NULL);

-- =============================================================================
-- 5. CREATE VIEW FOR DELETED RECORDS (ADMIN USE)
-- =============================================================================

-- View to see deleted stores (for admin recovery purposes)
CREATE OR REPLACE VIEW public.deleted_stores AS
SELECT 
    s.*,
    u.email as deleted_by_email,
    u.name as deleted_by_name
FROM public.stores s
LEFT JOIN public.users u ON s.deleted_by = u.id
WHERE s.is_deleted = true;

-- View to see deleted branches (for admin recovery purposes)
CREATE OR REPLACE VIEW public.deleted_branches AS
SELECT 
    b.*,
    s.name as store_name,
    u.email as deleted_by_email,
    u.name as deleted_by_name
FROM public.branches b
LEFT JOIN public.stores s ON b.store_id = s.id
LEFT JOIN public.users u ON b.deleted_by = u.id
WHERE b.is_deleted = true;

-- =============================================================================
-- MIGRATION COMPLETE
-- =============================================================================

DO $$
BEGIN
    RAISE NOTICE 'Migration completed: Soft-delete columns added to stores and branches';
    RAISE NOTICE 'New columns: is_deleted, deleted_at, deleted_by';
    RAISE NOTICE 'Helper functions: soft_delete_store(), soft_delete_branch(), restore_store(), restore_branch()';
    RAISE NOTICE 'IMPORTANT: Hard-delete operations should no longer be used!';
END $$;
