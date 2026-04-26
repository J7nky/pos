/* eslint-disable @typescript-eslint/no-explicit-any -- legacy offline context; narrow types incrementally */
import { createContext, useContext, useState, useRef, useCallback, useMemo, ReactNode } from 'react';
import type { CurrencyCode } from '@pos-platform/shared';
import { useSupabaseAuth } from './SupabaseAuthContext';
import { useNetworkStatus } from '../hooks/useNetworkStatus';
import { Database } from '../types/database';
import { BillLineItem, NotificationPreferences, Branch } from '../types';
import {
  getDB,
  createId,
} from '../lib/db';
import { syncService, type SyncResult } from '../services/syncOrchestrator';
import { currencyService } from '../services/currencyService';
import { crudHelperService } from '../services/crudHelperService';
// import { PAYMENT_CATEGORIES } from '../constants/paymentCategories'; // Unused
import enLocale from '../i18n/locales/en';
import arLocale from '../i18n/locales/ar';
import {
  createCashDrawerAtomics,
  processCashDrawerTransaction as cashDrawerTxOps_processCashDrawerTransaction,
  createCashDrawerUndoData as cashDrawerTxOps_createCashDrawerUndoData,
} from './offlineData/operations/cashDrawerTransactionOperations';
import * as billOperations from './offlineData/operations/billOperations';
import * as inventoryBatchOps from './offlineData/operations/inventoryBatchOperations';
import * as paymentOps from './offlineData/operations/paymentOperations';
import * as inventoryItemOps from './offlineData/operations/inventoryItemOperations';
import * as saleOps from './offlineData/operations/saleOperations';
import * as undoOps from './offlineData/operations/undoOperations';

// Domain layer hooks (12 total — each owns state + CRUD for one domain)
import {
  useProductDataLayer,
  useEntityDataLayer,
  useTransactionDataLayer,
  useBillDataLayer,
  useSyncStateLayer,
  useEmployeeDataLayer,
  useBranchDataLayer,
  useInventoryDataLayer,
  useAccountingDataLayer,
  useCashDrawerDataLayer,
  useStoreSettingsDataLayer,
  useNotificationsDataLayer,
} from './offlineData';
import type { OfflineDataContextType, OfflineSyncSessionState } from './offlineData/offlineDataContextContract';
import { useStoreSwitchLifecycle } from './offlineData/useStoreSwitchLifecycle';
import { useBranchBootstrapEffects } from './offlineData/useBranchBootstrapEffects';
import { useOfflineInitialization } from './offlineData/useOfflineInitialization';
import { useOfflineSyncLifecycle } from './offlineData/useOfflineSyncLifecycle';
import { useEventStreamLifecycle } from './offlineData/useEventStreamLifecycle';
import { useDerivedStockLevels } from './offlineData/useDerivedStockLevels';

type Tables = Database['public']['Tables'];


const OfflineDataContext = createContext<OfflineDataContextType | undefined>(undefined);

// Debug mode - set to false in production to reduce console noise
const DEBUG = false;
const debug = (...args: any[]) => DEBUG && console.log(...args);

// Default notification preferences used as fallback when not yet loaded
const DEFAULT_NOTIFICATION_PREFS: NotificationPreferences = {
  store_id: '',
  enabled: true,
  enabled_types: [],
  sound_enabled: false,
  show_in_app: true,
  max_notifications_in_history: 1000,
};

export function OfflineDataProvider({ children }: { children: ReactNode }) {
  const { userProfile } = useSupabaseAuth();
  const { isOnline, justCameOnline } = useNetworkStatus();
  const storeId: string | null = userProfile?.store_id ?? null;

  const hasLoggedNoProfile = useRef(false);
  const autoSyncTimerRef = useRef<NodeJS.Timeout | null>(null);
  const previousStoreIdRef = useRef<string | null>(null);
  const isClearingStorageRef = useRef(false);
  const isBranchSyncInProgressRef = useRef(false);

  debug('🔍 OfflineDataProvider: userProfile:', userProfile, 'storeId:', storeId, 'isOnline:', isOnline, 'justCameOnline:', justCameOnline);

  // ─── Orchestration state (stays in composer) ─────────────────────────────
  const [currentBranchId, setCurrentBranchId] = useState<string | null>(null);
  const [branchSyncStatus, setBranchSyncStatus] = useState<{
    isSyncing: boolean;
    isComplete: boolean;
    error: string | null;
  }>({ isSyncing: false, isComplete: false, error: null });

  const [isDataReady, setIsDataReady] = useState(false);
  const [isInitializing, setIsInitializing] = useState(false);
  const [initializationError, setInitializationError] = useState<string | null>(null);
  const [syncSession, setSyncSession] = useState<OfflineSyncSessionState | null>(null);

  const [loading, setLoading] = useState({
    sync: false, products: false, suppliers: false, customers: false,
    employees: false, sales: false, inventory: false, transactions: false,
    expenseCategories: false, bills: false,
  });

  // Sync state — owned here, passed as adapter to useSyncStateLayer
  const [unsyncedCount, setUnsyncedCount] = useState(0);
  const [isSyncing, setIsSyncing] = useState(false);
  const [lastSync, setLastSync] = useState<Date | null>(null);
  const [isAutoSyncing, setIsAutoSyncing] = useState(false);
  const [debouncedSyncTimeout, setDebouncedSyncTimeout] = useState<NodeJS.Timeout | null>(null);

  useStoreSwitchLifecycle(storeId, previousStoreIdRef, isClearingStorageRef);

  // Undo state
  const [canUndo, setCanUndo] = useState(
    () => typeof sessionStorage !== 'undefined' && !!sessionStorage.getItem(undoOps.UNDO_STORAGE_KEY)
  );

  // Small arrays without a dedicated layer
  const [expenseCategories, setExpenseCategories] = useState<any[]>([]);
  const [billAuditLogs, setBillAuditLogs] = useState<any[]>([]);
  const [missedProducts, setMissedProducts] = useState<any[]>([]);

  // ─── Stable callback refs (resolve circular deps between layers) ──────────
  // These refs are updated every render after all definitions, so the stable
  // wrappers below always forward to the latest implementation.
  const pushUndoRef = useRef<(data: any) => void>(() => {});
  const refreshDataRef = useRef<() => Promise<void>>(async () => {});
  const resetAutoSyncTimerRef = useRef<() => void>(() => {});
  const updateUnsyncedCountRef = useRef<() => Promise<void>>(async () => {});
  const debouncedSyncRef = useRef<() => void>(() => {});
  const performSyncRef = useRef<(auto?: boolean) => Promise<SyncResult>>(
    async () => ({ success: false, errors: ['not ready'], synced: { uploaded: 0, downloaded: 0 }, conflicts: 0 })
  );
  const checkUndoValidityRef = useRef<() => Promise<void>>(async () => {});

  const stablePushUndo = useCallback((data: any) => pushUndoRef.current(data), []);
  const stableRefreshData = useCallback(() => refreshDataRef.current(), []);
  const stableResetAutoSyncTimer = useCallback(() => resetAutoSyncTimerRef.current(), []);
  const stableUpdateUnsyncedCount = useCallback(() => updateUnsyncedCountRef.current(), []);
  const stableDebouncedSync = useCallback(() => debouncedSyncRef.current(), []);
  const stablePerformSync = useCallback((auto?: boolean) => performSyncRef.current(auto), []);
  const stableCheckUndoValidity = useCallback(() => checkUndoValidityRef.current(), []);

  // ─── Domain layer hooks ────────────────────────────────────────────────────

  // No-dep layers first
  const notificationsLayer = useNotificationsDataLayer({ storeId });
  const accountingLayer = useAccountingDataLayer({});
  const inventoryLayer = useInventoryDataLayer({});

  // Layers that need pushUndo + resetAutoSyncTimer
  const productLayer = useProductDataLayer({
    storeId, currentBranchId, userProfileId: userProfile?.id,
    pushUndo: stablePushUndo, resetAutoSyncTimer: stableResetAutoSyncTimer,
    debouncedSync: stableDebouncedSync,
  });

  const employeeLayer = useEmployeeDataLayer({
    storeId, currentBranchId, userProfileId: userProfile?.id,
    pushUndo: stablePushUndo, resetAutoSyncTimer: stableResetAutoSyncTimer,
  });

  // Layers that also need refreshData / updateUnsyncedCount / debouncedSync
  const entityLayer = useEntityDataLayer({
    storeId, currentBranchId, userProfileId: userProfile?.id,
    pushUndo: stablePushUndo, resetAutoSyncTimer: stableResetAutoSyncTimer,
    refreshData: stableRefreshData,
  });

  const branchLayer = useBranchDataLayer({
    storeId, userProfileId: userProfile?.id,
    pushUndo: stablePushUndo, resetAutoSyncTimer: stableResetAutoSyncTimer,
    refreshData: stableRefreshData,
    updateUnsyncedCount: stableUpdateUnsyncedCount,
    debouncedSync: stableDebouncedSync,
  });

  const transactionLayer = useTransactionDataLayer({
    storeId, currentBranchId, userProfileId: userProfile?.id,
    pushUndo: stablePushUndo, resetAutoSyncTimer: stableResetAutoSyncTimer,
    refreshData: stableRefreshData,
    updateUnsyncedCount: stableUpdateUnsyncedCount,
    debouncedSync: stableDebouncedSync,
  });

  const billLayer = useBillDataLayer({
    storeId, currentBranchId,
    refreshData: stableRefreshData,
    updateUnsyncedCount: stableUpdateUnsyncedCount,
    debouncedSync: stableDebouncedSync,
  });

  // SyncStateLayer — uses sync state owned in this composer + stable refreshData
  const syncStateLayer = useSyncStateLayer({
    storeId, currentBranchId, isOnline,
    refreshData: stableRefreshData,
    setLoading,
    userProfile: userProfile ? { id: userProfile.id, store_id: userProfile.store_id } : null,
    checkUndoValidity: stableCheckUndoValidity,
    unsyncedCount, isSyncing, lastSync, isAutoSyncing,
    setUnsyncedCount, setLastSync, setIsSyncing, setIsAutoSyncing,
    debouncedSyncTimeout, setDebouncedSyncTimeout,
    autoSyncTimerRef,
  });

  // StoreSettings needs performSync (via stable ref)
  const reloadCurrencyStateRef = useRef<(sid: string | null) => Promise<void>>(async () => {});

  const [acceptedCurrencies, setAcceptedCurrencies] = useState<CurrencyCode[]>(['USD']);
  const [preferredCurrency, setPreferredCurrency] = useState<CurrencyCode>('USD');

  const settingsLayer = useStoreSettingsDataLayer({
    storeId, isOnline, isSyncing,
    updateUnsyncedCount: stableUpdateUnsyncedCount,
    performSync: stablePerformSync,
    resetAutoSyncTimer: stableResetAutoSyncTimer,
    debouncedSync: stableDebouncedSync,
    reloadCurrencyState: async (sid) => {
      await reloadCurrencyStateRef.current(sid);
    },
  });

  const reloadCurrencyState = useCallback(async (sid: string | null) => {
    if (!sid) return;
    await currencyService.loadFromStore(sid);
    const row = await getDB().stores.get(sid);
    if (row) await settingsLayer.hydrate(row);
    setPreferredCurrency(currencyService.getPreferredCurrency());
    setAcceptedCurrencies(currencyService.getAcceptedCurrencies());
  }, [settingsLayer.hydrate]);

  reloadCurrencyStateRef.current = reloadCurrencyState;

  const formatAmount = useCallback(
    (amount: number, currency: CurrencyCode) => currencyService.format(amount, currency),
    [preferredCurrency]
  );

  const settingsHydrateWithCurrency = useCallback(
    async (storeData: Tables['stores']['Row'] | null) => {
      if (storeData && storeId) await reloadCurrencyState(storeId);
      else await settingsLayer.hydrate(storeData);
    },
    [storeId, reloadCurrencyState, settingsLayer.hydrate]
  );

  // CashDrawer needs currency + exchangeRate from settingsLayer
  const cashDrawerLayer = useCashDrawerDataLayer({
    storeId, currentBranchId,
    currency: preferredCurrency,
    exchangeRate: settingsLayer.exchangeRate,
    pushUndo: stablePushUndo,
    updateUnsyncedCount: stableUpdateUnsyncedCount,
    resetAutoSyncTimer: stableResetAutoSyncTimer,
    debouncedSync: stableDebouncedSync,
  });

  // Computed from entityLayer
  const customers = useMemo(
    () => entityLayer.entities.filter((e): e is Tables['entities']['Row'] => e.entity_type === 'customer' && !e._deleted),
    [entityLayer.entities]
  );
  const suppliers = useMemo(
    () => entityLayer.entities.filter((e): e is Tables['entities']['Row'] => e.entity_type === 'supplier' && !e._deleted),
    [entityLayer.entities]
  );

  const { stockLevels, setStockLevels } = useDerivedStockLevels({
    products: productLayer.products,
    inventoryItems: inventoryLayer.inventoryItems,
    entities: entityLayer.entities,
    lowStockAlertsEnabled: settingsLayer.lowStockAlertsEnabled,
    lowStockThreshold: settingsLayer.lowStockThreshold,
  });

  // ─── Definitions: checkUndoValidity, pushUndo ─────────────────────────────
  const checkUndoValidity = useCallback(async () => {
    try {
      if (typeof sessionStorage === 'undefined') {
        setCanUndo(false);
        return;
      }

      const undoData = sessionStorage.getItem(undoOps.UNDO_STORAGE_KEY);
      if (!undoData) {
        setCanUndo(false);
        return;
      }

      const action = JSON.parse(undoData) as {
        affected?: Array<{ table: string; id: string }>;
        steps?: Array<{
          op?: string;
          table?: string;
          id?: string;
          record?: { id?: string };
          changes?: { id?: string };
        }>;
      };

      const restoreTargetKeys = new Set<string>();
      for (const step of action.steps || []) {
        if (step.op === 'restore' || step.op === 'add') {
          const rid = step.id ?? step.record?.id ?? step.changes?.id;
          if (step.table && rid) {
            const mapped =
              undoOps.TABLE_NAME_MAP[step.table as keyof typeof undoOps.TABLE_NAME_MAP] ?? step.table;
            restoreTargetKeys.add(`${mapped}:${rid}`);
          }
        }
      }

      let isValid = true;

      for (const item of action.affected || []) {
        const tableName =
          undoOps.TABLE_NAME_MAP[item.table as keyof typeof undoOps.TABLE_NAME_MAP] ?? item.table;
        const db = getDB() as any;
        if (!db[tableName]) {
          console.warn(`checkUndoValidity: unknown table ${item.table} (resolved: ${tableName})`);
          sessionStorage.removeItem(undoOps.UNDO_STORAGE_KEY);
          setCanUndo(false);
          return;
        }

        const mappedItemTable =
          undoOps.TABLE_NAME_MAP[item.table as keyof typeof undoOps.TABLE_NAME_MAP] ?? item.table;
        const itemKey = `${mappedItemTable}:${item.id}`;
        if (restoreTargetKeys.has(itemKey)) continue;

        const record = await db[tableName].get(item.id);
        if (!record) {
          isValid = false;
          break;
        }
        if (record._synced && item.table !== undoOps.CASH_DRAWER_EXEMPT_TABLE) {
          isValid = false;
          break;
        }
      }

      if (!isValid) {
        sessionStorage.removeItem(undoOps.UNDO_STORAGE_KEY);
        setCanUndo(false);
      }
    } catch (error) {
      console.error('checkUndoValidity failed:', error);
      if (typeof sessionStorage !== 'undefined') {
        sessionStorage.removeItem(undoOps.UNDO_STORAGE_KEY);
      }
      setCanUndo(false);
    }
  }, []);

  const pushUndo = useCallback((undoData: any) => {
    if (typeof sessionStorage !== 'undefined') {
      sessionStorage.setItem(undoOps.UNDO_STORAGE_KEY, JSON.stringify({ ...undoData, timestamp: Date.now() }));
    }
    setCanUndo(true);
  }, []);

  // ─── refreshData — calls each layer's hydrate() ───────────────────────────
  const refreshData = useCallback(async () => {
    if (!storeId) return;
    debug('🔄 Refreshing data for store:', storeId);

    try {
      // Load branches FIRST
      const branchesData = await getDB().branches
        .where('store_id').equals(storeId)
        .filter(b => !b._deleted).toArray();
      branchLayer.hydrate(branchesData);
      debug(`🏢 Loaded ${branchesData.length} branches`);

      // Load all domain data via crudHelperService
      const {
        productsData,
        employeesData,
        inventoryData,
        transactionsData,
        batchesData,
        billsData,
        billLineItemsData,
        billAuditLogsData,
        missedProductsData,
        journalEntriesData,
        entitiesData,
        chartOfAccountsData,
        balanceSnapshotsData,
      } = await crudHelperService.loadAllStoreData(storeId, currentBranchId);

      // Hydrate each domain layer
      productLayer.hydrate(productsData as Tables['products']['Row'][]);
      entityLayer.hydrate(entitiesData || []);
      employeeLayer.hydrate(employeesData || []);
      transactionLayer.hydrate(transactionsData as unknown as Tables['transactions']['Row'][]);
      await billLayer.hydrate(billsData, billLineItemsData);
      inventoryLayer.hydrate(inventoryData, batchesData);
      accountingLayer.hydrate(journalEntriesData || [], chartOfAccountsData || [], balanceSnapshotsData || []);

      // Derive expense categories from chart_of_accounts (account_type === 'expense')
      setExpenseCategories(
        (chartOfAccountsData || [])
          .filter((a: any) => a.account_type === 'expense' && !a._deleted)
          .map((a: any) => ({ id: a.id, name: a.account_name, is_active: a.is_active, created_at: a.created_at }))
      );

      // Small arrays without dedicated layers
      setBillAuditLogs(billAuditLogsData);
      setMissedProducts(missedProductsData);

      // Load store settings from DB
      const storeData = await getDB().stores.get(storeId);
      if (storeData && storeId) await reloadCurrencyState(storeId);

      // Notifications
      if (storeId) await notificationsLayer.loadNotifications(storeId);

      // Cash drawer status
      await cashDrawerLayer.refreshCashDrawerStatus();

      // Check for sync-upgraded branch (local-only → synced)
      if (currentBranchId) {
        const currentBranch = await getDB().branches.get(currentBranchId);
        if (currentBranch && !currentBranch._synced && !currentBranch._lastSyncedAt) {
          const syncedBranch = await getDB().branches
            .where('store_id').equals(storeId)
            .and(b => !b._deleted && b._synced === true)
            .first();
          if (syncedBranch && syncedBranch.id !== currentBranchId) {
            console.log(`🔄 Switching from local branch ${currentBranchId.substring(0, 8)}... to synced branch ${syncedBranch.id.substring(0, 8)}...`);
            setCurrentBranchId(syncedBranch.id);
          }
        }
      }

      debug('✅ Data refresh completed successfully');
    } catch (error) {
      console.error('❌ Error loading data from Dexie:', error);
    }
  }, [
    storeId, currentBranchId,
    productLayer.hydrate, entityLayer.hydrate, employeeLayer.hydrate,
    transactionLayer.hydrate, billLayer.hydrate, inventoryLayer.hydrate,
    accountingLayer.hydrate, branchLayer.hydrate,
    reloadCurrencyState, notificationsLayer.loadNotifications,
    cashDrawerLayer.refreshCashDrawerStatus,
  ]);

  // ─── Update stable refs after every render ────────────────────────────────
  pushUndoRef.current = pushUndo;
  refreshDataRef.current = refreshData;
  resetAutoSyncTimerRef.current = syncStateLayer.resetAutoSyncTimer;
  updateUnsyncedCountRef.current = syncStateLayer.updateUnsyncedCount;
  debouncedSyncRef.current = syncStateLayer.debouncedSync;
  performSyncRef.current = syncStateLayer.performSync;
  checkUndoValidityRef.current = checkUndoValidity;

  useBranchBootstrapEffects({
    storeId,
    userProfile: userProfile
      ? {
          id: userProfile.id,
          store_id: userProfile.store_id,
          role: userProfile.role,
          branch_id: userProfile.branch_id,
        }
      : null,
    isOnline,
    currentBranchId,
    setCurrentBranchId,
    branchSyncStatus,
    setBranchSyncStatus,
    isBranchSyncInProgressRef,
    refreshData,
  });

  useOfflineInitialization({
    storeId,
    currentBranchId,
    isOnline,
    unsyncedCount,
    userProfile: userProfile ? { id: userProfile.id, store_id: userProfile.store_id } : null,
    refreshData,
    updateUnsyncedCount: syncStateLayer.updateUnsyncedCount,
    performSync: syncStateLayer.performSync,
    settingsHydrate: settingsHydrateWithCurrency,
    refreshCashDrawerStatus: cashDrawerLayer.refreshCashDrawerStatus,
    setLoading,
    setIsDataReady,
    setIsInitializing,
    setInitializationError,
    setSyncSession,
    checkUndoValidity,
    debug,
  });

  useOfflineSyncLifecycle({
    justCameOnline,
    storeId,
    isOnline,
    isSyncing,
    unsyncedCount,
    debouncedSyncTimeout,
    autoSyncTimerRef,
    refreshData,
    setLoading,
    updateUnsyncedCount: syncStateLayer.updateUnsyncedCount,
    performSync: syncStateLayer.performSync,
    resetAutoSyncTimer: syncStateLayer.resetAutoSyncTimer,
    debug,
  });

  useEventStreamLifecycle({
    storeId,
    currentBranchId,
    isOnline,
    refreshData,
    refreshCashDrawerStatus: cashDrawerLayer.refreshCashDrawerStatus,
  });

  // ─── Cash drawer atomics ───────────────────────────────────────────────────
  const {
    createCashDrawerExpenseAtomic,
    createCashDrawerPaymentAtomic,
    createCashDrawerTransactionAtomic,
  } = createCashDrawerAtomics({ storeId, currentBranchId, userProfileId: userProfile?.id });

  const processCashDrawerTransaction = (
    transactionData: Parameters<typeof cashDrawerTxOps_processCashDrawerTransaction>[1]
  ) => cashDrawerTxOps_processCashDrawerTransaction(
    { storeId, currentBranchId, userProfileId: userProfile?.id },
    transactionData
  );

  const createCashDrawerUndoData = (
    transactionId: string | undefined,
    previousBalance: number | undefined,
    accountId: string | undefined,
    additionalUndoData?: Parameters<typeof cashDrawerTxOps_createCashDrawerUndoData>[3]
  ) => cashDrawerTxOps_createCashDrawerUndoData(transactionId, previousBalance, accountId, additionalUndoData);

  const getCurrentCashDrawerBalance = useCallback(async (sid: string): Promise<number> => {
    try {
      if (!currentBranchId) return 0;
      const currentAccount = await getDB().cash_drawer_accounts
        .where('[store_id+branch_id]')
        .equals([sid, currentBranchId])
        .and(account => account.is_active)
        .first();
      if (!currentAccount) return 0;
      const acctCurrency = (currentAccount as any)?.currency || 'USD';
      const { cashDrawerUpdateService } = await import('../services/cashDrawerUpdateService');
      const balances = await cashDrawerUpdateService.getCurrentCashDrawerBalances(sid, currentBranchId);
      return acctCurrency === 'LBP' ? balances.LBP : balances.USD;
    } catch (error) {
      console.error('Error getting cash drawer balance:', error);
      return 0;
    }
  }, [currentBranchId]);

  const refreshCashDrawerBalance = useCallback(async (sid: string): Promise<number> => {
    return getCurrentCashDrawerBalance(sid);
  }, [getCurrentCashDrawerBalance]);

  // ─── Undo ─────────────────────────────────────────────────────────────────
  const testUndo = import.meta.env.DEV
    ? () => {
        pushUndo({ type: 'test', affected: [], steps: [] });
      }
    : undefined;
  const undoLastAction = (): Promise<boolean> =>
    undoOps.undoLastAction({ storeId, refreshData, updateUnsyncedCount: syncStateLayer.updateUnsyncedCount, setCanUndo });

  // ─── Inventory CRUD ────────────────────────────────────────────────────────
  const addInventoryItem = (itemData: Omit<Tables['inventory_items']['Insert'], 'store_id'>): Promise<void> =>
    inventoryItemOps.addInventoryItem({ storeId, pushUndo, resetAutoSyncTimer: syncStateLayer.resetAutoSyncTimer }, itemData);

  const updateInventoryItem = (id: string, updates: Tables['inventory_items']['Update']): Promise<void> =>
    inventoryItemOps.updateInventoryItem(
      { storeId, currentBranchId, userProfileId: userProfile?.id, currency: preferredCurrency, pushUndo, refreshData, updateUnsyncedCount: syncStateLayer.updateUnsyncedCount, resetAutoSyncTimer: syncStateLayer.resetAutoSyncTimer, debouncedSync: syncStateLayer.debouncedSync },
      id, updates
    );

  const checkInventoryItemReferences = (id: string) => inventoryItemOps.checkInventoryItemReferences(id);

  const deleteInventoryItem = (id: string): Promise<void> =>
    inventoryItemOps.deleteInventoryItem(
      { storeId, currentBranchId, userProfileId: userProfile?.id, currency: preferredCurrency, pushUndo, refreshData, updateUnsyncedCount: syncStateLayer.updateUnsyncedCount, resetAutoSyncTimer: syncStateLayer.resetAutoSyncTimer, debouncedSync: syncStateLayer.debouncedSync },
      id
    );

  const archiveInventoryItem = (id: string): Promise<void> =>
    inventoryItemOps.archiveInventoryItem(
      { storeId, pushUndo, resetAutoSyncTimer: syncStateLayer.resetAutoSyncTimer, refreshData },
      id
    );

  const unarchiveInventoryItem = (id: string): Promise<void> =>
    inventoryItemOps.unarchiveInventoryItem(
      { storeId, pushUndo, resetAutoSyncTimer: syncStateLayer.resetAutoSyncTimer, refreshData },
      id
    );

  const deductInventoryQuantity = (productId: string, quantity: number) =>
    inventoryItemOps.deductInventoryQuantity(
      { storeId, refreshData, updateUnsyncedCount: syncStateLayer.updateUnsyncedCount, debouncedSync: syncStateLayer.debouncedSync },
      productId, quantity
    );

  const restoreInventoryQuantity = (productId: string, quantity: number) =>
    inventoryItemOps.restoreInventoryQuantity(
      { storeId, currentBranchId, refreshData, updateUnsyncedCount: syncStateLayer.updateUnsyncedCount, debouncedSync: syncStateLayer.debouncedSync },
      productId, quantity
    );

  // ─── Sale CRUD ─────────────────────────────────────────────────────────────
  const _buildSaleDeps = (): saleOps.SaleDeps => ({
    storeId, currentBranchId, userProfileId: userProfile?.id, currency: preferredCurrency,
    pushUndo, refreshData, updateUnsyncedCount: syncStateLayer.updateUnsyncedCount,
    resetAutoSyncTimer: syncStateLayer.resetAutoSyncTimer, debouncedSync: syncStateLayer.debouncedSync,
    deductInventoryQuantity: (productId, quantity) => inventoryItemOps.deductInventoryQuantity(
      { storeId, refreshData, updateUnsyncedCount: syncStateLayer.updateUnsyncedCount, debouncedSync: syncStateLayer.debouncedSync }, productId, quantity
    ),
    restoreInventoryQuantity: (productId, quantity) => inventoryItemOps.restoreInventoryQuantity(
      { storeId, currentBranchId, refreshData, updateUnsyncedCount: syncStateLayer.updateUnsyncedCount, debouncedSync: syncStateLayer.debouncedSync }, productId, quantity
    ),
  });

  const updateSale = (id: string, updates: Partial<BillLineItem>): Promise<void> => saleOps.updateSale(_buildSaleDeps(), id, updates);
  const deleteSale = (id: string): Promise<void> => saleOps.deleteSale(_buildSaleDeps(), id);
  const updateBillsForSaleItem = async (saleItemId: string): Promise<void> => { await getDB().updateBillsForLineItem(saleItemId); };

  const addExpenseCategory = async (_categoryData: any): Promise<void> => {
    if (!storeId) throw new Error('No store ID available');
    console.warn('Expense categories not supported in current schema');
  };

  // ─── Bill delegates (ref pattern for stable callbacks over changing deps) ──
  const billOpsDepsRef = useRef<billOperations.BillUpdateDeleteDeps>(null!);
  billOpsDepsRef.current = {
    storeId, currentBranchId,
    pushUndo, refreshData,
    updateUnsyncedCount: syncStateLayer.updateUnsyncedCount,
    resetAutoSyncTimer: syncStateLayer.resetAutoSyncTimer,
    debouncedSync: syncStateLayer.debouncedSync,
  };

  const billCreateDepsRef = useRef<billOperations.BillCreateDeps>(null!);
  billCreateDepsRef.current = {
    storeId, currentBranchId, userProfileId: userProfile?.id,
    pushUndo, refreshData,
    updateUnsyncedCount: syncStateLayer.updateUnsyncedCount,
    resetAutoSyncTimer: syncStateLayer.resetAutoSyncTimer,
    debouncedSync: syncStateLayer.debouncedSync,
    createCashDrawerTransactionAtomic,
    createCashDrawerUndoData,
    refreshCashDrawerStatus: cashDrawerLayer.refreshCashDrawerStatus,
  };

  const billReactivateDepsRef = useRef<billOperations.BillReactivateDeps>(null!);
  billReactivateDepsRef.current = {
    storeId, currentBranchId, userProfileId: userProfile?.id,
    pushUndo, refreshData,
    updateUnsyncedCount: syncStateLayer.updateUnsyncedCount,
    debouncedSync: syncStateLayer.debouncedSync,
  };

  const updateBill = useCallback(
    (billId: string, updates: any, changedBy: string, changeReason?: string) =>
      billOperations.updateBill(billOpsDepsRef.current, billId, updates, changedBy, changeReason),
    []
  );
  const deleteBill = useCallback(
    (billId: string, deletedBy: string, deleteReason?: string) =>
      billOperations.deleteBill(billOpsDepsRef.current, billId, deletedBy, deleteReason),
    []
  );
  const createBillDelegate = useCallback(
    (billData: any, lineItems: any[], customerBalanceUpdate?: { customerId: string; amountDue: number; originalBalance: number }) =>
      billOperations.createBill(billCreateDepsRef.current, billData, lineItems, customerBalanceUpdate, { en: enLocale, ar: arLocale }),
    []
  );
  const reactivateBillDelegate = useCallback(
    (billId: string, reactivatedBy: string, reactivationReason?: string) =>
      billOperations.reactivateBill(billReactivateDepsRef.current, billId, reactivatedBy, reactivationReason),
    []
  );

  // ─── Inventory batch delegates ─────────────────────────────────────────────
  const inventoryBatchDepsRef = useRef<inventoryBatchOps.InventoryBatchDeps>(null!);
  inventoryBatchDepsRef.current = {
    storeId, currentBranchId, userProfileId: userProfile?.id,
    currency: preferredCurrency, pushUndo, refreshData,
    updateUnsyncedCount: syncStateLayer.updateUnsyncedCount,
    resetAutoSyncTimer: syncStateLayer.resetAutoSyncTimer,
    debouncedSync: syncStateLayer.debouncedSync,
  };

  const addInventoryBatchDelegate = useCallback(
    (args: Parameters<typeof inventoryBatchOps.addInventoryBatch>[1]) =>
      inventoryBatchOps.addInventoryBatch(inventoryBatchDepsRef.current, args),
    []
  );
  const updateInventoryBatchDelegate = useCallback(
    (id: string, updates: any) => inventoryBatchOps.updateInventoryBatch(inventoryBatchDepsRef.current, id, updates),
    []
  );
  const deleteInventoryBatchDelegate = useCallback(
    (id: string) => inventoryBatchOps.deleteInventoryBatch(inventoryBatchDepsRef.current, id),
    []
  );
  const applyCommissionRateToBatchDelegate = useCallback(
    (batchId: string, commissionRate: number) => inventoryBatchOps.applyCommissionRateToBatch(inventoryBatchDepsRef.current, batchId, commissionRate),
    []
  );

  // ─── Payment delegates ─────────────────────────────────────────────────────
  const processPaymentDepsRef = useRef<paymentOps.ProcessPaymentDeps>(null!);
  processPaymentDepsRef.current = {
    currentBranchId, customers, suppliers,
    exchangeRate: settingsLayer.exchangeRate,
    createCashDrawerUndoData, pushUndo, refreshData,
    i18n: { en: enLocale, ar: arLocale },
  };

  const processEmployeePaymentDepsRef = useRef<paymentOps.ProcessEmployeePaymentDeps>(null!);
  processEmployeePaymentDepsRef.current = {
    storeId, currentBranchId, employees: employeeLayer.employees,
    exchangeRate: settingsLayer.exchangeRate, refreshData,
    i18n: { en: enLocale, ar: arLocale },
    pushUndo,
  };

  const supplierAdvanceDepsRef = useRef<paymentOps.SupplierAdvanceDeps>(null!);
  supplierAdvanceDepsRef.current = {
    storeId, currentBranchId, userProfileId: userProfile?.id,
    userStoreId: userProfile?.store_id,
    suppliers, exchangeRate: settingsLayer.exchangeRate,
    createCashDrawerExpenseAtomic, createCashDrawerPaymentAtomic,
    processCashDrawerTransaction, getCurrentCashDrawerBalance,
    updateSupplier: async (id: string, updates: any) => {
      const supplier = suppliers.find(s => s.id === id);
      if (!supplier) return;
      await crudHelperService.updateEntity('entities', id, { ...updates, _synced: false });
    },
    createCashDrawerUndoData, pushUndo, refreshData,
  };

  const processPaymentDelegate = useCallback(
    (params: Parameters<typeof paymentOps.processPayment>[1]) =>
      paymentOps.processPayment(processPaymentDepsRef.current, params),
    []
  );
  const processEmployeePaymentDelegate = useCallback(
    (params: Parameters<typeof paymentOps.processEmployeePayment>[1]) =>
      paymentOps.processEmployeePayment(processEmployeePaymentDepsRef.current, params),
    []
  );
  const processSupplierAdvanceDelegate = useCallback(
    (params: Parameters<typeof paymentOps.processSupplierAdvance>[1]) =>
      paymentOps.processSupplierAdvance(supplierAdvanceDepsRef.current, params),
    []
  );
  const deleteSupplierAdvanceDelegate = useCallback(
    (transactionId: string) => paymentOps.deleteSupplierAdvance(supplierAdvanceDepsRef.current, transactionId),
    []
  );
  const updateSupplierAdvanceDelegate = useCallback(
    (transactionId: string, updates: Parameters<typeof paymentOps.updateSupplierAdvance>[2]) =>
      paymentOps.updateSupplierAdvance(supplierAdvanceDepsRef.current, transactionId, updates),
    []
  );

  // Keep a ref so ensureDataReady polling always reads the latest value
  const isDataReadyRef = useRef(false);
  isDataReadyRef.current = isDataReady;

  // ─── Misc utilities ────────────────────────────────────────────────────────
  const ensureDataReady = useCallback((): Promise<void> => {
    if (isDataReadyRef.current) return Promise.resolve();
    return new Promise((resolve) => {
      const interval = setInterval(() => {
        if (isDataReadyRef.current) {
          clearInterval(interval);
          resolve();
        }
      }, 100);
      // Safety timeout: resolve after 10s regardless
      setTimeout(() => { clearInterval(interval); resolve(); }, 10_000);
    });
  }, []);

  const getBranchById = useCallback(async (branchId: string): Promise<Branch | undefined> => {
    try { return await getDB().branches.get(branchId); }
    catch (error) { console.error('Error getting branch from local database:', error); return undefined; }
  }, []);

  const getFirstBranchForStore = useCallback(async (sid: string): Promise<Branch | null> => {
    try {
      const branch = await getDB().branches.where('store_id').equals(sid).first();
      return branch ?? null;
    } catch (error) { console.error('Error getting first branch from local database:', error); return null; }
  }, []);

  const getUserById = useCallback(async (userId: string): Promise<Tables['users']['Row'] | undefined> => {
    try {
      const user = await getDB().users.get(userId);
      return user ?? undefined;
    } catch (error) { console.error('Error getting user from local database:', error); return undefined; }
  }, []);

  const getRolePermissionsByRole = useCallback(async (role: string): Promise<any[]> => {
    try {
      const perms = await getDB().role_permissions.where('role').equals(role).toArray();
      return perms.filter((p: any) => !p._deleted) ?? [];
    } catch (error) { console.error('Error getting role permissions from local database:', error); return []; }
  }, []);

  const getStore = async (sid: string): Promise<any | null> => {
    try { return (await getDB().stores.get(sid)) || null; }
    catch (error) { console.error('Error getting store from local database:', error); return null; }
  };

  const getBranchLogo = async (branchId: string, sid: string): Promise<string | null> => {
    try {
      const branch = await getDB().branches.get(branchId);
      if (!branch) return null;
      if (branch.logo) return branch.logo;
      const store = await getDB().stores.get(sid);
      return store?.logo || null;
    } catch (error) { console.error('Error getting branch logo:', error); return null; }
  };

  const getGlobalLogos = async (): Promise<Array<{ name: string; url: string; path: string }>> => {
    try {
      const { supabase } = await import('../lib/supabase');
      const { data, error } = await supabase.storage.from('global-logos').list('', { limit: 100, offset: 0, sortBy: { column: 'name', order: 'asc' } });
      if (error) { console.error('Error fetching global logos from storage:', error); return []; }
      if (!data) return [];
      return await Promise.all(
        data.filter(file => file.name && !file.name.startsWith('.')).map(async (file) => {
          const { data: urlData } = await supabase.storage.from('global-logos').getPublicUrl(file.name);
          return { name: file.name.replace(/\.[^/.]+$/, ''), url: urlData?.publicUrl || '', path: file.name };
        })
      );
    } catch (error) { console.error('Error getting global logos from storage:', error); return []; }
  };

  const validateAndCleanData = async (): Promise<{ cleaned: number; report: any }> => {
    if (!storeId) throw new Error('No store ID available');
    try {
      const [orphanedCleaned, invalidCleaned] = await Promise.all([
        getDB().cleanupOrphanedRecords(storeId),
        getDB().cleanupInvalidInventoryItems(),
      ]);
      const cleaned = orphanedCleaned + invalidCleaned;
      if (cleaned > 0) { await refreshData(); await syncStateLayer.updateUnsyncedCount(); }
      return { cleaned, report: { orphanedRecords: orphanedCleaned, invalidInventory: invalidCleaned, message: `Cleaned ${cleaned} records (${orphanedCleaned} orphaned, ${invalidCleaned} invalid)` } };
    } catch (error) { console.error('Data validation/cleanup failed:', error); throw error; }
  };

  const fullResync = async (): Promise<SyncResult> => {
    if (!storeId || !currentBranchId) {
      console.log('⏭️  [FULL-RESYNC] Skipping:', { hasStoreId: !!storeId, hasCurrentBranchId: !!currentBranchId });
      return { success: false, errors: ['No store ID or branch ID available'], synced: { uploaded: 0, downloaded: 0 }, conflicts: 0 };
    }
    setIsSyncing(true);
    setLoading(prev => ({ ...prev, sync: true }));
    try {
      const result = await syncService.fullResync(storeId);
      setLastSync(new Date());
      await refreshData();
      await syncStateLayer.updateUnsyncedCount();
      return result;
    } catch (error) {
      console.error('Full resync error:', error);
      return { success: false, errors: [error instanceof Error ? error.message : 'Unknown resync error'], synced: { uploaded: 0, downloaded: 0 }, conflicts: 0 };
    } finally {
      setIsSyncing(false);
      setLoading(prev => ({ ...prev, sync: false }));
    }
  };

  const getStockLevels = () => stockLevels;
  const createIdFunction = (): string => createId();

  // ─── No userProfile: return empty context ─────────────────────────────────
  if (!userProfile) {
    if (!hasLoggedNoProfile.current) {
      debug('⏳ Waiting for userProfile to load...');
      hasLoggedNoProfile.current = true;
    }
    return (
      <OfflineDataContext.Provider value={{
        receiptSettings: {},
        updateReceiptSettings: async () => {},
        storeId: null,
        currentBranchId: null,
        setCurrentBranchId: () => {},
        branchSyncStatus: { isSyncing: false, isComplete: false, error: null },
        isDataReady: false,
        isInitializing: false,
        initializationError: null,
        syncSession: null,
        getPermanentlyFailedOutboxItems: async () => [],
        discardPermanentlyFailedOutboxItem: async () => {},
        products: [],
        branches: [],
        suppliers: [],
        customers: [],
        employees: [],
        sales: [],
        inventory: [],
        inventoryBills: [],
        transactions: [],
        expenseCategories: [],
        bills: [],
        billLineItems: [],
        billAuditLogs: [],
        missedProducts: [],
        journalEntries: [],
        entities: [],
        chartOfAccounts: [],
        balanceSnapshots: [],
        stockLevels: [],
        setStockLevels: () => {},
        lowStockAlertsEnabled: false,
        lowStockThreshold: 10,
        defaultCommissionRate: 10,
        currency: 'LBP',
        preferredCurrency: 'LBP',
        acceptedCurrencies: ['LBP', 'USD'],
        formatAmount: () => '$0.00',
        exchangeRate: 89500,
        language: 'ar',
        cashDrawer: null,
        openCashDrawer: async () => {},
        closeCashDrawer: async () => {},
        getCashDrawerBalanceReport: async () => ({ sessions: [], summary: { totalSessions: 0, totalOpening: 0, totalExpected: 0, totalActual: 0, totalVariance: 0, balancedSessions: 0, unbalancedSessions: 0, averageVariance: 0 }, generatedAt: new Date().toISOString() }),
        getCurrentCashDrawerStatus: async () => ({ status: 'no_session' as const, message: 'No store ID' }),
        getCashDrawerSessionDetails: async () => ({ session: {} as any, transactions: { sales: [], payments: [], expenses: [] }, totals: { sales: 0, payments: 0, expenses: 0 } }),
        getRecommendedOpeningAmount: async () => ({ amount: 0, source: 'default' as const }),
        refreshCashDrawerStatus: async () => {},
        isOnline: false,
        loading: { sync: false, products: false, suppliers: false, customers: false, employees: false, sales: false, inventory: false, transactions: false, expenseCategories: false, bills: false },
        addProduct: async () => {},
        addSupplier: async () => {},
        addCustomer: async () => {},
        updateCustomer: async () => {},
        updateSupplier: async () => {},
        updateProduct: async () => {},
        updateBranch: async () => {},
        deleteProduct: async () => {},
        addEmployee: async () => {},
        updateEmployee: async () => {},
        deleteEmployee: async () => {},
        addInventoryItem: async () => {},
        updateInventoryItem: async () => {},
        checkInventoryItemReferences: async () => ({ salesCount: 0, variancesCount: 0, hasReferences: false }),
        deleteInventoryItem: async () => {},
        archiveInventoryItem: async () => {},
        unarchiveInventoryItem: async () => {},
        addInventoryBatch: async () => ({ batchId: '' }),
        updateSale: async () => {},
        deleteSale: async () => {},
        updateBillsForSaleItem: async () => {},
        addTransaction: async () => {},
        addExpenseCategory: async () => {},
        updateInventoryBatch: async () => {},
        deleteInventoryBatch: async () => {},
        applyCommissionRateToBatch: async () => {},
        createBill: async () => '',
        updateBill: async () => {},
        deleteBill: async () => {},
        reactivateBill: async () => {},
        getBills: async () => [],
        getBillDetails: async () => null,
        createBillAuditLog: async () => {},
        getStore: async () => null,
        getBranchLogo: async () => null,
        getBranchById: async () => undefined,
        getFirstBranchForStore: async () => null,
        getUserById: async () => undefined,
        getRolePermissionsByRole: async () => [],
        ensureDataReady: async () => {},
        getGlobalLogos: async () => [],
        deductInventoryQuantity: async () => {},
        restoreInventoryQuantity: async () => {},
        refreshData: async () => {},
        getStockLevels: () => [],
        toggleLowStockAlerts: async () => {},
        updateLowStockThreshold: () => {},
        updateDefaultCommissionRate: async () => {},
        updateCurrency: async () => {},
        updateExchangeRate: async () => {},
        updateExchangeRateFor: async () => {},
        addAcceptedCurrency: async () => {},
        removeAcceptedCurrency: async () => {},
        updateLanguage: async () => {},
        sync: async () => ({ success: false, errors: ['No store ID'], synced: { uploaded: 0, downloaded: 0 }, conflicts: 0 }),
        fullResync: async () => ({ success: false, errors: ['No store ID'], synced: { uploaded: 0, downloaded: 0 }, conflicts: 0 }),
        debouncedSync: () => {},
        getSyncStatus: () => ({ isOnline: false, lastSync: null, unsyncedCount: 0, isSyncing: false, isAutoSyncing: false }),
        validateAndCleanData: async () => ({ cleaned: 0, report: { orphanedRecords: 0, invalidInventory: 0, message: 'No store ID' } }),
        canUndo: false,
        undoLastAction: async () => false,
        pushUndo: () => {},
        testUndo: undefined,
        processCashDrawerTransaction: async () => ({ success: false }),
        createCashDrawerUndoData: () => ({ type: '', affected: [], steps: [] }),
        createId: () => crypto.randomUUID(),
        getCurrentCashDrawerBalance: async () => 0,
        refreshCashDrawerBalance: async () => 0,
        processPayment: async (_params: any) => ({ success: false, error: 'No store ID available' }),
        processSupplierAdvance: async () => {},
        updateSupplierAdvance: async () => {},
        deleteSupplierAdvance: async () => {},
        processEmployeePayment: async () => ({ success: false, error: 'No store ID available' }),
        notifications: [],
        unreadCount: 0,
        notificationPreferences: { ...DEFAULT_NOTIFICATION_PREFS },
        createNotification: async () => {},
        markAsRead: async () => {},
        markAllAsRead: async () => {},
        deleteNotification: async () => {},
        updateNotificationPreferences: async () => {},
      }}>
        {children}
      </OfflineDataContext.Provider>
    );
  }

  // ─── Main context value ────────────────────────────────────────────────────
  return (
    <OfflineDataContext.Provider value={{
      storeId,
      currentBranchId,
      setCurrentBranchId,
      branchSyncStatus,
      isDataReady,
      isInitializing,
      initializationError,
      syncSession,
      getPermanentlyFailedOutboxItems: () => syncService.getPermanentlyFailedItems(),
      discardPermanentlyFailedOutboxItem: async (id: string) => {
        await getDB().removePendingSync(id);
      },

      // Data from domain layers
      products: productLayer.products,
      branches: branchLayer.branches,
      suppliers,
      customers,
      employees: employeeLayer.employees,
      sales: billLayer.sales,
      inventory: inventoryLayer.inventory,
      inventoryBills: inventoryLayer.inventoryBills,
      transactions: transactionLayer.transactions,
      expenseCategories,
      bills: billLayer.bills,
      billLineItems: billLayer.billLineItems,
      billAuditLogs,
      missedProducts,
      journalEntries: accountingLayer.journalEntries,
      entities: entityLayer.entities,
      chartOfAccounts: accountingLayer.chartOfAccounts,
      balanceSnapshots: accountingLayer.balanceSnapshots,

      // Settings from settingsLayer
      stockLevels,
      setStockLevels,
      lowStockAlertsEnabled: settingsLayer.lowStockAlertsEnabled,
      lowStockThreshold: settingsLayer.lowStockThreshold,
      defaultCommissionRate: settingsLayer.defaultCommissionRate,
      currency: preferredCurrency,
      preferredCurrency,
      acceptedCurrencies,
      formatAmount,
      exchangeRate: settingsLayer.exchangeRate,
      language: settingsLayer.language,
      receiptSettings: settingsLayer.receiptSettings,
      updateReceiptSettings: settingsLayer.updateReceiptSettings,
      toggleLowStockAlerts: settingsLayer.toggleLowStockAlerts,
      updateLowStockThreshold: settingsLayer.updateLowStockThreshold,
      updateDefaultCommissionRate: settingsLayer.updateDefaultCommissionRate,
      updateCurrency: settingsLayer.updateCurrency,
      updateExchangeRate: settingsLayer.updateExchangeRate,
      updateExchangeRateFor: settingsLayer.updateExchangeRateFor,
      addAcceptedCurrency: settingsLayer.addAcceptedCurrency,
      removeAcceptedCurrency: settingsLayer.removeAcceptedCurrency,
      updateLanguage: settingsLayer.updateLanguage,

      // Cash drawer from cashDrawerLayer
      cashDrawer: cashDrawerLayer.cashDrawer,
      openCashDrawer: cashDrawerLayer.openCashDrawer,
      closeCashDrawer: cashDrawerLayer.closeCashDrawer,
      getCashDrawerBalanceReport: cashDrawerLayer.getCashDrawerBalanceReport,
      getCurrentCashDrawerStatus: cashDrawerLayer.getCurrentCashDrawerStatus,
      getCashDrawerSessionDetails: cashDrawerLayer.getCashDrawerSessionDetails,
      getRecommendedOpeningAmount: cashDrawerLayer.getRecommendedOpeningAmount,
      refreshCashDrawerStatus: cashDrawerLayer.refreshCashDrawerStatus,
      isOnline,

      loading,

      // CRUD from domain layers
      addProduct: productLayer.addProduct,
      updateProduct: productLayer.updateProduct,
      deleteProduct: productLayer.deleteProduct,
      addSupplier: entityLayer.addSupplier,
      addCustomer: entityLayer.addCustomer,
      updateCustomer: entityLayer.updateCustomer,
      updateSupplier: entityLayer.updateSupplier,
      addEmployee: employeeLayer.addEmployee,
      updateEmployee: employeeLayer.updateEmployee,
      deleteEmployee: employeeLayer.deleteEmployee,
      updateBranch: branchLayer.updateBranch,
      addTransaction: transactionLayer.addTransaction,

      // Inventory CRUD (delegates to ops files)
      addInventoryItem,
      updateInventoryItem,
      checkInventoryItemReferences,
      deleteInventoryItem,
      archiveInventoryItem,
      unarchiveInventoryItem,
      addInventoryBatch: addInventoryBatchDelegate,
      updateInventoryBatch: updateInventoryBatchDelegate,
      deleteInventoryBatch: deleteInventoryBatchDelegate,
      applyCommissionRateToBatch: applyCommissionRateToBatchDelegate,

      // Sale CRUD
      updateSale,
      deleteSale,
      updateBillsForSaleItem,
      addExpenseCategory,

      // Bill management
      createBill: createBillDelegate,
      updateBill,
      deleteBill,
      reactivateBill: reactivateBillDelegate,
      getBills: billLayer.getBills,
      getBillDetails: billLayer.getBillDetails,
      createBillAuditLog: billLayer.createBillAuditLog,

      // Store / logo utilities
      getStore,
      getBranchLogo,
      getBranchById,
      getFirstBranchForStore,
      getUserById,
      getRolePermissionsByRole,
      ensureDataReady,
      getGlobalLogos,

      deductInventoryQuantity,
      restoreInventoryQuantity,

      // Utility functions
      refreshData,
      getStockLevels,

      // Sync from syncStateLayer
      sync: syncStateLayer.performSync,
      fullResync,
      debouncedSync: syncStateLayer.debouncedSync,
      getSyncStatus: syncStateLayer.getSyncStatus,
      validateAndCleanData,

      // Undo
      canUndo,
      undoLastAction,
      pushUndo,
      testUndo,

      // Cash drawer utilities
      processCashDrawerTransaction,
      createCashDrawerUndoData,
      createId: createIdFunction,
      getCurrentCashDrawerBalance,
      refreshCashDrawerBalance,

      // Payment processing
      processPayment: processPaymentDelegate,
      processSupplierAdvance: processSupplierAdvanceDelegate,
      updateSupplierAdvance: updateSupplierAdvanceDelegate,
      deleteSupplierAdvance: deleteSupplierAdvanceDelegate,
      processEmployeePayment: processEmployeePaymentDelegate,

      // Notifications from notificationsLayer
      notifications: notificationsLayer.notifications,
      unreadCount: notificationsLayer.unreadCount,
      notificationPreferences: notificationsLayer.notificationPreferences || { ...DEFAULT_NOTIFICATION_PREFS, store_id: storeId || '' },
      createNotification: notificationsLayer.createNotification,
      markAsRead: notificationsLayer.markAsRead,
      markAllAsRead: notificationsLayer.markAllAsRead,
      deleteNotification: notificationsLayer.deleteNotification,
      updateNotificationPreferences: notificationsLayer.updateNotificationPreferences,
    }}>
      {children}
    </OfflineDataContext.Provider>
  );
}

export function useOfflineData() {
  const context = useContext(OfflineDataContext);
  if (context === undefined) {
    throw new Error('useOfflineData must be used within an OfflineDataProvider');
  }
  return context;
}
