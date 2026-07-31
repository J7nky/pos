-- =========================================================================
--  Security hardening: scope SECURITY DEFINER RPCs to their tenant
--
--  Problem (pre-fix):
--    Postgres grants EXECUTE to PUBLIC by default, which `anon` and
--    `authenticated` inherit. Several SECURITY DEFINER functions run as the
--    table owner (bypassing RLS) yet never verify the caller belongs to the
--    store they operate on. Any authenticated user could therefore:
--      - close_fiscal_year / reopen_fiscal_year on ANY store (flip is_closed,
--        rewrite/delete closing-anchor balance_snapshots),
--      - generate_daily_snapshots on ANY store (overwrite canonical balances),
--      - seed_store_defaults_from_tenant_type on ANY store (inject taxonomy).
--
--  Fix:
--    1. A shared guard `public.assert_store_access(uuid)` that raises unless
--       the caller is a member of the store or a super_admin (service_role
--       bypasses — it is a trusted backend context that does its own checks).
--    2. User-callable per-store RPCs (close/reopen/seed) REVOKE EXECUTE FROM
--       PUBLIC, GRANT to authenticated + service_role, and call the guard
--       internally (the GRANT lets users in; the guard confines them to their
--       own store).
--    3. Infrastructure RPCs (snapshot generators) are NOT user-callable at
--       all: REVOKE EXECUTE FROM PUBLIC, GRANT only to service_role. pg_cron
--       runs as postgres and bypasses grants, so the nightly job is
--       unaffected.
--
--  Idempotent: safe to re-run. Reversible: see the rollback block at the end
--  (commented; uncomment to restore the prior PUBLIC-executable state).
-- =========================================================================

BEGIN;

-- -------------------------------------------------------------------------
-- 0. Shared tenant guard
-- -------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.assert_store_access(p_store_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Trusted backend (service key / Edge Function): does its own authorization.
  IF auth.role() = 'service_role' THEN
    RETURN;
  END IF;

  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Authentication required'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.users u
    WHERE u.id = auth.uid()
      AND (u.store_id = p_store_id OR u.role = 'super_admin')
  ) THEN
    RAISE EXCEPTION 'Not authorized for store %', p_store_id
      USING ERRCODE = 'insufficient_privilege';
  END IF;
END;
$$;

COMMENT ON FUNCTION public.assert_store_access(uuid) IS
  'Tenant guard for SECURITY DEFINER RPCs. Raises insufficient_privilege '
  'unless auth.uid() is a member of p_store_id or a super_admin. service_role '
  'bypasses (trusted backend).';

-- Lock the guard itself down: only the roles that call the guarded RPCs need it.
REVOKE ALL ON FUNCTION public.assert_store_access(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.assert_store_access(uuid) TO authenticated, service_role;

-- -------------------------------------------------------------------------
-- 1. close_fiscal_year — add internal guard, restrict EXECUTE
--    (body reproduced verbatim from 20260528180000 + one guard line)
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
  -- SECURITY: confine to the caller's own store (or super_admin/service_role).
  PERFORM public.assert_store_access(p_store_id);

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

REVOKE ALL ON FUNCTION public.close_fiscal_year(uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.close_fiscal_year(uuid, text) TO authenticated, service_role;

-- -------------------------------------------------------------------------
-- 2. reopen_fiscal_year — add internal guard, restrict EXECUTE
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
  -- SECURITY: confine to the caller's own store (or super_admin/service_role).
  PERFORM public.assert_store_access(p_store_id);

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

REVOKE ALL ON FUNCTION public.reopen_fiscal_year(uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.reopen_fiscal_year(uuid, text) TO authenticated, service_role;

-- -------------------------------------------------------------------------
-- 3. seed_store_defaults_from_tenant_type — add internal guard, restrict
--    (body reproduced verbatim from 20260514120000 + one guard line)
-- -------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.seed_store_defaults_from_tenant_type(
  store_uuid uuid,
  tenant_type_code text DEFAULT NULL
) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  resolved_type text;
  tmpl record;
  cat jsonb;
  un jsonb;
BEGIN
  -- SECURITY: confine to the caller's own store (or super_admin/service_role).
  PERFORM public.assert_store_access(store_uuid);

  IF tenant_type_code IS NULL THEN
    SELECT tenant_type INTO resolved_type FROM stores WHERE id = store_uuid;
  ELSE
    resolved_type := tenant_type_code;
  END IF;
  IF resolved_type IS NULL THEN
    resolved_type := 'produce_market';
  END IF;

  SELECT * INTO tmpl FROM tenant_type_templates WHERE tenant_type = resolved_type AND is_active = true;
  IF NOT FOUND THEN
    SELECT * INTO tmpl FROM tenant_type_templates WHERE tenant_type = 'produce_market' AND is_active = true;
    IF NOT FOUND THEN
      RAISE NOTICE 'No tenant_type template found; no defaults seeded for store %', store_uuid;
      RETURN;
    END IF;
  END IF;

  FOR cat IN SELECT * FROM jsonb_array_elements(tmpl.default_categories)
  LOOP
    INSERT INTO product_categories (store_id, code, name, sort_order, is_active, is_system)
    VALUES (
      store_uuid,
      cat->>'code',
      cat->'name',
      COALESCE((cat->>'sort_order')::int, 100),
      true,
      true
    )
    ON CONFLICT (store_id, code) DO NOTHING;
  END LOOP;

  FOR un IN SELECT * FROM jsonb_array_elements(tmpl.default_units)
  LOOP
    INSERT INTO units_of_measure (store_id, code, name, system_role, sort_order, is_active, is_system)
    VALUES (
      store_uuid,
      un->>'code',
      un->'name',
      NULLIF(un->>'system_role', ''),
      COALESCE((un->>'sort_order')::int, 100),
      true,
      true
    )
    ON CONFLICT (store_id, code) DO NOTHING;
  END LOOP;
END;
$$;

REVOKE ALL ON FUNCTION public.seed_store_defaults_from_tenant_type(uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.seed_store_defaults_from_tenant_type(uuid, text) TO authenticated, service_role;

-- -------------------------------------------------------------------------
-- 4. Snapshot generators — infrastructure only, NOT user-callable.
--    No body change needed: revoking PUBLIC and granting only service_role
--    blocks anon/authenticated while leaving pg_cron (runs as postgres,
--    bypasses grants) and backend/Edge-Function (service_role) callers.
-- -------------------------------------------------------------------------
REVOKE ALL ON FUNCTION public.generate_daily_snapshots(uuid, date) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.generate_daily_snapshots(uuid, date) TO service_role;

REVOKE ALL ON FUNCTION public.generate_daily_snapshots_for_all_stores(date) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.generate_daily_snapshots_for_all_stores(date) TO service_role;

COMMIT;

-- =========================================================================
--  ROLLBACK (manual — uncomment and run to restore prior open state)
-- =========================================================================
-- BEGIN;
--   -- Re-grant PUBLIC execute (restores the pre-hardening, cross-tenant state).
--   GRANT EXECUTE ON FUNCTION public.close_fiscal_year(uuid, text) TO PUBLIC;
--   GRANT EXECUTE ON FUNCTION public.reopen_fiscal_year(uuid, text) TO PUBLIC;
--   GRANT EXECUTE ON FUNCTION public.seed_store_defaults_from_tenant_type(uuid, text) TO PUBLIC;
--   GRANT EXECUTE ON FUNCTION public.generate_daily_snapshots(uuid, date) TO PUBLIC;
--   GRANT EXECUTE ON FUNCTION public.generate_daily_snapshots_for_all_stores(date) TO PUBLIC;
--   -- The internal PERFORM assert_store_access() lines remain but are inert for
--   -- super_admins/store members; to fully revert, re-run the original
--   -- CREATE OR REPLACE bodies from 20260528180000 / 20260514120000.
-- COMMIT;
