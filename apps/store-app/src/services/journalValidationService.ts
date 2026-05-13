// Journal Validation Service - Phase 3 of Accounting Foundation Migration
// Ensures double-entry bookkeeping integrity and validates journal entries.
//
// Operates on the JSONB `amounts` map (Phase 11 / Layer 8). Per-currency
// totals are computed dynamically from whatever currencies appear in the
// data — no hardcoded USD/LBP assumptions.

import { getDB } from '../lib/db';
import { JournalEntry } from '../types/accounting';
import { amountsFromLegacyEntry } from './accountingCurrencyHelpers';
import type { CurrencyCode } from '@pos-platform/shared';

type CurrencyTotals = Partial<Record<CurrencyCode, number>>;

export interface ValidationResult {
  isValid: boolean;
  errors: string[];
  warnings: string[];
  summary: {
    totalDebits: CurrencyTotals;
    totalCredits: CurrencyTotals;
    entryCount: number;
    transactionCount: number;
  };
}

export interface TransactionValidationResult {
  transactionId: string;
  isBalanced: boolean;
  debits: CurrencyTotals;
  credits: CurrencyTotals;
  errors: string[];
}

function addAmounts(
  totals: { debits: CurrencyTotals; credits: CurrencyTotals },
  entry: JournalEntry
): void {
  const map = amountsFromLegacyEntry(entry as Parameters<typeof amountsFromLegacyEntry>[0]);
  for (const code of Object.keys(map) as CurrencyCode[]) {
    const { debit, credit } = map[code]!;
    totals.debits[code] = (totals.debits[code] ?? 0) + debit;
    totals.credits[code] = (totals.credits[code] ?? 0) + credit;
  }
}

/**
 * Service for validating journal entries and ensuring double-entry bookkeeping integrity
 */
export class JournalValidationService {

  /**
   * Validate all journal entries for a store
   * Ensures sum(debits) = sum(credits) per currency for the entire ledger
   */
  async validateStoreJournalEntries(storeId: string): Promise<ValidationResult> {
    const result: ValidationResult = {
      isValid: true,
      errors: [],
      warnings: [],
      summary: {
        totalDebits: {},
        totalCredits: {},
        entryCount: 0,
        transactionCount: 0
      }
    };

    try {
      const entries = await getDB().journal_entries
        .where('store_id')
        .equals(storeId)
        .toArray();

      if (entries.length === 0) {
        result.warnings.push('No journal entries found for this store');
        return result;
      }

      const totals = { debits: {} as CurrencyTotals, credits: {} as CurrencyTotals };
      const transactionIds = new Set<string>();

      for (const entry of entries) {
        addAmounts(totals, entry);
        transactionIds.add(entry.transaction_id);
      }

      result.summary.totalDebits = totals.debits;
      result.summary.totalCredits = totals.credits;
      result.summary.entryCount = entries.length;
      result.summary.transactionCount = transactionIds.size;

      // Check debits == credits for every currency that appears in either map
      const allCurrencies = new Set<CurrencyCode>([
        ...(Object.keys(totals.debits) as CurrencyCode[]),
        ...(Object.keys(totals.credits) as CurrencyCode[]),
      ]);
      for (const code of allCurrencies) {
        const debit = totals.debits[code] ?? 0;
        const credit = totals.credits[code] ?? 0;
        const diff = Math.abs(debit - credit);
        if (diff > 0.01) {
          result.isValid = false;
          result.errors.push(`${code} debits (${debit}) do not equal credits (${credit}). Difference: ${diff}`);
        }
      }

      // Validate individual transactions
      const transactionValidations = await this.validateTransactionBalances(Array.from(transactionIds));
      const unbalancedTransactions = transactionValidations.filter(tv => !tv.isBalanced);

      if (unbalancedTransactions.length > 0) {
        result.isValid = false;
        result.errors.push(`${unbalancedTransactions.length} transactions are not balanced`);

        unbalancedTransactions.slice(0, 5).forEach(tv => {
          result.errors.push(`Transaction ${tv.transactionId}: ${tv.errors.join(', ')}`);
        });

        if (unbalancedTransactions.length > 5) {
          result.errors.push(`... and ${unbalancedTransactions.length - 5} more unbalanced transactions`);
        }
      }

      const orphanedEntries = await this.findOrphanedEntries(storeId);
      if (orphanedEntries.length > 0) {
        result.warnings.push(`${orphanedEntries.length} journal entries have no corresponding transaction record`);
      }

      const missingJournalEntries = await this.findTransactionsWithoutJournalEntries(storeId);
      if (missingJournalEntries.length > 0) {
        result.warnings.push(`${missingJournalEntries.length} transactions have no journal entries`);
      }

    } catch (error) {
      result.isValid = false;
      result.errors.push(`Validation failed: ${error instanceof Error ? error.message : String(error)}`);
    }

    return result;
  }

  /**
   * Validate balance for specific transactions
   */
  async validateTransactionBalances(transactionIds: string[]): Promise<TransactionValidationResult[]> {
    const results: TransactionValidationResult[] = [];

    for (const transactionId of transactionIds) {
      const entries = await getDB().journal_entries
        .where('transaction_id')
        .equals(transactionId)
        .toArray();

      const result: TransactionValidationResult = {
        transactionId,
        isBalanced: true,
        debits: {},
        credits: {},
        errors: []
      };

      if (entries.length === 0) {
        result.isBalanced = false;
        result.errors.push('No journal entries found');
        results.push(result);
        continue;
      }

      const totals = { debits: {} as CurrencyTotals, credits: {} as CurrencyTotals };
      for (const entry of entries) {
        addAmounts(totals, entry);
      }

      result.debits = totals.debits;
      result.credits = totals.credits;

      const allCurrencies = new Set<CurrencyCode>([
        ...(Object.keys(totals.debits) as CurrencyCode[]),
        ...(Object.keys(totals.credits) as CurrencyCode[]),
      ]);
      for (const code of allCurrencies) {
        const debit = totals.debits[code] ?? 0;
        const credit = totals.credits[code] ?? 0;
        if (Math.abs(debit - credit) > 0.01) {
          result.isBalanced = false;
          result.errors.push(`${code} debits (${debit}) ≠ credits (${credit})`);
        }
      }

      // Per-entry sanity checks against the JSONB amounts map
      for (const entry of entries) {
        const map = amountsFromLegacyEntry(entry as Parameters<typeof amountsFromLegacyEntry>[0]);
        const codes = Object.keys(map) as CurrencyCode[];

        if (codes.length === 0) {
          result.isBalanced = false;
          result.errors.push(`Entry ${entry.id} has no currency amounts`);
          continue;
        }

        for (const code of codes) {
          const { debit, credit } = map[code]!;
          if (debit < 0 || credit < 0) {
            result.isBalanced = false;
            result.errors.push(`Entry ${entry.id} has negative ${code} amounts`);
          }
          if (debit > 0 && credit > 0) {
            result.isBalanced = false;
            result.errors.push(`Entry ${entry.id} has both ${code} debit and credit amounts`);
          }
        }
      }

      results.push(result);
    }

    return results;
  }

  /**
   * Find journal entries that don't have corresponding transaction records
   */
  async findOrphanedEntries(storeId: string): Promise<JournalEntry[]> {
    const journalEntries = await getDB().journal_entries
      .where('store_id')
      .equals(storeId)
      .toArray();

    const orphanedEntries: JournalEntry[] = [];

    for (const entry of journalEntries) {
      const transaction = await getDB().transactions.get(entry.transaction_id);
      if (!transaction) {
        orphanedEntries.push(entry);
      }
    }

    return orphanedEntries;
  }

  /**
   * Find transactions that don't have journal entries
   */
  async findTransactionsWithoutJournalEntries(storeId: string): Promise<string[]> {
    const transactions = await getDB().transactions
      .where('store_id')
      .equals(storeId)
      .toArray();

    const transactionsWithoutJournalEntries: string[] = [];

    for (const transaction of transactions) {
      const journalEntries = await getDB().journal_entries
        .where('transaction_id')
        .equals(transaction.id)
        .count();

      if (journalEntries === 0) {
        transactionsWithoutJournalEntries.push(transaction.id);
      }
    }

    return transactionsWithoutJournalEntries;
  }

  /**
   * Validate a single journal entry
   */
  validateJournalEntry(entry: JournalEntry): { isValid: boolean; errors: string[] } {
    const errors: string[] = [];
    const map = amountsFromLegacyEntry(entry as Parameters<typeof amountsFromLegacyEntry>[0]);
    const codes = Object.keys(map) as CurrencyCode[];

    if (codes.length === 0) {
      errors.push('Entry must have at least one currency amount');
    }

    for (const code of codes) {
      const { debit, credit } = map[code]!;
      if (debit < 0 || credit < 0) {
        errors.push(`${code} debit and credit amounts must be non-negative`);
      }
      if (debit > 0 && credit > 0) {
        errors.push(`Entry cannot have both ${code} debit and credit amounts`);
      }
    }

    if (!entry.account_code || !entry.account_code.match(/^\d{4}$/)) {
      errors.push('Invalid account code format (must be 4 digits)');
    }

    if (!entry.entity_id) {
      errors.push('Entity ID is required');
    }

    if (!entry.transaction_id) {
      errors.push('Transaction ID is required');
    }

    if (!entry.posted_date || !entry.posted_date.match(/^\d{4}-\d{2}-\d{2}$/)) {
      errors.push('Posted date must be in YYYY-MM-DD format');
    }

    return {
      isValid: errors.length === 0,
      errors
    };
  }

  /**
   * Get journal entry statistics for a store
   */
  async getJournalStatistics(storeId: string): Promise<{
    totalEntries: number;
    totalTransactions: number;
    balancesByAccount: Record<string, CurrencyTotals>;
    balancesByEntity: Record<string, CurrencyTotals>;
    entriesByPeriod: Record<string, number>;
  }> {
    const entries = await getDB().journal_entries
      .where('store_id')
      .equals(storeId)
      .toArray();

    const transactionIds = new Set(entries.map(e => e.transaction_id));
    const balancesByAccount: Record<string, CurrencyTotals> = {};
    const balancesByEntity: Record<string, CurrencyTotals> = {};
    const entriesByPeriod: Record<string, number> = {};

    for (const entry of entries) {
      const map = amountsFromLegacyEntry(entry as Parameters<typeof amountsFromLegacyEntry>[0]);

      if (!balancesByAccount[entry.account_code]) balancesByAccount[entry.account_code] = {};
      if (!balancesByEntity[entry.entity_id]) balancesByEntity[entry.entity_id] = {};

      for (const code of Object.keys(map) as CurrencyCode[]) {
        const { debit, credit } = map[code]!;
        const delta = debit - credit;
        balancesByAccount[entry.account_code][code] = (balancesByAccount[entry.account_code][code] ?? 0) + delta;
        balancesByEntity[entry.entity_id][code] = (balancesByEntity[entry.entity_id][code] ?? 0) + delta;
      }

      const period = entry.fiscal_period || entry.posted_date.substring(0, 7); // YYYY-MM
      entriesByPeriod[period] = (entriesByPeriod[period] || 0) + 1;
    }

    return {
      totalEntries: entries.length,
      totalTransactions: transactionIds.size,
      balancesByAccount,
      balancesByEntity,
      entriesByPeriod
    };
  }
}

// Export singleton instance
export const journalValidationService = new JournalValidationService();
