import React, { useState, useEffect } from 'react';
import { 
  AlertTriangle, 
  TrendingDown, 
  Package, 
  Calendar, 
  User, 
  BarChart3,
  RefreshCw,
  Download,
  Filter
} from 'lucide-react';
import { missedProductsService, MissedProductsReport as MissedProductsReportType } from '../services/missedProductsService';
import { useOfflineData } from '../contexts/OfflineDataContext';

interface MissedProductsReportProps {
  storeId: string;
  className?: string;
}

interface DateRange {
  startDate: string;
  endDate: string;
}

export const MissedProductsReport: React.FC<MissedProductsReportProps> = ({
  storeId,
  className = ''
}) => {
  const { missedProducts: contextMissedProducts, inventory, products } = useOfflineData();
  const [report, setReport] = useState<MissedProductsReportType | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [dateRange, setDateRange] = useState<DateRange>({
    startDate: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
    endDate: new Date().toISOString().split('T')[0]
  });
  const [showFilters, setShowFilters] = useState(false);

  const loadReport = async () => {
    setLoading(true);
    setError(null);
    
    try {
      // Use context data for better performance
      const reportData = await missedProductsService.getMissedProductsReport(
        storeId,
        dateRange.startDate,
        dateRange.endDate,
        {
          missedProducts: contextMissedProducts,
          inventoryItems: inventory,
          products: products
        }
      );
      setReport(reportData);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load report');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadReport();
  }, [storeId, dateRange]);

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD'
    }).format(amount);
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

  const handleExport = () => {
    if (!report) return;
    
    const csvContent = [
      ['Date Range', `${dateRange.startDate} to ${dateRange.endDate}`],
      ['Total Discrepancies', (report.totalDiscrepancies || 0).toString()],
      ['Total Variance', (report.totalVariance || 0).toString()],
      ['Average Variance', (report.averageVariance || 0).toFixed(2)],
      [''],
      ['Most Missed Products'],
      ['Product Name', 'Discrepancy Count', 'Total Variance'],
      ...report.mostMissedProducts.map(item => [
        item.product_name || 'Unknown',
        (item.discrepancy_count || 0).toString(),
        (item.total_variance || 0).toString()
      ]),
      [''],
      ['Sessions with Discrepancies'],
      ['Session ID', 'Opened At', 'Closed At', 'Opened By', 'Discrepancy Count', 'Total Variance'],
      ...report.sessions.map(session => [
        session.session_id,
        session.opened_at,
        session.closed_at || 'N/A',
        session.opened_by,
        (session.discrepancy_count || 0).toString(),
        (session.total_variance || 0).toString()
      ])
    ].map(row => row.join(',')).join('\n');

    const blob = new Blob([csvContent], { type: 'text/csv' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `missed-products-report-${dateRange.startDate}-to-${dateRange.endDate}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    window.URL.revokeObjectURL(url);
  };
//   const user=

  if (loading) {
    return (
      <div className={`bg-white rounded-lg shadow-sm border border-gray-200 p-6 ${className}`}>
        <div className="flex items-center justify-center py-8">
          <RefreshCw className="w-6 h-6 animate-spin text-blue-600 mr-2" />
          <span className="text-gray-600">Loading missed products report...</span>
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

  if (!report) {
    return null;
  }

  return (
    <div className={`bg-white rounded-lg shadow-sm border border-gray-200 ${className}`}>
      {/* Header */}
      <div className="px-6 py-4 border-b border-gray-200">
        <div className="flex items-center justify-between">
          <div className="flex items-center">
            <Package className="w-5 h-5 text-blue-600 mr-2" />
            <h3 className="text-lg font-semibold text-gray-900">Missed Products Report</h3>
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
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
          <div className="bg-red-50 border border-red-200 rounded-lg p-4">
            <div className="flex items-center">
              <AlertTriangle className="w-8 h-8 text-red-600 mr-3" />
              <div>
                <p className="text-sm font-medium text-red-800">Total Discrepancies</p>
                <p className="text-2xl font-bold text-red-900">{report.totalDiscrepancies || 0}</p>
              </div>
            </div>
          </div>

          <div className="bg-orange-50 border border-orange-200 rounded-lg p-4">
            <div className="flex items-center">
              <TrendingDown className="w-8 h-8 text-orange-600 mr-3" />
              <div>
                <p className="text-sm font-medium text-orange-800">Total Variance</p>
                <p className="text-2xl font-bold text-orange-900">{(report.totalVariance || 0).toFixed(2)}</p>
              </div>
            </div>
          </div>

          <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
            <div className="flex items-center">
              <BarChart3 className="w-8 h-8 text-blue-600 mr-3" />
              <div>
                <p className="text-sm font-medium text-blue-800">Average Variance</p>
                <p className="text-2xl font-bold text-blue-900">{(report.averageVariance || 0).toFixed(2)}</p>
              </div>
            </div>
          </div>
        </div>

        {/* Most Missed Products */}
        {report.mostMissedProducts.length > 0 && (
          <div className="mb-6">
            <h4 className="text-lg font-semibold text-gray-900 mb-4">Most Missed Products</h4>
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-gray-200">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Product
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Discrepancy Count
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Total Variance
                    </th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-200">
                  {report.mostMissedProducts.map((item, index) => (
                    <tr key={index} className={index % 2 === 0 ? 'bg-white' : 'bg-gray-50'}>
                      <td className="px-4 py-3 text-sm font-medium text-gray-900">
                        {item.product_name || 'Unknown Product'}
                      </td>
                      <td className="px-4 py-3 text-sm text-gray-900">
                        {item.discrepancy_count || 0}
                      </td>
                      <td className="px-4 py-3 text-sm text-gray-900">
                        {(item.total_variance || 0).toFixed(2)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* Sessions with Discrepancies */}
        {report.sessions.length > 0 && (
          <div>
            <h4 className="text-lg font-semibold text-gray-900 mb-4">Sessions with Discrepancies</h4>
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-gray-200">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Session
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Opened At
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Closed At
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Opened By
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Discrepancies
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Total Variance
                    </th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-200">
                  {report.sessions.map((session, index) => (
                    <tr key={session.session_id} className={index % 2 === 0 ? 'bg-white' : 'bg-gray-50'}>
                      <td className="px-4 py-3 text-sm font-mono text-gray-900">
                        {session.session_id.substring(0, 8)}...
                      </td>
                      <td className="px-4 py-3 text-sm text-gray-900">
                        {formatDate(session.opened_at)}
                      </td>
                      <td className="px-4 py-3 text-sm text-gray-900">
                        {session.closed_at ? formatDate(session.closed_at) : 'N/A'}
                      </td>
                      <td className="px-4 py-3 text-sm text-gray-900">
                        <div className="flex items-center">
                          <User className="w-4 h-4 text-gray-400 mr-1" />
                          {session.opened_by}
                        </div>
                      </td>
                      <td className="px-4 py-3 text-sm text-gray-900">
                        {session.discrepancy_count || 0}
                      </td>
                      <td className="px-4 py-3 text-sm text-gray-900">
                        {(session.total_variance || 0).toFixed(2)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* No Data Message */}
        {report.totalDiscrepancies === 0 && (
          <div className="text-center py-8">
            <Package className="w-12 h-12 text-gray-400 mx-auto mb-4" />
            <h3 className="text-lg font-medium text-gray-900 mb-2">No Discrepancies Found</h3>
            <p className="text-gray-600">
              No inventory discrepancies were recorded for the selected date range.
            </p>
          </div>
        )}
      </div>
    </div>
  );
};
