/**
 * ProtectedRoute Component
 * 
 * Protects routes based on module access permissions.
 * Checks if user has access to the module before rendering children.
 * Redirects to dashboard if access is denied.
 * 
 * Syncs across all devices - permissions checked from IndexedDB (synced from Supabase)
 */

import { ReactNode, useEffect, useState } from 'react';
import { Navigate } from 'react-router-dom';
import { useSupabaseAuth } from '../contexts/SupabaseAuthContext';
import { RolePermissionService } from '../services/rolePermissionService';
import { ModuleName } from '../types';

interface ProtectedRouteProps {
  module: ModuleName;
  fallback?: ReactNode;
  children: ReactNode;
}

export function ProtectedRoute({
  module,
  fallback,
  children
}: ProtectedRouteProps) {
  const { userProfile } = useSupabaseAuth();
  const [canAccess, setCanAccess] = useState<boolean | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const checkAccess = async () => {
      if (!userProfile) {
        setCanAccess(false);
        setLoading(false);
        return;
      }

      try {
        await RolePermissionService.checkModuleAccess(
          userProfile.id,
          userProfile.store_id,
          module
        );
        setCanAccess(true);
      } catch (error) {
        console.warn(`Access denied to ${module} module:`, error);
        setCanAccess(false);
      } finally {
        setLoading(false);
      }
    };

    checkAccess();
  }, [userProfile, module]);

  // Show loading spinner while checking permissions
  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  // Access denied - show fallback or redirect
  if (!canAccess) {
    if (fallback) {
      return <>{fallback}</>;
    }
    
    // Redirect to dashboard with error message
    return <Navigate to="/" replace />;
  }

  // Access granted - render children
  return <>{children}</>;
}

/**
 * Higher-order component version for route configuration
 * 
 * Usage in router:
 * <Route path="/inventory" element={withModuleProtection('inventory', <InventoryPage />)} />
 */
export function withModuleProtection(module: ModuleName, component: ReactNode) {
  return (
    <ProtectedRoute module={module}>
      {component}
    </ProtectedRoute>
  );
}

