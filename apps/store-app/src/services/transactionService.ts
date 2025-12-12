/**
 * UNIFIED TRANSACTION SERVICE
 * Single Source of Truth for ALL transaction creation, modification, and management
 * 
 * ALL transaction operations MUST go through this service - NO EXCEPTIONS
 */

import { db } from '../lib/db';
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
      const timestamp = new Date().toISOString();
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
        created_at: timestamp,
        created_by: params.context.userId,
        _synced: params._synced ?? false,
        _deleted: false,
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
      await db.transaction('rw', 
        [db.transactions, db.cash_drawer_sessions, db.journal_entries, db.entities, db.chart_of_accounts], 
        async () => {
          // 5. CREATE TRANSACTION RECORD
          await db.transactions.add(transaction);

          // 6. CREATE JOURNAL ENTRIES (MANDATORY - ACCOUNTING RULE)
          // ✅ Journal entries are the source of truth for financial data
          // If journal entries fail, the entire transaction must be rolled back
          await this.createJournalEntriesForTransaction(transaction);

          // 7. UPDATE ENTITY BALANCES (if enabled)
          if (params.updateBalances !== false) {
            const balanceResult = await this.updateEntityBalancesAtomic(
              transaction,
              amountInUSD
            );
            balanceAfter = balanceResult.newBalance;
            affectedRecords.push(...balanceResult.affectedRecords);
          }

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
      const original = await db.transactions.get(transactionId);
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
      await db.transaction('rw', 
        [db.transactions, db.entities, db.cash_drawer_sessions], 
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
            
            await this.updateEntityBalancesAtomic(reversalTransaction, 0);
            
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
            
            const balanceResult = await this.updateEntityBalancesAtomic(newTransaction, 0);
            balanceAfter = balanceResult.newBalance;
            affectedRecords.push(...balanceResult.affectedRecords);
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

          await db.transactions.update(transactionId, updateData);
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
      const transaction = await db.transactions.get(transactionId);
      if (!transaction) {
        return {
          success: false,
          error: 'Transaction not found',
          balanceBefore: 0,
          balanceAfter: 0,
          affectedRecords: []
        };
      }

      if (transaction._deleted) {
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
      await db.transaction('rw', 
        [db.transactions, db.entities, db.cash_drawer_sessions], 
        async () => {
          // Get current balance before deletion
          balanceBefore = await this.getEntityBalance(
            transaction.customer_id,
            transaction.supplier_id,
            transaction.employee_id,
            transaction.currency
          );

          // Reverse the transaction's balance impact
          const reversalTransaction: Transaction = {
            ...transaction,
            type: transaction.type === 'income' ? 'expense' : 'income', // Reverse type
            amount: transaction.amount, // Keep original amount
            category: transaction.category as TransactionCategory,
            description: typeof transaction.description === 'string' ? transaction.description : JSON.stringify(transaction.description)
          };
          
          const balanceResult = await this.updateEntityBalancesAtomic(reversalTransaction, 0);
          balanceAfter = balanceResult.newBalance;
          affectedRecords.push(...balanceResult.affectedRecords);

          // Reverse cash drawer impact if applicable
          if (this.isCashDrawerCategory(transaction.category as TransactionCategory)) {
            const reversalForCash: Transaction = {
              ...transaction,
              type: transaction.type === 'income' ? 'expense' : 'income', // Reverse for cash drawer too
              category: transaction.category as TransactionCategory,
              description: typeof transaction.description === 'string' ? transaction.description : JSON.stringify(transaction.description)
            };
            await this.updateCashDrawerAtomic(reversalForCash, context.storeId, context.branchId);
          }

          // Soft delete the transaction
          await db.transactions.update(transactionId, {
            _deleted: true,
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
      const transaction = await db.transactions.get(transactionId);
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
      let transactions = await db.transactions
        .where('store_id')
        .equals(storeId)
        .toArray();

      // Filter deleted
      if (!options.includeDeleted) {
        transactions = transactions.filter(t => !t._deleted);
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
      const transactions = await db.transactions
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
      const transaction = await db.transactions.get(transactionId);
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
        const entity = await db.entities.get(transaction.customer_id);
        entityName = entity?.name || 'Unknown Customer';
        entityType = 'customer';
        entityId = transaction.customer_id;
      } else if (transaction.supplier_id) {
        const entity = await db.entities.get(transaction.supplier_id);
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
   * Get current entity balance
   * Can be called within or outside transactions (read-only operation)
   * Updated to use entities table instead of legacy customers/suppliers tables
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

      // Get entity from unified entities table
      const entity = await db.entities.get(entityId);
      if (!entity) {
        return 0;
      }

      return currency === 'USD' ? (entity.usd_balance || 0) : (entity.lb_balance || 0);
    } catch (error) {
      console.error('Error getting entity balance:', error);
      return 0;
    }
  }

  /**
   * Update entity balances atomically within IndexedDB transaction
   * This method MUST be called within a db.transaction() block
   * Updated to use entities table instead of legacy customers/suppliers tables
   */
  private async updateEntityBalancesAtomic(
    transaction: Transaction,
    amountInUSD: number
  ): Promise<{ newBalance: number; affectedRecords: string[] }> {
    const affectedRecords: string[] = [];
    let newBalance = 0;
    const timestamp = new Date().toISOString();

    // Get entity ID (customer, supplier, or employee)
    const entityId = transaction.customer_id || transaction.supplier_id || (transaction as any).employee_id;
    
    if (entityId) {
      // Get entity from unified entities table
      const entity = await db.entities.get(entityId);
      if (entity) {
        const isUSD = transaction.currency === 'USD';
        const previousBalance = isUSD ? (entity.usd_balance || 0) : (entity.lb_balance || 0);
        
        // Calculate balance change based on category (not just type)
        // This handles AR/AP transactions correctly
        let balanceChange = 0;
        
        if (entity.entity_type === 'customer') {
          // Customer balance logic:
          // - Credit sales INCREASE AR (they owe us more) = positive balance
          // - Payments DECREASE AR (they owe us less) = negative balance
          if (transaction.category === TRANSACTION_CATEGORIES.CUSTOMER_CREDIT_SALE) {
            balanceChange = transaction.amount; // Increase AR
          } else if (transaction.category === TRANSACTION_CATEGORIES.CUSTOMER_PAYMENT || 
                     transaction.category === TRANSACTION_CATEGORIES.CUSTOMER_PAYMENT_RECEIVED) {
            balanceChange = -transaction.amount; // Decrease AR
          } else if (transaction.category === TRANSACTION_CATEGORIES.CUSTOMER_REFUND) {
            balanceChange = transaction.amount; // Increase AR (we owe them or they owe us more)
          } else {
            // Fallback: income reduces AR, expense increases AR
            balanceChange = transaction.type === 'income' ? -transaction.amount : transaction.amount;
          }
        } else if (entity.entity_type === 'supplier') {
          // Supplier balance logic:
          // - Credit purchases INCREASE AP (we owe them more) = positive balance
          // - Payments DECREASE AP (we owe them less) = negative balance
          if (transaction.category === TRANSACTION_CATEGORIES.SUPPLIER_CREDIT_SALE) {
            balanceChange = transaction.amount; // Increase AP
          } else if (transaction.category === TRANSACTION_CATEGORIES.SUPPLIER_PAYMENT) {
            balanceChange = -transaction.amount; // Decrease AP
          } else if (transaction.category === TRANSACTION_CATEGORIES.SUPPLIER_REFUND) {
            balanceChange = transaction.amount; // Increase AP (we owe them more)
          } else {
            // Fallback: expense reduces AP, income increases AP
            balanceChange = transaction.type === 'expense' ? -transaction.amount : transaction.amount;
          }
        } else if (entity.entity_type === 'employee') {
          // For employee: payments increase what we owe, receipts decrease it
          balanceChange = transaction.type === 'expense' ? transaction.amount : -transaction.amount;
        }
        
        newBalance = previousBalance + balanceChange;

        const updateData: any = {
          updated_at: timestamp,
          _synced: false
        };
        
        if (isUSD) {
          updateData.usd_balance = newBalance;
        } else {
          updateData.lb_balance = newBalance;
        }

        // Update unified entities table
        await db.entities.update(entityId, updateData);
        affectedRecords.push(entityId);
      }
    }

    return { newBalance, affectedRecords };
  }

  /**
   * Update entity balances (legacy method - delegates to atomic version)
   * @deprecated Use updateEntityBalancesAtomic within a transaction instead
   * @internal This method is kept for backward compatibility only
   */
  private async updateEntityBalances(
    transaction: Transaction,
    amountInUSD: number,
    context: TransactionContext
  ): Promise<{ newBalance: number; affectedRecords: string[] }> {
    console.warn('⚠️ updateEntityBalances is deprecated. Use atomic transactions instead.');
    
    // For backward compatibility, wrap in transaction
    let result = { newBalance: 0, affectedRecords: [] as string[] };
    
    await db.transaction('rw', [db.entities], async () => {
      result = await this.updateEntityBalancesAtomic(transaction, amountInUSD);
    });
    
    return result;
  }

  /**
   * Update cash drawer atomically within IndexedDB transaction
   * This method MUST be called within a db.transaction() block
   */
  private async updateCashDrawerAtomic(
    transaction: Transaction,
    storeId: string,
    branchId: string
  ): Promise<{ previousBalance: number; newBalance: number } | undefined> {
    try {
      // Get active cash drawer session
      const activeSession = await db.cash_drawer_sessions
        .where(['store_id', 'branch_id'])
        .equals([storeId, branchId])
        .and(session => session.closed_at === null)
        .first();

      if (!activeSession) {
        console.warn('⚠️ No active cash drawer session found for store:', storeId);
        return undefined;
      }

      const previousBalance = (activeSession).actual_amount || 0;
      
      // Calculate balance change based on transaction type
      let balanceChange = 0;
      if (transaction.type === 'income') {
        // Income increases cash drawer
        balanceChange = transaction.amount;
      } else if (transaction.type === 'expense') {
        // Expense decreases cash drawer
        balanceChange = -transaction.amount;
      }

      const newBalance = previousBalance + balanceChange;
      const timestamp = new Date().toISOString();

      // Update cash drawer session
      await db.cash_drawer_sessions.update(activeSession.id, {
        actual_amount: newBalance,
        updated_at: timestamp,
        _synced: false
      } as any);

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
      
      await db.transaction('rw', [db.cash_drawer_sessions], async () => {
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
        entity = await db.entities.get(entityId);
      } else {
        // It's a system entity code (e.g., "CASH-CUST"), need to look it up
        entity = await getSystemEntity(db, transaction.store_id, entityCode);
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
        createdBy: transaction.created_by // Pass user ID from transaction
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
