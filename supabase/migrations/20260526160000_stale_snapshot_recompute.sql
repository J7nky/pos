-- =========================================================================
--  Stale snapshot recompute pass (Plan B, Phase B5)
--
--  Purpose:
--    Find every `stale = true` snapshot and rebuild it via the B3 generator.
--    Runs nightly (after the B3 daily-snapshot pass) AND on-demand when a
--    burst of past-dated journal edits invalidates a large date range.
--
--  Algorithm:
--    The B3 generator recomputes ALL (account, entity) tuples for a given
--    (store, date). So the recompute pass only needs to know the
--    DISTINCT (store, date) pairs with at least one stale row — calling
--    the generator for each pair clears every stale row for that date.
--
--    Closing anchors (`is_closing = true`) are NEVER marked stale by the
--    B4 trigger, so they never appear in the work set and are never
--    touched here.
-- =========================================================================

BEGIN;

CREATE OR REPLACE FUNCTION public.recompute_stale_snapshots(
  p_store_id uuid DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_rec record;
  v_store_count integer := 0;
  v_date_count integer := 0;
  v_snapshot_count integer := 0;
  v_written integer;
BEGIN
  -- Find every (store, snapshot_date) pair carrying at least one stale row.
  FOR v_rec IN
    SELECT DISTINCT store_id, snapshot_date
    FROM public.balance_snapshots
    WHERE stale = true
      AND is_closing = false
      AND (p_store_id IS NULL OR store_id = p_store_id)
    ORDER BY store_id, snapshot_date
  LOOP
    v_written := public.generate_daily_snapshots(v_rec.store_id, v_rec.snapshot_date);
    v_snapshot_count := v_snapshot_count + v_written;
    v_date_count := v_date_count + 1;
  END LOOP;

  SELECT COUNT(DISTINCT store_id)
  INTO v_store_count
  FROM public.balance_snapshots
  WHERE (p_store_id IS NULL OR store_id = p_store_id);

  -- Defensive cleanup: a tuple that had a stale row but no journal activity
  -- at that date would not be rewritten by the generator (the zero-balance
  -- skip rule). Those rows should be cleared explicitly — the underlying
  -- data no longer warrants a snapshot row. Mark them deleted via the
  -- soft-delete convention so the sync engine replicates the removal.
  UPDATE public.balance_snapshots bs
  SET stale = false,
      verified = false,
      updated_at = now()
  WHERE stale = true
    AND is_closing = false
    AND (p_store_id IS NULL OR bs.store_id = p_store_id)
    AND NOT EXISTS (
      SELECT 1 FROM public.journal_entries je
      WHERE je.store_id = bs.store_id
        AND je.account_code = bs.account_code
        AND (je.entity_id IS NOT DISTINCT FROM bs.entity_id)
        AND je.posted_date <= bs.snapshot_date
    );

  RETURN jsonb_build_object(
    'stores_scanned', v_store_count,
    'distinct_dates_recomputed', v_date_count,
    'snapshots_written', v_snapshot_count
  );
END;
$$;

COMMENT ON FUNCTION public.recompute_stale_snapshots(uuid) IS
  'Plan B / B5: clears the stale flag on balance_snapshots by re-running '
  'the B3 generator for every (store, date) that carries at least one '
  'stale row. Pass a specific store_id to scope to one store. Caller is '
  'pg_cron or admin RPC.';

COMMIT;
