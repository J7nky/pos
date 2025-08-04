import React from 'react';
import { useState } from 'react';
import { useOfflineData } from '../contexts/OfflineDataContext';
import { useSupabaseAuth } from '../contexts/SupabaseAuthContext';
import { useCurrency } from '../hooks/useCurrency';
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
  EyeOff
} from 'lucide-react';

export default function Home() {
  const raw = useOfflineData();
  const products = Array.isArray(raw.products) ? raw.products.map(p => ({...p, isActive: true, createdAt: p.created_at})) : [];
  const customers = Array.isArray(raw.customers) ? raw.customers.map(c => ({...c, isActive: c.is_active, createdAt: c.created_at, balance: c.balance})) : [];
  const suppliers = Array.isArray(raw.suppliers) ? raw.suppliers.map(s => ({...s, isActive: s.is_active, createdAt: s.created_at, type: s.type || 'commission'})) : [];
  const sales = Array.isArray(raw.sales) ? raw.sales.map(s => ({...s, createdAt: s.created_at})) : [];
  const stockLevels = Array.isArray(raw.stockLevels) ? raw.stockLevels : [];
  const cashDrawer = raw.cashDrawer;
  const openCashDrawer = raw.openCashDrawer;
  const transactions = Array.isArray(raw.transactions) ? raw.transactions.map(t => ({...t, createdAt: t.created_at})) : [];
  const lowStockAlertsEnabled = raw.lowStockAlertsEnabled;
  const lowStockThreshold = raw.lowStockThreshold;
  const { userProfile } = useSupabaseAuth();
  const { formatCurrency, getConvertedAmount } = useCurrency();
  const [showFastActions, setShowFastActions] = useState(true);
  const inventory = Array.isArray(raw.inventory) ? raw.inventory : [];
  const recentReceivesCount = inventory
    .sort((a, b) => new Date(b.received_at || b.receivedAt).getTime() - new Date(a.received_at || a.receivedAt).getTime())
    .slice(0, 10).length;

  const today = new Date().toISOString().split('T')[0];
  const todaySales = sales.filter(sale => 
    sale.createdAt.split('T')[0] === today && sale.status === 'completed'
  );
  const todayRevenue = todaySales.reduce((sum, sale) => sum + sale.total, 0);
  const todayExpenses = transactions.filter(t => 
    t.type === 'expense' && t.createdAt.split('T')[0] === today
  ).reduce((sum, t) => {
    const convertedAmount = getConvertedAmount(t.amount, t.currency || 'USD');
    return sum + convertedAmount;
  }, 0);

  const lowStockItems = lowStockAlertsEnabled 
    ? stockLevels.filter(item => item.currentStock < lowStockThreshold)
    : [];

  const handleOpenDrawer = () => {
    const openingAmount = prompt('Enter opening cash amount:');
    if (openingAmount && userProfile) {
      openCashDrawer(parseFloat(openingAmount), userProfile.id);
    }
  };

  const fastActions = [
    {
      id: 'quick-sale',
      title: 'Quick Sale',
      description: 'Start a new sale transaction',
      icon: ShoppingCart,
      color: 'bg-green-500',
      hoverColor: 'hover:bg-green-600',
      action: () => window.dispatchEvent(new CustomEvent('navigate', { detail: 'pos' })),
      stats: `${todaySales.length} today`
    },
    {
      id: 'receive-products',
      title: 'Receive Products',
      description: 'Add new inventory from suppliers',
      icon: Truck,
      color: 'bg-blue-500',
      hoverColor: 'hover:bg-blue-600',
      action: () => window.dispatchEvent(new CustomEvent('navigate', { detail: 'inventory' })),
      stats: `${recentReceivesCount} recent receives`
    },
    {
      id: 'add-customer',
      title: 'Add Customer',
      description: 'Register a new customer',
      icon: UserPlus,
      color: 'bg-purple-500',
      hoverColor: 'hover:bg-purple-600',
      action: () => window.dispatchEvent(new CustomEvent('navigate', { detail: 'customers' })),
      stats: `${customers.filter(c => c.isActive).length} active`
    },
    {
      id: 'record-expense',
      title: 'Record Expense',
      description: 'Log business expenses',
      icon: Receipt,
      color: 'bg-amber-500',
      hoverColor: 'hover:bg-amber-600',
      action: () => window.dispatchEvent(new CustomEvent('navigate', { detail: 'accounting' })),
      stats: `${formatCurrency(todayExpenses)} today`
    },
    {
      id: 'today-sales',
      title: "Today's Sales",
      description: 'View sales performance',
      icon: Eye,
      color: 'bg-indigo-500',
      hoverColor: 'hover:bg-indigo-600',
      action: () => window.dispatchEvent(new CustomEvent('navigate', { detail: 'reports' })),
      stats: `${todaySales.length} sales`
    },
    {
      id: 'check-stock',
      title: 'Check Stock',
      description: 'Monitor inventory levels',
      icon: Package,
      color: 'bg-teal-500',
      hoverColor: 'hover:bg-teal-600',
      action: () => window.dispatchEvent(new CustomEvent('navigate', { detail: 'inventory' })),
      stats: lowStockAlertsEnabled ? `${lowStockItems.length} low stock` : `${products.length} products`
    }
  ];

  const stats = [
    {
      title: "Cash in Drawer",
      value: cashDrawer ? formatCurrency(cashDrawer.currentAmount) : 'Closed',
      icon: DollarSign,
      color: 'bg-green-500',
      change: cashDrawer ? `Opened: ${new Date(cashDrawer.openedAt).toLocaleTimeString()}` : 'Not opened today'
    },
    {
      title: "Today's Expenses", 
      value: formatCurrency(todayExpenses),
      icon: Receipt,
      color: 'bg-red-500',
      change: `${transactions.filter(t => t.type === 'expense' && t.createdAt.split('T')[0] === today).length} transactions`
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
    .filter(sale => sale.status === 'completed')
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
    .slice(0, 5);

  return (
    <div className="p-6">
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-gray-900">
          Welcome back, {userProfile?.name}
        </h1>
        <p className="text-gray-600 mt-2">
          Here's what's happening at your store today.
        </p>
      </div>

      {/* Fast Actions Section */}
      <div className="mb-8">
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center">
            <Zap className="w-6 h-6 text-yellow-500 mr-2" />
            <h2 className="text-2xl font-bold text-gray-900">Fast Actions</h2>
          </div>
          <button
            onClick={() => setShowFastActions(!showFastActions)}
            className="flex items-center px-3 py-2 text-gray-600 hover:text-gray-900 hover:bg-gray-100 rounded-lg transition-colors"
            title={showFastActions ? "Hide Fast Actions" : "Show Fast Actions"}
          >
            {showFastActions ? (
              <>
                <EyeOff className="w-4 h-4 mr-2" />
                <span className="text-sm font-medium">Hide</span>
                <ChevronUp className="w-4 h-4 ml-1" />
              </>
            ) : (
              <>
                <Eye className="w-4 h-4 mr-2" />
                <span className="text-sm font-medium">Show</span>
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
            {index === 0 && !cashDrawer && (
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

      <div className={`grid grid-cols-1 ${lowStockAlertsEnabled ? 'lg:grid-cols-2' : ''} gap-6`}>
        {lowStockAlertsEnabled && (
          <div className="bg-white rounded-lg shadow-sm p-6">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-semibold text-gray-900">Low Stock Alert</h2>
              <AlertTriangle className="w-5 h-5 text-amber-500" />
            </div>
            {lowStockItems.length > 0 ? (
              <div className="space-y-3">
                {lowStockItems.slice(0, 5).map(item => (
                  <div key={item.productId} className="flex items-center justify-between p-3 bg-amber-50 rounded-lg">
                    <div>
                      <p className="font-medium text-gray-900">{item.productName}</p>
                      <p className="text-sm text-gray-600">{item.currentStock} {item.unit} remaining</p>
                    </div>
                    <span className="px-2 py-1 bg-amber-200 text-amber-800 text-xs rounded-full">
                      Low Stock
                    </span>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-gray-500 text-center py-4">All products are well stocked!</p>
            )}
          </div>
        )}
        {/* Recent Sales */}
        <div className="bg-white rounded-lg shadow-sm p-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-semibold text-gray-900">Recent Sales</h2>
            <Clock className="w-5 h-5 text-gray-400" />
          </div>
          {recentSales.length > 0 ? (
            <div className="space-y-3">
              {recentSales.map(sale => (
                <div key={sale.id} className="flex items-center justify-between p-3 border border-gray-100 rounded-lg">
                  <div>
                    <p className="font-medium text-gray-900">
                      Sale #{sale.id.slice(-6)}
                    </p>
                    <p className="text-sm text-gray-600">
                      {new Date(sale.createdAt).toLocaleTimeString()}
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="font-semibold text-gray-900">{formatCurrency(sale.total)}</p>
                    <p className="text-sm text-gray-600 capitalize">{sale.paymentMethod}</p>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-gray-500 text-center py-4">No recent sales</p>
          )}
        </div>
      </div>
    </div>
  );
}