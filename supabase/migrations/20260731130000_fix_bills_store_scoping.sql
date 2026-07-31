-- =========================================================================
--  Migration: fix_bills_store_scoping
--  Date: 2026-07-31
--
--  Context
--  -------
--  20260731120000 dropped "Allow authenticated users full access to bills"
--  (ALL / USING true / WITH CHECK true), which let any authenticated user of
--  any store read AND write every store's bills. Immediately afterwards a sale
--  made on device A stopped reaching device B — including through a manual
--  Force Sync, which is a plain `SELECT ... eq(store_id)` download and does not
--  involve the event stream at all.
--
--  So the store-scoped policies that were left behind are not doing the job the
--  blanket policy had been masking. There are only two ways that happens:
--
--    (a) READ side. The scoped policies are written as
--          store_id IN (SELECT users.store_id FROM users WHERE users.id = auth.uid())
--        An RLS subquery runs as the *invoking* user, so public.users' own RLS
--        applies to it. If a user cannot SELECT their own users row under
--        whatever policies users carries, the subquery yields zero rows and the
--        predicate is false for every bill — the table reads as empty while
--        looking perfectly well-configured.
--
--    (b) WRITE side. "Users can create store bills" additionally required
--          created_by = auth.uid()
--        The offline uploader upserts rows whose created_by is a public.users
--        id captured when the sale was made; that is only equal to auth.uid()
--        if the two id spaces coincide and the same user is still signed in.
--
--  Fix
--  ---
--  Both collapse if the store predicate stops depending on a user-visible
--  subquery. This migration introduces two SECURITY DEFINER helpers that read
--  public.users with the function owner's rights — the standard pattern for
--  exactly this failure mode — and rewrites the bills / bill_line_items
--  policies in terms of them:
--
--    * one ALL policy per table, scoped to the caller's own store for both
--      read and write (USING and WITH CHECK stated explicitly, not inherited);
--    * one SELECT policy per table for super_admin cross-store reporting
--      (admin-app checkCurrencyUsage), read-only;
--    * the redundant/duplicated policies removed.
--
--  This is strictly narrower than the blanket policy it replaces: still one
--  store per user, still no cross-tenant writes. It drops the
--  `created_by = auth.uid()` clause, which was already unenforceable (the
--  co-existing ALL policy's check permitted the same insert without it) and is
--  wrong for an offline-first uploader that replays rows authored earlier.
--
--  AMENDMENT (2026-07-31, after this migration was applied and bills synced)
--  -----------------------------------------------------------------------
--  Cause (a) above is almost certainly WRONG, and this header overstated it.
--  Two later facts contradict it:
--
--    * public.users carries "Users can view own profile" SELECT (id = auth.uid()),
--      so the inline subquery CAN resolve — a user can read their own row.
--    * public.inventory_items still uses the identical inline form
--      (store_id IN (SELECT users.store_id FROM users WHERE users.id = auth.uid()))
--      and has never had a sync problem.
--
--  So the inline-subquery pattern demonstrably works in this database, and it
--  was not what broke bills. The surviving candidate is (b), the write side:
--  this migration also dropped "Users can create store bills", whose WITH CHECK
--  required created_by = auth.uid(). The verification block below would have
--  distinguished them (bill present on the server = read fault; bill absent =
--  write fault) but was not run before the symptom cleared.
--
--  The policies this migration installs are correct and remain the right shape.
--  Only the stated diagnosis is unreliable — do not cite cause (a) as precedent.
--
--  Idempotent: safe to re-run. Reversible: rollback block at the end.
-- =========================================================================

BEGIN;

-- -------------------------------------------------------------------------
-- 1. Helpers — resolve the caller's tenant without tripping over users' RLS
-- -------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.current_user_store_id()
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT u.store_id FROM public.users u WHERE u.id = auth.uid();
$$;

COMMENT ON FUNCTION public.current_user_store_id() IS
  'The calling user''s store_id, resolved with definer rights so RLS policies '
  'that scope by tenant do not depend on the caller being able to SELECT their '
  'own public.users row. Returns NULL for super_admins (store_id IS NULL) and '
  'for unauthenticated callers.';

CREATE OR REPLACE FUNCTION public.is_super_admin()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.users u
    WHERE u.id = auth.uid()
      AND u.role = 'super_admin'::user_role
      AND u.store_id IS NULL
  );
$$;

COMMENT ON FUNCTION public.is_super_admin() IS
  'True for a platform super_admin (role = super_admin AND store_id IS NULL). '
  'Matches the predicate the existing stores policies use inline.';

REVOKE ALL ON FUNCTION public.current_user_store_id() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.is_super_admin()        FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.current_user_store_id() TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.is_super_admin()        TO authenticated, service_role;

-- -------------------------------------------------------------------------
-- 2. bills
-- -------------------------------------------------------------------------
DROP POLICY IF EXISTS "Users can access bills from their store" ON public.bills;
DROP POLICY IF EXISTS "Users can view store bills"              ON public.bills;
DROP POLICY IF EXISTS "Users can create store bills"            ON public.bills;
DROP POLICY IF EXISTS "Super admins can view all bills"         ON public.bills;
DROP POLICY IF EXISTS "bills_own_store"                         ON public.bills;
DROP POLICY IF EXISTS "bills_super_admin_read"                  ON public.bills;

CREATE POLICY "bills_own_store" ON public.bills
  FOR ALL
  TO authenticated
  USING      (store_id = public.current_user_store_id())
  WITH CHECK (store_id = public.current_user_store_id());

CREATE POLICY "bills_super_admin_read" ON public.bills
  FOR SELECT
  TO authenticated
  USING (public.is_super_admin());

-- -------------------------------------------------------------------------
-- 3. bill_line_items
-- -------------------------------------------------------------------------
DROP POLICY IF EXISTS "Users can access bill line items from their store" ON public.bill_line_items;
DROP POLICY IF EXISTS "Users can access line items from their store"      ON public.bill_line_items;
DROP POLICY IF EXISTS "Super admins can view all bill line items"         ON public.bill_line_items;
DROP POLICY IF EXISTS "bill_line_items_own_store"                         ON public.bill_line_items;
DROP POLICY IF EXISTS "bill_line_items_super_admin_read"                  ON public.bill_line_items;

CREATE POLICY "bill_line_items_own_store" ON public.bill_line_items
  FOR ALL
  TO authenticated
  USING      (store_id = public.current_user_store_id())
  WITH CHECK (store_id = public.current_user_store_id());

CREATE POLICY "bill_line_items_super_admin_read" ON public.bill_line_items
  FOR SELECT
  TO authenticated
  USING (public.is_super_admin());

-- The service_role policies ("Allow service role full access to ...") are left
-- in place — Edge Functions and the nightly jobs depend on them.

COMMIT;

-- =========================================================================
--  VERIFICATION — run these, they answer which cause (a)/(b) it was
-- =========================================================================
-- 1. Is the bill on the server at all? (postgres session → bypasses RLS.)
--      SELECT id, bill_number, store_id, created_by, created_at
--      FROM public.bills ORDER BY created_at DESC LIMIT 5;
--
--    Missing  -> cause (b): the upload was being rejected. The sale must be
--                re-made (or the local row re-queued) now that WITH CHECK is
--                satisfiable; this migration cannot resurrect a row that was
--                never inserted.
--    Present  -> cause (a): it was a read failure and device B should now see
--                it on the next sync, no re-entry needed.
--
-- 2. Confirm the helper resolves for a real user — if this returns NULL for a
--    normal (non-super-admin) user, the users row itself is wrong (store_id
--    unset, or public.users.id != auth.users.id) and no policy can fix it:
--      SELECT u.id, u.email, u.store_id, (a.id IS NOT NULL) AS id_matches_auth
--      FROM public.users u LEFT JOIN auth.users a ON a.id = u.id
--      ORDER BY u.created_at DESC LIMIT 10;
--
-- 3. Impersonate device B's user and count what RLS now allows:
--      BEGIN;
--        SET LOCAL ROLE authenticated;
--        SET LOCAL request.jwt.claims = '{"sub":"<DEVICE_B_USER_ID>","role":"authenticated"}';
--        SELECT public.current_user_store_id() AS resolved_store,
--               (SELECT count(*) FROM public.bills)           AS visible_bills,
--               (SELECT count(*) FROM public.bill_line_items) AS visible_lines;
--      ROLLBACK;
--    resolved_store NULL for a store user  -> cause (a) confirmed, and step 2
--    will say why. visible_bills > 0       -> fixed.

-- =========================================================================
--  ROLLBACK (manual — restores the policy set as it stood after 20260731120000)
-- =========================================================================
-- BEGIN;
--   DROP POLICY IF EXISTS "bills_own_store"                ON public.bills;
--   DROP POLICY IF EXISTS "bills_super_admin_read"         ON public.bills;
--   DROP POLICY IF EXISTS "bill_line_items_own_store"      ON public.bill_line_items;
--   DROP POLICY IF EXISTS "bill_line_items_super_admin_read" ON public.bill_line_items;
--   CREATE POLICY "Users can access bills from their store" ON public.bills
--     FOR ALL TO authenticated
--     USING (store_id IN (SELECT users.store_id FROM users WHERE users.id = auth.uid()));
--   CREATE POLICY "Users can view store bills" ON public.bills
--     FOR SELECT TO authenticated
--     USING (store_id IN (SELECT users.store_id FROM users WHERE users.id = auth.uid()));
--   CREATE POLICY "Users can create store bills" ON public.bills
--     FOR INSERT TO authenticated
--     WITH CHECK ((store_id IN (SELECT users.store_id FROM users WHERE users.id = auth.uid()))
--                 AND (created_by = auth.uid()));
--   CREATE POLICY "Users can access bill line items from their store" ON public.bill_line_items
--     FOR ALL TO authenticated
--     USING (store_id IN (SELECT users.store_id FROM users WHERE users.id = auth.uid()));
--   CREATE POLICY "Super admins can view all bills" ON public.bills
--     FOR SELECT TO authenticated
--     USING (EXISTS (SELECT 1 FROM users WHERE users.id = auth.uid()
--                    AND users.role = 'super_admin'::user_role AND users.store_id IS NULL));
--   CREATE POLICY "Super admins can view all bill line items" ON public.bill_line_items
--     FOR SELECT TO authenticated
--     USING (EXISTS (SELECT 1 FROM users WHERE users.id = auth.uid()
--                    AND users.role = 'super_admin'::user_role AND users.store_id IS NULL));
--   DROP FUNCTION IF EXISTS public.current_user_store_id();
--   DROP FUNCTION IF EXISTS public.is_super_admin();
-- COMMIT;
