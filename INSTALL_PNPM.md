# Installing pnpm on Windows

## Quick Install (Recommended)

### Option 1: Using npm (Easiest)

```powershell
npm install -g pnpm
```

### Option 2: Using PowerShell (Standalone)

```powershell
iwr https://get.pnpm.io/install.ps1 -useb | iex
```

After installation, **restart your terminal** or PowerShell window.

### Option 3: Using Chocolatey (If you have it)

```powershell
choco install pnpm
```

## Verify Installation

After installing, verify it works:

```powershell
pnpm --version
```

You should see something like: `8.15.0` or similar.

## Alternative: Use npm Workspaces Instead

If you prefer not to install pnpm, you can use npm workspaces instead. I'll help you set that up!

