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

  addNonPricedItem: (item: any) => Promise<void>;
  deductInventoryQuantity: (productId: string, supplierId: string, quantity: number) => Promise<void>;
  restoreInventoryQuantity: (productId: string, supplierId: string, quantity: number) => Promise<void>;

  // Utility functions
  refreshData: () => Promise<void>;
  getStockLevels: () => any[];
  toggleLowStockAlerts: (enabled: boolean) => void;
  updateLowStockThreshold: (threshold: number) => void;
  updateDefaultCommissionRate: (rate: number) => void;
  updateCurrency: (currency: 'USD' | 'LBP') => void;
}

const SupabaseDataContext = createContext<SupabaseDataContextType | undefined>(undefined);

export function SupabaseDataProvider({ children }: { children: ReactNode }) {
  const { userProfile } = useSupabaseAuth();
  const storeId = userProfile?.store_id;

  // Data states
  const [products, setProducts] = useState<Tables['products']['Row'][]>([]);
  const [suppliers, setSuppliers] = useState<Tables['suppliers']['Row'][]>([]);
  const [customers, setCustomers] = useState<Tables['customers']['Row'][]>([]);
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
      setTransactions(transactionsData || []);
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
          await deductInventoryQuantity(item.product_id, item.supplier_id, item.quantity);
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
        setTransactions(prev => [newTransaction, ...prev]);
      }
    } catch (error) {
      console.error('Error adding transaction:', error);
      throw error;
    } finally {
      setLoading(prev => ({ ...prev, transactions: false }));
    }
  };



  const addNonPricedItem = async (item: any): Promise<void> => {
    if (!storeId) return;
    
    // Store the non-priced item in localStorage
    const key = 'erp_non_priced_items';
    const existing = JSON.parse(localStorage.getItem(key) || '[]');
    const updated = [...existing, item];
    localStorage.setItem(key, JSON.stringify(updated));
    
    // Deduct inventory (FIFO, as much as possible) - same logic as createSale
    try {
      let qtyToDeduct = item.quantity;
      // Get inventory items for this product/supplier, oldest first
      const { data: inventoryRows, error: inventoryError } = await supabase
        .from('inventory_items')
        .select('*')
        .eq('product_id', item.productId)
        .eq('supplier_id', item.supplierId)
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
      console.error('Error deducting inventory for non-priced item:', error);
      throw error;
    }
  };

  const deductInventoryQuantity = async (productId: string, supplierId: string, quantity: number): Promise<void> => {
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

  const restoreInventoryQuantity = async (productId: string, supplierId: string, quantity: number): Promise<void> => {
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
      
      for (const inv of inventoryRows) {
        if (qtyToRestore <= 0) break;
        const restore = Math.min(inv.quantity, qtyToRestore);
        const newQty = inv.quantity + restore;
        await supabase
          .from('inventory_items')
          .update({ quantity: newQty })
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

  // Add legacy/compatibility methods
  const toggleLowStockAlerts = (enabled: boolean) => setLowStockAlertsEnabled(enabled);
  const updateLowStockThreshold = (threshold: number) => setLowStockThreshold(threshold);
  const updateDefaultCommissionRate = (rate: number) => setDefaultCommissionRate(rate);
  const updateCurrency = (cur: 'USD' | 'LBP') => setCurrency(cur);
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
      addNonPricedItem,
      deductInventoryQuantity,
      restoreInventoryQuantity
    }}>
      {children}
    </SupabaseDataContext.Provider>
  );
}

export function useSupabaseData() {
  const context = useContext(SupabaseDataContext);
  if (context === undefined) {
    throw new Error('useSupabaseData must be used within a SupabaseDataProvider');
  }
  return context;
}