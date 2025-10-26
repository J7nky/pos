-- Migration: Public Customer Statement RLS Policies
-- This migration adds RLS policies to allow public access to customer account statements
-- Customers can view their own data via QR code without authentication

-- Enable RLS on tables if not already enabled
ALTER TABLE customers ENABLE ROW LEVEL SECURITY;
ALTER TABLE bill_line_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE bills ENABLE ROW LEVEL SECURITY;
ALTER TABLE products ENABLE ROW LEVEL SECURITY;
ALTER TABLE inventory_items ENABLE ROW LEVEL SECURITY;

-- Public read access for customers (by customer_id)
-- Customers can read their own data when accessing via QR code
-- Note: Client-side filtering is used to restrict access to specific customer
CREATE POLICY "Public customers can read own data"
ON customers FOR SELECT
TO anon
USING (true);

-- Public read access for bill_line_items (customer sales data)
CREATE POLICY "Public read access for customer bill_line_items"
ON bill_line_items FOR SELECT
TO anon
USING (true);

-- Public read access for transactions (filtered by customer_id on client)
CREATE POLICY "Public read access for customer transactions"
ON transactions FOR SELECT
TO anon
USING (true);

-- Public read access for bills (filtered by customer_id on client)
CREATE POLICY "Public read access for customer bills"
ON bills FOR SELECT
TO anon
USING (true);

-- Public read access for products (needed for product details in statements)
CREATE POLICY "Public read access for products"
ON products FOR SELECT
TO anon
USING (true);

-- Public read access for inventory_items (needed for inventory details)
CREATE POLICY "Public read access for inventory"
ON inventory_items FOR SELECT
TO anon
USING (true);

-- Note: These policies allow anonymous (unauthenticated) users to read data
-- The application should filter data by customer_id on the client side
-- For better security in production, consider:
-- 1. Creating a server-side API endpoint that validates QR codes and filters data
-- 2. Implementing time-limited access tokens in QR codes
-- 3. Restricting access to only recent transactions (e.g., last 12 months)


