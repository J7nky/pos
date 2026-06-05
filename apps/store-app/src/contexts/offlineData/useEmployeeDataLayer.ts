/**
 * Employee (users) domain layer for OfflineDataContext (§1.3).
 * Owns employees state and employee CRUD; composer calls hydrate() from refreshData.
 */

import { useState, useCallback } from 'react';
import { createId, getDB } from '../../lib/db';
import { crudHelperService } from '../../services/crudHelperService';
import { emitUserEvent, buildEventOptions } from '../../services/eventEmissionHelper';
import { auditService } from '../../services/auditService';
import { sameRowList } from '../../utils/rowListEquality';
import type { EmployeeDataLayerAdapter, EmployeeDataLayerResult, Tables } from './types';

function normalizeEmployeeBalances(e: any): Tables['users']['Row'] {
  return { ...e, lbp_balance: e.lbp_balance || 0, usd_balance: e.usd_balance || 0 } as Tables['users']['Row'];
}

/** Credential fields whose values must never be written into the audit trail. */
const SENSITIVE_USER_FIELDS = new Set(['password', 'password_hash', 'pin', 'pin_hash', 'auth_id']);

/** Strip credential keys from an update patch before diffing for the audit log. */
function redactSensitive(updates: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(updates)) {
    if (!SENSITIVE_USER_FIELDS.has(k)) out[k] = v;
  }
  return out;
}

export function useEmployeeDataLayer(adapter: EmployeeDataLayerAdapter): EmployeeDataLayerResult {
  const { storeId, currentBranchId, userProfileId, pushUndo, resetAutoSyncTimer } = adapter;
  const [employees, setEmployees] = useState<Tables['users']['Row'][]>([]);

  const hydrate = useCallback((employeesData: any[]) => {
    const normalized = (employeesData || []).map(normalizeEmployeeBalances);
    setEmployees(prev => (sameRowList(prev, normalized) ? prev : normalized));
  }, []);

  const addEmployee = useCallback(
    async (employeeData: Omit<Tables['users']['Insert'], 'store_id'>): Promise<void> => {
      if (!storeId) throw new Error('No store ID available');

      const employeeId = employeeData.id || createId();
      const dataWithId = { ...employeeData, id: employeeId };

      await crudHelperService.addEntity('users', storeId, dataWithId);

      pushUndo({
        type: 'add_employee',
        affected: [{ table: 'users', id: employeeId }],
        steps: [{ op: 'delete', table: 'users', id: employeeId }],
      });

      resetAutoSyncTimer();

      await auditService.record({
        storeId, branchId: currentBranchId, changedBy: userProfileId,
        entityType: 'user', entityId: employeeId, action: 'create',
        changeReason: 'Employee created',
      });

      await emitUserEvent(
        employeeId,
        buildEventOptions(storeId, currentBranchId, userProfileId, 'create')
      );
    },
    [storeId, currentBranchId, userProfileId, pushUndo, resetAutoSyncTimer]
  );

  const updateEmployee = useCallback(
    async (id: string, updates: Tables['users']['Update']): Promise<void> => {
      const originalEmployee = await getDB().users.get(id);
      if (!originalEmployee) throw new Error('Employee not found');

      await crudHelperService.updateEntity('users', id, updates);

      const undoChanges: Record<string, unknown> = {};
      for (const key of Object.keys(updates)) {
        if (key !== '_synced' && key !== 'updated_at') {
          undoChanges[key] = (originalEmployee as Record<string, unknown>)[key];
        }
      }

      pushUndo({
        type: 'update_employee',
        affected: [{ table: 'users', id }],
        steps: [{ op: 'update', table: 'users', id, changes: undoChanges }],
      });

      resetAutoSyncTimer();

      const userChanges = auditService.diffUpdates(
        originalEmployee,
        redactSensitive(updates as Record<string, unknown>)
      );
      if (userChanges.length > 0) {
        await auditService.record({
          storeId, branchId: currentBranchId, changedBy: userProfileId,
          entityType: 'user', entityId: id, action: 'update',
          changes: userChanges,
        });
      }

      await emitUserEvent(
        id,
        buildEventOptions(storeId!, currentBranchId, userProfileId, 'update', {
          fields_changed: Object.keys(updates),
        })
      );
    },
    [storeId, currentBranchId, userProfileId, pushUndo, resetAutoSyncTimer]
  );

  const deleteEmployee = useCallback(
    async (id: string): Promise<void> => {
      const originalEmployee = await getDB().users.get(id);
      if (!originalEmployee) throw new Error('Employee not found');

      await crudHelperService.deleteEntity('users', id);

      pushUndo({
        type: 'delete_employee',
        affected: [{ table: 'users', id }],
        steps: [
          {
            op: 'update',
            table: 'users',
            id,
            changes: { _deleted: false, _synced: false },
          },
        ],
      });

      resetAutoSyncTimer();

      await auditService.record({
        storeId, branchId: currentBranchId, changedBy: userProfileId,
        entityType: 'user', entityId: id, action: 'delete',
        changeReason: 'Employee deleted',
      });
    },
    [storeId, currentBranchId, userProfileId, pushUndo, resetAutoSyncTimer]
  );

  return {
    employees,
    hydrate,
    addEmployee,
    updateEmployee,
    deleteEmployee,
  };
}
