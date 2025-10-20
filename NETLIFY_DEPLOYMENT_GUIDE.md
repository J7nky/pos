# Netlify Deployment Guide

This guide will help you deploy your POS application to Netlify, replacing the previous Vercel setup.

## Prerequisites

- A Netlify account (sign up at [netlify.com](https://netlify.com))
- Your project repository on GitHub, GitLab, or Bitbucket
- Domain name (optional, for custom domain setup)

## Step 1: Deploy to Netlify

### Option A: Deploy via Netlify Dashboard (Recommended)

1. **Go to [netlify.com](https://netlify.com)** and sign up/login
2. **Click "New site from Git"**
3. **Connect your Git provider** (GitHub/GitLab/Bitbucket)
4. **Select your repository** (`pos-1`)
5. **Configure build settings:**
   - Build command: `npm run build:netlify`
   - Publish directory: `dist`
   - Node version: `18` (or latest LTS)
6. **Click "Deploy site"**

### Option B: Deploy via Netlify CLI

```bash
# Install Netlify CLI globally
npm install -g netlify-cli

# Login to Netlify
netlify login

# Initialize site (run from project root)
netlify init

# Deploy to production
netlify deploy --prod
```

## Step 2: Environment Variables

Set up the following environment variables in Netlify Dashboard:

1. **Go to Site Settings → Environment Variables**
2. **Add the following variables:**

```
VITE_PUBLIC_URL = https://your-site-name.netlify.app
VITE_SUPABASE_URL = your_supabase_url
VITE_SUPABASE_ANON_KEY = your_supabase_anon_key
NODE_ENV = production
```

## Step 3: Custom Domain Setup (Optional)

If you have a custom domain (e.g., `souq-trablous.com`):

### In Netlify Dashboard:
1. **Go to Site Settings → Domain Management**
2. **Click "Add custom domain"**
3. **Enter your domain name**
4. **Follow the DNS configuration instructions**

### In Your Domain Provider (e.g., Namecheap):
1. **Add CNAME record:**
   - Type: `CNAME`
   - Host: `www`
   - Value: `your-site-name.netlify.app`
   - TTL: `Automatic`

2. **Add A record for apex domain:**
   - Type: `A`
   - Host: `@`
   - Value: `75.2.60.5` (Netlify's IP)
   - TTL: `Automatic`

## Step 4: Build Configuration

The project includes a `netlify.toml` file with the following configuration:

- **Build command:** `npm run build:netlify`
- **Publish directory:** `dist`
- **Node version:** `18`
- **Redirects:** SPA routing support
- **Headers:** Security and performance optimizations

## Step 5: Continuous Deployment

Netlify automatically deploys when you push to your main branch:

1. **Push changes to your repository**
2. **Netlify detects the changes**
3. **Automatically builds and deploys**
4. **Updates your live site**

## Step 6: Monitoring and Analytics

### Built-in Features:
- **Deploy logs:** View build and deployment logs
- **Form submissions:** Handle form data (if needed)
- **Analytics:** Basic site analytics
- **Functions:** Serverless functions (if needed)

### Optional Integrations:
- **Google Analytics:** Add tracking code
- **Error monitoring:** Sentry or similar service
- **Performance monitoring:** Lighthouse CI

## Troubleshooting

### Common Issues:

1. **Build fails:**
   - Check Node.js version (should be 18+)
   - Verify all dependencies are in `package.json`
   - Check build logs in Netlify dashboard

2. **Environment variables not working:**
   - Ensure variables start with `VITE_` for client-side access
   - Redeploy after adding new variables

3. **Routing issues:**
   - Verify `_redirects` file is in `dist` folder
   - Check `netlify.toml` redirect configuration

4. **Performance issues:**
   - Enable asset optimization in Netlify settings
   - Check bundle size and optimize if needed

### Getting Help:

- **Netlify Docs:** [docs.netlify.com](https://docs.netlify.com)
- **Community:** [community.netlify.com](https://community.netlify.com)
- **Support:** Available in Netlify dashboard

## Migration from Vercel

### What was removed:
- `vercel.json` configuration file
- `.vercel/` directory
- Vercel-specific environment variables

### What was added:
- `netlify.toml` configuration
- `_redirects` file for SPA routing
- Netlify-specific build scripts
- Updated deployment guide

## Security Features

The Netlify configuration includes:
- **Security headers:** XSS protection, content type options
- **HTTPS:** Automatic SSL certificates
- **DDoS protection:** Built-in protection
- **Access control:** Password protection (if needed)

## Performance Optimizations

- **Asset caching:** Static assets cached for 1 year
- **CDN:** Global content delivery network
- **Compression:** Automatic gzip/brotli compression
- **Image optimization:** Automatic image optimization (if enabled)

---

✅ **Netlify automatically provides SSL certificates** - no additional setup needed!
✅ **Global CDN** - fast loading worldwide
✅ **Automatic deployments** - push to deploy
✅ **Free tier available** - generous limits for small projects
