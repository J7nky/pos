/**
 * Balance sheet equity derivation (financialStatementService.getBalanceSheet).
 *
 * The close posts NO closing journal entries, so equity is DERIVED:
 *   - Retained Earnings = Σ(revenue − expense) for fiscal years before the current one.
 *   - Current Year Earnings = Σ(revenue − expense) within the current fiscal year.
 * Together they equal all-time (revenue − expense), so Assets = Liab + Equity
 * balances in EVERY fiscal year (regression: it used to unbalance after year 1
 * because only current-year earnings were plugged, and the FY boundary was
 * hardcoded to Jan 1, ignoring a configured fiscal-year start).
 */
/* eslint-disable @typescript-eslint/no-explicit-any -- seed rows mirror Dexie shapes */
import { describe, it, expect, vi, beforeEach } from 'vitest';

type Row = Record<string, any>;
let journalRows: Row[] = [];
let accountRows: Row[] = [];
let storeRow: Row | undefined;

vi.mock('../../lib/db', () => ({
  getDB: () => ({
    journal_entries: {
      where: (field: string) => ({
        equals: (value: any) => ({
          toArray: async () =>
            journalRows.filter((r) => (field === 'store_id' ? r.store_id === value : false)),
        }),
      }),
    },
    chart_of_accounts: {
      where: (_field: string) => ({
        equals: (value: any) => ({ toArray: async () => accountRows.filter((r) => r.store_id === value) }),
      }),
    },
    stores: { get: async (_id: string) => storeRow },
  }),
}));

import { getBalanceSheet } from '../financialStatementService';

function acct(code: string, type: string, name = code): Row {
  return { store_id: 'store-1', account_code: code, account_name: name, account_type: type, is_active: true };
}
function leg(code: string, debit: number, credit: number, postedDate: string): Row {
  return {
    store_id: 'store-1',
    account_code: code,
    amounts: { USD: { debit, credit } },
    posted_date: postedDate,
    is_posted: true,
  };
}

const usd = (n: number | undefined) => n ?? 0;

beforeEach(() => {
  journalRows = [];
  accountRows = [acct('1100', 'asset', 'Cash'), acct('4000', 'revenue', 'Sales'), acct('5000', 'expense', 'COGS')];
  storeRow = { id: 'store-1' }; // default (calendar) fiscal year
});

describe('getBalanceSheet — derived equity earnings', () => {
  it('splits prior-year net income into Retained Earnings and current-year into CYE, and balances', async () => {
    journalRows = [
      // Prior FY (2025): sale of 100 → +100 net income → Retained Earnings
      leg('1100', 100, 0, '2025-05-01T10:00:00.000Z'),
      leg('4000', 0, 100, '2025-05-01T10:00:00.000Z'),
      // Current FY (2026): sale of 60 and expense of 20 → +40 → CYE
      leg('1100', 60, 0, '2026-03-01T10:00:00.000Z'),
      leg('4000', 0, 60, '2026-03-01T10:00:00.000Z'),
      leg('5000', 20, 0, '2026-04-01T10:00:00.000Z'),
      leg('1100', 0, 20, '2026-04-01T10:00:00.000Z'),
    ];

    const report = await getBalanceSheet({ storeId: 'store-1', asOfDate: '2026-06-30' });
    const col = report.columns[0];

    expect(usd(col.retainedEarnings.nativeBalance.USD)).toBe(100);
    expect(usd(col.currentYearEarnings.nativeBalance.USD)).toBe(40);
    expect(col.isBalanced).toBe(true); // assets 140 = equity (100 + 40)
    expect(report.warnings.some((w) => w.type === 'gl_unbalanced')).toBe(false);

    const codes = report.lines.map((l) => l.account_code);
    expect(codes).toContain('RE');
    expect(codes).toContain('CYE');
  });

  it('respects a NON-calendar fiscal-year start (April 1) when splitting earnings', async () => {
    storeRow = { id: 'store-1', fiscal_year_start_month: 4, fiscal_year_start_day: 1 };
    journalRows = [
      // 2026-02-01 falls in FY Apr-2025..Mar-2026 → PRIOR (would be mis-bucketed as
      // current under the old hardcoded Jan-1 logic).
      leg('1100', 30, 0, '2026-02-01T10:00:00.000Z'),
      leg('4000', 0, 30, '2026-02-01T10:00:00.000Z'),
      // 2026-05-01 is in the current FY (Apr-2026..Mar-2027) → CURRENT.
      leg('1100', 50, 0, '2026-05-01T10:00:00.000Z'),
      leg('4000', 0, 50, '2026-05-01T10:00:00.000Z'),
    ];

    const col = (await getBalanceSheet({ storeId: 'store-1', asOfDate: '2026-06-30' })).columns[0];
    expect(usd(col.retainedEarnings.nativeBalance.USD)).toBe(30);
    expect(usd(col.currentYearEarnings.nativeBalance.USD)).toBe(50);
    expect(col.isBalanced).toBe(true);
  });

  it('emits no Retained Earnings line in a store\'s first year (no prior activity)', async () => {
    journalRows = [
      leg('1100', 75, 0, '2026-02-01T10:00:00.000Z'),
      leg('4000', 0, 75, '2026-02-01T10:00:00.000Z'),
    ];
    const report = await getBalanceSheet({ storeId: 'store-1', asOfDate: '2026-06-30' });
    const col = report.columns[0];
    expect(usd(col.currentYearEarnings.nativeBalance.USD)).toBe(75);
    expect(usd(col.retainedEarnings.nativeBalance.USD)).toBe(0);
    expect(report.lines.map((l) => l.account_code)).not.toContain('RE');
    expect(col.isBalanced).toBe(true);
  });
});
