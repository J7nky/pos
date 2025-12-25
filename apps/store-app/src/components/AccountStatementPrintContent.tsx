import React from 'react';
import { AccountStatement } from '../services/accountStatementService';
import { Customer, Supplier } from '../types';
import { PrintLayout } from './common/PrintLayout';
import { useI18n } from '../i18n';
import { getTranslatedString } from '../utils/multilingual';

/**
 * AccountStatementPrintContent Component
 * 
 * Note: This component is used for React-based print preview only.
 * Actual printing in Electron uses a dedicated BrowserWindow with electron/print/statement.html template
 * for clean isolation and predictable A4 output.
 */

interface AccountStatementPrintContentProps {
  statement: AccountStatement;
  entity: Customer | Supplier;
  viewMode: 'summary' | 'detailed';
  totalPages: number;
  pages: Array<{
    pageNumber: number;
    transactions: any[];
    isFirstPage: boolean;
    isLastPage: boolean;
  }>;
  formatCurrency: (amount: number, currency: 'USD' | 'LBP', includeSymbol?: boolean) => string;
}

export function AccountStatementPrintContent({
  statement,
  entity,
  viewMode,
  totalPages,
  pages,
  formatCurrency
}: AccountStatementPrintContentProps) {
  const { t, language } = useI18n();

  return (
    <>
      {pages.map((page, idx) => {
        const isFirstPage = page.isFirstPage;
        const isLastPage = page.isLastPage;
        
        return (
          <div key={page.pageNumber} className={idx === 0 ? '' : 'print-page-break'}>
            <PrintLayout
              title={t(viewMode === 'detailed' ? 'customers.detailedAccountStatement' : 'customers.summaryAccountStatement')}
              accountName={isFirstPage ? entity.name : undefined}
              accountNumber={isFirstPage ? entity.id.slice(0, 10) : undefined}
              phone={isFirstPage ? entity.phone : undefined}
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
              {/* Transaction Table */}
              <div className="print-table-container print-section">
                <table className="print-table">
                  <thead>
                    <tr>
                      <th className="print-table-col-date">{t('balanceReport.date')}</th>
                      <th className="print-table-col-reference">{t('balanceReport.reference')}</th>
                      <th className="print-table-col-description">{t('balanceReport.description')}</th>
                      {viewMode === 'detailed' && (
                        <>
                          <th className="print-table-col-quantity">{t('balanceReport.quantity')}</th>
                          <th className="print-table-col-weight">{t('balanceReport.weight')}</th>
                          <th className="print-table-col-price">{t('balanceReport.price')}</th>
                        </>
                      )}
                      <th className="print-table-col-debit">{t('balanceReport.debit')}</th>
                      <th className="print-table-col-credit">{t('balanceReport.credit')}</th>
                      <th className="print-table-col-balance">{t('balanceReport.balance')}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {page.transactions.map((transaction, transactionIndex) => {
                      const hasLineItems = viewMode === 'detailed' && transaction.product_details && transaction.product_details.length > 0;
                      
                      // Find the actual index in the full statement transactions array to calculate balance before
                      const fullTransactionIndex = statement.transactions.findIndex(t => t.id === transaction.id);
                      let balanceBefore: number;
                      
                      if (fullTransactionIndex === 0) {
                        // First transaction overall - use opening balance
                        balanceBefore = transaction.currency === 'USD' 
                          ? statement.financialSummary.openingBalance.USD 
                          : statement.financialSummary.openingBalance.LBP;
                      } else {
                        // Use previous transaction's balance_after
                        const prevTransaction = statement.transactions[fullTransactionIndex - 1];
                        balanceBefore = prevTransaction.balance_after;
                      }
                      
                      return (
                        <React.Fragment key={transaction.id || `transaction-${transactionIndex}`}>
                          {/* Main transaction row - only show if no line items */}
                          {!hasLineItems && (
                            <tr>
                              <td className="print-table-col-date">
                                {new Date(transaction.date).toLocaleDateString('ar-LB', {
                                  year: 'numeric',
                                  month: '2-digit',
                                  day: '2-digit',
                                })}
                              </td>
                              <td className="print-table-col-reference">{transaction.reference || '-'}</td>
                              <td className="print-table-col-description">
                                {getTranslatedString(transaction.description, language, 'en')}
                              </td>
                              {viewMode === 'detailed' && (
                                <>
                                  <td className="print-table-col-quantity print-number">
                                    {transaction.quantity || '-'}
                                  </td>
                                  <td className="print-table-col-weight print-number">
                                    {transaction.weight ? `${transaction.weight}` : '-'}
                                  </td>
                                  <td className="print-table-col-price print-number">
                                    {transaction.price ? formatCurrency(transaction.price, transaction.currency || 'LBP', false) : '-'}
                                  </td>
                                </>
                              )}
                              <td className="print-table-col-debit print-number print-currency">
                                {transaction.type !== 'payment' ? formatCurrency(transaction.amount || 0, transaction.currency || 'LBP', false) : '0'}
                              </td>
                              <td className="print-table-col-credit print-number print-currency">
                                {transaction.type === 'payment' ? formatCurrency(transaction.amount || 0, transaction.currency || 'LBP', false) : '0'}
                              </td>
                              <td className="print-table-col-balance print-number print-currency">
                                {formatCurrency(transaction.balance_after, transaction.currency || 'LBP', true)}
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
                              <tr key={`${transaction.id || transactionIndex}-item-${idx}`}>
                                <td className="print-table-col-date">
                                  {isFirstItem ? new Date(transaction.date).toLocaleDateString('ar-LB', {
                                    year: 'numeric',
                                    month: '2-digit',
                                    day: '2-digit',
                                  }) : ''}
                                </td>
                                <td className="print-table-col-reference">
                                  {transaction.reference || '-'}
                                </td>
                                <td className="print-table-col-description">
                                  <div className="font-medium">{item.product_name}</div>
                                  {item.notes && (
                                    <div className="text-xs text-gray-500 italic mt-0.5">{item.notes}</div>
                                  )}
                                </td>
                                {viewMode === 'detailed' && (
                                  <>
                                    <td className="print-table-col-quantity print-number">
                                      {item.quantity} {item.unit}
                                    </td>
                                    <td className="print-table-col-weight print-number">
                                      {item.weight ? `${item.weight}` : '-'}
                                    </td>
                                    <td className="print-table-col-price print-number">
                                      {formatCurrency(item.unit_price, itemCurrency, false)}
                                    </td>
                                  </>
                                )}
                                <td className="print-table-col-debit print-number print-currency">
                                  {item.debit_amount && item.debit_amount > 0 
                                    ? formatCurrency(item.debit_amount, itemCurrency, false) 
                                    : '0'}
                                </td>
                                <td className="print-table-col-credit print-number print-currency">
                                  {item.credit_amount && item.credit_amount > 0 
                                    ? formatCurrency(item.credit_amount, itemCurrency, false) 
                                    : '0'}
                                </td>
                                <td className="print-table-col-balance print-number print-currency">
                                  {formatCurrency(itemBalance, itemCurrency, true)}
                                </td>
                              </tr>
                            );
                          })}
                        </React.Fragment>
                      );
                    })}
                  </tbody>
                </table>
              </div>

              {/* Summary Totals - Separated from table - Only on last page */}
              {isLastPage && (
                <div className="print-summary-totals">
                  <div className="print-summary-totals-row">
                    <div className="print-summary-totals-item">
                      <div className="print-summary-totals-label">{t('balanceReport.debitTotal')}:</div>
                      <div className="print-summary-totals-value print-number print-currency">
                        {formatCurrency(
                          statement.transactions
                            .filter(t => t.type !== 'payment')
                            .reduce((sum, t) => sum + (t.amount || 0), 0),
                          statement.transactions[0]?.currency || 'LBP',
                          true
                        )}
                      </div>
                    </div>
                    <div className="print-summary-totals-item">
                      <div className="print-summary-totals-label">{t('balanceReport.creditTotal')}:</div>
                      <div className="print-summary-totals-value print-number print-currency">
                        {formatCurrency(
                          statement.transactions
                            .filter(t => t.type === 'payment')
                            .reduce((sum, t) => sum + (t.amount || 0), 0),
                          statement.transactions[0]?.currency || 'LBP',
                          true
                        )}
                      </div>
                    </div>
                    <div className="print-summary-totals-item">
                      <div className="print-summary-totals-label">{t('customers.balance')}:</div>
                      <div className="print-summary-totals-value print-number print-currency">
                        {formatCurrency(
                          statement.financialSummary.currentBalance[statement.transactions[0]?.currency || 'LBP'],
                          statement.transactions[0]?.currency || 'LBP',
                          true
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              )}
            </PrintLayout>
          </div>
        );
      })}
    </>
  );
}
