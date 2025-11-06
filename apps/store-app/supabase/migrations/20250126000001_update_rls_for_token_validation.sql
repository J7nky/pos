-- Migration: Update RLS Policies for Token-Based Access
-- This migration replaces the insecure USING (true) policies with secure token validation

-- Drop the old insecure policies
DROP POLICY IF EXISTS "Public customers can read own data" ON customers;
DROP POLICY IF EXISTS "Public read access for customer bill_line_items" ON bill_line_items;
DROP POLICY IF EXISTS "Public read access for customer transactions" ON transactions;
DROP POLICY IF EXISTS "Public read access for customer bills" ON bills;
DROP POLICY IF EXISTS "Public read access for products" ON products;
DROP POLICY IF EXISTS "Public read access for inventory" ON inventory_items;

-- Helper function to get customer_id from valid token
CREATE OR REPLACE FUNCTION get_customer_id_from_token(p_token TEXT)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
STABLE
AS $$
DECLARE
  v_customer_id UUID;
BEGIN
  SELECT customer_id INTO v_customer_id
  FROM public_access_tokens
  WHERE token = p_token
    AND expires_at > NOW()
    AND NOT revoked
  LIMIT 1;
  
  RETURN v_customer_id;
END;
$$;

-- Create new secure token-based policies

-- Customers: Only allow reading customer if they have a valid token
CREATE POLICY "Token-based customer access"
ON customers FOR SELECT
TO anon
USING (
  id IN (
    SELECT customer_id 
    FROM public_access_tokens
    WHERE token = current_setting('app.access_token', true)
      AND expires_at > NOW()
      AND NOT revoked
  )
);

-- Bill Line Items: Only allow reading if token is valid for this customer
CREATE POLICY "Token-based bill_line_items access"
ON bill_line_items FOR SELECT
TO anon
USING (
  customer_id IN (
    SELECT customer_id 
    FROM public_access_tokens
    WHERE token = current_setting('app.access_token', true)
      AND expires_at > NOW()
      AND NOT revoked
  )
);

-- Transactions: Only allow reading if token is valid for this customer
CREATE POLICY "Token-based transactions access"
ON transactions FOR SELECT
TO anon
USING (
  customer_id IN (
    SELECT customer_id 
    FROM public_access_tokens
    WHERE token = current_setting('app.access_token', true)
      AND expires_at > NOW()
      AND NOT revoked
  )
);

-- Bills: Only allow reading if token is valid for this customer
CREATE POLICY "Token-based bills access"
ON bills FOR SELECT
TO anon
USING (
  customer_id IN (
    SELECT customer_id 
    FROM public_access_tokens
    WHERE token = current_setting('app.access_token', true)
      AND expires_at > NOW()
      AND NOT revoked
  )
);

-- Products: Allow reading products (needed for product names)
-- This is safe as products are not sensitive customer-specific data
CREATE POLICY "Public read access for products"
ON products FOR SELECT
TO anon
USING (true);

-- Inventory Items: Allow reading inventory items (needed for product details)
-- This is safe as inventory items are not customer-specific sensitive data
CREATE POLICY "Public read access for inventory"
ON inventory_items FOR SELECT
TO anon
USING (true);

-- Keep existing authenticated user policies (if any exist)
-- These policies work alongside the token-based policies for different user types

COMMENT ON FUNCTION get_customer_id_from_token IS 'Helper function to extract customer_id from a valid access token';

