// Fiscal Period Utilities
// Based on ACCOUNTING_FOUNDATION_MIGRATION_PLAN.md

import { FiscalPeriod } from '../types/accounting';

/**
 * Get current fiscal period
 */
export function getCurrentFiscalPeriod(): FiscalPeriod {
  const now = new Date();
  const year = now.getFullYear();
  const month = now.getMonth() + 1; // JavaScript months are 0-indexed
  
  return {
    year,
    month,
    period: `${year}-${month.toString().padStart(2, '0')}`
  };
}

/**
 * Get fiscal period for a specific date
 */
export function getFiscalPeriodForDate(date: Date | string): FiscalPeriod {
  const d = typeof date === 'string' ? new Date(date) : date;
  const year = d.getFullYear();
  const month = d.getMonth() + 1;
  
  return {
    year,
    month,
    period: `${year}-${month.toString().padStart(2, '0')}`
  };
}

/**
 * Get fiscal period from period string
 */
export function parseFiscalPeriod(periodString: string): FiscalPeriod {
  const [yearStr, monthStr] = periodString.split('-');
  const year = parseInt(yearStr, 10);
  const month = parseInt(monthStr, 10);
  
  if (isNaN(year) || isNaN(month) || month < 1 || month > 12) {
    throw new Error(`Invalid fiscal period format: ${periodString}`);
  }
  
  return {
    year,
    month,
    period: periodString
  };
}

/**
 * Get previous fiscal period
 */
export function getPreviousFiscalPeriod(period: FiscalPeriod): FiscalPeriod {
  let { year, month } = period;
  
  month--;
  if (month < 1) {
    month = 12;
    year--;
  }
  
  return {
    year,
    month,
    period: `${year}-${month.toString().padStart(2, '0')}`
  };
}

/**
 * Get next fiscal period
 */
export function getNextFiscalPeriod(period: FiscalPeriod): FiscalPeriod {
  let { year, month } = period;
  
  month++;
  if (month > 12) {
    month = 1;
    year++;
  }
  
  return {
    year,
    month,
    period: `${year}-${month.toString().padStart(2, '0')}`
  };
}

/**
 * Get start and end dates for a fiscal period
 */
export function getFiscalPeriodDates(period: FiscalPeriod): { start: Date; end: Date } {
  const start = new Date(period.year, period.month - 1, 1); // First day of month
  const end = new Date(period.year, period.month, 0); // Last day of month
  
  return { start, end };
}

/**
 * Check if a date falls within a fiscal period
 */
export function isDateInFiscalPeriod(date: Date | string, period: FiscalPeriod): boolean {
  const d = typeof date === 'string' ? new Date(date) : date;
  const { start, end } = getFiscalPeriodDates(period);
  
  return d >= start && d <= end;
}

/**
 * Get fiscal periods between two dates
 */
export function getFiscalPeriodsInRange(startDate: Date | string, endDate: Date | string): FiscalPeriod[] {
  const start = typeof startDate === 'string' ? new Date(startDate) : startDate;
  const end = typeof endDate === 'string' ? new Date(endDate) : endDate;
  
  const periods: FiscalPeriod[] = [];
  let current = getFiscalPeriodForDate(start);
  const endPeriod = getFiscalPeriodForDate(end);
  
  while (current.period <= endPeriod.period) {
    periods.push(current);
    current = getNextFiscalPeriod(current);
  }
  
  return periods;
}
