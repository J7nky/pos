/**
 * Employee and Branch CRUD operations (thinning OfflineDataContext).
 * addEmployee, updateEmployee, deleteEmployee, updateBranch.
 */

import { getDB, createId } from '../../../lib/db';
import type { Database } from '../../../types/database';
import { crudHelperService } from '../../../services/crudHelperService';

type UserInsert = Omit<Database['public']['Tables']['users']['Insert'], 'store_id'>;
type UserUpdate = Database['public']['Tables']['users']['Update'];

export interface EmployeeBranchDeps {
  storeId: string | null | undefined;
  currentBranchId: string | null;
  userProfileId: string | undefined;
  pushUndo: (undoData: any) => void;
  refreshData: () => Promise<void>;
  updateUnsyncedCount: () => Promise<void>;
  resetAutoSyncTimer: () => void;
  debouncedSync: () => void;
}

export async function addEmployee(deps: EmployeeBranchDeps, employeeData: UserInsert): Promise<void> {
  const { storeId, pushUndo, resetAutoSyncTimer } = deps;
  if (!storeId) throw new Error('No store ID available');

  const employeeId = (employeeData as any).id || createId();
  const dataWithId = { ...employeeData, id: employeeId };

  await crudHelperService.addEntity('users', storeId, dataWithId);

  pushUndo({
    type: 'add_employee',
    affected: [{ table: 'users', id: employeeId }],
    steps: [{ op: 'delete', table: 'users', id: employeeId }]
  });

  resetAutoSyncTimer();
}

export async function updateEmployee(deps: EmployeeBranchDeps, id: string, updates: UserUpdate): Promise<void> {
  const { pushUndo, resetAutoSyncTimer } = deps;

  const originalEmployee = await getDB().users.get(id);
  if (!originalEmployee) throw new Error('Employee not found');

  await crudHelperService.updateEntity('users', id, updates);

  const undoChanges: any = {};
  for (const key of Object.keys(updates)) {
    if (key !== '_synced' && key !== 'updated_at') {
      undoChanges[key] = (originalEmployee as any)[key];
    }
  }

  pushUndo({
    type: 'update_employee',
    affected: [{ table: 'users', id }],
    steps: [{ op: 'update', table: 'users', id, changes: undoChanges }]
  });

  resetAutoSyncTimer();
}

export async function deleteEmployee(deps: EmployeeBranchDeps, id: string): Promise<void> {
  const { pushUndo, resetAutoSyncTimer } = deps;

  const originalEmployee = await getDB().users.get(id);
  if (!originalEmployee) throw new Error('Employee not found');

  await crudHelperService.deleteEntity('users', id);

  pushUndo({
    type: 'delete_employee',
    affected: [{ table: 'users', id }],
    steps: [{ op: 'update', table: 'users', id, changes: { _deleted: false, _synced: false } }]
  });

  resetAutoSyncTimer();
}

export async function updateBranch(
  deps: EmployeeBranchDeps,
  id: string,
  updates: { name?: string; address?: string | null; phone?: string | null; logo?: string | null }
): Promise<void> {
  const { storeId, pushUndo, refreshData, updateUnsyncedCount, resetAutoSyncTimer, debouncedSync } = deps;

  const originalBranch = await getDB().branches.get(id);
  if (!originalBranch) throw new Error('Branch not found');

  const updatePayload: any = {
    ...originalBranch,
    ...updates,
    updated_at: new Date().toISOString(),
    _synced: false,
    _lastSyncedAt: originalBranch._lastSyncedAt
  };

  await getDB().branches.put(updatePayload);

  const updatedBranch = await getDB().branches.get(id);
  if (!updatedBranch) throw new Error('Branch was deleted after update');

  for (const key of Object.keys(updates)) {
    const expectedValue = updates[key as keyof typeof updates];
    const actualValue = (updatedBranch as any)[key];
    if (expectedValue !== actualValue) {
      console.warn(`⚠️ Field ${key} mismatch after update:`, { expected: expectedValue, actual: actualValue });
    }
  }

  console.log('✅ Branch update saved:', {
    id: updatedBranch.id,
    name: updatedBranch.name,
    _synced: updatedBranch._synced,
    _lastSyncedAt: updatedBranch._lastSyncedAt,
    updated_at: updatedBranch.updated_at
  });

  const undoChanges: any = {};
  for (const key of Object.keys(updates)) {
    undoChanges[key] = (originalBranch as any)[key];
  }

  pushUndo({
    type: 'update_branch',
    affected: [{ table: 'branches', id }],
    steps: [{ op: 'update', table: 'branches', id, changes: undoChanges }]
  });

  resetAutoSyncTimer();

  await new Promise(resolve => setTimeout(resolve, 50));
  await refreshData();
  await updateUnsyncedCount();
  debouncedSync();
}
