/*
  # Add updated_at triggers for incremental sync
  
  ## Problem
  Tables with `updated_at` fields don't automatically update the timestamp on UPDATE.
  This breaks incremental sync because the sync service relies on `updated_at` to detect changes.
  
  ## Solution
  Add BEFORE UPDATE triggers to automatically set `updated_at = now()` for all tables
  that have an `updated_at` field.
  
  ## Tables Affected
  - customers
  - suppliers
  - users
  - products
  - stores
  - cash_drawer_accounts
  - cash_drawer_sessions
  - inventory_bills
  - bills
  - bill_line_items
  - bill_audit_logs
  - missed_products
  - inventory_items (also has updated_at)
*/

-- Generic function to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Customers table
DROP TRIGGER IF EXISTS trigger_update_customers_updated_at ON customers;
CREATE TRIGGER trigger_update_customers_updated_at
  BEFORE UPDATE ON customers
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- Suppliers table
DROP TRIGGER IF EXISTS trigger_update_suppliers_updated_at ON suppliers;
CREATE TRIGGER trigger_update_suppliers_updated_at
  BEFORE UPDATE ON suppliers
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- Users table
DROP TRIGGER IF EXISTS trigger_update_users_updated_at ON users;
CREATE TRIGGER trigger_update_users_updated_at
  BEFORE UPDATE ON users
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- Products table
DROP TRIGGER IF EXISTS trigger_update_products_updated_at ON products;
CREATE TRIGGER trigger_update_products_updated_at
  BEFORE UPDATE ON products
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- Stores table
DROP TRIGGER IF EXISTS trigger_update_stores_updated_at ON stores;
CREATE TRIGGER trigger_update_stores_updated_at
  BEFORE UPDATE ON stores
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- Cash drawer accounts table
DROP TRIGGER IF EXISTS trigger_update_cash_drawer_accounts_updated_at ON cash_drawer_accounts;
CREATE TRIGGER trigger_update_cash_drawer_accounts_updated_at
  BEFORE UPDATE ON cash_drawer_accounts
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- Cash drawer sessions table
DROP TRIGGER IF EXISTS trigger_update_cash_drawer_sessions_updated_at ON cash_drawer_sessions;
CREATE TRIGGER trigger_update_cash_drawer_sessions_updated_at
  BEFORE UPDATE ON cash_drawer_sessions
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- Inventory bills table
DROP TRIGGER IF EXISTS trigger_update_inventory_bills_updated_at ON inventory_bills;
CREATE TRIGGER trigger_update_inventory_bills_updated_at
  BEFORE UPDATE ON inventory_bills
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- Bills table
DROP TRIGGER IF EXISTS trigger_update_bills_updated_at ON bills;
CREATE TRIGGER trigger_update_bills_updated_at
  BEFORE UPDATE ON bills
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- Bill line items table
DROP TRIGGER IF EXISTS trigger_update_bill_line_items_updated_at ON bill_line_items;
CREATE TRIGGER trigger_update_bill_line_items_updated_at
  BEFORE UPDATE ON bill_line_items
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- Bill audit logs table
DROP TRIGGER IF EXISTS trigger_update_bill_audit_logs_updated_at ON bill_audit_logs;
CREATE TRIGGER trigger_update_bill_audit_logs_updated_at
  BEFORE UPDATE ON bill_audit_logs
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- Missed products table
DROP TRIGGER IF EXISTS trigger_update_missed_products_updated_at ON missed_products;
CREATE TRIGGER trigger_update_missed_products_updated_at
  BEFORE UPDATE ON missed_products
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- Inventory items table (also has updated_at)
DROP TRIGGER IF EXISTS trigger_update_inventory_items_updated_at ON inventory_items;
CREATE TRIGGER trigger_update_inventory_items_updated_at
  BEFORE UPDATE ON inventory_items
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- Add comment for documentation
COMMENT ON FUNCTION update_updated_at_column() IS 
  'Automatically updates the updated_at column to the current timestamp on row update. Required for incremental sync to work correctly.';
