/**
 * transactionService.createOpeningBalance — entity opening balances.
 *
 * Regression: opening balances used to be posted as journal entries with a
 * synthetic transaction_id but NO parent `transactions` row → orphan entries
 * that fail the journal_entries → transactions FK on sync. createOpeningBalance
 * now writes ONE parent OPENING_BALANCE transaction plus a directional
 * double-entry per currency, atomically.
 */
/* eslint-disable @typescript-eslint/no-explicit-any -- mock Dexie/journal shapes */
import { describe, it, expect, vi, beforeEach } from 'vitest';

const addedTransactions: any[] = [];
const jeCalls: any[] = [];

vi.mock('../journalService', () => ({
  journalService: {
    createJournalEntry: vi.fn(async (p: any) => {
      jeCalls.push(p);
      return 'je-id';
    }),
  },
}));

vi.mock('../../lib/db', () => {
  const db = {
    transaction: async (_mode: string, _tables: any[], cb: () => Promise<void>) => cb(),
    transactions: { add: vi.fn(async (row: any) => { addedTransactions.push(row); }) },
    journal_entries: {},
    entities: {},
    chart_of_accounts: {},
  };
  return {
    getDB: () => db,
    createId: () => 'gen-id',
  };
});

import { transactionService } from '../transactionService';

const ctx = { userId: 'u1', storeId: 'store-1', branchId: 'branch-1', module: 'test', source: 'offline' as const };

beforeEach(() => {
  addedTransactions.length = 0;
  jeCalls.length = 0;
});

async function post(entityType: 'customer' | 'supplier', balances: Record<string, number>) {
  return transactionService.createOpeningBalance({
    entityId: 'ent-123456789',
    entityType,
    balances: balances as any,
    context: ctx,
    transactionId: 'ob-txn-1',
  });
}

describe('createOpeningBalance — directional double-entry + parent row', () => {
  it('creates ONE parent OPENING_BALANCE transaction and tags entries with its id', async () => {
    const res = await post('customer', { USD: 100 });
    expect(res.success).toBe(true);
    expect(res.transactionId).toBe('ob-txn-1');

    expect(addedTransactions).toHaveLength(1);
    const txn = addedTransactions[0];
    expect(txn.category).toBe('Opening Balance');
    expect(txn.entity_id).toBe('ent-123456789');
    expect(txn.store_id).toBe('store-1');
    expect(txn.branch_id).toBe('branch-1');
    expect(txn.currency).toBe('USD');
    expect(txn.amount).toBe(100);

    expect(jeCalls).toHaveLength(1);
    expect(jeCalls[0].transactionId).toBe('ob-txn-1'); // FK parent
  });

  it.each([
    ['customer', 100, '1200', '3100'], // they owe us → Dr AR / Cr Equity
    ['customer', -100, '3100', '1200'], // we owe them → Dr Equity / Cr AR
    ['supplier', 100, '3100', '2100'], // we owe them → Dr Equity / Cr AP
    ['supplier', -100, '2100', '3100'], // they owe us → Dr AP / Cr Equity
  ] as const)('%s balance %d → Dr %s / Cr %s (abs amount)', async (type, signed, dr, cr) => {
    await post(type, { USD: signed });
    expect(jeCalls).toHaveLength(1);
    expect(jeCalls[0].debitAccount).toBe(dr);
    expect(jeCalls[0].creditAccount).toBe(cr);
    expect(jeCalls[0].amount).toBe(Math.abs(signed)); // always positive; direction carries the sign
    expect(jeCalls[0].currency).toBe('USD');
  });

  it('posts one directional entry per currency under a single parent, and skips zeros', async () => {
    await post('customer', { USD: 100, LBP: -5000, AED: 0 });
    expect(addedTransactions).toHaveLength(1); // single parent row
    expect(jeCalls).toHaveLength(2); // USD + LBP; AED (0) skipped

    const byCur = Object.fromEntries(jeCalls.map((c) => [c.currency, c]));
    expect(byCur.USD.debitAccount).toBe('1200'); // +100 → Dr AR
    expect(byCur.LBP.debitAccount).toBe('3100'); // -5000 → Dr Equity
    expect(byCur.LBP.amount).toBe(5000);
  });

  it('is a no-op (no rows) when all balances are zero', async () => {
    const res = await post('supplier', { USD: 0 });
    expect(res.success).toBe(true);
    expect(res.transactionId).toBeNull();
    expect(addedTransactions).toHaveLength(0);
    expect(jeCalls).toHaveLength(0);
  });
});
