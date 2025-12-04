/**
 * Branch Access Validation Service
 * 
 * Validates user access to branches based on role:
 * - Admin: Can access all branches (branch_id: null)
 * - Manager/Cashier: Can only access their assigned branch (branch_id: "branch-id")
 * 
 * This service enforces branch-level access control for all branch-scoped operations.
 */

import { db } from '../lib/db';
import { Employee } from '../types';

export class BranchAccessValidationService {
  /**
   * Validates if a user can access a specific branch
   * @param userId - User ID to validate
   * @param storeId - Store ID the branch belongs to
   * @param branchId - Branch ID to validate access for
   * @throws Error if access is denied with descriptive message
   */
  static async validateBranchAccess(
    userId: string,
    storeId: string,
    branchId: string
  ): Promise<void> {
    // Get user from database
    const user = await db.users.get(userId);
    
    if (!user) {
      throw new Error(`User not found: ${userId}`);
    }
    
    // Validate user belongs to store
    if (user.store_id !== storeId) {
      throw new Error(`User ${userId} does not belong to store ${storeId}`);
    }
    
    // Admin can access all branches
    if (user.role === 'admin') {
      // Still validate branch exists and is not deleted
      const branch = await db.branches.get(branchId);
      if (!branch) {
        throw new Error(`Branch not found: ${branchId}`);
      }
      
      if (branch._deleted) {
        throw new Error(
          `Branch ${branch.name} (${branchId}) has been deleted. ` +
          `Operations on this branch are not allowed.`
        );
      }
      
      if (branch.store_id !== storeId) {
        throw new Error(
          `Branch ${branchId} does not belong to store ${storeId}`
        );
      }
      
      return; // ✅ Access granted for admin
    }
    
    // Manager/Cashier must have matching branch_id
    if (user.role === 'manager' || user.role === 'cashier') {
      if (!user.branch_id) {
        throw new Error(
          `User ${user.name} (${user.role}) does not have a branch assigned. ` +
          `Please contact an administrator to assign a branch.`
        );
      }
      
      if (user.branch_id !== branchId) {
        // Get branch names for better error message
        const userBranch = await db.branches.get(user.branch_id);
        const attemptedBranch = await db.branches.get(branchId);
        
        const userBranchName = userBranch?.name || user.branch_id;
        const attemptedBranchName = attemptedBranch?.name || branchId;
        
        throw new Error(
          `Access denied: You can only access branch "${userBranchName}", ` +
          `but attempted to access branch "${attemptedBranchName}". ` +
          `Please contact an administrator if you need access to a different branch.`
        );
      }
      
      // Verify branch exists and is not deleted
      const branch = await db.branches.get(branchId);
      if (!branch) {
        throw new Error(`Branch not found: ${branchId}`);
      }
      
      if (branch._deleted) {
        throw new Error(
          `Access denied: Your assigned branch "${branch.name}" has been deleted. ` +
          `Please contact an administrator to be reassigned to a new branch.`
        );
      }
      
      // Verify branch belongs to store
      if (branch.store_id !== storeId) {
        throw new Error(
          `Branch ${branchId} does not belong to store ${storeId}`
        );
      }
      
      return; // ✅ Access granted for manager/cashier
    }
    
    // Unknown role
    throw new Error(`Unknown user role: ${(user as any).role}`);
  }
  
  /**
   * Gets accessible branches for a user
   * Returns all branches for admin, single branch for manager/cashier
   * @param userId - User ID
   * @param storeId - Store ID
   * @returns Array of accessible branches with id and name
   */
  static async getAccessibleBranches(
    userId: string,
    storeId: string
  ): Promise<Array<{ id: string; name: string }>> {
    const user = await db.users.get(userId);
    
    if (!user || user.store_id !== storeId) {
      return [];
    }
    
    // Admin can access all branches
    if (user.role === 'admin') {
      const branches = await db.branches
        .where('store_id')
        .equals(storeId)
        .filter(b => !b._deleted)
        .toArray();
      
      return branches.map(b => ({ id: b.id, name: b.name }));
    }
    
    // Manager/Cashier can only access their assigned branch
    if (user.role === 'manager' || user.role === 'cashier') {
      if (!user.branch_id) {
        return []; // No branch assigned
      }
      
      const branch = await db.branches.get(user.branch_id);
      if (!branch || branch._deleted || branch.store_id !== storeId) {
        return []; // Branch doesn't exist or is invalid
      }
      
      return [{ id: branch.id, name: branch.name }];
    }
    
    return [];
  }
  
  /**
   * Checks if user can switch branches (only admin)
   * @param user - User/Employee object
   * @returns true if user can switch branches, false otherwise
   */
  static canSwitchBranches(user: Employee): boolean {
    return user.role === 'admin';
  }
  
  /**
   * Validates branch assignment when creating/updating user
   * Ensures admin has branch_id = null, manager/cashier has valid branch_id
   * @param role - User role
   * @param branchId - Branch ID to assign (null for admin)
   * @throws Error if assignment is invalid
   */
  static validateBranchAssignment(
    role: 'admin' | 'manager' | 'cashier',
    branchId: string | null
  ): void {
    if (role === 'admin') {
      // Admin should have branch_id = null
      if (branchId !== null) {
        throw new Error(
          'Admin users must have branch_id set to null. ' +
          'Admins can access all branches and do not need a specific branch assignment.'
        );
      }
    } else if (role === 'manager' || role === 'cashier') {
      // Manager/Cashier must have a branch_id
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
   * @param branchId - Branch ID to validate
   * @param storeId - Store ID the branch should belong to
   * @throws Error if branch is invalid
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
      throw new Error(
        `Branch ${branchId} does not belong to store ${storeId}`
      );
    }
  }
  
  /**
   * Gets the user's assigned branch ID (for manager/cashier)
   * Returns null for admin
   * @param userId - User ID
   * @returns Branch ID or null
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
   * Useful for UI checks where you don't want to throw errors
   * @param userId - User ID
   * @param storeId - Store ID
   * @param branchId - Branch ID to check
   * @returns true if user has access, false otherwise
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
}

