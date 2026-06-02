/**
 * fiscalYearService — unit tests for FY arithmetic.
 *
 * Locks in the contract that drives statement defaults, archive partitioning,
 * and year-end close: a fiscal year is exactly one calendar year long,
 * inclusive of its start_date and end_date, and the label reflects start year
 * (single) for Jan-aligned FYs or start-end (dual) for cross-year FYs.
 */

import { describe, it, expect } from 'vitest';
import {
  getFiscalYearByStartYear,
  getFiscalYearForDate,
  getCurrentFiscalYear,
  getAllFiscalYearsBetween,
  isFiscalYearClosed,
  findFiscalYearPeriod,
  type FiscalYearConfig,
} from '../fiscalYearService';
import type { FiscalYearPeriod } from '../../types';

const JAN1: FiscalYearConfig = { fiscal_year_start_month: 1, fiscal_year_start_day: 1 };
const APR1: FiscalYearConfig = { fiscal_year_start_month: 4, fiscal_year_start_day: 1 };
const JUL1: FiscalYearConfig = { fiscal_year_start_month: 7, fiscal_year_start_day: 1 };
const FEB29: FiscalYearConfig = { fiscal_year_start_month: 2, fiscal_year_start_day: 29 };

describe('fiscalYearService — getFiscalYearByStartYear', () => {
  it('Jan 1 → calendar-year FY with single-year label', () => {
    const fy = getFiscalYearByStartYear(2024, JAN1);
    expect(fy.label).toBe('FY 2024');
    expect(fy.start_date).toBe('2024-01-01');
    expect(fy.end_date).toBe('2024-12-31');
    expect(fy.start_year).toBe(2024);
    expect(fy.end_year).toBe(2024);
  });

  it('Apr 1 → cross-year FY with dual-year label', () => {
    const fy = getFiscalYearByStartYear(2024, APR1);
    expect(fy.label).toBe('FY 2024-25');
    expect(fy.start_date).toBe('2024-04-01');
    expect(fy.end_date).toBe('2025-03-31');
    expect(fy.start_year).toBe(2024);
    expect(fy.end_year).toBe(2025);
  });

  it('Jul 1 → cross-year FY ends Jun 30', () => {
    const fy = getFiscalYearByStartYear(2024, JUL1);
    expect(fy.label).toBe('FY 2024-25');
    expect(fy.start_date).toBe('2024-07-01');
    expect(fy.end_date).toBe('2025-06-30');
  });

  it('clamps Feb 29 start to Feb 28 in non-leap start year', () => {
    const fy = getFiscalYearByStartYear(2025, FEB29); // 2025 is non-leap
    expect(fy.start_date).toBe('2025-02-28');
    // End is the day before Feb 28/29 the following year — 2026 also non-leap.
    expect(fy.end_date).toBe('2026-02-27');
  });

  it('keeps Feb 29 start in a leap start year; end = (next FY start - 1)', () => {
    const fy = getFiscalYearByStartYear(2024, FEB29); // 2024 is leap
    expect(fy.start_date).toBe('2024-02-29');
    // Next FY starts 2025-02-28 (clamped because 2025 not leap), so this
    // FY ends 2025-02-27. Yes there's a 1-day gap if you compare next start
    // to current end — that is the documented behavior of clamped Feb 29.
    expect(fy.end_date).toBe('2025-02-27');
  });

  it('defaults a missing config to Jan 1', () => {
    const fy = getFiscalYearByStartYear(2024, {});
    expect(fy.label).toBe('FY 2024');
    expect(fy.start_date).toBe('2024-01-01');
    expect(fy.end_date).toBe('2024-12-31');
  });
});

describe('fiscalYearService — getFiscalYearForDate', () => {
  it('Jan 1 FY — May 2024 falls in FY 2024', () => {
    const fy = getFiscalYearForDate('2024-05-15', JAN1);
    expect(fy.label).toBe('FY 2024');
  });

  it('Apr 1 FY — March 2024 falls in FY 2023', () => {
    const fy = getFiscalYearForDate('2024-03-15', APR1);
    expect(fy.label).toBe('FY 2023-24');
    expect(fy.start_date).toBe('2023-04-01');
    expect(fy.end_date).toBe('2024-03-31');
  });

  it('Apr 1 FY — April 1 2024 boundary falls in FY 2024-25', () => {
    const fy = getFiscalYearForDate('2024-04-01', APR1);
    expect(fy.label).toBe('FY 2024-25');
    expect(fy.start_date).toBe('2024-04-01');
  });

  it('Apr 1 FY — March 31 2024 is the last day of FY 2023-24', () => {
    const fy = getFiscalYearForDate('2024-03-31', APR1);
    expect(fy.label).toBe('FY 2023-24');
    expect(fy.end_date).toBe('2024-03-31');
  });

  it('Jan 1 FY — Dec 31 boundary stays in same FY', () => {
    const fy = getFiscalYearForDate('2024-12-31', JAN1);
    expect(fy.label).toBe('FY 2024');
  });

  it('accepts a Date object as well as a string', () => {
    const fy = getFiscalYearForDate(new Date(2024, 4, 15), JAN1);
    expect(fy.label).toBe('FY 2024');
  });
});

describe('fiscalYearService — getCurrentFiscalYear', () => {
  it('returns FY containing `now`', () => {
    const fy = getCurrentFiscalYear(new Date(2026, 4, 26), APR1); // May 26 2026
    expect(fy.label).toBe('FY 2026-27');
  });
});

describe('fiscalYearService — getAllFiscalYearsBetween', () => {
  it('descends from current FY back through earliest, inclusive', () => {
    const now = new Date(2026, 4, 26);
    const fys = getAllFiscalYearsBetween('2024-01-15', now, JAN1);
    expect(fys.map(f => f.label)).toEqual(['FY 2026', 'FY 2025', 'FY 2024']);
  });

  it('handles single FY when earliest and now are in the same year', () => {
    const now = new Date(2026, 4, 26);
    const fys = getAllFiscalYearsBetween('2026-01-15', now, JAN1);
    expect(fys.map(f => f.label)).toEqual(['FY 2026']);
  });

  it('respects cross-year FYs', () => {
    const now = new Date(2026, 4, 26); // May 26 2026 → FY 2026-27
    const fys = getAllFiscalYearsBetween('2024-04-15', now, APR1);
    expect(fys.map(f => f.label)).toEqual([
      'FY 2026-27',
      'FY 2025-26',
      'FY 2024-25',
    ]);
  });
});

describe('fiscalYearService — closed-period lookups', () => {
  const fy2024 = getFiscalYearByStartYear(2024, JAN1);
  const fy2025 = getFiscalYearByStartYear(2025, JAN1);

  const periods: FiscalYearPeriod[] = [
    {
      id: 'p1',
      store_id: 's1',
      fy_label: 'FY 2024',
      start_date: '2024-01-01',
      end_date: '2024-12-31',
      is_closed: true,
      closed_at: '2025-01-15T10:00:00.000Z',
      closed_by: 'u1',
      created_at: '2024-01-01T00:00:00.000Z',
      updated_at: '2025-01-15T10:00:00.000Z',
      _synced: true,
    },
    {
      id: 'p2',
      store_id: 's1',
      fy_label: 'FY 2025',
      start_date: '2025-01-01',
      end_date: '2025-12-31',
      is_closed: false,
      created_at: '2025-01-01T00:00:00.000Z',
      updated_at: '2025-01-01T00:00:00.000Z',
      _synced: true,
    },
  ];

  it('isFiscalYearClosed → true for closed period', () => {
    expect(isFiscalYearClosed(fy2024, periods)).toBe(true);
  });

  it('isFiscalYearClosed → false for open period', () => {
    expect(isFiscalYearClosed(fy2025, periods)).toBe(false);
  });

  it('isFiscalYearClosed → false when no matching period row exists', () => {
    const fy2023 = getFiscalYearByStartYear(2023, JAN1);
    expect(isFiscalYearClosed(fy2023, periods)).toBe(false);
  });

  it('isFiscalYearClosed ignores soft-deleted rows', () => {
    const withDeleted: FiscalYearPeriod[] = [
      { ...periods[0], _deleted: true },
    ];
    expect(isFiscalYearClosed(fy2024, withDeleted)).toBe(false);
  });

  it('findFiscalYearPeriod returns the matching row', () => {
    expect(findFiscalYearPeriod(fy2024, periods)?.id).toBe('p1');
  });

  it('findFiscalYearPeriod returns undefined when missing', () => {
    const fy2023 = getFiscalYearByStartYear(2023, JAN1);
    expect(findFiscalYearPeriod(fy2023, periods)).toBeUndefined();
  });
});
