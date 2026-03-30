/**
 * UNIFIED TRANSACTION SERVICE
 * Single Source of Truth for ALL transaction creation, modification, and management
 * 
 * ALL transaction operations MUST go through this service - NO EXCEPTIONS
 */

import { getDB } from '../lib/db';
import { currencyService } from './currencyService';
import { auditLogService } from './auditLogService';
import { journalService } from './journalService';
import { BranchAccessValidationService } from './branchAccessValidationService';
import { 
  TRANSACTION_CATEGORIES, 
  TransactionCategory, 
  TransactionType,
  getTransactionType,
  isValidTransactionCategory 
} from '../constants/transactionCategories';
import { getAccountMapping, getEntityCodeForTransaction, getJournalDescription } from '../utils/accountMapping';
import { getSystemEntity } from '../constants/systemEntities';
import type { MultilingualString } from '../utils/multilingual';
import { createMultilingualFromString } from '../utils/multilingual';
import { 
  generatePaymentReference, 
  generateExpenseReference, 
  generateARReference, 
  generateAPReference,
  generateReference 
} from '@pos-platform/shared';
import { getLocalDateString } from '../utils/dateUtils';
import { createId } from '../lib/db';
import { getFiscalPeriodForDate } from '../utils/fiscalPeriod';
import type { JournalEntry } from '../types/accounting';
import { validateTransactionCreation } from './businessValidationService';
// ============================================================================
// TYPES & INTERFACES
// ============================================================================

export interface TransactionContext {
  userId: string;
  userEmail?: string;
  userName?: string;
  sessionId?: string;
  source?: 'web' | 'mobile' | 'api' | 'offline';
  module: string;
  correlationId?: string;
  storeId: string;
  branchId: string;
}

export interface CreateTransactionParams {
  // Required fields
  category: TransactionCategory;
  amount: number;
  currency: 'USD' | 'LBP';
  description: MultilingualString;
  context: TransactionContext;
  
  // Optional fields
  reference?: string;
  entityId?: string | null; // Unified field for customer/supplier/employee
  metadata?: Record<string, any>;
  is_reversal?: boolean;
  reversal_of_transaction_id?: string | null;
  
  // Behavior flags
  updateBalances?: boolean;
  updateCashDrawer?: boolean;
  createAuditLog?: boolean;
  _synced?: boolean;
}

export interface TransactionResult {
  success: boolean;
  transactionId?: string;
  error?: string;
  balanceBefore: number;
  balanceAfter: number;
  affectedRecords: string[];
  auditLogId?: string;
  correlationId?: string;
  cashDrawerImpact?: {
    previousBalance: number;
    newBalance: number;
  };
}

export interface Transaction {
  id: string;
  store_id: string;
  type: TransactionType;
  category: TransactionCategory;
  amount: number;
  currency: 'USD' | 'LBP';
  description: string;
  reference: string | null;
  entity_id?: string | null;
  created_at: string;
  updated_at?: string;
  created_by: string;
  _synced: boolean;
  _deleted?: boolean;
  _lastSyncedAt?: string;
  metadata?: Record<string, any>;
  is_reversal?: boolean;
  reversal_of_transaction_id?: string | null;
}

// ============================================================================
// TRANSACTION SERVICE CLASS
// ============================================================================

export class TransactionService {
  private static instance: TransactionService;

  private constructor() {}

  public static getInstance(): TransactionService {
    if (!TransactionService.instance) {
      TransactionService.instance = new TransactionService();
    }
    return TransactionService.instance;
  }

  // ==========================================================================
  // CORE TRANSACTION CREATION
  // ==========================================================================

  /**
   * Create a new transaction - THE ONLY WAY TO CREATE TRANSACTIONS
   * Uses IndexedDB transactions for true atomicity
   */
  public async createTransaction(params: CreateTransactionParams): Promise<TransactionResult> {
    try {
      // ✅ 0. VALIDATE BRANCH ACCESS (before any other validation)
      try {
        await BranchAccessValidationService.validateBranchAccess(
          params.context.userId,
          params.context.storeId,
          params.context.branchId
        );
      } catch (error) {
        return {
          success: false,
          error: error instanceof Error ? error.message : 'Access denied to this branch',
          balanceBefore: 0,
          balanceAfter: 0,
          affectedRecords: []
        };
      }
      
      // 1. VALIDATION (outside transaction) — via centralized businessValidationService
      const bvsResult = await validateTransactionCreation(params);
      if (!bvsResult.isValid) {
        const firstViolation = bvsResult.violations[0];
        return {
          success: false,
          error: firstViolation?.message ?? 'Validation failed',
          balanceBefore: 0,
          balanceAfter: 0,
          affectedRecords: []
        };
      }

      // 1.5. VERIFY CASH DRAWER ACCOUNT EXISTS (no balance validation - negative balances allowed)
      const isCashExpense = params.category === TRANSACTION_CATEGORIES.CASH_DRAWER_EXPENSE || 
                           params.category === TRANSACTION_CATEGORIES.INVENTORY_CASH_PURCHASE;
      
      if (isCashExpense) {
        // Get cash drawer account to verify it exists
        const account = await getDB().getCashDrawerAccount(params.context.storeId, params.context.branchId);
        if (!account) {
          return {
            success: false,
            error: 'No cash drawer account found. Please create one before processing expenses.',
            balanceBefore: 0,
            balanceAfter: 0,
            affectedRecords: []
          };
        }
      }

      // 2. PREPARE TRANSACTION DATA (outside transaction)
      const transactionId = this.generateTransactionId();
      const correlationId = params.context.correlationId || this.generateCorrelationId();
      const type = getTransactionType(params.category);
      
      // Convert amount to USD for balance calculations
      const amountInUSD = currencyService.convertCurrency(
        params.amount, 
        params.currency, 
        'USD'
      );

      // Generate reference if not provided
      const reference = params.reference || this.generateReferenceForCategory(params.category);

      // Get entity_id from params
      const entityId = params.entityId || null;
      
      // 3. GET BALANCE BEFORE (outside transaction - read-only)
      const balanceBefore = await this.getEntityBalance(entityId, params.currency);
      // 4. PREPARE TRANSACTION RECORD
      const transaction: Transaction = {
        id: transactionId,
        store_id: params.context.storeId,
        branch_id: params.context.branchId, // ✅ Ensure branch_id is always included
        type,
        category: params.category,
        amount: params.amount,
        currency: params.currency,
        description: params.description,
        reference,
        // Set entity_id (unified field)
        entity_id: entityId,
        created_at: '', // Will be set inside transaction block
        created_by: params.context.userId,
        _synced: params._synced ?? false,
        _deleted: false,
        is_reversal: params.is_reversal ?? false,
        reversal_of_transaction_id: params.reversal_of_transaction_id ?? null,
        metadata: {
          ...params.metadata,
          correlationId,
          source: params.context.source || 'web',
          module: params.context.module
        }
      };

      // Variables to capture results from atomic transaction
      let balanceAfter = balanceBefore;
      let affectedRecords: string[] = [transactionId];
      let cashDrawerImpact: { previousBalance: number; newBalance: number } | undefined;

      console.log(`[CREATE_TRANSACTION] Starting transaction creation:`, {
        transactionId,
        category: params.category,
        amount: params.amount,
        currency: params.currency,
        updateCashDrawer: params.updateCashDrawer,
        isCashDrawerCategory: this.isCashDrawerCategory(params.category),
        storeId: params.context.storeId,
        branchId: params.context.branchId
      });

      // 2.5. AUTO-OPEN CASH DRAWER SESSION IF CLOSED
      // If this transaction affects cash drawer, ensure session is open
      const shouldUpdateCashDrawer = params.updateCashDrawer !== false && this.isCashDrawerCategory(params.category);
      if (shouldUpdateCashDrawer) {
        try {
          const { cashDrawerUpdateService } = await import('./cashDrawerUpdateService');
          
          // Check if session is open (without auto-open to check status)
          const session = await cashDrawerUpdateService.verifySessionOpen(
            params.context.storeId,
            params.context.branchId,
            false, // Don't auto-open yet - we'll do it manually with proper amount
            params.context.userId,
            type
          );

          if (!session || session.status !== 'open') {
            // Session is closed - auto-open it
            console.log(`[CREATE_TRANSACTION] Cash drawer session is closed, auto-opening with transaction amount`);
            
            // Determine opening amount based on transaction type
            // For transactions that DEBIT cash (sales, customer payments): use transaction amount
            // For transactions that CREDIT cash (expenses, supplier payments): use 0
            const accountMapping = getAccountMapping(params.category);
            const isDebitCash = accountMapping.debitAccount === '1100';
            const openingAmount = isDebitCash ? params.amount : 0;

            const openResult = await cashDrawerUpdateService.openCashDrawerSession(
              params.context.storeId,
              params.context.branchId,
              openingAmount,
              params.context.userId,
              `Auto-opened for ${params.category} transaction`
            );

            if (!openResult.success) {
              console.error(`[CREATE_TRANSACTION] Failed to auto-open cash drawer session:`, openResult.error);
              return {
                success: false,
                error: openResult.error || 'Failed to open cash drawer session',
                balanceBefore: 0,
                balanceAfter: 0,
                affectedRecords: []
              };
            }

            console.log(`[CREATE_TRANSACTION] ✅ Cash drawer session auto-opened: ${openResult.sessionId} with opening amount: ${openingAmount}`);
          } else {
            console.log(`[CREATE_TRANSACTION] ✅ Cash drawer session is already open: ${session.id}`);
          }
        } catch (error) {
          console.error('[CREATE_TRANSACTION] Error checking/opening cash drawer session:', error);
          return {
            success: false,
            error: error instanceof Error ? error.message : 'Failed to verify cash drawer session',
            balanceBefore: 0,
            balanceAfter: 0,
            affectedRecords: []
          };
        }
      }

      // ⭐⭐⭐ ATOMIC TRANSACTION BLOCK ⭐⭐⭐
      // ALL database write operations happen atomically
      await getDB().transaction('rw', 
        [getDB().transactions, getDB().cash_drawer_sessions, getDB().journal_entries, getDB().entities, getDB().chart_of_accounts, getDB().cash_drawer_accounts], 
        async () => {
          // Create timestamp inside transaction block for accurate commit time
          const timestamp = new Date().toISOString();
          transaction.created_at = timestamp;
          
          console.log(`[CREATE_TRANSACTION] Adding transaction record:`, {
            transactionId,
            category: transaction.category,
            amount: transaction.amount,
            currency: transaction.currency
          });
          
          // 5. CREATE TRANSACTION RECORD
          await getDB().transactions.add(transaction);
          console.log(`[CREATE_TRANSACTION] ✅ Transaction record added`);

          // 6. CREATE JOURNAL ENTRIES (MANDATORY - ACCOUNTING RULE)
          // ✅ Journal entries are the source of truth for financial data
          // If journal entries fail, the entire transaction must be rolled back
          console.log(`[CREATE_TRANSACTION] Creating journal entries for transaction: ${transactionId}`);
          await this.createJournalEntriesForTransaction(transaction);
          
          // Verify journal entries were created
          const allJournalEntries = await getDB().journal_entries
            .where('transaction_id')
            .equals(transactionId)
            .toArray();
          
          console.log(`[CREATE_TRANSACTION] ✅ Journal entries created:`, {
            count: allJournalEntries.length,
            entries: allJournalEntries.map(e => ({
              account_code: e.account_code,
              debit_usd: e.debit_usd,
              credit_usd: e.credit_usd,
              debit_lbp: e.debit_lbp,
              credit_lbp: e.credit_lbp,
              is_posted: e.is_posted
            }))
          });

          // 7. BALANCES ARE NOW CALCULATED FROM JOURNAL ENTRIES
          // No need to update entity balance fields - they are derived from journal entries
          // Use entityBalanceService.getEntityBalance() to get current balance

          // 8. UPDATE CASH DRAWER (if enabled and applicable)
          const shouldUpdateCashDrawer = params.updateCashDrawer !== false && this.isCashDrawerCategory(params.category);
          console.log(`[CREATE_TRANSACTION] Cash drawer update check:`, {
            shouldUpdate: shouldUpdateCashDrawer,
            updateCashDrawer: params.updateCashDrawer,
            isCashDrawerCategory: this.isCashDrawerCategory(params.category)
          });
          
          if (shouldUpdateCashDrawer) {
            console.log(`[CREATE_TRANSACTION] Updating cash drawer for transaction: ${transactionId}`);
            cashDrawerImpact = await this.updateCashDrawerAtomic(
              transaction,
              params.context.storeId,
              params.context.branchId
            );
            console.log(`[CREATE_TRANSACTION] Cash drawer update result:`, cashDrawerImpact);
          } else {
            console.log(`[CREATE_TRANSACTION] Skipping cash drawer update (not applicable for this transaction type)`);
          }
        }
      );
      // ⭐⭐⭐ END ATOMIC TRANSACTION ⭐⭐⭐
      
      // Verify journal entries are persisted after transaction commits
      const persistedEntries = await getDB().journal_entries
        .where('transaction_id')
        .equals(transactionId)
        .toArray();
      
      console.log(`[CREATE_TRANSACTION] Post-transaction verification:`, {
        transactionId,
        journalEntriesFound: persistedEntries.length,
        entries: persistedEntries.map(e => ({
          id: e.id,
          account_code: e.account_code,
          debit_usd: e.debit_usd,
          credit_usd: e.credit_usd,
          debit_lbp: e.debit_lbp,
          credit_lbp: e.credit_lbp,
          is_posted: e.is_posted
        }))
      });
      
      if (persistedEntries.length === 0) {
        console.error(`[CREATE_TRANSACTION] ❌ CRITICAL: No journal entries found after transaction commit!`);
      } else if (persistedEntries.length !== 2) {
        console.warn(`[CREATE_TRANSACTION] ⚠️ Expected 2 journal entries but found ${persistedEntries.length}`);
      }
      
      console.log(`[CREATE_TRANSACTION] ✅ Transaction created successfully:`, {
        transactionId,
        cashDrawerImpact,
        journalEntriesCount: persistedEntries.length,
        success: true
      });

      // Trigger sync after transaction completes
      // This ensures hooks that might not fire during transactions still trigger sync
      try {
        console.log('🔄 [TransactionService] Triggering sync after transaction completes');
        const { syncTriggerService } = await import('./syncTriggerService');
        syncTriggerService.triggerSync();
        console.log('🔄 [TransactionService] Sync trigger called successfully');
      } catch (syncError) {
        // Non-critical - sync will happen via other mechanisms if this fails
        console.warn('⚠️ [TransactionService] Failed to trigger sync after transaction:', syncError);
      }

      // 8. CREATE AUDIT LOG (outside transaction - non-critical)
      let auditLogId;
      if (params.createAuditLog !== false) {
        try {
          auditLogId = await this.createAuditLog(
            transaction,
            balanceBefore,
            balanceAfter,
            params.context,
            correlationId
          );
        } catch (auditError) {
          // Log audit error but don't fail the transaction
          console.warn('⚠️ Audit log creation failed:', auditError);
        }
      }

      // 9. RETURN RESULT
      return {
        success: true,
        transactionId,
        balanceBefore,
        balanceAfter,
        affectedRecords,
        auditLogId,
        correlationId,
        cashDrawerImpact
      };

    } catch (error) {
      console.error(`[CREATE_TRANSACTION] ❌ Transaction creation failed (all operations rolled back):`, {
        error: error instanceof Error ? error.message : 'Unknown error',
        stack: error instanceof Error ? error.stack : undefined,
        category: params.category,
        amount: params.amount,
        currency: params.currency,
        storeId: params.context.storeId,
        branchId: params.context.branchId
      });
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
        balanceBefore: 0,
        balanceAfter: 0,
        affectedRecords: []
      };
    }
  }

  // ==========================================================================
  // CONVENIENCE METHODS FOR SPECIFIC TRANSACTION TYPES
  // ==========================================================================

  /**
   * Create customer payment transaction
   */
  public async createCustomerPayment(
    entityId: string,
    amount: number,
    currency: 'USD' | 'LBP',
    description: MultilingualString,
    context: TransactionContext,
    options: { reference?: string; updateCashDrawer?: boolean } = {}
  ): Promise<TransactionResult> {
    return this.createTransaction({
      category: TRANSACTION_CATEGORIES.CUSTOMER_PAYMENT,
      amount,
      currency,
      description,
      context,
      entityId,
      reference: options.reference,
      updateCashDrawer: options.updateCashDrawer
    });
  }

  /**
   * Create supplier payment transaction
   */
  public async createSupplierPayment(
    entityId: string,
    amount: number,
    currency: 'USD' | 'LBP',
    description: MultilingualString,
    context: TransactionContext,
    options: { reference?: string; updateCashDrawer?: boolean } = {}
  ): Promise<TransactionResult> {
    return this.createTransaction({
      category: TRANSACTION_CATEGORIES.SUPPLIER_PAYMENT,
      amount,
      currency,
      description,
      context,
      entityId,
      reference: options.reference,
      updateCashDrawer: options.updateCashDrawer
    });
  }

  /**
   * Create customer credit sale transaction
   */
  public async createCustomerCreditSale(
    entityId: string,
    amount: number,
    currency: 'USD' | 'LBP',
    description: string,
    context: TransactionContext,
    options: { reference?: string } = {}
  ): Promise<TransactionResult> {
    return this.createTransaction({
      category: TRANSACTION_CATEGORIES.CUSTOMER_CREDIT_SALE,
      amount,
      currency,
      description,
      context,
      entityId,
      reference: options.reference,
      updateCashDrawer: false // Credit sales don't affect cash drawer
    });
  }

  /**
   * Create employee payment transaction
   */
  public async createEmployeePayment(
    entityId: string,
    amount: number,
    currency: 'USD' | 'LBP',
    description: string,
    context: TransactionContext,
    options: { reference?: string; updateCashDrawer?: boolean } = {}
  ): Promise<TransactionResult> {
    return this.createTransaction({
      category: TRANSACTION_CATEGORIES.EMPLOYEE_PAYMENT,
      amount,
      currency,
      description,
      context,
      entityId,
      reference: options.reference,
      updateCashDrawer: options.updateCashDrawer
    });
  }

  /**
   * Create cash drawer sale transaction
   */
  public async createCashDrawerSale(
    amount: number,
    currency: 'USD' | 'LBP',
    description: string | MultilingualString,
    context: TransactionContext,
    options: { reference?: string; entityId?: string } = {}
  ): Promise<TransactionResult> {
    // Convert string description to MultilingualString if needed
    const multilingualDescription: MultilingualString = typeof description === 'string' 
      ? createMultilingualFromString(description)
      : description;
    
    return this.createTransaction({
      category: TRANSACTION_CATEGORIES.CASH_DRAWER_SALE,
      amount,
      currency,
      description: multilingualDescription,
      context,
      entityId: options.entityId,
      reference: options.reference,
      updateCashDrawer: true
    });
  }

  /**
   * Create cash drawer expense transaction
   */
  public async createCashDrawerExpense(
    amount: number,
    currency: 'USD' | 'LBP',
    description: string,
    context: TransactionContext,
    options: { reference?: string; category?: string } = {}
  ): Promise<TransactionResult> {
    return this.createTransaction({
      category: TRANSACTION_CATEGORIES.CASH_DRAWER_EXPENSE,
      amount,
      currency,
      description,
      context,
      reference: options.reference,
      updateCashDrawer: true,
      metadata: { expenseCategory: options.category }
    });
  }

  /**
   * Create inventory cash purchase transaction
   * Creates journal entries: Debit Inventory (1300), Credit Cash (1100)
   */
  public async createInventoryCashPurchase(
    amount: number,
    currency: 'USD' | 'LBP',
    description: string,
    context: TransactionContext,
    options: { reference?: string; metadata?: Record<string, any> } = {}
  ): Promise<TransactionResult> {
    return this.createTransaction({
      category: TRANSACTION_CATEGORIES.INVENTORY_CASH_PURCHASE,
      amount,
      currency,
      description,
      context,
      reference: options.reference,
      metadata: options.metadata,
      updateCashDrawer: true
    });
  }

  /**
   * Create accounts receivable transaction
   */
  public async createAccountsReceivable(
    entityId: string,
    amount: number,
    currency: 'USD' | 'LBP',
    description: string,
    context: TransactionContext
  ): Promise<TransactionResult> {
    return this.createTransaction({
      category: TRANSACTION_CATEGORIES.ACCOUNTS_RECEIVABLE,
      amount,
      currency,
      description,
      context,
      entityId,
      reference: generateARReference(),
      updateCashDrawer: false
    });
  }

  /**
   * Create accounts payable transaction
   */
  public async createAccountsPayable(
    entityId: string,
    amount: number,
    currency: 'USD' | 'LBP',
    description: string,
    context: TransactionContext
  ): Promise<TransactionResult> {
    return this.createTransaction({
      category: TRANSACTION_CATEGORIES.ACCOUNTS_PAYABLE,
      amount,
      currency,
      description,
      context,
      entityId,
      reference: generateAPReference(),
      updateCashDrawer: false
    });
  }

  /**
   * Create supplier credit purchase transaction
   * Creates journal entries: Debit Inventory (1300), Credit Accounts Payable (2100)
   * Does NOT affect cash drawer
   */
  public async createSupplierCreditPurchase(
    entityId: string,
    amount: number,
    currency: 'USD' | 'LBP',
    description: string,
    context: TransactionContext,
    options: { reference?: string; metadata?: Record<string, any> } = {}
  ): Promise<TransactionResult> {
    return this.createTransaction({
      category: TRANSACTION_CATEGORIES.SUPPLIER_CREDIT_SALE,
      amount,
      currency,
      description,
      context,
      entityId,
      reference: options.reference || generateAPReference(),
      metadata: options.metadata,
      updateCashDrawer: false // Credit purchases don't affect cash drawer
    });
  }

  // ==========================================================================
  // TRANSACTION MODIFICATION
  // ==========================================================================

  /**
   * Update an existing transaction atomically
   * Handles balance adjustments and maintains data integrity
   */
  public async updateTransaction(
    transactionId: string,
    updates: Partial<CreateTransactionParams>,
    context: TransactionContext
  ): Promise<TransactionResult> {
    try {
      // Get original transaction (outside transaction - read-only)
      const original = await getDB().transactions.get(transactionId);
      if (!original) {
        return {
          success: false,
          error: 'Transaction not found',
          balanceBefore: 0,
          balanceAfter: 0,
          affectedRecords: []
        };
      }

      if (original._deleted) {
        return {
          success: false,
          error: 'Cannot update deleted transaction',
          balanceBefore: 0,
          balanceAfter: 0,
          affectedRecords: []
        };
      }

      const timestamp = new Date().toISOString();
      let balanceBefore = 0;
      let balanceAfter = 0;
      const affectedRecords: string[] = [transactionId];

      // ⭐⭐⭐ ATOMIC TRANSACTION BLOCK ⭐⭐⭐
      await getDB().transaction('rw', 
        [getDB().transactions, getDB().entities, getDB().cash_drawer_sessions], 
        async () => {
          // Get current balance before update
          balanceBefore = await this.getEntityBalance(
            original.entity_id || null,
            original.currency
          );

          // If amount or type changed, we need to reverse old balance impact
          // and apply new balance impact
          if (updates.amount !== undefined || updates.category !== undefined) {
            // Reverse original transaction impact
            const reversalTransaction: Transaction = {
              ...original,
              type: original.type === 'income' ? 'expense' : 'income', // Reverse type
              amount: original.amount, // Keep original amount
              category: original.category as TransactionCategory,
              description: typeof original.description === 'string' ? original.description : JSON.stringify(original.description)
            };
            
            // Balances are calculated from journal entries - no need to update
            
            // Apply new transaction impact
            const newType = updates.category ? getTransactionType(updates.category) : original.type;
            const newAmount = updates.amount ?? original.amount;
            
            const newTransaction: Transaction = {
              ...original,
              type: newType as TransactionType,
              amount: newAmount,
              category: (updates.category ?? original.category) as TransactionCategory,
              description: typeof original.description === 'string' ? original.description : JSON.stringify(original.description)
            };
            
            // Balances are calculated from journal entries - no need to update
            // Use entityBalanceService.getEntityBalance() to get current balance
          } else {
            balanceAfter = balanceBefore;
          }

          // Update the transaction record
          const updateData: any = {
            ...updates,
            updated_at: timestamp,
            _synced: false
          };

          // Remove context from updates as it's not a transaction field
          delete updateData.context;

          await getDB().transactions.update(transactionId, updateData);
        }
      );
      // ⭐⭐⭐ END ATOMIC TRANSACTION ⭐⭐⭐

      // Create audit log (outside transaction - non-critical)
      try {
        await auditLogService.log({
          action: 'transaction_updated',
          entityType: 'transaction',
          entityId: transactionId,
          description: `Transaction updated: ${original.description} | Balance: ${balanceBefore} → ${balanceAfter}`,
          userId: context.userId,
          userEmail: context.userEmail,
          severity: 'medium',
          tags: ['transaction', 'update'],
          metadata: {
            source: (context.source === 'offline' ? 'system' : context.source) || 'web',
            module: context.module,
            sessionId: context.sessionId
          }
        });
      } catch (auditError) {
        console.warn('⚠️ Audit log creation failed:', auditError);
      }

      return {
        success: true,
        transactionId,
        balanceBefore,
        balanceAfter,
        affectedRecords
      };

    } catch (error) {
      console.error('❌ Transaction update failed (all operations rolled back):', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Update failed',
        balanceBefore: 0,
        balanceAfter: 0,
        affectedRecords: []
      };
    }
  }

  /**
   * Create reversal journal entries for a set of original journal entries
   * This helper function swaps debit/credit and links entries via reversal_of_journal_entry_id
   */
  private createReversalJournalEntries(
    originalEntries: JournalEntry[],
    reversalTransactionId: string,
    description: string,
    createdBy: string,
    postedDate: string,
    includeCashDrawer: boolean = true
  ): JournalEntry[] {
    const reversalEntries: JournalEntry[] = [];
    const now = new Date().toISOString();
    const fiscalPeriod = getFiscalPeriodForDate(now).period;

    for (const entry of originalEntries) {
      // Skip cash drawer entries if not including them (they'll be handled separately)
      if (!includeCashDrawer && entry.account_code === '1100') {
        continue;
      }

      const reversalEntry: JournalEntry = {
        id: createId(),
        store_id: entry.store_id,
        branch_id: entry.branch_id,
        transaction_id: reversalTransactionId,
        account_code: entry.account_code,
        account_name: entry.account_name,
        entity_id: entry.entity_id,
        entity_type: entry.entity_type,
        debit_usd: entry.credit_usd, // Swap: original credit becomes debit
        credit_usd: entry.debit_usd, // Swap: original debit becomes credit
        debit_lbp: entry.credit_lbp,
        credit_lbp: entry.debit_lbp,
        description: description,
        posted_date: postedDate,
        fiscal_period: fiscalPeriod,
        is_posted: true,
        created_by: createdBy,
        created_at: now,
        _synced: false,
        entry_type: 'reversal' as const, // Explicit type
        reversal_of_journal_entry_id: entry.id // Link to original entry
      };
      reversalEntries.push(reversalEntry);
    }

    return reversalEntries;
  }

  /**
   * Delete (soft delete) a transaction atomically
   * Reverses balance impacts and maintains data integrity
   */
  public async deleteTransaction(
    transactionId: string,
    context: TransactionContext
  ): Promise<TransactionResult> {
    try {
      // Get original transaction (outside transaction - read-only)
      const transaction = await getDB().transactions.get(transactionId);
      if (!transaction) {
        return {
          success: false,
          error: 'Transaction not found',
          balanceBefore: 0,
          balanceAfter: 0,
          affectedRecords: []
        };
      }

      // Check if already deleted (either via _deleted flag or metadata.deleted)
      if (transaction._deleted || (transaction.metadata as any)?.deleted === true) {
        return {
          success: false,
          error: 'Transaction already deleted',
          balanceBefore: 0,
          balanceAfter: 0,
          affectedRecords: []
        };
      }

      const timestamp = new Date().toISOString();
      const postedDate = getLocalDateString(timestamp);
      
      // Get current balance before deletion (outside transaction - read-only)
      const balanceBefore = await this.getEntityBalance(
        transaction.entity_id || null,
        transaction.currency
      );
      
      let balanceAfter = balanceBefore;
      const affectedRecords: string[] = [transactionId];

      // Get original journal entries (outside transaction - read-only)
      const originalJournalEntries = await getDB().journal_entries
        .where('transaction_id')
        .equals(transactionId)
        .and(entry => entry.is_posted === true)
        .toArray();

      if (originalJournalEntries.length === 0) {
        console.warn(`⚠️ No journal entries found for transaction ${transactionId} - cannot create reversals`);
      }

      // Create reversal transaction ID for linking
      const reversalTransactionId = createId();

      // ⭐⭐⭐ ATOMIC TRANSACTION BLOCK ⭐⭐⭐
      // Include all object stores that updateCashDrawerAtomic needs:
      // - cash_drawer_accounts (for updating balance)
      // - journal_entries (for reading cash journal entries and creating reversals)
      await getDB().transaction('rw', 
        [getDB().transactions, getDB().entities, getDB().cash_drawer_sessions, getDB().cash_drawer_accounts, getDB().journal_entries], 
        async () => {

          // Create reversal journal entries for all original entries
          if (originalJournalEntries.length > 0) {
            const reversalDescription = `Transaction deletion - ${typeof transaction.description === 'string' ? transaction.description : JSON.stringify(transaction.description)}`;
            
            // Create reversal entries for all journal entries
            const reversalEntries = this.createReversalJournalEntries(
              originalJournalEntries,
              reversalTransactionId,
              reversalDescription,
              context.userId,
              postedDate,
              true // Include cash drawer entries
            );

            if (reversalEntries.length > 0) {
              await getDB().journal_entries.bulkAdd(reversalEntries);
              console.log(`🔄 Created ${reversalEntries.length} reversal journal entries for transaction ${transactionId}`);
              affectedRecords.push(...reversalEntries.map(e => e.id));
            }
          }

          // Balances are calculated from journal entries - the reversal entries will automatically reflect the correct balance
          // Use entityBalanceService.getEntityBalance() to get current balance

          // Reverse cash drawer impact if applicable
          if (this.isCashDrawerCategory(transaction.category as TransactionCategory)) {
            // Calculate the original cash drawer impact and negate it
            const account = await getDB().getCashDrawerAccount(context.storeId, context.branchId);
            
            if (account) {
              // Get journal entries for the original transaction to calculate what it did
              const cashJournalEntries = originalJournalEntries.filter(e => e.account_code === '1100');
              
              // Calculate original balance change: sum of (debit - credit) for cash account entries
              // ✅ Journal entries use new schema: debit_usd, credit_usd, debit_lbp, credit_lbp
              let originalBalanceChange = 0;
              for (const entry of cashJournalEntries) {
                // Calculate net change for each currency
                const usdChange = (entry.debit_usd || 0) - (entry.credit_usd || 0);
                const lbpChange = (entry.debit_lbp || 0) - (entry.credit_lbp || 0);
                
                // Convert USD change to LBP and add to total
                if (usdChange !== 0) {
                  const usdInLbp = currencyService.convertCurrency(usdChange, 'USD', 'LBP');
                  originalBalanceChange += usdInLbp;
                }
                
                // Add LBP change directly
                originalBalanceChange += lbpChange;
              }
              
              // Reverse the balance change (negate it)
              const reversalBalanceChange = -originalBalanceChange;
              
              // ✅ Balance is computed from journal entries - no need to update current_balance field
              // The reversal journal entries will automatically reflect the correct balance
              console.log(`💰 Cash drawer balance reversal impact: ${reversalBalanceChange > 0 ? '+' : ''}${reversalBalanceChange.toLocaleString()} LBP (balance computed from journal entries)`);
            }
          }

          // Mark transaction as canceled using metadata (preserves history)
          const existingMetadata = transaction.metadata || {};
          await getDB().transactions.update(transactionId, {
            metadata: {
              ...existingMetadata,
              deleted: true,
              deletedAt: timestamp,
              deletedBy: context.userId,
              deletionReason: 'Payment canceled by user',
              reversalTransactionId: reversalTransactionId
            },
            updated_at: timestamp,
            _synced: false
          });
        }
      );
      // ⭐⭐⭐ END ATOMIC TRANSACTION ⭐⭐⭐

      // Create audit log (outside transaction - non-critical)
      try {
        await auditLogService.log({
          action: 'transaction_deleted',
          entityType: 'transaction',
          entityId: transactionId,
          description: `Transaction deleted: ${transaction.description} | Balance reversed: ${balanceBefore} → ${balanceAfter} ${transaction.currency}`,
          userId: context.userId,
          userEmail: context.userEmail,
          severity: 'high',
          tags: ['transaction', 'delete'],
          metadata: {
            source: (context.source === 'offline' ? 'system' : context.source) || 'web',
            module: context.module,
            sessionId: context.sessionId
          }
        });
      } catch (auditError) {
        console.warn('⚠️ Audit log creation failed:', auditError);
      }

      return {
        success: true,
        transactionId,
        balanceBefore,
        balanceAfter,
        affectedRecords
      };

    } catch (error) {
      console.error('❌ Transaction deletion failed (all operations rolled back):', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Delete failed',
        balanceBefore: 0,
        balanceAfter: 0,
        affectedRecords: []
      };
    }
  }

  // ==========================================================================
  // QUERY METHODS
  // ==========================================================================

  /**
   * Get transaction by ID
   */
  public async getTransaction(transactionId: string): Promise<Transaction | null> {
    try {
      const transaction = await getDB().transactions.get(transactionId);
      return transaction || null;
    } catch (error) {
      console.error('Error getting transaction:', error);
      return null;
    }
  }

  /**
   * Get transactions by store
   */
  public async getTransactionsByStore(
    storeId: string,
    options: {
      startDate?: string;
      endDate?: string;
      category?: TransactionCategory;
      includeDeleted?: boolean;
    } = {}
  ): Promise<Transaction[]> {
    try {
      let transactions = await getDB().transactions
        .where('store_id')
        .equals(storeId)
        .toArray();

      // Filter deleted (both _deleted flag and metadata.deleted)
      if (!options.includeDeleted) {
        transactions = transactions.filter(t => 
          !t._deleted && (t.metadata as any)?.deleted !== true
        );
      }

      // Filter by date range
      if (options.startDate || options.endDate) {
        transactions = transactions.filter(t => {
          const date = new Date(t.created_at);
          const start = options.startDate ? new Date(options.startDate) : new Date(0);
          const end = options.endDate ? new Date(options.endDate) : new Date();
          return date >= start && date <= end;
        });
      }

      // Filter by category
      if (options.category) {
        transactions = transactions.filter(t => t.category === options.category);
      }

      return transactions.sort((a, b) => 
        new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
      );

    } catch (error) {
      console.error('Error getting transactions:', error);
      return [];
    }
  }

  /**
   * Get transactions by entity
   * Uses entity_id (unified field) with fallback to legacy fields for backward compatibility
   */
  public async getTransactionsByEntity(
    entityId: string,
    entityType: 'customer' | 'supplier' | 'employee'
  ): Promise<Transaction[]> {
    try {
      // Prefer entity_id index, but fall back to legacy fields for backward compatibility
      // Try entity_id first (unified field)
      let transactions = await getDB().transactions
        .where('entity_id')
        .equals(entityId)
        .and(t => !t._deleted)
        .toArray();
      
      // If no results with entity_id, fall back to legacy field
      if (transactions.length === 0) {
        const fieldName = `${entityType}_id`;
        transactions = await getDB().transactions
          .where(fieldName)
          .equals(entityId)
          .and(t => !t._deleted)
          .toArray();
      }

      return transactions.sort((a, b) => 
        new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
      );

    } catch (error) {
      console.error('Error getting entity transactions:', error);
      return [];
    }
  }

  /**
   * Get transaction impact summary for preview/display
   * Shows how a transaction affects cash drawer and entity balances
   */
  public async getTransactionImpactSummary(transactionId: string): Promise<{
    cashDrawerImpact: boolean;
    entityImpact: {
      type: 'customer' | 'supplier' | null;
      entityId: string | null;
      entityName: string | null;
    };
    estimatedBalanceChanges: {
      cashDrawer?: number;
      entity?: number;
    };
  }> {
    try {
      const transaction = await getDB().transactions.get(transactionId);
      if (!transaction) {
        return {
          cashDrawerImpact: false,
          entityImpact: { type: null, entityId: null, entityName: null },
          estimatedBalanceChanges: {}
        };
      }

      const amountInUSD = currencyService.convertCurrency(transaction.amount, transaction.currency, 'USD');
      let entityName: string | null = null;
      let entityType: 'customer' | 'supplier' | null = null;
      let entityId: string | null = null;

      if (transaction.entity_id) {
        const entity = await getDB().entities.get(transaction.entity_id);
        if (entity) {
          entityName = entity.name || 'Unknown Entity';
          entityType = entity.entity_type as 'customer' | 'supplier' | 'employee';
          entityId = transaction.entity_id;
        }
      }

      // Check if transaction affects cash drawer
      const cashDrawerImpact = this.isCashDrawerCategory(transaction.category as TransactionCategory);

      return {
        cashDrawerImpact,
        entityImpact: {
          type: entityType,
          entityId,
          entityName
        },
        estimatedBalanceChanges: {
          cashDrawer: cashDrawerImpact ? 
            (transaction.type === 'income' ? amountInUSD : -amountInUSD) : undefined,
          entity: entityType ? 
            (entityType === 'customer' ? 
              (transaction.type === 'income' ? -amountInUSD : amountInUSD) :
              (transaction.type === 'expense' ? -amountInUSD : amountInUSD)
            ) : undefined
        }
      };

    } catch (error) {
      console.error('Error getting transaction impact summary:', error);
      return {
        cashDrawerImpact: false,
        entityImpact: { type: null, entityId: null, entityName: null },
        estimatedBalanceChanges: {}
      };
    }
  }

  // ==========================================================================
  // PRIVATE HELPER METHODS
  // ==========================================================================

  /**
   * Validate transaction parameters
   */
  private validateTransaction(params: CreateTransactionParams): { isValid: boolean; errors: string[] } {
    const errors: string[] = [];

    // Validate category
    if (!params.category || !isValidTransactionCategory(params.category)) {
      errors.push(`Invalid category: ${params.category}`);
    }

    // Validate amount
    if (!params.amount || params.amount <= 0) {
      errors.push('Amount must be greater than 0');
    }

    // Validate currency
    if (!params.currency || !['USD', 'LBP'].includes(params.currency)) {
      errors.push('Currency must be USD or LBP');
    }

    // Validate currency amount
    if (!currencyService.validateCurrencyAmount(params.amount, params.currency)) {
      errors.push('Invalid currency amount');
    }

    // Validate description
    if (!params.description) {
      errors.push('Description is required');
    } else if (typeof params.description === 'string') {
      // String description - check it's not empty
      if (params.description.trim().length === 0) {
        errors.push('Description is required');
      }
    } else if (typeof params.description === 'object') {
      // Multilingual object - check at least one language has content
      const values = Object.values(params.description);
      if (values.length === 0 || values.every(value => !value || (typeof value === 'string' && value.trim().length === 0))) {
        errors.push('Description is required');
      }
    }

    // Validate context
    if (!params.context || !params.context.userId || !params.context.storeId) {
      errors.push('Valid context with userId and storeId is required');
    }

    // Validate entity IDs (at least one should be provided for most categories)
    // Categories that don't require entity IDs
    const requiresEntity = ![
      TRANSACTION_CATEGORIES.CASH_DRAWER_EXPENSE,
      TRANSACTION_CATEGORIES.CASH_DRAWER_SALE,
      TRANSACTION_CATEGORIES.CASH_DRAWER_PAYMENT,
      TRANSACTION_CATEGORIES.CASH_DRAWER_REFUND,
      TRANSACTION_CATEGORIES.INVENTORY_CASH_PURCHASE
    ].includes(params.category);

    if (requiresEntity && !params.entityId) {
      errors.push('Entity ID is required for this transaction category');
    }

    return {
      isValid: errors.length === 0,
      errors
    };
  }

  /**
   * Get current entity balance from journal entries (source of truth)
   * Can be called within or outside transactions (read-only operation)
   * Updated to use journal-based calculations instead of cached balance fields
   */
  private async getEntityBalance(
    entityId: string | null | undefined,
    currency: 'USD' | 'LBP' = 'USD'
  ): Promise<number> {
    try {
      if (!entityId) {
        return 0;
      }

      // Get entity to determine type
      const entity = await getDB().entities.get(entityId);
      if (!entity) {
        return 0;
      }

      // Determine account code based on entity type
      let accountCode: '1200' | '2100' = '1200';
      if (entity.entity_type === 'supplier') {
        accountCode = '2100';
      } else if (entity.entity_type === 'customer') {
        accountCode = '1200';
      } else {
        // Employees and other types don't have AR/AP balances
        return 0;
      }

      // Calculate balance from journal entries
      const { entityBalanceService } = await import('./entityBalanceService');
      return await entityBalanceService.getEntityBalance(
        entityId,
        currency,
        accountCode,
        true // Use snapshot optimization
      );
    } catch (error) {
      console.error('Error getting entity balance:', error);
      return 0;
    }
  }

  /**
   * @deprecated Entity balances are now calculated from journal entries
   * Use entityBalanceService.getEntityBalance() instead
   * This method has been removed as part of the journal-based balance migration
   * 
   * Balances are DERIVED from journal entries, not STORED in entity fields.
   * Journal entries are the single source of truth.
   */

  /**
   * Update cash drawer account balance atomically within IndexedDB transaction
   * This method MUST be called within a getDB().transaction() block
   * 
   * ✅ Calculates cash drawer balance impact from journal entries (account_code = 1100)
   * ✅ Journal entries are the single source of truth - balance is computed, not stored
   */
  private async updateCashDrawerAtomic(
    transaction: Transaction,
    storeId: string,
    branchId: string
  ): Promise<{ previousBalance: number; newBalance: number } | undefined> {
    console.log(`[CASH_DRAWER_UPDATE] Starting cash drawer update:`, {
      transactionId: transaction.id,
      category: transaction.category,
      amount: transaction.amount,
      currency: transaction.currency,
      storeId,
      branchId
    });
    
    try {
      // ✅ Get cash drawer ACCOUNT (not session) - this is what we update
      const account = await getDB().getCashDrawerAccount(storeId, branchId);

      if (!account) {
        console.error(`[CASH_DRAWER_UPDATE] ❌ No cash drawer account found:`, {
          storeId,
          branchId,
          transactionId: transaction.id
        });
        return undefined;
      }

      console.log(`[CASH_DRAWER_UPDATE] Cash drawer account found:`, {
        accountId: account.id,
        accountCode: (account as any).account_code
      });

      // ✅ Calculate balance change from journal entries (account_code = 1100) for this transaction
      // Journal entries are the single source of truth
      console.log(`[CASH_DRAWER_UPDATE] Fetching journal entries for transaction: ${transaction.id}`);
      
      const cashJournalEntries = await getDB().journal_entries
        .where('transaction_id')
        .equals(transaction.id)
        .and(entry => entry.account_code === '1100' && entry.is_posted === true)
        .toArray();

      console.log(`[CASH_DRAWER_UPDATE] Journal entries found:`, {
        count: cashJournalEntries.length,
        entries: cashJournalEntries.map(e => ({
          id: e.id,
          account_code: e.account_code,
          debit_usd: e.debit_usd,
          credit_usd: e.credit_usd,
          debit_lbp: e.debit_lbp,
          credit_lbp: e.credit_lbp,
          is_posted: e.is_posted
        }))
      });

      // Calculate balance change for each currency separately
      // ✅ Journal entries use new schema: debit_usd, credit_usd, debit_lbp, credit_lbp
      let usdBalanceChange = 0;
      let lbpBalanceChange = 0;
      
      for (const entry of cashJournalEntries) {
        // Calculate net change for each currency
        const usdChange = (entry.debit_usd || 0) - (entry.credit_usd || 0);
        const lbpChange = (entry.debit_lbp || 0) - (entry.credit_lbp || 0);
        
        console.log(`[CASH_DRAWER_UPDATE] Processing journal entry:`, {
          entryId: entry.id,
          debit_usd: entry.debit_usd,
          credit_usd: entry.credit_usd,
          debit_lbp: entry.debit_lbp,
          credit_lbp: entry.credit_lbp,
          usdChange,
          lbpChange
        });
        
        usdBalanceChange += usdChange;
        lbpBalanceChange += lbpChange;
      }

      // If no cash journal entries found, this transaction doesn't affect cash drawer
      if (cashJournalEntries.length === 0) {
        console.warn(`[CASH_DRAWER_UPDATE] ⚠️ No cash journal entries (account_code=1100) found for transaction ${transaction.id}. Cash drawer not updated.`, {
          transactionId: transaction.id,
          category: transaction.category
        });
        return undefined;
      }

      // Get all cash entries to calculate current balances
      let allCashEntries;
      try {
        allCashEntries = await getDB().journal_entries
          .where('[store_id+account_code]')
          .equals([storeId, '1100'])
          .and(e => e.is_posted === true && e.branch_id === branchId)
          .toArray();
      } catch (error) {
        // Fallback if compound index doesn't exist
        allCashEntries = await getDB().journal_entries
          .where('[store_id+branch_id]')
          .equals([storeId, branchId])
          .and(e => e.account_code === '1100' && e.is_posted === true)
          .toArray();
      }
      
      // Calculate current balances for both currencies
      const { calculateBothCurrencies } = await import('../utils/balanceCalculation');
      const currentBalances = calculateBothCurrencies(allCashEntries);
      
      // Calculate previous balances (before this transaction)
      const previousUsdBalance = currentBalances.USD - usdBalanceChange;
      const previousLbpBalance = currentBalances.LBP - lbpBalanceChange;
      
      // New balances (after this transaction)
      const newUsdBalance = currentBalances.USD;
      const newLbpBalance = currentBalances.LBP;

      console.log(`[CASH_DRAWER_UPDATE] ✅ Balances calculated:`, {
        previousUsdBalance: previousUsdBalance.toLocaleString(),
        previousLbpBalance: previousLbpBalance.toLocaleString(),
        usdBalanceChange: usdBalanceChange > 0 ? `+${usdBalanceChange.toLocaleString()}` : usdBalanceChange.toLocaleString(),
        lbpBalanceChange: lbpBalanceChange > 0 ? `+${lbpBalanceChange.toLocaleString()}` : lbpBalanceChange.toLocaleString(),
        newUsdBalance: newUsdBalance.toLocaleString(),
        newLbpBalance: newLbpBalance.toLocaleString(),
        transactionId: transaction.id
      });

      // ✅ Journal entries are the single source of truth - balances are computed, not stored
      // Balance cache fields (usd_balance, lbp_balance, current_balance) are never updated
      // All balance reads calculate from journal entries using calculateBothCurrencies()
      console.log(`💰 Cash drawer balances (from journal entries): USD ${previousUsdBalance.toLocaleString()} → ${newUsdBalance.toLocaleString()} (${usdBalanceChange > 0 ? '+' : ''}${usdBalanceChange.toLocaleString()}), LBP ${previousLbpBalance.toLocaleString()} → ${newLbpBalance.toLocaleString()} (${lbpBalanceChange > 0 ? '+' : ''}${lbpBalanceChange.toLocaleString()})`);

      return {
        previousBalance: previousLbpBalance, // Keep for backward compatibility
        newBalance: newLbpBalance // Keep for backward compatibility
      };

    } catch (error) {
      console.error(`[CASH_DRAWER_UPDATE] ❌ Error updating cash drawer atomically:`, {
        error: error instanceof Error ? error.message : 'Unknown error',
        stack: error instanceof Error ? error.stack : undefined,
        transactionId: transaction.id,
        storeId,
        branchId
      });
      throw error; // Re-throw to trigger transaction rollback
    }
  }

  /**
   * Update cash drawer for transaction (legacy method)
   * @deprecated Use updateCashDrawerAtomic within a transaction instead
   * @internal This method is kept for backward compatibility only
   */
  private async updateCashDrawerForTransaction(
    transaction: Transaction,
    context: TransactionContext
  ): Promise<{ previousBalance: number; newBalance: number } | undefined> {
    console.warn('⚠️ updateCashDrawerForTransaction is deprecated. Use atomic transactions instead.');
    
    try {
      // For backward compatibility, wrap in transaction
      let result: { previousBalance: number; newBalance: number } | undefined;
      
      await getDB().transaction('rw', [getDB().cash_drawer_sessions], async () => {
        result = await this.updateCashDrawerAtomic(transaction, context.storeId, context.branchId);
      });
      
      return result;
    } catch (error) {
      console.error('Error updating cash drawer:', error);
      return undefined;
    }
  }

  /**
   * Create audit log for transaction
   * This is called outside atomic transactions as audit logs are non-critical
   */
  private async createAuditLog(
    transaction: Transaction,
    balanceBefore: number,
    balanceAfter: number,
    context: TransactionContext,
    correlationId: string
  ): Promise<string> {
    // Map source to audit log accepted values
    const auditSource = context.source === 'offline' ? 'system' : (context.source || 'web');
    
    return auditLogService.log({
      action: 'transaction_created',
      entityType: 'transaction',
      entityId: transaction.id,
      entityName: `${transaction.category} - ${transaction.description}`,
      description: `Transaction created: ${currencyService.formatCurrency(transaction.amount, transaction.currency)} - ${transaction.description}`,
      userId: context.userId,
      userEmail: context.userEmail,
      userName: context.userName,
      newData: transaction,
      balanceChange: {
        entityType: transaction.entity_id ? (await getDB().entities.get(transaction.entity_id))?.entity_type as 'customer' | 'supplier' | 'employee' || 'cash_drawer' : 'cash_drawer',
        balanceBefore,
        balanceAfter,
        currency: transaction.currency
      },
      correlationId,
      severity: 'medium',
      tags: ['transaction', 'create', transaction.category.toLowerCase().replace(/\s+/g, '_')],
      metadata: {
        source: auditSource as 'web' | 'mobile' | 'api' | 'system',
        module: context.module,
        sessionId: context.sessionId
      }
    });
  }

  /**
   * Create journal entries for a transaction (Accounting Migration Phase 3)
   * Uses account mapping utilities for consistent double-entry bookkeeping
   */
  private async createJournalEntriesForTransaction(transaction: Transaction): Promise<void> {
    console.log(`[CREATE_JOURNAL_ENTRIES] Starting journal entry creation:`, {
      transactionId: transaction.id,
      category: transaction.category,
      amount: transaction.amount,
      currency: transaction.currency,
      entity_id: transaction.entity_id,
      branch_id: transaction.branch_id
    });
    
    try {
      // Get entity CODE using account mapping utilities
      // Note: getEntityCodeForTransaction returns an entity CODE (e.g., "CASH-CUST"), not an entity ID
      const providedEntityCode = transaction.entity_id || null;
      console.log(`[CREATE_JOURNAL_ENTRIES] Provided entity code: ${providedEntityCode}`);
      
      const entityCode = getEntityCodeForTransaction(transaction.category, providedEntityCode);
      console.log(`[CREATE_JOURNAL_ENTRIES] Resolved entity code: ${entityCode}`);
      
      // Convert entity CODE to entity ID by querying the entities table
      // If providedEntityCode is a UUID (customer_id, supplier_id, employee_id), use it directly
      // Otherwise, it's a system entity code and we need to look it up
      let entityId: string;
      let entity: any = null;
      
      // Check if providedEntityCode is a UUID (starts with valid UUID pattern)
      const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
      if (providedEntityCode && uuidPattern.test(providedEntityCode)) {
        // It's already a UUID (customer/supplier/employee ID), use it directly
        console.log(`[CREATE_JOURNAL_ENTRIES] Provided entity code is UUID, using directly: ${providedEntityCode}`);
        entityId = providedEntityCode;
        entity = await getDB().entities.get(entityId);
        console.log(`[CREATE_JOURNAL_ENTRIES] Entity found by UUID:`, entity ? { id: entity.id, name: entity.name, type: entity.entity_type } : 'NOT FOUND');
      } else {
        // It's a system entity code (e.g., "CASH-CUST"), need to look it up
        console.log(`[CREATE_JOURNAL_ENTRIES] Looking up system entity: ${entityCode} for store ${transaction.store_id}`);
        entity = await getSystemEntity(getDB(), transaction.store_id, entityCode);
        if (!entity) {
          console.error(`[CREATE_JOURNAL_ENTRIES] ❌ System entity not found: ${entityCode} for store ${transaction.store_id}`);
          throw new Error(`System entity not found: ${entityCode} for store ${transaction.store_id}. Make sure system entities are initialized.`);
        }
        entityId = entity.id;
        console.log(`[CREATE_JOURNAL_ENTRIES] System entity found:`, { id: entity.id, name: entity.name, type: entity.entity_type });
      }
      
      if (!entity) {
        console.error(`[CREATE_JOURNAL_ENTRIES] ❌ Entity not found: ${entityCode} (code) or ${entityId} (id)`);
        throw new Error(`Entity not found: ${entityCode} (code) or ${entityId} (id)`);
      }
      
      // Get account mapping for this transaction category
      const accountMapping = getAccountMapping(transaction.category);
      console.log(`[CREATE_JOURNAL_ENTRIES] Account mapping:`, {
        debitAccount: accountMapping.debitAccount,
        creditAccount: accountMapping.creditAccount
      });
      
      // Get entity information for description
      const description = getJournalDescription(
        transaction.category,
        entity.name,
        transaction.description
      );
      console.log(`[CREATE_JOURNAL_ENTRIES] Journal description: ${description}`);
      
      // Validate branch_id is present
      if (!transaction.branch_id) {
        console.error(`[CREATE_JOURNAL_ENTRIES] ❌ Transaction ${transaction.id} is missing branch_id`);
        throw new Error(`Transaction ${transaction.id} is missing branch_id. All transactions must have a branch_id for proper accounting.`);
      }

      console.log(`[CREATE_JOURNAL_ENTRIES] Calling journalService.createJournalEntry with:`, {
        transactionId: transaction.id,
        debitAccount: accountMapping.debitAccount,
        creditAccount: accountMapping.creditAccount,
        amount: transaction.amount,
        currency: transaction.currency,
        entityId,
        branchId: transaction.branch_id
      });

      // Create journal entry using the mapping
      await journalService.createJournalEntry({
        transactionId: transaction.id,
        debitAccount: accountMapping.debitAccount,
        creditAccount: accountMapping.creditAccount,
        amount: transaction.amount,
        currency: transaction.currency,
        entityId, // Now using actual UUID entity ID
        description,
        postedDate: getLocalDateString(transaction.created_at), // Extract local date part
        createdBy: transaction.created_by, // Pass user ID from transaction
        branchId: transaction.branch_id  // ✅ Pass branch_id from transaction to journal entry (required)
      });
      
      console.log(`[CREATE_JOURNAL_ENTRIES] ✅ Journal entries created for ${transaction.category}: ${transaction.id} (entity: ${entity.name}, id: ${entityId})`);
      
    } catch (error) {
      console.error(`[CREATE_JOURNAL_ENTRIES] ❌ Failed to create journal entries:`, {
        error: error instanceof Error ? error.message : 'Unknown error',
        stack: error instanceof Error ? error.stack : undefined,
        transactionId: transaction.id,
        category: transaction.category,
        entity_id: transaction.entity_id
      });
      throw error;
    }
  }


  /**
   * Check if category affects cash drawer
   * Uses account mapping to determine if transaction affects cash (account 1100)
   */
  private isCashDrawerCategory(category: TransactionCategory): boolean {
    try {
      const accountMapping = getAccountMapping(category);
      // Transaction affects cash drawer if it debits or credits cash account (1100)
      return accountMapping.debitAccount === '1100' || accountMapping.creditAccount === '1100';
    } catch (error) {
      // If no mapping exists, assume it doesn't affect cash drawer
      return false;
    }
  }

  /**
   * Generate reference based on category
   */
  private generateReferenceForCategory(category: TransactionCategory): string {
    switch (category) {
      case TRANSACTION_CATEGORIES.CUSTOMER_PAYMENT:
      case TRANSACTION_CATEGORIES.CUSTOMER_PAYMENT_RECEIVED:
      case TRANSACTION_CATEGORIES.SUPPLIER_PAYMENT:
      case TRANSACTION_CATEGORIES.SUPPLIER_PAYMENT_RECEIVED:
        return generatePaymentReference();
      
      case TRANSACTION_CATEGORIES.CASH_DRAWER_EXPENSE:
      case TRANSACTION_CATEGORIES.EMPLOYEE_PAYMENT:
        return generateExpenseReference();
      
      case TRANSACTION_CATEGORIES.ACCOUNTS_RECEIVABLE:
        return generateARReference();
      
      case TRANSACTION_CATEGORIES.ACCOUNTS_PAYABLE:
        return generateAPReference();
      
      default:
        return generateReference('TXN');
    }
  }

  /**
   * Generate unique transaction ID
   */
  private generateTransactionId(): string {
    // Use proper UUID generation instead of custom format
    return crypto.randomUUID();
  }

  /**
   * Generate correlation ID for grouped transactions
   */
  private generateCorrelationId(): string {
    // Use proper UUID for correlation ID as well
    return crypto.randomUUID();
  }
}

// Export singleton instance
export const transactionService = TransactionService.getInstance();
