-- =========================================================================
--  Server-side balance snapshot generator (Plan B, Phase B3)
--
--  Purpose:
--    Authoritative nightly job that computes each (store, account, entity)
--    closing balance for a target date and writes it as the canonical
--    `source = 'server'` snapshot. Marks the result non-stale even if a
--    journal-entry edit had previously flagged downstream snapshots —
--    the recompute IS the clear.
--
--  Architecture:
--    Two functions:
--      generate_daily_snapshots(store_id, target_date) → int
--          Per-store, single-date. Idempotent. Returns count of rows
--          written (insert + update).
--      generate_daily_snapshots_for_all_stores(target_date) → jsonb
--          Wrapper that loops over every store. Returns per-store counts.
--          Intended caller: pg_cron (see scheduling note at bottom).
--
--  Algorithm (per store, per target_date):
--    1. For each (account_code, entity_id) with any journal activity:
--       a. Compute total balance from journal entries WHERE
--          posted_date <= target_date, summed per-currency from amounts JSONB.
--       b. Look up existing snapshot at target_date.
--          - If it exists AND is_closing = true → SKIP (immutable anchor).
--          - If it exists → UPDATE (preserves id, refreshes balances,
--            marks source='server', stale=false).
--          - Else → INSERT new row source='server'.
--       c. Zero-balance + no-activity rule: skip outright (matches the
--          client-side convention in snapshotService.ts so server and
--          client agree on which rows exist).
--    2. Return count of rows written.
--
--  Non-goals:
--    - Schema-side scheduling: pg_cron config is environment-specific and
--      goes into the Supabase dashboard separately. The function is just
--      callable.
--    - Backfill of past dates: see B7. Caller can loop over a date range
--      by calling generate_daily_snapshots() repeatedly.
-- =========================================================================

BEGIN;

-- -------------------------------------------------------------------------
-- 1. Per-store, per-date generator
-- -------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.generate_daily_snapshots(
  p_store_id uuid,
  p_target_date date
) RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_written integer := 0;
  v_rec record;
  v_balances jsonb;
  v_existing_id uuid;
  v_existing_is_closing boolean;
BEGIN
  -- Iterate every (account, entity) tuple that has ANY journal activity
  -- on or before the target date.
  FOR v_rec IN
    SELECT
      account_code,
      entity_id,
      branch_id,
      -- Sum (debit - credit) per currency from the JSONB amounts map.
      -- jsonb_object_agg drops keys whose accumulated value is zero
      -- (filtered in HAVING below) so a USD-only store produces a USD-
      -- only balances map.
      COALESCE(
        jsonb_object_agg(currency, delta) FILTER (WHERE delta <> 0),
        '{}'::jsonb
      ) AS balances
    FROM (
      SELECT
        je.account_code,
        je.entity_id,
        -- branch_id is taken from the most recent entry so balances tied
        -- to a specific branch carry the right id; multi-branch entities
        -- collapse to whichever branch wrote last. Acceptable — the
        -- store-level total is the load-bearing number.
        (ARRAY_AGG(je.branch_id ORDER BY je.posted_date DESC, je.created_at DESC))[1] AS branch_id,
        kv.key AS currency,
        SUM(
          COALESCE((kv.value->>'debit')::numeric,  0) -
          COALESCE((kv.value->>'credit')::numeric, 0)
        ) AS delta
      FROM public.journal_entries je
      CROSS JOIN LATERAL jsonb_each(COALESCE(je.amounts, '{}'::jsonb)) AS kv(key, value)
      WHERE je.store_id = p_store_id
        AND je.posted_date <= p_target_date
      GROUP BY je.account_code, je.entity_id, kv.key
    ) per_currency
    GROUP BY account_code, entity_id, branch_id
  LOOP
    -- Skip rows whose balances map is empty (all currencies netted to zero
    -- AND there are no non-zero deltas). Matches the client convention.
    IF v_rec.balances = '{}'::jsonb THEN
      CONTINUE;
    END IF;

    -- Look up existing snapshot at target_date for this (account, entity).
    SELECT id, is_closing
    INTO v_existing_id, v_existing_is_closing
    FROM public.balance_snapshots
    WHERE store_id = p_store_id
      AND account_code = v_rec.account_code
      AND (entity_id IS NOT DISTINCT FROM v_rec.entity_id)
      AND snapshot_date = p_target_date
    LIMIT 1;

    -- Closing anchors are immutable.
    IF v_existing_is_closing THEN
      CONTINUE;
    END IF;

    IF v_existing_id IS NOT NULL THEN
      UPDATE public.balance_snapshots
      SET balances    = v_rec.balances,
          source      = 'server',
          stale       = false,
          verified    = false,
          updated_at  = now(),
          branch_id   = v_rec.branch_id
      WHERE id = v_existing_id;
    ELSE
      INSERT INTO public.balance_snapshots (
        store_id, branch_id, account_code, entity_id,
        balances, snapshot_date, snapshot_type,
        verified, stale, is_closing, source,
        created_at
      ) VALUES (
        p_store_id, v_rec.branch_id, v_rec.account_code, v_rec.entity_id,
        v_rec.balances, p_target_date, 'daily',
        false, false, false, 'server',
        now()
      );
    END IF;

    v_written := v_written + 1;
  END LOOP;

  RETURN v_written;
END;
$$;

COMMENT ON FUNCTION public.generate_daily_snapshots(uuid, date) IS
  'Plan B / B3: writes canonical server-sourced balance snapshots for one '
  'store and one date. Idempotent. Preserves is_closing anchors. Caller '
  'is the nightly pg_cron job or an admin-triggered RPC.';

-- -------------------------------------------------------------------------
-- 2. All-stores wrapper
-- -------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.generate_daily_snapshots_for_all_stores(
  p_target_date date DEFAULT (CURRENT_DATE - 1)
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_store_id uuid;
  v_count integer;
  v_total integer := 0;
  v_results jsonb := '{}'::jsonb;
BEGIN
  FOR v_store_id IN
    SELECT id FROM public.stores
  LOOP
    v_count := public.generate_daily_snapshots(v_store_id, p_target_date);
    v_results := v_results || jsonb_build_object(v_store_id::text, v_count);
    v_total := v_total + v_count;
  END LOOP;

  RETURN jsonb_build_object(
    'target_date', p_target_date,
    'stores_processed', jsonb_object_keys(v_results),
    'total_snapshots_written', v_total,
    'per_store', v_results
  );
END;
$$;

COMMENT ON FUNCTION public.generate_daily_snapshots_for_all_stores(date) IS
  'Plan B / B3: wrapper that runs generate_daily_snapshots for every store. '
  'Default target_date = yesterday (UTC). Scheduling is configured via the '
  'Supabase dashboard pg_cron settings — example: '
  'SELECT cron.schedule(''nightly-balance-snapshots'', ''15 0 * * *'', '
  '$$SELECT public.generate_daily_snapshots_for_all_stores();$$);';

COMMIT;
