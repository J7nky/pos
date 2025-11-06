# Monorepo Migration Guide

This guide will help you migrate your current POS app to a monorepo structure with a shared package and a new admin app.

## Prerequisites

1. **Install pnpm** (if not already installed):
   ```bash
   npm install -g pnpm
   ```

2. **Backup your current code**:
   ```bash
   git add .
   git commit -m "Backup before monorepo migration"
   ```

## Step 1: Install Dependencies

At the root of the project, run:
```bash
pnpm install
```

This will install dependencies for all packages in the monorepo.

## Step 2: Move Current Store App

1. **Create the apps directory structure**:
   ```bash
   mkdir -p apps/store-app
   ```

2. **Move existing files to store-app**:
   ```bash
   # Move source files
   mv src apps/store-app/src
   mv public apps/store-app/public
   mv index.html apps/store-app/index.html
   mv vite.config.ts apps/store-app/vite.config.ts
   mv tsconfig*.json apps/store-app/
   mv tailwind.config.js apps/store-app/
   mv postcss.config.js apps/store-app/
   mv eslint.config.js apps/store-app/
   mv electron apps/store-app/electron
   mv supabase apps/store-app/supabase
   
   # Move config files
   mv package.json apps/store-app/package.json
   mv netlify.toml apps/store-app/
   mv _redirects apps/store-app/
   ```

3. **Update store-app package.json**:
   - Add dependency: `"@pos-platform/shared": "workspace:*"`

## Step 3: Update Store App to Use Shared Package

Update imports in your store app:

**Before:**
```typescript
import { getTranslatedString } from '../utils/multilingual';
import { generateBillReference } from '../utils/referenceGenerator';
import { Product } from '../types';
```

**After:**
```typescript
import { getTranslatedString, generateBillReference, Product } from '@pos-platform/shared';
```

## Step 4: Build Shared Package

```bash
cd packages/shared
pnpm build
```

## Step 5: Test Store App

```bash
cd apps/store-app
pnpm dev
```

## Step 6: Create Admin App (Already Done)

The admin app skeleton has been created. You can now:

```bash
cd apps/admin-app
pnpm dev
```

## Next Steps

1. **Complete the shared package**:
   - Add more types as needed
   - Add more utilities
   - Add more constants

2. **Build the admin app**:
   - Implement global products management
   - Implement store management
   - Implement subscriptions/payments

3. **Update CI/CD**:
   - Update build scripts
   - Update deployment configs

## Troubleshooting

### Issue: Cannot find module '@pos-platform/shared'

**Solution**: Make sure you've:
1. Built the shared package: `cd packages/shared && pnpm build`
2. Installed dependencies: `pnpm install` at root
3. Added `"@pos-platform/shared": "workspace:*"` to your app's package.json

### Issue: TypeScript errors in shared package

**Solution**: Make sure the shared package has a proper tsconfig.json and is built before using it.

### Issue: Workspace not found

**Solution**: Make sure you have `pnpm-workspace.yaml` at the root with:
```yaml
packages:
  - 'apps/*'
  - 'packages/*'
```

## File Structure After Migration

```
pos-platform/
├── apps/
│   ├── store-app/          # Your current POS app
│   │   ├── src/
│   │   ├── package.json
│   │   └── vite.config.ts
│   │
│   └── admin-app/          # New Super Admin app
│       ├── src/
│       ├── package.json
│       └── vite.config.ts
│
├── packages/
│   └── shared/             # Shared code
│       ├── src/
│       │   ├── types/
│       │   ├── utils/
│       │   └── constants/
│       ├── package.json
│       └── tsconfig.json
│
├── pnpm-workspace.yaml
├── package.json.root        # Root package.json
└── README.md
```

