import React, { useState, useMemo, useEffect, useCallback } from 'react';
import {
  Coins,
  Users,
  TrendingDown,
  TrendingUp,
  CalendarClock,
  Search,
  Plus,
  UserPlus,
  Edit,
  Trash2,
  History,
  Receipt,
  X,
} from 'lucide-react';
import { useI18n } from '../../../i18n';
import { Supplier, Transaction } from '../../../types';
import SupplierFormModal from '../../common/SupplierFormModal';
import SearchableSelect from '../../common/SearchableSelect';
import { StatCard } from '../../common/StatCard';
import { Pagination } from '../../../components/common/Pagination';
import { getTranslatedString } from '../../../utils/multilingual';
import { normalizeNameForComparison } from '../../../utils/nameNormalization';
import { getLocalDateString, getTodayLocalDate } from '../../../utils/dateUtils';
import { useOfflineData } from '../../../contexts/OfflineDataContext';
import { currencyService } from '../../../services/currencyService';
import { getLegacyBalance } from '../../../utils/currencyFieldMap';
import { TRANSACTION_CATEGORIES } from '../../../constants/transactionCategories';
import type { CurrencyCode } from '@pos-platform/shared';

// Advance transactions are identified by their accounting category. Deletes/edits
// mark the original transaction via `metadata.deleted` (the standard
// transactionService soft-delete), so we filter that out alongside `_deleted`.
const ADVANCE_CATEGORIES: string[] = [
  TRANSACTION_CATEGORIES.SUPPLIER_ADVANCE_GIVEN,
  TRANSACTION_CATEGORIES.SUPPLIER_ADVANCE_DEDUCTED,
];

function isVisibleAdvance(t: any): boolean {
  if (!t) return false;
  if (t._deleted || (t.metadata as any)?.deleted === true) return false;
  return ADVANCE_CATEGORIES.includes(t.category);
}

// Per-currency accent palette — keeps stat cards, the balances table and the
// history amounts visually keyed to the same colour for each currency. Mirrors
// the dashboard convention (currency 0 = emerald "money", currency 1 = blue).
type Accent = { border: string; icon: string; text: string; soft: string };
const CURRENCY_ACCENTS: Accent[] = [
  { border: 'border-emerald-500', icon: 'text-emerald-600', text: 'text-emerald-600', soft: 'bg-emerald-50' },
  { border: 'border-blue-500', icon: 'text-blue-600', text: 'text-blue-600', soft: 'bg-blue-50' },
  { border: 'border-violet-500', icon: 'text-violet-600', text: 'text-violet-600', soft: 'bg-violet-50' },
  { border: 'border-amber-500', icon: 'text-amber-600', text: 'text-amber-600', soft: 'bg-amber-50' },
];
const accentFor = (idx: number): Accent => CURRENCY_ACCENTS[idx % CURRENCY_ACCENTS.length];

// Shared field styling so every input/select in the form reads identically.
const labelClass = 'block text-sm font-medium text-gray-700 mb-1.5';
const inputClass =
  'w-full border border-gray-300 rounded-lg px-3 py-2.5 text-sm text-gray-900 bg-white focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-colors';

interface SupplierAdvancesProps {
  suppliers: Supplier[];
  transactions: Transaction[];
  formatCurrency: (amount: number) => string;
  formatCurrencyWithSymbol: (amount: number, currency: string) => string;
  showToast: (message: string, type: 'success' | 'error') => void;
  onProcessAdvance: (data: {
    supplierId: string;
    amount: number;
    currency: CurrencyCode;
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
  const { acceptedCurrencies, preferredCurrency, isMultiCurrency } = useOfflineData();

  // State
  const [searchTerm, setSearchTerm] = useState('');
  const [showAdvanceForm, setShowAdvanceForm] = useState(false);
  const [showSupplierForm, setShowSupplierForm] = useState(false);
  const [dateFilter, setDateFilter] = useState<'all' | 'today' | 'week' | 'month'>('all');
  const [currencyFilter, setCurrencyFilter] = useState<'all' | CurrencyCode>('all');
  const [editingAdvance, setEditingAdvance] = useState<Transaction | null>(null);
  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 20;

  // Advance form state
  const [advanceForm, setAdvanceForm] = useState({
    supplierId: '',
    amount: '',
    currency: preferredCurrency as CurrencyCode,
    type: 'give' as 'give' | 'deduct',
    description: '',
    date: getTodayLocalDate(),
    reviewDate: ''
  });

  // Options for the searchable supplier picker
  const supplierOptions = useMemo(
    () =>
      suppliers.map(s => ({
        id: s.id,
        label: s.name,
        value: s.id,
        category: s.phone || undefined,
      })),
    [suppliers]
  );

  // Calculate advance statistics
  const advanceStats = useMemo(() => {
    const totalsByCurrency: Partial<Record<CurrencyCode, number>> = {};
    for (const code of acceptedCurrencies) {
      totalsByCurrency[code] = suppliers.reduce(
        (sum, s) => sum + getLegacyBalance(s as unknown as Record<string, unknown>, code, 'advance'),
        0
      );
    }
    const suppliersWithAdvances = suppliers.filter(s =>
      acceptedCurrencies.some(code => getLegacyBalance(s as unknown as Record<string, unknown>, code, 'advance') > 0)
    ).length;

    // Get advance transactions (excluding deleted)
    const advanceTransactions = transactions.filter(isVisibleAdvance);

    return {
      totalsByCurrency,
      suppliersWithAdvances,
      totalTransactions: advanceTransactions.length
    };
  }, [suppliers, transactions, acceptedCurrencies]);

  // Get all advance transactions with supplier details
  const advanceTransactionsWithDetails = useMemo(() => {
    return transactions
      .filter(isVisibleAdvance)
      .map(transaction => {
        const supplier = suppliers.find(s => s.id === transaction.entity_id);

        // Convert description to string for processing
        const descriptionStr = typeof transaction.description === 'string'
          ? transaction.description
          : getTranslatedString(transaction.description, 'en', 'en');

        // Extract review date from description if it exists
        const reviewDateMatch = descriptionStr?.match(/\[Review: (.*?)\]/);
        const reviewDate = reviewDateMatch ? reviewDateMatch[1] : null;

        const txCurrency = (transaction.currency as CurrencyCode | undefined) ?? preferredCurrency;
        const amountByCurrency: Partial<Record<CurrencyCode, number>> = {};
        for (const code of acceptedCurrencies) {
          amountByCurrency[code] = txCurrency === code ? transaction.amount : 0;
        }
        return {
          ...transaction,
          supplierName: supplier?.name || 'Unknown Supplier',
          reviewDate: reviewDate,
          description: descriptionStr, // Store as string for easier filtering
          txCurrency,
          amountByCurrency,
        };
      })
      .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
  }, [transactions, suppliers, acceptedCurrencies, preferredCurrency]);

  // Filter advance transactions
  const filteredAdvances = useMemo(() => {
    let filtered = advanceTransactionsWithDetails;

    // Search filter
    if (searchTerm) {
      // Normalize search term for Arabic text (handles أ = ا normalization)
      const normalizedSearchTerm = normalizeNameForComparison(searchTerm);
      filtered = filtered.filter(adv =>
        normalizeNameForComparison(adv.supplierName).includes(normalizedSearchTerm) ||
        normalizeNameForComparison(adv.description || '').includes(normalizedSearchTerm) ||
        normalizeNameForComparison(adv.reference || '').includes(normalizedSearchTerm)
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

  const hasActiveFilters = !!searchTerm || dateFilter !== 'all' || currencyFilter !== 'all';

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
        currency: preferredCurrency,
        type: 'give',
        description: '',
        date: getTodayLocalDate(),
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
      supplierId: advance.entity_id || advance.supplier_id || '',
      amount: advance.amount.toString(),
      currency: advance.currency,
      type: advance.type === 'expense' ? 'give' : 'deduct',
      description: advance.description?.replace(/ \[Review: .*?\]$/, '') || '',
      date: advance.created_at ? getLocalDateString(new Date(advance.created_at).toISOString()) : getTodayLocalDate(),
      reviewDate: reviewDate
    });
    setShowAdvanceForm(true);
  };

  const handleCancelEdit = useCallback(() => {
    setEditingAdvance(null);
    setAdvanceForm({
      supplierId: '',
      amount: '',
      currency: 'USD',
      type: 'give',
      description: '',
      date: getTodayLocalDate(),
      reviewDate: ''
    });
    setShowAdvanceForm(false);
  }, []);

  // Close the Record-Advance modal on Escape, matching SupplierFormModal.
  useEffect(() => {
    if (!showAdvanceForm) return;
    const handleEsc = (e: KeyboardEvent) => {
      if (e.key === 'Escape') handleCancelEdit();
    };
    window.addEventListener('keydown', handleEsc);
    return () => window.removeEventListener('keydown', handleEsc);
  }, [showAdvanceForm, handleCancelEdit]);

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

  // Give / Deduct segmented control config — mirrors the table's Given/Deducted badges.
  const typeOptions = [
    {
      key: 'give' as const,
      label: t('customers.giveAdvance'),
      Icon: TrendingUp,
      on: 'border-emerald-500 bg-emerald-50 text-emerald-700',
    },
    {
      key: 'deduct' as const,
      label: t('customers.deductAdvance'),
      Icon: TrendingDown,
      on: 'border-red-500 bg-red-50 text-red-700',
    },
  ];

  return (
    <div className="space-y-6">
      {/* Statistics Cards */}
      <div
        className={`animate-rise grid grid-cols-1 gap-4 ${
          acceptedCurrencies.length === 1 ? 'md:grid-cols-2' :
          acceptedCurrencies.length === 2 ? 'md:grid-cols-3' :
          'md:grid-cols-4'
        }`}
      >
        {acceptedCurrencies.map((code, idx) => {
          const accent = accentFor(idx);
          return (
            <StatCard
              key={code}
              title={t('customers.totalAdvancesFor', { currency: code }) || `Total Advances (${code})`}
              value={currencyService.format(advanceStats.totalsByCurrency[code] || 0, code)}
              borderColor={accent.border}
              icon={<Coins className={`w-6 h-6 ${accent.icon}`} />}
            />
          );
        })}

        <StatCard
          title={t('customers.suppliersWithAdvances')}
          value={advanceStats.suppliersWithAdvances}
          borderColor="border-orange-500"
          icon={<Users className="w-6 h-6 text-orange-600" />}
        >
          <div className="flex items-center gap-1.5 mt-2 text-xs text-gray-500">
            <History className="w-3.5 h-3.5" />
            <span>
              {advanceStats.totalTransactions} {t('customers.advanceHistory') || 'Advance History'}
            </span>
          </div>
        </StatCard>
      </div>

      {/* Suppliers with Current Advances */}
      {advanceStats.suppliersWithAdvances > 0 && (
        <div className="animate-rise bg-white rounded-xl shadow-sm hover:shadow-md transition-shadow duration-200 overflow-hidden" style={{ animationDelay: '60ms' }}>
          <div className="flex items-center gap-3 px-6 py-5 border-b border-gray-100">
            <div className="p-2.5 bg-emerald-50 rounded-full flex-shrink-0">
              <Coins className="w-5 h-5 text-emerald-600" />
            </div>
            <h3 className="text-lg font-semibold text-gray-900">{t('customers.suppliersWithAdvances') || 'Suppliers with Advances'}</h3>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-gray-50/80">
                <tr>
                  <th className="px-6 py-3 rtl:text-right ltr:text-left text-xs font-semibold uppercase tracking-wider text-gray-500">{t('payments.supplier') || 'Supplier'}</th>
                  {acceptedCurrencies.map(code => (
                    <th key={code} className="px-4 py-3 rtl:text-right ltr:text-left text-xs font-semibold uppercase tracking-wider text-gray-500">
                      {t('customers.advanceFor', { currency: code }) || `${code} Advance`}
                    </th>
                  ))}
                  <th className="px-6 py-3 rtl:text-right ltr:text-left text-xs font-semibold uppercase tracking-wider text-gray-500">{t('common.labels.contact') || 'Contact'}</th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-100">
                {suppliers
                  .filter(s => acceptedCurrencies.some(code => getLegacyBalance(s as unknown as Record<string, unknown>, code, 'advance') > 0))
                  .map(supplier => (
                    <tr key={supplier.id} className="hover:bg-gray-50/70 transition-colors">
                      <td className="px-6 py-3.5">
                        <div className="flex items-center gap-3">
                          <div className="w-9 h-9 rounded-full bg-gray-100 text-gray-600 flex items-center justify-center text-sm font-semibold flex-shrink-0">
                            {supplier.name?.trim()?.charAt(0)?.toUpperCase() || '#'}
                          </div>
                          <div className="min-w-0">
                            <div className="text-sm font-medium text-gray-900 truncate">{supplier.name}</div>
                            {supplier.address && (
                              <div className="text-xs text-gray-500 truncate">{supplier.address}</div>
                            )}
                          </div>
                        </div>
                      </td>
                      {acceptedCurrencies.map((code, idx) => {
                        const value = getLegacyBalance(supplier as unknown as Record<string, unknown>, code, 'advance');
                        const accent = accentFor(idx);
                        return (
                          <td key={code} className="px-4 py-3.5">
                            {value > 0 ? (
                              <span className={`inline-flex items-center rounded-md px-2 py-0.5 text-sm font-semibold ${accent.soft} ${accent.text}`}>
                                {currencyService.format(value, code)}
                              </span>
                            ) : (
                              <span className="text-sm text-gray-300">—</span>
                            )}
                          </td>
                        );
                      })}
                      <td className="px-6 py-3.5">
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
      <div className="animate-rise flex flex-wrap gap-3" style={{ animationDelay: '120ms' }}>
        <button
          onClick={() => (showAdvanceForm ? handleCancelEdit() : setShowAdvanceForm(true))}
          className="inline-flex items-center gap-2 px-4 py-2.5 bg-blue-600 text-white text-sm font-medium rounded-lg shadow-sm hover:bg-blue-700 hover:shadow active:bg-blue-800 transition-all duration-200 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2"
        >
          <Plus className="w-5 h-5" />
          {t('customers.supplierRecordAdvance')}
        </button>
        <button
          onClick={() => setShowSupplierForm(true)}
          className="inline-flex items-center gap-2 px-4 py-2.5 bg-white text-gray-700 text-sm font-medium rounded-lg border border-gray-300 shadow-sm hover:bg-gray-50 hover:border-gray-400 active:bg-gray-100 transition-all duration-200 focus:outline-none focus:ring-2 focus:ring-gray-400 focus:ring-offset-2"
        >
          <UserPlus className="w-5 h-5 text-green-600" />
          {t('customers.addSupplier')}
        </button>
      </div>

      {/* Advance Form — modal popup, consistent with the Add Supplier modal */}
      {showAdvanceForm && (
        <div className="animate-modal-fade fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
          <div
            role="dialog"
            aria-modal="true"
            className="animate-modal-pop bg-white rounded-xl shadow-xl w-full max-w-2xl max-h-[90vh] overflow-y-auto"
          >
            <div className="flex items-center justify-between px-6 py-5 border-b border-gray-100">
              <div className="flex items-center gap-3">
                <div className={`p-2.5 rounded-full flex-shrink-0 ${advanceForm.type === 'give' ? 'bg-emerald-50' : 'bg-red-50'}`}>
                  {advanceForm.type === 'give'
                    ? <TrendingUp className="w-5 h-5 text-emerald-600" />
                    : <TrendingDown className="w-5 h-5 text-red-600" />}
                </div>
                <div>
                  <h2 className="text-xl font-semibold text-gray-900">
                    {editingAdvance ? (t('customers.editAdvance') || 'Edit Advance Transaction') : (t('customers.recordAdvancePayment') || 'Record Advance Payment')}
                  </h2>
                  <p className="text-xs text-gray-500 mt-0.5">
                    {t('customers.reviewDateHint') || 'Set a date to review or settle this advance'}
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={handleCancelEdit}
                className="p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg transition-colors focus:outline-none focus:ring-2 focus:ring-gray-300"
                aria-label={t('customers.cancel') || 'Cancel'}
              >
                <X className="w-6 h-6" />
              </button>
            </div>

            <form onSubmit={editingAdvance ? handleUpdateAdvance : handleSubmitAdvance} className="p-6 space-y-5">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                <div>
                  <label className={labelClass}>
                    {t('payments.supplier')} *
                  </label>
                  <SearchableSelect
                    options={supplierOptions}
                    value={advanceForm.supplierId}
                    onChange={(val) => setAdvanceForm({ ...advanceForm, supplierId: val as string })}
                    placeholder={t('payments.selectSupplier')}
                    searchPlaceholder={t('common.placeholders.search') || 'Search...'}
                    noResultsText={t('customers.noSuppliersFound') || 'No suppliers found'}
                    clearable
                  />
                </div>

                <div>
                  <label className={labelClass}>
                    {t('common.labels.type')} *
                  </label>
                  <div className="grid grid-cols-2 gap-2">
                    {typeOptions.map(opt => {
                      const selected = advanceForm.type === opt.key;
                      return (
                        <button
                          key={opt.key}
                          type="button"
                          disabled={!!editingAdvance}
                          aria-pressed={selected}
                          onClick={() => setAdvanceForm({ ...advanceForm, type: opt.key })}
                          className={`flex items-center justify-center gap-2 px-3 py-2.5 rounded-lg border text-sm font-medium transition-all duration-200 ${
                            selected
                              ? `${opt.on} shadow-sm`
                              : 'border-gray-200 bg-white text-gray-500 hover:border-gray-300 hover:bg-gray-50'
                          } ${editingAdvance ? 'opacity-60 cursor-not-allowed' : ''}`}
                        >
                          <opt.Icon className="w-4 h-4" />
                          {opt.label}
                        </button>
                      );
                    })}
                  </div>
                  {editingAdvance && (
                    <p className="text-xs text-gray-500 mt-1.5">
                      {t('customers.typeCannotBeChanged') || 'Type cannot be changed when editing'}
                    </p>
                  )}
                </div>

                <div>
                  <label className={labelClass}>
                    {t('payments.amount')} *
                  </label>
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    value={advanceForm.amount}
                    onChange={(e) => setAdvanceForm({ ...advanceForm, amount: e.target.value })}
                    className={inputClass}
                    placeholder="0.00"
                    required
                  />
                </div>

                {isMultiCurrency && (
                  <div>
                    <label className={labelClass}>
                      {t('payments.currency')} *
                    </label>
                    <select
                      value={advanceForm.currency}
                      onChange={(e) => setAdvanceForm({ ...advanceForm, currency: e.target.value as CurrencyCode })}
                      className={inputClass}
                      required
                    >
                      {acceptedCurrencies.map(code => (
                        <option key={code} value={code}>{t(`common.currency.${code}`) || code}</option>
                      ))}
                    </select>
                  </div>
                )}

                <div>
                  <label className={labelClass}>
                    {t('dashboard.date')} *
                  </label>
                  <input
                    type="date"
                    value={advanceForm.date}
                    onChange={(e) => setAdvanceForm({ ...advanceForm, date: e.target.value })}
                    className={`${inputClass} ${editingAdvance ? 'bg-gray-50 text-gray-500 cursor-not-allowed' : ''}`}
                    required
                    disabled={!!editingAdvance}
                  />
                  {editingAdvance && (
                    <p className="text-xs text-gray-500 mt-1.5">
                      {t('customers.dateCannotBeChanged') || 'Date cannot be changed when editing'}
                    </p>
                  )}
                </div>

                <div>
                  <label className={labelClass}>
                    {t('payments.description')}
                  </label>
                  <input
                    type="text"
                    value={advanceForm.description}
                    onChange={(e) => setAdvanceForm({ ...advanceForm, description: e.target.value })}
                    className={inputClass}
                    placeholder={t('common.placeholders.optional')}
                  />
                </div>

                <div>
                  <label className={labelClass}>
                    {t('customers.reviewDate')} <span className="font-normal text-gray-400">({t('common.placeholders.optional') || 'Optional'})</span>
                  </label>
                  <div className="relative">
                    <CalendarClock className="pointer-events-none absolute top-1/2 -translate-y-1/2 rtl:right-3 ltr:left-3 w-4 h-4 text-gray-400" />
                    <input
                      type="date"
                      value={advanceForm.reviewDate}
                      onChange={(e) => setAdvanceForm({ ...advanceForm, reviewDate: e.target.value })}
                      className={`${inputClass} rtl:pr-9 ltr:pl-9`}
                      min={getTodayLocalDate()}
                    />
                  </div>
                  <p className="text-xs text-gray-500 mt-1.5">
                    {t('customers.reviewDateHint') || 'Set a date to review or settle this advance'}
                  </p>
                </div>
              </div>

              <div className="flex justify-end gap-3 pt-2 border-t border-gray-100">
                <button
                  type="button"
                  onClick={handleCancelEdit}
                  className="px-4 py-2.5 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors focus:outline-none focus:ring-2 focus:ring-gray-400 focus:ring-offset-2"
                >
                  {t('customers.cancel')}
                </button>
                <button
                  type="submit"
                  className="inline-flex items-center gap-2 px-5 py-2.5 text-sm font-medium bg-blue-600 text-white rounded-lg shadow-sm hover:bg-blue-700 hover:shadow active:bg-blue-800 transition-all duration-200 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2"
                >
                  {editingAdvance ? (t('payments.saveChanges') || 'Save Changes') : (t('common.actions.submit') || 'Submit')}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Advance History Table */}
      <div className="animate-rise bg-white rounded-xl shadow-sm overflow-hidden" style={{ animationDelay: '180ms' }}>
        <div className="px-6 pt-5 pb-4 border-b border-gray-100">
          <div className="flex items-center gap-3 mb-4">
            <div className="p-2.5 bg-blue-50 rounded-full flex-shrink-0">
              <History className="w-5 h-5 text-blue-600" />
            </div>
            <h3 className="text-lg font-semibold text-gray-900">{t('customers.advanceHistory') || 'Advance History'}</h3>
            <span className="ml-auto rtl:ml-0 rtl:mr-auto inline-flex items-center rounded-full bg-gray-100 px-2.5 py-1 text-xs font-medium text-gray-600">
              {filteredAdvances.length}
            </span>
          </div>

          {/* Search and Filters */}
          <div className="flex gap-3 flex-wrap">
            <div className="relative flex-1 min-w-[200px]">
              <Search className="absolute rtl:right-3 ltr:left-3 top-1/2 -translate-y-1/2 text-gray-400 w-5 h-5 pointer-events-none" />
              <input
                type="text"
                placeholder={t('common.placeholders.search') || 'Search...'}
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className={`${inputClass} rtl:pr-10 ltr:pl-10`}
              />
            </div>
            <select
              value={dateFilter}
              onChange={(e) => setDateFilter(e.target.value as any)}
              className={`${inputClass} w-auto`}
            >
              <option value="all">{t('customers.allTime') || 'All Time'}</option>
              <option value="today">{t('customers.today') || 'Today'}</option>
              <option value="week">{t('customers.thisWeek') || 'This Week'}</option>
              <option value="month">{t('customers.thisMonth') || 'This Month'}</option>
            </select>
            {isMultiCurrency && (
              <select
                value={currencyFilter}
                onChange={(e) => setCurrencyFilter(e.target.value as 'all' | CurrencyCode)}
                className={`${inputClass} w-auto`}
              >
                <option value="all">{t('customers.allCurrencies') || 'All Currencies'}</option>
                {acceptedCurrencies.map(code => (
                  <option key={code} value={code}>{t(`common.currency.${code}`) || code}</option>
                ))}
              </select>
            )}
          </div>
        </div>

        {/* Advances Table */}
        <div className="overflow-x-auto">
          <table className="w-full table-auto">
            <thead className="bg-gray-50/80">
              <tr>
                <th className="px-4 py-3.5 rtl:text-right ltr:text-left text-xs font-semibold uppercase tracking-wider text-gray-500 min-w-[140px]">
                  {t('dashboard.date') || 'Date'}
                </th>
                <th className="px-4 py-3.5 rtl:text-right ltr:text-left text-xs font-semibold uppercase tracking-wider text-gray-500 min-w-[180px]">
                  {t('payments.supplier') || 'Supplier'}
                </th>
                <th className="px-4 py-3.5 rtl:text-right ltr:text-left text-xs font-semibold uppercase tracking-wider text-gray-500 min-w-[120px]">
                  {t('common.labels.type') || 'Type'}
                </th>
                {acceptedCurrencies.map(code => (
                  <th
                    key={code}
                    className="px-4 py-3.5 rtl:text-right ltr:text-left text-xs font-semibold uppercase tracking-wider text-gray-500 min-w-[120px]"
                  >
                    {t(`customers.advance${code}`) || code}
                  </th>
                ))}
                <th className="px-4 py-3.5 rtl:text-right ltr:text-left text-xs font-semibold uppercase tracking-wider text-gray-500 min-w-[150px]">
                  {t('customers.reviewDate') || 'Review Date'}
                </th>
                <th className="px-4 py-3.5 text-center text-xs font-semibold uppercase tracking-wider text-gray-500 min-w-[120px]">
                  {t('customers.actions') || 'Actions'}
                </th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-100">
              {filteredAdvances.length === 0 ? (
                <tr>
                  <td colSpan={5 + acceptedCurrencies.length} className="px-4 py-16 text-center">
                    <div className="flex flex-col items-center gap-3">
                      <div className="p-4 bg-gray-50 rounded-full">
                        <Receipt className="w-8 h-8 text-gray-300" />
                      </div>
                      <p className="text-sm text-gray-500">
                        {hasActiveFilters
                          ? t('customers.noAdvancesFound') || 'No advances found'
                          : t('customers.noAdvancesRecorded') || 'No advance transactions recorded yet'}
                      </p>
                    </div>
                  </td>
                </tr>
              ) : (
                paginatedAdvances.map(advance => (
                  <tr key={advance.id} className="hover:bg-gray-50/70 transition-colors">
                    <td className="px-4 py-4 rtl:text-right ltr:text-left">
                      <div className="text-sm font-medium text-gray-900">
                        {new Date(advance.created_at).toLocaleDateString()}
                      </div>
                      <div className="text-xs text-gray-500">
                        {new Date(advance.created_at).toLocaleTimeString()}
                      </div>
                    </td>
                    <td className="px-4 py-4 rtl:text-right ltr:text-left">
                      <div className="text-sm font-medium text-gray-900 break-words">{advance.supplierName}</div>
                      {advance.reference && <div className="text-xs text-gray-500">{advance.reference}</div>}
                    </td>
                    <td className="px-4 py-4 rtl:text-right ltr:text-left">
                      {advance.type === 'expense' ? (
                        <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium bg-emerald-100 text-emerald-800">
                          <TrendingUp className="w-3 h-3" />
                          {t('customers.given') || 'Given'}
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium bg-red-100 text-red-800">
                          <TrendingDown className="w-3 h-3" />
                          {t('customers.deducted') || 'Deducted'}
                        </span>
                      )}
                    </td>
                    {acceptedCurrencies.map((code, idx) => {
                      const value = advance.amountByCurrency?.[code] || 0;
                      const accent = accentFor(idx);
                      return (
                        <td key={code} className="px-4 py-4 rtl:text-right ltr:text-left">
                          {value > 0 ? (
                            <span className={`text-sm font-semibold ${accent.text}`}>
                              {currencyService.format(value, code)}
                            </span>
                          ) : (
                            <span className="text-sm text-gray-300">—</span>
                          )}
                        </td>
                      );
                    })}
                    <td className="px-4 py-4 rtl:text-right ltr:text-left">
                      {advance.reviewDate ? (
                        <div className="inline-flex items-center gap-1.5 rounded-md bg-orange-50 px-2 py-1 text-sm text-orange-700">
                          <CalendarClock className="w-4 h-4 flex-shrink-0" />
                          <span>{advance.reviewDate}</span>
                        </div>
                      ) : (
                        <span className="text-sm text-gray-300">—</span>
                      )}
                    </td>
                    <td className="px-4 py-4 whitespace-nowrap">
                      <div className="flex items-center justify-center gap-1.5">
                        <button
                          onClick={() => handleEditAdvance(advance)}
                          className="p-2.5 text-blue-600 hover:text-blue-700 hover:bg-blue-50 active:bg-blue-100 rounded-lg transition-all duration-200 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-1"
                          title={t('customers.edit') || 'Edit'}
                          aria-label={t('customers.edit') || 'Edit'}
                        >
                          <Edit className="w-4 h-4" />
                        </button>
                        <button
                          onClick={() => handleDeleteAdvance(advance)}
                          className="p-2.5 text-red-600 hover:text-red-700 hover:bg-red-50 active:bg-red-100 rounded-lg transition-all duration-200 focus:outline-none focus:ring-2 focus:ring-red-500 focus:ring-offset-1"
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
            lb_balance: supplierData.lb_balance || 0,
            usd_balance: supplierData.usd_balance || 0,
            advance_lb_balance: supplierData.advance_lb_balance || 0,
            advance_usd_balance: supplierData.advance_usd_balance || 0,
          });
          // addSupplier() already refreshed context data internally.
          showToast(t('customers.supplierAdded'), 'success');
          setShowSupplierForm(false);
        }}
        existingSuppliers={suppliers}
      />
    </div>
  );
}
