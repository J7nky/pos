/**
 * Sync state domain layer for OfflineDataContext (§1.3).
 * Provides performSync, debouncedSync, resetAutoSyncTimer, updateUnsyncedCount, getSyncStatus.
 * State (unsyncedCount, isSyncing, lastSync, isAutoSyncing) stays in context; adapter passes state + setters.
 * Wires crudHelperService.setLifecycleHost so other layers trigger refresh/sync via the host.
 */

import { useCallback, useEffect, useRef } from 'react';
import { syncService, type SyncResult } from '../../services/syncOrchestrator';
import { crudHelperService } from '../../services/crudHelperService';
import type { SyncStateLayerAdapter, SyncStateLayerResult } from './types';

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

  // Ref always pointing to the latest updateUnsyncedCount so that
  // long-lived setTimeout callbacks don't call stale closures.
  const updateUnsyncedCountRef = useRef(updateUnsyncedCount);
  updateUnsyncedCountRef.current = updateUnsyncedCount;

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

      console.log(`🔄 [SYNC] Starting ${isAutomatic ? 'AUTO' : 'MANUAL'} upload at ${new Date().toLocaleTimeString()}`);
      setIsSyncing(true);
      setIsAutoSyncing(isAutomatic);
      setLoading((prev: any) => ({ ...prev, sync: true }));

      try {
        const syncStartTime = Date.now();
        const result = await syncService.uploadOnly(storeId, currentBranchId);
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

  // Ref always pointing to the latest performSync so that debouncedSync's
  // long-lived setTimeout callback doesn't call a stale closure.
  const performSyncRef = useRef(performSync);
  performSyncRef.current = performSync;

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
          const result = await performSyncRef.current(true);
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
  }, [isOnline, storeId, currentBranchId, isSyncing, unsyncedCount, getCurrentUnsyncedCount, autoSyncTimerRef]);

  const debouncedSync = useCallback(() => {
    if (!isOnline || !currentBranchId) return;
    // Note: isSyncing is intentionally NOT checked here.
    // If a sync is already running we still want to schedule an upload for when it finishes,
    // rather than silently bail out and leave unsynced records behind for up to 60 s.

    if (debouncedSyncTimeout) {
      clearTimeout(debouncedSyncTimeout);
    }

    const timeout = setTimeout(async () => {
      // Use refs so we always call the latest performSync / updateUnsyncedCount —
      // not the stale closures captured at timer-creation time.
      await updateUnsyncedCountRef.current();
      // Use syncService.isCurrentlyRunning() for a live isSyncing check rather than
      // the stale closure value that was captured 30 seconds ago.
      if (!syncService.isCurrentlyRunning()) {
        try {
          const { total: freshCount } = await crudHelperService.getUnsyncedCount();
          if (freshCount > 0) {
            debug('🔄 Debounced auto-sync triggered', { unsyncedCount: freshCount });
            performSyncRef.current(true);
          } else {
            debug('🔄 Debounced sync skipped: no unsynced records');
          }
        } catch (error) {
          console.warn('Failed to get unsynced count, triggering sync anyway:', error);
          performSyncRef.current(true);
        }
      } else {
        debug('🔄 Debounced sync deferred: sync already in progress');
      }
      setDebouncedSyncTimeout(null);
    }, 30000);

    setDebouncedSyncTimeout(timeout);
  }, [isOnline, currentBranchId, debouncedSyncTimeout, setDebouncedSyncTimeout]);

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
    crudHelperService.setLifecycleHost({
      onRefreshData: refreshData,
      onUpdateUnsyncedCount: updateUnsyncedCount,
      onDebouncedSync: debouncedSync,
      onResetAutoSyncTimer: resetAutoSyncTimer,
      // Always calls the latest performSync via ref — no extra delay, no stale closure.
      onPerformSync: (isAutomatic) => performSyncRef.current(isAutomatic),
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
