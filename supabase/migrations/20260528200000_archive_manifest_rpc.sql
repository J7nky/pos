-- =========================================================================
--  Archive manifest RPC (Plan C, Phase C4)
--
--  Purpose:
--    `get_archive_manifest(p_store_id)` returns the FY-archive manifest as
--    jsonb. The manifest is derived from `fiscal_periods` rows — that table
--    is the source of truth, with `archive_row_counts` carrying the full
--    per-table metadata { path, row_count, byte_size_gz, sha256 } written
--    by the C3 Edge Function. The `manifest.json` blob in Storage is just
--    a convenience snapshot for clients that prefer to fetch it directly.
--
--  Shape (matches architecture doc §5.4):
--    {
--      "manifest_version": 1,
--      "store_id": "<uuid>",
--      "generated_at": "<iso>",
--      "fiscal_years": [
--        {
--          "fy_label": "FY 2024",
--          "start_date": "2024-01-01",
--          "end_date": "2024-12-31",
--          "is_closed": true,
--          "tables": { "journal_entries": { path, row_count, byte_size_gz, sha256 }, ... },
--          "manifest_sha256": "<sha-of-manifest.json-when-this-fy-was-exported>"
--        }, ...
--      ],
--      "current_fy": "FY 2025"   -- the open (not closed) FY label, if any
--    }
--
--  Authorization:
--    SECURITY INVOKER — relies on the existing fiscal_periods RLS policy
--    (`fiscal_periods_store_scope`) to filter rows the caller can see.
--    Super_admins see all stores; store members see their own store only.
-- =========================================================================

BEGIN;

CREATE OR REPLACE FUNCTION public.get_archive_manifest(
  p_store_id uuid
) RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY INVOKER
AS $$
  WITH closed_periods AS (
    SELECT
      fy_label,
      start_date,
      end_date,
      is_closed,
      archive_row_counts,
      archive_sha256,
      closed_at
    FROM public.fiscal_periods
    WHERE store_id = p_store_id
      AND is_closed = true
      AND archive_row_counts IS NOT NULL
    ORDER BY start_date ASC
  ),
  current_period AS (
    SELECT fy_label
    FROM public.fiscal_periods
    WHERE store_id = p_store_id
      AND is_closed = false
    ORDER BY start_date DESC
    LIMIT 1
  )
  SELECT jsonb_build_object(
    'manifest_version', 1,
    'store_id',         p_store_id,
    'generated_at',     to_jsonb(now()),
    'fiscal_years',     COALESCE(
      (SELECT jsonb_agg(
        jsonb_build_object(
          'fy_label',         cp.fy_label,
          'start_date',       cp.start_date,
          'end_date',         cp.end_date,
          'is_closed',        cp.is_closed,
          'tables',           cp.archive_row_counts,
          'manifest_sha256',  cp.archive_sha256,
          'closed_at',        cp.closed_at
        )
        ORDER BY cp.start_date
      ) FROM closed_periods cp),
      '[]'::jsonb
    ),
    'current_fy', (SELECT fy_label FROM current_period)
  );
$$;

COMMENT ON FUNCTION public.get_archive_manifest(uuid) IS
  'Plan C / C4: returns the FY-archive manifest for a store. Derived from '
  'fiscal_periods.archive_row_counts (the per-table metadata written by '
  'the export Edge Function). SECURITY INVOKER relies on fiscal_periods '
  'RLS for access control.';

GRANT EXECUTE ON FUNCTION public.get_archive_manifest(uuid) TO authenticated;

COMMIT;
