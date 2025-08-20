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
  storeId: any;
  // Data - matching exact structure
  products: Tables['products']['Row'][];
  suppliers: Tables['suppliers']['Row'][];
  customers: Tables['customers']['Row'][];
  sales: Tables['sale_items']['Row'][]; // Direct sale_items data
  inventory: any[]; // Complex type with joins (mapped from inventoryItems)
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
  addInventoryItem: (item: Omit<Tables['inventory_items']['Insert'], 'store_id'>) => Promise<void>;
  addInventoryBatch: (args: {
    supplier_id: string;
    created_by: string;
    status?: string | null;
    porterage?: number | null;
    transfer_fee?: number | null;
    received_at?: string;
    items: Array<Omit<Tables['inventory_items']['Insert'], 'store_id' | 'received_by' | 'received_at'>>;
  }) => Promise<{ batchId: string }>;
  addSale: (items: any[]) => Promise<void>;
  updateSale: (id: string, updates: Partial<Tables['sale_items']['Update']>) => Promise<void>;
  deleteSale: (id: string) => Promise<void>;
  addTransaction: (transaction: Omit<Tables['transactions']['Insert'], 'store_id'>) => Promise<void>;
  addExpenseCategory: (category: any) => Promise<void>;
  updateInventoryBatch: (id: string, updates: Tables['inventory_batches']['Update']) => Promise<void>;
  applyCommissionRateToBatch: (batchId: string, commissionRate: number) => Promise<void>;
  
  // Bill management operations
  createBill: (billData: any, lineItems: any[]) => Promise<string>;
  updateBill: (billId: string, updates: any, changedBy: string, changeReason?: string) => Promise<void>;
  deleteBill: (billId: string, deletedBy: string, deleteReason?: string, softDelete?: boolean) => Promise<void>;
  getBills: (filters?: any) => Promise<any[]>;
  getBillDetails: (billId: string) => Promise<any | null>;
  createBillAuditLog: (auditData: any) => Promise<void>;
  

  deductInventoryQuantity: (productId: string, supplierId: string, quantity: number) => Promise<void>;
  restoreInventoryQuantity: (productId: string, supplierId: string, quantity: number) => Promise<void>;
  
  // Utility functions - exact match
  refreshData: () => Promise<void>;
  getStockLevels: () => any[];
  toggleLowStockAlerts: (enabled: boolean) => void;
  updateLowStockThreshold: (threshold: number) => void;
  updateDefaultCommissionRate: (rate: number) => void;
  updateCurrency: (newCurrency: 'USD' | 'LBP') => void;
  
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
  const [expenseCategories, setExpenseCategories] = useState<any[]>([]);

  // Raw internal data
  const [inventoryItems, setInventoryItems] = useState<InventoryItem[]>([]);
  const [saleItems, setSaleItems] = useState<SaleItem[]>([]);
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
      initializeData();
    }
  }, [storeId]);

  const initializeData = async () => {
    if (!storeId) return;

    try {
      // Clean up any invalid/orphaned data first
      const [invalidCleaned, orphanedCleaned] = await Promise.all([
        db.cleanupInvalidInventoryItems(),
        db.cleanupOrphanedRecords(storeId)
      ]);

      if (invalidCleaned > 0 || orphanedCleaned > 0) {
        console.log(`🧹 Total cleanup: ${invalidCleaned + orphanedCleaned} records removed`);
      }

      // Load local data first
      await refreshData();
      await updateUnsyncedCount();

      // Check if local database is empty (no essential data)
      const [productCount, supplierCount, customerCount] = await Promise.all([
        db.products.where('store_id').equals(storeId).filter(item => !item._deleted).count(),
        db.suppliers.where('store_id').equals(storeId).filter(item => !item._deleted).count(),
        db.customers.where('store_id').equals(storeId).filter(item => !item._deleted).count()
      ]);

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

  // Enhanced periodic auto-sync when online
  useEffect(() => {
    if (isOnline && storeId && !isSyncing) {
      // Auto-sync every 15 seconds when online and has unsynced data
      const interval = setInterval(() => {
        if (!syncService.isCurrentlyRunning() && unsyncedCount > 0) {
          console.log('⏰ Periodic auto-sync triggered');
          performSync(true); // Mark as automatic sync
        }
      }, 15000); // Reduced from 30s to 15s for faster sync of critical data

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
        batchesData,
        billsData,
        billLineItemsData,
        billAuditLogsData,
      ] = await Promise.all([
        db.products.where('store_id').equals(storeId).filter(item => !item._deleted).toArray(),
        db.suppliers.where('store_id').equals(storeId).filter(item => !item._deleted).toArray(),
        db.customers.where('store_id').equals(storeId).filter(item => !item._deleted).toArray(),
        db.inventory_items.where('store_id').equals(storeId).filter(item => !item._deleted).toArray(),
        Promise.resolve([]), // sales not in current schema
        db.sale_items.filter(item => !item._deleted).toArray(),
        db.transactions.where('store_id').equals(storeId).filter(item => !item._deleted).toArray(),
        db.inventory_batches.where('store_id').equals(storeId).filter(item => !item._deleted).toArray(),
        db.bills.where('store_id').equals(storeId).filter(item => !item._deleted).toArray(),
        db.bill_line_items.where('store_id').equals(storeId).filter(item => !item._deleted).toArray(),
        db.bill_audit_logs.where('store_id').equals(storeId).filter(item => !item._deleted).toArray(),

      ]);

      // Transform data to match SupabaseDataContext structure
      setProducts(productsData as Tables['products']['Row'][]);
      setSuppliers(suppliersData.map(s => ({ ...s, lb_balance: s.lb_balance || 0, usd_balance: s.usd_balance || 0 })) as Tables['suppliers']['Row'][]);
      setCustomers(customersData.map(c => ({ ...c, lb_balance: c.lb_balance || 0, usd_balance: c.usd_balance || 0 })) as Tables['customers']['Row'][]);
      setTransactions(transactionsData as unknown as Tables['transactions']['Row'][]);

      // Store raw data
      setInventoryItems(inventoryData);
      setSaleItems(saleItemsData);
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
          receivedAt: item.received_at, // Legacy compatibility
          batch_porterage: batch ? batch.porterage : null,
          batch_transfer_fee: batch ? batch.transfer_fee : null,
          batch_status: batch ? batch.status : 'Created',
        };
      }));

      // Set sales directly as sale_items (no transformation needed)
      setSales(saleItemsData);

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
        Promise.resolve(0), // sales not in current schema
        db.sale_items.filter(item => !item._synced).count(),
        db.transactions.filter(item => !item._synced).count(),

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

    const bill = {
      id: billId,
      store_id: storeId,
      created_at: now,
      updated_at: now,
      _synced: false,
      ...billData
    };

    const mappedLineItems = lineItems.map(item => ({
      id: createId(),
      bill_id: billId,
      store_id: storeId,
      created_at: now,
      _synced: false,
      ...item
    }));

    // Try to create in Supabase first if online
    if (isOnline) {
      try {
        const { SupabaseService } = await import('../services/supabaseService');
        const supabaseBill = await SupabaseService.createBill(bill, mappedLineItems);
        if (supabaseBill) {
          // Update local bill with Supabase ID and mark as synced
          bill.id = supabaseBill.id;
          bill._synced = true;
          mappedLineItems.forEach(item => {
            item._synced = true;
          });
        }
      } catch (error) {
        console.warn('Failed to create bill in Supabase, falling back to local only:', error);
      }
    }

    await db.transaction('rw', [db.bills, db.bill_line_items], async () => {
      await db.bills.add(bill);
      if (mappedLineItems.length > 0) {
        await db.bill_line_items.bulkAdd(mappedLineItems);
      }
    });

    await refreshData();
    await updateUnsyncedCount();
    debouncedSync();

    return billId;
  };

  const updateBill = async (billId: string, updates: any, changedBy: string, changeReason?: string): Promise<void> => {
    if (!storeId) throw new Error('No store ID available');

    const now = new Date().toISOString();
    
    // Try to update in Supabase first if online
    if (isOnline) {
      try {
        const { SupabaseService } = await import('../services/supabaseService');
        await SupabaseService.updateBill(billId, updates);
        
        // Create audit log in Supabase
        const auditLog = {
          bill_id: billId,
          store_id: storeId,
          action: 'update',
          changed_by: changedBy,
          change_reason: changeReason || null,
          field_changed: Object.keys(updates).join(', '),
          old_value: null,
          new_value: JSON.stringify(updates),
          created_at: now
        };
        
        await SupabaseService.createBillAuditLog(auditLog);
      } catch (error) {
        console.warn('Failed to update bill in Supabase, falling back to local only:', error);
      }
    }
    
    await db.transaction('rw', [db.bills, db.bill_audit_logs], async () => {
      await db.bills.update(billId, {
        ...updates,
        updated_at: now,
        _synced: isOnline // Mark as synced if we successfully updated in Supabase
      });

      // Create audit log
      const auditLog = {
        id: createId(),
        bill_id: billId,
        store_id: storeId,
        action: 'update' as const,
        changed_by: changedBy,
        change_reason: changeReason || null,
        field_changed: 'multiple_fields',
        old_value: null,
        new_value: JSON.stringify(updates),
        ip_address: null,
        created_at: now,
        updated_at: now,
        _synced: isOnline // Mark as synced if we successfully updated in Supabase
      };
      
      await db.bill_audit_logs.add(auditLog);
    });

    await refreshData();
    await updateUnsyncedCount();
    debouncedSync();
  };

  const deleteBill = async (billId: string, deletedBy: string, deleteReason?: string, softDelete = true): Promise<void> => {
    if (!storeId) throw new Error('No store ID available');

    const now = new Date().toISOString();

    // Try to delete in Supabase first if online
    if (isOnline) {
      try {
        const { SupabaseService } = await import('../services/supabaseService');
        await SupabaseService.deleteBill(billId, softDelete);
        
        // Create audit log in Supabase
        const auditLog = {
          bill_id: billId,
          store_id: storeId,
          action: 'delete',
          changed_by: deletedBy,
          change_reason: deleteReason || null,
          field_changed: 'status',
          old_value: 'active',
          new_value: softDelete ? 'cancelled' : 'deleted',
          created_at: now
        };
        
        await SupabaseService.createBillAuditLog(auditLog);
      } catch (error) {
        console.warn('Failed to delete bill in Supabase, falling back to local only:', error);
      }
    }

    await db.transaction('rw', [db.bills, db.bill_line_items, db.bill_audit_logs], async () => {
      if (softDelete) {
        // Soft delete - mark as deleted
        await db.bills.update(billId, {
          _deleted: true,
          updated_at: now,
          _synced: isOnline // Mark as synced if we successfully deleted in Supabase
        });
        
        // Also soft delete line items
        const lineItems = await db.bill_line_items.where('bill_id').equals(billId).toArray();
        for (const item of lineItems) {
          await db.bill_line_items.update(item.id, {
            _deleted: true,
            _synced: isOnline // Mark as synced if we successfully deleted in Supabase
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
        action: 'delete',
        changed_by: deletedBy,
        change_reason: deleteReason || null,
        changes: JSON.stringify({ deleted: true, soft_delete: softDelete }),
        created_at: now,
        _synced: isOnline // Mark as synced if we successfully deleted in Supabase
      };
      
      await db.bill_audit_logs.add(auditLog);
    });

    await refreshData();
    await updateUnsyncedCount();
    debouncedSync();
  };

  const getBills = async (filters?: any): Promise<any[]> => {
    if (!storeId) return [];

    // Try to get bills from Supabase first if online
    if (isOnline) {
      try {
        const { SupabaseService } = await import('../services/supabaseService');
        const supabaseBills = await SupabaseService.getBills(storeId, filters);
        
        if (supabaseBills && supabaseBills.length > 0) {
          // Store Supabase bills in local database for offline access
          for (const supabaseBill of supabaseBills) {
            const existingBill = await db.bills.get(supabaseBill.id);
            if (!existingBill) {
              // Add new bill from Supabase
              await db.bills.add({
                ...supabaseBill,
                _synced: true
              });
            } else if (existingBill.updated_at !== supabaseBill.updated_at) {
              // Update existing bill with Supabase data
              await db.bills.update(supabaseBill.id, {
                ...supabaseBill,
                _synced: true
              });
            }
          }
        }
      } catch (error) {
        console.warn('Failed to get bills from Supabase, using local data:', error);
      }
    }

    let query = db.bills.where('store_id').equals(storeId).filter(bill => !bill._deleted);
    
    // Apply filters if provided
    if (filters) {
      if (filters.status) {
        query = query.and(bill => bill.status === filters.status);
      }
      if (filters.supplier_id) {
        query = query.and(bill => bill.supplier_id === filters.supplier_id);
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

    // Try to get bill details from Supabase first if online
    if (isOnline) {
      try {
        const { SupabaseService } = await import('../services/supabaseService');
        const supabaseBillDetails = await SupabaseService.getBillDetails(billId);
        
        if (supabaseBillDetails) {
          // Update local bill with Supabase data
          await db.bills.update(billId, {
            ...supabaseBillDetails,
            _synced: true
          });
          
          // Update line items
          if (supabaseBillDetails.bill_line_items) {
            for (const lineItem of supabaseBillDetails.bill_line_items) {
              const existingItem = await db.bill_line_items.get(lineItem.id);
              if (!existingItem) {
                await db.bill_line_items.add({
                  ...lineItem,
                  _synced: true
                });
              } else {
                await db.bill_line_items.update(lineItem.id, {
                  ...lineItem,
                  _synced: true
                });
              }
            }
          }
          
          // Update audit logs
          if (supabaseBillDetails.bill_audit_logs) {
            for (const auditLog of supabaseBillDetails.bill_audit_logs) {
              const existingLog = await db.bill_audit_logs.get(auditLog.id);
              if (!existingLog) {
                await db.bill_audit_logs.add({
                  ...auditLog,
                  _synced: true
                });
              } else {
                await db.bill_audit_logs.update(auditLog.id, {
                  ...auditLog,
                  _synced: true
                });
              }
            }
          }
        }
      } catch (error) {
        console.warn('Failed to get bill details from Supabase, using local data:', error);
      }
    }

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

    return {
      ...bill,
      line_items: lineItems,
      audit_logs: auditLogs
    };
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
      balance: 0, // Changed from current_debt to balance to match Supabase schema
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

  const updateSupplier = async (id: string, updates: Tables['suppliers']['Update']): Promise<void> => {
    await db.suppliers.update(id, { ...updates, _synced: false });
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
      commission_rate: itemData.commission_rate ?? 0,
      status: itemData.status ?? 'Created',
      batch_id: itemData.batch_id ?? null
    };

    await db.inventory_items.add(item);
    await refreshData();
    await updateUnsyncedCount();

    // Use debounced sync to batch rapid changes
    debouncedSync();
  };

  const addInventoryBatch: OfflineDataContextType['addInventoryBatch'] = async ({
    supplier_id,
    created_by,
    status = 'Created', 
    porterage = null,
    transfer_fee = null,
    received_at,
    items
  }) => {
    if (!storeId) throw new Error('No store ID available');
    if (!items || items.length === 0) throw new Error('No items provided');

    const batchId = createId();
    const batchRecord = {
      id: batchId,
      supplier_id,
      status,
      porterage,
      transfer_fee,
      received_at: received_at || new Date().toISOString(),
      store_id: storeId,
      created_by,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      _synced: false
    } as any;

    // For now, we just persist batch locally; sync service currently does not upload batches
    // but storing locally allows future extension and UI references.
    await db.transaction('rw', [db.inventory_batches, db.inventory_items], async () => {
      await db.inventory_batches.add(batchRecord);

      const now = new Date().toISOString();
      const receiveTs = received_at || now;

      const mappedItems = items.map((it) => ({
        id: createId(),
        store_id: storeId,
        created_at: now,
        received_at: receiveTs,
        _synced: false,
        ...it,
        supplier_id,
        received_by: created_by,
        weight: it.weight ?? null,
        porterage: it.porterage ?? null,
        transfer_fee: it.transfer_fee ?? null,
        price: it.price ?? null,
        commission_rate: it.commission_rate ?? 0,
        status: it.status ?? 'Created',
        received_quantity: it.received_quantity ?? it.quantity,
        batch_id: batchId as string | null
      }));

      await db.inventory_items.bulkAdd(mappedItems);
    });

    await refreshData();
    await updateUnsyncedCount();
    debouncedSync();

    return { batchId };
  };

  const addSale = async (
   
    items: any[]
  ): Promise<void> => {
    if (!storeId) throw new Error('No store ID available');
    const saleItemsWithIds = items.map(item => ({
      id: createId(),
      quantity: item.quantity,
      created_at: new Date().toISOString(),
      _synced: false,
      inventory_item_id: item.inventory_item_id || item.id || '', // Added to match Supabase schema
      product_id: item.product_id,
      supplier_id: item.supplier_id,
      // Remove supplier_name - doesn't exist in Supabase schema
      weight: item.weight ?? null,
      unit_price: item.unit_price,
      // Remove total_price - doesn't exist in Supabase schema, use received_value instead
      received_value: item.received_value || item.total_price || (item.unit_price * item.quantity),
      payment_method: item.payment_method || 'cash', // Add payment method field
        notes: item.notes ?? null,
      store_id: storeId,
      customer_id: item.customer_id ?? null,
      created_by: item.created_by || 'system'
    }));

    // if (items.some(item => item.payment_method === 'credit') ||  items.some(item =>( item.received_value < item.unit_price * item.quantity) && item.payment_method !== 'credit')) {
    //   const creditItems = items.filter(item => item.payment_method === 'credit' || item.received_value < item.unit_price * item.quantity);
    //   const creditAmount = creditItems.reduce((sum, item) => sum + item.received_value, 0);
    //   const customer = await db.customers.get(creditItems[0].customer_id);

    
    // }

    // Use transaction to ensure atomicity
    await db.transaction('rw', [db.sale_items, db.inventory_items], async () => {

      
      await db.sale_items.bulkAdd(saleItemsWithIds);
      
      // Add the value of the sale to the supplier's balance
      // Add the value of the credit to the customer's balance
  
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

    await refreshData();
    await updateUnsyncedCount();

    // Use debounced sync to batch rapid changes
    debouncedSync();
  };

  const updateSale = async (id: string, updates: Partial<Tables['sale_items']['Update']>): Promise<void> => {
    if (!storeId) throw new Error('No store ID available');

    // Get the original sale item to compare quantities
    const originalSale = await db.sale_items.get(id);
    if (!originalSale) throw new Error('Sale item not found');

    // Check if quantity has changed
    const quantityChanged = updates.quantity !== undefined && updates.quantity !== originalSale.quantity;
    const quantityDifference = quantityChanged ? (updates.quantity || 0) - (originalSale.quantity || 0) : 0;

    // Use transaction to ensure atomicity
    await db.transaction('rw', [db.sale_items, db.inventory_items], async () => {
      // Update the sale item
      const updateData = {
        ...updates,
        _synced: false
      };
      await db.sale_items.update(id, updateData);

      // Handle inventory adjustments if quantity changed
      if (quantityChanged && originalSale.product_id && originalSale.supplier_id) {
        if (quantityDifference > 0) {
          // Quantity increased - deduct additional inventory
          await deductInventoryQuantity(originalSale.product_id, originalSale.supplier_id, quantityDifference);
        } else if (quantityDifference < 0) {
          // Quantity decreased - restore inventory
          await restoreInventoryQuantity(originalSale.product_id, originalSale.supplier_id, Math.abs(quantityDifference));
        }
      }
    });

    await refreshData();
    await updateUnsyncedCount();

    // Use debounced sync to batch rapid changes
    debouncedSync();
  };

  const deleteSale = async (id: string): Promise<void> => {
    if (!storeId) throw new Error('No store ID available');

    // Get the sale item before deletion to restore inventory
    const saleItem = await db.sale_items.get(id);
    if (!saleItem) throw new Error('Sale item not found');

    // Use transaction to ensure atomicity
    await db.transaction('rw', [db.sale_items, db.inventory_items], async () => {
      // Delete the sale item
      await db.sale_items.delete(id);
      
      // Restore inventory quantities
      if (saleItem.quantity && saleItem.quantity > 0) {
        await restoreInventoryQuantity(saleItem.product_id, saleItem.supplier_id, saleItem.quantity);
      }
    });

    await refreshData();
    await updateUnsyncedCount();

    // Use debounced sync to batch rapid changes
    debouncedSync();
  };

  const addTransaction = async (transactionData: Omit<Tables['transactions']['Insert'], 'store_id'>): Promise<void> => {
    if (!storeId) throw new Error('No store ID available');

    // Store amounts as-is in their original currency
    // We'll handle database precision issues only during sync to Supabase
    const transaction: Transaction = {
      id: createId(),
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

    // Use debounced sync to batch rapid changes
    debouncedSync();
  };

  const addExpenseCategory = async (categoryData: any): Promise<void> => {
    if (!storeId) throw new Error('No store ID available');

    // Expense categories not supported in current schema
    console.warn('Expense categories not supported in current schema');
    return;
  };

  const updateInventoryBatch = async (id: string, updates: Tables['inventory_batches']['Update']): Promise<void> => {
    await db.inventory_batches.update(id, { ...updates, _synced: false });
    await refreshData();
    await updateUnsyncedCount();
    debouncedSync();
  };

  const applyCommissionRateToBatch = async (batchId: string, commissionRate: number): Promise<void> => {
    const items = await db.inventory_items.where('batch_id').equals(batchId).toArray();
    await db.transaction('rw', [db.inventory_items], async () => {
      for (const it of items) {
        await db.inventory_items.update(it.id, { commission_rate: commissionRate, _synced: false });
      }
    });
    await refreshData();
    await updateUnsyncedCount();
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
          received_at: new Date().toISOString(),
          received_by: 'system', // Default user for restored inventory
          _synced: false,
          type: 'commission',
          unit: 'kg',
          weight: null,
          porterage: null,
          transfer_fee: null,
          price: null,
          commission_rate: 0,
          status  : 'Created',
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
      openCashDrawer,
      isOnline,

      // Loading states - exact match
      loading,

      // CRUD operations - exact signatures
      addProduct,
      addSupplier,
      addCustomer,
      updateCustomer,
      updateSupplier,
      addInventoryItem,
      addInventoryBatch,
      addSale,
      updateSale,
      deleteSale,
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
