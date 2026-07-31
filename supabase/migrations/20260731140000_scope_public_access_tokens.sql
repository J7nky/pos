-- =========================================================================
--  Migration: scope_public_access_tokens
--  Date: 2026-07-31
--
--  Problem
--  -------
--  public_access_tokens carries the single policy
--
--    "Authenticated users can manage tokens"  ALL  USING (true) WITH CHECK (true)
--
--  Every row is a bearer credential: whoever holds the token can open that
--  customer's full account statement without logging in. The policy lets any
--  authenticated user of any store read, re-point, or delete every other
--  store's tokens. Reading one is already enough to impersonate, so this is
--  worse than the bills hole closed in 20260731120000.
--
--  (The anon SELECT policy on this table was dropped in 20260731120000. Token
--  validation goes through get_customer_by_token(), which is SECURITY DEFINER
--  and does not consult these policies at all.)
--
--  Schema drift
--  ------------
--  The first attempt at this migration assumed a store_id column, because the
--  repo's get_customer_by_token body selects `pat.store_id`
--  (add_expires_at_to_public_access_tokens.sql:39). Applying it failed:
--
--    ERROR: 42703: column "store_id" does not exist
--
--  So the live table does not match the repo migration that supposedly defines
--  it — the same repo-vs-live drift already recorded for the chart_of_accounts
--  seeding RPC. Meanwhile qrCodeService.ts:61 inserts { customer_id, bill_id }.
--  Three sources, three different column sets, and only the database is
--  authoritative.
--
--  Rather than guess again, this migration discovers the owning-tenant column
--  at apply time and builds the policy around whichever one exists, preferring
--  the most direct. It raises rather than silently doing nothing if none is
--  present.
--
--  Idempotent: safe to re-run. Reversible: rollback block at the end.
-- =========================================================================

BEGIN;

-- -------------------------------------------------------------------------
-- 1. Helper: does an entity belong to the caller's store?
--
--    SECURITY DEFINER on purpose. A policy that inlines
--      entity_id IN (SELECT id FROM entities WHERE store_id = ...)
--    runs that subquery as the *invoking* user, so entities' own RLS filters
--    it — the exact trap that made bills read as empty (20260731130000).
-- -------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.entity_in_current_store(p_entity_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.entities e
    WHERE e.id = p_entity_id
      AND e.store_id = public.current_user_store_id()
  );
$$;

COMMENT ON FUNCTION public.entity_in_current_store(uuid) IS
  'True when the given entity belongs to the calling user''s store. Definer '
  'rights so tenant policies do not depend on the caller being able to SELECT '
  'the entities row itself.';

REVOKE ALL ON FUNCTION public.entity_in_current_store(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.entity_in_current_store(uuid) TO authenticated, service_role;

-- -------------------------------------------------------------------------
-- 2. Replace the blanket policy, scoping by whichever column this database has
-- -------------------------------------------------------------------------
DO $$
DECLARE
  v_col       text;
  v_predicate text;
BEGIN
  SELECT c.column_name INTO v_col
  FROM information_schema.columns c
  WHERE c.table_schema = 'public'
    AND c.table_name   = 'public_access_tokens'
    AND c.column_name IN ('store_id', 'entity_id', 'customer_id')
  ORDER BY array_position(ARRAY['store_id', 'entity_id', 'customer_id'], c.column_name)
  LIMIT 1;

  IF v_col IS NULL THEN
    RAISE EXCEPTION
      'public_access_tokens has none of store_id / entity_id / customer_id — '
      'cannot scope it to a tenant. Inspect the table and scope it by hand; do '
      'NOT leave the blanket policy in place.';
  END IF;

  IF v_col = 'store_id' THEN
    v_predicate := 'store_id = public.current_user_store_id()';
  ELSE
    -- customer_id / entity_id both reference public.entities.id
    v_predicate := format('public.entity_in_current_store(%I)', v_col);
  END IF;

  DROP POLICY IF EXISTS "Authenticated users can manage tokens" ON public.public_access_tokens;
  DROP POLICY IF EXISTS "public_access_tokens_own_store"        ON public.public_access_tokens;
  DROP POLICY IF EXISTS "public_access_tokens_super_admin_read" ON public.public_access_tokens;

  EXECUTE format(
    'CREATE POLICY "public_access_tokens_own_store" ON public.public_access_tokens
       FOR ALL TO authenticated
       USING (%s) WITH CHECK (%s)',
    v_predicate, v_predicate
  );

  EXECUTE
    'CREATE POLICY "public_access_tokens_super_admin_read" ON public.public_access_tokens
       FOR SELECT TO authenticated
       USING (public.is_super_admin())';

  RAISE NOTICE 'public_access_tokens scoped via % -> %', v_col, v_predicate;
END $$;

COMMIT;

-- =========================================================================
--  VERIFICATION
-- =========================================================================
-- 1. What the apply actually chose, and the resulting policy set:
--      SELECT policyname, cmd, roles, qual, with_check
--      FROM pg_policies
--      WHERE schemaname = 'public' AND tablename = 'public_access_tokens';
--    "Authenticated users can manage tokens" must be gone.
--
-- 2. Existing rows must still be visible to their own store. If the chosen
--    column is nullable and unset on old rows, those tokens become orphaned —
--    invisible to everyone except a super_admin. Check before trusting it:
--      SELECT count(*) FILTER (WHERE store_id   IS NULL) AS null_store,   -- if that column exists
--             count(*) FILTER (WHERE entity_id  IS NULL) AS null_entity,  -- if that column exists
--             count(*) AS total
--      FROM public.public_access_tokens;
--    Backfill from entities before relying on the policy if any are NULL.
--
-- 3. Confirm the real column set, and reconcile the three disagreeing sources
--    (this table, the repo RPC, qrCodeService.ts):
--      SELECT column_name, data_type, is_nullable
--      FROM information_schema.columns
--      WHERE table_schema = 'public' AND table_name = 'public_access_tokens'
--      ORDER BY ordinal_position;

-- =========================================================================
--  KNOWN, NOT FIXED HERE
-- =========================================================================
-- publicStatementService.ts:72 bumps accessed_at / access_count as an anon
-- caller. There is no anon policy on this table, so that write matches zero
-- rows and returns no error — the result is discarded, so nothing surfaces.
-- Public-statement access logging has therefore never worked. Unchanged by
-- this migration. The fix is to fold the bump into get_customer_by_token(),
-- which already runs SECURITY DEFINER:
--
--   UPDATE public.public_access_tokens
--   SET accessed_at = now(), access_count = COALESCE(access_count, 0) + 1
--   WHERE token = p_token;
--
-- Note the client also sends access_count: 1 as a literal rather than an
-- increment, so even with a working policy it would never count past 1.

-- =========================================================================
--  ROLLBACK (manual)
-- =========================================================================
-- BEGIN;
--   DROP POLICY IF EXISTS "public_access_tokens_own_store"        ON public.public_access_tokens;
--   DROP POLICY IF EXISTS "public_access_tokens_super_admin_read" ON public.public_access_tokens;
--   DROP FUNCTION IF EXISTS public.entity_in_current_store(uuid);
--   CREATE POLICY "Authenticated users can manage tokens" ON public.public_access_tokens
--     FOR ALL TO authenticated USING (true) WITH CHECK (true);
-- COMMIT;
