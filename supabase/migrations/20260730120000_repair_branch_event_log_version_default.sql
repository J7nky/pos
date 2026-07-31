-- =============================================================================
-- Migration: repair_branch_event_log_version_default
-- Date: 2026-07-30
--
-- Problem (observed in production console after login):
--   POST /rest/v1/rpc/emit_branch_event -> 400
--   "null value in column \"version\" of relation \"branch_event_log\"
--    violates not-null constraint"
--
--   Every event emission fails, so the client never publishes wake-up signals
--   for sales / payments / journal entries. Other devices only catch up on a
--   full periodic sync.
--
--   `branch_event_log.version` is declared
--     version BIGINT NOT NULL DEFAULT nextval('branch_event_log_version_seq')
--   and emit_branch_event deliberately omits the column from its INSERT so the
--   default supplies it (see 20260714140000 — a client must never be able to
--   choose a version). A NULL can therefore only happen if the live database
--   drifted from the repo in one of two ways:
--     (a) the column default was dropped (or the table was recreated without
--         it), or
--     (b) the live emit_branch_event body sets `version` explicitly — e.g.
--         `SELECT MAX(version) + 1 ... WHERE branch_id = p_branch_id`, which
--         evaluates to NULL for a branch that has no events yet.
--
-- Fix: reassert the sequence + column default, and resync the sequence past the
-- current maximum so no duplicate versions are handed out. Idempotent — safe to
-- run repeatedly, and a no-op if the live schema already matches the repo.
--
-- NOTE: if the diagnostic shows cause (b), also re-run
-- 20260714140000_scope_branch_event_log_insert.sql to restore the canonical
-- (guarded, version-omitting) function body. This migration does not touch the
-- function, because re-creating it here would silently drop the tenant guard on
-- any database where 20260714130000 was never applied.
-- =============================================================================

BEGIN;

-- 1. The sequence the default draws from.
CREATE SEQUENCE IF NOT EXISTS public.branch_event_log_version_seq
  START WITH 1
  INCREMENT BY 1
  NO CYCLE;

-- 2. Reattach the default. NOT NULL stays as-is.
ALTER TABLE public.branch_event_log
  ALTER COLUMN version SET DEFAULT nextval('public.branch_event_log_version_seq');

-- 3. Resync the sequence so the next value is strictly greater than every
--    version already in the table. Clients drive catch-up with
--    "give me events after my last seen version", so a reused or out-of-order
--    version would make them skip real events.
--      empty table -> setval(seq, 1, false)   => next nextval() = 1
--      non-empty   -> setval(seq, MAX, true)  => next nextval() = MAX + 1
SELECT setval(
  'public.branch_event_log_version_seq',
  GREATEST((SELECT COALESCE(MAX(version), 0) FROM public.branch_event_log), 1),
  (SELECT EXISTS (SELECT 1 FROM public.branch_event_log))
);

-- 4. The SECURITY DEFINER RPC runs as the function owner, but grant sequence
--    usage explicitly so a future non-definer path (or a service-role script)
--    can still insert.
GRANT USAGE ON SEQUENCE public.branch_event_log_version_seq TO authenticated, service_role;

COMMIT;

-- -----------------------------------------------------------------------------
-- Verification (run after COMMIT; expect one row with a non-null default)
-- -----------------------------------------------------------------------------
-- SELECT column_default
-- FROM information_schema.columns
-- WHERE table_schema = 'public'
--   AND table_name   = 'branch_event_log'
--   AND column_name  = 'version';
--
-- Expected: nextval('branch_event_log_version_seq'::regclass)

-- =============================================================================
-- ROLLBACK (manual — restores the broken state, only for testing)
-- =============================================================================
-- ALTER TABLE public.branch_event_log ALTER COLUMN version DROP DEFAULT;
