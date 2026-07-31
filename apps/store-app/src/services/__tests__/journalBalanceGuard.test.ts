import { describe, it, expect } from 'vitest';
import { assertEntriesBalanced } from '../journalService';
import type { JournalEntry } from '../../types/accounting';

/**
 * assertEntriesBalanced is the in-memory precondition that prevents an
 * unbalanced pair of journal entries from ever being persisted. It runs inside
 * the atomic write block (where the post-commit balance query is skipped), so
 * an imbalance rolls the whole transaction back. These tests pin that guard.
 */
function entry(amounts: JournalEntry['amounts']): JournalEntry {
  return {
    id: 'e', store_id: 's', branch_id: 'b', transaction_id: 't',
    account_code: '1000', account_name: 'x', amounts,
    entity_id: null, entity_type: 'customer', posted_date: '2026-01-01',
    fiscal_period: '2026-01', is_posted: true, description: 'x',
    created_at: '2026-01-01T00:00:00Z', created_by: 'u', _synced: false,
  } as unknown as JournalEntry;
}

describe('assertEntriesBalanced', () => {
  it('passes a balanced single-currency pair', () => {
    expect(() =>
      assertEntriesBalanced(
        [entry({ USD: { debit: 100, credit: 0 } }), entry({ USD: { debit: 0, credit: 100 } })],
        't1'
      )
    ).not.toThrow();
  });

  it('passes a balanced multi-currency pair', () => {
    expect(() =>
      assertEntriesBalanced(
        [entry({ USD: { debit: 10, credit: 0 }, LBP: { debit: 895000, credit: 0 } }),
         entry({ USD: { debit: 0, credit: 10 }, LBP: { debit: 0, credit: 895000 } })],
        't2'
      )
    ).not.toThrow();
  });

  it('tolerates sub-cent rounding residue (<= 0.01)', () => {
    expect(() =>
      assertEntriesBalanced(
        [entry({ USD: { debit: 100.005, credit: 0 } }), entry({ USD: { debit: 0, credit: 100 } })],
        't3'
      )
    ).not.toThrow();
  });

  it('THROWS on a single-currency imbalance', () => {
    expect(() =>
      assertEntriesBalanced(
        [entry({ USD: { debit: 100, credit: 0 } }), entry({ USD: { debit: 0, credit: 90 } })],
        't4'
      )
    ).toThrow(/Unbalanced journal entries.*USD/);
  });

  it('THROWS when one currency of a multi-currency pair is off', () => {
    expect(() =>
      assertEntriesBalanced(
        [entry({ USD: { debit: 10, credit: 0 }, LBP: { debit: 895000, credit: 0 } }),
         entry({ USD: { debit: 0, credit: 10 }, LBP: { debit: 0, credit: 894000 } })],
        't5'
      )
    ).toThrow(/Unbalanced journal entries.*LBP/);
  });

  it('THROWS when a currency exists only on the debit leg', () => {
    expect(() =>
      assertEntriesBalanced(
        [entry({ USD: { debit: 10, credit: 0 } }), entry({ LBP: { debit: 0, credit: 895000 } })],
        't6'
      )
    ).toThrow(/Unbalanced journal entries/);
  });
});
