/**
 * BALANCE CALCULATOR UTILITY
 *
 * Single source of truth for transaction-side balance arithmetic.
 * Currency-agnostic: every balance result is a `Partial<Record<CurrencyCode, number>>`
 * keyed by whatever currencies appear in the input.
 */

import type { CurrencyCode } from '@pos-platform/shared';

export interface Transaction {
  type: string; // Can be: income, expense, sale, payment, credit_sale, etc.
  amount: number;
  currency: CurrencyCode;
  created_at: string;
}

export type BalanceResult = Partial<Record<CurrencyCode, number>>;

export interface RunningBalanceResult {
  balance: number;
  transactionCount: number;
  lastTransactionDate?: string;
}

export class BalanceCalculator {
  /**
   * Calculate balance from transactions for customers/suppliers.
   *
   * Rules:
   *   - For customers: income (payments) reduces balance; expenses (credit sales) increase it.
   *   - For suppliers: expenses (payments to them) reduce balance; income increases it.
   */
  static calculateFromTransactions(
    transactions: Transaction[],
    entityType: 'customer' | 'supplier'
  ): BalanceResult {
    const balances: BalanceResult = {};

    for (const txn of transactions) {
      const amount = txn.amount;
      const currency = txn.currency;
      let multiplier = 0;

      if (entityType === 'customer') {
        multiplier = txn.type === 'income' ? -1 : 1;
      } else if (entityType === 'supplier') {
        multiplier = txn.type === 'expense' ? -1 : 1;
      } else {
        continue;
      }

      balances[currency] = (balances[currency] ?? 0) + amount * multiplier;
    }

    return balances;
  }

  /**
   * Calculate single-currency running balance (e.g. for cash drawer where
   * all entries are already normalized to one currency).
   */
  static calculateRunningBalance(
    transactions: Transaction[],
    openingBalance: number = 0
  ): RunningBalanceResult {
    let balance = openingBalance;
    let transactionCount = 0;
    let lastTransactionDate: string | undefined;

    for (const trans of transactions) {
      if (trans.type === 'income' || trans.type === 'sale' || trans.type === 'payment') {
        balance += trans.amount;
      } else if (trans.type === 'expense' || trans.type === 'refund' || trans.type === 'credit_sale') {
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
   * Calculate balance by currency from transactions.
   */
  static calculateByCurrency(
    transactions: Transaction[],
    entityType: 'customer' | 'supplier' | 'cash_drawer'
  ): BalanceResult {
    if (entityType === 'cash_drawer') {
      return this.calculateCashDrawerBalance(transactions);
    }

    return this.calculateFromTransactions(transactions, entityType);
  }

  /**
   * Calculate cash drawer balance per currency (income - expense).
   */
  private static calculateCashDrawerBalance(transactions: Transaction[]): BalanceResult {
    const balances: BalanceResult = {};

    for (const txn of transactions) {
      const currency = txn.currency;
      if (txn.type === 'income') {
        balances[currency] = (balances[currency] ?? 0) + txn.amount;
      } else if (txn.type === 'expense') {
        balances[currency] = (balances[currency] ?? 0) - txn.amount;
      }
    }

    return balances;
  }

  /**
   * Calculate balance starting from an opening balance map.
   */
  static calculateWithOpening(
    transactions: Transaction[],
    openingBalance: BalanceResult,
    entityType: 'customer' | 'supplier'
  ): BalanceResult {
    const periodBalance = this.calculateFromTransactions(transactions, entityType);
    const out: BalanceResult = { ...openingBalance };
    for (const code of Object.keys(periodBalance) as CurrencyCode[]) {
      out[code] = (out[code] ?? 0) + (periodBalance[code] ?? 0);
    }
    return out;
  }

  /**
   * Verify a calculated balance matches an expected stored value (within tolerance).
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
}
