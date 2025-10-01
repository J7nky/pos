import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { 
  AlertTriangle, 
  TrendingDown, 
  Package, 
  RefreshCw,
  Download,
  Filter,
  ArrowRight,
  Trash2
} from 'lucide-react';
import { useOfflineData } from '../contexts/OfflineDataContext';
import { missedProductsService } from '../services/missedProductsService';
import Toast from './common/Toast';


interface MissedProductsHistoryProps {
  storeId: string;
  className?: string;
}

interface DateRange {
  startDate: string;
  endDate: string;
}

export const MissedProductsHistory: React.FC<MissedProductsHistoryProps> = ({
  storeId,
  className = ''
}) => {
  const navigate = useNavigate();
  const { missedProducts, inventory, products, refreshData } = useOfflineData();
  const [history, setHistory] = useState<any[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [dateRange, setDateRange] = useState<DateRange>({
    startDate: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
    endDate: new Date().toISOString().split('T')[0]
  });
  const [showFilters, setShowFilters] = useState(false);
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error'; visible: boolean }>({
    message: '',
    type: 'success',
    visible: false
  });

  // Action handlers
  const handleNavigateToInventory = (inventoryItemId: string) => {
    // Navigate to accounting page and highlight the related received bill item
    console.log('Navigate to received bills for inventory item:', inventoryItemId);
    
    // Navigate to accounting page
    navigate('/accounting');
    
    // Store the inventory item ID in sessionStorage for highlighting in received bills
    // The accounting page can check for this and highlight the specific item in received bills tab
    sessionStorage.setItem('highlightReceivedBillItem', inventoryItemId);
    sessionStorage.setItem('activeAccountingTab', 'received-bills');
    
    // Show a toast notification
    setToast({
      message: 'Navigating to received bills...', 
      type: 'success',
      visible: true
    });
    
    // Auto-hide toast after 2 seconds
    setTimeout(() => {
      setToast(prev => ({ ...prev, visible: false }));
    }, 2000);
  };


  const handleDeleteItem = async (itemId: string) => {
    if (window.confirm('Are you sure you want to delete this missed product record?')) {
      try {
        const success = await missedProductsService.deleteMissedProduct(itemId);
        if (success) {
          // Refresh context data and then reload report
          await refreshData();
          await loadReport();
        } else {
          setError('Failed to delete item');
        }
      } catch (error) {
        console.error('Error deleting item:', error);
        setError('Failed to delete item');
      }
    }
  };

  const loadReport = async () => {
    setLoading(true);
    setError(null);
    
    try {
      // Use context data for better performance (follows offline-first architecture)
      const reportData = await missedProductsService.getAllMissedProducts(
        storeId,
        dateRange.startDate,
        dateRange.endDate,
      
      );
      console.log('Missed products history data:', reportData);
      setHistory(reportData);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load history');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadReport();
  }, [storeId, dateRange, missedProducts, inventory, products]);


  const handleExport = () => {
    if (!history) return;
    
    const totalDiscrepancies = history.reduce((sum, day) => sum + day.discrepancy_count, 0);
    const totalVariance = history.reduce((sum, day) => sum + day.total_variance, 0);
    
    const csvContent = [
      ['Date Range', `${dateRange.startDate} to ${dateRange.endDate}`],
      ['Total Discrepancies', totalDiscrepancies.toString()],
      ['Total Variance', totalVariance.toString()],
      [''],
      ['Daily Missed Products'],
      ['Date', 'Discrepancy Count', 'Total Variance', 'Sessions'],
      ...history.map(day => [
        day.date,
        day.discrepancy_count.toString(),
        day.total_variance.toString(),
        day.sessions.length.toString()
      ])
    ].map(row => row.join(',')).join('\n');

    const blob = new Blob([csvContent], { type: 'text/csv' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `missed-products-history-${dateRange.startDate}-to-${dateRange.endDate}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    window.URL.revokeObjectURL(url);
  };

  if (loading) {
    return (
      <div className={`bg-white rounded-lg shadow-sm border border-gray-200 p-6 ${className}`}>
        <div className="flex items-center justify-center py-8">
          <RefreshCw className="w-6 h-6 animate-spin text-blue-600 mr-2" />
          <span className="text-gray-600">Loading missed products history...</span>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className={`bg-white rounded-lg shadow-sm border border-gray-200 p-6 ${className}`}>
        <div className="flex items-center justify-center py-8">
          <AlertTriangle className="w-6 h-6 text-red-600 mr-2" />
          <span className="text-red-600">Error: {error}</span>
        </div>
      </div>
    );
  }

  if (!history) {
    return null;
  }

  return (
    <div className={`bg-white rounded-lg shadow-sm border border-gray-200 ${className}`}>
      {/* Header */}
      <div className="px-6 py-4 border-b border-gray-200">
        <div className="flex items-center justify-between">
          <div className="flex items-center">
            <Package className="w-5 h-5 text-blue-600 mr-2" />
            <h3 className="text-lg font-semibold text-gray-900">Missed Products History</h3>
          </div>
          <div className="flex items-center space-x-2">
            <button
              onClick={() => setShowFilters(!showFilters)}
              className="flex items-center px-3 py-1.5 text-sm text-gray-600 bg-gray-100 rounded-md hover:bg-gray-200"
            >
              <Filter className="w-4 h-4 mr-1" />
              Filters
            </button>
            <button
              onClick={loadReport}
              className="flex items-center px-3 py-1.5 text-sm text-gray-600 bg-gray-100 rounded-md hover:bg-gray-200"
            >
              <RefreshCw className="w-4 h-4 mr-1" />
              Refresh
            </button>
            <button
              onClick={handleExport}
              className="flex items-center px-3 py-1.5 text-sm text-white bg-blue-600 rounded-md hover:bg-blue-700"
            >
              <Download className="w-4 h-4 mr-1" />
              Export
            </button>
          </div>
        </div>
      </div>

      {/* Filters */}
      {showFilters && (
        <div className="px-6 py-4 bg-gray-50 border-b border-gray-200">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Start Date
              </label>
              <input
                type="date"
                value={dateRange.startDate}
                onChange={(e) => setDateRange(prev => ({ ...prev, startDate: e.target.value }))}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                End Date
              </label>
              <input
                type="date"
                value={dateRange.endDate}
                onChange={(e) => setDateRange(prev => ({ ...prev, endDate: e.target.value }))}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
          </div>
        </div>
      )}

      {/* Summary Cards */}
      <div className="px-6 py-4">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
          <div className="bg-red-50 border border-red-200 rounded-lg p-4">
            <div className="flex items-center">
              <AlertTriangle className="w-8 h-8 text-red-600 mr-3" />
              <div>
                <p className="text-sm font-medium text-red-800">Total Discrepancies</p>
                <p className="text-2xl font-bold text-red-900">{history.reduce((sum, day) => sum + day.discrepancy_count, 0)}</p>
              </div>
            </div>
          </div>

          <div className="bg-orange-50 border border-orange-200 rounded-lg p-4">
            <div className="flex items-center">
              <TrendingDown className="w-8 h-8 text-orange-600 mr-3" />
              <div>
                <p className="text-sm font-medium text-orange-800">Total Variance</p>
                <p className="text-2xl font-bold text-orange-900">{history.reduce((sum, day) => sum + day.total_variance, 0).toFixed(2)}</p>
              </div>
            </div>
          </div>

        </div>


        {/* Daily Discrepancies */}
        {history.length > 0 && (
          <div>
            <h4 className="text-lg font-semibold text-gray-900 mb-4">Daily Discrepancies</h4>
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-gray-200">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Date
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Product Name  
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Variance
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Employee Name
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Note
                    </th>
                    <th className="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Actions
                    </th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-200">
                  {history.map((item, index) => (
                    <tr key={`${item.date}-${index}`} className={index % 2 === 0 ? 'bg-white' : 'bg-gray-50'}>
                      <td className="px-4 py-3 text-sm text-gray-900">
                        {new Date(item.date).toLocaleDateString('en-US', {
                          year: 'numeric',
                          month: 'numeric',
                          day: 'numeric'
                        })}
                      </td>
                      <td className="px-4 py-3 text-sm text-gray-900">
                        {item.productName}
                      </td>
                      <td className="px-4 py-3 text-sm text-gray-900">
                        {item.varianceNumber}
                      </td>
                      <td className="px-4 py-3 text-sm text-gray-900">
                        {item.employeeId}
                      </td>
                      <td className="px-4 py-3 text-sm text-gray-900">
                        {item.note || '-'}
                      </td>
                      <td className="px-4 py-3 text-sm text-gray-900">
                        <div className="flex items-center justify-center space-x-2">
                          {/* Navigation Arrow Button */}
                          <button
                            onClick={() => handleNavigateToInventory(item.inventoryId || item.id)}
                            className="p-1.5 text-blue-600 hover:text-blue-800 hover:bg-blue-50 rounded-md transition-colors duration-200"
                            title="View in Received Bills"
                          >
                            <ArrowRight className="w-4 h-4" />
                          </button>
                        
                          
                          {/* Delete Button */}
                          <button
                            onClick={() => handleDeleteItem(item.id)}
                            className="p-1.5 text-red-600 hover:text-red-800 hover:bg-red-50 rounded-md transition-colors duration-200"
                            title="Delete Item"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* No Data Message */}
        {history.length === 0 && (
          <div className="text-center py-8">
            <Package className="w-12 h-12 text-gray-400 mx-auto mb-4" />
            <h3 className="text-lg font-medium text-gray-900 mb-2">No Discrepancies Found</h3>
            <p className="text-gray-600">
              No inventory discrepancies were recorded for the selected date range.
            </p>
          </div>
        )}
      </div>
      
      {/* Toast Notification */}
      <Toast
        message={toast.message}
        type={toast.type}
        visible={toast.visible}
        onClose={() => setToast(prev => ({ ...prev, visible: false }))}
      />
    </div>
  );
};
