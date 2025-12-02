import { db } from '../lib/db';
import { Transaction } from '../types';
import { accountBalanceService } from './accountBalanceService';

export interface TransactionValidationResult {
  isValid: boolean;
  errors: string[];
  warnings: string[];
}

export interface TransactionValidationOptions {
  allowUpdates?: boolean;
  allowDeletes?: boolean;
  enforceImmutability?: boolean;
  validateBalance?: boolean;
}

/**
 * Transaction Validation Service
 * Enforces immutability and accounting best practices for transactions
 * 
 * Note: Simplified from singleton pattern - this service is stateless
 */
export class TransactionValidationService {

  /**
   * Validate transaction before creation
   */
  public async validateTransactionCreation(
    transaction: Omit<Transaction, 'id' | 'created_at' | '_synced'>,
    options: TransactionValidationOptions = {}
  ): Promise<TransactionValidationResult> {
    const result: TransactionValidationResult = {
      isValid: true,
      errors: [],
      warnings: []
    };

    // Basic validation
    if (!transaction.store_id) {
      result.errors.push('Store ID is required');
    }

    if (!transaction.type || !['income', 'expense'].includes(transaction.type)) {
      result.errors.push('Transaction type must be "income" or "expense"');
    }

    if (!transaction.category) {
      result.errors.push('Transaction category is required');
    }

    if (!transaction.amount || transaction.amount <= 0) {
      result.errors.push('Transaction amount must be greater than 0');
    }

    if (!transaction.currency || !['USD', 'LBP'].includes(transaction.currency)) {
      result.errors.push('Currency must be "USD" or "LBP"');
    }

    if (!transaction.description) {
      result.errors.push('Transaction description is required');
    }

    if (!transaction.created_by) {
      result.errors.push('Created by user ID is required');
    }

    // Validate customer/supplier references
    if (transaction.customer_id && transaction.supplier_id) {
      result.errors.push('Transaction cannot reference both customer and supplier');
    }

    if (transaction.customer_id) {
      const customer = await db.customers.get(transaction.customer_id);
      if (!customer) {
        result.errors.push(`Customer not found: ${transaction.customer_id}`);
      }
    }

    if (transaction.supplier_id) {
      const supplier = await db.suppliers.get(transaction.supplier_id);
      if (!supplier) {
        result.errors.push(`Supplier not found: ${transaction.supplier_id}`);
      }
    }

    // Check for duplicate transactions (same amount, date, entity within 1 minute)
    if (transaction.customer_id || transaction.supplier_id) {
      const duplicates = await this.findPotentialDuplicates(transaction);
      if (duplicates.length > 0) {
        result.warnings.push(`Potential duplicate transaction detected. ${duplicates.length} similar transactions found in the last minute.`);
      }
    }

    result.isValid = result.errors.length === 0;
    return result;
  }

  /**
   * Validate transaction update attempt - enforces immutability
   */
  public async validateTransactionUpdate(
    transactionId: string,
    updates: Partial<Transaction>,
    options: TransactionValidationOptions = {}
  ): Promise<TransactionValidationResult> {
    const result: TransactionValidationResult = {
      isValid: false,
      errors: [],
      warnings: []
    };

    // Get existing transaction
    const existingTransaction = await db.transactions.get(transactionId);
    if (!existingTransaction) {
      result.errors.push(`Transaction not found: ${transactionId}`);
      return result;
    }

    // Enforce immutability by default
    if (options.enforceImmutability !== false) {
      // Only allow specific fields to be updated
      const allowedUpdates = ['_synced', '_lastSyncedAt', 'reference'];
      const attemptedUpdates = Object.keys(updates).filter(key => !allowedUpdates.includes(key));
      
      if (attemptedUpdates.length > 0) {
        result.errors.push(
          `Transaction updates not allowed for immutability. Attempted to update: ${attemptedUpdates.join(', ')}. ` +
          'To correct mistakes, create a reversal transaction instead.'
        );
      }

      // Warn about sync-related updates
      if (updates._synced !== undefined || updates._lastSyncedAt !== undefined) {
        result.warnings.push('Updating sync metadata. Ensure this is part of a sync operation.');
      }
    } else if (options.allowUpdates) {
      // If updates are explicitly allowed, validate the changes
      if (updates.amount !== undefined && updates.amount <= 0) {
        result.errors.push('Transaction amount must be greater than 0');
      }

      if (updates.type !== undefined && !['income', 'expense'].includes(updates.type)) {
        result.errors.push('Transaction type must be "income" or "expense"');
      }

      if (updates.currency !== undefined && !['USD', 'LBP'].includes(updates.currency)) {
        result.errors.push('Currency must be "USD" or "LBP"');
      }

      // If critical fields are being changed, require balance recalculation
      const criticalFields = ['amount', 'type', 'currency', 'customer_id', 'supplier_id'];
      const criticalChanges = Object.keys(updates).some(key => criticalFields.includes(key));
      
      if (criticalChanges) {
        result.warnings.push('Critical transaction fields are being updated. Balance recalculation will be required.');
      }
    }

    result.isValid = result.errors.length === 0;
    return result;
  }

  /**
   * Validate transaction deletion attempt - enforces immutability
   */
  public async validateTransactionDeletion(
    transactionId: string,
    options: TransactionValidationOptions = {}
  ): Promise<TransactionValidationResult> {
    const result: TransactionValidationResult = {
      isValid: false,
      errors: [],
      warnings: []
    };

    // Get existing transaction
    const existingTransaction = await db.transactions.get(transactionId);
    if (!existingTransaction) {
      result.errors.push(`Transaction not found: ${transactionId}`);
      return result;
    }

    // Enforce immutability by default
    if (options.enforceImmutability !== false) {
      result.errors.push(
        'Transaction deletion not allowed for immutability and audit trail preservation. ' +
        'To correct mistakes, create a reversal transaction instead.'
      );
    } else if (options.allowDeletes) {
      // If deletes are explicitly allowed, warn about consequences
      result.warnings.push('Deleting transaction will break audit trail. Consider creating a reversal instead.');
      
      // Check if transaction affects account balances
      if (existingTransaction.customer_id || existingTransaction.supplier_id) {
        result.warnings.push('Deleting this transaction will affect account balances. Balance recalculation will be required.');
      }
    }

    result.isValid = result.errors.length === 0;
    return result;
  }

  /**
   * Find potential duplicate transactions
   */
  private async findPotentialDuplicates(
    transaction: Omit<Transaction, 'id' | 'created_at' | '_synced'>
  ): Promise<Transaction[]> {
    const oneMinuteAgo = new Date(Date.now() - 60000).toISOString();
    
    const query = db.transactions
      .where('store_id')
      .equals(transaction.store_id)
      .and(t => {
        const matchesCustomer = transaction.customer_id ? t.customer_id === transaction.customer_id : false;
        const matchesSupplier = transaction.supplier_id ? t.supplier_id === transaction.supplier_id : false;

        return (
          t.amount === transaction.amount &&
          t.type === transaction.type &&
          t.currency === transaction.currency &&
          t.created_at >= oneMinuteAgo &&
          (matchesCustomer || matchesSupplier)
        );
      });

    return await query.toArray();
  }

  /**
   * Create a safe reversal transaction
   */
  public async createReversalTransaction(
    originalTransactionId: string,
    reason: string,
    createdBy: string,
    options: { validateOriginal?: boolean } = {}
  ): Promise<{ reversalTransaction: Transaction; validationResult: TransactionValidationResult }> {
    // Validate the original transaction exists
    const validationResult = await this.validateTransactionDeletion(originalTransactionId, {
      enforceImmutability: true
    });

    if (options.validateOriginal && !validationResult.isValid) {
      throw new Error(`Cannot create reversal: ${validationResult.errors.join(', ')}`);
    }

    // Use the account balance service to create the reversal
    const reversalTransaction = await accountBalanceService.createReversalTransaction(
      originalTransactionId,
      reason,
      createdBy
    );

    return {
      reversalTransaction,
      validationResult: {
        isValid: true,
        errors: [],
        warnings: [`Created reversal transaction for ${originalTransactionId}`]
      }
    };
  }

  /**
   * Hook for database operations - call this before any transaction modifications
   */
  public async validateDatabaseOperation(
    operation: 'create' | 'update' | 'delete',
    transactionId?: string,
    transactionData?: Partial<Transaction>,
    options: TransactionValidationOptions = {}
  ): Promise<TransactionValidationResult> {
    switch (operation) {
      case 'create':
        if (!transactionData) {
          return {
            isValid: false,
            errors: ['Transaction data is required for creation'],
            warnings: []
          };
        }
        return await this.validateTransactionCreation(transactionData as Omit<Transaction, 'id' | 'created_at' | '_synced'>, options);

      case 'update':
        if (!transactionId || !transactionData) {
          return {
            isValid: false,
            errors: ['Transaction ID and update data are required for updates'],
            warnings: []
          };
        }
        return await this.validateTransactionUpdate(transactionId, transactionData, options);

      case 'delete':
        if (!transactionId) {
          return {
            isValid: false,
            errors: ['Transaction ID is required for deletion'],
            warnings: []
          };
        }
        return await this.validateTransactionDeletion(transactionId, options);

      default:
        return {
          isValid: false,
          errors: [`Unknown operation: ${operation}`],
          warnings: []
        };
    }
  }
}

// Export service instance (stateless service - no singleton needed)
export const transactionValidationService = new TransactionValidationService();
