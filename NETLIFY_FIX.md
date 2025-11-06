# Netlify Deployment Fix

## Problem

Netlify is trying to run `npm run build:netlify` but:
1. The project uses `pnpm` not `npm`
2. The shared package needs to be built first
3. Netlify needs to use the correct package manager

## Solution Applied

Updated `apps/store-app/netlify.toml` to:
1. Use `pnpm` instead of `npm`
2. Build shared package first
3. Then build the store app

## Updated Build Command

```toml
command = "cd ../../packages/shared && pnpm build && cd ../../apps/store-app && pnpm install && pnpm build:netlify"
```

## Alternative: Update Netlify Dashboard Settings

If you prefer to configure in Netlify Dashboard instead of using `netlify.toml`:

### In Netlify Dashboard:

1. Go to **Site Settings** → **Build & Deploy** → **Build Settings**
2. **Base directory:** `apps/store-app`
3. **Build command:** 
   ```
   cd ../../packages/shared && pnpm build && cd ../../apps/store-app && pnpm install && pnpm build:netlify
   ```
4. **Publish directory:** `dist`
5. **Package manager:** Select `pnpm` (if available)

### Environment Variables:

Make sure these are set:
```
NODE_ENV=production
VITE_PUBLIC_URL=https://souq-trablous.com
VITE_SUPABASE_URL=your-supabase-url
VITE_SUPABASE_ANON_KEY=your-supabase-anon-key
```

## Important Notes

1. **Package Manager:** This is a pnpm workspace, so you MUST use `pnpm`, not `npm`
2. **Shared Package:** Must be built before the app can build
3. **Base Directory:** Should be set to `apps/store-app` in Netlify Dashboard

## Next Steps

1. **Commit and push** the updated `netlify.toml`:
   ```bash
   git add apps/store-app/netlify.toml
   git commit -m "Fix Netlify build: use pnpm and build shared package first"
   git push
   ```

2. **Or update Netlify Dashboard** with the build command above

3. **Trigger a new deployment** in Netlify

4. **Verify** the build succeeds

## If Netlify Doesn't Support pnpm

If Netlify doesn't have pnpm installed, you may need to:

1. **Install pnpm in build command:**
   ```bash
   npm install -g pnpm && cd ../../packages/shared && pnpm build && cd ../../apps/store-app && pnpm install && pnpm build:netlify
   ```

2. **Or use npm with workspace commands:**
   ```bash
   npm install -g pnpm && pnpm install && pnpm --filter @pos-platform/shared build && pnpm --filter store-app build:netlify
   ```

## Verification

After fixing, the build should:
- ✅ Install dependencies
- ✅ Build shared package
- ✅ Build store app
- ✅ Deploy successfully

