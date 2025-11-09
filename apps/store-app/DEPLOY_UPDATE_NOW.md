# 🚀 Deploy Update v0.0.3 - Step by Step

## Current Status
- ✅ Version updated to `0.0.3` in `package.json`
- ❌ Update files not built yet
- ❌ Update files not uploaded to server

## Step-by-Step Instructions

### Step 1: Build the Application

```bash
cd apps/store-app

# Build the Electron app (this generates latest.yml and .nupkg files)
npm run dist
```

**What this does:**
- Builds the React app
- Builds the Electron main process
- Generates `dist/latest.yml` (update metadata)
- Generates `dist/Souq POS-0.0.3-full.nupkg` (update package)
- Generates `dist/Souq POS Setup 0.0.3.exe` (installer)

**Verify files were created:**
```bash
# Check if files exist
ls -la dist/latest.yml
ls -la dist/*.nupkg
ls -la dist/*.exe

# View latest.yml content
cat dist/latest.yml
# Should show version: 0.0.3
```

### Step 2: Copy Files to Public Folder

```bash
# Create updates folder in public (this gets copied to dist during build)
mkdir -p public/updates

# Copy update files
cp dist/latest.yml public/updates/
cp dist/*.nupkg public/updates/
cp dist/*.exe public/updates/

# Verify files are in place
ls -la public/updates/
```

### Step 3: Commit and Push

```bash
# Add files to git
git add public/updates/
git add public/_redirects  # Make sure redirect rules are included
git add netlify.toml       # Make sure netlify config is included

# Commit
git commit -m "Deploy update v0.0.3 - Add update files and fix redirects"

# Push to trigger Netlify deployment
git push
```

### Step 4: Wait for Netlify Deployment

1. Go to [Netlify Dashboard](https://app.netlify.com)
2. Check your site's deploy status
3. Wait for deployment to complete (usually 1-2 minutes)

### Step 5: Verify Deployment

**Test in browser:**
```
https://souq-trablous.com/updates/latest.yml
```

**Expected result:**
- Should show YAML content (not HTML)
- Should show `version: 0.0.3`
- Should list the `.nupkg` file

**If you still see HTML:**
- Wait a few more minutes for Netlify to propagate changes
- Clear browser cache
- Try in incognito mode

### Step 6: Test Update in Electron App

1. Open your Electron app (version 0.0.1 or 0.0.2)
2. Check console logs for `[autoUpdater]` messages
3. The app should detect the new version and download it
4. Restart the app to install the update

## Troubleshooting

### If latest.yml still returns 404:

1. **Check Netlify deploy logs:**
   - Go to Netlify Dashboard → Your site → Deploys
   - Check if files were deployed successfully

2. **Verify file paths:**
   ```bash
   # Files should be in public/updates/
   ls -la public/updates/
   
   # After build, they should be in dist/updates/
   ls -la dist/updates/
   ```

3. **Check redirect rules:**
   ```bash
   # Verify _redirects file
   cat public/_redirects
   
   # Should show:
   # /updates/*    /updates/:splat    200
   # /*    /index.html   200
   ```

### If you see HTML instead of YAML:

1. **Wait for Netlify to propagate** (can take 5-10 minutes)
2. **Clear Netlify cache:**
   - Go to Netlify Dashboard → Your site → Deploys
   - Click "Trigger deploy" → "Clear cache and deploy site"

3. **Verify redirect rules are deployed:**
   - Check that `public/_redirects` is in your git commit
   - Check that it's in the deployed site

## Quick Command Summary

```bash
# Complete workflow
cd apps/store-app
npm run dist
mkdir -p public/updates
cp dist/latest.yml public/updates/
cp dist/*.nupkg public/updates/
cp dist/*.exe public/updates/
git add public/updates/ public/_redirects netlify.toml
git commit -m "Deploy update v0.0.3"
git push
```

## After Deployment

Once deployed, clients will:
1. **Check for updates** on app startup (within 5 seconds)
2. **Download update** in background (if version > current)
3. **Show notification** when download completes
4. **Install on quit** when user closes the app

The update will be available to all clients within:
- **Immediate:** Clients that check for updates will see it
- **Within 4 hours:** All running clients will check and download
- **On next startup:** All clients will check on app launch

