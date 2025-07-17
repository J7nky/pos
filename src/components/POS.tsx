import React, { useState } from 'react';
import { useData } from '../contexts/DataContext';
import { useAuth } from '../contexts/AuthContext';
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
import { SaleItem, Sale } from '../types';

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
  const { products, suppliers, customers, stockLevels, inventory, addSale } = useData();
  const { user } = useAuth();
  const { formatCurrency } = useCurrency();
  const [recentCustomers, setRecentCustomers] = useLocalStorage<string[]>('pos_recent_customers', []);
  const [activeTabs, setActiveTabs] = useLocalStorage<BillTab[]>('pos_active_tabs', []);
  const [activeTabId, setActiveTabId] = useLocalStorage<string>('pos_active_tab_id', '');
  const [searchTerm, setSearchTerm] = useState('');
  const [showAddCustomerForm, setShowAddCustomerForm] = useState(false);

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

  const getProductStock = (productId: string) => {
    const stock = stockLevels.find(s => s.productId === productId);
    return stock ? stock.currentStock : 0;
  };

  const filteredProducts = products.filter(product => 
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
    const stock = stockLevels.find(s => s.productId === productId);
    return stock ? stock.suppliers : [];
  };

  const addToCart = (productId: string, supplierId: string) => {
    const product = products.find(p => p.id === productId);
    const supplier = suppliers.find(s => s.id === supplierId);
    
    if (!product || !supplier) return;

    const existingItem = activeTab.cart.find(item => 
      item.productId === productId && item.supplierId === supplierId
    );

    if (existingItem) {
      const updatedCart = activeTab.cart.map(item =>
        item.productId === productId && item.supplierId === supplierId
          ? { ...item, quantity: item.quantity + 1, totalPrice: (item.quantity + 1) * item.unitPrice }
          : item
      );
      updateActiveTab({ cart: updatedCart });
    } else {
      const newItem: SaleItem = {
        id: Date.now().toString(),
        productId,
        productName: product.name,
        supplierId,
        supplierName: supplier.name,
        quantity: 1,
        weight: undefined, // Weight will be entered manually during sale
        unitPrice: 5.00, // Default price - would be configurable
        totalPrice: 5.00,
        notes: ''
      };
      updateActiveTab({ cart: [...activeTab.cart, newItem] });
    }
  };

  const updateCartItem = (itemId: string, field: keyof SaleItem, value: any) => {
    const updatedCart = activeTab.cart.map(item => {
      if (item.id === itemId) {
        const updatedItem = { ...item, [field]: value };
        if (field === 'quantity' || field === 'unitPrice' || field === 'weight') {
          // Calculate total price: if weight is provided, use weight * unitPrice, otherwise use quantity * unitPrice
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

  const handleCheckout = () => {
    if (activeTab.cart.length === 0) return;

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
      createdBy: user?.id || ''
    };

    addSale(sale);
    
    // Clear current tab or close it if multiple tabs exist
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

    alert('Sale completed successfully!');
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
              />
            </div>
          </div>

          {/* Products Grid */}
          <div className="bg-white rounded-lg shadow-sm p-6">
            <h2 className="text-lg font-semibold text-gray-900 mb-4">Products</h2>
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
              {filteredProducts.map(product => {
                const stock = getProductStock(product.id);
                const productSuppliers = getProductSuppliers(product.id);
                
                return (
                  <div key={product.id} className="border border-gray-200 rounded-lg p-3">
                    <img
                      src={product.image}
                      alt={product.name}
                      className="w-full h-24 object-cover rounded-lg mb-2"
                    />
                    <h3 className="font-medium text-gray-900 text-sm">{product.name}</h3>
                    <p className="text-xs text-gray-500 mb-2">Stock: {stock}</p>
                    
                    {productSuppliers.length > 0 ? (
                      <div className="space-y-1">
                        {productSuppliers.map(supplier => {
                          const weight = getProductWeight(product.id, supplier.supplierId);
                          return (
                            <button
                              key={supplier.supplierId}
                              onClick={() => addToCart(product.id, supplier.supplierId)}
                              className="w-full bg-blue-50 hover:bg-blue-100 text-blue-700 text-xs py-1 px-2 rounded transition-colors"
                              disabled={supplier.quantity === 0}
                            >
                              <div className="text-left">
                                <div>{supplier.supplierName} ({supplier.quantity})</div>
                              </div>
                            </button>
                          );
                        })}
                      </div>
                    ) : (
                      <button
                        disabled
                        className="w-full bg-gray-100 text-gray-400 text-xs py-1 px-2 rounded"
                      >
                        Out of Stock
                      </button>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        {/* Cart and Checkout */}
        <div className="space-y-6">
          {/* Customer Selection */}
          <div className="bg-white rounded-lg shadow-sm p-4">
            <SearchableSelect
              options={customers.filter(c => c.isActive).map(customer => ({
                id: customer.id,
                label: customer.name,
                value: customer.id,
                category: 'Customer'
              }))}
              value={activeTab.selectedCustomer}
              onChange={(value) => updateActiveTab({ selectedCustomer: value as string })}
              placeholder="Walk-in Customer"
              searchPlaceholder="Search customers..."
              recentSelections={recentCustomers}
              onRecentUpdate={setRecentCustomers}
              showAddOption={true}
              addOptionText="Add New Customer"
              onAddNew={() => setShowAddCustomerForm(true)}
              className="w-full"
            />
          </div>

          {/* Cart */}
          <div className="bg-white rounded-lg shadow-sm">
            <div className="p-4 border-b flex items-center">
              <ShoppingCart className="w-5 h-5 mr-2 text-gray-600" />
              <h2 className="text-lg font-semibold text-gray-900">Cart ({activeTab.cart.length})</h2>
            </div>
            
            <div className="max-h-64 overflow-y-auto">
              {activeTab.cart.length > 0 ? (
                <div className="divide-y divide-gray-200">
                  {activeTab.cart.map(item => (
                    <div key={item.id} className="p-4">
                      <div className="flex items-start justify-between mb-2">
                        <div className="flex-1">
                          <h4 className="font-medium text-gray-900 text-sm">{item.productName}</h4>
                          <p className="text-xs text-gray-500">{item.supplierName}</p>
                        </div>
                        <button
                          onClick={() => removeFromCart(item.id)}
                          className="text-red-500 hover:text-red-700 p-1"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                      
                      <div className="grid grid-cols-3 gap-2">
                        <div>
                          <label className="text-xs text-gray-500">Qty</label>
                          <input
                            type="number"
                            min="1"
                            value={item.quantity}
                            onChange={(e) => updateCartItem(item.id, 'quantity', parseInt(e.target.value))}
                            className="w-full border border-gray-300 rounded px-2 py-1 text-sm"
                          />
                        </div>
                        <div>
                          <label className="text-xs text-gray-500">Weight</label>
                          <input
                            type="number"
                            step="0.01"
                            value={item.weight || ''}
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
                            value={item.unitPrice}
                            onChange={(e) => updateCartItem(item.id, 'unitPrice', parseFloat(e.target.value))}
                            className="w-full border border-gray-300 rounded px-2 py-1 text-sm"
                          />
                        </div>
                      </div>
                      
                      <div className="mt-2 text-right">
                        <span className="font-medium text-gray-900">{formatCurrency(item.totalPrice)}</span>
                        {item.weight && (
                          <div className="text-xs text-blue-600">
                            {item.weight} kg
                          </div>
                        )}
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
                disabled={activeTab.cart.length === 0 || (activeTab.paymentMethod !== 'credit' && !activeTab.amountReceived)}
                className="w-full bg-green-600 text-white py-3 rounded-lg hover:bg-green-700 disabled:bg-gray-300 disabled:cursor-not-allowed font-medium"
              >
                Complete Sale
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}