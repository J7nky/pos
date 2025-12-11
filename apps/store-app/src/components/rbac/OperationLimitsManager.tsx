/**
 * Operation Limits Manager Component
 * 
 * Allows admins to set operation limits for individual users.
 * Supports role defaults and user-specific overrides.
 * Syncs across all devices.
 * 
 * Usage: Embedded in Employees page when editing a user
 */

import { useState, useEffect } from 'react';
import { db } from '../../lib/db';
import { OperationType, RoleOperationLimit } from '../../types';
import { AlertCircle, DollarSign, Percent } from 'lucide-react';

interface OperationLimitsManagerProps {
  userId: string;
  userRole: 'admin' | 'manager' | 'cashier';
  storeId: string;
  onUpdate?: () => void;
}

interface LimitConfig {
  operation_type: OperationType;
  label: string;
  description: string;
  unit: 'percent' | 'amount';
  currency?: 'USD' | 'LBP';
  icon: any;
}

export function OperationLimitsManager({
  userId,
  userRole,
  storeId,
  onUpdate
}: OperationLimitsManagerProps) {
  const [limits, setLimits] = useState<Map<OperationType, {
    value: number;
    isCustom: boolean;
    roleDefault?: number;
  }>>(new Map());
  const [loading, setLoading] = useState(true);
  const [editingLimit, setEditingLimit] = useState<OperationType | null>(null);
  const [editValue, setEditValue] = useState<string>('');

  const limitConfigs: LimitConfig[] = [
    {
      operation_type: 'max_discount_percent',
      label: 'Max Discount',
      description: 'Maximum discount percentage allowed',
      unit: 'percent',
      icon: Percent
    },
    {
      operation_type: 'max_void_amount_usd',
      label: 'Max Void Amount (USD)',
      description: 'Maximum void transaction amount in USD',
      unit: 'amount',
      currency: 'USD',
      icon: DollarSign
    },
    {
      operation_type: 'max_void_amount_lbp',
      label: 'Max Void Amount (LBP)',
      description: 'Maximum void transaction amount in LBP',
      unit: 'amount',
      currency: 'LBP',
      icon: DollarSign
    },
    {
      operation_type: 'max_return_amount_usd',
      label: 'Max Return Amount (USD)',
      description: 'Maximum return/refund amount in USD',
      unit: 'amount',
      currency: 'USD',
      icon: DollarSign
    },
    {
      operation_type: 'max_return_amount_lbp',
      label: 'Max Return Amount (LBP)',
      description: 'Maximum return/refund amount in LBP',
      unit: 'amount',
      currency: 'LBP',
      icon: DollarSign
    }
  ];

  useEffect(() => {
    loadLimits();
  }, [userId, storeId, userRole]);

  const loadLimits = async () => {
    setLoading(true);
    try {
      const limitsMap = new Map();

      // Get user-specific limits
      const userLimits = await db.role_operation_limits
        .where('[store_id+user_id+operation_type]')
        .between(
          [storeId, userId, ''],
          [storeId, userId, '\uffff']
        )
        .toArray();

      // Get role default limits
      const roleDefaults = await db.role_operation_limits
        .where('[store_id+role]')
        .equals([storeId, userRole])
        .filter(l => !l.user_id)
        .toArray();

      // Build limits map
      limitConfigs.forEach(config => {
        const userLimit = userLimits.find(l => l.operation_type === config.operation_type);
        const roleDefault = roleDefaults.find(l => l.operation_type === config.operation_type);

        limitsMap.set(config.operation_type, {
          value: userLimit?.limit_value ?? roleDefault?.limit_value ?? 0,
          isCustom: !!userLimit,
          roleDefault: roleDefault?.limit_value
        });
      });

      setLimits(limitsMap);
    } catch (error) {
      console.error('Failed to load operation limits:', error);
    } finally {
      setLoading(false);
    }
  };

  const startEdit = (operationType: OperationType) => {
    const limit = limits.get(operationType);
    setEditingLimit(operationType);
    setEditValue(limit?.value?.toString() || '');
  };

  const saveLimit = async (operationType: OperationType) => {
    const value = parseFloat(editValue);
    if (isNaN(value) || value < 0) {
      alert('Please enter a valid positive number');
      return;
    }

    try {
      const config = limitConfigs.find(c => c.operation_type === operationType);
      
      const existingRecord = await db.role_operation_limits
        .where('[store_id+user_id+operation_type]')
        .equals([storeId, userId, operationType])
        .first();

      if (existingRecord) {
        // Update existing
        await db.role_operation_limits.update(existingRecord.id, {
          limit_value: value,
          updated_at: new Date().toISOString(),
          _synced: false
        });
      } else {
        // Create new
        await db.role_operation_limits.add({
          id: crypto.randomUUID(),
          store_id: storeId,
          role: userRole,
          user_id: userId,
          operation_type: operationType,
          limit_value: value,
          limit_currency: config?.currency,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
          _synced: false,
          _deleted: false
        });
      }

      setEditingLimit(null);
      setEditValue('');
      await loadLimits();
      onUpdate?.();
    } catch (error) {
      console.error('Failed to save limit:', error);
      alert('Failed to save limit. Please try again.');
    }
  };

  const removeLimit = async (operationType: OperationType) => {
    if (!confirm('Remove custom limit and use role default?')) return;

    try {
      const existingRecord = await db.role_operation_limits
        .where('[store_id+user_id+operation_type]')
        .equals([storeId, userId, operationType])
        .first();

      if (existingRecord) {
        await db.role_operation_limits.update(existingRecord.id, {
          _deleted: true,
          _synced: false,
          updated_at: new Date().toISOString()
        });
      }

      await loadLimits();
      onUpdate?.();
    } catch (error) {
      console.error('Failed to remove limit:', error);
    }
  };

  if (loading) {
    return <div className="text-center py-4">Loading operation limits...</div>;
  }

  return (
    <div className="space-y-4">
      <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4 mb-4">
        <div className="flex items-start">
          <AlertCircle className="w-5 h-5 text-yellow-600 mt-0.5 mr-2" />
          <div>
            <h3 className="font-medium text-yellow-900">Operation Limits</h3>
            <p className="text-sm text-yellow-700 mt-1">
              Set maximum values for sensitive operations. User-specific limits override role defaults.
            </p>
          </div>
        </div>
      </div>

      <div className="space-y-3">
        {limitConfigs.map((config) => {
          const limit = limits.get(config.operation_type);
          const isEditing = editingLimit === config.operation_type;
          const Icon = config.icon;

          return (
            <div
              key={config.operation_type}
              className={`border rounded-lg p-4 ${
                limit?.isCustom 
                  ? 'bg-yellow-50 border-yellow-300' 
                  : 'bg-white border-gray-200'
              }`}
            >
              <div className="flex items-center justify-between">
                <div className="flex-1">
                  <div className="flex items-center">
                    <Icon className="w-5 h-5 text-gray-500 mr-2" />
                    <h4 className="font-medium text-gray-900">{config.label}</h4>
                    {limit?.isCustom && (
                      <span className="ml-2 px-2 py-0.5 text-xs bg-yellow-200 text-yellow-800 rounded">
                        Custom
                      </span>
                    )}
                  </div>
                  <p className="text-sm text-gray-600 mt-1">{config.description}</p>
                  
                  <div className="mt-2 text-xs text-gray-500">
                    {limit?.roleDefault !== undefined && (
                      <span>
                        Role default ({userRole}): <span className="font-medium">
                          {limit.roleDefault}
                          {config.unit === 'percent' ? '%' : ` ${config.currency}`}
                        </span>
                      </span>
                    )}
                    {limit?.roleDefault === undefined && (
                      <span className="text-gray-400">No role default configured</span>
                    )}
                  </div>
                </div>

                <div className="flex items-center space-x-2">
                  {!isEditing ? (
                    <>
                      {/* Display current value */}
                      <div className="text-right">
                        <div className="text-lg font-bold text-gray-900">
                          {limit?.value || 0}
                          {config.unit === 'percent' ? '%' : ` ${config.currency}`}
                        </div>
                        {limit?.isCustom && (
                          <div className="text-xs text-yellow-600">Override</div>
                        )}
                      </div>

                      {/* Edit button */}
                      <button
                        type="button"
                        onClick={() => startEdit(config.operation_type)}
                        className="px-3 py-2 bg-blue-600 text-white rounded text-sm hover:bg-blue-700"
                      >
                        Edit
                      </button>

                      {/* Remove override button */}
                      {limit?.isCustom && (
                        <button
                          type="button"
                          onClick={() => removeLimit(config.operation_type)}
                          className="px-3 py-2 bg-gray-600 text-white rounded text-sm hover:bg-gray-700"
                          title="Remove custom limit"
                        >
                          Reset
                        </button>
                      )}
                    </>
                  ) : (
                    <>
                      {/* Edit mode */}
                      <input
                        type="number"
                        value={editValue}
                        onChange={(e) => setEditValue(e.target.value)}
                        className="w-24 px-2 py-1 border border-gray-300 rounded text-right"
                        placeholder="0"
                        autoFocus
                      />
                      <span className="text-sm text-gray-600">
                        {config.unit === 'percent' ? '%' : config.currency}
                      </span>
                      <button
                        type="button"
                        onClick={() => saveLimit(config.operation_type)}
                        className="px-3 py-2 bg-green-600 text-white rounded text-sm hover:bg-green-700"
                      >
                        Save
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setEditingLimit(null);
                          setEditValue('');
                        }}
                        className="px-3 py-2 bg-gray-300 text-gray-700 rounded text-sm hover:bg-gray-400"
                      >
                        Cancel
                      </button>
                    </>
                  )}
                </div>
              </div>
            </div>
          );
        })}
      </div>

      <div className="mt-4 p-3 bg-gray-50 rounded-lg text-sm text-gray-600">
        <strong>How it works:</strong>
        <ul className="list-disc ml-5 mt-2 space-y-1">
          <li>Custom limits override role defaults for this specific user</li>
          <li>If no custom limit is set, the role default applies</li>
          <li>If no limit configured, the operation is unlimited (if role allows it)</li>
          <li>Changes sync across all devices</li>
        </ul>
      </div>
    </div>
  );
}

