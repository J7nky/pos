/**
 * Feature 017 — sync upload currency guard (Vitest + fake-indexeddb).
 * Lives under tests/ so we can import the parity Supabase mock via ESM.
 */
/* eslint-disable @typescript-eslint/no-explicit-any -- Dexie seed rows mirror production parity fixtures */
import 'fake-indexeddb/auto';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

vi.mock('../src/lib/supabase', async () => {
  const { ParitySupabaseState, createSupabaseFromState } = await import('./sync-parity/paritySupabaseMock');
  const state = new ParitySupabaseState();
  (globalThis as Record<string, unknown>)['__syncUploadCurrencyParityState'] = state;
  return { supabase: createSupabaseFromState(state).supabase };
});

vi.mock('../src/services/eventEmissionService', () => ({
  eventEmissionService: {
    emitPaymentPosted: vi.fn().mockResolvedValue(undefined),
    emitSalePosted: vi.fn().mockResolvedValue(undefined),
    emitTransactionReversed: vi.fn().mockResolvedValue(undefined),
    emitCashDrawerTransactionPosted: vi.fn().mockResolvedValue(undefined),
    emitJournalEntryCreated: vi.fn().mockResolvedValue(undefined),
    emitEvent: vi.fn().mockResolvedValue(undefined),
    emitUsersBulkUpdated: vi.fn().mockResolvedValue(undefined),
    emitProductsBulkUpdated: vi.fn().mockResolvedValue(undefined),
    emitInventoryReceived: vi.fn().mockResolvedValue(undefined),
    emitEntitiesBulkUpdated: vi.fn().mockResolvedValue(undefined),
  },
}));

import { resetDbSingletonForTests, getDB } from '../src/lib/db';
import {
  validateRecordCurrencyForTests,
  getCurrencyErrorListForTesting,
  uploadLocalChanges,
} from '../src/services/syncUpload';
import type { ParitySupabaseState } from './sync-parity/paritySupabaseMock';

function parityState(): ParitySupabaseState {
  return (globalThis as Record<string, ParitySupabaseState>)['__syncUploadCurrencyParityState'];
}

/** Satisfy validateDependencies for inventory_items when sync_metadata already exists from a prior upload. */
async function seedDependencySyncMetadata(): Promise<void> {
  const db = getDB();
  const ts = new Date().toISOString();
  for (const table_name of ['stores', 'branches', 'products', 'inventory_bills'] as const) {
    await db.sync_metadata.put({
      id: table_name,
      table_name,
      last_synced_at: ts,
      last_synced_version: 0,
      store_id: null,
      hydration_complete: true,
    });
  }
}

const STORE_ID = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaa0001';
const BRANCH_ID = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaa0002';
const PRODUCT_ID = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaa0003';

describe('validateRecordCurrencyForTests', () => {
  it('rejects inventory_items with missing currency', () => {
    expect(
      validateRecordCurrencyForTests('inventory_items', {
        id: '1',
        currency: undefined,
      } as Record<string, unknown>)
    ).toEqual({ ok: false, reason: 'invalid-currency', attemptedValue: undefined });
  });

  it('rejects transactions with unknown currency', () => {
    expect(
      validateRecordCurrencyForTests('transactions', {
        id: '1',
        currency: 'XYZ',
      } as Record<string, unknown>)
    ).toEqual({ ok: false, reason: 'unknown-currency', attemptedValue: 'XYZ' });
  });

  it('accepts USD inventory and AED transactions', () => {
    expect(validateRecordCurrencyForTests('inventory_items', { id: '1', currency: 'USD' } as any)).toEqual({
      ok: true,
    });
    expect(validateRecordCurrencyForTests('transactions', { id: '1', currency: 'AED' } as any)).toEqual({
      ok: true,
    });
  });

  it('does not guard bills', () => {
    expect(validateRecordCurrencyForTests('bills', { id: '1', currency: undefined } as any)).toEqual({ ok: true });
  });

  it('bypasses soft-delete shapes on inventory_items', () => {
    expect(
      validateRecordCurrencyForTests('inventory_items', {
        id: '1',
        currency: undefined,
        is_deleted: true,
      } as Record<string, unknown>)
    ).toEqual({ ok: true });
    expect(
      validateRecordCurrencyForTests('inventory_items', {
        id: '1',
        currency: undefined,
        _deleted: 1,
      } as Record<string, unknown>)
    ).toEqual({ ok: true });
  });
});

describe('uploadLocalChanges — currency guard', () => {
  beforeEach(async () => {
    parityState().reset();
    await resetDbSingletonForTests();
    const ts = new Date().toISOString();
    const db = getDB();
    await db.stores.put({
      id: STORE_ID,
      store_id: STORE_ID,
      name: 'T',
      address: '',
      phone: '',
      email: 't@t',
      preferred_currency: 'USD',
      country: 'LB',
      accepted_currencies: ['LBP', 'USD'],
      preferred_language: 'en',
      preferred_commission_rate: 0,
      exchange_rate: 1,
      low_stock_alert: false,
      created_at: ts,
      updated_at: ts,
      _synced: true,
    } as any);
    await db.branches.put({
      id: BRANCH_ID,
      store_id: STORE_ID,
      name: 'B',
      address: null,
      phone: null,
      is_active: true,
      created_at: ts,
      updated_at: ts,
      _synced: true,
    } as any);
    await db.products.put({
      id: PRODUCT_ID,
      store_id: STORE_ID,
      branch_id: BRANCH_ID,
      name: 'P',
      category: 'c',
      image: '',
      is_global: false,
      created_at: ts,
      updated_at: ts,
      price: 1,
      _synced: true,
    } as any);
    await seedDependencySyncMetadata();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('uploads only valid inventory rows in a mixed batch; poisoned rows stay unsynced', async () => {
    const ts = new Date().toISOString();
    const db = getDB();
    await db.inventory_items.bulkPut([
      {
        id: 'inv-good',
        store_id: STORE_ID,
        branch_id: BRANCH_ID,
        product_id: PRODUCT_ID,
        batch_id: null,
        unit: 'pcs',
        quantity: 1,
        received_quantity: 1,
        currency: 'USD',
        selling_price: 1,
        created_at: ts,
        updated_at: ts,
        _synced: false,
      } as any,
      {
        id: 'inv-bad',
        store_id: STORE_ID,
        branch_id: BRANCH_ID,
        product_id: PRODUCT_ID,
        batch_id: null,
        unit: 'pcs',
        quantity: 1,
        received_quantity: 1,
        currency: undefined,
        selling_price: 1,
        created_at: ts,
        updated_at: ts,
        _synced: false,
      } as any,
    ]);

    await uploadLocalChanges(STORE_ID, BRANCH_ID);

    const upserts = parityState().upsertOrder.filter((t: string) => t === 'inventory_items');
    expect(upserts.length).toBe(1);
    const remote = parityState().getAll('inventory_items');
    expect(remote.map((r: { id: string }) => r.id).sort()).toEqual(['inv-good']);

    const bad = await db.inventory_items.get('inv-bad');
    expect(bad?._synced).not.toBe(true);
    const good = await db.inventory_items.get('inv-good');
    expect(good?._synced).toBe(true);

    const errs = getCurrencyErrorListForTesting();
    expect(errs).toHaveLength(1);
    expect(errs[0].recordId).toBe('inv-bad');
    expect(errs[0].reason).toBe('invalid-currency');
  });

  it('rebuilds currency error list each upload cycle', async () => {
    const ts = new Date().toISOString();
    const db = getDB();
    await db.inventory_items.put({
      id: 'inv-x',
      store_id: STORE_ID,
      branch_id: BRANCH_ID,
      product_id: PRODUCT_ID,
      batch_id: null,
      unit: 'pcs',
      quantity: 1,
      received_quantity: 1,
      currency: undefined,
      selling_price: 1,
      created_at: ts,
      updated_at: ts,
      _synced: false,
    } as any);

    await uploadLocalChanges(STORE_ID, BRANCH_ID);
    expect(getCurrencyErrorListForTesting()).toHaveLength(1);

    await uploadLocalChanges(STORE_ID, BRANCH_ID);
    expect(getCurrencyErrorListForTesting()).toHaveLength(1);
  });

  it('partitions a three-row batch to one upsert and two currency errors', async () => {
    const ts = new Date().toISOString();
    const db = getDB();
    await db.inventory_items.bulkPut(
      [
        {
          id: 'inv-a',
          store_id: STORE_ID,
          branch_id: BRANCH_ID,
          product_id: PRODUCT_ID,
          batch_id: null,
          unit: 'pcs',
          quantity: 1,
          received_quantity: 1,
          currency: 'USD',
          selling_price: 1,
          created_at: ts,
          updated_at: ts,
          _synced: false,
        },
        {
          id: 'inv-miss',
          store_id: STORE_ID,
          branch_id: BRANCH_ID,
          product_id: PRODUCT_ID,
          batch_id: null,
          unit: 'pcs',
          quantity: 1,
          received_quantity: 1,
          currency: undefined,
          selling_price: 1,
          created_at: ts,
          updated_at: ts,
          _synced: false,
        },
        {
          id: 'inv-badcur',
          store_id: STORE_ID,
          branch_id: BRANCH_ID,
          product_id: PRODUCT_ID,
          batch_id: null,
          unit: 'pcs',
          quantity: 1,
          received_quantity: 1,
          currency: 'ZZZ',
          selling_price: 1,
          created_at: ts,
          updated_at: ts,
          _synced: false,
        },
      ] as any[]
    );

    await uploadLocalChanges(STORE_ID, BRANCH_ID);
    const invUpserts = parityState().upsertOrder.filter((t: string) => t === 'inventory_items');
    expect(invUpserts.length).toBe(1);
    const uploaded = parityState().getAll('inventory_items');
    expect(uploaded.map((r: { id: string }) => r.id)).toEqual(['inv-a']);

    const errs = getCurrencyErrorListForTesting();
    expect(errs).toHaveLength(2);
    const reasons = new Set(errs.map((e) => e.reason));
    expect(reasons.has('invalid-currency')).toBe(true);
    expect(reasons.has('unknown-currency')).toBe(true);
  });

  it('rejects poisoned transactions while still uploading clean inventory in one upload pass', async () => {
    const ts = new Date().toISOString();
    const db = getDB();
    await db.inventory_items.put({
      id: 'inv-clean',
      store_id: STORE_ID,
      branch_id: BRANCH_ID,
      product_id: PRODUCT_ID,
      batch_id: null,
      unit: 'pcs',
      quantity: 1,
      received_quantity: 1,
      currency: 'USD',
      selling_price: 1,
      created_at: ts,
      updated_at: ts,
      _synced: false,
    } as any);
    await db.transactions.put({
      id: 'tx-bad',
      store_id: STORE_ID,
      branch_id: BRANCH_ID,
      type: 'income',
      category: 'misc',
      amount: 1,
      currency: 'BAD' as any,
      description: 'x',
      reference: null,
      created_by: 'user-1',
      created_at: ts,
      updated_at: ts,
      entity_id: null,
      _synced: false,
    } as any);

    await uploadLocalChanges(STORE_ID, BRANCH_ID);

    expect(parityState().getAll('inventory_items').some((r: { id: string }) => r.id === 'inv-clean')).toBe(true);
    expect(parityState().getAll('transactions').length).toBe(0);
    const txErr = getCurrencyErrorListForTesting().filter((e) => e.table === 'transactions');
    expect(txErr).toHaveLength(1);
    expect(txErr[0].reason).toBe('unknown-currency');
  });

  it('three upload cycles against the same poisoned row never upsert it', async () => {
    const ts = new Date().toISOString();
    const db = getDB();
    await db.inventory_items.put({
      id: 'inv-poison',
      store_id: STORE_ID,
      branch_id: BRANCH_ID,
      product_id: PRODUCT_ID,
      batch_id: null,
      unit: 'pcs',
      quantity: 1,
      received_quantity: 1,
      currency: undefined,
      selling_price: 1,
      created_at: ts,
      updated_at: ts,
      _synced: false,
    } as any);

    for (let i = 0; i < 3; i++) {
      parityState().reset();
      await uploadLocalChanges(STORE_ID, BRANCH_ID);
      expect(getCurrencyErrorListForTesting()).toHaveLength(1);
    }
    expect(parityState().getAll('inventory_items').filter((r: { id: string }) => r.id === 'inv-poison').length).toBe(
      0
    );
  });

  it('after fixing currency, row uploads successfully', async () => {
    const ts = new Date().toISOString();
    const db = getDB();
    await db.inventory_items.put({
      id: 'inv-fix',
      store_id: STORE_ID,
      branch_id: BRANCH_ID,
      product_id: PRODUCT_ID,
      batch_id: null,
      unit: 'pcs',
      quantity: 1,
      received_quantity: 1,
      currency: undefined,
      selling_price: 1,
      created_at: ts,
      updated_at: ts,
      _synced: false,
    } as any);

    await uploadLocalChanges(STORE_ID, BRANCH_ID);
    expect(parityState().getAll('inventory_items').length).toBe(0);

    await db.inventory_items.update('inv-fix', { currency: 'USD' } as any);
    await uploadLocalChanges(STORE_ID, BRANCH_ID);
    expect(parityState().getAll('inventory_items').some((r: { id: string }) => r.id === 'inv-fix')).toBe(true);
    const row = await db.inventory_items.get('inv-fix');
    expect(row?._synced).toBe(true);
  });
});
