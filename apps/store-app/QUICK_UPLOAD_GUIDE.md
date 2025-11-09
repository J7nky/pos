# 🚀 Quick Guide: Upload Update Files to Netlify

## Fastest Method: Netlify CLI

```bash
# 1. Install Netlify CLI (one-time setup)
npm install -g netlify-cli

# 2. Login to Netlify (one-time setup)
netlify login

# 3. Navigate to your app directory
cd apps/store-app

# 4. Link to your site (one-time setup)
netlify link
# Select "souq-trablous.com" from the list

# 5. Build the app (if not already built)
npm run dist

# 6. Create updates folder and copy files
cd dist
mkdir -p updates
cp latest.yml updates/
cp "Souq POS-"*.nupkg updates/
cp "Souq POS Setup"*.exe updates/

# 7. Deploy to production
cd updates
netlify deploy --prod --dir=.
```

## Alternative: Git-Based (Automated) - RECOMMENDED

This method ensures files are in the right place and will be deployed automatically:

```bash
# 1. Build the app first
cd apps/store-app
npm run dist

# 2. Create public/updates folder (this gets copied to dist during build)
mkdir -p public/updates

# 3. Copy update files to public/updates (will be in dist/updates after build)
cp dist/latest.yml public/updates/
cp dist/*.nupkg public/updates/
cp dist/*.exe public/updates/

# 4. Commit and push
git add public/updates/ public/_redirects netlify.toml
git commit -m "Add update files v0.0.2 and fix redirects"
git push

# Netlify will auto-deploy!
# Files will be at: https://souq-trablous.com/updates/latest.yml
```

**Important:** The `public/` folder contents are copied to `dist/` during build, so files in `public/updates/` will be in `dist/updates/` after build.

## Verify Upload

After uploading, test these URLs in your browser:

1. ✅ `https://souq-trablous.com/updates/latest.yml` - Should show YAML content
2. ✅ `https://souq-trablous.com/updates/Souq POS-0.0.2-full.nupkg` - Should download file

**⚠️ Important:** If the URLs don't work, check these:

1. **Files must exist in `dist/updates/` folder** - If files don't exist, Netlify will redirect to index.html
2. **Redirect rules must be updated** - The `_redirects` file in `public/` must exclude `/updates/*` BEFORE the catch-all
3. **Redeploy after changes** - Commit and push changes, or redeploy via Netlify dashboard

**The Error Explained:**

The error "Expected a JavaScript-or-Wasm module script but the server responded with a MIME type of 'text/html'" means:
- The browser requested `/updates/latest.yml`
- Netlify redirected it to `/index.html` (the SPA catch-all)
- The browser received HTML instead of YAML
- The browser tried to parse HTML as YAML/JavaScript, causing the error

**Solution Steps:**

1. **Ensure files are in the right place:**
   ```bash
   # Files should be in: apps/store-app/public/updates/
   # They will be copied to: apps/store-app/dist/updates/ during build
   ```

2. **Verify redirect rules are correct:**
   - `public/_redirects` must have `/updates/*` rule BEFORE `/*`
   - `netlify.toml` must have the same rule

3. **Redeploy:**
   ```bash
   git add public/updates/ public/_redirects netlify.toml
   git commit -m "Fix: Exclude /updates/* from SPA redirects"
   git push
   ```

4. **Verify after deployment:**
   - Check `https://souq-trablous.com/updates/latest.yml` in browser
   - Should see YAML content, NOT HTML

## Complete Workflow (All Steps)

```bash
# Step 1: Update version in package.json
# Edit: "version": "0.0.2"

# Step 2: Build
cd apps/store-app
npm run dist

# Step 3: Upload (choose one method above)

# Step 4: Verify
# Open https://souq-trablous.com/updates/latest.yml in browser

# Done! Clients will auto-update within 4 hours or on next app start
```

## Troubleshooting

**Files not accessible?**
- Check Netlify deploy logs
- Verify file paths match exactly
- Ensure files are in `public/updates/` or deployed to `/updates/`

**Update not detected?**
- Verify version in `latest.yml` is higher than installed version
- Check `latest.yml` is accessible at the URL
- Check console logs in Electron app for update errors

