/**
 * Employee (users) domain layer for OfflineDataContext (§1.3).
 * Owns employees state and employee CRUD; composer calls hydrate() from refreshData.
 */

import { useState, useCallback } from 'react';
import { createId, getDB } from '../../lib/db';
import { crudHelperService } from '../../services/crudHelperService';
import { emitUserEvent, buildEventOptions } from '../../services/eventEmissionHelper';
import type { EmployeeDataLayerAdapter, EmployeeDataLayerResult, Tables } from './types';

function normalizeEmployeeBalances(e: any): Tables['users']['Row'] {
  return { ...e, lbp_balance: e.lbp_balance || 0, usd_balance: e.usd_balance || 0 } as Tables['users']['Row'];
}

export function useEmployeeDataLayer(adapter: EmployeeDataLayerAdapter): EmployeeDataLayerResult {
  const { storeId, currentBranchId, userProfileId, pushUndo, resetAutoSyncTimer } = adapter;
  const [employees, setEmployees] = useState<Tables['users']['Row'][]>([]);

  const hydrate = useCallback((employeesData: any[]) => {
    setEmployees((employeesData || []).map(normalizeEmployeeBalances));
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
    },
    [storeId, pushUndo, resetAutoSyncTimer]
  );

  return {
    employees,
    hydrate,
    addEmployee,
    updateEmployee,
    deleteEmployee,
  };
}
