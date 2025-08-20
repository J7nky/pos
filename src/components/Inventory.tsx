import React, { useState } from 'react';
import { useOfflineData } from '../contexts/OfflineDataContext';
import { useSupabaseAuth } from '../contexts/SupabaseAuthContext';
import { useCurrency } from '../hooks/useCurrency';
import { useI18n } from '../i18n';
import SearchableSelect from './common/SearchableSelect';
import MoneyInput from './common/MoneyInput';
import { useLocalStorage } from '../hooks/useLocalStorage';
import { 
  Plus, 
  Package, 
  Search, 
  Edit, 
  Trash2, 
  Truck,
  AlertTriangle,
  CheckCircle,
  Clock,
  Eye,
  X
} from 'lucide-react';
import { Product, Supplier, InventoryItem } from '../types';
import Toast from './common/Toast';

export default function Inventory() {
  const raw = useOfflineData();
  const products = (raw.products || []).map(p => ({...p, createdAt: p.created_at})) as Array<any>;
  const suppliers = (raw.suppliers || []).map(s => ({...s, createdAt: s.created_at})) as Array<any>;
  const inventory = (raw.inventory || []) as Array<any>;
  const stockLevels = (raw.stockLevels || []) as Array<any>;
  const addProduct = raw.addProduct;
  const addSupplier = raw.addSupplier;
  const addInventoryItem = raw.addInventoryItem;
  const addTransaction = raw.addTransaction;
  const { userProfile } = useSupabaseAuth();
  const { formatCurrency } = useCurrency();
  const { t } = useI18n();

  const [activeTab, setActiveTab] = useState<'receive' | 'stock' | 'add-product'>('receive');
  const [showReceiveForm, setShowReceiveForm] = useState(false);
  const [showProductForm, setShowProductForm] = useState(false);
  const [editingProduct, setEditingProduct] = useState<Product | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [recentProducts, setRecentProducts] = useLocalStorage<string[]>('inventory_recent_products', []);
  const [recentSuppliers, setRecentSuppliers] = useLocalStorage<string[]>('inventory_recent_suppliers', []);

  // Receive form state
  const [receiveForm, setReceiveForm] = useState({
    productId: '',
    supplierId: '',
    type: 'commission' as 'commission' | 'cash',
    quantity: '',
    unit: 'kg' as 'kg' | 'piece' | 'box' | 'bag',
    weight: '',
    price: '',
    commissionRate: raw.defaultCommissionRate?.toString() || '10',
    porterage: '',
    transferFee: '',
    notes: ''
  });

  // Product form state
  const [productForm, setProductForm] = useState({
    name: '',
    category: 'Fruits' as 'Fruits' | 'Vegetables' | 'Herbs' | 'Grains',
    image: 'https://images.pexels.com/photos/102104/pexels-photo-102104.jpeg'
  });

  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error'; visible: boolean }>({
    message: '',
    type: 'success',
    visible: false
  });

  const showToast = (message: string, type: 'success' | 'error' = 'success') => {
    setToast({ message, type, visible: true });
  };

  const hideToast = () => setToast(t => ({ ...t, visible: false }));

  const handleReceiveFormChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => {
    const { name, value } = e.target;
    setReceiveForm(prev => ({ ...prev, [name]: value }));
  };

  const handleReceiveFormSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!receiveForm.productId || !receiveForm.supplierId || !receiveForm.quantity) {
      showToast('Please fill in all required fields', 'error');
      return;
    }

    const product = products.find(p => p.id === receiveForm.productId);
    const supplier = suppliers.find(s => s.id === receiveForm.supplierId);
    
    if (!product || !supplier) {
      showToast('Invalid product or supplier selected', 'error');
      return;
    }

    try {
      // Record the inventory item
      await addInventoryItem({
        product_id: receiveForm.productId,
        supplier_id: receiveForm.supplierId,
        type: receiveForm.type,
        quantity: parseInt(receiveForm.quantity),
        unit: receiveForm.unit,
        weight: receiveForm.weight ? parseFloat(receiveForm.weight) : null,
        porterage: receiveForm.porterage ? parseFloat(receiveForm.porterage) : null,
        transfer_fee: receiveForm.transferFee ? parseFloat(receiveForm.transferFee) : null,
        price: receiveForm.price ? parseFloat(receiveForm.price) : null,
        commission_rate: receiveForm.type === 'commission' ? parseFloat(receiveForm.commissionRate) : null,
        notes: receiveForm.notes || '',
        received_at: new Date().toISOString(),
        received_by: userProfile?.id || '',
        received_quantity: parseInt(receiveForm.quantity),
        batch_id: null
      });

      // Record porterage fee as expense if present
      if (receiveForm.porterage && parseFloat(receiveForm.porterage) > 0) {
        await addTransaction({
          type: 'expense',
          category: 'Porterage Fee',
          amount: parseFloat(receiveForm.porterage),
          currency: 'USD',
          description: `Porterage fee for ${product.name} received from ${supplier.name}`,
          reference: `PORTERAGE-${Date.now()}`,
          created_by: userProfile?.id || ''
        });
      }

      // Record transfer fee as expense if present
      if (receiveForm.transferFee && parseFloat(receiveForm.transferFee) > 0) {
        await addTransaction({
          type: 'expense',
          category: 'Transfer Fee',
          amount: parseFloat(receiveForm.transferFee),
          currency: 'USD',
          description: `Transfer fee for ${product.name} received from ${supplier.name}`,
          reference: `TRANSFER-${Date.now()}`,
          created_by: userProfile?.id || ''
        });
      }

      // Update recent selections
      setRecentProducts(prev => [receiveForm.productId, ...prev.filter(id => id !== receiveForm.productId)].slice(0, 5));
      setRecentSuppliers(prev => [receiveForm.supplierId, ...prev.filter(id => id !== receiveForm.supplierId)].slice(0, 5));

      // Reset form
      setReceiveForm({
        productId: '',
        supplierId: '',
        type: 'commission',
        quantity: '',
        unit: 'kg',
        weight: '',
        price: '',
        commissionRate: raw.defaultCommissionRate?.toString() || '10',
        porterage: '',
        transferFee: '',
        notes: ''
      });

      setShowReceiveForm(false);
      
      const feeMessage = [];
      if (receiveForm.porterage && parseFloat(receiveForm.porterage) > 0) {
        feeMessage.push(`Porterage: ${formatCurrency(parseFloat(receiveForm.porterage))}`);
      }
      if (receiveForm.transferFee && parseFloat(receiveForm.transferFee) > 0) {
        feeMessage.push(`Transfer: ${formatCurrency(parseFloat(receiveForm.transferFee))}`);
      }
      
      const successMessage = `Product received successfully!${feeMessage.length > 0 ? ` Fees recorded: ${feeMessage.join(', ')}` : ''}`;
      showToast(successMessage, 'success');

    } catch (error) {
      console.error('Error receiving product:', error);
      showToast('Failed to receive product', 'error');
    }
  };

  const handleProductFormChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    const { name, value } = e.target;
    setProductForm(prev => ({ ...prev, [name]: value }));
  };

  const handleProductFormSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!productForm.name) {
      showToast('Product name is required', 'error');
      return;
    }

    try {
      await addProduct({
        name: productForm.name,
        category: productForm.category,
        image: productForm.image
      });

      setProductForm({
        name: '',
        category: 'Fruits',
        image: 'https://images.pexels.com/photos/102104/pexels-photo-102104.jpeg'
      });

      setShowProductForm(false);
      showToast('Product added successfully!', 'success');
    } catch (error) {
      console.error('Error adding product:', error);
      showToast('Failed to add product', 'error');
    }
  };

  const filteredStockLevels = stockLevels.filter(item =>
    item.productName.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const recentInventory = inventory
    .sort((a, b) => new Date(b.received_at || b.created_at).getTime() - new Date(a.received_at || a.created_at).getTime())
    .slice(0, 10);

  const calculateTotalCost = () => {
    const price = parseFloat(receiveForm.price) || 0;
    const quantity = parseInt(receiveForm.quantity) || 0;
    const porterage = parseFloat(receiveForm.porterage) || 0;
    const transferFee = parseFloat(receiveForm.transferFee) || 0;
    
    const productCost = price * quantity;
    const totalFees = porterage + transferFee;
    const totalCost = productCost + totalFees;
    
    return { productCost, totalFees, totalCost };
  };

  const { productCost, totalFees, totalCost } = calculateTotalCost();

  return (
    <div className="p-6">
      <Toast message={toast.message} type={toast.type} visible={toast.visible} onClose={hideToast} />
      
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-3xl font-bold text-gray-900">{t('inventory.header')}</h1>
        <div className="flex space-x-2">
          <button
            onClick={() => setShowReceiveForm(true)}
            className="bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 transition-colors flex items-center"
          >
            <Truck className="w-5 h-5 mr-2" />
            {t('inventory.receiveProducts')}
          </button>
          <button
            onClick={() => setShowProductForm(true)}
            className="bg-green-600 text-white px-4 py-2 rounded-lg hover:bg-green-700 transition-colors flex items-center"
          >
            <Plus className="w-5 h-5 mr-2" />
            {t('inventory.addProduct')}
          </button>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex space-x-1 mb-6 bg-gray-100 p-1 rounded-lg w-fit">
        <button
          onClick={() => setActiveTab('receive')}
          className={`px-4 py-2 rounded-md transition-colors flex items-center ${
            activeTab === 'receive' ? 'bg-white text-blue-600 shadow-sm' : 'text-gray-600'
          }`}
        >
          <Truck className="w-4 h-4 mr-2" />
          Recent Receives
        </button>
        <button
          onClick={() => setActiveTab('stock')}
          className={`px-4 py-2 rounded-md transition-colors flex items-center ${
            activeTab === 'stock' ? 'bg-white text-blue-600 shadow-sm' : 'text-gray-600'
          }`}
        >
          <Package className="w-4 h-4 mr-2" />
          {t('inventory.stockProducts')}
        </button>
      </div>

      {/* Search */}
      {activeTab === 'stock' && (
        <div className="bg-white p-4 rounded-lg shadow-sm mb-6">
          <div className="relative">
            <Search className="w-5 h-5 absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400" />
            <input
              type="text"
              placeholder={t('inventory.searchProducts')}
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-blue-500 focus:border-blue-500"
            />
          </div>
        </div>
      )}

      {/* Recent Receives Tab */}
      {activeTab === 'receive' && (
        <div className="bg-white rounded-lg shadow-sm">
          <div className="p-6 border-b">
            <h2 className="text-lg font-semibold text-gray-900">{t('inventory.recentProductReceives')}</h2>
          </div>
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Product</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Supplier</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Type</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Quantity</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Price</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Fees</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Received</th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {recentInventory.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="px-6 py-4 text-center text-gray-500">
                      No recent receives found.
                    </td>
                  </tr>
                ) : (
                  recentInventory.map(item => {
                    const product = products.find(p => p.id === item.product_id);
                    const supplier = suppliers.find(s => s.id === item.supplier_id);
                    const totalFees = (item.porterage || 0) + (item.transfer_fee || 0);
                    
                    return (
                      <tr key={item.id}>
                        <td className="px-6 py-4 whitespace-nowrap">
                          <div className="text-sm font-medium text-gray-900">{product?.name || 'Unknown Product'}</div>
                          <div className="text-sm text-gray-500">{product?.category}</div>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap">
                          <div className="text-sm text-gray-900">{supplier?.name || 'Unknown Supplier'}</div>
                          <div className="text-sm text-gray-500">{supplier?.phone || t('inventory.noContactInfo')}</div>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap">
                          <span className={`px-2 inline-flex text-xs leading-5 font-semibold rounded-full ${
                            item.type === 'commission' ? 'bg-blue-100 text-blue-800' : 'bg-green-100 text-green-800'
                          }`}>
                            {item.type === 'commission' ? t('inventory.typeCommission') : t('inventory.typeCash')}
                          </span>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap">
                          <div className="text-sm text-gray-900">{item.quantity} {item.unit}</div>
                          {item.weight && <div className="text-sm text-gray-500">{item.weight} kg</div>}
                          <div className="text-sm text-gray-500">{item.quantity} {t('inventory.remaining')}</div>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                          {item.price ? formatCurrency(item.price) : 'N/A'}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                          {totalFees > 0 ? (
                            <div>
                              <div className="text-sm font-medium">{formatCurrency(totalFees)}</div>
                              <div className="text-xs text-gray-500">
                                {item.porterage > 0 && `Porterage: ${formatCurrency(item.porterage)}`}
                                {item.porterage > 0 && item.transfer_fee > 0 && ', '}
                                {item.transfer_fee > 0 && `Transfer: ${formatCurrency(item.transfer_fee)}`}
                              </div>
                            </div>
                          ) : (
                            <span className="text-gray-400">No fees</span>
                          )}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                          <div>{new Date(item.received_at || item.created_at).toLocaleDateString()}</div>
                          <div>{new Date(item.received_at || item.created_at).toLocaleTimeString()}</div>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Stock Levels Tab */}
      {activeTab === 'stock' && (
        <div className="bg-white rounded-lg shadow-sm">
          <div className="p-6 border-b">
            <h2 className="text-lg font-semibold text-gray-900">{t('inventory.currentStockLevels')}</h2>
          </div>
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Product</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Current Stock</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Status</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Suppliers</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Last Received</th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {filteredStockLevels.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="px-6 py-4 text-center text-gray-500">
                      No stock levels found.
                    </td>
                  </tr>
                ) : (
                  filteredStockLevels.map(item => (
                    <tr key={item.productId}>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="text-sm font-medium text-gray-900">{item.productName}</div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="text-sm text-gray-900">{item.currentStock} {item.unit}</div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <span className={`px-2 inline-flex text-xs leading-5 font-semibold rounded-full ${
                          item.currentStock === 0 
                            ? 'bg-red-100 text-red-800'
                            : item.currentStock < (raw.lowStockThreshold || 10)
                            ? 'bg-amber-100 text-amber-800'
                            : 'bg-green-100 text-green-800'
                        }`}>
                          {item.currentStock === 0 
                            ? t('inventory.outOfStock')
                            : item.currentStock < (raw.lowStockThreshold || 10)
                            ? t('inventory.lowStock')
                            : t('inventory.inStock')}
                        </span>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                        {item.suppliers.map((supplier: any) => (
                          <div key={supplier.supplierId}>
                            {supplier.supplierName}: {supplier.quantity}
                          </div>
                        ))}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                        {item.lastReceived ? new Date(item.lastReceived).toLocaleDateString() : 'Never'}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Receive Products Form Modal */}
      {showReceiveForm && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-lg max-w-4xl w-full max-h-[90vh] overflow-y-auto">
            <div className="p-6 border-b">
              <div className="flex items-center justify-between">
                <h2 className="text-xl font-semibold text-gray-900">{t('inventory.productReception')}</h2>
                <button
                  onClick={() => setShowReceiveForm(false)}
                  className="text-gray-400 hover:text-gray-600"
                >
                  <X className="w-6 h-6" />
                </button>
              </div>
            </div>
            
            <form onSubmit={handleReceiveFormSubmit} className="p-6 space-y-6">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {/* Product Selection */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">Product *</label>
                  <SearchableSelect
                    options={products.map(product => ({
                      id: product.id,
                      label: product.name,
                      value: product.id,
                      category: product.category
                    }))}
                    value={receiveForm.productId}
                    onChange={(value) => setReceiveForm(prev => ({ ...prev, productId: value as string }))}
                    placeholder="Select Product"
                    searchPlaceholder="Search products..."
                    categories={['Fruits', 'Vegetables', 'Herbs', 'Grains']}
                    recentSelections={recentProducts}
                    onRecentUpdate={setRecentProducts}
                    showAddOption={true}
                    addOptionText="Add New Product"
                    onAddNew={() => setShowProductForm(true)}
                  />
                </div>

                {/* Supplier Selection */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">Supplier *</label>
                  <SearchableSelect
                    options={suppliers.map(supplier => ({
                      id: supplier.id,
                      label: supplier.name,
                      value: supplier.id,
                      category: 'Supplier'
                    }))}
                    value={receiveForm.supplierId}
                    onChange={(value) => setReceiveForm(prev => ({ ...prev, supplierId: value as string }))}
                    placeholder="Select Supplier"
                    searchPlaceholder="Search suppliers..."
                    recentSelections={recentSuppliers}
                    onRecentUpdate={setRecentSuppliers}
                  />
                </div>

                {/* Supply Type */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">{t('inventory.supplyType')}</label>
                  <select
                    name="type"
                    value={receiveForm.type}
                    onChange={handleReceiveFormChange}
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:ring-blue-500 focus:border-blue-500"
                  >
                    <option value="commission">{t('inventory.typeCommission')}</option>
                    <option value="cash">{t('inventory.typeCash')}</option>
                  </select>
                </div>

                {/* Unit */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">{t('inventory.unitLabel')}</label>
                  <select
                    name="unit"
                    value={receiveForm.unit}
                    onChange={handleReceiveFormChange}
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:ring-blue-500 focus:border-blue-500"
                  >
                    <option value="kg">{t('common.labels.kg')}</option>
                    <option value="piece">{t('common.labels.piece')}</option>
                    <option value="box">{t('common.labels.box')}</option>
                    <option value="bag">{t('common.labels.bag')}</option>
                  </select>
                </div>

                {/* Quantity */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">{t('inventory.quantityLabel')} *</label>
                  <input
                    type="number"
                    name="quantity"
                    value={receiveForm.quantity}
                    onChange={handleReceiveFormChange}
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:ring-blue-500 focus:border-blue-500"
                    min="1"
                    required
                  />
                </div>

                {/* Weight */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">{t('inventory.weightOptional')}</label>
                  <input
                    type="number"
                    name="weight"
                    value={receiveForm.weight}
                    onChange={handleReceiveFormChange}
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:ring-blue-500 focus:border-blue-500"
                    step="0.01"
                    placeholder="kg"
                  />
                </div>

                {/* Price */}
                <div>
                  <MoneyInput
                    label="Price per Unit"
                    value={receiveForm.price}
                    onChange={(value) => setReceiveForm(prev => ({ ...prev, price: value }))}
                    placeholder="0.00"
                    step="0.01"
                    min="0"
                  />
                </div>

                {/* Commission Rate (only for commission type) */}
                {receiveForm.type === 'commission' && (
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">{t('inventory.commissionRate')} (%)</label>
                    <input
                      type="number"
                      name="commissionRate"
                      value={receiveForm.commissionRate}
                      onChange={handleReceiveFormChange}
                      className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:ring-blue-500 focus:border-blue-500"
                      min="0"
                      max="100"
                      step="0.1"
                    />
                  </div>
                )}

                {/* Porterage Fee */}
                <div>
                  <MoneyInput
                    label={t('inventory.porterageFee')}
                    value={receiveForm.porterage}
                    onChange={(value) => setReceiveForm(prev => ({ ...prev, porterage: value }))}
                    placeholder="0.00"
                    step="0.01"
                    min="0"
                  />
                </div>

                {/* Transfer Fee */}
                <div>
                  <MoneyInput
                    label={t('inventory.transferFee')}
                    value={receiveForm.transferFee}
                    onChange={(value) => setReceiveForm(prev => ({ ...prev, transferFee: value }))}
                    placeholder="0.00"
                    step="0.01"
                    min="0"
                  />
                </div>
              </div>

              {/* Cost Summary */}
              {(receiveForm.price || receiveForm.porterage || receiveForm.transferFee) && (
                <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
                  <h3 className="text-sm font-medium text-blue-900 mb-3">{t('inventory.costSummary')}</h3>
                  <div className="space-y-2 text-sm">
                    {receiveForm.price && receiveForm.quantity && (
                      <div className="flex justify-between">
                        <span className="text-blue-700">Product Cost:</span>
                        <span className="font-medium text-blue-900">{formatCurrency(productCost)}</span>
                      </div>
                    )}
                    {totalFees > 0 && (
                      <div className="flex justify-between">
                        <span className="text-blue-700">{t('inventory.additionalFees')}:</span>
                        <span className="font-medium text-blue-900">{formatCurrency(totalFees)}</span>
                      </div>
                    )}
                    {(productCost > 0 || totalFees > 0) && (
                      <div className="flex justify-between border-t border-blue-200 pt-2">
                        <span className="font-medium text-blue-700">{t('inventory.totalCost')}:</span>
                        <span className="font-bold text-blue-900">{formatCurrency(totalCost)}</span>
                      </div>
                    )}
                    {totalFees > 0 && (
                      <div className="text-xs text-blue-600 mt-2 p-2 bg-blue-100 rounded">
                        <AlertTriangle className="w-4 h-4 inline mr-1" />
                        Fees will be recorded as separate expense transactions and deducted from cash drawer.
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* Notes */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">{t('inventory.notesOptional')}</label>
                <textarea
                  name="notes"
                  value={receiveForm.notes}
                  onChange={handleReceiveFormChange}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:ring-blue-500 focus:border-blue-500"
                  rows={3}
                  placeholder="Add any notes about this receipt..."
                />
              </div>

              <div className="flex justify-end space-x-3 pt-6 border-t border-gray-200">
                <button
                  type="button"
                  onClick={() => setShowReceiveForm(false)}
                  className="px-6 py-2 text-gray-700 border border-gray-300 rounded-lg hover:bg-gray-50"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
                >
                  Receive Products
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Add Product Form Modal */}
      {showProductForm && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-lg max-w-2xl w-full max-h-[90vh] overflow-y-auto">
            <div className="p-6 border-b">
              <div className="flex items-center justify-between">
                <h2 className="text-xl font-semibold text-gray-900">{t('inventory.addNewProductTitle')}</h2>
                <button
                  onClick={() => setShowProductForm(false)}
                  className="text-gray-400 hover:text-gray-600"
                >
                  <X className="w-6 h-6" />
                </button>
              </div>
              <p className="text-gray-600 mt-2">{t('inventory.addNewProductDesc')}</p>
            </div>
            
            <form onSubmit={handleProductFormSubmit} className="p-6 space-y-4">
              <div>
                <label htmlFor="product-name" className="block text-sm font-medium text-gray-700">{t('inventory.productName')} *</label>
                <input
                  type="text"
                  id="product-name"
                  name="name"
                  value={productForm.name}
                  onChange={handleProductFormChange}
                  className="mt-1 block w-full border border-gray-300 rounded-md shadow-sm py-2 px-3 focus:outline-none focus:ring-blue-500 focus:border-blue-500"
                  required
                />
              </div>
              
              <div>
                <label htmlFor="product-category" className="block text-sm font-medium text-gray-700">{t('inventory.category')} *</label>
                <select
                  id="product-category"
                  name="category"
                  value={productForm.category}
                  onChange={handleProductFormChange}
                  className="mt-1 block w-full border border-gray-300 rounded-md shadow-sm py-2 px-3 focus:outline-none focus:ring-blue-500 focus:border-blue-500"
                  required
                >
                  <option value="Fruits">{t('inventory.categoryFruits')}</option>
                  <option value="Vegetables">{t('inventory.categoryVegetables')}</option>
                  <option value="Herbs">{t('inventory.categoryHerbs')}</option>
                  <option value="Grains">{t('inventory.categoryGrains')}</option>
                </select>
              </div>

              <div>
                <label htmlFor="product-image" className="block text-sm font-medium text-gray-700">{t('inventory.productPhotoOptional')}</label>
                <input
                  type="url"
                  id="product-image"
                  name="image"
                  value={productForm.image}
                  onChange={handleProductFormChange}
                  className="mt-1 block w-full border border-gray-300 rounded-md shadow-sm py-2 px-3 focus:outline-none focus:ring-blue-500 focus:border-blue-500"
                  placeholder="https://images.pexels.com/..."
                />
              </div>

              <div className="flex justify-end space-x-3 pt-4">
                <button
                  type="button"
                  onClick={() => setShowProductForm(false)}
                  className="px-4 py-2 text-gray-700 border border-gray-300 rounded-lg hover:bg-gray-50"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700"
                >
                  Add Product
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}