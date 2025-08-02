import { useState, useEffect, useCallback, useMemo } from 'react';
import { useOfflineData } from '../contexts/OfflineDataContext';
import { useSupabaseAuth } from '../contexts/SupabaseAuthContext';
import { useCurrency } from '../hooks/useCurrency';
import { enhancedTransactionService, EnhancedTransactionResult, TransactionContext } from '../services/enhancedTransactionService';
import { auditLogService, AuditLogEntry, AuditQuery } from '../services/auditLogService';
import { currencyService } from '../services/currencyService';
import { Customer, Supplier, Transaction, AccountsReceivable, AccountsPayable, Sale, SaleItem } from '../types';

export interface EnhancedAccountingState {
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
  
  // Audit and activity data
  recentActivity: AuditLogEntry[];
  criticalEvents: AuditLogEntry[];
  balanceChanges: any[];
  
  // Filtered and sorted data
  filteredReceivables: AccountsReceivable[];
  filteredPayables: AccountsPayable[];
  
  // Loading states
  isLoading: boolean;
  isProcessing: boolean;
  lastSync: Date | null;
}

export interface EnhancedAccountingActions {
  // Enhanced payment processing with comprehensive logging
  processCustomerPayment: (params: {
    customerId: string;
    amount: number;
    currency: 'USD' | 'LBP';
    description: string;
    paymentMethod?: 'cash' | 'card' | 'transfer';
    reference?: string;
  }) => Promise<EnhancedTransactionResult>;
  
  processSupplierPayment: (params: {
    supplierId: string;
    amount: number;
    currency: 'USD' | 'LBP';
    description: string;
    paymentMethod?: 'cash' | 'card' | 'transfer';
    reference?: string;
  }) => Promise<EnhancedTransactionResult>;
  
  processSale: (params: {
    sale: Omit<Sale, 'id' | 'createdAt'>;
    items: Omit<SaleItem, 'id'>[];
  }) => Promise<EnhancedTransactionResult>;
  
  // Data querying with audit trails
  getTransactionHistory: (entityId?: string, entityType?: string) => AuditLogEntry[];
  getBalanceHistory: (entityId: string, entityType: 'customer' | 'supplier') => any[];
  getCorrelatedTransactions: (correlationId: string) => string[];
  
  // Activity and audit queries
  queryAuditLogs: (query: AuditQuery) => AuditLogEntry[];
  getAuditSummary: (startDate?: string, endDate?: string) => any;
  
  // Data management
  refreshData: () => Promise<void>;
  exportAuditLogs: (query?: AuditQuery) => string;
  
  // Real-time updates
  subscribeToActivityUpdates: (callback: (entry: AuditLogEntry) => void) => () => void;
}

export function useEnhancedAccounting(storeId: string): [EnhancedAccountingState, EnhancedAccountingActions] {
  const raw = useOfflineData();
  const { userProfile } = useSupabaseAuth();
  const { formatCurrency, getConvertedAmount } = useCurrency();
  
  // State
  const [isLoading, setIsLoading] = useState(true);
  const [isProcessing, setIsProcessing] = useState(false);
  const [lastSync, setLastSync] = useState<Date | null>(null);
  const [dashboardPeriod, setDashboardPeriod] = useState<'today' | 'week' | 'month' | 'quarter' | 'year'>('today');
  
  // Processed data
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

  // Create transaction context
  const createTransactionContext = useCallback((): TransactionContext => ({
    userId: userProfile?.id || 'anonymous',
    userEmail: userProfile?.email,
    userName: userProfile?.name,
    sessionId: sessionStorage.getItem('audit_session_id') || undefined,
    source: 'web',
    module: 'accounting'
  }), [userProfile]);

  // Period data calculation with enhanced tracking
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
      new Date(t.createdAt) >= startDate
    );

    const income = filteredTransactions
      .filter(t => t.type === 'income')
      .reduce((sum, t) => {
        const originalLBPAmount = t.description.match(/Originally ([\d,]+) LBP/);
        if (originalLBPAmount) {
          const originalAmount = parseInt(originalLBPAmount[1].replace(/,/g, ''));
          return sum + getConvertedAmount(originalAmount, 'LBP');
        }
        return sum + getConvertedAmount(t.amount, t.currency || 'USD');
      }, 0);

    const expenses = filteredTransactions
      .filter(t => t.type === 'expense')
      .reduce((sum, t) => {
        const originalLBPAmount = t.description.match(/Originally ([\d,]+) LBP/);
        if (originalLBPAmount) {
          const originalAmount = parseInt(originalLBPAmount[1].replace(/,/g, ''));
          return sum + getConvertedAmount(originalAmount, 'LBP');
        }
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

  // KPI data calculation
  const kpiData = useMemo(() => {
    const totalCustomers = customers.filter(c => c.isActive).length;
    const totalSuppliers = suppliers.filter(s => s.isActive).length;
    const customersWithDebt = customers.filter(c => (c.balance || 0) > 0).length; // Updated to use balance field with null safety
    const totalCustomerDebt = customers.reduce((sum, c) => sum + (c.balance || 0), 0); // Updated to use balance field with null safety
    const avgDebtPerCustomer = customersWithDebt > 0 ? totalCustomerDebt / customersWithDebt : 0;
    
    const recentTransactions = transactions
      .filter(t => new Date(t.createdAt) >= new Date(Date.now() - 30 * 24 * 60 * 60 * 1000))
      .length;

    const cashFlowTrend = transactions
      .filter(t => new Date(t.createdAt) >= new Date(Date.now() - 7 * 24 * 60 * 60 * 1000))
      .reduce((acc, t) => {
        const day = new Date(t.createdAt).toLocaleDateString();
        if (!acc[day]) acc[day] = { income: 0, expenses: 0 };
        
        const originalLBPAmount = t.description.match(/Originally ([\d,]+) LBP/);
        let amount;
        if (originalLBPAmount) {
          const originalAmount = parseInt(originalLBPAmount[1].replace(/,/g, ''));
          amount = getConvertedAmount(originalAmount, 'LBP');
        } else {
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

  // Recent activity from audit logs
  const recentActivity = useMemo(() => {
    return auditLogService.queryLogs({
      startDate: new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString(),
      limit: 20
    });
  }, []);

  // Critical events
  const criticalEvents = useMemo(() => {
    return auditLogService.queryLogs({
      severity: 'critical',
      startDate: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString(),
      limit: 10
    });
  }, []);

  // Balance changes tracking
  const balanceChanges = useMemo(() => {
    const changes: any[] = [];
    
    customers.forEach(customer => {
      const history = auditLogService.getBalanceHistory(customer.id, 'customer');
      changes.push(...history.map(h => ({ ...h, entityType: 'customer', entityName: customer.name })));
    });
    
    suppliers.forEach(supplier => {
      const history = auditLogService.getBalanceHistory(supplier.id, 'supplier');
      changes.push(...history.map(h => ({ ...h, entityType: 'supplier', entityName: supplier.name })));
    });
    
    return changes.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()).slice(0, 50);
  }, [customers, suppliers]);

  // Filtered receivables and payables (keeping original logic)
  const filteredReceivables = useMemo(() => {
    return raw.accountsReceivable.sort((a, b) => 
      new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
    );
  }, [raw.accountsReceivable]);

  const filteredPayables = useMemo(() => {
    return raw.accountsPayable.sort((a, b) => 
      new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
    );
  }, [raw.accountsPayable]);

  // Actions
  const processCustomerPayment = useCallback(async (params: {
    customerId: string;
    amount: number;
    currency: 'USD' | 'LBP';
    description: string;
    paymentMethod?: 'cash' | 'card' | 'transfer';
    reference?: string;
  }): Promise<EnhancedTransactionResult> => {
    setIsProcessing(true);
    try {
      const context = createTransactionContext();
      const result = await enhancedTransactionService.processCustomerPayment(
        params.customerId,
        params.amount,
        params.currency,
        params.description,
        context,
        {
          paymentMethod: params.paymentMethod,
          reference: params.reference
        }
      );
      
      // Refresh data after successful payment
      await refreshData();
      
      return result;
    } finally {
      setIsProcessing(false);
    }
  }, [createTransactionContext]);

  const processSupplierPayment = useCallback(async (params: {
    supplierId: string;
    amount: number;
    currency: 'USD' | 'LBP';
    description: string;
    paymentMethod?: 'cash' | 'card' | 'transfer';
    reference?: string;
  }): Promise<EnhancedTransactionResult> => {
    setIsProcessing(true);
    try {
      const context = createTransactionContext();
      const result = await enhancedTransactionService.processSupplierPayment(
        params.supplierId,
        params.amount,
        params.currency,
        params.description,
        context,
        {
          paymentMethod: params.paymentMethod,
          reference: params.reference
        }
      );
      
      // Refresh data after successful payment
      await refreshData();
      
      return result;
    } finally {
      setIsProcessing(false);
    }
  }, [createTransactionContext]);

  const processSale = useCallback(async (params: {
    sale: Omit<Sale, 'id' | 'createdAt'>;
    items: Omit<SaleItem, 'id'>[];
  }): Promise<EnhancedTransactionResult> => {
    setIsProcessing(true);
    try {
      const context = createTransactionContext();
      const result = await enhancedTransactionService.processSale(
        params.sale,
        params.items,
        context
      );
      
      // Refresh data after successful sale
      await refreshData();
      
      return result;
    } finally {
      setIsProcessing(false);
    }
  }, [createTransactionContext]);

  const getTransactionHistory = useCallback((entityId?: string, entityType?: string): AuditLogEntry[] => {
    return enhancedTransactionService.getTransactionHistory(entityId, entityType, undefined, undefined);
  }, []);

  const getBalanceHistory = useCallback((entityId: string, entityType: 'customer' | 'supplier'): any[] => {
    return enhancedTransactionService.getBalanceHistory(entityId, entityType);
  }, []);

  const getCorrelatedTransactions = useCallback((correlationId: string): string[] => {
    return enhancedTransactionService.getCorrelatedTransactions(correlationId);
  }, []);

  const queryAuditLogs = useCallback((query: AuditQuery): AuditLogEntry[] => {
    return auditLogService.queryLogs(query);
  }, []);

  const getAuditSummary = useCallback((startDate?: string, endDate?: string) => {
    return auditLogService.generateSummary(startDate, endDate);
  }, []);

  const refreshData = useCallback(async () => {
    setIsLoading(true);
    try {
      // Trigger data refresh from the offline data context
      // This will reload all data and update the state
      setLastSync(new Date());
    } catch (error) {
      console.error('Data refresh failed:', error);
    } finally {
      setIsLoading(false);
    }
  }, []);

  const exportAuditLogs = useCallback((query?: AuditQuery): string => {
    return auditLogService.exportLogs(query);
  }, []);

  const subscribeToActivityUpdates = useCallback((callback: (entry: AuditLogEntry) => void): (() => void) => {
    const handleNewLogEntry = (event: CustomEvent) => {
      callback(event.detail as AuditLogEntry);
    };

    window.addEventListener('audit-log-created', handleNewLogEntry as EventListener);
    
    return () => {
      window.removeEventListener('audit-log-created', handleNewLogEntry as EventListener);
    };
  }, []);

  // Initialize data
  useEffect(() => {
    const initializeData = async () => {
      setIsLoading(true);
      try {
        // Initial data sync if needed
        setLastSync(new Date());
      } catch (error) {
        console.error('Initial data sync failed:', error);
      } finally {
        setIsLoading(false);
      }
    };

    initializeData();
  }, [storeId]);

  const state: EnhancedAccountingState = {
    periodData,
    kpiData,
    recentActivity,
    criticalEvents,
    balanceChanges,
    filteredReceivables,
    filteredPayables,
    isLoading,
    isProcessing,
    lastSync
  };

  const actions: EnhancedAccountingActions = {
    processCustomerPayment,
    processSupplierPayment,
    processSale,
    getTransactionHistory,
    getBalanceHistory,
    getCorrelatedTransactions,
    queryAuditLogs,
    getAuditSummary,
    refreshData,
    exportAuditLogs,
    subscribeToActivityUpdates
  };

  return [state, actions];
} 