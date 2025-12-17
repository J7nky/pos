/**
 * Payment category constants for consistent payment identification across the system
 * These constants ensure that payment transactions are properly categorized and filtered
 */

export const PAYMENT_CATEGORIES = {
  // Customer-related payments
  CUSTOMER_PAYMENT: 'Customer Payment',
  CUSTOMER_CREDIT_SALE: 'Customer Credit Sale',
  CUSTOMER_REFUND: 'Customer Refund',
  // Supplier-related payments
  SUPPLIER_PAYMENT: 'Supplier Payment',
  SUPPLIER_COMMISSION: 'Supplier Commission',
  SUPPLIER_REFUND: 'Supplier Refund',
  SUPPLIER_CREDIT_SALE: 'Supplier Credit Sale',
  // Cash drawer payments
  CASH_PAYMENT: 'Cash Payment',
  CASH_SALE: 'Cash Sale',
  CASH_DRAWER_SALE: 'cash_drawer_sale',
  CASH_DRAWER_PAYMENT: 'cash_drawer_payment',
  CASH_DRAWER_CUSTOMER_PAYMENT: 'cash_drawer_customer_payment',
  CASH_DRAWER_EXPENSE: 'cash_drawer_expense',
  CASH_DRAWER_REFUND: 'cash_drawer_refund',
  
  // Employee payments
  EMPLOYEE_PAYMENT: 'Employee Payment',
  
  // Sales
  SALE: 'sale',
  
  // General payment types
  PAYMENT_RECEIVED: 'Payment Received',
  PAYMENT_SENT: 'Payment Sent',
  
  // Expense categories that might be payments
  EXPENSE_PAYMENT: 'Expense Payment',
} as const;

export const PAYMENT_TYPES = {
  INCOME: 'income',
  EXPENSE: 'expense',
} as const;

export const PAYMENT_CURRENCIES = {
  USD: 'USD',
  LBP: 'LBP',
} as const;

/**
 * Check if a transaction category represents a payment
 */
export const isPaymentCategory = (category: string): boolean => {
  return Object.values(PAYMENT_CATEGORIES).includes(category as any);
};

/**
 * Check if a transaction is a customer payment
 */
export const isCustomerPayment = (transaction: { type: string; category: string; customer_id?: string | null }): boolean => {
  return (
   (transaction.type === PAYMENT_TYPES.INCOME || transaction.type === PAYMENT_TYPES.EXPENSE) &&
    (transaction.category === PAYMENT_CATEGORIES.CUSTOMER_PAYMENT ||
     transaction.category === PAYMENT_CATEGORIES.CUSTOMER_REFUND ||
     transaction.category === PAYMENT_CATEGORIES.CUSTOMER_CREDIT_SALE ||
     transaction.category === PAYMENT_CATEGORIES.PAYMENT_RECEIVED) &&
    !!transaction.customer_id
  );  
  
};


/**
 * Check if a transaction is a supplier payment
 */
export const isSupplierPayment = (transaction: { type: string; category: string; supplier_id?: string | null }): boolean => {
  return (
    transaction.type === PAYMENT_TYPES.EXPENSE &&
    (transaction.category === PAYMENT_CATEGORIES.SUPPLIER_PAYMENT ||
     transaction.category === PAYMENT_CATEGORIES.SUPPLIER_CREDIT_SALE ||
     transaction.category === PAYMENT_CATEGORIES.SUPPLIER_COMMISSION ||
     transaction.category === PAYMENT_CATEGORIES.SUPPLIER_REFUND ||
     transaction.category === PAYMENT_CATEGORIES.PAYMENT_SENT) &&
    !!transaction.supplier_id
  );
};

/**
 * Check if a transaction is any type of payment
 */
export const isPaymentTransaction = (transaction: { type: string; category: string; customer_id?: string | null; supplier_id?: string | null }): boolean => {
  return isCustomerPayment(transaction) || isSupplierPayment(transaction) || isPaymentCategory(transaction.category);
};

/**
 * Get payment direction (received/paid) based on transaction
 */
export const getPaymentDirection = (transaction: { type: string; category: string }): 'received' | 'paid' | 'unknown' => {
  if (transaction.type === PAYMENT_TYPES.INCOME) {
    return 'received';
  } else if (transaction.type === PAYMENT_TYPES.EXPENSE) {
    return 'paid';
  }
  return 'unknown';
};

/**
 * Get entity type from payment transaction
 */
export const getPaymentEntityType = (transaction: { customer_id?: string | null; supplier_id?: string | null }): 'customer' | 'supplier' | 'unknown' => {
  if (transaction.customer_id) {
    return 'customer';
  } else if (transaction.supplier_id) {
    return 'supplier';
  }
  return 'unknown';
};
