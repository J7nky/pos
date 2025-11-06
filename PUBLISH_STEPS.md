# 🚀 Publishing Steps - Quick Guide

## Prerequisites

✅ Shared package built (already done)  
✅ Both apps configured  
✅ Netlify account ready

## Option 1: Deploy via Netlify Dashboard (Recommended)

### Step 1: Deploy Store App (POS-1)

1. **Go to [netlify.com](https://netlify.com)** and sign in
2. **Click "Add new site" → "Import an existing project"**
3. **Connect to Git** (GitHub/GitLab/Bitbucket)
4. **Select your repository** (`pos-1`)
5. **Configure build settings:**
   - **Base directory:** `apps/store-app`
   - **Build command:** `pnpm install && pnpm build:netlify`
   - **Publish directory:** `dist`
6. **Click "Show advanced"** and add environment variables:
   ```
   NODE_ENV=production
   VITE_PUBLIC_URL=https://souq-trablous.com
   VITE_SUPABASE_URL=your-supabase-url
   VITE_SUPABASE_ANON_KEY=your-supabase-anon-key
   ```
7. **Click "Deploy site"**
8. **After deployment, add custom domain:**
   - Go to Site Settings → Domain Management
   - Add custom domain: `souq-trablous.com`
   - Follow DNS instructions

### Step 2: Deploy Admin App

1. **Click "Add new site" → "Import an existing project"** (again)
2. **Select the SAME repository** (`pos-1`)
3. **Configure build settings:**
   - **Base directory:** `apps/admin-app`
   - **Build command:** `cd ../../packages/shared && pnpm build && cd ../../apps/admin-app && pnpm install && pnpm build`
   - **Publish directory:** `dist`
4. **Add environment variables:**
   ```
   NODE_ENV=production
   VITE_PUBLIC_URL=https://admin.souq-trablous.com
   VITE_SUPABASE_URL=your-supabase-url
   VITE_SUPABASE_ANON_KEY=your-supabase-anon-key
   ```
5. **Click "Deploy site"**
6. **After deployment, add custom domain:**
   - Go to Site Settings → Domain Management
   - Add custom domain: `admin.souq-trablous.com`
   - Update DNS in Namecheap:
     - Add CNAME: `admin` → `your-admin-site.netlify.app`

## Option 2: Deploy via Netlify CLI

### Install Netlify CLI (if not installed)

```powershell
npm install -g netlify-cli
```

### Deploy Store App

```powershell
cd apps/store-app
netlify login
netlify init
# Follow prompts:
# - Create & configure a new site
# - Team: Select your team
# - Site name: (press enter for auto-generated name)
# - Build command: pnpm install && pnpm build:netlify
# - Directory to deploy: dist
netlify deploy --prod
```

### Deploy Admin App

```powershell
cd apps/admin-app
netlify login
netlify init
# Follow prompts:
# - Create & configure a new site
# - Team: Select your team
# - Site name: (press enter for auto-generated name)
# - Build command: cd ../../packages/shared && pnpm build && cd ../../apps/admin-app && pnpm install && pnpm build
# - Directory to deploy: dist
netlify deploy --prod
```

## Environment Variables

Make sure to set these in Netlify Dashboard for each site:

### Store App:
```
NODE_ENV=production
VITE_PUBLIC_URL=https://souq-trablous.com
VITE_SUPABASE_URL=your-actual-supabase-url
VITE_SUPABASE_ANON_KEY=your-actual-supabase-anon-key
```

### Admin App:
```
NODE_ENV=production
VITE_PUBLIC_URL=https://admin.souq-trablous.com
VITE_SUPABASE_URL=your-actual-supabase-url
VITE_SUPABASE_ANON_KEY=your-actual-supabase-anon-key
```

## DNS Configuration (Namecheap)

### For Store App (souq-trablous.com):
- Already configured (if previously deployed)

### For Admin App (admin.souq-trablous.com):
1. Go to Namecheap → Domain List → Manage
2. Go to Advanced DNS
3. Add CNAME record:
   - Type: CNAME
   - Host: `admin`
   - Value: `your-admin-site.netlify.app` (from Netlify)
   - TTL: Automatic
4. Wait 5-30 minutes for DNS propagation

## Verification

After deployment, check:

### Store App:
- [ ] App loads at `https://souq-trablous.com`
- [ ] All features work
- [ ] Authentication works
- [ ] QR codes generate correctly

### Admin App:
- [ ] App loads at `https://admin.souq-trablous.com`
- [ ] Login page works
- [ ] Can access admin features

## Troubleshooting

### Build fails with "Cannot find module @pos-platform/shared"
**Solution:** Make sure the build command includes building the shared package first:
```bash
cd ../../packages/shared && pnpm build && cd ../../apps/admin-app && pnpm install && pnpm build
```

### Environment variables not loading
**Solution:** 
1. Check variables are set in Netlify Dashboard
2. Make sure they start with `VITE_`
3. Rebuild and redeploy

### DNS not working
**Solution:**
1. Wait 30 minutes for DNS propagation
2. Check DNS records in Namecheap
3. Verify CNAME points to correct Netlify site

## Next Steps After Deployment

1. ✅ Test both apps
2. ✅ Set up SSL (automatic with Netlify)
3. ✅ Configure Supabase redirect URLs
4. ✅ Test authentication
5. ✅ Test all features

