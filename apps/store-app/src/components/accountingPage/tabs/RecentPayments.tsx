import React, { useState, useMemo, useEffect } from 'react';
import { useOfflineData } from '../../../contexts/OfflineDataContext';
import { useI18n } from '../../../i18n';
import { useCurrency } from '../../../hooks/useCurrency';
import { useSupabaseAuth } from '../../../contexts/SupabaseAuthContext';
import { PaymentService, PaymentTransaction } from '../../../services/paymentService';
import { transactionService } from '../../../services/transactionService';
import { accountBalanceService } from '../../../services/accountBalanceService';
import { TRANSACTION_CATEGORIES } from '../../../constants/transactionCategories';
import { db } from '../../../lib/db';
import { 
  Search, 
  Filter, 
  Download, 
  Calendar,
  User,
  DollarSign,
  RefreshCw,
  X,
  Edit,
  Trash2
} from 'lucide-react';
import { Pagination } from '../../common/Pagination';
import Toast from '../../common/Toast';

interface RecentPaymentsProps {
  formatCurrency: (amount: number, currency?: string) => string;
  formatCurrencyWithSymbol: (amount: number, currency: string) => string;
}

type PaymentType = 'Customer Payment' | 'Supplier Payment' | 'Employee Payment' | 'Refund';
type PaymentStatus = 'completed' | 'reversed';

interface PaymentRow {
  id: string;
  date: string;
  type: PaymentType;
  entityName: string;
  entityType: 'customer' | 'supplier' | 'employee';
  amount: number;
  currency: 'USD' | 'LBP';
  status: PaymentStatus;
  reference: string | null;
  createdByName: string;
  createdById: string;
}

const ITEMS_PER_PAGE = 20;

export default function RecentPayments({
  formatCurrency,
  formatCurrencyWithSymbol
}: RecentPaymentsProps) {
  const { t } = useI18n();
  const raw = useOfflineData();
  const { userProfile } = useSupabaseAuth();
  const paymentService = PaymentService.getInstance();

  const [searchTerm, setSearchTerm] = useState('');
  const [typeFilter, setTypeFilter] = useState<string>('all');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [currencyFilter, setCurrencyFilter] = useState<string>('all');
  const [dateRange, setDateRange] = useState<{ start: string; end: string }>({
    start: '',
    end: ''
  });
  const [currentPage, setCurrentPage] = useState(1);
  const [userNameCache, setUserNameCache] = useState<Record<string, string>>({});
  const [editingPayment, setEditingPayment] = useState<PaymentRow | null>(null);
  const [deletingPayment, setDeletingPayment] = useState<PaymentRow | null>(null);
  const [editForm, setEditForm] = useState({
    amount: '',
    currency: 'USD' as 'USD' | 'LBP',
    description: '',
    reference: ''
  });
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error'; visible: boolean }>({
    message: '',
    type: 'success',
    visible: false
  });

  // Get all transactions and entities
  const transactions = raw.transactions || [];
  const entities = raw.entities || [];

  // Load user names into cache
  useEffect(() => {
    async function loadUserNames() {
      const userIds = new Set<string>();
      transactions.forEach(t => {
        if (t.created_by) {
          userIds.add(t.created_by);
        }
      });

      const names: Record<string, string> = {};
      await Promise.all(
        Array.from(userIds).map(async (userId) => {
          try {
            const user = await db.users.get(userId);
            if (user) {
              names[userId] = user.name || user.email || 'Unknown';
            } else {
              names[userId] = 'Unknown';
            }
          } catch (error) {
            names[userId] = 'Unknown';
          }
        })
      );
      setUserNameCache(names);
    }

    if (transactions.length > 0) {
      loadUserNames();
    }
  }, [transactions]);

  // Get employees for employee payment lookups
  const employees = raw.employees || [];

  // Filter and process payment transactions
  const paymentRows = useMemo(() => {
    // Filter payment transactions (includes customer and supplier payments)
    const paymentTransactions = paymentService.filterPaymentTransactions(transactions, {
      startDate: dateRange.start || undefined,
      endDate: dateRange.end || undefined,
      currency: currencyFilter !== 'all' ? (currencyFilter as 'USD' | 'LBP') : undefined
    });

    // Also include employee payments
    const employeePayments = transactions.filter(t => 
      (t.category === TRANSACTION_CATEGORIES.EMPLOYEE_PAYMENT || 
       t.category === TRANSACTION_CATEGORIES.EMPLOYEE_PAYMENT_RECEIVED) &&
      (!dateRange.start || (t.created_at && new Date(t.created_at) >= new Date(dateRange.start))) &&
      (!dateRange.end || (t.created_at && new Date(t.created_at) <= new Date(dateRange.end))) &&
      (currencyFilter === 'all' || t.currency === currencyFilter)
    );

    // Combine all payment transactions
    const allPaymentTransactions = [...paymentTransactions, ...employeePayments];

    // Map to rows with entity and user names
    const rows: PaymentRow[] = allPaymentTransactions.map((transaction: any) => {
      // Determine payment type
      let type: PaymentType = 'Customer Payment';
      let entityType: 'customer' | 'supplier' | 'employee' = 'customer';
      
      if (transaction.category === TRANSACTION_CATEGORIES.EMPLOYEE_PAYMENT ||
          transaction.category === TRANSACTION_CATEGORIES.EMPLOYEE_PAYMENT_RECEIVED) {
        type = 'Employee Payment';
        entityType = 'employee';
      } else if (transaction.category === TRANSACTION_CATEGORIES.SUPPLIER_PAYMENT || 
          transaction.category === TRANSACTION_CATEGORIES.SUPPLIER_PAYMENT_RECEIVED) {
        type = 'Supplier Payment';
        entityType = 'supplier';
      } else if (transaction.category === TRANSACTION_CATEGORIES.CUSTOMER_REFUND ||
                 transaction.category === TRANSACTION_CATEGORIES.SUPPLIER_REFUND) {
        type = 'Refund';
        entityType = transaction.customer_id ? 'customer' : 'supplier';
      } else if (transaction.category === TRANSACTION_CATEGORIES.CUSTOMER_PAYMENT ||
                 transaction.category === TRANSACTION_CATEGORIES.CUSTOMER_PAYMENT_RECEIVED) {
        type = 'Customer Payment';
        entityType = 'customer';
      }

      // Get entity name
      const entityId = transaction.customer_id || transaction.supplier_id || transaction.employee_id;
      let entityName = 'Unknown';
      
      if (entityType === 'employee') {
        const employee = entityId ? employees.find((e: any) => e.id === entityId) : null;
        entityName = employee?.name || 'Unknown';
      } else {
        const entity = entityId ? entities.find(e => e.id === entityId) : null;
        entityName = entity?.name || 'Unknown';
      }

      // Determine status
      const status: PaymentStatus = transaction._deleted ? 'reversed' : 'completed';

      // Get created by name
      const createdByName = transaction.created_by 
        ? (userNameCache[transaction.created_by] || 'Unknown')
        : 'System';

      return {
        id: transaction.id,
        date: transaction.created_at || transaction.updated_at || '',
        type,
        entityName,
        entityType,
        amount: transaction.amount,
        currency: transaction.currency || 'USD',
        status,
        reference: transaction.reference,
        createdByName,
        createdById: transaction.created_by || ''
      };
    });

    // Apply filters
    let filtered = rows;

    // Search filter
    if (searchTerm) {
      const searchLower = searchTerm.toLowerCase();
      filtered = filtered.filter(row =>
        row.entityName.toLowerCase().includes(searchLower) ||
        row.reference?.toLowerCase().includes(searchLower) ||
        row.createdByName.toLowerCase().includes(searchLower)
      );
    }

    // Type filter
    if (typeFilter !== 'all') {
      filtered = filtered.filter(row => row.type === typeFilter);
    }

    // Status filter
    if (statusFilter !== 'all') {
      filtered = filtered.filter(row => row.status === statusFilter);
    }

    // Sort by date (newest first)
    filtered.sort((a, b) => {
      const dateA = new Date(a.date).getTime();
      const dateB = new Date(b.date).getTime();
      return dateB - dateA;
    });

    return filtered;
  }, [transactions, entities, userNameCache, searchTerm, typeFilter, statusFilter, currencyFilter, dateRange, paymentService]);

  // Pagination
  const totalPages = Math.ceil(paymentRows.length / ITEMS_PER_PAGE);
  const paginatedRows = paymentRows.slice(
    (currentPage - 1) * ITEMS_PER_PAGE,
    currentPage * ITEMS_PER_PAGE
  );

  // Reset page when filters change
  useEffect(() => {
    setCurrentPage(1);
  }, [searchTerm, typeFilter, statusFilter, currencyFilter, dateRange]);

  const clearFilters = () => {
    setSearchTerm('');
    setTypeFilter('all');
    setStatusFilter('all');
    setCurrencyFilter('all');
    setDateRange({ start: '', end: '' });
    setCurrentPage(1);
  };

  const hasActiveFilters = searchTerm || typeFilter !== 'all' || statusFilter !== 'all' || 
                          currencyFilter !== 'all' || dateRange.start || dateRange.end;

  const showToast = (message: string, type: 'success' | 'error' = 'success') => {
    setToast({ message, type, visible: true });
    setTimeout(() => setToast(t => ({ ...t, visible: false })), 3000);
  };

  const handleEditPayment = async (payment: PaymentRow) => {
    // Get the full transaction to populate form
    const transaction = transactions.find(t => t.id === payment.id);
    if (transaction) {
      // Get description - handle multilingual strings
      let description = '';
      if (typeof transaction.description === 'string') {
        description = transaction.description;
      } else if (transaction.description && typeof transaction.description === 'object') {
        description = transaction.description.en || transaction.description.ar || transaction.description.fr || JSON.stringify(transaction.description);
      }

      setEditForm({
        amount: transaction.amount.toString(),
        currency: transaction.currency || 'USD',
        description,
        reference: transaction.reference || ''
      });
      setEditingPayment(payment);
    }
  };

  const handleSaveEdit = async () => {
    if (!editingPayment || !userProfile?.store_id || !userProfile?.id) return;

    const amount = parseFloat(editForm.amount);
    if (isNaN(amount) || amount <= 0) {
      showToast(t('accounting.pleaseEnterValidAmount') || 'Please enter a valid amount', 'error');
      return;
    }

    try {
      const context = {
        userId: userProfile.id,
        userEmail: userProfile.email,
        storeId: userProfile.store_id,
        branchId: raw.currentBranchId || userProfile.store_id,
        module: 'accounting',
        source: 'web' as const
      };

      // Get the original transaction
      const originalTransaction = transactions.find(t => t.id === editingPayment.id);
      if (!originalTransaction) {
        showToast(t('accounting.transactionNotFound') || 'Transaction not found', 'error');
        return;
      }

      // Check if anything actually changed
      const amountChanged = originalTransaction.amount !== amount;
      const currencyChanged = originalTransaction.currency !== editForm.currency;
      const originalDescription = typeof originalTransaction.description === 'string' 
        ? originalTransaction.description 
        : (originalTransaction.description && typeof originalTransaction.description === 'object'
          ? (originalTransaction.description.en || originalTransaction.description.ar || originalTransaction.description.fr || JSON.stringify(originalTransaction.description))
          : JSON.stringify(originalTransaction.description));
      const descriptionChanged = originalDescription !== editForm.description;
      const referenceChanged = (originalTransaction.reference || '') !== (editForm.reference || '');

      if (!amountChanged && !currencyChanged && !descriptionChanged && !referenceChanged) {
        showToast(t('accounting.noChangesDetected') || 'No changes detected', 'error');
        setEditingPayment(null);
        return;
      }

      // Step 1: Create reversal transaction for the original
      // This preserves history: "Mistakes are corrected, not erased. History is preserved, not rewritten"
      const reversalReason = `Correction: ${originalDescription}`;
      
      console.log('🔄 Creating reversal transaction for payment correction...');
      const reversalTransaction = await accountBalanceService.createReversalTransaction(
        editingPayment.id,
        reversalReason,
        userProfile.id
      );

      if (!reversalTransaction) {
        showToast(t('accounting.failedToCreateReversal') || 'Failed to create reversal transaction', 'error');
        return;
      }

      // Step 2: Create new corrected transaction
      const correctedDescription = editForm.description || 
        `Corrected payment - Original: ${originalDescription}`;

      console.log('✅ Creating corrected transaction...');
      let correctedResult;

      if (originalTransaction.customer_id) {
        // Customer payment
        correctedResult = await transactionService.createCustomerPayment(
          originalTransaction.customer_id,
          amount,
          editForm.currency,
          correctedDescription,
          context,
          {
            reference: editForm.reference || undefined,
            updateCashDrawer: originalTransaction.category === TRANSACTION_CATEGORIES.CUSTOMER_PAYMENT_RECEIVED ||
                             originalTransaction.category === TRANSACTION_CATEGORIES.CUSTOMER_PAYMENT
          }
        );
      } else if (originalTransaction.supplier_id) {
        // Supplier payment
        correctedResult = await transactionService.createSupplierPayment(
          originalTransaction.supplier_id,
          amount,
          editForm.currency,
          correctedDescription,
          context,
          {
            reference: editForm.reference || undefined,
            updateCashDrawer: originalTransaction.category === TRANSACTION_CATEGORIES.SUPPLIER_PAYMENT
          }
        );
      } else if (originalTransaction.employee_id) {
        // Employee payment
        correctedResult = await transactionService.createEmployeePayment(
          originalTransaction.employee_id,
          amount,
          editForm.currency,
          correctedDescription,
          context,
          {
            reference: editForm.reference || undefined,
            updateCashDrawer: false
          }
        );
      } else {
        // General transaction - use createTransaction
        correctedResult = await transactionService.createTransaction({
          category: originalTransaction.category as any,
          amount,
          currency: editForm.currency,
          description: correctedDescription,
          context,
          reference: editForm.reference || undefined,
          customerId: originalTransaction.customer_id || undefined,
          supplierId: originalTransaction.supplier_id || undefined,
          employeeId: originalTransaction.employee_id || undefined
        });
      }

      if (correctedResult.success && reversalTransaction) {
        // Step 3: Mark original transaction with metadata for audit trail
        // This links the original, reversal, and correction together
        try {
          const existingMetadata = originalTransaction.metadata || {};
          await db.transactions.update(editingPayment.id, {
            metadata: {
              ...existingMetadata,
              corrected: true,
              correctedAt: new Date().toISOString(),
              correctedBy: userProfile.id,
              reversalTransactionId: reversalTransaction.id,
              correctedTransactionId: correctedResult.transactionId,
              correctionReason: 'Payment amount/currency/description/reference corrected'
            },
            _synced: false
          });
        } catch (metadataError) {
          console.warn('Could not update transaction metadata:', metadataError);
          // Non-critical, continue
        }

        console.log('✅ Payment correction completed successfully');
        showToast(
          t('accounting.paymentCorrectedSuccessfully') || 
          'Payment corrected successfully. Original transaction preserved, reversal and correction created.',
          'success'
        );
        setEditingPayment(null);
        await raw.refreshData();
      } else {
        showToast(
          correctedResult.error || 
          t('accounting.failedToCorrectPayment') || 
          'Failed to correct payment',
          'error'
        );
      }
    } catch (error: any) {
      console.error('❌ Error correcting payment:', error);
      showToast(
        error.message || 
        t('accounting.failedToCorrectPayment') || 
        'Failed to correct payment',
        'error'
      );
    }
  };

  const handleDeletePayment = (payment: PaymentRow) => {
    setDeletingPayment(payment);
  };

  const handleConfirmDelete = async () => {
    if (!deletingPayment || !userProfile?.store_id || !userProfile?.id) return;

    try {
      const context = {
        userId: userProfile.id,
        userEmail: userProfile.email,
        storeId: userProfile.store_id,
        branchId: raw.currentBranchId || userProfile.store_id,
        module: 'accounting',
        source: 'web' as const
      };

      const result = await transactionService.deleteTransaction(deletingPayment.id, context);

      if (result.success) {
        showToast(t('accounting.paymentDeletedSuccessfully') || 'Payment deleted successfully', 'success');
        setDeletingPayment(null);
        await raw.refreshData();
      } else {
        showToast(result.error || t('accounting.failedToDeletePayment') || 'Failed to delete payment', 'error');
      }
    } catch (error: any) {
      console.error('Error deleting payment:', error);
      showToast(error.message || t('accounting.failedToDeletePayment') || 'Failed to delete payment', 'error');
    }
  };

  return (
    <div className="space-y-6">
      <Toast message={toast.message} type={toast.type} visible={toast.visible} onClose={() => setToast(t => ({ ...t, visible: false }))} />
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold text-gray-900">
            {t('accounting.recentPayments') || 'Recent Payments'}
          </h2>
          <p className="text-sm text-gray-500 mt-1">
            {t('accounting.paymentTransactions') || 'Payment Transactions'} ({paymentRows.length})
          </p>
        </div>
        <div className="flex items-center gap-3">
          <button
            onClick={() => raw.refreshData()}
            className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 flex items-center gap-2"
          >
            <RefreshCw className="w-4 h-4" />
            {t('common.refresh') || 'Refresh'}
          </button>
        </div>
      </div>

      {/* Filters */}
      <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-4">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4">
          {/* Search */}
          <div className="lg:col-span-2">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-4 h-4" />
              <input
                type="text"
                placeholder={t('common.search') || 'Search...'}
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              />
            </div>
          </div>

          {/* Type Filter */}
          <div>
            <select
              value={typeFilter}
              onChange={(e) => setTypeFilter(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            >
              <option value="all">{t('common.allTypes') || 'All Types'}</option>
              <option value="Customer Payment">{t('accounting.customerPayment') || 'Customer Payment'}</option>
              <option value="Supplier Payment">{t('accounting.supplierPayment') || 'Supplier Payment'}</option>
              <option value="Employee Payment">{t('accounting.employeePayment') || 'Employee Payment'}</option>
              <option value="Refund">{t('accounting.refund') || 'Refund'}</option>
            </select>
          </div>

          {/* Status Filter */}
          <div>
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            >
              <option value="all">{t('common.allStatuses') || 'All Statuses'}</option>
              <option value="completed">{t('accounting.completed') || 'Completed'}</option>
              <option value="reversed">{t('accounting.reversed') || 'Reversed'}</option>
            </select>
          </div>

          {/* Currency Filter */}
          <div>
            <select
              value={currencyFilter}
              onChange={(e) => setCurrencyFilter(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            >
              <option value="all">{t('common.allCurrencies') || 'All Currencies'}</option>
              <option value="USD">USD</option>
              <option value="LBP">LBP</option>
            </select>
          </div>
        </div>

        {/* Date Range */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mt-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              {t('common.startDate') || 'Start Date'}
            </label>
            <input
              type="date"
              value={dateRange.start}
              onChange={(e) => setDateRange(prev => ({ ...prev, start: e.target.value }))}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              {t('common.endDate') || 'End Date'}
            </label>
            <input
              type="date"
              value={dateRange.end}
              onChange={(e) => setDateRange(prev => ({ ...prev, end: e.target.value }))}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            />
          </div>
          <div className="flex items-end">
            {hasActiveFilters && (
              <button
                onClick={clearFilters}
                className="w-full px-4 py-2 text-sm font-medium text-gray-700 bg-gray-100 border border-gray-300 rounded-lg hover:bg-gray-200 flex items-center justify-center gap-2"
              >
                <X className="w-4 h-4" />
                {t('common.clearFilters') || 'Clear Filters'}
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Table */}
      <div className="bg-white rounded-lg shadow-sm border border-gray-200 overflow-hidden">
        {paginatedRows.length === 0 ? (
          <div className="text-center py-12">
            <DollarSign className="w-12 h-12 text-gray-400 mx-auto mb-4" />
            <p className="text-lg font-medium text-gray-500">
              {t('accounting.noPaymentsFound') || 'No Payments Found'}
            </p>
            <p className="text-sm text-gray-400 mt-2">
              {t('accounting.noPaymentsMessage') || 'No payment transactions match your current filters.'}
            </p>
          </div>
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-gray-200">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      {t('accounting.dateTime') || 'Date'}
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      {t('accounting.type') || 'Type'}
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      {t('accounting.entity') || 'Entity'}
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      {t('accounting.amount') || 'Amount'}
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      {t('accounting.status') || 'Status'}
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      {t('accounting.reference') || 'Reference'}
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      {t('accounting.createdBy') || 'Created By'}
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      {t('accounting.actions') || 'Actions'}
                    </th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-200">
                  {paginatedRows.map((row) => (
                    <tr key={row.id} className="hover:bg-gray-50">
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                        {new Date(row.date).toLocaleDateString()} {new Date(row.date).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <span className={`inline-flex px-2 py-1 text-xs font-semibold rounded-full ${
                          row.type === 'Customer Payment' 
                            ? 'bg-green-100 text-green-800'
                            : row.type === 'Supplier Payment'
                            ? 'bg-blue-100 text-blue-800'
                            : row.type === 'Employee Payment'
                            ? 'bg-purple-100 text-purple-800'
                            : 'bg-orange-100 text-orange-800'
                        }`}>
                          {row.type}
                        </span>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="flex items-center">
                          <User className="w-4 h-4 text-gray-400 mr-2" />
                          <span className="text-sm text-gray-900">{row.entityName}</span>
                          <span className="ml-2 text-xs text-gray-500 capitalize">({row.entityType})</span>
                        </div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <span className={`text-sm font-semibold ${
                          row.type === 'Customer Payment' ? 'text-green-600' : 'text-red-600'
                        }`}>
                          {formatCurrencyWithSymbol(row.amount, row.currency)}
                        </span>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <span className={`inline-flex px-2 py-1 text-xs font-semibold rounded-full ${
                          row.status === 'completed'
                            ? 'bg-green-100 text-green-800'
                            : 'bg-red-100 text-red-800'
                        }`}>
                          {row.status === 'completed' 
                            ? (t('accounting.completed') || 'Completed')
                            : (t('accounting.reversed') || 'Reversed')}
                        </span>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                        {row.reference || '-'}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                        {row.createdByName}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm font-medium">
                        <div className="flex items-center gap-2">
                          {row.status === 'completed' && (
                            <>
                              <button
                                onClick={() => handleEditPayment(row)}
                                className="text-blue-600 hover:text-blue-900 p-1 rounded hover:bg-blue-50"
                                title={t('accounting.editPayment') || 'Edit Payment'}
                              >
                                <Edit className="w-4 h-4" />
                              </button>
                              <button
                                onClick={() => handleDeletePayment(row)}
                                className="text-red-600 hover:text-red-900 p-1 rounded hover:bg-red-50"
                                title={t('accounting.deletePayment') || 'Delete Payment'}
                              >
                                <Trash2 className="w-4 h-4" />
                              </button>
                            </>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Pagination */}
            {totalPages > 1 && (
              <div className="px-6 py-4 border-t border-gray-200">
                <Pagination
                  currentPage={currentPage}
                  totalPages={totalPages}
                  onPageChange={setCurrentPage}
                />
              </div>
            )}
          </>
        )}
      </div>

      {/* Edit Payment Modal */}
      {editingPayment && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-lg max-w-md w-full">
            <div className="p-6 border-b">
              <h2 className="text-xl font-semibold text-gray-900">
                {t('accounting.editPayment') || 'Edit Payment'}
              </h2>
            </div>
            <div className="p-6 space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  {t('accounting.amount') || 'Amount'} *
                </label>
                <input
                  type="number"
                  step="0.01"
                  value={editForm.amount}
                  onChange={(e) => setEditForm(prev => ({ ...prev, amount: e.target.value }))}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  required
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  {t('common.currency') || 'Currency'} *
                </label>
                <select
                  value={editForm.currency}
                  onChange={(e) => setEditForm(prev => ({ ...prev, currency: e.target.value as 'USD' | 'LBP' }))}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                >
                  <option value="USD">USD</option>
                  <option value="LBP">LBP</option>
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  {t('accounting.description') || 'Description'}
                </label>
                <textarea
                  value={editForm.description}
                  onChange={(e) => setEditForm(prev => ({ ...prev, description: e.target.value }))}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  rows={3}
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  {t('accounting.reference') || 'Reference'}
                </label>
                <input
                  type="text"
                  value={editForm.reference}
                  onChange={(e) => setEditForm(prev => ({ ...prev, reference: e.target.value }))}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                />
              </div>
            </div>
            <div className="p-6 border-t flex justify-end gap-3">
              <button
                onClick={() => setEditingPayment(null)}
                className="px-4 py-2 text-gray-700 border border-gray-300 rounded-lg hover:bg-gray-50"
              >
                {t('common.cancel') || 'Cancel'}
              </button>
              <button
                onClick={handleSaveEdit}
                className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
              >
                {t('common.save') || 'Save'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Delete Confirmation Modal */}
      {deletingPayment && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-lg max-w-md w-full">
            <div className="p-6 border-b">
              <h2 className="text-xl font-semibold text-gray-900">
                {t('accounting.deletePaymentTitle') || 'Delete Payment'}
              </h2>
            </div>
            <div className="p-6">
              <p className="text-gray-700 mb-4">
                {t('accounting.deletePaymentMessage') || 'Are you sure you want to delete this payment? This action cannot be undone and will affect related balances.'}
              </p>
              <div className="bg-gray-50 p-4 rounded-lg mb-4">
                <p className="text-sm text-gray-600">
                  <strong>{t('accounting.entity') || 'Entity'}:</strong> {deletingPayment.entityName}
                </p>
                <p className="text-sm text-gray-600">
                  <strong>{t('accounting.amount') || 'Amount'}:</strong> {formatCurrencyWithSymbol(deletingPayment.amount, deletingPayment.currency)}
                </p>
                <p className="text-sm text-gray-600">
                  <strong>{t('accounting.reference') || 'Reference'}:</strong> {deletingPayment.reference || '-'}
                </p>
              </div>
            </div>
            <div className="p-6 border-t flex justify-end gap-3">
              <button
                onClick={() => setDeletingPayment(null)}
                className="px-4 py-2 text-gray-700 border border-gray-300 rounded-lg hover:bg-gray-50"
              >
                {t('common.cancel') || 'Cancel'}
              </button>
              <button
                onClick={handleConfirmDelete}
                className="px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700"
              >
                {t('accounting.deletePaymentButton') || 'Delete Payment'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

