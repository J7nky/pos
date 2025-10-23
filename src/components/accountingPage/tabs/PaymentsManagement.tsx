import React, { useState, useMemo } from "react";
import {
  Plus,
  Search,
  Filter,
  DollarSign,
  TrendingUp,
  Edit3,
  Trash2,
  X,
  ChevronDown,
  ArrowUpDown,
  Eye,
  Download,
  RefreshCw
} from "lucide-react";
import { paymentService, PaymentTransaction } from "../../../services/paymentService";
import { isPaymentCategory, PAYMENT_CATEGORIES, getPaymentDirection, getPaymentEntityType } from "../../../constants/paymentCategories";
import { paymentManagementService, PaymentUpdateData } from "../../../services/paymentManagementService";
import { useI18n } from "../../../i18n";

type Currency = "USD" | "LBP";

type Transaction = {
  id: string;
  type: "income" | "expense";
  amount: number;
  currency: Currency;
  category: string;
  description: string;
  created_at: string;
  reference: string | null;
  customer_id: string | null;
  supplier_id: string | null;
  store_id: string;
  created_by: string;
};

type ExpenseCategory = {
  id: string;
  name: string;
  description: string;
  is_active: boolean;
};

type PaymentsManagementProps = {
  expenseCategories: ExpenseCategory[];
  transactions: Transaction[];
  today: string;
  currency: Currency;
  setShowForm: (formType: "expense" | null) => void;
  formatCurrency: (value: number) => string;
  formatCurrencyWithSymbol: (value: number, currency: Currency) => string;
  getConvertedAmount: (amount: number, targetCurrency: Currency) => number;
  customers?: Array<{ id: string; name: string }>;
  suppliers?: Array<{ id: string; name: string }>;
  onUpdateTransaction?: (transactionId: string, updates: Partial<Transaction>) => Promise<void>;
  onDeleteTransaction?: (transactionId: string) => Promise<void>;
  showToast?: (message: string, type?: 'success' | 'error') => void;
};

interface PaymentEditModal {
  isOpen: boolean;
  payment: Transaction | null;
}

interface PaymentFilters {
  search: string;
  dateRange: {
    start: string;
    end: string;
  };
  category: string;
  entityType: 'all' | 'customer' | 'supplier';
  entityId: string;
  direction: 'all' | 'received' | 'paid';
  currency: 'all' | 'USD' | 'LBP';
  amountRange: {
    min: string;
    max: string;
  };
}

const PaymentsSummaryCards: React.FC<{
  payments: PaymentTransaction[];
  formatCurrency: (value: number) => string;
  currency: Currency;
}> = ({ payments, formatCurrency }) => {
  const { t } = useI18n();
  
  const summary = useMemo(() => {
    const received = payments.filter(p => p.paymentDirection === 'received');
    const paid = payments.filter(p => p.paymentDirection === 'paid');
    
    return {
      totalReceived: received.reduce((sum, p) => sum + p.amount, 0),
      totalPaid: paid.reduce((sum, p) => sum + p.amount, 0),
      receivedCount: received.length,
      paidCount: paid.length,
      netAmount: received.reduce((sum, p) => sum + p.amount, 0) - paid.reduce((sum, p) => sum + p.amount, 0)
    };
  }, [payments]);

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
      <div className="bg-gradient-to-br from-green-50 to-green-100 rounded-xl p-6 border border-green-200">
        <div className="flex items-center justify-between rtl:flex-row-reverse">
          <div className="rtl:text-right">
            <p className="text-sm font-medium text-green-700">{t('payments.paymentsReceived')}</p>
            <p className="text-2xl font-bold text-green-900 mt-1">{formatCurrency(summary.totalReceived)}</p>
            <p className="text-xs text-green-600 mt-1">{summary.receivedCount} {t('common.transactions')}</p>
          </div>
          <div className="p-3 bg-green-200 rounded-lg rtl:ml-3 ltr:mr-3">
            <TrendingUp className="w-6 h-6 text-green-700" />
          </div>
        </div>
      </div>

      <div className="bg-gradient-to-br from-red-50 to-red-100 rounded-xl p-6 border border-red-200">
        <div className="flex items-center justify-between rtl:flex-row-reverse">
          <div className="rtl:text-right">
            <p className="text-sm font-medium text-red-700">{t('payments.paymentsMade')}</p>
            <p className="text-2xl font-bold text-red-900 mt-1">{formatCurrency(summary.totalPaid)}</p>
            <p className="text-xs text-red-600 mt-1">{summary.paidCount} {t('common.transactions')}</p>
          </div>
          <div className="p-3 bg-red-200 rounded-lg rtl:ml-3 ltr:mr-3">
            <DollarSign className="w-6 h-6 text-red-700" />
          </div>
        </div>
      </div>

      <div className="bg-gradient-to-br from-blue-50 to-blue-100 rounded-xl p-6 border border-blue-200">
        <div className="flex items-center justify-between rtl:flex-row-reverse">
          <div className="rtl:text-right">
            <p className="text-sm font-medium text-blue-700">{t('payments.netAmount')}</p>
            <p className={`text-2xl font-bold mt-1 ${
              summary.netAmount >= 0 ? 'text-green-900' : 'text-red-900'
            }`}>
              {formatCurrency(Math.abs(summary.netAmount))}
            </p>
            <p className="text-xs text-blue-600 mt-1">
              {summary.netAmount >= 0 ? t('payments.netPositive') : t('payments.netNegative')}
            </p>
          </div>
          <div className="p-3 bg-blue-200 rounded-lg rtl:ml-3 ltr:mr-3">
            <ArrowUpDown className="w-6 h-6 text-blue-700" />
          </div>
        </div>
      </div>

      <div className="bg-gradient-to-br from-purple-50 to-purple-100 rounded-xl p-6 border border-purple-200">
        <div className="flex items-center justify-between rtl:flex-row-reverse">
          <div className="rtl:text-right">
            <p className="text-sm font-medium text-purple-700">{t('payments.totalTransactions')}</p>
            <p className="text-2xl font-bold text-purple-900 mt-1">{payments.length}</p>
            <p className="text-xs text-purple-600 mt-1">{t('payments.allPaymentActivities')}</p>
          </div>
          <div className="p-3 bg-purple-200 rounded-lg rtl:ml-3 ltr:mr-3">
            <RefreshCw className="w-6 h-6 text-purple-700" />
          </div>
        </div>
      </div>
    </div>
  );
};

const PaymentFiltersPanel: React.FC<{
  filters: PaymentFilters;
  onFiltersChange: (filters: PaymentFilters) => void;
  customers: Array<{ id: string; name: string }>;
  suppliers: Array<{ id: string; name: string }>;
  categories: string[];
}> = ({ filters, onFiltersChange, customers, suppliers, categories }) => {
  const { t } = useI18n();
  const [isExpanded, setIsExpanded] = useState(false);

  const updateFilters = (updates: Partial<PaymentFilters>) => {
    onFiltersChange({ ...filters, ...updates });
  };

  return (
    <div className="bg-white rounded-xl shadow-sm border border-gray-200 mb-6">
      <div className="p-4 border-b border-gray-100">
        <button
          onClick={() => setIsExpanded(!isExpanded)}
          className="flex items-center justify-between w-full text-left rtl:flex-row-reverse"
        >
          <div className="flex items-center space-x-2 rtl:space-x-reverse">
            <Filter className="w-5 h-5 text-gray-500" />
            <h3 className="text-lg font-medium text-gray-900">{t('payments.filtersAndSearch')}</h3>
          </div>
          <ChevronDown className={`w-5 h-5 text-gray-500 transition-transform ${
            isExpanded ? 'rotate-180' : ''
          }`} />
        </button>
      </div>

      {isExpanded && (
        <div className="p-6 space-y-4">
          {/* Search */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2 rtl:text-right">{t('payments.search')}</label>
            <div className="relative">
              <Search className="w-4 h-4 absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 rtl:left-auto rtl:right-3" />
              <input
                type="text"
                placeholder={t('payments.searchPlaceholder')}
                value={filters.search}
                onChange={(e) => updateFilters({ search: e.target.value })}
                className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent rtl:pl-4 rtl:pr-10"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            {/* Date Range */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2 rtl:text-right">{t('payments.dateRange')}</label>
              <div className="space-y-2">
                <input
                  type="date"
                  value={filters.dateRange.start}
                  onChange={(e) => updateFilters({ dateRange: { ...filters.dateRange, start: e.target.value } })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent text-sm"
                />
                <input
                  type="date"
                  value={filters.dateRange.end}
                  onChange={(e) => updateFilters({ dateRange: { ...filters.dateRange, end: e.target.value } })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent text-sm"
                />
              </div>
            </div>

            {/* Category */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2 rtl:text-right">{t('payments.category')}</label>
              <select
                value={filters.category}
                onChange={(e) => updateFilters({ category: e.target.value })}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              >
                <option value="">{t('payments.allCategories')}</option>
                {categories.map(category => (
                  <option key={category} value={category}>{translatePaymentCategory(category)}</option>
                ))}
              </select>
            </div>

            {/* Entity Type */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2 rtl:text-right">{t('payments.entityType')}</label>
              <select
                value={filters.entityType}
                onChange={(e) => updateFilters({ entityType: e.target.value as any, entityId: '' })}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              >
                <option value="all">{t('payments.allEntities')}</option>
                <option value="customer">{t('payments.customers')}</option>
                <option value="supplier">{t('payments.suppliers')}</option>
              </select>
            </div>

            {/* Entity Selection */}
            {filters.entityType !== 'all' && (
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2 rtl:text-right">
                  {filters.entityType === 'customer' ? t('payments.customer') : t('payments.supplier')}
                </label>
                <select
                  value={filters.entityId}
                  onChange={(e) => updateFilters({ entityId: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                >
                  <option value="">{filters.entityType === 'customer' ? t('payments.allCustomers') : t('payments.allSuppliers')}</option>
                  {(filters.entityType === 'customer' ? customers : suppliers).map(entity => (
                    <option key={entity.id} value={entity.id}>{entity.name}</option>
                  ))}
                </select>
              </div>
            )}
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {/* Direction */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2 rtl:text-right">{t('payments.direction')}</label>
              <select
                value={filters.direction}
                onChange={(e) => updateFilters({ direction: e.target.value as any })}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              >
                <option value="all">{t('payments.allDirections')}</option>
                <option value="received">{t('payments.received')}</option>
                <option value="paid">{t('payments.paid')}</option>
              </select>
            </div>

            {/* Currency */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2 rtl:text-right">{t('payments.currency')}</label>
              <select
                value={filters.currency}
                onChange={(e) => updateFilters({ currency: e.target.value as any })}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              >
                <option value="all">{t('payments.allCurrencies')}</option>
                <option value="USD">USD</option>
                <option value="LBP">LBP</option>
              </select>
            </div>

            {/* Amount Range */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2 rtl:text-right">{t('payments.amountRange')}</label>
              <div className="flex space-x-2 rtl:space-x-reverse">
                <input
                  type="number"
                  placeholder={t('payments.min')}
                  value={filters.amountRange.min}
                  onChange={(e) => updateFilters({ amountRange: { ...filters.amountRange, min: e.target.value } })}
                  className="flex-1 px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent text-sm"
                />
                <input
                  type="number"
                  placeholder={t('payments.max')}
                  value={filters.amountRange.max}
                  onChange={(e) => updateFilters({ amountRange: { ...filters.amountRange, max: e.target.value } })}
                  className="flex-1 px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent text-sm"
                />
              </div>
            </div>
          </div>

          {/* Clear Filters */}
          <div className="flex justify-end pt-4 border-t border-gray-100 rtl:justify-start">
            <button
              onClick={() => onFiltersChange({
                search: '',
                dateRange: { start: '', end: '' },
                category: '',
                entityType: 'all',
                entityId: '',
                direction: 'all',
                currency: 'all',
                amountRange: { min: '', max: '' }
              })}
              className="px-4 py-2 text-sm text-gray-600 hover:text-gray-800 hover:bg-gray-100 rounded-lg transition-colors"
            >
              {t('payments.clearAllFilters')}
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

const PaymentEditModal: React.FC<{
  isOpen: boolean;
  payment: Transaction | null;
  onClose: () => void;
  onSave: (updates: Partial<Transaction>) => Promise<void>;
  customers: Array<{ id: string; name: string }>;
  suppliers: Array<{ id: string; name: string }>;
  formatCurrency: (value: number) => string;
  translatePaymentCategory: (category: string) => string;
}> = ({ isOpen, payment, onClose, onSave, customers, suppliers, translatePaymentCategory }) => {
  const { t } = useI18n();
  const [formData, setFormData] = useState<Partial<Transaction>>({});
  const [isLoading, setIsLoading] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});

  // Initialize form data when payment changes
  React.useEffect(() => {
    if (payment) {
      setFormData({
        amount: payment.amount,
        currency: payment.currency,
        description: payment.description,
        reference: payment.reference,
        customer_id: payment.customer_id,
        supplier_id: payment.supplier_id,
        category: payment.category
      });
    }
  }, [payment]);

  const handleSave = async () => {
    if (!payment) return;

    // Validate form
    const newErrors: Record<string, string> = {};
    if (!formData.amount || formData.amount <= 0) {
      newErrors.amount = t('payments.amountRequired');
    }
    if (!formData.description?.trim()) {
      newErrors.description = t('payments.descriptionRequired');
    }
    if (!formData.customer_id && !formData.supplier_id) {
      newErrors.entity = t('payments.entityRequired');
    }
    if (formData.customer_id && formData.supplier_id) {
      newErrors.entity = t('payments.bothEntitiesError');
    }

    setErrors(newErrors);
    if (Object.keys(newErrors).length > 0) return;

    setIsLoading(true);
    try {
      await onSave(formData);
      onClose();
    } catch (error) {
      setErrors({ general: t('payments.updateFailed') });
    } finally {
      setIsLoading(false);
    }
  };

  if (!isOpen || !payment) return null;

  const entityType = getPaymentEntityType(payment);
  const paymentDirection = getPaymentDirection(payment);

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
      <div className="bg-white rounded-xl shadow-xl max-w-2xl w-full max-h-[90vh] overflow-y-auto">
        <div className="p-6 border-b border-gray-200">
          <div className="flex items-center justify-between rtl:flex-row-reverse">
            <div className="rtl:text-right">
              <h2 className="text-xl font-semibold text-gray-900">{t('payments.editPayment')}</h2>
              <p className="text-sm text-gray-600 mt-1">
                {paymentDirection === 'received' ? t('payments.paymentReceived') : t('payments.paymentMade')} •
                <span className={`inline-flex items-center px-2 py-1 rounded-full text-xs font-medium rtl:ml-1 ltr:mr-1 ${
                  entityType === 'customer' ? 'bg-blue-100 text-blue-800' : 
                  entityType === 'supplier' ? 'bg-purple-100 text-purple-800' : 
                  'bg-gray-100 text-gray-800'
                }`}>
                  {entityType === 'customer' ? t('payments.customer') : entityType === 'supplier' ? t('payments.supplier') : t('payments.unknown')}
                </span>
              </p>
            </div>
            <button
              onClick={onClose}
              className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
            >
              <X className="w-5 h-5 text-gray-500" />
            </button>
          </div>
        </div>

        <div className="p-6 space-y-6">
          {errors.general && (
            <div className="p-3 bg-red-50 border border-red-200 rounded-lg">
              <p className="text-sm text-red-600">{errors.general}</p>
            </div>
          )}

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* Amount */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2 rtl:text-right">
                {t('payments.amount')} *
              </label>
              <div className="relative">
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  value={formData.amount || ''}
                  onChange={(e) => setFormData({ ...formData, amount: parseFloat(e.target.value) || 0 })}
                  className={`w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent ${
                    errors.amount ? 'border-red-300' : 'border-gray-300'
                  }`}
                  placeholder="0.00"
                />
              </div>
              {errors.amount && (
                <p className="text-xs text-red-600 mt-1 rtl:text-right">{errors.amount}</p>
              )}
            </div>

            {/* Currency */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2 rtl:text-right">
                {t('payments.currency')}
              </label>
              <select
                value={formData.currency || 'USD'}
                onChange={(e) => setFormData({ ...formData, currency: e.target.value as Currency })}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              >
                <option value="USD">USD</option>
                <option value="LBP">LBP</option>
              </select>
            </div>
          </div>

          {/* Description */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2 rtl:text-right">
              {t('payments.description')} *
            </label>
            <textarea
              value={formData.description || ''}
              onChange={(e) => setFormData({ ...formData, description: e.target.value })}
              rows={3}
              className={`w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent ${
                errors.description ? 'border-red-300' : 'border-gray-300'
              }`}
              placeholder={t('payments.descriptionPlaceholder')}
            />
            {errors.description && (
              <p className="text-xs text-red-600 mt-1 rtl:text-right">{errors.description}</p>
            )}
          </div>

          {/* Reference */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2 rtl:text-right">
              {t('payments.reference')}
            </label>
            <input
              type="text"
              value={formData.reference || ''}
              onChange={(e) => setFormData({ ...formData, reference: e.target.value || null })}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              placeholder={t('payments.referencePlaceholder')}
            />
          </div>

          {/* Entity Selection */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2 rtl:text-right">
              {t('payments.relatedEntity')} *
            </label>
            <div className="space-y-3">
              {/* Customer Selection */}
              <div>
                <label className="block text-sm text-gray-600 mb-1 rtl:text-right">{t('payments.customer')}</label>
                <select
                  value={formData.customer_id || ''}
                  onChange={(e) => setFormData({ 
                    ...formData, 
                    customer_id: e.target.value || null,
                    supplier_id: e.target.value ? null : formData.supplier_id
                  })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                >
                  <option value="">{t('payments.selectCustomer')}</option>
                  {customers.map(customer => (
                    <option key={customer.id} value={customer.id}>{customer.name}</option>
                  ))}
                </select>
              </div>

              {/* Supplier Selection */}
              <div>
                <label className="block text-sm text-gray-600 mb-1 rtl:text-right">{t('payments.supplier')}</label>
                <select
                  value={formData.supplier_id || ''}
                  onChange={(e) => setFormData({ 
                    ...formData, 
                    supplier_id: e.target.value || null,
                    customer_id: e.target.value ? null : formData.customer_id
                  })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                >
                  <option value="">{t('payments.selectSupplier')}</option>
                  {suppliers.map(supplier => (
                    <option key={supplier.id} value={supplier.id}>{supplier.name}</option>
                  ))}
                </select>
              </div>
            </div>
            {errors.entity && (
              <p className="text-xs text-red-600 mt-1 rtl:text-right">{errors.entity}</p>
            )}
          </div>

          {/* Payment Category */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2 rtl:text-right">
              {t('payments.category')}
            </label>
            <select
              value={formData.category || ''}
              onChange={(e) => setFormData({ ...formData, category: e.target.value })}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            >
              {Object.values(PAYMENT_CATEGORIES).map(category => (
                <option key={category} value={category}>{translatePaymentCategory(category)}</option>
              ))}
            </select>
          </div>
        </div>

        <div className="p-6 border-t border-gray-200 flex justify-end space-x-3 rtl:justify-start rtl:space-x-reverse">
          <button
            onClick={onClose}
            disabled={isLoading}
            className="px-4 py-2 text-gray-700 bg-gray-100 hover:bg-gray-200 rounded-lg transition-colors disabled:opacity-50"
          >
            {t('payments.cancel')}
          </button>
          <button
            onClick={handleSave}
            disabled={isLoading}
            className="px-4 py-2 bg-blue-600 text-white hover:bg-blue-700 rounded-lg transition-colors disabled:opacity-50 flex items-center"
          >
            {isLoading ? (
              <>
                <RefreshCw className="w-4 h-4 rtl:ml-2 ltr:mr-2 animate-spin" />
                {t('payments.saving')}
              </>
            ) : (
              t('payments.saveChanges')
            )}
          </button>
        </div>
      </div>
    </div>
  );
};

const PaymentsTable: React.FC<{
  payments: PaymentTransaction[];
  formatCurrency: (value: number) => string;
  formatCurrencyWithSymbol: (value: number, currency: Currency) => string;
  getConvertedAmount: (amount: number, targetCurrency: Currency) => number;
  currency: Currency;
  customers: Array<{ id: string; name: string }>;
  suppliers: Array<{ id: string; name: string }>;
  onEdit: (payment: Transaction) => void;
  onDelete: (payment: Transaction) => void;
  onView: (payment: Transaction) => void;
  translatePaymentCategory: (category: string) => string;
}> = ({ 
  payments, 
  formatCurrency, 
  formatCurrencyWithSymbol, 
  getConvertedAmount, 
  currency, 
  customers, 
  suppliers,
  onEdit,
  onDelete,
  onView,
  translatePaymentCategory
}) => {
  const { t } = useI18n();
  const [sortField, setSortField] = useState<'created_at' | 'amount' | 'category'>('created_at');
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('desc');
  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 20;

  const handleSort = (field: 'created_at' | 'amount' | 'category') => {
    if (sortField === field) {
      setSortDirection(sortDirection === 'asc' ? 'desc' : 'asc');
    } else {
      setSortField(field);
      setSortDirection('desc');
    }
  };

  const sortedPayments = useMemo(() => {
    return [...payments].sort((a, b) => {
      let aValue: any, bValue: any;
      
      switch (sortField) {
        case 'created_at':
          aValue = new Date(a.created_at).getTime();
          bValue = new Date(b.created_at).getTime();
          break;
        case 'amount':
          aValue = a.amount;
          bValue = b.amount;
          break;
        case 'category':
          aValue = a.category.toLowerCase();
          bValue = b.category.toLowerCase();
          break;
        default:
          aValue = new Date(a.created_at).getTime();
          bValue = new Date(b.created_at).getTime();
      }
      
      if (sortDirection === 'asc') {
        return aValue > bValue ? 1 : -1;
      } else {
        return aValue < bValue ? 1 : -1;
      }
    });
  }, [payments, sortField, sortDirection]);

  const paginatedPayments = useMemo(() => {
    const startIndex = (currentPage - 1) * itemsPerPage;
    return sortedPayments.slice(startIndex, startIndex + itemsPerPage);
  }, [sortedPayments, currentPage]);

  const totalPages = Math.ceil(sortedPayments.length / itemsPerPage);

  const getEntityName = (payment: PaymentTransaction) => {
    if (payment.customer_id) {
      const customer = customers.find(c => c.id === payment.customer_id);
      return customer?.name || t('payments.unknownCustomer');
    }
    if (payment.supplier_id) {
      const supplier = suppliers.find(s => s.id === payment.supplier_id);
      return supplier?.name || t('payments.unknownSupplier');
    }
    return t('payments.noEntity');
  };

  const getDirectionBadge = (direction: string) => {
    return direction === 'received' ? (
      <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-800">
        {t('payments.received')}
      </span>
    ) : (
      <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-red-100 text-red-800">
        {t('payments.paid')}
      </span>
    );
  };

  const getEntityTypeBadge = (entityType: string) => {
    return entityType === 'customer' ? (
      <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-blue-100 text-blue-800">
        {t('payments.customer')}
      </span>
    ) : entityType === 'supplier' ? (
      <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-purple-100 text-purple-800">
        {t('payments.supplier')}
      </span>
    ) : (
      <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-gray-100 text-gray-800">
        {t('payments.unknown')}
      </span>
    );
  };

  if (payments.length === 0) {
    return (
      <div className="bg-white rounded-xl shadow-sm border border-gray-200">
        <div className="p-12 text-center">
          <DollarSign className="w-16 h-16 text-gray-300 mx-auto mb-4" />
          <h3 className="text-lg font-medium text-gray-900 mb-2">{t('payments.noPaymentsFound')}</h3>
          <p className="text-gray-500">{t('payments.noPaymentsMessage')}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-white rounded-xl shadow-sm border border-gray-200">
      <div className="p-6 border-b border-gray-100">
        <div className="flex items-center justify-between rtl:flex-row-reverse">
          <div className="rtl:text-right">
            <h3 className="text-lg font-semibold text-gray-900">{t('payments.paymentTransactions')}</h3>
            <p className="text-sm text-gray-600 mt-1">
              {t('payments.showingResults', { current: paginatedPayments.length, total: sortedPayments.length })}
            </p>
          </div>
          <div className="flex items-center space-x-2 rtl:space-x-reverse">
            <button
              onClick={() => {
                const csvContent = generateCSVContent(sortedPayments, customers, suppliers);
                downloadCSV(csvContent, 'payments-export.csv');
              }}
              className="inline-flex items-center px-3 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors"
            >
              <Download className="w-4 h-4 rtl:ml-2 ltr:mr-2" />
              {t('payments.exportCSV')}
            </button>
          </div>
        </div>
      </div>

      <div className="overflow-x-auto">
        <table className="min-w-full divide-y divide-gray-200">
          <thead className="bg-gray-50">
            <tr>
              <th 
                onClick={() => handleSort('created_at')}
                className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider cursor-pointer hover:bg-gray-100 transition-colors rtl:text-right"
              >
                <div className="flex items-center space-x-1 rtl:space-x-reverse">
                  <span>{t('payments.dateTime')}</span>
                  {sortField === 'created_at' && (
                    <ArrowUpDown className={`w-4 h-4 ${sortDirection === 'desc' ? 'rotate-180' : ''}`} />
                  )}
                </div>
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider rtl:text-right">
                {t('payments.direction')}
              </th>
              <th 
                onClick={() => handleSort('category')}
                className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider cursor-pointer hover:bg-gray-100 transition-colors rtl:text-right"
              >
                <div className="flex items-center space-x-1 rtl:space-x-reverse">
                  <span>{t('payments.category')}</span>
                  {sortField === 'category' && (
                    <ArrowUpDown className={`w-4 h-4 ${sortDirection === 'desc' ? 'rotate-180' : ''}`} />
                  )}
                </div>
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider rtl:text-right">
                {t('payments.entity')}
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider rtl:text-right">
                {t('payments.description')}
              </th>
              <th 
                onClick={() => handleSort('amount')}
                className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider cursor-pointer hover:bg-gray-100 transition-colors rtl:text-right"
              >
                <div className="flex items-center space-x-1 rtl:space-x-reverse">
                  <span>{t('payments.amount')}</span>
                  {sortField === 'amount' && (
                    <ArrowUpDown className={`w-4 h-4 ${sortDirection === 'desc' ? 'rotate-180' : ''}`} />
                  )}
                </div>
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider rtl:text-right">
                {t('payments.reference')}
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider rtl:text-right">
                {t('payments.actions')}
              </th>
            </tr>
          </thead>
          <tbody className="bg-white divide-y divide-gray-200">
            {paginatedPayments.map((payment) => (
              <tr key={payment.id} className="hover:bg-gray-50 transition-colors">
                <td className="px-6 py-4 whitespace-nowrap rtl:text-right">
                  <div className="text-sm text-gray-900">
                    {new Date(payment.created_at).toLocaleDateString()}
                  </div>
                  <div className="text-xs text-gray-500">
                    {new Date(payment.created_at).toLocaleTimeString()}
                  </div>
                </td>
                <td className="px-6 py-4 whitespace-nowrap">
                  {getDirectionBadge(payment.paymentDirection)}
                </td>
                <td className="px-6 py-4 whitespace-nowrap rtl:text-right">
                  <div className="text-sm font-medium text-gray-900">{translatePaymentCategory(payment.category)}</div>
                </td>
                <td className="px-6 py-4 whitespace-nowrap">
                  <div className="flex items-center space-x-2 rtl:space-x-reverse">
                    {getEntityTypeBadge(payment.entityType)}
                    <span className="text-sm text-gray-900">{getEntityName(payment)}</span>
                  </div>
                </td>
                <td className="px-6 py-4 rtl:text-right">
                  <div className="text-sm text-gray-900 max-w-xs truncate" title={payment.description}>
                    {payment.description}
                  </div>
                </td>
                <td className="px-6 py-4 whitespace-nowrap rtl:text-right">
                  <div className="text-sm font-semibold text-gray-900">
                    {formatCurrencyWithSymbol(payment.amount, payment.currency)}
                  </div>
                  {payment.currency !== currency && (
                    <div className="text-xs text-gray-500">
                      ≈ {formatCurrency(getConvertedAmount(payment.amount, currency))}
                    </div>
                  )}
                </td>
                <td className="px-6 py-4 whitespace-nowrap rtl:text-right">
                  <div className="text-sm text-gray-500">
                    {payment.reference || '-'}
                  </div>
                </td>
                <td className="px-6 py-4 whitespace-nowrap">
                  <div className="flex items-center space-x-2 rtl:space-x-reverse">
                    <button
                      onClick={() => onView(payment as Transaction)}
                      className="p-1 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded transition-colors"
                      title={t('payments.viewDetails')}
                    >
                      <Eye className="w-4 h-4" />
                    </button>
                    <button
                      onClick={() => onEdit(payment as Transaction)}
                      className="p-1 text-gray-400 hover:text-amber-600 hover:bg-amber-50 rounded transition-colors"
                      title={t('payments.editPayment')}
                    >
                      <Edit3 className="w-4 h-4" />
                    </button>
                    <button
                      onClick={() => onDelete(payment as Transaction)}
                      className="p-1 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded transition-colors"
                      title={t('payments.deletePayment')}
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
      {totalPages > 1 && (
        <div className="px-6 py-4 border-t border-gray-200 flex items-center justify-between rtl:flex-row-reverse">
          <div className="text-sm text-gray-700 rtl:text-right">
            {t('payments.showingResults', { 
              start: ((currentPage - 1) * itemsPerPage) + 1, 
              end: Math.min(currentPage * itemsPerPage, sortedPayments.length), 
              total: sortedPayments.length 
            })}
          </div>
          <div className="flex items-center space-x-2 rtl:space-x-reverse">
            <button
              onClick={() => setCurrentPage(Math.max(1, currentPage - 1))}
              disabled={currentPage === 1}
              className="px-3 py-1 text-sm border border-gray-300 rounded-md hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              {t('payments.previous')}
            </button>
            <span className="text-sm text-gray-700">
              {t('payments.page')} {currentPage} {t('payments.of')} {totalPages}
            </span>
            <button
              onClick={() => setCurrentPage(Math.min(totalPages, currentPage + 1))}
              disabled={currentPage === totalPages}
              className="px-3 py-1 text-sm border border-gray-300 rounded-md hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              {t('payments.next')}
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

// Helper functions
const generateCSVContent = (
  payments: PaymentTransaction[], 
  customers: Array<{ id: string; name: string }>, 
  suppliers: Array<{ id: string; name: string }>
): string => {
  const headers = [
    'Date', 'Time', 'Direction', 'Category', 'Entity Type', 'Entity Name', 
    'Description', 'Amount', 'Currency', 'Reference'
  ];
  
  const rows = payments.map(payment => {
    const date = new Date(payment.created_at);
    const entityName = payment.customer_id 
      ? customers.find(c => c.id === payment.customer_id)?.name || 'Unknown Customer'
      : payment.supplier_id 
      ? suppliers.find(s => s.id === payment.supplier_id)?.name || 'Unknown Supplier'
      : 'No Entity';
    
    return [
      date.toLocaleDateString(),
      date.toLocaleTimeString(),
      payment.paymentDirection === 'received' ? 'Received' : 'Paid',
      payment.category,
      payment.entityType,
      `"${entityName}"`,
      `"${payment.description}"`,
      payment.amount.toString(),
      payment.currency,
      payment.reference || ''
    ].join(',');
  });
  
  return [headers.join(','), ...rows].join('\n');
};

const downloadCSV = (content: string, filename: string) => {
  const blob = new Blob([content], { type: 'text/csv;charset=utf-8;' });
  const link = document.createElement('a');
  const url = URL.createObjectURL(blob);
  link.setAttribute('href', url);
  link.setAttribute('download', filename);
  link.style.visibility = 'hidden';
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
};

export const PaymentsManagement: React.FC<PaymentsManagementProps> = ({
  transactions,
  currency,
  setShowForm,
  formatCurrency,
  formatCurrencyWithSymbol,
  getConvertedAmount,
  customers = [],
  suppliers = [],
  onUpdateTransaction,
  onDeleteTransaction,
  showToast
}) => {
  const { t } = useI18n();
  
  // Helper function to translate payment categories
  const translatePaymentCategory = (category: string): string => {
    const categoryMap: { [key: string]: string } = {
      'Customer Payment': t('payments.customerPayment'),
      'Customer Credit Sale': t('payments.customerCreditSale'),
      'Supplier Payment': t('payments.supplierPayment'),
      'Supplier Commission': t('payments.supplierCommission'),
      'Cash Payment': t('payments.cashPayment'),
      'Cash Sale': t('payments.cashSale'),
      'Payment Received': t('payments.paymentReceived'),
      'Payment Sent': t('payments.paymentSent'),
      'Expense Payment': t('payments.expensePayment')
    };
    return categoryMap[category] || category;
  };
  
  const [filters, setFilters] = useState<PaymentFilters>({
    search: '',
    dateRange: { start: '', end: '' },
    category: '',
    entityType: 'all',
    entityId: '',
    direction: 'all',
    currency: 'all',
    amountRange: { min: '', max: '' }
  });
  
  const [editModal, setEditModal] = useState<PaymentEditModal>({
    isOpen: false,
    payment: null
  });
  
  const [deleteConfirm, setDeleteConfirm] = useState<{
    isOpen: boolean;
    payment: Transaction | null;
    impactSummary: any | null;
  }>({ isOpen: false, payment: null, impactSummary: null });
  
  const [viewModal, setViewModal] = useState<{
    isOpen: boolean;
    payment: Transaction | null;
  }>({ isOpen: false, payment: null });

  // Get all payment transactions with enhanced data
  const allPayments = useMemo(() => {
    const paymentTransactions = transactions.filter(t => isPaymentCategory(t.category));
    return paymentService.filterPaymentTransactions(paymentTransactions, {});
  }, [transactions]);

  // Apply filters
  const filteredPayments = useMemo(() => {
    let filtered = allPayments;

    // Search filter
    if (filters.search) {
      const searchLower = filters.search.toLowerCase();
      filtered = filtered.filter(payment => 
        payment.description.toLowerCase().includes(searchLower) ||
        (payment.reference && payment.reference.toLowerCase().includes(searchLower)) ||
        payment.category.toLowerCase().includes(searchLower)
      );
    }

    // Date range filter
    if (filters.dateRange.start || filters.dateRange.end) {
      filtered = filtered.filter(payment => {
        const paymentDate = new Date(payment.created_at);
        const startDate = filters.dateRange.start ? new Date(filters.dateRange.start) : new Date(0);
        const endDate = filters.dateRange.end ? new Date(filters.dateRange.end + 'T23:59:59') : new Date();
        return paymentDate >= startDate && paymentDate <= endDate;
      });
    }

    // Category filter
    if (filters.category) {
      filtered = filtered.filter(payment => payment.category === filters.category);
    }

    // Entity type filter
    if (filters.entityType !== 'all') {
      filtered = filtered.filter(payment => payment.entityType === filters.entityType);
    }

    // Entity ID filter
    if (filters.entityId) {
      filtered = filtered.filter(payment => 
        payment.customer_id === filters.entityId || payment.supplier_id === filters.entityId
      );
    }

    // Direction filter
    if (filters.direction !== 'all') {
      filtered = filtered.filter(payment => payment.paymentDirection === filters.direction);
    }

    // Currency filter
    if (filters.currency !== 'all') {
      filtered = filtered.filter(payment => payment.currency === filters.currency);
    }

    // Amount range filter
    if (filters.amountRange.min || filters.amountRange.max) {
      const minAmount = parseFloat(filters.amountRange.min) || 0;
      const maxAmount = parseFloat(filters.amountRange.max) || Infinity;
      filtered = filtered.filter(payment => 
        payment.amount >= minAmount && payment.amount <= maxAmount
      );
    }

    return filtered;
  }, [allPayments, filters]);

  // Get unique categories for filter
  const categories = useMemo(() => {
    return Array.from(new Set(allPayments.map(p => p.category))).sort();
  }, [allPayments]);

  const handleEditPayment = (payment: Transaction) => {
    setEditModal({ isOpen: true, payment });
  };

  const handleDeletePayment = async (payment: Transaction) => {
    // Get impact summary before showing confirmation
    const impactSummary = await paymentManagementService.getTransactionImpactSummary(payment.id);
    setDeleteConfirm({ isOpen: true, payment, impactSummary });
  };

  const handleViewPayment = (payment: Transaction) => {
    setViewModal({ isOpen: true, payment });
  };

  const handleUpdatePayment = async (updates: Partial<Transaction>) => {
    if (!editModal.payment) return;
    
    try {
      // Use the payment management service for proper balance updates
      const result = await paymentManagementService.updatePayment(
        editModal.payment.id,
        updates as PaymentUpdateData,
        {
          userId: editModal.payment.created_by, // Use original creator as fallback
          module: 'payment_management',
          source: 'web'
        }
      );

      if (result.success) {
        // Call the parent callback if provided for UI updates
        if (onUpdateTransaction) {
          await onUpdateTransaction(editModal.payment.id, updates);
        }
        
        let successMessage = t('payments.paymentUpdatedSuccessfully');
        if (result.balanceUpdates) {
          const updates = [];
          if (result.balanceUpdates.cashDrawer) {
            updates.push(t('payments.cashDrawerUpdated', { 
              previous: result.balanceUpdates.cashDrawer.previousBalance.toFixed(2), 
              new: result.balanceUpdates.cashDrawer.newBalance.toFixed(2) 
            }));
          }
          if (result.balanceUpdates.entity) {
            updates.push(t('payments.entityBalanceUpdated', { entityType: result.balanceUpdates.entity.entityType }));
          }
          if (updates.length > 0) {
            successMessage += `. ${updates.join(', ')}`;
          }
        }
        
        showToast?.(successMessage, 'success');
      } else {
        throw new Error(result.error || 'Update failed');
      }
    } catch (error) {
      console.error('Payment update error:', error);
      showToast?.(t('payments.failedToUpdatePayment', { error: error instanceof Error ? error.message : 'Unknown error' }), 'error');
      throw error;
    }
  };

  const confirmDelete = async () => {
    if (!deleteConfirm.payment) return;
    
    try {
      // Use the payment management service for proper balance updates
      const result = await paymentManagementService.deletePayment(
        deleteConfirm.payment.id,
        {
          userId: deleteConfirm.payment.created_by, // Use original creator as fallback
          module: 'payment_management',
          source: 'web'
        }
      );

      if (result.success) {
        // Call the parent callback if provided for UI updates
        if (onDeleteTransaction) {
          await onDeleteTransaction(deleteConfirm.payment.id);
        }
        
        setDeleteConfirm({ isOpen: false, payment: null, impactSummary: null });
        
        let successMessage = t('payments.paymentDeletedSuccessfully');
        if (result.balanceUpdates) {
          const updates = [];
          if (result.balanceUpdates.cashDrawer) {
            updates.push(t('payments.cashDrawerUpdated', { 
              previous: result.balanceUpdates.cashDrawer.previousBalance.toFixed(2), 
              new: result.balanceUpdates.cashDrawer.newBalance.toFixed(2) 
            }));
          }
          if (result.balanceUpdates.entity) {
            updates.push(t('payments.entityBalanceUpdated', { entityType: result.balanceUpdates.entity.entityType }));
          }
          if (updates.length > 0) {
            successMessage += `. ${updates.join(', ')}`;
          }
        }
        
        showToast?.(successMessage, 'success');
      } else {
        throw new Error(result.error || 'Delete failed');
      }
    } catch (error) {
      console.error('Payment delete error:', error);
      showToast?.(t('payments.failedToDeletePayment', { error: error instanceof Error ? error.message : 'Unknown error' }), 'error');
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex justify-between items-center rtl:flex-row-reverse">
        <div className="rtl:text-right">
          <h2 className="text-2xl font-bold text-gray-900">{t('payments.title')}</h2>
          <p className="text-gray-600 mt-1">{t('payments.subtitle')}</p>
        </div>
        <button
          onClick={() => setShowForm("expense")}
          className="bg-blue-600 text-white px-6 py-3 rounded-lg hover:bg-blue-700 transition-colors flex items-center shadow-sm"
        >
          <Plus className="w-5 h-5 rtl:ml-2 ltr:mr-2" />
          {t('payments.addPayment')}
        </button>
      </div>

      {/* Summary Cards */}
      <PaymentsSummaryCards
        payments={filteredPayments}
        formatCurrency={formatCurrency}
        currency={currency}
      />

      {/* Filters */}
      <PaymentFiltersPanel
        filters={filters}
        onFiltersChange={setFilters}
        customers={customers}
        suppliers={suppliers}
        categories={categories}
      />

      {/* Payments Table */}
      <PaymentsTable
        payments={filteredPayments}
        formatCurrency={formatCurrency}
        formatCurrencyWithSymbol={formatCurrencyWithSymbol}
        getConvertedAmount={getConvertedAmount}
        currency={currency}
        customers={customers}
        suppliers={suppliers}
        onEdit={handleEditPayment}
        onDelete={handleDeletePayment}
        onView={handleViewPayment}
        translatePaymentCategory={translatePaymentCategory}
      />

      {/* Edit Modal */}
      <PaymentEditModal
        isOpen={editModal.isOpen}
        payment={editModal.payment}
        onClose={() => setEditModal({ isOpen: false, payment: null })}
        onSave={handleUpdatePayment}
        customers={customers}
        suppliers={suppliers}
        formatCurrency={formatCurrency}
        translatePaymentCategory={translatePaymentCategory}
      />

      {/* Delete Confirmation Modal */}
      {deleteConfirm.isOpen && deleteConfirm.payment && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-xl shadow-xl max-w-lg w-full">
            <div className="p-6">
              <div className="flex items-center justify-center w-12 h-12 mx-auto mb-4 bg-red-100 rounded-full">
                <Trash2 className="w-6 h-6 text-red-600" />
              </div>
              <h3 className="text-lg font-semibold text-gray-900 text-center mb-2">
                {t('payments.deletePaymentTitle')}
              </h3>
              <p className="text-gray-600 text-center mb-6">
                {t('payments.deletePaymentMessage')}
              </p>
              
              {/* Payment Details */}
              <div className="bg-gray-50 rounded-lg p-4 mb-4">
                <h4 className="font-medium text-gray-900 mb-2">{t('payments.paymentDetails')}</h4>
                <div className="text-sm text-gray-600 space-y-1">
                  <p><strong>{t('payments.amount')}:</strong> {formatCurrencyWithSymbol(deleteConfirm.payment.amount, deleteConfirm.payment.currency)}</p>
                  <p><strong>{t('payments.description')}:</strong> {deleteConfirm.payment.description}</p>
                  <p><strong>{t('payments.dateTime')}:</strong> {new Date(deleteConfirm.payment.created_at).toLocaleDateString()}</p>
                  <p><strong>{t('payments.category')}:</strong> {translatePaymentCategory(deleteConfirm.payment.category)}</p>
                </div>
              </div>

              {/* Impact Summary */}
              {deleteConfirm.impactSummary && (
                <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4 mb-6">
                  <h4 className="font-medium text-yellow-800 mb-2 flex items-center">
                    <RefreshCw className="w-4 h-4 mr-2" />
                    {t('payments.balanceImpact')}
                  </h4>
                  <div className="text-sm text-yellow-700 space-y-2">
                    {deleteConfirm.impactSummary.cashDrawerImpact && (
                      <div className="flex items-center justify-between">
                        <span>{t('payments.cashDrawer')}</span>
                        <span className="font-medium">
                          {deleteConfirm.impactSummary.estimatedBalanceChanges.cashDrawer > 0 ? '+' : ''}
                          {formatCurrency(Math.abs(deleteConfirm.impactSummary.estimatedBalanceChanges.cashDrawer))} {t('payments.willBeReversed')}
                        </span>
                      </div>
                    )}
                    {deleteConfirm.impactSummary.entityImpact.entityName && (
                      <div className="flex items-center justify-between">
                        <span>{deleteConfirm.impactSummary.entityImpact.type === 'customer' ? t('payments.customerBalance') : t('payments.supplierBalance')}</span>
                        <span className="font-medium">
                          {deleteConfirm.impactSummary.entityImpact.entityName} {t('payments.balanceWillBeAdjusted')}
                        </span>
                      </div>
                    )}
                    {!deleteConfirm.impactSummary.cashDrawerImpact && !deleteConfirm.impactSummary.entityImpact.entityName && (
                      <p className="text-yellow-600">{t('payments.noBalanceImpacts')}</p>
                    )}
                  </div>
                </div>
              )}

              <div className="flex space-x-3 rtl:space-x-reverse">
                <button
                  onClick={() => setDeleteConfirm({ isOpen: false, payment: null, impactSummary: null })}
                  className="flex-1 px-4 py-2 text-gray-700 bg-gray-100 hover:bg-gray-200 rounded-lg transition-colors"
                >
                  {t('payments.cancel')}
                </button>
                <button
                  onClick={confirmDelete}
                  className="flex-1 px-4 py-2 bg-red-600 text-white hover:bg-red-700 rounded-lg transition-colors"
                >
                  {t('payments.deletePaymentButton')}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* View Modal */}
      {viewModal.isOpen && viewModal.payment && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-xl shadow-xl max-w-2xl w-full max-h-[90vh] overflow-y-auto">
            <div className="p-6 border-b border-gray-200">
              <div className="flex items-center justify-between rtl:flex-row-reverse">
                <h2 className="text-xl font-semibold text-gray-900 rtl:text-right">{t('payments.paymentDetailsTitle')}</h2>
                <button
                  onClick={() => setViewModal({ isOpen: false, payment: null })}
                  className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
                >
                  <X className="w-5 h-5 text-gray-500" />
                </button>
              </div>
            </div>
            <div className="p-6 space-y-6">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div>
                  <h3 className="text-lg font-medium text-gray-900 mb-4 rtl:text-right">{t('payments.transactionInfo')}</h3>
                  <div className="space-y-3">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 rtl:text-right">{t('payments.amount')}</label>
                      <p className="text-lg font-semibold text-gray-900 rtl:text-right">
                        {formatCurrencyWithSymbol(viewModal.payment.amount, viewModal.payment.currency)}
                      </p>
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 rtl:text-right">{t('payments.direction')}</label>
                      <p className="text-sm text-gray-900 rtl:text-right">
                        {getPaymentDirection(viewModal.payment) === 'received' ? t('payments.paymentReceived') : t('payments.paymentMade')}
                      </p>
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 rtl:text-right">{t('payments.category')}</label>
                      <p className="text-sm text-gray-900 rtl:text-right">{translatePaymentCategory(viewModal.payment.category)}</p>
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 rtl:text-right">{t('payments.dateTime')}</label>
                      <p className="text-sm text-gray-900 rtl:text-right">
                        {new Date(viewModal.payment.created_at).toLocaleString()}
                      </p>
                    </div>
                  </div>
                </div>
                <div>
                  <h3 className="text-lg font-medium text-gray-900 mb-4 rtl:text-right">{t('payments.entityInfo')}</h3>
                  <div className="space-y-3">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 rtl:text-right">{t('payments.entityType')}</label>
                      <p className="text-sm text-gray-900 capitalize rtl:text-right">{getPaymentEntityType(viewModal.payment)}</p>
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 rtl:text-right">{t('payments.entityName')}</label>
                      <p className="text-sm text-gray-900 rtl:text-right">
                        {viewModal.payment.customer_id 
                          ? customers.find(c => c.id === viewModal.payment!.customer_id)?.name || t('payments.unknownCustomer')
                          : viewModal.payment.supplier_id 
                          ? suppliers.find(s => s.id === viewModal.payment!.supplier_id)?.name || t('payments.unknownSupplier')
                          : t('payments.noEntity')
                        }
                      </p>
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 rtl:text-right">{t('payments.reference')}</label>
                      <p className="text-sm text-gray-900 rtl:text-right">{viewModal.payment.reference || '-'}</p>
                    </div>
                  </div>
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2 rtl:text-right">{t('payments.description')}</label>
                <p className="text-sm text-gray-900 bg-gray-50 p-3 rounded-lg rtl:text-right">
                  {viewModal.payment.description}
                </p>
              </div>
            </div>
            <div className="p-6 border-t border-gray-200 flex justify-end rtl:justify-start">
              <button
                onClick={() => setViewModal({ isOpen: false, payment: null })}
                className="px-4 py-2 bg-gray-600 text-white hover:bg-gray-700 rounded-lg transition-colors"
              >
                {t('payments.close')}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default PaymentsManagement;