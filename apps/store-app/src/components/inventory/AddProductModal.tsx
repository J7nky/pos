import React, { useState, useRef, useEffect } from 'react';
import { Plus, X, Package, Camera, Upload } from 'lucide-react';
import { useI18n } from '../../i18n';
import { PRODUCT_PLACEHOLDER_IMAGE } from '../../constants/productImages';
interface AddProductModalProps {
  open: boolean;
  onClose: () => void;
  onSuccess: (data: any) => Promise<void>;
}

const AddProductModal: React.FC<AddProductModalProps> = ({ open, onClose, onSuccess }) => {
  const { t } = useI18n();
  const [form, setForm] = useState({
    name: '',
    category: 'Fruits',
    image: '',
    capturedPhoto: ''
  });
  const [errors, setErrors] = useState<any>({});
  const [loading, setLoading] = useState(false);
  const [imageLoading, setImageLoading] = useState(false);
  const firstInputRef = useRef<HTMLInputElement>(null);

  // Auto-focus first field when modal opens
  useEffect(() => {
    if (open && firstInputRef.current) firstInputRef.current.focus();
  }, [open]);

  // Keyboard support - Escape to close
  useEffect(() => {
    const handleEsc = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && open) onClose();
    };
    window.addEventListener('keydown', handleEsc);
    return () => window.removeEventListener('keydown', handleEsc);
  }, [open, onClose]);

  // Enhanced validation
  const validate = () => {
    const errors: any = {};
    if (!form.name || form.name.trim() === '') {
      errors.name = 'Product name is required.';
    } else if (form.name.length < 2) {
      errors.name = 'Product name must be at least 2 characters.';
    }
    if (!form.category) {
      errors.category = 'Category is required.';
    }
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
        name: form.name.trim(),
        category: form.category,
        image: form.capturedPhoto || form.image || PRODUCT_PLACEHOLDER_IMAGE,
      });
      setForm({ name: '', category: 'Fruits', image: '', capturedPhoto: '' });
      setErrors({});
      onClose();
    } catch {
      setErrors({ form: 'Failed to add product.' });
    }
    setLoading(false);
  };

  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      setImageLoading(true);

      // Validate file size (5MB limit)
      if (file.size > 5 * 1024 * 1024) {
        setErrors({ image: 'File size too large. Please choose an image under 5MB.' });
        setImageLoading(false);
        return;
      }

      // Validate file type
      if (!file.type.startsWith('image/')) {
        setErrors({ image: 'Please select a valid image file.' });
        setImageLoading(false);
        return;
      }

      const reader = new FileReader();
      reader.onload = (ev) => {
        setForm((prev: any) => ({
          ...prev,
          image: ev.target?.result as string,
          capturedPhoto: ''
        }));
        setErrors((prev: any) => ({ ...prev, image: undefined }));
        setImageLoading(false);
      };
      reader.readAsDataURL(file);
    }
    // Reset input value
    e.target.value = '';
  };

  if (!open) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
      <div className="bg-white dark:bg-slate-900 rounded-lg max-w-2xl w-full max-h-[90vh] overflow-y-auto shadow-2xl ring-1 ring-black/5 dark:ring-white/10">
        {/* Enhanced Header */}
        <div className="p-6 border-b border-gray-200 dark:border-slate-800 bg-gradient-to-r from-green-50 to-emerald-50 dark:from-slate-800 dark:to-slate-800">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-2xl font-bold text-gray-900 dark:text-slate-100">{t('common.labels.addNewProduct')}</h2>
              <p className="text-sm text-gray-600 dark:text-slate-300 mt-1">{t('common.labels.createNewProductForInventory')}</p>
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
            {/* Left Column - Basic Information */}
            <div className="space-y-6">
              <div>
                <h3 className="text-lg font-semibold text-gray-900 dark:text-slate-100 mb-4 flex items-center">
                  <Package className="w-5 h-5 mr-2 text-green-600" />
                  {t('common.labels.productInformation')}
                </h3>

                <div className="space-y-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-slate-300 mb-2">{t('common.labels.product')} *</label>
                    <input
                      type="text"
                      value={form.name}
                      onChange={(e) => setForm((prev: any) => ({ ...prev, name: e.target.value }))}
                      className={`w-full border ${errors.name ? 'border-red-500 ring-red-500' : 'border-gray-300 dark:border-slate-700'} rounded-lg px-3 py-2 focus:ring-green-500 focus:border-green-500 dark:bg-slate-800 dark:text-slate-100`}
                      required
                      placeholder={t('common.labels.enterProductName')}
                      maxLength={100}
                    />
                    {errors.name && <p className="text-xs text-red-600 mt-1">{errors.name}</p>}
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-slate-300 mb-2">{t('common.labels.category')} *</label>
                    <select
                      value={form.category}
                      onChange={(e) => setForm((prev: any) => ({ ...prev, category: e.target.value }))}
                      className={`w-full border ${errors.category ? 'border-red-500 ring-red-500' : 'border-gray-300 dark:border-slate-700'} rounded-lg px-3 py-2 focus:ring-green-500 focus:border-green-500 dark:bg-slate-800 dark:text-slate-100`}
                    >
                      <option value="Fruits">{t('common.labels.fruits')}</option>
                      <option value="Vegetables">{t('common.labels.vegetables')}</option>
                      <option value="Leafy">{t('common.labels.leafy')}</option>
                      <option value="Nuts">{t('common.labels.nuts')}</option>
                      <option value="Others">{t('common.labels.others')}</option>
                    </select>
                    {errors.category && <p className="text-xs text-red-600 mt-1">{errors.category}</p>}
                  </div>
                </div>
              </div>
            </div>

            {/* Right Column - Product Image */}
            <div className="space-y-6">
              <div>
                <h3 className="text-lg font-semibold text-gray-900 dark:text-slate-100 mb-4 flex items-center">
                  <Camera className="w-5 h-5 mr-2 text-purple-600" />
                  {t('common.labels.productImage')}
                </h3>

                <div className="space-y-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-slate-300 mb-2">{t('common.labels.productPhoto')} ({t('common.placeholders.optional')})</label>
                    <div className="border-2 border-dashed border-gray-300 dark:border-slate-700 rounded-lg p-6 text-center hover:border-green-400 transition-colors">
                      <input
                        type="file"
                        accept="image/*"
                        onChange={handleImageUpload}
                        className="hidden"
                        id="product-image-upload"
                      />
                      <label
                        htmlFor="product-image-upload"
                        className="cursor-pointer flex flex-col items-center"
                      >
                        {imageLoading ? (
                          <div className="w-8 h-8 border-2 border-green-500 border-t-transparent rounded-full animate-spin mb-2"></div>
                        ) : form.image ? (
                          <div className="relative">
                            <img src={form.image} alt="Preview" className="w-32 h-32 object-cover rounded-lg border border-gray-200 dark:border-slate-700 mb-2" />
                            <button
                              type="button"
                              onClick={(e) => {
                                e.preventDefault();
                                setForm((prev: any) => ({ ...prev, image: '', capturedPhoto: '' }));
                              }}
                              className="absolute -top-2 -right-2 bg-red-500 text-white rounded-full w-6 h-6 flex items-center justify-center hover:bg-red-600 transition-colors"
                            >
                              <X className="w-4 h-4" />
                            </button>
                          </div>
                        ) : (
                          <>
                            <Upload className="w-8 h-8 text-gray-400 dark:text-slate-500 mb-2" />
                            <span className="text-sm text-gray-600 dark:text-slate-300">{t('common.labels.clickToUploadImage')}</span>
                            <span className="text-xs text-gray-500 dark:text-slate-400 mt-1">{t('common.labels.pngJpgUpTo5Mb')}</span>
                          </>
                        )}
                      </label>
                    </div>
                    {errors.image && <p className="text-xs text-red-600 mt-1">{errors.image}</p>}
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Error Display */}
          {errors.form && (
            <div className="mt-6 p-4 bg-red-50 border border-red-200 rounded-lg">
              <p className="text-sm text-red-600">{errors.form}</p>
            </div>
          )}

          {/* Action Buttons */}
          <div className="flex justify-end space-x-3 pt-6 border-t border-gray-200 dark:border-slate-800">
            <button
              type="button"
              onClick={onClose}
              className="px-6 py-2 text-gray-700 dark:text-slate-200 border border-gray-300 dark:border-slate-700 rounded-lg hover:bg-gray-50 dark:hover:bg-slate-800 transition-colors"
            >
              {t('common.labels.cancel')}
            </button>
            <button
              type="submit"
              className="px-6 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors flex items-center"
              disabled={loading}
            >
              {loading ? (
                <>
                  <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin mr-2"></div>
                  {t('common.labels.adding')}...
                </>
              ) : (
                <>
                  <Plus className="w-4 h-4 mr-2" />
                  {t('common.labels.addProduct')}
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default AddProductModal;

