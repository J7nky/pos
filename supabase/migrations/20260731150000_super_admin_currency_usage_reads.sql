-- =========================================================================
--  Migration: super_admin_currency_usage_reads
--  Date: 2026-07-31
--
--  Problem
--  -------
--  admin-app StoreForm.tsx:214 refuses to remove a currency from a store's
--  accepted_currencies while rows still use it:
--
--    const usage = await checkCurrencyUsage(store.id, removed);
--    const blockers = Object.entries(usage)
--      .filter(([, u]) => u.inventory + u.transactions + u.openBills > 0);
--
--  checkCurrencyUsage (storeService.ts:129) counts inventory_items,
--  transactions and bills for `store.id` — the store being edited, which is
--  never the caller's own, because only a super_admin reaches this screen and
--  a super_admin has users.store_id = NULL.
--
--  Confirmed policy state before this migration:
--
--    inventory_items  "Users can access own store inventory"  ALL
--        USING (store_id IN (SELECT users.store_id FROM users WHERE users.id = auth.uid()))
--    transactions     "Users can view transactions ..."       SELECT
--        USING (store_id = get_current_user_store_id()
--               AND (get_current_user_branch_id() IS NULL OR branch_id = get_current_user_branch_id()))
--
--  Neither table has a super_admin path. Both predicates resolve to NULL for a
--  super_admin, so both counts have been returning 0 since the feature shipped.
--  bills is the only one that works, and only because 20260731130000 added
--  bills_super_admin_read.
--
--  Why that matters: PostgREST's { count: 'exact', head: true } returns
--  count 0 / error null when RLS filters everything away. The guard cannot tell
--  "no usage" from "not allowed to look", so it lets the save through and the
--  currency is removed from a store that still holds rows denominated in it.
--
--  Fix: read-only super_admin SELECT policies, matching bills_super_admin_read.
--  No write path is granted — super_admins do not post inventory or ledger rows.
--
--  Idempotent: safe to re-run. Reversible: rollback block at the end.
-- =========================================================================

BEGIN;

DROP POLICY IF EXISTS "inventory_items_super_admin_read" ON public.inventory_items;
CREATE POLICY "inventory_items_super_admin_read" ON public.inventory_items
  FOR SELECT
  TO authenticated
  USING (public.is_super_admin());

DROP POLICY IF EXISTS "transactions_super_admin_read" ON public.transactions;
CREATE POLICY "transactions_super_admin_read" ON public.transactions
  FOR SELECT
  TO authenticated
  USING (public.is_super_admin());

COMMIT;

-- =========================================================================
--  VERIFICATION
-- =========================================================================
-- Impersonate a super_admin and confirm all three counts are now reachable.
-- Before this migration the first two return 0 regardless of what the store
-- actually holds:
--
--   BEGIN;
--     SET LOCAL ROLE authenticated;
--     SET LOCAL request.jwt.claims = '{"sub":"<SUPER_ADMIN_USER_ID>","role":"authenticated"}';
--     SELECT (SELECT count(*) FROM public.inventory_items) AS inventory,
--            (SELECT count(*) FROM public.transactions)    AS transactions,
--            (SELECT count(*) FROM public.bills)           AS bills;
--   ROLLBACK;

-- =========================================================================
--  FOLLOW-UP (not fixed here)
-- =========================================================================
-- This database now has two parallel sets of tenant helpers:
--
--   get_current_user_store_id()  / get_current_user_branch_id()
--   is_current_user_super_admin()          -- used by branches, users policies
--   current_user_store_id() / is_super_admin()   -- added in 20260731130000
--
-- They almost certainly mean the same thing, but only one pair is known to be
-- SECURITY DEFINER (the pair added in 20260731130000 — that property is what
-- fixed the bills read). Before consolidating, check the older ones:
--
--   SELECT p.proname, p.prosecdef AS is_security_definer, pg_get_functiondef(p.oid)
--   FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
--   WHERE n.nspname = 'public'
--     AND p.proname IN ('get_current_user_store_id','get_current_user_branch_id',
--                       'is_current_user_super_admin');
--
-- If get_current_user_store_id() is SECURITY INVOKER, every transactions policy
-- built on it has the same latent defect that took bills down: it depends on the
-- caller being able to SELECT their own public.users row.

-- =========================================================================
--  ROLLBACK (manual)
-- =========================================================================
-- BEGIN;
--   DROP POLICY IF EXISTS "inventory_items_super_admin_read" ON public.inventory_items;
--   DROP POLICY IF EXISTS "transactions_super_admin_read"    ON public.transactions;
-- COMMIT;
