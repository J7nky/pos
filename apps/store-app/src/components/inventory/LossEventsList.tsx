/**
 * LossEventsList (spec 019, US4/US5-lite) — the loss ledger view.
 * Lists active recorded losses (shrinkage / spoiled) for the branch with value
 * and a permission-gated Restore action. Restoring puts the stock back and nets
 * out the loss's journal entry; restored events drop out of this active view.
 */
/* eslint-disable @typescript-eslint/no-explicit-any -- Product rows arrive as Dexie any shapes from context (matches inventory component convention) */
import React, { useMemo, useState } from 'react';
import { RotateCcw, Scale, PackageX } from 'lucide-react';
import { useOfflineData } from '../../contexts/OfflineDataContext';
import { useI18n } from '../../i18n';
import { useProductMultilingual } from '../../hooks/useMultilingual';
import { Modal } from '../common/Modal';
import type { InventoryLossEvent } from '../../types';

interface LossEventsListProps {
  canRestore: boolean;
  showToast: (message: string, type?: 'success' | 'error') => void;
}

const REASON_ICONS: Record<string, React.ReactNode> = {
  shrinkage: <Scale className="w-3.5 h-3.5" />,
  spoiled: <PackageX className="w-3.5 h-3.5" />,
};

const REASON_STYLES: Record<string, string> = {
  shrinkage: 'bg-indigo-100 text-indigo-700 dark:bg-indigo-900/40 dark:text-indigo-300',
  spoiled: 'bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300',
};

export const LossEventsList: React.FC<LossEventsListProps> = ({ canRestore, showToast }) => {
  const { t } = useI18n();
  const { lossEvents, products, reverseInventoryLoss, formatAmount } = useOfflineData();
  const { getProductName } = useProductMultilingual();
  const [confirmEvent, setConfirmEvent] = useState<InventoryLossEvent | null>(null);
  const [busy, setBusy] = useState(false);

  const productById = useMemo(
    () => new Map((products || []).map((p: any) => [p.id, p])),
    [products]
  );

  // Only active originals are shown — reversal rows and restored events are hidden.
  const rows = useMemo(
    () =>
      [...(lossEvents || [])]
        .filter(e => e.status === 'active' && !e.reversal_of_id)
        .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()),
    [lossEvents]
  );

  const totals = useMemo(() => {
    const byReason: Record<string, number> = { shrinkage: 0, spoiled: 0 };
    let total = 0;
    for (const e of rows) {
      // Commission rows don't count toward the expense total.
      if (e.is_commission) continue;
      byReason[e.reason] = (byReason[e.reason] ?? 0) + e.loss_value;
      total += e.loss_value;
    }
    return { byReason, total };
  }, [rows]);

  const restore = async () => {
    if (busy || !confirmEvent) return;
    setBusy(true);
    try {
      // Restore reuses the reversal op: stock is put back and the loss's journal
      // entry is netted out, but it's surfaced to the user as a plain Restore.
      const result = await reverseInventoryLoss({ lossEventId: confirmEvent.id });
      if (result.success) {
        showToast(t('losses.lossRestored'), 'success');
      } else {
        showToast(result.error || t('losses.lossRestoreFailed'), 'error');
      }
    } finally {
      setBusy(false);
      setConfirmEvent(null);
    }
  };

  const confirmProduct = confirmEvent ? productById.get(confirmEvent.product_id) : null;

  if (rows.length === 0) {
    return (
      <div className="bg-white dark:bg-slate-900 rounded-lg shadow-sm p-12 text-center text-gray-500 dark:text-slate-400">
        {t('losses.noLosses')}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Totals */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="bg-white dark:bg-slate-900 p-3 rounded-lg shadow-sm">
          <p className="text-sm text-gray-500 dark:text-slate-400">{t('losses.totalLosses')}</p>
          <p className="text-lg font-bold text-red-600">{formatAmount(totals.total)}</p>
        </div>
        {(['shrinkage', 'spoiled'] as const).map(reason => (
          <div key={reason} className="bg-white dark:bg-slate-900 p-3 rounded-lg shadow-sm">
            <p className="text-sm text-gray-500 dark:text-slate-400 flex items-center gap-1.5">
              {REASON_ICONS[reason]}
              {t(`losses.reasons.${reason}`)}
            </p>
            <p className="text-lg font-bold text-gray-900 dark:text-slate-100">
              {formatAmount(totals.byReason[reason] ?? 0)}
            </p>
          </div>
        ))}
      </div>

      {/* Table */}
      <div className="bg-white dark:bg-slate-900 rounded-lg shadow-sm overflow-x-auto">
        <table className="min-w-full divide-y divide-gray-200 dark:divide-slate-800">
          <thead className="bg-gray-50 dark:bg-slate-800">
            <tr>
              {[
                t('losses.date'),
                t('losses.product'),
                t('losses.reason'),
                t('losses.quantity'),
                t('losses.weight'),
                t('losses.value'),
                '',
              ].map((h, i) => (
                <th
                  key={i}
                  className="px-4 py-3 text-xs font-medium text-gray-500 dark:text-slate-400 uppercase tracking-wider rtl:text-right ltr:text-left"
                >
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-200 dark:divide-slate-800">
            {rows.map(event => {
              const product = productById.get(event.product_id);
              return (
                <tr key={event.id}>
                  <td className="px-4 py-3 text-sm text-gray-600 dark:text-slate-400 whitespace-nowrap">
                    {new Date(event.created_at).toLocaleDateString()}
                  </td>
                  <td className="px-4 py-3 text-sm text-gray-900 dark:text-slate-100">
                    {getProductName(product as any) || event.product_id.slice(0, 8)}
                  </td>
                  <td className="px-4 py-3">
                    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium ${REASON_STYLES[event.reason]}`}>
                      {REASON_ICONS[event.reason]}
                      {t(`losses.reasons.${event.reason}`)}
                    </span>
                    {event.is_commission && (
                      <span className="ms-1 text-xs text-gray-400">◦</span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-sm text-gray-900 dark:text-slate-100">
                    {event.quantity > 0 ? event.quantity : '—'}
                  </td>
                  <td className="px-4 py-3 text-sm text-gray-900 dark:text-slate-100">
                    {event.weight != null && event.weight > 0 ? `${event.weight} kg` : '—'}
                  </td>
                  <td className="px-4 py-3 text-sm font-medium text-red-600 whitespace-nowrap">
                    {event.is_commission ? '—' : formatAmount(event.loss_value, event.currency)}
                  </td>
                  <td className="px-4 py-3 text-end">
                    {canRestore && (
                      <button
                        onClick={() => setConfirmEvent(event)}
                        className="inline-flex items-center gap-1 text-sm text-gray-500 hover:text-emerald-600 transition-colors"
                      >
                        <RotateCcw className="w-4 h-4" />
                        {t('losses.restore')}
                      </button>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Restore confirmation — same modal pattern used across the app. */}
      <Modal
        isOpen={!!confirmEvent}
        onClose={() => !busy && setConfirmEvent(null)}
        title={t('losses.restore')}
        maxWidth="md"
      >
        {confirmEvent && (
          <div className="space-y-4">
            {/* What's being restored */}
            <div className="bg-gray-50 dark:bg-slate-800 p-3 rounded-lg text-sm space-y-2">
              <div className="font-medium text-gray-900 dark:text-slate-100">
                {getProductName(confirmProduct as any) || confirmEvent.product_id.slice(0, 8)}
              </div>
              <div className="flex items-center gap-3 text-gray-600 dark:text-slate-400">
                <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium ${REASON_STYLES[confirmEvent.reason]}`}>
                  {REASON_ICONS[confirmEvent.reason]}
                  {t(`losses.reasons.${confirmEvent.reason}`)}
                </span>
                <span>
                  {confirmEvent.weight != null && confirmEvent.weight > 0
                    ? `${confirmEvent.weight} kg`
                    : `${confirmEvent.quantity} ${t('losses.quantity').toLowerCase()}`}
                </span>
                {!confirmEvent.is_commission && (
                  <span className="ms-auto font-semibold text-red-600">
                    {formatAmount(confirmEvent.loss_value, confirmEvent.currency)}
                  </span>
                )}
              </div>
            </div>

            {/* Plain-language outcome */}
            <p className="text-sm text-gray-600 dark:text-slate-400">
              {t('losses.confirmRestore')}
            </p>

            {/* Actions */}
            <div className="flex justify-end gap-2 pt-2 border-t border-gray-200 dark:border-slate-800">
              <button
                onClick={() => setConfirmEvent(null)}
                disabled={busy}
                className="px-4 py-2 border border-gray-300 dark:border-slate-700 rounded-lg text-gray-700 dark:text-slate-300 hover:bg-gray-50 dark:hover:bg-slate-800 transition-colors disabled:opacity-50"
              >
                {t('common.actions.cancel')}
              </button>
              <button
                onClick={restore}
                disabled={busy}
                className="inline-flex items-center gap-2 px-4 py-2 bg-emerald-600 text-white rounded-lg hover:bg-emerald-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <RotateCcw className="w-4 h-4" />
                {t('losses.restore')}
              </button>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
};

export default LossEventsList;
