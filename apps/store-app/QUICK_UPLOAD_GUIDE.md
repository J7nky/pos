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

## Alternative: Git-Based (Automated)

```bash
# 1. Create public/updates folder
mkdir -p apps/store-app/public/updates

# 2. After building, copy files
cp apps/store-app/dist/latest.yml apps/store-app/public/updates/
cp apps/store-app/dist/*.nupkg apps/store-app/public/updates/
cp apps/store-app/dist/*.exe apps/store-app/public/updates/

# 3. Commit and push
git add apps/store-app/public/updates/
git commit -m "Add update files v0.0.2"
git push

# Netlify will auto-deploy!
```

## Verify Upload

After uploading, test these URLs in your browser:

1. ✅ `https://souq-trablous.com/updates/latest.yml` - Should show YAML content
2. ✅ `https://souq-trablous.com/updates/Souq POS-0.0.2-full.nupkg` - Should download file

**⚠️ Important:** If the URLs don't work, you need to:
1. **Update `netlify.toml`** - Make sure `/updates/*` is excluded from SPA redirects (see below)
2. **Redeploy the site** - Commit and push the `netlify.toml` changes, or redeploy via Netlify dashboard
3. **Check file paths** - Ensure files are in `dist/updates/` folder

**Fix for URLs not working:**

The issue is that Netlify's SPA redirect rule (`/*` → `/index.html`) catches all routes including `/updates/*`. 

**Solution:** Update `apps/store-app/netlify.toml` to exclude `/updates/*` from SPA redirects:

```toml
# Exclude updates folder from SPA redirect (MUST come before catch-all)
[[redirects]]
  from = "/updates/*"
  to = "/updates/:splat"
  status = 200
  force = true

# Catch-all SPA redirect (must come after specific routes)
[[redirects]]
  from = "/*"
  to = "/index.html"
  status = 200
```

Then commit and push, or redeploy via Netlify dashboard.

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

