// Reporting Service - High-performance reports using journal entries and snapshots.
// Currency-agnostic: every per-currency total is a Partial<Record<CurrencyCode, number>>
// keyed by whatever currencies appear in the underlying data — no USD/LBP assumptions.

import { getDB } from '../lib/db';
import { snapshotService } from './snapshotService';
import { entityQueryService } from './entityQueryService';
import { getLocalDateString } from '../utils/dateUtils';
import { amountsFromLegacyEntry } from './accountingCurrencyHelpers';
import type { CurrencyCode } from '@pos-platform/shared';

type CurrencyTotals = Partial<Record<CurrencyCode, number>>;

export interface GeneralLedgerEntry {
  date: string;
  transactionId: string;
  description: string;
  accountCode: string;
  accountName: string;
  entityName: string | null;
  /** Per-currency debit (zero entries omitted). */
  debits: CurrencyTotals;
  /** Per-currency credit (zero entries omitted). */
  credits: CurrencyTotals;
  /** Running balance per currency after this entry. */
  runningBalance: CurrencyTotals;
}

export interface GeneralLedgerReport {
  storeId: string;
  accountCode: string;
  accountName: string;
  startDate: string;
  endDate: string;
  openingBalance: CurrencyTotals;
  closingBalance: CurrencyTotals;
  entries: GeneralLedgerEntry[];
  totalDebits: CurrencyTotals;
  totalCredits: CurrencyTotals;
}

export interface AccountStatementTransaction {
  date: string;
  transactionId: string;
  description: string;
  debits: CurrencyTotals;
  credits: CurrencyTotals;
  runningBalance: CurrencyTotals;
}

export interface AccountStatement {
  entityId: string;
  entityName: string;
  accountCode: string;
  accountName: string;
  startDate: string;
  endDate: string;
  openingBalance: CurrencyTotals;
  closingBalance: CurrencyTotals;
  transactions: AccountStatementTransaction[];
}

export interface TrialBalanceAccountRow {
  accountCode: string;
  accountName: string;
  accountType: 'asset' | 'liability' | 'equity' | 'revenue' | 'expense';
  /** Per-currency debit balance (sign-stripped). */
  debitBalance: CurrencyTotals;
  /** Per-currency credit balance (sign-stripped). */
  creditBalance: CurrencyTotals;
}

export interface TrialBalance {
  storeId: string;
  asOfDate: string;
  accounts: TrialBalanceAccountRow[];
  totalDebits: CurrencyTotals;
  totalCredits: CurrencyTotals;
  isBalanced: boolean;
}

export interface AgingBucket {
  current: CurrencyTotals;
  days30: CurrencyTotals;
  days60: CurrencyTotals;
  days90: CurrencyTotals;
  over90: CurrencyTotals;
}

export interface AgingReport {
  entityType: 'customer' | 'supplier';
  asOfDate: string;
  entities: Array<{
    entityId: string;
    entityName: string;
    totalBalance: CurrencyTotals;
    aging: AgingBucket;
  }>;
  totals: AgingBucket;
}

// ─── helpers ────────────────────────────────────────────────────────────────

function addInto(target: CurrencyTotals, source: CurrencyTotals): void {
  for (const code of Object.keys(source) as CurrencyCode[]) {
    target[code] = (target[code] ?? 0) + (source[code] ?? 0);
  }
}

function maxAbs(map: CurrencyTotals): number {
  let max = 0;
  for (const v of Object.values(map)) {
    if (typeof v === 'number') max = Math.max(max, Math.abs(v));
  }
  return max;
}

function emptyAgingBucket(): AgingBucket {
  return { current: {}, days30: {}, days60: {}, days90: {}, over90: {} };
}

/**
 * Determine if an account's per-currency balance map should be displayed
 * on the debit side. Looks at the dominant sign across all currencies.
 */
function isDebitBalance(accountType: string, balance: CurrencyTotals): boolean {
  const hasBalance = maxAbs(balance) > 0.01;
  if (!hasBalance) return true;

  const allNonNegative = Object.values(balance).every(v => (v ?? 0) >= 0);

  switch (accountType) {
    case 'asset':
    case 'expense':
      return allNonNegative;
    case 'liability':
    case 'equity':
    case 'revenue':
      return !allNonNegative;
    default:
      return allNonNegative;
  }
}

/**
 * Map a journal-entry row to its (debits, credits) currency-totals pair
 * by reading the JSONB `amounts` map.
 */
function entryAmounts(entry: { amounts?: any }): { debits: CurrencyTotals; credits: CurrencyTotals } {
  const map = amountsFromLegacyEntry(entry as Parameters<typeof amountsFromLegacyEntry>[0]);
  const debits: CurrencyTotals = {};
  const credits: CurrencyTotals = {};
  for (const code of Object.keys(map) as CurrencyCode[]) {
    const { debit, credit } = map[code]!;
    if (debit) debits[code] = debit;
    if (credit) credits[code] = credit;
  }
  return { debits, credits };
}

// ─── service ────────────────────────────────────────────────────────────────

/**
 * High-performance reporting service using journal entries and snapshots
 */
export class ReportingService {
  /**
   * Generate General Ledger report for an account.
   */
  async generateGeneralLedger(
    storeId: string,
    accountCode: string,
    startDate: string,
    endDate: string,
    entityId?: string
  ): Promise<GeneralLedgerReport> {
    try {
      const account = await getDB().chart_of_accounts
        .where('[store_id+account_code]')
        .equals([storeId, accountCode])
        .first();

      if (!account) {
        throw new Error(`Account ${accountCode} not found`);
      }

      const previousDay = new Date(startDate);
      previousDay.setDate(previousDay.getDate() - 1);
      const previousDayStr = getLocalDateString(previousDay.toISOString());

      const openingBalance: CurrencyTotals = {};

      if (entityId) {
        try {
          const balance = await snapshotService.getHistoricalBalance(
            storeId,
            accountCode,
            entityId,
            previousDayStr
          );
          addInto(openingBalance, balance.byCurrency);
        } catch (error) {
          console.warn('Failed to get opening balance from snapshots, calculating from journal:', error);
        }
      } else {
        const entities = await getDB().entities.where('store_id').equals(storeId).toArray();
        for (const entity of entities) {
          try {
            const balance = await snapshotService.getHistoricalBalance(
              storeId,
              accountCode,
              entity.id,
              previousDayStr
            );
            addInto(openingBalance, balance.byCurrency);
          } catch (error) {
            // Skip entities with no balance
          }
        }
      }

      let query = getDB().journal_entries
        .where('[store_id+account_code]')
        .equals([storeId, accountCode])
        .filter(entry => entry.posted_date >= startDate && entry.posted_date <= endDate);

      if (entityId) {
        query = query.filter(entry => entry.entity_id === entityId);
      }

      const journalEntries = await query.toArray();

      journalEntries.sort((a, b) => {
        const dateCompare = a.posted_date.localeCompare(b.posted_date);
        if (dateCompare !== 0) return dateCompare;
        return a.created_at.localeCompare(b.created_at);
      });

      const entries: GeneralLedgerEntry[] = [];
      const runningBalance: CurrencyTotals = { ...openingBalance };
      const totalDebits: CurrencyTotals = {};
      const totalCredits: CurrencyTotals = {};

      for (const entry of journalEntries) {
        let entityName: string | null = null;
        if (entry.entity_id) {
          const entity = await getDB().entities.get(entry.entity_id);
          entityName = entity?.name || null;
        }

        const { debits, credits } = entryAmounts(entry);
        for (const code of Object.keys(debits) as CurrencyCode[]) {
          runningBalance[code] = (runningBalance[code] ?? 0) + (debits[code] ?? 0);
        }
        for (const code of Object.keys(credits) as CurrencyCode[]) {
          runningBalance[code] = (runningBalance[code] ?? 0) - (credits[code] ?? 0);
        }
        addInto(totalDebits, debits);
        addInto(totalCredits, credits);

        entries.push({
          date: entry.posted_date,
          transactionId: entry.transaction_id,
          description: entry.description ?? '',
          accountCode: entry.account_code,
          accountName: account.account_name,
          entityName,
          debits,
          credits,
          runningBalance: { ...runningBalance }
        });
      }

      return {
        storeId,
        accountCode,
        accountName: account.account_name,
        startDate,
        endDate,
        openingBalance,
        closingBalance: runningBalance,
        entries,
        totalDebits,
        totalCredits
      };

    } catch (error) {
      console.error('Failed to generate general ledger:', error);
      throw error;
    }
  }

  /**
   * Generate account statement for an entity.
   */
  async generateAccountStatement(
    storeId: string,
    entityId: string,
    accountCode: string,
    startDate: string,
    endDate: string
  ): Promise<AccountStatement> {
    try {
      const [entity, account] = await Promise.all([
        getDB().entities.get(entityId),
        getDB().chart_of_accounts
          .where('[store_id+account_code]')
          .equals([storeId, accountCode])
          .first()
      ]);

      if (!entity) throw new Error(`Entity ${entityId} not found`);
      if (!account) throw new Error(`Account ${accountCode} not found`);

      const previousDay = new Date(startDate);
      previousDay.setDate(previousDay.getDate() - 1);
      const previousDayStr = getLocalDateString(previousDay.toISOString());

      const openingBalance: CurrencyTotals = {};

      try {
        const balance = await snapshotService.getHistoricalBalance(
          storeId,
          accountCode,
          entityId,
          previousDayStr
        );
        addInto(openingBalance, balance.byCurrency);
      } catch (error) {
        console.warn('Failed to get opening balance from snapshots:', error);
      }

      const journalEntries = await getDB().journal_entries
        .where('[store_id+account_code+entity_id]')
        .equals([storeId, accountCode, entityId])
        .filter(entry => entry.posted_date >= startDate && entry.posted_date <= endDate)
        .toArray();

      journalEntries.sort((a, b) => {
        const dateCompare = a.posted_date.localeCompare(b.posted_date);
        if (dateCompare !== 0) return dateCompare;
        return a.created_at.localeCompare(b.created_at);
      });

      const transactions: AccountStatementTransaction[] = [];
      const runningBalance: CurrencyTotals = { ...openingBalance };

      for (const entry of journalEntries) {
        const { debits, credits } = entryAmounts(entry);
        for (const code of Object.keys(debits) as CurrencyCode[]) {
          runningBalance[code] = (runningBalance[code] ?? 0) + (debits[code] ?? 0);
        }
        for (const code of Object.keys(credits) as CurrencyCode[]) {
          runningBalance[code] = (runningBalance[code] ?? 0) - (credits[code] ?? 0);
        }

        transactions.push({
          date: entry.posted_date,
          transactionId: entry.transaction_id,
          description: entry.description ?? '',
          debits,
          credits,
          runningBalance: { ...runningBalance }
        });
      }

      return {
        entityId,
        entityName: entity.name,
        accountCode,
        accountName: account.account_name,
        startDate,
        endDate,
        openingBalance,
        closingBalance: runningBalance,
        transactions
      };

    } catch (error) {
      console.error('Failed to generate account statement:', error);
      throw error;
    }
  }

  /**
   * Generate trial balance using snapshots for performance.
   */
  async generateTrialBalance(storeId: string, asOfDate: string): Promise<TrialBalance> {
    try {
      const accounts = await getDB().chart_of_accounts
        .where('store_id')
        .equals(storeId)
        .filter(account => account.is_active)
        .toArray();

      const trialBalanceAccounts: TrialBalanceAccountRow[] = [];
      const totalDebits: CurrencyTotals = {};
      const totalCredits: CurrencyTotals = {};

      for (const account of accounts) {
        const accountBalance: CurrencyTotals = {};

        if (account.requires_entity) {
          const entities = await getDB().entities.where('store_id').equals(storeId).toArray();
          for (const entity of entities) {
            try {
              const balance = await snapshotService.getHistoricalBalance(
                storeId,
                account.account_code,
                entity.id,
                asOfDate
              );
              addInto(accountBalance, balance.byCurrency);
            } catch (error) {
              // Skip entities with no balance
            }
          }
        } else {
          try {
            const balance = await snapshotService.getHistoricalBalance(
              storeId,
              account.account_code,
              null,
              asOfDate
            );
            addInto(accountBalance, balance.byCurrency);
          } catch (error) {
            console.warn(`Failed to get balance for account ${account.account_code}:`, error);
          }
        }

        const showAsDebit = isDebitBalance(account.account_type, accountBalance);
        const debitBalance: CurrencyTotals = {};
        const creditBalance: CurrencyTotals = {};
        for (const code of Object.keys(accountBalance) as CurrencyCode[]) {
          const value = Math.abs(accountBalance[code] ?? 0);
          if (showAsDebit) {
            debitBalance[code] = value;
          } else {
            creditBalance[code] = value;
          }
        }

        trialBalanceAccounts.push({
          accountCode: account.account_code,
          accountName: account.account_name,
          accountType: account.account_type,
          debitBalance,
          creditBalance
        });

        addInto(totalDebits, debitBalance);
        addInto(totalCredits, creditBalance);
      }

      // Trial balance is balanced when debits == credits for every currency.
      const codes = new Set<CurrencyCode>([
        ...(Object.keys(totalDebits) as CurrencyCode[]),
        ...(Object.keys(totalCredits) as CurrencyCode[]),
      ]);
      let isBalanced = true;
      for (const code of codes) {
        if (Math.abs((totalDebits[code] ?? 0) - (totalCredits[code] ?? 0)) >= 0.01) {
          isBalanced = false;
          break;
        }
      }

      return {
        storeId,
        asOfDate,
        accounts: trialBalanceAccounts,
        totalDebits,
        totalCredits,
        isBalanced
      };

    } catch (error) {
      console.error('Failed to generate trial balance:', error);
      throw error;
    }
  }

  /**
   * Generate aging report for customers or suppliers.
   */
  async generateAgingReport(
    storeId: string,
    entityType: 'customer' | 'supplier',
    asOfDate: string
  ): Promise<AgingReport> {
    try {
      const accountCode = entityType === 'customer' ? '1200' : '2100'; // AR or AP

      const entities = await entityQueryService.getEntitiesByType(storeId, entityType, {
        includeInactive: false
      });

      const agingEntities: AgingReport['entities'] = [];
      const totals: AgingBucket = emptyAgingBucket();

      for (const entity of entities) {
        const balance = await snapshotService.getHistoricalBalance(
          storeId,
          accountCode,
          entity.id,
          asOfDate
        );

        if (maxAbs(balance.byCurrency) < 0.01) continue;

        // Simplified aging: all balance lands in "current" until invoice
        // dates are wired in. The bucket is per-currency.
        const aging: AgingBucket = emptyAgingBucket();
        addInto(aging.current, balance.byCurrency);

        agingEntities.push({
          entityId: entity.id,
          entityName: entity.name,
          totalBalance: { ...balance.byCurrency },
          aging
        });

        addInto(totals.current, balance.byCurrency);
      }

      // Sort by largest single-currency balance (use USD if present, else
      // the dominant currency in the map).
      agingEntities.sort((a, b) => maxAbs(b.totalBalance) - maxAbs(a.totalBalance));

      return {
        entityType,
        asOfDate,
        entities: agingEntities,
        totals
      };

    } catch (error) {
      console.error('Failed to generate aging report:', error);
      throw error;
    }
  }

  /**
   * Get financial summary using snapshots for performance.
   */
  async getFinancialSummary(storeId: string, asOfDate: string): Promise<{
    assets: CurrencyTotals;
    liabilities: CurrencyTotals;
    equity: CurrencyTotals;
    revenue: CurrencyTotals;
    expenses: CurrencyTotals;
    netIncome: CurrencyTotals;
  }> {
    try {
      const accounts = await getDB().chart_of_accounts
        .where('store_id')
        .equals(storeId)
        .filter(account => account.is_active)
        .toArray();

      const summary = {
        assets: {} as CurrencyTotals,
        liabilities: {} as CurrencyTotals,
        equity: {} as CurrencyTotals,
        revenue: {} as CurrencyTotals,
        expenses: {} as CurrencyTotals,
        netIncome: {} as CurrencyTotals,
      };

      for (const account of accounts) {
        const accountBalance: CurrencyTotals = {};

        if (account.requires_entity) {
          const entities = await getDB().entities.where('store_id').equals(storeId).toArray();
          for (const entity of entities) {
            try {
              const balance = await snapshotService.getHistoricalBalance(
                storeId,
                account.account_code,
                entity.id,
                asOfDate
              );
              addInto(accountBalance, balance.byCurrency);
            } catch (error) {
              // Skip entities with no balance
            }
          }
        } else {
          try {
            const balance = await snapshotService.getHistoricalBalance(
              storeId,
              account.account_code,
              null,
              asOfDate
            );
            addInto(accountBalance, balance.byCurrency);
          } catch (error) {
            console.warn(`Failed to get balance for account ${account.account_code}:`, error);
          }
        }

        const absBalance: CurrencyTotals = {};
        for (const code of Object.keys(accountBalance) as CurrencyCode[]) {
          absBalance[code] = Math.abs(accountBalance[code] ?? 0);
        }

        switch (account.account_type) {
          case 'asset':
            addInto(summary.assets, accountBalance);
            break;
          case 'liability':
            addInto(summary.liabilities, absBalance);
            break;
          case 'equity':
            addInto(summary.equity, absBalance);
            break;
          case 'revenue':
            addInto(summary.revenue, absBalance);
            break;
          case 'expense':
            addInto(summary.expenses, accountBalance);
            break;
        }
      }

      // netIncome = revenue - expenses, per currency.
      const incomeCodes = new Set<CurrencyCode>([
        ...(Object.keys(summary.revenue) as CurrencyCode[]),
        ...(Object.keys(summary.expenses) as CurrencyCode[]),
      ]);
      for (const code of incomeCodes) {
        summary.netIncome[code] = (summary.revenue[code] ?? 0) - (summary.expenses[code] ?? 0);
      }

      return summary;

    } catch (error) {
      console.error('Failed to get financial summary:', error);
      throw error;
    }
  }
}

// Export singleton instance
export const reportingService = new ReportingService();
