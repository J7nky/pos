# Netlify Deployment Settings - Quick Reference

## Important: Publish Directory Paths

When using a **Base directory** in Netlify, the **Publish directory** must be **relative to that base directory**, not the repository root.

### ✅ Correct Configuration

#### Store App
```
Base directory: apps/store-app
Build command: pnpm install && pnpm build:netlify
Publish directory: dist
```

#### Admin App
```
Base directory: apps/admin-app
Build command: cd ../../packages/shared && pnpm build && cd ../../apps/admin-app && pnpm install && pnpm build
Publish directory: dist
```

### ❌ Incorrect Configuration

```
Base directory: apps/store-app
Publish directory: apps/store-app/dist  ❌ WRONG!
```

When base directory is `apps/store-app`, Netlify already changes to that directory, so `dist` is the correct path.

## Complete Netlify Settings

### Store App Site

**Site Settings → Build & Deploy → Build Settings:**
- **Base directory:** `apps/store-app`
- **Build command:** `pnpm install && pnpm build:netlify`
- **Publish directory:** `dist`

**Site Settings → Build & Deploy → Environment:**
```
NODE_ENV=production
VITE_PUBLIC_URL=https://souq-trablous.com
VITE_SUPABASE_URL=your-supabase-url
VITE_SUPABASE_ANON_KEY=your-supabase-anon-key
```

**Domain Management:**
- Custom domain: `souq-trablous.com`

### Admin App Site

**Site Settings → Build & Deploy → Build Settings:**
- **Base directory:** `apps/admin-app`
- **Build command:** `cd ../../packages/shared && pnpm build && cd ../../apps/admin-app && pnpm install && pnpm build`
- **Publish directory:** `dist`

**Site Settings → Build & Deploy → Environment:**
```
NODE_ENV=production
VITE_PUBLIC_URL=https://admin.souq-trablous.com
VITE_SUPABASE_URL=your-supabase-url
VITE_SUPABASE_ANON_KEY=your-supabase-anon-key
```

**Domain Management:**
- Custom domain: `admin.souq-trablous.com`

## Alternative: Using netlify.toml

If you prefer to use `netlify.toml` files (already created), you can:

1. **Leave Base directory empty** in Netlify Dashboard
2. **Let netlify.toml handle the configuration**

The `netlify.toml` files are already configured correctly:
- `apps/store-app/netlify.toml` - for store app
- `apps/admin-app/netlify.toml` - for admin app

## Why This Matters

Netlify's build process:
1. Changes to the **Base directory** (if specified)
2. Runs the **Build command** from that directory
3. Looks for the **Publish directory** relative to the base directory

So if base is `apps/store-app`:
- Build runs from: `apps/store-app/`
- Publish directory should be: `dist` (which is `apps/store-app/dist` from repo root)
- Not: `apps/store-app/dist` (which would be `apps/store-app/apps/store-app/dist`)

## Summary

✅ **Correct:** `Base directory: apps/store-app` + `Publish directory: dist`  
❌ **Wrong:** `Base directory: apps/store-app` + `Publish directory: apps/store-app/dist`

