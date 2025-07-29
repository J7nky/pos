/*
  # Initial Schema for Wholesale Produce Market ERP

  1. New Tables
    - `stores` - Store information
    - `users` - User accounts with role-based access
    - `products` - Product catalog
    - `suppliers` - Supplier information
    - `customers` - Customer database
    - `inventory_items` - Product receiving records
    - `sales` - Sales transactions
    - `sale_items` - Individual items in sales
    - `transactions` - Financial transactions
    - `expense_categories` - Expense categorization

  2. Security
    - Enable RLS on all tables
    - Add policies for multi-tenant access based on store_id
    - Users can only access data from their assigned store
*/

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Create stores table
CREATE TABLE IF NOT EXISTS stores (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  name text NOT NULL,
  address text NOT NULL,
  phone text NOT NULL,
  email text NOT NULL,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Create users table (extends Supabase auth.users)
CREATE TABLE IF NOT EXISTS users (
  id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email text NOT NULL,
  name text NOT NULL,
  role text NOT NULL CHECK (role IN ('admin', 'manager', 'cashier')),
  store_id uuid NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Create products table
CREATE TABLE IF NOT EXISTS products (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  name text NOT NULL,
  category text NOT NULL,
  image text NOT NULL,
  is_active boolean DEFAULT true,
  store_id uuid NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Create suppliers table
CREATE TABLE IF NOT EXISTS suppliers (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  name text NOT NULL,
  phone text NOT NULL,
  email text,
  address text NOT NULL,
  type text NOT NULL CHECK (type IN ('commission', 'cash')),
  is_active boolean DEFAULT true,
  store_id uuid NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Create customers table
CREATE TABLE IF NOT EXISTS customers (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  name text NOT NULL,
  phone text NOT NULL,
  email text,
  address text,
  current_debt decimal(10,2) DEFAULT 0,
  is_active boolean DEFAULT true,
  store_id uuid NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Create inventory_items table
CREATE TABLE IF NOT EXISTS inventory_items (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  product_id uuid NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  supplier_id uuid NOT NULL REFERENCES suppliers(id) ON DELETE CASCADE,
  type text NOT NULL CHECK (type IN ('commission', 'cash')),
  quantity integer NOT NULL CHECK (quantity > 0),
  unit text NOT NULL CHECK (unit IN ('kg', 'piece', 'box', 'bag')),
  weight decimal(10,2),
  porterage decimal(10,2),
  transfer_fee decimal(10,2),
  price decimal(10,2),
  commission_rate decimal(5,2),
  notes text,
  received_at timestamptz DEFAULT now(),
  received_by uuid NOT NULL REFERENCES users(id),
  store_id uuid NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
  created_at timestamptz DEFAULT now()
);

-- Create sales table
CREATE TABLE IF NOT EXISTS sales (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  customer_id uuid REFERENCES customers(id),
  subtotal decimal(10,2) NOT NULL,
  total decimal(10,2) NOT NULL,
  payment_method text NOT NULL CHECK (payment_method IN ('cash', 'card', 'credit')),
  amount_paid decimal(10,2) NOT NULL DEFAULT 0,
  amount_due decimal(10,2) NOT NULL DEFAULT 0,
  status text NOT NULL CHECK (status IN ('completed', 'pending', 'cancelled')),
  notes text,
  store_id uuid NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
  created_by uuid NOT NULL REFERENCES users(id),
  created_at timestamptz DEFAULT now()
);

-- Create sale_items table
CREATE TABLE IF NOT EXISTS sale_items (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  product_id uuid NOT NULL REFERENCES products(id),
  product_name text NOT NULL,
  supplier_id uuid NOT NULL REFERENCES suppliers(id),
  supplier_name text NOT NULL,
  quantity integer NOT NULL CHECK (quantity > 0),
  weight decimal(10,2),
  unit_price decimal(10,2) NOT NULL,
  total_price decimal(10,2) NOT NULL,
  notes text,
  store_id uuid NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
  created_at timestamptz DEFAULT now()
);

-- Create expense_categories table
CREATE TABLE IF NOT EXISTS expense_categories (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  name text NOT NULL,
  description text,
  is_active boolean DEFAULT true,
  store_id uuid NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Create transactions table
CREATE TABLE IF NOT EXISTS transactions (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  type text NOT NULL CHECK (type IN ('income', 'expense')),
  category text NOT NULL,
  amount decimal(10,2) NOT NULL,
  currency text NOT NULL CHECK (currency IN ('USD', 'LBP')),
  description text NOT NULL,
  reference text,
  store_id uuid NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
  created_by uuid NOT NULL REFERENCES users(id),
  created_at timestamptz DEFAULT now()
);

-- Enable Row Level Security
ALTER TABLE stores ENABLE ROW LEVEL SECURITY;
ALTER TABLE users ENABLE ROW LEVEL SECURITY;
ALTER TABLE products ENABLE ROW LEVEL SECURITY;
ALTER TABLE suppliers ENABLE ROW LEVEL SECURITY;
ALTER TABLE customers ENABLE ROW LEVEL SECURITY;
ALTER TABLE inventory_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE sales ENABLE ROW LEVEL SECURITY;
ALTER TABLE sale_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE expense_categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE transactions ENABLE ROW LEVEL SECURITY;

-- Create RLS Policies

-- Users can only access their own store's data
CREATE POLICY "Users can access own store data" ON stores
  FOR ALL TO authenticated
  USING (id IN (SELECT store_id FROM users WHERE id = auth.uid()));

CREATE POLICY "Users can access own profile" ON users
  FOR ALL TO authenticated
  USING (id = auth.uid() OR store_id IN (SELECT store_id FROM users WHERE id = auth.uid()));

CREATE POLICY "Users can access own store products" ON products
  FOR ALL TO authenticated
  USING (store_id IN (SELECT store_id FROM users WHERE id = auth.uid()));

CREATE POLICY "Users can access own store suppliers" ON suppliers
  FOR ALL TO authenticated
  USING (store_id IN (SELECT store_id FROM users WHERE id = auth.uid()));

CREATE POLICY "Users can access own store customers" ON customers
  FOR ALL TO authenticated
  USING (store_id IN (SELECT store_id FROM users WHERE id = auth.uid()));

CREATE POLICY "Users can access own store inventory" ON inventory_items
  FOR ALL TO authenticated
  USING (store_id IN (SELECT store_id FROM users WHERE id = auth.uid()));

CREATE POLICY "Users can access own store sales" ON sales
  FOR ALL TO authenticated
  USING (store_id IN (SELECT store_id FROM users WHERE id = auth.uid()));

CREATE POLICY "Users can access own store sale items" ON sale_items
  FOR ALL TO authenticated
  USING (store_id IN (SELECT store_id FROM users WHERE id = auth.uid()));

CREATE POLICY "Users can access own store expense categories" ON expense_categories
  FOR ALL TO authenticated
  USING (store_id IN (SELECT store_id FROM users WHERE id = auth.uid()));

CREATE POLICY "Users can access own store transactions" ON transactions
  FOR ALL TO authenticated
  USING (store_id IN (SELECT store_id FROM users WHERE id = auth.uid()));

-- Create indexes for better performance
CREATE INDEX IF NOT EXISTS idx_users_store_id ON users(store_id);
CREATE INDEX IF NOT EXISTS idx_products_store_id ON products(store_id);
CREATE INDEX IF NOT EXISTS idx_suppliers_store_id ON suppliers(store_id);
CREATE INDEX IF NOT EXISTS idx_customers_store_id ON customers(store_id);
CREATE INDEX IF NOT EXISTS idx_inventory_items_store_id ON inventory_items(store_id);
CREATE INDEX IF NOT EXISTS idx_inventory_items_product_id ON inventory_items(product_id);
CREATE INDEX IF NOT EXISTS idx_sales_store_id ON sales(store_id);
CREATE INDEX IF NOT EXISTS idx_sales_created_at ON sales(created_at);
CREATE INDEX IF NOT EXISTS idx_sale_items_store_id ON sale_items(store_id);
CREATE INDEX IF NOT EXISTS idx_transactions_store_id ON transactions(store_id);
CREATE INDEX IF NOT EXISTS idx_transactions_created_at ON transactions(created_at);

-- Create updated_at trigger function
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ language 'plpgsql';

-- Create triggers for updated_at
CREATE TRIGGER update_stores_updated_at BEFORE UPDATE ON stores FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_users_updated_at BEFORE UPDATE ON users FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_products_updated_at BEFORE UPDATE ON products FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_suppliers_updated_at BEFORE UPDATE ON suppliers FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_customers_updated_at BEFORE UPDATE ON customers FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_expense_categories_updated_at BEFORE UPDATE ON expense_categories FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();