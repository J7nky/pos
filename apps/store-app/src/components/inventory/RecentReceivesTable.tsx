import React, { useState, useMemo, useEffect } from 'react';
import { useI18n } from '../../i18n';
import { Pagination } from '../common/Pagination';
import { useProductMultilingual } from '../../hooks/useMultilingual';
import { getProductImageUrl, handleImageError } from '../../constants/productImages';
import { Search } from 'lucide-react';
import { parseMultilingualString } from '../../utils/multilingual';
import { normalizeNameForComparison } from '../../utils/nameNormalization';

// Function to translate product categories
export const translateCategory = (category: string | undefined, t: (key: string) => string): string => {
  if (!category) return '';
  
  switch (category) {
    case 'Fruits':
      return t('inventory.categoryFruits');
      case 'Tropical Fruits':
        return t('inventory.categoryTropicalFruits');
    case 'Vegetables':
      return t('inventory.categoryVegetables');
    case 'Herbs':
    case 'Herbs/Leafy':
      return t('inventory.categoryHerbs');
    case 'Nuts':
      return t('common.labels.nuts');
    case 'Others':
      return t('common.labels.others');
    case 'Grains':
      return t('inventory.categoryGrains');
    default:
      return category;
  }
};

interface RecentReceivesTableProps {
  recentReceives: any[];
  products: any[];
  suppliers: any[];
  inventoryBills?: any[]; // Add inventoryBills prop for supplier lookup
  onEdit: (item: any) => void;
  onDelete: (item: any) => void;
}

const RecentReceivesTable: React.FC<RecentReceivesTableProps> = ({ 
  recentReceives, 
  products, 
  suppliers,
  inventoryBills = [],
  onEdit, 
  onDelete 
}) => {
  const { t } = useI18n();
  const { getProductName } = useProductMultilingual();
  const [currentPage, setCurrentPage] = useState(1);
  const [searchTerm, setSearchTerm] = useState('');
  const itemsPerPage = 15;

  // Create batch map for supplier lookup
  const batchMap = new Map(inventoryBills.map(b => [b.id, b]));

  // Function to translate batch type
  const translateBatchType = (batchType: string) => {
    switch (batchType) {
      case 'commission':
        return t('inventory.commission');
      case 'cash':
        return t('inventory.typeCash');
      case 'credit':
        return t('inventory.creditPurchase');
      default:
        return batchType;
    }
  };

  // Function to translate supplier names (handles special system suppliers like "Trade")
  const translateSupplierName = (supplier: any): string => {
    if (!supplier?.name) return '';
    
    // Trade is a special system supplier - translate it
    if (supplier.name === 'Trade') {
      return t('inventory.trade');
    }
    
    // Other supplier names are user-entered proper nouns, return as-is
    return supplier.name;
  };

  // Filter receives based on search term
  const filteredReceives = useMemo(() => {
    if (!searchTerm.trim()) {
      return recentReceives;
    }

    // Normalize search term for Arabic text (handles أ = ا normalization)
    const normalizedSearchTerm = normalizeNameForComparison(searchTerm);

    return recentReceives.filter((item: any) => {
      // Search by product name (multilingual)
      const product = products.find((p: any) => p.id === item.product_id);
      if (product) {
        const parsedName = parseMultilingualString(product.name);
        if (parsedName) {
          // Check all language variants for better search
          const allNames = typeof parsedName === 'string' 
            ? [parsedName]
            : [
                parsedName.en || '',
                parsedName.ar || '',
                parsedName.fr || ''
              ].filter(Boolean);
          
          const matchesProduct = allNames.some(name => {
            const normalizedName = normalizeNameForComparison(name);
            return normalizedName.includes(normalizedSearchTerm);
          });
          if (matchesProduct) return true;
        }
      }

      // Search by supplier name
      const batch = item.batch_id ? batchMap.get(item.batch_id) : null;
      const supplierId = batch?.supplier_id || null;
      const supplier = supplierId ? suppliers.find((s: any) => s.id === supplierId) : null;
      if (supplier) {
        const supplierName = translateSupplierName(supplier);
        const normalizedSupplierName = normalizeNameForComparison(supplierName);
        if (normalizedSupplierName.includes(normalizedSearchTerm)) {
          return true;
        }
      }

      // Search by bill type (batch type) - both translated and original
      const batchType = item.batch_type || '';
      const translatedBatchType = translateBatchType(batchType);
      const normalizedBatchType = normalizeNameForComparison(batchType);
      const normalizedTranslatedBatchType = normalizeNameForComparison(translatedBatchType);
      if (normalizedBatchType.includes(normalizedSearchTerm) || 
          normalizedTranslatedBatchType.includes(normalizedSearchTerm)) {
        return true;
      }

      return false;
    });
  }, [recentReceives, searchTerm, products, suppliers, inventoryBills, batchMap, t]);

  const totalPages = Math.ceil(filteredReceives.length / itemsPerPage);

  // Reset to page 1 when search term changes or if current page is out of bounds
  useEffect(() => {
    setCurrentPage(1);
  }, [searchTerm]);

  useEffect(() => {
    if (currentPage > totalPages && totalPages > 0) {
      setCurrentPage(1);
    }
  }, [totalPages, currentPage]);

  const paginatedReceives = useMemo(() => {
    const startIndex = (currentPage - 1) * itemsPerPage;
    return filteredReceives.slice(startIndex, startIndex + itemsPerPage);
  }, [filteredReceives, currentPage]);

  // Function to translate units
  const translateUnit = (unit: string) => {
    switch (unit?.toLowerCase()) {
      case 'kg':
        return t('common.labels.kg');
      case 'box':
        return t('common.labels.box');
      case 'bag':
        return t('common.labels.bag');
      case 'bundle':
        return t('common.labels.bundle');
      case 'dozen':
        return t('common.labels.dozen');
      case 'piece':
        return t('common.labels.piece');
      case 'units':
        return t('common.labels.units');
      default:
        return unit;
    }
  };
  return (
    <div className="bg-white dark:bg-slate-900 rounded-lg shadow-sm">
      <div className="p-6 border-b border-gray-200 dark:border-slate-800">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold text-gray-900 dark:text-slate-100"> {t('inventory.recentProductReceives')}</h2>
        </div>
        {/* Search Field */}
        <div className="relative">
          <Search className="w-5 h-5 absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400" />
          <input
            type="text"
            placeholder={t('common.placeholders.search') || 'Search by product, supplier, or type...'}
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full pl-10 pr-4 py-2 border border-gray-300 dark:border-slate-700 rounded-lg focus:ring-blue-500 focus:border-blue-500 dark:bg-slate-800 dark:text-slate-100"
          />
        </div>
      </div>
      
      {filteredReceives.length === 0 ? (
        <div className="p-12 text-center">
          <p className="text-gray-500 dark:text-slate-400">
            {searchTerm 
              ? (t('inventory.noProducts') || 'No product receives found matching your search')
              : (t('inventory.noProducts') || 'No product receives found')
            }
          </p>
        </div>
      ) : (
        <>
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-gray-50 dark:bg-slate-800">
                <tr>
                  <th className="px-6 py-3 text-right rtl:text-right ltr:text-left text-xs font-medium text-gray-500 dark:text-slate-300 uppercase tracking-wider">
                    {t('common.labels.product')}
                  </th>
                  <th className="px-6 py-3 text-right rtl:text-right ltr:text-left text-xs font-medium text-gray-500 dark:text-slate-300 uppercase tracking-wider">
                    {t('common.labels.supplier')}
                  </th>
                  <th className="px-6 py-3 text-right rtl:text-right ltr:text-left text-xs font-medium text-gray-500 dark:text-slate-300 uppercase tracking-wider">
                    {t('common.labels.type')}
                  </th>
                  <th className="px-6 py-3 text-right rtl:text-right ltr:text-left text-xs font-medium text-gray-500 dark:text-slate-300 uppercase tracking-wider">
                    {t('common.labels.quantity')}
                  </th>
                  <th className="px-6 py-3 text-right rtl:text-right ltr:text-left text-xs font-medium text-gray-500 dark:text-slate-300 uppercase tracking-wider">
                    {t('common.labels.received')}
                  </th>
                  <th className="px-6 py-3 text-right rtl:text-right ltr:text-left text-xs font-medium text-gray-500 dark:text-slate-300 uppercase tracking-wider">
                    {t('common.labels.actions')}
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200 dark:divide-slate-700">
                {paginatedReceives.map((item: any) => {
                  const product = products.find((p: any) => p.id === item.product_id);
                  // Get supplier_id strictly from batch
                  const batch = item.batch_id ? batchMap.get(item.batch_id) : null;
                  const supplierId = batch?.supplier_id || null;
                  const supplier = supplierId ? suppliers.find((s: any) => s.id === supplierId) : null;

                  return (
                    <tr key={item.id} className="hover:bg-gray-50 dark:hover:bg-slate-800 transition-colors">
                      <td className="px-6 py-4">
                        <div className="flex items-center">
                          <img
                            src={getProductImageUrl(product?.image)}
                            alt={getProductName(product)}
                            className="w-10 h-10 rounded-lg object-cover mr-3"
                            onError={handleImageError}
                          />
                          <div>
                            <p className="font-medium text-gray-900 dark:text-slate-100">{getProductName(product)}</p>
                            <p className="text-sm text-gray-500 dark:text-slate-400">{translateCategory(product?.category, t)}</p>
                          </div>
                        </div>
                      </td>
                      <td className="px-6 py-4 text-gray-900 dark:text-slate-100">{translateSupplierName(supplier)}</td>
                      <td className="px-6 py-4">
                        <span className={`px-2 py-1 text-xs rounded-full ${
                          item.batch_type === 'commission'
                            ? 'bg-green-100 text-green-800 dark:bg-green-900/20 dark:text-green-400'
                            : 'bg-blue-100 text-blue-800 dark:bg-blue-900/20 dark:text-blue-400'
                        }`}>
                          {translateBatchType(item.batch_type)}
                        </span>
                      </td>
                      <td className="px-6 py-4 text-gray-900 dark:text-slate-100 rtl:text-right ltr:text-left">
                        {item.quantity} {translateUnit(item.unit)}
                      </td>
                      <td className="px-6 py-4 text-gray-500 dark:text-slate-400 rtl:text-right ltr:text-left">
                        {new Date(item.created_at).toLocaleDateString()}
                      </td>
                      <td className="px-6 py-4 rtl:text-right ltr:text-left">
                        <div className="flex space-x-2 rtl:space-x-reverse">
                          <button 
                            onClick={() => onEdit(item)} 
                            className="text-blue-600 hover:text-blue-800 hover:underline transition-colors"
                          >
                            {t('common.actions.edit')}
                          </button>
                          <button 
                            onClick={() => onDelete(item)} 
                            className="text-red-600 hover:text-red-800 hover:underline transition-colors"
                          >
                            {t('common.actions.delete')}
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          {totalPages > 1 && (
            <div className="p-4 border-t border-gray-200 dark:border-slate-800">
              <Pagination
                currentPage={currentPage}
                totalPages={totalPages}
                onPageChange={setCurrentPage}
                itemsPerPage={itemsPerPage}
                totalItems={filteredReceives.length}
              />
            </div>
          )}
        </>
      )}
    </div>
  );
};

export default RecentReceivesTable;

