-- Migration: Remove store_id from role_permissions
-- Makes role_permissions truly GLOBAL (applies to all stores)
-- Fixes schema mismatch where table had store_id but should be global

-- =============================================================================
-- DROP RLS POLICIES (they depend on store_id)
-- =============================================================================

-- Drop existing RLS policies that reference store_id
DROP POLICY IF EXISTS "Super admins can manage global role permissions" ON role_permissions;
DROP POLICY IF EXISTS "Users can view global role permissions" ON role_permissions;
DROP POLICY IF EXISTS "Admins can manage role permissions" ON role_permissions;
DROP POLICY IF EXISTS "Users can view role permissions" ON role_permissions;

-- =============================================================================
-- DEDUPLICATE DATA (before removing store_id)
-- =============================================================================

-- Remove duplicate rows, keeping the one with the most recent updated_at
-- This handles the case where the same (role, operation) exists for different store_ids
DELETE FROM role_permissions
WHERE id IN (
    SELECT id
    FROM (
        SELECT id,
               ROW_NUMBER() OVER (
                   PARTITION BY role, operation 
                   ORDER BY updated_at DESC, created_at DESC
               ) as rn
        FROM role_permissions
    ) t
    WHERE t.rn > 1
);

-- =============================================================================
-- REMOVE store_id COLUMN
-- =============================================================================

-- Drop the store_id column from role_permissions table
ALTER TABLE role_permissions DROP COLUMN IF EXISTS store_id;

-- =============================================================================
-- UPDATE UNIQUE CONSTRAINT
-- =============================================================================

-- Drop existing constraint if it exists (might have different name)
DO $$
BEGIN
    -- Try to drop constraint if it exists
    ALTER TABLE role_permissions DROP CONSTRAINT IF EXISTS role_permissions_role_operation_key;
EXCEPTION
    WHEN undefined_object THEN NULL;
END $$;

-- Add the UNIQUE constraint on (role, operation)
ALTER TABLE role_permissions 
ADD CONSTRAINT role_permissions_role_operation_key 
UNIQUE (role, operation);

-- =============================================================================
-- UPDATE INDEXES
-- =============================================================================

-- Drop any indexes that include store_id (if they exist)
DROP INDEX IF EXISTS idx_role_permissions_store_role;
DROP INDEX IF EXISTS idx_role_permissions_store_role_operation;

-- Ensure the correct indexes exist (for role and role+operation lookups)
CREATE INDEX IF NOT EXISTS idx_role_permissions_role 
  ON role_permissions(role);
  
CREATE INDEX IF NOT EXISTS idx_role_permissions_lookup 
  ON role_permissions(role, operation);

-- =============================================================================
-- RECREATE RLS POLICIES (without store_id)
-- =============================================================================

-- Re-enable RLS
ALTER TABLE role_permissions ENABLE ROW LEVEL SECURITY;

-- Super admins can manage global role permissions (no store_id filter needed)
CREATE POLICY "Super admins can manage global role permissions"
ON role_permissions FOR ALL
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM users 
    WHERE id = auth.uid() 
    AND role = 'super_admin'
  )
);

-- All authenticated users can view global role permissions
CREATE POLICY "Users can view global role permissions"
ON role_permissions FOR SELECT
TO authenticated
USING (true); -- Global permissions - all authenticated users can view

-- =============================================================================
-- MIGRATION COMPLETE
-- =============================================================================

-- Summary:
-- ✅ Removed store_id column from role_permissions table
-- ✅ Ensured UNIQUE constraint on (role, operation)
-- ✅ Updated indexes to remove store_id references
-- ✅ role_permissions is now truly GLOBAL (applies to all stores)

