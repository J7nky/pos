-- =============================================================================
-- Migration: audit_logs_auth_actions
-- Spec: audit-logging-service (authentication events)
-- Description: Extend the audit_logs.action CHECK constraint to allow the two
--              authentication verbs — 'login' and 'logout'. These rows describe
--              a session (entity_type = 'auth', empty changes[]) rather than a
--              row mutation; everything else about audit_logs is unchanged.
--
-- IMPORTANT: This migration MUST be applied before clients start emitting login/
-- logout audit rows. Until it is, the original CHECK (which lists only the nine
-- business verbs) rejects the INSERT, and the offline sync uploader will fail to
-- push those rows.
-- =============================================================================

-- The original constraint was created inline and unnamed; Postgres auto-named it
-- `audit_logs_action_check`. Drop any CHECK constraint on the action column
-- defensively (covers a differently-named constraint), then re-add the extended
-- one under the canonical name.
--
-- Matching is by referenced COLUMN (conkey), not by text. A text match on
-- '%action%' would also catch a CHECK on entity_type, because the value
-- 'transaction' contains the substring 'action' — that constraint would be
-- dropped here and never restored.
DO $$
DECLARE
  con_name text;
  action_attnum smallint;
BEGIN
  SELECT attnum INTO action_attnum
  FROM pg_attribute
  WHERE attrelid = 'public.audit_logs'::regclass
    AND attname  = 'action'
    AND NOT attisdropped;

  FOR con_name IN
    SELECT conname
    FROM pg_constraint
    WHERE conrelid = 'public.audit_logs'::regclass
      AND contype = 'c'
      AND conkey = ARRAY[action_attnum]  -- constrains the action column, alone
  LOOP
    EXECUTE format('ALTER TABLE public.audit_logs DROP CONSTRAINT %I', con_name);
  END LOOP;
END $$;

ALTER TABLE public.audit_logs
  ADD CONSTRAINT audit_logs_action_check
  CHECK (action IN (
    'create', 'update', 'delete', 'void',
    'reactivate', 'archive', 'unarchive', 'open', 'close',
    'login', 'logout'
  ));
