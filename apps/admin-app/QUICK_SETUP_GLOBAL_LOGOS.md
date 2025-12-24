# Quick Setup: Global Logos Storage

## ⚠️ Important: Use Dashboard, Not SQL Migration

The migration file **cannot be run directly**. You must use the Supabase Dashboard UI.

## Step-by-Step Setup

### 1. Create the Bucket

1. Go to **Supabase Dashboard** → **Storage** → **Buckets**
2. Click **New bucket**
3. Configure:
   - **Name**: `global-logos` (exact, case-sensitive)
   - **Public bucket**: ✅ **Enable** (required)
   - **File size limit**: 2MB
   - **Allowed MIME types**: `image/*`
4. Click **Create bucket**

### 2. Create Policies (Dashboard UI)

1. Go to **Storage** → **Buckets** → **global-logos**
2. Click the **Policies** tab
3. Create each policy below:

---

#### Policy 1: Public Read Access

- Click **New Policy**
- **Policy name**: `Public read access for global logos`
- **Allowed operation**: `SELECT`
- **Target roles**: `public`
- **USING expression**:
  ```sql
  bucket_id = 'global-logos'
  ```
- Click **Review** → **Save policy**

---

#### Policy 2: Super Admin Upload

- Click **New Policy**
- **Policy name**: `Super admins can upload global logos`
- **Allowed operation**: `INSERT`
- **Target roles**: `authenticated`
- **WITH CHECK expression**:
  ```sql
  bucket_id = 'global-logos'
  AND EXISTS (
    SELECT 1 FROM users
    WHERE id = auth.uid()
    AND role = 'super_admin'
    AND store_id IS NULL
  )
  ```
- Click **Review** → **Save policy**

---

#### Policy 3: Super Admin Update

- Click **New Policy**
- **Policy name**: `Super admins can update global logos`
- **Allowed operation**: `UPDATE`
- **Target roles**: `authenticated`
- **USING expression**:
  ```sql
  bucket_id = 'global-logos'
  AND EXISTS (
    SELECT 1 FROM users
    WHERE id = auth.uid()
    AND role = 'super_admin'
    AND store_id IS NULL
  )
  ```
- Click **Review** → **Save policy**

---

#### Policy 4: Super Admin Delete

- Click **New Policy**
- **Policy name**: `Super admins can delete global logos`
- **Allowed operation**: `DELETE`
- **Target roles**: `authenticated`
- **USING expression**:
  ```sql
  bucket_id = 'global-logos'
  AND EXISTS (
    SELECT 1 FROM users
    WHERE id = auth.uid()
    AND role = 'super_admin'
    AND store_id IS NULL
  )
  ```
- Click **Review** → **Save policy**

---

### 3. Verify Setup

1. Go to **Global Logos** page in admin app
2. Try uploading a logo
3. If successful, you're done! ✅

## Troubleshooting

**Error: "new row violates row-level security policy"**
- Make sure all 4 policies are created
- Verify you're logged in as super_admin
- Check that bucket name is exactly `global-logos`

**Error: "Bucket not found"**
- Create the bucket first (Step 1)
- Verify bucket name is exactly `global-logos` (case-sensitive)

**Still having issues?**
- Check that bucket is set to **Public**
- Verify your user has `role = 'super_admin'` and `store_id IS NULL`
- See full guide: `GLOBAL_LOGOS_STORAGE_SETUP.md`

