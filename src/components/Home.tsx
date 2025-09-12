import React, { useEffect } from 'react';
import { useState } from 'react';
import { useOfflineData } from '../contexts/OfflineDataContext';
import { useSupabaseAuth } from '../contexts/SupabaseAuthContext';
// Removed cashDrawerUpdateService and db imports - using local data only
import { useCurrency } from '../hooks/useCurrency';
import { useI18n } from '../i18n';
import { 
  DollarSign, 
  Package, 
  Users, 
  TrendingUp, 
  AlertTriangle,
  Clock,
  ShoppingCart,
  Plus,
  Receipt,
  Eye,
  Truck,
  UserPlus,
  Zap,
  ChevronUp,
  ChevronDown,
  EyeOff,
  TrendingDown
} from 'lucide-react';
import CashDrawerMonitor from './CashDrawerMonitor';
interface CashDrawerStatus {
  currentBalance: number;
  lastUpdated: string;
  transactionCount: number;
  openedAt:string
}
const getTransactionIcon = (type: string) => {
  if (type.includes('sale') || type.includes('payment')) {
    return <TrendingUp className="w-4 h-4 text-green-600" />;
  } else if (type.includes('expense') || type.includes('refund')) {
    return <TrendingDown className="w-4 h-4 text-red-600" />;
  }
  return <Clock className="w-4 h-4 text-gray-600" />;
};

const getTransactionColor = (type: string) => {
  if (type.includes('sale') || type.includes('payment')) {
    return 'text-green-600';
  } else if (type.includes('expense') || type.includes('refund')) {
    return 'text-red-600';
  }
  return 'text-gray-600';
};
// Using local currency from context - no caching needed

export default function Home() {
  const [cashDrawerStatus, setCashDrawerStatus] = useState<CashDrawerStatus | null>(null);
  const [transactionHistory, setTransactionHistory] = useState<any[]>([]);
  const [storePreferredCurrency, setStorePreferredCurrency] = useState<'USD' | 'LBP'>('USD');
  const [isLoadingCashDrawer, setIsLoadingCashDrawer] = useState(false);

  const raw = useOfflineData();
  const products = Array.isArray(raw.products) ? raw.products.map(p => ({...p, isActive: true, createdAt: p.created_at})) : [];
  const customers = Array.isArray(raw.customers) ? raw.customers.map(c => ({...c, isActive: c.is_active, createdAt: c.created_at, lb_balance: c.lb_balance, usd_balance: c.usd_balance})) : [];
  // const suppliers = Array.isArray(raw.suppliers) ? raw.suppliers.map(s => ({...s, createdAt: s.created_at})) : [];
  const sales = Array.isArray(raw.sales) ? raw.sales.map(s => ({...s, createdAt: s.createdAt})) : [];
  const stockLevels = Array.isArray(raw.stockLevels) ? raw.stockLevels : [];
  const cashDrawer = raw.cashDrawer;
  const openCashDrawer = raw.openCashDrawer;
  const transactions = Array.isArray(raw.transactions) ? raw.transactions.map(t => ({...t, createdAt: t.created_at})) : [];
  const lowStockAlertsEnabled = raw.lowStockAlertsEnabled;
  const lowStockThreshold = raw.lowStockThreshold;
  const { userProfile } = useSupabaseAuth();
  const { formatCurrency, getConvertedAmount } = useCurrency();
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
  const todayRevenue = todaySales.reduce((sum, sale) => sum + (sale.receivedValue || 0), 0);
  const todayExpenses = transactions.filter(t => 
    t.type === 'expense' && t.createdAt && t.createdAt.split('T')[0] === today
  ).reduce((sum, t) => {
    const convertedAmount = getConvertedAmount(t.amount, t.currency || 'USD');
    return sum + convertedAmount;
  }, 0);

  // Helper function to get local cash drawer session from context
  const getLocalCurrentSession = () => {
    return cashDrawer; // Already available in context
  };

  // Helper function to calculate cash drawer balance from local transactions
  const calculateLocalCashDrawerBalance = (currentSession: any): number => {
    if (!currentSession) {
      console.log('💰 No active session found, balance is 0');
      return 0;
    }

    // Start with the current session's opening amount or current balance
    let totalBalance = currentSession.opening_amount || currentSession.currentBalance || 0;
    console.log(`💰 Starting balance from current session: ${totalBalance}`);

    // Get all cash drawer transactions from local data for this specific session
    const cashTransactions = transactions.filter(trans =>
      trans.store_id === raw.storeId &&
      trans.category?.startsWith('cash_drawer_') &&
      (!currentSession.id || trans.reference?.includes(`_SESSION_${currentSession.id}`) ||
       new Date(trans.created_at) >= new Date(currentSession.opened_at || currentSession.lastUpdated))
    );

    console.log(`💰 Found ${cashTransactions.length} cash drawer transactions since session start`);

    // Add all income transactions and subtract all expense transactions
    // for (const trans of cashTransactions) {
    //   if (trans.type === 'income') {
    //     totalBalance += trans.amount;
    //     console.log(`💰 Added income: ${trans.amount}, new balance: ${totalBalance}`);
    //   } else if (trans.type === 'expense') {
    //     totalBalance -= trans.amount;
    //     console.log(`💰 Subtracted expense: ${trans.amount}, new balance: ${totalBalance}`);
    //   }
    // }

    console.log(`💰 Final calculated balance: ${totalBalance}`);
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

    console.log(`💰 Found ${cashDrawerTransactions.length} local cash drawer transactions`);
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

      console.log('🔍 loadCashDrawerStatus - currentSession:', currentSession);
      console.log('🔍 loadCashDrawerStatus - localBalance:', localBalance);
      console.log('🔍 loadCashDrawerStatus - localHistory count:', localHistory.length);
      console.log('🔍 loadCashDrawerStatus - localCurrency:', localCurrency);

      setCashDrawerStatus({
        currentBalance: localBalance,
        lastUpdated: new Date().toISOString(),
        transactionCount: localHistory.length,
        openedAt: currentSession?.opened_at || currentSession?.lastUpdated || ''
      });

      setTransactionHistory(localHistory);
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

  // Helper function to get currency symbol for store's preferred currency
  const getStoreCurrencySymbol = (): string => {
    return storePreferredCurrency === 'LBP' ? 'ل.ل' : '$';
  };

  useEffect(() => {
    loadCashDrawerStatus();

    // Live update on cash drawer changes
    const handleCashDrawerUpdated = (e: any) => {
      // Optional: check store match
      if (!raw.storeId || (e?.detail?.storeId && e.detail.storeId !== raw.storeId)) return;
      loadCashDrawerStatus();
    };
    window.addEventListener('cash-drawer-updated', handleCashDrawerUpdated as any);

    // Refresh every 30 seconds as a fallback
    const interval = setInterval(loadCashDrawerStatus, 30000);
    return () => {
      clearInterval(interval);
      window.removeEventListener('cash-drawer-updated', handleCashDrawerUpdated as any);
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

  const lowStockItems = lowStockAlertsEnabled 
    ? stockLevels.filter(item => item.currentStock < lowStockThreshold)
    : [];

  const handleOpenDrawer = async () => {
    const openingAmount = prompt('Enter opening cash amount:');
    if (openingAmount && userProfile) {
      try {
        console.log('🔍 Opening cash drawer with amount:', openingAmount);
        await openCashDrawer(parseFloat(openingAmount), userProfile.id);
        console.log('🔍 Cash drawer opened successfully');
        
        // Wait a moment for the database to be updated
        await new Promise(resolve => setTimeout(resolve, 100));
        
        // Immediately refresh local status
        console.log('🔍 Refreshing cash drawer status...');
        await loadCashDrawerStatus();
        console.log('🔍 Cash drawer status refreshed');
        
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
      action: () => window.dispatchEvent(new CustomEvent('navigate', { detail: 'pos' })),
      stats: `${todaySales.length} today`
    },
    {
      id: 'receive-products',
      title: t('home.receiveProducts'),
      description: t('home.receiveProductsDesc'),
      icon: Truck,
      color: 'bg-blue-500',
      hoverColor: 'hover:bg-blue-600',
      action: () => window.dispatchEvent(new CustomEvent('navigate', { detail: 'inventory' })),
      stats: `${recentReceivesCount} recent receives`
    },
    {
      id: 'add-customer',
      title: t('home.addCustomer'),
      description: t('home.addCustomerDesc'),
      icon: UserPlus,
      color: 'bg-purple-500',
      hoverColor: 'hover:bg-purple-600',
      action: () => window.dispatchEvent(new CustomEvent('navigate', { detail: 'customers' })),
      stats: `${customers.filter(c => c.isActive).length} active`
    },
    {
      id: 'record-expense',
      title: t('home.recordExpense'),
      description: t('home.recordExpenseDesc'),
      icon: Receipt,
      color: 'bg-amber-500',
      hoverColor: 'hover:bg-amber-600',
      action: () => window.dispatchEvent(new CustomEvent('navigate', { detail: 'accounting' })),
      stats: `${formatCurrencyForStore(todayExpenses)} today (${storePreferredCurrency})`
    },
    {
      id: 'today-sales',
      title: t('home.todaySales'),
      description: t('home.todaySalesDesc'),
      icon: Eye,
      color: 'bg-indigo-500',
      hoverColor: 'hover:bg-indigo-600',
      action: () => window.dispatchEvent(new CustomEvent('navigate', { detail: 'reports' })),
      stats: `${todaySales.length} sales`
    },
    {
      id: 'check-stock',
      title: t('home.checkStock'),
      description: t('home.checkStockDesc'),
      icon: Package,
      color: 'bg-teal-500',
      hoverColor: 'hover:bg-teal-600',
      action: () => window.dispatchEvent(new CustomEvent('navigate', { detail: 'inventory' })),
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

  const recentSales = sales
    .filter(sale => sale.createdAt)
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
    .slice(0, 5);

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
        
        <div className={`transition-all duration-300 ease-in-out overflow-hidden ${
          showFastActions 
            ? 'max-h-96 opacity-100 mb-8' 
            : 'max-h-0 opacity-0 mb-0'
        }`}>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {fastActions.map((action) => (
              <button
                key={action.id}
                onClick={action.action}
                className={`${action.color} ${action.hoverColor} text-white p-6 rounded-xl shadow-lg transition-all duration-200 transform hover:scale-105 hover:shadow-xl group relative overflow-hidden`}
              >
                {/* Background decoration */}
                <div className="absolute top-0 right-0 w-20 h-20 bg-white bg-opacity-10 rounded-full -translate-y-6 translate-x-6 group-hover:scale-150 transition-transform duration-300"></div>
                <div className="absolute bottom-0 left-0 w-16 h-16 bg-white bg-opacity-5 rounded-full translate-y-4 -translate-x-4 group-hover:scale-125 transition-transform duration-300"></div>
                
                <div className="flex items-start justify-between mb-4">
                  <div className="relative">
                    <action.icon className="w-8 h-8 text-white group-hover:scale-110 transition-all duration-200 relative z-10" />
                    {/* Popup glow effect */}
                    <div className="absolute inset-0 w-8 h-8 bg-white rounded-full opacity-0 group-hover:opacity-20 group-hover:scale-150 transition-all duration-300 blur-sm"></div>
                  </div>
                  <span className="text-sm font-medium bg-white bg-opacity-20 px-2 py-1 rounded-full">
                    {action.stats}
                  </span>
                </div>
                <div className="relative z-10">
                  <h3 className="text-lg font-bold mb-2 group-hover:translate-x-1 transition-transform duration-200">{action.title}</h3>
                  <p className="text-sm opacity-90 group-hover:opacity-100 transition-opacity duration-200">{action.description}</p>
                </div>
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
        {stats.map((stat, index) => (
          <div key={index} className="bg-white rounded-lg shadow-sm p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-600">{stat.title}</p>
                <p className="text-2xl font-bold text-gray-900 mt-2">{stat.value}</p>
                <p className="text-sm text-gray-500 mt-1">{stat.change}</p>
              </div>
              <div className={`p-3 rounded-full ${stat.color}`}>
                <stat.icon className="w-6 h-6 text-white" />
              </div>
            </div>
            {index === 0 && (() => {
              const shouldShowButton = (!cashDrawerStatus || !cashDrawerStatus.openedAt);
              console.log('🔍 Button visibility check:', {
                index,
                cashDrawerStatus,
                openedAt: cashDrawerStatus?.openedAt,
                shouldShowButton
              });
              return shouldShowButton;
            })() && (
              <button
                onClick={handleOpenDrawer}
                className="mt-3 w-full bg-blue-600 text-white py-2 px-4 rounded-lg hover:bg-blue-700 transition-colors text-sm"
              >
                Open Cash Drawer
              </button>
            )}
          </div>
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
                  <div key={item.productId} className="flex items-center justify-between p-3 bg-amber-50 rounded-lg">
                    <div>
                      <p className="font-medium text-gray-900">{item.productName}</p>
                      <p className="text-sm text-gray-600">{item.currentStock} {item.unit} {t('inventory.remaining')}</p>
                    </div>
                    <span className="px-2 py-1 bg-amber-200 text-amber-800 text-xs rounded-full">
                      {t('inventory.lowStock')}
                    </span>
                  </div>
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