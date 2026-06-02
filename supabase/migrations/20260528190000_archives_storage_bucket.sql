-- =========================================================================
--  Archives storage bucket (Plan C, Phase C3)
--
--  Purpose:
--    Private bucket holding per-FY, per-table NDJSON.gz files plus the
--    per-store manifest.json. Layout:
--
--      archives/
--        {store_id}/
--          manifest.json
--          journal_entries/fy_{label}.ndjson.gz
--          balance_snapshots/fy_{label}.ndjson.gz
--          bills/fy_{label}.ndjson.gz
--          bill_line_items/fy_{label}.ndjson.gz
--          transactions/fy_{label}.ndjson.gz
--          inventory_bills/fy_{label}.ndjson.gz
--          inventory_items/fy_{label}.ndjson.gz
--
--  Access:
--    - Bucket is PRIVATE — clients never read directly. They call
--      get_archive_url() (C5) which returns a 5-minute signed URL.
--    - Service role (used by the export Edge Function and the signed-URL
--      RPC) bypasses RLS.
--    - Authenticated users get a read policy scoped to their store_id
--      so signed URL minting succeeds for legitimate callers.
-- =========================================================================

BEGIN;

INSERT INTO storage.buckets (id, name, public)
VALUES ('archives', 'archives', false)
ON CONFLICT (id) DO NOTHING;

-- Store-scoped read policy. The first path segment is the store_id; users
-- can list / read only within their own store. Mirrors the fiscal_periods
-- RLS pattern.
DROP POLICY IF EXISTS "archives_store_scoped_read" ON storage.objects;
CREATE POLICY "archives_store_scoped_read"
  ON storage.objects FOR SELECT
  TO authenticated
  USING (
    bucket_id = 'archives'
    AND EXISTS (
      SELECT 1 FROM public.users u
      WHERE u.id = auth.uid()
        AND (
          u.store_id::text = (storage.foldername(name))[1]
          OR u.role = 'super_admin'
        )
    )
  );

-- No write/update/delete policies — only service role (the export
-- Edge Function) and super_admin operations should mutate archive
-- contents.

COMMIT;
