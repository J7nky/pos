/**
 * Role Permission Service
 * 
 * @deprecated This service is deprecated. Use AccessControlService instead.
 * This service will be removed in a future version.
 * 
 * Validates permissions based on user role (admin/manager/cashier).
 * Checks operation limits from database for configurable restrictions.
 * Checks module access from database for per-user module permissions.
 * 
 * Pattern: Similar to BranchAccessValidationService
 * - Static methods for validation
 * - Throws descriptive errors on denial
 * - Hardcoded role permissions (no database lookup needed)
 * - Database lookup only for operation limits and module access
 * 
 * Follows offline-first pattern: IndexedDB → Supabase sync
 */

import { db } from '../lib/db';
import { OperationType, ModuleName } from '../types';

export class RolePermissionService {
  /**
   * Check if user can access a specific module
   * Priority: User-specific record > Role default (hardcoded)
   * Syncs across all devices via Supabase
   * 
   * @param userId - User ID
   * @param storeId - Store ID
   * @param module - Module name (pos, inventory, accounting, etc.)
   * @throws Error if access denied
   */
  static async checkModuleAccess(
    userId: string,
    storeId: string,
    module: ModuleName
  ): Promise<void> {
    const user = await db.users.get(userId);
    if (!user) {
      throw new Error(`User not found: ${userId}`);
    }

    // Check for user-specific module access record
    const moduleAccess = await db.user_module_access
      .where('[user_id+store_id+module]')
      .equals([userId, storeId, module])
      .first();

    if (moduleAccess) {
      // User has specific access record - use it
      if (!moduleAccess.can_access) {
        throw new Error(
          `Access denied: You do not have access to the ${module} module. ` +
          `Contact an administrator if you need access.`
        );
      }
      return; // ✅ Access granted via user-specific record
    }

    // No specific record - fall back to role defaults
    const hasRoleAccess = this.roleHasModuleAccess(user.role, module);
    if (!hasRoleAccess) {
      throw new Error(
        `Access denied: Your role (${user.role}) does not have access to the ${module} module. ` +
        `Contact an administrator if you need access.`
      );
    }
  }

  /**
   * Check if user's role allows a specific operation
   * @param userId - User ID
   * @param operation - Operation key (e.g., 'void_sale', 'delete_product')
   * @throws Error if permission denied
   */
  static async checkPermission(
    userId: string,
    operation: string
  ): Promise<void> {
    const user = await db.users.get(userId);
    if (!user) {
      throw new Error(`User not found: ${userId}`);
    }

    const allowed = this.isOperationAllowed(user.role, operation);
    
    if (!allowed) {
      throw new Error(
        `Permission denied: ${operation}. ` +
        `Your role (${user.role}) does not have access to this operation. ` +
        `Contact an administrator if you need access.`
      );
    }
  }

  /**
   * Check if operation value is within user's configured limits
   * Priority: User-specific override > Role default > Unlimited
   * 
   * @param userId - User ID
   * @param storeId - Store ID
   * @param operationType - Operation type (e.g., 'max_discount_percent')
   * @param value - Value to check against limit
   * @param currency - Currency for amount-based limits
   * @throws Error if limit exceeded
   */
  static async checkOperationLimit(
    userId: string,
    storeId: string,
    operationType: OperationType,
    value: number,
    currency?: 'USD' | 'LBP'
  ): Promise<void> {
    const user = await db.users.get(userId);
    if (!user) {
      throw new Error(`User not found: ${userId}`);
    }

    // Priority 1: Check for user-specific override
    const userLimits = await db.role_operation_limits
      .where('[store_id+user_id+operation_type]')
      .equals([storeId, userId, operationType])
      .toArray();

    let limit = userLimits[0];
    let isUserOverride = !!limit;

    // Priority 2: If no user override, check role default
    if (!limit) {
      const roleLimits = await db.role_operation_limits
        .where('[store_id+role+operation_type]')
        .equals([storeId, user.role, operationType])
        .filter(l => !l.user_id) // Only role defaults (user_id is NULL)
        .toArray();

      limit = roleLimits[0];
    }

    if (!limit) {
      // No limit configured = unlimited (allowed)
      return;
    }

    // Check currency match for amount-based limits
    if (limit.limit_currency && currency && limit.limit_currency !== currency) {
      return; // Different currency, not applicable
    }

    if (value > limit.limit_value) {
      throw new Error(
        `Operation limit exceeded: ${operationType}. ` +
        `Maximum allowed${isUserOverride ? ' for you' : ` for ${user.role}`}: ${limit.limit_value}${currency ? ' ' + currency : '%'}. ` +
        `Attempted: ${value}${currency ? ' ' + currency : '%'}.`
      );
    }
  }

  /**
   * Get user's module access status for all modules
   * Used for UI (showing/hiding menu items)
   * 
   * @param userId - User ID
   * @param storeId - Store ID
   * @param userRole - Optional user role (if provided, skips database lookup)
   * @returns Record of module access status
   */
  static async getUserModuleAccess(
    userId: string,
    storeId: string,
    userRole?: 'admin' | 'manager' | 'cashier'
  ): Promise<Record<ModuleName, boolean>> {
    let role = userRole;
    
    if (!role) {
      // Fallback to database lookup if role not provided
      const user = await db.users.get(userId);
      if (!user) {
        // If user not found and no role provided, return all false
        return {
          pos: false,
          inventory: false,
          accounting: false,
          reports: false,
          settings: false,
          users: false
        };
      }
      role = user.role;
    }

    // Get all user-specific module access records
    const userAccess = await db.user_module_access
      .where('[user_id+store_id]')
      .equals([userId, storeId])
      .toArray();

    const modules: ModuleName[] = ['pos', 'inventory', 'accounting', 'reports', 'settings', 'users'];
    const access: Record<ModuleName, boolean> = {} as any;

    for (const module of modules) {
      // Check for user-specific record
      const userRecord = userAccess.find(a => a.module === module);
      if (userRecord) {
        access[module] = userRecord.can_access;
      } else {
        // Fall back to role default
        access[module] = this.roleHasModuleAccess(role, module);
      }
    }

    return access;
  }

  /**
   * Get all configured operation limits for a user
   * Returns both role defaults and user overrides
   * 
   * @param userId - User ID
   * @param storeId - Store ID
   * @returns Array of operation limits with source (role/user)
   */
  static async getUserOperationLimits(
    userId: string,
    storeId: string
  ): Promise<Array<{
    operation_type: OperationType;
    limit_value: number;
    limit_currency?: 'USD' | 'LBP';
    source: 'role_default' | 'user_override';
  }>> {
    const user = await db.users.get(userId);
    if (!user) {
      return [];
    }

    // Get user-specific overrides
    const userOverrides = await db.role_operation_limits
      .where('[store_id+user_id+operation_type]')
      .between(
        [storeId, userId, ''],
        [storeId, userId, '\uffff']
      )
      .toArray();

    // Get role defaults
    const roleDefaults = await db.role_operation_limits
      .where('[store_id+role]')
      .equals([storeId, user.role])
      .filter(l => !l.user_id)
      .toArray();

    const limits: any[] = [];

    // Add user overrides first (they take priority)
    userOverrides.forEach(limit => {
      limits.push({
        operation_type: limit.operation_type as OperationType,
        limit_value: limit.limit_value,
        limit_currency: limit.limit_currency as 'USD' | 'LBP' | undefined,
        source: 'user_override' as const
      });
    });

    // Add role defaults (only if no user override exists)
    roleDefaults.forEach(limit => {
      const hasOverride = userOverrides.some(
        uo => uo.operation_type === limit.operation_type
      );
      if (!hasOverride) {
        limits.push({
          operation_type: limit.operation_type as OperationType,
          limit_value: limit.limit_value,
          limit_currency: limit.limit_currency as 'USD' | 'LBP' | undefined,
          source: 'role_default' as const
        });
      }
    });

    return limits;
  }

  /**
   * Hardcoded module access by role (fallback if no user-specific record)
   * Based on business requirements
   */
  private static roleHasModuleAccess(
    role: 'admin' | 'manager' | 'cashier' | 'super_admin',
    module: ModuleName
  ): boolean {
    const roleModuleAccess: Record<string, ModuleName[]> = {
      super_admin: ['pos', 'inventory', 'accounting', 'reports', 'settings', 'users'],
      admin: ['pos', 'inventory', 'accounting', 'reports', 'settings', 'users'],
      manager: ['pos', 'inventory', 'accounting', 'reports'], // No settings or users by default
      cashier: ['pos'] // Only POS access by default
    };

    return roleModuleAccess[role]?.includes(module) || false;
  }

  /**
   * Hardcoded operation permissions (no database needed)
   * Based on business requirements from FUTURE_IMPLEMENTATIONS.md
   */
  private static isOperationAllowed(
    role: 'admin' | 'manager' | 'cashier' | 'super_admin',
    operation: string
  ): boolean {
    const rolePermissions: Record<string, string[]> = {
      super_admin: ['*'], // Super admin has all permissions
      
      admin: [
        // POS
        'create_sale', 'edit_sale', 'delete_sale', 'void_sale', 'refund_sale',
        'apply_discount', 'override_price', 'access_cash_drawer',
        // Inventory
        'create_product', 'edit_product', 'delete_product',
        'receive_inventory', 'adjust_inventory',
        // Accounting
        'create_transaction', 'edit_transaction', 'delete_transaction',
        'view_reports',
        // Users
        'create_user', 'edit_user', 'delete_user'
      ],
      
      manager: [
        // POS
        'create_sale', 'edit_sale', 'void_sale', 'refund_sale',
        'apply_discount', 'access_cash_drawer',
        // Inventory
        'create_product', 'edit_product', 'receive_inventory',
        // Accounting
        'create_transaction', 'view_reports',
        // Users (view only)
        'view_users'
      ],
      
      cashier: [
        // POS (limited)
        'create_sale', 'apply_discount', 'access_cash_drawer',
        // Inventory (view only)
        'view_products',
        // No delete, void, or administrative operations
      ]
    };

    const permissions = rolePermissions[role] || [];
    
    // Super admin wildcard
    if (permissions.includes('*')) return true;
    
    return permissions.includes(operation);
  }

  /**
   * Get default module access for a role (for UI display)
   */
  static getDefaultModuleAccess(role: 'admin' | 'manager' | 'cashier' | 'super_admin'): Record<ModuleName, boolean> {
    const modules: ModuleName[] = ['pos', 'inventory', 'accounting', 'reports', 'settings', 'users'];
    const access: Record<ModuleName, boolean> = {} as any;

    for (const module of modules) {
      access[module] = this.roleHasModuleAccess(role, module);
    }

    return access;
  }
}

