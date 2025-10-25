import React, { useState, useEffect } from 'react';
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
import { db } from '../lib/db';

interface PublicCustomerStatementProps {
  // This component will be used in a public route, so it needs to fetch its own data
}

export default function PublicCustomerStatement() {
  const { customerId, billId } = useParams<{ customerId: string; billId: string }>();
  
  // Debug logging
  console.log('🔍 PublicCustomerStatement loaded:');
  console.log('   - Customer ID:', customerId);
  console.log('   - Bill ID:', billId);
  console.log('   - Current URL:', window.location.href);
  
  const [statement, setStatement] = useState<AccountStatement | null>(null);
  const [customer, setCustomer] = useState<Customer | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [viewMode, setViewMode] = useState<'summary' | 'detailed'>('summary');
  const [dateRange, setDateRange] = useState<{ start: string; end: string }>({
    start: new Date(new Date().getFullYear(), 0, 1).toISOString().split('T')[0],
    end: new Date().toISOString().split('T')[0]
  });

  useEffect(() => {
    if (customerId && billId) {
      loadCustomerStatement();
    }
  }, [customerId, billId, dateRange, viewMode]);

  const loadCustomerStatement = async () => {
    if (!customerId || !billId) return;

    setIsLoading(true);
    setError(null);

    try {
      // Fetch customer data from IndexedDB
      const customerData = await db.customers.get(customerId);
      
      if (!customerData) {
        setError('Customer not found. This account statement may not be available offline.');
        setIsLoading(false);
        return;
      }

      setCustomer(customerData);

      // Fetch all sales for this customer
      const sales = await db.sales.where('customer_id').equals(customerId).toArray();
      
      // Fetch all transactions for this customer
      const transactions = await db.transactions.where('customer_id').equals(customerId).toArray();

      // Fetch all products for product details
      const products = await db.products.toArray();

      // Fetch inventory items
      const inventory = await db.inventory_items.toArray();

      // Fetch bills for this customer
      const customerBills = await db.bills.where('customer_id').equals(customerId).toArray();

      // Generate statement using AccountStatementService
      const accountStatementService = AccountStatementService.getInstance();
      const generatedStatement = accountStatementService.generateCustomerStatement(
        customerData,
        sales,
        transactions,
        products,
        inventory,
        dateRange,
        viewMode,
        customerBills
      );

      setStatement(generatedStatement);
      
    } catch (err) {
      console.error('Error loading customer statement:', err);
      setError('Failed to load customer statement. Please try again later.');
    } finally {
      setIsLoading(false);
    }
  };

  const handlePrint = () => {
    window.print();
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
    <div className="min-h-screen bg-gray-50">
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
                onClick={handlePrint}
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
                            {formatCurrency(transaction.balanceAfter, transaction.currency)}
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
  );
}
