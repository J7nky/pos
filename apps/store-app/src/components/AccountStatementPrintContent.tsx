import { AccountStatement } from '../services/accountStatementService';
import { Customer, Supplier } from '../types';
import { PrintLayout } from './common/PrintLayout';
import { useI18n } from '../i18n';

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
  const { t } = useI18n();

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
              {/* Opening Balance - Only on first page */}
              {isFirstPage && (
                <div className="print-opening-balance print-section">
                  <span className="print-opening-balance-label">{t('customers.openingBalance')}:</span>
                  <span className="print-opening-balance-value">
                    {formatCurrency(
                      statement.financialSummary.openingBalance[statement.transactions[0]?.currency || 'LBP'],
                      statement.transactions[0]?.currency || 'LBP',
                      true
                    )}
                  </span>
                </div>
              )}

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
                              {transaction.price ? formatCurrency(transaction.price, transaction.currency || 'LBP', false) : '-'}
                            </td>
                          </>
                        )}
                        <td className="print-table-col-debit print-number print-currency">
                          {transaction.type !== 'payment' ? formatCurrency(transaction.amount || 0, transaction.currency, false) : '0'}
                        </td>
                        <td className="print-table-col-credit print-number print-currency">
                          {transaction.type === 'payment' ? formatCurrency(transaction.amount || 0, transaction.currency, false) : '0'}
                        </td>
                        <td className="print-table-col-balance print-number print-currency">
                          {formatCurrency(transaction.balanceAfter, transaction.currency, true)}
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
                    <span>{t('balanceReport.debitTotal')}:</span>
                    <span className="print-number">
                      {formatCurrency(
                        statement.transactions
                          .filter(t => t.type !== 'payment')
                          .reduce((sum, t) => sum + (t.amount || 0), 0),
                        statement.transactions[0]?.currency || 'LBP',
                        true
                      )}
                    </span>
                  </div>
                  <div className="print-summary-row">
                    <span>{t('balanceReport.creditTotal')}:</span>
                    <span className="print-number">
                      {formatCurrency(
                        statement.transactions
                          .filter(t => t.type === 'payment')
                          .reduce((sum, t) => sum + (t.amount || 0), 0),
                        statement.transactions[0]?.currency || 'LBP',
                        true
                      )}
                    </span>
                  </div>
                  <div className="print-total-row">
                    <div className="print-final-balance">
                      <div className="print-final-balance-label">{t('customers.balance')}</div>
                      <div className="print-final-balance-value">
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
