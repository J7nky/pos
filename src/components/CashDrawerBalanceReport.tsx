import React, { useState, useEffect } from 'react';
import { Wallet, X } from 'lucide-react';

interface CashDrawerBalanceReportProps {
  storeId: string;
  getBalanceReport: (startDate?: string, endDate?: string) => Promise<any>;
  getSessionDetails?: (sessionId: string) => Promise<any>;
}

export const CashDrawerBalanceReport: React.FC<CashDrawerBalanceReportProps> = ({ 
  storeId, 
  getBalanceReport,
  getSessionDetails
}) => {
  const [balanceReport, setBalanceReport] = useState<any>({ sessions: [], summary: {} });
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [loading, setLoading] = useState(false);
  const [selectedSession, setSelectedSession] = useState<any>(null);
  const [sessionDetails, setSessionDetails] = useState<any>(null);
  const [showDetailsModal, setShowDetailsModal] = useState(false);

  useEffect(() => {
    // Set default date range on mount
    if (!startDate && !endDate) {
      setDefaultDateRange();
    }
  }, []);

  useEffect(() => {
    if (startDate && endDate) {
      loadBalanceReport();
    }
  }, [storeId, startDate, endDate]);

  const loadBalanceReport = async () => {
    setLoading(true);
    try {
      const report = await getBalanceReport(startDate, endDate);
      setBalanceReport(report);
    } catch (error) {
      console.error('Error loading balance report:', error);
    } finally {
      setLoading(false);
    }
  };

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD'
    }).format(amount);
  };

  const exportToCSV = () => {
    if (!balanceReport.sessions || balanceReport.sessions.length === 0) return;
    
    const headers = ['Employee', 'Date', 'Opening Amount', 'Expected Amount', 'Actual Amount', 'Variance', 'Status', 'Notes'];
    const csvContent = [
      headers.join(','),
      ...balanceReport.sessions.map((session: any) => [
        `"${session.employeeName}"`,
        `"${new Date(session.date).toLocaleDateString()}"`,
        session.openingAmount,
        session.expectedAmount,
        session.actualAmount,
        session.variance,
        session.status,
        `"${session.notes || ''}"`
      ].join(','))
    ].join('\n');
    
    const blob = new Blob([csvContent], { type: 'text/csv' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `cash-drawer-balance-report-${new Date().toISOString().split('T')[0]}.csv`;
    a.click();
    window.URL.revokeObjectURL(url);
  };

  const setDefaultDateRange = () => {
    const today = new Date();
    const thirtyDaysAgo = new Date(today.getTime() - (30 * 24 * 60 * 60 * 1000));
    setStartDate(thirtyDaysAgo.toISOString().split('T')[0]);
    setEndDate(today.toISOString().split('T')[0]);
  };

  const loadSessionDetails = async (session: any) => {
    if (!getSessionDetails) return;
    
    setSelectedSession(session);
    setShowDetailsModal(true);
    setSessionDetails(null);
    
    try {
      const details = await getSessionDetails(session.sessionId);
      setSessionDetails(details);
    } catch (error) {
      console.error('Error loading session details:', error);
    }
  };

  return (
    <div className="bg-white rounded-lg shadow-md p-6">
      <div className="flex justify-between items-center mb-6">
        <h2 className="text-2xl font-bold text-gray-900">Cash Drawer Balance Report</h2>
        <div className="flex gap-4">
          <button
            onClick={setDefaultDateRange}
            className="bg-gray-100 text-gray-700 px-3 py-2 rounded-md hover:bg-gray-200 text-sm"
          >
            Last 30 Days
          </button>
          <input
            type="date"
            value={startDate}
            onChange={(e) => setStartDate(e.target.value)}
            className="border border-gray-300 rounded-md px-3 py-2"
            placeholder="Start Date"
          />
          <input
            type="date"
            value={endDate}
            onChange={(e) => setEndDate(e.target.value)}
            className="border border-gray-300 rounded-md px-3 py-2"
            placeholder="End Date"
          />
          <button
            onClick={loadBalanceReport}
            className="bg-blue-600 text-white px-4 py-2 rounded-md hover:bg-blue-700"
          >
            Refresh
          </button>
          {balanceReport.sessions && balanceReport.sessions.length > 0 && (
            <button
              onClick={exportToCSV}
              className="bg-green-600 text-white px-4 py-2 rounded-md hover:bg-green-700"
            >
              Export CSV
            </button>
          )}
        </div>
      </div>

      {loading ? (
        <div className="text-center py-8">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto"></div>
        </div>
      ) : (
        <>
          {/* Summary Statistics */}
          {balanceReport.summary && balanceReport.summary.totalSessions > 0 && (
            <div className="mb-6 grid grid-cols-2 md:grid-cols-4 gap-4">
              <div className="bg-blue-50 p-4 rounded-lg border border-blue-200">
                <div className="text-sm font-medium text-blue-600">Total Sessions</div>
                <div className="text-2xl font-bold text-blue-900">{balanceReport.summary.totalSessions}</div>
              </div>
              <div className="bg-green-50 p-4 rounded-lg border border-green-200">
                <div className="text-sm font-medium text-green-600">Balanced</div>
                <div className="text-2xl font-bold text-green-900">{balanceReport.summary.balancedSessions}</div>
              </div>
              <div className="bg-red-50 p-4 rounded-lg border border-red-200">
                <div className="text-sm font-medium text-red-600">Unbalanced</div>
                <div className="text-2xl font-bold text-red-900">{balanceReport.summary.unbalancedSessions}</div>
              </div>
              <div className="bg-yellow-50 p-4 rounded-lg border border-yellow-200">
                <div className="text-sm font-medium text-yellow-600">Avg Variance</div>
                <div className="text-2xl font-bold text-yellow-900">{formatCurrency(balanceReport.summary.averageVariance)}</div>
              </div>
            </div>
          )}

          {/* Detailed Table */}
          <div className="overflow-x-auto">
            <div className="mb-2 text-sm text-gray-600">
              💡 Click on any row to view detailed transaction information
            </div>
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Employee</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Date</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Opening</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Expected</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Actual</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Variance</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Status</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Notes</th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {balanceReport.sessions && balanceReport.sessions.map((balance: any) => (
                  <tr 
                    key={balance.sessionId} 
                    className="hover:bg-gray-50 cursor-pointer"
                    onClick={() => loadSessionDetails(balance)}
                  >
                    <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">
                      {balance.employeeName}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                      {new Date(balance.date).toLocaleDateString()}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                      {formatCurrency(balance.openingAmount)}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                      {formatCurrency(balance.expectedAmount)}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                      {formatCurrency(balance.actualAmount)}
                    </td>
                    <td className={`px-6 py-4 whitespace-nowrap text-sm font-medium ${
                      balance.status === 'balanced' ? 'text-green-600' : 'text-red-600'
                    }`}>
                      {formatCurrency(balance.variance)}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                      <span className={`px-2 py-1 rounded-full text-xs ${
                        balance.status === 'balanced' 
                          ? 'bg-green-100 text-green-800' 
                          : 'bg-red-100 text-red-800'
                      }`}>
                        {balance.status}
                      </span>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                      {balance.notes || '-'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}

      {(!balanceReport.sessions || balanceReport.sessions.length === 0) && !loading && (
        <div className="text-center py-8 text-gray-500">
          <div className="mb-4">
            <Wallet className="w-16 h-16 text-gray-300 mx-auto" />
          </div>
          <p className="text-lg font-medium text-gray-900 mb-2">No Cash Drawer Sessions Found</p>
          <p className="text-gray-600">
            No closed cash drawer sessions found for the selected date range. 
            Cash drawer sessions are created when employees open and close cash drawers.
          </p>
        </div>
      )}

      {/* Session Details Modal */}
      {showDetailsModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-lg max-w-4xl w-full max-h-[90vh] overflow-y-auto">
            <div className="p-6 border-b">
              <div className="flex justify-between items-center">
                <h2 className="text-xl font-semibold text-gray-900">Session Details</h2>
                <button
                  onClick={() => setShowDetailsModal(false)}
                  className="text-gray-400 hover:text-gray-600"
                >
                  <X className="w-6 h-6" />
                </button>
              </div>
            </div>
            
            {selectedSession && (
              <div className="p-6">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-6">
                  <div>
                    <h3 className="text-lg font-semibold text-gray-900 mb-4">Session Summary</h3>
                    <div className="space-y-3">
                      <div>
                        <span className="text-sm font-medium text-gray-600">Employee:</span>
                        <span className="ml-2 text-sm text-gray-900">{selectedSession.employeeName}</span>
                      </div>
                      <div>
                        <span className="text-sm font-medium text-gray-600">Date:</span>
                        <span className="ml-2 text-sm text-gray-900">
                          {new Date(selectedSession.date).toLocaleDateString()}
                        </span>
                      </div>
                      <div>
                        <span className="text-sm font-medium text-gray-600">Opening Amount:</span>
                        <span className="ml-2 text-sm text-gray-900 font-semibold">
                          {formatCurrency(selectedSession.openingAmount)}
                        </span>
                      </div>
                      <div>
                        <span className="text-sm font-medium text-gray-600">Expected Amount:</span>
                        <span className="ml-2 text-sm text-gray-900 font-semibold">
                          {formatCurrency(selectedSession.expectedAmount)}
                        </span>
                      </div>
                      <div>
                        <span className="text-sm font-medium text-gray-600">Actual Amount:</span>
                        <span className="ml-2 text-sm text-gray-900 font-semibold">
                          {formatCurrency(selectedSession.actualAmount)}
                        </span>
                      </div>
                      <div>
                        <span className="text-sm font-medium text-gray-600">Variance:</span>
                        <span className={`ml-2 text-sm font-semibold ${
                          selectedSession.status === 'balanced' ? 'text-green-600' : 'text-red-600'
                        }`}>
                          {formatCurrency(selectedSession.variance)}
                        </span>
                      </div>
                    </div>
                  </div>
                  
                  <div>
                    <h3 className="text-lg font-semibold text-gray-900 mb-4">Transaction Summary</h3>
                    {sessionDetails ? (
                      <div className="space-y-3">
                        <div className="bg-green-50 p-3 rounded-lg border border-green-200">
                          <div className="text-sm font-medium text-green-800">Cash Sales</div>
                          <div className="text-lg font-bold text-green-900">
                            {formatCurrency(sessionDetails.totals.sales)}
                          </div>
                          <div className="text-xs text-green-600">
                            {sessionDetails.transactions.sales.length} transactions
                          </div>
                        </div>
                        <div className="bg-blue-50 p-3 rounded-lg border border-blue-200">
                          <div className="text-sm font-medium text-blue-800">Cash Payments</div>
                          <div className="text-lg font-bold text-blue-900">
                            {formatCurrency(sessionDetails.totals.payments)}
                          </div>
                          <div className="text-xs text-blue-600">
                            {sessionDetails.transactions.payments.length} transactions
                          </div>
                        </div>
                        <div className="bg-red-50 p-3 rounded-lg border border-red-200">
                          <div className="text-sm font-medium text-red-800">Cash Expenses</div>
                          <div className="text-lg font-bold text-red-900">
                            {formatCurrency(sessionDetails.totals.expenses)}
                          </div>
                          <div className="text-xs text-red-600">
                            {sessionDetails.transactions.expenses.length} transactions
                          </div>
                        </div>
                      </div>
                    ) : (
                      <div className="text-center py-8">
                        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto"></div>
                        <p className="text-sm text-gray-600 mt-2">Loading transaction details...</p>
                      </div>
                    )}
                  </div>
                </div>
                
                {sessionDetails && (
                  <div>
                    <h3 className="text-lg font-semibold text-gray-900 mb-4">Transaction Details</h3>
                    <div className="space-y-4">
                      {/* Cash Sales */}
                      {sessionDetails.transactions.sales.length > 0 && (
                        <div>
                          <h4 className="text-md font-medium text-gray-700 mb-2">Cash Sales</h4>
                          <div className="overflow-x-auto">
                            <table className="min-w-full divide-y divide-gray-200">
                              <thead className="bg-gray-50">
                                <tr>
                                  <th className="px-3 py-2 text-left text-xs font-medium text-gray-500">Product</th>
                                  <th className="px-3 py-2 text-left text-xs font-medium text-gray-500">Quantity</th>
                                  <th className="px-3 py-2 text-left text-xs font-medium text-gray-500">Unit Price</th>
                                  <th className="px-3 py-2 text-left text-xs font-medium text-gray-500">Total</th>
                                </tr>
                              </thead>
                              <tbody className="bg-white divide-y divide-gray-200">
                                {sessionDetails.transactions.sales.map((sale: any, index: number) => (
                                  <tr key={`sale-${sale.id || `sale-${index}`}`} className="hover:bg-gray-50">
                                    <td className="px-3 py-2 text-sm text-gray-900">{sale.product_name || 'Unknown'}</td>
                                    <td className="px-3 py-2 text-sm text-gray-900">{sale.quantity}</td>
                                    <td className="px-3 py-2 text-sm text-gray-900">{formatCurrency(sale.unit_price)}</td>
                                    <td className="px-3 py-2 text-sm text-gray-900 font-semibold">{formatCurrency(sale.received_value)}</td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          </div>
                        </div>
                      )}
                      
                      {/* Cash Payments */}
                      {sessionDetails.transactions.payments.length > 0 && (
                        <div>
                          <h4 className="text-md font-medium text-gray-700 mb-2">Cash Payments</h4>
                          <div className="overflow-x-auto">
                            <table className="min-w-full divide-y divide-gray-200">
                              <thead className="bg-gray-50">
                                <tr>
                                  <th className="px-3 py-2 text-left text-xs font-medium text-gray-500">Description</th>
                                  <th className="px-3 py-2 text-left text-xs font-medium text-gray-500">Amount</th>
                                  <th className="px-3 py-2 text-left text-xs font-medium text-gray-500">Reference</th>
                                </tr>
                              </thead>
                              <tbody className="bg-white divide-y divide-gray-200">
                                {sessionDetails.transactions.payments.map((payment: any, index: number) => (
                                  <tr key={`payment-${payment.id || `payment-${index}`}`} className="hover:bg-gray-50">
                                    <td className="px-3 py-2 text-sm text-gray-900">{payment.description}</td>
                                    <td className="px-3 py-2 text-sm text-gray-900 font-semibold">{formatCurrency(payment.amount)}</td>
                                    <td className="px-3 py-2 text-sm text-gray-500">{payment.reference || '-'}</td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          </div>
                        </div>
                      )}
                      
                      {/* Cash Expenses */}
                      {sessionDetails.transactions.expenses.length > 0 && (
                        <div>
                          <h4 className="text-md font-medium text-gray-700 mb-2">Cash Expenses</h4>
                          <div className="overflow-x-auto">
                            <table className="min-w-full divide-y divide-gray-200">
                              <thead className="bg-gray-50">
                                <tr>
                                  <th className="px-3 py-2 text-left text-xs font-medium text-gray-500">Description</th>
                                  <th className="px-3 py-2 text-left text-xs font-medium text-gray-500">Amount</th>
                                  <th className="px-3 py-2 text-left text-xs font-medium text-gray-500">Category</th>
                                </tr>
                              </thead>
                              <tbody className="bg-white divide-y divide-gray-200">
                                {sessionDetails.transactions.expenses.map((expense: any, index: number) => (
                                  <tr key={`expense-${expense.id || `expense-${index}`}`} className="hover:bg-gray-50">
                                    <td className="px-3 py-2 text-sm text-gray-900">{expense.description}</td>
                                    <td className="px-3 py-2 text-sm text-gray-900 font-semibold">{formatCurrency(expense.amount)}</td>
                                    <td className="px-3 py-2 text-sm text-gray-500">{expense.category}</td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};
