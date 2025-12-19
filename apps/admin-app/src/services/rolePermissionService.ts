// Role Permission Service - Admin App
// Handles role permission management for stores

import { supabase } from '../lib/supabase';

export interface RolePermission {
  id: string;
  role: 'admin' | 'manager' | 'cashier' | 'super_admin';
  operation: string;
  allowed: boolean;
  created_at: string;
  updated_at: string;
}

export interface OperationGroup {
  category: string;
  operations: Array<{
    operation: string;
    label: string;
    description?: string;
  }>;
}

// All available operations grouped by category
export const OPERATION_GROUPS: OperationGroup[] = [
  {
    category: 'Module Access',
    operations: [
      { operation: 'access_pos', label: 'POS Module' },
      { operation: 'access_inventory', label: 'Inventory Module' },
      { operation: 'access_accounting', label: 'Accounting Module' },
      { operation: 'access_reports', label: 'Reports Module' },
      { operation: 'access_settings', label: 'Settings Module' },
      { operation: 'access_users', label: 'Users Module' },
      { operation: 'access_employees', label: 'Employees Module' },
    ],
  },
  {
    category: 'POS Operations',
    operations: [
      { operation: 'create_sale', label: 'Create Sale' },
      { operation: 'edit_sale', label: 'Edit Sale' },
      { operation: 'delete_sale', label: 'Delete Sale' },
      { operation: 'void_sale', label: 'Void Sale' },
      { operation: 'refund_sale', label: 'Refund Sale' },
      { operation: 'apply_discount', label: 'Apply Discount' },
      { operation: 'override_price', label: 'Override Price' },
      { operation: 'access_cash_drawer', label: 'Access Cash Drawer' },
    ],
  },
  {
    category: 'Inventory Operations',
    operations: [
      { operation: 'create_product', label: 'Create Product' },
      { operation: 'edit_product', label: 'Edit Product' },
      { operation: 'delete_product', label: 'Delete Product' },
      { operation: 'receive_inventory', label: 'Receive Inventory' },
      { operation: 'adjust_inventory', label: 'Adjust Inventory' },
      { operation: 'view_products', label: 'View Products' },
    ],
  },
  {
    category: 'Accounting Operations',
    operations: [
      { operation: 'create_transaction', label: 'Create Transaction' },
      { operation: 'edit_transaction', label: 'Edit Transaction' },
      { operation: 'delete_transaction', label: 'Delete Transaction' },
      { operation: 'view_reports', label: 'View Reports' },
    ],
  },
  {
    category: 'User Management',
    operations: [
      { operation: 'create_user', label: 'Create User' },
      { operation: 'edit_user', label: 'Edit User' },
      { operation: 'delete_user', label: 'Delete User' },
      { operation: 'view_users', label: 'View Users' },
      { operation: 'manage_users', label: 'Manage Users' },
    ],
  },
];

/**
 * Get all global role permissions (applies to all stores)
 */
export async function getRolePermissions(): Promise<RolePermission[]> {
  const { data, error } = await supabase
    .from('role_permissions')
    .select('*')
    .order('role')
    .order('operation');

  if (error) {
    console.error('Error fetching role permissions:', error);
    throw new Error(`Failed to fetch role permissions: ${error.message}`);
  }

  return data || [];
}

/**
 * Get permissions for a specific role (global - applies to all stores)
 */
export async function getRolePermissionsByRole(
  role: 'admin' | 'manager' | 'cashier' | 'super_admin'
): Promise<RolePermission[]> {
  const { data, error } = await supabase
    .from('role_permissions')
    .select('*')
    .eq('role', role)
    .order('operation');

  if (error) {
    console.error('Error fetching role permissions:', error);
    throw new Error(`Failed to fetch role permissions: ${error.message}`);
  }

  return data || [];
}

/**
 * Update a role permission
 */
export async function updateRolePermission(
  permissionId: string,
  allowed: boolean
): Promise<RolePermission> {
  const { data, error } = await supabase
    .from('role_permissions')
    .update({ allowed, updated_at: new Date().toISOString() })
    .eq('id', permissionId)
    .select()
    .single();

  if (error) {
    console.error('Error updating role permission:', error);
    throw new Error(`Failed to update role permission: ${error.message}`);
  }

  return data;
}

/**
 * Create a global role permission (applies to all stores)
 */
export async function createRolePermission(
  role: 'admin' | 'manager' | 'cashier' | 'super_admin',
  operation: string,
  allowed: boolean
): Promise<RolePermission> {
  const { data, error } = await supabase
    .from('role_permissions')
    .insert({
      role,
      operation,
      allowed,
    })
    .select()
    .single();

  if (error) {
    console.error('Error creating role permission:', error);
    throw new Error(`Failed to create role permission: ${error.message}`);
  }

  return data;
}

/**
 * Upsert a role permission (create if doesn't exist, update if exists)
 * Global permissions - applies to all stores
 */
export async function upsertRolePermission(
  role: 'admin' | 'manager' | 'cashier' | 'super_admin',
  operation: string,
  allowed: boolean
): Promise<RolePermission> {
  // Try to find existing permission
  const { data: existing } = await supabase
    .from('role_permissions')
    .select('*')
    .eq('role', role)
    .eq('operation', operation)
    .single();

  if (existing) {
    return updateRolePermission(existing.id, allowed);
  } else {
    return createRolePermission(role, operation, allowed);
  }
}

/**
 * Bulk update global role permissions (applies to all stores)
 */
export async function bulkUpdateRolePermissions(
  role: 'admin' | 'manager' | 'cashier' | 'super_admin',
  permissions: Record<string, boolean>
): Promise<void> {
  const updates = Object.entries(permissions).map(([operation, allowed]) =>
    upsertRolePermission(role, operation, allowed)
  );

  await Promise.all(updates);
}

/**
 * Get all operations that should exist for a role
 * Returns a map of operation -> should exist
 */
export function getDefaultOperationsForRole(
  role: 'admin' | 'manager' | 'cashier' | 'super_admin'
): Record<string, boolean> {
  const allOperations: Record<string, boolean> = {};

  // Add all operations from all groups
  OPERATION_GROUPS.forEach((group) => {
    group.operations.forEach((op) => {
      allOperations[op.operation] = false; // Default to false
    });
  });

  // Set defaults based on role
  if (role === 'super_admin') {
    // Super admin has all permissions
    Object.keys(allOperations).forEach((op) => {
      allOperations[op] = true;
    });
  } else if (role === 'admin') {
    // Admin has most permissions
    Object.keys(allOperations).forEach((op) => {
      allOperations[op] = true;
    });
  } else if (role === 'manager') {
    // Manager has limited permissions
    allOperations['access_pos'] = true;
    allOperations['access_inventory'] = true;
    allOperations['access_accounting'] = true;
    allOperations['access_reports'] = true;
    allOperations['create_sale'] = true;
    allOperations['edit_sale'] = true;
    allOperations['void_sale'] = true;
    allOperations['refund_sale'] = true;
    allOperations['apply_discount'] = true;
    allOperations['access_cash_drawer'] = true;
    allOperations['create_product'] = true;
    allOperations['edit_product'] = true;
    allOperations['receive_inventory'] = true;
    allOperations['view_products'] = true;
    allOperations['create_transaction'] = true;
    allOperations['view_reports'] = true;
    allOperations['view_users'] = true;
  } else if (role === 'cashier') {
    // Cashier has minimal permissions
    allOperations['access_pos'] = true;
    allOperations['access_inventory'] = true;
    allOperations['create_sale'] = true;
    allOperations['apply_discount'] = true;
    allOperations['access_cash_drawer'] = true;
    allOperations['view_products'] = true;
  }

  return allOperations;
}
