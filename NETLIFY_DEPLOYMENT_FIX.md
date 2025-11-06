# Netlify Deployment Fix - Final Solution

## Problem

Deployment is failing because the build command isn't working correctly in Netlify's environment.

## Root Cause

1. When using `base = "."` in netlify.toml, Netlify changes to that directory first
2. The relative paths `../../` might not work as expected
3. pnpm workspace filters are more reliable than changing directories

## Solution Applied

Updated `apps/store-app/netlify.toml` to use pnpm workspace filters instead of changing directories:

```toml
command = "npm install -g pnpm && cd ../.. && pnpm install && pnpm --filter @pos-platform/shared build && pnpm --filter store-app build:netlify"
```

This approach:
1. ✅ Installs pnpm globally
2. ✅ Changes to root directory (where pnpm-workspace.yaml is)
3. ✅ Installs all dependencies (workspace-aware)
4. ✅ Builds shared package using workspace filter
5. ✅ Builds store app using workspace filter

## Alternative: Configure in Netlify Dashboard

If the netlify.toml approach doesn't work, configure directly in Netlify Dashboard:

### Settings:

1. **Base directory:** `apps/store-app` (or leave empty)
2. **Build command:**
   ```bash
   npm install -g pnpm && cd ../.. && pnpm install && pnpm --filter @pos-platform/shared build && pnpm --filter store-app build:netlify
   ```
3. **Publish directory:** `dist` (if base is `apps/store-app`) or `apps/store-app/dist` (if base is root)

## If pnpm Still Doesn't Work

### Option 1: Use Corepack (Node.js 16.10+)

```bash
corepack enable && corepack prepare pnpm@latest --activate && pnpm install && pnpm --filter @pos-platform/shared build && pnpm --filter store-app build:netlify
```

### Option 2: Use npm with manual steps

```bash
cd ../.. && npm install && cd packages/shared && npm run build && cd ../../apps/store-app && npm install && npm run build:netlify
```

## Verify Netlify Settings

Make sure in Netlify Dashboard:

- ✅ **Base directory:** `apps/store-app` (or empty for root)
- ✅ **Build command:** (see above)
- ✅ **Publish directory:** `dist` (relative to base) or `apps/store-app/dist` (from root)
- ✅ **Node version:** 20 (set in environment variables or netlify.toml)

## Next Steps

1. **Commit and push the updated netlify.toml:**
   ```bash
   git add apps/store-app/netlify.toml
   git commit -m "Fix Netlify build: use pnpm workspace filters"
   git push
   ```

2. **Or update Netlify Dashboard** with the build command above

3. **Trigger a new deployment**

4. **Check build logs** to see if it works

## Expected Build Output

You should see:
```
✓ Installing pnpm
✓ Installing dependencies (workspace-aware)
✓ Building @pos-platform/shared
✓ Building store-app
✓ Deployment successful
```

## Troubleshooting

### If build still fails:
1. Check Netlify build logs for the exact error
2. Verify Node.js version is 20+
3. Try the corepack approach
4. Fall back to npm if pnpm continues to fail

### If shared package build fails:
- Check that `packages/shared/package.json` exists
- Verify TypeScript configuration
- Check that `pnpm-workspace.yaml` is in root

### If store app build fails:
- Verify `apps/store-app/package.json` has `build:netlify` script
- Check that all dependencies are installed
- Verify Vite configuration

