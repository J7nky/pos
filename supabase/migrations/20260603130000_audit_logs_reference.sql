-- =============================================================================
-- Migration: audit_logs_reference
-- Spec: audit-logging-service (Reference column)
-- Description: Adds an optional human-readable document `reference` to audit
--              rows (e.g. 'B-704053' for a sale bill, 'PAY-12345678' for a
--              payment, 'INV-…' for a received inventory bill). This is the
--              number a user recognises, distinct from `entity_id` (a UUID),
--              and powers the Reference column / cross-navigation in the audit
--              viewer. Nullable: rows written before this migration, and actions
--              with no natural document number, simply leave it NULL.
--
-- Append-only model is unchanged (the no-update trigger still blocks UPDATE);
-- this only widens the row shape for new INSERTs.
-- =============================================================================

ALTER TABLE public.audit_logs
  ADD COLUMN IF NOT EXISTS reference TEXT;

-- Optional: speed up "show every audit row for this document number" lookups.
CREATE INDEX IF NOT EXISTS idx_audit_logs_reference
  ON public.audit_logs (store_id, reference);
