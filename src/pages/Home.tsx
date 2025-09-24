import { useEffect } from 'react';
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

interface CashDrawerStatus {
  currentBalance: number;
  lastUpdated: string;
  transactionCount: number;
  openedAt:string
}

export default function Home() {
  const navigate = useNavigate();
  const [cashDrawerStatus, setCashDrawerStatus] = useState<CashDrawerStatus | null>(null);
  const [storePreferredCurrency, setStorePreferredCurrency] = useState<'USD' | 'LBP'>('USD');
  const [isLoadingCashDrawer, setIsLoadingCashDrawer] = useState(false);

  const raw = useOfflineData();
  const products = Array.isArray(raw.products) ? raw.products.map(p => ({...p, isActive: true, createdAt: p.created_at})) : [];
  const customers = Array.isArray(raw.customers) ? raw.customers.map(c => ({...c, isActive: c.is_active, createdAt: c.created_at, lb_balance: c.lb_balance, usd_balance: c.usd_balance})) : [];
  const sales = Array.isArray(raw.sales) ? raw.sales.map(s => ({...s, createdAt: s.createdAt})) : [];
  const stockLevels = Array.isArray(raw.stockLevels) ? raw.stockLevels : [];
  const cashDrawer = raw.cashDrawer;
  const openCashDrawer = raw.openCashDrawer;
  const transactions = Array.isArray(raw.transactions) ? raw.transactions.map(t => ({...t, createdAt: t.created_at})) : [];
  const lowStockAlertsEnabled = raw.lowStockAlertsEnabled;
  const lowStockThreshold = raw.lowStockThreshold;
  const { userProfile } = useSupabaseAuth();
  const [showFastActions, setShowFastActions] = useState(true);
  const { t } = useI18n();
  const inventory = Array.isArray(raw.inventory) ? raw.inventory : [];
  const recentReceivesCount = inventory
    .sort((a, b) => new Date(b.received_at || b.receivedAt).getTime() - new Date(a.received_at || a.receivedAt).getTime())
    .slice(0, 10).length;

  const today = new Date().toISOString().split('T')[0];
  const todaySales = sales.filter(sale => 
    sale.createdAt && sale.createdAt.split('T')[0] 
  );
  const todayExpenses = transactions.filter(t => 
    t.type === 'expense' && t.createdAt && t.createdAt.split('T')[0] === today
  )

  // Helper function to get local cash drawer session from context
  const getLocalCurrentSession = () => {
    return cashDrawer; // Already available in context
  };

  // Helper function to calculate cash drawer balance from local transactions
  const calculateLocalCashDrawerBalance = (currentSession: any): number => {
    if (!currentSession) {
      return 0;
    }
    let totalBalance = currentSession.opening_amount || currentSession.currentBalance || 0;
    return totalBalance;
  };

  // Helper function to get cash drawer transaction history from local data
  const getLocalCashDrawerHistory = (limit: number = 50): any[] => {
    const cashDrawerTransactions = transactions
      .filter(trans =>
        trans.store_id === raw.storeId &&
        trans.category?.startsWith('cash_drawer_')
      )
      .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
      .slice(0, limit);
    return cashDrawerTransactions;
  };

  const loadCashDrawerStatus = async () => {
    if (!raw.storeId) return;
    setIsLoadingCashDrawer(true);
    try {
      // Use ONLY local data - completely offline-capable
      const currentSession = getLocalCurrentSession();
      const localBalance = calculateLocalCashDrawerBalance(currentSession);
      const localHistory = getLocalCashDrawerHistory();
      // Use local currency from context (stored in localStorage)
      const localCurrency = raw.currency || 'USD';
      setStorePreferredCurrency(localCurrency);
      setCashDrawerStatus({
        currentBalance: localBalance,
        lastUpdated: new Date().toISOString(),
        transactionCount: localHistory.length,
        openedAt: currentSession?.opened_at || currentSession?.lastUpdated || ''
      });
    } catch (error) {
      console.error('Error loading cash drawer status:', error);
    } finally {
      setIsLoadingCashDrawer(false);
    }
  };

  // Helper function to normalize cash drawer balance to store's preferred currency
  const getNormalizedCashDrawerBalance = (balance: number): number => {
    // For now, return balance as-is since we're using local currency
    // In the future, we can implement proper currency conversion if needed
    return balance;
  };

  // Helper function to format currency based on store's preferred currency
  const formatCurrencyForStore = (amount: number): string => {
    if (storePreferredCurrency === 'LBP') {
      return `${amount.toLocaleString()} ل.ل`;
    }
    return `$${amount.toLocaleString()}`;
  };

  useEffect(() => {
    loadCashDrawerStatus();

    // Live update on cash drawer changes
    const handleCashDrawerUpdated = (e: any) => {
      // Optional: check store match
      if (!raw.storeId || (e?.detail?.storeId && e.detail.storeId !== raw.storeId)) return;
      loadCashDrawerStatus();
    };
    
    // Handle undo completion events
    const handleUndoCompleted = (e: any) => {
      if (!raw.storeId || (e?.detail?.storeId && e.detail.storeId !== raw.storeId)) return;
      // Small delay to ensure database updates are complete
      setTimeout(() => {
        loadCashDrawerStatus();
      }, 100);
    };
    
    window.addEventListener('cash-drawer-updated', handleCashDrawerUpdated as any);
    window.addEventListener('undo-completed', handleUndoCompleted as any);

    // Refresh every 30 seconds as a fallback
    const interval = setInterval(loadCashDrawerStatus, 30000);
    return () => {
      clearInterval(interval);
      window.removeEventListener('cash-drawer-updated', handleCashDrawerUpdated as any);
      window.removeEventListener('undo-completed', handleUndoCompleted as any);
    };
  }, [raw.storeId]);

  // Re-fetch after initial sync completes, to avoid showing 0 before cloud data arrives
  useEffect(() => {
    if (!raw.storeId &&!raw.transactions) return;
    if (!raw.loading?.sync) {
      loadCashDrawerStatus();
      
    }
  }, [raw.storeId,raw.transactions, raw.loading?.sync]);

  // Re-fetch when transactions change (e.g., after sync brings cash_drawer_* records)
  useEffect(() => {
    if (!raw.storeId) return;
    loadCashDrawerStatus();
  }, [raw.storeId, transactions.length]);

  // Additional effect to refresh cash drawer when transactions array changes (including undo operations)
  useEffect(() => {
    if (!raw.storeId) return;
    // Debounce the refresh to avoid excessive calls
    const timeoutId = setTimeout(() => {
      loadCashDrawerStatus();
    }, 200);
    
    return () => clearTimeout(timeoutId);
  }, [raw.storeId, transactions]);

  const lowStockItems = lowStockAlertsEnabled 
    ? stockLevels.filter(item => item.currentStock < lowStockThreshold)
    : [];

  const handleOpenDrawer = async () => {
    const openingAmount = prompt('Enter opening cash amount:');
    if (openingAmount && userProfile) {
      try {
        await openCashDrawer(parseFloat(openingAmount), userProfile.id);        
        // Wait a moment for the database to be updated
        await new Promise(resolve => setTimeout(resolve, 100));
        // Immediately refresh local status
        await loadCashDrawerStatus();        
        // Notify any listeners
        if (typeof window !== 'undefined') {
          window.dispatchEvent(new CustomEvent('cash-drawer-updated', { 
            detail: { storeId: raw.storeId, event: 'opened' }
          }));
        }
      } catch (e: any) {
        console.error('Failed to open cash drawer:', e);
      }
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
      stats: `${todaySales.length} today`
    },
    {
      id: 'receive-products',
      title: t('home.receiveProducts'),
      description: t('home.receiveProductsDesc'),
      icon: Truck,
      color: 'bg-blue-500',
      hoverColor: 'hover:bg-blue-600',
      action: () => {navigate('/inventory')},
      stats: `${recentReceivesCount} recent receives`
    },
    {
      id: 'add-customer',
      title: t('home.addCustomer'),
      description: t('home.addCustomerDesc'),
      icon: UserPlus,
      color: 'bg-purple-500',
      hoverColor: 'hover:bg-purple-600',
      action: () => {navigate('/customers')},
      stats: `${customers.filter(c => c.isActive).length} active`
    },
    {
      id: 'record-expense',
      title: t('home.recordExpense'),
      description: t('home.recordExpenseDesc'),
      icon: Receipt,
      color: 'bg-amber-500',
      hoverColor: 'hover:bg-amber-600',
      action: () => {navigate('/accounting')},
      stats: `${formatCurrencyForStore(todayExpenses)} today (${storePreferredCurrency})`
    },
    {
      id: 'today-sales',
      title: t('home.todaySales'),
      description: t('home.todaySalesDesc'),
      icon: Eye,
      color: 'bg-indigo-500',
      hoverColor: 'hover:bg-indigo-600',
      action: () => {navigate('/reports')},
      stats: `${todaySales.length} sales`
    },
    {
      id: 'check-stock',
      title: t('home.checkStock'),
      description: t('home.checkStockDesc'),
      icon: Package,
      color: 'bg-teal-500',
      hoverColor: 'hover:bg-teal-600',
      action: () => {navigate('/inventory')},
      stats: lowStockAlertsEnabled ? `${lowStockItems.length} low stock` : `${products.length} products`
    }
  ];

  const stats = [
    {
      title: `Cash in Drawer (${storePreferredCurrency})`,
      value: isLoadingCashDrawer ? 'Loading...' : (cashDrawerStatus ? formatCurrencyForStore(getNormalizedCashDrawerBalance(cashDrawerStatus.currentBalance)) : 'Closed'),
      icon: DollarSign,
      color: 'bg-green-500',
      change: isLoadingCashDrawer ? 'Loading...' : (cashDrawerStatus ? `Opened: ${new Date(cashDrawerStatus.openedAt).toLocaleTimeString()}` : 'Not opened today')
    },
    {
      title: `Today's Expense (${storePreferredCurrency})`, 
      value: formatCurrencyForStore(todayExpenses),
      icon: Receipt,
      color: 'bg-red-500',
      change: `${transactions.filter(t => t.type === 'expense' && t.createdAt && t.createdAt.split('T')[0] === today).length} transactions`
    },
    {
      title: 'Low Stock Items',
      value: lowStockAlertsEnabled ? lowStockItems.length.toString() : lowStockItems.length.toString(),
      icon: AlertTriangle,
      color: lowStockAlertsEnabled ? 'bg-amber-500' : 'bg-gray-400', 
      change: lowStockAlertsEnabled ? 'Need attention' : 'Alerts disabled'
    }
  ];

  return (
    <div className="p-6">
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-gray-900">{t('home.welcome', { name: userProfile?.name || '' })}</h1>
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
            cashDrawerStatus={cashDrawerStatus}
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
    </div>
  );
  
}