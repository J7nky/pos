/**
 * Sync parity baseline scenarios (strict contract).
 * Run: pnpm run test:parity
 * Update goldens: UPDATE_PARITY_GOLDENS=1 pnpm run test:parity
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import { normalizeSnapshotObject } from './parityNormalizer';
import { buildScenarioResult, buildDualPathParityPayload, assertInvariants } from './snapshotHelpers';
import { parityMockState } from './parityMockSingleton';
import { resetDbSingletonForTests } from '../../src/lib/db';
import { dataValidationService } from '../../src/services/dataValidationService';
import { universalChangeDetectionService } from '../../src/services/universalChangeDetectionService';
import { eventStreamService } from '../../src/services/eventStreamService';
import type { BranchEvent } from '../../src/services/eventStreamService';

vi.mock('../../src/lib/supabase', async () => {
  const { paritySupabase } = await import('./parityMockSingleton');
  return { supabase: paritySupabase };
});

vi.mock('../../src/services/syncTriggerService', () => ({
  syncTriggerService: { triggerSync: vi.fn() },
}));

const mockState = parityMockState;

const __dirname = dirname(fileURLToPath(import.meta.url));
const GOLDEN_DIR = join(__dirname, '../sync-baseline');

const STORE_ID = '00000000-0000-4000-8000-000000000001';
const BRANCH_ID = '00000000-0000-4000-8000-000000000002';
const PRODUCT_ID = '00000000-0000-4000-8000-000000000003';
const ENTITY_ID = '00000000-0000-4000-8000-000000000010';
const BILL_ID = '00000000-0000-4000-8000-000000000020';
const LINE_ITEM_ID = '00000000-0000-4000-8000-000000000021';
const TRANSACTION_ID = '00000000-0000-4000-8000-000000000030';
const JOURNAL_ENTRY_DEBIT_ID = '00000000-0000-4000-8000-000000000040';
const JOURNAL_ENTRY_CREDIT_ID = '00000000-0000-4000-8000-000000000041';
const INVENTORY_BILL_ID = '00000000-0000-4000-8000-000000000050';
const INVENTORY_ITEM_ID = '00000000-0000-4000-8000-000000000051';

import { syncService } from '../../src/services/syncService';

function goldenPath(scenarioId: string): string {
  return join(GOLDEN_DIR, `${scenarioId}.golden.json`);
}

function assertMatchesGolden(scenarioId: string, actual: Record<string, unknown>): void {
  const normalized = normalizeSnapshotObject(actual as Record<string, unknown>);
  const update = process.env.UPDATE_PARITY_GOLDENS === '1';
  const path = goldenPath(scenarioId);
  if (update) {
    mkdirSync(dirname(path), { recursive: true });
    writeFileSync(path, `${JSON.stringify(normalized, null, 2)}\n`, 'utf-8');
    return;
  }
  if (!existsSync(path)) {
    throw new Error(`Missing golden file: ${path} (run UPDATE_PARITY_GOLDENS=1 pnpm run test:parity)`);
  }
  const expected = JSON.parse(readFileSync(path, 'utf-8')) as Record<string, unknown>;
  expect(normalized).toEqual(expected);
}

function resetSyncServiceInternals(): void {
  const s = syncService as unknown as {
    isRunning: boolean;
    lastDeletionCheck: Date | null;
    deletionStateCache: Map<string, unknown>;
  };
  s.isRunning = false;
  s.lastDeletionCheck = null;
  s.deletionStateCache?.clear?.();
}

async function seedMinimalStoreAndBranch(unsynced: boolean): Promise<void> {
  const { getDB } = await import('../../src/lib/db');
  const db = getDB();
  const ts = '2024-01-15T12:00:00.000Z';
  await db.stores.put({
    id: STORE_ID,
    store_id: STORE_ID,
    name: 'Parity Store',
    address: '',
    phone: '',
    email: 'parity@test.local',
    preferred_currency: 'USD',
    preferred_language: 'en',
    preferred_commission_rate: 0,
    exchange_rate: 1,
    low_stock_alert: false,
    created_at: ts,
    updated_at: ts,
    _synced: !unsynced,
  } as any);
  await db.branches.put({
    id: BRANCH_ID,
    store_id: STORE_ID,
    name: 'Parity Branch',
    address: null,
    phone: null,
    is_active: true,
    created_at: ts,
    updated_at: ts,
    _synced: !unsynced,
  } as any);
}

describe('sync parity scenarios', () => {
  let refreshSpy: ReturnType<typeof vi.spyOn>;
  let detectSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(async () => {
    mockState.reset();
    await resetDbSingletonForTests();
    resetSyncServiceInternals();
    universalChangeDetectionService.clearCache();
    refreshSpy = vi.spyOn(dataValidationService, 'refreshCache').mockResolvedValue(undefined);
    detectSpy = vi
      .spyOn(universalChangeDetectionService, 'detectChanges')
      .mockResolvedValue({ hasChanges: false, changeCount: 0 });
  }, 30_000);

  afterEach(() => {
    refreshSpy?.mockRestore();
    detectSpy?.mockRestore();
  });

  it('upload_dependency_order: upserts stores before branches', async () => {
    await seedMinimalStoreAndBranch(true);
    const result = await syncService.sync(STORE_ID);
    expect(result.success).toBe(true);
    const idxStores = mockState.upsertOrder.indexOf('stores');
    const idxBranches = mockState.upsertOrder.indexOf('branches');
    expect(idxStores).toBeGreaterThanOrEqual(0);
    expect(idxBranches).toBeGreaterThanOrEqual(0);
    expect(idxStores).toBeLessThan(idxBranches);

    const payload = await buildScenarioResult(
      'upload_dependency_order',
      mockState,
      result,
      ['stores', 'branches'],
      { uploadOrder: [...mockState.upsertOrder] }
    );
    assertMatchesGolden('upload_dependency_order', payload as unknown as Record<string, unknown>);
  });

  it('download_remote_to_local: pulls product row into IndexedDB', async () => {
    await seedMinimalStoreAndBranch(false);
    const ts = '2024-01-15T12:00:00.000Z';
    mockState.seed('products', PRODUCT_ID, {
      id: PRODUCT_ID,
      store_id: STORE_ID,
      branch_id: BRANCH_ID,
      name: 'Parity Product',
      category: 'c',
      image: '',
      is_global: false,
      created_at: ts,
      updated_at: ts,
      price: 1,
    });

    const result = await syncService.sync(STORE_ID);
    expect(result.success).toBe(true);
    const { getDB } = await import('../../src/lib/db');
    const p = await getDB().products.get(PRODUCT_ID);
    expect(p).toBeTruthy();
    expect(p?.name).toBe('Parity Product');

    const payload = await buildScenarioResult('download_remote_to_local', mockState, result, [
      'stores',
      'branches',
      'products',
    ]);
    assertMatchesGolden('download_remote_to_local', payload as unknown as Record<string, unknown>);
  });

  it('deletion_detection: removes local row when absent from mock server', async () => {
    const { getDB } = await import('../../src/lib/db');
    const ts = '2024-01-15T12:00:00.000Z';
    await seedMinimalStoreAndBranch(false);
    await getDB().products.put({
      id: PRODUCT_ID,
      store_id: STORE_ID,
      branch_id: BRANCH_ID,
      name: 'ToDelete',
      category: 'c',
      image: '',
      is_global: false,
      created_at: ts,
      updated_at: ts,
      _synced: true,
    } as any);
    // Mock server has no products — deletion path removes local copy
    const result = await syncService.sync(STORE_ID);
    expect(result.success).toBe(true);
    const gone = await getDB().products.get(PRODUCT_ID);
    expect(gone).toBeUndefined();

    const payload = await buildScenarioResult('deletion_detection', mockState, result, [
      'stores',
      'branches',
      'products',
    ]);
    assertMatchesGolden('deletion_detection', payload as unknown as Record<string, unknown>);
  });

  it('concurrent_sync_reentry: second and third sync calls return skipped while first runs', async () => {
    await seedMinimalStoreAndBranch(false);
    const ts = '2024-01-15T12:00:00.000Z';
    mockState.seed('stores', STORE_ID, {
      id: STORE_ID,
      store_id: STORE_ID,
      name: 'Parity Store',
      address: '',
      phone: '',
      email: 'parity@test.local',
      preferred_currency: 'USD',
      preferred_language: 'en',
      preferred_commission_rate: 0,
      exchange_rate: 1,
      low_stock_alert: false,
      created_at: ts,
      updated_at: ts,
    });
    mockState.seed('branches', BRANCH_ID, {
      id: BRANCH_ID,
      store_id: STORE_ID,
      name: 'Parity Branch',
      address: null,
      phone: null,
      is_active: true,
      created_at: ts,
      updated_at: ts,
    });
    let resolveFirst!: () => void;
    const barrier = new Promise<void>((r) => {
      resolveFirst = r;
    });
    refreshSpy.mockImplementation(async () => {
      await barrier;
    });
    const p1 = syncService.sync(STORE_ID);
    await Promise.resolve();
    const r2 = await syncService.sync(STORE_ID);
    const r3 = await syncService.sync(STORE_ID);
    expect(r2.synced.uploaded).toBe(0);
    expect(r2.synced.downloaded).toBe(0);
    expect(r3.synced.uploaded).toBe(0);
    expect(r3.synced.downloaded).toBe(0);
    resolveFirst!();
    const r1 = await p1;

    const payload = await buildScenarioResult(
      'concurrent_sync_reentry',
      mockState,
      r1,
      ['stores', 'branches'],
      { skippedWhileRunning: [r2, r3] }
    );
    assertMatchesGolden('concurrent_sync_reentry', payload as unknown as Record<string, unknown>);
  });

  it('event_driven_reconciliation: parityBaselineProcessEvent applies remote product', async () => {
    await seedMinimalStoreAndBranch(false);
    const ts = '2024-01-15T12:00:00.000Z';
    mockState.seed('products', PRODUCT_ID, {
      id: PRODUCT_ID,
      store_id: STORE_ID,
      branch_id: BRANCH_ID,
      name: 'Event Product',
      category: 'c',
      image: '',
      is_global: false,
      created_at: ts,
      updated_at: ts,
      price: 1,
    });

    const event: BranchEvent = {
      id: 'evt-1',
      store_id: STORE_ID,
      branch_id: BRANCH_ID,
      event_type: 'product_updated',
      entity_type: 'product',
      entity_id: PRODUCT_ID,
      operation: 'update',
      version: 1,
      occurred_at: ts,
    };

    const outcome = await eventStreamService.parityBaselineProcessEvent(STORE_ID, event);
    expect(outcome).toBe('handled');
    const { getDB } = await import('../../src/lib/db');
    const p = await getDB().products.get(PRODUCT_ID);
    expect(p?.name).toBe('Event Product');

    const payload = await buildScenarioResult(
      'event_driven_reconciliation',
      mockState,
      null,
      ['stores', 'branches', 'products'],
      { eventOutcome: outcome }
    );
    assertMatchesGolden('event_driven_reconciliation', payload as unknown as Record<string, unknown>);
  });

  /**
   * Dual-path invariant: same seeded remote product must land identically in IndexedDB
   * whether applied via SyncService (table download) or EventStream (single-record fetch).
   * If this fails, the event-driven path is wrong relative to sync — not "just different".
   */
  it('dual_path_sync_vs_eventstream: product row matches sync download and event fetch', async () => {
    const ts = '2024-01-15T12:00:00.000Z';
    const productRow = {
      id: PRODUCT_ID,
      store_id: STORE_ID,
      branch_id: BRANCH_ID,
      name: 'Parity Product',
      category: 'c',
      image: '',
      is_global: false,
      created_at: ts,
      updated_at: ts,
      price: 1,
    };

    const runSyncArm = async () => {
      mockState.reset();
      await resetDbSingletonForTests();
      resetSyncServiceInternals();
      universalChangeDetectionService.clearCache();
      await seedMinimalStoreAndBranch(false);
      mockState.seed('products', PRODUCT_ID, productRow);
      const result = await syncService.sync(STORE_ID);
      expect(result.success).toBe(true);
      return buildDualPathParityPayload('dual_path_sync_vs_eventstream', mockState);
    };

    const runEventArm = async () => {
      mockState.reset();
      await resetDbSingletonForTests();
      resetSyncServiceInternals();
      universalChangeDetectionService.clearCache();
      await seedMinimalStoreAndBranch(false);
      mockState.seed('products', PRODUCT_ID, productRow);
      const event: BranchEvent = {
        id: 'evt-dual-1',
        store_id: STORE_ID,
        branch_id: BRANCH_ID,
        event_type: 'product_updated',
        entity_type: 'product',
        entity_id: PRODUCT_ID,
        operation: 'update',
        version: 1,
        occurred_at: ts,
      };
      const outcome = await eventStreamService.parityBaselineProcessEvent(STORE_ID, event);
      expect(outcome).toBe('handled');
      return buildDualPathParityPayload('dual_path_sync_vs_eventstream', mockState);
    };

    const payloadSync = await runSyncArm();
    const payloadEvent = await runEventArm();
    const normSync = normalizeSnapshotObject(payloadSync as unknown as Record<string, unknown>);
    const normEvent = normalizeSnapshotObject(payloadEvent as unknown as Record<string, unknown>);
    expect(normEvent).toEqual(normSync);
    assertMatchesGolden('dual_path_sync_vs_eventstream', normSync);
  });

  // ─────────────────────────────────────────────────────────────────────────────
  // Phase 1 — cross-entity cascade scenarios
  // ─────────────────────────────────────────────────────────────────────────────

  /**
   * sale_cascade: full bill + line_item + transaction + journal_entries
   *
   * Arm A: sync download lands all tables.
   * Arm B: sale_posted event fetches bill + bill_line_items via cascade.
   * Both arms must produce identical normalized snapshots.
   */
  it('sale_cascade: bill + line_item + transaction + journals match via sync and event paths', async () => {
    const ts = '2024-01-15T12:00:00.000Z';

    const billRow = {
      id: BILL_ID,
      store_id: STORE_ID,
      branch_id: BRANCH_ID,
      bill_number: 'INV-001',
      entity_id: ENTITY_ID,
      payment_method: 'cash',
      payment_status: 'paid',
      amount_paid: 10.0,
      bill_date: ts,
      notes: null,
      status: 'active',
      created_by: 'user-1',
      created_at: ts,
      updated_at: ts,
    };
    const lineItemRow = {
      id: LINE_ITEM_ID,
      store_id: STORE_ID,
      branch_id: BRANCH_ID,
      bill_id: BILL_ID,
      product_id: PRODUCT_ID,
      inventory_item_id: null,
      quantity: 1,
      weight: null,
      unit_price: 10.0,
      line_total: 10.0,
      received_value: 0,
      notes: null,
      line_order: 1,
      created_at: ts,
      updated_at: ts,
    };
    const txRow = {
      id: TRANSACTION_ID,
      store_id: STORE_ID,
      branch_id: BRANCH_ID,
      type: 'income',
      category: 'Cash Drawer Sale',
      amount: 10.0,
      currency: 'USD',
      description: 'Cash sale',
      reference: null,
      created_by: 'user-1',
      created_at: ts,
      updated_at: ts,
      entity_id: ENTITY_ID,
      _synced: false,
    };
    const debitEntry = {
      id: JOURNAL_ENTRY_DEBIT_ID,
      store_id: STORE_ID,
      branch_id: BRANCH_ID,
      transaction_id: TRANSACTION_ID,
      account_code: '1100',
      account_name: 'Cash',
      debit_usd: 10.0,
      credit_usd: 0,
      debit_lbp: 0,
      credit_lbp: 0,
      entity_id: ENTITY_ID,
      entity_type: 'cash',
      posted_date: ts,
      fiscal_period: '2024-01',
      is_posted: true,
      created_at: ts,
      created_by: 'user-1',
      _synced: false,
    };
    const creditEntry = {
      id: JOURNAL_ENTRY_CREDIT_ID,
      store_id: STORE_ID,
      branch_id: BRANCH_ID,
      transaction_id: TRANSACTION_ID,
      account_code: '4100',
      account_name: 'Sales Revenue',
      debit_usd: 0,
      credit_usd: 10.0,
      debit_lbp: 0,
      credit_lbp: 0,
      entity_id: ENTITY_ID,
      entity_type: 'cash',
      posted_date: ts,
      fiscal_period: '2024-01',
      is_posted: true,
      created_at: ts,
      created_by: 'user-1',
      _synced: false,
    };

    const runSyncArm = async () => {
      mockState.reset();
      await resetDbSingletonForTests();
      resetSyncServiceInternals();
      universalChangeDetectionService.clearCache();
      await seedMinimalStoreAndBranch(false);
      mockState.seed('bills', BILL_ID, billRow);
      mockState.seed('bill_line_items', LINE_ITEM_ID, lineItemRow);
      mockState.seed('transactions', TRANSACTION_ID, txRow);
      mockState.seed('journal_entries', JOURNAL_ENTRY_DEBIT_ID, debitEntry);
      mockState.seed('journal_entries', JOURNAL_ENTRY_CREDIT_ID, creditEntry);
      const result = await syncService.sync(STORE_ID);
      expect(result.success).toBe(true);
      await assertInvariants(['bills', 'bill_line_items', 'journal_entries']);
      return buildScenarioResult('sale_cascade', mockState, result, [
        'bills', 'bill_line_items', 'transactions', 'journal_entries',
      ]);
    };

    const runEventArm = async () => {
      mockState.reset();
      await resetDbSingletonForTests();
      resetSyncServiceInternals();
      universalChangeDetectionService.clearCache();
      await seedMinimalStoreAndBranch(false);
      mockState.seed('bills', BILL_ID, billRow);
      mockState.seed('bill_line_items', LINE_ITEM_ID, lineItemRow);
      mockState.seed('transactions', TRANSACTION_ID, txRow);
      mockState.seed('journal_entries', JOURNAL_ENTRY_DEBIT_ID, debitEntry);
      mockState.seed('journal_entries', JOURNAL_ENTRY_CREDIT_ID, creditEntry);
      const billEvent: BranchEvent = {
        id: 'evt-sale-1',
        store_id: STORE_ID,
        branch_id: BRANCH_ID,
        event_type: 'sale_posted',
        entity_type: 'bill',
        entity_id: BILL_ID,
        operation: 'insert',
        version: 1,
        occurred_at: ts,
      };
      const outcome = await eventStreamService.parityBaselineProcessEvent(STORE_ID, billEvent);
      expect(outcome).toBe('handled');
      const { getDB: gdb } = await import('../../src/lib/db');
      const storedBill = await gdb().bills.get(BILL_ID);
      expect(storedBill).toBeTruthy();
      const storedLine = await gdb().bill_line_items.get(LINE_ITEM_ID);
      expect(storedLine).toBeTruthy();
      await assertInvariants(['bills', 'bill_line_items']);
      return buildScenarioResult('sale_cascade', mockState, null, [
        'bills', 'bill_line_items', 'transactions', 'journal_entries',
      ]);
    };

    const payloadSync = await runSyncArm();
    const payloadEvent = await runEventArm();
    const normSync = normalizeSnapshotObject(
      { bills: (payloadSync.localSnapshot as any).bills ?? [],
        bill_line_items: (payloadSync.localSnapshot as any).bill_line_items ?? [] } as Record<string, unknown>
    );
    const normEvent = normalizeSnapshotObject(
      { bills: (payloadEvent.localSnapshot as any).bills ?? [],
        bill_line_items: (payloadEvent.localSnapshot as any).bill_line_items ?? [] } as Record<string, unknown>
    );
    expect(normEvent).toEqual(normSync);
    assertMatchesGolden('sale_cascade', payloadSync as unknown as Record<string, unknown>);
  });

  /**
   * payment_affects_balance: entity + transaction + journal entries download correctly.
   * Verifies that both rows and financial structure land properly via sync.
   */
  it('payment_affects_balance: entity + transaction + journals download and balance derivable', async () => {
    const ts = '2024-01-15T12:00:00.000Z';

    const entityRow = {
      id: ENTITY_ID,
      store_id: STORE_ID,
      branch_id: BRANCH_ID,
      entity_type: 'customer',
      entity_code: 'CUST-001',
      name: 'Parity Customer',
      phone: null,
      is_system_entity: false,
      is_active: true,
      customer_data: null,
      supplier_data: null,
      created_at: ts,
      updated_at: ts,
      _synced: false,
    };
    const txRow = {
      id: TRANSACTION_ID,
      store_id: STORE_ID,
      branch_id: BRANCH_ID,
      type: 'income',
      category: 'Customer Payment',
      amount: 50.0,
      currency: 'USD',
      description: 'Customer payment',
      reference: null,
      created_by: 'user-1',
      created_at: ts,
      updated_at: ts,
      entity_id: ENTITY_ID,
      _synced: false,
    };
    const debitEntry = {
      id: JOURNAL_ENTRY_DEBIT_ID,
      store_id: STORE_ID,
      branch_id: BRANCH_ID,
      transaction_id: TRANSACTION_ID,
      account_code: '1100',
      account_name: 'Cash',
      debit_usd: 50.0,
      credit_usd: 0,
      debit_lbp: 0,
      credit_lbp: 0,
      entity_id: ENTITY_ID,
      entity_type: 'cash',
      posted_date: ts,
      fiscal_period: '2024-01',
      is_posted: true,
      created_at: ts,
      created_by: 'user-1',
      _synced: false,
    };
    const creditEntry = {
      id: JOURNAL_ENTRY_CREDIT_ID,
      store_id: STORE_ID,
      branch_id: BRANCH_ID,
      transaction_id: TRANSACTION_ID,
      account_code: '1200',
      account_name: 'Accounts Receivable',
      debit_usd: 0,
      credit_usd: 50.0,
      debit_lbp: 0,
      credit_lbp: 0,
      entity_id: ENTITY_ID,
      entity_type: 'customer',
      posted_date: ts,
      fiscal_period: '2024-01',
      is_posted: true,
      created_at: ts,
      created_by: 'user-1',
      _synced: false,
    };

    await seedMinimalStoreAndBranch(false);
    mockState.seed('entities', ENTITY_ID, entityRow);
    mockState.seed('transactions', TRANSACTION_ID, txRow);
    mockState.seed('journal_entries', JOURNAL_ENTRY_DEBIT_ID, debitEntry);
    mockState.seed('journal_entries', JOURNAL_ENTRY_CREDIT_ID, creditEntry);

    const result = await syncService.sync(STORE_ID);
    expect(result.success).toBe(true);

    const { getDB: gdb } = await import('../../src/lib/db');
    const entity = await gdb().entities.get(ENTITY_ID);
    expect(entity).toBeTruthy();
    const tx = await gdb().transactions.get(TRANSACTION_ID);
    expect(tx).toBeTruthy();
    const je = await gdb().journal_entries
      .where('transaction_id')
      .equals(TRANSACTION_ID)
      .toArray();
    expect(je.length).toBe(2);

    await assertInvariants(['journal_entries']);

    const payload = await buildScenarioResult('payment_affects_balance', mockState, result, [
      'entities', 'transactions', 'journal_entries',
    ]);
    assertMatchesGolden('payment_affects_balance', payload as unknown as Record<string, unknown>);
  });

  /**
   * inventory_adjustment_chain: inventory_bill + inventory_item download via sync
   * and via inventory_received event both produce identical item quantity.
   */
  it('inventory_adjustment_chain: inventory_bill + item match via sync and event paths', async () => {
    const ts = '2024-01-15T12:00:00.000Z';

    const inventoryBillRow = {
      id: INVENTORY_BILL_ID,
      store_id: STORE_ID,
      branch_id: BRANCH_ID,
      supplier_id: ENTITY_ID,
      received_at: ts,
      created_by: 'user-1',
      type: 'direct',
      created_at: ts,
      updated_at: ts,
      _synced: false,
    };
    const inventoryItemRow = {
      id: INVENTORY_ITEM_ID,
      store_id: STORE_ID,
      branch_id: BRANCH_ID,
      product_id: PRODUCT_ID,
      batch_id: INVENTORY_BILL_ID,
      unit: 'pcs',
      quantity: 50,
      weight: null,
      price: 5.0,
      selling_price: 10.0,
      type: 'purchase',
      received_at: ts,
      created_at: ts,
      updated_at: ts,
      _synced: false,
    };

    const runSyncArm = async () => {
      mockState.reset();
      await resetDbSingletonForTests();
      resetSyncServiceInternals();
      universalChangeDetectionService.clearCache();
      await seedMinimalStoreAndBranch(false);
      mockState.seed('inventory_bills', INVENTORY_BILL_ID, inventoryBillRow);
      mockState.seed('inventory_items', INVENTORY_ITEM_ID, inventoryItemRow);
      const result = await syncService.sync(STORE_ID);
      expect(result.success).toBe(true);
      const { getDB: gdb } = await import('../../src/lib/db');
      const item = await gdb().inventory_items.get(INVENTORY_ITEM_ID);
      expect(item?.quantity).toBe(50);
      return buildScenarioResult('inventory_adjustment_chain', mockState, result, [
        'inventory_bills', 'inventory_items',
      ]);
    };

    const runEventArm = async () => {
      mockState.reset();
      await resetDbSingletonForTests();
      resetSyncServiceInternals();
      universalChangeDetectionService.clearCache();
      await seedMinimalStoreAndBranch(false);
      mockState.seed('inventory_bills', INVENTORY_BILL_ID, inventoryBillRow);
      mockState.seed('inventory_items', INVENTORY_ITEM_ID, inventoryItemRow);
      const invEvent: BranchEvent = {
        id: 'evt-inv-1',
        store_id: STORE_ID,
        branch_id: BRANCH_ID,
        event_type: 'inventory_received',
        entity_type: 'inventory_bill',
        entity_id: INVENTORY_BILL_ID,
        operation: 'insert',
        version: 1,
        occurred_at: ts,
      };
      const outcome = await eventStreamService.parityBaselineProcessEvent(STORE_ID, invEvent);
      expect(outcome).toBe('handled');
      const { getDB: gdb } = await import('../../src/lib/db');
      const bill = await gdb().inventory_bills.get(INVENTORY_BILL_ID);
      expect(bill).toBeTruthy();
      const item = await gdb().inventory_items.get(INVENTORY_ITEM_ID);
      expect(item?.quantity).toBe(50);
      return buildScenarioResult('inventory_adjustment_chain', mockState, null, [
        'inventory_bills', 'inventory_items',
      ]);
    };

    const payloadSync = await runSyncArm();
    const payloadEvent = await runEventArm();
    const normSync = normalizeSnapshotObject(
      { inventory_items: (payloadSync.localSnapshot as any).inventory_items ?? [] } as Record<string, unknown>
    );
    const normEvent = normalizeSnapshotObject(
      { inventory_items: (payloadEvent.localSnapshot as any).inventory_items ?? [] } as Record<string, unknown>
    );
    expect(normEvent).toEqual(normSync);
    assertMatchesGolden('inventory_adjustment_chain', payloadSync as unknown as Record<string, unknown>);
  });

  /**
   * delete_propagation: local entity that is absent from mock server gets removed
   * by deletion detection.  Verifies cross-table removal of the entity row.
   */
  it('delete_propagation: entity absent from remote is removed by deletion detection', async () => {
    const { getDB: gdb } = await import('../../src/lib/db');
    const ts = '2024-01-15T12:00:00.000Z';
    await seedMinimalStoreAndBranch(false);

    await gdb().entities.put({
      id: ENTITY_ID,
      store_id: STORE_ID,
      branch_id: BRANCH_ID,
      entity_type: 'customer',
      entity_code: 'CUST-DEL',
      name: 'ToDelete Customer',
      phone: null,
      is_system_entity: false,
      is_active: true,
      customer_data: null,
      supplier_data: null,
      created_at: ts,
      updated_at: ts,
      _synced: true,
    } as any);

    // Server has NO entities — deletion detection will remove the local row
    const result = await syncService.sync(STORE_ID);
    expect(result.success).toBe(true);

    const gone = await gdb().entities.get(ENTITY_ID);
    expect(gone).toBeUndefined();

    const payload = await buildScenarioResult('delete_propagation', mockState, result, [
      'entities',
    ]);
    assertMatchesGolden('delete_propagation', payload as unknown as Record<string, unknown>);
  });
});
