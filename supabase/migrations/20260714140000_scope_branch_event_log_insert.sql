-- =========================================================================
--  Security hardening: tenant-scope branch_event_log writes
--
--  Problem (pre-fix):
--    The INSERT policy was:
--      WITH CHECK (auth.role() = 'service_role' OR auth.uid() IS NOT NULL)
--    i.e. effectively USING(true) for any logged-in user — no store/branch
--    scoping. An authenticated user of store A could insert events for
--    store B's branch, or supply an arbitrary `version` on a direct INSERT.
--    Victim clients drive catch-up by "pull events after my last version",
--    so a forged high version makes them skip real events (silent desync),
--    and forged event rows trigger bogus wake-ups. The emit_branch_event RPC
--    (SECURITY DEFINER, granted to authenticated) had the same gap: it
--    inserted p_store_id / p_branch_id verbatim with no membership check.
--
--  Fix:
--    1. Remove the permissive INSERT policy and revoke direct table INSERT
--       from anon/authenticated. The ONLY write path is now the
--       emit_branch_event RPC (SECURITY DEFINER). The app already writes
--       exclusively through the RPC and reads via SELECT, so nothing breaks.
--       With direct INSERT blocked, `version` can no longer be client-set —
--       it is always the sequence default.
--    2. Add a tenant-membership guard inside emit_branch_event so a caller
--       can only emit events for a store they belong to (or super_admin /
--       service_role). branch_id is additionally verified to belong to the
--       claimed store.
--
--  Idempotent + reversible (rollback block at the end).
-- =========================================================================

BEGIN;

-- -------------------------------------------------------------------------
-- 1. Drop the permissive INSERT policy; block direct table INSERT.
-- -------------------------------------------------------------------------
DROP POLICY IF EXISTS "branch_event_log_insert_service_role" ON public.branch_event_log;

-- Belt-and-suspenders: even without a policy, ensure the API roles hold no
-- table-level INSERT privilege. All inserts go through the SECURITY DEFINER
-- RPC, which runs as the function owner and is unaffected by these grants.
REVOKE INSERT ON public.branch_event_log FROM anon, authenticated;

-- (SELECT stays as-is: policy "branch_event_log_select_own_store" already
--  scopes reads to the caller's store.)

-- -------------------------------------------------------------------------
-- 2. emit_branch_event — add tenant + branch membership guard.
--    Body reproduced from branch_event_log.sql with the guard prepended.
-- -------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.emit_branch_event(
  p_store_id    UUID,
  p_branch_id   UUID,
  p_event_type  TEXT,
  p_entity_type TEXT,
  p_entity_id   UUID,
  p_operation   TEXT,
  p_user_id     UUID    DEFAULT NULL,
  p_metadata    JSONB   DEFAULT NULL
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_event_id UUID;
BEGIN
  -- SECURITY: the caller must belong to the target store (or be super_admin /
  -- service_role). Prevents cross-tenant event injection.
  PERFORM public.assert_store_access(p_store_id);

  -- The branch must actually belong to the claimed store, so a valid store
  -- member cannot emit against another store's branch id.
  IF NOT EXISTS (
    SELECT 1 FROM public.branches b
    WHERE b.id = p_branch_id AND b.store_id = p_store_id
  ) THEN
    RAISE EXCEPTION 'Branch % does not belong to store %', p_branch_id, p_store_id
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  -- version is intentionally omitted → always the sequence default. Never
  -- accept a client-supplied version.
  INSERT INTO public.branch_event_log (
    store_id,
    branch_id,
    event_type,
    entity_type,
    entity_id,
    operation,
    user_id,
    metadata
  ) VALUES (
    p_store_id,
    p_branch_id,
    p_event_type,
    p_entity_type,
    p_entity_id,
    p_operation,
    p_user_id,
    p_metadata
  )
  RETURNING id INTO v_event_id;

  RETURN v_event_id;
END;
$$;

-- Keep execute scoped to authenticated (+ service_role); the internal guard
-- does the per-tenant confinement.
REVOKE ALL ON FUNCTION public.emit_branch_event(UUID, UUID, TEXT, TEXT, UUID, TEXT, UUID, JSONB) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.emit_branch_event(UUID, UUID, TEXT, TEXT, UUID, TEXT, UUID, JSONB)
  TO authenticated, service_role;

COMMIT;

-- =========================================================================
--  ROLLBACK (manual — uncomment and run to restore the prior open state)
-- =========================================================================
-- BEGIN;
--   CREATE POLICY "branch_event_log_insert_service_role" ON public.branch_event_log
--     FOR INSERT
--     WITH CHECK (auth.role() = 'service_role' OR auth.uid() IS NOT NULL);
--   GRANT INSERT ON public.branch_event_log TO authenticated;
--   -- To fully revert the RPC guard, re-run the original emit_branch_event body
--   -- from branch_event_log.sql.
-- COMMIT;
