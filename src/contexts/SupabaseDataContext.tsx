import React, { createContext, useContext, ReactNode } from 'react';
import { useOfflineData } from './OfflineDataContext';
import { Database } from '../types/database';
import { BillLineItem } from '../types';

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
  updateSale: (id: string, updates: Partial<BillLineItem>) => Promise<void>;
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
  updateStoreSettings: (storeId: string, updates: {
    preferred_currency?: 'USD' | 'LBP';
    preferred_language?: 'en' | 'ar' | 'fr';
    preferred_commission_rate?: number;
  }) => Promise<void>;
}

const SupabaseDataContext = createContext<SupabaseDataContextType | undefined>(undefined);

export function SupabaseDataProvider({ children }: { children: ReactNode }) {
  // Use OfflineDataContext as the underlying implementation
  // This provides offline-first functionality with automatic sync
  const offlineData = useOfflineData();

  // Wrapper functions that delegate to OfflineDataContext
  // This maintains backward compatibility while using offline-first approach
  const contextValue: SupabaseDataContextType = {
    // Data - delegate to offline context
    products: offlineData.products,
    suppliers: offlineData.suppliers,
    customers: offlineData.customers,
    sales: offlineData.sales,
    inventory: offlineData.inventory,
    transactions: offlineData.transactions,

    // Computed/legacy compatibility - delegate to offline context
    stockLevels: offlineData.stockLevels,
    setStockLevels: offlineData.setStockLevels,
    lowStockAlertsEnabled: offlineData.lowStockAlertsEnabled,
    lowStockThreshold: offlineData.lowStockThreshold,
    defaultCommissionRate: offlineData.defaultCommissionRate,
    currency: offlineData.currency,
    cashDrawer: offlineData.cashDrawer,
    openCashDrawer: offlineData.openCashDrawer,
    accountsReceivable: [], // Stub - not implemented in offline context
    accountsPayable: [], // Stub - not implemented in offline context
    journalEntries: [], // Stub - not implemented in offline context
    isOnline: offlineData.isOnline,

    // Loading states - delegate to offline context
    loading: {
      products: offlineData.loading.products,
      suppliers: offlineData.loading.suppliers,
      customers: offlineData.loading.customers,
      sales: offlineData.loading.sales,
      inventory: offlineData.loading.inventory,
      transactions: offlineData.loading.transactions,
    },

    // CRUD operations - delegate to offline context
    addProduct: offlineData.addProduct,
    addSupplier: offlineData.addSupplier,
    addCustomer: offlineData.addCustomer,
    updateCustomer: offlineData.updateCustomer,
    addInventoryItem: offlineData.addInventoryItem,
    addSale: offlineData.addSale,
    updateSale: offlineData.updateSale,
    deleteSale: offlineData.deleteSale,
    addTransaction: offlineData.addTransaction,

    // Inventory operations - delegate to offline context
    deductInventoryQuantity: offlineData.deductInventoryQuantity,
    restoreInventoryQuantity: offlineData.restoreInventoryQuantity,

    // Utility functions - delegate to offline context
    refreshData: offlineData.refreshData,
    getStockLevels: offlineData.getStockLevels,
    toggleLowStockAlerts: offlineData.toggleLowStockAlerts,
    updateLowStockThreshold: offlineData.updateLowStockThreshold,
    updateDefaultCommissionRate: offlineData.updateDefaultCommissionRate,
    updateCurrency: offlineData.updateCurrency,
    updateStoreSettings: async (storeId: string, updates: any) => {
      // This would need to be implemented in OfflineDataContext if needed
      console.warn('updateStoreSettings not implemented in offline-first context');
    },
  };

  return (
    <SupabaseDataContext.Provider value={contextValue}>
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
