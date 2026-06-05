-- ---------------------------------------------------------------------------
-- Audit logs — replace the no-update RULE with a BEFORE UPDATE trigger.
-- ---------------------------------------------------------------------------
-- The original table migration enforced immutability with a Postgres RULE:
--
--   CREATE RULE audit_logs_no_update AS ON UPDATE TO public.audit_logs
--     DO INSTEAD NOTHING;
--
-- Postgres forbids `INSERT ... ON CONFLICT` on any table that carries an INSERT
-- or UPDATE rule, so every sync upload (which uses upsert / onConflict: 'id')
-- failed with:
--
--   0A000: INSERT with ON CONFLICT clause cannot be used with table that has
--          INSERT or UPDATE rules
--
-- A BEFORE UPDATE trigger that returns NULL has the same effect (the UPDATE is
-- silently skipped, preserving the original row) but does NOT block ON CONFLICT.
-- This keeps audit_logs append-only while letting it ride the normal upsert
-- sync path: an on-conflict re-sync of an existing row becomes a no-op.

-- 1. Drop the rule that blocks ON CONFLICT.
DROP RULE IF EXISTS audit_logs_no_update ON public.audit_logs;

-- 2. Trigger function: suppress the update, keep the existing row.
CREATE OR REPLACE FUNCTION public.audit_logs_block_update()
  RETURNS trigger
  LANGUAGE plpgsql
AS $$
BEGIN
  -- Returning NULL from a BEFORE UPDATE trigger skips the row's update.
  RETURN NULL;
END;
$$;

-- 3. Wire it up.
DROP TRIGGER IF EXISTS audit_logs_no_update ON public.audit_logs;
CREATE TRIGGER audit_logs_no_update
  BEFORE UPDATE ON public.audit_logs
  FOR EACH ROW
  EXECUTE FUNCTION public.audit_logs_block_update();
