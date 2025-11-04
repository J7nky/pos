import React, { useState, useEffect, useMemo } from 'react';
import { useOfflineData } from '../contexts/OfflineDataContext';
import { useSupabaseAuth } from '../contexts/SupabaseAuthContext';
import { useI18n } from '../i18n';
import { useCurrency } from '../hooks/useCurrency';
import { useLocalStorage } from '../hooks/useLocalStorage';
import { 
  generatePaymentReference, 
  generateSaleReference, 
  generateExpenseReference,
  generateInventoryReference,
  generateCommissionReference,
  generatePorterageReference,
  generateTransferReference
} from '../utils/referenceGenerator';
import { 
  TrendingUp,
  AlertCircle,
  CheckCircle,
  Clock,
  Activity,
  Target,
} from 'lucide-react';
import Toast from '../components/common/Toast';
import { CurrencyService } from '../services/currencyService';
import ReceivedBills from '../components/accountingPage/tabs/ReceivedBills';
import InventoryLogs from '../components/accountingPage/tabs/SoldBills';
import DashboardOverview from '../components/accountingPage/tabs/DashboardOverview';
import ExpenseManagement from '../components/accountingPage/tabs/PaymentsManagement';
import NonPricedItems from '../components/accountingPage/tabs/NonPricedItems';
import SupplierAdvances from '../components/accountingPage/tabs/SupplierAdvances';
import EditNonPricedModal from '../components/accountingPage/modals/EditNonPricedModal';
import { PaymentsModal } from '../components/accountingPage/modals/PaymentsModal';
import ReceivedBillDetailsModal from '../components/accountingPage/modals/ReceivedBillDetailsModal';
import EditSaleModal from '../components/accountingPage/modals/EditSaleModal';
import DeleteSaleModal from '../components/accountingPage/modals/DeleteSaleModal';
import ActionTabsBar from '../components/accountingPage/tabs/ActionTabsBar';
import { CashDrawerBalanceReport } from '../components/CashDrawerBalanceReport';
import { CurrentCashDrawerStatus } from '../components/CurrentCashDrawerStatus';

export default function Accounting() {
  const { t } = useI18n();
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
  const transactions = raw.transactions?.map(t => ({...t, createdAt: t.created_at})) || [];
  const customers = raw.customers?.map(c => ({...c, isActive: c.is_active, createdAt: c.created_at, lb_balance: c.lb_balance, usd_balance: c.usd_balance})) || [];
  const suppliers = raw.suppliers?.map(s => ({...s, createdAt: s.created_at, lb_balance: s.lb_balance, usd_balance: s.usd_balance})) || [];
  const expenseCategories = raw.expenseCategories || [];
  const inventory = raw.inventory || [];
  const sales = raw.sales || [];
  const products = raw.products || [];
  const bills = raw.bills || [];
  const inventoryBills = raw.inventoryBills || [];

  let userProfile;
  try {
    const auth = useSupabaseAuth();
    userProfile = auth.userProfile;
  } catch (error) {
    console.error('Error loading auth data:', error);
    userProfile = null;
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

  const [recentCustomers, setRecentCustomers] = useLocalStorage<string[]>('accounting_recent_customers', []);
  const [recentSuppliers, setRecentSuppliers] = useLocalStorage<string[]>('accounting_recent_suppliers', []);
  const [recentCategories, setRecentCategories] = useLocalStorage<string[]>('accounting_recent_categories', []);

  const [activeTab, setActiveTab] = useLocalStorage<'dashboard' | 'expenses' | 'nonpriced' | 'bills-management' | 'received-bills' | 'cash-drawer'>('accounting_active_tab', 'dashboard');
  const [cashDrawerBalance, setCashDrawerBalance] = useState<number | null>(null);
  const [showForm, setShowForm] = useState<"receive" | "pay" | "expense" | null>(null);
  const [dashboardPeriod] = useLocalStorage<'today' | 'week' | 'month' | 'quarter' | 'year'>('accounting_dashboard_period', 'today');
  const [flashingItemId, setFlashingItemId] = useState<string | null>(null);
  const [autoExpandGroupId, setAutoExpandGroupId] = useState<string | null>(null);
  const [currentCashDrawerSession, setCurrentCashDrawerSession] = useState<any>(null);

  // Add loading state to prevent rendering before data is ready
  const [isDataReady, setIsDataReady] = useState(false);

  useEffect(() => {
    // Check if all required data is loaded
    if (raw && transactions && customers && suppliers && products) {
      setIsDataReady(true);
    }
  }, [raw, transactions, customers, suppliers, products]);

  // Handle navigation from missed products history
  useEffect(() => {
    const highlightItemId = sessionStorage.getItem('highlightReceivedBillItem');
    const targetTab = sessionStorage.getItem('activeAccountingTab');
    
    if (highlightItemId && targetTab === 'received-bills') {
      // Switch to received bills tab
      setActiveTab('received-bills');
      
      // Set the item to flash immediately
      setFlashingItemId(highlightItemId);
      
      // Clear the sessionStorage immediately to prevent re-triggering
      sessionStorage.removeItem('highlightReceivedBillItem');
      sessionStorage.removeItem('activeAccountingTab');
    }
  }, []); // Run only once on mount

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
        console.log('Stopping flash and expand effects');
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

  // Inventory logs state - persisted in localStorage
  const [inventoryLogsSearchTerm, setInventoryLogsSearchTerm] = useLocalStorage('accounting_inventoryLogsSearchTerm', '');
  const [inventoryLogsProductFilter, setInventoryLogsProductFilter] = useLocalStorage('accounting_inventoryLogsProductFilter', '');
  const [inventoryLogsSupplierFilter, setInventoryLogsSupplierFilter] = useLocalStorage('accounting_inventoryLogsSupplierFilter', '');
  const [inventoryLogsDateFilter, setInventoryLogsDateFilter] = useLocalStorage<'all' | 'today' | 'week' | 'month'>('accounting_inventoryLogsDateFilter', 'all');
  const [inventoryLogsPage, setInventoryLogsPage] = useLocalStorage('accounting_inventoryLogsPage', 1);
  const [inventoryLogsSort, setInventoryLogsSort] = useLocalStorage<'date' | 'product' | 'supplier' | 'amount'>('accounting_inventoryLogsSort', 'date');
  const [inventoryLogsSortDir, setInventoryLogsSortDir] = useLocalStorage<'asc' | 'desc'>('accounting_inventoryLogsSortDir', 'desc');
  const [selectedInventoryItem, setSelectedInventoryItem] = useState<any>(null);
  const [showInventoryItemDetails, setShowInventoryItemDetails] = useState(false);

  // Sales logs edit/delete state
  const [editingSale, setEditingSale] = useState<any>(null);
  const [showEditSaleModal, setShowEditSaleModal] = useState(false);
  const [showDeleteSaleModal, setShowDeleteSaleModal] = useState(false);
  const [saleToDelete, setSaleToDelete] = useState<any>(null);
  const { getCashDrawerBalanceReport, getCurrentCashDrawerStatus, getCashDrawerSessionDetails, refreshData } = raw;
  const storeId = userProfile?.store_id;

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
        const originalLBPAmount = t.description.match(/Originally ([\d,]+) LBP/);
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
        const originalLBPAmount = t.description.match(/Originally ([\d,]+) LBP/);
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

    const entity = form.entityType === 'customer' 
      ? customers.find(c => c.id === form.entityId) 
      : suppliers.find(s => s.id === form.entityId);
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
  const [showEditNonPriced, setShowEditNonPriced] = useState<any | null>(null);
  const [stagedNonPricedChanges, setStagedNonPricedChanges] = useState<{[key: string]: any}>({});
  const [nonPricedSearch, setNonPricedSearch] = useLocalStorage('accounting_nonPricedSearch', '');
  const [nonPricedSort, setNonPricedSort] = useLocalStorage<'customer'|'product'|'date'|'value'>('accounting_nonPricedSort', 'date');
  const [nonPricedSortDir, setNonPricedSortDir] = useLocalStorage<'asc'|'desc'>('accounting_nonPricedSortDir', 'desc');
  const [nonPricedPage, setNonPricedPage] = useLocalStorage('accounting_nonPricedPage', 1);
  const [showBulkActions, setShowBulkActions] = useState(false);
  const [selectedNonPriced, setSelectedNonPriced] = useState<string[]>([]);
  const NON_PRICED_PAGE_SIZE = 10;

  // Load non-priced items from sales data
  useEffect(() => {
    const nonPricedItems = sales.filter(sale => sale.unit_price === 0);
    setNonPricedItems(nonPricedItems);
  }, [sales, activeTab]);


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

      setShowEditNonPriced(null);
      showToast(t('accounting.itemUpdatedSuccessfully'), 'success');
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
      // Update the sale record to mark it as priced
      await updateSale(item.id, {
        unit_price: updatedItem.unit_price,
        
        quantity: updatedItem.quantity,
        weight: updatedItem.weight || null,
        received_value: updatedItem.unit_price * updatedItem.quantity
      });

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
    } catch (error) {
      console.error('Error bulk marking items as priced:', error);
      showToast(t('accounting.errorMarkingItemsAsPriced'), 'error');
    }
  };

  const handleDeleteNonPriced = async (item: any) => {
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
    if (window.confirm(`Are you sure you want to delete ${selectedNonPriced.length} items?`)) {
      try {
        for (const id of selectedNonPriced) {
          await deleteSale(id);
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
        item.unit_price && (item.weight || item.quantity) ? (item.unit_price * (item.weight || item.quantity)).toFixed(2) : '',
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
  // Create batch map for supplier lookup
  const batchMap = new Map(inventoryBills.map(b => [b.id, b]));
  
  const filteredNonPricedItems = nonPricedItems
    .map(item => {
      const product = products.find(p => p.id === item.product_id);
      const customer = customers.find(c => c.id === item.customer_id);
      // For bill_line_items, supplier_id is stored directly (not in inventory_items)
      // So we can use item.supplier_id here since it comes from bill_line_items
      const supplier = suppliers.find(s => s.id === item.supplier_id);

      // Get staged changes for this item
      const stagedChanges = stagedNonPricedChanges[item.id] || {};
      const currentUnitPrice = stagedChanges.unit_price !== undefined ? stagedChanges.unit_price : item.unit_price;
      const currentQuantity = stagedChanges.quantity !== undefined ? stagedChanges.quantity : item.quantity;
      const currentWeight = stagedChanges.weight !== undefined ? stagedChanges.weight : item.weight;

      return {
        ...item,
        customerName: customer?.name || 'Walk-in Customer',
        productName: product?.name || 'Unknown Product',
        supplierName: supplier?.name || 'Unknown Supplier',
        date: item.created_at || '',
        totalValue: currentUnitPrice && (currentWeight || currentQuantity) ? currentUnitPrice * (currentWeight || currentQuantity) : 0,
        status: currentUnitPrice > 0 && (currentQuantity > 0 || currentWeight > 0) ? 'ready' : 'incomplete'
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

  // Inventory transaction logs functions
  const getInventoryTransactionLogs = useMemo(() => {
    const logs: any[] = [];

    // Create batch map for supplier lookup
    const batchMap = new Map(inventoryBills.map(b => [b.id, b]));

    // Add inventory receiving logs
    inventory.forEach(item => {
      const product = products.find(p => p.id === item.product_id);
      // Get supplier_id from batch
      const batch = item.batch_id ? batchMap.get(item.batch_id) : null;
      const supplierId = batch?.supplier_id || null;
      const supplier = supplierId ? suppliers.find(s => s.id === supplierId) : null;

      logs.push({
        id: `inventory-${item.id}`,
        type: 'inventory_received',
        date: item.received_at || item.created_at,
        productId: item.product_id,
        productName: product?.name || 'Unknown Product',
        supplierId: supplierId,
        supplierName: supplier?.name || 'Unknown Supplier',
        quantity: item.quantity,
        weight: item.weight,
        unit: item.unit,
        price: item.price,
        commissionRate: item.commission_rate,
        amount: item.price ? (item.price * (item.weight || item.quantity)) : 0,
        currency: 'USD',
        description: `Received ${item.quantity} ${item.unit}${item.weight ? ` (${item.weight} kg)` : ''} of ${product?.name || 'Unknown Product'} from ${supplier?.name || 'Unknown Supplier'}`,
        reference: generateInventoryReference(),
        status: item.status,
        transactionType: 'inventory'
      });
    });
    // Add sales transaction logs


      sales.forEach(sale => {
        const product = products.find(p => p.id === sale.product_id);
        const supplier = suppliers.find(s => s.id === sale.supplier_id);
        const customer = customers.find(c => c.id === sale.customer_id);
        const inventoryItem=inventory.find(i=>i.id===sale.inventory_item_id);

        logs.push({
          id: sale.id,
          type: 'sale',
          date: sale.created_at||'',
          productId: product?.id,
          productName: product?.name|| 'Unknown Product',
          supplierId: supplier?.id||'',
          supplierName: supplier?.name || 'Unknown Supplier',
          customerId: sale.customer_id,
          customerName: customer?.name || 'Walk-in Customer',
          quantity: inventoryItem?.quantity||'',
          weight: sale.weight,
          unitPrice: sale.unit_price,
          totalPrice: sale.received_value,
          currency: 'USD',
          description: `Sold ${inventoryItem?.quantity||''} ${sale.weight ? `(${sale.weight} kg)` : ''} of ${product?.name || product?.name || 'Unknown Product'} to ${customer?.name || 'Walk-in Customer'}`,
          reference: generateSaleReference(),
          notes: sale.notes,
          transactionType: 'sale',
          paymentMethod: sale.payment_method,
        });
      });


    // Add financial transaction logs
    transactions.forEach(transaction => {
      logs.push({
        id: `transaction-${transaction.id}`,
        type: 'financial',
        date: transaction.created_at,
        productId: null,
        productName: null,
        supplierId: null,
        supplierName: null,
        amount: transaction.amount,
        currency: transaction.currency,
        description: transaction.description,
        reference: transaction.reference,
        transactionType: 'financial',
        category: transaction.category,
        transactionCategory: transaction.type
      });
    });
    return logs;
  }, [inventory, sales, transactions, products, suppliers, customers]);

  const filteredInventoryLogs = useMemo(() => {
    let filtered = getInventoryTransactionLogs;

    // Apply search filter
    if (inventoryLogsSearchTerm) {
      const search = inventoryLogsSearchTerm.toLowerCase();
      filtered = filtered.filter(log => 
        log.productName?.toLowerCase().includes(search) ||
        log.supplierName?.toLowerCase().includes(search) ||
        log.customerName?.toLowerCase().includes(search) ||
        log.description?.toLowerCase().includes(search) ||
        log.reference?.toLowerCase().includes(search)
      );
    }

    // Apply product filter
    if (inventoryLogsProductFilter) {
      filtered = filtered.filter(log => log.productId === inventoryLogsProductFilter);
    }

    // Apply supplier filter
    if (inventoryLogsSupplierFilter) {
      filtered = filtered.filter(log => log.supplierId === inventoryLogsSupplierFilter);
    }

    // Apply date filter
    if (inventoryLogsDateFilter !== 'all') {
      const now = new Date();
      let startDate: Date;
      let endDate: Date;

      switch (inventoryLogsDateFilter) {
        case 'today':
          startDate = new Date(now.getFullYear(), now.getMonth(), now.getDate());
          endDate = new Date(startDate);
          endDate.setHours(23, 59, 59, 999);
          break;
        case 'week':
          startDate = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
          startDate.setHours(0, 0, 0, 0);
          endDate = new Date(now);
          endDate.setHours(23, 59, 59, 999);
          break;
        case 'month':
          startDate = new Date(now.getFullYear(), now.getMonth(), 1);
          endDate = new Date(now);
          endDate.setHours(23, 59, 59, 999);
          break;
        default:
          startDate = new Date(0);
          endDate = new Date();
      }

      filtered = filtered.filter(log => {
        const logDate = new Date(log.date);
        return logDate >= startDate && logDate <= endDate;
      });
    }

    // Apply sorting
    filtered.sort((a, b) => {
      let cmp = 0;
      switch (inventoryLogsSort) {
        case 'date':
          cmp = new Date(a.date).getTime() - new Date(b.date).getTime();
          break;
        case 'product':
          cmp = (a.productName || '').localeCompare(b.productName || '');
          break;
        case 'supplier':
          cmp = (a.supplierName || '').localeCompare(b.supplierName || '');
          break;
        case 'amount':
          cmp = (a.amount || 0) - (b.amount || 0);
          break;
      }
      return inventoryLogsSortDir === 'asc' ? cmp : -cmp;
    });

    return filtered;

  }, [getInventoryTransactionLogs, inventoryLogsSearchTerm, inventoryLogsProductFilter, inventoryLogsSupplierFilter, inventoryLogsDateFilter, inventoryLogsSort, inventoryLogsSortDir]);

  const inventoryLogsPerPage = 20;
  const inventoryLogsTotalPages = Math.ceil(filteredInventoryLogs.length / inventoryLogsPerPage);
  const pagedInventoryLogs = filteredInventoryLogs.slice(
    (inventoryLogsPage - 1) * inventoryLogsPerPage,
    inventoryLogsPage * inventoryLogsPerPage
  );

  const handleInventoryLogsSort = (sort: 'date' | 'product' | 'supplier' | 'amount') => {
    if (inventoryLogsSort === sort) {
      setInventoryLogsSortDir(inventoryLogsSortDir === 'asc' ? 'desc' : 'asc');
    } else {
      setInventoryLogsSort(sort);
      setInventoryLogsSortDir('desc');
    }
  };

  const exportInventoryLogs = () => {
    const csvContent = [
      ['Date', 'Type', 'Product', 'Supplier', 'Customer', 'Quantity', 'Weight', 'Unit Price', 'Total Amount', 'Currency', 'Description', 'Reference', 'Notes'].join(','),
      ...filteredInventoryLogs.map(log => [
        new Date(log.date).toLocaleDateString(),
        log.type,
        log.productName || '',
        log.supplierName || '',
        log.customerName || '',
        log.quantity || '',
        log.weight || '',
        log.unitPrice || '',
        log.amount || '',
        log.currency || '',
        (log.description || '').replace(/,/g, ';'),
        log.reference || '',
        (log.status || '').replace(/,/g, ';')
      ].join(','))
    ].join('\n');

    const blob = new Blob([csvContent], { type: 'text/csv' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `inventory-transaction-logs-${new Date().toISOString().split('T')[0]}.csv`;
    a.click();
    window.URL.revokeObjectURL(url);
    showToast(t('accounting.inventoryLogsExported'), 'success');
  };

  const handleViewInventoryItemDetails = (log: any) => {
    if (log.type === 'inventory_received') {
      const inventoryItem = inventory.find(item => item.id === log.id.replace('inventory-', ''));
      setSelectedInventoryItem(inventoryItem);
      setShowInventoryItemDetails(true);
    }
  };

  // Pending bills state - persisted in localStorage
  const [pendingBillsSearchTerm, setPendingBillsSearchTerm] = useLocalStorage('accounting_pendingBillsSearchTerm', '');
  const [pendingBillsSupplierFilter, setPendingBillsSupplierFilter] = useLocalStorage('accounting_pendingBillsSupplierFilter', '');
  const [pendingBillsProductFilter, setPendingBillsProductFilter] = useLocalStorage('accounting_pendingBillsProductFilter', '');
  const [pendingBillsPage, setPendingBillsPage] = useLocalStorage('accounting_pendingBillsPage', 1);
  const [pendingBillsSort, setPendingBillsSort] = useLocalStorage<'date' | 'supplier' | 'product' | 'amount' | 'progress' | 'revenue' | 'status'>('accounting_pendingBillsSort', 'date');
  const [pendingBillsSortDir, setPendingBillsSortDir] = useLocalStorage<'asc' | 'desc'>('accounting_pendingBillsSortDir', 'desc');
  const [pendingBillsStatusFilter, setPendingBillsStatusFilter] = useLocalStorage<string>('accounting_pendingBillsStatusFilter', 'all');
  const [selectedPendingBill, setSelectedPendingBill] = useState<any>(null);
  const [showPendingBillDetails, setShowPendingBillDetails] = useState(false);
  const [showCloseBillModal, setShowCloseBillModal] = useState(false);
  const [closingBill, setClosingBill] = useState<any>(null);
  const [selectedBills, setSelectedBills] = useState<Set<string>>(new Set());
  const [showPendingBillsBulkActions, setShowPendingBillsBulkActions] = useState(false);

  // Received bills state - persisted in localStorage
  const [receivedBillsSearchTerm, setReceivedBillsSearchTerm] = useLocalStorage('accounting_receivedBillsSearchTerm', '');
  const [receivedBillsSupplierFilter, setReceivedBillsSupplierFilter] = useLocalStorage('accounting_receivedBillsSupplierFilter', '');
  const [receivedBillsProductFilter, setReceivedBillsProductFilter] = useLocalStorage('accounting_receivedBillsProductFilter', '');
  const [receivedBillsPage, setReceivedBillsPage] = useLocalStorage('accounting_receivedBillsPage', 1);
  const [receivedBillsSort, setReceivedBillsSort] = useLocalStorage<'date' | 'supplier' | 'product' | 'amount' | 'progress' | 'revenue' | 'status'>('accounting_receivedBillsSort', 'date');
  const [receivedBillsSortDir, setReceivedBillsSortDir] = useLocalStorage<'asc' | 'desc'>('accounting_receivedBillsSortDir', 'desc');
  const [receivedBillsStatusFilter, setReceivedBillsStatusFilter] = useLocalStorage<string>('accounting_receivedBillsStatusFilter', 'all');
  const [selectedReceivedBill, setSelectedReceivedBill] = useState<any>(null);
  const [showReceivedBillDetails, setShowReceivedBillDetails] = useState(false);
  // Moved to ReceivedBills component

  // Pending bills functions
  const getPendingBills = useMemo(() => {
    const bills: any[] = [];

    try {
      // Create batch map for supplier lookup
      const batchMap = new Map(inventoryBills.map(b => [b.id, b]));

      // Group commission inventory items by supplier and product
      // Filter items that have batch_id (required to get supplier_id)
      const receivedItems = inventory.filter(item =>  
        item.product_id && 
        item.batch_id
      );

      console.log('Debug - Commission items found:', receivedItems.length);

      receivedItems.forEach(item => {
        const product = products.find(p => p.id === item.product_id);
        // Get supplier_id from batch
        const batch = item.batch_id ? batchMap.get(item.batch_id) : null;
        const supplierId = batch?.supplier_id || null;
        const supplier = supplierId ? suppliers.find(s => s.id === supplierId) : null;

        if (!product || !supplier || !supplierId) {
          console.warn('Missing product, supplier, or batch for item:', item.id, { product, supplier, batch, batchId: item.batch_id });
          return;
        }

        // Calculate total sales for this specific inventory item (by received date)
        const relatedSales = sales.filter(sale => 
          sale && Array.isArray(sale) && 
          sale.some((saleItem: any) => 
            saleItem.productId === item.product_id && 
            saleItem.supplierId === supplierId &&
            // Check if this sale happened after this inventory item was received
            new Date(sale.created_at || sale.created_at).getTime() >= new Date(item.received_at || item.created_at).getTime()
          )
        );

        // Calculate total sold quantity and revenue for this specific inventory item
        let totalSoldQuantity = 0;
        let totalRevenue = 0;
        let saleCount = 0;

        // Sort sales by date to process them chronologically
        const sortedSales = relatedSales.sort((a, b) => 
          new Date(a.created_at || a.created_at).getTime() - new Date(b.created_at || b.created_at).getTime()
        );

        // Track how much we've sold from this specific inventory item
        // We need to calculate the original quantity by adding back what was sold
        let totalSoldFromThisItem = 0;

        for (const sale of sortedSales) {
          if (sale && Array.isArray(sale)) {
            for (const saleItem of sale) {
              if (saleItem.productId === item.product_id && 
                  saleItem.supplierId === supplierId &&
                  typeof saleItem.quantity === 'number' &&
                  typeof saleItem.totalPrice === 'number') {

                // Add to total sold from this inventory item
                totalSoldFromThisItem += saleItem.quantity;
                totalSoldQuantity += saleItem.quantity;
                totalRevenue += saleItem.totalPrice;
                saleCount++;
              }
            }
          }
        }

        // Calculate the original quantity and remaining quantity
        const originalQuantity = item.quantity + totalSoldFromThisItem;
        const remainingQuantity = item.quantity; // Current remaining quantity

        // Show bills for commission items that have been sold or still have remaining quantity
        if (totalSoldFromThisItem > 0 || remainingQuantity > 0) {
          // Calculate estimated total value when fully sold
          const avgUnitPrice = totalSoldFromThisItem > 0 ? totalRevenue / totalSoldFromThisItem : (item.price || 0);
          const estimatedTotalValue = originalQuantity * avgUnitPrice;

          // Calculate progress based on original quantity
          const progress = originalQuantity > 0 ? Math.min((totalSoldFromThisItem / originalQuantity) * 100, 100) : 0;

          // Determine status based on progress
          let status = 'pending';
          if (progress >= 100) status = 'completed';
          else if (progress >= 75) status = 'nearly-complete';
          else if (progress >= 50) status = 'halfway';
          else if (progress > 0) status = 'in-progress';

          const bill = {
            id: `bill-${item.id}`,
            // inventoryItemId: item.id,
            supplierId: supplierId,
            supplierName: supplier.name,
            productId: item.product_id,
            productName: product.name,
            originalQuantity: originalQuantity,
            soldQuantity: totalSoldFromThisItem,
            remainingQuantity: remainingQuantity,
            totalRevenue: totalRevenue,
            estimatedTotalValue: estimatedTotalValue,
            commissionRate: item.commission_rate || 10,
            receivedAt: item.received_at || item.created_at,
            status: status,
            progress: progress,
            saleCount: saleCount,
            avgUnitPrice: avgUnitPrice,
            commissionAmount: (totalRevenue * (item.commission_rate || 10)) / 100,
            supplierPayment: totalRevenue - ((totalRevenue * (item.commission_rate || 10)) / 100),
            daysSinceReceived: Math.floor((Date.now() - new Date(item.received_at || item.created_at).getTime()) / (1000 * 60 * 60 * 24))
          };

          bills.push(bill);
        }
      });

      console.log('Debug - Total bills created:', bills.length);
      return bills;
    } catch (error) {
      console.error('Error processing pending bills:', error);
      showToast(t('accounting.errorProcessingPendingBills'), 'error');
      return [];
    }
  }, [inventory, sales, products, suppliers, inventoryBills, showToast, t]);

  const filteredPendingBills = useMemo(() => {
    let filtered = getPendingBills;

    try {
      // Apply search filter with improved matching
      if (pendingBillsSearchTerm) {
        const search = pendingBillsSearchTerm.toLowerCase().trim();
        filtered = filtered.filter(bill => 
          bill.supplierName.toLowerCase().includes(search) ||
          bill.productName.toLowerCase().includes(search) ||
          bill.id.toLowerCase().includes(search) ||
          bill.status.toLowerCase().includes(search)
        );
      }

      // Apply supplier filter
      if (pendingBillsSupplierFilter) {
        filtered = filtered.filter(bill => bill.supplierId === pendingBillsSupplierFilter);
      }

      // Apply product filter
      if (pendingBillsProductFilter) {
        filtered = filtered.filter(bill => bill.productId === pendingBillsProductFilter);
      }

      // Apply status filter if implemented
      if (pendingBillsStatusFilter && pendingBillsStatusFilter !== 'all') {
        filtered = filtered.filter(bill => bill.status === pendingBillsStatusFilter);
      }

      // Apply sorting with improved logic
      filtered.sort((a, b) => {
        let cmp = 0;
        switch (pendingBillsSort) {
          case 'date':
            cmp = new Date(a.receivedAt).getTime() - new Date(b.receivedAt).getTime();
            break;
          case 'supplier':
            cmp = a.supplierName.localeCompare(b.supplierName);
            break;
          case 'product':
            cmp = a.productName.localeCompare(b.productName);
            break;
          case 'amount':
            cmp = a.estimatedTotalValue - b.estimatedTotalValue;
            break;
          case 'progress':
            cmp = a.progress - b.progress;
            break;
          case 'revenue':
            cmp = a.totalRevenue - b.totalRevenue;
            break;
          case 'status':
            const statusOrder: Record<string, number> = { 'pending': 0, 'in-progress': 1, 'halfway': 2, 'nearly-complete': 3, 'completed': 4 };
            cmp = (statusOrder[a.status as string] || 0) - (statusOrder[b.status as string] || 0);
            break;
        }
        return pendingBillsSortDir === 'asc' ? cmp : -cmp;
      });

      return filtered;
    } catch (error) {
      console.error('Error filtering pending bills:', error);
      return getPendingBills;
    }
  }, [getPendingBills, pendingBillsSearchTerm, pendingBillsSupplierFilter, pendingBillsProductFilter, pendingBillsStatusFilter, pendingBillsSort, pendingBillsSortDir]);

  const pendingBillsPerPage = 10;
  const pendingBillsTotalPages = Math.ceil(filteredPendingBills.length / pendingBillsPerPage);
  const pagedPendingBills = filteredPendingBills.slice(
    (pendingBillsPage - 1) * pendingBillsPerPage,
    pendingBillsPage * pendingBillsPerPage
  );

  const handlePendingBillsSort = (sort: 'date' | 'supplier' | 'product' | 'amount' | 'progress' | 'revenue' | 'status') => {
    if (pendingBillsSort === sort) {
      setPendingBillsSortDir(pendingBillsSortDir === 'asc' ? 'desc' : 'asc');
    } else {
      setPendingBillsSort(sort);
      setPendingBillsSortDir('desc');
    }
  };

  const handleViewPendingBillDetails = (bill: any) => {
    setSelectedPendingBill(bill);
    setShowPendingBillDetails(true);
  };

  const handleCloseBill = (bill: any) => {
    setClosingBill(bill);
    setShowCloseBillModal(true);
  };

  const handleCloseReceivedBill = async (bill: any, fees: { commission: number; porterage: number; transfer: number; supplierAmount: number }) => {
    try {
      // Guard: do not allow closing an already closed bill
      if (bill?.status && typeof bill.status === 'string' && bill.status.includes('[CLOSED]')) {
        showToast(t('accounting.billAlreadyClosed'), 'error');
        return;
      }

      // Calculate total revenue from the bill
      const totalRevenue = fees.commission + fees.porterage + fees.transfer + fees.supplierAmount;

      // Add commission transaction (if applicable)
      if (fees.commission > 0) {
        const safeCommissionAmount = CurrencyService.getInstance().safeConvertForDatabase(fees.commission, 'USD');
        await addTransaction({
          id: raw.createId?.() || crypto.randomUUID(),
          type: 'income',
          category: 'Commission',
          supplier_id: bill.supplier_id,
          amount: safeCommissionAmount.amount,
          currency: safeCommissionAmount.currency,
          description: `Commission fee for ${bill.productName} sold on behalf of ${bill.supplierName}${safeCommissionAmount.wasConverted ? ` (Originally ${fees.commission} USD)` : ''}`,
          reference: generateCommissionReference(),
          created_by: userProfile?.id || ''
        });
      }

      // Add porterage transaction (if applicable)
      if (fees.porterage > 0) {
        const safePorterageAmount = CurrencyService.getInstance().safeConvertForDatabase(fees.porterage, 'USD');
        await addTransaction({
          id: raw.createId?.() || crypto.randomUUID(),
          type: 'income',
          supplier_id: bill.supplier_id,
          category: 'Porterage',
          amount: safePorterageAmount.amount,
          currency: safePorterageAmount.currency,
          description: `Porterage fee for ${bill.productName} from ${bill.supplierName}${safePorterageAmount.wasConverted ? ` (Originally ${fees.porterage} USD)` : ''}`,
          reference: generatePorterageReference(),
          created_by: userProfile?.id || ''
        });
      }

      // Add transfer fee transaction (if applicable)
      if (fees.transfer > 0) {
        const safeTransferAmount = CurrencyService.getInstance().safeConvertForDatabase(fees.transfer, 'USD');
        await addTransaction({
          id: raw.createId?.() || crypto.randomUUID(),
          type: 'income',
          supplier_id: bill.supplier_id,
          category: 'Transfer Fee',
          amount: safeTransferAmount.amount,
          currency: safeTransferAmount.currency,
          description: `Transfer fee for ${bill.productName} from ${bill.supplierName}${safeTransferAmount.wasConverted ? ` (Originally ${fees.transfer} USD)` : ''}`,
          reference: generateTransferReference(),
          created_by: userProfile?.id || ''
        });
      }

      // Add supplier payment transaction
      if (fees.supplierAmount > 0) {
        const safeSupplierAmount = CurrencyService.getInstance().safeConvertForDatabase(fees.supplierAmount, 'USD');
        await addTransaction({
          id: raw.createId?.() || crypto.randomUUID(),
          supplier_id: bill.supplier_id,
          type: 'expense',
          category: 'Supplier Payment',
          amount: safeSupplierAmount.amount,
          currency: safeSupplierAmount.currency,
          description: `Payment to ${bill.supplierName} for ${bill.productName} sales${safeSupplierAmount.wasConverted ? ` (Originally ${fees.supplierAmount} USD)` : ''}`,
          reference: generatePaymentReference(),
          created_by: userProfile?.id || ''
        });
        console.log('supplier', bill.supplier_id, 'fees.supplierAmount', fees.supplierAmount);
        // Update supplier balance
        const supplier = suppliers.find(s => s.id === bill.supplier_id);
        if (supplier) {
          const currentUsdBalance = supplier.usd_balance || 0;
          const newBalance = currentUsdBalance + fees.supplierAmount;

          await raw.updateSupplier(bill.supplier_id, {
            usd_balance: newBalance
          });
        }
      }

      // Persist closed flag onto the inventory batch by updating status
      try {
        const existingStatus = bill.status || '';
        const closedStatus = existingStatus.includes('[CLOSED]') ? existingStatus : `${existingStatus ? existingStatus + ' ' : ''}[CLOSED]`;
        await updateInventoryBatch(bill.id, { status: closedStatus });
      } catch (e) {
        console.warn('Failed to persist closed flag on inventory batch:', e);
      }

      showToast(t('accounting.billClosedSuccessfully'), 'success');
    } catch (error) {
      console.error('Error closing received bill:', error);
      throw new Error('Failed to close bill. Please try again.');
    }
  };

  const handleUpdateBatch  = async (batchId: string, updates: Partial<{ porterage_fee?: number | null; transfer_fee?: number | null; notes?: string | null; plastic_fee?: string | null; plastic_count?: number | null; plastic_price?: number | null; commission_rate?: number | null; received_at?: string | null; status?: string | null; type?: string | null; supplier_id?: string | null; }>) => {
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

  const handleConfirmCloseBill = async () => {
    if (!closingBill) return;

    try {
      // Calculate commission and supplier payment
      const commissionAmount = (closingBill.totalRevenue * closingBill.commissionRate) / 100;
      const supplierPayment = closingBill.totalRevenue - commissionAmount;

      // Bill closing processed without creating accounts payable

      // Safely convert amounts for database storage
      const safeCommissionAmount = CurrencyService.getInstance().safeConvertForDatabase(commissionAmount, 'USD');
      const safeSupplierPayment = CurrencyService.getInstance().safeConvertForDatabase(supplierPayment, 'USD');

      // Add commission transaction
      await addTransaction({
        id: raw.createId?.() || crypto.randomUUID(),
        type: 'expense',
        category: 'Commission',
        supplier_id: closingBill.supplier_id,
        amount: safeCommissionAmount.amount,
        currency: safeCommissionAmount.currency,
        description: `Commission fee for ${closingBill.productName} sold on behalf of ${closingBill.supplierName}${safeCommissionAmount.wasConverted ? ` (Originally ${commissionAmount} USD)` : ''}`,
        reference: generateCommissionReference(),
        created_by: userProfile?.id || ''
      });

      // Add supplier payment transaction
      await addTransaction({
        id: raw.createId?.() || crypto.randomUUID(),
        type: 'expense',
        category: 'Supplier Payment',
        supplier_id: closingBill.supplier_id,
        amount: safeSupplierPayment.amount,
        currency: safeSupplierPayment.currency,
        description: `Payment to ${closingBill.supplierName} for ${closingBill.productName} sales${safeSupplierPayment.wasConverted ? ` (Originally ${supplierPayment} USD)` : ''}`,
        reference: generatePaymentReference(),
        created_by: userProfile?.id || ''
      });

      showToast(t('accounting.billClosedCommissionDeducted'), 'success');
      setShowCloseBillModal(false);
      setClosingBill(null);
    } catch (error) {
      showToast(t('accounting.failedToCloseBill'), 'error');
    }
  };

  // Bulk operations for pending bills
  const handleSelectBill = (billId: string) => {
    const newSelected = new Set(selectedBills);
    if (newSelected.has(billId)) {
      newSelected.delete(billId);
    } else {
      newSelected.add(billId);
    }
    setSelectedBills(newSelected);
    setShowPendingBillsBulkActions(newSelected.size > 0);
  };

  const handleSelectAllBills = () => {
    if (selectedBills.size === pagedPendingBills.length) {
      setSelectedBills(new Set());
      setShowPendingBillsBulkActions(false);
    } else {
      setSelectedBills(new Set(pagedPendingBills.map(bill => bill.id)));
      setShowPendingBillsBulkActions(true);
    }
  };

  const handleBulkCloseBills = async () => {
    if (selectedBills.size === 0) return;

    const billsToClose = pagedPendingBills.filter(bill => 
      selectedBills.has(bill.id) && bill.remainingQuantity === 0
    );

    if (billsToClose.length === 0) {
      showToast(t('accounting.noCompletedBillsSelected'), 'error');
      return;
    }

    try {
      let closedCount = 0;
      for (const bill of billsToClose) {
        const commissionAmount = (bill.totalRevenue * bill.commissionRate) / 100;
        const supplierPayment = bill.totalRevenue - commissionAmount;

        // Bill closed without creating accounts payable
        closedCount++;
      }

      showToast(t('accounting.successfullyClosedBills', { count: closedCount }), 'success');
      setSelectedBills(new Set());
      setShowPendingBillsBulkActions(false);
    } catch (error) {
      console.error('Error bulk closing bills:', error);
      showToast(t('accounting.errorClosingBills'), 'error');
    }
  };

  const exportPendingBills = () => {
    try {
      const exportData = filteredPendingBills.map(bill => ({
        'Bill ID': bill.id,
        'Supplier': bill.supplierName,
        'Product': bill.productName,
        'Received Date': new Date(bill.receivedAt).toLocaleDateString(),
        'Original Quantity': bill.originalQuantity,
        'Sold Quantity': bill.soldQuantity,
        'Remaining Quantity': bill.remainingQuantity,
        'Progress (%)': bill.progress.toFixed(1),
        'Status': bill.status,
        'Total Revenue': formatCurrency(bill.totalRevenue),
        'Estimated Total Value': formatCurrency(bill.estimatedTotalValue),
        'Commission Rate (%)': bill.commissionRate,
        'Commission Amount': formatCurrency(bill.commissionAmount),
        'Supplier Payment': formatCurrency(bill.supplierPayment),
        'Days Since Received': bill.daysSinceReceived,
        'Sale Count': bill.saleCount
      }));

      const csvContent = [
        Object.keys(exportData[0]).join(','),
        ...exportData.map(row => Object.values(row).map(value => `"${value}"`).join(','))
      ].join('\n');

      const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
      const link = document.createElement('a');
      const url = URL.createObjectURL(blob);
      link.setAttribute('href', url);
      link.setAttribute('download', `pending-bills-${new Date().toISOString().split('T')[0]}.csv`);
      link.style.visibility = 'hidden';
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);

      showToast(t('accounting.pendingBillsExported'), 'success');
    } catch (error) {
      console.error('Error exporting pending bills:', error);
      showToast(t('accounting.errorExportingPendingBills'), 'error');
    }
  };

  const getStatusBadge = (status: string) => {
    const statusConfig: Record<string, { color: string; icon: any }> = {
      'pending': { color: 'bg-gray-100 text-gray-800', icon: Clock },
      'in-progress': { color: 'bg-blue-100 text-blue-800', icon: Activity },
      'halfway': { color: 'bg-yellow-100 text-yellow-800', icon: TrendingUp },
      'nearly-complete': { color: 'bg-orange-100 text-orange-800', icon: Target },
      'completed': { color: 'bg-green-100 text-green-800', icon: CheckCircle }
    };

    const config = statusConfig[status] || statusConfig['pending'];
    const IconComponent = config.icon;

    return (
      <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${config.color}`}>
        <IconComponent className="w-3 h-3 mr-1" />
        {status.replace('-', ' ')}
      </span>
    );
  };


  // Received bills functions
  const getReceivedBills = useMemo(() => {
    const bills: any[] = [];

    try {
      // Create batch map for supplier lookup
      const batchMap = new Map(inventoryBills.map(b => [b.id, b]));

      // Get all inventory items (both commission and cash) - including items with quantity = 0 for review purposes
      // Filter items that have batch_id (required to get supplier_id)
      const allInventoryItems = inventory.filter(item => 
        item.product_id && 
        item.batch_id
        // Note: We include items with quantity = 0 for received bills review
        // These items are kept in the database instead of being deleted when quantity reaches 0
      );
      console.log('Inventory', inventory);
      console.log('Debug - All inventory items found:', allInventoryItems.length);

      allInventoryItems.forEach(item => {
        const product = products.find(p => p.id === item.product_id);
        // Get supplier_id from batch
        const batch = item.batch_id ? batchMap.get(item.batch_id) : null;
        const supplierId = batch?.supplier_id || null;
        const supplier = supplierId ? suppliers.find(s => s.id === supplierId) : null;

        if (!product || !supplier || !supplierId) {
          console.warn('Missing product, supplier, or batch for item:', item.id, { product, supplier, batch, batchId: item.batch_id });
          return;
        }

        // Calculate total sales for this specific inventory item (by received date)
        const relatedSales = sales.filter(sale => 
          sale && Array.isArray(sale) && 
          sale.some((saleItem: any) => 
            saleItem.productId === item.product_id && 
            saleItem.supplierId === supplierId &&
            // Check if this sale happened after this inventory item was received
            new Date(sale.created_at || sale.created_at).getTime() >= new Date(item.received_at || item.created_at).getTime()
          )
        );

        // Calculate total sold quantity and revenue for this specific inventory item
        let totalSoldQuantity = 0;
        let totalRevenue = 0;
        let saleCount = 0;

        // Sort sales by date to process them chronologically
        const sortedSales = relatedSales.sort((a, b) => 
          new Date(a.created_at || a.created_at).getTime() - new Date(b.created_at || b.created_at).getTime()
        );

        // Track how much we've sold from this specific inventory item
        let totalSoldFromThisItem = 0;

        for (const sale of sortedSales) {
          if (sale && Array.isArray(sale)) {
            for (const saleItem of sale) {
              if (saleItem.productId === item.product_id && 
                  saleItem.supplierId === item.supplier_id &&
                  typeof saleItem.quantity === 'number' &&
                  typeof saleItem.totalPrice === 'number') {

                // Add to total sold from this inventory item
                totalSoldFromThisItem += saleItem.quantity;
                totalRevenue += saleItem.totalPrice;
              }
            }
            saleCount++; // Count unique sales, not individual items
          }
        }

        // Handle the case where received_quantity is null/undefined
        // For existing items without received_quantity, we'll use quantity + sold items as the original quantity
        let originalReceivedQuantity = 0;

        if (item.received_quantity !== null && item.received_quantity !== undefined && item.received_quantity > 0) {
          // Use the received_quantity field if it exists and is valid
          originalReceivedQuantity = item.received_quantity;
        } else {
          // For existing items without received_quantity, calculate it from current quantity + sold items
          originalReceivedQuantity = item.quantity + totalSoldFromThisItem;

          // Special handling for items with quantity = 0 that haven't been sold yet
          // These items might need received_quantity to be set manually
          if (item.quantity === 0 && totalSoldFromThisItem === 0) {
            console.log('Debug - Item with quantity = 0 and no sales, needs received_quantity:', {
              itemId: item.id,
              productName: product.name,
              received_quantity: item.received_quantity,
              quantity: item.quantity,
              totalSoldFromThisItem,
              calculated_original: originalReceivedQuantity
            });
          }

          // Debug: Log items that need received_quantity
          console.log('Debug - Item needs received_quantity:', {
            itemId: item.id,
            productName: product.name,
            received_quantity: item.received_quantity,
            quantity: item.quantity,
            totalSoldFromThisItem,
            calculated_original: originalReceivedQuantity
          });
        }
        const remainingQuantity = item.quantity; // Current remaining quantity

        // Calculate estimated total value when fully sold
        const avgUnitPrice = totalSoldFromThisItem > 0 ? totalRevenue / totalSoldFromThisItem : (item.price || 0);
        const estimatedTotalValue = originalReceivedQuantity * avgUnitPrice;

        // Calculate progress based on original received quantity
        // Progress = (Total Sold / Original Received Quantity) × 100
        const soldFromThisItem = Math.max(originalReceivedQuantity - remainingQuantity, 0);
        const progress = originalReceivedQuantity > 0 
          ? (soldFromThisItem / originalReceivedQuantity) * 100 
          : 0;

        // Ensure we have valid values
        const validOriginalQuantity = Math.max(originalReceivedQuantity, 0);
        const validSoldQuantity = Math.max(totalSoldFromThisItem, 0);
        const validRemainingQuantity = Math.max(remainingQuantity, 0);
        const validProgress = isNaN(progress) || !isFinite(progress) ? 0 : Math.max(0, Math.min(100, progress));

        // Debug logging for problematic items
        if (originalReceivedQuantity === 0 || isNaN(progress) || !isFinite(progress)) {
          console.warn('Debug - Problematic item:', {
            itemId: item.id,
            productName: product.name,
            receivedQuantity: item.received_quantity,
            originalReceivedQuantity,
            totalSoldFromThisItem,
            progress,
            remainingQuantity: item.quantity
          });
        }

        // Determine status based on progress
        let status = 'pending';
        if (progress >= 100) status = 'completed';
        else if (progress >= 75) status = 'nearly-complete';
        else if (progress >= 50) status = 'halfway';
        else if (progress > 0) status = 'in-progress';

        // Calculate cost and profit
        const totalCost = item.type === 'commission' ? 
          (item.porterage || 0) + (item.transfer_fee || 0) : 
          (item.price || 0) * originalReceivedQuantity;

        const totalProfit = totalRevenue - totalCost;

        bills.push({
          id: item.id,
          productId: item.product_id,
          productName: product.name,
          supplierId: supplierId,
          supplierName: supplier.name,
          type: item.type,
          originalQuantity: validOriginalQuantity,
          remainingQuantity: validRemainingQuantity,
          totalSoldQuantity: validSoldQuantity,
          totalRevenue,
          totalCost,
          totalProfit,
          avgUnitPrice,
          estimatedTotalValue,
          progress: validProgress,
          saleCount,
          receivedAt: item.received_at || item.created_at,
          receivedBy: item.received_by,
          status: item.status || 'Created',
          unit: item.unit,
          weight: item.weight,
          porterage: item.porterage,
          transferFee: item.transfer_fee,
          price: item.price,
          commissionRate: item.commission_rate,
          relatedSales: sortedSales
        });
      });

      console.log('Debug - Processed received bills:', bills.length);
    } catch (error) {
      console.error('Error processing received bills:', error);
      showToast(t('accounting.errorProcessingReceivedBills'), 'error');
    }

    return bills;
  }, [inventory, products, suppliers, sales, inventoryBills, showToast, t]);

  const filteredReceivedBills = useMemo(() => {
    try {
      let filtered = getReceivedBills;

      // Search filter
      if (receivedBillsSearchTerm) {
        const searchLower = receivedBillsSearchTerm.toLowerCase();
        filtered = filtered.filter(bill => 
          bill.productName.toLowerCase().includes(searchLower) ||
          bill.supplierName.toLowerCase().includes(searchLower) ||
          bill.type.toLowerCase().includes(searchLower)
        );
      }

      // Supplier filter
      if (receivedBillsSupplierFilter) {
        filtered = filtered.filter(bill => bill.supplierId === receivedBillsSupplierFilter);
      }

      // Product filter
      if (receivedBillsProductFilter) {
        filtered = filtered.filter(bill => bill.productId === receivedBillsProductFilter);
      }

      // Status filter
      if (receivedBillsStatusFilter !== 'all') {
        filtered = filtered.filter(bill => bill.status === receivedBillsStatusFilter);
      }

      // Sort
      filtered.sort((a, b) => {
        let aValue: any, bValue: any;

        switch (receivedBillsSort) {
          case 'date':
            aValue = new Date(a.receivedAt).getTime();
            bValue = new Date(b.receivedAt).getTime();
            break;
          case 'supplier':
            aValue = a.supplierName.toLowerCase();
            bValue = b.supplierName.toLowerCase();
            break;
          case 'product':
            aValue = a.productName.toLowerCase();
            bValue = b.productName.toLowerCase();
            break;
          case 'amount':
            aValue = a.estimatedTotalValue;
            bValue = b.estimatedTotalValue;
            break;
          case 'progress':
            aValue = a.progress;
            bValue = b.progress;
            break;
          case 'revenue':
            aValue = a.totalRevenue;
            bValue = b.totalRevenue;
            break;
          case 'status':
            aValue = a.status;
            bValue = b.status;
            break;
          default:
            aValue = new Date(a.receivedAt).getTime();
            bValue = new Date(b.receivedAt).getTime();
        }

        if (receivedBillsSortDir === 'asc') {
          return aValue > bValue ? 1 : -1;
        } else {
          return aValue < bValue ? 1 : -1;
        }
      });

      return filtered;
    } catch (error) {
      console.error('Error filtering received bills:', error);
      return [];
    }
  }, [getReceivedBills, receivedBillsSearchTerm, receivedBillsSupplierFilter, receivedBillsProductFilter, receivedBillsStatusFilter, receivedBillsSort, receivedBillsSortDir]);

  const paginatedReceivedBills = useMemo(() => {
    const itemsPerPage = 10;
    const startIndex = (receivedBillsPage - 1) * itemsPerPage;
    const endIndex = startIndex + itemsPerPage;
    return filteredReceivedBills.slice(startIndex, endIndex);
  }, [filteredReceivedBills, receivedBillsPage]);

  const totalReceivedBillsPages = Math.ceil(filteredReceivedBills.length / 10);

  const handleReceivedBillsSort = (sort: 'date' | 'supplier' | 'product' | 'amount' | 'progress' | 'revenue' | 'status') => {
    if (receivedBillsSort === sort) {
      setReceivedBillsSortDir(receivedBillsSortDir === 'asc' ? 'desc' : 'asc');
    } else {
      setReceivedBillsSort(sort);
      setReceivedBillsSortDir('desc');
    }
  };

  const handleViewReceivedBillDetails = (bill: any) => {
    setSelectedReceivedBill(bill);
    setShowReceivedBillDetails(true);
  };

  const exportReceivedBills = () => {
    try {
      const headers = [
        'Date', 'Product', 'Supplier', 'Type', 'Original Qty', 'Remaining Qty', 
        'Sold Qty', 'Progress %', 'Revenue', 'Cost', 'Profit', 'Status', 'Unit Price'
      ];

      const csvContent = [
        headers.join(','),
        ...filteredReceivedBills.map(bill => [
          new Date(bill.receivedAt).toLocaleDateString(),
          `"${bill.productName}"`,
          `"${bill.supplierName}"`,
          bill.type,
          bill.originalQuantity,
          bill.remainingQuantity,
          bill.totalSoldQuantity,
          `${bill.progress.toFixed(1)}%`,
          bill.totalRevenue.toFixed(2),
          bill.totalCost.toFixed(2),
          bill.totalProfit.toFixed(2),
          bill.status,
          bill.avgUnitPrice.toFixed(2)
        ].join(','))
      ].join('\n');

      const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
      const link = document.createElement('a');
      const url = URL.createObjectURL(blob);
      link.setAttribute('href', url);
      link.setAttribute('download', `received-bills-${new Date().toISOString().split('T')[0]}.csv`);
      link.style.visibility = 'hidden';
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);

      showToast(t('accounting.receivedBillsExported'), 'success');
    } catch (error) {
      console.error('Error exporting received bills:', error);
      showToast(t('accounting.errorExportingReceivedBills'), 'error');
    }
  };
  // Sales logs edit/delete handlers
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
            customers={customers}
            transactions={transactions}
            inventory={inventory}
            products={products}
            suppliers={suppliers}
          />
        </div>
      )}

      {activeTab === 'expenses' && (
        <div className="space-y-6">
          <ExpenseManagement
            expenseCategories={expenseCategories}
            transactions={sessionFilteredTransactions}
            today={today}
            currency="USD"
            setShowForm={(formType) => setShowForm(formType)}
            formatCurrency={formatCurrency}
            formatCurrencyWithSymbol={formatCurrencyWithSymbol}
            getConvertedAmount={getConvertedAmount}
            customers={customers}
            suppliers={suppliers}
            onRefresh={refreshData}
            showToast={showToast}
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
              setShowEditNonPriced={setShowEditNonPriced}
              stageChange={stageChange}
              getCurrentValue={getCurrentValue}
              showToast={showToast}
              showBulkActions={showBulkActions}
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

      {activeTab === 'supplier-advances' && (
        <SupplierAdvances
          suppliers={suppliers}
          transactions={transactions}
          formatCurrency={formatCurrency}
          formatCurrencyWithSymbol={formatCurrencyWithSymbol}
          showToast={showToast}
          onProcessAdvance={async (data) => {
            await raw.processSupplierAdvance(data);
          }}
          onEditAdvance={async (transactionId, updates) => {
            await raw.updateSupplierAdvance(transactionId, updates);
          }}
          onDeleteAdvance={async (transactionId) => {
            await raw.deleteSupplierAdvance(transactionId);
          }}
          addSupplier={addSupplier}
          refreshData={raw.refreshData}
        />
      )}

      {activeTab === 'bills-management' && (
        <InventoryLogs />
      )}

      {activeTab === 'received-bills' && (
        <ReceivedBills
          inventory={inventory}
          inventoryBills={inventoryBills}
          bills={bills}
          products={products}
          suppliers={suppliers}
          sales={sales}
          customers={customers}
          formatCurrency={formatCurrency}
          showToast={showToast}
          onEditSale={handleEditSale}
          onDeleteSale={handleDeleteSale}
          onCloseBill={handleCloseReceivedBill}
          onUpdateBatch={handleUpdateBatch}
          defaultCommissionRate={defaultCommissionRate}
          recentSuppliers={recentSuppliers}
          setRecentSuppliers={setRecentSuppliers}
          addSupplier={addSupplier}
          flashingItemId={flashingItemId}
          autoExpandGroupId={autoExpandGroupId}
        />
      )}

      {/* Enhanced Edit Modal for Non-Priced Items */}
      {showEditNonPriced && (
        <EditNonPricedModal
          isOpen={!!showEditNonPriced}
          customers={customers}
          suppliers={suppliers}
          initialData={showEditNonPriced}
          onClose={() => setShowEditNonPriced(null)}
          onSave={(data) => handleSaveNonPriced(data)}
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

            customers,
            suppliers,
            expenseCategories,

            recentCustomers,
            recentSuppliers,
            recentCategories,
            setRecentCustomers,
            setRecentSuppliers,
            setRecentCategories,


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

      {/* Received Bill Details Modal */}
      {showReceivedBillDetails && selectedReceivedBill && (
        <ReceivedBillDetailsModal
          isOpen={showReceivedBillDetails}
          onClose={() => setShowReceivedBillDetails(false)}
          selectedBill={selectedReceivedBill}
          formatCurrency={formatCurrency}
          getStatusBadge={getStatusBadge}
        />
      )}

      {/* Edit Sale Modal */}
      {showEditSaleModal && editingSale && (
        <EditSaleModal
          originalSale={editingSale}
          isOpen={showEditSaleModal}
          sale={editingSale}
          customers={customers}
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