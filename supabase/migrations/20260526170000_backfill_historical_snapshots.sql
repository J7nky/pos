-- =========================================================================
--  One-time historical snapshot backfill (Plan B, Phase B7)
--
--  Purpose:
--    For existing stores with months/years of `journal_entries` but no
--    matching `balance_snapshots`, generate one snapshot per
--    distinct `posted_date` so the read path has anchors to walk back
--    from. Idempotent — re-running on a store that's already fully
--    backfilled is a near-no-op (each call rewrites existing
--    server-source rows, which is harmless aside from updated_at churn).
--
--  Why per-distinct-posted-date and not per-calendar-day:
--    A store with no activity on a given day produces no rows in the
--    zero-balance-skip rule anyway, so calendar-day iteration would
--    waste work. Iterating distinct posted_date values bounds the run
--    to the actual data shape.
--
--  Performance:
--    O(D × A × E) where D = distinct posted dates, A = accounts with
--    activity, E = entities with activity. For a 5-year store with
--    ~1500 active dates × 30 accounts × 500 entities ≈ 22M tuple
--    visits — runs in minutes on modern Postgres. Each store is
--    processed independently; no cross-store dependencies.
--
--  Safety:
--    Closing anchors (`is_closing = true`) are honored — the B3
--    generator skips them.
--
--  Usage:
--    Call manually per-store from the admin app or via psql:
--        SELECT public.backfill_balance_snapshots('<store_uuid>');
--    Or for all stores at once:
--        SELECT public.backfill_balance_snapshots_for_all_stores();
-- =========================================================================

BEGIN;

CREATE OR REPLACE FUNCTION public.backfill_balance_snapshots(
  p_store_id uuid
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_date date;
  v_total integer := 0;
  v_dates integer := 0;
  v_written integer;
  v_started_at timestamptz := clock_timestamp();
BEGIN
  FOR v_date IN
    SELECT DISTINCT posted_date
    FROM public.journal_entries
    WHERE store_id = p_store_id
    ORDER BY posted_date ASC
  LOOP
    v_written := public.generate_daily_snapshots(p_store_id, v_date);
    v_total := v_total + v_written;
    v_dates := v_dates + 1;
  END LOOP;

  RETURN jsonb_build_object(
    'store_id', p_store_id,
    'distinct_dates_processed', v_dates,
    'snapshots_written', v_total,
    'elapsed_ms', EXTRACT(MILLISECOND FROM clock_timestamp() - v_started_at)::int
  );
END;
$$;

COMMENT ON FUNCTION public.backfill_balance_snapshots(uuid) IS
  'Plan B / B7: idempotent historical snapshot backfill for one store. '
  'Iterates DISTINCT posted_date values in journal_entries and runs the '
  'B3 generator per date. Safe to re-run.';

CREATE OR REPLACE FUNCTION public.backfill_balance_snapshots_for_all_stores()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_store_id uuid;
  v_per_store_result jsonb;
  v_results jsonb := '[]'::jsonb;
  v_grand_total integer := 0;
BEGIN
  FOR v_store_id IN
    SELECT id FROM public.stores
  LOOP
    v_per_store_result := public.backfill_balance_snapshots(v_store_id);
    v_results := v_results || jsonb_build_array(v_per_store_result);
    v_grand_total := v_grand_total + (v_per_store_result->>'snapshots_written')::int;
  END LOOP;

  RETURN jsonb_build_object(
    'total_snapshots_written', v_grand_total,
    'per_store', v_results
  );
END;
$$;

COMMENT ON FUNCTION public.backfill_balance_snapshots_for_all_stores() IS
  'Plan B / B7: backfill snapshots for every store. Long-running. Intended '
  'for one-time use after rolling out Plan B; can also be run after an '
  'archive re-import (Plan C) if the local snapshot table was wiped.';

COMMIT;
