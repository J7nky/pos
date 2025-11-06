import Dexie, { Table } from 'dexie';
import { v4 as uuidv4 } from 'uuid';
import { Database } from '../types/database';
import { generateBillReference } from '../utils/referenceGenerator';
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
  BillAuditLog,
  SyncMetadata,
  PendingSync,
  Employee,
  NotificationRecord,
  NotificationPreferences,
  Reminder,
  EmployeeAttendance
} from '../types';

type Tables = Database['public']['Tables'];

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
  
  // Core tables
  products!: Table<Product, string>;
  suppliers!: Table<Supplier, string>;
  customers!: Table<Customer, string>;
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
  cash_drawer_accounts!: Table<CashDrawerAccount, string>;
  cash_drawer_sessions!: Table<CashDrawerSession, string>;
  missed_products!: Table<MissedProduct, string>;
  notifications!: Table<NotificationRecord, string>;
  notification_preferences!: Table<NotificationPreferences, string>;
  reminders!: Table<Reminder, string>;
  employee_attendance!: Table<EmployeeAttendance, string>;
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

    // Migration for version 5 - update existing records to match new schema
    this.version(5).upgrade(trans => {
      console.log('🔄 Running migration v5: Updating existing records to match new schema');
      
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
    // Tables WITH updated_at: products, suppliers, customers, users
    this.products.hook('creating', this.addCreateFieldsWithUpdatedAt);
    this.suppliers.hook('creating', this.addCreateFieldsWithUpdatedAt);
    this.customers.hook('creating', this.addCreateFieldsWithUpdatedAt);
    this.users.hook('creating', this.addCreateFieldsWithUpdatedAt);

    // Tables WITHOUT updated_at: inventory_items, inventory_bills
    this.inventory_items.hook('creating', this.addCreateFields);
    this.inventory_bills.hook('creating', this.addCreateFields);

    // Add hooks for automatic cash drawer updates
    (this.transactions as any).hook('creating', this.handleTransactionCreated);

    // Only add update hooks for tables that have updated_at
    this.products.hook('updating', this.addUpdateFields);
    this.suppliers.hook('updating', this.addUpdateFields);
    this.customers.hook('updating', this.addUpdateFields);
    this.users.hook('updating', this.addUpdateFields);

    // Bill management hooks
    this.bills.hook('creating', this.addCreateFieldsWithUpdatedAt);
    this.bill_line_items.hook('creating', this.addCreateFields);
    this.bill_audit_logs.hook('creating', this.addCreateFields);
    this.bills.hook('updating', this.addUpdateFields);

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
  }
  async getCashDrawerAccount(storeId: string): Promise<CashDrawerAccount | null> {
  
    
 
    // Prefer an explicitly active account; treat undefined as active to support older records
    let account = await this.cash_drawer_accounts
      .where('store_id')
      .equals(storeId)
      .filter(acc => {
        // Don't include deleted accounts
        if (acc._deleted) return false;
        
        // Check is_active field (primary field in interface)
        if ((acc as any).is_active === false) return false;
        
        // Also check legacy isActive field for backward compatibility
        if ((acc as any).isActive === false) return false;
        
        // If neither field is explicitly false, consider it active
        return true;
      })
      .first();
   
    
    if (account) return account;



    console.log('❌ No cash drawer account found for store:', storeId);
    return null;
  }

  async getCurrentCashDrawerSession(storeId: string): Promise<CashDrawerSession | null> {
    // Fetch all sessions for the store
    const all = await this.cash_drawer_sessions.where('store_id').equals(storeId).toArray();
    // console.log('DEBUG: All sessions for store', storeId, all);
    // Find open sessions, robust to whitespace/case issues
    const open = all.filter(sess => String(sess.status).trim().toLowerCase() === 'open');
    // console.log('DEBUG: Open sessions for store', storeId, open);
    return open[0] || null;
  }

  async openCashDrawerSession(
    storeId: string,
    accountId: string,
    openingAmount: number,
    openedBy: string
  ): Promise<string> {
    const sessionId = uuidv4();
    const now = new Date().toISOString();
    
    const session: CashDrawerSession = {
      id: sessionId,
      store_id: storeId,
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
    
    // Update account balance
    await this.updateCashDrawerBalance(accountId, openingAmount, true);
    
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

    // Update account balance
    await this.updateCashDrawerBalance(session.account_id, expectedAmount, false); // Remove expected
    await this.updateCashDrawerBalance(session.account_id, actualAmount, true); // Add actual
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

  private async updateCashDrawerBalance(accountId: string, amount: number, isDebit: boolean): Promise<void> {
    const account = await this.cash_drawer_accounts.get(accountId);
    if (account) {
      const balanceChange = isDebit ? amount : -amount;
      await this.cash_drawer_accounts.update(accountId, {
        current_balance: (account as any).current_balance + balanceChange,
        _synced: false
      } as any);
    }
  }

  async getCurrentCashDrawerStatus(storeId: string): Promise<any> {
    try {
      const currentSession = await this.getCurrentCashDrawerSession(storeId);

      if (!currentSession) {
        return {
          status: 'no_session',
          message: 'No active cash drawer session'
        };
      }

      // Get current balance from account
      const account = await this.cash_drawer_accounts
        .where('store_id')
        .equals(storeId)
        .first();

      if (!account) {
        return {
          status: 'no_account',
          message: 'No cash drawer account found'
        };
      }

      return {
        status: 'active',
        sessionId: currentSession.id,
        openedBy: currentSession.opened_by,
        openedAt: currentSession.opened_at,
        openingAmount: currentSession.opening_amount,
        currentBalance: account.current_balance || 0,
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
        trans.category === 'cash_drawer_sale' && trans.type === 'income'
      );
      
      const cashPayments = cashDrawerTransactions.filter(trans => 
        (trans.category === 'cash_drawer_payment' || trans.category === 'cash_drawer_customer_payment') && trans.type === 'income'
      );
      
      const cashExpenses = cashDrawerTransactions.filter(trans => 
        trans.category === 'cash_drawer_expense' && trans.type === 'expense'
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

  async getCashDrawerBalanceReport(storeId: string, startDate?: string, endDate?: string): Promise<any> {
    try {
      let sessions = await this.cash_drawer_sessions
        .where('store_id')
        .equals(storeId)
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

  // Hook for automatic cash drawer updates when transactions are created
  private handleTransactionCreated = async (primKey: any, obj: any, trans: any) => {
    try {
      // Only process cash drawer related transactions
      if (obj.category && obj.category.startsWith('cash_drawer_')) {
        return; // Skip to avoid infinite loops
      }

      // Import the service dynamically to avoid circular dependencies
      const { cashDrawerUpdateService } = await import('../services/cashDrawerUpdateService');
      
      // Determine transaction type and update cash drawer accordingly
      if (obj.type === 'income' && obj.category === 'Customer Payment') {
        // await cashDrawerUpdateService.updateCashDrawerForCustomerPayment({
        //   amount: obj.amount,
        //   currency: obj.currency,
        //   storeId: obj.store_id,
        //   createdBy: obj.created_by,
        //   customerId: obj.reference?.replace('PAY-', '') || '',
        //   description: obj.description,
        //   allowAutoSessionOpen: true // Allow automatic session opening for hooks
        // });
      } else if (obj.type === 'expense') {
        await cashDrawerUpdateService.updateCashDrawerForExpense({
          amount: obj.amount,
          currency: obj.currency,
          storeId: obj.store_id,
          createdBy: obj.created_by,
          description: obj.description,
          category: obj.category,
          allowAutoSessionOpen: true // Allow automatic session opening for hooks
        });
      }
    } catch (error) {
      console.error('Error in transaction created hook:', error);
    }
  };

  // Sale items hook removed - cash drawer updates now handled directly in addSale function

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
    // Simple cleanup for truly invalid rows (negative quantities)
    const invalidItems = await this.inventory_items.filter(item => item.quantity < 0).toArray();
    
    if (invalidItems.length > 0) {
      await this.inventory_items.bulkDelete(invalidItems.map(item => item.id));
    }
    
    return invalidItems.length;
  }

  async cleanupOrphanedRecords(storeId: string): Promise<number> {
    // Note: For comprehensive validation, use dataValidationService.validateRecords()
    // This is a simple cleanup for obvious orphaned records
    
    const products = await this.products.where('store_id').equals(storeId).toArray();
    const suppliers = await this.suppliers.where('store_id').equals(storeId).toArray();
    const productIds = new Set(products.map(p => p.id));
    const supplierIds = new Set(suppliers.map(s => s.id));
    
    // Clean up orphaned inventory items
    const orphanedInventory = await this.inventory_items
      .where('store_id').equals(storeId)
      .filter(item => !productIds.has(item.product_id) || !supplierIds.has(item.supplier_id))
      .toArray();
    
    let cleaned = 0;
    if (orphanedInventory.length > 0) {
      await this.inventory_items.bulkDelete(orphanedInventory.map(item => item.id));
      cleaned += orphanedInventory.length;
    }
    
    return cleaned;
  }

  // ==================== GLOBAL PRODUCTS HELPER METHODS ====================
  
  /**
   * Get all products available to a specific store (both global and store-specific)
   * @param storeId - The store ID to get products for
   * @returns Array of products (global + store-specific)
   */
  async getAvailableProducts(storeId: string): Promise<Product[]> {
    // Get global products
    const globalProducts = await this.products
      .where('is_global')
      .equals(1) // Dexie stores boolean as 0 or 1
      .filter(p => !p._deleted)
      .toArray();
    
    // Get store-specific products
    const storeProducts = await this.products
      .where('store_id')
      .equals(storeId)
      .filter(p => !p._deleted && !p.is_global)
      .toArray();
    
    // Combine and return
    return [...globalProducts, ...storeProducts];
  }

  /**
   * Get only global predefined products
   * @returns Array of global products
   */
  async getGlobalProducts(): Promise<Product[]> {
    return await this.products
      .where('is_global')
      .equals(1)
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
      .filter(p => !p._deleted && !p.is_global)
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
        created_at: now,
        updated_at: now,
        _synced: false,
        bill_number: billData.bill_number || generateBillReference(),
        customer_id: billData.customer_id || null,
        subtotal: billData.subtotal || 0,
        total_amount: billData.total_amount || 0,
        payment_method: billData.payment_method || 'cash',
        payment_status: billData.payment_status || 'paid',
        amount_paid: billData.amount_paid || 0,
        amount_due: billData.amount_due || 0,
        bill_date: billData.bill_date || now,
        notes: billData.notes || null,
        status: billData.status || 'active',
        created_by: billData.created_by!,
        last_modified_by: null,
        last_modified_at: null
      };
      
      await this.bills.add(bill);
      
      // Create bill line items with proper field mapping
      const billLineItems: BillLineItem[] = lineItems.map((item, index) => ({
        id: uuidv4(),
        store_id: billData.store_id!,
        created_at: now,
        updated_at: now,
        _synced: false,
        bill_id: billId,
        product_id: item.product_id,
        product_name: item.product_name,
        supplier_id: item.supplier_id,
        supplier_name: item.supplier_name,
        inventory_item_id: item.inventory_item_id,
        quantity: item.quantity,
        unit_price: item.unit_price,
        line_total: item.line_total,
        weight: item.weight,
        notes: item.notes,
        line_order: item.line_order || index + 1,
        payment_method: item.payment_method,
        customer_id: item.customer_id,
        created_by: item.created_by,
        received_value: item.received_value
      }));
      
      await this.bill_line_items.bulkAdd(billLineItems);
      
      // Create audit log entry
      await this.bill_audit_logs.add({
        id: uuidv4(),
        store_id: billData.store_id!,
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
        last_modified_at: now,
        _synced: false
      });
      
      // Log each changed field
      for (const [field, newValue] of Object.entries(updates)) {
        if (field !== 'last_modified_by' && field !== 'last_modified_at' && field !== '_synced') {
          const oldValue = (originalBill as any)[field];
          if (oldValue !== newValue) {
            await this.bill_audit_logs.add({
              id: uuidv4(),
              store_id: originalBill.store_id,
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
            });
          }
        }
      }
    });
  }

  async deleteBill(billId: string, deletedBy: string, deleteReason?: string, softDelete: boolean = true): Promise<void> {
    const bill = await this.bills.get(billId);
    if (!bill) throw new Error('Bill not found');
    
    return await this.transaction('rw', [this.bills, this.bill_line_items, this.bill_audit_logs, this.inventory_items], async () => {
      const now = new Date().toISOString();
      
      if (softDelete) {
        // Soft delete - mark as deleted but keep in database
        await this.bills.update(billId, {
          status: 'cancelled',
          last_modified_by: deletedBy,
          last_modified_at: now,
          _synced: false,
          _deleted: true
        });
      } else {
        // Hard delete - remove from database
        await this.bills.delete(billId);
        await this.bill_line_items.where('bill_id').equals(billId).delete();
      }
      
      // Restore inventory quantities for deleted bill
      const lineItems = await this.bill_line_items.where('bill_id').equals(billId).toArray();
      for (const lineItem of lineItems) {
        if (lineItem.inventory_item_id) {
          const inventoryItem = await this.inventory_items.get(lineItem.inventory_item_id);
          if (inventoryItem) {
            await this.inventory_items.update(lineItem.inventory_item_id, {
              quantity: inventoryItem.quantity + lineItem.quantity,
              _synced: false
            });
          }
        }
      }
      
      // Create audit log entry
      await this.bill_audit_logs.add({
        id: uuidv4(),
        store_id: bill.store_id,
        created_at: now,
        updated_at: now,
        _synced: false,
        bill_id: billId,
        action: 'deleted',
        field_changed: 'status',
        old_value: bill.status,
        new_value: softDelete ? 'cancelled' : 'deleted',
        change_reason: deleteReason || 'Bill deleted',
        changed_by: deletedBy,
        ip_address: null,
      });
    });
  }

  async getBillsWithDetails(storeId: string, includeDeleted: boolean = false): Promise<any[]> {
    const bills = await this.bills
      .where('store_id')
      .equals(storeId)
      .filter(bill => includeDeleted || !bill._deleted)
      .toArray();
    
    const billsWithDetails = await Promise.all(bills.map(async (bill) => {
      const lineItems = await this.bill_line_items.where('bill_id').equals(bill.id).toArray();
      const auditLogs = await this.bill_audit_logs.where('bill_id').equals(bill.id).toArray();
      
      return {
        ...bill,
        lineItems,
        auditLogs: auditLogs.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
      };
    }));
    
    return billsWithDetails.sort((a, b) => new Date(b.bill_date).getTime() - new Date(a.bill_date).getTime());
  }

  async addBillLineItem(billId: string, lineItem: Omit<BillLineItem, 'id' | 'bill_id' | keyof BaseEntity>, addedBy: string): Promise<void> {
    const bill = await this.bills.get(billId);
    if (!bill) throw new Error('Bill not found');
    
    return await this.transaction('rw', [this.bill_line_items, this.bills, this.bill_audit_logs], async () => {
      const now = new Date().toISOString();
      const lineItemId = uuidv4();
      
      // Get next line order
      const existingItems = await this.bill_line_items.where('bill_id').equals(billId).toArray();
      const nextOrder = Math.max(0, ...existingItems.map(item => item.line_order)) + 1;
      
      const newLineItem: BillLineItem = {
        id: lineItemId,
        store_id: bill.store_id,
        created_at: now,
        updated_at: now,
        _synced: false,
        bill_id: billId,
        ...lineItem,
        line_order: nextOrder
      };
      
      await this.bill_line_items.add(newLineItem);
      
      // Recalculate bill totals
      await this.recalculateBillTotals(billId);
      
      // Create audit log
      await this.bill_audit_logs.add({
        id: uuidv4(),
        store_id: bill.store_id,
        created_at: now,
        updated_at: now,
        _synced: false,
        bill_id: billId,
        action: 'item_added',
        field_changed: 'line_items',
        old_value: null,
        new_value: JSON.stringify(newLineItem),
        change_reason: 'Line item added to bill',
        changed_by: addedBy,
        ip_address: null,
      });
    });
  }

  async updateBillLineItem(lineItemId: string, updates: Partial<BillLineItem>, updatedBy: string): Promise<void> {
    const originalItem = await this.bill_line_items.get(lineItemId);
    if (!originalItem) throw new Error('Line item not found');
    
    return await this.transaction('rw', [this.bill_line_items, this.bills, this.bill_audit_logs], async () => {
      const now = new Date().toISOString();
      
      // Update line item
      await this.bill_line_items.update(lineItemId, {
        ...updates,
        _synced: false
      });
      
      // Recalculate bill totals
      await this.recalculateBillTotals(originalItem.bill_id);
      
      // Create audit log for each changed field
      for (const [field, newValue] of Object.entries(updates)) {
        if (field !== '_synced') {
          const oldValue = (originalItem as any)[field];
          if (oldValue !== newValue) {
            await this.bill_audit_logs.add({
              id: uuidv4(),
              store_id: originalItem.store_id,
              created_at: now,
              updated_at: now,
              _synced: false,
              bill_id: originalItem.bill_id,
              action: 'item_modified',
              field_changed: field,
              old_value: JSON.stringify(oldValue),
              new_value: JSON.stringify(newValue),
              change_reason: 'Line item updated',
              changed_by: updatedBy,
              ip_address: null,
            });
          }
        }
      }
    });
  }

  async removeBillLineItem(lineItemId: string, removedBy: string): Promise<void> {
    const lineItem = await this.bill_line_items.get(lineItemId);
    if (!lineItem) throw new Error('Line item not found');
    
    return await this.transaction('rw', [this.bill_line_items, this.bills, this.bill_audit_logs, this.inventory_items], async () => {
      const now = new Date().toISOString();
      
      // Restore inventory if applicable
      if (lineItem.inventory_item_id) {
        const inventoryItem = await this.inventory_items.get(lineItem.inventory_item_id);
        if (inventoryItem) {
          await this.inventory_items.update(lineItem.inventory_item_id, {
            quantity: inventoryItem.quantity + lineItem.quantity,
            _synced: false
          });
        }
      }
      
      // Remove line item
      await this.bill_line_items.delete(lineItemId);
      
      // Recalculate bill totals
      await this.recalculateBillTotals(lineItem.bill_id);
      
      // Create audit log
      await this.bill_audit_logs.add({
        id: uuidv4(),
        store_id: lineItem.store_id,
        created_at: now,
        updated_at: now,
        _synced: false,
        bill_id: lineItem.bill_id,
        action: 'item_removed',
        field_changed: 'line_items',
        old_value: JSON.stringify(lineItem),
        new_value: null,
        change_reason: 'Line item removed from bill',
        changed_by: removedBy,
        ip_address: null,
      });
    });
  }

  private async recalculateBillTotals(billId: string): Promise<void> {
    const lineItems = await this.bill_line_items.where('bill_id').equals(billId).toArray();
    const subtotal = lineItems.reduce((sum, item) => sum + item.line_total, 0);
    
    const bill = await this.bills.get(billId);
    if (bill) {
      const totalAmount = subtotal;
      
      await this.bills.update(billId, {
        subtotal,
        total_amount: totalAmount,
        amount_due: totalAmount - (bill.amount_paid || 0),
        _synced: false
      });
    }
  }

  // New method to find and update bills related to a bill line item
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

      // Recalculate the bill totals
      await this.recalculateBillTotals(lineItem.bill_id);

      console.log(`Updated bill line item ${lineItemId} and recalculated bill totals`);
    } catch (error) {
      console.error('Error updating bill line item:', error);
    }
  }

  async getBillAuditTrail(billId: string): Promise<BillAuditLog[]> {
    return await this.bill_audit_logs
      .where('bill_id')
      .equals(billId)
      .reverse()
      .sortBy('created_at');
  }

  async searchBills(storeId: string, searchTerm: string, filters: {
    dateFrom?: string;
    dateTo?: string;
    paymentStatus?: string;
    customerId?: string;
    status?: string;
  } = {}): Promise<any[]> {
    let bills = await this.bills
      .where('store_id')
      .equals(storeId)
      .filter(bill => !bill._deleted)
      .toArray();
    
    // Apply search term
    if (searchTerm) {
      const searchLower = searchTerm.toLowerCase();
      bills = bills.filter(bill => 
        bill.bill_number.toLowerCase().includes(searchLower) ||
        (bill.id && bill.id.toLowerCase().includes(searchLower)) ||
        (bill.notes && bill.notes.toLowerCase().includes(searchLower))
      );
    }
    
    // Apply filters
    if (filters.dateFrom) {
      bills = bills.filter(bill => bill.bill_date >= filters.dateFrom!);
    }
    if (filters.dateTo) {
      bills = bills.filter(bill => bill.bill_date <= filters.dateTo!);
    }
    if (filters.paymentStatus) {
      bills = bills.filter(bill => bill.payment_status === filters.paymentStatus);
    }
    if (filters.customerId) {
      bills = bills.filter(bill => bill.customer_id === filters.customerId);
    }
    if (filters.status) {
      bills = bills.filter(bill => bill.status === filters.status);
    }
    
    // Get line items for each bill
    const billsWithDetails = await Promise.all(bills.map(async (bill) => {
      const lineItems = await this.bill_line_items.where('bill_id').equals(bill.id).toArray();
      return { ...bill, lineItems };
    }));
    
    return billsWithDetails.sort((a, b) => new Date(b.bill_date).getTime() - new Date(a.bill_date).getTime());
  }

  // Enhanced bill management methods for offline support
  async createBillWithLineItems(
    billData: any,
    lineItems: Omit<BillLineItem, 'id' | 'bill_id' | keyof BaseEntity>[]
  ): Promise<string> {
    const billId = uuidv4();
    const now = new Date().toISOString();
    
    return await this.transaction('rw', [this.bills, this.bill_line_items, this.bill_audit_logs], async () => {
      // Create the bill
      const bill: Bill = {
        id: billId,
        store_id: billData?.store_id,
        created_at: now,
        updated_at: now,
        _synced: false,
        ...billData
      };
      
      await this.bills.add(bill);
      
      // Create bill line items
      const billLineItems: BillLineItem[] = lineItems.map((item, index) => ({
        id: uuidv4(),
        store_id: billData.store_id,
        created_at: now,
        updated_at: now,
        _synced: false,
        bill_id: billId,
        ...item,
        line_order: index + 1,

      }));
      
      await this.bill_line_items.bulkAdd(billLineItems);
      
      // Create audit log entry
      await this.bill_audit_logs.add({
        id: uuidv4(),
        store_id: billData.store_id,
        created_at: now,
        updated_at: now,
        _synced: false,
        bill_id: billId,
        action: 'created',
        field_changed: null,
        old_value: null,
        new_value: JSON.stringify(bill),
        change_reason: 'Bill created from POS transaction',
        changed_by: billData.created_by,
        ip_address: null,
      });
      
      return billId;
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
      created_at: now,
      updated_at: now,
      _synced: false,
      ...lineItem
    } as BillLineItem;

    await this.transaction('rw', [this.bill_line_items, this.bill_audit_logs], async () => {
      await this.bill_line_items.add(newLineItem);

      // Create audit log with descriptive reason
      const generatedReason = `Adding line item: ${newLineItem.product_name} (Qty: ${newLineItem.quantity}, Price: ${newLineItem.unit_price})`;

      await this.bill_audit_logs.add({
        id: uuidv4(),
        store_id: bill.store_id,
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

    await this.transaction('rw', [this.bill_line_items, this.bill_audit_logs], async () => {
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
              if (oldValue) {
                const oldProduct = await this.products.get(oldValue);
                oldValueDisplay = oldProduct?.name || oldValue;
              }
              if (newValue) {
                const newProduct = await this.products.get(newValue);
                newValueDisplay = newProduct?.name || newValue;
              }
            }

            // Resolve supplier_id to supplier name
            if (field === 'supplier_id') {
              if (oldValue) {
                const oldSupplier = await this.suppliers.get(oldValue);
                oldValueDisplay = oldSupplier?.name || oldValue;
              }
              if (newValue) {
                const newSupplier = await this.suppliers.get(newValue);
                newValueDisplay = newSupplier?.name || newValue;
              }
            }

            // Resolve customer_id to customer name
            if (field === 'customer_id') {
              if (oldValue) {
                const oldCustomer = await this.customers.get(oldValue);
                oldValueDisplay = oldCustomer?.name || oldValue;
              } else {
                oldValueDisplay = 'None';
              }
              if (newValue) {
                const newCustomer = await this.customers.get(newValue);
                newValueDisplay = newCustomer?.name || newValue;
              } else {
                newValueDisplay = 'None';
              }
            }

            // Generate descriptive change reason
            const fieldLabel = field.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase());
            const generatedReason = `Modifying line item: ${fieldLabel} from ${oldValueDisplay} to ${newValueDisplay} (Product: ${originalItem.product_name})`;

            await this.bill_audit_logs.add({
              id: uuidv4(),
              store_id: originalItem.store_id,
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

    await this.transaction('rw', [this.bill_line_items, this.bill_audit_logs], async () => {
      // Soft delete the line item
      await this.bill_line_items.update(lineItemId, {
        _deleted: true,
        updated_at: now,
        _synced: false
      });

      // Create audit log with descriptive reason
      const generatedReason = `Removing line item: ${lineItem.product_name} (Qty: ${lineItem.quantity}, Price: ${lineItem.unit_price})`;

      await this.bill_audit_logs.add({
        id: uuidv4(),
        store_id: lineItem.store_id,
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
}


export const db = new POSDatabase();

// Re-export Bill type for convenience
export type { Bill } from '../types';



  // Hook testing function removed - hooks no longer used for sales

 

// Export utility functions
export const createId = () => uuidv4();

export const createBaseEntity = (storeId: string, data: Partial<BaseEntity> = {}): Partial<BaseEntity> => {
  const now = new Date().toISOString();
  return {
    id: createId(),
    store_id: storeId,
    created_at: now,
    updated_at: now,
    _synced: false,
    ...data
  };
};