import { db } from '../lib/db';
import { cashDrawerUpdateService } from './cashDrawerUpdateService';
import { enhancedTransactionService, TransactionContext } from './enhancedTransactionService';
import { currencyService } from './currencyService';
import { auditLogService } from './auditLogService';

export interface PaymentUpdateData {
  amount?: number;
  currency?: 'USD' | 'LBP';
  description?: string;
  reference?: string | null;
  customer_id?: string | null;
  supplier_id?: string | null;
  category?: string;
}

export interface PaymentManagementResult {
  success: boolean;
  error?: string;
  balanceUpdates?: {
    cashDrawer?: {
      previousBalance: number;
      newBalance: number;
    };
    entity?: {
      entityType: 'customer' | 'supplier';
      entityId: string;     
      previousBalance: number;
      newBalance: number;
    };
  };
}

export class PaymentManagementService {
  private static instance: PaymentManagementService;

  private constructor() {}

  public static getInstance(): PaymentManagementService {
    if (!PaymentManagementService.instance) {
      PaymentManagementService.instance = new PaymentManagementService();
    }
    return PaymentManagementService.instance;
  }

  /**
   * Update a payment transaction with proper balance adjustments
   */
  public async updatePayment(
    transactionId: string,
    updates: PaymentUpdateData,
    context: TransactionContext
  ): Promise<PaymentManagementResult> {
    try {
      // Get the original transaction
      const originalTransaction = await db.transactions.get(transactionId);
      if (!originalTransaction) {
        return { success: false, error: 'Transaction not found' };
      }

      // Calculate balance adjustments needed
      const amountChanged = updates.amount !== undefined && updates.amount !== originalTransaction.amount;
      const currencyChanged = updates.currency !== undefined && updates.currency !== originalTransaction.currency;
      const entityChanged = (updates.customer_id !== undefined && updates.customer_id !== originalTransaction.customer_id) ||
                           (updates.supplier_id !== undefined && updates.supplier_id !== originalTransaction.supplier_id);

      let balanceUpdates: PaymentManagementResult['balanceUpdates'] = {};

      // If amount, currency, or entity changed, we need to revert the original impact and apply the new one
      if (amountChanged || currencyChanged || entityChanged) {
        // Revert original transaction impact
        await this.revertTransactionImpact(originalTransaction, context);

        // Create updated transaction data
        const updatedTransaction = {
          ...originalTransaction,
          ...updates,
          updated_at: new Date().toISOString(),
          _synced: false
        };

        // Apply new transaction impact
        const newImpact = await this.applyTransactionImpact(updatedTransaction, context);
        balanceUpdates = newImpact.balanceUpdates;
      }

      // Update the transaction in the database
      await db.transactions.update(transactionId, {
        ...updates,
        updated_at: new Date().toISOString(),
        _synced: false
      });

      // Log the update
      auditLogService.log({
        action: 'payment_updated',
        entityType: 'transaction',
        entityId: transactionId,
        entityName: `Payment ${transactionId}`,
        description: `Payment updated: ${JSON.stringify(updates)}`,
        userId: context.userId,
        userEmail: context.userEmail,
        previousData: originalTransaction,
        newData: { ...originalTransaction, ...updates },
        changedFields: Object.keys(updates),
        severity: 'medium',
        tags: ['payment', 'update', 'balance_adjustment']
      });

      return {
        success: true,
        balanceUpdates
      };

    } catch (error) {
      console.error('Error updating payment:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error occurred'
      };
    }
  }

  /**
   * Delete a payment transaction with proper balance adjustments
   */
  public async deletePayment(
    transactionId: string,
    context: TransactionContext
  ): Promise<PaymentManagementResult> {
    try {
      // Get the transaction to delete
      const transaction = await db.transactions.get(transactionId);
      if (!transaction) {
        return { success: false, error: 'Transaction not found' };
      }

      // Revert the transaction's impact on balances
      const balanceUpdates = await this.revertTransactionImpact(transaction, context);

      // Mark transaction as deleted (soft delete for audit trail)
      await db.transactions.update(transactionId, {
        _deleted: true,
        updated_at: new Date().toISOString(),
        _synced: false
      });

      // Log the deletion
      auditLogService.log({
        action: 'payment_deleted',
        entityType: 'transaction',
        entityId: transactionId,
        entityName: `Payment ${transactionId}`,
        description: `Payment deleted: ${transaction.description} - ${currencyService.formatCurrency(transaction.amount, transaction.currency)}`,
        userId: context.userId,
        userEmail: context.userEmail,
        previousData: transaction,
        severity: 'high',
        tags: ['payment', 'delete', 'balance_adjustment']
      });

      return {
        success: true,
        balanceUpdates: balanceUpdates.balanceUpdates
      };

    } catch (error) {
      console.error('Error deleting payment:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error occurred'
      };
    }
  }

  /**
   * Apply transaction impact to cash drawer and entity balances
   */
  private async applyTransactionImpact(
    transaction: any,
    context: TransactionContext
  ): Promise<PaymentManagementResult> {
    let balanceUpdates: PaymentManagementResult['balanceUpdates'] = {};

    try {
      // Update cash drawer if it's a cash transaction
      if (this.isCashTransaction(transaction)) {
        const cashDrawerResult = await cashDrawerUpdateService.updateCashDrawerForTransaction({
          type: transaction.type === 'income' ? 'payment' : 'expense',
          amount: transaction.amount,
          currency: transaction.currency,
          description: transaction.description,
          reference: transaction.reference || `TXN-${transaction.id}`,
          storeId: transaction.store_id,
          createdBy: transaction.created_by,
          customerId: transaction.customer_id,
          supplierId: transaction.supplier_id
        });

        if (cashDrawerResult.success) {
          balanceUpdates.cashDrawer = {
            previousBalance: cashDrawerResult.previousBalance,
            newBalance: cashDrawerResult.newBalance
          };
        }
      }

      // Update entity balance (customer or supplier)
      if (transaction.customer_id) {
        const entityResult = await this.updateCustomerBalance(transaction, context);
        if (entityResult) {
          balanceUpdates.entity = entityResult;
        }
      } else if (transaction.supplier_id) {
        const entityResult = await this.updateSupplierBalance(transaction, context);
        if (entityResult) {
          balanceUpdates.entity = entityResult;
        }
      }

      return { success: true, balanceUpdates };

    } catch (error) {
      console.error('Error applying transaction impact:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to apply transaction impact'
      };
    }
  }

  /**
   * Revert transaction impact from cash drawer and entity balances
   */
  private async revertTransactionImpact(
    transaction: any,
    context: TransactionContext
  ): Promise<PaymentManagementResult> {
    let balanceUpdates: PaymentManagementResult['balanceUpdates'] = {};

    try {
      // Revert cash drawer impact
      if (this.isCashTransaction(transaction)) {
        // Create a reversal transaction
        const reversalResult = await cashDrawerUpdateService.updateCashDrawerForTransaction({
          type: transaction.type === 'income' ? 'expense' : 'payment', // Opposite type to revert
          amount: transaction.amount,
          currency: transaction.currency,
          description: `Reversal: ${transaction.description}`,
          reference: `REV-${transaction.id}`,
          storeId: transaction.store_id,
          createdBy: context.userId,
          customerId: transaction.customer_id,
          supplierId: transaction.supplier_id
        });

        if (reversalResult.success) {
          balanceUpdates.cashDrawer = {
            previousBalance: reversalResult.previousBalance,
            newBalance: reversalResult.newBalance
          };
        }
      }

      // Revert entity balance
      if (transaction.customer_id) {
        const entityResult = await this.revertCustomerBalance(transaction, context);
        if (entityResult) {
          balanceUpdates.entity = entityResult;
        }
      } else if (transaction.supplier_id) {
        const entityResult = await this.revertSupplierBalance(transaction, context);
        if (entityResult) {
          balanceUpdates.entity = entityResult;
        }
      }

      return { success: true, balanceUpdates };

    } catch (error) {
      console.error('Error reverting transaction impact:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to revert transaction impact'
      };
    }
  }

  /**
   * Update customer balance based on transaction
   */
  private async updateCustomerBalance(
    transaction: any,
    context: TransactionContext
  ): Promise<PaymentManagementResult['balanceUpdates']['entity'] | null> {
    try {
      const customer = await db.customers.get(transaction.customer_id);
      if (!customer) return null;

      const previousBalance = customer.usd_balance || 0;
      const amountInUSD = currencyService.convertCurrency(transaction.amount, transaction.currency, 'USD');
      
      // For customer payments: income reduces customer debt, expense increases it
      const balanceChange = transaction.type === 'income' ? -amountInUSD : amountInUSD;
      const newBalance = previousBalance + balanceChange;

      await db.customers.update(transaction.customer_id, {
        usd_balance: newBalance,
        updated_at: new Date().toISOString(),
        _synced: false
      });

      return {
        entityType: 'customer',
        entityId: transaction.customer_id,
        previousBalance,
        newBalance
      };

    } catch (error) {
      console.error('Error updating customer balance:', error);
      return null;
    }
  }

  /**
   * Update supplier balance based on transaction
   */
  private async updateSupplierBalance(
    transaction: any,
    context: TransactionContext
  ): Promise<PaymentManagementResult['balanceUpdates']['entity'] | null> {
    try {
      const supplier = await db.suppliers.get(transaction.supplier_id);
      if (!supplier) return null;

      const previousBalance = supplier.usd_balance || 0;
      const amountInUSD = currencyService.convertCurrency(transaction.amount, transaction.currency, 'USD');
      
      // For supplier payments: expense reduces what we owe them, income increases it
      const balanceChange = transaction.type === 'expense' ? -amountInUSD : amountInUSD;
      const newBalance = previousBalance + balanceChange;

      await db.suppliers.update(transaction.supplier_id, {
        usd_balance: newBalance,
        updated_at: new Date().toISOString(),
        _synced: false
      });

      return {
        entityType: 'supplier',
        entityId: transaction.supplier_id,
        previousBalance,
        newBalance
      };

    } catch (error) {
      console.error('Error updating supplier balance:', error);
      return null;
    }
  }

  /**
   * Revert customer balance changes
   */
  private async revertCustomerBalance(
    transaction: any,
    context: TransactionContext
  ): Promise<PaymentManagementResult['balanceUpdates']['entity'] | null> {
    try {
      const customer = await db.customers.get(transaction.customer_id);
      if (!customer) return null;

      const previousBalance = customer.usd_balance || 0;
      const amountInUSD = currencyService.convertCurrency(transaction.amount, transaction.currency, 'USD');
      
      // Reverse the original balance change
      const balanceChange = transaction.type === 'income' ? amountInUSD : -amountInUSD;
      const newBalance = previousBalance + balanceChange;

      await db.customers.update(transaction.customer_id, {
        usd_balance: newBalance,
        updated_at: new Date().toISOString(),
        _synced: false
      });

      return {
        entityType: 'customer',
        entityId: transaction.customer_id,
        previousBalance,
        newBalance
      };

    } catch (error) {
      console.error('Error reverting customer balance:', error);
      return null;
    }
  }

  /**
   * Revert supplier balance changes
   */
  private async revertSupplierBalance(
    transaction: any,
    context: TransactionContext
  ): Promise<PaymentManagementResult['balanceUpdates']['entity'] | null> {
    try {
      const supplier = await db.suppliers.get(transaction.supplier_id);
      if (!supplier) return null;

      const previousBalance = supplier.usd_balance || 0;
      const amountInUSD = currencyService.convertCurrency(transaction.amount, transaction.currency, 'USD');
      
      // Reverse the original balance change
      const balanceChange = transaction.type === 'expense' ? amountInUSD : -amountInUSD;
      const newBalance = previousBalance + balanceChange;

      await db.suppliers.update(transaction.supplier_id, {
        usd_balance: newBalance,
        updated_at: new Date().toISOString(),
        _synced: false
      });

      return {
        entityType: 'supplier',
        entityId: transaction.supplier_id,
        previousBalance,
        newBalance
      };

    } catch (error) {
      console.error('Error reverting supplier balance:', error);
      return null;
    }
  }

  /**
   * Determine if a transaction affects cash drawer
   */
  private isCashTransaction(transaction: any): boolean {
    // Consider transactions that involve cash payments or cash-related categories
    const cashCategories = [
      'Cash Payment',
      'Cash Sale',
      'Customer Payment',
      'Supplier Payment',
      'Payment Received',
      'Payment Sent'
    ];
    
    return cashCategories.includes(transaction.category);
  }

  /**
   * Get transaction impact summary for display
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
        const customer = await db.customers.get(transaction.customer_id);
        entityName = customer?.name || 'Unknown Customer';
        entityType = 'customer';
        entityId = transaction.customer_id;
      } else if (transaction.supplier_id) {
        const supplier = await db.suppliers.get(transaction.supplier_id);
        entityName = supplier?.name || 'Unknown Supplier';
        entityType = 'supplier';
        entityId = transaction.supplier_id;
      }

      return {
        cashDrawerImpact: this.isCashTransaction(transaction),
        entityImpact: {
          type: entityType,
          entityId,
          entityName
        },
        estimatedBalanceChanges: {
          cashDrawer: this.isCashTransaction(transaction) ? 
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
}

export const paymentManagementService = PaymentManagementService.getInstance();
