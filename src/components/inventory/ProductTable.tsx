import React from 'react';

interface ProductTableProps {
  products: any[];
  onEdit: (product: any) => void;
  onDelete: (product: any) => void;
}

const ProductTable: React.FC<ProductTableProps> = ({ products, onEdit, onDelete }) => {
  return (
    <div className="bg-white dark:bg-slate-900 rounded-lg shadow-sm">
      <div className="p-6 border-b border-gray-200 dark:border-slate-800">
        <h2 className="text-lg font-semibold text-gray-900 dark:text-slate-100">Stock Products</h2>
      </div>
      
      <div className="overflow-x-auto">
        <table className="w-full">
          <thead className="bg-gray-50 dark:bg-slate-800">
            <tr>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-slate-300 uppercase tracking-wider">
                Image
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-slate-300 uppercase tracking-wider">
                Name
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-slate-300 uppercase tracking-wider">
                Category
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-slate-300 uppercase tracking-wider">
                Actions
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-200 dark:divide-slate-700">
            {products.map((product: any) => (
              <tr key={product.id} className="hover:bg-gray-50 dark:hover:bg-slate-800 transition-colors">
                <td className="px-6 py-4">
                  <img
                    src={product.image || `https://images.pexels.com/photos/102104/pexels-photo-102104.jpeg`}
                    alt={product.name}
                    className="w-10 h-10 rounded-lg object-cover"
                    onError={(e) => (e.currentTarget.src = `https://images.pexels.com/photos/102104/pexels-photo-102104.jpeg`)}
                  />
                </td>
                <td className="px-6 py-4 font-medium text-gray-900 dark:text-slate-100">
                  {product.name}
                </td>
                <td className="px-6 py-4 text-gray-700 dark:text-slate-300">
                  {product.category}
                </td>
                <td className="px-6 py-4">
                  <div className="flex space-x-2">
                    <button 
                      onClick={() => onEdit(product)} 
                      className="text-blue-600 hover:text-blue-800 hover:underline transition-colors"
                    >
                      Edit
                    </button>
                    <button 
                      onClick={() => onDelete(product)} 
                      className="text-red-600 hover:text-red-800 hover:underline transition-colors"
                    >
                      Delete
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
};

export default ProductTable;

