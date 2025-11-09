# Update Deployment Guide

## Complete Workflow: From Version Update to Client Download

### Step 1: Update Version in package.json

Update the version number in `apps/store-app/package.json`:

```json
{
  "version": "0.0.2"  // Increment from 0.0.1 → 0.0.2
}
```

**Important:** Use semantic versioning (MAJOR.MINOR.PATCH):
- `0.0.1` → `0.0.2` (patch: bug fixes)
- `0.0.1` → `0.1.0` (minor: new features)
- `0.0.1` → `1.0.0` (major: breaking changes)

### Step 2: Build the Application

Build the Electron app with electron-builder. This generates the update files:

```bash
# From apps/store-app directory
cd apps/store-app
npm run dist
# or
pnpm run dist
```

**What this generates:**

After building, you'll find these files in `apps/store-app/dist/`:

```
dist/
  ├── latest.yml                    # ⚠️ CRITICAL: Update metadata file
  ├── Souq POS Setup 0.0.2.exe      # NSIS installer
  ├── Souq POS-0.0.2-full.nupkg     # Update package (for electron-updater)
  └── win-unpacked/                 # Unpacked app (for testing)
```

**The `latest.yml` file is essential** - it tells electron-updater:
- What version is available
- Where to download the update files
- File checksums for verification

### Step 3: Upload Files to Update Server

Upload the following files to `https://souq-trablous.com/updates/`:

**Required files:**
1. ✅ `latest.yml` - **MUST be uploaded** (electron-updater checks this first)
2. ✅ `Souq POS-0.0.2-full.nupkg` - The update package
3. ✅ `Souq POS Setup 0.0.2.exe` - Optional (for fresh installs)

**File structure on server:**
```
https://souq-trablous.com/updates/
  ├── latest.yml
  ├── Souq POS-0.0.2-full.nupkg
  └── Souq POS Setup 0.0.2.exe
```

**Important Notes:**
- The `latest.yml` file contains URLs pointing to the update files
- Make sure the file names match exactly what's in `latest.yml`
- Ensure the server allows downloading `.yml` and `.nupkg` files
- The server must support CORS if needed

---

## 📤 How to Upload Files to Server

Since your site is deployed on **Netlify** at `souq-trablous.com`, here are the methods to upload update files:

### Method 1: Netlify Dashboard (Easiest - Recommended)

1. **Go to Netlify Dashboard**
   - Visit [app.netlify.com](https://app.netlify.com)
   - Login to your account
   - Select your site (`souq-trablous.com`)

2. **Access Deploys**
   - Click on **"Deploys"** in the top menu
   - Or go to **"Site overview"** → **"Deploys"**

3. **Use Netlify Drop**
   - Go to **"Deploys"** tab
   - Scroll down to find **"Deploy manually"** section
   - Click **"Browse to upload"** or drag and drop files
   - **Note:** This method uploads to the root, not ideal for updates folder

4. **Better: Use Netlify CLI** (See Method 2 below)

### Method 2: Netlify CLI (Recommended for Updates)

This is the best method for uploading update files to a specific folder:

```bash
# 1. Install Netlify CLI (if not already installed)
npm install -g netlify-cli

# 2. Login to Netlify
netlify login

# 3. Link to your site (if not already linked)
cd apps/store-app
netlify link
# Select your site from the list

# 4. Navigate to dist folder where update files are
cd dist

# 5. Deploy files to /updates/ directory
# This will upload files to the updates folder on your site
netlify deploy --prod --dir=. --functions=.

# OR upload specific files to updates folder:
# Create updates folder locally first
mkdir -p updates
cp latest.yml updates/
cp "Souq POS-"*.nupkg updates/
cp "Souq POS Setup"*.exe updates/

# Then deploy
netlify deploy --prod --dir=updates
```

**Alternative: Deploy entire dist folder structure**

```bash
# From apps/store-app directory
cd apps/store-app

# Build first (if not already built)
npm run dist

# Deploy the dist folder
netlify deploy --prod --dir=dist
```

### Method 3: Git-Based Deployment (Automated)

If you want updates to be deployed automatically via Git:

1. **Create updates folder in your repository:**
   ```bash
   mkdir -p apps/store-app/public/updates
   ```

2. **Copy update files to public folder:**
   ```bash
   # After building
   cp apps/store-app/dist/latest.yml apps/store-app/public/updates/
   cp apps/store-app/dist/*.nupkg apps/store-app/public/updates/
   cp apps/store-app/dist/*.exe apps/store-app/public/updates/
   ```

3. **Commit and push:**
   ```bash
   git add apps/store-app/public/updates/
   git commit -m "Add update files for version X.X.X"
   git push
   ```

4. **Netlify will automatically deploy** the files to `https://souq-trablous.com/updates/`

### Method 4: Manual FTP/SFTP (If you have server access)

If you have direct server access (not Netlify):

```bash
# Using SCP (SSH)
scp apps/store-app/dist/latest.yml user@souq-trablous.com:/var/www/html/updates/
scp apps/store-app/dist/*.nupkg user@souq-trablous.com:/var/www/html/updates/
scp apps/store-app/dist/*.exe user@souq-trablous.com:/var/www/html/updates/

# Using FTP client (FileZilla, WinSCP, etc.)
# Connect to: souq-trablous.com
# Navigate to: /public_html/updates/ or /var/www/html/updates/
# Upload the files
```

### Method 5: Netlify File Manager (If Available)

Some Netlify plans include a file manager:

1. Go to **Site Settings** → **File Manager** (if available)
2. Navigate to or create `updates/` folder
3. Upload files directly through the web interface

---

## ✅ Verification After Upload

After uploading, verify the files are accessible:

1. **Check latest.yml:**
   ```
   https://souq-trablous.com/updates/latest.yml
   ```
   Should show the YAML file with version info

2. **Check .nupkg file:**
   ```
   https://souq-trablous.com/updates/Souq POS-0.0.2-full.nupkg
   ```
   Should download the file (or show file info)

3. **Test in browser:**
   - Open `https://souq-trablous.com/updates/latest.yml` in browser
   - Should see the YAML content, not an error

4. **Check file permissions:**
   - Files should be publicly accessible (no authentication required)
   - CORS should be enabled (Netlify does this automatically)

---

## 🔧 Netlify Configuration for Updates

If you need to configure Netlify specifically for update files, add a `netlify.toml` or update existing one:

```toml
[[headers]]
  for = "/updates/*"
  [headers.values]
    Content-Type = "application/octet-stream"
    Access-Control-Allow-Origin = "*"
    Cache-Control = "public, max-age=3600"
```

This ensures:
- ✅ `.nupkg` files are served with correct content type
- ✅ CORS is enabled for cross-origin requests
- ✅ Files are cached appropriately

### Step 4: Automatic Client Download

Once files are uploaded, clients will automatically:

1. **Check for updates** (on app startup and every 4 hours)
2. **Download in background** (when `latest.yml` shows a newer version)
3. **Show notification** (when download completes)
4. **Install on quit** (when user closes the app)

**Timeline:**
- **Immediate:** Clients that check for updates will see the new version
- **Within 4 hours:** All running clients will check and download
- **On next startup:** All clients will check on app launch

## How electron-updater Works

1. **Client checks:** `https://souq-trablous.com/updates/latest.yml`
2. **Compares versions:** If server version > client version → update available
3. **Downloads:** Downloads the `.nupkg` file specified in `latest.yml`
4. **Verifies:** Checks file integrity using checksums in `latest.yml`
5. **Installs:** Installs update when app quits

## Verification Checklist

Before deploying, verify:

- [ ] Version in `package.json` is incremented
- [ ] `npm run dist` completed successfully
- [ ] `latest.yml` file exists in `dist/` folder
- [ ] `latest.yml` contains correct version number
- [ ] `.nupkg` file exists and matches version
- [ ] Files uploaded to `https://souq-trablous.com/updates/`
- [ ] `latest.yml` is accessible at `https://souq-trablous.com/updates/latest.yml`
- [ ] `.nupkg` file is accessible (check URL in `latest.yml`)

## Testing Updates Locally

### Option 1: Local HTTP Server

```bash
# Build the app
npm run dist

# Start local server in dist folder
cd dist
python -m http.server 8000
# or
npx http-server -p 8000
```

Temporarily change `package.json` publish URL:
```json
"publish": [{
  "provider": "generic",
  "url": "http://localhost:8000/"
}]
```

### Option 2: Test with Production Server

1. Build version 0.0.1 and install on test machine
2. Update to version 0.0.2 in `package.json`
3. Build and upload to server
4. Run the 0.0.1 app - it should detect and download 0.0.2

## Troubleshooting

### Update Not Detected

**Check:**
1. Is `latest.yml` accessible? Visit `https://souq-trablous.com/updates/latest.yml` in browser
2. Does `latest.yml` contain the correct version?
3. Is the version in `latest.yml` higher than the installed version?
4. Check console logs for update errors

### Download Fails

**Check:**
1. Is the `.nupkg` file accessible? (Check URL in `latest.yml`)
2. Are file names correct? (Must match exactly)
3. Server CORS settings (if applicable)
4. File permissions on server

### Update Installs But Version Doesn't Change

**Check:**
1. Version in `package.json` was actually updated before build
2. App was properly rebuilt after version change
3. Old version files weren't accidentally uploaded

## Quick Reference

```bash
# 1. Update version
# Edit package.json: "version": "0.0.2"

# 2. Build
npm run dist

# 3. Upload to server
# Upload dist/latest.yml and dist/*.nupkg to https://souq-trablous.com/updates/

# 4. Done! Clients will auto-update
```

## Important Notes

- ⚠️ **Always build after version change** - The version in the built app comes from `package.json` at build time
- ⚠️ **Upload `latest.yml`** - Without it, electron-updater won't know an update exists
- ⚠️ **Version must increase** - electron-updater only updates to higher versions
- ⚠️ **File names matter** - The `.nupkg` filename must match what's in `latest.yml`

