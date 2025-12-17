import { db } from '../lib/db';
import { Customer, Supplier, Transaction, LocalSaleItem } from '../lib/db';
import { transactionService } from './transactionService';
import { BalanceCalculator } from '../utils/balanceCalculator';
import { QueryHelpers, DateFilters } from '../utils/queryHelpers';
import { CacheManager, CacheKeys } from '../utils/cacheManager';
import { PerformanceMonitor } from '../utils/performanceMonitor';
import { TRANSACTION_CATEGORIES } from '../constants/transactionCategories';

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
  // Simplified from singleton pattern - this service is stateless

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
      // Get entity from unified entities table
      const entity = await db.entities.get(entityId);

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
   * 🚀 CACHED for 5 seconds to improve performance
   */
  public async calculateBalanceFromTransactions(
    entityType: 'customer' | 'supplier',
    entityId: string,
    dateRange?: { start: string; end?: string }
  ): Promise<{ currentBalance: RunningBalance; openingBalance: RunningBalance }> {
    return PerformanceMonitor.withTracking(
      `balance:calculate:${entityType}`,
      async () => {
        const cacheKey = CacheKeys.entity(
          `balance_${entityType}`, 
          `${entityId}_${dateRange?.start || 'all'}_${dateRange?.end || 'now'}`
        );
        
        return CacheManager.withCache(
          cacheKey,
          CacheManager.TTL.MEDIUM, // 5 seconds
          async () => {
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
        );
      },
      { entityType, entityId, dateRange }
    );
  }

  /**
   * Process transactions and sales to calculate balance changes
   * Now using BalanceCalculator utility for consistent logic
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
    // Use BalanceCalculator for consistent balance calculation
    const balanceResult = BalanceCalculator.calculateFromTransactions(transactions, entityType);
    
    let transactionCount = transactions.length;
    let lastTransactionDate: string | undefined = transactions.length > 0 
      ? transactions[transactions.length - 1].created_at 
      : undefined;

    // Process sales (only for customers, creates debt)
    if (entityType === 'customer') {
      sales.forEach(sale => {
        if (sale.payment_method === 'credit') {
          // Credit sales increase customer debt
          balanceResult.LBP += sale.received_value;
          transactionCount++;
          lastTransactionDate = sale.created_at;
        }
      });
    }

    // Process commissions (only for suppliers, creates debt to supplier)
    // Note: Commission calculation would need inventory_bills data
    // This can be handled in a separate method if needed

    return {
      usdBalance: balanceResult.USD,
      lbpBalance: balanceResult.LBP,
      transactionCount,
      lastTransactionDate
    };
  }

  /**
   * Get all transactions for an entity within date range
   * Optimized using QueryHelpers utility
   */
  private async getEntityTransactions(
    entityType: 'customer' | 'supplier',
    entityId: string,
    startDate?: string,
    endDate?: string
  ): Promise<Transaction[]> {
    // Use QueryHelpers for consistent query pattern
    return await QueryHelpers.query(db.transactions, {
      entityType,
      entityId,
      startDate,
      endDate
    });
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
   * Update cached balance in entities table
   * Updated to use entities table instead of legacy customers/suppliers tables
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

    // Update unified entities table
    await db.entities.update(entityId, updateData);

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
      // Get customers from entities table
      const customers = await db.entities
        .where('[store_id+entity_type]')
        .equals([storeId, 'customer'])
        .toArray();
      
      for (const customer of customers) {
        const result = await this.getAccountBalance('customer', customer.id, true);
        customersReconciled++;
        
        if (!result.isReconciled) {
          discrepanciesFound++;
          discrepanciesFixed++;
        }
      }

      // Reconcile all suppliers from entities table
      const suppliers = await db.entities
        .where('[store_id+entity_type]')
        .equals([storeId, 'supplier'])
        .filter(e => !e._deleted && e.is_active)
        .toArray();
      
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
      // Use proper categories instead of negative amounts for reversals
      const context = {
        userId: createdBy,
        module: 'account_balance_service',
        source: 'api',
        storeId: originalTransaction.store_id,
        branchId: originalTransaction.branch_id || originalTransaction.store_id
      };

      if (originalTransaction.customer_id) {
        // For customer transactions, use CUSTOMER_REFUND for reversals
        if (originalTransaction.type === 'income') {
          // Original was income (customer paid us), reversal is refund (we refund customer)
          // Use CUSTOMER_REFUND category which is an expense type
          reversalResult = await transactionService.createTransaction({
            category: TRANSACTION_CATEGORIES.CUSTOMER_REFUND,
            amount: reversalAmount, // Positive amount, category handles the reversal
            currency: reversalCurrency,
            description: reversalDescription,
            context,
            customerId: originalTransaction.customer_id,
            reference: `REV-${originalTransaction.reference || originalTransaction.id.substring(0, 8)}`,
            is_reversal: true,
            reversal_of_transaction_id: originalTransactionId
          });
        } else {
          // Original was expense (we paid customer/refund), reversal is payment (customer pays us back)
          // Note: createCustomerPayment doesn't support is_reversal directly, so we'll update it after
          reversalResult = await transactionService.createCustomerPayment(
            originalTransaction.customer_id,
            reversalAmount,
            reversalCurrency,
            reversalDescription,
            context,
            {
              reference: `REV-${originalTransaction.reference || originalTransaction.id.substring(0, 8)}`
            }
          );
          // Update with reversal fields after creation
          if (reversalResult.success && reversalResult.transactionId) {
            await db.transactions.update(reversalResult.transactionId, {
              is_reversal: true,
              reversal_of_transaction_id: originalTransactionId,
              _synced: false
            });
          }
        }
      } else if (originalTransaction.supplier_id) {
        // For supplier transactions, use SUPPLIER_REFUND for reversals
        if (originalTransaction.type === 'expense') {
          // Original was expense (we paid supplier), reversal is refund (supplier refunds us)
          // Use SUPPLIER_REFUND category which is an income type
          reversalResult = await transactionService.createTransaction({
            category: TRANSACTION_CATEGORIES.SUPPLIER_REFUND,
            amount: reversalAmount, // Positive amount, category handles the reversal
            currency: reversalCurrency,
            description: reversalDescription,
            context,
            supplierId: originalTransaction.supplier_id,
            reference: `REV-${originalTransaction.reference || originalTransaction.id.substring(0, 8)}`,
            is_reversal: true,
            reversal_of_transaction_id: originalTransactionId
          });
        } else {
          // Original was income (supplier paid us/refund), reversal is payment (we pay supplier back)
          reversalResult = await transactionService.createSupplierPayment(
            originalTransaction.supplier_id,
            reversalAmount,
            reversalCurrency,
            reversalDescription,
            context,
            {
              reference: `REV-${originalTransaction.reference || originalTransaction.id.substring(0, 8)}`
            }
          );
          // Update with reversal fields after creation
          if (reversalResult.success && reversalResult.transactionId) {
            await db.transactions.update(reversalResult.transactionId, {
              is_reversal: true,
              reversal_of_transaction_id: originalTransactionId,
              _synced: false
            });
          }
        }
      } else if (originalTransaction.employee_id) {
        // For employee transactions, use opposite category
        // If original was EMPLOYEE_PAYMENT (expense), reversal is EMPLOYEE_PAYMENT_RECEIVED (income)
        // If original was EMPLOYEE_PAYMENT_RECEIVED (income), reversal is EMPLOYEE_PAYMENT (expense)
        const reversalCategory = originalTransaction.category === TRANSACTION_CATEGORIES.EMPLOYEE_PAYMENT
          ? TRANSACTION_CATEGORIES.EMPLOYEE_PAYMENT_RECEIVED
          : TRANSACTION_CATEGORIES.EMPLOYEE_PAYMENT;
        
        reversalResult = await transactionService.createTransaction({
          category: reversalCategory,
          amount: reversalAmount,
          currency: reversalCurrency,
          description: reversalDescription,
          context,
          employeeId: originalTransaction.employee_id,
          reference: `REV-${originalTransaction.reference || originalTransaction.id.substring(0, 8)}`,
          is_reversal: true,
          reversal_of_transaction_id: originalTransactionId
        });
      } else {
        // General transaction reversal - reverse the type
        const reversalType = originalTransaction.type === 'income' ? 'expense' : 'income';
        reversalResult = await transactionService.createTransaction({
          category: originalTransaction.category as any,
          amount: reversalAmount,
          currency: reversalCurrency,
          description: reversalDescription,
          context,
          reference: `REV-${originalTransaction.reference || originalTransaction.id.substring(0, 8)}`,
          is_reversal: true,
          reversal_of_transaction_id: originalTransactionId
        });
      }
      
      // Check if reversal transaction was created successfully
      if (!reversalResult.success) {
        console.error('Reversal transaction creation failed:', reversalResult.error);
        throw new Error(`Failed to create reversal transaction: ${reversalResult.error || 'Unknown error'}`);
      }
      
      // Get the created reversal transaction
      if (!reversalResult.transactionId) {
        console.error('Reversal result:', reversalResult);
        throw new Error('Failed to create reversal transaction: No transaction ID returned');
      }
      
      let reversalTransaction = await db.transactions.get(reversalResult.transactionId);
      
      if (!reversalTransaction) {
        throw new Error('Failed to retrieve created reversal transaction');
      }

      // For transactions created via createCustomerPayment/createSupplierPayment, 
      // we already updated them inline. For others, the fields were set during creation.
      // Verify the fields are set correctly
      if (!reversalTransaction.is_reversal || reversalTransaction.reversal_of_transaction_id !== originalTransactionId) {
        // Fallback: update if not already set (shouldn't happen, but safety check)
        await db.transactions.update(reversalResult.transactionId, {
          is_reversal: true,
          reversal_of_transaction_id: originalTransactionId,
          _synced: false
        });
        // Get the updated transaction
        reversalTransaction = await db.transactions.get(reversalResult.transactionId);
        if (!reversalTransaction) {
          throw new Error('Failed to retrieve updated reversal transaction');
        }
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
// Export service instance (stateless service - no singleton needed)
export const accountBalanceService = new AccountBalanceService();
