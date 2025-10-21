import React from 'react';
import { useI18n } from '../../i18n';
interface RecentReceivesTableProps {
  recentReceives: any[];
  products: any[];
  suppliers: any[];
  onEdit: (item: any) => void;
  onDelete: (item: any) => void;
}

const RecentReceivesTable: React.FC<RecentReceivesTableProps> = ({ 
  recentReceives, 
  products, 
  suppliers, 
  onEdit, 
  onDelete 
}) => {
  const { t } = useI18n();
  return (
    <div className="bg-white dark:bg-slate-900 rounded-lg shadow-sm">
      <div className="p-6 border-b border-gray-200 dark:border-slate-800">
        <h2 className="text-lg font-semibold text-gray-900 dark:text-slate-100"> {t('inventory.recentProductReceives')}</h2>
      </div>
      
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
            {recentReceives.map((item: any) => {
              const product = products.find((p: any) => p.id === item.product_id);
              const supplier = suppliers.find((s: any) => s.id === item.supplier_id);

              return (
                <tr key={item.id} className="hover:bg-gray-50 dark:hover:bg-slate-800 transition-colors">
                  <td className="px-6 py-4">
                    <div className="flex items-center">
                      <img
                        src={product?.image || `https://images.pexels.com/photos/102104/pexels-photo-102104.jpeg`}
                        alt={product?.name}
                        className="w-10 h-10 rounded-lg object-cover mr-3"
                        onError={(e) => (e.currentTarget.src = `https://images.pexels.com/photos/102104/pexels-photo-102104.jpeg`)}
                      />
                      <div>
                        <p className="font-medium text-gray-900 dark:text-slate-100">{product?.name}</p>
                        <p className="text-sm text-gray-500 dark:text-slate-400">{product?.category}</p>
                      </div>
                    </div>
                  </td>
                  <td className="px-6 py-4 text-gray-900 dark:text-slate-100">{supplier?.name}</td>
                  <td className="px-6 py-4">
                    <span className={`px-2 py-1 text-xs rounded-full ${
                      item.batch_type === 'commission'
                        ? 'bg-green-100 text-green-800 dark:bg-green-900/20 dark:text-green-400'
                        : 'bg-blue-100 text-blue-800 dark:bg-blue-900/20 dark:text-blue-400'
                    }`}>
                      {item.batch_type}
                    </span>
                  </td>
                  <td className="px-6 py-4 text-gray-900 dark:text-slate-100 rtl:text-right ltr:text-left">
                    {item.quantity} {item.unit}
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
    </div>
  );
};

export default RecentReceivesTable;

