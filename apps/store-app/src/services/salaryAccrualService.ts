/**
 * Salary Accrual Service
 *
 * Posts a monthly Dr 5200 Salaries Expense / Cr 2200 Salaries Payable journal entry
 * for every active employee with a configured monthly_salary + salary_currency.
 *
 * Idempotency: each accrual transaction uses a deterministic id of the form
 *   `salary-accrual-{employeeId}-{YYYY-MM}`
 * so two offline devices that compute the same period collide on the
 * `transactions.id` primary key (one row survives on sync). No new schema columns.
 *
 * Trigger: fires once per app session, post-hydration, from OfflineDataContext.
 * Long-offline catch-up is automatic (a 6-month-offline device posts 6 entries
 * on next launch; re-running posts zero).
 */

import { v5 as uuidv5 } from 'uuid';
import { getDB } from '../lib/db';
import { transactionService } from './transactionService';
import { TRANSACTION_CATEGORIES } from '../constants/transactionCategories';
import { CURRENCY_META, type CurrencyCode } from '@pos-platform/shared';
import type { Employee } from '../types';

// Stable namespace UUID for deterministic salary-accrual transaction ids.
// Two devices that compute uuidv5 for the same (employee, period) produce the
// same UUID, so the transactions.id PK collides on sync (one row survives).
// This namespace value is part of the protocol — DO NOT change it after release.
const SALARY_ACCRUAL_NAMESPACE = '6c8e9a40-4f0e-4d4b-8c6e-5f4d3e2c1b0a';

function deterministicAccrualId(employeeId: string, period: string): string {
  return uuidv5(`salary-accrual:${employeeId}:${period}`, SALARY_ACCRUAL_NAMESPACE);
}

interface AccrualPlanItem {
  period: string; // 'YYYY-MM'
  amount: number;
  entryDate: string; // ISO datetime, set to last day of period
  isProrated: boolean;
  proratedDays: number;
  totalDays: number;
}

function pad2(n: number): string {
  return n < 10 ? `0${n}` : String(n);
}

function periodKeyOf(date: Date): string {
  return `${date.getUTCFullYear()}-${pad2(date.getUTCMonth() + 1)}`;
}

function nextPeriod(period: string): string {
  const [y, m] = period.split('-').map(Number);
  const d = new Date(Date.UTC(y, m, 1)); // m is 1-based -> Date.UTC(y, m, 1) is first of next
  return periodKeyOf(d);
}

function lastDayOfPeriod(period: string): { date: Date; days: number } {
  const [y, m] = period.split('-').map(Number); // m is 1-based
  // JS Date months are 0-indexed. With 1-based input m, `new Date(y, m, 0)` resolves to
  // day 0 of month m (i.e., May when m=5), which JS normalises to the last day of the
  // PREVIOUS calendar month — exactly the last day of period m. Using day 1 here would
  // land on the first of the next month (June 1 for m=5) and post accruals into the future.
  const date = new Date(y, m, 0, 23, 59, 59);
  const days = date.getDate();
  return { date, days };
}

function roundForCurrency(amount: number, currency: CurrencyCode): number {
  const decimals = CURRENCY_META[currency]?.decimals ?? 2;
  const factor = Math.pow(10, decimals);
  return Math.round(amount * factor) / factor;
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function ymdLocal(d: Date): string {
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
}

/**
 * In-place repair for SALARY_ACCRUAL rows posted with the wrong entry_date —
 * an earlier version of `lastDayOfPeriod` returned the first day of the next
 * month (period "2026-05" → posted_date "2026-06-01") instead of the last day
 * of the current period. Detects mismatched journal entries by comparing the
 * stored posted_date against the recomputed last-day-of-period from
 * metadata.period, fixes posted_date + fiscal_period in place, and marks the
 * rows unsynced so the corrected data flows back to Supabase via the existing
 * sync upload path.
 */
async function fixMisdatedAccruals(storeId: string): Promise<void> {
  try {
    const accruals = await getDB()
      .transactions
      .where('store_id')
      .equals(storeId)
      .filter((t) =>
        t.category === TRANSACTION_CATEGORIES.SALARY_ACCRUAL && t._deleted !== true,
      )
      .toArray();

    let fixedCount = 0;
    for (const txn of accruals) {
      const period = (txn.metadata as { period?: string } | undefined)?.period;
      if (!period || !/^\d{4}-\d{2}$/.test(period)) continue;

      const { date: expectedDate } = lastDayOfPeriod(period);
      const expectedPostedDate = ymdLocal(expectedDate);
      const expectedFiscal = expectedPostedDate.slice(0, 7);

      const entries = await getDB().journal_entries.where('transaction_id').equals(txn.id).toArray();
      const misdatedEntries = entries.filter((e) => e.posted_date !== expectedPostedDate);
      const txnNeedsFix = ymdLocal(new Date(txn.created_at)).slice(0, 7) !== expectedFiscal;
      if (misdatedEntries.length === 0 && !txnNeedsFix) continue;

      await getDB().transaction('rw', [getDB().transactions, getDB().journal_entries], async () => {
        for (const entry of misdatedEntries) {
          await getDB().journal_entries.update(entry.id, {
            posted_date: expectedPostedDate,
            fiscal_period: expectedFiscal,
            _synced: false,
          });
        }
        if (txnNeedsFix) {
          await getDB().transactions.update(txn.id, {
            created_at: expectedDate.toISOString(),
            _synced: false,
          });
        }
      });
      fixedCount += 1;
    }

    if (fixedCount > 0) {
      console.log(`[salary-accrual] repaired ${fixedCount} misdated accrual(s); next sync will push corrections`);
    }
  } catch (err) {
    console.warn('[salary-accrual] misdate repair failed (non-fatal)', err);
  }
}

async function cleanupInvalidLegacyAccruals(storeId: string): Promise<void> {
  try {
    const bad = await getDB()
      .transactions
      .where('store_id')
      .equals(storeId)
      .filter((t) =>
        t.category === TRANSACTION_CATEGORIES.SALARY_ACCRUAL &&
        typeof t.id === 'string' &&
        !UUID_RE.test(t.id),
      )
      .toArray();
    if (bad.length === 0) return;

    const badIds = bad.map((t) => t.id);
    await getDB().transaction('rw', [getDB().transactions, getDB().journal_entries], async () => {
      await getDB().journal_entries.where('transaction_id').anyOf(badIds).delete();
      await getDB().transactions.bulkDelete(badIds);
    });
    console.log(`[salary-accrual] cleaned up ${badIds.length} invalid pre-fix accrual row(s)`);
  } catch (err) {
    console.warn('[salary-accrual] legacy cleanup failed (non-fatal)', err);
  }
}

async function findLastAccrualPeriod(employeeId: string): Promise<string | null> {
  // Query the transactions table by employee + accrual category. The deterministic
  // UUIDv5 id can't be parsed for the period, so we read it from metadata.period
  // (always set when posting an accrual). Falls back to created_at's YYYY-MM.
  const transactions = await getDB()
    .transactions
    .where('entity_id')
    .equals(employeeId)
    .filter((t) =>
      t.category === TRANSACTION_CATEGORIES.SALARY_ACCRUAL && t._deleted !== true,
    )
    .toArray();

  let max: string | null = null;
  for (const txn of transactions) {
    const metaPeriod = (txn.metadata as { period?: string } | undefined)?.period;
    const period = metaPeriod && /^\d{4}-\d{2}$/.test(metaPeriod)
      ? metaPeriod
      : (txn.created_at ?? '').slice(0, 7);
    if (!/^\d{4}-\d{2}$/.test(period)) continue;
    if (max === null || period > max) max = period;
  }
  return max;
}

function buildPlan(
  employee: Employee,
  monthlySalary: number,
  lastAccrual: string | null,
  currentPeriod: string,
): AccrualPlanItem[] {
  const hireDate = new Date(employee.created_at);
  const hirePeriod = periodKeyOf(hireDate);
  const startPeriod = lastAccrual ? nextPeriod(lastAccrual) : hirePeriod;

  const plan: AccrualPlanItem[] = [];
  let period = startPeriod;
  // Stop strictly before currentPeriod — current month accrues only on its last day.
  const today = new Date();
  const todayPeriod = periodKeyOf(today);
  const isTodayLastDayOfMonth = lastDayOfPeriod(todayPeriod).date.getDate() === today.getDate();

  while (period < currentPeriod || (period === currentPeriod && isTodayLastDayOfMonth)) {
    const { date: lastDay, days: totalDays } = lastDayOfPeriod(period);
    let amount = monthlySalary;
    let proratedDays = totalDays;
    let isProrated = false;

    // Prorate the hire month only when this is the very first accrual for this employee.
    if (lastAccrual === null && period === hirePeriod) {
      const hireDay = hireDate.getDate();
      proratedDays = totalDays - hireDay + 1; // inclusive of hire day
      if (proratedDays < totalDays) {
        amount = monthlySalary * (proratedDays / totalDays);
        isProrated = true;
      }
    }

    plan.push({
      period,
      amount,
      entryDate: lastDay.toISOString(),
      isProrated,
      proratedDays,
      totalDays,
    });

    if (period === currentPeriod) break;
    period = nextPeriod(period);
  }

  return plan;
}

async function postAccrual(
  employee: Employee,
  item: AccrualPlanItem,
  context: { storeId: string; branchId: string; userId: string },
): Promise<{ posted: boolean; reason?: string }> {
  const currency = employee.salary_currency as CurrencyCode;
  const amount = roundForCurrency(item.amount, currency);
  const transactionId = deterministicAccrualId(employee.id, item.period);

  // Pre-flight: skip if already in local Dexie (avoids the ConstraintError path
  // for the common case). The PK constraint is still the safety net for races.
  const existing = await getDB().transactions.get(transactionId);
  if (existing) return { posted: false, reason: 'already-exists' };

  try {
    const result = await transactionService.createTransaction({
      category: TRANSACTION_CATEGORIES.SALARY_ACCRUAL,
      amount,
      currency,
      description: {
        en: `Salary accrual for ${employee.name} — ${item.period}`,
        ar: `استحقاق راتب ${employee.name} — ${item.period}`,
      },
      context: {
        userId: context.userId,
        storeId: context.storeId,
        branchId: context.branchId,
        module: 'salary-accrual',
        source: 'web',
      },
      entityId: employee.id,
      transactionId,
      postedDate: item.entryDate,
      metadata: {
        period: item.period,
        prorated: item.isProrated,
        prorated_days: item.proratedDays,
        total_days: item.totalDays,
        hire_date: employee.created_at,
        original_currency: currency,
        original_amount: amount,
      },
      // Salary accrual does not touch cash; explicit just to be safe.
      updateCashDrawer: false,
    });

    if (!result.success) {
      return { posted: false, reason: result.error ?? 'createTransaction failed' };
    }
    return { posted: true };
  } catch (err) {
    // Constraint violation = another device posted the same accrual; treat as no-op.
    const msg = err instanceof Error ? err.message : String(err);
    if (msg.toLowerCase().includes('constraint')) {
      return { posted: false, reason: 'constraint (duplicate id)' };
    }
    throw err;
  }
}

async function accrueForEmployee(
  employee: Employee,
  context: { storeId: string; branchId: string; userId: string },
  currentPeriod: string,
): Promise<{ posted: number; skipped: number; errors: number }> {
  const stats = { posted: 0, skipped: 0, errors: 0 };

  if (employee._deleted) return stats;
  const monthlySalary = parseFloat(employee.monthly_salary ?? '');
  if (!Number.isFinite(monthlySalary) || monthlySalary <= 0) return stats;
  if (!employee.salary_currency) return stats;
  if (!employee.created_at) return stats;

  const lastAccrual = await findLastAccrualPeriod(employee.id);
  const plan = buildPlan(employee, monthlySalary, lastAccrual, currentPeriod);
  if (plan.length === 0) return stats;

  for (const item of plan) {
    try {
      const result = await postAccrual(employee, item, context);
      if (result.posted) stats.posted += 1;
      else stats.skipped += 1;
    } catch (err) {
      stats.errors += 1;
      console.error(
        `[salary-accrual] failed to post ${item.period} for employee ${employee.id}:`,
        err,
      );
    }
  }

  return stats;
}

export const salaryAccrualService = {
  /**
   * Sweep all employees in the store and post any due monthly accruals.
   * Best-effort: per-employee failures are logged and do not block other employees.
   */
  async runDueAccruals(
    storeId: string,
    branchId: string,
    userId: string,
  ): Promise<{ employees: number; posted: number; skipped: number; errors: number }> {
    const summary = { employees: 0, posted: 0, skipped: 0, errors: 0 };
    if (!storeId || !branchId || !userId) return summary;

    // One-shot cleanup of pre-fix local rows whose ids are non-UUID strings
    // (e.g., "salary-accrual-{empId}-2026-05"). These cannot upload to Supabase
    // (UUID column), so they fail forever in syncUpload. Drop them and their
    // journal entries; the deterministic UUIDv5 will re-post them this sweep.
    await cleanupInvalidLegacyAccruals(storeId);

    // One-shot repair for accruals posted with the wrong entry_date (period
    // "2026-05" written with posted_date "2026-06-01" before the lastDayOfPeriod
    // fix). Updates posted_date + fiscal_period in place and re-syncs.
    await fixMisdatedAccruals(storeId);

    const employees = await getDB()
      .users
      .where('store_id')
      .equals(storeId)
      .toArray() as Employee[];

    const currentPeriod = periodKeyOf(new Date());

    for (const employee of employees) {
      summary.employees += 1;
      try {
        const stats = await accrueForEmployee(
          employee,
          { storeId, branchId, userId },
          currentPeriod,
        );
        summary.posted += stats.posted;
        summary.skipped += stats.skipped;
        summary.errors += stats.errors;
      } catch (err) {
        summary.errors += 1;
        console.error(`[salary-accrual] employee sweep failed for ${employee.id}:`, err);
      }
    }

    if (summary.posted > 0 || summary.errors > 0) {
      console.log('[salary-accrual] sweep complete', summary);
    }
    return summary;
  },

  // Exported for tests / debugging
  _internal: {
    findLastAccrualPeriod,
    buildPlan,
    periodKeyOf,
    nextPeriod,
    lastDayOfPeriod,
  },
};
