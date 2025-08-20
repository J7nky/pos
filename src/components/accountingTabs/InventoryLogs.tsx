import React, { useState, useEffect } from 'react';
import { useSupabaseAuth } from '../../contexts/SupabaseAuthContext';
import { useOfflineData } from '../../contexts/OfflineDataContext';
import { SupabaseService } from '../../services/supabaseService';
import { useCurrency } from '../../hooks/useCurrency';
import SearchableSelect from '../common/SearchableSelect';
import MoneyInput from '../common/MoneyInput';
import { 
  FileText, 
  Search, 
  Filter, 
  Eye, 
  Edit, 
  Trash2, 
  Plus, 
  Calendar, 
  User, 
  DollarSign,
  Clock,
  AlertTriangle,
  CheckCircle,
  X,
  Save,
  Download,
  RefreshCw,
  History,
  CreditCard,
  Receipt,
  Package,
  TrendingUp,
  TrendingDown,
  Truck,
  ShoppingCart,
  Wallet,
  Building2,
  ArrowUpRight,
  ArrowDownRight,
  PlusCircle,
  MinusCircle,
  Activity,
  BarChart3
} from 'lucide-react';

interface Bill {
  id: string;
  bill_number: string;
  customer_id: string | null;
  customer_name: string | null;
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
}

export default function InventoryLogs() {
  const { userProfile } = useSupabaseAuth();
  const raw = useOfflineData();
  const { formatCurrency } = useCurrency();
  const storeId = userProfile?.store_id;

  // Get data from offline context
  const customers = raw.customers.map(c => ({...c, isActive: c.is_active, createdAt: c.created_at, lb_balance: c.lb_balance || 0, usd_balance: c.usd_balance || 0}));
  const suppliers = raw.suppliers.map(s => ({...s, createdAt: s.created_at}));
  const inventory = raw.inventory;
  const products = raw.products;
  const transactions = raw.transactions;

  // State
  const [activeTab, setActiveTab] = useState<'bills' | 'inventory' | 'payments' | 'analytics'>('bills');
  const [bills, setBills] = useState<Bill[]>([]);
  const [selectedBill, setSelectedBill] = useState<BillDetails | null>(null);
  const [loading, setLoading] = useState(true);
  const [showBillDetails, setShowBillDetails] = useState(false);
  const [showEditBill, setShowEditBill] = useState(false);
  const [showAuditTrail, setShowAuditTrail] = useState(false);
  const [showPaymentForm, setShowPaymentForm] = useState<'customer' | 'supplier' | null>(null);
  const [showReceiveForm, setShowReceiveForm] = useState(false);
  const [isEditing, setIsEditing] = useState(false);

  // Filters
  const [searchTerm, setSearchTerm] = useState('');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [paymentStatusFilter, setPaymentStatusFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [showFilters, setShowFilters] = useState(false);

  // Edit form state
  const [editForm, setEditForm] = useState<Partial<Bill>>({});

  // Payment form state
  const [paymentForm, setPaymentForm] = useState({
    entityId: '',
    entityType: 'customer' as 'customer' | 'supplier',
    amount: '',
    currency: 'USD' as 'USD' | 'LBP',
    description: '',
    reference: ''
  });

  // Receive form state
  const [receiveForm, setReceiveForm] = useState({
    productId: '',
    supplierId: '',
    quantity: '',
    unit: 'kg' as 'kg' | 'piece' | 'box' | 'bag',
    weight: '',
    price: '',
    type: 'commission' as 'commission' | 'cash',
    commissionRate: '10',
    notes: ''
  });

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
    }
  }, [storeId, searchTerm, dateFrom, dateTo, paymentStatusFilter, statusFilter]);

  const loadBills = async () => {
    if (!storeId) return;

    setLoading(true);
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
    } catch (error) {
      console.error('Error loading bills:', error);
      showToast('Failed to load bills', 'error');
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
        customer_name: editForm.customer_name,
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

  // Payment handlers
  const handlePaymentSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!paymentForm.amount || parseFloat(paymentForm.amount) <= 0) {
      showToast('Please enter a valid amount', 'error');
      return;
    }
    
    if (!paymentForm.entityId) {
      showToast(`Please select a ${paymentForm.entityType}`, 'error');
      return;
    }
    
    try {
      const amount = parseFloat(paymentForm.amount);
      
      if (paymentForm.entityType === 'customer') {
        const customer = customers.find(c => c.id === paymentForm.entityId);
        if (!customer) {
          showToast('Customer not found', 'error');
          return;
        }
        
        // Update customer balance
        const currentBalance = paymentForm.currency === 'LBP' ? customer.lb_balance : customer.usd_balance;
        const newBalance = Math.max(0, currentBalance - amount);
        
        await raw.updateCustomer(paymentForm.entityId, {
          [paymentForm.currency === 'LBP' ? 'lb_balance' : 'usd_balance']: newBalance
        });
        
        // Add transaction
        await raw.addTransaction({
          type: 'income',
          category: 'Customer Payment',
          amount: amount,
          currency: paymentForm.currency,
          description: `Payment from ${customer.name}: ${paymentForm.description}`,
          reference: paymentForm.reference,
          created_by: userProfile?.id || ''
        });
        
        showToast(`Payment received from ${customer.name}`, 'success');
      } else {
        const supplier = suppliers.find(s => s.id === paymentForm.entityId);
        if (!supplier) {
          showToast('Supplier not found', 'error');
          return;
        }
        
        // Update supplier balance
        const currentBalance = paymentForm.currency === 'LBP' ? supplier.lb_balance : supplier.usd_balance;
        const newBalance = Math.max(0, currentBalance - amount);
        
        await raw.updateSupplier(paymentForm.entityId, {
          [paymentForm.currency === 'LBP' ? 'lb_balance' : 'usd_balance']: newBalance
        });
        
        // Add transaction
        await raw.addTransaction({
          type: 'expense',
          category: 'Supplier Payment',
          amount: amount,
          currency: paymentForm.currency,
          description: `Payment to ${supplier.name}: ${paymentForm.description}`,
          reference: paymentForm.reference,
          created_by: userProfile?.id || ''
        });
        
        showToast(`Payment sent to ${supplier.name}`, 'success');
      }
      
      setPaymentForm({
        entityId: '',
        entityType: 'customer',
        amount: '',
        currency: 'USD',
        description: '',
        reference: ''
      });
      setShowPaymentForm(null);
      
    } catch (error) {
      console.error('Error processing payment:', error);
      showToast('Failed to process payment', 'error');
    }
  };

  // Receive products handler
  const handleReceiveSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!receiveForm.productId || !receiveForm.supplierId || !receiveForm.quantity) {
      showToast('Please fill in all required fields', 'error');
      return;
    }
    
    try {
      await raw.addInventoryItem({
        product_id: receiveForm.productId,
        supplier_id: receiveForm.supplierId,
        type: receiveForm.type,
        quantity: parseInt(receiveForm.quantity),
        unit: receiveForm.unit,
        weight: receiveForm.weight ? parseFloat(receiveForm.weight) : null,
        price: receiveForm.price ? parseFloat(receiveForm.price) : null,
        commission_rate: parseFloat(receiveForm.commissionRate),
        received_by: userProfile?.id || '',
        received_quantity: parseInt(receiveForm.quantity),
        notes: receiveForm.notes || null
      });
      
      const product = products.find(p => p.id === receiveForm.productId);
      const supplier = suppliers.find(s => s.id === receiveForm.supplierId);
      
      showToast(`Received ${receiveForm.quantity} ${receiveForm.unit} of ${product?.name} from ${supplier?.name}`, 'success');
      
      setReceiveForm({
        productId: '',
        supplierId: '',
        quantity: '',
        unit: 'kg',
        weight: '',
        price: '',
        type: 'commission',
        commissionRate: '10',
        notes: ''
      });
      setShowReceiveForm(false);
      
    } catch (error) {
      console.error('Error receiving products:', error);
      showToast('Failed to receive products', 'error');
    }
  };

  const exportBills = () => {
    const csvContent = [
      ['Bill Number', 'Date', 'Customer', 'Total', 'Payment Status', 'Status'].join(','),
      ...bills.map(bill => [
        bill.bill_number,
        new Date(bill.bill_date).toLocaleDateString(),
        bill.customer_name || 'Walk-in Customer',
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

  // Calculate analytics
  const analytics = {
    totalBills: bills.length,
    totalRevenue: bills.reduce((sum, bill) => sum + bill.total_amount, 0),
    paidBills: bills.filter(b => b.payment_status === 'paid').length,
    pendingAmount: bills.filter(b => b.payment_status !== 'paid').reduce((sum, bill) => sum + (bill.total_amount - bill.amount_paid), 0),
    todaysBills: bills.filter(b => new Date(b.bill_date).toDateString() === new Date().toDateString()).length,
    recentInventory: inventory.slice(0, 5),
    lowStockItems: raw.stockLevels.filter(item => item.currentStock < raw.lowStockThreshold),
    customerDebt: customers.reduce((sum, c) => sum + (c.lb_balance + c.usd_balance), 0),
    supplierDebt: suppliers.reduce((sum, s) => sum + ((s.lb_balance || 0) + (s.usd_balance || 0)), 0)
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-8">
        <RefreshCw className="w-6 h-6 animate-spin text-gray-400 mr-2" />
        <span className="text-gray-500">Loading financial operations...</span>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Toast */}
      {toast && (
        <div className={`fixed top-4 right-4 px-4 py-2 rounded shadow-lg z-50 text-white ${
          toast.type === 'success' ? 'bg-green-600' : 'bg-red-600'
        }`}>
          {toast.message}
        </div>
      )}

      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center">
          <Activity className="w-6 h-6 text-blue-600 mr-3" />
          <div>
            <h2 className="text-2xl font-bold text-gray-900">Financial Operations Hub</h2>
            <p className="text-gray-600">Comprehensive management of bills, inventory, payments, and analytics</p>
          </div>
        </div>
        
        <div className="flex items-center space-x-2">
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
            <Download className="w-4 h-4 mr-2" />
            Export
          </button>
          <button
            onClick={loadBills}
            className="bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 transition-colors flex items-center"
          >
            <RefreshCw className="w-4 h-4 mr-2" />
            Refresh
          </button>
        </div>
      </div>

      {/* Quick Actions */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <button
          onClick={() => setShowReceiveForm(true)}
          className="bg-blue-500 hover:bg-blue-600 text-white p-4 rounded-lg transition-colors flex items-center"
        >
          <Truck className="w-6 h-6 mr-3" />
          <div className="text-left">
            <div className="font-semibold">Receive Products</div>
            <div className="text-sm opacity-90">Add inventory</div>
          </div>
        </button>

        <button
          onClick={() => { setPaymentForm(prev => ({ ...prev, entityType: 'customer' })); setShowPaymentForm('customer'); }}
          className="bg-green-500 hover:bg-green-600 text-white p-4 rounded-lg transition-colors flex items-center"
        >
          <ArrowDownRight className="w-6 h-6 mr-3" />
          <div className="text-left">
            <div className="font-semibold">Receive Payment</div>
            <div className="text-sm opacity-90">From customer</div>
          </div>
        </button>

        <button
          onClick={() => { setPaymentForm(prev => ({ ...prev, entityType: 'supplier' })); setShowPaymentForm('supplier'); }}
          className="bg-red-500 hover:bg-red-600 text-white p-4 rounded-lg transition-colors flex items-center"
        >
          <ArrowUpRight className="w-6 h-6 mr-3" />
          <div className="text-left">
            <div className="font-semibold">Send Payment</div>
            <div className="text-sm opacity-90">To supplier</div>
          </div>
        </button>

        <button
          onClick={() => window.dispatchEvent(new CustomEvent('navigate', { detail: 'pos' }))}
          className="bg-purple-500 hover:bg-purple-600 text-white p-4 rounded-lg transition-colors flex items-center"
        >
          <ShoppingCart className="w-6 h-6 mr-3" />
          <div className="text-left">
            <div className="font-semibold">New Sale</div>
            <div className="text-sm opacity-90">Point of Sale</div>
          </div>
        </button>
      </div>

      {/* Analytics Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-white rounded-lg shadow-sm p-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-600">Total Bills</p>
              <p className="text-2xl font-bold text-gray-900">{analytics.totalBills}</p>
              <p className="text-xs text-gray-500">{analytics.todaysBills} today</p>
            </div>
            <FileText className="w-8 h-8 text-blue-500" />
          </div>
        </div>

        <div className="bg-white rounded-lg shadow-sm p-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-600">Total Revenue</p>
              <p className="text-2xl font-bold text-gray-900">{formatCurrency(analytics.totalRevenue)}</p>
              <p className="text-xs text-gray-500">{analytics.paidBills} paid bills</p>
            </div>
            <TrendingUp className="w-8 h-8 text-green-500" />
          </div>
        </div>

        <div className="bg-white rounded-lg shadow-sm p-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-600">Pending Amount</p>
              <p className="text-2xl font-bold text-gray-900">{formatCurrency(analytics.pendingAmount)}</p>
              <p className="text-xs text-gray-500">Outstanding receivables</p>
            </div>
            <Clock className="w-8 h-8 text-amber-500" />
          </div>
        </div>

        <div className="bg-white rounded-lg shadow-sm p-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-600">Low Stock Items</p>
              <p className="text-2xl font-bold text-gray-900">{analytics.lowStockItems.length}</p>
              <p className="text-xs text-gray-500">Need attention</p>
            </div>
            <AlertTriangle className="w-8 h-8 text-red-500" />
          </div>
        </div>
      </div>

      {/* Navigation Tabs */}
      <div className="flex space-x-1 bg-gray-100 p-1 rounded-lg w-fit">
        {[
          { id: 'bills', label: 'Bills Management', icon: FileText },
          { id: 'inventory', label: 'Inventory Logs', icon: Package },
          { id: 'payments', label: 'Payment History', icon: DollarSign },
          { id: 'analytics', label: 'Analytics', icon: BarChart3 }
        ].map(tab => (
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

      {/* Search and Filters */}
      {activeTab === 'bills' && (
        <div className="bg-white rounded-lg shadow-sm p-4">
          <div className="flex items-center space-x-4 mb-4">
            <div className="flex-1 relative">
              <Search className="w-5 h-5 absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400" />
              <input
                type="text"
                placeholder="Search bills by number, customer, or notes..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-blue-500 focus:border-blue-500"
              />
            </div>
          </div>

          {showFilters && (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 pt-4 border-t border-gray-200">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Date From</label>
                <input
                  type="date"
                  value={dateFrom}
                  onChange={(e) => setDateFrom(e.target.value)}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:ring-blue-500 focus:border-blue-500"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Date To</label>
                <input
                  type="date"
                  value={dateTo}
                  onChange={(e) => setDateTo(e.target.value)}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:ring-blue-500 focus:border-blue-500"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Payment Status</label>
                <select
                  value={paymentStatusFilter}
                  onChange={(e) => setPaymentStatusFilter(e.target.value)}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:ring-blue-500 focus:border-blue-500"
                >
                  <option value="">All Payment Status</option>
                  <option value="paid">Paid</option>
                  <option value="partial">Partial</option>
                  <option value="pending">Pending</option>
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Bill Status</label>
                <select
                  value={statusFilter}
                  onChange={(e) => setStatusFilter(e.target.value)}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:ring-blue-500 focus:border-blue-500"
                >
                  <option value="">All Status</option>
                  <option value="active">Active</option>
                  <option value="cancelled">Cancelled</option>
                  <option value="refunded">Refunded</option>
                </select>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Bills Management Tab */}
      {activeTab === 'bills' && (
        <div className="bg-white rounded-lg shadow-sm overflow-hidden">
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Bill Details
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Customer
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Amount
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Payment
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Status
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {bills.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="px-6 py-8 text-center text-gray-500">
                      <FileText className="w-12 h-12 mx-auto mb-4 text-gray-300" />
                      <p className="text-lg font-medium">No bills found</p>
                      <p className="text-sm">Bills created from POS will appear here</p>
                    </td>
                  </tr>
                ) : (
                  bills.map((bill) => (
                    <tr key={bill.id} className="hover:bg-gray-50">
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div>
                          <div className="text-sm font-medium text-gray-900">{bill.bill_number}</div>
                          <div className="text-sm text-gray-500">
                            {new Date(bill.bill_date).toLocaleDateString()} at {new Date(bill.bill_date).toLocaleTimeString()}
                          </div>
                          <div className="text-xs text-gray-400">
                            Created by {bill.users?.name || 'Unknown'}
                          </div>
                        </div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="flex items-center">
                          <User className="w-4 h-4 text-gray-400 mr-2" />
                          <span className="text-sm text-gray-900">
                            {bill.customer_name || 'Walk-in Customer'}
                          </span>
                        </div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div>
                          <div className="text-sm font-medium text-gray-900">
                            {formatCurrency(bill.total_amount)}
                          </div>
                          {bill.total_amount - bill.amount_paid > 0 && (
                            <div className="text-xs text-red-600">
                              Due: {formatCurrency(bill.total_amount - bill.amount_paid)}
                            </div>
                          )}
                        </div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="flex items-center space-x-2">
                          <span className={`px-2 py-1 text-xs rounded-full ${getPaymentStatusColor(bill.payment_status)}`}>
                            {bill.payment_status}
                          </span>
                          <div className="flex items-center text-xs text-gray-500">
                            {bill.payment_method === 'cash' && <DollarSign className="w-3 h-3" />}
                            {bill.payment_method === 'card' && <CreditCard className="w-3 h-3" />}
                            {bill.payment_method === 'credit' && <Clock className="w-3 h-3" />}
                            <span className="ml-1 capitalize">{bill.payment_method}</span>
                          </div>
                        </div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <span className={`px-2 py-1 text-xs rounded-full ${getStatusColor(bill.status)}`}>
                          {bill.status}
                        </span>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm font-medium">
                        <div className="flex items-center space-x-2">
                          <button
                            onClick={() => handleViewBill(bill)}
                            className="text-blue-600 hover:text-blue-900"
                            title="View Details"
                          >
                            <Eye className="w-4 h-4" />
                          </button>
                          {(userProfile?.role === 'admin' || userProfile?.role === 'manager') && (
                            <button
                              onClick={() => handleEditBill(bill)}
                              className="text-green-600 hover:text-green-900"
                              title="Edit Bill"
                            >
                              <Edit className="w-4 h-4" />
                            </button>
                          )}
                          {userProfile?.role === 'admin' && (
                            <button
                              onClick={() => handleDeleteBill(bill)}
                              className="text-red-600 hover:text-red-900"
                              title="Cancel Bill"
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

      {/* Inventory Logs Tab */}
      {activeTab === 'inventory' && (
        <div className="bg-white rounded-lg shadow-sm p-6">
          <h3 className="text-lg font-semibold text-gray-900 mb-4">Recent Inventory Receives</h3>
          <div className="space-y-4">
            {analytics.recentInventory.map((item: any) => {
              const product = products.find(p => p.id === item.product_id);
              const supplier = suppliers.find(s => s.id === item.supplier_id);
              return (
                <div key={item.id} className="flex items-center justify-between p-4 border border-gray-200 rounded-lg">
                  <div className="flex items-center">
                    <Package className="w-8 h-8 text-blue-500 mr-3" />
                    <div>
                      <div className="font-medium text-gray-900">{product?.name || 'Unknown Product'}</div>
                      <div className="text-sm text-gray-600">
                        {item.quantity} {item.unit} from {supplier?.name || 'Unknown Supplier'}
                      </div>
                      <div className="text-xs text-gray-500">
                        {new Date(item.received_at || item.receivedAt).toLocaleString()}
                      </div>
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="text-sm font-medium text-gray-900">
                      {item.price ? formatCurrency(item.price * item.quantity) : 'No price'}
                    </div>
                    <div className={`text-xs px-2 py-1 rounded-full ${
                      item.type === 'commission' ? 'bg-blue-100 text-blue-800' : 'bg-green-100 text-green-800'
                    }`}>
                      {item.type}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Payment History Tab */}
      {activeTab === 'payments' && (
        <div className="bg-white rounded-lg shadow-sm p-6">
          <h3 className="text-lg font-semibold text-gray-900 mb-4">Recent Transactions</h3>
          <div className="space-y-4">
            {transactions.slice(0, 10).map((transaction: any) => (
              <div key={transaction.id} className="flex items-center justify-between p-4 border border-gray-200 rounded-lg">
                <div className="flex items-center">
                  {transaction.type === 'income' ? (
                    <ArrowDownRight className="w-6 h-6 text-green-500 mr-3" />
                  ) : (
                    <ArrowUpRight className="w-6 h-6 text-red-500 mr-3" />
                  )}
                  <div>
                    <div className="font-medium text-gray-900">{transaction.category}</div>
                    <div className="text-sm text-gray-600">{transaction.description}</div>
                    <div className="text-xs text-gray-500">
                      {new Date(transaction.created_at).toLocaleString()}
                    </div>
                  </div>
                </div>
                <div className="text-right">
                  <div className={`text-sm font-medium ${
                    transaction.type === 'income' ? 'text-green-600' : 'text-red-600'
                  }`}>
                    {transaction.type === 'income' ? '+' : '-'}{formatCurrency(transaction.amount)}
                  </div>
                  <div className="text-xs text-gray-500">{transaction.currency}</div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Analytics Tab */}
      {activeTab === 'analytics' && (
        <div className="space-y-6">
          {/* Financial Overview */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="bg-white rounded-lg shadow-sm p-6">
              <h3 className="text-lg font-semibold text-gray-900 mb-4">Customer Balances</h3>
              <div className="space-y-3">
                {customers.filter(c => (c.lb_balance + c.usd_balance) > 0).slice(0, 5).map(customer => (
                  <div key={customer.id} className="flex items-center justify-between">
                    <span className="text-gray-900">{customer.name}</span>
                    <div className="text-right">
                      <div className="text-sm font-medium text-red-600">
                        {formatCurrency(customer.lb_balance + customer.usd_balance)}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div className="bg-white rounded-lg shadow-sm p-6">
              <h3 className="text-lg font-semibold text-gray-900 mb-4">Supplier Balances</h3>
              <div className="space-y-3">
                {suppliers.filter(s => ((s.lb_balance || 0) + (s.usd_balance || 0)) > 0).slice(0, 5).map(supplier => (
                  <div key={supplier.id} className="flex items-center justify-between">
                    <span className="text-gray-900">{supplier.name}</span>
                    <div className="text-right">
                      <div className="text-sm font-medium text-green-600">
                        {formatCurrency((supplier.lb_balance || 0) + (supplier.usd_balance || 0))}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Low Stock Alert */}
          {analytics.lowStockItems.length > 0 && (
            <div className="bg-white rounded-lg shadow-sm p-6">
              <h3 className="text-lg font-semibold text-gray-900 mb-4 flex items-center">
                <AlertTriangle className="w-5 h-5 text-amber-500 mr-2" />
                Low Stock Alert
              </h3>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {analytics.lowStockItems.map((item: any) => (
                  <div key={item.productId} className="p-4 bg-amber-50 border border-amber-200 rounded-lg">
                    <div className="font-medium text-gray-900">{item.productName}</div>
                    <div className="text-sm text-amber-700">Only {item.currentStock} remaining</div>
                    <div className="text-xs text-gray-500">Threshold: {raw.lowStockThreshold}</div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Payment Form Modal */}
      {showPaymentForm && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-lg max-w-2xl w-full max-h-[90vh] overflow-y-auto">
            <div className="p-6 border-b">
              <h2 className="text-xl font-semibold text-gray-900">
                {paymentForm.entityType === 'customer' ? 'Receive Payment' : 'Send Payment'}
              </h2>
            </div>
            <form onSubmit={handlePaymentSubmit} className="p-6 space-y-6">
              <div className={`p-4 rounded-lg border ${
                paymentForm.entityType === 'customer' 
                  ? 'bg-green-50 border-green-200' 
                  : 'bg-red-50 border-red-200'
              }`}>
                <div className="flex items-center">
                  {paymentForm.entityType === 'customer' ? (
                    <ArrowDownRight className="w-5 h-5 text-green-600 mr-2" />
                  ) : (
                    <ArrowUpRight className="w-5 h-5 text-red-600 mr-2" />
                  )}
                  <span className={`font-medium ${
                    paymentForm.entityType === 'customer' ? 'text-green-800' : 'text-red-800'
                  }`}>
                    {paymentForm.entityType === 'customer' 
                      ? 'Record a payment received from a customer' 
                      : 'Record a payment sent to a supplier'}
                  </span>
                </div>
              </div>
              
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="md:col-span-2">
                  <SearchableSelect
                    options={(paymentForm.entityType === 'customer' ? customers : suppliers)
                      .filter((entity: any) => paymentForm.entityType === 'customer' ? entity.isActive : true)
                      .map((entity: any) => ({
                        id: entity.id,
                        label: entity.name,
                        value: entity.id,
                        category: paymentForm.entityType === 'customer' ? 'Customer' : 'Supplier'
                      }))}
                    value={paymentForm.entityId}
                    onChange={(value) => setPaymentForm(prev => ({ ...prev, entityId: value as string }))}
                    placeholder={`Select ${paymentForm.entityType === 'customer' ? 'Customer' : 'Supplier'} *`}
                    searchPlaceholder={`Search ${paymentForm.entityType}s...`}
                    className="w-full"
                  />
                </div>
                
                <div>
                  <MoneyInput
                    label="Amount *"
                    value={paymentForm.amount}
                    onChange={(value) => setPaymentForm(prev => ({ ...prev, amount: value }))}
                    placeholder="0.00"
                    step="0.01"
                    min="0"
                    required
                  />
                </div>
                
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">Currency *</label>
                  <select
                    value={paymentForm.currency}
                    onChange={(e) => setPaymentForm(prev => ({ ...prev, currency: e.target.value as 'USD' | 'LBP' }))}
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:ring-blue-500 focus:border-blue-500"
                  >
                    <option value="USD">USD ($)</option>
                    <option value="LBP">LBP (ل.ل)</option>
                  </select>
                </div>
              </div>
              
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Description</label>
                <input
                  type="text"
                  value={paymentForm.description}
                  onChange={(e) => setPaymentForm(prev => ({ ...prev, description: e.target.value }))}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:ring-blue-500 focus:border-blue-500"
                  placeholder="Payment description..."
                />
              </div>
              
              <div className="flex justify-end space-x-3 pt-6 border-t border-gray-200">
                <button
                  type="button"
                  onClick={() => setShowPaymentForm(null)}
                  className="px-6 py-2 text-gray-700 border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className={`px-6 py-2 text-white rounded-lg transition-colors font-medium ${
                    paymentForm.entityType === 'customer'
                      ? 'bg-green-600 hover:bg-green-700'
                      : 'bg-red-600 hover:bg-red-700'
                  }`}
                >
                  {paymentForm.entityType === 'customer' ? 'Receive Payment' : 'Send Payment'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Receive Products Form Modal */}
      {showReceiveForm && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-lg max-w-2xl w-full max-h-[90vh] overflow-y-auto">
            <div className="p-6 border-b">
              <h2 className="text-xl font-semibold text-gray-900">Receive Products</h2>
            </div>
            <form onSubmit={handleReceiveSubmit} className="p-6 space-y-6">
              <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
                <div className="flex items-center">
                  <Truck className="w-5 h-5 text-blue-600 mr-2" />
                  <span className="text-blue-800 font-medium">Add new inventory from supplier</span>
                </div>
              </div>
              
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div>
                  <SearchableSelect
                    options={products.map(product => ({
                      id: product.id,
                      label: product.name,
                      value: product.id,
                      category: product.category
                    }))}
                    value={receiveForm.productId}
                    onChange={(value) => setReceiveForm(prev => ({ ...prev, productId: value as string }))}
                    placeholder="Select Product *"
                    searchPlaceholder="Search products..."
                    categories={['Fruits', 'Vegetables', 'Herbs']}
                    className="w-full"
                  />
                </div>
                
                <div>
                  <SearchableSelect
                    options={suppliers.map(supplier => ({
                      id: supplier.id,
                      label: supplier.name,
                      value: supplier.id,
                      category: 'Supplier'
                    }))}
                    value={receiveForm.supplierId}
                    onChange={(value) => setReceiveForm(prev => ({ ...prev, supplierId: value as string }))}
                    placeholder="Select Supplier *"
                    searchPlaceholder="Search suppliers..."
                    className="w-full"
                  />
                </div>
                
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">Quantity *</label>
                  <input
                    type="number"
                    min="1"
                    value={receiveForm.quantity}
                    onChange={(e) => setReceiveForm(prev => ({ ...prev, quantity: e.target.value }))}
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:ring-blue-500 focus:border-blue-500"
                    required
                  />
                </div>
                
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">Unit</label>
                  <select
                    value={receiveForm.unit}
                    onChange={(e) => setReceiveForm(prev => ({ ...prev, unit: e.target.value as any }))}
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:ring-blue-500 focus:border-blue-500"
                  >
                    <option value="kg">Kilogram (kg)</option>
                    <option value="piece">Piece</option>
                    <option value="box">Box</option>
                    <option value="bag">Bag</option>
                  </select>
                </div>
                
                <div>
                  <MoneyInput
                    label="Price per unit"
                    value={receiveForm.price}
                    onChange={(value) => setReceiveForm(prev => ({ ...prev, price: value }))}
                    placeholder="0.00"
                    step="0.01"
                    min="0"
                  />
                </div>
                
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">Type</label>
                  <select
                    value={receiveForm.type}
                    onChange={(e) => setReceiveForm(prev => ({ ...prev, type: e.target.value as any }))}
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:ring-blue-500 focus:border-blue-500"
                  >
                    <option value="commission">Commission</option>
                    <option value="cash">Cash Purchase</option>
                  </select>
                </div>
              </div>
              
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Notes</label>
                <textarea
                  value={receiveForm.notes}
                  onChange={(e) => setReceiveForm(prev => ({ ...prev, notes: e.target.value }))}
                  rows={3}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:ring-blue-500 focus:border-blue-500"
                  placeholder="Additional notes..."
                />
              </div>
              
              <div className="flex justify-end space-x-3 pt-6 border-t border-gray-200">
                <button
                  type="button"
                  onClick={() => setShowReceiveForm(false)}
                  className="px-6 py-2 text-gray-700 border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors font-medium"
                >
                  Receive Products
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Bill Details Modal */}
      {showBillDetails && selectedBill && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-lg max-w-4xl w-full max-h-[90vh] overflow-y-auto">
            <div className="p-6 border-b flex items-center justify-between">
              <h2 className="text-xl font-semibold text-gray-900">
                Bill Details - {selectedBill.bill_number}
              </h2>
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
                  <h3 className="text-lg font-medium text-gray-900 mb-4">Bill Information</h3>
                  <div className="space-y-2">
                    <div className="flex justify-between">
                      <span className="text-gray-600">Bill Number:</span>
                      <span className="font-medium">{selectedBill.bill_number}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-gray-600">Date:</span>
                      <span className="font-medium">{new Date(selectedBill.bill_date).toLocaleString()}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-gray-600">Customer:</span>
                      <span className="font-medium">{selectedBill.customer_name || 'Walk-in Customer'}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-gray-600">Payment Method:</span>
                      <span className="font-medium capitalize">{selectedBill.payment_method}</span>
                    </div>
                  </div>
                </div>

                <div>
                  <h3 className="text-lg font-medium text-gray-900 mb-4">Payment Information</h3>
                  <div className="space-y-2">
                    <div className="flex justify-between">
                      <span className="text-gray-600">Subtotal:</span>
                      <span className="font-medium">{formatCurrency(selectedBill.subtotal)}</span>
                    </div>
                    <div className="flex justify-between border-t pt-2">
                      <span className="text-gray-900 font-semibold">Total:</span>
                      <span className="font-bold text-lg">{formatCurrency(selectedBill.total_amount)}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-gray-600">Amount Paid:</span>
                      <span className="font-medium text-green-600">{formatCurrency(selectedBill.amount_paid)}</span>
                    </div>
                    {selectedBill.total_amount - selectedBill.amount_paid > 0 && (
                      <div className="flex justify-between">
                        <span className="text-gray-600">Amount Due:</span>
                        <span className="font-medium text-red-600">{formatCurrency(selectedBill.total_amount - selectedBill.amount_paid)}</span>
                      </div>
                    )}
                  </div>
                </div>
              </div>

              {/* Line Items */}
              <div>
                <h3 className="text-lg font-medium text-gray-900 mb-4">Line Items</h3>
                <div className="overflow-x-auto">
                  <table className="min-w-full divide-y divide-gray-200">
                    <thead className="bg-gray-50">
                      <tr>
                        <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Product</th>
                        <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Supplier</th>
                        <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Qty</th>
                        <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Price</th>
                        <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Total</th>
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
                  <h3 className="text-lg font-medium text-gray-900 mb-2">Notes</h3>
                  <p className="text-gray-600 bg-gray-50 p-3 rounded-lg">{selectedBill.notes}</p>
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
            <div className="p-6 border-b flex items-center justify-between">
              <h2 className="text-xl font-semibold text-gray-900">
                Edit Bill - {selectedBill.bill_number}
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
                  <label className="block text-sm font-medium text-gray-700 mb-2">Customer Name</label>
                  <input
                    type="text"
                    value={editForm.customer_name || ''}
                    onChange={(e) => setEditForm(prev => ({ ...prev, customer_name: e.target.value }))}
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:ring-blue-500 focus:border-blue-500"
                    placeholder="Walk-in Customer"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">Payment Method</label>
                  <select
                    value={editForm.payment_method || 'cash'}
                    onChange={(e) => setEditForm(prev => ({ ...prev, payment_method: e.target.value as any }))}
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
                  <label className="block text-sm font-medium text-gray-700 mb-2">Payment Status</label>
                  <select
                    value={editForm.payment_status || 'pending'}
                    onChange={(e) => setEditForm(prev => ({ ...prev, payment_status: e.target.value as any }))}
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
                  value={editForm.notes || ''}
                  onChange={(e) => setEditForm(prev => ({ ...prev, notes: e.target.value }))}
                  rows={3}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:ring-blue-500 focus:border-blue-500"
                  placeholder="Add notes about this bill..."
                />
              </div>

              <div className="flex justify-end space-x-3 pt-6 border-t border-gray-200">
                <button
                  onClick={() => setShowEditBill(false)}
                  className="px-6 py-2 text-gray-700 border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors"
                  disabled={isEditing}
                >
                  Cancel
                </button>
                <button
                  onClick={handleSaveBill}
                  disabled={isEditing}
                  className="px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors font-medium flex items-center"
                >
                  {isEditing ? (
                    <>
                      <RefreshCw className="w-4 h-4 mr-2 animate-spin" />
                      Saving...
                    </>
                  ) : (
                    <>
                      <Save className="w-4 h-4 mr-2" />
                      Save Changes
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
            <div className="p-6 border-b flex items-center justify-between">
              <h2 className="text-xl font-semibold text-gray-900">
                Audit Trail - {selectedBill.bill_number}
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
                      
                      <div className="text-sm text-gray-600 mb-2">
                        Changed by: {log.users?.name || 'Unknown User'}
                      </div>
                      
                      {log.field_changed && (
                        <div className="text-sm text-gray-600 mb-2">
                          Field: <span className="font-mono bg-gray-100 px-1 rounded">{log.field_changed}</span>
                        </div>
                      )}
                      
                      {log.change_reason && (
                        <div className="text-sm text-gray-600 mb-2">
                          Reason: {log.change_reason}
                        </div>
                      )}
                      
                      {(log.old_value || log.new_value) && (
                        <div className="text-xs text-gray-500 bg-gray-50 p-2 rounded">
                          {log.old_value && (
                            <div className="mb-1">
                              <span className="font-medium">Old:</span> {log.old_value.length > 100 ? `${log.old_value.substring(0, 100)}...` : log.old_value}
                            </div>
                          )}
                          {log.new_value && (
                            <div>
                              <span className="font-medium">New:</span> {log.new_value.length > 100 ? `${log.new_value.substring(0, 100)}...` : log.new_value}
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
                  <p>No audit trail available for this bill</p>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}