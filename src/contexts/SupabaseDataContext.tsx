import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { SupabaseService } from '../services/supabaseService';
import { useSupabaseAuth } from './SupabaseAuthContext';
import { Database } from '../types/database';

type Tables = Database['public']['Tables'];

interface SupabaseDataContextType {
  // Data
  products: Tables['products']['Row'][];
  suppliers: Tables['suppliers']['Row'][];
  customers: Tables['customers']['Row'][];
  sales: any[]; // Complex type with joins
  inventory: any[]; // Complex type with joins
  transactions: Tables['transactions']['Row'][];
  expenseCategories: Tables['expense_categories']['Row'][];
  
  // Loading states
  loading: {
    products: boolean;
    suppliers: boolean;
    customers: boolean;
    sales: boolean;
    inventory: boolean;
    transactions: boolean;
    expenseCategories: boolean;
  };

  // CRUD operations
  addProduct: (product: Omit<Tables['products']['Insert'], 'store_id'>) => Promise<void>;
  addSupplier: (supplier: Omit<Tables['suppliers']['Insert'], 'store_id'>) => Promise<void>;
  addCustomer: (customer: Omit<Tables['customers']['Insert'], 'store_id'>) => Promise<void>;
  updateCustomer: (id: string, updates: Tables['customers']['Update']) => Promise<void>;
  addInventoryItem: (item: Omit<Tables['inventory_items']['Insert'], 'store_id'>) => Promise<void>;
  addSale: (sale: Omit<Tables['sales']['Insert'], 'store_id'>, items: Omit<Tables['sale_items']['Insert'], 'sale_id'>[]) => Promise<void>;
  addTransaction: (transaction: Omit<Tables['transactions']['Insert'], 'store_id'>) => Promise<void>;
  addExpenseCategory: (category: Omit<Tables['expense_categories']['Insert'], 'store_id'>) => Promise<void>;

  // Utility functions
  refreshData: () => Promise<void>;
  getStockLevels: () => any[];
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
  const [expenseCategories, setExpenseCategories] = useState<Tables['expense_categories']['Row'][]>([]);

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
        transactionsData,
        expenseCategoriesData
      ] = await Promise.all([
        SupabaseService.getProducts(storeId),
        SupabaseService.getSuppliers(storeId),
        SupabaseService.getCustomers(storeId),
        SupabaseService.getSales(storeId),
        SupabaseService.getInventoryItems(storeId),
        SupabaseService.getTransactions(storeId),
        SupabaseService.getExpenseCategories(storeId)
      ]);

      setProducts(productsData || []);
      setSuppliers(suppliersData || []);
      setCustomers(customersData || []);
      setSales(salesData || []);
      setInventory(inventoryData || []);
      setTransactions(transactionsData || []);
      setExpenseCategories(expenseCategoriesData || []);
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
    sale: Omit<Tables['sales']['Insert'], 'store_id'>, 
    items: Omit<Tables['sale_items']['Insert'], 'sale_id'>[]
  ) => {
    if (!storeId) return;
    
    setLoading(prev => ({ ...prev, sales: true }));
    try {
      const newSale = await SupabaseService.createSale(
        { ...sale, store_id: storeId },
        items
      );
      if (newSale) {
        // Refresh sales to get joined data
        const salesData = await SupabaseService.getSales(storeId);
        setSales(salesData || []);
      }
    } catch (error) {
      console.error('Error adding sale:', error);
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

  const addExpenseCategory = async (category: Omit<Tables['expense_categories']['Insert'], 'store_id'>) => {
    if (!storeId) return;
    
    setLoading(prev => ({ ...prev, expenseCategories: true }));
    try {
      const newCategory = await SupabaseService.createExpenseCategory({ ...category, store_id: storeId });
      if (newCategory) {
        setExpenseCategories(prev => [...prev, newCategory]);
      }
    } catch (error) {
      console.error('Error adding expense category:', error);
      throw error;
    } finally {
      setLoading(prev => ({ ...prev, expenseCategories: false }));
    }
  };

  // Calculate stock levels from inventory
  const getStockLevels = () => {
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

  return (
    <SupabaseDataContext.Provider value={{
      products,
      suppliers,
      customers,
      sales,
      inventory,
      transactions,
      expenseCategories,
      loading,
      addProduct,
      addSupplier,
      addCustomer,
      updateCustomer,
      addInventoryItem,
      addSale,
      addTransaction,
      addExpenseCategory,
      refreshData,
      getStockLevels
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