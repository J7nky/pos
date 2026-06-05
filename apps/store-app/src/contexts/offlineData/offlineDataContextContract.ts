/**
 * Public contract for useOfflineData() — kept separate so OfflineDataContext.tsx
 * stays focused on wiring (IMPROVEMENTS_ENHANCEMENTS_REPORT §1.3).
 */
import type { Database } from '../../types/database';
import type {
  Branch,
  Bill,
  BillLineItem,
  CashDrawerSession,
  ExpenseCategory,
  inventory_bills,
  MissedProduct,
  NotificationRecord,
  NotificationType,
  NotificationPreferences,
  PendingSync,
  RolePermission,
  ModuleName,
  UserModuleAccess,
} from '../../types';
import type { InventoryItem } from '../../types/inventory';
import type { BalanceSnapshot, ChartOfAccounts, JournalEntry } from '../../types/accounting';
import type { ProductCategory, UnitOfMeasure } from '../../types/taxonomy';
import type { CreateCategoryInput, CreateUnitInput } from '../../services/taxonomyService';
import type { AuditLogFilters, AuditLogWithUser } from './useAuditLogDataLayer';
import type { SyncResult } from '../../services/syncOrchestrator';
import type { CurrencyCode } from '@pos-platform/shared';

type Tables = Database['public']['Tables'];

/**
 * Scope for refreshData(): 'all' = full rehydration of every domain layer;
 * 'sale' = only the tables a sale mutates (bills, line items, inventory,
 * transactions); 'financial' = only transactions + cash-drawer status (expenses,
 * income, standalone transactions). Narrow scopes skip the full re-render cascade.
 */
export type RefreshScope = 'all' | 'sale' | 'financial';

/** Persisted receipt/print layout settings (stored in localStorage, merged with store data). */
type ReceiptSettings = {
  storeName: string;
  address: string;
  phone1: string;
  phone1Name: string;
  phone2: string;
  phone2Name: string;
  thankYouMessage: string;
  billNumberPrefix: string;
  showPreviousBalance: boolean;
  showItemCount: boolean;
  receiptWidth: number;
  /** 'auto' = detect at runtime; 'thermal' = force ESC/POS; 'normal' = force A4 HTML */
  defaultPrinterType: 'auto' | 'thermal' | 'normal';
  /** OS printer name to use by default (empty string = use system default) */
  defaultPrinterName: string;
  /** When true, skip the "Print bill?" confirmation dialog and print immediately */
  autoPrint: boolean;
};

/** Input shape for createBill — omits server/auto-generated fields; callers supply business data. */
type CreateBillInput = Omit<
  Tables['bills']['Insert'],
  'id' | 'store_id' | 'bill_number' | 'created_at' | 'updated_at'
> & {
  branch_id?: string;
  /** Optional flow hint: 'credit_purchase' | 'cash_purchase' require a supplier entity_id. */
  bill_type?: string;
};

/** Minimum per-line input when creating a bill. */
type BillLineItemInput = {
  product_id: string;
  inventory_item_id?: string | null;
  quantity: number;
  unit_price: number;
  line_total: number;
  weight?: number | null;
  notes?: string | null;
  line_order: number;
  received_value?: number;
  branch_id?: string | null;
  updated_at?: string;
};

/** Filter object accepted by getBills(). */
type BillFilters = {
  status?: Bill['status'];
  supplier_id?: string;
  /** Inclusive start date, YYYY-MM-DD local. Alias: date_from. */
  dateFrom?: string;
  date_from?: string;
  /** Inclusive end date, YYYY-MM-DD local. Alias: date_to. */
  dateTo?: string;
  date_to?: string;
  paymentStatus?: Bill['payment_status'];
  searchTerm?: string;
};

/** A single reversible step stored in an undo action. */
type UndoStep = {
  op: 'delete' | 'restore' | 'add' | 'update';
  table: string;
  id?: string;
  changes?: Record<string, unknown>;
  record?: Record<string, unknown>;
  transaction_id?: string;
};

/** Shape of data written to pushUndo / read back by undoLastAction. */
type UndoAction = {
  type: string;
  affected: Array<{ table: string; id: string }>;
  steps: UndoStep[];
  metadata?: Record<string, unknown>;
};

/** Report returned by validateAndCleanData(). */
type DataCleanReport = {
  orphanedRecords: number;
  invalidInventory: number;
  message: string;
};

type DerivedStockLevel = {
  id: string;
  productId: string;
  productName: string;
  currentStock: number;
  suppliers: Array<{
    supplierId: string;
    supplierName: string;
    quantity: number;
  }>;
  lowStockAlert: boolean;
};

type CashDrawerViewState = {
  id: string;
  accountId: string;
  status: 'open' | 'closed';
  currentBalance: number;
  currency: CurrencyCode;
  lastUpdated: string;
  openedAt: string;
  openingAmount: number;
};

type CashDrawerBalanceReportSession = {
  id: string;
  sessionId: string;
  date: string;
  employeeName: string;
  openingAmount: number;
  expectedAmount: number;
  actualAmount: number;
  variance: number;
  status: 'balanced' | 'unbalanced';
  closedBy: string;
  notes: string | null;
};

type CashDrawerBalanceReportSummary = {
  totalSessions: number;
  totalOpening: number;
  totalExpected: number;
  totalActual: number;
  totalVariance: number;
  balancedSessions: number;
  unbalancedSessions: number;
  averageVariance: number;
};

type CashDrawerBalanceReport = {
  sessions: CashDrawerBalanceReportSession[];
  summary: CashDrawerBalanceReportSummary;
  generatedAt: string;
};

type CashDrawerStatusResponse =
  | { status: 'no_session'; message: string }
  | { status: 'no_account'; message: string }
  | { status: 'error'; message: string }
  | {
      status: 'active';
      sessionId: string;
      openedBy: string;
      openedAt: string;
      openingAmount: number;
      currentBalance: number;
      sessionDuration: number;
    };

type CashDrawerSessionDetailsResponse = {
  session: CashDrawerSession;
  transactions: {
    sales: Array<{
      id: string;
      product_name: string;
      quantity: number;
      unit_price: number;
      received_value: number;
      created_at: string;
    }>;
    payments: Array<{
      id: string;
      description: string;
      amount: number;
      reference: string | null;
      created_at: string;
    }>;
    expenses: Array<{
      id: string;
      description: string;
      amount: number;
      category: string;
      created_at: string;
    }>;
  };
  totals: {
    sales: number;
    payments: number;
    expenses: number;
  };
};

type BillDetails = Bill & {
  bill_line_items: BillLineItem[];
  // Back-compat alias used by some UI callers
  line_items?: BillLineItem[];
};

/** Runtime tier hydration progress (not persisted — see incremental sync redesign). */
export type OfflineSyncSessionState = {
  isColdStart: boolean;
  tier1Complete: boolean;
  tier2Complete: boolean;
  tier3Complete: boolean;
  connectivity: 'online' | 'offline';
  startedAt: number;
  /**
   * Plan C / C9 archive hydration observability. NULL while no archive
   * activity has been observed; otherwise summarizes the most recent run.
   */
  archiveHydration?: ArchiveHydrationStatus | null;
};

/**
 * Plan D / D4 — derived view of local FY archive coverage. The UI can
 * render "History available from FY 2022 → present" by reading
 * `earliestLocalFy` and `latestLocalFy`, and show a manual-download
 * affordance when `missingFyLabels` is non-empty.
 */
export type ArchiveCoverageStatus = {
  /** Closed-FY labels (oldest → newest) that are fully local. */
  localFyLabels: string[];
  /** Closed FYs the server has archived but this device hasn't downloaded. */
  missingFyLabels: string[];
  /** Closed FYs partially downloaded (some tables done, others pending). */
  partialFyLabels: string[];
  earliestLocalFy?: string | null;
  latestLocalFy?: string | null;
  /** Open FY identifier, if the server manifest carries one. */
  currentFyLabel?: string | null;
  /** ISO timestamp of the manifest read this status was derived from. */
  computedAt: string;
};

/** Snapshot of archive-hydration state surfaced to the sync status UI. */
export type ArchiveHydrationStatus = {
  /** 'idle' before any run; 'running' once kicked off; 'completed' / 'failed' once finished. */
  state: 'idle' | 'running' | 'completed' | 'failed';
  /** FY currently being downloaded, if state === 'running'. */
  currentFy?: string | null;
  /** Table currently being downloaded inside the FY, if state === 'running'. */
  currentTable?: string | null;
  /** Per-FY summary of completed runs in this session. */
  loadedFyLabels: string[];
  /** FY labels skipped because their archive was already local. */
  skippedFyLabels: string[];
  /** Total uncompressed rows bulk-put across all tables this session. */
  rowsLoaded: number;
  /** Tables whose sha256 didn't match the manifest's value (still bulk-put). */
  shaMismatches: { fy: string; table: string; expected: string }[];
  elapsedMs?: number;
  errorMessage?: string;
};

export interface OfflineDataContextType {
  storeId: string | null;
  currentBranchId: string | null;
  setCurrentBranchId: (branchId: string | null) => void;
  branchSyncStatus: {
    isSyncing: boolean;
    isComplete: boolean;
    error: string | null;
  };
  isDataReady: boolean;
  isInitializing: boolean;
  initializationError: string | null;
  syncSession: OfflineSyncSessionState | null;
  /**
   * Plan D / D4: snapshot of local archive coverage. Tells the UI which
   * closed FYs are fully local and which are still missing. NULL until
   * the manifest has been fetched once in this session.
   */
  archiveCoverage: ArchiveCoverageStatus | null;
  /**
   * Plan D / D4: manual trigger for `archiveHydrationService` — useful as
   * the "Download older FYs" button hook. Resolves with the per-FY summary;
   * onProgress lets the UI render a progress bar. No-op when offline.
   */
  triggerArchiveBackfill: (opts?: {
    fyLabels?: string[];
    signal?: AbortSignal;
  }) => Promise<void>;
  getPermanentlyFailedOutboxItems: () => Promise<PendingSync[]>;
  discardPermanentlyFailedOutboxItem: (id: string) => Promise<void>;
  products: Tables['products']['Row'][];
  branches: Branch[];
  suppliers: Tables['entities']['Row'][];
  customers: Tables['entities']['Row'][];
  employees: Tables['users']['Row'][];
  sales: BillLineItem[];
  inventory: InventoryItem[];
  inventoryBills: inventory_bills[];
  transactions: Tables['transactions']['Row'][];
  expenseCategories: ExpenseCategory[];
  bills: Bill[];
  billLineItems: BillLineItem[];
  missedProducts: MissedProduct[];

  journalEntries: JournalEntry[];
  entities: Tables['entities']['Row'][];
  chartOfAccounts: ChartOfAccounts[];
  balanceSnapshots: BalanceSnapshot[];

  /** Configurable, store-scoped product categories (v64). */
  categories: ProductCategory[];
  /** Configurable, store-scoped units of measure (v64). */
  units: UnitOfMeasure[];
  createCategory: (input: CreateCategoryInput) => Promise<string>;
  updateCategory: (id: string, updates: Partial<Pick<ProductCategory, 'name' | 'sort_order' | 'is_active' | 'code'>>) => Promise<void>;
  deleteCategory: (id: string) => Promise<void>;
  createUnit: (input: CreateUnitInput) => Promise<string>;
  updateUnit: (id: string, updates: Partial<Omit<UnitOfMeasure, 'id' | 'store_id' | 'created_at' | 'is_system'>>) => Promise<void>;
  deleteUnit: (id: string) => Promise<void>;

  stockLevels: DerivedStockLevel[];
  setStockLevels: (levels: DerivedStockLevel[]) => void;
  lowStockAlertsEnabled: boolean;
  lowStockThreshold: number;
  defaultCommissionRate: number;
  currency: CurrencyCode;
  preferredCurrency: CurrencyCode;
  acceptedCurrencies: CurrencyCode[];
  /** True iff `code` is in this store's acceptedCurrencies list. */
  isCurrencyAccepted: (code: CurrencyCode) => boolean;
  /** True iff this store accepts more than one currency (drives selector visibility). */
  isMultiCurrency: boolean;
  formatAmount: (amount: number, currency: CurrencyCode) => string;
  exchangeRate: number;
  language: 'en' | 'ar' | 'fr';
  cashDrawer: CashDrawerViewState | null;
  openCashDrawer: (amount: number, openedBy: string) => void;
  closeCashDrawer: (actualAmount: number, closedBy: string, notes?: string) => void;
  getCashDrawerBalanceReport: (startDate?: string, endDate?: string) => Promise<CashDrawerBalanceReport>;
  getCurrentCashDrawerStatus: () => Promise<CashDrawerStatusResponse>;
  getCashDrawerSessionDetails: (sessionId: string) => Promise<CashDrawerSessionDetailsResponse>;
  getRecommendedOpeningAmount: () => Promise<{
    amount: number;
    source: 'previous_session' | 'default';
    previousSessionId?: string;
    previousEmployee?: string;
  }>;
  refreshCashDrawerStatus: () => Promise<void>;
  isOnline: boolean;

  loading: {
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

  addProduct: (product: Omit<Tables['products']['Insert'], 'store_id'>) => Promise<void>;
  addSupplier: (supplier: Omit<Tables['suppliers']['Insert'], 'store_id'>) => Promise<void>;
  addCustomer: (customer: Omit<Tables['customers']['Insert'], 'store_id'>) => Promise<void>;
  updateCustomer: (id: string, updates: Tables['customers']['Update']) => Promise<void>;
  updateSupplier: (id: string, updates: Tables['suppliers']['Update']) => Promise<void>;
  updateProduct: (id: string, updates: Tables['products']['Update']) => Promise<void>;
  deleteProduct: (id: string) => Promise<void>;
  updateBranch: (id: string, updates: { name?: string; address?: string | null; phone?: string | null; logo?: string | null }) => Promise<void>;
  addEmployee: (employee: Omit<Tables['users']['Insert'], 'store_id'>) => Promise<void>;
  updateEmployee: (id: string, updates: Tables['users']['Update']) => Promise<void>;
  deleteEmployee: (id: string) => Promise<void>;
  addInventoryItem: (item: Omit<Tables['inventory_items']['Insert'], 'store_id'>) => Promise<void>;
  updateInventoryItem: (id: string, updates: Tables['inventory_items']['Update']) => Promise<void>;
  checkInventoryItemReferences: (id: string) => Promise<{
    salesCount: number;
    variancesCount: number;
    hasReferences: boolean;
  }>;
  deleteInventoryItem: (id: string) => Promise<void>;
  archiveInventoryItem: (id: string) => Promise<void>;
  unarchiveInventoryItem: (id: string) => Promise<void>;
  addInventoryBatch: (args: {
    supplier_id: string;
    created_by: string;
    status?: string | null;
    porterage_fee?: number | null;
    transfer_fee?: number | null;
    received_at?: string;
    commission_rate?: number;
    type: string;
    plastic_fee?: number | null;
    currency?: CurrencyCode;
    items: Array<Omit<Tables['inventory_items']['Insert'], 'store_id' | 'received_at'>>;
  }) => Promise<{ batchId: string; financialResult?: unknown }>;
  updateSale: (id: string, updates: Partial<BillLineItem>) => Promise<void>;
  deleteSale: (id: string) => Promise<void>;
  updateBillsForSaleItem: (saleItemId: string) => Promise<void>;
  addTransaction: (transaction: Omit<Tables['transactions']['Insert'], 'store_id'>) => Promise<void>;
  addExpenseCategory: (category: Omit<ExpenseCategory, 'id' | 'created_at'>) => Promise<void>;
  updateInventoryBatch: (id: string, updates: Partial<Tables['inventory_bills']['Update']>) => Promise<void>;
  deleteInventoryBatch: (id: string) => Promise<void>;
  applyCommissionRateToBatch: (batchId: string, commissionRate: number) => Promise<void>;

  createBill: (billData: CreateBillInput, lineItems: BillLineItemInput[], customerBalanceUpdate?: { customerId: string; amountDue: number; originalBalance: number }) => Promise<string>;
  updateBill: (billId: string, updates: Partial<Bill>, changedBy: string, changeReason?: string) => Promise<void>;
  deleteBill: (billId: string, deletedBy: string, deleteReason?: string, softDelete?: boolean) => Promise<void>;
  reactivateBill: (billId: string, reactivatedBy: string, reactivationReason?: string) => Promise<void>;
  getBills: (filters?: BillFilters) => Promise<Array<Bill & { line_items: BillLineItem[] }>>;
  getBillDetails: (billId: string) => Promise<BillDetails | null>;

  getStore: (storeId: string) => Promise<Tables['stores']['Row'] | null>;
  getBranchLogo: (branchId: string, storeId: string) => Promise<string | null>;
  getBranchById: (branchId: string) => Promise<Branch | undefined>;
  getFirstBranchForStore: (storeId: string) => Promise<Branch | null>;
  getUserById: (userId: string) => Promise<Tables['users']['Row'] | undefined>;
  getRolePermissionsByRole: (role: string) => Promise<RolePermission[]>;
  /**
   * RBAC — per-user module access overrides. Backed by the `user_permissions`
   * table: module access is the `access_<module>` operation layered over role
   * defaults. Returned rows are mapped to the `{ module, can_access }` shape the
   * UI expects. Only non-deleted `access_*` overrides are returned.
   */
  getUserModuleAccessOverrides: (userId: string, storeId: string) => Promise<UserModuleAccess[]>;
  /** Grant/block a module for a user (upserts the `access_<module>` override). */
  setUserModuleAccessOverride: (params: {
    userId: string;
    storeId: string;
    module: ModuleName;
    canAccess: boolean;
  }) => Promise<void>;
  /** Remove a module override, restoring the role default for that module. */
  removeUserModuleAccessOverride: (userId: string, storeId: string, module: ModuleName) => Promise<void>;
  /**
   * Audit viewer (Phase 4). Both getters are role-scoped at the data layer:
   * admin → whole store, manager → own branch, cashier → own actions only.
   */
  getAuditLogs: (filters?: AuditLogFilters) => Promise<AuditLogWithUser[]>;
  getEntityAuditLogs: (entityType: string, entityId: string) => Promise<AuditLogWithUser[]>;
  ensureDataReady: () => Promise<void>;
  getGlobalLogos: () => Promise<Array<{ name: string; url: string; path: string }>>;

  deductInventoryQuantity: (productId: string, quantity: number) => Promise<void>;
  restoreInventoryQuantity: (productId: string, quantity: number) => Promise<void>;

  refreshData: (scope?: RefreshScope) => Promise<void>;
  getStockLevels: () => DerivedStockLevel[];
  toggleLowStockAlerts: (enabled: boolean) => Promise<void>;
  updateLowStockThreshold: (threshold: number) => void;
  updateDefaultCommissionRate: (rate: number) => Promise<void>;
  updateCurrency: (newCurrency: CurrencyCode) => Promise<void>;
  updateExchangeRate: (rate: number) => Promise<void>;
  /** Phase 12: write a per-currency rate into stores.exchange_rates. */
  updateExchangeRateFor: (currency: CurrencyCode, rate: number) => Promise<void>;
  /** Phase 12: append `currency` to stores.accepted_currencies (with rate seed). */
  addAcceptedCurrency: (currency: CurrencyCode, rate?: number) => Promise<void>;
  /** Phase 12: remove `currency` from stores.accepted_currencies (rejects if in use). */
  removeAcceptedCurrency: (currency: CurrencyCode) => Promise<void>;
  updateLanguage: (language: 'en' | 'ar' | 'fr') => Promise<void>;
  receiptSettings: Partial<ReceiptSettings>;
  updateReceiptSettings: (settings: Partial<ReceiptSettings>) => Promise<void>;
  /** Plan A: fiscal year start (month 1-12, day 1-31). Defaults to (1, 1). */
  fiscalYearStartMonth: number;
  fiscalYearStartDay: number;
  updateFiscalYearStart: (month: number, day: number) => Promise<void>;

  sync: (isAutomatic?: boolean) => Promise<SyncResult>;
  fullResync: () => Promise<SyncResult>;
  debouncedSync: () => void;
  getSyncStatus: () => {
    isOnline: boolean;
    lastSync: Date | null;
    unsyncedCount: number;
    isSyncing: boolean;
    isAutoSyncing: boolean;
  };
  validateAndCleanData: () => Promise<{ cleaned: number; report: DataCleanReport }>;

  canUndo: boolean;
  undoLastAction: () => Promise<boolean>;
  pushUndo: (undoData: UndoAction) => void;
  testUndo?: () => void;

  processCashDrawerTransaction: (
    transactionData: {
      type: 'sale' | 'payment' | 'expense' | 'refund';
      amount: number;
      currency: CurrencyCode;
      description: string;
      reference: string;
      customerId?: string;
      supplierId?: string;
      storeId: string;
      createdBy: string;
    }
  ) => Promise<{
    success: boolean;
    transactionId?: string;
    previousBalance?: number;
    newBalance?: number;
    accountId?: string;
    error?: string;
  }>;

  createCashDrawerUndoData: (
    transactionId: string | undefined,
    previousBalance: number | undefined,
    accountId: string | undefined,
    additionalUndoData?: {
      affected: Array<{ table: string; id: string }>;
      steps: Array<{ op: string; table: string; id: string; changes?: unknown }>;
    }
  ) => UndoAction;

  createId: () => string;
  getCurrentCashDrawerBalance: (storeId: string) => Promise<number>;
  refreshCashDrawerBalance: (storeId: string) => Promise<number>;

  processPayment: (params: {
    entityType: 'customer' | 'supplier';
    entityId: string;
    amount: string;
    currency: CurrencyCode;
    description: string;
    reference: string;
    storeId: string;
    createdBy: string;
    paymentDirection: 'receive' | 'pay';
  }) => Promise<{
    success: boolean;
    error?: string;
  }>;

  processSupplierAdvance: (params: {
    supplierId: string;
    amount: number;
    currency: CurrencyCode;
    type: 'give' | 'deduct';
    description: string;
    date: string;
    reviewDate?: string;
  }) => Promise<void>;

  updateSupplierAdvance: (transactionId: string, updates: {
    supplierId: string;
    amount: number;
    currency: CurrencyCode;
    type: 'give' | 'deduct';
    description: string;
    date: string;
    reviewDate?: string;
  }) => Promise<void>;

  deleteSupplierAdvance: (transactionId: string) => Promise<void>;

  processEmployeePayment: (params: {
    employeeId: string;
    amount: string;
    currency: CurrencyCode;
    description: string;
    reference: string;
    storeId: string;
    createdBy: string;
  }) => Promise<{
    success: boolean;
    error?: string;
  }>;

  notifications: NotificationRecord[];
  unreadCount: number;
  notificationPreferences: NotificationPreferences;
  createNotification: (
    type: NotificationType,
    title: string,
    message: string,
    options?: {
      priority?: 'low' | 'medium' | 'high';
      action_url?: string;
      action_label?: string;
      metadata?: Record<string, unknown>;
      expires_at?: string;
    }
  ) => Promise<void>;
  markAsRead: (id: string) => Promise<void>;
  markAllAsRead: () => Promise<void>;
  deleteNotification: (id: string) => Promise<void>;
  updateNotificationPreferences: (prefs: Partial<NotificationPreferences>) => Promise<void>;
}
