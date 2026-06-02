-- =========================================================================
--  Fix: archives_store_scoped_read RLS policy
--
--  The original policy (20260528190000_archives_storage_bucket.sql) referenced
--  `storage.foldername(name)` inside an EXISTS sub-select against `public.users`.
--  Because the sub-select has its own `name` column in scope (from the
--  `users` row alias), Postgres resolved the unqualified `name` to the
--  user record's name rather than the outer storage.objects.name. The
--  result: the predicate compared the user's name to their store_id, which
--  never matched, so every signed-URL mint failed with "Object not found".
--
--  Fix: qualify the storage object's name as `storage.objects.name` (or
--  pull the EXISTS body into a form that can only see the outer row).
-- =========================================================================

BEGIN;

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
          u.store_id::text = (storage.foldername(storage.objects.name))[1]
          OR u.role = 'super_admin'
        )
    )
  );

COMMIT;
