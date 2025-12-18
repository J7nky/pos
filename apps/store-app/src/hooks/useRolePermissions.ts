/**
 * useRolePermissions Hook
 * 
 * React hook for easy permission checking in components.
 * Provides convenient methods to check module access, operations, and limits.
 */

import { useState, useEffect, useCallback } from 'react';
import { useSupabaseAuth } from '../contexts/SupabaseAuthContext';
import { RolePermissionService } from '../services/rolePermissionService';
import { ModuleName, OperationType } from '../types';

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
   * Check if operation is within limits
   * Returns true if within limits, false if exceeds
   * @param operationType - Type of operation (e.g., 'max_discount_percent')
   * @param value - Value to check
   * @param currency - Currency for amount-based limits
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
      await RolePermissionService.checkOperationLimit(
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
   * @param operationType - Type of operation
   * @param value - Value to check
   * @param currency - Currency for amount-based limits
   */
  const checkLimitOrThrow = useCallback(async (
    operationType: OperationType,
    value: number,
    currency?: 'USD' | 'LBP'
  ): Promise<void> => {
    if (!userProfile) {
      throw new Error('User not authenticated');
    }

    await RolePermissionService.checkOperationLimit(
      userProfile.id,
      userProfile.store_id,
      operationType,
      value,
      currency
    );
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
    
    // Limit checks
    checkLimit,
    checkLimitOrThrow,
    
    // Role checks
    role: userProfile?.role,
    isAdmin,
    isManager,
    isCashier,
    
    // Loading state
    loading
  };
}

/**
 * Example usage in components:
 * 
 * function POSPage() {
 *   const { checkLimit, isAdmin } = useRolePermissions();
 * 
 *   const handleApplyDiscount = async (discountPercent: number) => {
 *     const { allowed, error } = await checkLimit('max_discount_percent', discountPercent);
 *     if (!allowed) {
 *       toast.error(error);
 *       return;
 *     }
 *     // Apply discount...
 *   };
 * 
 *   return (
 *     <div>
 *       {isAdmin && <DeleteButton />}
 *     </div>
 *   );
 * }
 */

