/**
 * Module Access Manager Component
 * 
 * Allows admins to grant/revoke module access for individual users.
 * Syncs across all devices.
 * 
 * Usage: Embedded in Employees page when editing a user
 */

import { useState, useEffect } from 'react';
import { ModuleName, UserModuleAccess } from '../../types';
import { RolePermissionService } from '../../services/rolePermissionService';
import { useOfflineData } from '../../contexts/OfflineDataContext';
import { Check, X, Shield } from 'lucide-react';

interface ModuleAccessManagerProps {
  userId: string;
  userRole: 'admin' | 'manager' | 'cashier';
  storeId: string;
  onUpdate?: () => void;
}

export function ModuleAccessManager({
  userId,
  userRole,
  storeId,
  onUpdate
}: ModuleAccessManagerProps) {
  const { getUserModuleAccessOverrides, setUserModuleAccessOverride, removeUserModuleAccessOverride } = useOfflineData();
  const [moduleAccess, setModuleAccess] = useState<Record<ModuleName, {
    canAccess: boolean;
    isCustom: boolean;
    isDefault: boolean;
  }>>({} as any);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const modules: { name: ModuleName; label: string; description: string }[] = [
    { name: 'pos', label: 'POS (Point of Sale)', description: 'Sales, checkout, cash drawer' },
    { name: 'inventory', label: 'Inventory', description: 'Products, stock, receiving' },
    { name: 'accounting', label: 'Accounting', description: 'Transactions, payments, reports' },
    { name: 'reports', label: 'Reports', description: 'Analytics and reporting' },
    { name: 'settings', label: 'Settings', description: 'Store configuration' },
    { name: 'users', label: 'User Management', description: 'Manage employees' },
  ];

  useEffect(() => {
    loadModuleAccess();
  }, [userId, storeId]);

  const loadModuleAccess = async () => {
    setLoading(true);
    try {
      // Get role defaults
      const roleDefaults = RolePermissionService.getDefaultModuleAccess(userRole);

      // Get user-specific overrides (not deleted)
      const userOverrides = await getUserModuleAccessOverrides(userId, storeId);

      const access: any = {};
      modules.forEach(({ name }) => {
        const override = userOverrides.find(o => o.module === name);
        const roleDefault = roleDefaults[name];
        
        // Only consider it "custom" if there's an override AND it differs from role default
        const hasOverride = !!override;
        const isDifferentFromDefault = hasOverride && override.can_access !== roleDefault;
        
        access[name] = {
          canAccess: override ? override.can_access : roleDefault,
          isCustom: isDifferentFromDefault, // Only show as custom if it differs from default
          isDefault: !hasOverride
        };
      });

      setModuleAccess(access);
    } catch (error) {
      console.error('Failed to load module access:', error);
    } finally {
      setLoading(false);
    }
  };

  const toggleModuleAccess = async (module: ModuleName, canAccess: boolean) => {
    setSaving(true);
    try {
      console.log(`🔄 ${canAccess ? 'Granting' : 'Blocking'} ${module} access for user`);
      await setUserModuleAccessOverride({ userId, storeId, module, canAccess });
      console.log('✅ Module access updated in IndexedDB');
      await loadModuleAccess();
      
      onUpdate?.();
      
      console.log(`✅ Successfully ${canAccess ? 'granted' : 'blocked'} ${module} access`);
    } catch (error) {
      console.error('❌ Failed to update module access:', error);
      alert(`Failed to update module access: ${error instanceof Error ? error.message : 'Unknown error'}`);
    } finally {
      setSaving(false);
    }
  };

  const removeOverride = async (module: ModuleName) => {
    if (!confirm(`Remove custom permission for ${module} and restore role default?`)) {
      return;
    }

    setSaving(true);
    try {
      console.log('🗑️ Removing custom module access override for:', module);
      await removeUserModuleAccessOverride(userId, storeId, module);
      console.log('✅ Marked as deleted');
      await loadModuleAccess();
      
      // Call onUpdate callback
      if (onUpdate) {
        onUpdate();
      }
      
      console.log(`✅ Successfully removed custom permission for ${module}`);
    } catch (error) {
      console.error('❌ Failed to remove override:', error);
      alert(`Failed to remove override: ${error instanceof Error ? error.message : 'Unknown error'}`);
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return <div className="text-center py-4">Loading module access...</div>;
  }

  return (
    <div className="space-y-4">
      <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 mb-4">
        <div className="flex items-start">
          <Shield className="w-5 h-5 text-blue-600 mt-0.5 mr-2" />
          <div>
            <h3 className="font-medium text-blue-900">Module Access Control</h3>
            <p className="text-sm text-blue-700 mt-1">
              Control which modules this user can access. Changes sync across all devices.
            </p>
          </div>
        </div>
      </div>

      <div className="space-y-3">
        {modules.map(({ name, label, description }) => {
          const access = moduleAccess[name];
          const roleDefault = RolePermissionService.getDefaultModuleAccess(userRole)[name];

          return (
            <div
              key={name}
              className={`border rounded-lg p-4 transition-colors ${
                access.isCustom 
                  ? 'bg-yellow-50 border-yellow-300' 
                  : 'bg-white border-gray-200'
              }`}
            >
              <div className="flex items-center justify-between">
                <div className="flex-1">
                  <div className="flex items-center">
                    <h4 className="font-medium text-gray-900">{label}</h4>
                    {access.isCustom && (
                      <span className="ml-2 px-2 py-0.5 text-xs bg-yellow-200 text-yellow-800 rounded font-medium">
                        Custom Override
                      </span>
                    )}
                  </div>
                  <p className="text-sm text-gray-600 mt-1">{description}</p>
                  
                  <div className="mt-2 text-xs">
                    <span className="text-gray-500">
                      Default for <span className="font-medium text-gray-700">{userRole}</span>: {
                        roleDefault ? (
                          <span className="text-green-600 font-medium">✓ Allowed</span>
                        ) : (
                          <span className="text-red-600 font-medium">✗ Blocked</span>
                        )
                      }
                    </span>
                    {access.isCustom && (
                      <span className="ml-2 text-yellow-700 font-medium">
                        → Overridden to: {access.canAccess ? '✓ Allowed' : '✗ Blocked'}
                      </span>
                    )}
                  </div>
                </div>

                <div className="flex items-center space-x-2">
                  {/* Current Status */}
                  <div className={`px-3 py-2 rounded-lg font-medium ${
                    access.canAccess 
                      ? 'bg-green-100 text-green-700' 
                      : 'bg-red-100 text-red-700'
                  }`}>
                    {access.canAccess ? (
                      <span className="flex items-center">
                        <Check className="w-4 h-4 mr-1" />
                        Allowed
                      </span>
                    ) : (
                      <span className="flex items-center">
                        <X className="w-4 h-4 mr-1" />
                        Blocked
                      </span>
                    )}
                  </div>

                  {/* Action Buttons */}
                  <div className="flex space-x-2">
                    {!access.isCustom ? (
                      // No custom override - show Grant/Block buttons
                      <>
                        <button
                          type="button"
                          onClick={() => toggleModuleAccess(name, true)}
                          disabled={saving || roleDefault}
                          className={`px-3 py-2 rounded text-sm font-medium transition-colors ${
                            roleDefault
                              ? 'bg-gray-100 text-gray-400 cursor-not-allowed'
                              : 'bg-green-600 text-white hover:bg-green-700'
                          }`}
                        >
                          Grant
                        </button>
                        <button
                          type="button"
                          onClick={() => toggleModuleAccess(name, false)}
                          disabled={saving || !roleDefault}
                          className={`px-3 py-2 rounded text-sm font-medium transition-colors ${
                            !roleDefault
                              ? 'bg-gray-100 text-gray-400 cursor-not-allowed'
                              : 'bg-red-600 text-white hover:bg-red-700'
                          }`}
                        >
                          Block
                        </button>
                      </>
                    ) : (
                      // Has custom override - show Reset button only
                      <button
                        type="button"
                        onClick={() => removeOverride(name)}
                        disabled={saving}
                        className="px-4 py-2 rounded text-sm font-medium bg-gray-600 text-white hover:bg-gray-700 transition-colors"
                        title="Remove custom override and restore role default"
                      >
                        Reset to Default
                      </button>
                    )}
                  </div>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      <div className="mt-4 p-3 bg-gray-50 rounded-lg text-sm text-gray-600">
        <strong>Note:</strong> Changes sync across all devices. The user will see updated permissions on their next login or after refresh.
      </div>
    </div>
  );
}

