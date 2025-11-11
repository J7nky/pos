# Solution: Upload Large Update Files

## Problem
The installer file (207 MB) exceeds GitHub's 100 MB file size limit, so we can't push it via git.

## Solution Options

### Option 1: Use Netlify Drop (Recommended - Easiest)

1. **Prepare the files:**
   - The files are already in `apps/store-app/public/updates/`
   - You have: `latest.yml`, `Souq POS Setup 0.0.6.exe`, `Souq POS Setup 0.0.6.exe.blockmap`

2. **Go to Netlify Dashboard:**
   - Visit https://app.netlify.com
   - Select your site: **souq-trablous-pos**

3. **Use Netlify Drop:**
   - Go to "Deploys" tab
   - Scroll down to "Need to update your site?"
   - Click "Deploy manually"
   - Drag and drop the `apps/store-app/public/updates` folder
   - OR click "Browse to upload" and select the folder

4. **Wait for deployment:**
   - Netlify will upload and deploy the files
   - Usually takes 2-5 minutes
   - You'll see a live URL when done

5. **Verify:**
   - Check https://souq-trablous.com/updates/latest.yml
   - Should show the YAML content

### Option 2: Use Git LFS (For Future Updates)

If you want to use git for future updates, set up Git LFS:

```powershell
# 1. Install Git LFS (if not already installed)
# Download from: https://git-lfs.github.com/

# 2. Initialize Git LFS in your repository
cd C:\Users\User\Desktop\pos-3
git lfs install

# 3. Track large files
git lfs track "apps/store-app/public/updates/*.exe"
git lfs track "apps/store-app/public/updates/*.blockmap"

# 4. Add .gitattributes
git add .gitattributes

# 5. Now add and commit the files
git add -f apps/store-app/public/updates/
git commit -m "Add update files with Git LFS"
git push
```

**Note:** Git LFS has bandwidth limits on free plans. GitHub free: 1 GB/month bandwidth.

### Option 3: Use External File Hosting

Host the large files on a CDN or cloud storage:

**Services to consider:**
- **Cloudflare R2** (Free tier: 10 GB storage, no egress fees)
- **Backblaze B2** (Free tier: 10 GB storage, 1 GB/day download)
- **AWS S3** (Pay as you go)
- **Google Cloud Storage** (Pay as you go)

**Steps:**
1. Upload files to cloud storage
2. Get public URLs
3. Update `package.json` publish URL to point to cloud storage
4. Only commit `latest.yml` to git (small file)

### Option 4: Netlify CLI with Build Bypass

Create a separate Netlify site just for updates:

```powershell
# 1. Create a new site for updates only
netlify sites:create --name souq-pos-updates

# 2. Deploy just the updates folder
cd apps/store-app/public
netlify deploy --prod --dir=updates --site=souq-pos-updates

# 3. Configure custom domain (optional)
# updates.souq-trablous.com
```

## Recommended Approach

**For now: Use Option 1 (Netlify Drop)**
- Fastest solution
- No configuration needed
- Works immediately

**For future: Set up Option 3 (External Hosting)**
- More scalable
- Better for large files
- No git repository bloat
- Cheaper bandwidth costs

## Current Status

✅ Files are ready in: `apps/store-app/public/updates/`
- latest.yml (345 bytes)
- Souq POS Setup 0.0.6.exe (207 MB)
- Souq POS Setup 0.0.6.exe.blockmap (227 KB)

⏳ **Next step:** Upload via Netlify Drop (Option 1)

## After Upload

Once files are deployed, verify:

1. **Check latest.yml:**
   ```
   https://souq-trablous.com/updates/latest.yml
   ```

2. **Check installer:**
   ```
   https://souq-trablous.com/updates/Souq%20POS%20Setup%200.0.6.exe
   ```

3. **Test update on client:**
   - Open an older version of the app
   - Check console logs for update detection
   - Verify download starts

## Important Notes

- **GitHub file limit:** 100 MB per file
- **Git LFS bandwidth:** 1 GB/month on free plan
- **Netlify bandwidth:** 100 GB/month on free plan
- **Each update:** ~207 MB download per client

**Calculation:** With Netlify free tier (100 GB/month), you can serve ~480 updates per month.

If you have more clients, consider external hosting with better bandwidth limits.
