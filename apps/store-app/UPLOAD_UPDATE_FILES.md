# How to Upload Update Files to Server

## Problem
The `latest.yml` file exists locally but isn't accessible on the server, causing a 404 error when the app tries to check for updates.

## Solution: Upload Files to Server

### Files That Need to Be Uploaded

From `apps/store-app/dist/` directory, you need to upload:

1. ✅ **`latest.yml`** - Update metadata (REQUIRED)
2. ✅ **`Souq POS Setup 0.0.3.exe`** - The installer file referenced in latest.yml

### Current Files (Version 0.0.3)

Based on your `latest.yml`, you need:
- `latest.yml` (already exists locally)
- `Souq POS Setup 0.0.3.exe` (already exists locally)

## Upload Methods

### Method 1: Netlify File Upload (If using Netlify)

1. **Go to Netlify Dashboard**
   - Navigate to your site: `souq-trablous.com`
   - Go to **Deploys** tab

2. **Create `/updates/` folder in your site**
   - You can do this by:
     - **Option A**: Add files to your repo in `public/updates/` folder
     - **Option B**: Use Netlify's file upload feature (if available)
     - **Option C**: Use Netlify CLI to upload files

3. **Upload files using Netlify CLI:**
   ```bash
   # Install Netlify CLI if not installed
   npm install -g netlify-cli
   
   # Login to Netlify
   netlify login
   
   # Navigate to your site directory
   cd apps/store-app
   
   # Upload files to /updates/ directory
   netlify deploy --prod --dir=dist --prod-dir=dist
   
   # Or manually upload specific files:
   # Create updates folder in dist
   mkdir -p dist/updates
   cp dist/latest.yml dist/updates/
   cp "dist/Souq POS Setup 0.0.3.exe" dist/updates/
   
   # Then deploy
   netlify deploy --prod --dir=dist
   ```

### Method 2: Add to Git Repository (Recommended for Netlify)

1. **Create updates folder in public directory:**
   ```bash
   cd apps/store-app
   mkdir -p public/updates
   ```

2. **Copy files to public/updates:**
   ```bash
   cp dist/latest.yml public/updates/
   cp "dist/Souq POS Setup 0.0.3.exe" public/updates/
   ```

3. **Commit and push:**
   ```bash
   git add public/updates/
   git commit -m "Add update files for version 0.0.3"
   git push
   ```

4. **Netlify will automatically deploy** the files to `https://souq-trablous.com/updates/`

### Method 3: FTP/SSH Upload (If using traditional hosting)

1. **Connect to your server** via FTP or SSH

2. **Navigate to your website root** (where your site files are)

3. **Create `/updates/` directory** if it doesn't exist:
   ```bash
   mkdir -p /var/www/html/updates
   # or wherever your site root is
   ```

4. **Upload files:**
   ```bash
   # Using SCP
   scp apps/store-app/dist/latest.yml user@souq-trablous.com:/var/www/html/updates/
   scp "apps/store-app/dist/Souq POS Setup 0.0.3.exe" user@souq-trablous.com:/var/www/html/updates/
   
   # Or using FTP client
   # Upload both files to /updates/ directory
   ```

### Method 4: Manual Upload via Hosting Panel

1. **Log into your hosting control panel** (cPanel, Plesk, etc.)

2. **Navigate to File Manager**

3. **Go to your website root** (usually `public_html` or `www`)

4. **Create `/updates/` folder** if it doesn't exist

5. **Upload files:**
   - Upload `latest.yml`
   - Upload `Souq POS Setup 0.0.3.exe`

## Verify Upload

After uploading, verify the files are accessible:

1. **Check latest.yml:**
   ```
   https://souq-trablous.com/updates/latest.yml
   ```
   Should show the YAML content, not a 404 error.

2. **Check installer file:**
   ```
   https://souq-trablous.com/updates/Souq%20POS%20Setup%200.0.3.exe
   ```
   Should download the file or show file info.

## Important Notes

### File Names Must Match Exactly

The `latest.yml` file references:
```yaml
path: Souq POS Setup 0.0.3.exe
```

So the file on the server must be named exactly:
- `Souq POS Setup 0.0.3.exe` (with spaces, not underscores)

### URL Encoding

If the file has spaces, the URL will be:
- `https://souq-trablous.com/updates/Souq%20POS%20Setup%200.0.3.exe`

### File Permissions

Make sure files are publicly readable:
- `latest.yml` should be readable by everyone
- `.exe` file should be downloadable

## Quick Test

After uploading, test in your browser:

1. Open: `https://souq-trablous.com/updates/latest.yml`
   - Should see YAML content with version info

2. Open: `https://souq-trablous.com/updates/Souq%20POS%20Setup%200.0.3.exe`
   - Should download the file

If both work, your app will be able to check for updates!

## Next Steps

Once files are uploaded:

1. ✅ App will check for updates on startup
2. ✅ If version on server > app version → update downloads
3. ✅ Update installs when app quits
4. ✅ App restarts with new version

## Troubleshooting

### Still getting 404?

1. **Check file path:** Make sure files are in `/updates/` directory
2. **Check file names:** Must match exactly what's in `latest.yml`
3. **Check server configuration:** Make sure server allows `.yml` and `.exe` files
4. **Check Netlify redirects:** Your `netlify.toml` should allow `/updates/*` (already configured ✅)

### Files uploaded but not accessible?

1. **Check file permissions:** Files should be readable (644 or 755)
2. **Check server logs:** Look for any errors in server logs
3. **Test with curl:**
   ```bash
   curl https://souq-trablous.com/updates/latest.yml
   ```

