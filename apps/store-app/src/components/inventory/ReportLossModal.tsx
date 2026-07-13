/**
 * ReportLossModal (spec 019, US2) — "Report Spoilage" manual write-off
 * against one specific lot. Quantity-only by design (weight discrepancy on
 * weight-tracked lots is automatic shrinkage at bill close, never entered by
 * hand). Reason is fixed to 'spoiled' — there is no "Lost / Missing" reason
 * anywhere in the system, so there's no reason picker here.
 */
/* eslint-disable @typescript-eslint/no-explicit-any -- Lot rows arrive as Dexie-enriched any shapes from context (matches inventory component convention) */
import React, { useMemo, useState } from 'react';
import { AlertTriangle, PackageX } from 'lucide-react';
import { Modal } from '../common/Modal';
import { useOfflineData } from '../../contexts/OfflineDataContext';
import { useI18n } from '../../i18n';
import { useProductMultilingual } from '../../hooks/useMultilingual';

interface ReportLossModalProps {
  isOpen: boolean;
  onClose: () => void;
  /** The lot (inventory_items row, possibly enriched with batch fields). */
  item: any | null;
  showToast: (message: string, type?: 'success' | 'error') => void;
}

export const ReportLossModal: React.FC<ReportLossModalProps> = ({
  isOpen,
  onClose,
  item,
  showToast,
}) => {
  const { t } = useI18n();
  const { recordInventoryLoss, formatAmount, inventoryBills, products } = useOfflineData();
  const { getProductName } = useProductMultilingual();
  const product = useMemo(
    () => (products || []).find((p: any) => p.id === item?.product_id) ?? null,
    [products, item]
  );
  const [quantity, setQuantity] = useState<string>('');
  const [notes, setNotes] = useState('');
  const [busy, setBusy] = useState(false);

  const onHand = item?.quantity ?? 0;
  const qty = Math.floor(Number(quantity) || 0);

  const isCommission = useMemo(() => {
    if (!item?.batch_id) return false;
    const bill = (inventoryBills || []).find((b: any) => b.id === item.batch_id);
    return bill?.type === 'commission';
  }, [item, inventoryBills]);

  // Preview uses the same single cost basis as the operation: per-weight for
  // weight-tracked lots (units × nominal weight × price), per-unit otherwise.
  const lossValue = useMemo(() => {
    if (!item || qty <= 0) return 0;
    const unitCost = typeof item.price === 'number' ? item.price : 0;
    const raw = item.weight_tracked
      ? qty * (item.nominal_unit_weight ?? 0) * unitCost
      : qty * unitCost;
    return Math.round(raw * 100) / 100;
  }, [item, qty]);

  const validationError =
    qty <= 0
      ? t('losses.quantityRequired')
      : qty > onHand
        ? t('losses.cannotExceedOnHand')
        : null;

  const submit = async () => {
    if (!item || busy || validationError) return;
    setBusy(true);
    try {
      const result = await recordInventoryLoss({
        inventoryItemId: item.id,
        reason: 'spoiled',
        quantity: qty,
        notes: notes.trim() || undefined,
      });
      if (result.success) {
        showToast(t('losses.lossRecorded'), 'success');
        setQuantity('');
        setNotes('');
        onClose();
      } else {
        showToast(result.error || t('losses.lossRecordFailed'), 'error');
      }
    } finally {
      setBusy(false);
    }
  };

  if (!item) return null;

  return (
    <Modal isOpen={isOpen} onClose={onClose} title={t('losses.reportSpoilage')} maxWidth="md">
      <div className="space-y-4">
        {/* Lot summary */}
        <div className="bg-gray-50 dark:bg-slate-800 p-3 rounded-lg text-sm">
          <div className="font-medium text-gray-900 dark:text-slate-100">
            {getProductName(product as any) || item.sku || item.product_id}
          </div>
          <div className="text-gray-600 dark:text-slate-400 mt-1">
            {t('losses.onHand')}: <span className="font-semibold">{onHand} {item.unit || ''}</span>
            {item.weight_tracked && item.weight_remaining != null && (
              <span className="ms-3">
                {t('losses.remainingWeight')}: <span className="font-semibold">{item.weight_remaining} kg</span>
              </span>
            )}
          </div>
        </div>

        {/* Reason — fixed to Spoiled/wasted; there is no "Lost / Missing" reason. */}
        <div>
          <label className="block text-sm font-medium text-gray-700 dark:text-slate-300 mb-2">
            {t('losses.reason')}
          </label>
          <div className="flex items-center gap-2 px-3 py-2 rounded-lg border border-red-500 bg-red-50 dark:bg-red-900/30 text-red-700 dark:text-red-300 w-fit">
            <PackageX className="w-4 h-4" />
            {t('losses.reasons.spoiled')}
          </div>
        </div>

        {/* Quantity */}
        <div>
          <label className="block text-sm font-medium text-gray-700 dark:text-slate-300 mb-1">
            {t('losses.quantityLost')}
          </label>
          <input
            type="number"
            min={1}
            max={onHand}
            step={1}
            value={quantity}
            onChange={e => setQuantity(e.target.value)}
            className={`w-full px-3 py-2 border rounded-lg dark:bg-slate-800 dark:text-slate-100 ${
              quantity !== '' && validationError
                ? 'border-red-500'
                : 'border-gray-300 dark:border-slate-700'
            }`}
          />
          {quantity !== '' && validationError && (
            <p className="text-xs text-red-600 mt-1">{validationError}</p>
          )}
        </div>

        {/* Notes */}
        <div>
          <label className="block text-sm font-medium text-gray-700 dark:text-slate-300 mb-1">
            {t('losses.notes')}
          </label>
          <input
            type="text"
            value={notes}
            onChange={e => setNotes(e.target.value)}
            placeholder={t('losses.notesPlaceholder')}
            className="w-full px-3 py-2 border border-gray-300 dark:border-slate-700 rounded-lg dark:bg-slate-800 dark:text-slate-100"
          />
        </div>

        {/* Value preview / commission notice */}
        {qty > 0 && !validationError && (
          isCommission ? (
            <div className="flex items-start gap-2 bg-blue-50 dark:bg-blue-900/20 text-blue-700 dark:text-blue-300 p-3 rounded-lg text-sm">
              <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" />
              <span>{t('losses.commissionNotice')}</span>
            </div>
          ) : (
            <div className="bg-red-50 dark:bg-red-900/20 p-3 rounded-lg text-sm flex justify-between">
              <span className="text-red-700 dark:text-red-300">{t('losses.lossValue')}</span>
              <span className="font-semibold text-red-700 dark:text-red-300">
                {formatAmount(lossValue, item.currency)}
              </span>
            </div>
          )
        )}

        {/* Actions */}
        <div className="flex justify-end gap-2 pt-2 border-t border-gray-200 dark:border-slate-800">
          <button
            onClick={onClose}
            className="px-4 py-2 border border-gray-300 dark:border-slate-700 rounded-lg text-gray-700 dark:text-slate-300 hover:bg-gray-50 dark:hover:bg-slate-800 transition-colors"
          >
            {t('common.actions.cancel')}
          </button>
          <button
            onClick={submit}
            disabled={busy || !!validationError}
            className="px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {busy ? t('losses.recording') : t('losses.confirmLoss')}
          </button>
        </div>
      </div>
    </Modal>
  );
};

export default ReportLossModal;
