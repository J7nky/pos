import React, { useState, useEffect, useMemo } from 'react';
import { useOfflineData } from '../contexts/OfflineDataContext';
import { useSupabaseAuth } from '../contexts/SupabaseAuthContext';
import { useI18n } from '../i18n';
import { useCurrency } from '../hooks/useCurrency';
import { useLocalStorage } from '../hooks/useLocalStorage';
import { useProductMultilingual } from '../hooks/useMultilingual';
import { useEntityBalances } from '../hooks/useEntityBalances';
import { 
  generatePaymentReference, 
  generateExpenseReference,
  generateCommissionReference,
  generatePorterageReference,
  generateTransferReference
} from '../utils/referenceGenerator';
import { PAYMENT_CATEGORIES } from '../constants/paymentCategories';

import Toast from '../components/common/Toast';
import { CurrencyService } from '../services/currencyService';
import ReceivedBills from '../components/accountingPage/tabs/ReceivedBills';
import SoldBills from '../components/accountingPage/tabs/SoldBills';
import DashboardOverview from '../components/accountingPage/tabs/DashboardOverview';
import NonPricedItems from '../components/accountingPage/tabs/NonPricedItems';
import RecentPayments from '../components/accountingPage/tabs/RecentPayments';
import { PaymentsModal } from '../components/accountingPage/modals/PaymentsModal';
import EditSaleModal from '../components/accountingPage/modals/EditSaleModal';
import DeleteSaleModal from '../components/accountingPage/modals/DeleteSaleModal';
import ActionTabsBar from '../components/accountingPage/tabs/ActionTabsBar';
import { CashDrawerBalanceReport } from '../components/CashDrawerBalanceReport';
import { CurrentCashDrawerStatus } from '../components/CurrentCashDrawerStatus';

export default function Accounting() {
  const { t } = useI18n();
  const { getProductName } = useProductMultilingual();
  let raw;
  try {
    raw = useOfflineData();
  } catch (error) {
    console.error('Error loading offline data:', error);
    return (
      <div className="p-6">
        <div className="bg-red-50 border border-red-200 rounded-lg p-4">
          <h3 className="text-lg font-semibold text-red-800">{t('accounting.errorLoadingData')}</h3>
          <p className="text-red-600">{t('accounting.unableToLoadData')}</p>
        </div>
      </div>
    );
  }
  const addTransaction = raw.addTransaction;
  const updateSale = raw.updateSale;
  const deleteSale = raw.deleteSale;
  const updateInventoryBatch = raw.updateInventoryBatch;
  const addSupplier = raw.addSupplier;
  const defaultCommissionRate = raw.defaultCommissionRate;
  const refreshData = raw.refreshData;
  const getCashDrawerBalanceReport = raw.getCashDrawerBalanceReport;
  const getCashDrawerSessionDetails = raw.getCashDrawerSessionDetails;
  const getCurrentCashDrawerStatus = raw.getCurrentCashDrawerStatus;
  const transactions = raw.transactions?.map(t => ({...t, createdAt: t.created_at})) || [];
  
  // Get unified entities (customers, suppliers, employees)
  const allEntities = raw.entities || [];
  
  // Filter entities by type
  const customers = useMemo(() => 
    allEntities.filter((e: any) => e.entity_type === 'customer' && !e._deleted), 
    [allEntities]
  );
  const suppliers = useMemo(() => 
    allEntities.filter((e: any) => e.entity_type === 'supplier' && !e._deleted), 
    [allEntities]
  );
  
  // Calculate balances for entities that need them
  const customerIds = useMemo(() => 
    customers.map(c => c.id), 
    [customers]
  );
  const supplierIds = useMemo(() => 
    suppliers.map(s => s.id), 
    [suppliers]
  );
  const customerBalances = useEntityBalances(customerIds, 'customer', true);
  const supplierBalances = useEntityBalances(supplierIds, 'supplier', true);
  const expenseCategories = raw.expenseCategories || [];
  const inventory = raw.inventory || [];
  const sales = raw.sales || [];
  const products = raw.products || [];
  const bills = raw.bills || [];
  const inventoryBills = raw.inventoryBills || [];

  let userProfile, storeId;
  try {
    const auth = useSupabaseAuth();
    userProfile = auth.userProfile;
    storeId = userProfile?.store_id;
  } catch (error) {
    console.error('Error loading auth data:', error);
    userProfile = null;
    storeId = null;
  }

  let currency, formatCurrency: any, formatCurrencyWithSymbol: any, getConvertedAmount: any;
  try {
    const currencyHook = useCurrency();
    currency = currencyHook.currency;
    formatCurrency = currencyHook.formatCurrency;
    formatCurrencyWithSymbol = currencyHook.formatCurrencyWithSymbol;
    getConvertedAmount = currencyHook.getConvertedAmount;
  } catch (error) {
    console.error('Error loading currency data:', error);
    // Provide fallback values
    currency = 'USD';
    formatCurrency = (amount: number) => `$${amount.toFixed(2)}`;
    formatCurrencyWithSymbol = (amount: number, curr: string) => `${curr === 'LBP' ? 'LBP' : '$'}${amount.toFixed(2)}`;
    getConvertedAmount = (amount: number, curr: string) => amount;
  }

  // Unified recent entities (replaces separate recentCustomers and recentSuppliers)
  const [recentEntities, setRecentEntities] = useLocalStorage<string[]>('accounting_recent_entities', []);
  const [recentCategories, setRecentCategories] = useLocalStorage<string[]>('accounting_recent_categories', []);

  const [activeTab, setActiveTab] = useLocalStorage<'dashboard' | 'nonpriced' | 'bills-management' | 'received-bills' | 'cash-drawer' | 'payments'>('accounting_active_tab', 'dashboard');
  const [cashDrawerBalance, setCashDrawerBalance] = useState<number | null>(null);
  const [showForm, setShowForm] = useState<"receive" | "pay" | "expense" | null>(null);
  const [dashboardPeriod] = useLocalStorage<'today' | 'week' | 'month' | 'quarter' | 'year'>('accounting_dashboard_period', 'today');
  const [flashingItemId, setFlashingItemId] = useState<string | null>(null);
  const [autoExpandGroupId, setAutoExpandGroupId] = useState<string | null>(null);
  const [highlightBillNumber, setHighlightBillNumber] = useState<string | null>(null);
  const [currentCashDrawerSession, setCurrentCashDrawerSession] = useState<any>(null);

  // Add loading state to prevent rendering before data is ready
  const [isDataReady, setIsDataReady] = useState(false);

  useEffect(() => {
    // Check if all required data is loaded
    if (raw && transactions && allEntities && products) {
      setIsDataReady(true);
    }
  }, [raw, transactions, allEntities, products]);

  // Handle navigation from missed products history and transaction clicks
  useEffect(() => {
    // Small delay to ensure components are ready
    const timer = setTimeout(() => {
      const highlightItemId = sessionStorage.getItem('highlightReceivedBillItem');
      const targetTab = sessionStorage.getItem('activeAccountingTab');
      const highlightPaymentTransactionId = sessionStorage.getItem('highlightPaymentTransactionId');
      const highlightDashboardTransactionId = sessionStorage.getItem('highlightDashboardTransactionId');
      
      // Handle missed products navigation (existing)
      if (highlightItemId && targetTab === 'received-bills') {
        // Switch to received bills tab
        setActiveTab('received-bills');
        
        // Set the item to flash immediately
        setFlashingItemId(highlightItemId);
        
        // Clear the sessionStorage immediately to prevent re-triggering
        sessionStorage.removeItem('highlightReceivedBillItem');
        sessionStorage.removeItem('activeAccountingTab');
      }
      
      // Handle payment transaction highlighting (can run immediately)
      if (highlightPaymentTransactionId) {
        setActiveTab('payments');
        // Store for RecentPayments component to use (don't remove yet, let component handle it)
        sessionStorage.setItem('highlightPaymentId', highlightPaymentTransactionId);
        sessionStorage.removeItem('highlightPaymentTransactionId');
      }
      
      // Handle dashboard transaction highlighting (can run immediately)
      if (highlightDashboardTransactionId) {
        setActiveTab('dashboard');
        // Store for DashboardOverview component to use (don't remove yet, let component handle it)
        // Note: We're keeping the same key name so component can read it
        // Component will remove it after reading
      }

      // Handle inventory bill transaction - switch tab immediately (item matching happens in separate useEffect)
      const highlightTransactionId = sessionStorage.getItem('highlightTransactionId');
      if (highlightTransactionId) {
        setActiveTab('received-bills');
        // Don't remove highlightTransactionId here - let the inventory bills useEffect handle it
      }

      // Handle cash drawer sale transaction - switch to bills-management tab
      const billNumberToHighlight = sessionStorage.getItem('highlightBillNumber');
      if (billNumberToHighlight) {
        setActiveTab('bills-management');
        setHighlightBillNumber(billNumberToHighlight);
        // Don't remove highlightBillNumber here - let SoldBills component handle it
      }
    }, 100);

    return () => clearTimeout(timer);
  }, []); // Run once on mount

  // Handle transaction-based navigation for inventory bills (needs data to be ready)
  useEffect(() => {
    if (!isDataReady) return; // Wait for data to be ready
    
    const highlightTransactionId = sessionStorage.getItem('highlightTransactionId');
    
    if (highlightTransactionId) {
      // Find the inventory item related to this transaction
      const transaction = transactions.find(t => t.id === highlightTransactionId);
      if (transaction) {
        const transactionDate = new Date(transaction.createdAt || transaction.created_at || '').toISOString().split('T')[0];
        const transactionTime = new Date(transaction.createdAt || transaction.created_at || '').getTime();
        
        // Strategy 1: Match by metadata (if batch_id or inventory_bill_id is stored)
        let matchingItem = null;
        const transactionMetadata = (transaction as any).metadata;
        if (transactionMetadata) {
          const batchId = transactionMetadata.batch_id || transactionMetadata.inventory_bill_id;
          if (batchId) {
            matchingItem = inventory.find(item => item.batch_id === batchId);
          }
        }

        // Strategy 2: Match by supplier_id and date (for credit purchases)
        if (!matchingItem && transaction.supplier_id) {
          matchingItem = inventory.find(item => {
            if (!item.batch_id) return false;
            const batch = inventoryBills.find(b => b.id === item.batch_id);
            if (!batch) return false;
            const batchDate = new Date(batch.received_at || batch.created_at || '').toISOString().split('T')[0];
            return batch.supplier_id === transaction.supplier_id && batchDate === transactionDate;
          });
        }

        // Strategy 3: For cash purchases (supplier_id is null), match by date and amount
        // Cash purchases are typically created on the same day as the inventory batch
        if (!matchingItem && !transaction.supplier_id && transaction.category === 'Inventory Cash Purchase') {
          // Find items from batches created within 1 hour of the transaction
          const oneHourMs = 60 * 60 * 1000;
          matchingItem = inventory.find(item => {
            if (!item.batch_id) return false;
            const batch = inventoryBills.find(b => b.id === item.batch_id);
            if (!batch) return false;
            const batchTime = new Date(batch.received_at || batch.created_at || 0).getTime();
            const timeDiff = Math.abs(transactionTime - batchTime);
            // Match if within 1 hour and same date
            const batchDate = new Date(batch.received_at || batch.created_at || '').toISOString().split('T')[0];
            return batchDate === transactionDate && timeDiff < oneHourMs;
          });
        }

        // Strategy 4: Fallback - match any item from the same day (last resort)
        if (!matchingItem) {
          matchingItem = inventory.find(item => {
            if (!item.batch_id) return false;
            const batch = inventoryBills.find(b => b.id === item.batch_id);
            if (!batch) return false;
            const batchDate = new Date(batch.received_at || batch.created_at || '').toISOString().split('T')[0];
            return batchDate === transactionDate;
          });
        }
        
        if (matchingItem) {
          setActiveTab('received-bills');
          setFlashingItemId(matchingItem.id);
          // Also set auto-expand for the batch
          if (matchingItem.batch_id) {
            setAutoExpandGroupId(matchingItem.batch_id);
          }
        } else {
          // Still switch to received-bills tab even if we can't find the item
          setActiveTab('received-bills');
        }
        sessionStorage.removeItem('highlightTransactionId');
      } else {
        // Transaction not found, clear anyway
        sessionStorage.removeItem('highlightTransactionId');
      }
    }
  }, [isDataReady, transactions, inventory, inventoryBills]); // Run when data is ready

  // Handle auto-expand when data is ready
  useEffect(() => {
    if (isDataReady && inventory.length > 0 && flashingItemId) {
      const targetItem = inventory.find(item => item.id === flashingItemId);
      if (targetItem) {
        // Find the batch/group ID for this item
        const batchId = targetItem.batch_id;
        if (batchId) {
          setAutoExpandGroupId(batchId);
        }
      }
    }
  }, [isDataReady, inventory, flashingItemId]);

  // Stop flashing after 3 seconds
  useEffect(() => {
    if (flashingItemId) {
      const timer = setTimeout(() => {
        setFlashingItemId(null);
        setAutoExpandGroupId(null);
      }, 1700);
      
      return () => clearTimeout(timer);
    }
  }, [flashingItemId]);

  // Fetch cash drawer balance
  useEffect(() => {
    const fetchBalance = async () => {
      try {
        if (userProfile?.store_id) {
          const balance = await raw.getCurrentCashDrawerBalance?.(userProfile.store_id) || 0;
          setCashDrawerBalance(balance);
        }
      } catch (e) {
        // ignore
      }
    };
    fetchBalance();
  }, [userProfile?.store_id, raw]);

  const refreshCashDrawerBalance = async () => {
    try {
      if (userProfile?.store_id) {
        const balance = await raw.refreshCashDrawerBalance?.(userProfile.store_id) || 0;
        setCashDrawerBalance(balance);
      }
    } catch (e) {
      // ignore
    }
  };

  // Fetch current cash drawer session for payment filtering
  useEffect(() => {
    const fetchCurrentSession = async () => {
      try {
        if (userProfile?.store_id && raw.getCurrentCashDrawerStatus) {
          const status = await raw.getCurrentCashDrawerStatus();
          setCurrentCashDrawerSession(status);
        }
      } catch (e) {
        console.error('Error fetching current cash drawer session:', e);
        setCurrentCashDrawerSession(null);
      }
    };
    fetchCurrentSession();
  }, [userProfile?.store_id, raw, activeTab]);

  // Sales logs edit/delete state
  const [editingSale, setEditingSale] = useState<any>(null);
  const [showEditSaleModal, setShowEditSaleModal] = useState(false);
  const [showDeleteSaleModal, setShowDeleteSaleModal] = useState(false);
  const [saleToDelete, setSaleToDelete] = useState<any>(null);

  // Form states
  const [receiveForm, setReceiveForm] = useState({
    entityType: 'customer' as 'customer' | 'supplier',
    entityId: '',
    amount: '',
    currency: currency,
    description: '',
    reference: ''
  });

  const [payForm, setPayForm] = useState({
    entityType: 'supplier' as 'customer' | 'supplier',
    entityId: '',
    amount: '',
    currency: currency,
    description: '',
    reference: ''
  });

  const [expenseForm, setExpenseForm] = useState({
    categoryId: '',
    amount: '',
    currency: currency,
    description: '',
    reference: ''
  });

  // Enhanced financial calculations with period filtering
  const getPeriodData = useMemo(() => {
    const now = new Date();
    let startDate: Date;

    switch (dashboardPeriod) {
      case 'today':
        startDate = new Date(now.getFullYear(), now.getMonth(), now.getDate());
        break;
      case 'week':
        startDate = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
        break;
      case 'month':
        startDate = new Date(now.getFullYear(), now.getMonth(), 1);
        break;
      case 'quarter':
        const quarterStart = Math.floor(now.getMonth() / 3) * 3;
        startDate = new Date(now.getFullYear(), quarterStart, 1);
        break;
      case 'year':
        startDate = new Date(now.getFullYear(), 0, 1);
        break;
      default:
        startDate = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    }

    const filteredTransactions = transactions.filter(t => 
      new Date(t.createdAt) >= startDate
    );

    const income = filteredTransactions
      .filter(t => t.type === 'income')
      .reduce((sum, t) => {
        // Check if this transaction was originally LBP but converted to USD for storage
        const originalLBPAmount = (typeof t.description === 'string' && t.description) 
          ? t.description.match(/Originally ([\d,]+) LBP/)
          : null;
        if (originalLBPAmount) {
          // Use the original LBP amount for calculations
          const originalAmount = parseInt(originalLBPAmount[1].replace(/,/g, ''));
          return sum + getConvertedAmount(originalAmount, 'LBP');
        }
        // Otherwise use the stored amount
        return sum + getConvertedAmount(t.amount, t.currency || 'USD');
      }, 0);

    const expenses = filteredTransactions
      .filter(t => t.type === 'expense')
      .reduce((sum, t) => {
        // Check if this transaction was originally LBP but converted to USD for storage
        const originalLBPAmount = (typeof t.description === 'string' && t.description) 
          ? t.description.match(/Originally ([\d,]+) LBP/)
          : null;
        if (originalLBPAmount) {
          // Use the original LBP amount for calculations
          const originalAmount = parseInt(originalLBPAmount[1].replace(/,/g, ''));
          return sum + getConvertedAmount(originalAmount, 'LBP');
        }
        // Otherwise use the stored amount
        return sum + getConvertedAmount(t.amount, t.currency || 'USD');
      }, 0);

    const netProfit = income - expenses;
    const profitMargin = income > 0 ? (netProfit / income) * 100 : 0;

    // Previous period comparison
    const periodDays = Math.ceil((now.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24));
    const prevStartDate = new Date(startDate.getTime() - periodDays * 24 * 60 * 60 * 1000);
    const prevEndDate = new Date(startDate.getTime() - 1);

    const prevTransactions = transactions.filter(t => {
      const date = new Date(t.createdAt);
      return date >= prevStartDate && date <= prevEndDate;
    });

    const prevIncome = prevTransactions
      .filter(t => t.type === 'income')
      .reduce((sum, t) => sum + getConvertedAmount(t.amount, 'USD'), 0);

    const prevExpenses = prevTransactions
      .filter(t => t.type === 'expense')
      .reduce((sum, t) => sum + getConvertedAmount(t.amount, 'USD'), 0);

    const incomeChange = prevIncome > 0 ? ((income - prevIncome) / prevIncome) * 100 : 0;
    const expenseChange = prevExpenses > 0 ? ((expenses - prevExpenses) / prevExpenses) * 100 : 0;

    return {
      income,
      expenses,
      netProfit,
      profitMargin,
      incomeChange,
      expenseChange,
      transactionCount: filteredTransactions.length,
      avgTransactionValue: filteredTransactions.length > 0 ? (income + expenses) / filteredTransactions.length : 0
    };
  }, [transactions, dashboardPeriod, getConvertedAmount]);

  const today = new Date().toISOString().split('T')[0];

  // Toast state
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error'; visible: boolean }>({
    message: '',
    type: 'success',
    visible: false
  });
  const showToast = (message: string, type: 'success' | 'error' = 'success') => {
    setToast({ message, type, visible: true });
    setTimeout(() => setToast(t => ({ ...t, visible: false })), 3000);
  };
  const hideToast = () => setToast(t => ({ ...t, visible: false }));

  // Form handlers
  // Unified payment handler for receive and pay operations
  const handlePaymentSubmit = async (
    e: React.FormEvent, 
    formType: 'receive' | 'pay'
  ) => { 
    e.preventDefault();

    const form = formType === 'receive' ? receiveForm : payForm;
    const successMessageKey = formType === 'receive' ? 'paymentReceived' : 'paymentSent';
    const resetForm = formType === 'receive' 
      ? setReceiveForm 
      : setPayForm;
    const defaultEntityType = formType === 'receive' ? 'customer' : 'supplier';

    // Validate required fields
    if (!form.amount || parseFloat(form.amount) <= 0) {
      showToast(t('accounting.pleaseEnterValidAmount'), 'error');
      return;
    }

    if (!form.entityId) {
      showToast(t('accounting.pleaseSelectEntity'), 'error');
      return;
    }

    // Find entity from unified entities array
    const entity = allEntities.find((e: any) => e.id === form.entityId && e.entity_type === form.entityType);
    if (!entity) {
      showToast(t('accounting.entityNotFound'), 'error');
      return;
    }

    try {
      // Use the unified payment processing function from context
      const result = await raw.processPayment?.({
        entityType: form.entityType,
        entityId: form.entityId,
        amount: form.amount,
        currency: form.currency as 'USD' | 'LBP',
        description: form.description,
        reference: form.reference || generatePaymentReference(),
        storeId: userProfile?.store_id || '',
        createdBy: userProfile?.id || '',
        paymentDirection: formType // 'receive' = they pay us, 'pay' = we pay them
      });

      if (result.success) {
        await refreshCashDrawerBalance();
        // Refresh balance hooks to update UI immediately
        if (form.entityType === 'customer') {
          await customerBalances.refreshAll();
        } else if (form.entityType === 'supplier') {
          await supplierBalances.refreshAll();
        }
        showToast(t(`accounting.${successMessageKey}`, { 
          amount: formatCurrencyWithSymbol(parseFloat(form.amount), form.currency),
          entityName: entity.name 
        }), 'success');
      } else {
        showToast(result.error || 'Failed to record payment.', 'error');
      }
    } catch (err) {
      console.log(err);
      showToast(t('accounting.failedToRecordPayment'), 'error');
    }

    resetForm({
      entityType: defaultEntityType as 'customer' | 'supplier',
      entityId: '',
      amount: '',
      currency: currency,
      description: '',
      reference: ''
    });
    setShowForm(null);
  };

  // Wrapper functions for backward compatibility with existing form components
  const handleReceiveSubmit = (e: React.FormEvent) => handlePaymentSubmit(e, 'receive');
  const handlePaySubmit = (e: React.FormEvent) => handlePaymentSubmit(e, 'pay');

  const handleExpenseSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const category = expenseCategories.find(c => c.id === expenseForm.categoryId);
    if (!category) return;

    try {
      // Use context method to process cash drawer transaction
      const expenseResult = await raw.processCashDrawerTransaction({
        type: 'expense',
        amount: parseFloat(expenseForm.amount),
        currency: expenseForm.currency as 'USD' | 'LBP',
        description: `Expense: ${category.name} - ${expenseForm.description}`,
        reference: expenseForm.reference || generateExpenseReference(),
        storeId: userProfile?.store_id || '',
        createdBy: userProfile?.id || ''
      });

      if (!expenseResult.success) {
        showToast(expenseResult.error || 'Failed to record expense', 'error');
        return;
      }

      await refreshCashDrawerBalance();

      // Refresh data to show new transaction in Recent Activity
      await raw.refreshData();

      showToast(t('accounting.expenseRecorded', { 
        amount: formatCurrencyWithSymbol(parseFloat(expenseForm.amount), expenseForm.currency),
        categoryName: category.name 
      }), 'success');
    } catch (err) {
      console.log(err);
      showToast(t('accounting.failedToRecordExpense'), 'error');
    }

    setExpenseForm({
      categoryId: '',
      amount: '',
      currency: currency,
      description: '',
      reference: ''
    });
    setShowForm(null);
  };

  // Add to Accounting component state:
  const [nonPricedItems, setNonPricedItems] = useState<any[]>([]);
  const [stagedNonPricedChanges, setStagedNonPricedChanges] = useState<{[key: string]: any}>({});
  const [nonPricedSearch, setNonPricedSearch] = useLocalStorage('accounting_nonPricedSearch', '');
  const [nonPricedSort, setNonPricedSort] = useLocalStorage<'customer'|'product'|'date'|'value'>('accounting_nonPricedSort', 'date');
  const [nonPricedSortDir, setNonPricedSortDir] = useLocalStorage<'asc'|'desc'>('accounting_nonPricedSortDir', 'desc');
  const [nonPricedPage, setNonPricedPage] = useLocalStorage('accounting_nonPricedPage', 1);
  const [showBulkActions, setShowBulkActions] = useState(false);
  const [selectedNonPriced, setSelectedNonPriced] = useState<string[]>([]);
  const NON_PRICED_PAGE_SIZE = 10;

  // Load non-priced items from sales data and inventory items
  useEffect(() => {
    const loadNonPricedItems = async () => {
      // Load non-priced sales items
      const nonPricedSales = sales.filter(sale => sale.unit_price === 0).map(sale => ({
        ...sale,
        itemType: 'sale' as const,
        unit_price: sale.unit_price || 0
      }));

      // Load non-priced inventory items (from credit/cash bills only)
      const { getDB } = await import('../lib/db');
      const allInventoryItems = await getDB().inventory_items.toArray();
      const allBatches = await getDB().inventory_bills.toArray();
      const batchMap = new Map(allBatches.map(b => [b.id, b]));
      
      const nonPricedInventory = allInventoryItems
        .filter(item => {
          if (!item.batch_id) return false;
          const batch = batchMap.get(item.batch_id);
          // Only include credit/cash bills (commission bills don't need prices)
          if (!batch || (batch.type !== 'credit' && batch.type !== 'cash')) return false;
          // Check if price is missing or zero
          return !item.price || item.price === 0 || isNaN(Number(item.price));
        })
        .map(item => {
          const batch = batchMap.get(item.batch_id!);
          const product = products.find(p => p.id === item.product_id);
          const supplier = suppliers.find(s => s.id === batch?.supplier_id);
          
          return {
            id: item.id,
            itemType: 'inventory' as const,
            product_id: item.product_id,
            productName: product?.name || 'Unknown Product',
            supplierName: supplier?.name || 'Unknown Supplier',
            customerName: '', // Inventory items don't have customers
            quantity: item.quantity,
            weight: item.weight || 0,
            unit_price: item.price || 0,
            unit: item.unit,
            batch_id: item.batch_id,
            batch_type: batch?.type,
            created_at: item.created_at,
            date: item.created_at
          };
        });

      setNonPricedItems([...nonPricedSales, ...nonPricedInventory]);
    };

    if (activeTab === 'nonpriced') {
      loadNonPricedItems();
    }
  }, [sales, inventory, products, suppliers, activeTab]);

  // Helper function to get current value including staged changes
  const getCurrentValue = (item: any, field: string) => {
    const stagedChanges = stagedNonPricedChanges[item.id] || {};
    return stagedChanges[field] !== undefined ? stagedChanges[field] : item[field];
  };

  // Helper function to stage a change
  const stageChange = (itemId: string, field: string, value: any) => {
    setStagedNonPricedChanges(prev => ({
      ...prev,
      [itemId]: {
        ...prev[itemId],
        [field]: value
      }
    }));
  };

  const handleSaveNonPriced = async (updated: any) => {
    if (!updated.unitPrice || updated.unitPrice <= 0) {
      showToast(t('accounting.pleaseEnterValidUnitPrice'), 'error');
      return;
    }
    if (!updated.quantity || updated.quantity <= 0) {
      showToast(t('accounting.pleaseEnterValidQuantity'), 'error');
      return;
    }

    try {
      if (updated.itemType === 'inventory') {
        // Update inventory item price
        await raw.updateInventoryItem(updated.id, {
          price: updated.unitPrice,
          quantity: updated.quantity,
          weight: updated.weight || null
        });
        showToast(t('accounting.itemUpdatedSuccessfully'), 'success');
      } else {
        // Update the sale record directly
        await updateSale(updated.id, {
          unit_price: updated.unitPrice,
          quantity: updated.quantity,
          weight: updated.weight || null,
          received_value: updated.unitPrice * updated.quantity
        });

        // The updateSale function now automatically handles bill updates
        // But we can also explicitly trigger it here for immediate feedback
        try {
          await raw.updateBillsForSaleItem?.(updated.id);
        } catch (billError) {
          console.warn('Failed to update bills immediately:', billError);
          // Don't show error to user as the sale was updated successfully
        }

        showToast(t('accounting.itemUpdatedSuccessfully'), 'success');
      }
    } catch (error) {
      console.error('Error updating non-priced item:', error);
      showToast(t('accounting.errorUpdatingItem'), 'error');
    }
  };

  const handleMarkPriced = async (item: any) => {
    // Get staged changes for this item
    const stagedChanges = stagedNonPricedChanges[item.id] || {};
    const updatedItem = { ...item, ...stagedChanges };

    if (!updatedItem.unit_price || updatedItem.unit_price <= 0) {
      showToast('Set a valid price before marking as priced.', 'error');
      return;
    }
    if (!updatedItem.quantity || updatedItem.quantity <= 0) {
      showToast('Set a valid quantity before marking as priced.', 'error');
      return;
    }

    try {
      if (item.itemType === 'inventory') {
        // Update inventory item price
        await raw.updateInventoryItem(item.id, {
          price: updatedItem.unit_price,
          quantity: updatedItem.quantity,
          weight: updatedItem.weight || null
        });
      } else {
        // Update the sale record to mark it as priced
        await updateSale(item.id, {
          unit_price: updatedItem.unit_price,
          quantity: updatedItem.quantity,
          weight: updatedItem.weight || null,
          received_value: updatedItem.unit_price * updatedItem.quantity
        });
      }

      // Clear staged changes for this item
      setStagedNonPricedChanges(prev => {
        const newChanges = { ...prev };
        delete newChanges[item.id];
        return newChanges;
      });

      showToast(t('accounting.itemMarkedAsPriced'), 'success');
    } catch (error) {
      console.error('Error marking item as priced:', error);
      showToast(t('accounting.errorMarkingAsPriced'), 'error');
    }
  };

  const handleBulkMarkPriced = async () => {
    const validItems = selectedNonPriced
      .map(id => {
        const item = nonPricedItems.find(item => item.id === id);
        if (!item) return null;

        // Get staged changes for this item
        const stagedChanges = stagedNonPricedChanges[item.id] || {};
        const updatedItem = { ...item, ...stagedChanges };

        return updatedItem.unit_price > 0 && updatedItem.quantity > 0 ? updatedItem : null;
      })
      .filter(item => item !== null);

    if (validItems.length === 0) {
      showToast(t('accounting.noValidItemsSelected'), 'error');
      return;
    }

    try {
      for (const item of validItems) {
        if (item.itemType === 'inventory') {
          await raw.updateInventoryItem(item.id, {
            price: item.unit_price,
            quantity: item.quantity,
            weight: item.weight || null
          });
        } else {
          await updateSale(item.id, {
            unit_price: item.unit_price,
            quantity: item.quantity,
            weight: item.weight || null,
          received_value: item.unit_price * item.quantity
        });
      }

      // Clear staged changes for all processed items
      setStagedNonPricedChanges(prev => {
        const newChanges = { ...prev };
        validItems.forEach(item => {
          delete newChanges[item.id];
        });
        return newChanges;
      });

      setSelectedNonPriced([]);
      setShowBulkActions(false);
      showToast(t('accounting.itemsMarkedAsPriced', { count: validItems.length }), 'success');
    }} catch (error) {
      console.error('Error bulk marking items as priced:', error);
      showToast(t('accounting.errorMarkingItemsAsPriced'), 'error');
    }
  };

  const handleDeleteNonPriced = async (item: any) => {
    // Only allow deletion of sales items, not inventory items
    if (item.itemType === 'inventory') {
      showToast('Inventory items cannot be deleted. Please set a price instead.', 'error');
      return;
    }
    
    if (window.confirm('Are you sure you want to delete this item?')) {
      try {
        await deleteSale(item.id);
        showToast(t('accounting.itemDeletedSuccessfully'), 'success');
      } catch (error) {
        console.error('Error deleting non-priced item:', error);
        showToast(t('accounting.errorDeletingItem'), 'error');
      }
    }
  };

  const handleBulkDelete = async () => {
    // Filter to only sales items (inventory items cannot be deleted)
    const salesItems = selectedNonPriced
      .map(id => nonPricedItems.find(item => item.id === id))
      .filter(item => item && item.itemType !== 'inventory');
    
    if (salesItems.length === 0) {
      showToast('Inventory items cannot be deleted. Please set prices instead.', 'error');
      return;
    }
    
    if (window.confirm(`Are you sure you want to delete ${salesItems.length} item(s)?`)) {
      try {
        for (const item of salesItems) {
          await deleteSale(item!.id);
        }

        setSelectedNonPriced([]);
        setShowBulkActions(false);
        showToast(t('accounting.itemsDeletedSuccessfully'), 'success');
      } catch (error) {
        console.error('Error bulk deleting items:', error);
        showToast(t('accounting.errorDeletingItems'), 'error');
      }
    }
  };

  const exportNonPricedItems = () => {
    const csvContent = [
      ['Customer', 'Product', 'Supplier', 'Quantity', 'Weight', 'Unit Price', 'Total Value', 'Date Added', 'Notes'].join(','),
      ...displayNonPricedItems.map(item => [
        item.customerName,
        item.productName,
        item.supplierName,
        item.quantity || '',
        item.weight || '',
        item.unit_price || '',
        item.totalValue ? item.totalValue.toFixed(2) : '',
        item.date ? new Date(item.date).toLocaleDateString() : '',
        (item.status || '').replace(/,/g, ';')
      ].join(','))
    ].join('\n');

    const blob = new Blob([csvContent], { type: 'text/csv' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `non-priced-items-${new Date().toISOString().split('T')[0]}.csv`;
    a.click();
    window.URL.revokeObjectURL(url);
  };

  // Enhanced nonPricedItems for display: filter, sort, and resolve customer name
  // Create efficient lookup maps for O(1) access
  const batchMap = new Map(inventoryBills.map(b => [b.id, b]));
  const inventoryItemMap = new Map(inventory.map(item => [item.id, item]));
  const supplierMap = new Map(suppliers.map(s => [s.id, s]));
  const productMap = new Map(products.map(p => [p.id, p]));
  const billMap = new Map(bills.map(b => [b.id, b]));
  const customerMap = new Map(customers.map(c => [c.id, c]));
  
  const filteredNonPricedItems = nonPricedItems
    .map(item => {
      // Get product using efficient map lookup
      const product = productMap.get(item.product_id);
      
      // Get customer_id from parent bill (normalized schema)
      const bill = billMap.get(item.bill_id);
      const customer = bill?.entity_id ? customerMap.get(bill.entity_id) : null;
      
      // Supplier lookup: inventory_item_id → inventory → batch_id → inventory_bills → supplier_id
      let supplier = null;
      if (item.inventory_item_id) {
        const inventoryItem = inventoryItemMap.get(item.inventory_item_id);
        if (inventoryItem?.batch_id) {
          const batch = batchMap.get(inventoryItem.batch_id);
          if (batch?.supplier_id) {
            supplier = supplierMap.get(batch.supplier_id);
            if (!supplier) {
              console.warn(`[Accounting] Supplier not found for supplier_id: ${batch.supplier_id} (from batch: ${inventoryItem.batch_id})`);
            }
          } else {
            console.warn(`[Accounting] Batch not found or missing supplier_id: ${inventoryItem.batch_id}`);
          }
        } else if (inventoryItem) {
          console.warn(`[Accounting] Inventory item missing batch_id: ${item.inventory_item_id}`);
        } else {
          console.warn(`[Accounting] Inventory item not found: ${item.inventory_item_id}`);
        }
      }
      // Fallback: If no inventory_item_id, supplier remains null (will show "Unknown Supplier")

      // Get staged changes for this item
      const stagedChanges = stagedNonPricedChanges[item.id] || {};
      const currentUnitPrice = stagedChanges.unit_price !== undefined ? stagedChanges.unit_price : item.unit_price;
      const currentQuantity = stagedChanges.quantity !== undefined ? stagedChanges.quantity : item.quantity;
      const currentWeight = stagedChanges.weight !== undefined ? stagedChanges.weight : item.weight;

      // Calculate total value: prioritize weight if it exists (even if 0), otherwise use quantity
      // This matches the logic used in SoldBills.tsx for calculating line_total
      // If weight is not null/undefined, it's a weight-based item, so use weight
      // Otherwise, it's a quantity-based item, so use quantity
      const totalValue = currentUnitPrice && currentUnitPrice > 0
        ? (currentWeight == null || currentWeight == undefined || currentWeight == 0
          ? currentUnitPrice * currentQuantity
          : currentUnitPrice * currentWeight)
        : 0;
      
      // Status: ready if has price and (quantity or weight), incomplete otherwise
      const status = currentUnitPrice > 0 && (currentQuantity > 0 || currentWeight > 0) 
        ? 'ready' 
        : 'incomplete';

      return {
        ...item,
        customerName: customer?.name || 'Walk-in Customer',
        productName: getProductName(product) || 'Unknown Product',
        supplierName: supplier?.name || 'Unknown Supplier',
        date: item.created_at || '',
        totalValue,
        status
      };
    })
    .filter(item => {
      const q = nonPricedSearch.toLowerCase();
      return (
        item.customerName.toLowerCase().includes(q) ||
        item.productName.toLowerCase().includes(q) ||
        item.supplierName.toLowerCase().includes(q) ||
        (item.status || '').toLowerCase().includes(q)
      );
    })
    .sort((a, b) => {
      let cmp = 0;
      if (nonPricedSort === 'customer') cmp = a.customerName.localeCompare(b.customerName);
      if (nonPricedSort === 'product') cmp = a.productName.localeCompare(b.productName);
      if (nonPricedSort === 'date') cmp = new Date(a.date).getTime() - new Date(b.date).getTime();
      if (nonPricedSort === 'value') cmp = a.totalValue - b.totalValue;
      return nonPricedSortDir === 'asc' ? cmp : -cmp;
    });

  const displayNonPricedItems = filteredNonPricedItems;
  const nonPricedTotalPages = Math.ceil(filteredNonPricedItems.length / NON_PRICED_PAGE_SIZE);
  const pagedNonPricedItems = filteredNonPricedItems.slice(
    (nonPricedPage - 1) * NON_PRICED_PAGE_SIZE,
    nonPricedPage * NON_PRICED_PAGE_SIZE
  );

  const handleCloseReceivedBill = async (bill: any, fees: { commission: number; porterage: number; transfer: number; plastic?: number; supplierAmount: number, currency: 'USD' | 'LBP' }) => {

    try {
      // Guard: do not allow closing an already closed bill
      if (bill?.status && typeof bill.status === 'string' && bill.status.includes('[CLOSED]')) {
        showToast(t('accounting.billAlreadyClosed'), 'error');
        return;
      }

      // Check for non-priced items in credit/cash bills - cannot close if items have no price
      const targetBatchId = bill.batchId || bill.batch_id;
      if (!targetBatchId) {
        console.warn('⚠️ No batch ID found for bill:', bill);
        throw new Error('Cannot close bill: Missing batch identifier');
      }

      const { getDB } = await import('../lib/db');
      const batch = await getDB().inventory_bills.get(targetBatchId);
      if (!batch) {
        console.warn('⚠️ Batch not found for ID:', targetBatchId);
        throw new Error('Cannot close bill: Batch not found');
      }

      const billType = batch.type || bill.type || (bill as any).batchType;
      console.log(`🔍 Checking bill closure for batch ${targetBatchId}, type: ${billType}`);
      
      // Only check for cash/credit bills (commission bills don't need prices)
      if (billType === 'cash' || billType === 'credit') {
        const inventoryItems = await getDB().inventory_items
          .where('batch_id')
          .equals(targetBatchId)
          .toArray();
        
        console.log(`🔍 Found ${inventoryItems.length} inventory items for batch ${targetBatchId}`);
        
        // Filter items that don't have a valid price
        const nonPricedItems = inventoryItems.filter(item => {
          const price = item.price;
          const isValid = price === null || price === undefined || price === 0 || isNaN(Number(price)) || Number(price) <= 0;
          if (isValid) {
            console.log(`⚠️ Non-priced item found: ${item.id}, price: ${price}`);
          }
          return isValid;
        });
        
        if (nonPricedItems.length > 0) {
          console.error('cannotCloseBillWithNonPricedItems');
          
          // Get product names for error message
          const productIds = [...new Set(nonPricedItems.map(item => item.product_id))];
          const products = await getDB().products
            .where('id')
            .anyOf(productIds)
            .toArray();
          
          const productMap = new Map(products.map(p => [p.id, p]));
          const productNames = nonPricedItems
            .map(item => {
              const product = productMap.get(item.product_id);
              return product?.name || `Product ${item.product_id.substring(0, 8)}`;
            })
            .filter((name, index, arr) => arr.indexOf(name) === index) // Remove duplicates
            .slice(0, 5); // Limit to first 5 products to avoid overly long messages
          
          const remainingCount = nonPricedItems.length - productNames.length;
          const productsList = productNames.join(', ');
          const productsText = remainingCount > 0 
            ? `${productsList} and ${remainingCount} more item(s)`
            : productsList;
          
          const errorMessage = t('accounting.cannotCloseBillWithNonPricedItems', { 
            count: nonPricedItems.length, 
            products: productsText 
          });
          showToast(errorMessage, 'error');
          throw new Error(errorMessage);
        }
        
        console.log(`✅ All items have valid prices for batch ${targetBatchId}`);
      }

      // Calculate total revenue from the bill (includes commission, fees, and supplier amount)
      const plasticFee = fees.plastic || 0;
      const totalRevenue = fees.commission + fees.porterage + fees.transfer + plasticFee + fees.supplierAmount;

      // Add commission transaction (if applicable)
      if (fees.commission > 0) {
        const safeCommissionAmount = CurrencyService.getInstance().safeConvertForDatabase(fees.commission, currency as 'USD' | 'LBP');
        await addTransaction({
          id: raw.createId?.() || crypto.randomUUID(),
          type: 'income',
          category: 'Commission',
          supplier_id: bill.supplier_id,
          amount: safeCommissionAmount.amount,
          currency: safeCommissionAmount.currency,
          description: `Commission fee for ${bill.productName} sold on behalf of ${bill.supplierName}${safeCommissionAmount.wasConverted ? ` (Originally ${fees.commission} ${currency})` : ''}`,
          reference: generateCommissionReference(),
          created_by: userProfile?.id || ''
        });
        
        // Balances are now calculated from journal entries - no need to update
        // The transaction above will create journal entries which automatically update the balance
      }

      // NOTE: Porterage, transfer, and plastic fees were already paid at purchase time and deducted from cash drawer.
      // We do NOT create new transactions for these fees when closing the bill - they are only used in calculations.
      // The fees are already recorded as expenses when the bill was received.
      // We only record the commission (income) and supplier payment (expense) at bill closing.

      // Add supplier payment transaction
      if (fees.supplierAmount > 0) {
        const safeSupplierAmount = CurrencyService.getInstance().safeConvertForDatabase(fees.supplierAmount, currency as 'USD' | 'LBP');
        await addTransaction({
          id: raw.createId?.() || crypto.randomUUID(),
          supplier_id: bill.supplier_id,
          type: 'expense',
          category: PAYMENT_CATEGORIES.SUPPLIER_PAYMENT,
          amount: safeSupplierAmount.amount,
          currency: safeSupplierAmount.currency,
          description: `Payment to ${bill.supplierName} for ${bill.productName} sales${safeSupplierAmount.wasConverted ? ` (Originally ${fees.supplierAmount} ${currency})` : ''}`,
          reference: generatePaymentReference(),
          created_by: userProfile?.id || ''
        });
        console.log('supplier', bill.supplier_id, 'fees.supplierAmount', fees.supplierAmount);
        // Balances are now calculated from journal entries - no need to update
        // The transaction above will create journal entries which automatically update the balance
      }
      console.log('bill', bill);
      // Persist closed flag onto the inventory batch by updating status
      // Also store the commission_amount and closed_at timestamp
      // Calculate and store P&L values
      try {
        const existingStatus = bill.status || '';
        const closedStatus = existingStatus==='CLOSED' ? existingStatus : "CLOSED";
        const targetBatchId = bill.batchId || bill.batch_id;
        if (!targetBatchId) {
          console.warn('No batch identifier available when attempting to close bill:', bill);
        } else {
          // Get batch and database reference
          const { getDB } = await import('../lib/db');
          const batch = await getDB().inventory_bills.get(targetBatchId);
          const billType = batch?.type || bill.type || (bill as any).batchType;
          
          // Calculate P&L before closing
          const { profitLossService } = await import('../services/profitLossService');
          let plData;
          try {
            plData = await profitLossService.calculateBillPL(targetBatchId);
          } catch (error) {
            console.error(`❌ Failed to calculate P&L for bill ${targetBatchId}:`, error);
            // For commission bills, we can still proceed with manually calculated values
            if (billType === 'commission') {
              console.warn(`⚠️ Falling back to manual P&L calculation for commission bill ${targetBatchId}`);
              plData = {
                revenue: 0,
                revenueCash: 0,
                revenueCard: 0,
                revenueCredit: 0,
                cogs: 0,
                grossProfit: 0,
                grossProfitMargin: 0,
              };
            } else {
              throw new Error(`Failed to calculate P&L: ${error instanceof Error ? error.message : 'Unknown error'}`);
            }
          }
          
          // CRITICAL: For commission bills, calculate revenue from batch's commission_rate
          // This ensures revenue = commission amount, NOT total sales
          if (billType === 'commission') {
            // Get the commission rate directly from the batch (the source of truth)
            const commissionRate = batch?.commission_rate;
            
            // If no commission rate, try to get it from the bill object
            const effectiveCommissionRate = commissionRate ?? (bill as any).commissionRate ?? 10; // Default to 10% if missing
            
            console.log(`📊 Commission bill ${targetBatchId}: commission_rate from batch = ${commissionRate}, effective rate = ${effectiveCommissionRate}%`);
            
            // Calculate total sales from bill_line_items
            const inventoryItems = await getDB().inventory_items
              .where('batch_id')
              .equals(targetBatchId)
              .toArray();
            
            const inventoryItemIds = inventoryItems.map(item => item.id);
            const billLineItems = inventoryItemIds.length > 0
              ? await getDB().bill_line_items
                  .where('inventory_item_id')
                  .anyOf(inventoryItemIds)
                  .toArray()
              : [];
            
            const totalSales = billLineItems.reduce((sum, item) => sum + (item.line_total || 0), 0);
            
            // Calculate correct commission revenue
            const commissionRevenue = (totalSales * effectiveCommissionRate) / 100;
            
            console.log(`📊 Commission bill ${targetBatchId}: Total sales = $${totalSales.toFixed(2)}, Commission revenue = $${commissionRevenue.toFixed(2)}`);
            
            // ALWAYS set revenue to commission amount for commission bills
            plData.revenue = commissionRevenue;
            
            // Calculate revenue breakdown by payment method
            const bills = await getDB().bills
              .where('id')
              .anyOf([...new Set(billLineItems.map(item => item.bill_id))])
              .toArray();
            const billMap = new Map(bills.map(b => [b.id, b]));
            
            let revenueCash = 0;
            let revenueCard = 0;
            let revenueCredit = 0;
            
            for (const lineItem of billLineItems) {
              const parentBill = billMap.get(lineItem.bill_id);
              const paymentMethod = parentBill?.payment_method || 'cash';
              const lineTotal = lineItem.line_total || 0;
              const commissionFromSale = (lineTotal * effectiveCommissionRate) / 100;
              
              if (paymentMethod === 'cash') {
                revenueCash += commissionFromSale;
              } else if (paymentMethod === 'card') {
                revenueCard += commissionFromSale;
              } else if (paymentMethod === 'credit') {
                revenueCredit += commissionFromSale;
              }
            }
            
            plData.revenueCash = revenueCash;
            plData.revenueCard = revenueCard;
            plData.revenueCredit = revenueCredit;
            
            // COGS for commission bills is always 0
            plData.cogs = 0;
            
            // Calculate gross profit and margin
            plData.grossProfit = commissionRevenue;
            plData.grossProfitMargin = 100; // 100% margin since COGS = 0
            
            console.log(`✅ Commission bill ${targetBatchId}: Final P&L - Revenue: $${plData.revenue.toFixed(2)}, COGS: $${plData.cogs.toFixed(2)}, Profit: $${plData.grossProfit.toFixed(2)}`);
          }
          
          // Store P&L values along with commission_amount and closed_at
          // Store everything in a single operation to ensure consistency
          await handleUpdateBatch(targetBatchId, { 
            status: closedStatus,
            commission_amount: fees.commission, // Store calculated commission
            closed_at: new Date().toISOString(), // Store closure timestamp
            total_revenue: plData.revenue,
            revenue_cash: plData.revenueCash,
            revenue_card: plData.revenueCard,
            revenue_credit: plData.revenueCredit,
            total_cogs: plData.cogs,
            gross_profit: plData.grossProfit,
            gross_profit_margin: plData.grossProfitMargin
          });
          
          console.log(`✅ Bill ${targetBatchId} closed with commission: ${fees.commission} ${fees.currency}`);
          console.log(`✅ P&L calculated - Revenue: ${plData.revenue}, COGS: ${plData.cogs}, Gross Profit: ${plData.grossProfit}`);
        }
      } catch (e) {
        console.warn('Failed to persist closed flag on inventory batch:', e);
      }

      showToast(t('accounting.billClosedSuccessfully'), 'success');
    } catch (error) {
      console.error('Error closing received bill:', error);
      // Preserve the original error message if it's a validation error
      if (error instanceof Error && error.message.includes('Cannot close bill')) {
        throw error; // Re-throw the original validation error
      }
      throw new Error(error instanceof Error ? error.message : 'Failed to close bill.'+error);
    }
  };

  const handleUpdateBatch  = async (batchId: string, updates: Partial<{ porterage_fee?: number | null; transfer_fee?: number | null; notes?: string | null; plastic_fee?: string | null; plastic_count?: number | null; plastic_price?: number | null; commission_rate?: number | null; commission_amount?: number | null; closed_at?: string | null; received_at?: string | null; status?: string | null; type?: string | null; supplier_id?: string | null; total_revenue?: number | null; revenue_cash?: number | null; revenue_card?: number | null; revenue_credit?: number | null; total_cogs?: number | null; gross_profit?: number | null; gross_profit_margin?: number | null; }>) => {
    console.log('[Accounting] handleUpdateBatch - Called with:', { batchId, updates });
    try {
      // Update batch information
      console.log('[Accounting] handleUpdateBatch - Calling updateInventoryBatch...');
      await updateInventoryBatch(batchId, updates);
      console.log('[Accounting] handleUpdateBatch - updateInventoryBatch completed successfully');
      showToast(t('accounting.batchUpdatedSuccessfully'), 'success');
    } catch (error) {
      console.error('[Accounting] handleUpdateBatch - Error:', error);
      showToast(t('accounting.errorUpdatingBatch'), 'error');
    }
  };

  const handleEditSale = (sale: any) => {
    console.log('handleEditSale called with sale:', sale);
    // Sale is already a BillLineItem with correct field names
    setEditingSale(sale);
    setShowEditSaleModal(true);
  };

  const handleSaveSaleEdit = async (updatedSale: any) => {
    try {
      // Get the original sale to compare quantities
      const originalSale = editingSale;
      const quantityChanged = originalSale.quantity !== updatedSale.quantity;

      await updateSale(editingSale.id, {
        quantity: updatedSale.quantity,
        weight: updatedSale.weight,
        unit_price: updatedSale.unitPrice,
        received_value: updatedSale.receivedValue,
        payment_method: updatedSale.paymentMethod,
        customer_id: updatedSale.customerId || null,
        notes: updatedSale.notes || null
      });

      showToast(t('accounting.saleUpdatedSuccessfully'), 'success');
      setShowEditSaleModal(false);
      setEditingSale(null);
    } catch (error) {
      console.error('Error updating sale:', error);
      showToast(t('accounting.errorUpdatingSale'), 'error');
    }
  };

  const handleDeleteSale = (sale: any) => {
    setSaleToDelete(sale);
    setShowDeleteSaleModal(true);
  };

  const handleConfirmDeleteSale = async () => {
    if (!saleToDelete) return;

    try {
      await deleteSale(saleToDelete.id);
      showToast(t('accounting.saleDeletedSuccessfully'), 'success');
      setShowDeleteSaleModal(false);
      setSaleToDelete(null);
    } catch (error) {
      console.error('Error deleting sale:', error);
      showToast(t('accounting.errorDeletingSale'), 'error');
    }
  };

  // Filter transactions by current cash drawer session
  const sessionFilteredTransactions = useMemo(() => {
    // If no active session or session info, return empty array for payments
    if (!currentCashDrawerSession || currentCashDrawerSession.status !== 'active') {
      return [];
    }

    // Filter transactions to only those within the current session time window
    const sessionStartTime = new Date(currentCashDrawerSession.openedAt).getTime();
    
    return transactions.filter(t => {
      const transactionTime = new Date(t.created_at).getTime();
      return transactionTime >= sessionStartTime;
    });
  }, [transactions, currentCashDrawerSession]);

  // Show loading screen if data is not ready
  if (!isDataReady) {
    return (
      <div className="p-6">
        <div className="flex items-center justify-center h-64">
          <div className="text-center">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-4"></div>
            <p className="text-gray-600">{t('accounting.loadingData')}</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="p-6">
      <Toast message={toast.message} type={toast.type} visible={toast.visible} onClose={hideToast} />
      {/* Quick Action Bar */}
      <ActionTabsBar
        activeTab={activeTab}
        setActiveTab={setActiveTab}
        filteredNonPricedItems={filteredNonPricedItems}
      />

      {activeTab === 'dashboard' && (
        <div className="space-y-6">
          <DashboardOverview
            cashDrawerBalance={cashDrawerBalance}
            refreshCashDrawerBalance={refreshCashDrawerBalance}
            formatCurrency={formatCurrency}
            formatCurrencyWithSymbol={formatCurrencyWithSymbol}
            dashboardPeriod={dashboardPeriod}
            getPeriodData={getPeriodData}
            entities={allEntities}
            customerBalances={customerBalances}
            supplierBalances={supplierBalances}
            transactions={transactions}
            inventory={inventory}
            products={products}
          />
        </div>
      )}


      {activeTab === 'nonpriced' && (
        <div className="space-y-6">
           <NonPricedItems
              filteredNonPricedItems={filteredNonPricedItems}
              pagedNonPricedItems={pagedNonPricedItems}
              stagedNonPricedChanges={stagedNonPricedChanges}
              selectedNonPriced={selectedNonPriced}
              nonPricedPage={nonPricedPage}
              nonPricedTotalPages={nonPricedTotalPages}
              nonPricedSearch={nonPricedSearch}
              nonPricedSort={nonPricedSort}
              nonPricedSortDir={nonPricedSortDir}
              NON_PRICED_PAGE_SIZE={10}
              exportNonPricedItems={exportNonPricedItems}
              handleBulkMarkPriced={handleBulkMarkPriced}
              handleBulkDelete={handleBulkDelete}
              handleDeleteNonPriced={handleDeleteNonPriced}
              handleMarkPriced={handleMarkPriced}
              setNonPricedPage={setNonPricedPage}
              setNonPricedSort={setNonPricedSort}
              setNonPricedSortDir={setNonPricedSortDir}
              setNonPricedSearch={setNonPricedSearch}
              setSelectedNonPriced={setSelectedNonPriced}
              setShowBulkActions={setShowBulkActions}
              setStagedNonPricedChanges={setStagedNonPricedChanges}
              stageChange={stageChange}
              getCurrentValue={getCurrentValue}
              showToast={showToast}
              showBulkActions={showBulkActions}
              formatCurrencyWithSymbol={formatCurrencyWithSymbol}
              currency={currency}
            />
        </div>
      )}
         {/* Cash Drawer Tab */}
         {activeTab === 'cash-drawer' && (
        <div className="bg-white rounded-lg shadow-sm p-6">
          <h3 className="text-lg font-semibold text-gray-900 mb-4">{t('accounting.cashDrawerManagement')}</h3>
          <div className="space-y-6">
            {/* Current Status */}
            <CurrentCashDrawerStatus 
              storeId={storeId || ''} 
              getCurrentStatus={getCurrentCashDrawerStatus}
            />
            
            {/* Balance Report */}
            <CashDrawerBalanceReport
              storeId={storeId || ''}
              getBalanceReport={getCashDrawerBalanceReport}
              getSessionDetails={getCashDrawerSessionDetails}
            />
          </div>
        </div>
      )}

   

      {activeTab === 'bills-management' && (
        <SoldBills highlightBillNumber={highlightBillNumber} />
      )}

      {activeTab === 'received-bills' && (
        <ReceivedBills
          inventory={inventory}
          inventoryBills={inventoryBills}
          bills={bills}
          products={products}
          entities={allEntities}
          sales={sales}
          formatCurrency={formatCurrency}
          showToast={showToast}
          onEditSale={handleEditSale}
          onDeleteSale={handleDeleteSale}
          onCloseBill={handleCloseReceivedBill}
          onUpdateBatch={handleUpdateBatch}
          defaultCommissionRate={defaultCommissionRate}
          recentEntities={recentEntities}
          setRecentEntities={setRecentEntities}
          addSupplier={addSupplier}
          flashingItemId={flashingItemId}
          autoExpandGroupId={autoExpandGroupId}
        />
      )}

      {activeTab === 'payments' && (
        <RecentPayments
          formatCurrency={formatCurrency}
          formatCurrencyWithSymbol={formatCurrencyWithSymbol}
        />
      )}

      {/* Forms Modal */}
      {showForm && (
        <PaymentsModal
          isOpen={!!showForm}
          onClose={() => setShowForm(null)}
          formType={showForm}
          formProps={{
            receiveForm,
            setReceiveForm,
            payForm,
            setPayForm,
            expenseForm,
            setExpenseForm,

            entities: allEntities, // Unified entities array
            expenseCategories,

            recentEntities,
            recentCategories,
            setRecentEntities,
            setRecentCategories,

            setShowAddCustomerForm: () => {
              showToast(t('accounting.pleaseAddCustomerFromCustomersPage'), 'info');
            },
            setShowAddSupplierForm: () => {
              showToast(t('accounting.pleaseAddSupplierFromCustomersPage'), 'info');
            },

            handleReceiveSubmit,
            handlePaySubmit,
            handleExpenseSubmit,

            showToast,
            currency,
            formatCurrencyWithSymbol,
            formatCurrency,
            getConvertedAmount,
          }}
        />

      )}

      {/* Edit Sale Modal */}
      {showEditSaleModal && editingSale && (
        <EditSaleModal
          originalSale={editingSale}
          isOpen={showEditSaleModal}
          sale={editingSale}
          entities={allEntities}
          formatCurrency={formatCurrency}
          onClose={() => {
            setShowEditSaleModal(false);
            setEditingSale(null);
          }}
          onSave={handleSaveSaleEdit}
        />
      )}

      {/* Delete Sale Confirmation Modal */}
      {showDeleteSaleModal && saleToDelete && (
        <DeleteSaleModal
          isOpen={showDeleteSaleModal && !!saleToDelete}
          onClose={() => setShowDeleteSaleModal(false)}
          onConfirm={handleConfirmDeleteSale}
          title={t('accounting.deleteCustomer')}
          itemLabel="Customer"
          itemDetails={[
            { label: "Name", value: saleToDelete?.name },
            { label: "Email", value: saleToDelete?.email }
          ]}
        />
      )}
    </div>
  );
}