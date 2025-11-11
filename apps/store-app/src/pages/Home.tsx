import { useEffect, useMemo, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useState } from 'react';
import { useOfflineData } from '../contexts/OfflineDataContext';
import { useSupabaseAuth } from '../contexts/SupabaseAuthContext';
import { useI18n } from '../i18n';
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
  currentBalance: number;
  lastUpdated: string;
  transactionCount: number;
  openedAt:string
}

export default function Home() {
  const navigate = useNavigate();
  const [cashDrawerStatus, setCashDrawerStatus] = useState<CashDrawerStatus | null>(null);
  const [isLoadingCashDrawer, setIsLoadingCashDrawer] = useState(false);
  const [isInitialLoad, setIsInitialLoad] = useState(true);
  const [lastCashDrawerValue, setLastCashDrawerValue] = useState<number | null>(null);
  const [showOpeningModal, setShowOpeningModal] = useState(false);

  const raw = useOfflineData();
  const products = Array.isArray(raw.products) ? raw.products.map(p => ({...p, isActive: true, createdAt: p.created_at})) : [];
  const customers = Array.isArray(raw.customers) ? raw.customers.map(c => ({...c, isActive: c.is_active, createdAt: c.created_at, lb_balance: c.lb_balance, usd_balance: c.usd_balance})) : [];
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

  // Helper function to calculate cash drawer balance from local transactions
  const calculateLocalCashDrawerBalance = useCallback((currentSession: any): number => {
    if (!currentSession) {
      return 0;
    }
    let totalBalance = currentSession.opening_amount || currentSession.currentBalance || 0;
    return totalBalance;
  }, []);

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
    if (!raw.storeId) return;
    
    // Only show loading spinner on initial load or when explicitly requested
    if (showLoading || isInitialLoad) {
      setIsLoadingCashDrawer(true);
    }
    
    try {
      // Use ONLY local data - completely offline-capable
      const currentSession = getLocalCurrentSession();
      
      // If there's no active session, set status to null
      if (!currentSession) {
        setCashDrawerStatus(null);
        setLastCashDrawerValue(null);
        setIsInitialLoad(false);
        return;
      }
      
      const localBalance = calculateLocalCashDrawerBalance(currentSession);
      const localHistory = getLocalCashDrawerHistory();
      
      // Smooth transition: only update if value actually changed
      if (lastCashDrawerValue !== localBalance) {
        setCashDrawerStatus({
          currentBalance: localBalance,
          lastUpdated: new Date().toISOString(),
          transactionCount: localHistory.length,
          openedAt: currentSession?.opened_at || currentSession?.lastUpdated || ''
        });
        setLastCashDrawerValue(localBalance);
      }
      
      setIsInitialLoad(false);
    } catch (error) {
      console.error('Error loading cash drawer status:', error);
    } finally {
      setIsLoadingCashDrawer(false);
    }
  }, [raw.storeId, raw.currency, getLocalCurrentSession, calculateLocalCashDrawerBalance, getLocalCashDrawerHistory, lastCashDrawerValue, isInitialLoad]);

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

  // Helper function to normalize cash drawer balance to store's preferred currency
  // Database stores all balances in LBP, so we need to convert to USD if that's the preferred currency
  const getNormalizedCashDrawerBalance = useCallback((balance: number): number => {
    if (storePreferredCurrency === 'USD') {
      // Convert LBP to USD by dividing by exchange rate
      return balance / exchangeRate;
    }
    // LBP: return as-is
    return balance;
  }, [storePreferredCurrency, exchangeRate]);

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

    // Real-time updates from other devices - use debounced version
    const handleRealTimeUpdate = (e: any) => {
      if (!raw.storeId || (e?.detail?.storeId && e.detail.storeId !== raw.storeId)) return;
      console.log('💰 Real-time cash drawer update received on Home page:', e.detail);
      debouncedLoadCashDrawerStatus();
    };
    
    // Handle undo completion events - use debounced version
    const handleUndoCompleted = (e: any) => {
      if (!raw.storeId || (e?.detail?.storeId && e.detail.storeId !== raw.storeId)) return;
      debouncedLoadCashDrawerStatus();
    };
    
    window.addEventListener('cash-drawer-updated', handleCashDrawerUpdated as any);
    window.addEventListener('cash-drawer-realtime-update', handleRealTimeUpdate as any);
    window.addEventListener('undo-completed', handleUndoCompleted as any);

    // Refresh every 60 seconds as a fallback (reduced frequency)
    const interval = setInterval(() => loadCashDrawerStatus(), 60000);
    return () => {
      clearInterval(interval);
      window.removeEventListener('cash-drawer-updated', handleCashDrawerUpdated as any);
      window.removeEventListener('cash-drawer-realtime-update', handleRealTimeUpdate as any);
      window.removeEventListener('undo-completed', handleUndoCompleted as any);
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
    // {
    //   id: 'quick-sale',
    //   title: t('home.quickSale'),
    //   description: t('home.quickSaleDesc'),
    //   icon: ShoppingCart,
    //   color: 'bg-green-500',
    //   hoverColor: 'hover:bg-green-600',
    //   action: () => {navigate('/pos');},
    //   stats: `${todaySales.length} ${t('home.today')}`
    // },
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
      action: () => {navigate('/customers')},
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
    
    // Show last known value during updates to prevent flashing
    if (isLoadingCashDrawer && lastCashDrawerValue !== null) {
      return formatCurrencyForStore(getNormalizedCashDrawerBalance(lastCashDrawerValue));
    }
    
    return formatCurrencyForStore(getNormalizedCashDrawerBalance(cashDrawerStatus.currentBalance));
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
      isLoading: isLoadingCashDrawer && !isInitialLoad // Show subtle loading indicator
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