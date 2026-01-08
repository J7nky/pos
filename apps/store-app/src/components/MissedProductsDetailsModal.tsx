import React, { useState, useEffect } from 'react';
import { X, AlertTriangle, CheckCircle, Package, User, Calendar, Clock } from 'lucide-react';
import { missedProductsService, MissedProductWithDetails } from '../services/missedProductsService';

interface MissedProductsDetailsModalProps {
  isOpen: boolean;
  onClose: () => void;
  sessionId: string;
  storeId: string;
}

export const MissedProductsDetailsModal: React.FC<MissedProductsDetailsModalProps> = ({
  isOpen,
  onClose,
  sessionId,
  storeId
}) => {
  const [missedProducts, setMissedProducts] = useState<MissedProductWithDetails[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (isOpen && sessionId) {
      loadMissedProducts();
    }
  }, [isOpen, sessionId]);

  const loadMissedProducts = async () => {
    setLoading(true);
    setError(null);
    
    try {
      const data = await missedProductsService.getSessionMissedProducts(sessionId);
      setMissedProducts(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load missed products');
    } finally {
      setLoading(false);
    }
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  const getVarianceColor = (variance: number) => {
    if (variance > 0) return 'text-green-600 bg-green-50';
    if (variance < 0) return 'text-red-600 bg-red-50';
    return 'text-gray-600 bg-gray-50';
  };

  const getVarianceIcon = (variance: number) => {
    if (variance > 0) return <CheckCircle className="w-4 h-4" />;
    if (variance < 0) return <AlertTriangle className="w-4 h-4" />;
    return null;
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-lg w-full max-w-6xl max-h-[90vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-gray-200">
          <div className="flex items-center">
            <Package className="w-6 h-6 text-blue-600 mr-3" />
            <div>
              <h3 className="text-xl font-semibold text-gray-900">Missed Products Details</h3>
              <p className="text-sm text-gray-600">Session: {sessionId.substring(0, 8)}...</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600 transition-colors"
          >
            <X className="w-6 h-6" />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-6">
          {loading && (
            <div className="flex items-center justify-center py-8">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
              <span className="ml-2 text-gray-600">Loading missed products...</span>
            </div>
          )}

          {error && (
            <div className="flex items-center justify-center py-8">
              <AlertTriangle className="w-6 h-6 text-red-600 mr-2" />
              <span className="text-red-600">Error: {error}</span>
            </div>
          )}

          {!loading && !error && missedProducts.length === 0 && (
            <div className="text-center py-8">
              <Package className="w-12 h-12 text-gray-400 mx-auto mb-4" />
              <h3 className="text-lg font-medium text-gray-900 mb-2">No Discrepancies Found</h3>
              <p className="text-gray-600">
                 inventory discrepancies were recorded for this session.
              </p>
            </div>
          )}

          {!loading && !error && missedProducts.length > 0 && (
            <>
              {/* Session Info */}
              {missedProducts.length > 0 && (
                <div className="bg-gray-50 rounded-lg p-4 mb-6">
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    <div className="flex items-center">
                      <User className="w-5 h-5 text-gray-400 mr-2" />
                      <div>
                        <p className="text-sm text-gray-600">Opened By</p>
                        <p className="font-medium text-gray-900">{missedProducts[0].session_opened_by}</p>
                      </div>
                    </div>
                    <div className="flex items-center">
                      <Calendar className="w-5 h-5 text-gray-400 mr-2" />
                      <div>
                        <p className="text-sm text-gray-600">Opened At</p>
                        <p className="font-medium text-gray-900">{formatDate(missedProducts[0].session_opened_at)}</p>
                      </div>
                    </div>
                    <div className="flex items-center">
                      <Clock className="w-5 h-5 text-gray-400 mr-2" />
                      <div>
                        <p className="text-sm text-gray-600">Closed At</p>
                        <p className="font-medium text-gray-900">
                          {missedProducts[0].session_closed_at 
                            ? formatDate(missedProducts[0].session_closed_at)
                            : 'Still Open'
                          }
                        </p>
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {/* Summary Stats */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
                <div className="bg-red-50 border border-red-200 rounded-lg p-4">
                  <div className="flex items-center">
                    <AlertTriangle className="w-8 h-8 text-red-600 mr-3" />
                    <div>
                      <p className="text-sm font-medium text-red-800">Total Discrepancies</p>
                      <p className="text-2xl font-bold text-red-900">{missedProducts.length}</p>
                    </div>
                  </div>
                </div>

                <div className="bg-orange-50 border border-orange-200 rounded-lg p-4">
                  <div className="flex items-center">
                    <Package className="w-8 h-8 text-orange-600 mr-3" />
                    <div>
                      <p className="text-sm font-medium text-orange-800">Total Variance</p>
                      <p className="text-2xl font-bold text-orange-900">
                        {missedProducts.reduce((sum, mp) => sum + Math.abs(mp.variance), 0).toFixed(2)}
                      </p>
                    </div>
                  </div>
                </div>

                <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
                  <div className="flex items-center">
                    <CheckCircle className="w-8 h-8 text-blue-600 mr-3" />
                    <div>
                      <p className="text-sm font-medium text-blue-800">Average Variance</p>
                      <p className="text-2xl font-bold text-blue-900">
                        {(missedProducts.reduce((sum, mp) => sum + Math.abs(mp.variance), 0) / missedProducts.length).toFixed(2)}
                      </p>
                    </div>
                  </div>
                </div>
              </div>

              {/* Missed Products Table */}
              <div className="overflow-x-auto">
                <table className="min-w-full divide-y divide-gray-200">
                  <thead className="bg-gray-50">
                    <tr>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Product
                      </th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Category
                      </th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        System Qty
                      </th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Physical Qty
                      </th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Variance
                      </th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Unit
                      </th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Notes
                      </th>
                    </tr>
                  </thead>
                  <tbody className="bg-white divide-y divide-gray-200">
                    {missedProducts.map((item, index) => (
                      <tr key={item.id} className={index % 2 === 0 ? 'bg-white' : 'bg-gray-50'}>
                        <td className="px-4 py-3">
                          <div className="text-sm font-medium text-gray-900">
                            {item.product_name}
                          </div>
                        </td>
                        <td className="px-4 py-3">
                          <div className="text-sm text-gray-600">
                            {item.product_category}
                          </div>
                        </td>
                        <td className="px-4 py-3">
                          <div className="text-sm text-gray-900">
                            {item.system_quantity}
                          </div>
                        </td>
                        <td className="px-4 py-3">
                          <div className="text-sm text-gray-900">
                            {item.physical_quantity}
                          </div>
                        </td>
                        <td className="px-4 py-3">
                          <div className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${getVarianceColor(item.variance)}`}>
                            {getVarianceIcon(item.variance)}
                            <span className="ml-1">
                              {item.variance > 0 ? '+' : ''}{item.variance.toFixed(2)}
                            </span>
                          </div>
                        </td>
                        <td className="px-4 py-3">
                          <div className="text-sm text-gray-600">
                            {item.unit}
                          </div>
                        </td>
                        <td className="px-4 py-3">
                          <div className="text-sm text-gray-600 max-w-xs truncate">
                            {item.notes || '-'}
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-gray-200 bg-gray-50">
          <div className="flex justify-end">
            <button
              onClick={onClose}
              className="px-4 py-2 text-gray-700 bg-white border border-gray-300 rounded-md hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              Close
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
