import React from 'react';
import { AccountStatement } from '../services/accountStatementService';
import { PrintLayout } from './common/PrintLayout';
import { useI18n } from '../i18n';
import { getTranslatedString, type SupportedLanguage } from '../utils/multilingual';
import type { CurrencyCode } from '@pos-platform/shared';
import type { StatementTransaction, StatementProductDetail } from '../types';

/**
 * AccountStatementPrintContent Component
 *
 * Note: This component is used for React-based print preview only.
 * Actual printing in Electron uses a dedicated BrowserWindow with electron/print/statement.html template
 * for clean isolation and predictable A4 output.
 */

interface AccountStatementPrintContentProps {
  statement: AccountStatement;
  entity: { id: string; name: string; phone?: string | null;[key: string]: any };
  viewMode: 'summary' | 'detailed';
  totalPages: number;
  pages: Array<{
    pageNumber: number;
    transactions: StatementTransaction[];
    isFirstPage: boolean;
    isLastPage: boolean;
  }>;
  formatCurrency: (amount: number, currency: CurrencyCode, includeSymbol?: boolean) => string;
  /** The branch/store preferred currency. Running balance + final balance are
   *  shown in this currency only, with each per-currency component converted
   *  at the current FX rate. Per-row debit/credit cells stay native. */
  preferredCurrency: CurrencyCode;
  /** Convert a per-currency balance map to a single number in preferredCurrency. */
  convertMapToPreferred: (map: Partial<Record<CurrencyCode, number>> | undefined) => number;
}

export function AccountStatementPrintContent({
  statement,
  entity,
  viewMode,
  totalPages,
  pages,
  formatCurrency,
  preferredCurrency,
  convertMapToPreferred,
}: AccountStatementPrintContentProps) {
  const { t, language } = useI18n();

  // Currencies the statement actually carries — used to build per-currency
  // totals and a header currency label, no FX conversion.
  const allCurrencies: CurrencyCode[] = (() => {
    const set = new Set<string>();
    for (const map of [
      statement.financialSummary.openingBalance,
      statement.financialSummary.currentBalance,
    ]) {
      Object.keys(map).forEach(k => set.add(k));
    }
    statement.transactions.forEach(t => set.add(t.currency));
    return Array.from(set) as CurrencyCode[];
  })();

  const headerCurrency: CurrencyCode = (statement.transactions[0]?.currency as CurrencyCode) ?? (allCurrencies[0] ?? 'USD');

  // Per-currency debit/credit totals across all transactions.
  const totalsByCurrency: Record<string, { debit: number; credit: number }> = {};
  for (const tr of statement.transactions) {
    const c = tr.currency;
    if (!totalsByCurrency[c]) totalsByCurrency[c] = { debit: 0, credit: 0 };
    totalsByCurrency[c].debit += tr.debit ?? 0;
    totalsByCurrency[c].credit += tr.credit ?? 0;
  }

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
              phone={isFirstPage ? entity.phone ?? undefined : undefined}
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
                      const rowCurrency = transaction.currency;
                      // Running balance shown in preferred currency only (FX-converted).
                      const balanceInPreferred = convertMapToPreferred(transaction.balances_after);

                      // When line items exist, suppress the parent bill row — line items
                      // already represent the same posting decomposed into products.
                      return (
                        <React.Fragment key={transaction.id || `transaction-${transactionIndex}`}>
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
                                {getTranslatedString(transaction.description, language as SupportedLanguage, 'en')}
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
                                    {transaction.price ? formatCurrency(transaction.price, rowCurrency, false) : '-'}
                                  </td>
                                </>
                              )}
                              <td className="print-table-col-debit print-number print-currency">
                                {(transaction.debit ?? 0) > 0.005 ? formatCurrency(transaction.debit ?? 0, rowCurrency, false) : '0'}
                              </td>
                              <td className="print-table-col-credit print-number print-currency">
                                {(transaction.credit ?? 0) > 0.005 ? formatCurrency(transaction.credit ?? 0, rowCurrency, false) : '0'}
                              </td>
                              <td className="print-table-col-balance print-number print-currency">
                                {formatCurrency(balanceInPreferred, preferredCurrency, true)}
                              </td>
                            </tr>
                          )}

                          {/* Line items replace the parent row when present.
                              Date and reference appear only on the first line; each row
                              carries its own incremental running balance so the column
                              is never blank. */}
                          {hasLineItems && transaction.product_details!.map((item: StatementProductDetail, idx: number) => {
                            const itemCurrency: CurrencyCode = (item.currency ?? rowCurrency) as CurrencyCode;
                            const isFirstItem = idx === 0;
                            const itemBalanceInPreferred = item.balances_after
                              ? convertMapToPreferred(item.balances_after)
                              : balanceInPreferred;
                            return (
                              <tr key={`${transaction.id || transactionIndex}-item-${idx}`}>
                                <td className="print-table-col-date">
                                  {isFirstItem
                                    ? new Date(transaction.date).toLocaleDateString('ar-LB', {
                                        year: 'numeric',
                                        month: '2-digit',
                                        day: '2-digit',
                                      })
                                    : ''}
                                </td>
                                <td className="print-table-col-reference">
                                  {isFirstItem ? (transaction.reference || '-') : ''}
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
                                  {formatCurrency(itemBalanceInPreferred, preferredCurrency, true)}
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

              {isLastPage && (
                <div className="print-summary-totals">
                  {/* Per-currency debit/credit totals (activity in original currency). */}
                  {Object.keys(totalsByCurrency).map((c) => {
                    const ccy = c as CurrencyCode;
                    const debit = totalsByCurrency[c].debit;
                    const credit = totalsByCurrency[c].credit;
                    return (
                      <div key={`tot-${c}`} className="print-summary-totals-row">
                        <div className="print-summary-totals-item">
                          <div className="print-summary-totals-label">{t('balanceReport.debitTotal')} ({c}):</div>
                          <div className="print-summary-totals-value print-number print-currency">
                            {formatCurrency(debit, ccy, true)}
                          </div>
                        </div>
                        <div className="print-summary-totals-item">
                          <div className="print-summary-totals-label">{t('balanceReport.creditTotal')} ({c}):</div>
                          <div className="print-summary-totals-value print-number print-currency">
                            {formatCurrency(credit, ccy, true)}
                          </div>
                        </div>
                      </div>
                    );
                  })}
                  {/* Final balance: one number in the preferred currency, FX-converted. */}
                  <div className="print-summary-totals-row">
                    <div className="print-summary-totals-item">
                      <div className="print-summary-totals-label">{t('customers.balance')}:</div>
                      <div className="print-summary-totals-value print-number print-currency">
                        {formatCurrency(
                          convertMapToPreferred(statement.financialSummary.currentBalance),
                          preferredCurrency,
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
