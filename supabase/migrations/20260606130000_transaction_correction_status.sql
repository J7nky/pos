-- =============================================================================
-- Migration: transaction_correction_status
-- Spec: payment-correction-lifecycle
-- Description: Promotes the transaction correction/lifecycle state out of the
--              mutable `metadata` JSON blob and into typed, indexable,
--              SQL-queryable columns.
--
--              Previously a corrected ("superseded") original was hidden from
--              the payments list by a free-form `metadata.corrected = true`
--              flag. That flag was: not cleanly queryable in SQL, not indexed,
--              and trivially clobberable by any code path that rewrote
--              `metadata` without spreading it — which (because nothing guards
--              against re-reversing an already-reversed row) could resurface the
--              original and let it be reversed twice, corrupting the ledger.
--
--              New columns:
--                status                        active | superseded | reversed | voided
--                superseded_by_transaction_id  on a corrected row → its replacement
--                corrected_from_transaction_id on a correction → the row it replaced
--                chain_root_id                 first original in the correction chain
--
--              The client (offline-first source of truth) already syncs these
--              columns as-is (no field whitelist), so they round-trip without
--              any syncService change.
--
-- NOTE on enforcement: we intentionally DO NOT add a server-side trigger that
-- rejects "a reversal of a non-active transaction". A correction supersedes the
-- original AND posts a reversal against it in the same business action; on sync
-- those rows can arrive in an order where such a trigger would see the original
-- already 'superseded' and reject the legitimate reversal, breaking sync. The
-- authoritative guard therefore lives in the client at action time (only an
-- 'active', non-deleted row may be corrected). This migration adds data-shape
-- guarantees (typed column + CHECK + index) only.
-- =============================================================================

ALTER TABLE public.transactions
  ADD COLUMN IF NOT EXISTS status                        TEXT NOT NULL DEFAULT 'active',
  ADD COLUMN IF NOT EXISTS superseded_by_transaction_id  TEXT,
  ADD COLUMN IF NOT EXISTS corrected_from_transaction_id TEXT,
  ADD COLUMN IF NOT EXISTS chain_root_id                 TEXT;

-- Constrain status to the known lifecycle states (idempotent add).
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'transactions_status_check'
  ) THEN
    ALTER TABLE public.transactions
      ADD CONSTRAINT transactions_status_check
      CHECK (status IN ('active', 'superseded', 'reversed', 'voided'));
  END IF;
END $$;

-- Powers the common "active rows for this store" list filter and superseded lookups.
CREATE INDEX IF NOT EXISTS idx_transactions_store_status
  ON public.transactions (store_id, status);

-- Backfill from the legacy mutable metadata flag so any pre-existing (test) rows
-- stay consistent after the read paths switch to the typed column. Corrected
-- originals become 'superseded' and lift their forward pointer out of metadata.
UPDATE public.transactions
SET status = 'superseded',
    superseded_by_transaction_id = COALESCE(
      superseded_by_transaction_id,
      metadata->>'correctedTransactionId'
    )
WHERE (metadata->>'corrected') = 'true'
  AND status = 'active';
