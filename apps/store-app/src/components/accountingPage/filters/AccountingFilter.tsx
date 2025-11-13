import React, { useState, useEffect, useMemo } from 'react';
import { Search, Filter, X, ChevronDown, ChevronUp, Download, ArrowUpDown } from 'lucide-react';
import { useI18n } from '../../../i18n';
import { useLocalStorage } from '../../../hooks/useLocalStorage';
import {
  AccountingFilterProps,
  FilterValues,
  DateRangePreset,
  SortField,
  SortDirection,
  FilterChangeEvent,
} from './AccountingFilterTypes';

/**
 * Comprehensive, reusable filter component for all accounting tabs
 * Supports search, date ranges, dropdowns, sorting, and custom filters
 */
export const AccountingFilter: React.FC<AccountingFilterProps> = ({
  config,
  values,
  onChange,
  products = [],
  suppliers = [],
  customers = [],
  categories = [],
  statusOptions = [],
  typeOptions = [],
  paymentStatusOptions = [],
  paymentMethodOptions = [],
  onExport,
  onClear,
  className = '',
}) => {
  const { t } = useI18n();
  const [isCollapsed, setIsCollapsed] = useState(config.defaultCollapsed ?? false);
  const [localValues, setLocalValues] = useLocalStorage<FilterValues>(
    config.storageKey || 'accounting_filter',
    values
  );

  // Sync local values with prop values on mount
  useEffect(() => {
    if (config.persistFilters && localValues) {
      onChange({ filters: localValues });
    }
  }, []);

  // Helper to format date for input fields
  const formatDate = (date: Date): string => {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  };

  // Handle date preset selection
  const handleDatePreset = (preset: DateRangePreset) => {
    const now = new Date();
    let start = '';
    let end = '';

    switch (preset) {
      case 'today':
        start = formatDate(now);
        end = formatDate(now);
        break;
      case 'week': {
        const startOfWeek = new Date(now);
        startOfWeek.setDate(now.getDate() - now.getDay());
        startOfWeek.setHours(0, 0, 0, 0);
        start = formatDate(startOfWeek);
        end = formatDate(now);
        break;
      }
      case 'month': {
        const firstDayOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
        start = formatDate(firstDayOfMonth);
        end = formatDate(now);
        break;
      }
      case 'quarter': {
        const quarterStart = Math.floor(now.getMonth() / 3) * 3;
        const firstDayOfQuarter = new Date(now.getFullYear(), quarterStart, 1);
        start = formatDate(firstDayOfQuarter);
        end = formatDate(now);
        break;
      }
      case 'year': {
        const firstDayOfYear = new Date(now.getFullYear(), 0, 1);
        start = formatDate(firstDayOfYear);
        end = formatDate(now);
        break;
      }
      case 'all':
        start = '';
        end = '';
        break;
      default:
        return;
    }

    updateFilters({ dateRange: { start, end }, datePreset: preset });
  };

  // Update filters and notify parent
  const updateFilters = (updates: Partial<FilterValues>, changedField?: string) => {
    const newValues = { ...values, ...updates };
    
    if (config.persistFilters) {
      setLocalValues(newValues);
    }
    
    onChange({ filters: newValues, changedField });
  };

  // Clear all filters
  const handleClear = () => {
    const clearedValues: FilterValues = {
      searchTerm: '',
      dateRange: { start: '', end: '' },
      datePreset: config.defaultDatePreset || 'all',
      productId: '',
      supplierId: '',
      customerId: '',
      categoryId: '',
      status: '',
      type: '',
      paymentStatus: '',
      paymentMethod: '',
      direction: '',
      entityType: '',
      entityId: '',
      sortField: config.defaultSortField,
      sortDirection: config.defaultSortDirection,
      page: 1,
    };

    if (config.persistFilters) {
      setLocalValues(clearedValues);
    }

    if (onClear) {
      onClear();
    } else {
      onChange({ filters: clearedValues });
    }
  };

  // Handle sorting
  const handleSort = (field: SortField) => {
    const newDirection: SortDirection =
      values.sortField === field && values.sortDirection === 'asc' ? 'desc' : 'asc';
    updateFilters({ sortField: field, sortDirection: newDirection }, 'sort');
  };

  // Get translated label
  const getLabel = (key: string): string => {
    return t(key) || key;
  };

  return (
    <div className={`bg-white rounded-lg shadow-sm border border-gray-200 ${className}`}>
      {/* Header with search and toggle */}
      <div className="p-4">
        <div className="flex items-center gap-3 rtl:flex-row-reverse">
          {/* Search */}
          {config.enableSearch && (
            <div className="flex-1 relative">
              <Search className="w-4 h-4 absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 rtl:left-auto rtl:right-3" />
              <input
                type="text"
                placeholder={getLabel(config.searchPlaceholder || 'Search...')}
                value={values.searchTerm || ''}
                onChange={(e) => updateFilters({ searchTerm: e.target.value }, 'search')}
                className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent rtl:pl-4 rtl:pr-10"
              />
            </div>
          )}

          {/* Export button */}
          {config.showExportButton && onExport && (
            <button
              onClick={onExport}
              className="p-2 text-gray-600 hover:text-gray-800 hover:bg-gray-100 rounded-lg transition-colors"
              title={getLabel('common.export')}
            >
              <Download className="w-4 h-4" />
            </button>
          )}

          {/* Toggle filters button */}
          {config.collapsible && (
            <button
              onClick={() => setIsCollapsed(!isCollapsed)}
              className={`p-2 rounded-lg transition-colors ${
                isCollapsed ? 'bg-gray-100 text-gray-600' : 'bg-blue-100 text-blue-600'
              }`}
            >
              <Filter className="w-4 h-4" />
            </button>
          )}
        </div>
      </div>

      {/* Filters panel */}
      {(!config.collapsible || !isCollapsed) && (
        <div className="px-4 pb-4 space-y-4 border-t border-gray-100 pt-4">
          {/* Date presets */}
          {config.enableDatePresets && config.datePresets && (
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2 rtl:text-right">
                {getLabel('common.quickFilters')}
              </label>
              <div className="flex flex-wrap gap-2 rtl:flex-row-reverse">
                {config.datePresets.map((preset) => (
                  <button
                    key={preset}
                    type="button"
                    onClick={() => handleDatePreset(preset)}
                    className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                      values.datePreset === preset
                        ? 'bg-blue-600 text-white shadow-sm'
                        : 'bg-white text-gray-700 border border-gray-200 hover:bg-gray-100'
                    }`}
                  >
                    {getLabel(`common.${preset}`)}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Main filters grid */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            {/* Date range */}
            {config.enableDateRange && (
              <>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2 rtl:text-right">
                    {getLabel('common.startDate')}
                  </label>
                  <input
                    type="date"
                    value={values.dateRange?.start || ''}
                    onChange={(e) =>
                      updateFilters({
                        dateRange: { ...values.dateRange, start: e.target.value } as any,
                        datePreset: 'custom',
                      }, 'dateRange')
                    }
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2 rtl:text-right">
                    {getLabel('common.endDate')}
                  </label>
                  <input
                    type="date"
                    value={values.dateRange?.end || ''}
                    onChange={(e) =>
                      updateFilters({
                        dateRange: { ...values.dateRange, end: e.target.value } as any,
                        datePreset: 'custom',
                      }, 'dateRange')
                    }
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  />
                </div>
              </>
            )}

            {/* Product filter */}
            {config.enableProductFilter && (
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2 rtl:text-right">
                  {getLabel('common.product')}
                </label>
                <select
                  value={values.productId || ''}
                  onChange={(e) => updateFilters({ productId: e.target.value }, 'productId')}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                >
                  <option value="">{getLabel('common.allProducts')}</option>
                  {products.map((product) => (
                    <option key={product.id} value={product.id}>
                      {product.name}
                    </option>
                  ))}
                </select>
              </div>
            )}

            {/* Supplier filter */}
            {config.enableSupplierFilter && (
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2 rtl:text-right">
                  {getLabel('common.supplier')}
                </label>
                <select
                  value={values.supplierId || ''}
                  onChange={(e) => updateFilters({ supplierId: e.target.value }, 'supplierId')}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                >
                  <option value="">{getLabel('common.allSuppliers')}</option>
                  {suppliers.map((supplier) => (
                    <option key={supplier.id} value={supplier.id}>
                      {supplier.name}
                    </option>
                  ))}
                </select>
              </div>
            )}

            {/* Customer filter */}
            {config.enableCustomerFilter && (
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2 rtl:text-right">
                  {getLabel('common.customer')}
                </label>
                <select
                  value={values.customerId || ''}
                  onChange={(e) => updateFilters({ customerId: e.target.value }, 'customerId')}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                >
                  <option value="">{getLabel('common.allCustomers')}</option>
                  {customers.map((customer) => (
                    <option key={customer.id} value={customer.id}>
                      {customer.name}
                    </option>
                  ))}
                </select>
              </div>
            )}

            {/* Category filter */}
            {config.enableCategoryFilter && (
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2 rtl:text-right">
                  {getLabel('common.category')}
                </label>
                <select
                  value={values.categoryId || ''}
                  onChange={(e) => updateFilters({ categoryId: e.target.value }, 'categoryId')}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                >
                  <option value="">{getLabel('common.allCategories')}</option>
                  {categories.map((category) => (
                    <option key={category.id} value={category.id}>
                      {category.name}
                    </option>
                  ))}
                </select>
              </div>
            )}

            {/* Status filter */}
            {config.enableStatusFilter && statusOptions && (
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2 rtl:text-right">
                  {getLabel('common.status')}
                </label>
                <select
                  value={values.status || ''}
                  onChange={(e) => updateFilters({ status: e.target.value }, 'status')}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                >
                  {statusOptions.map((option) => (
                    <option key={option.value} value={option.value}>
                      {getLabel(option.label)}
                    </option>
                  ))}
                </select>
              </div>
            )}

            {/* Type filter */}
            {config.enableTypeFilter && typeOptions && (
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2 rtl:text-right">
                  {getLabel('common.type')}
                </label>
                <select
                  value={values.type || ''}
                  onChange={(e) => updateFilters({ type: e.target.value }, 'type')}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                >
                  {typeOptions.map((option) => (
                    <option key={option.value} value={option.value}>
                      {getLabel(option.label)}
                    </option>
                  ))}
                </select>
              </div>
            )}

            {/* Payment status filter */}
            {config.enablePaymentStatusFilter && paymentStatusOptions && (
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2 rtl:text-right">
                  {getLabel('common.paymentStatus')}
                </label>
                <select
                  value={values.paymentStatus || ''}
                  onChange={(e) => updateFilters({ paymentStatus: e.target.value }, 'paymentStatus')}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                >
                  {paymentStatusOptions.map((option) => (
                    <option key={option.value} value={option.value}>
                      {getLabel(option.label)}
                    </option>
                  ))}
                </select>
              </div>
            )}

            {/* Payment method filter */}
            {config.enablePaymentMethodFilter && paymentMethodOptions && (
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2 rtl:text-right">
                  {getLabel('common.paymentMethod')}
                </label>
                <select
                  value={values.paymentMethod || ''}
                  onChange={(e) => updateFilters({ paymentMethod: e.target.value }, 'paymentMethod')}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                >
                  {paymentMethodOptions.map((option) => (
                    <option key={option.value} value={option.value}>
                      {getLabel(option.label)}
                    </option>
                  ))}
                </select>
              </div>
            )}

            {/* Direction filter (for payments) */}
            {config.enableDirectionFilter && (
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2 rtl:text-right">
                  {getLabel('payments.direction')}
                </label>
                <select
                  value={values.direction || 'all'}
                  onChange={(e) => updateFilters({ direction: e.target.value }, 'direction')}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                >
                  <option value="all">{getLabel('payments.allDirections')}</option>
                  <option value="received">{getLabel('payments.received')}</option>
                  <option value="paid">{getLabel('payments.paid')}</option>
                </select>
              </div>
            )}

            {/* Entity type filter (for payments) */}
            {config.enableEntityTypeFilter && (
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2 rtl:text-right">
                  {getLabel('payments.entityType')}
                </label>
                <select
                  value={values.entityType || 'all'}
                  onChange={(e) => updateFilters({ entityType: e.target.value, entityId: '' }, 'entityType')}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                >
                  <option value="all">{getLabel('payments.allEntities')}</option>
                  <option value="customer">{getLabel('payments.customers')}</option>
                  <option value="supplier">{getLabel('payments.suppliers')}</option>
                </select>
              </div>
            )}

            {/* Entity ID filter (conditional on entity type) */}
            {config.enableEntityTypeFilter && values.entityType && values.entityType !== 'all' && (
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2 rtl:text-right">
                  {values.entityType === 'customer' ? getLabel('payments.customer') : getLabel('payments.supplier')}
                </label>
                <select
                  value={values.entityId || ''}
                  onChange={(e) => updateFilters({ entityId: e.target.value }, 'entityId')}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                >
                  <option value="">
                    {values.entityType === 'customer'
                      ? getLabel('payments.allCustomers')
                      : getLabel('payments.allSuppliers')}
                  </option>
                  {(values.entityType === 'customer' ? customers : suppliers).map((entity) => (
                    <option key={entity.id} value={entity.id}>
                      {entity.name}
                    </option>
                  ))}
                </select>
              </div>
            )}

            {/* Custom filters */}
            {config.customFilters?.map((customFilter) => (
              <div key={customFilter.id}>
                <label className="block text-sm font-medium text-gray-700 mb-2 rtl:text-right">
                  {getLabel(customFilter.label)}
                </label>
                {customFilter.type === 'select' && (
                  <select
                    value={values[customFilter.id] || ''}
                    onChange={(e) => updateFilters({ [customFilter.id]: e.target.value }, customFilter.id)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  >
                    {customFilter.options?.map((option) => (
                      <option key={option.value} value={option.value}>
                        {getLabel(option.label)}
                      </option>
                    ))}
                  </select>
                )}
                {customFilter.type === 'text' && (
                  <input
                    type="text"
                    value={values[customFilter.id] || ''}
                    onChange={(e) => updateFilters({ [customFilter.id]: e.target.value }, customFilter.id)}
                    placeholder={customFilter.placeholder}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  />
                )}
              </div>
            ))}
          </div>

          {/* Sorting controls */}
          {config.enableSorting && config.sortFields && config.sortFields.length > 0 && (
            <div className="flex items-center gap-3 pt-2 border-t border-gray-100 rtl:flex-row-reverse">
              <label className="text-sm font-medium text-gray-700 rtl:text-right">
                {getLabel('common.sortBy')}:
              </label>
              <div className="flex flex-wrap gap-2 rtl:flex-row-reverse">
                {config.sortFields.map((field) => (
                  <button
                    key={field}
                    onClick={() => handleSort(field)}
                    className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors flex items-center gap-1 ${
                      values.sortField === field
                        ? 'bg-blue-100 text-blue-700'
                        : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                    }`}
                  >
                    {getLabel(`common.${field}`)}
                    {values.sortField === field && (
                      <ArrowUpDown
                        className={`w-3 h-3 transition-transform ${
                          values.sortDirection === 'desc' ? 'rotate-180' : ''
                        }`}
                      />
                    )}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Clear button */}
          {config.showClearButton && (
            <div className="flex justify-end pt-2 border-t border-gray-100">
              <button
                onClick={handleClear}
                className="px-4 py-2 text-sm text-gray-600 hover:text-gray-800 hover:bg-gray-100 rounded-lg transition-colors flex items-center gap-2"
              >
                <X className="w-4 h-4" />
                {getLabel('common.clearFilters')}
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default AccountingFilter;
