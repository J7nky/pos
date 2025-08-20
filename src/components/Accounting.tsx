import React, { useState, useEffect, useMemo } from 'react';
import { useAccountingKeyboard } from '../hooks/useAccountingKeyboard';
import AccessibleModal from './common/AccessibleModal';
import AccessibleButton from './common/AccessibleButton';
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
  
  // Refs for keyboard navigation
  const searchInputRef = React.useRef<HTMLInputElement>(null);
  const refreshButtonRef = React.useRef<HTMLButtonElement>(null);
  
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

  // Toast state
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error'; visible: boolean }>({
    message: '',
    type: 'success',
    visible: false
  });

  // Keyboard shortcuts for accounting
  useAccountingKeyboard({
    onCustomerPayment: () => setShowForm('receive'),
    onSupplierPayment: () => setShowForm('pay'),
    onExpense: () => setShowForm('expense'),
    onRefresh: () => raw.refreshData?.(),
    onSearch: () => searchInputRef.current?.focus(),
    onSync: () => raw.sync?.()
  });

  const showToast = (message: string, type: 'success' | 'error' = 'success') => {
    setToast({ message, type, visible: true });
    setTimeout(() => setToast(t => ({ ...t, visible: false })), 3000);
  };
  const hideToast = () => setToast(t => ({ ...t, visible: false }));

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
            cmp = a.status.localeCompare(b.status);
            break;
        }
        return pendingBillsSortDir === 'asc' ? cmp : -cmp;
      });

      return filtered;
    } catch (error) {
      console.error('Error filtering pending bills:', error);
      return [];
    }
  }, [getPendingBills, pendingBillsSearchTerm, pendingBillsSupplierFilter, pendingBillsProductFilter, pendingBillsStatusFilter, pendingBillsSort, pendingBillsSortDir]);

  // Return the component JSX here
  return (
    <div className="p-6">
      {/* Component content would go here */}
    </div>
  );
}