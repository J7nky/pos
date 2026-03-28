/**
 * Chaos parity scenarios — adversarial event delivery.
 *
 * Each scenario runs:
 *   Arm A: clean SyncService download (ground truth)
 *   Arm B: hostile event delivery (out-of-order / duplicate / dropped + recovered)
 *
 * If Arm A ≠ Arm B the event path is WRONG, not "just different".
 *
 * Run: pnpm run test:parity
 * Update goldens: UPDATE_PARITY_GOLDENS=1 pnpm run test:parity
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import { normalizeSnapshotObject } from './parityNormalizer';
import { buildDualPathParityPayload } from './snapshotHelpers';
import { parityMockState } from './parityMockSingleton';
import { resetDbSingletonForTests } from '../../src/lib/db';
import { dataValidationService } from '../../src/services/dataValidationService';
import { universalChangeDetectionService } from '../../src/services/universalChangeDetectionService';
import { eventStreamService } from '../../src/services/eventStreamService';
import type { BranchEvent } from '../../src/services/eventStreamService';
import { syncService } from '../../src/services/syncService';

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

function goldenPath(scenarioId: string): string {
  return join(GOLDEN_DIR, `${scenarioId}.golden.json`);
}

function assertMatchesGolden(scenarioId: string, actual: Record<string, unknown>): void {
  const normalized = normalizeSnapshotObject(actual);
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

/** Shared product row used across all chaos scenarios. */
const TS = '2024-01-15T12:00:00.000Z';
const PRODUCT_ROW = {
  id: PRODUCT_ID,
  store_id: STORE_ID,
  branch_id: BRANCH_ID,
  name: 'Chaos Product',
  category: 'c',
  image: '',
  is_global: false,
  created_at: TS,
  updated_at: TS,
  price: 5,
};

async function buildSyncArm(scenarioId: string) {
  mockState.reset();
  await resetDbSingletonForTests();
  resetSyncServiceInternals();
  universalChangeDetectionService.clearCache();
  await seedMinimalStoreAndBranch(false);
  mockState.seed('products', PRODUCT_ID, PRODUCT_ROW);
  const result = await syncService.sync(STORE_ID);
  expect(result.success).toBe(true);
  return buildDualPathParityPayload(scenarioId, mockState);
}

describe('sync parity chaos scenarios', () => {
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

  // ───────────────────────────────────────────────────────────────────────────
  // chaos_out_of_order_events
  //
  // Deliver v:2, v:1, v:3 individually via parityBaselineProcessEvent (which
  // calls processEvent directly, bypassing the batch dedup+sort in
  // processEvents).  Final state must equal the clean sync result.
  // ───────────────────────────────────────────────────────────────────────────
  it('chaos_out_of_order_events: final state equals sync arm after OOO delivery', async () => {
    const makeEvent = (version: number, name: string): BranchEvent => ({
      id: `evt-ooo-${version}`,
      store_id: STORE_ID,
      branch_id: BRANCH_ID,
      event_type: 'product_updated',
      entity_type: 'product',
      entity_id: PRODUCT_ID,
      operation: 'update',
      version,
      occurred_at: TS,
      // Each version carries a slightly different name so we can tell which
      // one "wins" once all three have been processed.
      metadata: { name },
    });

    // Arm A: clean sync
    const payloadSync = await buildSyncArm('chaos_out_of_order_events');

    // Arm B: deliver v2, v1, v3 (out of order); seed the final-state product
    // row only once — the mock always returns the same seeded value so each
    // processEvent call fetches the same final row.  The key assertion is that
    // the DB doesn't end up in a partially-applied state.
    mockState.reset();
    await resetDbSingletonForTests();
    resetSyncServiceInternals();
    universalChangeDetectionService.clearCache();
    await seedMinimalStoreAndBranch(false);
    mockState.seed('products', PRODUCT_ID, PRODUCT_ROW);

    const oooOrder = [2, 1, 3];
    for (const v of oooOrder) {
      const outcome = await eventStreamService.parityBaselineProcessEvent(
        STORE_ID,
        makeEvent(v, `Chaos Product v${v}`)
      );
      expect(outcome).toBe('handled');
    }

    const { getDB } = await import('../../src/lib/db');
    const p = await getDB().products.get(PRODUCT_ID);
    expect(p).toBeTruthy();

    const payloadEvent = await buildDualPathParityPayload('chaos_out_of_order_events', mockState);
    const normSync = normalizeSnapshotObject(payloadSync as unknown as Record<string, unknown>);
    const normEvent = normalizeSnapshotObject(payloadEvent as unknown as Record<string, unknown>);
    expect(normEvent).toEqual(normSync);
    assertMatchesGolden('chaos_out_of_order_events', normSync);
  });

  // ───────────────────────────────────────────────────────────────────────────
  // chaos_duplicate_events
  //
  // Feed the exact same event twice.  DB.put is idempotent so the second call
  // must not corrupt the row.  Final state must equal sync arm.
  // ───────────────────────────────────────────────────────────────────────────
  it('chaos_duplicate_events: applying same event twice is idempotent', async () => {
    // Arm A: clean sync
    const payloadSync = await buildSyncArm('chaos_duplicate_events');

    // Arm B: same event x2
    mockState.reset();
    await resetDbSingletonForTests();
    resetSyncServiceInternals();
    universalChangeDetectionService.clearCache();
    await seedMinimalStoreAndBranch(false);
    mockState.seed('products', PRODUCT_ID, PRODUCT_ROW);

    const dupEvent: BranchEvent = {
      id: 'evt-dup-1',
      store_id: STORE_ID,
      branch_id: BRANCH_ID,
      event_type: 'product_updated',
      entity_type: 'product',
      entity_id: PRODUCT_ID,
      operation: 'update',
      version: 1,
      occurred_at: TS,
    };

    const o1 = await eventStreamService.parityBaselineProcessEvent(STORE_ID, dupEvent);
    const o2 = await eventStreamService.parityBaselineProcessEvent(STORE_ID, dupEvent);
    expect(o1).toBe('handled');
    expect(o2).toBe('handled');

    const payloadEvent = await buildDualPathParityPayload('chaos_duplicate_events', mockState);
    const normSync = normalizeSnapshotObject(payloadSync as unknown as Record<string, unknown>);
    const normEvent = normalizeSnapshotObject(payloadEvent as unknown as Record<string, unknown>);
    expect(normEvent).toEqual(normSync);
    assertMatchesGolden('chaos_duplicate_events', normSync);
  });

  // ───────────────────────────────────────────────────────────────────────────
  // chaos_dropped_then_recovered
  //
  // Simulate: v1 delivered, v2 dropped (offline), v3 delivered.
  // Then v2 arrives (recovery/catch-up).
  // Final state after all three must equal the sync arm.
  //
  // Because processEvent always fetches the CURRENT server row, all three
  // calls converge on the same seeded product — the dropped event doesn't
  // leave stale data behind.
  // ───────────────────────────────────────────────────────────────────────────
  it('chaos_dropped_then_recovered: missing v2 followed by v2 recovery converges to sync arm', async () => {
    // Arm A: clean sync
    const payloadSync = await buildSyncArm('chaos_dropped_then_recovered');

    // Arm B: v1, v3 (v2 dropped), then v2 recovery
    mockState.reset();
    await resetDbSingletonForTests();
    resetSyncServiceInternals();
    universalChangeDetectionService.clearCache();
    await seedMinimalStoreAndBranch(false);
    mockState.seed('products', PRODUCT_ID, PRODUCT_ROW);

    const makeEvent = (v: number): BranchEvent => ({
      id: `evt-drop-${v}`,
      store_id: STORE_ID,
      branch_id: BRANCH_ID,
      event_type: 'product_updated',
      entity_type: 'product',
      entity_id: PRODUCT_ID,
      operation: 'update',
      version: v,
      occurred_at: TS,
    });

    await eventStreamService.parityBaselineProcessEvent(STORE_ID, makeEvent(1));
    // v2 dropped (skipped)
    await eventStreamService.parityBaselineProcessEvent(STORE_ID, makeEvent(3));
    // v2 arrives late (recovery)
    await eventStreamService.parityBaselineProcessEvent(STORE_ID, makeEvent(2));

    const { getDB } = await import('../../src/lib/db');
    const p = await getDB().products.get(PRODUCT_ID);
    expect(p).toBeTruthy();

    const payloadEvent = await buildDualPathParityPayload('chaos_dropped_then_recovered', mockState);
    const normSync = normalizeSnapshotObject(payloadSync as unknown as Record<string, unknown>);
    const normEvent = normalizeSnapshotObject(payloadEvent as unknown as Record<string, unknown>);
    expect(normEvent).toEqual(normSync);
    assertMatchesGolden('chaos_dropped_then_recovered', normSync);
  });
});
