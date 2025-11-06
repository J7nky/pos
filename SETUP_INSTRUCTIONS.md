# Setup Instructions for Monorepo

## Option 1: Using pnpm (Recommended)

### Step 1: Install pnpm

**Windows PowerShell:**
```powershell
npm install -g pnpm
```

**Or using standalone installer:**
```powershell
iwr https://get.pnpm.io/install.ps1 -useb | iex
```

**After installation, restart your terminal/PowerShell!**

### Step 2: Verify Installation

```powershell
pnpm --version
```

### Step 3: Install Dependencies

```powershell
pnpm install
```

---

## Option 2: Using npm Workspaces (No pnpm needed)

If you don't want to install pnpm, you can use npm workspaces instead:

### Step 1: Replace workspace config

1. **Delete** `pnpm-workspace.yaml`
2. **Rename** `package.json.root` to `package.json` (overwrite existing)
   OR rename `package.json.workspaces` to `package.json` (overwrite existing)

### Step 2: Install Dependencies

```powershell
npm install
```

### Step 3: Update Scripts

The scripts in `package.json.workspaces` use npm workspace syntax:
- `npm run dev --workspace=store-app` instead of `pnpm --filter store-app dev`
- `npm run dev --workspaces` instead of `pnpm --filter "./apps/*" dev`

---

## Option 3: Manual Setup (If workspaces don't work)

If neither pnpm nor npm workspaces work, you can set up manually:

### Step 1: Install Dependencies in Each Package

```powershell
# Install shared package dependencies
cd packages/shared
npm install

# Install admin app dependencies
cd ../../apps/admin-app
npm install

# Install store app dependencies (after moving it)
cd ../store-app
npm install
```

### Step 2: Update Import Paths

In each app's `package.json`, reference shared package using file path:

```json
{
  "dependencies": {
    "@pos-platform/shared": "file:../../packages/shared"
  }
}
```

---

## Which Option Should You Use?

### ✅ Recommended: pnpm
- Fastest installation
- Best monorepo support
- Efficient dependency management
- Already configured in this project

**Installation:**
```powershell
npm install -g pnpm
```

### ✅ Alternative: npm Workspaces
- No additional install needed
- Built into npm
- Good enough for monorepo

**Setup:**
1. Use `package.json.workspaces` instead of `pnpm-workspace.yaml`
2. Use npm commands instead of pnpm

### ⚠️ Last Resort: Manual Setup
- Most work required
- Less efficient
- Only if workspaces don't work

---

## Quick Start (After Installing pnpm)

```powershell
# 1. Install pnpm
npm install -g pnpm

# 2. Restart terminal/PowerShell

# 3. Install all dependencies
pnpm install

# 4. Build shared package
cd packages/shared
pnpm build
cd ../..

# 5. Run admin app
cd apps/admin-app
pnpm dev
```

---

## Troubleshooting

### Issue: "pnpm is not recognized"

**Solution:**
1. Install pnpm: `npm install -g pnpm`
2. **Restart your terminal/PowerShell** (important!)
3. Try again: `pnpm --version`

### Issue: "Command not found" after installing

**Solution:**
- Close and reopen your terminal/PowerShell
- Or add pnpm to PATH manually

### Issue: npm workspaces not working

**Solution:**
- Make sure you're using npm 7+ (check with `npm --version`)
- Update npm: `npm install -g npm@latest`
- Or use pnpm instead

### Issue: Can't install dependencies

**Solution:**
- Make sure Node.js is installed: `node --version`
- Make sure you're in the root directory
- Try deleting `node_modules` and `package-lock.json` first
- Then run install again

---

## Next Steps After Setup

1. ✅ Install pnpm or use npm workspaces
2. ✅ Install dependencies
3. ✅ Build shared package
4. ✅ Test admin app
5. ✅ Move store app (see MONOREPO_MIGRATION_GUIDE.md)

---

## Need Help?

- **pnpm docs**: https://pnpm.io/
- **npm workspaces docs**: https://docs.npmjs.com/cli/v7/using-npm/workspaces
- **Node.js version**: Should be 18+ (`node --version`)

