import React, { createContext, useContext, useState, useEffect, useRef, useCallback, ReactNode } from 'react';
import { useSupabaseAuth } from './SupabaseAuthContext';
import { useNetworkStatus } from '../hooks/useNetworkStatus';
import { useLocalStorage } from '../hooks/useLocalStorage';
import { Database } from '../types/database';
import {BillLineItem , BillLineItemDbUpdate, BillLineItemTransforms } from '../types';
import { 
  db, 
  Product, 
  Supplier, 
  Customer, 
  InventoryItem, 
  LocalSaleItem, 
  Transaction, 
  ExpenseCategory,
  createBaseEntity,
  createId,
} from '../lib/db';
import { syncService, SyncResult } from '../services/syncService';
// Removed SupabaseService import - using offline-first approach only

type Tables = Database['public']['Tables'];

// Offline-first data context interface
interface OfflineDataContextType {
  storeId: any;
  // Data - matching exact structure
  products: Tables['products']['Row'][];
  suppliers: Tables['suppliers']['Row'][];
  customers: Tables['customers']['Row'][];
  sales: BillLineItem[]; // Unified BillLineItem interface
  inventory: any[]; // Complex type with joins (mapped from inventoryItems)
  inventoryBills: any[]; // Inventory bills data
  transactions: Tables['transactions']['Row'][];
  expenseCategories: any[]; // Not in current schema
  bills: any[]; // Bill management data
  billLineItems: any[]; // Bill line items data
  billAuditLogs: any[]; // Bill audit logs data


  // Computed/legacy compatibility - exact match
  stockLevels: any[];
  setStockLevels: (levels: any[]) => void;
  lowStockAlertsEnabled: boolean;
  lowStockThreshold: number;
  defaultCommissionRate: number;
  currency: 'USD' | 'LBP';
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
  addInventoryItem: (item: Omit<Tables['inventory_items']['Insert'], 'store_id'>) => Promise<void>;
  updateInventoryItem: (id: string, updates: Tables['inventory_items']['Update']) => Promise<void>;
  deleteInventoryItem: (id: string) => Promise<void>;
  addInventoryBatch: (args: {
    supplier_id: string;
    created_by: string;
    status?: string | null;
    porterage_fee?: number | null;
    transfer_fee?: number | null;
    received_at?: string;
    commission_rate?:string,
    type:string,
    plastic_fee?:number|null;
    items: Array<Omit<Tables['inventory_items']['Insert'], 'store_id' | 'received_at'>>;
  }) => Promise<{ batchId: string; financialResult?: any }>;
  addSale: (items: any[]) => Promise<void>;
  updateSale: (id: string, updates: Partial<BillLineItem>) => Promise<void>;
  deleteSale: (id: string) => Promise<void>;
  updateBillsForSaleItem: (saleItemId: string) => Promise<void>;
  addTransaction: (transaction: Omit<Tables['transactions']['Insert'], 'store_id'>) => Promise<void>;
  addExpenseCategory: (category: any) => Promise<void>;
  updateInventoryBatch: (id: string, updates: Tables['inventory_bills']['Update']) => Promise<void>;
  applyCommissionRateToBatch: (batchId: string, commissionRate: number) => Promise<void>;

  // Bill management operations
  createBill: (billData: any, lineItems: any[]) => Promise<string>;
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
}

const OfflineDataContext = createContext<OfflineDataContextType | undefined>(undefined);

export function OfflineDataProvider({ children }: { children: ReactNode }) {
  const { userProfile } = useSupabaseAuth();
  const { isOnline, justCameOnline } = useNetworkStatus();
  const storeId = userProfile?.store_id;

  console.log('🔍 OfflineDataProvider: userProfile:', userProfile, 'storeId:', storeId, 'isOnline:', isOnline);

  // Data states - offline-first structure
  const [products, setProducts] = useState<Tables['products']['Row'][]>([]);
  const [suppliers, setSuppliers] = useState<Tables['suppliers']['Row'][]>([]);
  const [customers, setCustomers] = useState<Tables['customers']['Row'][]>([]);
  const [sales, setSales] = useState<BillLineItem[]>([]);
  const [inventory, setInventory] = useState<any[]>([]);
  const [transactions, setTransactions] = useState<Tables['transactions']['Row'][]>([]);
  const [expenseCategories, setExpenseCategories] = useState<any[]>([]);

  // Raw internal data
  const [inventoryItems, setInventoryItems] = useState<InventoryItem[]>([]);
  const [inventoryBills, setInventoryBills] = useState<any[]>([]);
  const [saleItems, setSaleItems] = useState<BillLineItem[]>([]);
  const [bills, setBills] = useState<any[]>([]);
  const [billLineItems, setBillLineItems] = useState<any[]>([]);
  const [billAuditLogs, setBillAuditLogs] = useState<any[]>([]);

  // Loading states - exact match
  const [loading, setLoading] = useState({
    sync: false,
    products: false,
    suppliers: false,
    customers: false,
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

  // Auto-sync timer ref for reset-based approach
  const autoSyncTimerRef = useRef<NodeJS.Timeout | null>(null);

  // Undo state - check localStorage on initialization
  const [canUndo, setCanUndo] = useState(() => {
    const undoData = localStorage.getItem('last_undo_action');
    return !!undoData;
  });

  // Legacy compatibility states - exact match
  const [lowStockAlertsEnabled, setLowStockAlertsEnabled] = useLocalStorage<boolean>('lowStockAlertsEnabled', true);
  const [lowStockThreshold, setLowStockThreshold] = useLocalStorage<number>('lowStockThreshold', 10);
  const [defaultCommissionRate, setDefaultCommissionRate] = useLocalStorage<number>('defaultCommissionRate', 10);
  const [currency, setCurrency] = useLocalStorage<'USD' | 'LBP'>('currency', 'USD');
  const [cashDrawer, setCashDrawer] = useState<any>(() => {
    const stored = localStorage.getItem('erp_cash_drawer');
    return stored ? JSON.parse(stored) : null;
  });
  const [stockLevels, setStockLevels] = useState<any[]>([]);

  // Load store data and update currency
  const loadStoreData = async () => {
    if (!storeId) return;

    try {
      // First check if store data exists in IndexedDB
      const existingStore = await db.stores.where('id').equals(storeId).first();

      if (existingStore) {
        // Use existing store data
        console.log('📦 Using cached store data:', existingStore);
        if (existingStore.preferred_currency) {
          setCurrency(existingStore.preferred_currency);
        }
        if (existingStore.preferred_commission_rate !== undefined) {
          setDefaultCommissionRate(existingStore.preferred_commission_rate);
        }
        if (existingStore.low_stock_alert !== undefined) {
          setLowStockAlertsEnabled(existingStore.low_stock_alert);
        }
      } else {
        // Store not found locally - will be synced when connection is available
        console.log('📴 Store data not found locally - will sync when online');
        // Use default values for now
        setCurrency('USD');
        setDefaultCommissionRate(10);
      }
    } catch (error) {
      console.error('❌ Error loading store data:', error);
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
  }, [storeId]);

  const initializeData = async () => {
    if (!storeId) return;

    console.log('🔄 Initializing data for store:', storeId);

    try {
      // Clean up any invalid/orphaned data first
      const [invalidCleaned, orphanedCleaned] = await Promise.all([
        db.cleanupInvalidInventoryItems(),
        db.cleanupOrphanedRecords(storeId)
      ]);

      if (invalidCleaned > 0 || orphanedCleaned > 0) {
        console.log(`🧹 Total cleanup: ${invalidCleaned + orphanedCleaned} records removed`);
      }

      // Clean up duplicate cash drawer accounts
      try {
        const { cashDrawerUpdateService } = await import('../services/cashDrawerUpdateService');
        const cleanupResult = await cashDrawerUpdateService.cleanupDuplicateAccounts(storeId);
        if (cleanupResult.success && cleanupResult.duplicatesRemoved > 0) {
          console.log(`🧹 Cleaned up ${cleanupResult.duplicatesRemoved} duplicate cash drawer accounts`);
        }
      } catch (cleanupError) {
        console.warn('Failed to cleanup duplicate cash drawer accounts:', cleanupError);
      }

      console.log('📊 Loading local data...');
      // Load local data first
      await refreshData();
      await updateUnsyncedCount();

      // Check if local database is empty (no essential data)
      const [productCount, supplierCount, customerCount] = await Promise.all([
        db.products.where('store_id').equals(storeId).filter(item => !item._deleted).count(),
        db.suppliers.where('store_id').equals(storeId).filter(item => !item._deleted).count(),
        db.customers.where('store_id').equals(storeId).filter(item => !item._deleted).count()
      ]);

      console.log(`📈 Local data counts: ${productCount} products, ${supplierCount} suppliers, ${customerCount} customers`);

      const isLocalDatabaseEmpty = productCount === 0 && supplierCount === 0 && customerCount === 0;

      // If local database is empty and we're online, sync from cloud
      if (isLocalDatabaseEmpty && isOnline) {
        console.log('📥 Local database is empty, syncing from cloud...');
        setLoading(prev => ({ ...prev, sync: true }));

        try {
          const syncResult = await syncService.fullResync(storeId);

          if (syncResult.success) {
            console.log(`✅ Initial sync completed: downloaded ${syncResult.synced.downloaded} records`);
            await refreshData();
            await updateUnsyncedCount();
          } else {
            console.error('❌ Initial sync failed:', syncResult.errors);
          }
        } catch (error) {
          console.error('❌ Initial sync error:', error);
        } finally {
          setLoading(prev => ({ ...prev, sync: false }));
        }
      } else if (isLocalDatabaseEmpty && !isOnline) {
        console.log('📴 Local database is empty but offline - will sync when connection is restored');
      } else if (!isLocalDatabaseEmpty) {
        console.log(`📊 Local database loaded: ${productCount} products, ${supplierCount} suppliers, ${customerCount} customers`);

        // If we have local data and we're online, perform a regular sync to get updates
        if (isOnline && unsyncedCount === 0) {
          console.log('🔄 Performing background sync to check for updates...');
          performSync(true); // Auto sync without blocking UI
        }
      }

    } catch (error) {
      console.error('❌ Data initialization failed:', error);
      // Still try to load what we can from local storage
      await refreshData();
      await updateUnsyncedCount();
    }

    // Run migration for existing transactions after data loads
    await migrateExistingTransactions();
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
      localStorage.setItem(migrationKey, new Date().toISOString());
      console.log('✅ Transaction migration completed - precision issues now handled during sync');
    } catch (error) {
      console.error('❌ Transaction migration failed:', error);
    }
  };

  // Auto-sync when connection is restored
  useEffect(() => {
    if (justCameOnline && storeId && !isSyncing) {
      handleConnectionRestored();
    }
  }, [justCameOnline, storeId, isSyncing]);

  const handleConnectionRestored = async () => {
    if (!storeId) return;

    console.log('🌐 Connection restored - checking what to sync...');

    try {
      // Check if local database is empty
      const [productCount, supplierCount, customerCount] = await Promise.all([
        db.products.where('store_id').equals(storeId).filter(item => !item._deleted).count(),
        db.suppliers.where('store_id').equals(storeId).filter(item => !item._deleted).count(),
        db.customers.where('store_id').equals(storeId).filter(item => !item._deleted).count()
      ]);

      const isLocalDatabaseEmpty = productCount === 0 && supplierCount === 0 && customerCount === 0;

      if (isLocalDatabaseEmpty) {
        console.log('📥 Connection restored with empty database - performing full sync...');
        setLoading(prev => ({ ...prev, sync: true }));

        try {
          const syncResult = await syncService.fullResync(storeId);

          if (syncResult.success) {
            console.log(`✅ Full sync after connection restore completed: downloaded ${syncResult.synced.downloaded} records`);
            await refreshData();
            await updateUnsyncedCount();
          } else {
            console.error('❌ Full sync after connection restore failed:', syncResult.errors);
          }
        } finally {
          setLoading(prev => ({ ...prev, sync: false }));
        }
      } else {
        console.log('🔄 Connection restored with local data - performing regular sync...');
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
          console.log('👀 Auto-syncing on focus/visibility change...');
          performSync(true);
        }, 1000); // 1 second debounce
      }
    };

    const handleFocus = () => {
      debouncedAutoSync();
    };

    const handleVisibilityChange = () => {
      if (!document.hidden) {
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

  const refreshData = async () => {
    if (!storeId) return;

    console.log('🔄 Refreshing data for store:', storeId);

    try {
      // Load all data from Dexie
      const [
        productsData,
        suppliersData,
        customersData,
        inventoryData,
        salesData,
        saleItemsData,
        transactionsData,
        batchesData,
        billsData,
        billLineItemsData,
        billAuditLogsData,
        cashDrawerAccountsData,
        cashDrawerSessionsData,
      ] = await Promise.all([
        db.products.where('store_id').equals(storeId).filter(item => !item._deleted).toArray(),
        db.suppliers.where('store_id').equals(storeId).filter(item => !item._deleted).toArray(),
        db.customers.where('store_id').equals(storeId).filter(item => !item._deleted).toArray(),
        db.inventory_items.where('store_id').equals(storeId).filter(item => !item._deleted).toArray(),
        Promise.resolve([]), // sales not in current schema
        Promise.resolve([]), // sale_items table removed - sales now come from bill_line_items
        db.transactions.where('store_id').equals(storeId).filter(item => !item._deleted).toArray(),
        db.inventory_bills.where('store_id').equals(storeId).filter(item => !item._deleted).toArray(),
        db.bills.where('store_id').equals(storeId).filter(item => !item._deleted).toArray(),
        db.bill_line_items.where('store_id').equals(storeId).filter(item => !item._deleted).toArray(),
        db.bill_audit_logs.where('store_id').equals(storeId).filter(item => !item._deleted).toArray(),
        db.cash_drawer_accounts.where('store_id').equals(storeId).filter(item => !item._deleted).toArray(),
        db.cash_drawer_sessions.where('store_id').equals(storeId).filter(item => !item._deleted).toArray(),

      ]);

      console.log(`📊 Loaded data: ${productsData.length} products, ${suppliersData.length} suppliers, ${customersData.length} customers, ${inventoryData.length} inventory items, ${saleItemsData.length} sale items, ${transactionsData.length} transactions, ${billsData.length} bills, ${cashDrawerAccountsData.length} cash drawer accounts, ${cashDrawerSessionsData.length} cash drawer sessions`);

      // Transform data for offline-first structure
      setProducts(productsData as Tables['products']['Row'][]);
      setSuppliers(suppliersData.map(s => ({ ...s, lb_balance: s.lb_balance || 0, usd_balance: s.usd_balance || 0 })) as Tables['suppliers']['Row'][]);
      setCustomers(customersData.map(c => ({ ...c, lb_balance: c.lb_balance || 0, usd_balance: c.usd_balance || 0 })) as Tables['customers']['Row'][]);
      setTransactions(transactionsData as unknown as Tables['transactions']['Row'][]);

      // Store raw data
      setInventoryItems(inventoryData);
      setInventoryBills(batchesData);

      // Transform bill line items to unified SaleItem interface for backward compatibility
      const transformedSaleItems: BillLineItem[] = await Promise.all(
        billLineItemsData.map(async (item: any) => {
          // Get product and supplier names


          return BillLineItemTransforms.fromDbRow(
            {
              id: item.id,
              store_id: item.store_id,
              inventory_item_id: item.inventory_item_id || '',
              product_id: item.product_id,
              supplier_id: item.supplier_id,
              customer_id: item.customer_id,
              quantity: item.quantity,
              weight: item.weight,
              unit_price: item.unit_price,
              received_value: item.received_value,
              payment_method: item.payment_method as 'cash' | 'card' | 'credit',
              notes: item.notes,
              created_at: item.created_at,
              created_by: item.created_by,
              bill_id: item.bill_id,
              product_name: item.product_name,
              supplier_name: item.supplier_name,
              line_total: item.line_total,
              line_order: item.line_order,
              updated_at: item.updated_at,
            } 
          );
        })
      );

      setSaleItems(transformedSaleItems);
      setSales(transformedSaleItems); // Update the main sales state as well
      setBills(billsData);
      setBillLineItems(billLineItemsData);
      setBillAuditLogs(billAuditLogsData);

      // Transform inventory to match expected structure and attach batch info for grouping/export
      const batchById = (batchesData || []).reduce((acc: any, b: any) => {
        acc[b.id] = b;
        return acc;
      }, {});

      setInventory(inventoryData.map(item => {
        const batch = item.batch_id ? batchById[item.batch_id] : null;
        return {
          ...item,
          commission_rate:batch? batch.commission_rate:null,
          batch_type:batch?batch.type:null,
          batch_porterage: batch ? batch.porterage : null,
          batch_transfer_fee: batch ? batch.transfer_fee : null,
          batch_status: batch ? batch.status : 'Created',
        };
      }));

      // Set sales directly as sale_items (no transformation needed)
      setSales(saleItemsData);

      // Refresh cash drawer status
      await refreshCashDrawerStatus();

      console.log('✅ Data refresh completed successfully');

    } catch (error) {
      console.error('❌ Error loading data from Dexie:', error);
    }
  };

  const updateUnsyncedCount = async () => {
    try {
      const tableNames = [
        'stores', 'products', 'suppliers', 'customers', 'cash_drawer_accounts',
        'inventory_bills', 'inventory_items', 'transactions', 'bills',
        'bill_line_items', 'bill_audit_logs', 'cash_drawer_sessions'
      ];

      const counts = await Promise.all([
        db.stores.filter(item => !item._synced).count(),
        db.products.filter(item => !item._synced).count(),
        db.suppliers.filter(item => !item._synced).count(),
        db.customers.filter(item => !item._synced).count(),
        db.cash_drawer_accounts.filter(item => !item._synced).count(),
        db.inventory_bills.filter(item => !item._synced).count(),
        db.inventory_items.filter(item => !item._synced).count(),
        db.transactions.filter(item => !item._synced).count(),
        db.bills.filter(item => !item._synced).count(),
        db.bill_line_items.filter(item => !item._synced).count(),
        db.bill_audit_logs.filter(item => !item._synced).count(),
        db.cash_drawer_sessions.filter(item => !item._synced).count(),
      ]);

      // Debug: Log which tables have unsynced records
      const unsyncedByTable = tableNames.map((name, index) => ({ table: name, count: counts[index] }))
        .filter(item => item.count > 0);

      if (unsyncedByTable.length > 0) {
        console.log('🔍 Unsynced records by table:', unsyncedByTable);

        // Debug specific unsynced records for inventory_items
        if (unsyncedByTable.some(item => item.table === 'inventory_items')) {
          db.inventory_items.filter(item => !item._synced).toArray().then(async (unsyncedItems) => {
            console.log('🔍 Unsynced inventory_items details:', unsyncedItems);
            unsyncedItems.forEach((item, index) => {
              console.log(`  Item ${index + 1}:`, {
                id: item.id,
                product_id: item.product_id,
                supplier_id: item.supplier_id,
                batch_id: item.batch_id,
                quantity: item.quantity,
                weight: item.weight,
                price: item.price,
                _synced: item._synced,
                _deleted: item._deleted,
                created_at: item.created_at
              });
            });

            // Check validation constraints for each unsynced item
            for (const item of unsyncedItems) {
              console.log(`🔍 Validating unsynced item ${item.id}:`);

              const validationErrors = [];
              
              // Check quantity constraint
              if (item.quantity < 0) {
                console.log(`  ❌ Quantity validation failed: ${item.quantity} < 0`);
                validationErrors.push('Negative quantity');
              } else {
                console.log(`  ✅ Quantity validation passed: ${item.quantity}`);
              }

              // Check if product_id exists
              const product = await db.products.get(item.product_id);
              if (!product) {
                console.log(`  ❌ Product validation failed: product_id ${item.product_id} not found`);
                validationErrors.push('Missing product');
              } else {
                console.log(`  ✅ Product validation passed: ${product.name}`);
              }

              // Check if supplier_id exists
              const supplier = await db.suppliers.get(item.supplier_id);
              if (!supplier) {
                console.log(`  ❌ Supplier validation failed: supplier_id ${item.supplier_id} not found`);
                validationErrors.push('Missing supplier');
              } else {
                console.log(`  ✅ Supplier validation passed: ${supplier.name}`);
              }

              // Check if batch_id exists (if provided)
              if (item.batch_id) {
                const batch = await db.inventory_bills.get(item.batch_id);
                if (!batch) {
                  console.log(`  ❌ Batch validation failed: batch_id ${item.batch_id} not found`);
                  validationErrors.push('Invalid batch reference');
                } else {
                  console.log(`  ✅ Batch validation passed: ${batch.id}`);
                }
              } else {
                console.log(`  ℹ️ No batch_id provided (optional)`);
              }
              
              // Auto-fix common issues
              if (validationErrors.length > 0) {
                console.log(`🔧 Attempting to auto-fix item ${item.id}...`);
                try {
                  const fixes = [];
                  
                  // Fix negative quantity
                  if (item.quantity < 0) {
                    await db.inventory_items.update(item.id, { 
                      quantity: 0,
                      _synced: false 
                    });
                    fixes.push('Fixed negative quantity (set to 0)');
                  }
                  
                  // Fix missing product (use first available product)
                  if (!product) {
                    const validProduct = await db.products
                      .where('store_id')
                      .equals(item.store_id)
                      .filter(p => !p._deleted)
                      .first();
                    if (validProduct) {
                      await db.inventory_items.update(item.id, { 
                        product_id: validProduct.id,
                        _synced: false 
                      });
                      fixes.push(`Updated product_id to: ${validProduct.name}`);
                    }
                  }
                  
                  // Fix missing supplier (use first available supplier)
                  if (!supplier) {
                    const validSupplier = await db.suppliers
                      .where('store_id')
                      .equals(item.store_id)
                      .filter(s => !s._deleted)
                      .first();
                    if (validSupplier) {
                      await db.inventory_items.update(item.id, { 
                        supplier_id: validSupplier.id,
                        _synced: false 
                      });
                      fixes.push(`Updated supplier_id to: ${validSupplier.name}`);
                    }
                  }
                  
                  // Fix invalid batch reference
                  if (item.batch_id && !await db.inventory_bills.get(item.batch_id)) {
                    await db.inventory_items.update(item.id, { 
                      batch_id: null,
                      _synced: false 
                    });
                    fixes.push('Removed invalid batch_id reference');
                  }
                  
                  if (fixes.length > 0) {
                    console.log(`✅ Auto-fixes applied: ${fixes.join(', ')}`);
                  } else {
                    console.log(`⚠️ No auto-fixes available for item ${item.id}`);
                  }
                } catch (fixError) {
                  console.error(`❌ Auto-fix failed for item ${item.id}:`, fixError);
                }
              }
            }
          });
        }
      }

      setUnsyncedCount(counts.reduce((sum, count) => sum + count, 0));
    } catch (error) {
      console.error('Error counting unsynced records:', error);
    }
  };

  // Helper function to get current unsynced count
  const getCurrentUnsyncedCount = async (): Promise<number> => {
    try {
      const counts = await Promise.all([
        db.stores.filter(item => !item._synced).count(),
        db.products.filter(item => !item._synced).count(),
        db.suppliers.filter(item => !item._synced).count(),
        db.customers.filter(item => !item._synced).count(),
        db.cash_drawer_accounts.filter(item => !item._synced).count(),
        db.inventory_bills.filter(item => !item._synced).count(),
        db.inventory_items.filter(item => !item._synced).count(),
        db.transactions.filter(item => !item._synced).count(),
        db.bills.filter(item => !item._synced).count(),
        db.bill_line_items.filter(item => !item._synced).count(),
        db.bill_audit_logs.filter(item => !item._synced).count(),
        db.cash_drawer_sessions.filter(item => !item._synced).count(),
      ]);
      return counts.reduce((sum, count) => sum + count, 0);
    } catch (error) {
      console.error('Error counting unsynced records:', error);
      return 0;
    }
  };

  // Reset auto-sync timer on every data change
  const resetAutoSyncTimer = useCallback(() => {
    // Clear existing timer
    if (autoSyncTimerRef.current) {
      console.log('🔄 Resetting auto-sync timer (clearing existing timer)');
      clearTimeout(autoSyncTimerRef.current);
      autoSyncTimerRef.current = null;
    }

    // Always set new timer if online (we'll check unsyncedCount when timer fires)
    if (isOnline && storeId && !isSyncing) {
      console.log('⏰ Setting new 8-second auto-sync timer');
      autoSyncTimerRef.current = setTimeout(async () => {
        console.log('⏰ Auto-sync timer fired, checking for unsynced data...');

        // Get fresh unsynced count
        const currentUnsyncedCount = await getCurrentUnsyncedCount();
        console.log(`📊 Current unsynced count: ${currentUnsyncedCount}`);

        if (!syncService.isCurrentlyRunning() && currentUnsyncedCount > 0) {
          console.log('⏰ Auto-sync triggered after 8-second delay');
          performSync(true);
        } else {
          console.log('⏰ No unsynced data or sync already running, skipping auto-sync');
        }
      }, 8000); // 8 seconds - same as undo window
    } else {
      console.log('⏰ Not setting auto-sync timer - offline, no store, or syncing');
    }
  }, [isOnline, storeId, isSyncing]);

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
            supplierId: item.supplier_id,
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

  const performSync = async (isAutomatic = false): Promise<SyncResult> => {
    if (!storeId || isSyncing) {
      return { success: false, errors: ['No store ID or sync in progress'], synced: { uploaded: 0, downloaded: 0 }, conflicts: 0 };
    }

    setIsSyncing(true);
    setIsAutoSyncing(isAutomatic);
    setLoading(prev => ({ ...prev, sync: true }));

    try {
      const result = await syncService.sync(storeId);
      setLastSync(new Date());

      if (result.success || result.synced.uploaded > 0 || result.synced.downloaded > 0) {
        await refreshData();
        await updateUnsyncedCount();
        await checkUndoValidity();
      }

      return result;
    } catch (error) {
      console.error(`${isAutomatic ? 'Auto-sync' : 'Manual sync'} error:`, error);
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
    }
  };

  // Debounced sync to batch rapid changes and prevent excessive sync calls
  const debouncedSync = () => {
    if (!isOnline || isSyncing) return;

    // Clear existing timeout
    if (debouncedSyncTimeout) {
      clearTimeout(debouncedSyncTimeout);
    }

    // Set new timeout for 1 second
    const timeout = setTimeout(() => {
      if (isOnline && !isSyncing && unsyncedCount > 0) {
        console.log('🔄 Debounced auto-sync triggered');
        performSync(true); // Mark as automatic sync
      }
      setDebouncedSyncTimeout(null);
    }, 1000);

    setDebouncedSyncTimeout(timeout);
  };

  // Bill management functions
  const createBill = async (billData: any, lineItems: any[]): Promise<string> => {
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

    const mappedLineItems = lineItems.map(item => ({
      id: createId(),
      bill_id: billId,
      store_id: storeId,
      created_at: now,
      created_by: currentUserId,
      _synced: false,
      ...item
    }));

    // Log the final bill data for debugging
    console.log('📋 Final line items data before storage:', mappedLineItems, 'items');

    // Use transaction to ensure atomicity for all operations including inventory and cash drawer
    await db.transaction('rw', [db.bills, db.bill_line_items, db.inventory_items], async () => {
      // Add bill and line items
      await db.bills.add(bill);
      if (mappedLineItems.length > 0) {
        await db.bill_line_items.bulkAdd(mappedLineItems);
      }

      // Deduct from specific inventory items
      for (const item of mappedLineItems) {
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
          const inventoryRecords = await db.inventory_items
            .where('product_id')
            .equals(item.product_id)
            .and(inv => inv.supplier_id === item.supplier_id && inv.quantity > 0)
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

    // Update cash drawer for cash sales
    const cashSaleItems = mappedLineItems.filter(item => item.payment_method === 'cash');
    if (cashSaleItems.length > 0) {
      try {
        const { cashDrawerUpdateService } = await import('../services/cashDrawerUpdateService');

        const totalCashAmount = cashSaleItems.reduce((sum, item) => sum + (item.received_value || item.line_total || 0), 0);

        // console.log(`💰 Updating cash drawer for cash sales: $${totalCashAmount}`);

        const cashDrawerResult = await cashDrawerUpdateService.updateCashDrawerForTransaction({
          type: 'sale',
          amount: totalCashAmount,
          currency: 'LBP', // Assuming LBP for now, could be made dynamic
          description: `Cash sale - ${cashSaleItems.length} items`,
          reference: `SALE-${Date.now()}`,
          storeId: storeId,
          createdBy: currentUserId,
          customerId: cashSaleItems[0]?.customer_id || undefined,
          allowAutoSessionOpen: true
        }, getStore);

        if (cashDrawerResult.success) {
          console.log(`✅ Cash drawer updated: $${cashDrawerResult.previousBalance?.toFixed(2)} → $${cashDrawerResult.newBalance?.toFixed(2)}`);
        } else {
          console.error('❌ Failed to update cash drawer:', cashDrawerResult.error);
        }
      } catch (error) {
        console.error('❌ Error updating cash drawer for sales:', error);
      }
    }

    await refreshData();
    await updateUnsyncedCount();

    // Reset auto-sync timer to ensure full undo window
    resetAutoSyncTimer();

    debouncedSync();

    return billId;
  };

  const updateBill = async (billId: string, updates: any, changedBy: string, changeReason?: string): Promise<void> => {
    if (!storeId) throw new Error('No store ID available');

    const now = new Date().toISOString();

    // Pure offline-first approach - update local database only
    await db.transaction('rw', [db.bills, db.bill_audit_logs], async () => {
      await db.bills.update(billId, {
        ...updates,
        updated_at: now,
        _synced: false // Mark as unsynced for background sync
      });

      // Create audit log
      const auditLog = {
        id: createId(),
        bill_id: billId,
        store_id: storeId,
        action: 'updated' as const,
        field_changed: null,
        old_value: null,
        new_value: JSON.stringify(updates),
        change_reason: changeReason || null,
        changed_by: changedBy,
        ip_address: null,
        created_at: now,
        updated_at: now,
        _synced: false // Mark as unsynced for background sync
      };

      await db.bill_audit_logs.add(auditLog);
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
        const lineItems = await db.bill_line_items.where('bill_id').equals(billId).toArray();
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

      // Create audit log
      const auditLog = {
        id: createId(),
        bill_id: billId,
        store_id: storeId,
        action: 'deleted' as const,
        field_changed: 'status',
        old_value: 'active',
        new_value: softDelete ? 'cancelled' : 'deleted',
        change_reason: deleteReason || null,
        changed_by: deletedBy,
        ip_address: null,
        created_at: now,
        updated_at: now,
        _synced: false // Mark as unsynced for background sync
      };

      await db.bill_audit_logs.add(auditLog);
    });

    await refreshData();
    await updateUnsyncedCount();
    debouncedSync();
  };

  const getBills = async (filters?: any): Promise<any[]> => {
    if (!storeId) return [];

    // Pure offline-first approach - read only from local database
    let query = db.bills.where('store_id').equals(storeId).filter(bill => !bill._deleted);

    // Apply filters if provided
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
      if (filters.date_from) {
        query = query.and(bill => bill.created_at >= filters.date_from);
      }
      if (filters.date_to) {
        query = query.and(bill => bill.created_at <= filters.date_to);
      }
    }

    const billsData = await query.toArray();

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

    const result = {
      ...bill,
      line_items: lineItems,
      audit_logs: auditLogs
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
    if (!storeId) throw new Error('No store ID available');

    const product: Product = {
      ...createBaseEntity(storeId),
      ...productData
    } as Product;

    await db.products.add(product);
    await refreshData();
    await updateUnsyncedCount();

    // Reset auto-sync timer to ensure full undo window
    resetAutoSyncTimer();

    // Use debounced sync to batch rapid changes
    debouncedSync();
  };

  const addSupplier = async (supplierData: Omit<Tables['suppliers']['Insert'], 'store_id'>): Promise<void> => {
    if (!storeId) throw new Error('No store ID available');

    const supplier: Supplier = {
      ...createBaseEntity(storeId),
      ...supplierData
    } as Supplier;

    await db.suppliers.add(supplier);
    await refreshData();
    await updateUnsyncedCount();

    // Reset auto-sync timer to ensure full undo window
    resetAutoSyncTimer();

    // Use debounced sync to batch rapid changes
    debouncedSync();
  };

  const addCustomer = async (customerData: Omit<Tables['customers']['Insert'], 'store_id'>): Promise<void> => {
    if (!storeId) throw new Error('No store ID available');

    const customer: Customer = {
      ...createBaseEntity(storeId),
      balance: 0, // Changed from current_debt to balance to match Supabase schema
      is_active: true,
      ...customerData
    } as Customer;

    await db.customers.add(customer);
    await refreshData();
    await updateUnsyncedCount();

    // Reset auto-sync timer to ensure full undo window
    resetAutoSyncTimer();

    // Use debounced sync to batch rapid changes
    debouncedSync();
  };

  const updateCustomer = async (id: string, updates: Tables['customers']['Update']): Promise<void> => {
    await db.customers.update(id, { ...updates, _synced: false });
    await refreshData();
    await updateUnsyncedCount();

    // Reset auto-sync timer to ensure full undo window
    resetAutoSyncTimer();

    // Use debounced sync to batch rapid changes
    debouncedSync();
  };

  const updateSupplier = async (id: string, updates: Tables['suppliers']['Update']): Promise<void> => {
    await db.suppliers.update(id, { ...updates, _synced: false });
    await refreshData();
    await updateUnsyncedCount();

    // Reset auto-sync timer to ensure full undo window
    resetAutoSyncTimer();

    // Use debounced sync to batch rapid changes
    debouncedSync();
  };

  const updateProduct = async (id: string, updates: Tables['products']['Update']): Promise<void> => {
    await db.products.update(id, { ...updates, _synced: false });
    await refreshData();
    await updateUnsyncedCount();

    // Reset auto-sync timer to ensure full undo window
    resetAutoSyncTimer();

    // Use debounced sync to batch rapid changes
    debouncedSync();
  };

  const deleteProduct = async (id: string): Promise<void> => {
    await db.products.update(id, { _deleted: true, _synced: false });
    await refreshData();
    await updateUnsyncedCount();

    // Reset auto-sync timer to ensure full undo window
    resetAutoSyncTimer();

    // Use debounced sync to batch rapid changes
    debouncedSync();
  };

  const addInventoryItem = async (itemData: Omit<Tables['inventory_items']['Insert'], 'store_id'>): Promise<void> => {
    if (!storeId) throw new Error('No store ID available');

    const item: InventoryItem = {
      id: createId(),
      product_id: itemData.product_id??'',
      supplier_id: itemData.supplier_id??'',
      quantity: itemData.quantity ?? 0,
      unit: itemData.unit ?? '',
      received_quantity: itemData.received_quantity ?? (itemData.quantity ?? 0),
      store_id: storeId,
      created_at: new Date().toISOString(),
      _synced: false,
      weight: itemData.weight ?? null,
      price: itemData.price ?? null,
      selling_price: (itemData as any).selling_price ?? null,
      batch_id: itemData.batch_id ?? null
    };

    await db.inventory_items.add(item);
    await refreshData();
    await updateUnsyncedCount();

    // Reset auto-sync timer to ensure full undo window
    resetAutoSyncTimer();

    // Use debounced sync to batch rapid changes
    debouncedSync();
  };

  const updateInventoryItem = async (id: string, updates: Tables['inventory_items']['Update']): Promise<void> => {
    await db.inventory_items.update(id, { ...updates, _synced: false });
    await refreshData();
    await updateUnsyncedCount();

    // Reset auto-sync timer to ensure full undo window
    resetAutoSyncTimer();

    // Use debounced sync to batch rapid changes
    debouncedSync();
  };

  const deleteInventoryItem = async (id: string): Promise<void> => {
    // Get related bill line items and soft delete them first
    await db.transaction('rw', [db.bill_line_items, db.inventory_items], async () => {
      const relatedBillLineItems = await db.bill_line_items.where('inventory_item_id').equals(id).toArray();
      for (const bli of relatedBillLineItems) {
        await db.bill_line_items.update(bli.id, { _deleted: true, _synced: false });
      }
      // Soft delete the inventory item
      await db.inventory_items.update(id, { _deleted: true, _synced: false });
    });

    await refreshData();
    await updateUnsyncedCount();

    // Reset auto-sync timer to ensure full undo window
    resetAutoSyncTimer();

    // Use debounced sync to batch rapid changes
    debouncedSync();
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
    items
  }) => {
    if (!storeId) throw new Error('No store ID available');
    if (!items || items.length === 0) throw new Error('No items provided');

    const batchId = createId();

    // Get the actual supplier ID before processing
    const actualSupplierId = supplier_id === 'trade' ? await getOrCreateTradeSupplier() : supplier_id;

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
            price: item.price,
            selling_price: item.selling_price
          })),
          porterage_fee: porterage_fee || undefined,
          transfer_fee: transfer_fee || undefined,
          plastic_fee: plastic_fee || undefined,
          commission_rate: commission_rate || undefined,
          created_by,
          store_id: storeId,
          status: status || undefined
        };

        financialResult = await inventoryPurchaseService.processInventoryPurchase(purchaseData);
        console.log('Financial transaction processed:', financialResult);
      } catch (error) {
        console.error('Error processing financial transaction:', error);
        throw new Error(`Failed to process financial transaction: ${error instanceof Error ? error.message : 'Unknown error'}`);
      }
    }

    const batchRecord = {
      id: batchId,
      supplier_id: actualSupplierId,
      status,
      porterage_fee,
      transfer_fee,
      received_at: received_at || new Date().toISOString(),
      commission_rate:commission_rate,
      store_id: storeId,
      created_by,
      plastic_fee,
      type,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      _synced: false
    } as any;

    // Both batch and items are persisted locally and will be synced to Supabase.
    // The sync service ensures inventory_bills are uploaded before inventory_items
    // to maintain foreign key constraints.
    await db.transaction('rw', [db.inventory_bills, db.inventory_items], async () => {
      await db.inventory_bills.add(batchRecord);
      console.log(batchRecord,'batchrecord')
      const now = new Date().toISOString();

      const mappedItems = items.map((it) => ({
        id:createId(),
        product_id:it.product_id??'',
        quantity:it.quantity??0,
        unit:it.unit??'',
        store_id: storeId,
        created_at: now,
        _synced: false,
        supplier_id: actualSupplierId,
        weight: it.weight ?? null,
        price: it.price ?? null,
        selling_price: it.selling_price ?? null,
        received_quantity: it.received_quantity ??0,  
        batch_id: batchId as string | null
      }));

      await db.inventory_items.bulkAdd(mappedItems);
    });

    await refreshData();
    await updateUnsyncedCount();

    // Reset auto-sync timer to ensure full undo window
    resetAutoSyncTimer();

    debouncedSync();

    return { batchId, financialResult };
  };

  // Helper function to get or create Trade supplier
  const getOrCreateTradeSupplier = async (): Promise<string> => {
    if (!storeId) throw new Error('No store ID available');

    try {
      // Ensure database is open
      await db.open();

      // Look for existing "Trade" supplier
      const existingSupplier = await db.suppliers
        .where('name')
        .equals('Trade')
        .and(s => s.store_id === storeId)
        .first();

      if (existingSupplier) {
        return existingSupplier.id;
      }

      // Create new "Trade" supplier
      const tradeSupplierId = createId();
      const tradeSupplier = {
        id: tradeSupplierId,
        name: 'Trade',
        email: '',
        phone: '',
        address: '',
        store_id: storeId,
        usd_balance: 0,
        lb_balance: 0,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        _synced: false
      };

      await db.suppliers.add(tradeSupplier);
      return tradeSupplierId;
    } catch (error) {
      console.error('Error getting/creating Trade supplier:', error);
      console.error('Database state:', {
        isOpen: db.isOpen(),
        tables: db.tables.map(t => t.name),
        version: db.verno
      });
      throw new Error('Failed to get or create Trade supplier');
    }
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
      last_modified_at: now,
      _synced: false
    };

    const lineItems = items.map((item, index) => ({
      id: createId(),
      store_id: storeId,
      bill_id: billId,
      product_id: item.product_id,
      product_name: item.product_name || 'Unknown Product',
      supplier_id: item.supplier_id,
      supplier_name: item.supplier_name || 'Unknown Supplier',
      inventory_item_id: item.inventory_item_id || null,
      quantity: item.quantity,
      unit_price: item.unit_price,
      line_total: item.received_value || item.unit_price * item.quantity,
      weight: item.weight || null,
      notes: item.notes || null,
      line_order: index + 1,
      payment_method: item.payment_method || 'cash',
      customer_id: item.customer_id || null,
      created_by: currentUserId,
      received_value: item.received_value || item.unit_price * item.quantity,
      created_at: now,
      updated_at: now,
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
          const inventoryRecords = await db.inventory_items
            .where('product_id')
            .equals(item.product_id)
            .and(inv => inv.supplier_id === item.supplier_id && inv.quantity > 0)
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

    // Filter cash sale items for undo data
    const cashSaleItems = lineItems.filter(item => item.payment_method === 'cash');

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
          reference: `SALE-${Date.now()}`,
          storeId: storeId,
          createdBy: currentUserId,
          customerId: cashSaleItemsForDrawer[0]?.customer_id || undefined,
          allowAutoSessionOpen: true
        }, getStore);

        if (cashDrawerResult.success) {
          console.log(`✅ Cash drawer updated: $${cashDrawerResult.previousBalance?.toFixed(2)} → $${cashDrawerResult.newBalance?.toFixed(2)}`);
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

    // Get the original sale item to compare quantities
    const originalSale = await db.bill_line_items.get(id);
    if (!originalSale) throw new Error('Sale item not found');

    // Transform updates to database format
    const dbUpdates = BillLineItemTransforms.toDbUpdate(updates);

    // Check if quantity has changed
    const quantityChanged = updates.quantity !== undefined && updates.quantity !== originalSale.quantity;
    const quantityDifference = quantityChanged ? (updates.quantity || 0) - (originalSale.quantity || 0) : 0;

    // Check if price-related fields have changed (these affect bill totals)
    const priceChanged = updates.unitPrice !== undefined || updates.receivedValue !== undefined || updates.weight !== undefined;

    // Use transaction to ensure atomicity for the sale update only
    await db.transaction('rw', [db.bill_line_items], async () => {
      // Update the sale item
      const updateData = {
        ...dbUpdates,
        _synced: false
      };
      await db.bill_line_items.update(id, updateData);
    });

    // Handle inventory adjustments outside the transaction if quantity changed
    if (quantityChanged && originalSale.product_id && originalSale.supplier_id) {
      if (quantityDifference > 0) {
        // Quantity increased - deduct additional inventory
        await deductInventoryQuantity(originalSale.product_id, originalSale.supplier_id, quantityDifference);
      } else if (quantityDifference < 0) {
        // Quantity decreased - restore inventory
        await restoreInventoryQuantity(originalSale.product_id, originalSale.supplier_id, Math.abs(quantityDifference));
      } 
    }

    // Update related bills if price-related fields changed
    if (priceChanged) {
      await db.updateBillsForLineItem(id);
    }

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
      await restoreInventoryQuantity(saleItem.product_id, saleItem.supplier_id, saleItem.quantity);
    }

    await refreshData();
    await updateUnsyncedCount();

    // Reset auto-sync timer to ensure full undo window
    resetAutoSyncTimer();

    // Use debounced sync to batch rapid changes
    debouncedSync();
  };

  const addTransaction = async (transactionData: Omit<Tables['transactions']['Insert'], 'store_id'>): Promise<void> => {
    if (!storeId) throw new Error('No store ID available');

    // Store amounts as-is in their original currency
    // We'll handle database precision issues only during sync to Supabase
    const transaction: Transaction = {
      customer_id: transactionData.customer_id ?? null,
      supplier_id: transactionData.supplier_id ?? null,
      store_id: storeId,
      created_at: new Date().toISOString(),
      _synced: false,
      ...transactionData,
      amount: transactionData.amount, // Store original amount
      reference: transactionData.reference ?? null
    };

    await db.transactions.add(transaction);
    await refreshData();
    await updateUnsyncedCount();

    // Reset auto-sync timer to ensure full undo window
    resetAutoSyncTimer();

    // Use debounced sync to batch rapid changes
    debouncedSync();
  };

  const addExpenseCategory = async (categoryData: any): Promise<void> => {
    if (!storeId) throw new Error('No store ID available');

    // Expense categories not supported in current schema
    console.warn('Expense categories not supported in current schema');
    return;
  };

  const updateInventoryBatch = async (id: string, updates: Tables['inventory_bills']['Update']): Promise<void> => {
    await db.inventory_bills.update(id, { ...updates, _synced: false });
    await refreshData();
    await updateUnsyncedCount();

    // Reset auto-sync timer to ensure full undo window
    resetAutoSyncTimer();

    debouncedSync();
  };

  const applyCommissionRateToBatch = async (batchId: string, commissionRate: number): Promise<void> => {
    const bill = await db.inventory_bills.where('batch_id').equals(batchId);
    // bill is a Collection, not an id or object; need to update by batch_id
    await db.inventory_bills
      .where('id')
      .equals(batchId)
      .modify({ commission_rate: commissionRate, _synced: false });

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
      const report = await db.validateDataIntegrity(storeId);
      const cleaned = await db.cleanupOrphanedRecords(storeId);

      if (cleaned > 0) {
        await refreshData();
        await updateUnsyncedCount();
      }

      return { cleaned, report };
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
      if (!undoData) return false;

      const action = JSON.parse(undoData);
      console.log('🔄 Attempting undo for action:', action);

      // Check if any affected records are synced
      // Exception: cash_drawer_accounts can be synced and still allow undo (only balance changes)
      for (const item of action.affected || []) {
        const record = await (db as any)[item.table].get(item.id);
        if (!record) {
          console.log(`❌ Cannot undo: record ${item.id} in ${item.table} is missing`);
          localStorage.removeItem('last_undo_action');
          setCanUndo(false);
          return false;
        }

        // Allow undo for cash_drawer_accounts even if synced (only balance changes)
        if (record._synced && item.table !== 'cash_drawer_accounts') {
          console.log(`❌ Cannot undo: record ${item.id} in ${item.table} is synced`);
          localStorage.removeItem('last_undo_action');
          setCanUndo(false);
          return false;
        }
      }

      // Execute undo steps
      await db.transaction('rw', [...db.tables, db.pending_syncs], async () => {
        for (const step of action.steps || []) {
          console.log('🔄 Executing undo step:', step);

          if (step.op === 'delete' && step.id) {
            console.log(`🗑️ Deleting record ${step.id} from ${step.table}`);
            await (db as any)[step.table].delete(step.id);
            // Remove from pending syncs if it exists
            await db.pending_syncs.where('table_name').equals(step.table)
              .filter(item => item.record_id === step.id).delete();
          } else if (step.op === 'restore' && step.record) {
            console.log(`📥 Restoring record to ${step.table}:`, step.record);
            await (db as any)[step.table].add(step.record);
          } else if (step.op === 'update' && step.id && step.changes) {
            console.log(`✏️ Updating record ${step.id} in ${step.table} with:`, step.changes);
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

      console.log('✅ Undo completed successfully');
      localStorage.removeItem('last_undo_action');
      setCanUndo(false);
      await refreshData();
      await updateUnsyncedCount();
      return true;
    } catch (error) {
      console.error('❌ Undo failed:', error);
      return false;
    }
  };

  // Check undo validity after data changes
  const checkUndoValidity = async () => {
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
  };

  const openCashDrawer = async (amount: number, openedBy: string) => {
    if (!storeId) return;

    try {
      // Use the cash drawer service to open session (handles account creation thread-safely)
      const { cashDrawerUpdateService } = await import('../services/cashDrawerUpdateService');
      const result = await cashDrawerUpdateService.openCashDrawerSession(storeId, amount, openedBy);

      if (!result.success) {
        throw new Error(result.error || 'Failed to open cash drawer session');
      }

      // Get the account for local state
      const account = await db.getCashDrawerAccount(storeId);
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

      // Store in localStorage for persistence
      localStorage.setItem('erp_cash_drawer', JSON.stringify({
        id: result.sessionId,
        accountId: account.id,
        status: 'open',
        currentBalance: amount,
        currency: (account as any).currency,
        lastUpdated: new Date().toISOString()
      }));

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
      const account = await db.getCashDrawerAccount(storeId);
      if (!account) return;

      const previousBalance = account.current_balance || 0;

      await db.closeCashDrawerSession(cashDrawer.id, actualAmount, closedBy, notes);

      // Update local state
      setCashDrawer({
        ...cashDrawer,
        status: 'closed',
        currentBalance: 0,
        lastUpdated: new Date().toISOString()
      });

      // Update localStorage
      localStorage.setItem('erp_cash_drawer', JSON.stringify({
        ...cashDrawer,
        status: 'closed',
        currentBalance: 0,
        lastUpdated: new Date().toISOString()
      }));

      // Store undo data
      pushUndo({
        type: 'close_cash_drawer',
        affected: [
          { table: 'cash_drawer_sessions', id: cashDrawer.id },
          { table: 'cash_drawer_accounts', id: account.id }
        ],
        steps: [
          { op: 'update', table: 'cash_drawer_sessions', id: cashDrawer.id, changes: {
            status: 'open',
            closed_at: null,
            closed_by: null,
            expected_amount: null,
            actual_amount: null,
            variance: null,
            _synced: false
          }},
          { op: 'update', table: 'cash_drawer_accounts', id: account.id, changes: { current_balance: previousBalance, _synced: false } }
        ]
      });

      // Update unsynced count and trigger sync for cash drawer data
      await updateUnsyncedCount();

      // Reset auto-sync timer to ensure full undo window
      resetAutoSyncTimer();

      debouncedSync();
    } catch (error) {
      console.error('Error closing cash drawer:', error);
    }
  };

  const getCashDrawerBalanceReport = async (startDate?: string, endDate?: string) => {
    if (!storeId) return [];
    return await db.getCashDrawerBalanceReport(storeId, startDate, endDate);
  };

  const getCurrentCashDrawerStatus = async () => {
    if (!storeId) return null;
    return await db.getCurrentCashDrawerStatus(storeId);
  };

  const refreshCashDrawerStatus = async () => {
    if (!storeId) return;

    try {
      const status = await db.getCurrentCashDrawerStatus(storeId);
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

        // Update localStorage
        localStorage.setItem('erp_cash_drawer', JSON.stringify({
          id: status.sessionId,
          accountId: status.accountId,
          status: 'open',
          currentBalance: status.currentBalance,
          currency: currency,
          lastUpdated: new Date().toISOString()
        }));
      } else {
        // No active session
        setCashDrawer(null);
        localStorage.removeItem('erp_cash_drawer');
      }
    } catch (error) {
      console.error('Error refreshing cash drawer status:', error);
    }
  };

  const getCashDrawerSessionDetails = async (sessionId: string) => {
    if (!storeId) return null;
    return await db.getCashDrawerSessionDetails(sessionId);
  };

  const getRecommendedOpeningAmount = async () => {
    if (!storeId) return { amount: 0, source: 'default' as const };
    return await db.getCashDrawerSessionDetails(storeId);
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
    setLowStockThreshold(threshold);
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



  const deductInventoryQuantity = async (productId: string, supplierId: string, quantity: number): Promise<void> => {
    console.log('deductInventoryQuantity', productId, supplierId, quantity);
    if (!storeId) return;

    try {
      const inventoryRecords = await db.inventory_items
        .where('product_id')
        .equals(productId)
        .and(inv => inv.supplier_id === supplierId && inv.quantity > 0)
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

  const restoreInventoryQuantity = async (productId: string, supplierId: string, quantity: number): Promise<void> => {
    console.log('restoreInventoryQuantity', productId, supplierId, quantity);
    if (!storeId) return;

    try {
      // Find existing inventory items for this product/supplier
      const existingInventory = await db.inventory_items
        .where('product_id')
        .equals(productId)
        .and(inv => inv.supplier_id === supplierId)
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
          supplier_id: supplierId,
          quantity: quantity,
          _synced: false,
          unit: 'box',
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
    console.log('❌ No userProfile available, rendering empty context');
    return (
      <OfflineDataContext.Provider value={{
        // Minimal context with empty data
        storeId: null,
        products: [],
        suppliers: [],
        customers: [],
        sales: [],
        inventory: [],
        inventoryBills: [],
        transactions: [],
        expenseCategories: [],
        bills: [],
        billLineItems: [],
        billAuditLogs: [],
        stockLevels: [],
        setStockLevels: () => {},
        lowStockAlertsEnabled: false,
        lowStockThreshold: 10,
        defaultCommissionRate: 10,
        currency: 'USD',
        cashDrawer: null,
        openCashDrawer: async () => {},
        closeCashDrawer: async () => {},
        getCashDrawerBalanceReport: async () => [],
        getCurrentCashDrawerStatus: async () => null,
        getCashDrawerSessionDetails: async () => null,
        getRecommendedOpeningAmount: async () => ({ amount: 0, source: 'default' as const }),
        refreshCashDrawerStatus: async () => {},
        isOnline: false,
        loading: {
          sync: false,
          products: false,
          suppliers: false,
          customers: false,
          sales: false,
          inventory: false,
          transactions: false,
          expenseCategories: false,
          bills: false
        },
        // Empty CRUD operations
        addProduct: async () => {},
        addSupplier: async () => {},
        addCustomer: async () => {},
        updateCustomer: async () => {},
        updateSupplier: async () => {},
        updateProduct: async () => {},
        deleteProduct: async () => {},
        addInventoryItem: async () => {},
        updateInventoryItem: async () => {},
        deleteInventoryItem: async () => {},
        addInventoryBatch: async () => ({ batchId: '', financialResult: null }),
        addSale: async () => {},
        updateSale: async () => {},
        deleteSale: async () => {},
        updateBillsForSaleItem: async () => {},
        addTransaction: async () => {},
        addExpenseCategory: async () => {},
        updateInventoryBatch: async () => {},
        applyCommissionRateToBatch: async () => {},
        createBill: async () => '',
        updateBill: async () => {},
        deleteBill: async () => {},
        getBills: async () => [],
        getBillDetails: async () => null,
        createBillAuditLog: async () => {},
        getStore: async () => null,
        deductInventoryQuantity: async () => {},
        restoreInventoryQuantity: async () => {},
        refreshData: async () => {},
        getStockLevels: () => [],
        toggleLowStockAlerts: async () => {},
        updateLowStockThreshold: () => {},
        updateDefaultCommissionRate: async () => {},
        updateCurrency: async () => {},
        sync: async () => ({ success: false, errors: ['No store ID'], synced: { uploaded: 0, downloaded: 0 }, conflicts: 0 }),
        fullResync: async () => ({ success: false, errors: ['No store ID'], synced: { uploaded: 0, downloaded: 0 }, conflicts: 0 }),
        debouncedSync: () => {},
        getSyncStatus: () => ({ isOnline: false, lastSync: null, unsyncedCount: 0, isSyncing: false, isAutoSyncing: false }),
        validateAndCleanData: async () => ({ cleaned: 0, report: {} }),
        canUndo: false,
        undoLastAction: async () => false,
        pushUndo: () => {},
        testUndo: () => {}
      }}>
        {children}
      </OfflineDataContext.Provider>
    );
  }

  return (
    <OfflineDataContext.Provider value={{
      // Data - exact match
      storeId,
      products,
      suppliers,
      expenseCategories,
      customers,
      sales,
      inventory,
      inventoryBills,
      transactions,
      bills,
      billLineItems,
      billAuditLogs,


      // Computed/legacy compatibility - exact match
      stockLevels,
      setStockLevels,
      lowStockAlertsEnabled,
      lowStockThreshold,
      defaultCommissionRate,
      currency,
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
      addInventoryItem,
      updateInventoryItem,
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