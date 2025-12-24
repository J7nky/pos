import { useState, useEffect, useRef } from 'react';
import { Plus, Trash2, X, Loader2, Upload, Image as ImageIcon, RefreshCw } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { v4 as uuidv4 } from 'uuid';

interface GlobalLogo {
  name: string;
  url: string;
  path: string;
}

interface LogoFormData {
  name: string;
  logoFile: File | null;
}

export default function GlobalLogos() {
  const [logos, setLogos] = useState<GlobalLogo[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [deletingLogoPath, setDeletingLogoPath] = useState<string | null>(null);
  const [formData, setFormData] = useState<LogoFormData>({
    name: '',
    logoFile: null,
  });
  const [formLoading, setFormLoading] = useState(false);
  const [uploadingImage, setUploadingImage] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Fetch global logos from Supabase Storage
  useEffect(() => {
    fetchLogos();
  }, []);

  const fetchLogos = async () => {
    try {
      setLoading(true);
      setFormError(null); // Clear any previous errors
      
      console.log('🔍 Fetching logos from global-logos bucket...');
      
      // List all files in the global-logos bucket
      const { data, error } = await supabase.storage
        .from('global-logos')
        .list('', {
          limit: 100,
          offset: 0,
          sortBy: { column: 'name', order: 'asc' }
        });

      if (error) {
        console.error('❌ Error listing files:', error);
        // If bucket doesn't exist, show helpful error
        if (error.message.includes('Bucket not found') || error.message.includes('bucket')) {
          setFormError('Storage bucket not found. Please create the "global-logos" bucket in Supabase Storage.');
          setLogos([]);
          setLoading(false);
          return;
        }
        // Check for RLS policy errors
        if (error.message.includes('row-level security') || error.message.includes('policy')) {
          setFormError('Permission denied. Please check that the "Public read access for global logos" policy is set up correctly.');
          setLogos([]);
          setLoading(false);
          return;
        }
        throw error;
      }

      console.log('📋 Files found:', data?.length || 0);

      if (!data || data.length === 0) {
        console.log('ℹ️ No files found in bucket');
        setLogos([]);
        setLoading(false);
        return;
      }

      // Get public URLs for each logo
      const logosWithUrls = await Promise.all(
        data
          .filter(file => file.name && !file.name.startsWith('.')) // Filter out hidden files
          .map(async (file) => {
            const path = file.name;
            const { data: urlData } = supabase.storage
              .from('global-logos')
              .getPublicUrl(path);

            return {
              name: file.name.replace(/\.[^/.]+$/, ''), // Remove file extension for display name
              url: urlData.publicUrl,
              path: path
            };
          })
      );

      console.log('✅ Logos loaded:', logosWithUrls.length);
      setLogos(logosWithUrls);
    } catch (error: any) {
      console.error('❌ Error fetching logos:', error);
      setFormError(`Failed to load logos: ${error.message || 'Unknown error'}`);
      setLogos([]);
    } finally {
      setLoading(false);
    }
  };

  const handleOpenForm = () => {
    setFormData({
      name: '',
      logoFile: null,
    });
    setFormError(null);
    setShowForm(true);
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const handleCloseForm = () => {
    setShowForm(false);
    setFormData({
      name: '',
      logoFile: null,
    });
    setFormError(null);
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const handleImageSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // Validate file size (2MB limit)
    if (file.size > 2 * 1024 * 1024) {
      setFormError('File size too large. Please choose an image under 2MB.');
      e.target.value = '';
      return;
    }

    // Validate file type
    if (!file.type.startsWith('image/')) {
      setFormError('Please select a valid image file.');
      e.target.value = '';
      return;
    }

    setFormData(prev => ({
      ...prev,
      logoFile: file,
    }));
    setFormError(null);
  };

  const uploadImageToStorage = async (file: File): Promise<string> => {
    try {
      setUploadingImage(true);

      // Get file extension
      const fileExt = file.name.split('.').pop();
      const fileName = `${uuidv4()}.${fileExt}`;
      const filePath = fileName; // Store directly in root of bucket

      // Upload file to Supabase Storage
      const { error: uploadError } = await supabase.storage
        .from('global-logos')
        .upload(filePath, file, {
          cacheControl: '3600',
          upsert: false,
        });

      if (uploadError) {
        // Provide helpful error message for bucket not found
        if (uploadError.message.includes('Bucket not found') || uploadError.message.includes('bucket')) {
          throw new Error(
            'Storage bucket not found. Please create the "global-logos" bucket in Supabase Storage. ' +
            'The bucket should be public and allow authenticated users to upload.'
          );
        }
        throw new Error(`Upload failed: ${uploadError.message}`);
      }

      // Get public URL
      const { data } = supabase.storage
        .from('global-logos')
        .getPublicUrl(filePath);

      if (!data.publicUrl) {
        throw new Error('Failed to get public URL for uploaded image');
      }

      return data.publicUrl;
    } finally {
      setUploadingImage(false);
    }
  };

  const deleteImageFromStorage = async (logoPath: string) => {
    try {
      const { error } = await supabase.storage
        .from('global-logos')
        .remove([logoPath]);

      if (error) {
        throw new Error(`Delete failed: ${error.message}`);
      }
    } catch (error: any) {
      console.error('Error deleting logo:', error);
      throw error;
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!formData.name.trim()) {
      setFormError('Logo name is required');
      return;
    }

    if (!formData.logoFile) {
      setFormError('Please select an image file');
      return;
    }

    try {
      setFormLoading(true);
      setFormError(null);

      // Upload image to storage
      await uploadImageToStorage(formData.logoFile);

      // Refresh logos list
      await fetchLogos();
      handleCloseForm();
    } catch (error: any) {
      console.error('Error saving logo:', error);
      setFormError(error.message || 'Failed to save logo. Please try again.');
    } finally {
      setFormLoading(false);
    }
  };

  const handleDelete = async (logoPath: string) => {
    if (!confirm('Are you sure you want to delete this logo? This action cannot be undone.')) {
      return;
    }

    try {
      setDeletingLogoPath(logoPath);
      await deleteImageFromStorage(logoPath);
      await fetchLogos();
    } catch (error: any) {
      console.error('Error deleting logo:', error);
      alert(`Failed to delete logo: ${error.message}`);
    } finally {
      setDeletingLogoPath(null);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="w-8 h-8 animate-spin text-blue-600" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">Global Logos</h1>
          <p className="text-gray-600 mt-1">
            Manage logos available to all branches across all stores
          </p>
        </div>
        <div className="flex items-center gap-3">
          <button
            onClick={fetchLogos}
            disabled={loading}
            className="flex items-center gap-2 px-4 py-2 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 transition-colors disabled:opacity-50"
            title="Refresh logos list"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
            Refresh
          </button>
          <button
            onClick={handleOpenForm}
            className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
          >
            <Plus className="w-5 h-5" />
            Add Logo
          </button>
        </div>
      </div>

      {/* Error Message */}
      {formError && !showForm && (
        <div className="p-4 bg-red-50 border border-red-200 rounded-lg text-red-800">
          <div className="font-medium mb-1">Error Loading Logos</div>
          <div className="text-sm mb-3">{formError}</div>
          <button
            onClick={fetchLogos}
            disabled={loading}
            className="px-3 py-1 bg-red-100 hover:bg-red-200 rounded text-sm transition-colors disabled:opacity-50"
          >
            Retry
          </button>
        </div>
      )}

      {/* Logos Grid */}
      {logos.length === 0 ? (
        <div className="text-center py-12 bg-gray-50 rounded-lg">
          <ImageIcon className="w-12 h-12 mx-auto text-gray-400 mb-4" />
          <p className="text-gray-600">No logos found</p>
          <p className="text-sm text-gray-500 mt-2">
            Upload your first logo to get started
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
          {logos.map((logo) => (
            <div
              key={logo.path}
              className="bg-white rounded-lg border border-gray-200 p-4 hover:shadow-lg transition-shadow"
            >
              <div className="relative aspect-square mb-4 bg-gray-50 rounded-lg overflow-hidden">
                <img
                  src={logo.url}
                  alt={logo.name}
                  className="w-full h-full object-contain"
                />
                {deletingLogoPath === logo.path && (
                  <div className="absolute inset-0 bg-black bg-opacity-50 flex items-center justify-center">
                    <Loader2 className="w-8 h-8 animate-spin text-white" />
                  </div>
                )}
              </div>
              <div className="flex items-center justify-between">
                <p className="text-sm font-medium text-gray-900 truncate flex-1">
                  {logo.name}
                </p>
                <button
                  onClick={() => handleDelete(logo.path)}
                  disabled={deletingLogoPath === logo.path}
                  className="ml-2 p-2 text-red-600 hover:bg-red-50 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                  title="Delete logo"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Add/Edit Form Modal */}
      {showForm && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg p-6 w-full max-w-md">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-xl font-bold text-gray-900">Add Global Logo</h2>
              <button
                onClick={handleCloseForm}
                className="text-gray-400 hover:text-gray-600"
              >
                <X className="w-6 h-6" />
              </button>
            </div>

            <form onSubmit={handleSubmit} className="space-y-4">
              {/* Logo Name */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Logo Name
                </label>
                <input
                  type="text"
                  value={formData.name}
                  onChange={(e) => setFormData(prev => ({ ...prev, name: e.target.value }))}
                  placeholder="e.g., Company Logo, Brand A"
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:ring-blue-500 focus:border-blue-500"
                  required
                />
              </div>

              {/* Logo Image */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Logo Image
                </label>
                <div className="border-2 border-dashed border-gray-300 rounded-lg p-6 text-center">
                  {formData.logoFile ? (
                    <div className="space-y-2">
                      <img
                        src={URL.createObjectURL(formData.logoFile)}
                        alt="Preview"
                        className="max-h-32 mx-auto object-contain"
                      />
                      <p className="text-sm text-gray-600">{formData.logoFile.name}</p>
                      <button
                        type="button"
                        onClick={() => {
                          setFormData(prev => ({ ...prev, logoFile: null }));
                          if (fileInputRef.current) {
                            fileInputRef.current.value = '';
                          }
                        }}
                        className="text-sm text-red-600 hover:text-red-700"
                      >
                        Remove
                      </button>
                    </div>
                  ) : (
                    <div>
                      <Upload className="w-8 h-8 mx-auto text-gray-400 mb-2" />
                      <p className="text-sm text-gray-600 mb-2">
                        Click to upload or drag and drop
                      </p>
                      <p className="text-xs text-gray-500">
                        PNG, JPEG, WebP (Max 2MB)
                      </p>
                    </div>
                  )}
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept="image/*"
                    onChange={handleImageSelect}
                    className="hidden"
                    id="logo-upload"
                  />
                  <label
                    htmlFor="logo-upload"
                    className="mt-2 inline-block px-4 py-2 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 cursor-pointer"
                  >
                    Choose File
                  </label>
                </div>
              </div>

              {/* Error Message */}
              {formError && (
                <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-red-800 text-sm">
                  {formError}
                </div>
              )}

              {/* Form Actions */}
              <div className="flex gap-3 pt-4">
                <button
                  type="button"
                  onClick={handleCloseForm}
                  className="flex-1 px-4 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors"
                  disabled={formLoading}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="flex-1 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                  disabled={formLoading || uploadingImage}
                >
                  {formLoading || uploadingImage ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" />
                      {uploadingImage ? 'Uploading...' : 'Saving...'}
                    </>
                  ) : (
                    'Upload Logo'
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

