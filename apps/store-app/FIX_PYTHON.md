# Fixing Python for Electron Native Module Rebuilds

## Problem
`electron-rebuild` needs Python to compile native modules (like `serialport`, `usb`, `canvas`) for Electron. The error shows Python is installed but not accessible from the command line.

## Solutions

### Option 1: Install Python from Microsoft Store (Easiest)
1. Open Microsoft Store
2. Search for "Python 3.11" or "Python 3.12"
3. Install it
4. Restart your terminal
5. Verify: `python --version`

### Option 2: Install Python from python.org
1. Download Python 3.11+ from https://www.python.org/downloads/
2. **Important**: Check "Add Python to PATH" during installation
3. Restart your terminal
4. Verify: `python --version`

### Option 3: Configure Existing Python Installation
If Python is already installed but not in PATH:

```powershell
# Find Python installation
Get-ChildItem -Path "C:\Users\User\AppData\Local\Programs\Python" -Recurse -Filter "python.exe" | Select-Object FullName

# Set environment variable (temporary for current session)
$env:PYTHON = "C:\Users\User\AppData\Local\Programs\Python\Python311\python.exe"

# Or set it permanently
[System.Environment]::SetEnvironmentVariable("PYTHON", "C:\Users\User\AppData\Local\Programs\Python\Python311\python.exe", "User")
```

### Option 4: Skip Native Rebuilds (If Not Needed)
If you don't need `serialport` or other native modules, you can skip the rebuild:

```json
// In package.json, add to electron-builder config:
"build": {
  "npmRebuild": false,
  "electronDownload": {
    "cache": "./.electron-cache"
  }
}
```

### Option 5: Use Prebuilt Binaries
Some packages provide prebuilt binaries that don't require compilation. Check if your native modules have prebuilt versions available.

## Verify Python Installation

After installing/configuring Python:

```powershell
python --version
# Should show: Python 3.11.x or similar

python -c "import sys; print(sys.executable)"
# Should show the Python executable path
```

## Additional Requirements for Windows

You may also need:
- **Visual Studio Build Tools** or **Visual Studio Community** with C++ workload
- **Windows SDK**

Install via:
```powershell
# Using winget
winget install Microsoft.VisualStudio.2022.BuildTools --override "--wait --quiet --add Microsoft.VisualStudio.Workload.VCTools"

# Or download from: https://visualstudio.microsoft.com/downloads/
```

## For This Project

Since you're using `serialport` for printer communication, you'll need Python to rebuild it for Electron. The easiest solution is **Option 1** (Microsoft Store) or **Option 2** (python.org with PATH).

After installing Python, try the build again:
```bash
pnpm run dist:store
```

