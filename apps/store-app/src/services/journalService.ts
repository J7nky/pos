// Journal Service - Phase 3 of Accounting Foundation Migration
// Based on ACCOUNTING_FOUNDATION_MIGRATION_PLAN.md
//
// Creates journal entries alongside existing transactions for explicit double-entry bookkeeping

import { db } from '../lib/db';
import { JournalEntry, CreateJournalEntryParams } from '../types/accounting';
import { accountingInitService } from './accountingInitService';
import { getFiscalPeriodForDate } from '../utils/fiscalPeriod';
import { createId } from '../lib/db';

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
      amount,
      currency,
      entityId,
      description,
      postedDate = new Date().toISOString().split('T')[0]
    } = params;
    
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
    const entity = await db.entities.get(entityId);
    if (!entity) {
      throw new Error(`Entity not found: ${entityId}`);
    }
    
    const fiscalPeriod = getFiscalPeriodForDate(new Date(postedDate));
    const now = new Date().toISOString();
    
    // Create debit and credit entries
    const debitEntry: JournalEntry = {
      id: createId(),
      store_id: storeId,
      branch_id: null,
      transaction_id: transactionId,
      account_code: debitAccount,
      account_name: debitAccountInfo.account_name,
      debit: amount,
      credit: 0,
      currency,
      entity_id: entityId,
      entity_type: entity.entity_type,
      posted_date: postedDate,
      fiscal_period: fiscalPeriod.period,
      is_posted: true,
      description: description || `${debitAccountInfo.account_name} - ${entity.name}`,
      created_at: now,
      created_by: 'system', // TODO: Get from auth context
      _synced: false
    };
    
    const creditEntry: JournalEntry = {
      id: createId(),
      store_id: storeId,
      branch_id: null,
      transaction_id: transactionId,
      account_code: creditAccount,
      account_name: creditAccountInfo.account_name,
      debit: 0,
      credit: amount,
      currency,
      entity_id: entityId,
      entity_type: entity.entity_type,
      posted_date: postedDate,
      fiscal_period: fiscalPeriod.period,
      is_posted: true,
      description: description || `${creditAccountInfo.account_name} - ${entity.name}`,
      created_at: now,
      created_by: 'system', // TODO: Get from auth context
      _synced: false
    };
    
    // Insert both entries atomically
    await db.journal_entries.bulkAdd([debitEntry, creditEntry]);
    
    console.log(`✅ Journal entry created: ${transactionId} (${currency} ${amount})`);
    return transactionId;
  }
  
  /**
   * Record a cash sale transaction
   */
  async recordCashSale(
    amount: number,
    currency: 'USD' | 'LBP',
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
    currency: 'USD' | 'LBP',
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
    currency: 'USD' | 'LBP',
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
    currency: 'USD' | 'LBP',
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
    currency: 'USD' | 'LBP',
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
    currency: 'USD' | 'LBP',
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
    currency: 'USD' | 'LBP',
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
    currency: 'USD' | 'LBP',
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
    return await db.journal_entries
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
    let query = db.journal_entries.where('entity_id').equals(entityId);
    
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
    let query = db.journal_entries
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
   */
  async calculateAccountBalance(
    storeId: string,
    accountCode: string,
    asOfDate?: string
  ): Promise<{ USD: number; LBP: number }> {
    let query = db.journal_entries
      .where('[store_id+account_code]')
      .equals([storeId, accountCode]);
    
    if (asOfDate) {
      query = query.filter(entry => entry.posted_date <= asOfDate);
    }
    
    const entries = await query.toArray();
    
    const balance = { USD: 0, LBP: 0 };
    
    for (const entry of entries) {
      if (entry.currency === 'USD') {
        balance.USD += entry.debit - entry.credit;
      } else {
        balance.LBP += entry.debit - entry.credit;
      }
    }
    
    return balance;
  }
  
  /**
   * Verify transaction balance (debits = credits)
   */
  async verifyTransactionBalance(transactionId: string): Promise<boolean> {
    const entries = await this.getJournalEntriesForTransaction(transactionId);
    
    const totals = { USD: { debit: 0, credit: 0 }, LBP: { debit: 0, credit: 0 } };
    
    for (const entry of entries) {
      totals[entry.currency].debit += entry.debit;
      totals[entry.currency].credit += entry.credit;
    }
    
    return (
      totals.USD.debit === totals.USD.credit &&
      totals.LBP.debit === totals.LBP.credit
    );
  }
  
  // Helper methods
  
  private async getStoreIdFromEntity(entityId: string): Promise<string> {
    const entity = await db.entities.get(entityId);
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
