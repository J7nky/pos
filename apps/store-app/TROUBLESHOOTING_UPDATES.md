# Troubleshooting Update Errors

## Error: "This file could not be downloaded, or the latest version (from update server) does not have a valid semver version: 'undefined'"

### What This Error Means

This error indicates that `electron-updater` cannot find or parse the version from `latest.yml` on the update server. The version field is either:
- Missing from `latest.yml`
- Invalid format (not semver)
- The file is not accessible (redirected to HTML)

### Common Causes

1. **`latest.yml` is being served as HTML** (SPA redirect issue)
   - The file exists but Netlify redirects it to `index.html`
   - Solution: Fix redirect rules (see below)

2. **`latest.yml` is missing or not uploaded**
   - The file wasn't uploaded to the server
   - Solution: Upload the file to `public/updates/` and redeploy

3. **Invalid version format in `package.json`**
   - Version must be valid semver (e.g., `0.0.1`, `1.0.0`, `2.1.3`)
   - Solution: Ensure version is in `MAJOR.MINOR.PATCH` format

4. **`latest.yml` has wrong structure**
   - The file is corrupted or malformed
   - Solution: Rebuild and regenerate `latest.yml`

### Solutions

#### Step 1: Verify `latest.yml` is Accessible

Open in browser: `https://souq-trablous.com/updates/latest.yml`

**Expected:** You should see YAML content like:
```yaml
version: 0.0.1
files:
  - url: Souq POS-0.0.1-full.nupkg
    sha512: ...
    size: ...
path: Souq POS-0.0.1-full.nupkg
sha512: ...
releaseDate: '2024-01-01T00:00:00.000Z'
```

**If you see HTML instead:**
- The redirect rules are catching `/updates/*`
- Fix: Ensure `public/_redirects` excludes `/updates/*` BEFORE the catch-all

#### Step 2: Verify Version in `package.json`

Check `apps/store-app/package.json`:
```json
{
  "version": "0.0.1"  // Must be valid semver
}
```

**Valid formats:**
- ✅ `0.0.1`
- ✅ `1.0.0`
- ✅ `2.1.3`
- ❌ `0.0.1-beta` (unless `allowPrerelease: true`)
- ❌ `v0.0.1` (no "v" prefix)
- ❌ `0.0` (must have 3 parts)

#### Step 3: Rebuild and Regenerate `latest.yml`

```bash
cd apps/store-app

# 1. Ensure version is correct in package.json
# Edit: "version": "0.0.2"

# 2. Clean previous build
rm -rf dist

# 3. Rebuild
npm run dist

# 4. Verify latest.yml was generated
cat dist/latest.yml
# Should show version and file info
```

#### Step 4: Upload Files Correctly

```bash
# After building, copy files to public/updates
mkdir -p public/updates
cp dist/latest.yml public/updates/
cp dist/*.nupkg public/updates/
cp dist/*.exe public/updates/

# Commit and push
git add public/updates/
git commit -m "Add update files v0.0.2"
git push
```

#### Step 5: Verify After Deployment

1. **Check file accessibility:**
   ```
   https://souq-trablous.com/updates/latest.yml
   ```
   Should show YAML, NOT HTML

2. **Check version in file:**
   - Open the YAML file
   - Verify `version:` field exists and is valid semver

3. **Check file URLs:**
   - The `files[0].url` should match the actual `.nupkg` filename
   - The file should be accessible at the URL specified

### Debugging Steps

1. **Check Electron app logs:**
   - Look for `[autoUpdater]` messages in console
   - Check for specific error messages

2. **Test update server manually:**
   ```bash
   # Test if latest.yml is accessible
   curl https://souq-trablous.com/updates/latest.yml
   
   # Should return YAML content, not HTML
   ```

3. **Verify file structure:**
   ```bash
   # Check what files are in dist/
   ls -la apps/store-app/dist/
   
   # Should see:
   # - latest.yml
   # - Souq POS-*.nupkg
   # - Souq POS Setup *.exe
   ```

### Prevention

1. **Always increment version** before building
2. **Always verify `latest.yml`** after build
3. **Always test URL** after deployment
4. **Use semantic versioning** (MAJOR.MINOR.PATCH)

### Quick Checklist

- [ ] Version in `package.json` is valid semver (e.g., `0.0.1`)
- [ ] `npm run dist` completed successfully
- [ ] `dist/latest.yml` exists and has `version:` field
- [ ] Files uploaded to `public/updates/`
- [ ] `public/_redirects` excludes `/updates/*` BEFORE `/*`
- [ ] `https://souq-trablous.com/updates/latest.yml` shows YAML (not HTML)
- [ ] Version in `latest.yml` matches `package.json` version
- [ ] `.nupkg` file exists and matches filename in `latest.yml`

