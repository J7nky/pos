import Dexie, { Table } from 'dexie';
import { v4 as uuidv4 } from 'uuid';
import { generateBillReference } from '../utils/referenceGenerator';
import { PAYMENT_CATEGORIES } from '../constants/paymentCategories';
import { 
  Product, 
  Supplier, 
  Customer, 
  InventoryItem, 
  Transaction, 
  Bill, 
  BillLineItem,
  CashDrawerAccount,
  CashDrawerSession,
  MissedProduct,
  inventory_bills,
  Store,
  Branch,
  BillAuditLog,
  SyncMetadata,
  PendingSync,
  Employee,
  NotificationRecord,
  NotificationPreferences,
  Reminder,
  EmployeeAttendance,
  RolePermission,
  UserPermission,
  UserModuleAccess // @deprecated - kept for migration
} from '../types';
import { 
  JournalEntry, 
  BalanceSnapshot, 
  Entity, 
  ChartOfAccounts 
} from '../types/accounting';
import { calculateCashDrawerBalance } from '../utils/balanceCalculation';


// Base interface for all entities with sync support
interface BaseEntity {
  id: string;
  store_id: string;
  created_at: string;
  updated_at: string;
  _synced: boolean;
  _lastSyncedAt?: string;
  _deleted?: boolean;
}

// Store interface moved to /types/index.ts
// Supplier interface moved to /types/index.ts

// Customer interface moved to /types/index.ts

// InventoryItem interface moved to /types/index.ts



// LocalSaleItem interface moved to /types/index.ts

// Bill management interface for comprehensive bill operations
// Bill interface moved to /types/index.ts

// Bill line items for detailed bill management
// BillLineItem interface moved to /types/index.ts

// Bill audit trail for tracking all changes
// BillAuditLog interface moved to /types/index.ts
// Transaction interface moved to /types/index.ts

// All remaining interfaces moved to centralized type files:
// - /types/database.ts (Supabase-generated types)  
// - /types/index.ts (business logic types)



class POSDatabase extends Dexie {
  // Store configuration
  stores!: Table<Store, string>;
  branches!: Table<Branch, string>;
  
  // Core tables
  products!: Table<Product, string>;
  // suppliers!: Table<Supplier, string>; // REMOVED in v38 - migrated to entities table
  // customers!: Table<Customer, string>; // REMOVED in v38 - migrated to entities table
  inventory_items!: Table<InventoryItem, string>;
  transactions!: Table<Transaction, string>;
  inventory_bills!: Table<inventory_bills, string>;
  users!: Table<Employee, string>;

  // Bill management tables
  bills!: Table<Bill, string>;
  bill_line_items!: Table<BillLineItem, string>;
  bill_audit_logs!: Table<BillAuditLog, string>;
  // Currency management tables
  
  // Sync management tables
  sync_metadata!: Table<SyncMetadata, string>;
  pending_syncs!: Table<PendingSync, string>;
  sync_state!: Table<{ branch_id: string; last_seen_event_version: number; updated_at: string }, string>;
  cash_drawer_accounts!: Table<CashDrawerAccount, string>;
  cash_drawer_sessions!: Table<CashDrawerSession, string>;
  missed_products!: Table<MissedProduct, string>;
  notifications!: Table<NotificationRecord, string>;
  notification_preferences!: Table<NotificationPreferences, string>;
  reminders!: Table<Reminder, string>;
  employee_attendance!: Table<EmployeeAttendance, string>;
  
  // Accounting foundation tables (Phase 1)
  journal_entries!: Table<JournalEntry, string>;
  balance_snapshots!: Table<BalanceSnapshot, string>;
  entities!: Table<Entity, string>;
  chart_of_accounts!: Table<ChartOfAccounts, string>;
  
  // RBAC tables (Role-Based Access Control)
  role_permissions!: Table<RolePermission, string>;
  user_permissions!: Table<UserPermission, string>;
  user_module_access!: Table<UserModuleAccess, string>; // @deprecated - will be removed in v46
  
  // Subscription management tables (Offline licensing)
  subscriptions!: Table<any, string>; // Will be properly typed when imported
  license_validations!: Table<any, string>;
  
  // Local authentication tables
  localPasswords!: Table<{ userId: string; passwordHash: string }, string>; // Legacy table for LocalAuthService
  localCredentials!: Table<{
    userId: string;
    email: string;
    encryptedPasswordHash: string;
    iv: string;
    salt: string;
    createdAt: string;
    lastSyncedAt?: string;
    supabaseUserId?: string;
  }, string>; // Secure credential storage
  
  // Database initialization state
  private _isInitialized = false;
  private _initPromise: Promise<void> | null = null;
  
  constructor() {
    super('POSDatabase');
    
    this.version(19).stores({
      // Store configuration
      stores: 'id, name, preferred_currency, preferred_language, preferred_commission_rate, exchange_rate, updated_at',
      
      // Cash drawer tables
      cash_drawer_accounts: 'id, store_id, account_code, updated_at',
      cash_drawer_sessions: 'id, store_id, account_id, status, created_at, updated_at',
      
      // Core tables with comprehensive indexing for performance
      // Tables WITH updated_at: products, suppliers, customers, users
      products: 'id, store_id, name, category, is_global, updated_at, _synced, _deleted',
      suppliers: 'id, store_id, name, type, updated_at, lb_balance, usd_balance, advance_lb_balance, advance_usd_balance, _synced, _deleted',
      customers: 'id, store_id, name, phone, updated_at, lb_balance, usd_balance, _synced, _deleted',
      users: 'id, store_id, email, name, role, updated_at, lbp_balance, usd_balance, working_hours_start, working_hours_end, working_days, _synced, _deleted',

      // Tables WITHOUT updated_at: inventory_items, transactions
      // Note: supplier_id removed from inventory_items - get from inventory_bills via batch_id
      inventory_items: 'id, store_id, product_id, unit, quantity, weight, price, created_at, received_quantity, batch_id, selling_price, type, received_at, _synced, _deleted',
      transactions: 'id, store_id, type, category, created_at, created_by, currency, _synced, _deleted',
      inventory_bills: 'id, store_id, supplier_id, received_at, created_by, _synced, _deleted',
  
      // Bill management tables (now includes sale functionality)
      bills: 'id, store_id, bill_number, customer_id, bill_date, payment_status, status, created_by, created_at, _synced, _deleted',
      bill_line_items: 'id, store_id, bill_id, product_id, supplier_id, customer_id, payment_method, created_by, created_at, line_order, inventory_item_id, _synced, _deleted',
      bill_audit_logs: 'id, store_id, bill_id, action, changed_by, created_at, _synced, _deleted',

      // Currency management
      
      // Sync management
      sync_metadata: 'id, table_name, last_synced_at',
      pending_syncs: 'id, table_name, record_id, operation, created_at, retry_count',
      
      // Cash drawer management
      missed_products: 'id, store_id, session_id, inventory_item_id, created_at, _synced, _deleted'
    });

    // Migration for version 20 - add supplier advance balance fields
    this.version(20).stores({
      // Store configuration
      stores: 'id, name, preferred_currency, preferred_language, preferred_commission_rate, exchange_rate, updated_at',
      
      // Cash drawer tables
      cash_drawer_accounts: 'id, store_id, account_code, updated_at',
      cash_drawer_sessions: 'id, store_id, account_id, status, created_at, updated_at',
      
      // Core tables with comprehensive indexing for performance
      // Tables WITH updated_at: products, suppliers, customers, users
      products: 'id, store_id, name, category, is_global, updated_at, _synced, _deleted',
      suppliers: 'id, store_id, name, type, updated_at, lb_balance, usd_balance, advance_lb_balance, advance_usd_balance, _synced, _deleted',
      customers: 'id, store_id, name, phone, updated_at, lb_balance, usd_balance, _synced, _deleted',
      users: 'id, store_id, email, name, role, updated_at, lbp_balance, usd_balance, working_hours_start, working_hours_end, working_days, _synced, _deleted',

      // Tables WITHOUT updated_at: inventory_items, transactions
      // Note: supplier_id removed from inventory_items - get from inventory_bills via batch_id
      inventory_items: 'id, store_id, product_id, unit, quantity, weight, price, created_at, received_quantity, batch_id, selling_price, type, received_at, _synced, _deleted',
      transactions: 'id, store_id, type, category, created_at, created_by, currency, _synced, _deleted',
      inventory_bills: 'id, store_id, supplier_id, received_at, created_by, _synced, _deleted',
  
      // Bill management tables (now includes sale functionality)
      bills: 'id, store_id, bill_number, customer_id, bill_date, payment_status, status, created_by, created_at, _synced, _deleted',
      bill_line_items: 'id, store_id, bill_id, product_id, supplier_id, customer_id, payment_method, created_by, created_at, line_order, inventory_item_id, _synced, _deleted',
      bill_audit_logs: 'id, store_id, bill_id, action, changed_by, created_at, _synced, _deleted',

      // Currency management
      
      // Sync management
      sync_metadata: 'id, table_name, last_synced_at',
      pending_syncs: 'id, table_name, record_id, operation, created_at, retry_count',
      
      // Cash drawer management
      missed_products: 'id, store_id, session_id, inventory_item_id, created_at, _synced, _deleted'
    }).upgrade(trans => {
      console.log('🔄 Running migration v20: Adding supplier advance balance fields');
      
      // Update suppliers to initialize advance balance fields
      return trans.table('suppliers').toCollection().modify((supplier: any) => {
        if (supplier.advance_lb_balance === undefined || supplier.advance_lb_balance === null) {
          supplier.advance_lb_balance = 0;
        }
        if (supplier.advance_usd_balance === undefined || supplier.advance_usd_balance === null) {
          supplier.advance_usd_balance = 0;
        }
      });
    });

    // Migration for version 21 - add notifications tables
    this.version(21).stores({
      // Store configuration
      stores: 'id, name, preferred_currency, preferred_language, preferred_commission_rate, exchange_rate, updated_at',
      
      // Cash drawer tables
      cash_drawer_accounts: 'id, store_id, account_code, updated_at',
      cash_drawer_sessions: 'id, store_id, account_id, status, created_at, updated_at',
      
      // Core tables with comprehensive indexing for performance
      // Tables WITH updated_at: products, suppliers, customers, users
      products: 'id, store_id, name, category, is_global, updated_at, _synced, _deleted',
      suppliers: 'id, store_id, name, type, updated_at, lb_balance, usd_balance, advance_lb_balance, advance_usd_balance, _synced, _deleted',
      customers: 'id, store_id, name, phone, updated_at, lb_balance, usd_balance, _synced, _deleted',
      users: 'id, store_id, email, name, role, updated_at, lbp_balance, usd_balance, working_hours_start, working_hours_end, working_days, _synced, _deleted',

      // Tables WITHOUT updated_at: inventory_items, transactions
      // Note: supplier_id removed from inventory_items - get from inventory_bills via batch_id
      inventory_items: 'id, store_id, product_id, unit, quantity, weight, price, created_at, received_quantity, batch_id, selling_price, type, received_at, _synced, _deleted',
      transactions: 'id, store_id, type, category, created_at, created_by, currency, _synced, _deleted',
      inventory_bills: 'id, store_id, supplier_id, received_at, created_by, _synced, _deleted',
  
      // Bill management tables (now includes sale functionality)
      bills: 'id, store_id, bill_number, customer_id, bill_date, payment_status, status, created_by, created_at, _synced, _deleted',
      bill_line_items: 'id, store_id, bill_id, product_id, supplier_id, customer_id, payment_method, created_by, created_at, line_order, inventory_item_id, _synced, _deleted',
      bill_audit_logs: 'id, store_id, bill_id, action, changed_by, created_at, _synced, _deleted',

      // Currency management
      
      // Sync management
      sync_metadata: 'id, table_name, last_synced_at',
      pending_syncs: 'id, table_name, record_id, operation, created_at, retry_count',
      
      // Cash drawer management
      missed_products: 'id, store_id, session_id, inventory_item_id, created_at, _synced, _deleted',
      
      // Notification management
      notifications: 'id, store_id, type, read, created_at, priority',
      notification_preferences: 'store_id'
    });

    // Migration for version 22 - add customer_id and supplier_id indexes to transactions for optimized queries
    this.version(22).stores({
      // Store configuration
      stores: 'id, name, preferred_currency, preferred_language, preferred_commission_rate, exchange_rate, updated_at',
      
      // Cash drawer tables
      cash_drawer_accounts: 'id, store_id, account_code, updated_at',
      cash_drawer_sessions: 'id, store_id, account_id, status, created_at, updated_at',
      
      // Core tables with comprehensive indexing for performance
      // Tables WITH updated_at: products, suppliers, customers, users
      products: 'id, store_id, name, category, is_global, updated_at, _synced, _deleted',
      suppliers: 'id, store_id, name, type, updated_at, lb_balance, usd_balance, advance_lb_balance, advance_usd_balance, _synced, _deleted',
      customers: 'id, store_id, name, phone, updated_at, lb_balance, usd_balance, _synced, _deleted',
      users: 'id, store_id, email, name, role, updated_at, lbp_balance, usd_balance, working_hours_start, working_hours_end, working_days, _synced, _deleted',

      // Tables WITHOUT updated_at: inventory_items, transactions
      // Note: supplier_id removed from inventory_items - get from inventory_bills via batch_id
      inventory_items: 'id, store_id, product_id, unit, quantity, weight, price, created_at, received_quantity, batch_id, selling_price, type, received_at, _synced, _deleted',
      // Added customer_id and supplier_id indexes for optimized account statement queries
      transactions: 'id, store_id, type, category, created_at, created_by, currency, customer_id, supplier_id, _synced, _deleted',
      inventory_bills: 'id, store_id, supplier_id, received_at, created_by, _synced, _deleted',
  
      // Bill management tables (now includes sale functionality)
      bills: 'id, store_id, bill_number, customer_id, bill_date, payment_status, status, created_by, created_at, _synced, _deleted',
      bill_line_items: 'id, store_id, bill_id, product_id, supplier_id, customer_id, payment_method, created_by, created_at, line_order, inventory_item_id, _synced, _deleted',
      bill_audit_logs: 'id, store_id, bill_id, action, changed_by, created_at, _synced, _deleted',

      // Currency management
      
      // Sync management
      sync_metadata: 'id, table_name, last_synced_at',
      pending_syncs: 'id, table_name, record_id, operation, created_at, retry_count',
      
      // Cash drawer management
      missed_products: 'id, store_id, session_id, inventory_item_id, created_at, _synced, _deleted',
      
      // Notification management
      notifications: 'id, store_id, type, read, created_at, priority',
      notification_preferences: 'store_id'
    }).upgrade(trans => {
      console.log('🔄 Running migration v22: Adding customer_id and supplier_id indexes to transactions table');
      // No data migration needed - indexes are added automatically
    });

    // Migration for version 23 - add reminders table for unified reminder system
    this.version(23).stores({
      // Store configuration
      stores: 'id, name, preferred_currency, preferred_language, preferred_commission_rate, exchange_rate, updated_at',
      
      // Cash drawer tables
      cash_drawer_accounts: 'id, store_id, account_code, updated_at',
      cash_drawer_sessions: 'id, store_id, account_id, status, created_at, updated_at',
      
      // Core tables with comprehensive indexing for performance
      products: 'id, store_id, name, category, updated_at, _synced, _deleted',
      suppliers: 'id, store_id, name, type, updated_at, lb_balance, usd_balance, advance_lb_balance, advance_usd_balance, _synced, _deleted',
      customers: 'id, store_id, name, phone, updated_at, lb_balance, usd_balance, _synced, _deleted',
      users: 'id, store_id, email, name, role, updated_at, lbp_balance, usd_balance, working_hours_start, working_hours_end, working_days, _synced, _deleted',

      // Inventory tables
      inventory_items: 'id, store_id, product_id, unit, quantity, weight, price, created_at, received_quantity, batch_id, selling_price, type, received_at, _synced, _deleted',
      transactions: 'id, store_id, type, category, created_at, created_by, currency, customer_id, supplier_id, _synced, _deleted',
      inventory_bills: 'id, store_id, supplier_id, received_at, created_by, _synced, _deleted',
  
      // Bill management tables
      bills: 'id, store_id, bill_number, customer_id, bill_date, payment_status, status, created_by, created_at, _synced, _deleted',
      bill_line_items: 'id, store_id, bill_id, product_id, supplier_id, customer_id, payment_method, created_by, created_at, line_order, inventory_item_id, _synced, _deleted',
      bill_audit_logs: 'id, store_id, bill_id, action, changed_by, created_at, _synced, _deleted',

      // Sync management
      sync_metadata: 'id, table_name, last_synced_at',
      pending_syncs: 'id, table_name, record_id, operation, created_at, retry_count',
      
      // Cash drawer management
      missed_products: 'id, store_id, session_id, inventory_item_id, created_at, _synced, _deleted',
      
      // Notification management
      notifications: 'id, store_id, type, read, created_at, priority',
      notification_preferences: 'store_id',
      
      // Reminder management (NEW) - unified reminder system for all types of reminders
      // Indexes: id (primary), store_id, status, type, due_date, entity_type+entity_id
      reminders: 'id, store_id, status, type, due_date, entity_type, [entity_type+entity_id], created_by, updated_at, _synced, _deleted'
    }).upgrade(trans => {
      console.log('🔄 Running migration v23: Adding reminders table for unified reminder system');
      console.log('✅ Reminders table created with support for:');
      console.log('   - Supplier advance reviews');
      console.log('   - Payment reminders');
      console.log('   - Customer follow-ups');
      console.log('   - Inventory reorders');
      console.log('   - Contract renewals');
      console.log('   - Equipment maintenance');
      console.log('   - And more...');
      console.log('📢 Cloud notification infrastructure included but inactive (ready for future activation)');
      // No data migration needed for new table
    });

    // Migration for version 24 - add employee attendance tracking
    this.version(24).stores({
      // Store configuration
      stores: 'id, name, preferred_currency, preferred_language, preferred_commission_rate, exchange_rate, updated_at',
      
      // Cash drawer tables
      cash_drawer_accounts: 'id, store_id, account_code, updated_at',
      cash_drawer_sessions: 'id, store_id, account_id, status, created_at, updated_at',
      
      // Core tables with comprehensive indexing for performance
      products: 'id, store_id, name, category, updated_at, _synced, _deleted',
      suppliers: 'id, store_id, name, type, updated_at, lb_balance, usd_balance, advance_lb_balance, advance_usd_balance, _synced, _deleted',
      customers: 'id, store_id, name, phone, updated_at, lb_balance, usd_balance, _synced, _deleted',
      users: 'id, store_id, email, name, role, updated_at, lbp_balance, usd_balance, working_hours_start, working_hours_end, working_days, _synced, _deleted',

      // Inventory tables
      inventory_items: 'id, store_id, product_id, unit, quantity, weight, price, created_at, received_quantity, batch_id, selling_price, type, received_at, _synced, _deleted',
      transactions: 'id, store_id, type, category, created_at, created_by, currency, customer_id, supplier_id, _synced, _deleted',
      inventory_bills: 'id, store_id, supplier_id, received_at, created_by, _synced, _deleted',
  
      // Bill management tables
      bills: 'id, store_id, bill_number, customer_id, bill_date, payment_status, status, created_by, created_at, _synced, _deleted',
      bill_line_items: 'id, store_id, bill_id, product_id, supplier_id, customer_id, payment_method, created_by, created_at, line_order, inventory_item_id, _synced, _deleted',
      bill_audit_logs: 'id, store_id, bill_id, action, changed_by, created_at, _synced, _deleted',

      // Sync management
      sync_metadata: 'id, table_name, last_synced_at',
      pending_syncs: 'id, table_name, record_id, operation, created_at, retry_count',
      
      // Cash drawer management
      missed_products: 'id, store_id, session_id, inventory_item_id, created_at, _synced, _deleted',
      
      // Notification management
      notifications: 'id, store_id, type, read, created_at, priority',
      notification_preferences: 'store_id',
      
      // Reminder management
      reminders: 'id, store_id, status, type, due_date, entity_type, [entity_type+entity_id], created_by, updated_at, _synced, _deleted',
      
      // Employee attendance tracking (NEW)
      employee_attendance: 'id, store_id, employee_id, check_in_at, check_out_at, created_at, updated_at, _synced, _deleted'
    }).upgrade(trans => {
      console.log('🔄 Running migration v24: Adding employee attendance tracking table');
      console.log('✅ Employee attendance table created for check-in/check-out tracking');
      // No data migration needed for new table
    });

    // Migration for version 25 - add is_global field to products for predefined global products
    this.version(25).stores({
      // Store configuration
      stores: 'id, name, preferred_currency, preferred_language, preferred_commission_rate, exchange_rate, updated_at',
      
      // Cash drawer tables
      cash_drawer_accounts: 'id, store_id, account_code, updated_at',
      cash_drawer_sessions: 'id, store_id, account_id, status, created_at, updated_at',
      
      // Core tables with comprehensive indexing for performance
      products: 'id, store_id, name, category, is_global, updated_at, _synced, _deleted',
      suppliers: 'id, store_id, name, type, updated_at, lb_balance, usd_balance, advance_lb_balance, advance_usd_balance, _synced, _deleted',
      customers: 'id, store_id, name, phone, updated_at, lb_balance, usd_balance, _synced, _deleted',
      users: 'id, store_id, email, name, role, updated_at, lbp_balance, usd_balance, working_hours_start, working_hours_end, working_days, _synced, _deleted',

      // Inventory tables
      inventory_items: 'id, store_id, product_id, unit, quantity, weight, price, created_at, received_quantity, batch_id, selling_price, type, received_at, sku, _synced, _deleted',
      transactions: 'id, store_id, type, category, created_at, created_by, currency, customer_id, supplier_id, _synced, _deleted',
      inventory_bills: 'id, store_id, supplier_id, received_at, created_by, _synced, _deleted',
  
      // Bill management tables
      bills: 'id, store_id, bill_number, customer_id, bill_date, payment_status, status, created_by, created_at, _synced, _deleted',
      bill_line_items: 'id, store_id, bill_id, product_id, supplier_id, customer_id, payment_method, created_by, created_at, line_order, inventory_item_id, _synced, _deleted',
      bill_audit_logs: 'id, store_id, bill_id, action, changed_by, created_at, _synced, _deleted',

      // Sync management
      sync_metadata: 'id, table_name, last_synced_at',
      pending_syncs: 'id, table_name, record_id, operation, created_at, retry_count',
      
      // Cash drawer management
      missed_products: 'id, store_id, session_id, inventory_item_id, created_at, _synced, _deleted',
      
      // Notification management
      notifications: 'id, store_id, type, read, created_at, priority',
      notification_preferences: 'store_id',
      
      // Reminder management
      reminders: 'id, store_id, status, type, due_date, entity_type, [entity_type+entity_id], created_by, updated_at, _synced, _deleted',
      
      // Employee attendance tracking
      employee_attendance: 'id, store_id, employee_id, check_in_at, check_out_at, created_at, updated_at, _synced, _deleted'
    }).upgrade(trans => {
      console.log('🔄 Running migration v25: Adding is_global field to products table');
      console.log('   This field allows predefined global products visible across all stores');
      
      // Update existing products to set is_global = false (they are store-specific)
      return trans.table('products').toCollection().modify((product: any) => {
        if (product.is_global === undefined || product.is_global === null) {
          product.is_global = false; // Existing products are store-specific
        }
      });
    });

    // Migration for version 26 - add sku field to inventory_items for barcode tracking
    this.version(26).stores({
      // Store configuration
      stores: 'id, name, preferred_currency, preferred_language, preferred_commission_rate, exchange_rate, updated_at',
      
      // Cash drawer tables
      cash_drawer_accounts: 'id, store_id, account_code, updated_at',
      cash_drawer_sessions: 'id, store_id, account_id, status, created_at, updated_at',
      
      // Core tables with comprehensive indexing for performance
      products: 'id, store_id, name, category, is_global, updated_at, _synced, _deleted',
      suppliers: 'id, store_id, name, type, updated_at, lb_balance, usd_balance, advance_lb_balance, advance_usd_balance, _synced, _deleted',
      customers: 'id, store_id, name, phone, updated_at, lb_balance, usd_balance, _synced, _deleted',
      users: 'id, store_id, email, name, role, updated_at, lbp_balance, usd_balance, working_hours_start, working_hours_end, working_days, _synced, _deleted',

      // Inventory tables - added sku field for barcode tracking
      inventory_items: 'id, store_id, product_id, unit, quantity, weight, price, created_at, received_quantity, batch_id, selling_price, type, received_at, sku, _synced, _deleted',
      transactions: 'id, store_id, type, category, created_at, created_by, currency, customer_id, supplier_id, _synced, _deleted',
      inventory_bills: 'id, store_id, supplier_id, received_at, created_by, _synced, _deleted',
  
      // Bill management tables
      bills: 'id, store_id, bill_number, customer_id, bill_date, payment_status, status, created_by, created_at, _synced, _deleted',
      bill_line_items: 'id, store_id, bill_id, product_id, supplier_id, customer_id, payment_method, created_by, created_at, line_order, inventory_item_id, _synced, _deleted',
      bill_audit_logs: 'id, store_id, bill_id, action, changed_by, created_at, _synced, _deleted',

      // Sync management
      sync_metadata: 'id, table_name, last_synced_at',
      pending_syncs: 'id, table_name, record_id, operation, created_at, retry_count',
      
      // Cash drawer management
      missed_products: 'id, store_id, session_id, inventory_item_id, created_at, _synced, _deleted',
      
      // Notification management
      notifications: 'id, store_id, type, read, created_at, priority',
      notification_preferences: 'store_id',
      
      // Reminder management
      reminders: 'id, store_id, status, type, due_date, entity_type, [entity_type+entity_id], created_by, updated_at, _synced, _deleted',
      
      // Employee attendance tracking
      employee_attendance: 'id, store_id, employee_id, check_in_at, check_out_at, created_at, updated_at, _synced, _deleted'
    }).upgrade(trans => {
      console.log('🔄 Running migration v26: Adding sku field to inventory_items table');
      console.log('   This field stores barcodes for inventory items, generated from inventory item ID');
      // No data migration needed - new field will be null for existing items
    });

    // Migration for version 27 - add currency field to inventory tables
    this.version(27).stores({
      // Store configuration
      stores: 'id, name, preferred_currency, preferred_language, preferred_commission_rate, exchange_rate, updated_at',
      
      // Cash drawer tables
      cash_drawer_accounts: 'id, store_id, account_code, updated_at',
      cash_drawer_sessions: 'id, store_id, account_id, status, created_at, updated_at',
      
      // Core tables with comprehensive indexing for performance
      products: 'id, store_id, name, category, is_global, updated_at, _synced, _deleted',
      suppliers: 'id, store_id, name, type, updated_at, lb_balance, usd_balance, advance_lb_balance, advance_usd_balance, _synced, _deleted',
      customers: 'id, store_id, name, phone, updated_at, lb_balance, usd_balance, _synced, _deleted',
      users: 'id, store_id, email, name, role, updated_at, lbp_balance, usd_balance, working_hours_start, working_hours_end, working_days, _synced, _deleted',

      // Inventory tables - add currency index
      inventory_items: 'id, store_id, product_id, unit, quantity, weight, price, created_at, received_quantity, batch_id, selling_price, type, received_at, sku, currency, _synced, _deleted',
      transactions: 'id, store_id, type, category, created_at, created_by, currency, customer_id, supplier_id, _synced, _deleted',
      inventory_bills: 'id, store_id, supplier_id, received_at, created_by, currency, _synced, _deleted',
  
      // Bill management tables
      bills: 'id, store_id, bill_number, customer_id, bill_date, payment_status, status, created_by, created_at, _synced, _deleted',
      bill_line_items: 'id, store_id, bill_id, product_id, supplier_id, customer_id, payment_method, created_by, created_at, line_order, inventory_item_id, _synced, _deleted',
      bill_audit_logs: 'id, store_id, bill_id, action, changed_by, created_at, _synced, _deleted',

      // Sync management
      sync_metadata: 'id, table_name, last_synced_at',
      pending_syncs: 'id, table_name, record_id, operation, created_at, retry_count',
      
      // Cash drawer management
      missed_products: 'id, store_id, session_id, inventory_item_id, created_at, _synced, _deleted',
      
      // Notification management
      notifications: 'id, store_id, type, read, created_at, priority',
      notification_preferences: 'store_id',
      
      // Reminder management
      reminders: 'id, store_id, status, type, due_date, entity_type, [entity_type+entity_id], created_by, updated_at, _synced, _deleted',
      
      // Employee attendance tracking
      employee_attendance: 'id, store_id, employee_id, check_in_at, check_out_at, created_at, updated_at, _synced, _deleted'
    }).upgrade(trans => {
      console.log('🔄 Running migration v27: Adding currency fields to inventory tables');
      return (trans as any).table('stores').toArray().then((stores: any[]) => {
        const storeCurrency: Record<string, 'USD' | 'LBP'> = {};
        stores.forEach(s => { storeCurrency[s.id] = (s.preferred_currency || 'USD'); });
        return Promise.all([
          (trans as any).table('inventory_bills').toCollection().modify((bill: any) => {
            if (bill.currency === undefined || bill.currency === null) {
              bill.currency = storeCurrency[bill.store_id] || 'USD';
            }
          }),
          (trans as any).table('inventory_items').toCollection().modify((item: any) => {
            if (item.currency === undefined || item.currency === null) {
              item.currency = storeCurrency[item.store_id] || 'USD';
            }
          })
        ]);
      });
    });

    // Migration for version 28 - normalize bill_line_items schema to match actual database
    // Remove supplier_id, customer_id, payment_method, created_by from bill_line_items
    // These fields belong to the parent bills table
    this.version(28).stores({
      // Store configuration
      stores: 'id, name, preferred_currency, preferred_language, preferred_commission_rate, exchange_rate, updated_at',
      
      // Cash drawer tables
      cash_drawer_accounts: 'id, store_id, account_code, updated_at',
      cash_drawer_sessions: 'id, store_id, account_id, status, created_at, updated_at',
      
      // Core tables with comprehensive indexing for performance
      products: 'id, store_id, name, category, is_global, updated_at, _synced, _deleted',
      suppliers: 'id, store_id, name, type, updated_at, lb_balance, usd_balance, advance_lb_balance, advance_usd_balance, _synced, _deleted',
      customers: 'id, store_id, name, phone, updated_at, lb_balance, usd_balance, _synced, _deleted',
      users: 'id, store_id, email, name, role, updated_at, lbp_balance, usd_balance, working_hours_start, working_hours_end, working_days, _synced, _deleted',

      // Inventory tables
      inventory_items: 'id, store_id, product_id, unit, quantity, weight, price, created_at, received_quantity, batch_id, selling_price, type, received_at, sku, currency, _synced, _deleted',
      transactions: 'id, store_id, type, category, created_at, created_by, currency, customer_id, supplier_id, _synced, _deleted',
      inventory_bills: 'id, store_id, supplier_id, received_at, created_by, currency, _synced, _deleted',
  
      // Bill management tables - NORMALIZED SCHEMA
      // payment_method added to bills, removed supplier_id, customer_id, payment_method, created_by from bill_line_items
      bills: 'id, store_id, bill_number, customer_id, bill_date, payment_method, payment_status, status, created_by, created_at, _synced, _deleted',
      bill_line_items: 'id, store_id, bill_id, product_id, created_at, line_order, inventory_item_id, _synced, _deleted',
      bill_audit_logs: 'id, store_id, bill_id, action, changed_by, created_at, _synced, _deleted',

      // Sync management
      sync_metadata: 'id, table_name, last_synced_at',
      pending_syncs: 'id, table_name, record_id, operation, created_at, retry_count',
      
      // Cash drawer management
      missed_products: 'id, store_id, session_id, inventory_item_id, created_at, _synced, _deleted',
      
      // Notification management
      notifications: 'id, store_id, type, read, created_at, priority',
      notification_preferences: 'store_id',
      
      // Reminder management
      reminders: 'id, store_id, status, type, due_date, entity_type, [entity_type+entity_id], created_by, updated_at, _synced, _deleted',
      
      // Employee attendance tracking
      employee_attendance: 'id, store_id, employee_id, check_in_at, check_out_at, created_at, updated_at, _synced, _deleted'
    }).upgrade(trans => {
      console.log('🔄 Running migration v28: Normalizing bill_line_items schema');
      console.log('   ✅ Removed supplier_id, customer_id, payment_method, created_by from bill_line_items');
      console.log('   ✅ These fields are now accessed via JOIN with bills table');
      console.log('   ✅ Added payment_method index to bills table');
      console.log('   📢 This matches the actual Supabase database schema');
      // No data migration needed - fields are removed from indexes only
      // Data will be accessed via JOIN with bills table
    });

    // Migration for version 29 - add accounting foundation tables (Phase 1)
    this.version(29).stores({
      // Store configuration
      stores: 'id, name, preferred_currency, preferred_language, preferred_commission_rate, exchange_rate, updated_at',
      
      // Cash drawer tables
      cash_drawer_accounts: 'id, store_id, account_code, updated_at',
      cash_drawer_sessions: 'id, store_id, account_id, status, created_at, updated_at',
      
      // Core tables
      products: 'id, store_id, name, category, is_global, updated_at, _synced, _deleted',
      suppliers: 'id, store_id, name, type, updated_at, lb_balance, usd_balance, advance_lb_balance, advance_usd_balance, _synced, _deleted',
      customers: 'id, store_id, name, phone, updated_at, lb_balance, usd_balance, _synced, _deleted',
      users: 'id, store_id, email, name, role, updated_at, lbp_balance, usd_balance, working_hours_start, working_hours_end, working_days, _synced, _deleted',

      // Inventory tables
      inventory_items: 'id, store_id, product_id, unit, quantity, weight, price, created_at, received_quantity, batch_id, selling_price, type, received_at, sku, currency, _synced, _deleted',
      transactions: 'id, store_id, type, category, created_at, created_by, currency, customer_id, supplier_id, _synced, _deleted',
      inventory_bills: 'id, store_id, supplier_id, received_at, created_by, currency, _synced, _deleted',
  
      // Bill management tables
      bills: 'id, store_id, bill_number, customer_id, bill_date, payment_method, payment_status, status, created_by, created_at, _synced, _deleted',
      bill_line_items: 'id, store_id, bill_id, product_id, created_at, line_order, inventory_item_id, _synced, _deleted',
      bill_audit_logs: 'id, store_id, bill_id, action, changed_by, created_at, _synced, _deleted',

      // Sync management
      sync_metadata: 'id, table_name, last_synced_at',
      pending_syncs: 'id, table_name, record_id, operation, created_at, retry_count',
      
      // Cash drawer management
      missed_products: 'id, store_id, session_id, inventory_item_id, created_at, _synced, _deleted',
      
      // Notification management
      notifications: 'id, store_id, type, read, created_at, priority',
      notification_preferences: 'store_id',
      
      // Reminder management
      reminders: 'id, store_id, status, type, due_date, entity_type, [entity_type+entity_id], created_by, updated_at, _synced, _deleted',
      
      // Employee attendance tracking
      employee_attendance: 'id, store_id, employee_id, check_in_at, check_out_at, created_at, updated_at, _synced, _deleted',
      
      // 🔥 NEW: Accounting foundation tables (Phase 1)
      // Journal entries - source of truth for all financial transactions
      journal_entries: 'id, store_id, branch_id, transaction_id, account_code, entity_id, currency, posted_date, fiscal_period, is_posted, created_at, created_by, _synced',
      
      // Balance snapshots - performance optimization for historical queries
      balance_snapshots: 'id, store_id, branch_id, account_code, entity_id, snapshot_date, snapshot_type, verified, created_at, _synced',
      
      
      // Chart of accounts - configuration for account types
      chart_of_accounts: 'id, store_id, account_code, account_name, account_type, requires_entity, is_active'
    }).upgrade(trans => {
      console.log('🔥 Running migration v29: Adding accounting foundation tables (Phase 1)');
      console.log('   ✅ Added journal_entries table - source of truth for all financial transactions');
      console.log('   ✅ Added balance_snapshots table - performance optimization for historical queries');
      console.log('   ✅ Added entities table - unified customer/supplier/employee/cash abstraction');
      console.log('   ✅ Added chart_of_accounts table - configuration for account types');
      console.log('   📢 Phase 1 of ACCOUNTING_FOUNDATION_MIGRATION_PLAN.md complete');
      console.log('   📢 Ready for entity migration and journal entry creation');
      // No data migration needed - new tables are empty
    });

    // Migration for version 30 - add branches table
    this.version(30).stores({
      // Store configuration
      stores: 'id, name, preferred_currency, preferred_language, preferred_commission_rate, exchange_rate, updated_at',
      branches: 'id, store_id, name, updated_at, _synced, _deleted',
      
      // Cash drawer tables
      cash_drawer_accounts: 'id, store_id, account_code, updated_at',
      cash_drawer_sessions: 'id, store_id, account_id, status, created_at, updated_at',
      
      // Core tables
      products: 'id, store_id, name, category, is_global, updated_at, _synced, _deleted',
      suppliers: 'id, store_id, name, type, updated_at, lb_balance, usd_balance, advance_lb_balance, advance_usd_balance, _synced, _deleted',
      customers: 'id, store_id, name, phone, updated_at, lb_balance, usd_balance, _synced, _deleted',
      users: 'id, store_id, email, name, role, updated_at, lbp_balance, usd_balance, working_hours_start, working_hours_end, working_days, _synced, _deleted',

      // Inventory tables
      inventory_items: 'id, store_id, product_id, unit, quantity, weight, price, created_at, received_quantity, batch_id, selling_price, type, received_at, sku, currency, _synced, _deleted',
      transactions: 'id, store_id, type, category, created_at, created_by, currency, customer_id, supplier_id, _synced, _deleted',
      inventory_bills: 'id, store_id, supplier_id, received_at, created_by, currency, _synced, _deleted',
  
      // Bill management tables
      bills: 'id, store_id, bill_number, customer_id, bill_date, payment_method, payment_status, status, created_by, created_at, _synced, _deleted',
      bill_line_items: 'id, store_id, bill_id, product_id, created_at, line_order, inventory_item_id, _synced, _deleted',
      bill_audit_logs: 'id, store_id, bill_id, action, changed_by, created_at, _synced, _deleted',

      // Sync management
      sync_metadata: 'id, table_name, last_synced_at',
      pending_syncs: 'id, table_name, record_id, operation, created_at, retry_count',
      
      // Cash drawer management
      missed_products: 'id, store_id, session_id, inventory_item_id, created_at, _synced, _deleted',
      
      // Notification management
      notifications: 'id, store_id, type, read, created_at, priority',
      notification_preferences: 'store_id',
      
      // Reminder management
      reminders: 'id, store_id, status, type, due_date, entity_type, [entity_type+entity_id], created_by, updated_at, _synced, _deleted',
      
      // Employee attendance tracking
      employee_attendance: 'id, store_id, employee_id, check_in_at, check_out_at, created_at, updated_at, _synced, _deleted',
      
      // Accounting foundation tables (Phase 1)
      journal_entries: 'id, store_id, branch_id, transaction_id, account_code, entity_id, currency, posted_date, fiscal_period, is_posted, created_at, created_by, _synced',
      balance_snapshots: 'id, store_id, branch_id, account_code, entity_id, snapshot_date, snapshot_type, verified, created_at, _synced',
      entities: 'id, store_id, branch_id, entity_type, entity_code, name, phone, is_system_entity, is_active, created_at, updated_at, _synced',
      chart_of_accounts: 'id, store_id, account_code, account_name, account_type, requires_entity, is_active'
    }).upgrade(trans => {
      console.log('🔥 Running migration v30: Adding branches table');
      console.log('   ✅ Added branches table - supports multiple branches per store');
      console.log('   📢 One store can now have many branches');
      // No data migration needed - new table is empty
    });

    // Migration for version 31 - BRANCH-CENTRIC REFACTOR: Add branch_id to all operational tables
    this.version(31).stores({
      // Store configuration
      stores: 'id, name, preferred_currency, preferred_language, preferred_commission_rate, exchange_rate, updated_at',
      branches: 'id, store_id, name, updated_at, _synced, _deleted',
      
      // Cash drawer tables - NOW WITH BRANCH_ID
      cash_drawer_accounts: 'id, store_id, branch_id, account_code, updated_at',
      cash_drawer_sessions: 'id, store_id, branch_id, account_id, status, created_at, updated_at',
      
      // Core tables (store-level - NO branch_id)
      products: 'id, store_id, name, category, is_global, updated_at, _synced, _deleted',
      suppliers: 'id, store_id, name, type, updated_at, lb_balance, usd_balance, advance_lb_balance, advance_usd_balance, _synced, _deleted',
      customers: 'id, store_id, name, phone, updated_at, lb_balance, usd_balance, _synced, _deleted',
      users: 'id, store_id, email, name, role, updated_at, lbp_balance, usd_balance, working_hours_start, working_hours_end, working_days, _synced, _deleted',

      // Inventory tables - NOW WITH BRANCH_ID
      inventory_items: 'id, store_id, branch_id, product_id, unit, quantity, weight, price, created_at, received_quantity, batch_id, selling_price, type, received_at, sku, currency, _synced, _deleted',
      transactions: 'id, store_id, branch_id, type, category, created_at, created_by, currency, customer_id, supplier_id, _synced, _deleted',
      inventory_bills: 'id, store_id, branch_id, supplier_id, received_at, created_by, currency, _synced, _deleted',
  
      // Bill management tables - NOW WITH BRANCH_ID
      bills: 'id, store_id, branch_id, bill_number, customer_id, bill_date, payment_method, payment_status, status, created_by, created_at, _synced, _deleted',
      bill_line_items: 'id, store_id, branch_id, bill_id, product_id, created_at, line_order, inventory_item_id, _synced, _deleted',
      bill_audit_logs: 'id, store_id, branch_id, bill_id, action, changed_by, created_at, _synced, _deleted',

      // Sync management
      sync_metadata: 'id, table_name, last_synced_at',
      pending_syncs: 'id, table_name, record_id, operation, created_at, retry_count',
      
      // Cash drawer management - NOW WITH BRANCH_ID
      missed_products: 'id, store_id, branch_id, session_id, inventory_item_id, created_at, _synced, _deleted',
      
      // Notification management (store-level, not branch-level)
      notifications: 'id, store_id, type, read, created_at, priority',
      notification_preferences: 'store_id',
      
      // Reminder management - NOW WITH BRANCH_ID
      reminders: 'id, store_id, branch_id, status, type, due_date, entity_type, [entity_type+entity_id], created_by, updated_at, _synced, _deleted',
      
      // Employee attendance tracking - NOW WITH BRANCH_ID
      employee_attendance: 'id, store_id, branch_id, employee_id, check_in_at, check_out_at, created_at, updated_at, _synced, _deleted',
      
      // Accounting foundation tables (already have branch_id)
      journal_entries: 'id, store_id, branch_id, transaction_id, account_code, entity_id, currency, posted_date, fiscal_period, is_posted, created_at, created_by, _synced',
      balance_snapshots: 'id, store_id, branch_id, account_code, entity_id, snapshot_date, snapshot_type, verified, created_at, _synced',
      entities: 'id, store_id, branch_id, entity_type, entity_code, name, phone, is_system_entity, is_active, created_at, updated_at, _synced',
      chart_of_accounts: 'id, store_id, account_code, account_name, account_type, requires_entity, is_active'
    }).upgrade(async (trans) => {
      console.log('🔥🔥🔥 Running migration v31: BRANCH-CENTRIC ARCHITECTURE REFACTOR 🔥🔥🔥');
      console.log('   📢 This is a MAJOR architectural change');
      console.log('   📢 All operational data is now branch-scoped');
      
      try {
        // Step 1: Get all stores
        const stores = await (trans as any).table('stores').toArray();
        console.log(`   📊 Found ${stores.length} store(s)`);
        
        if (stores.length === 0) {
          console.log('   ⚠️ No stores found - skipping data migration');
          return;
        }
        
        // Step 2: Create default branch for each store
        const defaultBranchMap: Record<string, string> = {};
        
        for (const store of stores) {
          const branchId = uuidv4();
          const now = new Date().toISOString();
          
          await (trans as any).table('branches').add({
            id: branchId,
            store_id: store.id,
            name: 'Main Branch',
            address: store.address || null,
            phone: store.phone || null,
            created_at: now,
            updated_at: now,
            _synced: false,
            _deleted: false
          });
          
          defaultBranchMap[store.id] = branchId;
          console.log(`   ✅ Created default branch for store: ${store.name} (branch_id: ${branchId.substring(0, 8)}...)`);
        }
        
        // Step 3: Update all operational tables with branch_id
        const tablesToMigrate = [
          'cash_drawer_accounts',
          'cash_drawer_sessions',
          'inventory_items',
          'transactions',
          'inventory_bills',
          'bills',
          'bill_line_items',
          'bill_audit_logs',
          'missed_products',
          'reminders',
          'employee_attendance'
        ];
        
        for (const tableName of tablesToMigrate) {
          try {
            const table = (trans as any).table(tableName);
            const records = await table.toArray();
            
            if (records.length === 0) {
              continue;
            }
            
            let migratedCount = 0;
            for (const record of records) {
              if (!record.store_id) {
                console.warn(`   ⚠️  Record in ${tableName} missing store_id, skipping: ${record.id}`);
                continue;
              }
              
              const branchId = defaultBranchMap[record.store_id];
              if (!branchId) {
                console.warn(`   ⚠️  No default branch found for store_id: ${record.store_id}`);
                continue;
              }
              
              await table.update(record.id, {
                branch_id: branchId,
                _synced: false // Mark for re-sync
              });
              
              migratedCount++;
            }
            
            console.log(`   ✅ Migrated ${migratedCount} records in ${tableName}`);
          } catch (error) {
            console.error(`   ❌ Error migrating ${tableName}:`, error);
          }
        }
        
        console.log('   🎉 Migration v31 completed successfully!');
        console.log('   📢 System is now BRANCH-CENTRIC');
        console.log('   📢 Each branch operates independently with its own:');
        console.log('      - Cash drawer');
        console.log('      - Inventory');
        console.log('      - POS sessions');
        console.log('      - Transactions');
        console.log('      - Accounting entries');
        
      } catch (error) {
        console.error('   ❌ CRITICAL ERROR during migration v31:', error);
        throw error; // Re-throw to prevent database from opening with partial migration
      }
    });

    // Migration for version 32 - add subscription management tables for offline licensing
    this.version(32).stores({
      // Store configuration
      stores: 'id, name, preferred_currency, preferred_language, preferred_commission_rate, exchange_rate, updated_at',
      branches: 'id, store_id, name, updated_at, _synced, _deleted',
      
      // Core tables with comprehensive indexing for performance
      // Tables WITH updated_at: products, suppliers, customers, users
      products: 'id, store_id, branch_id, name, category, is_global, updated_at, _synced, _deleted',
      suppliers: 'id, store_id, branch_id, name, type, updated_at, lb_balance, usd_balance, advance_lb_balance, advance_usd_balance, _synced, _deleted',
      customers: 'id, store_id, branch_id, name, phone, updated_at, lb_balance, usd_balance, _synced, _deleted',
      users: 'id, store_id, branch_id, email, name, role, updated_at, lbp_balance, usd_balance, working_hours_start, working_hours_end, working_days, _synced, _deleted',

      // Tables WITHOUT updated_at: inventory_items, transactions
      inventory_items: 'id, store_id, branch_id, product_id, unit, quantity, weight, price, created_at, received_quantity, batch_id, selling_price, type, received_at, sku, currency, _synced, _deleted',
      transactions: 'id, store_id, branch_id, type, category, created_at, created_by, currency, customer_id, supplier_id, _synced, _deleted',
      inventory_bills: 'id, store_id, branch_id, supplier_id, received_at, created_by, currency, _synced, _deleted',
  
      // Bill management tables
      bills: 'id, store_id, branch_id, bill_number, customer_id, bill_date, payment_status, status, created_by, created_at, _synced, _deleted',
      bill_line_items: 'id, store_id, branch_id, bill_id, product_id, created_at, line_order, inventory_item_id, _synced, _deleted',
      bill_audit_logs: 'id, store_id, branch_id, bill_id, action, changed_by, created_at, _synced, _deleted',

      // Cash drawer tables
      cash_drawer_accounts: 'id, store_id, branch_id, account_code, updated_at',
      cash_drawer_sessions: 'id, store_id, branch_id, account_id, status, created_at, updated_at',
      missed_products: 'id, store_id, branch_id, session_id, inventory_item_id, created_at, _synced, _deleted',
      
      // Notification tables
      notifications: 'id, store_id, branch_id, type, title, created_at, read_at, _synced, _deleted',
      notification_preferences: 'id, store_id, branch_id, updated_at, _synced, _deleted',
      
      // Reminder system
      reminders: 'id, store_id, branch_id, type, title, due_date, status, created_by, created_at, updated_at, _synced, _deleted',
      
      // Employee attendance
      employee_attendance: 'id, store_id, branch_id, employee_id, check_in_at, check_out_at, created_at, updated_at, _synced, _deleted',
      
      // Accounting foundation tables
      journal_entries: 'id, store_id, branch_id, transaction_date, created_at, _synced, _deleted',
      balance_snapshots: 'id, store_id, branch_id, entity_id, snapshot_date, created_at, _synced, _deleted',
      entities: 'id, store_id, branch_id, entity_type, name, updated_at, _synced, _deleted',
      chart_of_accounts: 'id, store_id, branch_id, account_code, account_name, updated_at, _synced, _deleted',
      
      // Sync management
      sync_metadata: 'id, table_name, last_synced_at',
      pending_syncs: 'id, table_name, record_id, operation, created_at, retry_count',
      
      // NEW: Subscription management tables for offline licensing
      subscriptions: 'id, store_id, tier, status, expires_at, last_validated_at, created_at, updated_at, _synced',
      license_validations: 'id, store_id, subscription_id, validation_type, validation_result, created_at'
    });

    // Migration for version 33 - Link cash_drawer_accounts to chart_of_accounts via account_code
    // This establishes referential integrity between cash drawers and the accounting system
    this.version(33).stores({
      // Store configuration
      stores: 'id, name, preferred_currency, preferred_language, preferred_commission_rate, exchange_rate, updated_at',
      branches: 'id, store_id, name, updated_at, _synced, _deleted',
      
      // Core tables
      products: 'id, store_id, branch_id, name, category, is_global, updated_at, _synced, _deleted',
      suppliers: 'id, store_id, branch_id, name, type, updated_at, lb_balance, usd_balance, advance_lb_balance, advance_usd_balance, _synced, _deleted',
      customers: 'id, store_id, branch_id, name, phone, updated_at, lb_balance, usd_balance, _synced, _deleted',
      users: 'id, store_id, branch_id, email, name, role, updated_at, lbp_balance, usd_balance, working_hours_start, working_hours_end, working_days, _synced, _deleted',

      // Inventory tables
      inventory_items: 'id, store_id, branch_id, product_id, unit, quantity, weight, price, created_at, received_quantity, batch_id, selling_price, type, received_at, sku, currency, _synced, _deleted',
      transactions: 'id, store_id, branch_id, type, category, created_at, created_by, currency, customer_id, supplier_id, _synced, _deleted',
      inventory_bills: 'id, store_id, branch_id, supplier_id, received_at, created_by, currency, _synced, _deleted',
  
      // Bill management tables
      bills: 'id, store_id, branch_id, bill_number, customer_id, bill_date, payment_status, status, created_by, created_at, _synced, _deleted',
      bill_line_items: 'id, store_id, branch_id, bill_id, product_id, created_at, line_order, inventory_item_id, _synced, _deleted',
      bill_audit_logs: 'id, store_id, branch_id, bill_id, action, changed_by, created_at, _synced, _deleted',

      // Cash drawer tables - account_code now references chart_of_accounts
      // Added compound indexes for FK relationships and queries
      cash_drawer_accounts: 'id, store_id, branch_id, account_code, [store_id+branch_id], [store_id+account_code], updated_at',
      cash_drawer_sessions: 'id, store_id, branch_id, account_id, status, [store_id+branch_id], created_at, updated_at',
      missed_products: 'id, store_id, branch_id, session_id, inventory_item_id, created_at, _synced, _deleted',
      
      // Notification tables
      notifications: 'id, store_id, branch_id, type, title, created_at, read_at, _synced, _deleted',
      notification_preferences: 'id, store_id, branch_id, updated_at, _synced, _deleted',
      
      // Reminder system
      reminders: 'id, store_id, branch_id, type, title, due_date, status, created_by, created_at, updated_at, _synced, _deleted',
      
      // Employee attendance
      employee_attendance: 'id, store_id, branch_id, employee_id, check_in_at, check_out_at, created_at, updated_at, _synced, _deleted',
      
      // Accounting foundation tables - chart_of_accounts has compound index for FK
      journal_entries: 'id, store_id, branch_id, transaction_date, created_at, _synced, _deleted',
      balance_snapshots: 'id, store_id, branch_id, entity_id, snapshot_date, created_at, _synced, _deleted',
      entities: 'id, store_id, branch_id, entity_type, name, updated_at, _synced, _deleted',
      chart_of_accounts: 'id, store_id, branch_id, account_code, [store_id+account_code], account_name, updated_at, _synced, _deleted',
      
      // Sync management
      sync_metadata: 'id, table_name, last_synced_at',
      pending_syncs: 'id, table_name, record_id, operation, created_at, retry_count',
      
      // Subscription management tables
      subscriptions: 'id, store_id, tier, status, expires_at, last_validated_at, created_at, updated_at, _synced',
      license_validations: 'id, store_id, subscription_id, validation_type, validation_result, created_at'
    }).upgrade(async (trans) => {
      console.log('🔗 Running migration v33: Linking cash_drawer_accounts to chart_of_accounts');
      
      try {
        // Get all cash drawer accounts
        const cashDrawerAccounts = await (trans as any).table('cash_drawer_accounts').toArray();
        
        // Validate each account has a valid account_code in chart_of_accounts
        for (const account of cashDrawerAccounts) {
          if (!account.account_code) {
            // Default to '1100' (Cash) if no account_code
            await (trans as any).table('cash_drawer_accounts').update(account.id, {
              account_code: '1100',
              _synced: false
            });
            console.log(`   ✅ Set default account_code '1100' for drawer: ${account.name || account.id}`);
          } else {
            // Verify the account_code exists in chart_of_accounts
            const chartAccount = await (trans as any).table('chart_of_accounts')
              .where(['store_id', 'account_code'])
              .equals([account.store_id, account.account_code])
              .first();
            
            if (!chartAccount) {
              console.warn(`   ⚠️ Cash drawer ${account.id} has account_code '${account.account_code}' not found in chart_of_accounts`);
              // Default to '1100' (Cash) for safety
              await (trans as any).table('cash_drawer_accounts').update(account.id, {
                account_code: '1100',
                _synced: false
              });
              console.log(`   ✅ Reset to default account_code '1100' for drawer: ${account.name || account.id}`);
            }
          }
        }
        
        console.log('   🎉 Migration v33 completed successfully!');
        console.log('   📢 cash_drawer_accounts.account_code now references chart_of_accounts');
        console.log('   📢 This enables proper accounting integration for cash drawers');
        
      } catch (error) {
        console.error('   ❌ Error during migration v33:', error);
        // Don't throw - allow migration to complete even if validation fails
      }
    });

    // Migration for version 34 - Fix missing compound index for cash_drawer_accounts queries
    this.version(34).stores({
      // Store configuration
      stores: 'id, name, preferred_currency, preferred_language, preferred_commission_rate, exchange_rate, updated_at',
      branches: 'id, store_id, name, updated_at, _synced, _deleted',
      
      // Core tables
      products: 'id, store_id, branch_id, name, category, is_global, updated_at, _synced, _deleted',
      suppliers: 'id, store_id, branch_id, name, type, updated_at, lb_balance, usd_balance, advance_lb_balance, advance_usd_balance, _synced, _deleted',
      customers: 'id, store_id, branch_id, name, phone, updated_at, lb_balance, usd_balance, _synced, _deleted',
      users: 'id, store_id, branch_id, email, name, role, updated_at, lbp_balance, usd_balance, working_hours_start, working_hours_end, working_days, _synced, _deleted',

      // Inventory tables
      inventory_items: 'id, store_id, branch_id, product_id, unit, quantity, weight, price, created_at, received_quantity, batch_id, selling_price, type, received_at, sku, currency, _synced, _deleted',
      transactions: 'id, store_id, branch_id, type, category, created_at, created_by, currency, customer_id, supplier_id, _synced, _deleted',
      inventory_bills: 'id, store_id, branch_id, supplier_id, received_at, created_by, currency, _synced, _deleted',
  
      // Bill management tables
      bills: 'id, store_id, branch_id, bill_number, customer_id, bill_date, payment_method, payment_status, status, created_by, created_at, _synced, _deleted',
      bill_line_items: 'id, store_id, branch_id, bill_id, product_id, created_at, line_order, inventory_item_id, _synced, _deleted',
      bill_audit_logs: 'id, store_id, branch_id, bill_id, action, changed_by, created_at, _synced, _deleted',

      // Cash drawer tables - FIXED: Added missing [store_id+branch_id] compound index
      cash_drawer_accounts: 'id, store_id, branch_id, account_code, [store_id+branch_id], [store_id+account_code], updated_at',
      cash_drawer_sessions: 'id, store_id, branch_id, account_id, status, [store_id+branch_id], created_at, updated_at',
      missed_products: 'id, store_id, branch_id, session_id, inventory_item_id, created_at, _synced, _deleted',
      
      // Notification tables
      notifications: 'id, store_id, branch_id, type, title, created_at, read_at, _synced, _deleted',
      notification_preferences: 'id, store_id, branch_id, updated_at, _synced, _deleted',
      
      // Reminder system
      reminders: 'id, store_id, branch_id, type, title, due_date, status, created_by, created_at, updated_at, _synced, _deleted',
      
      // Employee attendance
      employee_attendance: 'id, store_id, branch_id, employee_id, check_in_at, check_out_at, created_at, updated_at, _synced, _deleted',
      
      // Accounting foundation tables
      journal_entries: 'id, store_id, branch_id, transaction_date, created_at, _synced, _deleted',
      balance_snapshots: 'id, store_id, branch_id, entity_id, snapshot_date, created_at, _synced, _deleted',
      entities: 'id, store_id, branch_id, entity_type, name, updated_at, _synced, _deleted',
      chart_of_accounts: 'id, store_id, branch_id, account_code, [store_id+account_code], account_name, updated_at, _synced, _deleted',
      
      // Sync management
      sync_metadata: 'id, table_name, last_synced_at',
      pending_syncs: 'id, table_name, record_id, operation, created_at, retry_count',
      
      // Subscription management tables
      subscriptions: 'id, store_id, tier, status, expires_at, last_validated_at, created_at, updated_at, _synced',
      license_validations: 'id, store_id, subscription_id, validation_type, validation_result, created_at'
    }).upgrade(trans => {
      console.log('🔧 Running migration v34: Fix cash_drawer_accounts compound index');
      console.log('   ✅ Added missing [store_id+branch_id] compound index');
      console.log('   📢 This fixes Dexie SchemaError for cash drawer queries');
      // No data migration needed - just index schema fix
    });

    // Version 35 - Add missing [store_id+branch_id] compound index to cash_drawer_sessions
    this.version(35).stores({
      // Store configuration
      stores: 'id, name, preferred_currency, preferred_language, preferred_commission_rate, exchange_rate, updated_at',
      branches: 'id, store_id, name, updated_at, _synced, _deleted',
      
      // Core tables
      products: 'id, store_id, branch_id, name, category, is_global, updated_at, _synced, _deleted',
      suppliers: 'id, store_id, branch_id, name, type, updated_at, lb_balance, usd_balance, advance_lb_balance, advance_usd_balance, _synced, _deleted',
      customers: 'id, store_id, branch_id, name, phone, updated_at, lb_balance, usd_balance, _synced, _deleted',
      users: 'id, store_id, branch_id, email, name, role, updated_at, lbp_balance, usd_balance, working_hours_start, working_hours_end, working_days, _synced, _deleted',

      // Inventory tables
      inventory_items: 'id, store_id, branch_id, product_id, unit, quantity, weight, price, created_at, received_quantity, batch_id, selling_price, type, received_at, sku, currency, _synced, _deleted',
      transactions: 'id, store_id, branch_id, type, category, created_at, created_by, currency, customer_id, supplier_id, _synced, _deleted',
      inventory_bills: 'id, store_id, branch_id, supplier_id, received_at, created_by, currency, _synced, _deleted',
  
      // Bill management tables
      bills: 'id, store_id, branch_id, bill_number, customer_id, bill_date, payment_method, payment_status, status, created_by, created_at, _synced, _deleted',
      bill_line_items: 'id, store_id, branch_id, bill_id, product_id, created_at, line_order, inventory_item_id, _synced, _deleted',
      bill_audit_logs: 'id, store_id, branch_id, bill_id, action, changed_by, created_at, _synced, _deleted',

      // Cash drawer tables - FIXED: Added [store_id+branch_id] compound index to cash_drawer_sessions
      cash_drawer_accounts: 'id, store_id, branch_id, account_code, [store_id+branch_id], [store_id+account_code], updated_at',
      cash_drawer_sessions: 'id, store_id, branch_id, account_id, status, [store_id+branch_id], created_at, updated_at',
      missed_products: 'id, store_id, branch_id, session_id, inventory_item_id, created_at, _synced, _deleted',
      
      // Notification tables
      notifications: 'id, store_id, branch_id, type, title, created_at, read_at, _synced, _deleted',
      notification_preferences: 'id, store_id, branch_id, updated_at, _synced, _deleted',
      
      // Reminder system
      reminders: 'id, store_id, branch_id, type, title, due_date, status, created_by, created_at, updated_at, _synced, _deleted',
      
      // Employee attendance
      employee_attendance: 'id, store_id, branch_id, employee_id, check_in_at, check_out_at, created_at, updated_at, _synced, _deleted',
      
      // Accounting foundation tables
      journal_entries: 'id, store_id, branch_id, transaction_date, created_at, _synced, _deleted',
      balance_snapshots: 'id, store_id, branch_id, entity_id, snapshot_date, created_at, _synced, _deleted',
      entities: 'id, store_id, branch_id, entity_type, name, updated_at, _synced, _deleted',
      chart_of_accounts: 'id, store_id, branch_id, account_code, [store_id+account_code], account_name, updated_at, _synced, _deleted',
      
      // Sync management
      sync_metadata: 'id, table_name, last_synced_at',
      pending_syncs: 'id, table_name, record_id, operation, created_at, retry_count',
      
      // Subscription management tables
      subscriptions: 'id, store_id, tier, status, expires_at, last_validated_at, created_at, updated_at, _synced',
      license_validations: 'id, store_id, subscription_id, validation_type, validation_result, created_at'
    }).upgrade(trans => {
      console.log('🔧 Running migration v35: Add [store_id+branch_id] compound index to cash_drawer_sessions');
      console.log('   ✅ Added missing compound index to fix Dexie SchemaError');
      console.log('   📢 This fixes "KeyPath [store_id+branch_id] on object store cash_drawer_sessions is not indexed" error');
      // No data migration needed - just index schema fix
    });

    // Version 36 - Add missing [store_id+branch_id] compound indexes to all branch-scoped tables
    this.version(36).stores({
      // Store configuration
      stores: 'id, name, preferred_currency, preferred_language, preferred_commission_rate, exchange_rate, updated_at',
      branches: 'id, store_id, name, updated_at, _synced, _deleted',
      
      // Core tables
      products: 'id, store_id, branch_id, name, category, is_global, updated_at, _synced, _deleted',
      suppliers: 'id, store_id, branch_id, name, type, updated_at, lb_balance, usd_balance, advance_lb_balance, advance_usd_balance, _synced, _deleted',
      customers: 'id, store_id, branch_id, name, phone, updated_at, lb_balance, usd_balance, _synced, _deleted',
      users: 'id, store_id, branch_id, email, name, role, updated_at, lbp_balance, usd_balance, working_hours_start, working_hours_end, working_days, _synced, _deleted',

      // Inventory tables - FIXED: Added [store_id+branch_id] compound index
      inventory_items: 'id, store_id, branch_id, product_id, unit, quantity, weight, price, created_at, received_quantity, batch_id, selling_price, type, received_at, sku, currency, [store_id+branch_id], _synced, _deleted',
      transactions: 'id, store_id, branch_id, type, category, created_at, created_by, currency, customer_id, supplier_id, [store_id+branch_id], _synced, _deleted',
      inventory_bills: 'id, store_id, branch_id, supplier_id, received_at, created_by, currency, [store_id+branch_id], _synced, _deleted',
  
      // Bill management tables - FIXED: Added [store_id+branch_id] compound index
      bills: 'id, store_id, branch_id, bill_number, customer_id, bill_date, payment_method, payment_status, status, created_by, created_at, [store_id+branch_id], _synced, _deleted',
      bill_line_items: 'id, store_id, branch_id, bill_id, product_id, created_at, line_order, inventory_item_id, [store_id+branch_id], _synced, _deleted',
      bill_audit_logs: 'id, store_id, branch_id, bill_id, action, changed_by, created_at, [store_id+branch_id], _synced, _deleted',

      // Cash drawer tables
      cash_drawer_accounts: 'id, store_id, branch_id, account_code, [store_id+branch_id], [store_id+account_code], updated_at',
      cash_drawer_sessions: 'id, store_id, branch_id, account_id, status, [store_id+branch_id], created_at, updated_at',
      missed_products: 'id, store_id, branch_id, session_id, inventory_item_id, created_at, [store_id+branch_id], _synced, _deleted',
      
      // Notification tables
      notifications: 'id, store_id, branch_id, type, title, created_at, read_at, _synced, _deleted',
      notification_preferences: 'id, store_id, branch_id, updated_at, _synced, _deleted',
      
      // Reminder system
      reminders: 'id, store_id, branch_id, type, title, due_date, status, created_by, created_at, updated_at, _synced, _deleted',
      
      // Employee attendance
      employee_attendance: 'id, store_id, branch_id, employee_id, check_in_at, check_out_at, created_at, updated_at, _synced, _deleted',
      
      // Accounting foundation tables - FIXED: Added [store_id+branch_id] compound index
      journal_entries: 'id, store_id, branch_id, transaction_date, created_at, [store_id+branch_id], _synced, _deleted',
      balance_snapshots: 'id, store_id, branch_id, entity_id, snapshot_date, created_at, [store_id+branch_id], _synced, _deleted',
      entities: 'id, store_id, branch_id, entity_type, name, updated_at, [store_id+branch_id], _synced, _deleted',
      chart_of_accounts: 'id, store_id, branch_id, account_code, [store_id+account_code], account_name, updated_at, _synced, _deleted',
      
      // Sync management
      sync_metadata: 'id, table_name, last_synced_at',
      pending_syncs: 'id, table_name, record_id, operation, created_at, retry_count',
      
      // Subscription management tables
      subscriptions: 'id, store_id, tier, status, expires_at, last_validated_at, created_at, updated_at, _synced',
      license_validations: 'id, store_id, subscription_id, validation_type, validation_result, created_at'
    }).upgrade(trans => {
      console.log('🔧 Running migration v36: Add [store_id+branch_id] compound indexes to branch-scoped tables');
      console.log('   ✅ Added missing compound indexes to:');
      console.log('      - inventory_items');
      console.log('      - transactions');
      console.log('      - inventory_bills');
      console.log('      - bills');
      console.log('      - bill_line_items');
      console.log('      - bill_audit_logs');
      console.log('      - missed_products');
      console.log('      - journal_entries');
      console.log('      - balance_snapshots');
      console.log('      - entities');
      console.log('   📢 This fixes Dexie SchemaError for getEntitiesByStoreBranch queries');
      // No data migration needed - just index schema fix
    });

    this.version(37).stores({
      // Store configuration
      stores: 'id, name, preferred_currency, preferred_language, preferred_commission_rate, exchange_rate, updated_at',
      branches: 'id, store_id, name, updated_at, _synced, _deleted',
      
      // Core tables
      products: 'id, store_id, branch_id, name, category, is_global, updated_at, _synced, _deleted',
      suppliers: 'id, store_id, branch_id, name, type, updated_at, lb_balance, usd_balance, advance_lb_balance, advance_usd_balance, _synced, _deleted',
      customers: 'id, store_id, branch_id, name, phone, updated_at, lb_balance, usd_balance, _synced, _deleted',
      users: 'id, store_id, branch_id, email, name, role, updated_at, lbp_balance, usd_balance, working_hours_start, working_hours_end, working_days, _synced, _deleted',

      // Inventory tables
      inventory_items: 'id, store_id, branch_id, product_id, unit, quantity, weight, price, created_at, received_quantity, batch_id, selling_price, type, received_at, sku, currency, [store_id+branch_id], _synced, _deleted',
      transactions: 'id, store_id, branch_id, type, category, created_at, created_by, currency, customer_id, supplier_id, [store_id+branch_id], _synced, _deleted',
      inventory_bills: 'id, store_id, branch_id, supplier_id, received_at, created_by, currency, [store_id+branch_id], _synced, _deleted',
  
      // Bill management tables
      bills: 'id, store_id, branch_id, bill_number, customer_id, bill_date, payment_method, payment_status, status, created_by, created_at, [store_id+branch_id], _synced, _deleted',
      bill_line_items: 'id, store_id, branch_id, bill_id, product_id, created_at, line_order, inventory_item_id, [store_id+branch_id], _synced, _deleted',
      bill_audit_logs: 'id, store_id, branch_id, bill_id, action, changed_by, created_at, [store_id+branch_id], _synced, _deleted',

      // Cash drawer tables
      cash_drawer_accounts: 'id, store_id, branch_id, account_code, [store_id+branch_id], [store_id+account_code], updated_at',
      cash_drawer_sessions: 'id, store_id, branch_id, account_id, status, [store_id+branch_id], created_at, updated_at',
      missed_products: 'id, store_id, branch_id, session_id, inventory_item_id, created_at, [store_id+branch_id], _synced, _deleted',
      
      // Notification tables
      notifications: 'id, store_id, branch_id, type, title, created_at, read_at, _synced, _deleted',
      notification_preferences: 'id, store_id, branch_id, updated_at, _synced, _deleted',
      
      // Reminder system
      reminders: 'id, store_id, branch_id, type, title, due_date, status, created_by, created_at, updated_at, _synced, _deleted',
      
      // Employee attendance
      employee_attendance: 'id, store_id, branch_id, employee_id, check_in_at, check_out_at, created_at, updated_at, _synced, _deleted',
      
      // Accounting foundation tables - FIXED: Added [store_id+entity_type] compound index for entity queries
      journal_entries: 'id, store_id, branch_id, transaction_date, created_at, [store_id+branch_id], _synced, _deleted',
      balance_snapshots: 'id, store_id, branch_id, entity_id, snapshot_date, created_at, [store_id+branch_id], _synced, _deleted',
      entities: 'id, store_id, branch_id, entity_type, name, updated_at, [store_id+branch_id], [store_id+entity_type], _synced, _deleted',
      chart_of_accounts: 'id, store_id, branch_id, account_code, [store_id+account_code], account_name, updated_at, _synced, _deleted',
      
      // Sync management
      sync_metadata: 'id, table_name, last_synced_at',
      pending_syncs: 'id, table_name, record_id, operation, created_at, retry_count',
      
      // Subscription management tables
      subscriptions: 'id, store_id, tier, status, expires_at, last_validated_at, created_at, updated_at, _synced',
      license_validations: 'id, store_id, subscription_id, validation_type, validation_result, created_at'
    }).upgrade(trans => {
      console.log('🔧 Running migration v37: Add [store_id+entity_type] compound index to entities table');
      console.log('   ✅ Added [store_id+entity_type] compound index to entities table');
      console.log('   📢 This fixes Dexie SchemaError for getEntitiesByType queries');
      // No data migration needed - just index schema fix
    });

    this.version(38).stores({
      // Store configuration
      stores: 'id, name, preferred_currency, preferred_language, preferred_commission_rate, exchange_rate, updated_at',
      branches: 'id, store_id, name, is_active, updated_at, _synced, _deleted',
      
      // Core tables - REMOVED: customers and suppliers (migrated to entities table)
      products: 'id, store_id, branch_id, name, category, is_global, updated_at, _synced, _deleted',
      // suppliers: REMOVED - migrated to entities table
      // customers: REMOVED - migrated to entities table
      users: 'id, store_id, branch_id, email, name, role, updated_at, lbp_balance, usd_balance, working_hours_start, working_hours_end, working_days, _synced, _deleted',

      // Inventory tables
      inventory_items: 'id, store_id, branch_id, product_id, unit, quantity, weight, price, created_at, received_quantity, batch_id, selling_price, type, received_at, sku, currency, [store_id+branch_id], _synced, _deleted',
      transactions: 'id, store_id, branch_id, type, category, created_at, created_by, currency, customer_id, supplier_id, [store_id+branch_id], _synced, _deleted',
      inventory_bills: 'id, store_id, branch_id, supplier_id, received_at, created_by, currency, [store_id+branch_id], _synced, _deleted',
  
      // Bill management tables
      bills: 'id, store_id, branch_id, bill_number, customer_id, bill_date, payment_method, payment_status, status, created_by, created_at, [store_id+branch_id], _synced, _deleted',
      bill_line_items: 'id, store_id, branch_id, bill_id, product_id, created_at, line_order, inventory_item_id, [store_id+branch_id], _synced, _deleted',
      bill_audit_logs: 'id, store_id, branch_id, bill_id, action, changed_by, created_at, [store_id+branch_id], _synced, _deleted',

      // Cash drawer tables
      cash_drawer_accounts: 'id, store_id, branch_id, account_code, [store_id+branch_id], [store_id+account_code], updated_at',
      cash_drawer_sessions: 'id, store_id, branch_id, account_id, status, [store_id+branch_id], created_at, updated_at',
      missed_products: 'id, store_id, branch_id, session_id, inventory_item_id, created_at, [store_id+branch_id], _synced, _deleted',
      
      // Notification tables
      notifications: 'id, store_id, branch_id, type, title, created_at, read_at, _synced, _deleted',
      notification_preferences: 'id, store_id, branch_id, updated_at, _synced, _deleted',
      
      // Reminder system
      reminders: 'id, store_id, branch_id, type, title, due_date, status, created_by, created_at, updated_at, _synced, _deleted',
      
      // Employee attendance
      employee_attendance: 'id, store_id, branch_id, employee_id, check_in_at, check_out_at, created_at, updated_at, _synced, _deleted',
      
      // Accounting foundation tables - Entities table replaces customers/suppliers
      journal_entries: 'id, store_id, branch_id, transaction_date, created_at, [store_id+branch_id], _synced, _deleted',
      balance_snapshots: 'id, store_id, branch_id, entity_id, snapshot_date, created_at, [store_id+branch_id], _synced, _deleted',
      entities: 'id, store_id, branch_id, entity_type, name, updated_at, [store_id+branch_id], [store_id+entity_type], _synced, _deleted',
      chart_of_accounts: 'id, store_id, branch_id, account_code, [store_id+account_code], account_name, updated_at, _synced, _deleted',
      
      // Sync management
      sync_metadata: 'id, table_name, last_synced_at',
      pending_syncs: 'id, table_name, record_id, operation, created_at, retry_count',
      
      // Subscription management tables
      subscriptions: 'id, store_id, tier, status, expires_at, last_validated_at, created_at, updated_at, _synced',
      license_validations: 'id, store_id, subscription_id, validation_type, validation_result, created_at'
    }).upgrade(async (trans) => {
      console.log('🗑️ Running migration v38: Remove legacy customers and suppliers tables');
      console.log('   ✅ Removed customers table (data migrated to entities table)');
      console.log('   ✅ Removed suppliers table (data migrated to entities table)');
      console.log('   📢 All customer/supplier data is now in the entities table');
      console.log('   📢 Foreign keys (customer_id, supplier_id) still reference entity.id');
      
      // Note: Dexie will automatically delete the tables when they're removed from schema
      // All data has already been migrated to entities table in previous phases
      // No data migration needed - tables will be dropped automatically
      
      // Set is_active = true for existing branches (Supabase requires this field)
      const branches = await trans.table('branches').toCollection().toArray();
      let updatedCount = 0;
      for (const branch of branches) {
        // Ensure is_active is always set (default to true for existing branches)
        if (branch.is_active === undefined || branch.is_active === null || typeof branch.is_active !== 'boolean') {
          await trans.table('branches').update(branch.id, { is_active: true });
          updatedCount++;
        }
      }
      if (updatedCount > 0) {
        console.log(`   ✅ Set is_active=true for ${updatedCount} existing branches`);
      }
    });

    // Version 39: Add entity_code field and [store_id+entity_code] compound index to entities table
    this.version(39).stores({
      // Store configuration
      stores: 'id, name, preferred_currency, preferred_language, preferred_commission_rate, exchange_rate, updated_at',
      branches: 'id, store_id, name, is_active, updated_at, _synced, _deleted',
      
      // Core tables
      products: 'id, store_id, branch_id, name, category, is_global, updated_at, _synced, _deleted',
      users: 'id, store_id, branch_id, email, name, role, updated_at, lbp_balance, usd_balance, working_hours_start, working_hours_end, working_days, _synced, _deleted',

      // Inventory tables
      inventory_items: 'id, store_id, branch_id, product_id, unit, quantity, weight, price, created_at, received_quantity, batch_id, selling_price, type, received_at, sku, currency, [store_id+branch_id], _synced, _deleted',
      transactions: 'id, store_id, branch_id, type, category, created_at, created_by, currency, customer_id, supplier_id, [store_id+branch_id], _synced, _deleted',
      inventory_bills: 'id, store_id, branch_id, supplier_id, received_at, created_by, currency, [store_id+branch_id], _synced, _deleted',
  
      // Bill management tables
      bills: 'id, store_id, branch_id, bill_number, customer_id, bill_date, payment_method, payment_status, status, created_by, created_at, [store_id+branch_id], _synced, _deleted',
      bill_line_items: 'id, store_id, branch_id, bill_id, product_id, created_at, line_order, inventory_item_id, [store_id+branch_id], _synced, _deleted',
      bill_audit_logs: 'id, store_id, branch_id, bill_id, action, changed_by, created_at, [store_id+branch_id], _synced, _deleted',
      
      // Cash drawer tables
      cash_drawer_accounts: 'id, store_id, branch_id, account_code, [store_id+branch_id], [store_id+account_code], updated_at',
      cash_drawer_sessions: 'id, store_id, branch_id, account_id, status, [store_id+branch_id], created_at, updated_at',
      missed_products: 'id, store_id, branch_id, session_id, inventory_item_id, created_at, [store_id+branch_id], _synced, _deleted',
      
      // Notification tables
      notifications: 'id, store_id, branch_id, type, title, created_at, read_at, _synced, _deleted',
      notification_preferences: 'id, store_id, branch_id, updated_at, _synced, _deleted',
      
      // Reminder system
      reminders: 'id, store_id, branch_id, type, title, due_date, status, created_by, created_at, updated_at, _synced, _deleted',
      
      // Employee attendance
      employee_attendance: 'id, store_id, branch_id, employee_id, check_in_at, check_out_at, created_at, updated_at, _synced, _deleted',
      
      // Accounting foundation tables - FIXED: Added entity_code and [store_id+entity_code] compound index
      journal_entries: 'id, store_id, branch_id, transaction_date, created_at, [store_id+branch_id], _synced, _deleted',
      balance_snapshots: 'id, store_id, branch_id, entity_id, snapshot_date, created_at, [store_id+branch_id], _synced, _deleted',
      entities: 'id, store_id, branch_id, entity_type, entity_code, name, updated_at, [store_id+branch_id], [store_id+entity_type], [store_id+entity_code], _synced, _deleted',
      chart_of_accounts: 'id, store_id, branch_id, account_code, [store_id+account_code], account_name, updated_at, _synced, _deleted',
      
      // Sync management
      sync_metadata: 'id, table_name, last_synced_at',
      pending_syncs: 'id, table_name, record_id, operation, created_at, retry_count',
      
      // Subscription management tables
      subscriptions: 'id, store_id, tier, status, expires_at, last_validated_at, created_at, updated_at, _synced',
      license_validations: 'id, store_id, subscription_id, validation_type, validation_result, created_at'
    }).upgrade(async (trans) => {
      console.log('🔧 Running migration v39: Add entity_code field and [store_id+entity_code] compound index to entities table');
      console.log('   ✅ Added entity_code to entities table schema');
      console.log('   ✅ Added [store_id+entity_code] compound index for getSystemEntity() queries');
      console.log('   📢 This fixes Dexie SchemaError: KeyPath [store_id+entity_code] on object store entities is not indexed');
      // No data migration needed - entity_code should already exist in data, just adding to index
    });

    // Version 40: Add RBAC tables (user_module_access)
    this.version(40).stores({
      // Store configuration
      stores: 'id, name, preferred_currency, preferred_language, preferred_commission_rate, exchange_rate, updated_at',
      branches: 'id, store_id, name, is_active, updated_at, _synced, _deleted',
      
      // Core tables
      products: 'id, store_id, branch_id, name, category, is_global, updated_at, _synced, _deleted',
      users: 'id, store_id, branch_id, email, name, role, updated_at, lbp_balance, usd_balance, working_hours_start, working_hours_end, working_days, _synced, _deleted',

      // Inventory tables
      inventory_items: 'id, store_id, branch_id, product_id, unit, quantity, weight, price, created_at, received_quantity, batch_id, selling_price, type, received_at, sku, currency, [store_id+branch_id], _synced, _deleted',
      transactions: 'id, store_id, branch_id, type, category, created_at, created_by, currency, customer_id, supplier_id, [store_id+branch_id], _synced, _deleted',
      inventory_bills: 'id, store_id, branch_id, supplier_id, received_at, created_by, currency, [store_id+branch_id], _synced, _deleted',
  
      // Bill management tables
      bills: 'id, store_id, branch_id, bill_number, customer_id, bill_date, payment_method, payment_status, status, created_by, created_at, [store_id+branch_id], _synced, _deleted',
      bill_line_items: 'id, store_id, branch_id, bill_id, product_id, created_at, line_order, inventory_item_id, [store_id+branch_id], _synced, _deleted',
      bill_audit_logs: 'id, store_id, branch_id, bill_id, action, changed_by, created_at, [store_id+branch_id], _synced, _deleted',
      
      // Cash drawer tables
      cash_drawer_accounts: 'id, store_id, branch_id, account_code, [store_id+branch_id], [store_id+account_code], updated_at',
      cash_drawer_sessions: 'id, store_id, branch_id, account_id, status, [store_id+branch_id], created_at, updated_at',
      missed_products: 'id, store_id, branch_id, session_id, inventory_item_id, created_at, [store_id+branch_id], _synced, _deleted',
      
      // Notification tables
      notifications: 'id, store_id, branch_id, type, title, created_at, read_at, _synced, _deleted',
      notification_preferences: 'id, store_id, branch_id, updated_at, _synced, _deleted',
      
      // Reminder system
      reminders: 'id, store_id, branch_id, type, title, due_date, status, created_by, created_at, updated_at, _synced, _deleted',
      
      // Employee attendance
      employee_attendance: 'id, store_id, branch_id, employee_id, check_in_at, check_out_at, created_at, updated_at, _synced, _deleted',
      
      // Accounting foundation tables
      journal_entries: 'id, store_id, branch_id, transaction_date, created_at, [store_id+branch_id], _synced, _deleted',
      balance_snapshots: 'id, store_id, branch_id, entity_id, snapshot_date, created_at, [store_id+branch_id], _synced, _deleted',
      entities: 'id, store_id, branch_id, entity_type, entity_code, name, updated_at, [store_id+branch_id], [store_id+entity_type], [store_id+entity_code], _synced, _deleted',
      chart_of_accounts: 'id, store_id, branch_id, account_code, [store_id+account_code], account_name, updated_at, _synced, _deleted',
      
      // RBAC tables (NEW)
      user_module_access: 'id, [user_id+store_id], [user_id+store_id+module], user_id, store_id, updated_at, _synced, _deleted',
      
      // Sync management
      sync_metadata: 'id, table_name, last_synced_at',
      pending_syncs: 'id, table_name, record_id, operation, created_at, retry_count',
      
      // Subscription management tables
      subscriptions: 'id, store_id, tier, status, expires_at, last_validated_at, created_at, updated_at, _synced',
      license_validations: 'id, store_id, subscription_id, validation_type, validation_result, created_at'
    }).upgrade(async (trans) => {
      console.log('🔧 Running migration v40: Add RBAC tables (user_module_access)');
      console.log('   ✅ Added user_module_access table for per-user module permissions');
      console.log('   ✅ Both tables will sync across all devices via Supabase');
      console.log('   📢 Next: Update sync service to sync these tables');
      // No data migration needed - new tables start empty
    });

    // Version 41: Add is_system_entity index to entities table
    this.version(41).stores({
      // Store configuration
      stores: 'id, name, preferred_currency, preferred_language, preferred_commission_rate, exchange_rate, updated_at',
      branches: 'id, store_id, name, is_active, updated_at, _synced, _deleted',
      
      // Core tables
      products: 'id, store_id, branch_id, name, category, is_global, updated_at, _synced, _deleted',
      users: 'id, store_id, branch_id, email, name, role, updated_at, lbp_balance, usd_balance, working_hours_start, working_hours_end, working_days, _synced, _deleted',

      // Inventory tables
      inventory_items: 'id, store_id, branch_id, product_id, unit, quantity, weight, price, created_at, received_quantity, batch_id, selling_price, type, received_at, sku, currency, [store_id+branch_id], _synced, _deleted',
      transactions: 'id, store_id, branch_id, type, category, created_at, created_by, currency, customer_id, supplier_id, [store_id+branch_id], _synced, _deleted',
      inventory_bills: 'id, store_id, branch_id, supplier_id, received_at, created_by, currency, [store_id+branch_id], _synced, _deleted',
  
      // Bill management tables
      bills: 'id, store_id, branch_id, bill_number, customer_id, bill_date, payment_method, payment_status, status, created_by, created_at, [store_id+branch_id], _synced, _deleted',
      bill_line_items: 'id, store_id, branch_id, bill_id, product_id, created_at, line_order, inventory_item_id, [store_id+branch_id], _synced, _deleted',
      bill_audit_logs: 'id, store_id, branch_id, bill_id, action, changed_by, created_at, [store_id+branch_id], _synced, _deleted',
      
      // Cash drawer tables
      cash_drawer_accounts: 'id, store_id, branch_id, account_code, [store_id+branch_id], [store_id+account_code], updated_at',
      cash_drawer_sessions: 'id, store_id, branch_id, account_id, status, [store_id+branch_id], created_at, updated_at',
      missed_products: 'id, store_id, branch_id, session_id, inventory_item_id, created_at, [store_id+branch_id], _synced, _deleted',
      
      // Notification tables
      notifications: 'id, store_id, branch_id, type, title, created_at, read_at, _synced, _deleted',
      notification_preferences: 'id, store_id, branch_id, updated_at, _synced, _deleted',
      
      // Reminder system
      reminders: 'id, store_id, branch_id, type, title, due_date, status, created_by, created_at, updated_at, _synced, _deleted',
      
      // Employee attendance
      employee_attendance: 'id, store_id, branch_id, employee_id, check_in_at, check_out_at, created_at, updated_at, _synced, _deleted',
      
      // Accounting foundation tables
      journal_entries: 'id, store_id, branch_id, transaction_id, entity_id, account_code, transaction_date, created_at, [store_id+branch_id], [store_id+account_code], _synced, _deleted',
      balance_snapshots: 'id, store_id, branch_id, entity_id, snapshot_date, created_at, [store_id+branch_id], _synced, _deleted',
      entities: 'id, store_id, branch_id, entity_type, entity_code, name, is_system_entity, updated_at, [store_id+branch_id], [store_id+entity_type], [store_id+entity_code], [store_id+is_system_entity], _synced, _deleted',
      chart_of_accounts: 'id, store_id, branch_id, account_code, [store_id+account_code], account_name, updated_at, _synced, _deleted',
      
      // RBAC tables
      user_module_access: 'id, [user_id+store_id], [user_id+store_id+module], user_id, store_id, updated_at, _synced, _deleted',
      
      // Sync management
      sync_metadata: 'id, table_name, last_synced_at',
      pending_syncs: 'id, table_name, record_id, operation, created_at, retry_count',
      
      // Subscription management tables
      subscriptions: 'id, store_id, tier, status, expires_at, last_validated_at, created_at, updated_at, _synced',
      license_validations: 'id, store_id, subscription_id, validation_type, validation_result, created_at'
    }).upgrade(async (trans) => {
      console.log('🔧 Running migration v41: Add missing indexes to accounting tables');
      console.log('   ✅ Added [store_id+is_system_entity] compound index to entities table');
      console.log('   ✅ Added transaction_id, entity_id, account_code indexes to journal_entries');
      console.log('   ✅ Added [store_id+account_code] compound index to journal_entries');
      // No data migration needed - fields already exist in data, just adding to indexes
    });

    // Version 42: Add compound indexes for balance calculation queries
    this.version(42).stores({
      // Store configuration
      stores: 'id, name, preferred_currency, preferred_language, preferred_commission_rate, exchange_rate, updated_at',
      branches: 'id, store_id, name, is_active, updated_at, _synced, _deleted',
      
      // Core tables
      products: 'id, store_id, branch_id, name, category, is_global, updated_at, _synced, _deleted',
      users: 'id, store_id, branch_id, email, name, role, updated_at, lbp_balance, usd_balance, working_hours_start, working_hours_end, working_days, _synced, _deleted',

      // Inventory tables
      inventory_items: 'id, store_id, branch_id, product_id, unit, quantity, weight, price, created_at, received_quantity, batch_id, selling_price, type, received_at, sku, currency, [store_id+branch_id], _synced, _deleted',
      transactions: 'id, store_id, branch_id, type, category, created_at, created_by, currency, customer_id, supplier_id, [store_id+branch_id], _synced, _deleted',
      inventory_bills: 'id, store_id, branch_id, supplier_id, received_at, created_by, currency, [store_id+branch_id], _synced, _deleted',
  
      // Bill management tables
      bills: 'id, store_id, branch_id, customer_id, bill_number, payment_method, payment_status, bill_date, status, created_by, created_at, [store_id+branch_id], _synced, _deleted',
      bill_line_items: 'id, store_id, branch_id, bill_id, inventory_item_id, product_id, created_at, [store_id+branch_id], [store_id+bill_id], _synced, _deleted',
      bill_audit_logs: 'id, store_id, branch_id, bill_id, action, changed_by, created_at, [store_id+bill_id], _synced',
      
      // Cash drawer
      cash_drawer_sessions: 'id, store_id, branch_id, opened_by, opened_at, closed_at, status, [store_id+branch_id], [store_id+branch_id+status], _synced, _deleted',
      cash_drawer_accounts: 'id, store_id, branch_id, currency, created_at, updated_at, [store_id+branch_id], [store_id+branch_id+currency], _synced, _deleted',

      // Public access tokens
      public_access_tokens: 'id, customer_id, token, expires_at, created_at, _synced, _deleted',
      
      // Notification preferences
      notification_preferences: 'id, store_id, branch_id, updated_at, _synced, _deleted',
      
      // Reminder system
      reminders: 'id, store_id, branch_id, type, title, due_date, status, created_by, created_at, updated_at, _synced, _deleted',
      
      // Employee attendance
      employee_attendance: 'id, store_id, branch_id, employee_id, check_in_at, check_out_at, created_at, updated_at, _synced, _deleted',
      
      // Accounting foundation tables
      journal_entries: 'id, store_id, branch_id, transaction_id, entity_id, account_code, currency, transaction_date, created_at, [store_id+branch_id], [store_id+account_code], [entity_id+currency+account_code], [entity_id+currency], [transaction_id], _synced, _deleted',
      balance_snapshots: 'id, store_id, branch_id, entity_id, snapshot_date, created_at, [store_id+branch_id], _synced, _deleted',
      entities: 'id, store_id, branch_id, entity_type, entity_code, name, is_system_entity, updated_at, [store_id+branch_id], [store_id+entity_type], [store_id+entity_code], [store_id+is_system_entity], _synced, _deleted',
      chart_of_accounts: 'id, store_id, branch_id, account_code, [store_id+account_code], account_name, updated_at, _synced, _deleted',
      
      // RBAC tables
      user_module_access: 'id, [user_id+store_id], [user_id+store_id+module], user_id, store_id, updated_at, _synced, _deleted',
      
      // Sync management
      sync_metadata: 'id, table_name, last_synced_at',
      pending_syncs: 'id, table_name, record_id, operation, created_at, retry_count',
      
      // Subscription management tables
      subscriptions: 'id, store_id, tier, status, expires_at, last_validated_at, created_at, updated_at, _synced',
      license_validations: 'id, store_id, subscription_id, validation_type, validation_result, created_at'
    }).upgrade(async (trans) => {
      console.log('🔧 Running migration v42: Add compound indexes for balance calculation');
      console.log('   ✅ Added currency field to journal_entries indexes');
      console.log('   ✅ Added [entity_id+currency+account_code] compound index for fast balance queries');
      console.log('   ✅ Added [entity_id+currency] compound index for entity balance lookups');
      console.log('   ✅ Added [transaction_id] index for journal entry lookups by transaction');
      console.log('   📊 These indexes enable the canonical calculateBalance() function');
      // No data migration needed - fields already exist, just adding compound indexes
    });

    // Version 43: Add back [store_id+branch_id] index to bill_audit_logs
    this.version(43).stores({
      // Store configuration
      stores: 'id, name, preferred_currency, preferred_language, preferred_commission_rate, exchange_rate, updated_at',
      branches: 'id, store_id, name, is_active, updated_at, _synced, _deleted',
      
      // Core tables
      products: 'id, store_id, branch_id, name, category, is_global, updated_at, _synced, _deleted',
      users: 'id, store_id, branch_id, email, name, role, updated_at, lbp_balance, usd_balance, working_hours_start, working_hours_end, working_days, _synced, _deleted',

      // Inventory tables
      inventory_items: 'id, store_id, branch_id, product_id, unit, quantity, weight, price, created_at, received_quantity, batch_id, selling_price, type, received_at, sku, currency, [store_id+branch_id], _synced, _deleted',
      transactions: 'id, store_id, branch_id, type, category, created_at, created_by, currency, customer_id, supplier_id, [store_id+branch_id], _synced, _deleted',
      inventory_bills: 'id, store_id, branch_id, supplier_id, received_at, created_by, currency, [store_id+branch_id], _synced, _deleted',
  
      // Bill management tables
      bills: 'id, store_id, branch_id, customer_id, bill_number, payment_method, payment_status, bill_date, status, created_by, created_at, [store_id+branch_id], _synced, _deleted',
      bill_line_items: 'id, store_id, branch_id, bill_id, inventory_item_id, product_id, created_at, [store_id+branch_id], [store_id+bill_id], _synced, _deleted',
      bill_audit_logs: 'id, store_id, branch_id, bill_id, action, changed_by, created_at, [store_id+branch_id], [store_id+bill_id], _synced, _deleted',
      
      // Cash drawer
      cash_drawer_sessions: 'id, store_id, branch_id, opened_by, opened_at, closed_at, status, [store_id+branch_id], [store_id+branch_id+status], _synced, _deleted',
      cash_drawer_accounts: 'id, store_id, branch_id, currency, created_at, updated_at, [store_id+branch_id], [store_id+branch_id+currency], _synced, _deleted',

      // Public access tokens
      public_access_tokens: 'id, customer_id, token, expires_at, created_at, _synced, _deleted',
      
      // Notification preferences
      notification_preferences: 'id, store_id, branch_id, updated_at, _synced, _deleted',
      
      // Reminder system
      reminders: 'id, store_id, branch_id, type, title, due_date, status, created_by, created_at, updated_at, _synced, _deleted',
      
      // Employee attendance
      employee_attendance: 'id, store_id, branch_id, employee_id, check_in_at, check_out_at, created_at, updated_at, _synced, _deleted',
      
      // Accounting foundation tables
      journal_entries: 'id, store_id, branch_id, transaction_id, entity_id, account_code, currency, transaction_date, created_at, [store_id+branch_id], [store_id+account_code], [entity_id+currency+account_code], [entity_id+currency], [transaction_id], _synced, _deleted',
      balance_snapshots: 'id, store_id, branch_id, entity_id, snapshot_date, created_at, [store_id+branch_id], _synced, _deleted',
      entities: 'id, store_id, branch_id, entity_type, entity_code, name, is_system_entity, updated_at, [store_id+branch_id], [store_id+entity_type], [store_id+entity_code], [store_id+is_system_entity], _synced, _deleted',
      chart_of_accounts: 'id, store_id, branch_id, account_code, [store_id+account_code], account_name, updated_at, _synced, _deleted',
      
      // RBAC tables
      user_module_access: 'id, [user_id+store_id], [user_id+store_id+module], user_id, store_id, updated_at, _synced, _deleted',
      
      // Sync management
      sync_metadata: 'id, table_name, last_synced_at',
      pending_syncs: 'id, table_name, record_id, operation, created_at, retry_count',
      sync_state: 'branch_id, last_seen_event_version, updated_at',
      
      // Subscription management tables
      subscriptions: 'id, store_id, tier, status, expires_at, last_validated_at, created_at, updated_at, _synced',
      license_validations: 'id, store_id, subscription_id, validation_type, validation_result, created_at'
    }).upgrade(async (trans) => {
      console.log('🔧 Running migration v43: Add back [store_id+branch_id] index to bill_audit_logs');
      console.log('   ✅ Added [store_id+branch_id] compound index to bill_audit_logs');
      console.log('   📢 This fixes Dexie SchemaError: KeyPath [store_id+branch_id] on object store bill_audit_logs is not indexed');
      console.log('   📊 This index is required for getEntitiesByStoreBranch() queries');
      // No data migration needed - just adding the missing index
    });

    // Version 44: Add sync_state table for event-driven sync
    this.version(44).stores({
      // Store configuration
      stores: 'id, name, preferred_currency, preferred_language, preferred_commission_rate, exchange_rate, updated_at',
      branches: 'id, store_id, name, is_active, updated_at, _synced, _deleted',
      
      // Core tables
      products: 'id, store_id, branch_id, name, category, is_global, updated_at, _synced, _deleted',
      users: 'id, store_id, branch_id, email, name, role, updated_at, lbp_balance, usd_balance, working_hours_start, working_hours_end, working_days, _synced, _deleted',

      // Inventory tables
      inventory_items: 'id, store_id, branch_id, product_id, unit, quantity, weight, price, created_at, received_quantity, batch_id, selling_price, type, received_at, sku, currency, [store_id+branch_id], _synced, _deleted',
      transactions: 'id, store_id, branch_id, type, category, created_at, created_by, currency, customer_id, supplier_id, [store_id+branch_id], _synced, _deleted',
      inventory_bills: 'id, store_id, branch_id, supplier_id, received_at, created_by, currency, [store_id+branch_id], _synced, _deleted',
  
      // Bill management tables
      bills: 'id, store_id, branch_id, customer_id, bill_number, payment_method, payment_status, bill_date, status, created_by, created_at, [store_id+branch_id], _synced, _deleted',
      bill_line_items: 'id, store_id, branch_id, bill_id, inventory_item_id, product_id, created_at, [store_id+branch_id], [store_id+bill_id], _synced, _deleted',
      bill_audit_logs: 'id, store_id, branch_id, bill_id, action, changed_by, created_at, [store_id+branch_id], [store_id+bill_id], _synced, _deleted',
      
      // Cash drawer
      cash_drawer_sessions: 'id, store_id, branch_id, opened_by, opened_at, closed_at, status, [store_id+branch_id], [store_id+branch_id+status], _synced, _deleted',
      cash_drawer_accounts: 'id, store_id, branch_id, currency, created_at, updated_at, [store_id+branch_id], [store_id+branch_id+currency], _synced, _deleted',

      // Public access tokens
      public_access_tokens: 'id, customer_id, token, expires_at, created_at, _synced, _deleted',
      
      // Notification preferences
      notification_preferences: 'id, store_id, branch_id, updated_at, _synced, _deleted',
      
      // Reminder system
      reminders: 'id, store_id, branch_id, type, title, due_date, status, created_by, created_at, updated_at, _synced, _deleted',
      
      // Employee attendance
      employee_attendance: 'id, store_id, branch_id, employee_id, check_in_at, check_out_at, created_at, updated_at, _synced, _deleted',
      
      // Accounting foundation tables
      journal_entries: 'id, store_id, branch_id, transaction_id, entity_id, account_code, currency, transaction_date, created_at, [store_id+branch_id], [store_id+account_code], [entity_id+currency+account_code], [entity_id+currency], [transaction_id], _synced, _deleted',
      balance_snapshots: 'id, store_id, branch_id, entity_id, snapshot_date, created_at, [store_id+branch_id], _synced, _deleted',
      entities: 'id, store_id, branch_id, entity_type, entity_code, name, is_system_entity, updated_at, [store_id+branch_id], [store_id+entity_type], [store_id+entity_code], [store_id+is_system_entity], _synced, _deleted',
      chart_of_accounts: 'id, store_id, branch_id, account_code, [store_id+account_code], account_name, updated_at, _synced, _deleted',
      
      // RBAC tables
      user_module_access: 'id, [user_id+store_id], [user_id+store_id+module], user_id, store_id, updated_at, _synced, _deleted',
      
      // Sync management
      sync_metadata: 'id, table_name, last_synced_at',
      pending_syncs: 'id, table_name, record_id, operation, created_at, retry_count',
      sync_state: 'branch_id, last_seen_event_version, updated_at',
      
      // Subscription management tables
      subscriptions: 'id, store_id, tier, status, expires_at, last_validated_at, created_at, updated_at, _synced',
      license_validations: 'id, store_id, subscription_id, validation_type, validation_result, created_at'
    }).upgrade(async (trans) => {
      console.log('🔧 Running migration v44: Add sync_state table for event-driven sync');
      console.log('   ✅ Added sync_state table to track last_seen_event_version per branch');
      console.log('   📊 This enables event-driven sync using branch_event_log');
      // No data migration needed - new table, starts empty
    });

    // Version 45: Add is_reversal and reversal_of_transaction_id fields to transactions
    this.version(45).stores({
      // Store configuration
      stores: 'id, name, preferred_currency, preferred_language, preferred_commission_rate, exchange_rate, updated_at',
      branches: 'id, store_id, name, is_active, updated_at, _synced, _deleted',
      
      // Core tables
      products: 'id, store_id, branch_id, name, category, is_global, updated_at, _synced, _deleted',
      users: 'id, store_id, branch_id, email, name, role, updated_at, lbp_balance, usd_balance, working_hours_start, working_hours_end, working_days, _synced, _deleted',

      // Inventory tables
      inventory_items: 'id, store_id, branch_id, product_id, unit, quantity, weight, price, created_at, received_quantity, batch_id, selling_price, type, received_at, sku, currency, [store_id+branch_id], _synced, _deleted',
      // Add reversal_of_transaction_id index (is_reversal is boolean, cannot be indexed in Dexie)
      transactions: 'id, store_id, branch_id, type, category, created_at, created_by, currency, customer_id, supplier_id, reversal_of_transaction_id, [store_id+branch_id], _synced, _deleted',
      inventory_bills: 'id, store_id, branch_id, supplier_id, received_at, created_by, currency, [store_id+branch_id], _synced, _deleted',
  
      // Bill management tables
      bills: 'id, store_id, branch_id, customer_id, bill_number, payment_method, payment_status, bill_date, status, created_by, created_at, [store_id+branch_id], _synced, _deleted',
      bill_line_items: 'id, store_id, branch_id, bill_id, inventory_item_id, product_id, created_at, [store_id+branch_id], [store_id+bill_id], _synced, _deleted',
      bill_audit_logs: 'id, store_id, branch_id, bill_id, action, changed_by, created_at, [store_id+branch_id], [store_id+bill_id], _synced, _deleted',
      
      // Cash drawer
      cash_drawer_sessions: 'id, store_id, branch_id, opened_by, opened_at, closed_at, status, [store_id+branch_id], [store_id+branch_id+status], _synced, _deleted',
      cash_drawer_accounts: 'id, store_id, branch_id, currency, created_at, updated_at, [store_id+branch_id], [store_id+branch_id+currency], _synced, _deleted',

      // Public access tokens
      public_access_tokens: 'id, customer_id, token, expires_at, created_at, _synced, _deleted',
      
      // Notification preferences
      notification_preferences: 'id, store_id, branch_id, updated_at, _synced, _deleted',
      
      // Reminder system
      reminders: 'id, store_id, branch_id, type, title, due_date, status, created_by, created_at, updated_at, _synced, _deleted',
      
      // Employee attendance
      employee_attendance: 'id, store_id, branch_id, employee_id, check_in_at, check_out_at, created_at, updated_at, _synced, _deleted',
      
      // Accounting foundation tables
      journal_entries: 'id, store_id, branch_id, transaction_id, entity_id, account_code, currency, transaction_date, created_at, [store_id+branch_id], [store_id+account_code], [entity_id+currency+account_code], [entity_id+currency], [transaction_id], _synced, _deleted',
      balance_snapshots: 'id, store_id, branch_id, entity_id, snapshot_date, created_at, [store_id+branch_id], _synced, _deleted',
      entities: 'id, store_id, branch_id, entity_type, entity_code, name, is_system_entity, updated_at, [store_id+branch_id], [store_id+entity_type], [store_id+entity_code], [store_id+is_system_entity], _synced, _deleted',
      chart_of_accounts: 'id, store_id, branch_id, account_code, [store_id+account_code], account_name, updated_at, _synced, _deleted',
      
      // RBAC tables
      user_module_access: 'id, [user_id+store_id], [user_id+store_id+module], user_id, store_id, updated_at, _synced, _deleted',
      
      // Sync management
      sync_metadata: 'id, table_name, last_synced_at',
      pending_syncs: 'id, table_name, record_id, operation, created_at, retry_count',
      sync_state: 'branch_id, last_seen_event_version, updated_at',
      
      // Subscription management tables
      subscriptions: 'id, store_id, tier, status, expires_at, last_validated_at, created_at, updated_at, _synced',
      license_validations: 'id, store_id, subscription_id, validation_type, validation_result, created_at'
    }).upgrade(async (trans) => {
      console.log('🔧 Running migration v45: Add is_reversal and reversal_of_transaction_id to transactions');
      console.log('   ✅ Added is_reversal and reversal_of_transaction_id fields to transactions table');
      console.log('   📊 Schema updated - no existing data to migrate');
      // No data migration needed - new fields will be set when creating new reversal transactions
    });

    // Version 46: Unified RBAC - Replace user_module_access with role_permissions and user_permissions
    this.version(46).stores({
      // Store configuration
      stores: 'id, name, preferred_currency, preferred_language, preferred_commission_rate, exchange_rate, updated_at',
      branches: 'id, store_id, name, is_active, updated_at, _synced, _deleted',
      
      // Core tables
      products: 'id, store_id, branch_id, name, category, is_global, updated_at, _synced, _deleted',
      users: 'id, store_id, branch_id, email, name, role, updated_at, lbp_balance, usd_balance, working_hours_start, working_hours_end, working_days, _synced, _deleted',

      // Inventory tables
      inventory_items: 'id, store_id, branch_id, product_id, unit, quantity, weight, price, created_at, received_quantity, batch_id, selling_price, type, received_at, sku, currency, [store_id+branch_id], _synced, _deleted',
      transactions: 'id, store_id, branch_id, type, category, created_at, created_by, currency, customer_id, supplier_id, reversal_of_transaction_id, [store_id+branch_id], _synced, _deleted',
      inventory_bills: 'id, store_id, branch_id, supplier_id, received_at, created_by, currency, [store_id+branch_id], _synced, _deleted',
  
      // Bill management tables
      bills: 'id, store_id, branch_id, customer_id, bill_number, payment_method, payment_status, bill_date, status, created_by, created_at, [store_id+branch_id], _synced, _deleted',
      bill_line_items: 'id, store_id, branch_id, bill_id, inventory_item_id, product_id, created_at, [store_id+branch_id], [store_id+bill_id], _synced, _deleted',
      bill_audit_logs: 'id, store_id, branch_id, bill_id, action, changed_by, created_at, [store_id+branch_id], [store_id+bill_id], _synced, _deleted',
      
      // Cash drawer
      cash_drawer_sessions: 'id, store_id, branch_id, opened_by, opened_at, closed_at, status, [store_id+branch_id], [store_id+branch_id+status], _synced, _deleted',
      cash_drawer_accounts: 'id, store_id, branch_id, currency, created_at, updated_at, [store_id+branch_id], [store_id+branch_id+currency], _synced, _deleted',

      // Public access tokens
      public_access_tokens: 'id, customer_id, token, expires_at, created_at, _synced, _deleted',
      
      // Notification preferences
      notification_preferences: 'id, store_id, branch_id, updated_at, _synced, _deleted',
      
      // Reminder system
      reminders: 'id, store_id, branch_id, type, title, due_date, status, created_by, created_at, updated_at, _synced, _deleted',
      
      // Employee attendance
      employee_attendance: 'id, store_id, branch_id, employee_id, check_in_at, check_out_at, created_at, updated_at, _synced, _deleted',
      
      // Accounting foundation tables
      journal_entries: 'id, store_id, branch_id, transaction_id, entity_id, account_code, currency, transaction_date, created_at, [store_id+branch_id], [store_id+account_code], [entity_id+currency+account_code], [entity_id+currency], [transaction_id], _synced, _deleted',
      balance_snapshots: 'id, store_id, branch_id, entity_id, snapshot_date, created_at, [store_id+branch_id], _synced, _deleted',
      entities: 'id, store_id, branch_id, entity_type, entity_code, name, is_system_entity, updated_at, [store_id+branch_id], [store_id+entity_type], [store_id+entity_code], [store_id+is_system_entity], _synced, _deleted',
      chart_of_accounts: 'id, store_id, branch_id, account_code, [store_id+account_code], account_name, updated_at, _synced, _deleted',
      
      // RBAC tables (Unified - replaces user_module_access)
      role_permissions: 'id, [role+operation], role, updated_at, _synced, _deleted', // GLOBAL permissions (no store_id)
      user_permissions: 'id, [user_id+store_id], [user_id+store_id+operation], user_id, store_id, updated_at, _synced, _deleted',
      
      // Sync management
      sync_metadata: 'id, table_name, last_synced_at',
      pending_syncs: 'id, table_name, record_id, operation, created_at, retry_count',
      sync_state: 'branch_id, last_seen_event_version, updated_at',
      
      // Subscription management tables
      subscriptions: 'id, store_id, tier, status, expires_at, last_validated_at, created_at, updated_at, _synced',
      license_validations: 'id, store_id, subscription_id, validation_type, validation_result, created_at'
    }).upgrade(async (trans) => {
      console.log('🔧 Running migration v46: Unified RBAC - Replace user_module_access with role_permissions and user_permissions');
      
      // Migrate user_module_access data to user_permissions
      const userModuleAccessTable = trans.table('user_module_access');
      const userPermissionsTable = trans.table('user_permissions');
      
      const allModuleAccess = await userModuleAccessTable.toArray();
      console.log(`   📦 Found ${allModuleAccess.length} user_module_access records to migrate`);
      
      let migratedCount = 0;
      for (const moduleAccess of allModuleAccess) {
        // Convert module name to operation format (e.g., 'pos' -> 'access_pos')
        const operation = `access_${moduleAccess.module}`;
        
        // Check if permission already exists (avoid duplicates)
        const existing = await userPermissionsTable
          .where('[user_id+store_id+operation]')
          .equals([moduleAccess.user_id, moduleAccess.store_id, operation])
          .first();
        
        if (!existing) {
          await userPermissionsTable.add({
            id: uuidv4(),
            user_id: moduleAccess.user_id,
            store_id: moduleAccess.store_id,
            operation: operation as any,
            allowed: moduleAccess.can_access,
            created_at: moduleAccess.created_at,
            updated_at: moduleAccess.updated_at,
            _synced: moduleAccess._synced || false,
            _deleted: moduleAccess._deleted || false
          });
          migratedCount++;
        }
      }
      
      console.log(`   ✅ Migrated ${migratedCount} records from user_module_access to user_permissions`);
      console.log('   🗑️  user_module_access table will be removed from schema');
      console.log('   📢 Next: Update sync service to sync role_permissions and user_permissions');
    });

    // Migration for version 47 - Journal Entry Base Currency Schema
    this.version(47).stores({
      // Store configuration
      stores: 'id, name, preferred_currency, preferred_language, preferred_commission_rate, exchange_rate, updated_at',
      branches: 'id, store_id, name, is_active, updated_at, _synced, _deleted',
      
      // Core tables
      products: 'id, store_id, branch_id, name, category, is_global, updated_at, _synced, _deleted',
      users: 'id, store_id, branch_id, email, name, role, updated_at, lbp_balance, usd_balance, working_hours_start, working_hours_end, working_days, _synced, _deleted',

      // Inventory tables
      inventory_items: 'id, store_id, branch_id, product_id, unit, quantity, weight, price, created_at, received_quantity, batch_id, selling_price, type, received_at, sku, currency, [store_id+branch_id], _synced, _deleted',
      transactions: 'id, store_id, branch_id, type, category, created_at, created_by, currency, customer_id, supplier_id, reversal_of_transaction_id, [store_id+branch_id], _synced, _deleted',
      inventory_bills: 'id, store_id, branch_id, supplier_id, received_at, created_by, currency, [store_id+branch_id], _synced, _deleted',
  
      // Bill management tables
      bills: 'id, store_id, branch_id, customer_id, bill_number, payment_method, payment_status, bill_date, status, created_by, created_at, [store_id+branch_id], _synced, _deleted',
      bill_line_items: 'id, store_id, branch_id, bill_id, inventory_item_id, product_id, created_at, [store_id+branch_id], [store_id+bill_id], _synced, _deleted',
      bill_audit_logs: 'id, store_id, branch_id, bill_id, action, changed_by, created_at, [store_id+branch_id], [store_id+bill_id], _synced, _deleted',
      
      // Cash drawer
      cash_drawer_sessions: 'id, store_id, branch_id, opened_by, opened_at, closed_at, status, [store_id+branch_id], [store_id+branch_id+status], _synced, _deleted',
      cash_drawer_accounts: 'id, store_id, branch_id, currency, created_at, updated_at, [store_id+branch_id], [store_id+branch_id+currency], _synced, _deleted',

      // Public access tokens
      public_access_tokens: 'id, customer_id, token, expires_at, created_at, _synced, _deleted',
      
      // Notification preferences
      notification_preferences: 'id, store_id, branch_id, updated_at, _synced, _deleted',
      
      // Reminder system
      reminders: 'id, store_id, branch_id, type, title, due_date, status, created_by, created_at, updated_at, _synced, _deleted',
      
      // Employee attendance
      employee_attendance: 'id, store_id, branch_id, employee_id, check_in_at, check_out_at, created_at, updated_at, _synced, _deleted',
      
      // Accounting foundation tables - UPDATED: Remove currency, add base currency fields
      journal_entries: 'id, store_id, branch_id, transaction_id, entity_id, account_code, posted_date, created_at, [store_id+branch_id], [store_id+account_code], [entity_id+account_code], [transaction_id], _synced, _deleted',
      balance_snapshots: 'id, store_id, branch_id, entity_id, snapshot_date, created_at, [store_id+branch_id], _synced, _deleted',
      entities: 'id, store_id, branch_id, entity_type, entity_code, name, is_system_entity, updated_at, [store_id+branch_id], [store_id+entity_type], [store_id+entity_code], [store_id+is_system_entity], _synced, _deleted',
      chart_of_accounts: 'id, store_id, branch_id, account_code, [store_id+account_code], account_name, updated_at, _synced, _deleted',
      
      // RBAC tables (Unified - replaces user_module_access)
      role_permissions: 'id, [role+operation], role, updated_at, _synced, _deleted', // GLOBAL permissions (no store_id)
      user_permissions: 'id, [user_id+store_id], [user_id+store_id+operation], user_id, store_id, updated_at, _synced, _deleted',
      
      // Sync management
      sync_metadata: 'id, table_name, last_synced_at',
      pending_syncs: 'id, table_name, record_id, operation, created_at, retry_count',
      sync_state: 'branch_id, last_seen_event_version, updated_at',
      
      // Subscription management tables
      subscriptions: 'id, store_id, tier, status, expires_at, last_validated_at, created_at, updated_at, _synced',
      license_validations: 'id, store_id, subscription_id, validation_type, validation_result, created_at'
    });

    // Version 48: Fix balance_snapshots schema - add missing fields and indexes
    this.version(48).stores({
      // Store configuration
      stores: 'id, name, preferred_currency, preferred_language, preferred_commission_rate, exchange_rate, updated_at',
      branches: 'id, store_id, name, is_active, updated_at, _synced, _deleted',
      
      // Core tables
      products: 'id, store_id, branch_id, name, category, is_global, updated_at, _synced, _deleted',
      users: 'id, store_id, branch_id, email, name, role, updated_at, lbp_balance, usd_balance, working_hours_start, working_hours_end, working_days, _synced, _deleted',

      // Inventory tables
      inventory_items: 'id, store_id, branch_id, product_id, unit, quantity, weight, price, created_at, received_quantity, batch_id, selling_price, type, received_at, sku, currency, [store_id+branch_id], _synced, _deleted',
      transactions: 'id, store_id, branch_id, type, category, created_at, created_by, currency, customer_id, supplier_id, reversal_of_transaction_id, [store_id+branch_id], _synced, _deleted',
      inventory_bills: 'id, store_id, branch_id, supplier_id, received_at, created_by, currency, [store_id+branch_id], _synced, _deleted',
  
      // Bill management tables
      bills: 'id, store_id, branch_id, customer_id, bill_number, payment_method, payment_status, bill_date, status, created_by, created_at, [store_id+branch_id], _synced, _deleted',
      bill_line_items: 'id, store_id, branch_id, bill_id, inventory_item_id, product_id, created_at, [store_id+branch_id], [store_id+bill_id], _synced, _deleted',
      bill_audit_logs: 'id, store_id, branch_id, bill_id, action, changed_by, created_at, [store_id+branch_id], [store_id+bill_id], _synced, _deleted',
      
      // Cash drawer
      cash_drawer_sessions: 'id, store_id, branch_id, opened_by, opened_at, closed_at, status, [store_id+branch_id], [store_id+branch_id+status], _synced, _deleted',
      cash_drawer_accounts: 'id, store_id, branch_id, currency, created_at, updated_at, [store_id+branch_id], [store_id+branch_id+currency], _synced, _deleted',

      // Public access tokens
      public_access_tokens: 'id, customer_id, token, expires_at, created_at, _synced, _deleted',
      
      // Notification preferences
      notification_preferences: 'id, store_id, branch_id, updated_at, _synced, _deleted',
      
      // Reminder system
      reminders: 'id, store_id, branch_id, type, title, due_date, status, created_by, created_at, updated_at, _synced, _deleted',
      
      // Employee attendance
      employee_attendance: 'id, store_id, branch_id, employee_id, check_in_at, check_out_at, created_at, updated_at, _synced, _deleted',
      
      // Accounting foundation tables - FIXED: balance_snapshots now includes all required fields and indexes
      journal_entries: 'id, store_id, branch_id, transaction_id, entity_id, account_code, posted_date, created_at, [store_id+branch_id], [store_id+account_code], [entity_id+account_code], [transaction_id], _synced, _deleted',
      balance_snapshots: 'id, store_id, branch_id, account_code, entity_id, balance_usd, balance_lbp, snapshot_date, snapshot_type, verified, created_at, [store_id+branch_id], [store_id+account_code+entity_id+snapshot_date], [store_id+account_code+entity_id], [store_id+snapshot_date+snapshot_type], [store_id+snapshot_date], _synced, _deleted',
      entities: 'id, store_id, branch_id, entity_type, entity_code, name, is_system_entity, updated_at, [store_id+branch_id], [store_id+entity_type], [store_id+entity_code], [store_id+is_system_entity], _synced, _deleted',
      chart_of_accounts: 'id, store_id, branch_id, account_code, [store_id+account_code], account_name, updated_at, _synced, _deleted',
      
      // RBAC tables (Unified - replaces user_module_access)
      role_permissions: 'id, [role+operation], role, updated_at, _synced, _deleted', // GLOBAL permissions (no store_id)
      user_permissions: 'id, [user_id+store_id], [user_id+store_id+operation], user_id, store_id, updated_at, _synced, _deleted',
      
      // Sync management
      sync_metadata: 'id, table_name, last_synced_at',
      pending_syncs: 'id, table_name, record_id, operation, created_at, retry_count',
      sync_state: 'branch_id, last_seen_event_version, updated_at',
      
      // Subscription management tables
      subscriptions: 'id, store_id, tier, status, expires_at, last_validated_at, created_at, updated_at, _synced',
      license_validations: 'id, store_id, subscription_id, validation_type, validation_result, created_at'
    });

    // Migration for version 5 - update existing records to match new schema
    this.version(5).upgrade(trans => {
      console.log('🔄 Running migration v5: Updating existing records to match new schema');
      
      // ... (rest of the code remains the same)
      // Update suppliers to ensure type field exists
      trans.table('suppliers').toCollection().modify(supplier => {
        if (!supplier.type) {
          supplier.type = 'commission'; // Default to commission for existing suppliers
        }
        if (supplier.lb_balance === undefined || supplier.lb_balance === null) {
          supplier.lb_balance = 0; // Default balance for existing suppliers
        }
        if (supplier.usd_balance === undefined || supplier.usd_balance === null) {
          supplier.usd_balance = 0; // Default balance for existing suppliers
        }
      });

      // Update customers to ensure balance field exists  
      trans.table('customers').toCollection().modify(customer => {
        if (customer.lb_balance === undefined || customer.lb_balance === null) {
          customer.lb_balance = 0; // Default balance for existing customers
        }
        if (customer.usd_balance === undefined || customer.usd_balance === null) {
          customer.usd_balance = 0; // Default balance for existing customers
        }
      });

      // Update sale_items to ensure all required fields exist
      trans.table('sale_items').toCollection().modify(saleItem => {
        if (!saleItem.inventory_item_id) {
          saleItem.inventory_item_id = ''; // Default empty string for missing inventory_item_id
        }
        if (saleItem.received_value === undefined || saleItem.received_value === null) {
          saleItem.received_value = saleItem.total_price || 0; // Migrate from total_price to received_value
        }
        if (!saleItem.customer_id) {
          saleItem.customer_id = null; // Default null for customer_id
        }
        if (!saleItem.created_by) {
          saleItem.created_by = '00000000-0000-0000-0000-000000000000'; // Use fallback UUID instead of empty string
        }
        if (!saleItem.payment_method) {
          saleItem.payment_method = 'cash'; // Default payment method for existing sale items
        }
      });

      // Update inventory_items to ensure received_quantity exists
      trans.table('inventory_items').toCollection().modify(inventoryItem => {
        if (inventoryItem.received_quantity === undefined || inventoryItem.received_quantity === null) {
          inventoryItem.received_quantity = inventoryItem.quantity || 0; // Default to quantity for existing items
        }
      });

      console.log('✅ Migration v5 completed');
    });

    // Migration for version 6 - add payment_method to sale_items
    this.version(6).upgrade(trans => {
      // Update sale_items to ensure payment_method field exists
      trans.table('sale_items').toCollection().modify(saleItem => {
        if (!saleItem.payment_method) {
          saleItem.payment_method = 'cash'; // Default payment method for existing sale items
        }
      });
    });

    // Migration for version 7 - remove sales table (no longer needed)
    this.version(7).upgrade(trans => {
      // The sales table will be automatically removed from the schema
      // Any existing sales data will be lost, but this matches the backend schema
      console.log('Removing sales table to match backend schema');
    });
    // Add hooks for cash drawer tables
    this.cash_drawer_accounts.hook('creating', this.addCreateFieldsWithUpdatedAt);
    this.cash_drawer_sessions.hook('creating', this.addCreateFields);
    this.cash_drawer_accounts.hook('updating', this.addUpdateFields);
    this.missed_products.hook('creating', this.addCreateFieldsWithUpdatedAt);
    this.missed_products.hook('updating', this.addUpdateFields);

    // Add hooks for automatic timestamping and ID generation
    // Tables WITH updated_at: products, users, branches (suppliers/customers removed - migrated to entities)
    this.products.hook('creating', this.addCreateFieldsWithUpdatedAt);
    // this.suppliers.hook - REMOVED (migrated to entities)
    // this.customers.hook - REMOVED (migrated to entities)
    this.users.hook('creating', this.addCreateFieldsWithUpdatedAt);
    this.branches.hook('creating', this.addCreateFieldsWithUpdatedAt);

    // Tables WITHOUT updated_at: inventory_items, inventory_bills
    this.inventory_items.hook('creating', this.addCreateFields);
    this.inventory_bills.hook('creating', this.addCreateFields);

    // ⚠️ DEPRECATED: Automatic cash drawer updates now handled by transactionService
    // Cash drawer updates are now atomic within transactionService to prevent race conditions
    // (this.transactions as any).hook('creating', this.handleTransactionCreated);

    // Only add update hooks for tables that have updated_at
    this.products.hook('updating', this.addUpdateFields);
    // this.suppliers.hook - REMOVED (migrated to entities)
    // this.customers.hook - REMOVED (migrated to entities)
    this.users.hook('updating', this.addUpdateFields);
    this.branches.hook('updating', this.addUpdateFields);

    // Bill management hooks
    this.bills.hook('creating', this.addCreateFieldsWithUpdatedAt);
    this.bill_line_items.hook('creating', this.addCreateFields);
    this.bill_audit_logs.hook('creating', this.addCreateFields);
    this.bills.hook('updating', this.addUpdateFields);

    // ========================================================================
    // AUTOMATIC SYNC TRIGGERS - Generic solution for all tables
    // ========================================================================
    // These hooks automatically trigger sync when _synced: false is detected
    // This ensures ALL database write operations trigger sync, regardless of
    // whether they go through crudHelperService or direct DB calls
    // ========================================================================
    
    // Get all table names that should trigger sync
    const syncableTables = [
      'stores', 'branches', 'products', 'users', 'entities',
      'inventory_items', 'inventory_bills', 'transactions', 'journal_entries',
      'bills', 'bill_line_items', 'bill_audit_logs',
      'cash_drawer_accounts', 'cash_drawer_sessions',
      'missed_products', 'reminders', 'chart_of_accounts',
      'role_permissions', 'user_permissions', 'balance_snapshots'
    ];

    // Register sync trigger hooks for all tables
    for (const tableName of syncableTables) {
      const table = (this as any)[tableName];
      if (table) {
        // Hook for create operations
        table.hook('creating', this.triggerSyncOnUnsynced);
        // Hook for update operations
        table.hook('updating', this.triggerSyncOnUpdate);
      }
    }

    // Migrations for schema updates (silent - no console logs needed)
    this.version(9).upgrade(trans => {
      // Bill management tables initialization
    });

    this.version(11).upgrade(trans => {
      // Fix sale items with empty created_by fields
      trans.table('sale_items').toCollection().modify(saleItem => {
        if (saleItem.created_by === '') {
          saleItem.created_by = '00000000-0000-0000-0000-000000000000';
        }
      });
    });

    this.version(12).upgrade(trans => {
      // Add created_by index to sale_items
    });

    this.version(13).upgrade(trans => {
      // Ensure hooks are properly registered
    });

    this.version(15).upgrade(trans => {
      // Remove sale_items table and migrate to bill_line_items
    });

    // Version 48 upgrade: Log migration and verify balance_snapshots schema
    this.version(48).upgrade(trans => {
      console.log('🔄 Migrating database to version 48: Adding missing fields and indexes to balance_snapshots');
    });

    // Version 49 - Add logo fields to stores and branches tables
    this.version(49).stores({
      // Store configuration (logo field added, no index needed)
      stores: 'id, name, preferred_currency, preferred_language, preferred_commission_rate, exchange_rate, updated_at',
      branches: 'id, store_id, name, is_active, updated_at, _synced, _deleted',
      
      // Core tables
      products: 'id, store_id, branch_id, name, category, is_global, updated_at, _synced, _deleted',
      users: 'id, store_id, branch_id, email, name, role, updated_at, lbp_balance, usd_balance, working_hours_start, working_hours_end, working_days, _synced, _deleted',

      // Inventory tables
      inventory_items: 'id, store_id, branch_id, product_id, unit, quantity, weight, price, created_at, received_quantity, batch_id, selling_price, type, received_at, sku, currency, [store_id+branch_id], _synced, _deleted',
      transactions: 'id, store_id, branch_id, type, category, created_at, created_by, currency, customer_id, supplier_id, reversal_of_transaction_id, [store_id+branch_id], _synced, _deleted',
      inventory_bills: 'id, store_id, branch_id, supplier_id, received_at, created_by, currency, [store_id+branch_id], _synced, _deleted',
  
      // Bill management tables
      bills: 'id, store_id, branch_id, customer_id, bill_number, payment_method, payment_status, bill_date, status, created_by, created_at, [store_id+branch_id], _synced, _deleted',
      bill_line_items: 'id, store_id, branch_id, bill_id, inventory_item_id, product_id, created_at, [store_id+branch_id], [store_id+bill_id], _synced, _deleted',
      bill_audit_logs: 'id, store_id, branch_id, bill_id, action, changed_by, created_at, [store_id+branch_id], [store_id+bill_id], _synced, _deleted',
      
      // Cash drawer
      cash_drawer_sessions: 'id, store_id, branch_id, opened_by, opened_at, closed_at, status, [store_id+branch_id], [store_id+branch_id+status], _synced, _deleted',
      cash_drawer_accounts: 'id, store_id, branch_id, currency, created_at, updated_at, [store_id+branch_id], [store_id+branch_id+currency], _synced, _deleted',

      // Public access tokens
      public_access_tokens: 'id, customer_id, token, expires_at, created_at, _synced, _deleted',
      
      // Notification preferences
      notification_preferences: 'id, store_id, branch_id, updated_at, _synced, _deleted',
      
      // Reminder system
      reminders: 'id, store_id, branch_id, type, title, due_date, status, created_by, created_at, updated_at, _synced, _deleted',
      
      // Employee attendance
      employee_attendance: 'id, store_id, branch_id, employee_id, check_in_at, check_out_at, created_at, updated_at, _synced, _deleted',
      
      // Accounting foundation tables
      journal_entries: 'id, store_id, branch_id, transaction_id, entity_id, account_code, posted_date, created_at, [store_id+branch_id], [store_id+account_code], [entity_id+account_code], [transaction_id], _synced, _deleted',
      balance_snapshots: 'id, store_id, branch_id, account_code, entity_id, balance_usd, balance_lbp, snapshot_date, snapshot_type, verified, created_at, [store_id+branch_id], [store_id+account_code+entity_id+snapshot_date], [store_id+account_code+entity_id], [store_id+snapshot_date+snapshot_type], [store_id+snapshot_date], _synced, _deleted',
      entities: 'id, store_id, branch_id, entity_type, entity_code, name, is_system_entity, updated_at, [store_id+branch_id], [store_id+entity_type], [store_id+entity_code], [store_id+is_system_entity], _synced, _deleted',
      chart_of_accounts: 'id, store_id, branch_id, account_code, [store_id+account_code], account_name, updated_at, _synced, _deleted',
      
      // RBAC tables (Unified - replaces user_module_access)
      role_permissions: 'id, [role+operation], role, updated_at, _synced, _deleted', // GLOBAL permissions (no store_id)
      user_permissions: 'id, [user_id+store_id], [user_id+store_id+operation], user_id, store_id, updated_at, _synced, _deleted',
      
      // Sync management
      sync_metadata: 'id, table_name, last_synced_at',
      pending_syncs: 'id, table_name, record_id, operation, created_at, retry_count',
      sync_state: 'branch_id, last_seen_event_version, updated_at',
      
      // Subscription management tables
      subscriptions: 'id, store_id, tier, status, expires_at, last_validated_at, created_at, updated_at, _synced',
      license_validations: 'id, store_id, subscription_id, validation_type, validation_result, created_at',
      
      // Local authentication tables
      localPasswords: 'userId, passwordHash', // Legacy table for LocalAuthService
      localCredentials: 'userId, email, supabaseUserId' // Secure credential storage
    }).upgrade(trans => {
      console.log('🔧 Running migration v49: Add logo fields');
      console.log('   ✅ Added logo field to stores table (store-specific logo)');
      console.log('   ✅ Added logo field to branches table (can store base64 or URL)');
      console.log('   📢 Global logos are stored in Supabase Storage bucket "global-logos"');
      console.log('   📢 Branch logos can be base64 (custom) or URL (selected global logo)');
      // No data migration needed - new fields are nullable
    });

    // Migration for version 50 - add local authentication tables
    this.version(50).stores({
      // Store configuration
      stores: 'id, name, preferred_currency, preferred_language, preferred_commission_rate, exchange_rate, updated_at',
      branches: 'id, store_id, name, is_active, updated_at, _synced, _deleted',
      
      // Core tables
      products: 'id, store_id, branch_id, name, category, is_global, updated_at, _synced, _deleted',
      users: 'id, store_id, branch_id, email, name, role, updated_at, lbp_balance, usd_balance, working_hours_start, working_hours_end, working_days, _synced, _deleted',

      // Inventory tables
      inventory_items: 'id, store_id, branch_id, product_id, unit, quantity, weight, price, created_at, received_quantity, batch_id, selling_price, type, received_at, sku, currency, [store_id+branch_id], _synced, _deleted',
      transactions: 'id, store_id, branch_id, type, category, created_at, created_by, currency, customer_id, supplier_id, reversal_of_transaction_id, [store_id+branch_id], _synced, _deleted',
      inventory_bills: 'id, store_id, branch_id, supplier_id, received_at, created_by, currency, [store_id+branch_id], _synced, _deleted',
  
      // Bill management tables
      bills: 'id, store_id, branch_id, customer_id, bill_number, payment_method, payment_status, bill_date, status, created_by, created_at, [store_id+branch_id], _synced, _deleted',
      bill_line_items: 'id, store_id, branch_id, bill_id, inventory_item_id, product_id, created_at, [store_id+branch_id], [store_id+bill_id], _synced, _deleted',
      bill_audit_logs: 'id, store_id, branch_id, bill_id, action, changed_by, created_at, [store_id+branch_id], [store_id+bill_id], _synced, _deleted',
      
      // Cash drawer
      cash_drawer_sessions: 'id, store_id, branch_id, opened_by, opened_at, closed_at, status, [store_id+branch_id], [store_id+branch_id+status], _synced, _deleted',
      cash_drawer_accounts: 'id, store_id, branch_id, currency, created_at, updated_at, [store_id+branch_id], [store_id+branch_id+currency], _synced, _deleted',

      // Public access tokens
      public_access_tokens: 'id, customer_id, token, expires_at, created_at, _synced, _deleted',
      
      // Notification preferences
      notification_preferences: 'id, store_id, branch_id, updated_at, _synced, _deleted',
      
      // Reminder system
      reminders: 'id, store_id, branch_id, type, title, due_date, status, created_by, created_at, updated_at, _synced, _deleted',
      
      // Employee attendance
      employee_attendance: 'id, store_id, branch_id, employee_id, check_in_at, check_out_at, created_at, updated_at, _synced, _deleted',
      
      // Accounting foundation tables
      journal_entries: 'id, store_id, branch_id, transaction_id, entity_id, account_code, posted_date, created_at, [store_id+branch_id], [store_id+account_code], [entity_id+account_code], [transaction_id], _synced, _deleted',
      balance_snapshots: 'id, store_id, branch_id, account_code, entity_id, balance_usd, balance_lbp, snapshot_date, snapshot_type, verified, created_at, [store_id+branch_id], [store_id+account_code+entity_id+snapshot_date], [store_id+account_code+entity_id], [store_id+snapshot_date+snapshot_type], [store_id+snapshot_date], _synced, _deleted',
      entities: 'id, store_id, branch_id, entity_type, entity_code, name, is_system_entity, updated_at, [store_id+branch_id], [store_id+entity_type], [store_id+entity_code], [store_id+is_system_entity], _synced, _deleted',
      chart_of_accounts: 'id, store_id, branch_id, account_code, [store_id+account_code], account_name, updated_at, _synced, _deleted',
      
      // RBAC tables (Unified - replaces user_module_access)
      role_permissions: 'id, [role+operation], role, updated_at, _synced, _deleted', // GLOBAL permissions (no store_id)
      user_permissions: 'id, [user_id+store_id], [user_id+store_id+operation], user_id, store_id, updated_at, _synced, _deleted',
      
      // Sync management
      sync_metadata: 'id, table_name, last_synced_at',
      pending_syncs: 'id, table_name, record_id, operation, created_at, retry_count',
      sync_state: 'branch_id, last_seen_event_version, updated_at',
      
      // Subscription management tables
      subscriptions: 'id, store_id, tier, status, expires_at, last_validated_at, created_at, updated_at, _synced',
      license_validations: 'id, store_id, subscription_id, validation_type, validation_result, created_at',
      
      // Local authentication tables
      localPasswords: 'userId, passwordHash', // Legacy table for LocalAuthService
      localCredentials: 'userId, email, supabaseUserId' // Secure credential storage
    }).upgrade(trans => {
      console.log('🔧 Running migration v50: Add local authentication tables');
      console.log('   ✅ Added localPasswords table (legacy support)');
      console.log('   ✅ Added localCredentials table (secure credential storage)');
      // No data migration needed - new tables are empty
    });

    // Migration for version 51 - add P&L fields to inventory_bills
    this.version(51).stores({
      // Store configuration
      stores: 'id, name, preferred_currency, preferred_language, preferred_commission_rate, exchange_rate, updated_at',
      branches: 'id, store_id, name, is_active, updated_at, _synced, _deleted',
      
      // Core tables
      products: 'id, store_id, branch_id, name, category, is_global, updated_at, _synced, _deleted',
      users: 'id, store_id, branch_id, email, name, role, updated_at, lbp_balance, usd_balance, working_hours_start, working_hours_end, working_days, _synced, _deleted',

      // Inventory tables
      inventory_items: 'id, store_id, branch_id, product_id, unit, quantity, weight, price, created_at, received_quantity, batch_id, selling_price, type, received_at, sku, currency, [store_id+branch_id], _synced, _deleted',
      transactions: 'id, store_id, branch_id, type, category, created_at, created_by, currency, customer_id, supplier_id, reversal_of_transaction_id, [store_id+branch_id], _synced, _deleted',
      inventory_bills: 'id, store_id, branch_id, supplier_id, received_at, created_by, currency, closed_at, [store_id+branch_id], _synced, _deleted',
  
      // Bill management tables
      bills: 'id, store_id, branch_id, customer_id, bill_number, payment_method, payment_status, bill_date, status, created_by, created_at, [store_id+branch_id], _synced, _deleted',
      bill_line_items: 'id, store_id, branch_id, bill_id, inventory_item_id, product_id, created_at, [store_id+branch_id], [store_id+bill_id], _synced, _deleted',
      bill_audit_logs: 'id, store_id, branch_id, bill_id, action, changed_by, created_at, [store_id+branch_id], [store_id+bill_id], _synced, _deleted',
      
      // Cash drawer
      cash_drawer_sessions: 'id, store_id, branch_id, opened_by, opened_at, closed_at, status, [store_id+branch_id], [store_id+branch_id+status], _synced, _deleted',
      cash_drawer_accounts: 'id, store_id, branch_id, currency, created_at, updated_at, [store_id+branch_id], [store_id+branch_id+currency], _synced, _deleted',

      // Public access tokens
      public_access_tokens: 'id, customer_id, token, expires_at, created_at, _synced, _deleted',
      
      // Notification preferences
      notification_preferences: 'id, store_id, branch_id, updated_at, _synced, _deleted',
      
      // Reminder system
      reminders: 'id, store_id, branch_id, type, title, due_date, status, created_by, created_at, updated_at, _synced, _deleted',
      
      // Employee attendance
      employee_attendance: 'id, store_id, branch_id, employee_id, check_in_at, check_out_at, created_at, updated_at, _synced, _deleted',
      
      // Accounting foundation tables
      journal_entries: 'id, store_id, branch_id, transaction_id, entity_id, account_code, posted_date, created_at, [store_id+branch_id], [store_id+account_code], [entity_id+account_code], [transaction_id], _synced, _deleted',
      balance_snapshots: 'id, store_id, branch_id, account_code, entity_id, balance_usd, balance_lbp, snapshot_date, snapshot_type, verified, created_at, [store_id+branch_id], [store_id+account_code+entity_id+snapshot_date], [store_id+account_code+entity_id], [store_id+snapshot_date+snapshot_type], [store_id+snapshot_date], _synced, _deleted',
      entities: 'id, store_id, branch_id, entity_type, entity_code, name, is_system_entity, updated_at, [store_id+branch_id], [store_id+entity_type], [store_id+entity_code], [store_id+is_system_entity], _synced, _deleted',
      chart_of_accounts: 'id, store_id, branch_id, account_code, [store_id+account_code], account_name, updated_at, _synced, _deleted',
      
      // RBAC tables (Unified - replaces user_module_access)
      role_permissions: 'id, [role+operation], role, updated_at, _synced, _deleted', // GLOBAL permissions (no store_id)
      user_permissions: 'id, [user_id+store_id], [user_id+store_id+operation], user_id, store_id, updated_at, _synced, _deleted',
      
      // Sync management
      sync_metadata: 'id, table_name, last_synced_at',
      pending_syncs: 'id, table_name, record_id, operation, created_at, retry_count',
      sync_state: 'branch_id, last_seen_event_version, updated_at',
      
      // Subscription management tables
      subscriptions: 'id, store_id, tier, status, expires_at, last_validated_at, created_at, updated_at, _synced',
      license_validations: 'id, store_id, subscription_id, validation_type, validation_result, created_at',
      
      // Local authentication tables
      localPasswords: 'userId, passwordHash', // Legacy table for LocalAuthService
      localCredentials: 'userId, email, supabaseUserId' // Secure credential storage
    }).upgrade(trans => {
      console.log('🔧 Running migration v51: Add P&L fields to inventory_bills');
      console.log('   ✅ Added total_revenue, revenue_cash, revenue_card, revenue_credit fields');
      console.log('   ✅ Added total_cogs, gross_profit, gross_profit_margin fields');
      console.log('   ✅ Added closed_at index for filtering closed bills');
      // No data migration needed - new fields are nullable and will be populated when bills are closed
    });
  }

  /**
   * Ensures the database is properly initialized before any operations
   * This prevents "DatabaseClosedError" by guaranteeing the database is open
   * 
   * Features:
   * - Guards against multiple open() calls
   * - Handles IndexedDB corruption by resetting the database
   * - Ensures atomic initialization to prevent race conditions
   */
  async ensureOpen(): Promise<void> {
    // If already initialized and open, return immediately
    if (this._isInitialized && this.isOpen()) {
      return;
    }

    // If initialization is in progress, wait for it
    if (this._initPromise) {
      return this._initPromise;
    }

    // Start initialization
    this._initPromise = (async () => {
      try {
        // Explicit guard: only open if not already open
        if (!this.isOpen()) {
          console.log('🔄 Opening IndexedDB database...');
          await this.open();
          console.log('✅ IndexedDB database opened successfully');
        }
        this._isInitialized = true;
      } catch (err) {
        // Handle IndexedDB corruption - this is critical for POS systems
        console.error('❌ Dexie open failed, attempting corruption recovery:', err);
        
        try {
          // Delete corrupted database
          await Dexie.delete(this.name);
          console.log('🗑️ Deleted corrupted database, recreating...');
          
          // Recreate and reopen
          await this.open();
          console.log('✅ Database recreated and opened successfully after corruption recovery');
          this._isInitialized = true;
        } catch (recoveryError) {
          // If recovery also fails, reset state and throw
          console.error('❌ Corruption recovery failed:', recoveryError);
          this._isInitialized = false;
          this._initPromise = null;
          throw new Error(`Database initialization failed and recovery unsuccessful: ${recoveryError}`);
        }
      }
    })();

    return this._initPromise;
  }

  /**
   * Wraps a database operation with automatic initialization and error recovery
   */
  private async withDb<T>(operation: () => Promise<T>): Promise<T> {
    try {
      await this.ensureOpen();
      return await operation();
    } catch (error: any) {
      // If we get a DatabaseClosedError, try to recover by reopening
      if (error?.name === 'DatabaseClosedError' || error?.message?.includes('backing store')) {
        console.warn('⚠️ Database closed unexpectedly, attempting to reopen...');
        this._isInitialized = false;
        this._initPromise = null;
        
        try {
          await this.ensureOpen();
          return await operation();
        } catch (retryError) {
          console.error('❌ Failed to recover from database error:', retryError);
          throw retryError;
        }
      }
      throw error;
    }
  }

  async getCashDrawerAccount(storeId: string, branchId: string): Promise<CashDrawerAccount | null> {
    return this.withDb(async () => {
      // Validate inputs to prevent IDBKeyRange errors
      if (!storeId || !branchId || typeof storeId !== 'string' || typeof branchId !== 'string') {
        console.error('Invalid storeId or branchId:', { storeId, branchId });
        return null;
      }
      
      // First, check if any accounts exist for this store/branch (for debugging)
      const allAccounts = await this.cash_drawer_accounts
        .where(['store_id', 'branch_id'])
        .equals([storeId, branchId])
        .toArray();
      
  
      
      // Prefer an explicitly active account; treat undefined as active to support older records
      let account = await this.cash_drawer_accounts
        .where(['store_id', 'branch_id'])
        .equals([storeId, branchId])
        .filter(acc => {
          // Don't include deleted accounts
          if (acc._deleted) {
            console.log(`   ⚠️ Account ${acc.id} filtered out: _deleted=true`);
            return false;
          }
          
          // Check is_active field (primary field in interface)
          if ((acc as any).is_active === false) {
            console.log(`   ⚠️ Account ${acc.id} filtered out: is_active=false`);
            return false;
          }
          
          // Also check legacy isActive field for backward compatibility
          if ((acc as any).isActive === false) {
            console.log(`   ⚠️ Account ${acc.id} filtered out: isActive=false`);
            return false;
          }
          
          // If neither field is explicitly false, consider it active
          return true;
        })
        .first();
     
      if (account) {
        return account;
      }

      // Before creating a new account, check if cash_drawer_accounts table has been synced yet
      // This prevents creating duplicates when a full resync is still downloading the table
      // During full resync, tables are cleared first, then downloaded sequentially
      const syncMetadata = await this.getSyncMetadata('cash_drawer_accounts');
      const { syncService } = await import('../services/syncService');
      const isSyncing = syncService.isCurrentlyRunning();
      
      // If sync is running or table hasn't been synced yet, don't create a new account
      // Components should wait for sync to complete before accessing cash drawer accounts
      if (isSyncing || !syncMetadata) {
        console.log(`⏳ Sync in progress or table not synced yet. Returning null - account will be available after sync completes.`);
        return null;
      }

      // If no account found for specific branch, create a new one
      // NOTE: This account will be synced to Supabase. If a duplicate exists in Supabase,
      // the sync service will handle the conflict by deleting this local duplicate.
      console.log(`⚠️ No cash drawer account found for store ${storeId}, branch ${branchId}. Creating new account...`);
      console.log(`   ℹ️  Note: If account exists in Supabase, sync will resolve the duplicate automatically.`);
      
      // Get store to retrieve preferred currency
      const store = await this.stores.get(storeId);
      if (!store) {
        console.error(`❌ Store ${storeId} not found. Cannot create cash drawer account.`);
        return null;
      }

      // Verify branch exists
      const branch = await this.branches.get(branchId);
      if (!branch) {
        console.error(`❌ Branch ${branchId} not found. Cannot create cash drawer account.`);
        return null;
      }

      // Create new cash drawer account
      const now = new Date().toISOString();
      const newAccount: CashDrawerAccount = {
        id: uuidv4(),
        store_id: storeId,
        branch_id: branchId,
        account_code: '1100', // Cash account code
        name: 'Main Cash Drawer',
        currency: store.preferred_currency || 'USD',
        is_active: true,
        current_balance: 0,
        created_at: now,
        updated_at: now,
        _synced: false // Mark as unsynced so it will be uploaded to Supabase
      };

      try {
        // Add the new account to the database
        await this.cash_drawer_accounts.add(newAccount);
        
        // Verify the account was created successfully
        const verifiedAccount = await this.cash_drawer_accounts.get(newAccount.id);
        if (!verifiedAccount) {
          console.error(`❌ Failed to verify cash drawer account creation. Account ${newAccount.id} not found after add.`);
          return null;
        }
        
        console.log(`✅ Created new cash drawer account for store ${storeId}, branch ${branchId} (${newAccount.id})`);
        console.log(`   ℹ️  This account will be synced to Supabase. If a duplicate exists, sync service will handle it.`);
        return verifiedAccount;
      } catch (error) {
        console.error(`❌ Error creating cash drawer account:`, error);
        throw error;
      }
    });
  }

  async getCurrentCashDrawerSession(storeId: string, branchId: string): Promise<CashDrawerSession | null> {
    return this.withDb(async () => {
      // Validate inputs to prevent IDBKeyRange errors
      if (!storeId || !branchId || typeof storeId !== 'string' || typeof branchId !== 'string') {
        console.error('Invalid storeId or branchId:', { storeId, branchId });
        return null;
      }
      
      // Fetch all sessions for the store and branch
      const all = await this.cash_drawer_sessions
        .where(['store_id', 'branch_id'])
        .equals([storeId, branchId])
        .toArray();
      // Find open sessions, robust to whitespace/case issues
      const open = all.filter(sess => String(sess.status).trim().toLowerCase() === 'open');
      return open[0] || null;
    });
  }

  async openCashDrawerSession(
    storeId: string,
    branchId: string,
    accountId: string,
    openingAmount: number,
    openedBy: string
  ): Promise<string> {
    const sessionId = uuidv4();
    const now = new Date().toISOString();
    
    const session: CashDrawerSession = {
      id: sessionId,
      store_id: storeId,
      branch_id: branchId,
      created_at: now,
      updated_at: now,
      _synced: false,
      account_id: accountId,
      opened_by: openedBy,
      opened_at: now,
      opening_amount: openingAmount,
      status: 'open'
    };

    await this.cash_drawer_sessions.add(session);
    
    // Note: Balance is computed from journal entries, no need to update current_balance field
    
    return sessionId;
  }

  async closeCashDrawerSession(
    sessionId: string,
    actualAmount: number,
    closedBy: string,
    notes?: string
  ): Promise<void> {
    const session = await this.cash_drawer_sessions.get(sessionId);
    if (!session || session.status !== 'open') return;

    // Calculate expected amount from transactions
    const expectedAmount = await this.calculateExpectedCashDrawerAmount(sessionId, session.opening_amount);
    const variance = actualAmount - expectedAmount;
    const now = new Date().toISOString();

    // Update session
    await this.cash_drawer_sessions.update(sessionId, {
      closed_at: now,
      closed_by: closedBy,
      expected_amount: expectedAmount,
      actual_amount: actualAmount,
      variance,
      status: 'closed',
      notes,
      _synced: false
    });

    // Note: Balance is computed from journal entries, no need to update current_balance field
  }

  /**
   * Calculate expected cash drawer amount based on actual transactions during the session
   */
  private async calculateExpectedCashDrawerAmount(sessionId: string, openingAmount: number): Promise<number> {
    try {
      console.log(`Calculating expected amount for session ${sessionId} with opening amount ${openingAmount}`);
      
      // Get all cash transactions that occurred during this session
      const session = await this.cash_drawer_sessions.get(sessionId);
      if (!session) {
        console.warn('Session not found for expected amount calculation');
        return openingAmount;
      }

      const sessionStartTime = new Date(session.opened_at);
      const sessionEndTime = session.closed_at ? new Date(session.closed_at) : new Date();
      
      // Get all cash drawer transactions during this session period
      // These transactions are created by the cash drawer update service
      // and represent the actual cash flow affecting the physical drawer
      const cashDrawerTransactions = await this.transactions
        .filter(trans => 
          trans.category?.startsWith('cash_drawer_') &&
          new Date(trans.created_at) >= sessionStartTime &&
          new Date(trans.created_at) <= sessionEndTime
        )
        .toArray();
      
      console.log(`Found ${cashDrawerTransactions.length} cash drawer transactions during session`);

      // Calculate expected amount by applying all cash drawer transactions to the opening amount
      // Income transactions (sales, payments) increase the balance
      // Expense transactions decrease the balance
      let expectedAmount = openingAmount;
      
      for (const trans of cashDrawerTransactions) {
        if (trans.type === 'income') {
          expectedAmount += trans.amount || 0;
        } else if (trans.type === 'expense') {
          expectedAmount -= trans.amount || 0;
        }
      }
      
      console.log(`Cash flow calculation:`, {
        openingAmount,
        cashDrawerTransactions: cashDrawerTransactions.length,
        expectedAmount
      });
      
      return expectedAmount;
    } catch (error) {
      console.error('Error calculating expected cash drawer amount:', error);
      // Return opening amount as fallback
      return openingAmount;
    }
  }

  // Removed: updateCashDrawerBalance() - Balance is now computed from journal entries
  // Use calculateCashDrawerBalance() from utils/balanceCalculation instead

  /**
   * Get the chart of accounts entry linked to a cash drawer account
   * This leverages the FK relationship between cash_drawer_accounts and chart_of_accounts
   * @param cashDrawerAccountId - The ID of the cash drawer account
   * @returns The linked chart of accounts entry, or null if not found
   */
  async getChartOfAccountsForCashDrawer(cashDrawerAccountId: string): Promise<ChartOfAccounts | null> {
    return this.withDb(async () => {
      const cashDrawerAccount = await this.cash_drawer_accounts.get(cashDrawerAccountId);
      if (!cashDrawerAccount) {
        console.warn(`Cash drawer account not found: ${cashDrawerAccountId}`);
        return null;
      }

      // Use the compound index [store_id+account_code] to find the linked chart of accounts entry
      const chartAccount = await this.chart_of_accounts
        .where('[store_id+account_code]')
        .equals([cashDrawerAccount.store_id, cashDrawerAccount.account_code])
        .first();

      if (!chartAccount) {
        console.warn(`Chart of accounts entry not found for store: ${cashDrawerAccount.store_id}, account_code: ${cashDrawerAccount.account_code}`);
      }

      return chartAccount || null;
    });
  }

  /**
   * Validate that a cash drawer account has a valid account_code in chart_of_accounts
   * @param storeId - The store ID
   * @param accountCode - The account code to validate
   * @returns True if the account code exists in chart_of_accounts for the store
   */
  async validateCashDrawerAccountCode(storeId: string, accountCode: string): Promise<boolean> {
    return this.withDb(async () => {
      const chartAccount = await this.chart_of_accounts
        .where('[store_id+account_code]')
        .equals([storeId, accountCode])
        .first();
      
      return !!chartAccount;
    });
  }

  /**
   * Get cash drawer account with its linked chart of accounts info
   * Returns enriched cash drawer data including account type and name from chart of accounts
   */
  async getCashDrawerAccountWithChartInfo(storeId: string, branchId: string): Promise<(CashDrawerAccount & { 
    chart_account_name?: string; 
    chart_account_type?: string;
  }) | null> {
    return this.withDb(async () => {
      const account = await this.getCashDrawerAccount(storeId, branchId);
      if (!account) return null;

      const chartAccount = await this.chart_of_accounts
        .where('[store_id+account_code]')
        .equals([storeId, account.account_code])
        .first();

      return {
        ...account,
        chart_account_name: chartAccount?.account_name,
        chart_account_type: chartAccount?.account_type
      };
    });
  }

  async getCurrentCashDrawerStatus(storeId: string, branchId: string): Promise<any> {
    try {
      const currentSession = await this.getCurrentCashDrawerSession(storeId, branchId);

      if (!currentSession) {
        return {
          status: 'no_session',
          message: 'No active cash drawer session'
        };
      }

      // Get account for currency info
      const account = await this.cash_drawer_accounts
        .where(['store_id', 'branch_id'])
        .equals([storeId, branchId])
        .first();

      if (!account) {
        return {
          status: 'no_account',
          message: 'No cash drawer account found'
        };
      }

      // Calculate balance from journal entries (single source of truth)
      const currency = (account as any)?.currency || 'USD';
      const currentBalance = await calculateCashDrawerBalance(storeId, branchId, currency);

      return {
        status: 'active',
        sessionId: currentSession.id,
        openedBy: currentSession.opened_by,
        openedAt: currentSession.opened_at,
        openingAmount: currentSession.opening_amount,
        currentBalance,
        sessionDuration: Date.now() - new Date(currentSession.opened_at).getTime()
      };
    } catch (error) {
      console.error('Error getting current cash drawer status:', error);
      return {
        status: 'error',
        message: 'Error retrieving cash drawer status'
      };
    }
  }

  async getCashDrawerSessionDetails(sessionId: string): Promise<any> {
    try {
      const session = await this.cash_drawer_sessions.get(sessionId);
      if (!session) {
        throw new Error('Session not found');
      }

      const sessionStartTime = new Date(session.opened_at);
      const sessionEndTime = session.closed_at ? new Date(session.closed_at) : new Date();

      // Get all cash drawer transactions during this session period
      // These represent the actual cash flow affecting the physical drawer
      const cashDrawerTransactions = await this.transactions
        .filter(trans => 
          trans.category?.startsWith('cash_drawer_') &&
          new Date(trans.created_at) >= sessionStartTime &&
          new Date(trans.created_at) <= sessionEndTime
        )
        .toArray();

      // Group transactions by type for display
      const cashSales = cashDrawerTransactions.filter(trans => 
        trans.category === PAYMENT_CATEGORIES.CASH_DRAWER_SALE && trans.type === 'income'
      );
      
      const cashPayments = cashDrawerTransactions.filter(trans => 
        (trans.category === PAYMENT_CATEGORIES.CASH_DRAWER_PAYMENT || trans.category === PAYMENT_CATEGORIES.CASH_DRAWER_CUSTOMER_PAYMENT) && trans.type === 'income'
      );
      
      const cashExpenses = cashDrawerTransactions.filter(trans => 
        trans.category === PAYMENT_CATEGORIES.CASH_DRAWER_EXPENSE && trans.type === 'expense'
      );

      return {
        session,
        transactions: {
          sales: cashSales.map(trans => ({
            id: trans.id,
            product_name: trans.description?.split(' -')[0] || 'Sale',
            quantity: 1, // Transaction-based, so quantity is 1
            unit_price: trans.amount,
            received_value: trans.amount,
            created_at: trans.created_at
          })),
          payments: cashPayments.map(trans => ({
            id: trans.id,
            description: trans.description,
            amount: trans.amount,
            reference: trans.reference,
            created_at: trans.created_at
          })),
          expenses: cashExpenses.map(trans => ({
            id: trans.id,
            description: trans.description,
            amount: trans.amount,
            category: trans.category?.replace('cash_drawer_', ''),
            created_at: trans.created_at
          }))
        },
        totals: {
          sales: cashSales.reduce((sum, trans) => sum + trans.amount, 0),
          payments: cashPayments.reduce((sum, trans) => sum + trans.amount, 0),
          expenses: cashExpenses.reduce((sum, trans) => sum + trans.amount, 0)
        }
      };
    } catch (error) {
      console.error('Error getting session details:', error);
      throw error;
    }
  }

  async getCashDrawerBalanceReport(storeId: string, branchId: string, startDate?: string, endDate?: string): Promise<any> {
    try {
      let sessions = await this.cash_drawer_sessions
        .where(['store_id', 'branch_id'])
        .equals([storeId, branchId])
        .filter(sess => sess.status === 'closed')
        .toArray();

      // Filter by date range if provided
      if (startDate) {
        // If startDate is just a date (YYYY-MM-DD), include the entire day
        const startFilter = startDate.includes('T') ? startDate : `${startDate}T00:00:00.000Z`;
        sessions = sessions.filter(sess => sess.closed_at! >= startFilter);
      }
      if (endDate) {
        // If endDate is just a date (YYYY-MM-DD), include the entire day
        const endFilter = endDate.includes('T') ? endDate : `${endDate}T23:59:59.999Z`;
        sessions = sessions.filter(sess => sess.closed_at! <= endFilter);
      }

      // Sort by closing date (most recent first)
      sessions.sort((a, b) => new Date(b.closed_at!).getTime() - new Date(a.closed_at!).getTime());

      const reportData = sessions.map(session => ({
        id: session.id,
        sessionId: session.id,
        date: session.closed_at!,
        employeeName: session.closed_by || 'Unknown',
        openingAmount: session.opening_amount || 0,
        expectedAmount: session.expected_amount || 0,
        actualAmount: session.actual_amount || 0,
        variance: session.variance || 0,
        status: session.variance === 0 ? 'balanced' : 'unbalanced',
        closedBy: session.closed_by || 'Unknown',
        notes: session.notes || null
      }));

      const summary = {
        totalSessions: reportData.length,
        totalOpening: reportData.reduce((sum, session) => sum + session.openingAmount, 0),
        totalExpected: reportData.reduce((sum, session) => sum + session.expectedAmount, 0),
        totalActual: reportData.reduce((sum, session) => sum + session.actualAmount, 0),
        totalVariance: reportData.reduce((sum, session) => sum + session.variance, 0),
        balancedSessions: reportData.filter(session => session.variance === 0).length,
        unbalancedSessions: reportData.filter(session => session.variance !== 0).length,
        averageVariance: reportData.reduce((sum, session) => sum + session.variance, 0) / reportData.length
      };

      return {
        sessions: reportData,
        summary,
        generatedAt: new Date().toISOString()
      };

    } catch (error) {
      console.error('Error generating cash drawer balance report:', error);
      const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
      throw new Error(`Failed to generate cash drawer balance report: ${errorMessage}`);
    }
  }

  private addCreateFields = (primKey: any, obj: any, trans: any) => {
    const now = new Date().toISOString();
    if (!obj.id) obj.id = uuidv4();
    if (!obj.created_at) obj.created_at = now;
    if (obj._synced === undefined) obj._synced = false;
  };

  private addCreateFieldsWithUpdatedAt = (primKey: any, obj: any, trans: any) => {
    const now = new Date().toISOString();
    if (!obj.id) obj.id = uuidv4();
    if (!obj.created_at) obj.created_at = now;
    if (obj.updated_at === undefined) obj.updated_at = now;
    if (obj._synced === undefined) obj._synced = false;
  };

  private addUpdateFields = (modifications: any, primKey: any, obj: any, trans: any) => {
    modifications.updated_at = new Date().toISOString();
    if (modifications._synced === undefined) modifications._synced = false;
  };

  /**
   * Hook to automatically trigger sync when _synced: false is detected
   * This ensures all database write operations trigger sync, regardless of how they're called
   * Safe to call from Dexie hooks - defers execution until after transaction completes
   */
  private triggerSyncOnUnsynced = (primKey: any, obj: any, trans: any) => {
    // Only trigger if record is marked as unsynced
    if (obj._synced === false) {
      console.log(`🔄 [DB Hook] Creating record with _synced: false - ${trans?.table?.name || 'unknown'}/${primKey}`);
      // Defer execution to avoid blocking the transaction
      // Import dynamically to avoid circular dependencies
      setTimeout(() => {
        import('../services/syncTriggerService').then(({ syncTriggerService }) => {
          syncTriggerService.triggerSync();
        }).catch(err => {
          // Log error for debugging
          console.warn('⚠️ [DB Hook] Sync trigger service not available:', err);
        });
      }, 0);
    }
  };

  /**
   * Hook for update operations - triggers sync when _synced: false is set
   */
  private triggerSyncOnUpdate = (modifications: any, primKey: any, obj: any, trans: any) => {
    // Only trigger if _synced is being set to false
    if (modifications._synced === false || (modifications._synced === undefined && obj._synced === false)) {
      console.log(`🔄 [DB Hook] Updating record with _synced: false - ${trans?.table?.name || 'unknown'}/${primKey}`);
      // Defer execution to avoid blocking the transaction
      setTimeout(() => {
        import('../services/syncTriggerService').then(({ syncTriggerService }) => {
          syncTriggerService.triggerSync();
        }).catch(err => {
          console.warn('⚠️ [DB Hook] Sync trigger service not available:', err);
        });
      }, 0);
    }
  };

  // ⚠️ DEPRECATED: Hook for automatic cash drawer updates - NO LONGER USED
  // Cash drawer updates are now handled atomically within transactionService
  // This prevents race conditions, circular dependencies, and double-processing
  // Kept for reference only - DO NOT RE-ENABLE
  /*
  private handleTransactionCreated = async (primKey: any, obj: any, trans: any) => {
    try {
      if (obj.category && obj.category.startsWith('cash_drawer_')) {
        return;
      }
      const { cashDrawerUpdateService } = await import('../services/cashDrawerUpdateService');
      if (obj.type === 'expense') {
        await cashDrawerUpdateService.updateCashDrawerForExpense({
          amount: obj.amount,
          currency: obj.currency,
          storeId: obj.store_id,
          createdBy: obj.created_by,
          description: obj.description,
          category: obj.category,
          allowAutoSessionOpen: true
        });
      }
    } catch (error) {
      console.error('Error in transaction created hook:', error);
    }
  };
  */

  // Cash drawer updates now handled atomically by transactionService

  // Utility methods for sync management
  async markAsSynced(tableName: string, recordId: string) {
    const table = (this as any)[tableName];
    if (table) {
      await table.update(recordId, { 
        _synced: true, 
        _lastSyncedAt: new Date().toISOString() 
      });
    }
  }

  async getUnsyncedRecords(tableName: string) {
    const table = (this as any)[tableName];
    if (table) {
      return await table.filter((record: any) => record._synced === false).toArray();
    }
    return [];
  }

  async softDelete(tableName: string, recordId: string) {
    const table = (this as any)[tableName];
    if (table) {
      await table.update(recordId, { 
        _deleted: true, 
        _synced: false,
        updated_at: new Date().toISOString()
      });
    }
  }

  async addPendingSync(tableName: string, recordId: string, operation: 'create' | 'update' | 'delete', payload: any) {
    await this.pending_syncs.add({
      id: uuidv4(),
      table_name: tableName,
      record_id: recordId,
      operation,
      payload,
      created_at: new Date().toISOString(),
      retry_count: 0
    });
  }

  async getPendingSyncs() {
    return await this.pending_syncs.orderBy('created_at').toArray();
  }

  async removePendingSync(id: string) {
    await this.pending_syncs.delete(id);
  }

  async updateSyncMetadata(tableName: string, lastSyncedAt: string, syncToken?: string) {
    await this.sync_metadata.put({
      id: tableName,
      table_name: tableName,
      last_synced_at: lastSyncedAt,
      sync_token: syncToken
    });
  }

  async getSyncMetadata(tableName: string) {
    return await this.sync_metadata.get(tableName);
  }

  // Validation methods moved to dataValidationService for centralized validation logic
  // Use dataValidationService.validateRecords() and dataValidationService.autoFixRecord() instead
  
  async cleanupInvalidInventoryItems(): Promise<number> {
    return this.withDb(async () => {
      // Simple cleanup for truly invalid rows (negative quantities)
      const invalidItems = await this.inventory_items.filter(item => item.quantity < 0).toArray();
      
      if (invalidItems.length > 0) {
        await this.inventory_items.bulkDelete(invalidItems.map(item => item.id));
      }
      
      return invalidItems.length;
    });
  }

  async cleanupOrphanedRecords(storeId: string): Promise<number> {
    return this.withDb(async () => {
      // Note: For comprehensive validation, use dataValidationService.validateRecords()
      // This is a simple cleanup for obvious orphaned records
      
      // Include both store-specific and global products (inventory can reference global products)
      const products = await this.getAvailableProducts(storeId);
      const productIds = new Set(products.map(p => p.id));
      
      // Clean up orphaned inventory items (supplier_id was removed from inventory_items)
      // Inventory items now reference suppliers via inventory_bills.batch_id -> inventory_bills.supplier_id
      const orphanedInventory = await this.inventory_items
        .where('store_id').equals(storeId)
        .filter(item => !productIds.has(item.product_id))
        .toArray();
      
      let cleaned = 0;
      if (orphanedInventory.length > 0) {
        await this.inventory_items.bulkDelete(orphanedInventory.map(item => item.id));
        cleaned += orphanedInventory.length;
      }
      
      return cleaned;
    });
  }

  // ==================== GLOBAL PRODUCTS HELPER METHODS ====================
  
  /**
   * Get all products available to a specific store (both global and store-specific)
   * @param storeId - The store ID to get products for
   * @returns Array of products (global + store-specific)
   */
  async getAvailableProducts(storeId: string): Promise<Product[]> {
    return this.withDb(async () => {
      // Get global products - defensive approach to handle different value types
      const globalProducts = await this.products
        .where('is_global')
        .anyOf(1, true, '1', 'true')
        .filter(p => !p._deleted)
        .toArray();
      
      // Get store-specific products (excluding global)
      const storeProducts = await this.products
        .where('store_id')
        .equals(storeId)
        .filter(p => {
          const notDeleted = !p._deleted;
          const notGlobal = !(p.is_global === 1 || p.is_global === true || p.is_global === '1' || p.is_global === 'true');
          return notDeleted && notGlobal;
        })
        .toArray();
      
      // Combine and return
      return [...globalProducts, ...storeProducts];
    });
  }

  /**
   * Get only global predefined products
   * @returns Array of global products
   */
  async getGlobalProducts(): Promise<Product[]> {
    // Defensive approach to handle different value types for is_global
    return await this.products
      .where('is_global')
      .anyOf(1, true, '1', 'true')
      .filter(p => !p._deleted)
      .toArray();
  }


  /**
   * Get only store-specific products (excluding global)
   * @param storeId - The store ID
   * @returns Array of store-specific products
   */
  async getStoreSpecificProducts(storeId: string): Promise<Product[]> {
    return await this.products
      .where('store_id')
      .equals(storeId)
      .filter(p => {
        const notDeleted = !p._deleted;
        const notGlobal = !(p.is_global === 1 || p.is_global === true || p.is_global === '1' || p.is_global === 'true');
        return notDeleted && notGlobal;
      })
      .toArray();
  }

  /**
   * Create a global product (accessible to all stores)
   * @param productData - Product data without store_id
   * @returns The created product ID
   */
  async createGlobalProduct(productData: Omit<Product, 'id' | 'createdAt' | 'is_global'>): Promise<string> {
    const now = new Date().toISOString();
    const productId = uuidv4();
    
    const globalProduct: any = {
      id: productId,
      ...productData,
      store_id: 'global', // Use 'global' as a special store_id for global products
      is_global: true,
      created_at: now,
      updated_at: now,
      _synced: false,
      _deleted: false
    };
    
    await this.products.add(globalProduct);
    return productId;
  }

  /**
   * Create a store-specific product
   * @param storeId - The store ID
   * @param productData - Product data
   * @returns The created product ID
   */
  async createStoreProduct(storeId: string, productData: Omit<Product, 'id' | 'createdAt' | 'is_global'>): Promise<string> {
    const now = new Date().toISOString();
    const productId = uuidv4();
    
    const storeProduct: any = {
      id: productId,
      ...productData,
      store_id: storeId,
      is_global: false,
      created_at: now,
      updated_at: now,
      _synced: false,
      _deleted: false
    };
    
    await this.products.add(storeProduct);
    return productId;
  }

  /**
   * Check if a product is global
   * @param productId - The product ID
   * @returns True if the product is global, false otherwise
   */
  async isProductGlobal(productId: string): Promise<boolean> {
    const product = await this.products.get(productId);
    return product?.is_global === true;
  }

  // Bill management methods
  async createBillFromLineItems(lineItems: Omit<BillLineItem, 'id' | 'bill_id' | keyof BaseEntity>[], billData: Partial<Bill>, useSupabase: boolean = true): Promise<string> {
    // If using Supabase, delegate to SupabaseService
    if (useSupabase) {
      console.log('Using Supabase for bill creation - delegating to SupabaseService');
      return 'supabase-handled';
    }

    // Fallback to local database creation
    const billId = uuidv4();
    const now = new Date().toISOString();
    
    return await this.transaction('rw', [this.bills, this.bill_line_items, this.bill_audit_logs], async () => {
      // Create the bill
      const bill: Bill = {
        id: billId,
        store_id: billData.store_id!,
        branch_id: billData.branch_id!,
        created_at: now,
        updated_at: now,
        _synced: false,
        bill_number: billData.bill_number || generateBillReference(),
        customer_id: billData.customer_id || null,
        payment_method: billData.payment_method || 'cash',
        payment_status: billData.payment_status || 'paid',
        amount_paid: billData.amount_paid || 0,
        bill_date: billData.bill_date || now,
        notes: billData.notes || null,
        status: billData.status || 'active',
        created_by: billData.created_by!,
        last_modified_by: null
      };
      
      await this.bills.add(bill);
      
      // Create bill line items with proper field mapping
      const billLineItems: BillLineItem[] = lineItems.map((item, index) => ({
        id: uuidv4(),
        store_id: billData.store_id!,
        branch_id: billData.branch_id!,
        created_at: now,
        updated_at: now,
        _synced: false,
        bill_id: billId,
        product_id: item.product_id,
        inventory_item_id: item.inventory_item_id,
        quantity: item.quantity,
        unit_price: item.unit_price,
        line_total: item.line_total,
        weight: item.weight,
        notes: item.notes,
        line_order: item.line_order || index + 1,
        received_value: item.received_value
      }));
      
      await this.bill_line_items.bulkAdd(billLineItems);
      
      // Create audit log entry
      await this.bill_audit_logs.add({
        id: uuidv4(),
        store_id: billData.store_id!,
        branch_id: billData.branch_id!,
        created_at: now,
        updated_at: now,
        _synced: false,
        bill_id: billId,
        action: 'created',
        field_changed: null,
        old_value: null,
        new_value: JSON.stringify(bill),
        change_reason: 'Bill created from POS sale',
        changed_by: billData.created_by!,
        ip_address: null,
        user_agent: null,
      });

      return billId;
    });
  }

  async updateBill(billId: string, updates: Partial<Bill>, changedBy: string, changeReason?: string): Promise<void> {
    const originalBill = await this.bills.get(billId);
    if (!originalBill) throw new Error('Bill not found');
    
    return await this.transaction('rw', [this.bills, this.bill_audit_logs], async () => {
      const now = new Date().toISOString();
      
      // Update the bill
      await this.bills.update(billId, {
        ...updates,
        last_modified_by: changedBy,
        updated_at: now,
        _synced: false,
      });

      // Log each changed field
      for (const [field, newValue] of Object.entries(updates)) {
        if (field !== 'last_modified_by' && field !== 'last_modified_at' && field !== '_synced') {
          const oldValue = (originalBill as any)[field];
          if (oldValue !== newValue) {
            await this.bill_audit_logs.add({
              id: uuidv4(),
              store_id: originalBill.store_id,
              branch_id: originalBill.branch_id,
              created_at: now,
              updated_at: now,
              _synced: false,
              bill_id: billId,
              action: 'updated',
              field_changed: field,
              old_value: JSON.stringify(oldValue),
              new_value: JSON.stringify(newValue),
              change_reason: changeReason || 'Bill updated',
              changed_by: changedBy,
              ip_address: null,
              user_agent: null,
            });
          }
        }
      }
    });
  }

  async getBillsWithLineItems(storeId: string, filters?: {
    searchTerm?: string;
    dateFrom?: string;
    dateTo?: string;
    paymentStatus?: string;
    customerId?: string;
    status?: string;
    limit?: number;
    offset?: number;
  }): Promise<any[]> {
    let bills = await this.bills
      .where('store_id')
      .equals(storeId)
      .filter(bill => !bill._deleted)
      .toArray();
    
    // Apply filters
    if (filters?.searchTerm) {
      const searchLower = filters.searchTerm.toLowerCase();
      bills = bills.filter(bill => 
        bill.bill_number.toLowerCase().includes(searchLower) ||
        (bill.id && bill.id.toLowerCase().includes(searchLower)) ||
        (bill.notes && bill.notes.toLowerCase().includes(searchLower))
      );
    }
    
    if (filters?.dateFrom) {
      bills = bills.filter(bill => bill.bill_date >= filters.dateFrom!);
    }
    if (filters?.dateTo) {
      bills = bills.filter(bill => bill.bill_date <= filters.dateTo!);
    }
    if (filters?.paymentStatus) {
      bills = bills.filter(bill => bill.payment_status === filters.paymentStatus);
    }
    if (filters?.customerId) {
      bills = bills.filter(bill => bill.customer_id === filters.customerId);
    }
    if (filters?.status) {
      bills = bills.filter(bill => bill.status === filters.status);
    }
    
    // Sort by date
    bills.sort((a, b) => new Date(b.bill_date).getTime() - new Date(a.bill_date).getTime());
    
    // Apply pagination
    if (filters?.offset) {
      bills = bills.slice(filters.offset);
    }
    if (filters?.limit) {
      bills = bills.slice(0, filters.limit);
    }
    
    // Get line items and audit logs for each bill
    const billsWithDetails = await Promise.all(bills.map(async (bill) => {
      const [lineItems, auditLogs] = await Promise.all([
        this.bill_line_items.where('bill_id').equals(bill.id).sortBy('line_order'),
        this.bill_audit_logs.where('bill_id').equals(bill.id).reverse().sortBy('created_at')
      ]);
      
      return {
        ...bill,
        bill_line_items: lineItems,
        bill_audit_logs: auditLogs
      };
    }));
    
    return billsWithDetails;
  }

  async getBillDetails(billId: string): Promise<any | null> {
    const bill = await this.bills.get(billId);
    if (!bill) return null;
    
    const [lineItems, auditLogs] = await Promise.all([
      this.bill_line_items.where('bill_id').equals(billId).sortBy('line_order'),
      this.bill_audit_logs.where('bill_id').equals(billId).reverse().sortBy('created_at')
    ]);
    
    return {
      ...bill,
      bill_line_items: lineItems,
      bill_audit_logs: auditLogs
    };
  }

  // ==================== LINE ITEM AUDIT TRAIL FUNCTIONS ====================
  
  /**
   * Add a line item to a bill with audit trail
   */
  async addBillLineItem(
    billId: string,
    lineItem: Partial<BillLineItem>,
    addedBy: string
  ): Promise<string> {
    const bill = await this.bills.get(billId);
    if (!bill) throw new Error('Bill not found');

    const now = new Date().toISOString();
    const lineItemId = uuidv4();
    
    const newLineItem = {
      id: lineItemId,
      bill_id: billId,
      store_id: bill.store_id,
      branch_id: bill.branch_id,
      created_at: now,
      updated_at: now,
      _synced: false,
      ...lineItem
    } as BillLineItem;

    await this.transaction('rw', [this.bill_line_items, this.bill_audit_logs, this.products], async () => {
      await this.bill_line_items.add(newLineItem);

      // Resolve product name for audit log
      const product = await this.products.get(newLineItem.product_id);
      const productName = product?.name || 'Unknown Product';
      
      // Create audit log with descriptive reason
      const generatedReason = `Adding line item: ${productName} (Qty: ${newLineItem.quantity}, Price: ${newLineItem.unit_price})`;

      await this.bill_audit_logs.add({
        id: uuidv4(),
        store_id: bill.store_id,
        branch_id: bill.branch_id,
        created_at: now,
        updated_at: now,
        _synced: false,
        bill_id: billId,
        action: 'item_added',
        field_changed: 'line_items',
        old_value: null,
        new_value: JSON.stringify(newLineItem),
        change_reason: generatedReason,
        changed_by: addedBy,
        ip_address: null,
        user_agent: null
      });
    });

    return lineItemId;
  }

  /**
   * Update a line item with field-level audit trail and ID resolution
   */
  async updateBillLineItem(
    lineItemId: string,
    updates: Partial<BillLineItem>,
    updatedBy: string
  ): Promise<void> {
    const originalItem = await this.bill_line_items.get(lineItemId);
    if (!originalItem) throw new Error('Line item not found');

    const now = new Date().toISOString();

    await this.transaction('rw', [this.bill_line_items, this.bill_audit_logs, this.products], async () => {
      // Update the line item
      await this.bill_line_items.update(lineItemId, {
        ...updates,
        updated_at: now,
        _synced: false
      });

      // Create audit log for each changed field with ID resolution
      // Skip computed/automatic fields that are consequences of other changes
      const computedFields = ['line_total', 'received_value', 'updated_at', '_synced'];
      
      for (const [field, newValue] of Object.entries(updates)) {
        if (!computedFields.includes(field)) {
          const oldValue = (originalItem as any)[field];
          if (oldValue !== newValue) {
            // Resolve IDs to human-readable names
            let oldValueDisplay = oldValue != null ? String(oldValue) : 'empty';
            let newValueDisplay = newValue != null ? String(newValue) : 'empty';

            // Resolve product_id to product name
            if (field === 'product_id') {
              if (oldValue && typeof oldValue === 'string') {
                const oldProduct = await this.products.get(oldValue);
                oldValueDisplay = oldProduct?.name || oldValue;
              }
              if (newValue && typeof newValue === 'string') {
                const newProduct = await this.products.get(newValue);
                newValueDisplay = newProduct?.name || String(newValue);
              }
            }

            // Resolve product name for audit log
            const product = await this.products.get(originalItem.product_id);
            const productName = product?.name || 'Unknown Product';
            
            // Generate descriptive change reason
            const fieldLabel = field.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase());
            const generatedReason = `Modifying line item: ${fieldLabel} from ${oldValueDisplay} to ${newValueDisplay} (Product: ${productName})`;

            await this.bill_audit_logs.add({
              id: uuidv4(),
              store_id: originalItem.store_id,
              branch_id: originalItem.branch_id,
              created_at: now,
              updated_at: now,
              _synced: false,
              bill_id: originalItem.bill_id,
              action: 'item_modified',
              field_changed: field,
              old_value: oldValueDisplay !== 'empty' ? oldValueDisplay : null,
              new_value: newValueDisplay !== 'empty' ? newValueDisplay : null,
              change_reason: generatedReason,
              changed_by: updatedBy,
              ip_address: null,
              user_agent: null
            });
          }
        }
      }
    });
  }

  /**
   * Remove a line item with audit trail
   */
  async removeBillLineItem(
    lineItemId: string,
    removedBy: string
  ): Promise<void> {
    const lineItem = await this.bill_line_items.get(lineItemId);
    if (!lineItem) throw new Error('Line item not found');

    const now = new Date().toISOString();

    await this.transaction('rw', [this.bill_line_items, this.bill_audit_logs, this.products], async () => {
      // Soft delete the line item
      await this.bill_line_items.update(lineItemId, {
        _deleted: true,
        updated_at: now,
        _synced: false
      });

      // Resolve product name for audit log
      const product = await this.products.get(lineItem.product_id);
      const productName = product?.name || 'Unknown Product';
      
      // Create audit log with descriptive reason
      const generatedReason = `Removing line item: ${productName} (Qty: ${lineItem.quantity}, Price: ${lineItem.unit_price})`;

      await this.bill_audit_logs.add({
        id: uuidv4(),
        store_id: lineItem.store_id,
        branch_id: lineItem.branch_id,
        created_at: now,
        updated_at: now,
        _synced: false,
        bill_id: lineItem.bill_id,
        action: 'item_removed',
        field_changed: 'line_items',
        old_value: JSON.stringify(lineItem),
        new_value: null,
        change_reason: generatedReason,
        changed_by: removedBy,
        ip_address: null,
        user_agent: null
      });
    });
  }

  /**
   * Update bill line item totals after modification
   * Note: Bill totals (subtotal, total_amount, amount_due) are now computed dynamically,
   * not stored in the database
   */
  async updateBillsForLineItem(lineItemId: string): Promise<void> {
    try {
      // Find the bill line item
      const lineItem = await this.bill_line_items.get(lineItemId);
      if (!lineItem) {
        console.warn('Bill line item not found for update:', lineItemId);
        return;
      }

      // Update the line item totals
      await this.bill_line_items.update(lineItemId, {
        line_total: lineItem.quantity * lineItem.unit_price,
        received_value: lineItem.quantity * lineItem.unit_price,
        _synced: false
      });

      console.log(`Updated bill line item ${lineItemId}`);
    } catch (error) {
      console.error('Error updating bill line item:', error);
    }
  }
}

// Singleton pattern: ensure only one database instance exists
let dbInstance: POSDatabase | null = null;

/**
 * Get the singleton database instance
 * This ensures only one POSDatabase instance exists across the entire application
 */
export function getDB(): POSDatabase {
  if (!dbInstance) {
    dbInstance = new POSDatabase();
  }
  return dbInstance;
}

// Re-export Bill type for convenience
export type { Bill } from '../types';



  // Hook testing function removed - hooks no longer used for sales

 

// Export utility functions
export const createId = () => uuidv4();

export const createBaseEntity = (storeId: string, data: Partial<BaseEntity> = {}): Partial<BaseEntity> => {
  const now = new Date().toISOString();
  // Ensure ID is always valid - use provided ID only if it's valid, otherwise generate one
  const providedId = data.id && typeof data.id === 'string' && data.id.trim() !== '' ? data.id : null;
  const finalId = providedId || createId();
  
  return {
    ...data,
    id: finalId, // Ensure ID is always set correctly
    store_id: storeId,
    created_at: now,
    updated_at: now,
    _synced: false
  };
};