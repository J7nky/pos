# Global Logos Storage Setup

This guide explains how to set up the Supabase Storage bucket for global logos used in the Global Logos management module.

## Prerequisites

- Access to your Supabase project dashboard
- Super admin credentials

## Setup Steps

### 1. Create Storage Bucket

1. Go to your Supabase project dashboard
2. Navigate to **Storage** in the left sidebar
3. Click **New bucket**
4. Configure the bucket:
   - **Name**: `global-logos` (must match exactly)
   - **Public bucket**: ✅ Enable (logos need to be publicly accessible)
   - **File size limit**: 2MB (recommended)
   - **Allowed MIME types**: `image/*` (or specific: `image/jpeg, image/png, image/webp`)

### 2. Set Up Storage Policies

**IMPORTANT**: Storage policies cannot be created via regular SQL migrations because they require owner permissions. You have two options:

#### Option A: Use Supabase Dashboard (Recommended)

1. Go to **Storage** → **Buckets** → **global-logos**
2. Click on the **Policies** tab
3. Click **New Policy** for each policy below

#### Option B: Use SQL Editor with Service Role Key

1. Go to **Settings** → **API** → Copy your **service_role** key (keep it secret!)
2. Go to **SQL Editor**
3. Use the service role key to authenticate (or run as owner)
4. Run the SQL below

**SQL to run** (copy and paste into SQL Editor):

```sql
-- Policy 1: Allow public read access
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
```

### 3. Verify Setup

1. Try uploading a logo through the admin dashboard
2. Check that the logo appears in the Storage bucket
3. Verify the public URL works by accessing it directly
4. Test that branch admins can see the logos in the store app

## Storage Structure

Logos are stored in the following structure:
```
global-logos/
  ├── [uuid].jpg
  ├── [uuid].png
  └── ...
```

The path format is: `{uuid}.{extension}` (stored directly in bucket root)

## Troubleshooting

### Error: "Bucket not found"
- Ensure the bucket name is exactly `global-logos` (case-sensitive)
- Check that the bucket exists in your Supabase project

### Error: "new row violates row-level security policy"
- Verify that RLS policies are correctly set up (run the migration SQL)
- Ensure you're logged in as a super admin user
- Check that your user has `role = 'super_admin'` and `store_id IS NULL`
- Verify the bucket name matches exactly: `global-logos`

### Error: "File size exceeds limit"
- Check the bucket's file size limit (should be at least 2MB)
- Verify the image file is under 2MB before uploading

### Logos not displaying
- Ensure the bucket is set to **Public**
- Check that the public URL is correctly formatted
- Verify CORS settings if accessing from a different domain

### Cannot upload logos
- Verify you're logged in as a super admin
- Check that the RLS policies are correctly applied
- Ensure the bucket exists and is accessible
- Check browser console for detailed error messages

## Notes

- Logos are automatically deleted from storage when removed via the admin interface
- The storage bucket uses UUID-based filenames to prevent conflicts
- All logos are stored in the bucket root (no subfolders)
- Logos are publicly accessible, so they can be used in receipts and documents

## Testing

After setup, test the following:

1. **Upload a logo**: Should succeed without errors
2. **View logos**: Should display in the grid
3. **Delete a logo**: Should remove from storage
4. **Access public URL**: Should load the image directly
5. **Store app**: Branch admins should see logos in Settings > Receipt Settings

