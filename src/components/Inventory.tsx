import React, { useState, useRef, useEffect } from 'react';
import { useData } from '../contexts/DataContext';
import { useAuth } from '../contexts/AuthContext';
import SearchableSelect from './common/SearchableSelect';
import { useLocalStorage } from '../hooks/useLocalStorage';
import { Plus, Search, Package, Truck, Eye, Camera, RotateCcw, X, Upload } from 'lucide-react';

export default function Inventory() {
  const { products, suppliers, inventory, stockLevels, addInventoryItem, addSupplier, addProduct, lowStockAlertsEnabled, lowStockThreshold, defaultCommissionRate } = useData();
  const { user } = useAuth();
  const [recentProducts, setRecentProducts] = useLocalStorage<string[]>('inventory_recent_products', []);
  const [recentSuppliers, setRecentSuppliers] = useLocalStorage<string[]>('inventory_recent_suppliers', []);
  const [activeTab, setActiveTab] = useState<'receive' | 'stock'>('receive');
  const [showReceiveForm, setShowReceiveForm] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [showAddProductForm, setShowAddProductForm] = useState(false);
  const [showAddSupplierForm, setShowAddSupplierForm] = useState(false);

  const [productForm, setProductForm] = useState({
    name: '',
    category: 'Fruits' as 'Fruits' | 'Vegetables',
    image: '',
    capturedPhoto: ''
  });

  // Camera states
  const [isCameraActive, setIsCameraActive] = useState(false);
  const [cameraError, setCameraError] = useState('');
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const streamRef = useRef<MediaStream | null>(null);

  // Cleanup camera stream when component unmounts or modal closes
  useEffect(() => {
    return () => {
      stopCamera();
    };
  }, []);

  const startCamera = async () => {
    try {
      setCameraError('');
      const stream = await navigator.mediaDevices.getUserMedia({ 
        video: { 
          width: { ideal: 640 },
          height: { ideal: 480 },
          facingMode: 'environment' // Use back camera on mobile if available
        } 
      });
      
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        streamRef.current = stream;
        setIsCameraActive(true);
      }
    } catch (error) {
      console.error('Error accessing camera:', error);
      setCameraError('Unable to access camera. Please check permissions.');
    }
  };

  const stopCamera = () => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(track => track.stop());
      streamRef.current = null;
    }
    setIsCameraActive(false);
  };

  const capturePhoto = () => {
    if (videoRef.current && canvasRef.current) {
      const canvas = canvasRef.current;
      const video = videoRef.current;
      const context = canvas.getContext('2d');
      
      if (context) {
        // Set canvas dimensions to match video
        canvas.width = video.videoWidth;
        canvas.height = video.videoHeight;
        
        // Draw the video frame to canvas
        context.drawImage(video, 0, 0, canvas.width, canvas.height);
        
        // Convert to base64 data URL (compressed JPEG)
        const dataURL = canvas.toDataURL('image/jpeg', 0.8);
        
        setProductForm(prev => ({ 
          ...prev, 
          image: dataURL,
          capturedPhoto: dataURL 
        }));
        
        stopCamera();
      }
    }
  };

  const retakePhoto = () => {
    setProductForm(prev => ({ 
      ...prev, 
      image: '',
      capturedPhoto: '' 
    }));
    startCamera();
  };

  const handleFileUpload = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) {
      // Check file size (limit to 5MB)
      if (file.size > 5 * 1024 * 1024) {
        alert('File size too large. Please choose an image under 5MB.');
        return;
      }

      // Check file type
      if (!file.type.startsWith('image/')) {
        alert('Please select a valid image file.');
        return;
      }

      const reader = new FileReader();
      reader.onload = (e) => {
        const result = e.target?.result as string;
        setProductForm(prev => ({ 
          ...prev, 
          image: result,
          capturedPhoto: '' // Clear captured photo when loading file
        }));
      };
      reader.readAsDataURL(file);
    }
    // Reset the input value so the same file can be selected again
    event.target.value = '';
  };

  const clearPhoto = () => {
    setProductForm(prev => ({ 
      ...prev, 
      image: '',
      capturedPhoto: '' 
    }));
  };

  const [supplierForm, setSupplierForm] = useState({
    name: '',
    phone: '',
    email: '',
    address: '',
    type: 'commission' as 'commission' | 'cash'
  });

  const [receiveForm, setReceiveForm] = useState({
    productId: '',
    supplierId: '',
    type: 'commission' as 'commission' | 'cash',
    quantity: '',
    unit: 'kg' as 'kg' | 'piece' | 'box' | 'bag',
    weight: '',
    porterage: '',
    transferFee: '',
    price: '',
    commissionRate: '',
    notes: ''
  });

  // Update commission rate when form opens or supplier changes
  React.useEffect(() => {
    if (receiveForm.type === 'commission' && receiveForm.supplierId) {
      // Always use the global default commission rate
      setReceiveForm(prev => ({ ...prev, commissionRate: defaultCommissionRate.toString() }));
    } else if (receiveForm.type === 'cash') {
      // Clear commission rate for cash purchases
      setReceiveForm(prev => ({ ...prev, commissionRate: '' }));
    }
  }, [receiveForm.supplierId, receiveForm.type, defaultCommissionRate]);

  const handleReceiveSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!receiveForm.productId || !receiveForm.supplierId || !receiveForm.quantity) return;

    addInventoryItem({
      productId: receiveForm.productId,
      supplierId: receiveForm.supplierId,
      type: receiveForm.type,
      quantity: parseInt(receiveForm.quantity),
      unit: receiveForm.unit,
      weight: receiveForm.weight ? parseFloat(receiveForm.weight) : undefined,
      porterage: receiveForm.porterage ? parseFloat(receiveForm.porterage) : undefined,
      transferFee: receiveForm.transferFee ? parseFloat(receiveForm.transferFee) : undefined,
      price: receiveForm.price ? parseFloat(receiveForm.price) : undefined,
      commissionRate: receiveForm.type === 'commission' && receiveForm.commissionRate ? parseFloat(receiveForm.commissionRate) : undefined,
      notes: receiveForm.notes || undefined,
      receivedBy: user?.id || ''
    });

    setReceiveForm({
      productId: '',
      supplierId: '',
      type: 'commission',
      quantity: '',
      unit: 'kg',
      weight: '',
      porterage: '',
      transferFee: '',
      price: '',
      commissionRate: '',
      notes: ''
    });
    setShowReceiveForm(false);
  };

  const handleProductSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!productForm.name || !productForm.category) return;

    addProduct({
      name: productForm.name,
      category: productForm.category,
      image: productForm.capturedPhoto || productForm.image || `https://images.pexels.com/photos/102104/pexels-photo-102104.jpeg`,
      isActive: true
    });

    stopCamera();
    setProductForm({
      name: '',
      category: 'Fruits',
      image: '',
      capturedPhoto: ''
    });
    setShowAddProductForm(false);
  };

  const handleSupplierSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!supplierForm.name || !supplierForm.phone) return;

    addSupplier({
      name: supplierForm.name,
      phone: supplierForm.phone,
      email: supplierForm.email || undefined,
      address: supplierForm.address,
      type: supplierForm.type,
      commissionRate: supplierForm.type === 'commission' ? parseFloat(supplierForm.commissionRate) || 0 : 0,
      isActive: true
    });

    setSupplierForm({
      name: '',
      phone: '',
      email: '',
      address: '',
      type: 'commission'
    });
    setShowAddSupplierForm(false);
  };

  const filteredStockLevels = stockLevels.filter(item =>
    item.productName.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const recentReceives = inventory
    .sort((a, b) => new Date(b.receivedAt).getTime() - new Date(a.receivedAt).getTime())
    .slice(0, 10);

  return (
    <div className="p-6">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-3xl font-bold text-gray-900">Inventory Management</h1>
        {activeTab === 'receive' && (
          <button
            onClick={() => setShowReceiveForm(true)}
            className="bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 transition-colors flex items-center"
          >
            <Plus className="w-5 h-5 mr-2" />
            Receive Products
          </button>
        )}
        {activeTab === 'stock' && (
          <button
            onClick={() => setShowAddProductForm(true)}
            className="bg-green-600 text-white px-4 py-2 rounded-lg hover:bg-green-700 transition-colors flex items-center"
          >
            <Plus className="w-5 h-5 mr-2" />
            Add Product
          </button>
        )}
      </div>

      {/* Tabs */}
      <div className="flex space-x-1 mb-6 bg-gray-100 p-1 rounded-lg w-fit">
        <button
          onClick={() => setActiveTab('receive')}
          className={`px-4 py-2 rounded-md transition-colors ${
            activeTab === 'receive' ? 'bg-white text-blue-600 shadow-sm' : 'text-gray-600'
          }`}
        >
          <Truck className="w-4 h-4 inline mr-2" />
          Product Reception
        </button>
        <button
          onClick={() => setActiveTab('stock')}
          className={`px-4 py-2 rounded-md transition-colors ${
            activeTab === 'stock' ? 'bg-white text-blue-600 shadow-sm' : 'text-gray-600'
          }`}
        >
          <Package className="w-4 h-4 inline mr-2" />
          Stock Levels
        </button>
      </div>

      {activeTab === 'receive' && (
        <div className="space-y-6">
          {/* Recent Receives */}
          <div className="bg-white rounded-lg shadow-sm">
            <div className="p-6 border-b">
              <h2 className="text-lg font-semibold text-gray-900">Recent Product Receives</h2>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Product</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Supplier</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Type</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Quantity</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Received</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-200">
                  {recentReceives.map((item) => {
                    const product = products.find(p => p.id === item.productId);
                    const supplier = suppliers.find(s => s.id === item.supplierId);
                    return (
                      <tr key={item.id} className="hover:bg-gray-50">
                        <td className="px-6 py-4">
                          <div className="flex items-center">
                            <img
                              src={product?.image}
                              alt={product?.name}
                              className="w-10 h-10 rounded-lg object-cover mr-3"
                            />
                            <div>
                              <p className="font-medium text-gray-900">{product?.name}</p>
                              <p className="text-sm text-gray-500">{product?.category}</p>
                            </div>
                          </div>
                        </td>
                        <td className="px-6 py-4 text-gray-900">{supplier?.name}</td>
                        <td className="px-6 py-4">
                          <span className={`px-2 py-1 text-xs rounded-full ${
                            item.type === 'commission' 
                              ? 'bg-green-100 text-green-800' 
                              : 'bg-blue-100 text-blue-800'
                          }`}>
                            {item.type}
                          </span>
                        </td>
                        <td className="px-6 py-4 text-gray-900">
                          {item.quantity} {item.unit}
                        </td>
                        <td className="px-6 py-4 text-gray-500">
                          {new Date(item.receivedAt).toLocaleDateString()}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {activeTab === 'stock' && (
        <div className="space-y-6">
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

          {/* Stock Levels */}
          <div className="bg-white rounded-lg shadow-sm">
            <div className="p-6 border-b">
              <h2 className="text-lg font-semibold text-gray-900">Current Stock Levels</h2>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Product</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Current Stock</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Suppliers</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Last Received</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-200">
                  {filteredStockLevels.map((item) => {
                    const product = products.find(p => p.id === item.productId);
                    return (
                      <tr key={item.productId} className="hover:bg-gray-50">
                        <td className="px-6 py-4">
                          <div className="flex items-center">
                            <img
                              src={product?.image}
                              alt={product?.name}
                              className="w-10 h-10 rounded-lg object-cover mr-3"
                            />
                            <div>
                              <p className="font-medium text-gray-900">{item.productName}</p>
                              <p className="text-sm text-gray-500">{product?.category}</p>
                            </div>
                          </div>
                        </td>
                        <td className="px-6 py-4">
                          <span className="font-medium text-gray-900">
                            {item.currentStock} {item.unit}
                          </span>
                        </td>
                        <td className="px-6 py-4">
                          <div className="flex flex-wrap gap-1">
                            {(item.suppliers || []).map(supplier => (
                              <span
                                key={supplier.supplierId}
                                className="px-2 py-1 bg-gray-100 text-gray-700 text-xs rounded"
                              >
                                {supplier.supplierName}: {supplier.quantity}
                              </span>
                            ))}
                          </div>
                        </td>
                        <td className="px-6 py-4 text-gray-500">
                          {item.lastReceived ? new Date(item.lastReceived).toLocaleDateString() : 'Never'}
                        </td>
                        <td className="px-6 py-4">
                          <span className={`px-2 py-1 text-xs rounded-full ${
                            item.currentStock === 0 
                              ? 'bg-red-100 text-red-800'
                              : lowStockAlertsEnabled && item.currentStock < lowStockThreshold
                              ? 'bg-amber-100 text-amber-800'
                              : 'bg-green-100 text-green-800'
                          }`}>
                            {item.currentStock === 0 
                              ? 'Out of Stock' 
                              : lowStockAlertsEnabled && item.currentStock < lowStockThreshold
                              ? 'Low Stock' 
                              : 'In Stock'}
                          </span>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* Receive Form Modal */}
      {showReceiveForm && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-lg max-w-2xl w-full max-h-[90vh] overflow-y-auto">
            <div className="p-6 border-b">
              <h2 className="text-xl font-semibold text-gray-900">Receive Products</h2>
            </div>
            <form onSubmit={handleReceiveSubmit} className="p-6 space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <SearchableSelect
                    options={products.filter(p => p.isActive).map(product => ({
                      id: product.id,
                      label: product.name,
                      value: product.id,
                      category: product.category
                    }))}
                    value={receiveForm.productId}
                    onChange={(value) => setReceiveForm(prev => ({ ...prev, productId: value as string }))}
                    placeholder="Select Product *"
                    searchPlaceholder="Search products..."
                    categories={['Fruits', 'Vegetables']}
                    recentSelections={recentProducts}
                    onRecentUpdate={setRecentProducts}
                    showAddOption={true}
                    addOptionText="Add New Product"
                    onAddNew={() => setShowAddProductForm(true)}
                    className="w-full"
                  />
                </div>

                <div>
                  <SearchableSelect
                    options={suppliers.filter(s => s.isActive).map(supplier => ({
                      id: supplier.id,
                      label: supplier.name,
                      value: supplier.id,
                      category: supplier.type === 'commission' ? 'Commission' : 'Cash'
                    }))}
                    value={receiveForm.supplierId}
                    onChange={(value) => setReceiveForm(prev => ({ ...prev, supplierId: value as string }))}
                    placeholder="Select Supplier *"
                    searchPlaceholder="Search suppliers..."
                    categories={['Commission', 'Cash']}
                    recentSelections={recentSuppliers}
                    onRecentUpdate={setRecentSuppliers}
                    showAddOption={true}
                    addOptionText="Add New Supplier"
                    onAddNew={() => setShowAddSupplierForm(true)}
                    className="w-full"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Supply Type *
                  </label>
                  <select
                    value={receiveForm.type}
                    onChange={(e) => {
                      const newType = e.target.value as 'commission' | 'cash';
                      setReceiveForm(prev => ({ 
                        ...prev, 
                        type: newType,
                        commissionRate: newType === 'commission' ? 
                          (suppliers.find(s => s.id === prev.supplierId)?.commissionRate || defaultCommissionRate).toString() : 
                          ''
                      }));
                    }}
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:ring-blue-500 focus:border-blue-500"
                  >
                    <option value="commission">Commission</option>
                    <option value="cash">Cash Purchase</option>
                  </select>
                </div>

                {receiveForm.type === 'commission' && (
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Commission Rate (%)
                    </label>
                    <input
                      type="number"
                      step="0.1"
                      min="0"
                      max="100"
                      value={receiveForm.commissionRate}
                      onChange={(e) => setReceiveForm(prev => ({ ...prev, commissionRate: e.target.value }))}
                      className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:ring-blue-500 focus:border-blue-500"
                      placeholder={`Default: ${defaultCommissionRate}%`}
                    />
                    <p className="text-xs text-gray-500 mt-1">
                      Default rate: {defaultCommissionRate}% (can be overridden or changed in Settings)
                    </p>
                  </div>
                )}

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Unit *
                  </label>
                  <select
                    value={receiveForm.unit}
                    onChange={(e) => setReceiveForm(prev => ({ ...prev, unit: e.target.value as 'kg' | 'piece' | 'box' | 'bag' }))}
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:ring-blue-500 focus:border-blue-500"
                  >
                    <option value="kg">Kilogram (kg)</option>
                    <option value="piece">Piece</option>
                    <option value="box">Box</option>
                    <option value="bag">Bag</option>
                  </select>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Quantity *
                  </label>
                  <input
                    type="number"
                    value={receiveForm.quantity}
                    onChange={(e) => setReceiveForm(prev => ({ ...prev, quantity: e.target.value }))}
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:ring-blue-500 focus:border-blue-500"
                    required
                    min="1"
                    placeholder={`Enter quantity in ${receiveForm.unit}`}
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Weight (optional)
                  </label>
                  <input
                    type="number"
                    step="0.01"
                    value={receiveForm.weight}
                    onChange={(e) => setReceiveForm(prev => ({ ...prev, weight: e.target.value }))}
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:ring-blue-500 focus:border-blue-500"
                  />
                </div>

                {receiveForm.type === 'cash' && (
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Purchase Price *
                    </label>
                    <input
                      type="number"
                      step="0.01"
                      value={receiveForm.price}
                      onChange={(e) => setReceiveForm(prev => ({ ...prev, price: e.target.value }))}
                      className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:ring-blue-500 focus:border-blue-500"
                      placeholder="Enter purchase price"
                      required
                    />
                  </div>
                )}

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Porterage Fee (optional)
                  </label>
                  <input
                    type="number"
                    step="0.01"
                    value={receiveForm.porterage}
                    onChange={(e) => setReceiveForm(prev => ({ ...prev, porterage: e.target.value }))}
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:ring-blue-500 focus:border-blue-500"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Transfer Fee (optional)
                  </label>
                  <input
                    type="number"
                    step="0.01"
                    value={receiveForm.transferFee}
                    onChange={(e) => setReceiveForm(prev => ({ ...prev, transferFee: e.target.value }))}
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:ring-blue-500 focus:border-blue-500"
                  />
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Notes (optional)
                </label>
                <textarea
                  value={receiveForm.notes}
                  onChange={(e) => setReceiveForm(prev => ({ ...prev, notes: e.target.value }))}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:ring-blue-500 focus:border-blue-500"
                  rows={3}
                />
              </div>

              <div className="flex justify-end space-x-3 pt-4">
                <button
                  type="button"
                  onClick={() => setShowReceiveForm(false)}
                  className="px-4 py-2 text-gray-700 border border-gray-300 rounded-lg hover:bg-gray-50"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
                >
                  Receive Products
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Add Product Form Modal */}
      {showAddProductForm && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-lg max-w-2xl w-full max-h-[90vh] overflow-y-auto">
            <div className="p-6 border-b">
              <h2 className="text-xl font-semibold text-gray-900">Add New Product</h2>
            </div>
            <form onSubmit={handleProductSubmit} className="p-6 space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Product Name *
                  </label>
                  <input
                    type="text"
                    value={productForm.name}
                    onChange={(e) => setProductForm(prev => ({ ...prev, name: e.target.value }))}
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:ring-blue-500 focus:border-blue-500"
                    required
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Category *
                  </label>
                  <select
                    value={productForm.category}
                    onChange={(e) => setProductForm(prev => ({ ...prev, category: e.target.value as 'Fruits' | 'Vegetables' }))}
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:ring-blue-500 focus:border-blue-500"
                  >
                    <option value="Fruits">Fruits</option>
                    <option value="Vegetables">Vegetables</option>
                  </select>
                </div>


                <div className="md:col-span-2">
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Product Photo (optional)
                  </label>
                  
                  {/* Camera Error */}
                  {cameraError && (
                    <div className="mb-3 p-3 bg-red-50 border border-red-200 rounded-lg">
                      <p className="text-sm text-red-600">{cameraError}</p>
                    </div>
                  )}
                  
                  {/* Photo Capture Interface */}
                  <div className="border border-gray-300 rounded-lg p-4">
                    {!isCameraActive && !productForm.capturedPhoto && !productForm.image && (
                      <div className="text-center">
                        <Camera className="w-12 h-12 mx-auto text-gray-400 mb-4" />
                        <div className="flex flex-col sm:flex-row gap-3 justify-center">
                          <button
                            type="button"
                            onClick={startCamera}
                            className="bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 transition-colors flex items-center justify-center"
                          >
                            <Camera className="w-4 h-4 mr-2" />
                            Take Photo
                          </button>
                          <label className="bg-green-600 text-white px-4 py-2 rounded-lg hover:bg-green-700 transition-colors flex items-center justify-center cursor-pointer">
                            <Upload className="w-4 h-4 mr-2" />
                            Load Photo
                            <input
                              type="file"
                              accept="image/*"
                              onChange={handleFileUpload}
                              className="hidden"
                            />
                          </label>
                        </div>
                      </div>
                    )}
                    
                    {isCameraActive && (
                      <div className="text-center">
                        <video
                          ref={videoRef}
                          autoPlay
                          playsInline
                          className="w-full max-w-md mx-auto rounded-lg mb-3"
                        />
                        <div className="flex justify-center space-x-3">
                          <button
                            type="button"
                            onClick={capturePhoto}
                            className="bg-green-600 text-white px-4 py-2 rounded-lg hover:bg-green-700 transition-colors flex items-center"
                          >
                            <Camera className="w-4 h-4 mr-2" />
                            Capture Photo
                          </button>
                          <button
                            type="button"
                            onClick={stopCamera}
                            className="bg-gray-600 text-white px-4 py-2 rounded-lg hover:bg-gray-700 transition-colors flex items-center"
                          >
                            <X className="w-4 h-4 mr-2" />
                            Cancel
                          </button>
                        </div>
                      </div>
                    )}
                    
                    {(productForm.capturedPhoto || productForm.image) && (
                      <div className="text-center">
                        <img
                          src={productForm.capturedPhoto || productForm.image}
                          alt="Captured product"
                          className="w-full max-w-md mx-auto rounded-lg mb-3"
                        />
                        <div className="flex flex-col sm:flex-row gap-3 justify-center">
                          <button
                            type="button"
                            onClick={retakePhoto}
                            className="bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 transition-colors flex items-center justify-center"
                          >
                            <Camera className="w-4 h-4 mr-2" />
                            Take New Photo
                          </button>
                          <label className="bg-green-600 text-white px-4 py-2 rounded-lg hover:bg-green-700 transition-colors flex items-center justify-center cursor-pointer">
                            <Upload className="w-4 h-4 mr-2" />
                            Load Different Photo
                            <input
                              type="file"
                              accept="image/*"
                              onChange={handleFileUpload}
                              className="hidden"
                            />
                          </label>
                          <button
                            type="button"
                            onClick={clearPhoto}
                            className="bg-red-600 text-white px-4 py-2 rounded-lg hover:bg-red-700 transition-colors flex items-center justify-center"
                          >
                            <X className="w-4 h-4 mr-2" />
                            Remove Photo
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              </div>

              {/* Hidden canvas for photo capture */}
              <canvas ref={canvasRef} style={{ display: 'none' }} />

              <div className="flex justify-end space-x-3 pt-4">
                <button
                  type="button"
                  onClick={() => {
                    stopCamera();
                    setShowAddProductForm(false);
                  }}
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

      {/* Add Supplier Form Modal */}
      {showAddSupplierForm && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-lg max-w-2xl w-full max-h-[90vh] overflow-y-auto">
            <div className="p-6 border-b">
              <h2 className="text-xl font-semibold text-gray-900">Add New Supplier</h2>
            </div>
            <form onSubmit={handleSupplierSubmit} className="p-6 space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Supplier Name *
                  </label>
                  <input
                    type="text"
                    value={supplierForm.name}
                    onChange={(e) => setSupplierForm(prev => ({ ...prev, name: e.target.value }))}
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:ring-blue-500 focus:border-blue-500"
                    required
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Phone *
                  </label>
                  <input
                    type="tel"
                    value={supplierForm.phone}
                    onChange={(e) => setSupplierForm(prev => ({ ...prev, phone: e.target.value }))}
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:ring-blue-500 focus:border-blue-500"
                    required
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Email
                  </label>
                  <input
                    type="email"
                    value={supplierForm.email}
                    onChange={(e) => setSupplierForm(prev => ({ ...prev, email: e.target.value }))}
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:ring-blue-500 focus:border-blue-500"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Type *
                  </label>
                  <select
                    value={supplierForm.type}
                    onChange={(e) => setSupplierForm(prev => ({ ...prev, type: e.target.value as 'commission' | 'cash' }))}
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:ring-blue-500 focus:border-blue-500"
                  >
                    <option value="commission">Commission</option>
                    <option value="cash">Cash</option>
                  </select>
                </div>

                <div className="md:col-span-2">
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Address
                  </label>
                  <textarea
                    value={supplierForm.address}
                    onChange={(e) => setSupplierForm(prev => ({ ...prev, address: e.target.value }))}
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:ring-blue-500 focus:border-blue-500"
                    rows={3}
                  />
                </div>
              </div>

              <div className="flex justify-end space-x-3 pt-4">
                <button
                  type="button"
                  onClick={() => setShowAddSupplierForm(false)}
                  className="px-4 py-2 text-gray-700 border border-gray-300 rounded-lg hover:bg-gray-50"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
                >
                  Add Supplier
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}