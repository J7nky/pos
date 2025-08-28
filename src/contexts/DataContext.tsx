import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { Product, Supplier, Customer, InventoryItem, StockLevel, CashDrawer, Transaction, AccountsReceivable, AccountsPayable, ExpenseCategory, Sale} from '../types';

interface DataContextType {
  products: Product[];
  suppliers: Supplier[];
  customers: Customer[];
  sales: Sale[];
  inventory: InventoryItem[];
  stockLevels: StockLevel[];
  cashDrawer: CashDrawer | null;
  transactions: Transaction[];
  accountsReceivable: AccountsReceivable[];
  accountsPayable: AccountsPayable[];
  expenseCategories: ExpenseCategory[];
  isOnline: boolean;
  lowStockAlertsEnabled: boolean;
  lowStockThreshold: number;
  defaultCommissionRate: number;
  currency: 'USD' | 'LBP';
  addProduct: (product: Omit<Product, 'id' | 'createdAt'>) => void;
  addSupplier: (supplier: Omit<Supplier, 'id' | 'createdAt'>) => void;
  addCustomer: (customer: Omit<Customer, 'id' | 'createdAt'>) => void;
  addSale: (sale: Omit<Sale, 'id' | 'createdAt'>) => void;
  addInventoryItem: (item: Omit<InventoryItem, 'id' | 'receivedAt'>) => void;
  addTransaction: (transaction: Omit<Transaction, 'id' | 'createdAt'>) => void;
  addAccountsReceivable: (ar: Omit<AccountsReceivable, 'id' | 'createdAt'>) => void;
  addAccountsPayable: (ap: Omit<AccountsPayable, 'id' | 'createdAt'>) => void;
  addExpenseCategory: (category: Omit<ExpenseCategory, 'id' | 'createdAt'>) => void;
  updateCustomer: (id: string, updates: Partial<Customer>) => void;
  updateAccountsReceivable: (id: string, updates: Partial<AccountsReceivable>) => void;
  updateAccountsPayable: (id: string, updates: Partial<AccountsPayable>) => void;
  openCashDrawer: (openingAmount: number, userId: string) => void;
  closeCashDrawer: (userId: string) => void;
  updateStockLevels: () => void;
  toggleLowStockAlerts: (enabled: boolean) => void;
  updateLowStockThreshold: (threshold: number) => void;
  updateDefaultCommissionRate: (rate: number) => void;
  updateCurrency: (currency: 'USD' | 'LBP') => void;
  syncData: () => Promise<void>;
}

const DataContext = createContext<DataContextType | undefined>(undefined);

const initialProducts: Product[] = [
  { id: '1', name: 'Apples', category: 'Fruits', image: 'https://images.pexels.com/photos/102104/pexels-photo-102104.jpeg',  createdAt: '2024-01-01T00:00:00Z' },
  { id: '2', name: 'Bananas', category: 'Fruits', image: 'https://images.pexels.com/photos/2872755/pexels-photo-2872755.jpeg',  createdAt: '2024-01-01T00:00:00Z' },
  { id: '3', name: 'Carrots', category: 'Vegetables', image: 'https://images.pexels.com/photos/143133/pexels-photo-143133.jpeg',  createdAt: '2024-01-01T00:00:00Z' },
  { id: '4', name: 'Tomatoes', category: 'Vegetables', image: 'https://images.pexels.com/photos/144248/tomatoes-vegetables-food-frisch-144248.jpeg',  createdAt: '2024-01-01T00:00:00Z' },
  { id: '5', name: 'Lettuce', category: 'Vegetables', image: 'https://images.pexels.com/photos/1656663/pexels-photo-1656663.jpeg',  createdAt: '2024-01-01T00:00:00Z' }
];

const initialSuppliers: Supplier[] = [
  { id: '1', name: 'Fresh Farm Co.', phone: '+1234567890', email: 'contact@freshfarm.com', address: '123 Farm Road',  createdAt: '2024-01-01T00:00:00Z' },
  { id: '2', name: 'Green Valley Suppliers', phone: '+1234567891', email: 'info@greenvalley.com', address: '456 Valley Street',  createdAt: '2024-01-01T00:00:00Z' },
  { id: '3', name: 'Organic Gardens Ltd.', phone: '+1234567892', email: 'sales@organicgardens.com', address: '789 Garden Lane',  createdAt: '2024-01-01T00:00:00Z' }
];

  const initialCustomers: Customer[] = [
    { id: '1', name: 'Restaurant ABC', phone: '+1234567893', email: 'orders@restaurantabc.com', address: '321 Main Street', lb_balance: 1000, usd_balance: 1000, isActive: true, createdAt: '2024-01-01T00:00:00Z' }, 
    { id: '2', name: 'Corner Store', phone: '+1234567894', address: '654 Corner Ave', lb_balance: 0, usd_balance: 0, isActive: true, createdAt: '2024-01-01T00:00:00Z' } 
  ];

const initialExpenseCategories: ExpenseCategory[] = [
  { id: '1', name: 'Utilities', description: 'Electricity, water, gas', isActive: true, createdAt: '2024-01-01T00:00:00Z' },
  { id: '2', name: 'Transportation', description: 'Fuel, vehicle maintenance', isActive: true, createdAt: '2024-01-01T00:00:00Z' },
  { id: '3', name: 'Office Supplies', description: 'Stationery, equipment', isActive: true, createdAt: '2024-01-01T00:00:00Z' },
  { id: '4', name: 'Marketing', description: 'Advertising, promotions', isActive: true, createdAt: '2024-01-01T00:00:00Z' },
  { id: '5', name: 'Rent', description: 'Store rent and facilities', isActive: true, createdAt: '2024-01-01T00:00:00Z' }
];

export function DataProvider({ children }: { children: ReactNode }) {
  const [products, setProducts] = useState<Product[]>([]);
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [sales, setSales] = useState<Sale[]>([]);
  const [inventory, setInventory] = useState<InventoryItem[]>([]);
  const [stockLevels, setStockLevels] = useState<StockLevel[]>([]);
  const [cashDrawer, setCashDrawer] = useState<CashDrawer | null>(null);
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [accountsReceivable, setAccountsReceivable] = useState<AccountsReceivable[]>([]);
  const [accountsPayable, setAccountsPayable] = useState<AccountsPayable[]>([]);
  const [expenseCategories, setExpenseCategories] = useState<ExpenseCategory[]>([]);
  const [isOnline, setIsOnline] = useState(navigator.onLine);
  const [lowStockAlertsEnabled, setLowStockAlertsEnabled] = useState(true);
  const [lowStockThreshold, setLowStockThreshold] = useState(10);
  const [defaultCommissionRate, setDefaultCommissionRate] = useState(10);
  const [currency, setCurrency] = useState<'USD' | 'LBP'>('USD');

  useEffect(() => {
    // Load data from localStorage or initialize with defaults
    const storedProducts = localStorage.getItem('erp_products');
    const storedSuppliers = localStorage.getItem('erp_suppliers');
    const storedCustomers = localStorage.getItem('erp_customers');
    const storedSales = localStorage.getItem('erp_sales');
    const storedInventory = localStorage.getItem('erp_inventory');
    const storedCashDrawer = localStorage.getItem('erp_cash_drawer');
    const storedTransactions = localStorage.getItem('erp_transactions');

    const storedAccountsReceivable = localStorage.getItem('erp_accounts_receivable');
    const storedAccountsPayable = localStorage.getItem('erp_accounts_payable');

    const storedLowStockSettings = localStorage.getItem('erp_low_stock_settings');
    const storedCommissionSettings = localStorage.getItem('erp_commission_settings');
    const storedCurrencySettings = localStorage.getItem('erp_currency_settings');

    setProducts(storedProducts ? JSON.parse(storedProducts) : initialProducts);
    setSuppliers(storedSuppliers ? JSON.parse(storedSuppliers) : initialSuppliers);
    setCustomers(storedCustomers ? JSON.parse(storedCustomers) : initialCustomers);
    setSales(storedSales ? JSON.parse(storedSales) : []);
    setInventory(storedInventory ? JSON.parse(storedInventory) : []);
    setCashDrawer(storedCashDrawer ? JSON.parse(storedCashDrawer) : null);
    setTransactions(storedTransactions ? JSON.parse(storedTransactions) : []);
    setAccountsReceivable(storedAccountsReceivable ? JSON.parse(storedAccountsReceivable) : []);
    setAccountsPayable(storedAccountsPayable ? JSON.parse(storedAccountsPayable) : []);
    setExpenseCategories(initialExpenseCategories);

    if (storedLowStockSettings) {
      const settings = JSON.parse(storedLowStockSettings);
      setLowStockAlertsEnabled(settings.enabled ?? true);
      setLowStockThreshold(settings.threshold ?? 10);
    }

    if (storedCurrencySettings) {
      const settings = JSON.parse(storedCurrencySettings);
      setCurrency(settings.currency ?? 'USD');
    }

    if (storedCommissionSettings) {
      const settings = JSON.parse(storedCommissionSettings);
      setDefaultCommissionRate(settings.defaultRate ?? 10);
    }
    // Set up online/offline listeners
    const handleOnline = () => setIsOnline(true);
    const handleOffline = () => setIsOnline(false);
    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  useEffect(() => {
    updateStockLevels();
  }, [inventory, products]);

  const addProduct = (product: Omit<Product, 'id' | 'createdAt'>) => {
    const newProduct = {
      ...product,
      id: Date.now().toString(),
      createdAt: new Date().toISOString()
    };
    const updatedProducts = [...products, newProduct];
    setProducts(updatedProducts);
    localStorage.setItem('erp_products', JSON.stringify(updatedProducts));
  };

  const addSupplier = (supplier: Omit<Supplier, 'id' | 'createdAt'>) => {
    const newSupplier = {
      ...supplier,
      id: Date.now().toString(),
      createdAt: new Date().toISOString()
    };
    const updatedSuppliers = [...suppliers, newSupplier];
    setSuppliers(updatedSuppliers);
    localStorage.setItem('erp_suppliers', JSON.stringify(updatedSuppliers));
  };

  const addCustomer = (customer: Omit<Customer, 'id' | 'createdAt'>) => {
    const newCustomer = {
      ...customer,
      id: Date.now().toString(),
      createdAt: new Date().toISOString()
    };
    const updatedCustomers = [...customers, newCustomer];
    setCustomers(updatedCustomers);
    localStorage.setItem('erp_customers', JSON.stringify(updatedCustomers));
  };

  const addSale = (sale: Omit<Sale, 'id' | 'createdAt'>) => {
    const newSale = {
      ...sale,
      id: Date.now().toString(),
      createdAt: new Date().toISOString()
    };
    const updatedSales = [...sales, newSale];
    setSales(updatedSales);
    localStorage.setItem('erp_sales', JSON.stringify(updatedSales));

    // Update cash drawer if payment is cash
    if (cashDrawer && sale.paymentMethod === 'cash') {
      const updatedDrawer = {
        ...cashDrawer,
        currentAmount: cashDrawer.currentAmount + sale.amountPaid,
        totalCashSales: cashDrawer.totalCashSales + sale.amountPaid
      };
      setCashDrawer(updatedDrawer);
      localStorage.setItem('erp_cash_drawer', JSON.stringify(updatedDrawer));
    }
  };

  const addInventoryItem = (item: Omit<InventoryItem, 'id' | 'receivedAt'>) => {
    const newItem = {
      ...item,
      id: Date.now().toString(),
      receivedAt: new Date().toISOString()
    };
    const updatedInventory = [...inventory, newItem];
    setInventory(updatedInventory);
    localStorage.setItem('erp_inventory', JSON.stringify(updatedInventory));
  };

  const addTransaction = (transaction: Omit<Transaction, 'id' | 'createdAt'>) => {
    const newTransaction = {
      ...transaction,
      id: Date.now().toString(),
      createdAt: new Date().toISOString()
    };
    const updatedTransactions = [...transactions, newTransaction];
    setTransactions(updatedTransactions);
    localStorage.setItem('erp_transactions', JSON.stringify(updatedTransactions));

    // Update cash drawer for cash transactions
    if (cashDrawer) {
      // Convert transaction amount to USD for cash drawer (assuming cash drawer tracks in USD)
      let amountInUSD = transaction.amount;
      if (transaction.currency === 'LBP') {
        amountInUSD = transaction.amount / 89500; // Convert LBP to USD
      }
      
      const updatedDrawer = {
        ...cashDrawer,
        currentAmount: transaction.type === 'income' 
          ? cashDrawer.currentAmount + amountInUSD
          : cashDrawer.currentAmount - amountInUSD,
        totalExpenses: transaction.type === 'expense'
          ? cashDrawer.totalExpenses + amountInUSD
          : cashDrawer.totalExpenses
      };
      setCashDrawer(updatedDrawer);
      localStorage.setItem('erp_cash_drawer', JSON.stringify(updatedDrawer));
    }
  };

  const addAccountsReceivable = (ar: Omit<AccountsReceivable, 'id' | 'createdAt'>) => {
    const newAR = {
      ...ar,
      id: Date.now().toString(),
      createdAt: new Date().toISOString()
    };
    const updatedAR = [...accountsReceivable, newAR];
    setAccountsReceivable(updatedAR);
    localStorage.setItem('erp_accounts_receivable', JSON.stringify(updatedAR));
  };

  const addAccountsPayable = (ap: Omit<AccountsPayable, 'id' | 'createdAt'>) => {
    const newAP = {
      ...ap,
      id: Date.now().toString(),
      createdAt: new Date().toISOString()
    };
    const updatedAP = [...accountsPayable, newAP];
    setAccountsPayable(updatedAP);
    localStorage.setItem('erp_accounts_payable', JSON.stringify(updatedAP));
  };

  const addExpenseCategory = (category: Omit<ExpenseCategory, 'id' | 'createdAt'>) => {
    const newCategory = {
      ...category,
      id: Date.now().toString(),
      createdAt: new Date().toISOString()
    };
    const updatedCategories = [...expenseCategories, newCategory];
    setExpenseCategories(updatedCategories);
    
  };



  const updateCustomer = (id: string, updates: Partial<Customer>) => {
    const updatedCustomers = customers.map(customer =>
      customer.id === id ? { ...customer, ...updates } : customer
    );
    setCustomers(updatedCustomers);
    localStorage.setItem('erp_customers', JSON.stringify(updatedCustomers));
  };


  const updateAccountsReceivable = (id: string, updates: Partial<AccountsReceivable>) => {
    const updatedAR = accountsReceivable.map(ar =>
      ar.id === id ? { ...ar, ...updates } : ar
    );
    setAccountsReceivable(updatedAR);
    localStorage.setItem('erp_accounts_receivable', JSON.stringify(updatedAR));
  };

  const updateAccountsPayable = (id: string, updates: Partial<AccountsPayable>) => {
    const updatedAP = accountsPayable.map(ap =>
      ap.id === id ? { ...ap, ...updates } : ap
    );
    setAccountsPayable(updatedAP);
    localStorage.setItem('erp_accounts_payable', JSON.stringify(updatedAP));
  };

  const openCashDrawer = (openingAmount: number, userId: string) => {
    const newDrawer: CashDrawer = {
      id: Date.now().toString(),
      openingAmount,
      currentAmount: openingAmount,
      totalCashSales: 0,
      totalCashPayments: 0,
      totalExpenses: 0,
      openedAt: new Date().toISOString(),
      openedBy: userId,
      status: 'open'
    };
    setCashDrawer(newDrawer);
    localStorage.setItem('erp_cash_drawer', JSON.stringify(newDrawer));
  };

  const closeCashDrawer = (userId: string) => {
    if (cashDrawer) {
      const updatedDrawer = {
        ...cashDrawer,
        closedAt: new Date().toISOString(),
        closedBy: userId,
        status: 'closed' as const
      };
      setCashDrawer(updatedDrawer);
      localStorage.setItem('erp_cash_drawer', JSON.stringify(updatedDrawer));
    }
  };

  const updateStockLevels = () => {
    const levels: StockLevel[] = products.map(product => {
      const productInventory = inventory.filter(item => item.productId === product.id);
      const totalStock = productInventory.reduce((sum, item) => sum + item.quantity, 0);
      
      const supplierStock = suppliers.map(supplier => {
        const supplierItems = productInventory.filter(item => item.supplierId === supplier.id);
        const quantity = supplierItems.reduce((sum, item) => sum + item.quantity, 0);
        return {
          supplierId: supplier.id,
          supplierName: supplier.name,
          quantity
        };
      }).filter(s => s.quantity > 0);

      const lastReceived = productInventory.length > 0 
        ? productInventory.sort((a, b) => new Date(b.receivedAt).getTime() - new Date(a.receivedAt).getTime())[0].receivedAt
        : '';

      // Get the most common unit for this product, or default to 'kg'
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

    setStockLevels(levels);
  };

  const toggleLowStockAlerts = (enabled: boolean) => {
    setLowStockAlertsEnabled(enabled);
    const settings = { enabled, threshold: lowStockThreshold };
    localStorage.setItem('erp_low_stock_settings', JSON.stringify(settings));
  };

  const updateLowStockThreshold = (threshold: number) => {
    setLowStockThreshold(threshold);
    const settings = { enabled: lowStockAlertsEnabled, threshold };
    localStorage.setItem('erp_low_stock_settings', JSON.stringify(settings));
  };

  const updateDefaultCommissionRate = (rate: number) => {
    setDefaultCommissionRate(rate);
    const settings = { defaultRate: rate };
    localStorage.setItem('erp_commission_settings', JSON.stringify(settings));
  };

  const updateCurrency = (newCurrency: 'USD' | 'LBP') => {
    setCurrency(newCurrency);
    const settings = { currency: newCurrency };
    localStorage.setItem('erp_currency_settings', JSON.stringify(settings));
  };

  const syncData = async () => {
    if (!isOnline) return;
    
    // Simulate API sync
    console.log('Syncing data with server...');
    await new Promise(resolve => setTimeout(resolve, 2000));
    console.log('Data synced successfully');
  };

  return (
    <DataContext.Provider value={{
      products,
      suppliers,
      customers,
      sales,
      inventory,
      stockLevels,
      cashDrawer,
      transactions,
      accountsReceivable,
      accountsPayable,
      expenseCategories,
      isOnline,
      lowStockAlertsEnabled,
      lowStockThreshold,
      defaultCommissionRate,
      currency,
      addProduct,
      addSupplier,
      addCustomer,
      addSale,
      addInventoryItem,
      addTransaction,
      addAccountsReceivable,
      addAccountsPayable,
      addExpenseCategory,
      updateCustomer,
      updateAccountsReceivable,
      updateAccountsPayable,
      openCashDrawer,
      closeCashDrawer,
      updateStockLevels,
      toggleLowStockAlerts,
      updateLowStockThreshold,
      updateDefaultCommissionRate,
      updateCurrency,
      syncData
    }}>
      {children}
    </DataContext.Provider>
  );
}

export function useData() {
  const context = useContext(DataContext);
  if (context === undefined) {
    throw new Error('useData must be used within a DataProvider');
  }
  return context;
}