/**
 * Currency-agnostic journal-amounts contract tests (Tier 8).
 *
 * Locks in the post-refactor contract:
 *   - A USD-only store produces journal entries whose `amounts` map carries
 *     ONLY a `USD` key — no `LBP` slot, no zero-padding.
 *   - A multi-currency entry produces a key per currency present.
 *   - The legacy-fallback reader returns the map verbatim.
 *   - `journalValidationService.validateJournalEntry` accepts a single-
 *     currency entry as valid (the pre-refactor implementation required
 *     either USD or LBP and would reject AED-only entries).
 */

import { describe, it, expect } from 'vitest';
import {
  buildEntryAmounts,
  buildDualCurrencyAmounts,
  amountsFromLegacyEntry,
  reverseAmounts,
  getDebit,
  getCredit,
  amountCurrencies,
} from '../accountingCurrencyHelpers';
import { journalValidationService } from '../journalValidationService';
import type { JournalEntry } from '../../types/accounting';

function fakeEntry(amounts: ReturnType<typeof buildEntryAmounts>): JournalEntry {
  return {
    id: 'je-1',
    store_id: 's-1',
    branch_id: null,
    transaction_id: 't-1',
    account_code: '1100',
    account_name: 'Cash',
    amounts,
    entity_id: 'e-1',
    entity_type: 'cash',
    posted_date: '2026-05-07',
    fiscal_period: '2026-05',
    is_posted: true,
    created_at: '2026-05-07T00:00:00Z',
    created_by: 'u-1',
    _synced: false,
  } as JournalEntry;
}

describe('journal amounts — currency-agnostic contract', () => {
  describe('buildEntryAmounts', () => {
    it('USD-only input produces a map with only the USD key', () => {
      const map = buildEntryAmounts([
        { currency: 'USD', debit: 100, credit: 0 },
      ]);
      expect(map).toEqual({ USD: { debit: 100, credit: 0 } });
      expect(Object.keys(map)).toEqual(['USD']);
    });

    it('drops zero-and-zero lines (no padding currencies)', () => {
      const map = buildEntryAmounts([
        { currency: 'USD', debit: 100, credit: 0 },
        { currency: 'LBP', debit: 0, credit: 0 },
      ]);
      expect(map).toEqual({ USD: { debit: 100, credit: 0 } });
      expect('LBP' in map).toBe(false);
    });

    it('preserves every currency that has activity', () => {
      const map = buildEntryAmounts([
        { currency: 'USD', debit: 100, credit: 0 },
        { currency: 'LBP', debit: 0, credit: 1500000 },
        { currency: 'AED', debit: 50, credit: 0 },
      ]);
      expect(amountCurrencies(map).sort()).toEqual(['AED', 'LBP', 'USD']);
    });

    it('coerces non-numeric inputs to 0', () => {
      const map = buildEntryAmounts([
        { currency: 'USD', debit: NaN, credit: 100 },
      ]);
      expect(map.USD).toEqual({ debit: 0, credit: 100 });
    });
  });

  describe('buildDualCurrencyAmounts', () => {
    it('USD-only legacy input produces single-key map', () => {
      const map = buildDualCurrencyAmounts({
        debit_usd: 100,
        credit_usd: 0,
        debit_lbp: 0,
        credit_lbp: 0,
      });
      expect(map).toEqual({ USD: { debit: 100, credit: 0 } });
    });

    it('LBP-only legacy input produces single-key map', () => {
      const map = buildDualCurrencyAmounts({
        debit_lbp: 1500000,
        credit_lbp: 0,
      });
      expect(map).toEqual({ LBP: { debit: 1500000, credit: 0 } });
    });
  });

  describe('amountsFromLegacyEntry', () => {
    it('returns the JSONB map verbatim when present', () => {
      const m = { USD: { debit: 100, credit: 0 } };
      expect(amountsFromLegacyEntry({ amounts: m })).toEqual(m);
    });

    it('returns empty object when the map is missing', () => {
      expect(amountsFromLegacyEntry({})).toEqual({});
    });
  });

  describe('reverseAmounts', () => {
    it('swaps debit and credit per currency', () => {
      const m = buildEntryAmounts([
        { currency: 'USD', debit: 100, credit: 0 },
        { currency: 'AED', debit: 0, credit: 50 },
      ]);
      const r = reverseAmounts(m);
      expect(r.USD).toEqual({ debit: 0, credit: 100 });
      expect(r.AED).toEqual({ debit: 50, credit: 0 });
    });

    it('handles undefined input safely', () => {
      expect(reverseAmounts(undefined)).toEqual({});
    });
  });

  describe('getDebit / getCredit', () => {
    it('reads zero for absent currencies (USD-only store reads LBP as 0)', () => {
      const m = buildEntryAmounts([{ currency: 'USD', debit: 100, credit: 0 }]);
      expect(getDebit(m, 'USD')).toBe(100);
      expect(getDebit(m, 'LBP')).toBe(0);
      expect(getCredit(m, 'USD')).toBe(0);
      expect(getCredit(m, 'LBP')).toBe(0);
    });
  });

  describe('journalValidationService.validateJournalEntry', () => {
    it('accepts a USD-only entry as valid', () => {
      const entry = fakeEntry(buildEntryAmounts([
        { currency: 'USD', debit: 100, credit: 0 },
      ]));
      const result = journalValidationService.validateJournalEntry(entry);
      expect(result.isValid).toBe(true);
      expect(result.errors).toEqual([]);
    });

    it('accepts an AED-only entry as valid (no USD or LBP required)', () => {
      const entry = fakeEntry(buildEntryAmounts([
        { currency: 'AED', debit: 200, credit: 0 },
      ]));
      const result = journalValidationService.validateJournalEntry(entry);
      expect(result.isValid).toBe(true);
      expect(result.errors).toEqual([]);
    });

    it('rejects an entry with no currency activity', () => {
      const entry = fakeEntry({});
      const result = journalValidationService.validateJournalEntry(entry);
      expect(result.isValid).toBe(false);
      expect(result.errors.join(' ')).toMatch(/currency/i);
    });

    it('rejects an entry with negative debit on a currency', () => {
      const entry = fakeEntry({ USD: { debit: -10, credit: 0 } });
      const result = journalValidationService.validateJournalEntry(entry);
      expect(result.isValid).toBe(false);
      expect(result.errors.join(' ')).toMatch(/negative|non-negative/i);
    });

    it('rejects an entry with both debit AND credit set on the same currency', () => {
      const entry = fakeEntry({ USD: { debit: 100, credit: 50 } });
      const result = journalValidationService.validateJournalEntry(entry);
      expect(result.isValid).toBe(false);
      expect(result.errors.join(' ')).toMatch(/both.*debit.*credit|debit.*credit/i);
    });
  });

  describe('USD-only store roundtrip', () => {
    it('a USD-only sale entry has only `USD` in the amounts map', () => {
      const debitEntry = fakeEntry(buildEntryAmounts([
        { currency: 'USD', debit: 50, credit: 0 },
      ]));
      const creditEntry = fakeEntry(buildEntryAmounts([
        { currency: 'USD', debit: 0, credit: 50 },
      ]));

      expect(Object.keys(debitEntry.amounts)).toEqual(['USD']);
      expect(Object.keys(creditEntry.amounts)).toEqual(['USD']);
      expect((debitEntry.amounts as Record<string, unknown>).LBP).toBeUndefined();
      expect((creditEntry.amounts as Record<string, unknown>).LBP).toBeUndefined();
    });

    it('debits and credits balance per currency for a USD-only entry pair', () => {
      const debitEntry = fakeEntry(buildEntryAmounts([
        { currency: 'USD', debit: 50, credit: 0 },
      ]));
      const creditEntry = fakeEntry(buildEntryAmounts([
        { currency: 'USD', debit: 0, credit: 50 },
      ]));

      const totalDebit = getDebit(debitEntry.amounts, 'USD') + getDebit(creditEntry.amounts, 'USD');
      const totalCredit = getCredit(debitEntry.amounts, 'USD') + getCredit(creditEntry.amounts, 'USD');
      expect(totalDebit).toBe(totalCredit);
    });
  });
});
