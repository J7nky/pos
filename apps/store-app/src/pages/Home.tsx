import { useEffect, useMemo, useCallback, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { useState } from 'react';
import { useOfflineData } from '../contexts/OfflineDataContext';
import { useSupabaseAuth } from '../contexts/SupabaseAuthContext';
import { useI18n } from '../i18n';
import { useErrorHandler } from '../hooks/useErrorHandler';
import { useEntityBalances } from '../hooks/useEntityBalances';
import {
  DollarSign,
  Package,
  AlertTriangle,
  ShoppingCart,
  Receipt,
  Eye,
  Truck,
  UserPlus,
  Zap,
  ChevronUp,
  ChevronDown,
  EyeOff,
} from 'lucide-react';
import CashDrawerMonitor from '../components/CashDrawerMonitor';
import FastActionCard from '../components/cards/FastActionCard';
import StatCard from '../components/cards/StatCard';
import LowStockItem from '../components/LowStockItem';
import CashDrawerOpeningModal from '../components/common/CashDrawerOpeningModal';
import TransactionListModal from '../components/common/TransactionListModal';
import RecordExpenseModal from '../components/common/RecordExpenseModal';
import { getLocalDateString, getTodayLocalDate } from '../utils/dateUtils';
import { currencyService } from '../services/currencyService';
import type { CurrencyCode } from '@pos-platform/shared';
import { formatTime } from '../utils/numberFormat';

interface CashDrawerStatus {
  currentBalance: number; // Keep for backward compatibility
  usdBalance: number;      // NEW
  lbpBalance: number;      // NEW
  lastUpdated: string;
  transactionCount: number;
  openedAt: string;
}

export default function Home() {

  const navigate = useNavigate();
  const [cashDrawerStatus, setCashDrawerStatus] = useState<CashDrawerStatus | null>(null);
  const [cashAffectingTxIds, setCashAffectingTxIds] = useState<Set<string>>(() => new Set());
  const [isLoadingCashDrawer, setIsLoadingCashDrawer] = useState(false);
  const [isInitialLoad, setIsInitialLoad] = useState(true);
  const [showOpeningModal, setShowOpeningModal] = useState(false);
  const [showCombinedBalance, setShowCombinedBalance] = useState(false);
  const [showExpensesModal, setShowExpensesModal] = useState(false);
  const [showIncomeModal, setShowIncomeModal] = useState(false);
  const [showRecordExpenseModal, setShowRecordExpenseModal] = useState(false);
  // Use ref to store debounce timeout to avoid memory leaks
  const debounceTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  // Use ref to track previous balances for comparison (not for rendering)
  const prevBalancesRef = useRef<{ USD: number; LBP: number } | null>(null);

  const raw = useOfflineData();
  const products = Array.isArray(raw.products) ? raw.products.map(p => ({ ...p, isActive: true, createdAt: p.created_at })) : [];

  // Get customer entities and calculate balances from journal entries
  const customerEntities = Array.isArray(raw.customers) ? raw.customers : [];
  const customerIds = useMemo(() => customerEntities.map(c => c.id), [customerEntities]);
  const customerBalances = useEntityBalances(customerIds, 'customer', true);

  const customers = customerEntities.map(c => {
    const byCurrency = customerBalances.getBalances(c.id) || {};
    return {
      ...c,
      isActive: c.is_active,
      createdAt: c.created_at,
      balances: byCurrency,
      // Legacy shortcuts for older code paths.
      lb_balance: byCurrency.LBP ?? 0,
      usd_balance: byCurrency.USD ?? 0
    };
  });
  const sales = Array.isArray(raw.sales) ? raw.sales.map(s => ({ ...s, createdAt: s.created_at })) : [];
  const stockLevels = Array.isArray(raw.stockLevels) ? raw.stockLevels : [];
  const cashDrawer = raw.cashDrawer;
  const openCashDrawer = raw.openCashDrawer;
  const transactions = Array.isArray(raw.transactions) ? raw.transactions.map(t => ({ ...t, createdAt: t.created_at })) : [];
  const lowStockAlertsEnabled = raw.lowStockAlertsEnabled;
  const lowStockThreshold = raw.lowStockThreshold;
  const exchangeRate = raw.exchangeRate || 89500; // Get exchange rate from context
  const storePreferredCurrency = (raw.currency || 'USD') as CurrencyCode; // SINGLE SOURCE OF TRUTH from context
  const { userProfile } = useSupabaseAuth();
  const [showFastActions, setShowFastActions] = useState(true);
  const { t } = useI18n();
  const { handleError } = useErrorHandler();
  const inventory = Array.isArray(raw.inventory) ? raw.inventory : [];
  const recentReceivesCount = useMemo(() =>
    inventory
      .sort((a, b) => new Date(b.received_at || b.receivedAt).getTime() - new Date(a.received_at || a.receivedAt).getTime())
      .slice(0, 10).length,
    [inventory]
  );

  // Memoize expensive calculations
  const today = useMemo(() => getTodayLocalDate(), []);

  const todaySales = useMemo(() =>
    sales.filter(sale =>
      sale.createdAt && getLocalDateString(sale.createdAt) === today
    ), [sales, today]
  );

  // A transaction is "cash-affecting" iff it has at least one posted journal
  // entry on account 1100 (Cash) inside the active session window — the same
  // source of truth the cash drawer balance is computed from. The id set is
  // fetched inside loadCashDrawerStatus (journal_entries are intentionally
  // not hydrated into context per crudHelperService §5.1).
  const sessionExpenses = useMemo(() =>
    transactions.filter(t => t.type === 'expense' && cashAffectingTxIds.has(t.id)),
    [transactions, cashAffectingTxIds]
  );

  const sessionIncome = useMemo(() =>
    transactions.filter(t => t.type === 'income' && cashAffectingTxIds.has(t.id)),
    [transactions, cashAffectingTxIds]
  );

  // Helper function to convert expense amounts to preferred currency
  const convertExpenseAmount = useCallback((expense: any): number => {
    const amount = expense.amount || 0;
    const transactionCurrency = (expense.currency as CurrencyCode | undefined) || storePreferredCurrency;
    if (transactionCurrency === storePreferredCurrency) return amount;
    return currencyService.safeConvert(amount, transactionCurrency, storePreferredCurrency);
  }, [storePreferredCurrency]);

  // Helper function to convert income amounts to preferred currency
  const convertIncomeAmount = useCallback((income: any): number => {
    const amount = income.amount || 0;
    const transactionCurrency = (income.currency as CurrencyCode | undefined) || storePreferredCurrency;
    if (transactionCurrency === storePreferredCurrency) return amount;
    return currencyService.safeConvert(amount, transactionCurrency, storePreferredCurrency);
  }, [storePreferredCurrency]);

  // Helper function to get local cash drawer session from context
  const getLocalCurrentSession = useCallback(() => {
    return cashDrawer; // Already available in context
  }, [cashDrawer]);

  // Note: calculateLocalCashDrawerBalance is no longer used - balance is computed from journal entries
  // via cashDrawerUpdateService.getCurrentCashDrawerBalance()

  // Helper function to get cash drawer transaction history from local data
  const getLocalCashDrawerHistory = useCallback((limit: number = 50): any[] => {
    const cashDrawerTransactions = transactions
      .filter(trans =>
        trans.store_id === raw.storeId &&
        trans.category?.startsWith('cash_drawer_')
      )
      .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
      .slice(0, limit);
    return cashDrawerTransactions;
  }, [transactions, raw.storeId]);

  const loadCashDrawerStatus = useCallback(async (showLoading = false) => {

    if (!raw.storeId || !raw.currentBranchId) return;

    // Only show loading spinner on initial load or when explicitly requested
    if (showLoading || isInitialLoad) {
      setIsLoadingCashDrawer(true);
    }

    try {
      // ✅ Get balance computed from journal entries (single source of truth)
      const { cashDrawerUpdateService } = await import('../services/cashDrawerUpdateService');

      // Get current session
      const currentSession = getLocalCurrentSession();

      // If there's no active session, set status to null
      if (!currentSession) {
        setCashDrawerStatus((prev) => {
          // Only update if status actually changed to prevent unnecessary re-renders
          if (prev === null) return prev;
          return null;
        });
        setCashAffectingTxIds(prev => (prev.size === 0 ? prev : new Set()));
        prevBalancesRef.current = null;
        setIsInitialLoad(false);
        setIsLoadingCashDrawer(false);
        return;
      }

      // Get balances for both currencies computed from journal entries (account_code = '1100')
      // and, in parallel, the set of transaction IDs that posted a 1100 entry
      // within the active session — used to filter the income/expense cards so
      // they reflect only cash-affecting transactions.
      const [balances, txIds] = await Promise.all([
        cashDrawerUpdateService.getCurrentCashDrawerBalances(raw.storeId, raw.currentBranchId),
        cashDrawerUpdateService.getCurrentSessionCashTransactionIds(raw.storeId, raw.currentBranchId),
      ]);
      setCashAffectingTxIds(prev => {
        if (prev.size === txIds.size && [...prev].every(id => txIds.has(id))) return prev;
        return txIds;
      });

      // Calculate current balance in store's preferred currency.
      // Each leg only contributes when its rate is available; otherwise it stays 0.
      const usdInPreferred = currencyService.canConvert('USD', storePreferredCurrency)
        ? currencyService.convert(balances.USD || 0, 'USD', storePreferredCurrency)
        : (storePreferredCurrency === 'USD' ? (balances.USD || 0) : 0);
      const lbpInPreferred = currencyService.canConvert('LBP', storePreferredCurrency)
        ? currencyService.convert(balances.LBP || 0, 'LBP', storePreferredCurrency)
        : (storePreferredCurrency === 'LBP' ? (balances.LBP || 0) : 0);
      const currentBalance = usdInPreferred + lbpInPreferred;

      const localHistory = getLocalCashDrawerHistory();

      // Only update if balances actually changed to prevent unnecessary re-renders
      const prevBalances = prevBalancesRef.current;
      const balancesChanged = !prevBalances ||
        prevBalances.USD !== balances.USD ||
        prevBalances.LBP !== balances.LBP;

      if (balancesChanged) {
        // Update ref for next comparison
        prevBalancesRef.current = balances;

        // Only update state if something actually changed
        setCashDrawerStatus((prevStatus) => {
          if (prevStatus &&
            prevStatus.usdBalance === balances.USD &&
            prevStatus.lbpBalance === balances.LBP &&
            prevStatus.transactionCount === localHistory.length) {
            return prevStatus; // No change
          }

          return {
            currentBalance, // Keep for backward compatibility
            usdBalance: balances.USD,
            lbpBalance: balances.LBP,
            lastUpdated: new Date().toISOString(),
            transactionCount: localHistory.length,
            openedAt: currentSession?.openedAt || currentSession?.lastUpdated || ''
          };
        });
      }

      setIsInitialLoad(false);
    } catch (error) {
      handleError(error);
      // Don't show error state in UI, just log it
    } finally {
      setIsLoadingCashDrawer(false);
    }
  }, [raw.storeId, raw.currentBranchId, getLocalCurrentSession, getLocalCashDrawerHistory, storePreferredCurrency, exchangeRate, isInitialLoad]);

  // Debounced update function to prevent excessive reloading
  const debouncedLoadCashDrawerStatus = useCallback(() => {
    // Clear any existing timeout
    if (debounceTimeoutRef.current) {
      clearTimeout(debounceTimeoutRef.current);
    }

    // Set new timeout
    debounceTimeoutRef.current = setTimeout(() => {
      loadCashDrawerStatus();
      debounceTimeoutRef.current = null;
    }, 500); // Increased to 500ms for better debouncing
  }, [loadCashDrawerStatus]);

  // Helper function to format currency based on store's preferred currency
  const formatCurrencyForStore = useCallback((amount: number): string => {
    return currencyService.format(amount, storePreferredCurrency);
  }, [storePreferredCurrency]);

  // Track previous cash drawer session ID to detect changes
  const prevCashDrawerIdRef = useRef<string | null>(null);

  // ✅ IMPROVEMENT 1: React directly to context changes (cashDrawer state)
  // This ensures we always reflect the latest session state from context
  useEffect(() => {
    if (!raw.storeId || !raw.currentBranchId) return;

    const currentSessionId = raw.cashDrawer?.id || null;
    const sessionChanged = prevCashDrawerIdRef.current !== currentSessionId;

    if (sessionChanged) {
      prevCashDrawerIdRef.current = currentSessionId;
      // Session changed - reload status (debounced to avoid rapid updates)
      debouncedLoadCashDrawerStatus();
    }
  }, [raw.cashDrawer?.id, raw.storeId, raw.currentBranchId, debouncedLoadCashDrawerStatus]);

  // Consolidated refresh triggers: initial load when store/branch context is ready (no periodic polling).
  useEffect(() => {
    if (!raw.storeId || !raw.currentBranchId) return;

    loadCashDrawerStatus(true);

    return () => {
      if (debounceTimeoutRef.current) {
        clearTimeout(debounceTimeoutRef.current);
        debounceTimeoutRef.current = null;
      }
    };
  }, [raw.storeId, raw.currentBranchId, loadCashDrawerStatus]);

  // ✅ IMPROVEMENT 3: Sync completion detection (only when sync transitions to complete)
  useEffect(() => {
    if (!raw.storeId || !raw.transactions || isLoadingCashDrawer) return;
    // Only trigger when sync transitions from loading to complete
    if (raw.loading?.sync === false) {
      // Use a small delay to batch with other updates
      const timeoutId = setTimeout(() => {
        debouncedLoadCashDrawerStatus();
      }, 100);
      return () => clearTimeout(timeoutId);
    }
  }, [raw.storeId, raw.loading?.sync, debouncedLoadCashDrawerStatus, isLoadingCashDrawer]);

  // ✅ IMPROVEMENT 4: Track cash drawer transaction changes (consolidated with context reactivity)
  const prevTransactionCountRef = useRef(transactions.length);
  useEffect(() => {
    if (!raw.storeId || isLoadingCashDrawer) return;

    // Only reload if transaction count actually changed (new cash drawer transaction added)
    const currentCount = transactions.filter(t =>
      t.category?.startsWith('cash_drawer_')
    ).length;

    if (prevTransactionCountRef.current !== currentCount) {
      prevTransactionCountRef.current = currentCount;
      debouncedLoadCashDrawerStatus();
    }
  }, [raw.storeId, transactions, debouncedLoadCashDrawerStatus, isLoadingCashDrawer]);

  // ✅ IMPROVEMENT 5: Event listeners for external updates (hybrid approach)
  // 
  // Event-driven pattern is still valuable for:
  // 1. Cross-tab communication (multiple browser tabs open)
  // 2. Real-time updates from eventStreamService (remote changes)
  // 3. Undo operations that bypass normal context updates
  // 4. Updates from other components that don't go through context
  //
  // Primary mechanism: React reactivity (raw.cashDrawer?.id changes)
  // Secondary mechanism: Event listeners (for cross-tab/external updates)
  useEffect(() => {
    if (!raw.storeId) return;

    const handleCashDrawerUpdated = (e: any) => {
      if (e?.detail?.storeId && e.detail.storeId !== raw.storeId) return;
      debouncedLoadCashDrawerStatus();
    };

    const handleUndoCompleted = (e: any) => {
      if (e?.detail?.storeId && e.detail.storeId !== raw.storeId) return;
      debouncedLoadCashDrawerStatus();
    };

    const handleDataSynced = () => {
      // Always queue a debounced reload — the debounce already coalesces rapid
      // events. Gating on `isLoadingCashDrawer` would (a) capture a stale value
      // in this closure for the lifetime of the listener, and (b) silently drop
      // the only refresh signal we get for remote payments.
      debouncedLoadCashDrawerStatus();
    };

    window.addEventListener('cash-drawer-updated', handleCashDrawerUpdated as any);
    window.addEventListener('undo-completed', handleUndoCompleted as any);
    window.addEventListener('data-synced', handleDataSynced as any);

    return () => {
      window.removeEventListener('cash-drawer-updated', handleCashDrawerUpdated as any);
      window.removeEventListener('undo-completed', handleUndoCompleted as any);
      window.removeEventListener('data-synced', handleDataSynced as any);
    };
  }, [raw.storeId, debouncedLoadCashDrawerStatus]);

  const lowStockItems = lowStockAlertsEnabled
    ? stockLevels.filter(item => item.currentStock < lowStockThreshold)
    : [];

  const handleOpenDrawer = () => {
    setShowOpeningModal(true);
  };

  const [recommendedAmount, setRecommendedAmount] = useState(0);

  // Load recommended amount when modal opens
  useEffect(() => {
    if (showOpeningModal) {
      const fetchRecommendedAmount = async () => {
        try {
          const result = await raw.getRecommendedOpeningAmount();
          setRecommendedAmount(result.amount);
        } catch (error) {
          handleError(error);
          setRecommendedAmount(0);
        }
      };
      fetchRecommendedAmount();
    }
  }, [showOpeningModal, raw]);

  const handleConfirmOpening = async (openingAmount: number) => {
    if (!userProfile) {
      throw new Error('User not authenticated');
    }

    // Convert the entered amount to LBP for storage when LBP is in use.
    // For USD-only stores (no LBP rate), pass the amount through.
    let amountInLBP = openingAmount;
    if (storePreferredCurrency !== 'LBP' && currencyService.canConvert(storePreferredCurrency, 'LBP')) {
      amountInLBP = currencyService.convert(openingAmount, storePreferredCurrency, 'LBP');
    }

    await openCashDrawer(amountInLBP, userProfile.id);

    // Wait a moment for the database to be updated
    await new Promise(resolve => setTimeout(resolve, 100));

    // Immediately refresh local status with loading indicator
    await loadCashDrawerStatus(true);

    // Notify any listeners
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('cash-drawer-updated', {
        detail: { storeId: raw.storeId, event: 'opened' }
      }));
    }
  };

  const fastActions = [
    {
      id: 'quick-sale',
      title: t('home.quickSale'),
      description: t('home.quickSaleDesc'),
      icon: ShoppingCart,
      color: 'bg-green-500',
      hoverColor: 'hover:bg-green-600',
      action: () => { navigate('/pos'); },
      stats: `${todaySales.length} ${t('home.today')}`
    },
    {
      id: 'receive-products',
      title: t('home.receiveProducts'),
      description: t('home.receiveProductsDesc'),
      icon: Truck,
      color: 'bg-blue-500',
      hoverColor: 'hover:bg-blue-600',
      action: () => { navigate('/inventory') },
      stats: `${recentReceivesCount} ${t('common.recentReceives')}`
    },
    {
      id: 'add-customer',
      title: t('home.addCustomer'),
      description: t('home.addCustomerDesc'),
      icon: UserPlus,
      color: 'bg-purple-500',
      hoverColor: 'hover:bg-purple-600',
      action: () => { navigate('/accounts') },
      stats: `${customers.filter(c => c.isActive).length} ${t('common.active')}`
    },
    {
      id: 'record-expense',
      title: t('home.recordExpense'),
      description: t('home.recordExpenseDesc'),
      icon: Receipt,
      color: 'bg-amber-500',
      hoverColor: 'hover:bg-amber-600',
      action: () => setShowRecordExpenseModal(true),
      stats: `${formatCurrencyForStore(sessionExpenses.reduce((sum, expense) => sum + convertExpenseAmount(expense), 0))} ${t('home.session')} (${t(`common.currency.${storePreferredCurrency}`)})`
    },
    {
      id: 'today-sales',
      title: t('home.todaySales'),
      description: t('home.todaySalesDesc'),
      icon: Eye,
      color: 'bg-indigo-500',
      hoverColor: 'hover:bg-indigo-600',
      action: () => { navigate('/reports') },
      stats: `${todaySales.length} ${t('home.sales')}`
    },
    {
      id: 'check-stock',
      title: t('home.checkStock'),
      description: t('home.checkStockDesc'),
      icon: Package,
      color: 'bg-teal-500',
      hoverColor: 'hover:bg-teal-600',
      action: () => { navigate('/inventory') },
      stats: lowStockAlertsEnabled ? `${lowStockItems.length} ${t('home.lowStock')}` : `${products.length} ${t('home.products')}`
    }
  ];

  // Smooth cash drawer value display - memoized to prevent unnecessary recalculations
  const getCashDrawerDisplayValue = useCallback(() => {
    // Only show loading on initial load
    if (isInitialLoad && isLoadingCashDrawer) {
      return t('common.loading');
    }

    if (!cashDrawerStatus) {
      return t('common.closed');
    }

    // Always use current status values, but show subtle loading indicator during updates
    // This prevents flickering by keeping the display stable
    const usdBalance = cashDrawerStatus.usdBalance;
    const lbpBalance = cashDrawerStatus.lbpBalance;

    // The cash drawer service still returns a {USD, LBP}-keyed shape — fold
    // it into a per-currency map so the rest of this function can iterate
    // only the currencies the store actually accepts.
    const balanceByCurrency: Partial<Record<CurrencyCode, number>> = {
      USD: usdBalance,
      LBP: lbpBalance,
    };

    // If showing combined balance, convert every accepted currency to the
    // preferred currency and sum.
    if (showCombinedBalance) {
      const total = raw.acceptedCurrencies.reduce((sum, code) => {
        const value = balanceByCurrency[code] ?? 0;
        if (value === 0) return sum;
        if (code === storePreferredCurrency) return sum + value;
        if (currencyService.canConvert(code, storePreferredCurrency)) {
          return sum + currencyService.convert(value, code, storePreferredCurrency);
        }
        return sum; // No rate — drop this leg rather than silently mis-summing.
      }, 0);
      return formatCurrencyForStore(total);
    }

    // Dual-currency view: render one line per accepted currency.
    // Falls back to the preferred currency alone when a USD-only or LBP-only
    // store has no second leg to display.
    const lines = raw.acceptedCurrencies
      .map(code => currencyService.format(balanceByCurrency[code] ?? 0, code));
    return lines.length > 0
      ? lines.join('\n')
      : currencyService.format(0, storePreferredCurrency);
  }, [cashDrawerStatus, showCombinedBalance, storePreferredCurrency, raw.acceptedCurrencies, isInitialLoad, isLoadingCashDrawer, formatCurrencyForStore, t]);

  const getCashDrawerDisplayChange = useCallback(() => {
    if (isInitialLoad && isLoadingCashDrawer) {
      return t('common.loading');
    }

    if (!cashDrawerStatus) {
      return t('home.notOpenedToday');
    }

    return `${t('common.opened')}: ${formatTime(cashDrawerStatus.openedAt)}`;
  }, [cashDrawerStatus, isInitialLoad, isLoadingCashDrawer, t]);

  const stats = [
    {
      title: t('home.cashInDrawer', { currency: t(`common.currency.${storePreferredCurrency}`) }),
      value: getCashDrawerDisplayValue(),
      icon: DollarSign,
      color: 'bg-green-500',
      change: getCashDrawerDisplayChange(),
      isCashDrawer: true,
      showCombinedBalance,
      // The combined-vs-split toggle only has meaning when the store accepts
      // more than one currency. For single-currency stores both views render
      // the same thing, so we hide the button by leaving `onToggleCombined`
      // undefined (StatCard already gates the button on its presence).
      onToggleCombined: raw.isMultiCurrency
        ? () => setShowCombinedBalance(!showCombinedBalance)
        : undefined,
    },
    
    {
      title: t('home.sessionExpenses', { currency: t(`common.currency.${storePreferredCurrency}`) }),
      value: formatCurrencyForStore(sessionExpenses.reduce((sum, expense) => sum + convertExpenseAmount(expense), 0)),
      icon: Receipt,
      color: 'bg-red-500',
      change: `${sessionExpenses.length} ${t('common.transactions')}`,
      onClick: () => setShowExpensesModal(true)
    },
    {
      title: t('home.sessionIncome', { currency: t(`common.currency.${storePreferredCurrency}`) }),
      value: formatCurrencyForStore(sessionIncome.reduce((sum, income) => sum + convertIncomeAmount(income), 0)),
      icon: Receipt,
      color: 'bg-green-500',
      change: `${sessionIncome.length} ${t('common.transactions')}`,
      onClick: () => setShowIncomeModal(true)
    },
    ...(lowStockAlertsEnabled ? [{
      title: t('home.lowStockItems'),
      value: lowStockItems.length.toString(),
      icon: AlertTriangle,
      color: 'bg-amber-500',
      change: t('home.needAttention')
    }] : [])
  ];

  return (
    <div className="p-6 stagger">
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-gray-900">{t('home.welcome', { name: userProfile?.name || '' })} 🔥</h1>
        <p className="text-gray-600 mt-2">
          {t('home.subtitle')}
        </p>
      </div>

      {/* Fast Actions Section */}
      <div className="mb-8">
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center">
            <Zap className="w-6 h-6 text-yellow-500 mr-2" />
            <h2 className="text-2xl font-bold text-gray-900">{t('home.fastActions')}</h2>
          </div>
          <button
            onClick={() => setShowFastActions(!showFastActions)}
            className="flex items-center px-3 py-2 text-gray-600 hover:text-gray-900 hover:bg-gray-100 rounded-lg transition-colors"
            title={showFastActions ? t('home.hide') : t('home.show')}
          >
            {showFastActions ? (
              <>
                <EyeOff className="w-4 h-4 mr-2" />
                <span className="text-sm font-medium">{t('home.hide')}</span>
                <ChevronUp className="w-4 h-4 ml-1" />
              </>
            ) : (
              <>
                <Eye className="w-4 h-4 mr-2" />
                <span className="text-sm font-medium">{t('home.show')}</span>
                <ChevronDown className="w-4 h-4 ml-1" />
              </>
            )}
          </button>
        </div>

        <div className={`transition-all duration-300 ease-in-out ${showFastActions ? "max-h-[999px] opacity-100" : "max-h-0 opacity-0 overflow-hidden"}`}>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {fastActions.map((action) => (
              <FastActionCard key={action.id} action={action} />
            ))}
          </div>
        </div>
      </div>

      {/* Stats Grid */}
      <div className={`grid grid-cols-1 md:grid-cols-2 ${lowStockAlertsEnabled ? 'lg:grid-cols-4' : 'lg:grid-cols-3'} gap-6 mb-8`}>
        {stats.map((stat, index) => (
          <StatCard
            key={index}
            stat={stat}
            index={index}
            cashDrawerStatus={cashDrawerStatus || undefined}
            handleOpenDrawer={handleOpenDrawer}
          />
        ))}
      </div>

      {/* Cash Drawer Monitor */}
      <div className="mb-8">
        <CashDrawerMonitor />
      </div>

      <div className={`grid grid-cols-1 ${lowStockAlertsEnabled ? 'lg:grid-cols-2' : ''} gap-6`}>
        {lowStockAlertsEnabled && (
          <div className="bg-white rounded-lg shadow-sm p-6">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-semibold text-gray-900">{t('home.lowStockAlert')}</h2>
              <AlertTriangle className="w-5 h-5 text-amber-500" />
            </div>
            {lowStockItems.length > 0 ? (
              <div className="space-y-3">
                {lowStockItems.slice(0, 5).map(item => (
                  <LowStockItem
                    key={item.productId}
                    productId={item.productId}
                    productName={item.productName}
                    currentStock={item.currentStock}
                    unit={item.unit}
                    lowStockLabel={t("inventory.lowStock")}
                    remainingLabel={t("inventory.remaining")}
                  />
                ))}
              </div>
            ) : (
              <p className="text-gray-500 text-center py-4">{t('home.allWellStocked')}</p>
            )}
          </div>
        )}

      </div>

      {/* Transaction List Modals */}
      <TransactionListModal
        isOpen={showExpensesModal}
        onClose={() => setShowExpensesModal(false)}
        transactions={sessionExpenses as any}
        title={t('home.sessionExpenses', { currency: t(`common.currency.${storePreferredCurrency}`) })}
        formatCurrency={formatCurrencyForStore}
        convertAmount={convertExpenseAmount}
        storePreferredCurrency={storePreferredCurrency}
      />

      <TransactionListModal
        isOpen={showIncomeModal}
        onClose={() => setShowIncomeModal(false)}
        transactions={sessionIncome as any}
        title={t('home.sessionIncome', { currency: t(`common.currency.${storePreferredCurrency}`) })}
        formatCurrency={formatCurrencyForStore}
        convertAmount={convertIncomeAmount}
        storePreferredCurrency={storePreferredCurrency}
      />

      {/* Cash Drawer Opening Modal */}
      <CashDrawerOpeningModal
        isOpen={showOpeningModal}
        onClose={() => setShowOpeningModal(false)}
        onConfirm={handleConfirmOpening}
        suggestedAmount={recommendedAmount}
        title={t('pos.openCashDrawer')}
        description={t('pos.enterOpeningCashAmount')}
      />

      {/* Record Expense Modal */}
      <RecordExpenseModal
        isOpen={showRecordExpenseModal}
        onClose={() => setShowRecordExpenseModal(false)}
        onSuccess={() => {
          // No refresh needed: RecordExpenseModal already reloads context data
          // after the expense posts, which updates today's expenses shown here.
        }}
      />

    </div>
  );

}