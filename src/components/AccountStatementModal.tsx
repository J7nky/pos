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
  Truck
} from 'lucide-react';
import { AccountStatement, StatementTransaction, AccountStatementService } from '../services/accountStatementService';
import { Customer, Supplier, Transaction, SaleItem, InventoryItem, Product } from '../types';
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
  }, [isOpen, entity, dateRange]);

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
          dateRange
        );
      } else {
        newStatement = accountStatementService.generateSupplierStatement(
          entity as Supplier,
          sales,
          transactions,
          products,
          inventory,
          dateRange
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
      a.download = `AccountStatement_${entity.name}_${new Date().toISOString().split('T')[0]}.pdf`;
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
                <span>Export PDF</span>
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

          {/* Content */}
          <div className="flex-1 overflow-y-auto p-6">
            {isLoading ? (
              <div className="flex items-center justify-center py-12">
                <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
              </div>
            ) : statement ? (
              <div className="space-y-8">
                {/* Financial Summary Section */}
                <div className="bg-gray-50 rounded-lg p-6">
                  <h3 className="text-lg font-semibold text-gray-900 mb-4 flex items-center">
                    <DollarSign className="w-5 h-5 mr-2" />
                    Financial Summary
                  </h3>
                  
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
                    <div className="bg-white p-4 rounded-lg border">
                      <div className="text-sm font-medium text-gray-500">Opening Balance</div>
                      <div className="text-lg font-semibold text-gray-900">
                        {formatCurrency(statement.financialSummary.openingBalance.USD, 'USD')}
                      </div>
                      <div className="text-sm text-gray-600">
                        {formatCurrency(statement.financialSummary.openingBalance.LBP, 'LBP')}
                      </div>
                    </div>
                    
                    <div className="bg-white p-4 rounded-lg border">
                      <div className="text-sm font-medium text-gray-500">Current Balance</div>
                      <div className="text-lg font-semibold text-gray-900">
                        {formatCurrency(statement.financialSummary.currentBalance.USD, 'USD')}
                      </div>
                      <div className="text-sm text-gray-600">
                        {formatCurrency(statement.financialSummary.currentBalance.LBP, 'LBP')}
                      </div>
                    </div>
                    
                    {entityType === 'customer' ? (
                      <>
                        <div className="bg-white p-4 rounded-lg border">
                          <div className="text-sm font-medium text-gray-500">Total Credit Sales</div>
                          <div className="text-lg font-semibold text-red-600">
                            {formatCurrency(statement.financialSummary.totalSales.USD, 'USD')}
                          </div>
                        </div>
                        
                        <div className="bg-white p-4 rounded-lg border">
                          <div className="text-sm font-medium text-gray-500">Total Payments</div>
                          <div className="text-lg font-semibold text-green-600">
                            {formatCurrency(statement.financialSummary.totalPayments.USD, 'USD')}
                          </div>
                        </div>
                      </>
                    ) : (
                      <>
                        <div className="bg-white p-4 rounded-lg border">
                          <div className="text-sm font-medium text-gray-500">Total Commissions</div>
                          <div className="text-lg font-semibold text-purple-600">
                            {formatCurrency(statement.financialSummary.totalReceivings.USD, 'USD')}
                          </div>
                        </div>
                        
                        <div className="bg-white p-4 rounded-lg border">
                          <div className="text-sm font-medium text-gray-500">Total Payments</div>
                          <div className="text-lg font-semibold text-red-600">
                            {formatCurrency(statement.financialSummary.totalPayments.USD, 'USD')}
                          </div>
                        </div>
                      </>
                    )}
                  </div>
                  
                  <div className="mt-6 pt-6 border-t border-gray-200">
                    <div className="flex items-center justify-between">
                      <span className="text-lg font-medium text-gray-900">Net Change</span>
                      <span className={`text-xl font-bold ${
                        statement.financialSummary.netChange.USD >= 0 ? 'text-green-600' : 'text-red-600'
                      }`}>
                        {formatCurrency(statement.financialSummary.netChange.USD, 'USD')}
                      </span>
                    </div>
                  </div>
                </div>

                {/* Transaction History Section */}
                <div>
                  <h3 className="text-lg font-semibold text-gray-900 mb-4 flex items-center">
                    <FileText className="w-5 h-5 mr-2" />
                    Detailed Transaction History
                  </h3>
                  
                  {statement.transactions.length === 0 ? (
                    <div className="text-center py-12 bg-gray-50 rounded-lg">
                      <FileText className="w-12 h-12 text-gray-400 mx-auto mb-4" />
                      <p className="text-gray-500">No transactions found for the selected period.</p>
                    </div>
                  ) : (
                    <div className="bg-white border border-gray-200 rounded-lg overflow-hidden">
                      <div className="overflow-x-auto">
                        <table className="min-w-full divide-y divide-gray-200">
                          <thead className="bg-gray-50">
                            <tr>
                              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                                Date
                              </th>
                              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                                Type
                              </th>
                              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                                Description
                              </th>
                              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                                Amount
                              </th>
                              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                                Balance After
                              </th>
                              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                                Reference
                              </th>
                            </tr>
                          </thead>
                          <tbody className="bg-white divide-y divide-gray-200">
                            {statement.transactions.map((transaction) => (
                              <tr key={transaction.id} className="hover:bg-gray-50">
                                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
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
                                  <div className="text-sm text-gray-900">
                                    {transaction.description}
                                  </div>
                                  {transaction.productInfo && (
                                    <div className="text-xs text-gray-500 mt-1">
                                      {transaction.productInfo.quantity} × {transaction.productInfo.unitPrice} = {transaction.productInfo.totalPrice}
                                      {transaction.productInfo.weight && ` (${transaction.productInfo.weight}kg)`}
                                    </div>
                                  )}
                                  {transaction.paymentMethod && (
                                    <div className="text-xs text-gray-500">
                                      {transaction.paymentMethod}
                                    </div>
                                  )}
                                </td>
                                <td className="px-6 py-4 whitespace-nowrap">
                                  <span className={`text-sm font-medium ${
                                    transaction.type === 'payment' ? 'text-green-600' : 'text-red-600'
                                  }`}>
                                    {formatCurrency(transaction.amount, transaction.currency)}
                                  </span>
                                </td>
                                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
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
                    </div>
                  )}
                </div>
              </div>
            ) : (
              <div className="text-center py-12">
                <p className="text-gray-500">Failed to generate statement.</p>
              </div>
            )}
          </div>
        </div>
      </div>
    </>
  );
}
