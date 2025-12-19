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

import { db } from '../lib/db';
import { permissionCache } from './permissionCache';
import { 
  ModuleName, 
  OperationName, 
  OperationType, 
  PermissionCache,
  Employee 
} from '../types';

export class AccessControlService {
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
    const user = await db.users.get(userId);
    if (!user) {
      throw new Error(`User not found: ${userId}`);
    }

    // Load role permissions (GLOBAL - no store_id filter)
    const rolePermissions = await db.role_permissions
      .where('role')
      .equals(user.role)
      .toArray();

    // Load user permission overrides
    const userPermissions = await db.user_permissions
      .where('[user_id+store_id]')
      .equals([userId, storeId])
      .toArray();

    // Build operations map (user overrides take priority)
    const operations: Record<OperationName, boolean> = {} as any;
    
    // First, apply role defaults
    rolePermissions.forEach(rp => {
      if (!rp._deleted) {
        operations[rp.operation as OperationName] = rp.allowed;
      }
    });

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

    // Load operation limits
    const userLimits = await db.role_operation_limits
      .where('[store_id+user_id+operation_type]')
      .between(
        [storeId, userId, ''],
        [storeId, userId, '\uffff']
      )
      .toArray();

    const roleLimits = await db.role_operation_limits
      .where('[store_id+role]')
      .equals([storeId, user.role])
      .filter(l => !l.user_id && !l._deleted)
      .toArray();

    const limits: Record<OperationType, any> = {} as any;
    
    // Apply role defaults first
    roleLimits.forEach(limit => {
      limits[limit.operation_type] = {
        limit_value: limit.limit_value,
        limit_currency: limit.limit_currency,
        source: 'role_default' as const
      };
    });

    // Apply user overrides
    userLimits.forEach(limit => {
      if (!limit._deleted) {
        limits[limit.operation_type] = {
          limit_value: limit.limit_value,
          limit_currency: limit.limit_currency,
          source: 'user_override' as const
        };
      }
    });

    // Get accessible branches
    const branches = await this.getAccessibleBranches(userId, storeId, user.role, user.branch_id);

    // Build cache
    const cache: PermissionCache = {
      userId,
      storeId,
      modules,
      operations,
      limits,
      branches: branches.map(b => b.id),
      expiresAt: Date.now() + (5 * 60 * 1000) // 5 minutes
    };

    // Store in cache
    permissionCache.set(userId, storeId, {
      modules,
      operations,
      limits,
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
    const user = await db.users.get(userId);
    if (!user) {
      throw new Error(`User not found: ${userId}`);
    }

    // Check for user-specific override
    const userPermission = await db.user_permissions
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

    // Check role default
    const rolePermission = await db.role_permissions
      .where('[store_id+role+operation]')
      .equals([storeId, user.role, operation])
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
   * Check if operation value is within user's configured limits
   * Priority: User-specific override > Role default > Unlimited
   */
  static async checkOperationLimit(
    userId: string,
    storeId: string,
    operationType: OperationType,
    value: number,
    currency?: 'USD' | 'LBP'
  ): Promise<void> {
    // Check cache first
    const cachedLimit = permissionCache.getLimit(userId, storeId, operationType);
    if (cachedLimit) {
      if (cachedLimit.limit_currency && currency && cachedLimit.limit_currency !== currency) {
        return; // Different currency, not applicable
      }
      if (value > cachedLimit.limit_value) {
        throw new Error(
          `Operation limit exceeded: ${operationType}. ` +
          `Maximum allowed${cachedLimit.source === 'user_override' ? ' for you' : ''}: ${cachedLimit.limit_value}${currency ? ' ' + currency : '%'}. ` +
          `Attempted: ${value}${currency ? ' ' + currency : '%'}.`
        );
      }
      return; // ✅ Within limit
    }

    const user = await db.users.get(userId);
    if (!user) {
      throw new Error(`User not found: ${userId}`);
    }

    // Priority 1: Check for user-specific override
    const userLimits = await db.role_operation_limits
      .where('[store_id+user_id+operation_type]')
      .equals([storeId, userId, operationType])
      .filter(l => !l._deleted)
      .toArray();

    let limit = userLimits[0];
    let isUserOverride = !!limit;

    // Priority 2: If no user override, check role default
    if (!limit) {
      const roleLimits = await db.role_operation_limits
        .where('[store_id+role+operation_type]')
        .equals([storeId, user.role, operationType])
        .filter(l => !l.user_id && !l._deleted)
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
   */
  static async getUserModuleAccess(
    userId: string,
    storeId: string,
    userRole?: 'admin' | 'manager' | 'cashier' | 'super_admin'
  ): Promise<Record<ModuleName, boolean>> {
    const cache = await this.loadUserPermissions(userId, storeId);
    return cache.modules;
  }

  /**
   * Get all configured operation limits for a user
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
    const cache = await this.loadUserPermissions(userId, storeId);
    
    return Object.entries(cache.limits).map(([operationType, limit]) => ({
      operation_type: operationType as OperationType,
      limit_value: limit.limit_value,
      limit_currency: limit.limit_currency,
      source: limit.source
    }));
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
      const user = await db.users.get(userId);
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
      const branch = await db.branches.get(branchId);
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
        const userBranch = await db.branches.get(assignedBranchId);
        const attemptedBranch = await db.branches.get(branchId);
        const userBranchName = userBranch?.name || assignedBranchId;
        const attemptedBranchName = attemptedBranch?.name || branchId;
        throw new Error(
          `Access denied: You can only access branch "${userBranchName}", ` +
          `but attempted to access branch "${attemptedBranchName}". ` +
          `Please contact an administrator if you need access to a different branch.`
        );
      }
      const branch = await db.branches.get(branchId);
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
      const user = await db.users.get(userId);
      if (!user || user.store_id !== storeId) {
        return [];
      }
      role = user.role;
      branchId = user.branch_id;
    }
    
    if (role === 'admin') {
      await db.ensureOpen();
      const branches = await db.branches
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
      const branch = await db.branches.get(branchId);
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
    const branch = await db.branches.get(branchId);
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
    const user = await db.users.get(userId);
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


