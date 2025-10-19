# 🌐 Domain Deployment Guide - souq-trablous.com

## Overview
This guide will help you deploy your POS system to the custom domain `souq-trablous.com` purchased from Namecheap.

## Prerequisites
- ✅ Domain: `souq-trablous.com` (purchased from Namecheap)
- ✅ GitHub repository with your code
- ✅ Supabase project (for database)

## Step 1: Configure DNS Settings (Namecheap)

### In your Namecheap account:

1. **Go to Domain List** → Click "Manage" next to `souq-trablous.com`
2. **Go to Advanced DNS** tab
3. **Add these DNS records:**

**Option A: CNAME Records (Recommended)**
```
Type: CNAME Record
Host: @
Value: cname.vercel-dns.com
TTL: 300

Type: CNAME Record  
Host: www
Value: cname.vercel-dns.com
TTL: 300
```

**Option B: A Records (Alternative)**
```
Type: A Record
Host: @
Value: 76.76.19.61
TTL: 300

Type: A Record
Host: www
Value: 76.76.19.61
TTL: 300
```

## Step 2: Deploy to Vercel (Recommended)

### Option A: Deploy via Vercel Dashboard

1. **Go to [vercel.com](https://vercel.com)** and sign up/login
2. **Click "New Project"**
3. **Import your GitHub repository**
4. **Configure build settings:**
   - Framework Preset: `Vite`
   - Build Command: `npm run build:production`
   - Output Directory: `dist`
   - Install Command: `npm install`

5. **Add Environment Variables:**
   ```
   VITE_PUBLIC_URL=https://souq-trablous.com
   VITE_SUPABASE_URL=your-supabase-url
   VITE_SUPABASE_ANON_KEY=your-supabase-anon-key
   ```

6. **Deploy!**

### Option B: Deploy via Vercel CLI

```bash
# Install Vercel CLI
npm i -g vercel

# Login to Vercel
vercel login

# Deploy
vercel --prod

# Set environment variables
vercel env add VITE_PUBLIC_URL
vercel env add VITE_SUPABASE_URL
vercel env add VITE_SUPABASE_ANON_KEY
```

## Step 3: Connect Custom Domain

1. **In Vercel Dashboard** → Go to your project
2. **Go to Settings** → **Domains**
3. **Add Domain:** `souq-trablous.com`
4. **Add Domain:** `www.souq-trablous.com`
5. **Vercel will provide DNS records** - update these in Namecheap

## Step 4: Update Supabase Configuration

### In your Supabase project:

1. **Go to Settings** → **API**
2. **Add to Site URL:** `https://souq-trablous.com`
3. **Add to Redirect URLs:**
   - `https://souq-trablous.com`
   - `https://souq-trablous.com/auth/callback`
   - `https://souq-trablous.com/public/customer-statement/*`

## Step 5: Test Deployment

### Test URLs:
- **Main App:** https://souq-trablous.com
- **Customer Statement:** https://souq-trablous.com/public/customer-statement/[customer-id]/[bill-id]
- **QR Code Test:** Generate a receipt and scan the QR code

### Test Checklist:
- [ ] Main app loads correctly
- [ ] Authentication works
- [ ] POS functionality works
- [ ] QR codes generate correct URLs
- [ ] Customer statement pages load
- [ ] Mobile responsive design works

## Step 6: SSL Certificate

✅ **Vercel automatically provides SSL certificates** - no additional setup needed!

## Step 7: Production Environment Variables

Create a `.env.production` file (don't commit to git):

```env
VITE_PUBLIC_URL=https://souq-trablous.com
VITE_SUPABASE_URL=your-actual-supabase-url
VITE_SUPABASE_ANON_KEY=your-actual-supabase-anon-key
```

## Alternative Hosting Options

### Netlify
- Similar to Vercel
- Good for static sites
- Automatic SSL

### Your Own Server
- More control but requires server management
- Need to configure Nginx/Apache
- Need to set up SSL certificate (Let's Encrypt)

## Troubleshooting

### Common Issues:

1. **QR codes show localhost URLs:**
   - Check `VITE_PUBLIC_URL` environment variable
   - Rebuild and redeploy

2. **CORS errors:**
   - Update Supabase site URLs
   - Check redirect URLs

3. **Domain not loading:**
   - Check DNS propagation (can take 24-48 hours)
   - Verify DNS records in Namecheap

4. **SSL certificate issues:**
   - Vercel handles this automatically
   - Wait a few minutes after domain connection

## Next Steps After Deployment

1. **Update QR codes** - They will now point to your domain
2. **Test all functionality** - POS, printing, customer statements
3. **Set up monitoring** - Vercel provides basic analytics
4. **Configure backups** - Ensure Supabase backups are enabled

## Support

If you encounter issues:
1. Check Vercel deployment logs
2. Check browser console for errors
3. Verify environment variables
4. Test locally with production build: `npm run build:production && npm run preview`

---

**Domain:** souq-trablous.com  
**Status:** Ready for deployment  
**Last Updated:** October 19, 2025
