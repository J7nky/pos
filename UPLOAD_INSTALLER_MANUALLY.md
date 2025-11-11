# Upload the Installer File Manually

## Current Status

✅ **Successfully pushed to GitHub:**
- `latest.yml` (345 bytes)
- `Souq POS Setup 0.0.6.exe.blockmap` (227 KB)
- Git LFS configuration
- Documentation files

❌ **Still need to upload:**
- `Souq POS Setup 0.0.6.exe` (207 MB) - Too large for GitHub

## Solution: Upload via Netlify Dashboard

Since the installer is too large for GitHub (even with Git LFS on free tier), you need to upload it directly to Netlify.

### Step-by-Step Instructions

#### 1. Prepare the Installer File

The file is already here:
```
C:\Users\User\Desktop\pos-3\apps\store-app\public\updates\Souq POS Setup 0.0.6.exe
```

#### 2. Go to Netlify Dashboard

1. Open your browser and go to: https://app.netlify.com
2. Log in to your account
3. Find and click on your site: **souq-trablous-pos**

#### 3. Wait for Current Deployment to Finish

- Go to the "Deploys" tab
- Wait for the current deployment (from the git push) to finish
- It should show "Published" with a green checkmark

#### 4. Upload the Installer File

**Option A: Using Netlify CLI (Recommended)**

```powershell
# From the repository root
cd C:\Users\User\Desktop\pos-3

# Deploy just the updates folder
netlify deploy --prod --dir=apps/store-app/public/updates --site=souq-trablous-pos
```

**Option B: Manual Upload via Dashboard**

Unfortunately, Netlify doesn't allow uploading individual files to an existing deployment. You need to:

1. Create a temporary folder with all update files:
   ```powershell
   # Create temp folder
   New-Item -ItemType Directory -Path "$env:TEMP\souq-updates" -Force
   
   # Copy all update files
   Copy-Item "apps\store-app\public\updates\*" "$env:TEMP\souq-updates\" -Force
   
   # Open the folder
   explorer "$env:TEMP\souq-updates"
   ```

2. In Netlify Dashboard:
   - Go to "Deploys" tab
   - Scroll down to "Need to update your site?"
   - Click "Deploy manually"
   - Drag the entire `souq-updates` folder
   - Wait for upload to complete

#### 5. Verify the Upload

After deployment completes, test these URLs:

1. **Check latest.yml:**
   ```
   https://souq-trablous.com/updates/latest.yml
   ```
   Should show YAML content

2. **Check installer (IMPORTANT):**
   ```
   https://souq-trablous.com/updates/Souq%20POS%20Setup%200.0.6.exe
   ```
   Should start downloading the file (207 MB)

3. **Check blockmap:**
   ```
   https://souq-trablous.com/updates/Souq%20POS%20Setup%200.0.6.exe.blockmap
   ```
   Should be accessible

## Alternative: Use Cloud Storage

For a more permanent solution, consider hosting the large installer on cloud storage:

### Cloudflare R2 (Recommended - Free Tier)

**Benefits:**
- 10 GB free storage
- No egress fees (unlimited downloads)
- Fast CDN delivery

**Setup:**
1. Sign up at https://dash.cloudflare.com
2. Go to R2 Object Storage
3. Create a bucket: `souq-pos-updates`
4. Upload the installer file
5. Make it public
6. Update `package.json` publish URL

### Backblaze B2

**Benefits:**
- 10 GB free storage
- 1 GB/day free download
- Very affordable ($0.005/GB after free tier)

**Setup:**
1. Sign up at https://www.backblaze.com/b2
2. Create a bucket
3. Upload installer
4. Get public URL
5. Update `package.json`

## Why Git LFS Didn't Work

Git LFS has bandwidth limits:
- **GitHub Free:** 1 GB/month bandwidth
- **Your installer:** 207 MB per download
- **Result:** Only ~4 downloads per month before hitting limit

For production use with multiple clients, you need:
- Cloud storage with better bandwidth limits
- Or paid Git LFS plan ($5/month for 50 GB bandwidth)

## Recommended Long-Term Solution

1. **Use Cloudflare R2 for installer files** (free, unlimited bandwidth)
2. **Keep `latest.yml` in git** (small file, easy to update)
3. **Update `package.json` publish URL** to point to R2

This way:
- No git repository bloat
- No bandwidth limits
- Fast global delivery via CDN
- Free forever (within 10 GB storage)

## Quick Commands Reference

```powershell
# Create temp folder with all update files
New-Item -ItemType Directory -Path "$env:TEMP\souq-updates" -Force
Copy-Item "apps\store-app\public\updates\*" "$env:TEMP\souq-updates\" -Force
explorer "$env:TEMP\souq-updates"

# Or deploy via Netlify CLI
cd C:\Users\User\Desktop\pos-3
netlify deploy --prod --dir=apps/store-app/public/updates
```

## Current Files Status

| File | Size | Status | Location |
|------|------|--------|----------|
| `latest.yml` | 345 B | ✅ In Git | GitHub |
| `*.blockmap` | 227 KB | ✅ In Git | GitHub |
| `*.exe` | 207 MB | ❌ Not uploaded | Local only |

**Next step:** Upload the .exe file using one of the methods above.
