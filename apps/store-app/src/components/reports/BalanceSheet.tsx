import { Fragment, useMemo, useState } from 'react';
import { Scale } from 'lucide-react';
import { useI18n } from '../../i18n';
import { useCurrency } from '../../hooks/useCurrency';
import { useBalanceSheet } from '../../hooks/useBalanceSheet';
import { getTodayLocalDate } from '../../utils/dateUtils';

type Props = {
  storeId: string;
  branchId?: string;
};

const SECTION_ORDER = [
  'current_asset',
  'non_current_asset',
  'current_liability',
  'non_current_liability',
  'equity',
] as const;

export default function BalanceSheet({ storeId, branchId }: Props) {
  const { t } = useI18n();
  const { formatAmount } = useCurrency();
  const [asOfDate, setAsOfDate] = useState(getTodayLocalDate());
  const [showZero, setShowZero] = useState(false);
  const { report, isLoading, error, regenerate } = useBalanceSheet({
    storeId,
    branchId,
    asOfDate,
    hideZeroBalanceAccounts: !showZero,
  });

  const lineGroups = useMemo(() => {
    const grouped = new Map<string, typeof report.lines>();
    if (!report) return grouped;
    for (const section of SECTION_ORDER) grouped.set(section, []);
    for (const line of report.lines) {
      const key = line.sub_classification as string;
      if (!grouped.has(key)) grouped.set(key, []);
      grouped.get(key)!.push(line);
    }
    return grouped;
  }, [report]);

  if (isLoading && !report) return <div className="p-6 text-gray-500">{t('reports.balanceSheet.loading')}</div>;
  if (error) {
    return (
      <div className="p-6 border rounded-lg bg-red-50 text-red-700">
        <p>{error}</p>
        <button onClick={regenerate} className="mt-3 px-3 py-2 rounded bg-red-600 text-white">
          {t('reports.balanceSheet.retry')}
        </button>
      </div>
    );
  }
  if (!report) return null;

  const primaryColumn = report.columns[0];
  const hasVariance = !primaryColumn.isBalanced && primaryColumn.variance;

  return (
    <div className="space-y-4">
      <div className="bg-white rounded-lg shadow-sm p-5">
        <div className="flex items-center justify-between gap-4">
          <h2 className="text-xl font-semibold flex items-center gap-2">
            <Scale className="w-5 h-5 text-blue-600" />
            {t('reports.balanceSheet.title')}
          </h2>
          <div className="flex items-center gap-3">
            <input type="date" value={asOfDate} onChange={(e) => setAsOfDate(e.target.value)} className="border rounded px-3 py-2" />
            <label className="text-sm flex items-center gap-2">
              <input type="checkbox" checked={showZero} onChange={(e) => setShowZero(e.target.checked)} />
              {t('reports.balanceSheet.showZeroBalances')}
            </label>
          </div>
        </div>
      </div>

      <div className="bg-white rounded-lg shadow-sm overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 border-b">
            <tr>
              <th className="px-4 py-3 text-left">{t('reports.balanceSheet.account')}</th>
              {report.currencies.map((currency) => (
                <th key={currency} className="px-4 py-3 text-right">{t('reports.balanceSheet.amount')} ({currency})</th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y">
            {SECTION_ORDER.map((section) => (
              <Fragment key={section}>
                <tr className="bg-gray-50">
                  <td colSpan={report.currencies.length + 1} className="px-4 py-2 font-semibold">
                    {t(`reports.balanceSheet.sections.${section}`)}
                  </td>
                </tr>
                {(lineGroups.get(section) ?? []).map((line) => (
                  <tr key={line.account_code}>
                    <td className="px-4 py-2">{line.account_name}</td>
                    {report.currencies.map((currency) => (
                      <td key={`${line.account_code}-${currency}`} className="px-4 py-2 text-right tabular-nums">
                        {formatAmount(line.balanceByColumn[0].nativeBalance[currency] ?? 0, currency)}
                      </td>
                    ))}
                  </tr>
                ))}
              </Fragment>
            ))}
          </tbody>
        </table>
      </div>

      <div className={`rounded-lg p-4 ${primaryColumn.isBalanced ? 'bg-green-50 text-green-800' : 'bg-amber-50 text-amber-800'}`}>
        <p className="font-semibold">{t('reports.balanceSheet.equation')}</p>
        {hasVariance && (
          <p className="text-sm mt-1">
            {t('reports.balanceSheet.variance')}: {Object.entries(primaryColumn.variance ?? {})
              .map(([currency, value]) => `${currency} ${Number(value).toFixed(2)}`)
              .join(' | ')}
          </p>
        )}
      </div>
    </div>
  );
}

