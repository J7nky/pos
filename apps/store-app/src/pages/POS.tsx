import React, { useState, useEffect, useMemo } from 'react';
import { usePOSKeyboard } from '../hooks/usePOSKeyboard';
import AccessibleButton from '../components/common/AccessibleButton';
import { useOfflineData } from '../contexts/OfflineDataContext';
import { useCustomerForm } from '../contexts/CustomerFormContext';
import { useSupabaseAuth } from '../contexts/SupabaseAuthContext';
import { useCurrency } from '../hooks/useCurrency';
import { useEntityBalances } from '../hooks/useEntityBalances';
import SearchableSelect from '../components/common/SearchableSelect';
import MoneyInput from '../components/common/MoneyInput';
import { useLocalStorage } from '../hooks/useLocalStorage';
import EnhancedProductCard from '../components/EnhancedProductCard';
import CashDrawerOpeningModal from '../components/common/CashDrawerOpeningModal';
import { useNavigate } from 'react-router-dom';

import { 
  Search, 
  ShoppingCart, 
  CreditCard, 
  DollarSign,
  User,
  Trash2,
  X,
  PlusCircle,
} from 'lucide-react';
import { Customer, BillLineItem } from '../types';
import { v4 as uuidv4 } from 'uuid';
import { useI18n } from '../i18n';
import { useQRCodeGeneration } from '../hooks/useQRCodeGeneration';
import { generateBillReference } from '../utils/referenceGenerator';
import { accountingInitService } from '../services/accountingInitService';
import { useProductMultilingual } from '../hooks/useMultilingual';
import { parseMultilingualString } from '../utils/multilingual';


interface BillTab {
  id: string;
  name: string;
  cart: BillLineItem[];
  selectedCustomer: string;
  paymentMethod: 'cash' | 'card' | 'credit';
  amountReceived: string;
  notes: string;
  createdAt: string;
}

export default function POS() {
  const raw = useOfflineData();
  const { requestAddCustomerFromPOS } = useCustomerForm();
  const navigate = useNavigate();
  const [activeTabs, setActiveTabs] = useLocalStorage<BillTab[]>('pos_active_tabs', []);
  const [activeTabId, setActiveTabId] = useLocalStorage<string>('pos_active_tab_id', '');
  
  // Early return check - must happen after localStorage hooks but before other hooks
  const activeTab = activeTabs.find(tab => tab.id === activeTabId);
  if (!activeTab && activeTabs.length > 0) {
    // If we have tabs but no active tab, set the first one as active
    setActiveTabId(activeTabs[0].id);
  }

  // Refs for keyboard navigation
  const searchInputRef = React.useRef<HTMLInputElement>(null);
  const customerSelectRef = React.useRef<HTMLDivElement>(null);
  const amountInputRef = React.useRef<HTMLInputElement>(null);
  const completeSaleRef = React.useRef<HTMLButtonElement>(null);

  const products = (raw.products || []).map(p => ({...p, createdAt: p.created_at})) as Array<any>;
  
  // Get customer entities and calculate balances from journal entries
  const customerEntities = raw.customers || [];
  const customerIds = useMemo(() => customerEntities.map(c => c.id), [customerEntities]);
  const customerBalances = useEntityBalances(customerIds, 'customer', true);
  const customers = customerEntities.map(c => {
    const balances = customerBalances.getBalances(c.id) || { USD: 0, LBP: 0 };
    return {
      ...c, 
      isActive: c.is_active, 
      createdAt: c.created_at, 
      lb_balance: balances.LBP,  // From journal entries
      usd_balance: balances.USD  // From journal entries
    };
  }) as Array<any>;
  const suppliers = (raw.suppliers || []).map(s => ({...s,createdAt: s.created_at})) as Array<any>;
  const inventory = (raw.inventory || []) as Array<any>;
  const inventoryBills = (raw.inventoryBills || []) as Array<any>;

  const { userProfile } = useSupabaseAuth();
  const { formatCurrency } = useCurrency();
  const { t } = useI18n();
  const { generateQRCodeForReceipt } = useQRCodeGeneration();
  const { getProductName } = useProductMultilingual();

  const [recentCustomers, setRecentCustomers] = useLocalStorage<string[]>('pos_recent_customers', []);
  const [searchTerm, setSearchTerm] = useState('');
  // Add isProcessing state for async checkout
  const [isProcessing, setIsProcessing] = useState(false);
  // Add toast state
  const [toast, setToast] = useState<{ type: 'success' | 'error'; message: string } | null>(null);
  // Add customer validation state
  const [customerError, setCustomerError] = useState<string | null>(null);
  // Add printing state
  const [isPrinting, setIsPrinting] = useState(false);
  // Add cash drawer opening modal state
  const [showCashDrawerModal, setShowCashDrawerModal] = useState(false);
  const [pendingCashDrawerOpening, setPendingCashDrawerOpening] = useState<(() => void) | null>(null);
  const [recommendedDrawerAmount, setRecommendedDrawerAmount] = useState(0);

  // Load recommended amount when modal opens
  useEffect(() => {
    if (showCashDrawerModal) {
      const fetchRecommendedAmount = async () => {
        try {
          const result = await raw.getRecommendedOpeningAmount();
          setRecommendedDrawerAmount(result.amount);
        } catch (error) {
          console.error('Error fetching recommended amount:', error);
          // Fallback to sale amount if available
          const fallbackAmount = activeTab?.amountReceived ? parseFloat(activeTab?.amountReceived) : total;
          setRecommendedDrawerAmount(fallbackAmount);
        }
      };
      fetchRecommendedAmount();
    }
  }, [showCashDrawerModal, raw]);

  const showToast = (type: 'success' | 'error', message: string) => {
    setToast({ type, message });
    setTimeout(() => setToast(null), 3000);
  };


  // Receipt printing function
  const printReceipt = async (billData: any, lineItemsData: any[], entity: any, qrCodeData?: any) => {
    console.log('🔵 [FUNCTION CALL] printReceipt - START');
    console.log('📊 [FUNCTION CALL] printReceipt - Parameters:', {
      billDataId: billData?.id,
      lineItemsCount: lineItemsData?.length,
      entityId: entity?.id,
      hasQrCode: !!qrCodeData
    });
    try {
      setIsPrinting(true);
      
      console.log('🔍 Print receipt - QR code data:', { 
        hasQrCodeData: !!qrCodeData, 
        qrCodeDataUrl: qrCodeData?.qrCodeDataUrl,
        qrCodeUrl: qrCodeData?.qrCodeUrl 
      });
      
      // Generate receipt content
      const receiptContent = await generateReceiptContent(billData, lineItemsData, entity, products, qrCodeData);
      
      // Print using Electron API
      if ((window as any).electronAPI?.printDocument) {
        // Get available printers and find the best one
        let printerName = 'Default';
        try {
          const printerInfo = await (window as any).electronAPI.getPrinters();
          console.log('🔍 Printer detection result:', JSON.stringify(printerInfo, null, 2));
          
          // Handle both structured response and raw array
          if (Array.isArray(printerInfo)) {
            // Raw array format - find Xprinter manually
            const xprinter = printerInfo.find((p: any) => 
              p.name.toLowerCase().includes('xprinter') ||
              p.name.toLowerCase().includes('thermal') ||
              p.name.toLowerCase().includes('receipt')
            );
            if (xprinter) {
              printerName = xprinter.name;
              console.log('🖨️ Using Xprinter from raw array:', printerName);
            } else {
              printerName = printerInfo[0]?.name || 'Default';
              console.log('🖨️ Using first printer from raw array:', printerName);
            }
          } else if (printerInfo && printerInfo.success && printerInfo.recommended) {
            printerName = printerInfo.recommended;
            console.log('🖨️ Using recommended printer:', printerName);
          } else if (printerInfo && printerInfo.success && printerInfo.thermalPrinters && printerInfo.thermalPrinters.length > 0) {
            // Fallback: use first thermal printer if available
            printerName = printerInfo.thermalPrinters[0].name;
            console.log('🖨️ Using first thermal printer:', printerName);
          } else {
            console.log('⚠️ No recommended printer found, using default');
            console.log('🔍 Available printers:', printerInfo?.printers?.map((p: any) => p.name));
          }
        } catch (error) {
          console.log('⚠️ Could not detect printers, using default:', error);
        }
        
        const result = await (window as any).electronAPI.printDocument({
          content: receiptContent,
          printerName: printerName,
          qrCodeData: qrCodeData?.qrCodeDataUrl, // Pass QR code image data for HTML printing
          qrCodeUrl: qrCodeData?.qrCodeUrl, // Pass QR code URL for HTML display
          printOptions: {
            margins: {
              top: 0,
              bottom: 0,
              left: 0,
              right: 0
            },
            printBackground: false,
            landscape: false,
            receiptWidth: raw.receiptSettings?.receiptWidth || 32 // ADD THIS LINE
          }
        });

        if (result.success) {
          console.log('✅ Receipt printed successfully');
          console.log('🔵 [FUNCTION CALL] printReceipt - SUCCESS');
          showToast('success', 'Receipt printed successfully');
        } else {
          console.error('❌ Receipt printing failed:', result.message);
          console.log('🔴 [FUNCTION CALL] printReceipt - FAILED:', result.message);
          showToast('error', 'Receipt printing failed: ' + result.message);
        }
      } else {
        console.log('⚠️ Electron API not available, skipping receipt printing');
        showToast('error', 'Printing not available in web mode');
      }
    } catch (error) {
      console.error('❌ Error printing receipt:', error);
      console.log('🔴 [FUNCTION CALL] printReceipt - ERROR:', error);
      showToast('error', 'Failed to print receipt');
    } finally {
      setIsPrinting(false);
      console.log('🔵 [FUNCTION CALL] printReceipt - END');
    }
  };

  // Generate receipt content
  const generateReceiptContent = async (billData: any, lineItemsData: any[], entity: any, products: any[], qrCodeData?: any) => {
    console.log('🔵 [FUNCTION CALL] generateReceiptContent - START');
    console.log('📊 [FUNCTION CALL] generateReceiptContent - Parameters:', {
      billNumber: billData?.bill_number,
      lineItemsCount: lineItemsData?.length,
      entityName: entity?.name,
      productsCount: products?.length,
      hasQrCode: !!qrCodeData
    });
    // Get receipt settings from offline context
    const receiptSettings = raw.receiptSettings || {
      storeName: 'KIWI VEGETABLES MARKET',
      address: '63-B2-Whole Sale Market, Tripoli - Lebanon',
      phone1: '+961 70 123 456',
      phone1Name: 'Samir',
      phone2: '03 123 456',
      phone2Name: 'Mohammad',
      thankYouMessage: 'Thank You!',
      billNumberPrefix: '000',
      showPreviousBalance: true,
      showItemCount: true,
      receiptWidth: 150
    };

    const date = new Date(billData.bill_date).toLocaleDateString('en-GB');
    const customerName = entity ? entity.name : t('common.labels.walkInCustomer');
    const customerPhone = entity ? entity.phone : '';
    
    // Format bill number with prefix
    const billNumber = `${receiptSettings.billNumberPrefix}${billData.bill_number.split('-')[1] || '12345'}`;
    
    // Create separator line based on receipt width from settings
    const receiptWidth = Math.max(10, Number(receiptSettings.receiptWidth) || 32);
    const separator = '====================================================================================================';
    const dashSeparator = '----------------------------------------------------------------------------------------------------';
    console.log(separator.length, 'separator 123');
    let content = `${separator}
         ${receiptSettings.storeName}
    ${receiptSettings.address}
      ${t('receipt.phones')}: ${receiptSettings.phone1Name}: ${receiptSettings.phone1} / ${receiptSettings.phone2Name}: ${receiptSettings.phone2}
${separator}
${t('receipt.billNumber')}: ${billNumber}         ${t('receipt.date')}: ${date}
${t('receipt.customer')}: ${customerName}`;

    if (customerPhone) {
      content += `
${t('receipt.phone')}: ${customerPhone}`;
    }

    content += `
${dashSeparator}
${t('receipt.itemHeader')}
${dashSeparator}`;

    // Compute dynamic column widths based on total receipt width
    const spacingBetweenColumns = 1; // single space between columns
    const numGaps = 4; // between 5 columns
    const availableColumnWidth = Math.max(0, receiptWidth - (spacingBetweenColumns * numGaps));
    // Minimum sensible widths for columns
    const minName = 8, minQty = 3, minWeight = 5, minPrice = 7, minSubtotal = 7;
    const baseTotalMin = minName + minQty + minWeight + minPrice + minSubtotal;
    const extra = Math.max(0, availableColumnWidth - baseTotalMin);
    // Distribute extra width with bias towards name and subtotal
    const nameWidth = minName + Math.floor(extra * 0.55);
    const qtyWidth = minQty + Math.floor(extra * 0.05);
    const weightWidth = minWeight + Math.floor(extra * 0.10);
    const priceWidth = minPrice + Math.floor(extra * 0.10);
    const subtotalWidth = availableColumnWidth - (nameWidth + qtyWidth + weightWidth + priceWidth);

    lineItemsData.forEach((item) => {
      const product = products.find(p => p.id === item.product_id);
      const productName = product ? getProductName(product) : 'Unknown Product';
      const quantity = item.quantity || 0;
      const weight = item.weight || 0;
      const price = item.unit_price || 0;
      const subtotal = item.line_total || 0;
      
      // Format with proper padding for receipt alignment based on dynamic widths
      const paddedName = productName.padEnd(nameWidth).substring(0, nameWidth);
      const paddedQty = quantity.toString().padStart(qtyWidth).substring(0, qtyWidth);
      const weightStr = weight > 0 ? weight.toFixed(1) : '';
      const paddedWeight = weightStr.padStart(weightWidth).substring(0, weightWidth);
      const priceStr = formatCurrency(price);
      const paddedPrice = priceStr.padStart(priceWidth).substring(0, priceWidth);
      const subtotalStr = formatCurrency(subtotal);
      const paddedSubtotal = subtotalStr.padStart(subtotalWidth).substring(0, subtotalWidth);
      
      content += `
${paddedName} ${paddedQty} ${paddedWeight} ${paddedPrice} ${paddedSubtotal}`;
    });

    content += `
${dashSeparator}`;

    if (receiptSettings.showItemCount) {
      content += `
${t('receipt.totalItems')}: ${lineItemsData.length}`;
    }

    content += `
${t('receipt.subtotal')}:                         ${formatCurrency(billData.subtotal)} ${t('common.currency.LBP')}`;

    // Show previous balance if enabled and entity has balance
    if (receiptSettings.showPreviousBalance && entity && entity.lb_balance > 0) {
      content += `
${t('receipt.previousBalance')}:                 ${formatCurrency(entity.lb_balance)} ${t('common.currency.LBP')}`;
    }

    content += `
${dashSeparator}
${t('receipt.totalBalance')}:                    ${formatCurrency(billData.total_amount)} ${t('common.currency.LBP')}
${dashSeparator}
           💬 ${receiptSettings.thankYouMessage}
${dashSeparator}`;

    // Add QR code section if available and customer is selected
    if (qrCodeData && entity) {
      content += `
📱 ${t('receipt.scanQRCode')}
${dashSeparator}
[QR_CODE_PLACEHOLDER]
${t('receipt.customer')}: ${entity.name}
${t('receipt.billNumber')}: ${billData.bill_number}
${dashSeparator}`;
    }

    console.log('🔵 [FUNCTION CALL] generateReceiptContent - END');
    console.log('📊 [FUNCTION CALL] generateReceiptContent - Content length:', content.length);
    return content;
  };

  // Define createNewTab function before it's used
  const createNewTab = () => {
    const newTab: BillTab = {
      id: uuidv4(),
      name: `${t('common.labels.bill')} ${activeTabs.length + 1}`,
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
      if (!isProcessing && activeTab && activeTab.cart.length > 0) {
        handleCheckout();
      }
    },
    onClearCart: () => {
      if (activeTab && activeTab.cart.length > 0) {
        updateActiveTab({ cart: [] });
      }
    },
    onFocusSearch: () => searchInputRef.current?.focus(),
    onFocusCustomer: () => customerSelectRef.current?.focus(),
    onFocusAmount: () => amountInputRef.current?.focus(),
    onQuickCash: () => updateActiveTab({ paymentMethod: 'cash' }),
    onQuickCredit: () => updateActiveTab({ paymentMethod: 'credit' })
  });

  // // Auto-focus search input on component mount
  // React.useEffect(() => {
  //   const timer = setTimeout(() => {
  //     if (searchInputRef.current) {
  //       searchInputRef.current.focus();
  //     }
  //   }, 100);
  //   return () => clearTimeout(timer);
  // }, []);

  // Initialize with first tab if no tabs exist
  React.useEffect(() => {
    const createNewTab = () => {
      const newTab: BillTab = {
        id: uuidv4(),
        name: `${t('common.labels.bill')} ${activeTabs.length + 1}`,
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
            paymentMethod: updates.paymentMethod!
          }));
        }
        return updatedTab;
      }
      return tab;
    });
    setActiveTabs(updatedTabs);
  };

  // activeTab is already defined at the top of the component

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

    // Create batch map for supplier lookup
    const batchMap = new Map(inventoryBills.map(b => [b.id, b]));

    return productInventoryItems.map(inventoryItem => {
      // Get supplier_id from batch
      const batch = inventoryItem.batch_id ? batchMap.get(inventoryItem.batch_id) : null;
      const supplierId = batch?.supplier_id || null;
      const supplier = supplierId ? suppliers.find(s => s.id === supplierId) : null;
      const reserved = getReservedForInventoryItem(inventoryItem.id);
      const available = Math.max(0, (inventoryItem.quantity || 0) - reserved);
      return {
        inventoryItemId: inventoryItem.id,
        supplierId: supplierId,
        supplierName: supplier?.name || 'Unknown Supplier',
        // Reflect temporary reservations in the UI
        quantity: available,
        receivedQuantity: inventoryItem.received_quantity,
        price: inventoryItem.price || 0,
        sellingPrice: inventoryItem.selling_price || null,
        type: inventoryItem.type || 'cash',
        receivedAt: inventoryItem.received_at || inventoryItem.created_at,
        sku: inventoryItem.sku || null
      };
    });
  };

  // Search inventory items by SKU/barcode
  const findInventoryItemBySku = (sku: string) => {
    if (!sku || !sku.trim()) return null;
    const normalizedSku = sku.trim().toUpperCase();
    return inventory.find(item => 
      item.sku && item.sku.toUpperCase() === normalizedSku && !item._deleted
    );
  };

  // Handle barcode scan - automatically add to cart if found
  useEffect(() => {
    // Improved barcode detection: check if search term matches a SKU exactly
    // Barcodes can be any length, but we require at least 3 characters to avoid false positives
    if (searchTerm && searchTerm.trim().length >= 3) {
      const scannedItem = findInventoryItemBySku(searchTerm.trim());
      if (scannedItem) {
        // Find the product for this inventory item
        const product = products.find(p => p.id === scannedItem.product_id);
        if (product && getProductStock(product.id) > 0) {
          // Add to cart automatically
          addToCart(product.id, scannedItem.id);
          // Clear search term after adding
          setTimeout(() => setSearchTerm(''), 100);
        }
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchTerm]);

  const filteredProducts = (products || []).filter(product => {
    if (getProductStock(product.id) === 0) return false;

    const searchLower = searchTerm.toLowerCase();

    // Search by product name (multilingual)
    const productName = getProductName(product);
    if (productName.toLowerCase().includes(searchLower)) {
      return true;
    }

    // Search by supplier names for this product
    const productInventoryItems = getProductInventoryItems(product.id);
    const hasMatchingSupplier = productInventoryItems.some(item => 
      item.supplierName.toLowerCase().includes(searchLower)
    );

    // Search by SKU/barcode for inventory items of this product
    const hasMatchingSku = productInventoryItems.some(item => 
      item.sku && item.sku.toLowerCase().includes(searchLower)
    );

    return hasMatchingSupplier || hasMatchingSku;
  });

  // In addToCart, add specific inventory item to cart respecting temporary reservations across all tabs
  const addToCart = (productId: string, inventoryItemId: string) => {
    if (!activeTab) return;
    const product = products.find(p => p.id === productId);
    const inventoryItem = inventory.find(item => item.id === inventoryItemId);
    if (!product || !inventoryItem) return;

    // Get supplier_id from batch
    const batch = inventoryItem.batch_id ? inventoryBills.find(b => b.id === inventoryItem.batch_id) : null;
    const supplierId = batch?.supplier_id || null;
    const supplier = supplierId ? suppliers.find(s => s.id === supplierId) : null;
    if (!supplier || !supplierId) return;

    // Compute available considering what's already reserved across all tabs for this inventory item
    const reserved = activeTabs.reduce((sum, tab) => {
      return (
        sum + tab.cart
          .filter(ci => ci.inventoryItemId === inventoryItemId)
          .reduce((s, ci) => s + (ci.quantity || 0), 0)
      );
    }, 0);
    const available = Math.max(0, (inventoryItem.quantity || 0) - reserved);

    // Check if we already have this specific addToCart item in the cart
    const existingItem = activeTab.cart.find(item => 
      item.inventoryItemId === inventoryItemId
    );
    console.log(existingItem,'existingItem in addToCart');
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
      const newItem: BillLineItem = {
        id: uuidv4(),
        createdAt: new Date().toISOString(),
        createdBy: userProfile?.id || '',
        storeId: raw.storeId,
        billId: activeTab.id,
        lineTotal: 0.00,
        receivedValue: 0.00,
        productId,
        supplierId: supplierId,
        quantity: 1,
        weight: undefined, // Weight will be entered manually during sale
        unitPrice:0.00, // Use price from this specific inventory item
        paymentMethod: activeTab.paymentMethod, // Set payment method from current tab
        notes: inventoryItem.notes || null,
        inventoryType: inventoryItem.type || 'cash', // Track the inventory type
        inventoryItemId: inventoryItem.id // Use the specific inventory item ID
      };
      updateActiveTab({ cart: [...activeTab.cart, newItem] });
    }
  };

  // In updateCartItem, prevent increasing quantity beyond available stock (considering other cart reservations across all tabs)
  const updateCartItem = (itemId: string, field: keyof BillLineItem, value: any) => {
    if (!activeTab) return;
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
            updatedItem.lineTotal = Math.round(updatedItem.weight * updatedItem.unitPrice * 100) / 100;
          } else {
            updatedItem.lineTotal = Math.round(updatedItem.quantity * updatedItem.unitPrice * 100) / 100;
          }
        }
        return updatedItem;
      }
      return item;
    });
    updateActiveTab({ cart: updatedCart });
  };

  const removeFromCart = (itemId: string) => {
    if (!activeTab) return;
    const updatedCart = activeTab.cart.filter(item => item.id !== itemId);
    updateActiveTab({ cart: updatedCart });
  };

  const total = activeTab?.cart?.reduce((sum, item) => sum + (item.lineTotal ?? 0), 0) ?? 0;

  const change = activeTab?.amountReceived ? Math.round((parseFloat(activeTab.amountReceived) - total) * 100) / 100 : 0;

  // Validation helpers
  const isWalkInCustomer = activeTab?.selectedCustomer === t('common.labels.walkInCustomer'); // Empty string represents Walk-in Customer
  const hasZeroPricedItem = activeTab?.cart?.some(i => (i.unitPrice ?? 0) === 0) ?? false;


  // Make handleCheckout async, add isProcessing state, and disable Complete Sale button while processing
  const handleCheckout = async () => {
    if (!activeTab || activeTab.cart.length === 0) return;
    
    // Check if there are non-priced items and automatically switch to credit
    const hasNonPricedItem = activeTab.cart.some(i => (i.unitPrice ?? 0) === 0);
    if (hasNonPricedItem && activeTab.paymentMethod !== 'credit') {
      updateActiveTab({ paymentMethod: 'credit' });
      // Return early to let the state update, user can click proceed again
      return;
    }
    
    // Disallow completing sale if walk-in customer and any item has zero price
    if (!activeTab.selectedCustomer && activeTab.cart.some(i => (i.unitPrice ?? 0) === 0)) {
      setCustomerError('Please set a price or select a customer. Walk-in sales cannot include zero-priced items.');
      return;
    }

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
    
    try {
      // Validate accounting foundation is synced before selling
      const storeId = raw.storeId || userProfile?.store_id;
      if (!storeId) {
        showToast('error', 'Store ID not found. Please refresh the page and try again.');
        setIsProcessing(false);
        return;
      }
      
      try {
        await accountingInitService.validateAccountingSetup(storeId);
      } catch (accountingError) {
        const errorMessage = accountingError instanceof Error 
          ? accountingError.message 
          : 'Accounting foundation not initialized. Please contact admin to set up the store properly.';
        showToast('error', errorMessage);
        setIsProcessing(false);
        return;
      }
      
      // Check if cash drawer is open
      const currentCashDrawerStatus = await raw.getCurrentCashDrawerStatus();
      console.log('Current cash drawer status:', currentCashDrawerStatus);

      if (!currentCashDrawerStatus || currentCashDrawerStatus.status !== 'active') {
        // Cash drawer is closed - show modal to enter opening amount
        console.log('Cash drawer is closed - showing opening modal');
        setShowCashDrawerModal(true);
        setIsProcessing(false);
        
        // Store the checkout continuation function
        setPendingCashDrawerOpening(() => () => {
          processSale(); // This will be called after modal confirmation
        });
        
        return; // Wait for modal to be confirmed
      } else {
        console.log('Active cash drawer session found:', currentCashDrawerStatus.sessionId);
      }
      
      // If drawer is open, proceed with sale
      await processSale();
      
    } catch (error) {
      console.error('Error checking cash drawer:', error);
      showToast('error', 'Failed to check cash drawer status');
      setIsProcessing(false);
    }
  };

  const handleCashDrawerModalConfirm = async (openingAmount: number) => {
    if (!userProfile?.id) {
      throw new Error('User not authenticated');
    }
    
    setIsProcessing(true);
    
    try {
      // Convert the entered amount to LBP for storage
      // User enters in preferred currency, we store in LBP
      let amountInLBP = openingAmount;
      if (raw.currency === 'USD' && raw.exchangeRate > 0) {
        amountInLBP = openingAmount * raw.exchangeRate;
      }
      
      // Open cash drawer with the converted amount
      await raw.openCashDrawer(amountInLBP, userProfile.id);
      
      // Close modal
      setShowCashDrawerModal(false);
      
      // Now proceed with the sale
      if (pendingCashDrawerOpening) {
        pendingCashDrawerOpening();
        setPendingCashDrawerOpening(null);
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Failed to open cash drawer session';
      showToast('error', msg);
      setIsProcessing(false);
      throw err;
    }
  };

  const processSale = async () => {
    setIsProcessing(true);
    
    try {
      // Validate accounting foundation is synced before processing sale
      // This is a safety check in case processSale is called from elsewhere
      const storeId = raw.storeId || userProfile?.store_id;
      if (!storeId) {
        throw new Error('Store ID not found. Please refresh the page and try again.');
      }
      
      await accountingInitService.validateAccountingSetup(storeId);

      // Prepare bill data
      const amountReceived = parseFloat(activeTab.amountReceived) || 0;
      const amountDue = Math.max(0, total - amountReceived);
      const paymentStatus = amountDue === 0 ? 'paid' : (amountReceived > 0 ? 'partial' : 'pending');
      
      const billData = {
        bill_number: generateBillReference(), // Generate unique bill number in format BILL-123456
        customer_id: activeTab.selectedCustomer || null,
        subtotal: total, // Same as total for now
        total_amount: total,
        payment_method: activeTab.paymentMethod,
        payment_status: paymentStatus,
        amount_paid: amountReceived,
        bill_date: new Date().toISOString(),
        notes: activeTab.notes || null,
        status: 'active', // Use 'active' instead of 'completed'
        created_by: userProfile?.id
      };

      // Prepare line items data
      // Note: payment_method, customer_id, created_by are in bills table, not bill_line_items
      // supplier_id is not in bill_line_items - resolved via inventory_items.batch_id
      const lineItemsData = activeTab.cart.map(item => ({
        inventory_item_id: item.inventory_item_id || item.inventoryItemId,
        product_id: item.product_id || item.productId, // Handle both snake_case and camelCase
        quantity: item.quantity,
        branch_id: raw.currentBranchId,
        unit_price: item.unit_price || item.unitPrice || 0,
        line_total: item.line_total || item.lineTotal || 0,
        weight: item.weight || null,
        received_value: item.received_value || item.receivedValue || 0,
        notes: item.notes || null,
        updated_at: new Date().toISOString(),
        line_order: activeTab.cart.indexOf(item) + 1
      }));

      // Validate line items data before processing
      for (const item of lineItemsData) {
        if (!item.product_id || (typeof item.product_id !== 'string' && typeof item.product_id !== 'number')) {
          throw new Error(`Invalid product_id in cart item: ${item.product_id}. Product ID must be a string or number.`);
        }
        if (!item.quantity || item.quantity <= 0) {
          throw new Error(`Invalid quantity in cart item: ${item.quantity}. Quantity must be a positive number.`);
        }
      }

      // Prepare customer/supplier balance update if needed
      let customerBalanceUpdate = null;
      if (activeTab.paymentMethod === 'credit' || amountDue > 0) {
        // First try to find as customer
        let entity = customers.find(c => c.id === activeTab.selectedCustomer);
        let entityType = 'customer';
        
        // If not found as customer, try as supplier
        if (!entity) {
          entity = suppliers.find(s => s.id === activeTab.selectedCustomer);
          entityType = 'supplier';
        }
        
        if (entity) {
          // customerBalanceUpdate is still passed for bill creation, but balance updates are now handled by journal entries
          customerBalanceUpdate = {
            customerId: entity.id,
            amountDue: amountDue,
            originalBalance: 0  // Not used anymore - balances calculated from journal entries
          };
        }
      }

      // Use offline-first bill creation from OfflineDataContext
      const billId = await raw.createBill(billData, lineItemsData, customerBalanceUpdate || undefined);

      // The sale is now handled entirely through the bill creation above
      // No need for separate sale_items creation since bill_line_items now contains all sale data
      // Inventory deductions and cash drawer updates are handled in the createBill function

      // Generate QR code for customer account statement if a customer is selected
      // IMPORTANT: Tokens are only valid for real customers (public_access_tokens.customer_id FK)
      let qrCodeData = null;
      if (activeTab.selectedCustomer) {
        try {
          // First try to find as customer
          const customerEntity = customers.find(c => c.id === activeTab.selectedCustomer);

          if (customerEntity) {
            // Don't pass billId since bill is only local at this point (not synced to Supabase yet)
            // Token will give the customer access to their full statement
            qrCodeData = await generateQRCodeForReceipt(
              customerEntity.id,
              null, // Bill not in Supabase yet - use customer-level token
              billData.bill_number,
              customerEntity.name
            );
          } else {
            // Selected entity is not a customer (likely a supplier) -> skip QR token generation
            console.log('Skipping QR token generation: selected entity is not a customer');
          }
        } catch (qrError) {
          console.warn('Failed to generate QR code:', qrError);
          // Don't fail the entire transaction if QR code generation fails
        }
      }

      // Print receipt after successful bill creation
      // First try to find as customer
      let entity = customers.find(c => c.id === activeTab.selectedCustomer);
      
      // If not found as customer, try as supplier
      if (!entity) {
        entity = suppliers.find(s => s.id === activeTab.selectedCustomer);
      }
      
      await printReceipt(billData, lineItemsData, entity, qrCodeData);
      
      // Also download receipt for preview/testing

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
      showToast('success', `${t('common.labels.saleCompletedSuccessfully')}! ${t('common.labels.billCreatedAndReceiptPrinted')}.`);
    } catch (error) {
      console.error('Sale processing error:', error);
      showToast('error', `${t('common.labels.saleFailed')}: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
    setIsProcessing(false);
  };

  // Add customer form handlers are centralized in the Customers page via CustomerFormContext
  
  // Guard: return early if no active tab exists (after all hooks have been called)
  if (!activeTab) {
    return null;
  }

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

      {/* Add spinner overlay for isProcessing, isPrinting, or loading.products */}
      {(isProcessing || isPrinting || raw.loading.products) && (
        <div className="fixed inset-0 bg-black bg-opacity-20 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg p-6 flex flex-col items-center space-y-4">
            <div className="w-16 h-16 border-4 border-blue-500 border-t-transparent rounded-full animate-spin"></div>
            <div className="text-center">
              <p className="text-lg font-medium text-gray-900">
                {isProcessing ? 'Processing Sale...' : isPrinting ? 'Printing Receipt...' : 'Loading...'}
              </p>
              {isPrinting && (
                <p className="text-sm text-gray-600 mt-1">Please wait while your receipt is being printed</p>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Cash Drawer Opening Modal */}
      <CashDrawerOpeningModal
        isOpen={showCashDrawerModal}
        onClose={() => {
          setShowCashDrawerModal(false);
          setPendingCashDrawerOpening(null);
          setIsProcessing(false);
        }}
        onConfirm={handleCashDrawerModalConfirm}
        suggestedAmount={recommendedDrawerAmount}
        title="Open Cash Drawer"
        description="The cash drawer is closed. Please enter the opening cash amount."
      />

      {/* Add toast display at top right */}
      {toast && (
        <div className={`fixed top-4 right-4 px-4 py-2 rounded shadow-lg z-50 text-white ${toast.type === 'success' ? 'bg-green-600' : 'bg-red-600'}`}>{toast.message}</div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-7 gap-6">
        {/* Product Selection */}
        <div className="lg:col-span-5 space-y-6">
          {/* Search */}
          <div className="bg-white p-4 rounded-lg shadow-sm">
            <div className="relative">
              <Search className="w-5 h-5 absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400" />
              <input
                type="text"
                placeholder={t('common.placeholders.searchProducts')}
                value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500" ref={searchInputRef} tabIndex={1} accessKey="f" aria-label={t('common.labels.searchProductsOrSuppliers')} />
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
        <div className="lg:col-span-2 space-y-6">
          {/* Cart */}
          <Cart
            activeTab={activeTab} 
            updateCartItem={updateCartItem} 
            removeFromCart={removeFromCart} 
            formatCurrency={formatCurrency} 
            inventory={inventory}
            products={products}
            suppliers={suppliers}
          />

          {/* Totals and Payment */}
          {activeTab?.cart?.length > 0 && (
            <div className="bg-white rounded-lg shadow-sm p-4 space-y-4">
              <div className="space-y-2">

                <div className="flex justify-between font-semibold border-t pt-2">
                  <span>{t('common.labels.total')}:</span>
                  <span>{formatCurrency(total)}</span>
                </div>
              </div>

              {/* Customer Selection (moved here) */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                 {t("payments.customer")} {(activeTab.paymentMethod === 'credit' || ((activeTab.paymentMethod === 'cash' || activeTab.paymentMethod === 'card') && parseFloat(activeTab.amountReceived || '0') < total)) ? <span className="text-red-500">*</span> : null}
                </label>
                <div ref={customerSelectRef}>
                  <SearchableSelect
                  options={
                    activeTab.paymentMethod === 'credit'
                      ? [
                          ...customers.filter(c => c.isActive).map(customer => ({
                            id: customer.id,
                            label: customer.name,
                            value: customer.id,
                            category: 'Customer'
                          })),
                          ...suppliers.map(supplier => ({
                            id: supplier.id,
                            label: supplier.name,
                            value: supplier.id,
                            category: 'Supplier'
                          }))
                        ]
                      : [
                          { id: '', label: `${t('common.labels.walkInCustomer')}`, value: '', category: 'Customer' },
                          ...customers.filter(c => c.isActive).map(customer => ({
                            id: customer.id,
                            label: customer.name,
                            value: customer.id,
                            category: 'Customer'
                          })),
                          ...suppliers.map(supplier => ({
                            id: supplier.id,
                            label: supplier.name,
                            value: supplier.id,
                            category: 'Supplier'
                          }))
                        ]
                  }
                  value={activeTab.selectedCustomer}
                  onChange={(value) => {
                    updateActiveTab({ selectedCustomer: value as string });
                    setCustomerError(null);
                  }}
                  searchPlaceholder={t("pos.searchCustomers")}
                  placeholder={activeTab.paymentMethod === 'credit' ? t("common.labels.selectCustomer") : t("common.labels.walkInCustomer")}

                  recentSelections={recentCustomers}
                  onRecentUpdate={setRecentCustomers}
                  showAddOption={true}
                  addOptionText={t("common.labels.addNewCustomerSupplier")}
                  onAddNew={() => {
                    // Signal Customers page to open its add-customer form, then navigate there
                    requestAddCustomerFromPOS();
                    navigate('/accounts');
                  }}
                  className={`w-full ${customerError ? 'border border-red-500' : ''}`}
                  tabIndex={10000}
                  />
                </div>
                {customerError && (
                  <p className="text-xs text-red-600 mt-1" role="alert">{customerError}</p>
                )}
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  {t('common.labels.paymentMethod')}
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
                    tabIndex={10001}
                    accessKey="1"
                    aria-label={t('common.labels.cashPayment')}
                  >
                    <DollarSign className="w-4 h-4 mx-auto mb-1" />
                    {t('common.labels.cash')}
                  </button>
                  <button
                    type="button"
                    onClick={() => updateActiveTab({ paymentMethod: 'card' })}
                    className={`p-3 text-xs rounded-lg border transition-all duration-200 focus:outline-none focus:ring-2 focus:ring-blue-500 min-h-[48px] ${
                      activeTab.paymentMethod === 'card' 
                        ? 'bg-blue-50 border-blue-500 text-blue-700' 
                        : 'bg-gray-50 border-gray-300'
                    }`}
                    tabIndex={10002}
                    aria-label={t('common.labels.cardPayment')}
                  >
                    <CreditCard className="w-4 h-4 mx-auto mb-1" />
                    {t('common.labels.card')}
                  </button>
                  <button
                    type="button"
                    onClick={() => updateActiveTab({ paymentMethod: 'credit' })}
                    className={`p-3 text-xs rounded-lg border transition-all duration-200 focus:outline-none focus:ring-2 focus:ring-blue-500 min-h-[48px] ${
                      activeTab.paymentMethod === 'credit' 
                        ? 'bg-blue-50 border-blue-500 text-blue-700' 
                        : 'bg-gray-50 border-gray-300'
                    }`}
                    tabIndex={10003}
                    accessKey="2"
                    aria-label={`${t('common.labels.creditPayment')} (Ctrl+2)`}
                  >
                    <User className="w-4 h-4 mx-auto mb-1" />
                    {t('common.labels.credit')}
                  </button>
                </div>
              </div>

              {activeTab.paymentMethod !== 'credit' && (
                // Only show Amount Received for cash or card
                (activeTab.paymentMethod === 'cash' || activeTab.paymentMethod === 'card') && (
                  <div>
                    <MoneyInput
                      label={t('common.labels.amountReceived')}
                      value={activeTab.amountReceived}
                      onChange={(value) => updateActiveTab({ amountReceived: value })}
                      placeholder={t('common.placeholders.amountReceived')}
                      step="1000"
                      min="0"
                      autoCompleteValue={total}
                      className="focus:ring-2 focus:ring-blue-500"
                      tabIndex={10004}
                    />
                    <input
                      ref={amountInputRef}
                      type="hidden"
                      tabIndex={-1}
                      onFocus={() => {
                        // Focus the actual MoneyInput when this hidden input is focused
                        const moneyInput = amountInputRef.current?.parentElement?.querySelector('input[type="text"]') as HTMLInputElement;
                        moneyInput?.focus();
                      }}
                    />
                    {change > 0 && (
                      <p className="text-sm text-green-600 mt-1">
                        {t('common.labels.change')}: {formatCurrency(change)}
                      </p>
                    )}
                  </div>
                )
              )}

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  {t('common.labels.notes')} ({t('common.placeholders.optional')})
                </label>
                <textarea
                  value={activeTab.notes}
                  onChange={(e) => updateActiveTab({ notes: e.target.value })}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  rows={2}
                  placeholder={t('common.placeholders.addNotes')}
                  tabIndex={10005}
                />
              </div>
 {/* Fixed Complete Sale Button at Bottom of Cart */}
 <div className="sticky bottom-0 bg-white p-4 shadow-md space-y-2">
      <AccessibleButton
        ref={completeSaleRef}
        onClick={handleCheckout}
        disabled={  
          isProcessing ||
          isPrinting ||
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
        loading={isProcessing || isPrinting}
        shortcut="Ctrl+Enter"
        ariaLabel={t('common.labels.completeSale')}
        tabIndex={10006}
        className="w-full"
      >
        {t('common.labels.completeSale')}
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
  const { formatCurrency } = useCurrency();
  const [showSalePrice, setShowSalePrice] = useState<{ [key: string]: boolean }>({});

  const handleLongPress = (_e: React.MouseEvent | React.TouchEvent, inventoryItemId: string, sellingPrice?: number) => {
    if (sellingPrice && sellingPrice > 0) {
      const timer = setTimeout(() => {
        setShowSalePrice(prev => ({
          ...prev,
          [inventoryItemId]: true
        }));
      }, 500); // 500ms long press

      const handleMouseUp = () => {
        clearTimeout(timer);
        document.removeEventListener('mouseup', handleMouseUp);
      };

      document.addEventListener('mouseup', handleMouseUp);
    }
  };

  const handleTouchStart = (_e: React.TouchEvent, inventoryItemId: string, sellingPrice?: number) => {
    if (sellingPrice && sellingPrice > 0) {
      const timer = setTimeout(() => {
        setShowSalePrice(prev => ({
          ...prev,
          [inventoryItemId]: true
        }));
      }, 500); // 500ms long press

      const handleTouchEnd = () => {
        clearTimeout(timer);
        document.removeEventListener('touchend', handleTouchEnd);
      };

      document.addEventListener('touchend', handleTouchEnd);
    }
  };

  const hideSalePrice = (inventoryItemId: string) => {
    setShowSalePrice(prev => ({
      ...prev,
      [inventoryItemId]: false
    }));
  };

  // Hide all sale prices when clicking outside
  React.useEffect(() => {
    const handleClickOutside = () => {
      setShowSalePrice({});
    };

    document.addEventListener('click', handleClickOutside);
    return () => document.removeEventListener('click', handleClickOutside);
  }, []);

  return (
    <div className="bg-white rounded-lg shadow-sm border border-gray-200">
      {/* Enhanced Product Grid */}
      <div className="p-3">
        <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 xl:grid-cols-8 gap-3">
          {(filteredProducts || []).map((product: any) => {
            const stock = getProductStock(product.id);
            const productInventoryItems = getProductInventoryItems(product.id) || [];

            return (
              <EnhancedProductCard
                key={product.id}
                product={product}
                inventoryItems={productInventoryItems}
                stock={stock}
                showSalePrice={showSalePrice}
                addToCart={addToCart}
                handleLongPress={handleLongPress}
                handleTouchStart={handleTouchStart}
                hideSalePrice={hideSalePrice}
                formatCurrency={formatCurrency}
              />
            );
          })}
        </div>
      </div>
    </div>
  );
};
const Cart = ({ activeTab, updateCartItem, removeFromCart, formatCurrency, inventory, products, suppliers }: any) => {
  const { t } = useI18n();
  const { getProductName } = useProductMultilingual();
  return (
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






      </div>


    {/* Enhanced Cart Items */}
    <div className="flex-1 overflow-y-auto min-h-0">
      {(activeTab?.cart || []).length > 0 ? (
        <div className="divide-y divide-gray-100">
          {(activeTab?.cart || []).map((item: any, index: number)  => {
            const inventoryItem = inventory.find((inv: any) => inv.id === item.inventoryItemId);
            const availableStock = inventoryItem ? inventoryItem.quantity : 0;
            const product = products.find((p: any) => p.id === item.productId);
            const supplier = suppliers?.find((s: any) => s.id === item.supplierId);
            
            // Skip rendering if product not found (data might be syncing)
            if (!product) {
              console.warn('Product not found for cart item:', item.productId);
              return null;
            }
            
            const productName = getProductName(product);
            return (
              <div key={item.id} className="p-4 hover:bg-gray-50 transition-colors duration-150">
                {/* Product Header */}
                <div className="flex items-start justify-between mb-3">
                  <div className="flex-1">
                    <div className="flex items-center space-x-2 mb-1">
                      <h4 className="font-semibold text-gray-900 text-base">{productName || 'Unknown Product'}</h4>
                      <span className="px-2 py-1 bg-blue-100 text-blue-800 text-xs rounded-full font-medium">
                        #{index + 1}
                      </span>
                    </div>
                    <p className="text-sm text-gray-600 flex items-center">
                      <span className="w-2 h-2 bg-green-400 rounded-full mr-2"></span>
                      {supplier?.name || 'Unknown Supplier'}
                    </p>

                  </div>
                  <AccessibleButton
                    onClick={() => removeFromCart(item.id)}
                    variant="ghost"
                    size="sm"
                    className="text-red-500 hover:text-red-700 hover:bg-red-50 p-2 rounded-lg transition-colors duration-150 min-h-[44px]"
                    ariaLabel={`Remove ${productName || 'item'} from cart`}
                    tabIndex={-1}
                  >
                    <Trash2 className="w-4 h-4" />
                  </AccessibleButton>
                </div>

                {/* Enhanced Input Grid */}
                <div className="grid grid-cols-2 md:grid-cols-[2fr_2fr_3fr_3fr] gap-3">
                  {/* Quantity */}
                  <div className="space-y-1">
                    <label className="text-xs font-medium text-gray-700 uppercase tracking-wide">{t('common.labels.quantity')}</label>
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
                        aria-label={`Quantity for ${productName || 'product'}`}
                      />
                      <div className="absolute right-2 top-1/2 transform -translate-y-1/2 text-xs text-gray-400">
                        {item.quantity===''? t('common.labels.units') : ''}
                      </div>
                    </div>
                  </div>

                  {/* Weight */}
                  <div className="space-y-1">
                    <label className="text-xs font-medium text-gray-700 uppercase tracking-wide">{t('common.labels.weight')}</label>
                    <div className="relative">
                      <input
                        type="number"
                        step="0.5"
                        min="0"
                        value={item.weight ?? ''}
                        onChange={(e) => updateCartItem(item.id, 'weight', e.target.value ? parseFloat(e.target.value) : undefined)}
                        className={`w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 min-h-[44px] ${
                          productName.toLowerCase().includes('plastic') 
                            ? 'bg-gray-100 text-gray-400 cursor-not-allowed' 
                            : 'bg-white'
                        }`}
                        placeholder="0.00"
                        disabled={productName.toLowerCase()==='plastic'}
                        tabIndex={200 + index * 4 + 2}
                        aria-label={`Weight for ${productName || 'product'}`}
                      />
                      <div className="absolute right-2 top-1/2 transform -translate-y-1/2 text-xs text-gray-400">
                        {item.weight===''? t('common.labels.kg') : ''}
                      </div>
                    </div>
                  </div>

                  {/* Unit Price */}
                  <div className="space-y-1">
                    <label className="text-xs font-medium text-gray-700 uppercase tracking-wide">{t('common.labels.unitPrice')}</label>
                    <MoneyInput
                      step='1000'
                      min="0"
                      value={item.unitPrice ?? ''}
                      onChange={(value) => updateCartItem(item.id, 'unitPrice', value ? parseFloat(value) : undefined)}
                      className="w-full border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 min-h-[44px] bg-white px-0 py-0 mb-0"
                      placeholder="0.00"
                      tabIndex={200 + index * 4 + 3}
                      ariaLabel={`Price for ${productName || 'product'}`}
                    />
                  </div>

                  {/* Total Price */}
                  <div className="space-y-1">
                    <label className="text-xs font-medium text-gray-700 uppercase tracking-wide">{t('common.labels.total')}</label>
                    <div
                      className="bg-gradient-to-r from-blue-50 to-indigo-50 rounded-lg border border-blue-200 focus:outline-none focus:ring-2 focus:ring-blue-500"
                      tabIndex={200 + index * 4 + 4}
                      style={{ padding: '8px'}}
                      role="status"
                        aria-label={`Total for ${productName || 'product'} is ${formatCurrency(item.lineTotal)}`}
                    >
                      <div className="text-lg font-bold text-blue-700 text-center" aria-hidden="true" style={{ height: '26.4px' }}>
                        {formatCurrency(item.lineTotal)}
                      </div>
                    </div>
                  </div>


              </div>
            </div>
            );
          })}
        </div>
      ) : (
        <div className="flex-1 flex items-center justify-center p-12 text-center text-gray-500">
          <div>
            <div className="bg-gray-100 w-24 h-24 rounded-full flex items-center justify-center mx-auto mb-6">
              <ShoppingCart className="w-12 h-12 text-gray-400" />
            </div>
            <h3 className="text-xl font-medium text-gray-900 mb-3">{t('common.labels.yourCartIsEmpty')}</h3>
            <p className="text-gray-600 text-lg">{t('common.labels.startAddingProductsToBeginYourSale')}</p>
          </div>


        </div>
      )}
    </div>
  </div>
);}
