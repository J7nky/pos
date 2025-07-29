import React, { useState } from 'react';
import { useOfflineData } from '../contexts/OfflineDataContext';
import { useSupabaseAuth } from '../contexts/SupabaseAuthContext';
import { Plus, Search, Edit, Trash2, CheckCircle, XCircle, Users, Truck } from 'lucide-react';
import { Customer, Supplier } from '../types';
import Toast from './common/Toast';

export default function Customers() {
  const raw = useOfflineData();
  const customers = Array.isArray(raw.customers) ? raw.customers.map(c => ({...c, isActive: c.is_active, createdAt: c.created_at, currentDebt: c.current_debt, email: c.email || '', address: c.address || ''})) : [];
  const suppliers = Array.isArray(raw.suppliers) ? raw.suppliers.map(s => ({...s, isActive: s.is_active, createdAt: s.created_at, email: s.email || '', address: s.address || ''})) : [];
  const addCustomer = raw.addCustomer;
  const updateCustomer = raw.updateCustomer;
  const addSupplier = raw.addSupplier;
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
    isActive: true,
  });
  const [customerFormError, setCustomerFormError] = useState<string | null>(null);
  const [supplierFormError, setSupplierFormError] = useState<string | null>(null);
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error'; visible: boolean }>({
    message: '',
    type: 'success',
    visible: false,
  });

  const showToast = (message: string, type: 'success' | 'error' = 'success') => {
    setToast({ message, type, visible: true });
  };
  const hideToast = () => setToast(t => ({ ...t, visible: false }));

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
        currentDebt: editingCustomer.currentDebt,
      } as Customer);
      showToast('Customer updated successfully!', 'success');
    } else {
      addCustomer({
        name: customerForm.name!,
        phone: customerForm.phone!,
        email: customerForm.email || '',
        address: customerForm.address || '',
        is_active: customerForm.isActive ?? true,
        current_debt: 0,
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
      isActive: true,
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
      isActive: supplier.isActive,
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
      isActive: e.target.checked,
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
        type: 'commission', // Default value since type should be determined at inventory level
        is_active: supplierForm.isActive ?? true,
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
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Current Debt</th>
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
                        <span className={`font-medium ${customer.currentDebt > 0 ? 'text-red-600' : 'text-green-600'}`}>
                          ${customer.currentDebt.toLocaleString()}
                        </span>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <span className={`px-2 inline-flex text-xs leading-5 font-semibold rounded-full ${
                          customer.isActive ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'
                        }`}>
                          {customer.isActive ? 'Active' : 'Inactive'}
                        </span>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-left text-sm font-medium">
                        <button
                          onClick={() => handleEditCustomerClick(customer)}
                          className="text-blue-600 hover:text-blue-900 mr-3"
                          title="Edit Customer"
                        >
                          <Edit className="w-5 h-5" />
                        </button>
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
                   <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Status</th>
                   <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Actions</th>
                 </tr>
               </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                                 {filteredSuppliers.length === 0 ? (
                   <tr>
                     <td colSpan={4} className="px-6 py-4 text-center text-gray-500">
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
                       <td className="px-6 py-4 whitespace-nowrap">
                         <span className={`px-2 inline-flex text-xs leading-5 font-semibold rounded-full ${
                           supplier.isActive ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'
                         }`}>
                           {supplier.isActive ? 'Active' : 'Inactive'}
                         </span>
                       </td>
                       <td className="px-6 py-4 whitespace-nowrap text-left text-sm font-medium">
                         <button
                           onClick={() => handleEditSupplierClick(supplier)}
                           className="text-blue-600 hover:text-blue-900 mr-3"
                           title="Edit Supplier"
                         >
                           <Edit className="w-5 h-5" />
                         </button>
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
                    value={customerForm.email}
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
                    value={customerForm.address}
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
                    value={supplierForm.email}
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
                
                <div className="flex items-center">
                  <input
                    type="checkbox"
                    id="supplier-isActive"
                    name="isActive"
                    checked={supplierForm.isActive}
                    onChange={handleSupplierCheckboxChange}
                    className="h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 rounded"
                  />
                  <label htmlFor="supplier-isActive" className="ml-2 block text-sm text-gray-900">Is Active</label>
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
    </div>
  );
}