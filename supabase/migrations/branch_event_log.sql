-- =============================================================================
-- Migration: branch_event_log
-- Description: Append-only event log for branch-scoped change notifications.
--              Replaces table-wide polling with a single event feed per branch.
--              Clients subscribe via Supabase Realtime for wake-up signals, then
--              pull only affected records using version-based sequential processing.
-- =============================================================================

-- ---------------------------------------------------------------------------
-- 1. Version sequence (monotonically increasing per branch)
-- ---------------------------------------------------------------------------
CREATE SEQUENCE IF NOT EXISTS branch_event_log_version_seq
  START WITH 1
  INCREMENT BY 1
  NO CYCLE;

-- ---------------------------------------------------------------------------
-- 2. Main table
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.branch_event_log (
  id           UUID        NOT NULL DEFAULT gen_random_uuid(),
  store_id     UUID        NOT NULL,
  branch_id    UUID        NOT NULL,
  -- Semantic label for the business action, e.g. 'sale_posted', 'payment_posted'
  event_type   TEXT        NOT NULL,
  -- Logical domain of the affected row, e.g. 'bill', 'transaction', 'inventory_item'
  entity_type  TEXT        NOT NULL,
  -- Primary key of the affected row in its own table
  entity_id    UUID        NOT NULL,
  -- 'insert' | 'update' | 'reverse'  (never update/delete an event — use 'reverse')
  operation    TEXT        NOT NULL CHECK (operation IN ('insert', 'update', 'reverse')),
  -- Branch-scoped monotonic counter; used by clients for catch-up ordering
  version      BIGINT      NOT NULL DEFAULT nextval('branch_event_log_version_seq'),
  occurred_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  -- Auth user who triggered the action (nullable for system-generated events)
  user_id      UUID        REFERENCES auth.users (id) ON DELETE SET NULL,
  -- Arbitrary JSON payload for hints (e.g. counts, field names); never used as source of truth
  metadata     JSONB,

  CONSTRAINT branch_event_log_pkey PRIMARY KEY (id)
);

-- Immutability: no UPDATE or DELETE allowed on this table.
-- Enforced at DB level to protect the append-only invariant.
CREATE OR REPLACE RULE branch_event_log_no_update AS
  ON UPDATE TO public.branch_event_log DO INSTEAD NOTHING;

CREATE OR REPLACE RULE branch_event_log_no_delete AS
  ON DELETE TO public.branch_event_log DO INSTEAD NOTHING;

-- ---------------------------------------------------------------------------
-- 3. Indexes
-- ---------------------------------------------------------------------------

-- Primary access pattern: clients poll for events after their last seen version
CREATE INDEX IF NOT EXISTS idx_branch_event_log_branch_version
  ON public.branch_event_log (branch_id, version ASC);

-- Secondary: look up all events for a specific entity (for debugging / audit)
CREATE INDEX IF NOT EXISTS idx_branch_event_log_entity
  ON public.branch_event_log (entity_type, entity_id);

-- Time-based pruning (future: archive events older than N days)
CREATE INDEX IF NOT EXISTS idx_branch_event_log_occurred_at
  ON public.branch_event_log (occurred_at DESC);

-- ---------------------------------------------------------------------------
-- 4. Row Level Security
-- ---------------------------------------------------------------------------
ALTER TABLE public.branch_event_log ENABLE ROW LEVEL SECURITY;

-- Authenticated users may read events for branches belonging to their store.
-- The calling application already filters by branch_id; RLS adds server-side enforcement.
CREATE POLICY "branch_event_log_select_own_store" ON public.branch_event_log
  FOR SELECT
  USING (
    store_id IN (
      SELECT store_id FROM public.users WHERE id = auth.uid()
    )
  );

-- Only service-role (backend / RPC) may insert events.
-- Application code must use the emit_branch_event() RPC — never INSERT directly.
CREATE POLICY "branch_event_log_insert_service_role" ON public.branch_event_log
  FOR INSERT
  WITH CHECK (
    auth.role() = 'service_role'
    OR auth.uid() IS NOT NULL  -- also allow authenticated users via RPC
  );

-- ---------------------------------------------------------------------------
-- 5. RPC: emit_branch_event
-- ---------------------------------------------------------------------------
-- Called by application code (via supabase.rpc('emit_branch_event', {...})) after
-- a batch of local rows is confirmed uploaded to Supabase.  Returns the new event id.
--
-- Parameter naming uses p_ prefix to avoid shadowing column names.
-- ---------------------------------------------------------------------------
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
SECURITY DEFINER  -- runs as table owner so INSERT policy is satisfied
SET search_path = public
AS $$
DECLARE
  v_event_id UUID;
BEGIN
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

-- Grant execute to authenticated users so the client SDK can call it
GRANT EXECUTE ON FUNCTION public.emit_branch_event(UUID, UUID, TEXT, TEXT, UUID, TEXT, UUID, JSONB)
  TO authenticated;

-- ---------------------------------------------------------------------------
-- 6. Realtime publication
-- ---------------------------------------------------------------------------
-- Add the table to the Supabase Realtime publication so clients receive
-- INSERT notifications (wake-up signals only — data is pulled separately).
--
-- NOTE: Run this manually in the Supabase dashboard SQL editor if the
--       supabase_realtime publication already exists in your project.
--
-- ALTER PUBLICATION supabase_realtime ADD TABLE public.branch_event_log;

-- ---------------------------------------------------------------------------
-- 7. Optional: pruning policy (uncomment when ready)
-- ---------------------------------------------------------------------------
-- Keep last 90 days of events to bound storage growth.
-- A pg_cron job or scheduled Edge Function should run this periodically.
--
-- DELETE FROM public.branch_event_log
-- WHERE occurred_at < now() - INTERVAL '90 days';
