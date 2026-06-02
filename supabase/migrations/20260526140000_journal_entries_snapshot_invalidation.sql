-- =========================================================================
--  journal_entries → balance_snapshots staleness propagation
--  (Plan B, Phase B4)
--
--  Purpose:
--    Mark downstream balance_snapshots as `stale = true` whenever a journal
--    entry is inserted, updated, or deleted with a posted_date that the
--    snapshot summarizes. The B5 nightly recompute pass clears the flag
--    after rebuilding the snapshot.
--
--  Rules:
--    INSERT  → snapshots WHERE posted_date <= snapshot_date for the
--              affected (store, account_code, entity_id) get stale = true.
--    DELETE  → same, on OLD.
--    UPDATE  → handle BOTH the old and new (account_code, entity_id,
--              posted_date) ranges. A correction that moves an entry from
--              account 1100 to account 1200 invalidates snapshots on both
--              codes.
--    Closing snapshots (`is_closing = true`) are NEVER marked stale —
--      they are immutable anchors. A journal correction inside a closed
--      fiscal year is an admin-level audit event handled separately.
--
--  Performance:
--    The UPDATE uses the existing compound index
--    `[store_id+account_code+entity_id+snapshot_date]`. Hot path: a
--    typical POS write touches O(1) snapshots (today and forward — usually
--    zero or one row exists).
-- =========================================================================

BEGIN;

CREATE OR REPLACE FUNCTION public.invalidate_snapshots_for_journal_entry()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  -- On INSERT: mark snapshots downstream of NEW.posted_date.
  IF (TG_OP = 'INSERT') THEN
    UPDATE public.balance_snapshots
    SET stale = true,
        updated_at = COALESCE(updated_at, now())
    WHERE store_id = NEW.store_id
      AND account_code = NEW.account_code
      AND (entity_id IS NOT DISTINCT FROM NEW.entity_id)
      AND snapshot_date >= NEW.posted_date
      AND is_closing = false
      AND stale = false;
    RETURN NEW;
  END IF;

  -- On DELETE: mark snapshots downstream of OLD.posted_date.
  IF (TG_OP = 'DELETE') THEN
    UPDATE public.balance_snapshots
    SET stale = true,
        updated_at = COALESCE(updated_at, now())
    WHERE store_id = OLD.store_id
      AND account_code = OLD.account_code
      AND (entity_id IS NOT DISTINCT FROM OLD.entity_id)
      AND snapshot_date >= OLD.posted_date
      AND is_closing = false
      AND stale = false;
    RETURN OLD;
  END IF;

  -- On UPDATE: handle both old and new keys. The two UPDATEs are guarded
  -- by NOT DISTINCT-style equality so the no-op case (entry's posted_date,
  -- account, and entity all unchanged) collapses to a single UPDATE.
  IF (TG_OP = 'UPDATE') THEN
    -- Old side — invalidate where the entry previously sat.
    UPDATE public.balance_snapshots
    SET stale = true,
        updated_at = COALESCE(updated_at, now())
    WHERE store_id = OLD.store_id
      AND account_code = OLD.account_code
      AND (entity_id IS NOT DISTINCT FROM OLD.entity_id)
      AND snapshot_date >= OLD.posted_date
      AND is_closing = false
      AND stale = false;

    -- New side — only re-run if the key tuple changed (avoid a duplicate
    -- UPDATE on the same rows when nothing structural moved).
    IF (NEW.store_id IS DISTINCT FROM OLD.store_id)
       OR (NEW.account_code IS DISTINCT FROM OLD.account_code)
       OR (NEW.entity_id IS DISTINCT FROM OLD.entity_id)
       OR (NEW.posted_date IS DISTINCT FROM OLD.posted_date)
    THEN
      UPDATE public.balance_snapshots
      SET stale = true,
          updated_at = COALESCE(updated_at, now())
      WHERE store_id = NEW.store_id
        AND account_code = NEW.account_code
        AND (entity_id IS NOT DISTINCT FROM NEW.entity_id)
        AND snapshot_date >= NEW.posted_date
        AND is_closing = false
        AND stale = false;
    ELSE
      -- Amounts may have changed even though the key tuple didn't —
      -- the old-side UPDATE already covered the affected rows.
      NULL;
    END IF;

    RETURN NEW;
  END IF;

  RETURN NULL;
END;
$$;

COMMENT ON FUNCTION public.invalidate_snapshots_for_journal_entry() IS
  'Trigger fn (Plan B / B4): marks balance_snapshots stale when a journal '
  'entry is inserted, updated, or deleted with a posted_date the snapshot '
  'summarizes. The nightly recompute pass (B5) rebuilds stale snapshots. '
  'Closing snapshots are never touched.';

-- Ensure balance_snapshots has updated_at — older schemas omit it. The
-- function above writes to updated_at; tolerate the column being absent.
ALTER TABLE public.balance_snapshots
  ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now();

DROP TRIGGER IF EXISTS journal_entries_invalidate_snapshots
  ON public.journal_entries;
CREATE TRIGGER journal_entries_invalidate_snapshots
  AFTER INSERT OR UPDATE OR DELETE ON public.journal_entries
  FOR EACH ROW
  EXECUTE FUNCTION public.invalidate_snapshots_for_journal_entry();

COMMIT;
