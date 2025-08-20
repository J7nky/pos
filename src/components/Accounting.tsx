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
    onCustomerPayment: () => setShowPaymentForm('customer'),
    onSupplierPayment: () => setShowPaymentForm('supplier'),
    onExpense: () => setShowExpenseForm(true),
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

  const exportPendingBills = () => {
    const csvContent = [
      ['Date Received', 'Supplier', 'Product', 'Original Qty', 'Sold Qty', 'Remaining Qty', 'Total Revenue', 'Commission Rate', 'Commission Amount', 'Supplier Payment', 'Progress', 'Status', 'Days Since Received'].join(','),
      ...filteredPendingBills.map(bill => [
        new Date(bill.receivedAt).toLocaleDateString(),
        bill.supplierName,
        bill.productName,
        bill.originalQuantity,
        bill.soldQuantity,
        bill.remainingQuantity,
        bill.totalRevenue.toFixed(2),
        `${bill.commissionRate}%`,
        bill.commissionAmount.toFixed(2),
        bill.supplierPayment.toFixed(2),
        `${bill.progress.toFixed(1)}%`,
        bill.status,
        bill.daysSinceReceived
      ].join(','))
    ].join('\n');

    const blob = new Blob([csvContent], { type: 'text/csv' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `pending-bills-${new Date().toISOString().split('T')[0]}.csv`;
    a.click();
    window.URL.revokeObjectURL(url);
    showToast('Pending bills exported successfully', 'success');
  };

  const handleViewPendingBillDetails = (bill: any) => {
    setSelectedPendingBill(bill);
    setShowPendingBillDetails(true);
  };

  const handleCloseBill = (bill: any) => {
    setClosingBill(bill);
    setShowCloseBillModal(true);
  };

  // Process commission payment for this supplier
  const handleCommissionPayment = async (supplierId: string) => {
    const supplier = suppliers.find(s => s.id === supplierId);
    if (!supplier) {
      showToast('Supplier not found', 'error');
      return;
    }

    try {
      // Get all bills for this supplier
      const supplierBills = filteredPendingBills.filter(bill => bill.supplierId === supplierId);
      
      if (supplierBills.length === 0) {
        showToast('No bills found for this supplier', 'error');
        return;
      }

      // Calculate totals
      const totalRevenue = supplierBills.reduce((sum, bill) => sum + bill.totalRevenue, 0);
      const totalCommission = supplierBills.reduce((sum, bill) => sum + bill.commissionAmount, 0);
      const totalSupplierPayment = totalRevenue - totalCommission;
      const totalPorterage = supplierBills.reduce((sum, bill) => sum + (bill.porterageAmount || 0), 0);
      const totalTransferFees = supplierBills.reduce((sum, bill) => sum + (bill.transferFeeAmount || 0), 0);

      // Record commission income
      if (totalCommission > 0) {
        await addTransaction({
          type: 'income',
          category: 'Commission Income',
          amount: totalCommission,
          currency: 'USD',
          description: `Commission income from ${supplier.name} - ${supplierBills.length} bills`,
          reference: `COMMISSION-${Date.now()}`,
          created_by: userProfile?.id || ''
        });
      }

      // Record supplier payment as expense
      if (totalSupplierPayment > 0) {
        await addTransaction({
          type: 'expense',
          category: 'Supplier Payment',
          amount: totalSupplierPayment,
          currency: 'USD',
          description: `Payment to ${supplier.name} for commission bills`,
          reference: `SUPPLIER-PAY-${Date.now()}`,
          created_by: userProfile?.id || ''
        });
      }

      // RULE 4 FIX: Record porterage and transfer fees as expenses
      if (totalPorterage > 0) {
        await addTransaction({
          type: 'expense',
          category: 'Porterage Fee',
          amount: totalPorterage,
          currency: 'USD',
          description: `Porterage fees for commission bill closure - ${supplier.name}`,
          reference: `PORTERAGE-BILL-${Date.now()}`,
          created_by: userProfile?.id || ''
        });
      }
      
      if (totalTransferFees > 0) {
        await addTransaction({
          type: 'expense',
          category: 'Transfer Fee',
          amount: totalTransferFees,
          currency: 'USD',
          description: `Transfer fees for commission bill closure - ${supplier.name}`,
          reference: `TRANSFER-BILL-${Date.now()}`,
          created_by: userProfile?.id || ''
        });
      }

      showToast(`Commission payment processed! Revenue: $${totalRevenue.toFixed(2)}, Commission: $${totalCommission.toFixed(2)}, Supplier Payment: $${totalSupplierPayment.toFixed(2)}`, 'success');
      
      setShowCloseBillModal(false);
      setClosingBill(null);
    } catch (error) {
      console.error('Error processing commission payment:', error);
      showToast('Error processing commission payment', 'error');
    }
  };

  // Don't render until data is ready
  if (!isDataReady) {
    return (
      <div className="p-6">
        <div className="flex items-center justify-center h-64">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
          <span className="ml-2 text-gray-600">Loading accounting data...</span>
        </div>
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">Accounting</h1>
          <p className="text-gray-600">Financial management and reporting</p>
        </div>
        <div className="flex items-center space-x-3">
          <AccessibleButton
            ref={refreshButtonRef}
            onClick={() => raw.refreshData?.()}
            variant="outline"
            size="sm"
            className="flex items-center space-x-2"
            aria-label="Refresh data"
          >
            <RefreshCw className="w-4 h-4" />
            <span>Refresh</span>
          </AccessibleButton>
          <AccessibleButton
            onClick={() => raw.sync?.()}
            variant="primary"
            size="sm"
            className="flex items-center space-x-2"
            aria-label="Sync data"
          >
            <Upload className="w-4 h-4" />
            <span>Sync</span>
          </AccessibleButton>
        </div>
      </div>

      {/* Quick Stats */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        <div className="bg-white rounded-lg shadow p-6">
          <div className="flex items-center">
            <div className="p-2 bg-green-100 rounded-lg">
              <TrendingUp className="w-6 h-6 text-green-600" />
            </div>
            <div className="ml-4">
              <p className="text-sm font-medium text-gray-600">Today's Income</p>
              <p className="text-2xl font-bold text-gray-900">{formatCurrency(todayIncome)}</p>
            </div>
          </div>
        </div>

        <div className="bg-white rounded-lg shadow p-6">
          <div className="flex items-center">
            <div className="p-2 bg-red-100 rounded-lg">
              <TrendingDown className="w-6 h-6 text-red-600" />
            </div>
            <div className="ml-4">
              <p className="text-sm font-medium text-gray-600">Today's Expenses</p>
              <p className="text-2xl font-bold text-gray-900">{formatCurrency(todayExpenses)}</p>
            </div>
          </div>
        </div>

        <div className="bg-white rounded-lg shadow p-6">
          <div className="flex items-center">
            <div className="p-2 bg-blue-100 rounded-lg">
              <Users className="w-6 h-6 text-blue-600" />
            </div>
            <div className="ml-4">
              <p className="text-sm font-medium text-gray-600">Active Customers</p>
              <p className="text-2xl font-bold text-gray-900">{kpiData.totalCustomers}</p>
            </div>
          </div>
        </div>

        <div className="bg-white rounded-lg shadow p-6">
          <div className="flex items-center">
            <div className="p-2 bg-purple-100 rounded-lg">
              <Building2 className="w-6 h-6 text-purple-600" />
            </div>
            <div className="ml-4">
              <p className="text-sm font-medium text-gray-600">Suppliers</p>
              <p className="text-2xl font-bold text-gray-900">{kpiData.totalSuppliers}</p>
            </div>
          </div>
        </div>
      </div>

      {/* Navigation Tabs */}
      <div className="border-b border-gray-200">
        <nav className="-mb-px flex space-x-8" aria-label="Tabs">
          {[
            { id: 'dashboard', name: 'Dashboard', icon: BarChart3 },
            { id: 'customer-balances', name: 'Customer Balances', icon: Users },
            { id: 'supplier-balances', name: 'Supplier Balances', icon: Building2 },
            { id: 'expenses', name: 'Expenses', icon: Receipt },
            { id: 'journal', name: 'Journal', icon: FileText },
            { id: 'nonpriced', name: 'Non-Priced Items', icon: AlertTriangle },
            { id: 'inventory-logs', name: 'Inventory Logs', icon: Package },
            { id: 'received-bills', name: 'Received Bills', icon: ClipboardList }
          ].map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id as any)}
              className={`${
                activeTab === tab.id
                  ? 'border-blue-500 text-blue-600'
                  : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
              } whitespace-nowrap py-2 px-1 border-b-2 font-medium text-sm flex items-center space-x-2`}
            >
              <tab.icon className="w-4 h-4" />
              <span>{tab.name}</span>
            </button>
          ))}
        </nav>
      </div>

      {/* Tab Content */}
      {activeTab === 'dashboard' && (
        <div className="space-y-6">
          {/* Period Selector */}
          <div className="flex items-center justify-between">
            <h2 className="text-xl font-semibold text-gray-900">Financial Overview</h2>
            <div className="flex items-center space-x-2">
              <label htmlFor="period-select" className="text-sm font-medium text-gray-700">
                Period:
              </label>
              <select
                id="period-select"
                value={dashboardPeriod}
                onChange={(e) => setDashboardPeriod(e.target.value as any)}
                className="rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 text-sm"
              >
                <option value="today">Today</option>
                <option value="week">This Week</option>
                <option value="month">This Month</option>
                <option value="quarter">This Quarter</option>
                <option value="year">This Year</option>
              </select>
            </div>
          </div>

          {/* Period Stats */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
            <div className="bg-white rounded-lg shadow p-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-gray-600">Income</p>
                  <p className="text-2xl font-bold text-green-600">{formatCurrency(getPeriodData.income)}</p>
                  {getPeriodData.incomeChange !== 0 && (
                    <p className={`text-sm ${getPeriodData.incomeChange > 0 ? 'text-green-600' : 'text-red-600'} flex items-center`}>
                      {getPeriodData.incomeChange > 0 ? <ArrowUpRight className="w-4 h-4" /> : <ArrowDownRight className="w-4 h-4" />}
                      {Math.abs(getPeriodData.incomeChange).toFixed(1)}%
                    </p>
                  )}
                </div>
                <div className="p-2 bg-green-100 rounded-lg">
                  <TrendingUp className="w-6 h-6 text-green-600" />
                </div>
              </div>
            </div>

            <div className="bg-white rounded-lg shadow p-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-gray-600">Expenses</p>
                  <p className="text-2xl font-bold text-red-600">{formatCurrency(getPeriodData.expenses)}</p>
                  {getPeriodData.expenseChange !== 0 && (
                    <p className={`text-sm ${getPeriodData.expenseChange > 0 ? 'text-red-600' : 'text-green-600'} flex items-center`}>
                      {getPeriodData.expenseChange > 0 ? <ArrowUpRight className="w-4 h-4" /> : <ArrowDownRight className="w-4 h-4" />}
                      {Math.abs(getPeriodData.expenseChange).toFixed(1)}%
                    </p>
                  )}
                </div>
                <div className="p-2 bg-red-100 rounded-lg">
                  <TrendingDown className="w-6 h-6 text-red-600" />
                </div>
              </div>
            </div>

            <div className="bg-white rounded-lg shadow p-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-gray-600">Net Profit</p>
                  <p className={`text-2xl font-bold ${getPeriodData.netProfit >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                    {formatCurrency(getPeriodData.netProfit)}
                  </p>
                  <p className="text-sm text-gray-500">
                    Margin: {getPeriodData.profitMargin.toFixed(1)}%
                  </p>
                </div>
                <div className={`p-2 rounded-lg ${getPeriodData.netProfit >= 0 ? 'bg-green-100' : 'bg-red-100'}`}>
                  <Target className={`w-6 h-6 ${getPeriodData.netProfit >= 0 ? 'text-green-600' : 'text-red-600'}`} />
                </div>
              </div>
            </div>

            <div className="bg-white rounded-lg shadow p-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-gray-600">Transactions</p>
                  <p className="text-2xl font-bold text-blue-600">{getPeriodData.transactionCount}</p>
                  <p className="text-sm text-gray-500">
                    Avg: {formatCurrency(getPeriodData.avgTransactionValue)}
                  </p>
                </div>
                <div className="p-2 bg-blue-100 rounded-lg">
                  <Activity className="w-6 h-6 text-blue-600" />
                </div>
              </div>
            </div>
          </div>

          {/* Quick Actions */}
          <div className="bg-white rounded-lg shadow p-6">
            <h3 className="text-lg font-medium text-gray-900 mb-4">Quick Actions</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
              <AccessibleButton
                onClick={() => setShowForm('receive')}
                className="flex items-center justify-center space-x-2 p-4 border border-gray-300 rounded-lg hover:bg-gray-50"
              >
                <ArrowDownRight className="w-5 h-5 text-green-600" />
                <span>Receive Payment</span>
              </AccessibleButton>
              
              <AccessibleButton
                onClick={() => setShowForm('pay')}
                className="flex items-center justify-center space-x-2 p-4 border border-gray-300 rounded-lg hover:bg-gray-50"
              >
                <ArrowUpRight className="w-5 h-5 text-red-600" />
                <span>Make Payment</span>
              </AccessibleButton>
              
              <AccessibleButton
                onClick={() => setShowForm('expense')}
                className="flex items-center justify-center space-x-2 p-4 border border-gray-300 rounded-lg hover:bg-gray-50"
              >
                <Receipt className="w-5 h-5 text-blue-600" />
                <span>Record Expense</span>
              </AccessibleButton>
              
              <AccessibleButton
                onClick={() => setShowForm('journal')}
                className="flex items-center justify-center space-x-2 p-4 border border-gray-300 rounded-lg hover:bg-gray-50"
              >
                <FileText className="w-5 h-5 text-purple-600" />
                <span>Journal Entry</span>
              </AccessibleButton>
            </div>
          </div>

          {/* Recent Transactions */}
          <div className="bg-white rounded-lg shadow">
            <div className="px-6 py-4 border-b border-gray-200">
              <h3 className="text-lg font-medium text-gray-900">Recent Transactions</h3>
            </div>
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-gray-200">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Date
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Type
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Category
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Description
                    </th>
                    <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Amount
                    </th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-200">
                  {transactions.slice(0, 10).map((transaction) => (
                    <tr key={transaction.id}>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                        {new Date(transaction.createdAt).toLocaleDateString()}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <span className={`inline-flex px-2 py-1 text-xs font-semibold rounded-full ${
                          transaction.type === 'income' 
                            ? 'bg-green-100 text-green-800' 
                            : 'bg-red-100 text-red-800'
                        }`}>
                          {transaction.type}
                        </span>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                        {transaction.category}
                      </td>
                      <td className="px-6 py-4 text-sm text-gray-900">
                        {transaction.description}
                      </td>
                      <td className={`px-6 py-4 whitespace-nowrap text-sm font-medium text-right ${
                        transaction.type === 'income' ? 'text-green-600' : 'text-red-600'
                      }`}>
                        {transaction.type === 'income' ? '+' : '-'}{formatCurrency(transaction.amount)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {activeTab === 'customer-balances' && (
        <div className="space-y-6">
          <div className="flex items-center justify-between">
            <h2 className="text-xl font-semibold text-gray-900">Customer Balances</h2>
            <div className="flex items-center space-x-3">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-4 h-4" />
                <input
                  ref={searchInputRef}
                  type="text"
                  placeholder="Search customers..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                />
              </div>
              <AccessibleButton
                onClick={() => setShowAddCustomerForm(true)}
                variant="primary"
                size="sm"
                className="flex items-center space-x-2"
              >
                <Plus className="w-4 h-4" />
                <span>Add Customer</span>
              </AccessibleButton>
            </div>
          </div>

          <div className="bg-white rounded-lg shadow overflow-hidden">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Customer
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    LBP Balance
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    USD Balance
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Total Balance
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Status
                  </th>
                  <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {customers
                  .filter(customer => 
                    customer.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
                    customer.email?.toLowerCase().includes(searchTerm.toLowerCase()) ||
                    customer.phone?.includes(searchTerm)
                  )
                  .map((customer) => {
                    const lbpBalance = customer.lb_balance || 0;
                    const usdBalance = customer.usd_balance || 0;
                    const totalBalance = lbpBalance + (usdBalance * (currency === 'LBP' ? 89500 : 1)); // Convert to display currency
                    
                    return (
                      <tr key={customer.id}>
                        <td className="px-6 py-4 whitespace-nowrap">
                          <div className="flex items-center">
                            <div className="flex-shrink-0 h-10 w-10">
                              <div className="h-10 w-10 rounded-full bg-gray-300 flex items-center justify-center">
                                <User className="h-5 w-5 text-gray-600" />
                              </div>
                            </div>
                            <div className="ml-4">
                              <div className="text-sm font-medium text-gray-900">{customer.name}</div>
                              <div className="text-sm text-gray-500">{customer.email}</div>
                            </div>
                          </div>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                          {lbpBalance > 0 ? `LBP ${lbpBalance.toLocaleString()}` : '-'}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                          {usdBalance > 0 ? `$${usdBalance.toFixed(2)}` : '-'}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm font-medium">
                          <span className={totalBalance > 0 ? 'text-red-600' : 'text-green-600'}>
                            {formatCurrency(totalBalance)}
                          </span>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap">
                          <span className={`inline-flex px-2 py-1 text-xs font-semibold rounded-full ${
                            customer.is_active 
                              ? 'bg-green-100 text-green-800' 
                              : 'bg-red-100 text-red-800'
                          }`}>
                            {customer.is_active ? 'Active' : 'Inactive'}
                          </span>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                          <div className="flex items-center justify-end space-x-2">
                            <AccessibleButton
                              onClick={() => {
                                setReceiveForm(prev => ({ ...prev, entityType: 'customer', entityId: customer.id }));
                                setShowForm('receive');
                              }}
                              variant="outline"
                              size="sm"
                            >
                              Receive
                            </AccessibleButton>
                            <AccessibleButton
                              onClick={() => {
                                setPayForm(prev => ({ ...prev, entityType: 'customer', entityId: customer.id }));
                                setShowForm('pay');
                              }}
                              variant="outline"
                              size="sm"
                            >
                              Pay
                            </AccessibleButton>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {activeTab === 'supplier-balances' && (
        <div className="space-y-6">
          <div className="flex items-center justify-between">
            <h2 className="text-xl font-semibold text-gray-900">Supplier Balances</h2>
            <div className="flex items-center space-x-3">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-4 h-4" />
                <input
                  type="text"
                  placeholder="Search suppliers..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                />
              </div>
              <AccessibleButton
                onClick={() => setShowAddSupplierForm(true)}
                variant="primary"
                size="sm"
                className="flex items-center space-x-2"
              >
                <Plus className="w-4 h-4" />
                <span>Add Supplier</span>
              </AccessibleButton>
            </div>
          </div>

          <div className="bg-white rounded-lg shadow overflow-hidden">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Supplier
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    LBP Balance
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    USD Balance
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Total Balance
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Contact
                  </th>
                  <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {suppliers
                  .filter(supplier => 
                    supplier.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
                    supplier.email?.toLowerCase().includes(searchTerm.toLowerCase()) ||
                    supplier.phone?.includes(searchTerm)
                  )
                  .map((supplier) => {
                    const lbpBalance = supplier.lb_balance || 0;
                    const usdBalance = supplier.usd_balance || 0;
                    const totalBalance = lbpBalance + (usdBalance * (currency === 'LBP' ? 89500 : 1)); // Convert to display currency
                    
                    return (
                      <tr key={supplier.id}>
                        <td className="px-6 py-4 whitespace-nowrap">
                          <div className="flex items-center">
                            <div className="flex-shrink-0 h-10 w-10">
                              <div className="h-10 w-10 rounded-full bg-gray-300 flex items-center justify-center">
                                <Building2 className="h-5 w-5 text-gray-600" />
                              </div>
                            </div>
                            <div className="ml-4">
                              <div className="text-sm font-medium text-gray-900">{supplier.name}</div>
                              <div className="text-sm text-gray-500">{supplier.company}</div>
                            </div>
                          </div>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                          {lbpBalance > 0 ? `LBP ${lbpBalance.toLocaleString()}` : '-'}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                          {usdBalance > 0 ? `$${usdBalance.toFixed(2)}` : '-'}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm font-medium">
                          <span className={totalBalance > 0 ? 'text-red-600' : 'text-green-600'}>
                            {formatCurrency(totalBalance)}
                          </span>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                          <div>{supplier.email}</div>
                          <div>{supplier.phone}</div>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                          <div className="flex items-center justify-end space-x-2">
                            <AccessibleButton
                              onClick={() => {
                                setReceiveForm(prev => ({ ...prev, entityType: 'supplier', entityId: supplier.id }));
                                setShowForm('receive');
                              }}
                              variant="outline"
                              size="sm"
                            >
                              Receive
                            </AccessibleButton>
                            <AccessibleButton
                              onClick={() => {
                                setPayForm(prev => ({ ...prev, entityType: 'supplier', entityId: supplier.id }));
                                setShowForm('pay');
                              }}
                              variant="outline"
                              size="sm"
                            >
                              Pay
                            </AccessibleButton>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {activeTab === 'expenses' && (
        <div className="space-y-6">
          <div className="flex items-center justify-between">
            <h2 className="text-xl font-semibold text-gray-900">Expense Management</h2>
            <div className="flex items-center space-x-3">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-4 h-4" />
                <input
                  type="text"
                  placeholder="Search expenses..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                />
              </div>
              <AccessibleButton
                onClick={() => setShowForm('expense')}
                variant="primary"
                size="sm"
                className="flex items-center space-x-2"
              >
                <Plus className="w-4 h-4" />
                <span>Add Expense</span>
              </AccessibleButton>
              <AccessibleButton
                onClick={() => setShowAddCategoryForm(true)}
                variant="outline"
                size="sm"
                className="flex items-center space-x-2"
              >
                <Plus className="w-4 h-4" />
                <span>Add Category</span>
              </AccessibleButton>
            </div>
          </div>

          {/* Expense Categories */}
          <div className="bg-white rounded-lg shadow p-6">
            <h3 className="text-lg font-medium text-gray-900 mb-4">Expense Categories</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {expenseCategories.map((category) => {
                const categoryExpenses = transactions
                  .filter(t => t.type === 'expense' && t.category === category.name)
                  .reduce((sum, t) => sum + getConvertedAmount(t.amount, t.currency || 'USD'), 0);
                
                return (
                  <div key={category.id} className="border border-gray-200 rounded-lg p-4">
                    <div className="flex items-center justify-between">
                      <div>
                        <h4 className="font-medium text-gray-900">{category.name}</h4>
                        <p className="text-sm text-gray-500">{category.description}</p>
                      </div>
                      <div className="text-right">
                        <p className="text-lg font-semibold text-gray-900">
                          {formatCurrency(categoryExpenses)}
                        </p>
                        <p className="text-xs text-gray-500">Total spent</p>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Recent Expenses */}
          <div className="bg-white rounded-lg shadow">
            <div className="px-6 py-4 border-b border-gray-200">
              <h3 className="text-lg font-medium text-gray-900">Recent Expenses</h3>
            </div>
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-gray-200">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Date
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Category
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Description
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Reference
                    </th>
                    <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Amount
                    </th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-200">
                  {transactions
                    .filter(t => t.type === 'expense')
                    .filter(t => 
                      !searchTerm || 
                      t.category.toLowerCase().includes(searchTerm.toLowerCase()) ||
                      t.description.toLowerCase().includes(searchTerm.toLowerCase()) ||
                      t.reference?.toLowerCase().includes(searchTerm.toLowerCase())
                    )
                    .slice(0, 20)
                    .map((expense) => (
                      <tr key={expense.id}>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                          {new Date(expense.createdAt).toLocaleDateString()}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                          {expense.category}
                        </td>
                        <td className="px-6 py-4 text-sm text-gray-900">
                          {expense.description}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                          {expense.reference}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-red-600 text-right">
                          -{formatCurrency(expense.amount)}
                        </td>
                      </tr>
                    ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {activeTab === 'journal' && (
        <div className="space-y-6">
          <div className="flex items-center justify-between">
            <h2 className="text-xl font-semibold text-gray-900">Journal Entries</h2>
            <AccessibleButton
              onClick={() => setShowForm('journal')}
              variant="primary"
              size="sm"
              className="flex items-center space-x-2"
            >
              <Plus className="w-4 h-4" />
              <span>New Entry</span>
            </AccessibleButton>
          </div>

          <div className="bg-white rounded-lg shadow p-6">
            <p className="text-gray-600">Journal entry functionality will be implemented in a future update.</p>
          </div>
        </div>
      )}

      {activeTab === 'nonpriced' && (
        <div className="space-y-6">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-xl font-semibold text-gray-900">Non-Priced Items</h2>
              <p className="text-sm text-gray-600">Items that need pricing before they can be processed</p>
            </div>
            <div className="flex items-center space-x-3">
              {selectedNonPriced.length > 0 && (
                <AccessibleButton
                  onClick={() => setShowBulkActions(!showBulkActions)}
                  variant="outline"
                  size="sm"
                  className="flex items-center space-x-2"
                >
                  <Edit className="w-4 h-4" />
                  <span>Bulk Actions ({selectedNonPriced.length})</span>
                </AccessibleButton>
              )}
              <AccessibleButton
                onClick={exportNonPricedItems}
                variant="outline"
                size="sm"
                className="flex items-center space-x-2"
              >
                <Download className="w-4 h-4" />
                <span>Export</span>
              </AccessibleButton>
            </div>
          </div>

          {/* Bulk Actions Panel */}
          {showBulkActions && selectedNonPriced.length > 0 && (
            <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-sm font-medium text-blue-900">
                    {selectedNonPriced.length} items selected
                  </h3>
                  <p className="text-sm text-blue-700">
                    Choose an action to apply to all selected items
                  </p>
                </div>
                <div className="flex items-center space-x-2">
                  <AccessibleButton
                    onClick={handleBulkMarkPriced}
                    variant="primary"
                    size="sm"
                    className="flex items-center space-x-2"
                  >
                    <CheckCircle className="w-4 h-4" />
                    <span>Mark as Priced</span>
                  </AccessibleButton>
                  <AccessibleButton
                    onClick={handleBulkDelete}
                    variant="danger"
                    size="sm"
                    className="flex items-center space-x-2"
                  >
                    <Trash2 className="w-4 h-4" />
                    <span>Delete</span>
                  </AccessibleButton>
                  <AccessibleButton
                    onClick={() => {
                      setShowBulkActions(false);
                      setSelectedNonPriced([]);
                    }}
                    variant="outline"
                    size="sm"
                  >
                    Cancel
                  </AccessibleButton>
                </div>
              </div>
            </div>
          )}

          {/* Search and Filters */}
          <div className="bg-white rounded-lg shadow p-4">
            <div className="flex flex-col md:flex-row md:items-center md:justify-between space-y-4 md:space-y-0">
              <div className="flex items-center space-x-4">
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-4 h-4" />
                  <input
                    type="text"
                    placeholder="Search items..."
                    value={nonPricedSearch}
                    onChange={(e) => setNonPricedSearch(e.target.value)}
                    className="pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  />
                </div>
              </div>
              <div className="flex items-center space-x-2">
                <select
                  value={nonPricedSort}
                  onChange={(e) => setNonPricedSort(e.target.value as any)}
                  className="rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 text-sm"
                >
                  <option value="date">Sort by Date</option>
                  <option value="customer">Sort by Customer</option>
                  <option value="product">Sort by Product</option>
                  <option value="value">Sort by Value</option>
                </select>
                <AccessibleButton
                  onClick={() => setNonPricedSortDir(nonPricedSortDir === 'asc' ? 'desc' : 'asc')}
                  variant="outline"
                  size="sm"
                  className="flex items-center space-x-1"
                >
                  {nonPricedSortDir === 'asc' ? '↑' : '↓'}
                </AccessibleButton>
              </div>
            </div>
          </div>

          {/* Items List */}
          <div className="bg-white rounded-lg shadow overflow-hidden">
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-gray-200">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-6 py-3 text-left">
                      <input
                        type="checkbox"
                        checked={selectedNonPriced.length === pagedNonPricedItems.length && pagedNonPricedItems.length > 0}
                        onChange={(e) => {
                          if (e.target.checked) {
                            setSelectedNonPriced(pagedNonPricedItems.map(item => item.id));
                          } else {
                            setSelectedNonPriced([]);
                          }
                        }}
                        className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                      />
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Customer
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Product
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Supplier
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Quantity
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Weight
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Unit Price
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Total Value
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Status
                    </th>
                    <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Actions
                    </th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-200">
                  {pagedNonPricedItems.map((item) => {
                    const stagedChanges = stagedNonPricedChanges[item.id] || {};
                    const currentUnitPrice = stagedChanges.unit_price !== undefined ? stagedChanges.unit_price : item.unit_price;
                    const currentQuantity = stagedChanges.quantity !== undefined ? stagedChanges.quantity : item.quantity;
                    const currentWeight = stagedChanges.weight !== undefined ? stagedChanges.weight : item.weight;
                    const hasChanges = Object.keys(stagedChanges).length > 0;
                    
                    return (
                      <tr key={item.id} className={hasChanges ? 'bg-yellow-50' : ''}>
                        <td className="px-6 py-4 whitespace-nowrap">
                          <input
                            type="checkbox"
                            checked={selectedNonPriced.includes(item.id)}
                            onChange={(e) => {
                              if (e.target.checked) {
                                setSelectedNonPriced([...selectedNonPriced, item.id]);
                              } else {
                                setSelectedNonPriced(selectedNonPriced.filter(id => id !== item.id));
                              }
                            }}
                            className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                          />
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                          {item.customerName}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                          {item.productName}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                          {item.supplierName}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap">
                          <input
                            type="number"
                            value={currentQuantity || ''}
                            onChange={(e) => stageChange(item.id, 'quantity', parseFloat(e.target.value) || 0)}
                            className="w-20 px-2 py-1 text-sm border border-gray-300 rounded focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                            min="0"
                            step="0.01"
                          />
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap">
                          <input
                            type="number"
                            value={currentWeight || ''}
                            onChange={(e) => stageChange(item.id, 'weight', parseFloat(e.target.value) || 0)}
                            className="w-20 px-2 py-1 text-sm border border-gray-300 rounded focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                            min="0"
                            step="0.01"
                          />
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap">
                          <input
                            type="number"
                            value={currentUnitPrice || ''}
                            onChange={(e) => stageChange(item.id, 'unit_price', parseFloat(e.target.value) || 0)}
                            className="w-24 px-2 py-1 text-sm border border-gray-300 rounded focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                            min="0"
                            step="0.01"
                          />
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                          {currentUnitPrice && (currentWeight || currentQuantity) 
                            ? `$${(currentUnitPrice * (currentWeight || currentQuantity)).toFixed(2)}`
                            : '-'
                          }
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap">
                          <span className={`inline-flex px-2 py-1 text-xs font-semibold rounded-full ${
                            item.status === 'ready' 
                              ? 'bg-green-100 text-green-800' 
                              : 'bg-yellow-100 text-yellow-800'
                          }`}>
                            {item.status === 'ready' ? 'Ready' : 'Incomplete'}
                          </span>
                          {hasChanges && (
                            <span className="ml-1 inline-flex px-2 py-1 text-xs font-semibold rounded-full bg-blue-100 text-blue-800">
                              Modified
                            </span>
                          )}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                          <div className="flex items-center justify-end space-x-2">
                            <AccessibleButton
                              onClick={() => handleMarkPriced(item)}
                              variant="primary"
                              size="sm"
                              disabled={!currentUnitPrice || currentUnitPrice <= 0 || (!currentQuantity && !currentWeight)}
                            >
                              Mark Priced
                            </AccessibleButton>
                            <AccessibleButton
                              onClick={() => handleEditNonPriced(item)}
                              variant="outline"
                              size="sm"
                            >
                              <Edit className="w-4 h-4" />
                            </AccessibleButton>
                            <AccessibleButton
                              onClick={() => handleDeleteNonPriced(item)}
                              variant="danger"
                              size="sm"
                            >
                              <Trash2 className="w-4 h-4" />
                            </AccessibleButton>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {/* Pagination */}
            {nonPricedTotalPages > 1 && (
              <div className="bg-white px-4 py-3 flex items-center justify-between border-t border-gray-200 sm:px-6">
                <div className="flex-1 flex justify-between sm:hidden">
                  <AccessibleButton
                    onClick={() => setNonPricedPage(Math.max(1, nonPricedPage - 1))}
                    disabled={nonPricedPage === 1}
                    variant="outline"
                    size="sm"
                  >
                    Previous
                  </AccessibleButton>
                  <AccessibleButton
                    onClick={() => setNonPricedPage(Math.min(nonPricedTotalPages, nonPricedPage + 1))}
                    disabled={nonPricedPage === nonPricedTotalPages}
                    variant="outline"
                    size="sm"
                  >
                    Next
                  </AccessibleButton>
                </div>
                <div className="hidden sm:flex-1 sm:flex sm:items-center sm:justify-between">
                  <div>
                    <p className="text-sm text-gray-700">
                      Showing{' '}
                      <span className="font-medium">{(nonPricedPage - 1) * NON_PRICED_PAGE_SIZE + 1}</span>
                      {' '}to{' '}
                      <span className="font-medium">
                        {Math.min(nonPricedPage * NON_PRICED_PAGE_SIZE, filteredNonPricedItems.length)}
                      </span>
                      {' '}of{' '}
                      <span className="font-medium">{filteredNonPricedItems.length}</span>
                      {' '}results
                    </p>
                  </div>
                  <div>
                    <nav className="relative z-0 inline-flex rounded-md shadow-sm -space-x-px" aria-label="Pagination">
                      <AccessibleButton
                        onClick={() => setNonPricedPage(Math.max(1, nonPricedPage - 1))}
                        disabled={nonPricedPage === 1}
                        className="relative inline-flex items-center px-2 py-2 rounded-l-md border border-gray-300 bg-white text-sm font-medium text-gray-500 hover:bg-gray-50"
                      >
                        Previous
                      </AccessibleButton>
                      {Array.from({ length: nonPricedTotalPages }, (_, i) => i + 1).map((page) => (
                        <AccessibleButton
                          key={page}
                          onClick={() => setNonPricedPage(page)}
                          className={`relative inline-flex items-center px-4 py-2 border text-sm font-medium ${
                            page === nonPricedPage
                              ? 'z-10 bg-blue-50 border-blue-500 text-blue-600'
                              : 'bg-white border-gray-300 text-gray-500 hover:bg-gray-50'
                          }`}
                        >
                          {page}
                        </AccessibleButton>
                      ))}
                      <AccessibleButton
                        onClick={() => setNonPricedPage(Math.min(nonPricedTotalPages, nonPricedPage + 1))}
                        disabled={nonPricedPage === nonPricedTotalPages}
                        className="relative inline-flex items-center px-2 py-2 rounded-r-md border border-gray-300 bg-white text-sm font-medium text-gray-500 hover:bg-gray-50"
                      >
                        Next
                      </AccessibleButton>
                    </nav>
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Summary */}
          <div className="bg-white rounded-lg shadow p-6">
            <h3 className="text-lg font-medium text-gray-900 mb-4">Summary</h3>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="text-center">
                <p className="text-2xl font-bold text-gray-900">{filteredNonPricedItems.length}</p>
                <p className="text-sm text-gray-600">Total Items</p>
              </div>
              <div className="text-center">
                <p className="text-2xl font-bold text-green-600">
                  {filteredNonPricedItems.filter(item => item.status === 'ready').length}
                </p>
                <p className="text-sm text-gray-600">Ready to Price</p>
              </div>
              <div className="text-center">
                <p className="text-2xl font-bold text-yellow-600">
                  {filteredNonPricedItems.filter(item => item.status === 'incomplete').length}
                </p>
                <p className="text-sm text-gray-600">Need Attention</p>
              </div>
            </div>
          </div>
        </div>
      )}

      {activeTab === 'inventory-logs' && (
        <InventoryLogs
          logs={pagedInventoryLogs}
          searchTerm={inventoryLogsSearchTerm}
          setSearchTerm={setInventoryLogsSearchTerm}
          productFilter={inventoryLogsProductFilter}
          setProductFilter={setInventoryLogsProductFilter}
          supplierFilter={inventoryLogsSupplierFilter}
          setSupplierFilter={setInventoryLogsSupplierFilter}
          dateFilter={inventoryLogsDateFilter}
          setDateFilter={setInventoryLogsDateFilter}
          sort={inventoryLogsSort}
          sortDir={inventoryLogsSortDir}
          onSort={handleInventoryLogsSort}
          page={inventoryLogsPage}
          setPage={setInventoryLogsPage}
          totalPages={inventoryLogsTotalPages}
          onExport={exportInventoryLogs}
          onViewDetails={handleViewInventoryItemDetails}
          products={products}
          suppliers={suppliers}
          formatCurrency={formatCurrency}
        />
      )}

      {activeTab === 'received-bills' && (
        <ReceivedBills
          inventory={inventory}
          sales={sales}
          products={products}
          suppliers={suppliers}
          customers={customers}
          transactions={transactions}
          addTransaction={addTransaction}
          userProfile={userProfile}
          formatCurrency={formatCurrency}
          showToast={showToast}
        />
      )}

      {/* Forms */}
      {showForm === 'receive' && (
        <AccessibleModal
          isOpen={true}
          onClose={() => setShowForm(null)}
          title="Receive Payment"
          size="md"
        >
          <form onSubmit={handleReceiveSubmit} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Entity Type
              </label>
              <select
                value={receiveForm.entityType}
                onChange={(e) => setReceiveForm(prev => ({ ...prev, entityType: e.target.value as any, entityId: '' }))}
                className="w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500"
                required
              >
                <option value="customer">Customer</option>
                <option value="supplier">Supplier</option>
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                {receiveForm.entityType === 'customer' ? 'Customer' : 'Supplier'}
              </label>
              <SearchableSelect
                options={(receiveForm.entityType === 'customer' ? customers : suppliers).map(entity => ({
                  value: entity.id,
                  label: entity.name
                }))}
                value={receiveForm.entityId}
                onChange={(value) => setReceiveForm(prev => ({ ...prev, entityId: value }))}
                placeholder={`Select ${receiveForm.entityType}...`}
                required
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Amount
                </label>
                <MoneyInput
                  value={receiveForm.amount}
                  onChange={(value) => setReceiveForm(prev => ({ ...prev, amount: value }))}
                  currency={receiveForm.currency as 'USD' | 'LBP'}
                  required
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Currency
                </label>
                <select
                  value={receiveForm.currency}
                  onChange={(e) => setReceiveForm(prev => ({ ...prev, currency: e.target.value }))}
                  className="w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500"
                >
                  <option value="USD">USD</option>
                  <option value="LBP">LBP</option>
                </select>
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Description
              </label>
              <textarea
                value={receiveForm.description}
                onChange={(e) => setReceiveForm(prev => ({ ...prev, description: e.target.value }))}
                className="w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500"
                rows={3}
                placeholder="Payment description..."
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Reference
              </label>
              <input
                type="text"
                value={receiveForm.reference}
                onChange={(e) => setReceiveForm(prev => ({ ...prev, reference: e.target.value }))}
                className="w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500"
                placeholder="Reference number..."
              />
            </div>

            <div className="flex justify-end space-x-3 pt-4">
              <AccessibleButton
                type="button"
                onClick={() => setShowForm(null)}
                variant="outline"
              >
                Cancel
              </AccessibleButton>
              <AccessibleButton
                type="submit"
                variant="primary"
              >
                Record Payment
              </AccessibleButton>
            </div>
          </form>
        </AccessibleModal>
      )}

      {showForm === 'pay' && (
        <AccessibleModal
          isOpen={true}
          onClose={() => setShowForm(null)}
          title="Make Payment"
          size="md"
        >
          <form onSubmit={handlePaySubmit} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Entity Type
              </label>
              <select
                value={payForm.entityType}
                onChange={(e) => setPayForm(prev => ({ ...prev, entityType: e.target.value as any, entityId: '' }))}
                className="w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500"
                required
              >
                <option value="customer">Customer</option>
                <option value="supplier">Supplier</option>
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                {payForm.entityType === 'customer' ? 'Customer' : 'Supplier'}
              </label>
              <SearchableSelect
                options={(payForm.entityType === 'customer' ? customers : suppliers).map(entity => ({
                  value: entity.id,
                  label: entity.name
                }))}
                value={payForm.entityId}
                onChange={(value) => setPayForm(prev => ({ ...prev, entityId: value }))}
                placeholder={`Select ${payForm.entityType}...`}
                required
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Amount
                </label>
                <MoneyInput
                  value={payForm.amount}
                  onChange={(value) => setPayForm(prev => ({ ...prev, amount: value }))}
                  currency={payForm.currency as 'USD' | 'LBP'}
                  required
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Currency
                </label>
                <select
                  value={payForm.currency}
                  onChange={(e) => setPayForm(prev => ({ ...prev, currency: e.target.value }))}
                  className="w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500"
                >
                  <option value="USD">USD</option>
                  <option value="LBP">LBP</option>
                </select>
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Description
              </label>
              <textarea
                value={payForm.description}
                onChange={(e) => setPayForm(prev => ({ ...prev, description: e.target.value }))}
                className="w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500"
                rows={3}
                placeholder="Payment description..."
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Reference
              </label>
              <input
                type="text"
                value={payForm.reference}
                onChange={(e) => setPayForm(prev => ({ ...prev, reference: e.target.value }))}
                className="w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500"
                placeholder="Reference number..."
              />
            </div>

            <div className="flex justify-end space-x-3 pt-4">
              <AccessibleButton
                type="button"
                onClick={() => setShowForm(null)}
                variant="outline"
              >
                Cancel
              </AccessibleButton>
              <AccessibleButton
                type="submit"
                variant="primary"
              >
                Make Payment
              </AccessibleButton>
            </div>
          </form>
        </AccessibleModal>
      )}

      {showForm === 'expense' && (
        <AccessibleModal
          isOpen={true}
          onClose={() => setShowForm(null)}
          title="Record Expense"
          size="md"
        >
          <form onSubmit={handleExpenseSubmit} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Category
              </label>
              <SearchableSelect
                options={expenseCategories.map(category => ({
                  value: category.id,
                  label: category.name
                }))}
                value={expenseForm.categoryId}
                onChange={(value) => setExpenseForm(prev => ({ ...prev, categoryId: value }))}
                placeholder="Select category..."
                required
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Amount
                </label>
                <MoneyInput
                  value={expenseForm.amount}
                  onChange={(value) => setExpenseForm(prev => ({ ...prev, amount: value }))}
                  currency={expenseForm.currency as 'USD' | 'LBP'}
                  required
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Currency
                </label>
                <select
                  value={expenseForm.currency}
                  onChange={(e) => setExpenseForm(prev => ({ ...prev, currency: e.target.value }))}
                  className="w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500"
                >
                  <option value="USD">USD</option>
                  <option value="LBP">LBP</option>
                </select>
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Description
              </label>
              <textarea
                value={expenseForm.description}
                onChange={(e) => setExpenseForm(prev => ({ ...prev, description: e.target.value }))}
                className="w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500"
                rows={3}
                placeholder="Expense description..."
                required
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Reference
              </label>
              <input
                type="text"
                value={expenseForm.reference}
                onChange={(e) => setExpenseForm(prev => ({ ...prev, reference: e.target.value }))}
                className="w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500"
                placeholder="Reference number..."
              />
            </div>

            <div className="flex justify-end space-x-3 pt-4">
              <AccessibleButton
                type="button"
                onClick={() => setShowForm(null)}
                variant="outline"
              >
                Cancel
              </AccessibleButton>
              <AccessibleButton
                type="submit"
                variant="primary"
              >
                Record Expense
              </AccessibleButton>
            </div>
          </form>
        </AccessibleModal>
      )}

      {showForm === 'journal' && (
        <AccessibleModal
          isOpen={true}
          onClose={() => setShowForm(null)}
          title="Journal Entry"
          size="lg"
        >
          <form onSubmit={handleJournalSubmit} className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Date
                </label>
                <input
                  type="date"
                  value={journalForm.date}
                  onChange={(e) => setJournalForm(prev => ({ ...prev, date: e.target.value }))}
                  className="w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500"
                  required
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Reference
                </label>
                <input
                  type="text"
                  value={journalForm.reference}
                  onChange={(e) => setJournalForm(prev => ({ ...prev, reference: e.target.value }))}
                  className="w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500"
                  placeholder="Reference number..."
                />
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Description
              </label>
              <textarea
                value={journalForm.description}
                onChange={(e) => setJournalForm(prev => ({ ...prev, description: e.target.value }))}
                className="w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500"
                rows={2}
                placeholder="Journal entry description..."
                required
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Journal Entries
              </label>
              <div className="space-y-2">
                {journalForm.entries.map((entry, index) => (
                  <div key={index} className="grid grid-cols-4 gap-2 items-center">
                    <input
                      type="text"
                      value={entry.account}
                      onChange={(e) => {
                        const newEntries = [...journalForm.entries];
                        newEntries[index].account = e.target.value;
                        setJournalForm(prev => ({ ...prev, entries: newEntries }));
                      }}
                      className="rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500"
                      placeholder="Account"
                      required
                    />
                    <input
                      type="number"
                      value={entry.debit || ''}
                      onChange={(e) => {
                        const newEntries = [...journalForm.entries];
                        newEntries[index].debit = parseFloat(e.target.value) || 0;
                        setJournalForm(prev => ({ ...prev, entries: newEntries }));
                      }}
                      className="rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500"
                      placeholder="Debit"
                      min="0"
                      step="0.01"
                    />
                    <input
                      type="number"
                      value={entry.credit || ''}
                      onChange={(e) => {
                        const newEntries = [...journalForm.entries];
                        newEntries[index].credit = parseFloat(e.target.value) || 0;
                        setJournalForm(prev => ({ ...prev, entries: newEntries }));
                      }}
                      className="rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500"
                      placeholder="Credit"
                      min="0"
                      step="0.01"
                    />
                    <AccessibleButton
                      type="button"
                      onClick={() => {
                        const newEntries = journalForm.entries.filter((_, i) => i !== index);
                        setJournalForm(prev => ({ ...prev, entries: newEntries }));
                      }}
                      variant="danger"
                      size="sm"
                      disabled={journalForm.entries.length <= 2}
                    >
                      <Trash2 className="w-4 h-4" />
                    </AccessibleButton>
                  </div>
                ))}
              </div>
              <AccessibleButton
                type="button"
                onClick={() => {
                  setJournalForm(prev => ({
                    ...prev,
                    entries: [...prev.entries, { account: '', debit: 0, credit: 0 }]
                  }));
                }}
                variant="outline"
                size="sm"
                className="mt-2"
              >
                <Plus className="w-4 h-4 mr-2" />
                Add Entry
              </AccessibleButton>
            </div>

            <div className="bg-gray-50 p-3 rounded-md">
              <div className="flex justify-between text-sm">
                <span>Total Debits:</span>
                <span>{formatCurrency(journalForm.entries.reduce((sum, entry) => sum + entry.debit, 0))}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span>Total Credits:</span>
                <span>{formatCurrency(journalForm.entries.reduce((sum, entry) => sum + entry.credit, 0))}</span>
              </div>
              <div className="flex justify-between text-sm font-medium border-t pt-1 mt-1">
                <span>Difference:</span>
                <span className={
                  Math.abs(journalForm.entries.reduce((sum, entry) => sum + entry.debit, 0) - 
                           journalForm.entries.reduce((sum, entry) => sum + entry.credit, 0)) < 0.01
                    ? 'text-green-600' : 'text-red-600'
                }>
                  {formatCurrency(Math.abs(
                    journalForm.entries.reduce((sum, entry) => sum + entry.debit, 0) - 
                    journalForm.entries.reduce((sum, entry) => sum + entry.credit, 0)
                  ))}
                </span>
              </div>
            </div>

            <div className="flex justify-end space-x-3 pt-4">
              <AccessibleButton
                type="button"
                onClick={() => setShowForm(null)}
                variant="outline"
              >
                Cancel
              </AccessibleButton>
              <AccessibleButton
                type="submit"
                variant="primary"
                disabled={
                  Math.abs(journalForm.entries.reduce((sum, entry) => sum + entry.debit, 0) - 
                           journalForm.entries.reduce((sum, entry) => sum + entry.credit, 0)) >= 0.01
                }
              >
                Create Entry
              </AccessibleButton>
            </div>
          </form>
        </AccessibleModal>
      )}

      {/* Edit Non-Priced Item Modal */}
      {showEditNonPriced && (
        <AccessibleModal
          isOpen={true}
          onClose={() => setShowEditNonPriced(null)}
          title="Edit Non-Priced Item"
          size="md"
        >
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Customer
                </label>
                <input
                  type="text"
                  value={customers.find(c => c.id === showEditNonPriced.customer_id)?.name || 'Walk-in Customer'}
                  className="w-full rounded-md border-gray-300 bg-gray-50 shadow-sm"
                  disabled
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Product
                </label>
                <input
                  type="text"
                  value={products.find(p => p.id === showEditNonPriced.product_id)?.name || 'Unknown Product'}
                  className="w-full rounded-md border-gray-300 bg-gray-50 shadow-sm"
                  disabled
                />
              </div>
            </div>

            <div className="grid grid-cols-3 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Quantity
                </label>
                <input
                  type="number"
                  value={showEditNonPriced.quantity || ''}
                  onChange={(e) => setShowEditNonPriced(prev => ({ ...prev, quantity: parseFloat(e.target.value) || 0 }))}
                  className="w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500"
                  min="0"
                  step="0.01"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Weight (kg)
                </label>
                <input
                  type="number"
                  value={showEditNonPriced.weight || ''}
                  onChange={(e) => setShowEditNonPriced(prev => ({ ...prev, weight: parseFloat(e.target.value) || 0 }))}
                  className="w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500"
                  min="0"
                  step="0.01"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Unit Price ($)
                </label>
                <input
                  type="number"
                  value={showEditNonPriced.unitPrice || ''}
                  onChange={(e) => setShowEditNonPriced(prev => ({ ...prev, unitPrice: parseFloat(e.target.value) || 0 }))}
                  className="w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500"
                  min="0"
                  step="0.01"
                />
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Total Value
              </label>
              <input
                type="text"
                value={showEditNonPriced.unitPrice && (showEditNonPriced.weight || showEditNonPriced.quantity) 
                  ? `$${(showEditNonPriced.unitPrice * (showEditNonPriced.weight || showEditNonPriced.quantity)).toFixed(2)}`
                  : '$0.00'
                }
                className="w-full rounded-md border-gray-300 bg-gray-50 shadow-sm"
                disabled
              />
            </div>

            <div className="flex justify-end space-x-3 pt-4">
              <AccessibleButton
                onClick={() => setShowEditNonPriced(null)}
                variant="outline"
              >
                Cancel
              </AccessibleButton>
              <AccessibleButton
                onClick={() => handleSaveNonPriced(showEditNonPriced)}
                variant="primary"
              >
                Save Changes
              </AccessibleButton>
            </div>
          </div>
        </AccessibleModal>
      )}

      {/* Inventory Item Details Modal */}
      {showInventoryItemDetails && selectedInventoryItem && (
        <AccessibleModal
          isOpen={true}
          onClose={() => setShowInventoryItemDetails(false)}
          title="Inventory Item Details"
          size="lg"
        >
          <div className="space-y-6">
            <div className="grid grid-cols-2 gap-6">
              <div>
                <h3 className="text-lg font-medium text-gray-900 mb-4">Item Information</h3>
                <div className="space-y-3">
                  <div>
                    <label className="block text-sm font-medium text-gray-700">Product</label>
                    <p className="text-sm text-gray-900">
                      {products.find(p => p.id === selectedInventoryItem.product_id)?.name || 'Unknown Product'}
                    </p>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700">Supplier</label>
                    <p className="text-sm text-gray-900">
                      {suppliers.find(s => s.id === selectedInventoryItem.supplier_id)?.name || 'Unknown Supplier'}
                    </p>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700">Quantity</label>
                    <p className="text-sm text-gray-900">{selectedInventoryItem.quantity} {selectedInventoryItem.unit}</p>
                  </div>
                  {selectedInventoryItem.weight && (
                    <div>
                      <label className="block text-sm font-medium text-gray-700">Weight</label>
                      <p className="text-sm text-gray-900">{selectedInventoryItem.weight} kg</p>
                    </div>
                  )}
                  <div>
                    <label className="block text-sm font-medium text-gray-700">Unit Price</label>
                    <p className="text-sm text-gray-900">{formatCurrency(selectedInventoryItem.price || 0)}</p>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700">Total Value</label>
                    <p className="text-sm text-gray-900">
                      {formatCurrency((selectedInventoryItem.price || 0) * (selectedInventoryItem.weight || selectedInventoryItem.quantity))}
                    </p>
                  </div>
                </div>
              </div>
              
              <div>
                <h3 className="text-lg font-medium text-gray-900 mb-4">Status & Dates</h3>
                <div className="space-y-3">
                  <div>
                    <label className="block text-sm font-medium text-gray-700">Status</label>
                    <span className={`inline-flex px-2 py-1 text-xs font-semibold rounded-full ${
                      selectedInventoryItem.status === 'available' 
                        ? 'bg-green-100 text-green-800' 
                        : selectedInventoryItem.status === 'sold'
                        ? 'bg-red-100 text-red-800'
                        : 'bg-yellow-100 text-yellow-800'
                    }`}>
                      {selectedInventoryItem.status || 'Available'}
                    </span>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700">Received Date</label>
                    <p className="text-sm text-gray-900">
                      {new Date(selectedInventoryItem.received_at || selectedInventoryItem.created_at).toLocaleDateString()}
                    </p>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700">Commission Rate</label>
                    <p className="text-sm text-gray-900">{selectedInventoryItem.commission_rate || 0}%</p>
                  </div>
                  {selectedInventoryItem.expiry_date && (
                    <div>
                      <label className="block text-sm font-medium text-gray-700">Expiry Date</label>
                      <p className="text-sm text-gray-900">
                        {new Date(selectedInventoryItem.expiry_date).toLocaleDateString()}
                      </p>
                    </div>
                  )}
                </div>
              </div>
            </div>

            {selectedInventoryItem.notes && (
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Notes</label>
                <p className="text-sm text-gray-900 bg-gray-50 p-3 rounded-md">
                  {selectedInventoryItem.notes}
                </p>
              </div>
            )}

            <div className="flex justify-end">
              <AccessibleButton
                onClick={() => setShowInventoryItemDetails(false)}
                variant="primary"
              >
                Close
              </AccessibleButton>
            </div>
          </div>
        </AccessibleModal>
      )}

      {/* Toast */}
      <Toast
        message={toast.message}
        type={toast.type}
        visible={toast.visible}
        onClose={hideToast}
      />
    </div>
  );
}