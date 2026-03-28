import React, { useState, useEffect, useCallback } from 'react';
import { Wallet, X } from 'lucide-react';
import { useI18n } from '../i18n';
import { getLocalDateString, getTodayLocalDate } from '../utils/dateUtils';

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

  const loadBalanceReport = useCallback(async () => {
    setLoading(true);
    try {
      console.log('📊 Loading balance report with dates:', { startDate, endDate });
      const report = await getBalanceReport(startDate, endDate);
      console.log('📊 Balance report result:', report);
      setBalanceReport(report);
    } catch (error) {
      console.error('Error loading balance report:', error);
    } finally {
      setLoading(false);
    }
  }, [startDate, endDate, getBalanceReport]);

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
  }, [storeId, startDate, endDate, loadBalanceReport]);

  // Listen for cash drawer updates to refresh the report
  useEffect(() => {
    const handleCashDrawerUpdated = (e: any) => {
      if (e?.detail?.storeId === storeId) {
        console.log('Balance report: Cash drawer updated, refreshing report');
        loadBalanceReport();
      }
    };

    window.addEventListener('cash-drawer-updated', handleCashDrawerUpdated);
    
    return () => {
      window.removeEventListener('cash-drawer-updated', handleCashDrawerUpdated);
    };
  }, [storeId, loadBalanceReport]);

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
    a.download = `cash-drawer-balance-report-${getTodayLocalDate()}.csv`;
    a.click();
    window.URL.revokeObjectURL(url);
  };

  const setDefaultDateRange = () => {
    const today = new Date();
    const thirtyDaysAgo = new Date(today.getTime() - (30 * 24 * 60 * 60 * 1000));
    setStartDate(getLocalDateString(thirtyDaysAgo.toISOString()));
    setEndDate(getTodayLocalDate());
  };

  const loadSessionDetails = async (session: any) => {
    if (!getSessionDetails) return;
    
    setSelectedSession(session);
    setShowDetailsModal(true);
    setSessionDetails(null);
    
    try {
      const details = await getSessionDetails(session.id || session.sessionId);
      setSessionDetails(details);
    } catch (error) {
      console.error('Error loading session details:', error);
    }
  };
  const { t } = useI18n();

  return (
    <div className="bg-white rounded-lg shadow-md p-6" dir="auto">
      <div className="flex justify-between items-center mb-6 rtl:flex-row-reverse">
        <h2 className="text-2xl font-bold text-gray-900 rtl:text-right ltr:text-left">{t('balanceReport.title')}</h2>
        <div className="flex gap-4 rtl:space-x-reverse rtl:flex-row-reverse">
          <button
            onClick={setDefaultDateRange}
            className="bg-gray-100 text-gray-700 px-3 py-2 rounded-md hover:bg-gray-200 text-sm"
          >
            {t('balanceReport.last30Days')}
          </button>
          <input
            type="date"
            value={startDate}
            onChange={(e) => setStartDate(e.target.value)}
            className="border border-gray-300 rounded-md px-3 py-2"
            placeholder={t('balanceReport.startDate')}
          />
          <input
            type="date"
            value={endDate}
            onChange={(e) => setEndDate(e.target.value)}
            className="border border-gray-300 rounded-md px-3 py-2"
            placeholder={t('balanceReport.endDate')}
          />
          <button
            onClick={loadBalanceReport}
            className="bg-blue-600 text-white px-4 py-2 rounded-md hover:bg-blue-700"
          >
            {t('balanceReport.refresh')}
          </button>
          {balanceReport.sessions && balanceReport.sessions.length > 0 && (
            <button
              onClick={exportToCSV}
              className="bg-green-600 text-white px-4 py-2 rounded-md hover:bg-green-700"
            >
              {t('balanceReport.exportCSV')}
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
            <div className="mb-6 grid grid-cols-2 md:grid-cols-4 gap-4 rtl:grid-flow-col-dense">
              <div className="bg-blue-50 p-4 rounded-lg border border-blue-200 rtl:text-right ltr:text-left">
                <div className="text-sm font-medium text-blue-600">{t('balanceReport.totalSessions')}</div>
                <div className="text-2xl font-bold text-blue-900">{balanceReport.summary.totalSessions}</div>
              </div>
              <div className="bg-green-50 p-4 rounded-lg border border-green-200 rtl:text-right ltr:text-left">
                <div className="text-sm font-medium text-green-600">{t('balanceReport.balanced')}</div>
                <div className="text-2xl font-bold text-green-900">{balanceReport.summary.balancedSessions}</div>
              </div>
              <div className="bg-red-50 p-4 rounded-lg border border-red-200 rtl:text-right ltr:text-left">
                <div className="text-sm font-medium text-red-600">{t('balanceReport.unbalanced')}</div>
                <div className="text-2xl font-bold text-red-900">{balanceReport.summary.unbalancedSessions}</div>
              </div>
              <div className="bg-yellow-50 p-4 rounded-lg border border-yellow-200 rtl:text-right ltr:text-left">
                <div className="text-sm font-medium text-yellow-600">{t('balanceReport.avgVariance')}</div>
                <div className="text-2xl font-bold text-yellow-900">{formatCurrency(balanceReport.summary.averageVariance)}</div>
              </div>
            </div>
          )}

          {/* Detailed Table */}
          <div className="overflow-x-auto" dir="auto">
            <div className="mb-2 text-sm text-gray-600 rtl:text-right">
              💡 {t('balanceReport.clickRowForDetails')}
            </div>
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th key="employee" className="px-6 py-3 text-xs font-medium text-gray-500 uppercase rtl:text-right ltr:text-left">{t('balanceReport.employee')}</th>
                  <th key="date" className="px-6 py-3 text-xs font-medium text-gray-500 uppercase rtl:text-right ltr:text-left">{t('balanceReport.date')}</th>
                  <th key="opening" className="px-6 py-3 text-xs font-medium text-gray-500 uppercase rtl:text-right ltr:text-left">{t('balanceReport.opening')}</th>
                  <th key="expected" className="px-6 py-3 text-xs font-medium text-gray-500 uppercase rtl:text-right ltr:text-left">{t('balanceReport.expected')}</th>
                  <th key="actual" className="px-6 py-3 text-xs font-medium text-gray-500 uppercase rtl:text-right ltr:text-left">{t('balanceReport.actual')}</th>
                  <th key="variance" className="px-6 py-3 text-xs font-medium text-gray-500 uppercase rtl:text-right ltr:text-left">{t('balanceReport.variance')}</th>
                  <th key="status" className="px-6 py-3 text-xs font-medium text-gray-500 uppercase rtl:text-right ltr:text-left">{t('balanceReport.status')}</th>
                  <th key="notes" className="px-6 py-3 text-xs font-medium text-gray-500 uppercase rtl:text-right ltr:text-left">{t('balanceReport.notes')}</th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {balanceReport.sessions && balanceReport.sessions.map((balance: any, index: number) => (
                  <tr 
                    key={balance.id || balance.sessionId || `session-${index}`} 
                    className="hover:bg-gray-50 cursor-pointer"
                    onClick={() => loadSessionDetails(balance)}
                  >
                    <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900 rtl:text-right ltr:text-left">
                      {balance.employeeName}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500 rtl:text-right ltr:text-left">
                      {new Date(balance.date).toLocaleDateString()}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900 rtl:text-right ltr:text-left">
                      {formatCurrency(balance.openingAmount)}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900 rtl:text-right ltr:text-left">
                      {formatCurrency(balance.expectedAmount)}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900 rtl:text-right ltr:text-left">
                      {formatCurrency(balance.actualAmount)}
                    </td>
                    <td className={`px-6 py-4 whitespace-nowrap text-sm font-medium rtl:text-right ltr:text-left ${
                      balance.status === 'balanced' ? 'text-green-600' : 'text-red-600'
                    }`}>
                      {formatCurrency(balance.variance)}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900 rtl:text-right ltr:text-left">
                      <span className={`px-2 py-1 rounded-full text-xs ${
                        balance.status === 'balanced' 
                          ? 'bg-green-100 text-green-800' 
                          : 'bg-red-100 text-red-800'
                      }`}>
                        {balance.status === 'balanced' ? t('balanceReport.balanced') : t('balanceReport.unbalanced')}
                      </span>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500 rtl:text-right ltr:text-left">
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
          <p className="text-lg font-medium text-gray-900 mb-2 rtl:text-right">{t('balanceReport.noSessionsFound')}</p>
          <p className="text-gray-600 rtl:text-right">
            {t('balanceReport.noSessionsMessage')}
          </p>
        </div>
      )}

      {/* Session Details Modal */}
      {showDetailsModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50" dir="auto">
          <div className="bg-white rounded-lg max-w-4xl w-full max-h-[90vh] overflow-y-auto">
            <div className="p-6 border-b">
              <div className="flex justify-between items-center rtl:flex-row-reverse">
                <h2 className="text-xl font-semibold text-gray-900 rtl:text-right">{t('balanceReport.sessionDetails')}</h2>
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
                    <h3 className="text-lg font-semibold text-gray-900 mb-4 rtl:text-right">{t('balanceReport.sessionSummary')}</h3>
                    <div className="space-y-3">
                      <div className="rtl:text-right">
                        <span className="text-sm font-medium text-gray-600">{t('balanceReport.employee')}:</span>
                        <span className="rtl:mr-2 ltr:ml-2 text-sm text-gray-900">{selectedSession.employeeName}</span>
                      </div>
                      <div className="rtl:text-right">
                        <span className="text-sm font-medium text-gray-600">{t('balanceReport.date')}:</span>
                        <span className="rtl:mr-2 ltr:ml-2 text-sm text-gray-900">
                          {new Date(selectedSession.date).toLocaleDateString()}
                        </span>
                      </div>
                      <div className="rtl:text-right">
                        <span className="text-sm font-medium text-gray-600">{t('balanceReport.openingAmount')}:</span>
                        <span className="rtl:mr-2 ltr:ml-2 text-sm text-gray-900 font-semibold">
                          {formatCurrency(selectedSession.openingAmount)}
                        </span>
                      </div>
                      <div className="rtl:text-right">
                        <span className="text-sm font-medium text-gray-600">{t('balanceReport.expectedAmount')}:</span>
                        <span className="rtl:mr-2 ltr:ml-2 text-sm text-gray-900 font-semibold">
                          {formatCurrency(selectedSession.expectedAmount)}
                        </span>
                      </div>
                      <div className="rtl:text-right">
                        <span className="text-sm font-medium text-gray-600">{t('balanceReport.actualAmount')}:</span>
                        <span className="rtl:mr-2 ltr:ml-2 text-sm text-gray-900 font-semibold">
                          {formatCurrency(selectedSession.actualAmount)}
                        </span>
                      </div>
                      <div className="rtl:text-right">
                        <span className="text-sm font-medium text-gray-600">{t('balanceReport.variance')}:</span>
                        <span className={`rtl:mr-2 ltr:ml-2 text-sm font-semibold ${
                          selectedSession.status === 'balanced' ? 'text-green-600' : 'text-red-600'
                        }`}>
                          {formatCurrency(selectedSession.variance)}
                        </span>
                      </div>
                    </div>
                  </div>
                  
                  <div>
                    <h3 className="text-lg font-semibold text-gray-900 mb-4 rtl:text-right">{t('balanceReport.transactionSummary')}</h3>
                    {sessionDetails ? (
                      <div className="space-y-3">
                        <div className="bg-green-50 p-3 rounded-lg border border-green-200">
                          <div className="text-sm font-medium text-green-800 rtl:text-right">{t('balanceReport.cashSales')}</div>
                          <div className="text-lg font-bold text-green-900 rtl:text-right">
                            {formatCurrency(sessionDetails.totals.sales)}
                          </div>
                          <div className="text-xs text-green-600 rtl:text-right">
                            {sessionDetails.transactions.sales.length} {t('balanceReport.transactions')}
                          </div>
                        </div>
                        <div className="bg-blue-50 p-3 rounded-lg border border-blue-200">
                          <div className="text-sm font-medium text-blue-800 rtl:text-right">{t('balanceReport.cashPayments')}</div>
                          <div className="text-lg font-bold text-blue-900 rtl:text-right">
                            {formatCurrency(sessionDetails.totals.payments)}
                          </div>
                          <div className="text-xs text-blue-600 rtl:text-right">
                            {sessionDetails.transactions.payments.length} {t('balanceReport.transactions')}
                          </div>
                        </div>
                        <div className="bg-red-50 p-3 rounded-lg border border-red-200">
                          <div className="text-sm font-medium text-red-800 rtl:text-right">{t('balanceReport.cashExpenses')}</div>
                          <div className="text-lg font-bold text-red-900 rtl:text-right">
                            {formatCurrency(sessionDetails.totals.expenses)}
                          </div>
                          <div className="text-xs text-red-600 rtl:text-right">
                            {sessionDetails.transactions.expenses.length} {t('balanceReport.transactions')}
                          </div>
                        </div>
                      </div>
                    ) : (
                      <div className="text-center py-8">
                        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto"></div>
                        <p className="text-sm text-gray-600 mt-2 rtl:text-right">{t('balanceReport.loadingTransactionDetails')}</p>
                      </div>
                    )}
                  </div>
                </div>
                
                {sessionDetails && (
                  <div>
                    <h3 className="text-lg font-semibold text-gray-900 mb-4 rtl:text-right">{t('balanceReport.transactionDetails')}</h3>
                    <div className="space-y-4">
                      {/* Cash Sales */}
                      {sessionDetails.transactions.sales.length > 0 && (
                        <div>
                          <h4 className="text-md font-medium text-gray-700 mb-2 rtl:text-right">{t('balanceReport.cashSales')}</h4>
                          <div className="overflow-x-auto" dir="auto">
                            <table className="min-w-full divide-y divide-gray-200">
                              <thead className="bg-gray-50">
                                <tr>
                                  <th key="product" className="px-3 py-2 text-xs font-medium text-gray-500 rtl:text-right ltr:text-left">{t('balanceReport.product')}</th>
                                  <th key="quantity" className="px-3 py-2 text-xs font-medium text-gray-500 rtl:text-right ltr:text-left">{t('balanceReport.quantity')}</th>
                                  <th key="unitPrice" className="px-3 py-2 text-xs font-medium text-gray-500 rtl:text-right ltr:text-left">{t('balanceReport.unitPrice')}</th>
                                  <th key="total" className="px-3 py-2 text-xs font-medium text-gray-500 rtl:text-right ltr:text-left">{t('balanceReport.total')}</th>
                                </tr>
                              </thead>
                              <tbody className="bg-white divide-y divide-gray-200">
                                {sessionDetails.transactions.sales.map((sale: any, index: number) => (
                                  <tr key={`sale-${sale.id || `sale-${index}`}`} className="hover:bg-gray-50">
                                    <td className="px-3 py-2 text-sm text-gray-900 rtl:text-right ltr:text-left">{sale.product_name || t('balanceReport.unknown')}</td>
                                    <td className="px-3 py-2 text-sm text-gray-900 rtl:text-right ltr:text-left">{sale.quantity}</td>
                                    <td className="px-3 py-2 text-sm text-gray-900 rtl:text-right ltr:text-left">{formatCurrency(sale.unit_price)}</td>
                                    <td className="px-3 py-2 text-sm text-gray-900 font-semibold rtl:text-right ltr:text-left">{formatCurrency(sale.received_value)}</td>
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
                          <h4 className="text-md font-medium text-gray-700 mb-2 rtl:text-right">{t('balanceReport.cashPayments')}</h4>
                          <div className="overflow-x-auto" dir="auto">
                            <table className="min-w-full divide-y divide-gray-200">
                              <thead className="bg-gray-50">
                                <tr>
                                  <th key="description" className="px-3 py-2 text-xs font-medium text-gray-500 rtl:text-right ltr:text-left">{t('balanceReport.description')}</th>
                                  <th key="amount" className="px-3 py-2 text-xs font-medium text-gray-500 rtl:text-right ltr:text-left">{t('balanceReport.amount')}</th>
                                  <th key="reference" className="px-3 py-2 text-xs font-medium text-gray-500 rtl:text-right ltr:text-left">{t('balanceReport.reference')}</th>
                                </tr>
                              </thead>
                              <tbody className="bg-white divide-y divide-gray-200">
                                {sessionDetails.transactions.payments.map((payment: any, index: number) => (
                                  <tr key={`payment-${payment.id || `payment-${index}`}`} className="hover:bg-gray-50">
                                    <td className="px-3 py-2 text-sm text-gray-900 rtl:text-right ltr:text-left">{payment.description}</td>
                                    <td className="px-3 py-2 text-sm text-gray-900 font-semibold rtl:text-right ltr:text-left">{formatCurrency(payment.amount)}</td>
                                    <td className="px-3 py-2 text-sm text-gray-500 rtl:text-right ltr:text-left">{payment.reference || '-'}</td>
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
                          <h4 className="text-md font-medium text-gray-700 mb-2 rtl:text-right">{t('balanceReport.cashExpenses')}</h4>
                          <div className="overflow-x-auto" dir="auto">
                            <table className="min-w-full divide-y divide-gray-200">
                              <thead className="bg-gray-50">
                                <tr>
                                  <th key="description-exp" className="px-3 py-2 text-xs font-medium text-gray-500 rtl:text-right ltr:text-left">{t('balanceReport.description')}</th>
                                  <th key="amount-exp" className="px-3 py-2 text-xs font-medium text-gray-500 rtl:text-right ltr:text-left">{t('balanceReport.amount')}</th>
                                  <th key="category" className="px-3 py-2 text-xs font-medium text-gray-500 rtl:text-right ltr:text-left">{t('balanceReport.category')}</th>
                                </tr>
                              </thead>
                              <tbody className="bg-white divide-y divide-gray-200">
                                {sessionDetails.transactions.expenses.map((expense: any, index: number) => (
                                  <tr key={`expense-${expense.id || `expense-${index}`}`} className="hover:bg-gray-50">
                                    <td className="px-3 py-2 text-sm text-gray-900 rtl:text-right ltr:text-left">{expense.description}</td>
                                    <td className="px-3 py-2 text-sm text-gray-900 font-semibold rtl:text-right ltr:text-left">{formatCurrency(expense.amount)}</td>
                                    <td className="px-3 py-2 text-sm text-gray-500 rtl:text-right ltr:text-left">{expense.category}</td>
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
