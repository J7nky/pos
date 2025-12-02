/**
 * BALANCE CALCULATOR UTILITY
 * 
 * Single source of truth for all balance calculations across the application.
 * This consolidates duplicate balance calculation logic that was scattered across:
 * - accountBalanceService
 * - balanceVerificationService  
 * - cashDrawerUpdateService
 * - journalService
 * 
 * Usage:
 * - Use for customer/supplier balance calculations
 * - Use for cash drawer balance calculations
 * - Use for journal entry balance calculations
 */

export interface Transaction {
  type: string; // Can be: income, expense, sale, payment, credit_sale, etc.
  amount: number;
  currency: 'USD' | 'LBP';
  created_at: string;
}

export interface BalanceResult {
  USD: number;
  LBP: number;
}

export interface RunningBalanceResult {
  balance: number;
  transactionCount: number;
  lastTransactionDate?: string;
}

export class BalanceCalculator {
  /**
   * Calculate balance from transactions for customers/suppliers
   * 
   * Rules:
   * - For customers: income (payments) reduces balance, expenses (credit sales) increase it
   * - For suppliers: expenses (payments to them) reduce balance, income increases it
   */
  static calculateFromTransactions(
    transactions: Transaction[],
    entityType: 'customer' | 'supplier'
  ): BalanceResult {
    const balances: BalanceResult = { USD: 0, LBP: 0 };

    for (const txn of transactions) {
      const amount = txn.amount;
      const currency = txn.currency;

      if (entityType === 'customer') {
        // For customers: income (payments) reduces balance, expenses (credit sales) increase it
        const multiplier = txn.type === 'income' ? -1 : 1;
        balances[currency] += amount * multiplier;
      } else if (entityType === 'supplier') {
        // For suppliers: expenses (payments to them) reduce balance, income increases it
        const multiplier = txn.type === 'expense' ? -1 : 1;
        balances[currency] += amount * multiplier;
      }
    }

    return balances;
  }

  /**
   * Calculate running balance from transactions (e.g., for cash drawer)
   * 
   * @param transactions - Array of transactions
   * @param openingBalance - Starting balance
   * @returns Final balance after all transactions
   */
  static calculateRunningBalance(
    transactions: Transaction[],
    openingBalance: number = 0
  ): RunningBalanceResult {
    let balance = openingBalance;
    let transactionCount = 0;
    let lastTransactionDate: string | undefined;

    for (const trans of transactions) {
      // Income types increase balance
      if (trans.type === 'income' || trans.type === 'sale' || trans.type === 'payment') {
        balance += trans.amount;
      } 
      // Expense types decrease balance
      else if (trans.type === 'expense' || trans.type === 'refund' || trans.type === 'credit_sale') {
        balance -= trans.amount;
      }
      
      transactionCount++;
      lastTransactionDate = trans.created_at;
    }

    return {
      balance,
      transactionCount,
      lastTransactionDate
    };
  }

  /**
   * Calculate balance by currency from transactions
   */
  static calculateByCurrency(
    transactions: Transaction[],
    entityType: 'customer' | 'supplier' | 'cash_drawer'
  ): BalanceResult {
    if (entityType === 'cash_drawer') {
      // For cash drawer, just sum income - expense
      return this.calculateCashDrawerBalance(transactions);
    }
    
    return this.calculateFromTransactions(transactions, entityType);
  }

  /**
   * Calculate cash drawer balance (income - expense)
   */
  private static calculateCashDrawerBalance(transactions: Transaction[]): BalanceResult {
    const balances: BalanceResult = { USD: 0, LBP: 0 };

    for (const txn of transactions) {
      const currency = txn.currency;
      if (txn.type === 'income') {
        balances[currency] += txn.amount;
      } else if (txn.type === 'expense') {
        balances[currency] -= txn.amount;
      }
    }

    return balances;
  }

  /**
   * Calculate balance with opening balance
   */
  static calculateWithOpening(
    transactions: Transaction[],
    openingBalance: BalanceResult,
    entityType: 'customer' | 'supplier'
  ): BalanceResult {
    const periodBalance = this.calculateFromTransactions(transactions, entityType);
    
    return {
      USD: openingBalance.USD + periodBalance.USD,
      LBP: openingBalance.LBP + periodBalance.LBP
    };
  }

  /**
   * Verify balance matches expected value (within tolerance)
   */
  static verifyBalance(
    calculated: number,
    stored: number,
    tolerance: number = 0.01
  ): {
    isValid: boolean;
    discrepancy: number;
  } {
    const discrepancy = Math.abs(calculated - stored);
    return {
      isValid: discrepancy <= tolerance,
      discrepancy
    };
  }

  /**
   * Get total balance across currencies (converted to single currency)
   */
  static getTotalBalance(
    balance: BalanceResult,
    exchangeRate: number,
    targetCurrency: 'USD' | 'LBP' = 'USD'
  ): number {
    if (targetCurrency === 'USD') {
      return balance.USD + (balance.LBP / exchangeRate);
    } else {
      return (balance.USD * exchangeRate) + balance.LBP;
    }
  }
}

