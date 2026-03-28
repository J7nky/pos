/**
 * Branch domain layer for OfflineDataContext (§1.3).
 * Owns branches state and updateBranch; composer loads branches and calls hydrate() from refreshData.
 */

import { useState, useCallback } from 'react';
import { getDB } from '../../lib/db';
import { emitBranchEvent, buildEventOptions } from '../../services/eventEmissionHelper';
import type { BranchDataLayerAdapter, BranchDataLayerResult } from './types';
import type { Branch } from '../../types';

export function useBranchDataLayer(adapter: BranchDataLayerAdapter): BranchDataLayerResult {
  const { storeId, userProfileId, pushUndo, resetAutoSyncTimer, refreshData, updateUnsyncedCount, debouncedSync } = adapter;
  const [branches, setBranches] = useState<Branch[]>([]);

  const hydrate = useCallback((branchesData: Branch[]) => {
    setBranches(branchesData || []);
  }, []);

  const updateBranch = useCallback(
    async (
      id: string,
      updates: { name?: string; address?: string | null; phone?: string | null; logo?: string | null }
    ): Promise<void> => {
      const originalBranch = await getDB().branches.get(id);
      if (!originalBranch) throw new Error('Branch not found');

      const updatePayload = {
        ...originalBranch,
        ...updates,
        updated_at: new Date().toISOString(),
        _synced: false,
        _lastSyncedAt: originalBranch._lastSyncedAt,
      };

      await getDB().branches.put(updatePayload);

      const updatedBranch = await getDB().branches.get(id);
      if (!updatedBranch) throw new Error('Branch was deleted after update');

      const undoChanges: Record<string, unknown> = {};
      for (const key of Object.keys(updates)) {
        undoChanges[key] = (originalBranch as Record<string, unknown>)[key];
      }

      pushUndo({
        type: 'update_branch',
        affected: [{ table: 'branches', id }],
        steps: [{ op: 'update', table: 'branches', id, changes: undoChanges }],
      });

      resetAutoSyncTimer();

      await emitBranchEvent(
        buildEventOptions(storeId!, id, userProfileId, 'update', {
          fields_changed: Object.keys(updates),
        })
      );

      await new Promise((resolve) => setTimeout(resolve, 50));
      await refreshData();
      await updateUnsyncedCount();
      debouncedSync();
    },
    [storeId, userProfileId, pushUndo, resetAutoSyncTimer, refreshData, updateUnsyncedCount, debouncedSync]
  );

  return {
    branches,
    hydrate,
    updateBranch,
  };
}
