# Netlify Deployment Guide - Step by Step

This guide will walk you through deploying the **admin-app** to Netlify. The **store-app** is already deployed at `souq-trablous.com`.

## Current Setup

- ✅ **Store App** - Already deployed at `souq-trablous.com`
- ⏳ **Admin App** - Needs to be deployed (this guide)

## Prerequisites

- A Netlify account (sign up at [netlify.com](https://netlify.com))
- Your project repository on GitHub, GitLab, or Bitbucket
- Access to your existing Netlify site for `souq-trablous.com`

---

## Part 1: Verify Store App Configuration (Already Deployed)

If you need to update your existing store app site settings, ensure:

- **Base directory:** `apps/store-app`
- **Build command:** `npm install --include=dev && npm run build:netlify`
- **Publish directory:** `apps/store-app/dist`
- **Node version:** `20`
- **Custom domain:** `souq-trablous.com` (already configured)

**Note:** If your existing site doesn't have the correct base directory set, you may need to update it in Site Settings → Build & deploy → Build settings.

**Important:** If you test `npm run build:netlify` locally from the root directory, you'll get an error because the script is in `apps/store-app/package.json`. This is **not a problem** for Netlify deployment because:
- Netlify will set the base directory to `apps/store-app`
- The build will run from `apps/store-app` where the script exists
- The `netlify.toml` file will be found and used correctly

To test locally, run:
```bash
cd apps/store-app
npm run build:netlify
```

---

## Part 2: Deploy Admin App (New Site)

### Step 1: Create New Site for Admin App

1. **In Netlify dashboard, click "Add new site"** → **"Import an existing project"**
2. **Select the same repository** (`pos-1`) - Yes, you can deploy multiple sites from the same repo!

### Step 2: Configure Build Settings for Admin App

In the build settings, configure:

- **Base directory:** `apps/admin-app`
- **Build command:** (Leave empty - the `netlify.toml` file will handle this)
- **Publish directory:** `apps/admin-app/dist`
- **Node version:** `20` (set in Environment variables)

**Important:** The `netlify.toml` file in `apps/admin-app/` contains a custom build command that:
1. Installs dependencies from the root using pnpm (required for workspace dependencies)
2. Builds the shared package (`@pos-platform/shared`)
3. Builds the admin-app

This is necessary because the admin-app uses pnpm workspace dependencies, which must be installed from the monorepo root.

### Step 3: Set Environment Variables for Admin App

1. **Go to Site Settings → Environment Variables**
2. **Add the following variables:**

```
VITE_PUBLIC_URL = https://admin.souq-trablous.com
VITE_SUPABASE_URL = your_supabase_url
VITE_SUPABASE_ANON_KEY = your_supabase_anon_key
NODE_ENV = production
```

**Note:** Use `https://admin.souq-trablous.com` for `VITE_PUBLIC_URL` once the custom domain is configured.

### Step 4: Deploy Admin App

1. **Click "Deploy site"**
2. **Wait for the build to complete**
3. **Your admin app will be live** at `https://your-admin-site.netlify.app` (temporary Netlify URL)

---

## Part 3: Custom Domain Setup for Admin App

### Step 1: Add Custom Domain to Admin App

1. **Go to your new admin app site in Netlify dashboard**
2. **Go to Site Settings → Domain Management**
3. **Click "Add custom domain"**
4. **Enter:** `admin.souq-trablous.com`
5. **Follow DNS configuration instructions**

### Step 2: Configure DNS Records

In your domain provider (e.g., Namecheap, GoDaddy):

**Add CNAME record for admin subdomain:**
- **Type:** `CNAME`
- **Host:** `admin`
- **Value:** `your-admin-site.netlify.app` (the Netlify URL shown in domain settings)
- **TTL:** `Automatic` or `3600`

**Note:** The exact value will be shown in Netlify's domain settings. It will look something like `random-name-123456.netlify.app`.

### Step 3: Verify Domain

1. **Wait for DNS propagation** (usually 5-30 minutes, can take up to 48 hours)
2. **Netlify will automatically provision SSL certificate**
3. **Your admin app will be accessible at:** `https://admin.souq-trablous.com`

### Step 4: Update Environment Variable

After the domain is verified and SSL is active:

1. **Go to Site Settings → Environment Variables**
2. **Update `VITE_PUBLIC_URL`** to: `https://admin.souq-trablous.com`
3. **Trigger a new deployment** (or wait for next git push)

---

## Part 4: Continuous Deployment

Both sites will automatically deploy when you push to your repository:

1. **Push changes to your main branch**
2. **Netlify detects the changes**
3. **Both sites automatically build and deploy** (store-app and admin-app)
4. **Your live sites are updated**

**Note:** Each site builds independently, so you can update one without affecting the other.

**Current setup:**
- **Store App** (`souq-trablous.com`) - Already configured for auto-deploy
- **Admin App** (`admin.souq-trablous.com`) - Will auto-deploy after initial setup

---

## Part 5: Managing Multiple Sites

### In Netlify Dashboard

- **Both sites are listed** in your dashboard:
  - **Store App** - `souq-trablous.com` (existing site)
  - **Admin App** - `admin.souq-trablous.com` (new site)
- **Each site has its own settings** (environment variables, domain, etc.)
- **Build logs are separate** for each site
- **Deployments are independent** for each site

### Best Practices

1. **Name your sites clearly:**
   - Store App: `souq-store` or `pos-store-app`
   - Admin App: `souq-admin` or `pos-admin-app`

2. **Use environment variables:**
   - Keep sensitive data in environment variables
   - Use different `VITE_PUBLIC_URL` values for each app:
     - Store: `https://souq-trablous.com`
     - Admin: `https://admin.souq-trablous.com`

3. **Monitor both sites:**
   - Check build logs regularly
   - Set up notifications for failed builds
   - Verify both sites deploy successfully after each push

---

## Troubleshooting

### Common Issues

#### 1. Build Fails - "Cannot find module"

**Solution:**
- Ensure `base directory` is set correctly in Netlify dashboard
- Check that all dependencies are in `package.json`
- Verify Node version is set to 20

#### 2. Build Fails - "Command not found"

**Solution:**
- Ensure build command includes `npm install --include=dev`
- Check that scripts exist in `package.json`
- Verify you're in the correct base directory

#### 3. Environment Variables Not Working

**Solution:**
- Ensure variables start with `VITE_` for client-side access
- Redeploy after adding new variables
- Check variable names match exactly (case-sensitive)

#### 4. Routing Issues (404 on refresh)

**Solution:**
- Verify `netlify.toml` has redirect rules
- Check that `_redirects` file is in dist folder (if used)
- Ensure SPA redirect is configured

#### 5. Wrong App Deploys

**Solution:**
- Double-check `base directory` setting
- Verify `publish directory` points to correct app's dist folder
- Check build command is for the correct app

#### 6. pnpm Lockfile Mismatch Error

**If you see: "pnpm install failure due to frozen-lockfile mismatch"**

This error occurs when `pnpm-lock.yaml` is out of sync with `package.json` files. This is common with workspace dependencies.

**Solution:**

1. **Update the lockfile locally:**
   ```bash
   # From the root directory
   corepack enable
   corepack prepare pnpm@10.20.0 --activate
   pnpm install
   
   # Commit the updated lockfile
   git add pnpm-lock.yaml
   git commit -m "chore: update pnpm-lock.yaml to match package.json"
   git push
   ```

2. **Verify the shared package exists:**
   - Check that `packages/shared/package.json` exists
   - Check that `pnpm-workspace.yaml` includes `packages/*`
   - Ensure the shared package is committed to the repository

3. **The `netlify.toml` is already configured** to handle workspace dependencies correctly by installing from the root.

**Note:** The admin-app's `netlify.toml` uses a custom build command that installs from the root to properly resolve workspace dependencies.

#### 7. "Missing script: build:netlify" Error (Local Testing)

**If you see this error when testing locally from the root directory:**

This is **not a problem** for Netlify deployment. The error occurs because:
- You're running the command from the root directory
- The script exists in `apps/store-app/package.json`, not the root

**Solution for local testing:**
```bash
# For store-app
cd apps/store-app
npm run build:netlify

# For admin-app
cd apps/admin-app
npm run build
```

**For Netlify:** This won't be an issue because Netlify sets the base directory correctly, so the build runs from the app directory where the scripts exist.

### Getting Help

- **Netlify Docs:** [docs.netlify.com](https://docs.netlify.com)
- **Community:** [community.netlify.com](https://community.netlify.com)
- **Support:** Available in Netlify dashboard

---

## Quick Reference

### Store App Settings
```
Base directory: apps/store-app
Build command: npm install --include=dev && npm run build:netlify
Publish directory: apps/store-app/dist
Node version: 20
```

### Admin App Settings
```
Base directory: apps/admin-app
Build command: (Leave empty - netlify.toml handles it)
Publish directory: apps/admin-app/dist
Node version: 20
PNPM_VERSION: 10.20.0 (set in netlify.toml)
```

**Note:** The build command in `netlify.toml` handles:
- Installing from root (for workspace dependencies)
- Building shared package
- Building admin-app

### Required Environment Variables

**Store App (souq-trablous.com):**
```
VITE_PUBLIC_URL = https://souq-trablous.com
VITE_SUPABASE_URL = your_supabase_url
VITE_SUPABASE_ANON_KEY = your_supabase_anon_key
NODE_ENV = production
```

**Admin App (admin.souq-trablous.com):**
```
VITE_PUBLIC_URL = https://admin.souq-trablous.com
VITE_SUPABASE_URL = your_supabase_url
VITE_SUPABASE_ANON_KEY = your_supabase_anon_key
NODE_ENV = production
```

---

## Summary

✅ **Store App** - Already deployed at `souq-trablous.com`
✅ **Admin App** - Deploy as new site at `admin.souq-trablous.com`
✅ **One new Netlify site needed** - Only create one new site for admin-app
✅ **Same repository** - Both sites deploy from the same repo
✅ **Independent deployments** - Update one without affecting the other
✅ **Automatic SSL** - HTTPS enabled by default for both domains
✅ **Global CDN** - Fast loading worldwide
✅ **Continuous deployment** - Push to deploy automatically

## Final Setup

After completing this guide, you'll have:

- **Store App:** `https://souq-trablous.com` (existing)
- **Admin App:** `https://admin.souq-trablous.com` (new)
- **Two Netlify sites** in your dashboard
- **Both apps** auto-deploying from the same repository

---

**Need help?** Check the troubleshooting section or Netlify's documentation.

