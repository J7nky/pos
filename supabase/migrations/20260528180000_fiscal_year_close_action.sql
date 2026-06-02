-- =========================================================================
--  Year-end close action (Plan C, Phase C2)
--
--  Purpose:
--    Atomic admin action that closes a fiscal_periods row:
--      1. Generates closing-anchor balance_snapshots (source='closing',
--         is_closing=true) for every (account, entity) with non-zero
--         balance as of fy.end_date.
--      2. Flips fiscal_periods.is_closed=true, closed_at, closed_by.
--      3. Subsequent writes into the closed date range are rejected by
--         the journal_entries trigger below.
--
--  Companion `reopen_fiscal_year()` exists as an escape hatch for legal
--  corrections — demotes closing anchors back to source='server' + stale
--  so the next B5 recompute pass refreshes them, and clears the closed
--  state on the period.
--
--  Precedence:
--    Snapshot source precedence is closing > server > client.
--    The close action OVERWRITES whatever snapshot already exists on
--    fy.end_date (server-generated, client-generated, or even an older
--    closing row from a re-run) — closing always wins.
--
--  Scope decision (architecture doc §8 open decision #3):
--    Anchors are written ONLY for tuples that have activity *and* a
--    non-zero balance as of fy.end_date. Zero-balance / no-activity
--    accounts don't need an anchor — `getHistoricalBalance` returns
--    zero in their absence, which matches an explicit zero anchor row.
--
--  Postable-period enforcement:
--    `journal_entries_reject_closed_fy` BEFORE trigger rejects any
--    insert/update/delete whose posted_date falls inside a closed
--    fiscal_periods range for the same store. Reopen the period to
--    post adjustments.
-- =========================================================================

BEGIN;

-- -------------------------------------------------------------------------
-- 1. close_fiscal_year(store_id, fy_label)
-- -------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.close_fiscal_year(
  p_store_id uuid,
  p_fy_label text
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_period          record;
  v_rec             record;
  v_existing_id     uuid;
  v_anchors_written integer := 0;
  v_started_at      timestamptz := clock_timestamp();
BEGIN
  -- 1a. Load + lock the fiscal_periods row.
  SELECT * INTO v_period
  FROM public.fiscal_periods
  WHERE store_id = p_store_id AND fy_label = p_fy_label
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Fiscal period not found: store=%, label=%', p_store_id, p_fy_label
      USING ERRCODE = 'no_data_found';
  END IF;
  IF v_period.is_closed THEN
    RAISE EXCEPTION 'Fiscal period already closed: store=%, label=%', p_store_id, p_fy_label
      USING ERRCODE = 'object_not_in_prerequisite_state';
  END IF;
  IF v_period.end_date > CURRENT_DATE THEN
    RAISE EXCEPTION 'Cannot close fiscal year ending in future (end_date=%)', v_period.end_date
      USING ERRCODE = 'object_not_in_prerequisite_state';
  END IF;

  -- 1b. Walk every (account, entity) with journal activity at or before
  --     end_date and write the closing anchor. Per-currency JSONB delta
  --     aggregation mirrors B3 (`generate_daily_snapshots`).
  FOR v_rec IN
    SELECT
      account_code,
      entity_id,
      branch_id,
      COALESCE(
        jsonb_object_agg(currency, delta) FILTER (WHERE delta <> 0),
        '{}'::jsonb
      ) AS balances
    FROM (
      SELECT
        je.account_code,
        je.entity_id,
        (ARRAY_AGG(je.branch_id ORDER BY je.posted_date DESC, je.created_at DESC))[1] AS branch_id,
        kv.key AS currency,
        SUM(
          COALESCE((kv.value->>'debit')::numeric,  0) -
          COALESCE((kv.value->>'credit')::numeric, 0)
        ) AS delta
      FROM public.journal_entries je
      CROSS JOIN LATERAL jsonb_each(COALESCE(je.amounts, '{}'::jsonb)) AS kv(key, value)
      WHERE je.store_id = p_store_id
        AND je.posted_date <= v_period.end_date
      GROUP BY je.account_code, je.entity_id, kv.key
    ) per_currency
    GROUP BY account_code, entity_id, branch_id
  LOOP
    IF v_rec.balances = '{}'::jsonb THEN
      CONTINUE;
    END IF;

    SELECT id INTO v_existing_id
    FROM public.balance_snapshots
    WHERE store_id = p_store_id
      AND account_code = v_rec.account_code
      AND (entity_id IS NOT DISTINCT FROM v_rec.entity_id)
      AND snapshot_date = v_period.end_date
    LIMIT 1;

    IF v_existing_id IS NOT NULL THEN
      -- Closing precedence: overwrite whatever was there.
      UPDATE public.balance_snapshots
      SET balances   = v_rec.balances,
          source     = 'closing',
          is_closing = true,
          stale      = false,
          verified   = true,
          updated_at = now(),
          branch_id  = v_rec.branch_id
      WHERE id = v_existing_id;
    ELSE
      INSERT INTO public.balance_snapshots (
        store_id, branch_id, account_code, entity_id,
        balances, snapshot_date, snapshot_type,
        verified, stale, is_closing, source,
        created_at
      ) VALUES (
        p_store_id, v_rec.branch_id, v_rec.account_code, v_rec.entity_id,
        v_rec.balances, v_period.end_date, 'daily',
        true, false, true, 'closing',
        now()
      );
    END IF;

    v_anchors_written := v_anchors_written + 1;
  END LOOP;

  -- 1c. Flip the period.
  UPDATE public.fiscal_periods
  SET is_closed  = true,
      closed_at  = now(),
      closed_by  = auth.uid(),
      updated_at = now()
  WHERE id = v_period.id;

  RETURN jsonb_build_object(
    'store_id',                p_store_id,
    'fy_label',                p_fy_label,
    'end_date',                v_period.end_date,
    'closing_anchors_written', v_anchors_written,
    'closed_at',               now(),
    'elapsed_ms',              EXTRACT(MILLISECOND FROM clock_timestamp() - v_started_at)::int
  );
END;
$$;

COMMENT ON FUNCTION public.close_fiscal_year(uuid, text) IS
  'Plan C / C2: atomically close a fiscal_periods row. Writes closing-anchor '
  'balance_snapshots (source=''closing'', is_closing=true) for every '
  '(account, entity) with non-zero balance as of fy.end_date. Subsequent '
  'writes into the period are rejected by reject_post_to_closed_fy() until '
  'reopen_fiscal_year() is called.';

-- -------------------------------------------------------------------------
-- 2. reopen_fiscal_year(store_id, fy_label) — escape hatch for legal
--    corrections / restatements.
-- -------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.reopen_fiscal_year(
  p_store_id uuid,
  p_fy_label text
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_period          record;
  v_anchors_cleared integer;
BEGIN
  SELECT * INTO v_period
  FROM public.fiscal_periods
  WHERE store_id = p_store_id AND fy_label = p_fy_label
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Fiscal period not found: store=%, label=%', p_store_id, p_fy_label
      USING ERRCODE = 'no_data_found';
  END IF;
  IF NOT v_period.is_closed THEN
    RAISE EXCEPTION 'Fiscal period already open: store=%, label=%', p_store_id, p_fy_label
      USING ERRCODE = 'object_not_in_prerequisite_state';
  END IF;

  -- Demote closing anchors back to server-source + stale so the next
  -- B5 recompute pass refreshes them with current journal data.
  WITH cleared AS (
    UPDATE public.balance_snapshots
    SET is_closing = false,
        source     = 'server',
        stale      = true,
        verified   = false,
        updated_at = now()
    WHERE store_id = p_store_id
      AND snapshot_date = v_period.end_date
      AND is_closing = true
    RETURNING id
  )
  SELECT COUNT(*)::int INTO v_anchors_cleared FROM cleared;

  UPDATE public.fiscal_periods
  SET is_closed          = false,
      closed_at          = NULL,
      closed_by          = NULL,
      archive_url        = NULL,
      archive_sha256     = NULL,
      archive_row_counts = NULL,
      updated_at         = now()
  WHERE id = v_period.id;

  RETURN jsonb_build_object(
    'store_id',         p_store_id,
    'fy_label',         p_fy_label,
    'anchors_cleared',  v_anchors_cleared,
    'reopened_at',      now()
  );
END;
$$;

COMMENT ON FUNCTION public.reopen_fiscal_year(uuid, text) IS
  'Plan C / C2: reverse close_fiscal_year. Demotes closing anchors to '
  'source=''server'', stale=true so the next B5 recompute refreshes them, '
  'and clears the closed state + archive_* columns on the period. Audit '
  'trail lives in caller / app layer.';

-- -------------------------------------------------------------------------
-- 3. Trigger: reject posts/edits/deletes into closed fiscal periods.
--
--    Fires BEFORE INSERT/UPDATE/DELETE on journal_entries — the canonical
--    posting path. Other tables (bills, transactions, inventory_bills) all
--    funnel into journal_entries via transactionService, so this single
--    chokepoint covers the posting surface.
-- -------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.reject_post_to_closed_fy()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  v_check_date date := COALESCE(NEW.posted_date, OLD.posted_date);
  v_store_id   uuid := COALESCE(NEW.store_id, OLD.store_id);
BEGIN
  IF EXISTS (
    SELECT 1 FROM public.fiscal_periods
    WHERE store_id = v_store_id
      AND is_closed = true
      AND v_check_date BETWEEN start_date AND end_date
  ) THEN
    RAISE EXCEPTION 'Cannot post to closed fiscal year (posted_date=%, store=%)',
      v_check_date, v_store_id
      USING ERRCODE = 'restrict_violation',
            HINT    = 'Call reopen_fiscal_year() before posting adjustments.';
  END IF;
  RETURN COALESCE(NEW, OLD);
END;
$$;

DROP TRIGGER IF EXISTS journal_entries_reject_closed_fy ON public.journal_entries;
CREATE TRIGGER journal_entries_reject_closed_fy
  BEFORE INSERT OR UPDATE OR DELETE ON public.journal_entries
  FOR EACH ROW
  EXECUTE FUNCTION public.reject_post_to_closed_fy();

COMMENT ON FUNCTION public.reject_post_to_closed_fy() IS
  'Plan C / C2: BEFORE trigger on journal_entries that rejects any '
  'insert/update/delete whose posted_date falls inside a closed '
  'fiscal_periods range for the same store. Use reopen_fiscal_year() '
  'to lift the restriction.';

COMMIT;
