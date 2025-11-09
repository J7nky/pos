import { useState, useEffect, useRef } from 'react';
import { Plus, Edit, Trash2, X, Loader2, Upload } from 'lucide-react';
import { Product, getTranslatedString, type MultilingualString } from '@pos-platform/shared';
import { supabase } from '../lib/supabase';
import { v4 as uuidv4 } from 'uuid';

type ProductCategory = 'Fruits' | 'Vegetables' | 'Herbs' | 'Nuts' | 'Others';

interface ProductFormData {
  nameEn: string;
  nameAr: string;
  nameFr: string;
  category: ProductCategory;
  image: string;
  imageFile: File | null;
}

export default function GlobalProducts() {
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editingProduct, setEditingProduct] = useState<Product | null>(null);
  const [deletingProductId, setDeletingProductId] = useState<string | null>(null);
  const [formData, setFormData] = useState<ProductFormData>({
    nameEn: '',
    nameAr: '',
    nameFr: '',
    category: 'Fruits',
    image: '',
    imageFile: null,
  });
  const [formLoading, setFormLoading] = useState(false);
  const [uploadingImage, setUploadingImage] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Fetch global products
  useEffect(() => {
    fetchProducts();
  }, []);

  const fetchProducts = async () => {
    try {
      setLoading(true);
      const { data, error } = await supabase
        .from('products')
        .select('*')
        .eq('is_global', true)
        .order('created_at', { ascending: false });

      if (error) throw error;

      // Transform database products to Product type
      const transformedProducts: Product[] = (data || []).map((p) => ({
        id: p.id,
        name: p.name as MultilingualString,
        category: p.category,
        image: p.image || '',
        is_global: p.is_global,
        createdAt: p.created_at,
      }));

      setProducts(transformedProducts);
    } catch (error) {
      console.error('Error fetching products:', error);
      setFormError('Failed to load products. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const handleOpenForm = (product?: Product) => {
    if (product) {
      setEditingProduct(product);
      // Extract multilingual name values
      const nameObj = typeof product.name === 'object' ? product.name : { en: product.name };
      setFormData({
        nameEn: nameObj.en || '',
        nameAr: nameObj.ar || '',
        nameFr: nameObj.fr || '',
        category: product.category as ProductCategory,
        image: product.image || '',
        imageFile: null,
      });
    } else {
      setEditingProduct(null);
      setFormData({
        nameEn: '',
        nameAr: '',
        nameFr: '',
        category: 'Fruits',
        image: '',
        imageFile: null,
      });
    }
    setFormError(null);
    setShowForm(true);
  };

  const handleCloseForm = () => {
    setShowForm(false);
    setEditingProduct(null);
    setFormError(null);
    setFormData({
      nameEn: '',
      nameAr: '',
      nameFr: '',
      category: 'Fruits',
      image: '',
      imageFile: null,
    });
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const handleImageSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // Validate file type
    if (!file.type.startsWith('image/')) {
      setFormError('Please select a valid image file (PNG, JPG, JPEG, etc.)');
      return;
    }

    // Validate file size (1MB limit)
    if (file.size > 1 * 1024 * 1024) {
      setFormError('Image size must be less than 5MB');
      return;
    }

    setFormError(null);
    setFormData({ ...formData, imageFile: file, image: '' });

    // Create preview
    const reader = new FileReader();
    reader.onload = (event) => {
      const previewUrl = event.target?.result as string;
      setFormData((prev) => ({ ...prev, image: previewUrl }));
    };
    reader.readAsDataURL(file);
  };

  const uploadImageToStorage = async (file: File): Promise<string> => {
    try {
      setUploadingImage(true);

      // Get file extension
      const fileExt = file.name.split('.').pop();
      const fileName = `${uuidv4()}.${fileExt}`;
      const filePath = `product_images/${fileName}`;

      // Upload file to Supabase Storage
      const { error: uploadError } = await supabase.storage
        .from('product-images')
        .upload(filePath, file, {
          cacheControl: '3600',
          upsert: false,
        });

      if (uploadError) {
        // Provide helpful error message for bucket not found
        if (uploadError.message.includes('Bucket not found') || uploadError.message.includes('bucket')) {
          throw new Error(
            'Storage bucket not found. Please create the "product-images" bucket in Supabase Storage. ' +
            'See SUPABASE_STORAGE_SETUP.md for instructions.'
          );
        }
        throw new Error(`Upload failed: ${uploadError.message}`);
      }

      // Get public URL
      const { data } = supabase.storage
        .from('product-images')
        .getPublicUrl(filePath);

      if (!data.publicUrl) {
        throw new Error('Failed to get public URL for uploaded image');
      }

      return data.publicUrl;
    } finally {
      setUploadingImage(false);
    }
  };

  const deleteImageFromStorage = async (imageUrl: string) => {
    try {
      // Extract file path from URL
      // URL format: https://[project].supabase.co/storage/v1/object/public/product-images/product_images/filename.jpg
      const urlParts = imageUrl.split('/product-images/');
      if (urlParts.length !== 2) {
        // Not a Supabase storage URL, skip deletion (might be external URL)
        return;
      }

      // The path after /product-images/ is the full path in the bucket
      const filePath = urlParts[1];

      // Delete from storage
      const { error } = await supabase.storage
        .from('product-images')
        .remove([filePath]);

      if (error) {
        console.error('Error deleting image from storage:', error);
      }
    } catch (error) {
      console.error('Error deleting image from storage:', error);
      // Don't throw - image deletion failure shouldn't block product update
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!formData.nameEn.trim()) {
      setFormError('Product name (English) is required');
      return;
    }

    if (!formData.imageFile && !formData.image.trim()) {
      setFormError('Please select an image for the product');
      return;
    }

    try {
      setFormLoading(true);
      setFormError(null);

      let imageUrl = formData.image;

      // Upload new image if a file was selected
      if (formData.imageFile) {
        // Delete old image if updating
        if (editingProduct && editingProduct.image) {
          await deleteImageFromStorage(editingProduct.image);
        }

        // Upload new image
        imageUrl = await uploadImageToStorage(formData.imageFile);
      }

      // Create multilingual name object
      const nameObj: Record<string, string> = {};
      if (formData.nameEn.trim()) nameObj.en = formData.nameEn.trim();
      if (formData.nameAr.trim()) nameObj.ar = formData.nameAr.trim();
      if (formData.nameFr.trim()) nameObj.fr = formData.nameFr.trim();

      const productData: any = {
        name: nameObj,
        category: formData.category,
        image: imageUrl,
        is_global: true,
        store_id: null, // Global products have no store_id (null)
        updated_at: new Date().toISOString(),
      };

      if (editingProduct) {
        // Update existing product
        const { error } = await supabase
          .from('products')
          .update(productData)
          .eq('id', editingProduct.id);

        if (error) throw error;
      } else {
        // Create new product
        const { error } = await supabase.from('products').insert({
          id: uuidv4(),
          ...productData,
          created_at: new Date().toISOString(),
        });

        if (error) throw error;
      }

      await fetchProducts();
      handleCloseForm();
    } catch (error: any) {
      console.error('Error saving product:', error);
      setFormError(error.message || 'Failed to save product. Please try again.');
    } finally {
      setFormLoading(false);
    }
  };

  const handleDelete = async (productId: string) => {
    if (!confirm('Are you sure you want to delete this product? This action cannot be undone.')) {
      return;
    }

    try {
      setDeletingProductId(productId);

      // Find product to get image URL
      const product = products.find((p) => p.id === productId);
      
      // Delete product from database
      const { error } = await supabase
        .from('products')
        .delete()
        .eq('id', productId);

      if (error) throw error;

      // Delete image from storage if it exists
      if (product?.image) {
        await deleteImageFromStorage(product.image);
      }

      await fetchProducts();
    } catch (error: any) {
      console.error('Error deleting product:', error);
      alert('Failed to delete product. Please try again.');
    } finally {
      setDeletingProductId(null);
    }
  };

  return (
    <div className="space-y-8">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">Global Products</h1>
          <p className="mt-2 text-gray-600">Manage products available to all stores</p>
        </div>
        <button
          onClick={() => handleOpenForm()}
          className="flex items-center gap-2 px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition-colors"
        >
          <Plus className="w-5 h-5" />
          Add Product
        </button>
      </div>

      {/* Products Table */}
      <div className="bg-white rounded-lg shadow border border-gray-200 overflow-hidden">
        {loading ? (
          <div className="p-8 text-center">
            <Loader2 className="w-8 h-8 animate-spin mx-auto text-indigo-600" />
            <p className="mt-2 text-gray-600">Loading products...</p>
          </div>
        ) : (
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Name
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Category
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Image
                </th>
                <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Actions
                </th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {products.length === 0 ? (
                <tr>
                  <td colSpan={4} className="px-6 py-8 text-center text-gray-500">
                    No global products found. Create your first product!
                  </td>
                </tr>
              ) : (
                products.map((product) => (
                  <tr key={product.id} className="hover:bg-gray-50">
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="text-sm font-medium text-gray-900">
                        {getTranslatedString(product.name, 'en')}
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="text-sm text-gray-500">{product.category}</div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <img
                        src={product.image || '/placeholder.png'}
                        alt={getTranslatedString(product.name, 'en')}
                        className="w-12 h-12 object-cover rounded"
                        onError={(e) => {
                          (e.target as HTMLImageElement).src = '/placeholder.png';
                        }}
                      />
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                      <button
                        onClick={() => handleOpenForm(product)}
                        className="text-indigo-600 hover:text-indigo-900 mr-4"
                        title="Edit"
                      >
                        <Edit className="w-5 h-5 inline" />
                      </button>
                      <button
                        onClick={() => handleDelete(product.id)}
                        disabled={deletingProductId === product.id}
                        className="text-red-600 hover:text-red-900 disabled:opacity-50"
                        title="Delete"
                      >
                        {deletingProductId === product.id ? (
                          <Loader2 className="w-5 h-5 inline animate-spin" />
                        ) : (
                          <Trash2 className="w-5 h-5 inline" />
                        )}
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        )}
      </div>

      {/* Product Form Modal */}
      {showForm && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-lg p-6 max-w-2xl w-full max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-2xl font-bold text-gray-900">
                {editingProduct ? 'Edit Product' : 'Add Product'}
              </h2>
              <button
                onClick={handleCloseForm}
                className="text-gray-400 hover:text-gray-600"
                disabled={formLoading}
              >
                <X className="w-6 h-6" />
              </button>
            </div>

            <form onSubmit={handleSubmit} className="space-y-6">
              {formError && (
                <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded">
                  <div className="font-medium mb-1">Error</div>
                  <div className="text-sm">{formError}</div>
                  {formError.includes('bucket') && (
                    <div className="mt-3 text-sm">
                      <p className="font-medium mb-2">Quick Setup:</p>
                      <ol className="list-decimal list-inside space-y-1 text-xs">
                        <li>Go to your Supabase project dashboard</li>
                        <li>Navigate to <strong>Storage</strong> in the left sidebar</li>
                        <li>Click <strong>New bucket</strong></li>
                        <li>Name: <strong>product-images</strong> (exact match required)</li>
                        <li>Enable <strong>Public bucket</strong></li>
                        <li>Set file size limit to <strong>5MB</strong></li>
                        <li>Click <strong>Create bucket</strong></li>
                      </ol>
                      <p className="mt-2 text-xs text-gray-600">
                        See <code className="bg-gray-200 px-1 rounded">SUPABASE_STORAGE_SETUP.md</code> for detailed instructions and RLS policies.
                      </p>
                    </div>
                  )}
                </div>
              )}

              {/* Multilingual Name Fields */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Product Name (English) <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  value={formData.nameEn}
                  onChange={(e) => setFormData({ ...formData, nameEn: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
                  placeholder="Enter product name in English"
                  required
                  disabled={formLoading}
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Product Name (Arabic)
                </label>
                <input
                  type="text"
                  value={formData.nameAr}
                  onChange={(e) => setFormData({ ...formData, nameAr: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
                  placeholder="Enter product name in Arabic"
                  disabled={formLoading}
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Product Name (French)
                </label>
                <input
                  type="text"
                  value={formData.nameFr}
                  onChange={(e) => setFormData({ ...formData, nameFr: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
                  placeholder="Enter product name in French"
                  disabled={formLoading}
                />
              </div>

              {/* Category */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Category <span className="text-red-500">*</span>
                </label>
                <select
                  value={formData.category}
                  onChange={(e) => setFormData({ ...formData, category: e.target.value as ProductCategory })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
                  required
                  disabled={formLoading}
                >
                  <option value="Fruits">Fruits</option>
                  <option value="Vegetables">Vegetables</option>
                  <option value="Herbs">Herbs</option>
                  <option value="Nuts">Nuts</option>
                  <option value="Others">Others</option>
                </select>
              </div>

              {/* Image Upload */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Product Image <span className="text-red-500">*</span>
                </label>
                <div className="space-y-3">
                  <div className="flex items-center gap-3">
                    <input
                      ref={fileInputRef}
                      type="file"
                      accept="image/*"
                      onChange={handleImageSelect}
                      className="hidden"
                      id="image-upload"
                      disabled={formLoading || uploadingImage}
                    />
                    <label
                      htmlFor="image-upload"
                      className={`flex items-center gap-2 px-4 py-2 border-2 border-dashed rounded-lg cursor-pointer transition-colors ${
                        formLoading || uploadingImage
                          ? 'border-gray-300 bg-gray-100 cursor-not-allowed'
                          : 'border-indigo-300 bg-indigo-50 hover:border-indigo-400 hover:bg-indigo-100'
                      }`}
                    >
                      {uploadingImage ? (
                        <>
                          <Loader2 className="w-5 h-5 animate-spin text-indigo-600" />
                          <span className="text-sm text-indigo-600">Uploading...</span>
                        </>
                      ) : (
                        <>
                          <Upload className="w-5 h-5 text-indigo-600" />
                          <span className="text-sm text-indigo-600">
                            {formData.imageFile ? 'Change Image' : 'Choose Image'}
                          </span>
                        </>
                      )}
                    </label>
                    {formData.imageFile && (
                      <span className="text-sm text-gray-600">
                        {formData.imageFile.name}
                      </span>
                    )}
                  </div>
                  
                  {formData.image && (
                    <div className="mt-2">
                      <div className="relative inline-block">
                        <img
                          src={formData.image}
                          alt="Preview"
                          className="w-32 h-32 object-cover rounded-lg border-2 border-gray-300"
                          onError={(e) => {
                            (e.target as HTMLImageElement).style.display = 'none';
                          }}
                        />
                        {formData.imageFile && (
                          <div className="absolute top-1 right-1 bg-green-500 text-white text-xs px-2 py-1 rounded">
                            New
                          </div>
                        )}
                      </div>
                      {!formData.imageFile && editingProduct && (
                        <p className="text-xs text-gray-500 mt-1">
                          Current image (select a new file to replace)
                        </p>
                      )}
                    </div>
                  )}
                  
                  <p className="text-xs text-gray-500">
                    Supported formats: PNG, JPG, JPEG. Max size: 5MB
                  </p>
                </div>
              </div>

              {/* Form Actions */}
              <div className="flex items-center justify-end gap-3 pt-4 border-t">
                <button
                  type="button"
                  onClick={handleCloseForm}
                  className="px-4 py-2 text-gray-700 bg-gray-200 rounded-lg hover:bg-gray-300 transition-colors"
                  disabled={formLoading}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
                  disabled={formLoading || uploadingImage}
                >
                  {(formLoading || uploadingImage) && <Loader2 className="w-4 h-4 animate-spin" />}
                  {uploadingImage
                    ? 'Uploading Image...'
                    : editingProduct
                    ? 'Update Product'
                    : 'Add Product'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

