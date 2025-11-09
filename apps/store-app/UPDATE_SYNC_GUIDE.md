# How to Sync Updates to Client Devices

## Overview

Your Electron app uses `electron-updater` to automatically check for and download updates. The update server is configured at `https://souq-trablous.com/updates/`.

## Current Setup

### Auto-Updater Configuration

The app is already configured in `electron/main.ts`:

- ✅ **Auto-download**: Updates are automatically downloaded when available
- ✅ **Auto-install**: Updates are installed when the app quits
- ✅ **Update checking**: Checks for updates on app startup
- ✅ **Update server**: Configured to `https://souq-trablous.com/updates/`

### How It Works

1. **App starts** → Checks for updates automatically
2. **Update available** → Downloads in background
3. **Download complete** → Shows notification (optional)
4. **App quits** → Installs update automatically
5. **App restarts** → New version is running

## Deployment Workflow

### Step 1: Update Version

Before building, update the version in `package.json`:

```json
{
  "version": "1.0.1"  // Increment this (e.g., 1.0.0 → 1.0.1)
}
```

### Step 2: Build the Application

Build the Electron distribution:

```bash
# From root
pnpm run dist:store

# Or from apps/store-app
cd apps/store-app
pnpm run dist
```

This creates:
- `dist/` - Built React app
- `dist-electron/` - Built Electron main process
- `dist/win-unpacked/` - Unpacked app (for testing)
- `dist/*.exe` - Installer files

### Step 3: Publish Update Files

After building, you need to upload these files to your update server:

**Required files for Windows:**
```
updates/
  ├── latest.yml                    # Update metadata (auto-generated)
  ├── Souq POS Setup 1.0.1.exe     # NSIS installer
  └── Souq POS-1.0.1-full.nupkg    # Update package (for Squirrel.Windows)
```

**File locations after build:**
- `latest.yml` → `apps/store-app/dist/latest.yml`
- Installer → `apps/store-app/dist/Souq POS Setup X.X.X.exe`
- Update package → `apps/store-app/dist/*.nupkg`

### Step 4: Upload to Update Server

Upload the files to `https://souq-trablous.com/updates/`:

```bash
# Example using FTP/SSH
scp apps/store-app/dist/latest.yml user@souq-trablous.com:/var/www/updates/
scp apps/store-app/dist/*.exe user@souq-trablous.com:/var/www/updates/
scp apps/store-app/dist/*.nupkg user@souq-trablous.com:/var/www/updates/
```

Or use your hosting provider's file manager/upload tool.

## Update Server Setup

### Option 1: Static File Hosting

Your update server needs to serve files with proper headers:

**Nginx configuration:**
```nginx
server {
    listen 443 ssl;
    server_name souq-trablous.com;
    
    location /updates/ {
        root /var/www;
        add_header Content-Type application/octet-stream;
        add_header Access-Control-Allow-Origin *;
    }
}
```

**Apache configuration:**
```apache
<Directory "/var/www/updates">
    Options Indexes FollowSymLinks
    AllowOverride None
    Require all granted
    Header set Content-Type "application/octet-stream"
    Header set Access-Control-Allow-Origin "*"
</Directory>
```

### Option 2: Netlify/Static Hosting

If using Netlify or similar:

1. Create a `updates/` folder in your site
2. Upload `latest.yml` and update files
3. Ensure CORS headers are enabled
4. Files should be accessible at `https://souq-trablous.com/updates/latest.yml`

## Client Update Flow

### Automatic Updates (Current Setup)

1. **App launches** → `autoUpdater.checkForUpdatesAndNotify()` runs
2. **Checks server** → Reads `https://souq-trablous.com/updates/latest.yml`
3. **Compares versions** → If server version > app version, download starts
4. **Downloads update** → Progress logged to console
5. **Update ready** → Logged: `[autoUpdater] update-downloaded, will install on quit`
6. **User quits app** → Update installs automatically
7. **App restarts** → New version runs

### Manual Update Check

To add a manual "Check for Updates" button, expose it via IPC:

**In `electron/main.ts`:**
```typescript
ipcMain.handle('check-for-updates', async () => {
  try {
    const result = await autoUpdater.checkForUpdatesAndNotify();
    return { success: true, result };
  } catch (error) {
    return { success: false, error: error.message };
  }
});

ipcMain.handle('quit-and-install', () => {
  autoUpdater.quitAndInstall();
});
```

**In `electron/preload.ts`:**
```typescript
contextBridge.exposeInMainWorld("electronAPI", {
  // ... existing APIs
  checkForUpdates: () => ipcRenderer.invoke('check-for-updates'),
  quitAndInstall: () => ipcRenderer.invoke('quit-and-install'),
});
```

**In React component:**
```typescript
const handleCheckUpdates = async () => {
  const result = await window.electronAPI.checkForUpdates();
  if (result.success) {
    // Show update available notification
  }
};
```

## Version Management

### Semantic Versioning

Follow semantic versioning: `MAJOR.MINOR.PATCH`

- **MAJOR**: Breaking changes (1.0.0 → 2.0.0)
- **MINOR**: New features (1.0.0 → 1.1.0)
- **PATCH**: Bug fixes (1.0.0 → 1.0.1)

### Update Channels

You can set up different update channels:

```json
{
  "build": {
    "publish": [
      {
        "provider": "generic",
        "url": "https://souq-trablous.com/updates/",
        "channel": "latest"  // or "beta", "alpha"
      }
    ]
  }
}
```

## Testing Updates

### 1. Local Testing

```bash
# Build version 1.0.0
# Install and run it

# Update package.json to 1.0.1
# Build again
pnpm run dist:store

# Serve updates locally
cd dist
python -m http.server 8000

# Update package.json publish URL temporarily:
"url": "http://localhost:8000/updates/"
```

### 2. Staging Server

Use a staging URL for testing:
```json
{
  "publish": [
    {
      "provider": "generic",
      "url": "https://staging.souq-trablous.com/updates/"
    }
  ]
}
```

## Troubleshooting

### Updates Not Detected

1. **Check version number**: Ensure new version > current version
2. **Check `latest.yml`**: Verify it's accessible and valid
3. **Check CORS**: Update server must allow cross-origin requests
4. **Check logs**: Look for `[autoUpdater]` messages in console

### Update Download Fails

1. **Check network**: Ensure client can reach update server
2. **Check file permissions**: Update files must be readable
3. **Check file size**: Large files may timeout
4. **Check SSL certificate**: HTTPS must be valid

### Update Install Fails

1. **Check permissions**: App needs write permissions
2. **Check antivirus**: May block update installation
3. **Check file integrity**: Verify `.nupkg` files aren't corrupted

## Best Practices

1. **Always test updates** before deploying to production
2. **Use semantic versioning** consistently
3. **Keep old versions** on server for rollback
4. **Monitor update success** via logging/analytics
5. **Notify users** when updates are available (optional UI)
6. **Support rollback** if critical issues are found

## Advanced: Update Notifications

To show update notifications to users:

```typescript
autoUpdater.on('update-available', (info) => {
  // Send to renderer process
  mainWindow.webContents.send('update-available', {
    version: info.version,
    releaseDate: info.releaseDate
  });
});

autoUpdater.on('update-downloaded', () => {
  // Show notification
  mainWindow.webContents.send('update-downloaded');
});
```

Then in your React app, listen for these events and show a notification UI.

## Summary

**To deploy an update:**

1. ✅ Update version in `package.json`
2. ✅ Build: `pnpm run dist:store`
3. ✅ Upload `latest.yml` and update files to `https://souq-trablous.com/updates/`
4. ✅ Clients will automatically check and download on next app launch
5. ✅ Updates install when app quits

The system is already configured - you just need to build and upload the files!

