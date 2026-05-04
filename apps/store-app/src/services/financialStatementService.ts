/**
 * Financial Statement Service — Phase 1 #2 (Trial Balance).
 *
 * Reads `journal_entries` directly from Dexie for period-bounded GL aggregations.
 * Joins with `chart_of_accounts` for account names/types and computes signed
 * balances by normal-balance rule. Multi-currency: every total is a
 * `Partial<Record<CurrencyCode, number>>` so AED/USD/LBP/etc. coexist without
 * consolidation. Reads from `journal_entries.amounts` (Phase 11 JSONB map) via
 * the `accountingCurrencyHelpers` getters; deprecated scalar columns are
 * never read here.
 *
 * Future home for `getBalanceSheet` / `getCashFlowStatement` (Phase 1 #2 sub-items).
 */
import type { CurrencyCode } from '@pos-platform/shared';
import { getDB } from '../lib/db';
import type { ChartOfAccounts, JournalEntry } from '../types/accounting';
import { amountsFromLegacyEntry, getCredit, getDebit } from './accountingCurrencyHelpers';
import { getLocalDateString } from '../utils/dateUtils';

export type CurrencyTotals = Partial<Record<CurrencyCode, number>>;

export type AccountType = 'asset' | 'liability' | 'equity' | 'revenue' | 'expense';

export type TrialBalanceFilters = {
  storeId: string;
  branchId?: string;
  /** Inclusive start, ISO date or datetime. */
  startDate: string;
  /** Inclusive end, ISO date or datetime. */
  endDate: string;
  /** When provided, the report is rerun for this range too (delta columns). */
  comparison?: { startDate: string; endDate: string };
  /** Default true — only sum entries flagged is_posted. */
  postedOnly?: boolean;
};

export type TrialBalanceRow = {
  account_code: string;
  account_name: string;
  account_type: AccountType;
  /** Sum of debits per currency over the period. */
  debits: CurrencyTotals;
  /** Sum of credits per currency over the period. */
  credits: CurrencyTotals;
  /** Signed by normal balance: asset/expense = debits − credits; others = credits − debits. */
  balance: CurrencyTotals;
};

export type TrialBalanceReport = {
  filters: TrialBalanceFilters;
  rows: TrialBalanceRow[];
  totals: { debits: CurrencyTotals; credits: CurrencyTotals };
  /** True per currency when |Σdebit − Σcredit| < 0.005. */
  isBalanced: Partial<Record<CurrencyCode, boolean>>;
  /** Currencies that appear anywhere in the report (sorted). */
  currencies: CurrencyCode[];
  generatedAt: string;
};

export type BalanceSheetSection =
  | 'current_asset'
  | 'non_current_asset'
  | 'current_liability'
  | 'non_current_liability'
  | 'equity';

export type PresentationMode = 'USD' | 'LBP' | 'dual';

export interface BalanceSheetFilters {
  storeId: string;
  branchId?: string;
  asOfDate: string;
  comparisons?: string[];
  presentationMode?: PresentationMode;
  presentationCurrency?: CurrencyCode;
  hideZeroBalanceAccounts?: boolean;
  postedOnly?: boolean;
}

type BalanceByColumn = Array<{
  columnId: string;
  asOfDate: string;
  nativeBalance: CurrencyTotals;
  presentationBalance?: number;
}>;

export interface BalanceSheetLine {
  account_code: string;
  account_name: string;
  account_type: 'asset' | 'liability' | 'equity';
  sub_classification: string;
  balanceByColumn: BalanceByColumn;
}

export interface BalanceSheetSubtotal {
  section: BalanceSheetSection;
  totalByColumn: BalanceByColumn;
}

export interface BalanceSheetColumn {
  columnId: string;
  asOfDate: string;
  unrealizedFxTranslation: {
    nativeBalance: CurrencyTotals;
    presentationBalance?: number;
  };
  isBalanced: boolean;
  variance?: CurrencyTotals;
  currentYearEarnings: {
    nativeBalance: CurrencyTotals;
    presentationBalance?: number;
  };
}

export type BalanceSheetWarning =
  | { type: 'gl_unbalanced'; columnId: string; variance: CurrencyTotals }
  | { type: 'unmapped_subclassification'; account_code: string };

export interface BalanceSheetReport {
  filters: BalanceSheetFilters;
  lines: BalanceSheetLine[];
  subtotals: BalanceSheetSubtotal[];
  columns: BalanceSheetColumn[];
  currencies: CurrencyCode[];
  warnings: BalanceSheetWarning[];
  generatedAt: string;
}

const BALANCE_EPSILON = 0.005;

function addAmount(totals: CurrencyTotals, currency: CurrencyCode, value: number): void {
  if (value === 0) return;
  totals[currency] = (totals[currency] ?? 0) + value;
}

function isDebitNormal(type: AccountType): boolean {
  return type === 'asset' || type === 'expense';
}

/**
 * Inclusive end-of-day. We accept either date-only ("YYYY-MM-DD") or full
 * datetime strings. The comparison uses ISO string ordering, which works for
 * both as long as the journal-entry posted_date is also ISO.
 */
function endOfDayIso(endDate: string): string {
  if (endDate.length <= 10) {
    return `${endDate}T23:59:59.999Z`;
  }
  return endDate;
}

function startOfDayIso(startDate: string): string {
  if (startDate.length <= 10) {
    return `${startDate}T00:00:00.000Z`;
  }
  return startDate;
}

async function fetchEntries(filters: {
  storeId: string;
  branchId?: string;
  startDate: string;
  endDate: string;
  postedOnly: boolean;
}): Promise<JournalEntry[]> {
  const start = startOfDayIso(filters.startDate);
  const end = endOfDayIso(filters.endDate);

  let collection;
  if (filters.branchId) {
    collection = getDB()
      .journal_entries.where('[store_id+branch_id]')
      .equals([filters.storeId, filters.branchId]);
  } else {
    collection = getDB().journal_entries.where('store_id').equals(filters.storeId);
  }

  const all = await collection.toArray();
  return all.filter((e) => {
    if (e._deleted) return false;
    if (filters.postedOnly && !e.is_posted) return false;
    if (!e.posted_date) return false;
    return e.posted_date >= start && e.posted_date <= end;
  });
}

function buildRow(
  account: ChartOfAccounts,
  entries: JournalEntry[],
  trackedCurrencies: Set<CurrencyCode>,
): TrialBalanceRow {
  const debits: CurrencyTotals = {};
  const credits: CurrencyTotals = {};

  for (const entry of entries) {
    const amounts = amountsFromLegacyEntry(entry);
    for (const code of Object.keys(amounts) as CurrencyCode[]) {
      const debit = getDebit(amounts, code);
      const credit = getCredit(amounts, code);
      if (debit === 0 && credit === 0) continue;
      addAmount(debits, code, debit);
      addAmount(credits, code, credit);
      trackedCurrencies.add(code);
    }
  }

  const balance: CurrencyTotals = {};
  const debitNormal = isDebitNormal(account.account_type as AccountType);
  const allCurrencies = new Set<CurrencyCode>([
    ...(Object.keys(debits) as CurrencyCode[]),
    ...(Object.keys(credits) as CurrencyCode[]),
  ]);
  for (const code of allCurrencies) {
    const d = debits[code] ?? 0;
    const c = credits[code] ?? 0;
    const signed = debitNormal ? d - c : c - d;
    if (signed !== 0) balance[code] = signed;
  }

  return {
    account_code: account.account_code,
    account_name: account.account_name,
    account_type: account.account_type as AccountType,
    debits,
    credits,
    balance,
  };
}

/**
 * Build a Trial Balance for the given period. Rows are returned sorted by
 * account_code. Empty rows (no activity in the period) are dropped unless
 * the account is active and has a balance from prior periods — Trial Balance
 * here is strictly period activity, not running balance, so we simply omit
 * accounts with no entries in [startDate, endDate].
 */
export async function getTrialBalance(
  filters: TrialBalanceFilters,
): Promise<TrialBalanceReport> {
  const postedOnly = filters.postedOnly ?? true;

  const [entries, accountsRaw] = await Promise.all([
    fetchEntries({
      storeId: filters.storeId,
      branchId: filters.branchId,
      startDate: filters.startDate,
      endDate: filters.endDate,
      postedOnly,
    }),
    getDB().chart_of_accounts.where('store_id').equals(filters.storeId).toArray(),
  ]);

  const accounts = accountsRaw.filter((a) => a.is_active !== false);
  const accountByCode = new Map<string, ChartOfAccounts>(
    accounts.map((a) => [a.account_code, a as ChartOfAccounts]),
  );

  const entriesByAccount = new Map<string, JournalEntry[]>();
  for (const entry of entries) {
    if (!entriesByAccount.has(entry.account_code)) {
      entriesByAccount.set(entry.account_code, []);
    }
    entriesByAccount.get(entry.account_code)!.push(entry);
  }

  const trackedCurrencies = new Set<CurrencyCode>();
  const rows: TrialBalanceRow[] = [];
  for (const [code, accEntries] of entriesByAccount) {
    const account = accountByCode.get(code);
    if (!account) {
      // Unknown account_code — synthesize a row so the imbalance shows up
      // rather than being silently dropped. Helps diagnose data drift.
      const synth: ChartOfAccounts = {
        id: `unknown:${code}`,
        store_id: filters.storeId,
        account_code: code,
        account_name: accEntries[0]?.account_name || code,
        account_type: 'asset',
        requires_entity: false,
        is_active: true,
      };
      rows.push(buildRow(synth, accEntries, trackedCurrencies));
      continue;
    }
    rows.push(buildRow(account, accEntries, trackedCurrencies));
  }

  rows.sort((a, b) => a.account_code.localeCompare(b.account_code));

  const totals = { debits: {} as CurrencyTotals, credits: {} as CurrencyTotals };
  for (const row of rows) {
    for (const code of Object.keys(row.debits) as CurrencyCode[]) {
      addAmount(totals.debits, code, row.debits[code] ?? 0);
    }
    for (const code of Object.keys(row.credits) as CurrencyCode[]) {
      addAmount(totals.credits, code, row.credits[code] ?? 0);
    }
  }

  const isBalanced: Partial<Record<CurrencyCode, boolean>> = {};
  for (const code of trackedCurrencies) {
    const d = totals.debits[code] ?? 0;
    const c = totals.credits[code] ?? 0;
    isBalanced[code] = Math.abs(d - c) < BALANCE_EPSILON;
  }

  return {
    filters,
    rows,
    totals,
    isBalanced,
    currencies: Array.from(trackedCurrencies).sort(),
    generatedAt: new Date().toISOString(),
  };
}

function getBalanceSheetSection(account: ChartOfAccounts): BalanceSheetSection | null {
  if (account.account_type === 'asset') {
    if (account.sub_classification === 'non_current_asset') return 'non_current_asset';
    return 'current_asset';
  }
  if (account.account_type === 'liability') {
    if (account.sub_classification === 'non_current_liability') return 'non_current_liability';
    return 'current_liability';
  }
  if (account.account_type === 'equity') return 'equity';
  return null;
}

function isZeroTotals(totals: CurrencyTotals): boolean {
  return Object.values(totals).every((v) => Math.abs(v ?? 0) < BALANCE_EPSILON);
}

export async function getBalanceSheet(filters: BalanceSheetFilters): Promise<BalanceSheetReport> {
  const postedOnly = filters.postedOnly ?? true;
  const hideZeroBalanceAccounts = filters.hideZeroBalanceAccounts ?? true;
  const asOfEnd = endOfDayIso(filters.asOfDate);
  const fiscalYearStart = `${getLocalDateString(filters.asOfDate).slice(0, 4)}-01-01`;

  const [entries, accountsRaw, ytdEntries] = await Promise.all([
    fetchEntries({
      storeId: filters.storeId,
      branchId: filters.branchId,
      startDate: '1900-01-01',
      endDate: asOfEnd,
      postedOnly,
    }),
    getDB().chart_of_accounts.where('store_id').equals(filters.storeId).toArray(),
    fetchEntries({
      storeId: filters.storeId,
      branchId: filters.branchId,
      startDate: fiscalYearStart,
      endDate: asOfEnd,
      postedOnly,
    }),
  ]);

  const warnings: BalanceSheetWarning[] = [];
  const trackedCurrencies = new Set<CurrencyCode>();
  const accounts = accountsRaw.filter((a) => a.is_active !== false);
  const accountByCode = new Map<string, ChartOfAccounts>(accounts.map((a) => [a.account_code, a]));

  const byAccount = new Map<string, JournalEntry[]>();
  for (const entry of entries) {
    if (!byAccount.has(entry.account_code)) byAccount.set(entry.account_code, []);
    byAccount.get(entry.account_code)!.push(entry);
  }

  const lineRows: Array<BalanceSheetLine & { section: BalanceSheetSection }> = [];
  for (const [code, accountEntries] of byAccount) {
    const account = accountByCode.get(code);
    if (!account) continue;
    const section = getBalanceSheetSection(account);
    if (!section) continue;

    const debits: CurrencyTotals = {};
    const credits: CurrencyTotals = {};
    for (const entry of accountEntries) {
      const amounts = amountsFromLegacyEntry(entry);
      for (const currency of Object.keys(amounts) as CurrencyCode[]) {
        const debit = getDebit(amounts, currency);
        const credit = getCredit(amounts, currency);
        addAmount(debits, currency, debit);
        addAmount(credits, currency, credit);
        trackedCurrencies.add(currency);
      }
    }

    const balance: CurrencyTotals = {};
    const allCurrencies = new Set<CurrencyCode>([
      ...(Object.keys(debits) as CurrencyCode[]),
      ...(Object.keys(credits) as CurrencyCode[]),
    ]);
    const debitNormal = account.account_type === 'asset';
    for (const currency of allCurrencies) {
      const d = debits[currency] ?? 0;
      const c = credits[currency] ?? 0;
      addAmount(balance, currency, debitNormal ? d - c : c - d);
    }

    if (hideZeroBalanceAccounts && isZeroTotals(balance)) continue;

    const subClassification = account.sub_classification ?? (section === 'equity' ? 'equity' : section);
    if (!account.sub_classification) {
      warnings.push({ type: 'unmapped_subclassification', account_code: code });
    }

    lineRows.push({
      account_code: account.account_code,
      account_name: account.account_name,
      account_type: account.account_type as 'asset' | 'liability' | 'equity',
      sub_classification: subClassification,
      section,
      balanceByColumn: [{ columnId: 'primary', asOfDate: filters.asOfDate, nativeBalance: balance }],
    });
  }

  lineRows.sort((a, b) => a.account_code.localeCompare(b.account_code));

  const sectionOrder: BalanceSheetSection[] = [
    'current_asset',
    'non_current_asset',
    'current_liability',
    'non_current_liability',
    'equity',
  ];

  const subtotals: BalanceSheetSubtotal[] = sectionOrder.map((section) => {
    const total: CurrencyTotals = {};
    for (const line of lineRows.filter((r) => r.section === section)) {
      for (const currency of Object.keys(line.balanceByColumn[0].nativeBalance) as CurrencyCode[]) {
        addAmount(total, currency, line.balanceByColumn[0].nativeBalance[currency] ?? 0);
      }
    }
    return {
      section,
      totalByColumn: [{ columnId: 'primary', asOfDate: filters.asOfDate, nativeBalance: total }],
    };
  });

  const currentYearEarnings: CurrencyTotals = {};
  for (const entry of ytdEntries) {
    const account = accountByCode.get(entry.account_code);
    if (!account || (account.account_type !== 'revenue' && account.account_type !== 'expense')) continue;
    const amounts = amountsFromLegacyEntry(entry);
    for (const currency of Object.keys(amounts) as CurrencyCode[]) {
      const debit = getDebit(amounts, currency);
      const credit = getCredit(amounts, currency);
      const signed = account.account_type === 'revenue' ? credit - debit : -(debit - credit);
      addAmount(currentYearEarnings, currency, signed);
      trackedCurrencies.add(currency);
    }
  }

  if (!isZeroTotals(currentYearEarnings)) {
    lineRows.push({
      account_code: 'CYE',
      account_name: 'Current Year Earnings',
      account_type: 'equity',
      sub_classification: 'equity',
      section: 'equity',
      balanceByColumn: [
        { columnId: 'primary', asOfDate: filters.asOfDate, nativeBalance: currentYearEarnings },
      ],
    });
  }

  const assets: CurrencyTotals = {};
  const liabilitiesAndEquity: CurrencyTotals = {};
  for (const subtotal of subtotals) {
    for (const currency of Object.keys(subtotal.totalByColumn[0].nativeBalance) as CurrencyCode[]) {
      const amount = subtotal.totalByColumn[0].nativeBalance[currency] ?? 0;
      if (subtotal.section === 'current_asset' || subtotal.section === 'non_current_asset') {
        addAmount(assets, currency, amount);
      } else {
        addAmount(liabilitiesAndEquity, currency, amount);
      }
    }
  }
  for (const currency of Object.keys(currentYearEarnings) as CurrencyCode[]) {
    addAmount(liabilitiesAndEquity, currency, currentYearEarnings[currency] ?? 0);
  }

  const variance: CurrencyTotals = {};
  const allCurrencies = new Set<CurrencyCode>([
    ...(Object.keys(assets) as CurrencyCode[]),
    ...(Object.keys(liabilitiesAndEquity) as CurrencyCode[]),
  ]);
  let isBalanced = true;
  for (const currency of allCurrencies) {
    const diff = (assets[currency] ?? 0) - (liabilitiesAndEquity[currency] ?? 0);
    if (Math.abs(diff) >= BALANCE_EPSILON) {
      isBalanced = false;
      addAmount(variance, currency, diff);
    }
  }
  if (!isBalanced) {
    warnings.push({ type: 'gl_unbalanced', columnId: 'primary', variance });
  }

  return {
    filters,
    lines: lineRows.map(({ section: _section, ...line }) => line),
    subtotals,
    columns: [
      {
        columnId: 'primary',
        asOfDate: filters.asOfDate,
        unrealizedFxTranslation: { nativeBalance: {} },
        isBalanced,
        variance: isBalanced ? undefined : variance,
        currentYearEarnings: { nativeBalance: currentYearEarnings },
      },
    ],
    currencies: Array.from(trackedCurrencies).sort(),
    warnings,
    generatedAt: new Date().toISOString(),
  };
}

export const financialStatementService = {
  getTrialBalance,
  getBalanceSheet,
};
