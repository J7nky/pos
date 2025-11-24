import { db } from '../lib/db';
import { Customer, Supplier, Transaction, LocalSaleItem } from '../lib/db';
import { transactionService } from './transactionService';

export interface RunningBalance {
  USD: number;
  LBP: number;
  lastTransactionDate: string;
  transactionCount: number;
}

export interface BalanceCalculationResult {
  currentBalance: RunningBalance;
  openingBalance: RunningBalance;
  isReconciled: boolean;
  discrepancy?: {
    cached: RunningBalance;
    calculated: RunningBalance;
    difference: RunningBalance;
  };
}

/**
 * Enhanced Account Balance Service
 * Implements hybrid approach: cached balances + dynamic calculation
 * Single source of truth: transactions table
 * Fast access: cached balances in customer/supplier tables
 */
export class AccountBalanceService {
  private static instance: AccountBalanceService;

  public static getInstance(): AccountBalanceService {
    if (!AccountBalanceService.instance) {
      AccountBalanceService.instance = new AccountBalanceService();
    }
    return AccountBalanceService.instance;
  }

  /**
   * Get account balance - uses cached balance with optional verification
   * @param entityType - 'customer' or 'supplier'
   * @param entityId - ID of the customer or supplier
   * @param verifyBalance - Whether to verify cached balance against transactions
   * @param dateRange - Optional date range for balance calculation
   */
  public async getAccountBalance(
    entityType: 'customer' | 'supplier',
    entityId: string,
    verifyBalance: boolean = false,
    dateRange?: { start: string; end?: string }
  ): Promise<BalanceCalculationResult> {
    try {
      // Get entity (customer or supplier)
      const entity = entityType === 'customer' 
        ? await db.customers.get(entityId)
        : await db.suppliers.get(entityId);

      if (!entity) {
        throw new Error(`${entityType} not found: ${entityId}`);
      }

      // Get cached balances
      const cachedBalance: RunningBalance = {
        USD: entity.usd_balance || 0,
        LBP: entity.lb_balance || 0,
        lastTransactionDate: entity.updated_at,
        transactionCount: 0
      };

      if (!verifyBalance && !dateRange) {
        // Return cached balance without verification
        return {
          currentBalance: cachedBalance,
          openingBalance: cachedBalance,
          isReconciled: true
        };
      }

      // Calculate balance from transactions (single source of truth)
      const calculatedBalance = await this.calculateBalanceFromTransactions(
        entityType,
        entityId,
        dateRange
      );

      // Check for discrepancies
      const usdDiff = Math.abs(cachedBalance.USD - calculatedBalance.currentBalance.USD);
      const lbpDiff = Math.abs(cachedBalance.LBP - calculatedBalance.currentBalance.LBP);
      const hasDiscrepancy = usdDiff > 0.01 || lbpDiff > 0.01;

      const result: BalanceCalculationResult = {
        currentBalance: calculatedBalance.currentBalance,
        openingBalance: calculatedBalance.openingBalance,
        isReconciled: !hasDiscrepancy
      };

      if (hasDiscrepancy) {
        result.discrepancy = {
          cached: cachedBalance,
          calculated: calculatedBalance.currentBalance,
          difference: {
            USD: calculatedBalance.currentBalance.USD - cachedBalance.USD,
            LBP: calculatedBalance.currentBalance.LBP - cachedBalance.LBP,
            lastTransactionDate: calculatedBalance.currentBalance.lastTransactionDate,
            transactionCount: calculatedBalance.currentBalance.transactionCount
          }
        };

        console.warn(`Balance discrepancy for ${entityType} ${entityId}:`, result.discrepancy);

        // Auto-reconcile if requested
        if (verifyBalance) {
          await this.updateCachedBalance(entityType, entityId, calculatedBalance.currentBalance);
        }
      }

      return result;
    } catch (error) {
      console.error(`Error getting account balance for ${entityType} ${entityId}:`, error);
      throw error;
    }
  }

  /**
   * Calculate running balance from transactions - AUTHORITATIVE SOURCE
   * This is the single source of truth for account balances
   */
  public async calculateBalanceFromTransactions(
    entityType: 'customer' | 'supplier',
    entityId: string,
    dateRange?: { start: string; end?: string }
  ): Promise<{ currentBalance: RunningBalance; openingBalance: RunningBalance }> {
    try {
      const now = new Date().toISOString();
      const startDate = dateRange?.start || new Date(2020, 0, 1).toISOString(); // Default to beginning of system
      const endDate = dateRange?.end || now;

      // Initialize balances
      let runningBalanceUSD = 0;
      let runningBalanceLBP = 0;
      let openingBalanceUSD = 0;
      let openingBalanceLBP = 0;
      let transactionCount = 0;
      let lastTransactionDate = startDate;

      // Get all relevant transactions and sales
      const [transactions, sales] = await Promise.all([
        this.getEntityTransactions(entityType, entityId, startDate, endDate),
        this.getEntitySales(entityType, entityId, startDate, endDate)
      ]);

      // Calculate opening balance (transactions before start date)
      if (dateRange?.start) {
        const openingTransactions = await this.getEntityTransactions(entityType, entityId, undefined, startDate);
        const openingSales = await this.getEntitySales(entityType, entityId, undefined, startDate);
        
        const openingResult = this.processTransactionsAndSales(entityType, openingTransactions, openingSales);
        openingBalanceUSD = openingResult.usdBalance;
        openingBalanceLBP = openingResult.lbpBalance;
      }

      // Process transactions and sales for the period
      const periodResult = this.processTransactionsAndSales(entityType, transactions, sales);
      runningBalanceUSD = openingBalanceUSD + periodResult.usdBalance;
      runningBalanceLBP = openingBalanceLBP + periodResult.lbpBalance;
      transactionCount = periodResult.transactionCount;
      lastTransactionDate = periodResult.lastTransactionDate || lastTransactionDate;

      return {
        currentBalance: {
          USD: runningBalanceUSD,
          LBP: runningBalanceLBP,
          lastTransactionDate,
          transactionCount
        },
        openingBalance: {
          USD: openingBalanceUSD,
          LBP: openingBalanceLBP,
          lastTransactionDate: startDate,
          transactionCount: 0
        }
      };
    } catch (error) {
      console.error(`Error calculating balance from transactions:`, error);
      throw error;
    }
  }

  /**
   * Process transactions and sales to calculate balance changes
   */
  private processTransactionsAndSales(
    entityType: 'customer' | 'supplier',
    transactions: Transaction[],
    sales: LocalSaleItem[]
  ): {
    usdBalance: number;
    lbpBalance: number;
    transactionCount: number;
    lastTransactionDate?: string;
  } {
    let usdBalance = 0;
    let lbpBalance = 0;
    let transactionCount = 0;
    let lastTransactionDate: string | undefined;

    // Process direct transactions (payments/receipts)
    transactions.forEach(transaction => {
      const amount = transaction.amount;
      const isPayment = entityType === 'customer' 
        ? transaction.type === 'income' // Customer payments are income
        : transaction.type === 'expense'; // Supplier payments are expenses

      if (transaction.currency === 'USD') {
        usdBalance += isPayment ? -amount : amount; // Payments reduce debt, expenses increase debt
      } else {
        lbpBalance += isPayment ? -amount : amount;
      }

      transactionCount++;
      lastTransactionDate = transaction.created_at;
    });

    // Process sales (only for customers, creates debt)
    if (entityType === 'customer') {
      sales.forEach(sale => {
        if (sale.payment_method === 'credit') {
          // Credit sales increase customer debt
          lbpBalance += sale.received_value;
          transactionCount++;
          lastTransactionDate = sale.created_at;
        }
      });
    }

    // Process commissions (only for suppliers, creates debt to supplier)
    if (entityType === 'supplier') {
      sales.forEach(sale => {
        // Supplier commissions create debt we owe to supplier
        // Commission calculation would need inventory_bills data
        // For now, we'll handle this in a separate method if needed
      });
    }

    return {
      usdBalance,
      lbpBalance,
      transactionCount,
      lastTransactionDate
    };
  }

  /**
   * Get all transactions for an entity within date range
   */
  private async getEntityTransactions(
    entityType: 'customer' | 'supplier',
    entityId: string,
    startDate?: string,
    endDate?: string
  ): Promise<Transaction[]> {
    const field = entityType === 'customer' ? 'customer_id' : 'supplier_id';
    
    let query = db.transactions.where(field).equals(entityId);
    
    if (startDate) {
      query = query.and(transaction => new Date(transaction.created_at) >= new Date(startDate));
    }
    
    if (endDate) {
      query = query.and(transaction => new Date(transaction.created_at) <= new Date(endDate));
    }

    return await query.toArray();
  }

  /**
   * Get all sales for an entity within date range
   */
  private async getEntitySales(
    entityType: 'customer' | 'supplier',
    entityId: string,
    startDate?: string,
    endDate?: string
  ): Promise<any[]> {
    if (entityType === 'supplier') {
      // For suppliers, we need sales that generate commissions
      // Note: supplier_id is not in bill_line_items, need to get from inventory_items or products
      // This method may need refactoring based on business logic
      // For now, returning empty array as supplier sales tracking needs clarification
      console.warn('Supplier sales tracking via bill_line_items needs refactoring - supplier_id not in bill_line_items');
      return [];
    } else {
      // For customers, we need credit sales - use normalized schema
      // Step 1: Get credit bills for this customer
      let billQuery = db.bills
        .where('customer_id')
        .equals(entityId)
        .and(b => b.payment_method === 'credit');
      
      if (startDate) {
        billQuery = billQuery.and(b => Boolean(b.bill_date) && new Date(b.bill_date!) >= new Date(startDate));
      }
      
      if (endDate) {
        billQuery = billQuery.and(b => Boolean(b.bill_date) && new Date(b.bill_date!) <= new Date(endDate));
      }

      const bills = await billQuery.toArray();
      
      // Step 2: Get line items for these bills
      if (bills.length === 0) return [];
      
      const billIds = bills.map(b => b.id);
      return await db.bill_line_items
        .where('bill_id')
        .anyOf(billIds)
        .toArray();
    }
  }

  /**
   * Update cached balance in customer/supplier table
   */
  private async updateCachedBalance(
    entityType: 'customer' | 'supplier',
    entityId: string,
    balance: RunningBalance
  ): Promise<void> {
    const updateData = {
      usd_balance: balance.USD,
      lb_balance: balance.LBP,
      updated_at: new Date().toISOString(),
      _synced: false
    };

    if (entityType === 'customer') {
      await db.customers.update(entityId, updateData);
    } else {
      await db.suppliers.update(entityId, updateData);
    }

    console.log(`Updated cached balance for ${entityType} ${entityId}:`, balance);
  }

  /**
   * Reconcile all account balances - verify cached vs calculated
   */
  public async reconcileAllBalances(storeId: string): Promise<{
    customersReconciled: number;
    suppliersReconciled: number;
    discrepanciesFound: number;
    discrepanciesFixed: number;
  }> {
    let customersReconciled = 0;
    let suppliersReconciled = 0;
    let discrepanciesFound = 0;
    let discrepanciesFixed = 0;

    try {
      // Reconcile all customers
      const customers = await db.customers.where('store_id').equals(storeId).toArray();
      
      for (const customer of customers) {
        const result = await this.getAccountBalance('customer', customer.id, true);
        customersReconciled++;
        
        if (!result.isReconciled) {
          discrepanciesFound++;
          discrepanciesFixed++;
        }
      }

      // Reconcile all suppliers
      const suppliers = await db.suppliers.where('store_id').equals(storeId).toArray();
      
      for (const supplier of suppliers) {
        const result = await this.getAccountBalance('supplier', supplier.id, true);
        suppliersReconciled++;
        
        if (!result.isReconciled) {
          discrepanciesFound++;
          discrepanciesFixed++;
        }
      }

      console.log(`Balance reconciliation completed:`, {
        customersReconciled,
        suppliersReconciled,
        discrepanciesFound,
        discrepanciesFixed
      });

      return {
        customersReconciled,
        suppliersReconciled,
        discrepanciesFound,
        discrepanciesFixed
      };
    } catch (error) {
      console.error('Error during balance reconciliation:', error);
      throw error;
    }
  }

  /**
   * Handle backdated transaction - recalculate affected balances
   */
  public async handleBackdatedTransaction(
    entityType: 'customer' | 'supplier',
    entityId: string,
    transactionDate: string
  ): Promise<void> {
    try {
      console.log(`Handling backdated transaction for ${entityType} ${entityId} on ${transactionDate}`);
      
      // Recalculate balance from the backdated transaction date onwards
      const result = await this.calculateBalanceFromTransactions(entityType, entityId);
      
      // Update cached balance
      await this.updateCachedBalance(entityType, entityId, result.currentBalance);
      
      console.log(`Updated balance for backdated transaction: ${entityType} ${entityId}`);
    } catch (error) {
      console.error('Error handling backdated transaction:', error);
      throw error;
    }
  }

  /**
   * Create reversal transaction for mistakes (maintains immutability)
   */
  public async createReversalTransaction(
    originalTransactionId: string,
    reason: string,
    createdBy: string
  ): Promise<Transaction> {
    try {
      const originalTransaction = await db.transactions.get(originalTransactionId);
      
      if (!originalTransaction) {
        throw new Error(`Original transaction not found: ${originalTransactionId}`);
      }

      // Create opposite transaction using transactionService
      const reversalDescription = `Reversal of ${originalTransaction.description} - Reason: ${reason}`;
      const reversalAmount = originalTransaction.amount;
      const reversalCurrency = originalTransaction.currency as 'USD' | 'LBP';
      
      let reversalResult;
      
      // Determine which service method to use based on the original transaction
      if (originalTransaction.customer_id) {
        // For customer transactions, reverse the payment direction
        if (originalTransaction.type === 'income') {
          // Original was income (customer paid us), reversal is expense (we refund customer)
          // This increases customer balance (they owe us less or we owe them)
          reversalResult = await transactionService.createCustomerPayment(
            originalTransaction.customer_id,
            -reversalAmount, // Negative to reverse the payment
            reversalCurrency,
            reversalDescription,
            {
              userId: createdBy,
              module: 'account_balance_service',
              source: 'api',
              storeId: originalTransaction.store_id
            }
          );
        } else {
          // Original was expense (we paid customer), reversal is income (customer pays us back)
          reversalResult = await transactionService.createCustomerPayment(
            originalTransaction.customer_id,
            reversalAmount,
            reversalCurrency,
            reversalDescription,
            {
              userId: createdBy,
              module: 'account_balance_service',
              source: 'api',
              storeId: originalTransaction.store_id
            }
          );
        }
      } else if (originalTransaction.supplier_id) {
        // For supplier transactions, reverse the payment direction
        if (originalTransaction.type === 'expense') {
          // Original was expense (we paid supplier), reversal is income (supplier refunds us)
          reversalResult = await transactionService.createSupplierPayment(
            originalTransaction.supplier_id,
            -reversalAmount, // Negative to reverse the payment
            reversalCurrency,
            reversalDescription,
            {
              userId: createdBy,
              module: 'account_balance_service',
              source: 'api',
              storeId: originalTransaction.store_id
            }
          );
        } else {
          // Original was income (supplier paid us), reversal is expense (we pay supplier back)
          reversalResult = await transactionService.createSupplierPayment(
            originalTransaction.supplier_id,
            reversalAmount,
            reversalCurrency,
            reversalDescription,
            {
              userId: createdBy,
              module: 'account_balance_service',
              source: 'api',
              storeId: originalTransaction.store_id
            }
          );
        }
      } else {
        // General expense reversal (no customer or supplier)
        reversalResult = await transactionService.createTransaction({
          category: originalTransaction.category as any,
          amount: reversalAmount,
          currency: reversalCurrency,
          description: reversalDescription,
          context: {
            userId: createdBy,
            module: 'account_balance_service',
            source: 'api',
            storeId: originalTransaction.store_id
          }
        });
      }
      
      // Get the created reversal transaction
      if (!reversalResult.transactionId) {
        throw new Error('Failed to create reversal transaction');
      }
      
      const reversalTransaction = await db.transactions.get(reversalResult.transactionId);
      
      if (!reversalTransaction) {
        throw new Error('Failed to retrieve created reversal transaction');
      }

      // Update affected account balance
      if (originalTransaction.customer_id) {
        await this.handleBackdatedTransaction('customer', originalTransaction.customer_id, reversalTransaction.created_at);
      }
      
      if (originalTransaction.supplier_id) {
        await this.handleBackdatedTransaction('supplier', originalTransaction.supplier_id, reversalTransaction.created_at);
      }

      console.log(`Created reversal transaction:`, reversalTransaction);
      return reversalTransaction;
    } catch (error) {
      console.error('Error creating reversal transaction:', error);
      throw error;
    }
  }
}

// Export singleton instance
export const accountBalanceService = AccountBalanceService.getInstance();
