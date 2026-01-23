import React, { useState, useMemo, useCallback, useEffect } from "react";
import { useI18n } from "../../../i18n";
import { getTranslatedString, parseMultilingualString } from "../../../utils/multilingual";
import { normalizeNameForComparison } from "../../../utils/nameNormalization";
import TransactionListItem from "../../common/TransactionListItem";
import { StatCard } from "../../common/StatCard";
import { FilterPanel, FilterState } from "../FilterPanel";
import {
  RefreshCw,
  Wallet,
  ArrowUpRight,
  TrendingDown,
  TrendingUp,
  Users,
  Filter,
  Search,
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


type Product = {
  id: string;
  name: string;
  category: string;
};

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
  entities: any[]; // Unified entities array
  customerBalances: any; // Balance hook for customers
  supplierBalances: any; // Balance hook for suppliers
  transactions: Transaction[];
  products: Product[];
};

export const DashboardOverview: React.FC<DashboardOverviewProps> = ({
  cashDrawerBalance,
  refreshCashDrawerBalance,
  formatCurrency,
  formatCurrencyWithSymbol,
  dashboardPeriod,
  getPeriodData,
  entities,
  customerBalances,
  supplierBalances,
  transactions,
  products,
}) => {
  // Filter entities by type
  const customers = useMemo(() => {
    return entities
      .filter((e: any) => e.entity_type === 'customer' && !e._deleted)
      .map((c: any) => {
        const balances = customerBalances.getBalances(c.id) || { USD: 0, LBP: 0 };
        return {
          ...c,
          lb_balance: balances.LBP,
          usd_balance: balances.USD,
        };
      });
  }, [entities, customerBalances]);

  const suppliers = useMemo(() => {
    return entities
      .filter((e: any) => e.entity_type === 'supplier' && !e._deleted)
      .map((s: any) => {
        const balances = supplierBalances.getBalances(s.id) || { USD: 0, LBP: 0 };
        return {
          ...s,
          lb_balance: balances.LBP,
          usd_balance: balances.USD,
        };
      });
  }, [entities, supplierBalances]);
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
    // Normalize search term for Arabic text (handles أ = ا normalization)
    const normalizedSearchTerm = filters.searchTerm ? normalizeNameForComparison(filters.searchTerm) : '';

    let filtered = transactions.filter((transaction) => {
      // Search filter - convert multilingual strings to strings for searching
      const categoryStr = getTranslatedString(parseMultilingualString(transaction.category as any), language as any);
      const descriptionStr = getTranslatedString(parseMultilingualString(transaction.description as any), language as any);
      const matchesSearch = !filters.searchTerm ||
        normalizeNameForComparison(categoryStr).includes(normalizedSearchTerm) ||
        normalizeNameForComparison(descriptionStr).includes(normalizedSearchTerm);

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
              className={`text-sm font-medium ${getPeriodData.incomeChange >= 0
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
              className={`text-sm font-medium ${getPeriodData.expenseChange >= 0
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
              className={`p-2 rounded-lg transition-colors duration-200 ${showFilters ? 'bg-blue-100 text-blue-600' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
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