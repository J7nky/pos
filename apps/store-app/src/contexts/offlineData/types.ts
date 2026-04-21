/**
 * Shared types for offline data domain layers.
 * Layers use a "store adapter" pattern: they receive minimal deps from the composer
 * and return state + CRUD methods + hydrate (so the composer can refresh after loadAllStoreData).
 */

import type { CurrencyCode } from '@pos-platform/shared';
import type { Database } from '../../types/database';
import type { SyncResult } from '../../services/syncOrchestrator';
import type { Branch, NotificationRecord, NotificationType, NotificationPreferences } from '../../types';

export type Tables = Database['public']['Tables'];

/** Adapter passed to ProductDataLayer: deps needed for product CRUD and events. */
export interface ProductDataLayerAdapter {
  storeId: string | null;
  currentBranchId: string | null;
  userProfileId: string | undefined;
  pushUndo: (data: { type: string; affected: Array<{ table: string; id: string }>; steps: any[] }) => void;
  resetAutoSyncTimer: () => void;
  /** Upload product rows soon after emit so peers see Postgres before event catch-up. */
  debouncedSync: () => void;
}

/** Return type of useProductDataLayer. */
export interface ProductDataLayerResult {
  products: Tables['products']['Row'][];
  addProduct: (product: Omit<Tables['products']['Insert'], 'store_id'>) => Promise<void>;
  updateProduct: (id: string, updates: Tables['products']['Update']) => Promise<void>;
  deleteProduct: (id: string) => Promise<void>;
  hydrate: (productsData: Tables['products']['Row'][]) => void;
}

/** Adapter passed to EntityDataLayer: deps for entity/customer/supplier CRUD and events. */
export interface EntityDataLayerAdapter {
  storeId: string | null;
  currentBranchId: string | null;
  userProfileId: string | undefined;
  pushUndo: (data: { type: string; affected: Array<{ table: string; id: string }>; steps: any[] }) => void;
  resetAutoSyncTimer: () => void;
  refreshData: () => Promise<void>;
}

/** Return type of useEntityDataLayer. */
export interface EntityDataLayerResult {
  entities: Tables['entities']['Row'][];
  addSupplier: (supplier: Omit<Tables['suppliers']['Insert'], 'store_id'>) => Promise<void>;
  addCustomer: (customer: Omit<Tables['customers']['Insert'], 'store_id'>) => Promise<void>;
  updateCustomer: (id: string, updates: Tables['customers']['Update']) => Promise<void>;
  updateSupplier: (id: string, updates: Tables['suppliers']['Update']) => Promise<void>;
  hydrate: (entitiesData: Tables['entities']['Row'][]) => void;
}

/** Adapter passed to TransactionDataLayer: deps for transaction CRUD. */
export interface TransactionDataLayerAdapter {
  storeId: string | null;
  currentBranchId: string | null;
  userProfileId: string | undefined;
  pushUndo: (data: { type: string; affected: Array<{ table: string; id: string }>; steps: any[] }) => void;
  resetAutoSyncTimer: () => void;
  refreshData: () => Promise<void>;
  updateUnsyncedCount: () => Promise<void>;
  debouncedSync: () => void;
}

/** Return type of useTransactionDataLayer. */
export interface TransactionDataLayerResult {
  transactions: Tables['transactions']['Row'][];
  addTransaction: (transaction: Omit<Tables['transactions']['Insert'], 'store_id'>) => Promise<void>;
  updateTransaction: (id: string, updates: any) => Promise<void>;
  hydrate: (transactionsData: Tables['transactions']['Row'][]) => void;
}

/** Adapter passed to BillDataLayer: deps for bill state and read/audit operations. */
export interface BillDataLayerAdapter {
  storeId: string | null;
  currentBranchId: string | null;
  refreshData: () => Promise<void>;
  updateUnsyncedCount: () => Promise<void>;
  debouncedSync: () => void;
}

/** Return type of useBillDataLayer (state + hydrate + getters; createBill/updateBill/deleteBill stay in context for now). */
export interface BillDataLayerResult {
  bills: any[];
  billLineItems: any[];
  sales: any[];
  hydrate: (billsData: any[], billLineItemsData: any[]) => Promise<void>;
  getBills: (filters?: any) => Promise<any[]>;
  getBillDetails: (billId: string) => Promise<any | null>;
  createBillAuditLog: (auditData: any) => Promise<void>;
  getBillsByIds: (ids: string[]) => Promise<any[]>;
  getBillLineItemsByInventoryItemIds: (inventoryItemIds: string[]) => Promise<any[]>;
}

/** Adapter passed to SyncStateLayer: deps + state/setters so layer can run before other effects. */
export interface SyncStateLayerAdapter {
  storeId: string | null;
  currentBranchId: string | null;
  isOnline: boolean;
  refreshData: () => Promise<void>;
  setLoading: (updater: (prev: any) => any) => void;
  userProfile: { id: string; store_id: string } | null | undefined;
  checkUndoValidity: () => Promise<void>;
  // State owned by context; layer uses for guards and getSyncStatus
  unsyncedCount: number;
  isSyncing: boolean;
  lastSync: Date | null;
  isAutoSyncing: boolean;
  setUnsyncedCount: (n: number) => void;
  setLastSync: (d: Date | null) => void;
  setIsSyncing: (b: boolean) => void;
  setIsAutoSyncing: (b: boolean) => void;
  debouncedSyncTimeout: ReturnType<typeof setTimeout> | null;
  setDebouncedSyncTimeout: (t: ReturnType<typeof setTimeout> | null) => void;
  autoSyncTimerRef: { current: ReturnType<typeof setTimeout> | null };
}

/** Return type of useSyncStateLayer (state stays in context; layer provides callbacks + getSyncStatus). */
export interface SyncStateLayerResult {
  updateUnsyncedCount: () => Promise<void>;
  performSync: (isAutomatic?: boolean) => Promise<SyncResult>;
  debouncedSync: () => void;
  resetAutoSyncTimer: () => void;
  getSyncStatus: () => {
    isOnline: boolean;
    lastSync: Date | null;
    unsyncedCount: number;
    isSyncing: boolean;
    isAutoSyncing: boolean;
  };
}

/** Adapter passed to EmployeeDataLayer: deps for employee CRUD and events. */
export interface EmployeeDataLayerAdapter {
  storeId: string | null;
  currentBranchId: string | null;
  userProfileId: string | undefined;
  pushUndo: (data: { type: string; affected: Array<{ table: string; id: string }>; steps: any[] }) => void;
  resetAutoSyncTimer: () => void;
}

/** Return type of useEmployeeDataLayer. */
export interface EmployeeDataLayerResult {
  employees: Tables['users']['Row'][];
  hydrate: (employeesData: any[]) => void;
  addEmployee: (employee: Omit<Tables['users']['Insert'], 'store_id'>) => Promise<void>;
  updateEmployee: (id: string, updates: Tables['users']['Update']) => Promise<void>;
  deleteEmployee: (id: string) => Promise<void>;
}

/** Adapter passed to BranchDataLayer: deps for branch state and updateBranch. */
export interface BranchDataLayerAdapter {
  storeId: string | null;
  userProfileId: string | undefined;
  pushUndo: (data: { type: string; affected: Array<{ table: string; id: string }>; steps: any[] }) => void;
  resetAutoSyncTimer: () => void;
  refreshData: () => Promise<void>;
  updateUnsyncedCount: () => Promise<void>;
  debouncedSync: () => void;
}

/** Return type of useBranchDataLayer. */
export interface BranchDataLayerResult {
  branches: Branch[];
  hydrate: (branchesData: Branch[]) => void;
  updateBranch: (id: string, updates: { name?: string; address?: string | null; phone?: string | null; logo?: string | null }) => Promise<void>;
}

/** Adapter for InventoryDataLayer (state + hydrate + getters; add/updateInventoryItem stay in context). */
export interface InventoryDataLayerAdapter {
  // No deps needed for hydrate/getters; add/update stay in context
}

/** Return type of useInventoryDataLayer. */
export interface InventoryDataLayerResult {
  inventoryItems: any[];
  inventoryBills: any[];
  inventory: any[];
  hydrate: (inventoryData: any[], batchesData: any[]) => void;
  getInventoryBatch: (batchId: string) => Promise<any | null>;
  getInventoryItemsForBatch: (batchId: string) => Promise<any[]>;
}

/** Adapter for AccountingDataLayer (state + hydrate only). */
export interface AccountingDataLayerAdapter {
  // No deps needed
}

/** Return type of useAccountingDataLayer. */
export interface AccountingDataLayerResult {
  journalEntries: any[];
  chartOfAccounts: any[];
  balanceSnapshots: any[];
  hydrate: (journalEntriesData: any[], chartOfAccountsData: any[], balanceSnapshotsData: any[]) => void;
}

/** Adapter for CashDrawerDataLayer: deps for open/close/refresh and getters. */
export interface CashDrawerDataLayerAdapter {
  storeId: string | null;
  currentBranchId: string | null;
  currency: CurrencyCode;
  exchangeRate: number;
  pushUndo: (data: { type: string; affected: Array<{ table: string; id: string }>; steps: any[] }) => void;
  updateUnsyncedCount: () => Promise<void>;
  resetAutoSyncTimer: () => void;
  debouncedSync: () => void;
}

/** Return type of useCashDrawerDataLayer. */
export interface CashDrawerDataLayerResult {
  cashDrawer: any;
  refreshCashDrawerStatus: () => Promise<void>;
  openCashDrawer: (amount: number, openedBy: string) => Promise<void>;
  closeCashDrawer: (actualAmount: number, closedBy: string, notes?: string) => Promise<void>;
  getCashDrawerBalanceReport: (startDate?: string, endDate?: string) => Promise<any>;
  getCurrentCashDrawerStatus: () => Promise<any>;
  getCashDrawerSessionDetails: (sessionId: string) => Promise<any>;
  getRecommendedOpeningAmount: () => Promise<{
    amount: number;
    source: 'previous_session' | 'default';
    previousSessionId?: string;
    previousEmployee?: string;
  }>;
}

/** Adapter for StoreSettingsDataLayer: deps for persist + sync. */
export interface StoreSettingsDataLayerAdapter {
  storeId: string | null;
  isOnline: boolean;
  isSyncing: boolean;
  updateUnsyncedCount: () => Promise<void>;
  performSync: (isAutomatic?: boolean) => Promise<unknown>;
  resetAutoSyncTimer: () => void;
  debouncedSync: () => void;
  /** Keeps CurrencyService + reactive context in sync after local store row changes. */
  reloadCurrencyState?: (storeId: string) => Promise<void>;
}

/** Return type of useStoreSettingsDataLayer. */
export interface StoreSettingsDataLayerResult {
  currency: CurrencyCode;
  exchangeRate: number;
  language: 'en' | 'ar' | 'fr';
  receiptSettings: any;
  lowStockAlertsEnabled: boolean;
  lowStockThreshold: number;
  defaultCommissionRate: number;
  hydrate: (storeData: any) => Promise<void>;
  toggleLowStockAlerts: (enabled: boolean) => Promise<void>;
  updateLowStockThreshold: (threshold: number) => void;
  updateDefaultCommissionRate: (rate: number) => Promise<void>;
  updateCurrency: (newCurrency: CurrencyCode) => Promise<void>;
  updateExchangeRate: (rate: number) => Promise<void>;
  updateLanguage: (newLanguage: 'en' | 'ar' | 'fr') => Promise<void>;
  updateReceiptSettings: (newSettings: any) => Promise<void>;
}

/** Adapter for NotificationsDataLayer: only storeId needed. */
export interface NotificationsDataLayerAdapter {
  storeId: string | null;
}

/** Return type of useNotificationsDataLayer. */
export interface NotificationsDataLayerResult {
  notifications: NotificationRecord[];
  notificationPreferences: NotificationPreferences | null;
  unreadCount: number;
  loadNotifications: (storeId: string) => Promise<void>;
  createNotification: (
    type: NotificationType,
    title: string,
    message: string,
    options?: {
      priority?: 'low' | 'medium' | 'high';
      action_url?: string;
      action_label?: string;
      metadata?: Record<string, any>;
      expires_at?: string;
    }
  ) => Promise<void>;
  markAsRead: (id: string) => Promise<void>;
  markAllAsRead: () => Promise<void>;
  deleteNotification: (id: string) => Promise<void>;
  updateNotificationPreferences: (prefs: Partial<NotificationPreferences>) => Promise<void>;
}
