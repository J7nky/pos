// Accounting Foundation Types - Explicit Double-Entry with Audit Trails
// Based on ACCOUNTING_FOUNDATION_MIGRATION_PLAN.md

import type { CurrencyCode } from '@pos-platform/shared';

/**
 * Per-currency debit/credit map for a journal entry (Phase 11 generalization).
 * Each row is self-describing — the keys carry the currency identity, so
 * a row written for an AED store is always interpretable regardless of
 * the store's later configuration changes.
 */
export type JournalEntryAmounts = Partial<Record<CurrencyCode, { debit: number; credit: number }>>;

/** Per-currency running balance map for a balance snapshot (Phase 11). */
export type BalanceSnapshotMap = Partial<Record<CurrencyCode, number>>;

/**
 * Journal Entry - Source of Truth for all financial transactions
 * Every financial transaction creates at least two journal entries (debit + credit)
 *
 * Phase 11 dual-write: rows now carry both the deprecated USD/LBP scalar
 * columns and the self-describing `amounts` map. The map is the
 * authority for new code; the scalars are kept until 11d (column drop).
 */
export interface JournalEntry {
  id: string;
  store_id: string;
  branch_id: string | null;      // Future: multiple branches
  transaction_id: string;         // Groups debit + credit entries
  account_code: string;           // '1100', '1200', etc.
  account_name: string;
  /** @deprecated Phase 11 — use `amounts` map. Kept during dual-write. */
  debit_usd: number;
  /** @deprecated Phase 11 — use `amounts` map. */
  credit_usd: number;
  /** @deprecated Phase 11 — use `amounts` map. */
  debit_lbp: number;
  /** @deprecated Phase 11 — use `amounts` map. */
  credit_lbp: number;
  /** Self-describing per-currency map (Phase 11). Immutable once written. */
  amounts: JournalEntryAmounts;
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
 * Stores account balances at specific points in time.
 *
 * Phase 11 dual-write: rows now carry both the deprecated USD/LBP
 * scalar columns and the self-describing `balances` map.
 */
export interface BalanceSnapshot {
  id: string;
  store_id: string;
  branch_id: string | null;
  account_code: string;
  entity_id: string | null;
  /** @deprecated Phase 11 — use `balances` map. */
  balance_usd: number;
  /** @deprecated Phase 11 — use `balances` map. */
  balance_lbp: number;
  /** Self-describing per-currency map (Phase 11). */
  balances: BalanceSnapshotMap;
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
  skipVerification?: boolean;      // Skip verification queries when called within a transaction (prevents PrematureCommitError)
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
