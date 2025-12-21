import React from 'react';
import { useParams } from 'react-router-dom';
import { 
  ArrowLeft, 
  Download, 
  Printer, 
  Calendar, 
  FileText, 
  DollarSign, 
  TrendingUp, 
  TrendingDown,
  CreditCard,
  Users,
  BarChart3,
  List,
  Info,
  Smartphone,
  QrCode
} from 'lucide-react';
import { AccountStatement, AccountStatementService } from '../services/accountStatementService';
import { Customer, Product } from '../types';
import { supabase } from '../lib/supabase';
import { PrintLayout } from '../components/common/PrintLayout';
import { PrintPreview } from '../components/common/PrintPreview';
import { useState as useStateReact, useRef, useEffect } from 'react';
import { setupPrintWithPageSelection } from '../utils/printUtils';
import { paginateTransactions, getTotalPages } from '../utils/printPagination';

interface PublicCustomerStatementProps {
  // This component will be used in a public route, so it needs to fetch its own data
}

export default function PublicCustomerStatement() {
  const { token: encodedToken } = useParams<{ token: string }>();
  
  // URL-decode the token (it was encoded to handle special characters)
  const token = encodedToken ? decodeURIComponent(encodedToken) : undefined;

  const [statement, setStatement] = useStateReact<AccountStatement | null>(null);
  const [customer, setCustomer] = useStateReact<Customer | null>(null);
  const [customerId, setCustomerId] = useStateReact<string | null>(null);
  const [isLoading, setIsLoading] = useStateReact(true);
  const [error, setError] = useStateReact<string | null>(null);
  const [viewMode, setViewMode] = useStateReact<'summary' | 'detailed'>('summary');
  const [showPrintPreview, setShowPrintPreview] = useStateReact(false);
  const [totalPages, setTotalPages] = useStateReact(1);
  const printContentRef = useRef<HTMLDivElement>(null);
  const [dateRange, setDateRange] = useStateReact<{ start: string; end: string }>({
    start: new Date(new Date().getFullYear(), 0, 1).toISOString().split('T')[0],
    end: new Date().toISOString().split('T')[0]
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
      // Step 1: Validate token and get customer data using secure database function
      console.log('📥 Fetching customer data...');
      const { data: customerData, error: customerError } = await supabase
        .rpc('get_customer_by_token', { p_token: token });
      
      if (customerError || !customerData || customerData.length === 0) {
        console.error('❌ Token validation failed:', customerError);
        setError('Invalid access link. Please check the QR code and try again.');
        setIsLoading(false);
        return;
      }

      const customerRecord = customerData[0];
      console.log('✅ Token validated successfully for customer:', customerRecord.id);
      setCustomerId(customerRecord.id);

      // Step 2: Log the access (update access count and timestamp)
      const updateData = { 
        accessed_at: new Date().toISOString(),
        access_count: 1 // We'll increment this in the database function
      };
      await (supabase as any)
        .from('public_access_tokens')
        .update(updateData)
        .eq('token', token);

      // Transform customer data to match Customer type
      const customer: Customer = {
        id: customerRecord.id,
        name: customerRecord.name,
        email: customerRecord.email || undefined,
        phone: customerRecord.phone || undefined,
        address: customerRecord.address || undefined,
        isActive: customerRecord.is_active ?? true,
        createdAt: customerRecord.created_at,
        lb_balance: customerRecord.lb_balance || 0,
        usd_balance: customerRecord.usd_balance || 0
      };

      setCustomer(customer);

      // Fetch all bill line items for this customer using secure function
      console.log('📥 Fetching bill line items...');
      const { data: salesData, error: salesError } = await supabase
        .rpc('get_customer_bill_line_items', { p_token: token });
      
      if (salesError) {
        console.warn('⚠️ Bill line items function failed, using empty array:', salesError);
      }
      
      // Fetch all transactions for this customer using secure function
      console.log('📥 Fetching transactions...');
      const { data: transactionsData, error: transactionsError } = await supabase
        .rpc('get_customer_transactions', { p_token: token });

      if (transactionsError) {
        console.warn('⚠️ Transactions function failed, using empty array:', transactionsError);
      }

      // Fetch all products for product details (no token needed - public data)
      console.log('📥 Fetching products...');
      const { data: productsData } = await supabase
        .from('products')
        .select('*') as { data: any; error: any };

      // Fetch inventory items (no token needed - public data)
      console.log('📥 Fetching inventory items...');
      const { data: inventoryData } = await supabase
        .from('inventory_items')
        .select('*') as { data: any; error: any };

      // Fetch bills for this customer using secure function
      console.log('📥 Fetching bills...');
      const { data: billsData, error: billsError } = await supabase
        .rpc('get_customer_bills', { p_token: token });

      if (billsError) {
        console.warn('⚠️ Bills function failed, using empty array:', billsError);
      }

      // Generate statement using AccountStatementService (now uses journal entries)
      console.log('📊 Generating statement...');
      const accountStatementService = AccountStatementService.getInstance();
      
      // Get storeId from customer or use a default (you may need to adjust this)
      const storeId = customer.store_id || '';
      
      const generatedStatement = await accountStatementService.generateCustomerStatement(
        customer.id,
        storeId,
        dateRange,
        viewMode
      );

      setStatement(generatedStatement);
      console.log('✅ Statement loaded successfully');
      
    } catch (err) {
      console.error('❌ Error loading customer statement:', err);
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

  // Format currency helper for print
  const formatCurrencyValue = (amount: number, currency: 'USD' | 'LBP') => {
    if (currency === 'USD') {
      return `$${amount.toFixed(2)}`;
    } else {
      return `${Math.round(amount).toLocaleString()}`;
    }
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
      a.download = `${viewMode === 'detailed' ? 'Detailed' : 'Summary'}_Statement_${customer?.name}_${new Date().toISOString().split('T')[0]}.txt`;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);
    } catch (error) {
      console.error('Error exporting statement:', error);
    }
  };

  const formatCurrency = (amount: number, currency: 'USD' | 'LBP') => {
    if (currency === 'USD') {
      return `$${amount.toFixed(2)}`;
    } else {
      return `${amount.toLocaleString()} ل.ل`;
    }
  };

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
                currency={statement.transactions[0]?.currency || 'LBP'}
                dateRange={statement.dateRange}
                reportDate={statement.statementDate}
                totalPages={totalPages}
              >
                {/* Opening Balance */}
                <div className="print-opening-balance print-section">
                  <span className="print-opening-balance-label">الرصيد ما قبل:</span>
                  <span className="print-opening-balance-value">
                    {formatCurrencyValue(
                      statement.financialSummary.openingBalance[statement.transactions[0]?.currency || 'LBP'],
                      statement.transactions[0]?.currency || 'LBP'
                    )}
                    {statement.transactions[0]?.currency === 'LBP' ? ' ل.ل' : ''}
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
                          <td className="print-table-col-description">{transaction.description}</td>
                          {viewMode === 'detailed' && (
                            <>
                              <td className="print-table-col-quantity print-number">
                                {transaction.quantity || '-'}
                              </td>
                              <td className="print-table-col-weight print-number">
                                {transaction.weight ? `${transaction.weight}` : '-'}
                              </td>
                              <td className="print-table-col-price print-number">
                                {transaction.price ? formatCurrencyValue(transaction.price, transaction.currency || 'LBP') : '-'}
                              </td>
                            </>
                          )}
                          <td className="print-table-col-debit print-number print-currency">
                            {transaction.type !== 'payment' ? formatCurrencyValue(transaction.amount || 0, transaction.currency) : '0'}
                          </td>
                          <td className="print-table-col-credit print-number print-currency">
                            {transaction.type === 'payment' ? formatCurrencyValue(transaction.amount || 0, transaction.currency) : '0'}
                          </td>
                          <td className="print-table-col-balance print-number print-currency">
                            {formatCurrencyValue(transaction.balance_after, transaction.currency)}
                            {transaction.currency === 'LBP' ? ' ل.ل' : ''}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                {/* Summary Footer */}
                <div className="print-summary print-section">
                  <div className="print-summary-row">
                    <span>إجمالي مدين:</span>
                    <span className="print-number">
                      {formatCurrencyValue(
                        statement.transactions
                          .filter(t => t.type !== 'payment')
                          .reduce((sum, t) => sum + (t.amount || 0), 0),
                        statement.transactions[0]?.currency || 'LBP'
                      )}
                      {statement.transactions[0]?.currency === 'LBP' ? ' ل.ل' : ''}
                    </span>
                  </div>
                  <div className="print-summary-row">
                    <span>إجمالي دائن:</span>
                    <span className="print-number">
                      {formatCurrencyValue(
                        statement.transactions
                          .filter(t => t.type === 'payment')
                          .reduce((sum, t) => sum + (t.amount || 0), 0),
                        statement.transactions[0]?.currency || 'LBP'
                      )}
                      {statement.transactions[0]?.currency === 'LBP' ? ' ل.ل' : ''}
                    </span>
                  </div>
                  <div className="print-total-row">
                    <div className="print-final-balance">
                      <div className="print-final-balance-label">الرصيد</div>
                      <div className="print-final-balance-value">
                        {formatCurrencyValue(
                          statement.financialSummary.currentBalance[statement.transactions[0]?.currency || 'LBP'],
                          statement.transactions[0]?.currency || 'LBP'
                        )}
                        {statement.transactions[0]?.currency === 'LBP' ? ' ل.ل' : ''}
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
                    currency={statement.transactions[0]?.currency || 'LBP'}
                    dateRange={isFirstPage ? statement.dateRange : undefined}
                    reportDate={isFirstPage ? statement.statementDate : undefined}
                    pageNumber={page.pageNumber}
                    totalPages={totalPages}
                    showHeader={isFirstPage}
                    showFooter={isLastPage}
                    showAccountInfo={isFirstPage}
                    showOpeningBalance={isFirstPage}
                  >
                    {/* Opening Balance - Only on first page */}
                    {isFirstPage && (
                      <div className="print-opening-balance print-section">
                        <span className="print-opening-balance-label">الرصيد ما قبل:</span>
                        <span className="print-opening-balance-value">
                          {formatCurrencyValue(
                            statement.financialSummary.openingBalance[statement.transactions[0]?.currency || 'LBP'],
                            statement.transactions[0]?.currency || 'LBP'
                          )}
                          {statement.transactions[0]?.currency === 'LBP' ? ' ل.ل' : ''}
                        </span>
                      </div>
                    )}

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
                              <td className="print-table-col-description">{transaction.description}</td>
                              {viewMode === 'detailed' && (
                                <>
                                  <td className="print-table-col-quantity print-number">
                                    {transaction.quantity || '-'}
                                  </td>
                                  <td className="print-table-col-weight print-number">
                                    {transaction.weight ? `${transaction.weight}` : '-'}
                                  </td>
                                  <td className="print-table-col-price print-number">
                                    {transaction.price ? formatCurrencyValue(transaction.price, transaction.currency || 'LBP') : '-'}
                                  </td>
                                </>
                              )}
                              <td className="print-table-col-debit print-number print-currency">
                                {transaction.type !== 'payment' ? formatCurrencyValue(transaction.amount || 0, transaction.currency) : '0'}
                              </td>
                              <td className="print-table-col-credit print-number print-currency">
                                {transaction.type === 'payment' ? formatCurrencyValue(transaction.amount || 0, transaction.currency) : '0'}
                              </td>
                              <td className="print-table-col-balance print-number print-currency">
                                {formatCurrencyValue(transaction.balance_after, transaction.currency)}
                                {transaction.currency === 'LBP' ? ' ل.ل' : ''}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>

                    {/* Summary Footer - Only on last page */}
                    {isLastPage && (
                      <div className="print-summary print-section">
                        <div className="print-summary-row">
                          <span>إجمالي مدين:</span>
                          <span className="print-number">
                            {formatCurrencyValue(
                              statement.transactions
                                .filter(t => t.type !== 'payment')
                                .reduce((sum, t) => sum + (t.amount || 0), 0),
                              statement.transactions[0]?.currency || 'LBP'
                            )}
                            {statement.transactions[0]?.currency === 'LBP' ? ' ل.ل' : ''}
                          </span>
                        </div>
                        <div className="print-summary-row">
                          <span>إجمالي دائن:</span>
                          <span className="print-number">
                            {formatCurrencyValue(
                              statement.transactions
                                .filter(t => t.type === 'payment')
                                .reduce((sum, t) => sum + (t.amount || 0), 0),
                              statement.transactions[0]?.currency || 'LBP'
                            )}
                            {statement.transactions[0]?.currency === 'LBP' ? ' ل.ل' : ''}
                          </span>
                        </div>
                        <div className="print-total-row">
                          <div className="print-final-balance">
                            <div className="print-final-balance-label">الرصيد</div>
                            <div className="print-final-balance-value">
                              {formatCurrencyValue(
                                statement.financialSummary.currentBalance[statement.transactions[0]?.currency || 'LBP'],
                                statement.transactions[0]?.currency || 'LBP'
                              )}
                              {statement.transactions[0]?.currency === 'LBP' ? ' ل.ل' : ''}
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
                  max={new Date().toISOString().split('T')[0]}
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
                  <div className={`text-2xl font-bold ${
                    statement.financialSummary.currentBalance.USD >= 0 ? 'text-green-600' : 'text-red-600'
                  }`}>
                    {formatCurrency(statement.financialSummary.currentBalance.USD, 'USD')}
                  </div>
                  <div className="text-sm text-gray-600 mt-1">
                    {formatCurrency(statement.financialSummary.currentBalance.LBP, 'LBP')}
                  </div>
                </div>

                <div className="bg-white p-6 rounded-xl border border-gray-200 shadow-sm">
                  <div className="flex items-center justify-between mb-2">
                    <div className="text-sm font-medium text-gray-500">Total Credit Sales</div>
                    <CreditCard className="w-4 h-4 text-red-400" />
                  </div>
                  <div className="text-2xl font-bold text-red-600">
                    {formatCurrency(statement.financialSummary.totalSales.LBP, 'LBP')}
                  </div>
                </div>

                <div className="bg-white p-6 rounded-xl border border-gray-200 shadow-sm">
                  <div className="flex items-center justify-between mb-2">
                    <div className="text-sm font-medium text-gray-500">Total Payments</div>
                    <TrendingUp className="w-4 h-4 text-green-400" />
                  </div>
                  <div className="text-2xl font-bold text-green-600">
                    {formatCurrency(statement.financialSummary.totalPayments.LBP, 'LBP')}
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
                      {statement.transactions.map((transaction) => (
                        <tr key={transaction.id} className="hover:bg-gray-50 transition-colors">
                          <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">
                            {new Date(transaction.date).toLocaleDateString()}
                          </td>
                          <td className="px-6 py-4">
                            <div className="text-sm font-medium text-gray-900">
                              {transaction.description}
                            </div>
                            {transaction.paymentMethod && (
                              <div className="text-xs text-gray-500 mt-1 flex items-center">
                                <CreditCard className="w-3 h-3 mr-1" />
                                {transaction.paymentMethod}
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
                                  {transaction.price ? `LBP${transaction.price}` : '-'}
                                </div>
                              </td>
                            </>
                          )}
                          <td className="px-6 py-4 whitespace-nowrap">
                            {transaction.type === 'payment' ? (
                              <span className="text-sm font-bold text-green-600">
                                {formatCurrency(transaction.amount || 0, transaction.currency)}
                              </span>
                            ) : (
                              <span className="text-sm text-gray-400">-</span>
                            )}
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap">
                            {transaction.type !== 'payment' ? (
                              <span className="text-sm font-bold text-red-600">
                                {formatCurrency(transaction.amount || 0, transaction.currency)}
                              </span>
                            ) : (
                              <span className="text-sm text-gray-400">-</span>
                            )}
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">
                            {formatCurrency(transaction.balance_after, transaction.currency)}
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                            {transaction.reference || '-'}
                          </td>
                        </tr>
                      ))}
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
