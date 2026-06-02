-- =========================================================================
--  Fiscal Year configuration + fiscal_periods table (Plan A, Phase A1)
--
--  Purpose:
--    1. Make the fiscal year start date configurable per store
--       (defaults to Jan 1, but markets often run Apr 1, Jul 1, etc.).
--    2. Introduce `fiscal_periods` — one row per (store, fiscal year),
--       tracking the FY range and closing state. Closed FYs become the
--       anchor for the offline-history architecture (see
--       OFFLINE_HISTORY_ARCHITECTURE.md):
--          - guarantee a balance_snapshots row exists on FY end
--          - emit an immutable per-FY archive file (Plan C)
--
--    This migration ONLY introduces schema. Year-end close (which fills
--    closed_at / closed_by / archive_* columns) is implemented in Plan C.
-- =========================================================================

BEGIN;

-- -------------------------------------------------------------------------
-- 1. stores.fiscal_year_start_month / fiscal_year_start_day
-- -------------------------------------------------------------------------
ALTER TABLE stores
  ADD COLUMN IF NOT EXISTS fiscal_year_start_month smallint NOT NULL DEFAULT 1
    CHECK (fiscal_year_start_month BETWEEN 1 AND 12),
  ADD COLUMN IF NOT EXISTS fiscal_year_start_day smallint NOT NULL DEFAULT 1
    CHECK (fiscal_year_start_day BETWEEN 1 AND 31);

COMMENT ON COLUMN stores.fiscal_year_start_month IS
  'Month (1-12) the store''s fiscal year begins. Default 1 (January). '
  'Pairs with fiscal_year_start_day. Changing this mid-year breaks '
  'historical reporting — restrict mutation to super_admin.';

COMMENT ON COLUMN stores.fiscal_year_start_day IS
  'Day of month (1-31) the store''s fiscal year begins. Default 1. '
  'If the chosen day does not exist in the start month (e.g. Feb 30), '
  'client-side service clamps to last day of month.';

-- -------------------------------------------------------------------------
-- 2. fiscal_periods
-- -------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS fiscal_periods (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id uuid NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
  fy_label text NOT NULL,                          -- e.g. "FY 2024" or "2024-25"
  start_date date NOT NULL,
  end_date date NOT NULL,
  is_closed boolean NOT NULL DEFAULT false,
  closed_at timestamptz,
  closed_by uuid REFERENCES users(id),

  -- Archive columns (populated by Plan C year-end close action).
  -- Kept on this table so a single row fully describes a fiscal period.
  archive_url text,
  archive_sha256 text,
  archive_row_counts jsonb,

  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT fiscal_periods_store_label_unique UNIQUE (store_id, fy_label),
  CONSTRAINT fiscal_periods_date_order CHECK (start_date <= end_date),
  CONSTRAINT fiscal_periods_closed_consistency CHECK (
    (is_closed = false AND closed_at IS NULL AND closed_by IS NULL)
    OR (is_closed = true AND closed_at IS NOT NULL)
  )
);

CREATE INDEX IF NOT EXISTS idx_fiscal_periods_store
  ON fiscal_periods (store_id, start_date);

CREATE INDEX IF NOT EXISTS idx_fiscal_periods_store_closed
  ON fiscal_periods (store_id, is_closed);

COMMENT ON TABLE fiscal_periods IS
  'One row per fiscal year per store. Closed periods anchor the offline '
  'history architecture (FY-partitioned archives + balance snapshot '
  'closing anchors). See OFFLINE_HISTORY_ARCHITECTURE.md.';

COMMENT ON COLUMN fiscal_periods.fy_label IS
  'Plain-text identifier (e.g. "FY 2024", "2024-25"). NOT multilingual — '
  'used as a stable key for archive paths and grouping; UI displays the '
  'localized form derived from start/end dates.';

COMMENT ON COLUMN fiscal_periods.archive_url IS
  'Supabase Storage path to the immutable FY archive manifest, populated '
  'on year-end close (Plan C). NULL while the period is open or before '
  'the archive job has run.';

-- -------------------------------------------------------------------------
-- 3. updated_at trigger (mirrors convention on other tables)
-- -------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION set_fiscal_periods_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS fiscal_periods_set_updated_at ON fiscal_periods;
CREATE TRIGGER fiscal_periods_set_updated_at
  BEFORE UPDATE ON fiscal_periods
  FOR EACH ROW
  EXECUTE FUNCTION set_fiscal_periods_updated_at();

-- -------------------------------------------------------------------------
-- 4. Row Level Security — store-scoped (mirrors product_categories pattern)
-- -------------------------------------------------------------------------
ALTER TABLE fiscal_periods ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "fiscal_periods_store_scope" ON fiscal_periods;
CREATE POLICY "fiscal_periods_store_scope"
  ON fiscal_periods FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM users u
      WHERE u.id = auth.uid()
        AND (u.store_id = fiscal_periods.store_id OR u.role = 'super_admin')
    )
  );

COMMIT;
