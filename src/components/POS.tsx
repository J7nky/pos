import React, { useState } from 'react';
import { useOfflineData } from '../contexts/OfflineDataContext';
import { useSupabaseAuth } from '../contexts/SupabaseAuthContext';
import { useCurrency } from '../hooks/useCurrency';
import SearchableSelect from './common/SearchableSelect';
import MoneyInput from './common/MoneyInput';
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
import { SaleItem, Customer } from '../types';
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
  const products = (raw.products || []).map(p => ({...p, createdAt: p.created_at})) as Array<any>;
  const customers = (raw.customers || []).map(c => ({...c, isActive: c.is_active, createdAt: c.created_at, lb_balance: c.lb_balance, usd_balance: c.usd_balance})) as Array<any>;
  const suppliers = (raw.suppliers || []).map(s => ({...s,createdAt: s.created_at})) as Array<any>;
  const stockLevels = (raw.stockLevels || []) as Array<any>;
  const inventory = (raw.inventory || []) as Array<any>;
  const addSale = raw.addSale;
  const addCustomer = raw.addCustomer;

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
      id: uuidv4(),
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
    const updatedTabs = activeTabs.map(tab => {
      if (tab.id === activeTabId) {
        let updatedTab = { ...tab, ...updates };
        // If payment method is being updated, also update all cart items
        if (updates.paymentMethod && updatedTab.cart) {
          updatedTab.cart = updatedTab.cart.map(item => ({
            ...item,
            paymentMethod: updates.paymentMethod
          }));
        }
        return updatedTab;
      }
      return tab;
    });
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
  
    product.name.toLowerCase().includes(searchTerm.toLowerCase()) &&
    getProductStock(product.id) > 0
  );

  const getProductWeight = (productId: string, supplierId: string) => {
    // In wholesale, products are received by quantity but sold by weight
    // Weight is entered at point of sale, not from inventory
    return null;
  };

  const getProductInventoryItems = (productId: string) => {
    // Get all individual inventory items for this product
    const productInventoryItems = inventory
      .filter(item => item.product_id === productId && item.quantity > 0)
      .sort((a, b) => new Date(a.received_at || a.created_at).getTime() - new Date(b.received_at || b.created_at).getTime());
    
    return productInventoryItems.map(inventoryItem => {
      const supplier = suppliers.find(s => s.id === inventoryItem.supplier_id);
      return {
        inventoryItemId: inventoryItem.id,
        supplierId: inventoryItem.supplier_id,
        supplierName: supplier?.name || 'Unknown Supplier',
        quantity: inventoryItem.quantity,
        receivedQuantity: inventoryItem.received_quantity,
        price: inventoryItem.price || 0,
        type: inventoryItem.type || 'cash',
        receivedAt: inventoryItem.received_at || inventoryItem.created_at
      };
    });
  };

  // In addToCart, add specific inventory item to cart
  const addToCart = (productId: string, inventoryItemId: string) => {
    const product = products.find(p => p.id === productId);
    const inventoryItem = inventory.find(item => item.id === inventoryItemId);
    if (!product || !inventoryItem) return;
    
    const supplier = suppliers.find(s => s.id === inventoryItem.supplier_id);
    if (!supplier) return;
    
    // Check if we already have this specific inventory item in the cart
    const existingItem = activeTab.cart.find(item => 
      item.inventoryItemId === inventoryItemId
    );
    
    if (existingItem) {
      // If this specific inventory item is already in cart, increase quantity
      if (existingItem.quantity < inventoryItem.quantity) {
        const updatedCart = activeTab.cart.map(item =>
          item.inventoryItemId === inventoryItemId
            ? { ...item, quantity: item.quantity + 1, totalPrice: (item.quantity + 1) * item.unitPrice }
            : item
        );
        updateActiveTab({ cart: updatedCart });
      }
    } else {
      // Add new item with this specific inventory item
      const newItem: SaleItem = {
        id: uuidv4(),
        productId,
        productName: product.name,
        supplierId: inventoryItem.supplier_id,
        supplierName: supplier.name,
        quantity: 1,
        weight: undefined, // Weight will be entered manually during sale
        unitPrice: inventoryItem.price || 0.00, // Use price from this specific inventory item
        totalPrice: Math.round((inventoryItem.price || 0.00) * 100) / 100,
        paymentMethod: activeTab.paymentMethod, // Set payment method from current tab
        notes: '',
        inventoryType: inventoryItem.type || 'cash', // Track the inventory type
        inventoryItemId: inventoryItem.id // Use the specific inventory item ID
      };
      updateActiveTab({ cart: [...activeTab.cart, newItem] });
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
            // Get the specific inventory item to check its available quantity
            const inventoryItem = inventory.find(inv => inv.id === item.inventoryItemId);
            const availableStock = inventoryItem ? inventoryItem.quantity : 0;
            if (availableStock > 0 && numValue > availableStock) {
              updatedItem.quantity = availableStock;
            } else {
              updatedItem.quantity = numValue;
            }
          }
        }
        if (field === 'quantity' || field === 'unitPrice' || field === 'weight') {
          if (updatedItem.weight && updatedItem.weight > 0) {
            updatedItem.totalPrice = Math.round(updatedItem.weight * updatedItem.unitPrice * 100) / 100;
          } else {
            updatedItem.totalPrice = Math.round(updatedItem.quantity * updatedItem.unitPrice * 100) / 100;
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

  const subtotal = activeTab.cart.reduce((sum, item) => sum + (item.totalPrice ?? 0), 0);
  const total = Math.round(subtotal * 100) / 100; // Fix floating point precision
  const change = activeTab.amountReceived ? Math.round((parseFloat(activeTab.amountReceived) - total) * 100) / 100 : 0;

  // Make handleCheckout async, add isProcessing state, and disable Complete Sale button while processing
  const handleCheckout = async () => {
    if (activeTab.cart.length === 0) return;
    // Check for non-priced items
    // if (hasNonPriced) {
    //   if (!activeTab.selectedCustomer) {
    //     setCustomerError('Customer is required for non-priced items.');
    //     return;
    //   }
    //   setCustomerError(null);
    //   setIsProcessing(true);
    //   try {
    //     // Store each non-priced item for later pricing
    //     for (const item of activeTab.cart.filter(i => !i.unitPrice || i.unitPrice === 0)) {
    //       await addNonPricedItem({
    //         id: uuidv4(),
    //         customerId: activeTab.selectedCustomer,
    //         productId: item.productId,
    //         productName: item.productName,
    //         supplierId: item.supplierId,
    //         supplierName: item.supplierName,
    //         quantity: item.quantity,
    //         weight: item.weight,
    //         notes: item.notes,
    //         inventoryItemId: item.inventoryItemId, // Add the specific inventory item ID
    //         createdAt: new Date().toISOString(),
    //         status: 'non-priced',
    //       });
    //     }
    //     // Remove non-priced items from cart and proceed with regular sale if any
    //     const pricedCart = activeTab.cart.filter(i => i.unitPrice && i.unitPrice > 0);
    //     if (pricedCart.length > 0) {
    //       updateActiveTab({ cart: pricedCart });
    //       showToast('success', 'Non-priced items stored. Please complete sale for priced items.');
    //     } else {
    //       // All items were non-priced, clear cart
    //       updateActiveTab({ cart: [], selectedCustomer: '', amountReceived: '', notes: '', paymentMethod: 'cash' });
    //       showToast('success', 'Non-priced items stored for later pricing.');
    //     }
    //   } catch (error) {
    //     showToast('error', 'Failed to store non-priced items!');
    //   }
    //   setIsProcessing(false);
    //   return;
    // }
  
  
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
      await addSale(
        activeTab.cart.map(item => ({
          id: uuidv4(),
          inventory_item_id: item.inventoryItemId || '',
          product_id: item.productId,
          supplier_id: item.supplierId,
          type: item.inventoryType || 'cash',
          quantity: item.quantity,
          unit: 'piece',
          weight: item.weight || null,
          porterage: null,
          unit_price: item.unitPrice,
          received_value: item.totalPrice || 0,
          payment_method: item.paymentMethod || activeTab.paymentMethod,
          notes: item.notes || null,
          store_id: raw.storeId,
          customer_id: activeTab.selectedCustomer || null,
          created_at: new Date().toISOString(),
          created_by: userProfile?.id || '',
          received_quantity: item.quantity,
          transfer_fee: 0,
          price: item.unitPrice,
          commission_rate: 0,
          received_at: new Date().toISOString(),
          received_by: userProfile?.id || ''
        }))
      );
      
      await raw.refreshData(); // Ensure UI is in sync with backend
      
      // Trigger immediate sync after sale completion for critical data
      raw.debouncedSync?.();
      
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
        lb_balance: 0,
        usd_balance: 0,
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
                    value={customerForm.email  ||''}
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
            getProductInventoryItems={getProductInventoryItems} 
            addToCart={addToCart} 
          />
        </div>

        {/* Cart and Checkout */}
        <div className="space-y-6">
          {/* Cart */}
          <Cart 
            activeTab={activeTab} 
            updateCartItem={updateCartItem} 
            removeFromCart={removeFromCart} 
            formatCurrency={formatCurrency} 
            inventory={inventory}
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
                    <MoneyInput
                      label="Amount Received"
                      value={activeTab.amountReceived}
                      onChange={(value) => updateActiveTab({ amountReceived: value })}
                      placeholder="0.00"
                      step="0.01"
                      min="0"
                      autoCompleteValue={total}
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

const ProductGrid = ({ filteredProducts, getProductStock, getProductInventoryItems, addToCart }: any) => (
  <div className="bg-white rounded-lg shadow-sm p-6">
    <h2 className="text-lg font-semibold text-gray-900 mb-4">Products</h2>
    <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
      {(filteredProducts || []).map((product: any) => {
        const stock = getProductStock(product.id);
        const productInventoryItems = getProductInventoryItems(product.id) || [];
        return (
          <div key={product.id} className="border border-gray-200 rounded-lg p-3">
            <img src={product.image} alt={product.name} className="w-full h-24 object-cover rounded-lg mb-2" />
            <h3 className="font-medium text-gray-900 text-sm">{product.name}</h3>
            <p className={`text-xs mb-2 ${stock < 5 ? 'text-red-600 font-bold' : 'text-gray-500'}`}>Stock: {stock}</p>
            {productInventoryItems.length > 0 ? (
              <div className="space-y-1">
                {productInventoryItems.map((inventoryItem: any) => (
                  <button
                    key={inventoryItem.inventoryItemId}
                    onClick={() => addToCart(product.id, inventoryItem.inventoryItemId)}
                    className="w-full bg-blue-50 hover:bg-blue-100 text-blue-700 text-xs py-1 px-2 rounded transition-colors"
                    disabled={inventoryItem.quantity === 0}
                  >
                    <div className="text-left">
                      <div>{inventoryItem.supplierName} ({inventoryItem.quantity})</div>
                      {inventoryItem.price > 0 && (
                        <div className="text-xs text-gray-600">${inventoryItem.price.toFixed(2)}</div>
                      )}
                      <div className="text-xs text-gray-500">
                        {"Recieved Quantity: " + inventoryItem.receivedQuantity}
                      </div>
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

const Cart = ({ activeTab, updateCartItem, removeFromCart, formatCurrency, inventory }: any) => (
  <div className="bg-white rounded-lg shadow-sm">
    <div className="p-4 border-b flex items-center">
      <ShoppingCart className="w-5 h-5 mr-2 text-gray-600" />
      <h2 className="text-lg font-semibold text-gray-900">Cart ({(activeTab?.cart || []).length})</h2>
    </div>
    <div className="max-h-64 overflow-y-auto">
      {(activeTab?.cart || []).length > 0 ? (
        <div className="divide-y divide-gray-200">
          {(activeTab?.cart || []).map((item: any) => {
            // Get the specific inventory item for this cart item
            const inventoryItem = inventory.find((inv: any) => inv.id === item.inventoryItemId);
            const availableStock = inventoryItem ? inventoryItem.quantity : 0;
            
            return (
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
                      max={availableStock}
                      value={item.quantity ?? ''}
                      onChange={(e) => {
                        const value = e.target.value;
                        if (value === '') {
                          updateCartItem(item.id, 'quantity', 1);
                        } else {
                          const numValue = parseInt(value);
                          if (!isNaN(numValue)) {
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
                      min="0"
                      value={item.unitPrice ?? ''}
                      onChange={(e) => updateCartItem(item.id, 'unitPrice', parseFloat(e.target.value) || 0)}
                      className="w-full border border-gray-300 rounded px-2 py-1 text-sm"
                      placeholder="0.00"
                    />
                  </div>
                </div>
                <div className="mt-2 text-right">
                  <span className="font-medium text-gray-900">{formatCurrency(item.totalPrice)}</span>
                  {item.weight && <div className="text-xs text-blue-600">{item.weight} kg</div>}
                </div>
              </div>
            );
          })}
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