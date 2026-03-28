import React, { useState, useMemo, useEffect } from 'react';
import { useOfflineData } from '../contexts/OfflineDataContext';
import { useCustomerForm } from '../contexts/CustomerFormContext';

import { useSupabaseAuth } from '../contexts/SupabaseAuthContext';
import { useI18n } from '../i18n';
import { useErrorHandler } from '../hooks/useErrorHandler';
import { normalizeNameForComparison } from '../utils/nameNormalization';
import { Plus, Search, Edit, Users, Truck, DollarSign, CreditCard, FileText, Banknote, UserCheck } from 'lucide-react';
import { Customer, Supplier } from '../types';
import Toast from '../components/common/Toast';
import SupplierFormModal from '../components/common/SupplierFormModal';
import AccountStatementModal from '../components/AccountStatementModal';
import SupplierAdvances from '../components/accountingPage/tabs/SupplierAdvances';
import EmployeePayments from '../components/accountingPage/tabs/EmployeePayments';
import { useCurrency } from '../hooks/useCurrency';
import { Pagination } from '../components/common/Pagination';
import { useEntityBalances } from '../hooks/useEntityBalances';
import { UnifiedPaymentModal } from '../components/common/UnifiedPaymentModal';

export default function Customers() {
  const raw = useOfflineData();
  const { addCustomerRequestedFromPOS, clearAddCustomerRequest } = useCustomerForm();

  const { t } = useI18n();
  const { handleError } = useErrorHandler();

  // Get customer entities
  const customerEntities = raw.entities.filter(e => e.entity_type === 'customer');
  const customerIds = useMemo(() => customerEntities.map(c => c.id), [customerEntities]);

  // Get calculated balances from journal entries (source of truth)
  const customerBalances = useEntityBalances(customerIds, 'customer', true);

  const customers = useMemo(() => {
    const mappedCustomers = customerEntities.map(c => {
      const customerData = (c.customer_data as any) || {};
      // Get calculated balances from journal entries
      const balances = customerBalances.getBalances(c.id) || { USD: 0, LBP: 0 };
      return {
        ...c,
        is_active: c.is_active ?? true,
        createdAt: c.created_at,
        lb_balance: balances.LBP,  // From journal entries
        usd_balance: balances.USD,  // From journal entries
        email: customerData.email || '',
        address: customerData.address || '',
        lb_max_balance: customerData.lb_max_balance ?? undefined,
        usd_max_balance: customerData.usd_max_balance ?? undefined
      };
    });
    // Sort alphabetically (A-Z or ا-ي)
    return mappedCustomers.sort((a, b) =>
      a.name.localeCompare(b.name, ['ar', 'en'], { sensitivity: 'base' })
    );
  }, [customerEntities, customerBalances]);

  // Get supplier entities
  const supplierEntities = raw.entities.filter(e => e.entity_type === 'supplier');
  const supplierIds = useMemo(() => supplierEntities.map(s => s.id), [supplierEntities]);

  // Get calculated balances from journal entries (source of truth)
  const supplierBalances = useEntityBalances(supplierIds, 'supplier', true);

  const suppliers = useMemo(() => {
    const mappedSuppliers = supplierEntities.map(s => {
      const supplierData = (s.supplier_data as any) || {};
      // Get calculated balances from journal entries
      const balances = supplierBalances.getBalances(s.id) || { USD: 0, LBP: 0 };
      return {
        ...s,
        createdAt: s.created_at || 'commission',
        email: supplierData.email || '',
        address: supplierData.address || '',
        lb_balance: balances.LBP,  // From journal entries
        usd_balance: balances.USD,  // From journal entries
        type: supplierData.type || 'standard',
        advance_lb_balance: supplierData.advance_lb_balance || 0,
        advance_usd_balance: supplierData.advance_usd_balance || 0
      };
    });
    // Sort alphabetically (A-Z or ا-ي)
    return mappedSuppliers.sort((a, b) =>
      a.name.localeCompare(b.name, ['ar', 'en'], { sensitivity: 'base' })
    );
  }, [supplierEntities, supplierBalances]);
  const addCustomer = raw.addCustomer;
  const updateCustomer = raw.updateCustomer;
  const addSupplier = raw.addSupplier;
  // const updateSupplier = raw.updateSupplier; // Reserved for future use
  // const exchangeRate = raw.exchangeRate || 89500; // Reserved for future currency conversion features
  const { userProfile } = useSupabaseAuth();
  const { formatCurrency, formatCurrencyWithSymbol } = useCurrency();

  // Helper function to format balance display
  const formatBalanceDisplay = (balance: number, currency: 'USD' | 'LBP') => {
    if (balance > 0) {
      // They owe us (DEBT) - show with + sign
      const amountText = currency === 'USD'
        ? `$${balance.toFixed(2)}`
        : `${Math.round(balance).toLocaleString()} ل.ل`;
      return {
        text: `+${amountText}`,
        label: t('customers.owes') || 'Owes',
        color: 'text-red-700',
        bgColor: 'bg-red-50',
        borderColor: 'border-red-200',
        icon: '💰',
        type: 'debt' as const
      };
    } else if (balance < 0) {
      // We owe them (CREDIT) - show with - sign
      const amountText = currency === 'USD'
        ? `$${Math.abs(balance).toFixed(2)}`
        : `${Math.round(Math.abs(balance)).toLocaleString()} ل.ل`;
      return {
        text: `-${amountText}`,
        label: t('customers.credit') || 'Credit',
        color: 'text-blue-700',
        bgColor: 'bg-blue-50',
        borderColor: 'border-blue-200',
        icon: '💰',
        type: 'credit' as const
      };
    } else {
      // Paid off - show 0 without sign
      return {
        text: currency === 'USD' ? '$0.00' : '0 ل.ل',
        label: t('customers.paid') || 'Paid',
        color: 'text-green-700',
        bgColor: 'bg-green-50',
        borderColor: 'border-green-200',
        icon: '✅',
        type: 'paid' as const
      };
    }
  };

  const [activeTab, setActiveTab] = useState<'customers' | 'suppliers' | 'supplier-advances' | 'employee-payments'>('customers');
  const [showCustomerForm, setShowCustomerForm] = useState(false);
  const [showSupplierForm, setShowSupplierForm] = useState(false);
  const [editingCustomer, setEditingCustomer] = useState<Customer | null>(null);
  const [editingSupplier, setEditingSupplier] = useState<Supplier | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [customersPage, setCustomersPage] = useState(1);
  const [suppliersPage, setSuppliersPage] = useState(1);
  const itemsPerPage = 20;
  const [customerForm, setCustomerForm] = useState<Partial<Customer>>({
    name: '',
    phone: '',
    email: '',
    address: '',
    is_active: true,
    lb_max_balance: undefined,
    usd_max_balance: undefined,
  });
  const [customerFormError, setCustomerFormError] = useState<string | null>(null);
  const [nameValidationError, setNameValidationError] = useState<string | null>(null);
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error'; visible: boolean }>({
    message: '',
    type: 'success',
    visible: false,
  });

  // Payment form states
  const [showPaymentForm, setShowPaymentForm] = useState<{ entity: Customer | Supplier; entityType: 'customer' | 'supplier' } | null>(null);
  const [paymentDirection, setPaymentDirection] = useState<'receive' | 'pay'>('receive');
  const [paymentForm, setPaymentForm] = useState({
    amount: '',
    currency: 'USD' as 'USD' | 'LBP',
    description: '',
    reference: ''
  });

  // Account statement modal states
  const [showAccountStatement, setShowAccountStatement] = useState<'customer' | 'supplier' | 'employee' | null>(null);
  const [selectedEntity, setSelectedEntity] = useState<Customer | Supplier | { id: string; name: string;[key: string]: any } | null>(null);

  // Overpayment warning state
  const [overpaymentWarning, setOverpaymentWarning] = useState<{ show: boolean; amount: number; currency: string } | null>(null);

  const showToast = (message: string, type: 'success' | 'error' = 'success') => {
    setToast({ message, type, visible: true });
  };
  const hideToast = () => setToast(t => ({ ...t, visible: false }));

  // Helper function for payment suggestions
  // Shows suggestions only when entity owes us money (positive balance > 0)
  // Works for both USD and LBP currencies
  const getSuggestedPayments = (entity: Customer | Supplier | undefined, currency: 'USD' | 'LBP') => {
    if (!entity) return [];

    // Get balance for the selected currency
    const balance = currency === 'LBP' ? (entity.lb_balance || 0) : (entity.usd_balance || 0);

    // Only show suggestions if they owe us money (positive balance = debt)
    // If balance is 0 or negative (credit), don't show suggestions
    if (balance <= 0) return [];

    // Only return suggestions if there's a positive debt (they owe us)
    if (balance > 0) {
      return [
        { percentage: 25, amount: balance * 0.25, label: '25%' },
        { percentage: 50, amount: balance * 0.5, label: '50%' },
        { percentage: 75, amount: balance * 0.75, label: '75%' },
        { percentage: 100, amount: balance, label: '100%' }
      ];
    }

    return [];
  };

  // Helper functions for payment processing
  const validatePaymentForm = (amount: string, entityId: string, entityType: 'customer' | 'supplier'): { isValid: boolean; entity?: Customer | Supplier } => {
    // Validate amount
    if (!amount || amount.trim() === '') {
      showToast('Please enter a payment amount', 'error');
      return { isValid: false };
    }

    const numAmount = parseFloat(amount);
    if (isNaN(numAmount) || numAmount <= 0) {
      showToast('Please enter a valid positive amount', 'error');
      return { isValid: false };
    }


    // Validate entity selection
    if (!entityId || entityId.trim() === '') {
      showToast(`Please select a ${entityType}`, 'error');
      return { isValid: false };
    }

    // Find entity
    const entity = entityType === 'customer'
      ? customers.find(c => c.id === entityId)
      : suppliers.find(s => s.id === entityId);

    if (!entity) {
      showToast(`${entityType.charAt(0).toUpperCase() + entityType.slice(1)} not found. Please refresh and try again.`, 'error');
      return { isValid: false };
    }

    // Check if entity is active (for customers)
    if (entityType === 'customer' && !(entity as Customer).is_active) {
      showToast('Cannot process payment for inactive customer', 'error');
      return { isValid: false };
    }

    return { isValid: true, entity };
  };

  const resetPaymentForm = () => {
    setPaymentForm({
      amount: '',
      currency: 'LBP',
      description: '',
      reference: ''
    });
    setShowPaymentForm(null);
    setPaymentDirection('receive');
    setOverpaymentWarning(null);
  };



  // Unified payment handler using context method
  const processPaymentLocal = async (
    entityType: 'customer' | 'supplier',
    entityId: string,
    amount: string,
    currency: 'USD' | 'LBP',
    description: string,
    reference: string,
    direction: 'receive' | 'pay'
  ) => {

    // Validate payment form
    const validation = validatePaymentForm(amount, entityId, entityType);
    if (!validation.isValid || !validation.entity) return false;

    const entity = validation.entity;

    try {
      // Use the unified payment processing function from context
      const result = await raw.processPayment?.({
        entityType,
        entityId,
        amount,
        currency,
        description,
        reference,
        storeId: userProfile?.store_id || '',
        createdBy: userProfile?.id || '',
        paymentDirection: direction
      });

      if (result.success) {
        // Force immediate refresh to ensure UI updates with new balances
        await raw.refreshData();
        // Refresh balance hooks to update UI immediately
        if (entityType === 'customer') {
          await customerBalances.refreshAll();
        } else {
          await supplierBalances.refreshAll();
        }
        // Show success message
        const action = entityType === 'customer' ? 'received' : 'sent';
        showToast(`Payment ${action}! ${entity.name} balance updated`, 'success');
        return true;
      } else {
        showToast(result.error || 'Failed to process payment', 'error');
        return false;
      }
    } catch (err) {
      handleError(err);
      showToast('Failed to record payment.', 'error');
      return false;
    }
  };

  // Unified payment handler for both customers and suppliers
  const handlePaymentSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!showPaymentForm) return;

    const success = await processPaymentLocal(
      showPaymentForm.entityType,
      showPaymentForm.entity.id,
      paymentForm.amount,
      paymentForm.currency,
      paymentForm.description,
      paymentForm.reference,
      paymentDirection
    );

    if (success) {
      resetPaymentForm();
    }
  };

  // Open payment modal for any entity
  const handleOpenPaymentForm = (entity: Customer | Supplier, entityType: 'customer' | 'supplier') => {
    // Determine default direction based on entity balance
    const usdBalance = entity.usd_balance || 0;
    const lbBalance = entity.lb_balance || 0;
    const defaultDirection: 'receive' | 'pay' = (usdBalance > 0 || lbBalance > 0) ? 'receive' : 'pay';

    setPaymentDirection(defaultDirection);
    setPaymentForm(prev => ({ ...prev, amount: '', description: '' }));
    setShowPaymentForm({ entity, entityType });
    setOverpaymentWarning(null);
  };

  // Account statement handlers
  const handleViewAccountStatement = (entity: Customer | Supplier | { id: string; name: string;[key: string]: any }, type: 'customer' | 'supplier' | 'employee') => {
    setSelectedEntity(entity);
    setShowAccountStatement(type);
  };

  // Customer handlers
  const handleAddCustomerClick = () => {
    setEditingCustomer(null);
    setCustomerForm({
      name: '',
      phone: '',
      email: '',
      address: '',
      is_active: true,
      lb_max_balance: undefined,
      usd_max_balance: undefined,
    });
    setNameValidationError(null);
    setShowCustomerForm(true);
  };

  const handleEditCustomerClick = (customer: Customer) => {
    setEditingCustomer(customer);
    setCustomerForm({
      name: customer.name,
      phone: customer.phone,
      email: customer.email || '',
      address: customer.address || '',
      is_active: customer.is_active,
      lb_max_balance: customer.lb_max_balance,
      usd_max_balance: customer.usd_max_balance,
    });
    setNameValidationError(null);
    setShowCustomerForm(true);
  };

  const handleCustomerFormChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => {
    const { name, value, type } = e.target;
    setCustomerForm(prev => ({
      ...prev,
      [name]: type === 'number' ? parseFloat(value) : value,
    }));

    // Real-time validation for name field
    if (name === 'name' && value.trim()) {
      const normalizedInput = normalizeNameForComparison(value);
      const duplicate = customers.find(c => {
        const normalizedExisting = normalizeNameForComparison(c.name);
        return normalizedInput === normalizedExisting && (!editingCustomer || c.id !== editingCustomer.id);
      });

      if (duplicate) {
        setNameValidationError(t('customers.duplicateNameError') || 'A customer with this name already exists.');
      } else {
        setNameValidationError(null);
      }
    } else if (name === 'name' && !value.trim()) {
      setNameValidationError(null);
    }
  };

  const handleCustomerCheckboxChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setCustomerForm(prev => ({
      ...prev,
      is_active: e.target.checked,
    }));
  };

  const handleCustomerFormSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!customerForm.name || !customerForm.phone) {
      setCustomerFormError(t('customers.nameRequired'));
      showToast(t('customers.nameRequired'), 'error');
      return;
    }
    // Check for duplicate customer name (with Arabic normalization)
    const normalizedInput = normalizeNameForComparison(customerForm.name!);
    const exists = customers.some(c => {
      const normalizedExisting = normalizeNameForComparison(c.name);
      return normalizedInput === normalizedExisting && (!editingCustomer || c.id !== editingCustomer.id);
    });
    if (exists) {
      const errorMsg = t('customers.duplicateNameError') || 'A customer with this name already exists.';
      setCustomerFormError(errorMsg);
      setNameValidationError(errorMsg);
      showToast(errorMsg, 'error');
      return;
    }
    setCustomerFormError(null);
    if (editingCustomer) {
      // Ensure proper field mapping and remove any camelCase fields
      await updateCustomer(editingCustomer.id, {
        name: customerForm.name!,
        phone: customerForm.phone!,
        email: customerForm.email || '',
        address: customerForm.address || '',
        is_active: customerForm.is_active ?? true,
        lb_max_balance: customerForm.lb_max_balance,
        usd_max_balance: customerForm.usd_max_balance,
        updated_at: new Date().toISOString(),
      });
      // Force immediate refresh to ensure UI updates
      await raw.refreshData();
      showToast('Customer updated successfully!', 'success');
    } else {
      await addCustomer({
        name: customerForm.name!,
        phone: customerForm.phone!,
        email: customerForm.email || '',
        address: customerForm.address || '',
        is_active: customerForm.is_active ?? true,
        lb_balance: customerForm.lb_balance || 0,
        usd_balance: customerForm.usd_balance || 0,
        lb_max_balance: customerForm.lb_max_balance,
        usd_max_balance: customerForm.usd_max_balance,
      });
      // Force immediate refresh to ensure UI updates
      await raw.refreshData();
      showToast('Customer added successfully!', 'success');
    }
    setShowCustomerForm(false);
  };

  // Supplier handlers
  const handleAddSupplierClick = () => {
    setEditingSupplier(null);
    setShowSupplierForm(true);
  };

  const handleEditSupplierClick = (supplier: Supplier) => {
    setEditingSupplier(supplier);
    setShowSupplierForm(true);
  };


  const filteredCustomers = useMemo(() => {
    if (!searchTerm) return customers;
    const normalizedSearchTerm = normalizeNameForComparison(searchTerm);
    return customers.filter(customer =>
      normalizeNameForComparison(customer.name).includes(normalizedSearchTerm) ||
      normalizeNameForComparison(customer.phone || '').includes(normalizedSearchTerm) ||
      (customer.email && normalizeNameForComparison(customer.email).includes(normalizedSearchTerm))
    );
  }, [customers, searchTerm]);

  const filteredSuppliers = useMemo(() => {
    if (!searchTerm) return suppliers;
    const normalizedSearchTerm = normalizeNameForComparison(searchTerm);
    return suppliers.filter(supplier =>
      normalizeNameForComparison(supplier.name).includes(normalizedSearchTerm) ||
      normalizeNameForComparison(supplier.phone || '').includes(normalizedSearchTerm) ||
      (supplier.email && normalizeNameForComparison(supplier.email).includes(normalizedSearchTerm))
    );
  }, [suppliers, searchTerm]);

  // Pagination for customers
  const paginatedCustomers = useMemo(() => {
    const startIndex = (customersPage - 1) * itemsPerPage;
    return filteredCustomers.slice(startIndex, startIndex + itemsPerPage);
  }, [filteredCustomers, customersPage]);

  const customersTotalPages = Math.ceil(filteredCustomers.length / itemsPerPage);

  // Pagination for suppliers
  const paginatedSuppliers = useMemo(() => {
    const startIndex = (suppliersPage - 1) * itemsPerPage;
    return filteredSuppliers.slice(startIndex, startIndex + itemsPerPage);
  }, [filteredSuppliers, suppliersPage]);

  const suppliersTotalPages = Math.ceil(filteredSuppliers.length / itemsPerPage);

  // Reset to page 1 when search term changes
  useEffect(() => {
    setCustomersPage(1);
    setSuppliersPage(1);
  }, [searchTerm]);

  // If POS requested adding a customer, open the add-customer form here
  useEffect(() => {
    if (addCustomerRequestedFromPOS) {
      handleAddCustomerClick();
      clearAddCustomerRequest();
    }
  }, [addCustomerRequestedFromPOS, clearAddCustomerRequest]);


  return (
    <div className="p-6">
      <Toast message={toast.message} type={toast.type} visible={toast.visible} onClose={hideToast} />
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-gray-900">{t('customers.title')}</h1>
        {(activeTab !== 'supplier-advances' && activeTab !== 'employee-payments') && (
          <button
            onClick={activeTab === 'customers' ? handleAddCustomerClick : handleAddSupplierClick}
            className="bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 transition-colors flex items-center"
          >
            <Plus className="w-5 h-5 mr-2" />
            {activeTab === 'customers' ? t('customers.addCustomer') : t('customers.addSupplier')}
          </button>
        )}
      </div>

      {/* Tabs */}
      <div className="bg-white rounded-lg shadow-sm mb-6">
        <div className="border-b border-gray-200">
          <nav className="-mb-px flex space-x-8">
            <button
              onClick={() => setActiveTab('customers')}
              className={`py-2 px-1 border-b-2 font-medium text-sm ${activeTab === 'customers'
                ? 'border-blue-500 text-blue-600'
                : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                }`}
            >
              <Users className="w-5 h-5 inline mr-2" />
              {t('customers.clients')}
            </button>
            <button
              onClick={() => setActiveTab('suppliers')}
              className={`py-2 px-1 border-b-2 font-medium text-sm ${activeTab === 'suppliers'
                ? 'border-blue-500 text-blue-600'
                : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                }`}
            >
              <Truck className="w-5 h-5 inline mr-2" />
              {t('customers.suppliers')}
            </button>
            <button
              onClick={() => setActiveTab('supplier-advances')}
              className={`py-2 px-1 border-b-2 font-medium text-sm ${activeTab === 'supplier-advances'
                ? 'border-blue-500 text-blue-600'
                : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                }`}
            >
              <Banknote className="w-5 h-5 inline mr-2" />
              {t('customers.supplierAdvances') || 'Supplier Advances'}
            </button>
            <button
              onClick={() => setActiveTab('employee-payments')}
              className={`py-2 px-1 border-b-2 font-medium text-sm ${activeTab === 'employee-payments'
                ? 'border-blue-500 text-blue-600'
                : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                }`}
            >
              <UserCheck className="w-5 h-5 inline mr-2" />
              {t('customers.employeePayments')}
            </button>
          </nav>
        </div>
      </div>

      {/* Search */}
      {activeTab !== 'supplier-advances' && activeTab !== 'employee-payments' && (
        <div className="bg-white p-4 rounded-lg shadow-sm mb-6">
          <div className="relative">
            <Search className="w-5 h-5 absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400" />
            <input
              type="text"
              placeholder={t('customers.searchPlaceholder', { type: activeTab === 'customers' ? t('customers.clients') : t('customers.suppliers') })}
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-blue-500 focus:border-blue-500"
            />
          </div>
        </div>
      )}

      {/* Customer List Table */}
      {activeTab === 'customers' && (
        <div className="bg-white rounded-lg shadow-sm overflow-hidden">
          <div className="p-6 border-b">
            <h2 className="text-lg font-semibold text-gray-900">{t('customers.allCustomers')}</h2>
          </div>
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-6 py-3 text-right rtl:text-right ltr:text-left text-xs font-medium text-gray-500 uppercase tracking-wider">{t('customers.name')}</th>
                  <th className="px-6 py-3 text-right rtl:text-right ltr:text-left text-xs font-medium text-gray-500 uppercase tracking-wider">{t('customers.contact')}</th>
                  <th className="px-6 py-3 text-right rtl:text-right ltr:text-left text-xs font-medium text-gray-500 uppercase tracking-wider">{t('customers.balance')}</th>
                  <th className="px-6 py-3 text-right rtl:text-right ltr:text-left text-xs font-medium text-gray-500 uppercase tracking-wider">{t('customers.status')}</th>
                  <th className="px-6 py-3 text-right rtl:text-right ltr:text-left text-xs font-medium text-gray-500 uppercase tracking-wider">{t('customers.actions')}</th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {filteredCustomers.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="px-6 py-4 text-center text-gray-500">
                      {t('customers.noCustomersFound')}
                    </td>
                  </tr>
                ) : (
                  paginatedCustomers.map(customer => (
                    <tr key={customer.id}>
                      <td className="px-6 py-4 whitespace-nowrap rtl:text-right ltr:text-left">
                        <div className="text-sm font-medium text-gray-900">{customer.name}</div>
                        <div className="text-sm text-gray-500">{customer.address}</div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap rtl:text-right ltr:text-left">
                        <div className="text-sm text-gray-900">{customer.phone}</div>
                        <div className="text-sm text-gray-500">{customer.email}</div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm rtl:text-right ltr:text-left">
                        <div className="space-y-1">
                          {(() => {
                            const lbpBalance = formatBalanceDisplay(customer.lb_balance || 0, 'LBP');
                            return (
                              <div className={`inline-flex items-center gap-2 px-3 py-1.5 rounded-lg border ${lbpBalance.bgColor} ${lbpBalance.borderColor}`}>
                                <span className="text-base">{lbpBalance.icon}</span>
                                <span className={`text-xs font-semibold ${lbpBalance.color}`}>
                                  {lbpBalance.label}:
                                </span>
                                <span className={`text-sm font-bold ${lbpBalance.color}`}>
                                  {lbpBalance.text}
                                </span>
                              </div>
                            );
                          })()}
                          {(() => {
                            const usdBalance = formatBalanceDisplay(customer.usd_balance || 0, 'USD');
                            return (
                              <div className={`inline-flex items-center gap-2 px-3 py-1.5 rounded-lg border ${usdBalance.bgColor} ${usdBalance.borderColor}`}>
                                <span className="text-base">{usdBalance.icon}</span>
                                <span className={`text-xs font-semibold ${usdBalance.color}`}>
                                  {usdBalance.label}:
                                </span>
                                <span className={`text-sm font-bold ${usdBalance.color}`}>
                                  {usdBalance.text}
                                </span>
                              </div>
                            );
                          })()}
                        </div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap rtl:text-right ltr:text-left">
                        <span className={`px-2 inline-flex text-xs leading-5 font-semibold rounded-full ${customer.is_active ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'
                          }`}>
                          {customer.is_active ? t('customers.active') : t('customers.inactive')}
                        </span>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap rtl:text-right ltr:text-left text-sm font-medium">
                        <div className="flex space-x-2 rtl:space-x-reverse">
                          <button
                            onClick={() => handleEditCustomerClick(customer)}
                            className="text-blue-600 hover:text-blue-900"
                            title={t('customers.editCustomer')}
                          >
                            <Edit className="w-4 h-4" />
                          </button>
                          <button
                            onClick={() => handleOpenPaymentForm(customer, 'customer')}
                            className="text-green-600 hover:text-green-800"
                            title={t('customers.recordPayment')}
                          >
                            <DollarSign className="w-4 h-4" />
                          </button>
                          <button
                            onClick={() => handleViewAccountStatement(customer, 'customer')}
                            className="text-purple-600 hover:text-purple-800"
                            title={t('customers.viewAccountStatement')}
                          >
                            <FileText className="w-4 h-4" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
          {/* Pagination */}
          {customersTotalPages > 1 && (
            <Pagination
              currentPage={customersPage}
              totalPages={customersTotalPages}
              onPageChange={setCustomersPage}
              itemsPerPage={itemsPerPage}
              totalItems={filteredCustomers.length}
            />
          )}
        </div>
      )}

      {/* Supplier List Table */}
      {activeTab === 'suppliers' && (
        <div className="bg-white rounded-lg shadow-sm overflow-hidden">
          <div className="p-6 border-b">
            <h2 className="text-lg font-semibold text-gray-900">{t('customers.allSuppliers')}</h2>
          </div>
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-6 py-3 text-right rtl:text-right ltr:text-left text-xs font-medium text-gray-500 uppercase tracking-wider">{t('customers.name')}</th>
                  <th className="px-6 py-3 text-right rtl:text-right ltr:text-left text-xs font-medium text-gray-500 uppercase tracking-wider">{t('customers.contact')}</th>
                  <th className="px-6 py-3 text-right rtl:text-right ltr:text-left text-xs font-medium text-gray-500 uppercase tracking-wider">{t('customers.balance')}</th>
                  <th className="px-6 py-3 text-right rtl:text-right ltr:text-left text-xs font-medium text-gray-500 uppercase tracking-wider">{t('customers.actions')}</th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {filteredSuppliers.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="px-6 py-4 text-center text-gray-500">
                      {t('customers.noSuppliersFound')}
                    </td>
                  </tr>
                ) : (
                  paginatedSuppliers.map(supplier => (
                    <tr key={supplier.id}>
                      <td className="px-6 py-4 whitespace-nowrap rtl:text-right ltr:text-left">
                        <div className="text-sm font-medium text-gray-900">{supplier.name}</div>
                        <div className="text-sm text-gray-500">{supplier.address}</div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap rtl:text-right ltr:text-left">
                        <div className="text-sm text-gray-900">{supplier.phone}</div>
                        <div className="text-sm text-gray-500">{supplier.email}</div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm rtl:text-right ltr:text-left">
                        <div className="space-y-2">
                          {(() => {
                            const lbpBalance = formatBalanceDisplay(supplier.lb_balance || 0, 'LBP');
                            return (
                              <div className={`inline-flex items-center gap-2 px-3 py-1.5 rounded-lg border ${lbpBalance.bgColor} ${lbpBalance.borderColor}`}>
                                <span className="text-base">{lbpBalance.icon}</span>
                                <span className={`text-xs font-semibold ${lbpBalance.color}`}>
                                  {lbpBalance.label}:
                                </span>
                                <span className={`text-sm font-bold ${lbpBalance.color}`}>
                                  {lbpBalance.text}
                                </span>
                              </div>
                            );
                          })()}
                          {(() => {
                            const usdBalance = formatBalanceDisplay(supplier.usd_balance || 0, 'USD');
                            return (
                              <div className={`inline-flex items-center gap-2 px-3 py-1.5 rounded-lg border ${usdBalance.bgColor} ${usdBalance.borderColor}`}>
                                <span className="text-base">{usdBalance.icon}</span>
                                <span className={`text-xs font-semibold ${usdBalance.color}`}>
                                  {usdBalance.label}:
                                </span>
                                <span className={`text-sm font-bold ${usdBalance.color}`}>
                                  {usdBalance.text}
                                </span>
                              </div>
                            );
                          })()}
                        </div>
                      </td>

                      <td className="px-6 py-4 whitespace-nowrap rtl:text-right ltr:text-left text-sm font-medium">
                        <div className="flex space-x-2 rtl:space-x-reverse">
                          <button
                            onClick={() => handleEditSupplierClick(supplier)}
                            className="text-blue-600 hover:text-blue-900"
                            title={t('customers.editSupplier')}
                          >
                            <Edit className="w-4 h-4" />
                          </button>
                          <button
                            onClick={() => handleOpenPaymentForm(supplier, 'supplier')}
                            className="text-red-600 hover:text-red-800"
                            title={t('customers.makePayment')}
                          >
                            <CreditCard className="w-4 h-4" />
                          </button>
                          <button
                            onClick={() => handleViewAccountStatement(supplier, 'supplier')}
                            className="text-purple-600 hover:text-purple-800"
                            title={t('customers.viewAccountStatement')}
                          >
                            <FileText className="w-4 h-4" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
          {/* Pagination */}
          {suppliersTotalPages > 1 && (
            <Pagination
              currentPage={suppliersPage}
              totalPages={suppliersTotalPages}
              onPageChange={setSuppliersPage}
              itemsPerPage={itemsPerPage}
              totalItems={filteredSuppliers.length}
            />
          )}
        </div>
      )}

      {/* Customer Form Modal */}
      {showCustomerForm && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-lg max-w-2xl w-full max-h-[90vh] overflow-y-auto">
            <div className="p-6 border-b">
              <h2 className="text-xl font-semibold text-gray-900">
                {editingCustomer ? t('customers.editCustomerTitle') : t('customers.addNewCustomer')}
              </h2>
            </div>
            <form onSubmit={handleCustomerFormSubmit} className="p-6 space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label htmlFor="name" className="block text-sm font-medium text-gray-700">{t('customers.nameLabel')}</label>
                  <input
                    type="text"
                    id="name"
                    name="name"
                    value={customerForm.name}
                    onChange={handleCustomerFormChange}
                    className={`mt-1 block w-full border rounded-md shadow-sm py-2 px-3 focus:outline-none focus:ring-blue-500 ${nameValidationError
                      ? 'border-red-500 focus:border-red-500 focus:ring-red-500'
                      : 'border-gray-300 focus:border-blue-500'
                      }`}
                    required
                  />
                  {nameValidationError && (
                    <p className="mt-1 text-sm text-red-600">{nameValidationError}</p>
                  )}
                </div>
                <div>
                  <label htmlFor="phone" className="block text-sm font-medium text-gray-700">{t('customers.phoneLabel')}</label>
                  <input
                    type="text"
                    id="phone"
                    name="phone"
                    value={customerForm.phone}
                    onChange={handleCustomerFormChange}
                    className="mt-1 block w-full border border-gray-300 rounded-md shadow-sm py-2 px-3 focus:outline-none focus:ring-blue-500 focus:border-blue-500"
                    required
                  />
                </div>
                <div>
                  <label htmlFor="email" className="block text-sm font-medium text-gray-700">{t('customers.emailLabel')}</label>
                  <input
                    type="email"
                    id="email"
                    name="email"
                    value={customerForm.email || ''}
                    onChange={handleCustomerFormChange}
                    className="mt-1 block w-full border border-gray-300 rounded-md shadow-sm py-2 px-3 focus:outline-none focus:ring-blue-500 focus:border-blue-500"
                  />
                </div>
                <div>
                  <label htmlFor="address" className="block text-sm font-medium text-gray-700">{t('customers.addressLabel')}</label>
                  <input
                    type="text"
                    id="address"
                    name="address"
                    value={customerForm.address || ''}
                    onChange={handleCustomerFormChange}
                    className="mt-1 block w-full border border-gray-300 rounded-md shadow-sm py-2 px-3 focus:outline-none focus:ring-blue-500 focus:border-blue-500"
                  />
                </div>
                <div className="flex items-center">
                  <input
                    type="checkbox"
                    id="isActive"
                    name="is_active"
                    checked={customerForm.is_active}
                    onChange={handleCustomerCheckboxChange}
                    className="h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 rounded"
                  />
                  <label htmlFor="isActive" className="ml-2 block text-sm text-gray-900">{t('pos.isActive')}</label>
                </div>
              </div>

              {/* Balance Fields */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-4 border-t border-gray-200">
                <h3 className="md:col-span-2 text-lg font-semibold text-gray-900">{t('customers.balanceSettings')}</h3>

                {/* Initial Balance Fields - Only show when adding new customer */}
                {!editingCustomer && (
                  <>
                    <div>
                      <label htmlFor="lb_balance" className="block text-sm font-medium text-gray-700">{t('customers.initialLBPBalance')}</label>
                      <input
                        type="number"
                        id="lb_balance"
                        name="lb_balance"
                        value={customerForm.lb_balance || 0}
                        onChange={handleCustomerFormChange}
                        className="mt-1 block w-full border border-gray-300 rounded-md shadow-sm py-2 px-3 focus:outline-none focus:ring-blue-500 focus:border-blue-500"
                        step="0.01"
                        min="0"
                      />
                    </div>

                    <div>
                      <label htmlFor="usd_balance" className="block text-sm font-medium text-gray-700">{t('customers.initialUSDBalance')}</label>
                      <input
                        type="number"
                        id="usd_balance"
                        name="usd_balance"
                        value={customerForm.usd_balance || 0}
                        onChange={handleCustomerFormChange}
                        className="mt-1 block w-full border border-gray-300 rounded-md shadow-sm py-2 px-3 focus:outline-none focus:ring-blue-500 focus:border-blue-500"
                        step="0.01"
                        min="0"
                      />
                    </div>
                  </>
                )}

                {/* Max Balance Fields - Always show */}
                <div>
                  <label htmlFor="lb_max_balance" className="block text-sm font-medium text-gray-700">{t('customers.maxLBPBalance')}</label>
                  <input
                    type="number"
                    id="lb_max_balance"
                    name="lb_max_balance"
                    value={customerForm.lb_max_balance || ''}
                    onChange={handleCustomerFormChange}
                    className="mt-1 block w-full border border-gray-300 rounded-md shadow-sm py-2 px-3 focus:outline-none focus:ring-blue-500 focus:border-blue-500"
                    step="0.01"
                    min="0"
                    placeholder={t('customers.noLimit')}
                  />
                </div>

                <div>
                  <label htmlFor="usd_max_balance" className="block text-sm font-medium text-gray-700">{t('customers.maxUSDBalance')}</label>
                  <input
                    type="number"
                    id="usd_max_balance"
                    name="usd_max_balance"
                    value={customerForm.usd_max_balance || ''}
                    onChange={handleCustomerFormChange}
                    className="mt-1 block w-full border border-gray-300 rounded-md shadow-sm py-2 px-3 focus:outline-none focus:ring-blue-500 focus:border-blue-500"
                    step="0.01"
                    min="0"
                    placeholder={t('customers.noLimit')}
                  />
                </div>
              </div>
              {customerFormError && <div className="text-red-600 text-sm font-medium pt-2">{customerFormError}</div>}
              <div className="flex justify-end space-x-3 pt-4">
                <button
                  type="button"
                  onClick={() => setShowCustomerForm(false)}
                  className="px-4 py-2 text-gray-700 border border-gray-300 rounded-lg hover:bg-gray-50"
                >
                  {t('customers.cancel')}
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
                >
                  {editingCustomer ? t('customers.save') : t('customers.addCustomer')}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Supplier Form Modal */}
      <SupplierFormModal
        open={showSupplierForm}
        onClose={() => setShowSupplierForm(false)}
        onSuccess={async (supplierData) => {
          if (editingSupplier) {
            // Note: We'll need to add updateSupplier to the context later
            showToast('Supplier update functionality coming soon!', 'error');
          } else {
            await addSupplier({
              name: supplierData.name!,
              phone: supplierData.phone!,
              email: supplierData.email || '',
              address: supplierData.address || '',
              lb_balance: supplierData.lb_balance || 0,
              usd_balance: supplierData.usd_balance || 0,
            });
            // Force immediate refresh to ensure UI updates
            await raw.refreshData();
            showToast('Supplier added successfully!', 'success');
          }
          setShowSupplierForm(false);
        }}
        editingSupplier={editingSupplier}
        existingSuppliers={suppliers}
      />

      {/* Unified Payment Form Modal */}
      {showPaymentForm && (
        <UnifiedPaymentModal
          entity={showPaymentForm.entity}
          entityType={showPaymentForm.entityType}
          paymentDirection={paymentDirection}
          setPaymentDirection={setPaymentDirection}
          paymentForm={paymentForm}
          setPaymentForm={setPaymentForm}
          overpaymentWarning={overpaymentWarning}
          setOverpaymentWarning={setOverpaymentWarning}
          getSuggestedPayments={getSuggestedPayments}
          onSubmit={handlePaymentSubmit}
          onClose={resetPaymentForm}
        />
      )}


      {/* Supplier Advances Tab */}
      {activeTab === 'supplier-advances' && (
        <SupplierAdvances
          suppliers={suppliers}
          transactions={raw.transactions as any || []}
          formatCurrency={formatCurrency}
          formatCurrencyWithSymbol={formatCurrencyWithSymbol as (amount: number, currency: string) => string}
          showToast={showToast}
          onProcessAdvance={async (data) => {
            await raw.processSupplierAdvance(data);
          }}
          onEditAdvance={async (transactionId, updates) => {
            await raw.updateSupplierAdvance(transactionId, updates);
          }}
          onDeleteAdvance={async (transactionId) => {
            await raw.deleteSupplierAdvance(transactionId);
          }}
          addSupplier={addSupplier}
          refreshData={raw.refreshData}
        />
      )}

      {/* Employee Payments Tab */}
      {activeTab === 'employee-payments' && (
        <EmployeePayments
          employees={raw.employees as any || []}
          showToast={showToast}
          refreshData={raw.refreshData}
          processEmployeePayment={raw.processEmployeePayment || (async () => ({ success: false, error: 'Not available' }))}
          formatCurrency={formatCurrency}
          formatCurrencyWithSymbol={formatCurrencyWithSymbol}
          onViewAccountStatement={(employee) => handleViewAccountStatement(employee as any, 'employee' as 'customer')}
        />
      )}

      {/* Account Statement Modal */}
      {showAccountStatement && selectedEntity && (
        <AccountStatementModal
          isOpen={!!showAccountStatement}
          onClose={() => {
            setShowAccountStatement(null);
            setSelectedEntity(null);
          }}
          entity={selectedEntity}
          entityType={showAccountStatement}
          storeId={userProfile?.store_id || ''}
          sales={raw.sales || []}
          transactions={raw.transactions as any || []}
          products={raw.products || []}
          inventory={raw.inventory || []}
          inventoryBills={raw.inventoryBills || []}
          bills={raw.bills || []}
          isSyncing={raw.getSyncStatus().isSyncing}
        />
      )}
    </div>
  );
}
