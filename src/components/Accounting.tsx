import React, { useState, useEffect, useMemo } from 'react';
import { useOfflineData } from '../contexts/OfflineDataContext';
import { useSupabaseAuth } from '../contexts/SupabaseAuthContext';
import { useCurrency } from '../hooks/useCurrency';
import SearchableSelect from './common/SearchableSelect';
import MoneyInput from './common/MoneyInput';
import { cleanupAndValidateSaleItems } from '../utils/cleanupSaleItemsData';
import { useLocalStorage } from '../hooks/useLocalStorage';
import { SupabaseService } from '../services/supabaseService';
import { 
  Calculator,
  DollarSign,
  CreditCard,
  Receipt,
  TrendingUp,
  TrendingDown,
  Plus,
  Search,
  Calendar,
  FileText,
  AlertCircle,
  CheckCircle,
  Clock,
  Edit,
  Trash2,
  Download,
  Upload,
  RefreshCw,
  Filter,
  BarChart3,
  PieChart,
  Activity,
  Target,
  Zap,
  Eye,
  EyeOff,
  ChevronRight,
  ArrowUpRight,
  ArrowDownRight,
  TrendingDown as TrendingDownIcon,
  Wallet,
  CreditCard as CreditCardIcon,
  Building2,
  Users,
  User,
  ShoppingCart,
  Award,
  AlertTriangle,
  Package,
  FileSpreadsheet,
  ClipboardList,
  Calculator as CalculatorIcon,
  X
} from 'lucide-react';
import Toast from './common/Toast';
import { CurrencyService } from '../services/currencyService';
import ReceivedBills from './accountingTabs/ReceivedBills';
import InventoryLogs from './accountingTabs/InventoryLogs';

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
  const transactions = raw.transactions?.map(t => ({...t, createdAt: t.created_at})) || [];
  const customers = raw.customers?.map(c => ({...c, isActive: c.is_active, createdAt: c.created_at, lb_balance: c.lb_balance, usd_balance: c.usd_balance})) || [];
  const suppliers = raw.suppliers?.map(s => ({...s, createdAt: s.created_at, lb_balance: s.lb_balance, usd_balance: s.usd_balance})) || [];
  const expenseCategories = raw.expenseCategories || [];
  const inventory = raw.inventory || [];
  const sales = raw.sales || [];
  const products = raw.products || [];

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

  const [activeTab, setActiveTab] = useState<'dashboard' | 'customer-balances' | 'supplier-balances' | 'expenses' | 'journal' | 'nonpriced' | 'inventory-logs' | 'received-bills'>('dashboard');
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

      // Also add to legacy transaction system for compatibility
      addTransaction({
        type: 'income',
        category: receiveForm.entityType === 'customer' ? 'Customer Payment' : 'Supplier Payment',
        amount: safeAmount.amount,
        currency: safeAmount.currency,
        description: `Payment from ${entity.name}${receiveForm.description ? ': ' + receiveForm.description : ''}${safeAmount.wasConverted ? ` (Originally ${receiveForm.amount} ${receiveForm.currency})` : ''}`,
        reference: receiveForm.reference,
        created_by: userProfile?.id || ''
      });

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

      // Also add to legacy transaction system for compatibility
      addTransaction({
        type: 'expense',
        category: payForm.entityType === 'customer' ? 'Customer Payment' : 'Supplier Payment',
        amount: safeAmount.amount,
        currency: safeAmount.currency,
        description: `Payment to ${entity.name}${payForm.description ? ': ' + payForm.description : ''}${safeAmount.wasConverted ? ` (Originally ${payForm.amount} ${payForm.currency})` : ''}`,
        reference: payForm.reference,
        created_by: userProfile?.id || ''
      });

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

      // Also add to legacy transaction system for compatibility
      addTransaction({
        type: 'expense',
        category: category.name,
        amount: safeAmount.amount,
        currency: safeAmount.currency,
        description: `${expenseForm.description}${safeAmount.wasConverted ? ` (Originally ${expenseForm.amount} ${expenseForm.currency})` : ''}`,
        reference: expenseForm.reference,
        created_by: userProfile?.id || ''
      });

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
    console.log(sales, 'sale231');


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
            inventoryItemId: item.id,
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
          type: 'income',
          category: 'Commission',
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
          type: 'income',
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
          type: 'income',
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

      // Persist closed flag onto the inventory item by appending a marker in status
      try {
        const existingNotes = bill.status || '';
        const closedNote = existingNotes.includes('[CLOSED]') ? existingNotes : `${existingNotes ? existingNotes + ' ' : ''}[CLOSED]`;
        await SupabaseService.updateInventoryItem(bill.id, { notes: closedNote });
      } catch (e) {
        console.warn('Failed to persist closed flag on inventory item:', e);
      }

      showToast('Bill closed successfully! All fees deducted and supplier balance updated.', 'success');
    } catch (error) {
      console.error('Error closing received bill:', error);
      throw new Error('Failed to close bill. Please try again.');
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
        id: '',
        type: 'expense',
        category: 'Commission',
        amount: safeCommissionAmount.amount,
        currency: safeCommissionAmount.currency,
        description: `Commission fee for ${closingBill.productName} sold on behalf of ${closingBill.supplierName}${safeCommissionAmount.wasConverted ? ` (Originally ${commissionAmount} USD)` : ''}`,
        reference: `COMM-${closingBill.inventoryItemId.slice(-8)}`,
        created_by: userProfile?.id || ''
      });

      // Add supplier payment transaction
      await addTransaction({
        id: safeSupplierPayment.id,
        type: 'expense',
        category: 'Supplier Payment',
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

  // const handleViewReceivedBillSalesLogs = (bill: any) => {
  //   setSelectedReceivedBill(bill);
  //   setShowReceivedBillSalesLogs(true);
  // };

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
      <div className="flex flex-wrap items-center justify-between gap-4 mb-6 p-4 bg-white rounded-lg shadow-sm border">
        <div className="flex items-center space-x-2">
          <button
            onClick={() => setShowForm('receive')}
            className="bg-green-600 text-white px-4 py-2 rounded-lg hover:bg-green-700 transition-colors flex items-center shadow-sm"
          >
            <ArrowDownRight className="w-4 h-4 mr-2" />
            Receive
          </button>
          <button
            onClick={() => setShowForm('pay')}
            className="bg-red-600 text-white px-4 py-2 rounded-lg hover:bg-red-700 transition-colors flex items-center shadow-sm"
          >
            <ArrowUpRight className="w-4 h-4 mr-2" />
            Pay
          </button>
          <button
            onClick={() => setShowForm('expense')}
            className="bg-amber-600 text-white px-4 py-2 rounded-lg hover:bg-amber-700 transition-colors flex items-center shadow-sm"
          >
            <Receipt className="w-4 h-4 mr-2" />
            Expense
          </button>
        </div>

        <div className="flex items-center space-x-2">
          <select
            value={dashboardPeriod}
            onChange={(e) => setDashboardPeriod(e.target.value as any)}
            className="border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-blue-500 focus:border-blue-500"
          >
            <option value="today">Today</option>
            <option value="week">This Week</option>
            <option value="month">This Month</option>
            <option value="quarter">This Quarter</option>
            <option value="year">This Year</option>
          </select>
          <button
            onClick={() => setShowAdvancedFilters(!showAdvancedFilters)}
            className={`p-2 rounded-lg transition-colors ${showAdvancedFilters ? 'bg-blue-100 text-blue-600' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}
          >
            <Filter className="w-4 h-4" />
          </button>
          <button className="p-2 bg-gray-100 text-gray-600 rounded-lg hover:bg-gray-200 transition-colors">
            <RefreshCw className="w-4 h-4" />
          </button>
          <button className="p-2 bg-gray-100 text-gray-600 rounded-lg hover:bg-gray-200 transition-colors">
            <Download className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex space-x-1 mb-6 bg-gray-100 p-1 rounded-lg w-fit overflow-x-auto">
        {[
          { id: 'dashboard', label: 'Dashboard', icon: BarChart3 },
          { id: 'expenses', label: 'Expenses', icon: Receipt },
          { id: 'nonpriced', label: 'Non Priced Items', icon: AlertCircle },
          { id: 'inventory-logs', label: 'Inventory Logs', icon: Package },
          { id: 'received-bills', label: 'Received Bills', icon: FileText }
        ].map(tab => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id as any)}
            className={`px-4 py-2 rounded-md transition-colors flex items-center relative whitespace-nowrap ${
              activeTab === tab.id ? 'bg-white text-blue-600 shadow-sm' : 'text-gray-600 hover:text-gray-900'
            }`}
          >
            <tab.icon className="w-4 h-4 mr-2" />
            {tab.label}
            {tab.id === 'nonpriced' && filteredNonPricedItems.length > 0 && (
              <span className="ml-2 bg-red-500 text-white text-xs rounded-full px-2 py-1 min-w-[20px] h-5 flex items-center justify-center">
                {filteredNonPricedItems.length}
              </span>
            )}
          </button>
        ))}
      </div>

      {activeTab === 'dashboard' && (
        <div className="space-y-6">
          {/* KPI Cards */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
            <div className="bg-white rounded-xl shadow-sm p-6 border-l-4 border-blue-500">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-gray-600 font-medium">Revenue ({dashboardPeriod})</p>
                  <p className="text-2xl font-bold text-gray-900">{formatCurrency(getPeriodData.income)}</p>
                  <div className="flex items-center mt-2">
                    {getPeriodData.incomeChange >= 0 ? (
                      <ArrowUpRight className="w-4 h-4 text-green-500 mr-1" />
                    ) : (
                      <TrendingDownIcon className="w-4 h-4 text-red-500 mr-1" />
                    )}
                    <span className={`text-sm font-medium ${getPeriodData.incomeChange >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                      {Math.abs(getPeriodData.incomeChange).toFixed(1)}%
                    </span>
                    <span className="text-xs text-gray-500 ml-1">vs prev period</span>
                  </div>
                </div>
                <div className="p-3 bg-blue-100 rounded-full">
                  <TrendingUp className="w-6 h-6 text-blue-600" />
                </div>
              </div>
            </div>

            <div className="bg-white rounded-xl shadow-sm p-6 border-l-4 border-red-500">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-gray-600 font-medium">Expenses ({dashboardPeriod})</p>
                  <p className="text-2xl font-bold text-gray-900">{formatCurrency(getPeriodData.expenses)}</p>
                  <div className="flex items-center mt-2">
                    {getPeriodData.expenseChange >= 0 ? (
                      <ArrowUpRight className="w-4 h-4 text-red-500 mr-1" />
                    ) : (
                      <TrendingDownIcon className="w-4 h-4 text-green-500 mr-1" />
                    )}
                    <span className={`text-sm font-medium ${getPeriodData.expenseChange >= 0 ? 'text-red-600' : 'text-green-600'}`}>
                      {Math.abs(getPeriodData.expenseChange).toFixed(1)}%
                    </span>
                    <span className="text-xs text-gray-500 ml-1">vs prev period</span>
                  </div>
                </div>
                <div className="p-3 bg-red-100 rounded-full">
                  <TrendingDown className="w-6 h-6 text-red-600" />
                </div>
              </div>
            </div>

            <div className="bg-white rounded-xl shadow-sm p-6 border-l-4 border-green-500">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-gray-600 font-medium">Total Customer Debt</p>
                  <p className="text-2xl font-bold text-gray-900">
          LBP: {formatCurrency(customers.filter(c => (c.lb_balance || 0) > 0).reduce((sum, c) => sum + (c.lb_balance || 0), 0))}
          <br />
          USD: {formatCurrency(customers.filter(c => (c.usd_balance || 0) > 0).reduce((sum, c) => sum + (c.usd_balance || 0), 0))}
        </p>
                  <div className="flex items-center mt-2">
                    <Users className="w-4 h-4 text-blue-500 mr-1" />
                    <span className="text-sm font-medium text-blue-600">{customers.filter(c => (c.lb_balance || 0) > 0 || (c.usd_balance || 0) > 0).length}</span>
                    <span className="text-xs text-gray-500 ml-1">customers with debt</span>
                  </div>
                </div>
                <div className="p-3 bg-green-100 rounded-full">
                  <Wallet className="w-6 h-6 text-green-600" />
                </div>
              </div>
            </div>


          </div>



          {/* Recent Activity */}
          <div className="bg-white rounded-xl shadow-sm p-6">
            <div className="flex items-center justify-between mb-6">
              <h3 className="text-lg font-semibold text-gray-900">Recent Activity</h3>
              <button className="text-sm text-blue-600 hover:text-blue-700 font-medium">View All</button>
            </div>

            <div className="space-y-4">
              {transactions
                .filter(t => new Date(t.createdAt) >= new Date(Date.now() - 7 * 24 * 60 * 60 * 1000))
                .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
                .slice(0, 5)
                .map(transaction => (
                <div key={transaction.id} className="flex items-center justify-between p-4 bg-gray-50 rounded-lg">
                  <div className="flex items-center">
                    <div className={`p-2 rounded-full mr-3 ${
                      transaction.type === 'income' ? 'bg-green-100' : 'bg-red-100'
                    }`}>
                      {transaction.type === 'income' ? (
                        <ArrowDownRight className={`w-4 h-4 ${transaction.type === 'income' ? 'text-green-600' : 'text-red-600'}`} />
                      ) : (
                        <ArrowUpRight className={`w-4 h-4 ${transaction.type === 'expense' ? 'text-red-600' : 'text-green-600'}`} />
                      )}
                    </div>
                    <div>
                      <div className="text-sm font-medium text-gray-900">{transaction.category}</div>
                      <div className="text-xs text-gray-500">{transaction.description}</div>
                    </div>
                  </div>
                  <div className="text-right">
                    <div className={`text-sm font-semibold ${
                      transaction.type === 'income' ? 'text-green-600' : 'text-red-600'
                    }`}>
                      {transaction.type === 'income' ? '+' : '-'}{(() => {
                        // Check if this transaction was originally LBP but converted to USD for storage
                        const originalLBPAmount = transaction.description.match(/Originally ([\d,]+) LBP/);
                        if (originalLBPAmount) {
                          // Display the original LBP amount
                          return formatCurrencyWithSymbol(parseInt(originalLBPAmount[1].replace(/,/g, '')), 'LBP');
                        }
                        // Otherwise display normally
                        return formatCurrencyWithSymbol(transaction.amount, transaction.currency || 'USD');
                      })()}
                    </div>
                    <div className="text-xs text-gray-500">{new Date(transaction.createdAt).toLocaleDateString()}</div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}



      {
      // activeTab === 'customer-balances' && (
        // <div className="space-y-6">
        //   <div className="flex justify-between items-center">
        //     <h2 className="text-xl font-semibold text-gray-900">Customer Balances</h2>
        //     <button
        //       onClick={() => setShowForm('receive')}
        //       className="bg-green-600 text-white px-4 py-2 rounded-lg hover:bg-green-700 transition-colors flex items-center"
        //     >
        //       <Plus className="w-5 h-5 mr-2" />
        //       Record Payment
        //     </button>
        //   </div>

        //   {/* Search */}
        //   <div className="bg-white p-4 rounded-lg shadow-sm">
        //     <div className="relative">
        //       <Search className="w-5 h-5 absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400" />
        //       <input
        //         type="text"
        //         placeholder="Search customers..."
        //         value={searchTerm}
        //         onChange={(e) => setSearchTerm(e.target.value)}
        //         className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-blue-500 focus:border-blue-500"
        //       />
        //     </div>
        //   </div>

        //   {/* Customer Balances Table */}
        //   <div className="bg-white rounded-lg shadow-sm">
        //     <div className="p-6 border-b">
        //       <h3 className="text-lg font-semibold text-gray-900">Customer Account Balances</h3>
        //     </div>
        //     <div className="overflow-x-auto">
        //       <table className="w-full">
        //         <thead className="bg-gray-50">
        //           <tr>
        //             <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Customer</th>
        //             <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Contact</th>
        //             <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Current Balance</th>
        //             <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Status</th>
        //             <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Last Transaction</th>
        //             <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Actions</th>
        //           </tr>
        //         </thead>
        //         <tbody className="divide-y divide-gray-200">
        //           {customers
        //             .filter(customer => customer.name.toLowerCase().includes(searchTerm.toLowerCase()))
        //             .filter(customer => customer.is_active)
        //             .sort((a, b) => (b.balance || 0) - (a.balance || 0)) // Updated to use balance field with null safety
        //             .map(customer => (
        //             <tr key={customer.id} className="hover:bg-gray-50">
        //               <td className="px-6 py-4">
        //                 <div className="flex items-center">
        //                   <div className="w-10 h-10 bg-blue-100 rounded-full flex items-center justify-center mr-3">
        //                     <Users className="w-5 h-5 text-blue-600" />
        //                   </div>
        //                   <div>
        //                     <div className="text-sm font-medium text-gray-900">{customer.name}</div>
        //                     <div className="text-sm text-gray-500">Customer ID: {customer.id.slice(-8)}</div>
        //                   </div>
        //                 </div>
        //               </td>
        //               <td className="px-6 py-4">
        //                 <div className="text-sm text-gray-900">{customer.phone || 'N/A'}</div>
        //                 <div className="text-sm text-gray-500">{customer.email || 'No email'}</div>
        //               </td>
        //               <td className="px-6 py-4">
        //                 <div className={`text-lg font-semibold ${(customer.balance || 0) > 0 ? 'text-red-600' : (customer.balance || 0) < 0 ? 'text-green-600' : 'text-gray-900'}`}>
        //                   {formatCurrency(Math.abs(customer.balance || 0))}
        //                 </div>
        //                 <div className="text-xs text-gray-500">
        //                   {(customer.balance || 0) > 0 ? 'Owes money' : (customer.balance || 0) < 0 ? 'Credit balance' : 'Balanced'}
        //                 </div>
        //               </td>
        //               <td className="px-6 py-4">
        //                 <span className={`px-2 py-1 text-xs rounded-full ${
        //                   (currency === 'LBP' ? (customer.balance || 0) * 89500 : (customer.balance || 0)) > 1000 ? 'bg-red-100 text-red-800' :
        //                   (customer.balance || 0) > 0 ? 'bg-yellow-100 text-yellow-800' :
        //                   (customer.balance || 0) < 0 ? 'bg-green-100 text-green-800' :
        //                   'bg-gray-100 text-gray-800'
        //                 }`}>
        //                   {(currency === 'LBP' ? (customer.balance || 0) * 89500 : (customer.balance || 0)) > 1000 ? 'High Debt' :
        //                    (customer.balance || 0) > 0 ? 'Has Debt' :
        //                    (customer.balance || 0) < 0 ? 'Credit' :
        //                    'Balanced'}
        //                 </span>
        //               </td>
        //               <td className="px-6 py-4 text-sm text-gray-500">
        //                 {customer.createdAt ? new Date(customer.createdAt).toLocaleDateString() : 'N/A'}
        //               </td>
        //               <td className="px-6 py-4">
        //                 <div className="flex space-x-2">
        //                                              <button 
        //                      onClick={() => {
        //                        setReceiveForm(prev => ({ ...prev, customerId: customer.id }));
        //                        setShowForm('receive');
        //                      }}
        //                      className="text-green-600 hover:text-green-800"
        //                      title="Record payment"
        //                    >
        //                     <DollarSign className="w-4 h-4" />
        //                   </button>
        //                   <button className="text-blue-600 hover:text-blue-800" title="View details">
        //                     <Eye className="w-4 h-4" />
        //                   </button>
        //                 </div>
        //               </td>
        //             </tr>
        //           ))}
        //         </tbody>
        //       </table>
        //     </div>
        //   </div>

        //   {/* Summary Cards */}
        //   <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        //     <div className="bg-white rounded-lg shadow-sm p-6">
        //       <div className="flex items-center justify-between">
        //         <div>
        //           <p className="text-sm text-gray-600">Total Customer Debt</p>
        //           <p className="text-2xl font-bold text-red-600">
        //             {formatCurrency(customers.filter(c => (c.balance || 0) > 0).reduce((sum, c) => sum + (c.balance || 0), 0))}
        //           </p>
        //         </div>
        //         <AlertTriangle className="w-8 h-8 text-red-500" />
        //       </div>
        //     </div>

        //     <div className="bg-white rounded-lg shadow-sm p-6">
        //       <div className="flex items-center justify-between">
        //         <div>
        //           <p className="text-sm text-gray-600">Customers with Debt</p>
        //           <p className="text-2xl font-bold text-gray-900">
        //             {customers.filter(c => (c.balance || 0) > 0).length}
        //           </p>
        //         </div>
        //         <Users className="w-8 h-8 text-blue-500" />
        //       </div>
        //     </div>

        //     <div className="bg-white rounded-lg shadow-sm p-6">
        //       <div className="flex items-center justify-between">
        //         <div>
        //           <p className="text-sm text-gray-600">Average Debt per Customer</p>
        //           <p className="text-2xl font-bold text-gray-900">
        //             {formatCurrency(customers.filter(c => (c.balance || 0) > 0).length > 0 ? 
        //               customers.filter(c => (c.balance || 0) > 0).reduce((sum, c) => sum + (c.balance || 0), 0) / 
        //               customers.filter(c => (c.balance || 0) > 0).length : 0)}
        //           </p>
        //         </div>
        //         <Target className="w-8 h-8 text-purple-500" />
        //       </div>
        //     </div>
        //   </div>
        // </div>


//  )
}


      {
      // activeTab === 'supplier-balances' && (
      //   <div className="space-y-6">
      //     <div className="flex justify-between items-center">
      //       <h2 className="text-xl font-semibold text-gray-900">Supplier Balances</h2>
      //       <button
      //         onClick={() => setShowForm('pay')}
      //         className="bg-red-600 text-white px-4 py-2 rounded-lg hover:bg-red-700 transition-colors flex items-center"
      //       >
      //         <Plus className="w-5 h-5 mr-2" />
      //         Make Payment
      //       </button>
      //     </div>

      //     {/* Search */}
      //     <div className="bg-white p-4 rounded-lg shadow-sm">
      //       <div className="relative">
      //         <Search className="w-5 h-5 absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400" />
      //         <input
      //           type="text"
      //           placeholder="Search suppliers..."
      //           value={searchTerm}
      //           onChange={(e) => setSearchTerm(e.target.value)}
      //           className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-blue-500 focus:border-blue-500"
      //         />
      //       </div>
      //     </div>

      //     {/* Supplier Balances Table */}
      //     <div className="bg-white rounded-lg shadow-sm">
      //       <div className="p-6 border-b">
      //         <h3 className="text-lg font-semibold text-gray-900">Supplier Account Balances</h3>
      //       </div>
      //       <div className="overflow-x-auto">
      //         <table className="w-full">
      //           <thead className="bg-gray-50">
      //             <tr>
      //               <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Supplier</th>
      //               <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Current Balance</th>
      //               <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Contact</th>
      //               <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Last Transaction</th>
      //               <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Actions</th>
      //             </tr>
      //           </thead>
      //           <tbody className="divide-y divide-gray-200">
      //             {suppliers
      //               .filter(supplier => supplier.name.toLowerCase().includes(searchTerm.toLowerCase()))
      //               .sort((a, b) => a.name.localeCompare(b.name))
      //               .map(supplier => (
      //               <tr key={supplier.id} className="hover:bg-gray-50">
      //                 {/* <td className="px-6 py-4">
      //                   <div className="flex items-center">
      //                     <div className={`w-10 h-10 rounded-full flex items-center justify-center mr-3 ${
      //                       supplier.type === 'commission' ? 'bg-purple-100' : 'bg-blue-100'
      //                     }`}>
      //                       <Building2 className={`w-5 h-5 ${
      //                         supplier.type === 'commission' ? 'text-purple-600' : 'text-blue-600'
      //                       }`} />
      //                     </div>
      //                     <div>
      //                       <div className="text-sm font-medium text-gray-900">{supplier.name}</div>
      //                       <div className="text-sm text-gray-500">
      //                         {supplier.type === 'commission' ? 'Commission' : 'Cash'} • ID: {supplier.id.slice(-8)}
      //                       </div>
      //                     </div>
      //                   </div>
      //                 </td> */}
      //                 <td className="px-6 py-4">
      //                   <div>
      //                     <div className="text-lg font-semibold text-gray-900">
      //                       LBP: {formatCurrency(Math.abs(supplier.lb_balance || 0))}
      //                       <br />
      //                       USD: {formatCurrency(Math.abs(supplier.usd_balance || 0))}
      //                     </div>
      //                     <div className="text-xs text-gray-500">
      //                       {(supplier.lb_balance || 0) > 0 || (supplier.usd_balance || 0) > 0 ? 'Credit balance' : 
      //                        (supplier.lb_balance || 0) < 0 || (supplier.usd_balance || 0) < 0 ? 'Amount owed' : 
      //                        'No outstanding balance'}
      //                     </div>
      //                   </div>
      //                 </td>
      //                 <td className="px-6 py-4">
      //                   <div className="text-sm text-gray-900">{supplier.phone || 'N/A'}</div>
      //                   <div className="text-sm text-gray-500">{supplier.email || 'No email'}</div>
      //                 </td>
      //                 <td className="px-6 py-4">
      //                   <div>
      //                     <span className="px-2 py-1 text-xs rounded-full bg-gray-100 text-gray-800">
      //                       {/* {supplier.type === 'commission' ? 'Commission' : 'Cash'} */}
      //                     </span>
      //                     <div className="text-xs text-gray-500 mt-1">
      //                     </div>
      //                   </div>
      //                 </td>
      //                 <td className="px-6 py-4 text-sm text-gray-500">
      //                   {supplier.createdAt ? new Date(supplier.createdAt).toLocaleDateString() : 'N/A'}
      //                 </td>
      //                 <td className="px-6 py-4">
      //                   <div className="flex space-x-2">
      //                                                <button 
      //                        onClick={() => {
      //                          setPayForm(prev => ({ ...prev, supplierId: supplier.id }));
      //                          setShowForm('pay');
      //                        }}
      //                        className="text-red-600 hover:text-red-800"
      //                        title="Make payment"
      //                      >
      //                       <CreditCard className="w-4 h-4" />
      //                     </button>
      //                     <button className="text-blue-600 hover:text-blue-800" title="View details">
      //                       <Eye className="w-4 h-4" />
      //                     </button>
      //                   </div>
      //                 </td>
      //               </tr>
      //             ))}
      //           </tbody>
      //         </table>
      //       </div>
      //     </div>

      //     {/* Summary Cards */}
      //     <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
      //       <div className="bg-white rounded-lg shadow-sm p-6">
      //         <div className="flex items-center justify-between">
      //           <div>
      //             <p className="text-sm text-gray-600">Total Supplier Credit Balance</p>
      //             <p className="text-2xl font-bold text-green-600">
      //               LBP: {formatCurrency(Math.max(0, suppliers.reduce((sum, s) => sum + Math.max(0, s.lb_balance || 0), 0)))}
      //               <br />
      //               USD: {formatCurrency(Math.max(0, suppliers.reduce((sum, s) => sum + Math.max(0, s.usd_balance || 0), 0)))}
      //             </p>
      //           </div>
      //           <AlertTriangle className="w-8 h-8 text-green-500" />
      //         </div>
      //       </div>



      //       <div className="bg-white rounded-lg shadow-sm p-6">
      //         <div className="flex items-center justify-between">
      //           <div>
      //             <p className="text-sm text-gray-600">Commission Suppliers</p>
      //             <p className="text-2xl font-bold text-gray-900">
      //               {/* {suppliers.filter(s => s.type === 'commission' ).length} */}
      //             </p>
      //           </div>
      //           <Target className="w-8 h-8 text-purple-500" />
      //         </div>
      //       </div>
      //     </div>
      //   </div>
      // )
      }

      {activeTab === 'expenses' && (
        <div className="space-y-6">
          <div className="flex justify-between items-center">
            <h2 className="text-xl font-semibold text-gray-900">Expense Management</h2>
            <button
              onClick={() => setShowForm('expense')}
              className="bg-amber-600 text-white px-4 py-2 rounded-lg hover:bg-amber-700 transition-colors flex items-center"
            >
              <Plus className="w-5 h-5 mr-2" />
              Add Expense
            </button>
          </div>

          {/* Expense Categories */}
          <div className="bg-white rounded-lg shadow-sm p-6">
            <h3 className="text-lg font-semibold text-gray-900 mb-4">Expense Categories</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                                  {expenseCategories.filter(c => c.is_active).map(category => {
                const todayCategoryExpenses = transactions.filter(t => 
                  t.type === 'expense' && t.category === category.name && t.createdAt.split('T')[0] === today
                );
                const todayAmount = todayCategoryExpenses.reduce((sum, t) => {
                  const convertedAmount = getConvertedAmount(t.amount, 'USD'); // amounts stored in USD
                  return sum + convertedAmount;
                }, 0);

                return (
                  <div key={category.id} className="border border-gray-200 rounded-lg p-4">
                    <h4 className="font-medium text-gray-900">{category.name}</h4>
                    <p className="text-sm text-gray-600 mb-2">{category.description}</p>
                    <p className="text-lg font-semibold text-gray-900">{formatCurrency(todayAmount)}</p>
                    <p className="text-sm text-gray-500">{todayCategoryExpenses.length} today</p>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Recent Expenses */}
          <div className="bg-white rounded-lg shadow-sm">
            <div className="p-6 border-b">
              <h3 className="text-lg font-semibold text-gray-900">Today's Expenses</h3>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Date</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Category</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Description</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Amount</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-200">
                  {transactions
                    .filter(t => t.type === 'expense')
                    .filter(t => t.createdAt.split('T')[0] === today)
                    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
                    .map(transaction => (
                    <tr key={transaction.id} className="hover:bg-gray-50">
                      <td className="px-6 py-4 text-gray-900">
                        {new Date(transaction.createdAt).toLocaleTimeString()}
                      </td>
                      <td className="px-6 py-4 text-gray-900">{transaction.category}</td>
                      <td className="px-6 py-4 text-gray-900">{transaction.description}</td>
                      <td className="px-6 py-4 text-gray-900">
                        {/* Convert back to original currency for display 
                            Amounts are stored in USD, so convert LBP back for display */}
                                                {formatCurrencyWithSymbol(
                          transaction.amount,
                          transaction.currency || 'USD'
                        )}
                        {transaction.currency !== currency && (
                          <div className="text-xs text-gray-500">
                            ≈ {formatCurrency(getConvertedAmount(transaction.amount, 'USD'))}
                          </div>
                        )}
                      </td>
                      <td className="px-6 py-4 text-gray-500">{transaction.reference || '-'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {activeTab === 'nonpriced' && (
        <div className="space-y-6">
          <div className="flex justify-between items-center">
            <div className="flex items-center">
              <h2 className="text-xl font-semibold text-gray-900">Non Priced Items</h2>
              {filteredNonPricedItems.length > 0 && (
                <span className="ml-3 bg-red-500 text-white text-sm rounded-full px-3 py-1">
                  {filteredNonPricedItems.length}
                </span>
              )}
            </div>
            <div className="flex space-x-2">
              <button
                onClick={exportNonPricedItems}
                className="bg-green-600 text-white px-4 py-2 rounded-lg hover:bg-green-700 transition-colors flex items-center"
              >
                <FileText className="w-4 h-4 mr-2" />
                Export CSV
              </button>
              {Object.keys(stagedNonPricedChanges).length > 0 && (
                <button
                  onClick={() => {
                    setStagedNonPricedChanges({});
                    showToast('All staged changes cleared', 'success');
                  }}
                  className="bg-orange-600 text-white px-4 py-2 rounded-lg hover:bg-orange-700 transition-colors flex items-center"
                >
                  <X className="w-4 h-4 mr-2" />
                  Clear All Changes
                </button>
              )}
              {selectedNonPriced.length > 0 && (
                <button
                  onClick={() => setShowBulkActions(!showBulkActions)}
                  className="bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 transition-colors flex items-center"
                >
                  Bulk Actions ({selectedNonPriced.length})
                </button>
              )}
            </div>
          </div>

          {/* Bulk Actions */}
          {showBulkActions && selectedNonPriced.length > 0 && (
            <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium text-blue-900">
                  {selectedNonPriced.length} items selected
                </span>
                <div className="flex space-x-2">
                  <button
                    onClick={handleBulkMarkPriced}
                    className="bg-green-600 text-white px-3 py-1 rounded text-sm hover:bg-green-700"
                  >
                    Mark as Priced
                  </button>
                  <button
                    onClick={handleBulkDelete}
                    className="bg-red-600 text-white px-3 py-1 rounded text-sm hover:bg-red-700"
                  >
                    Delete
                  </button>
                  <button
                    onClick={() => setSelectedNonPriced([])}
                    className="bg-gray-600 text-white px-3 py-1 rounded text-sm hover:bg-gray-700"
                  >
                    Clear Selection
                  </button>
                  <button
                    onClick={() => {
                      setStagedNonPricedChanges(prev => {
                        const newChanges = { ...prev };
                        selectedNonPriced.forEach(id => {
                          delete newChanges[id];
                        });
                        return newChanges;
                      });
                      showToast('Staged changes cleared', 'success');
                    }}
                    className="bg-orange-600 text-white px-3 py-1 rounded text-sm hover:bg-orange-700"
                  >
                    Clear Changes
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* Search */}
          <div className="bg-white rounded-lg shadow-sm p-4">
            <div className="relative">
              <Search className="w-5 h-5 absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400" />
              <input
                type="text"
                value={nonPricedSearch}
                onChange={e => setNonPricedSearch(e.target.value)}
                placeholder="Search by customer, product, supplier, or status..."
                className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-blue-500 focus:border-blue-500"
              />
            </div>
          </div>

          {/* Sort Controls */}
          <div className="flex flex-wrap gap-2 mb-4">
            <button 
              onClick={() => { setNonPricedSort('date'); setNonPricedSortDir(nonPricedSort === 'date' && nonPricedSortDir === 'asc' ? 'desc' : 'asc'); }}
              className={`px-3 py-1 border rounded-lg ${nonPricedSort === 'date' ? 'bg-blue-100 border-blue-500' : 'border-gray-300'}`}
            >
              Date {nonPricedSort === 'date' ? (nonPricedSortDir === 'asc' ? '↑' : '↓') : ''}
            </button>
            <button 
              onClick={() => { setNonPricedSort('customer'); setNonPricedSortDir(nonPricedSort === 'customer' && nonPricedSortDir === 'asc' ? 'desc' : 'asc'); }}
              className={`px-3 py-1 border rounded-lg ${nonPricedSort === 'customer' ? 'bg-blue-100 border-blue-500' : 'border-gray-300'}`}
            >
              Customer {nonPricedSort === 'customer' ? (nonPricedSortDir === 'asc' ? '↑' : '↓') : ''}
            </button>
            <button 
              onClick={() => { setNonPricedSort('product'); setNonPricedSortDir(nonPricedSort === 'product' && nonPricedSortDir === 'asc' ? 'desc' : 'asc'); }}
              className={`px-3 py-1 border rounded-lg ${nonPricedSort === 'product' ? 'bg-blue-100 border-blue-500' : 'border-gray-300'}`}
            >
              Product {nonPricedSort === 'product' ? (nonPricedSortDir === 'asc' ? '↑' : '↓') : ''}
            </button>
            <button 
              onClick={() => { setNonPricedSort('value'); setNonPricedSortDir(nonPricedSort === 'value' && nonPricedSortDir === 'asc' ? 'desc' : 'asc'); }}
              className={`px-3 py-1 border rounded-lg ${nonPricedSort === 'value' ? 'bg-blue-100 border-blue-500' : 'border-gray-300'}`}
            >
              Value {nonPricedSort === 'value' ? (nonPricedSortDir === 'asc' ? '↑' : '↓') : ''}
            </button>
          </div>

          {/* Enhanced Table */}
          <div className="bg-white rounded-lg shadow-sm">
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-4 py-3 text-left">
                      <input
                        type="checkbox"
                        checked={selectedNonPriced.length === pagedNonPricedItems.length && pagedNonPricedItems.length > 0}
                        onChange={e => {
                          if (e.target.checked) {
                            setSelectedNonPriced(pagedNonPricedItems.map(item => item.id));
                          } else {
                            setSelectedNonPriced([]);
                          }
                        }}
                        className="rounded border-gray-300"
                      />
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Status</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Customer</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Product</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Supplier</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Qty</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Weight (kg)</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Unit Price</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Total Value</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Date Added</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-200">
                  {pagedNonPricedItems.length === 0 ? (
                    <tr>
                      <td colSpan={11} className="text-center text-gray-500 py-8">
                        <div className="flex flex-col items-center">
                          <AlertCircle className="w-8 h-8 text-gray-400 mb-2" />
                          <span className="font-semibold">No non-priced items found</span>
                          <span className="text-sm text-gray-400">Items will appear here when they need pricing.</span>
                        </div>
                      </td>
                    </tr>
                  ) : pagedNonPricedItems.map(item => {
                    const hasStagedChanges = stagedNonPricedChanges[item.id] && Object.keys(stagedNonPricedChanges[item.id]).length > 0;
                    return (
                    <tr key={item.id} className={`hover:bg-gray-50 ${hasStagedChanges ? 'bg-blue-50' : ''}`}>
                      <td className="px-4 py-3">
                        <input
                          type="checkbox"
                          checked={selectedNonPriced.includes(item.id)}
                          onChange={e => {
                            if (e.target.checked) {
                              setSelectedNonPriced(prev => [...prev, item.id]);
                            } else {
                              setSelectedNonPriced(prev => prev.filter(id => id !== item.id));
                            }
                          }}
                          className="rounded border-gray-300"
                        />
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center space-x-2">
                          <span className={`px-2 py-1 text-xs rounded-full ${
                            item.status === 'ready' 
                              ? 'bg-green-100 text-green-800' 
                              : 'bg-yellow-100 text-yellow-800'
                          }`}>
                            {item.status === 'ready' ? 'Ready' : 'Incomplete'}
                          </span>
                          {hasStagedChanges && (
                            <span className="px-2 py-1 text-xs rounded-full bg-blue-100 text-blue-800">
                              Modified
                            </span>
                          )}
                        </div>
                      </td>
                      <td className="px-4 py-3 text-gray-900">{item.customerName}</td>
                      <td className="px-4 py-3 text-gray-900 font-medium">{item.productName}</td>
                      <td className="px-4 py-3 text-gray-900">{item.supplierName}</td>
                      <td className="px-4 py-3">
                        <input 
                          type="number" 
                          className="w-16 border rounded px-2 py-1 text-sm" 
                          value={getCurrentValue(item, 'quantity') || ''} 
                          min={1} 
                          onChange={e => {
                            const newQuantity = parseInt(e.target.value) || 0;
                            stageChange(item.id, 'quantity', newQuantity);
                          }}
                          placeholder="0"
                        />
                      </td>
                      <td className="px-4 py-3">
                        <input 
                          type="number" 
                          className="w-20 border rounded px-2 py-1 text-sm" 
                          value={getCurrentValue(item, 'weight') || ''} 
                          min={0} 
                          step={0.01} 
                          onChange={e => {
                            const newWeight = parseFloat(e.target.value) || 0;
                            stageChange(item.id, 'weight', newWeight);
                          }}
                          placeholder="0.00"
                        />
                      </td>
                      <td className="px-4 py-3">
                        <MoneyInput
                          value={getCurrentValue(item, 'unit_price') || ''}
                          onChange={(value) => {
                            const newPrice = parseFloat(value) || 0;
                            stageChange(item.id, 'unit_price', newPrice);
                          }}
                          placeholder="0.00"
                          step="0.01"
                          min="0"
                          className="w-32 text-sm"
                        />
                      </td>
                      <td className="px-4 py-3 font-semibold text-gray-900">
                        ${item.totalValue.toFixed(2)}
                      </td>
                      <td className="px-4 py-3 text-gray-500 text-sm">
                        {item.created_at ? new Date(item.created_at).toLocaleDateString() : '-'}
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex space-x-2">
                          <button 
                            onClick={() => setShowEditNonPriced(item)}
                            className="text-blue-600 hover:text-blue-800"
                            title="Edit details"
                          >
                            <Edit className="w-4 h-4" />
                          </button>
                          <button 
                            onClick={() => handleMarkPriced(item)}
                            disabled={item.status !== 'ready'}
                            className={`${
                              item.status === 'ready' 
                                ? 'text-green-600 hover:text-green-800' 
                                : 'text-gray-400 cursor-not-allowed'
                            }`}
                            title="Mark as priced"
                          >
                            <CheckCircle className="w-4 h-4" />
                          </button>
                          <button 
                            onClick={() => handleDeleteNonPriced(item)}
                            className="text-red-600 hover:text-red-800"
                            title="Delete item"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                  })}
                </tbody>
              </table>
            </div>

            {/* Pagination */}
            <div className="px-6 py-4 border-t border-gray-200 flex items-center justify-between">
              <div className="text-sm text-gray-700">
                Showing {((nonPricedPage - 1) * NON_PRICED_PAGE_SIZE) + 1} to {Math.min(nonPricedPage * NON_PRICED_PAGE_SIZE, filteredNonPricedItems.length)} of {filteredNonPricedItems.length} items
              </div>
              <div className="flex space-x-2">
                <button
                  onClick={() => setNonPricedPage(Math.max(1, nonPricedPage - 1))}
                  disabled={nonPricedPage === 1}
                  className="px-3 py-1 border border-gray-300 rounded text-sm disabled:opacity-50 disabled:cursor-not-allowed hover:bg-gray-50"
                >
                  Previous
                </button>
                <span className="px-3 py-1 text-sm text-gray-700">
                  Page {nonPricedPage} of {nonPricedTotalPages || 1}
                </span>
                <button
                  onClick={() => setNonPricedPage(Math.min(nonPricedTotalPages, nonPricedPage + 1))}
                  disabled={nonPricedPage === nonPricedTotalPages || nonPricedTotalPages === 0}
                  className="px-3 py-1 border border-gray-300 rounded text-sm disabled:opacity-50 disabled:cursor-not-allowed hover:bg-gray-50"
                >
                  Next
                </button>
              </div>
            </div>
          </div>
        </div>
      )}



      {activeTab === 'inventory-logs' && (

      <InventoryLogs
        inventoryLogs={getInventoryTransactionLogs}
        products={products}
        suppliers={suppliers}
        customers={customers}
        sales={sales}
        formatCurrency={formatCurrency}
        formatCurrencyWithSymbol={formatCurrencyWithSymbol}
        showToast={showToast}
        onEditSale={handleEditSale}
        onDeleteSale={handleDeleteSale}
        userProfile={userProfile}
        storeId={userProfile?.store_id}
      />
      )}

      {activeTab === 'received-bills' && (
        <ReceivedBills
          inventory={inventory}
          products={products}
          suppliers={suppliers}
          sales={sales}
          customers={customers}
          formatCurrency={formatCurrency}
          showToast={showToast}
          onEditSale={handleEditSale}
          onDeleteSale={handleDeleteSale}
          onCloseBill={handleCloseReceivedBill}
        />
      )}

      {/* Enhanced Edit Modal for Non-Priced Items */}
      {showEditNonPriced && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-lg max-w-2xl w-full max-h-[90vh] overflow-y-auto">
            <div className="p-6 border-b">
              <h2 className="text-xl font-semibold text-gray-900">Edit Non-Priced Item</h2>
            </div>
            <div className="p-6">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">Customer</label>
                                     <select
                     value={showEditNonPriced.customerId}
                     onChange={e => setShowEditNonPriced((prev: any) => ({ ...prev, customerId: e.target.value }))}
                     className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:ring-blue-500 focus:border-blue-500"
                   >
                     {customers.map(customer => (
                       <option key={customer.id} value={customer.id}>{customer.name}</option>
                     ))}
                   </select>
                 </div>
                 <div>
                   <label className="block text-sm font-medium text-gray-700 mb-2">Product Name</label>
                   <input
                     type="text"
                     value={showEditNonPriced.productName}
                     onChange={e => setShowEditNonPriced((prev: any) => ({ ...prev, productName: e.target.value }))}
                     className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:ring-blue-500 focus:border-blue-500"
                   />
                 </div>
                 <div>
                   <label className="block text-sm font-medium text-gray-700 mb-2">Supplier</label>
                   <select
                     value={showEditNonPriced.supplierId || ''}
                     onChange={e => setShowEditNonPriced((prev: any) => ({ ...prev, supplierId: e.target.value }))}
                     className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:ring-blue-500 focus:border-blue-500"
                   >
                     <option value="">Select supplier...</option>
                     {suppliers.map(supplier => (
                       <option key={supplier.id} value={supplier.id}>{supplier.name}</option>
                     ))}
                   </select>
                 </div>
                 <div>
                   <label className="block text-sm font-medium text-gray-700 mb-2">Quantity</label>
                   <input
                     type="number"
                     min="1"
                     value={showEditNonPriced.quantity || ''}
                     onChange={e => setShowEditNonPriced((prev: any) => ({ ...prev, quantity: parseInt(e.target.value) || 0 }))}
                     className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:ring-blue-500 focus:border-blue-500"
                   />
                 </div>
                 <div>
                   <label className="block text-sm font-medium text-gray-700 mb-2">Weight (kg)</label>
                   <input
                     type="number"
                     min="0"
                     step="0.01"
                     value={showEditNonPriced.weight || ''}
                     onChange={e => setShowEditNonPriced((prev: any) => ({ ...prev, weight: parseFloat(e.target.value) || 0 }))}
                     className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:ring-blue-500 focus:border-blue-500"
                   />
                 </div>
                 <div>
                   <label className="block text-sm font-medium text-gray-700 mb-2">Unit Price ($)</label>
                   <input
                     type="number"
                     min="0"
                     step="0.01"
                     value={showEditNonPriced.unitPrice || ''}
                     onChange={e => setShowEditNonPriced((prev: any) => ({ ...prev, unitPrice: parseFloat(e.target.value) || 0 }))}
                     className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:ring-blue-500 focus:border-blue-500"
                   />
                 </div>
               </div>
               <div className="mt-4">
                 <label className="block text-sm font-medium text-gray-700 mb-2">Notes</label>
                 <textarea
                   value={showEditNonPriced.status || ''}
                   onChange={e => setShowEditNonPriced((prev: any) => ({ ...prev, status: e.target.value }))}
                  rows={3}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:ring-blue-500 focus:border-blue-500"
                  placeholder="Add any status or comments..."
                />
              </div>
              {showEditNonPriced.unitPrice > 0 && (showEditNonPriced.quantity > 0 || showEditNonPriced.weight > 0) && (
                <div className="mt-4 p-4 bg-green-50 border border-green-200 rounded-lg">
                  <p className="text-sm font-medium text-green-800">Total Value</p>
                  <p className="text-2xl font-bold text-green-900">
                    ${(showEditNonPriced.unitPrice * (showEditNonPriced.weight || showEditNonPriced.quantity)).toFixed(2)}
                  </p>
                </div>
              )}
            </div>
            <div className="p-6 border-t flex justify-end space-x-3">
              <button
                onClick={() => setShowEditNonPriced(null)}
                className="px-4 py-2 text-gray-700 border border-gray-300 rounded-lg hover:bg-gray-50"
              >
                Cancel
              </button>
              <button
                onClick={() => handleSaveNonPriced(showEditNonPriced)}
                className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
              >
                Save Changes
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Forms Modal */}
      {showForm && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-lg max-w-2xl w-full max-h-[90vh] overflow-y-auto">
            <div className="p-6 border-b">
              <h2 className="text-xl font-semibold text-gray-900">
                {showForm === 'receive' && 'Add Payment Received'}
                {showForm === 'pay' && 'Add Payment Sent'}
                {showForm === 'expense' && 'Add Expense'}
              </h2>
            </div>

            {showForm === 'receive' && (
              <form onSubmit={handleReceiveSubmit} className="p-6 space-y-6">
                <div className="bg-green-50 border border-green-200 rounded-lg p-4 mb-6">
                  <div className="flex items-center">
                    <CheckCircle className="w-5 h-5 text-green-600 mr-2" />
                    <span className="text-green-800 font-medium">Record a payment received from a customer or supplier</span>
                  </div>
                </div>

                <div className="grid-cols-1 md:grid-cols-2 gap-6">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">Entity Type *</label>
                    <div className="space-y-2 p-2">
                      <label className="flex items-center space-x-1 cursor-pointer">
                        <input
                          type="radio"
                          name="receiveEntityType"
                          value="customer"
                          checked={receiveForm.entityType === 'customer'}
                          onChange={(e) => {
                            setReceiveForm(prev => ({ 
                              ...prev, 
                              entityType: e.target.value as 'customer' | 'supplier',
                              entityId: '' // Reset entity selection when type changes
                            }));
                          }}
                          className="w-4 h-4 text-green-600 border-gray-300 focus:ring-green-500"
                        />
                        <span className="text-sm text-gray-700">Customer</span>
                      </label>
                      <label className="flex items-center space-x-2 cursor-pointer">
                        <input
                          type="radio"
                          name="receiveEntityType"
                          value="supplier"
                          checked={receiveForm.entityType === 'supplier'}
                          onChange={(e) => {
                            setReceiveForm(prev => ({ 
                              ...prev, 
                              entityType: e.target.value as 'customer' | 'supplier',
                              entityId: '' // Reset entity selection when type changes
                            }));
                          }}
                          className="w-4 h-4 text-green-600 border-gray-300 focus:ring-green-500"
                        />
                        <span className="text-sm text-gray-700">Supplier</span>
                      </label>
                    </div>
                  </div>

                  <div>
                    <SearchableSelect
                      options={
                        receiveForm.entityType === 'customer' 
                          ? customers.filter(c => c.is_active).map(customer => ({
                              id: customer.id,
                              label: customer.name,
                              value: customer.id,
                              category: 'Customer'
                            }))
                          : suppliers.map(supplier => ({
                              id: supplier.id,
                              label: supplier.name,
                              value: supplier.id,
                              category: 'Supplier'
                            }))
                      }
                      value={receiveForm.entityId}
                      onChange={(value) => setReceiveForm(prev => ({ ...prev, entityId: value as string }))}
                      placeholder={`Select ${receiveForm.entityType === 'customer' ? 'Customer' : 'Supplier'} *`}
                      searchPlaceholder={`Search ${receiveForm.entityType === 'customer' ? 'customers' : 'suppliers'}...`}
                      recentSelections={receiveForm.entityType === 'customer' ? recentCustomers : recentSuppliers}
                      onRecentUpdate={receiveForm.entityType === 'customer' ? setRecentCustomers : setRecentSuppliers}
                      showAddOption={true}
                      addOptionText={`Add New ${receiveForm.entityType === 'customer' ? 'Customer' : 'Supplier'}`}
                      onAddNew={() => receiveForm.entityType === 'customer' ? setShowAddCustomerForm(true) : setShowAddSupplierForm(true)}
                      className="w-full"
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">Amount *</label>
                    <input
                      type="number"
                      step="0.01"
                      max="99999999.99"
                      value={receiveForm.amount}
                      onChange={(e) => {
                        const value = e.target.value;
                        const numValue = parseFloat(value);
                        if (numValue > 99999999.99) {
                          showToast('Amount exceeds maximum allowed value (99,999,999.99)', 'error');
                          return;
                        }
                        setReceiveForm(prev => ({ ...prev, amount: value }));
                      }}
                      className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:ring-green-500 focus:border-green-500"
                      required
                      placeholder="0.00"
                    />
                    <p className="text-xs text-gray-500 mt-1">Maximum: 99,999,999.99</p>
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">Currency *</label>
                    <select
                      value={receiveForm.currency}
                      onChange={(e) => setReceiveForm(prev => ({ ...prev, currency: e.target.value as 'USD' | 'LBP' }))}
                      className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:ring-green-500 focus:border-green-500"
                    >
                      <option value="USD">USD ($)</option>
                      <option value="LBP">LBP (ل.ل)</option>
                    </select>
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">Description (optional)</label>
                  <input
                    type="text"
                    value={receiveForm.description}
                    onChange={(e) => setReceiveForm(prev => ({ ...prev, description: e.target.value }))}
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:ring-green-500 focus:border-green-500"
                    placeholder="e.g., Payment for invoice #123, Cash payment, etc."
                  />
                </div>



                {receiveForm.currency !== currency && receiveForm.amount && (
                  <div className="text-sm text-gray-600 bg-blue-50 p-4 rounded-lg border border-blue-200">
                    <div className="flex items-center justify-between">
                      <span className="font-medium">Conversion:</span>
                      <span className="font-semibold">
                        {formatCurrencyWithSymbol(parseFloat(receiveForm.amount), receiveForm.currency)} 
                        = {formatCurrency(getConvertedAmount(parseFloat(receiveForm.amount), receiveForm.currency))}
                      </span>
                    </div>
                    <div className="text-xs text-gray-500 mt-1">Rate: 1 USD = 89,500 LBP</div>
                  </div>
                )}

                <div className="flex justify-end space-x-3 pt-6 border-t border-gray-200">
                  <button
                    type="button"
                    onClick={() => setShowForm(null)}
                    className="px-6 py-2 text-gray-700 border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    className="px-6 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors font-medium"
                  >
                    Record Payment
                  </button>
                </div>
              </form>
            )}

            {showForm === 'pay' && (
              <form onSubmit={handlePaySubmit} className="p-6 space-y-6">
                <div className="bg-red-50 border border-red-200 rounded-lg p-4 mb-6">
                  <div className="flex items-center">
                    <TrendingDown className="w-5 h-5 text-red-600 mr-2" />
                    <span className="text-red-800 font-medium">Record a payment sent to a customer or supplier</span>
                  </div>
                </div>

                <div className="grid-cols-1 md:grid-cols-2 gap-6">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">Entity Type *</label>
                    <div className="space-y-2 p-2">
                      <label className="flex items-center space-x-1 cursor-pointer">
                        <input
                          type="radio"
                          name="payEntityType"
                          value="customer"
                          checked={payForm.entityType === 'customer'}
                          onChange={(e) => {
                            setPayForm(prev => ({ 
                              ...prev, 
                              entityType: e.target.value as 'customer' | 'supplier',
                              entityId: '' // Reset entity selection when type changes
                            }));
                          }}
                          className="w-4 h-4 text-red-600 border-gray-300 focus:ring-red-500"
                        />
                        <span className="text-sm text-gray-700">Customer</span>
                      </label>
                      <label className="flex items-center space-x-2 cursor-pointer">
                        <input
                          type="radio"
                          name="payEntityType"
                          value="supplier"
                          checked={payForm.entityType === 'supplier'}
                          onChange={(e) => {
                            setPayForm(prev => ({ 
                              ...prev, 
                              entityType: e.target.value as 'customer' | 'supplier',
                              entityId: '' // Reset entity selection when type changes
                            }));
                          }}
                          className="w-4 h-4 text-red-600 border-gray-300 focus:ring-red-500"
                        />
                        <span className="text-sm text-gray-700">Supplier</span>
                      </label>
                    </div>
                  </div>

                  <div>
                    <SearchableSelect
                      options={
                        payForm.entityType === 'customer' 
                          ? customers.filter(c => c.is_active).map(customer => ({
                              id: customer.id,
                              label: customer.name,
                              value: customer.id,
                              category: 'Customer'
                            }))
                          : suppliers.map(supplier => ({
                              id: supplier.id,
                              label: supplier.name,
                              value: supplier.id,
                              category: 'Supplier'
                            }))
                      }
                      value={payForm.entityId}
                      onChange={(value) => setPayForm(prev => ({ ...prev, entityId: value as string }))}
                      placeholder={`Select ${payForm.entityType === 'customer' ? 'Customer' : 'Supplier'} *`}
                      searchPlaceholder={`Search ${payForm.entityType === 'customer' ? 'customers' : 'suppliers'}...`}
                      recentSelections={payForm.entityType === 'customer' ? recentCustomers : recentSuppliers}
                      onRecentUpdate={payForm.entityType === 'customer' ? setRecentCustomers : setRecentSuppliers}
                      showAddOption={true}
                      addOptionText={`Add New ${payForm.entityType === 'customer' ? 'Customer' : 'Supplier'}`}
                      onAddNew={() => payForm.entityType === 'customer' ? setShowAddCustomerForm(true) : setShowAddSupplierForm(true)}
                      className="w-full"
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">Amount *</label>
                    <input
                      type="number"
                      step="0.01"
                      max="99999999.99"
                      value={payForm.amount}
                      onChange={(e) => {
                        const value = e.target.value;
                        const numValue = parseFloat(value);
                        if (numValue > 99999999.99) {
                          showToast('Amount exceeds maximum allowed value (99,999,999.99)', 'error');
                          return;
                        }
                        setPayForm(prev => ({ ...prev, amount: value }));
                      }}
                      className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:ring-red-500 focus:border-red-500"
                      required
                      placeholder="0.00"
                    />
                    <p className="text-xs text-gray-500 mt-1">Maximum: 99,999,999.99</p>
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">Currency *</label>
                    <select
                      value={payForm.currency}
                      onChange={(e) => setPayForm(prev => ({ ...prev, currency: e.target.value as 'USD' | 'LBP' }))}
                      className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:ring-red-500 focus:border-red-500"
                    >
                      <option value="USD">USD ($)</option>
                      <option value="LBP">LBP (ل.ل)</option>
                    </select>
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">Description (optional)</label>
                  <input
                    type="text"
                    value={payForm.description}
                    onChange={(e) => setPayForm(prev => ({ ...prev, description: e.target.value }))}
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:ring-red-500 focus:border-red-500"
                    placeholder="e.g., Payment for goods, Commission payment, etc."
                  />
                </div>


                {payForm.currency !== currency && payForm.amount && (
                  <div className="text-sm text-gray-600 bg-blue-50 p-4 rounded-lg border border-blue-200">
                    <div className="flex items-center justify-between">
                      <span className="font-medium">Conversion:</span>
                      <span className="font-semibold">
                        {formatCurrencyWithSymbol(parseFloat(payForm.amount), payForm.currency)} 
                        = {formatCurrency(getConvertedAmount(parseFloat(payForm.amount), payForm.currency))}
                      </span>
                    </div>
                    <div className="text-xs text-gray-500 mt-1">Rate: 1 USD = 89,500 LBP</div>
                  </div>
                )}

                <div className="flex justify-end space-x-3 pt-6 border-t border-gray-200">
                  <button
                    type="button"
                    onClick={() => setShowForm(null)}
                    className="px-6 py-2 text-gray-700 border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    className="px-6 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors font-medium"
                  >
                    Record Payment
                  </button>
                </div>
              </form>
            )}

            {showForm === 'expense' && (
              <form onSubmit={handleExpenseSubmit} className="p-6 space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <SearchableSelect
                      options={expenseCategories.filter(c => c.is_active).map(category => ({
                        id: category.id,
                        label: category.name,
                        value: category.id,
                        category: 'Expense Category'
                      }))}
                      value={expenseForm.categoryId}
                      onChange={(value) => setExpenseForm(prev => ({ ...prev, categoryId: value as string }))}
                      placeholder="Select Category *"
                      searchPlaceholder="Search categories..."
                      recentSelections={recentCategories}
                      onRecentUpdate={setRecentCategories}
                      showAddOption={true}
                      addOptionText="Add New Category"
                      onAddNew={() => setShowAddCategoryForm(true)}
                      className="w-full"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">Currency *</label>
                    <select
                      value={expenseForm.currency}
                      onChange={(e) => setExpenseForm(prev => ({ ...prev, currency: e.target.value as 'USD' | 'LBP' }))}
                      className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:ring-blue-500 focus:border-blue-500"
                    >
                      <option value="USD">USD ($)</option>
                      <option value="LBP">LBP (ل.ل)</option>
                    </select>
                  </div>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">Amount *</label>
                  <input
                    type="number"
                    step="0.01"
                    max="99999999.99"
                    value={expenseForm.amount}
                    onChange={(e) => {
                      const value = e.target.value;
                      const numValue = parseFloat(value);
                      if (numValue > 99999999.99) {
                        showToast('Amount exceeds maximum allowed value (99,999,999.99)', 'error');
                        return;
                      }
                      setExpenseForm(prev => ({ ...prev, amount: value }));
                    }}
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:ring-blue-500 focus:border-blue-500"
                    required
                    placeholder={`Enter amount in ${expenseForm.currency}`}
                  />
                  <p className="text-xs text-gray-500 mt-1">Maximum: 99,999,999.99</p>
                </div>
                {expenseForm.currency !== currency && expenseForm.amount && (
                  <div className="text-sm text-gray-600 bg-blue-50 p-3 rounded-lg">
                    <strong>Conversion:</strong> {formatCurrencyWithSymbol(parseFloat(expenseForm.amount), expenseForm.currency)} 
                    = {formatCurrency(getConvertedAmount(parseFloat(expenseForm.amount), expenseForm.currency))}
                    <div className="text-xs text-gray-500 mt-1">Rate: 1 USD = 89,500 LBP</div>
                  </div>
                )}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">Description *</label>
                  <input
                    type="text"
                    value={expenseForm.description}
                    onChange={(e) => setExpenseForm(prev => ({ ...prev, description: e.target.value }))}
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:ring-blue-500 focus:border-blue-500"
                    required
                  />
                </div>

                <div className="flex justify-end space-x-3 pt-4">
                  <button
                    type="button"
                    onClick={() => setShowForm(null)}
                    className="px-4 py-2 text-gray-700 border border-gray-300 rounded-lg hover:bg-gray-50"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    className="px-4 py-2 bg-amber-600 text-white rounded-lg hover:bg-amber-700"
                  >
                    Add Expense
                  </button>
                </div>
              </form>
            )}
          </div>
        </div>
      )}

      {/* Received Bill Details Modal */}
      {showReceivedBillDetails && selectedReceivedBill && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-lg max-w-4xl w-full max-h-[90vh] overflow-y-auto">
            <div className="p-6 border-b">
              <div className="flex items-center justify-between">
                <h2 className="text-xl font-semibold text-gray-900">Received Bill Details</h2>
                <button
                  onClick={() => setShowReceivedBillDetails(false)}
                  className="text-gray-400 hover:text-gray-600"
                >
                  <X className="w-6 h-6" />
                </button>
              </div>
            </div>
            <div className="p-6">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div>
                  <h3 className="text-lg font-medium text-gray-900 mb-4">Basic Information</h3>
                  <div className="space-y-3">
                    <div>
                      <label className="block text-sm font-medium text-gray-700">Product</label>
                      <p className="text-sm text-gray-900">{selectedReceivedBill.productName}</p>
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700">Supplier</label>
                      <p className="text-sm text-gray-900">{selectedReceivedBill.supplierName}</p>
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700">Type</label>
                      <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
                        selectedReceivedBill.type === 'commission' ? 'bg-purple-100 text-purple-800' : 'bg-green-100 text-green-800'
                      }`}>
                        {selectedReceivedBill.type}
                      </span>
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700">Received Date</label>
                      <p className="text-sm text-gray-900">
                        {new Date(selectedReceivedBill.receivedAt).toLocaleDateString()}
                      </p>
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700">Received By</label>
                      <p className="text-sm text-gray-900">{selectedReceivedBill.receivedBy}</p>
                    </div>
                  </div>
                </div>

                <div>
                  <h3 className="text-lg font-medium text-gray-900 mb-4">Quantity & Progress</h3>
                  <div className="space-y-3">
                    <div>
                      <label className="block text-sm font-medium text-gray-700">Original Quantity</label>
                      <p className="text-sm text-gray-900">{selectedReceivedBill.originalQuantity} {selectedReceivedBill.unit}</p>
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700">Remaining Quantity</label>
                      <p className="text-sm text-gray-900">{selectedReceivedBill.remainingQuantity} {selectedReceivedBill.unit}</p>
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700">Sold Quantity</label>
                      <p className="text-sm text-gray-900">{selectedReceivedBill.totalSoldQuantity} {selectedReceivedBill.unit}</p>
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700">Progress</label>
                      <div className="flex items-center mt-1">
                        <div className="w-full bg-gray-200 rounded-full h-2 mr-2">
                          <div
                            className="bg-blue-600 h-2 rounded-full"
                            style={{ width: `${selectedReceivedBill.progress}%` }}
                          ></div>
                        </div>
                        <span className="text-sm text-gray-900">{selectedReceivedBill.progress.toFixed(1)}%</span>
                      </div>
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700">Status</label>
                      <div className="mt-1">{getStatusBadge(selectedReceivedBill.status)}</div>
                    </div>
                  </div>
                </div>
              </div>

              <div className="mt-6">
                <h3 className="text-lg font-medium text-gray-900 mb-4">Financial Information</h3>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <div className="bg-green-50 p-4 rounded-lg">
                    <label className="block text-sm font-medium text-green-700">Total Revenue</label>
                    <p className="text-2xl font-bold text-green-900">{formatCurrency(selectedReceivedBill.totalRevenue)}</p>
                  </div>
                  <div className="bg-red-50 p-4 rounded-lg">
                    <label className="block text-sm font-medium text-red-700">Total Cost</label>
                    <p className="text-2xl font-bold text-red-900">{formatCurrency(selectedReceivedBill.totalCost)}</p>
                  </div>
                  <div className="bg-blue-50 p-4 rounded-lg">
                    <label className="block text-sm font-medium text-blue-700">Total Profit</label>
                    <p className="text-2xl font-bold text-blue-900">{formatCurrency(selectedReceivedBill.totalProfit)}</p>
                  </div>
                </div>
              </div>

              {selectedReceivedBill.type === 'commission' && (
                <div className="mt-6">
                  <h3 className="text-lg font-medium text-gray-900 mb-4">Commission Details</h3>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-medium text-gray-700">Porterage</label>
                      <p className="text-sm text-gray-900">{formatCurrency(selectedReceivedBill.porterage || 0)}</p>
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700">Transfer Fee</label>
                      <p className="text-sm text-gray-900">{formatCurrency(selectedReceivedBill.transferFee || 0)}</p>
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700">Commission Rate</label>
                      <p className="text-sm text-gray-900">{selectedReceivedBill.commissionRate ? `${selectedReceivedBill.commissionRate}%` : 'N/A'}</p>
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700">Average Unit Price</label>
                      <p className="text-sm text-gray-900">{formatCurrency(selectedReceivedBill.avgUnitPrice)}</p>
                    </div>
                  </div>
                </div>
              )}

              {selectedReceivedBill.status && (
                <div className="mt-6">
                  <h3 className="text-lg font-medium text-gray-900 mb-4">Notes</h3>
                  <p className="text-sm text-gray-900 bg-gray-50 p-3 rounded-lg">{selectedReceivedBill.status}</p>
                </div>
              )}
            </div>
            {/* <div className="px-6 py-4 border-t border-gray-200 flex justify-end space-x-3">
              <button
                onClick={() => handleViewReceivedBillSalesLogs(selectedReceivedBill)}
                className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors"
              >
                View Sales Logs
              </button>
              <button
                onClick={() => setShowReceivedBillDetails(false)}
                className="px-4 py-2 bg-gray-600 text-white rounded-lg hover:bg-gray-700 transition-colors"
              >
                Close
              </button>
            </div> */}
          </div>
        </div>
      )}



      {/* Edit Sale Modal */}
      {showEditSaleModal && editingSale && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-lg max-w-4xl w-full max-h-[90vh] overflow-y-auto">
            <div className="p-6 border-b bg-gradient-to-r from-blue-600 to-blue-700">
              <div className="flex items-center justify-between">
                <div>
                  <h2 className="text-xl font-semibold text-white">Edit Sale</h2>
                  <p className="text-blue-100 text-sm mt-1">
                    Sale ID: {editingSale.saleId?.slice(-8).toUpperCase() || editingSale.id?.slice(-8).toUpperCase()}
                  </p>
                </div>
                <button
                  onClick={() => setShowEditSaleModal(false)}
                  className="text-blue-100 hover:text-white transition-colors"
                >
                  <X className="w-6 h-6" />
                </button>
              </div>
            </div>
            <div className="p-6">
              <EditSaleForm 
                sale={editingSale}
                onSave={handleSaveSaleEdit}
                onCancel={() => setShowEditSaleModal(false)}
              />
            </div>
          </div>
        </div>
      )}

      {/* Delete Sale Confirmation Modal */}
      {showDeleteSaleModal && saleToDelete && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-lg max-w-md w-full">
            <div className="p-6 border-b bg-gradient-to-r from-red-600 to-red-700">
              <div className="flex items-center justify-between">
                <div className="flex items-center">
                  <AlertTriangle className="w-6 h-6 text-red-100 mr-3" />
                  <h2 className="text-xl font-semibold text-white">Delete Sale</h2>
                </div>
                <button
                  onClick={() => setShowDeleteSaleModal(false)}
                  className="text-red-100 hover:text-white transition-colors"
                >
                  <X className="w-6 h-6" />
                </button>
              </div>
            </div>
            <div className="p-6">
              <div className="mb-6">
                <div className="flex items-center mb-4">
                  <div className="w-12 h-12 bg-red-100 rounded-full flex items-center justify-center mr-4">
                    <Trash2 className="w-6 h-6 text-red-600" />
                  </div>
                  <div>
                    <p className="text-gray-900 font-medium">Confirm Deletion</p>
                    <p className="text-gray-600 text-sm">
                      This action cannot be undone
                    </p>
                  </div>
                </div>

                <div className="bg-red-50 border border-red-200 p-4 rounded-lg">
                  <h4 className="text-sm font-medium text-red-800 mb-2">Sale Details</h4>
                  <div className="space-y-1 text-sm text-red-700">
                    <p><strong>Sale ID:</strong> {saleToDelete.saleId?.slice(-8).toUpperCase()}</p>
                    <p><strong>Customer:</strong> {saleToDelete.customerName}</p>
                    <p><strong>Amount:</strong> {formatCurrency(saleToDelete.totalPrice || 0)}</p>
                    <p><strong>Date:</strong> {new Date(saleToDelete.saleDate).toLocaleDateString()}</p>
                  </div>
                </div>
              </div>

              <div className="flex justify-end space-x-3">
                <button
                  onClick={() => setShowDeleteSaleModal(false)}
                  className="px-6 py-2 bg-gray-600 text-white rounded-lg hover:bg-gray-700 transition-colors font-medium"
                >
                  Cancel
                </button>
                <button
                  onClick={handleConfirmDeleteSale}
                  className="px-6 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors font-medium flex items-center"
                >
                  <Trash2 className="w-4 h-4 mr-2" />
                  Delete Sale
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );

  // Edit Sale Form Component
  function EditSaleForm({ 
    sale, 
    onSave, 
    onCancel 
  }: {
    sale: any;
    onSave: (updatedSale: any) => void;
    onCancel: () => void;
  }) {
    const [formData, setFormData] = useState({
      quantity: sale.quantity || 1,
      weight: sale.weight || '',
      unitPrice: sale.unitPrice || 0,
      receivedValue: sale.received_value || sale.receivedValue || 0,
      paymentMethod: sale.paymentMethod || 'cash',
      customerId: sale.customer_id || '',
      status: sale.status || ''
    });

    const [errors, setErrors] = useState<Record<string, string>>({});

    // Calculate total value
    const totalValue = formData.quantity * formData.unitPrice;
    const isPartialPayment = formData.receivedValue < totalValue;
    const isCredit = formData.paymentMethod === 'credit';
    const requiresCustomer = isCredit || isPartialPayment;

    // Get customer name for display
    const selectedCustomer = customers.find(c => c.id === formData.customerId);
    const customerName = selectedCustomer?.name || '';

    const validateForm = () => {
      const newErrors: Record<string, string> = {};

      if (formData.quantity <= 0) {
        newErrors.quantity = 'Quantity must be greater than 0';
      }

      if (formData.unitPrice <= 0) {
        newErrors.unitPrice = 'Unit price must be greater than 0';
      }

      if (formData.receivedValue < 0) {
        newErrors.receivedValue = 'Received value cannot be negative';
      }

      if (requiresCustomer && !formData.customerId) {
        newErrors.customerId = 'Customer is required for credit sales or partial payments';
      }

      if (formData.paymentMethod !== 'credit' && formData.receivedValue > totalValue) {
        newErrors.receivedValue = 'Received value cannot exceed total value for non-credit transactions';
      }

      setErrors(newErrors);
      return Object.keys(newErrors).length === 0;
    };

    const handleSubmit = (e: React.FormEvent) => {
      e.preventDefault();
      if (validateForm()) {
        onSave({
          ...formData,
          // Ensure weight is properly handled
          weight: formData.weight ? parseFloat(formData.weight.toString()) : null,
          receivedValue: formData.receivedValue
        });
      }
    };

    const handlePaymentMethodChange = (method: string) => {
      setFormData(prev => ({
        ...prev,
        paymentMethod: method,
        // Auto-set received value based on payment method
        receivedValue: method === 'credit' ? 0 : prev.receivedValue || totalValue
      }));
    };

    return (
      <div className="space-y-6">
        {/* Sale Overview Card */}
        {/* <div className="bg-gradient-to-r from-blue-50 to-indigo-50 p-4 rounded-lg border border-blue-200">
          <h3 className="text-lg font-semibold text-gray-800 mb-2">Sale Overview</h3>
          <div className="grid grid-cols-2 gap-4 text-sm">
            <div>
              <span className="text-gray-600">Total Value:</span>
              <span className="ml-2 font-semibold text-gray-900">{formatCurrency(totalValue)}</span>
            </div>
            <div>
              <span className="text-gray-600">Received:</span>
              <span className="ml-2 font-semibold text-gray-900">{formatCurrency(formData.receivedValue)}</span>
            </div>
            {isPartialPayment && (
              <div className="col-span-2">
                <span className="text-amber-600">Outstanding:</span>
                <span className="ml-2 font-semibold text-amber-700">{formatCurrency(totalValue - formData.receivedValue)}</span>
              </div>
            )}
          </div>
        </div> */}

        <form onSubmit={handleSubmit} className="space-y-5">
          {/* Product Details Section */}
          <div className="space-y-4">
            <h4 className="text-md font-medium text-gray-800 border-b border-gray-200 pb-2">Product Details</h4>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Quantity <span className="text-red-500">*</span>
                </label>
                <input
                  type="number"
                  min="0.01"
                  step="0.01"
                  value={formData.quantity}
                  onChange={(e) => setFormData({ ...formData, quantity: parseFloat(e.target.value) || 0 })}
                  className={`w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-colors ${
                    errors.quantity ? 'border-red-500 bg-red-50' : 'border-gray-300'
                  }`}
                  required
                />
                {errors.quantity && <p className="text-red-500 text-xs mt-1">{errors.quantity}</p>}
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Weight (kg)
                </label>
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  value={formData.weight}
                  onChange={(e) => setFormData({ ...formData, weight: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-colors"
                  placeholder="Optional"
                />
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Unit Price <span className="text-red-500">*</span>
              </label>
              <div className="relative">
                <DollarSign className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-gray-400" />
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  value={formData.unitPrice}
                  onChange={(e) => setFormData({ ...formData, unitPrice: parseFloat(e.target.value) || 0 })}
                  className={`w-full pl-10 pr-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-colors ${
                    errors.unitPrice ? 'border-red-500 bg-red-50' : 'border-gray-300'
                  }`}
                  required
                />
              </div>
              {errors.unitPrice && <p className="text-red-500 text-xs mt-1">{errors.unitPrice}</p>}
            </div>
          </div>

          {/* Payment Details Section */}
          <div className="space-y-4">
            <h4 className="text-md font-medium text-gray-800 border-b border-gray-200 pb-2">Payment Details</h4>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Payment Method <span className="text-red-500">*</span>
              </label>
              <div className="grid grid-cols-3 gap-2">
                {[
                  { value: 'cash', label: 'Cash', icon: DollarSign },
                  { value: 'card', label: 'Card', icon: CreditCard },
                  { value: 'credit', label: 'Credit', icon: Clock }
                ].map(({ value, label, icon: Icon }) => (
                  <button
                    key={value}
                    type="button"
                    onClick={() => handlePaymentMethodChange(value)}
                    className={`p-3 rounded-lg border-2 transition-all ${
                      formData.paymentMethod === value
                        ? value === 'cash' ? 'border-green-500 bg-green-50 text-green-700' :
                          value === 'card' ? 'border-blue-500 bg-blue-50 text-blue-700' :
                          'border-amber-500 bg-amber-50 text-amber-700'
                        : 'border-gray-200 hover:border-gray-300 hover:bg-gray-50'
                    }`}
                  >
                    <Icon className="w-5 h-5 mx-auto mb-1" />
                    <span className="text-sm font-medium">{label}</span>
                  </button>
                ))}
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Received Amount <span className="text-red-500">*</span>
              </label>
              <div className="relative">
                <DollarSign className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-gray-400" />
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  value={formData.receivedValue}
                  onChange={(e) => setFormData({ ...formData, receivedValue: parseFloat(e.target.value) || 0 })}
                  className={`w-full pl-10 pr-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-colors ${
                    errors.receivedValue ? 'border-red-500 bg-red-50' : 'border-gray-300'
                  }`}
                  placeholder="Amount received"
                />
              </div>
              {errors.receivedValue && <p className="text-red-500 text-xs mt-1">{errors.receivedValue}</p>}

              {/* Quick amount buttons */}
              {/* <div className="mt-2 flex gap-2">
                <button
                  type="button"
                  onClick={() => setFormData({ ...formData, receivedValue: totalValue })}
                  className="px-3 py-1 text-xs bg-gray-100 hover:bg-gray-200 rounded-md transition-colors"
                >
                  Full Amount
                </button>
                <button
                  type="button"
                  onClick={() => setFormData({ ...formData, receivedValue: totalValue * 0.5 })}
                  className="px-3 py-1 text-xs bg-gray-100 hover:bg-gray-200 rounded-md transition-colors"
                >
                  Half Amount
                </button>
                <button
                  type="button"
                  onClick={() => setFormData({ ...formData, receivedValue: 0 })}
                  className="px-3 py-1 text-xs bg-gray-100 hover:bg-gray-200 rounded-md transition-colors"
                >
                  No Payment
                </button>
              </div> */}
            </div>

            {/* Customer Selection - shown when required */}
            {requiresCustomer && (
              <div className={`p-4 rounded-lg border-2 ${
                formData.customerId ? 'border-green-200 bg-green-50' : 'border-amber-200 bg-amber-50'
              }`}>
                <div className="flex items-center mb-2">
                  <User className="w-4 h-4 mr-2 text-amber-600" />
                  <label className="text-sm font-medium text-gray-700">
                    Customer Required <span className="text-red-500">*</span>
                  </label>
                </div>
                <SearchableSelect
                   options={customers.map(c => ({ value: c.id, label: c.name, id: c.id }))}
                  value={formData.customerId}
                  onChange={(value) => setFormData({ ...formData, customerId: value })}
                  placeholder="Select customer..."
                  className={errors.customerId ? 'border-red-500' : ''}
                />
                {errors.customerId && <p className="text-red-500 text-xs mt-1">{errors.customerId}</p>}

                {isPartialPayment && customerName && (
                  <p className="text-sm text-amber-700 mt-2">
                    {formatCurrency(totalValue - formData.receivedValue)} will be added to {customerName}'s balance.
                  </p>
                )}

                {isCredit && customerName && (
                  <p className="text-sm text-amber-700 mt-2">
                    Full amount ({formatCurrency(totalValue)}) will be added to {customerName}'s credit balance.
                  </p>
                )}
              </div>
            )}
          </div>

          {/* Additional Details Section */}
          <div className="space-y-4">
            <h4 className="text-md font-medium text-gray-800 border-b border-gray-200 pb-2">Additional Details</h4>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Notes
              </label>
              <textarea
                value={formData.status}
                onChange={(e) => setFormData({ ...formData, status: e.target.value })}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-colors"
                rows={3}
                placeholder="Optional status about this sale..."
              />
            </div>
          </div>

          {/* Action Buttons */}
          <div className="flex justify-end space-x-3 pt-6 border-t border-gray-200">
            <button
              type="button"
              onClick={onCancel}
              className="px-6 py-2 bg-gray-600 text-white rounded-lg hover:bg-gray-700 transition-colors font-medium"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors font-medium flex items-center"
            >
              <CheckCircle className="w-4 h-4 mr-2" />
              Save Changes
            </button>
          </div>
        </form>
      </div>
    );
  }}