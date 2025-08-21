import React, { useState, useEffect } from 'react';
import { 
  X, 
  Download, 
  Printer, 
  Calendar, 
  FileText, 
  DollarSign, 
  TrendingUp, 
  TrendingDown,
  Package,
  CreditCard,
  Receipt,
  Users,
  Truck,
  BarChart3,
  List,
  Eye,
  EyeOff,
  Info,
  ShoppingBag,
  Weight,
  Hash
} from 'lucide-react';
import { AccountStatement, AccountStatementService } from '../services/accountStatementService';
import { Customer, Supplier, Transaction, SaleItem, InventoryItem, Product, StatementTransaction, StatementProductDetail } from '../types';
import Toast from './common/Toast';

interface AccountStatementModalProps {
  isOpen: boolean;
  onClose: () => void;
  entity: Customer | Supplier;
  entityType: 'customer' | 'supplier';
  sales: SaleItem[];
  transactions: Transaction[];
  products: Product[];
  inventory: InventoryItem[];
}

export default function AccountStatementModal({
  isOpen,
  onClose,
  entity,
  entityType,
  sales,
  transactions,
  products,
  inventory
}: AccountStatementModalProps) {
  const [statement, setStatement] = useState<AccountStatement | null>(null);
  const [viewMode, setViewMode] = useState<'summary' | 'detailed'>('summary');
  const [dateRange, setDateRange] = useState<{ start: string; end: string }>({
    start: new Date(new Date().getFullYear(), 0, 1).toISOString().split('T')[0], // Start of year
    end: new Date().toISOString().split('T')[0] // Today
  });
  const [isLoading, setIsLoading] = useState(false);
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error'; visible: boolean }>({
    message: '',
    type: 'success',
    visible: false,
  });

  const showToast = (message: string, type: 'success' | 'error' = 'success') => {
    setToast({ message, type, visible: true });
  };

  const hideToast = () => setToast(t => ({ ...t, visible: false }));

  useEffect(() => {
    if (isOpen && entity) {
      generateStatement();
    }
  }, [isOpen, entity, dateRange, viewMode]);

  const generateStatement = async () => {
    if (!entity) return;
    
    setIsLoading(true);
    try {
      const accountStatementService = AccountStatementService.getInstance();
      
      let newStatement: AccountStatement;
      if (entityType === 'customer') {
        newStatement = accountStatementService.generateCustomerStatement(
          entity as Customer,
          sales,
          transactions,
          products,
          inventory,
          dateRange,
          viewMode
        );
      } else {
        newStatement = accountStatementService.generateSupplierStatement(
          entity as Supplier,
          sales,
          transactions,
          products,
          inventory,
          dateRange,
          viewMode
        );
      }
      
      setStatement(newStatement);
    } catch (error) {
      console.error('Error generating statement:', error);
      showToast('Failed to generate account statement', 'error');
    } finally {
      setIsLoading(false);
    }
  };

  const handleExportPDF = async () => {
    if (!statement) return;
    
    try {
      const accountStatementService = AccountStatementService.getInstance();
      const blob = await accountStatementService.exportToPDF(statement);
      
      // Create download link
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${viewMode === 'detailed' ? 'Detailed' : 'Summary'}_Statement_${entity.name}_${new Date().toISOString().split('T')[0]}.txt`;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);
      
      showToast('Statement exported successfully!', 'success');
    } catch (error) {
      console.error('Error exporting PDF:', error);
      showToast('Failed to export PDF', 'error');
    }
  };

  const handlePrint = () => {
    window.print();
  };

  const getTransactionIcon = (type: string) => {
    switch (type) {
      case 'sale':
        return <Receipt className="w-4 h-4 text-blue-600" />;
      case 'credit_sale':
        return <CreditCard className="w-4 h-4 text-orange-600" />;
      case 'payment':
        return <DollarSign className="w-4 h-4 text-green-600" />;
      case 'commission':
        return <TrendingUp className="w-4 h-4 text-purple-600" />;
      case 'receiving':
        return <Package className="w-4 h-4 text-indigo-600" />;
      default:
        return <FileText className="w-4 h-4 text-gray-600" />;
    }
  };

  const getTransactionTypeLabel = (type: string) => {
    switch (type) {
      case 'sale':
        return 'Sale';
      case 'credit_sale':
        return 'Credit Sale';
      case 'payment':
        return 'Payment';
      case 'commission':
        return 'Commission';
      case 'receiving':
        return 'Receiving';
      default:
        return type;
    }
  };

  const formatCurrency = (amount: number, currency: 'USD' | 'LBP') => {
    if (currency === 'USD') {
      return `$${amount.toFixed(2)}`;
    } else {
      return `${amount.toLocaleString()} ل.ل`;
    }
  };

  if (!isOpen) return null;

  return (
    <>
      <Toast message={toast.message} type={toast.type} visible={toast.visible} onClose={hideToast} />
      
      <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
        <div className="bg-white rounded-lg max-w-7xl w-full max-h-[95vh] overflow-hidden">
          {/* Header */}
          <div className="p-6 border-b border-gray-200 flex items-center justify-between">
            <div className="flex items-center space-x-3">
              {entityType === 'customer' ? (
                <Users className="w-6 h-6 text-blue-600" />
              ) : (
                <Truck className="w-6 h-6 text-green-600" />
              )}
              <div>
                <h2 className="text-2xl font-bold text-gray-900">
                  Account Statement - {entity.name}
                </h2>
                <p className="text-sm text-gray-600 capitalize">
                  {entityType} • {new Date().toLocaleDateString()}
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
                  onChange={(e) => setDateRange(prev => ({ ...prev, start: e.target.value }))}
                  className="border border-gray-300 rounded px-2 py-1 text-sm"
                />
                <span className="text-gray-500">to</span>
                <input
                  type="date"
                  value={dateRange.end}
                  onChange={(e) => setDateRange(prev => ({ ...prev, end: e.target.value }))}
                  className="border border-gray-300 rounded px-2 py-1 text-sm"
                />
              </div>
              
              <button
                onClick={handleExportPDF}
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
              
              <button
                onClick={onClose}
                className="p-2 text-gray-400 hover:text-gray-600 transition-colors"
              >
                <X className="w-6 h-6" />
              </button>
            </div>
          </div>

          {/* View Mode Toggle */}
          <div className="px-6 py-4 bg-gray-50 border-b border-gray-200">
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
            </div>
          </div>

          {/* Content */}
          <div className="flex-1 overflow-y-auto p-6 space-y-8">
            {isLoading ? (
              <div className="flex items-center justify-center py-12">
                <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
              </div>
            ) : statement ? (
              <>
                {/* Financial Summary Section - Always Visible */}
                <div className="bg-gradient-to-r from-blue-50 to-indigo-50 rounded-xl p-6 border border-blue-200">
                  <div className="flex items-center justify-between mb-6">
                    <h3 className="text-xl font-bold text-gray-900 flex items-center">
                      <DollarSign className="w-6 h-6 mr-3 text-blue-600" />
                      Financial Overview
                    </h3>
                    <div className="flex items-center space-x-2 text-sm text-gray-600">
                      <Info className="w-4 h-4" />
                      <span>Period: {new Date(statement.dateRange.start).toLocaleDateString()} - {new Date(statement.dateRange.end).toLocaleDateString()}</span>
                    </div>
                  </div>
                  
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
                    <div className="bg-white p-6 rounded-xl border border-gray-200 shadow-sm">
                      <div className="flex items-center justify-between mb-2">
                        <div className="text-sm font-medium text-gray-500">Opening Balance</div>
                        <TrendingUp className="w-4 h-4 text-gray-400" />
                      </div>
                      <div className="text-2xl font-bold text-gray-900">
                        {formatCurrency(statement.financialSummary.openingBalance.USD, 'USD')}
                      </div>
                      <div className="text-sm text-gray-600 mt-1">
                        {formatCurrency(statement.financialSummary.openingBalance.LBP, 'LBP')}
                      </div>
                    </div>
                    
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
                    
                    {entityType === 'customer' ? (
                      <>
                        <div className="bg-white p-6 rounded-xl border border-gray-200 shadow-sm">
                          <div className="flex items-center justify-between mb-2">
                            <div className="text-sm font-medium text-gray-500">Total Credit Sales</div>
                            <CreditCard className="w-4 h-4 text-red-400" />
                          </div>
                          <div className="text-2xl font-bold text-red-600">
                            {formatCurrency(statement.financialSummary.totalSales.USD, 'USD')}
                          </div>
                        </div>
                        
                        <div className="bg-white p-6 rounded-xl border border-gray-200 shadow-sm">
                          <div className="flex items-center justify-between mb-2">
                            <div className="text-sm font-medium text-gray-500">Total Payments</div>
                            <TrendingDown className="w-4 h-4 text-green-400" />
                          </div>
                          <div className="text-2xl font-bold text-green-600">
                            {formatCurrency(statement.financialSummary.totalPayments.USD, 'USD')}
                          </div>
                        </div>
                      </>
                    ) : (
                      <>
                        <div className="bg-white p-6 rounded-xl border border-gray-200 shadow-sm">
                          <div className="flex items-center justify-between mb-2">
                            <div className="text-sm font-medium text-gray-500">Total Commissions</div>
                            <TrendingUp className="w-4 h-4 text-purple-400" />
                          </div>
                          <div className="text-2xl font-bold text-purple-600">
                            {formatCurrency(statement.financialSummary.totalReceivings.USD, 'USD')}
                          </div>
                        </div>
                        
                        <div className="bg-white p-6 rounded-xl border border-gray-200 shadow-sm">
                          <div className="flex items-center justify-between mb-2">
                            <div className="text-sm font-medium text-gray-500">Total Payments</div>
                            <TrendingDown className="w-4 h-4 text-red-400" />
                          </div>
                          <div className="text-2xl font-bold text-red-600">
                            {formatCurrency(statement.financialSummary.totalPayments.USD, 'USD')}
                          </div>
                        </div>
                      </>
                    )}
                  </div>
                  
                  <div className="mt-8 pt-6 border-t border-blue-200">
                    <div className="flex items-center justify-between">
                      <span className="text-xl font-semibold text-gray-900">Net Change</span>
                      <span className={`text-3xl font-bold ${
                        statement.financialSummary.netChange.USD >= 0 ? 'text-green-600' : 'text-red-600'
                      }`}>
                        {formatCurrency(statement.financialSummary.netChange.USD, 'USD')}
                      </span>
                    </div>
                  </div>
                </div>

                {/* Product Summary Section - Only for Detailed View */}
                {viewMode === 'detailed' && statement.productSummary && (
                  <div className="bg-gradient-to-r from-green-50 to-emerald-50 rounded-xl p-6 border border-green-200">
                    <h3 className="text-xl font-bold text-gray-900 mb-6 flex items-center">
                      <ShoppingBag className="w-6 h-6 mr-3 text-green-600" />
                      Product Analysis
                    </h3>
                    
                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
                      {/* Top Products */}
                      <div className="bg-white rounded-lg p-6 border border-gray-200">
                        <h4 className="text-lg font-semibold text-gray-900 mb-4 flex items-center">
                          <BarChart3 className="w-5 h-5 mr-2 text-blue-600" />
                          Top Products by Value
                        </h4>
                        <div className="space-y-3">
                          {statement.productSummary.topProducts.slice(0, 5).map((product, index) => (
                            <div key={product.productName} className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                              <div className="flex items-center space-x-3">
                                <span className="w-6 h-6 bg-blue-100 text-blue-600 rounded-full flex items-center justify-center text-xs font-bold">
                                  {index + 1}
                                </span>
                                <div>
                                  <div className="font-medium text-gray-900">{product.productName}</div>
                                  <div className="text-sm text-gray-500">{product.totalQuantity} units</div>
                                </div>
                              </div>
                              <div className="text-right">
                                <div className="font-semibold text-gray-900">{formatCurrency(product.totalValue, 'USD')}</div>
                                <div className="text-sm text-gray-500">avg: {formatCurrency(product.averagePrice, 'USD')}</div>
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                      
                      {/* Category Breakdown */}
                      <div className="bg-white rounded-lg p-6 border border-gray-200">
                        <h4 className="text-lg font-semibold text-gray-900 mb-4 flex items-center">
                          <Package className="w-5 h-5 mr-2 text-purple-600" />
                          Category Breakdown
                        </h4>
                        <div className="space-y-3">
                          {Object.entries(statement.productSummary.categoryBreakdown).map(([category, data]) => (
                            <div key={category} className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                              <div className="font-medium text-gray-900">{category}</div>
                              <div className="text-right">
                                <div className="font-semibold text-gray-900">{formatCurrency(data.value, 'USD')}</div>
                                <div className="text-sm text-gray-500">{data.quantity} units</div>
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    </div>
                  </div>
                )}

                {/* Transaction History Section */}
                <div className="bg-white rounded-xl border border-gray-200 shadow-sm">
                  <div className="p-6 border-b border-gray-200">
                    <h3 className="text-xl font-bold text-gray-900 flex items-center">
                      <FileText className="w-6 h-6 mr-3 text-gray-600" />
                      {viewMode === 'detailed' ? 'Detailed Transaction History' : 'Transaction Summary'}
                    </h3>
                    <p className="text-sm text-gray-600 mt-1">
                      {statement.transactions.length} transactions found
                    </p>
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
                              Type
                            </th>
                            <th className="px-6 py-4 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                              Description
                            </th>
                            {viewMode === 'detailed' && (
                              <th className="px-6 py-4 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                                Product Details
                              </th>
                            )}
                            <th className="px-6 py-4 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                              Amount
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
                              <td className="px-6 py-4 whitespace-nowrap">
                                <div className="flex items-center space-x-2">
                                  {getTransactionIcon(transaction.type)}
                                  <span className="text-sm font-medium text-gray-900">
                                    {getTransactionTypeLabel(transaction.type)}
                                  </span>
                                </div>
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
                                <td className="px-6 py-4">
                                  {transaction.productDetails && transaction.productDetails.length > 0 ? (
                                    <div className="space-y-2">
                                      {transaction.productDetails.map((detail, index) => (
                                        <div key={index} className="bg-gray-50 rounded-lg p-3 border border-gray-200">
                                          <div className="font-medium text-gray-900 mb-2 flex items-center">
                                            <Package className="w-4 h-4 mr-2 text-blue-600" />
                                            {detail.productName}
                                          </div>
                                          <div className="grid grid-cols-2 gap-2 text-xs text-gray-600">
                                            <div className="flex items-center">
                                              <Hash className="w-3 h-3 mr-1" />
                                              Qty: {detail.quantity} {detail.unit}
                                            </div>
                                            <div className="flex items-center">
                                              <DollarSign className="w-3 h-3 mr-1" />
                                              Unit: {formatCurrency(detail.unitPrice, 'USD')}
                                            </div>
                                            {detail.weight && (
                                              <div className="flex items-center">
                                                <Weight className="w-3 h-3 mr-1" />
                                                Weight: {detail.weight}kg
                                              </div>
                                            )}
                                            <div className="flex items-center font-medium">
                                              <Receipt className="w-3 h-3 mr-1" />
                                              Total: {formatCurrency(detail.totalPrice, 'USD')}
                                            </div>
                                            {detail.commissionRate && (
                                              <>
                                                <div className="flex items-center text-purple-600">
                                                  <TrendingUp className="w-3 h-3 mr-1" />
                                                  Rate: {detail.commissionRate}%
                                                </div>
                                                <div className="flex items-center text-purple-600 font-medium">
                                                  <DollarSign className="w-3 h-3 mr-1" />
                                                  Commission: {formatCurrency(detail.commissionAmount || 0, 'USD')}
                                                </div>
                                              </>
                                            )}
                                          </div>
                                          {detail.notes && (
                                            <div className="mt-2 text-xs text-gray-500 italic">
                                              {detail.notes}
                                            </div>
                                          )}
                                        </div>
                                      ))}
                                    </div>
                                  ) : (
                                    <span className="text-sm text-gray-400">No product details</span>
                                  )}
                                </td>
                              )}
                              <td className="px-6 py-4 whitespace-nowrap">
                                <span className={`text-sm font-bold ${
                                  transaction.type === 'payment' ? 'text-green-600' : 'text-red-600'
                                }`}>
                                  {formatCurrency(transaction.amount, transaction.currency)}
                                </span>
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
        </div>
      </div>
    </>
  );
}
