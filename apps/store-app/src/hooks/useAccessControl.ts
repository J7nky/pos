/**
 * useAccessControl Hook
 * 
 * React hook for easy permission checking in components.
 * Provides convenient methods to check module access, operations, and limits.
 * Uses the unified AccessControlService with caching for performance.
 * 
 * Features:
 * - Automatic permission cache loading
 * - Synchronous checks after initial load
 * - Cache invalidation on sync
 */

import { useState, useEffect, useCallback } from 'react';
import { useSupabaseAuth } from '../contexts/SupabaseAuthContext';
import { AccessControlService } from '../services/accessControlService';
import { ModuleName, OperationName, OperationType } from '../types';

export function useAccessControl() {
  const { userProfile } = useSupabaseAuth();
  const [moduleAccess, setModuleAccess] = useState<Record<ModuleName, boolean>>({
    pos: false,
    inventory: false,
    accounting: false,
    reports: false,
    settings: false,
    users: false
  });
  const [loading, setLoading] = useState(true);

  // Load module access on mount or when user changes
  useEffect(() => {
    const loadModuleAccess = async () => {
      if (!userProfile) {
        setLoading(false);
        return;
      }

      try {
        // Load all permissions (includes module access)
        const access = await AccessControlService.getUserModuleAccess(
          userProfile.id,
          userProfile.store_id,
          userProfile.role
        );
        setModuleAccess(access);
      } catch (error) {
        console.error('Failed to load module access:', error);
      } finally {
        setLoading(false);
      }
    };

    loadModuleAccess();
  }, [userProfile]);

  /**
   * Check if user can access a specific module
   */
  const canAccessModule = useCallback((module: ModuleName): boolean => {
    return moduleAccess[module] === true;
  }, [moduleAccess]);

  /**
   * Check if user can perform an operation
   * Returns true if allowed, false if not
   */
  const canPerform = useCallback(async (operation: OperationName): Promise<boolean> => {
    if (!userProfile) return false;

    try {
      await AccessControlService.checkPermission(
        userProfile.id,
        userProfile.store_id,
        operation
      );
      return true;
    } catch {
      return false;
    }
  }, [userProfile]);

  /**
   * Check if operation is within limits
   * Returns true if within limits, false if exceeds
   */
  const checkLimit = useCallback(async (
    operationType: OperationType,
    value: number,
    currency?: 'USD' | 'LBP'
  ): Promise<{ allowed: boolean; error?: string }> => {
    if (!userProfile) {
      return { allowed: false, error: 'User not authenticated' };
    }

    try {
      await AccessControlService.checkOperationLimit(
        userProfile.id,
        userProfile.store_id,
        operationType,
        value,
        currency
      );
      return { allowed: true };
    } catch (error) {
      return {
        allowed: false,
        error: error instanceof Error ? error.message : 'Operation not allowed'
      };
    }
  }, [userProfile]);

  /**
   * Check and throw if not allowed (for use with try/catch)
   */
  const checkLimitOrThrow = useCallback(async (
    operationType: OperationType,
    value: number,
    currency?: 'USD' | 'LBP'
  ): Promise<void> => {
    if (!userProfile) {
      throw new Error('User not authenticated');
    }

    await AccessControlService.checkOperationLimit(
      userProfile.id,
      userProfile.store_id,
      operationType,
      value,
      currency
    );
  }, [userProfile]);

  /**
   * Check if user can access a branch
   */
  const canAccessBranch = useCallback(async (
    branchId: string
  ): Promise<boolean> => {
    if (!userProfile) return false;

    try {
      await AccessControlService.validateBranchAccess(
        userProfile.id,
        userProfile.store_id,
        branchId,
        userProfile.role,
        userProfile.branch_id,
        userProfile.name
      );
      return true;
    } catch {
      return false;
    }
  }, [userProfile]);

  /**
   * Check if user can switch branches (only admin)
   */
  const canSwitchBranches = useCallback((): boolean => {
    if (!userProfile) return false;
    return AccessControlService.canSwitchBranches({
      id: userProfile.id,
      role: userProfile.role,
      store_id: userProfile.store_id,
      branch_id: userProfile.branch_id,
      email: userProfile.email,
      name: userProfile.name
    } as any);
  }, [userProfile]);

  /**
   * Simple role checks (for backward compatibility)
   */
  const isAdmin = userProfile?.role === 'admin' || userProfile?.role === 'super_admin';
  const isManager = userProfile?.role === 'manager' || isAdmin;
  const isCashier = userProfile?.role === 'cashier';

  return {
    // Module access
    moduleAccess,
    canAccessModule,
    loading,
    
    // Operation permissions
    canPerform,
    
    // Operation limits
    checkLimit,
    checkLimitOrThrow,
    
    // Branch access
    canAccessBranch,
    canSwitchBranches,
    
    // Role checks (backward compatibility)
    isAdmin,
    isManager,
    isCashier,
    role: userProfile?.role,
    
    // User info
    userId: userProfile?.id,
    storeId: userProfile?.store_id,
    branchId: userProfile?.branch_id
  };
}


