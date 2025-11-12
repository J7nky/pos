import React, { useState, useEffect } from 'react';
import { X, AlertTriangle } from 'lucide-react';
import { useProductMultilingual } from '../../hooks/useMultilingual';
import { checkProductReferences, ProductReferences } from '../../services/productReferenceService';

interface DeleteProductConfirmProps {
  open: boolean;
  onClose: () => void;
  onDelete: (product: any) => Promise<void>;
  product: any;
}

const DeleteProductConfirm: React.FC<DeleteProductConfirmProps> = ({ open, onClose, onDelete, product }) => {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [checking, setChecking] = useState(true);
  const [references, setReferences] = useState<ProductReferences | null>(null);
  const { getProductName } = useProductMultilingual();

  // Check for references when modal opens
  useEffect(() => {
    const checkReferences = async () => {
      if (open && product) {
        setChecking(true);
        setError('');
        try {
          const refs = await checkProductReferences(product.id);
          setReferences(refs);
        } catch (err: any) {
          console.error('Error checking product references:', err);
          setError('Failed to check product references');
        } finally {
          setChecking(false);
        }
      }
    };

    checkReferences();
  }, [open, product]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
      <div className="bg-white dark:bg-slate-900 rounded-lg max-w-md w-full shadow-2xl ring-1 ring-black/5 dark:ring-white/10">
        <div className="p-6 border-b border-gray-200 dark:border-slate-800 bg-gradient-to-r from-red-50 to-pink-50 dark:from-slate-800 dark:to-slate-800">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-xl font-semibold text-gray-900 dark:text-slate-100">Delete Product</h2>
              <p className="text-sm text-gray-600 dark:text-slate-300 mt-1">This action cannot be undone</p>
            </div>
            <button
              onClick={onClose}
              className="p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100 dark:hover:bg-slate-800 rounded-lg transition-colors"
            >
              <X className="w-6 h-6" />
            </button>
          </div>
        </div>
        
        <div className="p-6">
          {checking ? (
            <div className="flex items-center justify-center py-8">
              <div className="w-8 h-8 border-4 border-blue-600 border-t-transparent rounded-full animate-spin"></div>
              <span className="ml-3 text-gray-600 dark:text-slate-300">Checking references...</span>
            </div>
          ) : references?.hasReferences ? (
            <div>
              <div className="flex items-start space-x-3 p-4 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-lg mb-4">
                <AlertTriangle className="w-6 h-6 text-amber-600 dark:text-amber-400 flex-shrink-0 mt-0.5" />
                <div className="flex-1">
                  <h3 className="font-semibold text-amber-900 dark:text-amber-100 mb-2">
                    Cannot Delete Product
                  </h3>
                  <p className="text-sm text-amber-800 dark:text-amber-200 mb-3">
                    This product cannot be deleted because it is still referenced in the following:
                  </p>
                  <ul className="space-y-2 text-sm text-amber-800 dark:text-amber-200">
                    {references.billLineItems > 0 && (
                      <li className="flex items-center">
                        <span className="w-2 h-2 bg-amber-600 dark:bg-amber-400 rounded-full mr-2"></span>
                        <strong className="font-medium">{references.billLineItems}</strong>
                        <span className="ml-1">Bill Line Item{references.billLineItems > 1 ? 's' : ''}</span>
                      </li>
                    )}
                    {references.inventoryItems > 0 && (
                      <li className="flex items-center">
                        <span className="w-2 h-2 bg-amber-600 dark:bg-amber-400 rounded-full mr-2"></span>
                        <strong className="font-medium">{references.inventoryItems}</strong>
                        <span className="ml-1">Inventory Item{references.inventoryItems > 1 ? 's' : ''}</span>
                      </li>
                    )}
                  </ul>
                  <p className="text-sm text-amber-800 dark:text-amber-200 mt-3">
                    Please remove all references before attempting to delete this product.
                  </p>
                </div>
              </div>
              <div className="flex justify-end">
                <button 
                  type="button" 
                  onClick={onClose} 
                  className="px-4 py-2 bg-gray-600 text-white rounded-lg hover:bg-gray-700 transition-colors"
                >
                  Close
                </button>
              </div>
            </div>
          ) : (
            <div>
              <p className="text-gray-800 dark:text-slate-200">
                Are you sure you want to delete <b>{getProductName(product)}</b>?
              </p>
              {error && <p className="text-xs text-red-600 mt-2">{error}</p>}
              
              <div className="flex justify-end space-x-3 pt-4">
                <button 
                  type="button" 
                  onClick={onClose} 
                  className="px-4 py-2 text-gray-700 dark:text-slate-200 border border-gray-300 dark:border-slate-700 rounded-lg hover:bg-gray-50 dark:hover:bg-slate-800 transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  className="px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors flex items-center"
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
                  {loading ? (
                    <>
                      <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin mr-2"></div>
                      Deleting...
                    </>
                  ) : (
                    'Delete'
                  )}
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default DeleteProductConfirm;

