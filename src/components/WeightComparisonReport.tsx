import React, { useState, useEffect } from 'react';
import { weightManagementService, BillWeightSummary, WeightDiscrepancyAlert } from '../services/weightManagementService';
import { weightConfigurationService } from '../services/weightConfigurationService';

interface WeightComparisonReportProps {
  billId?: string;
  supplierId?: string;
  productId?: string;
  dateRange?: { start: string; end: string };
  onBillCloseDecision?: (canClose: boolean, issues: any[]) => void;
  showCloseButton?: boolean;
}

const WeightComparisonReport: React.FC<WeightComparisonReportProps> = ({
  billId,
  supplierId,
  productId,
  dateRange,
  onBillCloseDecision,
  showCloseButton = false
}) => {
  const [billSummary, setBillSummary] = useState<BillWeightSummary | null>(null);
  const [productSummary, setProductSummary] = useState<any>(null);
  const [alerts, setAlerts] = useState<WeightDiscrepancyAlert[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [closingReport, setClosingReport] = useState<any>(null);

  const config = weightConfigurationService.getConfiguration();

  useEffect(() => {
    loadData();
  }, [billId, supplierId, productId, dateRange]);

  const loadData = async () => {
    setLoading(true);
    setError(null);

    try {
      if (billId) {
        // Load bill-specific data
        const summary = await weightManagementService.getBillWeightSummary(billId);
        setBillSummary(summary);

        if (showCloseButton && summary) {
          const report = await weightManagementService.generateBillClosingWeightReport(billId);
          setClosingReport(report);
          
          if (onBillCloseDecision) {
            onBillCloseDecision(report.canClose, report.issues);
          }
        }
      }

      if (productId && supplierId) {
        // Load product-supplier specific data
        const summary = await weightManagementService.getProductWeightSummary(
          productId,
          supplierId,
          dateRange
        );
        setProductSummary(summary);
      }

      // Load alerts for the current context
      if (supplierId) {
        const storeId = localStorage.getItem('current_store_id') || 'default-store';
        const allAlerts = await weightManagementService.getWeightDiscrepancyAlerts(storeId);
        const filteredAlerts = allAlerts.filter(alert => alert.supplierId === supplierId);
        setAlerts(filteredAlerts);
      }

    } catch (err) {
      console.error('Error loading weight data:', err);
      setError('Failed to load weight comparison data');
    } finally {
      setLoading(false);
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'balanced': return 'text-green-600';
      case 'over_sold': return 'text-red-600';
      case 'under_sold': return 'text-yellow-600';
      case 'no_comparison': return 'text-gray-500';
      default: return 'text-gray-600';
    }
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'balanced': return '✅';
      case 'over_sold': return '⚠️';
      case 'under_sold': return '⚡';
      case 'no_comparison': return 'ℹ️';
      default: return '❓';
    }
  };

  const getSeverityColor = (severity: string) => {
    switch (severity) {
      case 'high': return 'text-red-600 bg-red-50 border-red-200';
      case 'medium': return 'text-yellow-600 bg-yellow-50 border-yellow-200';
      case 'low': return 'text-blue-600 bg-blue-50 border-blue-200';
      default: return 'text-gray-600 bg-gray-50 border-gray-200';
    }
  };

  const formatWeight = (weight: number | null) => {
    if (weight === null || weight === undefined) return 'N/A';
    return weightConfigurationService.formatWeight(weight);
  };

  const formatPercentage = (percentage: number) => {
    return `${percentage.toFixed(1)}%`;
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center p-8">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
        <span className="ml-2">Loading weight comparison data...</span>
      </div>
    );
  }

  if (error) {
    return (
      <div className="bg-red-50 border border-red-200 rounded-md p-4">
        <div className="flex">
          <div className="flex-shrink-0">
            <span className="text-red-400">⚠️</span>
          </div>
          <div className="ml-3">
            <h3 className="text-sm font-medium text-red-800">Error</h3>
            <div className="mt-2 text-sm text-red-700">
              <p>{error}</p>
            </div>
            <div className="mt-4">
              <button
                onClick={loadData}
                className="text-sm bg-red-100 text-red-800 px-3 py-1 rounded hover:bg-red-200"
              >
                Retry
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Bill Weight Summary */}
      {billSummary && (
        <div className="bg-white border border-gray-200 rounded-lg shadow-sm">
          <div className="px-6 py-4 border-b border-gray-200">
            <h3 className="text-lg font-medium text-gray-900">
              Bill Weight Summary
            </h3>
            <p className="mt-1 text-sm text-gray-500">
              {billSummary.billType.charAt(0).toUpperCase() + billSummary.billType.slice(1)} Bill - {billSummary.supplierName}
            </p>
          </div>
          
          <div className="px-6 py-4">
            {/* Overall Summary */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
              <div className="bg-blue-50 p-4 rounded-lg">
                <div className="text-sm font-medium text-blue-900">Total Received Weight</div>
                <div className="text-2xl font-bold text-blue-600">
                  {formatWeight(billSummary.totalWeightSummary.totalReceivedWeight)}
                </div>
              </div>
              <div className="bg-green-50 p-4 rounded-lg">
                <div className="text-sm font-medium text-green-900">Total Sold Weight</div>
                <div className="text-2xl font-bold text-green-600">
                  {formatWeight(billSummary.totalWeightSummary.totalSoldWeight)}
                </div>
              </div>
              <div className="bg-gray-50 p-4 rounded-lg">
                <div className="text-sm font-medium text-gray-900">Weight Difference</div>
                <div className="text-2xl font-bold text-gray-600">
                  {formatWeight(billSummary.totalWeightSummary.totalWeightDifference)}
                </div>
              </div>
            </div>

            {/* Item Details */}
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-gray-200">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Product
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Received
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Sold
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Difference
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Status
                    </th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-200">
                  {billSummary.items.map((item, index) => (
                    <tr key={index}>
                      <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">
                        {item.productName}
                        <div className="text-xs text-gray-500">
                          {item.receivedQuantity} {item.unit} received, {item.soldQuantity} sold
                        </div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                        {formatWeight(item.receivedWeight)}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                        {formatWeight(item.soldWeight)}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                        {item.weightDifference !== null ? (
                          <span className={item.weightDifference > 0 ? 'text-yellow-600' : item.weightDifference < 0 ? 'text-red-600' : 'text-green-600'}>
                            {formatWeight(Math.abs(item.weightDifference))}
                            {item.weightDifference !== 0 && (
                              <span className="ml-1">
                                {item.weightDifference > 0 ? '↑' : '↓'}
                              </span>
                            )}
                          </span>
                        ) : (
                          <span className="text-gray-500">N/A</span>
                        )}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm">
                        {item.isWeightOptional ? (
                          <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-gray-100 text-gray-800">
                            Optional
                          </span>
                        ) : item.weightDifference === null ? (
                          <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-gray-100 text-gray-800">
                            No Weight
                          </span>
                        ) : Math.abs(item.weightDifference) <= config.tolerances.minimum ? (
                          <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-800">
                            ✅ Balanced
                          </span>
                        ) : (
                          <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-yellow-100 text-yellow-800">
                            ⚠️ Discrepancy
                          </span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* Product Summary */}
      {productSummary && (
        <div className="bg-white border border-gray-200 rounded-lg shadow-sm">
          <div className="px-6 py-4 border-b border-gray-200">
            <h3 className="text-lg font-medium text-gray-900">
              Product Weight Analysis
            </h3>
            <p className="mt-1 text-sm text-gray-500">
              {productSummary.productName} - {productSummary.supplierName}
            </p>
          </div>
          
          <div className="px-6 py-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {/* Weight Comparison */}
              <div>
                <h4 className="text-sm font-medium text-gray-900 mb-3">Weight Comparison</h4>
                <div className="space-y-2">
                  <div className="flex justify-between">
                    <span className="text-sm text-gray-600">Total Received:</span>
                    <span className="text-sm font-medium">{formatWeight(productSummary.receivedWeight.total)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-sm text-gray-600">Total Sold:</span>
                    <span className="text-sm font-medium">{formatWeight(productSummary.soldWeight.total)}</span>
                  </div>
                  <div className="flex justify-between border-t pt-2">
                    <span className="text-sm font-medium text-gray-900">Difference:</span>
                    <span className={`text-sm font-medium ${getStatusColor(productSummary.weightComparison.status)}`}>
                      {getStatusIcon(productSummary.weightComparison.status)} {formatWeight(Math.abs(productSummary.weightComparison.difference))}
                      {productSummary.weightComparison.percentageDifference !== 0 && (
                        <span className="ml-1">
                          ({formatPercentage(Math.abs(productSummary.weightComparison.percentageDifference))})
                        </span>
                      )}
                    </span>
                  </div>
                </div>
              </div>

              {/* Status Information */}
              <div>
                <h4 className="text-sm font-medium text-gray-900 mb-3">Status Information</h4>
                <div className="space-y-2">
                  <div className="flex justify-between">
                    <span className="text-sm text-gray-600">Status:</span>
                    <span className={`text-sm font-medium ${getStatusColor(productSummary.weightComparison.status)}`}>
                      {productSummary.weightComparison.status.replace('_', ' ').toUpperCase()}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-sm text-gray-600">Has Discrepancy:</span>
                    <span className={`text-sm font-medium ${productSummary.weightComparison.hasDiscrepancy ? 'text-red-600' : 'text-green-600'}`}>
                      {productSummary.weightComparison.hasDiscrepancy ? 'Yes' : 'No'}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-sm text-gray-600">Threshold:</span>
                    <span className="text-sm font-medium">{formatPercentage(productSummary.weightComparison.discrepancyThreshold)}</span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Discrepancy Alerts */}
      {alerts.length > 0 && (
        <div className="bg-white border border-gray-200 rounded-lg shadow-sm">
          <div className="px-6 py-4 border-b border-gray-200">
            <h3 className="text-lg font-medium text-gray-900">
              Weight Discrepancy Alerts
            </h3>
            <p className="mt-1 text-sm text-gray-500">
              {alerts.length} alert{alerts.length !== 1 ? 's' : ''} found
            </p>
          </div>
          
          <div className="px-6 py-4">
            <div className="space-y-4">
              {alerts.map((alert, index) => (
                <div key={index} className={`border rounded-lg p-4 ${getSeverityColor(alert.severity)}`}>
                  <div className="flex justify-between items-start">
                    <div className="flex-1">
                      <div className="flex items-center">
                        <span className="text-sm font-medium">
                          {alert.productName} - {alert.supplierName}
                        </span>
                        <span className={`ml-2 inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${getSeverityColor(alert.severity)}`}>
                          {alert.severity.toUpperCase()}
                        </span>
                      </div>
                      <p className="mt-1 text-sm">{alert.description}</p>
                      <p className="mt-2 text-xs font-medium">Suggested Action:</p>
                      <p className="text-xs">{alert.suggestedAction}</p>
                    </div>
                    <div className="text-right">
                      <div className="text-sm font-medium">
                        {formatWeight(alert.discrepancyAmount)}
                      </div>
                      <div className="text-xs text-gray-500">
                        {formatPercentage(alert.discrepancyPercentage)}
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Bill Closing Report */}
      {closingReport && showCloseButton && (
        <div className="bg-white border border-gray-200 rounded-lg shadow-sm">
          <div className="px-6 py-4 border-b border-gray-200">
            <h3 className="text-lg font-medium text-gray-900">
              Bill Closing Assessment
            </h3>
          </div>
          
          <div className="px-6 py-4">
            {closingReport.issues.length > 0 && (
              <div className="mb-4">
                <h4 className="text-sm font-medium text-gray-900 mb-2">Issues Found:</h4>
                <div className="space-y-2">
                  {closingReport.issues.map((issue: any, index: number) => (
                    <div key={index} className={`p-3 rounded border ${
                      issue.type === 'error' ? 'bg-red-50 border-red-200 text-red-800' :
                      issue.type === 'warning' ? 'bg-yellow-50 border-yellow-200 text-yellow-800' :
                      'bg-blue-50 border-blue-200 text-blue-800'
                    }`}>
                      <div className="flex items-start">
                        <span className="flex-shrink-0 mr-2">
                          {issue.type === 'error' ? '❌' : issue.type === 'warning' ? '⚠️' : 'ℹ️'}
                        </span>
                        <span className="text-sm">{issue.message}</span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            <div className="flex items-center justify-between pt-4 border-t">
              <div className="flex items-center">
                <span className={`inline-flex items-center px-3 py-1 rounded-full text-sm font-medium ${
                  closingReport.canClose 
                    ? 'bg-green-100 text-green-800' 
                    : 'bg-red-100 text-red-800'
                }`}>
                  {closingReport.canClose ? '✅ Can Close' : '❌ Cannot Close'}
                </span>
                {!closingReport.canClose && (
                  <span className="ml-3 text-sm text-gray-600">
                    Resolve errors before closing
                  </span>
                )}
              </div>
              
              {showCloseButton && (
                <button
                  onClick={() => onBillCloseDecision?.(closingReport.canClose, closingReport.issues)}
                  disabled={!closingReport.canClose}
                  className={`px-4 py-2 rounded text-sm font-medium ${
                    closingReport.canClose
                      ? 'bg-blue-600 text-white hover:bg-blue-700'
                      : 'bg-gray-300 text-gray-500 cursor-not-allowed'
                  }`}
                >
                  {closingReport.canClose ? 'Close Bill' : 'Cannot Close'}
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Configuration Info */}
      <div className="bg-gray-50 border border-gray-200 rounded-lg p-4">
        <h4 className="text-sm font-medium text-gray-900 mb-2">Weight Tracking Configuration</h4>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-xs text-gray-600">
          <div>
            <span className="font-medium">Minor Threshold:</span> {formatPercentage(config.discrepancyThresholds.minor)}
          </div>
          <div>
            <span className="font-medium">Major Threshold:</span> {formatPercentage(config.discrepancyThresholds.major)}
          </div>
          <div>
            <span className="font-medium">Weight Unit:</span> {config.displaySettings.defaultWeightUnit}
          </div>
          <div>
            <span className="font-medium">Commission Weight:</span> {config.requireWeightForCommissionItems ? 'Required' : 'Optional'}
          </div>
        </div>
      </div>
    </div>
  );
};

export default WeightComparisonReport;
