import React, { useMemo, useState } from 'react';
import {
  Search,
  FileText,
  Activity,
  CheckCircle,
  DollarSign,
  RefreshCw,
  Trash2,
  AlertCircle,
  ChevronRight,
  X,
  Edit
} from 'lucide-react';
import { debugSalesData, validateSalesDataStructure, generateSalesDataReport } from '../../utils/salesDataDebugger';
import { cleanupAndValidateSaleItems } from '../../utils/cleanupSaleItemsData';

type ReceivedBillsProps = {
  inventory: any[];
  products: any[];
  suppliers: any[];
  sales: any[];
  customers: any[];
  formatCurrency: (amount: number) => string;
  showToast: (message: string, type?: 'success' | 'error') => void;
  onEditSale: (sale: any) => void;
  onDeleteSale: (sale: any) => void;
};

export default function ReceivedBills({
  inventory,
  products,
  suppliers,
  sales,
  customers,
  formatCurrency,
  showToast,
  onEditSale,
  onDeleteSale
}: ReceivedBillsProps) {
  const [receivedBillsSearchTerm, setReceivedBillsSearchTerm] = useState('');
  const [receivedBillsSupplierFilter, setReceivedBillsSupplierFilter] = useState('');
  const [receivedBillsProductFilter, setReceivedBillsProductFilter] = useState('');
  const [receivedBillsPage, setReceivedBillsPage] = useState(1);
  const [receivedBillsSort, setReceivedBillsSort] = useState<'date' | 'supplier' | 'product' | 'amount' | 'progress' | 'revenue' | 'status'>('date');
  const [receivedBillsSortDir, setReceivedBillsSortDir] = useState<'asc' | 'desc'>('desc');
  const [receivedBillsStatusFilter, setReceivedBillsStatusFilter] = useState<string>('all');
  const [selectedReceivedBill, setSelectedReceivedBill] = useState<any>(null);
  const [showReceivedBillDetails, setShowReceivedBillDetails] = useState(false);
  const [showReceivedBillSalesLogs, setShowReceivedBillSalesLogs] = useState(false);

  const getReceivedBills = useMemo(() => {
    const bills: any[] = [];
    try {
      const allInventoryItems = inventory.filter(item => item.product_id && item.supplier_id);
      allInventoryItems.forEach(item => {
        const product = products.find(p => p.id === item.product_id);
        const supplier = suppliers.find(s => s.id === item.supplier_id);
        if (!product || !supplier) return;

        const relatedSales = sales.filter((sale: any) =>
          sale &&
          sale.product_id === item.product_id &&
          sale.supplier_id === item.supplier_id &&
          new Date(sale.created_at).getTime() >= new Date(item.received_at || item.created_at).getTime()
        );

        let totalSoldQuantity = 0;
        let totalRevenue = 0;
        let saleCount = 0;
        const sortedSales = relatedSales.sort((a: any, b: any) =>
          new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
        );
        let totalSoldFromThisItem = 0;
        for (const sale of sortedSales) {
          if (
            sale &&
            sale.product_id === item.product_id &&
            sale.supplier_id === item.supplier_id &&
            typeof sale.quantity === 'number' &&
            typeof sale.unit_price === 'number'
          ) {
            totalSoldFromThisItem += sale.quantity;
            totalRevenue += sale.unit_price * sale.quantity;
            saleCount++;
          }
        }

        let originalReceivedQuantity = 0;
        if (item.received_quantity !== null && item.received_quantity !== undefined && item.received_quantity > 0) {
          originalReceivedQuantity = item.received_quantity;
        } else {
          originalReceivedQuantity = item.quantity + totalSoldFromThisItem;
        }
        const remainingQuantity = item.quantity;

        const avgUnitPrice = totalSoldFromThisItem > 0 ? totalRevenue / totalSoldFromThisItem : (item.price || 0);
        const estimatedTotalValue = originalReceivedQuantity * avgUnitPrice;
        const soldFromThisItem = Math.max(originalReceivedQuantity - remainingQuantity, 0);
        const progress = originalReceivedQuantity > 0 ? (soldFromThisItem / originalReceivedQuantity) * 100 : 0;

        const validOriginalQuantity = Math.max(originalReceivedQuantity, 0);
        const validSoldQuantity = Math.max(totalSoldFromThisItem, 0);
        const validRemainingQuantity = Math.max(remainingQuantity, 0);
        const validProgress = isNaN(progress) || !isFinite(progress) ? 0 : Math.max(0, Math.min(100, progress));

        let status = 'pending';
        if (progress >= 100) status = 'completed';
        else if (progress >= 75) status = 'nearly-complete';
        else if (progress >= 50) status = 'halfway';
        else if (progress > 0) status = 'in-progress';

        const totalCost = item.type === 'commission'
          ? (item.porterage || 0) + (item.transfer_fee || 0)
          : (item.price || 0) * originalReceivedQuantity;
        const totalProfit = totalRevenue - totalCost;

        bills.push({
          id: item.id,
          productId: item.product_id,
          productName: product.name,
          supplierId: item.supplier_id,
          supplierName: supplier.name,
          type: item.type,
          originalQuantity: validOriginalQuantity,
          remainingQuantity: validRemainingQuantity,
          totalSoldQuantity: validSoldQuantity,
          totalRevenue,
          totalCost,
          totalProfit,
          avgUnitPrice,
          estimatedTotalValue,
          progress: validProgress,
          status,
          saleCount,
          receivedAt: item.received_at || item.created_at,
          receivedBy: item.received_by,
          notes: item.notes,
          unit: item.unit,
          weight: item.weight,
          porterage: item.porterage,
          transferFee: item.transfer_fee,
          price: item.price,
          commissionRate: item.commission_rate,
          relatedSales: sortedSales
        });
      });
    } catch (error) {
      console.error('Error processing received bills:', error);
      showToast('Error processing received bills data', 'error');
    }
    return bills;
  }, [inventory, products, suppliers, sales, showToast]);

  const filteredReceivedBills = useMemo(() => {
    try {
      let filtered = getReceivedBills;
      if (receivedBillsSearchTerm) {
        const searchLower = receivedBillsSearchTerm.toLowerCase();
        filtered = filtered.filter(bill =>
          bill.productName.toLowerCase().includes(searchLower) ||
          bill.supplierName.toLowerCase().includes(searchLower) ||
          bill.type.toLowerCase().includes(searchLower)
        );
      }
      if (receivedBillsSupplierFilter) {
        filtered = filtered.filter(bill => bill.supplierId === receivedBillsSupplierFilter);
      }
      if (receivedBillsProductFilter) {
        filtered = filtered.filter(bill => bill.productId === receivedBillsProductFilter);
      }
      if (receivedBillsStatusFilter !== 'all') {
        filtered = filtered.filter(bill => bill.status === receivedBillsStatusFilter);
      }
      filtered.sort((a, b) => {
        let aValue: any, bValue: any;
        switch (receivedBillsSort) {
          case 'date':
            aValue = new Date(a.receivedAt).getTime();
            bValue = new Date(b.receivedAt).getTime();
            break;
          case 'supplier':
            aValue = a.supplierName.toLowerCase();
            bValue = b.supplierName.toLowerCase();
            break;
          case 'product':
            aValue = a.productName.toLowerCase();
            bValue = b.productName.toLowerCase();
            break;
          case 'amount':
            aValue = a.estimatedTotalValue;
            bValue = b.estimatedTotalValue;
            break;
          case 'progress':
            aValue = a.progress;
            bValue = b.progress;
            break;
          case 'revenue':
            aValue = a.totalRevenue;
            bValue = b.totalRevenue;
            break;
          case 'status':
            aValue = a.status;
            bValue = b.status;
            break;
          default:
            aValue = new Date(a.receivedAt).getTime();
            bValue = new Date(b.receivedAt).getTime();
        }
        if (receivedBillsSortDir === 'asc') {
          return aValue > bValue ? 1 : -1;
        } else {
          return aValue < bValue ? 1 : -1;
        }
      });
      return filtered;
    } catch (error) {
      console.error('Error filtering received bills:', error);
      return [];
    }
  }, [getReceivedBills, receivedBillsSearchTerm, receivedBillsSupplierFilter, receivedBillsProductFilter, receivedBillsStatusFilter, receivedBillsSort, receivedBillsSortDir]);

  const paginatedReceivedBills = useMemo(() => {
    const itemsPerPage = 10;
    const startIndex = (receivedBillsPage - 1) * itemsPerPage;
    const endIndex = startIndex + itemsPerPage;
    return filteredReceivedBills.slice(startIndex, endIndex);
  }, [filteredReceivedBills, receivedBillsPage]);

  const totalReceivedBillsPages = Math.ceil(filteredReceivedBills.length / 10);

  const handleReceivedBillsSort = (sort: 'date' | 'supplier' | 'product' | 'amount' | 'progress' | 'revenue' | 'status') => {
    if (receivedBillsSort === sort) {
      setReceivedBillsSortDir(receivedBillsSortDir === 'asc' ? 'desc' : 'asc');
    } else {
      setReceivedBillsSort(sort);
      setReceivedBillsSortDir('desc');
    }
  };

  const handleViewReceivedBillDetails = (bill: any) => {
    setSelectedReceivedBill(bill);
    setShowReceivedBillDetails(true);
  };

  const handleViewReceivedBillSalesLogs = (bill: any) => {
    setSelectedReceivedBill(bill);
    setShowReceivedBillSalesLogs(true);
  };

  const exportReceivedBills = () => {
    try {
      const headers = [
        'Date', 'Product', 'Supplier', 'Type', 'Original Qty', 'Remaining Qty', 
        'Sold Qty', 'Progress %', 'Revenue', 'Cost', 'Profit', 'Status', 'Unit Price'
      ];
      const csvContent = [
        headers.join(','),
        ...filteredReceivedBills.map(bill => [
          new Date(bill.receivedAt).toLocaleDateString(),
          `"${bill.productName}"`,
          `"${bill.supplierName}"`,
          bill.type,
          bill.originalQuantity,
          bill.remainingQuantity,
          bill.totalSoldQuantity,
          `${bill.progress.toFixed(1)}%`,
          bill.totalRevenue.toFixed(2),
          bill.totalCost.toFixed(2),
          bill.totalProfit.toFixed(2),
          bill.status,
          bill.avgUnitPrice.toFixed(2)
        ].join(','))
      ].join('\n');

      const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
      const link = document.createElement('a');
      const url = URL.createObjectURL(blob);
      link.setAttribute('href', url);
      link.setAttribute('download', `received-bills-${new Date().toISOString().split('T')[0]}.csv`);
      link.style.visibility = 'hidden';
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);

      showToast('Received bills exported successfully', 'success');
    } catch (error) {
      console.error('Error exporting received bills:', error);
      showToast('Error exporting received bills', 'error');
    }
  };

  const getStatusBadge = (status: string) => {
    const statusConfig: Record<string, { color: string; icon: any }> = {
      'pending': { color: 'bg-gray-100 text-gray-800', icon: ClockIcon },
      'in-progress': { color: 'bg-blue-100 text-blue-800', icon: Activity },
      'halfway': { color: 'bg-yellow-100 text-yellow-800', icon: TrendingUpIcon },
      'nearly-complete': { color: 'bg-orange-100 text-orange-800', icon: TargetIcon },
      'completed': { color: 'bg-green-100 text-green-800', icon: CheckCircle }
    };
    const config = statusConfig[status] || statusConfig['pending'];
    const IconComponent = config.icon;
    return (
      <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${config.color}`}>
        <IconComponent className="w-3 h-3 mr-1" />
        {status.replace('-', ' ')}
      </span>
    );
  };

  const updateInventoryItemsWithReceivedQuantity = async () => {
    try {
      const itemsToUpdate = inventory.filter(item => 
        item.received_quantity === null || item.received_quantity === undefined || item.received_quantity === 0
      );
      if (itemsToUpdate.length > 0) {
        showToast(`Found ${itemsToUpdate.length} items that need received_quantity field. Please add new inventory items to see proper progress tracking.`, 'error');
      } else {
        showToast('All inventory items have received_quantity field set!', 'success');
      }
    } catch (error) {
      console.error('Error checking inventory items:', error);
      showToast('Error checking inventory items', 'error');
    }
  };

  const debugSalesDataIssues = () => {
    try {
      const report = generateSalesDataReport(inventory, sales, products, suppliers);
      const validation = validateSalesDataStructure(sales);
      showToast(`Debug complete: ${report.itemsWithSales}/${report.totalInventoryItems} items have sales. Check console for details.`, 'success');
      console.log('📋 Sales Data Debug Summary:', report, validation);
    } catch (error) {
      console.error('Error during sales data debug:', error);
      showToast('Error during debug analysis. Check console for details.', 'error');
    }
  };

  const cleanupSaleItemsData = async () => {
    try {
      showToast('Cleaning up sale_items data...', 'success');
      const result = await cleanupAndValidateSaleItems();
      const { cleanup, validation } = result;
      if (cleanup.recordsCleaned > 0) {
        showToast(`Cleanup complete: ${cleanup.recordsCleaned} records fixed. Check console for details.`, 'success');
      } else if (validation.issues.length > 0) {
        showToast(`Validation found ${validation.issues.length} issues. Check console for details.`, 'error');
      } else {
        showToast('All sale_items data is clean and valid!', 'success');
      }
    } catch (error) {
      console.error('Error during sale_items cleanup:', error);
      showToast('Error during cleanup. Check console for details.', 'error');
    }
  };

  return (
    <div className="space-y-0">
      <div className="flex justify-between items-center">
        <div>
          <h2 className="text-xl font-semibold text-gray-900">Received Bills</h2>
          <p className="text-sm text-gray-600 mt-1">Track all received inventory items and their sales progress from point of sale</p>
          {(() => {
            const problematicItems = inventory.filter(item => item.received_quantity === null || item.received_quantity === undefined || item.received_quantity === 0);
            return problematicItems.length > 0 ? (
              <div className="mt-2 p-2 bg-yellow-50 border border-yellow-200 rounded-lg">
                <p className="text-xs text-yellow-800">⚠️ {problematicItems.length} inventory item(s) don't have received_quantity set. Click "Fix Data" to check, or add new inventory items for proper progress tracking.</p>
              </div>
            ) : null;
          })()}
        </div>
        <div className="flex items-center space-x-2">
          <button onClick={cleanupSaleItemsData} className="bg-red-600 text-white px-4 py-2 rounded-lg hover:bg-red-700 transition-colors flex items-center" title="Clean up sale_items data structure issues - fixes sync errors">
            <Trash2 className="w-4 h-4 mr-2" />
            Fix Sync
          </button>
          <button onClick={debugSalesDataIssues} className="bg-purple-600 text-white px-4 py-2 rounded-lg hover:bg-purple-700 transition-colors flex items-center" title="Debug sales data issues - check console for detailed analysis">
            <AlertCircle className="w-4 h-4 mr-2" />
            Debug Sales
          </button>
          <button onClick={updateInventoryItemsWithReceivedQuantity} className="bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 transition-colors flex items-center">
            <RefreshCw className="w-4 h-4 mr-2" />
            Fix Data
          </button>
          <button onClick={exportReceivedBills} className="bg-green-600 text-white px-4 py-2 rounded-lg hover:bg-green-700 transition-colors flex items-center">
            <FileText className="w-4 h-4 mr-2" />
            Export CSV
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <div className="bg-white p-4 rounded-lg shadow-sm border">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-600">Total Bills</p>
              <p className="text-2xl font-bold text-gray-900">{filteredReceivedBills.length}</p>
            </div>
            <div className="p-2 bg-blue-100 rounded-full">
              <FileText className="w-5 h-5 text-blue-600" />
            </div>
          </div>
        </div>
        <div className="bg-white p-4 rounded-lg shadow-sm border">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-600">In Progress</p>
              <p className="text-2xl font-bold text-blue-600">{filteredReceivedBills.filter(bill => bill.status === 'in-progress').length}</p>
            </div>
            <div className="p-2 bg-blue-100 rounded-full">
              <Activity className="w-5 h-5 text-blue-600" />
            </div>
          </div>
        </div>
        <div className="bg-white p-4 rounded-lg shadow-sm border">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-600">Completed</p>
              <p className="text-2xl font-bold text-green-600">{filteredReceivedBills.filter(bill => bill.status === 'completed').length}</p>
            </div>
            <div className="p-2 bg-green-100 rounded-full">
              <CheckCircle className="w-5 h-5 text-green-600" />
            </div>
          </div>
        </div>
        <div className="bg-white p-4 rounded-lg shadow-sm border">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-600">Total Revenue</p>
              <p className="text-2xl font-bold text-green-600">{formatCurrency(filteredReceivedBills.reduce((sum, bill) => sum + bill.totalRevenue, 0))}</p>
            </div>
            <div className="p-2 bg-green-100 rounded-full">
              <DollarSign className="w-5 h-5 text-green-600" />
            </div>
          </div>
        </div>
      </div>

      <div className="bg-white p-4 rounded-lg shadow-sm border">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">Search</label>
            <div className="relative">
              <Search className="w-4 h-4 absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400" />
              <input
                type="text"
                placeholder="Search products, suppliers..."
                value={receivedBillsSearchTerm}
                onChange={(e) => setReceivedBillsSearchTerm(e.target.value)}
                className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-blue-500 focus:border-blue-500"
              />
            </div>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">Product</label>
            <select value={receivedBillsProductFilter} onChange={(e) => setReceivedBillsProductFilter(e.target.value)} className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:ring-blue-500 focus:border-blue-500">
              <option value="">All Products</option>
              {products.filter(p => p).map(product => (
                <option key={product.id} value={product.id}>{product.name}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">Supplier</label>
            <select value={receivedBillsSupplierFilter} onChange={(e) => setReceivedBillsSupplierFilter(e.target.value)} className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:ring-blue-500 focus:border-blue-500">
              <option value="">All Suppliers</option>
              {suppliers.map(supplier => (
                <option key={supplier.id} value={supplier.id}>{supplier.name}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">Status</label>
            <select value={receivedBillsStatusFilter} onChange={(e) => setReceivedBillsStatusFilter(e.target.value)} className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:ring-blue-500 focus:border-blue-500">
              <option value="all">All Status</option>
              <option value="pending">Pending</option>
              <option value="in-progress">In Progress</option>
              <option value="halfway">Halfway</option>
              <option value="nearly-complete">Nearly Complete</option>
              <option value="completed">Completed</option>
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">Type</label>
            <select value={receivedBillsStatusFilter} onChange={(e) => setReceivedBillsStatusFilter(e.target.value)} className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:ring-blue-500 focus:border-blue-500">
              <option value="all">All Types</option>
              <option value="commission">Commission</option>
              <option value="cash">Cash</option>
            </select>
          </div>
        </div>
      </div>

      <div className="bg-white rounded-lg shadow-sm border overflow-hidden">
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  <button onClick={() => handleReceivedBillsSort('date')} className="flex items-center space-x-1 hover:text-gray-700">
                    <span>Date</span>
                    {receivedBillsSort === 'date' && (receivedBillsSortDir === 'asc' ? <ChevronRight className="w-4 h-4" /> : <ChevronRight className="w-4 h-4 rotate-180" />)}
                  </button>
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  <button onClick={() => handleReceivedBillsSort('product')} className="flex items-center space-x-1 hover:text-gray-700">
                    <span>Product</span>
                    {receivedBillsSort === 'product' && (receivedBillsSortDir === 'asc' ? <ChevronRight className="w-4 h-4" /> : <ChevronRight className="w-4 h-4 rotate-180" />)}
                  </button>
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  <button onClick={() => handleReceivedBillsSort('supplier')} className="flex items-center space-x-1 hover:text-gray-700">
                    <span>Supplier</span>
                    {receivedBillsSort === 'supplier' && (receivedBillsSortDir === 'asc' ? <ChevronRight className="w-4 h-4" /> : <ChevronRight className="w-4 h-4 rotate-180" />)}
                  </button>
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Type</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Quantity</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  <button onClick={() => handleReceivedBillsSort('progress')} className="flex items-center space-x-1 hover:text-gray-700">
                    <span>Progress</span>
                    {receivedBillsSort === 'progress' && (receivedBillsSortDir === 'asc' ? <ChevronRight className="w-4 h-4" /> : <ChevronRight className="w-4 h-4 rotate-180" />)}
                  </button>
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  <button onClick={() => handleReceivedBillsSort('revenue')} className="flex items-center space-x-1 hover:text-gray-700">
                    <span>Revenue</span>
                    {receivedBillsSort === 'revenue' && (receivedBillsSortDir === 'asc' ? <ChevronRight className="w-4 h-4" /> : <ChevronRight className="w-4 h-4 rotate-180" />)}
                  </button>
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Status</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Actions</th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {paginatedReceivedBills.map((bill) => (
                <tr key={bill.id} className="hover:bg-gray-50">
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div className="text-sm text-gray-900">{new Date(bill.receivedAt).toLocaleDateString()}</div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div className="text-sm font-medium text-gray-900">{bill.productName}</div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div className="text-sm text-gray-900">{bill.supplierName}</div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${bill.type === 'commission' ? 'bg-purple-100 text-purple-800' : 'bg-green-100 text-green-800'}`}>
                      {bill.type}
                    </span>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div className="text-sm text-gray-900">
                      <div>Original: {bill.originalQuantity} {bill.unit}</div>
                      <div>Remaining: {bill.remainingQuantity} {bill.unit}</div>
                    </div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div className="flex items-center">
                      <div className="w-32 bg-gray-200 rounded-full h-2 mr-2">
                        <div className="bg-blue-600 h-2 rounded-full" style={{ width: `${bill.progress}%` }}></div>
                      </div>
                      <span className="text-sm text-gray-900">{bill.progress.toFixed(1)}%</span>
                    </div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div className="text-sm font-medium text-gray-900">{formatCurrency(bill.totalRevenue)}</div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">{getStatusBadge(bill.status)}</td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => handleViewReceivedBillDetails(bill)}
                        className="inline-flex items-center gap-1.5 px-2.5 py-1 border border-gray-200 rounded-md text-xs font-medium text-gray-700 hover:bg-gray-50 hover:border-gray-300 transition-colors"
                        aria-label="View details"
                      >
                        <FileText className="w-3.5 h-3.5 text-gray-500" />
                        <span>Details</span>
                      </button>
                      <button
                        onClick={() => handleViewReceivedBillSalesLogs(bill)}
                        className="inline-flex items-center gap-1.5 px-2.5 py-1 border border-gray-200 rounded-md text-xs font-medium text-gray-700 hover:bg-gray-50 hover:border-gray-300 transition-colors"
                        aria-label="View sales logs"
                      >
                        <Activity className="w-3.5 h-3.5 text-gray-500" />
                        <span>Sales Logs</span>
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {totalReceivedBillsPages > 1 && (
          <div className="px-6 py-4 border-t border-gray-200 flex items-center justify-between">
            <div className="text-sm text-gray-700">
              Showing {((receivedBillsPage - 1) * 10) + 1} to {Math.min(receivedBillsPage * 10, filteredReceivedBills.length)} of {filteredReceivedBills.length} results
            </div>
            <div className="flex items-center space-x-2">
              <button onClick={() => setReceivedBillsPage(Math.max(1, receivedBillsPage - 1))} disabled={receivedBillsPage === 1} className="px-3 py-1 text-sm border border-gray-300 rounded-md hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed">Previous</button>
              <span className="text-sm text-gray-700">Page {receivedBillsPage} of {totalReceivedBillsPages}</span>
              <button onClick={() => setReceivedBillsPage(Math.min(totalReceivedBillsPages, receivedBillsPage + 1))} disabled={receivedBillsPage === totalReceivedBillsPages} className="px-3 py-1 text-sm border border-gray-300 rounded-md hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed">Next</button>
            </div>
          </div>
        )}
      </div>

      {showReceivedBillDetails && selectedReceivedBill && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-lg max-w-4xl w-full max-h-[90vh] overflow-y-auto">
            <div className="p-6 border-b">
              <div className="flex items-center justify-between">
                <h2 className="text-xl font-semibold text-gray-900">Received Bill Details</h2>
                <button onClick={() => setShowReceivedBillDetails(false)} className="text-gray-400 hover:text-gray-600">
                  <X className="w-6 h-6" />
                </button>
              </div>
            </div>
            <div className="p-6">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div>
                  <h3 className="text-lg font-medium text-gray-900 mb-4">Basic Information</h3>
                  <div className="space-y-3">
                    <div>
                      <label className="block text-sm font-medium text-gray-700">Product</label>
                      <p className="text-sm text-gray-900">{selectedReceivedBill.productName}</p>
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700">Supplier</label>
                      <p className="text-sm text-gray-900">{selectedReceivedBill.supplierName}</p>
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700">Type</label>
                      <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${selectedReceivedBill.type === 'commission' ? 'bg-purple-100 text-purple-800' : 'bg-green-100 text-green-800'}`}>
                        {selectedReceivedBill.type}
                      </span>
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700">Received Date</label>
                      <p className="text-sm text-gray-900">{new Date(selectedReceivedBill.receivedAt).toLocaleDateString()}</p>
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700">Received By</label>
                      <p className="text-sm text-gray-900">{selectedReceivedBill.receivedBy}</p>
                    </div>
                  </div>
                </div>
                <div>
                  <h3 className="text-lg font-medium text-gray-900 mb-4">Quantity & Progress</h3>
                  <div className="space-y-3">
                    <div>
                      <label className="block text-sm font-medium text-gray-700">Original Quantity</label>
                      <p className="text-sm text-gray-900">{selectedReceivedBill.originalQuantity} {selectedReceivedBill.unit}</p>
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700">Remaining Quantity</label>
                      <p className="text-sm text-gray-900">{selectedReceivedBill.remainingQuantity} {selectedReceivedBill.unit}</p>
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700">Sold Quantity</label>
                      <p className="text-sm text-gray-900">{selectedReceivedBill.totalSoldQuantity} {selectedReceivedBill.unit}</p>
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700">Progress</label>
                      <div className="flex items-center mt-1">
                        <div className="w-full bg-gray-200 rounded-full h-2 mr-2">
                          <div className="bg-blue-600 h-2 rounded-full" style={{ width: `${selectedReceivedBill.progress}%` }}></div>
                        </div>
                        <span className="text-sm text-gray-900">{selectedReceivedBill.progress.toFixed(1)}%</span>
                      </div>
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700">Status</label>
                      <div className="mt-1">{getStatusBadge(selectedReceivedBill.status)}</div>
                    </div>
                  </div>
                </div>
              </div>
              <div className="mt-6">
                <h3 className="text-lg font-medium text-gray-900 mb-4">Financial Information</h3>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <div className="bg-green-50 p-4 rounded-lg">
                    <label className="block text-sm font-medium text-green-700">Total Revenue</label>
                    <p className="text-2xl font-bold text-green-900">{formatCurrency(selectedReceivedBill.totalRevenue)}</p>
                  </div>
                  <div className="bg-red-50 p-4 rounded-lg">
                    <label className="block text-sm font-medium text-red-700">Total Cost</label>
                    <p className="text-2xl font-bold text-red-900">{formatCurrency(selectedReceivedBill.totalCost)}</p>
                  </div>
                  <div className="bg-blue-50 p-4 rounded-lg">
                    <label className="block text-sm font-medium text-blue-700">Total Profit</label>
                    <p className="text-2xl font-bold text-blue-900">{formatCurrency(selectedReceivedBill.totalProfit)}</p>
                  </div>
                </div>
              </div>
              {selectedReceivedBill.type === 'commission' && (
                <div className="mt-6">
                  <h3 className="text-lg font-medium text-gray-900 mb-4">Commission Details</h3>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-medium text-gray-700">Porterage</label>
                      <p className="text-sm text-gray-900">{formatCurrency(selectedReceivedBill.porterage || 0)}</p>
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700">Transfer Fee</label>
                      <p className="text-sm text-gray-900">{formatCurrency(selectedReceivedBill.transferFee || 0)}</p>
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700">Commission Rate</label>
                      <p className="text-sm text-gray-900">{selectedReceivedBill.commissionRate ? `${selectedReceivedBill.commissionRate}%` : 'N/A'}</p>
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700">Average Unit Price</label>
                      <p className="text-sm text-gray-900">{formatCurrency(selectedReceivedBill.avgUnitPrice)}</p>
                    </div>
                  </div>
                </div>
              )}
              {selectedReceivedBill.notes && (
                <div className="mt-6">
                  <h3 className="text-lg font-medium text-gray-900 mb-4">Notes</h3>
                  <p className="text-sm text-gray-900 bg-gray-50 p-3 rounded-lg">{selectedReceivedBill.notes}</p>
                </div>
              )}
            </div>
            <div className="px-6 py-4 border-t border-gray-200 flex justify-end space-x-3">
              <button onClick={() => handleViewReceivedBillSalesLogs(selectedReceivedBill)} className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors">View Sales Logs</button>
              <button onClick={() => setShowReceivedBillDetails(false)} className="px-4 py-2 bg-gray-600 text-white rounded-lg hover:bg-gray-700 transition-colors">Close</button>
            </div>
          </div>
        </div>
      )}

      {showReceivedBillSalesLogs && selectedReceivedBill && (
        <ReceivedBillSalesLogsModal
          selectedReceivedBill={selectedReceivedBill}
          setShowReceivedBillSalesLogs={setShowReceivedBillSalesLogs}
          sales={sales}
          customers={customers}
          formatCurrency={formatCurrency}
          onEditSale={onEditSale}
          onDeleteSale={onDeleteSale}
        />
      )}
    </div>
  );
}

function ReceivedBillSalesLogsModal({ 
  selectedReceivedBill, 
  setShowReceivedBillSalesLogs, 
  sales, 
  customers, 
  formatCurrency,
  onEditSale,
  onDeleteSale
}: {
  selectedReceivedBill: any;
  setShowReceivedBillSalesLogs: (show: boolean) => void;
  sales: any[];
  customers: any[];
  formatCurrency: (amount: number) => string;
  onEditSale: (sale: any) => void;
  onDeleteSale: (sale: any) => void;
}) {
  const processedSalesData = useMemo(() => {
    if (!selectedReceivedBill.relatedSales || !Array.isArray(selectedReceivedBill.relatedSales)) {
      return [];
    }
    const salesDetails: any[] = [];
    const matchingSales = sales.filter((sale: any) => sale.inventory_item_id === selectedReceivedBill.id);
    matchingSales.forEach((sale: any) => {
      salesDetails.push({
        ...sale,
        saleId: sale.id,
        saleDate: sale.created_at,
        customerId: sale.customer_id,
        customerName: customers.find(c => c.id === sale.customer_id)?.name || 'Walk-in Customer',
        quantity: sale.quantity || 1,
        weight: sale.weight,
        unitPrice: sale.unit_price,
        receivedValue: sale.received_value,
        paymentMethod: sale.payment_method || 'cash',
        notes: sale.notes,
        productName: selectedReceivedBill.productName,
        supplierName: selectedReceivedBill.supplierName
      });
    });
    return salesDetails.sort((a, b) => new Date(b.saleDate).getTime() - new Date(a.saleDate).getTime());
  }, [selectedReceivedBill, sales, customers]);

  const hasInvalidSalesLines = useMemo(() => {
    return processedSalesData.some((item: any) => {
      const invalidQuantity =  selectedReceivedBill.originalQuantity     >selectedReceivedBill.totalSoldQuantity;
      const invalidPrice = !item.unitPrice || item.unitPrice <= 0;
      return invalidQuantity || invalidPrice;
      
    });
  }, [processedSalesData]);

  const exportSelectedBill = () => {
    
    try {
      const billHeaders = [
        'Product', 'Supplier', 'Type', 'Original Qty', 'Remaining Qty', 'Sold Qty', 'Progress %',
        'Revenue', 'Cost', 'Profit', 'Status', 'Avg Unit Price', 'Received Date'
      ];
      const billRow = [
        `"${selectedReceivedBill.productName}"`,
        `"${selectedReceivedBill.supplierName}"`,
        selectedReceivedBill.type,
        selectedReceivedBill.originalQuantity,
        selectedReceivedBill.remainingQuantity,
        selectedReceivedBill.totalSoldQuantity,
        `${selectedReceivedBill.progress.toFixed(1)}%`,
        (selectedReceivedBill.totalRevenue || 0).toFixed(2),
        (selectedReceivedBill.totalCost || 0).toFixed(2),
        (selectedReceivedBill.totalProfit || 0).toFixed(2),
        selectedReceivedBill.status,
        (selectedReceivedBill.avgUnitPrice || 0).toFixed(2),
        new Date(selectedReceivedBill.receivedAt).toLocaleString()
      ];

      const salesHeader = ['Date', 'Customer', 'Quantity', 'Weight', 'Unit Price', 'Total Price', 'Payment Method', 'Notes'];
      const salesRows = processedSalesData.map((s: any) => [
        new Date(s.saleDate).toLocaleString(),
        `"${s.customerName}"`,
        s.quantity ?? '',
        s.weight ?? '',
        (s.unitPrice ?? 0).toFixed(2),
        (s.totalPrice ?? (s.unitPrice || 0) * (s.quantity || 0)).toFixed(2),
        s.paymentMethod ?? '',
        s.notes ? `"${String(s.notes).replace(/\"/g, '""')}"` : ''
      ].join(','));

      const csvContent = [
        billHeaders.join(','),
        billRow.join(','),
        '',
        'Sales Lines',
        salesHeader.join(','),
        ...salesRows
      ].join('\n');

      const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
      const link = document.createElement('a');
      const url = URL.createObjectURL(blob);
      link.setAttribute('href', url);
      const safeProduct = String(selectedReceivedBill.productName || '').replace(/[^a-z0-9]+/gi, '-').toLowerCase();
      const safeSupplier = String(selectedReceivedBill.supplierName || '').replace(/[^a-z0-9]+/gi, '-').toLowerCase();
      link.setAttribute('download', `received-bill-${safeProduct}-${safeSupplier}.csv`);
      link.style.visibility = 'hidden';
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    } catch (error) {
      console.error('Error exporting selected bill:', error);
    }
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
      <div className="bg-white rounded-lg max-w-6xl w-full max-h-[90vh] flex flex-col">
        <div className="p-6 border-b flex-shrink-0">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-xl font-semibold text-gray-900">Sales Logs</h2>
              <p className="text-md text-gray-600 mt-1">{selectedReceivedBill.productName} - {selectedReceivedBill.supplierName}</p>
            </div>
            <button onClick={() => setShowReceivedBillSalesLogs(false)} className="text-gray-400 hover:text-gray-600">
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
                <p className="text-lg font-bold text-purple-900">{processedSalesData.reduce((sum, item) => sum + (item.quantity || 0), 0)} {selectedReceivedBill.unit}</p>
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
                  {processedSalesData.map((item, index) => (
                    <tr key={`${item.saleId}-${index}`} className="hover:bg-gray-50">
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="text-sm text-gray-900">{new Date(item.saleDate).toLocaleDateString()}</div>
                        <div className="text-xs text-gray-500">{new Date(item.saleDate).toLocaleTimeString()}</div>
                      </td>
                    
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="text-sm text-gray-900">{item.customerName}</div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="text-sm text-gray-900">{item.quantity} {selectedReceivedBill.unit}</div>
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
                        <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${item.paymentMethod === 'cash' ? 'bg-green-100 text-green-800' : item.paymentMethod === 'card' ? 'bg-blue-100 text-blue-800' : item.paymentMethod === 'credit' ? 'bg-yellow-100 text-yellow-800' : 'bg-gray-100 text-gray-800'}`}>
                          {item.paymentMethod}
                        </span>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="flex items-center space-x-2">
                          <button onClick={() => onEditSale({ ...item, id: item.id, quantity: item.quantity, weight: item.weight, unit_price: item.unitPrice, payment_method: item.paymentMethod, notes: item.notes })} className="text-blue-600 hover:text-blue-800 p-1 rounded hover:bg-blue-50 transition-colors" title="Edit Sale">
                            <Edit className="w-4 h-4" />
                          </button>
                          <button onClick={() => onDeleteSale({ ...item, id: item.id, saleId: item.saleId, customerName: item.customerName, totalPrice: item.unitPrice * item.quantity })} className="text-red-600 hover:text-red-800 p-1 rounded hover:bg-red-50 transition-colors" title="Delete Sale">
                            <Trash2 className="w-4 h-4" />
                          </button>
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
        <div className="px-6 py-4 border-t border-gray-200 flex justify-between items-center flex-shrink-0">
          <div className="text-sm text-gray-500">Showing {processedSalesData.length} sale record{processedSalesData.length !== 1 ? 's' : ''}</div>
          <div className="flex items-center gap-2">
          <button
              onClick={exportSelectedBill}
              disabled={hasInvalidSalesLines}
              className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              title={hasInvalidSalesLines ? 'Cannot close bill: missing quantity or non-priced item(s) present' : 'Export this received bill'}
            >
              {'Export Bill' }
            </button>
            <button
              onClick={exportSelectedBill}
              disabled={hasInvalidSalesLines}
              className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              title={hasInvalidSalesLines ? 'Cannot close bill: missing quantity or non-priced item(s) present' : 'Export this received bill'}
            >
              {hasInvalidSalesLines ? 'Close Bill' : ''}
            </button>
            
            <button onClick={() => setShowReceivedBillSalesLogs(false)} className="px-4 py-2 bg-gray-600 text-white rounded-lg hover:bg-gray-700 transition-colors">Close</button>
          </div>
        </div>
      </div>
    </div>
  );
}

// Fallback icons used in status badge for decoupling from Accounting imports
function ClockIcon(props: any) { return <svg {...props} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"></circle><polyline points="12 6 12 12 16 14"></polyline></svg>; }
function TrendingUpIcon(props: any) { return <svg {...props} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="23 6 13.5 15.5 8.5 10.5 1 18"></polyline><polyline points="17 6 23 6 23 12"></polyline></svg>; }
function TargetIcon(props: any) { return <svg {...props} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"></circle><circle cx="12" cy="12" r="6"></circle><circle cx="12" cy="12" r="2"></circle></svg>; }

