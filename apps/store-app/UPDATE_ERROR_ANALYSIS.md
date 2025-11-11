# Update Error Analysis & Solution

## Error Description

**Error Message:**
```
Update Error 
Cannot download "https://souq-trablous.com/updates/Souq%20POS%20Setup%200.0.6.exe", status 404
```

**Additional Issue:**
- Opening `https://souq-trablous.com/updates/` shows "Page not found"
- The update files are not accessible on the server

---

## Root Cause Analysis

### 1. **NSIS Update Files Generated Correctly**

The electron-updater with NSIS uses the installer `.exe` file with a blockmap for differential updates:
- ✅ `Souq POS Setup 0.0.6.exe` (NSIS installer - 217 MB)
- ✅ `Souq POS Setup 0.0.6.exe.blockmap` (Block map for differential updates)
- ✅ `latest.yml` (Update metadata)

**Note:** NSIS doesn't use `.nupkg` files like Squirrel.Windows. It uses the `.exe` installer with blockmap for efficient updates.

### 2. **`latest.yml` Configuration is Correct**

The generated `latest.yml` file is actually correct for NSIS updates:

```yaml
version: 0.0.6
files:
  - url: Souq POS Setup 0.0.6.exe  # ✅ CORRECT for NSIS
    sha512: Kvo4qhVCFzgVcp37ME2mpLDcydvifaKsb/MxYI7FR/kOjYO+TcLOBD5+Ccb7sJxNB3Bidht9NYwiEJcG2P52Fw==
    size: 217961927
path: Souq POS Setup 0.0.6.exe      # ✅ CORRECT for NSIS
releaseDate: '2025-11-11T10:23:54.295Z'
```

**This is correct!** NSIS updates use the `.exe` installer file, not `.nupkg` files.

### 3. **Files Not Uploaded to Server** ⚠️ PRIMARY ISSUE

The update files are not present at `https://souq-trablous.com/updates/`:
- ❌ `latest.yml` - Not accessible (404)
- ❌ `Souq POS Setup 0.0.6.exe` - Not uploaded
- ❌ `Souq POS Setup 0.0.6.exe.blockmap` - Not uploaded
- ❌ Update directory doesn't exist on the server

**This is the main problem!** The files are built correctly but never uploaded to the server.

---

## How electron-updater Works with NSIS

1. **Check for updates:** App requests `https://souq-trablous.com/updates/latest.yml`
2. **Compare versions:** If server version > installed version → update available
3. **Download update installer:** Downloads the `.exe` file specified in `latest.yml`
4. **Differential download:** Uses `.blockmap` file to download only changed blocks (saves bandwidth)
5. **Verify integrity:** Checks SHA512 checksum
6. **Install on quit:** Applies update when user closes the app

**Key Point:** NSIS updates use the `.exe` installer with `.blockmap` for efficient differential updates!

---

## Solution

### Step 1: Fix Build Configuration ✅ DONE

Updated `package.json` to properly configure NSIS for differential updates:

```json
"win": {
  "target": [
    {
      "target": "nsis",
      "arch": ["x64"]
    }
  ],
  "icon": "assets/app-icon.ico"
},
"nsis": {
  "oneClick": false,
  "allowToChangeInstallationDirectory": true,
  "createDesktopShortcut": true,
  "createStartMenuShortcut": true,
  "differentialPackage": true  // ← This generates .nupkg files
}
```

### Step 2: Rebuild the Application

Run the build command to generate proper update files:

```bash
npm run dist
```

**Expected output in `dist/` folder:**
- ✅ `latest.yml` - Update metadata (345 bytes)
- ✅ `Souq POS Setup 0.0.6.exe` - NSIS installer (217 MB)
- ✅ `Souq POS Setup 0.0.6.exe.blockmap` - Block map for differential updates (227 KB)

### Step 3: Upload Files to Server

Upload these files to `https://souq-trablous.com/updates/`:

**Required files:**
1. ✅ `latest.yml` - **CRITICAL** (electron-updater checks this first)
2. ✅ `Souq POS Setup 0.0.6.exe` - The update installer (217 MB)
3. ✅ `Souq POS Setup 0.0.6.exe.blockmap` - For differential updates (227 KB)

**Note:** All three files are required. The blockmap enables efficient differential downloads.

**Upload Methods:**

#### Option A: Using Netlify CLI (Recommended)

```bash
# 1. Install Netlify CLI
npm install -g netlify-cli

# 2. Login
netlify login

# 3. Navigate to dist folder
cd apps/store-app/dist

# 4. Create updates folder structure
mkdir -p updates
cp latest.yml updates/
cp "Souq POS Setup 0.0.6.exe" updates/
cp "Souq POS Setup 0.0.6.exe.blockmap" updates/

# 5. Deploy to Netlify
netlify deploy --prod --dir=updates
```

#### Option B: Git-Based Deployment

```bash
# 1. Create updates folder in repository
mkdir -p apps/store-app/public/updates

# 2. Copy update files
cp apps/store-app/dist/latest.yml apps/store-app/public/updates/
cp "apps/store-app/dist/Souq POS Setup 0.0.6.exe" apps/store-app/public/updates/
cp "apps/store-app/dist/Souq POS Setup 0.0.6.exe.blockmap" apps/store-app/public/updates/

# 3. Commit and push
git add apps/store-app/public/updates/
git commit -m "Add update files for version 0.0.6"
git push
```

Netlify will automatically deploy to `https://souq-trablous.com/updates/`

#### Option C: Manual Upload via Netlify Dashboard

1. Go to [app.netlify.com](https://app.netlify.com)
2. Select your site
3. Go to "Deploys" → "Deploy manually"
4. Upload the `updates` folder

### Step 4: Verify Upload

After uploading, test these URLs in your browser:

1. **Check latest.yml:**
   ```
   https://souq-trablous.com/updates/latest.yml
   ```
   Should display the YAML content

2. **Check .exe installer:**
   ```
   https://souq-trablous.com/updates/Souq%20POS%20Setup%200.0.6.exe
   ```
   Should download or show file info (not 404)

3. **Check blockmap:**
   ```
   https://souq-trablous.com/updates/Souq%20POS%20Setup%200.0.6.exe.blockmap
   ```
   Should be accessible

---

## Verification Checklist

Before considering the issue resolved:

- [ ] Rebuild completed successfully (`npm run dist`)
- [ ] `Souq POS Setup 0.0.6.exe` file exists in `dist/` folder (217 MB)
- [ ] `Souq POS Setup 0.0.6.exe.blockmap` file exists in `dist/` folder
- [ ] `latest.yml` references the `.exe` file correctly
- [ ] Files uploaded to `https://souq-trablous.com/updates/`
- [ ] `latest.yml` is accessible at the URL (no 404)
- [ ] `.exe` installer is accessible at the URL (no 404)
- [ ] `.blockmap` file is accessible at the URL (no 404)
- [ ] Test update on a client machine with older version

---

## Testing the Update

### Test Scenario 1: Local Testing

```bash
# 1. Start local server
cd apps/store-app/dist
python -m http.server 8000

# 2. Temporarily change publish URL in package.json
"publish": [{
  "provider": "generic",
  "url": "http://localhost:8000/"
}]

# 3. Rebuild and test
npm run dist
```

### Test Scenario 2: Production Testing

1. Install version 0.0.5 on a test machine
2. Upload version 0.0.6 files to server
3. Run the 0.0.5 app
4. Check console logs for update detection
5. Verify download and installation

---

## Important Notes

### About NSIS Updates with Blockmap

- **Purpose:** Efficient differential updates (only download changed blocks)
- **Size:** Full installer (217 MB) but blockmap enables partial downloads
- **Format:** Standard Windows NSIS installer with blockmap file
- **Required:** Both `.exe` and `.blockmap` files are needed for updates

### About `latest.yml`

- **Critical:** Without this file, no updates will be detected
- **Content:** Contains version, file URLs, checksums, and metadata
- **Must be accessible:** Should return 200 status code, not 404
- **Auto-generated:** Created by electron-builder during build

### About Update Process

- **Non-intrusive:** Downloads in background
- **Silent:** No user interruption during download
- **Install on quit:** Only applies when user closes the app
- **Automatic:** Checks every 4 hours (configured in `main.ts`)

---

## Troubleshooting

### Issue: `.blockmap` file not generated

**Solution:**
- Ensure NSIS target is configured correctly in `package.json`
- Remove `dist/` folder and rebuild: `rm -rf dist && npm run dist`
- Check electron-builder version: `npm list electron-builder`
- Verify `differentialPackage: true` in NSIS config

### Issue: 404 on update files

**Solution:**
- Verify files are uploaded to correct path
- Check Netlify deployment logs
- Ensure `public/updates/` folder exists in repository
- Test URL directly in browser

### Issue: Update detected but download fails

**Solution:**
- Check file permissions on server
- Verify CORS headers (Netlify handles this automatically)
- Check file size limits
- Verify checksum in `latest.yml` matches actual file

### Issue: Update downloads but doesn't install

**Solution:**
- Check app version in `package.json` is higher than installed version
- Verify app is properly signed (for production)
- Check Windows SmartScreen settings
- Review electron-updater logs in app console

---

## Next Steps

1. ✅ Rebuild completed successfully
2. ✅ Verified `.exe` and `.blockmap` files are generated
3. ⏳ **NEXT:** Upload files to `https://souq-trablous.com/updates/`
4. ⏳ Test update on client machine
5. ⏳ Monitor update logs for any issues

---

## References

- [electron-updater Documentation](https://www.electron.build/auto-update)
- [electron-builder NSIS Configuration](https://www.electron.build/configuration/nsis)
- [Generic Update Server Setup](https://www.electron.build/configuration/publish#generic-provider)
