import React, { useState, useRef, useEffect } from 'react';
import { X, Package } from 'lucide-react';
import { PRODUCT_PLACEHOLDER_IMAGE } from '../../constants/productImages';

interface EditProductModalProps {
  open: boolean;
  onClose: () => void;
  onSuccess: (data: any) => Promise<void>;
  product: any;
}

const EditProductModal: React.FC<EditProductModalProps> = ({ open, onClose, onSuccess, product }) => {
  const [form, setForm] = useState({ ...product });
  const [errors, setErrors] = useState<any>({});
  const [loading, setLoading] = useState(false);
  const firstInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => { 
    if (open && firstInputRef.current) firstInputRef.current.focus(); 
  }, [open]);

  useEffect(() => {
    const handleEsc = (e: KeyboardEvent) => { 
      if (e.key === 'Escape' && open) onClose(); 
    };
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
        image: form.capturedPhoto || form.image || PRODUCT_PLACEHOLDER_IMAGE,
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
      <div className="bg-white dark:bg-slate-900 rounded-lg max-w-2xl w-full max-h-[90vh] overflow-y-auto shadow-2xl ring-1 ring-black/5 dark:ring-white/10">
        <div className="p-6 border-b border-gray-200 dark:border-slate-800 bg-gradient-to-r from-blue-50 to-indigo-50 dark:from-slate-800 dark:to-slate-800">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-2xl font-bold text-gray-900 dark:text-slate-100">Edit Product</h2>
              <p className="text-sm text-gray-600 dark:text-slate-300 mt-1">Update product information</p>
            </div>
            <button
              onClick={onClose}
              className="p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100 dark:hover:bg-slate-800 rounded-lg transition-colors"
            >
              <X className="w-6 h-6" />
            </button>
          </div>
        </div>
        
        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          <input 
            ref={firstInputRef} 
            style={{ position: 'absolute', left: '-9999px', width: 0, height: 0, opacity: 0 }} 
            tabIndex={-1} 
          />
          
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-slate-300 mb-2">Product Name *</label>
              <input
                type="text"
                value={form.name}
                onChange={(e) => setForm((prev: any) => ({ ...prev, name: e.target.value }))}
                className={`w-full border ${errors.name ? 'border-red-500' : 'border-gray-300 dark:border-slate-700'} rounded-lg px-3 py-2 focus:ring-blue-500 focus:border-blue-500 dark:bg-slate-800 dark:text-slate-100`}
                required
              />
              {errors.name && <p className="text-xs text-red-600 mt-1">{errors.name}</p>}
            </div>
            
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-slate-300 mb-2">Category *</label>
              <select
                value={form.category}
                onChange={(e) => setForm((prev: any) => ({ ...prev, category: e.target.value }))}
                className={`w-full border ${errors.category ? 'border-red-500' : 'border-gray-300 dark:border-slate-700'} rounded-lg px-3 py-2 focus:ring-blue-500 focus:border-blue-500 dark:bg-slate-800 dark:text-slate-100`}
              >
                <option value="Fruits">Fruits</option>
                <option value="Vegetables">Vegetables</option>
                <option value="Herbs">Herbs</option>
                <option value="Nuts">Nuts</option>
                <option value="Others">Others</option>
              </select>
              {errors.category && <p className="text-xs text-red-600 mt-1">{errors.category}</p>}
            </div>
            
            <div className="md:col-span-2">
              <label className="block text-sm font-medium text-gray-700 dark:text-slate-300 mb-2">Product Photo (optional)</label>
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
                className="w-full border border-gray-300 dark:border-slate-700 rounded-lg px-3 py-2 focus:ring-blue-500 focus:border-blue-500 dark:bg-slate-800 dark:text-slate-100"
              />
              {form.image && (
                <img src={form.image} alt="Preview" className="w-24 h-24 object-cover rounded mt-2" />
              )}
            </div>
          </div>
          
          {errors.form && <p className="text-xs text-red-600 mt-1">{errors.form}</p>}
          
          <div className="flex justify-end space-x-3 pt-4">
            <button 
              type="button" 
              onClick={onClose} 
              className="px-4 py-2 text-gray-700 dark:text-slate-200 border border-gray-300 dark:border-slate-700 rounded-lg hover:bg-gray-50 dark:hover:bg-slate-800 transition-colors"
            >
              Cancel
            </button>
            <button 
              type="submit" 
              className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors flex items-center" 
              disabled={loading}
            >
              {loading ? (
                <>
                  <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin mr-2"></div>
                  Saving...
                </>
              ) : (
                'Save Changes'
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default EditProductModal;

