import React, { useState, useRef, useEffect } from 'react';
import { useOfflineData } from '../contexts/OfflineDataContext';
import { useSupabaseAuth } from '../contexts/SupabaseAuthContext';
import SearchableSelect from './common/SearchableSelect';
import { useLocalStorage } from '../hooks/useLocalStorage';
import { Plus, Search, Package, Truck, Eye, Camera, RotateCcw, X, Upload } from 'lucide-react';
import { SupabaseService } from '../services/supabaseService';
import { db } from '../lib/db';

// Debounce hook
function useDebounce(value: string, delay: number) {
  const [debouncedValue, setDebouncedValue] = useState(value);
  useEffect(() => {
    const handler = setTimeout(() => setDebouncedValue(value), delay);
    return () => clearTimeout(handler);
  }, [value, delay]);
  return debouncedValue;
}

// Move modal components outside of main component to prevent recreation on each render
const ReceiveFormModal = ({ open, onClose, onSuccess, products, suppliers, userProfile, defaultCommissionRate, recentProducts, setRecentProducts, recentSuppliers, setRecentSuppliers, form, setForm, errors, setErrors }: any) => {
  const [loading, setLoading] = useState(false);
  const firstInputRef = useRef<HTMLInputElement>(null);
  useEffect(() => { if (open && firstInputRef.current) firstInputRef.current.focus(); }, [open]);
  useEffect(() => {
    const handleEsc = (e: KeyboardEvent) => { if (e.key === 'Escape' && open) onClose(); };
    window.addEventListener('keydown', handleEsc);
    return () => window.removeEventListener('keydown', handleEsc);
  }, [open, onClose]);
  const validate = () => {
    const errors: any = {};
    if (!form.product_id) errors.product_id = 'Product is required.';
    if (!form.supplier_id) errors.supplier_id = 'Supplier is required.';
    if (!form.quantity || isNaN(Number(form.quantity)) || Number(form.quantity) < 1) errors.quantity = 'Quantity must be at least 1.';
    if (form.type === 'commission' && (form.commission_rate === '' || isNaN(Number(form.commission_rate)))) errors.commission_rate = 'Commission rate is required.';
    if (form.type === 'cash' && (form.price === '' || isNaN(Number(form.price)))) errors.price = 'Purchase price is required.';
    return errors;
  };
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const errs = validate();
    setErrors(errs);
    if (Object.keys(errs).length > 0) return;
    setLoading(true);
    try {
      await onSuccess({
        product_id: form.product_id,
        supplier_id: form.supplier_id,
        type: form.type,
        quantity: parseInt(form.quantity),
        unit: form.unit,
        weight: form.weight ? parseFloat(form.weight) : undefined,
        porterage: form.porterage ? parseFloat(form.porterage) : undefined,
        transfer_fee: form.transfer_fee ? parseFloat(form.transfer_fee) : undefined,
        price: form.price ? parseFloat(form.price) : undefined,
        commission_rate: form.type === 'commission' && form.commission_rate ? parseFloat(form.commission_rate) : undefined,
        notes: form.notes || undefined,
        received_by: userProfile?.id || ''
      });
      // Reset form after successful submission
      setForm({
        product_id: '',
        supplier_id: '',
        type: 'commission',
        quantity: '',
        unit: 'kg',
        weight: '',
        porterage: '',
        transfer_fee: '',
        price: '',
        commission_rate: '',
        notes: ''
      });
      setErrors({});
      onClose();
    } catch {
      setErrors({ form: 'Failed to receive inventory.' });
    }
    setLoading(false);
  };
  if (!open) return null;
  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
      <div className="bg-white rounded-lg max-w-2xl w-full max-h-[90vh] overflow-y-auto">
        <div className="p-6 border-b">
          <h2 className="text-xl font-semibold text-gray-900">Receive Products</h2>
        </div>
        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          <input ref={firstInputRef} style={{ position: 'absolute', left: '-9999px', width: 0, height: 0, opacity: 0 }} tabIndex={-1} />
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <SearchableSelect
                options={products.filter((p: any) => p.is_active).map((product: any) => ({
                  id: product.id,
                  label: product.name,
                  value: product.id,
                  category: product.category
                }))}
                value={form.product_id}
                onChange={(value: any) => setForm({ ...form, product_id: value })}
                placeholder="Select Product *"
                searchPlaceholder="Search products..."
                categories={['Fruits', 'Vegetables']}
                recentSelections={recentProducts}
                onRecentUpdate={setRecentProducts}
                showAddOption={true}
                addOptionText="Add New Product"
                className={`w-full ${errors.product_id ? 'border-red-500' : ''}`}
              />
              {errors.product_id && <p className="text-xs text-red-600 mt-1">{errors.product_id}</p>}
            </div>
            <div>
              <SearchableSelect
                options={suppliers.filter((s: any) => s.is_active).map((supplier: any) => ({
                  id: supplier.id,
                  label: supplier.name,
                  value: supplier.id,
                  category: supplier.type === 'commission' ? 'Commission' : 'Cash'
                }))}
                value={form.supplier_id}
                onChange={(value: any) => setForm({ ...form, supplier_id: value })}
                placeholder="Select Supplier *"
                searchPlaceholder="Search suppliers..."
                categories={['Commission', 'Cash']}
                recentSelections={recentSuppliers}
                onRecentUpdate={setRecentSuppliers}
                showAddOption={true}
                addOptionText="Add New Supplier"
                className={`w-full ${errors.supplier_id ? 'border-red-500' : ''}`}
              />
              {errors.supplier_id && <p className="text-xs text-red-600 mt-1">{errors.supplier_id}</p>}
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Supply Type *</label>
              <select
                value={form.type}
                onChange={(e) => setForm({ ...form, type: e.target.value })}
                className="w-full border border-gray-300 rounded-lg px-3 py-2"
              >
                <option value="commission">Commission</option>
                <option value="cash">Cash Purchase</option>
              </select>
            </div>
            {form.type === 'commission' && (
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Commission Rate (%)</label>
                <input
                  type="number"
                  step="0.1"
                  min="0"
                  max="100"
                  value={form.commission_rate}
                  onChange={(e) => setForm({ ...form, commission_rate: e.target.value })}
                  className={`w-full border ${errors.commission_rate ? 'border-red-500' : 'border-gray-300'} rounded-lg px-3 py-2`}
                  placeholder={`Default: ${defaultCommissionRate}%`}
                />
                {errors.commission_rate && <p className="text-xs text-red-600 mt-1">{errors.commission_rate}</p>}
              </div>
            )}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Unit *</label>
              <select
                value={form.unit}
                onChange={(e) => setForm({ ...form, unit: e.target.value })}
                className="w-full border border-gray-300 rounded-lg px-3 py-2"
              >
                <option value="kg">Kilogram (kg)</option>
                <option value="piece">Piece</option>
                <option value="box">Box</option>
                <option value="bag">Bag</option>
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Quantity *</label>
              <input
                type="number"
                value={form.quantity}
                onChange={(e) => setForm({ ...form, quantity: e.target.value })}
                className={`w-full border ${errors.quantity ? 'border-red-500' : 'border-gray-300'} rounded-lg px-3 py-2`}
                required
                min="1"
                placeholder={`Enter quantity in ${form.unit}`}
              />
              {errors.quantity && <p className="text-xs text-red-600 mt-1">{errors.quantity}</p>}
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Weight (optional)</label>
              <input
                type="number"
                step="0.01"
                value={form.weight}
                onChange={(e) => setForm({ ...form, weight: e.target.value })}
                className="w-full border border-gray-300 rounded-lg px-3 py-2"
              />
            </div>
            {form.type === 'cash' && (
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Purchase Price *</label>
                <input
                  type="number"
                  step="0.01"
                  value={form.price}
                  onChange={(e) => setForm({ ...form, price: e.target.value })}
                  className={`w-full border ${errors.price ? 'border-red-500' : 'border-gray-300'} rounded-lg px-3 py-2`}
                  placeholder="Enter purchase price"
                  required
                />
                {errors.price && <p className="text-xs text-red-600 mt-1">{errors.price}</p>}
              </div>
            )}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Porterage Fee (optional)</label>
              <input
                type="number"
                step="0.01"
                value={form.porterage}
                onChange={(e) => setForm({ ...form, porterage: e.target.value })}
                className="w-full border border-gray-300 rounded-lg px-3 py-2"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Transfer Fee (optional)</label>
              <input
                type="number"
                step="0.01"
                value={form.transfer_fee}
                onChange={(e) => setForm({ ...form, transfer_fee: e.target.value })}
                className="w-full border border-gray-300 rounded-lg px-3 py-2"
              />
            </div>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">Notes (optional)</label>
            <textarea
              value={form.notes}
              onChange={(e) => setForm({ ...form, notes: e.target.value })}
              className="w-full border border-gray-300 rounded-lg px-3 py-2"
              rows={3}
            />
          </div>
          {errors.form && <p className="text-xs text-red-600 mt-1">{errors.form}</p>}
          <div className="flex justify-end space-x-3 pt-4">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-gray-700 border border-gray-300 rounded-lg hover:bg-gray-50"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
              disabled={loading}
            >
              {loading ? 'Receiving...' : 'Receive Products'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

const AddProductModal = ({ open, onClose, onSuccess }: any) => {
  const [form, setForm] = useState({
    name: '',
    category: 'Fruits',
    image: '',
    capturedPhoto: ''
  });
  const [errors, setErrors] = useState<any>({});
  const [loading, setLoading] = useState(false);
  const firstInputRef = useRef<HTMLInputElement>(null);
  useEffect(() => { if (open && firstInputRef.current) firstInputRef.current.focus(); }, [open]);
  useEffect(() => {
    const handleEsc = (e: KeyboardEvent) => { if (e.key === 'Escape' && open) onClose(); };
    window.addEventListener('keydown', handleEsc);
    return () => window.removeEventListener('keydown', handleEsc);
  }, [open, onClose]);
  const validate = () => {
    const errors: any = {};
    if (!form.name) errors.name = 'Product name is required.';
    if (!form.category) errors.category = 'Category is required.';
    return errors;
  };
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const errs = validate();
    setErrors(errs);
    if (Object.keys(errs).length > 0) return;
    setLoading(true);
    try {
      await onSuccess({
        name: form.name,
        category: form.category,
        image: form.capturedPhoto || form.image || `https://images.pexels.com/photos/102104/pexels-photo-102104.jpeg`,
        is_active: true
      });
      setForm({ name: '', category: 'Fruits', image: '', capturedPhoto: '' });
      setErrors({});
      onClose();
    } catch {
      setErrors({ form: 'Failed to add product.' });
    }
    setLoading(false);
  };
  if (!open) return null;
  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
      <div className="bg-white rounded-lg max-w-2xl w-full max-h-[90vh] overflow-y-auto">
        <div className="p-6 border-b">
          <h2 className="text-xl font-semibold text-gray-900">Add New Product</h2>
        </div>
        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          <input ref={firstInputRef} style={{ position: 'absolute', left: '-9999px', width: 0, height: 0, opacity: 0 }} tabIndex={-1} />
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Product Name *</label>
              <input
                type="text"
                value={form.name}
                onChange={(e) => setForm((prev: any) => ({ ...prev, name: e.target.value }))}
                className={`w-full border ${errors.name ? 'border-red-500' : 'border-gray-300'} rounded-lg px-3 py-2`}
                required
              />
              {errors.name && <p className="text-xs text-red-600 mt-1">{errors.name}</p>}
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Category *</label>
              <select
                value={form.category}
                onChange={(e) => setForm((prev: any) => ({ ...prev, category: e.target.value }))}
                className="w-full border border-gray-300 rounded-lg px-3 py-2"
              >
                <option value="Fruits">Fruits</option>
                <option value="Vegetables">Vegetables</option>
              </select>
              {errors.category && <p className="text-xs text-red-600 mt-1">{errors.category}</p>}
            </div>
            <div className="md:col-span-2">
              <label className="block text-sm font-medium text-gray-700 mb-2">Product Photo (optional)</label>
              {/* For brevity, use a simple file input. You can add camera/capture logic as before if needed. */}
              <input
                type="file"
                accept="image/*"
                onChange={e => {
                  const file = e.target.files?.[0];
                  if (file) {
                    const reader = new FileReader();
                    reader.onload = (ev) => setForm((prev: any) => ({ ...prev, image: ev.target?.result as string, capturedPhoto: '' }));
                    reader.readAsDataURL(file);
                  }
                }}
                className="w-full border border-gray-300 rounded-lg px-3 py-2"
              />
              {form.image && (
                <img src={form.image} alt="Preview" className="w-24 h-24 object-cover rounded mt-2" />
              )}
            </div>
          </div>
          {errors.form && <p className="text-xs text-red-600 mt-1">{errors.form}</p>}
          <div className="flex justify-end space-x-3 pt-4">
            <button type="button" onClick={onClose} className="px-4 py-2 text-gray-700 border border-gray-300 rounded-lg hover:bg-gray-50">Cancel</button>
            <button type="submit" className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700" disabled={loading}>{loading ? 'Adding...' : 'Add Product'}</button>
          </div>
        </form>
      </div>
    </div>
  );
};

const EditProductModal = ({ open, onClose, onSuccess, product }: any) => {
  const [form, setForm] = useState({ ...product });
  const [errors, setErrors] = useState<any>({});
  const [loading, setLoading] = useState(false);
  const firstInputRef = useRef<HTMLInputElement>(null);
  useEffect(() => { if (open && firstInputRef.current) firstInputRef.current.focus(); }, [open]);
  useEffect(() => {
    const handleEsc = (e: KeyboardEvent) => { if (e.key === 'Escape' && open) onClose(); };
    window.addEventListener('keydown', handleEsc);
    return () => window.removeEventListener('keydown', handleEsc);
  }, [open, onClose]);
  const validate = () => {
    const errors: any = {};
    if (!form.name) errors.name = 'Product name is required.';
    if (!form.category) errors.category = 'Category is required.';
    return errors;
  };
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const errs = validate();
    setErrors(errs);
    if (Object.keys(errs).length > 0) return;
    setLoading(true);
    try {
      await onSuccess({
        id: form.id,
        name: form.name,
        category: form.category,
        image: form.capturedPhoto || form.image || `https://images.pexels.com/photos/102104/pexels-photo-102104.jpeg`,
      });
      setErrors({});
      onClose();
    } catch {
      setErrors({ form: 'Failed to update product.' });
    }
    setLoading(false);
  };
  if (!open) return null;
  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
      <div className="bg-white rounded-lg max-w-2xl w-full max-h-[90vh] overflow-y-auto">
        <div className="p-6 border-b">
          <h2 className="text-xl font-semibold text-gray-900">Edit Product</h2>
        </div>
        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          <input ref={firstInputRef} style={{ position: 'absolute', left: '-9999px', width: 0, height: 0, opacity: 0 }} tabIndex={-1} />
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Product Name *</label>
              <input
                type="text"
                value={form.name}
                onChange={(e) => setForm((prev: any) => ({ ...prev, name: e.target.value }))}
                className={`w-full border ${errors.name ? 'border-red-500' : 'border-gray-300'} rounded-lg px-3 py-2`}
                required
              />
              {errors.name && <p className="text-xs text-red-600 mt-1">{errors.name}</p>}
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Category *</label>
              <select
                value={form.category}
                onChange={(e) => setForm((prev: any) => ({ ...prev, category: e.target.value }))}
                className="w-full border border-gray-300 rounded-lg px-3 py-2"
              >
                <option value="Fruits">Fruits</option>
                <option value="Vegetables">Vegetables</option>
              </select>
              {errors.category && <p className="text-xs text-red-600 mt-1">{errors.category}</p>}
            </div>
            <div className="md:col-span-2">
              <label className="block text-sm font-medium text-gray-700 mb-2">Product Photo (optional)</label>
              <input
                type="file"
                accept="image/*"
                onChange={e => {
                  const file = e.target.files?.[0];
                  if (file) {
                    const reader = new FileReader();
                    reader.onload = (ev) => setForm((prev: any) => ({ ...prev, image: ev.target?.result as string, capturedPhoto: '' }));
                    reader.readAsDataURL(file);
                  }
                }}
                className="w-full border border-gray-300 rounded-lg px-3 py-2"
              />
              {form.image && (
                <img src={form.image} alt="Preview" className="w-24 h-24 object-cover rounded mt-2" />
              )}
            </div>
          </div>
          {errors.form && <p className="text-xs text-red-600 mt-1">{errors.form}</p>}
          <div className="flex justify-end space-x-3 pt-4">
            <button type="button" onClick={onClose} className="px-4 py-2 text-gray-700 border border-gray-300 rounded-lg hover:bg-gray-50">Cancel</button>
            <button type="submit" className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700" disabled={loading}>{loading ? 'Saving...' : 'Save Changes'}</button>
          </div>
        </form>
      </div>
    </div>
  );
};

const DeleteProductConfirm = ({ open, onClose, onDelete, product }: any) => {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  if (!open) return null;
  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
      <div className="bg-white rounded-lg max-w-md w-full">
        <div className="p-6 border-b">
          <h2 className="text-xl font-semibold text-gray-900">Delete Product</h2>
        </div>
        <div className="p-6">
          <p>Are you sure you want to delete <b>{product?.name}</b>?</p>
          {error && <p className="text-xs text-red-600 mt-2">{error}</p>}
          <div className="flex justify-end space-x-3 pt-4">
            <button type="button" onClick={onClose} className="px-4 py-2 text-gray-700 border border-gray-300 rounded-lg hover:bg-gray-50">Cancel</button>
            <button
              type="button"
              className="px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700"
              disabled={loading}
              onClick={async () => {
                setLoading(true);
                setError('');
                try {
                  await onDelete(product);
                  onClose();
                } catch (err: any) {
                  setError('Failed to delete product.');
                }
                setLoading(false);
              }}
            >
              {loading ? 'Deleting...' : 'Delete'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default function Inventory() {
  const raw = useOfflineData();
  const products = raw.products.map(p => ({...p, isActive: p.is_active, createdAt: p.created_at})) as Array<any>;
  const suppliers = raw.suppliers.map(s => ({...s, isActive: s.is_active, createdAt: s.created_at})) as Array<any>;
  const inventory = raw.inventory.map(i => ({...i, createdAt: i.created_at, product_id: i.product_id, supplier_id: i.supplier_id, received_at: i.received_at})) as Array<any>;
  const stockLevels = raw.stockLevels as Array<any>;
  const addInventoryItem = raw.addInventoryItem;
  const addSupplier = raw.addSupplier;
  const addProduct = raw.addProduct;
  const lowStockAlertsEnabled = raw.lowStockAlertsEnabled;
  const lowStockThreshold = raw.lowStockThreshold;
  const defaultCommissionRate = raw.defaultCommissionRate;
  const { userProfile } = useSupabaseAuth();
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

  // Add spinner for image capture/upload
  const [imageLoading, setImageLoading] = useState(false);

  // Cleanup camera stream when component unmounts or modal closes
  useEffect(() => {
    return () => {
      stopCamera();
    };
  }, []);

  const startCamera = async () => {
    try {
      setCameraError('');
      setImageLoading(true);
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
      setCameraError('Unable to access camera. Please check permissions and ensure no other app is using the camera.');
    }
    setImageLoading(false);
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
      setImageLoading(true);
      // Check file size (limit to 5MB)
      if (file.size > 5 * 1024 * 1024) {
        alert('File size too large. Please choose an image under 5MB.');
        setImageLoading(false);
        return;
      }

      // Check file type
      if (!file.type.startsWith('image/')) {
        alert('Please select a valid image file.');
        setImageLoading(false);
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
        setImageLoading(false);
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
    product_id: '',
    supplier_id: '',
    type: 'commission' as 'commission' | 'cash',
    quantity: '',
    unit: 'kg' as 'kg' | 'piece' | 'box' | 'bag',
    weight: '',
    porterage: '',
    transfer_fee: '',
    price: '',
    commission_rate: '',
    notes: ''
  });

  // Update commission rate when form opens or supplier changes
  React.useEffect(() => {
    if (receiveForm.type === 'commission' && receiveForm.supplier_id) {
      // Always use the global default commission rate
      const expectedRate = defaultCommissionRate.toString();
      if (receiveForm.commission_rate !== expectedRate) {
        setReceiveForm(prev => ({ ...prev, commission_rate: expectedRate }));
      }
    } else if (receiveForm.type === 'cash') {
      // Clear commission rate for cash purchases
      if (receiveForm.commission_rate !== '') {
        setReceiveForm(prev => ({ ...prev, commission_rate: '' }));
      }
    }
  }, [receiveForm.supplier_id, receiveForm.type, defaultCommissionRate, receiveForm.commission_rate]);

  // Add loading and toast state
  const [loading, setLoading] = useState<{ form?: boolean; product?: boolean; supplier?: boolean; initial?: boolean }>({ initial: false });
  const [toast, setToast] = useState<{ type: 'success' | 'error'; message: string } | null>(null);
  const showToast = (type: 'success' | 'error', message: string) => {
    setToast({ type, message });
    setTimeout(() => setToast(null), 3000);
  };

  // Add validation error state for forms
  const [receiveErrors, setReceiveErrors] = useState<any>({});
  const [productErrors, setProductErrors] = useState<any>({});
  const [supplierErrors, setSupplierErrors] = useState<any>({});

  const validateReceiveForm = () => {
    const errors: any = {};
    if (!receiveForm.product_id) errors.product_id = 'Product is required.';
    if (!receiveForm.supplier_id) errors.supplier_id = 'Supplier is required.';
    if (!receiveForm.quantity || isNaN(Number(receiveForm.quantity)) || Number(receiveForm.quantity) < 1) errors.quantity = 'Quantity must be at least 1.';
    if (receiveForm.type === 'commission' && (receiveForm.commission_rate === '' || isNaN(Number(receiveForm.commission_rate)))) errors.commission_rate = 'Commission rate is required.';
    if (receiveForm.type === 'cash' && (receiveForm.price === '' || isNaN(Number(receiveForm.price)))) errors.price = 'Purchase price is required.';
    return errors;
  };
  const validateProductForm = () => {
    const errors: any = {};
    if (!productForm.name) errors.name = 'Product name is required.';
    if (!productForm.category) errors.category = 'Category is required.';
    return errors;
  };
  const validateSupplierForm = () => {
    const errors: any = {};
    if (!supplierForm.name) errors.name = 'Supplier name is required.';
    if (!supplierForm.phone) errors.phone = 'Phone is required.';
    return errors;
  };

  const handleReceiveSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const errors = validateReceiveForm();
    setReceiveErrors(errors);
    if (Object.keys(errors).length > 0) return;
    setLoading(l => ({ ...l, form: true }));
    try {
      await addInventoryItem({
        product_id: receiveForm.product_id,
        supplier_id: receiveForm.supplier_id,
        type: receiveForm.type,
        quantity: parseInt(receiveForm.quantity),
        unit: receiveForm.unit,
        weight: receiveForm.weight ? parseFloat(receiveForm.weight) : undefined,
        porterage: receiveForm.porterage ? parseFloat(receiveForm.porterage) : undefined,
        transfer_fee: receiveForm.transfer_fee ? parseFloat(receiveForm.transfer_fee) : undefined,
        price: receiveForm.price ? parseFloat(receiveForm.price) : undefined,
        commission_rate: receiveForm.type === 'commission' && receiveForm.commission_rate ? parseFloat(receiveForm.commission_rate) : undefined,
        notes: receiveForm.notes || undefined,
        received_by: userProfile?.id || ''
      });
      setReceiveForm({
        product_id: '',
        supplier_id: '',
        type: 'commission',
        quantity: '',
        unit: 'kg',
        weight: '',
        porterage: '',
        transfer_fee: '',
        price: '',
        commission_rate: '',
        notes: ''
      });
      setShowReceiveForm(false);
      setReceiveErrors({});
      showToast('success', 'Inventory received successfully!');
    } catch (err) {
      showToast('error', 'Failed to receive inventory.');
    }
    setLoading(l => ({ ...l, form: false }));
  };

  const handleProductSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const errors = validateProductForm();
    setProductErrors(errors);
    if (Object.keys(errors).length > 0) return;
    setLoading(l => ({ ...l, product: true }));
    try {
      await addProduct({
        name: productForm.name,
        category: productForm.category,
        image: productForm.capturedPhoto || productForm.image || `https://images.pexels.com/photos/102104/pexels-photo-102104.jpeg`,
        is_active: true
      });
      stopCamera();
      setProductForm({
        name: '',
        category: 'Fruits',
        image: '',
        capturedPhoto: ''
      });
      setShowAddProductForm(false);
      setProductErrors({});
      showToast('success', 'Product added successfully!');
    } catch (err) {
      showToast('error', 'Failed to add product.');
    }
    setLoading(l => ({ ...l, product: false }));
  };

  const handleSupplierSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const errors = validateSupplierForm();
    setSupplierErrors(errors);
    if (Object.keys(errors).length > 0) return;
    setLoading(l => ({ ...l, supplier: true }));
    try {
      await addSupplier({
        name: supplierForm.name,
        phone: supplierForm.phone,
        email: supplierForm.email || '',
        address: supplierForm.address,
        type: supplierForm.type,
        is_active: true
      });
      setSupplierForm({
        name: '',
        phone: '',
        email: '',
        address: '',
        type: 'commission'
      });
      setShowAddSupplierForm(false);
      setSupplierErrors({});
      showToast('success', 'Supplier added successfully!');
    } catch (err) {
      showToast('error', 'Failed to add supplier.');
    }
    setLoading(l => ({ ...l, supplier: false }));
  };

  // Debounced search for stock levels
  const debouncedSearchTerm = useDebounce(searchTerm, 300);
  const filteredStockLevels = stockLevels.filter(item =>
    item && typeof item.product_name === 'string' && item.product_name.toLowerCase().includes(debouncedSearchTerm.toLowerCase())
  );

  const recentReceives = inventory
    .sort((a, b) => new Date(b.received_at).getTime() - new Date(a.received_at).getTime())
    .slice(0, 10);

  // Auto-focus first input in modals
  const receiveFirstInputRef = useRef<HTMLInputElement>(null);
  const productFirstInputRef = useRef<HTMLInputElement>(null);
  const supplierFirstInputRef = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (showReceiveForm && receiveFirstInputRef.current) receiveFirstInputRef.current.focus();
  }, [showReceiveForm]);
  useEffect(() => {
    if (showAddProductForm && productFirstInputRef.current) productFirstInputRef.current.focus();
  }, [showAddProductForm]);
  useEffect(() => {
    if (showAddSupplierForm && supplierFirstInputRef.current) supplierFirstInputRef.current.focus();
  }, [showAddSupplierForm]);
  // Allow closing modals with Escape key
  useEffect(() => {
    const handleEsc = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (showReceiveForm) setShowReceiveForm(false);
        if (showAddProductForm) { stopCamera(); setShowAddProductForm(false); }
        if (showAddSupplierForm) setShowAddSupplierForm(false);
      }
    };
    window.addEventListener('keydown', handleEsc);
    return () => window.removeEventListener('keydown', handleEsc);
  }, [showReceiveForm, showAddProductForm, showAddSupplierForm]);

  // Add edit/delete modal state
  const [editItem, setEditItem] = useState<any>(null);
  const [deleteItem, setDeleteItem] = useState<any>(null);

  // Add updateInventoryItem and deleteInventoryItem as local stubs for now
  const updateInventoryItem = async (item: any) => {
    await SupabaseService.updateInventoryItem(item.id, {
      quantity: Number(item.quantity),
      price: item.price ? Number(item.price) : null,
      notes: item.notes || null,
    });
  };
  const deleteInventoryItem = async (item: any) => {
    await SupabaseService.deleteInventoryItem(item.id);
    // Mark as deleted in local database to ensure UI updates
    await db.softDelete('inventory_items', item.id);
  };

  // Add modal components for edit and delete
  const EditInventoryModal = ({ item, onClose, onSave }: any) => {
    const [form, setForm] = useState({ ...item });
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');
    return (
      <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
        <div className="bg-white rounded-lg max-w-lg w-full max-h-[90vh] overflow-y-auto">
          <div className="p-6 border-b">
            <h2 className="text-xl font-semibold text-gray-900">Edit Inventory Item</h2>
          </div>
          <form
            onSubmit={async (e) => {
              e.preventDefault();
              setLoading(true);
              setError('');
              try {
                await onSave(form);
                onClose();
              } catch (err: any) {
                setError('Failed to update inventory item.');
              }
              setLoading(false);
            }}
            className="p-6 space-y-4"
          >
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Quantity</label>
                <input
                  type="number"
                  value={form.quantity}
                  onChange={e => setForm((f: any) => ({ ...f, quantity: e.target.value }))}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2"
                  min="0"
                  required
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Unit</label>
                <input
                  type="text"
                  value={form.unit}
                  onChange={e => setForm((f: any) => ({ ...f, unit: e.target.value }))}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2"
                  required
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Price</label>
                <input
                  type="number"
                  value={form.price || ''}
                  onChange={e => setForm((f: any) => ({ ...f, price: e.target.value }))}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2"
                  min="0"
                  step="0.01"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Notes</label>
                <input
                  type="text"
                  value={form.notes || ''}
                  onChange={e => setForm((f: any) => ({ ...f, notes: e.target.value }))}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2"
                />
              </div>
            </div>
            {error && <p className="text-xs text-red-600 mt-1">{error}</p>}
            <div className="flex justify-end space-x-3 pt-4">
              <button type="button" onClick={onClose} className="px-4 py-2 text-gray-700 border border-gray-300 rounded-lg hover:bg-gray-50">Cancel</button>
              <button type="submit" className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700" disabled={loading}>{loading ? 'Saving...' : 'Save'}</button>
            </div>
          </form>
        </div>
      </div>
    );
  };
  const DeleteInventoryConfirm = ({ item, onClose, onDelete }: any) => {
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');
    return (
      <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
        <div className="bg-white rounded-lg max-w-md w-full">
          <div className="p-6 border-b">
            <h2 className="text-xl font-semibold text-gray-900">Delete Inventory Item</h2>
          </div>
          <div className="p-6">
            <p>Are you sure you want to delete this inventory item?</p>
            {error && <p className="text-xs text-red-600 mt-2">{error}</p>}
            <div className="flex justify-end space-x-3 pt-4">
              <button type="button" onClick={onClose} className="px-4 py-2 text-gray-700 border border-gray-300 rounded-lg hover:bg-gray-50">Cancel</button>
              <button
                type="button"
                className="px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700"
                disabled={loading}
                onClick={async () => {
                  setLoading(true);
                  setError('');
                  try {
                    await onDelete(item);
                    onClose();
                  } catch (err: any) {
                    setError('Failed to delete inventory item.');
                  }
                  setLoading(false);
                }}
              >
                {loading ? 'Deleting...' : 'Delete'}
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  };

  // Subcomponents
  const StockTable = ({ filteredStockLevels, products, lowStockAlertsEnabled, lowStockThreshold }: any) => {
    // Pagination state
    const [page, setPage] = useState(1);
    const itemsPerPage = 10;
    const totalPages = Math.ceil(filteredStockLevels.length / itemsPerPage);
    const paginated = filteredStockLevels.slice((page - 1) * itemsPerPage, page * itemsPerPage);
    // Helper to get supplier info
    const getSupplierInfo = (supplierId: string) => {
      const supplier = products
        .flatMap((p: any) => p.suppliers || [])
        .find((s: any) => s.id === supplierId);
      return supplier;
    };
    return (
      <div className="bg-white rounded-lg shadow-sm">
        <div className="p-6 border-b flex items-center justify-between">
          <h2 className="text-lg font-semibold text-gray-900">Current Stock Levels</h2>
          <div className="flex items-center gap-2">
            <button onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page === 1} className="px-2 py-1 rounded bg-gray-100 text-gray-700 disabled:opacity-50">Prev</button>
            <span className="text-sm">Page {page} of {totalPages}</span>
            <button onClick={() => setPage(p => Math.min(totalPages, p + 1))} disabled={page === totalPages} className="px-2 py-1 rounded bg-gray-100 text-gray-700 disabled:opacity-50">Next</button>
          </div>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Product</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Current Stock</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Unit Price</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Total Value</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Suppliers</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Last Received</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200">
              {paginated.map((item: any) => {
                const product = products.find((p: any) => p.id === item.product_id);
                // For unit price, use the most recent inventory item's price for this product
                const latestInventory = (product?.inventory || []).sort((a: any, b: any) => new Date(b.received_at).getTime() - new Date(a.received_at).getTime())[0];
                const unitPrice = latestInventory?.price || 0;
                const totalValue = unitPrice * item.current_stock;
                return (
                  <tr key={item.product_id} className="hover:bg-gray-50">
                    <td className="px-6 py-4">
                      <div className="flex items-center">
                        <img
                          src={product?.image || `https://images.pexels.com/photos/102104/pexels-photo-102104.jpeg`}
                          alt={product?.name}
                          className="w-10 h-10 rounded-lg object-cover mr-3"
                          onError={(e) => (e.currentTarget.src = `https://images.pexels.com/photos/102104/pexels-photo-102104.jpeg`)}
                        />
                        <div>
                          <p className="font-medium text-gray-900">{item.product_name}</p>
                          <p className="text-sm text-gray-500">{product?.category}</p>
                        </div>
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      <span className="font-medium text-gray-900">
                        {item.current_stock} {item.unit}
                      </span>
                    </td>
                    <td className="px-6 py-4">
                      <span className="text-gray-900">{unitPrice ? `$${unitPrice.toFixed(2)}` : '-'}</span>
                    </td>
                    <td className="px-6 py-4">
                      <span className="text-gray-900">{unitPrice ? `$${totalValue.toFixed(2)}` : '-'}</span>
                    </td>
                    <td className="px-6 py-4">
                      <div className="flex flex-wrap gap-1">
                        {(item.suppliers || []).map((supplier: any) => (
                          <span
                            key={supplier.supplier_id}
                            className="px-2 py-1 bg-gray-100 text-gray-700 text-xs rounded relative group"
                          >
                            {supplier.supplier_name}: {supplier.quantity}
                            {/* Tooltip for contact info */}
                            <span className="hidden group-hover:block absolute left-0 top-full mt-1 z-10 bg-white border border-gray-300 rounded shadow-lg px-3 py-2 text-xs text-gray-700 min-w-[180px]">
                              {(() => {
                                const info = getSupplierInfo(supplier.supplier_id);
                                return info ? (
                                  <>
                                    {info.phone && <div><b>Phone:</b> {info.phone}</div>}
                                    {info.email && <div><b>Email:</b> {info.email}</div>}
                                  </>
                                ) : <span>No contact info</span>;
                              })()}
                            </span>
                          </span>
                        ))}
                      </div>
                    </td>
                    <td className="px-6 py-4 text-gray-500">
                      {item.last_received ? new Date(item.last_received).toLocaleDateString() : 'Never'}
                    </td>
                    <td className="px-6 py-4">
                      <span className={`px-2 py-1 text-xs rounded-full ${
                        item.current_stock === 0 
                          ? 'bg-red-100 text-red-800'
                          : lowStockAlertsEnabled && item.current_stock < lowStockThreshold
                          ? 'bg-amber-100 text-amber-800'
                          : 'bg-green-100 text-green-800'
                      }`}>
                        {item.current_stock === 0 
                          ? 'Out of Stock' 
                          : lowStockAlertsEnabled && item.current_stock < lowStockThreshold
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
    );
  };
  const RecentReceivesTable = ({ recentReceives, products, suppliers, onEdit, onDelete }: any) => (
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
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-200">
            {recentReceives.map((item: any) => {
              const product = products.find((p: any) => p.id === item.product_id);
              const supplier = suppliers.find((s: any) => s.id === item.supplier_id);
              return (
                <tr key={item.id} className="hover:bg-gray-50">
                  <td className="px-6 py-4">
                    <div className="flex items-center">
                      <img
                        src={product?.image || `https://images.pexels.com/photos/102104/pexels-photo-102104.jpeg`}
                        alt={product?.name}
                        className="w-10 h-10 rounded-lg object-cover mr-3"
                        onError={(e) => (e.currentTarget.src = `https://images.pexels.com/photos/102104/pexels-photo-102104.jpeg`)}
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
                    {new Date(item.received_at).toLocaleDateString()}
                  </td>
                  <td className="px-6 py-4">
                    <button onClick={() => onEdit(item)} className="text-blue-600 hover:underline mr-2">Edit</button>
                    <button onClick={() => onDelete(item)} className="text-red-600 hover:underline">Delete</button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );

  // Add ProductTable subcomponent
  const ProductTable = ({ products, onEdit, onDelete }: any) => (
    <div className="bg-white rounded-lg shadow-sm">
      <div className="p-6 border-b">
        <h2 className="text-lg font-semibold text-gray-900">Stock Products</h2>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full">
          <thead className="bg-gray-50">
            <tr>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Image</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Name</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Category</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-200">
            {products.map((product: any) => (
              <tr key={product.id} className="hover:bg-gray-50">
                <td className="px-6 py-4">
                  <img
                    src={product.image || `https://images.pexels.com/photos/102104/pexels-photo-102104.jpeg`}
                    alt={product.name}
                    className="w-10 h-10 rounded-lg object-cover"
                    onError={(e) => (e.currentTarget.src = `https://images.pexels.com/photos/102104/pexels-photo-102104.jpeg`)}
                  />
                </td>
                <td className="px-6 py-4 font-medium text-gray-900">{product.name}</td>
                <td className="px-6 py-4 text-gray-700">{product.category}</td>
                <td className="px-6 py-4">
                  <button onClick={() => onEdit(product)} className="text-blue-600 hover:underline mr-2">Edit</button>
                  <button onClick={() => onDelete(product)} className="text-red-600 hover:underline">Delete</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );

  // Add state for edit and delete modals
  const [showEditProductModal, setShowEditProductModal] = useState(false);
  const [editProductData, setEditProductData] = useState<any>(null);
  const [showDeleteProductModal, setShowDeleteProductModal] = useState(false);
  const [deleteProductData, setDeleteProductData] = useState<any>(null);

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
          Stock Products
        </button>
      </div>

      {activeTab === 'receive' && (
        <div className="space-y-6">
          {/* Recent Receives */}
          <RecentReceivesTable recentReceives={recentReceives} products={products} suppliers={suppliers} onEdit={setEditItem} onDelete={setDeleteItem} />
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
          {/* Product Table */}
          <ProductTable
            products={products.filter(p => p.name.toLowerCase().includes(searchTerm.toLowerCase()))}
            onEdit={(product: any) => { setEditProductData(product); setShowEditProductModal(true); }}
            onDelete={(product: any) => { setDeleteProductData(product); setShowDeleteProductModal(true); }}
          />
        </div>
      )}

      {/* Receive Form Modal */}
      <ReceiveFormModal
        open={showReceiveForm}
        onClose={() => setShowReceiveForm(false)}
        onSuccess={async (data: any) => {
          await addInventoryItem(data);
          await raw.refreshData();
          showToast('success', 'Inventory received successfully!');
        }}
        products={products}
        suppliers={suppliers}
        userProfile={userProfile}
        defaultCommissionRate={defaultCommissionRate}
        recentProducts={recentProducts}
        setRecentProducts={setRecentProducts}
        recentSuppliers={recentSuppliers}
        setRecentSuppliers={setRecentSuppliers}
        form={receiveForm}
        setForm={setReceiveForm}
        errors={receiveErrors}
        setErrors={setReceiveErrors}
      />

      {/* Add Product Form Modal */}
      <AddProductModal
        open={showAddProductForm}
        onClose={() => setShowAddProductForm(false)}
        onSuccess={async (data: any) => {
          await addProduct(data);
          await raw.refreshData();
          showToast('success', 'Product added successfully!');
        }}
      />

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
                    className={`w-full border ${supplierErrors.name ? 'border-red-500' : 'border-gray-300'} rounded-lg px-3 py-2 focus:ring-blue-500 focus:border-blue-500`}
                    required
                    ref={supplierFirstInputRef}
                  />
                  {supplierErrors.name && <p className="text-xs text-red-600 mt-1">{supplierErrors.name}</p>}
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Phone *
                  </label>
                  <input
                    type="tel"
                    value={supplierForm.phone}
                    onChange={(e) => setSupplierForm(prev => ({ ...prev, phone: e.target.value }))}
                    className={`w-full border ${supplierErrors.phone ? 'border-red-500' : 'border-gray-300'} rounded-lg px-3 py-2 focus:ring-blue-500 focus:border-blue-500`}
                    required
                  />
                  {supplierErrors.phone && <p className="text-xs text-red-600 mt-1">{supplierErrors.phone}</p>}
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
                  disabled={loading.supplier}
                >
                  Add Supplier
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Add spinner overlay for any loading */}
      {(loading.form || loading.product || loading.supplier || loading.initial) && (
        <div className="fixed inset-0 bg-black bg-opacity-20 flex items-center justify-center z-50">
          <div className="w-16 h-16 border-4 border-blue-500 border-t-transparent rounded-full animate-spin"></div>
        </div>
      )}

      {/* Add toast display at top right */}
      {toast && (
        <div className={`fixed top-4 right-4 px-4 py-2 rounded shadow-lg z-50 text-white ${toast.type === 'success' ? 'bg-green-600' : 'bg-red-600'}`}>{toast.message}</div>
      )}

      {/* Edit Inventory Modal */}
      {editItem && (
        <EditInventoryModal
          item={editItem}
          onClose={() => setEditItem(null)}
          onSave={async (form: any) => {
            try {
              await updateInventoryItem(form);
              await raw.refreshData();
              showToast('success', 'Inventory item updated!');
            } catch {
              showToast('error', 'Failed to update inventory item.');
            }
            setEditItem(null);
          }}
        />
      )}
      {deleteItem && (
        <DeleteInventoryConfirm
          item={deleteItem}
          onClose={() => setDeleteItem(null)}
          onDelete={async (item: any) => {
            try {
              await deleteInventoryItem(item);
              await raw.refreshData();
              showToast('success', 'Inventory item deleted!');
            } catch {
              showToast('error', 'Failed to delete inventory item.');
            }
            setDeleteItem(null);
          }}
        />
      )}

      {/* Edit Product Modal */}
      <EditProductModal
        open={showEditProductModal}
        onClose={() => setShowEditProductModal(false)}
        product={editProductData}
        onSuccess={async (data: any) => {
          await SupabaseService.updateProduct(data.id, { name: data.name, category: data.category, image: data.image });
          await raw.refreshData();
          showToast('success', 'Product updated successfully!');
        }}
      />

      {/* Delete Product Confirm Modal */}
      <DeleteProductConfirm
        open={showDeleteProductModal}
        onClose={() => setShowDeleteProductModal(false)}
        product={deleteProductData}
        onDelete={async (product: any) => {
          await SupabaseService.deleteProduct(product.id);
          await raw.refreshData();
          showToast('success', 'Product deleted successfully!');
        }}
      />
    </div>
  );
}