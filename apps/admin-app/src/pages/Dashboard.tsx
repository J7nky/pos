import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Store,
  CreditCard,
  DollarSign,
  Building2,
  TrendingUp,
  ArrowRight,
  RefreshCw,
} from 'lucide-react';
import { getDashboardCounts, getStores } from '../services/storeService';
import { getSubscriptionStats } from '../services/subscriptionService';
import { StoreWithStats } from '../types';
import { Badge, getStatusVariant, getTierVariant } from '../components/ui';

export default function Dashboard() {
  const navigate = useNavigate();
  const [isLoading, setIsLoading] = useState(true);
  const [counts, setCounts] = useState({
    stores: 0,
    branches: 0,
    users: 0,
    activeSubscriptions: 0,
  });
  const [subscriptionStats, setSubscriptionStats] = useState({
    total: 0,
    active: 0,
    trial: 0,
    expired: 0,
    byTier: { starter: 0, professional: 0, premium: 0 },
    monthlyRevenue: 0,
  });
  const [recentStores, setRecentStores] = useState<StoreWithStats[]>([]);

  useEffect(() => {
    loadDashboardData();
  }, []);

  const loadDashboardData = async () => {
    setIsLoading(true);
    try {
      const [countsData, subStats, stores] = await Promise.all([
        getDashboardCounts(),
        getSubscriptionStats(),
        getStores(),
      ]);
      setCounts(countsData);
      setSubscriptionStats(subStats);
      setRecentStores(stores.slice(0, 5));
    } catch (error) {
      console.error('Error loading dashboard data:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const stats = [
    {
      name: 'Total Stores',
      value: counts.stores.toString(),
      icon: Store,
      color: 'bg-blue-100 text-blue-600',
      href: '/stores',
    },
    {
      name: 'Total Branches',
      value: counts.branches.toString(),
      icon: Building2,
      color: 'bg-green-100 text-green-600',
      href: '/stores',
    },
    {
      name: 'Active Subscriptions',
      value: counts.activeSubscriptions.toString(),
      icon: CreditCard,
      color: 'bg-purple-100 text-purple-600',
      href: '/subscriptions',
    },
    {
      name: 'Monthly Revenue',
      value: `$${subscriptionStats.monthlyRevenue.toLocaleString()}`,
      icon: DollarSign,
      color: 'bg-yellow-100 text-yellow-600',
      href: '/payments',
    },
  ];

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <RefreshCw className="w-8 h-8 animate-spin text-gray-400" />
      </div>
    );
  }

  return (
    <div className="space-y-8">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">Dashboard</h1>
          <p className="mt-2 text-gray-600">Overview of your POS platform</p>
        </div>
        <button
          onClick={loadDashboardData}
          className="flex items-center gap-2 text-sm text-gray-500 hover:text-gray-700"
        >
          <RefreshCw className="w-4 h-4" />
          Refresh
        </button>
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        {stats.map((stat) => {
          const Icon = stat.icon;
          return (
            <div
              key={stat.name}
              onClick={() => navigate(stat.href)}
              className="bg-white rounded-lg shadow p-6 border border-gray-200 cursor-pointer hover:shadow-md transition-shadow"
            >
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-gray-600">{stat.name}</p>
                  <p className="mt-2 text-3xl font-bold text-gray-900">{stat.value}</p>
                </div>
                <div className={`w-12 h-12 rounded-lg flex items-center justify-center ${stat.color}`}>
                  <Icon className="w-6 h-6" />
                </div>
              </div>
            </div>
          );
        })}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Subscription Breakdown */}
        <div className="bg-white rounded-lg shadow p-6 border border-gray-200">
          <div className="flex items-center justify-between mb-6">
            <h2 className="text-lg font-semibold text-gray-900">Subscription Breakdown</h2>
            <TrendingUp className="w-5 h-5 text-gray-400" />
          </div>
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-3 h-3 rounded-full bg-gray-400" />
                <span className="text-sm text-gray-600">Starter</span>
              </div>
              <span className="text-sm font-medium text-gray-900">
                {subscriptionStats.byTier.starter}
              </span>
            </div>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-3 h-3 rounded-full bg-blue-500" />
                <span className="text-sm text-gray-600">Professional</span>
              </div>
              <span className="text-sm font-medium text-gray-900">
                {subscriptionStats.byTier.professional}
              </span>
            </div>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-3 h-3 rounded-full bg-purple-500" />
                <span className="text-sm text-gray-600">Premium</span>
              </div>
              <span className="text-sm font-medium text-gray-900">
                {subscriptionStats.byTier.premium}
              </span>
            </div>
            <hr className="my-4" />
            <div className="flex items-center justify-between">
              <span className="text-sm text-gray-600">Active</span>
              <Badge variant="success">{subscriptionStats.active}</Badge>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-sm text-gray-600">Trial</span>
              <Badge variant="info">{subscriptionStats.trial}</Badge>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-sm text-gray-600">Expired</span>
              <Badge variant="warning">{subscriptionStats.expired}</Badge>
            </div>
          </div>
        </div>

        {/* Recent Stores */}
        <div className="bg-white rounded-lg shadow p-6 border border-gray-200">
          <div className="flex items-center justify-between mb-6">
            <h2 className="text-lg font-semibold text-gray-900">Recent Stores</h2>
            <button
              onClick={() => navigate('/stores')}
              className="text-sm text-blue-600 hover:text-blue-700 flex items-center gap-1"
            >
              View all
              <ArrowRight className="w-4 h-4" />
            </button>
          </div>
          {recentStores.length === 0 ? (
            <div className="text-center py-8">
              <Store className="w-12 h-12 text-gray-300 mx-auto mb-3" />
              <p className="text-gray-500">No stores yet</p>
              <button
                onClick={() => navigate('/stores')}
                className="mt-3 text-sm text-blue-600 hover:text-blue-700"
              >
                Create your first store
              </button>
            </div>
          ) : (
            <div className="space-y-4">
              {recentStores.map((store) => (
                <div
                  key={store.id}
                  onClick={() => navigate(`/stores/${store.id}`)}
                  className="flex items-center justify-between p-3 rounded-lg hover:bg-gray-50 cursor-pointer transition-colors"
                >
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 bg-blue-100 rounded-lg flex items-center justify-center">
                      <Store className="w-5 h-5 text-blue-600" />
                    </div>
                    <div>
                      <p className="font-medium text-gray-900">{store.name}</p>
                      <p className="text-xs text-gray-500">
                        {store.branches_count} branches · {store.users_count} users
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <Badge variant={getStatusVariant(store.status)} size="sm">
                      {store.status}
                    </Badge>
                    {store.subscription && (
                      <Badge variant={getTierVariant(store.subscription.tier)} size="sm">
                        {store.subscription.tier}
                      </Badge>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

