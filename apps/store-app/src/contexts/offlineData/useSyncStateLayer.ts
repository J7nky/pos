/**
 * Sync state domain layer for OfflineDataContext (§1.3).
 * Provides performSync, debouncedSync, resetAutoSyncTimer, updateUnsyncedCount, getSyncStatus.
 * State (unsyncedCount, isSyncing, lastSync, isAutoSyncing) stays in context; adapter passes state + setters.
 * Wires crudHelperService.setCallbacks so other layers trigger refresh/sync via these callbacks.
 */

import { useCallback, useEffect } from 'react';
import { syncService } from '../../services/syncService';
import { crudHelperService } from '../../services/crudHelperService';
import type { SyncStateLayerAdapter, SyncStateLayerResult } from './types';
import type { SyncResult } from '../../services/syncService';
import { invalidateCashDrawerBalanceCache } from '../../utils/cacheManager';

function debug(...args: unknown[]) {
  if (typeof window !== 'undefined' && (window as any).__DEBUG_OFFLINE) {
    console.log(...args);
  }
}

export function useSyncStateLayer(adapter: SyncStateLayerAdapter): SyncStateLayerResult {
  const {
    storeId,
    currentBranchId,
    isOnline,
    refreshData,
    setLoading,
    userProfile,
    checkUndoValidity,
    unsyncedCount,
    isSyncing,
    lastSync,
    isAutoSyncing,
    setUnsyncedCount,
    setLastSync,
    setIsSyncing,
    setIsAutoSyncing,
    debouncedSyncTimeout,
    setDebouncedSyncTimeout,
    autoSyncTimerRef,
  } = adapter;

  const updateUnsyncedCount = useCallback(async () => {
    try {
      const { total, byTable } = await crudHelperService.getUnsyncedCount();
      const unsyncedTables = Object.entries(byTable)
        .filter(([_, count]) => count > 0)
        .map(([table, count]) => ({ table, count }));
      if (unsyncedTables.length > 0) {
        debug('🔍 Unsynced records by table:', unsyncedTables);
        const detailedCount = await crudHelperService.getDetailedUnsyncedCount();
        if (total > 0) {
          console.log('🔍 [COUNT-DEBUG] Detailed breakdown:', detailedCount.summary);
        }
      }
      setUnsyncedCount(total);
    } catch (error) {
      console.error('Error counting unsynced records:', error);
    }
  }, [setUnsyncedCount]);

  const getCurrentUnsyncedCount = useCallback(async (): Promise<number> => {
    try {
      const { total } = await crudHelperService.getUnsyncedCount();
      return total;
    } catch (error) {
      console.error('Error counting unsynced records:', error);
      return 0;
    }
  }, []);

  const performSync = useCallback(
    async (isAutomatic = false): Promise<SyncResult> => {
      if (!storeId || !currentBranchId || isSyncing) {
        console.log('⏭️  [SYNC] Skipping sync:', {
          hasStoreId: !!storeId,
          hasCurrentBranchId: !!currentBranchId,
          isSyncing,
        });
        return {
          success: false,
          errors: ['No store ID, branch ID, or sync in progress'],
          synced: { uploaded: 0, downloaded: 0 },
          conflicts: 0,
        };
      }

      try {
        const { eventStreamService } = await import('../../services/eventStreamService');
        let waitCount = 0;
        const maxWait = 10;
        while (eventStreamService.isProcessingEvents(currentBranchId) && waitCount < maxWait) {
          console.log(`⏳ [SYNC] Waiting for event stream to finish processing (attempt ${waitCount + 1}/${maxWait})...`);
          await new Promise((resolve) => setTimeout(resolve, 100));
          waitCount++;
        }
        if (waitCount > 0) {
          console.log('✅ [SYNC] Event stream finished processing, proceeding with sync');
        }
      } catch (error) {
        console.warn('⚠️ [SYNC] Could not check event stream status, proceeding anyway:', error);
      }

      console.log(`🔄 [SYNC] Starting ${isAutomatic ? 'AUTO' : 'MANUAL'} sync at ${new Date().toLocaleTimeString()}`);
      setIsSyncing(true);
      setIsAutoSyncing(isAutomatic);
      setLoading((prev: any) => ({ ...prev, sync: true }));

      try {
        const syncStartTime = Date.now();
        const result = await syncService.sync(storeId, currentBranchId);
        const syncDuration = Date.now() - syncStartTime;

        setLastSync(new Date());
        console.log(`✅ [SYNC] Sync completed in ${syncDuration}ms:`, {
          success: result.success,
          uploaded: result.synced.uploaded,
          downloaded: result.synced.downloaded,
          conflicts: result.conflicts,
          errors: result.errors.length > 0 ? result.errors : 'none',
        });

        if (result.success || result.synced.uploaded > 0 || result.synced.downloaded > 0) {
          console.log('🔄 [SYNC] Refreshing local data after sync...');
          await refreshData();
          await updateUnsyncedCount();
          await checkUndoValidity();

          if (userProfile) {
            const { AccessControlService } = await import('../../services/accessControlService');
            AccessControlService.clearCache(userProfile.id, userProfile.store_id);
            console.log('🔄 [SYNC] Permission cache invalidated');
          }

          if (currentBranchId) {
            try {
              const { eventStreamService } = await import('../../services/eventStreamService');
              await eventStreamService.initializeSyncState(currentBranchId);
              console.log('✅ [SYNC] Sync state initialized after performSync');
            } catch (syncStateError) {
              console.warn('⚠️ [SYNC] Failed to initialize sync state after performSync:', syncStateError);
            }
          }

          console.log('✅ [SYNC] Local data refreshed');
        }

        return result;
      } catch (error) {
        console.error(`❌ [SYNC] ${isAutomatic ? 'Auto-sync' : 'Manual sync'} error:`, error);
        return {
          success: false,
          errors: [error instanceof Error ? error.message : 'Unknown sync error'],
          synced: { uploaded: 0, downloaded: 0 },
          conflicts: 0,
        };
      } finally {
        setIsSyncing(false);
        setIsAutoSyncing(false);
        setLoading((prev: any) => ({ ...prev, sync: false }));
        console.log(`🏁 [SYNC] Sync process finished at ${new Date().toLocaleTimeString()}`);
      }
    },
    [
      storeId,
      currentBranchId,
      isSyncing,
      refreshData,
      updateUnsyncedCount,
      checkUndoValidity,
      userProfile,
      setLoading,
      setIsSyncing,
      setIsAutoSyncing,
      setLastSync,
    ]
  );

  const resetAutoSyncTimer = useCallback(() => {
    if (autoSyncTimerRef.current) {
      console.log('🔄 [AUTO-SYNC] Clearing existing auto-sync timer');
      clearTimeout(autoSyncTimerRef.current);
      autoSyncTimerRef.current = null;
    }

    if (isOnline && storeId && currentBranchId && !isSyncing && unsyncedCount > 0) {
      const syncDelay = 30000;
      console.log(`⏰ [AUTO-SYNC] Setting upload safety timer (${syncDelay}ms delay, ${unsyncedCount} unsynced records)`);

      autoSyncTimerRef.current = setTimeout(async () => {
        console.log('⏰ [AUTO-SYNC] Safety timer fired - uploading local changes');
        const currentUnsyncedCount = await getCurrentUnsyncedCount();
        if (currentUnsyncedCount > 0 && !syncService.isCurrentlyRunning()) {
          console.log(`📤 [AUTO-SYNC] Uploading ${currentUnsyncedCount} local changes`);
          const result = await performSync(true);
          console.log('✅ [AUTO-SYNC] Upload completed:', {
            success: result.success,
            uploaded: result.synced.uploaded,
          });
        } else {
          console.log('⏭️  [AUTO-SYNC] No upload needed (already synced or sync running)');
        }
      }, syncDelay);
    } else if (unsyncedCount === 0) {
      console.log('✅ [AUTO-SYNC] All changes synced, no timer needed');
    }
  }, [isOnline, storeId, currentBranchId, isSyncing, unsyncedCount, getCurrentUnsyncedCount, performSync, autoSyncTimerRef]);

  const debouncedSync = useCallback(() => {
    if (!isOnline || !currentBranchId || isSyncing) return;

    if (debouncedSyncTimeout) {
      clearTimeout(debouncedSyncTimeout);
    }

    const timeout = setTimeout(async () => {
      await updateUnsyncedCount();
      if (isOnline && !isSyncing) {
        try {
          const { total: freshCount } = await crudHelperService.getUnsyncedCount();
          if (freshCount > 0) {
            debug('🔄 Debounced auto-sync triggered', { unsyncedCount: freshCount });
            performSync(true);
          } else {
            debug('🔄 Debounced sync skipped: no unsynced records');
          }
        } catch (error) {
          console.warn('Failed to get unsynced count, triggering sync anyway:', error);
          performSync(true);
        }
      }
      setDebouncedSyncTimeout(null);
    }, 30000);

    setDebouncedSyncTimeout(timeout);
  }, [isOnline, currentBranchId, isSyncing, updateUnsyncedCount, performSync, debouncedSyncTimeout, setDebouncedSyncTimeout]);

  const getSyncStatus = useCallback(
    () => ({
      isOnline,
      lastSync,
      unsyncedCount,
      isSyncing,
      isAutoSyncing,
    }),
    [isOnline, lastSync, unsyncedCount, isSyncing, isAutoSyncing]
  );

  useEffect(() => {
    crudHelperService.setCallbacks({
      onRefreshData: refreshData,
      onUpdateUnsyncedCount: updateUnsyncedCount,
      onDebouncedSync: debouncedSync,
      onResetAutoSyncTimer: resetAutoSyncTimer,
    });
  }, [refreshData, updateUnsyncedCount, debouncedSync, resetAutoSyncTimer]);

  return {
    updateUnsyncedCount,
    performSync,
    debouncedSync,
    resetAutoSyncTimer,
    getSyncStatus,
  };
}
