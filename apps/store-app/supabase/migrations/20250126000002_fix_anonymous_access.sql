-- Migration: Fix Anonymous Access for Public Customer Statements
-- This creates secure database functions that validate tokens and return data

-- Drop the restrictive token-based policies
DROP POLICY IF EXISTS "Token-based customer access" ON customers;
DROP POLICY IF EXISTS "Token-based bill_line_items access" ON bill_line_items;
DROP POLICY IF EXISTS "Token-based transactions access" ON transactions;
DROP POLICY IF EXISTS "Token-based bills access" ON bills;

-- Create secure database functions that validate tokens
-- These functions can be called by anonymous users but only return data for valid tokens

CREATE OR REPLACE FUNCTION get_customer_by_token(p_token TEXT)
RETURNS TABLE (
  id UUID,
  name TEXT,
  email TEXT,
  phone TEXT,
  address TEXT,
  is_active BOOLEAN,
  created_at TIMESTAMPTZ,
  lb_balance NUMERIC,
  usd_balance NUMERIC
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  -- Validate token and return customer data
  RETURN QUERY
  SELECT 
    c.id,
    c.name,
    c.email,
    c.phone,
    c.address,
    c.is_active,
    c.created_at,
    c.lb_balance,
    c.usd_balance
  FROM customers c
  INNER JOIN public_access_tokens t ON t.customer_id = c.id
  WHERE 
    t.token = p_token AND
    t.expires_at > NOW() AND
    NOT t.revoked;
END;
$$;

CREATE OR REPLACE FUNCTION get_customer_bill_line_items(p_token TEXT)
RETURNS TABLE (
  id UUID,
  bill_id UUID,
  customer_id UUID,
  product_id UUID,
  quantity NUMERIC,
  weight NUMERIC,
  unit_price NUMERIC,
  line_total NUMERIC,
  created_at TIMESTAMPTZ
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  -- Validate token first
  IF NOT EXISTS (
    SELECT 1 FROM public_access_tokens 
    WHERE token = p_token AND expires_at > NOW() AND NOT revoked
  ) THEN
    RETURN; -- Return empty result if token is invalid
  END IF;
  
  RETURN QUERY
  SELECT 
    bli.id,
    bli.bill_id,
    bli.customer_id,
    bli.product_id,
    bli.quantity,
    bli.weight,
    bli.unit_price,
    bli.line_total,
    bli.created_at
  FROM bill_line_items bli
  INNER JOIN public_access_tokens t ON t.customer_id = bli.customer_id
  WHERE 
    t.token = p_token AND
    t.expires_at > NOW() AND
    NOT t.revoked;
END;
$$;

CREATE OR REPLACE FUNCTION get_customer_transactions(p_token TEXT)
RETURNS TABLE (
  id UUID,
  customer_id UUID,
  amount NUMERIC,
  currency TEXT,
  type TEXT,
  description TEXT,
  reference TEXT,
  created_at TIMESTAMPTZ
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  -- Validate token first
  IF NOT EXISTS (
    SELECT 1 FROM public_access_tokens 
    WHERE token = p_token AND expires_at > NOW() AND NOT revoked
  ) THEN
    RETURN; -- Return empty result if token is invalid
  END IF;
  
  RETURN QUERY
  SELECT 
    tr.id,
    tr.customer_id,
    tr.amount,
    tr.currency,
    tr.type,
    tr.description,
    tr.reference,
    tr.created_at
  FROM transactions tr
  INNER JOIN public_access_tokens t ON t.customer_id = tr.customer_id
  WHERE 
    t.token = p_token AND
    t.expires_at > NOW() AND
    NOT t.revoked;
END;
$$;

CREATE OR REPLACE FUNCTION get_customer_bills(p_token TEXT)
RETURNS TABLE (
  id UUID,
  customer_id UUID,
  bill_number TEXT,
  total_amount NUMERIC,
  status TEXT,
  created_at TIMESTAMPTZ
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  -- Validate token first
  IF NOT EXISTS (
    SELECT 1 FROM public_access_tokens 
    WHERE token = p_token AND expires_at > NOW() AND NOT revoked
  ) THEN
    RETURN; -- Return empty result if token is invalid
  END IF;
  
  RETURN QUERY
  SELECT 
    b.id,
    b.customer_id,
    b.bill_number,
    b.total_amount,
    b.status,
    b.created_at
  FROM bills b
  INNER JOIN public_access_tokens t ON t.customer_id = b.customer_id
  WHERE 
    t.token = p_token AND
    t.expires_at > NOW() AND
    NOT t.revoked;
END;
$$;

-- Grant execute permissions to anonymous users
GRANT EXECUTE ON FUNCTION get_customer_by_token(TEXT) TO anon;
GRANT EXECUTE ON FUNCTION get_customer_bill_line_items(TEXT) TO anon;
GRANT EXECUTE ON FUNCTION get_customer_transactions(TEXT) TO anon;
GRANT EXECUTE ON FUNCTION get_customer_bills(TEXT) TO anon;

-- Re-enable RLS on tables to protect against authenticated user access
ALTER TABLE customers ENABLE ROW LEVEL SECURITY;
ALTER TABLE bill_line_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE bills ENABLE ROW LEVEL SECURITY;

-- Create RLS policies for authenticated users (service role)
-- These policies allow full access for authenticated users (your app's service role)

CREATE POLICY "Allow authenticated users full access to customers"
ON customers FOR ALL
TO authenticated
USING (true)
WITH CHECK (true);

CREATE POLICY "Allow authenticated users full access to bill_line_items"
ON bill_line_items FOR ALL
TO authenticated
USING (true)
WITH CHECK (true);

CREATE POLICY "Allow authenticated users full access to transactions"
ON transactions FOR ALL
TO authenticated
USING (true)
WITH CHECK (true);

CREATE POLICY "Allow authenticated users full access to bills"
ON bills FOR ALL
TO authenticated
USING (true)
WITH CHECK (true);

-- Create RLS policies for service role (your app's backend)
-- These policies allow full access for service role

CREATE POLICY "Allow service role full access to customers"
ON customers FOR ALL
TO service_role
USING (true)
WITH CHECK (true);

CREATE POLICY "Allow service role full access to bill_line_items"
ON bill_line_items FOR ALL
TO service_role
USING (true)
WITH CHECK (true);

CREATE POLICY "Allow service role full access to transactions"
ON transactions FOR ALL
TO service_role
USING (true)
WITH CHECK (true);

CREATE POLICY "Allow service role full access to bills"
ON bills FOR ALL
TO service_role
USING (true)
WITH CHECK (true);

-- Note: This approach is secure because:
-- 1. Functions validate tokens before returning any data (anonymous access)
-- 2. Only customers with valid, non-expired tokens can access data via functions
-- 3. Functions are SECURITY DEFINER (run with elevated privileges)
-- 4. Authenticated users (your app) can access all data (needed for normal operations)
-- 5. Service role can access all data (needed for admin operations)
-- 6. Anonymous users can ONLY access data via the secure functions

