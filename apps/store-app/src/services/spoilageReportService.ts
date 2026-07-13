/**
 * spoilageReportService (spec 019, US5) — inventory loss/spoilage reporting
 * over a selectable period. Computed entirely client-side from IndexedDB
 * (CG-05); period bucketing uses getLocalDateString (CG-11). Only ACTIVE,
 * non-reversal loss rows count; commission memo losses are reported
 * separately and excluded from the owned expense totals (they are the
 * consignor's loss, FR-014). Reasons are shrinkage (automatic) and spoiled
 * (manual or bill-close reconciliation) — there is no separate "lost" reason.
 */

import { getDB } from '../lib/db';
import { getLocalDateString } from '../utils/dateUtils';
import type { InventoryLossEvent, InventoryLossReason } from '../types';

export interface SpoilageReportQuery {
  storeId: string;
  /** Inclusive local dates, YYYY-MM-DD. */
  from: string;
  to: string;
  branchId?: string | null;
}

export interface SpoilageReportTotals {
  /** Owned losses only (journal-backed). */
  totalValue: number;
  totalQuantity: number;
  totalWeight: number;
  /** Commission memo losses (no accounting impact). */
  commissionValue: number;
  byReason: Record<InventoryLossReason, { value: number; quantity: number; weight: number; count: number }>;
}

export interface SpoilageBreakdownRow {
  key: string; // product_id or batch_id
  value: number;
  quantity: number;
  weight: number;
  count: number;
}

export interface SpoilageReport {
  totals: SpoilageReportTotals;
  byProduct: SpoilageBreakdownRow[];
  byBill: SpoilageBreakdownRow[];
  events: InventoryLossEvent[];
}

function emptyReasonBuckets(): SpoilageReportTotals['byReason'] {
  return {
    shrinkage: { value: 0, quantity: 0, weight: 0, count: 0 },
    spoiled: { value: 0, quantity: 0, weight: 0, count: 0 },
  };
}

export async function getSpoilageReport(query: SpoilageReportQuery): Promise<SpoilageReport> {
  // Branch-scoped via the compound index when a branch is given; store-wide otherwise.
  const rows = (query.branchId
    ? await getDB().inventory_loss_events
        .where('[store_id+branch_id]')
        .equals([query.storeId, query.branchId])
        .toArray()
    : await getDB().inventory_loss_events
        .where('store_id')
        .equals(query.storeId)
        .toArray()) as InventoryLossEvent[];

  const inPeriod = rows.filter(e => {
    if (e._deleted) return false;
    // Reversal rows and reversed originals cancel out — exclude both so the
    // report reflects net real losses (SC-005 reconciles against 5950, which
    // nets the same way via the reversal journal).
    if (e.status !== 'active' || e.reversal_of_id) return false;
    const day = getLocalDateString(e.created_at);
    return day >= query.from && day <= query.to;
  });

  const totals: SpoilageReportTotals = {
    totalValue: 0,
    totalQuantity: 0,
    totalWeight: 0,
    commissionValue: 0,
    byReason: emptyReasonBuckets(),
  };
  const byProduct = new Map<string, SpoilageBreakdownRow>();
  const byBill = new Map<string, SpoilageBreakdownRow>();

  const bump = (map: Map<string, SpoilageBreakdownRow>, key: string, e: InventoryLossEvent) => {
    const row = map.get(key) ?? { key, value: 0, quantity: 0, weight: 0, count: 0 };
    if (!e.is_commission) row.value += e.loss_value;
    row.quantity += e.quantity || 0;
    row.weight += e.weight || 0;
    row.count += 1;
    map.set(key, row);
  };

  for (const e of inPeriod) {
    if (e.is_commission) {
      totals.commissionValue += e.loss_value;
    } else {
      totals.totalValue += e.loss_value;
      const bucket = totals.byReason[e.reason];
      bucket.value += e.loss_value;
      bucket.quantity += e.quantity || 0;
      bucket.weight += e.weight || 0;
      bucket.count += 1;
    }
    totals.totalQuantity += e.quantity || 0;
    totals.totalWeight += e.weight || 0;
    bump(byProduct, e.product_id, e);
    if (e.batch_id) bump(byBill, e.batch_id, e);
  }

  const round = (n: number) => Math.round(n * 100) / 100;
  totals.totalValue = round(totals.totalValue);
  totals.commissionValue = round(totals.commissionValue);
  (Object.keys(totals.byReason) as InventoryLossReason[]).forEach(r => {
    totals.byReason[r].value = round(totals.byReason[r].value);
  });

  const sortByValue = (a: SpoilageBreakdownRow, b: SpoilageBreakdownRow) => b.value - a.value || b.count - a.count;
  return {
    totals,
    byProduct: Array.from(byProduct.values()).map(r => ({ ...r, value: round(r.value) })).sort(sortByValue),
    byBill: Array.from(byBill.values()).map(r => ({ ...r, value: round(r.value) })).sort(sortByValue),
    events: inPeriod,
  };
}

export const spoilageReportService = { getSpoilageReport };
