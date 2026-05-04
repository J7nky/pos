import { useEffect, useMemo, useState } from 'react';
import { X, Loader2, FileText } from 'lucide-react';
import type { CurrencyCode } from '@pos-platform/shared';
import { getDB } from '../../lib/db';
import type { JournalEntry } from '../../types/accounting';
import { amountsFromLegacyEntry, getCredit, getDebit } from '../../services/accountingCurrencyHelpers';
import { useI18n } from '../../i18n';
import { useCurrency } from '../../hooks/useCurrency';

export interface JournalEntryDrillDownModalProps {
  isOpen: boolean;
  onClose: () => void;
  storeId: string;
  branchId?: string;
  accountCode: string;
  accountName: string;
  startDate: string;
  endDate: string;
  /** Currencies to render columns for. If absent, every currency present is rendered. */
  currencies?: CurrencyCode[];
  postedOnly?: boolean;
}

function startOfDayIso(d: string): string {
  return d.length <= 10 ? `${d}T00:00:00.000Z` : d;
}
function endOfDayIso(d: string): string {
  return d.length <= 10 ? `${d}T23:59:59.999Z` : d;
}

export default function JournalEntryDrillDownModal({
  isOpen,
  onClose,
  storeId,
  branchId,
  accountCode,
  accountName,
  startDate,
  endDate,
  currencies,
  postedOnly = true,
}: JournalEntryDrillDownModalProps) {
  const { t } = useI18n();
  const { formatAmount } = useCurrency();
  const [entries, setEntries] = useState<JournalEntry[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!isOpen) return;
    let cancelled = false;

    const load = async () => {
      setIsLoading(true);
      setError(null);
      try {
        const start = startOfDayIso(startDate);
        const end = endOfDayIso(endDate);
        const all = await getDB()
          .journal_entries.where('[store_id+account_code]')
          .equals([storeId, accountCode])
          .toArray();
        const filtered = all.filter((e) => {
          if (e._deleted) return false;
          if (branchId && e.branch_id && e.branch_id !== branchId) return false;
          if (postedOnly && !e.is_posted) return false;
          if (!e.posted_date) return false;
          return e.posted_date >= start && e.posted_date <= end;
        });
        filtered.sort((a, b) => (a.posted_date < b.posted_date ? -1 : a.posted_date > b.posted_date ? 1 : 0));
        if (!cancelled) setEntries(filtered);
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : 'Failed to load journal entries');
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    };

    load();
    return () => {
      cancelled = true;
    };
  }, [isOpen, storeId, branchId, accountCode, startDate, endDate, postedOnly]);

  const renderedCurrencies: CurrencyCode[] = useMemo(() => {
    if (currencies && currencies.length > 0) return currencies;
    const present = new Set<CurrencyCode>();
    for (const e of entries) {
      const amounts = amountsFromLegacyEntry(e);
      for (const c of Object.keys(amounts) as CurrencyCode[]) present.add(c);
    }
    return Array.from(present).sort();
  }, [currencies, entries]);

  const totals = useMemo(() => {
    const debit: Partial<Record<CurrencyCode, number>> = {};
    const credit: Partial<Record<CurrencyCode, number>> = {};
    for (const e of entries) {
      const amounts = amountsFromLegacyEntry(e);
      for (const c of renderedCurrencies) {
        debit[c] = (debit[c] ?? 0) + getDebit(amounts, c);
        credit[c] = (credit[c] ?? 0) + getCredit(amounts, c);
      }
    }
    return { debit, credit };
  }, [entries, renderedCurrencies]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-6xl max-h-[90vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200">
          <div>
            <h2 className="text-lg font-semibold text-gray-900 flex items-center gap-2">
              <FileText className="w-5 h-5 text-blue-600" />
              {t('reports.trialBalance.drillDownTitle')}
            </h2>
            <p className="text-sm text-gray-500 mt-0.5">
              {accountCode} — {accountName} · {startDate} → {endDate}
            </p>
          </div>
          <button
            onClick={onClose}
            className="p-2 rounded-lg hover:bg-gray-100 transition-colors"
            aria-label="Close"
          >
            <X className="w-5 h-5 text-gray-600" />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-auto">
          {isLoading ? (
            <div className="flex items-center justify-center p-12">
              <Loader2 className="w-8 h-8 text-blue-600 animate-spin" />
            </div>
          ) : error ? (
            <div className="p-6 text-red-600">{error}</div>
          ) : entries.length === 0 ? (
            <div className="p-12 text-center text-gray-500">
              {t('reports.trialBalance.drillDownEmpty')}
            </div>
          ) : (
            <table className="w-full text-sm">
              <thead className="bg-gray-50 sticky top-0">
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-700 uppercase">
                    {t('reports.trialBalance.col.postedDate')}
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-700 uppercase">
                    {t('reports.trialBalance.col.description')}
                  </th>
                  {renderedCurrencies.map((c) => (
                    <th key={`d-${c}`} className="px-4 py-3 text-right text-xs font-semibold text-gray-700 uppercase">
                      {t('reports.trialBalance.col.debit')} ({c})
                    </th>
                  ))}
                  {renderedCurrencies.map((c) => (
                    <th key={`c-${c}`} className="px-4 py-3 text-right text-xs font-semibold text-gray-700 uppercase">
                      {t('reports.trialBalance.col.credit')} ({c})
                    </th>
                  ))}
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-700 uppercase">
                    {t('reports.trialBalance.col.transactionId')}
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-700 uppercase">
                    {t('reports.trialBalance.col.billId')}
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200">
                {entries.map((e) => {
                  const amounts = amountsFromLegacyEntry(e);
                  return (
                    <tr key={e.id} className="hover:bg-blue-50/40">
                      <td className="px-4 py-3 whitespace-nowrap text-gray-900">
                        {new Date(e.posted_date).toLocaleString()}
                      </td>
                      <td className="px-4 py-3 text-gray-700 max-w-xs truncate" title={e.description ?? ''}>
                        {e.description || '—'}
                      </td>
                      {renderedCurrencies.map((c) => {
                        const v = getDebit(amounts, c);
                        return (
                          <td key={`d-${e.id}-${c}`} className="px-4 py-3 text-right tabular-nums text-gray-900">
                            {v > 0 ? formatAmount(v, c) : '—'}
                          </td>
                        );
                      })}
                      {renderedCurrencies.map((c) => {
                        const v = getCredit(amounts, c);
                        return (
                          <td key={`c-${e.id}-${c}`} className="px-4 py-3 text-right tabular-nums text-gray-900">
                            {v > 0 ? formatAmount(v, c) : '—'}
                          </td>
                        );
                      })}
                      <td className="px-4 py-3 font-mono text-xs text-gray-500">
                        {e.transaction_id?.slice(0, 8) ?? '—'}
                      </td>
                      <td className="px-4 py-3 font-mono text-xs text-gray-500">
                        {e.bill_id ? e.bill_id.slice(0, 8) : '—'}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
              <tfoot className="bg-gray-50 sticky bottom-0 border-t-2 border-gray-300">
                <tr>
                  <td className="px-4 py-3 font-semibold text-gray-900" colSpan={2}>
                    {t('reports.trialBalance.totals')}
                  </td>
                  {renderedCurrencies.map((c) => (
                    <td key={`td-${c}`} className="px-4 py-3 text-right tabular-nums font-semibold text-gray-900">
                      {formatAmount(totals.debit[c] ?? 0, c)}
                    </td>
                  ))}
                  {renderedCurrencies.map((c) => (
                    <td key={`tc-${c}`} className="px-4 py-3 text-right tabular-nums font-semibold text-gray-900">
                      {formatAmount(totals.credit[c] ?? 0, c)}
                    </td>
                  ))}
                  <td colSpan={2} />
                </tr>
              </tfoot>
            </table>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-3 border-t border-gray-200 bg-gray-50 flex items-center justify-between">
          <span className="text-sm text-gray-500">
            {t('reports.trialBalance.drillDownEntryCount', { count: entries.length })}
          </span>
          <button
            onClick={onClose}
            className="px-4 py-2 bg-gray-700 text-white rounded-lg hover:bg-gray-800 transition-colors"
          >
            {t('reports.trialBalance.close')}
          </button>
        </div>
      </div>
    </div>
  );
}
