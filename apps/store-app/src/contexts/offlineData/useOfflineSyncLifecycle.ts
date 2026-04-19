import { useEffect, type Dispatch, type MutableRefObject, type SetStateAction } from 'react';
import { getDB } from '../../lib/db';
import { syncService } from '../../services/syncOrchestrator';
import type { OfflineInitLoadingState } from './useOfflineInitialization';

export interface UseOfflineSyncLifecycleParams {
  justCameOnline: boolean;
  storeId: string | null;
  isOnline: boolean;
  isSyncing: boolean;
  unsyncedCount: number;
  debouncedSyncTimeout: NodeJS.Timeout | null;
  autoSyncTimerRef: MutableRefObject<NodeJS.Timeout | null>;
  refreshData: () => Promise<void>;
  setLoading: Dispatch<SetStateAction<OfflineInitLoadingState>>;
  updateUnsyncedCount: () => Promise<void>;
  performSync: (auto?: boolean) => Promise<unknown>;
  resetAutoSyncTimer: () => void;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- matches composer debug()
  debug: (...args: any[]) => void;
}

/**
 * Connection-restore sync, focus/visibility debounced sync, periodic auto-sync timer wiring,
 * debounced-sync timeout cleanup, and placeholder real-time listener hook.
 */
export function useOfflineSyncLifecycle({
  justCameOnline,
  storeId,
  isOnline,
  isSyncing,
  unsyncedCount,
  debouncedSyncTimeout,
  autoSyncTimerRef,
  refreshData,
  setLoading,
  updateUnsyncedCount,
  performSync,
  resetAutoSyncTimer,
  debug,
}: UseOfflineSyncLifecycleParams): void {
  useEffect(() => {
    if (!isOnline || !storeId) return;
  }, [storeId, isOnline, refreshData]);

  useEffect(() => {
    if (justCameOnline && storeId && !isSyncing) {
      console.log('🌐 [CONNECTION] Connection restored, triggering sync...');
      const handleConnectionRestored = async () => {
        if (!storeId) return;
        debug('🌐 Connection restored - checking what to sync...');
        try {
          const [storeProductCount, globalProductCount, supplierEntityCount, customerEntityCount] = await Promise.all([
            getDB().products.where('store_id').equals(storeId).filter(item => !item._deleted).count(),
            getDB().products.where('is_global').equals(1).filter(item => !item._deleted).count(),
            getDB()
              .entities.where('[store_id+entity_type]')
              .equals([storeId, 'supplier'])
              .filter((item: { _deleted?: boolean }) => !item._deleted)
              .count(),
            getDB()
              .entities.where('[store_id+entity_type]')
              .equals([storeId, 'customer'])
              .filter((item: { _deleted?: boolean }) => !item._deleted)
              .count(),
          ]);
          const productCount = storeProductCount + globalProductCount;
          const isLocalDatabaseEmpty = productCount === 0 && supplierEntityCount === 0 && customerEntityCount === 0;

          if (isLocalDatabaseEmpty) {
            debug('📥 Connection restored with empty database - performing full sync...');
            setLoading(prev => ({ ...prev, sync: true }));
            try {
              const syncResult = await syncService.fullResync(storeId);
              if (syncResult.success) {
                debug(`✅ Full sync after connection restore completed: downloaded ${syncResult.synced.downloaded} records`);
                await refreshData();
                await updateUnsyncedCount();
              } else {
                console.error('❌ Full sync after connection restore failed:', syncResult.errors);
              }
            } finally {
              setLoading(prev => ({ ...prev, sync: false }));
            }
          } else {
            debug('🔄 Connection restored with local data - performing regular sync...');
            void performSync(true);
          }
        } catch (error) {
          console.error('❌ Connection restore sync error:', error);
          void performSync(true);
        }
      };
      void handleConnectionRestored();
    }
    // Match original composer deps (intentionally narrow)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [justCameOnline, storeId, isSyncing]);

  useEffect(() => {
    let autoSyncTimeout: NodeJS.Timeout;
    const debouncedAutoSync = () => {
      if (isOnline && storeId && !isSyncing && unsyncedCount > 0) {
        if (autoSyncTimeout) clearTimeout(autoSyncTimeout);
        autoSyncTimeout = setTimeout(() => {
          console.log('👀 [FOCUS-SYNC] Auto-syncing on focus/visibility change...');
          void performSync(true);
        }, 1000);
      }
    };
    const handleFocus = () => {
      console.log('👀 [FOCUS-SYNC] Window focused, checking if sync needed...');
      debouncedAutoSync();
    };
    const handleVisibilityChange = () => {
      if (!document.hidden) {
        console.log('👀 [FOCUS-SYNC] Tab became visible, checking if sync needed...');
        debouncedAutoSync();
      }
    };
    window.addEventListener('focus', handleFocus);
    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => {
      window.removeEventListener('focus', handleFocus);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      if (autoSyncTimeout) clearTimeout(autoSyncTimeout);
    };
  }, [isOnline, storeId, isSyncing, unsyncedCount, performSync]);

  // Mirrors original OfflineDataProvider: timer id lives on ref; resetAutoSyncTimer owns scheduling.
  /* eslint-disable react-hooks/exhaustive-deps */
  useEffect(() => {
    resetAutoSyncTimer();
    return () => {
      if (autoSyncTimerRef.current) clearTimeout(autoSyncTimerRef.current);
    };
  }, [resetAutoSyncTimer]);
  /* eslint-enable react-hooks/exhaustive-deps */

  useEffect(() => {
    return () => {
      if (debouncedSyncTimeout) clearTimeout(debouncedSyncTimeout);
    };
  }, [debouncedSyncTimeout]);
}
