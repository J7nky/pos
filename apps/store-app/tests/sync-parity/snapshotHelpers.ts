import type { ParitySupabaseState } from './paritySupabaseMock';
import type { SyncResult } from '../../src/services/syncService';
import { getDB } from '../../src/lib/db';
import { expect } from 'vitest';

export async function snapshotServerState(state: ParitySupabaseState): Promise<Record<string, unknown[]>> {
  const out: Record<string, unknown[]> = {};
  for (const t of state.tables.keys()) {
    const rows = state.getAll(t);
    out[t] = [...rows].sort((a, b) => String(a.id).localeCompare(String(b.id)));
  }
  return out;
}

export async function snapshotLocalTables(tableNames: string[]): Promise<Record<string, unknown[]>> {
  const db = getDB();
  const out: Record<string, unknown[]> = {};
  for (const t of tableNames) {
    const table = (db as Record<string, { toArray: () => Promise<unknown[]> }>)[t];
    if (!table?.toArray) continue;
    const rows = await table.toArray();
    out[t] = [...rows].sort((a, b) =>
      String((a as { id: string }).id).localeCompare(String((b as { id: string }).id))
    );
  }
  return out;
}

export async function snapshotSyncMetadata(): Promise<unknown[]> {
  const rows = await getDB().sync_metadata.toArray();
  return [...rows].sort((a, b) =>
    String((a as { table_name: string }).table_name).localeCompare(
      String((b as { table_name: string }).table_name)
    )
  );
}

export interface ScenarioResultPayload {
  scenarioId: string;
  localSnapshot: Record<string, unknown>;
  serverSnapshot: Record<string, unknown>;
  syncMetadata: unknown;
  syncResult: SyncResult | null;
  /** Extra scenario-specific fields (e.g. upload order) */
  extras?: Record<string, unknown>;
}

export async function buildScenarioResult(
  scenarioId: string,
  state: ParitySupabaseState,
  syncResult: SyncResult | null,
  localTables: string[],
  extras?: Record<string, unknown>
): Promise<ScenarioResultPayload> {
  const [localSnap, serverSnap, meta] = await Promise.all([
    snapshotLocalTables(localTables),
    snapshotServerState(state),
    snapshotSyncMetadata(),
  ]);
  return {
    scenarioId,
    localSnapshot: localSnap,
    serverSnapshot: serverSnap,
    syncMetadata: meta,
    syncResult,
    extras,
  };
}

/**
 * Financial invariant checks — run after any scenario that creates journal_entries
 * or bill_line_items.  Catches cases where snapshot shape matches the golden but
 * the accounting logic is wrong.
 *
 * @param tables  - subset of tables to check (check all relevant if omitted)
 */
export async function assertInvariants(tables?: string[]): Promise<void> {
  const db = getDB();
  const check = (t: string) => !tables || tables.includes(t);

  // 1. Double-entry rule: for every transaction_id, sum(debit_usd) == sum(credit_usd)
  //    and sum(debit_lbp) == sum(credit_lbp)
  if (check('journal_entries')) {
    const entries = await db.journal_entries.toArray();
    const byTx = new Map<string, typeof entries>();
    for (const e of entries) {
      const key = e.transaction_id;
      if (!byTx.has(key)) byTx.set(key, []);
      byTx.get(key)!.push(e);
    }
    for (const [txId, txEntries] of byTx) {
      const totalDebitUsd = txEntries.reduce((s, e) => s + (e.debit_usd || 0), 0);
      const totalCreditUsd = txEntries.reduce((s, e) => s + (e.credit_usd || 0), 0);
      const totalDebitLbp = txEntries.reduce((s, e) => s + (e.debit_lbp || 0), 0);
      const totalCreditLbp = txEntries.reduce((s, e) => s + (e.credit_lbp || 0), 0);
      expect(
        Math.abs(totalDebitUsd - totalCreditUsd),
        `Double-entry violation (USD) for transaction_id ${txId}`
      ).toBeLessThanOrEqual(0.01);
      expect(
        Math.abs(totalDebitLbp - totalCreditLbp),
        `Double-entry violation (LBP) for transaction_id ${txId}`
      ).toBeLessThanOrEqual(1);
    }
  }

  // 2. Bill totals: for each bill, round(sum(line_total of non-deleted line_items)) within 0.01 of bill amount_paid
  if (check('bills') && check('bill_line_items')) {
    const bills = await db.bills.toArray();
    const lineItems = await db.bill_line_items.toArray();
    for (const bill of bills.filter((b) => !(b as any)._deleted)) {
      const lines = lineItems.filter(
        (li) => li.bill_id === bill.id && !(li as any)._deleted
      );
      if (lines.length === 0) continue;
      const lineSum = lines.reduce((s, li) => s + (li.line_total || 0), 0);
      expect(
        Math.abs(lineSum - bill.amount_paid),
        `Bill ${bill.id}: line_items sum (${lineSum}) does not match amount_paid (${bill.amount_paid})`
      ).toBeLessThanOrEqual(0.01);
    }
  }

  // 3. No orphaned bill_line_items (every bill_line_item.bill_id must point to an existing bill)
  if (check('bill_line_items')) {
    const bills = await db.bills.toArray();
    const billIds = new Set(bills.map((b) => b.id));
    const lineItems = await db.bill_line_items.toArray();
    for (const li of lineItems.filter((l) => !(l as any)._deleted)) {
      expect(
        billIds.has(li.bill_id),
        `Orphaned bill_line_item ${li.id}: bill_id ${li.bill_id} does not exist`
      ).toBe(true);
    }
  }
}

/**
 * Minimal payload for dual-path parity: same `products` row must result from
 * SyncService download and from EventStream `processEvent` (contract mocks).
 * `syncResult` is omitted so sync vs event paths compare the same shape.
 */
export async function buildDualPathParityPayload(
  scenarioId: string,
  state: ParitySupabaseState,
  extras?: Record<string, unknown>
): Promise<ScenarioResultPayload> {
  const [localSnap, serverSnap] = await Promise.all([
    snapshotLocalTables(['products']),
    snapshotServerState(state),
  ]);
  const products = (serverSnap.products ?? []) as unknown[];
  return {
    scenarioId,
    localSnapshot: { products: localSnap.products ?? [] },
    serverSnapshot: { products },
    syncMetadata: [],
    syncResult: null,
    extras: extras ?? {
      dualPath: {
        invariant: 'localSnapshot.products and serverSnapshot.products match after sync download vs event fetch',
      },
    },
  };
}
