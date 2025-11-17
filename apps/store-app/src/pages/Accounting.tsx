import React, { useState, useEffect, useMemo } from 'react';
import { useOfflineData } from '../contexts/OfflineDataContext';
import { useSupabaseAuth } from '../contexts/SupabaseAuthContext';
import { useI18n } from '../i18n';
import { useCurrency } from '../hooks/useCurrency';
import { useLocalStorage } from '../hooks/useLocalStorage';
import { 
  generatePaymentReference, 
  generateExpenseReference,
  generateCommissionReference,
  generatePorterageReference,
  generateTransferReference
} from '../utils/referenceGenerator';
import { 
  TrendingUp,
  CheckCircle,
  Clock,
} from 'lucide-react';
import Toast from '../components/common/Toast';
import { CurrencyService } from '../services/currencyService';
import ReceivedBills from '../components/accountingPage/tabs/ReceivedBills';
import DashboardOverview from '../components/accountingPage/tabs/DashboardOverview';
import ExpenseManagement from '../components/accountingPage/tabs/PaymentsManagement';
import NonPricedItems from '../components/accountingPage/tabs/NonPricedItems';
import SupplierAdvances from '../components/accountingPage/tabs/SupplierAdvances';
import { PaymentsModal } from '../components/accountingPage/modals/PaymentsModal';
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
  const refreshData = raw.refreshData;
  const getCashDrawerBalanceReport = raw.getCashDrawerBalanceReport;
  const getCashDrawerSessionDetails = raw.getCashDrawerSessionDetails;
  const getCurrentCashDrawerStatus = raw.getCurrentCashDrawerStatus;
  const transactions = raw.transactions?.map(t => ({...t, createdAt: t.created_at})) || [];
  const customers = raw.customers?.map(c => ({...c, isActive: c.is_active, createdAt: c.created_at, lb_balance: c.lb_balance, usd_balance: c.usd_balance})) || [];
  const suppliers = raw.suppliers?.map(s => ({...s, createdAt: s.created_at, lb_balance: s.lb_balance, usd_balance: s.usd_balance})) || [];
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

  const handleCloseReceivedBill = async (bill: any, fees: { commission: number; porterage: number; transfer: number; supplierAmount: number, currency: 'USD' | 'LBP' }) => {
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
      }

      // Add porterage transaction (if applicable)
      if (fees.porterage > 0) {
        const safePorterageAmount = CurrencyService.getInstance().safeConvertForDatabase(fees.porterage, currency as 'USD' | 'LBP');
        await addTransaction({
          id: raw.createId?.() || crypto.randomUUID(),
          type: 'income',
          supplier_id: bill.supplier_id,
          category: 'Porterage',
          amount: safePorterageAmount.amount,
          currency: safePorterageAmount.currency,
          description: `Porterage fee for ${bill.productName} from ${bill.supplierName}${safePorterageAmount.wasConverted ? ` (Originally ${fees.porterage} ${currency})` : ''}`,
          reference: generatePorterageReference(),
          created_by: userProfile?.id || ''
        });
      }

      // Add transfer fee transaction (if applicable)
      if (fees.transfer > 0) {
        const safeTransferAmount = CurrencyService.getInstance().safeConvertForDatabase(fees.transfer, currency as 'USD' | 'LBP');
        await addTransaction({
          id: raw.createId?.() || crypto.randomUUID(),
          type: 'income',
          supplier_id: bill.supplier_id,
          category: 'Transfer Fee',
          amount: safeTransferAmount.amount,
          currency: safeTransferAmount.currency,
          description: `Transfer fee for ${bill.productName} from ${bill.supplierName}${safeTransferAmount.wasConverted ? ` (Originally ${fees.transfer} ${currency})` : ''}`,
          reference: generateTransferReference(),
          created_by: userProfile?.id || ''
        });
      }

      // Add supplier payment transaction
      if (fees.supplierAmount > 0) {
        const safeSupplierAmount = CurrencyService.getInstance().safeConvertForDatabase(fees.supplierAmount, currency as 'USD' | 'LBP');
        await addTransaction({
          id: raw.createId?.() || crypto.randomUUID(),
          supplier_id: bill.supplier_id,
          type: 'expense',
          category: 'Supplier Payment',
          amount: safeSupplierAmount.amount,
          currency: safeSupplierAmount.currency,
          description: `Payment to ${bill.supplierName} for ${bill.productName} sales${safeSupplierAmount.wasConverted ? ` (Originally ${fees.supplierAmount} ${currency})` : ''}`,
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
      console.log('bill', bill);
      // Persist closed flag onto the inventory batch by updating status
      try {
        const existingStatus = bill.status || '';
        const closedStatus = existingStatus==='CLOSED' ? existingStatus : "CLOSED";
        const targetBatchId = bill.batchId || bill.batch_id;
        if (!targetBatchId) {
          console.warn('No batch identifier available when attempting to close bill:', bill);
        } else {
          await handleUpdateBatch(targetBatchId, { status: closedStatus });
        }
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