import { useParams } from 'react-router-dom';
import {
  ArrowLeft,
  Download,
  Printer,
  Calendar,
  FileText,
  DollarSign,
  TrendingUp,
  CreditCard,
  Users,
  BarChart3,
  List,
  Info,
  QrCode
} from 'lucide-react';
import { AccountStatement, AccountStatementService } from '../services/accountStatementService';
import { getCustomerByToken } from '../services/publicStatementService';
import { Customer } from '../types';
import { useI18n } from '../i18n';
import { useErrorHandler } from '../hooks/useErrorHandler';
import { getTranslatedString, type SupportedLanguage } from '../utils/multilingual';
import { PrintLayout } from '../components/common/PrintLayout';
import { PrintPreview } from '../components/common/PrintPreview';
import { useState as useStateReact, useRef, useEffect } from 'react';
import { setupPrintWithPageSelection } from '../utils/printUtils';
import { paginateTransactions, getTotalPages } from '../utils/printPagination';
import { getLocalDateString, getTodayLocalDate } from '../utils/dateUtils';
import { currencyService } from '../services/currencyService';
import { useOfflineData } from '../contexts/OfflineDataContext';
import type { CurrencyCode } from '@pos-platform/shared';

export default function PublicCustomerStatement() {
  const { token: encodedToken } = useParams<{ token: string }>();
  const { language } = useI18n();
  const { handleError } = useErrorHandler();
  const { preferredCurrency } = useOfflineData();

  // Convert per-currency balance map to a single preferredCurrency value via FX rate.
  const convertMapToPreferred = (map: Partial<Record<CurrencyCode, number>> | undefined): number => {
    if (!map) return 0;
    let total = 0;
    for (const c of Object.keys(map) as CurrencyCode[]) {
      const v = map[c];
      if (v === undefined) continue;
      try {
        total += currencyService.convert(v, c, preferredCurrency);
      } catch {
        // Missing FX rate — skip; row's native debit/credit cells still render.
      }
    }
    return total;
  };

  // URL-decode the token (it was encoded to handle special characters)
  const token = encodedToken ? decodeURIComponent(encodedToken) : undefined;

  const [statement, setStatement] = useStateReact<AccountStatement | null>(null);
  const [customer, setCustomer] = useStateReact<Customer | null>(null);
  const [, setCustomerId] = useStateReact<string | null>(null);
  const [isLoading, setIsLoading] = useStateReact(true);
  const [error, setError] = useStateReact<string | null>(null);
  const [viewMode, setViewMode] = useStateReact<'summary' | 'detailed'>('summary');
  const [showPrintPreview, setShowPrintPreview] = useStateReact(false);
  const [totalPages, setTotalPages] = useStateReact(1);
  const printContentRef = useRef<HTMLDivElement>(null);
  const [dateRange, setDateRange] = useStateReact<{ start: string; end: string }>({
    start: getLocalDateString(new Date(new Date().getFullYear(), 0, 1).toISOString()),
    end: getTodayLocalDate(),
  });

  useEffect(() => {
    if (token) {
      loadCustomerStatement();
    }
  }, [token, dateRange, viewMode]);

  const loadCustomerStatement = async () => {
    if (!token) return;

    setIsLoading(true);
    setError(null);

    try {
      const tokenResult = await getCustomerByToken(token);

      if (!tokenResult.success) {
        handleError(tokenResult.error);
        setError(tokenResult.error.message);
        setIsLoading(false);
        return;
      }

      const { data } = tokenResult;
      setCustomerId(data.customerId);
      setCustomer(data.customer);

      const accountStatementService = AccountStatementService.getInstance();
      const generatedStatement = await accountStatementService.generateCustomerStatement(
        data.customerId,
        data.storeId,
        dateRange,
        viewMode,
        language as 'en' | 'ar' | 'fr'
      );

      setStatement(generatedStatement);
      
    } catch (err) {
      handleError(err);
      setError('Failed to load customer statement. Please try again later.');
    } finally {
      setIsLoading(false);
    }
  };

  // Update page count when statement changes
  useEffect(() => {
    if (statement) {
      const total = getTotalPages(statement.transactions.length, viewMode);
      setTotalPages(total);
    }
  }, [statement, viewMode]);

  const handlePrintClick = () => {
    if (!statement) return;
    setShowPrintPreview(true);
  };

  const handlePrint = (selectedPages?: number[]) => {
    setupPrintWithPageSelection(selectedPages, totalPages);
  };

  const handleClosePreview = () => {
    setShowPrintPreview(false);
  };

  // Format currency helper — multi-currency aware (no FX conversion).
  const formatCurrencyValue = (amount: number, currency: CurrencyCode) => {
    return currencyService.format(amount, currency);
  };

  const handleDownload = async () => {
    if (!statement) return;

    try {
      const accountStatementService = AccountStatementService.getInstance();
      const blob = await accountStatementService.exportToPDF(statement);

      // Create download link
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${viewMode === 'detailed' ? 'Detailed' : 'Summary'}_Statement_${customer?.name}_${getTodayLocalDate()}.txt`;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);
    } catch (error) {
      handleError(error);
    }
  };

  const formatCurrency = (amount: number, currency: CurrencyCode) => {
    return currencyService.format(amount, currency);
  };

  // Currencies actually present anywhere on the statement (header + rows + summary).
  const allCurrencies: CurrencyCode[] = (() => {
    if (!statement) return [];
    const set = new Set<string>();
    for (const map of [
      statement.financialSummary.openingBalance,
      statement.financialSummary.currentBalance,
      statement.financialSummary.totalSales,
      statement.financialSummary.totalPayments,
    ]) {
      Object.keys(map).forEach(k => set.add(k));
    }
    statement.transactions.forEach(t => set.add(t.currency));
    return Array.from(set) as CurrencyCode[];
  })();
  const headerCurrency: CurrencyCode = (statement?.transactions[0]?.currency as CurrencyCode) ?? (allCurrencies[0] ?? 'USD');

  if (isLoading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-16 w-16 border-b-2 border-blue-600 mx-auto"></div>
          <p className="mt-4 text-gray-600">Loading account statement...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
        <div className="max-w-md w-full bg-white rounded-lg shadow-lg p-6 text-center">
          <div className="w-16 h-16 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-4">
            <FileText className="w-8 h-8 text-red-600" />
          </div>
          <h2 className="text-xl font-semibold text-gray-900 mb-2">Unable to Load Statement</h2>
          <p className="text-gray-600 mb-4">{error}</p>
          <button
            onClick={() => window.close()}
            className="bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 transition-colors"
          >
            Close
          </button>
        </div>
      </div>
    );
  }

  return (
    <>
      {/* Print Preview Modal */}
      {showPrintPreview && statement && customer && (
        <PrintPreview
          isOpen={showPrintPreview}
          onClose={handleClosePreview}
          onPrint={handlePrint}
          totalPages={totalPages}
          title={`Account Statement - ${customer.name}`}
          content={
            <div ref={printContentRef}>
              <PrintLayout
                title="كشف حساب مفصل"
                accountName={customer.name}
                accountNumber={customer.id.slice(0, 10)}
                phone={customer.phone}
                previousBalance={statement.financialSummary.openingBalance}
                currency={headerCurrency}
                dateRange={statement.dateRange}
                reportDate={statement.statementDate}
                totalPages={totalPages}
              >
                {/* Opening Balance */}
                <div className="print-opening-balance print-section">
                  <span className="print-opening-balance-label">الرصيد ما قبل:</span>
                  <span className="print-opening-balance-value">
                    {formatCurrencyValue(
                      statement.financialSummary.openingBalance[headerCurrency] ?? 0,
                      headerCurrency
                    )}
                  </span>
                </div>

                {/* Transaction Table */}
                <div className="print-table-container print-section">
                  <table className="print-table">
                    <thead>
                      <tr>
                        <th className="print-table-col-date">التاريخ</th>
                        <th className="print-table-col-reference">المرجع</th>
                        <th className="print-table-col-description">البيان</th>
                        {viewMode === 'detailed' && (
                          <>
                            <th className="print-table-col-quantity">العدد</th>
                            <th className="print-table-col-weight">الوزن</th>
                            <th className="print-table-col-price">السعر</th>
                          </>
                        )}
                        <th className="print-table-col-debit">مدين</th>
                        <th className="print-table-col-credit">دائن</th>
                        <th className="print-table-col-balance">الرصيد</th>
                      </tr>
                    </thead>
                    <tbody>
                      {statement.transactions.map((transaction, index) => (
                        <tr key={transaction.id || index}>
                          <td className="print-table-col-date">
                            {new Date(transaction.date).toLocaleDateString('ar-LB', {
                              year: 'numeric',
                              month: '2-digit',
                              day: '2-digit',
                            })}
                          </td>
                          <td className="print-table-col-reference">{transaction.reference || '-'}</td>
                          <td className="print-table-col-description">{getTranslatedString(transaction.description, language as SupportedLanguage, 'en')}</td>
                          {viewMode === 'detailed' && (
                            <>
                              <td className="print-table-col-quantity print-number">
                                {transaction.quantity || '-'}
                              </td>
                              <td className="print-table-col-weight print-number">
                                {transaction.weight ? `${transaction.weight}` : '-'}
                              </td>
                              <td className="print-table-col-price print-number">
                                {transaction.price ? formatCurrencyValue(transaction.price, transaction.currency) : '-'}
                              </td>
                            </>
                          )}
                          <td className="print-table-col-debit print-number print-currency">
                            {(transaction.debit ?? 0) > 0.005 ? formatCurrencyValue(transaction.debit ?? 0, transaction.currency) : '0'}
                          </td>
                          <td className="print-table-col-credit print-number print-currency">
                            {(transaction.credit ?? 0) > 0.005 ? formatCurrencyValue(transaction.credit ?? 0, transaction.currency) : '0'}
                          </td>
                          <td className="print-table-col-balance print-number print-currency">
                            {formatCurrencyValue(convertMapToPreferred(transaction.balances_after), preferredCurrency)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                {/* Summary Footer — per-currency totals (no FX conversion) */}
                <div className="print-summary print-section">
                  {/* Per-currency activity totals (debit/credit in original currencies). */}
                  {allCurrencies.map((c) => {
                    const debitTotal = statement.transactions.filter(t => t.currency === c).reduce((s, t) => s + (t.debit ?? 0), 0);
                    const creditTotal = statement.transactions.filter(t => t.currency === c).reduce((s, t) => s + (t.credit ?? 0), 0);
                    return (
                      <div key={`tot-${c}`}>
                        <div className="print-summary-row">
                          <span>إجمالي مدين ({c}):</span>
                          <span className="print-number">{formatCurrencyValue(debitTotal, c)}</span>
                        </div>
                        <div className="print-summary-row">
                          <span>إجمالي دائن ({c}):</span>
                          <span className="print-number">{formatCurrencyValue(creditTotal, c)}</span>
                        </div>
                      </div>
                    );
                  })}
                  {/* Final balance: single number in preferred currency. */}
                  <div className="print-total-row">
                    <div className="print-final-balance">
                      <div className="print-final-balance-label">الرصيد</div>
                      <div className="print-final-balance-value">
                        {formatCurrencyValue(convertMapToPreferred(statement.financialSummary.currentBalance), preferredCurrency)}
                      </div>
                    </div>
                  </div>
                </div>
              </PrintLayout>
            </div>
          }
        />
      )}

      {/* Printable Statement View - Hidden in screen, visible in print */}
      {statement && customer && (() => {
        const paginatedPages = paginateTransactions(statement.transactions, viewMode);
        
        return (
          <div className="print-only" style={{ display: 'none' }}>
            {paginatedPages.map((page, idx) => {
              const isFirstPage = page.isFirstPage;
              const isLastPage = page.isLastPage;
              
              return (
                <div key={page.pageNumber} className={idx === 0 ? '' : 'print-page-break'}>
                  <PrintLayout
                    title="كشف حساب مفصل"
                    accountName={isFirstPage ? customer.name : undefined}
                    accountNumber={isFirstPage ? customer.id.slice(0, 10) : undefined}
                    phone={isFirstPage ? customer.phone : undefined}
                    previousBalance={isFirstPage ? statement.financialSummary.openingBalance : undefined}
                    currency={headerCurrency}
                    dateRange={isFirstPage ? statement.dateRange : undefined}
                    reportDate={isFirstPage ? statement.statementDate : undefined}
                    pageNumber={page.pageNumber}
                    totalPages={totalPages}
                    showHeader={isFirstPage}
                    showFooter={isLastPage}
                    showAccountInfo={isFirstPage}
                    showOpeningBalance={isFirstPage}
                  >
                    {isFirstPage && (
                      <div className="print-opening-balance print-section">
                        <span className="print-opening-balance-label">الرصيد ما قبل:</span>
                        <span className="print-opening-balance-value">
                          {formatCurrencyValue(
                            statement.financialSummary.openingBalance[headerCurrency] ?? 0,
                            headerCurrency
                          )}
                        </span>
                      </div>
                    )}

                    <div className="print-table-container print-section">
                      <table className="print-table">
                        <thead>
                          <tr>
                            <th className="print-table-col-date">التاريخ</th>
                            <th className="print-table-col-reference">المرجع</th>
                            <th className="print-table-col-description">البيان</th>
                            {viewMode === 'detailed' && (
                              <>
                                <th className="print-table-col-quantity">العدد</th>
                                <th className="print-table-col-weight">الوزن</th>
                                <th className="print-table-col-price">السعر</th>
                              </>
                            )}
                            <th className="print-table-col-debit">مدين</th>
                            <th className="print-table-col-credit">دائن</th>
                            <th className="print-table-col-balance">الرصيد</th>
                          </tr>
                        </thead>
                        <tbody>
                          {page.transactions.map((transaction, index) => (
                            <tr key={transaction.id || index}>
                              <td className="print-table-col-date">
                                {new Date(transaction.date).toLocaleDateString('ar-LB', {
                                  year: 'numeric',
                                  month: '2-digit',
                                  day: '2-digit',
                                })}
                              </td>
                              <td className="print-table-col-reference">{transaction.reference || '-'}</td>
                              <td className="print-table-col-description">{getTranslatedString(transaction.description, language as SupportedLanguage, 'en')}</td>
                              {viewMode === 'detailed' && (
                                <>
                                  <td className="print-table-col-quantity print-number">
                                    {transaction.quantity || '-'}
                                  </td>
                                  <td className="print-table-col-weight print-number">
                                    {transaction.weight ? `${transaction.weight}` : '-'}
                                  </td>
                                  <td className="print-table-col-price print-number">
                                    {transaction.price ? formatCurrencyValue(transaction.price, transaction.currency) : '-'}
                                  </td>
                                </>
                              )}
                              <td className="print-table-col-debit print-number print-currency">
                                {(transaction.debit ?? 0) > 0.005 ? formatCurrencyValue(transaction.debit ?? 0, transaction.currency) : '0'}
                              </td>
                              <td className="print-table-col-credit print-number print-currency">
                                {(transaction.credit ?? 0) > 0.005 ? formatCurrencyValue(transaction.credit ?? 0, transaction.currency) : '0'}
                              </td>
                              <td className="print-table-col-balance print-number print-currency">
                                {formatCurrencyValue(convertMapToPreferred(transaction.balances_after), preferredCurrency)}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>

                    {isLastPage && (
                      <div className="print-summary print-section">
                        {allCurrencies.map((c) => {
                          const debitTotal = statement.transactions.filter(tx => tx.currency === c).reduce((s, tx) => s + (tx.debit ?? 0), 0);
                          const creditTotal = statement.transactions.filter(tx => tx.currency === c).reduce((s, tx) => s + (tx.credit ?? 0), 0);
                          return (
                            <div key={`tot2-${c}`}>
                              <div className="print-summary-row">
                                <span>إجمالي مدين ({c}):</span>
                                <span className="print-number">{formatCurrencyValue(debitTotal, c)}</span>
                              </div>
                              <div className="print-summary-row">
                                <span>إجمالي دائن ({c}):</span>
                                <span className="print-number">{formatCurrencyValue(creditTotal, c)}</span>
                              </div>
                            </div>
                          );
                        })}
                        <div className="print-total-row">
                          <div className="print-final-balance">
                            <div className="print-final-balance-label">الرصيد</div>
                            <div className="print-final-balance-value">
                              {formatCurrencyValue(convertMapToPreferred(statement.financialSummary.currentBalance), preferredCurrency)}
                            </div>
                          </div>
                        </div>
                      </div>
                    )}
                  </PrintLayout>
                </div>
              );
            })}
          </div>
        );
      })()}

    <div className="min-h-screen bg-gray-50 no-print">
      {/* Header */}
      <div className="bg-white shadow-sm border-b">
        <div className="max-w-6xl mx-auto px-4 py-4">
          <div className="flex items-center justify-between flex-wrap gap-4">
            <div className="flex items-center space-x-4">
              <button
                onClick={() => window.close()}
                className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
                title="Close"
              >
                <ArrowLeft className="w-5 h-5 text-gray-600" />
              </button>
              <div>
                <h1 className="text-2xl font-bold text-gray-900 flex items-center">
                  <Users className="w-6 h-6 mr-2 text-blue-600" />
                  Account Statement - {customer?.name || 'Loading...'}
                </h1>
                <p className="text-sm text-gray-600">
                  Scanned from QR code • {new Date().toLocaleDateString()}
                </p>
              </div>
            </div>
            <div className="flex items-center space-x-3">
              {/* Date Range Picker */}
              <div className="flex items-center space-x-2">
                <Calendar className="w-4 h-4 text-gray-500" />
                <input
                  type="date"
                  value={dateRange.start}
                  onChange={(e) => {
                    const selectedDate = new Date(e.target.value);
                    const today = new Date();
                    today.setHours(23, 59, 59, 999);
                    if (selectedDate <= today) {
                      setDateRange(prev => ({ ...prev, start: e.target.value }));
                    }
                  }}
                  className="border border-gray-300 rounded px-2 py-1 text-sm"
                />
                <span className="text-gray-500">to</span>
                <input
                  type="date"
                  value={dateRange.end}
                  max={getTodayLocalDate()}
                  onChange={(e) => {
                    const selectedDate = new Date(e.target.value);
                    const today = new Date();
                    today.setHours(23, 59, 59, 999);
                    if (selectedDate <= today) {
                      setDateRange(prev => ({ ...prev, end: e.target.value }));
                    }
                  }}
                  className="border border-gray-300 rounded px-2 py-1 text-sm"
                />
              </div>
              <button
                onClick={handleDownload}
                className="flex items-center space-x-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
              >
                <Download className="w-4 h-4" />
                <span>Export</span>
              </button>
              <button
                onClick={handlePrintClick}
                className="flex items-center space-x-2 px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors"
              >
                <Printer className="w-4 h-4" />
                <span>Print</span>
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* View Mode Toggle */}
      <div className="bg-gray-50 border-b border-gray-200">
        <div className="max-w-6xl mx-auto px-4 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-1 bg-gray-100 p-1 rounded-lg">
              <button
                onClick={() => setViewMode('summary')}
                className={`flex items-center space-x-2 px-4 py-2 rounded-md transition-colors ${
                  viewMode === 'summary'
                    ? 'bg-white text-blue-600 shadow-sm'
                    : 'text-gray-600 hover:text-gray-900'
                }`}
              >
                <BarChart3 className="w-4 h-4" />
                <span className="font-medium">Financial Summary</span>
              </button>
              <button
                onClick={() => setViewMode('detailed')}
                className={`flex items-center space-x-2 px-4 py-2 rounded-md transition-colors ${
                  viewMode === 'detailed'
                    ? 'bg-white text-blue-600 shadow-sm'
                    : 'text-gray-600 hover:text-gray-900'
                }`}
              >
                <List className="w-4 h-4" />
                <span className="font-medium">Detailed View</span>
              </button>
            </div>
            <div className="flex items-center space-x-2 text-sm text-gray-500">
              <QrCode className="w-4 h-4" />
              <span>QR Code Access</span>
            </div>
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="max-w-6xl mx-auto px-4 py-6">
        {statement ? (
          <>
            {/* Financial Summary Section */}
            <div className="bg-white rounded-lg shadow-sm border p-6 mb-6">
              <h3 className="text-lg font-semibold text-gray-900 mb-4 flex items-center">
                <DollarSign className="w-6 h-6 mr-3 text-blue-600" />
                Financial Overview
              </h3>
              <div className="flex items-center space-x-2 text-sm text-gray-600 mb-6">
                <Info className="w-4 h-4" />
                <span>Period: {new Date(statement.dateRange.start).toLocaleDateString()} - {new Date(statement.dateRange.end).toLocaleDateString()}</span>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                <div className="bg-white p-6 rounded-xl border border-gray-200 shadow-sm">
                  <div className="flex items-center justify-between mb-2">
                    <div className="text-sm font-medium text-gray-500">Current Balance</div>
                    <DollarSign className="w-4 h-4 text-gray-400" />
                  </div>
                  {(() => {
                    const balancePref = convertMapToPreferred(statement.financialSummary.currentBalance);
                    return (
                      <div className={`text-2xl font-bold ${balancePref >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                        {formatCurrency(balancePref, preferredCurrency)}
                      </div>
                    );
                  })()}
                </div>

                <div className="bg-white p-6 rounded-xl border border-gray-200 shadow-sm">
                  <div className="flex items-center justify-between mb-2">
                    <div className="text-sm font-medium text-gray-500">Total Credit Sales</div>
                    <CreditCard className="w-4 h-4 text-red-400" />
                  </div>
                  <div className="space-y-1">
                    {allCurrencies.map((c) => (
                      <div key={`pcs-${c}`} className="text-xl font-bold text-red-600">
                        {formatCurrency(statement.financialSummary.totalSales[c] ?? 0, c)}
                      </div>
                    ))}
                  </div>
                </div>

                <div className="bg-white p-6 rounded-xl border border-gray-200 shadow-sm">
                  <div className="flex items-center justify-between mb-2">
                    <div className="text-sm font-medium text-gray-500">Total Payments</div>
                    <TrendingUp className="w-4 h-4 text-green-400" />
                  </div>
                  <div className="space-y-1">
                    {allCurrencies.map((c) => (
                      <div key={`ppay-${c}`} className="text-xl font-bold text-green-600">
                        {formatCurrency(statement.financialSummary.totalPayments[c] ?? 0, c)}
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>

            {/* Transaction History Section */}
            <div className="bg-white rounded-xl border border-gray-200 shadow-sm">
              <div className="p-6 border-b border-gray-200">
                <h3 className="text-xl font-bold text-gray-900 flex items-center">
                  <FileText className="w-6 h-6 mr-3 text-gray-600" />
                  {viewMode === 'detailed' ? 'Detailed Transaction History' : 'Transaction Summary'}
                </h3>
              </div>

              {statement.transactions.length === 0 ? (
                <div className="text-center py-16">
                  <FileText className="w-16 h-16 text-gray-300 mx-auto mb-4" />
                  <p className="text-xl font-medium text-gray-500 mb-2">No transactions found</p>
                  <p className="text-gray-400">Try adjusting the date range or check back later.</p>
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="min-w-full divide-y divide-gray-200">
                    <thead className="bg-gray-50">
                      <tr>
                        <th className="px-6 py-4 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                          Date
                        </th>
                        <th className="px-6 py-4 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                          Description
                        </th>
                        {viewMode === 'detailed' && (
                          <>
                            <th className="px-6 py-4 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                              Number
                            </th>
                            <th className="px-6 py-4 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                              Weight
                            </th>
                            <th className="px-6 py-4 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                              Price
                            </th>
                          </>
                        )}
                        <th className="px-6 py-4 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                          Credit
                        </th>
                        <th className="px-6 py-4 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                          Debit
                        </th>
                        <th className="px-6 py-4 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                          Balance After
                        </th>
                        <th className="px-6 py-4 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                          Reference
                        </th>
                      </tr>
                    </thead>
                    <tbody className="bg-white divide-y divide-gray-200">
                      {statement.transactions.map((transaction) => {
                        const rowCurrency = transaction.currency;
                        const rowDebit = transaction.debit ?? 0;
                        const rowCredit = transaction.credit ?? 0;
                        const balanceInPreferred = convertMapToPreferred(transaction.balances_after);
                        return (
                          <tr key={transaction.id} className="hover:bg-gray-50 transition-colors">
                            <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">
                              {new Date(transaction.date).toLocaleDateString()}
                            </td>
                            <td className="px-6 py-4">
                              <div className="text-sm font-medium text-gray-900">
                                {getTranslatedString(transaction.description, language as SupportedLanguage, 'en')}
                              </div>
                              {transaction.payment_method && (
                                <div className="text-xs text-gray-500 mt-1 flex items-center">
                                  <CreditCard className="w-3 h-3 mr-1" />
                                  {transaction.payment_method}
                                </div>
                              )}
                            </td>
                            {viewMode === 'detailed' && (
                              <>
                                <td className="px-6 py-4">
                                  <div className="text-sm font-medium text-gray-900">
                                    {transaction.quantity ? `${transaction.quantity}` : '-'}
                                  </div>
                                </td>
                                <td className="px-6 py-4">
                                  <div className="text-sm font-medium text-gray-900">
                                    {transaction.weight ? `${transaction.weight}kg` : '-'}
                                  </div>
                                </td>
                                <td className="px-6 py-4">
                                  <div className="text-sm font-medium text-gray-900">
                                    {transaction.price ? formatCurrency(transaction.price, rowCurrency) : '-'}
                                  </div>
                                </td>
                              </>
                            )}
                            <td className="px-6 py-4 whitespace-nowrap">
                              {rowCredit > 0.005 ? (
                                <span className="text-sm font-bold text-green-600">
                                  {formatCurrency(rowCredit, rowCurrency)}
                                </span>
                              ) : (
                                <span className="text-sm text-gray-400">-</span>
                              )}
                            </td>
                            <td className="px-6 py-4 whitespace-nowrap">
                              {rowDebit > 0.005 ? (
                                <span className="text-sm font-bold text-red-600">
                                  {formatCurrency(rowDebit, rowCurrency)}
                                </span>
                              ) : (
                                <span className="text-sm text-gray-400">-</span>
                              )}
                            </td>
                            <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">
                              {formatCurrency(balanceInPreferred, preferredCurrency)}
                            </td>
                            <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                              {transaction.reference || '-'}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </>
        ) : (
          <div className="text-center py-16">
            <FileText className="w-16 h-16 text-gray-300 mx-auto mb-4" />
            <p className="text-xl font-medium text-gray-500 mb-2">Failed to generate statement</p>
            <p className="text-gray-400">Please try again or contact support if the issue persists.</p>
          </div>
        )}
      </div>

      {/* Footer */}
      <div className="bg-white border-t mt-12">
        <div className="max-w-6xl mx-auto px-4 py-4">
          <div className="text-center text-sm text-gray-500">
            <p>This account statement was accessed via QR code from your receipt</p>
            <p className="mt-1">Generated on {new Date().toLocaleDateString()}</p>
          </div>
        </div>
      </div>
    </div>
    </>
  );
}
