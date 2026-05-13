/**
 * Canonical Balance Calculation
 *
 * This is the SINGLE SOURCE OF TRUTH for balance calculations.
 * All balance queries MUST use this logic.
 *
 * Rule: Balances are DERIVED from journal entries, not stored values.
 * Reads consume the JSONB `amounts` map (Phase 11 / Layer 8). Per-currency
 * sums are computed dynamically — no hardcoded USD/LBP assumptions.
 */

import { getDB } from '../lib/db';
import type { JournalEntry } from '../types/accounting';
import { amountsFromLegacyEntry, getDebit, getCredit } from '../services/accountingCurrencyHelpers';
import type { CurrencyCode } from '@pos-platform/shared';

/**
 * The canonical balance calculation algorithm
 * This logic is NON-NEGOTIABLE per accounting principles
 *
 * @param entries - Journal entries to calculate balance from
 * @param currency - Currency to calculate balance for
 * @returns Balance (positive = entity owes you, negative = you owe entity)
 */
export function calculateBalance(entries: JournalEntry[], currency: CurrencyCode): number {
  return entries.reduce((sum, e) => {
    const map = amountsFromLegacyEntry(e as Parameters<typeof amountsFromLegacyEntry>[0]);
    return sum + getDebit(map, currency) - getCredit(map, currency);
  }, 0);
}

/**
 * Calculate balances for every currency that appears in the journal entries
 * (replaces the old USD+LBP-only `calculateBothCurrencies`).
 *
 * @param entries - Journal entries to calculate balance from
 * @returns Map of currency → asset-style balance (debit - credit)
 */
export function calculateAllCurrencies(entries: JournalEntry[]): Partial<Record<CurrencyCode, number>> {
  const out: Partial<Record<CurrencyCode, number>> = {};
  for (const e of entries) {
    const map = amountsFromLegacyEntry(e as Parameters<typeof amountsFromLegacyEntry>[0]);
    for (const code of Object.keys(map) as CurrencyCode[]) {
      const { debit, credit } = map[code]!;
      out[code] = (out[code] ?? 0) + debit - credit;
    }
  }
  return out;
}

/**
 * Same as `calculateAllCurrencies` but for LIABILITY accounts (credit - debit).
 * For liability accounts like Salaries Payable (2200):
 *   - Credits increase liability (we owe more) → positive balance
 *   - Debits decrease liability (we pay) → negative balance
 */
export function calculateAllCurrenciesLiability(
  entries: JournalEntry[]
): Partial<Record<CurrencyCode, number>> {
  const out: Partial<Record<CurrencyCode, number>> = {};
  for (const e of entries) {
    const map = amountsFromLegacyEntry(e as Parameters<typeof amountsFromLegacyEntry>[0]);
    for (const code of Object.keys(map) as CurrencyCode[]) {
      const { debit, credit } = map[code]!;
      out[code] = (out[code] ?? 0) + credit - debit;
    }
  }
  return out;
}

/**
 * Back-compat wrapper that returns the dual-currency `{ USD, LBP }` shape
 * many existing callers expect. Internally computes from the JSONB amounts
 * map; values default to 0 when a currency is not present.
 */
export function calculateBothCurrencies(entries: JournalEntry[]): { USD: number; LBP: number } {
  const all = calculateAllCurrencies(entries);
  return { USD: all.USD ?? 0, LBP: all.LBP ?? 0 };
}

/**
 * Back-compat wrapper for liability accounts; same shape as
 * `calculateBothCurrencies`.
 */
export function calculateBothCurrenciesLiability(entries: JournalEntry[]): { USD: number; LBP: number } {
  const all = calculateAllCurrenciesLiability(entries);
  return { USD: all.USD ?? 0, LBP: all.LBP ?? 0 };
}

/**
 * Calculate employee balance from journal entries (TRUTH)
 *
 * Employees can have entries in TWO accounts:
 * 1. Account 1200 (Accounts Receivable) — for credit sales (Dr 1200 Cr 4100)
 * 2. Account 2200 (Salaries Payable) — for salary payments (Dr 2200 Cr 1100)
 *
 * Combined balance = Account 1200 balance - Account 2200 balance
 *   - Positive = they owe us more than we owe them (net receivable)
 *   - Negative = we owe them more than they owe us (net payable)
 */
export async function calculateEmployeeBalance(
  employeeId: string,
  currency: CurrencyCode
): Promise<number> {
  let entries1200: JournalEntry[] = [];
  let entries2200: JournalEntry[] = [];

  try {
    entries1200 = await getDB().journal_entries
      .where('[entity_id+account_code]')
      .equals([employeeId, '1200'])
      .and(e => e.is_posted === true)
      .toArray();

    entries2200 = await getDB().journal_entries
      .where('[entity_id+account_code]')
      .equals([employeeId, '2200'])
      .and(e => e.is_posted === true)
      .toArray();
  } catch (error) {
    console.warn('Compound index not available, using fallback query:', error);
    const allEntries = await getDB().journal_entries
      .where('entity_id')
      .equals(employeeId)
      .and(e => e.is_posted === true)
      .toArray();

    entries1200 = allEntries.filter(e => e.account_code === '1200');
    entries2200 = allEntries.filter(e => e.account_code === '2200');
  }

  // Asset-style for 1200, liability-style for 2200
  const balance1200 = entries1200.reduce((sum, e) => {
    const map = amountsFromLegacyEntry(e as Parameters<typeof amountsFromLegacyEntry>[0]);
    return sum + getDebit(map, currency) - getCredit(map, currency);
  }, 0);
  const balance2200 = entries2200.reduce((sum, e) => {
    const map = amountsFromLegacyEntry(e as Parameters<typeof amountsFromLegacyEntry>[0]);
    return sum + getCredit(map, currency) - getDebit(map, currency);
  }, 0);

  return balance1200 - balance2200;
}

/**
 * Calculate entity balance from journal entries (TRUTH)
 *
 * For customers (AR account 1200):
 *   - Positive balance = customer owes you
 *   - Negative balance = you owe customer
 *
 * For suppliers (AP account 2100):
 *   - Positive balance = you owe supplier
 *   - Negative balance = supplier owes you
 */
export async function calculateEntityBalance(
  entityId: string,
  currency: CurrencyCode,
  accountCode: '1200' | '2100' = '1200'
): Promise<number> {
  try {
    const entries = await getDB().journal_entries
      .where('[entity_id+account_code]')
      .equals([entityId, accountCode])
      .and(e => e.is_posted === true)
      .toArray();

    return calculateBalance(entries, currency);
  } catch (error) {
    console.warn('Compound index not available, using fallback query:', error);

    const entries = await getDB().journal_entries
      .where('entity_id')
      .equals(entityId)
      .and(e => e.account_code === accountCode && e.is_posted === true)
      .toArray();

    return calculateBalance(entries, currency);
  }
}

/**
 * Calculate expected cash drawer amount during a session in the store's
 * preferred currency. Reads cash entries (account 1100) between session
 * open and close, summing debits as inflows and credits as outflows.
 */
export async function calculateExpectedCashInSession(
  sessionId: string,
  currency: CurrencyCode = 'USD'
): Promise<{
  openingAmount: number;
  inflows: number;
  outflows: number;
  expectedAmount: number;
}> {
  const session = await getDB().cash_drawer_sessions.get(sessionId);
  if (!session) {
    throw new Error(`Session not found: ${sessionId}`);
  }

  const openingAmount = (session as { opening_amount?: number }).opening_amount || 0;
  const openedAt = new Date(session.opened_at);
  const closedAt = session.closed_at ? new Date(session.closed_at) : new Date();

  const entries = await getDB().journal_entries
    .where('account_code')
    .equals('1100')
    .and(e => {
      const entryDate = new Date(e.created_at);
      return (
        e.is_posted === true &&
        entryDate >= openedAt &&
        entryDate <= closedAt &&
        e.store_id === (session as { store_id?: string }).store_id
      );
    })
    .toArray();

  const inflows = entries.reduce((sum, e) => {
    const map = amountsFromLegacyEntry(e as Parameters<typeof amountsFromLegacyEntry>[0]);
    return sum + getDebit(map, currency);
  }, 0);
  const outflows = entries.reduce((sum, e) => {
    const map = amountsFromLegacyEntry(e as Parameters<typeof amountsFromLegacyEntry>[0]);
    return sum + getCredit(map, currency);
  }, 0);
  const expectedAmount = openingAmount + inflows - outflows;

  return {
    openingAmount,
    inflows,
    outflows,
    expectedAmount
  };
}

/**
 * @deprecated Balances are always calculated from journal entries — there
 * are no cached balance fields to verify against. Kept for back-compat.
 */
export async function verifyCachedBalance(
  entityId: string,
  currency: CurrencyCode
): Promise<{
  isValid: boolean;
  cachedBalance: number;
  journalBalance: number;
  difference: number;
}> {
  const entity = await getDB().entities.get(entityId);
  if (!entity) {
    throw new Error(`Entity not found: ${entityId}`);
  }

  const accountCode = entity.entity_type === 'supplier' ? '2100' : '1200';
  const journalBalance = await calculateEntityBalance(
    entityId,
    currency,
    accountCode as '1200' | '2100'
  );

  return {
    isValid: true,
    cachedBalance: journalBalance,
    journalBalance,
    difference: 0
  };
}

/**
 * Get balance for display (calculated from journal entries)
 */
export async function getDisplayBalance(
  entityId: string,
  currency: CurrencyCode
): Promise<number> {
  const entity = await getDB().entities.get(entityId);
  if (!entity) return 0;

  const accountCode = entity.entity_type === 'supplier' ? '2100' : '1200';
  return await calculateEntityBalance(
    entityId,
    currency,
    accountCode as '1200' | '2100'
  );
}

/**
 * Get balance with verification (slower but safer).
 */
export async function getTrueBalance(
  entityId: string,
  currency: CurrencyCode
): Promise<number> {
  const entity = await getDB().entities.get(entityId);
  if (!entity) return 0;

  const accountCode = entity.entity_type === 'supplier' ? '2100' : '1200';
  return await calculateEntityBalance(
    entityId,
    currency,
    accountCode as '1200' | '2100'
  );
}
