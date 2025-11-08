# Development Troubleshooting Guide

## 🚨 Common Issues and Solutions

### Issue 1: `electron-reloader` not recognized
**Error:** `'electron-reloader' is not recognized as an internal or external command`

**Solutions:**
1. Use the Windows-specific development script:
   ```bash
   npm run dev
   ```
   (This uses `dev-windows.js` which handles Windows path issues)

2. Or use the simple development script:
   ```bash
   npm run dev:simple
   ```

3. If you want to use the advanced script, install globally:
   ```bash
   npm install -g electron-reloader
   ```

### Issue 2: Port conflicts
**Error:** `Port 5173 is in use, trying another one...`

**Solutions:**
1. Kill processes using the port:
   ```bash
   npx kill-port 5173
   npx kill-port 5174
   npx kill-port 5175
   ```

2. Or change the port in `vite.config.ts`:
   ```typescript
   server: {
     port: 5176, // Use a different port
   }
   ```

### Issue 3: Node.js version warning
**Warning:** `You are using Node.js 22.3.0. Vite requires Node.js version 20.19+ or 22.12+`

**Solutions:**
1. Update Node.js to version 22.12+ or 20.19+
2. Or ignore the warning (it usually still works)

### Issue 4: Electron not starting
**Error:** Electron window doesn't open

**Solutions:**
1. Check if Vite is running on the correct port:
   ```bash
   curl http://localhost:5175
   ```

2. Rebuild Electron main process:
   ```bash
   npm run build:electron
   ```

3. Check for TypeScript errors:
   ```bash
   npm run build:electron
   ```

### Issue 5: Hot reloading not working
**Issue:** Changes don't reflect automatically

**Solutions:**
1. **React components:** Should work automatically with Vite
2. **Electron main process:** Restarts automatically when you change files in `electron/`
3. **If neither works:** Restart the development server:
   ```bash
   npm run dev
   ```

## 🔧 Development Scripts Explained

| Script | Description | Best For |
|--------|-------------|----------|
| `npm run dev` | Windows-optimized development | Windows users |
| `npm run dev:simple` | Simple file watching | Cross-platform |
| `npm run dev:advanced` | Full electron-reloader setup | Advanced users |
| `npm run vite:dev` | Vite only | React-only development |
| `npm run build:electron` | Build Electron main process | Manual builds |

## 🐛 Debugging Steps

### 1. Check if processes are running
```bash
# Check Vite
curl http://localhost:5175

# Check if Electron is running
tasklist | findstr electron
```

### 2. Check logs
- **Vite logs:** Terminal output
- **Electron logs:** Terminal output + DevTools console
- **Build errors:** Terminal output during `npm run build:electron`

### 3. Clean and restart
```bash
# Stop all processes (Ctrl+C)
# Clean build
rm -rf dist-electron
npm run build:electron

# Restart development
npm run dev
```

### 4. Check file permissions
- Ensure you have write permissions to the project directory
- Check if antivirus is blocking file watching

## 📝 Development Workflow

### For React Development
1. Use `npm run dev` (includes Vite)
2. Edit files in `src/`
3. Changes appear instantly in browser

### For Electron Development
1. Use `npm run dev` (includes file watching)
2. Edit files in `electron/`
3. Electron restarts automatically

### For Full-Stack Development
1. Use `npm run dev` (includes both)
2. Edit any file
3. Appropriate hot reloading happens automatically

## 🚀 Quick Fixes

### Reset Everything
```bash
# Stop all processes
# Clean everything
rm -rf node_modules dist-electron .env
npm install
npm run setup-dev
npm run dev
```

### Manual Development
```bash
# Terminal 1: Start Vite
npm run vite:dev

# Terminal 2: Start Electron (after Vite is ready)
npm run build:electron
npm run electron
```

### Check Dependencies
```bash
npm list electron-reloader
npm list concurrently
npm list wait-on
```

## 💡 Tips

1. **Use the Windows script** (`npm run dev`) for best Windows compatibility
2. **Check the terminal output** for error messages
3. **Keep DevTools open** to see console errors
4. **Restart if stuck** - sometimes a clean restart fixes issues
5. **Check port availability** before starting development

## 🆘 Still Having Issues?

1. Check the terminal output for specific error messages
2. Try the simple development script: `npm run dev:simple`
3. Use manual development (start Vite and Electron separately)
4. Check if all dependencies are installed: `npm install`
5. Verify Node.js version compatibility

The development environment should work smoothly with these solutions!
























