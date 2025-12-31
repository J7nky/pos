import React, { useState, useMemo, useCallback, useRef, useEffect } from "react";
import { useI18n } from "../../../i18n";
import { getTranslatedString, parseMultilingualString } from "../../../utils/multilingual";
import TransactionListItem from "../../common/TransactionListItem";
import {
  RefreshCw,
  Wallet,
  ArrowUpRight,
  TrendingDown,
  TrendingUp,
  Users,
  ArrowDownRight,
  Filter,
  Search,
  X,
  Calendar,
  DollarSign,
  ChevronDown,
  RotateCcw,
  SortAsc,
  SortDesc,
} from "lucide-react";

type Currency = "USD" | "LBP";

type Transaction = {
  id: string;
  type: "income" | "expense";
  amount: number;
  currency: Currency;
  category: string;
  description: string;
  createdAt: string;
};

type FilterState = {
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
};

type Customer = {
  lb_balance?: number;
  usd_balance?: number;
};


type Product = {
  id: string;
  name: string;
  category: string;
};

type Supplier = {
  id: string;
  name: string;
};

type StatCardProps = {
  title: string;
  value: React.ReactNode;
  icon: React.ReactNode;
  borderColor: string;
  children?: React.ReactNode;
};

const StatCard: React.FC<StatCardProps> = React.memo(({
  title,
  value,
  icon,
  borderColor,
  children,
}) => (
  <div
    className={`bg-white rounded-xl shadow-sm hover:shadow-md transition-shadow duration-200 p-6 border-l-4 ${borderColor}`}
  >
    <div className="flex items-center justify-between">
      <div className="flex-1 min-w-0">
        <div className="text-sm text-gray-600 font-medium truncate">{title}</div>
        <div className="text-2xl font-bold text-gray-900 mt-1">{value}</div>
        {children}
      </div>
      <div className="p-3 bg-gray-50 rounded-full ml-4 flex-shrink-0">{icon}</div>
    </div>
  </div>
));

StatCard.displayName = 'StatCard';

// Enhanced Filter Component
type FilterPanelProps = {
  filters: FilterState;
  onFiltersChange: (filters: FilterState) => void;
  onReset: () => void;
  isVisible: boolean;
  onToggle: () => void;
};

const FilterPanel: React.FC<FilterPanelProps> = React.memo(({
  filters,
  onFiltersChange,
  onReset,
  isVisible,
  onToggle,
}) => {
  const [isExpanded, setIsExpanded] = useState(true);
  const searchInputRef = useRef<HTMLInputElement>(null);

  // // Focus search input when filters open
  // useEffect(() => {
  //   if (isVisible && searchInputRef.current) {
  //     searchInputRef.current.focus();
  //   }
  // }, [isVisible]);

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
  const { t } = useI18n();
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


type DashboardOverviewProps = {
  cashDrawerBalance: number | null;
  refreshCashDrawerBalance: () => Promise<void>;
  formatCurrency: (value: number) => string;
  formatCurrencyWithSymbol: (value: number, currency: Currency) => string;
  dashboardPeriod: string;
  getPeriodData: {
    income: number;
    expenses: number;
    incomeChange: number;
    expenseChange: number;
  };
  customers: Customer[];
  transactions: Transaction[];
  products: Product[];
  suppliers: Supplier[];
};

export const DashboardOverview: React.FC<DashboardOverviewProps> = ({
  cashDrawerBalance,
  refreshCashDrawerBalance,
  formatCurrency,
  formatCurrencyWithSymbol,
  dashboardPeriod,
  getPeriodData,
  customers,
  transactions,
  products,
  suppliers,
}) => {
  const { t, language } = useI18n();
  const [highlightedTransactionId, setHighlightedTransactionId] = useState<string | null>(null);

  // Check for transaction to highlight from sessionStorage
  // Use a delay to ensure sessionStorage is set after navigation
  useEffect(() => {
    const checkHighlight = () => {
      const highlightId = sessionStorage.getItem('highlightDashboardTransactionId');
      if (highlightId) {
        setHighlightedTransactionId(highlightId);
        // Scroll to the transaction
        setTimeout(() => {
          const element = document.getElementById(`transaction-${highlightId}`);
          if (element) {
            element.scrollIntoView({ behavior: 'smooth', block: 'center' });
          }
        }, 300);
        // Clear after highlighting
        sessionStorage.removeItem('highlightDashboardTransactionId');
        // Stop highlighting after 3 seconds
        setTimeout(() => {
          setHighlightedTransactionId(null);
        }, 3000);
        return true;
      }
      return false;
    };

    // Check immediately
    if (checkHighlight()) return;

    // Also check after a short delay to account for navigation timing
    const timeout = setTimeout(() => {
      checkHighlight();
    }, 200);

    return () => clearTimeout(timeout);
  }, []);

  // Enhanced filter state
  const [showFilters, setShowFilters] = useState(true);
  const [filters, setFilters] = useState<FilterState>({
    searchTerm: '',
    type: '',
    currency: '',
    dateRange: { start: '', end: '' },
    amountRange: { min: '', max: '' },
    sortBy: 'date',
    sortOrder: 'desc',
  });

  // Memoized customer debt calculations
  const customerDebtData = useMemo(() => {
  const totalLBPDebt = customers
    .filter((c) => (c.lb_balance || 0) > 0)
    .reduce((sum, c) => sum + (c.lb_balance || 0), 0);

  const totalUSDDebt = customers
    .filter((c) => (c.usd_balance || 0) > 0)
    .reduce((sum, c) => sum + (c.usd_balance || 0), 0);

  const customersWithDebt = customers.filter(
    (c) => (c.lb_balance || 0) > 0 || (c.usd_balance || 0) > 0
  ).length;

    return { totalLBPDebt, totalUSDDebt, customersWithDebt };
  }, [customers]);

  // Enhanced filtered transactions with advanced filtering
  const filteredTransactions = useMemo(() => {
    let filtered = transactions.filter((transaction) => {
      // Search filter - convert multilingual strings to strings for searching
      const categoryStr = getTranslatedString(parseMultilingualString(transaction.category as any), language as any);
      const descriptionStr = getTranslatedString(parseMultilingualString(transaction.description as any), language as any);
      const matchesSearch = !filters.searchTerm || 
        categoryStr.toLowerCase().includes(filters.searchTerm.toLowerCase()) ||
        descriptionStr.toLowerCase().includes(filters.searchTerm.toLowerCase());
      
      // Type filter
      const matchesType = !filters.type || transaction.type === filters.type;
      
      // Currency filter
      const matchesCurrency = !filters.currency || transaction.currency === filters.currency;
      
      // Date range filter
      const transactionDate = new Date(transaction.createdAt);
      const matchesDateRange = (!filters.dateRange.start || transactionDate >= new Date(filters.dateRange.start)) &&
                              (!filters.dateRange.end || transactionDate <= new Date(filters.dateRange.end));
      
      // Amount range filter
      const matchesAmountRange = (!filters.amountRange.min || transaction.amount >= parseFloat(filters.amountRange.min)) &&
                                (!filters.amountRange.max || transaction.amount <= parseFloat(filters.amountRange.max));
      
      return matchesSearch && matchesType && matchesCurrency && matchesDateRange && matchesAmountRange;
    });

    // Sort transactions
    filtered.sort((a, b) => {
      let comparison = 0;
      
      switch (filters.sortBy) {
        case 'date':
          comparison = new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
          break;
        case 'amount':
          comparison = a.amount - b.amount;
          break;
        case 'category':
          const aCategory = getTranslatedString(parseMultilingualString(a.category as any), language as any);
          const bCategory = getTranslatedString(parseMultilingualString(b.category as any), language as any);
          comparison = aCategory.localeCompare(bCategory);
          break;
        default:
          comparison = 0;
      }
      
      return filters.sortOrder === 'asc' ? comparison : -comparison;
    });

    return filtered.slice(0, 10);
  }, [transactions, filters, language]);

  // Memoized callback functions
  const handleRefreshCashDrawer = useCallback(async () => {
    await refreshCashDrawerBalance();
  }, [refreshCashDrawerBalance]);

  const toggleFilters = useCallback(() => {
    setShowFilters(prev => !prev);
  }, []);

  const handleFiltersChange = useCallback((newFilters: FilterState) => {
    setFilters(newFilters);
  }, []);

  const handleResetFilters = useCallback(() => {
    setFilters({
      searchTerm: '',
      type: '',
      currency: '',
      dateRange: { start: '', end: '' },
      amountRange: { min: '', max: '' },
      sortBy: 'date',
      sortOrder: 'desc',
    });
  }, []);

  // Filter summary for display
  const filterSummary = useMemo(() => {
    const activeFilters = [];
    if (filters.searchTerm) activeFilters.push(`${t('dashboard.search')}: "${filters.searchTerm}"`);
    if (filters.type) activeFilters.push(`${t('dashboard.type')}: ${filters.type}`);
    if (filters.currency) activeFilters.push(`${t('dashboard.currency')}: ${filters.currency}`);
    if (filters.dateRange.start || filters.dateRange.end) {
      const start = filters.dateRange.start || 'Any';
      const end = filters.dateRange.end || 'Any';
      activeFilters.push(`${t('dashboard.dateRange')}: ${start} to ${end}`);
    }
    if (filters.amountRange.min || filters.amountRange.max) {
      const min = filters.amountRange.min || '0';
      const max = filters.amountRange.max || '∞';
      activeFilters.push(`${t('dashboard.amountRange')}: ${min} - ${max}`);
    }
    return activeFilters;
  }, [filters]);

  return (
    <div>
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        {/* Cash Drawer */}
        <StatCard
          title={t('dashboard.cashDrawerBalance')}
          value={
            cashDrawerBalance === null
              ? "—"
              : formatCurrency(cashDrawerBalance)
          }
          borderColor="border-emerald-500"
          icon={<Wallet className="w-6 h-6 text-emerald-600" />}
        >
          <div className="flex items-center mt-2 text-xs text-gray-500">
            <button
              onClick={handleRefreshCashDrawer}
              className="inline-flex items-center px-2 py-1 bg-gray-100 rounded hover:bg-gray-200 transition-colors duration-200"
            >
              <RefreshCw className="w-3 h-3 mr-1" /> {t('dashboard.refresh')}
            </button>
          </div>
        </StatCard>

        {/* Revenue */}
        <StatCard
          title={`${t('dashboard.revenue')} (${dashboardPeriod})`}
          value={formatCurrency(getPeriodData.income)}
          borderColor="border-blue-500"
          icon={<TrendingUp className="w-6 h-6 text-blue-600" />}
        >
          <div className="flex items-center mt-2">
            {getPeriodData.incomeChange >= 0 ? (
              <ArrowUpRight className="w-4 h-4 text-green-500 mr-1" />
            ) : (
              <TrendingDown className="w-4 h-4 text-red-500 mr-1" />
            )}
            <span
              className={`text-sm font-medium ${
                getPeriodData.incomeChange >= 0
                  ? "text-green-600"
                  : "text-red-600"
              }`}
            >
              {Math.abs(getPeriodData.incomeChange).toFixed(1)}%
            </span>
            <span className="text-xs text-gray-500 ml-1">{t('dashboard.vsPrevPeriod')}</span>
          </div>
        </StatCard>

        {/* Expenses */}
        <StatCard
          title={`${t('dashboard.expenses')} (${dashboardPeriod})`}
          value={formatCurrency(getPeriodData.expenses)}
          borderColor="border-red-500"
          icon={<TrendingDown className="w-6 h-6 text-red-600" />}
        >
          <div className="flex items-center mt-2">
            {getPeriodData.expenseChange >= 0 ? (
              <ArrowUpRight className="w-4 h-4 text-red-500 mr-1" />
            ) : (
              <TrendingDown className="w-4 h-4 text-green-500 mr-1" />
            )}
            <span
              className={`text-sm font-medium ${
                getPeriodData.expenseChange >= 0
                  ? "text-red-600"
                  : "text-green-600"
              }`}
            >
              {Math.abs(getPeriodData.expenseChange).toFixed(1)}%
            </span>
            <span className="text-xs text-gray-500 ml-1">{t('dashboard.vsPrevPeriod')}</span>
          </div>
        </StatCard>

        {/* Customer Debt */}
        <StatCard
          title={t('dashboard.totalCustomerDebt')}
          value={
            <div className="space-y-1">
              <div className="flex items-center">
                <span className="text-xs text-gray-500 mr-2">LBP:</span>
                <span className="text-lg font-semibold">{formatCurrency(customerDebtData.totalLBPDebt)}</span>
              </div>
              <div className="flex items-center">
                <span className="text-xs text-gray-500 mr-2">USD:</span>
                <span className="text-lg font-semibold">{formatCurrency(customerDebtData.totalUSDDebt)}</span>
              </div>
            </div>
          }
          borderColor="border-orange-500"
          icon={<Users className="w-6 h-6 text-orange-600" />}
        >
          <div className="flex items-center mt-2">
            <Users className="w-4 h-4 text-blue-500 mr-1" />
            <span className="text-sm font-medium text-blue-600">
              {customerDebtData.customersWithDebt}
            </span>
            <span className="text-xs text-gray-500 ml-1">
              {t('dashboard.customersWithDebt')}
            </span>
          </div>
        </StatCard>
      </div>

      {/* Recent Transactions and Inventory */}
      <div className="">
        {/* Recent Transactions */}
        <div className="bg-white rounded-xl shadow-sm hover:shadow-md transition-shadow duration-200 p-6">
          <div className="flex items-center justify-between mb-6">
            <div className="flex items-center space-x-3">
              <h3 className="text-lg font-semibold text-gray-900">{t('dashboard.recentTransactions')}</h3>
              {filterSummary.length > 0 && (
                <div className="flex items-center space-x-1">
                  <span className="text-xs text-gray-500">({filterSummary.length} filters)</span>
                  <div className="flex flex-wrap gap-1">
                    {filterSummary.slice(0, 2).map((filter, index) => (
                      <span
                        key={index}
                        className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-blue-100 text-blue-800"
                      >
                        {filter}
                      </span>
                    ))}
                    {filterSummary.length > 2 && (
                      <span className="text-xs text-gray-500">+{filterSummary.length - 2} more</span>
                    )}
                  </div>
                </div>
              )}
            </div>
            <button
              onClick={toggleFilters}
              className={`p-2 rounded-lg transition-colors duration-200 ${
                showFilters ? 'bg-blue-100 text-blue-600' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
              }`}
            >
              <Filter className="w-4 h-4" />
            </button>
          </div>

          <FilterPanel
            filters={filters}
            onFiltersChange={handleFiltersChange}
            onReset={handleResetFilters}
            isVisible={showFilters}
            onToggle={toggleFilters}
          />

          {/* Results Summary */}
          <div className="mb-4 flex items-center justify-between text-sm text-gray-600">
            <span>
              {t('dashboard.showing')} {filteredTransactions.length} {t('dashboard.of')} {transactions.length} {t('dashboard.transactions')}
            </span>
            {filterSummary.length > 0 && (
              <span className="text-blue-600">
                {t('dashboard.filteredBy')} {filterSummary.length} {t('dashboard.criteria')}
              </span>
            )}
          </div>

          <div className="space-y-3">
            {filteredTransactions.length === 0 ? (
              <div className="text-center py-12 text-gray-500">
                <div className="w-16 h-16 mx-auto mb-4 bg-gray-100 rounded-full flex items-center justify-center">
                  <Search className="w-8 h-8 text-gray-400" />
                </div>
                <h4 className="text-lg font-medium text-gray-900 mb-2">{t('dashboard.noTransactionsFound')}</h4>
                <div className="text-sm">
                  {filterSummary.length > 0 
                    ? t('dashboard.tryAdjustingFilters')
                    : t('dashboard.noTransactionsAvailable')
                  }
                </div>
                {filterSummary.length > 0 && (
                  <button
                    onClick={handleResetFilters}
                    className="mt-3 text-sm text-blue-600 hover:text-blue-700 transition-colors"
                  >
                    {t('dashboard.clearAllFilters')}
                  </button>
                )}
              </div>
            ) : (
              filteredTransactions.map((transaction) => {
                // Create a formatCurrency function that uses formatCurrencyWithSymbol
                const formatCurrencyForItem = (amount: number): string => {
                  return formatCurrencyWithSymbol(amount, transaction.currency || "USD");
                };
                
                const isHighlighted = highlightedTransactionId === transaction.id;
                
                return (
                  <div
                    key={transaction.id}
                    id={`transaction-${transaction.id}`}
                    className={isHighlighted ? 'border-2 border-blue-400 shadow-xl animate-pulse rounded-lg' : ''}
                  >
                    <TransactionListItem
                      transaction={transaction}
                      formatCurrency={formatCurrencyForItem}
                      showDate={true}
                      showCurrency={true}
                      showReference={false}
                    />
                  </div>
                );
              })
            )}
          </div>
        </div>

      </div>
    </div>
  );
};
export default DashboardOverview;