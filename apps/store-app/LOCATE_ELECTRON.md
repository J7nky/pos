# How to Locate the Electron Executable

## Quick Method

Run the helper script:
```bash
node apps/store-app/find-electron.js
```

Or from the store-app directory:
```bash
cd apps/store-app
node find-electron.js
```

## Manual Location Methods

### Method 1: Using PowerShell

```powershell
# Find all electron.exe files
Get-ChildItem -Path "node_modules" -Recurse -Filter "electron.exe" -ErrorAction SilentlyContinue | Select-Object FullName

# Check pnpm location specifically
Test-Path "node_modules\.pnpm\electron@38.5.0\node_modules\electron\dist\electron.exe"
```

### Method 2: Using Node.js

```javascript
const fs = require('fs');
const path = require('path');

// Check common locations
const locations = [
  'node_modules/electron/dist/electron.exe',
  'node_modules/.pnpm/electron@38.5.0/node_modules/electron/dist/electron.exe',
];

locations.forEach(loc => {
  if (fs.existsSync(loc)) {
    console.log('Found:', loc);
  }
});
```

### Method 3: Check Electron's path.txt

The Electron package uses a `path.txt` file to locate the executable:

```powershell
# Check if path.txt exists
Get-Content "node_modules\.pnpm\electron@38.5.0\node_modules\electron\path.txt"

# The content should be: electron.exe
```

## Expected Locations

### For pnpm (workspace):
```
node_modules/.pnpm/electron@38.5.0/node_modules/electron/dist/electron.exe
```

### For npm:
```
node_modules/electron/dist/electron.exe
```

### For yarn:
```
node_modules/electron/dist/electron.exe
```

## If Electron is Missing

If the executable is not found, you need to:

1. **Download Electron binary:**
   ```bash
   npx --yes electron-download@latest --version=38.5.0 --platform=win32 --arch=x64
   ```

2. **Extract the zip file:**
   The zip will be downloaded to: `%LOCALAPPDATA%\electron\Cache\electron-v38.5.0-win32-x64.zip`
   
   Extract it to: `node_modules\.pnpm\electron@38.5.0\node_modules\electron\dist\`

3. **Create path.txt:**
   ```powershell
   "electron.exe" | Out-File -FilePath "node_modules\.pnpm\electron@38.5.0\node_modules\electron\path.txt" -Encoding ASCII -NoNewline
   ```

## Using the dev-windows.js Script

The `dev-windows.js` script automatically searches for Electron in multiple locations:

1. `apps/store-app/node_modules/electron/dist/electron.exe`
2. `node_modules/.pnpm/electron@38.5.0/node_modules/electron/dist/electron.exe` (root)
3. `process.cwd()/node_modules/.pnpm/electron@38.5.0/node_modules/electron/dist/electron.exe`

If none are found, it falls back to using `npx electron`.

## Environment Variable Override

You can also set an environment variable to override the Electron path:

```powershell
$env:ELECTRON_OVERRIDE_DIST_PATH = "C:\path\to\electron\dist"
```

This will make Electron use that path instead of looking in node_modules.

