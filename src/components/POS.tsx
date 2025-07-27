import React, { useState } from 'react';
import { useOfflineData } from '../contexts/OfflineDataContext';
import { useSupabaseAuth } from '../contexts/SupabaseAuthContext';
import { useCurrency } from '../hooks/useCurrency';
import SearchableSelect from './common/SearchableSelect';
import { useLocalStorage } from '../hooks/useLocalStorage';
import { 
  Plus, 
  Minus, 
  Search, 
  ShoppingCart, 
  CreditCard, 
  DollarSign,
  User,
  Trash2,
  X,
  PlusCircle
} from 'lucide-react';
import { SaleItem, Sale, Customer } from '../types';
import { v4 as uuidv4 } from 'uuid';

interface BillTab {
  id: string;
  name: string;
  cart: SaleItem[];
  selectedCustomer: string;
  paymentMethod: 'cash' | 'card' | 'credit';
  amountReceived: string;
  notes: string;
  createdAt: string;
}

export default function POS() {
  const raw = useOfflineData();
  const products = (raw.products || []).map(p => ({...p, isActive: p.is_active, createdAt: p.created_at})) as Array<any>;
  const customers = (raw.customers || []).map(c => ({...c, isActive: c.is_active, createdAt: c.created_at, currentDebt: c.current_debt})) as Array<any>;
  const suppliers = (raw.suppliers || []).map(s => ({...s, isActive: s.is_active, createdAt: s.created_at})) as Array<any>;
  const stockLevels = (raw.stockLevels || []) as Array<any>;
  const inventory = (raw.inventory || []) as Array<any>;
  const addSale = raw.addSale;
  const addCustomer = raw.addCustomer;
  const addNonPricedItem = raw.addNonPricedItem || (async (item: any) => { /* fallback: store in localStorage or show error */ });
  const { userProfile } = useSupabaseAuth();
  const { formatCurrency } = useCurrency();
  const [recentCustomers, setRecentCustomers] = useLocalStorage<string[]>('pos_recent_customers', []);
  const [activeTabs, setActiveTabs] = useLocalStorage<BillTab[]>('pos_active_tabs', []);
  const [activeTabId, setActiveTabId] = useLocalStorage<string>('pos_active_tab_id', '');
  const [searchTerm, setSearchTerm] = useState('');
  const [showAddCustomerForm, setShowAddCustomerForm] = useState(false);
  // Add customer form state
  const [customerForm, setCustomerForm] = useState<Partial<Customer>>({
    name: '',
    phone: '',
    email: '',
    address: '',
    isActive: true,
  });
  const [isAddingCustomer, setIsAddingCustomer] = useState(false);
  // Add isProcessing state for async checkout
  const [isProcessing, setIsProcessing] = useState(false);
  // Add toast state
  const [toast, setToast] = useState<{ type: 'success' | 'error'; message: string } | null>(null);
  // Add customer validation state
  const [customerError, setCustomerError] = useState<string | null>(null);
  const [customerFormError, setCustomerFormError] = useState<string | null>(null);
  const showToast = (type: 'success' | 'error', message: string) => {
    setToast({ type, message });
    setTimeout(() => setToast(null), 3000);
  };
  // Ref for search input
  const searchInputRef = React.useRef<HTMLInputElement>(null);
  React.useEffect(() => {
    if (searchInputRef.current) searchInputRef.current.focus();
  }, []);

  // Initialize with first tab if no tabs exist
  React.useEffect(() => {
    if (activeTabs.length === 0) {
      createNewTab();
    }
  }, []);

  const createNewTab = () => {
    const newTab: BillTab = {
      id: Date.now().toString(),
      name: `Bill ${activeTabs.length + 1}`,
      cart: [],
      selectedCustomer: '',
      paymentMethod: 'cash',
      amountReceived: '',
      notes: '',
      createdAt: new Date().toISOString()
    };
    const updatedTabs = [...activeTabs, newTab];
    setActiveTabs(updatedTabs);
    setActiveTabId(newTab.id);
  };

  const closeTab = (tabId: string) => {
    const updatedTabs = activeTabs.filter(tab => tab.id !== tabId);
    setActiveTabs(updatedTabs);
    
    if (activeTabId === tabId) {
      if (updatedTabs.length > 0) {
        setActiveTabId(updatedTabs[0].id);
      } else {
        createNewTab();
      }
    }
  };

  const updateActiveTab = (updates: Partial<BillTab>) => {
    const updatedTabs = activeTabs.map(tab =>
      tab.id === activeTabId ? { ...tab, ...updates } : tab
    );
    setActiveTabs(updatedTabs);
  };

  const activeTab = activeTabs.find(tab => tab.id === activeTabId);
  if (!activeTab) return null;

  // Get all inventory items for a product-supplier combination
  const getInventoryItems = (productId: string, supplierId: string) => {
    return inventory.filter(item => 
      item.product_id === productId && 
      item.supplier_id === supplierId && 
      item.quantity > 0
    );
  };

  // Get total available stock for a product-supplier combination
  const getSupplierStock = (productId: string, supplierId: string) => {
    const items = getInventoryItems(productId, supplierId);
    return items.reduce((total, item) => total + item.quantity, 0);
  };

  // Get total stock for a product across all suppliers
  const getProductStock = (productId: string) => {
    const items = inventory.filter(item => 
      item.product_id === productId && 
      item.quantity > 0
    );
    return items.reduce((total, item) => total + item.quantity, 0);
  };

  const filteredProducts = (products || []).filter(product => 
    product.isActive && 
    product.name.toLowerCase().includes(searchTerm.toLowerCase()) &&
    getProductStock(product.id) > 0
  );

  const getProductWeight = (productId: string, supplierId: string) => {
    // In wholesale, products are received by quantity but sold by weight
    // Weight is entered at point of sale, not from inventory
    return null;
  };

  const getProductSuppliers = (productId: string) => {
    // Get unique suppliers for this product from inventory
    const supplierIds = [...new Set(
      inventory
        .filter(item => item.product_id === productId && item.quantity > 0)
        .map(item => item.supplier_id)
    )];
    
    return supplierIds.map(supplierId => {
      const supplier = suppliers.find(s => s.id === supplierId);
      const totalStock = getSupplierStock(productId, supplierId);
      return {
        supplierId,
        supplierName: supplier?.name || 'Unknown Supplier',
        quantity: totalStock
      };
    });
  };

  // In addToCart, only allow up to available stock
  const addToCart = (productId: string, supplierId: string) => {
    const product = products.find(p => p.id === productId);
    const supplier = suppliers.find(s => s.id === supplierId);
    if (!product || !supplier) return;
    
    const existingItem = activeTab.cart.find(item => 
      item.productId === productId && item.supplierId === supplierId
    );
    const availableStock = getSupplierStock(productId, supplierId);
    const currentQty = existingItem ? existingItem.quantity : 0;
    
    if (currentQty >= availableStock) return; // Prevent adding more than available
    
    if (existingItem) {
      const updatedCart = activeTab.cart.map(item =>
        item.productId === productId && item.supplierId === supplierId && item.quantity < availableStock
          ? { ...item, quantity: item.quantity + 1, totalPrice: (item.quantity + 1) * item.unitPrice }
          : item
      );
      updateActiveTab({ cart: updatedCart });
    } else {
      if (availableStock > 0) {
        // Get the oldest inventory item for this product-supplier to determine type and price
        const oldestInventoryItem = inventory
          .filter(item => item.product_id === productId && item.supplier_id === supplierId && item.quantity > 0)
          .sort((a, b) => new Date(a.received_at || a.created_at).getTime() - new Date(b.received_at || b.created_at).getTime())[0];
        
        const newItem: SaleItem = {
          id: Date.now().toString(),
          productId,
          productName: product.name,
          supplierId,
          supplierName: supplier.name,
          quantity: 1,
          weight: undefined, // Weight will be entered manually during sale
          unitPrice: oldestInventoryItem?.price || 0.00, // Use price from oldest inventory item
          totalPrice: oldestInventoryItem?.price || 0.00,
          notes: '',
          inventoryType: oldestInventoryItem?.type || 'cash' // Track the inventory type
        };
        updateActiveTab({ cart: [...activeTab.cart, newItem] });
      }
    }
  };

  // In updateCartItem, prevent increasing quantity beyond available stock
  const updateCartItem = (itemId: string, field: keyof SaleItem, value: any) => {
    const updatedCart = activeTab.cart.map(item => {
      if (item.id === itemId) {
        let updatedItem = { ...item, [field]: value };
        if (field === 'quantity') {
          // Ensure quantity is a valid number
          const numValue = typeof value === 'number' ? value : parseInt(value);
          if (isNaN(numValue) || numValue < 1) {
            updatedItem.quantity = 1;
          } else {
            // For non-priced items, we might want to be more lenient with stock limits
            // but still enforce basic constraints
            const availableStock = getSupplierStock(item.productId, item.supplierId);
            if (availableStock > 0 && numValue > availableStock) {
              updatedItem.quantity = availableStock;
            } else {
              updatedItem.quantity = numValue;
            }
          }
        }
        if (field === 'quantity' || field === 'unitPrice' || field === 'weight') {
          if (updatedItem.weight && updatedItem.weight > 0) {
            updatedItem.totalPrice = updatedItem.weight * updatedItem.unitPrice;
          } else {
            updatedItem.totalPrice = updatedItem.quantity * updatedItem.unitPrice;
          }
        }
        return updatedItem;
      }
      return item;
    });
    updateActiveTab({ cart: updatedCart });
  };

  const removeFromCart = (itemId: string) => {
    const updatedCart = activeTab.cart.filter(item => item.id !== itemId);
    updateActiveTab({ cart: updatedCart });
  };

  const subtotal = activeTab.cart.reduce((sum, item) => sum + item.totalPrice, 0);
  const total = subtotal;
  const change = activeTab.amountReceived ? parseFloat(activeTab.amountReceived) - total : 0;

  // Make handleCheckout async, add isProcessing state, and disable Complete Sale button while processing
  const handleCheckout = async () => {
    if (activeTab.cart.length === 0) return;
    // Check for non-priced items
    const hasNonPriced = activeTab.cart.some(item => !item.unitPrice || item.unitPrice === 0);
    if (hasNonPriced) {
      if (!activeTab.selectedCustomer) {
        setCustomerError('Customer is required for non-priced items.');
        return;
      }
      setCustomerError(null);
      setIsProcessing(true);
      try {
        // Store each non-priced item for later pricing
        for (const item of activeTab.cart.filter(i => !i.unitPrice || i.unitPrice === 0)) {
          await addNonPricedItem({
            id: uuidv4(),
            customerId: activeTab.selectedCustomer,
            productId: item.productId,
            productName: item.productName,
            supplierId: item.supplierId,
            supplierName: item.supplierName,
            quantity: item.quantity,
            weight: item.weight,
            notes: item.notes,
            createdAt: new Date().toISOString(),
            status: 'non-priced',
          });
        }
        // Remove non-priced items from cart and proceed with regular sale if any
        const pricedCart = activeTab.cart.filter(i => i.unitPrice && i.unitPrice > 0);
        if (pricedCart.length > 0) {
          updateActiveTab({ cart: pricedCart });
          showToast('success', 'Non-priced items stored. Please complete sale for priced items.');
        } else {
          // All items were non-priced, clear cart
          updateActiveTab({ cart: [], selectedCustomer: '', amountReceived: '', notes: '', paymentMethod: 'cash' });
          showToast('success', 'Non-priced items stored for later pricing.');
        }
      } catch (error) {
        showToast('error', 'Failed to store non-priced items!');
      }
      setIsProcessing(false);
      return;
    }
    // Validation: if credit, require customer; if not credit and amountReceived < total, require customer
    if (
      (activeTab.paymentMethod === 'credit' && !activeTab.selectedCustomer) ||
      (activeTab.paymentMethod !== 'credit' && parseFloat(activeTab.amountReceived || '0') < total && !activeTab.selectedCustomer)
    ) {
      setCustomerError('Customer is required for credit sales or when amount received is less than total.');
      return;
    }
    setCustomerError(null);
    setIsProcessing(true);
    try {
      // Auto open cash drawer if not open
      if (!raw.cashDrawer || raw.cashDrawer.status !== 'open') {
        let openingAmount = 0;
        if (activeTab.paymentMethod === 'cash') {
          openingAmount = parseFloat(activeTab.amountReceived) || total;
        }
        if (userProfile?.id) {
          await raw.openCashDrawer(openingAmount, userProfile.id);
        }
      }
      const customer = customers.find(c => c.id === activeTab.selectedCustomer);
      const amountPaid = activeTab.paymentMethod === 'credit' ? 0 : parseFloat(activeTab.amountReceived) || total;
      const sale: Omit<Sale, 'id' | 'createdAt'> = {
        customerId: activeTab.selectedCustomer || undefined,
        items: activeTab.cart,
        subtotal,
        total,
        paymentMethod: activeTab.paymentMethod,
        amountPaid,
        amountDue: total - amountPaid,
        status: activeTab.paymentMethod === 'credit' ? 'pending' : 'completed',
        notes: activeTab.notes || undefined,
        createdBy: userProfile?.id || ''
      };
      // Deduct inventory quantities before creating the sale
      for (const item of activeTab.cart) {
        await raw.deductInventoryQuantity(item.productId, item.supplierId, item.quantity);
      }

      await addSale(
        {
          customer_id: sale.customerId,
          subtotal: sale.subtotal,
          total: sale.total,
          payment_method: sale.paymentMethod,
          amount_paid: sale.amountPaid,
          amount_due: sale.amountDue,
          status: sale.status,
          notes: sale.notes,
          created_by: sale.createdBy,
        },
        activeTab.cart.map(item => ({
          product_id: item.productId,
          product_name: item.productName,
          supplier_id: item.supplierId,
          supplier_name: item.supplierName,
          quantity: item.quantity,
          weight: item.weight,
          unit_price: item.unitPrice,
          total_price: item.totalPrice,
          notes: item.notes,
          store_id: raw.storeId,
          created_at: new Date().toISOString(),
          created_by: userProfile?.id || '',
        }))
      );
      await raw.refreshData(); // Ensure UI is in sync with backend
      if (activeTabs.length > 1) {
        closeTab(activeTabId);
      } else {
        updateActiveTab({
          cart: [],
          selectedCustomer: '',
          amountReceived: '',
          notes: '',
          paymentMethod: 'cash'
        });
      }
      showToast('success', 'Sale completed successfully!');
    } catch (error) {
      showToast('error', 'Sale failed!');
    }
    setIsProcessing(false);
  };

  // Add customer form handlers
  const handleCustomerFormChange = (e: React.ChangeEvent<HTMLInputElement>) => {
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
  const handleCustomerFormSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!customerForm.name || !customerForm.phone) {
      setCustomerFormError('Name and Phone are required.');
      return;
    }
    // Check for duplicate customer (case-insensitive, trimmed)
    const exists = customers.some(c => c.name.trim().toLowerCase() === customerForm.name!.trim().toLowerCase() && c.phone.trim() === customerForm.phone!.trim());
    if (exists) {
      setCustomerFormError('This customer already exists.');
      return;
    }
    setCustomerFormError(null);
    setIsAddingCustomer(true);
    try {
      await addCustomer({
        name: customerForm.name,
        phone: customerForm.phone,
        email: customerForm.email || '',
        address: customerForm.address || '',
        is_active: customerForm.isActive ?? true,
        current_debt: 0,
      });
      await raw.refreshData();
      // Find the new customer by name and phone (best effort)
      const newCustomer = raw.customers.find(
        c => c.name === customerForm.name && c.phone === customerForm.phone
      );
      if (newCustomer) {
        updateActiveTab({ selectedCustomer: newCustomer.id });
      }
      setShowAddCustomerForm(false);
      setCustomerForm({ name: '', phone: '', email: '', address: '', isActive: true });
    } catch (error) {
      setCustomerFormError('Failed to add customer.');
    }
    setIsAddingCustomer(false);
  };

  return (
    <div className="p-6">
      <h1 className="text-3xl font-bold text-gray-900 mb-6">Point of Sale</h1>

      {/* Bill Tabs */}
      <div className="mb-6">
        <div className="flex items-center space-x-2 border-b border-gray-200">
          {activeTabs.map((tab) => (
            <div
              key={tab.id}
              className={`flex items-center px-4 py-2 border-t border-l border-r rounded-t-lg cursor-pointer ${
                tab.id === activeTabId
                  ? 'bg-white border-gray-300 border-b-white -mb-px'
                  : 'bg-gray-100 border-gray-200 hover:bg-gray-50'
              }`}
              onClick={() => setActiveTabId(tab.id)}
            >
              <span className="mr-2">{tab.name}</span>
              {tab.cart.length > 0 && (
                <span className="bg-blue-500 text-white text-xs rounded-full px-2 py-1 mr-2">
                  {tab.cart.length}
                </span>
              )}
              {activeTabs.length > 1 && (
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    closeTab(tab.id);
                  }}
                  className="text-gray-400 hover:text-gray-600"
                >
                  <X className="w-4 h-4" />
                </button>
              )}
            </div>
          ))}
          <button
            onClick={createNewTab}
            className="flex items-center px-3 py-2 text-blue-600 hover:text-blue-800 hover:bg-blue-50 rounded-lg transition-colors"
          >
            <PlusCircle className="w-4 h-4 mr-1" />
            New Bill
          </button>
        </div>
      </div>

      {/* Add spinner overlay for isProcessing or loading.products */}
      {(isProcessing || raw.loading.products) && (
        <div className="fixed inset-0 bg-black bg-opacity-20 flex items-center justify-center z-50">
          <div className="w-16 h-16 border-4 border-blue-500 border-t-transparent rounded-full animate-spin"></div>
        </div>
      )}

      {/* Add Customer Modal */}
      {showAddCustomerForm && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-lg max-w-2xl w-full max-h-[90vh] overflow-y-auto">
            <div className="p-6 border-b">
              <h2 className="text-xl font-semibold text-gray-900">Add New Customer</h2>
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
                  onClick={() => setShowAddCustomerForm(false)}
                  className="px-4 py-2 text-gray-700 border border-gray-300 rounded-lg hover:bg-gray-50"
                  disabled={isAddingCustomer}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
                  disabled={isAddingCustomer}
                >
                  {isAddingCustomer ? 'Adding...' : 'Add Customer'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Add toast display at top right */}
      {toast && (
        <div className={`fixed top-4 right-4 px-4 py-2 rounded shadow-lg z-50 text-white ${toast.type === 'success' ? 'bg-green-600' : 'bg-red-600'}`}>{toast.message}</div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Product Selection */}
        <div className="lg:col-span-2 space-y-6">
          {/* Search */}
          <div className="bg-white p-4 rounded-lg shadow-sm">
            <div className="relative">
              <Search className="w-5 h-5 absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400" />
              <input
                type="text"
                placeholder="Search products..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-blue-500 focus:border-blue-500"
                ref={searchInputRef}
              />
            </div>
          </div>

          {/* Products Grid */}
          <ProductGrid 
            filteredProducts={filteredProducts} 
            getProductStock={getProductStock} 
            getProductSuppliers={getProductSuppliers} 
            addToCart={addToCart} 
            getSupplierStock={getSupplierStock} 
          />
        </div>

        {/* Cart and Checkout */}
        <div className="space-y-6">
          {/* Cart */}
          <Cart 
            activeTab={activeTab} 
            updateCartItem={updateCartItem} 
            removeFromCart={removeFromCart} 
            getSupplierStock={getSupplierStock} 
            formatCurrency={formatCurrency} 
          />

          {/* Totals and Payment */}
          {activeTab.cart.length > 0 && (
            <div className="bg-white rounded-lg shadow-sm p-4 space-y-4">
              <div className="space-y-2">
                <div className="flex justify-between text-sm">
                  <span>Subtotal:</span>
                  <span>{formatCurrency(subtotal)}</span>
                </div>
                <div className="flex justify-between font-semibold border-t pt-2">
                  <span>Total:</span>
                  <span>{formatCurrency(total)}</span>
                </div>
              </div>

              {/* Customer Selection (moved here) */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Customer Name {(activeTab.paymentMethod === 'credit' || ((activeTab.paymentMethod === 'cash' || activeTab.paymentMethod === 'card') && parseFloat(activeTab.amountReceived || '0') < total)) ? <span className="text-red-500">*</span> : null}
                </label>
                <SearchableSelect
                  options={
                    activeTab.paymentMethod === 'credit'
                      ? customers.filter(c => c.isActive).map(customer => ({
                          id: customer.id,
                          label: customer.name,
                          value: customer.id,
                          category: 'Customer'
                        }))
                      : [
                          { id: '', label: 'Walk-in Customer', value: '', category: 'Customer' },
                          ...customers.filter(c => c.isActive).map(customer => ({
                            id: customer.id,
                            label: customer.name,
                            value: customer.id,
                            category: 'Customer'
                          }))
                        ]
                  }
                  value={activeTab.selectedCustomer}
                  onChange={(value) => {
                    updateActiveTab({ selectedCustomer: value as string });
                    setCustomerError(null);
                  }}
                  placeholder={activeTab.paymentMethod === 'credit' ? 'Select Customer' : 'Walk-in Customer'}
                  searchPlaceholder="Search customers..."
                  recentSelections={recentCustomers}
                  onRecentUpdate={setRecentCustomers}
                  showAddOption={true}
                  addOptionText="Add New Customer"
                  onAddNew={() => setShowAddCustomerForm(true)}
                  className={`w-full ${customerError ? 'border border-red-500' : ''}`}
                />
                {customerError && (
                  <p className="text-xs text-red-600 mt-1">{customerError}</p>
                )}
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Payment Method
                </label>
                <div className="grid grid-cols-3 gap-2">
                  <button
                    onClick={() => updateActiveTab({ paymentMethod: 'cash' })}
                    className={`p-2 text-xs rounded-lg border ${
                      activeTab.paymentMethod === 'cash' 
                        ? 'bg-blue-50 border-blue-500 text-blue-700' 
                        : 'bg-gray-50 border-gray-300'
                    }`}
                  >
                    <DollarSign className="w-4 h-4 mx-auto mb-1" />
                    Cash
                  </button>
                  {/*
                  <button
                    onClick={() => updateActiveTab({ paymentMethod: 'card' })}
                    className={`p-2 text-xs rounded-lg border ${
                      activeTab.paymentMethod === 'card' 
                        ? 'bg-blue-50 border-blue-500 text-blue-700' 
                        : 'bg-gray-50 border-gray-300'
                    }`}
                  >
                    <CreditCard className="w-4 h-4 mx-auto mb-1" />
                    Card
                  </button>
                  */}
                  <button
                    onClick={() => updateActiveTab({ paymentMethod: 'credit' })}
                    className={`p-2 text-xs rounded-lg border ${
                      activeTab.paymentMethod === 'credit' 
                        ? 'bg-blue-50 border-blue-500 text-blue-700' 
                        : 'bg-gray-50 border-gray-300'
                    }`}
                  >
                    <User className="w-4 h-4 mx-auto mb-1" />
                    Credit
                  </button>
                </div>
              </div>

              {activeTab.paymentMethod !== 'credit' && (
                // Only show Amount Received for cash or card
                (activeTab.paymentMethod === 'cash' || activeTab.paymentMethod === 'card') && (
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Amount Received
                    </label>
                    <input
                      type="number"
                      step="0.01"
                      value={activeTab.amountReceived}
                      onChange={(e) => updateActiveTab({ amountReceived: e.target.value })}
                      className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:ring-blue-500 focus:border-blue-500"
                      placeholder="0.00"
                    />
                    {change > 0 && (
                      <p className="text-sm text-green-600 mt-1">
                        Change: {formatCurrency(change)}
                      </p>
                    )}
                  </div>
                )
              )}

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Notes (Optional)
                </label>
                <textarea
                  value={activeTab.notes}
                  onChange={(e) => updateActiveTab({ notes: e.target.value })}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:ring-blue-500 focus:border-blue-500"
                  rows={2}
                  placeholder="Add notes..."
                />
              </div>

              <button
                onClick={handleCheckout}
                disabled={
                  isProcessing ||
                  activeTab.cart.length === 0 ||
                  (activeTab.paymentMethod !== 'credit' && !activeTab.amountReceived) ||
                  ((activeTab.paymentMethod === 'credit' && !activeTab.selectedCustomer) ||
                  (activeTab.paymentMethod !== 'credit' && parseFloat(activeTab.amountReceived || '0') < total && !activeTab.selectedCustomer))
                }
                className="w-full bg-green-600 text-white py-3 rounded-lg hover:bg-green-700 disabled:bg-gray-300 disabled:cursor-not-allowed font-medium"
              >
                {isProcessing ? 'Processing...' : 'Complete Sale'}
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

const ProductGrid = ({ filteredProducts, getProductStock, getProductSuppliers, addToCart, getSupplierStock }: any) => (
  <div className="bg-white rounded-lg shadow-sm p-6">
    <h2 className="text-lg font-semibold text-gray-900 mb-4">Products</h2>
    <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
      {(filteredProducts || []).map((product: any) => {
        const stock = getProductStock(product.id);
        const productSuppliers = getProductSuppliers(product.id) || [];
        return (
          <div key={product.id} className="border border-gray-200 rounded-lg p-3">
            <img src={product.image} alt={product.name} className="w-full h-24 object-cover rounded-lg mb-2" />
            <h3 className="font-medium text-gray-900 text-sm">{product.name}</h3>
            <p className={`text-xs mb-2 ${stock < 5 ? 'text-red-600 font-bold' : 'text-gray-500'}`}>Stock: {stock}</p>
            {productSuppliers.length > 0 ? (
              <div className="space-y-1">
                {productSuppliers.map((supplier: any) => (
                  <button
                    key={supplier.supplierId}
                    onClick={() => addToCart(product.id, supplier.supplierId)}
                    className="w-full bg-blue-50 hover:bg-blue-100 text-blue-700 text-xs py-1 px-2 rounded transition-colors"
                    disabled={getSupplierStock(product.id, supplier.supplierId) === 0}
                  >
                    <div className="text-left">
                      <div>{supplier.supplierName} ({getSupplierStock(product.id, supplier.supplierId)})</div>
                    </div>
                  </button>
                ))}
              </div>
            ) : (
              <button disabled className="w-full bg-gray-100 text-gray-400 text-xs py-1 px-2 rounded">Out of Stock</button>
            )}
          </div>
        );
      })}
    </div>
  </div>
);

const Cart = ({ activeTab, updateCartItem, removeFromCart, getSupplierStock, formatCurrency }: any) => (
  <div className="bg-white rounded-lg shadow-sm">
    <div className="p-4 border-b flex items-center">
      <ShoppingCart className="w-5 h-5 mr-2 text-gray-600" />
      <h2 className="text-lg font-semibold text-gray-900">Cart ({(activeTab?.cart || []).length})</h2>
    </div>
    <div className="max-h-64 overflow-y-auto">
      {(activeTab?.cart || []).length > 0 ? (
        <div className="divide-y divide-gray-200">
          {(activeTab?.cart || []).map((item: any) => (
            <div key={item.id} className="p-4">
              <div className="flex items-start justify-between mb-2">
                <div className="flex-1">
                  <h4 className="font-medium text-gray-900 text-sm">{item.productName}</h4>
                  <p className="text-xs text-gray-500">{item.supplierName}</p>
                </div>
                <button onClick={() => removeFromCart(item.id)} className="text-red-500 hover:text-red-700 p-1">
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
              <div className="grid grid-cols-3 gap-2">
                <div>
                  <label className="text-xs text-gray-500">Qty</label>
                  <input
                    type="number"
                    min="1"
                    max={getSupplierStock(item.productId, item.supplierId)}
                    value={item.quantity ?? ''}
                    onChange={(e) => {
                      const value = e.target.value;
                      if (value === '') {
                        updateCartItem(item.id, 'quantity', 1);
                      } else {
                        const numValue = parseInt(value);
                        if (!isNaN(numValue)) {
                          const availableStock = getSupplierStock(item.productId, item.supplierId);
                          const clampedValue = Math.max(1, Math.min(availableStock, numValue));
                          updateCartItem(item.id, 'quantity', clampedValue);
                        }
                      }
                    }}
                    className="w-full border border-gray-300 rounded px-2 py-1 text-sm"
                  />
                </div>
                <div>
                  <label className="text-xs text-gray-500">Weight</label>
                  <input
                    type="number"
                    step="0.01"
                    value={item.weight ?? ''}
                    onChange={(e) => updateCartItem(item.id, 'weight', e.target.value ? parseFloat(e.target.value) : undefined)}
                    className="w-full border border-gray-300 rounded px-2 py-1 text-sm"
                    placeholder="kg"
                  />
                </div>
                <div>
                  <label className="text-xs text-gray-500">Price</label>
                  <input
                    type="number"
                    step="0.01"
                    value={item.unitPrice ?? ''}
                    onChange={(e) => updateCartItem(item.id, 'unitPrice', parseFloat(e.target.value))}
                    className="w-full border border-gray-300 rounded px-2 py-1 text-sm"
                  />
                </div>
              </div>
              <div className="mt-2 text-right">
                <span className="font-medium text-gray-900">{formatCurrency(item.totalPrice)}</span>
                {item.weight && <div className="text-xs text-blue-600">{item.weight} kg</div>}
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="p-8 text-center text-gray-500">
          <ShoppingCart className="w-12 h-12 mx-auto mb-4 text-gray-300" />
          <p>Cart is empty</p>
        </div>
      )}
    </div>
  </div>
);