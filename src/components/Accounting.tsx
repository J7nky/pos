import React, { useState, useEffect, useMemo } from 'react';
import { useOfflineData } from '../contexts/OfflineDataContext';
import { useSupabaseAuth } from '../contexts/SupabaseAuthContext';
import { useCurrency } from '../hooks/useCurrency';
import SearchableSelect from './common/SearchableSelect';
import { useLocalStorage } from '../hooks/useLocalStorage';
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
import { AccountsReceivable, AccountsPayable } from '../lib/db';

export default function Accounting() {
  const raw = useOfflineData();
  const {
    accountsReceivable,
    accountsPayable,
    addAccountsReceivable,
    updateAccountsReceivable,
    deleteAccountsReceivable,
    addAccountsPayable,
    updateAccountsPayable,
    deleteAccountsPayable,
  } = raw;
  const addExpenseCategory = raw.addExpenseCategory;
  const addTransaction = raw.addTransaction;
  const transactions = raw.transactions.map(t => ({...t, createdAt: t.created_at})) as Array<any>;
  const customers = raw.customers.map(c => ({...c, isActive: c.is_active, createdAt: c.created_at, currentDebt: c.current_debt})) as Array<any>;
  const suppliers = raw.suppliers.map(s => ({...s, isActive: s.is_active, createdAt: s.created_at})) as Array<any>;
  const expenseCategories = raw.expenseCategories.map(c => ({...c, isActive: c.is_active, createdAt: c.created_at})) as Array<any>;
  const inventory = raw.inventory || [];
  const sales = raw.sales || [];
  const products = raw.products || [];
  
  const { userProfile } = useSupabaseAuth();
  
  const { currency, formatCurrency, formatCurrencyWithSymbol, getConvertedAmount } = useCurrency();
  
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

  // Form states
  const [receiveForm, setReceiveForm] = useState({
    customerId: '',
    amount: '',
    currency: currency,
    description: '',
    reference: ''
  });

  const [payForm, setPayForm] = useState({
    supplierId: '',
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

  // Calculate totals
  const totalReceivables = accountsReceivable.reduce((sum, ar) => sum + ar.amountDue, 0);
  const overdueReceivables = accountsReceivable.filter(ar => 
    new Date(ar.dueDate) < new Date() && ar.status !== 'paid'
  );
  const totalPayables = accountsPayable.reduce((sum, ap) => sum + ap.amountDue, 0);
  const overduePayables = accountsPayable.filter(ap => 
    new Date(ap.dueDate) < new Date() && ap.status !== 'paid'
  );

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
    const totalCustomers = customers.filter(c => c.isActive).length;
    const totalSuppliers = suppliers.filter(s => s.isActive).length;
    const customersWithDebt = customers.filter(c => c.currentDebt > 0).length;
    const totalCustomerDebt = customers.reduce((sum, c) => sum + c.currentDebt, 0);
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

  // Filtering, sorting, and pagination state for AR/AP
  const [arStatusFilter, setArStatusFilter] = useState('');
  const [arSort, setArSort] = useState<'dueDate' | 'amount' | 'status'>('dueDate');
  const [arSortDir, setArSortDir] = useState<'asc' | 'desc'>('asc');
  const [arPage, setArPage] = useState(1);
  const AR_PAGE_SIZE = 10;

  const [apStatusFilter, setApStatusFilter] = useState('');
  const [apSort, setApSort] = useState<'dueDate' | 'amount' | 'status'>('dueDate');
  const [apSortDir, setApSortDir] = useState<'asc' | 'desc'>('asc');
  const [apPage, setApPage] = useState(1);
  const AP_PAGE_SIZE = 10;

  // Filtering, sorting, and pagination logic for AR
  const filteredAR = accountsReceivable
    .filter(ar => ((ar.customerName || ar.customer_name || '').toLowerCase().includes(searchTerm.toLowerCase())))
    .filter(ar => !arStatusFilter || ar.status === arStatusFilter)
  ;
  const sortedAR = [...filteredAR].sort((a, b) => {
    if (arSort === 'dueDate') {
      const aDate = new Date(a.dueDate).getTime();
      const bDate = new Date(b.dueDate).getTime();
      return arSortDir === 'asc' ? aDate - bDate : bDate - aDate;
    } else if (arSort === 'amount') {
      return arSortDir === 'asc' ? a.amountDue - b.amountDue : b.amountDue - a.amountDue;
    } else if (arSort === 'status') {
      return arSortDir === 'asc' ? a.status.localeCompare(b.status) : b.status.localeCompare(a.status);
    }
    return 0;
  });
  const arTotalPages = Math.ceil(sortedAR.length / AR_PAGE_SIZE);
  const pagedAR = sortedAR.slice((arPage - 1) * AR_PAGE_SIZE, arPage * AR_PAGE_SIZE);

  // Filtering, sorting, and pagination logic for AP
  const filteredAP = accountsPayable
    .filter(ap => ((ap.supplierName || ap.supplier_name || '').toLowerCase().includes(searchTerm.toLowerCase())))
    .filter(ap => !apStatusFilter || ap.status === apStatusFilter)
  ;
  const sortedAP = [...filteredAP].sort((a, b) => {
    if (apSort === 'dueDate') {
      const aDate = new Date(a.dueDate).getTime();
      const bDate = new Date(b.dueDate).getTime();
      return apSortDir === 'asc' ? aDate - bDate : bDate - aDate;
    } else if (apSort === 'amount') {
      return apSortDir === 'asc' ? a.amountDue - b.amountDue : b.amountDue - a.amountDue;
    } else if (apSort === 'status') {
      return apSortDir === 'asc' ? a.status.localeCompare(b.status) : b.status.localeCompare(a.status);
    }
    return 0;
  });
  const apTotalPages = Math.ceil(sortedAP.length / AP_PAGE_SIZE);
  const pagedAP = sortedAP.slice((apPage - 1) * AP_PAGE_SIZE, apPage * AP_PAGE_SIZE);

  // Form handlers
  const handleReceiveSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    // Validate required fields
    if (!receiveForm.amount || parseFloat(receiveForm.amount) <= 0) {
      showToast('Please enter a valid amount', 'error');
      return;
    }
    
    if (!receiveForm.customerId) {
      showToast('Please select a customer', 'error');
      return;
    }
    
    const customer = customers.find(c => c.id === receiveForm.customerId);
    if (!customer) {
      showToast('Customer not found', 'error');
      return;
    }
    
    try {
      // Use the ERP Financial Service to process the payment
      const { erpFinancialService } = await import('../services/erpFinancialService');
      
      // Sync current customers to ERP service
      localStorage.setItem('erp_customers', JSON.stringify(customers));
      erpFinancialService.reloadData();
      
      const result = erpFinancialService.processCustomerPayment(
        receiveForm.customerId,
        parseFloat(receiveForm.amount),
        receiveForm.currency as 'USD' | 'LBP',
        `Payment from ${customer.name}${receiveForm.description ? ': ' + receiveForm.description : ''}`,
        userProfile?.id || ''
      );
      
      // Update customer balance in main application
      // Store amounts as-is in their original currency, convert only for display
      const paymentAmount = parseFloat(receiveForm.amount);
      const customerDebtInPaymentCurrency = receiveForm.currency === 'LBP' ? 
        customer.currentDebt * 89500 : customer.currentDebt;
      const newDebtInPaymentCurrency = Math.max(0, customerDebtInPaymentCurrency - paymentAmount);
      const newDebtInUSD = receiveForm.currency === 'LBP' ? 
        newDebtInPaymentCurrency / 89500 : newDebtInPaymentCurrency;
      
      await raw.updateCustomer(receiveForm.customerId, { 
        current_debt: newDebtInUSD 
      });
      
      // Also add to legacy transaction system for compatibility
      addTransaction({
        type: 'income',
        category: 'Customer Payment',
        amount: parseFloat(receiveForm.amount),
        currency: receiveForm.currency as 'USD' | 'LBP',
        description: `Payment from ${customer.name}${receiveForm.description ? ': ' + receiveForm.description : ''}`,
        reference: receiveForm.reference,
        created_by: userProfile?.id || ''
      });
      
      showToast(`Payment received! ${customer.name} balance: ${formatCurrency(customerDebtInPaymentCurrency)} → ${formatCurrency(newDebtInPaymentCurrency)}`, 'success');
    } catch (err) {
    console.log(err);
      showToast('Failed to record payment.', 'error');
    }
    
    setReceiveForm({
      customerId: '',
      amount: '',
      currency: currency,
      description: '',
      reference: ''
    });
    setShowForm(null);
  };

  const handlePaySubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    // Validate required fields
    if (!payForm.amount || parseFloat(payForm.amount) <= 0) {
      showToast('Please enter a valid amount', 'error');
      return;
    }
    
    if (!payForm.supplierId) {
      showToast('Please select a supplier', 'error');
      return;
    }
    
    const supplier = suppliers.find(s => s.id === payForm.supplierId);
    if (!supplier) {
      showToast('Supplier not found', 'error');
      return;
    }
    
    try {
      // Use the ERP Financial Service to process the payment
      const { erpFinancialService } = await import('../services/erpFinancialService');
      
      // Sync current suppliers to ERP service
      console.log('Syncing suppliers to ERP service:', suppliers.length, 'suppliers');
      localStorage.setItem('erp_suppliers', JSON.stringify(suppliers));
      erpFinancialService.reloadData();
      console.log('Supplier found for payment:', supplier.name);
      
      const result = erpFinancialService.processSupplierPayment(
        payForm.supplierId,
        parseFloat(payForm.amount),
        payForm.currency as 'USD' | 'LBP',
        `Payment to ${supplier.name}${payForm.description ? ': ' + payForm.description : ''}`,
        userProfile?.id || ''
      );
      
      // Update supplier balance by paying down existing accounts payable
      // Store amounts as-is in their original currency, convert only for display
      const paymentAmount = parseFloat(payForm.amount);
      const supplierPayables = accountsPayable.filter(ap => ap.supplier_id === payForm.supplierId && ap.status !== 'paid');
      
      let remainingPayment = paymentAmount;
      
      // Pay down existing payables first
      for (const payable of supplierPayables) {
        if (remainingPayment <= 0) break;
        
        // Convert payable amounts to payment currency for comparison
        const payableAmountInPaymentCurrency = payForm.currency === 'LBP' ? 
          payable.amountDue * 89500 : payable.amountDue;
        const payablePaidInPaymentCurrency = payForm.currency === 'LBP' ? 
          payable.amountPaid * 89500 : payable.amountPaid;
        
        const paymentAmount = Math.min(remainingPayment, payableAmountInPaymentCurrency);
        const newAmountPaidInPaymentCurrency = payablePaidInPaymentCurrency + paymentAmount;
        const newAmountDueInPaymentCurrency = payableAmountInPaymentCurrency - paymentAmount;
        const newStatus = newAmountDueInPaymentCurrency === 0 ? 'paid' : 'partial';
        
        // Convert back to USD for storage
        const newAmountPaidInUSD = payForm.currency === 'LBP' ? 
          newAmountPaidInPaymentCurrency / 89500 : newAmountPaidInPaymentCurrency;
        const newAmountDueInUSD = payForm.currency === 'LBP' ? 
          newAmountDueInPaymentCurrency / 89500 : newAmountDueInPaymentCurrency;
        
        await updateAccountsPayable(payable.id, {
          amount_paid: newAmountPaidInUSD,
          amount_due: newAmountDueInUSD,
          status: newStatus
        });
        
        remainingPayment -= paymentAmount;
      }
      
      // If there's remaining payment amount (overpayment or payment without prior payables),
      // create a credit entry
      if (remainingPayment > 0) {
        const creditAmountInUSD = payForm.currency === 'LBP' ? 
          remainingPayment / 89500 : remainingPayment;
        
        await addAccountsPayable({
          supplier_id: payForm.supplierId,
          supplier_name: supplier.name,
          invoice_number: `CREDIT-${Date.now()}`,
          amount: creditAmountInUSD,
          amount_paid: creditAmountInUSD,
          amount_due: -creditAmountInUSD, // Negative amount due indicates credit
          due_date: new Date().toISOString().split('T')[0],
          status: 'paid',
          description: `Payment credit to ${supplier.name}${payForm.description ? ': ' + payForm.description : ''}`
        });
      }
      
      // Also add to legacy transaction system for compatibility
      addTransaction({
        type: 'expense',
        category: 'Supplier Payment',
        amount: parseFloat(payForm.amount),
        currency: payForm.currency as 'USD' | 'LBP',
        description: `Payment to ${supplier.name}${payForm.description ? ': ' + payForm.description : ''}`,
        reference: payForm.reference,
        created_by: userProfile?.id || ''
      });
      
      showToast(`Payment sent! ${formatCurrencyWithSymbol(parseFloat(payForm.amount), payForm.currency)} paid to ${supplier.name}`, 'success');
    } catch (err) {
      console.log(err);
      showToast('Failed to record payment.', 'error');
    }
    
    setPayForm({
      supplierId: '',
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
      
      // Also add to legacy transaction system for compatibility
      addTransaction({
        type: 'expense',
        category: category.name,
        amount: parseFloat(expenseForm.amount),
        currency: expenseForm.currency as 'USD' | 'LBP',
        description: expenseForm.description,
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

  // Add edit/delete handlers for AR/AP
  const handleEditReceivable = async (ar: AccountsReceivable) => {
    // For now, just prompt for new amount (future: modal form)
    const newAmount = prompt('Edit amount:', String(ar.amount_due));
    if (newAmount !== null) {
      try {
        await updateAccountsReceivable(ar.id, { amount_due: parseFloat(newAmount) });
        showToast('Receivable updated!', 'success');
      } catch {
        showToast('Failed to update receivable.', 'error');
      }
    }
  };
  const handleDeleteReceivable = async (ar: AccountsReceivable) => {
    if (window.confirm('Delete this receivable?')) {
      try {
        await deleteAccountsReceivable(ar.id);
        showToast('Receivable deleted!', 'success');
      } catch {
        showToast('Failed to delete receivable.', 'error');
      }
    }
  };
  const handleEditPayable = async (ap: AccountsPayable) => {
    const newAmount = prompt('Edit amount:', String(ap.amount_due));
    if (newAmount !== null) {
      try {
        await updateAccountsPayable(ap.id, { amount_due: parseFloat(newAmount) });
        showToast('Payable updated!', 'success');
      } catch {
        showToast('Failed to update payable.', 'error');
      }
    }
  };
  const handleDeletePayable = async (ap: AccountsPayable) => {
    if (window.confirm('Delete this payable?')) {
      try {
        await deleteAccountsPayable(ap.id);
        showToast('Payable deleted!', 'success');
      } catch {
        showToast('Failed to delete payable.', 'error');
      }
    }
  };

  // --- ReceivablesTable component ---
  function ReceivablesTable({
    data, page, totalPages, onPageChange, onEdit, onDelete, statusFilter, onStatusFilter, sort, sortDir, onSort, searchTerm
  }: {
    data: AccountsReceivable[];
    page: number;
    totalPages: number;
    onPageChange: (page: number) => void;
    onEdit: (ar: AccountsReceivable) => void;
    onDelete: (ar: AccountsReceivable) => void;
    statusFilter: string;
    onStatusFilter: (status: string) => void;
    sort: 'dueDate' | 'amount' | 'status';
    sortDir: 'asc' | 'desc';
    onSort: (sort: 'dueDate' | 'amount' | 'status') => void;
    searchTerm: string;
  }) {
    return (
      <div className="bg-white rounded-lg shadow-sm">
        <div className="p-6 border-b">
          <h2 className="text-lg font-semibold text-gray-900">Accounts Receivable</h2>
        </div>
        <div className="overflow-x-auto">
          <div className="flex flex-wrap gap-2 mb-2">
            <select value={statusFilter} onChange={e => { onStatusFilter(e.target.value); onPageChange(1); }} className="border rounded px-2 py-1">
              <option value="">All Statuses</option>
              <option value="pending">Pending</option>
              <option value="paid">Paid</option>
              <option value="overdue">Overdue</option>
              <option value="partial">Partial</option>
            </select>
            <button onClick={() => onSort('dueDate')} className={`border rounded px-2 py-1 ${sort === 'dueDate' ? 'font-bold' : ''}`}>Due Date {sort === 'dueDate' ? (sortDir === 'asc' ? '↑' : '↓') : ''}</button>
            <button onClick={() => onSort('amount')} className={`border rounded px-2 py-1 ${sort === 'amount' ? 'font-bold' : ''}`}>Amount {sort === 'amount' ? (sortDir === 'asc' ? '↑' : '↓') : ''}</button>
            <button onClick={() => onSort('status')} className={`border rounded px-2 py-1 ${sort === 'status' ? 'font-bold' : ''}`}>Status {sort === 'status' ? (sortDir === 'asc' ? '↑' : '↓') : ''}</button>
          </div>
          <table className="w-full">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Customer</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Invoice</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Amount</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Due Date</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Status</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200">
              {data.length === 0 ? (
                <tr><td colSpan={6} className="text-center text-gray-500 py-8">
                  <div className="flex flex-col items-center">
                    <AlertCircle className="w-8 h-8 text-gray-400 mb-2" aria-label="No receivables" />
                    <span className="font-semibold">No receivables found</span>
                    <span className="text-sm text-gray-400">Try adjusting your filters or add a new receivable.</span>
                  </div>
                </td></tr>
              ) : data.map(ar => (
                <tr key={ar.id} className="hover:bg-gray-50">
                  <td className="px-6 py-4 text-gray-900">{ar.customer_name}</td>
                  <td className="px-6 py-4 text-gray-900">{ar.invoice_number}</td>
                  <td className="px-6 py-4 text-gray-900">${ar.amount_due.toFixed(2)}</td>
                  <td className="px-6 py-4 text-gray-900">
                    {new Date(ar.due_date).toLocaleDateString()}
                    {ar.status === 'overdue' && (
                      <span className="ml-2 text-xs text-red-700 font-semibold" aria-label="Days overdue">
                        ({Math.max(0, Math.floor((Date.now() - new Date(ar.due_date).getTime()) / (1000 * 60 * 60 * 24)))} days overdue)
                      </span>
                    )}
                  </td>
                  <td className="px-6 py-4">
                    <span className={`px-2 py-1 text-xs rounded-full flex items-center w-fit ${getStatusColor(ar.status)}`} aria-label={`Status: ${ar.status}`}>
                      {getStatusIcon(ar.status)}
                      <span className="ml-1 capitalize">{ar.status}</span>
                    </span>
                  </td>
                  <td className="px-6 py-4">
                    <div className="flex space-x-2">
                      <button className="text-blue-600 hover:text-blue-800" onClick={() => onEdit(ar)}>
                        <Edit className="w-4 h-4" />
                      </button>
                      <button className="text-red-600 hover:text-red-800" onClick={() => onDelete(ar)}>
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <div className="flex justify-end gap-2 mt-2">
            <button disabled={page === 1} onClick={() => onPageChange(Math.max(1, page - 1))} className="px-2 py-1 border rounded disabled:opacity-50">Prev</button>
            <span>Page {page} of {totalPages || 1}</span>
            <button disabled={page === totalPages || totalPages === 0} onClick={() => onPageChange(Math.min(totalPages, page + 1))} className="px-2 py-1 border rounded disabled:opacity-50">Next</button>
          </div>
        </div>
      </div>
    );
  }

  // --- PayablesTable component ---
  function PayablesTable({
    data, page, totalPages, onPageChange, onEdit, onDelete, statusFilter, onStatusFilter, sort, sortDir, onSort, searchTerm
  }: {
    data: AccountsPayable[];
    page: number;
    totalPages: number;
    onPageChange: (page: number) => void;
    onEdit: (ap: AccountsPayable) => void;
    onDelete: (ap: AccountsPayable) => void;
    statusFilter: string;
    onStatusFilter: (status: string) => void;
    sort: 'dueDate' | 'amount' | 'status';
    sortDir: 'asc' | 'desc';
    onSort: (sort: 'dueDate' | 'amount' | 'status') => void;
    searchTerm: string;
  }) {
    return (
      <div className="bg-white rounded-lg shadow-sm">
        <div className="p-6 border-b">
          <h2 className="text-lg font-semibold text-gray-900">Accounts Payable</h2>
        </div>
        <div className="overflow-x-auto">
          <div className="flex flex-wrap gap-2 mb-2">
            <select value={statusFilter} onChange={e => { onStatusFilter(e.target.value); onPageChange(1); }} className="border rounded px-2 py-1">
              <option value="">All Statuses</option>
              <option value="pending">Pending</option>
              <option value="paid">Paid</option>
              <option value="overdue">Overdue</option>
              <option value="partial">Partial</option>
            </select>
            <button onClick={() => onSort('dueDate')} className={`border rounded px-2 py-1 ${sort === 'dueDate' ? 'font-bold' : ''}`}>Due Date {sort === 'dueDate' ? (sortDir === 'asc' ? '↑' : '↓') : ''}</button>
            <button onClick={() => onSort('amount')} className={`border rounded px-2 py-1 ${sort === 'amount' ? 'font-bold' : ''}`}>Amount {sort === 'amount' ? (sortDir === 'asc' ? '↑' : '↓') : ''}</button>
            <button onClick={() => onSort('status')} className={`border rounded px-2 py-1 ${sort === 'status' ? 'font-bold' : ''}`}>Status {sort === 'status' ? (sortDir === 'asc' ? '↑' : '↓') : ''}</button>
          </div>
          <table className="w-full">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Supplier</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Invoice</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Amount</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Due Date</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Status</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200">
              {data.length === 0 ? (
                <tr><td colSpan={6} className="text-center text-gray-500 py-8">
                  <div className="flex flex-col items-center">
                    <AlertCircle className="w-8 h-8 text-gray-400 mb-2" aria-label="No payables" />
                    <span className="font-semibold">No payables found</span>
                    <span className="text-sm text-gray-400">Try adjusting your filters or add a new payable.</span>
                  </div>
                </td></tr>
              ) : data.map(ap => (
                <tr key={ap.id} className="hover:bg-gray-50">
                  <td className="px-6 py-4 text-gray-900">{ap.supplier_name}</td>
                  <td className="px-6 py-4 text-gray-900">{ap.invoice_number}</td>
                  <td className="px-6 py-4 text-gray-900">${ap.amount_due.toFixed(2)}</td>
                  <td className="px-6 py-4 text-gray-900">
                    {new Date(ap.due_date).toLocaleDateString()}
                    {ap.status === 'overdue' && (
                      <span className="ml-2 text-xs text-red-700 font-semibold" aria-label="Days overdue">
                        ({Math.max(0, Math.floor((Date.now() - new Date(ap.due_date).getTime()) / (1000 * 60 * 60 * 24)))} days overdue)
                      </span>
                    )}
                  </td>
                  <td className="px-6 py-4">
                    <span className={`px-2 py-1 text-xs rounded-full flex items-center w-fit ${getStatusColor(ap.status)}`} aria-label={`Status: ${ap.status}`}>
                      {getStatusIcon(ap.status)}
                      <span className="ml-1 capitalize">{ap.status}</span>
                    </span>
                  </td>
                  <td className="px-6 py-4">
                    <div className="flex space-x-2">
                      <button className="text-blue-600 hover:text-blue-800" onClick={() => onEdit(ap)}>
                        <Edit className="w-4 h-4" />
                      </button>
                      <button className="text-red-600 hover:text-red-800" onClick={() => onDelete(ap)}>
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <div className="flex justify-end gap-2 mt-2">
            <button disabled={page === 1} onClick={() => onPageChange(Math.max(1, page - 1))} className="px-2 py-1 border rounded disabled:opacity-50">Prev</button>
            <span>Page {page} of {totalPages || 1}</span>
            <button disabled={page === totalPages || totalPages === 0} onClick={() => onPageChange(Math.min(totalPages, page + 1))} className="px-2 py-1 border rounded disabled:opacity-50">Next</button>
          </div>
        </div>
      </div>
    );
  }

  // Add to Accounting component state:
  const [nonPricedItems, setNonPricedItems] = useState<any[]>([]);
  const [showEditNonPriced, setShowEditNonPriced] = useState<any | null>(null);
  const [nonPricedSearch, setNonPricedSearch] = useState('');
  const [nonPricedSort, setNonPricedSort] = useState<'customer'|'product'|'date'|'value'>('date');
  const [nonPricedSortDir, setNonPricedSortDir] = useState<'asc'|'desc'>('desc');
  const [nonPricedPage, setNonPricedPage] = useState(1);

  const [selectedNonPriced, setSelectedNonPriced] = useState<string[]>([]);
  const [showBulkActions, setShowBulkActions] = useState(false);
  const NON_PRICED_PAGE_SIZE = 10;

  // Load non-priced items from localStorage
  useEffect(() => {
    const key = 'erp_non_priced_items';
    setNonPricedItems(JSON.parse(localStorage.getItem(key) || '[]'));
  }, [showEditNonPriced, activeTab]);

  const handleEditNonPriced = (item: any) => setShowEditNonPriced(item);
  const handleSaveNonPriced = async (updated: any) => {
    if (!updated.unitPrice || updated.unitPrice <= 0) {
      showToast('Please enter a valid unit price', 'error');
      return;
    }
    if (!updated.quantity || updated.quantity <= 0) {
      showToast('Please enter a valid quantity', 'error');
      return;
    }
    
    const key = 'erp_non_priced_items';
    const items = JSON.parse(localStorage.getItem(key) || '[]');
    const newItems = items.map((i: any) => i.id === updated.id ? { ...updated, updatedAt: new Date().toISOString() } : i);
    localStorage.setItem(key, JSON.stringify(newItems));
    setShowEditNonPriced(null);
    setNonPricedItems(newItems);
    showToast('Item updated successfully', 'success');
  };
  
  const handleMarkPriced = async (item: any) => {
    if (!item.unitPrice || item.unitPrice <= 0) {
      showToast('Set a valid price before marking as priced.', 'error');
      return;
    }
    if (!item.quantity || item.quantity <= 0) {
      showToast('Set a valid quantity before marking as priced.', 'error');
      return;
    }
    
    const key = 'erp_non_priced_items';
    const items = JSON.parse(localStorage.getItem(key) || '[]');
    const newItems = items.filter((i: any) => i.id !== item.id);
    localStorage.setItem(key, JSON.stringify(newItems));
    setNonPricedItems(newItems);
    
    // Add to receivables
    const totalAmount = item.unitPrice * (item.weight || item.quantity);
    try {
      const customer = customers.find(c => c.id === item.customerId);
      if (customer) {
        await addAccountsReceivable({
          customer_id: item.customerId,
          customer_name: customer.name,
          invoice_number: 'NP-' + item.id.slice(-6).toUpperCase(),
          amount: totalAmount,
          amount_paid: 0,
          amount_due: totalAmount,
          due_date: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0], // 30 days from now
          status: 'pending',
          description: `${item.productName} (${item.weight || item.quantity} ${item.weight ? 'kg' : 'units'})`,
        });
        showToast('Moved to receivables successfully!', 'success');
      } else {
        showToast('Customer not found', 'error');
      }
    } catch (error) {
      showToast('Failed to move to receivables', 'error');
    }
  };

  const handleBulkMarkPriced = async () => {
    const validItems = selectedNonPriced
      .map(id => nonPricedItems.find(item => item.id === id))
      .filter(item => item && item.unitPrice > 0 && item.quantity > 0);
    
    if (validItems.length === 0) {
      showToast('No valid items selected (items must have price and quantity)', 'error');
      return;
    }
    
    for (const item of validItems) {
      await handleMarkPriced(item);
    }
    setSelectedNonPriced([]);
    setShowBulkActions(false);
  };

  const handleDeleteNonPriced = (item: any) => {
    if (window.confirm('Are you sure you want to delete this item?')) {
      const key = 'erp_non_priced_items';
      const items = JSON.parse(localStorage.getItem(key) || '[]');
      const newItems = items.filter((i: any) => i.id !== item.id);
      localStorage.setItem(key, JSON.stringify(newItems));
      setNonPricedItems(newItems);
      showToast('Item deleted successfully', 'success');
    }
  };

  const handleBulkDelete = () => {
    if (window.confirm(`Are you sure you want to delete ${selectedNonPriced.length} items?`)) {
      const key = 'erp_non_priced_items';
      const items = JSON.parse(localStorage.getItem(key) || '[]');
      const newItems = items.filter((i: any) => !selectedNonPriced.includes(i.id));
      localStorage.setItem(key, JSON.stringify(newItems));
      setNonPricedItems(newItems);
      setSelectedNonPriced([]);
      setShowBulkActions(false);
      showToast('Items deleted successfully', 'success');
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
        item.unitPrice || '',
        item.unitPrice && (item.weight || item.quantity) ? (item.unitPrice * (item.weight || item.quantity)).toFixed(2) : '',
        item.date ? new Date(item.date).toLocaleDateString() : '',
        (item.notes || '').replace(/,/g, ';')
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
    .map(item => ({
      ...item,
      customerName: customers.find(c => c.id === item.customerId)?.name || item.customerId,
      supplierName: suppliers.find(s => s.id === item.supplierId)?.name || item.supplierName || 'Unknown',
      date: item.createdAt || '',
      totalValue: item.unitPrice && (item.weight || item.quantity) ? item.unitPrice * (item.weight || item.quantity) : 0,
      status: item.unitPrice > 0 && (item.quantity > 0 || item.weight > 0) ? 'ready' : 'incomplete'
    }))
    .filter(item => {
      const q = nonPricedSearch.toLowerCase();
      return (
        item.customerName.toLowerCase().includes(q) ||
        item.productName.toLowerCase().includes(q) ||
        item.supplierName.toLowerCase().includes(q) ||
        (item.notes || '').toLowerCase().includes(q)
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
        notes: item.notes,
        transactionType: 'inventory'
      });
    });

    // Add sales transaction logs
    sales.forEach(sale => {
      sale.items?.forEach((saleItem: any) => {
        const product = products.find(p => p.id === saleItem.productId);
        const supplier = suppliers.find(s => s.id === saleItem.supplierId);
        const customer = customers.find(c => c.id === sale.customer_id);
        
        logs.push({
          id: `sale-${sale.id}-${saleItem.id}`,
          type: 'sale',
          date: sale.created_at,
          productId: saleItem.productId,
          productName: product?.name || saleItem.productName || 'Unknown Product',
          supplierId: saleItem.supplierId,
          supplierName: supplier?.name || saleItem.supplierName || 'Unknown Supplier',
          customerId: sale.customer_id,
          customerName: customer?.name || 'Walk-in Customer',
          quantity: saleItem.quantity,
          weight: saleItem.weight,
          unitPrice: saleItem.unitPrice,
          totalPrice: saleItem.totalPrice,
          amount: saleItem.totalPrice,
          currency: 'USD',
          description: `Sold ${saleItem.quantity} ${saleItem.weight ? `(${saleItem.weight} kg)` : ''} of ${product?.name || saleItem.productName || 'Unknown Product'} to ${customer?.name || 'Walk-in Customer'}`,
          reference: `SALE-${sale.id.slice(-8)}`,
          notes: saleItem.notes,
          transactionType: 'sale',
          paymentMethod: sale.payment_method,
          saleStatus: sale.status
        });
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
        (log.notes || '').replace(/,/g, ';')
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
  const [showReceivedBillSalesLogs, setShowReceivedBillSalesLogs] = useState(false);

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
          sale.items && Array.isArray(sale.items) && 
          sale.items.some((saleItem: any) => 
            saleItem.productId === item.product_id && 
            saleItem.supplierId === item.supplier_id &&
            // Check if this sale happened after this inventory item was received
            new Date(sale.created_at || sale.createdAt).getTime() >= new Date(item.received_at || item.created_at).getTime()
          )
        );

        // Calculate total sold quantity and revenue for this specific inventory item
        let totalSoldQuantity = 0;
        let totalRevenue = 0;
        let saleCount = 0;
        
        // Sort sales by date to process them chronologically
        const sortedSales = relatedSales.sort((a, b) => 
          new Date(a.created_at || a.createdAt).getTime() - new Date(b.created_at || b.createdAt).getTime()
        );
        
        // Track how much we've sold from this specific inventory item
        // We need to calculate the original quantity by adding back what was sold
        let totalSoldFromThisItem = 0;
        
        for (const sale of sortedSales) {
          if (sale.items && Array.isArray(sale.items)) {
            for (const saleItem of sale.items) {
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

  const handleConfirmCloseBill = async () => {
    if (!closingBill) return;

    try {
      // Calculate commission and supplier payment
      const commissionAmount = (closingBill.totalRevenue * closingBill.commissionRate) / 100;
      const supplierPayment = closingBill.totalRevenue - commissionAmount;

      // Create accounts payable for supplier
      const payableData = {
        supplier_id: closingBill.supplierId,
        supplier_name: closingBill.supplierName,
        invoice_number: `BILL-${closingBill.inventoryItemId.slice(-8)}`,
        amount: supplierPayment,
        amount_paid: 0,
        amount_due: supplierPayment,
        due_date: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(), // 30 days from now
        status: 'pending' as const,
        description: `Commission bill for ${closingBill.productName} - ${closingBill.soldQuantity} units sold`
      };

      await addAccountsPayable(payableData);

      // Add commission transaction
      await addTransaction({
        type: 'expense',
        category: 'Commission',
        amount: commissionAmount,
        currency: 'USD',
        description: `Commission fee for ${closingBill.productName} sold on behalf of ${closingBill.supplierName}`,
        reference: `COMM-${closingBill.inventoryItemId.slice(-8)}`,
        created_by: userProfile?.id || ''
      });

      // Add supplier payment transaction
      await addTransaction({
        type: 'expense',
        category: 'Supplier Payment',
        amount: supplierPayment,
        currency: 'USD',
        description: `Payment to ${closingBill.supplierName} for ${closingBill.productName} sales`,
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

        const payableData = {
          supplier_id: bill.supplierId,
          supplier_name: bill.supplierName,
          invoice_number: `BILL-${bill.inventoryItemId.slice(-8)}`,
          amount: supplierPayment,
          amount_paid: 0,
          amount_due: supplierPayment,
          due_date: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
          status: 'pending' as const,
          description: `Commission bill for ${bill.productName} - ${bill.soldQuantity} units sold`
        };

        await addAccountsPayable(payableData);
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
      // Get all inventory items (both commission and cash)
      const allInventoryItems = inventory.filter(item => 
        item.product_id && 
        item.supplier_id
      );
      
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
          sale.items && Array.isArray(sale.items) && 
          sale.items.some((saleItem: any) => 
            saleItem.productId === item.product_id && 
            saleItem.supplierId === item.supplier_id &&
            // Check if this sale happened after this inventory item was received
            new Date(sale.created_at || sale.createdAt).getTime() >= new Date(item.received_at || item.created_at).getTime()
          )
        );

        // Calculate total sold quantity and revenue for this specific inventory item
        let totalSoldQuantity = 0;
        let totalRevenue = 0;
        let saleCount = 0;
        
        // Sort sales by date to process them chronologically
        const sortedSales = relatedSales.sort((a, b) => 
          new Date(a.created_at || a.createdAt).getTime() - new Date(b.created_at || b.createdAt).getTime()
        );
        
        // Track how much we've sold from this specific inventory item
        let totalSoldFromThisItem = 0;
        
        for (const sale of sortedSales) {
          if (sale.items && Array.isArray(sale.items)) {
            for (const saleItem of sale.items) {
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
        const progress = originalReceivedQuantity > 0 ? (originalReceivedQuantity-remainingQuantity) : 0;
        
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
          status,
          saleCount,
          receivedAt: item.received_at || item.created_at,
          receivedBy: item.received_by,
          notes: item.notes,
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

  const handleViewReceivedBillSalesLogs = (bill: any) => {
    setSelectedReceivedBill(bill);
    setShowReceivedBillSalesLogs(true);
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
          { id: 'customer-balances', label: 'Customer Balances', icon: Users },
          { id: 'supplier-balances', label: 'Supplier Balances', icon: Building2 },
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
                  <p className="text-2xl font-bold text-gray-900">{formatCurrency(customers.filter(c => c.currentDebt > 0).reduce((sum, c) => sum + c.currentDebt, 0))}</p>
                  <div className="flex items-center mt-2">
                    <Users className="w-4 h-4 text-blue-500 mr-1" />
                    <span className="text-sm font-medium text-blue-600">{customers.filter(c => c.currentDebt > 0).length}</span>
                    <span className="text-xs text-gray-500 ml-1">customers with debt</span>
                  </div>
                </div>
                <div className="p-3 bg-green-100 rounded-full">
                  <Wallet className="w-6 h-6 text-green-600" />
                </div>
              </div>
            </div>

            <div className="bg-white rounded-xl shadow-sm p-6 border-l-4 border-purple-500">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-gray-600 font-medium">Active Suppliers</p>
                  <p className="text-2xl font-bold text-gray-900">{suppliers.filter(s => s.isActive).length}</p>
                  <div className="flex items-center mt-2">
                    <Award className="w-4 h-4 text-purple-500 mr-1" />
                    <span className="text-sm font-medium text-purple-600">{suppliers.filter(s => s.isActive && s.type === 'commission').length}</span>
                    <span className="text-xs text-gray-500 ml-1">commission based</span>
                  </div>
                </div>
                <div className="p-3 bg-purple-100 rounded-full">
                  <Building2 className="w-6 h-6 text-purple-600" />
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
                        <ArrowUpRight className={`w-4 h-4 ${transaction.type === 'income' ? 'text-green-600' : 'text-red-600'}`} />
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



      {activeTab === 'customer-balances' && (
        <div className="space-y-6">
          <div className="flex justify-between items-center">
            <h2 className="text-xl font-semibold text-gray-900">Customer Balances</h2>
            <button
              onClick={() => setShowForm('receive')}
              className="bg-green-600 text-white px-4 py-2 rounded-lg hover:bg-green-700 transition-colors flex items-center"
            >
              <Plus className="w-5 h-5 mr-2" />
              Record Payment
            </button>
          </div>

          {/* Search */}
          <div className="bg-white p-4 rounded-lg shadow-sm">
            <div className="relative">
              <Search className="w-5 h-5 absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400" />
              <input
                type="text"
                placeholder="Search customers..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-blue-500 focus:border-blue-500"
              />
            </div>
          </div>

          {/* Customer Balances Table */}
          <div className="bg-white rounded-lg shadow-sm">
            <div className="p-6 border-b">
              <h3 className="text-lg font-semibold text-gray-900">Customer Account Balances</h3>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Customer</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Contact</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Current Balance</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Status</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Last Transaction</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-200">
                  {customers
                    .filter(customer => customer.name.toLowerCase().includes(searchTerm.toLowerCase()))
                    .filter(customer => customer.isActive)
                    .sort((a, b) => b.currentDebt - a.currentDebt)
                    .map(customer => (
                    <tr key={customer.id} className="hover:bg-gray-50">
                      <td className="px-6 py-4">
                        <div className="flex items-center">
                          <div className="w-10 h-10 bg-blue-100 rounded-full flex items-center justify-center mr-3">
                            <Users className="w-5 h-5 text-blue-600" />
                          </div>
                          <div>
                            <div className="text-sm font-medium text-gray-900">{customer.name}</div>
                            <div className="text-sm text-gray-500">Customer ID: {customer.id.slice(-8)}</div>
                          </div>
                        </div>
                      </td>
                      <td className="px-6 py-4">
                        <div className="text-sm text-gray-900">{customer.phone || 'N/A'}</div>
                        <div className="text-sm text-gray-500">{customer.email || 'No email'}</div>
                      </td>
                      <td className="px-6 py-4">
                        <div className={`text-lg font-semibold ${customer.currentDebt > 0 ? 'text-red-600' : customer.currentDebt < 0 ? 'text-green-600' : 'text-gray-900'}`}>
                          {formatCurrency(Math.abs(customer.currentDebt))}
                        </div>
                        <div className="text-xs text-gray-500">
                          {customer.currentDebt > 0 ? 'Owes money' : customer.currentDebt < 0 ? 'Credit balance' : 'Balanced'}
                        </div>
                      </td>
                      <td className="px-6 py-4">
                        <span className={`px-2 py-1 text-xs rounded-full ${
                          (currency === 'LBP' ? customer.currentDebt * 89500 : customer.currentDebt) > 1000 ? 'bg-red-100 text-red-800' :
                          customer.currentDebt > 0 ? 'bg-yellow-100 text-yellow-800' :
                          customer.currentDebt < 0 ? 'bg-green-100 text-green-800' :
                          'bg-gray-100 text-gray-800'
                        }`}>
                          {(currency === 'LBP' ? customer.currentDebt * 89500 : customer.currentDebt) > 1000 ? 'High Debt' :
                           customer.currentDebt > 0 ? 'Has Debt' :
                           customer.currentDebt < 0 ? 'Credit' :
                           'Balanced'}
                        </span>
                      </td>
                      <td className="px-6 py-4 text-sm text-gray-500">
                        {customer.createdAt ? new Date(customer.createdAt).toLocaleDateString() : 'N/A'}
                      </td>
                      <td className="px-6 py-4">
                        <div className="flex space-x-2">
                                                     <button 
                             onClick={() => {
                               setReceiveForm(prev => ({ ...prev, customerId: customer.id }));
                               setShowForm('receive');
                             }}
                             className="text-green-600 hover:text-green-800"
                             title="Record payment"
                           >
                            <DollarSign className="w-4 h-4" />
                          </button>
                          <button className="text-blue-600 hover:text-blue-800" title="View details">
                            <Eye className="w-4 h-4" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* Summary Cards */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <div className="bg-white rounded-lg shadow-sm p-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-gray-600">Total Customer Debt</p>
                  <p className="text-2xl font-bold text-red-600">
                    {formatCurrency(customers.filter(c => c.currentDebt > 0).reduce((sum, c) => sum + c.currentDebt, 0))}
                  </p>
                </div>
                <AlertTriangle className="w-8 h-8 text-red-500" />
              </div>
            </div>

            <div className="bg-white rounded-lg shadow-sm p-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-gray-600">Customers with Debt</p>
                  <p className="text-2xl font-bold text-gray-900">
                    {customers.filter(c => c.currentDebt > 0).length}
                  </p>
                </div>
                <Users className="w-8 h-8 text-blue-500" />
              </div>
            </div>

            <div className="bg-white rounded-lg shadow-sm p-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-gray-600">Average Debt per Customer</p>
                  <p className="text-2xl font-bold text-gray-900">
                    {formatCurrency(customers.filter(c => c.currentDebt > 0).length > 0 ? 
                      customers.filter(c => c.currentDebt > 0).reduce((sum, c) => sum + c.currentDebt, 0) / 
                      customers.filter(c => c.currentDebt > 0).length : 0)}
                  </p>
                </div>
                <Target className="w-8 h-8 text-purple-500" />
              </div>
            </div>
          </div>
        </div>
      )}

      {activeTab === 'supplier-balances' && (
        <div className="space-y-6">
          <div className="flex justify-between items-center">
            <h2 className="text-xl font-semibold text-gray-900">Supplier Balances</h2>
            <button
              onClick={() => setShowForm('pay')}
              className="bg-red-600 text-white px-4 py-2 rounded-lg hover:bg-red-700 transition-colors flex items-center"
            >
              <Plus className="w-5 h-5 mr-2" />
              Make Payment
            </button>
          </div>

          {/* Search */}
          <div className="bg-white p-4 rounded-lg shadow-sm">
            <div className="relative">
              <Search className="w-5 h-5 absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400" />
              <input
                type="text"
                placeholder="Search suppliers..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-blue-500 focus:border-blue-500"
              />
            </div>
          </div>

          {/* Supplier Balances Table */}
          <div className="bg-white rounded-lg shadow-sm">
            <div className="p-6 border-b">
              <h3 className="text-lg font-semibold text-gray-900">Supplier Account Balances</h3>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Supplier</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Current Balance</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Contact</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Balance Status</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Last Transaction</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-200">
                  {suppliers
                    .filter(supplier => supplier.name.toLowerCase().includes(searchTerm.toLowerCase()))
                    .filter(supplier => supplier.isActive)
                    .sort((a, b) => a.name.localeCompare(b.name))
                    .map(supplier => (
                    <tr key={supplier.id} className="hover:bg-gray-50">
                      <td className="px-6 py-4">
                        <div className="flex items-center">
                          <div className={`w-10 h-10 rounded-full flex items-center justify-center mr-3 ${
                            supplier.type === 'commission' ? 'bg-purple-100' : 'bg-blue-100'
                          }`}>
                            <Building2 className={`w-5 h-5 ${
                              supplier.type === 'commission' ? 'text-purple-600' : 'text-blue-600'
                            }`} />
                          </div>
                          <div>
                            <div className="text-sm font-medium text-gray-900">{supplier.name}</div>
                            <div className="text-sm text-gray-500">
                              {supplier.type === 'commission' ? 'Commission' : 'Cash'} • ID: {supplier.id.slice(-8)}
                            </div>
                          </div>
                        </div>
                      </td>
                      <td className="px-6 py-4">
                        {(() => {
                          // Calculate current balance owed to this supplier (including credits)
                          // amounts are stored in USD, formatCurrency will convert to display currency
                          const supplierPayables = accountsPayable.filter(ap => ap.supplier_id === supplier.id);
                          const totalOwed = supplierPayables.reduce((sum, ap) => sum + ap.amountDue, 0);
                          
                          return (
                            <div>
                              <div className={`text-lg font-semibold ${
                                totalOwed > 0 ? 'text-red-600' : 
                                totalOwed < 0 ? 'text-green-600' : 
                                'text-gray-900'
                              }`}>
                                {formatCurrency(Math.abs(totalOwed))}
                              </div>
                              <div className="text-xs text-gray-500">
                                {totalOwed > 0 ? 'Amount owed' : 
                                 totalOwed < 0 ? 'Credit balance' : 
                                 'No outstanding balance'}
                              </div>
                            </div>
                          );
                        })()}
                      </td>
                      <td className="px-6 py-4">
                        <div className="text-sm text-gray-900">{supplier.phone || 'N/A'}</div>
                        <div className="text-sm text-gray-500">{supplier.email || 'No email'}</div>
                      </td>
                      <td className="px-6 py-4">
                        {(() => {
                          // amounts are stored in USD, convert to display currency for status logic
                          const supplierPayables = accountsPayable.filter(ap => ap.supplier_id === supplier.id);
                          const totalOwedInUSD = supplierPayables.reduce((sum, ap) => sum + ap.amountDue, 0);
                          const totalOwedInDisplayCurrency = currency === 'LBP' ? 
                            totalOwedInUSD * 89500 : totalOwedInUSD;
                          
                          return (
                            <div>
                              <span className={`px-2 py-1 text-xs rounded-full ${
                                totalOwedInDisplayCurrency > 5000 ? 'bg-red-100 text-red-800' :
                                totalOwedInDisplayCurrency > 0 ? 'bg-yellow-100 text-yellow-800' :
                                totalOwedInDisplayCurrency < 0 ? 'bg-green-100 text-green-800' :
                                'bg-gray-100 text-gray-800'
                              }`}>
                                {totalOwedInDisplayCurrency > 5000 ? 'High Balance' :
                                 totalOwedInDisplayCurrency > 0 ? 'Has Balance' :
                                 totalOwedInDisplayCurrency < 0 ? 'Credit' :
                                 'Balanced'}
                              </span>
                              <div className="text-xs text-gray-500 mt-1">
                                {supplier.type === 'commission' ? 'Commission' : 'Cash'} • {supplier.isActive ? 'Active' : 'Inactive'}
                              </div>
                            </div>
                          );
                        })()}
                      </td>
                      <td className="px-6 py-4 text-sm text-gray-500">
                        {supplier.createdAt ? new Date(supplier.createdAt).toLocaleDateString() : 'N/A'}
                      </td>
                      <td className="px-6 py-4">
                        <div className="flex space-x-2">
                                                     <button 
                             onClick={() => {
                               setPayForm(prev => ({ ...prev, supplierId: supplier.id }));
                               setShowForm('pay');
                             }}
                             className="text-red-600 hover:text-red-800"
                             title="Make payment"
                           >
                            <CreditCard className="w-4 h-4" />
                          </button>
                          <button className="text-blue-600 hover:text-blue-800" title="View details">
                            <Eye className="w-4 h-4" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* Summary Cards */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <div className="bg-white rounded-lg shadow-sm p-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-gray-600">Total Amount Owed</p>
                  <p className="text-2xl font-bold text-red-600">
                    {formatCurrency(Math.max(0, accountsPayable.reduce((sum, ap) => sum + ap.amountDue, 0)))}
                  </p>
                </div>
                <AlertTriangle className="w-8 h-8 text-red-500" />
              </div>
            </div>

            <div className="bg-white rounded-lg shadow-sm p-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-gray-600">Suppliers with Non-Zero Balance</p>
                  <p className="text-2xl font-bold text-gray-900">
                    {(() => {
                      const suppliersWithBalance = suppliers.filter(s => {
                        const supplierPayables = accountsPayable.filter(ap => ap.supplier_id === s.id);
                        const totalOwed = supplierPayables.reduce((sum, ap) => sum + ap.amountDue, 0);
                        return totalOwed !== 0; // Include both debt and credit balances
                      });
                      return suppliersWithBalance.length;
                    })()}
                  </p>
                </div>
                <Building2 className="w-8 h-8 text-blue-500" />
              </div>
            </div>

            <div className="bg-white rounded-lg shadow-sm p-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-gray-600">Average Debt per Supplier</p>
                  <p className="text-2xl font-bold text-gray-900">
                    {(() => {
                      const suppliersWithDebt = suppliers.filter(s => {
                        const supplierPayables = accountsPayable.filter(ap => ap.supplier_id === s.id);
                        const totalOwed = supplierPayables.reduce((sum, ap) => sum + ap.amountDue, 0);
                        return totalOwed > 0; // Only positive balances for average debt calculation
                      });
                      const totalOwed = Math.max(0, accountsPayable.reduce((sum, ap) => sum + ap.amountDue, 0));
                      return formatCurrency(suppliersWithDebt.length > 0 ? totalOwed / suppliersWithDebt.length : 0);
                    })()}
                  </p>
                </div>
                <Target className="w-8 h-8 text-purple-500" />
              </div>
            </div>
          </div>
        </div>
      )}

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
              {expenseCategories.filter(c => c.isActive).map(category => {
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
                placeholder="Search by customer, product, supplier, or notes..."
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
                  ) : pagedNonPricedItems.map(item => (
                    <tr key={item.id} className="hover:bg-gray-50">
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
                        <span className={`px-2 py-1 text-xs rounded-full ${
                          item.status === 'ready' 
                            ? 'bg-green-100 text-green-800' 
                            : 'bg-yellow-100 text-yellow-800'
                        }`}>
                          {item.status === 'ready' ? 'Ready' : 'Incomplete'}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-gray-900">{item.customerName}</td>
                      <td className="px-4 py-3 text-gray-900 font-medium">{item.productName}</td>
                      <td className="px-4 py-3 text-gray-900">{item.supplierName}</td>
                      <td className="px-4 py-3">
                        <input 
                          type="number" 
                          className="w-16 border rounded px-2 py-1 text-sm" 
                          value={item.quantity || ''} 
                          min={1} 
                          onChange={e => {
                            const newQuantity = parseInt(e.target.value) || 0;
                            handleSaveNonPriced({ ...item, quantity: newQuantity });
                          }}
                          placeholder="0"
                        />
                      </td>
                      <td className="px-4 py-3">
                        <input 
                          type="number" 
                          className="w-20 border rounded px-2 py-1 text-sm" 
                          value={item.weight || ''} 
                          min={0} 
                          step={0.01} 
                          onChange={e => {
                            const newWeight = parseFloat(e.target.value) || 0;
                            handleSaveNonPriced({ ...item, weight: newWeight });
                          }}
                          placeholder="0.00"
                        />
                      </td>
                      <td className="px-4 py-3">
                        <input 
                          type="number" 
                          className="w-24 border rounded px-2 py-1 text-sm" 
                          value={item.unitPrice || ''} 
                          min={0} 
                          step={0.01} 
                          onChange={e => {
                            const newPrice = parseFloat(e.target.value) || 0;
                            handleSaveNonPriced({ ...item, unitPrice: newPrice });
                          }}
                          placeholder="0.00"
                        />
                      </td>
                      <td className="px-4 py-3 font-semibold text-gray-900">
                        ${item.totalValue.toFixed(2)}
                      </td>
                      <td className="px-4 py-3 text-gray-500 text-sm">
                        {item.date ? new Date(item.date).toLocaleDateString() : '-'}
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
                  ))}
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
        <div className="space-y-6">
          {/* Header */}
          <div className="flex justify-between items-center">
            <div>
              <h2 className="text-xl font-semibold text-gray-900">Inventory Transaction Logs</h2>
              <p className="text-sm text-gray-600 mt-1">
                View and export all transaction logs for inventory items including receiving, sales, and financial transactions
              </p>
            </div>
            <div className="flex items-center space-x-2">
              <button
                onClick={exportInventoryLogs}
                className="bg-green-600 text-white px-4 py-2 rounded-lg hover:bg-green-700 transition-colors flex items-center"
              >
                <FileSpreadsheet className="w-4 h-4 mr-2" />
                Export CSV
              </button>
            </div>
          </div>

          {/* Filters */}
          <div className="bg-white p-4 rounded-lg shadow-sm border">
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
              {/* Search */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Search</label>
                <div className="relative">
                  <Search className="w-4 h-4 absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400" />
                  <input
                    type="text"
                    placeholder="Search products, suppliers, customers..."
                    value={inventoryLogsSearchTerm}
                    onChange={(e) => setInventoryLogsSearchTerm(e.target.value)}
                    className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-blue-500 focus:border-blue-500"
                  />
                </div>
              </div>

              {/* Product Filter */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Product</label>
                <select
                  value={inventoryLogsProductFilter}
                  onChange={(e) => setInventoryLogsProductFilter(e.target.value)}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:ring-blue-500 focus:border-blue-500"
                >
                  <option value="">All Products</option>
                  {products.filter(p => p.is_active).map(product => (
                    <option key={product.id} value={product.id}>{product.name}</option>
                  ))}
                </select>
              </div>

              {/* Supplier Filter */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Supplier</label>
                <select
                  value={inventoryLogsSupplierFilter}
                  onChange={(e) => setInventoryLogsSupplierFilter(e.target.value)}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:ring-blue-500 focus:border-blue-500"
                >
                  <option value="">All Suppliers</option>
                  {suppliers.filter(s => s.is_active).map(supplier => (
                    <option key={supplier.id} value={supplier.id}>{supplier.name}</option>
                  ))}
                </select>
              </div>

              {/* Date Filter */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Date Range</label>
                <select
                  value={inventoryLogsDateFilter}
                  onChange={(e) => setInventoryLogsDateFilter(e.target.value as any)}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:ring-blue-500 focus:border-blue-500"
                >
                  <option value="all">All Time</option>
                  <option value="today">Today</option>
                  <option value="week">This Week</option>
                  <option value="month">This Month</option>
                </select>
              </div>
            </div>
          </div>

          {/* Stats Cards */}
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <div className="bg-white p-4 rounded-lg shadow-sm border">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-gray-600">Total Transactions</p>
                  <p className="text-2xl font-bold text-gray-900">{filteredInventoryLogs.length}</p>
                </div>
                <div className="p-2 bg-blue-100 rounded-full">
                  <Activity className="w-5 h-5 text-blue-600" />
                </div>
              </div>
            </div>

            <div className="bg-white p-4 rounded-lg shadow-sm border">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-gray-600">Inventory Received</p>
                  <p className="text-2xl font-bold text-green-600">
                    {filteredInventoryLogs.filter(log => log.type === 'inventory_received').length}
                  </p>
                </div>
                <div className="p-2 bg-green-100 rounded-full">
                  <Package className="w-5 h-5 text-green-600" />
                </div>
              </div>
            </div>

            <div className="bg-white p-4 rounded-lg shadow-sm border">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-gray-600">Sales Transactions</p>
                  <p className="text-2xl font-bold text-blue-600">
                    {filteredInventoryLogs.filter(log => log.type === 'sale').length}
                  </p>
                </div>
                <div className="p-2 bg-blue-100 rounded-full">
                  <ShoppingCart className="w-5 h-5 text-blue-600" />
                </div>
              </div>
            </div>

            <div className="bg-white p-4 rounded-lg shadow-sm border">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-gray-600">Total Value</p>
                  <p className="text-2xl font-bold text-purple-600">
                    {formatCurrency(filteredInventoryLogs.reduce((sum, log) => sum + (log.amount || 0), 0))}
                  </p>
                </div>
                <div className="p-2 bg-purple-100 rounded-full">
                  <DollarSign className="w-5 h-5 text-purple-600" />
                </div>
              </div>
            </div>
          </div>

          {/* Transaction Logs Table */}
          <div className="bg-white rounded-lg shadow-sm border">
            <div className="p-6 border-b">
              <h3 className="text-lg font-semibold text-gray-900">Transaction Logs</h3>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase cursor-pointer hover:bg-gray-100" onClick={() => handleInventoryLogsSort('date')}>
                      <div className="flex items-center">
                        Date
                        {inventoryLogsSort === 'date' && (
                          <span className="ml-1">{inventoryLogsSortDir === 'asc' ? '↑' : '↓'}</span>
                        )}
                      </div>
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Type</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase cursor-pointer hover:bg-gray-100" onClick={() => handleInventoryLogsSort('product')}>
                      <div className="flex items-center">
                        Product
                        {inventoryLogsSort === 'product' && (
                          <span className="ml-1">{inventoryLogsSortDir === 'asc' ? '↑' : '↓'}</span>
                        )}
                      </div>
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase cursor-pointer hover:bg-gray-100" onClick={() => handleInventoryLogsSort('supplier')}>
                      <div className="flex items-center">
                        Supplier
                        {inventoryLogsSort === 'supplier' && (
                          <span className="ml-1">{inventoryLogsSortDir === 'asc' ? '↑' : '↓'}</span>
                        )}
                      </div>
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Customer</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Quantity/Weight</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase cursor-pointer hover:bg-gray-100" onClick={() => handleInventoryLogsSort('amount')}>
                      <div className="flex items-center">
                        Amount
                        {inventoryLogsSort === 'amount' && (
                          <span className="ml-1">{inventoryLogsSortDir === 'asc' ? '↑' : '↓'}</span>
                        )}
                      </div>
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Reference</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-200">
                  {pagedInventoryLogs.map(log => (
                    <tr key={log.id} className="hover:bg-gray-50">
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="text-sm text-gray-900">
                          {new Date(log.date).toLocaleDateString()}
                        </div>
                        <div className="text-xs text-gray-500">
                          {new Date(log.date).toLocaleTimeString()}
                        </div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
                          log.type === 'inventory_received' ? 'bg-green-100 text-green-800' :
                          log.type === 'sale' ? 'bg-blue-100 text-blue-800' :
                          'bg-gray-100 text-gray-800'
                        }`}>
                          {log.type === 'inventory_received' ? 'Received' :
                           log.type === 'sale' ? 'Sale' :
                           log.type === 'financial' ? 'Financial' : log.type}
                        </span>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="text-sm font-medium text-gray-900">
                          {log.productName || 'N/A'}
                        </div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="text-sm text-gray-900">
                          {log.supplierName || 'N/A'}
                        </div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="text-sm text-gray-900">
                          {log.customerName || 'N/A'}
                        </div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="text-sm text-gray-900">
                          {log.quantity && `${log.quantity} ${log.unit || 'units'}`}
                          {log.weight && `${log.weight} kg`}
                          {!log.quantity && !log.weight && 'N/A'}
                        </div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="text-sm font-medium text-gray-900">
                          {log.amount ? formatCurrencyWithSymbol(log.amount, log.currency) : 'N/A'}
                        </div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="text-sm text-gray-900">
                          {log.reference || 'N/A'}
                        </div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="flex items-center space-x-2">
                          {log.type === 'inventory_received' && (
                            <button
                              onClick={() => handleViewInventoryItemDetails(log)}
                              className="text-blue-600 hover:text-blue-900 text-sm font-medium"
                            >
                              <Eye className="w-4 h-4" />
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Pagination */}
            {inventoryLogsTotalPages > 1 && (
              <div className="px-6 py-4 border-t border-gray-200">
                <div className="flex items-center justify-between">
                  <div className="text-sm text-gray-700">
                    Showing {((inventoryLogsPage - 1) * inventoryLogsPerPage) + 1} to {Math.min(inventoryLogsPage * inventoryLogsPerPage, filteredInventoryLogs.length)} of {filteredInventoryLogs.length} results
                  </div>
                  <div className="flex items-center space-x-2">
                    <button
                      onClick={() => setInventoryLogsPage(Math.max(1, inventoryLogsPage - 1))}
                      disabled={inventoryLogsPage === 1}
                      className="px-3 py-1 text-sm border border-gray-300 rounded-md hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      Previous
                    </button>
                    <span className="text-sm text-gray-700">
                      Page {inventoryLogsPage} of {inventoryLogsTotalPages}
                    </span>
                    <button
                      onClick={() => setInventoryLogsPage(Math.min(inventoryLogsTotalPages, inventoryLogsPage + 1))}
                      disabled={inventoryLogsPage === inventoryLogsTotalPages}
                      className="px-3 py-1 text-sm border border-gray-300 rounded-md hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      Next
                    </button>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {activeTab === 'received-bills' && (
        <div className="space-y-6">
          {/* Header */}
          <div className="flex justify-between items-center">
            <div>
              <h2 className="text-xl font-semibold text-gray-900">Received Bills</h2>
              <p className="text-sm text-gray-600 mt-1">
                Track all received inventory items and their sales progress from point of sale
              </p>
              {(() => {
                const problematicItems = inventory.filter(item => 
                  item.received_quantity === null || item.received_quantity === undefined || item.received_quantity === 0
                );
                
                // Debug: Log the count for the warning message
                if (problematicItems.length > 0) {
                  console.log('Debug - Warning message count:', problematicItems.length);
                }
                
                return problematicItems.length > 0 ? (
                  <div className="mt-2 p-2 bg-yellow-50 border border-yellow-200 rounded-lg">
                    <p className="text-xs text-yellow-800">
                      ⚠️ {problematicItems.length} inventory item(s) don't have received_quantity set. Click "Fix Data" to check, or add new inventory items for proper progress tracking.
                    </p>
                  </div>
                ) : null;
              })()}
            </div>
            <div className="flex items-center space-x-2">
              <button
                onClick={updateInventoryItemsWithReceivedQuantity}
                className="bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 transition-colors flex items-center"
              >
                <RefreshCw className="w-4 h-4 mr-2" />
                Fix Data
              </button>
              <button
                onClick={exportReceivedBills}
                className="bg-green-600 text-white px-4 py-2 rounded-lg hover:bg-green-700 transition-colors flex items-center"
              >
                <FileSpreadsheet className="w-4 h-4 mr-2" />
                Export CSV
              </button>
            </div>
          </div>

          {/* Stats Cards */}
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <div className="bg-white p-4 rounded-lg shadow-sm border">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-gray-600">Total Bills</p>
                  <p className="text-2xl font-bold text-gray-900">{filteredReceivedBills.length}</p>
                </div>
                <div className="p-2 bg-blue-100 rounded-full">
                  <FileText className="w-5 h-5 text-blue-600" />
                </div>
              </div>
            </div>

            <div className="bg-white p-4 rounded-lg shadow-sm border">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-gray-600">In Progress</p>
                  <p className="text-2xl font-bold text-blue-600">
                    {filteredReceivedBills.filter(bill => bill.status === 'in-progress').length}
                  </p>
                </div>
                <div className="p-2 bg-blue-100 rounded-full">
                  <Activity className="w-5 h-5 text-blue-600" />
                </div>
              </div>
            </div>

            <div className="bg-white p-4 rounded-lg shadow-sm border">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-gray-600">Completed</p>
                  <p className="text-2xl font-bold text-green-600">
                    {filteredReceivedBills.filter(bill => bill.status === 'completed').length}
                  </p>
                </div>
                <div className="p-2 bg-green-100 rounded-full">
                  <CheckCircle className="w-5 h-5 text-green-600" />
                </div>
              </div>
            </div>

            <div className="bg-white p-4 rounded-lg shadow-sm border">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-gray-600">Total Revenue</p>
                  <p className="text-2xl font-bold text-green-600">
                    {formatCurrency(filteredReceivedBills.reduce((sum, bill) => sum + bill.totalRevenue, 0))}
                  </p>
                </div>
                <div className="p-2 bg-green-100 rounded-full">
                  <DollarSign className="w-5 h-5 text-green-600" />
                </div>
              </div>
            </div>
          </div>

          {/* Filters */}
          <div className="bg-white p-4 rounded-lg shadow-sm border">
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4">
              {/* Search */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Search</label>
                <div className="relative">
                  <Search className="w-4 h-4 absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400" />
                  <input
                    type="text"
                    placeholder="Search products, suppliers..."
                    value={receivedBillsSearchTerm}
                    onChange={(e) => setReceivedBillsSearchTerm(e.target.value)}
                    className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-blue-500 focus:border-blue-500"
                  />
                </div>
              </div>

              {/* Product Filter */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Product</label>
                <select
                  value={receivedBillsProductFilter}
                  onChange={(e) => setReceivedBillsProductFilter(e.target.value)}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:ring-blue-500 focus:border-blue-500"
                >
                  <option value="">All Products</option>
                  {products.filter(p => p.is_active).map(product => (
                    <option key={product.id} value={product.id}>{product.name}</option>
                  ))}
                </select>
              </div>

              {/* Supplier Filter */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Supplier</label>
                <select
                  value={receivedBillsSupplierFilter}
                  onChange={(e) => setReceivedBillsSupplierFilter(e.target.value)}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:ring-blue-500 focus:border-blue-500"
                >
                  <option value="">All Suppliers</option>
                  {suppliers.filter(s => s.is_active).map(supplier => (
                    <option key={supplier.id} value={supplier.id}>{supplier.name}</option>
                  ))}
                </select>
              </div>

              {/* Status Filter */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Status</label>
                <select
                  value={receivedBillsStatusFilter}
                  onChange={(e) => setReceivedBillsStatusFilter(e.target.value)}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:ring-blue-500 focus:border-blue-500"
                >
                  <option value="all">All Status</option>
                  <option value="pending">Pending</option>
                  <option value="in-progress">In Progress</option>
                  <option value="halfway">Halfway</option>
                  <option value="nearly-complete">Nearly Complete</option>
                  <option value="completed">Completed</option>
                </select>
              </div>

              {/* Type Filter */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Type</label>
                <select
                  value={receivedBillsStatusFilter}
                  onChange={(e) => setReceivedBillsStatusFilter(e.target.value)}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:ring-blue-500 focus:border-blue-500"
                >
                  <option value="all">All Types</option>
                  <option value="commission">Commission</option>
                  <option value="cash">Cash</option>
                </select>
              </div>
            </div>
          </div>

          {/* Table */}
          <div className="bg-white rounded-lg shadow-sm border overflow-hidden">
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-gray-200">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      <button
                        onClick={() => handleReceivedBillsSort('date')}
                        className="flex items-center space-x-1 hover:text-gray-700"
                      >
                        <span>Date</span>
                        {receivedBillsSort === 'date' && (
                          receivedBillsSortDir === 'asc' ? <ChevronRight className="w-4 h-4" /> : <ChevronRight className="w-4 h-4 rotate-180" />
                        )}
                      </button>
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      <button
                        onClick={() => handleReceivedBillsSort('product')}
                        className="flex items-center space-x-1 hover:text-gray-700"
                      >
                        <span>Product</span>
                        {receivedBillsSort === 'product' && (
                          receivedBillsSortDir === 'asc' ? <ChevronRight className="w-4 h-4" /> : <ChevronRight className="w-4 h-4 rotate-180" />
                        )}
                      </button>
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      <button
                        onClick={() => handleReceivedBillsSort('supplier')}
                        className="flex items-center space-x-1 hover:text-gray-700"
                      >
                        <span>Supplier</span>
                        {receivedBillsSort === 'supplier' && (
                          receivedBillsSortDir === 'asc' ? <ChevronRight className="w-4 h-4" /> : <ChevronRight className="w-4 h-4 rotate-180" />
                        )}
                      </button>
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Type</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Quantity</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      <button
                        onClick={() => handleReceivedBillsSort('progress')}
                        className="flex items-center space-x-1 hover:text-gray-700"
                      >
                        <span>Progress</span>
                        {receivedBillsSort === 'progress' && (
                          receivedBillsSortDir === 'asc' ? <ChevronRight className="w-4 h-4" /> : <ChevronRight className="w-4 h-4 rotate-180" />
                        )}
                      </button>
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      <button
                        onClick={() => handleReceivedBillsSort('revenue')}
                        className="flex items-center space-x-1 hover:text-gray-700"
                      >
                        <span>Revenue</span>
                        {receivedBillsSort === 'revenue' && (
                          receivedBillsSortDir === 'asc' ? <ChevronRight className="w-4 h-4" /> : <ChevronRight className="w-4 h-4 rotate-180" />
                        )}
                      </button>
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Status</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Actions</th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-200">
                  {paginatedReceivedBills.map((bill) => (
                    <tr key={bill.id} className="hover:bg-gray-50">
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="text-sm text-gray-900">
                          {new Date(bill.receivedAt).toLocaleDateString()}
                        </div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="text-sm font-medium text-gray-900">{bill.productName}</div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="text-sm text-gray-900">{bill.supplierName}</div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
                          bill.type === 'commission' ? 'bg-purple-100 text-purple-800' : 'bg-green-100 text-green-800'
                        }`}>
                          {bill.type}
                        </span>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="text-sm text-gray-900">
                          <div>Original: {bill.originalQuantity} {bill.unit}</div>
                          <div className="text-xs text-gray-500">Remaining: {bill.remainingQuantity} {bill.unit}</div>
                        </div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="flex items-center">
                          <div className="w-16 bg-gray-200 rounded-full h-2 mr-2">
                            <div
                              className="bg-blue-600 h-2 rounded-full"
                              style={{ width: `${bill.progress}%` }}
                            ></div>
                          </div>
                          <span className="text-sm text-gray-900">{bill.progress.toFixed(1)}%</span>
                        </div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="text-sm font-medium text-gray-900">
                          {formatCurrency(bill.totalRevenue)}
                        </div>
                        <div className="text-xs text-gray-500">
                          Profit: {formatCurrency(bill.totalProfit)}
                        </div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        {getStatusBadge(bill.status)}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="flex items-center space-x-2">
                          <button
                            onClick={() => handleViewReceivedBillDetails(bill)}
                            className="text-blue-600 hover:text-blue-900"
                            title="View Details"
                          >
                            <Eye className="w-4 h-4" />
                          </button>
                          <button
                            onClick={() => handleViewReceivedBillSalesLogs(bill)}
                            className="text-green-600 hover:text-green-900"
                            title="View Sales Logs"
                          >
                            <FileText className="w-4 h-4" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Pagination */}
            {totalReceivedBillsPages > 1 && (
              <div className="px-6 py-4 border-t border-gray-200">
                <div className="flex items-center justify-between">
                  <div className="text-sm text-gray-700">
                    Showing {((receivedBillsPage - 1) * 10) + 1} to {Math.min(receivedBillsPage * 10, filteredReceivedBills.length)} of {filteredReceivedBills.length} results
                  </div>
                  <div className="flex items-center space-x-2">
                    <button
                      onClick={() => setReceivedBillsPage(Math.max(1, receivedBillsPage - 1))}
                      disabled={receivedBillsPage === 1}
                      className="px-3 py-1 text-sm border border-gray-300 rounded-md hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      Previous
                    </button>
                    <span className="text-sm text-gray-700">
                      Page {receivedBillsPage} of {totalReceivedBillsPages}
                    </span>
                    <button
                      onClick={() => setReceivedBillsPage(Math.min(totalReceivedBillsPages, receivedBillsPage + 1))}
                      disabled={receivedBillsPage === totalReceivedBillsPages}
                      className="px-3 py-1 text-sm border border-gray-300 rounded-md hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      Next
                    </button>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Inventory Item Details Modal */}
      {showInventoryItemDetails && selectedInventoryItem && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-lg max-w-2xl w-full max-h-[90vh] overflow-y-auto">
            <div className="p-6 border-b">
              <div className="flex items-center justify-between">
                <h2 className="text-xl font-semibold text-gray-900">Inventory Item Details</h2>
                <button
                  onClick={() => setShowInventoryItemDetails(false)}
                  className="text-gray-400 hover:text-gray-600"
                >
                  <span className="sr-only">Close</span>
                  <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>
            </div>
            <div className="p-6">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">Product</label>
                  <p className="text-sm text-gray-900">
                    {products.find(p => p.id === selectedInventoryItem.product_id)?.name || 'Unknown Product'}
                  </p>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">Supplier</label>
                  <p className="text-sm text-gray-900">
                    {suppliers.find(s => s.id === selectedInventoryItem.supplier_id)?.name || 'Unknown Supplier'}
                  </p>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">Quantity</label>
                  <p className="text-sm text-gray-900">{selectedInventoryItem.quantity} {selectedInventoryItem.unit}</p>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">Weight</label>
                  <p className="text-sm text-gray-900">{selectedInventoryItem.weight || 'N/A'} kg</p>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">Price</label>
                  <p className="text-sm text-gray-900">
                    {selectedInventoryItem.price ? formatCurrency(selectedInventoryItem.price) : 'N/A'}
                  </p>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">Commission Rate</label>
                  <p className="text-sm text-gray-900">
                    {selectedInventoryItem.commission_rate ? `${selectedInventoryItem.commission_rate}%` : 'N/A'}
                  </p>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">Type</label>
                  <p className="text-sm text-gray-900 capitalize">{selectedInventoryItem.type}</p>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">Received At</label>
                  <p className="text-sm text-gray-900">
                    {new Date(selectedInventoryItem.received_at || selectedInventoryItem.created_at).toLocaleString()}
                  </p>
                </div>
                {selectedInventoryItem.notes && (
                  <div className="md:col-span-2">
                    <label className="block text-sm font-medium text-gray-700 mb-2">Notes</label>
                    <p className="text-sm text-gray-900">{selectedInventoryItem.notes}</p>
                  </div>
                )}
              </div>
            </div>
            <div className="px-6 py-4 border-t border-gray-200">
              <button
                onClick={() => setShowInventoryItemDetails(false)}
                className="w-full px-4 py-2 bg-gray-600 text-white rounded-lg hover:bg-gray-700 transition-colors"
              >
                Close
              </button>
            </div>
          </div>
        </div>
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
                   value={showEditNonPriced.notes || ''}
                   onChange={e => setShowEditNonPriced((prev: any) => ({ ...prev, notes: e.target.value }))}
                  rows={3}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:ring-blue-500 focus:border-blue-500"
                  placeholder="Add any notes or comments..."
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
                    <span className="text-green-800 font-medium">Record a payment received from a customer</span>
                  </div>
                </div>
                
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div className="md:col-span-2">
                    <SearchableSelect
                      options={customers.filter(c => c.isActive).map(customer => ({
                        id: customer.id,
                        label: customer.name,
                        value: customer.id,
                        category: 'Customer'
                      }))}
                      value={receiveForm.customerId}
                      onChange={(value) => setReceiveForm(prev => ({ ...prev, customerId: value as string }))}
                      placeholder="Select Customer *"
                      searchPlaceholder="Search customers..."
                      recentSelections={recentCustomers}
                      onRecentUpdate={setRecentCustomers}
                      showAddOption={true}
                      addOptionText="Add New Customer"
                      onAddNew={() => setShowAddCustomerForm(true)}
                      className="w-full"
                    />
                  </div>
                  
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">Amount *</label>
                    <input
                      type="number"
                      step="0.01"
                      value={receiveForm.amount}
                      onChange={(e) => setReceiveForm(prev => ({ ...prev, amount: e.target.value }))}
                      className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:ring-green-500 focus:border-green-500"
                      required
                      placeholder="0.00"
                    />
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
                    <span className="text-red-800 font-medium">Record a payment sent to a supplier</span>
                  </div>
                </div>
                
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div className="md:col-span-2">
                    <SearchableSelect
                      options={suppliers.filter(s => s.isActive).map(supplier => ({
                        id: supplier.id,
                        label: supplier.name,
                        value: supplier.id,
                        category: supplier.type === 'commission' ? 'Commission' : 'Cash'
                      }))}
                      value={payForm.supplierId}
                      onChange={(value) => setPayForm(prev => ({ ...prev, supplierId: value as string }))}
                      placeholder="Select Supplier *"
                      searchPlaceholder="Search suppliers..."
                      categories={['Commission', 'Cash']}
                      recentSelections={recentSuppliers}
                      onRecentUpdate={setRecentSuppliers}
                      showAddOption={true}
                      addOptionText="Add New Supplier"
                      onAddNew={() => setShowAddSupplierForm(true)}
                      className="w-full"
                    />
                  </div>
                  
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">Amount *</label>
                    <input
                      type="number"
                      step="0.01"
                      value={payForm.amount}
                      onChange={(e) => setPayForm(prev => ({ ...prev, amount: e.target.value }))}
                      className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:ring-red-500 focus:border-red-500"
                      required
                      placeholder="0.00"
                    />
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
                      options={expenseCategories.filter(c => c.isActive).map(category => ({
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
                    value={expenseForm.amount}
                    onChange={(e) => setExpenseForm(prev => ({ ...prev, amount: e.target.value }))}
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:ring-blue-500 focus:border-blue-500"
                    required
                    placeholder={`Enter amount in ${expenseForm.currency}`}
                  />
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

              {selectedReceivedBill.notes && (
                <div className="mt-6">
                  <h3 className="text-lg font-medium text-gray-900 mb-4">Notes</h3>
                  <p className="text-sm text-gray-900 bg-gray-50 p-3 rounded-lg">{selectedReceivedBill.notes}</p>
                </div>
              )}
            </div>
            <div className="px-6 py-4 border-t border-gray-200 flex justify-end space-x-3">
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
            </div>
          </div>
        </div>
      )}

      {/* Received Bill Sales Logs Modal */}
      {showReceivedBillSalesLogs && selectedReceivedBill && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-lg max-w-6xl w-full max-h-[90vh] overflow-y-auto">
            <div className="p-6 border-b">
              <div className="flex items-center justify-between">
                <div>
                  <h2 className="text-xl font-semibold text-gray-900">Sales Logs</h2>
                  <p className="text-sm text-gray-600 mt-1">
                    {selectedReceivedBill.productName} - {selectedReceivedBill.supplierName}
                  </p>
                </div>
                <button
                  onClick={() => setShowReceivedBillSalesLogs(false)}
                  className="text-gray-400 hover:text-gray-600"
                >
                  <X className="w-6 h-6" />
                </button>
              </div>
            </div>
            <div className="p-6">
              <div className="mb-4">
                <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                  <div className="bg-blue-50 p-3 rounded-lg">
                    <p className="text-sm text-blue-700">Total Sales</p>
                    <p className="text-lg font-bold text-blue-900">{selectedReceivedBill.saleCount}</p>
                  </div>
                  <div className="bg-green-50 p-3 rounded-lg">
                    <p className="text-sm text-green-700">Total Revenue</p>
                    <p className="text-lg font-bold text-green-900">{formatCurrency(selectedReceivedBill.totalRevenue)}</p>
                  </div>
                  <div className="bg-purple-50 p-3 rounded-lg">
                    <p className="text-sm text-purple-700">Sold Quantity</p>
                    <p className="text-lg font-bold text-purple-900">{selectedReceivedBill.totalSoldQuantity} {selectedReceivedBill.unit}</p>
                  </div>
                  <div className="bg-orange-50 p-3 rounded-lg">
                    <p className="text-sm text-orange-700">Avg Price</p>
                    <p className="text-lg font-bold text-orange-900">{formatCurrency(selectedReceivedBill.avgUnitPrice)}</p>
                  </div>
                </div>
              </div>

              <div className="overflow-x-auto">
                <table className="min-w-full divide-y divide-gray-200">
                  <thead className="bg-gray-50">
                    <tr>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Date</th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Sale ID</th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Customer</th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Quantity</th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Unit Price</th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Total Price</th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Payment Method</th>
                    </tr>
                  </thead>
                  <tbody className="bg-white divide-y divide-gray-200">
                    {selectedReceivedBill.relatedSales.map((sale: any) => {
                      const saleItems = sale.items?.filter((item: any) => 
                        item.productId === selectedReceivedBill.productId && 
                        item.supplierId === selectedReceivedBill.supplierId
                      ) || [];
                      
                      return saleItems.map((item: any, index: number) => (
                        <tr key={`${sale.id}-${index}`} className="hover:bg-gray-50">
                          <td className="px-6 py-4 whitespace-nowrap">
                            <div className="text-sm text-gray-900">
                              {new Date(sale.created_at || sale.createdAt).toLocaleDateString()}
                            </div>
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap">
                            <div className="text-sm font-medium text-gray-900">{sale.id}</div>
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap">
                            <div className="text-sm text-gray-900">
                              {customers.find(c => c.id === sale.customer_id)?.name || 'Walk-in Customer'}
                            </div>
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap">
                            <div className="text-sm text-gray-900">
                              {item.quantity} {selectedReceivedBill.unit}
                            </div>
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap">
                            <div className="text-sm text-gray-900">
                              {formatCurrency(item.unitPrice)}
                            </div>
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap">
                            <div className="text-sm font-medium text-gray-900">
                              {formatCurrency(item.totalPrice)}
                            </div>
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap">
                            <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
                              sale.payment_method === 'cash' ? 'bg-green-100 text-green-800' :
                              sale.payment_method === 'card' ? 'bg-blue-100 text-blue-800' :
                              'bg-yellow-100 text-yellow-800'
                            }`}>
                              {sale.payment_method}
                            </span>
                          </td>
                        </tr>
                      ));
                    })}
                  </tbody>
                </table>
              </div>

              {selectedReceivedBill.relatedSales.length === 0 && (
                <div className="text-center py-8">
                  <FileText className="w-12 h-12 text-gray-400 mx-auto mb-4" />
                  <p className="text-gray-500">No sales recorded for this item yet.</p>
                </div>
              )}
            </div>
            <div className="px-6 py-4 border-t border-gray-200 flex justify-end">
              <button
                onClick={() => setShowReceivedBillSalesLogs(false)}
                className="px-4 py-2 bg-gray-600 text-white rounded-lg hover:bg-gray-700 transition-colors"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}


