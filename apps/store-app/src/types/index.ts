// Multilingual data types
import type { MultilingualString } from '../utils/multilingual';
import type { BranchCore, CurrencyCode } from '@pos-platform/shared';

// Core type definitions for the ERP system
export interface User {
  id: string;
  email: string;
  name: string;
  role: 'admin' | 'manager' | 'cashier';
  store_id: string;
  created_at: string;
}

// Employee interface for admin management (extends User with additional employee fields)
export interface Employee {
  id: string;
  store_id: string;
  email: string;
  name: string;
  role: 'admin' | 'manager' | 'cashier';
  branch_id: string | null; // null for admin (can access all branches), branch ID for manager/cashier
  phone?: string | null;
  address?: string | null;
  monthly_salary?: string | null; // Monthly salary amount as a numeric string (e.g., "500.00", "1000000"). Currency lives in salary_currency.
  salary_currency?: CurrencyCode | null; // Currency code for monthly_salary; sourced from store's accepted_currencies
  // Note: Running balances are calculated from journal entries (account 2200 - Salaries Payable)
  // Use entityBalanceService.getEmployeeBalance() to get current balance
  working_hours_start?: string | null; // Format: "HH:mm" (e.g., "09:00")
  working_hours_end?: string | null; // Format: "HH:mm" (e.g., "17:00")
  working_days?: string | null; // Comma-separated days (e.g., "Monday,Tuesday,Wednesday,Thursday,Friday")
  created_at: string;
  updated_at: string;
  _synced?: boolean;
  _lastSyncedAt?: string;
  _deleted?: boolean;
}

// RBAC (Role-Based Access Control) Types
export type ModuleName = 'pos' | 'inventory' | 'accounting' | 'reports' | 'settings' | 'users';

// Operation names for permissions (includes operations and module access)
export type OperationName =
  // Module access operations
  | 'access_pos'
  | 'access_inventory'
  | 'access_accounting'
  | 'access_reports'
  | 'access_settings'
  | 'access_users'
  // POS operations
  | 'create_sale'
  | 'edit_sale'
  | 'delete_sale'
  | 'void_sale'
  | 'refund_sale'
  | 'apply_discount'
  | 'override_price'
  | 'access_cash_drawer'
  // Inventory operations
  | 'create_product'
  | 'edit_product'
  | 'delete_product'
  | 'receive_inventory'
  | 'adjust_inventory'
  | 'view_products'
  // Accounting operations
  | 'create_transaction'
  | 'edit_transaction'
  | 'delete_transaction'
  | 'view_reports'
  // User management operations
  | 'create_user'
  | 'edit_user'
  | 'delete_user'
  | 'view_users'
  | 'manage_users';

// Role permissions (GLOBAL default permissions per role - applies to ALL stores)
export interface RolePermission {
  id: string;
  role: 'admin' | 'manager' | 'cashier' | 'super_admin';
  operation: OperationName;
  allowed: boolean;
  created_at: string;
  updated_at: string;
  _synced?: boolean;
  _deleted?: boolean;
}

// User permissions (user-specific permission overrides)
export interface UserPermission {
  id: string;
  user_id: string;
  store_id: string;
  operation: OperationName;
  allowed: boolean;
  created_at: string;
  updated_at: string;
  _synced?: boolean;
  _deleted?: boolean;
}

// Permission cache structure (for in-memory caching)
export interface PermissionCache {
  userId: string;
  storeId: string;
  modules: Record<ModuleName, boolean>;
  operations: Record<OperationName, boolean>;
  limits: Record<string, never>; // Empty object - operation limits removed
  branches: string[]; // Accessible branch IDs
  expiresAt: number; // Timestamp
}

// @deprecated - Use UserPermission instead. Module access is now treated as operations (access_pos, access_inventory, etc.)
export interface UserModuleAccess {
  id: string;
  user_id: string;
  store_id: string;
  module: ModuleName;
  can_access: boolean;
  created_at: string;
  updated_at: string;
  _synced?: boolean;
  _deleted?: boolean;
}

export interface Sale {
  id: string;
  store_id: string;
  customer_id: string;
  customer_name: string;
  total_amount: number;
  payment_method: 'cash' | 'card' | 'credit';
  status: 'pending' | 'paid' | 'cancelled';
  notes: string;
  created_by: string;
  created_at: string;
  amount_paid: number;
}


export interface Branch extends BranchCore {
  logo?: string | null; // Branch logo: can be base64 (custom upload) or URL (selected global logo)
  _synced?: boolean;
  _lastSyncedAt?: string;
  _deleted?: boolean;
}

// Global logo from Supabase Storage
export interface GlobalLogo {
  name: string; // File name (without extension)
  url: string; // Public URL to the logo in Supabase Storage
  path: string; // Storage path (e.g., "global_logos/logo1.png")
}

export interface Product {
  id: string;
  name: MultilingualString; // Supports both string (backwards compatible) and multilingual object { en: "apple", ar: "تفاح", fr: "pomme" }
  /** FK into `product_categories.id` (v64+). */
  category_id?: string;
  /** @deprecated Legacy text category. Use `category_id`. */
  category?: string;
  image: string;
  is_global?: boolean; // True for predefined global products, false/undefined for store-specific
  created_at: string;
  _synced?: boolean;
  _deleted?: boolean;
}

export interface Supplier {
  id: string;
  name: string;
  phone: string;
  email?: string;
  address: string;
  /** Per-currency balance map (primary surface). Derived from journal entries. */
  balances?: Partial<Record<CurrencyCode, number>>;
  /** Per-currency advance-payment map (lives inside supplier_data JSONB). */
  advance_balances?: Partial<Record<CurrencyCode, number>>;
  /** @deprecated Use `balances.LBP`. Kept for back-compat with older readers. */
  lb_balance?: number;
  /** @deprecated Use `balances.USD`. */
  usd_balance?: number;
  /** @deprecated Use `advance_balances.LBP`. */
  advance_lb_balance?: number;
  /** @deprecated Use `advance_balances.USD`. */
  advance_usd_balance?: number;
  created_at: string;
  updated_at?: string;
  _synced?: boolean;
  _lastSyncedAt?: string;
  _deleted?: boolean;
}

export interface InventoryItem {
  id: string;
  store_id: string;
  branch_id: string;
  product_id: string;
  supplier_id?: string; // Optional: can be obtained from inventory_bills via batch_id, but may exist for legacy data
  quantity: number;
  received_quantity: number;
  /** FK into `units_of_measure.id` (v64+). */
  unit_id?: string;
  /** @deprecated Legacy unit code; dual-written. */
  unit?: string;
  weight?: number | null;
  price?: number | null;
  currency?: CurrencyCode;
  selling_price?: number | null;
  type?: string | null;
  created_at: string;
  received_at?: string | null;
  batch_id?: string | null;
  sku?: string | null;
  _synced?: boolean;
  _lastSyncedAt?: string;
  _deleted?: boolean;
}

export interface Customer {
  id: string;
  name: string;
  phone: string;
  email?: string;
  address?: string;
  /** Per-currency balance map (primary surface). Derived from journal entries. */
  balances?: Partial<Record<CurrencyCode, number>>;
  /** Per-currency credit-limit map (lives inside customer_data JSONB). */
  max_balances?: Partial<Record<CurrencyCode, number>>;
  /** @deprecated Use `balances.LBP`. */
  lb_balance: number;
  /** @deprecated Use `balances.USD`. */
  usd_balance: number;
  /** @deprecated Use `max_balances.LBP`. */
  lb_max_balance?: number;
  /** @deprecated Use `max_balances.USD`. */
  usd_max_balance?: number;
  is_active: boolean;
  created_at: string;
  updated_at?: string;
  _synced?: boolean;
  _lastSyncedAt?: string;
  _deleted?: boolean;
}

export interface inventory_bills { 
  id: string;
  store_id: string;
  branch_id: string;
  supplier_id: string;
  porterage_fee?: number | null;
  transfer_fee?: number | null;
  currency?: CurrencyCode;
  received_at: string;
  created_by: string;
  status?: string;
  created_at:string;
  notes?:string;
  commission_rate?:number | null;
  commission_amount?: number | null; // Calculated commission when bill is closed
  closed_at?: string | null; // Timestamp when bill was closed
  plastic_fee?:string;
  type:string
  _synced?: boolean;
  _lastSyncedAt?: string;
  _deleted?: boolean;
  updated_at?: string;
  // P&L fields (calculated once at bill closure, immutable)
  total_revenue?: number | null; // Revenue for the bill
  revenue_cash?: number | null; // Revenue from cash sales (sale payment method)
  revenue_card?: number | null; // Revenue from card sales (sale payment method)
  revenue_credit?: number | null; // Revenue from credit sales (sale payment method)
  total_cogs?: number | null; // Total cost of goods sold (0 for commission bills)
  gross_profit?: number | null; // Gross profit (revenue - COGS)
  gross_profit_margin?: number | null; // Profit margin percentage
}

// Bill interface - maps directly to bills table (snake_case for db compatibility)
export interface Bill {
  id: string;
  store_id: string;
  branch_id: string;
  bill_number: string;
  entity_id: string | null; // Unified field for customer_id, supplier_id, or employee_id
  payment_method: 'cash' | 'card' | 'credit';
  payment_status: 'paid' | 'partial' | 'pending';
  amount_paid: number;
  bill_date: string;
  notes: string | null;
  status: 'active' | 'cancelled' | 'refunded';
  created_by: string;
  created_at: string;
  updated_at: string;
  last_modified_by: string | null;
  /** Settlement currency (required on new bills after feature 016). */
  currency?: CurrencyCode;
  _synced?: boolean;
  _lastSyncedAt?: string;
  _deleted?: boolean;
}

// BillLineItem interface - maps directly to bill_line_items table (snake_case for db compatibility)
// Note: customer_id, payment_method, created_by are in the parent bills table
export interface BillLineItem {
  // Core identifiers
  id: string;
  store_id: string;
  branch_id: string;
  bill_id: string;
  product_id: string;
  inventory_item_id: string | null;
  
  // Quantity and pricing
  quantity: number;
  weight: number | null;
  unit_price: number;
  line_total: number;
  received_value: number;
  
  // Transaction details
  notes: string | null;
  line_order: number;
  
  // Metadata
  created_at: string;
  updated_at: string;
  
  // Sync state (for offline functionality)
  _synced: boolean;
  _lastSyncedAt?: string;
  _deleted?: boolean;
}

// Cart item - partial BillLineItem for items being added to cart
export interface CartItem extends Omit<BillLineItem, 'id' | 'created_at' | 'received_value'> {
  id?: string; // Optional for new cart items
  received_value?: number; // Optional until checkout
  created_at?: string;
}

// Database transformation types for Supabase integration
export type BillLineItemDbRow = {
  id: string;
  store_id: string;
  branch_id: string;
  bill_id: string;
  product_id: string;
  inventory_item_id: string | null;
  quantity: number;
  unit_price: number;
  line_total: number;
  weight: number | null;
  notes: string | null;
  line_order: number;
  received_value: number;
  created_at: string;
  updated_at: string;
};

export type BillLineItemDbInsert = Omit<BillLineItemDbRow, 'id' | 'created_at' | 'updated_at'> & {
  id?: string;
  created_at?: string;
  updated_at?: string;
};

export type BillLineItemDbUpdate = Partial<Omit<BillLineItemDbRow, 'id' | 'created_at' | 'updated_at' | 'store_id'>>;

// Type transformation utilities
export const BillLineItemTransforms = {
  // Convert from database row to frontend BillLineItem
  fromDbRow: (dbRow: BillLineItemDbRow): BillLineItem => ({
    id: dbRow.id,
    store_id: dbRow.store_id,
    branch_id: dbRow.branch_id,
    bill_id: dbRow.bill_id,
    inventory_item_id: dbRow.inventory_item_id,
    product_id: dbRow.product_id,
    quantity: dbRow.quantity,
    weight: dbRow.weight,
    unit_price: dbRow.unit_price,
    line_total: dbRow.line_total,
    received_value: dbRow.received_value,
    notes: dbRow.notes,
    line_order: dbRow.line_order,
    created_at: dbRow.created_at,
    updated_at: dbRow.updated_at,
    _synced: true,
    _lastSyncedAt: undefined,
    _deleted: false,
  }),

  // Convert from frontend BillLineItem to database insert
  toDbInsert: (billLineItem: BillLineItem): BillLineItemDbInsert => ({
    id: billLineItem.id,
    store_id: billLineItem.store_id,
    branch_id: billLineItem.branch_id,
    bill_id: billLineItem.bill_id,
    product_id: billLineItem.product_id,
    inventory_item_id: billLineItem.inventory_item_id,
    quantity: billLineItem.quantity,
    unit_price: billLineItem.unit_price,
    line_total: billLineItem.line_total,
    weight: billLineItem.weight,
    notes: billLineItem.notes,
    line_order: billLineItem.line_order,
    received_value: billLineItem.received_value,
  }),

  // Convert from frontend BillLineItem to database update
  toDbUpdate: (updates: Partial<BillLineItem>): BillLineItemDbUpdate => {
    const dbUpdate: BillLineItemDbUpdate = {};
    
    if (updates.inventory_item_id !== undefined) dbUpdate.inventory_item_id = updates.inventory_item_id;
    if (updates.product_id !== undefined) dbUpdate.product_id = updates.product_id;
    if (updates.quantity !== undefined) dbUpdate.quantity = updates.quantity;
    if (updates.weight !== undefined) dbUpdate.weight = updates.weight;
    if (updates.unit_price !== undefined) dbUpdate.unit_price = updates.unit_price;
    if (updates.line_total !== undefined) dbUpdate.line_total = updates.line_total;
    if (updates.received_value !== undefined) dbUpdate.received_value = updates.received_value;
    if (updates.notes !== undefined) dbUpdate.notes = updates.notes;
    
    return dbUpdate;
  },

  // Convert CartItem to BillLineItem (for checkout)
  fromCartItem: (cartItem: CartItem, id: string, billId: string, createdAt: string): BillLineItem => ({
    ...cartItem,
    id,
    bill_id: billId,
    created_at: createdAt,
    line_total: cartItem.line_total || (cartItem.quantity * cartItem.unit_price),
    received_value: cartItem.received_value || cartItem.line_total || (cartItem.quantity * cartItem.unit_price),
    _synced: false,
    _deleted: false,
  }),
};

// Added missing interfaces to match database schema

export interface AccountsReceivable {
  id: string;
  customer_id: string;
  customer_name: string;
  invoice_number: string;
  amount: number;
  amount_paid: number;
  amount_due: number;
  due_date: string;
  status: 'pending' | 'paid' | 'overdue' | 'partial';
  description?: string;
  created_at: string;
  last_payment_date?: string;
}

export interface AccountsPayable {
  id: string;
  supplier_id: string;
  supplier_name: string;
  invoice_number: string;
  amount: number;
  amount_paid: number;
  amount_due: number;
  due_date: string;
  status: 'pending' | 'paid' | 'overdue' | 'partial';
  description?: string;
  created_at: string;
  last_payment_date?: string;
}

export interface ExpenseCategory {
  id: string;
  name: string;
  description?: string;
  is_active: boolean;
  created_at: string;
}

export interface Payment {
  id: string;
  customer_id: string;
  sale_id?: string;
  amount: number;
  method: 'cash' | 'card';
  reference?: string;
  notes?: string;
  created_at: string;
  created_by: string;
}

export interface Transaction {
  
  id: string;
  type: 'income' | 'expense' | 'sale' | 'payment' | 'credit_sale';
  category: string;
  amount: number;
  currency: CurrencyCode;
  description: MultilingualString; // Supports both string (backwards compatible) and multilingual object
  reference: string | null;
  store_id: string;
  branch_id: string;
  created_by: string;
  created_at: string;
  updated_at?: string;
  entity_id?: string | null;
  metadata?: Record<string, any>;
  _synced: boolean;
  _lastSyncedAt?: string;
  _deleted?: boolean;
  is_reversal?: boolean;
  reversal_of_transaction_id?: string | null;
}

export interface CashDrawer {
  id: string;
  opening_amount: number;
  actual_amount: number;
  total_cash_sales: number;
  total_cash_payments: number;
  total_expenses: number;
  opened_at: string;
  opened_by: string;
  closed_at?: string;
  closed_by?: string;
  status: 'open' | 'closed';
}

export interface ReportParams {
  start_date: string;
  end_date: string;
  product_category?: string;
  supplier_id?: string;
  payment_status?: 'paid' | 'unpaid' | 'partial';
  include_profit?: boolean;
}

export interface StockLevel {
  product_id: string;
  product_name: string;
  current_stock: number;
  unit: string;
  last_received: string;
  suppliers: Array<{
    supplier_id: string;
    supplier_name: string;
    quantity: number;
  }>;
}

export interface StatementTransaction {
  id: string;
  date: string;
  type: 'sale' | 'payment'|'income'|'expense';
  description: string;
  // Per-currency debit/credit. Each row carries one currency natively.
  debit: number;
  credit: number;
  // Deprecated. Equals max(debit, credit). Kept so legacy callers don't crash.
  amount: number;
  quantity: number;
  weight: number;
  price: number;
  currency: CurrencyCode;
  // Per-currency running balance snapshot at this row.
  balances_after: Partial<Record<CurrencyCode, number>>;
  // Deprecated alias = balances_after[currency]. Kept for legacy print paths.
  balance_after: number;
  // Source account this row posted to (e.g. '1200' AR, '2100' AP, '2200' Salaries Payable).
  account_code?: string;
  account_name?: string;
  payment_method?: string;
  product_details?: StatementProductDetail[];
  reference?: string;
}

export interface StatementProductDetail {
  product_id: string;
  product_name: string;
  quantity: number;
  unit: string;
  unit_price: number;
  total_price: number;
  weight?: number;
  commission_rate?: number;
  commission_amount?: number;
  notes?: string;
  debit_amount?: number;
  credit_amount?: number;
  currency?: CurrencyCode;
  // Per-currency running balance snapshot AFTER this line item is applied.
  balances_after?: Partial<Record<CurrencyCode, number>>;
}

// Additional interfaces for db.ts (Dexie-specific) - matches database schema exactly
export interface Store {
  id: string;
  store_id: string;
  name: string;
  country?: string | null;
  accepted_currencies?: CurrencyCode[];
  address: string;
  phone: string;
  email: string;
  logo?: string | null;
  preferred_currency: CurrencyCode;
  preferred_language: 'en' | 'ar' | 'fr';
  preferred_commission_rate: number;
  exchange_rate: number;
  low_stock_alert: boolean;
  // Fiscal year start (v66). Defaults to (1, 1) = Jan 1. See
  // OFFLINE_HISTORY_ARCHITECTURE.md — drives statement date defaults,
  // FY-end snapshots, and FY-partitioned archives.
  fiscal_year_start_month?: number;
  fiscal_year_start_day?: number;
  created_at: string;
  updated_at: string;
  _synced: boolean;
  _lastSyncedAt?: string;
  _deleted?: boolean;
}

/**
 * One row per fiscal year per store (v66, Plan A).
 *
 * Note: the existing `FiscalPeriod` type in `types/accounting.ts` is a
 * different concept (a monthly accounting period like "2026-05"). This type
 * — a row in the `fiscal_periods` DB table — represents a whole fiscal YEAR.
 *
 * Open periods exist as soon as a fiscal year starts; they are closed by an
 * admin action (Plan C) which records `closed_at` / `closed_by` and triggers
 * the FY archive job which populates the `archive_*` fields.
 */
/**
 * Per-table archive metadata written by the C3 Edge Function and consumed
 * by C4/C5 RPCs + C6 client downloader. Mirrors the `TableArchiveResult`
 * type in `supabase/functions/export_fiscal_year_archive/index.ts`.
 */
export interface ArchiveTableMeta {
  /** Storage path under the `archives` bucket. */
  path: string;
  row_count: number;
  byte_size_gz: number;
  /** SHA-256 of the gzipped archive bytes. */
  sha256: string;
}

export interface FiscalYearPeriod {
  id: string;
  store_id: string;
  /** Plain-text identifier, e.g. "FY 2024" or "2024-25". Not multilingual. */
  fy_label: string;
  /** ISO date (YYYY-MM-DD) of the first day of the fiscal year. */
  start_date: string;
  /** ISO date (YYYY-MM-DD) of the last day of the fiscal year. */
  end_date: string;
  is_closed: boolean;
  closed_at?: string | null;
  closed_by?: string | null;
  /** Populated by Plan C archive job; NULL while open or pre-archive. */
  archive_url?: string | null;
  /** SHA-256 of the manifest.json blob written at export time. */
  archive_sha256?: string | null;
  /**
   * Per-table archive metadata written by the C3 Edge Function:
   * `{ [table]: { path, row_count, byte_size_gz, sha256 } }`. The manifest
   * RPC (C4) derives the manifest from this map.
   */
  archive_row_counts?: Record<string, ArchiveTableMeta> | null;
  /**
   * Local-only timestamp (never synced to Supabase). Set by the C6
   * `archiveHydrationService` when every table named in the manifest's
   * `tables` map has a corresponding entry in `archive_hydrated_tables`.
   * Acts as the "FY fully local" flag for `hydrateAllMissingArchives`.
   */
  archive_hydrated_at?: string | null;
  /**
   * Plan D / D1: durable per-table checkpoint. Map of `table_name → ISO
   * timestamp` recording when each archived table in the FY finished
   * streaming into Dexie. Lets a mid-FY interrupt (network drop, store
   * switch, app close) resume by skipping tables already downloaded.
   * Local-only — never uploaded.
   */
  archive_hydrated_tables?: Record<string, string> | null;
  created_at: string;
  updated_at: string;
  _synced: boolean;
  _lastSyncedAt?: string;
  _deleted?: boolean;
}

/**
 * Cash Drawer Account - Tracks physical cash drawer balances per branch
 * 
 * The `account_code` field references `chart_of_accounts.account_code` (FK relationship)
 * This links each cash drawer to a valid accounting code (typically '1100' for Cash)
 * enabling proper integration with the double-entry bookkeeping system.
 */
export interface CashDrawerAccount {
  id: string;
  store_id: string;
  branch_id: string;
  /** 
   * References chart_of_accounts.account_code (FK)
   * Typically '1100' (Cash) from the standard chart of accounts
   */
  account_code: string;
  name: string;
  currency: string;
  is_active: boolean;
  /** 
   * @deprecated COMPUTED-ONLY: Never read or write this field. 
   * Balance is calculated from journal entries (account_code = 1100) using cashDrawerUpdateService.getCurrentCashDrawerBalances().
   * Kept in schema for backward compatibility only.
   */
  current_balance?: number | null;
  /** 
   * @deprecated COMPUTED-ONLY: Never read or write this field.
   * Balance is calculated from journal entries (account_code = 1100) using calculateBothCurrencies().
   * Kept in schema for backward compatibility only.
   */
  usd_balance?: number | null;
  /** 
   * @deprecated COMPUTED-ONLY: Never read or write this field.
   * Balance is calculated from journal entries (account_code = 1100) using calculateBothCurrencies().
   * Kept in schema for backward compatibility only.
   */
  lbp_balance?: number | null;
  created_at: string;
  updated_at: string;
  _synced: boolean;
  _lastSyncedAt?: string;
  _deleted?: boolean;
}

export interface CashDrawerSession {
  id: string;
  store_id: string;
  branch_id: string;
  account_id: string;
  opened_by: string;
  opened_at: string;
  closed_at?: string;
  closed_by?: string;
  opening_amount: number;
  expected_amount?: number;
  actual_amount?: number;
  variance?: number;
  status: 'open' | 'closed';
  notes?: string;
  created_at: string;
  updated_at: string;
  _synced: boolean;
  _lastSyncedAt?: string;
  _deleted?: boolean;
}

export interface MissedProduct {
  id: string;
  store_id: string;
  branch_id: string;
  session_id: string;
  inventory_item_id: string;
  system_quantity: number;
  physical_quantity: number;
  variance: number;
  notes?: string;
  product_name: string;
  created_at: string;
  updated_at: string;
  _synced: boolean;
  _lastSyncedAt?: string;
  _deleted?: boolean;
}

/**
 * General-purpose audit log (spec: audit-logging-service).
 *
 * One row per state-changing business action, scoped to a store branch. Captures
 * an entire action in a single row via the `changes[]` JSON array — see
 * audit_log_design_decisions (decision 1). (Superseded the legacy bill-specific
 * `bill_audit_logs` table, removed in Dexie v69.)
 *
 * Append-only: rows are never updated or soft-deleted by the app. The only
 * deletion is the 4-month retention prune (decision 4). It carries no
 * `updated_at` — like `journal_entries`, it is excluded from
 * TABLES_WITH_UPDATED_AT and syncs on `created_at`.
 */
export type AuditAction =
  | 'create'
  | 'update'
  | 'delete'
  | 'void'
  | 'reactivate'
  | 'archive'
  | 'unarchive'
  | 'open'
  | 'close';

/** A single before/after field delta within an `update` action. */
export interface AuditChange {
  /** Dotted field path, e.g. 'phone' or 'customer_data.credit_limit'. */
  field: string;
  /** Previous value (JSON-serialisable). Null/absent for newly-set fields. */
  old: unknown;
  /** New value (JSON-serialisable). */
  new: unknown;
}

export interface AuditLog {
  id: string;
  store_id: string;
  /** Acting branch. Always set from session context (kept non-null so the
   *  [store_id+branch_id] compound index stays usable — IndexedDB drops nulls). */
  branch_id: string;
  /** Logical module/domain of the affected row, e.g. 'entity' | 'product' | 'bill'. */
  entity_type: string;
  /** Primary key of the affected row in its own table. */
  entity_id: string;
  action: AuditAction;
  /** Field-level deltas. Empty for create/delete; populated for update/void. */
  changes: AuditChange[];
  /** Optional human context, e.g. 'Customer returned goods'. */
  change_reason: string | null;
  /** Optional human-readable document reference for cross-navigation, e.g.
   *  'B-704053' (bill), 'PAY-12345678' (payment), 'INV-…' (received bill).
   *  Distinct from entity_id (a UUID): this is the number a user recognises. */
  reference?: string | null;
  /** User id of the actor (who). */
  changed_by: string;
  /** UTC ISO timestamp (when). */
  created_at: string;
  _synced: boolean;
  _lastSyncedAt?: string;
  _deleted?: boolean;
}

export interface SyncMetadata {
  id: string;
  table_name: string;
  last_synced_at: string;
  /** Legacy / optional token used by older sync paths */
  sync_token?: string;
  /** Last remote `version` sequence applied for this table (Dexie v55+). */
  last_synced_version: number;
  /** Store this checkpoint applies to (null = legacy row before v55 backfill). */
  store_id?: string | null;
  /** True after initial full hydration for this table completed at least once. */
  hydration_complete: boolean;
}

export interface PendingSync {
  id: string;
  table_name: string;
  record_id: string;
  operation: 'create' | 'update' | 'delete';
  created_at: string;
  retry_count: number;
  /** Row payload for create/update retries (stored by addPendingSync) */
  payload?: unknown;
  /** Last Supabase or client error message on retry */
  last_error?: string;
  /** UUID v4 generated once when the outbox row is created; sent on every upload attempt. */
  idempotency_key: string;
  status: 'pending' | 'permanently_failed';
}

// Notification types
export type NotificationType = 
  | 'low_stock'
  | 'bill_due'
  | 'payment_due'
  | 'payment_reminder'
  | 'sync_complete'
  | 'sync_error'
  | 'inventory_alert'
  | 'cash_drawer_discrepancy'
  | 'bill_ready_to_close'
  | 'reminder_due'
  | 'reminder_overdue'
  | 'reminder_upcoming'
  | 'info'
  | 'warning'
  | 'error'
  | 'success';

export interface NotificationRecord {
  id: string;
  store_id: string;
  type: NotificationType;
  title: string;
  message: string;
  read: boolean;
  priority: 'low' | 'medium' | 'high';
  action_url?: string;
  action_label?: string;
  metadata?: Record<string, any>;
  created_at: string;
  expires_at?: string;
}

export interface NotificationPreferences {
  store_id: string;
  enabled: boolean;
  enabled_types: NotificationType[];
  sound_enabled: boolean;
  show_in_app: boolean;
  auto_dismiss_seconds?: number;
  max_notifications_in_history: number;
}

// =====================================================
// UNIFIED REMINDER SYSTEM TYPES
// =====================================================

export type ReminderType = 
  | 'supplier_advance_review'
  | 'payment_due'
  | 'bill_payment'
  | 'customer_followup'
  | 'inventory_reorder'
  | 'contract_renewal'
  | 'license_expiration'
  | 'equipment_maintenance'
  | 'employee_review'
  | 'insurance_renewal'
  | 'lease_renewal'
  | 'custom';

export type ReminderEntityType = 
  | 'supplier'
  | 'customer'
  | 'transaction'
  | 'bill'
  | 'inventory'
  | 'employee'
  | 'contract'
  | 'equipment'
  | 'license'
  | 'other';

export type ReminderStatus = 
  | 'pending'
  | 'completed'
  | 'dismissed'
  | 'overdue'
  | 'snoozed';

export type RecurrencePattern = 
  | 'daily'
  | 'weekly'
  | 'monthly'
  | 'quarterly'
  | 'yearly';

// Cloud notification channels (for future use)
export interface NotificationChannels {
  in_app: boolean;
  email?: boolean;
  sms?: boolean;
  push?: boolean;
}

// Cloud notification history entry (for future use)
export interface NotificationHistoryEntry {
  sent_at: string;
  channel: 'in_app' | 'email' | 'sms' | 'push';
  status: 'pending' | 'sent' | 'delivered' | 'failed' | 'read' | 'clicked';
  provider_id?: string;
  error_message?: string;
  opened_at?: string;
  clicked_at?: string;
}

// Employee Attendance interface for check-in/check-out tracking
export interface EmployeeAttendance {
  id: string;
  store_id: string;
  branch_id: string;
  employee_id: string;
  check_in_at: string; // ISO datetime string
  check_out_at?: string | null; // ISO datetime string, null if still checked in
  notes?: string | null;
  created_at: string;
  updated_at: string;
  _synced: boolean;
  _lastSyncedAt?: string;
  _deleted?: boolean;
}

export interface Reminder {
  // Primary key and store relationship
  id: string;
  store_id: string;
  branch_id: string;
  
  // What to remind about
  type: ReminderType;
  
  // Who/what is this about (polymorphic relationship)
  entity_type: ReminderEntityType;
  entity_id: string;
  entity_name: string; // Denormalized for performance
  
  // When to remind
  due_date: string; // ISO date string
  remind_before_days: number[]; // [7, 3, 1, 0] = remind 7, 3, 1 days before and on due date
  
  
  // Status tracking
  status: ReminderStatus;
  completed_at?: string;
  completed_by?: string;
  completion_note?: string;
  snoozed_until?: string; // ISO date string
  
  // Notification tracking (for local notifications)
  last_notified_at?: string;
  notification_count: number;
  
  // Details
  title: string;
  description: string;
  priority: 'low' | 'medium' | 'high' | 'urgent';
  action_url?: string;
  
  // Metadata (flexible for type-specific data)
  metadata?: Record<string, any>;
  
  // =====================================================
  // CLOUD NOTIFICATION INFRASTRUCTURE (FUTURE USE)
  // These fields are included for future cloud notification support
  // Currently inactive but ready for activation without code changes
  // =====================================================
  
  // Notification delivery channels (for future cloud notifications)
  notification_channels?: NotificationChannels;
  
  // Cloud notification settings (INACTIVE - for future use)
  send_via_cloud?: boolean; // Set to TRUE to enable cloud notifications
  cloud_notification_sent?: boolean;
  next_cloud_notification_at?: string;
  
  // Notification history tracking (for future cloud delivery tracking)
  notification_history?: NotificationHistoryEntry[];
  
  // User targeting (who should be notified - for future multi-user support)
  notify_users?: string[]; // Array of user IDs
  notify_roles?: ('admin' | 'manager' | 'cashier')[]; // Array of roles
  
  // =====================================================
  // END CLOUD NOTIFICATION INFRASTRUCTURE
  // =====================================================
  
  // Audit fields
  created_at: string;
  created_by: string;
  updated_at: string;
  
  // Sync state (for offline functionality)
  _synced: boolean;
  _lastSyncedAt?: string;
  _deleted?: boolean;
}

// Helper type for creating reminders (omits auto-generated fields)
export type CreateReminderInput = Omit<
  Reminder,
  'id' | 'created_at' | 'updated_at' | 'notification_count' | '_synced' | '_lastSyncedAt' | '_deleted'
> & {
  id?: string;
  created_at?: string;
  updated_at?: string;
};

// Helper type for updating reminders
export type UpdateReminderInput = Partial<
  Omit<Reminder, 'id' | 'store_id' | 'created_at' | 'created_by' | '_synced' | '_lastSyncedAt'>
>;

// Reminder statistics
export interface ReminderStats {
  total: number;
  pending: number;
  overdue: number;
  due_today: number;
  due_this_week: number;
  completed: number;
  by_type: Record<ReminderType, number>;
  by_priority: Record<'low' | 'medium' | 'high' | 'urgent', number>;
}
