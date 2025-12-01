import { createContext, useContext, useState, useEffect, useRef, useCallback, ReactNode } from 'react';
import { useSupabaseAuth } from './SupabaseAuthContext';
import { useNetworkStatus } from '../hooks/useNetworkStatus';
import { Database } from '../types/database';
import { BillLineItem, BillLineItemTransforms, NotificationRecord, NotificationType, NotificationPreferences, InventoryItem, Transaction } from '../types';
import {
  db,
  createId,
} from '../lib/db';
import { InventoryPurchaseService } from '../services/inventoryPurchaseService';
import { syncService, SyncResult } from '../services/syncService';
import { crudHelperService } from '../services/crudHelperService';
import { notificationService } from '../services/notificationService';
import { receivedBillMonitoringService } from '../services/receivedBillMonitoringService';
import { reminderMonitoringService } from '../services/reminderMonitoringService';
import { 
  generatePaymentReference, 
  generateSaleReference, 
  generateAdvanceReference,
  generateReversalReference
} from '../utils/referenceGenerator';
import { PAYMENT_CATEGORIES } from '../constants/paymentCategories';
import { transactionService } from '../services/transactionService';
import { TRANSACTION_CATEGORIES } from '../constants/transactionCategories';
import { ensureDefaultBranch } from '../lib/branchHelpers';

// Removed SupabaseService import - using offline-first approach only

type Tables = Database['public']['Tables'];

// Offline-first data context interface
interface OfflineDataContextType {
  storeId: any;
  // Branch context (automatic - no manual selection)
  currentBranchId: string | null;
  // Data - matching exact structure
  products: Tables['products']['Row'][];
  suppliers: Tables['suppliers']['Row'][];
  customers: Tables['customers']['Row'][];
  employees: Tables['users']['Row'][];
  sales: BillLineItem[]; // Unified BillLineItem interface
  inventory: any[]; // Complex type with joins (mapped from inventoryItems)
  inventoryBills: any[]; // Inventory bills data
  transactions: Tables['transactions']['Row'][];
  expenseCategories: any[]; // Not in current schema
  bills: any[]; // Bill management data
  billLineItems: any[]; // Bill line items data
  billAuditLogs: any[]; // Bill audit logs data
  missedProducts: any[]; // Missed products data
  
  // NEW: Accounting foundation data
  journalEntries: any[]; // Journal entries for double-entry bookkeeping
  entities: any[]; // Unified customer/supplier/employee entities
  chartOfAccounts: any[]; // Chart of accounts configuration
  balanceSnapshots: any[]; // Balance snapshots for performance


  // Computed/legacy compatibility - exact match
  stockLevels: any[];
  setStockLevels: (levels: any[]) => void;
  lowStockAlertsEnabled: boolean;
  lowStockThreshold: number;
  defaultCommissionRate: number;
  currency: 'USD' | 'LBP';
  exchangeRate: number;
  language: 'en' | 'ar' | 'fr';
  cashDrawer: any;
  openCashDrawer: (amount: number, openedBy: string) => void;
  closeCashDrawer: (actualAmount: number, closedBy: string, notes?: string) => void;
  getCashDrawerBalanceReport: (startDate?: string, endDate?: string) => Promise<any>;
  getCurrentCashDrawerStatus: () => Promise<any>;
  getCashDrawerSessionDetails: (sessionId: string) => Promise<any>;
  getRecommendedOpeningAmount: () => Promise<{
    amount: number;
    source: 'previous_session' | 'default';
    previousSessionId?: string;
    previousEmployee?: string;
  }>;
  refreshCashDrawerStatus: () => Promise<void>;
  isOnline: boolean;

  // Loading states - exact match
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

  // CRUD operations - exact function signatures
  addProduct: (product: Omit<Tables['products']['Insert'], 'store_id'>) => Promise<void>;
  addSupplier: (supplier: Omit<Tables['suppliers']['Insert'], 'store_id'>) => Promise<void>;
  addCustomer: (customer: Omit<Tables['customers']['Insert'], 'store_id'>) => Promise<void>;
  updateCustomer: (id: string, updates: Tables['customers']['Update']) => Promise<void>;
  updateSupplier: (id: string, updates: Tables['suppliers']['Update']) => Promise<void>;
  updateProduct: (id: string, updates: Tables['products']['Update']) => Promise<void>;
  deleteProduct: (id: string) => Promise<void>;
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
  addInventoryBatch: (args: {
    supplier_id: string;
    created_by: string;
    status?: string | null;
    porterage_fee?: number | null;
    transfer_fee?: number | null;
    received_at?: string;
    commission_rate?: number,
    type: string,
    plastic_fee?: number | null;
    currency?: 'USD' | 'LBP';
    items: Array<Omit<Tables['inventory_items']['Insert'], 'store_id' | 'received_at'>>;
  }) => Promise<{ batchId: string; financialResult?: any }>;
  addSale: (items: any[]) => Promise<void>;
  updateSale: (id: string, updates: Partial<BillLineItem>) => Promise<void>;
  deleteSale: (id: string) => Promise<void>;
  updateBillsForSaleItem: (saleItemId: string) => Promise<void>;
  addTransaction: (transaction: Omit<Tables['transactions']['Insert'], 'store_id'>) => Promise<void>;
  addExpenseCategory: (category: any) => Promise<void>;
  updateInventoryBatch: (id: string, updates: Partial<Tables['inventory_bills']['Update']>) => Promise<void>;
  applyCommissionRateToBatch: (batchId: string, commissionRate: number) => Promise<void>;

  // Bill management operations
  createBill: (billData: any, lineItems: any[], customerBalanceUpdate?: { customerId: string; amountDue: number; originalBalance: number }) => Promise<string>;
  updateBill: (billId: string, updates: any, changedBy: string, changeReason?: string) => Promise<void>;
  deleteBill: (billId: string, deletedBy: string, deleteReason?: string, softDelete?: boolean) => Promise<void>;
  getBills: (filters?: any) => Promise<any[]>;
  getBillDetails: (billId: string) => Promise<any | null>;
  createBillAuditLog: (auditData: any) => Promise<void>;

  // Store operations
  getStore: (storeId: string) => Promise<any | null>;


  deductInventoryQuantity: (productId: string, supplierId: string, quantity: number) => Promise<void>;
  restoreInventoryQuantity: (productId: string, supplierId: string, quantity: number) => Promise<void>;

  // Utility functions - exact match
  refreshData: () => Promise<void>;
  getStockLevels: () => any[];
  toggleLowStockAlerts: (enabled: boolean) => Promise<void>;
  updateLowStockThreshold: (threshold: number) => void;
  updateDefaultCommissionRate: (rate: number) => Promise<void>;
  updateCurrency: (newCurrency: 'USD' | 'LBP') => Promise<void>;
  updateExchangeRate: (rate: number) => Promise<void>;
  updateLanguage: (language: 'en' | 'ar' | 'fr') => Promise<void>;
  receiptSettings: any;
  updateReceiptSettings: (settings: any) => Promise<void>;

  // Additional offline-specific features
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
  validateAndCleanData: () => Promise<{ cleaned: number; report: any }>;

  // Undo functionality
  canUndo: boolean;
  undoLastAction: () => Promise<boolean>;
  pushUndo: (undoData: any) => void;
  testUndo?: () => void; // Debug function

  // Cash drawer transaction utility
  processCashDrawerTransaction: (
    transactionData: {
      type: 'sale' | 'payment' | 'expense' | 'refund';
      amount: number;
      currency: 'USD' | 'LBP';
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

  // Helper function to create cash drawer undo data
  createCashDrawerUndoData: (
    transactionId: string | undefined,
    previousBalance: number | undefined,
    accountId: string | undefined,
    additionalUndoData?: {
      affected: Array<{ table: string; id: string }>;
      steps: Array<{ op: string; table: string; id: string; changes?: any }>;
    }
  ) => any;
  
  // Utility functions
  createId: () => string;
  getCurrentCashDrawerBalance: (storeId: string) => Promise<number>;
  refreshCashDrawerBalance: (storeId: string) => Promise<number>;
  
  // Unified payment processing
  processPayment: (params: {
    entityType: 'customer' | 'supplier';
    entityId: string;
    amount: string;
    currency: 'USD' | 'LBP';
    description: string;
    reference: string;
    storeId: string;
    createdBy: string;
    paymentDirection: 'receive' | 'pay'; // 'receive' = they pay us, 'pay' = we pay them
  }) => Promise<{
    success: boolean;
    error?: string;
  }>;

  // Supplier advance processing
  processSupplierAdvance: (params: {
    supplierId: string;
    amount: number;
    currency: 'USD' | 'LBP';
    type: 'give' | 'deduct';
    description: string;
    date: string;
    reviewDate?: string;
  }) => Promise<void>;

  // Update supplier advance transaction
  updateSupplierAdvance: (transactionId: string, updates: {
    supplierId: string;
    amount: number;
    currency: 'USD' | 'LBP';
    type: 'give' | 'deduct';
    description: string;
    date: string;
    reviewDate?: string;
  }) => Promise<void>;

  // Delete supplier advance transaction
  deleteSupplierAdvance: (transactionId: string) => Promise<void>;

  // Process employee payment
  processEmployeePayment: (params: {
    employeeId: string;
    amount: string;
    currency: 'USD' | 'LBP';
    description: string;
    reference: string;
    storeId: string;
    createdBy: string;
  }) => Promise<{
    success: boolean;
    error?: string;
  }>;

  // Notification management
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
      metadata?: Record<string, any>;
      expires_at?: string;
    }
  ) => Promise<void>;
  markAsRead: (id: string) => Promise<void>;
  markAllAsRead: () => Promise<void>;
  deleteNotification: (id: string) => Promise<void>;
  updateNotificationPreferences: (prefs: Partial<NotificationPreferences>) => Promise<void>;
}

const OfflineDataContext = createContext<OfflineDataContextType | undefined>(undefined);

// Debug mode - set to false in production to reduce console noise
const DEBUG = false;
const debug = (...args: any[]) => DEBUG && console.log(...args);

export function OfflineDataProvider({ children }: { children: ReactNode }) {
  const { userProfile } = useSupabaseAuth();
  const { isOnline, justCameOnline } = useNetworkStatus();
  const storeId = userProfile?.store_id;
  const hasLoggedNoProfile = useRef(false);
  const autoSyncTimerRef = useRef<NodeJS.Timeout | null>(null);

  debug('🔍 OfflineDataProvider: userProfile:', userProfile, 'storeId:', storeId, 'isOnline:', isOnline, 'justCameOnline:', justCameOnline);

  // Data states - offline-first structure
  const [products, setProducts] = useState<Tables['products']['Row'][]>([]);
  const [suppliers, setSuppliers] = useState<Tables['suppliers']['Row'][]>([]);
  const [customers, setCustomers] = useState<Tables['customers']['Row'][]>([]);
  const [employees, setEmployees] = useState<Tables['users']['Row'][]>([]);
  const [sales, setSales] = useState<BillLineItem[]>([]);
  const [inventory, setInventory] = useState<any[]>([]);
  const [transactions, setTransactions] = useState<Tables['transactions']['Row'][]>([]);
  const [expenseCategories] = useState<any[]>([]);

  // Raw internal data
  const [inventoryItems, setInventoryItems] = useState<InventoryItem[]>([]);
  const [inventoryBills, setInventoryBills] = useState<any[]>([]);
  const [bills, setBills] = useState<any[]>([]);
  const [billLineItems, setBillLineItems] = useState<any[]>([]);
  const [billAuditLogs, setBillAuditLogs] = useState<any[]>([]);
  const [missedProducts, setMissedProducts] = useState<any[]>([]);
  const [notifications, setNotifications] = useState<NotificationRecord[]>([]);
  const [notificationPreferences, setNotificationPreferences] = useState<NotificationPreferences | null>(null);
  
  // NEW: Accounting foundation data states
  const [journalEntries, setJournalEntries] = useState<any[]>([]);
  const [entities, setEntities] = useState<any[]>([]);
  const [chartOfAccounts, setChartOfAccounts] = useState<any[]>([]);
  const [balanceSnapshots, setBalanceSnapshots] = useState<any[]>([]);

  // Loading states - exact match
  const [loading, setLoading] = useState({
    sync: false,
    products: false,
    suppliers: false,
    customers: false,
    employees: false,
    sales: false,
    inventory: false,
    transactions: false,
    expenseCategories: false,
    bills: false
  });

  // Sync state
  const [lastSync, setLastSync] = useState<Date | null>(null);
  const [unsyncedCount, setUnsyncedCount] = useState(0);
  const [isSyncing, setIsSyncing] = useState(false);
  const [isAutoSyncing, setIsAutoSyncing] = useState(false);

  // Debounced sync to prevent excessive sync calls during rapid changes
  const [debouncedSyncTimeout, setDebouncedSyncTimeout] = useState<NodeJS.Timeout | null>(null);

  // Undo state - check localStorage on initialization
  const [canUndo, setCanUndo] = useState(() => {
    const undoData = localStorage.getItem('last_undo_action');
    return !!undoData;
  });

  // Settings states - loaded from IndexedDB stores table
  const [lowStockAlertsEnabled, setLowStockAlertsEnabled] = useState<boolean>(true);
  const [lowStockThreshold, setLowStockThreshold] = useState<number>(() => {
    const stored = localStorage.getItem('lowStockThreshold');
    return stored ? parseInt(stored, 10) : 10;
  });
  const [defaultCommissionRate, setDefaultCommissionRate] = useState<number>(10);
  const [currency, setCurrency] = useState<'USD' | 'LBP'>('LBP');
  const [exchangeRate, setExchangeRate] = useState<number>(89500);
  const [language, setLanguage] = useState<'en' | 'ar' | 'fr'>('ar');
  const [cashDrawer, setCashDrawer] = useState<any>(null);
  const [stockLevels, setStockLevels] = useState<any[]>([]);
  
  // Branch state - automatically determined (no manual selection)
  const [currentBranchId, setCurrentBranchId] = useState<string | null>(null);
  
  const [receiptSettings, setReceiptSettings] = useState<any>(() => {
    const stored = localStorage.getItem('receiptSettings');
    return stored ? JSON.parse(stored) : {
      storeName: 'KIWI VEGETABLES MARKET',
      address: '63-B2-Whole Sale Market, Tripoli - Lebanon',
      phone1: '+961 70 123 456',
      phone1Name: 'Samir',
      phone2: '03 123 456',
      phone2Name: 'Mohammad',
      thankYouMessage: 'Thank You!',
      billNumberPrefix: '000',
      showPreviousBalance: true,
      showItemCount: true,
      receiptWidth: 32
    };
  });



  // Load store data and settings from IndexedDB
  const loadStoreData = async () => {
    if (!storeId) return;

    try {
      // Load store data from IndexedDB
      const existingStore = await db.stores.where('id').equals(storeId).first();

      if (existingStore) {
        // Use existing store data
        debug('📦 Using cached store data:', existingStore);

        // Update settings from store data
        if (existingStore.preferred_currency) {
          setCurrency(existingStore.preferred_currency);
        }
        if (existingStore.preferred_commission_rate !== undefined) {
          setDefaultCommissionRate(existingStore.preferred_commission_rate);
        }
        if (existingStore.low_stock_alert !== undefined) {
          setLowStockAlertsEnabled(existingStore.low_stock_alert);
        }
        if (existingStore.exchange_rate !== undefined) {
          setExchangeRate(existingStore.exchange_rate);
          
          // Initialize CurrencyService with store's exchange rate
          const { CurrencyService } = await import('../services/currencyService');
          await CurrencyService.getInstance().refreshExchangeRate(storeId);
        }
        if (existingStore.preferred_language) {
          setLanguage(existingStore.preferred_language);
        }

        // Load cash drawer status from IndexedDB
        await refreshCashDrawerStatus();
      } else {
        // Store not found locally - will be synced when connection is available
        debug('📴 Store data not found locally - will sync when online');
        // Use default values for now
        setCurrency('LBP');
        setDefaultCommissionRate(10);
        setExchangeRate(89500);
        setLowStockAlertsEnabled(true);
      }
    } catch (error) {
      console.error('❌ Error loading store data:', error);
      // Use default values on error
      setCurrency('LBP');
      setDefaultCommissionRate(10);
      setExchangeRate(89500);
    }
  };

  // Initialize data when store is available
  useEffect(() => {
    if (storeId) {
      loadStoreData();
      initializeData();
      // initializeExchangeRates();
      // Check undo validity after data is loaded
      setTimeout(() => checkUndoValidity(), 1000);
    }
    
    // Cleanup real-time sync when storeId changes or component unmounts
    return () => {
      if (storeId) {
      }
    };
  }, [storeId, isOnline]);

  // Initialize branch - automatically determine branch for this store
  useEffect(() => {
    const initializeBranch = async () => {
      if (storeId && !currentBranchId) {
        try {
          const branchId = await ensureDefaultBranch(storeId);
          console.log("Branch Id Value: ",branchId)
          setCurrentBranchId(branchId);
          console.log('✅ Auto-initialized branch for store:', branchId);
        } catch (error) {
          console.error('❌ Failed to auto-initialize branch:', error);
        }
      }
    };
    
    initializeBranch();
  }, [storeId, currentBranchId]);

  // Helper functions defined before they're used
  const refreshCashDrawerStatus = useCallback(async () => {
  if (!storeId || !currentBranchId) return;

  try {
    const status = await db.getCurrentCashDrawerStatus(storeId, currentBranchId);
    if (status && status.status === 'active') {
      // Update local state with current session info
      setCashDrawer({
        id: status.sessionId,
        accountId: status.accountId,
        status: 'open',
        currentBalance: status.currentBalance,
        currency: currency,
        lastUpdated: new Date().toISOString()
      });

    } else {
      // No active session
      setCashDrawer(null);
    }
  } catch (error) {
    console.error('Error refreshing cash drawer status:', error);
  }
}, [storeId, currency]);
  const refreshData = useCallback(async () => {
    if (!storeId) return;

    debug('🔄 Refreshing data for store:', storeId);

    try {
      // Load all data from IndexedDB using optimized batch loading
      const {
        productsData,
        suppliersData,
        customersData,
        employeesData,
        inventoryData,
        transactionsData,
        batchesData,
        billsData,
        billLineItemsData,
        billAuditLogsData,
        cashDrawerAccountsData,
        cashDrawerSessionsData,
        missedProductsData,
        // NEW: Accounting foundation data
        journalEntriesData,
        entitiesData,
        chartOfAccountsData,
        balanceSnapshotsData,
      } = await crudHelperService.loadAllStoreData(storeId, currentBranchId);
      
      console.log(`🔄 refreshData: Loaded ${customersData.length} customers, ${suppliersData.length} suppliers, ${employeesData.length} employees`);
      console.log('🔄 refreshData: Latest customers:', customersData.slice(-3));
      console.log('🔄 refreshData: Latest suppliers:', suppliersData.slice(-3));
      console.log(`🔄 refreshData: Loaded ${inventoryData.length} inventory_items, ${batchesData.length} inventory_bills`);
      console.log(`🔄 refreshData: Loaded ${productsData.length} products (including global products)`);
      console.log('🔄 refreshData: Products from DB:', productsData.map((p: any) => ({ id: p.id, name: p.name, is_global: p.is_global, store_id: p.store_id })));
      
      // Count global vs store products
      const globalCount = productsData.filter((p: any) => p.is_global === true || p.is_global === 1).length;
      const storeCount = productsData.length - globalCount;
      console.log(`🔄 refreshData: Breakdown - ${storeCount} store products + ${globalCount} global products`);

      debug(`📊 Loaded data: ${productsData.length} products, ${suppliersData.length} suppliers, ${customersData.length} customers, ${employeesData.length} employees, ${inventoryData.length} inventory items, ${batchesData.length} inventory bills, ${billLineItemsData.length} bill line items, ${transactionsData.length} transactions, ${billsData.length} bills, ${cashDrawerAccountsData.length} cash drawer accounts, ${cashDrawerSessionsData.length} cash drawer sessions`);

      // Transform data for offline-first structure
      console.log('🔄 refreshData: About to set products in state, count:', productsData.length);
      setProducts(productsData as Tables['products']['Row'][]);
      console.log('🔄 refreshData: Products state updated');
      setSuppliers(suppliersData.map((s: any) => ({ ...s, lb_balance: s.lb_balance || 0, usd_balance: s.usd_balance || 0 })) as Tables['suppliers']['Row'][]);
      setCustomers(customersData.map((c: any) => ({ ...c, lb_balance: c.lb_balance || 0, usd_balance: c.usd_balance || 0 })) as Tables['customers']['Row'][]);
      setEmployees(employeesData.map((e: any) => ({ ...e, lbp_balance: e.lbp_balance || 0, usd_balance: e.usd_balance || 0 })) as Tables['users']['Row'][]);
      setTransactions(transactionsData as unknown as Tables['transactions']['Row'][]);

      // Store raw data
      setInventoryItems(inventoryData);
      setInventoryBills(batchesData);
      
      // NEW: Set accounting foundation data
      setJournalEntries(journalEntriesData || []);
      setEntities(entitiesData || []);
      setChartOfAccounts(chartOfAccountsData || []);
      setBalanceSnapshots(balanceSnapshotsData || []);
      
      console.log(`🔄 refreshData: Loaded ${journalEntriesData?.length || 0} journal entries, ${entitiesData?.length || 0} entities, ${chartOfAccountsData?.length || 0} chart accounts, ${balanceSnapshotsData?.length || 0} balance snapshots`);

      // Transform bill line items to unified SaleItem interface for backward compatibility
      const transformedSaleItems: BillLineItem[] = await Promise.all(
        billLineItemsData.map(async (item: any) => {
          // Get product and supplier names


          return BillLineItemTransforms.fromDbRow(
            {
              id: item.id,
              store_id: item.store_id,
              inventory_item_id: item.inventory_item_id || null,
              product_id: item.product_id,
              quantity: item.quantity,
              weight: item.weight,
              unit_price: item.unit_price,
              received_value: item.received_value,
              notes: item.notes,
              created_at: item.created_at,
              bill_id: item.bill_id,
              line_total: item.line_total,
              line_order: item.line_order,
              updated_at: item.updated_at,
              branch_id: item.branch_id
            }
          );
        })
      );

      setSales(transformedSaleItems); // Update the main sales state
      setBills(billsData);
      setBillLineItems(billLineItemsData);
      setBillAuditLogs(billAuditLogsData);
      setMissedProducts(missedProductsData);

      // Load notifications and preferences
      const notificationsData = await notificationService.getNotifications(storeId, { limit: 100 });
      setNotifications(notificationsData);
      
      const preferencesData = await notificationService.getPreferences(storeId);
      setNotificationPreferences(preferencesData);

      // Transform inventory to match expected structure and attach batch info for grouping/export
      const batchById = (batchesData || []).reduce((acc: any, b: any) => {
        acc[b.id] = b;
        return acc;
      }, {});

      setInventory(inventoryData.map((item: any) => {
        const batch = item.batch_id ? batchById[item.batch_id] : null;
        return {
          ...item,
          commission_rate: batch ? batch.commission_rate : null,
          batch_type: batch ? batch.type : null,
          batch_porterage: batch ? batch.porterage_fee : null,
          batch_transfer_fee: batch ? batch.transfer_fee : null,
          batch_status: batch ? batch.status : 'Created',
        };
      }));

      // Refresh cash drawer status
      await refreshCashDrawerStatus();

      // Clean up expired notifications
      await notificationService.deleteExpiredNotifications(storeId);

      debug('✅ Data refresh completed successfully');

    } catch (error) {
      console.error('❌ Error loading data from Dexie:', error);
    }
  }, [storeId, currentBranchId, refreshCashDrawerStatus]);

  // Setup real-time update listeners (separate effect to avoid refreshData dependency issue)
  useEffect(() => {
    if (!isOnline || !storeId) return;

  }, [storeId, isOnline, refreshData]);
  const initializeData = async () => {
    if (!storeId) return;

    debug('🔄 Initializing data for store:', storeId);

    try {
      // Clean up any invalid/orphaned data first
      const [invalidCleaned, orphanedCleaned] = await Promise.all([
        db.cleanupInvalidInventoryItems(),
        db.cleanupOrphanedRecords(storeId)
      ]);

      if (invalidCleaned > 0 || orphanedCleaned > 0) {
        debug(`🧹 Total cleanup: ${invalidCleaned + orphanedCleaned} records removed`);
      }

      // Clean up duplicate cash drawer accounts
      try {
        const { cashDrawerUpdateService } = await import('../services/cashDrawerUpdateService');
        const cleanupResult = await cashDrawerUpdateService.cleanupDuplicateAccounts(storeId);
        if (cleanupResult.success && cleanupResult.duplicatesRemoved > 0) {
          debug(`🧹 Cleaned up ${cleanupResult.duplicatesRemoved} duplicate cash drawer accounts`);
        }
      } catch (cleanupError) {
        console.warn('Failed to cleanup duplicate cash drawer accounts:', cleanupError);
      }

      debug('📊 Loading local data...');
      // Load local data first
      await refreshDataAndUpdateCount();

      // Check if local database is empty (no essential data)
      // For products, include both store-specific and global products
      const [storeProductCount, globalProductCount, supplierCount, customerCount] = await Promise.all([
        db.products.where('store_id').equals(storeId).filter(item => !item._deleted).count(),
        db.products.where('is_global').equals(1).filter(item => !item._deleted).count(), // Dexie stores boolean as 0 or 1
        db.suppliers.where('store_id').equals(storeId).filter(item => !item._deleted).count(),
        db.customers.where('store_id').equals(storeId).filter(item => !item._deleted).count()
      ]);
      const productCount = storeProductCount + globalProductCount;

      debug(`📈 Local data counts: ${productCount} products, ${supplierCount} suppliers, ${customerCount} customers`);

      const isLocalDatabaseEmpty = productCount === 0 && supplierCount === 0 && customerCount === 0;

      // If local database is empty and we're online, sync from cloud
      if (isLocalDatabaseEmpty && isOnline) {
        debug('📥 Local database is empty, syncing from cloud...');
        setLoading(prev => ({ ...prev, sync: true }));

        try {
          const syncResult = await syncService.fullResync(storeId);

          if (syncResult.success) {
            debug(`✅ Initial sync completed: downloaded ${syncResult.synced.downloaded} records`);
            await refreshDataAndUpdateCount();
          } else {
            console.error('❌ Initial sync failed:', syncResult.errors);
          }
        } catch (error) {
          console.error('❌ Initial sync error:', error);
        } finally {
          setLoading(prev => ({ ...prev, sync: false }));
        }
      } else if (isLocalDatabaseEmpty && !isOnline) {
        debug('📴 Local database is empty but offline - will sync when connection is restored');
      } else if (!isLocalDatabaseEmpty) {
        debug(`📊 Local database loaded: ${productCount} products, ${supplierCount} suppliers, ${customerCount} customers`);

        // If we have local data and we're online, perform a regular sync to get updates
        if (isOnline && unsyncedCount === 0) {
          debug('🔄 Performing background sync to check for updates...');
          performSync(true); // Auto sync without blocking UI
        }
      }

    } catch (error) {
      console.error('❌ Data initialization failed:', error);
      // Still try to load what we can from local storage
      await refreshDataAndUpdateCount();
    }

    // Run migrations for existing transactions after data loads
    await migrateExistingTransactions();
    await migrateTransactionIds();

    // Start monitoring for completed bills
    if (storeId) {
      receivedBillMonitoringService.startMonitoring(storeId);
      reminderMonitoringService.startMonitoring(storeId);
    }
  };

  // Migration: Fix transaction IDs with old format to proper UUIDs
  const migrateTransactionIds = async () => {
    if (!storeId) return;

    try {
      const { TransactionIdMigration } = await import('../utils/transactionIdMigration');
      
      // Check if migration is needed
      const hasOldFormat = await TransactionIdMigration.hasOldFormatTransactions(storeId);
      if (!hasOldFormat) {
        return; // No migration needed
      }

      console.log('🔄 [MIGRATION] Starting transaction ID migration...');
      const result = await TransactionIdMigration.migrateTransactionIds(storeId);
      
      if (result.success) {
        console.log(`✅ [MIGRATION] Successfully migrated ${result.migratedCount} transaction IDs`);
        // Refresh data to reflect changes
        await refreshDataAndUpdateCount();
      } else {
        console.error('❌ [MIGRATION] Transaction ID migration failed:', result.errors);
      }
    } catch (error) {
      console.error('❌ [MIGRATION] Transaction ID migration error:', error);
    }
  };

  // Migration: Fix existing transactions with large LBP amounts
  const migrateExistingTransactions = async () => {
    if (!storeId) return;

    // Check if migration has already been run
    const migrationKey = `transaction_migration_${storeId}`;
    const alreadyMigrated = localStorage.getItem(migrationKey);
    if (alreadyMigrated) return;

    try {
      // Mark migration as complete - we now handle precision issues during sync
      // This is system state, so localStorage is appropriate
      localStorage.setItem(migrationKey, new Date().toISOString());
      debug('✅ Transaction migration completed - precision issues now handled during sync');
    } catch (error) {
      console.error('❌ Transaction migration failed:', error);
    }
  };

  // Auto-sync when connection is restored
  useEffect(() => {
    if (justCameOnline && storeId && !isSyncing) {
      console.log('🌐 [CONNECTION] Connection restored, triggering sync...');
      handleConnectionRestored();
    }
  }, [justCameOnline, storeId, isSyncing]);

  const handleConnectionRestored = async () => {
    if (!storeId) return;

    debug('🌐 Connection restored - checking what to sync...');

    try {
      // Check if local database is empty
      // For products, include both store-specific and global products
      const [storeProductCount, globalProductCount, supplierCount, customerCount] = await Promise.all([
        db.products.where('store_id').equals(storeId).filter(item => !item._deleted).count(),
        db.products.where('is_global').equals(1).filter(item => !item._deleted).count(), // Dexie stores boolean as 0 or 1
        db.suppliers.where('store_id').equals(storeId).filter(item => !item._deleted).count(),
        db.customers.where('store_id').equals(storeId).filter(item => !item._deleted).count()
      ]);
      const productCount = storeProductCount + globalProductCount;

      const isLocalDatabaseEmpty = productCount === 0 && supplierCount === 0 && customerCount === 0;

      if (isLocalDatabaseEmpty) {
        debug('📥 Connection restored with empty database - performing full sync...');
        setLoading(prev => ({ ...prev, sync: true }));

        try {
          const syncResult = await syncService.fullResync(storeId);

          if (syncResult.success) {
            debug(`✅ Full sync after connection restore completed: downloaded ${syncResult.synced.downloaded} records`);
            await refreshDataAndUpdateCount();
          } else {
            console.error('❌ Full sync after connection restore failed:', syncResult.errors);
          }
        } finally {
          setLoading(prev => ({ ...prev, sync: false }));
        }
      } else {
        debug('🔄 Connection restored with local data - performing regular sync...');
        performSync(true); // Regular sync for updates and uploads
      }
    } catch (error) {
      console.error('❌ Connection restore sync error:', error);
      // Fallback to regular sync
      performSync(true);
    }
  };

  // Auto-sync on window focus when online (for when user returns to tab)
  useEffect(() => {
    let autoSyncTimeout: NodeJS.Timeout;

    const debouncedAutoSync = () => {
      if (isOnline && storeId && !isSyncing && unsyncedCount > 0) {
        // Clear any existing timeout
        if (autoSyncTimeout) {
          clearTimeout(autoSyncTimeout);
        }

        // Debounce auto-sync calls
        autoSyncTimeout = setTimeout(() => {
          console.log('👀 [FOCUS-SYNC] Auto-syncing on focus/visibility change...');
          console.log('👀 [FOCUS-SYNC] Unsynced count:', unsyncedCount);
          performSync(true);
        }, 1000); // 1 second debounce
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
      if (autoSyncTimeout) {
        clearTimeout(autoSyncTimeout);
      }
    };
  }, [isOnline, storeId, isSyncing, unsyncedCount]);

  // Update stock levels when inventory, products, or suppliers change
  useEffect(() => {
    updateStockLevels();
  }, [inventoryItems, products, suppliers, lowStockAlertsEnabled, lowStockThreshold]);

 

  const checkUndoValidity = useCallback(async () => {
    const undoData = localStorage.getItem('last_undo_action');
    if (!undoData) {
      setCanUndo(false);
      return;
    }

    const action = JSON.parse(undoData);
    let isValid = true;

    for (const item of action.affected || []) {
      const record = await (db as any)[item.table].get(item.id);
      if (!record) {
        isValid = false;
        break;
      }

      // Allow undo for cash_drawer_accounts even if synced (only balance changes)
      if (record._synced && item.table !== 'cash_drawer_accounts') {
        isValid = false;
        break;
      }
    }

    if (!isValid) {
      localStorage.removeItem('last_undo_action');
      setCanUndo(false);
    }
  }, []);

  // Simplified using crudHelperService
  const updateUnsyncedCount = useCallback(async () => {
    try {
      const { total, byTable } = await crudHelperService.getUnsyncedCount();
      
      // Log unsynced records by table (only non-zero counts)
      const unsyncedTables = Object.entries(byTable)
        .filter(([_, count]) => count > 0)
        .map(([table, count]) => ({ table, count }));
      
      if (unsyncedTables.length > 0) {
        debug('🔍 Unsynced records by table:', unsyncedTables);
        
        // Get detailed breakdown for debugging sync discrepancies
        const detailedCount = await crudHelperService.getDetailedUnsyncedCount();
        if (total > 0) {
          console.log('🔍 [COUNT-DEBUG] Detailed breakdown:', detailedCount.summary);
        }
      }
      
      setUnsyncedCount(total);
    } catch (error) {
      console.error('Error counting unsynced records:', error);
    }
  }, []);

  // Simplified helper function using crudHelperService
  const getCurrentUnsyncedCount = async (): Promise<number> => {
    try {
      const { total } = await crudHelperService.getUnsyncedCount();
      return total;
    } catch (error) {
      console.error('Error counting unsynced records:', error);
      return 0;
    }
  };

  // Helper function to refresh data and update unsynced count
  const refreshDataAndUpdateCount = async () => {
    await refreshData();
    await updateUnsyncedCount();
  };

  // Reset auto-sync timer on every data change - optimized with debouncing
  const resetAutoSyncTimer = useCallback(() => {
    // Clear existing timer
    if (autoSyncTimerRef.current) {
      console.log('🔄 [AUTO-SYNC] Resetting auto-sync timer (clearing existing timer)');
      clearTimeout(autoSyncTimerRef.current);
      autoSyncTimerRef.current = null;
    }

    // Always set new timer if online (we'll check unsyncedCount when timer fires)
    if (isOnline && storeId && !isSyncing) {
      // Use shorter delay for immediate changes, longer for idle state
      const syncDelay = unsyncedCount > 0 ? 5000 : 30000; // 5s for active changes, 30s for idle
      console.log(`⏰ [AUTO-SYNC] Setting auto-sync timer (${syncDelay}ms delay, ${unsyncedCount} unsynced records)`);
      console.log(`⏰ [AUTO-SYNC] Timer will fire at: ${new Date(Date.now() + syncDelay).toLocaleTimeString()}`);
      
      autoSyncTimerRef.current = setTimeout(async () => {
        console.log('⏰ [AUTO-SYNC] ========================================');
        console.log('⏰ [AUTO-SYNC] Timer fired at:', new Date().toLocaleTimeString());
        console.log('⏰ [AUTO-SYNC] Checking for sync...');

        // Get fresh unsynced count
        const currentUnsyncedCount = await getCurrentUnsyncedCount();
        console.log(`📊 [AUTO-SYNC] Current unsynced count: ${currentUnsyncedCount}`);
        console.log(`📊 [AUTO-SYNC] Sync service running: ${syncService.isCurrentlyRunning()}`);
        console.log(`📊 [AUTO-SYNC] Online status: ${isOnline}`);
        console.log(`📊 [AUTO-SYNC] Store ID: ${storeId}`);

        // Always sync if not already running - need to check for both uploads AND downloads
        // Even with 0 unsynced records locally, there might be remote changes to download
        if (!syncService.isCurrentlyRunning()) {
          console.log('✅ [AUTO-SYNC] Triggering auto-sync now...');
          console.log(`📥 [AUTO-SYNC] Will upload ${currentUnsyncedCount} local changes and check for remote changes`);
          const syncStartTime = Date.now();
          const result = await performSync(true);
          const syncDuration = Date.now() - syncStartTime;
          console.log('✅ [AUTO-SYNC] Sync completed in', syncDuration, 'ms');
          console.log('✅ [AUTO-SYNC] Sync result:', {
            success: result.success,
            uploaded: result.synced.uploaded,
            downloaded: result.synced.downloaded,
            conflicts: result.conflicts,
            errors: result.errors
          });
          console.log('⏰ [AUTO-SYNC] ========================================');
        } else {
          console.log('⏭️  [AUTO-SYNC] Skipping sync - sync already running');
          console.log('⏰ [AUTO-SYNC] ========================================');
        }
      }, syncDelay);
    } else {
      console.log('⏭️  [AUTO-SYNC] Not setting timer:', {
        isOnline,
        hasStoreId: !!storeId,
        isSyncing
      });
    }
  }, [isOnline, storeId, isSyncing, unsyncedCount]);

  // Auto-sync with reset on every change - ensures full undo window
  useEffect(() => {
    resetAutoSyncTimer();

    // Cleanup on unmount
    return () => {
      if (autoSyncTimerRef.current) {
        clearTimeout(autoSyncTimerRef.current);
      }
    };
  }, [resetAutoSyncTimer]);

  const updateStockLevels = () => {
    const levels = products.map(product => {
      const productInventory = inventoryItems.filter(item => item.product_id === product.id);
      const totalStock = productInventory.reduce((sum, item) => sum + item.quantity, 0);

      // Group inventory by supplier for POS component compatibility
      const supplierStocks = productInventory.reduce((acc, item) => {
        const existingSupplier = acc.find(s => s.supplierId === item.supplier_id);
        if (existingSupplier) {
          existingSupplier.quantity += item.quantity;
        } else {
          const supplier = suppliers.find(s => s.id === item.supplier_id);
          acc.push({
            supplierId: item.supplier_id || '',
            supplierName: supplier?.name || 'Unknown Supplier',
            quantity: item.quantity
          });
        }
        return acc;
      }, [] as Array<{ supplierId: string; supplierName: string; quantity: number }>);

      return {
        id: product.id,
        productId: product.id,
        productName: product.name,
        currentStock: totalStock,
        suppliers: supplierStocks,
        lowStockAlert: lowStockAlertsEnabled && totalStock <= lowStockThreshold
      };
    });
    setStockLevels(levels);
  };

  const performSync = useCallback(async (isAutomatic = false): Promise<SyncResult> => {
    if (!storeId || isSyncing) {
      console.log('⏭️  [SYNC] Skipping sync:', { hasStoreId: !!storeId, isSyncing });
      return { success: false, errors: ['No store ID or sync in progress'], synced: { uploaded: 0, downloaded: 0 }, conflicts: 0 };
    }

    console.log(`🔄 [SYNC] Starting ${isAutomatic ? 'AUTO' : 'MANUAL'} sync at ${new Date().toLocaleTimeString()}`);
    setIsSyncing(true);
    setIsAutoSyncing(isAutomatic);
    setLoading(prev => ({ ...prev, sync: true }));

    try {
      const syncStartTime = Date.now();
      const result = await syncService.sync(storeId);
      const syncDuration = Date.now() - syncStartTime;
      
      setLastSync(new Date());
      console.log(`✅ [SYNC] Sync completed in ${syncDuration}ms:`, {
        success: result.success,
        uploaded: result.synced.uploaded,
        downloaded: result.synced.downloaded,
        conflicts: result.conflicts,
        errors: result.errors.length > 0 ? result.errors : 'none'
      });

      if (result.success || result.synced.uploaded > 0 || result.synced.downloaded > 0) {
        console.log('🔄 [SYNC] Refreshing local data after sync...');
        await refreshData();
        await updateUnsyncedCount();
        await checkUndoValidity();
        console.log('✅ [SYNC] Local data refreshed');
      }

      return result;
    } catch (error) {
      console.error(`❌ [SYNC] ${isAutomatic ? 'Auto-sync' : 'Manual sync'} error:`, error);
      return {
        success: false,
        errors: [error instanceof Error ? error.message : 'Unknown sync error'],
        synced: { uploaded: 0, downloaded: 0 },
        conflicts: 0
      };
    } finally {
      setIsSyncing(false);
      setIsAutoSyncing(false);
      setLoading(prev => ({ ...prev, sync: false }));
      console.log(`🏁 [SYNC] Sync process finished at ${new Date().toLocaleTimeString()}`);
    }
  }, [storeId, isSyncing, refreshData, updateUnsyncedCount, checkUndoValidity]);

  // Debounced sync to batch rapid changes and prevent excessive sync calls
  const debouncedSync = useCallback(() => {
    if (!isOnline || isSyncing) return;

    // Clear existing timeout
    if (debouncedSyncTimeout) {
      clearTimeout(debouncedSyncTimeout);
    }

    // Set new timeout for 1 second
    const timeout = setTimeout(() => {
      if (isOnline && !isSyncing && unsyncedCount > 0) {
        debug('🔄 Debounced auto-sync triggered');
        performSync(true); // Mark as automatic sync
      }
      setDebouncedSyncTimeout(null);
    }, 1000);

    setDebouncedSyncTimeout(timeout);
  }, [isOnline, isSyncing, debouncedSyncTimeout, unsyncedCount, performSync]);

  // Setup crudHelperService callbacks (updates whenever callback functions change)
  useEffect(() => {
    crudHelperService.setCallbacks({
      onRefreshData: refreshData,
      onUpdateUnsyncedCount: updateUnsyncedCount,
      onDebouncedSync: debouncedSync,
      onResetAutoSyncTimer: resetAutoSyncTimer
    });
  }, [refreshData, updateUnsyncedCount, debouncedSync, resetAutoSyncTimer]);

  // Bill management functions
  const createBill = async (billData: any, lineItems: any[], customerBalanceUpdate?: { customerId: string; amountDue: number; originalBalance: number }): Promise<string> => {
    if (!storeId) throw new Error('No store ID available');

    const billId = createId();
    const now = new Date().toISOString();
    const currentUserId = userProfile?.id;

    if (!currentUserId) {
      throw new Error('No user ID available - user not authenticated');
    }

    // Ensure bill data is clean and doesn't contain line item fields
    const cleanBillData = { ...billData };
    const lineItemFields = ['inventory_item_id', 'product_id', 'supplier_id', 'quantity', 'unit_price', 'line_total', 'weight', 'line_order'];

    lineItemFields.forEach(field => {
      if (cleanBillData[field] !== undefined) {
        console.warn(`🚫 Removing line item field '${field}' from bill data:`, cleanBillData[field]);
        delete cleanBillData[field];
      }
    });

    const bill = {
      id: billId,
      store_id: storeId,
      created_at: now,
      updated_at: now,
      _synced: false,
      ...cleanBillData
    };

    // Note: created_by is in bills table, not bill_line_items
    const mappedLineItems = lineItems.map(item => ({
      id: createId(),
      bill_id: billId,
      store_id: storeId,
      created_at: now,
      updated_at: now,
      _synced: false,
      _deleted: false,
      ...item
    }));

    // Log the final bill data for debugging
    debug('📋 Final line items data before storage:', mappedLineItems, 'items');

    // Store original inventory states for undo
    const inventoryStates: Array<{ id: string; originalQuantity: number }> = [];

    // Use transaction to ensure atomicity for all operations including inventory, cash drawer, customer balance, and audit logs
    await db.transaction('rw', [db.bills, db.bill_line_items, db.inventory_items, db.customers, db.suppliers, db.transactions, db.bill_audit_logs], async () => {
      // Add bill and line items
      await db.bills.add(bill);
      if (mappedLineItems.length > 0) {
        await db.bill_line_items.bulkAdd(mappedLineItems);
      }

      // ==================== CREATE AUDIT LOG ====================
      // Create ONE audit log entry for bill creation with human-readable information
      const generatedReason = `Creating bill #${bill.bill_number} with total amount ${bill.total_amount || 0}`;
      
      await db.bill_audit_logs.add({
        id: createId(),
        branch_id: currentBranchId || '',
        store_id: storeId,
        bill_id: billId,
        action: 'created',
        field_changed: null,
        old_value: null,
        new_value: JSON.stringify(bill),
        change_reason: generatedReason,
        changed_by: currentUserId,
        ip_address: null,
        user_agent: null,
        created_at: now,
        updated_at: now,
        _synced: false
      });

      // Deduct inventory quantities for all line items (regardless of payment method)
      for (const item of mappedLineItems) {
        if (item.inventory_item_id) {
          // Use the specific inventory item ID if provided
          const inventoryItem = await db.inventory_items.get(item.inventory_item_id);
          if (inventoryItem && inventoryItem.quantity >= item.quantity) {
            // Store original state for undo
            inventoryStates.push({
              id: item.inventory_item_id,
              originalQuantity: inventoryItem.quantity
            });

            const newQuantity = inventoryItem.quantity - item.quantity;

            if (newQuantity <= 0) {
              // Keep inventory item with quantity = 0 for received bills review instead of deleting
              await db.inventory_items.update(item.inventory_item_id, {
                quantity: 0,
                _synced: false
              });
            } else {
              // Update with new quantity
              await db.inventory_items.update(item.inventory_item_id, {
                quantity: newQuantity,
                _synced: false
              });
            }
          }
        } else {
          // Fallback to FIFO if no specific inventory item ID (legacy support)
          // Validate product_id before using it in database query
          if (!item.product_id || (typeof item.product_id !== 'string' && typeof item.product_id !== 'number')) {
            console.error('Invalid product_id in line item:', item);
            throw new Error(`Invalid product_id: ${item.product_id}. Product ID must be a string or number.`);
          }
          
          const inventoryRecords = await db.inventory_items
            .where('product_id')
            .equals(item.product_id)
            .and(inv => inv.quantity > 0)
            .sortBy('received_at');

          let qtyToDeduct = item.quantity || 1; // Default to 1 if not specified
          for (const inv of inventoryRecords) {
            if (qtyToDeduct <= 0) break;

            // Store original state for undo
            inventoryStates.push({
              id: inv.id,
              originalQuantity: inv.quantity
            });

            const deduct = Math.min(inv.quantity, qtyToDeduct);
            const newQuantity = inv.quantity - deduct;

            if (newQuantity <= 0) {
              // Keep inventory item with quantity = 0 for received bills review instead of deleting
              await db.inventory_items.update(inv.id, {
                quantity: 0,
                _synced: false
              });
            } else {
              // Update with new quantity
              await db.inventory_items.update(inv.id, {
                quantity: newQuantity,
                _synced: false
              });
            }
            qtyToDeduct -= deduct;
          }
        }
      }

      // Update customer/supplier balance if needed
      if (customerBalanceUpdate) {
        // First try to find as customer
        let entity: any = await db.customers.get(customerBalanceUpdate.customerId);
        let entityType = 'customer';
        
        // If not found as customer, try as supplier
        if (!entity) {
          entity = await db.suppliers.get(customerBalanceUpdate.customerId);
          entityType = 'supplier';
        }
        
        if (entity) {
          const newBalance = customerBalanceUpdate.originalBalance + customerBalanceUpdate.amountDue;
          
          if (entityType === 'customer') {
            await db.customers.update(customerBalanceUpdate.customerId, {
              lb_balance: newBalance,
              _synced: false
            });
          } else {
            await db.suppliers.update(customerBalanceUpdate.customerId, {
              lb_balance: newBalance,
              _synced: false
            });
          }

          // Record the transaction for financial tracking using the unified service
          await transactionService.createTransaction({
            category: entityType === 'customer' 
              ? TRANSACTION_CATEGORIES.CUSTOMER_CREDIT_SALE 
              : TRANSACTION_CATEGORIES.SUPPLIER_CREDIT_SALE,
            amount: customerBalanceUpdate.amountDue,
            currency: 'LBP',
            description: `Credit sale - Bill ${bill.bill_number} (${entityType})`,
            reference: bill.bill_number,
            customerId: entityType === 'customer' ? customerBalanceUpdate.customerId : null,
            supplierId: entityType === 'supplier' ? customerBalanceUpdate.customerId : null,
            context: {
              userId: currentUserId,
              storeId: storeId,
              module: 'billing',
              source: 'offline',
              branchId: currentBranchId || '',
            },
            updateBalances: false, // Balance already updated above
            updateCashDrawer: false, // Not a cash transaction
            createAuditLog: true,
            _synced: false
          });
        }
      }
    });

    // Process cash drawer transaction for cash sales using the general utility
    // Note: payment_method is on the bill, not on individual line items
    let cashDrawerResult = null;
    if (bill.payment_method === 'cash') {
      try {
        const totalCashAmount = bill.amount_paid || bill.total_amount || 0;
        debug('💰 Processing cash sale transaction:', { totalCashAmount, billNumber: bill.bill_number });

        cashDrawerResult = await processCashDrawerTransaction({
          type: 'sale',
          amount: totalCashAmount,
          currency: 'LBP', // Assuming LBP for now, could be made dynamic
          description: `Cash sale - Bill ${bill.bill_number}`,
          reference: bill.bill_number,
          customerId: bill.customer_id || undefined
        });

        // // Record cash sale transaction for financial tracking
        // await db.transaction('rw', [db.transactions], async () => {
        //   const cashTransaction = {
        //     id: createId(),
        //     store_id: storeId,
        //     created_at: now,
        //     updated_at: now,
        //     _synced: false,
        //     type: 'income', // Cash sale is income
        //     amount: totalCashAmount,
        //     currency: 'LBP',
        //     description: `Cash sale - Bill ${bill.bill_number}`,
        //     reference: bill.bill_number,
        //     customer_id: cashSaleItems[0]?.customer_id || null,
        //     supplier_id: null,
        //     category: "sale",
        //     created_by: currentUserId,
        //   };
        //   await db.transactions.add(cashTransaction as any);
        // });

        debug(`✅ Cash drawer updated: $${cashDrawerResult.previousBalance?.toFixed(2)} → $${cashDrawerResult.newBalance?.toFixed(2)}`);
      } catch (error) {
        console.error('❌ Error updating cash drawer for sales:', error);
      }
    }

    // Store undo data for the complete checkout action
    const baseUndoData = {
      affected: [
        { table: 'bills', id: billId },
        ...mappedLineItems.map(item => ({ table: 'bill_line_items', id: item.id })),
        ...inventoryStates.map(state => ({ table: 'inventory_items', id: state.id })),
        ...(customerBalanceUpdate ? [
          { table: 'customers', id: customerBalanceUpdate.customerId },
          { table: 'transactions', id: `credit-sale-${billId}` }
        ] : [])
      ],
      steps: [
        // Delete the bill
        { op: 'delete', table: 'bills', id: billId },
        // Delete all line items
        ...mappedLineItems.map(item => ({ op: 'delete', table: 'bill_line_items', id: item.id })),
        // Restore inventory quantities
        ...inventoryStates.map(state => ({
          op: 'update',
          table: 'inventory_items',
          id: state.id,
          changes: { quantity: state.originalQuantity, _synced: false }
        })),
        // Restore customer balance if applicable
        ...(customerBalanceUpdate ? [{
          op: 'update',
          table: 'customers',
          id: customerBalanceUpdate.customerId,
          changes: { lb_balance: customerBalanceUpdate.originalBalance, _synced: false }
        }] : []),
        // Delete the credit transaction if applicable
        ...(customerBalanceUpdate ? [{
          op: 'delete',
          table: 'transactions',
          id: `credit-sale-${billId}`
        }] : [])
      ]
    };

    // Create comprehensive undo data including cash drawer if applicable
    const undoData = cashDrawerResult
      ? createCashDrawerUndoData(cashDrawerResult.transactionId, cashDrawerResult.previousBalance, cashDrawerResult.accountId, baseUndoData)
      : { type: 'complete_checkout', ...baseUndoData };

    pushUndo(undoData);

    await refreshData();
    await refreshCashDrawerStatus(); // Refresh cash drawer to show updated balance
    await updateUnsyncedCount();

    // Reset auto-sync timer to ensure full undo window
    resetAutoSyncTimer();

    debouncedSync();

    // Check if any inventory items are now 100% complete
    for (const item of mappedLineItems) {
      if (item.inventory_item_id) {
        receivedBillMonitoringService.checkBillAfterSale(storeId, item.inventory_item_id).catch(err => {
          console.error('Error checking bill completion:', err);
        });
      }
    }

    return billId;
  };

  const updateBill = async (billId: string, updates: any, changedBy: string, changeReason?: string): Promise<void> => {
    if (!storeId) throw new Error('No store ID available');

    // Get original bill for undo and comparison
    const originalBill = await db.bills.get(billId);
    if (!originalBill) throw new Error('Bill not found');
    
    const now = new Date().toISOString();

    // Pure offline-first approach - update local database only
    // Create audit logs for each changed field with ID resolution
    const auditLogs: any[] = [];
    const auditLogIds: string[] = [];

    await db.transaction('rw', [db.bills, db.bill_audit_logs, db.customers], async () => {
      // Update the bill
      await db.bills.update(billId, {
        ...updates,
        updated_at: now,
        _synced: false // Mark as unsynced for background sync
      });

      // ==================== CREATE FIELD-LEVEL AUDIT LOGS ====================
      // Create MULTIPLE audit logs (one per changed field) with ID resolution
      for (const [field, newValue] of Object.entries(updates)) {
        if (field !== '_synced' && field !== 'updated_at') {
          const oldValue = (originalBill as any)[field];
          if (oldValue !== newValue) {
            // Resolve IDs to human-readable names
            let oldValueDisplay = oldValue != null ? String(oldValue) : 'empty';
            let newValueDisplay = newValue != null ? String(newValue) : 'empty';

            // Resolve customer_id to customer name
            if (field === 'customer_id') {
              if (oldValue) {
                const oldCustomer = await db.customers.get(oldValue);
                oldValueDisplay = oldCustomer?.name || oldValue;
              } else {
                oldValueDisplay = 'Walk-in Customer';
              }
              
              if (newValue) {
                const newCustomer = await db.customers.get(newValue);
                newValueDisplay = newCustomer?.name || newValue as string;
              } else {
                newValueDisplay = 'Walk-in Customer';
              }
            }

            // Format numeric values for better readability
            if (field === 'total_amount' || field === 'amount_paid' || field === 'amount_due' || 
                field === 'subtotal' || field === 'tax_amount' || field === 'discount_amount') {
              if (oldValue != null) oldValueDisplay = Number(oldValue).toLocaleString();
              if (newValue != null) newValueDisplay = Number(newValue).toLocaleString();
            }

            // Generate descriptive change reason
            const fieldLabel = field.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase());
            const generatedReason = changeReason || `Updating ${fieldLabel} from ${oldValueDisplay} to ${newValueDisplay}`;

            const auditLogId = createId();
            auditLogIds.push(auditLogId);

            const auditLog = {
              id: auditLogId,
              bill_id: billId,
              store_id: storeId,
              action: 'updated' as const,
              field_changed: field,
              old_value: oldValueDisplay !== 'empty' ? oldValueDisplay : null,
              new_value: newValueDisplay !== 'empty' ? newValueDisplay : null,
              change_reason: generatedReason,
              changed_by: changedBy,
              ip_address: null,
              user_agent: null,
              created_at: now,
              updated_at: now,
              branch_id: currentBranchId || '',
              _synced: false
            };

            auditLogs.push(auditLog);
            await db.bill_audit_logs.add(auditLog);
          }
        }
      }
    });

    // Store undo data with original values
    const undoChanges: any = {};
    for (const key of Object.keys(updates)) {
      if (key !== '_synced' && key !== 'updated_at') {
        undoChanges[key] = (originalBill as any)[key];
      }
    }
    
    pushUndo({
      type: 'update_bill',
      affected: [
        { table: 'bills', id: billId },
        ...auditLogIds.map(id => ({ table: 'bill_audit_logs', id }))
      ],
      steps: [
        { op: 'update', table: 'bills', id: billId, changes: undoChanges },
        ...auditLogIds.map(id => ({ op: 'delete', table: 'bill_audit_logs', id }))
      ]
    });

    await refreshData();
    await updateUnsyncedCount();

    // Reset auto-sync timer to ensure full undo window
    resetAutoSyncTimer();

    debouncedSync();
  };

  const deleteBill = async (billId: string, deletedBy: string, deleteReason?: string, softDelete = true): Promise<void> => {
    if (!storeId) throw new Error('No store ID available');

    const now = new Date().toISOString();
    const auditLogId = createId();

    // Get bill and line items for undo and audit trail
    const bill = await db.bills.get(billId);
    const lineItems = await db.bill_line_items.where('bill_id').equals(billId).toArray();

    // Pure offline-first approach - delete from local database only
    await db.transaction('rw', [db.bills, db.bill_line_items, db.bill_audit_logs], async () => {
      if (softDelete) {
        // Soft delete - mark as deleted
        await db.bills.update(billId, {
          _deleted: true,
          updated_at: now,
          _synced: false // Mark as unsynced for background sync
        });

        // Also soft delete line items
        for (const item of lineItems) {
          await db.bill_line_items.update(item.id, {
            _deleted: true,
            _synced: false // Mark as unsynced for background sync
          });
        }
      } else {
        // Hard delete
        await db.bills.delete(billId);
        await db.bill_line_items.where('bill_id').equals(billId).delete();
      }

      // ==================== CREATE AUDIT LOG ====================
      // Create ONE audit log with descriptive reason
      const deleteAction = softDelete ? 'cancelled' : 'permanently deleted';
      const generatedReason = bill 
        ? `Deleting bill #${bill.bill_number} (${deleteAction})` 
        : `Deleting bill (${deleteAction})`;

      const auditLog = {
        id: auditLogId,
        bill_id: billId,
        store_id: storeId,
        action: 'deleted' as const,
        field_changed: 'status',
        old_value: bill?.status || 'active',
        new_value: softDelete ? 'cancelled' : 'deleted',
        change_reason: deleteReason || generatedReason,
        changed_by: deletedBy,
        ip_address: null,
        user_agent: null,
        created_at: now,
        updated_at: now,
        branch_id: currentBranchId || '',
        _synced: false
      };

      await db.bill_audit_logs.add(auditLog);
    });

    // Build undo data
    const undoSteps: any[] = [];
    const affectedRecords: any[] = [
      { table: 'bills', id: billId },
      { table: 'bill_audit_logs', id: auditLogId }
    ];
    
    if (softDelete) {
      // Restore bill and line items
      undoSteps.push({ op: 'update', table: 'bills', id: billId, changes: { _deleted: false, _synced: false } });
      for (const item of lineItems) {
        undoSteps.push({ op: 'update', table: 'bill_line_items', id: item.id, changes: { _deleted: false, _synced: false } });
        affectedRecords.push({ table: 'bill_line_items', id: item.id });
      }
    }
    // Note: Hard delete cannot be undone as we lost the data
    
    undoSteps.push({ op: 'delete', table: 'bill_audit_logs', id: auditLogId });
    
    pushUndo({
      type: 'delete_bill',
      affected: affectedRecords,
      steps: undoSteps
    });

    await refreshData();
    await updateUnsyncedCount();
    debouncedSync();
  };

  const getBills = async (filters?: any): Promise<any[]> => {
    if (!storeId) return [];

    // Pure offline-first approach - read only from local database
    let query = db.bills.where('store_id').equals(storeId).filter(bill => !bill._deleted);

    // Apply filters that can be done at the query level
    if (filters) {
      if (filters.status) {
        query = query.and(bill => bill.status === filters.status);
      }
      if (filters.supplier_id) {
        // Filter by supplier through bill line items
        const billIdsWithSupplier = await db.bill_line_items
          .where('supplier_id')
          .equals(filters.supplier_id)
          .primaryKeys();
        query = query.and(bill => billIdsWithSupplier.includes(bill.id));
      }
      // Handle both dateFrom/dateTo and date_from/date_to naming
      const dateFrom = filters.dateFrom || filters.date_from;
      const dateTo = filters.dateTo || filters.date_to;
      
      // Normalize date filters to handle date-only strings (YYYY-MM-DD)
      // Compare dates by extracting the date portion only (YYYY-MM-DD)
      if (dateFrom) {
        query = query.and(bill => {
          if (!bill.bill_date) return false;
          // Extract date portion from bill_date (handles both ISO strings and date-only formats)
          const billDateStr = typeof bill.bill_date === 'string' 
            ? bill.bill_date.split('T')[0] 
            : new Date(bill.bill_date).toISOString().split('T')[0];
          return billDateStr >= dateFrom;
        });
      }
      if (dateTo) {
        query = query.and(bill => {
          if (!bill.bill_date) return false;
          // Extract date portion from bill_date (handles both ISO strings and date-only formats)
          const billDateStr = typeof bill.bill_date === 'string' 
            ? bill.bill_date.split('T')[0] 
            : new Date(bill.bill_date).toISOString().split('T')[0];
          return billDateStr <= dateTo;
        });
      }
      if (filters.paymentStatus) {
        query = query.and(bill => bill.payment_status === filters.paymentStatus);
      }
    }

    let billsData = await query.toArray();

    // Apply search term filter if provided (needs customer lookup, so done in memory)
    if (filters?.searchTerm) {
      const searchLower = filters.searchTerm.toLowerCase();
      // Get customers for name lookup
      const customersMap = new Map<string, string>();
      const allCustomers = await db.customers.where('store_id').equals(storeId).toArray();
      allCustomers.forEach(c => customersMap.set(c.id, c.name.toLowerCase()));

      billsData = billsData.filter(bill => {
        const billNumberLower = bill.bill_number?.toLowerCase() || '';
        // Support searching with or without "Bill-" prefix
        // e.g., searching "12345678" will match "Bill-12345678"
        const billNumberWithoutPrefix = billNumberLower.replace(/^bill-/, '');
        const billNumberMatch = billNumberLower.includes(searchLower) || billNumberWithoutPrefix.includes(searchLower);
        const notesMatch = bill.notes?.toLowerCase().includes(searchLower);
        const customerName = bill.customer_id ? customersMap.get(bill.customer_id) : '';
        const customerMatch = customerName?.includes(searchLower);
        
        return billNumberMatch || notesMatch || customerMatch;
      });
    }

    // Attach line items to each bill
    const billsWithLineItems = await Promise.all(
      billsData.map(async (bill) => {
        const lineItems = await db.bill_line_items
          .where('bill_id')
          .equals(bill.id)
          .filter(item => !item._deleted)
          .toArray();

        return {
          ...bill,
          line_items: lineItems
        };
      })
    );

    return billsWithLineItems;
  };

  const getBillDetails = async (billId: string): Promise<any | null> => {
    if (!storeId) return null;

    // Pure offline-first approach - read only from local database
    const bill = await db.bills.get(billId);
    if (!bill || bill._deleted) return null;

    const lineItems = await db.bill_line_items
      .where('bill_id')
      .equals(billId)
      .filter(item => !item._deleted)
      .toArray();

    const auditLogs = await db.bill_audit_logs
      .where('bill_id')
      .equals(billId)
      .filter(log => !log._deleted)
      .toArray();

    // ==================== RESOLVE USER NAMES IN AUDIT LOGS ====================
    // Join audit logs with users to get user names and emails
    const auditLogsWithUsers = await Promise.all(
      auditLogs.map(async (log) => {
        const user = await db.users.get(log.changed_by);
        return {
          ...log,
          users: user ? { name: user.name, email: user.email } : undefined
        };
      })
    );

    const result = {
      ...bill,
      line_items: lineItems,
      bill_audit_logs: auditLogsWithUsers // Changed from 'audit_logs' to 'bill_audit_logs' to match documentation
    };

    return result;
  };

  const createBillAuditLog = async (auditData: any): Promise<void> => {
    if (!storeId) throw new Error('No store ID available');

    const auditLog = {
      id: createId(),
      store_id: storeId,
      created_at: new Date().toISOString(),
      _synced: false,
      ...auditData
    };

    await db.bill_audit_logs.add(auditLog);
    await refreshData();
    await updateUnsyncedCount();
    debouncedSync();
  };

  const getStore = async (storeId: string): Promise<any | null> => {
    try {
      // Pure offline-first approach - read only from local database
      const store = await db.stores.get(storeId);
      return store || null;
    } catch (error) {
      console.error('Error getting store from local database:', error);
      return null;
    }
  };

  // Cleanup timeout on unmount
  useEffect(() => {
    return () => {
      if (debouncedSyncTimeout) {
        clearTimeout(debouncedSyncTimeout);
      }
    };
  }, [debouncedSyncTimeout]);

  // CRUD Operations - matching exact function signatures
  const addProduct = async (productData: Omit<Tables['products']['Insert'], 'store_id'>): Promise<void> => {
    const productId = productData.id || createId();
    const dataWithId = { ...productData, id: productId };
    
    await crudHelperService.addEntity('products', storeId!, dataWithId);
    
    // Store undo data
    pushUndo({
      type: 'add_product',
      affected: [{ table: 'products', id: productId }],
      steps: [{ op: 'delete', table: 'products', id: productId }]
    });
    
    resetAutoSyncTimer();
  };

  const addSupplier = async (supplierData: Omit<Tables['suppliers']['Insert'], 'store_id'>): Promise<void> => {
    const supplierId = supplierData.id || createId();
    const dataWithId = { ...supplierData, id: supplierId };
    
    await crudHelperService.addEntity('suppliers', storeId!, dataWithId);
    
    // Store undo data
    pushUndo({
      type: 'add_supplier',
      affected: [{ table: 'suppliers', id: supplierId }],
      steps: [{ op: 'delete', table: 'suppliers', id: supplierId }]
    });
    
    resetAutoSyncTimer();
  };

  const addCustomer = async (customerData: Omit<Tables['customers']['Insert'], 'store_id'>): Promise<void> => {
    const customerId = customerData.id || createId();
    const dataWithId = { ...customerData, id: customerId };
    
    await crudHelperService.addEntity('customers', storeId!, dataWithId);
    
    // Store undo data
    pushUndo({
      type: 'add_customer',
      affected: [{ table: 'customers', id: customerId }],
      steps: [{ op: 'delete', table: 'customers', id: customerId }]
    });
    
    resetAutoSyncTimer();
  };

  const updateCustomer = async (id: string, updates: Tables['customers']['Update']): Promise<void> => {
    // Get original data for undo
    const originalCustomer = await db.customers.get(id);
    if (!originalCustomer) throw new Error('Customer not found');
    
    await crudHelperService.updateEntity('customers', id, updates);
    
    // Store undo data with original values
    const undoChanges: any = {};
    for (const key of Object.keys(updates)) {
      if (key !== '_synced' && key !== 'updated_at') {
        undoChanges[key] = (originalCustomer as any)[key];
      }
    }
    
    pushUndo({
      type: 'update_customer',
      affected: [{ table: 'customers', id }],
      steps: [{ op: 'update', table: 'customers', id, changes: undoChanges }]
    });
    
    resetAutoSyncTimer();
  };

  const updateSupplier = async (id: string, updates: Tables['suppliers']['Update']): Promise<void> => {
    // Get original data for undo
    const originalSupplier = await db.suppliers.get(id);
    if (!originalSupplier) throw new Error('Supplier not found');
    
    await crudHelperService.updateEntity('suppliers', id, updates);
    
    // Store undo data with original values
    const undoChanges: any = {};
    for (const key of Object.keys(updates)) {
      if (key !== '_synced' && key !== 'updated_at') {
        undoChanges[key] = (originalSupplier as any)[key];
      }
    }
    
    pushUndo({
      type: 'update_supplier',
      affected: [{ table: 'suppliers', id }],
      steps: [{ op: 'update', table: 'suppliers', id, changes: undoChanges }]
    });
    
    resetAutoSyncTimer();
  };

  const updateProduct = async (id: string, updates: Tables['products']['Update']): Promise<void> => {
    // Get original data for undo
    const originalProduct = await db.products.get(id);
    if (!originalProduct) throw new Error('Product not found');
    
    await crudHelperService.updateEntity('products', id, updates);
    
    // Store undo data with original values
    const undoChanges: any = {};
    for (const key of Object.keys(updates)) {
      if (key !== '_synced' && key !== 'updated_at') {
        undoChanges[key] = (originalProduct as any)[key];
      }
    }
    
    pushUndo({
      type: 'update_product',
      affected: [{ table: 'products', id }],
      steps: [{ op: 'update', table: 'products', id, changes: undoChanges }]
    });
    
    resetAutoSyncTimer();
  };

  const deleteProduct = async (id: string): Promise<void> => {
    // Get original data for undo
    const originalProduct = await db.products.get(id);
    if (!originalProduct) throw new Error('Product not found');
    
    await crudHelperService.deleteEntity('products', id);
    
    // Store undo data with full record to restore
    pushUndo({
      type: 'delete_product',
      affected: [{ table: 'products', id }],
      steps: [{ 
        op: 'update', 
        table: 'products', 
        id, 
        changes: { _deleted: false, _synced: false } 
      }]
    });
    
    resetAutoSyncTimer();
  };

  const addEmployee = async (employeeData: Omit<Tables['users']['Insert'], 'store_id'>): Promise<void> => {
    if (!storeId) throw new Error('No store ID available');
    
    const employeeId = employeeData.id || createId();
    const dataWithId = { ...employeeData, id: employeeId };
    
    await crudHelperService.addEntity('users', storeId, dataWithId);
    
    // Store undo data
    pushUndo({
      type: 'add_employee',
      affected: [{ table: 'users', id: employeeId }],
      steps: [{ op: 'delete', table: 'users', id: employeeId }]
    });
    
    resetAutoSyncTimer();
  };

  const updateEmployee = async (id: string, updates: Tables['users']['Update']): Promise<void> => {
    // Get original data for undo
    const originalEmployee = await db.users.get(id);
    if (!originalEmployee) throw new Error('Employee not found');
    
    await crudHelperService.updateEntity('users', id, updates);
    
    // Store undo data with original values
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
  };

  const deleteEmployee = async (id: string): Promise<void> => {
    // Get original data for undo
    const originalEmployee = await db.users.get(id);
    if (!originalEmployee) throw new Error('Employee not found');
    
    await crudHelperService.deleteEntity('users', id);
    
    // Store undo data
    pushUndo({
      type: 'delete_employee',
      affected: [{ table: 'users', id }],
      steps: [{ 
        op: 'update', 
        table: 'users', 
        id, 
        changes: { _deleted: false, _synced: false } 
      }]
    });
    
    resetAutoSyncTimer();
  };

  const addInventoryItem = async (itemData: Omit<Tables['inventory_items']['Insert'], 'store_id'>): Promise<void> => {
    if (!storeId) throw new Error('No store ID available');

    const itemId = itemData.id || createId();
    
    // Prepare item with defaults - crudHelperService will add base entity fields (id, store_id, created_at, _synced)
    const preparedData = {
      id: itemId,
      product_id: itemData.product_id ?? '',
      quantity: itemData.quantity ?? 0,
      unit: itemData.unit ?? '',
      received_quantity: itemData.received_quantity ?? (itemData.quantity ?? 0),
      weight: itemData.weight ?? null,
      price: itemData.price ?? null,
      currency: (itemData as any).currency ?? currency,
      selling_price: (itemData as any).selling_price ?? null,
      batch_id: itemData.batch_id ?? null,
      sku: itemData.sku ?? null
    } as Omit<Tables['inventory_items']['Insert'], 'store_id'>;

    // Use crudHelperService - it will handle all callbacks automatically
    await crudHelperService.addEntity('inventory_items', storeId, preparedData);
    
    // Store undo data
    pushUndo({
      type: 'add_inventory_item',
      affected: [{ table: 'inventory_items', id: itemId }],
      steps: [{ op: 'delete', table: 'inventory_items', id: itemId }]
    });
    
    resetAutoSyncTimer();
  };

  const updateInventoryItem = async (id: string, updates: Tables['inventory_items']['Update']): Promise<void> => {
    // Get original data for undo
    const originalItem = await db.inventory_items.get(id);
    if (!originalItem) throw new Error('Inventory item not found');
    
    await crudHelperService.updateEntity('inventory_items', id, updates);
    
    // Store undo data with original values
    const undoChanges: any = {};
    for (const key of Object.keys(updates)) {
      if (key !== '_synced' && key !== 'updated_at') {
        undoChanges[key] = (originalItem as any)[key];
      }
    }
    
    pushUndo({
      type: 'update_inventory_item',
      affected: [{ table: 'inventory_items', id }],
      steps: [{ op: 'update', table: 'inventory_items', id, changes: undoChanges }]
    });
    
    resetAutoSyncTimer();
  };

  const checkInventoryItemReferences = async (id: string): Promise<{
    salesCount: number;
    variancesCount: number;
    hasReferences: boolean;
  }> => {
    try {
      const sales = await db.bill_line_items
        .where('inventory_item_id')
        .equals(id)
        .and(item => !item._deleted)
        .toArray();

      const variances = await db.missed_products
        .where('inventory_item_id')
        .equals(id)
        .and(item => !item._deleted)
        .toArray();

      return {
        salesCount: sales.length,
        variancesCount: variances.length,
        hasReferences: sales.length > 0 || variances.length > 0
      };
    } catch (error) {
      console.error('Error checking inventory item references:', error);
      return {
        salesCount: 0,
        variancesCount: 0,
        hasReferences: false
      };
    }
  };

  const deleteInventoryItem = async (id: string): Promise<void> => {
    try {
      console.log(`🗑️ Deleting inventory item ${id}`);
      
      // Get the inventory item for undo
      const originalItem = await db.inventory_items.get(id);
      if (!originalItem) throw new Error('Inventory item not found');
      
      // Get all related records
      const sales = await db.bill_line_items
        .where('inventory_item_id')
        .equals(id)
        .and(item => !item._deleted)
        .toArray();

      const missedProducts = await db.missed_products
        .where('inventory_item_id')
        .equals(id)
        .and(item => !item._deleted)
        .toArray();

      const hasReferences = sales.length > 0 || missedProducts.length > 0;
      const affectedRecords: any[] = [{ table: 'inventory_items', id }];
      const undoSteps: any[] = [];

      if (hasReferences) {
        // Soft-delete when referenced
        await crudHelperService.updateEntity('inventory_items', id, { _deleted: true } as any);
        undoSteps.push({ op: 'update', table: 'inventory_items', id, changes: { _deleted: false, _synced: false } });
        
        // Track affected references
        for (const s of sales) affectedRecords.push({ table: 'bill_line_items', id: s.id });
        for (const m of missedProducts) affectedRecords.push({ table: 'missed_products', id: m.id });
      } else {
        await crudHelperService.deleteEntity('inventory_items', id);
        undoSteps.push({ op: 'update', table: 'inventory_items', id, changes: { _deleted: false, _synced: false } });
      }
      
      // Add inventory item restoration to undo steps (last step so it runs first on undo)
      // Already added above per flow
      
      // Store undo data
      pushUndo({
        type: 'delete_inventory_item',
        affected: affectedRecords,
        steps: undoSteps
      });
      
      resetAutoSyncTimer();
      
      console.log(`🗑️ Inventory item ${id} deleted successfully`);
      
      // Force immediate data refresh to ensure UI updates
      await refreshData();
      
    } catch (error) {
      console.error('Error deleting inventory item:', error);
      throw new Error(`Failed to delete inventory item: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  };

  const addInventoryBatch: OfflineDataContextType['addInventoryBatch'] = async ({
    supplier_id,
    created_by,
    status = 'Created',
    porterage_fee = null,
    transfer_fee = null,
    received_at,
    commission_rate,
    type,
    plastic_fee,
    currency: batchCurrency,
    items
  }) => {
    if (!storeId) throw new Error('No store ID available');
    if (!items || items.length === 0) throw new Error('No items provided');

    const batchId = createId();

    // Get the actual supplier ID before processing
    const actualSupplierId = supplier_id === 'trade' ? await InventoryPurchaseService.getInstance().getOrCreateTradeSupplier(storeId) : supplier_id;

    // Process financial transactions for cash and credit purchases
    let financialResult = null;
    if (type === 'cash' || type === 'credit') {
      try {
        const { inventoryPurchaseService } = await import('../services/inventoryPurchaseService');

        const purchaseData = {
          supplier_id: actualSupplierId,
          type: type as 'cash' | 'credit' | 'commission',
          items: items.map(item => ({
            product_id: item.product_id || '',
            quantity: item.quantity || 0,
            unit: item.unit || '',
            weight: item.weight || undefined,
            price: item.price || undefined,
            selling_price: item.selling_price || undefined
          })),
          porterage_fee: porterage_fee || undefined,
          transfer_fee: transfer_fee || undefined,
          plastic_fee: plastic_fee || undefined,
          commission_rate: commission_rate || undefined,
          created_by,
          store_id: storeId,
        branch_id: currentBranchId || '',

          status: status || undefined
        };

        financialResult = await inventoryPurchaseService.processInventoryPurchase(purchaseData);
        debug('Financial transaction processed:', financialResult);
      } catch (error) {
        console.error('Error processing financial transaction:', error);
        throw new Error(`Failed to process financial transaction: ${error instanceof Error ? error.message : 'Unknown error'}`);
      }
    }

    const batchRecord = {
      id: batchId,
      supplier_id: actualSupplierId,
      status: status || undefined,
      porterage_fee,
      transfer_fee,
      received_at: received_at || new Date().toISOString(),
      commission_rate: commission_rate || null,
      store_id: storeId,
      created_by,
      currency: batchCurrency || currency,
      plastic_fee: plastic_fee ? String(plastic_fee) : undefined,
      type,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
        branch_id: currentBranchId || '',

      _synced: false
    };
    // Query products before transaction to use for SKU generation
    const allProducts = await db.products.toArray();
    const productMap = new Map(allProducts.map(p => [p.id, p]));

    // Both batch and items are persisted locally and will be synced to Supabase.
    // The sync service ensures inventory_bills are uploaded before inventory_items
    // to maintain foreign key constraints.
    await db.transaction('rw', [db.inventory_bills, db.inventory_items], async () => {
      await db.inventory_bills.add(batchRecord);
      debug(batchRecord, 'batchrecord')
      const now = new Date().toISOString();
      const allowedUnits = ["box", "kg", "piece", "bag","bundle"] as const;

      const mappedItems = items.map((it) => ({
        id: createId(),
        product_id: it.product_id ?? '',
        quantity: it.quantity ?? 0,
        unit:allowedUnits.includes(it.unit as any)
    ? (it.unit as "box" | "kg" | "piece" | "bag"|"bundle")
    : "box", // fallback default
        store_id: storeId,
        created_at: now,
        _synced: false,
        // supplier_id REMOVED: accessed via inventory_bills -> batch_id
        weight: it.weight ?? null,
        price: it.price ?? null,
        currency: (it as any).currency ?? currency,
        selling_price: it.selling_price ?? null,
        received_quantity: it.received_quantity ?? 0,
        batch_id: batchId as string | null,
        sku: (it as any).sku ?? null, // Use provided SKU or null
        branch_id: currentBranchId || '',
        updated_at: now
      }));

      await db.inventory_items.bulkAdd(mappedItems);
      
      // Generate SKU/barcode for items that don't have one
      // Format: [CATEGORY_PREFIX]-#[INVENTORY_ITEM_ID_LAST4]
      for (const item of mappedItems) {
        // Only generate SKU if not provided
        if (!item.sku) {
          const product = productMap.get(item.product_id);
          if (product) {
            // Get category prefix (first 3 letters uppercase)
            const category = product.category || 'UNK';
            const categoryPrefix = category.length >= 3 
              ? category.substring(0, 3).toUpperCase() 
              : category.toUpperCase().padEnd(3, 'X');
            
            // Get inventory item ID and format as #0001 (last 4 characters)
            const itemIdStr = item.id;
            let itemIdPart = '';
            if (itemIdStr.length >= 4) {
              itemIdPart = itemIdStr.substring(itemIdStr.length - 4);
            } else {
              itemIdPart = itemIdStr.padStart(4, '0');
            }
            
            // Format: [CATEGORY_PREFIX]-[INVENTORY_ITEM_ID_LAST4]
            const sku = `${categoryPrefix}-${itemIdPart}`;
            
            // Update inventory item with generated SKU
            await db.inventory_items.update(item.id, { sku });
          }
        }
      }
      
      // Store the created item IDs for undo
      const itemIds = mappedItems.map(item => item.id);
      
      // Build undo data
      const undoSteps: any[] = [
        { op: 'delete', table: 'inventory_bills', id: batchId }
      ];
      
      const affectedRecords: any[] = [{ table: 'inventory_bills', id: batchId }];
      
      // Add inventory items to undo
      for (const itemId of itemIds) {
        undoSteps.push({ op: 'delete', table: 'inventory_items', id: itemId });
        affectedRecords.push({ table: 'inventory_items', id: itemId });
      }
      
      // Note: Financial transactions have their own undo mechanism
      // Store undo data
      pushUndo({
        type: 'add_inventory_batch',
        affected: affectedRecords,
        steps: undoSteps
      });
    });

    await refreshData();
    await updateUnsyncedCount();

    // Reset auto-sync timer to ensure full undo window
    resetAutoSyncTimer();

    debouncedSync();

    return { batchId, financialResult };
  };

  const addSale = async (
    items: any[]
  ): Promise<void> => {
    if (!storeId) throw new Error('No store ID available');

    // DEPRECATED: This method is no longer used since sales are now handled through bill creation
    // The POS checkout process now creates bills with bill_line_items directly
    // This method is kept for backward compatibility but should not be called
    console.warn('addSale method is deprecated - sales are now handled through bill creation');

    // If this method is still called, we'll create a temporary bill for the items
    const currentUserId = userProfile?.id;
    if (!currentUserId) {
      throw new Error('No user ID available - user not authenticated');
    }

    // Create a temporary bill for these items
    const billId = createId();
    const now = new Date().toISOString();

    const billData = {
      id: billId,
      store_id: storeId,
      bill_number: `TEMP-${Date.now()}`,
      customer_id: items[0]?.customer_id || null,
      subtotal: items.reduce((sum, item) => sum + (item.received_value || item.unit_price * item.quantity), 0),
      total_amount: items.reduce((sum, item) => sum + (item.received_value || item.unit_price * item.quantity), 0),
      payment_method: items[0]?.payment_method || 'cash',
      payment_status: 'paid' as const,
      amount_paid: items.reduce((sum, item) => sum + (item.received_value || item.unit_price * item.quantity), 0),
      amount_due: 0,
      bill_date: now,
      notes: 'Temporary bill created from deprecated addSale method',
      status: 'active',
      created_by: currentUserId,
      created_at: now,
      updated_at: now,
      last_modified_by: currentUserId,
      _synced: false
    };

    const lineItems = items.map((item, index) => ({
      id: createId(),
      store_id: storeId,
      bill_id: billId,
      product_id: item.product_id,
      inventory_item_id: item.inventory_item_id || null,
      quantity: item.quantity,
      unit_price: item.unit_price,
      line_total: item.received_value || item.unit_price * item.quantity,
      weight: item.weight || null,
      notes: item.notes || null,
      line_order: index + 1,
      received_value: item.received_value || item.unit_price * item.quantity,
      created_at: now,
      updated_at: now,
        branch_id: currentBranchId || '',

      _synced: false
    }));

    // Use transaction to ensure atomicity for all operations
    await db.transaction('rw', [db.bills, db.bill_line_items, db.inventory_items], async () => {
      // Add bill and line items
      await db.bills.add(billData as any);
      await db.bill_line_items.bulkAdd(lineItems);

      // Deduct from specific inventory items
      for (const item of items) {
        if (item.inventory_item_id) {
          // Use the specific inventory item ID if provided
          const inventoryItem = await db.inventory_items.get(item.inventory_item_id);
          if (inventoryItem && inventoryItem.quantity >= item.quantity) {
            const newQuantity = inventoryItem.quantity - item.quantity;

            if (newQuantity <= 0) {
              // Keep inventory item with quantity = 0 for received bills review instead of deleting
              await db.inventory_items.update(item.inventory_item_id, {
                quantity: 0,
                _synced: false
              });
            } else {
              // Update with new quantity
              await db.inventory_items.update(item.inventory_item_id, {
                quantity: newQuantity,
                _synced: false
              });
            }
          }
        } else {
          // Fallback to FIFO if no specific inventory item ID (legacy support)
          // Validate product_id before using it in database query
          if (!item.product_id || (typeof item.product_id !== 'string' && typeof item.product_id !== 'number')) {
            console.error('Invalid product_id in line item:', item);
            throw new Error(`Invalid product_id: ${item.product_id}. Product ID must be a string or number.`);
          }
          
          const inventoryRecords = await db.inventory_items
            .where('product_id')
            .equals(item.product_id)
            .and(inv => inv.quantity > 0)
            .sortBy('received_at');

          let qtyToDeduct = item.quantity || 1; // Default to 1 if not specified
          for (const inv of inventoryRecords) {
            if (qtyToDeduct <= 0) break;

            const deduct = Math.min(inv.quantity, qtyToDeduct);
            const newQuantity = inv.quantity - deduct;

            if (newQuantity <= 0) {
              // Keep inventory item with quantity = 0 for received bills review instead of deleting
              await db.inventory_items.update(inv.id, {
                quantity: 0,
                _synced: false
              });
            } else {
              // Update with new quantity
              await db.inventory_items.update(inv.id, {
                quantity: newQuantity,
                _synced: false
              });
            }
            qtyToDeduct -= deduct;
          }
        }
      }
    });

    // Cash drawer updates are handled automatically by the database hook (handleSaleItemCreated)
    // when sale items are created, so no manual update is needed here

    await refreshData();
    await updateUnsyncedCount();

    // Store undo data for sale
    const saleUndoData = {
      type: 'complete_sale',
      affected: lineItems.map(si => ({ table: 'bill_line_items', id: si.id })),
      steps: lineItems.map(si => ({ op: 'delete', table: 'bill_line_items', id: si.id }))
    };

    // Add inventory restoration steps
    for (const item of items) {
      if (item.inventory_item_id) {
        const inventoryItem = await db.inventory_items.get(item.inventory_item_id);
        if (inventoryItem) {
          saleUndoData.steps.push({
            op: 'update',
            table: 'inventory_items',
            id: item.inventory_item_id
          });
          saleUndoData.affected.push({ table: 'inventory_items', id: item.inventory_item_id });
        }
      }
    }

    // Note: Cash drawer updates are now handled directly via cashDrawerUpdateService
    // The transaction records created by the service will be cleaned up during undo

    // Update cash drawer for cash sales (following the same pattern as payments)
    const cashSaleItemsForDrawer = lineItems.filter(item => item.payment_method === 'cash');
    if (cashSaleItemsForDrawer.length > 0) {
      try {
        const { cashDrawerUpdateService } = await import('../services/cashDrawerUpdateService');

        const totalCashAmount = cashSaleItemsForDrawer.reduce((sum, item) => sum + (item.received_value || 0), 0);

        // console.log(`💰 Updating cash drawer for cash sales: $${totalCashAmount}`);

        const cashDrawerResult = await cashDrawerUpdateService.updateCashDrawerForTransaction({
          type: 'sale',
          amount: totalCashAmount,
          currency: 'LBP', // Assuming LBP for now, could be made dynamic
          description: `Cash sale - ${cashSaleItemsForDrawer.length} items`,
          reference: generateSaleReference(),
          storeId: storeId,
          createdBy: currentUserId,
          customerId: cashSaleItemsForDrawer[0]?.customer_id || undefined,
        branchId: currentBranchId || '',

          allowAutoSessionOpen: true
        }, getStore);

        if (cashDrawerResult.success) {
          debug(`✅ Cash drawer updated: $${cashDrawerResult.previousBalance?.toFixed(2)} → $${cashDrawerResult.newBalance?.toFixed(2)}`);
        } else {
          console.error('❌ Failed to update cash drawer:', cashDrawerResult.error);
        }
      } catch (error) {
        console.error('❌ Error updating cash drawer for sales:', error);
      }
    }

    pushUndo(saleUndoData);

    // Reset auto-sync timer to ensure full undo window
    resetAutoSyncTimer();

    // Use debounced sync to batch rapid changes
    debouncedSync();
  };

  const updateSale = async (id: string, updates: Partial<BillLineItem>): Promise<void> => {
    if (!storeId) throw new Error('No store ID available');
    
    const currentUserId = userProfile?.id;
    if (!currentUserId) {
      throw new Error('No user ID available - user not authenticated');
    }

    // Get the original sale item to compare quantities
    const originalSale = await db.bill_line_items.get(id);
    if (!originalSale) throw new Error('Sale item not found');

    // Transform updates to database format
    const dbUpdates = BillLineItemTransforms.toDbUpdate(updates);

    // Check if quantity has changed
    const quantityChanged = updates.quantity !== undefined && updates.quantity !== originalSale.quantity;
    const quantityDifference = quantityChanged ? (updates.quantity || 0) - (originalSale.quantity || 0) : 0;

    // Check if price-related fields have changed (these affect bill totals)
    const priceChanged = updates.unit_price !== undefined || updates.received_value !== undefined || updates.weight !== undefined;

    // ==================== USE AUDIT TRAIL FUNCTION ====================
    // Use db.updateBillLineItem which creates audit logs with ID resolution
    await db.updateBillLineItem(id, dbUpdates, currentUserId);

    // Handle inventory adjustments outside the transaction if quantity changed
    if (quantityChanged && originalSale.product_id) {
      if (quantityDifference > 0) {
        // Quantity increased - deduct additional inventory
        await deductInventoryQuantity(originalSale.product_id, quantityDifference);
      } else if (quantityDifference < 0) {
        // Quantity decreased - restore inventory
        await restoreInventoryQuantity(originalSale.product_id, Math.abs(quantityDifference));
      }
    }

    // Update related bills if price-related fields changed
    if (priceChanged) {
      await db.updateBillsForLineItem(id);
    }

    // Store undo data with original values
    const undoChanges: any = {};
    for (const key of Object.keys(dbUpdates)) {
      if (key !== '_synced' && key !== 'updated_at') {
        undoChanges[key] = (originalSale as any)[key];
      }
    }
    
    pushUndo({
      type: 'update_sale',
      affected: [{ table: 'bill_line_items', id }],
      steps: [{ op: 'update', table: 'bill_line_items', id, changes: undoChanges }],
      // Store inventory adjustment info for undo
      metadata: {
        quantityDifference,
        product_id: originalSale.product_id
      }
    });

    await refreshData();
    await updateUnsyncedCount();

    // Reset auto-sync timer to ensure full undo window
    resetAutoSyncTimer();

    // Use debounced sync to batch rapid changes
    debouncedSync();
  };

  const deleteSale = async (id: string): Promise<void> => {
    if (!storeId) throw new Error('No store ID available');

    // Get the sale item before deletion to restore inventory
    const saleItem = await db.bill_line_items.get(id);
    if (!saleItem) throw new Error('Sale item not found');

    // Use transaction to ensure atomicity for the sale deletion only
    await db.transaction('rw', [db.bill_line_items], async () => {
      // Delete the sale item
      await db.bill_line_items.delete(id);
    });

    // Restore inventory quantities outside the transaction
    if (saleItem.quantity && saleItem.quantity > 0) {
      await restoreInventoryQuantity(saleItem.product_id, saleItem.quantity);
    }

    // Store undo data - restore the deleted sale item
    pushUndo({
      type: 'delete_sale',
      affected: [{ table: 'bill_line_items', id }],
      steps: [{ op: 'restore', table: 'bill_line_items', record: saleItem }],
      // Store inventory info for undo
      metadata: {
        quantity: saleItem.quantity,
        product_id: saleItem.product_id
      }
    });

    await refreshData();
    await updateUnsyncedCount();

    // Reset auto-sync timer to ensure full undo window
    resetAutoSyncTimer();

    // Use debounced sync to batch rapid changes
    debouncedSync();
  };

  const addTransaction = async (transactionData: Omit<Tables['transactions']['Insert'], 'store_id'>): Promise<void> => {
    if (!storeId) throw new Error('No store ID available');

    const transactionId = (transactionData as any).id || createId();
    const currentUserId = userProfile?.id || transactionData.created_by || 'system';
    
    // Map old category format to new standardized categories
    const categoryMapping: Record<string, string> = {
      'Commission': TRANSACTION_CATEGORIES.SUPPLIER_COMMISSION,
      'Customer Payment': TRANSACTION_CATEGORIES.CUSTOMER_PAYMENT_RECEIVED,
      'Supplier Payment': TRANSACTION_CATEGORIES.SUPPLIER_PAYMENT,
      'Accounts Receivable': TRANSACTION_CATEGORIES.CUSTOMER_CREDIT_SALE,
      'Accounts Payable': TRANSACTION_CATEGORIES.SUPPLIER_CREDIT_SALE,
      // Additional fee categories
      'Porterage': TRANSACTION_CATEGORIES.SUPPLIER_PORTERAGE,
      'Transfer Fee': TRANSACTION_CATEGORIES.SUPPLIER_TRANSFER_FEE,
      // Advance categories
      'Supplier Advance': TRANSACTION_CATEGORIES.SUPPLIER_ADVANCE_GIVEN, // Default to given
    };
    
    const mappedCategory = categoryMapping[transactionData.category as string] || transactionData.category as string;
    
    // Validate category exists in TRANSACTION_CATEGORIES
    const isValidCategory = Object.values(TRANSACTION_CATEGORIES).includes(mappedCategory as any);
    
    if (!isValidCategory) {
      // Fallback: use direct DB write for unknown categories (backward compatibility)
      console.warn(`⚠️ Unknown transaction category: ${transactionData.category}. Using direct DB write.`);
      const transaction: Transaction = {
        ...transactionData,
        id: transactionId,
        customer_id: transactionData.customer_id ?? null,
        supplier_id: transactionData.supplier_id ?? null,
        store_id: storeId,
        branch_id: currentBranchId || '',

        created_at: new Date().toISOString(),
        _synced: false,
        amount: transactionData.amount,
        reference: transactionData.reference ?? null
      };
      await db.transactions.add(transaction);
    } else {
      // Use unified transaction service for validated categories
      await transactionService.createTransaction({
        category: mappedCategory as any,
        amount: transactionData.amount,
        currency: (transactionData.currency as 'USD' | 'LBP') || 'USD',
        description: transactionData.description || '',
        reference: transactionData.reference ?? undefined,
        customerId: transactionData.customer_id ?? undefined,
        supplierId: transactionData.supplier_id ?? undefined,
        context: {
          userId: currentUserId,
          storeId: storeId,
          module: 'accounting',
        branch_id: currentBranchId || '',

          source: 'offline'
        },
        updateBalances: false, // Caller handles balance updates
        updateCashDrawer: false, // Caller handles cash drawer
        createAuditLog: true,
        _synced: false
      });
    }
    
    // Store undo data
    pushUndo({
      type: 'add_transaction',
      affected: [{ table: 'transactions', id: transactionId }],
      steps: [{ op: 'delete', table: 'transactions', id: transactionId }]
    });
    
    await refreshData();
    await updateUnsyncedCount();

    // Reset auto-sync timer to ensure full undo window
    resetAutoSyncTimer();

    // Use debounced sync to batch rapid changes
    debouncedSync();
  };

  const addExpenseCategory = async (_categoryData: any): Promise<void> => {
    if (!storeId) throw new Error('No store ID available');

    // Expense categories not supported in current schema
    console.warn('Expense categories not supported in current schema');
    return;
  };

  const updateInventoryBatch = async (id: string, updates: Partial<Tables['inventory_bills']['Update']>): Promise<void> => {
    // Get original data for undo
    const originalBatch = await db.inventory_bills.get(id);
    if (!originalBatch) throw new Error('Inventory batch not found');
    
    // Process updates to ensure proper data types
    const processedUpdates: any = {
      ...updates,
      _synced: false
    };

    // Handle numeric fields
    if (updates.commission_rate !== undefined) {
      processedUpdates.commission_rate = typeof updates.commission_rate === 'string' 
        ? parseFloat(updates.commission_rate) || null 
        : updates.commission_rate;
    }

    if (updates.porterage_fee !== undefined) {
      processedUpdates.porterage_fee = typeof updates.porterage_fee === 'string' 
        ? parseFloat(updates.porterage_fee) || null 
        : updates.porterage_fee;
    }

    if (updates.transfer_fee !== undefined) {
      processedUpdates.transfer_fee = typeof updates.transfer_fee === 'string' 
        ? parseFloat(updates.transfer_fee) || null 
        : updates.transfer_fee;
    }

    if (updates.plastic_fee !== undefined) {
      processedUpdates.plastic_fee = typeof updates.plastic_fee === 'string' 
        ? updates.plastic_fee 
        : (updates.plastic_fee as any)?.toString() || null;
    }

    // Handle date fields
    if (updates.received_at !== undefined) {
      processedUpdates.received_at = updates.received_at || new Date().toISOString();
    }

    // Ensure status is never null (database constraint)
    if (updates.status !== undefined) {
      processedUpdates.status = updates.status || 'Created';
    } else {
      // If status is not being updated, ensure it has a default value
      processedUpdates.status = 'Created';
    }

    // Ensure type is never null (database constraint)
    if (updates.type !== undefined) {
      processedUpdates.type = updates.type || 'commission';
    }

    // Ensure supplier_id is never null (database constraint)
    if (updates.supplier_id !== undefined) {
      processedUpdates.supplier_id = updates.supplier_id;
    }

    // Remove fields that don't exist in the database schema
    delete processedUpdates.plastic_count;
    delete processedUpdates.plastic_price;

    await db.inventory_bills.update(id, processedUpdates);
    
    // Check if bill was just closed - clean up notifications
    if (updates.status && typeof updates.status === 'string' && updates.status.includes('[CLOSED]')) {
      if (storeId) {
        // Get all inventory items with this batch_id and mark them as closed in monitoring
        const inventoryItems = await db.inventory_items
          .where('batch_id')
          .equals(id)
          .toArray();
        
        for (const item of inventoryItems) {
          receivedBillMonitoringService.markBillAsClosed(storeId, item.id).catch(err => {
            console.error('Error marking bill as closed in monitoring:', err);
          });
        }
      }
    }
    
    // Store undo data with original values
    const undoChanges: any = {};
    for (const key of Object.keys(updates)) {
      if (key !== '_synced' && key !== 'updated_at') {
        undoChanges[key] = (originalBatch as any)[key];
      }
    }
    
    pushUndo({
      type: 'update_inventory_batch',
      affected: [{ table: 'inventory_bills', id }],
      steps: [{ op: 'update', table: 'inventory_bills', id, changes: undoChanges }]
    });
    
    await refreshData();
    await updateUnsyncedCount();

    // Reset auto-sync timer to ensure full undo window
    resetAutoSyncTimer();

    debouncedSync();
  };

  const applyCommissionRateToBatch = async (batchId: string, commissionRate: number): Promise<void> => {
    // Get original data for undo
    const originalBatch = await db.inventory_bills.get(batchId);
    if (!originalBatch) throw new Error('Inventory batch not found');
    
    // Update commission rate for the batch
    await db.inventory_bills
      .where('id')
      .equals(batchId)
      .modify({ commission_rate: commissionRate, _synced: false });

    // Store undo data
    pushUndo({
      type: 'apply_commission_rate',
      affected: [{ table: 'inventory_bills', id: batchId }],
      steps: [{ op: 'update', table: 'inventory_bills', id: batchId, changes: { commission_rate: originalBatch.commission_rate, _synced: false } }]
    });
    
    await refreshData();
    await updateUnsyncedCount();

    // Reset auto-sync timer to ensure full undo window
    resetAutoSyncTimer();

    debouncedSync();
  };

  // Expose the updateBillsForSaleItem method for direct access
  const updateBillsForSaleItem = async (saleItemId: string): Promise<void> => {
    await db.updateBillsForLineItem(saleItemId);
  };

  const fullResync = async (): Promise<SyncResult> => {
    if (!storeId) {
      return { success: false, errors: ['No store ID available'], synced: { uploaded: 0, downloaded: 0 }, conflicts: 0 };
    }

    setIsSyncing(true);
    setLoading(prev => ({ ...prev, sync: true }));

    try {
      const result = await syncService.fullResync(storeId);
      setLastSync(new Date());

      await refreshData();
      await updateUnsyncedCount();

      return result;
    } catch (error) {
      console.error('Full resync error:', error);
      return {
        success: false,
        errors: [error instanceof Error ? error.message : 'Unknown resync error'],
        synced: { uploaded: 0, downloaded: 0 },
        conflicts: 0
      };
    } finally {
      setIsSyncing(false);
      setLoading(prev => ({ ...prev, sync: false }));
    }
  };

  const validateAndCleanData = async (): Promise<{ cleaned: number; report: any }> => {
    if (!storeId) {
      throw new Error('No store ID available');
    }

    try {
      // Clean up orphaned records and invalid inventory items
      const [orphanedCleaned, invalidCleaned] = await Promise.all([
        db.cleanupOrphanedRecords(storeId),
        db.cleanupInvalidInventoryItems()
      ]);
      
      const cleaned = orphanedCleaned + invalidCleaned;

      if (cleaned > 0) {
        await refreshData();
        await updateUnsyncedCount();
      }

      return {
        cleaned,
        report: {
          orphanedRecords: orphanedCleaned,
          invalidInventory: invalidCleaned,
          message: `Cleaned ${cleaned} records (${orphanedCleaned} orphaned, ${invalidCleaned} invalid)`
        }
      };
    } catch (error) {
      console.error('Data validation/cleanup failed:', error);
      throw error;
    }
  };

  const getSyncStatus = () => ({
    isOnline,
    lastSync,
    unsyncedCount,
    isSyncing,
    isAutoSyncing
  });

  // General utility function for cash drawer transactions (without undo data storage)
  const processCashDrawerTransaction = async (
    transactionData: {
      type: 'sale' | 'payment' | 'expense' | 'refund';
      amount: number;
      currency: 'USD' | 'LBP';
      description: string;
      reference: string;
      customerId?: string;
      supplierId?: string;
    }
  ) => {
    if (!storeId || !userProfile?.id) {
      throw new Error('Store ID or user ID not available');
    }

    try {
      const { cashDrawerUpdateService } = await import('../services/cashDrawerUpdateService');

      const cashDrawerResult = await cashDrawerUpdateService.updateCashDrawerForTransaction({
        ...transactionData,
        storeId,
        createdBy: userProfile.id,
        branchId: currentBranchId || '',

        allowAutoSessionOpen: true
      }, getStore);

      if (!cashDrawerResult.success) {
        throw new Error(cashDrawerResult.error || 'Failed to update cash drawer');
      }

      // Get the cash drawer account ID for undo purposes
      const account = await db.getCashDrawerAccount(storeId, currentBranchId!);
      const accountId = account?.id;

      return {
        success: true,
        transactionId: cashDrawerResult.transactionId,
        previousBalance: cashDrawerResult.previousBalance,
        newBalance: cashDrawerResult.newBalance,
        accountId: accountId
      };
    } catch (error) {
      console.error('Cash drawer transaction failed:', error);
      throw error;
    }
  };

  // Helper function to create cash drawer undo data
  const createCashDrawerUndoData = (
    transactionId: string | undefined,
    previousBalance: number | undefined,
    accountId: string | undefined,
    additionalUndoData?: {
      affected: Array<{ table: string; id: string }>;
      steps: Array<{ op: string; table: string; id: string; changes?: any }>;
    }
  ) => {
    console.log('🔧 Creating cash drawer undo data:', {
      transactionId,
      previousBalance,
      accountId,
      additionalUndoData
    });

    const undoData = {
      type: 'cash_drawer_transaction',
      affected: [
        ...(additionalUndoData?.affected || []),
        ...(transactionId ? [{ table: 'transactions', id: transactionId }] : []),
        ...(accountId ? [{ table: 'cash_drawer_accounts', id: accountId }] : [])
      ],
      steps: [
        ...(additionalUndoData?.steps || []),
        // Add transaction cleanup if we have a transaction ID
        ...(transactionId ? [{
          op: 'delete',
          table: 'transactions',
          id: transactionId
        }] : []),
        // Add cash drawer restoration
        ...(previousBalance !== undefined && accountId ? [{
          op: 'update',
          table: 'cash_drawer_accounts',
          id: accountId,
          changes: {
            current_balance: previousBalance,
            _synced: false
          }
        }] : [])
      ]
    };

    console.log('🔧 Created undo data:', undoData);
    return undoData;
  };

  // Utility function to create unique IDs
  const createIdFunction = (): string => {
    return createId();
  };

  // Get current cash drawer balance for a store
  const getCurrentCashDrawerBalance = async (storeId: string): Promise<number> => {
    try {
      const currentAccount = await db.cash_drawer_accounts
        .where('store_id')
        .equals(storeId)
        .and(account => account.is_active)
        .first();

      return currentAccount?.current_balance || 0;
    } catch (error) {
      console.error('Error getting cash drawer balance:', error);
      return 0;
    }
  };

  // Refresh cash drawer balance (same as getCurrentCashDrawerBalance for now)
  const refreshCashDrawerBalance = async (storeId: string): Promise<number> => {
    return getCurrentCashDrawerBalance(storeId);
  };

  // ⭐⭐⭐ ATOMIC PAYMENT PROCESSING FUNCTION ⭐⭐⭐
  // Fixed atomicity violation - all operations now happen in a single database transaction
  const processPayment = async (params: {
    entityType: 'customer' | 'supplier';
    entityId: string;
    amount: string;
    currency: 'USD' | 'LBP';
    description: string;
    reference: string;
    storeId: string;
    createdBy: string;
    paymentDirection: 'receive' | 'pay'; // 'receive' = they pay us, 'pay' = we pay them
  }): Promise<{ success: boolean; error?: string }> => {
    try {
      const { entityType, entityId, amount, currency, description, reference, storeId, createdBy, paymentDirection } = params;
      
      // Validate amount
      const numAmount = parseFloat(amount);
      if (isNaN(numAmount) || numAmount <= 0) {
        return { success: false, error: 'Please enter a valid positive amount' };
      }

      // Find entity (read-only operation outside transaction)
      const entity = entityType === 'customer' 
        ? customers.find(c => c.id === entityId)
        : suppliers.find(s => s.id === entityId);

      if (!entity) {
        return { success: false, error: `${entityType.charAt(0).toUpperCase() + entityType.slice(1)} not found` };
      }

      const isCustomer = entityType === 'customer';

      // Calculate amount in LBP for cash drawer (cash drawer always works in LBP)
      let amountInLBP = numAmount;
      if (currency === 'USD') {
        amountInLBP = numAmount * exchangeRate;
      }

      // Only check cash drawer balance when PAYING OUT money (not when receiving)
      // When paymentDirection is 'receive', money is coming IN, so no balance check needed
      if (paymentDirection === 'pay') {
        const currentBalance = await getCurrentCashDrawerBalance(storeId);
        if (amountInLBP > currentBalance) {
          return { 
            success: false, 
            error: `Insufficient cash drawer balance. Payment: ${currency === 'USD' ? `$${numAmount.toFixed(2)}` : `${Math.round(numAmount).toLocaleString()} ل.ل`} (${Math.round(amountInLBP).toLocaleString()} LBP), Available: ${Math.round(currentBalance).toLocaleString()} LBP` 
          };
        }
      }

      // Get current balances (read-only operation outside transaction)
      const currentLbBalance = entity.lb_balance || 0;
      const currentUsdBalance = entity.usd_balance || 0;

      console.log(`💳 [ATOMIC] Payment Processing - Entity: ${entity.name}, Type: ${isCustomer ? 'Customer' : 'Supplier'}, Direction: ${paymentDirection}, Currency: ${currency}`);
      console.log(`💳 [ATOMIC] Current Balances - LBP: ${currentLbBalance}, USD: ${currentUsdBalance}`);
      console.log(`💳 [ATOMIC] Payment Amount: ${numAmount}`);

      // Calculate new balance - DIFFERENT LOGIC FOR CUSTOMERS VS SUPPLIERS
      let newBalance: number;
      let balanceField: string;
      
      if (currency === 'LBP') {
        if (isCustomer) {
          // CUSTOMER BALANCE: positive = customer owes us, negative = we owe customer
          newBalance = paymentDirection === 'receive' 
            ? currentLbBalance - numAmount  // Customer pays us → they owe us less
            : currentLbBalance + numAmount; // We pay customer → we owe them more (or they owe us less)
        } else {
          // SUPPLIER BALANCE: positive = we owe supplier, negative = supplier owes us
          newBalance = paymentDirection === 'receive'
            ? currentLbBalance + numAmount  // Supplier pays us → they owe us less (rare scenario)
            : currentLbBalance - numAmount; // We pay supplier → we owe them less
        }
        balanceField = 'lb_balance';
      } else {
        if (isCustomer) {
          // CUSTOMER BALANCE: positive = customer owes us, negative = we owe customer
          newBalance = paymentDirection === 'receive'
            ? currentUsdBalance - numAmount  // Customer pays us → they owe us less
            : currentUsdBalance + numAmount; // We pay customer → we owe them more (or they owe us less)
        } else {
          // SUPPLIER BALANCE: positive = we owe supplier, negative = supplier owes us
          newBalance = paymentDirection === 'receive'
            ? currentUsdBalance + numAmount  // Supplier pays us → they owe us less (rare scenario)
            : currentUsdBalance - numAmount; // We pay supplier → we owe them less
        }
        balanceField = 'usd_balance';
      }

      console.log(`💳 [ATOMIC] ${paymentDirection === 'receive' ? 'Payment received from' : 'Payment sent to'} ${isCustomer ? 'customer' : 'supplier'}: ${currency} balance ${currency === 'LBP' ? currentLbBalance : currentUsdBalance} → ${newBalance} (${newBalance < 0 ? 'CREDIT' : 'DEBT'})`);

      // Prepare transaction data
      const cashDrawerType = paymentDirection === 'receive' ? 'payment' : 'expense';
      const transactionDescription = `${paymentDirection === 'receive' ? 'Payment received from' : 'Payment sent to'} ${entity.name}${description ? ': ' + description : ''} ${currency === 'USD' ? `($${numAmount.toFixed(2)} USD)` : ''}`;
      
      let cashDrawerResult: any;
      let transactionId: string | undefined;
      let previousBalance: number | undefined;
      let accountId: string | undefined;

      // ⭐⭐⭐ ATOMIC TRANSACTION BLOCK - ALL OR NOTHING ⭐⭐⭐
      await db.transaction('rw', 
        [
          db.customers, 
          db.suppliers, 
          db.transactions, 
          db.cash_drawer_accounts, 
          db.cash_drawer_sessions
        ], 
        async () => {
          console.log('💳 [ATOMIC] Starting atomic transaction block...');

          // 1. Update entity balance atomically
          const updateData = { [balanceField]: newBalance, _synced: false };
          if (isCustomer) {
            await db.customers.update(entityId, updateData);
          } else {
            await db.suppliers.update(entityId, updateData);
          }
          console.log(`💳 [ATOMIC] Entity balance updated: ${balanceField} = ${newBalance}`);

          // 2. Process cash drawer transaction atomically (within existing transaction)
          // NOTE: We can't call processCashDrawerTransaction() here because it creates its own transaction
          // Instead, we'll do the cash drawer operations directly within this atomic block
          
          // Get cash drawer account
          const cashDrawerAccount = await db.getCashDrawerAccount(storeId, currentBranchId!);
          if (!cashDrawerAccount) {
            throw new Error('No cash drawer account found. Please create one before processing payments.');
          }

          // Calculate balance change
          const previousCashBalance = Number(cashDrawerAccount.current_balance ?? 0) || 0;
          const balanceChange = paymentDirection === 'receive' ? amountInLBP : -amountInLBP;
          const newCashBalance = previousCashBalance + balanceChange;

          // Validate cash drawer balance for outgoing payments
          if (paymentDirection === 'pay' && newCashBalance < 0) {
            throw new Error(`Insufficient cash drawer balance. Required: ${Math.round(amountInLBP).toLocaleString()} LBP, Available: ${Math.round(previousCashBalance).toLocaleString()} LBP`);
          }

          // Update cash drawer balance atomically
          await db.cash_drawer_accounts.update(cashDrawerAccount.id, {
            current_balance: newCashBalance,
            updated_at: new Date().toISOString(),
            _synced: false
          });

          // Create transaction record atomically
          const transactionRecord = {
            id: crypto.randomUUID(),
            store_id: storeId,
            type: (paymentDirection === 'receive' ? 'income' : 'expense') as 'income' | 'expense',
            category: isCustomer 
              ? (paymentDirection === 'receive' ? 'Customer Payment' : 'Customer Payment')
              : (paymentDirection === 'receive' ? 'Supplier Payment' : 'Supplier Payment'),
            amount: numAmount,
            currency: currency,
            description: transactionDescription,
            reference: reference || generatePaymentReference(),
            customer_id: isCustomer ? entityId : null,
            supplier_id: isCustomer ? null : entityId,
            employee_id: null,
            created_by: createdBy,
        branch_id: currentBranchId || '',

            metadata: {
              payment_direction: paymentDirection,
              original_currency: currency,
              cash_drawer_amount: amountInLBP,
              exchange_rate: currency === 'USD' ? exchangeRate : 1
            },
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
            _synced: false
          };

          await db.transactions.add(transactionRecord);

          // Set result for undo data creation
          cashDrawerResult = {
            success: true,
            transactionId: transactionRecord.id,
            previousBalance: previousCashBalance,
            newBalance: newCashBalance,
            accountId: cashDrawerAccount.id
          };

          console.log(`💳 [ATOMIC] Cash drawer updated: ${previousCashBalance} → ${newCashBalance} LBP`);
          console.log(`💳 [ATOMIC] Transaction created: ${transactionRecord.id}`);

          transactionId = cashDrawerResult.transactionId;
          previousBalance = cashDrawerResult.previousBalance;
          accountId = cashDrawerResult.accountId;

          console.log('💳 [ATOMIC] Cash drawer transaction created successfully');
        }
      );
      // ⭐⭐⭐ END ATOMIC TRANSACTION - ALL OPERATIONS COMMITTED ⭐⭐⭐

      console.log('✅ [ATOMIC] All operations completed successfully - transaction committed');

      // Create undo data (outside transaction - non-critical)
      try {
        const baseUndoData = {
          affected: [
            { table: isCustomer ? 'customers' : 'suppliers', id: entityId }
          ],
          steps: [
            {
              op: 'update',
              table: isCustomer ? 'customers' : 'suppliers',
              id: entityId,
              changes: currency === 'LBP'
                ? { lb_balance: currentLbBalance, _synced: false }
                : { usd_balance: currentUsdBalance, _synced: false }
            }
          ]
        };

        const undoData = createCashDrawerUndoData(
          transactionId,
          previousBalance,
          accountId,
          baseUndoData
        );

        pushUndo(undoData);
      } catch (undoError) {
        console.warn('⚠️ Undo data creation failed (non-critical):', undoError);
      }

      // Refresh data (outside transaction - non-critical)
      try {
        await refreshData();
      } catch (refreshError) {
        console.warn('⚠️ Data refresh failed (non-critical):', refreshError);
      }

      return { success: true };

    } catch (error) {
      console.error('❌ [ATOMIC] Payment processing failed - all operations rolled back:', error);
      return { 
        success: false, 
        error: error instanceof Error ? error.message : 'Payment processing failed - all operations rolled back' 
      };
    }
  };

  // ⭐⭐⭐ ATOMIC EMPLOYEE PAYMENT PROCESSING FUNCTION ⭐⭐⭐
  // Fixed atomicity violation - all operations now happen in a single database transaction
  const processEmployeePayment = async (params: {
    employeeId: string;
    amount: string;
    currency: 'USD' | 'LBP';
    description: string;
    reference: string;
    storeId: string;
    createdBy: string;
  }): Promise<{ success: boolean; error?: string }> => {
    try {
      const { employeeId, amount, currency, description, reference, storeId, createdBy } = params;
      
      // Validate amount
      const numAmount = parseFloat(amount);
      if (isNaN(numAmount) || numAmount <= 0) {
        return { success: false, error: 'Please enter a valid positive amount' };
      }

      // Find employee (read-only operation outside transaction)
      const employee = employees.find(e => e.id === employeeId);
      if (!employee) {
        return { success: false, error: 'Employee not found' };
      }

      // Calculate amount in LBP for cash drawer
      let amountInLBP = numAmount;
      if (currency === 'USD') {
        amountInLBP = numAmount * exchangeRate;
      }

      // Check cash drawer balance (read-only operation outside transaction)
      const currentBalance = await getCurrentCashDrawerBalance(storeId);
      if (amountInLBP > currentBalance) {
        return { 
          success: false, 
          error: `Insufficient cash drawer balance. Payment: ${currency === 'USD' ? `$${numAmount.toFixed(2)}` : `${Math.round(numAmount).toLocaleString()} ل.ل`} (${Math.round(amountInLBP).toLocaleString()} LBP), Available: ${Math.round(currentBalance).toLocaleString()} LBP` 
        };
      }

      // Get current balances (read-only operation outside transaction)
      const currentLbBalance = employee.lbp_balance || 0;
      const currentUsdBalance = employee.usd_balance || 0;

      console.log(`💳 [ATOMIC] Employee Payment - Employee: ${employee.name}, Currency: ${currency}`);
      console.log(`💳 [ATOMIC] Current Balances - LBP: ${currentLbBalance}, USD: ${currentUsdBalance}`);
      console.log(`💳 [ATOMIC] Payment Amount: ${numAmount}`);

      // Calculate new balance
      let newBalance: number;
      let balanceField: string;
      
      if (currency === 'LBP') {
        newBalance = currentLbBalance - numAmount; // We pay them → we owe them less
        balanceField = 'lbp_balance';
      } else {
        newBalance = currentUsdBalance - numAmount; // We pay them → we owe them less
        balanceField = 'usd_balance';
      }

      console.log(`💳 [ATOMIC] Payment sent to employee: ${currency} balance ${currency === 'LBP' ? currentLbBalance : currentUsdBalance} → ${newBalance}`);

      // Prepare transaction data
      const transactionDescription = `Employee payment - ${employee.name}${description ? ': ' + description : ''} ${currency === 'USD' ? `($${numAmount.toFixed(2)} USD)` : ''}`;
      
      let cashDrawerResult: any;

      // ⭐⭐⭐ ATOMIC TRANSACTION BLOCK - ALL OR NOTHING ⭐⭐⭐
      await db.transaction('rw', 
        [
          db.employees, 
          db.transactions, 
          db.cash_drawer_accounts, 
          db.cash_drawer_sessions
        ], 
        async () => {
          console.log('💳 [ATOMIC] Starting atomic employee payment transaction...');

          // 1. Update employee balance atomically
          const updateData = { 
            [balanceField]: newBalance, 
            updated_at: new Date().toISOString(),
            _synced: false 
          };
          await db.employees.update(employeeId, updateData);
          console.log(`💳 [ATOMIC] Employee balance updated: ${balanceField} = ${newBalance}`);

          // 2. Process cash drawer transaction atomically (within existing transaction)
          // NOTE: We can't call processCashDrawerTransaction() here because it creates its own transaction
          // Instead, we'll do the cash drawer operations directly within this atomic block
          
          // Get cash drawer account
          const cashDrawerAccount = await db.getCashDrawerAccount(storeId, currentBranchId!);
          if (!cashDrawerAccount) {
            throw new Error('No cash drawer account found. Please create one before processing payments.');
          }

          // Calculate balance change (employee payment is always an expense - money going out)
          const previousCashBalance = Number(cashDrawerAccount.current_balance ?? 0) || 0;
          const balanceChange = -amountInLBP; // Negative because we're paying out
          const newCashBalance = previousCashBalance + balanceChange;

          // Validate cash drawer balance
          if (newCashBalance < 0) {
            throw new Error(`Insufficient cash drawer balance. Required: ${Math.round(amountInLBP).toLocaleString()} LBP, Available: ${Math.round(previousCashBalance).toLocaleString()} LBP`);
          }

          // Update cash drawer balance atomically
          await db.cash_drawer_accounts.update(cashDrawerAccount.id, {
            current_balance: newCashBalance,
            updated_at: new Date().toISOString(),
            _synced: false
          });

          // Create transaction record atomically
          const transactionRecord = {
            id: crypto.randomUUID(),
            store_id: storeId,
            type: 'expense' as 'expense',
            category: 'Employee Payment',
            amount: numAmount,
            currency: currency,
            description: transactionDescription,
            reference: reference || generatePaymentReference(),
            customer_id: null,
            supplier_id: null,
            employee_id: employeeId,
            created_by: createdBy,
        branch_id: currentBranchId || '',

            metadata: {
              payment_type: 'employee_salary',
              original_currency: currency,
              cash_drawer_amount: amountInLBP,
              exchange_rate: currency === 'USD' ? exchangeRate : 1
            },
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
            _synced: false
          };

          await db.transactions.add(transactionRecord);

          // Set result for undo data creation
          cashDrawerResult = {
            success: true,
            transactionId: transactionRecord.id,
            previousBalance: previousCashBalance,
            newBalance: newCashBalance,
            accountId: cashDrawerAccount.id
          };

          console.log(`💳 [ATOMIC] Cash drawer updated: ${previousCashBalance} → ${newCashBalance} LBP`);
          console.log(`💳 [ATOMIC] Employee transaction created: ${transactionRecord.id}`);

          console.log('💳 [ATOMIC] Cash drawer transaction created successfully');
        }
      );
      // ⭐⭐⭐ END ATOMIC TRANSACTION - ALL OPERATIONS COMMITTED ⭐⭐⭐

      console.log('✅ [ATOMIC] All employee payment operations completed successfully - transaction committed');

      // Refresh data (outside transaction - non-critical)
      try {
        await refreshData();
      } catch (refreshError) {
        console.warn('⚠️ Data refresh failed (non-critical):', refreshError);
      }

      return { success: true };

    } catch (error) {
      console.error('❌ [ATOMIC] Employee payment processing failed - all operations rolled back:', error);
      return { 
        success: false, 
        error: error instanceof Error ? error.message : 'Employee payment processing failed - all operations rolled back' 
      };
    }
  };

  // Process supplier advance payment (give advance or deduct from advance)
  const processSupplierAdvance = async (params: {
    supplierId: string;
    amount: number;
    currency: 'USD' | 'LBP';
    type: 'give' | 'deduct';
    description: string;
    date: string;
    reviewDate?: string;
  }): Promise<void> => {
    try {
      const { supplierId, amount, currency, type, description, date, reviewDate } = params;

      // Validate amount
      if (isNaN(amount) || amount <= 0) {
        throw new Error('Please enter a valid positive amount');
      }

      // Find supplier
      const supplier = suppliers.find(s => s.id === supplierId);
      if (!supplier) {
        throw new Error('Supplier not found');
      }

      // Get current advance balance
      const currentAdvanceLBP = supplier.advance_lb_balance || 0;
      const currentAdvanceUSD = supplier.advance_usd_balance || 0;

      console.log(`💰 Supplier Advance - Supplier: ${supplier.name}, Type: ${type}, Currency: ${currency}, Amount: ${amount}`);
      console.log(`💰 Current Advance Balances - LBP: ${currentAdvanceLBP}, USD: ${currentAdvanceUSD}`);

      // Calculate new advance balance
      let newAdvanceBalance = 0;
      let updateData: any = {};

      if (currency === 'LBP') {
        // Give advance → increase advance balance
        // Deduct advance → decrease advance balance
        newAdvanceBalance = type === 'give' 
          ? currentAdvanceLBP + amount
          : currentAdvanceLBP - amount;

        // Ensure advance balance doesn't go negative
        if (newAdvanceBalance < 0) {
          throw new Error('Cannot deduct more than the current advance balance');
        }

        updateData.advance_lb_balance = newAdvanceBalance;
        console.log(`💰 ${type === 'give' ? 'Giving' : 'Deducting'} advance: LBP advance ${currentAdvanceLBP} → ${newAdvanceBalance}`);
      } else {
        // USD advance
        newAdvanceBalance = type === 'give'
          ? currentAdvanceUSD + amount
          : currentAdvanceUSD - amount;

        // Ensure advance balance doesn't go negative
        if (newAdvanceBalance < 0) {
          throw new Error('Cannot deduct more than the current advance balance');
        }

        updateData.advance_usd_balance = newAdvanceBalance;
        console.log(`💰 ${type === 'give' ? 'Giving' : 'Deducting'} advance: USD advance ${currentAdvanceUSD} → ${newAdvanceBalance}`);
      }

      // Store previous balances for undo
      const previousAdvanceLBP = currentAdvanceLBP;
      const previousAdvanceUSD = currentAdvanceUSD;

      // Update supplier advance balance
      await updateSupplier(supplierId, updateData);

      // Create transaction record using unified service
      const reviewDateNote = reviewDate ? ` [Review: ${new Date(reviewDate).toLocaleDateString()}]` : '';
      
      await transactionService.createTransaction({
        category: type === 'give' 
          ? TRANSACTION_CATEGORIES.SUPPLIER_ADVANCE_GIVEN
          : TRANSACTION_CATEGORIES.SUPPLIER_ADVANCE_DEDUCTED,
        amount: amount,
        currency: currency,
        description: `${description || `Supplier advance ${type === 'give' ? 'payment' : 'deduction'} - ${supplier.name}`}${reviewDateNote}`,
        reference: generateAdvanceReference(),
        supplierId: supplierId,
        context: {
          userId: userProfile?.id || '',
          storeId: userProfile?.store_id || '',
          module: 'supplier_management',
        branchId: currentBranchId || '',

          source: 'offline'
        },
        updateBalances: false, // Balance already updated above (lines 3365)
        updateCashDrawer: false, // No cash drawer update for advances
        createAuditLog: true,
        _synced: false,
        metadata: {
          advanceType: type,
          reviewDate: reviewDate,
          previousAdvanceLBP,
          previousAdvanceUSD,
          newAdvanceBalance
        }
      });

      // Create reminder if review date is provided
      if (reviewDate && type === 'give') {
        try {
          await reminderMonitoringService.createReminder({
            store_id: userProfile?.store_id || '',
        branch_id: currentBranchId || '',

            type: 'supplier_advance_review',
            entity_type: 'supplier',
            entity_id: supplierId,
            entity_name: supplier.name,
            due_date: reviewDate,
            remind_before_days: [7, 3, 1, 0], // Remind 7, 3, 1 days before and on due date
            status: 'pending',
            title: `Review Advance for ${supplier.name}`,
            description: `Review the ${currency === 'USD' ? `$${amount.toFixed(2)}` : `${Math.round(amount).toLocaleString()} ل.ل`} advance given to ${supplier.name}. Check if work is completed or if additional settlement is needed.`,
            priority: 'medium',
            action_url: '/accounting?tab=supplier-advances',
            metadata: {
              transaction_id: transactionId,
              supplier_id: supplierId,
              supplier_name: supplier.name,
              amount: amount,
              currency: currency,
              advance_date: date,
              advance_type: 'give'
            },
            created_by: userProfile?.id || ''
          });
          console.log(`📅 Reminder created for advance review on ${new Date(reviewDate).toLocaleDateString()}`);
        } catch (reminderError) {
          console.error('❌ Error creating reminder:', reminderError);
          // Don't fail the transaction if reminder creation fails
        }
      }

      // If giving advance, withdraw from cash drawer
      let cashDrawerResult: any = null;
      let previousCashDrawerBalance: number | undefined = undefined;
      let cashDrawerAccountId: string | undefined = undefined;
      
      if (type === 'give') {
        const amountInLBP = currency === 'USD' ? amount * exchangeRate : amount;
        
        // Check cash drawer balance
        const currentBalance = await getCurrentCashDrawerBalance(userProfile?.store_id || '');
        previousCashDrawerBalance = currentBalance;
        
        if (amountInLBP > currentBalance) {
          throw new Error(`Insufficient cash drawer balance. Advance: ${currency === 'USD' ? `$${amount.toFixed(2)}` : `${Math.round(amount).toLocaleString()} ل.ل`} (${Math.round(amountInLBP).toLocaleString()} LBP), Available: ${Math.round(currentBalance).toLocaleString()} LBP`);
        }

        // Process cash drawer withdrawal
        cashDrawerResult = await processCashDrawerTransaction({
          type: 'expense',
          amount: amountInLBP,
          currency: 'LBP',
          description: `Advance payment to ${supplier.name}${currency === 'USD' ? ` ($${amount.toFixed(2)} USD)` : ''}`,
          reference: generateAdvanceReference(),
          supplierId: supplierId,
          storeId: userProfile?.store_id || '',
          createdBy: userProfile?.id || '',
        } as any);
        
        cashDrawerAccountId = cashDrawerResult.accountId;
      }

      // Create undo data
      const baseUndoData = {
        affected: [
          { table: 'suppliers', id: supplierId },
          { table: 'transactions', id: transactionId }
        ],
        steps: [
          {
            op: 'delete',
            table: 'transactions',
            id: transactionId
          },
          {
            op: 'update',
            table: 'suppliers',
            id: supplierId,
            changes: currency === 'LBP'
              ? { advance_lb_balance: previousAdvanceLBP, _synced: false }
              : { advance_usd_balance: previousAdvanceUSD, _synced: false }
          }
        ]
      };

      // If it was a "give" advance, include cash drawer undo
      let undoData;
      if (type === 'give' && cashDrawerResult) {
        undoData = createCashDrawerUndoData(
          cashDrawerResult.transactionId,
          previousCashDrawerBalance,
          cashDrawerAccountId,
          baseUndoData
        );
      } else {
        undoData = baseUndoData;
      }

      pushUndo(undoData);

      // Refresh data to show updated balances
      await refreshData();

      console.log(`✅ Supplier advance processed successfully - ${type === 'give' ? 'Given' : 'Deducted'} ${amount} ${currency}`);
    } catch (error) {
      console.error('❌ Error processing supplier advance:', error);
      throw error;
    }
  };

  // Delete supplier advance transaction and reverse the balance changes
  const deleteSupplierAdvance = async (transactionId: string): Promise<void> => {
    try {
      // Find the transaction
      const transaction = await db.transactions.get(transactionId);
      if (!transaction) {
        throw new Error('Transaction not found');
      }

      // Only allow deletion of Supplier Advance transactions
      if (transaction.category !== 'Supplier Advance') {
        throw new Error('Can only delete Supplier Advance transactions from this module');
      }

      if (!transaction.supplier_id) {
        throw new Error('Transaction missing supplier ID');
      }

      // Find supplier
      const supplier = suppliers.find(s => s.id === transaction.supplier_id);
      if (!supplier) {
        throw new Error('Supplier not found');
      }

      console.log(`🗑️ Deleting supplier advance transaction: ${transactionId}`);

      // Determine the original transaction type by checking the description
      // expense = "give" advance, income = "deduct" advance
      const wasGiveAdvance = transaction.type === 'expense';

      // Store previous balances for undo
      const previousAdvanceLBP = supplier.advance_lb_balance || 0;
      const previousAdvanceUSD = supplier.advance_usd_balance || 0;
      
      // Reverse the advance balance changes
      const currentAdvanceLBP = supplier.advance_lb_balance || 0;
      const currentAdvanceUSD = supplier.advance_usd_balance || 0;
      let updateData: any = {};

      if (transaction.currency === 'LBP') {
        // Reverse: if it was "give", subtract from balance; if it was "deduct", add back
        const newBalance = wasGiveAdvance 
          ? currentAdvanceLBP - transaction.amount
          : currentAdvanceLBP + transaction.amount;
        
        if (newBalance < 0) {
          throw new Error('Cannot delete: would result in negative advance balance');
        }
        
        updateData.advance_lb_balance = newBalance;
        console.log(`💰 Reversing LBP advance: ${currentAdvanceLBP} → ${newBalance}`);
      } else {
        // USD
        const newBalance = wasGiveAdvance
          ? currentAdvanceUSD - transaction.amount
          : currentAdvanceUSD + transaction.amount;
        
        if (newBalance < 0) {
          throw new Error('Cannot delete: would result in negative advance balance');
        }
        
        updateData.advance_usd_balance = newBalance;
        console.log(`💰 Reversing USD advance: ${currentAdvanceUSD} → ${newBalance}`);
      }

      // Update supplier balance
      await updateSupplier(transaction.supplier_id, updateData);

      // If it was a "give" advance, reverse the cash drawer withdrawal
      let cashDrawerResult: any = null;
      let previousCashDrawerBalance: number | undefined = undefined;
      let cashDrawerAccountId: string | undefined = undefined;
      
      if (wasGiveAdvance) {
        const amountInLBP = transaction.currency === 'USD' 
          ? transaction.amount * exchangeRate 
          : transaction.amount;

        // Get cash drawer balance before reversal
        previousCashDrawerBalance = await getCurrentCashDrawerBalance(userProfile?.store_id || '');

        // Reverse cash drawer transaction (add back the money)
        cashDrawerResult = await processCashDrawerTransaction({
          type: 'payment',
          amount: amountInLBP,
          currency: 'LBP',
          description: `Reversal: Deleted advance payment to ${supplier.name}`,
          reference: generateReversalReference(),
          supplierId: transaction.supplier_id,
          storeId: userProfile?.store_id || '',
          createdBy: userProfile?.id || '',
        } as any);
        
        cashDrawerAccountId = cashDrawerResult.accountId;
      }

      // Create undo data - restore transaction and supplier balances
      const baseUndoData = {
        affected: [
          { table: 'suppliers', id: transaction.supplier_id },
          { table: 'transactions', id: transactionId }
        ],
        steps: [
          {
            op: 'update',
            table: 'transactions',
            id: transactionId,
            changes: { _deleted: false, _synced: false }
          },
          {
            op: 'update',
            table: 'suppliers',
            id: transaction.supplier_id,
            changes: transaction.currency === 'LBP'
              ? { advance_lb_balance: previousAdvanceLBP, _synced: false }
              : { advance_usd_balance: previousAdvanceUSD, _synced: false }
          }
        ]
      };

      // If it was a "give" advance, include cash drawer undo
      let undoData;
      if (wasGiveAdvance && cashDrawerResult) {
        // For undo of delete, we need to reverse the reversal transaction and restore previous balance
        // The reversal transaction needs to be deleted, and balance restored
        undoData = {
          type: 'supplier_advance_delete',
          affected: [
            ...baseUndoData.affected,
            ...(cashDrawerResult.transactionId ? [{ table: 'transactions', id: cashDrawerResult.transactionId }] : []),
            ...(cashDrawerAccountId ? [{ table: 'cash_drawer_accounts', id: cashDrawerAccountId }] : [])
          ],
          steps: [
            ...baseUndoData.steps,
            // Delete the reversal transaction
            ...(cashDrawerResult.transactionId ? [{
              op: 'delete',
              table: 'transactions',
              id: cashDrawerResult.transactionId
            }] : []),
            // Restore cash drawer balance
            ...(previousCashDrawerBalance !== undefined && cashDrawerAccountId ? [{
              op: 'update',
              table: 'cash_drawer_accounts',
              id: cashDrawerAccountId,
              changes: {
                current_balance: previousCashDrawerBalance,
                _synced: false
              }
            }] : [])
          ]
        };
      } else {
        undoData = baseUndoData;
      }

      pushUndo(undoData);

      // Delete transaction from IndexedDB (soft delete)
      await db.transactions.update(transactionId, {
        _deleted: true,
        _synced: false
      });

      // Refresh data to show updated balances
      await refreshData();

      console.log(`✅ Supplier advance transaction deleted successfully`);
    } catch (error) {
      console.error('❌ Error deleting supplier advance:', error);
      throw error;
    }
  };

  // Update supplier advance transaction
  const updateSupplierAdvance = async (
    transactionId: string,
    updates: {
      supplierId: string;
      amount: number;
      currency: 'USD' | 'LBP';
      type: 'give' | 'deduct';
      description: string;
      date: string;
      reviewDate?: string;
    }
  ): Promise<void> => {
    try {
      // Find the old transaction
      const oldTransaction = await db.transactions.get(transactionId);
      if (!oldTransaction) {
        throw new Error('Transaction not found');
      }

      // Only allow updating Supplier Advance transactions
      if (oldTransaction.category !== 'Supplier Advance') {
        throw new Error('Can only update Supplier Advance transactions');
      }

      if (!oldTransaction.supplier_id) {
        throw new Error('Transaction missing supplier ID');
      }

      // Validate new amount
      if (isNaN(updates.amount) || updates.amount <= 0) {
        throw new Error('Please enter a valid positive amount');
      }

      // Find old and new suppliers
      const oldSupplier = suppliers.find(s => s.id === oldTransaction.supplier_id);
      if (!oldSupplier) {
        throw new Error('Old supplier not found');
      }

      const newSupplier = suppliers.find(s => s.id === updates.supplierId);
      if (!newSupplier) {
        throw new Error('New supplier not found');
      }

      console.log(`✏️ Updating supplier advance transaction: ${transactionId}`);
      console.log(`Old: ${oldTransaction.type} ${oldTransaction.amount} ${oldTransaction.currency} for supplier ${oldSupplier.name}`);
      console.log(`New: ${updates.type} ${updates.amount} ${updates.currency} for supplier ${newSupplier.name}`);

      // Determine old transaction type
      const oldWasGiveAdvance = oldTransaction.type === 'expense';
      const newIsGiveAdvance = updates.type === 'give';

      // Store previous balances for undo
      const oldPreviousAdvanceLBP = oldSupplier.advance_lb_balance || 0;
      const oldPreviousAdvanceUSD = oldSupplier.advance_usd_balance || 0;
      const newPreviousAdvanceLBP = updates.supplierId !== oldTransaction.supplier_id 
        ? (newSupplier.advance_lb_balance || 0)
        : oldPreviousAdvanceLBP;
      const newPreviousAdvanceUSD = updates.supplierId !== oldTransaction.supplier_id 
        ? (newSupplier.advance_usd_balance || 0)
        : oldPreviousAdvanceUSD;

      // STEP 1: Reverse old transaction effects
      const oldCurrentAdvanceLBP = oldSupplier.advance_lb_balance || 0;
      const oldCurrentAdvanceUSD = oldSupplier.advance_usd_balance || 0;
      let oldReverseData: any = {};

      if (oldTransaction.currency === 'LBP') {
        const reversedBalance = oldWasGiveAdvance
          ? oldCurrentAdvanceLBP - oldTransaction.amount
          : oldCurrentAdvanceLBP + oldTransaction.amount;
        
        if (reversedBalance < 0) {
          throw new Error('Cannot update: reversing old transaction would result in negative balance');
        }
        
        oldReverseData.advance_lb_balance = reversedBalance;
      } else {
        const reversedBalance = oldWasGiveAdvance
          ? oldCurrentAdvanceUSD - oldTransaction.amount
          : oldCurrentAdvanceUSD + oldTransaction.amount;
        
        if (reversedBalance < 0) {
          throw new Error('Cannot update: reversing old transaction would result in negative balance');
        }
        
        oldReverseData.advance_usd_balance = reversedBalance;
      }

      // Reverse old cash drawer transaction if it was a "give" advance
      let oldCashDrawerResult: any = null;
      let oldPreviousCashDrawerBalance: number | undefined = undefined;
      let oldCashDrawerAccountId: string | undefined = undefined;
      
      if (oldWasGiveAdvance) {
        const oldAmountInLBP = oldTransaction.currency === 'USD'
          ? oldTransaction.amount * exchangeRate
          : oldTransaction.amount;

        // Get cash drawer balance before reversal
        oldPreviousCashDrawerBalance = await getCurrentCashDrawerBalance(userProfile?.store_id || '');

        // Reverse cash drawer transaction (add back the money)
        oldCashDrawerResult = await processCashDrawerTransaction({
          type: 'payment',
          amount: oldAmountInLBP,
          currency: 'LBP',
          description: `Reversal: Updated advance payment to ${oldSupplier.name}`,
          reference: generateReversalReference(),
          supplierId: oldTransaction.supplier_id,
          storeId: userProfile?.store_id || '',
          createdBy: userProfile?.id || '',
        } as any);
        
        oldCashDrawerAccountId = oldCashDrawerResult.accountId;
      }

      // STEP 2: Apply new transaction effects
      // Get supplier balance after reversal (if supplier changed, use new supplier's current balance)
      const supplierToUpdate = updates.supplierId === oldTransaction.supplier_id 
        ? { ...oldSupplier, ...oldReverseData }
        : newSupplier;
      
      const newCurrentAdvanceLBP = supplierToUpdate.advance_lb_balance || 0;
      const newCurrentAdvanceUSD = supplierToUpdate.advance_usd_balance || 0;
      let newUpdateData: any = {};

      if (updates.currency === 'LBP') {
        const newBalance = newIsGiveAdvance
          ? newCurrentAdvanceLBP + updates.amount
          : newCurrentAdvanceLBP - updates.amount;

        if (newBalance < 0) {
          throw new Error('Cannot update: would result in negative advance balance');
        }

        newUpdateData.advance_lb_balance = newBalance;
      } else {
        const newBalance = newIsGiveAdvance
          ? newCurrentAdvanceUSD + updates.amount
          : newCurrentAdvanceUSD - updates.amount;

        if (newBalance < 0) {
          throw new Error('Cannot update: would result in negative advance balance');
        }

        newUpdateData.advance_usd_balance = newBalance;
      }

      // Update old supplier (if changed, reverse the old transaction)
      if (updates.supplierId !== oldTransaction.supplier_id) {
        await updateSupplier(oldTransaction.supplier_id, oldReverseData);
      }

      // Update new supplier
      await updateSupplier(updates.supplierId, newUpdateData);

      // If giving advance, withdraw from cash drawer
      let newCashDrawerResult: any = null;
      let newPreviousCashDrawerBalance: number | undefined = undefined;
      let newCashDrawerAccountId: string | undefined = undefined;
      
      if (newIsGiveAdvance) {
        const newAmountInLBP = updates.currency === 'USD' ? updates.amount * exchangeRate : updates.amount;
        
        // Check cash drawer balance
        const currentBalance = await getCurrentCashDrawerBalance(userProfile?.store_id || '');
        newPreviousCashDrawerBalance = currentBalance;
        
        if (newAmountInLBP > currentBalance) {
          throw new Error(`Insufficient cash drawer balance. Advance: ${updates.currency === 'USD' ? `$${updates.amount.toFixed(2)}` : `${Math.round(updates.amount).toLocaleString()} ل.ل`} (${Math.round(newAmountInLBP).toLocaleString()} LBP), Available: ${Math.round(currentBalance).toLocaleString()} LBP`);
        }

        // Process cash drawer withdrawal
        newCashDrawerResult = await processCashDrawerTransaction({
          type: 'expense',
          amount: newAmountInLBP,
          currency: 'LBP',
          description: `Advance payment to ${newSupplier.name}${updates.currency === 'USD' ? ` ($${updates.amount.toFixed(2)} USD)` : ''}`,
          reference: generateAdvanceReference(),
          supplierId: updates.supplierId,
          storeId: userProfile?.store_id || '',
          createdBy: userProfile?.id || '',
        } as any);
        
        newCashDrawerAccountId = newCashDrawerResult.accountId;
      }

      // STEP 3: Update transaction record
      const reviewDateNote = updates.reviewDate ? ` [Review: ${new Date(updates.reviewDate).toLocaleDateString()}]` : '';
      const transactionUpdate: any = {
        type: newIsGiveAdvance ? 'expense' : 'income',
        category: 'Supplier Advance',
        amount: updates.amount,
        currency: updates.currency,
        description: `${updates.description || `Supplier advance ${updates.type === 'give' ? 'payment' : 'deduction'} - ${newSupplier.name}`}${reviewDateNote}`,
        supplier_id: updates.supplierId,
        created_at: updates.date,
        _synced: false,
      };

      // Store old transaction data for undo
      const oldTransactionData = {
        type: oldTransaction.type,
        category: oldTransaction.category,
        amount: oldTransaction.amount,
        currency: oldTransaction.currency,
        description: oldTransaction.description,
        supplier_id: oldTransaction.supplier_id,
        created_at: oldTransaction.created_at,
        _synced: oldTransaction._synced
      };

      // Update transaction in IndexedDB
      await db.transactions.update(transactionId, transactionUpdate);

      // Create undo data - restore old transaction and supplier balances
      const affectedTables: any[] = [
        { table: 'transactions', id: transactionId },
        { table: 'suppliers', id: oldTransaction.supplier_id }
      ];
      
      const undoSteps: any[] = [
        {
          op: 'update',
          table: 'transactions',
          id: transactionId,
          changes: oldTransactionData
        },
        {
          op: 'update',
          table: 'suppliers',
          id: oldTransaction.supplier_id,
          changes: oldTransaction.currency === 'LBP'
            ? { advance_lb_balance: oldPreviousAdvanceLBP, _synced: false }
            : { advance_usd_balance: oldPreviousAdvanceUSD, _synced: false }
        }
      ];

      // If supplier changed, add new supplier to undo
      if (updates.supplierId !== oldTransaction.supplier_id) {
        affectedTables.push({ table: 'suppliers', id: updates.supplierId });
        undoSteps.push({
          op: 'update',
          table: 'suppliers',
          id: updates.supplierId,
          changes: updates.currency === 'LBP'
            ? { advance_lb_balance: newPreviousAdvanceLBP, _synced: false }
            : { advance_usd_balance: newPreviousAdvanceUSD, _synced: false }
        });
      }

      // Handle cash drawer undo
      const cashDrawerAccountId = oldCashDrawerAccountId || newCashDrawerAccountId;
      const previousCashDrawerBalance = oldWasGiveAdvance && oldCashDrawerResult
        ? oldPreviousCashDrawerBalance
        : (newIsGiveAdvance && newCashDrawerResult ? newPreviousCashDrawerBalance : undefined);

      let undoData;
      if ((oldWasGiveAdvance && oldCashDrawerResult) || (newIsGiveAdvance && newCashDrawerResult)) {
        // Collect all cash drawer transaction IDs
        const cashDrawerTransactionIds: string[] = [];
        if (oldCashDrawerResult?.transactionId) {
          cashDrawerTransactionIds.push(oldCashDrawerResult.transactionId);
        }
        if (newCashDrawerResult?.transactionId) {
          cashDrawerTransactionIds.push(newCashDrawerResult.transactionId);
        }

        // Delete cash drawer transactions and restore balance
        undoData = {
          type: 'supplier_advance_update',
          affected: [
            ...affectedTables,
            ...(cashDrawerTransactionIds.map(id => ({ table: 'transactions', id }))),
            ...(cashDrawerAccountId ? [{ table: 'cash_drawer_accounts', id: cashDrawerAccountId }] : [])
          ],
          steps: [
            ...undoSteps,
            // Delete cash drawer transactions
            ...(cashDrawerTransactionIds.map(id => ({
              op: 'delete',
              table: 'transactions',
              id
            }))),
            // Restore cash drawer balance
            ...(previousCashDrawerBalance !== undefined && cashDrawerAccountId ? [{
              op: 'update',
              table: 'cash_drawer_accounts',
              id: cashDrawerAccountId,
              changes: {
                current_balance: previousCashDrawerBalance,
                _synced: false
              }
            }] : [])
          ]
        };
      } else {
        undoData = {
          type: 'supplier_advance_update',
          affected: affectedTables,
          steps: undoSteps
        };
      }

      pushUndo(undoData);

      // Refresh data to show updated balances
      await refreshData();

      console.log(`✅ Supplier advance transaction updated successfully`);
    } catch (error) {
      console.error('❌ Error updating supplier advance:', error);
      throw error;
    }
  };

  // Undo functionality - simple single-level undo
  const pushUndo = (undoData: any) => {
    const undoWithTimestamp = {
      ...undoData,
      timestamp: Date.now()
    };
    localStorage.setItem('last_undo_action', JSON.stringify(undoWithTimestamp));
    setCanUndo(true);
  };

  // Debug function to test undo
  const testUndo = () => {
    pushUndo({
      type: 'test',
      affected: [],
      steps: []
    });
  };

  const undoLastAction = async (): Promise<boolean> => {
    try {
      const undoData = localStorage.getItem('last_undo_action');
      if (!undoData) {
        return false;
      }

      const action = JSON.parse(undoData);

      // Check if any affected records are synced
      // Exception: cash_drawer_accounts can be synced and still allow undo (only balance changes)
      for (const item of action.affected || []) {
        const record = await (db as any)[item.table].get(item.id);
        
        if (!record) {
          localStorage.removeItem('last_undo_action');
          setCanUndo(false);
          return false;
        }
        // Allow undo for cash_drawer_accounts even if synced (only balance changes)
        if (record._synced && item.table !== 'cash_drawer_accounts') {
          localStorage.removeItem('last_undo_action');
          setCanUndo(false);
          return false;
        }
      }

      // Execute undo steps
      await db.transaction('rw', [...db.tables, db.pending_syncs], async () => {
        for (const step of action.steps || []) {
          if (step.op === 'delete' && step.id) {
            await (db as any)[step.table].delete(step.id);
            // Remove from pending syncs if it exists
            await db.pending_syncs.where('table_name').equals(step.table)
              .filter(item => item.record_id === step.id).delete();
          } else if (step.op === 'restore' && step.record) {
            await (db as any)[step.table].add(step.record);
          } else if (step.op === 'update' && step.id && step.changes) {
            await (db as any)[step.table].update(step.id, step.changes);
            // Remove from pending syncs if it exists
            await db.pending_syncs.where('table_name').equals(step.table)
              .filter(item => item.record_id === step.id).delete();
          }
        }

        // Remove any pending syncs for affected records
        for (const item of action.affected || []) {
          await db.pending_syncs.where('table_name').equals(item.table)
            .filter(pending => pending.record_id === item.id).delete();
        }
      });

      localStorage.removeItem('last_undo_action');
      setCanUndo(false);
      await refreshData();
      await updateUnsyncedCount();

      // Trigger cash drawer update event if the undo affected cash drawer
      const hasCashDrawerChanges = action.affected?.some((item: any) =>
        item.table === 'cash_drawer_accounts' ||
        action.steps?.some((step: any) => step.table === 'cash_drawer_accounts')
      );

      if (hasCashDrawerChanges && typeof window !== 'undefined') {
        window.dispatchEvent(new CustomEvent('cash-drawer-updated', {
          detail: { storeId, event: 'undo_completed' }
        }));
        // Also dispatch a general undo-completed event for broader listening
        window.dispatchEvent(new CustomEvent('undo-completed', {
          detail: { storeId, event: 'undo_completed', affectedTables: action.affected?.map((a: any) => a.table) || [] }
        }));
      }

      return true;
    } catch (error) {
      console.error('Undo failed:', error);
      return false;
    }
  };


  const openCashDrawer = async (amount: number, openedBy: string) => {
    if (!storeId || !currentBranchId) return;

    try {
      // Use the cash drawer service to open session (handles account creation thread-safely)
      const { cashDrawerUpdateService } = await import('../services/cashDrawerUpdateService');
      const result = await cashDrawerUpdateService.openCashDrawerSession(storeId, currentBranchId, amount, openedBy);

      if (!result.success) {
        throw new Error(result.error || 'Failed to open cash drawer session');
      }

      // Get the account for local state
      const account = await db.getCashDrawerAccount(storeId, currentBranchId);
      if (!account) {
        throw new Error('Failed to retrieve cash drawer account after opening session');
      }

      const previousBalance = account.current_balance || 0;

      // Update local state with proper status
      setCashDrawer({
        id: result.sessionId!,
        accountId: account.id,
        status: 'open',
        currentBalance: amount,
        currency: (account as any).currency,
        lastUpdated: new Date().toISOString()
      });

      // Dispatch event to notify components
      if (typeof window !== 'undefined') {
        window.dispatchEvent(new CustomEvent('cash-drawer-updated', {
          detail: { storeId, event: 'opened' }
        }));
      }

      // Store undo data
      pushUndo({
        type: 'open_cash_drawer',
        affected: [
          { table: 'cash_drawer_sessions', id: result.sessionId! },
          { table: 'cash_drawer_accounts', id: account.id }
        ],
        steps: [
          { op: 'delete', table: 'cash_drawer_sessions', id: result.sessionId! },
          { op: 'update', table: 'cash_drawer_accounts', id: account.id, changes: { current_balance: previousBalance, _synced: false } }
        ]
      });

      // Update unsynced count and trigger sync for cash drawer data
      await updateUnsyncedCount();

      // Reset auto-sync timer to ensure full undo window
      resetAutoSyncTimer();

      debouncedSync();
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to open cash drawer session';
      console.error('Error opening cash drawer:', message);
      throw new Error(message);
    }
  };

  const closeCashDrawer = async (actualAmount: number, closedBy: string, notes?: string) => {
    if (!cashDrawer?.id) return;

    try {
      // Get current session state before closing
      const session = await db.cash_drawer_sessions.get(cashDrawer.id);
      if (!session) return;

      if (!storeId) return;
      const account = await db.getCashDrawerAccount(storeId, currentBranchId!);
      if (!account) return;

      const previousBalance = account.current_balance || 0;

      await db.closeCashDrawerSession(cashDrawer.id, actualAmount, closedBy, notes);

      // Update local state to null since there's no active session
      setCashDrawer(null);

      // Store undo data
      pushUndo({
        type: 'close_cash_drawer',
        affected: [
          { table: 'cash_drawer_sessions', id: cashDrawer.id },
          { table: 'cash_drawer_accounts', id: account.id }
        ],
        steps: [
          {
            op: 'update', table: 'cash_drawer_sessions', id: cashDrawer.id, changes: {
              status: 'open',
              closed_at: null,
              closed_by: null,
              expected_amount: null,
              actual_amount: null,
              variance: null,
              _synced: false
            }
          },
          { op: 'update', table: 'cash_drawer_accounts', id: account.id, changes: { current_balance: previousBalance, _synced: false } }
        ]
      });

      // Update unsynced count and trigger sync for cash drawer data
      await updateUnsyncedCount();

      // Reset auto-sync timer to ensure full undo window
      resetAutoSyncTimer();

      debouncedSync();

      // Notify all components about the cash drawer being closed
      if (typeof window !== 'undefined') {
        window.dispatchEvent(new CustomEvent('cash-drawer-updated', { 
          detail: { 
            storeId, 
            event: 'closed',
            sessionId: cashDrawer.id 
          } 
        }));
      }
    } catch (error) {
      console.error('Error closing cash drawer:', error);
    }
  };

  const getCashDrawerBalanceReport = async (startDate?: string, endDate?: string) => {
    if (!storeId || !currentBranchId) return [];
    return await db.getCashDrawerBalanceReport(storeId, currentBranchId, startDate, endDate);
  };

  const getCurrentCashDrawerStatus = async () => {
    if (!storeId || !currentBranchId) return null;
    return await db.getCurrentCashDrawerStatus(storeId, currentBranchId);
  };

  const getCashDrawerSessionDetails = async (sessionId: string) => {
    if (!storeId) return null;
    return await db.getCashDrawerSessionDetails(sessionId);
  };

  const getRecommendedOpeningAmount = async () => {
    if (!storeId) return { amount: 0, source: 'default' as const };
    
    try {
      // Get the last closed session
      const closedSessions = await db.cash_drawer_sessions
        .where('store_id')
        .equals(storeId)
        .filter(sess => sess.status === 'closed')
        .toArray();
      
      if (closedSessions.length > 0) {
        // Sort by closed_at date (most recent first)
        closedSessions.sort((a, b) => new Date(b.closed_at!).getTime() - new Date(a.closed_at!).getTime());
        const lastSession = closedSessions[0];
        
        // Get the actual amount from last session (stored in LBP)
        let recommendedAmount = lastSession.actual_amount || 0;
        
        // Convert to preferred currency if USD is selected
        if (currency === 'USD' && exchangeRate > 0) {
          recommendedAmount = recommendedAmount / exchangeRate;
        }
        
        return {
          amount: recommendedAmount,
          source: 'previous_session' as const,
          previousSessionId: lastSession.id,
          previousEmployee: lastSession.closed_by
        };
      }
      
      return { amount: 0, source: 'default' as const };
    } catch (error) {
      console.error('Error getting recommended opening amount:', error);
      return { amount: 0, source: 'default' as const };
    }
  };

  const getStockLevels = () => stockLevels;

  const toggleLowStockAlerts = async (enabled: boolean) => {
    if (!storeId) {
      console.warn('No store ID available for low stock alert toggle');
      return;
    }

    try {
      // Update local state immediately
      setLowStockAlertsEnabled(enabled);

      // Update IndexedDB
      await db.stores
        .where('id')
        .equals(storeId)
        .modify({
          low_stock_alert: enabled,
          _synced: false,
          updated_at: new Date().toISOString()
        });

      console.log('✅ Low stock alert updated locally:', enabled);

      // Update unsynced count immediately
      await updateUnsyncedCount();

      // Trigger immediate sync for settings changes
      if (isOnline && !isSyncing) {
        console.log('🔄 Triggering immediate sync for low stock alert change');
        performSync(true);
      } else {
        debouncedSync();
      }
    } catch (error) {
      console.error('❌ Error updating low stock alert:', error);
      // Revert local state on error
      setLowStockAlertsEnabled(!enabled);
    }
  };

  const updateLowStockThreshold = (threshold: number) => {
    // Low stock threshold is UI state only, not business data
    // Keep in localStorage as it's not synced to server
    setLowStockThreshold(threshold);
    localStorage.setItem('lowStockThreshold', threshold.toString());
  };

  const updateDefaultCommissionRate = async (rate: number) => {
    if (!storeId) {
      console.warn('No store ID available for commission rate update');
      return;
    }

    try {
      // Update local state immediately
      setDefaultCommissionRate(rate);

      // Update IndexedDB
      await db.stores
        .where('id')
        .equals(storeId)
        .modify({
          preferred_commission_rate: rate,
          _synced: false,
          updated_at: new Date().toISOString()
        });

      console.log('✅ Commission rate updated locally:', rate);

      // Update unsynced count immediately
      // await updateUnsyncedCount();

      // Trigger immediate sync for settings changes
      if (isOnline && !isSyncing) {
        console.log('🔄 Triggering immediate sync for commission rate change');
        performSync(true);
      } else {
        debouncedSync();
      }
    } catch (error) {
      console.error('❌ Error updating commission rate:', error);
      // Revert local state on error
      setDefaultCommissionRate(defaultCommissionRate);
    }
  };

  const updateCurrency = async (newCurrency: 'USD' | 'LBP') => {
    if (!storeId) {
      console.warn('No store ID available for currency update');
      return;
    }

    try {
      // Update local state immediately
      setCurrency(newCurrency);

      // Update IndexedDB
      await db.stores
        .where('id')
        .equals(storeId)
        .modify({
          preferred_currency: newCurrency,
          _synced: false,
          updated_at: new Date().toISOString()
        });

      console.log('✅ Currency updated locally:', newCurrency);

      // Update unsynced count immediately
      await updateUnsyncedCount();

      // Trigger immediate sync for settings changes
      if (isOnline && !isSyncing) {
        console.log('🔄 Triggering immediate sync for currency change');
        performSync(true);
      } else {
        debouncedSync();
      }
    } catch (error) {
      console.error('❌ Error updating currency:', error);
      // Revert local state on error
      setCurrency(currency);
    }
  };

  const updateExchangeRate = async (rate: number) => {
    if (!storeId) {
      console.warn('No store ID available for exchange rate update');
      return;
    }

    try {
      // Update local state immediately
      setExchangeRate(rate);

      // Update IndexedDB
      await db.stores
        .where('id')
        .equals(storeId)
        .modify({
          exchange_rate: rate,
          _synced: false,
          updated_at: new Date().toISOString()
        });

      console.log('✅ Exchange rate updated locally:', rate);

      // Update unsynced count immediately
      await updateUnsyncedCount();

      // Trigger immediate sync for settings changes
      if (isOnline && !isSyncing) {
        console.log('🔄 Triggering immediate sync for exchange rate change');
        performSync(true);
      } else {
        debouncedSync();
      }
    } catch (error) {
      console.error('❌ Error updating exchange rate:', error);
      // Revert local state on error
      setExchangeRate(exchangeRate);
    }
  };

  const updateLanguage = async (newLanguage: 'en' | 'ar' | 'fr') => {
    if (!storeId) {
      console.warn('No store ID available for language update');
      return;
    }

    try {
      // Update local state immediately
      setLanguage(newLanguage);

      // Update IndexedDB
      await db.stores
        .where('id')
        .equals(storeId)
        .modify({
          preferred_language: newLanguage,
          _synced: false,
          updated_at: new Date().toISOString()
        });

      console.log('✅ Language updated locally:', newLanguage);

      // Update unsynced count immediately
      await updateUnsyncedCount();

      // Trigger immediate sync for settings changes
      if (isOnline && !isSyncing) {
        console.log('🔄 Triggering immediate sync for language change');
        performSync(true);
      } else {
        debouncedSync();
      }
    } catch (error) {
      console.error('❌ Error updating language:', error);
      // Revert local state on error
      setLanguage(language);
    }
  };

  const updateReceiptSettings = async (newSettings: any) => {
    try {
      // Update local state immediately
      setReceiptSettings(newSettings);

      // Save to localStorage
      localStorage.setItem('receiptSettings', JSON.stringify(newSettings));

      console.log('✅ Receipt settings updated locally:', newSettings);
    } catch (error) {
      console.error('❌ Error updating receipt settings:', error);
      // Revert local state on error
      setReceiptSettings(receiptSettings);
    }
  };

  const deductInventoryQuantity = async (productId: string, quantity: number): Promise<void> => {
    console.log('deductInventoryQuantity', productId, quantity);
    if (!storeId) return;

    try {
      const inventoryRecords = await db.inventory_items
        .where('product_id')
        .equals(productId)
        .and(inv => inv.quantity > 0)
        .sortBy('received_at');

      let qtyToDeduct = quantity;
      for (const inv of inventoryRecords) {
        if (qtyToDeduct <= 0) break;

        const deduct = Math.min(inv.quantity, qtyToDeduct);
        const newQuantity = inv.quantity - deduct;

        if (newQuantity <= 0) {
          // Keep inventory item with quantity = 0 for received bills review instead of deleting
          await db.inventory_items.update(inv.id, {
            quantity: 0,
            _synced: false
          });
        } else {
          // Update with new quantity
          await db.inventory_items.update(inv.id, {
            quantity: newQuantity,
            _synced: false
          });
        }
        qtyToDeduct -= deduct;
      }

      // Refresh data to update stock levels
      await refreshData();
      await updateUnsyncedCount();

      // Use debounced sync to batch rapid changes
      debouncedSync();

    } catch (error) {
      console.error('Error deducting inventory for sale:', error);
      throw error;
    }
  };

  const restoreInventoryQuantity = async (productId: string, quantity: number): Promise<void> => {
    console.log('restoreInventoryQuantity', productId, quantity);
    if (!storeId) return;

    try {
      // Find existing inventory items for this product
      const existingInventory = await db.inventory_items
        .where('product_id')
        .equals(productId)
        .sortBy('received_at');

      if (existingInventory.length > 0) {
        // Add to the most recent inventory item (LIFO for restoration)
        const mostRecent = existingInventory[existingInventory.length - 1];
        const newQuantity = mostRecent.quantity + quantity;

        await db.inventory_items.update(mostRecent.id, {
          quantity: newQuantity,
          _synced: false
        });
      } else {
        // Create new inventory item if none exists
        const newInventoryItem: InventoryItem = {
          id: createId(),
          store_id: storeId,
          product_id: productId,
          quantity: quantity,
          _synced: false,
          unit: 'box',
          branch_id: currentBranchId || '',
          weight: null,
          price: null,
          selling_price: null,
          received_quantity: quantity,
          created_at: new Date().toISOString(),
          batch_id: null
        };

        await db.inventory_items.add(newInventoryItem);
      }

      // Refresh data to update stock levels
      await refreshData();
      await updateUnsyncedCount();

      // Use debounced sync to batch rapid changes
      debouncedSync();

    } catch (error) {
      console.error('Error restoring inventory for sale:', error);
      throw error;
    }
  };

  // Don't render context if userProfile is not available
  // Instead of blocking here, let the App component handle authentication
  if (!userProfile) {
    // Only log once to avoid console spam during initial auth load
    if (!hasLoggedNoProfile.current) {
      debug('⏳ Waiting for userProfile to load...');
      hasLoggedNoProfile.current = true;
    }
    return (
      <OfflineDataContext.Provider value={{
        // Minimal context with empty data
        receiptSettings: {},
        updateReceiptSettings: async () => { },
        storeId: null,
        currentBranchId: null,
        products: [],
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
        // NEW: Empty accounting foundation data
        journalEntries: [],
        entities: [],
        chartOfAccounts: [],
        balanceSnapshots: [],
        stockLevels: [],
        setStockLevels: () => { },
        lowStockAlertsEnabled: false,
        lowStockThreshold: 10,
        defaultCommissionRate: 10,
        currency: 'LBP',
        exchangeRate: 89500,
        language: 'ar',
        cashDrawer: null,
        openCashDrawer: async () => { },
        closeCashDrawer: async () => { },
        getCashDrawerBalanceReport: async () => [],
        getCurrentCashDrawerStatus: async () => null,
        getCashDrawerSessionDetails: async () => null,
        getRecommendedOpeningAmount: async () => ({ amount: 0, source: 'default' as const }),
        refreshCashDrawerStatus: async () => { },
        isOnline: false,
        loading: {
          sync: false,
          products: false,
          suppliers: false,
          customers: false,
          employees: false,
          sales: false,
          inventory: false,
          transactions: false,
          expenseCategories: false,
          bills: false
        },
        // Empty CRUD operations
        addProduct: async () => { },
        addSupplier: async () => { },
        addCustomer: async () => { },
        updateCustomer: async () => { },
        updateSupplier: async () => { },
        updateProduct: async () => { },
        deleteProduct: async () => { },
        addEmployee: async () => { },
        updateEmployee: async () => { },
        deleteEmployee: async () => { },
        addInventoryItem: async () => { },
        updateInventoryItem: async () => { },
        checkInventoryItemReferences: async () => ({ salesCount: 0, variancesCount: 0, hasReferences: false }),
        deleteInventoryItem: async () => { },
        addInventoryBatch: async () => ({ batchId: '', financialResult: null }),
        addSale: async () => { },
        updateSale: async () => { },
        deleteSale: async () => { },
        updateBillsForSaleItem: async () => { },
        addTransaction: async () => { },
        addExpenseCategory: async () => { },
        updateInventoryBatch: async () => { },
        applyCommissionRateToBatch: async () => { },
        createBill: async () => '',
        updateBill: async () => { },
        deleteBill: async () => { },
        getBills: async () => [],
        getBillDetails: async () => null,
        createBillAuditLog: async () => { },
        getStore: async () => null,
        deductInventoryQuantity: async () => { },
        restoreInventoryQuantity: async () => { },
        refreshData: async () => { },
        getStockLevels: () => [],
        toggleLowStockAlerts: async () => { },
        updateLowStockThreshold: () => { },
        updateDefaultCommissionRate: async () => { },
        updateCurrency: async () => { },
        updateExchangeRate: async () => { },
        updateLanguage: async () => { },
        sync: async () => ({ success: false, errors: ['No store ID'], synced: { uploaded: 0, downloaded: 0 }, conflicts: 0 }),
        fullResync: async () => ({ success: false, errors: ['No store ID'], synced: { uploaded: 0, downloaded: 0 }, conflicts: 0 }),
        debouncedSync: () => { },
        getSyncStatus: () => ({ isOnline: false, lastSync: null, unsyncedCount: 0, isSyncing: false, isAutoSyncing: false }),
        validateAndCleanData: async () => ({ cleaned: 0, report: {} }),
        canUndo: false,
        undoLastAction: async () => false,
        pushUndo: () => { },
        testUndo: () => { },
        processCashDrawerTransaction: async () => ({ success: false }),
        createCashDrawerUndoData: () => ({}),
        createId: () => crypto.randomUUID(),
        getCurrentCashDrawerBalance: async () => 0,
        refreshCashDrawerBalance: async () => 0,
        processPayment: async (params: any) => ({ success: false, error: 'No store ID available' }),
        processSupplierAdvance: async () => {},
        updateSupplierAdvance: async () => {},
        deleteSupplierAdvance: async () => {},
        processEmployeePayment: async () => ({ success: false, error: 'No store ID available' }),
        // Notification management
        notifications: [],
        unreadCount: 0,
        notificationPreferences: {
          store_id: '',
          enabled: true,
          enabled_types: [],
          sound_enabled: false,
          show_in_app: true,
          max_notifications_in_history: 1000,
        },
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

  return (
    <OfflineDataContext.Provider value={{
      // Data - exact match
      storeId,
      currentBranchId,
      products,
      suppliers,
      expenseCategories,
      customers,
      employees,
      sales,
      inventory,
      inventoryBills,
      transactions,
      bills,
      billLineItems,
      billAuditLogs,
      missedProducts,
      
      // NEW: Accounting foundation data
      journalEntries,
      entities,
      chartOfAccounts,
      balanceSnapshots,

      // Computed/legacy compatibility - exact match
      stockLevels,
      setStockLevels,
      lowStockAlertsEnabled,
      lowStockThreshold,
      defaultCommissionRate,
      currency,
      exchangeRate,
      language,
      cashDrawer,
      closeCashDrawer,
      getCashDrawerBalanceReport,
      getCurrentCashDrawerStatus,
      getCashDrawerSessionDetails,
      getRecommendedOpeningAmount,
      refreshCashDrawerStatus,
      isOnline,

      // Loading states - exact match
      loading,

      // CRUD operations - exact signatures
      addProduct,
      addSupplier,
      addCustomer,
      updateCustomer,
      updateSupplier,
      updateProduct,
      deleteProduct,
      addEmployee,
      updateEmployee,
      deleteEmployee,
      addInventoryItem,
      updateInventoryItem,
      checkInventoryItemReferences,
      deleteInventoryItem,
      addInventoryBatch,
      addSale,
      updateSale,
      deleteSale,
      updateBillsForSaleItem,
      addTransaction,
      addExpenseCategory,
      updateInventoryBatch,
      applyCommissionRateToBatch,

      // Bill management operations
      createBill,
      updateBill,
      deleteBill,
      getBills,
      getBillDetails,
      createBillAuditLog,

      // Store operations
      getStore,

      deductInventoryQuantity,
      restoreInventoryQuantity,

      // Utility functions - exact match
      refreshData,
      getStockLevels,
      toggleLowStockAlerts,
      updateLowStockThreshold,
      updateDefaultCommissionRate,
      updateCurrency,
      updateExchangeRate,
      updateLanguage,
      receiptSettings,
      updateReceiptSettings,

      // Additional offline-specific features
      sync: performSync,
      fullResync,
      debouncedSync,
      getSyncStatus,
      validateAndCleanData,

      // Undo functionality
      canUndo,
      undoLastAction,
      pushUndo,
      testUndo,

      // Cash drawer transaction utility
      processCashDrawerTransaction,
      createCashDrawerUndoData,

      // Utility functions
      createId: createIdFunction,
      getCurrentCashDrawerBalance,
      refreshCashDrawerBalance,
      processPayment,
      processSupplierAdvance,
      updateSupplierAdvance,
      deleteSupplierAdvance,
      processEmployeePayment,

      // Notification management
      notifications,
      unreadCount: notifications.filter(n => !n.read).length,
      notificationPreferences: notificationPreferences || {
        store_id: storeId || '',
        enabled: true,
        enabled_types: [],
        sound_enabled: false,
        show_in_app: true,
        max_notifications_in_history: 1000,
      },
      createNotification: async (
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
      ) => {
        if (!storeId) return;
        const notification = await notificationService.createNotification(
          storeId,
          type,
          title,
          message,
          options
        );
        setNotifications(prev => [notification, ...prev]);
      },
      markAsRead: async (id: string) => {
        await notificationService.markAsRead(id);
        setNotifications(prev =>
          prev.map(n => (n.id === id ? { ...n, read: true } : n))
        );
      },
      markAllAsRead: async () => {
        if (!storeId) return;
        await notificationService.markAllAsRead(storeId);
        setNotifications(prev => prev.map(n => ({ ...n, read: true })));
      },
      deleteNotification: async (id: string) => {
        await notificationService.deleteNotification(id);
        setNotifications(prev => prev.filter(n => n.id !== id));
      },
      updateNotificationPreferences: async (prefs: Partial<NotificationPreferences>) => {
        if (!storeId) return;
        await notificationService.updatePreferences(storeId, prefs);
        const updated = await notificationService.getPreferences(storeId);
        setNotificationPreferences(updated);
      },

      openCashDrawer,
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