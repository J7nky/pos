import React, { useState, useMemo } from 'react';
import { useI18n } from '../../i18n';
import { Pagination } from '../common/Pagination';
import { useProductMultilingual } from '../../hooks/useMultilingual';
import { getProductImageUrl, handleImageError } from '../../constants/productImages';

interface ProductTableProps {
  products: any[];
  onEdit: (product: any) => void;
  onDelete: (product: any) => void;
  loading?: boolean;
}

const ProductTable: React.FC<ProductTableProps> = ({ products, onEdit, onDelete, loading = false }) => {
  const { t, language } = useI18n();
  const { getProductName } = useProductMultilingual();
  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 20;

  const paginatedProducts = useMemo(() => {
    const startIndex = (currentPage - 1) * itemsPerPage;
    return products.slice(startIndex, startIndex + itemsPerPage);
  }, [products, currentPage]);

  const totalPages = Math.ceil(products.length / itemsPerPage);
  
  if (loading) {
    return (
      <div className="bg-white dark:bg-slate-900 rounded-lg shadow-sm">
        <div className="p-6 border-b border-gray-200 dark:border-slate-800">
          <h2 className="text-lg font-semibold text-gray-900 dark:text-slate-100">{t('inventory.stockProducts')}</h2>
        </div>
        <div className="p-6 text-center">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto"></div>
          <p className="mt-2 text-gray-500 dark:text-slate-400">{t('app.loading')}</p>
        </div>
      </div>
    );
  }

  if (products.length === 0) {
    return (
      <div className="bg-white dark:bg-slate-900 rounded-lg shadow-sm">
        <div className="p-6 border-b border-gray-200 dark:border-slate-800">
          <h2 className="text-lg font-semibold text-gray-900 dark:text-slate-100">{t('inventory.stockProducts')}</h2>
        </div>
        <div className="p-6 text-center">
          <div className="w-16 h-16 bg-gray-100 dark:bg-slate-800 rounded-full flex items-center justify-center mx-auto mb-4">
            <svg className="w-8 h-8 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4" />
            </svg>
          </div>
          <p className="text-gray-500 dark:text-slate-400">{t('inventory.noProducts')}</p>
        </div>
      </div>
    );
  }
  
  return (
    <div className="bg-white dark:bg-slate-900 rounded-lg shadow-sm">
      <div className="p-6 border-b border-gray-200 dark:border-slate-800">
        <h2 className="text-lg font-semibold text-gray-900 dark:text-slate-100">{t('inventory.stockProducts')}</h2>
      </div>
      
      <div className="overflow-x-auto">
        <table className="w-full">
          <thead className="bg-gray-50 dark:bg-slate-800">
            <tr>
              <th className="px-6 py-3 text-right rtl:text-right ltr:text-left text-xs font-medium text-gray-500 dark:text-slate-300 uppercase tracking-wider">
                {t('common.labels.image')}
              </th>
              <th className="px-6 py-3 text-right rtl:text-right ltr:text-left text-xs font-medium text-gray-500 dark:text-slate-300 uppercase tracking-wider">
                {t('inventory.productName')}
              </th>
              <th className="px-6 py-3 text-right rtl:text-right ltr:text-left text-xs font-medium text-gray-500 dark:text-slate-300 uppercase tracking-wider">
                {t('inventory.category')}
              </th>
              <th className="px-6 py-3 text-right rtl:text-right ltr:text-left text-xs font-medium text-gray-500 dark:text-slate-300 uppercase tracking-wider">
                {t('inventory.actions')}
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-200 dark:divide-slate-700">
            {paginatedProducts.map((product: any) => (
              <tr key={product.id} className="hover:bg-gray-50 dark:hover:bg-slate-800 transition-colors">
                <td className="px-6 py-4 rtl:text-right ltr:text-left">
                  <img
                    src={getProductImageUrl(product.image)}
                    alt={getProductName(product)}
                    className="w-10 h-10 rounded-lg object-cover"
                    onError={handleImageError}
                  />
                </td>
                <td className="px-6 py-4 font-medium text-gray-900 dark:text-slate-100 rtl:text-right ltr:text-left">
                  {getProductName(product)}
                </td>
                <td className="px-6 py-4 text-gray-700 dark:text-slate-300 rtl:text-right ltr:text-left">
                  {product.category}
                </td>
                <td className="px-6 py-4 rtl:text-right ltr:text-left">
                  <div className="flex space-x-2 rtl:space-x-reverse">
                    <button 
                      onClick={() => onEdit(product)} 
                      className="text-blue-600 hover:text-blue-800 hover:underline transition-colors"
                    >
                      {t('inventory.edit')}
                    </button>
                    <button 
                      onClick={() => onDelete(product)} 
                      className="text-red-600 hover:text-red-800 hover:underline transition-colors"
                    >
                      {t('inventory.delete')}
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {totalPages > 1 && (
        <Pagination
          currentPage={currentPage}
          totalPages={totalPages}
          onPageChange={setCurrentPage}
          itemsPerPage={itemsPerPage}
          totalItems={products.length}
        />
      )}
    </div>
  );
};

export default ProductTable;

