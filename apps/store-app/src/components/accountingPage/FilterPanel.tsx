import React, { useState, useCallback, useMemo, useRef } from 'react';
import {
    Filter,
    Search,
    X,
    Calendar,
    DollarSign,
    ChevronDown,
    RotateCcw,
    SortAsc,
    SortDesc,
} from 'lucide-react';
import { useI18n } from '../../i18n';

export interface FilterState {
    searchTerm: string;
    type: string;
    currency: string;
    dateRange: {
        start: string;
        end: string;
    };
    amountRange: {
        min: string;
        max: string;
    };
    sortBy: 'date' | 'amount' | 'category';
    sortOrder: 'asc' | 'desc';
}

export const initialFilterState: FilterState = {
    searchTerm: '',
    type: '',
    currency: '',
    dateRange: { start: '', end: '' },
    amountRange: { min: '', max: '' },
    sortBy: 'date',
    sortOrder: 'desc',
};

interface FilterPanelProps {
    filters: FilterState;
    onFiltersChange: (filters: FilterState) => void;
    onReset: () => void;
    isVisible: boolean;
    onToggle: () => void;
}

/**
 * A reusable filter panel component for filtering transaction lists.
 * Supports search, type, currency, date range, amount range, and sorting.
 */
export const FilterPanel: React.FC<FilterPanelProps> = React.memo(({
    filters,
    onFiltersChange,
    onReset,
    isVisible,
    onToggle,
}) => {
    const [isExpanded, setIsExpanded] = useState(true);
    const searchInputRef = useRef<HTMLInputElement>(null);
    const { t } = useI18n();

    const updateFilter = useCallback((key: keyof FilterState, value: any) => {
        onFiltersChange({ ...filters, [key]: value });
    }, [filters, onFiltersChange]);

    const updateNestedFilter = useCallback((parentKey: keyof FilterState, childKey: string, value: any) => {
        onFiltersChange({
            ...filters,
            [parentKey]: {
                ...(filters[parentKey] as any),
                [childKey]: value
            }
        });
    }, [filters, onFiltersChange]);

    const hasActiveFilters = useMemo(() => {
        return filters.searchTerm ||
            filters.type ||
            filters.currency ||
            filters.dateRange.start ||
            filters.dateRange.end ||
            filters.amountRange.min ||
            filters.amountRange.max;
    }, [filters]);

    const handleReset = useCallback(() => {
        onReset();
        setIsExpanded(false);
    }, [onReset]);

    if (!isVisible) return null;

    return (
        <div className="mb-6 bg-gray-50 rounded-lg p-4 border border-gray-200">
            <div className="flex items-center justify-between mb-4">
                <div className="flex items-center space-x-2">
                    <Filter className="w-4 h-4 text-gray-600" />
                    <h4 className="text-sm font-medium text-gray-900">{t('dashboard.filters')}</h4>
                    {hasActiveFilters && (
                        <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-blue-100 text-blue-800">
                            {t('dashboard.active')}
                        </span>
                    )}
                </div>
                <div className="flex items-center space-x-2">
                    <button
                        onClick={() => setIsExpanded(!isExpanded)}
                        className="flex items-center text-sm text-gray-600 hover:text-gray-900 transition-colors"
                    >
                        {isExpanded ? t('dashboard.less') : t('dashboard.more')}
                        <ChevronDown className={`w-4 h-4 ml-1 transition-transform ${isExpanded ? 'rotate-180' : ''}`} />
                    </button>
                    {hasActiveFilters && (
                        <button
                            onClick={handleReset}
                            className="flex items-center text-sm text-red-600 hover:text-red-700 transition-colors"
                        >
                            <RotateCcw className="w-4 h-4 mr-1" />
                            {t('dashboard.reset')}
                        </button>
                    )}
                </div>
            </div>

            {/* Basic Filters */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                {/* Search */}
                <div className="relative">
                    <Search className="w-4 h-4 absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400" />
                    <input
                        ref={searchInputRef}
                        type="text"
                        placeholder={t('dashboard.searchTransactions')}
                        value={filters.searchTerm}
                        onChange={(e) => updateFilter('searchTerm', e.target.value)}
                        className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-colors"
                    />
                    {filters.searchTerm && (
                        <button
                            onClick={() => updateFilter('searchTerm', '')}
                            className="absolute right-3 top-1/2 transform -translate-y-1/2 text-gray-400 hover:text-gray-600"
                        >
                            <X className="w-4 h-4" />
                        </button>
                    )}
                </div>

                {/* Type Filter */}
                <select
                    value={filters.type}
                    onChange={(e) => updateFilter('type', e.target.value)}
                    className="border border-gray-300 rounded-lg px-3 py-2 focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-colors"
                >
                    <option value="">{t('dashboard.allTypes')}</option>
                    <option value="income">{t('dashboard.income')}</option>
                    <option value="expense">{t('dashboard.expense')}</option>
                </select>

                {/* Currency Filter */}
                <select
                    value={filters.currency}
                    onChange={(e) => updateFilter('currency', e.target.value)}
                    className="border border-gray-300 rounded-lg px-3 py-2 focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-colors"
                >
                    <option value="">{t('dashboard.allCurrencies')}</option>
                    <option value="USD">USD</option>
                    <option value="LBP">LBP</option>
                </select>
            </div>

            {/* Advanced Filters */}
            {isExpanded && (
                <div className="mt-4 pt-4 border-t border-gray-200">
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                        {/* Date Range */}
                        <div>
                            <label className="block text-xs font-medium text-gray-700 mb-1">{t('dashboard.startDate')}</label>
                            <div className="relative">
                                <Calendar className="w-4 h-4 absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400" />
                                <input
                                    type="date"
                                    value={filters.dateRange.start}
                                    onChange={(e) => updateNestedFilter('dateRange', 'start', e.target.value)}
                                    className="w-full pl-10 pr-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-colors"
                                />
                            </div>
                        </div>

                        <div>
                            <label className="block text-xs font-medium text-gray-700 mb-1">{t('dashboard.endDate')}</label>
                            <div className="relative">
                                <Calendar className="w-4 h-4 absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400" />
                                <input
                                    type="date"
                                    value={filters.dateRange.end}
                                    onChange={(e) => updateNestedFilter('dateRange', 'end', e.target.value)}
                                    className="w-full pl-10 pr-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-colors"
                                />
                            </div>
                        </div>

                        {/* Amount Range */}
                        <div>
                            <label className="block text-xs font-medium text-gray-700 mb-1">{t('dashboard.minAmount')}</label>
                            <div className="relative">
                                <DollarSign className="w-4 h-4 absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400" />
                                <input
                                    type="number"
                                    placeholder="0"
                                    value={filters.amountRange.min}
                                    onChange={(e) => updateNestedFilter('amountRange', 'min', e.target.value)}
                                    className="w-full pl-10 pr-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-colors"
                                />
                            </div>
                        </div>

                        <div>
                            <label className="block text-xs font-medium text-gray-700 mb-1">{t('dashboard.maxAmount')}</label>
                            <div className="relative">
                                <DollarSign className="w-4 h-4 absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400" />
                                <input
                                    type="number"
                                    placeholder="∞"
                                    value={filters.amountRange.max}
                                    onChange={(e) => updateNestedFilter('amountRange', 'max', e.target.value)}
                                    className="w-full pl-10 pr-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-colors"
                                />
                            </div>
                        </div>
                    </div>

                    {/* Sort Options */}
                    <div className="mt-4 flex items-center space-x-4">
                        <div className="flex items-center space-x-2">
                            <label className="text-xs font-medium text-gray-700">{t('dashboard.sortBy')}</label>
                            <select
                                value={filters.sortBy}
                                onChange={(e) => updateFilter('sortBy', e.target.value)}
                                className="border border-gray-300 rounded px-2 py-1 text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                            >
                                <option value="date">{t('dashboard.date')}</option>
                                <option value="amount">{t('dashboard.amount')}</option>
                                <option value="category">{t('dashboard.category')}</option>
                            </select>
                        </div>
                        <button
                            onClick={() => updateFilter('sortOrder', filters.sortOrder === 'asc' ? 'desc' : 'asc')}
                            className="flex items-center space-x-1 px-2 py-1 border border-gray-300 rounded hover:bg-gray-50 transition-colors"
                        >
                            {filters.sortOrder === 'asc' ? (
                                <SortAsc className="w-4 h-4" />
                            ) : (
                                <SortDesc className="w-4 h-4" />
                            )}
                            <span className="text-sm capitalize">{filters.sortOrder}</span>
                        </button>
                    </div>
                </div>
            )}
        </div>
    );
});

FilterPanel.displayName = 'FilterPanel';

export default FilterPanel;
