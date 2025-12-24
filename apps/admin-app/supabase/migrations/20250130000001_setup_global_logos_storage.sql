-- Setup Storage Bucket and Policies for Global Logos
-- This migration sets up the global-logos storage bucket with proper RLS policies
-- Only super_admin users can upload/manage logos, but all authenticated users can read them
--
-- IMPORTANT: Storage policies cannot be created via regular SQL migrations
-- because they require owner/service role permissions on the storage.objects table.
-- 
-- You MUST set up the policies manually through the Supabase Dashboard:
-- 1. Go to Storage > Buckets > global-logos > Policies
-- 2. Click "New Policy" for each policy below
-- 3. Or use the Supabase Dashboard SQL Editor with service role key
--
-- See GLOBAL_LOGOS_STORAGE_SETUP.md for detailed step-by-step instructions.

-- Step 1: Create the bucket (if it doesn't exist)
-- Note: Bucket creation must be done manually in Supabase Dashboard
-- Go to Storage > New Bucket
-- Name: global-logos
-- Public: Yes (logos need to be publicly accessible)
-- File size limit: 2MB (recommended)
-- Allowed MIME types: image/*

-- Step 2: Enable RLS on storage.objects
-- RLS is enabled by default on storage.objects

-- Step 3: Create RLS Policies for global-logos bucket
-- NOTE: These policies MUST be created manually through Supabase Dashboard
-- or using service role key in SQL Editor (not via regular migrations)

-- Policy 1: Allow public read access (anyone can view logos)
DROP POLICY IF EXISTS "Public read access for global logos" ON storage.objects;
CREATE POLICY "Public read access for global logos"
ON storage.objects FOR SELECT
TO public
USING (bucket_id = 'global-logos');

-- Policy 2: Allow authenticated super admins to upload logos
DROP POLICY IF EXISTS "Super admins can upload global logos" ON storage.objects;
CREATE POLICY "Super admins can upload global logos"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'global-logos'
  AND EXISTS (
    SELECT 1 FROM users
    WHERE id = auth.uid()
    AND role = 'super_admin'
    AND store_id IS NULL
  )
);

-- Policy 3: Allow authenticated super admins to update logos
DROP POLICY IF EXISTS "Super admins can update global logos" ON storage.objects;
CREATE POLICY "Super admins can update global logos"
ON storage.objects FOR UPDATE
TO authenticated
USING (
  bucket_id = 'global-logos'
  AND EXISTS (
    SELECT 1 FROM users
    WHERE id = auth.uid()
    AND role = 'super_admin'
    AND store_id IS NULL
  )
);

-- Policy 4: Allow authenticated super admins to delete logos
DROP POLICY IF EXISTS "Super admins can delete global logos" ON storage.objects;
CREATE POLICY "Super admins can delete global logos"
ON storage.objects FOR DELETE
TO authenticated
USING (
  bucket_id = 'global-logos'
  AND EXISTS (
    SELECT 1 FROM users
    WHERE id = auth.uid()
    AND role = 'super_admin'
    AND store_id IS NULL
  )
);

-- Add comments for clarity
COMMENT ON POLICY "Public read access for global logos" ON storage.objects IS 
'Allows anyone (including unauthenticated users) to read logos from the global-logos bucket';

COMMENT ON POLICY "Super admins can upload global logos" ON storage.objects IS 
'Allows only super_admin users (role=super_admin AND store_id IS NULL) to upload logos';

COMMENT ON POLICY "Super admins can update global logos" ON storage.objects IS 
'Allows only super_admin users to update existing logos';

COMMENT ON POLICY "Super admins can delete global logos" ON storage.objects IS 
'Allows only super_admin users to delete logos';

