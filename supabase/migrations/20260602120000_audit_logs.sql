-- =============================================================================
-- Migration: audit_logs
-- Spec: audit-logging-service (Phase 0)
-- Description: General-purpose, store-branch-scoped audit trail. One row per
--              state-changing business action. Captures who (changed_by), when
--              (created_at), what (entity_type + entity_id), and the before/after
--              field deltas (changes JSONB array).
--
-- Design decisions (see audit_log_design_decisions):
--   1. One row per action; field deltas live in the `changes` JSONB array
--      (NOT one row per field like bill_audit_logs).
--   2. Notifications and pure-derived journal/transaction rows are NOT audited
--      (enforced client-side by the auditService allow-list).
--   3. Financial reversals are logged as a business-action summary, not journal
--      deltas.
--   4. Retention: 4 months, hard delete, no archive (see §6 below).
--
-- Append-only: UPDATE is blocked at the DB level. DELETE is denied to normal
-- users by RLS and reserved for the service-role retention prune.
-- =============================================================================

-- ---------------------------------------------------------------------------
-- 1. Table
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.audit_logs (
  id            UUID        NOT NULL DEFAULT gen_random_uuid(),
  store_id      UUID        NOT NULL,
  branch_id     UUID        NOT NULL,
  -- Logical module/domain of the affected row, e.g. 'entity', 'product', 'bill'.
  entity_type   TEXT        NOT NULL,
  -- Primary key of the affected row in its own table.
  entity_id     UUID        NOT NULL,
  -- Business action verb.
  action        TEXT        NOT NULL
                CHECK (action IN (
                  'create', 'update', 'delete', 'void',
                  'reactivate', 'archive', 'unarchive', 'open', 'close'
                )),
  -- Field-level before/after deltas: [{ "field": "...", "old": ..., "new": ... }].
  -- Empty array for create/delete.
  changes       JSONB       NOT NULL DEFAULT '[]'::jsonb,
  -- Optional human context, e.g. 'Customer returned goods'.
  change_reason TEXT,
  -- Actor (who). public.users.id == auth.uid() in this project.
  changed_by    UUID        NOT NULL,
  -- When (UTC). Also the sync cursor field — audit_logs has no updated_at.
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),

  CONSTRAINT audit_logs_pkey PRIMARY KEY (id)
);

-- Immutability: rows may be inserted and (by service-role) deleted, but never
-- updated. Protects the audit trail's integrity at the DB level.
--
-- Implemented as a BEFORE UPDATE trigger (not a RULE) on purpose: a Postgres
-- RULE on a table forbids `INSERT ... ON CONFLICT`, which the offline sync
-- uploader relies on (upsert with onConflict: 'id'). A trigger that returns
-- NULL skips the update identically while leaving ON CONFLICT usable, so an
-- on-conflict re-sync of an existing audit row is a silent no-op.
CREATE OR REPLACE FUNCTION public.audit_logs_block_update()
  RETURNS trigger
  LANGUAGE plpgsql
AS $$
BEGIN
  RETURN NULL;  -- BEFORE UPDATE returning NULL → row update is skipped.
END;
$$;

DROP TRIGGER IF EXISTS audit_logs_no_update ON public.audit_logs;
CREATE TRIGGER audit_logs_no_update
  BEFORE UPDATE ON public.audit_logs
  FOR EACH ROW
  EXECUTE FUNCTION public.audit_logs_block_update();

-- ---------------------------------------------------------------------------
-- 2. Indexes (mirror the Dexie compound indexes / read patterns)
-- ---------------------------------------------------------------------------
-- Per-record history: "show every change to this customer/product/bill".
CREATE INDEX IF NOT EXISTS idx_audit_logs_entity
  ON public.audit_logs (store_id, entity_type, entity_id);

-- Branch activity feed (most-recent first).
CREATE INDEX IF NOT EXISTS idx_audit_logs_branch_time
  ON public.audit_logs (store_id, branch_id, created_at DESC);

-- By-actor timeline: "what did this user do".
CREATE INDEX IF NOT EXISTS idx_audit_logs_actor_time
  ON public.audit_logs (changed_by, created_at DESC);

-- Retention pruning by age.
CREATE INDEX IF NOT EXISTS idx_audit_logs_created_at
  ON public.audit_logs (created_at);

-- ---------------------------------------------------------------------------
-- 3. Row Level Security
-- ---------------------------------------------------------------------------
-- Store-scoped, matching the convention used by every other synced table in
-- this project (e.g. product_categories / units_of_measure): the CALLER must
-- belong to the row's store (or be super_admin). We intentionally do NOT
-- constrain the `changed_by` actor column to auth.uid() — this is an
-- offline-first app where the client authors the row, and `changed_by` is
-- recorded for display, not enforced (same trust model as bills.created_by,
-- journal_entries.created_by, etc.). Enforcing changed_by = auth.uid() would
-- reject every audit row authored while offline under local auth.
--
-- Append-only is preserved by granting only SELECT + INSERT to authenticated
-- (no FOR ALL): the no-update trigger above blocks updates, and the absence of
-- a DELETE policy means only the service-role retention job (§6) may prune.
ALTER TABLE public.audit_logs ENABLE ROW LEVEL SECURITY;

-- Read: store members (and super_admins) may read their store's audit rows.
DROP POLICY IF EXISTS "audit_logs_select_own_store" ON public.audit_logs;
CREATE POLICY "audit_logs_select_own_store" ON public.audit_logs
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.users u
      WHERE u.id = auth.uid()
        AND (u.store_id = audit_logs.store_id OR u.role = 'super_admin')
    )
  );

-- Insert: store members (and super_admins) may append audit rows for their
-- store. Service-role (backfills/RPC) is exempt via auth.role().
DROP POLICY IF EXISTS "audit_logs_insert_own_store" ON public.audit_logs;
CREATE POLICY "audit_logs_insert_own_store" ON public.audit_logs
  FOR INSERT
  TO authenticated
  WITH CHECK (
    auth.role() = 'service_role'
    OR EXISTS (
      SELECT 1 FROM public.users u
      WHERE u.id = auth.uid()
        AND (u.store_id = audit_logs.store_id OR u.role = 'super_admin')
    )
  );

-- No UPDATE policy (and the no-update trigger above) → updates are inert.
-- No DELETE policy → authenticated users cannot delete. Only the service-role
-- retention job (§6), which bypasses RLS, may prune.

-- ---------------------------------------------------------------------------
-- 4. Realtime publication (optional — wake-up signals)
-- ---------------------------------------------------------------------------
-- Audit rows ride the normal tier-2 pull sync; realtime is not required.
-- Enable only if a live activity feed is wanted later:
--
-- ALTER PUBLICATION supabase_realtime ADD TABLE public.audit_logs;

-- ---------------------------------------------------------------------------
-- 5. Retention prune (decision 4: 4 months, hard delete, no archive)
-- ---------------------------------------------------------------------------
-- Service-role only. Wire to pg_cron (or a scheduled Edge Function) once the
-- extension is enabled; left commented so this migration is side-effect-free.
--
-- SELECT cron.schedule(
--   'audit_logs_retention_prune',
--   '0 3 * * *',                       -- nightly at 03:00 UTC
--   $$ DELETE FROM public.audit_logs WHERE created_at < now() - INTERVAL '4 months'; $$
-- );
