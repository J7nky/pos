import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { useSupabaseAuth } from './SupabaseAuthContext';
import { useNetworkStatus } from '../hooks/useNetworkStatus';
import { useLocalStorage } from '../hooks/useLocalStorage';
import { Database } from '../types/database';
import { 
  db, 
  Product, 
  Supplier, 
  Customer, 
  InventoryItem, 
  Sale, 
  SaleItem, 
  Transaction, 
  ExpenseCategory,
  createBaseEntity,
  createId
} from '../lib/db';
import { syncService, SyncResult } from '../services/syncService';

type Tables = Database['public']['Tables'];

// Match exact SupabaseDataContext interface for seamless migration
interface OfflineDataContextType {
  // Data - matching exact structure
  products: Tables['products']['Row'][];
  suppliers: Tables['suppliers']['Row'][];
  customers: Tables['customers']['Row'][];
  sales: any[]; // Complex type with joins
  inventory: any[]; // Complex type with joins (mapped from inventoryItems)
  transactions: Tables['transactions']['Row'][];
  expenseCategories: Tables['expense_categories']['Row'][];

  // Computed/legacy compatibility - exact match
  stockLevels: any[];
  setStockLevels: (levels: any[]) => void;
  lowStockAlertsEnabled: boolean;
  lowStockThreshold: number;
  defaultCommissionRate: number;
  currency: 'USD' | 'LBP';
  cashDrawer: any;
  openCashDrawer: (amount: number, openedBy: string) => void;
  accountsReceivable: any[];
  accountsPayable: any[];
  journalEntries: any[];
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
  };

  // CRUD operations - exact function signatures
  addProduct: (product: Omit<Tables['products']['Insert'], 'store_id'>) => Promise<void>;
  addSupplier: (supplier: Omit<Tables['suppliers']['Insert'], 'store_id'>) => Promise<void>;
  addCustomer: (customer: Omit<Tables['customers']['Insert'], 'store_id'>) => Promise<void>;
  updateCustomer: (id: string, updates: Tables['customers']['Update']) => Promise<void>;
  addInventoryItem: (item: Omit<Tables['inventory_items']['Insert'], 'store_id'>) => Promise<void>;
  addSale: (sale: Omit<Tables['sales']['Insert'], 'store_id'>, items: Omit<Tables['sale_items']['Insert'], 'sale_id'>[]) => Promise<void>;
  addTransaction: (transaction: Omit<Tables['transactions']['Insert'], 'store_id'>) => Promise<void>;
  addExpenseCategory: (category: Omit<Tables['expense_categories']['Insert'], 'store_id'>) => Promise<void>;

  // Utility functions - exact match
  refreshData: () => Promise<void>;
  getStockLevels: () => any[];
  toggleLowStockAlerts: (enabled: boolean) => void;
  updateLowStockThreshold: (threshold: number) => void;
  updateDefaultCommissionRate: (rate: number) => void;
  updateCurrency: (currency: 'USD' | 'LBP') => void;

  // Additional offline-specific features
  sync: () => Promise<SyncResult>;
  fullResync: () => Promise<SyncResult>;
  getSyncStatus: () => {
    isOnline: boolean;
    lastSync: Date | null;
    unsyncedCount: number;
    isSyncing: boolean;
    isAutoSyncing: boolean;
  };
  validateAndCleanData: () => Promise<{ cleaned: number; report: any }>;
}

const OfflineDataContext = createContext<OfflineDataContextType | undefined>(undefined);

export function OfflineDataProvider({ children }: { children: ReactNode }) {
  const { userProfile } = useSupabaseAuth();
  const { isOnline, justCameOnline } = useNetworkStatus();
  const storeId = userProfile?.store_id;

  // Data states - matching SupabaseDataContext structure
  const [products, setProducts] = useState<Tables['products']['Row'][]>([]);
  const [suppliers, setSuppliers] = useState<Tables['suppliers']['Row'][]>([]);
  const [customers, setCustomers] = useState<Tables['customers']['Row'][]>([]);
  const [sales, setSales] = useState<any[]>([]);
  const [inventory, setInventory] = useState<any[]>([]);
  const [transactions, setTransactions] = useState<Tables['transactions']['Row'][]>([]);
  const [expenseCategories, setExpenseCategories] = useState<Tables['expense_categories']['Row'][]>([]);

  // Raw internal data
  const [inventoryItems, setInventoryItems] = useState<InventoryItem[]>([]);
  const [saleItems, setSaleItems] = useState<SaleItem[]>([]);

  // Loading states - exact match
  const [loading, setLoading] = useState({
    sync: false,
    products: false,
    suppliers: false,
    customers: false,
    sales: false,
    inventory: false,
    transactions: false,
    expenseCategories: false
  });

  // Sync state
  const [lastSync, setLastSync] = useState<Date | null>(null);
  const [unsyncedCount, setUnsyncedCount] = useState(0);
  const [isSyncing, setIsSyncing] = useState(false);
  const [isAutoSyncing, setIsAutoSyncing] = useState(false);
  
  // Debounced sync to prevent excessive sync calls during rapid changes
  const [debouncedSyncTimeout, setDebouncedSyncTimeout] = useState<NodeJS.Timeout | null>(null);

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

  // Initialize data when store is available
  useEffect(() => {
    if (storeId) {
      // Clean up any invalid/orphaned data first
      Promise.all([
        db.cleanupInvalidInventoryItems(),
        db.cleanupOrphanedRecords(storeId)
      ]).then(([invalidCleaned, orphanedCleaned]) => {
        if (invalidCleaned > 0 || orphanedCleaned > 0) {
          console.log(`🧹 Total cleanup: ${invalidCleaned + orphanedCleaned} records removed`);
        }
        refreshData();
        updateUnsyncedCount();
      }).catch(error => {
        console.error('❌ Cleanup failed:', error);
        // Still proceed with normal initialization
        refreshData();
        updateUnsyncedCount();
      });
    }
  }, [storeId]);

  // Auto-sync when connection is restored
  useEffect(() => {
    if (justCameOnline && storeId && !isSyncing) {
      console.log('🌐 Connection restored - auto-syncing...');
      performSync(true); // Mark as automatic sync
    }
  }, [justCameOnline, storeId, isSyncing]);

  // Enhanced periodic auto-sync when online
  useEffect(() => {
    if (isOnline && storeId && !isSyncing) {
      // Auto-sync every 30 seconds when online and has unsynced data
      const interval = setInterval(() => {
        if (!syncService.isCurrentlyRunning() && unsyncedCount > 0) {
          console.log('⏰ Periodic auto-sync triggered');
          performSync(true); // Mark as automatic sync
        }
      }, 30000); // Reduced from 60s to 30s for better responsiveness

      return () => clearInterval(interval);
    }
  }, [isOnline, storeId, isSyncing, unsyncedCount]);

  // Auto-sync on window focus when online (for when user returns to tab)
  useEffect(() => {
    const handleFocus = () => {
      if (isOnline && storeId && !isSyncing && unsyncedCount > 0) {
        console.log('👀 Window focused - auto-syncing...');
        performSync(true);
      }
    };

    const handleVisibilityChange = () => {
      if (!document.hidden && isOnline && storeId && !isSyncing && unsyncedCount > 0) {
        console.log('👁️ Page became visible - auto-syncing...');
        performSync(true);
      }
    };

    window.addEventListener('focus', handleFocus);
    document.addEventListener('visibilitychange', handleVisibilityChange);

    return () => {
      window.removeEventListener('focus', handleFocus);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [isOnline, storeId, isSyncing, unsyncedCount]);

  // Update stock levels when inventory, products, or suppliers change
  useEffect(() => {
    updateStockLevels();
  }, [inventoryItems, products, suppliers, lowStockAlertsEnabled, lowStockThreshold]);

  const refreshData = async () => {
    if (!storeId) return;

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
        expenseCategoriesData
      ] = await Promise.all([
        db.products.where('store_id').equals(storeId).filter(item => !item._deleted).toArray(),
        db.suppliers.where('store_id').equals(storeId).filter(item => !item._deleted).toArray(),
        db.customers.where('store_id').equals(storeId).filter(item => !item._deleted).toArray(),
        db.inventory_items.where('store_id').equals(storeId).filter(item => !item._deleted).toArray(),
        db.sales.where('store_id').equals(storeId).filter(item => !item._deleted).toArray(),
        db.sale_items.filter(item => !item._deleted).toArray(),
        db.transactions.where('store_id').equals(storeId).filter(item => !item._deleted).toArray(),
        db.expense_categories.where('store_id').equals(storeId).filter(item => !item._deleted).toArray()
      ]);

      // Transform data to match SupabaseDataContext structure
      setProducts(productsData as Tables['products']['Row'][]);
      setSuppliers(suppliersData as Tables['suppliers']['Row'][]);
      setCustomers(customersData as Tables['customers']['Row'][]);
      setTransactions(transactionsData as Tables['transactions']['Row'][]);
      setExpenseCategories(expenseCategoriesData as Tables['expense_categories']['Row'][]);

      // Store raw data
      setInventoryItems(inventoryData);
      setSaleItems(saleItemsData);

      // Transform inventory to match expected structure
      setInventory(inventoryData.map(item => ({
        ...item,
        receivedAt: item.received_at // Legacy compatibility
      })));

      // Transform sales with joined data
      const salesWithItems = await Promise.all(
        salesData.map(async (sale) => {
          const items = saleItemsData.filter(item => item.sale_id === sale.id);
          const customer = customersData.find(c => c.id === sale.customer_id);
          
          return {
            ...sale,
            items,
            customer,
            createdAt: sale.created_at // Legacy compatibility
          };
        })
      );
      setSales(salesWithItems);

    } catch (error) {
      console.error('Error loading data from Dexie:', error);
    }
  };

  const updateUnsyncedCount = async () => {
    try {
      const counts = await Promise.all([
        db.products.filter(item => !item._synced).count(),
        db.suppliers.filter(item => !item._synced).count(),
        db.customers.filter(item => !item._synced).count(),
        db.inventory_items.filter(item => !item._synced).count(),
        db.sales.filter(item => !item._synced).count(),
        db.sale_items.filter(item => !item._synced).count(),
        db.transactions.filter(item => !item._synced).count(),
        db.expense_categories.filter(item => !item._synced).count()
      ]);
      setUnsyncedCount(counts.reduce((sum, count) => sum + count, 0));
    } catch (error) {
      console.error('Error counting unsynced records:', error);
    }
  };

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
    
    // Set new timeout for 2 seconds
    const timeout = setTimeout(() => {
      if (isOnline && !isSyncing && unsyncedCount > 0) {
        console.log('🔄 Debounced auto-sync triggered');
        performSync(true); // Mark as automatic sync
      }
      setDebouncedSyncTimeout(null);
    }, 2000);
    
    setDebouncedSyncTimeout(timeout);
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

    // Use debounced sync to batch rapid changes
    debouncedSync();
  };

  const addCustomer = async (customerData: Omit<Tables['customers']['Insert'], 'store_id'>): Promise<void> => {
    if (!storeId) throw new Error('No store ID available');

    const customer: Customer = {
      ...createBaseEntity(storeId),
      current_debt: 0,
      is_active: true,
      ...customerData
    } as Customer;

    await db.customers.add(customer);
    await refreshData();
    await updateUnsyncedCount();

    // Use debounced sync to batch rapid changes
    debouncedSync();
  };

  const updateCustomer = async (id: string, updates: Tables['customers']['Update']): Promise<void> => {
    await db.customers.update(id, { ...updates, _synced: false });
    await refreshData();
    await updateUnsyncedCount();
    
    // Use debounced sync to batch rapid changes
    debouncedSync();
  };

  const addInventoryItem = async (itemData: Omit<Tables['inventory_items']['Insert'], 'store_id'>): Promise<void> => {
    if (!storeId) throw new Error('No store ID available');

    const item: InventoryItem = {
      id: createId(),
      store_id: storeId,
      created_at: new Date().toISOString(),
      received_at: itemData.received_at || new Date().toISOString(),
      _synced: false,
      ...itemData,
      weight: itemData.weight ?? null,
      porterage: itemData.porterage ?? null,
      transfer_fee: itemData.transfer_fee ?? null,
      price: itemData.price ?? null,
      commission_rate: itemData.commission_rate ?? null,
      notes: itemData.notes ?? null
    };

    await db.inventory_items.add(item);
    await refreshData();
    await updateUnsyncedCount();

    // Use debounced sync to batch rapid changes
    debouncedSync();
  };

  const addSale = async (
    saleData: Omit<Tables['sales']['Insert'], 'store_id'>, 
    items: Omit<Tables['sale_items']['Insert'], 'sale_id'>[]
  ): Promise<void> => {
    if (!storeId) throw new Error('No store ID available');

    const saleId = createId();
    const sale: Sale = {
      id: saleId,
      store_id: storeId,
      created_at: new Date().toISOString(),
      _synced: false,
      ...saleData,
      customer_id: saleData.customer_id ?? null,
      notes: saleData.notes ?? null
    };

    const saleItemsWithIds = items.map(item => ({
      id: createId(),
      sale_id: saleId,
      created_at: new Date().toISOString(),
      _synced: false,
      ...item,
      weight: item.weight ?? null,
      notes: item.notes ?? null
    }));

    // Use transaction to ensure atomicity
    await db.transaction('rw', [db.sales, db.sale_items, db.inventory_items], async () => {
      await db.sales.add(sale);
      await db.sale_items.bulkAdd(saleItemsWithIds);

      // Deduct inventory (simplified FIFO)
      for (const item of items) {
        const inventoryRecords = await db.inventory_items
          .where('product_id')
          .equals(item.product_id)
          .and(inv => inv.supplier_id === item.supplier_id && inv.quantity > 0)
          .sortBy('received_at');

        let qtyToDeduct = item.quantity;
        for (const inv of inventoryRecords) {
          if (qtyToDeduct <= 0) break;
          
          const deduct = Math.min(inv.quantity, qtyToDeduct);
          const newQuantity = inv.quantity - deduct;
          
          if (newQuantity <= 0) {
            // Delete inventory item when quantity reaches 0 or below
            await db.inventory_items.delete(inv.id);
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
    });

    await refreshData();
    await updateUnsyncedCount();

    // Use debounced sync to batch rapid changes
    debouncedSync();
  };

  const addTransaction = async (transactionData: Omit<Tables['transactions']['Insert'], 'store_id'>): Promise<void> => {
    if (!storeId) throw new Error('No store ID available');

    const transaction: Transaction = {
      id: createId(),
      store_id: storeId,
      created_at: new Date().toISOString(),
      _synced: false,
      ...transactionData,
      reference: transactionData.reference ?? null
    };

    await db.transactions.add(transaction);
    await refreshData();
    await updateUnsyncedCount();

    // Use debounced sync to batch rapid changes
    debouncedSync();
  };

  const addExpenseCategory = async (categoryData: Omit<Tables['expense_categories']['Insert'], 'store_id'>): Promise<void> => {
    if (!storeId) throw new Error('No store ID available');

    const category: ExpenseCategory = {
      ...createBaseEntity(storeId),
      is_active: true,
      ...categoryData
    } as ExpenseCategory;

    await db.expense_categories.add(category);
    await refreshData();
    await updateUnsyncedCount();

    // Use debounced sync to batch rapid changes
    debouncedSync();
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

  const openCashDrawer = (amount: number, openedBy: string) => {
    const drawer = {
      id: createId(),
      openingAmount: amount,
      currentAmount: amount,
      openedBy,
      openedAt: new Date().toISOString(),
      isOpen: true
    };
    setCashDrawer(drawer);
    localStorage.setItem('erp_cash_drawer', JSON.stringify(drawer));
  };

  const getStockLevels = () => stockLevels;

  const toggleLowStockAlerts = (enabled: boolean) => {
    setLowStockAlertsEnabled(enabled);
  };

  const updateLowStockThreshold = (threshold: number) => {
    setLowStockThreshold(threshold);
  };

  const updateDefaultCommissionRate = (rate: number) => {
    setDefaultCommissionRate(rate);
  };

  const updateCurrency = (newCurrency: 'USD' | 'LBP') => {
    setCurrency(newCurrency);
  };

  return (
    <OfflineDataContext.Provider value={{
      // Data - exact match
      products,
      suppliers,
      customers,
      sales,
      inventory,
      transactions,
      expenseCategories,

      // Computed/legacy compatibility - exact match
      stockLevels,
      setStockLevels,
      lowStockAlertsEnabled,
      lowStockThreshold,
      defaultCommissionRate,
      currency,
      cashDrawer,
      openCashDrawer,
      accountsReceivable: [], // Stub
      accountsPayable: [], // Stub
      journalEntries: [], // Stub
      isOnline,

      // Loading states - exact match
      loading,

      // CRUD operations - exact signatures
      addProduct,
      addSupplier,
      addCustomer,
      updateCustomer,
      addInventoryItem,
      addSale,
      addTransaction,
      addExpenseCategory,

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
      getSyncStatus,
      validateAndCleanData
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
