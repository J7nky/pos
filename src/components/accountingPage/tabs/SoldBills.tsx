import { useState, useEffect, useCallback, useMemo } from 'react';
import { useSupabaseAuth } from '../../../contexts/SupabaseAuthContext';
import { useOfflineData } from '../../../contexts/OfflineDataContext';
import { useCurrency } from '../../../hooks/useCurrency';
import { useI18n } from '../../../i18n';
import { Pagination } from '../../common/Pagination';

import { 
  FileText, 
  Search, 
  Filter, 
  Eye, 
  Edit, 
  Trash2, 
  User, 
  DollarSign,
  Clock,
  CheckCircle,
  X,
  Save,
  Download,
  RefreshCw,
  History,
  CreditCard,
  Activity,

} from 'lucide-react';

interface Bill {
  id: string;
  bill_number: string;
  customer_id: string | null;
  subtotal: number;
  total_amount: number;
  payment_method: 'cash' | 'card' | 'credit';
  payment_status: 'paid' | 'partial' | 'pending';
  amount_paid: number;
  bill_date: string;
  notes: string | null;
  status: 'active' | 'cancelled' | 'refunded';
  created_by: string;
  created_at: string;
  updated_at: string;
  customers?: { name: string };
  users?: { name: string };
  _synced?: boolean;
}

interface BillLineItem {
  id: string;
  product_id: string;
  product_name: string;
  supplier_id: string;
  supplier_name: string;
  inventory_item_id: string | null;
  quantity: number;
  unit_price: number;
  line_total: number;
  weight: number | null;
  notes: string | null;
  line_order: number;
}

interface BillAuditLog {
  id: string;
  action: string;
  field_changed: string | null;
  old_value: string | null;
  new_value: string | null;
  change_reason: string | null;
  changed_by: string;
  created_at: string;
  users?: { name: string; email: string };
}

interface BillDetails extends Bill {
  bill_line_items: BillLineItem[];
  bill_audit_logs: BillAuditLog[];
  _synced?: boolean;
}

export default function InventoryLogs() {
  const { userProfile } = useSupabaseAuth();
  const raw = useOfflineData();
  const { formatCurrency } = useCurrency();
  const { t } = useI18n();
  const storeId = userProfile?.store_id;

  // Get data from offline context
  const customers = raw.customers.map(c => ({...c, isActive: c.is_active, createdAt: c.created_at, lb_balance: c.lb_balance || 0, usd_balance: c.usd_balance || 0}));

  // Helper function to get customer name - memoized for performance
  const getCustomerName = useCallback((customerId: string | null): string => {
    if (!customerId) return 'Walk-in Customer';
    const customer = customers.find(c => c.id === customerId);
    return customer?.name || 'Walk-in Customer';
  }, [customers]);

  // State
  const [bills, setBills] = useState<Bill[]>([]);
  const [selectedBill, setSelectedBill] = useState<BillDetails | null>(null);
  const [loading, setLoading] = useState(true);
  const [showBillDetails, setShowBillDetails] = useState(false);
  const [showEditBill, setShowEditBill] = useState(false);
  const [showAuditTrail, setShowAuditTrail] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [syncStatus, setSyncStatus] = useState<'idle' | 'syncing' | 'synced' | 'error'>('idle');

  // Filters
  const [searchTerm, setSearchTerm] = useState('');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [paymentStatusFilter, setPaymentStatusFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [showFilters, setShowFilters] = useState(true);
  
  // Pagination
  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 20;

  // Edit form state
  const [editForm, setEditForm] = useState<Partial<Bill>>({});


  // Toast state
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null);

  const showToast = (message: string, type: 'success' | 'error' = 'success') => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 3000);
  };

  // Load bills from offline context
  useEffect(() => {
    if (storeId) {
      loadBills();
      setCurrentPage(1); // Reset to first page when filters change
    }
  }, [storeId, searchTerm, dateFrom, dateTo, paymentStatusFilter, statusFilter]);

  const loadBills = async () => {
    if (!storeId) return;

    setLoading(true);
    setSyncStatus('syncing');
    
    try {
      const filters = {
        searchTerm: searchTerm || undefined,
        dateFrom: dateFrom || undefined,
        dateTo: dateTo || undefined,
        paymentStatus: paymentStatusFilter || undefined,
        status: statusFilter || undefined,
        limit: 100
      };

      const data = await raw.getBills(filters);
      setBills(data || []);
      setSyncStatus('synced');
      
      // Reset sync status after 3 seconds
      setTimeout(() => setSyncStatus('idle'), 3000);
    } catch (error) {
      console.error('Error loading bills:', error);
      showToast('Failed to load bills', 'error');
      setSyncStatus('error');
      
      // Reset sync status after 5 seconds
      setTimeout(() => setSyncStatus('idle'), 5000);
    } finally {
      setLoading(false);
    }
  };

  const loadBillDetails = async (billId: string) => {
    try {
      const data = await raw.getBillDetails(billId);
      setSelectedBill(data);
      setEditForm(data);
    } catch (error) {
      console.error('Error loading bill details:', error);
      showToast('Failed to load bill details', 'error');
    }
  };

  const handleViewBill = async (bill: Bill) => {
    await loadBillDetails(bill.id);
    setShowBillDetails(true);
  };

  const handleEditBill = async (bill: Bill) => {
    await loadBillDetails(bill.id);
    setShowEditBill(true);
  };

  const handleSaveBill = async () => {
    if (!selectedBill || !userProfile?.id) return;

    setIsEditing(true);
    try {
      const updates = {
        customer_id: editForm.customer_id,
        payment_method: editForm.payment_method,
        payment_status: editForm.payment_status,
        amount_paid: editForm.amount_paid || 0,
        notes: editForm.notes,
      };

      await raw.updateBill(selectedBill.id, updates, userProfile.id, 'Bill updated via Inventory Logs');

      showToast('Bill updated successfully');
      setShowEditBill(false);
      loadBills();
    } catch (error) {
      console.error('Error updating bill:', error);
      showToast('Failed to update bill', 'error');
    } finally {
      setIsEditing(false);
    }
  };

  const handleDeleteBill = async (bill: Bill, softDelete: boolean = true) => {
    if (!userProfile?.id) return;

    const confirmMessage = softDelete 
      ? `Are you sure you want to cancel bill ${bill.bill_number}? This will mark it as cancelled but keep it in the system.`
      : `Are you sure you want to permanently delete bill ${bill.bill_number}? This action cannot be undone.`;

    if (!confirm(confirmMessage)) return;

    try {
      await raw.deleteBill(bill.id, userProfile.id, softDelete ? 'Bill cancelled' : 'Bill permanently deleted', softDelete);

      showToast(`Bill ${softDelete ? 'cancelled' : 'deleted'} successfully`);
      loadBills();
    } catch (error) {
      console.error('Error deleting bill:', error);
      showToast('Failed to delete bill', 'error');
    }
  };

  // // Payment handlers
  // const handlePaymentSubmit = async (e: React.FormEvent) => {
  //   e.preventDefault();
    
  //   if (!paymentForm.amount || parseFloat(paymentForm.amount) <= 0) {
  //     showToast('Please enter a valid amount', 'error');
  //     return;
  //   }
    
  //   if (!paymentForm.entityId) {
  //     showToast(`Please select a ${paymentForm.entityType}`, 'error');
  //     return;
  //   }
    
  //   try {
  //     const amount = parseFloat(paymentForm.amount);
      
  //     if (paymentForm.entityType === 'customer') {
  //       const customer = customers.find(c => c.id === paymentForm.entityId);
  //       if (!customer) {
  //         showToast('Customer not found', 'error');
  //         return;
  //       }
        
  //       // Update customer balance
  //       const currentBalance = paymentForm.currency === 'LBP' ? customer.lb_balance : customer.usd_balance;
  //       const newBalance = Math.max(0, currentBalance - amount);
        
  //       await raw.updateCustomer(paymentForm.entityId, {
  //         [paymentForm.currency === 'LBP' ? 'lb_balance' : 'usd_balance']: newBalance
  //       });
        
  //       // Add transaction
  //       await raw.addTransaction({
  //         id: createId(),
  //         type: 'income',
  //         category: 'Customer Payment',
  //         customer_id: customer.id,
  //         amount: amount,
  //         currency: paymentForm.currency,
  //         description: `Payment from ${customer.name}: ${paymentForm.description}`,
  //         reference: paymentForm.reference,
  //         created_by: userProfile?.id || ''
  //       });
        
  //       showToast(`Payment received from ${customer.name}`, 'success');
  //     } else {
  //       const supplier = suppliers.find(s => s.id === paymentForm.entityId);
  //       if (!supplier) {
  //         showToast('Supplier not found', 'error');
  //         return;
  //       }
        
  //       // Update supplier balance
  //       const currentBalance = paymentForm.currency === 'LBP' ? (supplier.lb_balance || 0) : (supplier.usd_balance || 0);
  //       const newBalance = Math.max(0, currentBalance - amount);
        
  //       await raw.updateSupplier(paymentForm.entityId, {
  //         [paymentForm.currency === 'LBP' ? 'lb_balance' : 'usd_balance']: newBalance
  //       });
        
  //       // Add transaction
  //       await raw.addTransaction({
  //         id: createId(),
  //         type: 'expense',
  //         category: 'Supplier Payment',
  //         supplier_id: supplier.id,
  //         amount: amount,
  //         currency: paymentForm.currency,
  //         description: `Payment to ${supplier.name}: ${paymentForm.description}`,
  //         reference: paymentForm.reference,
  //         created_by: userProfile?.id || ''
  //       });
        
  //       showToast(`Payment sent to ${supplier.name}`, 'success');
  //     }
      
  //     setPaymentForm({
  //       entityId: '',
  //       entityType: 'customer',
  //       amount: '',
  //       currency: 'USD',
  //       description: '',
  //       reference: ''
  //     });
  //     setShowPaymentForm(null);
      
  //   } catch (error) {
  //     console.error('Error processing payment:', error);
  //     showToast('Failed to process payment', 'error');
  //   }
  // };

  // // Receive products handler
  // const handleReceiveSubmit = async (e: React.FormEvent) => {
  //   e.preventDefault();
    
  //   if (!receiveForm.productId || !receiveForm.supplierId || !receiveForm.quantity) {
  //     showToast('Please fill in all required fields', 'error');
  //     return;
  //   }
    
  //   try {
  //     await raw.addInventoryItem({
  //       id: createId(),
  //       product_id: receiveForm.productId,
  //       supplier_id: receiveForm.supplierId,
  //       quantity: parseInt(receiveForm.quantity),
  //       unit: receiveForm.unit,
  //       weight: receiveForm.weight ? parseFloat(receiveForm.weight) : null,
  //       price: receiveForm.price ? parseFloat(receiveForm.price) : null,
  //       received_quantity: parseInt(receiveForm.quantity),
  //     });
      
  //     const product = products.find(p => p.id === receiveForm.productId);
  //     const supplier = suppliers.find(s => s.id === receiveForm.supplierId);
      
  //     showToast(`Received ${receiveForm.quantity} ${receiveForm.unit} of ${product?.name} from ${supplier?.name}`, 'success');

  //   }
  // };

  const exportBills = () => {
    const csvContent = [
      ['Bill Number', 'Date', 'Customer', 'Total', 'Payment Status', 'Status'].join(','),
      ...bills.map(bill => [
        bill.bill_number,
        new Date(bill.bill_date).toLocaleDateString(),
        getCustomerName(bill.customer_id),
        bill.total_amount.toFixed(2),
        bill.payment_status,
        bill.status
      ].join(','))
    ].join('\n');

    const blob = new Blob([csvContent], { type: 'text/csv' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `bills-${new Date().toISOString().split('T')[0]}.csv`;
    a.click();
    window.URL.revokeObjectURL(url);
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'active': return 'bg-green-100 text-green-800';
      case 'cancelled': return 'bg-red-100 text-red-800';
      case 'refunded': return 'bg-yellow-100 text-yellow-800';
      default: return 'bg-gray-100 text-gray-800';
    }
  };

  const getPaymentStatusColor = (status: string) => {
    switch (status) {
      case 'paid': return 'bg-green-100 text-green-800';
      case 'partial': return 'bg-yellow-100 text-yellow-800';
      case 'pending': return 'bg-red-100 text-red-800';
      default: return 'bg-gray-100 text-gray-800';
    }
  };

  // // Memoize expensive analytics calculations
  // const analytics = useMemo(() => {
  //   const today = new Date().toDateString();
  //   return {
  //     totalBills: bills.length,
  //     totalRevenue: bills.reduce((sum, bill) => sum + bill.total_amount, 0),
  //     paidBills: bills.filter(b => b.payment_status === 'paid').length,
  //     pendingAmount: bills.filter(b => b.payment_status !== 'paid').reduce((sum, bill) => sum + (bill.total_amount - bill.amount_paid), 0),
  //     todaysBills: bills.filter(b => new Date(b.bill_date).toDateString() === today).length,
  //     recentInventory: inventory.slice(0, 5),
  //     lowStockItems: raw.stockLevels.filter(item => item.currentStock < raw.lowStockThreshold),
  //     customerDebt: customers.reduce((sum, c) => sum + (c.lb_balance + c.usd_balance), 0),
  //     supplierDebt: suppliers.reduce((sum, s) => sum + ((s.lb_balance || 0) + (s.usd_balance || 0)), 0),
  //     syncedBills: bills.filter(b => b._synced).length,
  //     pendingSyncBills: bills.filter(b => !b._synced).length
  //   };
  // }, [bills, inventory, raw.stockLevels, raw.lowStockThreshold, customers, suppliers]);
  // // Calculate analytics


  if (loading) {
    return (
      <div className="flex items-center justify-center py-8">
        <RefreshCw className="w-6 h-6 animate-spin text-gray-400 rtl:ml-2 ltr:mr-2" />
        <span className="text-gray-500 rtl:text-right">{t('soldBills.loadingFinancialOperations')}</span>
      </div>
    );
  }
  return (
    <div>
      {/* Toast */}
      {toast && (
        <div className={`fixed top-4 right-4 px-4 py-2 rounded shadow-lg z-50 text-white ${
          toast.type === 'success' ? 'bg-green-600' : 'bg-red-600'
        }`}>
          {toast.message}
        </div>
      )}

      {/* Header */}
      <div className="flex items-center justify-between rtl:flex-row-reverse">
        <div className="flex items-center rtl:space-x-reverse">
          <Activity className="w-6 h-6 text-blue-600 rtl:ml-3 ltr:mr-3" />
          <div className="rtl:text-right">
            <h2 className="text-2xl font-bold text-gray-900">{t('soldBills.title')}</h2>
            <p className="text-gray-600">{t('soldBills.subtitle')}</p>
          </div>
        </div>
        
        <div className="flex items-center space-x-2 rtl:space-x-reverse">
          {/* Sync Status Indicator */}
          <div className="flex items-center space-x-2 px-3 py-2 rounded-lg bg-gray-100 rtl:space-x-reverse">
            <div className={`w-2 h-2 rounded-full ${
              syncStatus === 'syncing' ? 'bg-yellow-500 animate-pulse' :
              syncStatus === 'synced' ? 'bg-green-500' :
              syncStatus === 'error' ? 'bg-red-500' :
              'bg-gray-400'
            }`} />
            <span className="text-sm text-gray-600 rtl:text-right">
              {syncStatus === 'syncing' ? t('soldBills.syncing') :
               syncStatus === 'synced' ? t('soldBills.synced') :
               syncStatus === 'error' ? t('soldBills.syncError') :
               t('soldBills.offline')}
            </span>
          </div>
          
          <button
            onClick={() => setShowFilters(!showFilters)}
            className={`p-2 rounded-lg transition-colors ${
              showFilters ? 'bg-blue-100 text-blue-600' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
            }`}
          >
            <Filter className="w-4 h-4" />
          </button>
          <button
            onClick={exportBills}
            className="bg-green-600 text-white px-4 py-2 rounded-lg hover:bg-green-700 transition-colors flex items-center"
          >
            <Download className="w-4 h-4 rtl:ml-2 ltr:mr-2" />
            {t('soldBills.export')}
          </button>
          <button
            onClick={loadBills}
            className="bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 transition-colors flex items-center"
          >
            <RefreshCw className="w-4 h-4 rtl:ml-2 ltr:mr-2" />
            {t('soldBills.refresh')}
          </button>
          <button
            onClick={async () => {
              setSyncStatus('syncing');
              try {
                await raw.sync();
                setSyncStatus('synced');
                setTimeout(() => setSyncStatus('idle'), 3000);
                showToast(t('soldBills.syncCompletedSuccessfully'), 'success');
              } catch (error) {
                console.error('Sync failed:', error);
                setSyncStatus('error');
                setTimeout(() => setSyncStatus('idle'), 5000);
                showToast(t('soldBills.syncFailed'), 'error');
              }
            }}
            className="bg-purple-600 text-white px-4 py-2 rounded-lg hover:bg-purple-700 transition-colors flex items-center"
            disabled={syncStatus === 'syncing'}
          >
            <RefreshCw className={`w-4 h-4 rtl:ml-2 ltr:mr-2 ${syncStatus === 'syncing' ? 'animate-spin' : ''}`} />
            {syncStatus === 'syncing' ? t('soldBills.syncing') : t('soldBills.sync')}
          </button>
        </div>
      </div>

     

      {/* Search and Filters */}
      { (
        <div className="bg-white rounded-lg shadow-sm p-4">
          <div className="flex items-center space-x-4 mb-4 rtl:space-x-reverse">
            <div className="flex-1 relative">
              <Search className="w-5 h-5 absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 rtl:left-auto rtl:right-3" />
              <input
                type="text"
                placeholder={t('soldBills.searchPlaceholder')}
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-blue-500 focus:border-blue-500 rtl:pl-4 rtl:pr-10"
              />
            </div>
          </div>

          {showFilters && (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 pt-4 border-t border-gray-200">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1 rtl:text-right">{t('soldBills.dateFrom')}</label>
                <input
                  type="date"
                  value={dateFrom}
                  onChange={(e) => setDateFrom(e.target.value)}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:ring-blue-500 focus:border-blue-500"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1 rtl:text-right">{t('soldBills.dateTo')}</label>
                <input
                  type="date"
                  value={dateTo}
                  onChange={(e) => setDateTo(e.target.value)}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:ring-blue-500 focus:border-blue-500"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1 rtl:text-right">{t('soldBills.paymentStatus')}</label>
                <select
                  value={paymentStatusFilter}
                  onChange={(e) => setPaymentStatusFilter(e.target.value)}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:ring-blue-500 focus:border-blue-500"
                >
                  <option value="">{t('soldBills.allPaymentStatus')}</option>
                  <option value="paid">{t('soldBills.paid')}</option>
                  <option value="partial">{t('soldBills.partial')}</option>
                  <option value="pending">{t('soldBills.pending')}</option>
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1 rtl:text-right">{t('soldBills.billStatus')}</label>
                <select
                  value={statusFilter}
                  onChange={(e) => setStatusFilter(e.target.value)}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:ring-blue-500 focus:border-blue-500"
                >
                  <option value="">{t('soldBills.allStatus')}</option>
                  <option value="active">{t('soldBills.active')}</option>
                  <option value="cancelled">{t('soldBills.cancelled')}</option>
                  <option value="refunded">{t('soldBills.refunded')}</option>
                </select>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Bills Management Tab */}
      { (
        <div className="bg-white rounded-lg shadow-sm overflow-hidden">
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider rtl:text-right">
                    {t('soldBills.billDetails')}
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider rtl:text-right">
                    {t('soldBills.customer')}
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider rtl:text-right">
                    {t('soldBills.amount')}
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider rtl:text-right">
                    {t('soldBills.payment')}
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider rtl:text-right">
                    {t('soldBills.status')}
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider rtl:text-right">
                    {t('soldBills.actions')}
                  </th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {bills.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="px-6 py-8 text-center text-gray-500">
                      <FileText className="w-12 h-12 mx-auto mb-4 text-gray-300" />
                      <p className="text-lg font-medium rtl:text-right">{t('soldBills.noBillsFound')}</p>
                      <p className="text-sm rtl:text-right">{t('soldBills.noBillsMessage')}</p>
                    </td>
                  </tr>
                ) : (
                  (() => {
                    const sortedBills = [...bills].sort((a, b) => new Date(b.bill_date).getTime() - new Date(a.bill_date).getTime());
                    const startIndex = (currentPage - 1) * itemsPerPage;
                    const paginatedBills = sortedBills.slice(startIndex, startIndex + itemsPerPage);
                    return paginatedBills.map((bill) => (
                    <tr key={bill.id} className="hover:bg-gray-50">
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="rtl:text-right">
                          <div className="text-sm font-medium text-gray-900">{bill.bill_number}</div>
                          <div className="text-sm text-gray-500">
                            {new Date(bill.bill_date).toLocaleDateString()} at {new Date(bill.bill_date).toLocaleTimeString()}
                          </div>
                          <div className="text-xs text-gray-400">
                            {t('soldBills.createdBy')} {bill.users?.name || t('soldBills.unknown')}
                          </div>
                        </div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="flex items-center rtl:space-x-reverse">
                          <User className="w-4 h-4 text-gray-400 rtl:ml-2 ltr:mr-2" />
                          <span className="text-sm text-gray-900 rtl:text-right">
                            {getCustomerName(bill.customer_id)}
                          </span>
                        </div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="rtl:text-right">
                          <div className="text-sm font-medium text-gray-900">
                            {formatCurrency(bill.total_amount)}
                          </div>
                          {bill.total_amount - bill.amount_paid > 0 && (
                            <div className="text-xs text-red-600">
                              {t('soldBills.due')}: {formatCurrency(bill.total_amount - bill.amount_paid)}
                            </div>
                          )}
                        </div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="flex items-center space-x-2 rtl:space-x-reverse">
                          <span className={`px-2 py-1 text-xs rounded-full ${getPaymentStatusColor(bill.payment_status)}`}>
                            {t(`soldBills.${bill.payment_status}`)}
                          </span>
                          <div className="flex items-center text-xs text-gray-500 rtl:space-x-reverse">
                            {bill.payment_method === 'cash' && <DollarSign className="w-3 h-3" />}
                            {bill.payment_method === 'card' && <CreditCard className="w-3 h-3" />}
                            {bill.payment_method === 'credit' && <Clock className="w-3 h-3" />}
                            <span className="rtl:mr-1 ltr:ml-1 capitalize">{t(`soldBills.${bill.payment_method}`)}</span>
                          </div>
                        </div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="flex items-center space-x-2 rtl:space-x-reverse">
                          <span className={`px-2 py-1 text-xs rounded-full ${getStatusColor(bill.status)}`}>
                            {t(`soldBills.${bill.status}`)}
                          </span>
                          <div className="flex items-center space-x-1 rtl:space-x-reverse">
                            {bill._synced ? (
                              <CheckCircle className="w-3 h-3 text-green-500" />
                            ) : (
                              <Clock className="w-3 h-3 text-yellow-500" />
                            )}
                          </div>
                        </div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm font-medium">
                        <div className="flex items-center space-x-2 rtl:space-x-reverse">
                          <button
                            onClick={() => handleViewBill(bill)}
                            className="text-blue-600 hover:text-blue-900"
                            title={t('soldBills.viewDetails')}
                          >
                            <Eye className="w-4 h-4" />
                          </button>
                          {(userProfile?.role === 'admin' || userProfile?.role === 'manager') && (
                            <button
                              onClick={() => handleEditBill(bill)}
                              className="text-green-600 hover:text-green-900"
                              title={t('soldBills.editBill')}
                            >
                              <Edit className="w-4 h-4" />
                            </button>
                          )}
                          {userProfile?.role === 'admin' && (
                            <button
                              onClick={() => handleDeleteBill(bill)}
                              className="text-red-600 hover:text-red-900"
                              title={t('soldBills.cancelBill')}
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          )}
                          <button
                            onClick={async () => {
                              await loadBillDetails(bill.id);
                              setShowAuditTrail(true);
                            }}
                            className="text-purple-600 hover:text-purple-900"
                            title={t('soldBills.viewAuditTrail')}
                          >
                            <History className="w-4 h-4" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ));
                  })()
                )}
              </tbody>
            </table>
          </div>
          {bills.length > itemsPerPage && (
            <Pagination
              currentPage={currentPage}
              totalPages={Math.ceil(bills.length / itemsPerPage)}
              onPageChange={(page) => {
                setCurrentPage(page);
                // Scroll to top of table when page changes
                window.scrollTo({ top: 0, behavior: 'smooth' });
              }}
              itemsPerPage={itemsPerPage}
              totalItems={bills.length}
            />
          )}
        </div>
      )}


   

      {/* Bill Details Modal */}
      {showBillDetails && selectedBill && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-lg max-w-4xl w-full max-h-[90vh] overflow-y-auto">
            <div className="p-6 border-b flex items-center justify-between rtl:flex-row-reverse">
              <div className="flex items-center space-x-3 rtl:space-x-reverse">
                <h2 className="text-xl font-semibold text-gray-900 rtl:text-right">
                  {t('soldBills.billDetails')} - {selectedBill.bill_number}
                </h2>
                <div className="flex items-center space-x-1 rtl:space-x-reverse">
                  {selectedBill._synced ? (
                    <CheckCircle className="w-5 h-5 text-green-500" />
                  ) : (
                    <Clock className="w-5 h-5 text-yellow-500" />
                  )}
                </div>
              </div>
              <button
                onClick={() => setShowBillDetails(false)}
                className="text-gray-400 hover:text-gray-600"
              >
                <X className="w-6 h-6" />
              </button>
            </div>

            <div className="p-6 space-y-6">
              {/* Bill Header */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div>
                  <h3 className="text-lg font-medium text-gray-900 mb-4 rtl:text-right">{t('soldBills.billInformation')}</h3>
                  <div className="space-y-2">
                    <div className="flex justify-between rtl:flex-row-reverse">
                      <span className="text-gray-600 rtl:text-right">{t('soldBills.billNumber')}:</span>
                      <span className="font-medium rtl:text-right">{selectedBill.bill_number}</span>
                    </div>
                    <div className="flex justify-between rtl:flex-row-reverse">
                      <span className="text-gray-600 rtl:text-right">{t('soldBills.date')}:</span>
                      <span className="font-medium rtl:text-right">{new Date(selectedBill.bill_date).toLocaleString()}</span>
                    </div>
                    <div className="flex justify-between rtl:flex-row-reverse">
                      <span className="text-gray-600 rtl:text-right">{t('soldBills.customer')}:</span>
                      <span className="font-medium rtl:text-right">{getCustomerName(selectedBill.customer_id)}</span>
                    </div>
                    <div className="flex justify-between rtl:flex-row-reverse">
                      <span className="text-gray-600 rtl:text-right">{t('soldBills.paymentMethod')}:</span>
                      <span className="font-medium rtl:text-right capitalize">{t(`soldBills.${selectedBill.payment_method}`)}</span>
                    </div>
                  </div>
                </div>

                <div>
                  <h3 className="text-lg font-medium text-gray-900 mb-4 rtl:text-right">{t('soldBills.paymentInformation')}</h3>
                  <div className="space-y-2">
                    <div className="flex justify-between rtl:flex-row-reverse">
                      <span className="text-gray-600 rtl:text-right">{t('soldBills.subtotal')}:</span>
                      <span className="font-medium rtl:text-right">{formatCurrency(selectedBill.subtotal)}</span>
                    </div>
                    <div className="flex justify-between border-t pt-2 rtl:flex-row-reverse">
                      <span className="text-gray-900 font-semibold rtl:text-right">{t('soldBills.total')}:</span>
                      <span className="font-bold text-lg rtl:text-right">{formatCurrency(selectedBill.total_amount)}</span>
                    </div>
                    <div className="flex justify-between rtl:flex-row-reverse">
                      <span className="text-gray-600 rtl:text-right">{t('soldBills.amountPaid')}:</span>
                      <span className="font-medium text-green-600 rtl:text-right">{formatCurrency(selectedBill.amount_paid)}</span>
                    </div>
                    {selectedBill.total_amount - selectedBill.amount_paid > 0 && (
                      <div className="flex justify-between rtl:flex-row-reverse">
                        <span className="text-gray-600 rtl:text-right">{t('soldBills.amountDue')}:</span>
                        <span className="font-medium text-red-600 rtl:text-right">{formatCurrency(selectedBill.total_amount - selectedBill.amount_paid)}</span>
                      </div>
                    )}
                  </div>
                </div>
              </div>

              {/* Line Items */}
              <div>
                <h3 className="text-lg font-medium text-gray-900 mb-4 rtl:text-right">{t('soldBills.lineItems')}</h3>
                <div className="overflow-x-auto">
                  <table className="min-w-full divide-y divide-gray-200">
                    <thead className="bg-gray-50">
                      <tr>
                        <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase rtl:text-right">{t('soldBills.product')}</th>
                        <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase rtl:text-right">{t('soldBills.supplier')}</th>
                        <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase rtl:text-right">{t('soldBills.quantity')}</th>
                        <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase rtl:text-right">{t('soldBills.price')}</th>
                        <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase rtl:text-right">{t('soldBills.total')}</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-200">
                      {selectedBill.bill_line_items?.map((item) => (
                        <tr key={item.id}>
                          <td className="px-4 py-3 text-sm text-gray-900">{item.product_name}</td>
                          <td className="px-4 py-3 text-sm text-gray-600">{item.supplier_name}</td>
                          <td className="px-4 py-3 text-sm text-gray-900">
                            {item.quantity}
                            {item.weight && <div className="text-xs text-gray-500">{item.weight}kg</div>}
                          </td>
                          <td className="px-4 py-3 text-sm text-gray-900">{formatCurrency(item.unit_price)}</td>
                          <td className="px-4 py-3 text-sm font-medium text-gray-900">{formatCurrency(item.line_total)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* Notes */}
              {selectedBill.notes && (
                <div>
                  <h3 className="text-lg font-medium text-gray-900 mb-2 rtl:text-right">{t('soldBills.notes')}</h3>
                  <p className="text-gray-600 bg-gray-50 p-3 rounded-lg rtl:text-right">{selectedBill.notes}</p>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Edit Bill Modal */}
      {showEditBill && selectedBill && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-lg max-w-2xl w-full max-h-[90vh] overflow-y-auto">
            <div className="p-6 border-b flex items-center justify-between rtl:flex-row-reverse">
              <h2 className="text-xl font-semibold text-gray-900 rtl:text-right">
                {t('soldBills.editBill')} - {selectedBill.bill_number}
              </h2>
              <button
                onClick={() => setShowEditBill(false)}
                className="text-gray-400 hover:text-gray-600"
              >
                <X className="w-6 h-6" />
              </button>
            </div>

            <div className="p-6 space-y-6">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2 rtl:text-right">{t('soldBills.customer')}</label>
                  <select
                    value={editForm.customer_id || ''}
                    onChange={(e) => setEditForm(prev => ({ ...prev, customer_id: e.target.value || null }))}
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:ring-blue-500 focus:border-blue-500"
                  >
                    <option value="">{t('soldBills.walkInCustomer')}</option>
                    {customers.map(customer => (
                      <option key={customer.id} value={customer.id}>
                        {customer.name}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2 rtl:text-right">{t('soldBills.paymentMethod')}</label>
                  <select
                    value={editForm.payment_method || 'cash'}
                    onChange={(e) => setEditForm(prev => ({ ...prev, payment_method: e.target.value as any }))}
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:ring-blue-500 focus:border-blue-500"
                  >
                    <option value="cash">{t('soldBills.cash')}</option>
                    <option value="card">{t('soldBills.card')}</option>
                    <option value="credit">{t('soldBills.credit')}</option>
                  </select>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2 rtl:text-right">{t('soldBills.amountPaid')}</label>
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    value={editForm.amount_paid || 0}
                    onChange={(e) => {
                      const amountPaid = parseFloat(e.target.value) || 0;
                      const totalAmount = editForm.total_amount || 0;
                      const amountDue = Math.max(0, totalAmount - amountPaid);
                      const paymentStatus = amountDue === 0 ? 'paid' : amountPaid > 0 ? 'partial' : 'pending';
                      setEditForm(prev => ({ 
                        ...prev, 
                        amount_paid: amountPaid,
                        payment_status: paymentStatus as any
                      }));
                    }}
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:ring-blue-500 focus:border-blue-500"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2 rtl:text-right">{t('soldBills.paymentStatus')}</label>
                  <select
                    value={editForm.payment_status || 'pending'}
                    onChange={(e) => setEditForm(prev => ({ ...prev, payment_status: e.target.value as any }))}
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:ring-blue-500 focus:border-blue-500"
                  >
                    <option value="paid">{t('soldBills.paid')}</option>
                    <option value="partial">{t('soldBills.partial')}</option>
                    <option value="pending">{t('soldBills.pending')}</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2 rtl:text-right">{t('soldBills.notes')}</label>
                <textarea
                  value={editForm.notes || ''}
                  onChange={(e) => setEditForm(prev => ({ ...prev, notes: e.target.value }))}
                  rows={3}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:ring-blue-500 focus:border-blue-500"
                  placeholder={t('soldBills.addNotesPlaceholder')}
                />
              </div>

              <div className="flex justify-end space-x-3 pt-6 border-t border-gray-200 rtl:space-x-reverse">
                <button
                  onClick={() => setShowEditBill(false)}
                  className="px-6 py-2 text-gray-700 border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors"
                  disabled={isEditing}
                >
                  {t('soldBills.cancel')}
                </button>
                <button
                  onClick={handleSaveBill}
                  disabled={isEditing}
                  className="px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors font-medium flex items-center"
                >
                  {isEditing ? (
                    <>
                      <RefreshCw className="w-4 h-4 rtl:ml-2 ltr:mr-2 animate-spin" />
                      {t('soldBills.saving')}
                    </>
                  ) : (
                    <>
                      <Save className="w-4 h-4 rtl:ml-2 ltr:mr-2" />
                      {t('soldBills.saveChanges')}
                    </>
                  )}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Audit Trail Modal */}
      {showAuditTrail && selectedBill && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-lg max-w-3xl w-full max-h-[90vh] overflow-y-auto">
            <div className="p-6 border-b flex items-center justify-between rtl:flex-row-reverse">
              <h2 className="text-xl font-semibold text-gray-900 rtl:text-right">
                {t('soldBills.auditTrail')} - {selectedBill.bill_number}
              </h2>
              <button
                onClick={() => setShowAuditTrail(false)}
                className="text-gray-400 hover:text-gray-600"
              >
                <X className="w-6 h-6" />
              </button>
            </div>

            <div className="p-6">
              {selectedBill.bill_audit_logs && selectedBill.bill_audit_logs.length > 0 ? (
                <div className="space-y-4">
                  {selectedBill.bill_audit_logs.map((log) => (
                    <div key={log.id} className="border border-gray-200 rounded-lg p-4">
                      <div className="flex items-center justify-between mb-2">
                        <div className="flex items-center">
                          <div className={`w-3 h-3 rounded-full mr-3 ${
                            log.action === 'created' ? 'bg-green-500' :
                            log.action === 'updated' ? 'bg-blue-500' :
                            log.action === 'deleted' ? 'bg-red-500' :
                            'bg-gray-500'
                          }`} />
                          <span className="font-medium text-gray-900 capitalize">
                            {log.action.replace('_', ' ')}
                          </span>
                        </div>
                        <span className="text-sm text-gray-500">
                          {new Date(log.created_at).toLocaleString()}
                        </span>
                      </div>
                      
                      <div className="text-sm text-gray-600 mb-2 rtl:text-right">
                        {t('soldBills.changedBy')}: {log.users?.name || t('soldBills.unknownUser')}
                      </div>
                      
                      {log.field_changed && (
                        <div className="text-sm text-gray-600 mb-2 rtl:text-right">
                          {t('soldBills.field')}: <span className="font-mono bg-gray-100 px-1 rounded">{log.field_changed}</span>
                        </div>
                      )}
                      
                      {log.change_reason && (
                        <div className="text-sm text-gray-600 mb-2 rtl:text-right">
                          {t('soldBills.reason')}: {log.change_reason}
                        </div>
                      )}
                      
                      {(log.old_value || log.new_value) && (
                        <div className="text-xs text-gray-500 bg-gray-50 p-2 rounded rtl:text-right">
                          {log.old_value && (
                            <div className="mb-1">
                              <span className="font-medium">{t('soldBills.old')}:</span> {log.old_value.length > 100 ? `${log.old_value.substring(0, 100)}...` : log.old_value}
                            </div>
                          )}
                          {log.new_value && (
                            <div>
                              <span className="font-medium">{t('soldBills.new')}:</span> {log.new_value.length > 100 ? `${log.new_value.substring(0, 100)}...` : log.new_value}
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              ) : (
                <div className="text-center py-8 text-gray-500">
                  <History className="w-12 h-12 mx-auto mb-4 text-gray-300" />
                  <p className="rtl:text-right">{t('soldBills.noAuditTrailAvailable')}</p>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}