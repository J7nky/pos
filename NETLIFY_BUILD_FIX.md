# Netlify Build Fix - Alternative Solutions

## Problem

The build is still failing even after updating the build command. This is likely because:
1. Netlify might not have pnpm installed
2. The base directory configuration might be interfering
3. The paths might not resolve correctly

## Solution Options

### Option 1: Use Root-Level Build (Recommended)

Instead of using base directory, build from the root and specify the output directory.

**In Netlify Dashboard:**
- **Base directory:** (leave empty or set to `.`)
- **Build command:** 
  ```bash
  npm install -g pnpm && pnpm install && pnpm --filter @pos-platform/shared build && pnpm --filter store-app build:netlify
  ```
- **Publish directory:** `apps/store-app/dist`

### Option 2: Use npm with Workspace Commands

If pnpm doesn't work, use npm with workspace commands:

**In Netlify Dashboard:**
- **Base directory:** `apps/store-app`
- **Build command:**
  ```bash
  npm install -g pnpm && cd ../.. && pnpm install && pnpm --filter @pos-platform/shared build && pnpm --filter store-app build:netlify
  ```
- **Publish directory:** `dist`

### Option 3: Install pnpm in Netlify Build Settings

Add pnpm installation to environment or use a build plugin.

**In Netlify Dashboard → Build & Deploy → Build plugins:**
- Add plugin: `@netlify/plugin-pnpm` (if available)

Or add to build command:
```bash
corepack enable && corepack prepare pnpm@latest --activate && pnpm install && pnpm --filter @pos-platform/shared build && pnpm --filter store-app build:netlify
```

### Option 4: Use npm with manual workspace setup

If pnpm continues to fail, use npm:

**In Netlify Dashboard:**
- **Base directory:** `apps/store-app`
- **Build command:**
  ```bash
  cd ../.. && npm install && cd packages/shared && npm run build && cd ../../apps/store-app && npm install && npm run build:netlify
  ```
- **Publish directory:** `dist`

## Recommended: Update netlify.toml

Update `apps/store-app/netlify.toml` to use workspace filters:

```toml
[build]
  base = "."
  publish = "dist"
  command = "npm install -g pnpm && cd ../.. && pnpm install && pnpm --filter @pos-platform/shared build && pnpm --filter store-app build:netlify"
```

Or if base directory is set to root:

```toml
[build]
  base = "."
  publish = "apps/store-app/dist"
  command = "npm install -g pnpm && pnpm install && pnpm --filter @pos-platform/shared build && pnpm --filter store-app build:netlify"
```

