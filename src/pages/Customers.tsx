import React, { useState } from 'react';
import { useOfflineData } from '../contexts/OfflineDataContext';
import { useSupabaseAuth } from '../contexts/SupabaseAuthContext';
import { useI18n } from '../i18n';
import { Plus, Search, Edit, CheckCircle, Users, Truck, DollarSign, CreditCard, TrendingDown, FileText } from 'lucide-react';
import { Customer, Supplier } from '../types';
import Toast from '../components/common/Toast';
import SearchableSelect from '../components/common/SearchableSelect';
import SupplierFormModal from '../components/common/SupplierFormModal';
import AccountStatementModal from '../components/AccountStatementModal';

export default function Customers() {
  const raw = useOfflineData();
  const { pushUndo, getStore } = raw;
  const { t } = useI18n();
  const customers = Array.isArray(raw.customers) ? raw.customers.map(c => ({...c, isActive: c.is_active, createdAt: c.created_at, lb_balance: c.lb_balance || 0, usd_balance: c.usd_balance || 0, email: c.email || '', address: c.address || ''})) : [];
  const suppliers = Array.isArray(raw.suppliers) ? raw.suppliers.map(s => ({...s, createdAt: s.created_at || 'commission', email: s.email || '', address: s.address || ''})) : [];
  const addCustomer = raw.addCustomer;
  const updateCustomer = raw.updateCustomer;
  const addSupplier = raw.addSupplier;
  const updateSupplier = raw.updateSupplier;
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
  const [customerFormError, setCustomerFormError] = useState<string | null>(null);
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

  // Account statement modal states
  const [showAccountStatement, setShowAccountStatement] = useState<'customer' | 'supplier' | null>(null);
  const [selectedEntity, setSelectedEntity] = useState<Customer | Supplier | null>(null);

  const showToast = (message: string, type: 'success' | 'error' = 'success') => {
    setToast({ message, type, visible: true });
  };
  const hideToast = () => setToast(t => ({ ...t, visible: false }));

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
    if (entityType === 'customer' && !(entity as Customer).isActive) {
      showToast('Cannot process payment for inactive customer', 'error');
      return { isValid: false };
    }

    return { isValid: true, entity  };
  };

  const resetPaymentForm = () => {
    setPaymentForm({
      customerId: '',
      supplierId: '',
      amount: '',
      currency: 'LBP',
      description: '',
      reference: ''
    });
    setShowPaymentForm(null);
  };



  // Unified payment handler using context method
  const processPaymentLocal = async (
    entityType: 'customer' | 'supplier',
    entityId: string,
    amount: string,
    currency: 'USD' | 'LBP',
    description: string,
    reference: string
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
        createdBy: userProfile?.id || ''
      });

      if (result.success) {
        // Show success message
        const action = entityType === 'customer' ? 'received' : 'sent';
        showToast(`Payment ${action}! ${entity.name} balance updated`, 'success');
        return true;
      } else {
        showToast(result.error || 'Failed to process payment', 'error');
        return false;
      }
    } catch (err) {
      console.error('Payment processing error:', err);
      showToast('Failed to record payment.', 'error');
      return false;
    }
  };

  // Payment handlers
  const handleCustomerPaymentSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    const success = await processPaymentLocal(
      'customer',
      paymentForm.customerId,
      paymentForm.amount,
      paymentForm.currency,
      paymentForm.description,
      paymentForm.reference
    );

    if (success) {
      resetPaymentForm();
    }
  };

  const handleSupplierPaymentSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    const success = await processPaymentLocal(
      'supplier',
      paymentForm.supplierId,
      paymentForm.amount,
      paymentForm.currency,
      paymentForm.description,
      paymentForm.reference
    );

    if (success) {
      resetPaymentForm();
    }
  };

  const handleRecordCustomerPayment = (customer: Customer) => {
    
    setPaymentForm(prev => ({ ...prev, customerId: customer.id }));
    setShowPaymentForm('customer');
  };

  const handleRecordSupplierPayment = (supplier: Supplier) => {
    setPaymentForm(prev => ({ ...prev, supplierId: supplier.id }));
    setShowPaymentForm('supplier');
  };

  // Account statement handlers
  const handleViewAccountStatement = (entity: Customer | Supplier, type: 'customer' | 'supplier') => {
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
      setCustomerFormError(t('customers.nameRequired'));
      showToast(t('customers.nameRequired'), 'error');
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
    setShowSupplierForm(true);
  };

  const handleEditSupplierClick = (supplier: Supplier) => {
    setEditingSupplier(supplier);
    setShowSupplierForm(true);
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
        <h1 className="text-2xl font-bold text-gray-900">{t('customers.title')}</h1>
        <button
          onClick={activeTab === 'customers' ? handleAddCustomerClick : handleAddSupplierClick}
          className="bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 transition-colors flex items-center"
        >
          <Plus className="w-5 h-5 mr-2" />
          {activeTab === 'customers' ? t('customers.addCustomer') : t('customers.addSupplier')}
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
              {t('customers.clients')}
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
              {t('customers.suppliers')}
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
            placeholder={t('customers.searchPlaceholder', { type: activeTab === 'customers' ? t('customers.clients') : t('customers.suppliers') })}
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
                  filteredCustomers.map(customer => (
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
                        <div>
                          <span className={`font-medium ${(customer.lb_balance || 0) > 0 ? 'text-red-600' : 'text-green-600'}`}>
                            {t('customers.lbp')}: {(customer.lb_balance || 0).toLocaleString()}
                          </span>
                          <br />
                          <span className={`font-medium ${(customer.usd_balance || 0) > 0 ? 'text-red-600' : 'text-green-600'}`}>
                            $: {(customer.usd_balance || 0).toLocaleString()}
                          </span>
                        </div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap rtl:text-right ltr:text-left">
                        <span className={`px-2 inline-flex text-xs leading-5 font-semibold rounded-full ${
                          customer.isActive ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'
                        }`}>
                          {customer.isActive ? t('customers.active') : t('customers.inactive')}
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
                            onClick={() => handleRecordCustomerPayment(customer)}
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
                                     filteredSuppliers.map(supplier => (
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
                              onClick={() => handleRecordSupplierPayment(supplier)}
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
                    className="mt-1 block w-full border border-gray-300 rounded-md shadow-sm py-2 px-3 focus:outline-none focus:ring-blue-500 focus:border-blue-500"
                    required
                  />
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
            addSupplier({
              name: supplierData.name!,
              phone: supplierData.phone!,
              email: supplierData.email || '',
              address: supplierData.address || '',
            });
            showToast('Supplier added successfully!', 'success');
          }
          setShowSupplierForm(false);
        }}
        editingSupplier={editingSupplier}
        existingSuppliers={suppliers}
      />

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
                  <label className="block text-sm font-medium text-gray-700 mb-2">{t('customers.paymentAmount')} *</label>
                  <input
                    type="number"
                    step="0.01"
                    value={paymentForm.amount}
                    onChange={(e) => {
                      const value = e.target.value;
                   
                      setPaymentForm(prev => ({ ...prev, amount: value }));
                    }}
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:ring-green-500 focus:border-green-500"
                    required
                    placeholder="0.00"
                  />
                </div>
                
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">{t('customers.paymentCurrency')} *</label>
                  <select
                    value={paymentForm.currency}
                    onChange={(e) => setPaymentForm(prev => ({ ...prev, currency: e.target.value as 'USD' | 'LBP' }))}
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:ring-green-500 focus:border-green-500"
                  >
                    <option value="USD">{t('customers.usd')}</option>
                    <option value="LBP">{t('customers.lbp')}</option>
                  </select>
                </div>
              </div>
              
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">{t('customers.paymentDescription')} (optional)</label>
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
                    value={paymentForm.amount}
                    onChange={(e) => {
                      const value = e.target.value;
              
                      setPaymentForm(prev => ({ ...prev, amount: value }));
                    }}
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:ring-red-500 focus:border-red-500"
                    required
                    placeholder="0.00"
                  />
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
                <label className="block text-sm font-medium text-gray-700 mb-2">{t('customers.paymentDescription')} (optional)</label>
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
          sales={raw.sales || []}
          transactions={raw.transactions || []}
          products={raw.products || []}
          inventory={raw.inventory || []}
          inventoryBills={raw.inventoryBills || []}
          bills={raw.bills || []}
        />
      )}
    </div>
  );
}