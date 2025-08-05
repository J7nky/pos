import { useState, useEffect, useCallback, useMemo } from 'react';
import { useOfflineData } from '../contexts/OfflineDataContext';
import { useSupabaseAuth } from '../contexts/SupabaseAuthContext';
import { currencyService } from '../services/currencyService';
import { transactionService } from '../services/transactionService';
import { dataSyncService } from '../services/dataSyncService';
import { Customer, Supplier, Transaction, AccountsReceivable, AccountsPayable } from '../types';

export interface AccountingState {
  // Dashboard data
  periodData: {
    income: number;
    expenses: number;
    netProfit: number;
    profitMargin: number;
    incomeChange: number;
    expenseChange: number;
    transactionCount: number;
    avgTransactionValue: number;
  };
  
  // KPI data
  kpiData: {
    totalCustomers: number;
    totalSuppliers: number;
    customersWithDebt: number;
    totalCustomerDebt: number;
    avgDebtPerCustomer: number;
    recentTransactions: number;
    cashFlowTrend: Record<string, { income: number; expenses: number }>;
  };
  
  // Filtered and sorted data
  filteredReceivables: AccountsReceivable[];
  filteredPayables: AccountsPayable[];
  
  // Pagination state
  receivablesPagination: {
    page: number;
    totalPages: number;
    pageSize: number;
  };
  payablesPagination: {
    page: number;
    totalPages: number;
    pageSize: number;
  };
  
  // Loading states
  isLoading: boolean;
  isProcessing: boolean;
}

export interface AccountingActions {
  // Payment processing
  processCustomerPayment: (customerId: string, amount: number, currency: 'USD' | 'LBP', description: string) => Promise<boolean>;
  processSupplierPayment: (supplierId: string, amount: number, currency: 'USD' | 'LBP', description: string) => Promise<boolean>;
  processExpense: (amount: number, currency: 'USD' | 'LBP', category: string, description: string) => Promise<boolean>;
  
  // Data management
  refreshData: () => Promise<void>;
  syncData: () => Promise<void>;
  
  // Pagination
  setReceivablesPage: (page: number) => void;
  setPayablesPage: (page: number) => void;
  
  // Sorting and filtering
  setReceivablesSort: (sort: 'dueDate' | 'amount' | 'status') => void;
  setReceivablesSortDir: (dir: 'asc' | 'desc') => void;
  setReceivablesStatusFilter: (status: string) => void;
  
  setPayablesSort: (sort: 'dueDate' | 'amount' | 'status') => void;
  setPayablesSortDir: (dir: 'asc' | 'desc') => void;
  setPayablesStatusFilter: (status: string) => void;
}

export function useAccounting(storeId: string): [AccountingState, AccountingActions] {
  const raw = useOfflineData();
  const { userProfile } = useSupabaseAuth();
  
  // State
  const [isLoading, setIsLoading] = useState(true);
  const [isProcessing, setIsProcessing] = useState(false);
  const [dashboardPeriod, setDashboardPeriod] = useState<'today' | 'week' | 'month' | 'quarter' | 'year'>('today');
  
  // Receivables state
  const [receivablesPage, setReceivablesPage] = useState(1);
  const [receivablesSort, setReceivablesSort] = useState<'dueDate' | 'amount' | 'status'>('dueDate');
  const [receivablesSortDir, setReceivablesSortDir] = useState<'asc' | 'desc'>('asc');
  const [receivablesStatusFilter, setReceivablesStatusFilter] = useState('');
  const [receivablesSearchTerm, setReceivablesSearchTerm] = useState('');
  
  // Payables state
  const [payablesPage, setPayablesPage] = useState(1);
  const [payablesSort, setPayablesSort] = useState<'dueDate' | 'amount' | 'status'>('dueDate');
  const [payablesSortDir, setPayablesSortDir] = useState<'asc' | 'desc'>('asc');
  const [payablesStatusFilter, setPayablesStatusFilter] = useState('');
  const [payablesSearchTerm, setPayablesSearchTerm] = useState('');

  // Data processing
  const customers = useMemo(() => 
            raw.customers.map(c => ({...c, isActive: c.is_active, createdAt: c.created_at, balance: c.balance})) as Customer[], 
    [raw.customers]
  );
  
  const suppliers = useMemo(() => 
    raw.suppliers.map(s => ({...s, isActive: s.is_active, createdAt: s.created_at})) as Supplier[], 
    [raw.suppliers]
  );

  const transactions = useMemo(
    () =>
      raw.transactions.map((t) => ({
        ...t,
        createdAt: t.created_at,
        createdBy: t.created_by,
        storeId: t.store_id,
      })) as Transaction[],
    [raw.transactions]
  );

  // Period data calculation
  const periodData = useMemo(() => {
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
      t.createdAt && new Date(t.createdAt) >= startDate
    );

    const income = filteredTransactions
      .filter(t => t.type === 'income')
      .reduce((sum, t) => {
        const originalLBPAmount = t.description.match(/Originally ([\d,]+) LBP/);
        if (originalLBPAmount) {
          const originalAmount = parseInt(originalLBPAmount[1].replace(/,/g, ''));
          return sum + currencyService.getConvertedAmount(originalAmount, 'LBP');
        }
        return sum + currencyService.getConvertedAmount(t.amount, t.currency || 'USD');
      }, 0);

    const expenses = filteredTransactions
      .filter(t => t.type === 'expense')
      .reduce((sum, t) => {
        const originalLBPAmount = t.description.match(/Originally ([\d,]+) LBP/);
        if (originalLBPAmount) {
          const originalAmount = parseInt(originalLBPAmount[1].replace(/,/g, ''));
          return sum + currencyService.getConvertedAmount(originalAmount, 'LBP');
        }
        return sum + currencyService.getConvertedAmount(t.amount, t.currency || 'USD');
      }, 0);

    const netProfit = income - expenses;
    const profitMargin = income > 0 ? (netProfit / income) * 100 : 0;

    // Previous period comparison
    const periodDays = Math.ceil((now.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24));
    const prevStartDate = new Date(startDate.getTime() - periodDays * 24 * 60 * 60 * 1000);
    const prevEndDate = new Date(startDate.getTime() - 1);

    const prevTransactions = transactions.filter(t => {
      if (!t.createdAt) return false;
      const date = new Date(t.createdAt);
      return date >= prevStartDate && date <= prevEndDate;
    });

    const prevIncome = prevTransactions
      .filter(t => t.type === 'income')
      .reduce((sum, t) => sum + currencyService.getConvertedAmount(t.amount, 'USD'), 0);

    const prevExpenses = prevTransactions
      .filter(t => t.type === 'expense')
      .reduce((sum, t) => sum + currencyService.getConvertedAmount(t.amount, 'USD'), 0);

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
  }, [transactions, dashboardPeriod]);

  // KPI data calculation
  const kpiData = useMemo(() => {
    const totalCustomers = customers.filter(c => c.isActive).length;
    const totalSuppliers = suppliers.filter(s => s.isActive).length;
    const customersWithDebt = customers.filter(c => (c.balance || 0) > 0).length; // Updated to use balance field with null safety
    const totalCustomerDebt = customers.reduce((sum, c) => sum + (c.balance || 0), 0); // Updated to use balance field with null safety
    const avgDebtPerCustomer = customersWithDebt > 0 ? totalCustomerDebt / customersWithDebt : 0;
    
    const recentTransactions = transactions
      .filter(t => t.createdAt && new Date(t.createdAt) >= new Date(Date.now() - 30 * 24 * 60 * 60 * 1000))
      .length;

    const cashFlowTrend = transactions
      .filter(t => t.createdAt && new Date(t.createdAt) >= new Date(Date.now() - 7 * 24 * 60 * 60 * 1000))
      .reduce((acc, t) => {
        const day = new Date(t.createdAt).toLocaleDateString();
        if (!acc[day]) acc[day] = { income: 0, expenses: 0 };
        
        const originalLBPAmount = t.description.match(/Originally ([\d,]+) LBP/);
        let amount;
        if (originalLBPAmount) {
          const originalAmount = parseInt(originalLBPAmount[1].replace(/,/g, ''));
          amount = currencyService.getConvertedAmount(originalAmount, 'LBP');
        } else {
          amount = currencyService.getConvertedAmount(t.amount, t.currency || 'USD');
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
  }, [customers, suppliers, transactions]);

  // Filtered receivables
  const filteredReceivables = useMemo(() => {
    let filtered = raw.accountsReceivable
      .filter(ar => ((ar.customerName || ar.customer_name || '').toLowerCase().includes(receivablesSearchTerm.toLowerCase())))
      .filter(ar => !receivablesStatusFilter || ar.status === receivablesStatusFilter);

    filtered.sort((a, b) => {
      if (receivablesSort === 'dueDate') {
        const aDate = new Date(a.dueDate).getTime();
        const bDate = new Date(b.dueDate).getTime();
        return receivablesSortDir === 'asc' ? aDate - bDate : bDate - aDate;
      } else if (receivablesSort === 'amount') {
        return receivablesSortDir === 'asc' ? a.amountDue - b.amountDue : b.amountDue - a.amountDue;
      } else if (receivablesSort === 'status') {
        return receivablesSortDir === 'asc' ? a.status.localeCompare(b.status) : b.status.localeCompare(a.status);
      }
      return 0;
    });

    return filtered;
  }, [raw.accountsReceivable, receivablesSearchTerm, receivablesStatusFilter, receivablesSort, receivablesSortDir]);

  // Filtered payables
  const filteredPayables = useMemo(() => {
    let filtered = raw.accountsPayable
      .filter(ap => ((ap.supplierName || ap.supplier_name || '').toLowerCase().includes(payablesSearchTerm.toLowerCase())))
      .filter(ap => !payablesStatusFilter || ap.status === payablesStatusFilter);

    filtered.sort((a, b) => {
      if (payablesSort === 'dueDate') {
        const aDate = new Date(a.dueDate).getTime();
        const bDate = new Date(b.dueDate).getTime();
        return payablesSortDir === 'asc' ? aDate - bDate : bDate - aDate;
      } else if (payablesSort === 'amount') {
        return payablesSortDir === 'asc' ? a.amountDue - b.amountDue : b.amountDue - a.amountDue;
      } else if (payablesSort === 'status') {
        return payablesSortDir === 'asc' ? a.status.localeCompare(b.status) : b.status.localeCompare(a.status);
      }
      return 0;
    });

    return filtered;
  }, [raw.accountsPayable, payablesSearchTerm, payablesStatusFilter, payablesSort, payablesSortDir]);

  // Pagination calculations
  const receivablesPagination = useMemo(() => {
    const pageSize = 10;
    const totalPages = Math.ceil(filteredReceivables.length / pageSize);
    return {
      page: receivablesPage,
      totalPages,
      pageSize
    };
  }, [filteredReceivables.length, receivablesPage]);

  const payablesPagination = useMemo(() => {
    const pageSize = 10;
    const totalPages = Math.ceil(filteredPayables.length / pageSize);
    return {
      page: payablesPage,
      totalPages,
      pageSize
    };
  }, [filteredPayables.length, payablesPage]);

  // Actions
  const processCustomerPayment = useCallback(async (
    customerId: string, 
    amount: number, 
    currency: 'USD' | 'LBP', 
    description: string
  ): Promise<boolean> => {
    if (!userProfile?.id) return false;
    
    setIsProcessing(true);
    try {
      const result = await transactionService.processCustomerPayment(
        customerId,
        amount,
        currency,
        description,
        userProfile.id
      );
      
      if (result.success) {
        await refreshData();
        return true;
      }
      return false;
    } catch (error) {
      console.error('Payment processing failed:', error);
      return false;
    } finally {
      setIsProcessing(false);
    }
  }, [userProfile?.id]);

  const processSupplierPayment = useCallback(async (
    supplierId: string, 
    amount: number, 
    currency: 'USD' | 'LBP', 
    description: string
  ): Promise<boolean> => {
    if (!userProfile?.id) return false;
    
    setIsProcessing(true);
    try {
      const result = await transactionService.processSupplierPayment(
        supplierId,
        amount,
        currency,
        description,
        userProfile.id
      );
      
      if (result.success) {
        await refreshData();
        return true;
      }
      return false;
    } catch (error) {
      console.error('Payment processing failed:', error);
      return false;
    } finally {
      setIsProcessing(false);
    }
  }, [userProfile?.id]);

  const processExpense = useCallback(async (
    amount: number, 
    currency: 'USD' | 'LBP', 
    category: string, 
    description: string
  ): Promise<boolean> => {
    if (!userProfile?.id) return false;
    
    setIsProcessing(true);
    try {
      const result = await transactionService.processExpense(
        amount,
        currency,
        category,
        description,
        userProfile.id
      );
      
      if (result.success) {
        await refreshData();
        return true;
      }
      return false;
    } catch (error) {
      console.error('Expense processing failed:', error);
      return false;
    } finally {
      setIsProcessing(false);
    }
  }, [userProfile?.id]);

  const refreshData = useCallback(async () => {
    setIsLoading(true);
    try {
      await dataSyncService.reloadAllData(storeId);
    } catch (error) {
      console.error('Data refresh failed:', error);
    } finally {
      setIsLoading(false);
    }
  }, [storeId]);

  const syncData = useCallback(async () => {
    setIsLoading(true);
    try {
      await dataSyncService.syncDataToLocalStorage(storeId);
    } catch (error) {
      console.error('Data sync failed:', error);
    } finally {
      setIsLoading(false);
    }
  }, [storeId]);

  // Initialize data
  useEffect(() => {
    const initializeData = async () => {
      setIsLoading(true);
      try {
        await dataSyncService.syncDataToLocalStorage(storeId);
      } catch (error) {
        console.error('Initial data sync failed:', error);
      } finally {
        setIsLoading(false);
      }
    };

    initializeData();
  }, [storeId]);

  const state: AccountingState = {
    periodData,
    kpiData,
    filteredReceivables,
    filteredPayables,
    receivablesPagination,
    payablesPagination,
    isLoading,
    isProcessing
  };

  const actions: AccountingActions = {
    processCustomerPayment,
    processSupplierPayment,
    processExpense,
    refreshData,
    syncData,
    setReceivablesPage,
    setReceivablesSort,
    setReceivablesSortDir,
    setReceivablesStatusFilter,
    setPayablesPage,
    setPayablesSort,
    setPayablesSortDir,
    setPayablesStatusFilter
  };

  return [state, actions];
} 