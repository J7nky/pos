/**
 * lossOperations tests (spec 019 — CG-12).
 *
 * Covers the primary success + failure paths of all four operations:
 *  - recordInventoryLoss (manual spoiled-only; rejects "lost"; over-quantity
 *    rejection; commission memo; weight-lot proportional-weight removal)
 *  - reconcileAndCloseLosses (blocked unaccounted gap; spoiled classification;
 *    automatic residual shrinkage; fully-sold no-op; negative-residual anomaly;
 *    the "owned lot zeroes" P&L invariant)
 *  - reverseInventoryLoss (restore + reversal journal + lineage; double
 *    reversal rejected; commission memo reversal)
 */
/* eslint-disable @typescript-eslint/no-explicit-any -- In-memory Dexie fake mirrors production row shapes */
import { describe, it, expect, vi, beforeEach } from 'vitest';

// ─── in-memory Dexie fake ────────────────────────────────────────────────────

type Row = Record<string, any>;

function makeTable(initial: Row[] = []) {
  const rows = new Map<string, Row>(initial.map(r => [r.id, { ...r }]));
  return {
    rows,
    get: vi.fn(async (id: string) => (rows.has(id) ? { ...rows.get(id)! } : undefined)),
    add: vi.fn(async (row: Row) => {
      rows.set(row.id, { ...row });
      return row.id;
    }),
    update: vi.fn(async (id: string, updates: Row) => {
      const existing = rows.get(id);
      if (!existing) return 0;
      rows.set(id, { ...existing, ...updates });
      return 1;
    }),
    delete: vi.fn(async (id: string) => {
      rows.delete(id);
    }),
    where: vi.fn((field: string) => ({
      equals: (value: any) => ({
        toArray: async () => Array.from(rows.values()).filter(r => r[field] === value).map(r => ({ ...r })),
      }),
      anyOf: (values: any[]) => ({
        toArray: async () => Array.from(rows.values()).filter(r => values.includes(r[field])).map(r => ({ ...r })),
      }),
    })),
  };
}

const db: any = {};

function resetDb(seed: {
  inventory_items?: Row[];
  inventory_bills?: Row[];
  inventory_loss_events?: Row[];
  products?: Row[];
  transactions?: Row[];
} = {}) {
  db.inventory_items = makeTable(seed.inventory_items);
  db.inventory_bills = makeTable(seed.inventory_bills);
  db.inventory_loss_events = makeTable(seed.inventory_loss_events);
  db.products = makeTable(seed.products);
  db.transactions = makeTable(seed.transactions);
  db.transaction = vi.fn(async (_mode: string, _tables: any[], fn: () => Promise<void>) => fn());
}

let idCounter = 0;

vi.mock('../../../../lib/db', () => ({
  getDB: () => db,
  createId: () => `gen-${++idCounter}`,
}));

const createTransactionMock = vi.fn();
vi.mock('../../../../services/transactionService', () => ({
  transactionService: {
    createTransaction: (...args: any[]) => createTransactionMock(...args),
  },
}));

const checkPermissionMock = vi.fn();
vi.mock('../../../../services/rolePermissionService', () => ({
  RolePermissionService: {
    checkPermission: (...args: any[]) => checkPermissionMock(...args),
  },
}));

const auditRecordMock = vi.fn();
vi.mock('../../../../services/auditService', () => ({
  auditService: { record: (...args: any[]) => auditRecordMock(...args) },
}));

import {
  recordInventoryLoss,
  reverseInventoryLoss,
  reconcileAndCloseLosses,
  getLotCloseReconciliation,
  type LossOperationDeps,
} from '../lossOperations';
import { TRANSACTION_CATEGORIES } from '../../../../constants/transactionCategories';

// ─── fixtures ────────────────────────────────────────────────────────────────

const deps: LossOperationDeps = {
  storeId: 'store-1',
  currentBranchId: 'branch-1',
  userProfileId: 'user-1',
  refreshData: vi.fn().mockResolvedValue(undefined),
  upsertTransactions: vi.fn(),
  upsertLossEvents: vi.fn(),
  updateUnsyncedCount: vi.fn().mockResolvedValue(undefined),
  debouncedSync: vi.fn(),
  i18n: { en: {}, ar: {}, fr: {} },
  language: 'en',
};

/** Owned (cash) weight-tracked lot: 10 crates ≈ 100 kg at $2/kg → $200 received value. */
const weightLot: Row = {
  id: 'lot-w', store_id: 'store-1', branch_id: 'branch-1', product_id: 'prod-1',
  batch_id: 'bill-cash', quantity: 10, received_quantity: 10,
  weight: 100, weight_tracked: true, weight_remaining: 100, nominal_unit_weight: 10,
  price: 2, currency: 'USD', unit: 'kg', created_at: '2026-07-01T00:00:00Z',
};

/** Owned (cash) count-only lot: 20 boxes at $5/box. */
const countLot: Row = {
  id: 'lot-c', store_id: 'store-1', branch_id: 'branch-1', product_id: 'prod-2',
  batch_id: 'bill-cash', quantity: 20, received_quantity: 20,
  weight: null, weight_tracked: false, weight_remaining: null, nominal_unit_weight: null,
  price: 5, currency: 'USD', unit: 'box', created_at: '2026-07-01T00:00:00Z',
};

/** Commission weight lot (consignment — memo-only losses). */
const commissionLot: Row = {
  ...weightLot, id: 'lot-comm', batch_id: 'bill-comm',
};

const bills: Row[] = [
  { id: 'bill-cash', store_id: 'store-1', type: 'cash', currency: 'USD' },
  { id: 'bill-comm', store_id: 'store-1', type: 'commission', currency: 'USD' },
];

const products: Row[] = [
  { id: 'prod-1', name: { en: 'Tomatoes', ar: 'طماطم', fr: 'Tomates' } },
  { id: 'prod-2', name: { en: 'Lettuce', ar: 'خس', fr: 'Laitue' } },
];

beforeEach(() => {
  vi.clearAllMocks();
  idCounter = 0;
  checkPermissionMock.mockResolvedValue(undefined);
  auditRecordMock.mockResolvedValue(undefined);
  let txnCounter = 0;
  createTransactionMock.mockImplementation(async () => ({
    success: true,
    transactionId: `txn-${++txnCounter}`,
  }));
  resetDb({
    inventory_items: [weightLot, countLot, commissionLot],
    inventory_bills: bills,
    products,
  });
});

// ─── recordInventoryLoss ─────────────────────────────────────────────────────

describe('recordInventoryLoss (manual spoiled-only)', () => {
  it('records a spoiled loss on an owned count lot: decrements on-hand, posts Dr 5950/Cr 1300, audits', async () => {
    const result = await recordInventoryLoss(deps, {
      inventoryItemId: 'lot-c', reason: 'spoiled', quantity: 3,
    });
    expect(result.success).toBe(true);

    const lot = db.inventory_items.rows.get('lot-c');
    expect(lot.quantity).toBe(17);

    const event = db.inventory_loss_events.rows.get(result.lossEventId);
    expect(event).toMatchObject({
      reason: 'spoiled', source: 'manual', quantity: 3,
      loss_value: 15, // 3 × $5, single per-unit cost basis
      is_commission: false, status: 'active', _synced: false,
    });
    expect(event.transaction_id).toBe(result.transactionId);

    expect(createTransactionMock).toHaveBeenCalledTimes(1);
    const params = createTransactionMock.mock.calls[0][0];
    expect(params.category).toBe(TRANSACTION_CATEGORIES.INVENTORY_LOSS);
    expect(params.amount).toBe(15);
    expect(params.skipCashDrawerImpact).toBe(true);
    expect(params.updateCashDrawer).toBe(false);

    expect(auditRecordMock).toHaveBeenCalledTimes(1);
    expect(auditRecordMock.mock.calls[0][0]).toMatchObject({
      entityType: 'inventory_loss', action: 'create',
    });
    expect(deps.upsertLossEvents).toHaveBeenCalled();
    expect(deps.debouncedSync).toHaveBeenCalled();
  });

  it('rejects a loss greater than on-hand (FR-010) without writing anything', async () => {
    const result = await recordInventoryLoss(deps, {
      inventoryItemId: 'lot-c', reason: 'spoiled', quantity: 25,
    });
    expect(result.success).toBe(false);
    expect(db.inventory_items.rows.get('lot-c').quantity).toBe(20);
    expect(db.inventory_loss_events.rows.size).toBe(0);
    expect(createTransactionMock).not.toHaveBeenCalled();
  });

  it('rejects reason "lost" — there is no "lost/missing" reason, only spoilage', async () => {
    const result = await recordInventoryLoss(deps, {
      inventoryItemId: 'lot-c', reason: 'lost' as any, quantity: 1,
    });
    expect(result.success).toBe(false);
    expect(result.error).toMatch(/Invalid loss reason/);
    expect(db.inventory_items.rows.get('lot-c').quantity).toBe(20);
    expect(db.inventory_loss_events.rows.size).toBe(0);
  });

  it('commission lot: memo-only — stock drops, NO transaction posted (FR-014)', async () => {
    const result = await recordInventoryLoss(deps, {
      inventoryItemId: 'lot-comm', reason: 'spoiled', quantity: 2,
    });
    expect(result.success).toBe(true);
    expect(result.transactionId).toBeUndefined();
    expect(createTransactionMock).not.toHaveBeenCalled();

    const event = db.inventory_loss_events.rows.get(result.lossEventId);
    expect(event.is_commission).toBe(true);
    expect(event.transaction_id).toBeNull();
    expect(db.inventory_items.rows.get('lot-comm').quantity).toBe(8);
  });

  it('weight-tracked lot: a unit loss removes its proportional nominal weight (FR-004a/FR-009)', async () => {
    const result = await recordInventoryLoss(deps, {
      inventoryItemId: 'lot-w', reason: 'spoiled', quantity: 2,
    });
    expect(result.success).toBe(true);
    const lot = db.inventory_items.rows.get('lot-w');
    expect(lot.quantity).toBe(8);
    expect(lot.weight_remaining).toBe(80); // 100 − 2×10 nominal
    const event = db.inventory_loss_events.rows.get(result.lossEventId);
    expect(event.weight).toBe(20);
    expect(event.loss_value).toBe(40); // 20 kg × $2 — per-WEIGHT basis, not per-unit
  });

  it('rolls back stock + event when the journal posting fails', async () => {
    createTransactionMock.mockResolvedValueOnce({ success: false, error: 'journal down' });
    const result = await recordInventoryLoss(deps, {
      inventoryItemId: 'lot-c', reason: 'spoiled', quantity: 3,
    });
    expect(result.success).toBe(false);
    expect(db.inventory_items.rows.get('lot-c').quantity).toBe(20); // restored
    expect(db.inventory_loss_events.rows.size).toBe(0); // event removed
  });

  it('denies without the record_inventory_loss permission (FR-019)', async () => {
    checkPermissionMock.mockRejectedValueOnce(new Error('Permission denied: record_inventory_loss'));
    const result = await recordInventoryLoss(deps, {
      inventoryItemId: 'lot-c', reason: 'spoiled', quantity: 1,
    });
    expect(result.success).toBe(false);
    expect(result.error).toMatch(/Permission denied/);
    expect(db.inventory_loss_events.rows.size).toBe(0);
  });
});

// ─── reconcileAndCloseLosses ────────────────────────────────────────────────

describe('reconcileAndCloseLosses (close-time settlement)', () => {
  it('blocks the close while a lot has unaccounted units (FR-011)', async () => {
    // lot-c has 20 on hand and no classification.
    const result = await reconcileAndCloseLosses(deps, 'bill-cash', []);
    expect(result.success).toBe(false);
    expect(result.error).toMatch(/must be recorded as spoiled/);
    expect(db.inventory_loss_events.rows.size).toBe(0);
  });

  it('classified close: records unit losses, zeroes on-hand, then books residual shrinkage (FR-005/FR-012)', async () => {
    // Weight lot: sold 8 units / 70 kg → on-hand 2 units, 30 kg remaining.
    // Count lot: sold 15 → 5 unaccounted.
    db.inventory_items.rows.set('lot-w', {
      ...weightLot, quantity: 2, weight_remaining: 30,
    });
    db.inventory_items.rows.set('lot-c', { ...countLot, quantity: 5 });

    const result = await reconcileAndCloseLosses(deps, 'bill-cash', [
      { inventoryItemId: 'lot-w', spoiledUnits: 2 },
      { inventoryItemId: 'lot-c', spoiledUnits: 5 },
    ]);
    expect(result.success).toBe(true);

    const lotW = db.inventory_items.rows.get('lot-w');
    const lotC = db.inventory_items.rows.get('lot-c');
    expect(lotW.quantity).toBe(0);
    expect(lotW.weight_remaining).toBe(0); // shrinkage zeroed it
    expect(lotC.quantity).toBe(0);

    const events = Array.from(db.inventory_loss_events.rows.values());
    const reasons = events.map((e: any) => e.reason).sort();
    // lot-w: spoiled(2 units → 20 kg) + shrinkage(residual 10 kg); lot-c: spoiled(5).
    expect(reasons).toEqual(['shrinkage', 'spoiled', 'spoiled']);

    const spoiledW = events.find(
      (e: any) => e.reason === 'spoiled' && e.inventory_item_id === 'lot-w'
    ) as any;
    const spoiledC = events.find(
      (e: any) => e.reason === 'spoiled' && e.inventory_item_id === 'lot-c'
    ) as any;
    const shrink = events.find((e: any) => e.reason === 'shrinkage') as any;
    expect(spoiledW.weight).toBe(20); // 2 units × 10 kg nominal
    expect(spoiledC).toMatchObject({ quantity: 5, loss_value: 25 }); // 5 × $5 unit cost
    expect(shrink).toMatchObject({ source: 'auto_close', weight: 10, loss_value: 20 });
  });

  it('weight lot with residual after classification books shrinkage at the per-weight basis (US1/SC-001)', async () => {
    // 10 units received / 100 kg; sold 8 units / 75 kg (weight lots can sell
    // light). On-hand: 2 units, 25 kg remaining.
    db.inventory_items.rows.set('lot-w', {
      ...weightLot, quantity: 2, weight_remaining: 25,
    });
    db.inventory_items.rows.set('lot-c', { ...countLot, quantity: 0 });

    const result = await reconcileAndCloseLosses(deps, 'bill-cash', [
      { inventoryItemId: 'lot-w', spoiledUnits: 2 },
    ]);
    expect(result.success).toBe(true);

    const events = Array.from(db.inventory_loss_events.rows.values()) as any[];
    const unitLoss = events.find(e => e.reason === 'spoiled');
    const shrinkage = events.find(e => e.reason === 'shrinkage');

    // 2 spoiled units consume 2×10 = 20 kg → $40; residual 5 kg → $10 shrinkage.
    expect(unitLoss.weight).toBe(20);
    expect(unitLoss.loss_value).toBe(40);
    expect(shrinkage).toMatchObject({ source: 'auto_close', weight: 5, loss_value: 10, quantity: 0 });

    // P&L invariant (T001 finding): received value = sold value share + losses.
    // Received 100 kg × $2 = $200. Sold 75 kg × $2 = $150. Losses booked $50.
    const totalLoss = events.reduce((s, e) => s + e.loss_value, 0);
    expect(totalLoss).toBe(50);
    expect(150 + totalLoss).toBe(200); // lot residual zeroes exactly (SC-001)

    // Both owned losses posted transactions.
    expect(createTransactionMock).toHaveBeenCalledTimes(2);
    const lot = db.inventory_items.rows.get('lot-w');
    expect(lot.quantity).toBe(0);
    expect(lot.weight_remaining).toBe(0);
  });

  it('fully-sold weight lot books nothing (US1 scenario 3)', async () => {
    db.inventory_items.rows.set('lot-w', { ...weightLot, quantity: 0, weight_remaining: 0 });
    db.inventory_items.rows.set('lot-c', { ...countLot, quantity: 0 });
    const result = await reconcileAndCloseLosses(deps, 'bill-cash', []);
    expect(result.success).toBe(true);
    expect(result.lossEventIds).toHaveLength(0);
    expect(createTransactionMock).not.toHaveBeenCalled();
  });

  it('negative residual (over-weighing) is flagged as an anomaly and never booked as negative loss', async () => {
    db.inventory_items.rows.set('lot-w', { ...weightLot, quantity: 0, weight_remaining: -3 });
    db.inventory_items.rows.set('lot-c', { ...countLot, quantity: 0 });
    const result = await reconcileAndCloseLosses(deps, 'bill-cash', []);
    expect(result.success).toBe(true);
    expect(result.anomalies).toEqual([{ inventoryItemId: 'lot-w', residualWeight: -3 }]);
    expect(result.lossEventIds).toHaveLength(0);
    expect(db.inventory_items.rows.get('lot-w').weight_remaining).toBe(0);
  });

  it('commission bill: shrinkage recorded as memo with no journal (US1 scenario 2)', async () => {
    db.inventory_items.rows.set('lot-comm', { ...commissionLot, quantity: 0, weight_remaining: 4 });
    const result = await reconcileAndCloseLosses(deps, 'bill-comm', []);
    expect(result.success).toBe(true);
    expect(result.lossEventIds).toHaveLength(1);
    expect(createTransactionMock).not.toHaveBeenCalled();
    const event = db.inventory_loss_events.rows.get(result.lossEventIds[0]);
    expect(event).toMatchObject({ reason: 'shrinkage', is_commission: true, transaction_id: null });
  });
});

// ─── getLotCloseReconciliation ──────────────────────────────────────────────

describe('getLotCloseReconciliation (close preview)', () => {
  it('derives sold/unaccounted/projected shrinkage per lot', async () => {
    db.inventory_items.rows.set('lot-w', { ...weightLot, quantity: 2, weight_remaining: 25 });
    const rows = await getLotCloseReconciliation(deps, 'bill-cash');
    const w = rows.find(r => r.inventoryItemId === 'lot-w')!;
    expect(w.unaccountedUnits).toBe(2);
    expect(w.soldQuantity).toBe(8);
    // projection: 25 − 2×10 nominal = 5 kg → $10
    expect(w.residualShrinkageWeight).toBe(5);
    expect(w.estimatedShrinkageValue).toBe(10);
    expect(w.nominalUnitWeight).toBe(10);
    expect(w.isCommission).toBe(false);
  });
});

// ─── reverseInventoryLoss ───────────────────────────────────────────────────

describe('reverseInventoryLoss', () => {
  it('restores stock, posts INVENTORY_LOSS_REVERSAL with is_reversal, links lineage (FR-017)', async () => {
    const recorded = await recordInventoryLoss(deps, {
      inventoryItemId: 'lot-c', reason: 'spoiled', quantity: 3,
    });
    createTransactionMock.mockClear();

    const result = await reverseInventoryLoss(deps, { lossEventId: recorded.lossEventId! });
    expect(result.success).toBe(true);

    expect(db.inventory_items.rows.get('lot-c').quantity).toBe(20); // restored

    const original = db.inventory_loss_events.rows.get(recorded.lossEventId);
    expect(original.status).toBe('reversed');
    expect(original.reversed_by_id).toBe(result.lossEventId);
    const reversal = db.inventory_loss_events.rows.get(result.lossEventId);
    expect(reversal.reversal_of_id).toBe(recorded.lossEventId);
    expect(reversal.status).toBe('active');

    expect(createTransactionMock).toHaveBeenCalledTimes(1);
    const params = createTransactionMock.mock.calls[0][0];
    expect(params.category).toBe(TRANSACTION_CATEGORIES.INVENTORY_LOSS_REVERSAL);
    expect(params.is_reversal).toBe(true);
    expect(params.reversal_of_transaction_id).toBe(recorded.transactionId);
    expect(params.amount).toBe(15);

    expect(auditRecordMock).toHaveBeenLastCalledWith(
      expect.objectContaining({ entityType: 'inventory_loss', action: 'void' })
    );
  });

  it('rejects a double reversal (FR-018)', async () => {
    const recorded = await recordInventoryLoss(deps, {
      inventoryItemId: 'lot-c', reason: 'spoiled', quantity: 1,
    });
    const first = await reverseInventoryLoss(deps, { lossEventId: recorded.lossEventId! });
    expect(first.success).toBe(true);
    const second = await reverseInventoryLoss(deps, { lossEventId: recorded.lossEventId! });
    expect(second.success).toBe(false);
    expect(second.error).toMatch(/already been reversed/);
    expect(db.inventory_items.rows.get('lot-c').quantity).toBe(20); // restored exactly once
  });

  it('commission memo reversal restores stock with no transaction', async () => {
    const recorded = await recordInventoryLoss(deps, {
      inventoryItemId: 'lot-comm', reason: 'spoiled', quantity: 2,
    });
    createTransactionMock.mockClear();
    const result = await reverseInventoryLoss(deps, { lossEventId: recorded.lossEventId! });
    expect(result.success).toBe(true);
    expect(createTransactionMock).not.toHaveBeenCalled();
    const lot = db.inventory_items.rows.get('lot-comm');
    expect(lot.quantity).toBe(10);
    expect(lot.weight_remaining).toBe(100); // proportional weight restored too
  });
});
