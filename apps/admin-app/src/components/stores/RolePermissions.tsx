import { useState, useEffect } from 'react';
import { Shield, Save, RefreshCw, Check, X } from 'lucide-react';
import {
  getRolePermissionsByRole,
  bulkUpdateRolePermissions,
  OPERATION_GROUPS,
  getDefaultOperationsForRole,
} from '../../services/rolePermissionService';
import { Button, Card, useToast } from '../ui';

type Role = 'admin' | 'manager' | 'cashier' | 'super_admin';

export default function RolePermissions() {
  const toast = useToast();
  const [selectedRole, setSelectedRole] = useState<Role>('admin');
  const [permissions, setPermissions] = useState<Record<string, boolean>>({});
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [hasChanges, setHasChanges] = useState(false);
  const [originalPermissions, setOriginalPermissions] = useState<Record<string, boolean>>({});

  // Load permissions when role changes
  useEffect(() => {
    loadPermissions();
  }, [selectedRole]);

  const loadPermissions = async () => {
    setIsLoading(true);
    try {
      const rolePermissions = await getRolePermissionsByRole(selectedRole);
      
      // Build permissions map
      const permissionsMap: Record<string, boolean> = {};
      
      // Initialize with defaults
      const defaults = getDefaultOperationsForRole(selectedRole);
      Object.keys(defaults).forEach((op) => {
        permissionsMap[op] = defaults[op];
      });
      
      // Override with database values
      rolePermissions.forEach((perm) => {
        permissionsMap[perm.operation] = perm.allowed;
      });
      
      setPermissions(permissionsMap);
      setOriginalPermissions({ ...permissionsMap });
      setHasChanges(false);
    } catch (error: any) {
      console.error('Error loading permissions:', error);
      toast.error('Failed to load permissions', error.message);
    } finally {
      setIsLoading(false);
    }
  };

  const handleTogglePermission = (operation: string) => {
    setPermissions((prev) => {
      const updated = { ...prev, [operation]: !prev[operation] };
      setHasChanges(JSON.stringify(updated) !== JSON.stringify(originalPermissions));
      return updated;
    });
  };

  const handleSave = async () => {
    setIsSaving(true);
    try {
      await bulkUpdateRolePermissions(selectedRole, permissions);
      setOriginalPermissions({ ...permissions });
      setHasChanges(false);
      toast.success('Permissions updated successfully', `Global permissions for ${selectedRole} role have been saved. These apply to all stores.`);
    } catch (error: any) {
      console.error('Error saving permissions:', error);
      toast.error('Failed to save permissions', error.message);
    } finally {
      setIsSaving(false);
    }
  };

  const handleReset = () => {
    setPermissions({ ...originalPermissions });
    setHasChanges(false);
  };

  const handleResetToDefaults = () => {
    const defaults = getDefaultOperationsForRole(selectedRole);
    setPermissions(defaults);
    setHasChanges(JSON.stringify(defaults) !== JSON.stringify(originalPermissions));
  };

  const roles: Array<{ value: Role; label: string }> = [
    { value: 'super_admin', label: 'Super Admin' },
    { value: 'admin', label: 'Admin' },
    { value: 'manager', label: 'Manager' },
    { value: 'cashier', label: 'Cashier' },
  ];

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <RefreshCw className="w-8 h-8 animate-spin text-gray-400" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 bg-purple-100 rounded-lg flex items-center justify-center">
            <Shield className="w-5 h-5 text-purple-600" />
          </div>
          <div>
            <h2 className="text-xl font-semibold text-gray-900">Role Permissions</h2>
            <p className="text-sm text-gray-500">Manage global permissions for each role (applies to all stores)</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={handleResetToDefaults}>
            Reset to Defaults
          </Button>
          {hasChanges && (
            <Button variant="outline" size="sm" onClick={handleReset}>
              Cancel
            </Button>
          )}
          <Button
            size="sm"
            onClick={handleSave}
            disabled={!hasChanges || isSaving}
            leftIcon={isSaving ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
          >
            {isSaving ? 'Saving...' : 'Save Changes'}
          </Button>
        </div>
      </div>

      {/* Role Selector */}
      <div className="flex gap-2">
        {roles.map((role) => (
          <button
            key={role.value}
            onClick={() => setSelectedRole(role.value)}
            className={`px-4 py-2 rounded-lg font-medium transition-colors ${
              selectedRole === role.value
                ? 'bg-purple-600 text-white'
                : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
            }`}
          >
            {role.label}
          </button>
        ))}
      </div>

      {/* Permissions Grid */}
      <div className="space-y-6">
        {OPERATION_GROUPS.map((group) => (
          <Card key={group.category} className="p-6">
            <h3 className="text-lg font-semibold text-gray-900 mb-4">{group.category}</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
              {group.operations.map((op) => {
                const isAllowed = permissions[op.operation] || false;
                return (
                  <label
                    key={op.operation}
                    className={`flex items-center gap-3 p-3 rounded-lg border-2 cursor-pointer transition-colors ${
                      isAllowed
                        ? 'border-green-200 bg-green-50'
                        : 'border-gray-200 bg-white hover:border-gray-300'
                    }`}
                  >
                    <input
                      type="checkbox"
                      checked={isAllowed}
                      onChange={() => handleTogglePermission(op.operation)}
                      className="w-5 h-5 text-purple-600 rounded focus:ring-purple-500"
                    />
                    <div className="flex-1">
                      <div className="flex items-center gap-2">
                        <span className="font-medium text-gray-900">{op.label}</span>
                        {isAllowed ? (
                          <Check className="w-4 h-4 text-green-600" />
                        ) : (
                          <X className="w-4 h-4 text-gray-400" />
                        )}
                      </div>
                      {op.description && (
                        <p className="text-xs text-gray-500 mt-1">{op.description}</p>
                      )}
                    </div>
                  </label>
                );
              })}
            </div>
          </Card>
        ))}
      </div>

      {/* Info Box */}
      <Card className="p-4 bg-blue-50 border-blue-200">
        <p className="text-sm text-blue-800">
          <strong>Note:</strong> These are <strong>global</strong> default permissions for the {selectedRole} role and apply to <strong>all stores</strong>. Individual users can have
          their permissions overridden in the Users tab. Changes will apply to all users with this role across all stores who don't have
          custom permissions set.
        </p>
      </Card>
    </div>
  );
}

