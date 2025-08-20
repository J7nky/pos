import React, { useState, useEffect } from 'react';
import { useOfflineData } from '../contexts/OfflineDataContext';
import { useSupabaseAuth } from '../contexts/SupabaseAuthContext';
import { useCurrency } from '../hooks/useCurrency';
import { 
  Calculator, 
  DollarSign, 
  TrendingUp, 
  TrendingDown, 
  Users, 
  Building2, 
  Receipt, 
  FileText, 
  CreditCard, 
  AlertTriangle,
  CheckCircle,
  Clock,
  Package,
  Eye,
  RefreshCw,
  Download,
  Filter,
  Search,
  Calendar,
  BarChart3,
  PieChart,
  Activity
} from 'lucide-react';
import SyncStatus from './SyncStatus';
import ActivityFeed from './ActivityFeed';
import AuditDashboard from './AuditDashboard';
import FinancialProcessor from './FinancialProcessor';
import InventoryLogs from './accountingTabs/InventoryLogs';
import ReceivedBills from './accountingTabs/ReceivedBills';

export default function Accounting() {
  const raw = useOfflineData();
  const { userProfile } = useSupabaseAuth();
  const { formatCurrency, getConvertedAmount } = useCurrency();
  
  // Map data for compatibility
  const customers = raw.customers.map(c => ({...c, isActive: c.is_active, createdAt: c.created_at, lb_balance: c.lb_balance, usd_balance: c.usd_balance})) as Array<any>;
  const suppliers = raw.suppliers.map(s => ({...s, createdAt: s.created_at})) as Array<any>;
  const transactions = raw.transactions.map(t => ({...t, createdAt: t.created_at, createdBy: t.created_by, storeId: t.store_id})) as Array<any>;
  const sales = raw.sales;
  const inventory = raw.inventory;
  const bills = raw.bills || [];

  const [activeTab, setActiveTab] = useState<'dashboard' | 'receivables' | 'payables' | 'transactions' | 'bills' | 'received_bills' | 'activity' | 'audit' | 'processor'>('dashboard');
  const [dateRange, setDateRange] = useState({
    start: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
    end: new Date().toISOString().split('T')[0]
  });

  // Calculate dashboard metrics
  const today = new Date().toISOString().split('T')[0];
  const todayTransactions = transactions.filter(t => 
    t.createdAt && t.createdAt.split('T')[0] === today
  );

  const todayIncome = todayTransactions
    .filter(t => t.type === 'income')
    .reduce((sum, t) => {
      const originalLBPAmount = t.description.match(/Originally ([\d,]+) LBP/);
      if (originalLBPAmount) {
        const originalAmount = parseInt(originalLBPAmount[1].replace(/,/g, ''));
        return sum + getConvertedAmount(originalAmount, 'LBP');
      }
      return sum + getConvertedAmount(t.amount, t.currency || 'USD');
    }, 0);

  const todayExpenses = todayTransactions
    .filter(t => t.type === 'expense')
    .reduce((sum, t) => {
      const originalLBPAmount = t.description.match(/Originally ([\d,]+) LBP/);
      if (originalLBPAmount) {
        const originalAmount = parseInt(originalLBPAmount[1].replace(/,/g, ''));
        return sum + getConvertedAmount(originalAmount, 'LBP');
      }
      return sum + getConvertedAmount(t.amount, t.currency || 'USD');
    }, 0);

  const netProfit = todayIncome - todayExpenses;
  const profitMargin = todayIncome > 0 ? (netProfit / todayIncome) * 100 : 0;

  const customersWithDebt = customers.filter(c => (c.lb_balance || 0) > 0 || (c.usd_balance || 0) > 0).length;
  const totalCustomerDebt = customers.reduce((sum, c) => {
    const lbDebt = getConvertedAmount(c.lb_balance || 0, 'LBP');
    const usdDebt = getConvertedAmount(c.usd_balance || 0, 'USD');
    return sum + lbDebt + usdDebt;
  }, 0);

  const suppliersWithBalance = suppliers.filter(s => (s.lb_balance || 0) > 0 || (s.usd_balance || 0) > 0).length;
  const totalSupplierBalance = suppliers.reduce((sum, s) => {
    const lbBalance = getConvertedAmount(s.lb_balance || 0, 'LBP');
    const usdBalance = getConvertedAmount(s.usd_balance || 0, 'USD');
    return sum + lbBalance + usdBalance;
  }, 0);

  // Bill metrics
  const todayBills = bills.filter(b => 
    b.bill_date && b.bill_date.split('T')[0] === today && b.status === 'active'
  );
  const pendingBills = bills.filter(b => 
    b.payment_status === 'pending' && b.status === 'active'
  );
  const todayBillsTotal = todayBills.reduce((sum, b) => sum + (b.total_amount || 0), 0);

  const dashboardStats = [
    {
      title: "Today's Income",
      value: formatCurrency(todayIncome),
      icon: TrendingUp,
      color: 'bg-green-500',
      change: `${todayTransactions.filter(t => t.type === 'income').length} transactions`
    },
    {
      title: "Today's Expenses",
      value: formatCurrency(todayExpenses),
      icon: TrendingDown,
      color: 'bg-red-500',
      change: `${todayTransactions.filter(t => t.type === 'expense').length} transactions`
    },
    {
      title: 'Net Profit',
      value: formatCurrency(netProfit),
      icon: DollarSign,
      color: netProfit >= 0 ? 'bg-blue-500' : 'bg-red-500',
      change: `${profitMargin.toFixed(1)}% margin`
    },
    {
      title: 'Customer Debt',
      value: formatCurrency(totalCustomerDebt),
      icon: Users,
      color: 'bg-amber-500',
      change: `${customersWithDebt} customers`
    },
    {
      title: 'Supplier Balance',
      value: formatCurrency(totalSupplierBalance),
      icon: Building2,
      color: 'bg-purple-500',
      change: `${suppliersWithBalance} suppliers`
    },
    {
      title: "Today's Bills",
      value: formatCurrency(todayBillsTotal),
      icon: Receipt,
      color: 'bg-indigo-500',
      change: `${todayBills.length} bills created`
    }
  ];

  const tabs = [
    { id: 'dashboard', label: 'Dashboard', icon: BarChart3 },
    { id: 'bills', label: 'Bill Management', icon: Receipt },
    { id: 'received_bills', label: 'Received Bills', icon: Package },
    { id: 'activity', label: 'Activity Feed', icon: Activity },
    { id: 'audit', label: 'Audit Dashboard', icon: FileText },
    { id: 'processor', label: 'Financial Processor', icon: Calculator }
  ];

  return (
    <div className="p-6">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-3xl font-bold text-gray-900">Accounting & Financial Management</h1>
        <div className="flex items-center space-x-4">
          <div className="flex items-center space-x-2 text-sm text-gray-600">
            <Clock className="w-4 h-4" />
            <span>Last updated: {new Date().toLocaleTimeString()}</span>
          </div>
          <button
            onClick={() => raw.refreshData()}
            className="bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 transition-colors flex items-center"
          >
            <RefreshCw className="w-4 h-4 mr-2" />
            Refresh
          </button>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex space-x-1 mb-6 bg-gray-100 p-1 rounded-lg w-fit">
        {tabs.map(tab => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id as any)}
            className={`px-4 py-2 rounded-md transition-colors flex items-center ${
              activeTab === tab.id ? 'bg-white text-blue-600 shadow-sm' : 'text-gray-600 hover:text-gray-900'
            }`}
          >
            <tab.icon className="w-4 h-4 mr-2" />
            {tab.label}
          </button>
        ))}
      </div>

      {/* Dashboard */}
      {activeTab === 'dashboard' && (
        <div className="space-y-6">
          {/* Stats Grid */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {dashboardStats.map((stat, index) => (
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
              </div>
            ))}
          </div>

          {/* Quick Actions and Sync Status */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            <div className="lg:col-span-2">
              <div className="bg-white rounded-lg shadow-sm p-6">
                <h2 className="text-lg font-semibold text-gray-900 mb-4">Recent Activity</h2>
                <ActivityFeed 
                  showSearch={false}
                  showFilters={false}
                  maxEntries={10}
                  autoRefresh={false}
                />
              </div>
            </div>
            <div>
              <SyncStatus />
            </div>
          </div>

          {/* Bills Summary */}
          <div className="bg-white rounded-lg shadow-sm p-6">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-semibold text-gray-900">Bills Overview</h2>
              <button
                onClick={() => setActiveTab('bills')}
                className="text-blue-600 hover:text-blue-800 text-sm font-medium"
              >
                View All Bills →
              </button>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="bg-blue-50 p-4 rounded-lg">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm text-blue-600">Today's Bills</p>
                    <p className="text-xl font-bold text-blue-900">{todayBills.length}</p>
                  </div>
                  <Receipt className="w-8 h-8 text-blue-600" />
                </div>
              </div>
              <div className="bg-yellow-50 p-4 rounded-lg">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm text-yellow-600">Pending Bills</p>
                    <p className="text-xl font-bold text-yellow-900">{pendingBills.length}</p>
                  </div>
                  <Clock className="w-8 h-8 text-yellow-600" />
                </div>
              </div>
              <div className="bg-green-50 p-4 rounded-lg">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm text-green-600">Bills Total</p>
                    <p className="text-xl font-bold text-green-900">{formatCurrency(todayBillsTotal)}</p>
                  </div>
                  <DollarSign className="w-8 h-8 text-green-600" />
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Bill Management */}
      {activeTab === 'bills' && <InventoryLogs />}

      {/* Received Bills */}
      {activeTab === 'received_bills' && <ReceivedBills />}

      {/* Activity Feed */}
      {activeTab === 'activity' && (
        <ActivityFeed 
          showSearch={true}
          showFilters={true}
          maxEntries={100}
          autoRefresh={true}
        />
      )}

      {/* Audit Dashboard */}
      {activeTab === 'audit' && <AuditDashboard />}

      {/* Financial Processor */}
      {activeTab === 'processor' && <FinancialProcessor />}
    </div>
  );
}