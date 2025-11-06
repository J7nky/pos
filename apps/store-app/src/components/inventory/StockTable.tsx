import React, { useState } from 'react';

interface StockTableProps {
  filteredStockLevels: any[];
  products: any[];
  lowStockAlertsEnabled: boolean;
  lowStockThreshold: number;
}

const StockTable: React.FC<StockTableProps> = ({ 
  filteredStockLevels, 
  products, 
  lowStockAlertsEnabled, 
  lowStockThreshold 
}) => {
  // Pagination state
  const [page, setPage] = useState(1);
  const itemsPerPage = 10;
  const totalPages = Math.ceil(filteredStockLevels.length / itemsPerPage);
  const paginated = filteredStockLevels.slice((page - 1) * itemsPerPage, page * itemsPerPage);

  // Helper to get supplier info
  const getSupplierInfo = (supplierId: string) => {
    const supplier = products
      .flatMap((p: any) => p.suppliers || [])
      .find((s: any) => s.id === supplierId);
    return supplier;
  };

  return (
    <div className="bg-white dark:bg-slate-900 rounded-lg shadow-sm">
      <div className="p-6 border-b border-gray-200 dark:border-slate-800 flex items-center justify-between">
        <h2 className="text-lg font-semibold text-gray-900 dark:text-slate-100">Current Stock Levels</h2>
        <div className="flex items-center gap-2">
          <button 
            onClick={() => setPage(p => Math.max(1, p - 1))} 
            disabled={page === 1} 
            className="px-2 py-1 rounded bg-gray-100 text-gray-700 disabled:opacity-50 hover:bg-gray-200 transition-colors"
          >
            Prev
          </button>
          <span className="text-sm text-gray-600 dark:text-slate-400">
            Page {page} of {totalPages}
          </span>
          <button 
            onClick={() => setPage(p => Math.min(totalPages, p + 1))} 
            disabled={page === totalPages} 
            className="px-2 py-1 rounded bg-gray-100 text-gray-700 disabled:opacity-50 hover:bg-gray-200 transition-colors"
          >
            Next
          </button>
        </div>
      </div>
      
      <div className="overflow-x-auto">
        <table className="w-full">
          <thead className="bg-gray-50 dark:bg-slate-800">
            <tr>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-slate-300 uppercase tracking-wider">
                Product
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-slate-300 uppercase tracking-wider">
                Current Stock
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-slate-300 uppercase tracking-wider">
                Unit Price
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-slate-300 uppercase tracking-wider">
                Total Value
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-slate-300 uppercase tracking-wider">
                Suppliers
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-slate-300 uppercase tracking-wider">
                Last Received
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-slate-300 uppercase tracking-wider">
                Status
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-200 dark:divide-slate-700">
            {paginated.map((item: any) => {
              const product = products.find((p: any) => p.id === item.product_id);
              // For unit price, use the most recent inventory item's price for this product
              const latestInventory = (product?.inventory || []).sort((a: any, b: any) => 
                new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
              )[0];
              const unitPrice = latestInventory?.price || 0;
              const totalValue = unitPrice * item.current_stock;
              
              return (
                <tr key={item.product_id} className="hover:bg-gray-50 dark:hover:bg-slate-800 transition-colors">
                  <td className="px-6 py-4">
                    <div className="flex items-center">
                      <img
                        src={product?.image || `https://images.pexels.com/photos/102104/pexels-photo-102104.jpeg`}
                        alt={product?.name}
                        className="w-10 h-10 rounded-lg object-cover mr-3"
                        onError={(e) => (e.currentTarget.src = `https://images.pexels.com/photos/102104/pexels-photo-102104.jpeg`)}
                      />
                      <div>
                        <p className="font-medium text-gray-900 dark:text-slate-100">{item.product_name}</p>
                        <p className="text-sm text-gray-500 dark:text-slate-400">{product?.category}</p>
                      </div>
                    </div>
                  </td>
                  <td className="px-6 py-4">
                    <span className="font-medium text-gray-900 dark:text-slate-100">
                      {item.current_stock} {item.unit}
                    </span>
                  </td>
                  <td className="px-6 py-4">
                    <span className="text-gray-900 dark:text-slate-100">
                      {unitPrice ? `$${unitPrice.toFixed(2)}` : '-'}
                    </span>
                  </td>
                  <td className="px-6 py-4">
                    <span className="text-gray-900 dark:text-slate-100">
                      {unitPrice ? `$${totalValue.toFixed(2)}` : '-'}
                    </span>
                  </td>
                  <td className="px-6 py-4">
                    <div className="flex flex-wrap gap-1">
                      {(item.suppliers || []).map((supplier: any) => (
                        <span
                          key={supplier.supplier_id}
                          className="px-2 py-1 bg-gray-100 dark:bg-slate-800 text-gray-700 dark:text-slate-200 text-xs rounded relative group"
                        >
                          {supplier.supplier_name}: {supplier.quantity}
                          {/* Tooltip for contact info */}
                          <span className="hidden group-hover:block absolute left-0 top-full mt-1 z-10 bg-white dark:bg-slate-900 border border-gray-300 dark:border-slate-700 rounded shadow-lg px-3 py-2 text-xs text-gray-700 dark:text-slate-300 min-w-[180px]">
                            {(() => {
                              const info = getSupplierInfo(supplier.supplier_id);
                              return info ? (
                                <>
                                  {info.phone && <div><b>Phone:</b> {info.phone}</div>}
                                  {info.email && <div><b>Email:</b> {info.email}</div>}
                                </>
                              ) : <span>No contact info</span>;
                            })()}
                          </span>
                        </span>
                      ))}
                    </div>
                  </td>
                  <td className="px-6 py-4 text-gray-500 dark:text-slate-400">
                    {item.last_received ? new Date(item.last_received).toLocaleDateString() : 'Never'}
                  </td>
                  <td className="px-6 py-4">
                    <span className={`px-2 py-1 text-xs rounded-full ${
                      item.current_stock === 0
                        ? 'bg-red-100 text-red-800 dark:bg-red-900/20 dark:text-red-400'
                        : lowStockAlertsEnabled && item.current_stock < lowStockThreshold
                          ? 'bg-amber-100 text-amber-800 dark:bg-amber-900/20 dark:text-amber-400'
                          : 'bg-green-100 text-green-800 dark:bg-green-900/20 dark:text-green-400'
                    }`}>
                      {item.current_stock === 0
                        ? 'Out of Stock'
                        : lowStockAlertsEnabled && item.current_stock < lowStockThreshold
                          ? 'Low Stock'
                          : 'In Stock'}
                    </span>
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

export default StockTable;

