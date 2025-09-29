import { useState } from 'react';
import { useOfflineData } from '../contexts/OfflineDataContext';
import { 
  BarChart3, 
  TrendingUp, 
  DollarSign, 
  Download,
  Users,
  Package,
  AlertTriangle
} from 'lucide-react';
import SalesOverviewCard from '../components/cards/SalesOverviewCard';
import { MissedProductsHistory } from '../components/MissedProductsHistory';

export default function Reports() {
  const raw = useOfflineData();
  // Map all arrays to camelCase for compatibility
  const products = raw.products.map(p => ({...p, createdAt: p.created_at})) as Array<{id: string, name: string, createdAt: string}>;
  const customers = raw.customers.map(c => ({...c, isActive: c.is_active, createdAt: c.created_at, lb_balance: c.lb_balance, usd_balance: c.usd_balance})) as Array<{id: string, name: string, isActive: boolean, createdAt: string, lb_balance: number, usd_balance: number, phone: string, email?: string, address?: string}>;
  const sales = raw.sales.map(s => ({...s, createdAt: s.created_at})) as Array<any>;
  const stockLevels = raw.stockLevels as Array<any>;
  const lowStockAlertsEnabled = raw.lowStockAlertsEnabled;
  const lowStockThreshold = raw.lowStockThreshold;
  const [dateRange, setDateRange] = useState({
    startDate: new Date().toISOString().split('T')[0],
    endDate: new Date().toISOString().split('T')[0]
  });
  const [reportType, setReportType] = useState<'sales' | 'inventory' | 'customers' | 'profit' | 'missed-products'>('sales');

  const filteredSales = sales.filter(sale => {
    if (!sale.createdAt) return false;
    const saleDate = sale.createdAt.split('T')[0];
    return saleDate >= dateRange.startDate && saleDate <= dateRange.endDate;
  });

  const totalRevenue = filteredSales.reduce((sum, sale) => sum + sale.total, 0);
  const totalSales = filteredSales.length;
  const averageSale = totalSales > 0 ? totalRevenue / totalSales : 0;

  const salesByPaymentMethod = filteredSales.reduce((acc, sale) => {
    acc[sale.paymentMethod] = (acc[sale.paymentMethod] || 0) + sale.total;
    return acc;
  }, {} as Record<string, number>);

  const topProducts = filteredSales
    .reduce((acc, sale) => {
      const key = sale.product_id;
      if (!acc[key]) {
        acc[key] = {
          productName: sale.productName || 'Unknown Product',
          quantity: 0,
          revenue: 0
        };
      }
      acc[key].quantity += sale.quantity || 1;
      acc[key].revenue += sale.received_value;
      return acc;
    }, {} as Record<string, { productName: string; quantity: number; revenue: number }>);

  const topProductsList = Object.values(topProducts)
    .sort((a: any, b: any) => b.revenue - a.revenue)
    .slice(0, 5);

  const customerDebtSummary = customers.reduce((acc, customer) => {
    const totalDebt = (customer.lb_balance || 0) + (customer.usd_balance || 0);
    if (totalDebt > 0) {
      acc.totalDebt += totalDebt;
      acc.customersWithDebt += 1;
    }
    return acc;
  }, { totalDebt: 0, customersWithDebt: 0 });

  const lowStockItems = lowStockAlertsEnabled 
    ? stockLevels.filter(item => item.currentStock < lowStockThreshold)
    : [];

  return (
    <div className="p-6">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Reports & Analytics</h1>
        <button className="bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 transition-colors flex items-center">
          <Download className="w-5 h-5 mr-2" />
          Export Report
        </button>
      </div>

      {/* Date Range and Report Type */}
      <div className="bg-white rounded-lg shadow-sm p-6 mb-6">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Report Type
            </label>
            <select
              value={reportType}
              onChange={(e) => setReportType(e.target.value as any)}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:ring-blue-500 focus:border-blue-500"
            >
              <option value="sales">Sales Report</option>
              <option value="inventory">Inventory Report</option>
              <option value="customers">Customer Report</option>
              <option value="profit">Profit Analysis</option>
              <option value="missed-products">Missed Products Report</option>
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Start Date
            </label>
            <input
              type="date"
              value={dateRange.startDate}
              onChange={(e) => setDateRange(prev => ({ ...prev, startDate: e.target.value }))}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:ring-blue-500 focus:border-blue-500"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              End Date
            </label>
            <input
              type="date"
              value={dateRange.endDate}
              onChange={(e) => setDateRange(prev => ({ ...prev, endDate: e.target.value }))}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:ring-blue-500 focus:border-blue-500"
            />
          </div>
          <div className="flex items-end">
            <button className="w-full bg-gray-100 text-gray-700 px-4 py-2 rounded-lg hover:bg-gray-200 transition-colors">
              Generate Report
            </button>
          </div>
        </div>
      </div>

      {reportType === 'sales' && (
        <div className="space-y-6">
          {/* Sales Overview */}
          <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
            <SalesOverviewCard
              title="Total Revenue"
              value={`$${totalRevenue.toLocaleString()}`}
              icon={<DollarSign className="w-8 h-8" />}
              iconColor="text-green-500"
            />
            <SalesOverviewCard
              title="Total Sales"
              value={totalSales}
              icon={<BarChart3 className="w-8 h-8" />}
              iconColor="text-blue-500"
            />
            <SalesOverviewCard
              title="Average Sale"
              value={`$${averageSale.toFixed(2)}`}
              icon={<TrendingUp className="w-8 h-8" />}
              iconColor="text-purple-500"
            />
            <SalesOverviewCard
              title="Customer Debt"
              value={`$${customerDebtSummary.totalDebt.toLocaleString()}`}
              icon={<Users className="w-8 h-8" />}
              iconColor="text-amber-500"
            />
          </div>
          {/* Payment Methods */}
          <div className="bg-white rounded-lg shadow-sm p-6">
            <h2 className="text-lg font-semibold text-gray-900 mb-4">Sales by Payment Method</h2>
            <div className="space-y-3">
              {Object.entries(salesByPaymentMethod).map(([method, amount]) => (
                <div key={method} className="flex items-center justify-between">
                  <span className="capitalize text-gray-700">{method}</span>
                  <span className="font-medium text-gray-900">${(amount as number).toFixed(2)}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Top Products */}
          <div className="bg-white rounded-lg shadow-sm p-6">
            <h2 className="text-lg font-semibold text-gray-900 mb-4">Top Selling Products</h2>
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Product</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Quantity Sold</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Revenue</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-200">
                  {topProductsList.map((product: any, index: number) => (
                    <tr key={index}>
                      <td className="px-4 py-4 text-gray-900">{product.productName}</td>
                      <td className="px-4 py-4 text-gray-900">{product.quantity}</td>
                      <td className="px-4 py-4 text-gray-900">${product.revenue.toFixed(2)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {reportType === 'inventory' && (
        <div className="space-y-6">
          {/* Inventory Overview */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <div className="bg-white rounded-lg shadow-sm p-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-gray-600">Total Products</p>
                  <p className="text-2xl font-bold text-gray-900">{products.length}</p>
                </div>
                <Package className="w-8 h-8 text-blue-500" />
              </div>
            </div>
            
            <div className="bg-white rounded-lg shadow-sm p-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-gray-600">In Stock Items</p>
                  <p className="text-2xl font-bold text-gray-900">
                    {stockLevels.filter(item => item.currentStock > 0).length}
                  </p>
                </div>
                <Package className="w-8 h-8 text-green-500" />
              </div>
            </div>
            
            <div className="bg-white rounded-lg shadow-sm p-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-gray-600">Low Stock Items</p>
                  <p className="text-2xl font-bold text-gray-900">{lowStockItems.length}</p>
                </div>
                <Package className="w-8 h-8 text-amber-500" />
              </div>
            </div>
          </div>

          {/* Stock Levels */}
          <div className="bg-white rounded-lg shadow-sm p-6">
            <h2 className="text-lg font-semibold text-gray-900 mb-4">Current Stock Levels</h2>
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Product</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Current Stock</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Status</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Last Received</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-200">
                  {stockLevels.map(item => (
                    <tr key={item.productId}>
                      <td className="px-4 py-4 text-gray-900">{item.productName}</td>
                      <td className="px-4 py-4 text-gray-900">{item.currentStock} {item.unit}</td>
                      <td className="px-4 py-4">
                        <span className={`px-2 py-1 text-xs rounded-full ${
                          item.currentStock === 0 
                            ? 'bg-red-100 text-red-800'
                            : item.currentStock < 10
                            ? 'bg-amber-100 text-amber-800'
                            : 'bg-green-100 text-green-800'
                        }`}>
                          {item.currentStock === 0 
                            ? 'Out of Stock' 
                            : item.currentStock < 10 
                            ? 'Low Stock' 
                            : 'In Stock'}
                        </span>
                      </td>
                      <td className="px-4 py-4 text-gray-500">
                        {item.lastReceived ? new Date(item.lastReceived).toLocaleDateString() : 'Never'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {reportType === 'customers' && (
        <div className="space-y-6">
          {/* Customer Overview */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <div className="bg-white rounded-lg shadow-sm p-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-gray-600">Total Customers</p>
                  <p className="text-2xl font-bold text-gray-900">{customers.length}</p>
                </div>
                <Users className="w-8 h-8 text-blue-500" />
              </div>
            </div>
            
            <div className="bg-white rounded-lg shadow-sm p-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-gray-600">Customers with Debt</p>
                  <p className="text-2xl font-bold text-gray-900">{customerDebtSummary.customersWithDebt}</p>
                </div>
                <Users className="w-8 h-8 text-amber-500" />
              </div>
            </div>
            
            <div className="bg-white rounded-lg shadow-sm p-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-gray-600">Total Customer Debt</p>
                  <p className="text-2xl font-bold text-gray-900">${customerDebtSummary.totalDebt.toLocaleString()}</p>
                </div>
                <DollarSign className="w-8 h-8 text-red-500" />
              </div>
            </div>
          </div>

          {/* Customer List */}
          <div className="bg-white rounded-lg shadow-sm p-6">
            <h2 className="text-lg font-semibold text-gray-900 mb-4">Customer Details</h2>
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Customer</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Contact</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Current Debt</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-200">
                  {customers.map(customer => (
                    <tr key={customer.id}>
                      <td className="px-4 py-4">
                        <div>
                          <p className="font-medium text-gray-900">{customer.name}</p>
                          <p className="text-sm text-gray-500">{customer.email}</p>
                        </div>
                      </td>
                      <td className="px-4 py-4 text-gray-900">{customer.phone}</td>
                      <td className="px-4 py-4">
                        <div>
                          <span className={`font-medium ${
                            (customer.lb_balance || 0) > 0 ? 'text-red-600' : 'text-green-600'
                          }`}>
                            LBP: {(customer.lb_balance || 0).toLocaleString()}
                          </span>
                          <br />
                          <span className={`font-medium ${
                            (customer.usd_balance || 0) > 0 ? 'text-red-600' : 'text-green-600'
                          }`}>
                            USD: {(customer.usd_balance || 0).toLocaleString()}
                          </span>
                        </div>
                      </td>
                     
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {reportType === 'missed-products' && (
        <MissedProductsHistory storeId={raw.storeId} />
      )}
    </div>
  );
}