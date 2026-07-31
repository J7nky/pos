import { describe, it, expect } from 'vitest';
import { isClosedFiscalPeriodError, isUnrecoverableError } from '../syncUpload';

/**
 * The closed-fiscal-year trigger (reject_post_to_closed_fy) rejects offline
 * posts dated inside a period that was closed server-side. Such rows must be
 * PARKED, never retried forever and never hard-deleted. These tests pin the
 * two classification guards that make that safe.
 */
describe('closed fiscal period detection (syncUpload)', () => {
  const closedByCode = { code: '23001', message: 'Cannot post to closed fiscal year (posted_date=2026-01-05, store=abc)' };
  const closedByMessage = { code: undefined, message: 'Cannot post to closed fiscal year (posted_date=2026-01-05)' };
  const closedByHint = { code: undefined, message: 'restrict_violation', hint: 'Call reopen_fiscal_year() before posting adjustments.' };

  it('detects the closed-period rejection by SQLSTATE 23001', () => {
    expect(isClosedFiscalPeriodError(closedByCode)).toBe(true);
  });

  it('detects it by message signature even without the code', () => {
    expect(isClosedFiscalPeriodError(closedByMessage)).toBe(true);
  });

  it('detects it by the reopen_fiscal_year hint', () => {
    expect(isClosedFiscalPeriodError(closedByHint)).toBe(true);
  });

  it('does not misclassify unrelated errors', () => {
    expect(isClosedFiscalPeriodError({ code: '23503', message: 'foreign key violation' })).toBe(false);
    expect(isClosedFiscalPeriodError({ code: '23505', message: 'duplicate key value violates unique constraint' })).toBe(false);
    expect(isClosedFiscalPeriodError(null)).toBe(false);
  });

  it('NEVER classifies a closed-period error as unrecoverable (would hard-delete ledger rows)', () => {
    // Even if the message contained a keyword the generic classifier treats as
    // unrecoverable ("constraint"/"violates"), the closed-period guard wins.
    expect(isUnrecoverableError(closedByCode, 'journal_entries', {})).toBe(false);
    expect(isUnrecoverableError(closedByMessage, 'transactions', {})).toBe(false);
    expect(
      isUnrecoverableError(
        { code: '23001', message: 'Cannot post to closed fiscal year — constraint violates period lock' },
        'journal_entries',
        {},
      ),
    ).toBe(false);
  });

  it('still classifies genuine constraint violations as unrecoverable', () => {
    expect(isUnrecoverableError({ code: '23503', message: 'foreign key constraint' }, 'journal_entries', {})).toBe(true);
    expect(isUnrecoverableError({ code: '23502', message: 'null value violates not-null constraint' }, 'transactions', {})).toBe(true);
  });
});
