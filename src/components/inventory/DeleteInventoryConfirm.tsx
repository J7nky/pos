import React, { useState, useEffect } from 'react';
import { X, AlertTriangle } from 'lucide-react';
import { useOfflineData } from '../../contexts/OfflineDataContext';

interface DeleteInventoryConfirmProps {
  item: any;
  onClose: () => void;
  onDelete: (item: any) => Promise<void>;
}

const DeleteInventoryConfirm: React.FC<DeleteInventoryConfirmProps> = ({ item, onClose, onDelete }) => {
  const { checkInventoryItemReferences } = useOfflineData();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [references, setReferences] = useState({ salesCount: 0, variancesCount: 0, hasReferences: false });

  useEffect(() => {
    const checkReferences = async () => {
      try {
        const refs = await checkInventoryItemReferences(item.id);
        setReferences(refs);
      } catch (err) {
        console.error('Error checking references:', err);
      }
    };
    checkReferences();
  }, [item.id, checkInventoryItemReferences]);

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
      <div className="bg-white dark:bg-slate-900 rounded-lg max-w-md w-full shadow-2xl ring-1 ring-black/5 dark:ring-white/10">
        <div className="p-6 border-b border-gray-200 dark:border-slate-800 bg-gradient-to-r from-red-50 to-pink-50 dark:from-slate-800 dark:to-slate-800">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-xl font-semibold text-gray-900 dark:text-slate-100">Delete Inventory Item</h2>
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
          <p className="text-gray-800 dark:text-slate-200 mb-4">
            Are you sure you want to delete this inventory item?
          </p>
          
          {references.hasReferences && (
            <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg p-4 mb-4">
              <div className="flex items-start">
                <AlertTriangle className="w-5 h-5 text-red-600 dark:text-red-400 mt-0.5 mr-3 flex-shrink-0" />
                <div className="flex-1">
                  <h3 className="text-sm font-semibold text-red-800 dark:text-red-200 mb-1">
                    Warning: Related Records Will Be Deleted
                  </h3>
                  <ul className="text-xs text-red-700 dark:text-red-300 space-y-1">
                    {references.salesCount > 0 && (
                      <li>• <strong>{references.salesCount}</strong> sale record(s) will be permanently deleted</li>
                    )}
                    {references.variancesCount > 0 && (
                      <li>• <strong>{references.variancesCount}</strong> variance record(s) will be permanently deleted</li>
                    )}
                  </ul>
                  <p className="text-xs font-medium text-red-800 dark:text-red-200 mt-2">
                    This action cannot be undone!
                  </p>
                </div>
              </div>
            </div>
          )}
          
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
                  await onDelete(item);
                  onClose();
                } catch (err: any) {
                  setError('Failed to delete inventory item.');
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
      </div>
    </div>
  );
};

export default DeleteInventoryConfirm;

