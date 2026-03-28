-- Migration: add expires_at to public_access_tokens
-- Spec: specs/007-error-handling-validation/data-model.md §2
--
-- Adds server-enforced token expiry to the public_access_tokens table so
-- the get_customer_by_token RPC can reject expired tokens without relying
-- on client-side filtering.
--
-- Safe to run multiple times (idempotent).

ALTER TABLE public.public_access_tokens
  ADD COLUMN IF NOT EXISTS expires_at timestamptz
    DEFAULT (NOW() + INTERVAL '30 days')
    NOT NULL;

-- Backfill existing rows with a 30-day window from their created_at timestamp
UPDATE public.public_access_tokens
SET    expires_at = created_at + INTERVAL '30 days'
WHERE  expires_at IS NULL
   OR  expires_at = (NOW() + INTERVAL '30 days');  -- only backfill rows that got the default just now

-- Update the RPC to reject expired tokens server-side.
-- The function now returns NULL for expired tokens, which the client maps
-- to the STATEMENT_TOKEN_EXPIRED AppError.
CREATE OR REPLACE FUNCTION public.get_customer_by_token(p_token TEXT)
RETURNS TABLE (
  customer_id   UUID,
  customer_name TEXT,
  store_id      UUID
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  RETURN QUERY
  SELECT
    e.id            AS customer_id,
    e.name          AS customer_name,
    pat.store_id    AS store_id
  FROM public.public_access_tokens pat
  JOIN public.entities             e ON e.id = pat.entity_id
  WHERE pat.token     = p_token
    AND pat.expires_at > NOW();   -- server-side expiry check
END;
$$;
