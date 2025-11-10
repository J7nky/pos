# 🚀 Quick Deployment Guide

## Current Status
- ✅ Git repository: `https://github.com/J7nky/pos.git`
- ✅ Working tree: Clean (all changes committed)
- ✅ Latest commit: `3a1e55c adding multilinguel`

## Deployment Options

### Option 1: Git Push (Auto-Deploy) - RECOMMENDED ⭐

If Netlify is connected to your GitHub repository, simply push your code:

```bash
cd /home/janky/Desktop/pos1/pos
git push origin main
```

Netlify will automatically:
1. Detect the push
2. Build your project using `netlify.toml` configuration
3. Deploy to production

**Check deployment status:**
- Go to: https://app.netlify.com
- View your site's deploy logs

---

### Option 2: Manual Build & Deploy via Netlify CLI

**Step 1: Build the project**
```bash
cd /home/janky/Desktop/pos1/pos/apps/store-app
npm install --include=dev
npm run build:netlify
```

**Step 2: Deploy using npx (no installation needed)**
```bash
# Login to Netlify (first time only)
npx --yes netlify-cli login

# Deploy to production
npx --yes netlify-cli deploy --prod --dir=dist
```

---

### Option 3: Manual Upload via Netlify Dashboard

1. **Build locally:**
   ```bash
   cd /home/janky/Desktop/pos1/pos/apps/store-app
   npm install --include=dev
   npm run build:netlify
   ```

2. **Go to Netlify Dashboard:**
   - Visit: https://app.netlify.com
   - Select your site
   - Go to "Deploys" tab
   - Click "Deploy manually"
   - Drag and drop the `dist` folder

---

### Option 4: Force Push (if you have uncommitted changes)

If you have local changes that need to be deployed:

```bash
cd /home/janky/Desktop/pos1/pos

# Stage all changes
git add .

# Commit changes
git commit -m "Deploy latest changes"

# Push to trigger auto-deployment
git push origin main
```

---

## Build Configuration

Your project uses:
- **Build command:** `npm install --include=dev && npm run build:netlify`
- **Publish directory:** `dist`
- **Node version:** `20`
- **Configuration file:** `apps/store-app/netlify.toml`

---

## Environment Variables

Make sure these are set in Netlify Dashboard:
- `VITE_PUBLIC_URL` - Your production URL
- `VITE_SUPABASE_URL` - Your Supabase project URL
- `VITE_SUPABASE_ANON_KEY` - Your Supabase anon key
- `NODE_ENV` - Set to `production`

---

## Troubleshooting

### If build fails:
1. Check Netlify build logs
2. Verify Node.js version (should be 20)
3. Ensure all dependencies are in `package.json`

### If deployment doesn't trigger:
1. Check Netlify site settings → Build & deploy
2. Verify Git integration is connected
3. Check branch settings (should deploy from `main`)

### Network issues:
- Use Option 1 (Git Push) - Netlify builds on their servers
- Or use Option 3 (Manual Upload) - Build locally and upload

---

## Quick Deploy Command

**Fastest way (if Netlify is connected):**
```bash
cd /home/janky/Desktop/pos1/pos && git push origin main
```

Then check: https://app.netlify.com for deployment status.

