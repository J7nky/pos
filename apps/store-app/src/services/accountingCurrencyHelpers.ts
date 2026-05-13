/**
 * Accounting currency helpers.
 *
 * The `journal_entries.amounts` JSONB and `balance_snapshots.balances`
 * JSONB are the only carriers for per-currency ledger data — the legacy
 * USD/LBP scalar columns were dropped in Layer 8 finalization.
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
 * Convenience wrapper for the common dual-currency entry shape (USD + LBP).
 * Pass per-currency debit/credit numbers and get back the JSONB map that
 * goes into `journal_entries.amounts`.
 */
export function buildDualCurrencyAmounts(args: {
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

/** @deprecated Renamed to `buildDualCurrencyAmounts`. */
export const buildLegacyDualAmounts = buildDualCurrencyAmounts;

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
 * Read the JSONB amounts map from a journal entry. Returns `{}` if the
 * map is missing — callers should treat this as "no per-currency data".
 *
 * The name carries historical baggage from the dual-write transition; it
 * is now a simple identity-with-default helper preserved so existing
 * call sites keep working.
 */
export function amountsFromLegacyEntry(entry: {
  amounts?: JournalEntryAmounts;
}): JournalEntryAmounts {
  return entry.amounts ?? {};
}

/** Read the JSONB balances map from a snapshot row, defaulting to `{}`. */
export function balancesFromLegacySnapshot(snapshot: {
  balances?: BalanceSnapshotMap;
}): BalanceSnapshotMap {
  return snapshot.balances ?? {};
}
