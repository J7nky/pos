import { useCallback, useEffect, type Dispatch, type SetStateAction } from 'react';
import { getDB } from '../../lib/db';
import { syncService } from '../../services/syncOrchestrator';
import { SYNC_TIERS } from '../../services/syncConfig';
import type { OfflineSyncSessionState } from './offlineDataContextContract';
import { receivedBillMonitoringService } from '../../services/receivedBillMonitoringService';
import { reminderMonitoringService } from '../../services/reminderMonitoringService';
import type { Database } from '../../types/database';
import type { CashDrawerAccount } from '../../types';

type Tables = Database['public']['Tables'];

export type OfflineInitLoadingState = {
  sync: boolean;
  products: boolean;
  suppliers: boolean;
  customers: boolean;
  employees: boolean;
  sales: boolean;
  inventory: boolean;
  transactions: boolean;
  expenseCategories: boolean;
  bills: boolean;
};

export interface UseOfflineInitializationParams {
  storeId: string | null;
  currentBranchId: string | null;
  isOnline: boolean;
  unsyncedCount: number;
  userProfile: { id: string; store_id: string } | null;
  refreshData: () => Promise<void>;
  updateUnsyncedCount: () => Promise<void>;
  performSync: (auto?: boolean) => Promise<unknown>;
  settingsHydrate: (store: Tables['stores']['Row'] | null) => Promise<void>;
  refreshCashDrawerStatus: () => Promise<void>;
  setLoading: Dispatch<SetStateAction<OfflineInitLoadingState>>;
  setIsDataReady: Dispatch<SetStateAction<boolean>>;
  setIsInitializing: Dispatch<SetStateAction<boolean>>;
  setInitializationError: Dispatch<SetStateAction<string | null>>;
  setSyncSession: Dispatch<SetStateAction<OfflineSyncSessionState | null>>;
  checkUndoValidity: () => Promise<void>;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- matches composer debug()
  debug: (...args: any[]) => void;
}

export interface UseOfflineInitializationResult {
  loadStoreData: () => Promise<void>;
  ensureCashDrawerAccountsSynced: (sid: string, branchId: string) => Promise<void>;
  initializeData: () => Promise<void>;
}

export function useOfflineInitialization(params: UseOfflineInitializationParams): UseOfflineInitializationResult {
  const {
    storeId,
    currentBranchId,
    isOnline,
    unsyncedCount,
    userProfile,
    refreshData,
    updateUnsyncedCount,
    performSync,
    settingsHydrate,
    refreshCashDrawerStatus,
    setLoading,
    setIsDataReady,
    setIsInitializing,
    setInitializationError,
    setSyncSession,
    checkUndoValidity,
    debug,
  } = params;

  const loadStoreData = useCallback(async () => {
    if (!storeId) return;
    try {
      const existingStore = await getDB().stores.where('id').equals(storeId).first();
      if (existingStore) {
        await settingsHydrate(existingStore);
        await refreshCashDrawerStatus();
      } else {
        debug('📴 Store data not found locally - will sync when online');
        await settingsHydrate(null);
      }
    } catch (error) {
      console.error('❌ Error loading store data:', error);
      await settingsHydrate(null);
    }
  }, [storeId, settingsHydrate, refreshCashDrawerStatus, debug]);

  const ensureCashDrawerAccountsSynced = useCallback(
    async (sid: string, branchId: string): Promise<void> => {
      if (!isOnline) {
        debug('📴 Skipping cash drawer account sync - offline');
        return;
      }
      try {
        const localAccounts = await getDB()
          .cash_drawer_accounts.where(['store_id', 'branch_id'])
          .equals([sid, branchId])
          .filter(acc => !acc._deleted && acc.is_active !== false)
          .toArray();
        if (localAccounts.length > 0) {
          debug(`✅ Cash drawer account already exists locally (${localAccounts.length} account(s))`);
          return;
        }

        debug('🔍 Checking Supabase for existing cash drawer account...');
        const { supabase } = await import('../../lib/supabase');
        const { data: supabaseAccounts, error } = await supabase
          .from('cash_drawer_accounts')
          .select('*')
          .eq('store_id', sid)
          .eq('branch_id', branchId)
          .eq('account_code', '1100')
          .eq('is_active', true)
          .limit(1);

        if (error) {
          console.warn('⚠️ Error checking Supabase for cash drawer account:', error);
          return;
        }

        if (supabaseAccounts && supabaseAccounts.length > 0) {
          const remoteAccount = supabaseAccounts[0] as Tables['cash_drawer_accounts']['Row'];
          const store = await getDB().stores.get(sid);
          const storePreferredCurrency = store?.preferred_currency || 'LBP';
          const localAccountData: CashDrawerAccount = {
            id: remoteAccount.id,
            store_id: remoteAccount.store_id,
            branch_id: (remoteAccount as { branch_id?: string }).branch_id || '',
            account_code: remoteAccount.account_code,
            name: remoteAccount.name,
            currency: storePreferredCurrency,
            is_active: remoteAccount.is_active,
            current_balance: 0,
            created_at: remoteAccount.created_at,
            updated_at: remoteAccount.updated_at,
            _synced: true,
            _lastSyncedAt: new Date().toISOString(),
          };
          await getDB().cash_drawer_accounts.put(localAccountData);
          debug(
            `✅ Synced cash drawer account from Supabase to local DB (currency set to store preferred: ${storePreferredCurrency})`
          );
        } else {
          debug('ℹ️ No cash drawer account found in Supabase - will be created on-demand');
        }
      } catch (error) {
        console.warn('⚠️ Error ensuring cash drawer accounts are synced:', error);
      }
    },
    [isOnline, debug]
  );

  const initializeData = useCallback(async () => {
    if (!storeId || !currentBranchId) return;
    // Capture IDs at call time so we can guard against store switches mid-init (H2).
    const capturedStoreId = storeId;
    const capturedBranchId = currentBranchId;
    debug('🔄 Initializing data for store:', storeId);
    setIsDataReady(false);
    setIsInitializing(true);
    setInitializationError(null);
    let didFullResync = false;
    let coldStartAttempted = false;

    try {
      // L3: allSettled so one cleanup failure doesn't prevent the other from running
      const [invalidResult, orphanedResult] = await Promise.allSettled([
        getDB().cleanupInvalidInventoryItems(),
        getDB().cleanupOrphanedRecords(capturedStoreId),
      ]);
      const invalidCleaned = invalidResult.status === 'fulfilled' ? invalidResult.value : 0;
      const orphanedCleaned = orphanedResult.status === 'fulfilled' ? orphanedResult.value : 0;
      if (invalidResult.status === 'rejected') console.warn('⚠️ cleanupInvalidInventoryItems failed:', invalidResult.reason);
      if (orphanedResult.status === 'rejected') console.warn('⚠️ cleanupOrphanedRecords failed:', orphanedResult.reason);
      if (invalidCleaned > 0 || orphanedCleaned > 0) {
        debug(`🧹 Total cleanup: ${invalidCleaned + orphanedCleaned} records removed`);
      }

      try {
        const { cashDrawerUpdateService } = await import('../../services/cashDrawerUpdateService');
        const branches = await getDB().branches.where('store_id').equals(storeId).filter(b => !b._deleted).toArray();
        let totalDuplicatesRemoved = 0;
        for (const branch of branches) {
          const cleanupResult = await cashDrawerUpdateService.cleanupDuplicateAccounts(storeId, branch.id);
          if (cleanupResult.success && cleanupResult.duplicatesRemoved > 0) totalDuplicatesRemoved += cleanupResult.duplicatesRemoved;
        }
        if (totalDuplicatesRemoved > 0) debug(`🧹 Cleaned up ${totalDuplicatesRemoved} duplicate cash drawer accounts`);
      } catch (cleanupError) {
        console.warn('Failed to cleanup duplicate cash drawer accounts:', cleanupError);
      }

      debug('📊 Loading local data...');
      await refreshData();
      await updateUnsyncedCount();

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
      debug(
        `📈 Local data counts: ${productCount} products, ${supplierEntityCount} supplier entities, ${customerEntityCount} customer entities`
      );

      const isLocalDatabaseEmpty = productCount === 0 && supplierEntityCount === 0 && customerEntityCount === 0;
      const warmCheckpoint = await syncService.hasExistingData(storeId);

      if (isLocalDatabaseEmpty && isOnline) {
        coldStartAttempted = true;
        debug('📥 Cold start: tiered hydration from cloud...');
        setLoading(prev => ({ ...prev, sync: true }));
        setSyncSession({
          isColdStart: true,
          tier1Complete: false,
          tier2Complete: false,
          tier3Complete: false,
          connectivity: 'online',
          startedAt: Date.now(),
        });
        try {
          const tier1 = await syncService.downloadTier('tier1', capturedStoreId, capturedBranchId);
          if (tier1.success) {
            // H2: Guard against store switch that happened while tier 1 was running.
            if (capturedStoreId !== storeId || capturedBranchId !== currentBranchId) {
              debug('⚠️ Store/branch changed during tier 1 — discarding stale hydration result');
              return;
            }
            debug(`✅ Tier 1 hydration: downloaded ${tier1.synced.downloaded} records`);
            await refreshData();
            await updateUnsyncedCount();
            if (userProfile) {
              const { AccessControlService } = await import('../../services/accessControlService');
              AccessControlService.clearCache(userProfile.id, userProfile.store_id);
              debug('🔄 Permission cache invalidated after tier 1 hydration');
            }
            didFullResync = true;
            setSyncSession((s) =>
              s
                ? { ...s, tier1Complete: true }
                : {
                    isColdStart: true,
                    tier1Complete: true,
                    tier2Complete: false,
                    tier3Complete: false,
                    connectivity: 'online',
                    startedAt: Date.now(),
                  }
            );
            try {
              await ensureCashDrawerAccountsSynced(storeId, currentBranchId);
            } catch (error) {
              console.warn('⚠️ Failed to ensure cash drawer accounts after tier1:', error);
            }
            try {
              const { eventStreamService: es } = await import('../../services/eventStreamService');
              await es.initializeSyncState(currentBranchId);
              debug('✅ Sync state initialized after tier 1 hydration');
            } catch (syncStateError) {
              console.warn('⚠️ Failed to initialize sync state after tier1:', syncStateError);
            }
            setIsDataReady(true);
            // H1: Use a shared AbortController so tier 2/3 can be cancelled if the
            // component unmounts or the user switches stores before they finish.
            const bgController = new AbortController();
            void (async () => {
              try {
                await syncService.downloadTier('tier2', capturedStoreId, capturedBranchId, { signal: bgController.signal });
              } catch (e) {
                if ((e as Error)?.name !== 'AbortError') console.warn('Tier 2 background sync:', e);
              } finally {
                setSyncSession((s) => (s ? { ...s, tier2Complete: true } : s));
              }
            })();
            void (async () => {
              try {
                await syncService.downloadTier('tier3', capturedStoreId, capturedBranchId, { signal: bgController.signal });
              } catch (e) {
                if ((e as Error)?.name !== 'AbortError') console.warn('Tier 3 background sync:', e);
              } finally {
                setSyncSession((s) => (s ? { ...s, tier3Complete: true } : s));
              }
            })();
          } else {
            console.error('❌ Tier 1 hydration failed:', tier1.errors);
          }
        } catch (error) {
          console.error('❌ Initial tiered sync error:', error);
        } finally {
          setLoading(prev => ({ ...prev, sync: false }));
        }
      } else if (isLocalDatabaseEmpty && !isOnline) {
        const errorMessage =
          'Cannot load data: Database is empty and you are offline. Please connect to the internet to sync data.';
        setInitializationError(errorMessage);
        debug('📴 Local database is empty but offline - will sync when connection is restored');
        console.error('❌', errorMessage);
      } else if (!isLocalDatabaseEmpty) {
        debug(
          `📊 Local database loaded: ${productCount} products, ${supplierEntityCount} supplier entities, ${customerEntityCount} customer entities`
        );
        if (isOnline) {
          void (async () => {
            try {
              if (warmCheckpoint) {
                debug('🔄 Warm start: Tier 1 delta sync in background');
              } else {
                debug('🔄 Rebuilding Tier 1 checkpoints in background');
              }
              for (const tableName of SYNC_TIERS.tier1) {
                await syncService.downloadTablePaged(tableName, storeId, {});
              }
              await refreshData();
            } catch (e) {
              console.warn('Background Tier 1 sync:', e);
            }
          })();
        }
        if (isOnline && unsyncedCount > 0) {
          debug('🔄 Uploading pending local changes after init...');
          void performSync(true);
        }
        // unsyncedCount === 0: remote updates are handled by EventStreamService.start() catchUp
      }
    } catch (error) {
      console.error('❌ Data initialization failed:', error);
      const errorMessage =
        error instanceof Error ? error.message : 'Failed to initialize data. Please try refreshing the page.';
      setInitializationError(errorMessage);
      await refreshData();
      await updateUnsyncedCount();
    } finally {
      setIsInitializing(false);
    }

    if (isOnline && currentBranchId && !didFullResync) {
      try {
        await ensureCashDrawerAccountsSynced(storeId, currentBranchId);
      } catch (error) {
        console.warn('⚠️ Failed to sync cash drawer accounts during initialization:', error);
      }
    }

    if (storeId) {
      receivedBillMonitoringService.startMonitoring(storeId);
      reminderMonitoringService.startMonitoring(storeId);
    }

    // Only set data ready here for warm-start and offline-empty paths.
    // Cold start sets it explicitly after initializeSyncState completes (C1/C2 fix).
    if (!coldStartAttempted) {
      setIsDataReady(true);
    }
    setIsInitializing(false);
    debug('✅ Data initialization complete - isDataReady set to true, isInitializing set to false');
  }, [
    storeId,
    currentBranchId,
    isOnline,
    unsyncedCount,
    refreshData,
    updateUnsyncedCount,
    performSync,
    ensureCashDrawerAccountsSynced,
    userProfile,
    setLoading,
    setIsDataReady,
    setIsInitializing,
    setInitializationError,
    setSyncSession,
    debug,
  ]);

  useEffect(() => {
    if (storeId && currentBranchId) {
      console.log('✅ Both storeId and currentBranchId available, initializing data...', {
        storeId,
        currentBranchId,
      });
      void loadStoreData();
      void initializeData().then(() => {
        // L2: run undo validity check after init completes rather than after an arbitrary 1000ms delay
        void checkUndoValidity();
      });
    } else {
      console.log('⏳ Waiting for branch selection before loading data...', {
        hasStoreId: !!storeId,
        hasCurrentBranchId: !!currentBranchId,
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [storeId, currentBranchId, isOnline]);

  return { loadStoreData, ensureCashDrawerAccountsSynced, initializeData };
}
