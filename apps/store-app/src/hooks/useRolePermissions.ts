/**
 * useRolePermissions Hook
 * 
 * React hook for easy permission checking in components.
 * Provides convenient methods to check module access, operations, and limits.
 */

import { useState, useEffect, useCallback } from 'react';
import { useSupabaseAuth } from '../contexts/SupabaseAuthContext';
import { RolePermissionService } from '../services/rolePermissionService';
import { ModuleName } from '../types';

export function useRolePermissions() {
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
        // Pass role directly to avoid database lookup (user might not be synced yet)
        const access = await RolePermissionService.getUserModuleAccess(
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
  const canPerform = useCallback(async (operation: string): Promise<boolean> => {
    if (!userProfile) return false;

    try {
      await RolePermissionService.checkPermission(userProfile.id, operation);
      return true;
    } catch {
      return false;
    }
  }, [userProfile]);

  /**
   * Simple role checks
   */
  const isAdmin = userProfile?.role === 'admin' || userProfile?.role === 'super_admin';
  const isManager = userProfile?.role === 'manager' || isAdmin;
  const isCashier = userProfile?.role === 'cashier';

  return {
    // Module access
    moduleAccess,
    canAccessModule,
    
    // Operation checks
    canPerform,
    
    // Role checks
    role: userProfile?.role,
    isAdmin,
    isManager,
    isCashier,
    
    // Loading state
    loading
  };
}


