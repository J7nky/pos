/**
 * SpoilageReport (spec 019, US5) — period loss/spoilage totals with by-reason,
 * by-product and by-supplier/bill breakdowns. Reads the loss ledger
 * client-side via spoilageReportService; commission memo losses shown
 * separately (no expense). Reasons are shrinkage (automatic) and spoiled
 * (manual or bill-close reconciliation) — there is no separate "lost" reason.
 */
/* eslint-disable @typescript-eslint/no-explicit-any -- Supplier/bill/product rows arrive as Dexie any shapes from context */
import React, { useEffect, useMemo, useState } from 'react';
import { Scale, PackageX, TrendingDown } from 'lucide-react';
import { useOfflineData } from '../../contexts/OfflineDataContext';
import { useSupabaseAuth } from '../../contexts/SupabaseAuthContext';
import { useI18n } from '../../i18n';
import { useProductMultilingual } from '../../hooks/useMultilingual';
import { getSpoilageReport, type SpoilageReport as SpoilageReportData } from '../../services/spoilageReportService';

interface SpoilageReportProps {
  startDate: string;
  endDate: string;
}

export const SpoilageReport: React.FC<SpoilageReportProps> = ({ startDate, endDate }) => {
  const { t } = useI18n();
  const { products, suppliers, inventoryBills, formatAmount, storeId, currentBranch, lossEvents } = useOfflineData();
  const { userProfile } = useSupabaseAuth();
  const { getProductName } = useProductMultilingual();
  const [report, setReport] = useState<SpoilageReportData | null>(null);

  const effectiveStoreId = storeId || userProfile?.store_id || '';
  const branchId = currentBranch?.id ?? null;

  useEffect(() => {
    let cancelled = false;
    if (!effectiveStoreId) return;
    getSpoilageReport({ storeId: effectiveStoreId, from: startDate, to: endDate, branchId })
      .then(r => { if (!cancelled) setReport(r); })
      .catch(e => console.error('Spoilage report failed:', e));
    return () => { cancelled = true; };
    // lossEvents in deps: recompute when the ledger changes (new loss/reversal).
  }, [effectiveStoreId, branchId, startDate, endDate, lossEvents]);

  const productName = useMemo(() => {
    const byId = new Map((products || []).map((p: any) => [p.id, p]));
    return (id: string) => getProductName(byId.get(id) as any) || id.slice(0, 8);
  }, [products, getProductName]);

  const billLabel = useMemo(() => {
    const bills = new Map((inventoryBills || []).map((b: any) => [b.id, b]));
    const supplierById = new Map((suppliers || []).map((s: any) => [s.id, s]));
    return (billId: string) => {
      const bill = bills.get(billId);
      const supplier = bill ? supplierById.get(bill.supplier_id) : null;
      const date = bill?.received_at ? new Date(bill.received_at).toLocaleDateString() : '';
      return supplier ? `${supplier.name}${date ? ` — ${date}` : ''}` : billId.slice(0, 8);
    };
  }, [inventoryBills, suppliers]);

  if (!report) {
    return <div className="bg-white rounded-lg shadow-sm p-12 text-center text-gray-500">…</div>;
  }

  const reasonMeta = [
    { key: 'shrinkage' as const, icon: Scale, color: 'indigo' },
    { key: 'spoiled' as const, icon: PackageX, color: 'red' },
  ];

  return (
    <div className="space-y-6">
      {/* Totals */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="bg-white p-4 rounded-lg shadow-sm">
          <p className="text-sm text-gray-500 flex items-center gap-1.5">
            <TrendingDown className="w-4 h-4" />
            {t('losses.totalLosses')}
          </p>
          <p className="text-2xl font-bold text-red-600">{formatAmount(report.totals.totalValue)}</p>
          {report.totals.commissionValue > 0 && (
            <p className="text-xs text-gray-400 mt-1">
              +{formatAmount(report.totals.commissionValue)} ({t('losses.reasons.shrinkage')} — {t('customers.supplier')})
            </p>
          )}
        </div>
        {reasonMeta.map(({ key, icon: Icon, color }) => (
          <div key={key} className="bg-white p-4 rounded-lg shadow-sm">
            <p className={`text-sm text-${color}-600 flex items-center gap-1.5`}>
              <Icon className="w-4 h-4" />
              {t(`losses.reasons.${key}`)}
            </p>
            <p className="text-2xl font-bold text-gray-900">{formatAmount(report.totals.byReason[key].value)}</p>
            <p className="text-xs text-gray-400 mt-1">
              {report.totals.byReason[key].count} · {report.totals.byReason[key].quantity || '—'} {t('losses.quantity').toLowerCase()} · {report.totals.byReason[key].weight ? `${Math.round(report.totals.byReason[key].weight * 100) / 100} kg` : '—'}
            </p>
          </div>
        ))}
      </div>

      {/* Breakdowns */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="bg-white rounded-lg shadow-sm">
          <h3 className="px-4 py-3 border-b text-sm font-semibold text-gray-700">{t('losses.byProduct')}</h3>
          <table className="min-w-full divide-y divide-gray-200">
            <tbody className="divide-y divide-gray-100">
              {report.byProduct.length === 0 && (
                <tr><td className="px-4 py-6 text-center text-gray-400 text-sm">{t('losses.noLosses')}</td></tr>
              )}
              {report.byProduct.map(row => (
                <tr key={row.key}>
                  <td className="px-4 py-2 text-sm text-gray-900">{productName(row.key)}</td>
                  <td className="px-4 py-2 text-sm text-gray-500 text-center">
                    {row.quantity || '—'} · {row.weight ? `${Math.round(row.weight * 100) / 100} kg` : '—'}
                  </td>
                  <td className="px-4 py-2 text-sm font-medium text-red-600 text-end">{formatAmount(row.value)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="bg-white rounded-lg shadow-sm">
          <h3 className="px-4 py-3 border-b text-sm font-semibold text-gray-700">{t('losses.bySupplier')}</h3>
          <table className="min-w-full divide-y divide-gray-200">
            <tbody className="divide-y divide-gray-100">
              {report.byBill.length === 0 && (
                <tr><td className="px-4 py-6 text-center text-gray-400 text-sm">{t('losses.noLosses')}</td></tr>
              )}
              {report.byBill.map(row => (
                <tr key={row.key}>
                  <td className="px-4 py-2 text-sm text-gray-900">{billLabel(row.key)}</td>
                  <td className="px-4 py-2 text-sm text-gray-500 text-center">
                    {row.quantity || '—'} · {row.weight ? `${Math.round(row.weight * 100) / 100} kg` : '—'}
                  </td>
                  <td className="px-4 py-2 text-sm font-medium text-red-600 text-end">{formatAmount(row.value)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};

export default SpoilageReport;
