import React, { useState, useEffect, useMemo } from 'react';
import { useOfflineData } from '../contexts/OfflineDataContext';
import { useSupabaseAuth } from '../contexts/SupabaseAuthContext';
import { useCurrency } from '../hooks/useCurrency';
import { useLocalStorage } from '../hooks/useLocalStorage';
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
import { createId } from '../lib/db';
import { cashDrawerUpdateService } from '../services/cashDrawerUpdateService';
import DashboardOverview from '../components/accountingPage/tabs/DashboardOverview';
import ExpenseManagement from '../components/accountingPage/tabs/PaymentsManagement';
import NonPricedItems from '../components/accountingPage/tabs/NonPricedItems';
import EditNonPricedModal from '../components/accountingPage/modals/EditNonPricedModal';
import { PaymentsModal } from '../components/accountingPage/modals/PaymentsModal';
import ReceivedBillDetailsModal from '../components/accountingPage/modals/ReceivedBillDetailsModal';
import EditSaleModal from '../components/accountingPage/modals/EditSaleModal';
import DeleteSaleModal from '../components/accountingPage/modals/DeleteSaleModal';
import ActionTabsBar from '../components/accountingPage/tabs/ActionTabsBar';
import { CashDrawerBalanceReport } from '../components/CashDrawerBalanceReport';
import { CurrentCashDrawerStatus } from '../components/CurrentCashDrawerStatus';

export default function Accounting() {
  let raw;
  try {
    raw = useOfflineData();
  } catch (error) {
    console.error('Error loading offline data:', error);
    return (
      <div className="p-6">
        <div className="bg-red-50 border border-red-200 rounded-lg p-4">
          <h3 className="text-lg font-semibold text-red-800">Error Loading Data</h3>
          <p className="text-red-600">Unable to load accounting data. Please refresh the page or check your connection.</p>
        </div>
      </div>
    );
  }
  const addExpenseCategory = raw.addExpenseCategory;
  const addTransaction = raw.addTransaction;
  const updateSale = raw.updateSale;
  const deleteSale = raw.deleteSale;
  const updateInventoryBatch = raw.updateInventoryBatch;
  const getStore = raw.getStore;
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

  const [activeTab, setActiveTab] = useState<'dashboard' | 'customer-balances' | 'supplier-balances' | 'expenses' | 'journal' | 'nonpriced' | 'bills-management' | 'received-bills' | 'cash-drawer'>('dashboard');
  const [cashDrawerBalance, setCashDrawerBalance] = useState<number | null>(null);
  const [showForm, setShowForm] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [showAddCustomerForm, setShowAddCustomerForm] = useState(false);
  const [showAddSupplierForm, setShowAddSupplierForm] = useState(false);
  const [showAddCategoryForm, setShowAddCategoryForm] = useState(false);
  const [dashboardPeriod, setDashboardPeriod] = useState<'today' | 'week' | 'month' | 'quarter' | 'year'>('today');
  const [showAdvancedFilters, setShowAdvancedFilters] = useState(false);

  // Add loading state to prevent rendering before data is ready
  const [isDataReady, setIsDataReady] = useState(false);

  useEffect(() => {
    // Check if all required data is loaded
    if (raw && transactions && customers && suppliers && products) {
      setIsDataReady(true);
    }
  }, [raw, transactions, customers, suppliers, products]);

  // Fetch cash drawer balance
  useEffect(() => {
    const fetchBalance = async () => {
      try {
        if (userProfile?.store_id) {
          const balance = await cashDrawerUpdateService.getCurrentCashDrawerBalance(userProfile.store_id);
          setCashDrawerBalance(balance);
        }
      } catch (e) {
        // ignore
      }
    };
    fetchBalance();
  }, [userProfile?.store_id]);

  const refreshCashDrawerBalance = async () => {
    try {
      if (userProfile?.store_id) {
        const balance = await cashDrawerUpdateService.getCurrentCashDrawerBalance(userProfile.store_id);
        setCashDrawerBalance(balance);
      }
    } catch (e) {
      // ignore
    }
  };

  // Inventory logs state
  const [inventoryLogsSearchTerm, setInventoryLogsSearchTerm] = useState('');
  const [inventoryLogsProductFilter, setInventoryLogsProductFilter] = useState('');
  const [inventoryLogsSupplierFilter, setInventoryLogsSupplierFilter] = useState('');
  const [inventoryLogsDateFilter, setInventoryLogsDateFilter] = useState<'all' | 'today' | 'week' | 'month'>('all');
  const [inventoryLogsPage, setInventoryLogsPage] = useState(1);
  const [inventoryLogsSort, setInventoryLogsSort] = useState<'date' | 'product' | 'supplier' | 'amount'>('date');
  const [inventoryLogsSortDir, setInventoryLogsSortDir] = useState<'asc' | 'desc'>('desc');
  const [selectedInventoryItem, setSelectedInventoryItem] = useState<any>(null);
  const [showInventoryItemDetails, setShowInventoryItemDetails] = useState(false);

  // Sales logs edit/delete state
  const [editingSale, setEditingSale] = useState<any>(null);
  const [showEditSaleModal, setShowEditSaleModal] = useState(false);
  const [showDeleteSaleModal, setShowDeleteSaleModal] = useState(false);
  const [saleToDelete, setSaleToDelete] = useState<any>(null);
  const { getCashDrawerBalanceReport, getCurrentCashDrawerStatus, getCashDrawerSessionDetails } = raw;
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

  const [journalForm, setJournalForm] = useState({
    date: new Date().toISOString().split('T')[0],
    reference: '',
    description: '',
    entries: [
      { account: '', debit: 0, credit: 0 },
      { account: '', debit: 0, credit: 0 }
    ]
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

  // Calculate today's expenses with currency conversion
  // Note: amounts are now stored in USD, so convert to display currency
      const todayExpenses = transactions
      .filter(t => t.type === 'expense' && t.createdAt.split('T')[0] === today)
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

    const todayIncome = transactions
      .filter(t => t.type === 'income' && t.createdAt.split('T')[0] === today)
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

  // Enhanced KPI calculations
  const kpiData = useMemo(() => {
    const totalCustomers = customers.filter(c => c.is_active).length;
    const totalSuppliers = suppliers.length;
      const customersWithDebt = customers.filter(c => (c.lb_balance || 0) > 0 || (c.usd_balance || 0) > 0).length;
  const totalCustomerDebt = customers.reduce((sum, c) => sum + (c.lb_balance || 0) + (c.usd_balance || 0), 0);
    const avgDebtPerCustomer = customersWithDebt > 0 ? totalCustomerDebt / customersWithDebt : 0;

    const recentTransactions = transactions
      .filter(t => new Date(t.createdAt) >= new Date(Date.now() - 30 * 24 * 60 * 60 * 1000))
      .length;

    const cashFlowTrend = transactions
      .filter(t => new Date(t.createdAt) >= new Date(Date.now() - 7 * 24 * 60 * 60 * 1000))
      .reduce((acc, t) => {
        const day = new Date(t.createdAt).toLocaleDateString();
        if (!acc[day]) acc[day] = { income: 0, expenses: 0 };
        // Check if this transaction was originally LBP but converted to USD for storage
        const originalLBPAmount = t.description.match(/Originally ([\d,]+) LBP/);
        let amount;
        if (originalLBPAmount) {
          // Use the original LBP amount for calculations
          const originalAmount = parseInt(originalLBPAmount[1].replace(/,/g, ''));
          amount = getConvertedAmount(originalAmount, 'LBP');
        } else {
          // Otherwise use the stored amount
          amount = getConvertedAmount(t.amount, t.currency || 'USD');
        }
        if (t.type === 'income') acc[day].income += amount;
        else acc[day].expenses += amount;
        return acc;
      }, {} as Record<string, { income: number; expenses: number }>);

    return {
      totalCustomers,
      totalSuppliers,
      customersWithDebt,
      totalCustomerDebt,
      avgDebtPerCustomer,
      recentTransactions,
      cashFlowTrend
    };
  }, [customers, suppliers, transactions, getConvertedAmount]);

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
  const handleReceiveSubmit = async (e: React.FormEvent) => { 
    e.preventDefault();

    // Validate required fields
    if (!receiveForm.amount || parseFloat(receiveForm.amount) <= 0) {
      showToast('Please enter a valid amount', 'error');
      return;
    }

    if (!receiveForm.entityId) {
      showToast('Please select an entity', 'error');
      return;
    }

    const entity = receiveForm.entityType === 'customer' ? customers.find(c => c.id === receiveForm.entityId) : suppliers.find(s => s.id === receiveForm.entityId);
    if (!entity) {
      showToast('Entity not found', 'error');
      return;
    }

    try {
      // Use the ERP Financial Service to process the payment
      const { erpFinancialService } = await import('../services/erpFinancialService');

      // Sync current entities to ERP service
      localStorage.setItem('erp_customers', JSON.stringify(customers));
      localStorage.setItem('erp_suppliers', JSON.stringify(suppliers));
      erpFinancialService.reloadData();

      const result = erpFinancialService.processEntityPayment(
        receiveForm.entityType,
        receiveForm.entityId,
        parseFloat(receiveForm.amount),
        receiveForm.currency as 'USD' | 'LBP',
        `Payment from ${entity.name}${receiveForm.description ? ': ' + receiveForm.description : ''}`,
        userProfile?.id || ''
      );

      // Update entity balance in main application
      // Store amounts in their respective currency fields
      const paymentAmount = parseFloat(receiveForm.amount);

      if (receiveForm.entityType === 'customer') {
        const currentLbBalance = entity.lb_balance || 0;
        const currentUsdBalance = entity.usd_balance || 0;

        if (receiveForm.currency === 'LBP') {
          await raw.updateCustomer(receiveForm.entityId, { 
            lb_balance: currentLbBalance + paymentAmount 
          });
        } else {
          await raw.updateCustomer(receiveForm.entityId, { 
            usd_balance: currentUsdBalance + paymentAmount 
          });
        }
      } else {
        const currentLbBalance = entity.lb_balance || 0;
        const currentUsdBalance = entity.usd_balance || 0;

        if (receiveForm.currency === 'LBP') {
          await raw.updateSupplier(receiveForm.entityId, { 
            lb_balance: currentLbBalance + paymentAmount 
          });
        } else {
          await raw.updateSupplier(receiveForm.entityId, { 
            usd_balance: currentUsdBalance + paymentAmount 
          });
        }
      }

      // Safely convert amount for database storage
      const safeAmount = CurrencyService.getInstance().safeConvertForDatabase(
        parseFloat(receiveForm.amount), 
        receiveForm.currency as 'USD' | 'LBP'
      );

      // Generate transaction ID for consistency
      const transactionId = createId();

      // Update cash drawer (increase for received payment) - this will create the transaction record
      let cashDrawerResult: any = null;
      if (!userProfile?.store_id) {
        console.warn('Missing store_id: cannot update cash drawer');
      } else {
        console.log('Updating cash drawer for transaction:', 'payment');

        cashDrawerResult = await cashDrawerUpdateService.updateCashDrawerForTransaction({
          type: 'payment',
          amount: safeAmount.amount,
          currency: safeAmount.currency,
          description: `Payment received from ${entity.name}${receiveForm.description ? ': ' + receiveForm.description : ''}${safeAmount.wasConverted ? ` (Originally ${receiveForm.amount} ${receiveForm.currency})` : ''}`,
          reference: receiveForm.reference || `PAY-${Date.now()}`,
          storeId: userProfile.store_id,
          createdBy: userProfile?.id || '',
          customerId: receiveForm.entityType === 'customer' ? receiveForm.entityId : undefined,
          supplierId: receiveForm.entityType === 'supplier' ? receiveForm.entityId : undefined
        }, getStore);
      }

      // Use the transaction ID from cash drawer service if available, otherwise create one
      const finalTransactionId = cashDrawerResult?.transactionId || transactionId;

      // Store undo data for received payment
      // Calculate original balance before payment was made
      const originalLbBalance = (entity.lb_balance || 0) + paymentAmount;
      const originalUsdBalance = (entity.usd_balance || 0) + paymentAmount;
      
      const paymentUndoData = {
        type: 'accounting_receive_payment',
        affected: [
          { table: receiveForm.entityType === 'customer' ? 'customers' : 'suppliers', id: receiveForm.entityId },
          { table: 'transactions', id: finalTransactionId }
        ],
        steps: [
          // Restore entity balance to original value before payment
          {
            op: 'update',
            table: receiveForm.entityType === 'customer' ? 'customers' : 'suppliers',
            id: receiveForm.entityId,
            changes: receiveForm.currency === 'LBP'
              ? { lb_balance: originalLbBalance, _synced: false }
              : { usd_balance: originalUsdBalance, _synced: false }
          },
          // Delete transaction
          {
            op: 'delete',
            table: 'transactions',
            id: finalTransactionId
          }
        ]
      };

      // Add cash drawer restoration if transaction was created
      if (cashDrawerResult?.success && cashDrawerResult.transactionId) {
        const { db } = await import('../lib/db');
        const account = await db.getCashDrawerAccount(userProfile?.store_id || 'default-store');
        if (account) {
          paymentUndoData.steps.push({
            op: 'update',
            table: 'cash_drawer_accounts',
            id: account.id,
            changes: {
              current_balance: (account.current_balance || 0) - safeAmount.amount,
              _synced: false
            } as any
          });
          paymentUndoData.affected.push({ table: 'cash_drawer_accounts', id: account.id });
        }
      }

      raw.pushUndo(paymentUndoData);

      await refreshCashDrawerBalance();

      // Refresh data to show new transaction in Recent Activity
      await raw.refreshData();

      showToast(`Payment received! ${formatCurrencyWithSymbol(parseFloat(receiveForm.amount), receiveForm.currency)} received from ${entity.name}`, 'success');
    } catch (err) {
    console.log(err);
      showToast('Failed to record payment.', 'error');
    }

    setReceiveForm({
      entityType: 'customer' as 'customer' | 'supplier',
      entityId: '',
      amount: '',
      currency: currency,
      description: '',
      reference: ''
    });
    setShowForm(null);
  };

  const handlePaySubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    console.log('Paying to:', payForm.entityType);
    // Validate required fields
    if (!payForm.amount || parseFloat(payForm.amount) <= 0) {
      showToast('Please enter a valid amount', 'error');
      return;
    }

    if (!payForm.entityId) {
      showToast('Please select an entity', 'error');
      return;
    }

    const entity = payForm.entityType === 'customer' ? customers.find(c => c.id === payForm.entityId) : suppliers.find(s => s.id === payForm.entityId);
    if (!entity) {
      showToast('Entity not found', 'error');
      return;
    }

    try {
      // Use the ERP Financial Service to process the payment
      const { erpFinancialService } = await import('../services/erpFinancialService');

      // Sync current entities to ERP service
      console.log('Syncing entities to ERP service:', payForm.entityType === 'customer' ? customers.length : suppliers.length, 'entities');
      localStorage.setItem('erp_customers', JSON.stringify(customers));
      localStorage.setItem('erp_suppliers', JSON.stringify(suppliers));
      erpFinancialService.reloadData();
      console.log('Entity found for payment:', entity.name);

      const result = erpFinancialService.processEntityPayment(
        payForm.entityType,
        payForm.entityId,
        parseFloat(payForm.amount),
        payForm.currency as 'USD' | 'LBP',
        `Payment to ${entity.name}${payForm.description ? ': ' + payForm.description : ''}`,
        userProfile?.id || ''
      );

      // Update entity balance (reduce debt)
      const paymentAmount = parseFloat(payForm.amount);

      if (payForm.entityType === 'customer') {
        console.log('Paying to customer:', paymentAmount);
        const currentLbBalance = entity.lb_balance || 0;
        const currentUsdBalance = entity.usd_balance || 0;

        if (payForm.currency === 'LBP') {
          await raw.updateCustomer(payForm.entityId, { 
            lb_balance: currentLbBalance - paymentAmount 
          });
        } else {
          await raw.updateCustomer(payForm.entityId, { 
            usd_balance: currentUsdBalance - paymentAmount 
          });
        }
      } else {
        const currentLbBalance = entity.lb_balance || 0;
        const currentUsdBalance = entity.usd_balance || 0;

        if (payForm.currency === 'LBP') {
          await raw.updateSupplier(payForm.entityId, { 
            lb_balance: currentLbBalance - paymentAmount 
          });
        } else {
          await raw.updateSupplier(payForm.entityId, { 
            usd_balance: currentUsdBalance - paymentAmount 
          });
        }
      }

      // Safely convert amount for database storage
      const safeAmount = CurrencyService.getInstance().safeConvertForDatabase(
        parseFloat(payForm.amount), 
        payForm.currency as 'USD' | 'LBP'
      );

      // Generate transaction ID for consistency
      const payTransactionId = createId();

      // Update cash drawer (decrease for sent payment) - this will create the transaction record
      let payCashDrawerResult: any = null;
      if (!userProfile?.store_id) {
        console.warn('Missing store_id: cannot update cash drawer');
      } else {
        payCashDrawerResult = await cashDrawerUpdateService.updateCashDrawerForTransaction({
          type: 'expense',
          amount: safeAmount.amount,
          currency: safeAmount.currency,
          description: `Payment sent to ${entity.name}${payForm.description ? ': ' + payForm.description : ''}${safeAmount.wasConverted ? ` (Originally ${payForm.amount} ${payForm.currency})` : ''}`,
          reference: payForm.reference || `PAY-${Date.now()}`,
          storeId: userProfile.store_id,
          createdBy: userProfile?.id || '',
          customerId: payForm.entityType === 'customer' ? payForm.entityId : undefined,
          supplierId: payForm.entityType === 'supplier' ? payForm.entityId : undefined
        }, getStore);
      }

      // Use the transaction ID from cash drawer service if available, otherwise create one
      const finalPayTransactionId = payCashDrawerResult?.transactionId || payTransactionId;

      // Store undo data for sent payment
      // Calculate original balance before payment was made
      const originalLbBalance = (entity.lb_balance || 0) + paymentAmount;
      const originalUsdBalance = (entity.usd_balance || 0) + paymentAmount;
      
      const payUndoData = {
        type: 'accounting_pay_payment',
        affected: [
          { table: payForm.entityType === 'customer' ? 'customers' : 'suppliers', id: payForm.entityId },
          { table: 'transactions', id: finalPayTransactionId }
        ],
        steps: [
          // Restore entity balance to original value before payment
          {
            op: 'update',
            table: payForm.entityType === 'customer' ? 'customers' : 'suppliers',
            id: payForm.entityId,
            changes: payForm.currency === 'LBP'
              ? { lb_balance: originalLbBalance, _synced: false }
              : { usd_balance: originalUsdBalance, _synced: false }
          },
          // Delete transaction
          {
            op: 'delete',
            table: 'transactions',
            id: finalPayTransactionId
          }
        ]
      };

      // Add cash drawer restoration if transaction was created
      if (payCashDrawerResult?.success && payCashDrawerResult.transactionId) {
        const { db } = await import('../lib/db');
        const account = await db.getCashDrawerAccount(userProfile?.store_id || 'default-store');
        if (account) {
          payUndoData.steps.push({
            op: 'update',
            table: 'cash_drawer_accounts',
            id: account.id,
            changes: {
              current_balance: (account.current_balance || 0) + safeAmount.amount,
              _synced: false
            } as any
          });
          payUndoData.affected.push({ table: 'cash_drawer_accounts', id: account.id });
        }
      }

      raw.pushUndo(payUndoData);

      await refreshCashDrawerBalance();

      // Refresh data to show new transaction in Recent Activity
      await raw.refreshData();

      showToast(`Payment sent! ${formatCurrencyWithSymbol(parseFloat(payForm.amount), payForm.currency)} paid to ${entity.name}`, 'success');
    } catch (err) {
      console.log(err);
      showToast('Failed to record payment.', 'error');
    }

    setPayForm({
      entityType: 'supplier' as 'customer' | 'supplier',
      entityId: '',
      amount: '',
      currency: currency,
      description: '',
      reference: ''
    });
    setShowForm(null);
  };

  const handleExpenseSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const category = expenseCategories.find(c => c.id === expenseForm.categoryId);
    if (!category) return;

    try {
      // Use the ERP Financial Service to process the expense
      const { erpFinancialService } = await import('../services/erpFinancialService');

      // Sync current data to ERP service (for consistency)
      localStorage.setItem('erp_customers', JSON.stringify(customers));
      localStorage.setItem('erp_suppliers', JSON.stringify(suppliers));
      erpFinancialService.reloadData();

      const result = erpFinancialService.processExpense(
        parseFloat(expenseForm.amount),
        expenseForm.currency as 'USD' | 'LBP',
        category.name,
        expenseForm.description,
        userProfile?.id || ''
      );

      // Safely convert amount for database storage
      const safeAmount = CurrencyService.getInstance().safeConvertForDatabase(
        parseFloat(expenseForm.amount), 
        expenseForm.currency as 'USD' | 'LBP'
      );

      // Update cash drawer (decrease for expense) - this will create the transaction record
      if (!userProfile?.store_id) {
        console.warn('Missing store_id: cannot update cash drawer');
      } else {
        const updateResult = await cashDrawerUpdateService.updateCashDrawerForTransaction({
          type: 'expense',
          amount: safeAmount.amount,
          currency: safeAmount.currency,
          description: `Expense: ${category.name} - ${expenseForm.description}${safeAmount.wasConverted ? ` (Originally ${expenseForm.amount} ${expenseForm.currency})` : ''}`,
          reference: expenseForm.reference || `EXP-${Date.now()}`,
          storeId: userProfile.store_id,
          createdBy: userProfile?.id || ''
        }, getStore);
        if (!updateResult.success && updateResult.error?.includes('No cash drawer account exists')) {
          showToast('A cash drawer account has not been created yet. Please create it to track cash expenses.', 'error');
          return;
        }
      }

      await refreshCashDrawerBalance();

      // Refresh data to show new transaction in Recent Activity
      await raw.refreshData();

      showToast(`Expense recorded! Cash drawer updated: ${result.balanceBefore.toFixed(2)} → ${result.balanceAfter.toFixed(2)}`, 'success');
    } catch (err) {
      console.log(err);
      showToast('Failed to record expense.', 'error');
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

  const handleJournalSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const totalDebit = journalForm.entries.reduce((sum, entry) => sum + entry.debit, 0);
    const totalCredit = journalForm.entries.reduce((sum, entry) => sum + entry.credit, 0);

    if (totalDebit !== totalCredit) {
      alert('Total debits must equal total credits');
      return;
    }

    // Remove addJournalEntry reference for now

    setJournalForm({
      date: new Date().toISOString().split('T')[0],
      reference: '',
      description: '',
      entries: [
        { account: '', debit: 0, credit: 0 },
        { account: '', debit: 0, credit: 0 }
      ]
    });
    setShowForm(null);
  };

  // Enhance getStatusColor and getStatusIcon for better contrast and accessibility
  const getStatusColor = (status: string) => {
    switch (status) {
      case 'paid': return 'bg-green-100 text-green-900 border border-green-400';
      case 'overdue': return 'bg-red-100 text-red-900 border border-red-400';
      case 'partial': return 'bg-yellow-100 text-yellow-900 border border-yellow-400';
      default: return 'bg-gray-100 text-gray-900 border border-gray-300';
    }
  };
  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'paid': return <CheckCircle className="w-4 h-4" aria-label="Paid" />;
      case 'overdue': return <AlertCircle className="w-4 h-4" aria-label="Overdue" />;
      case 'partial': return <Clock className="w-4 h-4" aria-label="Partial" />;
      default: return <Clock className="w-4 h-4" aria-label="Pending" />;
    }
  };

  // Add to Accounting component state:
  const [nonPricedItems, setNonPricedItems] = useState<any[]>([]);
  const [showEditNonPriced, setShowEditNonPriced] = useState<any | null>(null);
  const [stagedNonPricedChanges, setStagedNonPricedChanges] = useState<{[key: string]: any}>({});
  const [nonPricedSearch, setNonPricedSearch] = useState('');
  const [nonPricedSort, setNonPricedSort] = useState<'customer'|'product'|'date'|'value'>('date');
  const [nonPricedSortDir, setNonPricedSortDir] = useState<'asc'|'desc'>('desc');
  const [nonPricedPage, setNonPricedPage] = useState(1);
  const [showBulkActions, setShowBulkActions] = useState(false);
  const [selectedNonPriced, setSelectedNonPriced] = useState<string[]>([]);
  const NON_PRICED_PAGE_SIZE = 10;

  // Load non-priced items from sales data
  useEffect(() => {
    const nonPricedItems = sales.filter(sale => sale.unit_price === 0);
    setNonPricedItems(nonPricedItems);
  }, [sales, activeTab]);

  const handleEditNonPriced = (item: any) => setShowEditNonPriced(item);

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
      showToast('Please enter a valid unit price', 'error');
      return;
    }
    if (!updated.quantity || updated.quantity <= 0) {
      showToast('Please enter a valid quantity', 'error');
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
      showToast('Item updated successfully', 'success');
    } catch (error) {
      console.error('Error updating non-priced item:', error);
      showToast('Error updating item', 'error');
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

      showToast('Item marked as priced successfully!', 'success');
    } catch (error) {
      console.error('Error marking item as priced:', error);
      showToast('Error marking item as priced', 'error');
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
      showToast('No valid items selected (items must have price and quantity)', 'error');
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
      showToast(`${validItems.length} items marked as priced successfully!`, 'success');
    } catch (error) {
      console.error('Error bulk marking items as priced:', error);
      showToast('Error marking items as priced', 'error');
    }
  };

  const handleDeleteNonPriced = async (item: any) => {
    if (window.confirm('Are you sure you want to delete this item?')) {
      try {
        await deleteSale(item.id);
        showToast('Item deleted successfully', 'success');
      } catch (error) {
        console.error('Error deleting non-priced item:', error);
        showToast('Error deleting item', 'error');
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
        showToast('Items deleted successfully', 'success');
      } catch (error) {
        console.error('Error bulk deleting items:', error);
        showToast('Error deleting items', 'error');
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
  const filteredNonPricedItems = nonPricedItems
    .map(item => {
      const product = products.find(p => p.id === item.product_id);
      const customer = customers.find(c => c.id === item.customer_id);
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

    // Add inventory receiving logs
    inventory.forEach(item => {
      const product = products.find(p => p.id === item.product_id);
      const supplier = suppliers.find(s => s.id === item.supplier_id);

      logs.push({
        id: `inventory-${item.id}`,
        type: 'inventory_received',
        date: item.received_at || item.created_at,
        productId: item.product_id,
        productName: product?.name || 'Unknown Product',
        supplierId: item.supplier_id,
        supplierName: supplier?.name || 'Unknown Supplier',
        quantity: item.quantity,
        weight: item.weight,
        unit: item.unit,
        price: item.price,
        commissionRate: item.commission_rate,
        amount: item.price ? (item.price * (item.weight || item.quantity)) : 0,
        currency: 'USD',
        description: `Received ${item.quantity} ${item.unit}${item.weight ? ` (${item.weight} kg)` : ''} of ${product?.name || 'Unknown Product'} from ${supplier?.name || 'Unknown Supplier'}`,
        reference: `INV-${item.id.slice(-8)}`,
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
          reference: `SALE-${sale.id.slice(-8)}`,
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

      switch (inventoryLogsDateFilter) {
        case 'today':
          startDate = new Date(now.getFullYear(), now.getMonth(), now.getDate());
          break;
        case 'week':
          startDate = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
          break;
        case 'month':
          startDate = new Date(now.getFullYear(), now.getMonth(), 1);
          break;
        default:
          startDate = new Date(0);
      }

      filtered = filtered.filter(log => new Date(log.date) >= startDate);
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
    showToast('Inventory transaction logs exported successfully', 'success');
  };

  const handleViewInventoryItemDetails = (log: any) => {
    if (log.type === 'inventory_received') {
      const inventoryItem = inventory.find(item => item.id === log.id.replace('inventory-', ''));
      setSelectedInventoryItem(inventoryItem);
      setShowInventoryItemDetails(true);
    }
  };

  // Pending bills state
  const [pendingBillsSearchTerm, setPendingBillsSearchTerm] = useState('');
  const [pendingBillsSupplierFilter, setPendingBillsSupplierFilter] = useState('');
  const [pendingBillsProductFilter, setPendingBillsProductFilter] = useState('');
  const [pendingBillsPage, setPendingBillsPage] = useState(1);
  const [pendingBillsSort, setPendingBillsSort] = useState<'date' | 'supplier' | 'product' | 'amount' | 'progress' | 'revenue' | 'status'>('date');
  const [pendingBillsSortDir, setPendingBillsSortDir] = useState<'asc' | 'desc'>('desc');
  const [pendingBillsStatusFilter, setPendingBillsStatusFilter] = useState<string>('all');
  const [selectedPendingBill, setSelectedPendingBill] = useState<any>(null);
  const [showPendingBillDetails, setShowPendingBillDetails] = useState(false);
  const [showCloseBillModal, setShowCloseBillModal] = useState(false);
  const [closingBill, setClosingBill] = useState<any>(null);
  const [selectedBills, setSelectedBills] = useState<Set<string>>(new Set());
  const [showPendingBillsBulkActions, setShowPendingBillsBulkActions] = useState(false);

  // Received bills state
  const [receivedBillsSearchTerm, setReceivedBillsSearchTerm] = useState('');
  const [receivedBillsSupplierFilter, setReceivedBillsSupplierFilter] = useState('');
  const [receivedBillsProductFilter, setReceivedBillsProductFilter] = useState('');
  const [receivedBillsPage, setReceivedBillsPage] = useState(1);
  const [receivedBillsSort, setReceivedBillsSort] = useState<'date' | 'supplier' | 'product' | 'amount' | 'progress' | 'revenue' | 'status'>('date');
  const [receivedBillsSortDir, setReceivedBillsSortDir] = useState<'asc' | 'desc'>('desc');
  const [receivedBillsStatusFilter, setReceivedBillsStatusFilter] = useState<string>('all');
  const [selectedReceivedBill, setSelectedReceivedBill] = useState<any>(null);
  const [showReceivedBillDetails, setShowReceivedBillDetails] = useState(false);
  // Moved to ReceivedBills component

  // Pending bills functions
  const getPendingBills = useMemo(() => {
    const bills: any[] = [];

    try {
      // Group commission inventory items by supplier and product
      const receivedItems = inventory.filter(item =>  
        item.product_id && 
        item.supplier_id
      );

      console.log('Debug - Commission items found:', receivedItems.length);

      receivedItems.forEach(item => {
        const product = products.find(p => p.id === item.product_id);
        const supplier = suppliers.find(s => s.id === item.supplier_id);

        if (!product || !supplier) {
          console.warn('Missing product or supplier for item:', item.id);
          return;
        }

        // Calculate total sales for this specific inventory item (by received date)
        const relatedSales = sales.filter(sale => 
          sale && Array.isArray(sale) && 
          sale.some((saleItem: any) => 
            saleItem.productId === item.product_id && 
            saleItem.supplierId === item.supplier_id &&
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
                  saleItem.supplierId === item.supplier_id &&
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
            supplierId: item.supplier_id,
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
      showToast('Error processing pending bills data', 'error');
      return [];
    }
  }, [inventory, sales, products, suppliers]);

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
        showToast('This bill is already closed.', 'error');
        return;
      }

      // Calculate total revenue from the bill
      const totalRevenue = fees.commission + fees.porterage + fees.transfer + fees.supplierAmount;

      // Add commission transaction (if applicable)
      if (fees.commission > 0) {
        const safeCommissionAmount = CurrencyService.getInstance().safeConvertForDatabase(fees.commission, 'USD');
        await addTransaction({
          id: createId(),
          type: 'income',
          category: 'Commission',
          supplier_id: bill.supplier_id,
          amount: safeCommissionAmount.amount,
          currency: safeCommissionAmount.currency,
          description: `Commission fee for ${bill.productName} sold on behalf of ${bill.supplierName}${safeCommissionAmount.wasConverted ? ` (Originally ${fees.commission} USD)` : ''}`,
          reference: `COMM-${bill.id.slice(-8)}`,
          created_by: userProfile?.id || ''
        });
      }

      // Add porterage transaction (if applicable)
      if (fees.porterage > 0) {
        const safePorterageAmount = CurrencyService.getInstance().safeConvertForDatabase(fees.porterage, 'USD');
        await addTransaction({
          id: createId(),
          type: 'income',
          supplier_id: bill.supplier_id,
          category: 'Porterage',
          amount: safePorterageAmount.amount,
          currency: safePorterageAmount.currency,
          description: `Porterage fee for ${bill.productName} from ${bill.supplierName}${safePorterageAmount.wasConverted ? ` (Originally ${fees.porterage} USD)` : ''}`,
          reference: `PORT-${bill.id.slice(-8)}`,
          created_by: userProfile?.id || ''
        });
      }

      // Add transfer fee transaction (if applicable)
      if (fees.transfer > 0) {
        const safeTransferAmount = CurrencyService.getInstance().safeConvertForDatabase(fees.transfer, 'USD');
        await addTransaction({
          id: createId(),
          type: 'income',
          supplier_id: bill.supplier_id,
          category: 'Transfer Fee',
          amount: safeTransferAmount.amount,
          currency: safeTransferAmount.currency,
          description: `Transfer fee for ${bill.productName} from ${bill.supplierName}${safeTransferAmount.wasConverted ? ` (Originally ${fees.transfer} USD)` : ''}`,
          reference: `TRANS-${bill.id.slice(-8)}`,
          created_by: userProfile?.id || ''
        });
      }

      // Add supplier payment transaction
      if (fees.supplierAmount > 0) {
        const safeSupplierAmount = CurrencyService.getInstance().safeConvertForDatabase(fees.supplierAmount, 'USD');
        await addTransaction({
          id: createId(),
          supplier_id: bill.supplier_id,
          type: 'expense',
          category: 'Supplier Payment',
          amount: safeSupplierAmount.amount,
          currency: safeSupplierAmount.currency,
          description: `Payment to ${bill.supplierName} for ${bill.productName} sales${safeSupplierAmount.wasConverted ? ` (Originally ${fees.supplierAmount} USD)` : ''}`,
          reference: `PAY-${bill.id.slice(-8)}`,
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

      showToast('Bill closed successfully! All fees deducted and supplier balance updated.', 'success');
    } catch (error) {
      console.error('Error closing received bill:', error);
      throw new Error('Failed to close bill. Please try again.');
    }
  };

  const handleUpdateBatch = async (batchId: string, updates: { porterage?: number | null; transfer_fee?: number | null; notes?: string | null }) => {
    try {
      // Update batch information
      await updateInventoryBatch(batchId, updates);
      showToast('Batch updated successfully', 'success');
    } catch (error) {
      showToast('Error updating batch', 'error');
    }
  };

  const handleApplyBatchCommission = async (batchId: string, commissionRate: number) => {
    try {
      // Apply commission rate to batch
      await updateInventoryBatch(batchId, { commission_rate: commissionRate });
      showToast('Commission rate applied successfully', 'success');
    } catch (error) {
      showToast('Error applying commission rate', 'error');
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
        id: createId(),
        type: 'expense',
        category: 'Commission',
        supplier_id: closingBill.supplier_id,
        amount: safeCommissionAmount.amount,
        currency: safeCommissionAmount.currency,
        description: `Commission fee for ${closingBill.productName} sold on behalf of ${closingBill.supplierName}${safeCommissionAmount.wasConverted ? ` (Originally ${commissionAmount} USD)` : ''}`,
        reference: `COMM-${closingBill.inventoryItemId.slice(-8)}`,
        created_by: userProfile?.id || ''
      });

      // Add supplier payment transaction
      await addTransaction({
        id: createId(),
        type: 'expense',
        category: 'Supplier Payment',
        supplier_id: closingBill.supplier_id,
        amount: safeSupplierPayment.amount,
        currency: safeSupplierPayment.currency,
        description: `Payment to ${closingBill.supplierName} for ${closingBill.productName} sales${safeSupplierPayment.wasConverted ? ` (Originally ${supplierPayment} USD)` : ''}`,
        reference: `PAY-${closingBill.inventoryItemId.slice(-8)}`,
        created_by: userProfile?.id || ''
      });

      showToast('Bill closed successfully! Commission deducted and supplier payment recorded.', 'success');
      setShowCloseBillModal(false);
      setClosingBill(null);
    } catch (error) {
      showToast('Failed to close bill. Please try again.', 'error');
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
      showToast('No completed bills selected for closing', 'error');
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

      showToast(`Successfully closed ${closedCount} bills`, 'success');
      setSelectedBills(new Set());
      setShowPendingBillsBulkActions(false);
    } catch (error) {
      console.error('Error bulk closing bills:', error);
      showToast('Error closing bills', 'error');
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

      showToast('Pending bills exported successfully', 'success');
    } catch (error) {
      console.error('Error exporting pending bills:', error);
      showToast('Error exporting pending bills', 'error');
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

  // Function to update existing inventory items with received_quantity
  const updateInventoryItemsWithReceivedQuantity = async () => {
    try {
      console.log('Debug - Total inventory items:', inventory.length);
      console.log('Debug - Inventory items with received_quantity issues:');

      inventory.forEach((item, index) => {
        console.log(`Item ${index + 1}:`, {
          id: item.id,
          received_quantity: item.received_quantity,
          received_quantity_type: typeof item.received_quantity,
          quantity: item.quantity
        });
      });

      const itemsToUpdate = inventory.filter(item => 
        item.received_quantity === null || item.received_quantity === undefined || item.received_quantity === 0
      );

      console.log('Debug - Filtered items to update:', itemsToUpdate.length);

      if (itemsToUpdate.length > 0) {
        console.log(`Found ${itemsToUpdate.length} inventory items without received_quantity`);
        showToast(`Found ${itemsToUpdate.length} items that need received_quantity field. Please add new inventory items to see proper progress tracking.`, 'error');

        // Log the items that need updating
        itemsToUpdate.forEach((item, index) => {
          console.log(`Item ${index + 1} needs received_quantity update:`, {
            id: item.id,
            current_quantity: item.quantity,
            received_quantity: item.received_quantity,
            received_quantity_type: typeof item.received_quantity
          });
        });
      } else {
        showToast('All inventory items have received_quantity field set!', 'success');
      }
    } catch (error) {
      console.error('Error checking inventory items:', error);
      showToast('Error checking inventory items', 'error');
    }
  };

  // Received bills functions
  const getReceivedBills = useMemo(() => {
    const bills: any[] = [];

    try {
      // Get all inventory items (both commission and cash) - including items with quantity = 0 for review purposes
      const allInventoryItems = inventory.filter(item => 
        item.product_id && 
        item.supplier_id
        // Note: We include items with quantity = 0 for received bills review
        // These items are kept in the database instead of being deleted when quantity reaches 0
      );
      console.log('Inventory', inventory);
      console.log('Debug - All inventory items found:', allInventoryItems.length);

      allInventoryItems.forEach(item => {
        const product = products.find(p => p.id === item.product_id);
        const supplier = suppliers.find(s => s.id === item.supplier_id);

        if (!product || !supplier) {
          console.warn('Missing product or supplier for item:', item.id);
          return;
        }

        // Calculate total sales for this specific inventory item (by received date)
        const relatedSales = sales.filter(sale => 
          sale && Array.isArray(sale) && 
          sale.some((saleItem: any) => 
            saleItem.productId === item.product_id && 
            saleItem.supplierId === item.supplier_id &&
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
          supplierId: item.supplier_id,
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
      showToast('Error processing received bills data', 'error');
    }

    return bills;
  }, [inventory, products, suppliers, sales]);

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

      showToast('Received bills exported successfully', 'success');
    } catch (error) {
      console.error('Error exporting received bills:', error);
      showToast('Error exporting received bills', 'error');
    }
  };
  // Sales logs edit/delete handlers
  const handleEditSale = (sale: any) => {
    setEditingSale({
      ...sale,
      quantity: sale.quantity || 1,
      weight: sale.weight || null,
      unitPrice: sale.unit_price || 0,
      paymentMethod: sale.payment_method || 'cash',
      status: sale.status || ''
    });
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

      showToast('Sale updated successfully', 'success');
      setShowEditSaleModal(false);
      setEditingSale(null);
    } catch (error) {
      console.error('Error updating sale:', error);
      showToast('Error updating sale', 'error');
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
      showToast('Sale deleted successfully', 'success');
      setShowDeleteSaleModal(false);
      setSaleToDelete(null);
    } catch (error) {
      console.error('Error deleting sale:', error);
      showToast('Error deleting sale', 'error');
    }
  };

  // Show loading screen if data is not ready
  if (!isDataReady) {
    return (
      <div className="p-6">
        <div className="flex items-center justify-center h-64">
          <div className="text-center">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-4"></div>
            <p className="text-gray-600">Loading accounting data...</p>
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
        dashboardPeriod={dashboardPeriod}
        setDashboardPeriod={setDashboardPeriod}
        showAdvancedFilters={showAdvancedFilters}
        setShowAdvancedFilters={setShowAdvancedFilters}
        setShowForm={setShowForm}
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
            transactions={transactions}
            today={today}
            currency="USD"
            setShowForm={setShowForm}
            formatCurrency={formatCurrency}
            formatCurrencyWithSymbol={formatCurrencyWithSymbol}
            getConvertedAmount={getConvertedAmount}
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
          <h3 className="text-lg font-semibold text-gray-900 mb-4">Cash Drawer Management</h3>
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
        <InventoryLogs />
      )}

      {activeTab === 'received-bills' && (
        <ReceivedBills
          inventory={inventory}
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
          onApplyBatchCommission={handleApplyBatchCommission}
          defaultCommissionRate={defaultCommissionRate}
          recentSuppliers={recentSuppliers}
          setRecentSuppliers={setRecentSuppliers}
          addSupplier={addSupplier}
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

            setShowAddCustomerForm,
            setShowAddSupplierForm,
            setShowAddCategoryForm,

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
          isOpen={showEditSaleModal}
          sale={editingSale}
          customers={customers}
          formatCurrency={formatCurrency}
          onClose={() => setShowEditSaleModal(false)}
          onSave={handleSaveSaleEdit}
        />
      )}

      {/* Delete Sale Confirmation Modal */}
      {showDeleteSaleModal && saleToDelete && (
        <DeleteSaleModal
          isOpen={showDeleteSaleModal && !!saleToDelete}
          onClose={() => setShowDeleteSaleModal(false)}
          onConfirm={handleConfirmDeleteSale}
          title="Delete Customer"
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