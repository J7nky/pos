/**
 * Inventory loss & shrinkage operations (spec 019).
 *
 * One mechanism, two loss reasons, per-lot (NO FIFO — see
 * business-model-per-bill-stock):
 *   shrinkage — automatic residual-weight loss recognized at bill close
 *               (weight-tracked lots; dehydration etc.). No user entry.
 *   spoiled   — every manual write-off of counted units, whether reported
 *               ad-hoc via "Report Spoilage" (`recordInventoryLoss`) or
 *               auto-classified for unaccounted units at bill-close
 *               reconciliation (`reconcileAndCloseLosses`/`CloseClassification`).
 *               There is no separate "lost/missing" reason — every gap is
 *               recorded as spoilage.
 *
 * Accounting (CG-04/CG-08): owned-lot losses post Dr 5950 / Cr 1300 via
 * `transactionService.createTransaction` (INVENTORY_LOSS); reversals post the
 * opposite pair via INVENTORY_LOSS_REVERSAL. Commission-lot losses are
 * memo-only (`transaction_id` null) — the consignor's loss; the COGS=0 model
 * never put a 1300 asset on our books (T001 finding, research.md).
 *
 * Double-count guard (clarification Q3): a whole-unit loss on a weight-tracked
 * lot also consumes `quantity × nominal_unit_weight` from `weight_remaining`,
 * so the same weight can never be booked again as close-time shrinkage. All
 * values come from a single cost basis — per-weight for weight-tracked lots,
 * per-unit otherwise.
 *
 * Sync (CG-03): rows are written `_synced:false` only; the branch event
 * (`inventory_loss_posted`) is emitted by syncUpload AFTER upload confirmation,
 * never from here.
 */
/* eslint-disable @typescript-eslint/no-explicit-any -- Lot/bill rows mirror Dexie production shapes; typed narrowing happens at the contract boundary */

import { getDB, createId } from '../../../lib/db';
import { transactionService } from '../../../services/transactionService';
import type { TransactionContext } from '../../../services/transactionService';
import { TRANSACTION_CATEGORIES } from '../../../constants/transactionCategories';
import { RolePermissionService } from '../../../services/rolePermissionService';
import { auditService } from '../../../services/auditService';
import { getTranslatedString } from '../../../utils/multilingual';
import type { MultilingualString } from '../../../utils/multilingual';
import type { CurrencyCode } from '@pos-platform/shared';
import type { InventoryLossEvent, InventoryLossReason } from '../../../types';
import type { RefreshScope, LotCloseReconciliation } from '../offlineDataContextContract';
import { withUndoOperation } from './withUndoOperation';
import type { UndoAction } from '../../../services/changeTracker';

// Residual weights below this are float noise, not shrinkage worth booking.
const WEIGHT_EPSILON = 1e-6;

export interface LossOperationDeps {
  storeId: string;
  currentBranchId: string | null;
  userProfileId: string | null;
  pushUndo: (action: UndoAction) => void;
  refreshData: (scope?: RefreshScope) => Promise<void>;
  upsertTransactions: (rows: any[]) => void;
  upsertLossEvents: (rows: InventoryLossEvent[]) => void;
  updateUnsyncedCount: (optimisticDelta?: number) => Promise<void>;
  debouncedSync: () => void;
  i18n: { en: any; ar: any; fr: any };
  language?: string;
}

export interface RecordLossParams {
  inventoryItemId: string;
  /** The only manual reason: spoilage. There is no "lost/missing" reason. */
  reason: 'spoiled';
  quantity: number;
  notes?: string;
}

export interface RecordLossResult {
  success: boolean;
  lossEventId?: string;
  transactionId?: string;
  error?: string;
}

export interface CloseClassification {
  inventoryItemId: string;
  /** Every unaccounted unit for this lot, recorded as spoiled. Must equal the lot's unaccounted quantity. */
  spoiledUnits: number;
}

export interface ReconcileResult {
  success: boolean;
  lossEventIds: string[];
  /** Lots whose sold weight exceeded received weight (negative residual) — not booked, needs review. */
  anomalies?: Array<{ inventoryItemId: string; residualWeight: number }>;
  error?: string;
}

// ─── shared internals ────────────────────────────────────────────────────────

interface LotContext {
  lot: any;
  bill: any | null;
  isCommission: boolean;
}

async function loadLotContext(inventoryItemId: string): Promise<LotContext | null> {
  const lot = await getDB().inventory_items.get(inventoryItemId);
  if (!lot || (lot as any)._deleted) return null;
  const bill = lot.batch_id ? await getDB().inventory_bills.get(lot.batch_id) : null;
  return { lot, bill: bill ?? null, isCommission: bill?.type === 'commission' };
}

/** Single cost basis (Q3): per-weight for weight-tracked lots, per-unit otherwise. */
function computeLossValue(lot: any, portion: { quantity: number; weight: number | null }): number {
  const unitCost = typeof lot.price === 'number' ? lot.price : 0;
  const raw = lot.weight_tracked
    ? (portion.weight ?? 0) * unitCost
    : portion.quantity * unitCost;
  return Math.round(raw * 100) / 100;
}

/** Localized "N items spoiled" / "N items spoiled restored" audit summary. */
function lossAuditSummary(
  i18n: any,
  lang: string | undefined,
  key: 'auditSpoiled' | 'auditRestored',
  count: number
): string {
  const dict = lang === 'ar' ? i18n?.ar : lang === 'fr' ? i18n?.fr : i18n?.en;
  const template: string | undefined = dict?.losses?.[key];
  const fallback = key === 'auditSpoiled' ? `${count} items spoiled` : `${count} items spoiled restored`;
  return template ? template.replace('{{count}}', String(count)) : fallback;
}

/** Multilingual transaction/journal description, product name interpolated per language. */
function lossDescription(
  deps: LossOperationDeps,
  reason: InventoryLossReason,
  productName: unknown,
  amountText: string
): MultilingualString {
  const build = (dict: any, lang: 'en' | 'ar' | 'fr'): string => {
    const template: string | undefined = dict?.losses?.lossDescription;
    const label = dict?.losses?.reasons?.[reason] ?? reason;
    const name = getTranslatedString(productName as any, lang) || '';
    if (template) {
      return template
        .replace('{{reason}}', label)
        .replace('{{amount}}', amountText)
        .replace('{{product}}', name);
    }
    return `Inventory loss (${label}): ${amountText} ${name}`.trim();
  };
  return {
    en: build(deps.i18n?.en, 'en'),
    ar: build(deps.i18n?.ar, 'ar'),
    fr: build(deps.i18n?.fr, 'fr'),
  } as MultilingualString;
}

function transactionContext(deps: LossOperationDeps): TransactionContext {
  return {
    userId: deps.userProfileId || '',
    storeId: deps.storeId,
    branchId: deps.currentBranchId || '',
    module: 'inventory',
    source: 'web',
  };
}

/**
 * Core writer: decrements the SPECIFIC lot (quantity and, for weight-tracked
 * lots, weight_remaining) and inserts the loss event in ONE Dexie transaction;
 * then posts the owned-lot journal via transactionService and stamps
 * `transaction_id` back. If the journal fails, the local writes are rolled
 * back so stock and ledger never diverge.
 */
async function writeLossCore(
  deps: LossOperationDeps,
  ctx: LotContext,
  params: {
    reason: InventoryLossReason;
    source: 'auto_close' | 'manual';
    quantity: number;
    weight: number | null;
    notes?: string | null;
  }
): Promise<{ event: InventoryLossEvent; transactionId?: string }> {
  const { lot, isCommission } = ctx;
  const now = new Date().toISOString();
  const lossValue = computeLossValue(lot, { quantity: params.quantity, weight: params.weight });
  const unitCost = typeof lot.price === 'number' ? lot.price : 0;
  const currency = (lot.currency as CurrencyCode) || 'USD';

  const event: InventoryLossEvent = {
    id: createId(),
    store_id: deps.storeId,
    branch_id: deps.currentBranchId || lot.branch_id,
    inventory_item_id: lot.id,
    product_id: lot.product_id,
    batch_id: lot.batch_id ?? null,
    reason: params.reason,
    source: params.source,
    quantity: params.quantity,
    weight: params.weight,
    unit_cost: unitCost,
    currency,
    loss_value: lossValue,
    is_commission: isCommission,
    transaction_id: null,
    status: 'active',
    reversal_of_id: null,
    reversed_by_id: null,
    notes: params.notes ?? null,
    created_by: deps.userProfileId || '',
    created_at: now,
    updated_at: now,
    _synced: false,
    _deleted: false,
  };

  const previousQuantity = lot.quantity;
  const previousWeightRemaining = lot.weight_remaining ?? null;

  // Atomic: stock decrement + loss row land (or fail) together.
  await getDB().transaction('rw', [getDB().inventory_items, getDB().inventory_loss_events], async () => {
    const lotUpdates: Record<string, unknown> = {
      quantity: Math.max(0, previousQuantity - params.quantity),
      updated_at: now,
      _synced: false,
    };
    if (lot.weight_tracked && params.weight != null) {
      lotUpdates.weight_remaining = Math.max(0, (previousWeightRemaining ?? 0) - params.weight);
    }
    await getDB().inventory_items.update(lot.id, lotUpdates);
    await getDB().inventory_loss_events.add(event as any);
  });

  // Owned lots post the write-off; commission lots are memo-only (R6).
  if (!isCommission && lossValue > 0) {
    const product = await getDB().products.get(lot.product_id);
    const amountText = lot.weight_tracked
      ? `${params.weight ?? 0} ${lot.unit || 'kg'}`
      : `${params.quantity} ${lot.unit || ''}`.trim();
    const result = await transactionService.createTransaction({
      category: TRANSACTION_CATEGORIES.INVENTORY_LOSS,
      amount: lossValue,
      currency,
      description: lossDescription(deps, params.reason, product?.name, amountText),
      context: transactionContext(deps),
      metadata: {
        lossEventId: event.id,
        inventoryItemId: lot.id,
        batchId: lot.batch_id ?? null,
        reason: params.reason,
        source: params.source,
      },
      // Losses never touch cash — no drawer session/impact work (perf: see
      // slow-payment fix, skipCashDrawerImpact avoids the O(history) 1100 scan).
      updateBalances: false,
      updateCashDrawer: false,
      skipCashDrawerImpact: true,
      createAuditLog: false, // we write the semantic audit row ourselves
      _synced: false,
    });

    if (!result.success || !result.transactionId) {
      // Roll back the local writes — stock and books must not diverge.
      await getDB().transaction('rw', [getDB().inventory_items, getDB().inventory_loss_events], async () => {
        const revert: Record<string, unknown> = {
          quantity: previousQuantity,
          updated_at: new Date().toISOString(),
          _synced: false,
        };
        if (lot.weight_tracked && params.weight != null) {
          revert.weight_remaining = previousWeightRemaining;
        }
        await getDB().inventory_items.update(lot.id, revert);
        await getDB().inventory_loss_events.delete(event.id);
      });
      throw new Error(result.error || 'Loss journal posting failed');
    }

    await getDB().inventory_loss_events.update(event.id, {
      transaction_id: result.transactionId,
      _synced: false,
    });
    event.transaction_id = result.transactionId;
    return { event, transactionId: result.transactionId };
  }

  return { event };
}

/** Shared post-write sequence (perf pattern from paymentOperations). */
async function postWrite(
  deps: LossOperationDeps,
  events: InventoryLossEvent[],
  transactionIds: string[],
  unsyncedDelta: number
): Promise<void> {
  try {
    deps.upsertLossEvents(events);
  } catch (e) {
    console.warn('Loss event upsert failed (non-critical):', e);
  }
  try {
    if (transactionIds.length > 0) {
      const rows = await getDB().transactions.where('id').anyOf(transactionIds).toArray();
      if (rows.length) deps.upsertTransactions(rows);
    }
  } catch (e) {
    console.warn('Transaction upsert failed (non-critical):', e);
  }
  // The lot's on-hand quantity/weight changed — reload only the inventory domain.
  void deps.refreshData(['inventory']).catch(e =>
    console.warn('Inventory refresh failed (non-critical):', e)
  );
  void deps.updateUnsyncedCount(unsyncedDelta).catch(e =>
    console.warn('Unsynced count refresh failed (non-critical):', e)
  );
  try {
    deps.debouncedSync();
  } catch (e) {
    console.warn('Debounced sync failed (non-critical):', e);
  }
}

// ─── recordInventoryLoss (US2 — manual Spoiled via "Report Spoilage") ──────

export async function recordInventoryLoss(
  deps: LossOperationDeps,
  params: RecordLossParams
): Promise<RecordLossResult> {
  try {
    if (!deps.userProfileId) return { success: false, error: 'No active user' };
    await RolePermissionService.checkPermission(deps.userProfileId, 'record_inventory_loss');

    // The only manual reason is spoilage — there is no "lost/missing" reason.
    if (params.reason !== 'spoiled') {
      return { success: false, error: 'Invalid loss reason' };
    }
    if (!Number.isFinite(params.quantity) || params.quantity <= 0) {
      return { success: false, error: 'Loss quantity must be greater than zero' };
    }

    const ctx = await loadLotContext(params.inventoryItemId);
    if (!ctx) return { success: false, error: 'Inventory lot not found' };
    if (params.quantity > ctx.lot.quantity) {
      // FR-010: cannot lose more than is on hand.
      return {
        success: false,
        error: `Cannot record a loss of ${params.quantity} — only ${ctx.lot.quantity} on hand`,
      };
    }

    // Manual losses are quantity-only; on weight lots each unit takes its
    // proportional (nominal) weight with it so close-time shrinkage can't
    // re-count it (FR-004a / FR-009).
    const weightPortion = ctx.lot.weight_tracked
      ? Math.min(
          params.quantity * (ctx.lot.nominal_unit_weight ?? 0),
          ctx.lot.weight_remaining ?? 0
        )
      : null;

    // Wrap the write so the change tracker captures every row touched (lot
    // decrement, loss event, owned-lot journal) and surfaces an Undo toast —
    // same automatic-undo pattern as payments/sales.
    let written: { event: InventoryLossEvent; transactionId?: string } | null = null;
    await withUndoOperation('operation', deps.pushUndo, async () => {
      written = await writeLossCore(deps, ctx, {
        reason: params.reason,
        source: 'manual',
        quantity: params.quantity,
        weight: weightPortion,
        notes: params.notes ?? null,
      });
    });
    const { event, transactionId } = written!;

    // Semantic audit row (FR-022): manual losses are audited; auto shrinkage
    // is covered by the existing bill-close audit.
    await auditService.record({
      storeId: deps.storeId,
      branchId: deps.currentBranchId,
      changedBy: deps.userProfileId,
      entityType: 'inventory_loss',
      entityId: event.id,
      action: 'create',
      changeReason: lossAuditSummary(deps.i18n, deps.language, 'auditSpoiled', params.quantity),
    });

    await postWrite(deps, [event], transactionId ? [transactionId] : [], transactionId ? 3 : 2);
    return { success: true, lossEventId: event.id, transactionId };
  } catch (error) {
    console.error('recordInventoryLoss failed:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Recording the loss failed',
    };
  }
}

// ─── getLotCloseReconciliation (US1/US3 — close preview, FR-007/FR-011) ─────

export async function getLotCloseReconciliation(
  deps: LossOperationDeps,
  billId: string
): Promise<LotCloseReconciliation[]> {
  const db = getDB();
  const bill = await db.inventory_bills.get(billId);
  const isCommission = bill?.type === 'commission';
  const lots = (await db.inventory_items.where('batch_id').equals(billId).toArray()).filter(
    (l: any) => !l._deleted
  );
  if (lots.length === 0) return [];

  const lotIds = lots.map((l: any) => l.id);
  const lossRows = await db.inventory_loss_events
    .where('inventory_item_id')
    .anyOf(lotIds)
    .toArray();
  const activeLossUnits = new Map<string, number>();
  for (const row of lossRows as any[]) {
    if (row.status !== 'active' || row._deleted) continue;
    activeLossUnits.set(
      row.inventory_item_id,
      (activeLossUnits.get(row.inventory_item_id) ?? 0) + (row.quantity || 0)
    );
  }

  const productIds = Array.from(new Set(lots.map((l: any) => l.product_id)));
  const products = await db.products.where('id').anyOf(productIds).toArray();
  const productById = new Map(products.map((p: any) => [p.id, p]));

  return lots.map((lot: any) => {
    const recordedLossUnits = activeLossUnits.get(lot.id) ?? 0;
    // Every decrement path (sale, loss) updates `quantity`, so current on-hand
    // IS the unaccounted remainder — no bill_line_items scan needed.
    const unaccountedUnits = lot.quantity;
    const soldQuantity = Math.max(
      0,
      (lot.received_quantity ?? 0) - unaccountedUnits - recordedLossUnits
    );
    const unitCost = typeof lot.price === 'number' ? lot.price : 0;

    let residualShrinkageWeight: number | null = null;
    let estimatedShrinkageValue: number | null = null;
    if (lot.weight_tracked) {
      // Projection: what auto-books once all unaccounted units are classified
      // (each consuming its nominal weight).
      const projected =
        (lot.weight_remaining ?? 0) - unaccountedUnits * (lot.nominal_unit_weight ?? 0);
      residualShrinkageWeight = Math.round(Math.max(0, projected) * 1000) / 1000;
      estimatedShrinkageValue = Math.round(residualShrinkageWeight * unitCost * 100) / 100;
    }

    return {
      inventoryItemId: lot.id,
      productId: lot.product_id,
      productName: productById.get(lot.product_id)?.name ?? null,
      weightTracked: lot.weight_tracked === true,
      receivedQuantity: lot.received_quantity ?? 0,
      soldQuantity,
      alreadyRecordedLossUnits: recordedLossUnits,
      unaccountedUnits,
      residualShrinkageWeight,
      estimatedShrinkageValue,
      nominalUnitWeight: lot.weight_tracked ? (lot.nominal_unit_weight ?? null) : null,
      unitCost,
      currency: lot.currency || bill?.currency || 'USD',
      isCommission,
    };
  });
}

// ─── reconcileAndCloseLosses (US1 + US3 — FR-005/FR-011/FR-012) ─────────────

export async function reconcileAndCloseLosses(
  deps: LossOperationDeps,
  billId: string,
  classifications: CloseClassification[]
): Promise<ReconcileResult> {
  try {
    const db = getDB();
    const bill = await db.inventory_bills.get(billId);
    if (!bill) return { success: false, lossEventIds: [], error: 'Bill not found' };

    const lots = (await db.inventory_items.where('batch_id').equals(billId).toArray()).filter(
      (l: any) => !l._deleted
    );
    const classByLot = new Map(classifications.map(c => [c.inventoryItemId, c]));

    // ── validation gate (FR-011): every lot's unaccounted units must be fully
    // accounted for as spoiled before anything is written; the close is
    // blocked otherwise. There is only one classification now, so this is a
    // completeness check (spoiledUnits must equal the unaccounted amount),
    // not a choice between reasons.
    for (const lot of lots as any[]) {
      const unaccounted = lot.quantity;
      const cls = classByLot.get(lot.id);
      const spoiledUnits = cls?.spoiledUnits ?? 0;
      if (spoiledUnits < 0 || !Number.isFinite(spoiledUnits)) {
        return { success: false, lossEventIds: [], error: 'Invalid classification quantities' };
      }
      if (spoiledUnits !== unaccounted) {
        return {
          success: false,
          lossEventIds: [],
          error: `Lot ${lot.sku || lot.id.slice(0, 8)}: ${unaccounted} unaccounted unit(s) must be recorded as spoiled before closing`,
        };
      }
    }
    for (const cls of classifications) {
      if (!lots.some((l: any) => l.id === cls.inventoryItemId)) {
        return { success: false, lossEventIds: [], error: 'Classification references an unknown lot' };
      }
    }

    // Classifying units requires the loss permission; a pure-shrinkage close
    // (no unaccounted units anywhere) rides the closer's authority.
    const hasUnits = classifications.some(c => c.spoiledUnits > 0);
    if (hasUnits) {
      if (!deps.userProfileId) return { success: false, lossEventIds: [], error: 'No active user' };
      await RolePermissionService.checkPermission(deps.userProfileId, 'record_inventory_loss');
    }

    const events: InventoryLossEvent[] = [];
    const transactionIds: string[] = [];
    const anomalies: Array<{ inventoryItemId: string; residualWeight: number }> = [];

    // ── 1. classified (spoiled) unit losses (US3; on weight lots each unit
    // consumes its nominal weight — FR-012 precedes the shrinkage of FR-005).
    for (const lot of lots as any[]) {
      const cls = classByLot.get(lot.id);
      const units = cls?.spoiledUnits ?? 0;
      if (units <= 0) continue;
      const ctx = await loadLotContext(lot.id);
      if (!ctx) continue;
      const weightPortion = ctx.lot.weight_tracked
        ? Math.min(units * (ctx.lot.nominal_unit_weight ?? 0), ctx.lot.weight_remaining ?? 0)
        : null;
      const { event, transactionId } = await writeLossCore(deps, ctx, {
        reason: 'spoiled',
        source: 'manual',
        quantity: units,
        weight: weightPortion,
        notes: 'close-reconciliation',
      });
      events.push(event);
      if (transactionId) transactionIds.push(transactionId);
    }

    // ── 2. automatic residual-weight shrinkage per weight-tracked lot (US1).
    for (const lot of lots as any[]) {
      if (!lot.weight_tracked) continue;
      const ctx = await loadLotContext(lot.id);
      if (!ctx) continue;
      const residual = ctx.lot.weight_remaining ?? 0;
      if (residual < -WEIGHT_EPSILON) {
        // Over-weighing anomaly (edge case): never book a negative loss.
        anomalies.push({ inventoryItemId: lot.id, residualWeight: residual });
        await db.inventory_items.update(lot.id, {
          weight_remaining: 0,
          updated_at: new Date().toISOString(),
          _synced: false,
        });
        console.warn(
          `[Losses] Lot ${lot.id}: sold weight exceeds received (residual ${residual}). Flagged, not booked.`
        );
        continue;
      }
      if (residual <= WEIGHT_EPSILON) continue; // fully sold — nothing to shrink
      const { event, transactionId } = await writeLossCore(deps, ctx, {
        reason: 'shrinkage',
        source: 'auto_close',
        quantity: 0,
        weight: Math.round(residual * 1000) / 1000,
        notes: null,
      });
      events.push(event);
      if (transactionId) transactionIds.push(transactionId);
    }

    await postWrite(
      deps,
      events,
      transactionIds,
      events.length + transactionIds.length * 2 // event rows + txn + journal rows
    );
    return {
      success: true,
      lossEventIds: events.map(e => e.id),
      anomalies: anomalies.length ? anomalies : undefined,
    };
  } catch (error) {
    console.error('reconcileAndCloseLosses failed:', error);
    return {
      success: false,
      lossEventIds: [],
      error: error instanceof Error ? error.message : 'Close reconciliation failed',
    };
  }
}

// ─── reverseInventoryLoss (US4 — FR-017/FR-018) ─────────────────────────────

export async function reverseInventoryLoss(
  deps: LossOperationDeps,
  params: { lossEventId: string }
): Promise<RecordLossResult> {
  try {
    if (!deps.userProfileId) return { success: false, error: 'No active user' };
    await RolePermissionService.checkPermission(deps.userProfileId, 'reverse_inventory_loss');

    const db = getDB();
    const original = (await db.inventory_loss_events.get(params.lossEventId)) as
      | InventoryLossEvent
      | undefined;
    if (!original || original._deleted) return { success: false, error: 'Loss record not found' };
    if (original.status === 'reversed') {
      // FR-018: no double reversal.
      return { success: false, error: 'This loss has already been reversed' };
    }
    if (original.reversal_of_id) {
      return { success: false, error: 'A reversal record cannot itself be reversed' };
    }

    const lot = await db.inventory_items.get(original.inventory_item_id);
    if (!lot) return { success: false, error: 'The lot this loss belongs to no longer exists' };

    const now = new Date().toISOString();
    const reversal: InventoryLossEvent = {
      ...original,
      id: createId(),
      transaction_id: null,
      status: 'active',
      reversal_of_id: original.id,
      reversed_by_id: null,
      notes: null,
      created_by: deps.userProfileId,
      created_at: now,
      updated_at: now,
      _synced: false,
      _deleted: false,
    };

    // Wrap the restore writes so the change tracker captures the lot restore,
    // the reversal row, the original's status flip and the offsetting journal,
    // then surfaces an Undo toast — same automatic-undo pattern as every other
    // action. On journal failure we roll the DB back and throw so the wrapper
    // discards the (now-empty) undo and the outer catch returns the error.
    let reversalTransactionId: string | undefined;
    await withUndoOperation('operation', deps.pushUndo, async () => {
      // Atomic: restore the lot + link both rows (FR-017: original kept, flagged).
      await db.transaction('rw', [db.inventory_items, db.inventory_loss_events], async () => {
        const lotUpdates: Record<string, unknown> = {
          quantity: (lot.quantity ?? 0) + (original.quantity || 0),
          updated_at: now,
          _synced: false,
        };
        if ((lot as any).weight_tracked && original.weight != null) {
          lotUpdates.weight_remaining = ((lot as any).weight_remaining ?? 0) + original.weight;
        }
        await db.inventory_items.update(lot.id, lotUpdates);
        await db.inventory_loss_events.add(reversal as any);
        await db.inventory_loss_events.update(original.id, {
          status: 'reversed',
          reversed_by_id: reversal.id,
          updated_at: now,
          _synced: false,
        });
      });

      // Owned losses posted a journal — post the opposite pair (Dr 1300 / Cr 5950).
      if (!original.is_commission && original.transaction_id && original.loss_value > 0) {
        const product = await db.products.get(original.product_id);
        const amountText = original.weight != null && original.weight > 0
          ? `${original.weight} ${(lot as any).unit || 'kg'}`
          : `${original.quantity} ${(lot as any).unit || ''}`.trim();
        const result = await transactionService.createTransaction({
          category: TRANSACTION_CATEGORIES.INVENTORY_LOSS_REVERSAL,
          amount: original.loss_value,
          currency: original.currency,
          description: lossDescription(deps, original.reason, product?.name, amountText),
          context: transactionContext(deps),
          metadata: {
            lossEventId: reversal.id,
            reversalOfLossEventId: original.id,
            inventoryItemId: original.inventory_item_id,
            reason: original.reason,
          },
          is_reversal: true,
          reversal_of_transaction_id: original.transaction_id,
          updateBalances: false,
          updateCashDrawer: false,
          skipCashDrawerImpact: true,
          createAuditLog: false,
          _synced: false,
        });
        if (!result.success || !result.transactionId) {
          // Roll back: un-restore stock, drop the reversal row, un-flip the original.
          await db.transaction('rw', [db.inventory_items, db.inventory_loss_events], async () => {
            const revert: Record<string, unknown> = {
              quantity: lot.quantity,
              updated_at: new Date().toISOString(),
              _synced: false,
            };
            if ((lot as any).weight_tracked && original.weight != null) {
              revert.weight_remaining = (lot as any).weight_remaining ?? 0;
            }
            await db.inventory_items.update(lot.id, revert);
            await db.inventory_loss_events.delete(reversal.id);
            await db.inventory_loss_events.update(original.id, {
              status: 'active',
              reversed_by_id: null,
              _synced: false,
            });
          });
          throw new Error(result.error || 'Reversal journal posting failed');
        }
        reversalTransactionId = result.transactionId;
        await db.inventory_loss_events.update(reversal.id, {
          transaction_id: reversalTransactionId,
          _synced: false,
        });
        reversal.transaction_id = reversalTransactionId;
      }
    });

    // Audit the reversal (FR-022) as a void of the original loss.
    await auditService.record({
      storeId: deps.storeId,
      branchId: deps.currentBranchId,
      changedBy: deps.userProfileId,
      entityType: 'inventory_loss',
      entityId: original.id,
      action: 'void',
      changeReason: lossAuditSummary(deps.i18n, deps.language, 'auditRestored', original.quantity || original.weight || 0),
    });

    const updatedOriginal = (await db.inventory_loss_events.get(original.id)) as InventoryLossEvent;
    await postWrite(
      deps,
      [updatedOriginal, reversal],
      reversalTransactionId ? [reversalTransactionId] : [],
      reversalTransactionId ? 4 : 3
    );
    return { success: true, lossEventId: reversal.id, transactionId: reversalTransactionId };
  } catch (error) {
    console.error('reverseInventoryLoss failed:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Reversing the loss failed',
    };
  }
}
