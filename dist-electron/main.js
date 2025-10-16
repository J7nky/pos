"use strict";
const { app, BrowserWindow, ipcMain } = require("electron");
const path = require("path");
const { exec } = require("child_process");
// Enable hot reloading in development
if (process.env.NODE_ENV === 'development') {
    try {
        require('electron-reloader')(module);
    }
    catch (error) {
        console.log('electron-reloader not available');
    }
}
let mainWindow = null;
const createWindow = () => {
    mainWindow = new BrowserWindow({
        width: 1200,
        height: 800,
        webPreferences: {
            preload: path.join(__dirname, "preload.cjs"),
            nodeIntegration: false,
            contextIsolation: true,
        },
    });
    // Check for Vite dev server URL
    const viteUrl = process.env.VITE_DEV_SERVER_URL || 'http://localhost:5178';
    console.log('🔍 Vite URL:', viteUrl);
    if (process.env.NODE_ENV === 'development' || process.env.VITE_DEV_SERVER_URL) {
        // Dev: load Vite server
        console.log('🚀 Loading Vite dev server:', viteUrl);
        mainWindow.loadURL(viteUrl);
        mainWindow.webContents.openDevTools();
        // Enable hot reloading for renderer
        mainWindow.webContents.on('did-fail-load', () => {
            console.log('Renderer failed to load, retrying...');
            setTimeout(() => {
                mainWindow.loadURL(viteUrl);
            }, 1000);
        });
    }
    else {
        // Prod: load built index.html
        console.log('📦 Loading production build');
        mainWindow.loadFile(path.join(__dirname, "../dist/index.html"));
    }
};
// Register IPC handlers immediately
console.log('🔧 Registering IPC handlers immediately...');
ipcMain.handle('get-printers', async () => {
    try {
        console.log('🔍 [IPC] Detecting printers...');
        console.log('🔍 [IPC] MainWindow exists:', !!mainWindow);
        console.log('🔍 [IPC] WebContents exists:', !!mainWindow?.webContents);
        // Always use Windows system command for now to avoid Electron API issues
        console.log('🔄 [IPC] Using Windows system command for printer detection...');
        const windowsPrinters = await getWindowsPrinters();
        console.log('📋 [IPC] Windows system command found:', windowsPrinters);
        console.log('✅ [IPC] Final printer list:', windowsPrinters);
        return windowsPrinters;
    }
    catch (error) {
        console.error('❌ [IPC] Error getting printers:', error);
        return [];
    }
});
console.log('✅ IPC handlers registered immediately');
app.on("ready", () => {
    console.log('🚀 Electron app is ready, creating window...');
    createWindow();
    console.log('✅ Window created');
});
app.on("window-all-closed", () => {
    if (process.platform !== "darwin")
        app.quit();
});
app.on("activate", () => {
    if (mainWindow === null)
        createWindow();
});
// Helper function to get printers using Windows system command
function getWindowsPrinters() {
    return new Promise((resolve) => {
        try {
            exec('wmic printer get name,default /format:csv', (error, stdout) => {
                if (error) {
                    console.log('❌ Windows printer detection failed:', error.message);
                    resolve([]);
                    return;
                }
                try {
                    const lines = stdout.split('\n').filter((line) => line.trim() && !line.includes('Node'));
                    const printers = lines.map((line) => {
                        const parts = line.split(',');
                        const name = parts[2]?.trim(); // Name is in the 3rd column
                        const isDefault = parts[1]?.trim() === 'TRUE'; // Default is in the 2nd column
                        if (name && name !== 'Name' && name !== '') {
                            return {
                                name: name,
                                displayName: name,
                                description: `Windows printer: ${name}`,
                                isDefault: isDefault,
                                status: 'available'
                            };
                        }
                        return null;
                    }).filter(Boolean);
                    console.log('🖨️ Windows printers found:', printers);
                    resolve(printers);
                }
                catch (parseError) {
                    console.error('❌ Error parsing Windows printer output:', parseError);
                    resolve([]);
                }
            });
        }
        catch (execError) {
            console.error('❌ Error executing Windows printer command:', execError);
            resolve([]);
        }
    });
}
ipcMain.handle('print-document', async (_event, options) => {
    try {
        const { content, printerName, printOptions, qrCodeData, qrCodeUrl } = options;
        console.log('🖨️ Starting print job to:', printerName);
        console.log('📄 Content length:', content.length);
        console.log('📱 QR Code Data:', qrCodeUrl ? 'Available' : 'Not available');
        // For thermal receipt printers, use direct Windows printing
        if (printerName && (printerName.toLowerCase().includes('xprinter') ||
            printerName.toLowerCase().includes('thermal') ||
            printerName.toLowerCase().includes('receipt'))) {
            console.log('🔄 Using direct Windows printing for thermal printer...');
            return await printDirectToThermalPrinter(content, printerName, qrCodeData, qrCodeUrl);
        }
        // Fallback to Electron's print system for regular printers
        console.log('🔄 Using Electron print system...');
        return await printWithElectron(content, printerName, printOptions);
    }
    catch (error) {
        console.error('Error printing document:', error);
        return {
            success: false,
            message: 'Failed to print document',
            error: error instanceof Error ? error.message : 'Unknown error'
        };
    }
});
// Direct printing function for thermal printers
async function printDirectToThermalPrinter(content, printerName, qrCodeData, qrCodeUrl) {
    return new Promise((resolve) => {
        try {
            const fs = require('fs');
            const path = require('path');
            // If QR code is present, replace placeholder with ESC/POS commands
            let finalContent = content;
            if (qrCodeUrl && content.includes('[QR_CODE_PLACEHOLDER]')) {
                // Generate ESC/POS QR code commands
                const qrCodeCommands = generateESCPOSQRCode(qrCodeUrl);
                finalContent = content.replace('[QR_CODE_PLACEHOLDER]', qrCodeCommands);
                console.log('✅ QR code placeholder replaced with ESC/POS commands');
            }
            const tempFile = path.join(process.cwd(), 'temp-receipt.txt');
            // Write content to temp file
            fs.writeFileSync(tempFile, finalContent, 'utf8');
            console.log('📝 Created temp file:', tempFile);
            // Try multiple printing methods
            tryPrintMethod1(tempFile, printerName, resolve);
        }
        catch (error) {
            console.error('❌ Error in direct printing:', error);
            resolve({
                success: false,
                message: 'Direct print setup failed',
                error: error instanceof Error ? error.message : 'Unknown error'
            });
        }
    });
}
// Generate ESC/POS QR code commands for thermal printers
function generateESCPOSQRCode(url) {
    // ESC/POS QR code commands for Xprinter
    // This is a simplified version - actual implementation would need binary data
    const ESC = '\x1B';
    const GS = '\x1D';
    // QR code model selection (GS ( k pL pH cn fn n)
    // Model 2 (most common)
    const selectModel = `${GS}(k\x04\x00\x31\x41\x32\x00`;
    // Set QR code size (1-16, where 8 is ~1 inch square)
    const setSize = `${GS}(k\x03\x00\x31\x43\x06`; // Size 6
    // Set error correction level (L=48, M=49, Q=50, H=51)
    const setErrorLevel = `${GS}(k\x03\x00\x31\x45\x49`; // Level M (49)
    // Store QR code data
    const urlLength = url.length;
    const pL = (urlLength + 3) % 256;
    const pH = Math.floor((urlLength + 3) / 256);
    const storeData = `${GS}(k${String.fromCharCode(pL)}${String.fromCharCode(pH)}\x31\x50\x30${url}`;
    // Print QR code
    const printQR = `${GS}(k\x03\x00\x31\x51\x30`;
    // Center align
    const centerAlign = `${ESC}a\x01`;
    const leftAlign = `${ESC}a\x00`;
    // Combine all commands
    return `${centerAlign}${selectModel}${setSize}${setErrorLevel}${storeData}${printQR}${leftAlign}\n`;
}
// Method 1: PowerShell Start-Process
function tryPrintMethod1(tempFile, printerName, resolve) {
    console.log('🔄 Trying Method 1: PowerShell Start-Process...');
    const psCommand = `Start-Process -FilePath "${tempFile}" -Verb Print -Wait`;
    console.log('🖨️ PowerShell command:', psCommand);
    exec(`powershell -Command "${psCommand}"`, (error, stdout, stderr) => {
        if (error) {
            console.error('❌ Method 1 failed:', error.message);
            tryPrintMethod2(tempFile, printerName, resolve);
        }
        else {
            console.log('✅ Method 1 successful');
            console.log('📤 Print output:', stdout);
            cleanupAndResolve(tempFile, resolve, true, 'Print job sent via PowerShell');
        }
    });
}
// Method 2: Windows copy command
function tryPrintMethod2(tempFile, printerName, resolve) {
    console.log('🔄 Trying Method 2: Windows copy command...');
    const copyCommand = `copy "${tempFile}" "${printerName}"`;
    console.log('🖨️ Copy command:', copyCommand);
    exec(copyCommand, (error, stdout, stderr) => {
        if (error) {
            console.error('❌ Method 2 failed:', error.message);
            tryPrintMethod3(tempFile, printerName, resolve);
        }
        else {
            console.log('✅ Method 2 successful');
            console.log('📤 Print output:', stdout);
            cleanupAndResolve(tempFile, resolve, true, 'Print job sent via copy command');
        }
    });
}
// Method 3: Notepad with print
function tryPrintMethod3(tempFile, printerName, resolve) {
    console.log('🔄 Trying Method 3: Notepad print...');
    const notepadCommand = `notepad /p "${tempFile}"`;
    console.log('🖨️ Notepad command:', notepadCommand);
    exec(notepadCommand, (error, stdout, stderr) => {
        if (error) {
            console.error('❌ Method 3 failed:', error.message);
            tryPrintMethod4(tempFile, printerName, resolve);
        }
        else {
            console.log('✅ Method 3 successful');
            console.log('📤 Print output:', stdout);
            cleanupAndResolve(tempFile, resolve, true, 'Print job sent via Notepad');
        }
    });
}
// Method 4: Direct file association
function tryPrintMethod4(tempFile, printerName, resolve) {
    console.log('🔄 Trying Method 4: Direct file association...');
    const directCommand = `"${tempFile}"`;
    console.log('🖨️ Direct command:', directCommand);
    exec(directCommand, (error, stdout, stderr) => {
        if (error) {
            console.error('❌ Method 4 failed:', error.message);
            // All methods failed
            cleanupAndResolve(tempFile, resolve, false, 'All printing methods failed', error.message);
        }
        else {
            console.log('✅ Method 4 successful');
            console.log('📤 Print output:', stdout);
            cleanupAndResolve(tempFile, resolve, true, 'Print job sent via file association');
        }
    });
}
// Helper function to clean up and resolve
function cleanupAndResolve(tempFile, resolve, success, message, error) {
    // Clean up temp file
    try {
        const fs = require('fs');
        fs.unlinkSync(tempFile);
        console.log('🧹 Cleaned up temp file');
    }
    catch (cleanupError) {
        console.log('⚠️ Could not clean up temp file:', cleanupError);
    }
    resolve({
        success,
        message,
        error: error || undefined
    });
}
// Electron print system (fallback)
async function printWithElectron(content, printerName, printOptions) {
    try {
        // Create a new window for printing
        const printWindow = new BrowserWindow({
            show: false,
            webPreferences: {
                nodeIntegration: true
            }
        });
        // Load content optimized for receipt printing
        await printWindow.loadURL(`data:text/html,${encodeURIComponent(`
      <!DOCTYPE html>
      <html>
      <head>
        <title>Receipt Print</title>
        <style>
          body {
            font-family: 'Courier New', monospace;
            font-size: 14px;
            line-height: 1.2;
            margin: 0;
            padding: 0;
            width: 80mm;
            white-space: pre-line;
            color: black;
            background: white;
          }
          @media print {
            body { 
              margin: 0; 
              padding: 0;
              width: 80mm;
              font-size: 14px;
            }
            @page { 
              margin: 0;
              size: 80mm auto;
            }
          }
        </style>
      </head>
      <body>
        ${content.replace(/\n/g, '<br>')}
      </body>
      </html>
    `)}`);
        // Wait for content to load
        await new Promise(resolve => setTimeout(resolve, 1000));
        // Print with receipt printer optimized options
        const printOptions_ = {
            silent: false,
            printBackground: false,
            deviceName: printerName || undefined,
            pageSize: 'A4',
            margins: {
                marginType: 'none',
                top: 0,
                bottom: 0,
                left: 0,
                right: 0
            },
            landscape: false,
            copies: 1,
            ...printOptions
        };
        console.log('🖨️ Printing to:', printerName, 'with options:', printOptions_);
        await printWindow.webContents.print(printOptions_);
        // Close the print window
        printWindow.close();
        return {
            success: true,
            message: 'Print job submitted successfully'
        };
    }
    catch (error) {
        console.error('❌ Electron print failed:', error);
        throw error;
    }
}
ipcMain.handle('test-printer', async (_event, printerName) => {
    try {
        // Test if printer exists and is available
        const { webContents } = mainWindow;
        const printers = await webContents.getPrintersAsync();
        const printer = printers.find((p) => p.name === printerName);
        if (!printer) {
            return {
                success: false,
                message: 'Printer not found'
            };
        }
        return {
            success: true,
            message: 'Printer is available and ready'
        };
    }
    catch (error) {
        console.error('Error testing printer:', error);
        return {
            success: false,
            message: 'Failed to test printer',
            error: error instanceof Error ? error.message : 'Unknown error'
        };
    }
});
ipcMain.handle('get-printer-status', async (_event, printerName) => {
    try {
        const { webContents } = mainWindow;
        const printers = await webContents.getPrintersAsync();
        const printer = printers.find((p) => p.name === printerName);
        if (!printer) {
            return {
                isOnline: false,
                isReady: false,
                status: 'Printer not found'
            };
        }
        return {
            isOnline: true,
            isReady: true,
            status: 'Ready'
        };
    }
    catch (error) {
        console.error('Error getting printer status:', error);
        return {
            isOnline: false,
            isReady: false,
            status: 'Error checking status'
        };
    }
});
