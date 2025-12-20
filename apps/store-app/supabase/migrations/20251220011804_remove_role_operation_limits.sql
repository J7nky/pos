-- Migration: Remove role_operation_limits Table
-- Removes the role_operation_limits table and all related policies/triggers
-- Operation limits are no longer needed with the new role_permissions/user_permissions system

-- =============================================================================
-- DROP TABLE AND DEPENDENCIES
-- =============================================================================

-- Drop RLS policies first
DROP POLICY IF EXISTS "Admins can manage role operation limits" ON role_operation_limits;
DROP POLICY IF EXISTS "Users can view role operation limits" ON role_operation_limits;

-- Drop trigger
DROP TRIGGER IF EXISTS update_role_operation_limits_updated_at ON role_operation_limits;

-- Drop indexes
DROP INDEX IF EXISTS idx_role_operation_limits_store_role;
DROP INDEX IF EXISTS idx_role_operation_limits_role_lookup;
DROP INDEX IF EXISTS idx_role_operation_limits_user_lookup;

-- Drop table
DROP TABLE IF EXISTS role_operation_limits CASCADE;

-- =============================================================================
-- MIGRATION COMPLETE
-- =============================================================================

-- Summary:
-- ✅ Dropped role_operation_limits table
-- ✅ Removed all RLS policies
-- ✅ Removed all triggers
-- ✅ Removed all indexes
-- 
-- Note: Operation limits functionality has been removed.
-- All access control is now handled by role_permissions and user_permissions tables.

