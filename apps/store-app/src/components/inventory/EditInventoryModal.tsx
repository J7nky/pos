import React, { useState, useRef, useEffect } from 'react';
import { X, Package, Eye, Upload } from 'lucide-react';

interface EditInventoryModalProps {
  item: any;
  onClose: () => void;
  onSave: (form: any) => Promise<void>;
}

const EditInventoryModal: React.FC<EditInventoryModalProps> = ({ item, onClose, onSave }) => {
  const [form, setForm] = useState({ ...item });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [errors, setErrors] = useState<any>({});
  const firstInputRef = useRef<HTMLInputElement>(null);

  // Auto-focus first field when modal opens
  useEffect(() => {
    if (firstInputRef.current) firstInputRef.current.focus();
  }, []);

  // Keyboard support - Escape to close
  useEffect(() => {
    const handleEsc = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleEsc);
    return () => window.removeEventListener('keydown', handleEsc);
  }, [onClose]);

  // Enhanced validation
  const validate = () => {
    const errors: any = {};

    if (!form.quantity || isNaN(Number(form.quantity)) || Number(form.quantity) < 0) {
      errors.quantity = 'Quantity must be a valid positive number.';
    }

    if (!form.unit || form.unit.trim() === '') {
      errors.unit = 'Unit is required.';
    }

    if (form.price && (isNaN(Number(form.price)) || Number(form.price) < 0)) {
      errors.price = 'Price must be a valid positive number.';
    }

    if (form.weight && (isNaN(Number(form.weight)) || Number(form.weight) < 0)) {
      errors.weight = 'Weight must be a valid positive number.';
    }

    return errors;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const validationErrors = validate();
    setErrors(validationErrors);

    if (Object.keys(validationErrors).length > 0) return;

    setLoading(true);
    setError('');
    try {
      await onSave(form);
      onClose();
    } catch (err: any) {
      setError('Failed to update inventory item.');
    }
    setLoading(false);
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
      <div className="bg-white dark:bg-slate-900 rounded-lg max-w-2xl w-full max-h-[90vh] overflow-y-auto shadow-2xl ring-1 ring-black/5 dark:ring-white/10">
        {/* Enhanced Header */}
        <div className="p-6 border-b border-gray-200 dark:border-slate-800 bg-gradient-to-r from-blue-50 to-indigo-50 dark:from-slate-800 dark:to-slate-800">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-2xl font-bold text-gray-900 dark:text-slate-100">Edit Inventory Item</h2>
              <p className="text-sm text-gray-600 dark:text-slate-300 mt-1">Update inventory item details</p>
            </div>
            <button
              onClick={onClose}
              className="p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100 dark:hover:bg-slate-800 rounded-lg transition-colors"
            >
              <X className="w-6 h-6" />
            </button>
          </div>
        </div>

        <form onSubmit={handleSubmit} className="p-6">
          {/* Hidden input for auto-focus */}
          <input
            ref={firstInputRef}
            style={{ position: 'absolute', left: '-9999px', width: 0, height: 0, opacity: 0 }}
            tabIndex={-1}
          />

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
            {/* Left Column - Basic Details */}
            <div className="space-y-6">
              <div>
                <h3 className="text-lg font-semibold text-gray-900 dark:text-slate-100 mb-4 flex items-center">
                  <Package className="w-5 h-5 mr-2 text-blue-600" />
                  Basic Information
                </h3>

                <div className="space-y-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-slate-300 mb-2">Quantity *</label>
                    <input
                      type="number"
                      value={form.quantity}
                      onChange={e => setForm((f: any) => ({ ...f, quantity: e.target.value }))}
                      className={`w-full border ${errors.quantity ? 'border-red-500 ring-red-500' : 'border-gray-300 dark:border-slate-700'} rounded-lg px-3 py-2 focus:ring-blue-500 focus:border-blue-500 dark:bg-slate-800 dark:text-slate-100`}
                      min="0"
                      step="0.01"
                      required
                      placeholder="Enter quantity"
                    />
                    {errors.quantity && <p className="text-xs text-red-600 mt-1">{errors.quantity}</p>}
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-slate-300 mb-2">Unit *</label>
                    <select
                      value={form.unit}
                      onChange={e => setForm((f: any) => ({ ...f, unit: e.target.value }))}
                      className={`w-full border ${errors.unit ? 'border-red-500 ring-red-500' : 'border-gray-300 dark:border-slate-700'} rounded-lg px-3 py-2 focus:ring-blue-500 focus:border-blue-500 dark:bg-slate-800 dark:text-slate-100`}
                      required
                    >
                      <option value="kg">Kilogram (kg)</option>
                      <option value="piece">Piece</option>
                      <option value="box">Box</option>
                      <option value="bag">Bag</option>
                      <option value="bundle">Bundle</option>
                      <option value="dozen">Dozen</option>
                    </select>
                    {errors.unit && <p className="text-xs text-red-600 mt-1">{errors.unit}</p>}
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-slate-300 mb-2">Weight (optional)</label>
                    <input
                      type="number"
                      value={form.weight || ''}
                      onChange={e => setForm((f: any) => ({ ...f, weight: e.target.value }))}
                      className={`w-full border ${errors.weight ? 'border-red-500 ring-red-500' : 'border-gray-300 dark:border-slate-700'} rounded-lg px-3 py-2 focus:ring-blue-500 focus:border-blue-500 dark:bg-slate-800 dark:text-slate-100`}
                      min="0"
                      step="0.01"
                      placeholder="Enter weight in kg"
                    />
                    {errors.weight && <p className="text-xs text-red-600 mt-1">{errors.weight}</p>}
                  </div>
                </div>
              </div>
            </div>

            {/* Right Column - Financial & Additional Details */}
            <div className="space-y-6">
              <div>
                <h3 className="text-lg font-semibold text-gray-900 dark:text-slate-100 mb-4 flex items-center">
                  <Eye className="w-5 h-5 mr-2 text-purple-600" />
                  Financial & Additional Details
                </h3>

                <div className="space-y-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-slate-300 mb-2">Price (optional)</label>
                    <input
                      type="number"
                      value={form.price || ''}
                      onChange={e => setForm((f: any) => ({ ...f, price: e.target.value }))}
                      className={`w-full border ${errors.price ? 'border-red-500 ring-red-500' : 'border-gray-300 dark:border-slate-700'} rounded-lg px-3 py-2 focus:ring-blue-500 focus:border-blue-500 dark:bg-slate-800 dark:text-slate-100`}
                      min="0"
                      step="0.01"
                      placeholder="Enter price per unit"
                    />
                    {errors.price && <p className="text-xs text-red-600 mt-1">{errors.price}</p>}
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-slate-300 mb-2">Notes (optional)</label>
                    <textarea
                      value={form.status || ''}
                      onChange={e => setForm((f: any) => ({ ...f, status: e.target.value }))}
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
          {error && (
            <div className="mt-6 p-4 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg">
              <p className="text-sm text-red-600">{error}</p>
            </div>
          )}

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
                  Saving...
                </>
              ) : (
                <>
                  <Upload className="w-4 h-4 mr-2" />
                  Save Changes
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default EditInventoryModal;

