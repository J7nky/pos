// Journal Service - Phase 3 of Accounting Foundation Migration
// Based on ACCOUNTING_FOUNDATION_MIGRATION_PLAN.md
//
// Creates journal entries alongside existing transactions for explicit double-entry bookkeeping

import { getDB } from '../lib/db';
import { JournalEntry, CreateJournalEntryParams } from '../types/accounting';
import { accountingInitService } from './accountingInitService';
import { journalValidationService } from './journalValidationService';
import { validateJournalEntryCreation, makeAppError } from './businessValidationService';
import { getFiscalPeriodForDate } from '../utils/fiscalPeriod';
import { createId } from '../lib/db';
import { getLocalDateString } from '../utils/dateUtils';
import { CacheManager, CacheKeys } from '../utils/cacheManager';
import { buildDualCurrencyAmounts, amountsFromLegacyEntry, getDebit, getCredit } from './accountingCurrencyHelpers';
import type { CurrencyCode } from '@pos-platform/shared';

/**
 * Service for creating and managing journal entries
 * Implements explicit double-entry bookkeeping
 */
export class JournalService {
  
  /**
   * Create a complete journal entry (debit + credit)
   * This is the main method for recording financial transactions
   */
  async createJournalEntry(params: CreateJournalEntryParams): Promise<string> {
    const {
      transactionId,
      debitAccount,
      creditAccount,
      amountUSD = 0,
      amountLBP = 0,
      entityId,
      description,
      postedDate = getLocalDateString(new Date().toISOString()),
      createdBy = null,  // Default to null for system-generated entries
      branchId,  // Branch ID from transaction - required
      skipVerification = false,  // Skip verification queries when called within a transaction
      // Legacy support
      amount,
      currency
    } = params;
    
    // Pre-write structural validation via centralized businessValidationService
    const bvsResult = await validateJournalEntryCreation(params);
    if (!bvsResult.isValid) {
      const first = bvsResult.violations[0];
      throw makeAppError(first?.code ?? 'UNKNOWN_ERROR');
    }
    
    // Resolve the per-currency amount map. Callers can either:
    //   1. Pass `amount` + `currency` (legacy single-currency entry shape), OR
    //   2. Pass `amountUSD` and/or `amountLBP` (legacy USD+LBP shape)
    // Both paths funnel into a generic `entryAmounts` map keyed by CurrencyCode.
    let entryAmounts: Partial<Record<string, number>> = {};

    if (amount !== undefined && currency) {
      entryAmounts[currency] = amount;
    } else {
      if (amountUSD && amountUSD !== 0) entryAmounts.USD = amountUSD;
      if (amountLBP && amountLBP !== 0) entryAmounts.LBP = amountLBP;
    }

    if (Object.values(entryAmounts).every(v => !v || v === 0)) {
      throw new Error('At least one currency amount must be provided');
    }
    
    // Validate accounting setup
    const storeId = await this.getStoreIdFromEntity(entityId);
    await accountingInitService.validateAccountingSetup(storeId);
    
    // Get account details
    const [debitAccountInfo, creditAccountInfo] = await Promise.all([
      accountingInitService.getAccount(storeId, debitAccount),
      accountingInitService.getAccount(storeId, creditAccount)
    ]);
    
    if (!debitAccountInfo || !creditAccountInfo) {
      throw new Error(`Invalid account codes: ${debitAccount} or ${creditAccount}`);
    }
    
    // Get entity info
    const entity = await getDB().entities.get(entityId);
    if (!entity) {
      throw new Error(`Entity not found: ${entityId}`);
    }
    
    const fiscalPeriod = getFiscalPeriodForDate(new Date(postedDate));
    const now = new Date().toISOString();
    
    // Create debit and credit entries with base currency fields
    // Phase 11 dual-write: also build the self-describing `amounts` map so
    // new read paths can consume it. The deprecated scalar columns stay
    // until 11d (column drop) for backward compatibility.
    // Build the JSONB amounts maps directly from `entryAmounts`. The debit
    // entry carries each currency in its `debit` slot (credit=0); the credit
    // entry mirrors with `credit` slot (debit=0).
    const debitAmounts: import('../types/accounting').JournalEntryAmounts = {};
    const creditAmounts: import('../types/accounting').JournalEntryAmounts = {};
    for (const [code, value] of Object.entries(entryAmounts)) {
      const amt = Number(value) || 0;
      if (amt === 0) continue;
      debitAmounts[code as keyof typeof debitAmounts] = { debit: amt, credit: 0 };
      creditAmounts[code as keyof typeof creditAmounts] = { debit: 0, credit: amt };
    }

    const debitEntry: JournalEntry = {
      id: createId(),
      store_id: storeId,
      branch_id: branchId,
      transaction_id: transactionId,
      account_code: debitAccount,
      account_name: debitAccountInfo.account_name,
      amounts: debitAmounts,
      entity_id: entityId,
      entity_type: entity.entity_type,
      posted_date: postedDate,
      fiscal_period: fiscalPeriod.period,
      is_posted: true,
      description: description || `${debitAccountInfo.account_name} - ${entity.name}`,
      created_at: now,
      created_by: createdBy,
      _synced: false
    };

    const creditEntry: JournalEntry = {
      id: createId(),
      store_id: storeId,
      branch_id: branchId,
      transaction_id: transactionId,
      account_code: creditAccount,
      account_name: creditAccountInfo.account_name,
      amounts: creditAmounts,
      entity_id: entityId,
      entity_type: entity.entity_type,
      posted_date: postedDate,
      fiscal_period: fiscalPeriod.period,
      is_posted: true,
      description: description || `${creditAccountInfo.account_name} - ${entity.name}`,
      created_at: now,
      created_by: createdBy,
      _synced: false
    };
    
    // Validate entries before inserting
    const debitValidation = journalValidationService.validateJournalEntry(debitEntry);
    const creditValidation = journalValidationService.validateJournalEntry(creditEntry);
    
    if (!debitValidation.isValid || !creditValidation.isValid) {
      const errors = [...debitValidation.errors, ...creditValidation.errors];
      throw new Error(`Journal entry validation failed: ${errors.join(', ')}`);
    }
    
    console.log(`[JOURNAL_SERVICE] Inserting journal entries:`, {
      transactionId,
      debitEntry: {
        id: debitEntry.id,
        account_code: debitEntry.account_code,
        amounts: debitEntry.amounts,
      },
      creditEntry: {
        id: creditEntry.id,
        account_code: creditEntry.account_code,
        amounts: creditEntry.amounts,
      }
    });
    
    // Insert both entries atomically
    // NOTE: This must be called within an IndexedDB transaction that includes journal_entries
    await getDB().journal_entries.bulkAdd([debitEntry, creditEntry]);

    const balKey = CacheKeys.balance(storeId, branchId);
    CacheManager.invalidate(balKey);
    CacheManager.invalidate(`${balKey}_both`);
    
    console.log(`[JOURNAL_SERVICE] ✅ Journal entries inserted to database`);
    
    // Skip verification queries when called within a transaction to prevent PrematureCommitError
    if (!skipVerification) {
      // Verify entries were actually saved by querying them back
      const savedEntries = await getDB().journal_entries
        .where('transaction_id')
        .equals(transactionId)
        .toArray();
      
      console.log(`[JOURNAL_SERVICE] Verification: Found ${savedEntries.length} journal entries for transaction ${transactionId}`, {
        entries: savedEntries.map(e => ({
          id: e.id,
          account_code: e.account_code,
          amounts: e.amounts,
        }))
      });
      
      if (savedEntries.length !== 2) {
        console.error(`[JOURNAL_SERVICE] ❌ Expected 2 journal entries but found ${savedEntries.length}`);
        throw new Error(`Journal entries not saved correctly. Expected 2 entries, found ${savedEntries.length}`);
      }
      
      // Verify transaction balance after insertion
      const balanceCheck = await this.verifyTransactionBalance(transactionId);
      if (!balanceCheck) {
        console.warn(`⚠️ Transaction ${transactionId} is not balanced after journal entry creation`);
      }
    } else {
      console.log(`[JOURNAL_SERVICE] Skipping verification queries (called within transaction)`);
    }
    
    const amountStr = Object.entries(entryAmounts)
      .filter(([, v]) => v && v !== 0)
      .map(([code, v]) => `${code} ${v}`)
      .join(' + ');
    console.log(`✅ Journal entry created: ${transactionId} (${amountStr})`);
    return transactionId;
  }
  
  /**
   * Record a cash sale transaction
   */
  async recordCashSale(
    amount: number,
    currency: CurrencyCode,
    customerId?: string,
    description?: string
  ): Promise<string> {
    const entityId = customerId || await this.getCashCustomerEntity();
    const transactionId = createId();
    
    return await this.createJournalEntry({
      transactionId,
      debitAccount: '1100', // Cash
      creditAccount: '4100', // Sales Revenue
      amount,
      currency,
      entityId,
      description: description || 'Cash Sale'
    });
  }
  
  /**
   * Record a credit sale transaction
   */
  async recordCreditSale(
    customerId: string,
    amount: number,
    currency: CurrencyCode,
    description?: string
  ): Promise<string> {
    const transactionId = createId();
    
    return await this.createJournalEntry({
      transactionId,
      debitAccount: '1200', // Accounts Receivable
      creditAccount: '4100', // Sales Revenue
      amount,
      currency,
      entityId: customerId,
      description: description || 'Credit Sale'
    });
  }
  
  /**
   * Record a customer payment (cash received)
   */
  async recordCustomerPayment(
    customerId: string,
    amount: number,
    currency: CurrencyCode,
    description?: string
  ): Promise<string> {
    const transactionId = createId();
    
    return await this.createJournalEntry({
      transactionId,
      debitAccount: '1100', // Cash
      creditAccount: '1200', // Accounts Receivable
      amount,
      currency,
      entityId: customerId,
      description: description || 'Customer Payment'
    });
  }
  
  /**
   * Record a cash purchase from supplier
   */
  async recordCashPurchase(
    amount: number,
    currency: CurrencyCode,
    supplierId?: string,
    description?: string
  ): Promise<string> {
    const entityId = supplierId || await this.getCashSupplierEntity();
    const transactionId = createId();
    
    return await this.createJournalEntry({
      transactionId,
      debitAccount: '1300', // Inventory
      creditAccount: '1100', // Cash
      amount,
      currency,
      entityId,
      description: description || 'Cash Purchase'
    });
  }
  
  /**
   * Record a credit purchase from supplier
   */
  async recordCreditPurchase(
    supplierId: string,
    amount: number,
    currency: CurrencyCode,
    description?: string
  ): Promise<string> {
    const transactionId = createId();
    
    return await this.createJournalEntry({
      transactionId,
      debitAccount: '1300', // Inventory
      creditAccount: '2100', // Accounts Payable
      amount,
      currency,
      entityId: supplierId,
      description: description || 'Credit Purchase'
    });
  }
  
  /**
   * Record supplier payment (cash paid)
   */
  async recordSupplierPayment(
    supplierId: string,
    amount: number,
    currency: CurrencyCode,
    description?: string
  ): Promise<string> {
    const transactionId = createId();
    
    return await this.createJournalEntry({
      transactionId,
      debitAccount: '2100', // Accounts Payable
      creditAccount: '1100', // Cash
      amount,
      currency,
      entityId: supplierId,
      description: description || 'Supplier Payment'
    });
  }
  
  /**
   * Record salary payment
   */
  async recordSalaryPayment(
    employeeId: string,
    amount: number,
    currency: CurrencyCode,
    description?: string
  ): Promise<string> {
    const transactionId = createId();
    
    return await this.createJournalEntry({
      transactionId,
      debitAccount: '5200', // Salaries Expense
      creditAccount: '1100', // Cash
      amount,
      currency,
      entityId: employeeId,
      description: description || 'Salary Payment'
    });
  }
  
  /**
   * Record expense payment (utilities, rent, etc.)
   */
  async recordExpensePayment(
    expenseAccount: string,
    entityId: string,
    amount: number,
    currency: CurrencyCode,
    description?: string
  ): Promise<string> {
    const transactionId = createId();
    
    return await this.createJournalEntry({
      transactionId,
      debitAccount: expenseAccount, // Various expense accounts
      creditAccount: '1100', // Cash
      amount,
      currency,
      entityId,
      description
    });
  }
  
  /**
   * Get journal entries for a transaction
   */
  async getJournalEntriesForTransaction(transactionId: string): Promise<JournalEntry[]> {
    return await getDB().journal_entries
      .where('transaction_id')
      .equals(transactionId)
      .toArray();
  }
  
  /**
   * Get journal entries for an entity
   */
  async getJournalEntriesForEntity(
    entityId: string,
    startDate?: string,
    endDate?: string
  ): Promise<JournalEntry[]> {
    let query = getDB().journal_entries.where('entity_id').equals(entityId);
    
    if (startDate && endDate) {
      query = query.filter(entry => 
        entry.posted_date >= startDate && entry.posted_date <= endDate
      );
    }
    
    return await query.toArray();
  }
  
  /**
   * Get journal entries for an account
   */
  async getJournalEntriesForAccount(
    storeId: string,
    accountCode: string,
    startDate?: string,
    endDate?: string
  ): Promise<JournalEntry[]> {
    let query = getDB().journal_entries
      .where('[store_id+account_code]')
      .equals([storeId, accountCode]);
    
    if (startDate && endDate) {
      query = query.filter(entry => 
        entry.posted_date >= startDate && entry.posted_date <= endDate
      );
    }
    
    return await query.toArray();
  }
  
  /**
   * Calculate account balance from journal entries
   * Returns both USD and LBP balances from the same entries
   */
  async calculateAccountBalance(
    storeId: string,
    accountCode: string,
    asOfDate?: string
  ): Promise<{ USD: number; LBP: number }> {
    let query = getDB().journal_entries
      .where('[store_id+account_code]')
      .equals([storeId, accountCode]);
    
    if (asOfDate) {
      query = query.filter(entry => entry.posted_date <= asOfDate);
    }
    
    const entries = await query.toArray();
    
    const balance = { USD: 0, LBP: 0 };

    for (const entry of entries) {
      const map = amountsFromLegacyEntry(entry as Parameters<typeof amountsFromLegacyEntry>[0]);
      balance.USD += getDebit(map, 'USD') - getCredit(map, 'USD');
      balance.LBP += getDebit(map, 'LBP') - getCredit(map, 'LBP');
    }

    return balance;
  }

  /**
   * Verify transaction balance (debits = credits) for every currency that
   * appears in the entries — no hardcoded USD/LBP assumption.
   */
  async verifyTransactionBalance(transactionId: string): Promise<boolean> {
    const entries = await this.getJournalEntriesForTransaction(transactionId);

    const debits: Record<string, number> = {};
    const credits: Record<string, number> = {};

    for (const entry of entries) {
      const map = amountsFromLegacyEntry(entry as Parameters<typeof amountsFromLegacyEntry>[0]);
      for (const code of Object.keys(map)) {
        const { debit, credit } = map[code as keyof typeof map]!;
        debits[code] = (debits[code] ?? 0) + debit;
        credits[code] = (credits[code] ?? 0) + credit;
      }
    }

    for (const code of new Set([...Object.keys(debits), ...Object.keys(credits)])) {
      if (Math.abs((debits[code] ?? 0) - (credits[code] ?? 0)) > 0.01) return false;
    }
    return true;
  }
  
  // Helper methods
  
  private async getStoreIdFromEntity(entityId: string): Promise<string> {
    const entity = await getDB().entities.get(entityId);
    if (!entity) {
      throw new Error(`Entity not found: ${entityId}`);
    }
    return entity.store_id;
  }
  
  private async getCashCustomerEntity(): Promise<string> {
    // This should be set when the store is initialized
    // For now, return the system entity ID
    return 'entity-cash-customer';
  }
  
  private async getCashSupplierEntity(): Promise<string> {
    // This should be set when the store is initialized
    // For now, return the system entity ID
    return 'entity-cash-supplier';
  }
}

// Export singleton instance
export const journalService = new JournalService();
