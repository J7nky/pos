# Development Setup with Hot Reloading

This document explains how to set up and use the development environment with hot reloading for both the React frontend and Electron main process.

## 🚀 Quick Start

1. **Setup Development Environment:**
   ```bash
   npm run setup-dev
   ```

2. **Start Development Server:**
   ```bash
   npm run dev
   ```

## 📁 What's Included

### Hot Reloading Features
- ✅ **React Components**: Automatic reloading when you change `.tsx` files
- ✅ **Electron Main Process**: Automatic reloading when you change `electron/*.ts` files
- ✅ **Styling**: Hot reloading for CSS and Tailwind changes
- ✅ **TypeScript**: Automatic compilation and type checking

### Development Tools
- 🔧 **Vite Dev Server**: Fast HMR for React components
- ⚡ **Electron Reloader**: Hot reloading for Electron main process
- 🛠️ **DevTools**: Automatically opens Chrome DevTools
- 📝 **Source Maps**: Full debugging support

## 🛠️ Available Scripts

| Script | Description |
|--------|-------------|
| `npm run setup-dev` | Initial development environment setup |
| `npm run dev` | Start development server with hot reloading |
| `npm run vite:dev` | Start only Vite dev server |
| `npm run dev:electron` | Start only Electron with hot reloading |
| `npm run build:electron` | Build Electron main process |
| `npm run build` | Build for production |

## 🔧 Configuration Files

### Vite Configuration (`vite.config.ts`)
```typescript
export default defineConfig({
  base: './',
  server: {
    host: true,
    port: 5173,
    hmr: {
      port: 5173,
    },
  },
  // ... other config
});
```

### Electron Main Process (`electron/main.ts`)
- Includes `electron-reloader` for hot reloading
- Development mode detection
- Automatic DevTools opening
- Error handling and retry logic

### Package.json Scripts
- Uses `concurrently` to run multiple processes
- Color-coded output for easy debugging
- Proper process cleanup on exit

## 🐛 Troubleshooting

### Electron Not Reloading
1. Check if `electron-reloader` is installed:
   ```bash
   npm list electron-reloader
   ```

2. Ensure NODE_ENV is set to development:
   ```bash
   echo $NODE_ENV
   # Should output: development
   ```

3. Rebuild Electron main process:
   ```bash
   npm run build:electron
   ```

### React Components Not Reloading
1. Check if Vite dev server is running on port 5173:
   ```bash
   curl http://localhost:5173
   ```

2. Check browser console for HMR errors

3. Restart the development server:
   ```bash
   npm run dev
   ```

### Port Conflicts
If port 5173 is in use:
1. Kill the process using the port:
   ```bash
   npx kill-port 5173
   ```

2. Or change the port in `vite.config.ts`:
   ```typescript
   server: {
     port: 5174, // Change to different port
   }
   ```

## 📝 Development Workflow

### Making Changes
1. **React Components**: Edit files in `src/` - changes appear instantly
2. **Electron Main Process**: Edit files in `electron/` - app restarts automatically
3. **Styling**: Edit CSS or Tailwind classes - styles update immediately
4. **Types**: Edit TypeScript types - compilation happens automatically

### Testing Changes
1. **Printer Functionality**: Use the "Test Printer" card on the Home page
2. **Console Logs**: Check both browser DevTools and terminal output
3. **Error Handling**: Errors are displayed in both console and UI

### Debugging
1. **React**: Use React DevTools in browser
2. **Electron**: Use Chrome DevTools (auto-opened)
3. **Main Process**: Check terminal output for logs
4. **IPC Communication**: Monitor IPC calls in DevTools

## 🔄 Hot Reloading Details

### React Hot Reloading
- Powered by Vite's HMR (Hot Module Replacement)
- Preserves component state during updates
- Fast refresh for functional components
- Automatic CSS updates

### Electron Hot Reloading
- Uses `electron-reloader` package
- Watches `dist-electron/` directory
- Restarts entire Electron app on main process changes
- Preserves renderer process state when possible

### File Watching
- **React**: Watches `src/` directory
- **Electron**: Watches `electron/` directory
- **Build Output**: Watches `dist-electron/` directory

## 🚨 Common Issues

### "Module not found" Errors
- Run `npm run build:electron` to rebuild main process
- Check if all dependencies are installed: `npm install`

### Electron Window Not Opening
- Check if port 5173 is available
- Ensure Vite dev server is running first
- Check terminal for error messages

### Hot Reloading Stops Working
- Restart the development server: `npm run dev`
- Clear node_modules and reinstall: `rm -rf node_modules && npm install`
- Check for file permission issues

## 📊 Performance Tips

### Faster Development
1. Use `npm run vite:dev` for React-only development
2. Use `npm run dev:electron` for Electron-only testing
3. Close DevTools when not needed
4. Use `npm run build:electron` only when needed

### Memory Usage
- Electron app restarts on main process changes (expected)
- React components update in-place (efficient)
- DevTools can be closed to save memory

## 🎯 Next Steps

After setting up development:
1. Test the printer functionality
2. Make changes to see hot reloading in action
3. Check the console for any errors
4. Verify all features work as expected

The development environment is now ready for efficient development with instant feedback on your changes!



























