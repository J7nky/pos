import React, { useState, useMemo, useEffect } from 'react';
import { 
  DollarSign, 
  TrendingDown, 
  TrendingUp, 
  Calendar,
  Search,
  Plus,
  Edit,
  Trash2
} from 'lucide-react';
import { useI18n } from '../../../i18n';
import { Supplier, Transaction } from '../../../types';
import SupplierFormModal from '../../common/SupplierFormModal';
import { Pagination } from '../../../components/common/Pagination';

interface SupplierAdvancesProps {
  suppliers: Supplier[];
  transactions: Transaction[];
  formatCurrency: (amount: number) => string;
  formatCurrencyWithSymbol: (amount: number, currency: string) => string;
  showToast: (message: string, type: 'success' | 'error') => void;
  onProcessAdvance: (data: {
    supplierId: string;
    amount: number;
    currency: 'USD' | 'LBP';
    type: 'give' | 'deduct';
    description: string;
    date: string;
    reviewDate?: string;
  }) => Promise<void>;
  onEditAdvance?: (transactionId: string, updates: any) => Promise<void>;
  onDeleteAdvance?: (transactionId: string) => Promise<void>;
  addSupplier: (data: any) => Promise<void>;
  refreshData: () => Promise<void>;
}

export default function SupplierAdvances({
  suppliers,
  transactions,
  formatCurrency,
  formatCurrencyWithSymbol,
  showToast,
  onProcessAdvance,
  onEditAdvance,
  onDeleteAdvance,
  addSupplier,
  refreshData
}: SupplierAdvancesProps) {
  const { t } = useI18n();
  
  // State
  const [searchTerm, setSearchTerm] = useState('');
  const [showAdvanceForm, setShowAdvanceForm] = useState(false);
  const [showSupplierForm, setShowSupplierForm] = useState(false);
  const [dateFilter, setDateFilter] = useState<'all' | 'today' | 'week' | 'month'>('all');
  const [currencyFilter, setCurrencyFilter] = useState<'all' | 'USD' | 'LBP'>('all');
  const [editingAdvance, setEditingAdvance] = useState<Transaction | null>(null);
  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 20;
  
  // Advance form state
  const [advanceForm, setAdvanceForm] = useState({
    supplierId: '',
    amount: '',
    currency: 'USD' as 'USD' | 'LBP',
    type: 'give' as 'give' | 'deduct',
    description: '',
    date: new Date().toISOString().split('T')[0],
    reviewDate: ''
  });

  // Calculate advance statistics
  const advanceStats = useMemo(() => {
    const totalUSD = suppliers.reduce((sum, s) => sum + (s.advance_usd_balance || 0), 0);
    const totalLBP = suppliers.reduce((sum, s) => sum + (s.advance_lb_balance || 0), 0);
    const suppliersWithAdvances = suppliers.filter(s => 
      (s.advance_usd_balance || 0) > 0 || (s.advance_lb_balance || 0) > 0
    ).length;

    // Get advance transactions (excluding deleted)
    const advanceTransactions = transactions.filter(t => 
      (t.category === 'Supplier Advance' || t.description?.includes('advance')) && !t._deleted
    );

    return {
      totalUSD,
      totalLBP,
      suppliersWithAdvances,
      totalTransactions: advanceTransactions.length
    };
  }, [suppliers, transactions]);

  // Get all advance transactions with supplier details
  const advanceTransactionsWithDetails = useMemo(() => {
    return transactions
      .filter(t => (t.category === 'Supplier Advance' || t.description?.includes('advance')) && !t._deleted)
      .map(transaction => {
        const supplier = suppliers.find(s => s.id === transaction.supplier_id);
        
        // Extract review date from description if it exists
        const reviewDateMatch = transaction.description?.match(/\[Review: (.*?)\]/);
        const reviewDate = reviewDateMatch ? reviewDateMatch[1] : null;
        
        return {
          ...transaction,
          supplierName: supplier?.name || 'Unknown Supplier',
          reviewDate: reviewDate,
          // Determine if this is USD or LBP based on currency field
          advanceUSD: transaction.currency === 'USD' ? transaction.amount : 0,
          advanceLBP: transaction.currency === 'LBP' ? transaction.amount : 0,
        };
      })
      .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
  }, [transactions, suppliers]);

  // Filter advance transactions
  const filteredAdvances = useMemo(() => {
    let filtered = advanceTransactionsWithDetails;

    // Search filter
    if (searchTerm) {
      const search = searchTerm.toLowerCase();
      filtered = filtered.filter(adv =>
        adv.supplierName.toLowerCase().includes(search) ||
        adv.description?.toLowerCase().includes(search) ||
        adv.reference?.toLowerCase().includes(search)
      );
    }

    // Date filter
    if (dateFilter !== 'all') {
      const now = new Date();
      let startDate: Date;

      switch (dateFilter) {
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

      filtered = filtered.filter(t => new Date(t.created_at) >= startDate);
    }

    // Currency filter
    if (currencyFilter !== 'all') {
      filtered = filtered.filter(t => t.currency === currencyFilter);
    }

    return filtered;
  }, [advanceTransactionsWithDetails, searchTerm, dateFilter, currencyFilter]);

  // Pagination
  const paginatedAdvances = useMemo(() => {
    const startIndex = (currentPage - 1) * itemsPerPage;
    return filteredAdvances.slice(startIndex, startIndex + itemsPerPage);
  }, [filteredAdvances, currentPage]);

  const totalPages = Math.ceil(filteredAdvances.length / itemsPerPage);

  // Reset to page 1 when filters change
  useEffect(() => {
    setCurrentPage(1);
  }, [searchTerm, dateFilter, currencyFilter]);

  const handleSubmitAdvance = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!advanceForm.supplierId) {
      showToast(t('customers.pleaseSelectSupplier'), 'error');
      return;
    }

    if (!advanceForm.amount || parseFloat(advanceForm.amount) <= 0) {
      showToast(t('customers.pleaseEnterValidAmount'), 'error');
      return;
    }

    try {
      await onProcessAdvance({
        supplierId: advanceForm.supplierId,
        amount: parseFloat(advanceForm.amount),
        currency: advanceForm.currency,
        type: advanceForm.type,
        description: advanceForm.description || `Supplier advance ${advanceForm.type === 'give' ? 'payment' : 'deduction'}`,
        date: advanceForm.date,
        reviewDate: advanceForm.reviewDate || undefined
      });

      // Reset form
      setEditingAdvance(null);
      setAdvanceForm({
        supplierId: '',
        amount: '',
        currency: 'USD',
        type: 'give',
        description: '',
        date: new Date().toISOString().split('T')[0],
        reviewDate: ''
      });

      setShowAdvanceForm(false);
      showToast(
        advanceForm.type === 'give' 
          ? t('customers.advancePaymentRecorded') 
          : t('customers.advanceDeductionRecorded'), 
        'success'
      );
    } catch (error) {
      console.error('Error processing advance:', error);
      showToast(t('customers.errorProcessingAdvance'), 'error');
    }
  };


  const handleEditAdvance = (advance: any) => {
    // Extract review date from description if it exists
    const reviewDateMatch = advance.description?.match(/\[Review: (.*?)\]/);
    const reviewDate = reviewDateMatch ? reviewDateMatch[1] : '';
    
    // Set form to edit mode
    setEditingAdvance(advance);
    setAdvanceForm({
      supplierId: advance.supplier_id || '',
      amount: advance.amount.toString(),
      currency: advance.currency,
      type: advance.type === 'expense' ? 'give' : 'deduct',
      description: advance.description?.replace(/ \[Review: .*?\]$/, '') || '',
      date: advance.created_at ? new Date(advance.created_at).toISOString().split('T')[0] : new Date().toISOString().split('T')[0],
      reviewDate: reviewDate
    });
    setShowAdvanceForm(true);
  };

  const handleCancelEdit = () => {
    setEditingAdvance(null);
    setAdvanceForm({
      supplierId: '',
      amount: '',
      currency: 'USD',
      type: 'give',
      description: '',
      date: new Date().toISOString().split('T')[0],
      reviewDate: ''
    });
    setShowAdvanceForm(false);
  };

  const handleDeleteAdvance = async (transaction: Transaction) => {
    if (!window.confirm(t('customers.confirmDeleteAdvance') || 'Are you sure you want to delete this advance transaction?')) {
      return;
    }

    try {
      if (onDeleteAdvance) {
        await onDeleteAdvance(transaction.id);
        showToast(t('customers.advanceDeleted') || 'Advance transaction deleted', 'success');
      }
    } catch (error) {
      console.error('Error deleting advance:', error);
      showToast(t('customers.errorDeletingAdvance') || 'Error deleting advance', 'error');
    }
  };

  const handleUpdateAdvance = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!editingAdvance) return;

    if (!advanceForm.supplierId) {
      showToast(t('customers.pleaseSelectSupplier'), 'error');
      return;
    }

    if (!advanceForm.amount || parseFloat(advanceForm.amount) <= 0) {
      showToast(t('customers.pleaseEnterValidAmount'), 'error');
      return;
    }

    try {
      if (onEditAdvance) {
        await onEditAdvance(editingAdvance.id, {
          supplierId: advanceForm.supplierId,
          amount: parseFloat(advanceForm.amount),
          currency: advanceForm.currency,
          type: advanceForm.type,
          description: advanceForm.description || `Supplier advance ${advanceForm.type === 'give' ? 'payment' : 'deduction'}`,
          date: advanceForm.date,
          reviewDate: advanceForm.reviewDate || undefined
        });
        showToast(t('customers.advanceUpdated') || 'Advance transaction updated', 'success');
        handleCancelEdit();
      }
    } catch (error) {
      console.error('Error updating advance:', error);
      showToast(t('customers.errorUpdatingAdvance') || 'Error updating advance', 'error');
    }
  };

  return (
    <div className="space-y-6">
      {/* Statistics Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="bg-white rounded-lg shadow-sm p-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-600">{t('customers.totalAdvancesUSD')}</p>
              <p className="text-2xl font-bold text-gray-900">{formatCurrency(advanceStats.totalUSD)}</p>
            </div>
            <DollarSign className="w-10 h-10 text-green-600" />
          </div>
        </div>

        <div className="bg-white rounded-lg shadow-sm p-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-600">{t('customers.totalAdvancesLBP')}</p>
              <p className="text-2xl font-bold text-gray-900">{formatCurrency(advanceStats.totalLBP)}</p>
            </div>
            <DollarSign className="w-10 h-10 text-blue-600" />
          </div>
        </div>

        <div className="bg-white rounded-lg shadow-sm p-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-600">{t('customers.suppliersWithAdvances')}</p>
              <p className="text-2xl font-bold text-gray-900">{advanceStats.suppliersWithAdvances}</p>
            </div>
            <TrendingUp className="w-10 h-10 text-orange-600" />
          </div>
        </div>

      </div>

      {/* Suppliers with Current Advances */}
      {advanceStats.suppliersWithAdvances > 0 && (
        <div className="bg-white rounded-lg shadow-sm p-6">
          <h3 className="text-lg font-semibold text-gray-900 mb-4">{t('customers.suppliersWithAdvances') || 'Suppliers with Advances'}</h3>
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-4 py-3 text-left text-sm font-medium text-gray-700">{t('payments.supplier') || 'Supplier'}</th>
                  <th className="px-4 py-3 text-left text-sm font-medium text-gray-700">{t('customers.advanceUSD') || 'USD Advance'}</th>
                  <th className="px-4 py-3 text-left text-sm font-medium text-gray-700">{t('customers.advanceLBP') || 'LBP Advance'}</th>
                  <th className="px-4 py-3 text-left text-sm font-medium text-gray-700">{t('common.labels.contact') || 'Contact'}</th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {suppliers
                  .filter(s => (s.advance_usd_balance || 0) > 0 || (s.advance_lb_balance || 0) > 0)
                  .map(supplier => (
                    <tr key={supplier.id} className="hover:bg-gray-50">
                      <td className="px-4 py-3">
                        <div className="text-sm font-medium text-gray-900">{supplier.name}</div>
                        {supplier.address && (
                          <div className="text-xs text-gray-500">{supplier.address}</div>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        <div className={`text-sm font-semibold ${(supplier.advance_usd_balance || 0) > 0 ? 'text-green-600' : 'text-gray-400'}`}>
                          {(supplier.advance_usd_balance || 0) > 0 ? `$${formatCurrency(supplier.advance_usd_balance || 0)}` : '-'}
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        <div className={`text-sm font-semibold ${(supplier.advance_lb_balance || 0) > 0 ? 'text-blue-600' : 'text-gray-400'}`}>
                          {(supplier.advance_lb_balance || 0) > 0 ? `${formatCurrency(supplier.advance_lb_balance || 0)} ل.ل` : '-'}
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        <div className="text-sm text-gray-900">{supplier.phone}</div>
                        {supplier.email && (
                          <div className="text-xs text-gray-500">{supplier.email}</div>
                        )}
                      </td>
                    </tr>
                  ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Action Buttons */}
      <div className="flex flex-wrap gap-3">
        <button
          onClick={() => setShowAdvanceForm(!showAdvanceForm)}
          className="flex items-center px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
        >
          <Plus className="w-5 h-5 mr-2" />
          {t('customers.supplierRecordAdvance')}
        </button>
        <button
          onClick={() => setShowSupplierForm(true)}
          className="flex items-center px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700"
        >
          <Plus className="w-5 h-5 mr-2" />
          {t('customers.addSupplier')}
        </button>
      </div>

      {/* Advance Form */}
      {showAdvanceForm && (
        <div className="bg-white rounded-lg shadow-sm p-6">
          <h3 className="text-lg font-semibold text-gray-900 mb-4">
            {editingAdvance ? (t('customers.editAdvance') || 'Edit Advance Transaction') : (t('customers.recordAdvancePayment') || 'Record Advance Payment')}
          </h3>
          <form onSubmit={editingAdvance ? handleUpdateAdvance : handleSubmitAdvance} className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  {t('payments.supplier')} *
                </label>
                <select
                  value={advanceForm.supplierId}
                  onChange={(e) => setAdvanceForm({ ...advanceForm, supplierId: e.target.value })}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:ring-blue-500 focus:border-blue-500"
                  required
                >
                  <option value="">{t('payments.selectSupplier')}</option>
                  {suppliers.map(supplier => (
                    <option key={supplier.id} value={supplier.id}>
                      {supplier.name}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  {t('common.labels.type')} *
                </label>
                <select
                  value={advanceForm.type}
                  onChange={(e) => setAdvanceForm({ ...advanceForm, type: e.target.value as 'give' | 'deduct' })}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:ring-blue-500 focus:border-blue-500"
                  required
                  disabled={!!editingAdvance}
                >
                  <option value="give">{t('customers.giveAdvance')}</option>
                  <option value="deduct">{t('customers.deductAdvance')}</option>
                </select>
                {editingAdvance && (
                  <p className="text-xs text-gray-500 mt-1">
                    {t('customers.typeCannotBeChanged') || 'Type cannot be changed when editing'}
                  </p>
                )}
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  {t('payments.amount')} *
                </label>
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  value={advanceForm.amount}
                  onChange={(e) => setAdvanceForm({ ...advanceForm, amount: e.target.value })}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:ring-blue-500 focus:border-blue-500"
                  placeholder="0.00"
                  required
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  {t('payments.currency')} *
                </label>
                <select
                  value={advanceForm.currency}
                  onChange={(e) => setAdvanceForm({ ...advanceForm, currency: e.target.value as 'USD' | 'LBP' })}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:ring-blue-500 focus:border-blue-500"
                  required
                >
                  <option value="USD">${t('common.currency.USD') || 'USD'}</option>
                  <option value="LBP">{t('common.currency.LBP') || 'LBP'}</option>
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  {t('dashboard.date')} *
                </label>
                <input
                  type="date"
                  value={advanceForm.date}
                  onChange={(e) => setAdvanceForm({ ...advanceForm, date: e.target.value })}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:ring-blue-500 focus:border-blue-500"
                  required
                  disabled={!!editingAdvance}
                />
                {editingAdvance && (
                  <p className="text-xs text-gray-500 mt-1">
                    {t('customers.dateCannotBeChanged') || 'Date cannot be changed when editing'}
                  </p>
                )}
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  {t('payments.description')}
                </label>
                <input
                  type="text"
                  value={advanceForm.description}
                  onChange={(e) => setAdvanceForm({ ...advanceForm, description: e.target.value })}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:ring-blue-500 focus:border-blue-500"
                  placeholder={t('common.placeholders.optional')}
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  {t('customers.reviewDate')} ({t('common.placeholders.optional') || 'Optional'})
                </label>
                <input
                  type="date"
                  value={advanceForm.reviewDate}
                  onChange={(e) => setAdvanceForm({ ...advanceForm, reviewDate: e.target.value })}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:ring-blue-500 focus:border-blue-500"
                  min={new Date().toISOString().split('T')[0]}
                />
                <p className="text-xs text-gray-500 mt-1">
                  {t('customers.reviewDateHint') || 'Set a date to review or settle this advance'}
                </p>
              </div>
            </div>

            <div className="flex justify-end space-x-3">
              <button
                type="button"
                onClick={handleCancelEdit}
                className="px-4 py-2 text-gray-700 border border-gray-300 rounded-lg hover:bg-gray-50"
              >
                {t('customers.cancel')}
              </button>
              <button
                type="submit"
                className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
              >
                {editingAdvance ? (t('payments.saveChanges') || 'Save Changes') : (t('common.actions.submit') || 'Submit')}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Advance History Table */}
      <div className="bg-white rounded-lg shadow-sm">
        <div className="p-6 border-b border-gray-200">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-lg font-semibold text-gray-900">{t('customers.advanceHistory') || 'Advance History'}</h3>
          </div>
          
          {/* Search and Filters */}
          <div className="flex gap-3 flex-wrap">
            <div className="relative flex-1 min-w-[200px]">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-5 h-5" />
              <input
                type="text"
                placeholder={t('common.placeholders.search') || 'Search...'}
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-blue-500 focus:border-blue-500"
              />
            </div>
            <select
              value={dateFilter}
              onChange={(e) => setDateFilter(e.target.value as any)}
              className="border border-gray-300 rounded-lg px-3 py-2"
            >
              <option value="all">{t('customers.allTime') || 'All Time'}</option>
              <option value="today">{t('customers.today') || 'Today'}</option>
              <option value="week">{t('customers.thisWeek') || 'This Week'}</option>
              <option value="month">{t('customers.thisMonth') || 'This Month'}</option>
            </select>
            <select
              value={currencyFilter}
              onChange={(e) => setCurrencyFilter(e.target.value as any)}
              className="border border-gray-300 rounded-lg px-3 py-2"
            >
              <option value="all">{t('customers.allCurrencies') || 'All Currencies'}</option>
              <option value="USD">${t('common.currency.USD') || 'USD'}</option>
              <option value="LBP">{t('common.currency.LBP') || 'LBP'}</option>
            </select>
          </div>
        </div>

        {/* Advances Table */}
        <div className="overflow-x-auto">
          <table className="w-full table-auto">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-4 py-4 rtl:text-right ltr:text-left text-sm font-medium text-gray-700 min-w-[140px]">
                  {t('dashboard.date') || 'Date'}
                </th>
                <th className="px-4 py-4 rtl:text-right ltr:text-left text-sm font-medium text-gray-700 min-w-[180px]">
                  {t('payments.supplier') || 'Supplier'}
                </th>
                <th className="px-4 py-4 rtl:text-right ltr:text-left text-sm font-medium text-gray-700 min-w-[120px]">
                  {t('common.labels.type') || 'Type'}
                </th>
                <th className="px-4 py-4 rtl:text-right ltr:text-left text-sm font-medium text-gray-700 min-w-[120px]">
                  {t('customers.advanceUSD') || 'USD'}
                </th>
                <th className="px-4 py-4 rtl:text-right ltr:text-left text-sm font-medium text-gray-700 min-w-[120px]">
                  {t('customers.advanceLBP') || 'LBP'}
                </th>
                <th className="px-4 py-4 rtl:text-right ltr:text-left text-sm font-medium text-gray-700 min-w-[150px]">
                  {t('customers.reviewDate') || 'Review Date'}
                </th>
                <th className="px-4 py-4 text-center text-sm font-medium text-gray-700 min-w-[120px]">
                  {t('customers.actions') || 'Actions'}
                </th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {filteredAdvances.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-4 py-8 text-center text-gray-500">
                    {searchTerm || dateFilter !== 'all' || currencyFilter !== 'all'
                      ? t('customers.noAdvancesFound') || 'No advances found'
                      : t('customers.noAdvancesRecorded') || 'No advance transactions recorded yet'}
                  </td>
                </tr>
              ) : (
                paginatedAdvances.map(advance => (
                  <tr key={advance.id} className="hover:bg-gray-50">
                    <td className="px-4 py-4 rtl:text-right ltr:text-left">
                      <div className="text-sm text-gray-900">
                        {new Date(advance.created_at).toLocaleDateString()}
                      </div>
                      <div className="text-xs text-gray-500">
                        {new Date(advance.created_at).toLocaleTimeString()}
                      </div>
                    </td>
                    <td className="px-4 py-4 rtl:text-right ltr:text-left">
                      <div className="text-sm font-medium text-gray-900 break-words">{advance.supplierName}</div>
                      <div className="text-xs text-gray-500">{advance.reference}</div>
                    </td>
                    <td className="px-4 py-4 rtl:text-right ltr:text-left">
                      {advance.type === 'expense' ? (
                        <span className="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium bg-green-100 text-green-800 rtl:flex-row-reverse">
                          <TrendingUp className="w-3 h-3 rtl:ml-1 rtl:mr-0 ltr:mr-1 ltr:ml-0" />
                          {t('customers.given') || 'Given'}
                        </span>
                      ) : (
                        <span className="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium bg-red-100 text-red-800 rtl:flex-row-reverse">
                          <TrendingDown className="w-3 h-3 rtl:ml-1 rtl:mr-0 ltr:mr-1 ltr:ml-0" />
                          {t('customers.deducted') || 'Deducted'}
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-4 rtl:text-right ltr:text-left">
                      <div className={`text-sm font-semibold ${advance.advanceUSD > 0 ? 'text-green-600' : 'text-gray-400'}`}>
                        {advance.advanceUSD > 0 ? `$${formatCurrency(advance.advanceUSD)}` : '-'}
                      </div>
                    </td>
                    <td className="px-4 py-4 rtl:text-right ltr:text-left">
                      <div className={`text-sm font-semibold ${advance.advanceLBP > 0 ? 'text-blue-600' : 'text-gray-400'}`}>
                        {advance.advanceLBP > 0 ? `${formatCurrency(advance.advanceLBP)} ل.ل` : '-'}
                      </div>
                    </td>
                    <td className="px-4 py-4 rtl:text-right ltr:text-left">
                      {advance.reviewDate ? (
                        <div className="text-sm text-gray-900 flex">
                          <Calendar className="w-4 h-4 text-orange-500 flex-shrink-0 rtl:ml-1 rtl:mr-0 ltr:mr-1 ltr:ml-0" />
                          <span>{advance.reviewDate}</span>
                        </div>
                      ) : (
                        <span className="text-sm text-gray-400">-</span>
                      )}
                    </td>
                    <td className="px-4 py-4 whitespace-nowrap">
                      <div className="flex items-center justify-center rtl:flex-row-reverse">
                        <button
                          onClick={() => handleEditAdvance(advance)}
                          className="p-2.5 text-blue-600 hover:text-blue-700 hover:bg-blue-50 active:bg-blue-100 rounded-lg transition-all duration-200 shadow-sm hover:shadow-md focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-1"
                          title={t('customers.edit') || 'Edit'}
                          aria-label={t('customers.edit') || 'Edit'}
                        >
                          <Edit className="w-4 h-4" />
                        </button>
                        <button
                          onClick={() => handleDeleteAdvance(advance)}
                          className="p-2.5 text-red-600 hover:text-red-700 hover:bg-red-50 active:bg-red-100 rounded-lg transition-all duration-200 shadow-sm hover:shadow-md focus:outline-none focus:ring-2 focus:ring-red-500 focus:ring-offset-1"
                          title={t('customers.delete') || 'Delete'}
                          aria-label={t('customers.delete') || 'Delete'}
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination */}
        {totalPages > 1 && (
          <Pagination
            currentPage={currentPage}
            totalPages={totalPages}
            onPageChange={setCurrentPage}
            itemsPerPage={itemsPerPage}
            totalItems={filteredAdvances.length}
          />
        )}
      </div>

      {/* Supplier Form Modal */}
      <SupplierFormModal
        open={showSupplierForm}
        onClose={() => setShowSupplierForm(false)}
        onSuccess={async (supplierData) => {
          await addSupplier({
            name: supplierData.name!,
            phone: supplierData.phone!,
            email: supplierData.email || '',
            address: supplierData.address || '',
            lb_balance: 0,
            usd_balance: 0,
            advance_lb_balance: supplierData.advance_lb_balance || 0,
            advance_usd_balance: supplierData.advance_usd_balance || 0,
          });
          await refreshData();
          showToast(t('customers.supplierAdded'), 'success');
          setShowSupplierForm(false);
        }}
        existingSuppliers={suppliers}
      />
    </div>
  );
}


