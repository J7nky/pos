import { useMemo, useState } from 'react';
import { FileSpreadsheet, Search, Activity, Package, ShoppingCart, DollarSign, Eye, X, Edit, Trash2, FileText } from 'lucide-react';

type InventoryLogsProps = {
  inventoryLogs: any[];
  products: any[];
  suppliers: any[];
  customers?: any[];
  sales?: any[];
  formatCurrency: (amount: number) => string;
  formatCurrencyWithSymbol?: (amount: number, currency?: string) => string;
  showToast: (message: string, type?: 'success' | 'error') => void;
  onEditSale?: (sale: any) => void;
  onDeleteSale?: (sale: any) => void;
};

export default function InventoryLogs({
  inventoryLogs,
  products,
  suppliers,
  customers = [],
  formatCurrency,
  formatCurrencyWithSymbol,
  showToast,
  sales = [],
  
}: InventoryLogsProps) {
  const [inventoryLogsSearchTerm, setInventoryLogsSearchTerm] = useState('');
  const [inventoryLogsProductFilter, setInventoryLogsProductFilter] = useState('');
  const [inventoryLogsSupplierFilter, setInventoryLogsSupplierFilter] = useState('');
  const [inventoryLogsDateFilter, setInventoryLogsDateFilter] = useState<'all' | 'today' | 'week' | 'month'>('all');
  const [inventoryLogsPage, setInventoryLogsPage] = useState(1);
  const [inventoryLogsSort, setInventoryLogsSort] = useState<'date' | 'product' | 'supplier' | 'amount'>('date');
  const [inventoryLogsSortDir, setInventoryLogsSortDir] = useState<'asc' | 'desc'>('desc');

  const filteredInventoryLogs = useMemo(() => {
    let filtered = Array.isArray(inventoryLogs) ? [...inventoryLogs] : [];

    if (inventoryLogsSearchTerm) {
      const search = inventoryLogsSearchTerm.toLowerCase();
      filtered = filtered.filter((log: any) =>
        (log.productName || '').toLowerCase().includes(search) ||
        (log.supplierName || '').toLowerCase().includes(search) ||
        (log.customerName || '').toLowerCase().includes(search) ||
        (log.description || '').toLowerCase().includes(search) ||
        (log.reference || '').toLowerCase().includes(search)
      );
    }

    if (inventoryLogsProductFilter) {
      filtered = filtered.filter((log: any) => log.productId === inventoryLogsProductFilter);
    }

    if (inventoryLogsSupplierFilter) {
      filtered = filtered.filter((log: any) => log.supplierId === inventoryLogsSupplierFilter);
    }

    if (inventoryLogsDateFilter !== 'all') {
      const now = new Date();
      let startDate: Date;
      switch (inventoryLogsDateFilter) {
        case 'today':
          startDate = new Date(now.getFullYear(), now.getMonth(), now.getDate());
          break;
        case 'week':
          startDate = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
          break;
        case 'month':
          startDate = new Date(now.getFullYear(), now.getMonth(), 1);
          break;
        default:
          startDate = new Date(0);
      }
      filtered = filtered.filter((log: any) => new Date(log.date) >= startDate);
    }

    filtered.sort((a: any, b: any) => {
      let cmp = 0;
      switch (inventoryLogsSort) {
        case 'date':
          cmp = new Date(a.date).getTime() - new Date(b.date).getTime();
          break;
        case 'product':
          cmp = (a.productName || '').localeCompare(b.productName || '');
          break;
        case 'supplier':
          cmp = (a.supplierName || '').localeCompare(b.supplierName || '');
          break;
        case 'amount':
          cmp = (a.amount || 0) - (b.amount || 0);
          break;
      }
      return inventoryLogsSortDir === 'asc' ? cmp : -cmp;
    });

    return filtered;
  }, [
    inventoryLogs,
    inventoryLogsSearchTerm,
    inventoryLogsProductFilter,
    inventoryLogsSupplierFilter,
    inventoryLogsDateFilter,
    inventoryLogsSort,
    inventoryLogsSortDir
  ]);

  const inventoryLogsPerPage = 20;
  const inventoryLogsTotalPages = Math.ceil(filteredInventoryLogs.length / inventoryLogsPerPage) || 1;
  const pagedInventoryLogs = filteredInventoryLogs.slice(
    (inventoryLogsPage - 1) * inventoryLogsPerPage,
    inventoryLogsPage * inventoryLogsPerPage
  );

  const handleInventoryLogsSort = (sort: 'date' | 'product' | 'supplier' | 'amount') => {
    if (inventoryLogsSort === sort) {
      setInventoryLogsSortDir(inventoryLogsSortDir === 'asc' ? 'desc' : 'asc');
    } else {
      setInventoryLogsSort(sort);
      setInventoryLogsSortDir('desc');
    }
  };

  const exportInventoryLogs = () => {
    const csvContent = [
      [
        'Date',
        'Type',
        'Product',
        'Supplier',
        'Customer',
        'Quantity',
        'Weight',
        'Unit Price',
        'Total Amount',
        'Currency',
        'Description',
        'Reference',
        'Notes'
      ].join(','),
      ...filteredInventoryLogs.map((log: any) =>
        [
          new Date(log.date).toLocaleDateString(),
          log.type,
          log.productName || '',
          log.supplierName || '',
          log.customerName || '',
          log.quantity || '',
          log.weight || '',
          log.unitPrice || '',
          log.amount || '',
          log.currency || '',
          (log.description || '').replace(/,/g, ';'),
          log.reference || '',
          (log.notes || '').replace(/,/g, ';')
        ].join(',')
      )
    ].join('\n');

    const blob = new Blob([csvContent], { type: 'text/csv' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `inventory-transaction-logs-${new Date().toISOString().split('T')[0]}.csv`;
    a.click();
    window.URL.revokeObjectURL(url);
    showToast('Inventory transaction logs exported successfully', 'success');
  };

  const handleViewInventoryItemDetails = (log: any) => {
    if (log?.type !== 'inventory_received') return;
    setSelectedInventoryLog(log);
    setShowSalesLogs(true);
  };

  const [showSalesLogs, setShowSalesLogs] = useState(false);
  const [selectedInventoryLog, setSelectedInventoryLog] = useState<any | null>(null);

  const processedSalesData = useMemo(() => {
    if (!selectedInventoryLog) return [] as any[];
    const invId = String(selectedInventoryLog.id || '').replace('inventory-', '');
    const matchingSales = (sales || []).filter((s: any) => s && s.inventory_item_id === invId);
    const details = matchingSales.map((sale: any) => ({
      ...sale,
      saleId: sale.id,
      saleDate: sale.created_at,
      customerId: sale.customer_id,
      customerName: (customers as any[]).find((c: any) => c.id === sale.customer_id)?.name || 'Walk-in Customer',
      quantity: sale.quantity || 1,
      weight: sale.weight,
      unitPrice: sale.unit_price,
      totalPrice: typeof sale.unit_price === 'number' && typeof sale.quantity === 'number'
        ? sale.unit_price * sale.quantity
        : (sale.received_value || 0),
      paymentMethod: sale.payment_method || 'cash',
      notes: sale.notes,
      productName: selectedInventoryLog.productName,
      supplierName: selectedInventoryLog.supplierName,
      unit: selectedInventoryLog.unit
    }));
    return details.sort((a: any, b: any) => new Date(b.saleDate).getTime() - new Date(a.saleDate).getTime());
  }, [selectedInventoryLog, sales, customers]);

  return (
    <div className="space-y-0">
      {/* Header */}
      <div className="flex justify-between items-center">
        <div>
          <h2 className="text-xl font-semibold text-gray-900">Inventory Transaction Logs</h2>
          <p className="text-sm text-gray-600 mt-1">
            View and export all transaction logs for inventory items including receiving, sales, and financial transactions
          </p>
        </div>
        <div className="flex items-center space-x-2">
          <button
            onClick={exportInventoryLogs}
            className="bg-green-600 text-white px-4 py-2 rounded-lg hover:bg-green-700 transition-colors flex items-center"
          >
            <FileSpreadsheet className="w-4 h-4 mr-2" />
            Export CSV
          </button>
        </div>
      </div>

      {/* Filters */}
      <div className="bg-white p-4 rounded-lg shadow-sm border">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          {/* Search */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">Search</label>
            <div className="relative">
              <Search className="w-4 h-4 absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400" />
              <input
                type="text"
                placeholder="Search products, suppliers, customers..."
                value={inventoryLogsSearchTerm}
                onChange={(e) => setInventoryLogsSearchTerm(e.target.value)}
                className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-blue-500 focus:border-blue-500"
              />
            </div>
          </div>

          {/* Product Filter */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">Product</label>
            <select
              value={inventoryLogsProductFilter}
              onChange={(e) => setInventoryLogsProductFilter(e.target.value)}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:ring-blue-500 focus:border-blue-500"
            >
              <option value="">All Products</option>
              {products.filter((p: any) => p).map((product: any) => (
                <option key={product.id} value={product.id}>{product.name}</option>
              ))}
            </select>
          </div>

          {/* Supplier Filter */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">Supplier</label>
            <select
              value={inventoryLogsSupplierFilter}
              onChange={(e) => setInventoryLogsSupplierFilter(e.target.value)}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:ring-blue-500 focus:border-blue-500"
            >
              <option value="">All Suppliers</option>
              {suppliers.map((supplier: any) => (
                <option key={supplier.id} value={supplier.id}>{supplier.name}</option>
              ))}
            </select>
          </div>

          {/* Date Filter */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">Date Range</label>
            <select
              value={inventoryLogsDateFilter}
              onChange={(e) => setInventoryLogsDateFilter(e.target.value as any)}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:ring-blue-500 focus:border-blue-500"
            >
              <option value="all">All Time</option>
              <option value="today">Today</option>
              <option value="week">This Week</option>
              <option value="month">This Month</option>
            </select>
          </div>
        </div>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <div className="bg-white p-4 rounded-lg shadow-sm border">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-600">Total Transactions</p>
              <p className="text-2xl font-bold text-gray-900">{filteredInventoryLogs.length}</p>
            </div>
            <div className="p-2 bg-blue-100 rounded-full">
              <Activity className="w-5 h-5 text-blue-600" />
            </div>
          </div>
        </div>

        <div className="bg-white p-4 rounded-lg shadow-sm border">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-600">Inventory Received</p>
              <p className="text-2xl font-bold text-green-600">
                {filteredInventoryLogs.filter((log: any) => log.type === 'inventory_received').length}
              </p>
            </div>
            <div className="p-2 bg-green-100 rounded-full">
              <Package className="w-5 h-5 text-green-600" />
            </div>
          </div>
        </div>

        <div className="bg-white p-4 rounded-lg shadow-sm border">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-600">Sales Transactions</p>
              <p className="text-2xl font-bold text-blue-600">
                {filteredInventoryLogs.filter((log: any) => log.type === 'sale').length}
              </p>
            </div>
            <div className="p-2 bg-blue-100 rounded-full">
              <ShoppingCart className="w-5 h-5 text-blue-600" />
            </div>
          </div>
        </div>

        <div className="bg-white p-4 rounded-lg shadow-sm border">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-600">Total Value</p>
              <p className="text-2xl font-bold text-purple-600">
                {formatCurrency(filteredInventoryLogs.reduce((sum: number, log: any) => sum + (log.amount || 0), 0))}
              </p>
            </div>
            <div className="p-2 bg-purple-100 rounded-full">
              <DollarSign className="w-5 h-5 text-purple-600" />
            </div>
          </div>
        </div>
      </div>

      {/* Transaction Logs Table */}
      <div className="bg-white rounded-lg shadow-sm border">
        <div className="p-6 border-b">
          <h3 className="text-lg font-semibold text-gray-900">Transaction Logs</h3>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase cursor-pointer hover:bg-gray-100" onClick={() => handleInventoryLogsSort('date')}>
                  <div className="flex items-center">
                    Date
                    {inventoryLogsSort === 'date' && (
                      <span className="ml-1">{inventoryLogsSortDir === 'asc' ? '↑' : '↓'}</span>
                    )}
                  </div>
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Type</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase cursor-pointer hover:bg-gray-100" onClick={() => handleInventoryLogsSort('product')}>
                  <div className="flex items-center">
                    Product
                    {inventoryLogsSort === 'product' && (
                      <span className="ml-1">{inventoryLogsSortDir === 'asc' ? '↑' : '↓'}</span>
                    )}
                  </div>
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase cursor-pointer hover:bg-gray-100" onClick={() => handleInventoryLogsSort('supplier')}>
                  <div className="flex items-center">
                    Supplier
                    {inventoryLogsSort === 'supplier' && (
                      <span className="ml-1">{inventoryLogsSortDir === 'asc' ? '↑' : '↓'}</span>
                    )}
                  </div>
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Customer</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Quantity/Weight</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase cursor-pointer hover:bg-gray-100" onClick={() => handleInventoryLogsSort('amount')}>
                  <div className="flex items-center">
                    Amount
                    {inventoryLogsSort === 'amount' && (
                      <span className="ml-1">{inventoryLogsSortDir === 'asc' ? '↑' : '↓'}</span>
                    )}
                  </div>
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Reference</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200">
              {pagedInventoryLogs.map((log: any) => (
                <tr key={log.id} className="hover:bg-gray-50">
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div className="text-sm text-gray-900">
                      {new Date(log.date).toLocaleDateString()}
                    </div>
                    <div className="text-xs text-gray-500">
                      {new Date(log.date).toLocaleTimeString()}
                    </div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <span
                      className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
                        log.type === 'inventory_received'
                          ? 'bg-green-100 text-green-800'
                          : log.type === 'sale'
                          ? 'bg-blue-100 text-blue-800'
                          : 'bg-gray-100 text-gray-800'
                      }`}
                    >
                      {log.type === 'inventory_received'
                        ? 'Received'
                        : log.type === 'sale'
                        ? 'Sale'
                        : log.type === 'financial'
                        ? 'Financial'
                        : log.type}
                    </span>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div className="text-sm font-medium text-gray-900">
                      {log.productName || 'N/A'}
                    </div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div className="text-sm text-gray-900">{log.supplierName || 'N/A'}</div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div className="text-sm text-gray-900">{log.customerName || 'N/A'}</div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div className="text-sm text-gray-900">
                      {log.quantity && `${log.quantity} ${log.unit || 'units'}`}
                      {log.weight && `${log.weight} kg`}
                      {!log.quantity && !log.weight && 'N/A'}
                    </div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div className="text-sm font-medium text-gray-900">
                      {log.amount
                        ? (formatCurrencyWithSymbol
                            ? formatCurrencyWithSymbol(log.amount, log.currency)
                            : formatCurrency(log.amount))
                        : 'N/A'}
                    </div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div className="text-sm text-gray-900">{log.reference || 'N/A'}</div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div className="flex items-center space-x-2">
                      {log.type === 'inventory_received' && (
                        <button
                          onClick={() => handleViewInventoryItemDetails(log)}
                          className="text-blue-600 hover:text-blue-900 text-sm font-medium"
                        >
                          <Eye className="w-4 h-4" />
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Pagination */}
        {inventoryLogsTotalPages > 1 && (
          <div className="px-6 py-4 border-t border-gray-200">
            <div className="flex items-center justify-between">
              <div className="text-sm text-gray-700">
                Showing {((inventoryLogsPage - 1) * inventoryLogsPerPage) + 1} to {Math.min(inventoryLogsPage * inventoryLogsPerPage, filteredInventoryLogs.length)} of {filteredInventoryLogs.length} results
              </div>
              <div className="flex items-center space-x-2">
                <button
                  onClick={() => setInventoryLogsPage(Math.max(1, inventoryLogsPage - 1))}
                  disabled={inventoryLogsPage === 1}
                  className="px-3 py-1 text-sm border border-gray-300 rounded-md hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  Previous
                </button>
                <span className="text-sm text-gray-700">Page {inventoryLogsPage} of {inventoryLogsTotalPages}</span>
                <button
                  onClick={() => setInventoryLogsPage(Math.min(inventoryLogsTotalPages, inventoryLogsPage + 1))}
                  disabled={inventoryLogsPage === inventoryLogsTotalPages}
                  className="px-3 py-1 text-sm border border-gray-300 rounded-md hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  Next
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
      
      {showSalesLogs && selectedInventoryLog && (
        <InventorySalesLogsModal
          selectedInventoryLog={selectedInventoryLog}
          setShowSalesLogs={setShowSalesLogs}
          processedSalesData={processedSalesData}
          formatCurrency={formatCurrency}
          onEditSale={undefined}
          onDeleteSale={undefined}
        />
      )}
    </div>
  );
}

function InventorySalesLogsModal({
  selectedInventoryLog,
  setShowSalesLogs,
  processedSalesData,
  formatCurrency,
  onEditSale,
  onDeleteSale
}: {
  selectedInventoryLog: any;
  setShowSalesLogs: (show: boolean) => void;
  processedSalesData: any[];
  formatCurrency: (amount: number) => string;
  onEditSale?: (sale: any) => void;
  onDeleteSale?: (sale: any) => void;
}) {
  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
      <div className="bg-white rounded-lg max-w-6xl w-full max-h-[90vh] flex flex-col">
        <div className="p-6 border-b flex-shrink-0">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-xl font-semibold text-gray-900">Sales Logs</h2>
              <p className="text-md text-gray-600 mt-1">{selectedInventoryLog.productName} - {selectedInventoryLog.supplierName}</p>
            </div>
            <button onClick={() => setShowSalesLogs(false)} className="text-gray-400 hover:text-gray-600">
              <X className="w-6 h-6" />
            </button>
          </div>
        </div>
        <div className="p-6 overflow-y-auto flex-1">
          <div className="mb-4">
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
              <div className="bg-blue-50 p-3 rounded-lg">
                <p className="text-sm text-blue-700">Total Sales</p>
                <p className="text-lg font-bold text-blue-900">{processedSalesData.length}</p>
              </div>
              <div className="bg-green-50 p-3 rounded-lg">
                <p className="text-sm text-green-700">Total Revenue</p>
                <p className="text-lg font-bold text-green-900">{formatCurrency(processedSalesData.reduce((sum, item) => sum + (item.totalPrice || 0), 0))}</p>
              </div>
              <div className="bg-purple-50 p-3 rounded-lg">
                <p className="text-sm text-purple-700">Sold Quantity</p>
                <p className="text-lg font-bold text-purple-900">{processedSalesData.reduce((sum, item) => sum + (item.quantity || 0), 0)} {selectedInventoryLog.unit}</p>
              </div>
              <div className="bg-orange-50 p-3 rounded-lg">
                <p className="text-sm text-orange-700">Avg Price</p>
                <p className="text-lg font-bold text-orange-900">{formatCurrency(processedSalesData.length > 0 ? processedSalesData.reduce((sum, item) => sum + (item.unitPrice || 0), 0) / processedSalesData.length : 0)}</p>
              </div>
            </div>
          </div>

          {processedSalesData.length > 0 ? (
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-gray-200">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Date</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Sale ID</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Customer</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Quantity</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Weight</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Unit Price</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Total Price</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Payment Method</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Actions</th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-200">
                  {processedSalesData.map((item: any, index: number) => (
                    <tr key={`${item.saleId}-${index}`} className="hover:bg-gray-50">
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="text-sm text-gray-900">{new Date(item.saleDate).toLocaleDateString()}</div>
                        <div className="text-xs text-gray-500">{new Date(item.saleDate).toLocaleTimeString()}</div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="text-sm font-medium text-gray-900 font-mono">{String(item.saleId).slice(-8).toUpperCase()}</div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="text-sm text-gray-900">{item.customerName}</div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="text-sm text-gray-900">{item.quantity} {selectedInventoryLog.unit}</div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="text-sm text-gray-900">{item.weight ? `${item.weight} kg` : '-'}</div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="text-sm text-gray-900">{formatCurrency(item.unitPrice || 0)}</div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="text-sm font-medium text-gray-900">{formatCurrency(item.totalPrice || 0)}</div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
                          item.paymentMethod === 'cash' ? 'bg-green-100 text-green-800' :
                          item.paymentMethod === 'card' ? 'bg-blue-100 text-blue-800' :
                          item.paymentMethod === 'credit' ? 'bg-yellow-100 text-yellow-800' : 'bg-gray-100 text-gray-800'
                        }`}>
                          {item.paymentMethod}
                        </span>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="flex items-center space-x-2">
                          {!!onEditSale && (
                            <button onClick={() => onEditSale({ ...item, id: item.id, quantity: item.quantity, weight: item.weight, unit_price: item.unitPrice, payment_method: item.paymentMethod, notes: item.notes })} className="text-blue-600 hover:text-blue-800 p-1 rounded hover:bg-blue-50 transition-colors" title="Edit Sale">
                              <Edit className="w-4 h-4" />
                            </button>
                          )}
                          {!!onDeleteSale && (
                            <button onClick={() => onDeleteSale({ ...item, id: item.id, saleId: item.saleId, customerName: item.customerName, totalPrice: (item.unitPrice || 0) * (item.quantity || 0) })} className="text-red-600 hover:text-red-800 p-1 rounded hover:bg-red-50 transition-colors" title="Delete Sale">
                              <Trash2 className="w-4 h-4" />
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="text-center py-12">
              <FileText className="w-16 h-16 text-gray-300 mx-auto mb-4" />
              <h3 className="text-lg font-medium text-gray-900 mb-2">No Sales Recorded</h3>
              <p className="text-gray-500 mb-4">No sales have been recorded for this inventory item yet.</p>
            </div>
          )}
        </div>
        <div className="px-6 py-4 border-t border-gray-200 flex justify-between flex-shrink-0">
          <div className="text-sm text-gray-500">Showing {processedSalesData.length} sale record{processedSalesData.length !== 1 ? 's' : ''}</div>
          <button onClick={() => setShowSalesLogs(false)} className="px-4 py-2 bg-gray-600 text-white rounded-lg hover:bg-gray-700 transition-colors">Close</button>
        </div>
      </div>
    </div>
  );
}
