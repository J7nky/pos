import React, { useState, useEffect, useMemo, Fragment } from 'react';
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
import { Customer, Supplier, Transaction, InventoryItem, Product, BillLineItem } from '../types';
import { useI18n } from '../i18n';
import { getTranslatedString } from '../utils/multilingual';
import Toast from './common/Toast';
import { PrintPreview } from './common/PrintPreview';
import { setupPrintWithPageSelection } from '../utils/printUtils';
import { paginateTransactions, getTotalPages } from '../utils/printPagination';
import { AccountStatementPrintContent } from './AccountStatementPrintContent';
import { formatCurrency as formatCurrencyUtil } from '../utils/currencyFormatter';
import type { AccountStatementPrintPayload } from '../types/electron';

interface AccountStatementModalProps {
  isOpen: boolean;
  onClose: () => void;
  entity: Customer | Supplier;
  entityType: 'customer' | 'supplier';
  storeId: string;
  sales: BillLineItem[];
  transactions: Transaction[];
  products: Product[];
  inventory: InventoryItem[];
  inventoryBills: any[];
  bills?: any[];
  isSyncing?: boolean;
}

export default function AccountStatementModal({
  isOpen,
  onClose,
  entity,
  entityType,
  storeId,
  sales,
  transactions,
  products,
  inventory,
  inventoryBills,
  bills,
  isSyncing = false
}: AccountStatementModalProps) {
  const { t, language } = useI18n();
  
  const [statement, setStatement] = useState<AccountStatement | null>(null);
  const [viewMode, setViewMode] = useState<'summary' | 'detailed'>('summary');
  const [dateRange, setDateRange] = useState<{ start: string; end: string }>(() => {
    const today = new Date();
    const year = today.getFullYear();
    const month = String(today.getMonth() + 1).padStart(2, '0');
    const day = String(today.getDate()).padStart(2, '0');
    return {
      start: `${year}-01-01`, // Start of year
      end: `${year}-${month}-${day}` // Today in local timezone
    };
  });
  const [isLoading, setIsLoading] = useState(false);
  const [showPrintPreview, setShowPrintPreview] = useState(false);
  const [totalPages, setTotalPages] = useState(1);
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error'; visible: boolean }>({
    message: '',
    type: 'success',
    visible: false,
  });

  const showToast = (message: string, type: 'success' | 'error' = 'success') => {
    setToast({ message, type, visible: true });
  };

  const hideToast = () => setToast(t => ({ ...t, visible: false }));

  // Create stable dependency tracking to prevent unnecessary regeneration
  // Only regenerate when actual data count changes, not when array reference changes
  const transactionsKey = useMemo(() => 
    `${transactions.length}-${transactions.slice(0, 5).map(t => t.id).join(',')}`,
    [transactions]
  );
  
  const salesKey = useMemo(() => 
    `${sales.length}-${sales.slice(0, 5).map(s => s.id).join(',')}`,
    [sales]
  );

  useEffect(() => {
    if (isOpen && entity) {
      generateStatement();
    }
  }, [isOpen, entity, dateRange, viewMode, transactionsKey, salesKey]);

  const generateStatement = async () => {
    if (!entity) return;

    setIsLoading(true);
    try {
      const accountStatementService = AccountStatementService.getInstance();

      let newStatement: AccountStatement | null = null;

      // Generate statement using journal entries (single source of truth)
      if (entityType === 'customer') {
        newStatement = await accountStatementService.generateCustomerStatement(
          entity.id,
          storeId,
          dateRange,
          viewMode,
          language as 'en' | 'ar' | 'fr'
        );
      } else {
        newStatement = await accountStatementService.generateSupplierStatement(
          entity.id,
          storeId,
          dateRange,
          viewMode,
          language as 'en' | 'ar' | 'fr'
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

  const handlePrint = async (selectedPages?: number[]) => {
    if (!statement) return;

    // Check if Electron API is available
    if (typeof window !== 'undefined' && (window as any).electronAPI?.printStatement) {
      try {
        // Prepare payload for Electron printing
        const payload: AccountStatementPrintPayload = {
          statement,
          entity: {
            name: entity.name,
            type: entityType
          },
          viewMode,
          language: language as 'en' | 'ar' | 'fr',
          dateRange: {
            start: statement.dateRange.start,
            end: statement.dateRange.end
          }
        };

        // Call Electron print API
        const result = await (window as any).electronAPI.printStatement(payload);
        
        if (result.success) {
          showToast('Statement sent to printer', 'success');
        } else {
          showToast(result.message || 'Failed to print statement', 'error');
        }
      } catch (error) {
        console.error('Error printing statement via Electron:', error);
        showToast('Failed to print statement', 'error');
        // Fallback to CSS printing
        setupPrintWithPageSelection(selectedPages, totalPages);
      }
    } else {
      // Web fallback: use CSS printing
      setupPrintWithPageSelection(selectedPages, totalPages);
    }
  };

  const handleClosePreview = () => {
    setShowPrintPreview(false);
  };


  // Unified currency formatter with symbol control
  const formatCurrency = (amount: number, currency: 'USD' | 'LBP', includeSymbol: boolean = true) => {
    return formatCurrencyUtil(amount, currency, includeSymbol);
  };

  if (!isOpen) return null;

  return (
    <>
      <Toast message={toast.message} type={toast.type} visible={toast.visible} onClose={hideToast} />

      {/* Print Preview Modal */}
      {showPrintPreview && statement && (() => {
        const paginatedPages = paginateTransactions(statement.transactions, viewMode);
        
        return (
          <PrintPreview
            isOpen={showPrintPreview}
            onClose={handleClosePreview}
            onPrint={handlePrint}
            totalPages={totalPages}
            title={t('customers.summaryAccountStatement')}
            content={
              <AccountStatementPrintContent
                statement={statement}
                entity={entity}
                viewMode={viewMode}
                totalPages={totalPages}
                pages={paginatedPages}
                formatCurrency={formatCurrency}
              />
            }
          />
        );
      })()}

      {/* Printable Statement View - Hidden in screen, visible in print */}
      {statement && (() => {
        const paginatedPages = paginateTransactions(statement.transactions, viewMode);
        
        return (
          <div className="print-only" style={{ display: 'none' }}>
            <AccountStatementPrintContent
              statement={statement}
              entity={entity}
              viewMode={viewMode}
              totalPages={totalPages}
              pages={paginatedPages}
              formatCurrency={formatCurrency}
            />
          </div>
        );
      })()}

      <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50 no-print">
        <div className="bg-white rounded-lg max-w-7xl w-full max-h-[95vh] overflow-hidden flex flex-col">
          {/* Sync Indicator - Subtle, non-intrusive */}
          {isSyncing && (
            <div className="absolute top-2 right-2 z-10 bg-blue-50 border border-blue-200 rounded-lg px-3 py-1.5 flex items-center gap-2 shadow-sm">
              <div className="animate-spin rounded-full h-3 w-3 border-b-2 border-blue-600"></div>
              <span className="text-xs text-blue-600 font-medium">Syncing...</span>
            </div>
          )}

          {/* Header */}
          <div className="p-6 border-b border-gray-200 flex items-center justify-between flex-shrink-0">
            <div className="flex items-center gap-3">
              {entityType === 'customer' ? (
                <Users className="w-6 h-6 text-blue-600" />
              ) : (
                <Truck className="w-6 h-6 text-green-600" />
              )}
              <div>
                <h2 className="text-2xl font-bold text-gray-900">
                  {t('customers.summaryAccountStatement')} - {entity.name}
                </h2>
                <p className="text-sm text-gray-600 capitalize">
                  {t(`payments.${entityType}`)} • {new Date().toLocaleDateString()}
                </p>
              </div>
            </div>

            <div className="flex items-center gap-3">
              {/* Date Range Picker */}
              <div className="flex items-center gap-2">
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
                <span className="text-gray-500">{t('common.to')}</span>
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
                className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
              >
                <Download className="w-4 h-4" />
                <span>{t('common.actions.export')}</span>
              </button>

              <button
                onClick={handlePrintClick}
                className="flex items-center gap-2 px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors"
              >
                <Printer className="w-4 h-4" />
                <span>{t('balanceReport.print')}</span>
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
              <div className="flex items-center gap-1 bg-gray-100 p-1 rounded-lg">
                <button
                  onClick={() => setViewMode('summary')}
                  className={`flex items-center gap-2 px-4 py-2 rounded-md transition-colors ${
                    viewMode === 'summary'
                      ? 'bg-white text-blue-600 shadow-sm'
                      : 'text-gray-600 hover:text-gray-900'
                  }`}
                >
                  <BarChart3 className="w-4 h-4" />
                  <span className="font-medium">{t('balanceReport.financialSummary')}</span>
                </button>
                <button
                  onClick={() => setViewMode('detailed')}
                  className={`flex items-center gap-2 px-4 py-2 rounded-md transition-colors ${
                    viewMode === 'detailed'
                      ? 'bg-white text-blue-600 shadow-sm'
                      : 'text-gray-600 hover:text-gray-900'
                  }`}
                >
                  <List className="w-4 h-4" />
                  <span className="font-medium">{t('balanceReport.detailedView')}</span>
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
                      <DollarSign className="w-6 h-6 me-3 text-blue-600" />
                      {t('customers.financialOverview')}
                    </h3>
                    <div className="flex items-center gap-2 text-sm text-gray-600">
                      <Info className="w-4 h-4" />
                      <span>{t('customers.period')}: {new Date(statement.dateRange.start).toLocaleDateString()} - {new Date(statement.dateRange.end).toLocaleDateString()}</span>
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
                        <div className="text-sm font-medium text-gray-500">{t('cashDrawer.currentBalance')}</div>
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
                            <div className="text-sm font-medium text-gray-500">{t('balanceReport.totalCreditSales')}</div>
                            <CreditCard className="w-4 h-4 text-red-400" />
                          </div>
                          <div className="text-2xl font-bold text-red-600">
                            {formatCurrency(statement.financialSummary.totalSales.LBP, 'LBP')}
                          </div>
                        </div>

                        <div className="bg-white p-6 rounded-xl border border-gray-200 shadow-sm">
                          <div className="flex items-center justify-between mb-2">
                            <div className="text-sm font-medium text-gray-500">{t('customers.totalPayments')}</div>
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
                            <div className="text-sm font-medium text-gray-500">{t('common.totalReceivedBills')}</div>
                            <TrendingUp className="w-4 h-4 text-purple-400" />
                          </div>
                          <div className="text-2xl font-bold text-purple-600">
                            {formatCurrency(statement.financialSummary.totalReceivings.LBP, 'LBP')}
                          </div>
                          <div className="text-sm text-gray-600 mt-1">
                            {formatCurrency(statement.financialSummary.totalReceivings.USD, 'USD')}
                          </div>
                        </div>

                        <div className="bg-white p-6 rounded-xl border border-gray-200 shadow-sm">
                          <div className="flex items-center justify-between mb-2">
                            <div className="text-sm font-medium text-gray-500">{t('common.totalPayments')}</div>
                            <TrendingDown className="w-4 h-4 text-red-400" />
                          </div>
                          <div className="text-2xl font-bold text-red-600">
                            {formatCurrency(statement.financialSummary.totalPayments.USD, 'USD')}
                          </div>
                          <div className="text-sm text-gray-600 mt-1">
                            {formatCurrency(statement.financialSummary.totalPayments.LBP, 'LBP')}
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
                      <FileText className="w-6 h-6 me-3 text-gray-600" />
                      {viewMode === 'detailed' ? t('balanceReport.transactionDetails') : t('balanceReport.transactionSummary')}
                    </h3>
                    {/* <p className="text-sm text-gray-600 mt-1">
                      {statement.transactions.length} transactions found
                    </p> */}
                  </div>

                  {statement.transactions.length === 0 ? (
                    <div className="text-center py-16">
                      <FileText className="w-16 h-16 text-gray-300 mx-auto mb-4" />
                      <p className="text-xl font-medium text-gray-500 mb-2">{t('dashboard.noTransactionsFound')}</p>
                      <p className="text-gray-400">{t('common.tryAdjustingTheDateRangeOrCheckingBackLater')}</p>
                    </div>
                  ) : (
                    <div className="overflow-x-auto">
                      <table className="min-w-full divide-y divide-gray-200">
                        <thead className="bg-gray-50">
                          <tr>
                            <th className="px-6 py-4 text-start text-xs font-medium text-gray-500 uppercase tracking-wider">
                              {t('balanceReport.date')}
                            </th>
                           
                          
                              <th className="px-6 py-4 text-start text-xs font-medium text-gray-500 uppercase tracking-wider">
                            {t('balanceReport.description')}
                            </th>
                            
                            {viewMode === 'detailed' && (
                              <th className="px-6 py-4 text-start text-xs font-medium text-gray-500 uppercase tracking-wider">
                                {t('balanceReport.number')}
                              </th>
                            )}
                             {viewMode === 'detailed' && (
                              <th className="px-6 py-4 text-start text-xs font-medium text-gray-500 uppercase tracking-wider">
                                {t('balanceReport.weight')}
                              </th>
                            )}
                             {viewMode === 'detailed' && (
                              <th className="px-6 py-4 text-start text-xs font-medium text-gray-500 uppercase tracking-wider">
                                {t('balanceReport.price')}
                              </th>
                            )}
                        
                            <th className="px-6 py-4 text-start text-xs font-medium text-gray-500 uppercase tracking-wider">
                              {t('balanceReport.credit')}
                            </th>
                            <th className="px-6 py-4 text-start text-xs font-medium text-gray-500 uppercase tracking-wider">
                              {t('balanceReport.debit')}
                            </th>
                            <th className="px-6 py-4 text-start text-xs font-medium text-gray-500 uppercase tracking-wider">
                              {t('balanceReport.balanceAfter')}
                            </th>
                            <th className="px-6 py-4 text-start text-xs font-medium text-gray-500 uppercase tracking-wider">
                              {t('balanceReport.reference')}
                            </th>
                          </tr>
                        </thead>
                        <tbody className="bg-white divide-y divide-gray-200">

                          {statement.transactions.map((transaction, transactionIndex) => {
                            const hasLineItems = viewMode === 'detailed' && transaction.product_details && transaction.product_details.length > 0;
                            
                            // Calculate balance before this transaction
                            const balanceBefore = transactionIndex === 0 
                              ? (transaction.currency === 'USD' ? statement.financialSummary.openingBalance.USD : statement.financialSummary.openingBalance.LBP)
                              : (statement.transactions[transactionIndex - 1].balance_after);
                            
                            return (
                              <Fragment key={transaction.id}>
                                {/* Main transaction row - only show if no line items */}
                                {!hasLineItems && (
                                  <tr className="hover:bg-gray-50 transition-colors">
                                    <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">
                                      {new Date(transaction.date).toLocaleDateString()}
                                    </td>
                                 
                                    <td className="px-6 py-4">
                                      <div className="text-sm font-medium text-gray-900">
                                        {getTranslatedString(transaction.description, language, 'en')}
                                      </div>
                                      {transaction.paymentMethod && (
                                        <div className="text-xs text-gray-500 mt-1 flex items-center">
                                          <CreditCard className="w-3 h-3 me-1" />
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
                                          {formatCurrency(transaction.amount || 0, transaction.currency || 'LBP')}
                                        </span>
                                      ) : (
                                        <span className="text-sm text-gray-400">-</span>
                                      )}
                                    </td>
                                    {/* debit */}
                                    <td className="px-6 py-4 whitespace-nowrap">
                                      {transaction.type !== 'payment' ? (
                                        <span className="text-sm font-bold text-red-600">
                                          {formatCurrency(transaction.amount || 0, transaction.currency || 'LBP')}
                                        </span>
                                      ) : (
                                        <span className="text-sm text-gray-400">-</span>
                                      )}
                                    </td>
                                    {/* balance USD/LBP */}
                                    <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">
                                      {formatCurrency(transaction.balance_after, transaction.currency || 'LBP')}
                                    </td>
                                    {/* reference */}
                                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                                      {transaction.reference || '-'}
                                    </td>
                                  </tr>
                                )}
                                
                                {/* Bill line items as separate rows in detailed view */}
                                {hasLineItems && transaction.product_details!.map((item, idx) => {
                                  const itemCurrency = item.currency || transaction.currency || 'LBP';
                                  const isFirstItem = idx === 0;
                                  
                                  // Calculate incremental balance for each line item
                                  // Balance = previous balance + debit - credit
                                  let itemBalance = balanceBefore;
                                  
                                  // Add all previous line items in this transaction
                                  for (let i = 0; i < idx; i++) {
                                    const prevItem = transaction.product_details![i];
                                    const prevDebit = prevItem.debit_amount || 0;
                                    const prevCredit = prevItem.credit_amount || 0;
                                    itemBalance += prevDebit - prevCredit;
                                  }
                                  
                                  // Add current line item
                                  const currentDebit = item.debit_amount || 0;
                                  const currentCredit = item.credit_amount || 0;
                                  itemBalance += currentDebit - currentCredit;
                                  
                                  return (
                                    <tr key={`${transaction.id}-item-${idx}`} className="bg-gray-50 hover:bg-gray-100 transition-colors">
                                      <td className="px-6 py-3 text-sm text-gray-500">
                                        {isFirstItem ? new Date(transaction.date).toLocaleDateString() : ''}
                                      </td>
                                      <td className="px-6 py-3 text-sm text-gray-900">
                                        <div className="font-medium">{item.product_name}</div>
                                        {item.notes && (
                                          <div className="text-xs text-gray-500 mt-1 italic">{item.notes}</div>
                                        )}
                                        {isFirstItem && transaction.paymentMethod && (
                                          <div className="text-xs text-gray-500 mt-1 flex items-center">
                                            <CreditCard className="w-3 h-3 me-1" />
                                            {transaction.paymentMethod}
                                          </div>
                                        )}
                                      </td>
                                      {viewMode === 'detailed' && (
                                        <td className="px-6 py-3 text-sm text-gray-700">
                                          {item.quantity} {item.unit}
                                        </td>
                                      )}
                                      {viewMode === 'detailed' && (
                                        <td className="px-6 py-3 text-sm text-gray-700">
                                          {item.weight ? `${item.weight}kg` : '-'}
                                        </td>
                                      )}
                                      {viewMode === 'detailed' && (
                                        <td className="px-6 py-3 text-sm text-gray-700">
                                          {formatCurrency(item.unit_price, itemCurrency, false)}
                                        </td>
                                      )}
                                      {/* credit */}
                                      <td className="px-6 py-3 whitespace-nowrap">
                                        {item.credit_amount && item.credit_amount > 0 ? (
                                          <span className="text-sm font-bold text-green-600">
                                            {formatCurrency(item.credit_amount, itemCurrency, false)}
                                          </span>
                                        ) : (
                                          <span className="text-sm text-gray-400">-</span>
                                        )}
                                      </td>
                                      {/* debit */}
                                      <td className="px-6 py-3 whitespace-nowrap">
                                        {item.debit_amount && item.debit_amount > 0 ? (
                                          <span className="text-sm font-bold text-red-600">
                                            {formatCurrency(item.debit_amount, itemCurrency, false)}
                                          </span>
                                        ) : (
                                          <span className="text-sm text-gray-400">-</span>
                                        )}
                                      </td>
                                      {/* balance USD/LBP */}
                                      <td className="px-6 py-3 whitespace-nowrap text-sm font-medium text-gray-900">
                                        {formatCurrency(itemBalance, itemCurrency)}
                                      </td>
                                      {/* reference */}
                                      <td className="px-6 py-3 whitespace-nowrap text-sm text-gray-500">
                                        {transaction.reference || '-'}
                                      </td>
                                    </tr>
                                  );
                                })}
                              </Fragment>
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
                <p className="text-xl font-medium text-gray-500 mb-2">{t('common.failedToGenerateStatement')}</p>
                <p className="text-gray-400">{t('common.tryAgainOrContactSupport')}</p>
              </div>
            )}
          </div>
        </div>
      </div>
    </>
  );
}