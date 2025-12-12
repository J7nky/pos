// Account Mapping Utilities - Phase 3 of Accounting Foundation Migration
// Maps transaction categories to appropriate chart of accounts for journal entries

import { TransactionCategory, TRANSACTION_CATEGORIES } from '../constants/transactionCategories';
import { SYSTEM_ENTITY_CODES } from '../constants/systemEntities';

/**
 * Account mapping for journal entries
 * Each transaction type maps to specific debit/credit accounts
 */
export interface AccountMapping {
  debitAccount: string;
  creditAccount: string;
  description: string;
  requiresEntity: boolean;
  /** Entity code (not ID) for default entity - will be looked up at runtime */
  defaultEntityCode?: string;
}

/**
 * Map transaction categories to chart of accounts
 * This defines the double-entry bookkeeping rules for each transaction type
 */
export const TRANSACTION_ACCOUNT_MAPPING: Record<TransactionCategory, AccountMapping> = {
  // Customer Transactions
  [TRANSACTION_CATEGORIES.CUSTOMER_PAYMENT]: {
    debitAccount: '1100', // Cash (increases)
    creditAccount: '1200', // Accounts Receivable (decreases)
    description: 'Customer payment received',
    requiresEntity: true
  },
  
  [TRANSACTION_CATEGORIES.CUSTOMER_PAYMENT_RECEIVED]: {
    debitAccount: '1100', // Cash (increases)
    creditAccount: '1200', // Accounts Receivable (decreases)
    description: 'Customer payment received',
    requiresEntity: true
  },
  
  [TRANSACTION_CATEGORIES.CUSTOMER_CREDIT_SALE]: {
    debitAccount: '1200', // Accounts Receivable (increases)
    creditAccount: '4100', // Sales Revenue (increases)
    description: 'Credit sale to customer',
    requiresEntity: true
  },
  
  [TRANSACTION_CATEGORIES.CUSTOMER_REFUND]: {
    debitAccount: '1200', // Accounts Receivable (increases - customer owes us more or we owe them more)
    creditAccount: '1100', // Cash (decreases)
    description: 'Refund to customer',
    requiresEntity: true
  },
  
  // Supplier Transactions
  [TRANSACTION_CATEGORIES.SUPPLIER_PAYMENT]: {
    debitAccount: '2100', // Accounts Payable (decreases)
    creditAccount: '1100', // Cash (decreases)
    description: 'Payment to supplier',
    requiresEntity: true
  },
  
  [TRANSACTION_CATEGORIES.SUPPLIER_PAYMENT_RECEIVED]: {
    debitAccount: '1100', // Cash (increases)
    creditAccount: '2100', // Accounts Payable (increases)
    description: 'Payment received from supplier',
    requiresEntity: true
  },
  
  [TRANSACTION_CATEGORIES.SUPPLIER_CREDIT_SALE]: {
    debitAccount: '1300', // Inventory (increases)
    creditAccount: '2100', // Accounts Payable (increases)
    description: 'Credit purchase from supplier',
    requiresEntity: true
  },
  
  [TRANSACTION_CATEGORIES.SUPPLIER_REFUND]: {
    debitAccount: '1100', // Cash (increases)
    creditAccount: '2100', // Accounts Payable (increases - we owe supplier more)
    description: 'Refund from supplier',
    requiresEntity: true
  },
  
  [TRANSACTION_CATEGORIES.SUPPLIER_COMMISSION]: {
    debitAccount: '5900', // Miscellaneous Expense (increases)
    creditAccount: '1100', // Cash (decreases)
    description: 'Commission paid to supplier',
    requiresEntity: true
  },
  
  [TRANSACTION_CATEGORIES.SUPPLIER_PORTERAGE]: {
    debitAccount: '5900', // Miscellaneous Expense (increases)
    creditAccount: '1100', // Cash (decreases)
    description: 'Porterage fee paid to supplier',
    requiresEntity: true
  },
  
  [TRANSACTION_CATEGORIES.SUPPLIER_TRANSFER_FEE]: {
    debitAccount: '5800', // Bank Charges (increases)
    creditAccount: '1100', // Cash (decreases)
    description: 'Transfer fee for supplier payment',
    requiresEntity: true
  },
  
  [TRANSACTION_CATEGORIES.SUPPLIER_ADVANCE_GIVEN]: {
    debitAccount: '1400', // Prepaid Expenses (increases)
    creditAccount: '1100', // Cash (decreases)
    description: 'Advance given to supplier',
    requiresEntity: true
  },
  
  [TRANSACTION_CATEGORIES.SUPPLIER_ADVANCE_DEDUCTED]: {
    debitAccount: '1100', // Cash (increases)
    creditAccount: '1400', // Prepaid Expenses (decreases)
    description: 'Advance deducted from supplier payment',
    requiresEntity: true
  },
  
  // Cash Drawer Transactions
  [TRANSACTION_CATEGORIES.CASH_DRAWER_SALE]: {
    debitAccount: '1100', // Cash (increases)
    creditAccount: '4100', // Sales Revenue (increases)
    description: 'Cash sale',
    requiresEntity: false,
    defaultEntityCode: SYSTEM_ENTITY_CODES.CASH_CUSTOMER
  },
  
  [TRANSACTION_CATEGORIES.CASH_DRAWER_PAYMENT]: {
    debitAccount: '1100', // Cash (increases)
    creditAccount: '1200', // Accounts Receivable (decreases)
    description: 'Cash payment received',
    requiresEntity: false,
    defaultEntityCode: SYSTEM_ENTITY_CODES.CASH_CUSTOMER
  },
  
  [TRANSACTION_CATEGORIES.CASH_DRAWER_REFUND]: {
    debitAccount: '4100', // Sales Revenue (decreases - contra entry)
    creditAccount: '1100', // Cash (decreases)
    description: 'Cash refund issued',
    requiresEntity: false,
    defaultEntityCode: SYSTEM_ENTITY_CODES.CASH_CUSTOMER
  },
  
  [TRANSACTION_CATEGORIES.CASH_DRAWER_EXPENSE]: {
    debitAccount: '5900', // Miscellaneous Expense (increases)
    creditAccount: '1100', // Cash (decreases)
    description: 'Cash expense',
    requiresEntity: false,
    defaultEntityCode: SYSTEM_ENTITY_CODES.INTERNAL
  },
  
  // Employee Transactions
  [TRANSACTION_CATEGORIES.EMPLOYEE_PAYMENT]: {
    debitAccount: '5200', // Salaries Expense (increases)
    creditAccount: '1100', // Cash (decreases)
    description: 'Salary payment to employee',
    requiresEntity: true
  },
  
  [TRANSACTION_CATEGORIES.EMPLOYEE_PAYMENT_RECEIVED]: {
    debitAccount: '1100', // Cash (increases)
    creditAccount: '5200', // Salaries Expense (decreases - contra entry)
    description: 'Payment received from employee',
    requiresEntity: true
  },
  
  // Accounting Transactions
  [TRANSACTION_CATEGORIES.ACCOUNTS_RECEIVABLE]: {
    debitAccount: '1200', // Accounts Receivable (increases)
    creditAccount: '4100', // Sales Revenue (increases)
    description: 'Accounts receivable recorded',
    requiresEntity: true
  },
  
  [TRANSACTION_CATEGORIES.ACCOUNTS_PAYABLE]: {
    debitAccount: '5100', // Cost of Goods Sold (increases)
    creditAccount: '2100', // Accounts Payable (increases)
    description: 'Accounts payable recorded',
    requiresEntity: true
  }
};

/**
 * Get account mapping for a transaction category
 */
export function getAccountMapping(category: TransactionCategory): AccountMapping {
  const mapping = TRANSACTION_ACCOUNT_MAPPING[category];
  if (!mapping) {
    throw new Error(`No account mapping found for transaction category: ${category}`);
  }
  return mapping;
}

/**
 * Get entity code for transaction
 * Returns provided entity code or default entity code based on transaction type
 * Note: Caller must resolve entity code to actual entity ID using getSystemEntity()
 */
export function getEntityCodeForTransaction(
  category: TransactionCategory,
  providedEntityCode?: string | null
): string {
  const mapping = getAccountMapping(category);
  
  if (providedEntityCode) {
    return providedEntityCode;
  }
  
  if (!mapping.requiresEntity && mapping.defaultEntityCode) {
    return mapping.defaultEntityCode;
  }
  
  if (mapping.requiresEntity) {
    throw new Error(`Transaction category ${category} requires an entity code`);
  }
  
  // Fallback to cash customer for transactions that don't require entity
  return SYSTEM_ENTITY_CODES.CASH_CUSTOMER;
}

/**
 * Validate that an entity is appropriate for a transaction category
 */
export function validateEntityForTransaction(
  category: TransactionCategory,
  entityId: string,
  entityType: 'customer' | 'supplier' | 'employee' | 'cash' | 'internal'
): boolean {
  // Customer transactions should use customer entities
  if (category.includes('CUSTOMER') && entityType !== 'customer' && entityType !== 'cash') {
    return false;
  }
  
  // Supplier transactions should use supplier entities
  if (category.includes('SUPPLIER') && entityType !== 'supplier' && entityType !== 'cash') {
    return false;
  }
  
  // Employee transactions should use employee entities
  if (category.includes('EMPLOYEE') && entityType !== 'employee') {
    return false;
  }
  
  // Cash drawer transactions can use cash or internal entities
  if (category.includes('CASH_DRAWER') && !['cash', 'internal'].includes(entityType)) {
    return false;
  }
  
  return true;
}

/**
 * Get journal entry description for transaction
 */
export function getJournalDescription(
  category: TransactionCategory,
  entityName?: string,
  customDescription?: string
): string {
  if (customDescription) {
    return customDescription;
  }
  
  const mapping = getAccountMapping(category);
  const baseDescription = mapping.description;
  
  if (entityName) {
    return `${baseDescription} - ${entityName}`;
  }
  
  return baseDescription;
}

/**
 * Check if transaction affects cash drawer
 */
export function affectsCashDrawer(category: TransactionCategory): boolean {
  const mapping = getAccountMapping(category);
  
  // Transactions that debit or credit cash (account 1100) affect cash drawer
  return mapping.debitAccount === '1100' || mapping.creditAccount === '1100';
}

/**
 * Get cash drawer impact for transaction
 */
export function getCashDrawerImpact(
  category: TransactionCategory,
  amount: number
): number {
  if (!affectsCashDrawer(category)) {
    return 0;
  }
  
  const mapping = getAccountMapping(category);
  
  // If cash is debited, cash drawer increases
  if (mapping.debitAccount === '1100') {
    return amount;
  }
  
  // If cash is credited, cash drawer decreases
  if (mapping.creditAccount === '1100') {
    return -amount;
  }
  
  return 0;
}

/**
 * Expense account mappings for different expense types
 */
export const EXPENSE_ACCOUNT_MAPPING = {
  'rent': '5300',           // Rent Expense
  'utilities': '5400',      // Utilities Expense
  'supplies': '5500',       // Office Supplies
  'marketing': '5600',      // Marketing Expense
  'professional': '5700',   // Professional Fees
  'bank_charges': '5800',   // Bank Charges
  'miscellaneous': '5900'   // Miscellaneous Expense
} as const;

/**
 * Get expense account for expense type
 */
export function getExpenseAccount(expenseType: keyof typeof EXPENSE_ACCOUNT_MAPPING): string {
  return EXPENSE_ACCOUNT_MAPPING[expenseType];
}

/**
 * Revenue account mappings for different revenue types
 */
export const REVENUE_ACCOUNT_MAPPING = {
  'sales': '4100',          // Sales Revenue
  'services': '4200',       // Service Revenue
  'other': '4300'           // Other Income
} as const;

/**
 * Get revenue account for revenue type
 */
export function getRevenueAccount(revenueType: keyof typeof REVENUE_ACCOUNT_MAPPING): string {
  return REVENUE_ACCOUNT_MAPPING[revenueType];
}
