import { useEffect, useMemo, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useState } from 'react';
import { useOfflineData } from '../contexts/OfflineDataContext';
import { useSupabaseAuth } from '../contexts/SupabaseAuthContext';
import { useI18n } from '../i18n';
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
  const [isLoadingCashDrawer, setIsLoadingCashDrawer] = useState(false);
  const [isInitialLoad, setIsInitialLoad] = useState(true);
  const [lastCashDrawerValue, setLastCashDrawerValue] = useState<number | null>(null);
  const [lastCashDrawerBalances, setLastCashDrawerBalances] = useState<{ USD: number; LBP: number } | null>(null);
  const [showOpeningModal, setShowOpeningModal] = useState(false);
  const [showCombinedBalance, setShowCombinedBalance] = useState(false);

  const raw = useOfflineData();
  const products = Array.isArray(raw.products) ? raw.products.map(p => ({...p, isActive: true, createdAt: p.created_at})) : [];
  
  // Get customer entities and calculate balances from journal entries
  const customerEntities = Array.isArray(raw.customers) ? raw.customers : [];
  const customerIds = useMemo(() => customerEntities.map(c => c.id), [customerEntities]);
  const customerBalances = useEntityBalances(customerIds, 'customer', true);
  
  const customers = customerEntities.map(c => {
    const balances = customerBalances.getBalances(c.id) || { USD: 0, LBP: 0 };
    return {
      ...c, 
      isActive: c.is_active, 
      createdAt: c.created_at, 
      lb_balance: balances.LBP,  // From journal entries
      usd_balance: balances.USD  // From journal entries
    };
  });
  const sales = Array.isArray(raw.sales) ? raw.sales.map(s => ({...s, createdAt: s.created_at})) : [];
  const stockLevels = Array.isArray(raw.stockLevels) ? raw.stockLevels : [];
  const cashDrawer = raw.cashDrawer;
  const openCashDrawer = raw.openCashDrawer;
  const transactions = Array.isArray(raw.transactions) ? raw.transactions.map(t => ({...t, createdAt: t.created_at})) : [];
  const lowStockAlertsEnabled = raw.lowStockAlertsEnabled;
  const lowStockThreshold = raw.lowStockThreshold;
  const exchangeRate = raw.exchangeRate || 89500; // Get exchange rate from context
  const storePreferredCurrency = raw.currency || 'LBP'; // SINGLE SOURCE OF TRUTH from context
  const { userProfile } = useSupabaseAuth();
  const [showFastActions, setShowFastActions] = useState(true);
  const { t } = useI18n();
  const inventory = Array.isArray(raw.inventory) ? raw.inventory : [];
  const recentReceivesCount = useMemo(() => 
    inventory
      .sort((a, b) => new Date(b.received_at || b.receivedAt).getTime() - new Date(a.received_at || a.receivedAt).getTime())
      .slice(0, 10).length,
    [inventory]
  );

  // Memoize expensive calculations
  const today = useMemo(() => new Date().toISOString().split('T')[0], []);
  
  const todaySales = useMemo(() => 
    sales.filter(sale => 
      sale.createdAt && sale.createdAt.split('T')[0] === today
    ), [sales, today]
  );
  
  const todayExpenses = useMemo(() => 
    transactions.filter(t => 
      t.type === 'expense' && t.createdAt && t.createdAt.split('T')[0] === today
    ), [transactions, today]
  );

  // Helper function to convert expense amounts to preferred currency
  const convertExpenseAmount = useCallback((expense: any): number => {
    // Expenses are stored in LBP in the database
    const amount = expense.amount || 0;
    if (storePreferredCurrency === 'USD') {
      return amount / exchangeRate;
    }
    return amount;
  }, [storePreferredCurrency, exchangeRate]);

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
        setCashDrawerStatus(null);
        setLastCashDrawerValue(null);
        setIsInitialLoad(false);
        return;
      }
      
      // Get balances for both currencies computed from journal entries (account_code = '1100')
      const balances = await cashDrawerUpdateService.getCurrentCashDrawerBalances(
        raw.storeId,
        raw.currentBranchId
      );
      
      // Calculate current balance in store's preferred currency for backward compatibility
      const currentBalance = storePreferredCurrency === 'USD' 
        ? balances.USD + (balances.LBP / exchangeRate)
        : balances.LBP + (balances.USD * exchangeRate);
      
      const localHistory = getLocalCashDrawerHistory();
      
      // Smooth transition: only update if balances actually changed
      const balancesChanged = !lastCashDrawerBalances || 
        lastCashDrawerBalances.USD !== balances.USD || 
        lastCashDrawerBalances.LBP !== balances.LBP;
      
      if (balancesChanged || lastCashDrawerValue !== currentBalance) {
        setCashDrawerStatus({
          currentBalance, // Keep for backward compatibility
          usdBalance: balances.USD,
          lbpBalance: balances.LBP,
          lastUpdated: new Date().toISOString(),
          transactionCount: localHistory.length,
          openedAt: currentSession?.opened_at || currentSession?.lastUpdated || ''
        });
        setLastCashDrawerValue(currentBalance);
        setLastCashDrawerBalances(balances);
      }
      
      setIsInitialLoad(false);
    } catch (error) {
      console.error('Error loading cash drawer status:', error);
    } finally {
      setIsLoadingCashDrawer(false);
    }
  }, [raw.storeId, raw.currentBranchId, getLocalCurrentSession, getLocalCashDrawerHistory, lastCashDrawerValue, lastCashDrawerBalances, storePreferredCurrency, exchangeRate, isInitialLoad]);

  // Debounced update function to prevent excessive reloading
  const debouncedLoadCashDrawerStatus = useCallback(() => {
    // Clear any existing timeout
    if ((window as any).cashDrawerTimeout) {
      clearTimeout((window as any).cashDrawerTimeout);
    }
    
    // Set new timeout
    (window as any).cashDrawerTimeout = setTimeout(() => {
      loadCashDrawerStatus();
    }, 300); // 300ms debounce
  }, [loadCashDrawerStatus]);

  // Helper function to format currency based on store's preferred currency
  const formatCurrencyForStore = useCallback((amount: number): string => {
    if (storePreferredCurrency === 'LBP') {
      return `${Math.round(amount).toLocaleString()} ل.ل`;
    }
    // For USD, show 2 decimal places
    return `$${amount.toFixed(2)}`;
  }, [storePreferredCurrency]);

  useEffect(() => {
    // Initial load with loading spinner
    loadCashDrawerStatus(true);

    // Live update on cash drawer changes (local changes) - use debounced version
    const handleCashDrawerUpdated = (e: any) => {
      if (!raw.storeId || (e?.detail?.storeId && e.detail.storeId !== raw.storeId)) return;
      debouncedLoadCashDrawerStatus();
    };
    
    // Handle undo completion events - use debounced version
    const handleUndoCompleted = (e: any) => {
      if (!raw.storeId || (e?.detail?.storeId && e.detail.storeId !== raw.storeId)) return;
      debouncedLoadCashDrawerStatus();
    };
    
    // Handle data synced events (from event stream) - refresh cash drawer when remote changes arrive
    const handleDataSynced = () => {
      console.log('🔄 [Home] Data synced event received, refreshing cash drawer status...');
      debouncedLoadCashDrawerStatus();
    };
    
    window.addEventListener('cash-drawer-updated', handleCashDrawerUpdated as any);
    window.addEventListener('undo-completed', handleUndoCompleted as any);
    window.addEventListener('data-synced', handleDataSynced as any);

    // Refresh every 60 seconds as a fallback (reduced frequency)
    const interval = setInterval(() => loadCashDrawerStatus(), 60000);
    return () => {
      clearInterval(interval);
      window.removeEventListener('cash-drawer-updated', handleCashDrawerUpdated as any);
      window.removeEventListener('undo-completed', handleUndoCompleted as any);
      window.removeEventListener('data-synced', handleDataSynced as any);
    };
  }, [raw.storeId, loadCashDrawerStatus, debouncedLoadCashDrawerStatus]);

  // Re-fetch after initial sync completes, to avoid showing 0 before cloud data arrives
  useEffect(() => {
    if (!raw.storeId || !raw.transactions) return;
    if (!raw.loading?.sync) {
      // Use debounced version to prevent flashing
      debouncedLoadCashDrawerStatus();
    }
  }, [raw.storeId, raw.transactions, raw.loading?.sync, debouncedLoadCashDrawerStatus]);

  // Re-fetch when transactions change (e.g., after sync brings cash_drawer_* records)
  // Use debounced version to prevent excessive updates
  useEffect(() => {
    if (!raw.storeId) return;
    debouncedLoadCashDrawerStatus();
  }, [raw.storeId, transactions.length, debouncedLoadCashDrawerStatus]);

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
          console.error('Error fetching recommended amount:', error);
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
    
    // Convert the entered amount to LBP for storage
    // User enters in preferred currency, we store in LBP
    let amountInLBP = openingAmount;
    if (storePreferredCurrency === 'USD') {
      amountInLBP = openingAmount * exchangeRate;
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
      action: () => {navigate('/pos');},
      stats: `${todaySales.length} ${t('home.today')}`
    },
    {
      id: 'receive-products',
      title: t('home.receiveProducts'),
      description: t('home.receiveProductsDesc'),
      icon: Truck,
      color: 'bg-blue-500',
      hoverColor: 'hover:bg-blue-600',
      action: () => {navigate('/inventory')},
      stats: `${recentReceivesCount} ${t('common.recentReceives')}`
    },
    {
      id: 'add-customer',
      title: t('home.addCustomer'),
      description: t('home.addCustomerDesc'),
      icon: UserPlus,
      color: 'bg-purple-500',
      hoverColor: 'hover:bg-purple-600',
      action: () => {navigate('/accounts')},
      stats: `${customers.filter(c => c.isActive).length} ${t('common.active')}`
    },
    {
      id: 'record-expense',
      title: t('home.recordExpense'),
      description: t('home.recordExpenseDesc'),
      icon: Receipt,
      color: 'bg-amber-500',
      hoverColor: 'hover:bg-amber-600',
      action: () => {navigate('/accounting')},
      stats: `${formatCurrencyForStore(todayExpenses.reduce((sum, expense) => sum + convertExpenseAmount(expense), 0))} ${t('home.today')} (${t(`common.currency.${storePreferredCurrency}`)})`
    },
    {
      id: 'today-sales',
      title: t('home.todaySales'),
      description: t('home.todaySalesDesc'),
      icon: Eye,
      color: 'bg-indigo-500',
      hoverColor: 'hover:bg-indigo-600',
      action: () => {navigate('/reports')},
      stats: `${todaySales.length} ${t('home.sales')}`
    },
    {
      id: 'check-stock',
      title: t('home.checkStock'),
      description: t('home.checkStockDesc'),
      icon: Package,
      color: 'bg-teal-500',
      hoverColor: 'hover:bg-teal-600',
      action: () => {navigate('/inventory')},
      stats: lowStockAlertsEnabled ? `${lowStockItems.length} ${t('home.lowStock')}` : `${products.length} ${t('home.products')}`
    }
  ];

  // Smooth cash drawer value display
  const getCashDrawerDisplayValue = () => {
    if (isInitialLoad && isLoadingCashDrawer) {
      return t('common.loading');
    }
    
    if (!cashDrawerStatus) {
      return t('common.closed');
    }
    
    // Show last known balances during updates to prevent flashing
    const usdBalance = isLoadingCashDrawer && lastCashDrawerBalances 
      ? lastCashDrawerBalances.USD 
      : cashDrawerStatus.usdBalance;
    const lbpBalance = isLoadingCashDrawer && lastCashDrawerBalances 
      ? lastCashDrawerBalances.LBP 
      : cashDrawerStatus.lbpBalance;
    
    // If showing combined balance, convert both to preferred currency and sum
    if (showCombinedBalance) {
      let combinedAmount: number;
      if (storePreferredCurrency === 'USD') {
        // Convert LBP to USD and add to USD balance
        combinedAmount = usdBalance + (lbpBalance / exchangeRate);
      } else {
        // Convert USD to LBP and add to LBP balance
        combinedAmount = lbpBalance + (usdBalance * exchangeRate);
      }
      return formatCurrencyForStore(combinedAmount);
    }
    
    // Dual currency view: show both currencies
    const usdFormatted = `$${usdBalance.toFixed(2)}`;
    const lbpFormatted = `${Math.round(lbpBalance).toLocaleString()} ل.ل`;
    return `${usdFormatted}\n${lbpFormatted}`;
  };

  const getCashDrawerDisplayChange = () => {
    if (isInitialLoad && isLoadingCashDrawer) {
      return t('common.loading');
    }
    
    if (!cashDrawerStatus) {
      return t('home.notOpenedToday');
    }
    
    return `${t('common.opened')}: ${new Date(cashDrawerStatus.openedAt).toLocaleTimeString()}`;
  };

  const stats = [
    {
      title: t('home.cashInDrawer', { currency: t(`common.currency.${storePreferredCurrency}`) }),
      value: getCashDrawerDisplayValue(),
      icon: DollarSign,
      color: 'bg-green-500',
      change: getCashDrawerDisplayChange(),
      isLoading: isLoadingCashDrawer && !isInitialLoad, // Show subtle loading indicator
      isCashDrawer: true,
      showCombinedBalance,
      onToggleCombined: () => setShowCombinedBalance(!showCombinedBalance),
    },
    {
      title: t('home.todaysExpenses', { currency: t(`common.currency.${storePreferredCurrency}`) }), 
      value: formatCurrencyForStore(todayExpenses.reduce((sum, expense) => sum + convertExpenseAmount(expense), 0)),
      icon: Receipt,
      color: 'bg-red-500',
      change: `${transactions.filter(t => t.type === 'expense' && t.createdAt && t.createdAt.split('T')[0] === today).length} ${t('common.transactions')}`
    },
    {
      title: t('home.lowStockItems'),
      value: lowStockAlertsEnabled ? lowStockItems.length.toString() : lowStockItems.length.toString(),
      icon: AlertTriangle,
      color: lowStockAlertsEnabled ? 'bg-amber-500' : 'bg-gray-400', 
      change: lowStockAlertsEnabled ? t('home.needAttention') : t('home.alertsDisabled')
    }
  ];

  return (
    <div className="p-6">
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
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
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

      {/* Cash Drawer Opening Modal */}
      <CashDrawerOpeningModal
        isOpen={showOpeningModal}
        onClose={() => setShowOpeningModal(false)}
        onConfirm={handleConfirmOpening}
        suggestedAmount={recommendedAmount}
        title={t('pos.openCashDrawer')}
        description={t('pos.enterOpeningCashAmount')}
      />

    </div>
  );
  
}