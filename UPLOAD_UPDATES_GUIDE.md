# Quick Guide: Upload Update Files

## Problem
The Netlify CLI is trying to run the build command from `netlify.toml`, which fails on Windows because it uses bash syntax.

## Solution: Use Git-Based Deployment

Since your site is already connected to GitHub and Netlify auto-deploys, the easiest way is to commit the files to git.

### Step 1: Copy Files to Public Folder

```powershell
# Run these commands from the repository root (pos-3 folder)

# Create public/updates folder
New-Item -ItemType Directory -Path "apps\store-app\public\updates" -Force

# Copy update files
Copy-Item -Path "apps\store-app\dist\latest.yml" -Destination "apps\store-app\public\updates\" -Force
Copy-Item -Path "apps\store-app\dist\Souq POS Setup 0.0.6.exe" -Destination "apps\store-app\public\updates\" -Force
Copy-Item -Path "apps\store-app\dist\Souq POS Setup 0.0.6.exe.blockmap" -Destination "apps\store-app\public\updates\" -Force
```

### Step 2: Verify Files Were Copied

```powershell
Get-ChildItem -Path "apps\store-app\public\updates"
```

You should see:
- `latest.yml` (345 bytes)
- `Souq POS Setup 0.0.6.exe` (217 MB)
- `Souq POS Setup 0.0.6.exe.blockmap` (227 KB)

### Step 3: Commit and Push to Git

```powershell
git add apps/store-app/public/updates/
git commit -m "Add update files for version 0.0.6"
git push
```

### Step 4: Wait for Netlify to Deploy

- Go to https://app.netlify.com
- Select your site (souq-trablous-pos)
- Watch the "Deploys" tab
- Wait for the deployment to finish (usually 2-5 minutes)

### Step 5: Verify Files Are Accessible

Open these URLs in your browser:

1. **Check latest.yml:**
   ```
   https://souq-trablous.com/updates/latest.yml
   ```
   Should show YAML content

2. **Check installer:**
   ```
   https://souq-trablous.com/updates/Souq%20POS%20Setup%200.0.6.exe
   ```
   Should download or show file info

3. **Check blockmap:**
   ```
   https://souq-trablous.com/updates/Souq%20POS%20Setup%200.0.6.exe.blockmap
   ```
   Should be accessible

## Alternative: Manual Upload via Netlify Dashboard

If git push doesn't work, you can manually upload:

1. Create a folder on your desktop called `updates`
2. Copy the three files into it
3. Go to https://app.netlify.com
4. Select your site
5. Go to "Deploys" tab
6. Drag and drop the `updates` folder

---

## Why Netlify CLI Failed

The `netlify deploy` command tries to run the build command from `netlify.toml`, which contains bash syntax:

```bash
SITE_NAME="${NETLIFY_SITE_NAME:-${NETLIFY_SITE_ID:-unknown}}"
```

This doesn't work on Windows PowerShell. The git-based approach bypasses this issue because:
- Files are already built locally
- Netlify just needs to serve them as static files
- No build command needs to run for static files in `public/` folder
