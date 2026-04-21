/**
 * Public contract for useOfflineData() — kept separate so OfflineDataContext.tsx
 * stays focused on wiring (IMPROVEMENTS_ENHANCEMENTS_REPORT §1.3).
 */
import type { Database } from '../../types/database';
import type {
  Branch,
  Bill,
  BillAuditLog,
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
} from '../../types';
import type { InventoryItem } from '../../types/inventory';
import type { BalanceSnapshot, ChartOfAccounts, JournalEntry } from '../../types/accounting';
import type { SyncResult } from '../../services/syncOrchestrator';
import type { CurrencyCode } from '@pos-platform/shared';

type Tables = Database['public']['Tables'];

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
  bill_audit_logs: BillAuditLog[];
  // Back-compat aliases used by some UI callers
  line_items?: BillLineItem[];
  audit_logs?: BillAuditLog[];
};

/** Runtime tier hydration progress (not persisted — see incremental sync redesign). */
export type OfflineSyncSessionState = {
  isColdStart: boolean;
  tier1Complete: boolean;
  tier2Complete: boolean;
  tier3Complete: boolean;
  connectivity: 'online' | 'offline';
  startedAt: number;
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
  billAuditLogs: BillAuditLog[];
  missedProducts: MissedProduct[];

  journalEntries: JournalEntry[];
  entities: Tables['entities']['Row'][];
  chartOfAccounts: ChartOfAccounts[];
  balanceSnapshots: BalanceSnapshot[];

  stockLevels: DerivedStockLevel[];
  setStockLevels: (levels: DerivedStockLevel[]) => void;
  lowStockAlertsEnabled: boolean;
  lowStockThreshold: number;
  defaultCommissionRate: number;
  currency: CurrencyCode;
  preferredCurrency: CurrencyCode;
  acceptedCurrencies: CurrencyCode[];
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
  createBillAuditLog: (auditData: Omit<BillAuditLog, 'id' | 'store_id' | 'created_at' | '_synced'>) => Promise<void>;

  getStore: (storeId: string) => Promise<Tables['stores']['Row'] | null>;
  getBranchLogo: (branchId: string, storeId: string) => Promise<string | null>;
  getBranchById: (branchId: string) => Promise<Branch | undefined>;
  getFirstBranchForStore: (storeId: string) => Promise<Branch | null>;
  getUserById: (userId: string) => Promise<Tables['users']['Row'] | undefined>;
  getRolePermissionsByRole: (role: string) => Promise<RolePermission[]>;
  ensureDataReady: () => Promise<void>;
  getGlobalLogos: () => Promise<Array<{ name: string; url: string; path: string }>>;

  deductInventoryQuantity: (productId: string, quantity: number) => Promise<void>;
  restoreInventoryQuantity: (productId: string, quantity: number) => Promise<void>;

  refreshData: () => Promise<void>;
  getStockLevels: () => DerivedStockLevel[];
  toggleLowStockAlerts: (enabled: boolean) => Promise<void>;
  updateLowStockThreshold: (threshold: number) => void;
  updateDefaultCommissionRate: (rate: number) => Promise<void>;
  updateCurrency: (newCurrency: CurrencyCode) => Promise<void>;
  updateExchangeRate: (rate: number) => Promise<void>;
  updateLanguage: (language: 'en' | 'ar' | 'fr') => Promise<void>;
  receiptSettings: Partial<ReceiptSettings>;
  updateReceiptSettings: (settings: Partial<ReceiptSettings>) => Promise<void>;

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
