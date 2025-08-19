import { useMemo, useState, useEffect } from 'react';
import { FileSpreadsheet, Search, Activity, Package, ShoppingCart, DollarSign, Eye, X, Edit, Trash2, FileText, Receipt, Plus, Save, AlertTriangle, CheckCircle, History, Filter } from 'lucide-react';
import { db } from '../../lib/db';

type InventoryLogsProps = {
  inventoryLogs: any[];
  products: any[];
  suppliers: any[];
  customers?: any[];
  sales?: any[];
  formatCurrency: (amount: number) => string;
  formatCurrencyWithSymbol?: (amount: number, currency?: string) => string;
  showToast: (message: string, type?: 'success' | 'error') => void;
  onEditSale: (sale: any) => void;
  onDeleteSale: (sale: any) => void;
  userProfile?: any;
  storeId?: string;
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
  onEditSale,
  onDeleteSale,
  userProfile,
  storeId
}: InventoryLogsProps) {
  const [inventoryLogsSearchTerm, setInventoryLogsSearchTerm] = useState('');
  const [inventoryLogsProductFilter, setInventoryLogsProductFilter] = useState('');
  const [inventoryLogsSupplierFilter, setInventoryLogsSupplierFilter] = useState('');
  const [inventoryLogsDateFilter, setInventoryLogsDateFilter] = useState<'all' | 'today' | 'week' | 'month'>('all');
  const [inventoryLogsPage, setInventoryLogsPage] = useState(1);
  const [inventoryLogsSort, setInventoryLogsSort] = useState<'date' | 'product' | 'supplier' | 'amount'>('date');
  const [inventoryLogsSortDir, setInventoryLogsSortDir] = useState<'asc' | 'desc'>('desc');
  const [showSalesLogs, setShowSalesLogs] = useState(false);
  const [selectedInventoryLog, setSelectedInventoryLog] = useState<any | null>(null);
  const [editingSale, setEditingSale] = useState<any | null>(null);
  const [showEditModal, setShowEditModal] = useState(false);

  // Bill management states
  const [bills, setBills] = useState<any[]>([]);
  const [showBillManager, setShowBillManager] = useState(false);
  const [selectedBill, setSelectedBill] = useState<any | null>(null);
  const [showBillDetails, setShowBillDetails] = useState(false);
  const [showEditBill, setShowEditBill] = useState(false);
  const [billSearchTerm, setBillSearchTerm] = useState('');
  const [billFilters, setBillFilters] = useState({
    dateFrom: '',
    dateTo: '',
    paymentStatus: '',
    customerId: '',
    status: ''
  });
  const [showAuditTrail, setShowAuditTrail] = useState(false);
  const [auditLogs, setAuditLogs] = useState<any[]>([]);
  const [loadingBills, setLoadingBills] = useState(false);

  // Load bills when component mounts
  useEffect(() => {
    if (storeId) {
      loadBills();
    }
  }, [storeId]);

  const loadBills = async () => {
    if (!storeId) return;
    
    setLoadingBills(true);
    try {
      const billsData = await db.getBillsWithDetails(storeId);
      setBills(billsData);
    } catch (error) {
      console.error('Error loading bills:', error);
      showToast('Failed to load bills', 'error');
    } finally {
      setLoadingBills(false);
    }
  };

  const handleViewBillDetails = async (bill: any) => {
    setSelectedBill(bill);
    setShowBillDetails(true);
    
    // Load audit trail
    try {
      const auditTrail = await db.getBillAuditTrail(bill.id);
      setAuditLogs(auditTrail);
    } catch (error) {
      console.error('Error loading audit trail:', error);
    }
  };

  const handleEditBill = (bill: any) => {
    setSelectedBill(bill);
    setShowEditBill(true);
  };

  const handleDeleteBill = async (bill: any) => {
    if (!userProfile?.id) {
      showToast('User authentication required', 'error');
      return;
    }

    const confirmMessage = `Are you sure you want to delete bill ${bill.bill_number}? This will restore inventory quantities and cannot be undone.`;
    if (!confirm(confirmMessage)) return;

    try {
      await db.deleteBill(bill.id, userProfile.id, 'Bill deleted by user', true);
      await loadBills();
      showToast('Bill deleted successfully', 'success');
    } catch (error) {
      console.error('Error deleting bill:', error);
      showToast('Failed to delete bill', 'error');
    }
  };

  const handleSaveBillChanges = async (updatedBill: any) => {
    if (!userProfile?.id) {
      showToast('User authentication required', 'error');
      return;
    }

    try {
      await db.updateBill(updatedBill.id, {
        customer_id: updatedBill.customer_id,
        customer_name: updatedBill.customer_name,
        payment_method: updatedBill.payment_method,
        payment_status: updatedBill.payment_status,
        amount_paid: updatedBill.amount_paid,
        amount_due: updatedBill.amount_due,
        notes: updatedBill.notes,
        discount_amount: updatedBill.discount_amount || 0,
        tax_amount: updatedBill.tax_amount || 0
      }, userProfile.id, 'Bill updated by user');
      
      await loadBills();
      setShowEditBill(false);
      showToast('Bill updated successfully', 'success');
    } catch (error) {
      console.error('Error updating bill:', error);
      showToast('Failed to update bill', 'error');
    }
  };

  const filteredBills = useMemo(() => {
    let filtered = [...bills];

    if (billSearchTerm) {
      const search = billSearchTerm.toLowerCase();
      filtered = filtered.filter((bill: any) =>
        bill.bill_number.toLowerCase().includes(search) ||
        (bill.customer_name && bill.customer_name.toLowerCase().includes(search)) ||
        (bill.notes && bill.notes.toLowerCase().includes(search))
      );
    }

    if (billFilters.dateFrom) {
      filtered = filtered.filter((bill: any) => bill.bill_date >= billFilters.dateFrom);
    }
    if (billFilters.dateTo) {
      filtered = filtered.filter((bill: any) => bill.bill_date <= billFilters.dateTo);
    }
    if (billFilters.paymentStatus) {
      filtered = filtered.filter((bill: any) => bill.payment_status === billFilters.paymentStatus);
    }
    if (billFilters.customerId) {
      filtered = filtered.filter((bill: any) => bill.customer_id === billFilters.customerId);
    }
    if (billFilters.status) {
      filtered = filtered.filter((bill: any) => bill.status === billFilters.status);
    }

    return filtered;
  }, [bills, billSearchTerm, billFilters]);

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
  const deleteInventoryLog = (log: any) => {
    if (log?.type !== 'sale') return;
    
    console.log('Deleting inventory log:', log);
    console.log('Available inventory logs:', inventoryLogs);
    
    // Since the sales array is empty, we work directly with the inventory log
    // The inventory log contains the sale information
    if (onDeleteSale) {
      // Pass the inventory log data as the sale data
      const saleData = {
        id: log.id,
        saleId: log.id,
        quantity: log.quantity,
        weight: log.weight,
        unit_price: log.unitPrice || log.amount,
        payment_method: log.paymentMethod || 'cash',
        notes: log.notes,
        customerName: log.customerName,
        totalPrice: log.amount
      };
      
      console.log('Sending sale data to parent:', saleData);
      onDeleteSale(saleData);
      showToast('Sale deleted successfully', 'success');
      
      // Force a re-render of the inventory logs
      const currentSearch = inventoryLogsSearchTerm;
      setInventoryLogsSearchTerm('');
      setTimeout(() => setInventoryLogsSearchTerm(currentSearch), 100);
    } else {
      showToast('Delete functionality not available', 'error');
    }
  };

  const handleEditSale = (log: any) => {
    console.log('Editing inventory log:', log);
    console.log('Available inventory logs:', inventoryLogs);
    
    // Since the sales array is empty, we work directly with the inventory log
    // Transform the inventory log data to match the expected sale structure
    const saleData = {
      ...log,
      saleId: log.id,
      quantity: log.quantity || 1,
      weight: log.weight || '',
      unitPrice: log.unitPrice || log.amount || 0,
      paymentMethod: log.paymentMethod || 'cash',
      notes: log.notes || '',
      customerName: log.customerName || 'Walk-in Customer',
      totalPrice: log.amount || 0
    };
    
    console.log('Transformed sale data:', saleData);
    setEditingSale(saleData);
    setShowEditModal(true);
  };

  const handleSaveEdit = () => {
    if (editingSale && onEditSale) {
      // Update the inventory log data directly
      const updatedLog = {
        ...editingSale,
        quantity: editingSale.quantity,
        weight: editingSale.weight,
        amount: editingSale.quantity * editingSale.unitPrice,
        unitPrice: editingSale.unitPrice,
        paymentMethod: editingSale.paymentMethod,
        notes: editingSale.notes
      };
      
      // Call the parent's onEditSale function
      onEditSale(updatedLog);
      
      // Update the local inventory logs data if it exists
      const logIndex = inventoryLogs.findIndex((log: any) => log.id === editingSale.id);
      if (logIndex !== -1) {
        inventoryLogs[logIndex] = { ...inventoryLogs[logIndex], ...updatedLog };
      }
      
      setShowEditModal(false);
      setEditingSale(null);
      showToast('Sale updated successfully', 'success');
      
      // Force a re-render of the inventory logs
      const currentSearch = inventoryLogsSearchTerm;
      setInventoryLogsSearchTerm('');
      setTimeout(() => setInventoryLogsSearchTerm(currentSearch), 100);
    }
  };

  const handleCancelEdit = () => {
    setShowEditModal(false);
    setEditingSale(null);
  };

  const processedSalesData = useMemo(() => {
    if (!selectedInventoryLog) return [] as any[];
    
    // If the sales array is empty, try to extract sale data from inventory logs
    if (!sales || sales.length === 0) {
      // Look for sale-type inventory logs that might be related
      const saleLogs = inventoryLogs.filter((log: any) => 
        log.type === 'sale' && 
        log.productId === selectedInventoryLog.productId &&
        log.supplierId === selectedInventoryLog.supplierId
      );
      
      return saleLogs.map((log: any) => ({
        ...log,
        saleId: log.id,
        saleDate: log.date,
        customerId: log.customerId,
        customerName: log.customerName || 'Walk-in Customer',
        quantity: log.quantity || 1,
        weight: log.weight,
        unitPrice: log.unitPrice || log.amount,
        totalPrice: log.amount || 0,
        paymentMethod: log.paymentMethod || 'cash',
        notes: log.notes,
        productName: selectedInventoryLog.productName,
        supplierName: selectedInventoryLog.supplierName,
        unit: selectedInventoryLog.unit
      })).sort((a: any, b: any) => new Date(b.saleDate).getTime() - new Date(a.saleDate).getTime());
    }
    
    // Original logic for when sales array has data
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
  }, [selectedInventoryLog, sales, customers, inventoryLogs]);

  return (
    <div className="space-y-0">
      {/* Header */}
      <div className="flex justify-between items-center">
        <div>
          <h2 className="text-xl font-semibold text-gray-900">Inventory & Bill Management</h2>
        
        </div>
        <div className="flex items-center space-x-2">
          <button
            onClick={() => setShowBillManager(!showBillManager)}
            className={`px-4 py-2 rounded-lg transition-colors flex items-center ${
              showBillManager 
                ? 'bg-blue-600 text-white hover:bg-blue-700' 
                : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
            }`}
          >
            <Receipt className="w-4 h-4 mr-2" />
            {showBillManager ? 'Hide Bills' : 'Manage Bills'}
          </button>
          <button
            onClick={exportInventoryLogs}
            className="bg-green-600 text-white px-4 py-2 rounded-lg hover:bg-green-700 transition-colors flex items-center"
          >
            <FileSpreadsheet className="w-4 h-4 mr-2" />
            Export CSV
          </button>
        </div>
      </div>

      {/* Bill Management Section */}
      {showBillManager && (
        <div className="bg-white rounded-lg shadow-sm border mb-6">
          <div className="p-6 border-b">
            <div className="flex items-center justify-between">
              <h3 className="text-lg font-semibold text-gray-900 flex items-center">
                <Receipt className="w-5 h-5 mr-2 text-blue-600" />
                Bill Management
              </h3>
              <button
                onClick={loadBills}
                disabled={loadingBills}
                className="bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 transition-colors flex items-center disabled:opacity-50"
              >
                <Activity className={`w-4 h-4 mr-2 ${loadingBills ? 'animate-spin' : ''}`} />
                Refresh Bills
              </button>
            </div>
          </div>

          {/* Bill Search and Filters */}
          <div className="p-4 border-b bg-gray-50">
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Search Bills</label>
                <div className="relative">
                  <Search className="w-4 h-4 absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400" />
                  <input
                    type="text"
                    placeholder="Search by bill number, customer..."
                    value={billSearchTerm}
                    onChange={(e) => setBillSearchTerm(e.target.value)}
                    className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-blue-500 focus:border-blue-500"
                  />
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Payment Status</label>
                <select
                  value={billFilters.paymentStatus}
                  onChange={(e) => setBillFilters(prev => ({ ...prev, paymentStatus: e.target.value }))}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:ring-blue-500 focus:border-blue-500"
                >
                  <option value="">All Statuses</option>
                  <option value="paid">Paid</option>
                  <option value="partial">Partial</option>
                  <option value="pending">Pending</option>
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Date From</label>
                <input
                  type="date"
                  value={billFilters.dateFrom}
                  onChange={(e) => setBillFilters(prev => ({ ...prev, dateFrom: e.target.value }))}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:ring-blue-500 focus:border-blue-500"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Date To</label>
                <input
                  type="date"
                  value={billFilters.dateTo}
                  onChange={(e) => setBillFilters(prev => ({ ...prev, dateTo: e.target.value }))}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:ring-blue-500 focus:border-blue-500"
                />
              </div>
            </div>
          </div>

          {/* Bills Table */}
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Bill #</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Date</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Customer</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Items</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Total</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Payment</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Status</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200">
                {filteredBills.length === 0 ? (
                  <tr>
                    <td colSpan={8} className="px-6 py-8 text-center text-gray-500">
                      {loadingBills ? (
                        <div className="flex items-center justify-center">
                          <Activity className="w-5 h-5 animate-spin mr-2" />
                          Loading bills...
                        </div>
                      ) : (
                        <div>
                          <Receipt className="w-12 h-12 mx-auto mb-4 text-gray-300" />
                          <p>No bills found</p>
                          <p className="text-sm">Bills will appear here when sales are made in the POS</p>
                        </div>
                      )}
                    </td>
                  </tr>
                ) : (
                  filteredBills.map((bill: any) => (
                    <tr key={bill.id} className="hover:bg-gray-50">
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="text-sm font-medium text-gray-900">{bill.bill_number}</div>
                        <div className="text-xs text-gray-500">
                          {new Date(bill.created_at).toLocaleTimeString()}
                        </div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="text-sm text-gray-900">
                          {new Date(bill.bill_date).toLocaleDateString()}
                        </div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="text-sm text-gray-900">
                          {bill.customer_name || 'Walk-in Customer'}
                        </div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="text-sm text-gray-900">
                          {bill.lineItems?.length || 0} items
                        </div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="text-sm font-medium text-gray-900">
                          {formatCurrency(bill.total_amount)}
                        </div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
                          bill.payment_status === 'paid' 
                            ? 'bg-green-100 text-green-800'
                            : bill.payment_status === 'partial'
                            ? 'bg-yellow-100 text-yellow-800'
                            : 'bg-red-100 text-red-800'
                        }`}>
                          {bill.payment_method} - {bill.payment_status}
                        </span>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
                          bill.status === 'active' 
                            ? 'bg-blue-100 text-blue-800'
                            : bill.status === 'cancelled'
                            ? 'bg-red-100 text-red-800'
                            : 'bg-gray-100 text-gray-800'
                        }`}>
                          {bill.status}
                        </span>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="flex items-center space-x-2">
                          <button
                            onClick={() => handleViewBillDetails(bill)}
                            className="text-blue-600 hover:text-blue-900 text-sm font-medium"
                            title="View Details"
                          >
                            <Eye className="w-4 h-4" />
                          </button>
                          <button
                            onClick={() => handleEditBill(bill)}
                            className="text-green-600 hover:text-green-900 text-sm font-medium"
                            title="Edit Bill"
                          >
                            <Edit className="w-4 h-4" />
                          </button>
                          <button
                            onClick={() => handleDeleteBill(bill)}
                            className="text-red-600 hover:text-red-900 text-sm font-medium"
                            title="Delete Bill"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                          <button
                            onClick={() => {
                              setSelectedBill(bill);
                              setShowAuditTrail(true);
                            }}
                            className="text-purple-600 hover:text-purple-900 text-sm font-medium"
                            title="View Audit Trail"
                          >
                            <History className="w-4 h-4" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

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
                      {log.type === 'sale' && (
                        <>
                          <button
                            onClick={() => handleEditSale(log)}
                            className="text-blue-600 hover:text-blue-900 text-sm font-medium"
                            title="Edit Sale"
                          >
                            <Edit className="w-4 h-4" />
                          </button>
                          <button
                            onClick={() => deleteInventoryLog(log)}
                            className="text-red-600 hover:text-red-900 text-sm font-medium"
                            title="Delete Sale"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </>
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
          onEditSale={handleEditSale}
          onDeleteSale={deleteInventoryLog}
        />
      )}

      {/* Edit Sale Modal */}
      {showEditModal && editingSale && (
        <EditSaleModal
          sale={editingSale}
          onSave={handleSaveEdit}
          onCancel={handleCancelEdit}
          formatCurrency={formatCurrency}
        />
      )}

      {/* Bill Details Modal */}
      {showBillDetails && selectedBill && (
        <BillDetailsModal
          bill={selectedBill}
          onClose={() => setShowBillDetails(false)}
          formatCurrency={formatCurrency}
          products={products}
          suppliers={suppliers}
          customers={customers}
        />
      )}

      {/* Edit Bill Modal */}
      {showEditBill && selectedBill && (
        <EditBillModal
          bill={selectedBill}
          onSave={handleSaveBillChanges}
          onCancel={() => setShowEditBill(false)}
          formatCurrency={formatCurrency}
          customers={customers}
        />
      )}

      {/* Audit Trail Modal */}
      {showAuditTrail && selectedBill && (
        <AuditTrailModal
          bill={selectedBill}
          auditLogs={auditLogs}
          onClose={() => setShowAuditTrail(false)}
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
                            <button onClick={() => onEditSale({ ...item, id: item.saleId, quantity: item.quantity, weight: item.weight, unit_price: item.unitPrice, payment_method: item.paymentMethod, notes: item.notes })} className="text-blue-600 hover:text-blue-800 p-1 rounded hover:bg-blue-50 transition-colors" title="Edit Sale">
                              <Edit className="w-4 h-4" />
                            </button>
                          )}
                          {!!onDeleteSale && (
                            <button onClick={() => onDeleteSale({ ...item, id: item.saleId, saleId: item.saleId, customerName: item.customerName, totalPrice: (item.unitPrice || 0) * (item.quantity || 0) })} className="text-red-600 hover:text-red-800 p-1 rounded hover:bg-red-50 transition-colors" title="Delete Sale">
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

function EditSaleModal({
  sale,
  onSave,
  onCancel,
  formatCurrency,
}: {
  sale: any;
  onSave: () => void;
  onCancel: () => void;
  formatCurrency: (amount: number) => string;
}) {
  const [formData, setFormData] = useState({
    quantity: sale.quantity || 1,
    weight: sale.weight || '',
    unitPrice: sale.unitPrice || sale.unit_price || 0,
    paymentMethod: sale.paymentMethod || sale.payment_method || 'cash',
    notes: sale.notes || ''
  });

  const handleInputChange = (field: string, value: any) => {
    setFormData(prev => ({
      ...prev,
      [field]: value
    }));
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    
    // Update the sale object with new values
    const updatedSale = {
      ...sale,
      quantity: formData.quantity,
      weight: formData.weight,
      unit_price: formData.unitPrice,
      payment_method: formData.paymentMethod,
      notes: formData.notes,
      // Update the total price based on new quantity and unit price
      received_value: formData.quantity * formData.unitPrice
    };
    
    // Update the editingSale state
    Object.assign(sale, updatedSale);
    
    // Also update the corresponding inventory log if it exists
    // This part is no longer needed as we are working directly with the inventory log
    // if (selectedInventoryLog && selectedInventoryLog.type === 'sale') {
    //   Object.assign(selectedInventoryLog, {
    //     quantity: formData.quantity,
    //     weight: formData.weight,
    //     amount: formData.quantity * formData.unitPrice
    //   });
    // }
    
    onSave();
  };

  const totalPrice = formData.quantity * formData.unitPrice;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
      <div className="bg-white rounded-lg max-w-md w-full">
        <div className="p-6 border-b">
          <div className="flex items-center justify-between">
            <h2 className="text-xl font-semibold text-gray-900">Edit Sale</h2>
            <button onClick={onCancel} className="text-gray-400 hover:text-gray-600">
              <X className="w-6 h-6" />
            </button>
          </div>
          <p className="text-sm text-gray-600 mt-1">
            Sale ID: {String(sale.saleId || sale.id).slice(-8).toUpperCase()}
          </p>
        </div>
        
        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Quantity
            </label>
            <input
              type="number"
              min="0.01"
              step="0.01"
              value={formData.quantity}
              onChange={(e) => handleInputChange('quantity', parseFloat(e.target.value) || 0)}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:ring-blue-500 focus:border-blue-500"
              required
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Weight (kg)
            </label>
            <input
              type="number"
              min="0"
              step="0.01"
              value={formData.weight}
              onChange={(e) => handleInputChange('weight', e.target.value)}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:ring-blue-500 focus:border-blue-500"
              placeholder="Optional"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Unit Price
            </label>
            <input
              type="number"
              min="0"
              step="0.01"
              value={formData.unitPrice}
              onChange={(e) => handleInputChange('unitPrice', parseFloat(e.target.value) || 0)}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:ring-blue-500 focus:border-blue-500"
              required
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Payment Method
            </label>
            <select
              value={formData.paymentMethod}
              onChange={(e) => handleInputChange('paymentMethod', e.target.value)}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:ring-blue-500 focus:border-blue-500"
            >
              <option value="cash">Cash</option>
              <option value="card">Card</option>
              <option value="credit">Credit</option>
              <option value="mobile">Mobile Payment</option>
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Notes
            </label>
            <textarea
              value={formData.notes}
              onChange={(e) => handleInputChange('notes', e.target.value)}
              rows={3}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:ring-blue-500 focus:border-blue-500"
              placeholder="Optional notes about this sale"
            />
          </div>

          <div className="bg-gray-50 p-4 rounded-lg">
            <div className="flex justify-between items-center">
              <span className="text-sm font-medium text-gray-700">Total Price:</span>
              <span className="text-lg font-bold text-gray-900">
                {formatCurrency(totalPrice)}
              </span>
            </div>
          </div>

          <div className="flex items-center justify-end space-x-3 pt-4">
            <button
              type="button"
              onClick={onCancel}
              className="px-4 py-2 text-gray-700 bg-gray-100 border border-gray-300 rounded-lg hover:bg-gray-200 transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
            >
              Save Changes
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// Bill Details Modal Component
function BillDetailsModal({
  bill,
  onClose,
  formatCurrency,
  products,
  suppliers,
  customers
}: {
  bill: any;
  onClose: () => void;
  formatCurrency: (amount: number) => string;
  products: any[];
  suppliers: any[];
  customers: any[];
}) {
  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
      <div className="bg-white rounded-lg max-w-4xl w-full max-h-[90vh] flex flex-col">
        <div className="p-6 border-b flex-shrink-0">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-xl font-semibold text-gray-900">Bill Details</h2>
              <p className="text-md text-gray-600 mt-1">{bill.bill_number}</p>
            </div>
            <button onClick={onClose} className="text-gray-400 hover:text-gray-600">
              <X className="w-6 h-6" />
            </button>
          </div>
        </div>

        <div className="p-6 overflow-y-auto flex-1">
          {/* Bill Header Info */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-6">
            <div className="bg-gray-50 p-4 rounded-lg">
              <h3 className="font-semibold text-gray-900 mb-3">Bill Information</h3>
              <div className="space-y-2 text-sm">
                <div><span className="font-medium">Bill Number:</span> {bill.bill_number}</div>
                <div><span className="font-medium">Date:</span> {new Date(bill.bill_date).toLocaleDateString()}</div>
                <div><span className="font-medium">Customer:</span> {bill.customer_name || 'Walk-in Customer'}</div>
                <div><span className="font-medium">Payment Method:</span> {bill.payment_method}</div>
                <div><span className="font-medium">Status:</span> 
                  <span className={`ml-2 px-2 py-1 rounded-full text-xs ${
                    bill.status === 'active' ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'
                  }`}>
                    {bill.status}
                  </span>
                </div>
              </div>
            </div>

            <div className="bg-blue-50 p-4 rounded-lg">
              <h3 className="font-semibold text-gray-900 mb-3">Payment Summary</h3>
              <div className="space-y-2 text-sm">
                <div className="flex justify-between">
                  <span>Subtotal:</span>
                  <span>{formatCurrency(bill.subtotal)}</span>
                </div>
                {bill.discount_amount > 0 && (
                  <div className="flex justify-between text-red-600">
                    <span>Discount:</span>
                    <span>-{formatCurrency(bill.discount_amount)}</span>
                  </div>
                )}
                {bill.tax_amount > 0 && (
                  <div className="flex justify-between">
                    <span>Tax:</span>
                    <span>{formatCurrency(bill.tax_amount)}</span>
                  </div>
                )}
                <div className="flex justify-between font-semibold border-t pt-2">
                  <span>Total:</span>
                  <span>{formatCurrency(bill.total_amount)}</span>
                </div>
                <div className="flex justify-between text-green-600">
                  <span>Amount Paid:</span>
                  <span>{formatCurrency(bill.amount_paid)}</span>
                </div>
                {bill.amount_due > 0 && (
                  <div className="flex justify-between text-red-600 font-medium">
                    <span>Amount Due:</span>
                    <span>{formatCurrency(bill.amount_due)}</span>
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Line Items */}
          <div className="mb-6">
            <h3 className="font-semibold text-gray-900 mb-3">Line Items</h3>
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-gray-200">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Product</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Supplier</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Quantity</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Weight</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Unit Price</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Total</th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-200">
                  {(bill.lineItems || []).map((item: any) => {
                    const product = products.find(p => p.id === item.product_id);
                    const supplier = suppliers.find(s => s.id === item.supplier_id);
                    return (
                      <tr key={item.id}>
                        <td className="px-4 py-4 text-sm text-gray-900">
                          {product?.name || item.product_name || 'Unknown Product'}
                        </td>
                        <td className="px-4 py-4 text-sm text-gray-900">
                          {supplier?.name || item.supplier_name || 'Unknown Supplier'}
                        </td>
                        <td className="px-4 py-4 text-sm text-gray-900">{item.quantity}</td>
                        <td className="px-4 py-4 text-sm text-gray-900">
                          {item.weight ? `${item.weight} kg` : '-'}
                        </td>
                        <td className="px-4 py-4 text-sm text-gray-900">
                          {formatCurrency(item.unit_price)}
                        </td>
                        <td className="px-4 py-4 text-sm font-medium text-gray-900">
                          {formatCurrency(item.line_total)}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>

          {/* Notes */}
          {bill.notes && (
            <div className="bg-yellow-50 p-4 rounded-lg">
              <h3 className="font-semibold text-gray-900 mb-2">Notes</h3>
              <p className="text-sm text-gray-700">{bill.notes}</p>
            </div>
          )}
        </div>

        <div className="px-6 py-4 border-t border-gray-200 flex justify-end flex-shrink-0">
          <button 
            onClick={onClose} 
            className="px-4 py-2 bg-gray-600 text-white rounded-lg hover:bg-gray-700 transition-colors"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}

// Edit Bill Modal Component
function EditBillModal({
  bill,
  onSave,
  onCancel,
  formatCurrency,
  customers
}: {
  bill: any;
  onSave: (updatedBill: any) => void;
  onCancel: () => void;
  formatCurrency: (amount: number) => string;
  customers: any[];
}) {
  const [formData, setFormData] = useState({
    customer_id: bill.customer_id || '',
    customer_name: bill.customer_name || '',
    payment_method: bill.payment_method || 'cash',
    payment_status: bill.payment_status || 'paid',
    amount_paid: bill.amount_paid || 0,
    discount_amount: bill.discount_amount || 0,
    tax_amount: bill.tax_amount || 0,
    notes: bill.notes || ''
  });

  const handleInputChange = (field: string, value: any) => {
    setFormData(prev => {
      const updated = { ...prev, [field]: value };
      
      // Update customer name when customer changes
      if (field === 'customer_id') {
        const customer = customers.find(c => c.id === value);
        updated.customer_name = customer?.name || '';
      }
      
      // Recalculate amount due when payment changes
      if (field === 'amount_paid' || field === 'discount_amount' || field === 'tax_amount') {
        const subtotal = bill.subtotal || 0;
        const tax = field === 'tax_amount' ? parseFloat(value) || 0 : updated.tax_amount;
        const discount = field === 'discount_amount' ? parseFloat(value) || 0 : updated.discount_amount;
        const paid = field === 'amount_paid' ? parseFloat(value) || 0 : updated.amount_paid;
        const total = subtotal + tax - discount;
        
        updated.amount_due = Math.max(0, total - paid);
        updated.payment_status = updated.amount_due > 0 ? 'partial' : 'paid';
      }
      
      return updated;
    });
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    
    const subtotal = bill.subtotal || 0;
    const total = subtotal + formData.tax_amount - formData.discount_amount;
    
    onSave({
      ...bill,
      ...formData,
      total_amount: total,
      amount_due: Math.max(0, total - formData.amount_paid)
    });
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
      <div className="bg-white rounded-lg max-w-2xl w-full max-h-[90vh] overflow-y-auto">
        <div className="p-6 border-b">
          <div className="flex items-center justify-between">
            <h2 className="text-xl font-semibold text-gray-900">Edit Bill</h2>
            <button onClick={onCancel} className="text-gray-400 hover:text-gray-600">
              <X className="w-6 h-6" />
            </button>
          </div>
          <p className="text-sm text-gray-600 mt-1">{bill.bill_number}</p>
        </div>
        
        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Customer</label>
              <select
                value={formData.customer_id}
                onChange={(e) => handleInputChange('customer_id', e.target.value)}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:ring-blue-500 focus:border-blue-500"
              >
                <option value="">Walk-in Customer</option>
                {customers.map(customer => (
                  <option key={customer.id} value={customer.id}>{customer.name}</option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Payment Method</label>
              <select
                value={formData.payment_method}
                onChange={(e) => handleInputChange('payment_method', e.target.value)}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:ring-blue-500 focus:border-blue-500"
              >
                <option value="cash">Cash</option>
                <option value="card">Card</option>
                <option value="credit">Credit</option>
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Amount Paid</label>
              <input
                type="number"
                min="0"
                step="0.01"
                value={formData.amount_paid}
                onChange={(e) => handleInputChange('amount_paid', e.target.value)}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:ring-blue-500 focus:border-blue-500"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Discount Amount</label>
              <input
                type="number"
                min="0"
                step="0.01"
                value={formData.discount_amount}
                onChange={(e) => handleInputChange('discount_amount', e.target.value)}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:ring-blue-500 focus:border-blue-500"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Tax Amount</label>
              <input
                type="number"
                min="0"
                step="0.01"
                value={formData.tax_amount}
                onChange={(e) => handleInputChange('tax_amount', e.target.value)}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:ring-blue-500 focus:border-blue-500"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Payment Status</label>
              <select
                value={formData.payment_status}
                onChange={(e) => handleInputChange('payment_status', e.target.value)}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:ring-blue-500 focus:border-blue-500"
              >
                <option value="paid">Paid</option>
                <option value="partial">Partial</option>
                <option value="pending">Pending</option>
              </select>
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">Notes</label>
            <textarea
              value={formData.notes}
              onChange={(e) => handleInputChange('notes', e.target.value)}
              rows={3}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:ring-blue-500 focus:border-blue-500"
              placeholder="Add notes about this bill..."
            />
          </div>

          {/* Calculated Totals Display */}
          <div className="bg-gray-50 p-4 rounded-lg">
            <h4 className="font-medium text-gray-900 mb-2">Calculated Totals</h4>
            <div className="grid grid-cols-2 gap-4 text-sm">
              <div>
                <span className="text-gray-600">Subtotal:</span>
                <span className="float-right font-medium">{formatCurrency(bill.subtotal)}</span>
              </div>
              <div>
                <span className="text-gray-600">After Adjustments:</span>
                <span className="float-right font-medium">
                  {formatCurrency(bill.subtotal + formData.tax_amount - formData.discount_amount)}
                </span>
              </div>
              <div>
                <span className="text-gray-600">Amount Due:</span>
                <span className="float-right font-medium text-red-600">
                  {formatCurrency(formData.amount_due || 0)}
                </span>
              </div>
            </div>
          </div>

          <div className="flex items-center justify-end space-x-3 pt-4">
            <button
              type="button"
              onClick={onCancel}
              className="px-4 py-2 text-gray-700 bg-gray-100 border border-gray-300 rounded-lg hover:bg-gray-200 transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors flex items-center"
            >
              <Save className="w-4 h-4 mr-2" />
              Save Changes
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// Audit Trail Modal Component
function AuditTrailModal({
  bill,
  auditLogs,
  onClose
}: {
  bill: any;
  auditLogs: any[];
  onClose: () => void;
}) {
  const getActionIcon = (action: string) => {
    switch (action) {
      case 'created': return <Plus className="w-4 h-4 text-green-600" />;
      case 'updated': return <Edit className="w-4 h-4 text-blue-600" />;
      case 'deleted': return <Trash2 className="w-4 h-4 text-red-600" />;
      case 'item_added': return <Plus className="w-4 h-4 text-green-600" />;
      case 'item_removed': return <Trash2 className="w-4 h-4 text-red-600" />;
      case 'item_modified': return <Edit className="w-4 h-4 text-blue-600" />;
      default: return <Activity className="w-4 h-4 text-gray-600" />;
    }
  };

  const getActionColor = (action: string) => {
    switch (action) {
      case 'created': return 'bg-green-100 text-green-800';
      case 'updated': return 'bg-blue-100 text-blue-800';
      case 'deleted': return 'bg-red-100 text-red-800';
      case 'item_added': return 'bg-green-100 text-green-800';
      case 'item_removed': return 'bg-red-100 text-red-800';
      case 'item_modified': return 'bg-blue-100 text-blue-800';
      default: return 'bg-gray-100 text-gray-800';
    }
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
      <div className="bg-white rounded-lg max-w-4xl w-full max-h-[90vh] flex flex-col">
        <div className="p-6 border-b flex-shrink-0">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-xl font-semibold text-gray-900">Audit Trail</h2>
              <p className="text-md text-gray-600 mt-1">{bill.bill_number}</p>
            </div>
            <button onClick={onClose} className="text-gray-400 hover:text-gray-600">
              <X className="w-6 h-6" />
            </button>
          </div>
        </div>

        <div className="p-6 overflow-y-auto flex-1">
          {auditLogs.length === 0 ? (
            <div className="text-center py-8">
              <History className="w-16 h-16 text-gray-300 mx-auto mb-4" />
              <h3 className="text-lg font-medium text-gray-900 mb-2">No Audit Trail</h3>
              <p className="text-gray-500">No changes have been recorded for this bill.</p>
            </div>
          ) : (
            <div className="space-y-4">
              {auditLogs.map((log: any) => (
                <div key={log.id} className="border border-gray-200 rounded-lg p-4">
                  <div className="flex items-start space-x-3">
                    <div className="flex-shrink-0 mt-1">
                      {getActionIcon(log.action)}
                    </div>
                    <div className="flex-1">
                      <div className="flex items-center justify-between">
                        <span className={`px-2 py-1 text-xs rounded-full font-medium ${getActionColor(log.action)}`}>
                          {log.action.replace(/_/g, ' ').toUpperCase()}
                        </span>
                        <span className="text-xs text-gray-500">
                          {new Date(log.created_at).toLocaleString()}
                        </span>
                      </div>
                      
                      <div className="mt-2">
                        <p className="text-sm text-gray-900 font-medium">
                          {log.change_reason || 'No reason provided'}
                        </p>
                        <p className="text-xs text-gray-600 mt-1">
                          Changed by: {log.changed_by}
                        </p>
                        
                        {log.field_changed && (
                          <div className="mt-2 text-xs">
                            <span className="text-gray-600">Field: </span>
                            <span className="font-mono bg-gray-100 px-1 rounded">{log.field_changed}</span>
                            {log.old_value && (
                              <div className="mt-1">
                                <span className="text-red-600">Old: </span>
                                <span className="font-mono text-xs">{log.old_value}</span>
                              </div>
                            )}
                            {log.new_value && (
                              <div className="mt-1">
                                <span className="text-green-600">New: </span>
                                <span className="font-mono text-xs">{log.new_value}</span>
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="px-6 py-4 border-t border-gray-200 flex justify-end flex-shrink-0">
          <button 
            onClick={onClose} 
            className="px-4 py-2 bg-gray-600 text-white rounded-lg hover:bg-gray-700 transition-colors"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}