# Supabase Storage Setup for Product Images

This guide explains how to set up the Supabase Storage bucket for product images used in the Global Products module.

## Prerequisites

- Access to your Supabase project dashboard
- Admin/super admin credentials

## Setup Steps

### 1. Create Storage Bucket

1. Go to your Supabase project dashboard
2. Navigate to **Storage** in the left sidebar
3. Click **New bucket**
4. Configure the bucket:
   - **Name**: `product-images` (must match exactly)
   - **Public bucket**: ✅ Enable (images need to be publicly accessible)
   - **File size limit**: 5MB (recommended)
   - **Allowed MIME types**: `image/*` (or specific: `image/jpeg, image/png, image/webp`)

### 2. Configure Storage Policies

After creating the bucket, set up Row Level Security (RLS) policies:

#### Policy 1: Allow Public Read Access
```sql
-- Allow anyone to read product images (public bucket)
CREATE POLICY "Public read access for product images"
ON storage.objects FOR SELECT
TO public
USING (bucket_id = 'product-images');
```

#### Policy 2: Allow Authenticated Users to Upload
```sql
-- Allow authenticated super admins to upload images
CREATE POLICY "Super admins can upload product images"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'product-images'
  AND EXISTS (
    SELECT 1 FROM users
    WHERE id = auth.uid()
    AND role = 'super_admin'
    AND store_id IS NULL
  )
);
```

#### Policy 3: Allow Authenticated Users to Update
```sql
-- Allow authenticated super admins to update images
CREATE POLICY "Super admins can update product images"
ON storage.objects FOR UPDATE
TO authenticated
USING (
  bucket_id = 'product-images'
  AND EXISTS (
    SELECT 1 FROM users
    WHERE id = auth.uid()
    AND role = 'super_admin'
    AND store_id IS NULL
  )
);
```

#### Policy 4: Allow Authenticated Users to Delete
```sql
-- Allow authenticated super admins to delete images
CREATE POLICY "Super admins can delete product images"
ON storage.objects FOR DELETE
TO authenticated
USING (
  bucket_id = 'product-images'
  AND EXISTS (
    SELECT 1 FROM users
    WHERE id = auth.uid()
    AND role = 'super_admin'
    AND store_id IS NULL
  )
);
```

### 3. Verify Setup

1. Try uploading an image through the admin dashboard
2. Check that the image appears in the Storage bucket under `product_images/` folder
3. Verify the public URL works by accessing it directly

## Storage Structure

Images are stored in the following structure:
```
product-images/
  └── product_images/
      ├── [uuid].jpg
      ├── [uuid].png
      └── ...
```

The path format is: `product_images/{uuid}.{extension}`

## Troubleshooting

### Error: "Bucket not found"
- Ensure the bucket name is exactly `product-images` (case-sensitive)
- Check that the bucket exists in your Supabase project

### Error: "New row violates row-level security policy"
- Verify that RLS policies are correctly set up
- Ensure you're logged in as a super admin user
- Check that your user has `role = 'super_admin'` and `store_id IS NULL`

### Error: "File size exceeds limit"
- Check the bucket's file size limit (should be at least 5MB)
- Verify the image file is under 5MB before uploading

### Images not displaying
- Ensure the bucket is set to **Public**
- Check that the public URL is correctly formatted
- Verify CORS settings if accessing from a different domain

## Notes

- Images are automatically deleted from storage when a product is deleted
- Old images are replaced when updating a product with a new image
- The storage bucket uses UUID-based filenames to prevent conflicts
- All images are stored in the `product_images/` folder within the bucket

