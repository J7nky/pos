// Accounting Foundation Types - Explicit Double-Entry with Audit Trails
// Based on ACCOUNTING_FOUNDATION_MIGRATION_PLAN.md

/**
 * Journal Entry - Source of Truth for all financial transactions
 * Every financial transaction creates at least two journal entries (debit + credit)
 * 
 * Uses base currency fields to support both USD and LBP in a single entry
 */
export interface JournalEntry {
  id: string;
  store_id: string;
  branch_id: string | null;      // Future: multiple branches
  transaction_id: string;         // Groups debit + credit entries
  account_code: string;           // '1100', '1200', etc.
  account_name: string;
  debit_usd: number;              // USD debit amount
  credit_usd: number;              // USD credit amount
  debit_lbp: number;               // LBP debit amount
  credit_lbp: number;              // LBP credit amount
  entity_id: string;              // NEVER NULL - references entities table
  entity_type: 'customer' | 'supplier' | 'employee' | 'cash' | 'internal';
  posted_date: string;
  fiscal_period: string;
  is_posted: boolean;
  description?: string;           // Optional description for the entry
  created_at: string;
  created_by: string | null;  // User ID (UUID) - null for system-generated
  _synced: boolean;
  // New fields for reversal/reactivation tracking (replaces string parsing)
  bill_id?: string | null;        // Direct link to bill - enables fast queries
  reversal_of_journal_entry_id?: string | null;  // Links reversal entry to original entry
  entry_type?: 'original' | 'reversal' | 'reactivation';  // Explicit type instead of parsing description
}

/**
 * Balance Snapshots - Performance optimization for historical queries
 * Stores account balances at specific points in time
 */
export interface BalanceSnapshot {
  id: string;
  store_id: string;
  branch_id: string | null;
  account_code: string;
  entity_id: string | null;
  balance_usd: number;
  balance_lbp: number;
  snapshot_date: string;
  snapshot_type: 'hourly' | 'daily' | 'end_of_day';
  verified: boolean;
  created_at: string;
  _synced: boolean;
}

/**
 * Entities - Unified abstraction for customers, suppliers, employees, cash, etc.
 * Replaces separate customers/suppliers tables with unified entity management
 */
export interface Entity {
  id: string;
  store_id: string;
  branch_id: string | null;
  entity_type: 'customer' | 'supplier' | 'employee' | 'cash' | 'internal';
  entity_code: string;
  name: string;
  phone: string | null;
  is_system_entity: boolean;      // true for "Cash Customer", "Internal", etc.
  is_active: boolean;
  customer_data: object | null;   // Type-specific JSON data
  supplier_data: object | null;
  created_at: string;
  updated_at: string;
  _synced: boolean;
}

/**
 * Chart of Accounts - Configuration for account types and rules
 */
export interface ChartOfAccounts {
  id: string;
  store_id: string;
  account_code: string;           // '1100'
  account_name: string;           // 'Cash'
  account_type: 'asset' | 'liability' | 'equity' | 'revenue' | 'expense';
  requires_entity: boolean;       // Whether this account requires an entity_id
  is_active: boolean;
}

/**
 * Customer-specific data structure for entity.customer_data
 */
export interface CustomerData {
  lb_max_balance?: number;
  credit_limit?: number;
  payment_terms?: string;
  discount_rate?: number;
}

/**
 * Supplier-specific data structure for entity.supplier_data
 */
export interface SupplierData {
  type: 'commission' | 'direct';
  commission_rate?: number;
  payment_terms?: string;
  advance_lb_balance?: number;
  advance_usd_balance?: number;
}

/**
 * Employee-specific data structure for entity.employee_data
 */
export interface EmployeeData {
  email?: string;
  role?: 'admin' | 'manager' | 'cashier';
  monthly_salary?: string;
  working_hours_start?: string;
  working_hours_end?: string;
  working_days?: string;
}

/**
 * Transaction result for atomic operations
 */
export interface TransactionResult {
  success: boolean;
  transactionId: string;
  journalEntries: JournalEntry[];
  error?: string;
}

/**
 * Journal entry creation parameters
 * Supports both USD and LBP amounts in a single entry
 */
export interface CreateJournalEntryParams {
  transactionId: string;
  debitAccount: string;
  creditAccount: string;
  amountUSD?: number;              // USD amount (optional, defaults to 0)
  amountLBP?: number;              // LBP amount (optional, defaults to 0)
  entityId: string;
  description?: string;
  postedDate?: string;
  createdBy?: string | null;  // User ID (UUID) - null for system-generated
  branchId: string;  // Branch ID - required, must match transaction.branch_id
  // Legacy support - if currency/amount provided, will be converted
  amount?: number;                 // Legacy: single amount
  currency?: 'USD' | 'LBP';       // Legacy: single currency
}

/**
 * Balance calculation result
 */
export interface BalanceResult {
  USD: number;
  LBP: number;
  lastCalculated: string;
}

/**
 * Fiscal period helper type
 */
export interface FiscalPeriod {
  year: number;
  month: number;
  period: string; // Format: "YYYY-MM"
}
