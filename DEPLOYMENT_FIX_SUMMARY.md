# Netlify Deployment Fix Summary

## Problem

Netlify deployment failed with error:
```
Missing script: 'build:netlify'
```

## Root Cause

1. Netlify was using `npm` instead of `pnpm`
2. The project is a pnpm workspace
3. The shared package needs to be built first
4. Netlify was looking at the wrong package.json

## Solution Applied

Updated `apps/store-app/netlify.toml` with the correct build command:

```toml
command = "npm install -g pnpm && cd ../../packages/shared && pnpm build && cd ../../apps/store-app && pnpm install && pnpm build:netlify"
```

This command:
1. ✅ Installs pnpm globally (if not available)
2. ✅ Builds the shared package first
3. ✅ Installs dependencies for store app
4. ✅ Builds the store app

## Next Steps

### Option 1: Commit and Push (Recommended)

1. **Commit the fix:**
   ```bash
   git add apps/store-app/netlify.toml
   git commit -m "Fix Netlify build: use pnpm and build shared package first"
   git push
   ```

2. **Netlify will automatically redeploy** when you push

3. **Check the build logs** to verify it works

### Option 2: Update Netlify Dashboard

If you prefer to configure in Netlify Dashboard:

1. Go to **Site Settings** → **Build & Deploy** → **Build Settings**
2. **Base directory:** `apps/store-app`
3. **Build command:** 
   ```
   npm install -g pnpm && cd ../../packages/shared && pnpm build && cd ../../apps/store-app && pnpm install && pnpm build:netlify
   ```
4. **Publish directory:** `dist`
5. **Save** and **trigger a new deployment**

## Alternative: Simpler Build Command

If the above doesn't work, try this simpler approach:

```bash
npm install -g pnpm && pnpm install && pnpm --filter @pos-platform/shared build && pnpm --filter store-app build:netlify
```

This uses pnpm workspace filters instead of changing directories.

## Verify Netlify Settings

Make sure in Netlify Dashboard:

- ✅ **Base directory:** `apps/store-app`
- ✅ **Build command:** (see above)
- ✅ **Publish directory:** `dist`
- ✅ **Environment variables:** Set correctly

## Expected Build Output

After fixing, you should see:
```
✓ Installing pnpm
✓ Building shared package
✓ Installing dependencies
✓ Building store app
✓ Deployment successful
```

## Troubleshooting

### If pnpm installation fails:
- Netlify might need Node.js 18+ for pnpm support
- Check Node version in Netlify settings

### If shared package build fails:
- Make sure `packages/shared/package.json` exists
- Check that TypeScript is configured correctly

### If store app build fails:
- Verify `apps/store-app/package.json` has `build:netlify` script
- Check that all dependencies are installed

## Files Changed

- ✅ `apps/store-app/netlify.toml` - Updated build command

## Summary

✅ **Fixed:** Build command now uses pnpm  
✅ **Fixed:** Shared package is built first  
✅ **Fixed:** Correct build script is used  

**Next:** Commit and push, or update Netlify Dashboard settings, then redeploy!

