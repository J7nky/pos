import React, { useState, useMemo } from 'react';
import { Search, Archive, Trash2, RotateCcw, Package } from 'lucide-react';
import { useI18n } from '../../i18n';
import { useProductMultilingual } from '../../hooks/useMultilingual';
import { Pagination } from '../common/Pagination';
import { parseMultilingualString } from '../../utils/multilingual';
import { normalizeNameForComparison } from '../../utils/nameNormalization';

interface ArchivedInventoryTabProps {
  items: any[];
  products: any[];
  onUnarchive: (item: any) => Promise<void>;
  onDelete: (item: any) => Promise<void>;
}

const ArchivedInventoryTab: React.FC<ArchivedInventoryTabProps> = ({
  items,
  products,
  onUnarchive,
  onDelete,
}) => {
  const { t } = useI18n();
  const { getProductName } = useProductMultilingual();

  const [searchTerm, setSearchTerm] = useState('');
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [currentPage, setCurrentPage] = useState(1);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [bulkLoading, setBulkLoading] = useState(false);
  const [confirmBulkDelete, setConfirmBulkDelete] = useState(false);

  const itemsPerPage = 15;

  const filtered = useMemo(() => {
    if (!searchTerm.trim()) return items;
    const needle = normalizeNameForComparison(searchTerm);
    return items.filter(item => {
      const product = products.find((p: any) => p.id === item.product_id);
      if (!product) return false;
      const parsed = parseMultilingualString(product.name);
      const names = typeof parsed === 'string'
        ? [parsed]
        : [parsed?.en ?? '', parsed?.ar ?? '', parsed?.fr ?? ''].filter(Boolean);
      return names.some(n => normalizeNameForComparison(n).includes(needle));
    });
  }, [items, products, searchTerm]);

  const totalPages = Math.ceil(filtered.length / itemsPerPage);
  const paginated = filtered.slice((currentPage - 1) * itemsPerPage, currentPage * itemsPerPage);

  const allPageSelected = paginated.length > 0 && paginated.every(i => selected.has(i.id));

  const toggleSelectAll = () => {
    if (allPageSelected) {
      setSelected(prev => {
        const next = new Set(prev);
        paginated.forEach(i => next.delete(i.id));
        return next;
      });
    } else {
      setSelected(prev => {
        const next = new Set(prev);
        paginated.forEach(i => next.add(i.id));
        return next;
      });
    }
  };

  const toggleItem = (id: string) => {
    setSelected(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  const handleUnarchive = async (item: any) => {
    setActionLoading(item.id + '_restore');
    try { await onUnarchive(item); } finally { setActionLoading(null); }
  };

  const handleDelete = async (item: any) => {
    setActionLoading(item.id + '_delete');
    try { await onDelete(item); } finally { setActionLoading(null); }
  };

  const handleBulkUnarchive = async () => {
    setBulkLoading(true);
    try {
      for (const id of selected) {
        const item = items.find(i => i.id === id);
        if (item) await onUnarchive(item);
      }
      setSelected(new Set());
    } finally {
      setBulkLoading(false);
    }
  };

  const handleBulkDelete = async () => {
    setBulkLoading(true);
    try {
      for (const id of selected) {
        const item = items.find(i => i.id === id);
        if (item) await onDelete(item);
      }
      setSelected(new Set());
      setConfirmBulkDelete(false);
    } finally {
      setBulkLoading(false);
    }
  };

  if (items.length === 0) {
    return (
      <div className="bg-white dark:bg-slate-900 rounded-lg shadow-sm p-12 text-center">
        <Archive className="w-12 h-12 text-gray-300 dark:text-slate-600 mx-auto mb-4" />
        <h3 className="text-lg font-medium text-gray-700 dark:text-slate-300 mb-1">
          {t('inventory.noArchivedItems')}
        </h3>
        <p className="text-sm text-gray-500 dark:text-slate-400">
          {t('inventory.noArchivedItemsDesc')}
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Search + bulk actions bar */}
      <div className="bg-white dark:bg-slate-900 p-4 rounded-lg shadow-sm flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Search className="w-5 h-5 absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <input
            type="text"
            placeholder={t('inventory.searchProducts')}
            value={searchTerm}
            onChange={e => { setSearchTerm(e.target.value); setCurrentPage(1); }}
            className="w-full pl-10 pr-4 py-2 border border-gray-300 dark:border-slate-700 rounded-lg focus:ring-blue-500 focus:border-blue-500 dark:bg-slate-800 dark:text-slate-100 text-sm"
          />
        </div>

        {selected.size > 0 && (
          <div className="flex items-center gap-2 shrink-0">
            <span className="text-sm text-gray-600 dark:text-slate-300">
              {t('inventory.selectedCount').replace('{{count}}', String(selected.size))}
            </span>
            <button
              disabled={bulkLoading}
              onClick={handleBulkUnarchive}
              className="px-3 py-2 text-sm bg-blue-600 hover:bg-blue-700 text-white rounded-lg flex items-center gap-1 transition-colors disabled:opacity-50"
            >
              <RotateCcw className="w-4 h-4" />
              {t('inventory.bulkUnarchive')}
            </button>
            <button
              disabled={bulkLoading}
              onClick={() => setConfirmBulkDelete(true)}
              className="px-3 py-2 text-sm bg-red-600 hover:bg-red-700 text-white rounded-lg flex items-center gap-1 transition-colors disabled:opacity-50"
            >
              <Trash2 className="w-4 h-4" />
              {t('inventory.bulkDelete')}
            </button>
          </div>
        )}
      </div>

      {/* Table */}
      <div className="bg-white dark:bg-slate-900 rounded-lg shadow-sm overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 dark:bg-slate-800 border-b border-gray-200 dark:border-slate-700">
            <tr>
              <th className="w-10 px-4 py-3">
                <input
                  type="checkbox"
                  checked={allPageSelected}
                  onChange={toggleSelectAll}
                  className="rounded border-gray-300 dark:border-slate-600 text-blue-600"
                />
              </th>
              <th className="px-4 py-3 text-left font-medium text-gray-600 dark:text-slate-300">
                {t('inventory.products')}
              </th>
              <th className="px-4 py-3 text-left font-medium text-gray-600 dark:text-slate-300 hidden md:table-cell">
                {t('inventory.quantity')}
              </th>
              <th className="px-4 py-3 text-left font-medium text-gray-600 dark:text-slate-300 hidden md:table-cell">
                {t('inventory.unit')}
              </th>
              <th className="px-4 py-3 text-right font-medium text-gray-600 dark:text-slate-300">
                {t('inventory.actions')}
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100 dark:divide-slate-800">
            {paginated.map(item => {
              const product = products.find((p: any) => p.id === item.product_id);
              const name = product ? getProductName(product) : item.product_id;
              const isRestoring = actionLoading === item.id + '_restore';
              const isDeleting = actionLoading === item.id + '_delete';

              return (
                <tr
                  key={item.id}
                  className={`hover:bg-gray-50 dark:hover:bg-slate-800/50 transition-colors ${
                    selected.has(item.id) ? 'bg-blue-50 dark:bg-blue-900/10' : ''
                  }`}
                >
                  <td className="px-4 py-3">
                    <input
                      type="checkbox"
                      checked={selected.has(item.id)}
                      onChange={() => toggleItem(item.id)}
                      className="rounded border-gray-300 dark:border-slate-600 text-blue-600"
                    />
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2">
                      <Package className="w-4 h-4 text-gray-400 shrink-0" />
                      <span className="font-medium text-gray-900 dark:text-slate-100">{name}</span>
                    </div>
                  </td>
                  <td className="px-4 py-3 text-gray-600 dark:text-slate-300 hidden md:table-cell">
                    {item.quantity}
                  </td>
                  <td className="px-4 py-3 text-gray-600 dark:text-slate-300 hidden md:table-cell">
                    {item.unit}
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center justify-end gap-2">
                      {/* Archived badge */}
                      <span className="hidden sm:inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300">
                        <Archive className="w-3 h-3" />
                        {t('inventory.archivedItems').replace('Items', '').trim()}
                      </span>

                      <button
                        disabled={isRestoring || isDeleting}
                        onClick={() => handleUnarchive(item)}
                        title={t('inventory.unarchive')}
                        className="p-1.5 text-blue-600 hover:bg-blue-50 dark:hover:bg-blue-900/20 rounded-md transition-colors disabled:opacity-40"
                      >
                        {isRestoring
                          ? <div className="w-4 h-4 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
                          : <RotateCcw className="w-4 h-4" />}
                      </button>

                      <button
                        disabled={isRestoring || isDeleting}
                        onClick={() => handleDelete(item)}
                        title={t('inventory.permanentDeleteTitle')}
                        className="p-1.5 text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-md transition-colors disabled:opacity-40"
                      >
                        {isDeleting
                          ? <div className="w-4 h-4 border-2 border-red-500 border-t-transparent rounded-full animate-spin" />
                          : <Trash2 className="w-4 h-4" />}
                      </button>
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>

        {filtered.length === 0 && (
          <div className="py-10 text-center text-gray-500 dark:text-slate-400 text-sm">
            {t('inventory.searchProducts')}…
          </div>
        )}
      </div>

      {totalPages > 1 && (
        <Pagination
          currentPage={currentPage}
          totalPages={totalPages}
          onPageChange={setCurrentPage}
        />
      )}

      {/* Bulk delete confirm dialog */}
      {confirmBulkDelete && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
          <div className="bg-white dark:bg-slate-900 rounded-lg max-w-sm w-full shadow-2xl ring-1 ring-black/5 dark:ring-white/10 p-6">
            <h3 className="text-lg font-semibold text-gray-900 dark:text-slate-100 mb-2">
              {t('inventory.permanentDeleteTitle')}
            </h3>
            <p className="text-sm text-gray-600 dark:text-slate-300 mb-6">
              {t('inventory.confirmBulkDelete').replace('{{count}}', String(selected.size))}
            </p>
            <div className="flex justify-end gap-3">
              <button
                onClick={() => setConfirmBulkDelete(false)}
                className="px-4 py-2 text-gray-700 dark:text-slate-200 border border-gray-300 dark:border-slate-700 rounded-lg hover:bg-gray-50 dark:hover:bg-slate-800 transition-colors text-sm"
              >
                {t('inventory.cancel')}
              </button>
              <button
                disabled={bulkLoading}
                onClick={handleBulkDelete}
                className="px-4 py-2 bg-red-600 hover:bg-red-700 text-white rounded-lg text-sm flex items-center gap-2 transition-colors disabled:opacity-50"
              >
                {bulkLoading && <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />}
                {t('inventory.bulkDelete')}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default ArchivedInventoryTab;
