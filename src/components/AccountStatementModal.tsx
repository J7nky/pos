import { useState, useEffect } from 'react';
import { 
  X, 
  Download, 
  Printer, 
  Calendar, 
  FileText, 
  DollarSign, 
  TrendingUp, 
  TrendingDown,
  CreditCard,
  Users,
  Truck,
  BarChart3,
  List,
  Info
} from 'lucide-react';
import { AccountStatement, AccountStatementService } from '../services/accountStatementService';
import { Customer, Supplier, Transaction, InventoryItem, Product, SaleItem } from '../types';
import { LocalSaleItem } from '../lib/db';
import Toast from './common/Toast';

interface AccountStatementModalProps {
  isOpen: boolean;
  onClose: () => void;
  entity: Customer | Supplier;
  entityType: 'customer' | 'supplier';
  sales: LocalSaleItem[];
  transactions: Transaction[];
  products: Product[];
  inventory: InventoryItem[];
  inventoryBills: any[];
  bills?: any[];
}

export default function AccountStatementModal({
  isOpen,
  onClose,
  entity,
  entityType,
  sales,
  transactions,
  products,
  inventory,
  inventoryBills,
  bills
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
  }, [isOpen, entity, dateRange, viewMode, transactions, sales]);

  const generateStatement = async () => {
    if (!entity) return;

    setIsLoading(true);
    try {
      const accountStatementService = AccountStatementService.getInstance();

      let newStatement: AccountStatement | null = null;

      // Compute locally (always)
      if (entityType === 'customer') {
        newStatement = accountStatementService.generateCustomerStatement(
          entity as Customer,
          sales,
          transactions,
          products,
          inventory,
          dateRange,
          viewMode,
          bills
        );
      } else {
        // Normalize LocalSaleItem[] to unified SaleItem[] for supplier statements
        const normalizedSales: SaleItem[] = (sales as any[]).map((s: any) => ({
          id: s.id,
          storeId: s.store_id,
          inventoryItemId: s.inventory_item_id,
          productId: s.product_id,
          supplierId: s.supplier_id,
          customerId: s.customer_id || undefined,
          quantity: s.quantity || 0,
          weight: s.weight ?? undefined,
          unitPrice: s.unit_price || 0,
          totalPrice: (s.quantity || 0) * (s.unit_price || 0),
          receivedValue: s.received_value || 0,
          paymentMethod: s.payment_method,
          notes: s.notes || undefined,
          createdAt: s.created_at,
          createdBy: s.created_by,
          synced: s._synced ?? true,
          deleted: s._deleted ?? false,
        }));

        newStatement = accountStatementService.generateSupplierStatement(
          entity as Supplier,
          normalizedSales,
          inventory,
          transactions,
          products,
          inventoryBills as any,
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
        <div className="bg-white rounded-lg max-w-7xl w-full max-h-[95vh] overflow-hidden flex flex-col">
          {/* Header */}
          <div className="p-6 border-b border-gray-200 flex items-center justify-between flex-shrink-0">
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
                  onChange={(e)=>{
                    const selectedDate = new Date(e.target.value);
                    const today = new Date();
                    today.setHours(23, 59, 59, 999); // End of today
                    
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
                    today.setHours(23, 59, 59, 999); // End of today
                    
                    if (selectedDate <= today) {
                      setDateRange(prev => ({ ...prev, end: e.target.value }));
                    }
                  }}
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
          <div className="px-6 py-4 bg-gray-50 border-b border-gray-200 flex-shrink-0">
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
          <div className="flex-1 overflow-y-auto p-6">
            {isLoading ? (
              <div className="flex items-center justify-center py-12">
                <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
              </div>
            ) : statement ? (
              <>
                {/* Financial Summary Section - Always Visible */}
                <div className="space-y-8">
                {/* Financial Summary Section */}
                <div className="bg-gray-50 rounded-lg p-6">
                  <h3 className="text-lg font-semibold text-gray-900 mb-4 flex items-center">
                      <DollarSign className="w-6 h-6 mr-3 text-blue-600" />
                      Financial Overview
                    </h3>
                    <div className="flex items-center space-x-2 text-sm text-gray-600">
                      <Info className="w-4 h-4" />
                      <span>Period: {new Date(statement.dateRange.start).toLocaleDateString()} - {new Date(statement.dateRange.end).toLocaleDateString()}</span>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                    {/* <div className="bg-white p-6 rounded-xl border border-gray-200 shadow-sm">
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
                    </div> */}

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
                      </>
                    ) : (
                      <>
                        <div className="bg-white p-6 rounded-xl border border-gray-200 shadow-sm">
                          <div className="flex items-center justify-between mb-2">
                            <div className="text-sm font-medium text-gray-500">Total Commissions</div>
                            <TrendingUp className="w-4 h-4 text-purple-400" />
                          </div>
                          <div className="text-2xl font-bold text-purple-600">
                            {formatCurrency(statement.financialSummary.totalReceivings.LBP, 'LBP')}
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

             
                </div>

                {/* Transaction History Section */}
                <div className="bg-white rounded-xl border border-gray-200 shadow-sm mt-4">
                  <div className="p-6 border-b border-gray-200">
                    <h3 className="text-xl font-bold text-gray-900 flex items-center">
                      <FileText className="w-6 h-6 mr-3 text-gray-600" />
                      {viewMode === 'detailed' ? 'Detailed Transaction History' : 'Transaction Summary'}
                    </h3>
                    {/* <p className="text-sm text-gray-600 mt-1">
                      {statement.transactions.length} transactions found
                    </p> */}
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
                              <th className="px-6 py-4 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                                Number
                              </th>
                            )}
                             {viewMode === 'detailed' && (
                              <th className="px-6 py-4 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                                Weight
                              </th>
                            )}
                             {viewMode === 'detailed' && (
                              <th className="px-6 py-4 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                                Price
                              </th>
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
                                  <td className="px-6 py-4">
                                    <div className="text-sm font-medium text-gray-900">
                                    {transaction.quantity?`${transaction.quantity}`:'-'}
                                  </div>
                                
                                  </td>
                                )}
                                {viewMode === 'detailed' && (
                                  <td className="px-6 py-4">
                                    <div className="text-sm font-medium text-gray-900">
                                    {transaction.weight?`${transaction.weight}kg`:'-'}
                                  </div>
                                
                                  </td>
                                )}
                                {viewMode === 'detailed' && (
                                  <td className="px-6 py-4">
                                    <div className="text-sm font-medium text-gray-900">
                                    {transaction.price?`LBP${transaction.price}`:'-'}
                                  </div>
                                
                                  </td>
                                )}
                              {/* credit */}
                              <td className="px-6 py-4 whitespace-nowrap">
                                {transaction.type === 'payment' ? (
                                  <span className="text-sm font-bold text-green-600">
                                    {formatCurrency(transaction.amount || 0, transaction.currency)}
                                  </span>
                                ) : (
                                  <span className="text-sm text-gray-400">-</span>
                                )}
                              </td>
                              {/* debit */}
                              <td className="px-6 py-4 whitespace-nowrap">
                                {transaction.type !== 'payment' ? (
                                  <span className="text-sm font-bold text-red-600">
                                    {formatCurrency(transaction.amount || 0, transaction.currency)}
                                  </span>
                                ) : (
                                  <span className="text-sm text-gray-400">-</span>
                                )}
                              </td>
                              {/* balance USD/LBP */}
                              <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">
                                {formatCurrency(transaction.balanceAfter, transaction.currency)}
                              </td>
                              {/* reference */}
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