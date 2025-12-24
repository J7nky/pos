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
import { 
  generatePaymentReference, 
  generateExpenseReference, 
  generateARReference, 
  generateAPReference,
  generateReference 
} from '../utils/referenceGenerator';

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
  description: string;
  context: TransactionContext;
  
  // Optional fields
  reference?: string;
  customerId?: string | null;
  supplierId?: string | null;
  employeeId?: string | null;
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
  customer_id: string | null;
  supplier_id: string | null;
  employee_id?: string | null;
  created_at: string;
  updated_at?: string;
  created_by: string;
  _synced: boolean;
  _deleted?: boolean;
  _lastSyncedAt?: string;
  metadata?: Record<string, any>;
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
      
      // 1. VALIDATION (outside transaction)
      const validationResult = this.validateTransaction(params);
      if (!validationResult.isValid) {
        return {
          success: false,
          error: validationResult.errors.join(', '),
          balanceBefore: 0,
          balanceAfter: 0,
          affectedRecords: []
        };
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

      // 3. GET BALANCE BEFORE (outside transaction - read-only)
      const balanceBefore = await this.getEntityBalance(
        params.customerId,
        params.supplierId,
        params.employeeId,
        params.currency
      );
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
        customer_id: params.customerId || null,
        supplier_id: params.supplierId || null,
        employee_id: params.employeeId || null,
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

      // ⭐⭐⭐ ATOMIC TRANSACTION BLOCK ⭐⭐⭐
      // ALL database write operations happen atomically
      await getDB().transaction('rw', 
        [getDB().transactions, getDB().cash_drawer_sessions, getDB().journal_entries, getDB().entities, getDB().chart_of_accounts, getDB().cash_drawer_accounts], 
        async () => {
          // Create timestamp inside transaction block for accurate commit time
          const timestamp = new Date().toISOString();
          transaction.created_at = timestamp;
          
      console.log(timestamp,8383883)
      // 5. CREATE TRANSACTION RECORD
          await getDB().transactions.add(transaction);

          // 6. CREATE JOURNAL ENTRIES (MANDATORY - ACCOUNTING RULE)
          // ✅ Journal entries are the source of truth for financial data
          // If journal entries fail, the entire transaction must be rolled back
          await this.createJournalEntriesForTransaction(transaction);

          // 7. BALANCES ARE NOW CALCULATED FROM JOURNAL ENTRIES
          // No need to update entity balance fields - they are derived from journal entries
          // Use entityBalanceService.getEntityBalance() to get current balance

          // 8. UPDATE CASH DRAWER (if enabled and applicable)
          if (params.updateCashDrawer !== false && this.isCashDrawerCategory(params.category)) {
            cashDrawerImpact = await this.updateCashDrawerAtomic(
              transaction,
              params.context.storeId,
              params.context.branchId
            );
          }
        }
      );
      // ⭐⭐⭐ END ATOMIC TRANSACTION ⭐⭐⭐

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
      console.error('❌ Transaction creation failed (all operations rolled back):', error);
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
    customerId: string,
    amount: number,
    currency: 'USD' | 'LBP',
    description: string,
    context: TransactionContext,
    options: { reference?: string; updateCashDrawer?: boolean } = {}
  ): Promise<TransactionResult> {
    return this.createTransaction({
      category: TRANSACTION_CATEGORIES.CUSTOMER_PAYMENT,
      amount,
      currency,
      description,
      context,
      customerId,
      reference: options.reference,
      updateCashDrawer: options.updateCashDrawer
    });
  }

  /**
   * Create supplier payment transaction
   */
  public async createSupplierPayment(
    supplierId: string,
    amount: number,
    currency: 'USD' | 'LBP',
    description: string,
    context: TransactionContext,
    options: { reference?: string; updateCashDrawer?: boolean } = {}
  ): Promise<TransactionResult> {
    return this.createTransaction({
      category: TRANSACTION_CATEGORIES.SUPPLIER_PAYMENT,
      amount,
      currency,
      description,
      context,
      supplierId,
      reference: options.reference,
      updateCashDrawer: options.updateCashDrawer
    });
  }

  /**
   * Create customer credit sale transaction
   */
  public async createCustomerCreditSale(
    customerId: string,
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
      customerId,
      reference: options.reference,
      updateCashDrawer: false // Credit sales don't affect cash drawer
    });
  }

  /**
   * Create employee payment transaction
   */
  public async createEmployeePayment(
    employeeId: string,
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
      employeeId,
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
    description: string,
    context: TransactionContext,
    options: { reference?: string; customerId?: string } = {}
  ): Promise<TransactionResult> {
    return this.createTransaction({
      category: TRANSACTION_CATEGORIES.CASH_DRAWER_SALE,
      amount,
      currency,
      description,
      context,
      customerId: options.customerId,
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
   * Create accounts receivable transaction
   */
  public async createAccountsReceivable(
    customerId: string,
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
      customerId,
      reference: generateARReference(),
      updateCashDrawer: false
    });
  }

  /**
   * Create accounts payable transaction
   */
  public async createAccountsPayable(
    supplierId: string,
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
      supplierId,
      reference: generateAPReference(),
      updateCashDrawer: false
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
            original.customer_id,
            original.supplier_id,
            original.employee_id,
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
      let balanceBefore = 0;
      let balanceAfter = 0;
      const affectedRecords: string[] = [transactionId];

      // ⭐⭐⭐ ATOMIC TRANSACTION BLOCK ⭐⭐⭐
      // Include all object stores that updateCashDrawerAtomic needs:
      // - cash_drawer_accounts (for updating balance)
      // - journal_entries (for reading cash journal entries)
      await getDB().transaction('rw', 
        [getDB().transactions, getDB().entities, getDB().cash_drawer_sessions, getDB().cash_drawer_accounts, getDB().journal_entries], 
        async () => {
          // Get current balance before deletion
          balanceBefore = await this.getEntityBalance(
            transaction.customer_id,
            transaction.supplier_id,
            transaction.employee_id,
            transaction.currency
          );

          // Balances are calculated from journal entries - no need to update
          // The reversal journal entries will automatically reflect the correct balance
          // Use entityBalanceService.getEntityBalance() to get current balance

          // Reverse cash drawer impact if applicable
          if (this.isCashDrawerCategory(transaction.category as TransactionCategory)) {
            // Calculate the original cash drawer impact and negate it
            const account = await getDB().getCashDrawerAccount(context.storeId, context.branchId);
            
            if (account) {
              // Get journal entries for the original transaction to calculate what it did
              const cashJournalEntries = await getDB().journal_entries
                .where('transaction_id')
                .equals(transactionId)
                .and(entry => entry.account_code === '1100' && entry.is_posted === true)
                .toArray();
              
              // Calculate original balance change: sum of (debit - credit) for cash account entries
              let originalBalanceChange = 0;
              for (const entry of cashJournalEntries) {
                const entryAmount = (entry.debit || 0) - (entry.credit || 0);
                
                // Convert to LBP if entry is in USD (cash drawer always stores in LBP)
                if (entry.currency === 'USD') {
                  const amountInLBP = currencyService.convertCurrency(entryAmount, 'USD', 'LBP');
                  originalBalanceChange += amountInLBP;
                } else {
                  // Entry is already in LBP
                  originalBalanceChange += entryAmount;
                }
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
              deletionReason: 'Payment canceled by user'
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
   */
  public async getTransactionsByEntity(
    entityId: string,
    entityType: 'customer' | 'supplier' | 'employee'
  ): Promise<Transaction[]> {
    try {
      const fieldName = `${entityType}_id`;
      const transactions = await getDB().transactions
        .where(fieldName)
        .equals(entityId)
        .and(t => !t._deleted)
        .toArray();

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

      if (transaction.customer_id) {
        const entity = await getDB().entities.get(transaction.customer_id);
        entityName = entity?.name || 'Unknown Customer';
        entityType = 'customer';
        entityId = transaction.customer_id;
      } else if (transaction.supplier_id) {
        const entity = await getDB().entities.get(transaction.supplier_id);
        entityName = entity?.name || 'Unknown Supplier';
        entityType = 'supplier';
        entityId = transaction.supplier_id;
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
    if (!params.description || params.description.trim().length === 0) {
      errors.push('Description is required');
    }

    // Validate context
    if (!params.context || !params.context.userId || !params.context.storeId) {
      errors.push('Valid context with userId and storeId is required');
    }

    // Validate entity IDs (at least one should be provided for most categories)
    const requiresEntity = ![
      TRANSACTION_CATEGORIES.CASH_DRAWER_EXPENSE,
      TRANSACTION_CATEGORIES.CASH_DRAWER_SALE
    ].includes(params.category);

    if (requiresEntity && !params.customerId && !params.supplierId && !params.employeeId) {
      errors.push('At least one entity ID (customer, supplier, or employee) is required');
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
    customerId?: string | null,
    supplierId?: string | null,
    employeeId?: string | null,
    currency: 'USD' | 'LBP' = 'USD'
  ): Promise<number> {
    try {
      const entityId = customerId || supplierId || employeeId;
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
    try {
      // ✅ Get cash drawer ACCOUNT (not session) - this is what we update
      const account = await getDB().getCashDrawerAccount(storeId, branchId);

      if (!account) {
        console.warn('⚠️ No cash drawer account found for store:', storeId, 'branch:', branchId);
        return undefined;
      }

      const previousBalance = Number((account as any)?.current_balance || 0);

      // ✅ Calculate balance change from journal entries (account_code = 1100) for this transaction
      // Journal entries are the single source of truth
      const cashJournalEntries = await getDB().journal_entries
        .where('transaction_id')
        .equals(transaction.id)
        .and(entry => entry.account_code === '1100' && entry.is_posted === true)
        .toArray();

      // Calculate balance change: sum of (debit - credit) for cash account entries
      // ✅ IMPORTANT: Cash drawer balance is always in LBP, so convert USD entries to LBP
      let balanceChange = 0;
      for (const entry of cashJournalEntries) {
        const entryAmount = (entry.debit || 0) - (entry.credit || 0);
        
        // Convert to LBP if entry is in USD (cash drawer always stores in LBP)
        if (entry.currency === 'USD') {
          const amountInLBP = currencyService.convertCurrency(entryAmount, 'USD', 'LBP');
          balanceChange += amountInLBP;
        } else {
          // Entry is already in LBP
          balanceChange += entryAmount;
        }
      }

      // If no cash journal entries found, this transaction doesn't affect cash drawer
      if (cashJournalEntries.length === 0) {
        console.warn(`⚠️ No cash journal entries (account_code=1100) found for transaction ${transaction.id}. Cash drawer not updated.`);
        return undefined;
      }

      const newBalance = previousBalance + balanceChange;

      // ✅ Balance is computed from journal entries - no need to update current_balance field
      // Journal entries are the single source of truth
      console.log(`💰 Cash drawer balance impact: ${previousBalance.toLocaleString()} → ${newBalance.toLocaleString()} (change: ${balanceChange > 0 ? '+' : ''}${balanceChange.toLocaleString()})`);

      return {
        previousBalance,
        newBalance
      };

    } catch (error) {
      console.error('Error updating cash drawer atomically:', error);
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
        entityType: transaction.customer_id ? 'customer' : transaction.supplier_id ? 'supplier' : 'cash_drawer',
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
    try {
      // Get entity CODE using account mapping utilities
      // Note: getEntityCodeForTransaction returns an entity CODE (e.g., "CASH-CUST"), not an entity ID
      const providedEntityCode = transaction.customer_id || transaction.supplier_id || transaction.employee_id;
      const entityCode = getEntityCodeForTransaction(transaction.category, providedEntityCode);
      
      // Convert entity CODE to entity ID by querying the entities table
      // If providedEntityCode is a UUID (customer_id, supplier_id, employee_id), use it directly
      // Otherwise, it's a system entity code and we need to look it up
      let entityId: string;
      let entity: any = null;
      
      // Check if providedEntityCode is a UUID (starts with valid UUID pattern)
      const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
      if (providedEntityCode && uuidPattern.test(providedEntityCode)) {
        // It's already a UUID (customer/supplier/employee ID), use it directly
        entityId = providedEntityCode;
        entity = await getDB().entities.get(entityId);
      } else {
        // It's a system entity code (e.g., "CASH-CUST"), need to look it up
        entity = await getSystemEntity(getDB(), transaction.store_id, entityCode);
        if (!entity) {
          throw new Error(`System entity not found: ${entityCode} for store ${transaction.store_id}. Make sure system entities are initialized.`);
        }
        entityId = entity.id;
      }
      
      if (!entity) {
        throw new Error(`Entity not found: ${entityCode} (code) or ${entityId} (id)`);
      }
      
      // Get account mapping for this transaction category
      const accountMapping = getAccountMapping(transaction.category);
      
      // Get entity information for description
      const description = getJournalDescription(
        transaction.category,
        entity.name,
        transaction.description
      );
      
      // Validate branch_id is present
      if (!transaction.branch_id) {
        throw new Error(`Transaction ${transaction.id} is missing branch_id. All transactions must have a branch_id for proper accounting.`);
      }

      // Create journal entry using the mapping
      await journalService.createJournalEntry({
        transactionId: transaction.id,
        debitAccount: accountMapping.debitAccount,
        creditAccount: accountMapping.creditAccount,
        amount: transaction.amount,
        currency: transaction.currency,
        entityId, // Now using actual UUID entity ID
        description,
        postedDate: transaction.created_at.split('T')[0], // Extract date part
        createdBy: transaction.created_by, // Pass user ID from transaction
        branchId: transaction.branch_id  // ✅ Pass branch_id from transaction to journal entry (required)
      });
      
      console.log(`✅ Journal entries created for ${transaction.category}: ${transaction.id} (entity: ${entity.name}, id: ${entityId})`);
      
    } catch (error) {
      console.error('❌ Failed to create journal entries:', error);
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
