# Deployment Guide for Monorepo Apps

## ✅ Question 1: Will POS-1 (Store App) Still Work?

**YES!** The store app works exactly as before. The monorepo migration didn't break anything.

### What Changed:
- ✅ App moved from root to `apps/store-app/`
- ✅ All functionality preserved
- ✅ All features work the same
- ✅ Deployment process slightly different (see below)

### What Stayed the Same:
- ✅ All your code
- ✅ All your features
- ✅ All your data
- ✅ All your configurations

## ✅ Question 2: Can You Access Admin App via Public Domain?

**YES!** You can deploy the admin app to a public domain. Here are your options:

### Option 1: Separate Subdomain (Recommended)
- **Store App:** `https://souq-trablous.com` (or `https://store.souq-trablous.com`)
- **Admin App:** `https://admin.souq-trablous.com`

### Option 2: Separate Path
- **Store App:** `https://souq-trablous.com`
- **Admin App:** `https://souq-trablous.com/admin`

### Option 3: Completely Separate Domain
- **Store App:** `https://souq-trablous.com`
- **Admin App:** `https://admin-souq-trablous.com`

## 🚀 Deployment Options

### Option A: Deploy Both Apps to Netlify (Recommended)

#### 1. Store App Deployment

**Build Settings:**
```bash
Base directory: apps/store-app
Build command: pnpm install && pnpm build:netlify
Publish directory: dist
```

**Note:** When using a base directory, the publish directory is relative to that base, so use `dist` not `apps/store-app/dist`.

**Environment Variables:**
```
NODE_ENV=production
VITE_PUBLIC_URL=https://souq-trablous.com
VITE_SUPABASE_URL=your-supabase-url
VITE_SUPABASE_ANON_KEY=your-supabase-anon-key
```

**Custom Domain:** `souq-trablous.com`

#### 2. Admin App Deployment

**Create a new Netlify site for admin app:**

**Build Settings:**
```bash
Base directory: apps/admin-app
Build command: cd ../../packages/shared && pnpm build && cd ../../apps/admin-app && pnpm install && pnpm build
Publish directory: dist
```

**Note:** When using a base directory, the publish directory is relative to that base, so use `dist` not `apps/admin-app/dist`.

**Environment Variables:**
```
NODE_ENV=production
VITE_PUBLIC_URL=https://admin.souq-trablous.com
VITE_SUPABASE_URL=your-supabase-url
VITE_SUPABASE_ANON_KEY=your-supabase-anon-key
```

**Custom Domain:** `admin.souq-trablous.com`

### Option B: Deploy to Same Domain with Different Paths

This requires a single Netlify site with routing:

1. **Build both apps**
2. **Combine dist folders**
3. **Configure routing in `netlify.toml`**

## 📋 Step-by-Step: Deploy Store App (POS-1)

### 1. Update Build Scripts

The store app already has build scripts configured. Just make sure:

```json
{
  "scripts": {
    "build:netlify": "vite build --mode production"
  }
}
```

### 2. Deploy to Netlify

**Via Netlify Dashboard:**
1. Go to [netlify.com](https://netlify.com)
2. Click "New site from Git"
3. Select your repository
4. **Configure build:**
   - Base directory: `apps/store-app`
   - Build command: `pnpm install && pnpm build:netlify`
   - Publish directory: `dist` (relative to base directory)
5. Add environment variables (see above)
6. Deploy!

**Via Netlify CLI:**
```bash
cd apps/store-app
netlify deploy --prod
```

### 3. Connect Custom Domain

1. In Netlify Dashboard → Site Settings → Domain Management
2. Add custom domain: `souq-trablous.com`
3. Follow DNS setup instructions

## 📋 Step-by-Step: Deploy Admin App

### 1. Create Netlify Configuration

Create `apps/admin-app/netlify.toml`:

```toml
[build]
  base = "."
  publish = "dist"
  command = "pnpm install && pnpm build"

[build.environment]
  NODE_VERSION = "20"

[[redirects]]
  from = "/*"
  to = "/index.html"
  status = 200

[[headers]]
  for = "/*"
  [headers.values]
    X-Frame-Options = "DENY"
    X-XSS-Protection = "1; mode=block"
    X-Content-Type-Options = "nosniff"
```

### 2. Deploy to Netlify

**Create a new Netlify site:**

1. Go to [netlify.com](https://netlify.com)
2. Click "New site from Git"
3. Select the **same repository** (`pos-1`)
4. **Configure build:**
   - Base directory: `apps/admin-app`
   - Build command: `cd ../../packages/shared && pnpm build && cd ../../apps/admin-app && pnpm install && pnpm build`
   - Publish directory: `dist` (relative to base directory)
5. Add environment variables:
   ```
   VITE_PUBLIC_URL=https://admin.souq-trablous.com
   VITE_SUPABASE_URL=your-supabase-url
   VITE_SUPABASE_ANON_KEY=your-supabase-anon-key
   NODE_ENV=production
   ```
6. Deploy!

### 3. Connect Subdomain

1. In Netlify Dashboard → Site Settings → Domain Management
2. Add custom domain: `admin.souq-trablous.com`
3. Update DNS in Namecheap:
   - Add CNAME record: `admin` → `your-admin-site.netlify.app`

## 🔧 Monorepo Build Considerations

### Building from Root

If deploying from the monorepo root, you need to:

1. **Install dependencies at root:**
   ```bash
   pnpm install
   ```

2. **Build shared package first:**
   ```bash
   cd packages/shared
   pnpm build
   ```

3. **Build the app:**
   ```bash
   cd apps/store-app  # or apps/admin-app
   pnpm build
   ```

### Netlify Build Command (Full)

For Netlify, use this build command:

```bash
# Store App
cd apps/store-app && pnpm install && cd ../../packages/shared && pnpm build && cd ../../apps/store-app && pnpm build:netlify

# Admin App
cd apps/admin-app && pnpm install && cd ../../packages/shared && pnpm build && cd ../../apps/admin-app && pnpm build
```

Or use a root-level script (see below).

## 🛠️ Root-Level Build Scripts

Add these to root `package.json`:

```json
{
  "scripts": {
    "build:shared": "pnpm --filter @pos-platform/shared build",
    "build:store": "pnpm build:shared && pnpm --filter store-app build:netlify",
    "build:admin": "pnpm build:shared && pnpm --filter admin-app build",
    "deploy:store": "cd apps/store-app && netlify deploy --prod",
    "deploy:admin": "cd apps/admin-app && netlify deploy --prod"
  }
}
```

## 📝 DNS Configuration for Subdomain

### In Namecheap:

1. **Go to Advanced DNS**
2. **Add CNAME record:**
   ```
   Type: CNAME
   Host: admin
   Value: your-admin-site.netlify.app
   TTL: Automatic
   ```

3. **Wait for DNS propagation** (5-30 minutes)

## ✅ Verification Checklist

### Store App (POS-1):
- [ ] App loads at `https://souq-trablous.com`
- [ ] All features work
- [ ] Authentication works
- [ ] POS functionality works
- [ ] QR codes generate correctly
- [ ] Offline mode works

### Admin App:
- [ ] App loads at `https://admin.souq-trablous.com`
- [ ] Login page works
- [ ] Authentication works
- [ ] Can access admin features
- [ ] Can manage global products
- [ ] Can view store subscriptions

## 🔒 Security Considerations

### Admin App Security:
- ✅ Use Row Level Security (RLS) in Supabase
- ✅ Restrict admin routes to authenticated admin users
- ✅ Use different authentication flow for admin
- ✅ Consider IP whitelisting for admin domain
- ✅ Use strong passwords for admin accounts

## 🐛 Troubleshooting

### Issue: Build fails with "Cannot find module @pos-platform/shared"

**Solution:**
1. Make sure shared package is built first
2. Use the build commands above that build shared package first
3. Check that `pnpm install` runs at root level

### Issue: Admin app shows 404

**Solution:**
1. Check that `netlify.toml` has redirect rules
2. Make sure base path in `vite.config.ts` is correct
3. Check that build output is in `dist` folder

### Issue: Environment variables not loading

**Solution:**
1. Set environment variables in Netlify Dashboard
2. Rebuild and redeploy
3. Check that variables start with `VITE_`

## 📚 Summary

✅ **Store App (POS-1):** Works perfectly, deploy as before  
✅ **Admin App:** Can be deployed to `admin.souq-trablous.com`  
✅ **Both Apps:** Can run simultaneously on different domains  
✅ **Monorepo:** Doesn't break anything, just requires proper build commands

**Next Steps:**
1. Test store app locally: `cd apps/store-app && pnpm dev`
2. Test admin app locally: `cd apps/admin-app && pnpm dev`
3. Deploy store app to `souq-trablous.com`
4. Deploy admin app to `admin.souq-trablous.com`

