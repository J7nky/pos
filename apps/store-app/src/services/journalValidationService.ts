// Journal Validation Service - Phase 3 of Accounting Foundation Migration
// Ensures double-entry bookkeeping integrity and validates journal entries

import { getDB } from '../lib/db';
import { JournalEntry } from '../types/accounting';

export interface ValidationResult {
  isValid: boolean;
  errors: string[];
  warnings: string[];
  summary: {
    totalDebits: { USD: number; LBP: number };
    totalCredits: { USD: number; LBP: number };
    entryCount: number;
    transactionCount: number;
  };
}

export interface TransactionValidationResult {
  transactionId: string;
  isBalanced: boolean;
  debits: { USD: number; LBP: number };
  credits: { USD: number; LBP: number };
  errors: string[];
}

/**
 * Service for validating journal entries and ensuring double-entry bookkeeping integrity
 */
export class JournalValidationService {
  
  /**
   * Validate all journal entries for a store
   * Ensures sum(debits) = sum(credits) for the entire ledger
   */
  async validateStoreJournalEntries(storeId: string): Promise<ValidationResult> {
    const result: ValidationResult = {
      isValid: true,
      errors: [],
      warnings: [],
      summary: {
        totalDebits: { USD: 0, LBP: 0 },
        totalCredits: { USD: 0, LBP: 0 },
        entryCount: 0,
        transactionCount: 0
      }
    };
    
    try {
      // Get all journal entries for the store
      const entries = await getDB().journal_entries
        .where('store_id')
        .equals(storeId)
        .toArray();
      
      if (entries.length === 0) {
        result.warnings.push('No journal entries found for this store');
        return result;
      }
      
      // Calculate totals by currency
      const totals = { USD: { debit: 0, credit: 0 }, LBP: { debit: 0, credit: 0 } };
      const transactionIds = new Set<string>();
      
      for (const entry of entries) {
        totals.USD.debit += entry.debit_usd;
        totals.USD.credit += entry.credit_usd;
        totals.LBP.debit += entry.debit_lbp;
        totals.LBP.credit += entry.credit_lbp;
        transactionIds.add(entry.transaction_id);
      }
      
      result.summary.totalDebits = { USD: totals.USD.debit, LBP: totals.LBP.debit };
      result.summary.totalCredits = { USD: totals.USD.credit, LBP: totals.LBP.credit };
      result.summary.entryCount = entries.length;
      result.summary.transactionCount = transactionIds.size;
      
      // Check if debits equal credits for each currency
      const usdDifference = Math.abs(totals.USD.debit - totals.USD.credit);
      const lbpDifference = Math.abs(totals.LBP.debit - totals.LBP.credit);
      
      if (usdDifference > 0.01) {
        result.isValid = false;
        result.errors.push(`USD debits (${totals.USD.debit}) do not equal credits (${totals.USD.credit}). Difference: ${usdDifference}`);
      }
      
      if (lbpDifference > 0.01) {
        result.isValid = false;
        result.errors.push(`LBP debits (${totals.LBP.debit}) do not equal credits (${totals.LBP.credit}). Difference: ${lbpDifference}`);
      }
      
      // Validate individual transactions
      const transactionValidations = await this.validateTransactionBalances(Array.from(transactionIds));
      const unbalancedTransactions = transactionValidations.filter(tv => !tv.isBalanced);
      
      if (unbalancedTransactions.length > 0) {
        result.isValid = false;
        result.errors.push(`${unbalancedTransactions.length} transactions are not balanced`);
        
        // Add details for first few unbalanced transactions
        unbalancedTransactions.slice(0, 5).forEach(tv => {
          result.errors.push(`Transaction ${tv.transactionId}: ${tv.errors.join(', ')}`);
        });
        
        if (unbalancedTransactions.length > 5) {
          result.errors.push(`... and ${unbalancedTransactions.length - 5} more unbalanced transactions`);
        }
      }
      
      // Check for orphaned entries (entries without corresponding transactions)
      const orphanedEntries = await this.findOrphanedEntries(storeId);
      if (orphanedEntries.length > 0) {
        result.warnings.push(`${orphanedEntries.length} journal entries have no corresponding transaction record`);
      }
      
      // Check for missing journal entries (transactions without journal entries)
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
        debits: { USD: 0, LBP: 0 },
        credits: { USD: 0, LBP: 0 },
        errors: []
      };
      
      if (entries.length === 0) {
        result.isBalanced = false;
        result.errors.push('No journal entries found');
        results.push(result);
        continue;
      }
      
      // Calculate totals by currency
      const totals = { USD: { debit: 0, credit: 0 }, LBP: { debit: 0, credit: 0 } };
      
      for (const entry of entries) {
        totals.USD.debit += entry.debit_usd;
        totals.USD.credit += entry.credit_usd;
        totals.LBP.debit += entry.debit_lbp;
        totals.LBP.credit += entry.credit_lbp;
      }
      
      result.debits = { USD: totals.USD.debit, LBP: totals.LBP.debit };
      result.credits = { USD: totals.USD.credit, LBP: totals.LBP.credit };
      
      // Check balance for each currency
      const usdDifference = Math.abs(totals.USD.debit - totals.USD.credit);
      const lbpDifference = Math.abs(totals.LBP.debit - totals.LBP.credit);
      
      if (usdDifference > 0.01) {
        result.isBalanced = false;
        result.errors.push(`USD debits (${totals.USD.debit}) ≠ credits (${totals.USD.credit})`);
      }
      
      if (lbpDifference > 0.01) {
        result.isBalanced = false;
        result.errors.push(`LBP debits (${totals.LBP.debit}) ≠ credits (${totals.LBP.credit})`);
      }
      
      // Check for invalid entries
      for (const entry of entries) {
        // Check USD amounts
        if (entry.debit_usd < 0 || entry.credit_usd < 0 || entry.debit_lbp < 0 || entry.credit_lbp < 0) {
          result.isBalanced = false;
          result.errors.push(`Entry ${entry.id} has negative amounts`);
        }
        
        // Check that entry has either USD or LBP amounts (or both), but not both debit and credit in same currency
        const hasUSD = entry.debit_usd > 0 || entry.credit_usd > 0;
        const hasLBP = entry.debit_lbp > 0 || entry.credit_lbp > 0;
        
        if (!hasUSD && !hasLBP) {
          result.isBalanced = false;
          result.errors.push(`Entry ${entry.id} has zero amounts for both currencies`);
        }
        
        if (entry.debit_usd > 0 && entry.credit_usd > 0) {
          result.isBalanced = false;
          result.errors.push(`Entry ${entry.id} has both USD debit and credit amounts`);
        }
        
        if (entry.debit_lbp > 0 && entry.credit_lbp > 0) {
          result.isBalanced = false;
          result.errors.push(`Entry ${entry.id} has both LBP debit and credit amounts`);
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
    
    // Check amounts - must be non-negative
    if (entry.debit_usd < 0 || entry.credit_usd < 0 || entry.debit_lbp < 0 || entry.credit_lbp < 0) {
      errors.push('All debit and credit amounts must be non-negative');
    }
    
    // Check that entry has at least one currency amount
    const hasUSD = entry.debit_usd > 0 || entry.credit_usd > 0;
    const hasLBP = entry.debit_lbp > 0 || entry.credit_lbp > 0;
    
    if (!hasUSD && !hasLBP) {
      errors.push('Entry must have at least one currency amount (USD or LBP)');
    }
    
    // Check that each currency doesn't have both debit and credit
    if (entry.debit_usd > 0 && entry.credit_usd > 0) {
      errors.push('Entry cannot have both USD debit and credit amounts');
    }
    
    if (entry.debit_lbp > 0 && entry.credit_lbp > 0) {
      errors.push('Entry cannot have both LBP debit and credit amounts');
    }
    
    // Check required fields
    if (!entry.account_code || !entry.account_code.match(/^\d{4}$/)) {
      errors.push('Invalid account code format (must be 4 digits)');
    }
    
    if (!entry.entity_id) {
      errors.push('Entity ID is required');
    }
    
    if (!entry.transaction_id) {
      errors.push('Transaction ID is required');
    }
    
    // Check date format
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
    balancesByAccount: Record<string, { USD: number; LBP: number }>;
    balancesByEntity: Record<string, { USD: number; LBP: number }>;
    entriesByPeriod: Record<string, number>;
  }> {
    const entries = await getDB().journal_entries
      .where('store_id')
      .equals(storeId)
      .toArray();
    
    const transactionIds = new Set(entries.map(e => e.transaction_id));
    const balancesByAccount: Record<string, { USD: number; LBP: number }> = {};
    const balancesByEntity: Record<string, { USD: number; LBP: number }> = {};
    const entriesByPeriod: Record<string, number> = {};
    
    for (const entry of entries) {
      // Account balances
      if (!balancesByAccount[entry.account_code]) {
        balancesByAccount[entry.account_code] = { USD: 0, LBP: 0 };
      }
      balancesByAccount[entry.account_code].USD += entry.debit_usd - entry.credit_usd;
      balancesByAccount[entry.account_code].LBP += entry.debit_lbp - entry.credit_lbp;
      
      // Entity balances
      if (!balancesByEntity[entry.entity_id]) {
        balancesByEntity[entry.entity_id] = { USD: 0, LBP: 0 };
      }
      balancesByEntity[entry.entity_id].USD += entry.debit_usd - entry.credit_usd;
      balancesByEntity[entry.entity_id].LBP += entry.debit_lbp - entry.credit_lbp;
      
      // Entries by period
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
