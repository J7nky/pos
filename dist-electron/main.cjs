"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const electron_1 = require("electron");
const path_1 = __importDefault(require("path"));
const fs_1 = __importDefault(require("fs"));
// Enable hot reload for development
if (process.env.NODE_ENV === 'development' || process.env.VITE_DEV_SERVER_URL) {
    try {
        require('electron-reload')(__dirname, {
            electron: path_1.default.join(__dirname, '..', 'node_modules', '.bin', 'electron'),
            hardResetMethod: 'exit',
            // Watch the dist-electron directory for main process changes
            watchPaths: [
                path_1.default.join(__dirname),
                path_1.default.join(__dirname, '..', 'dist-electron')
            ],
            // Ignore certain files to prevent unnecessary reloads
            ignored: [
                /node_modules/,
                /\.git/,
                /receipts/,
                /\.log$/
            ]
        });
        console.log('Electron reload enabled for development');
    }
    catch (error) {
        console.log('Electron reload not available:', error);
    }
}
let mainWindow = null;
// General printer interface - works like any standard application
let defaultPrinter = null;
const initializePrinter = async () => {
    try {
        console.log('🔍 Initializing printer system...');
        // Get the default printer (like Chrome or any other app does)
        const { exec } = await Promise.resolve().then(() => __importStar(require('child_process')));
        const { promisify } = await Promise.resolve().then(() => __importStar(require('util')));
        const execAsync = promisify(exec);
        try {
            // Get default printer name
            const { stdout } = await execAsync('wmic printer where "Default=True" get Name /format:csv');
            const lines = stdout.split('\n').filter(line => line.trim() && !line.includes('Node'));
            if (lines.length > 1) {
                const printerName = lines[1].split(',')[1]?.trim();
                if (printerName) {
                    defaultPrinter = printerName;
                    console.log(`✅ Default printer found: ${printerName}`);
                    return true;
                }
            }
            // If no default printer, get the first available printer
            console.log('⚠️ No default printer found, looking for any available printer...');
            const { stdout: allPrinters } = await execAsync('wmic printer get Name /format:csv');
            const printerLines = allPrinters.split('\n').filter(line => line.trim() && !line.includes('Node'));
            if (printerLines.length > 1) {
                const printerName = printerLines[1].split(',')[1]?.trim();
                if (printerName) {
                    defaultPrinter = printerName;
                    console.log(`✅ Available printer found: ${printerName}`);
                    return true;
                }
            }
            console.log('❌ No printers found on the system');
            return false;
        }
        catch (error) {
            console.log('❌ Failed to detect printers:', error instanceof Error ? error.message : String(error));
            return false;
        }
    }
    catch (error) {
        console.error('❌ Failed to initialize printer system:', error);
        return false;
    }
};
const createWindow = () => {
    mainWindow = new electron_1.BrowserWindow({
        width: 1200,
        height: 800,
        webPreferences: {
            preload: path_1.default.join(__dirname, "preload.cjs"),
            nodeIntegration: false,
            contextIsolation: true,
            webSecurity: true, // Re-enable web security
            allowRunningInsecureContent: false, // Disable insecure content
        },
        show: false, // Don't show until ready
    });
    // Always open dev tools for debugging
    mainWindow.webContents.openDevTools();
    // Check if we're in development mode
    const isDev = process.env.NODE_ENV === 'development' || process.env.VITE_DEV_SERVER_URL;
    if (isDev) {
        // Dev: load Vite server - try multiple ports
        const ports = [5173, 5174, 5175, 5176, 5177];
        let currentPortIndex = 0;
        const tryLoadDevServer = () => {
            if (currentPortIndex < ports.length && mainWindow && !mainWindow.isDestroyed()) {
                const devUrl = `http://localhost:${ports[currentPortIndex]}`;
                console.log(`Attempting to load development server: ${devUrl}`);
                mainWindow.loadURL(devUrl);
                mainWindow.webContents.openDevTools();
                // If this fails, try the next port
                mainWindow.webContents.once('did-fail-load', () => {
                    console.log(`Failed to load from port ${ports[currentPortIndex]}, trying next port...`);
                    currentPortIndex++;
                    setTimeout(tryLoadDevServer, 1000);
                });
                // If this succeeds, we're good
                mainWindow.webContents.once('did-finish-load', () => {
                    console.log(`Successfully loaded from port ${ports[currentPortIndex]}`);
                });
            }
            else {
                console.log('All development ports failed, falling back to production build');
                const indexPath = path_1.default.join(__dirname, "../dist/index.html");
                console.log('Loading production build from:', indexPath);
                mainWindow?.loadFile(indexPath);
            }
        };
        tryLoadDevServer();
    }
    else {
        // Prod: load built index.html
        const indexPath = path_1.default.join(__dirname, "../dist/index.html");
        console.log('Loading production build from:', indexPath);
        mainWindow.loadFile(indexPath);
    }
};
electron_1.app.on("ready", () => {
    createWindow();
    // Add error handling for window loading
    mainWindow?.webContents.on('did-fail-load', (_, errorCode, errorDescription, validatedURL) => {
        console.error('Failed to load:', errorCode, errorDescription, validatedURL);
        mainWindow?.show(); // Show window even if load failed
    });
    mainWindow?.webContents.on('did-finish-load', () => {
        console.log('Window loaded successfully');
        mainWindow?.show(); // Show window when ready
    });
    // Show window after a timeout as fallback
    setTimeout(() => {
        if (mainWindow && !mainWindow.isVisible()) {
            console.log('Showing window after timeout fallback');
            mainWindow.show();
        }
    }, 3000);
});
// Development-specific handlers
if (process.env.NODE_ENV === 'development' || process.env.VITE_DEV_SERVER_URL) {
    // Handle renderer process reload
    electron_1.ipcMain.handle('reload-renderer', () => {
        if (mainWindow) {
            mainWindow.reload();
        }
    });
    // Handle main process restart
    electron_1.ipcMain.handle('restart-app', () => {
        electron_1.app.relaunch();
        electron_1.app.exit(0);
    });
}
electron_1.app.on("window-all-closed", () => {
    if (process.platform !== "darwin")
        electron_1.app.quit();
});
electron_1.app.on("activate", () => {
    if (mainWindow === null)
        createWindow();
});
// ESC/POS Printer IPC handlers
electron_1.ipcMain.handle('printer:initialize', async () => {
    try {
        const isConnected = await initializePrinter();
        if (isConnected) {
            return { success: true, message: 'ESC/POS printer initialized successfully' };
        }
        else {
            return { success: false, message: 'ESC/POS printer not found or not connected' };
        }
    }
    catch (error) {
        console.error('Printer initialization error:', error);
        return { success: false, message: `Failed to initialize printer: ${error}` };
    }
});
electron_1.ipcMain.handle('printer:print', async (_, text) => {
    try {
        // Always save to file for backup/debugging
        const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
        const filename = `receipt-${timestamp}.txt`;
        const filepath = path_1.default.join(process.cwd(), 'receipts', filename);
        // Ensure receipts directory exists
        const receiptsDir = path_1.default.join(process.cwd(), 'receipts');
        if (!fs_1.default.existsSync(receiptsDir)) {
            fs_1.default.mkdirSync(receiptsDir, { recursive: true });
        }
        fs_1.default.writeFileSync(filepath, text, 'utf8');
        console.log(`Receipt saved to: ${filepath}`);
        // Print using the default printer (like any standard application)
        if (defaultPrinter) {
            try {
                console.log(`🖨️ Printing to default printer: ${defaultPrinter}`);
                const { exec } = await Promise.resolve().then(() => __importStar(require('child_process')));
                const { promisify } = await Promise.resolve().then(() => __importStar(require('util')));
                const execAsync = promisify(exec);
                // Create a temporary file with the receipt text
                const tempFile = path_1.default.join(process.cwd(), 'temp-receipt.txt');
                fs_1.default.writeFileSync(tempFile, text, 'utf8');
                // Print using Windows print command (like Chrome does)
                await execAsync(`print /D:"${defaultPrinter}" "${tempFile}"`);
                // Clean up temp file
                fs_1.default.unlinkSync(tempFile);
                console.log('✅ Receipt sent to printer successfully');
                return { success: true, message: `Receipt printed successfully on ${defaultPrinter}` };
            }
            catch (printError) {
                console.error('❌ Print error:', printError);
                console.log('📁 Falling back to file-only mode');
                return { success: true, message: 'Receipt saved to file (print failed: ' + (printError instanceof Error ? printError.message : String(printError)) + ')' };
            }
        }
        else {
            console.log('⚠️ No printer available, receipt saved to file only');
            return { success: true, message: 'Receipt saved to file (no printer configured)' };
        }
    }
    catch (error) {
        console.error('Error in printer:print handler:', error);
        return { success: false, message: `Failed to print: ${error}` };
    }
});
electron_1.ipcMain.handle('printer:openDrawer', async () => {
    try {
        if (defaultPrinter) {
            try {
                console.log(`💰 Opening cash drawer via ${defaultPrinter}...`);
                const { exec } = await Promise.resolve().then(() => __importStar(require('child_process')));
                const { promisify } = await Promise.resolve().then(() => __importStar(require('util')));
                const execAsync = promisify(exec);
                // Create a temporary file with cash drawer command
                const tempFile = path_1.default.join(process.cwd(), 'temp-drawer.txt');
                const drawerCommand = '\x1B\x70\x00\x19\xFA'; // ESC/POS cash drawer open command
                fs_1.default.writeFileSync(tempFile, drawerCommand, 'utf8');
                // Send to printer
                await execAsync(`print /D:"${defaultPrinter}" "${tempFile}"`);
                // Clean up temp file
                fs_1.default.unlinkSync(tempFile);
                console.log('✅ Cash drawer opened successfully');
                return { success: true, message: 'Cash drawer opened successfully' };
            }
            catch (drawerError) {
                console.error('❌ Cash drawer error:', drawerError);
                return { success: false, message: 'Failed to open cash drawer' };
            }
        }
        else {
            console.log('⚠️ No printer available for cash drawer');
            return { success: false, message: 'No printer available' };
        }
    }
    catch (error) {
        return { success: false, message: `Failed to open cash drawer: ${error}` };
    }
});
electron_1.ipcMain.handle('printer:test', async () => {
    try {
        const testText = 'THERMAL PRINTER TEST\n====================\nIf you can read this,\nyour printer is working!\n\n\n';
        const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
        const filename = `test-${timestamp}.txt`;
        const filepath = path_1.default.join(process.cwd(), 'receipts', filename);
        // Ensure receipts directory exists
        const receiptsDir = path_1.default.join(process.cwd(), 'receipts');
        if (!fs_1.default.existsSync(receiptsDir)) {
            fs_1.default.mkdirSync(receiptsDir, { recursive: true });
        }
        fs_1.default.writeFileSync(filepath, testText, 'utf8');
        console.log(`Test print saved to: ${filepath}`);
        // Print test using default printer
        if (defaultPrinter) {
            try {
                console.log(`🧪 Sending test print to ${defaultPrinter}...`);
                const { exec } = await Promise.resolve().then(() => __importStar(require('child_process')));
                const { promisify } = await Promise.resolve().then(() => __importStar(require('util')));
                const execAsync = promisify(exec);
                // Create a temporary file with the test text
                const tempFile = path_1.default.join(process.cwd(), 'temp-test.txt');
                fs_1.default.writeFileSync(tempFile, testText, 'utf8');
                // Print using Windows print command
                await execAsync(`print /D:"${defaultPrinter}" "${tempFile}"`);
                // Clean up temp file
                fs_1.default.unlinkSync(tempFile);
                console.log('✅ Test print sent successfully');
                return { success: true, message: `Test print completed on ${defaultPrinter}` };
            }
            catch (printError) {
                console.error('❌ Test print error:', printError);
                return { success: true, message: 'Test print saved to file (printer unavailable)' };
            }
        }
        else {
            return { success: true, message: 'Test print saved to file (no printer configured)' };
        }
    }
    catch (error) {
        return { success: false, message: `Test print failed: ${error}` };
    }
});
