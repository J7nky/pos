-- Migration: Create RBAC Tables
-- Creates role_operation_limits and user_module_access tables for enhanced RBAC
-- Supports per-user, per-store, and cross-device permission management

-- =============================================================================
-- TABLE 1: ROLE OPERATION LIMITS
-- =============================================================================

-- Operation-level restrictions (max discount, max return, etc.)
-- Supports both role-level defaults AND per-user overrides
CREATE TABLE IF NOT EXISTS role_operation_limits (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  store_id UUID NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
  role VARCHAR(20) NOT NULL, -- 'admin', 'manager', 'cashier'
  user_id UUID REFERENCES users(id) ON DELETE CASCADE, -- NULL = role default, NOT NULL = user override
  operation_type VARCHAR(50) NOT NULL, -- 'max_discount_percent', 'max_void_amount_usd', etc.
  limit_value NUMERIC(10,2) NOT NULL,
  limit_currency VARCHAR(3), -- 'USD' or 'LBP' for amount-based limits (NULL for percentages)
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(store_id, role, operation_type, user_id)
);

-- Indexes for performance
CREATE INDEX idx_role_operation_limits_store_role 
  ON role_operation_limits(store_id, role);
  
CREATE INDEX idx_role_operation_limits_role_lookup 
  ON role_operation_limits(store_id, role, operation_type) 
  WHERE user_id IS NULL;
  
CREATE INDEX idx_role_operation_limits_user_lookup 
  ON role_operation_limits(store_id, user_id, operation_type) 
  WHERE user_id IS NOT NULL;

-- Comments
COMMENT ON TABLE role_operation_limits IS 
  'Operation limits per role per store, with optional per-user overrides';
COMMENT ON COLUMN role_operation_limits.role IS 
  'User role: admin, manager, or cashier';
COMMENT ON COLUMN role_operation_limits.user_id IS 
  'NULL = default for all users with this role, NOT NULL = override for specific user';
COMMENT ON COLUMN role_operation_limits.operation_type IS 
  'Type: max_discount_percent, max_return_amount_usd, max_return_amount_lbp, max_void_amount_usd, max_void_amount_lbp';

-- =============================================================================
-- TABLE 2: USER MODULE ACCESS (Cross-Device Sync)
-- =============================================================================

-- Module-level access control per user
-- Syncs across all devices via Supabase
CREATE TABLE IF NOT EXISTS user_module_access (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  store_id UUID NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
  module VARCHAR(50) NOT NULL, -- 'pos', 'inventory', 'accounting', 'reports', 'settings', 'users'
  can_access BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(user_id, store_id, module)
);

-- Indexes for performance
CREATE INDEX idx_user_module_access_user 
  ON user_module_access(user_id, store_id);
  
CREATE INDEX idx_user_module_access_lookup 
  ON user_module_access(user_id, store_id, module);

-- Comments
COMMENT ON TABLE user_module_access IS 
  'Per-user module access control - syncs across all devices';
COMMENT ON COLUMN user_module_access.module IS 
  'Module name: pos, inventory, accounting, reports, settings, users';
COMMENT ON COLUMN user_module_access.can_access IS 
  'true = user can access this module, false = blocked';

-- =============================================================================
-- RLS POLICIES: ROLE OPERATION LIMITS
-- =============================================================================

ALTER TABLE role_operation_limits ENABLE ROW LEVEL SECURITY;

-- Admins can manage operation limits for their store
CREATE POLICY "Admins can manage role operation limits"
ON role_operation_limits FOR ALL
TO authenticated
USING (
  store_id IN (
    SELECT store_id FROM users WHERE id = auth.uid() AND role IN ('admin', 'super_admin')
  )
);

-- All authenticated users can view limits for their store
CREATE POLICY "Users can view role operation limits"
ON role_operation_limits FOR SELECT
TO authenticated
USING (
  store_id IN (
    SELECT store_id FROM users WHERE id = auth.uid()
  )
);

-- =============================================================================
-- RLS POLICIES: USER MODULE ACCESS
-- =============================================================================

ALTER TABLE user_module_access ENABLE ROW LEVEL SECURITY;

-- Admins can manage module access for users in their store
CREATE POLICY "Admins can manage user module access"
ON user_module_access FOR ALL
TO authenticated
USING (
  store_id IN (
    SELECT store_id FROM users WHERE id = auth.uid() AND role IN ('admin', 'super_admin')
  )
);

-- Users can view their own module access
CREATE POLICY "Users can view their own module access"
ON user_module_access FOR SELECT
TO authenticated
USING (
  user_id = auth.uid()
);

-- =============================================================================
-- UPDATED_AT TRIGGERS
-- =============================================================================

-- Trigger function for updated_at (if not already exists)
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger for role_operation_limits
DROP TRIGGER IF EXISTS update_role_operation_limits_updated_at ON role_operation_limits;
CREATE TRIGGER update_role_operation_limits_updated_at
    BEFORE UPDATE ON role_operation_limits
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- Trigger for user_module_access
DROP TRIGGER IF EXISTS update_user_module_access_updated_at ON user_module_access;
CREATE TRIGGER update_user_module_access_updated_at
    BEFORE UPDATE ON user_module_access
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- =============================================================================
-- MIGRATION COMPLETE
-- =============================================================================

-- Summary:
-- ✅ Created role_operation_limits table (operation limits per role/user)
-- ✅ Created user_module_access table (module permissions per user)
-- ✅ Added indexes for performance
-- ✅ Enabled RLS with appropriate policies
-- ✅ Added updated_at triggers
-- 
-- Next steps:
-- 1. Run this migration: supabase db push (or apply via Supabase dashboard)
-- 2. Update TypeScript types
-- 3. Update IndexedDB schema
-- 4. Implement RolePermissionService

