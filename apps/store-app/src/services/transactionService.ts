import { currencyService } from './currencyService';
import { Customer, Supplier, Transaction, AccountsReceivable, AccountsPayable } from '../types';
import { cashDrawerUpdateService } from './cashDrawerUpdateService';
import { paymentService, PaymentFilter, PaymentTransaction } from './paymentService';
import { PAYMENT_CATEGORIES, PAYMENT_TYPES } from '../constants/paymentCategories';
import { generatePaymentReference, generateExpenseReference, generateARReference, generateAPReference } from '../utils/referenceGenerator';
// Remove dataAccessService import - use direct IndexedDB access

export interface TransactionResult {
  success: boolean;
  transactionId?: string;
  error?: string;
  balanceBefore: number;
  balanceAfter: number;
  affectedRecords: string[];
}

export interface PaymentProcessingOptions {
  updateCustomerBalance?: boolean;
  updateSupplierBalance?: boolean;
  createReceivable?: boolean;
  createPayable?: boolean;
  updateCashDrawer?: boolean;
}

export class TransactionService {
  private static instance: TransactionService;

  private constructor() {}

  public static getInstance(): TransactionService {
    if (!TransactionService.instance) {
      TransactionService.instance = new TransactionService();
    }
    return TransactionService.instance;
  }

  public async processCustomerPayment(
    customerId: string,
    amount: number,
    currency: 'USD' | 'LBP',
    description: string,
    createdBy: string,
    storeId: string,
    options: PaymentProcessingOptions = {}
  ): Promise<TransactionResult> {
    try {
      // Validate input
      if (!currencyService.validateCurrencyAmount(amount, currency)) {
        return {
          success: false,
          error: 'Invalid amount',
          balanceBefore: 0,
          balanceAfter: 0,
          affectedRecords: []
        };
      }

      const amountInUSD = currencyService.convertCurrency(amount, currency, 'USD');
      
      // Get customer data from IndexedDB
      const { db } = await import('../lib/db');
      const customerData = await db.customers.get(customerId);
      if (!customerData) {
        return {
          success: false,
          error: 'Customer not found',
          balanceBefore: 0,
          balanceAfter: 0,
          affectedRecords: []
        };
      }
      
      const customer: Customer = {
        id: customerData.id,
        name: customerData.name,
        phone: customerData.phone,
        email: customerData.email || '',
        address: customerData.address || '',
        lb_balance: customerData.lb_balance || 0,
        usd_balance: customerData.usd_balance || 0,
        isActive: customerData.isActive,
        createdAt: customerData.createdAt,
      };

      const balanceBefore = customer.balance || 0;
      const balanceAfter = balanceBefore - amountInUSD; // Payment reduces debt

      // Update customer balance in IndexedDB
      if (options.updateCustomerBalance !== false) {
        await db.customers.update(customerId, { 
          usd_balance: balanceAfter,
          _synced: false,
          updated_at: new Date().toISOString()
        });
      }

      // Update accounts receivable in IndexedDB
      if (options.createReceivable !== false) {
        // Create a transaction record for the receivable update
        await db.transactions.add({
          id: `ar-${Date.now()}`,
          store_id: storeId,
          type: 'income',
          category: 'Accounts Receivable',
          amount: amountInUSD,
          currency: 'USD',
          customer_id: customerId,
          supplier_id: null,
          description: `Receivable update for customer ${customerId}`,
          reference: generateARReference(),
          created_at: new Date().toISOString(),
          created_by: createdBy,
          _synced: false
        });
      }

      // Create transaction record
      const transaction: Transaction = {
        id: Date.now().toString(),
        type: PAYMENT_TYPES.INCOME,
        category: PAYMENT_CATEGORIES.CUSTOMER_PAYMENT,
        amount: amountInUSD,
        currency: 'USD',
        description: `${description} (Originally ${currency} ${amount})`,
        reference: generatePaymentReference(),
        created_at: new Date().toISOString(),
        created_by: createdBy,
        store_id: storeId
      };

      await db.transactions.add({
        ...transaction,
        store_id: storeId,
        _synced: false
      });

      // Update cash drawer for cash payments
      if (options.updateCashDrawer !== false) {
        try {
          // Get store ID from context or use a default
          const storeId = 'default-store'; // This should be passed from the calling context
          const cashDrawerResult = await cashDrawerUpdateService.updateCashDrawerForCustomerPayment({
            amount: amountInUSD,
            currency: 'USD',
            storeId,
            createdBy,
            customerId,
            description: `Payment for ${description}`
          });

          if (cashDrawerResult.success) {
            // console.log(`💰 Cash drawer updated for customer payment: $${cashDrawerResult.previousBalance.toFixed(2)} → $${cashDrawerResult.newBalance.toFixed(2)}`);
          }
        } catch (error) {
          console.error('Error updating cash drawer for customer payment:', error);
        }
      }

      return {
        success: true,
        transactionId: transaction.id,
        balanceBefore,
        balanceAfter,
        affectedRecords: [customerId]
      };

    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
        balanceBefore: 0,
        balanceAfter: 0,
        affectedRecords: []
      };
    }
  }

  public async processSupplierPayment(
    supplierId: string,
    amount: number,
    currency: 'USD' | 'LBP',
    description: string,
    createdBy: string,
    storeId: string,
    options: PaymentProcessingOptions = {}
  ): Promise<TransactionResult> {
    try {
      // Validate input
      if (!currencyService.validateCurrencyAmount(amount, currency)) {
        return {
          success: false,
          error: 'Invalid amount',
          balanceBefore: 0,
          balanceAfter: 0,
          affectedRecords: []
        };
      }

      const amountInUSD = currencyService.convertCurrency(amount, currency, 'USD');
      
      // Get supplier data from IndexedDB
      const { db } = await import('../lib/db');
      const supplierData = await db.suppliers.get(supplierId);
      if (!supplierData) {
        return {
          success: false,
          error: 'Supplier not found',
          balanceBefore: 0,
          balanceAfter: 0,
          affectedRecords: []
        };
      }
      
      const supplier: Supplier = {
        id: supplierData.id,
        name: supplierData.name,
        phone: supplierData.phone,
        email: supplierData.email || '',
        address: supplierData.address,
        lbBalance: supplierData.lb_balance || 0,
        usdBalance: supplierData.usd_balance || 0,
        createdAt: supplierData.created_at,
        balance: supplierData.usd_balance || 0,
      };

      const balanceBefore = supplier.balance || 0;
      const balanceAfter = balanceBefore - amountInUSD; // Payment reduces debt

      // Update supplier balance in IndexedDB
      if (options.updateSupplierBalance !== false) {
        await db.suppliers.update(supplierId, { 
          usd_balance: balanceAfter,
          _synced: false,
          updated_at: new Date().toISOString()
        });
      }

      // Update accounts payable in IndexedDB
      if (options.createPayable !== false) {
        // Create a transaction record for the payable update
        await db.transactions.add({
          id: `ap-${Date.now()}`,
          store_id: storeId,
          type: 'expense',
          category: 'Accounts Payable',
          amount: amountInUSD,
          currency: 'USD',
          supplier_id: supplierId,
          customer_id: null,
          description: `Payable update for supplier ${supplierId}`,
          reference: generateAPReference(),
          created_at: new Date().toISOString(),
          created_by: createdBy,
          _synced: false
        });
      }

      // Create transaction record
      const transaction: Transaction = {
        id: Date.now().toString(),
        type: PAYMENT_TYPES.EXPENSE,
        category: PAYMENT_CATEGORIES.SUPPLIER_PAYMENT,
        amount: amountInUSD,
        currency: 'USD',
        description: `${description} (Originally ${currency} ${amount})`,
        reference: generatePaymentReference(),
        created_at: new Date().toISOString(),
        created_by: createdBy,
        supplier_id: supplierId,
        customer_id: null,
        _synced:false,
        store_id: storeId
      };

      await db.transactions.add({
        ...transaction,
        store_id: storeId,
        _synced: false
      });

      return {
        success: true,
        transactionId: transaction.id,
        balanceBefore,
        balanceAfter,
        affectedRecords: [supplierId]
      };

    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
        balanceBefore: 0,
        balanceAfter: 0,
        affectedRecords: []
      };
    }
  }

  public async processExpense(
    amount: number,
    currency: 'USD' | 'LBP',
    category: string,
    description: string,
    createdBy: string,
    storeId: string
  ): Promise<TransactionResult> {
    try {
      // Validate input
      if (!currencyService.validateCurrencyAmount(amount, currency)) {
        return {
          success: false,
          error: 'Invalid amount',
          balanceBefore: 0,
          balanceAfter: 0,
          affectedRecords: []
        };
      }

      const amountInUSD = currencyService.convertCurrency(amount, currency, 'USD');

      // Create transaction record
      const transaction: Transaction = {
        id: Date.now().toString(),
        type: 'expense',
        category,
        amount: amountInUSD,
        currency: 'USD',
        description: `${description} (Originally ${currency} ${amount})`,
        reference: generateExpenseReference(),
        created_at: new Date().toISOString(),
        created_by: createdBy,
        store_id: storeId
      };

      await db.transactions.add({
        ...transaction,
        store_id: storeId,
        _synced: false
      });

      // Update cash drawer for cash expenses
      try {
        // Get store ID from context or use a default
        const storeId = 'default-store'; // This should be passed from the calling context
        const cashDrawerResult = await cashDrawerUpdateService.updateCashDrawerForExpense({
          amount: amountInUSD,
          currency: 'USD',
          storeId,
          createdBy,
          description,
          category
        });

        if (cashDrawerResult.success) {
          // console.log(`💰 Cash drawer updated for expense: $${cashDrawerResult.previousBalance.toFixed(2)} → $${cashDrawerResult.newBalance.toFixed(2)}`);
        }
      } catch (error) {
        console.error('Error updating cash drawer for expense:', error);
      }

      return {
        success: true,
        transactionId: transaction.id,
        balanceBefore: 0,
        balanceAfter: 0,
        affectedRecords: []
      };

    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
        balanceBefore: 0,
        balanceAfter: 0,
        affectedRecords: []
      };
    }
  }

  public async getTransactionHistory(
    storeId: string,
    entityId?: string,
    startDate?: string,
    endDate?: string
  ): Promise<Transaction[]> {
    try {
      const { db } = await import('../lib/db');
      const transactions = await db.transactions.where('store_id').equals(storeId).toArray();
      
      let filteredTransactions = transactions;

      // Filter by entity if provided
      if (entityId) {
        // For now, we'll return all transactions since we don't have entity linking
        // This can be enhanced later to filter by customer/supplier transactions
        filteredTransactions = transactions;
      }

      // Filter by date range if provided
      if (startDate || endDate) {
        filteredTransactions = filteredTransactions.filter((t: Transaction) => {
          if (!t.created_at) return false;
          const transactionDate = new Date(t.created_at);
          const start = startDate ? new Date(startDate) : new Date(0);
          const end = endDate ? new Date(endDate) : new Date();
          
          return transactionDate >= start && transactionDate <= end;
        });
      }

      return filteredTransactions
        .filter((t: Transaction) => t.created_at)
        .sort((a: Transaction, b: Transaction) => 
          new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
        );

    } catch (error) {
      console.error('Error getting transaction history:', error);
      return [];
    }
  }

  /**
   * Get payment transactions with enhanced filtering
   */
  public async getPaymentTransactions(
    storeId: string,
    filter: PaymentFilter = {}
  ): Promise<PaymentTransaction[]> {
    try {
      const { db } = await import('../lib/db');
      const transactions = await db.transactions.where('store_id').equals(storeId).toArray();
      
      return paymentService.filterPaymentTransactions(transactions, {
        ...filter,
        storeId
      });
    } catch (error) {
      console.error('Error getting payment transactions:', error);
      return [];
    }
  }

  /**
   * Get customer payment transactions
   */
  public async getCustomerPayments(
    storeId: string,
    customerId?: string,
    startDate?: string,
    endDate?: string
  ): Promise<PaymentTransaction[]> {
    return this.getPaymentTransactions(storeId, {
      entityType: 'customer',
      entityId: customerId,
      startDate,
      endDate
    });
  }

  /**
   * Get supplier payment transactions
   */
  public async getSupplierPayments(
    storeId: string,
    supplierId?: string,
    startDate?: string,
    endDate?: string
  ): Promise<PaymentTransaction[]> {
    return this.getPaymentTransactions(storeId, {
      entityType: 'supplier',
      entityId: supplierId,
      startDate,
      endDate
    });
  }

  /**
   * Get today's payment transactions
   */
  public async getTodaysPayments(
    storeId: string,
    today: string,
    entityType?: 'customer' | 'supplier',
    entityId?: string
  ): Promise<PaymentTransaction[]> {
    const { db } = await import('../lib/db');
    const transactions = await db.transactions.where('store_id').equals(storeId).toArray();
    
    return paymentService.getTodaysPayments(transactions, today, {
      entityType,
      entityId,
      storeId
    });
  }

  /**
   * Get payment summary for a date range
   */
  public async getPaymentSummary(
    storeId: string,
    startDate: string,
    endDate: string,
    currency: 'USD' | 'LBP' = 'USD'
  ): Promise<{
    dailyPayments: Record<string, any>;
    totalSummary: any;
  }> {
    const { db } = await import('../lib/db');
    const transactions = await db.transactions.where('store_id').equals(storeId).toArray();
    
    return paymentService.getPaymentStatistics(transactions, startDate, endDate, currency);
  }

  /**
   * Validate payment transaction before processing
   */
  public validatePayment(
    customerId?: string,
    supplierId?: string,
    amount?: number,
    currency?: 'USD' | 'LBP',
    description?: string
  ): { isValid: boolean; errors: string[] } {
    const errors: string[] = [];

    if (!customerId && !supplierId) {
      errors.push('Either customer or supplier must be specified');
    }

    if (customerId && supplierId) {
      errors.push('Cannot specify both customer and supplier');
    }

    if (!amount || amount <= 0) {
      errors.push('Valid amount is required');
    }

    if (!currency) {
      errors.push('Currency is required');
    }

    if (!description || description.trim().length === 0) {
      errors.push('Description is required');
    }

    return {
      isValid: errors.length === 0,
      errors
    };
  }

  /**
   * Get payment transactions grouped by entity
   */
  public async getPaymentsByEntity(
    storeId: string,
    entityType?: 'customer' | 'supplier',
    startDate?: string,
    endDate?: string
  ): Promise<Record<string, PaymentTransaction[]>> {
    const { db } = await import('../lib/db');
    const transactions = await db.transactions.where('store_id').equals(storeId).toArray();
    
    return paymentService.getPaymentsByEntity(transactions, {
      entityType,
      startDate,
      endDate,
      storeId
    });
  }
}

export const transactionService = TransactionService.getInstance(); 