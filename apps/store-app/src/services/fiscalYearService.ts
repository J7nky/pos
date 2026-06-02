/**
 * fiscalYearService — pure utilities for resolving a store's fiscal year.
 *
 * The store carries (`fiscal_year_start_month`, `fiscal_year_start_day`) — both
 * default to (1, 1) = Jan 1. This module computes:
 *   - the FY containing a given date,
 *   - the FY range for a given start year,
 *   - the labeling convention (calendar-year-aligned vs. cross-year),
 *   - the closing state, given an array of FiscalYearPeriod rows from Dexie.
 *
 * All functions are pure — no DB / network. Date arithmetic is local-timezone:
 * fiscal-year boundaries are calendar dates, not instants. The service
 * intentionally avoids depending on `entities` / `journal_entries` so it can
 * be reused from anywhere (statement modal, settings UI, archive job).
 *
 * See OFFLINE_HISTORY_ARCHITECTURE.md §5.1.
 */

import type { FiscalYearPeriod } from '../types';

export interface FiscalYearConfig {
  fiscal_year_start_month?: number | null;
  fiscal_year_start_day?: number | null;
}

export interface FiscalYear {
  /** Plain-text identifier, e.g. "FY 2024" or "FY 2024-25". */
  label: string;
  /** YYYY-MM-DD — first day of the fiscal year, inclusive. */
  start_date: string;
  /** YYYY-MM-DD — last day of the fiscal year, inclusive. */
  end_date: string;
  /** Calendar year the FY begins in (e.g. 2024 for an Apr-2024-to-Mar-2025 FY). */
  start_year: number;
  /** Calendar year the FY ends in (e.g. 2025 for an Apr-2024-to-Mar-2025 FY). */
  end_year: number;
}

const DEFAULT_START_MONTH = 1;
const DEFAULT_START_DAY = 1;

function normalizeConfig(store: FiscalYearConfig): { month: number; day: number } {
  const month = clampMonth(store.fiscal_year_start_month ?? DEFAULT_START_MONTH);
  const rawDay = store.fiscal_year_start_day ?? DEFAULT_START_DAY;
  const day = Math.max(1, Math.min(31, Math.floor(rawDay)));
  return { month, day };
}

function clampMonth(m: number): number {
  const v = Math.floor(m);
  if (v < 1) return 1;
  if (v > 12) return 12;
  return v;
}

function lastDayOfMonth(year: number, monthOneBased: number): number {
  return new Date(year, monthOneBased, 0).getDate();
}

function clampDayToMonth(year: number, monthOneBased: number, day: number): number {
  const max = lastDayOfMonth(year, monthOneBased);
  return Math.min(day, max);
}

function toISODate(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function parseISODate(iso: string): Date {
  // Construct in local timezone — fiscal-year boundaries are calendar dates.
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(y, m - 1, d);
}

/**
 * Build the FY whose start year is `startYear` (the calendar year the FY
 * begins in, which equals the FY label when start month is Jan).
 */
export function getFiscalYearByStartYear(
  startYear: number,
  store: FiscalYearConfig
): FiscalYear {
  const { month, day } = normalizeConfig(store);

  const startDay = clampDayToMonth(startYear, month, day);
  const start = new Date(startYear, month - 1, startDay);

  // End = (next-year FY start) - 1 day, computed component-wise so that DST
  // transitions do not shift the date. Millisecond subtraction is incorrect:
  // in DST locales a "day" can be 23 or 25 hours.
  const nextStartDay = clampDayToMonth(startYear + 1, month, day);
  const end = new Date(startYear + 1, month - 1, nextStartDay);
  end.setDate(end.getDate() - 1);
  const endYear = end.getFullYear();

  const label = formatLabel(month, startYear, endYear);

  return {
    label,
    start_date: toISODate(start),
    end_date: toISODate(end),
    start_year: startYear,
    end_year: endYear,
  };
}

function formatLabel(startMonth: number, startYear: number, endYear: number): string {
  if (startMonth === 1) {
    // Calendar-year FY: single-year label.
    return `FY ${startYear}`;
  }
  // Cross-year FY: dual-year label like "FY 2024-25".
  const endShort = String(endYear).slice(-2);
  return `FY ${startYear}-${endShort}`;
}

/**
 * Return the fiscal year containing `date`.
 */
export function getFiscalYearForDate(
  date: Date | string,
  store: FiscalYearConfig
): FiscalYear {
  const d = typeof date === 'string' ? parseISODate(date) : date;
  const { month, day } = normalizeConfig(store);

  // Candidate start year is the calendar year of the date; if the date is
  // before the FY start within that calendar year, the FY actually started
  // in the previous calendar year.
  const calYear = d.getFullYear();
  const startThisYear = new Date(calYear, month - 1, clampDayToMonth(calYear, month, day));

  const startYear = d.getTime() >= startThisYear.getTime() ? calYear : calYear - 1;
  return getFiscalYearByStartYear(startYear, store);
}

/**
 * Convenience: the fiscal year containing "now" (caller can pass a clock).
 */
export function getCurrentFiscalYear(
  now: Date,
  store: FiscalYearConfig
): FiscalYear {
  return getFiscalYearForDate(now, store);
}

/**
 * Return all fiscal years from `earliestDate` up to and including the FY of
 * `now`, in descending order (newest first).
 */
export function getAllFiscalYearsBetween(
  earliestDate: Date | string,
  now: Date,
  store: FiscalYearConfig
): FiscalYear[] {
  const earliestFY = getFiscalYearForDate(earliestDate, store);
  const currentFY = getCurrentFiscalYear(now, store);

  const result: FiscalYear[] = [];
  for (let sy = currentFY.start_year; sy >= earliestFY.start_year; sy--) {
    result.push(getFiscalYearByStartYear(sy, store));
  }
  return result;
}

/**
 * Is the given fiscal year closed?
 * Looks up `periods` (typically the local Dexie copy) by matching FY label.
 */
export function isFiscalYearClosed(
  fy: FiscalYear,
  periods: FiscalYearPeriod[]
): boolean {
  const row = periods.find(p => p.fy_label === fy.label && !p._deleted);
  return Boolean(row?.is_closed);
}

/**
 * Find the existing fiscal_periods row for an FY, if one was synced down.
 */
export function findFiscalYearPeriod(
  fy: FiscalYear,
  periods: FiscalYearPeriod[]
): FiscalYearPeriod | undefined {
  return periods.find(p => p.fy_label === fy.label && !p._deleted);
}
