# Environment Variables Setup Guide

## Overview

The app is designed to work in **offline mode** by default, but you can enable Supabase sync by setting up environment variables.

## Setup Options

### Option 1: Root-Level .env.local (Recommended for Monorepo)

Create a `.env.local` file in the **root directory** (`pos-1/`):

```bash
# .env.local (in root directory)
VITE_SUPABASE_URL=https://your-project-id.supabase.co
VITE_SUPABASE_ANON_KEY=your-supabase-anon-key-here
VITE_PUBLIC_URL=http://localhost:5175
```

**Both apps will use these variables:**
- Store app: `http://localhost:5175`
- Admin app: `http://localhost:5176`

### Option 2: App-Specific .env.local Files

Create separate `.env.local` files for each app:

**For Store App:**
```bash
# apps/store-app/.env.local
VITE_SUPABASE_URL=https://your-project-id.supabase.co
VITE_SUPABASE_ANON_KEY=your-supabase-anon-key-here
VITE_PUBLIC_URL=http://localhost:5175
```

**For Admin App:**
```bash
# apps/admin-app/.env.local
VITE_SUPABASE_URL=https://your-project-id.supabase.co
VITE_SUPABASE_ANON_KEY=your-supabase-anon-key-here
VITE_PUBLIC_URL=http://localhost:5176
```

## How to Get Your Supabase Credentials

1. **Go to your Supabase project**: https://app.supabase.com
2. **Navigate to Settings** → **API**
3. **Copy the following:**
   - **Project URL** → `VITE_SUPABASE_URL`
   - **anon/public key** → `VITE_SUPABASE_ANON_KEY`

## Quick Setup

1. **Copy the example file:**
   ```powershell
   Copy-Item .env.local.example .env.local
   ```

2. **Edit `.env.local`** and add your Supabase credentials:
   ```bash
   VITE_SUPABASE_URL=https://your-project-id.supabase.co
   VITE_SUPABASE_ANON_KEY=your-anon-key-here
   ```

3. **Restart your dev server:**
   ```powershell
   # Stop the current server (Ctrl+C)
   # Then restart:
   cd apps/store-app
   pnpm dev
   ```

## Environment Variables Reference

### Required for Supabase Sync

| Variable | Description | Example |
|----------|-------------|---------|
| `VITE_SUPABASE_URL` | Your Supabase project URL | `https://abc123.supabase.co` |
| `VITE_SUPABASE_ANON_KEY` | Your Supabase anonymous key | `eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...` |

### Optional

| Variable | Description | Default |
|----------|-------------|---------|
| `VITE_PUBLIC_URL` | Public URL for QR codes | `http://localhost:5175` |

## Offline Mode vs Online Mode

### Offline Mode (No .env.local)
- ✅ App works fully offline
- ✅ All data stored in IndexedDB
- ✅ No Supabase sync
- ⚠️ Warning messages in console (safe to ignore)

### Online Mode (With .env.local)
- ✅ App works offline
- ✅ Data syncs to Supabase when online
- ✅ Real-time updates
- ✅ Multi-device sync

## Troubleshooting

### Issue: Environment variables not loading

**Solution:**
1. Make sure the file is named `.env.local` (not `.env.local.txt`)
2. Restart your dev server after creating/updating `.env.local`
3. Check that variables start with `VITE_` (required for Vite)

### Issue: Still seeing warnings

**Solution:**
1. Check that `.env.local` is in the correct location:
   - Root level: `pos-1/.env.local` (for both apps)
   - Or app-specific: `apps/store-app/.env.local`
2. Restart the dev server
3. Check that variable names are correct: `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY`

### Issue: CORS errors

**Solution:**
- This is normal when offline - the app handles it gracefully
- If you want to enable Supabase sync, add the environment variables
- Make sure your Supabase project has the correct CORS settings

## Security Notes

⚠️ **Important:**
- Never commit `.env.local` to git (it's in `.gitignore`)
- The `VITE_SUPABASE_ANON_KEY` is safe to expose in client-side code (it's designed for public use)
- Never use your Supabase service role key in the frontend

## Current Status

✅ **App is working in offline mode** - This is expected and safe!

The warning you see is just informational. The app will:
- Work fully offline
- Store all data in IndexedDB
- Sync to Supabase when you add the environment variables

## Next Steps

1. **If you want offline-only mode**: You can ignore the warnings - everything works!
2. **If you want Supabase sync**: Create `.env.local` with your credentials
3. **If you want to test admin app**: Add the same credentials to admin app's `.env.local`

---

**The app is working correctly!** The warning is just letting you know that Supabase sync is disabled. This is fine for development and testing. 🎉

