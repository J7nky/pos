// Chart of Accounts - Default accounting structure
// Based on ACCOUNTING_FOUNDATION_MIGRATION_PLAN.md

import { ChartOfAccounts } from '../types/accounting';

/**
 * Default chart of accounts for new stores
 * Follows standard accounting principles with Lebanese business practices
 */
export const DEFAULT_CHART_OF_ACCOUNTS: Omit<ChartOfAccounts, 'id' | 'store_id'>[] = [
  // ASSETS (1000-1999)
  {
    account_code: '1100',
    account_name: 'Cash',
    account_type: 'asset',
    requires_entity: true,  // Cash transactions require entity (customer/supplier)
    is_active: true
  },
  {
    account_code: '1200',
    account_name: 'Accounts Receivable',
    account_type: 'asset',
    requires_entity: true,  // AR always tied to specific customer
    is_active: true
  },
  {
    account_code: '1300',
    account_name: 'Inventory',
    account_type: 'asset',
    requires_entity: false, // Inventory is not tied to specific entity
    is_active: true
  },
  {
    account_code: '1400',
    account_name: 'Prepaid Expenses',
    account_type: 'asset',
    requires_entity: false,
    is_active: true
  },
  {
    account_code: '1500',
    account_name: 'Equipment',
    account_type: 'asset',
    requires_entity: false,
    is_active: true
  },

  // LIABILITIES (2000-2999)
  {
    account_code: '2100',
    account_name: 'Accounts Payable',
    account_type: 'liability',
    requires_entity: true,  // AP always tied to specific supplier
    is_active: true
  },
  {
    account_code: '2200',
    account_name: 'Salaries Payable',
    account_type: 'liability',
    requires_entity: true,  // Salaries Payable always tied to specific employee
    is_active: true
  },
  {
    account_code: '2300',
    account_name: 'Short-term Loans',
    account_type: 'liability',
    requires_entity: true,  // Loans tied to specific lender
    is_active: true
  },

  // EQUITY (3000-3999)
  {
    account_code: '3100',
    account_name: 'Owner\'s Equity',
    account_type: 'equity',
    requires_entity: false,
    is_active: true
  },
  {
    account_code: '3200',
    account_name: 'Retained Earnings',
    account_type: 'equity',
    requires_entity: false,
    is_active: true
  },

  // REVENUE (4000-4999)
  {
    account_code: '4100',
    account_name: 'Sales Revenue',
    account_type: 'revenue',
    requires_entity: true,  // Sales tied to customer
    is_active: true
  },
  {
    account_code: '4200',
    account_name: 'Service Revenue',
    account_type: 'revenue',
    requires_entity: true,
    is_active: true
  },
  {
    account_code: '4300',
    account_name: 'Other Income',
    account_type: 'revenue',
    requires_entity: false,
    is_active: true
  },

  // EXPENSES (5000-5999)
  {
    account_code: '5100',
    account_name: 'Cost of Goods Sold',
    account_type: 'expense',
    requires_entity: false,
    is_active: true
  },
  {
    account_code: '5200',
    account_name: 'Salaries Expense',
    account_type: 'expense',
    requires_entity: true,  // Salaries tied to specific employee
    is_active: true
  },
  {
    account_code: '5300',
    account_name: 'Rent Expense',
    account_type: 'expense',
    requires_entity: false,
    is_active: true
  },
  {
    account_code: '5400',
    account_name: 'Utilities Expense',
    account_type: 'expense',
    requires_entity: false,
    is_active: true
  },
  {
    account_code: '5500',
    account_name: 'Office Supplies',
    account_type: 'expense',
    requires_entity: false,
    is_active: true
  },
  {
    account_code: '5600',
    account_name: 'Marketing Expense',
    account_type: 'expense',
    requires_entity: false,
    is_active: true
  },
  {
    account_code: '5700',
    account_name: 'Professional Fees',
    account_type: 'expense',
    requires_entity: true,  // Professional fees tied to service provider
    is_active: true
  },
  {
    account_code: '5800',
    account_name: 'Bank Charges',
    account_type: 'expense',
    requires_entity: false,
    is_active: true
  },
  {
    account_code: '5900',
    account_name: 'Miscellaneous Expense',
    account_type: 'expense',
    requires_entity: false,
    is_active: true
  }
];

/**
 * Account type mappings for quick lookups
 */
export const ACCOUNT_TYPE_RANGES = {
  ASSETS: { min: 1000, max: 1999 },
  LIABILITIES: { min: 2000, max: 2999 },
  EQUITY: { min: 3000, max: 3999 },
  REVENUE: { min: 4000, max: 4999 },
  EXPENSES: { min: 5000, max: 5999 }
} as const;

/**
 * Get account type from account code
 */
export function getAccountType(accountCode: string): 'asset' | 'liability' | 'equity' | 'revenue' | 'expense' | null {
  const code = parseInt(accountCode);
  
  if (code >= ACCOUNT_TYPE_RANGES.ASSETS.min && code <= ACCOUNT_TYPE_RANGES.ASSETS.max) {
    return 'asset';
  }
  if (code >= ACCOUNT_TYPE_RANGES.LIABILITIES.min && code <= ACCOUNT_TYPE_RANGES.LIABILITIES.max) {
    return 'liability';
  }
  if (code >= ACCOUNT_TYPE_RANGES.EQUITY.min && code <= ACCOUNT_TYPE_RANGES.EQUITY.max) {
    return 'equity';
  }
  if (code >= ACCOUNT_TYPE_RANGES.REVENUE.min && code <= ACCOUNT_TYPE_RANGES.REVENUE.max) {
    return 'revenue';
  }
  if (code >= ACCOUNT_TYPE_RANGES.EXPENSES.min && code <= ACCOUNT_TYPE_RANGES.EXPENSES.max) {
    return 'expense';
  }
  
  return null;
}

/**
 * Validate account code format
 */
export function isValidAccountCode(accountCode: string): boolean {
  // Must be 4-digit number
  const regex = /^\d{4}$/;
  if (!regex.test(accountCode)) {
    return false;
  }
  
  // Must fall within valid ranges
  return getAccountType(accountCode) !== null;
}
