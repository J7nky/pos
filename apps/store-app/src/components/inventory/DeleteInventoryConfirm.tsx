import React, { useState, useEffect } from 'react';
import { X, AlertTriangle, Archive, Trash2 } from 'lucide-react';
import { useOfflineData } from '../../contexts/OfflineDataContext';
import { useI18n } from '../../i18n';

interface DeleteInventoryConfirmProps {
  item: any;
  onClose: () => void;
  onDelete: (item: any) => Promise<void>;
  onArchive: (item: any) => Promise<void>;
}

const DeleteInventoryConfirm: React.FC<DeleteInventoryConfirmProps> = ({
  item,
  onClose,
  onDelete,
  onArchive,
}) => {
  const { checkInventoryItemReferences } = useOfflineData();
  const { t } = useI18n();
  const [loading, setLoading] = useState(false);
  const [checking, setChecking] = useState(true);
  const [error, setError] = useState('');
  const [salesCount, setSalesCount] = useState(0);

  useEffect(() => {
    checkInventoryItemReferences(item.id)
      .then(refs => setSalesCount(refs.salesCount))
      .catch(() => {})
      .finally(() => setChecking(false));
  }, [item.id, checkInventoryItemReferences]);

  const hasReferences = salesCount > 0;

  const headerBg = hasReferences
    ? 'bg-gradient-to-r from-amber-50 to-orange-50 dark:from-slate-800 dark:to-slate-800'
    : 'bg-gradient-to-r from-red-50 to-pink-50 dark:from-slate-800 dark:to-slate-800';

  const handleAction = async (action: 'delete' | 'archive') => {
    setLoading(true);
    setError('');
    try {
      if (action === 'archive') {
        await onArchive(item);
      } else {
        await onDelete(item);
      }
      onClose();
    } catch {
      setError(action === 'archive' ? t('inventory.archiveFailure') : t('inventory.deleteFailure') );
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
      <div className="bg-white dark:bg-slate-900 rounded-lg max-w-md w-full shadow-2xl ring-1 ring-black/5 dark:ring-white/10">
        {/* Header */}
        <div className={`p-6 border-b border-gray-200 dark:border-slate-800 ${headerBg}`}>
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-xl font-semibold text-gray-900 dark:text-slate-100">
                {hasReferences ? t('inventory.hasReferencesTitle') : t('inventory.deleteConfirmTitle')}
              </h2>
              <p className="text-sm text-gray-600 dark:text-slate-300 mt-1">
                {hasReferences
                  ? t('inventory.hasReferencesDesc').replace('{{count}}', String(salesCount))
                  : t('inventory.deleteConfirmDesc')}
              </p>
            </div>
            <button
              onClick={onClose}
              className="p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100 dark:hover:bg-slate-800 rounded-lg transition-colors"
            >
              <X className="w-6 h-6" />
            </button>
          </div>
        </div>

        {/* Body */}
        <div className="p-6">
          {checking ? (
            <div className="flex justify-center py-4">
              <div className="w-6 h-6 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
            </div>
          ) : hasReferences ? (
            /* Restricted state — archive only */
            <div className="bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-lg p-4 mb-4">
              <div className="flex items-start gap-3">
                <AlertTriangle className="w-5 h-5 text-amber-600 dark:text-amber-400 mt-0.5 shrink-0" />
                <div>
                  <p className="text-sm font-semibold text-amber-800 dark:text-amber-200">
                    {salesCount} sale(s) linked to this item
                  </p>
                  <p className="text-xs text-amber-700 dark:text-amber-300 mt-1">
                    {t('inventory.archiveConfirmDesc')}
                  </p>
                </div>
              </div>
            </div>
          ) : (
            /* Clean delete state */
            <p className="text-sm text-gray-600 dark:text-slate-300 mb-4">
              {t('inventory.permanentDeleteDesc')}
            </p>
          )}

          {error && <p className="text-xs text-red-600 dark:text-red-400 mb-3">{error}</p>}

          <div className="flex justify-end gap-3 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-gray-700 dark:text-slate-200 border border-gray-300 dark:border-slate-700 rounded-lg hover:bg-gray-50 dark:hover:bg-slate-800 transition-colors"
            >
              {t('inventory.cancel')}
            </button>

            {!checking && hasReferences ? (
              <button
                type="button"
                disabled={loading}
                onClick={() => handleAction('archive')}
                className="px-4 py-2 bg-amber-500 hover:bg-amber-600 text-white rounded-lg transition-colors flex items-center gap-2"
              >
                <Archive className="w-4 h-4" />
                {loading ? '…' : t('inventory.archive')}
              </button>
            ) : (
              !checking && (
                <button
                  type="button"
                  disabled={loading}
                  onClick={() => handleAction('delete')}
                  className="px-4 py-2 bg-red-600 hover:bg-red-700 text-white rounded-lg transition-colors flex items-center gap-2"
                >
                  <Trash2 className="w-4 h-4" />
                  {loading ? '…' : t('inventory.permanentDeleteTitle')}
                </button>
              )
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default DeleteInventoryConfirm;
