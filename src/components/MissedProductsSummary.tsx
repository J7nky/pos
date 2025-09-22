import React, { useState, useEffect } from 'react';
import { Package, AlertTriangle, Eye, RefreshCw } from 'lucide-react';
import { missedProductsService, MissedProductWithDetails } from '../services/missedProductsService';
import { MissedProductsDetailsModal } from './MissedProductsDetailsModal';
import { useOfflineData } from '../contexts/OfflineDataContext';

interface MissedProductsSummaryProps {
  sessionId: string;
  storeId: string;
}

export const MissedProductsSummary: React.FC<MissedProductsSummaryProps> = ({
  sessionId,
  storeId
}) => {
  const { missedProducts: contextMissedProducts, inventory, products } = useOfflineData();
  const [missedProducts, setMissedProducts] = useState<MissedProductWithDetails[]>([]);
  const [loading, setLoading] = useState(false);
  const [showDetailsModal, setShowDetailsModal] = useState(false);

  useEffect(() => {
    loadMissedProducts();
  }, [sessionId, contextMissedProducts]);

  const loadMissedProducts = async () => {
    setLoading(true);
    try {
      // Use context data for better performance
      const data = await missedProductsService.getSessionMissedProducts(sessionId, {
        missedProducts: contextMissedProducts,
        inventoryItems: inventory,
        products: products,
        sessions: [] // We'll get this from the parent component if needed
      });
      setMissedProducts(data);
    } catch (error) {
      console.error('Error loading missed products:', error);
    } finally {
      setLoading(false);
    }
  };

  const totalVariance = missedProducts.reduce((sum, mp) => sum + Math.abs(mp.variance), 0);
  const averageVariance = missedProducts.length > 0 ? totalVariance / missedProducts.length : 0;

  if (loading) {
    return (
      <div className="mt-6 p-4 bg-gray-50 rounded-lg">
        <div className="flex items-center justify-center py-4">
          <RefreshCw className="w-4 h-4 animate-spin text-gray-400 mr-2" />
          <span className="text-sm text-gray-600">Loading missed products...</span>
        </div>
      </div>
    );
  }

  if (missedProducts.length === 0) {
    return (
      <div className="mt-6 p-4 bg-green-50 rounded-lg border border-green-200">
        <div className="flex items-center">
          <Package className="w-5 h-5 text-green-600 mr-2" />
          <div>
            <p className="text-sm font-medium text-green-800">No Inventory Discrepancies</p>
            <p className="text-xs text-green-600">All inventory items match system records</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <>
      <div className="mt-6 p-4 bg-red-50 rounded-lg border border-red-200">
        <div className="flex items-center justify-between">
          <div className="flex items-center">
            <AlertTriangle className="w-5 h-5 text-red-600 mr-2" />
            <div>
              <p className="text-sm font-medium text-red-800">
                {missedProducts.length} Inventory Discrepanc{missedProducts.length === 1 ? 'y' : 'ies'} Found
              </p>
              <p className="text-xs text-red-600">
                Total variance: {totalVariance.toFixed(2)} | Avg: {averageVariance.toFixed(2)}
              </p>
            </div>
          </div>
          <button
            onClick={() => setShowDetailsModal(true)}
            className="flex items-center px-3 py-1.5 text-xs text-red-700 bg-red-100 rounded-md hover:bg-red-200 transition-colors"
          >
            <Eye className="w-3 h-3 mr-1" />
            View Details
          </button>
        </div>
        
        {/* Quick summary of most significant discrepancies */}
        <div className="mt-3 space-y-1">
          {missedProducts
            .sort((a, b) => Math.abs(b.variance) - Math.abs(a.variance))
            .slice(0, 3)
            .map((item, index) => (
              <div key={item.id} className="flex items-center justify-between text-xs">
                <span className="text-gray-700 truncate max-w-xs">
                  {item.product_name}
                </span>
                <span className={`font-medium ${
                  item.variance > 0 ? 'text-green-600' : 'text-red-600'
                }`}>
                  {item.variance > 0 ? '+' : ''}{item.variance.toFixed(2)} {item.unit}
                </span>
              </div>
            ))}
          {missedProducts.length > 3 && (
            <div className="text-xs text-gray-500">
              +{missedProducts.length - 3} more discrepancies
            </div>
          )}
        </div>
      </div>

      {/* Details Modal */}
      <MissedProductsDetailsModal
        isOpen={showDetailsModal}
        onClose={() => setShowDetailsModal(false)}
        sessionId={sessionId}
        storeId={storeId}
      />
    </>
  );
};
