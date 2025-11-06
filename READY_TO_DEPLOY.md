# ✅ Ready to Deploy!

## Build Status

✅ **Shared Package:** Built successfully  
✅ **Store App:** Built successfully (`apps/store-app/dist/`)  
✅ **Admin App:** Built successfully (`apps/admin-app/dist/`)

## Deployment Instructions

### Option 1: Netlify Dashboard (Recommended)

#### Deploy Store App

1. Go to [netlify.com](https://netlify.com) and sign in
2. Click **"Add new site"** → **"Import an existing project"**
3. Connect to your Git provider (GitHub/GitLab/Bitbucket)
4. Select repository: `pos-1`
5. **Configure build settings:**
   ```
   Base directory: apps/store-app
   Build command: pnpm install && pnpm build:netlify
   Publish directory: dist
   ```
6. **Add environment variables:**
   ```
   NODE_ENV=production
   VITE_PUBLIC_URL=https://souq-trablous.com
   VITE_SUPABASE_URL=your-supabase-url
   VITE_SUPABASE_ANON_KEY=your-supabase-anon-key
   ```
7. Click **"Deploy site"**
8. After deployment, add custom domain: `souq-trablous.com`

#### Deploy Admin App

1. Click **"Add new site"** → **"Import an existing project"** (again)
2. Select the **SAME repository** (`pos-1`)
3. **Configure build settings:**
   ```
   Base directory: apps/admin-app
   Build command: cd ../../packages/shared && pnpm build && cd ../../apps/admin-app && pnpm install && pnpm build
   Publish directory: dist
   ```
4. **Add environment variables:**
   ```
   NODE_ENV=production
   VITE_PUBLIC_URL=https://admin.souq-trablous.com
   VITE_SUPABASE_URL=your-supabase-url
   VITE_SUPABASE_ANON_KEY=your-supabase-anon-key
   ```
5. Click **"Deploy site"**
6. After deployment, add custom domain: `admin.souq-trablous.com`

### Option 2: Netlify CLI

#### Install Netlify CLI (if needed)
```powershell
npm install -g netlify-cli
```

#### Deploy Store App
```powershell
cd apps/store-app
netlify login
netlify init
# Follow prompts, then:
netlify deploy --prod
```

#### Deploy Admin App
```powershell
cd apps/admin-app
netlify login
netlify init
# Follow prompts, then:
netlify deploy --prod
```

## DNS Configuration

### For Admin App Subdomain

1. Go to **Namecheap** → Domain List → Manage `souq-trablous.com`
2. Go to **Advanced DNS**
3. Add **CNAME record:**
   ```
   Type: CNAME
   Host: admin
   Value: your-admin-site.netlify.app (from Netlify)
   TTL: Automatic
   ```
4. Wait 5-30 minutes for DNS propagation

## Environment Variables Checklist

Make sure you have these values ready:

- ✅ `VITE_SUPABASE_URL` - Your Supabase project URL
- ✅ `VITE_SUPABASE_ANON_KEY` - Your Supabase anonymous key
- ✅ `VITE_PUBLIC_URL` - Public URL for each app

## Build Warnings (Safe to Ignore)

The builds completed successfully with some warnings:
- ⚠️ Node.js version warning (build still works)
- ⚠️ Duplicate member warnings in db.ts (non-critical)
- ⚠️ Large chunk size warnings (performance optimization suggestion)

These don't prevent deployment and can be addressed later.

## Post-Deployment Checklist

### Store App:
- [ ] App loads at `https://souq-trablous.com`
- [ ] Authentication works
- [ ] POS functionality works
- [ ] QR codes generate correctly
- [ ] Offline mode works

### Admin App:
- [ ] App loads at `https://admin.souq-trablous.com`
- [ ] Login page works
- [ ] Authentication works
- [ ] Can access admin features

## Quick Reference

### Store App Build Command:
```bash
cd apps/store-app && pnpm install && pnpm build:netlify
```

### Admin App Build Command:
```bash
cd ../../packages/shared && pnpm build && cd ../../apps/admin-app && pnpm install && pnpm build
```

### Publish Directory (for both):
```
dist
```

## Next Steps

1. ✅ **Deploy Store App** to `souq-trablous.com`
2. ✅ **Deploy Admin App** to `admin.souq-trablous.com`
3. ✅ **Configure DNS** for admin subdomain
4. ✅ **Test both apps** after deployment
5. ✅ **Update Supabase** redirect URLs if needed

## Need Help?

- See `DEPLOYMENT_GUIDE.md` for detailed instructions
- See `PUBLISH_STEPS.md` for step-by-step guide
- See `NETLIFY_DEPLOYMENT_SETTINGS.md` for quick reference

**Everything is ready! You can now deploy both apps to Netlify.** 🚀

