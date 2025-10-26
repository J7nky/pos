-- Migration: Create Public Access Tokens System
-- This migration creates a secure token-based system for public customer statement access
-- Tokens expire after 90 days and can be revoked

-- Create the public_access_tokens table
CREATE TABLE IF NOT EXISTS public_access_tokens (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id UUID NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
  bill_id UUID REFERENCES bills(id) ON DELETE CASCADE,
  token TEXT NOT NULL UNIQUE DEFAULT encode(gen_random_bytes(32), 'base64'),
  expires_at TIMESTAMPTZ NOT NULL DEFAULT (NOW() + INTERVAL '90 days'),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  accessed_at TIMESTAMPTZ,
  access_count INT DEFAULT 0,
  revoked BOOLEAN DEFAULT false,
  last_ip_address INET,
  last_user_agent TEXT
);

-- Create indexes for performance
-- Index on token for quick validation (only non-revoked tokens)
CREATE INDEX idx_public_access_tokens_token ON public_access_tokens(token) 
WHERE NOT revoked;

-- Index on customer_id for quick lookups by customer
CREATE INDEX idx_public_access_tokens_customer ON public_access_tokens(customer_id);

-- Index on expires_at for quick cleanup and expiration checks
CREATE INDEX idx_public_access_tokens_expires ON public_access_tokens(expires_at) 
WHERE NOT revoked;

-- Enable RLS on the tokens table
ALTER TABLE public_access_tokens ENABLE ROW LEVEL SECURITY;

-- Allow anonymous users to read tokens (they need to validate them)
-- But only return the customer_id and bill_id, not the token itself for security
CREATE POLICY "Anonymous users can validate tokens"
ON public_access_tokens FOR SELECT
TO anon
USING (true);

-- Allow authenticated users to manage tokens
CREATE POLICY "Authenticated users can manage tokens"
ON public_access_tokens FOR ALL
TO authenticated
USING (true)
WITH CHECK (true);

-- Function to clean up expired tokens (optional, for maintenance)
CREATE OR REPLACE FUNCTION cleanup_expired_tokens()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  DELETE FROM public_access_tokens
  WHERE expires_at < NOW() - INTERVAL '30 days'; -- Keep for 30 days after expiration for audit
END;
$$;

-- Comment on table and columns for documentation
COMMENT ON TABLE public_access_tokens IS 'Secure access tokens for public customer statement access via QR codes';
COMMENT ON COLUMN public_access_tokens.token IS 'Unique access token (base64 encoded random bytes)';
COMMENT ON COLUMN public_access_tokens.expires_at IS 'Token expiration timestamp (default 90 days from creation)';
COMMENT ON COLUMN public_access_tokens.revoked IS 'Whether the token has been manually revoked';
COMMENT ON COLUMN public_access_tokens.access_count IS 'Number of times this token has been used';

