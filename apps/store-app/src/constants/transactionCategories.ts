/**
 * Standardized Transaction Categories
 * ALL transaction creation MUST use these exact category values
 */

export const TRANSACTION_CATEGORIES = {
  // Customer Transactions
  CUSTOMER_PAYMENT: 'Customer Payment',
  CUSTOMER_PAYMENT_RECEIVED: 'Customer Payment Received',
  CUSTOMER_CREDIT_SALE: 'Customer Credit Sale',
  
  // Supplier Transactions
  SUPPLIER_PAYMENT: 'Supplier Payment',
  SUPPLIER_PAYMENT_RECEIVED: 'Supplier Payment Received',
  SUPPLIER_CREDIT_SALE: 'Supplier Credit Sale',
  SUPPLIER_COMMISSION: 'Supplier Commission',
  
  // Cash Drawer Transactions
  CASH_DRAWER_SALE: 'Cash Drawer Sale',
  CASH_DRAWER_PAYMENT: 'Cash Drawer Payment',
  CASH_DRAWER_REFUND: 'Cash Drawer Refund',
  CASH_DRAWER_EXPENSE: 'Cash Drawer Expense',
  
  // Employee Transactions
  EMPLOYEE_PAYMENT: 'Employee Payment',
  EMPLOYEE_PAYMENT_RECEIVED: 'Employee Payment Received',
  
  // Internal Accounting
  ACCOUNTS_RECEIVABLE: 'Accounts Receivable',
  ACCOUNTS_PAYABLE: 'Accounts Payable',
} as const;

export type TransactionCategory = typeof TRANSACTION_CATEGORIES[keyof typeof TRANSACTION_CATEGORIES];

export const TRANSACTION_TYPES = {
  INCOME: 'income',
  EXPENSE: 'expense',
} as const;

export type TransactionType = typeof TRANSACTION_TYPES[keyof typeof TRANSACTION_TYPES];

/**
 * Map transaction categories to their type (income/expense)
 */
export const CATEGORY_TO_TYPE_MAP: Record<TransactionCategory, TransactionType> = {
  [TRANSACTION_CATEGORIES.CUSTOMER_PAYMENT]: TRANSACTION_TYPES.INCOME,
  [TRANSACTION_CATEGORIES.CUSTOMER_PAYMENT_RECEIVED]: TRANSACTION_TYPES.INCOME,
  [TRANSACTION_CATEGORIES.CUSTOMER_CREDIT_SALE]: TRANSACTION_TYPES.INCOME,
  [TRANSACTION_CATEGORIES.SUPPLIER_PAYMENT]: TRANSACTION_TYPES.EXPENSE,
  [TRANSACTION_CATEGORIES.SUPPLIER_PAYMENT_RECEIVED]: TRANSACTION_TYPES.EXPENSE,
  [TRANSACTION_CATEGORIES.SUPPLIER_CREDIT_SALE]: TRANSACTION_TYPES.EXPENSE,
  [TRANSACTION_CATEGORIES.SUPPLIER_COMMISSION]: TRANSACTION_TYPES.EXPENSE,
  [TRANSACTION_CATEGORIES.CASH_DRAWER_SALE]: TRANSACTION_TYPES.INCOME,
  [TRANSACTION_CATEGORIES.CASH_DRAWER_PAYMENT]: TRANSACTION_TYPES.INCOME,
  [TRANSACTION_CATEGORIES.CASH_DRAWER_REFUND]: TRANSACTION_TYPES.EXPENSE,
  [TRANSACTION_CATEGORIES.CASH_DRAWER_EXPENSE]: TRANSACTION_TYPES.EXPENSE,
  [TRANSACTION_CATEGORIES.EMPLOYEE_PAYMENT]: TRANSACTION_TYPES.EXPENSE,
  [TRANSACTION_CATEGORIES.EMPLOYEE_PAYMENT_RECEIVED]: TRANSACTION_TYPES.INCOME,
  [TRANSACTION_CATEGORIES.ACCOUNTS_RECEIVABLE]: TRANSACTION_TYPES.INCOME,
  [TRANSACTION_CATEGORIES.ACCOUNTS_PAYABLE]: TRANSACTION_TYPES.EXPENSE,
};

/**
 * Validate if a category is valid
 */
export function isValidTransactionCategory(category: string): category is TransactionCategory {
  return Object.values(TRANSACTION_CATEGORIES).includes(category as TransactionCategory);
}

/**
 * Get transaction type from category
 */
export function getTransactionType(category: TransactionCategory): TransactionType {
  return CATEGORY_TO_TYPE_MAP[category];
}
