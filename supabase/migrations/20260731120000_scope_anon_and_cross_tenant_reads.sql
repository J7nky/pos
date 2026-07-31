-- =========================================================================
--  Migration: scope_anon_and_cross_tenant_reads
--  Date: 2026-07-31
--
--  Problem (proven against the live database with the anon key alone —
--  no Authorization header, so auth.uid() IS NULL):
--
--    GET /rest/v1/bills            -> 60 rows
--    GET /rest/v1/bill_line_items  -> 61 rows
--    GET /rest/v1/stores           ->  9 rows
--    GET /rest/v1/public_access_tokens -> 12 rows
--
--  The anon key ships inside every deployed web bundle, so this is public
--  data. Four permissive policies are responsible:
--
--    bills                "Allow anonymous read access to bills"        USING (true)
--    bill_line_items      "Allow anonymous read access to bill_line_items" USING (true)
--    stores               "stores_select_policy"                        USING (is_deleted = false OR is_deleted IS NULL)
--    public_access_tokens "Anonymous users can validate tokens"         USING (true)
--
--  A second, independent hole sits behind them: on bills and bill_line_items
--
--    "Allow authenticated users full access to bills"  ALL  USING (true) WITH CHECK (true)
--
--  RLS policies are OR'd, so this blanket policy subsumes every store-scoped
--  policy on those tables — any authenticated user of store A can read AND
--  WRITE store B's bills. The scoped policies next to it are decorative.
--
--  Fix:
--    1. Drop the four anon policies and the two blanket authenticated ones.
--    2. Keep the store-scoped policies (unchanged) as the only user path.
--       For an ALL policy with WITH CHECK omitted, Postgres reuses USING for
--       the check, so writes stay confined to the caller's store.
--    3. Add an explicit super_admin SELECT carve-out on bills/bill_line_items:
--       a super_admin has users.store_id = NULL, so the store-scoped policy
--       matches nothing, and admin-app's checkCurrencyUsage() (storeService.ts)
--       counts open bills for an arbitrary store. Without this it would
--       silently report 0 — worse than an error, since that count gates
--       currency removal.
--    4. Replace the public `stores` read with a narrow SECURITY DEFINER RPC.
--       The sign-up screen genuinely needs a pre-auth store list
--       (SupabaseLogin.tsx), but only uses id + name; exposing the whole row
--       (exchange rates, contact details, status, tenant type) is gratuitous.
--    5. Revoke the anon table grants, matching the belt-and-suspenders already
--       applied to branch_event_log in 20260714140000.
--
--  NOT changed here (call-outs, not regressions introduced by this migration):
--    - publicStatementService.ts:72 updates public_access_tokens.accessed_at
--      as an anon caller. There is no anon UPDATE policy, so that write is
--      already a silent no-op today and stays one. Access logging for public
--      statements does not work; fixing it needs a SECURITY DEFINER RPC.
--    - The same "Allow authenticated users full access to X" pattern may exist
--      on other tables. Those are invisible to an anon probe (roles =
--      {authenticated}); see the verification query at the end of this file.
--
--  Idempotent: safe to re-run. Reversible: rollback block at the end.
-- =========================================================================

BEGIN;

-- -------------------------------------------------------------------------
-- 1. bills / bill_line_items — remove anon read + blanket authenticated access
-- -------------------------------------------------------------------------
DROP POLICY IF EXISTS "Allow anonymous read access to bills"            ON public.bills;
DROP POLICY IF EXISTS "Allow anonymous read access to bill_line_items"  ON public.bill_line_items;

DROP POLICY IF EXISTS "Allow authenticated users full access to bills"           ON public.bills;
DROP POLICY IF EXISTS "Allow authenticated users full access to bill_line_items" ON public.bill_line_items;

-- Exact duplicate of "Users can access bill line items from their store"
-- (same cmd, same qual). Redundant policies are evaluated on every row.
DROP POLICY IF EXISTS "Users can access line items from their store" ON public.bill_line_items;

-- Surviving user-facing policies (untouched, listed for reviewability):
--   bills            "Users can access bills from their store"      ALL    (store-scoped)
--   bills            "Users can view store bills"                   SELECT (store-scoped)
--   bills            "Users can create store bills"                 INSERT (store-scoped + created_by)
--   bill_line_items  "Users can access bill line items from their store" ALL (store-scoped)
--   both             "Allow service role full access to ..."        ALL    (service_role)

-- -------------------------------------------------------------------------
-- 2. super_admin read carve-out (admin-app cross-store reporting)
-- -------------------------------------------------------------------------
DROP POLICY IF EXISTS "Super admins can view all bills" ON public.bills;
CREATE POLICY "Super admins can view all bills" ON public.bills
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.users u
      WHERE u.id = auth.uid()
        AND u.role = 'super_admin'::user_role
        AND u.store_id IS NULL
    )
  );

DROP POLICY IF EXISTS "Super admins can view all bill line items" ON public.bill_line_items;
CREATE POLICY "Super admins can view all bill line items" ON public.bill_line_items
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.users u
      WHERE u.id = auth.uid()
        AND u.role = 'super_admin'::user_role
        AND u.store_id IS NULL
    )
  );

-- -------------------------------------------------------------------------
-- 3. stores — narrow the pre-auth read to (id, name) via RPC
-- -------------------------------------------------------------------------
-- Mirrors the filter the dropped policy used (is_deleted false or NULL) so the
-- sign-up picker shows exactly the same set of stores as before. If you would
-- rather it list only `status = 'active'` stores, add that predicate here — it
-- is a product decision, not a security one, so this migration does not make it.
CREATE OR REPLACE FUNCTION public.list_stores_for_signup()
RETURNS TABLE (id uuid, name text)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT s.id, s.name
  FROM public.stores s
  WHERE s.is_deleted = false OR s.is_deleted IS NULL
  ORDER BY s.name;
$$;

COMMENT ON FUNCTION public.list_stores_for_signup() IS
  'Pre-auth store picker for the sign-up screen. Returns id + name only. '
  'Replaces the public SELECT policy on stores, which exposed every column '
  'of every store to anyone holding the (publicly shipped) anon key.';

REVOKE ALL ON FUNCTION public.list_stores_for_signup() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.list_stores_for_signup() TO anon, authenticated;

DROP POLICY IF EXISTS "stores_select_policy" ON public.stores;

-- -------------------------------------------------------------------------
-- 4. public_access_tokens — drop the anon table read
-- -------------------------------------------------------------------------
-- Token validation goes through get_customer_by_token(), which is
-- SECURITY DEFINER (add_expires_at_to_public_access_tokens.sql:31) and so does
-- not consult this policy. The policy's only effect was to let anyone with the
-- anon key enumerate every live token — i.e. open every customer's statement.
DROP POLICY IF EXISTS "Anonymous users can validate tokens" ON public.public_access_tokens;

-- -------------------------------------------------------------------------
-- 5. Revoke anon table grants (defence in depth; RLS already blocks)
-- -------------------------------------------------------------------------
-- Supabase grants the full DML set to anon by default and relies on RLS alone.
-- These four tables need no anon access at all now, so remove the grant too —
-- same approach as 20260714140000 for branch_event_log.
REVOKE ALL ON TABLE public.bills                FROM anon;
REVOKE ALL ON TABLE public.bill_line_items      FROM anon;
REVOKE ALL ON TABLE public.stores               FROM anon;
REVOKE ALL ON TABLE public.public_access_tokens FROM anon;

COMMIT;

-- =========================================================================
--  VERIFICATION (run after applying)
-- =========================================================================
-- a. All four must now return zero rows to the anon key:
--      curl -s "$URL/rest/v1/bills?select=id&limit=1"            -H "apikey: $ANON"
--      curl -s "$URL/rest/v1/bill_line_items?select=id&limit=1"  -H "apikey: $ANON"
--      curl -s "$URL/rest/v1/stores?select=id&limit=1"           -H "apikey: $ANON"
--      curl -s "$URL/rest/v1/public_access_tokens?select=id&limit=1" -H "apikey: $ANON"
--
-- b. The sign-up picker still works pre-auth:
--      curl -s -X POST "$URL/rest/v1/rpc/list_stores_for_signup" \
--        -H "apikey: $ANON" -H "Content-Type: application/json" -d '{}'
--
-- c. Sweep for the SAME blanket-authenticated pattern on other tables. An anon
--    probe cannot see these (roles = {authenticated}), so they were outside the
--    original audit. Anything listed here lets any logged-in user of any store
--    read/write that table across every tenant:
--
--      SELECT tablename, policyname, cmd, roles, qual, with_check
--      FROM pg_policies
--      WHERE schemaname = 'public'
--        AND roles::text[] && ARRAY['authenticated']
--        AND (qual = 'true' OR with_check = 'true')
--      ORDER BY tablename, policyname;

-- =========================================================================
--  ROLLBACK (manual — uncomment and run to restore the prior open state)
-- =========================================================================
-- BEGIN;
--   CREATE POLICY "Allow anonymous read access to bills" ON public.bills
--     FOR SELECT USING (true);
--   CREATE POLICY "Allow anonymous read access to bill_line_items" ON public.bill_line_items
--     FOR SELECT USING (true);
--   CREATE POLICY "Allow authenticated users full access to bills" ON public.bills
--     FOR ALL TO authenticated USING (true) WITH CHECK (true);
--   CREATE POLICY "Allow authenticated users full access to bill_line_items" ON public.bill_line_items
--     FOR ALL TO authenticated USING (true) WITH CHECK (true);
--   CREATE POLICY "Users can access line items from their store" ON public.bill_line_items
--     FOR ALL TO authenticated
--     USING (store_id IN (SELECT users.store_id FROM users WHERE users.id = auth.uid()));
--   CREATE POLICY "stores_select_policy" ON public.stores
--     FOR SELECT USING (is_deleted = false OR is_deleted IS NULL);
--   CREATE POLICY "Anonymous users can validate tokens" ON public.public_access_tokens
--     FOR SELECT TO anon USING (true);
--   DROP POLICY IF EXISTS "Super admins can view all bills" ON public.bills;
--   DROP POLICY IF EXISTS "Super admins can view all bill line items" ON public.bill_line_items;
--   DROP FUNCTION IF EXISTS public.list_stores_for_signup();
--   GRANT SELECT, INSERT, UPDATE, DELETE ON public.bills, public.bill_line_items,
--     public.stores, public.public_access_tokens TO anon;
-- COMMIT;
