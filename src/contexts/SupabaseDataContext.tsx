import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { SupabaseService } from '../services/supabaseService';
import { useSupabaseAuth } from './SupabaseAuthContext';
import { Database } from '../types/database';
import { useLocalStorage } from '../hooks/useLocalStorage';
import { supabase } from '../lib/supabase';

type Tables = Database['public']['Tables'];

interface SupabaseDataContextType {
  // Data
  products: Tables['products']['Row'][];
  suppliers: Tables['suppliers']['Row'][];
  customers: Tables['customers']['Row'][];
  sales: any[]; // Complex type with joins
  inventory: any[]; // Complex type with joins
  transactions: Tables['transactions']['Row'][];


  // Computed/legacy compatibility
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

  // Loading states
  loading: {
    products: boolean;
    suppliers: boolean;
    customers: boolean;
    sales: boolean;
    inventory: boolean;
    transactions: boolean;

  };

  // CRUD operations
  addProduct: (product: Omit<Tables['products']['Insert'], 'store_id'>) => Promise<void>;
  addSupplier: (supplier: Omit<Tables['suppliers']['Insert'], 'store_id'>) => Promise<void>;
  addCustomer: (customer: Omit<Tables['customers']['Insert'], 'store_id'>) => Promise<void>;
  updateCustomer: (id: string, updates: Tables['customers']['Update']) => Promise<void>;
  addInventoryItem: (item: Omit<Tables['inventory_items']['Insert'], 'store_id'>) => Promise<void>;
  addSale: (items: any[]) => Promise<void>;
  updateSale: (id: string, updates: Partial<Tables['sale_items']['Update']>) => Promise<void>;
  deleteSale: (id: string) => Promise<void>;
  addTransaction: (transaction: Omit<Tables['transactions']['Insert'], 'store_id'>) => Promise<void>;


  deductInventoryQuantity: (productId: string, supplierId: string, quantity: number) => Promise<void>;
  restoreInventoryQuantity: (productId: string, supplierId: string, quantity: number) => Promise<void>;

  // Utility functions
  refreshData: () => Promise<void>;
  getStockLevels: () => any[];
  toggleLowStockAlerts: (enabled: boolean) => void;
  updateLowStockThreshold: (threshold: number) => void;
  updateDefaultCommissionRate: (rate: number) => void;
  updateCurrency: (currency: 'USD' | 'LBP') => void;
  updateUserSettings: (userId: string, updates: {
    preferred_currency?: 'USD' | 'LBP';
    preferred_language?: 'en' | 'ar' | 'fr';
    preferred_commission_rate?: number;
  }) => Promise<void>;
}

const SupabaseDataContext = createContext<SupabaseDataContextType | undefined>(undefined);

export function SupabaseDataProvider({ children }: { children: ReactNode }) {
  console.log('SupabaseDataProvider: Rendering...');
  const { userProfile } = useSupabaseAuth();
  const storeId = userProfile?.store_id;
  // console.log('SupabaseDataProvider: userProfile:', userProfile, 'storeId:', storeId);

  // Data states
  const [products, setProducts] = useState<any[]>([]);
  const [suppliers, setSuppliers] = useState<any[]>([]);
  const [customers, setCustomers] = useState<any[]>([]);
  const [sales, setSales] = useState<any[]>([]);
  const [inventory, setInventory] = useState<any[]>([]);
  const [transactions, setTransactions] = useState<Tables['transactions']['Row'][]>([]);


  // Legacy/compatibility states
  const [lowStockAlertsEnabled, setLowStockAlertsEnabled] = useLocalStorage<boolean>('lowStockAlertsEnabled', true);
  const [lowStockThreshold, setLowStockThreshold] = useLocalStorage<number>('lowStockThreshold', 10);
  const [defaultCommissionRate, setDefaultCommissionRate] = useLocalStorage<number>('defaultCommissionRate', 10);
  const [currency, setCurrency] = useLocalStorage<'USD' | 'LBP'>('currency', 'USD');
  // --- Persist cashDrawer in localStorage ---
  const [cashDrawer, setCashDrawer] = useState<any>(() => {
    const stored = localStorage.getItem('erp_cash_drawer');
    return stored ? JSON.parse(stored) : null;
  });
  const [accountsReceivable] = useState<any[]>([]); // Stub
  const [accountsPayable] = useState<any[]>([]); // Stub
  const [journalEntries] = useState<any[]>([]); // Stub
  const [isOnline] = useState(true); // Always online for now

  // Loading states
  const [loading, setLoading] = useState({
    products: false,
    suppliers: false,
    customers: false,
    sales: false,
    inventory: false,
    transactions: false,
    expenseCategories: false
  });

  // Load all data when store is available
  useEffect(() => {
    if (storeId) {
      refreshData();
    }
  }, [storeId]);

  // Load user settings from database when userProfile changes
  useEffect(() => {
    if (userProfile) {
      // Load user preferences from database
      if (userProfile.preferred_currency) {
        setCurrency(userProfile.preferred_currency);
      }
      if (userProfile.preferred_commission_rate !== undefined) {
        setDefaultCommissionRate(userProfile.preferred_commission_rate);
      }
      // Note: lowStockAlertsEnabled and lowStockThreshold are not stored in database
      // They remain as local preferences
    }
  }, [userProfile]);

  const refreshData = async () => {
    if (!storeId) return;

    try {
      // Load all data in parallel
      const [
        productsData,
        suppliersData,
        customersData,
        salesData,
        inventoryData,
        
        transactionsData
      ] = await Promise.all([
        SupabaseService.getProducts(storeId),
        SupabaseService.getSuppliers(storeId),
        SupabaseService.getCustomers(storeId),
        SupabaseService.getSaleItems(storeId),
        SupabaseService.getInventoryItems(storeId),
        SupabaseService.getTransactions(storeId)
      ]);

      setProducts(productsData || []);
      setSuppliers(suppliersData || []);
      setCustomers(customersData || []);
      setSales(salesData || []);
      setInventory(inventoryData || []);
      setTransactions(transactionsData as any || []);
    } catch (error) {
      console.error('Error loading data:', error);
    }
  };

  // CRUD operations
  const addProduct = async (product: Omit<Tables['products']['Insert'], 'store_id'>) => {
    if (!storeId) return;
    
    setLoading(prev => ({ ...prev, products: true }));
    try {
      const newProduct = await SupabaseService.createProduct({ ...product, store_id: storeId });
      if (newProduct) {
        setProducts(prev => [...prev, newProduct]);
      }
    } catch (error) {
      console.error('Error adding product:', error);
      throw error;
    } finally {
      setLoading(prev => ({ ...prev, products: false }));
    }
  };

  const addSupplier = async (supplier: Omit<Tables['suppliers']['Insert'], 'store_id'>) => {
    if (!storeId) return;
    
    setLoading(prev => ({ ...prev, suppliers: true }));
    try {
      const newSupplier = await SupabaseService.createSupplier({ ...supplier, store_id: storeId });
      if (newSupplier) {
        setSuppliers(prev => [...prev, newSupplier]);
      }
    } catch (error) {
      console.error('Error adding supplier:', error);
      throw error;
    } finally {
      setLoading(prev => ({ ...prev, suppliers: false }));
    }
  };

  const addCustomer = async (customer: Omit<Tables['customers']['Insert'], 'store_id'>) => {
    if (!storeId) return;
    
    setLoading(prev => ({ ...prev, customers: true }));
    try {
      const newCustomer = await SupabaseService.createCustomer({ ...customer, store_id: storeId });
      if (newCustomer) {
        setCustomers(prev => [...prev, newCustomer]);
      }
    } catch (error) {
      console.error('Error adding customer:', error);
      throw error;
    } finally {
      setLoading(prev => ({ ...prev, customers: false }));
    }
  };

  const updateCustomer = async (id: string, updates: Tables['customers']['Update']) => {
    setLoading(prev => ({ ...prev, customers: true }));
    try {
      const updatedCustomer = await SupabaseService.updateCustomer(id, updates);
      if (updatedCustomer) {
        setCustomers(prev => prev.map(c => c.id === id ? updatedCustomer : c));
      }
    } catch (error) {
      console.error('Error updating customer:', error);
      throw error;
    } finally {
      setLoading(prev => ({ ...prev, customers: false }));
    }
  };

  const addInventoryItem = async (item: Omit<Tables['inventory_items']['Insert'], 'store_id'>) => {
    if (!storeId) return;
    
    setLoading(prev => ({ ...prev, inventory: true }));
    try {
      const newItem = await SupabaseService.createInventoryItem({ ...item, store_id: storeId });
      if (newItem) {
        // Refresh inventory to get joined data
        const inventoryData = await SupabaseService.getInventoryItems(storeId);
        setInventory(inventoryData || []);
      }
    } catch (error) {
      console.error('Error adding inventory item:', error);
      throw error;
    } finally {
      setLoading(prev => ({ ...prev, inventory: false }));
    }
  };

  const addSale = async (
    // sale: Omit<Tables['sale_items']['Insert'], 'store_id'>, 
    items: Omit<Tables['sale_items']['Insert'], 'id'>[]
  ) => {
    if (!storeId) return;
    
    setLoading(prev => ({ ...prev, sales: true }));
    try {
      // Create sale items directly since there's no sales table
      const saleItemsWithStore = items.map(item => ({ ...item, store_id: storeId }));
      const newSaleItems = await Promise.all(
        saleItemsWithStore.map(item => SupabaseService.createSaleItem(item))
      );
      
      // Deduct inventory for each sale item
      for (const item of items) {
        if (item.quantity && item.quantity > 0) {
          if (item.inventory_item_id) {
            // Use specific inventory item ID if provided
            await deductSpecificInventoryQuantity(item.inventory_item_id, item.quantity);
          } else {
            // Fallback to FIFO approach for legacy support
            await deductInventoryQuantity(item.product_id, item.supplier_id, item.quantity);
          }
        }
      }
      
      if (newSaleItems.length > 0) {
        // Refresh sales to get joined data
        const salesData = await SupabaseService.getSaleItems(storeId);
        setSales(salesData || []);
      }
    } catch (error) {
      console.error('Error adding sale:', error);
      throw error;
    } finally {
      setLoading(prev => ({ ...prev, sales: false }));
    }
  };

  const updateSale = async (id: string, updates: Partial<Tables['sale_items']['Update']>) => {
    if (!storeId) return;
    
    setLoading(prev => ({ ...prev, sales: true }));
    try {
      // Get the original sale item to compare quantities
      const originalSale = sales.find(s => s.id === id);
      if (!originalSale) throw new Error('Sale item not found');

      // Check if quantity has changed
      const quantityChanged = updates.quantity !== undefined && updates.quantity !== originalSale.quantity;
      const quantityDifference = quantityChanged ? (updates.quantity || 0) - (originalSale.quantity || 0) : 0;

      // Update the sale item
      const updatedSale = await SupabaseService.updateSaleItem(id, updates);
      
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

      if (updatedSale) {
        setSales(prev => prev.map(s => s.id === id ? updatedSale : s));
      }
    } catch (error) {
      console.error('Error updating sale:', error);
      throw error;
    } finally {
      setLoading(prev => ({ ...prev, sales: false }));
    }
  };

  const deleteSale = async (id: string) => {
    if (!storeId) return;
    
    setLoading(prev => ({ ...prev, sales: true }));
    try {
      // Get the sale item before deletion to restore inventory
      const saleItem = sales.find(s => s.id === id);
      if (!saleItem) throw new Error('Sale item not found');

      // Delete the sale item
      await SupabaseService.deleteSaleItem(id);
      
      // Restore inventory quantities
      if (saleItem.quantity && saleItem.quantity > 0 && saleItem.product_id && saleItem.supplier_id) {
        await restoreInventoryQuantity(saleItem.product_id, saleItem.supplier_id, saleItem.quantity);
      }

      setSales(prev => prev.filter(s => s.id !== id));
    } catch (error) {
      console.error('Error deleting sale:', error);
      throw error;
    } finally {
      setLoading(prev => ({ ...prev, sales: false }));
    }
  };

  const addTransaction = async (transaction: Omit<Tables['transactions']['Insert'], 'store_id'>) => {
    if (!storeId) return;
    
    setLoading(prev => ({ ...prev, transactions: true }));
    try {
      const newTransaction = await SupabaseService.createTransaction({ ...transaction, store_id: storeId });
      if (newTransaction) {
        setTransactions(prev => [newTransaction as any, ...prev]);
      }
    } catch (error) {
      console.error('Error adding transaction:', error);
      throw error;
    } finally {
      setLoading(prev => ({ ...prev, transactions: false }));
    }
  };





  const deductSpecificInventoryQuantity = async (inventoryItemId: string, quantity: number): Promise<void> => {
    if (!storeId) return;

    try {
      // Get the specific inventory item
      const { data: inventoryItem, error: inventoryError } = await supabase
        .from('inventory_items')
        .select('*')
        .eq('id', inventoryItemId as any)
        .single();
      
      if (inventoryError) throw inventoryError;
      if (!inventoryItem) throw new Error('Inventory item not found');
      
      if (inventoryItem.quantity < quantity as any) {
        throw new Error(`Insufficient stock. Available: ${inventoryItem.quantity}, Requested: ${quantity}`);
      }
      
      const newQuantity = inventoryItem.quantity - quantity;
      
      if (newQuantity <= 0) {
        // Keep inventory item with quantity = 0 for received bills review instead of deleting
        await supabase
          .from('inventory_items')
          .update({ quantity: 0 })
          .eq('id', inventoryItemId as any);
      } else {
        // Update with new quantity
        await supabase
          .from('inventory_items')
          .update({ quantity: newQuantity })
          .eq('id', inventoryItemId as any);
      }
      
      // Refresh inventory data to update stock levels
      const inventoryData = await SupabaseService.getInventoryItems(storeId);
      setInventory(inventoryData || []);
      
    } catch (error) {
      console.error('Error deducting specific inventory quantity:', error);
      throw error;
    }
  };

      const deductInventoryQuantity = async (productId: any, supplierId: any, quantity: number): Promise<void> => {
    if (!storeId) return;
    
    try {
      let qtyToDeduct = quantity;
      // Get inventory items for this product/supplier, oldest first (FIFO)
      const { data: inventoryRows, error: inventoryError } = await supabase
        .from('inventory_items')
        .select('*')
        .eq('product_id', productId)
        .eq('supplier_id', supplierId)
        .gt('quantity', 0)
        .order('received_at', { ascending: true });
      
      if (inventoryError) throw inventoryError;
      if (!inventoryRows) return;
      
      for (const inv of inventoryRows) {
        if (qtyToDeduct <= 0) break;
        const deduct = Math.min(inv.quantity, qtyToDeduct);
        const newQty = inv.quantity - deduct;
        await supabase
          .from('inventory_items')
          .update({ quantity: newQty })
          .eq('id', inv.id);
        qtyToDeduct -= deduct;
      }
      
      // Refresh inventory data to update stock levels
      const inventoryData = await SupabaseService.getInventoryItems(storeId);
      setInventory(inventoryData || []);
      
    } catch (error) {
      console.error('Error deducting inventory for sale:', error);
      throw error;
    }
  };

  const restoreInventoryQuantity = async (productId: any, supplierId: any, quantity: number): Promise<void> => {
    if (!storeId) return;

    try {
      let qtyToRestore = quantity;
      // Get inventory items for this product/supplier, oldest first (FIFO)
      const { data: inventoryRows, error: inventoryError } = await supabase
        .from('inventory_items')
        .select('*')
        .eq('product_id', productId)
        .eq('supplier_id', supplierId)
        .gt('quantity', 0)
        .order('received_at', { ascending: true });
      
      if (inventoryError) throw inventoryError;
      if (!inventoryRows) return;
      
      for (const inv of inventoryRows as any) {
        if (qtyToRestore <= 0) break;
        const restore = Math.min(inv.quantity, qtyToRestore);
        const newQty = inv.quantity + restore;
        await supabase
          .from('inventory_items')
          .update({ quantity: newQty } as any)
          .eq('id', inv.id);
        qtyToRestore -= restore;
      }
      
      // Refresh inventory data to update stock levels
      const inventoryData = await SupabaseService.getInventoryItems(storeId);
      setInventory(inventoryData || []);
      
    } catch (error) {
      console.error('Error restoring inventory quantity:', error);
      throw error;
    }
  };

  // Add legacy/compatibility methods with database integration
  const toggleLowStockAlerts = async (enabled: boolean) => {
    setLowStockAlertsEnabled(enabled);
    // Note: This setting is not stored in the database users table
    // It's a local preference that could be added to the database schema if needed
  };

  const updateLowStockThreshold = async (threshold: number) => {
    setLowStockThreshold(threshold);
    // Note: This setting is not stored in the database users table
    // It's a local preference that could be added to the database schema if needed
  };

  const updateDefaultCommissionRate = async (rate: number) => {
    console.log('SupabaseDataContext: updateDefaultCommissionRate called with rate:', rate);
    setDefaultCommissionRate(rate);
    if (userProfile?.id) {
      try {
        console.log('SupabaseDataContext: Saving commission rate to database for user:', userProfile.id);
        await SupabaseService.updateUserSettings(userProfile.id, {
          preferred_commission_rate: rate
        });
        console.log('SupabaseDataContext: Commission rate saved to database successfully');
      } catch (error) {
        console.error('SupabaseDataContext: Failed to save commission rate to database:', error);
        // Fallback to local storage only
      }
    } else {
      console.log('SupabaseDataContext: No userProfile.id available, skipping database save');
    }
  };

  const updateCurrency = async (cur: 'USD' | 'LBP') => {
    console.log('SupabaseDataContext: updateCurrency called with currency:', cur);
    setCurrency(cur);
    if (userProfile?.id) {
      try {
        console.log('SupabaseDataContext: Saving currency to database for user:', userProfile.id);
        await SupabaseService.updateUserSettings(userProfile.id, {
          preferred_currency: cur
        });
        console.log('SupabaseDataContext: Currency saved to database successfully');
      } catch (error) {
        console.error('SupabaseDataContext: Failed to save currency preference to database:', error);
        // Fallback to local storage only
      }
    } else {
      console.log('SupabaseDataContext: No userProfile.id available, skipping database save');
    }
  };
  const openCashDrawer = (amount: number, openedBy: string) => {
    const newDrawer = {
      openingAmount: amount,
      openedBy,
      openedAt: new Date().toISOString(),
      status: 'open',
      currentAmount: amount
    };
    setCashDrawer(newDrawer);
    // localStorage will be updated by useEffect
  };

  // Calculate stock levels from inventory
  const computeStockLevels = () => {
    return products.map(product => {
      const productInventory = inventory.filter(item => item.product_id === product.id);
      const totalStock = productInventory.reduce((sum, item) => sum + item.quantity, 0);
      
      const supplierStock = suppliers.map(supplier => {
        const supplierItems = productInventory.filter(item => item.supplier_id === supplier.id);
        const quantity = supplierItems.reduce((sum, item) => sum + item.quantity, 0);
        return {
          supplierId: supplier.id,
          supplierName: supplier.name,
          quantity
        };
      }).filter(s => s.quantity > 0);

      const lastReceived = productInventory.length > 0 
        ? productInventory.sort((a, b) => new Date(b.received_at).getTime() - new Date(a.received_at).getTime())[0].received_at
        : '';

      const units = productInventory.map(item => item.unit);
      const mostCommonUnit = units.length > 0 
        ? units.reduce((a, b, i, arr) => 
            arr.filter(v => v === a).length >= arr.filter(v => v === b).length ? a : b
          )
        : 'kg';

      return {
        productId: product.id,
        productName: product.name,
        currentStock: totalStock,
        unit: mostCommonUnit,
        lastReceived,
        suppliers: supplierStock
      };
    });
  };
  // Add stockLevels as state so it can be set
  const [stockLevels, setStockLevels] = useState<any[]>([]);
  // Update stockLevels whenever products, suppliers, or inventory changes
  useEffect(() => {
    setStockLevels(computeStockLevels());
  }, [products, suppliers, inventory]);

  // Save cashDrawer to localStorage whenever it changes
  useEffect(() => {
    if (cashDrawer !== undefined) {
      localStorage.setItem('erp_cash_drawer', JSON.stringify(cashDrawer));
    }
  }, [cashDrawer]);

  console.log('SupabaseDataProvider: About to render provider with children:', children);
  return (
    <SupabaseDataContext.Provider value={{
      products,
      suppliers,
      customers,
      sales,
      inventory,
      transactions,
      
      stockLevels,
      setStockLevels,
      lowStockAlertsEnabled,
      lowStockThreshold,
      defaultCommissionRate,
      currency,
      cashDrawer,
      openCashDrawer,
      accountsReceivable,
      accountsPayable,
      journalEntries,
      isOnline,
      loading,
      addProduct,
      addSupplier,
      addCustomer,
      updateCustomer,
      addInventoryItem,
      addSale,
      updateSale,
      deleteSale,
      addTransaction,
      
      refreshData,
      getStockLevels: computeStockLevels, // Expose the computed function
      toggleLowStockAlerts,
      updateLowStockThreshold,
      updateDefaultCommissionRate,
      updateCurrency,
      updateUserSettings: async (userId: string, updates: any) => {
        try {
          await SupabaseService.updateUserSettings(userId, updates);
        } catch (error) {
          console.error('Error updating user settings:', error);
          throw error;
        }
      },
  
      deductInventoryQuantity,
      restoreInventoryQuantity
    }}>
      {children}
    </SupabaseDataContext.Provider>
  );
}

export function useSupabaseData() {
  console.log('useSupabaseData: Hook called');
  const context = useContext(SupabaseDataContext);
  console.log('useSupabaseData: Context value:', context);
  if (context === undefined) {
    console.error('useSupabaseData: Context is undefined!');
    throw new Error('useSupabaseData must be used within a SupabaseDataProvider');
  }
  return context;
}