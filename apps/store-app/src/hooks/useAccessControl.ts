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
import { useOfflineData } from '../contexts/OfflineDataContext';
import { AccessControlService } from '../services/accessControlService';
import { ModuleName, OperationName } from '../types';

export function useAccessControl() {
  const { userProfile } = useSupabaseAuth();
  // ✅ FIX 1: Wait for data to be ready before loading module access
  const { isDataReady } = useOfflineData();
  const [moduleAccess, setModuleAccess] = useState<Record<ModuleName, boolean>>({
    pos: false,
    inventory: false,
    accounting: false,
    reports: false,
    settings: false,
    users: false
  });
  const [loading, setLoading] = useState(true);

  // ✅ FIX 1: Load module access only after data is ready
  // This prevents queries to role_permissions/user_permissions tables before they're synced
  useEffect(() => {
    const loadModuleAccess = async () => {
      if (!userProfile) {
        setLoading(false);
        return;
      }
      
      // Wait for data to be ready before loading module access
      if (!isDataReady) {
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
  }, [userProfile, isDataReady]); // ✅ FIX 1: Include isDataReady in dependencies

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


