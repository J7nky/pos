-- =========================================================================
--  Archive path lookup RPC (Plan C, Phase C5)
--
--  Purpose:
--    `get_archive_path(p_store_id, p_fy_label, p_table)` validates that a
--    closed FY archive exists for the requested (store, fy_label, table)
--    and returns the Storage object path. The client then mints a signed
--    URL via the JS SDK:
--
--        const { data: row } = await supabase.rpc('get_archive_path', {
--          p_store_id, p_fy_label, p_table: 'journal_entries',
--        });
--        const { data: signed } = await supabase.storage
--          .from('archives').createSignedUrl(row.path, 300);
--
--  Why not mint the signed URL server-side here:
--    Postgres has no native helper for Storage signed URLs; we'd need
--    pg_net + the Storage REST API, which adds an extra network hop and
--    secret-handling for service-role keys. The bucket's RLS already
--    gates access (store-scoped SELECT), so client-side minting is safe.
--
--  Returns: jsonb { path, sha256, byte_size_gz, row_count } or NULL if
--    the requested archive does not exist.
-- =========================================================================

BEGIN;

CREATE OR REPLACE FUNCTION public.get_archive_path(
  p_store_id uuid,
  p_fy_label text,
  p_table    text
) RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY INVOKER
AS $$
DECLARE
  v_meta jsonb;
BEGIN
  SELECT archive_row_counts -> p_table
  INTO v_meta
  FROM public.fiscal_periods
  WHERE store_id = p_store_id
    AND fy_label = p_fy_label
    AND is_closed = true;

  -- No fiscal_periods row visible to caller (RLS), or the period exists
  -- but hasn't been archived yet, or the requested table isn't in the
  -- per-table metadata map.
  IF v_meta IS NULL THEN
    RETURN NULL;
  END IF;

  -- v_meta has the TableArchiveResult shape:
  --   { path, row_count, byte_size_gz, sha256 }
  -- Return as-is; the client uses `path` to mint a signed URL.
  RETURN v_meta;
END;
$$;

COMMENT ON FUNCTION public.get_archive_path(uuid, text, text) IS
  'Plan C / C5: returns Storage path + metadata for one (store, fy_label, '
  'table) archive entry. Client mints a signed URL via createSignedUrl(). '
  'SECURITY INVOKER — relies on fiscal_periods RLS for access control.';

GRANT EXECUTE ON FUNCTION public.get_archive_path(uuid, text, text) TO authenticated;

COMMIT;
