/**
 * Accounting currency helpers (Phase 11 / 008-multi-currency-country, Task 16c).
 *
 * The `journal_entries.amounts` JSONB and `balance_snapshots.balances`
 * JSONB are the new, self-describing carriers for per-currency ledger
 * data. The deprecated USD/LBP scalar columns remain during the
 * dual-write transition; helpers here let callers move to the map shape
 * without reaching for `entry.debit_usd` etc. directly.
 *
 * Shapes:
 *   amounts:  { [CurrencyCode]: { debit: number; credit: number } }
 *   balances: { [CurrencyCode]: number }
 *
 * Read helpers tolerate missing keys (return 0); write helpers prune
 * zero entries to keep the map shape minimal.
 */

import type { CurrencyCode } from '@pos-platform/shared';
import type { JournalEntryAmounts, BalanceSnapshotMap } from '../types/accounting';

/**
 * Build a JournalEntryAmounts map from a list of per-currency lines.
 * Lines with both debit and credit equal to 0 are dropped.
 */
export function buildEntryAmounts(
  lines: Array<{ currency: CurrencyCode; debit: number; credit: number }>
): JournalEntryAmounts {
  const map: JournalEntryAmounts = {};
  for (const line of lines) {
    const debit = Number(line.debit) || 0;
    const credit = Number(line.credit) || 0;
    if (debit === 0 && credit === 0) continue;
    map[line.currency] = { debit, credit };
  }
  return map;
}

/**
 * Convenience wrapper for the common dual-currency entry shape (USD + LBP)
 * that the existing journalService uses. Pass through the same numbers
 * that go into the deprecated `debit_usd`/`credit_usd`/`debit_lbp`/`credit_lbp`
 * columns and get back the equivalent JSONB map for dual-write.
 */
export function buildLegacyDualAmounts(args: {
  debit_usd?: number;
  credit_usd?: number;
  debit_lbp?: number;
  credit_lbp?: number;
}): JournalEntryAmounts {
  return buildEntryAmounts([
    { currency: 'USD', debit: args.debit_usd ?? 0, credit: args.credit_usd ?? 0 },
    { currency: 'LBP', debit: args.debit_lbp ?? 0, credit: args.credit_lbp ?? 0 },
  ]);
}

/** Build a BalanceSnapshotMap from a list of per-currency balances. */
export function buildBalances(
  lines: Array<{ currency: CurrencyCode; balance: number }>
): BalanceSnapshotMap {
  const map: BalanceSnapshotMap = {};
  for (const line of lines) {
    const balance = Number(line.balance) || 0;
    if (balance === 0) continue;
    map[line.currency] = balance;
  }
  return map;
}

/** Read the debit for a specific currency from a JournalEntryAmounts map. */
export function getDebit(amounts: JournalEntryAmounts | undefined, currency: CurrencyCode): number {
  return amounts?.[currency]?.debit ?? 0;
}

/** Read the credit for a specific currency from a JournalEntryAmounts map. */
export function getCredit(amounts: JournalEntryAmounts | undefined, currency: CurrencyCode): number {
  return amounts?.[currency]?.credit ?? 0;
}

/** Read the running balance for a specific currency from a BalanceSnapshotMap. */
export function getBalance(balances: BalanceSnapshotMap | undefined, currency: CurrencyCode): number {
  return balances?.[currency] ?? 0;
}

/** Return every currency present in a JournalEntryAmounts map. */
export function amountCurrencies(amounts: JournalEntryAmounts | undefined): CurrencyCode[] {
  if (!amounts) return [];
  return Object.keys(amounts) as CurrencyCode[];
}

/** Return every currency present in a BalanceSnapshotMap. */
export function balanceCurrencies(balances: BalanceSnapshotMap | undefined): CurrencyCode[] {
  if (!balances) return [];
  return Object.keys(balances) as CurrencyCode[];
}

/**
 * Reverse a JournalEntryAmounts map (swap debit/credit for every currency).
 * Used by reversal entries — the original entry's debit becomes the
 * reversal's credit, and vice versa, preserving currency identity.
 */
export function reverseAmounts(amounts: JournalEntryAmounts | undefined): JournalEntryAmounts {
  const out: JournalEntryAmounts = {};
  if (!amounts) return out;
  for (const [code, { debit, credit }] of Object.entries(amounts) as Array<
    [CurrencyCode, { debit: number; credit: number }]
  >) {
    out[code] = { debit: credit, credit: debit };
  }
  return out;
}

/**
 * Coerce an entry that may carry only the deprecated scalar columns into
 * a JournalEntryAmounts map. Useful for read paths during the dual-write
 * transition: callers that prefer the map shape can normalize once, and
 * legacy rows still in flight from older clients won't be invisible.
 */
export function amountsFromLegacyEntry(entry: {
  amounts?: JournalEntryAmounts;
  debit_usd?: number;
  credit_usd?: number;
  debit_lbp?: number;
  credit_lbp?: number;
}): JournalEntryAmounts {
  if (entry.amounts && Object.keys(entry.amounts).length > 0) return entry.amounts;
  return buildLegacyDualAmounts(entry);
}

/** Same idea for balance_snapshots rows. */
export function balancesFromLegacySnapshot(snapshot: {
  balances?: BalanceSnapshotMap;
  balance_usd?: number;
  balance_lbp?: number;
}): BalanceSnapshotMap {
  if (snapshot.balances && Object.keys(snapshot.balances).length > 0) return snapshot.balances;
  return buildBalances([
    { currency: 'USD', balance: snapshot.balance_usd ?? 0 },
    { currency: 'LBP', balance: snapshot.balance_lbp ?? 0 },
  ]);
}
