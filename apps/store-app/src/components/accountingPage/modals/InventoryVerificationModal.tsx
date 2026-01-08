import React, { useState, useEffect } from 'react';
import { X, CheckCircle, AlertTriangle } from 'lucide-react';
import { useOfflineData } from '../../../contexts/OfflineDataContext';
import { MissedProductData } from '../../../services/missedProductsService';
import { useProductMultilingual } from '../../../hooks/useMultilingual';

interface InventoryVerificationModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: (verificationData: InventoryVerificationData) => void;
  loading: boolean;
}

interface InventoryVerificationData {
  verifiedItems: (MissedProductData & { product?: { id: string; name: any } })[];
}

interface InventoryItem {
  id: string;
  product_id: string;
  quantity: number;
  unit: string;
  product?: {
    id: string;
    name: string;
    category: string;
  };
}

export const InventoryVerificationModal: React.FC<InventoryVerificationModalProps> = ({
  isOpen,
  onClose,
  onConfirm,
  loading
}) => {
  const { inventory, products } = useOfflineData();
  const { getProductName } = useProductMultilingual();
  
  const [verificationData, setVerificationData] = useState<InventoryVerificationData>({
    verifiedItems: []
  });

  // Get all inventory items with product details
  const getInventoryItems = (): InventoryItem[] => {
    if (!inventory || !products) return [];
    
    const now = new Date().getTime();
    const twentyFourHoursInMs = 24 * 60 * 60 * 1000; // 24 hours in milliseconds
    
    return inventory
      .filter((item: any) => {
        // Exclude if quantity is 0 AND item is older than 24 hours
        if (item.quantity === 0 && item.created_at) {
          const itemCreatedAt = new Date(item.created_at).getTime();
          const timeDiff = now - itemCreatedAt;
          // Exclude if more than 24 hours old
          if (timeDiff > twentyFourHoursInMs) {
            return false;
          }
        }
        return true;
      })
      .map(item => ({
        id: item.id,
        product_id: item.product_id,
        quantity: item.quantity,
        unit: item.unit,
        product: products.find(p => p.id === item.product_id)
      }))
      .filter(item => item.product); // Only include items with valid products
  };

  // Initialize verification data when modal opens
  useEffect(() => {
    if (isOpen) {
      const items = getInventoryItems();
      const verifiedItems = items.map(item => ({
        itemId: item.id,
        productName: item.product?.name || 'Unknown Product', // Keep for backward compatibility
        systemQuantity: item.quantity,
        physicalQuantity: item.quantity, // Default to system quantity
        unit: item.unit,
        isVerified: false,
        notes: '',
        product: item.product // Store product object for multilingual display
      }));

      setVerificationData({ verifiedItems });
    }
  }, [isOpen, inventory, products]);

  const handleItemVerification = (itemId: string, isVerified: boolean) => {
    setVerificationData(prev => ({
      ...prev,
      verifiedItems: prev.verifiedItems.map(item =>
        item.itemId === itemId ? { ...item, isVerified } : item
      )
    }));
  };

  const handlePhysicalQuantityChange = (itemId: string, quantity: number) => {
    setVerificationData(prev => ({
      ...prev,
      verifiedItems: prev.verifiedItems.map(item =>
        item.itemId === itemId ? { ...item, physicalQuantity: quantity } : item
      )
    }));
  };

  const handleNotesChange = (itemId: string, notes: string) => {
    setVerificationData(prev => ({
      ...prev,
      verifiedItems: prev.verifiedItems.map(item =>
        item.itemId === itemId ? { ...item, notes } : item
      )
    }));
  };

  const handleConfirm = () => {
    onConfirm(verificationData);
  };

  const allItemsVerified = verificationData.verifiedItems.every(item => item.isVerified);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-lg w-full max-w-5xl max-h-[90vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-gray-200">
          <h3 className="text-lg font-semibold text-gray-900">Verify Inventory</h3>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Table */}
        <div className="flex-1 overflow-y-auto">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-gray-50 border-b border-gray-200">
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider w-12">
                    ✓
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Product
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    System Qty
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Physical Qty
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Status
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Notes
                  </th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {verificationData.verifiedItems.map((item) => {
                  const isMatch = item.systemQuantity === item.physicalQuantity;
                  const isOver = item.physicalQuantity > item.systemQuantity;
                  
                  return (
                    <tr 
                      key={item.itemId} 
                      className={`cursor-pointer ${item.isVerified ? 'bg-green-50' : 'hover:bg-gray-50'}`}
                      onClick={() => handleItemVerification(item.itemId, !item.isVerified)}
                    >
                      <td className="px-4 py-3">
                        <input
                          type="checkbox"
                          checked={item.isVerified}
                          onChange={(e) => handleItemVerification(item.itemId, e.target.checked)}
                          className="w-4 h-4 text-blue-600 border-gray-300 rounded focus:ring-blue-500"
                          onClick={(e) => e.stopPropagation()} // Prevent double toggle
                        />
                      </td>
                      <td className="px-4 py-3">
                        <div className="text-sm font-medium text-gray-900">
                          {item.product ? getProductName(item.product) : item.productName}
                        </div>
                        <div className="text-sm text-gray-500">{item.unit}</div>
                      </td>
                      <td className="px-4 py-3">
                        <div className="text-sm text-gray-900">{item.systemQuantity}</div>
                      </td>
                      <td className="px-4 py-3">
                        <input
                          type="number"
                          min="0"
                          step="0.01"
                          value={item.physicalQuantity}
                          onChange={(e) => handlePhysicalQuantityChange(item.itemId, parseFloat(e.target.value) || 0)}
                          className="w-20 px-2 py-1 text-sm border border-gray-300 rounded focus:outline-none focus:ring-1 focus:ring-blue-500 focus:border-transparent"
                        />
                      </td>
                      <td className="px-4 py-3">
                        <div className={`flex items-center gap-1 text-sm ${
                          isMatch ? 'text-green-600' : isOver ? 'text-blue-600' : 'text-red-600'
                        }`}>
                          {isMatch ? (
                            <CheckCircle className="w-4 h-4" />
                          ) : (
                            <AlertTriangle className="w-4 h-4" />
                          )}
                          <span>
                            {isMatch ? 'Match' : isOver ? 'Over' : 'Short'}
                          </span>
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        <input
                          type="text"
                          value={item.notes}
                          onChange={(e) => handleNotesChange(item.itemId, e.target.value)}
                          className="w-32 px-2 py-1 text-sm border border-gray-300 rounded focus:outline-none focus:ring-1 focus:ring-blue-500 focus:border-transparent"
                          placeholder="Notes..."
                        />
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>

        {/* Footer */}
        <div className="p-4 border-t border-gray-200 bg-gray-50">
          <div className="flex justify-between items-center">
            <div className="text-sm text-gray-600">
              {verificationData.verifiedItems.filter(item => item.isVerified).length} of {verificationData.verifiedItems.length} items verified
            </div>
            
            <div className="flex gap-3">
              <button
                onClick={onClose}
                disabled={loading}
                className="px-4 py-2 text-gray-700 bg-white border border-gray-300 rounded-md hover:bg-gray-50 disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                onClick={handleConfirm}
                disabled={loading || !allItemsVerified}
                className={`px-6 py-2 rounded-md font-medium ${
                  !allItemsVerified
                    ? 'bg-gray-400 text-gray-600 cursor-not-allowed'
                    : 'bg-blue-600 text-white hover:bg-blue-700'
                }`}
              >
                {loading ? 'Processing...' : 'Continue to Cash Balance'}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
