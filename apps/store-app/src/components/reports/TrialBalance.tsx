import { useMemo, useState } from 'react';
import {
  Calendar,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  Download,
  Filter,
  Printer,
  Scale,
  X,
  XCircle,
} from 'lucide-react';
import type { CurrencyCode } from '@pos-platform/shared';
import { useTrialBalance } from '../../hooks/useTrialBalance';
import { useCurrency } from '../../hooks/useCurrency';
import { useI18n } from '../../i18n';
import type {
  TrialBalanceFilters,
  TrialBalanceRow,
} from '../../services/financialStatementService';
import { getLocalDateString, getTodayLocalDate } from '../../utils/dateUtils';
import JournalEntryDrillDownModal from './JournalEntryDrillDownModal';

interface TrialBalanceProps {
  storeId: string;
  branchId?: string;
}

type SortKey = 'account_code' | 'account_name' | 'account_type';
type SortDir = 'asc' | 'desc';

const ACCOUNT_TYPE_BADGE: Record<TrialBalanceRow['account_type'], string> = {
  asset: 'bg-blue-100 text-blue-800',
  liability: 'bg-orange-100 text-orange-800',
  equity: 'bg-purple-100 text-purple-800',
  revenue: 'bg-green-100 text-green-800',
  expense: 'bg-red-100 text-red-800',
};

function shiftRange(startDate: string, endDate: string): { startDate: string; endDate: string } {
  const start = new Date(startDate);
  const end = new Date(endDate);
  const days = Math.max(1, Math.round((end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24)) + 1);
  const prevEnd = new Date(start);
  prevEnd.setDate(prevEnd.getDate() - 1);
  const prevStart = new Date(prevEnd);
  prevStart.setDate(prevStart.getDate() - (days - 1));
  return {
    startDate: getLocalDateString(prevStart.toISOString()),
    endDate: getLocalDateString(prevEnd.toISOString()),
  };
}

export default function TrialBalance({ storeId, branchId }: TrialBalanceProps) {
  const { t } = useI18n();
  const { formatAmount } = useCurrency();

  const [dateRange, setDateRange] = useState(() => {
    const start = new Date();
    start.setDate(1);
    return {
      startDate: getLocalDateString(start.toISOString()),
      endDate: getTodayLocalDate(),
    };
  });
  const [postedOnly, setPostedOnly] = useState(true);
  const [compareEnabled, setCompareEnabled] = useState(false);
  const [showFilters, setShowFilters] = useState(true);
  const [sortKey, setSortKey] = useState<SortKey>('account_code');
  const [sortDir, setSortDir] = useState<SortDir>('asc');
  const [drillDown, setDrillDown] = useState<{ accountCode: string; accountName: string } | null>(null);

  const filters: TrialBalanceFilters = useMemo(() => {
    const base: TrialBalanceFilters = {
      storeId,
      branchId,
      startDate: dateRange.startDate,
      endDate: dateRange.endDate,
      postedOnly,
    };
    if (compareEnabled) {
      base.comparison = shiftRange(dateRange.startDate, dateRange.endDate);
    }
    return base;
  }, [storeId, branchId, dateRange.startDate, dateRange.endDate, postedOnly, compareEnabled]);

  const { data, comparison, isLoading, error, refresh } = useTrialBalance(filters);

  const applyDatePreset = (preset: 'today' | 'week' | 'month' | 'year' | 'mtd') => {
    const today = new Date();
    let start = new Date(today);
    switch (preset) {
      case 'today':
        start = new Date(today);
        break;
      case 'week':
        start.setDate(today.getDate() - 6);
        break;
      case 'mtd':
        start.setDate(1);
        break;
      case 'month':
        start.setDate(today.getDate() - 29);
        break;
      case 'year':
        start = new Date(today.getFullYear(), 0, 1);
        break;
    }
    setDateRange({
      startDate: getLocalDateString(start.toISOString()),
      endDate: getLocalDateString(today.toISOString()),
    });
  };

  const clearFilters = () => {
    const start = new Date();
    start.setDate(1);
    setDateRange({
      startDate: getLocalDateString(start.toISOString()),
      endDate: getTodayLocalDate(),
    });
    setCompareEnabled(false);
    setPostedOnly(true);
  };

  const sortedRows = useMemo<TrialBalanceRow[]>(() => {
    if (!data) return [];
    const rows = [...data.rows];
    rows.sort((a, b) => {
      const av = a[sortKey] ?? '';
      const bv = b[sortKey] ?? '';
      if (av === bv) return 0;
      return sortDir === 'asc' ? (av > bv ? 1 : -1) : av < bv ? 1 : -1;
    });
    return rows;
  }, [data, sortKey, sortDir]);

  const compareByCode = useMemo(() => {
    const m = new Map<string, TrialBalanceRow>();
    if (!comparison) return m;
    for (const r of comparison.rows) m.set(r.account_code, r);
    return m;
  }, [comparison]);

  const handleSort = (key: SortKey) => {
    if (key === sortKey) {
      setSortDir(sortDir === 'asc' ? 'desc' : 'asc');
    } else {
      setSortKey(key);
      setSortDir('asc');
    }
  };

  const exportToCSV = () => {
    if (!data) return;
    const currencies = data.currencies;
    const headers = [
      t('reports.trialBalance.col.accountCode'),
      t('reports.trialBalance.col.accountName'),
      t('reports.trialBalance.col.accountType'),
      ...currencies.map((c) => `${t('reports.trialBalance.col.debit')} (${c})`),
      ...currencies.map((c) => `${t('reports.trialBalance.col.credit')} (${c})`),
      ...currencies.map((c) => `${t('reports.trialBalance.col.balance')} (${c})`),
    ];
    const escape = (v: string) => {
      const s = String(v ?? '');
      return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
    };
    const lines: string[] = [headers.map(escape).join(',')];
    for (const row of sortedRows) {
      const debits = currencies.map((c) => (row.debits[c] ?? 0).toFixed(2));
      const credits = currencies.map((c) => (row.credits[c] ?? 0).toFixed(2));
      const balances = currencies.map((c) => (row.balance[c] ?? 0).toFixed(2));
      lines.push(
        [row.account_code, row.account_name, row.account_type, ...debits, ...credits, ...balances]
          .map(escape)
          .join(','),
      );
    }
    const totalsLine = [
      t('reports.trialBalance.totals'),
      '',
      '',
      ...currencies.map((c) => (data.totals.debits[c] ?? 0).toFixed(2)),
      ...currencies.map((c) => (data.totals.credits[c] ?? 0).toFixed(2)),
      ...currencies.map(() => ''),
    ]
      .map(escape)
      .join(',');
    lines.push(totalsLine);

    const blob = new Blob([lines.join('\n')], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `trial_balance_${dateRange.startDate}_to_${dateRange.endDate}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const handlePrint = () => {
    window.print();
  };

  if (isLoading && !data) {
    return (
      <div className="flex items-center justify-center p-12">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-4" />
          <p className="text-gray-600">{t('reports.trialBalance.loading')}</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="bg-red-50 border border-red-200 rounded-lg p-6">
        <h3 className="text-lg font-semibold text-red-800 mb-2">
          {t('reports.trialBalance.errorTitle')}
        </h3>
        <p className="text-red-600">{error}</p>
        <button
          onClick={refresh}
          className="mt-4 bg-red-600 text-white px-4 py-2 rounded-lg hover:bg-red-700 transition-colors"
        >
          {t('reports.trialBalance.retry')}
        </button>
      </div>
    );
  }

  const currencies = data?.currencies ?? [];

  return (
    <div className="space-y-6 print:space-y-3">
      {/* Header */}
      <div className="bg-white rounded-lg shadow-sm p-6 print:shadow-none print:p-2">
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
          <div>
            <h2 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
              <Scale className="w-6 h-6 text-blue-600" />
              {t('reports.trialBalance.title')}
            </h2>
            <p className="text-sm text-gray-500 mt-1">
              {t('reports.trialBalance.description')}
            </p>
            <p className="text-xs text-gray-500 mt-2">
              {dateRange.startDate} → {dateRange.endDate}
            </p>
          </div>
          <div className="flex gap-2 print:hidden">
            <button
              onClick={clearFilters}
              className="px-4 py-2 text-sm text-gray-700 bg-gray-100 rounded-lg hover:bg-gray-200 transition-colors flex items-center"
            >
              <X className="w-4 h-4 mr-2" />
              {t('reports.trialBalance.clearFilters')}
            </button>
            <button
              onClick={exportToCSV}
              disabled={!data}
              className="bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 disabled:opacity-50 transition-colors flex items-center shadow-sm"
            >
              <Download className="w-5 h-5 mr-2" />
              {t('reports.trialBalance.exportCsv')}
            </button>
            <button
              onClick={handlePrint}
              disabled={!data}
              className="bg-gray-700 text-white px-4 py-2 rounded-lg hover:bg-gray-800 disabled:opacity-50 transition-colors flex items-center shadow-sm"
            >
              <Printer className="w-5 h-5 mr-2" />
              {t('reports.trialBalance.print')}
            </button>
          </div>
        </div>
      </div>

      {/* Filters */}
      <div className="bg-white rounded-lg shadow-sm overflow-hidden print:hidden">
        <button
          onClick={() => setShowFilters(!showFilters)}
          className="w-full px-6 py-4 flex items-center justify-between hover:bg-gray-50 transition-colors"
        >
          <div className="flex items-center">
            <Filter className="w-5 h-5 mr-2 text-gray-600" />
            <h3 className="text-lg font-semibold text-gray-900">
              {t('reports.trialBalance.filters')}
            </h3>
          </div>
          {showFilters ? <ChevronUp className="w-5 h-5 text-gray-400" /> : <ChevronDown className="w-5 h-5 text-gray-400" />}
        </button>
        {showFilters && (
          <div className="px-6 py-6 border-t border-gray-200 bg-gray-50/50">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-4">
              <div className="bg-white rounded-lg border border-gray-200 p-4 shadow-sm">
                <label className="block text-sm font-semibold text-gray-900 mb-3 flex items-center">
                  <Calendar className="w-4 h-4 mr-2 text-blue-600" />
                  {t('reports.trialBalance.quickDateRange')}
                </label>
                <div className="flex gap-2 flex-wrap">
                  {[
                    { key: 'today' as const, label: t('reports.trialBalance.preset.today') },
                    { key: 'week' as const, label: t('reports.trialBalance.preset.week') },
                    { key: 'mtd' as const, label: t('reports.trialBalance.preset.mtd') },
                    { key: 'month' as const, label: t('reports.trialBalance.preset.month') },
                    { key: 'year' as const, label: t('reports.trialBalance.preset.year') },
                  ].map(({ key, label }) => (
                    <button
                      key={key}
                      onClick={() => applyDatePreset(key)}
                      className="px-3 py-1.5 text-sm bg-blue-50 text-blue-700 rounded-lg hover:bg-blue-100 transition-all font-medium border border-blue-200"
                    >
                      {label}
                    </button>
                  ))}
                </div>
              </div>
              <div className="bg-white rounded-lg border border-gray-200 p-4 shadow-sm">
                <label className="block text-sm font-semibold text-gray-900 mb-3">
                  {t('reports.trialBalance.startDate')}
                </label>
                <input
                  type="date"
                  value={dateRange.startDate}
                  onChange={(e) => setDateRange((p) => ({ ...p, startDate: e.target.value }))}
                  className="w-full border-2 border-gray-200 rounded-lg px-4 py-2.5 text-sm bg-white focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                />
              </div>
              <div className="bg-white rounded-lg border border-gray-200 p-4 shadow-sm">
                <label className="block text-sm font-semibold text-gray-900 mb-3">
                  {t('reports.trialBalance.endDate')}
                </label>
                <input
                  type="date"
                  value={dateRange.endDate}
                  onChange={(e) => setDateRange((p) => ({ ...p, endDate: e.target.value }))}
                  className="w-full border-2 border-gray-200 rounded-lg px-4 py-2.5 text-sm bg-white focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                />
              </div>
            </div>
            <div className="flex flex-wrap gap-4">
              <label className="flex items-center gap-2 px-3 py-2 bg-white border-2 border-gray-200 rounded-lg cursor-pointer">
                <input
                  type="checkbox"
                  checked={postedOnly}
                  onChange={(e) => setPostedOnly(e.target.checked)}
                  className="w-4 h-4 text-blue-600 rounded"
                />
                <span className="text-sm font-medium text-gray-700">
                  {t('reports.trialBalance.postedOnly')}
                </span>
              </label>
              <label className="flex items-center gap-2 px-3 py-2 bg-white border-2 border-gray-200 rounded-lg cursor-pointer">
                <input
                  type="checkbox"
                  checked={compareEnabled}
                  onChange={(e) => setCompareEnabled(e.target.checked)}
                  className="w-4 h-4 text-blue-600 rounded"
                />
                <span className="text-sm font-medium text-gray-700">
                  {t('reports.trialBalance.compareWithPrevious')}
                </span>
              </label>
            </div>
          </div>
        )}
      </div>

      {/* Summary cards: per-currency balance check */}
      {data && currencies.length > 0 && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {currencies.map((c) => {
            const totalDebit = data.totals.debits[c] ?? 0;
            const totalCredit = data.totals.credits[c] ?? 0;
            const diff = totalDebit - totalCredit;
            const balanced = data.isBalanced[c] === true;
            return (
              <div
                key={c}
                className={`rounded-xl shadow-sm p-5 border-l-4 ${
                  balanced
                    ? 'bg-gradient-to-br from-green-50 to-green-100 border-green-500'
                    : 'bg-gradient-to-br from-red-50 to-red-100 border-red-500'
                }`}
              >
                <div className="flex items-center justify-between mb-3">
                  <span className="text-sm font-semibold text-gray-700">{c}</span>
                  <span
                    className={`px-2 py-1 rounded-full text-xs font-semibold flex items-center gap-1 ${
                      balanced ? 'bg-green-200 text-green-900' : 'bg-red-200 text-red-900'
                    }`}
                  >
                    {balanced ? (
                      <>
                        <CheckCircle2 className="w-3.5 h-3.5" />
                        {t('reports.trialBalance.balanced')}
                      </>
                    ) : (
                      <>
                        <XCircle className="w-3.5 h-3.5" />
                        {t('reports.trialBalance.unbalanced')}
                      </>
                    )}
                  </span>
                </div>
                <div className="space-y-1.5 text-sm">
                  <div className="flex justify-between">
                    <span className="text-gray-600">{t('reports.trialBalance.totalDebits')}</span>
                    <span className="font-semibold tabular-nums text-gray-900">
                      {formatAmount(totalDebit, c)}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-600">{t('reports.trialBalance.totalCredits')}</span>
                    <span className="font-semibold tabular-nums text-gray-900">
                      {formatAmount(totalCredit, c)}
                    </span>
                  </div>
                  <div className="flex justify-between border-t border-gray-300 pt-1.5 mt-1.5">
                    <span className="text-gray-600">{t('reports.trialBalance.difference')}</span>
                    <span
                      className={`font-semibold tabular-nums ${
                        balanced ? 'text-green-800' : 'text-red-800'
                      }`}
                    >
                      {formatAmount(diff, c)}
                    </span>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Table */}
      {data && (
        <div className="bg-white rounded-lg shadow-sm overflow-hidden print:shadow-none">
          <div className="px-6 py-4 border-b border-gray-200 bg-gray-50 flex items-center justify-between">
            <div>
              <h3 className="text-lg font-semibold text-gray-900">
                {t('reports.trialBalance.tableTitle')}
              </h3>
              <p className="text-sm text-gray-500 mt-1">
                {t('reports.trialBalance.accountCount', { count: sortedRows.length })}
              </p>
            </div>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 border-b border-gray-200">
                <tr>
                  <th
                    className="px-4 py-3 text-left text-xs font-semibold text-gray-700 uppercase cursor-pointer hover:bg-gray-100"
                    onClick={() => handleSort('account_code')}
                  >
                    <div className="flex items-center gap-1">
                      {t('reports.trialBalance.col.accountCode')}
                      {sortKey === 'account_code' && (sortDir === 'asc' ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />)}
                    </div>
                  </th>
                  <th
                    className="px-4 py-3 text-left text-xs font-semibold text-gray-700 uppercase cursor-pointer hover:bg-gray-100"
                    onClick={() => handleSort('account_name')}
                  >
                    <div className="flex items-center gap-1">
                      {t('reports.trialBalance.col.accountName')}
                      {sortKey === 'account_name' && (sortDir === 'asc' ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />)}
                    </div>
                  </th>
                  <th
                    className="px-4 py-3 text-left text-xs font-semibold text-gray-700 uppercase cursor-pointer hover:bg-gray-100"
                    onClick={() => handleSort('account_type')}
                  >
                    <div className="flex items-center gap-1">
                      {t('reports.trialBalance.col.accountType')}
                      {sortKey === 'account_type' && (sortDir === 'asc' ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />)}
                    </div>
                  </th>
                  {currencies.map((c) => (
                    <th key={`hd-${c}`} className="px-4 py-3 text-right text-xs font-semibold text-gray-700 uppercase">
                      {t('reports.trialBalance.col.debit')} ({c})
                    </th>
                  ))}
                  {currencies.map((c) => (
                    <th key={`hc-${c}`} className="px-4 py-3 text-right text-xs font-semibold text-gray-700 uppercase">
                      {t('reports.trialBalance.col.credit')} ({c})
                    </th>
                  ))}
                  {currencies.map((c) => (
                    <th key={`hb-${c}`} className="px-4 py-3 text-right text-xs font-semibold text-gray-700 uppercase">
                      {t('reports.trialBalance.col.balance')} ({c})
                    </th>
                  ))}
                  {compareEnabled && currencies.map((c) => (
                    <th key={`hd-${c}-prev`} className="px-4 py-3 text-right text-xs font-semibold text-gray-500 uppercase border-l border-gray-300">
                      Δ {c}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200 bg-white">
                {sortedRows.length === 0 ? (
                  <tr>
                    <td colSpan={3 + currencies.length * 3 + (compareEnabled ? currencies.length : 0)} className="px-6 py-12 text-center text-gray-500">
                      {t('reports.trialBalance.noEntries')}
                    </td>
                  </tr>
                ) : (
                  sortedRows.map((row) => {
                    const compareRow = compareByCode.get(row.account_code);
                    return (
                      <tr
                        key={row.account_code}
                        className="hover:bg-blue-50 cursor-pointer transition-colors"
                        onClick={() =>
                          setDrillDown({ accountCode: row.account_code, accountName: row.account_name })
                        }
                      >
                        <td className="px-4 py-3 font-mono text-sm text-gray-900">{row.account_code}</td>
                        <td className="px-4 py-3 text-gray-900">{row.account_name}</td>
                        <td className="px-4 py-3">
                          <span className={`px-2 py-1 rounded-full text-xs font-medium capitalize ${ACCOUNT_TYPE_BADGE[row.account_type] ?? 'bg-gray-100 text-gray-800'}`}>
                            {row.account_type}
                          </span>
                        </td>
                        {currencies.map((c) => (
                          <td key={`d-${row.account_code}-${c}`} className="px-4 py-3 text-right tabular-nums text-gray-900">
                            {(row.debits[c] ?? 0) > 0 ? formatAmount(row.debits[c]!, c) : '—'}
                          </td>
                        ))}
                        {currencies.map((c) => (
                          <td key={`c-${row.account_code}-${c}`} className="px-4 py-3 text-right tabular-nums text-gray-900">
                            {(row.credits[c] ?? 0) > 0 ? formatAmount(row.credits[c]!, c) : '—'}
                          </td>
                        ))}
                        {currencies.map((c) => {
                          const v = row.balance[c] ?? 0;
                          return (
                            <td
                              key={`b-${row.account_code}-${c}`}
                              className={`px-4 py-3 text-right tabular-nums font-semibold ${v < 0 ? 'text-red-600' : 'text-gray-900'}`}
                            >
                              {v !== 0 ? formatAmount(v, c) : '—'}
                            </td>
                          );
                        })}
                        {compareEnabled && currencies.map((c) => {
                          const cur = row.balance[c] ?? 0;
                          const prev = compareRow?.balance[c] ?? 0;
                          const delta = cur - prev;
                          return (
                            <td
                              key={`delta-${row.account_code}-${c}`}
                              className={`px-4 py-3 text-right tabular-nums text-sm border-l border-gray-200 ${
                                delta === 0 ? 'text-gray-400' : delta > 0 ? 'text-green-700' : 'text-red-700'
                              }`}
                            >
                              {delta !== 0 ? formatAmount(delta, c) : '—'}
                            </td>
                          );
                        })}
                      </tr>
                    );
                  })
                )}
              </tbody>
              {sortedRows.length > 0 && (
                <tfoot className="bg-gray-50 border-t-2 border-gray-300">
                  <tr>
                    <td colSpan={3} className="px-4 py-3 font-semibold text-gray-900">
                      {t('reports.trialBalance.totals')}
                    </td>
                    {currencies.map((c) => (
                      <td key={`td-${c}`} className="px-4 py-3 text-right tabular-nums font-semibold text-gray-900">
                        {formatAmount(data.totals.debits[c] ?? 0, c)}
                      </td>
                    ))}
                    {currencies.map((c) => (
                      <td key={`tc-${c}`} className="px-4 py-3 text-right tabular-nums font-semibold text-gray-900">
                        {formatAmount(data.totals.credits[c] ?? 0, c)}
                      </td>
                    ))}
                    {currencies.map((c) => {
                      const diff = (data.totals.debits[c] ?? 0) - (data.totals.credits[c] ?? 0);
                      const balanced = data.isBalanced[c] === true;
                      return (
                        <td
                          key={`tb-${c}`}
                          className={`px-4 py-3 text-right tabular-nums font-semibold ${
                            balanced ? 'text-green-700' : 'text-red-700'
                          }`}
                        >
                          {formatAmount(diff, c)}
                        </td>
                      );
                    })}
                    {compareEnabled && currencies.map((c) => (
                      <td key={`td-delta-${c}`} className="px-4 py-3 border-l border-gray-200" />
                    ))}
                  </tr>
                </tfoot>
              )}
            </table>
          </div>
        </div>
      )}

      {/* Drill-down modal */}
      {drillDown && (
        <JournalEntryDrillDownModal
          isOpen={true}
          onClose={() => setDrillDown(null)}
          storeId={storeId}
          branchId={branchId}
          accountCode={drillDown.accountCode}
          accountName={drillDown.accountName}
          startDate={dateRange.startDate}
          endDate={dateRange.endDate}
          currencies={currencies as CurrencyCode[]}
          postedOnly={postedOnly}
        />
      )}
    </div>
  );
}
