import React, { useState } from 'react';
import { usePOSKeyboard } from '../hooks/usePOSKeyboard';
import { useFocusManagement } from '../hooks/useFocusManagement';
import AccessibleModal from './common/AccessibleModal';
import AccessibleButton from './common/AccessibleButton';
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
  PlusCircle,
  Package
} from 'lucide-react';
import { SaleItem, Customer } from '../types';
import { v4 as uuidv4 } from 'uuid';
import { useI18n } from '../i18n';
import { cashDrawerUpdateService } from '../services/cashDrawerUpdateService';

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
  
  // Refs for keyboard navigation
  const searchInputRef = React.useRef<HTMLInputElement>(null);
  const customerSelectRef = React.useRef<HTMLDivElement>(null);
  const amountInputRef = React.useRef<HTMLInputElement>(null);
  const completeSaleRef = React.useRef<HTMLButtonElement>(null);
  
  const products = (raw.products || []).map(p => ({...p, createdAt: p.created_at})) as Array<any>;
  const customers = (raw.customers || []).map(c => ({...c, isActive: c.is_active, createdAt: c.created_at, lb_balance: c.lb_balance, usd_balance: c.usd_balance})) as Array<any>;
  const suppliers = (raw.suppliers || []).map(s => ({...s,createdAt: s.created_at})) as Array<any>;
  const stockLevels = (raw.stockLevels || []) as Array<any>;
  const inventory = (raw.inventory || []) as Array<any>;
  const addSale = raw.addSale;
  const addCustomer = raw.addCustomer;

  const { userProfile } = useSupabaseAuth();
  const { formatCurrency } = useCurrency();
  const { t } = useI18n();
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
  
  // Define createNewTab function before it's used
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

  // Keyboard shortcuts for POS
  usePOSKeyboard({
    onNewBill: createNewTab,
    onCompleteSale: () => {
      if (!isProcessing && activeTab.cart.length > 0) {
        handleCheckout();
      }
    },
    onClearCart: () => {
      if (activeTab.cart.length > 0) {
        updateActiveTab({ cart: [] });
      }
    },
    onFocusSearch: () => searchInputRef.current?.focus(),
    onFocusCustomer: () => customerSelectRef.current?.focus(),
    onFocusAmount: () => amountInputRef.current?.focus(),
    onQuickCash: () => updateActiveTab({ paymentMethod: 'cash' }),
    onQuickCredit: () => updateActiveTab({ paymentMethod: 'credit' })
  });

  // Auto-focus search input on component mount
  React.useEffect(() => {
    const timer = setTimeout(() => {
      if (searchInputRef.current) {
        searchInputRef.current.focus();
      }
    }, 100);
    return () => clearTimeout(timer);
  }, []);

  // Initialize with first tab if no tabs exist
  React.useEffect(() => {
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

    if (activeTabs.length === 0) {
      createNewTab();
    }
  }, []);

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

  // Get total available stock for a product across all suppliers (subtract reservations across all tabs)
  const getProductStock = (productId: string) => {
    const items = inventory.filter(item => item.product_id === productId && item.quantity > 0);
    const totalStock = items.reduce((total, item) => total + (item.quantity || 0), 0);
    const reservedAcrossTabs = activeTabs.reduce((sum, tab) => {
      return (
        sum + tab.cart
          .filter(ci => {
            const inv = inventory.find(inv => inv.id === ci.inventoryItemId);
            return inv && inv.product_id === productId;
          })
          .reduce((s, ci) => s + (ci.quantity || 0), 0)
      );
    }, 0);
    return Math.max(0, totalStock - reservedAcrossTabs);
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
    
    // Helper: reserved qty for a specific inventory item across ALL open tabs
    const getReservedForInventoryItem = (inventoryItemId: string) => {
      return activeTabs.reduce((sum, tab) => {
        return (
          sum + tab.cart
            .filter(ci => ci.inventoryItemId === inventoryItemId)
            .reduce((s, ci) => s + (ci.quantity || 0), 0)
        );
      }, 0);
    };

    return productInventoryItems.map(inventoryItem => {
      const supplier = suppliers.find(s => s.id === inventoryItem.supplier_id);
      const reserved = getReservedForInventoryItem(inventoryItem.id);
      const available = Math.max(0, (inventoryItem.quantity || 0) - reserved);
      return {
        inventoryItemId: inventoryItem.id,
        supplierId: inventoryItem.supplier_id,
        supplierName: supplier?.name || 'Unknown Supplier',
        // Reflect temporary reservations in the UI
        quantity: available,
        receivedQuantity: inventoryItem.received_quantity,
        price: inventoryItem.price || 0,
        type: inventoryItem.type || 'cash',
        receivedAt: inventoryItem.received_at || inventoryItem.created_at
      };
    });
  };

  // In addToCart, add specific inventory item to cart respecting temporary reservations across all tabs
  const addToCart = (productId: string, inventoryItemId: string) => {
    const product = products.find(p => p.id === productId);
    const inventoryItem = inventory.find(item => item.id === inventoryItemId);
    if (!product || !inventoryItem) return;
    
    const supplier = suppliers.find(s => s.id === inventoryItem.supplier_id);
    if (!supplier) return;
    
    // Compute available considering what's already reserved across all tabs for this inventory item
    const reserved = activeTabs.reduce((sum, tab) => {
      return (
        sum + tab.cart
          .filter(ci => ci.inventoryItemId === inventoryItemId)
          .reduce((s, ci) => s + (ci.quantity || 0), 0)
      );
    }, 0);
    const available = Math.max(0, (inventoryItem.quantity || 0) - reserved);

    // Check if we already have this specific inventory item in the cart
    const existingItem = activeTab.cart.find(item => 
      item.inventoryItemId === inventoryItemId
    );
    
    if (existingItem) {
      // If this specific inventory item is already in cart, increase quantity if available
      if (available > 0) {
        const updatedCart = activeTab.cart.map(item =>
          item.inventoryItemId === inventoryItemId
            ? { ...item, quantity: item.quantity + 1, totalPrice: Math.round(((item.quantity + 1) * item.unitPrice) * 100) / 100 }
            : item
        );
        updateActiveTab({ cart: updatedCart });
      }
    } else {
      // Add new item with this specific inventory item if at least one is available
      if (available <= 0) return;
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
        notes: inventoryItem.notes || null,
        inventoryType: inventoryItem.type || 'cash', // Track the inventory type
        inventoryItemId: inventoryItem.id // Use the specific inventory item ID
      };
      updateActiveTab({ cart: [...activeTab.cart, newItem] });
    }
  };

  // In updateCartItem, prevent increasing quantity beyond available stock (considering other cart reservations across all tabs)
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
            // Get available stock for this inventory item minus reservations by other cart lines across ALL tabs
            const inventoryItem = inventory.find(inv => inv.id === item.inventoryItemId);
            const baseStock = inventoryItem ? (inventoryItem.quantity || 0) : 0;
            const reservedByOthers = activeTabs.reduce((sum, tab) => {
              return (
                sum + tab.cart
                  .filter(ci => ci.inventoryItemId === item.inventoryItemId && ci.id !== item.id)
                  .reduce((s, ci) => s + (ci.quantity || 0), 0)
              );
            }, 0);
            const availableStock = Math.max(0, baseStock - reservedByOthers);
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

  const total = activeTab.cart.reduce((sum, item) => sum + (item.totalPrice ?? 0), 0);

  const change = activeTab.amountReceived ? Math.round((parseFloat(activeTab.amountReceived) - total) * 100) / 100 : 0;

  // Validation helpers
  const isWalkInCustomer = activeTab.selectedCustomer === 'Walk-in Customer'; // Empty string represents Walk-in Customer
  const hasZeroPricedItem = activeTab.cart.some(i => (i.unitPrice ?? 0) === 0);

  // Make handleCheckout async, add isProcessing state, and disable Complete Sale button while processing
  const handleCheckout = async () => {
    if (activeTab.cart.length === 0) return;
    // Disallow completing sale if walk-in customer and any item has zero price
    if (!activeTab.selectedCustomer && activeTab.cart.some(i => (i.unitPrice ?? 0) === 0)) {
      setCustomerError('Please set a price or select a customer. Walk-in sales cannot include zero-priced items.');
      return;
    }
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
    console.log(activeTab.paymentMethod, activeTab.amountReceived, total);
    if (
      (activeTab.paymentMethod === 'credit' && !activeTab.selectedCustomer) ||  
      (activeTab.paymentMethod !== 'credit' && parseFloat(activeTab.amountReceived) < total && !activeTab.selectedCustomer)
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

      // Create comprehensive bill record for accounting integration
      const billData = {
        store_id: raw.storeId,
        bill_number: `BILL-${Date.now()}`,
        customer_id: activeTab.selectedCustomer || null,
        customer_name: activeTab.selectedCustomer ? 
          customers.find(c => c.id === activeTab.selectedCustomer)?.name || null : null,
        subtotal: total,
        total_amount: total,
        payment_method: activeTab.paymentMethod,
        payment_status: activeTab.paymentMethod === 'credit' || parseFloat(activeTab.amountReceived || '0') < total ? 'partial' : 'paid',
        amount_paid: parseFloat(activeTab.amountReceived || '0'),
        amount_due: Math.max(0, total - parseFloat(activeTab.amountReceived || '0')),
        bill_date: new Date().toISOString(),
        notes: activeTab.notes || null,
        created_by: userProfile?.id || ''
        ,_synced:false
      };

      // Create bill line items data
      const lineItemsData = activeTab.cart.map((item, i) => {
        const supplier = suppliers.find(s => s.id === item.supplierId);
        const product = products.find(p => p.id === item.productId);
        
        return {
          store_id: raw.storeId,
          product_id: item.productId,
          product_name: product?.name || item.productName,
          supplier_id: item.supplierId,
          supplier_name: supplier?.name || item.supplierName,
          inventory_item_id: item.inventoryItemId || null,
          quantity: item.quantity,
          unit_price: item.unitPrice || 0,
          line_total: item.totalPrice || 0,
          weight: item.weight || null,
          notes: item.notes || null,
          line_order: i + 1
        };
      });
      // Use offline-first bill creation from OfflineDataContext
      const createdBillId = await raw.createBill(billData, lineItemsData);
    
      // Update customer balance if credit sale or partial payment
      if (activeTab.paymentMethod === 'credit' || parseFloat(activeTab.amountReceived) < total) {
        const customer = await raw.customers.find(c => c.id === activeTab.selectedCustomer);
        if (customer) {
          const amountDue = Math.max(0, total - parseFloat(activeTab.amountReceived || '0'));
          // RULE 3 FIX: For credit sales, INCREASE customer balance (debt they owe us)
          await raw.updateCustomer(customer.id, {
            usd_balance: (customer.usd_balance || 0) + amountDue,
          });
        }
      }

      // Convert cart items to sale items format
      const saleItemsData = activeTab.cart.map(item => ({
        id: uuidv4(),
        inventory_item_id: item.inventoryItemId || '',
        product_id: item.productId,
        supplier_id: item.supplierId,
        quantity: item.quantity,
        weight: item.weight || null,
        unit_price: item.unitPrice || 0,
        received_value: item.totalPrice || 0,
        payment_method: item.paymentMethod || activeTab.paymentMethod,
        notes: item.notes || null,
        store_id: raw.storeId,
        customer_id: activeTab.selectedCustomer || null,
        created_at: new Date().toISOString(),
        created_by: userProfile?.id || '',
        _synced: false
      }));

      await addSale(
        saleItemsData
      );
      
      // Update cash drawer for cash sales
      if (activeTab.paymentMethod === 'cash') {
        try {
          console.log(total,'total cash')
          const cashDrawerResult = await cashDrawerUpdateService.updateCashDrawerForSale({
            amount: total,
            currency: 'LBP', // Assuming LBP for now, can be made dynamic
            paymentMethod: activeTab.paymentMethod,
            storeId: raw.storeId,
            createdBy: userProfile?.id || '',
            customerId: activeTab.selectedCustomer || undefined,
            billNumber: billData.bill_number
          });

          if (cashDrawerResult.success) {
            console.log(`💰 Cash drawer updated: $${cashDrawerResult.previousBalance.toFixed(2)} → $${cashDrawerResult.newBalance.toFixed(2)}`);
          } else {
            console.warn('⚠️ Cash drawer update failed:', cashDrawerResult.error);
          }
        } catch (error) {
          console.error('Error updating cash drawer:', error);
        }
      }
      
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
      showToast('success', `Sale completed successfully! Bill created.`);
    } catch (error) {
      console.error('Sale processing error:', error);
      showToast('error', `Sale failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
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
    <div className="p-6 pt-3">
      {/* <h1 className="text-2xl font-bold text-gray-900 mb-6">{t('pos.header')}</h1> */}

      {/* Bill Tabs */}
      <div className="mb-2">
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
            {t('pos.newBill')}
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
      <AccessibleModal
        isOpen={showAddCustomerForm}
        onClose={() => setShowAddCustomerForm(false)}
        title="Add New Customer"
        size="md"
      >
        <form onSubmit={handleCustomerFormSubmit} className="p-6 space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label htmlFor="customer-name" className="block text-sm font-medium text-gray-700">
                Name *
              </label>
              <input
                type="text"
                id="customer-name"
                name="name"
                value={customerForm.name}
                onChange={handleCustomerFormChange}
                className="mt-1 block w-full border border-gray-300 rounded-md shadow-sm py-2 px-3 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                required
                tabIndex={1}
                autoFocus
              />
            </div>
            <div>
              <label htmlFor="customer-phone" className="block text-sm font-medium text-gray-700">
                Phone *
              </label>
              <input
                type="text"
                id="customer-phone"
                name="phone"
                value={customerForm.phone}
                onChange={handleCustomerFormChange}
                className="mt-1 block w-full border border-gray-300 rounded-md shadow-sm py-2 px-3 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                required
                tabIndex={2}
              />
            </div>
            <div>
              <label htmlFor="customer-email" className="block text-sm font-medium text-gray-700">
                Email
              </label>
              <input
                type="email"
                id="customer-email"
                name="email"
                value={customerForm.email || ''}
                onChange={handleCustomerFormChange}
                className="mt-1 block w-full border border-gray-300 rounded-md shadow-sm py-2 px-3 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                tabIndex={3}
              />
            </div>
            <div>
              <label htmlFor="customer-address" className="block text-sm font-medium text-gray-700">
                Address
              </label>
              <input
                type="text"
                id="customer-address"
                name="address"
                value={customerForm.address || ''}
                onChange={handleCustomerFormChange}
                className="mt-1 block w-full border border-gray-300 rounded-md shadow-sm py-2 px-3 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                tabIndex={4}
              />
            </div>
            <div className="flex items-center">
              <input
                type="checkbox"
                id="customer-active"
                name="isActive"
                checked={customerForm.isActive}
                onChange={handleCustomerCheckboxChange}
                className="h-4 w-4 text-blue-600 focus:ring-2 focus:ring-blue-500 border-gray-300 rounded"
                tabIndex={5}
              />
              <label htmlFor="customer-active" className="ml-2 block text-sm text-gray-900">
                Is Active
              </label>
            </div>
          </div>
          {customerFormError && (
            <div className="text-red-600 text-sm font-medium pt-2" role="alert">
              {customerFormError}
            </div>
          )}
          <div className="flex justify-end space-x-3 pt-4">
            <AccessibleButton
              type="button"
              variant="secondary"
              onClick={() => setShowAddCustomerForm(false)}
              disabled={isAddingCustomer}
              tabIndex={7}
            >
              Cancel
            </AccessibleButton>
            <AccessibleButton
              type="submit"
              variant="primary"
              loading={isAddingCustomer}
              tabIndex={6}
              touchOptimized
            >
              {isAddingCustomer ? 'Adding...' : 'Add Customer'}
            </AccessibleButton>
          </div>
        </form>
      </AccessibleModal>

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
                placeholder={t('pos.searchProducts')}
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                ref={searchInputRef}
                tabIndex={1}
                accessKey="f"
                aria-label="Search products (Ctrl+F)"
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
            onCompleteSale={handleCheckout}
            isProcessing={isProcessing}
            completeSaleRef={completeSaleRef}
            hasZeroPricedItem={hasZeroPricedItem}
            isWalkInCustomer={isWalkInCustomer}
            paymentMethod={activeTab.paymentMethod}
            amountReceived={activeTab.amountReceived}
            selectedCustomer={activeTab.selectedCustomer}
            total={total}
          />

          {/* Totals and Payment */}
          {activeTab.cart.length > 0 && (
            <div className="bg-white rounded-lg shadow-sm p-4 space-y-4">
              <div className="space-y-2">
             
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
                <div ref={customerSelectRef}>
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
                  searchPlaceholder="Search customers..."
                  placeholder={activeTab.paymentMethod === 'credit' ? 'Select Customer' : 'Walk-in Customer'}

                  recentSelections={recentCustomers}
                  onRecentUpdate={setRecentCustomers}
                  showAddOption={true}
                  addOptionText="Add New Customer"
                  onAddNew={() => setShowAddCustomerForm(true)}
                  className={`w-full ${customerError ? 'border border-red-500' : ''}`}
                  />
                </div>
                {customerError && (
                  <p className="text-xs text-red-600 mt-1" role="alert">{customerError}</p>
                )}
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Payment Method
                </label>
                <div className="grid grid-cols-3 gap-2">
                  <button
                    type="button"
                    onClick={() => updateActiveTab({ paymentMethod: 'cash' })}
                    className={`p-3 text-xs rounded-lg border transition-all duration-200 focus:outline-none focus:ring-2 focus:ring-blue-500 min-h-[48px] ${
                      activeTab.paymentMethod === 'cash' 
                        ? 'bg-blue-50 border-blue-500 text-blue-700' 
                        : 'bg-gray-50 border-gray-300'
                    }`}
                    tabIndex={3}
                    accessKey="1"
                    aria-label="Cash payment (Ctrl+1)"
                  >
                    <DollarSign className="w-4 h-4 mx-auto mb-1" />
                    Cash
                  </button>
                  <button
                    type="button"
                    onClick={() => updateActiveTab({ paymentMethod: 'card' })}
                    className={`p-3 text-xs rounded-lg border transition-all duration-200 focus:outline-none focus:ring-2 focus:ring-blue-500 min-h-[48px] ${
                      activeTab.paymentMethod === 'card' 
                        ? 'bg-blue-50 border-blue-500 text-blue-700' 
                        : 'bg-gray-50 border-gray-300'
                    }`}
                    tabIndex={4}
                    aria-label="Card payment"
                  >
                    <CreditCard className="w-4 h-4 mx-auto mb-1" />
                    Card
                  </button>
                  <button
                    type="button"
                    onClick={() => updateActiveTab({ paymentMethod: 'credit' })}
                    className={`p-3 text-xs rounded-lg border transition-all duration-200 focus:outline-none focus:ring-2 focus:ring-blue-500 min-h-[48px] ${
                      activeTab.paymentMethod === 'credit' 
                        ? 'bg-blue-50 border-blue-500 text-blue-700' 
                        : 'bg-gray-50 border-gray-300'
                    }`}
                    tabIndex={5}
                    accessKey="2"
                    aria-label="Credit payment (Ctrl+2)"
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
                      className="focus:ring-2 focus:ring-blue-500"
                    />
                    <input
                      ref={amountInputRef}
                      type="hidden"
                      tabIndex={6}
                      onFocus={() => {
                        // Focus the actual MoneyInput when this hidden input is focused
                        const moneyInput = amountInputRef.current?.parentElement?.querySelector('input[type="text"]') as HTMLInputElement;
                        moneyInput?.focus();
                      }}
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
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  rows={2}
                  placeholder="Add notes..."
                  tabIndex={7}
                />
              </div>
 {/* Fixed Complete Sale Button at Bottom of Cart */}
 <div className="sticky bottom-0 bg-white p-4 shadow-md">
      <AccessibleButton
        ref={completeSaleRef}
        onClick={handleCheckout}
        disabled={  
          isProcessing ||
          activeTab.cart.length === 0 ||
          // Block walk-in sales when any item has price 0
          (isWalkInCustomer && hasZeroPricedItem) ||
          (activeTab.paymentMethod !== 'credit' && !activeTab.amountReceived) ||
          ((activeTab.paymentMethod === 'credit' && !activeTab.selectedCustomer) ||
          (activeTab.paymentMethod !== 'credit' && parseFloat(activeTab.amountReceived || '0') < total && !activeTab.selectedCustomer))
        }
        variant="success"
        size="lg"
        touchOptimized
        loading={isProcessing}
        shortcut="Ctrl+Enter"
        ariaLabel="Complete sale"
        tabIndex={8}
        className="w-full"
      >
        Complete Sale
      </AccessibleButton>
    </div>
              {/* Complete Sale button moved to Cart component */}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

const ProductGrid = ({ filteredProducts, getProductStock, getProductInventoryItems, addToCart }: any) => {
  const { t } = useI18n();
  

  return (
    <div className="bg-white rounded-lg shadow-sm border border-gray-200">
    

      {/* Enhanced Product Grid */}
      <div className="p-6">
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4">
          {(filteredProducts || []).map((product: any) => {
            const stock = getProductStock(product.id);
            const productInventoryItems = getProductInventoryItems(product.id) || [];

            return (
              <div key={product.id} className="group border border-gray-200 rounded-xl p-4 hover:shadow-lg hover:border-blue-300 transition-all duration-200 bg-white">
                {/* Product Image */}
                <div className="relative mb-3">
                  <img 
                    src={product.image} 
                    alt={product.name} 
                    className="w-full h-28 object-cover rounded-lg group-hover:scale-105 transition-transform duration-200" 
                  />
                
                </div>

                {/* Product Info */}
                <div className="space-y-2 mb-3">
                  <h3 className="font-semibold text-gray-900 text-sm leading-tight group-hover:text-blue-600 transition-colors duration-200">
                    {product.name}
                  </h3>
                  <div className="flex items-center justify-between">
                  
                    {product.category && (
                      <span className="text-xs text-gray-500 bg-gray-100 px-2 py-1 rounded-full">
                        {product.category}
                      </span>
                    )}
                  </div>
                </div>

                {/* Inventory Items */}
                {productInventoryItems.length > 0 ? (
                  <div className="space-y-2">
                    {productInventoryItems.map((inventoryItem: any, index: number) => (
                      <AccessibleButton
                        key={inventoryItem.inventoryItemId}
                        onClick={() => addToCart(product.id, inventoryItem.inventoryItemId)}
                        variant="ghost"
                        size="sm"
                        touchOptimized
                        disabled={inventoryItem.quantity === 0}
                        className={`w-full p-3 rounded-lg border-2 transition-all duration-200 text-left ${
                          inventoryItem.quantity === 0
                            ? 'bg-gray-100 border-gray-200 text-gray-400 cursor-not-allowed'
                            : 'bg-blue-50 border-blue-200 text-blue-700 hover:bg-blue-100 hover:border-blue-300 hover:shadow-md'
                        }`}
                        ariaLabel={`Add ${product.name} from ${inventoryItem.supplierName}`}
                        tabIndex={100 + index}
                      >
                        <div className="space-y-1">
                          <div className="font-medium text-sm">{inventoryItem.supplierName}</div>
                          <div className="flex items-center justify-between text-xs">
                            <span className={`px-2 py-1 rounded-full ${
                              inventoryItem.quantity === 0 
                                ? 'bg-red-100 text-red-700' 
                                : 'bg-green-100 text-green-700'
                            }`}>
                              {inventoryItem.quantity} available
                            </span>
                            {inventoryItem.price > 0 && (
                              <span className="font-semibold text-blue-700">
                                ${inventoryItem.price.toFixed(2)}
                              </span>
                            )}
                          </div>
                          <div className="text-xs text-gray-500">
                            Received: {inventoryItem.receivedQuantity}
                          </div>
                        </div>
                      </AccessibleButton>
                    ))}
                  </div>
                ) : (
                  <div className="text-center py-4">
                    <div className="bg-gray-100 w-12 h-12 rounded-full flex items-center justify-center mx-auto mb-2">
                      <Package className="w-6 h-6 text-gray-400" />
                    </div>
                    <p className="text-xs text-gray-500">Out of Stock</p>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
};
const Cart = ({ activeTab, updateCartItem, removeFromCart, formatCurrency, inventory, onCompleteSale, isProcessing, completeSaleRef, hasZeroPricedItem, isWalkInCustomer, paymentMethod, amountReceived, selectedCustomer, total }: any) => (
  <div className="bg-white rounded-lg shadow-sm relative">
    {/* Enhanced Cart Header */}
    {/* <div className="p-4 border-b bg-gradient-to-r from-blue-50 to-indigo-50">
      <div className="flex items-center justify-between">
        <div className="flex items-center">
          <div className="bg-blue-100 p-2 rounded-lg mr-3">
            <ShoppingCart className="w-6 h-6 text-blue-600" />
          </div>
          <div>
            <h2 className="text-xl font-bold text-gray-900">Shopping Cart</h2>
            <p className="text-sm text-gray-600">
              {(activeTab?.cart || []).length} item{(activeTab?.cart || []).length !== 1 ? 's' : ''} • Total: {formatCurrency(total)}
            </p>
          </div>
        </div>
        {(activeTab?.cart || []).length > 0 && (
          <div className="text-right">
            <div className="text-2xl font-bold text-blue-600">{formatCurrency(total)}</div>
            <div className="text-xs text-gray-500">Total Amount</div>
          </div>
        )}
      </div>
    </div> */}

    {/* Enhanced Cart Items */}
    <div className="max-h-96 overflow-y-auto">
      {(activeTab?.cart || []).length > 0 ? (
        <div className="divide-y divide-gray-100">
          {(activeTab?.cart || []).map((item: any, index: number) => {
            const inventoryItem = inventory.find((inv: any) => inv.id === item.inventoryItemId);
            const availableStock = inventoryItem ? inventoryItem.quantity : 0;

            return (
              <div key={item.id} className="p-4 hover:bg-gray-50 transition-colors duration-150">
                {/* Product Header */}
                <div className="flex items-start justify-between mb-3">
                  <div className="flex-1">
                    <div className="flex items-center space-x-2 mb-1">
                      <h4 className="font-semibold text-gray-900 text-base">{item.productName}</h4>
                      <span className="px-2 py-1 bg-blue-100 text-blue-800 text-xs rounded-full font-medium">
                        #{index + 1}
                      </span>
                    </div>
                    <p className="text-sm text-gray-600 flex items-center">
                      <span className="w-2 h-2 bg-green-400 rounded-full mr-2"></span>
                      {item.supplierName}
                    </p>
                
                  </div>
                  <AccessibleButton
                    onClick={() => removeFromCart(item.id)}
                    variant="ghost"
                    size="sm"
                    className="text-red-500 hover:text-red-700 hover:bg-red-50 p-2 rounded-lg transition-colors duration-150 min-h-[44px]"
                    ariaLabel={`Remove ${item.productName} from cart`}
                    tabIndex={200 + index * 4 + 4}
                  >
                    <Trash2 className="w-4 h-4" />
                  </AccessibleButton>
                </div>

                {/* Enhanced Input Grid */}
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                  {/* Quantity */}
                  <div className="space-y-1">
                    <label className="text-xs font-medium text-gray-700 uppercase tracking-wide">Quantity</label>
                    <div className="relative">
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
                        className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 min-h-[44px] bg-white"
                        tabIndex={200 + index * 4 + 1}
                        aria-label={`Quantity for ${item.productName}`}
                      />
                      <div className="absolute right-2 top-1/2 transform -translate-y-1/2 text-xs text-gray-400">
                        units
                      </div>
                    </div>
                  </div>

                  {/* Weight */}
                  <div className="space-y-1">
                    <label className="text-xs font-medium text-gray-700 uppercase tracking-wide">Weight</label>
                    <div className="relative">
                      <input
                        type="number"
                        step="0.01"
                        value={item.weight ?? ''}
                        onChange={(e) => updateCartItem(item.id, 'weight', e.target.value ? parseFloat(e.target.value) : undefined)}
                        className={`w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 min-h-[44px] ${
                          item.productName.toLowerCase().includes('plastic') 
                            ? 'bg-gray-100 text-gray-400 cursor-not-allowed' 
                            : 'bg-white'
                        }`}
                        placeholder="0.00"
                        disabled={item.productName.toLowerCase()==='plastic'}
                        tabIndex={200 + index * 4 + 2}
                        aria-label={`Weight for ${item.productName}`}
                      />
                      <div className="absolute right-2 top-1/2 transform -translate-y-1/2 text-xs text-gray-400">
                        kg
                      </div>
                    </div>
                  </div>

                  {/* Unit Price */}
                  <div className="space-y-1">
                    <label className="text-xs font-medium text-gray-700 uppercase tracking-wide">Unit Price</label>
                    <MoneyInput
                      step="0.01"
                      min="0"
                      value={item.unitPrice ?? ''}
                      onChange={(value) => updateCartItem(item.id, 'unitPrice', value ? parseFloat(value) : undefined)}
                      className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 min-h-[44px] bg-white"
                      placeholder="0.00"
                    />
                    <input
                      type="hidden"
                      tabIndex={200 + index * 4 + 3}
                      onFocus={() => {
                        const moneyInput = document.querySelector(`input[placeholder="0.00"]`) as HTMLInputElement;
                        moneyInput?.focus();
                      }}
                      aria-label={`Price for ${item.productName}`}
                    />
                  </div>

                  {/* Total Price */}
                  <div className="space-y-1">
                    <label className="text-xs font-medium text-gray-700 uppercase tracking-wide">Total</label>
                    <div className="bg-gradient-to-r from-blue-50 to-indigo-50 p-3 rounded-lg border border-blue-200">
                      <div className="text-lg font-bold text-blue-700 text-center">
                        {formatCurrency(item.totalPrice)}
                      </div>
                    </div>
                  </div>
                </div>

        
              </div>
            );
          })}
        </div>
      ) : (
        <div className="p-12 text-center text-gray-500">
          <div className="bg-gray-100 w-20 h-20 rounded-full flex items-center justify-center mx-auto mb-4">
            <ShoppingCart className="w-10 h-10 text-gray-400" />
          </div>
          <h3 className="text-lg font-medium text-gray-900 mb-2">Your cart is empty</h3>
          <p className="text-gray-600">Start adding products to begin your sale</p>
        </div>
      )}
    </div>
  </div>
);