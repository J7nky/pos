/**
 * UNIFIED TRANSACTION SERVICE
 * Single Source of Truth for ALL transaction creation, modification, and management
 * 
 * ALL transaction operations MUST go through this service - NO EXCEPTIONS
 */

import { db } from '../lib/db';
import { currencyService } from './currencyService';
import { auditLogService } from './auditLogService';
import { 
  TRANSACTION_CATEGORIES, 
  TransactionCategory, 
  TransactionType,
  getTransactionType,
  isValidTransactionCategory 
} from '../constants/transactionCategories';
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
   */
  public async createTransaction(params: CreateTransactionParams): Promise<TransactionResult> {
    try {
      // 1. VALIDATION
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

      // 2. PREPARE TRANSACTION DATA
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

      // 3. GET BALANCE BEFORE
      const balanceBefore = await this.getEntityBalance(
        params.customerId,
        params.supplierId,
        params.employeeId,
        params.currency
      );

      // 4. CREATE TRANSACTION RECORD
      const transaction: Transaction = {
        id: transactionId,
        store_id: params.context.storeId,
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

      // 5. SAVE TO DATABASE
      await db.transactions.add(transaction);

      // 6. UPDATE BALANCES (if enabled)
      let balanceAfter = balanceBefore;
      const affectedRecords: string[] = [transactionId];

      if (params.updateBalances !== false) {
        const balanceResult = await this.updateEntityBalances(
          transaction,
          amountInUSD,
          params.context
        );
        balanceAfter = balanceResult.newBalance;
        affectedRecords.push(...balanceResult.affectedRecords);
      }

      // 7. UPDATE CASH DRAWER (if enabled and applicable)
      let cashDrawerImpact;
      if (params.updateCashDrawer !== false && this.isCashDrawerCategory(params.category)) {
        cashDrawerImpact = await this.updateCashDrawerForTransaction(
          transaction,
          params.context
        );
      }

      // 8. CREATE AUDIT LOG (if enabled)
      let auditLogId;
      if (params.createAuditLog !== false) {
        auditLogId = await this.createAuditLog(
          transaction,
          balanceBefore,
          balanceAfter,
          params.context,
          correlationId
        );
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
      console.error('❌ Transaction creation failed:', error);
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
   * Update an existing transaction
   */
  public async updateTransaction(
    transactionId: string,
    updates: Partial<CreateTransactionParams>,
    context: TransactionContext
  ): Promise<TransactionResult> {
    try {
      // Get original transaction
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

      // For now, we'll mark as not synced and update fields
      // Full reversal logic can be added later if needed
      await db.transactions.update(transactionId, {
        ...updates,
        updated_at: new Date().toISOString(),
        _synced: false
      });

      return {
        success: true,
        transactionId,
        balanceBefore: 0,
        balanceAfter: 0,
        affectedRecords: [transactionId]
      };

    } catch (error) {
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
   * Delete (soft delete) a transaction
   */
  public async deleteTransaction(
    transactionId: string,
    context: TransactionContext
  ): Promise<TransactionResult> {
    try {
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

      // Soft delete
      await db.transactions.update(transactionId, {
        _deleted: true,
        updated_at: new Date().toISOString(),
        _synced: false
      });

      // Log deletion
      auditLogService.log({
        action: 'transaction_deleted',
        entityType: 'transaction',
        entityId: transactionId,
        description: `Transaction deleted: ${transaction.description}`,
        userId: context.userId,
        userEmail: context.userEmail,
        severity: 'high',
        tags: ['transaction', 'delete']
      });

      return {
        success: true,
        transactionId,
        balanceBefore: 0,
        balanceAfter: 0,
        affectedRecords: [transactionId]
      };

    } catch (error) {
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
   */
  private async getEntityBalance(
    customerId?: string | null,
    supplierId?: string | null,
    employeeId?: string | null,
    currency: 'USD' | 'LBP' = 'USD'
  ): Promise<number> {
    try {
      if (customerId) {
        const customer = await db.customers.get(customerId);
        return currency === 'USD' ? (customer?.usd_balance || 0) : (customer?.lb_balance || 0);
      }
      
      if (supplierId) {
        const supplier = await db.suppliers.get(supplierId);
        return currency === 'USD' ? (supplier?.usd_balance || 0) : (supplier?.lb_balance || 0);
      }
      
      // Employee balances not yet implemented
      return 0;
    } catch (error) {
      console.error('Error getting entity balance:', error);
      return 0;
    }
  }

  /**
   * Update entity balances based on transaction
   */
  private async updateEntityBalances(
    transaction: Transaction,
    amountInUSD: number,
    context: TransactionContext
  ): Promise<{ newBalance: number; affectedRecords: string[] }> {
    const affectedRecords: string[] = [];
    let newBalance = 0;

    try {
      // Update customer balance
      if (transaction.customer_id) {
        const customer = await db.customers.get(transaction.customer_id);
        if (customer) {
          const isUSD = transaction.currency === 'USD';
          const previousBalance = isUSD ? (customer.usd_balance || 0) : (customer.lb_balance || 0);
          
          // For customer: income reduces debt, expense increases it
          const balanceChange = transaction.type === 'income' ? -transaction.amount : transaction.amount;
          newBalance = previousBalance + balanceChange;

          const updateData: any = {
            updated_at: new Date().toISOString(),
            _synced: false
          };
          
          if (isUSD) {
            updateData.usd_balance = newBalance;
          } else {
            updateData.lb_balance = newBalance;
          }

          await db.customers.update(transaction.customer_id, updateData);
          affectedRecords.push(transaction.customer_id);
        }
      }

      // Update supplier balance
      if (transaction.supplier_id) {
        const supplier = await db.suppliers.get(transaction.supplier_id);
        if (supplier) {
          const isUSD = transaction.currency === 'USD';
          const previousBalance = isUSD ? (supplier.usd_balance || 0) : (supplier.lb_balance || 0);
          
          // For supplier: expense reduces what we owe, income increases it
          const balanceChange = transaction.type === 'expense' ? -transaction.amount : transaction.amount;
          newBalance = previousBalance + balanceChange;

          const updateData: any = {
            updated_at: new Date().toISOString(),
            _synced: false
          };
          
          if (isUSD) {
            updateData.usd_balance = newBalance;
          } else {
            updateData.lb_balance = newBalance;
          }

          await db.suppliers.update(transaction.supplier_id, updateData);
          affectedRecords.push(transaction.supplier_id);
        }
      }

      return { newBalance, affectedRecords };

    } catch (error) {
      console.error('Error updating entity balances:', error);
      return { newBalance: 0, affectedRecords };
    }
  }

  /**
   * Update cash drawer for transaction
   */
  private async updateCashDrawerForTransaction(
    transaction: Transaction,
    context: TransactionContext
  ): Promise<{ previousBalance: number; newBalance: number } | undefined> {
    try {
      // Import dynamically to avoid circular dependencies
      const { cashDrawerUpdateService } = await import('./cashDrawerUpdateService');
      
      const result = await cashDrawerUpdateService.updateCashDrawerForTransaction({
        type: transaction.type === 'income' ? 'payment' : 'expense',
        amount: transaction.amount,
        currency: transaction.currency,
        description: transaction.description,
        reference: transaction.reference || '',
        storeId: transaction.store_id,
        createdBy: transaction.created_by,
        customerId: transaction.customer_id || undefined,
        supplierId: transaction.supplier_id || undefined
      });

      if (result.success) {
        return {
          previousBalance: result.previousBalance,
          newBalance: result.newBalance
        };
      }
    } catch (error) {
      console.error('Error updating cash drawer:', error);
    }
    return undefined;
  }

  /**
   * Create audit log for transaction
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
   * Check if category affects cash drawer
   */
  private isCashDrawerCategory(category: TransactionCategory): boolean {
    const cashDrawerCategories: readonly TransactionCategory[] = [
      TRANSACTION_CATEGORIES.CASH_DRAWER_SALE,
      TRANSACTION_CATEGORIES.CASH_DRAWER_PAYMENT,
      TRANSACTION_CATEGORIES.CASH_DRAWER_REFUND,
      TRANSACTION_CATEGORIES.CASH_DRAWER_EXPENSE,
      TRANSACTION_CATEGORIES.CUSTOMER_PAYMENT,
      TRANSACTION_CATEGORIES.SUPPLIER_PAYMENT
    ];
    return cashDrawerCategories.includes(category);
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
    return `txn-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  }

  /**
   * Generate correlation ID for grouped transactions
   */
  private generateCorrelationId(): string {
    return `corr-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  }
}

// Export singleton instance
export const transactionService = TransactionService.getInstance();
