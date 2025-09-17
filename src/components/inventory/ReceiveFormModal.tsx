import React, { useState, useRef, useEffect } from 'react';
import { Plus, X, Package, Eye, Upload, Truck } from 'lucide-react';
import SearchableSelect from '../common/SearchableSelect';
import SupplierFormModal from '../common/SupplierFormModal';

interface ReceiveFormModalProps {
  open: boolean;
  onClose: () => void;
  onSuccess: (data: any) => Promise<void>;
  products: any[];
  suppliers: any[];
  defaultCommissionRate: number;
  recentSuppliers: string[];
  setRecentSuppliers: (suppliers: string[]) => void;
  form: any;
  setForm: (form: any) => void;
  errors: any;
  setErrors: (errors: any) => void;
  addSupplier?: (supplier: any) => Promise<void>;
}

const ReceiveFormModal: React.FC<ReceiveFormModalProps> = ({
  open,
  onClose,
  onSuccess,
  products,
  suppliers,
  defaultCommissionRate,
  recentSuppliers,
  setRecentSuppliers,
  form,
  setForm,
  errors,
  setErrors,
  addSupplier,
}) => {
  const [loading, setLoading] = useState(false);
  const firstInputRef = useRef<HTMLInputElement>(null);
  const [bulkProducts, setBulkProducts] = useState<string[]>([]);
  const [bulkItems, setBulkItems] = useState<Record<string, { 
    product_id?: string; 
    quantity: string; 
    unit: 'kg' | 'piece' | 'box' | 'bag' | 'bundle' | 'dozen'; 
    price?: string; 
    selling_price?: string;
    weight?: string 
  }>>({});
  const selectRef = useRef<HTMLDivElement | null>(null);
  const [showSupplierModal, setShowSupplierModal] = useState(false);

  // Auto-focus first field when modal opens
  useEffect(() => {
    if (open && firstInputRef.current) firstInputRef.current.focus();
  }, [open]);

  // Add default product row when modal opens
  useEffect(() => {
    if (open && bulkProducts.length === 0) {
      addProductRow();
    }
  }, [open]);

  // Set today's date when modal opens
  useEffect(() => {
    if (open) {
      const today = new Date().toISOString().split('T')[0];
      if (form.received_at !== today) {
        setForm({ ...form, received_at: today });
      }
    }
  }, [open]);

  // Keyboard support - Escape to close
  useEffect(() => {
    const handleEsc = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && open) onClose();
    };
    window.addEventListener('keydown', handleEsc);
    return () => window.removeEventListener('keydown', handleEsc);
  }, [open, onClose]);

  // Get selected supplier for context display
  const selectedSupplier = form.type === 'cash' 
    ? { name: 'Trade', id: 'trade' } 
    : suppliers.find((s: any) => s.id === form.supplier_id);

  // Enhanced validation with comprehensive field checking
  const validate = () => {
    const errors: any = {};

    // Supplier validation - only required for credit and commission purchases
    if (form.type !== 'cash' && !form.supplier_id) {
      errors.supplier_id = 'Supplier is required for credit and commission purchases.';
    }
    
    if (!bulkProducts || bulkProducts.length === 0) {
      errors.product_id = 'Select at least one product.';
    } else {
      for (const pid of bulkProducts) {
        const item = bulkItems[pid];
        if (!item || !item.product_id) {
          errors[`product_${pid}`] = 'Select a product.';
        }
        if (!item || !item.quantity || isNaN(Number(item.quantity)) || Number(item.quantity) < 1) {
          errors[`quantity_${pid}`] = 'Quantity must be at least 1.';
        }
        
        // Cash purchase validation - requires price and either weight or unit quantity
        if (form.type === 'cash') {
          if (!item || !item.price || isNaN(Number(item.price)) || Number(item.price) <= 0) {
            errors[`price_${pid}`] = 'Price is required and must be greater than 0 for cash purchases.';
          }
          // For cash purchases, we need either weight or unit quantity to calculate total value
          if (!item.weight && !item.quantity) {
            errors[`quantity_${pid}`] = 'Either weight or quantity is required for cash purchases.';
          }
        }
        
        // Credit purchase validation - requires valid supplier and price
        if (form.type === 'credit') {
          if (!form.supplier_id) {
            errors.supplier_id = 'Supplier is required for credit purchases.';
          }
         
        }
      }
    }
    
    if (form.empty_plastic) {
      if (form.plastic_price <= 0 || form.plastic_price === undefined || isNaN(Number(form.plastic_price))) {
        errors.plastic_price = 'Plastic price is required when plastic mortgage is checked.';
      }
      else    if (form.plastic_count <= 0 || form.plastic_count === undefined || isNaN(Number(form.plastic_count))) {
        errors.plastic_count = 'Plastic count is required when plastic mortgage is checked.';
      }
    }
    if (form.empty_plastic) {
   
    }
    
    // Received date validation
    if (!form.received_at) {
      errors.received_at = 'Received date is required.';
    } else {
      const receivedDate = new Date(form.received_at);
      const today = new Date();
      today.setHours(23, 59, 59, 999); // Set to end of today
      if (receivedDate > today) {
        errors.received_at = 'Received date cannot be in the future.';
      }
    }
    
    // Fees validation applies once per batch
    if (form.porterage_fee && (isNaN(Number(form.porterage_fee)) || Number(form.porterage_fee) < 0)) errors.porterage_fee = 'Porterage fee must be a valid positive number.';
    if (form.transfer_fee && (isNaN(Number(form.transfer_fee)) || Number(form.transfer_fee) < 0)) errors.transfer_fee = 'Transfer fee must be a valid positive number.';
    if (form.type === 'commission') {
      if (!form.commission_rate || isNaN(Number(form.commission_rate)) || Number(form.commission_rate) < 0) errors.commission_rate = 'Commission rate must be a valid percentage.';
    }
    return errors;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const errs = validate();
    setErrors(errs);
    if (Object.keys(errs).length > 0) return;

    setLoading(true);
    try {
      // Always use bulk mode now
      const items = bulkProducts.map(pid => {
        const bi = bulkItems[pid];
        return {
          product_id: bi.product_id as string,
          supplier_id: form.type === 'cash' ? 'trade' : form.supplier_id,
          type: form.type,
          quantity: parseInt(bi.quantity),
          received_quantity: parseInt(bi.quantity),
          unit: bi.unit,
          weight: bi.weight ? parseFloat(bi.weight) : undefined,
          price: (form.type === 'cash' || form.type === 'credit') && bi.price ? parseFloat(bi.price) : undefined,
          selling_price: bi.selling_price ? parseFloat(bi.selling_price) : undefined,
          status: form.status || undefined,
        };
      });
      const plasticFee = form.empty_plastic
        ? Number(form.plastic_count || 0) * Number(form.plastic_price || 0)
        : undefined;
        
      await onSuccess({
        mode: 'batch',
        batch: {
          supplier_id: form.type === 'cash' ? 'trade' : form.supplier_id,
          status: form.status || undefined,
          porterage_fee: form.porterage_fee ? parseFloat(form.porterage_fee) : undefined,
          transfer_fee: form.transfer_fee ? parseFloat(form.transfer_fee) : undefined,
          commission_rate: form.type === 'commission' && form.commission_rate ? parseFloat(form.commission_rate) : undefined,
          type: form.type,
          plastic_fee: plasticFee,
          received_at: form.received_at,
          items
        }
      });

      // Reset form after successful submission
      setForm({
        supplier_id: '',
        type: 'commission',
        porterage_fee: '',
        transfer_fee: '',
        commission_rate: '',
        status: '',
        empty_plastic: false,
        plastic_count: '',
        plastic_price: '',
        received_at: new Date().toISOString().split('T')[0] // Today's date in YYYY-MM-DD format
      });
      setBulkProducts([]);
      setBulkItems({});
      setErrors({});
      onClose();
    } catch (e) {
      setErrors({ form: 'Failed to receive inventory.' });
    }
    setLoading(false);
  };

  // Function to add a new product row
  const addProductRow = () => {
    const newProductId = `new_${Date.now()}`;
    setBulkProducts(prev => [...prev, newProductId]);
    setBulkItems(prev => ({
      ...prev,
      [newProductId]: { product_id: '', quantity: '', unit: 'kg', price: '', selling_price: '', weight: '' }
    }));
  };

  // Function to remove a product row
  const removeProductRow = (productId: string) => {
    setBulkProducts(prev => prev.filter(id => id !== productId));
    setBulkItems(prev => {
      const newItems = { ...prev };
      delete newItems[productId];
      return newItems;
    });
  };

  // Handle adding new supplier
  const handleAddSupplier = async (supplierData: any) => {
    if (!addSupplier) {
      console.error('addSupplier function not provided');
      return;
    }

    try {
      await addSupplier(supplierData);
      setShowSupplierModal(false);
      // The parent component should refresh the suppliers list
    } catch (error) {
      console.error('Failed to add supplier:', error);
    }
  };

  if (!open) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
      <div className="bg-white dark:bg-slate-900 rounded-lg max-w-6xl w-full max-h-[90vh] overflow-y-auto shadow-2xl ring-1 ring-black/5 dark:ring-white/10">
        {/* Enhanced Header with Visual Context */}
        <div className="p-6 border-b border-gray-200 dark:border-slate-800 bg-gradient-to-r from-blue-50 to-indigo-50 dark:from-slate-800 dark:to-slate-800">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-2xl font-bold text-gray-900 dark:text-slate-100">Receive Products</h2>
              <p className="text-sm text-gray-600 dark:text-slate-300 mt-1">Add new inventory items to your stock</p>
            </div>
            <button
              onClick={onClose}
              className="p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100 dark:hover:bg-slate-800 rounded-lg transition-colors"
            >
              <X className="w-6 h-6" />
            </button>
          </div>

          {/* Item Context Header */}
          {selectedSupplier && (
            <div className="mt-4 p-4 bg-white dark:bg-slate-900 rounded-lg border border-gray-200 dark:border-slate-800">
              <div className="flex items-center space-x-4">
                <div className="flex items-center space-x-3">
                  <div className="w-2 h-2 bg-gray-400 rounded-full"></div>
                  <div>
                    <p className="font-semibold text-gray-900 dark:text-slate-100">{selectedSupplier.name}</p>
                    <div className="flex flex-wrap gap-2 mt-2">
                      <span className={`px-2 py-1 text-xs rounded-full ${
                        form.type === 'cash' ? 'bg-blue-100 text-blue-800' : 
                        form.type === 'credit' ? 'bg-orange-100 text-orange-800' :
                        'bg-green-100 text-green-800'
                      }`}>
                        {form.type === 'cash' ? 'Cash Purchase' : 
                         form.type === 'credit' ? 'Credit Purchase' : 
                         `Commission: ${form.commission_rate}%`}
                      </span>
                      {form.porterage_fee && (
                        <span className="px-2 py-1 text-xs rounded-full bg-gray-100 text-gray-800">
                          Porterage: ${form.porterage_fee}
                        </span>
                      )}
                      {form.transfer_fee && (
                        <span className="px-2 py-1 text-xs rounded-full bg-gray-100 text-gray-800">
                          Transfer: ${form.transfer_fee}
                        </span>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>

        <form onSubmit={handleSubmit} className="p-6">
          {/* Hidden input for auto-focus */}
          <input
            ref={firstInputRef}
            style={{ position: 'absolute', left: '-9999px', width: 0, height: 0, opacity: 0 }}
            tabIndex={-1}
          />

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
            {/* Left Column - Basic Information */}
            <div className="space-y-6">
              <div>
                <h3 className="text-lg font-semibold text-gray-900 dark:text-slate-100 mb-4 flex items-center">
                  <Package className="w-5 h-5 mr-2 text-blue-600" />
                  Supplier Information
                </h3>

                <div className="space-y-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-slate-300 mb-2">
                      {form.type === 'cash' ? 'Supplier' : 'Supplier *'}
                    </label>
                    {form.type === 'cash' ? (
                      <div className="w-full border border-gray-300 dark:border-slate-700 rounded-lg px-3 py-2 bg-gray-50 dark:bg-slate-800 text-gray-600 dark:text-slate-400">
                        Trade (Cash Purchase)
                      </div>
                    ) : (
                      <SearchableSelect
                        options={suppliers.map((supplier: any) => ({
                          id: supplier.id,
                          label: supplier.name,
                          value: supplier.id,
                        }))}
                        value={form.supplier_id}
                        onChange={(value: any) => setForm({ ...form, supplier_id: value })}
                        placeholder="Select Supplier *"
                        searchPlaceholder="Search suppliers..."
                        categories={['Commission', 'Credit']}
                        recentSelections={recentSuppliers}
                        onRecentUpdate={setRecentSuppliers}
                        showAddOption={true}
                        addOptionText="Add New Supplier"
                        onAddNew={() => setShowSupplierModal(true)}
                        className={`w-full ${errors.supplier_id ? 'border-red-500 ring-red-500' : 'border-gray-300'}`}
                        portal={true}
                      />
                    )}
                    {errors.supplier_id && <p className="text-xs text-red-600 mt-1">{errors.supplier_id}</p>}
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-slate-300 mb-2">Supply Type *</label>
                    <select
                      value={form.type}
                      onChange={(e) => setForm({ ...form, type: e.target.value })}
                      className="w-full border border-gray-300 dark:border-slate-700 rounded-lg px-3 py-2 focus:ring-blue-500 focus:border-blue-500 dark:bg-slate-800 dark:text-slate-100"
                    >
                      <option value="commission">Commission</option>
                      <option value="cash">Cash Purchase</option>
                      <option value="credit">Credit Purchase</option>
                    </select>
                  </div>
                </div>
              </div>
            </div>

            {/* Middle Column - Financial Information */}
            <div className="space-y-6">
              <div>
                <h3 className="text-lg font-semibold text-gray-900 dark:text-slate-100 mb-4 flex items-center">
                  <Eye className="w-5 h-5 mr-2 text-purple-600" />
                  Financial Information
                </h3>

                <div className="space-y-4">
                  {form.type === 'commission' && (
                    <div>
                      <label className="block text-sm font-medium text-gray-700 dark:text-slate-300 mb-2">Commission Rate (%) *</label>
                      <input
                        type="number"
                        step="0.1"
                        min="0"
                        max="100"
                        value={form.commission_rate}
                        onChange={(e) => setForm({ ...form, commission_rate: e.target.value })}
                        className={`w-full border ${errors.commission_rate ? 'border-red-500 ring-red-500' : 'border-gray-300 dark:border-slate-700'} rounded-lg px-3 py-2 focus:ring-blue-500 focus:border-blue-500 dark:bg-slate-800 dark:text-slate-100`}
                        placeholder={`Default: ${defaultCommissionRate}%`}
                      />
                      {errors.commission_rate && <p className="text-xs text-red-600 mt-1">{errors.commission_rate}</p>}
                    </div>
                  )}

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 dark:text-slate-300 mb-2">Porterage Fee (optional)</label>
                      <input
                        type="number"
                        step="0.01"
                        min="0"
                        value={form.porterage_fee}
                        onChange={(e) => setForm({ ...form, porterage_fee: e.target.value })}
                        className={`w-full border ${errors.porterage_fee ? 'border-red-500 ring-red-500' : 'border-gray-300 dark:border-slate-700'} rounded-lg px-3 py-2 focus:ring-blue-500 focus:border-blue-500 dark:bg-slate-800 dark:text-slate-100`}
                        placeholder="porterage fee"
                      />
                      {errors.porterage_fee && <p className="text-xs text-red-600 mt-1">{errors.porterage_fee}</p>}
                    </div>

                    <div>
                      <label className="block text-sm font-medium text-gray-700 dark:text-slate-300 mb-2">Transfer Fee (optional)</label>
                      <input
                        type="number"
                        step="0.01"
                        min="0"
                        value={form.transfer_fee}
                        onChange={(e) => setForm({ ...form, transfer_fee: e.target.value })}
                        className={`w-full border ${errors.transfer_fee ? 'border-red-500 ring-red-500' : 'border-gray-300 dark:border-slate-700'} rounded-lg px-3 py-2 focus:ring-blue-500 focus:border-blue-500 dark:bg-slate-800 dark:text-slate-100`}
                        placeholder="transfer fee"
                      />
                      {errors.transfer_fee && <p className="text-xs text-red-600 mt-1">{errors.transfer_fee}</p>}
                    </div>
                  </div>
                  {form.type === 'commission' && (
                  <div className="space-y-3 mt-10">
                    {/* Checkbox + label */}
                    <label className="flex items-center space-x-2 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={!!form.empty_plastic}
                        onChange={(e) => {
                          const isChecked = e.target.checked;
                          setForm({
                            ...form,
                            empty_plastic: isChecked,
                            plastic_count: isChecked ? form.plastic_count : '',
                            plastic_price: isChecked ? form.plastic_price : ''
                          });
                        }}
                        className="w-4 h-4 rounded border-gray-300 text-green-600 focus:ring-green-500"
                      />
                      <span className="text-sm font-medium text-gray-700">Plastic Mortgage {!form.empty_plastic ? '(optional)' : ''}</span>
                    </label>

                    {/* Inputs appear when checked */}
                    {form.empty_plastic && (
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div>
                          <label className="block text-sm font-medium text-gray-700 dark:text-slate-300 mb-1">Plastic Number *</label>
                          <input
                            type="number"
                            min="0"
                            value={form.plastic_count}
                            onChange={(e) => {
                              setForm({ ...form, plastic_count: e.target.value });
                            }}
                            placeholder="number of plastics"
                            className={`w-full border ${errors.plastic_count ? 'border-red-500 ring-red-500' : 'border-gray-300 dark:border-slate-700'} rounded-lg px-3 py-2 focus:ring-blue-500 focus:border-blue-500 dark:bg-slate-800 dark:text-slate-100`}
                          />
                          {errors.plastic_count && (
                            <p className="text-xs text-red-600 mt-1">{errors.plastic_count}</p>
                          )}
                        </div>
                        <div>
                          <label className="block text-sm font-medium text-gray-700 dark:text-slate-300 mb-1">Plastic Price *</label>
                          <input
                            type="number"
                            min="0"
                            value={form.plastic_price}
                            onChange={(e) => {
                              setForm({ ...form, plastic_price: e.target.value });
                            }}
                            placeholder="price of plastics"
                            className={`w-full border ${errors.plastic_price ? 'border-red-500 ring-red-500' : 'border-gray-300 dark:border-slate-700'} rounded-lg px-3 py-2 focus:ring-blue-500 focus:border-blue-500 dark:bg-slate-800 dark:text-slate-100`}
                          />
                          {errors.plastic_price && (
                            <p className="text-xs text-red-600 mt-1">{errors.plastic_price}</p>
                          )}
                        </div>
                      </div>
                    )}
                  </div>
                  )}
                </div>
              </div>
            </div>

            {/* Right Column - Additional Information */}
            <div className="space-y-6">
              <div>
                <h3 className="text-lg font-semibold text-gray-900 dark:text-slate-100 mb-4 flex items-center">
                  <Upload className="w-5 h-5 mr-2 text-orange-600" />
                  Additional Information
                </h3>

                <div className="space-y-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-slate-300 mb-2">Received Date *</label>
                    <input
                      type="date"
                      value={form.received_at}
                      onChange={(e) => setForm({ ...form, received_at: e.target.value })}
                      className={`w-full border ${errors.received_at ? 'border-red-500 ring-red-500' : 'border-gray-300 dark:border-slate-700'} rounded-lg px-3 py-2 focus:ring-blue-500 focus:border-blue-500 dark:bg-slate-800 dark:text-slate-100`}
                    />
                    {errors.received_at && <p className="text-xs text-red-600 mt-1">{errors.received_at}</p>}
                  </div>
                  
                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-slate-300 mb-2">Notes (optional)</label>
                    <textarea
                      value={form.status}
                      onChange={(e) => setForm({ ...form, status: e.target.value })}
                      className="w-full border border-gray-300 dark:border-slate-700 rounded-lg px-3 py-2 focus:ring-blue-500 focus:border-blue-500 dark:bg-slate-800 dark:text-slate-100"
                      rows={4}
                      placeholder="Add any additional status or comments..."
                    />
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Error Display */}
          {errors.form && (
            <div className="mt-6 p-4 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg">
              <p className="text-sm text-red-600">{errors.form}</p>
            </div>
          )}

          <div className="space-y-6">
            <div>
              <h3 className="text-lg font-semibold text-gray-900 mb-4 mt-4 flex items-center justify-between">
                <div className="flex items-center">
                  <Truck className="w-5 h-5 mr-2 text-green-600" />
                  Products
                </div>
              </h3>

              <div className="bg-gray-50 dark:bg-slate-800 rounded-lg p-4 border border-gray-200 dark:border-slate-700">
                <div className="border border-gray-200 dark:border-slate-700 rounded-lg scrollbar-thin scrollbar-thumb-gray-300 scrollbar-track-gray-100 dark:scrollbar-thumb-slate-700 dark:scrollbar-track-slate-800">
                  <table className="w-full">
                    <thead className="sticky top-0 bg-gray-50 dark:bg-slate-800 z-10 shadow-sm">
                      <tr className="border-b border-gray-200">
                        <th className="text-left text-xs font-medium text-gray-500 dark:text-slate-300 uppercase py-3 px-2">Product</th>
                        <th className="text-left text-xs font-medium text-gray-500 dark:text-slate-300 uppercase py-3 px-2">Qty</th>
                        <th className="text-left text-xs font-medium text-gray-500 dark:text-slate-300 uppercase py-3 px-2">Unit</th>
                        <th className="text-left text-xs font-medium text-gray-500 dark:text-slate-300 uppercase py-3 px-2">Weight</th>

                        {form.type !== 'commission' && (
                          <th className="text-left text-xs font-medium text-gray-500 dark:text-slate-300 uppercase py-3 px-2">Price</th>
                        )}
                        <th className="text-left text-xs font-medium text-gray-500 dark:text-slate-300 uppercase py-3 px-2">Selling Price</th>
                        <th className="text-left text-xs font-medium text-gray-500 dark:text-slate-300 uppercase py-3 px-2">Actions</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-200">
                      {bulkProducts.map((productId) => {
                        const item = bulkItems[productId] || { product_id: '', quantity: '', unit: 'kg', price: '', selling_price: '', weight: '' };
                        const product = products.find((p: any) => p.id === item.product_id);
                        const productName = product?.name || '';
                        
                        return (
                          <tr key={productId} className="hover:bg-gray-50 transition-colors duration-150">
                            <td className="py-3 px-2">
                              <div ref={selectRef}>
                                <SearchableSelect
                                  options={products.map((product: any) => ({
                                    id: product.id,
                                    label: product.name,
                                    value: product.id,
                                    category: product.category
                                  }))}
                                  value={item.product_id || ''}
                                  onChange={(value: any) => {
                                    const selectedId = value as string;
                                    setBulkItems(prev => ({
                                      ...prev,
                                      [productId]: { ...item, product_id: selectedId, unit: 'kg' }
                                    }));
                                  }}
                                  placeholder="Select Product *"
                                  searchPlaceholder="Search products..."
                                  categories={['Fruits', 'Vegetables']}
                                  showAddOption={true}
                                  addOptionText="Add New Product"
                                  className="w-full min-w-[200px]"
                                  portal={false}
                                  onOpenChange={(open: boolean) => {
                                    if (open && selectRef.current) {
                                      selectRef.current.scrollIntoView({ behavior: "smooth", block: "center" });
                                    }
                                  }}
                                />
                              </div>
                              {errors[`product_${productId}`] && (
                                <p className="text-xs text-red-600 mt-1">{errors[`product_${productId}`]}</p>
                              )}
                            </td>
                            <td className="py-3 px-2">
                              <input
                                type="number"
                                value={item.quantity}
                                onChange={(e) => setBulkItems(prev => ({
                                  ...prev,
                                  [productId]: { ...item, quantity: e.target.value }
                                }))}
                                className={`w-20 border ${errors[`quantity_${productId}`] ? 'border-red-500 ring-red-500' : 'border-gray-300 dark:border-slate-700'} rounded px-2 py-1 text-sm focus:ring-blue-500 focus:border-blue-500 dark:bg-slate-800 dark:text-slate-100`}
                                min="1"
                                step="0.01"
                                placeholder="Qty"
                              />
                              {errors[`quantity_${productId}`] && (
                                <p className="text-xs text-red-600 mt-1">{errors[`quantity_${productId}`]}</p>
                              )}
                            </td>
                            <td className="py-3 px-2">
                              <select
                                value={item.unit}
                                onChange={(e) => setBulkItems(prev => ({
                                  ...prev,
                                  [productId]: { ...item, unit: e.target.value as any }
                                }))}
                                className="w-24 border border-gray-300 dark:border-slate-700 rounded px-2 py-1 text-sm focus:ring-blue-500 focus:border-blue-500 dark:bg-slate-800 dark:text-slate-100"
                              >
                                <option value="kg">kg</option>
                                <option value="piece">piece</option>
                                <option value="box">box</option>
                                <option value="bag">bag</option>
                                <option value="bundle">bundle</option>
                                <option value="dozen">dozen</option>
                              </select>
                            </td>
                            <td className="py-3 px-2">
                              <input
                                type="number"
                                step="0.01"
                                min="0"
                                disabled={productName.toLowerCase() === 'plastic'}
                                value={item.weight || ''}
                                onChange={(e) => setBulkItems(prev => ({
                                  ...prev,
                                  [productId]: { ...item, weight: e.target.value }
                                }))}
                                className="w-20 border border-gray-300 dark:border-slate-700 rounded px-2 py-1 text-sm focus:ring-blue-500 focus:border-blue-500 dark:bg-slate-800 dark:text-slate-100"
                                placeholder="kg"
                              />
                            </td>
                            {form.type !== 'commission' && (
                              <td className="py-3 px-2">
                                <input
                                  type="number"
                                  value={item.price || ''}
                                  onChange={(e) => setBulkItems(prev => ({
                                    ...prev,
                                    [productId]: { ...item, price: e.target.value }
                                  }))}
                                  className={`w-24 border ${errors[`price_${productId}`] ? 'border-red-500 ring-red-500' : 'border-gray-300 dark:border-slate-700'} rounded px-2 py-1 text-sm focus:ring-blue-500 focus:border-blue-500 dark:bg-slate-800 dark:text-slate-100`}
                                  min="0"
                                  step="0.01"
                                  placeholder="Price"
                                />
                                {errors[`price_${productId}`] && (
                                  <p className="text-xs text-red-600 mt-1">{errors[`price_${productId}`]}</p>
                                )}
                              </td>
                            )}
                            <td className="py-3 px-2">
                              <input
                                type="number"
                                value={item.selling_price || ''}
                                onChange={(e) => setBulkItems(prev => ({
                                  ...prev,
                                  [productId]: { ...item, selling_price: e.target.value }
                                }))}
                                className={`w-24 border ${errors[`selling_price_${productId}`] ? 'border-red-500 ring-red-500' : 'border-gray-300 dark:border-slate-700'} rounded px-2 py-1 text-sm focus:ring-blue-500 focus:border-blue-500 dark:bg-slate-800 dark:text-slate-100`}
                                min="0"
                                step="0.01"
                                placeholder="Sell Price"
                                
                              />
                              {errors[`selling_price_${productId}`] && (
                                <p className="text-xs text-red-600 mt-1">{errors[`selling_price_${productId}`]}</p>
                              )}
                            </td>
                          
                            <td className="py-3 px-2 flex items-center gap-2 mt-2">
                              {(bulkProducts.length > 1 || !bulkProducts[0]) ? (
                                <button
                                  type="button"
                                  onClick={() => removeProductRow(productId)}
                                  className="text-red-600 hover:text-red-800 p-1 rounded hover:bg-red-50 transition-colors"
                                  title="Remove product"
                                >
                                  <X className="w-4 h-4" />
                                </button>
                              ) : (
                                <div></div>
                              )}
                              <button
                                type="button"
                                onClick={addProductRow}
                                className="border-green-600 text-black text-sm rounded-lg transition-colors flex items-center"
                              >
                                <Plus className="w-5 h-5" />
                              </button>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          </div>

          {/* Action Buttons */}
          <div className="flex justify-end space-x-3 pt-6 border-t border-gray-200 dark:border-slate-800">
            <button
              type="button"
              onClick={onClose}
              className="px-6 py-2 text-gray-700 dark:text-slate-200 border border-gray-300 dark:border-slate-700 rounded-lg hover:bg-gray-50 dark:hover:bg-slate-800 transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors flex items-center"
              disabled={loading}
            >
              {loading ? (
                <>
                  <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin mr-2"></div>
                  Receiving...
                </>
              ) : (
                <>
                  <Truck className="w-4 h-4 mr-2" />
                  Receive Products
                </>
              )}
            </button>
          </div>
        </form>
      </div>

      {/* Supplier Form Modal */}
      {addSupplier && (
        <SupplierFormModal
          open={showSupplierModal}
          onClose={() => setShowSupplierModal(false)}
          onSuccess={handleAddSupplier}
          existingSuppliers={suppliers}
        />
      )}
    </div>
  );
};

export default ReceiveFormModal;

