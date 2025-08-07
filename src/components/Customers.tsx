import React, { useState } from 'react';
import { useOfflineData } from '../contexts/OfflineDataContext';
import { useSupabaseAuth } from '../contexts/SupabaseAuthContext';
import { Plus, Search, Edit, Trash2, CheckCircle, XCircle, Users, Truck, DollarSign, CreditCard, TrendingDown } from 'lucide-react';
import { Customer, Supplier } from '../types';
import Toast from './common/Toast';
import SearchableSelect from './common/SearchableSelect';
import { CurrencyService } from '../services/currencyService';

export default function Customers() {
  const raw = useOfflineData();
  const customers = Array.isArray(raw.customers) ? raw.customers.map(c => ({...c, isActive: c.is_active, createdAt: c.created_at, lb_balance: c.lb_balance || 0, usd_balance: c.usd_balance || 0, email: c.email || '', address: c.address || ''})) : [];
  const suppliers = Array.isArray(raw.suppliers) ? raw.suppliers.map(s => ({...s, createdAt: s.created_at || 'commission', email: s.email || '', address: s.address || ''})) : [];
  const addCustomer = raw.addCustomer;
  const updateCustomer = raw.updateCustomer;
  const addSupplier = raw.addSupplier;
  const updateSupplier = raw.updateSupplier;
  const addTransaction = raw.addTransaction;
  const { userProfile } = useSupabaseAuth();

  const [activeTab, setActiveTab] = useState<'customers' | 'suppliers'>('customers');
  const [showCustomerForm, setShowCustomerForm] = useState(false);
  const [showSupplierForm, setShowSupplierForm] = useState(false);
  const [editingCustomer, setEditingCustomer] = useState<Customer | null>(null);
  const [editingSupplier, setEditingSupplier] = useState<Supplier | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [customerForm, setCustomerForm] = useState<Partial<Customer>>({
    name: '',
    phone: '',
    email: '',
    address: '',
    isActive: true,
  });
  const [supplierForm, setSupplierForm] = useState<Partial<Supplier>>({
    name: '',
    phone: '',
    email: '',
    address: '',
    
  });
  const [customerFormError, setCustomerFormError] = useState<string | null>(null);
  const [supplierFormError, setSupplierFormError] = useState<string | null>(null);
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error'; visible: boolean }>({
    message: '',
    type: 'success',
    visible: false,
  });

  // Payment form states
  const [showPaymentForm, setShowPaymentForm] = useState<'customer' | 'supplier' | null>(null);
  const [paymentForm, setPaymentForm] = useState({
    customerId: '',
    supplierId: '',
    amount: '',
    currency: 'USD' as 'USD' | 'LBP',
    description: '',
    reference: ''
  });

  const showToast = (message: string, type: 'success' | 'error' = 'success') => {
    setToast({ message, type, visible: true });
  };
  const hideToast = () => setToast(t => ({ ...t, visible: false }));

  // Payment handlers
  const handleCustomerPaymentSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!paymentForm.amount || parseFloat(paymentForm.amount) <= 0) {
      showToast('Please enter a valid amount', 'error');
      return;
    }
    
    if (!paymentForm.customerId) {
      showToast('Please select a customer', 'error');
      return;
    }
    
    const customer = customers.find(c => c.id === paymentForm.customerId);
    if (!customer) {
      showToast('Customer not found', 'error');
      return;
    }
    
    try {
      // Use the ERP Financial Service to process the payment
      const { erpFinancialService } = await import('../services/erpFinancialService');
      
      // Sync current customers to ERP service
      localStorage.setItem('erp_customers', JSON.stringify(customers));
      erpFinancialService.reloadData();
      
      const result = erpFinancialService.processCustomerPayment(
        paymentForm.customerId,
        parseFloat(paymentForm.amount),
        paymentForm.currency,
        `Payment from ${customer.name}${paymentForm.description ? ': ' + paymentForm.description : ''}`,
        userProfile?.id || ''
      );
      
      // Update customer balance
      const paymentAmount = parseFloat(paymentForm.amount);
      const currentLbBalance = customer.lb_balance || 0;
      const currentUsdBalance = customer.usd_balance || 0;
      
      if (paymentForm.currency === 'LBP') {
        await updateCustomer(paymentForm.customerId, { 
          lb_balance: Math.max(0, currentLbBalance - paymentAmount)
        });
      } else {
        await updateCustomer(paymentForm.customerId, { 
          usd_balance: Math.max(0, currentUsdBalance - paymentAmount)
        });
      }
      
      // Safely convert amount for database storage
      const safeAmount = CurrencyService.getInstance().safeConvertForDatabase(
        parseFloat(paymentForm.amount), 
        paymentForm.currency
      );
      
      // Add to transaction system
      addTransaction({
        type: 'income',
        category: 'Customer Payment',
        amount: safeAmount.amount,
        currency: safeAmount.currency,
        description: `Payment from ${customer.name}${paymentForm.description ? ': ' + paymentForm.description : ''}${safeAmount.wasConverted ? ` (Originally ${paymentForm.amount} ${paymentForm.currency})` : ''}`,
        reference: paymentForm.reference,
        created_by: userProfile?.id || ''
      });
      
      showToast(`Payment received! ${customer.name} balance updated`, 'success');
    } catch (err) {
      console.log(err);
      showToast('Failed to record payment.', 'error');
    }
    
    setPaymentForm({
      customerId: '',
      supplierId: '',
      amount: '',
      currency: 'USD',
      description: '',
      reference: ''
    });
    setShowPaymentForm(null);
  };

  const handleSupplierPaymentSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!paymentForm.amount || parseFloat(paymentForm.amount) <= 0) {
      showToast('Please enter a valid amount', 'error');
      return;
    }
    
    if (!paymentForm.supplierId) {
      showToast('Please select a supplier', 'error');
      return;
    }
    
    const supplier = suppliers.find(s => s.id === paymentForm.supplierId);
    if (!supplier) {
      showToast('Supplier not found', 'error');
      return;
    }
    
    try {
      // Use the ERP Financial Service to process the payment
      const { erpFinancialService } = await import('../services/erpFinancialService');
      
      // Sync current suppliers to ERP service
      localStorage.setItem('erp_suppliers', JSON.stringify(suppliers));
      erpFinancialService.reloadData();
      
      const result = erpFinancialService.processSupplierPayment(
        paymentForm.supplierId,
        parseFloat(paymentForm.amount),
        paymentForm.currency,
        `Payment to ${supplier.name}${paymentForm.description ? ': ' + paymentForm.description : ''}`,
        userProfile?.id || ''
      );
      
      // Update supplier balance (reduce debt)
      const paymentAmount = parseFloat(paymentForm.amount);
      const currentLbBalance = supplier.lb_balance || 0;
      const currentUsdBalance = supplier.usd_balance || 0;
      
      if (paymentForm.currency === 'LBP') {
        await updateSupplier(paymentForm.supplierId, { 
          lb_balance: Math.max(0, currentLbBalance - paymentAmount)
        });
      } else {
        await updateSupplier(paymentForm.supplierId, { 
          usd_balance: Math.max(0, currentUsdBalance - paymentAmount)
        });
      }
      
      // Safely convert amount for database storage
      const safeAmount = CurrencyService.getInstance().safeConvertForDatabase(
        parseFloat(paymentForm.amount), 
        paymentForm.currency
      );
      
      // Add to transaction system
      addTransaction({
        type: 'expense',
        category: 'Supplier Payment',
        amount: safeAmount.amount,
        currency: safeAmount.currency,
        description: `Payment to ${supplier.name}${paymentForm.description ? ': ' + paymentForm.description : ''}${safeAmount.wasConverted ? ` (Originally ${paymentForm.amount} ${paymentForm.currency})` : ''}`,
        reference: paymentForm.reference,
        created_by: userProfile?.id || ''
      });
      
      showToast(`Payment sent! ${supplier.name} payment recorded`, 'success');
    } catch (err) {
      console.log(err);
      showToast('Failed to record payment.', 'error');
    }
    
    setPaymentForm({
      customerId: '',
      supplierId: '',
      amount: '',
      currency: 'USD',
      description: '',
      reference: ''
    });
    setShowPaymentForm(null);
  };

  const handleRecordCustomerPayment = (customer: Customer) => {
    setPaymentForm(prev => ({ ...prev, customerId: customer.id }));
    setShowPaymentForm('customer');
  };

  const handleRecordSupplierPayment = (supplier: Supplier) => {
    setPaymentForm(prev => ({ ...prev, supplierId: supplier.id }));
    setShowPaymentForm('supplier');
  };

  // Customer handlers
  const handleAddCustomerClick = () => {
    setEditingCustomer(null);
    setCustomerForm({
      name: '',
      phone: '',
      email: '',
      address: '',
      isActive: true,
    });
    setShowCustomerForm(true);
  };

  const handleEditCustomerClick = (customer: Customer) => {
    setEditingCustomer(customer);
    setCustomerForm({
      name: customer.name,
      phone: customer.phone,
      email: customer.email || '',
      address: customer.address || '',
      isActive: customer.isActive,
    });
    setShowCustomerForm(true);
  };

  const handleCustomerFormChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => {
    const { name, value, type } = e.target;
    setCustomerForm(prev => ({
      ...prev,
      [name]: type === 'number' ? parseFloat(value) : value,
    }));
  };

  const handleCustomerCheckboxChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setCustomerForm(prev => ({
      ...prev,
      isActive: e.target.checked,
    }));
  };

  const handleCustomerFormSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!customerForm.name || !customerForm.phone) {
      setCustomerFormError('Name and Phone are required.');
      showToast('Name and Phone are required.', 'error');
      return;
    }
    const exists = customers.some(c => c.name.trim().toLowerCase() === customerForm.name!.trim().toLowerCase() && c.phone.trim() === customerForm.phone!.trim() && (!editingCustomer || c.id !== editingCustomer.id));
    if (exists) {
      setCustomerFormError('This customer already exists.');
      showToast('This customer already exists.', 'error');
      return;
    }
    setCustomerFormError(null);
    if (editingCustomer) {
      updateCustomer(editingCustomer.id, {
        ...customerForm,
        lb_balance: editingCustomer.lb_balance || 0,
        usd_balance: editingCustomer.usd_balance || 0,
      } as Customer);
      showToast('Customer updated successfully!', 'success');
    } else {
      addCustomer({
        name: customerForm.name!,
        phone: customerForm.phone!,
        email: customerForm.email || '',
        address: customerForm.address || '',
        is_active: customerForm.isActive ?? true,
        lb_balance: 0,
        usd_balance: 0,
      });
      showToast('Customer added successfully!', 'success');
    }
    setShowCustomerForm(false);
  };

  // Supplier handlers
  const handleAddSupplierClick = () => {
    setEditingSupplier(null);
    setSupplierForm({
      name: '',
      phone: '',
      email: '',
      address: '',
    });
    setShowSupplierForm(true);
  };

  const handleEditSupplierClick = (supplier: Supplier) => {
    setEditingSupplier(supplier);
    setSupplierForm({
      name: supplier.name,
      phone: supplier.phone,
      email: supplier.email || '',
      address: supplier.address || '',
    });
    setShowSupplierForm(true);
  };

  const handleSupplierFormChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => {
    const { name, value, type } = e.target;
    setSupplierForm(prev => ({
      ...prev,
      [name]: type === 'number' ? parseFloat(value) : value,
    }));
  };

  const handleSupplierCheckboxChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setSupplierForm(prev => ({
      ...prev,
    }));
  };

  const handleSupplierFormSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!supplierForm.name || !supplierForm.phone) {
      setSupplierFormError('Name and Phone are required.');
      showToast('Name and Phone are required.', 'error');
      return;
    }
    const exists = suppliers.some(s => s.name.trim().toLowerCase() === supplierForm.name!.trim().toLowerCase() && s.phone.trim() === supplierForm.phone!.trim() && (!editingSupplier || s.id !== editingSupplier.id));
    if (exists) {
      setSupplierFormError('This supplier already exists.');
      showToast('This supplier already exists.', 'error');
      return;
    }
    setSupplierFormError(null);
    if (editingSupplier) {
      // Note: We'll need to add updateSupplier to the context later
      showToast('Supplier update functionality coming soon!', 'error');
    } else {
      addSupplier({
        name: supplierForm.name!,
        phone: supplierForm.phone!,
        email: supplierForm.email || '',
        address: supplierForm.address || '',
      });
      showToast('Supplier added successfully!', 'success');
    }
    setShowSupplierForm(false);
  };

  const filteredCustomers = customers.filter(customer =>
    customer.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    customer.phone.toLowerCase().includes(searchTerm.toLowerCase()) ||
    (customer.email && customer.email.toLowerCase().includes(searchTerm.toLowerCase()))
  );

  const filteredSuppliers = suppliers.filter(supplier =>
    supplier.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    supplier.phone.toLowerCase().includes(searchTerm.toLowerCase()) ||
    (supplier.email && supplier.email.toLowerCase().includes(searchTerm.toLowerCase()))
  );

  return (
    <div className="p-6">
      <Toast message={toast.message} type={toast.type} visible={toast.visible} onClose={hideToast} />
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-3xl font-bold text-gray-900">Customer & Supplier Management</h1>
        <button
          onClick={activeTab === 'customers' ? handleAddCustomerClick : handleAddSupplierClick}
          className="bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 transition-colors flex items-center"
        >
          <Plus className="w-5 h-5 mr-2" />
          Add {activeTab === 'customers' ? 'Customer' : 'Supplier'}
        </button>
      </div>

      {/* Tabs */}
      <div className="bg-white rounded-lg shadow-sm mb-6">
        <div className="border-b border-gray-200">
          <nav className="-mb-px flex space-x-8">
            <button
              onClick={() => setActiveTab('customers')}
              className={`py-2 px-1 border-b-2 font-medium text-sm ${
                activeTab === 'customers'
                  ? 'border-blue-500 text-blue-600'
                  : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
              }`}
            >
              <Users className="w-5 h-5 inline mr-2" />
              Customers
            </button>
            <button
              onClick={() => setActiveTab('suppliers')}
              className={`py-2 px-1 border-b-2 font-medium text-sm ${
                activeTab === 'suppliers'
                  ? 'border-blue-500 text-blue-600'
                  : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
              }`}
            >
              <Truck className="w-5 h-5 inline mr-2" />
              Suppliers
            </button>
          </nav>
        </div>
      </div>

      {/* Search */}
      <div className="bg-white p-4 rounded-lg shadow-sm mb-6">
        <div className="relative">
          <Search className="w-5 h-5 absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400" />
          <input
            type="text"
            placeholder={`Search ${activeTab} by name, phone, or email...`}
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-blue-500 focus:border-blue-500"
          />
        </div>
      </div>

      {/* Customer List Table */}
      {activeTab === 'customers' && (
        <div className="bg-white rounded-lg shadow-sm overflow-hidden">
          <div className="p-6 border-b">
            <h2 className="text-lg font-semibold text-gray-900">All Customers</h2>
          </div>
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Name</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Contact</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Balance</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Status</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Actions</th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {filteredCustomers.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="px-6 py-4 text-center text-gray-500">
                      No customers found.
                    </td>
                  </tr>
                ) : (
                  filteredCustomers.map(customer => (
                    <tr key={customer.id}>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="text-sm font-medium text-gray-900">{customer.name}</div>
                        <div className="text-sm text-gray-500">{customer.address}</div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="text-sm text-gray-900">{customer.phone}</div>
                        <div className="text-sm text-gray-500">{customer.email}</div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm">
                        <div>
                          <span className={`font-medium ${(customer.lb_balance || 0) > 0 ? 'text-red-600' : 'text-green-600'}`}>
                            LBP: {(customer.lb_balance || 0).toLocaleString()}
                          </span>
                          <br />
                          <span className={`font-medium ${(customer.usd_balance || 0) > 0 ? 'text-red-600' : 'text-green-600'}`}>
                            USD: {(customer.usd_balance || 0).toLocaleString()}
                          </span>
                        </div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <span className={`px-2 inline-flex text-xs leading-5 font-semibold rounded-full ${
                          customer.isActive ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'
                        }`}>
                          {customer.isActive ? 'Active' : 'Inactive'}
                        </span>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-left text-sm font-medium">
                        <div className="flex space-x-2">
                          <button
                            onClick={() => handleEditCustomerClick(customer)}
                            className="text-blue-600 hover:text-blue-900"
                            title="Edit Customer"
                          >
                            <Edit className="w-4 h-4" />
                          </button>
                          <button 
                            onClick={() => handleRecordCustomerPayment(customer)}
                            className="text-green-600 hover:text-green-800"
                            title="Record payment"
                          >
                            <DollarSign className="w-4 h-4" />
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

      {/* Supplier List Table */}
      {activeTab === 'suppliers' && (
        <div className="bg-white rounded-lg shadow-sm overflow-hidden">
          <div className="p-6 border-b">
            <h2 className="text-lg font-semibold text-gray-900">All Suppliers</h2>
          </div>
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200">
                             <thead className="bg-gray-50">
                 <tr>
                   <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Name</th>
                   <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Contact</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Balance</th>
                   <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Actions</th>
                 </tr>
               </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                                                 {filteredSuppliers.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="px-6 py-4 text-center text-gray-500">
                      No suppliers found.
                    </td>
                  </tr>
                 ) : (
                                     filteredSuppliers.map(supplier => (
                     <tr key={supplier.id}>
                       <td className="px-6 py-4 whitespace-nowrap">
                         <div className="text-sm font-medium text-gray-900">{supplier.name}</div>
                         <div className="text-sm text-gray-500">{supplier.address}</div>
                       </td>
                                             <td className="px-6 py-4 whitespace-nowrap">
                        <div className="text-sm text-gray-900">{supplier.phone}</div>
                        <div className="text-sm text-gray-500">{supplier.email}</div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm">
                        <div>
                          <span className={`font-medium ${(supplier.lb_balance || 0) > 0 ? 'text-red-600' : 'text-green-600'}`}>
                            LBP: {(supplier.lb_balance || 0).toLocaleString()}
                          </span>
                          <br />
                          <span className={`font-medium ${(supplier.usd_balance || 0) > 0 ? 'text-red-600' : 'text-green-600'}`}>
                            USD: {(supplier.usd_balance || 0).toLocaleString()}
                          </span>
                        </div>
                      </td>
                    
                       <td className="px-6 py-4 whitespace-nowrap text-left text-sm font-medium">
                         <div className="flex space-x-2">
                           <button
                             onClick={() => handleEditSupplierClick(supplier)}
                             className="text-blue-600 hover:text-blue-900"
                             title="Edit Supplier"
                           >
                             <Edit className="w-4 h-4" />
                           </button>
                                                       <button 
                              onClick={() => handleRecordSupplierPayment(supplier)}
                              className="text-red-600 hover:text-red-800"
                              title="Make payment"
                            >
                              <CreditCard className="w-4 h-4" />
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

      {/* Customer Form Modal */}
      {showCustomerForm && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-lg max-w-2xl w-full max-h-[90vh] overflow-y-auto">
            <div className="p-6 border-b">
              <h2 className="text-xl font-semibold text-gray-900">
                {editingCustomer ? 'Edit Customer' : 'Add New Customer'}
              </h2>
            </div>
            <form onSubmit={handleCustomerFormSubmit} className="p-6 space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label htmlFor="name" className="block text-sm font-medium text-gray-700">Name *</label>
                  <input
                    type="text"
                    id="name"
                    name="name"
                    value={customerForm.name}
                    onChange={handleCustomerFormChange}
                    className="mt-1 block w-full border border-gray-300 rounded-md shadow-sm py-2 px-3 focus:outline-none focus:ring-blue-500 focus:border-blue-500"
                    required
                  />
                </div>
                <div>
                  <label htmlFor="phone" className="block text-sm font-medium text-gray-700">Phone *</label>
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
                  <label htmlFor="email" className="block text-sm font-medium text-gray-700">Email</label>
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
                  <label htmlFor="address" className="block text-sm font-medium text-gray-700">Address</label>
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
                    name="isActive"
                    checked={customerForm.isActive}
                    onChange={handleCustomerCheckboxChange}
                    className="h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 rounded"
                  />
                  <label htmlFor="isActive" className="ml-2 block text-sm text-gray-900">Is Active</label>
                </div>
              </div>
              {customerFormError && <div className="text-red-600 text-sm font-medium pt-2">{customerFormError}</div>}
              <div className="flex justify-end space-x-3 pt-4">
                <button
                  type="button"
                  onClick={() => setShowCustomerForm(false)}
                  className="px-4 py-2 text-gray-700 border border-gray-300 rounded-lg hover:bg-gray-50"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
                >
                  {editingCustomer ? 'Save Changes' : 'Add Customer'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Supplier Form Modal */}
      {showSupplierForm && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-lg max-w-2xl w-full max-h-[90vh] overflow-y-auto">
            <div className="p-6 border-b">
              <h2 className="text-xl font-semibold text-gray-900">
                {editingSupplier ? 'Edit Supplier' : 'Add New Supplier'}
              </h2>
            </div>
            <form onSubmit={handleSupplierFormSubmit} className="p-6 space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label htmlFor="supplier-name" className="block text-sm font-medium text-gray-700">Name *</label>
                  <input
                    type="text"
                    id="supplier-name"
                    name="name"
                    value={supplierForm.name}
                    onChange={handleSupplierFormChange}
                    className="mt-1 block w-full border border-gray-300 rounded-md shadow-sm py-2 px-3 focus:outline-none focus:ring-blue-500 focus:border-blue-500"
                    required
                  />
                </div>
                <div>
                  <label htmlFor="supplier-phone" className="block text-sm font-medium text-gray-700">Phone *</label>
                  <input
                    type="text"
                    id="supplier-phone"
                    name="phone"
                    value={supplierForm.phone}
                    onChange={handleSupplierFormChange}
                    className="mt-1 block w-full border border-gray-300 rounded-md shadow-sm py-2 px-3 focus:outline-none focus:ring-blue-500 focus:border-blue-500"
                    required
                  />
                </div>
                <div>
                  <label htmlFor="supplier-email" className="block text-sm font-medium text-gray-700">Email</label>
                  <input
                    type="email"
                    id="supplier-email"
                    name="email"
                    value={supplierForm.email || ''}
                    onChange={handleSupplierFormChange}
                    className="mt-1 block w-full border border-gray-300 rounded-md shadow-sm py-2 px-3 focus:outline-none focus:ring-blue-500 focus:border-blue-500"
                  />
                </div>
                <div>
                  <label htmlFor="supplier-address" className="block text-sm font-medium text-gray-700">Address</label>
                  <input
                    type="text"
                    id="supplier-address"
                    name="address"
                    value={supplierForm.address}
                    onChange={handleSupplierFormChange}
                    className="mt-1 block w-full border border-gray-300 rounded-md shadow-sm py-2 px-3 focus:outline-none focus:ring-blue-500 focus:border-blue-500"
                  />
                </div>
               
         
              </div>
              {supplierFormError && <div className="text-red-600 text-sm font-medium pt-2">{supplierFormError}</div>}
              <div className="flex justify-end space-x-3 pt-4">
                <button
                  type="button"
                  onClick={() => setShowSupplierForm(false)}
                  className="px-4 py-2 text-gray-700 border border-gray-300 rounded-lg hover:bg-gray-50"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
                >
                  {editingSupplier ? 'Save Changes' : 'Add Supplier'}
                </button>
              </div>
              
            </form>
          </div>
        </div>
      )}

      {/* Customer Payment Form Modal */}
      {showPaymentForm === 'customer' && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-lg max-w-2xl w-full max-h-[90vh] overflow-y-auto">
            <div className="p-6 border-b">
              <h2 className="text-xl font-semibold text-gray-900">Add Payment Received</h2>
            </div>
            <form onSubmit={handleCustomerPaymentSubmit} className="p-6 space-y-6">
              <div className="bg-green-50 border border-green-200 rounded-lg p-4 mb-6">
                <div className="flex items-center">
                  <CheckCircle className="w-5 h-5 text-green-600 mr-2" />
                  <span className="text-green-800 font-medium">Record a payment received from a customer</span>
                </div>
              </div>
              
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="md:col-span-2">
                  <SearchableSelect
                    options={customers.filter(c => c.isActive).map(customer => ({
                      id: customer.id,
                      label: customer.name,
                      value: customer.id,
                      category: 'Customer'
                    }))}
                    value={paymentForm.customerId}
                    onChange={(value) => setPaymentForm(prev => ({ ...prev, customerId: value as string }))}
                    placeholder="Select Customer *"
                    searchPlaceholder="Search customers..."
                    className="w-full"
                  />
                </div>
                
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">Amount *</label>
                  <input
                    type="number"
                    step="0.01"
                    max="99999999.99"
                    value={paymentForm.amount}
                    onChange={(e) => {
                      const value = e.target.value;
                      const numValue = parseFloat(value);
                      if (numValue > 99999999.99) {
                        showToast('Amount exceeds maximum allowed value (99,999,999.99)', 'error');
                        return;
                      }
                      setPaymentForm(prev => ({ ...prev, amount: value }));
                    }}
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:ring-green-500 focus:border-green-500"
                    required
                    placeholder="0.00"
                  />
                  <p className="text-xs text-gray-500 mt-1">Maximum: 99,999,999.99</p>
                </div>
                
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">Currency *</label>
                  <select
                    value={paymentForm.currency}
                    onChange={(e) => setPaymentForm(prev => ({ ...prev, currency: e.target.value as 'USD' | 'LBP' }))}
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:ring-green-500 focus:border-green-500"
                  >
                    <option value="USD">USD ($)</option>
                    <option value="LBP">LBP (ل.ل)</option>
                  </select>
                </div>
              </div>
              
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Description (optional)</label>
                <input
                  type="text"
                  value={paymentForm.description}
                  onChange={(e) => setPaymentForm(prev => ({ ...prev, description: e.target.value }))}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:ring-green-500 focus:border-green-500"
                  placeholder="e.g., Payment for invoice #123, Cash payment, etc."
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
                  className="px-6 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors font-medium"
                >
                  Record Payment
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Supplier Payment Form Modal */}
      {showPaymentForm === 'supplier' && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-lg max-w-2xl w-full max-h-[90vh] overflow-y-auto">
            <div className="p-6 border-b">
              <h2 className="text-xl font-semibold text-gray-900">Add Payment Sent</h2>
            </div>
            <form onSubmit={handleSupplierPaymentSubmit} className="p-6 space-y-6">
              <div className="bg-red-50 border border-red-200 rounded-lg p-4 mb-6">
                <div className="flex items-center">
                  <TrendingDown className="w-5 h-5 text-red-600 mr-2" />
                  <span className="text-red-800 font-medium">Record a payment sent to a supplier</span>
                </div>
              </div>
              
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="md:col-span-2">
                  <SearchableSelect
                    options={suppliers.map(supplier => ({
                      id: supplier.id,
                      label: supplier.name,
                      value: supplier.id,
                    }))}
                    value={paymentForm.supplierId}
                    onChange={(value) => setPaymentForm(prev => ({ ...prev, supplierId: value as string }))}
                    placeholder="Select Supplier *"
                    searchPlaceholder="Search suppliers..."
                    categories={['Commission', 'Cash']}
                    showAddOption={true}
                    addOptionText="Add New Supplier"
                    onAddNew={() => setShowSupplierForm(true)}
                    className="w-full"
                  />
                </div>
                
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">Amount *</label>
                  <input
                    type="number"
                    step="0.01"
                    max="99999999.99"
                    value={paymentForm.amount}
                    onChange={(e) => {
                      const value = e.target.value;
                      const numValue = parseFloat(value);
                      if (numValue > 99999999.99) {
                        showToast('Amount exceeds maximum allowed value (99,999,999.99)', 'error');
                        return;
                      }
                      setPaymentForm(prev => ({ ...prev, amount: value }));
                    }}
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:ring-red-500 focus:border-red-500"
                    required
                    placeholder="0.00"
                  />
                  <p className="text-xs text-gray-500 mt-1">Maximum: 99,999,999.99</p>
                </div>
                
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">Currency *</label>
                  <select
                    value={paymentForm.currency}
                    onChange={(e) => setPaymentForm(prev => ({ ...prev, currency: e.target.value as 'USD' | 'LBP' }))}
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:ring-red-500 focus:border-red-500"
                  >
                    <option value="USD">USD ($)</option>
                    <option value="LBP">LBP (ل.ل)</option>
                  </select>
                </div>
              </div>
              
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Description (optional)</label>
                <input
                  type="text"
                  value={paymentForm.description}
                  onChange={(e) => setPaymentForm(prev => ({ ...prev, description: e.target.value }))}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:ring-red-500 focus:border-red-500"
                  placeholder="e.g., Payment for goods, Commission payment, etc."
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
                  className="px-6 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors font-medium"
                >
                  Record Payment
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}