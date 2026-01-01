/**
 * Access Control Service
 * 
 * Unified access control service that consolidates:
 * - RolePermissionService (module access, operation permissions, limits)
 * - BranchAccessValidationService (branch access validation)
 * 
 * Features:
 * - Database-driven permissions (replaces hardcoded permissions)
 * - In-memory caching for performance
 * - Single entry point for all access control
 * - Unified error messages
 * 
 * Follows offline-first pattern: IndexedDB → Cache → Fast checks
 */

import { getDB } from '../lib/db';
import { permissionCache } from './permissionCache';
import { 
  ModuleName, 
  OperationName, 
  PermissionCache,
  Employee 
} from '../types';

export class AccessControlService {
  /**
   * Get hardcoded role defaults (fallback when role_permissions haven't synced yet)
   * This ensures admins get proper permissions even before sync completes
   */
  private static getHardcodedRoleDefaults(role: 'admin' | 'manager' | 'cashier' | 'super_admin'): Record<OperationName, boolean> {
    const defaults: Record<OperationName, boolean> = {
      // Module access
      access_pos: false,
      access_inventory: false,
      access_accounting: false,
      access_reports: false,
      access_settings: false,
      access_users: false,
      // POS operations
      create_sale: false,
      edit_sale: false,
      delete_sale: false,
      void_sale: false,
      refund_sale: false,
      apply_discount: false,
      override_price: false,
      access_cash_drawer: false,
      // Inventory operations
      create_product: false,
      edit_product: false,
      delete_product: false,
      receive_inventory: false,
      adjust_inventory: false,
      view_products: false,
      // Accounting operations
      create_transaction: false,
      edit_transaction: false,
      delete_transaction: false,
      view_reports: false,
      // User management operations
      create_user: false,
      edit_user: false,
      delete_user: false,
      view_users: false,
      manage_users: false
    };

    // Super admin: All permissions
    if (role === 'super_admin') {
      Object.keys(defaults).forEach(key => {
        defaults[key as OperationName] = true;
      });
      return defaults;
    }

    // Admin: Most permissions (all module access + most operations)
    if (role === 'admin') {
      // Module access
      defaults.access_pos = true;
      defaults.access_inventory = true;
      defaults.access_accounting = true;
      defaults.access_reports = true;
      defaults.access_settings = true;
      defaults.access_users = true;
      // POS operations
      defaults.create_sale = true;
      defaults.edit_sale = true;
      defaults.delete_sale = true;
      defaults.void_sale = true;
      defaults.refund_sale = true;
      defaults.apply_discount = true;
      defaults.override_price = true;
      defaults.access_cash_drawer = true;
      // Inventory operations
      defaults.create_product = true;
      defaults.edit_product = true;
      defaults.delete_product = true;
      defaults.receive_inventory = true;
      defaults.adjust_inventory = true;
      defaults.view_products = true;
      // Accounting operations
      defaults.create_transaction = true;
      defaults.edit_transaction = true;
      defaults.delete_transaction = true;
      defaults.view_reports = true;
      // User management
      defaults.create_user = true;
      defaults.edit_user = true;
      defaults.delete_user = true;
      defaults.view_users = true;
      defaults.manage_users = true;
      return defaults;
    }

    // Manager: Limited permissions
    if (role === 'manager') {
      // Module access
      defaults.access_pos = true;
      defaults.access_inventory = true;
      defaults.access_accounting = true;
      defaults.access_reports = true;
      // POS operations
      defaults.create_sale = true;
      defaults.edit_sale = true;
      defaults.void_sale = true;
      defaults.refund_sale = true;
      defaults.apply_discount = true;
      defaults.access_cash_drawer = true;
      // Inventory operations
      defaults.create_product = true;
      defaults.edit_product = true;
      defaults.receive_inventory = true;
      defaults.view_products = true;
      // Accounting operations
      defaults.create_transaction = true;
      defaults.view_reports = true;
      // User management (view only)
      defaults.view_users = true;
      return defaults;
    }

    // Cashier: Minimal permissions
    if (role === 'cashier') {
      // Module access
      defaults.access_pos = true;
      defaults.access_inventory = true;
      // POS operations
      defaults.create_sale = true;
      defaults.apply_discount = true;
      defaults.access_cash_drawer = true;
      // Inventory (view only)
      defaults.view_products = true;
      return defaults;
    }

    return defaults;
  }

  /**
   * Load all permissions for a user (for caching)
   * This is called once on login or when cache is invalidated
   */
  static async loadUserPermissions(
    userId: string,
    storeId: string
  ): Promise<PermissionCache> {
    // Check cache first
    const cached = permissionCache.get(userId, storeId);
    if (cached) {
      return cached;
    }

    // Load user
    const user = await getDB().users.get(userId);
    if (!user) {
      // User not synced yet - return minimal permissions (all false)
      // This allows the app to continue loading while sync completes in the background
      // Permissions will be refreshed once sync completes
      const minimalCache: PermissionCache = {
        userId,
        storeId,
        modules: {
          pos: false,
          inventory: false,
          accounting: false,
          reports: false,
          settings: false,
          users: false
        },
        operations: {} as Record<OperationName, boolean>,
        limits: {},
        branches: [],
        expiresAt: Date.now() + (5 * 60 * 1000) // 5 minutes
      };
      
      // Store minimal cache to prevent repeated lookups
      permissionCache.set(userId, storeId, {
        modules: minimalCache.modules,
        operations: minimalCache.operations,
        limits: minimalCache.limits,
        branches: minimalCache.branches
      });
      
      return minimalCache;
    }

    // Load role permissions (GLOBAL - no store_id filter)
    const rolePermissions = await getDB().role_permissions
      .where('role')
      .equals(user.role)
      .toArray();

    // Load user permission overrides
    const userPermissions = await getDB().user_permissions
      .where('[user_id+store_id]')
      .equals([userId, storeId])
      .toArray();

    // Build operations map (user overrides take priority)
    const operations: Record<OperationName, boolean> = {} as any;
    
    // First, apply role defaults
    if (rolePermissions.length > 0) {
      // Use database role permissions if available
      rolePermissions.forEach(rp => {
        if (!rp._deleted) {
          operations[rp.operation as OperationName] = rp.allowed;
        }
      });
    } else {
      // Fallback to hardcoded defaults if role_permissions haven't synced yet
      const hardcodedDefaults = this.getHardcodedRoleDefaults(user.role);
      Object.assign(operations, hardcodedDefaults);
      console.log(`⚠️ Role permissions not synced yet for role "${user.role}", using hardcoded defaults`);
    }

    // Then, apply user overrides
    userPermissions.forEach(up => {
      if (!up._deleted) {
        operations[up.operation as OperationName] = up.allowed;
      }
    });

    // Build modules map from operations
    const modules: Record<ModuleName, boolean> = {
      pos: operations['access_pos'] || false,
      inventory: operations['access_inventory'] || false,
      accounting: operations['access_accounting'] || false,
      reports: operations['access_reports'] || false,
      settings: operations['access_settings'] || false,
      users: operations['access_users'] || false
    };

    // Get accessible branches
    const branches = await this.getAccessibleBranches(userId, storeId, user.role, user.branch_id);

    // Build cache
    const cache: PermissionCache = {
      userId,
      storeId,
      modules,
      operations,
      limits: {},
      branches: branches.map(b => b.id),
      expiresAt: Date.now() + (5 * 60 * 1000) // 5 minutes
    };

    // Store in cache
    permissionCache.set(userId, storeId, {
      modules,
      operations,
      limits: {},
      branches: branches.map(b => b.id)
    });

    return cache;
  }

  /**
   * Check if user can access a specific module
   * Module access is treated as operations (access_pos, access_inventory, etc.)
   */
  static async checkModuleAccess(
    userId: string,
    storeId: string,
    module: ModuleName
  ): Promise<void> {
    const operation: OperationName = `access_${module}` as OperationName;
    await this.checkPermission(userId, storeId, operation);
  }

  /**
   * Check if user can access a module (non-throwing)
   */
  static async canAccessModule(
    userId: string,
    storeId: string,
    module: ModuleName
  ): Promise<boolean> {
    try {
      await this.checkModuleAccess(userId, storeId, module);
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Check if user has permission to perform an operation
   * Priority: User override > Role default > Denied
   */
  static async checkPermission(
    userId: string,
    storeId: string,
    operation: OperationName
  ): Promise<void> {
    // Check cache first
    const cached = permissionCache.checkOperation(userId, storeId, operation);
    if (cached !== null) {
      if (!cached) {
        throw new Error(
          `Permission denied: ${operation}. ` +
          `Contact an administrator if you need access.`
        );
      }
      return; // ✅ Permission granted
    }

    // Load user
    const user = await getDB().users.get(userId);
    if (!user) {
      throw new Error(`User not found: ${userId}`);
    }

    // Check for user-specific override
    const userPermission = await getDB().user_permissions
      .where('[user_id+store_id+operation]')
      .equals([userId, storeId, operation])
      .first();

    if (userPermission && !userPermission._deleted) {
      if (!userPermission.allowed) {
        throw new Error(
          `Permission denied: ${operation}. ` +
          `Contact an administrator if you need access.`
        );
      }
      return; // ✅ Permission granted via user override
    }

    // Check role default (GLOBAL - no store_id)
    const rolePermission = await getDB().role_permissions
      .where('[role+operation]')
      .equals([user.role, operation])
      .first();

    if (rolePermission && !rolePermission._deleted) {
      if (!rolePermission.allowed) {
        throw new Error(
          `Permission denied: ${operation}. ` +
          `Your role (${user.role}) does not have access to this operation. ` +
          `Contact an administrator if you need access.`
        );
      }
      return; // ✅ Permission granted via role default
    }

    // If role_permissions not found in DB, fallback to hardcoded defaults
    // This handles the case where role_permissions haven't synced yet
    const hardcodedDefaults = this.getHardcodedRoleDefaults(user.role);
    if (hardcodedDefaults[operation] === true) {
      console.log(`⚠️ Using hardcoded default for ${operation} (role_permissions not synced yet)`);
      return; // ✅ Permission granted via hardcoded default
    }

    // Super admin wildcard check (if role is super_admin, allow all)
    if (user.role === 'super_admin') {
      return; // ✅ Super admin has all permissions
    }

    // No permission found = denied
    throw new Error(
      `Permission denied: ${operation}. ` +
      `Your role (${user.role}) does not have access to this operation. ` +
      `Contact an administrator if you need access.`
    );
  }

  /**
   * Check if user can perform an operation (non-throwing)
   */
  static async canPerform(
    userId: string,
    storeId: string,
    operation: OperationName
  ): Promise<boolean> {
    try {
      await this.checkPermission(userId, storeId, operation);
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Get user's module access status for all modules
   * Used for UI (showing/hiding menu items)
   */
  static async getUserModuleAccess(
    userId: string,
    storeId: string,
    userRole?: 'admin' | 'manager' | 'cashier' | 'super_admin'
  ): Promise<Record<ModuleName, boolean>> {
    const cache = await this.loadUserPermissions(userId, storeId);
    return cache.modules;
  }

  // ============================================================================
  // BRANCH ACCESS METHODS (from BranchAccessValidationService)
  // ============================================================================

  /**
   * Validates if a user can access a specific branch
   */
  static async validateBranchAccess(
    userId: string,
    storeId: string,
    branchId: string,
    userRole?: 'admin' | 'manager' | 'cashier',
    userBranchId?: string | null,
    userName?: string
  ): Promise<void> {
    let role = userRole;
    let assignedBranchId = userBranchId;
    let name = userName;
    
    if (!role) {
      const user = await getDB().users.get(userId);
      if (!user) {
        throw new Error(`User not found: ${userId}`);
      }
      if (user.store_id !== storeId) {
        throw new Error(`User ${userId} does not belong to store ${storeId}`);
      }
      role = user.role;
      assignedBranchId = user.branch_id;
      name = user.name;
    }
    
    // Admin can access all branches
    if (role === 'admin') {
      const branch = await getDB().branches.get(branchId);
      if (!branch) {
        throw new Error(`Branch not found: ${branchId}`);
      }
      if (branch._deleted === true) {
        throw new Error(
          `Branch ${branch.name} (${branchId}) has been deleted. ` +
          `Operations on this branch are not allowed.`
        );
      }
      if (branch.store_id !== storeId) {
        throw new Error(`Branch ${branchId} does not belong to store ${storeId}`);
      }
      return;
    }
    
    // Manager/Cashier must have matching branch_id
    if (role === 'manager' || role === 'cashier') {
      if (!assignedBranchId) {
        throw new Error(
          `User ${name || userId} (${role}) does not have a branch assigned. ` +
          `Please contact an administrator to assign a branch.`
        );
      }
      if (assignedBranchId !== branchId) {
        const userBranch = await getDB().branches.get(assignedBranchId);
        const attemptedBranch = await getDB().branches.get(branchId);
        const userBranchName = userBranch?.name || assignedBranchId;
        const attemptedBranchName = attemptedBranch?.name || branchId;
        throw new Error(
          `Access denied: You can only access branch "${userBranchName}", ` +
          `but attempted to access branch "${attemptedBranchName}". ` +
          `Please contact an administrator if you need access to a different branch.`
        );
      }
      const branch = await getDB().branches.get(branchId);
      if (!branch) {
        throw new Error(`Branch not found: ${branchId}`);
      }
      if (branch._deleted === true) {
        throw new Error(
          `Access denied: Your assigned branch "${branch.name}" has been deleted. ` +
          `Please contact an administrator to be reassigned to a new branch.`
        );
      }
      if (branch.store_id !== storeId) {
        throw new Error(`Branch ${branchId} does not belong to store ${storeId}`);
      }
      return;
    }
    
    throw new Error(`Unknown user role: ${role}`);
  }

  /**
   * Check if user can access a branch (non-throwing)
   */
  static async canAccessBranch(
    userId: string,
    storeId: string,
    branchId: string
  ): Promise<boolean> {
    try {
      await this.validateBranchAccess(userId, storeId, branchId);
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Gets accessible branches for a user
   */
  static async getAccessibleBranches(
    userId: string,
    storeId: string,
    userRole?: 'admin' | 'manager' | 'cashier',
    userBranchId?: string | null
  ): Promise<Array<{ id: string; name: string }>> {
    let role = userRole;
    let branchId = userBranchId;
    
    if (!role) {
      const user = await getDB().users.get(userId);
      if (!user || user.store_id !== storeId) {
        return [];
      }
      role = user.role;
      branchId = user.branch_id;
    }
    
    if (role === 'admin') {
      await getDB().ensureOpen();
      const branches = await getDB().branches
        .where('store_id')
        .equals(storeId)
        .filter(b => !(b._deleted === true))
        .toArray();
      return branches.map(b => ({ id: b.id, name: b.name }));
    }
    
    if (role === 'manager' || role === 'cashier') {
      if (!branchId) {
        return [];
      }
      const branch = await getDB().branches.get(branchId);
      if (!branch || branch._deleted === true || branch.store_id !== storeId) {
        return [];
      }
      return [{ id: branch.id, name: branch.name }];
    }
    
    return [];
  }

  /**
   * Checks if user can switch branches (only admin)
   */
  static canSwitchBranches(user: Employee): boolean {
    return user.role === 'admin';
  }

  /**
   * Validates branch assignment when creating/updating user
   */
  static validateBranchAssignment(
    role: 'admin' | 'manager' | 'cashier',
    branchId: string | null
  ): void {
    if (role === 'admin') {
      if (branchId !== null) {
        throw new Error(
          'Admin users must have branch_id set to null. ' +
          'Admins can access all branches and do not need a specific branch assignment.'
        );
      }
    } else if (role === 'manager' || role === 'cashier') {
      if (!branchId) {
        throw new Error(
          `${role.charAt(0).toUpperCase() + role.slice(1)} users must have a branch_id assigned. ` +
          `Please select a branch when creating this user.`
        );
      }
    }
  }

  /**
   * Validates that a branch exists, is not deleted, and belongs to the store
   */
  static async validateBranchExists(
    branchId: string,
    storeId: string
  ): Promise<void> {
    const branch = await getDB().branches.get(branchId);
    if (!branch) {
      throw new Error(`Branch not found: ${branchId}`);
    }
    if (branch._deleted) {
      throw new Error(
        `Branch "${branch.name}" (${branchId}) has been deleted. ` +
        `Operations on this branch are not allowed.`
      );
    }
    if (branch.store_id !== storeId) {
      throw new Error(`Branch ${branchId} does not belong to store ${storeId}`);
    }
  }

  /**
   * Gets the user's assigned branch ID (for manager/cashier)
   */
  static async getUserBranchId(userId: string): Promise<string | null> {
    const user = await getDB().users.get(userId);
    if (!user) {
      throw new Error(`User not found: ${userId}`);
    }
    return user.branch_id || null;
  }

  /**
   * Checks if user has access to a branch (non-throwing version)
   */
  static async hasBranchAccess(
    userId: string,
    storeId: string,
    branchId: string
  ): Promise<boolean> {
    try {
      await this.validateBranchAccess(userId, storeId, branchId);
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Clear permission cache for a user (call after permission changes)
   */
  static clearCache(userId: string, storeId: string): void {
    permissionCache.clear(userId, storeId);
  }

  /**
   * Clear all permission caches
   */
  static clearAllCaches(): void {
    permissionCache.clearAll();
  }
}


