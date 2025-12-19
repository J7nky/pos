-- Migration: Add Unified Permission Tables
-- Creates role_permissions and user_permissions tables for unified RBAC
-- Replaces hardcoded permissions with database-driven system

-- =============================================================================
-- TABLE 1: ROLE PERMISSIONS
-- =============================================================================

-- Unified permissions table (operations + module access)
-- GLOBAL permissions - applies to ALL stores (no store_id)
-- Includes both operation permissions (create_sale, void_sale) and module access (access_pos, access_inventory)
CREATE TABLE IF NOT EXISTS role_permissions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  role VARCHAR(20) NOT NULL, -- 'admin', 'manager', 'cashier', 'super_admin'
  operation VARCHAR(50) NOT NULL, -- 'create_sale', 'void_sale', 'access_pos', 'access_inventory', etc.
  allowed BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(role, operation) -- No store_id - global permissions
);

-- Indexes for performance
CREATE INDEX idx_role_permissions_role 
  ON role_permissions(role);
  
CREATE INDEX idx_role_permissions_lookup 
  ON role_permissions(role, operation);

-- Comments
COMMENT ON TABLE role_permissions IS 
  'GLOBAL default permissions per role - applies to ALL stores. Includes operations and module access';
COMMENT ON COLUMN role_permissions.role IS 
  'User role: admin, manager, cashier, or super_admin';
COMMENT ON COLUMN role_permissions.operation IS 
  'Operation name: create_sale, void_sale, access_pos, access_inventory, etc.';

-- =============================================================================
-- TABLE 2: USER PERMISSIONS
-- =============================================================================

-- User permission overrides (user-specific permission changes)
-- Includes both operation permissions and module access overrides
CREATE TABLE IF NOT EXISTS user_permissions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  store_id UUID NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
  operation VARCHAR(50) NOT NULL,
  allowed BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(user_id, store_id, operation)
);

-- Indexes for performance
CREATE INDEX idx_user_permissions_user 
  ON user_permissions(user_id, store_id);
  
CREATE INDEX idx_user_permissions_lookup 
  ON user_permissions(user_id, store_id, operation);

-- Comments
COMMENT ON TABLE user_permissions IS 
  'User-specific permission overrides - includes operations and module access';
COMMENT ON COLUMN user_permissions.operation IS 
  'Operation name: create_sale, void_sale, access_pos, access_inventory, etc.';

-- =============================================================================
-- SEED GLOBAL DEFAULT PERMISSIONS
-- =============================================================================

-- Seed GLOBAL default permissions for all roles (migrated from hardcoded values)
-- These apply to ALL stores - seeded once, not per-store

-- Super Admin: All permissions
INSERT INTO role_permissions (role, operation, allowed)
VALUES
  -- Module access
  ('super_admin', 'access_pos', true),
  ('super_admin', 'access_inventory', true),
  ('super_admin', 'access_accounting', true),
  ('super_admin', 'access_reports', true),
  ('super_admin', 'access_settings', true),
  ('super_admin', 'access_users', true),
  -- POS operations
  ('super_admin', 'create_sale', true),
  ('super_admin', 'edit_sale', true),
  ('super_admin', 'delete_sale', true),
  ('super_admin', 'void_sale', true),
  ('super_admin', 'refund_sale', true),
  ('super_admin', 'apply_discount', true),
  ('super_admin', 'override_price', true),
  ('super_admin', 'access_cash_drawer', true),
  -- Inventory operations
  ('super_admin', 'create_product', true),
  ('super_admin', 'edit_product', true),
  ('super_admin', 'delete_product', true),
  ('super_admin', 'receive_inventory', true),
  ('super_admin', 'adjust_inventory', true),
  ('super_admin', 'view_products', true),
  -- Accounting operations
  ('super_admin', 'create_transaction', true),
  ('super_admin', 'edit_transaction', true),
  ('super_admin', 'delete_transaction', true),
  ('super_admin', 'view_reports', true),
  -- User management
  ('super_admin', 'create_user', true),
  ('super_admin', 'edit_user', true),
  ('super_admin', 'delete_user', true),
  ('super_admin', 'view_users', true),
  ('super_admin', 'manage_users', true)
ON CONFLICT (role, operation) DO NOTHING;

-- Admin: Most permissions (no super_admin powers)
INSERT INTO role_permissions (role, operation, allowed)
VALUES
  -- Module access
  ('admin', 'access_pos', true),
  ('admin', 'access_inventory', true),
  ('admin', 'access_accounting', true),
  ('admin', 'access_reports', true),
  ('admin', 'access_settings', true),
  ('admin', 'access_users', true),
  ('admin', 'access_employees', true),
  -- POS operations
  ('admin', 'create_sale', true),
  ('admin', 'edit_sale', true),
  ('admin', 'delete_sale', true),
  ('admin', 'void_sale', true),
  ('admin', 'refund_sale', true),
  ('admin', 'apply_discount', true),
  ('admin', 'override_price', true),
  ('admin', 'access_cash_drawer', true),
  -- Inventory operations
  ('admin', 'create_product', true),
  ('admin', 'edit_product', true),
  ('admin', 'delete_product', true),
  ('admin', 'receive_inventory', true),
  ('admin', 'adjust_inventory', true),
  ('admin', 'view_products', true),
  -- Accounting operations
  ('admin', 'create_transaction', true),
  ('admin', 'edit_transaction', true),
  ('admin', 'delete_transaction', true),
  ('admin', 'view_reports', true),
  -- User management
  ('admin', 'create_user', true),
  ('admin', 'edit_user', true),
  ('admin', 'delete_user', true),
  ('admin', 'view_users', true),
  ('admin', 'manage_users', true)
ON CONFLICT (role, operation) DO NOTHING;

-- Manager: Limited permissions
INSERT INTO role_permissions (role, operation, allowed)
VALUES
  -- Module access
  ('manager', 'access_pos', true),
  ('manager', 'access_inventory', true),
  ('manager', 'access_accounting', true),
  ('manager', 'access_reports', true),
  -- POS operations
  ('manager', 'create_sale', true),
  ('manager', 'edit_sale', true),
  ('manager', 'void_sale', true),
  ('manager', 'refund_sale', true),
  ('manager', 'apply_discount', true),
  ('manager', 'access_cash_drawer', true),
  -- Inventory operations
  ('manager', 'create_product', true),
  ('manager', 'edit_product', true),
  ('manager', 'receive_inventory', true),
  ('manager', 'view_products', true),
  -- Accounting operations
  ('manager', 'create_transaction', true),
  ('manager', 'view_reports', true),
  -- User management (view only)
  ('manager', 'view_users', true)
ON CONFLICT (role, operation) DO NOTHING;

-- Cashier: Minimal permissions
INSERT INTO role_permissions (role, operation, allowed)
VALUES
  -- Module access
  ('cashier', 'access_pos', true),
  ('cashier', 'access_inventory', true),
  -- POS operations
  ('cashier', 'create_sale', true),
  ('cashier', 'apply_discount', true),
  ('cashier', 'access_cash_drawer', true),
  -- Inventory (view only)
  ('cashier', 'view_products', true)
ON CONFLICT (role, operation) DO NOTHING;

-- =============================================================================
-- RLS POLICIES: ROLE PERMISSIONS
-- =============================================================================

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
-- RLS POLICIES: USER PERMISSIONS
-- =============================================================================

ALTER TABLE user_permissions ENABLE ROW LEVEL SECURITY;

-- Admins can manage user permissions for users in their store
CREATE POLICY "Admins can manage user permissions"
ON user_permissions FOR ALL
TO authenticated
USING (
  store_id IN (
    SELECT store_id FROM users WHERE id = auth.uid() AND role IN ('admin', 'super_admin')
  )
);

-- Users can view their own permissions
CREATE POLICY "Users can view their own permissions"
ON user_permissions FOR SELECT
TO authenticated
USING (
  user_id = auth.uid()
);

-- =============================================================================
-- UPDATED_AT TRIGGERS
-- =============================================================================

-- Trigger for role_permissions
DROP TRIGGER IF EXISTS update_role_permissions_updated_at ON role_permissions;
CREATE TRIGGER update_role_permissions_updated_at
    BEFORE UPDATE ON role_permissions
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- Trigger for user_permissions
DROP TRIGGER IF EXISTS update_user_permissions_updated_at ON user_permissions;
CREATE TRIGGER update_user_permissions_updated_at
    BEFORE UPDATE ON user_permissions
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- =============================================================================
-- DROP OLD TABLE
-- =============================================================================

-- Drop user_module_access table if it exists (no data to migrate)
DROP TABLE IF EXISTS user_module_access CASCADE;

-- =============================================================================
-- MIGRATION COMPLETE
-- =============================================================================

-- Summary:
-- ✅ Created role_permissions table (GLOBAL permissions per role - no store_id)
-- ✅ Created user_permissions table (user-specific permission overrides - has store_id)
-- ✅ Seeded GLOBAL default permissions for all roles (operations + module access) - seeded once
-- ✅ Added indexes for performance
-- ✅ Enabled RLS with appropriate policies (super_admin only can manage global permissions)
-- ✅ Added updated_at triggers
-- ✅ Dropped user_module_access table (if exists)


