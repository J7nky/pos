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
  Edit,
  Scale
} from 'lucide-react';
import WeightComparisonReport from '../../WeightComparisonReport';

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
  onUpdateBatch?: (batchId: string, updates: { porterage?: number | null; transfer_fee?: number | null; notes?: string | null }) => Promise<void>;
  onApplyBatchCommission?: (batchId: string, commissionRate: number) => Promise<void>;
  onCloseBill?: (bill: any, fees: { commission: number; porterage: number; transfer: number; supplierAmount: number }) => Promise<void>;
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
  onDeleteSale,
  onUpdateBatch,
  onApplyBatchCommission,
  onCloseBill
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
  const [showBatchEdit, setShowBatchEdit] = useState(false);
  const [batchEditForm, setBatchEditForm] = useState<{ porterage?: string; transfer_fee?: string; notes?: string; commission_rate?: string }>({});
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(new Set());
  const [closedBillIds, setClosedBillIds] = useState<Set<string>>(new Set());
  const [showWeightComparison, setShowWeightComparison] = useState(false);


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

        // Determine closed status from local state or possible item fields
        const isClosed = closedBillIds.has(item.id) || (item as any).status === 'closed' || (item as any).is_closed === true;
        if (isClosed) {
          status = 'closed';
        }

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
          batchPorterage: (item as any).batch_porterage ?? null,
          batchTransferFee: (item as any).batch_transfer_fee ?? null,
          batchNotes: (item as any).batch_notes ?? null,
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
          isClosed,
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
  }, [inventory, products, suppliers, sales, showToast, closedBillIds]);

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

  // Group received bills by batch (bulk) so a batch appears as a single bill with expandable sub-items
  const groupedReceivedBills = useMemo(() => {
    try {
      // Key is batchId if present, otherwise the individual item id
      const groupMap = new Map<string, any>();
      for (const bill of filteredReceivedBills) {
        const key = bill.batchId || bill.id;
        if (!groupMap.has(key)) {
          groupMap.set(key, {
            groupId: key,
            isBatch: !!bill.batchId,
            supplierId: bill.supplierId,
            supplierName: bill.supplierName,
            batchId: bill.batchId || null,
            batchPorterage: bill.batchPorterage ?? null,
            batchTransferFee: bill.batchTransferFee ?? null,
            batchNotes: bill.batchNotes ?? null,
            items: [] as any[],
            originalQuantity: 0,
            remainingQuantity: 0,
            totalSoldQuantity: 0,
            totalRevenue: 0,
            totalCost: 0,
            totalProfit: 0,
            receivedAt: bill.receivedAt,
            typeSet: new Set<string>(),
          });
        }
        const g = groupMap.get(key);
        g.items.push(bill);
        g.originalQuantity += bill.originalQuantity || 0;
        g.remainingQuantity += bill.remainingQuantity || 0;
        g.totalSoldQuantity += bill.totalSoldQuantity || 0;
        g.totalRevenue += bill.totalRevenue || 0;
        g.totalCost += bill.totalCost || 0;
        g.totalProfit += bill.totalProfit || 0;
        g.typeSet.add(bill.type);
        // Use the earliest received date among group items
        const currentTs = new Date(g.receivedAt).getTime();
        const billTs = new Date(bill.receivedAt).getTime();
        if (!currentTs || billTs < currentTs) {
          g.receivedAt = bill.receivedAt;
        }
      }

      const groups = Array.from(groupMap.values()).map((g: any) => {
        const progressBase = g.originalQuantity > 0 ? (Math.max(g.originalQuantity - g.remainingQuantity, 0) / g.originalQuantity) * 100 : 0;
        const progress = isNaN(progressBase) || !isFinite(progressBase) ? 0 : Math.max(0, Math.min(100, progressBase));
        let status = 'pending';
        if (progress >= 100) status = 'completed';
        else if (progress >= 75) status = 'nearly-complete';
        else if (progress >= 50) status = 'halfway';
        else if (progress > 0) status = 'in-progress';
        // If all items in the group are closed, mark the group as closed
        const allClosed = g.items.length > 0 && g.items.every((it: any) => it.isClosed === true);
        if (allClosed) {
          status = 'closed';
        }
        const type = g.typeSet.size === 1 ? Array.from(g.typeSet)[0] : 'mixed';
        const productName = g.items.length === 1 ? g.items[0].productName : `${g.items.length} items`;
        const avgUnitPrice = g.items.length === 1 ? g.items[0].avgUnitPrice : (g.totalSoldQuantity > 0 ? g.totalRevenue / g.totalSoldQuantity : 0);
        return {
          ...g,
          progress,
          status,
          isClosed: allClosed,
          type,
          productName,
          avgUnitPrice,
        };
      });

      // Sort groups following the current sort selection
      groups.sort((a: any, b: any) => {
        let aValue: any;
        let bValue: any;
        switch (receivedBillsSort) {
          case 'date':
            aValue = new Date(a.receivedAt).getTime();
            bValue = new Date(b.receivedAt).getTime();
            break;
          case 'supplier':
            aValue = (a.supplierName || '').toLowerCase();
            bValue = (b.supplierName || '').toLowerCase();
            break;
          case 'product':
            aValue = (a.productName || '').toLowerCase();
            bValue = (b.productName || '').toLowerCase();
            break;
          case 'amount':
            // Use totalRevenue as a proxy for amount
            aValue = a.totalRevenue || 0;
            bValue = b.totalRevenue || 0;
            break;
          case 'progress':
            aValue = a.progress || 0;
            bValue = b.progress || 0;
            break;
          case 'revenue':
            aValue = a.totalRevenue || 0;
            bValue = b.totalRevenue || 0;
            break;
          case 'status':
            aValue = a.status || '';
            bValue = b.status || '';
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

      return groups;
    } catch (e) {
      console.error('Error grouping received bills:', e);
      return [] as any[];
    }
  }, [filteredReceivedBills, receivedBillsSort, receivedBillsSortDir]);

  const paginatedGroups = useMemo(() => {
    const itemsPerPage = 10;
    const startIndex = (receivedBillsPage - 1) * itemsPerPage;
    const endIndex = startIndex + itemsPerPage;
    return groupedReceivedBills.slice(startIndex, endIndex);
  }, [groupedReceivedBills, receivedBillsPage]);

  const groupTotalPages = Math.ceil(groupedReceivedBills.length / 10);

  const toggleGroup = (groupId: string) => {
    setExpandedGroups(prev => {
      const next = new Set(prev);
      if (next.has(groupId)) next.delete(groupId); else next.add(groupId);
      return next;
    });
  };

  // replaced by paginatedGroups and groupTotalPages

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
      'completed': { color: 'bg-green-100 text-green-800', icon: CheckCircle },
      'closed': { color: 'bg-gray-200 text-gray-800', icon: CheckCircle }
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



 
  return (
    <div>
      <div className="flex justify-between items-center">
        <div>
          <h2 className="text-xl font-semibold text-gray-900">Received Bills</h2>
          <p className="mt-1"></p>
          {(() => {
            const problematicItems = inventory.filter(item => item.received_quantity === null || item.received_quantity === undefined || item.received_quantity === 0);
            return problematicItems.length > 0 ? (
              <div className="mt-2 p-2 bg-yellow-50 border border-yellow-200 rounded-lg">
                <p className="text-xs text-yellow-800">⚠️ {problematicItems.length} inventory item(s) don't have received_quantity set. Click "Fix Data" to check, or add new inventory items for proper progress tracking.</p>
              </div>
            ) : null;
          })()}
        </div>
        <div className="flex items-center space-x-2 pb-4">
          <button onClick={exportReceivedBills} className="bg-green-600 text-white px-4 py-2 rounded-lg hover:bg-green-700 transition-colors flex items-center">
            <FileText className="w-4 h-4 mr-2" />
            Export CSV
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-4 gap-4 pb-4">
        <div className="bg-white p-4 rounded-lg shadow-sm border">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-600">Total Bills</p>
             
              <p className="text-2xl font-bold text-gray-900">{groupedReceivedBills.length}</p>
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
              <p className="text-2xl font-bold text-blue-600">{groupedReceivedBills.filter(bill => bill.status === 'in-progress').length}</p>
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
              <p className="text-2xl font-bold text-green-600">{groupedReceivedBills.filter(bill => bill.status === 'completed').length}</p>
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
              <p className="text-2xl font-bold text-green-600">{formatCurrency(groupedReceivedBills.reduce((sum, g) => sum + (g.totalRevenue || 0), 0))}</p>
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
              <option value="closed">Closed</option>
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
              {paginatedGroups.map((group: any) => (
                <React.Fragment key={`group-${group.groupId}`}>
                  <tr 
                    className="hover:bg-gray-50 cursor-pointer"
                    onClick={() => group.isBatch && toggleGroup(group.groupId)}
                  >
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="flex items-center gap-2">
                        {group.isBatch && (
                          <div className="p-1">
                            <ChevronRight className={`w-4 h-4 text-gray-500 transition-transform ${expandedGroups.has(group.groupId) ? 'rotate-90' : ''}`} />
                          </div>
                        )}
                        <div className="text-sm text-gray-900">{new Date(group.receivedAt).toLocaleDateString()}</div>
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="text-sm font-medium text-gray-900 flex items-center gap-2">
                        {group.isBatch && <span className="px-1.5 py-0.5 text-[10px] bg-indigo-100 text-indigo-700 rounded">Batch</span>}
                        <span>{group.productName}</span>
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="text-sm text-gray-900">{group.supplierName}</div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      {group.type === 'mixed' ? (
                        <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-gray-100 text-gray-800`}>
                          mixed
                        </span>
                      ) : (
                        <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${group.type === 'commission' ? 'bg-purple-100 text-purple-800' : 'bg-green-100 text-green-800'}`}>
                          {group.type}
                        </span>
                      )}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="text-sm text-gray-900">
                        <div>Original: {group.originalQuantity}</div>
                        <div>Remaining: {group.remainingQuantity}</div>
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="flex items-center">
                        <div className="w-32 bg-gray-200 rounded-full h-2 mr-2">
                          <div className="bg-blue-600 h-2 rounded-full" style={{ width: `${group.progress}%` }}></div>
                        </div>
                        <span className="text-sm text-gray-900">{group.progress.toFixed(1)}%</span>
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="text-sm font-medium text-gray-900">{formatCurrency(group.totalRevenue || 0)}</div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">{getStatusBadge(group.status)}</td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="flex items-center gap-2">
                        {group.isBatch ? (
                          <>
                            <button
                              onClick={(e) => {
                                e.stopPropagation(); // Prevent row click
                                // Use first item to prefill batch edit
                                const first = group.items[0];
                                const synthetic = {
                                  ...first,
                                  batchId: group.batchId,
                                  batchPorterage: group.batchPorterage,
                                  batchTransferFee: group.batchTransferFee,
                                  batchNotes: group.batchNotes,
                                  supplierName: group.supplierName,
                                };
                                setSelectedReceivedBill(synthetic);
                                setBatchEditForm({
                                  porterage: (group.batchPorterage ?? '').toString(),
                                  transfer_fee: (group.batchTransferFee ?? '').toString(),
                                  notes: group.batchNotes ?? '',
                                  commission_rate: (first?.commissionRate ?? '').toString()
                                });
                                setShowBatchEdit(true);
                              }}
                              className="inline-flex items-center gap-1.5 px-2.5 py-1 border border-gray-200 rounded-md text-xs font-medium text-gray-700 hover:bg-gray-50 hover:border-gray-300 transition-colors"
                            >
                              Edit Batch
                            </button>
                            <button
                              onClick={(e) => {
                                e.stopPropagation(); // Prevent row click
                                handleViewReceivedBillDetails(group.items[0]);
                              }}
                              className="inline-flex items-center gap-1.5 px-2.5 py-1 border border-gray-200 rounded-md text-xs font-medium text-gray-700 hover:bg-gray-50 hover:border-gray-300 transition-colors"
                            >
                              <FileText className="w-3.5 h-3.5 text-gray-500" />
                              <span>Details</span>
                            </button>
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                setSelectedReceivedBill(group.items[0]);
                                setShowWeightComparison(true);
                              }}
                              className="inline-flex items-center gap-1.5 px-2.5 py-1 border border-gray-200 rounded-md text-xs font-medium text-gray-700 hover:bg-gray-50 hover:border-gray-300 transition-colors"
                            >
                              <Scale className="w-3.5 h-3.5 text-gray-500" />
                              <span>Weight Analysis</span>
                            </button>
                          </>
                        ) : (
                          <>
                            <button
                              onClick={(e) => {
                                e.stopPropagation(); // Prevent row click
                                handleViewReceivedBillDetails(group.items[0]);
                              }}
                              className="inline-flex items-center gap-1.5 px-2.5 py-1 border border-gray-200 rounded-md text-xs font-medium text-gray-700 hover:bg-gray-50 hover:border-gray-300 transition-colors"
                            >
                              <FileText className="w-3.5 h-3.5 text-gray-500" />
                              <span>Details</span>
                            </button>
                            <button
                              onClick={(e) => {
                                e.stopPropagation(); // Prevent row click
                                handleViewReceivedBillSalesLogs(group.items[0]);
                              }}
                              className="inline-flex items-center gap-1.5 px-2.5 py-1 border border-gray-200 rounded-md text-xs font-medium text-gray-700 hover:bg-gray-50 hover:border-gray-300 transition-colors"
                            >
                              <Activity className="w-3.5 h-3.5 text-gray-500" />
                              <span>Sales Logs</span>
                            </button>
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                setSelectedReceivedBill(group.items[0]);
                                setShowWeightComparison(true);
                              }}
                              className="inline-flex items-center gap-1.5 px-2.5 py-1 border border-gray-200 rounded-md text-xs font-medium text-gray-700 hover:bg-gray-50 hover:border-gray-300 transition-colors"
                            >
                              <Scale className="w-3.5 h-3.5 text-gray-500" />
                              <span>Weight Analysis</span>
                            </button>
                          </>
                        )}
                      </div>
                    </td>
                  </tr>
                  {group.isBatch && expandedGroups.has(group.groupId) && (
                    <tr className="bg-gray-50">
                      <td colSpan={9} className="px-6 py-4">
                        <div className="border rounded-lg overflow-hidden">
                          <div className="bg-gray-100 px-4 py-2 text-sm text-gray-700 flex items-center justify-between">
                            <div>
                              {group.items.length} item{group.items.length !== 1 ? 's' : ''} in this {group.isBatch ? 'batch' : 'bill'}
                            </div>
                          </div>
                          <div className="overflow-x-auto">
                            <table className="min-w-full divide-y divide-gray-200">
                              <thead className="bg-gray-50">
                                <tr>
                                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Product</th>
                                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Type</th>
                                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Quantity</th>
                                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Progress</th>
                                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Revenue</th>
                                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Status</th>
                                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Actions</th>
                                </tr>
                              </thead>
                              <tbody className="bg-white divide-y divide-gray-200">
                                {group.items.map((bill: any) => (
                                  <tr key={bill.id} className="hover:bg-gray-50">
                                    <td className="px-6 py-3 whitespace-nowrap text-sm font-medium text-gray-900">{bill.productName}</td>
                                    <td className="px-6 py-3 whitespace-nowrap">
                                      <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${bill.type === 'commission' ? 'bg-purple-100 text-purple-800' : 'bg-green-100 text-green-800'}`}>
                                        {bill.type}
                                      </span>
                                    </td>
                                    <td className="px-6 py-3 whitespace-nowrap text-sm text-gray-900">
                                      <div>Original: {bill.originalQuantity} {bill.unit}</div>
                                      <div>Remaining: {bill.remainingQuantity} {bill.unit}</div>
                                    </td>
                                    <td className="px-6 py-3 whitespace-nowrap">
                                      <div className="flex items-center">
                                        <div className="w-24 bg-gray-200 rounded-full h-2 mr-2">
                                          <div className="bg-blue-600 h-2 rounded-full" style={{ width: `${bill.progress}%` }}></div>
                                        </div>
                                        <span className="text-sm text-gray-900">{bill.progress.toFixed(1)}%</span>
                                      </div>
                                    </td>
                                    <td className="px-6 py-3 whitespace-nowrap text-sm font-medium text-gray-900">{formatCurrency(bill.totalRevenue)}</td>
                                    <td className="px-6 py-3 whitespace-nowrap">{getStatusBadge(bill.status)}</td>
                                    <td className="px-6 py-3 whitespace-nowrap">
                                      <div className="flex items-center gap-2">
                                        <button
                                          onClick={() => handleViewReceivedBillDetails(bill)}
                                          className="inline-flex items-center gap-1.5 px-2.5 py-1 border border-gray-200 rounded-md text-xs font-medium text-gray-700 hover:bg-gray-50 hover:border-gray-300 transition-colors"
                                        >
                                          <FileText className="w-3.5 h-3.5 text-gray-500" />
                                          <span>Details</span>
                                        </button>
                                        <button
                                          onClick={() => handleViewReceivedBillSalesLogs(bill)}
                                          className="inline-flex items-center gap-1.5 px-2.5 py-1 border border-gray-200 rounded-md text-xs font-medium text-gray-700 hover:bg-gray-50 hover:border-gray-300 transition-colors"
                                        >
                                          <Activity className="w-3.5 h-3.5 text-gray-500" />
                                          <span>Sales Logs</span>
                                        </button>
                                        <button
                                          onClick={() => {
                                            setSelectedReceivedBill(bill);
                                            setShowWeightComparison(true);
                                          }}
                                          className="inline-flex items-center gap-1.5 px-2.5 py-1 border border-gray-200 rounded-md text-xs font-medium text-gray-700 hover:bg-gray-50 hover:border-gray-300 transition-colors"
                                        >
                                          <Scale className="w-3.5 h-3.5 text-gray-500" />
                                          <span>Weight Analysis</span>
                                        </button>
                                      </div>
                                    </td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          </div>
                        </div>
                      </td>
                    </tr>
                  )}
                </React.Fragment>
              ))}
            </tbody>
          </table>
        </div>

        {groupTotalPages > 1 && (
          <div className="px-6 py-4 border-t border-gray-200 flex items-center justify-between">
            <div className="text-sm text-gray-700">
              Showing {((receivedBillsPage - 1) * 10) + 1} to {Math.min(receivedBillsPage * 10, groupedReceivedBills.length)} of {groupedReceivedBills.length} results
            </div>
            <div className="flex items-center space-x-2">
              <button onClick={() => setReceivedBillsPage(Math.max(1, receivedBillsPage - 1))} disabled={receivedBillsPage === 1} className="px-3 py-1 text-sm border border-gray-300 rounded-md hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed">Previous</button>
              <span className="text-sm text-gray-700">Page {receivedBillsPage} of {groupTotalPages}</span>
              <button onClick={() => setReceivedBillsPage(Math.min(groupTotalPages, receivedBillsPage + 1))} disabled={receivedBillsPage === groupTotalPages} className="px-3 py-1 text-sm border border-gray-300 rounded-md hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed">Next</button>
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
                      <label className="block text-sm font-medium text-gray-700">Total Received Weight</label>
                      <p className="text-sm text-gray-900">{selectedReceivedBill.weight ? `${selectedReceivedBill.weight} kg` : 'N/A'}</p>
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700">Total Sold Weight</label>
                      <p className="text-sm text-gray-900">{selectedReceivedBill.relatedSales ? selectedReceivedBill.relatedSales.reduce((sum: number, sale: any) => sum + (sale.weight || 0), 0) : 0} kg</p>
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
              <button onClick={() => setShowWeightComparison(true)} className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors flex items-center gap-2">
                <Scale className="w-4 h-4" />
                Weight Analysis
              </button>
              <button onClick={() => handleViewReceivedBillSalesLogs(selectedReceivedBill)} className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors">View Sales Logs</button>
              <button onClick={() => setShowReceivedBillDetails(false)} className="px-4 py-2 bg-gray-600 text-white rounded-lg hover:bg-gray-700 transition-colors">Close</button>
            </div>
          </div>
        </div>
      )}

      {showBatchEdit && selectedReceivedBill?.batchId && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-lg max-w-lg w-full max-h-[85vh] overflow-y-auto">
            <div className="p-6 border-b flex items-center justify-between">
              <h2 className="text-lg font-semibold text-gray-900">Edit Batch</h2>
              <button onClick={() => setShowBatchEdit(false)} className="text-gray-400 hover:text-gray-600"><X className="w-6 h-6" /></button>
            </div>
            <div className="p-6 space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Commission Rate (%)</label>
                <input type="number" value={batchEditForm.commission_rate || ''} onChange={(e) => setBatchEditForm(f => ({ ...f, commission_rate: e.target.value }))} min="0" max="100" step="0.1" className="w-full border border-gray-300 rounded px-3 py-2" />
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Porterage</label>
                  <input type="number" value={batchEditForm.porterage || ''} onChange={(e) => setBatchEditForm(f => ({ ...f, porterage: e.target.value }))} min="0" step="0.01" className="w-full border border-gray-300 rounded px-3 py-2" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Transfer Fee</label>
                  <input type="number" value={batchEditForm.transfer_fee || ''} onChange={(e) => setBatchEditForm(f => ({ ...f, transfer_fee: e.target.value }))} min="0" step="0.01" className="w-full border border-gray-300 rounded px-3 py-2" />
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Notes</label>
                <textarea value={batchEditForm.notes || ''} onChange={(e) => setBatchEditForm(f => ({ ...f, notes: e.target.value }))} rows={3} className="w-full border border-gray-300 rounded px-3 py-2" />
              </div>
            </div>
            <div className="px-6 py-4 border-t flex justify-end gap-2">
              <button onClick={() => setShowBatchEdit(false)} className="px-4 py-2 border rounded">Cancel</button>
              <button
                onClick={async () => {
                  try {
                    if (onUpdateBatch) {
                      await onUpdateBatch(selectedReceivedBill.batchId, {
                        porterage: batchEditForm.porterage ? parseFloat(batchEditForm.porterage) : null,
                        transfer_fee: batchEditForm.transfer_fee ? parseFloat(batchEditForm.transfer_fee) : null,
                        notes: batchEditForm.notes || null
                      });
                    }
                    if (onApplyBatchCommission && batchEditForm.commission_rate) {
                      await onApplyBatchCommission(selectedReceivedBill.batchId, parseFloat(batchEditForm.commission_rate));
                    }
                    setShowBatchEdit(false);
                    showToast('Batch updated', 'success');
                  } catch (e) {
                    showToast('Failed to update batch', 'error');
                  }
                }}
                className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700"
              >
                Save
              </button>
            </div>
          </div>
        </div>
      )}

      {showReceivedBillSalesLogs && selectedReceivedBill && (
        <ReceivedBillSalesLogsModal
          selectedReceivedBill={selectedReceivedBill}
          setShowReceivedBillSalesLogs={setShowReceivedBillSalesLogs}
          inventory={inventory}
          sales={sales}
          customers={customers}
          formatCurrency={formatCurrency}
          onEditSale={onEditSale}
          onDeleteSale={onDeleteSale}
          onCloseBill={onCloseBill}
          showToast={showToast}
          onMarkBillClosed={(id: string) => {
            setClosedBillIds(prev => {
              const next = new Set(prev);
              next.add(id);
              return next;
            });
          }}
        />
      )}

      {/* Weight Comparison Modal */}
      {showWeightComparison && selectedReceivedBill && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-lg max-w-6xl w-full max-h-[90vh] overflow-y-auto">
            <div className="p-6 border-b">
              <div className="flex items-center justify-between">
                <h2 className="text-xl font-semibold text-gray-900">Weight Analysis</h2>
                <button onClick={() => setShowWeightComparison(false)} className="text-gray-400 hover:text-gray-600">
                  <X className="w-6 h-6" />
                </button>
              </div>
              <p className="text-sm text-gray-600 mt-1">
                {selectedReceivedBill.productName} - {selectedReceivedBill.supplierName}
              </p>
            </div>
            <div className="p-6">
              <WeightComparisonReport
                productId={selectedReceivedBill.productId}
                supplierId={selectedReceivedBill.supplierId}
                billId={selectedReceivedBill.batchId}
              />
            </div>
            <div className="px-6 py-4 border-t border-gray-200 flex justify-end">
              <button 
                onClick={() => setShowWeightComparison(false)} 
                className="px-4 py-2 bg-gray-600 text-white rounded-lg hover:bg-gray-700 transition-colors"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Removed parent-level Close Bill modal. The Sales Logs modal now manages its own confirmation modal. */}
      
    </div>
  );
}

function ReceivedBillSalesLogsModal({ 
  selectedReceivedBill, 
  setShowReceivedBillSalesLogs, 
  inventory,
  sales, 
  customers, 
  formatCurrency,
  onEditSale,
  onDeleteSale,
  onCloseBill,
  showToast,
  onMarkBillClosed
}: {
  selectedReceivedBill: any;
  setShowReceivedBillSalesLogs: (show: boolean) => void;
  inventory: any[];
  sales: any[];
  customers: any[];
  formatCurrency: (amount: number) => string;
  onEditSale: (sale: any) => void;
  onDeleteSale: (sale: any) => void;
  onCloseBill?: (bill: any, fees: { commission: number; porterage: number; transfer: number; supplierAmount: number }) => Promise<void>;
  showToast: (message: string, type?: 'success' | 'error') => void;
  onMarkBillClosed: (id: string) => void;
}) {
  const [showCloseBillModal, setShowCloseBillModal] = useState(false);
  const [closeBillFees, setCloseBillFees] = useState<{ commission: number; porterage: number; transfer: number; supplierAmount: number } | null>(null);
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

  const closeBill = async () => {
    try {
      if (selectedReceivedBill.isClosed) {
        showToast('Bill is already closed.', 'error');
        return;
      }
      // Calculate total revenue from sales
      const totalRevenue = selectedReceivedBill.totalRevenue || 0;
      
      // Calculate fees based on bill type
      let commissionAmount = 0;
      let porterageAmount = 0;
      let transferAmount = 0;
      let supplierAmount = 0;

      if (selectedReceivedBill.type === 'commission') {
        // For commission items, calculate commission percentage
        const commissionRate = selectedReceivedBill.commissionRate || 0;
        commissionAmount = (totalRevenue * commissionRate) / 100;
        
        // Porterage and transfer fees are fixed amounts
        porterageAmount = selectedReceivedBill.porterage || selectedReceivedBill.batchPorterage || 0;
        transferAmount = selectedReceivedBill.transferFee || selectedReceivedBill.batchTransferFee || 0;
        
        // Supplier gets the remaining amount after deducting all fees
        supplierAmount = totalRevenue - commissionAmount - porterageAmount - transferAmount;
      } else {
        // For cash items, supplier gets the full amount
        supplierAmount = totalRevenue;
      }

      const fees = {
        commission: commissionAmount,
        porterage: porterageAmount,
        transfer: transferAmount,
        supplierAmount: supplierAmount
      };

      // Set fees and show confirmation modal
      setCloseBillFees(fees);
      setShowCloseBillModal(true);
    } catch (e) {
      console.error('Error closing bill:', e);
      showToast('Failed to close bill. Please try again.', 'error');
    }
  };
  const hasInvalidSalesLines = useMemo(() => {
    return processedSalesData.some((item: any) => {
      const invalidQuantity =  selectedReceivedBill.originalQuantity > selectedReceivedBill.totalSoldQuantity;
      const invalidPrice = !item.unitPrice || item.unitPrice <= 0;
      return invalidQuantity || invalidPrice;
      
    });
  }, [processedSalesData]);

  const exportSelectedBill = () => {
    
    try {
      const isBatch = !!selectedReceivedBill.batchId;
      const billHeaders = isBatch
        ? ['Batch ID', 'Supplier', 'Type', 'Batch Porterage', 'Batch Transfer Fee', 'Batch Notes', 'Total Items', 'Total Original Qty', 'Total Remaining Qty', 'Total Sold Qty', 'Total Revenue', 'Total Cost', 'Total Profit', 'Received Date']
        : ['Product', 'Supplier', 'Type', 'Original Qty', 'Remaining Qty', 'Sold Qty', 'Progress %', 'Revenue', 'Cost', 'Profit', 'Status', 'Avg Unit Price', 'Received Date'];

      let billRow: any[] = [];
      if (isBatch) {
        const batchItems = inventory.filter((i: any) => i.batch_id === selectedReceivedBill.batchId);
        const totals = batchItems.reduce((acc: any, it: any) => {
          const relatedSales = sales.filter((s: any) => s.product_id === it.product_id && s.supplier_id === it.supplier_id && new Date(s.created_at).getTime() >= new Date(it.received_at || it.created_at).getTime());
          const soldQty = relatedSales.reduce((s: number, r: any) => s + (r.quantity || 0), 0);
          const revenue = relatedSales.reduce((s: number, r: any) => s + (r.unit_price || 0) * (r.quantity || 0), 0);
          const origQty = it.received_quantity || it.quantity || 0;
          const cost = it.type === 'commission' ? ((it.porterage || 0) + (it.transfer_fee || 0)) : (it.price || 0) * origQty;
          acc.totalItems += 1;
          acc.totalOriginal += origQty;
          acc.totalRemaining += (it.quantity || 0);
          acc.totalSold += soldQty;
          acc.totalRevenue += revenue;
          acc.totalCost += cost;
          acc.totalProfit += revenue - cost;
          return acc;
        }, { totalItems: 0, totalOriginal: 0, totalRemaining: 0, totalSold: 0, totalRevenue: 0, totalCost: 0, totalProfit: 0 });
        billRow = [
          selectedReceivedBill.batchId,
          `"${selectedReceivedBill.supplierName}"`,
          selectedReceivedBill.type,
          (selectedReceivedBill.batchPorterage || 0).toFixed(2),
          (selectedReceivedBill.batchTransferFee || 0).toFixed(2),
          selectedReceivedBill.batchNotes ? `"${String(selectedReceivedBill.batchNotes).replace(/\"/g, '"')}"` : '',
          totals.totalItems,
          totals.totalOriginal,
          totals.totalRemaining,
          totals.totalSold,
          totals.totalRevenue.toFixed(2),
          totals.totalCost.toFixed(2),
          totals.totalProfit.toFixed(2),
          new Date(selectedReceivedBill.receivedAt).toLocaleString()
        ];
      } else {
        billRow = [
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
      }

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
            <div className="grid grid-cols-1 md:grid-cols-6 gap-4">
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
              <div className="bg-indigo-50 p-3 rounded-lg">
                <p className="text-sm text-indigo-700">Total Received Weight</p>
                <p className="text-lg font-bold text-indigo-900">{selectedReceivedBill.weight ? `${selectedReceivedBill.weight} kg` : 'N/A'}</p>
              </div>
              <div className="bg-teal-50 p-3 rounded-lg">
                <p className="text-sm text-teal-700">Total Sold Weight</p>
                <p className="text-lg font-bold text-teal-900">{processedSalesData.reduce((sum, item) => sum + (item.weight || 0), 0)} kg</p>
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
                        <div className="text-sm font-medium text-gray-900">{formatCurrency(item.weight*item.unitPrice || 0)}</div>
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
              disabled={!selectedReceivedBill.isClosed}
              className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              title={!selectedReceivedBill.isClosed ? 'Export is only available after closing the bill' : 'Export this received bill'}
            >
              {'Export Bill' }
            </button>
            <button
              onClick={closeBill}
              disabled={hasInvalidSalesLines || selectedReceivedBill.isClosed}
              className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              title={selectedReceivedBill.isClosed ? 'Bill already closed' : hasInvalidSalesLines ? 'Cannot close bill: missing quantity or non-priced item(s) present' : 'Close this received bill'}
            >
              {'Close Bill'}
            </button>
            
            <button onClick={() => setShowReceivedBillSalesLogs(false)} className="px-4 py-2 bg-gray-600 text-white rounded-lg hover:bg-gray-700 transition-colors">Close</button>
          </div>
        </div>
      </div>

      {showCloseBillModal && closeBillFees && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-lg max-w-lg w-full max-h-[85vh] overflow-y-auto">
            <div className="p-6 border-b">
              <div className="flex items-center justify-between">
                <h2 className="text-lg font-semibold text-gray-900">Close Bill Confirmation</h2>
                <button onClick={() => setShowCloseBillModal(false)} className="text-gray-400 hover:text-gray-600">
                  <X className="w-6 h-6" />
                </button>
              </div>
            </div>
            <div className="p-6 space-y-4">
              <div className="bg-gray-50 p-4 rounded-lg">
                <h3 className="text-sm font-medium text-gray-700 mb-3">Bill Summary</h3>
                <div className="space-y-2 text-sm">
                  <div className="flex justify-between">
                    <span>Product:</span>
                    <span className="font-medium">{selectedReceivedBill.productName}</span>
                  </div>
                  <div className="flex justify-between">
                    <span>Supplier:</span>
                    <span className="font-medium">{selectedReceivedBill.supplierName}</span>
                  </div>
                  <div className="flex justify-between">
                    <span>Type:</span>
                    <span className="font-medium capitalize">{selectedReceivedBill.type}</span>
                  </div>
                  <div className="flex justify-between">
                    <span>Total Revenue:</span>
                    <span className="font-medium text-green-600">{formatCurrency(selectedReceivedBill.totalRevenue)}</span>
                  </div>
                </div>
              </div>

              <div className="bg-yellow-50 p-4 rounded-lg">
                <h3 className="text-sm font-medium text-yellow-700 mb-3">Fee Breakdown</h3>
                <div className="space-y-2 text-sm">
                  {selectedReceivedBill.type === 'commission' && (
                    <>
                      <div className="flex justify-between">
                        <span>Commission ({selectedReceivedBill.commissionRate || 0}%):</span>
                        <span className="font-medium text-red-600">-{formatCurrency(closeBillFees.commission)}</span>
                      </div>
                      <div className="flex justify-between">
                        <span>Porterage:</span>
                        <span className="font-medium text-red-600">-{formatCurrency(closeBillFees.porterage)}</span>
                      </div>
                      <div className="flex justify-between">
                        <span>Transfer Fee:</span>
                        <span className="font-medium text-red-600">-{formatCurrency(closeBillFees.transfer)}</span>
                      </div>
                    </>
                  )}
                  <div className="border-t pt-2 mt-2">
                    <div className="flex justify-between font-medium">
                      <span>Supplier Amount:</span>
                      <span className="text-green-600">{formatCurrency(closeBillFees.supplierAmount)}</span>
                    </div>
                  </div>
                </div>
              </div>

       
            </div>
            <div className="px-6 py-4 border-t flex justify-end gap-3">
              <button
                onClick={() => setShowCloseBillModal(false)}
                className="px-4 py-2 border border-gray-300 rounded-lg text-gray-700 hover:bg-gray-50 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={async () => {
                  try {
                    if (onCloseBill) {
                      await onCloseBill(selectedReceivedBill, closeBillFees);
                      setShowCloseBillModal(false);
                      setCloseBillFees(null);
                      setShowReceivedBillSalesLogs(false);
                      showToast('Bill closed successfully! Commission, porterage, and transfer fees deducted. Supplier balance updated.', 'success');
                      // notify parent to mark as closed locally
                      onMarkBillClosed(String(selectedReceivedBill.id));
                    }
                  } catch (e) {
                    console.error('Error closing bill:', e);
                    showToast('Failed to close bill. Please try again.', 'error');
                  }
                }}
                className="px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors"
              >
                Confirm Close Bill
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// Fallback icons used in status badge for decoupling from Accounting imports
function ClockIcon(props: any) { return <svg {...props} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"></circle><polyline points="12 6 12 12 16 14"></polyline></svg>; }
function TrendingUpIcon(props: any) { return <svg {...props} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="23 6 13.5 15.5 8.5 10.5 1 18"></polyline><polyline points="17 6 23 6 23 12"></polyline></svg>; }
function TargetIcon(props: any) { return <svg {...props} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"></circle><circle cx="12" cy="12" r="6"></circle><circle cx="12" cy="12" r="2"></circle></svg>; }

