-- Add comprehensive performance indexes for the POS system
-- This migration adds indexes for common query patterns to improve performance

-- Products table indexes
CREATE INDEX IF NOT EXISTS idx_products_store_id ON products(store_id);
CREATE INDEX IF NOT EXISTS idx_products_name ON products(name);
CREATE INDEX IF NOT EXISTS idx_products_category ON products(category);
CREATE INDEX IF NOT EXISTS idx_products_updated_at ON products(updated_at);
CREATE INDEX IF NOT EXISTS idx_products_synced ON products(_synced) WHERE _synced IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_products_deleted ON products(_deleted) WHERE _deleted IS NOT NULL;

-- Suppliers table indexes
CREATE INDEX IF NOT EXISTS idx_suppliers_store_id ON suppliers(store_id);
CREATE INDEX IF NOT EXISTS idx_suppliers_name ON suppliers(name);
CREATE INDEX IF NOT EXISTS idx_suppliers_type ON suppliers(type);
CREATE INDEX IF NOT EXISTS idx_suppliers_is_active ON suppliers(is_active);
CREATE INDEX IF NOT EXISTS idx_suppliers_updated_at ON suppliers(updated_at);
CREATE INDEX IF NOT EXISTS idx_suppliers_synced ON suppliers(_synced) WHERE _synced IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_suppliers_deleted ON suppliers(_deleted) WHERE _deleted IS NOT NULL;

-- Customers table indexes
CREATE INDEX IF NOT EXISTS idx_customers_store_id ON customers(store_id);
CREATE INDEX IF NOT EXISTS idx_customers_name ON customers(name);
CREATE INDEX IF NOT EXISTS idx_customers_phone ON customers(phone);
CREATE INDEX IF NOT EXISTS idx_customers_is_active ON customers(is_active);
CREATE INDEX IF NOT EXISTS idx_customers_updated_at ON customers(updated_at);
CREATE INDEX IF NOT EXISTS idx_customers_synced ON customers(_synced) WHERE _synced IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_customers_deleted ON customers(_deleted) WHERE _deleted IS NOT NULL;

-- Inventory items table indexes
CREATE INDEX IF NOT EXISTS idx_inventory_items_store_id ON inventory_items(store_id);
CREATE INDEX IF NOT EXISTS idx_inventory_items_product_id ON inventory_items(product_id);
CREATE INDEX IF NOT EXISTS idx_inventory_items_supplier_id ON inventory_items(supplier_id);
CREATE INDEX IF NOT EXISTS idx_inventory_items_type ON inventory_items(type);
CREATE INDEX IF NOT EXISTS idx_inventory_items_received_at ON inventory_items(received_at);
CREATE INDEX IF NOT EXISTS idx_inventory_items_created_at ON inventory_items(created_at);
CREATE INDEX IF NOT EXISTS idx_inventory_items_batch_id ON inventory_items(batch_id);
CREATE INDEX IF NOT EXISTS idx_inventory_items_synced ON inventory_items(_synced) WHERE _synced IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_inventory_items_deleted ON inventory_items(_deleted) WHERE _deleted IS NOT NULL;

-- Transactions table indexes
CREATE INDEX IF NOT EXISTS idx_transactions_store_id ON transactions(store_id);
CREATE INDEX IF NOT EXISTS idx_transactions_type ON transactions(type);
CREATE INDEX IF NOT EXISTS idx_transactions_category ON transactions(category);
CREATE INDEX IF NOT EXISTS idx_transactions_created_at ON transactions(created_at);
CREATE INDEX IF NOT EXISTS idx_transactions_created_by ON transactions(created_by);
CREATE INDEX IF NOT EXISTS idx_transactions_currency ON transactions(currency);
CREATE INDEX IF NOT EXISTS idx_transactions_synced ON transactions(_synced) WHERE _synced IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_transactions_deleted ON transactions(_deleted) WHERE _deleted IS NOT NULL;

-- Inventory bills table indexes
CREATE INDEX IF NOT EXISTS idx_inventory_bills_store_id ON inventory_bills(store_id);
CREATE INDEX IF NOT EXISTS idx_inventory_bills_supplier_id ON inventory_bills(supplier_id);
CREATE INDEX IF NOT EXISTS idx_inventory_bills_received_at ON inventory_bills(received_at);
CREATE INDEX IF NOT EXISTS idx_inventory_bills_created_by ON inventory_bills(created_by);
CREATE INDEX IF NOT EXISTS idx_inventory_bills_synced ON inventory_bills(_synced) WHERE _synced IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_inventory_bills_deleted ON inventory_bills(_deleted) WHERE _deleted IS NOT NULL;

-- Bills table indexes
CREATE INDEX IF NOT EXISTS idx_bills_store_id ON bills(store_id);
CREATE INDEX IF NOT EXISTS idx_bills_bill_number ON bills(bill_number);
CREATE INDEX IF NOT EXISTS idx_bills_customer_id ON bills(customer_id);
CREATE INDEX IF NOT EXISTS idx_bills_bill_date ON bills(bill_date);
CREATE INDEX IF NOT EXISTS idx_bills_payment_status ON bills(payment_status);
CREATE INDEX IF NOT EXISTS idx_bills_status ON bills(status);
CREATE INDEX IF NOT EXISTS idx_bills_created_by ON bills(created_by);
CREATE INDEX IF NOT EXISTS idx_bills_created_at ON bills(created_at);
CREATE INDEX IF NOT EXISTS idx_bills_synced ON bills(_synced) WHERE _synced IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_bills_deleted ON bills(_deleted) WHERE _deleted IS NOT NULL;

-- Bill line items table indexes
CREATE INDEX IF NOT EXISTS idx_bill_line_items_store_id ON bill_line_items(store_id);
CREATE INDEX IF NOT EXISTS idx_bill_line_items_bill_id ON bill_line_items(bill_id);
CREATE INDEX IF NOT EXISTS idx_bill_line_items_product_id ON bill_line_items(product_id);
CREATE INDEX IF NOT EXISTS idx_bill_line_items_supplier_id ON bill_line_items(supplier_id);
CREATE INDEX IF NOT EXISTS idx_bill_line_items_customer_id ON bill_line_items(customer_id);
CREATE INDEX IF NOT EXISTS idx_bill_line_items_inventory_item_id ON bill_line_items(inventory_item_id);
CREATE INDEX IF NOT EXISTS idx_bill_line_items_payment_method ON bill_line_items(payment_method);
CREATE INDEX IF NOT EXISTS idx_bill_line_items_created_by ON bill_line_items(created_by);
CREATE INDEX IF NOT EXISTS idx_bill_line_items_created_at ON bill_line_items(created_at);
CREATE INDEX IF NOT EXISTS idx_bill_line_items_line_order ON bill_line_items(line_order);
CREATE INDEX IF NOT EXISTS idx_bill_line_items_synced ON bill_line_items(_synced) WHERE _synced IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_bill_line_items_deleted ON bill_line_items(_deleted) WHERE _deleted IS NOT NULL;

-- Bill audit logs table indexes
CREATE INDEX IF NOT EXISTS idx_bill_audit_logs_store_id ON bill_audit_logs(store_id);
CREATE INDEX IF NOT EXISTS idx_bill_audit_logs_bill_id ON bill_audit_logs(bill_id);
CREATE INDEX IF NOT EXISTS idx_bill_audit_logs_action ON bill_audit_logs(action);
CREATE INDEX IF NOT EXISTS idx_bill_audit_logs_changed_by ON bill_audit_logs(changed_by);
CREATE INDEX IF NOT EXISTS idx_bill_audit_logs_created_at ON bill_audit_logs(created_at);
CREATE INDEX IF NOT EXISTS idx_bill_audit_logs_synced ON bill_audit_logs(_synced) WHERE _synced IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_bill_audit_logs_deleted ON bill_audit_logs(_deleted) WHERE _deleted IS NOT NULL;

-- Exchange rates table indexes
CREATE INDEX IF NOT EXISTS idx_exchange_rates_from_currency ON exchange_rates(from_currency);
CREATE INDEX IF NOT EXISTS idx_exchange_rates_to_currency ON exchange_rates(to_currency);
CREATE INDEX IF NOT EXISTS idx_exchange_rates_currencies ON exchange_rates(from_currency, to_currency);
CREATE INDEX IF NOT EXISTS idx_exchange_rates_updated_at ON exchange_rates(updated_at);
CREATE INDEX IF NOT EXISTS idx_exchange_rates_synced ON exchange_rates(_synced) WHERE _synced IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_exchange_rates_deleted ON exchange_rates(_deleted) WHERE _deleted IS NOT NULL;

-- Cash drawer accounts table indexes
CREATE INDEX IF NOT EXISTS idx_cash_drawer_accounts_store_id ON cash_drawer_accounts(store_id);
CREATE INDEX IF NOT EXISTS idx_cash_drawer_accounts_account_code ON cash_drawer_accounts(account_code);
CREATE INDEX IF NOT EXISTS idx_cash_drawer_accounts_is_active ON cash_drawer_accounts(is_active);
CREATE INDEX IF NOT EXISTS idx_cash_drawer_accounts_updated_at ON cash_drawer_accounts(updated_at);

-- Cash drawer sessions table indexes
CREATE INDEX IF NOT EXISTS idx_cash_drawer_sessions_store_id ON cash_drawer_sessions(store_id);
CREATE INDEX IF NOT EXISTS idx_cash_drawer_sessions_account_id ON cash_drawer_sessions(account_id);
CREATE INDEX IF NOT EXISTS idx_cash_drawer_sessions_status ON cash_drawer_sessions(status);
CREATE INDEX IF NOT EXISTS idx_cash_drawer_sessions_opened_at ON cash_drawer_sessions(opened_at);
CREATE INDEX IF NOT EXISTS idx_cash_drawer_sessions_created_at ON cash_drawer_sessions(created_at);

-- Composite indexes for common query patterns
CREATE INDEX IF NOT EXISTS idx_products_store_active ON products(store_id, is_active) WHERE _deleted IS NULL;
CREATE INDEX IF NOT EXISTS idx_suppliers_store_active ON suppliers(store_id, is_active) WHERE _deleted IS NULL;
CREATE INDEX IF NOT EXISTS idx_customers_store_active ON customers(store_id, is_active) WHERE _deleted IS NULL;
CREATE INDEX IF NOT EXISTS idx_inventory_items_product_available ON inventory_items(product_id, quantity) WHERE _deleted IS NULL AND quantity > 0;
CREATE INDEX IF NOT EXISTS idx_bills_store_customer ON bills(store_id, customer_id) WHERE _deleted IS NULL;
CREATE INDEX IF NOT EXISTS idx_bill_line_items_bill_product ON bill_line_items(bill_id, product_id) WHERE _deleted IS NULL;

-- Sync-related composite indexes
CREATE INDEX IF NOT EXISTS idx_products_store_sync ON products(store_id, _synced) WHERE _synced = false;
CREATE INDEX IF NOT EXISTS idx_suppliers_store_sync ON suppliers(store_id, _synced) WHERE _synced = false;
CREATE INDEX IF NOT EXISTS idx_customers_store_sync ON customers(store_id, _synced) WHERE _synced = false;
CREATE INDEX IF NOT EXISTS idx_inventory_items_store_sync ON inventory_items(store_id, _synced) WHERE _synced = false;
CREATE INDEX IF NOT EXISTS idx_transactions_store_sync ON transactions(store_id, _synced) WHERE _synced = false;
CREATE INDEX IF NOT EXISTS idx_bills_store_sync ON bills(store_id, _synced) WHERE _synced = false;
CREATE INDEX IF NOT EXISTS idx_bill_line_items_store_sync ON bill_line_items(store_id, _synced) WHERE _synced = false;

-- Performance monitoring query
-- This query can be used to monitor index usage
-- SELECT schemaname, tablename, indexname, idx_scan, idx_tup_read, idx_tup_fetch 
-- FROM pg_stat_user_indexes 
-- WHERE schemaname = 'public' 
-- ORDER BY idx_scan DESC;

