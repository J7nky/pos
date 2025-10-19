"use strict";
const { app, BrowserWindow, ipcMain } = require("electron");
const path = require("path");
const { exec } = require("child_process");
const { ThermalPrinter, PrinterTypes } = require("node-thermal-printer");
const fs = require("fs");
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
// Removed duplicate get-printers handler - using the improved version below
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
        console.log('📱 QR Code Data:', qrCodeData ? 'Available' : 'Not available');
        console.log('📱 QR Code URL:', qrCodeUrl ? 'Available' : 'Not available');
        console.log('📱 Content has QR placeholder:', content.includes('[QR_CODE_PLACEHOLDER]'));
        // For thermal receipt printers, use ESC/POS printing
        if (printerName && (printerName.toLowerCase().includes('xprinter') ||
            printerName.toLowerCase().includes('thermal') ||
            printerName.toLowerCase().includes('receipt') ||
            printerName.toLowerCase().includes('pos'))) {
            console.log('🔄 Using ESC/POS thermal printing for:', printerName);
            return await printDirectToThermalPrinter(content, printerName, qrCodeData, qrCodeUrl);
        }
        // Fallback to Electron's print system for regular printers
        console.log('🔄 Using Electron print system for:', printerName);
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
// Direct printing function for thermal printers using ESC/POS
async function printDirectToThermalPrinter(content, printerName, qrCodeData, qrCodeUrl) {
    try {
        console.log('🔄 Using ESC/POS thermal printing...');
        console.log('🖨️ Printer:', printerName);
        console.log('📱 QR Code available:', !!qrCodeData);
        // Try ESC/POS printing first
        try {
            return await printWithESCPOS(content, printerName, qrCodeData, qrCodeUrl);
        }
        catch (escposError) {
            console.log('⚠️ ESC/POS print failed, trying HTML fallback...', escposError);
            // Fallback to HTML-based printing
            const htmlContent = convertTextToHTML(content, qrCodeData, qrCodeUrl);
            try {
                console.log('🔄 Trying Electron print system...');
                return await printWithElectron(htmlContent, printerName, {
                    margins: {
                        marginType: 'none',
                        top: 0,
                        bottom: 0,
                        left: 0,
                        right: 0
                    },
                    printBackground: false,
                    landscape: false,
                    pageSize: {
                        width: 80000, // 80mm in microns (80mm = 80,000 microns)
                        height: 297000 // 297mm in microns (auto-length for thermal)
                    }
                });
            }
            catch (electronError) {
                console.log('⚠️ Electron print failed, trying Windows print fallback...', electronError);
                // Fallback to Windows printing with HTML content
                return await printHTMLWithWindows(htmlContent, printerName);
            }
        }
    }
    catch (error) {
        console.error('❌ Error in thermal printing:', error);
        return {
            success: false,
            message: 'Thermal print failed',
            error: error instanceof Error ? error.message : 'Unknown error'
        };
    }
}
// Print using raw ESC/POS commands directly to Windows printer
async function printWithRawESCPOS(content, printerName, qrCodeData, qrCodeUrl) {
    return new Promise((resolve, reject) => {
        try {
            console.log('🔧 Building raw ESC/POS commands...');
            // ESC/POS command constants
            const ESC = '\x1B';
            const GS = '\x1D';
            const INIT = ESC + '@'; // Initialize printer
            const ALIGN_CENTER = ESC + 'a' + '1';
            const ALIGN_LEFT = ESC + 'a' + '0';
            const BOLD_ON = ESC + 'E' + '1';
            const BOLD_OFF = ESC + 'E' + '0';
            const SIZE_NORMAL = GS + '!' + '\x00';
            const SIZE_DOUBLE = GS + '!' + '\x11';
            const CUT_PAPER = GS + 'V' + '\x00';
            const LINE_FEED = '\n';
            // Build ESC/POS command string
            let escposData = INIT; // Initialize printer
            // Parse receipt content
            const lines = content.split('\n');
            for (const line of lines) {
                const trimmedLine = line.trim();
                // Skip QR code placeholder
                if (trimmedLine === '[QR_CODE_PLACEHOLDER]') {
                    // Print QR code if URL is available
                    if (qrCodeUrl) {
                        console.log('📱 Adding QR code to ESC/POS data:', qrCodeUrl);
                        escposData += ALIGN_CENTER;
                        // QR Code ESC/POS command for EPSON-compatible printers
                        // Model: GS ( k pL pH cn fn n1 n2
                        const qrModel = GS + '(k' + '\x04\x00' + '1A' + '2\x00'; // Set model to 2
                        const qrSize = GS + '(k' + '\x03\x00' + '1C' + '\x06'; // Set cell size to 6
                        const qrErrorCorrection = GS + '(k' + '\x03\x00' + '1E' + '0'; // Error correction M
                        // Store QR data
                        const qrDataLength = qrCodeUrl.length + 3;
                        const pL = String.fromCharCode(qrDataLength % 256);
                        const pH = String.fromCharCode(Math.floor(qrDataLength / 256));
                        const qrStore = GS + '(k' + pL + pH + '1P0' + qrCodeUrl;
                        // Print QR code
                        const qrPrint = GS + '(k' + '\x03\x00' + '1Q' + '0';
                        escposData += qrModel + qrSize + qrErrorCorrection + qrStore + qrPrint;
                        escposData += LINE_FEED + LINE_FEED;
                        escposData += ALIGN_LEFT;
                    }
                    continue;
                }
                // Handle separators
                if (trimmedLine.match(/^=+$/)) {
                    escposData += ALIGN_LEFT + '================================' + LINE_FEED;
                    continue;
                }
                if (trimmedLine.match(/^-+$/)) {
                    escposData += ALIGN_LEFT + '--------------------------------' + LINE_FEED;
                    continue;
                }
                // Handle store name (centered and bold)
                if (trimmedLine.includes('MARKET') || trimmedLine.includes('VEGETABLES')) {
                    escposData += ALIGN_CENTER + BOLD_ON + trimmedLine + BOLD_OFF + LINE_FEED;
                    continue;
                }
                // Handle bill number and date (bold)
                if (trimmedLine.includes('Bill No:') || trimmedLine.includes('Date:')) {
                    escposData += ALIGN_LEFT + BOLD_ON + trimmedLine + BOLD_OFF + LINE_FEED;
                    continue;
                }
                // Handle total balance (bold and larger)
                if (trimmedLine.includes('TOTAL BALANCE:')) {
                    escposData += ALIGN_LEFT + BOLD_ON + SIZE_DOUBLE + trimmedLine + SIZE_NORMAL + BOLD_OFF + LINE_FEED;
                    continue;
                }
                // Handle thank you message (centered and bold)
                if (trimmedLine.includes('Thank You')) {
                    escposData += ALIGN_CENTER + BOLD_ON + trimmedLine + BOLD_OFF + LINE_FEED;
                    continue;
                }
                // Handle QR code section header
                if (trimmedLine.includes('Scan QR code')) {
                    escposData += ALIGN_CENTER + trimmedLine + LINE_FEED;
                    continue;
                }
                // Default: print line as-is
                if (trimmedLine) {
                    escposData += ALIGN_LEFT + trimmedLine + LINE_FEED;
                }
                else {
                    escposData += LINE_FEED;
                }
            }
            // Cut paper
            escposData += LINE_FEED + LINE_FEED + LINE_FEED;
            escposData += CUT_PAPER;
            // Write ESC/POS data to a temporary file
            const tempFile = path.join(process.cwd(), 'temp-receipt-escpos.bin');
            fs.writeFileSync(tempFile, escposData, 'binary');
            console.log('📝 Created ESC/POS temp file:', tempFile);
            // Send to printer using Windows copy command
            // Try multiple printer path formats for maximum compatibility
            const printerPaths = [
                `"\\\\localhost\\${printerName}"`, // Network printer path
                `"${printerName}"`, // Direct printer name
                `"\\\\${printerName}"` // UNC path
            ];
            const copyCommand = `copy /B "${tempFile}" ${printerPaths[0]}`;
            console.log('🖨️ Sending to printer:', copyCommand);
            exec(copyCommand, (error, stdout, stderr) => {
                // Clean up temp file
                try {
                    fs.unlinkSync(tempFile);
                    console.log('🧹 Cleaned up ESC/POS temp file');
                }
                catch (cleanupError) {
                    console.log('⚠️ Could not clean up ESC/POS temp file');
                }
                if (error) {
                    console.error('❌ Raw ESC/POS print failed:', error.message);
                    reject(error);
                }
                else {
                    console.log('✅ Raw ESC/POS print successful');
                    resolve({
                        success: true,
                        message: 'Receipt printed successfully via raw ESC/POS'
                    });
                }
            });
        }
        catch (error) {
            console.error('❌ Raw ESC/POS error:', error);
            reject(error);
        }
    });
}
// Print using ESC/POS commands for proper thermal printing
async function printWithESCPOS(content, printerName, qrCodeData, qrCodeUrl) {
    return new Promise(async (resolve, reject) => {
        try {
            console.log('🔧 Initializing thermal printer with ESC/POS...');
            // Try raw ESC/POS approach first (better Windows compatibility)
            try {
                const result = await printWithRawESCPOS(content, printerName, qrCodeData, qrCodeUrl);
                resolve(result);
                return;
            }
            catch (rawError) {
                console.log('⚠️ Raw ESC/POS failed, trying node-thermal-printer...', rawError);
            }
            // Fallback to node-thermal-printer
            // Initialize thermal printer for Windows
            // On Windows, we need to use the network or file path interface
            const printer = new ThermalPrinter({
                type: PrinterTypes.EPSON, // Most thermal printers use EPSON commands
                interface: `printer:${printerName}`, // Try simple printer name first
                characterSet: 'PC852_LATIN2',
                removeSpecialCharacters: false,
                lineCharacter: "=",
                width: 48, // 80mm paper is typically 48 characters wide
                options: {
                    timeout: 10000
                }
            });
            // Check if printer is connected
            const isConnected = await printer.isPrinterConnected();
            console.log('🔍 Printer connected:', isConnected);
            if (!isConnected) {
                throw new Error('Printer not connected');
            }
            // Parse receipt content and format for thermal printing
            const lines = content.split('\n');
            for (const line of lines) {
                const trimmedLine = line.trim();
                // Skip QR code placeholder - we'll handle it separately
                if (trimmedLine === '[QR_CODE_PLACEHOLDER]') {
                    continue;
                }
                // Handle separators
                if (trimmedLine.match(/^=+$/)) {
                    printer.drawLine();
                    continue;
                }
                if (trimmedLine.match(/^-+$/)) {
                    printer.drawLine();
                    continue;
                }
                // Handle store name (centered and bold)
                if (trimmedLine.includes('MARKET') || trimmedLine.includes('VEGETABLES')) {
                    printer.alignCenter();
                    printer.bold(true);
                    printer.println(trimmedLine);
                    printer.bold(false);
                    continue;
                }
                // Handle bill number and date (bold)
                if (trimmedLine.includes('Bill No:') || trimmedLine.includes('Date:')) {
                    printer.alignLeft();
                    printer.bold(true);
                    printer.println(trimmedLine);
                    printer.bold(false);
                    continue;
                }
                // Handle total balance (bold and larger)
                if (trimmedLine.includes('TOTAL BALANCE:')) {
                    printer.alignLeft();
                    printer.bold(true);
                    printer.setTextSize(1, 1);
                    printer.println(trimmedLine);
                    printer.setTextNormal();
                    printer.bold(false);
                    continue;
                }
                // Handle thank you message (centered and bold)
                if (trimmedLine.includes('Thank You')) {
                    printer.alignCenter();
                    printer.bold(true);
                    printer.println(trimmedLine);
                    printer.bold(false);
                    continue;
                }
                // Handle QR code section header
                if (trimmedLine.includes('Scan QR code')) {
                    printer.alignCenter();
                    printer.println(trimmedLine);
                    // Print QR code if available
                    if (qrCodeData || qrCodeUrl) {
                        try {
                            printer.alignCenter();
                            // If we have QR code data URL, convert it to text and print as QR code
                            if (qrCodeUrl) {
                                console.log('📱 Printing QR code for URL:', qrCodeUrl);
                                // Use ESC/POS QR code command
                                printer.printQR(qrCodeUrl, {
                                    cellSize: 6, // Size of QR code (1-8)
                                    correction: 'M', // Error correction level (L, M, Q, H)
                                    model: 2 // QR code model
                                });
                            }
                            else if (qrCodeData) {
                                // If only data URL is available, extract the URL or use a fallback
                                console.log('📱 QR code data available but no URL');
                                printer.println('QR Code: Please scan with app');
                            }
                        }
                        catch (qrError) {
                            console.error('❌ Error printing QR code:', qrError);
                            printer.println('[QR Code Print Error]');
                        }
                    }
                    continue;
                }
                // Default: print line as-is
                if (trimmedLine) {
                    printer.alignLeft();
                    printer.println(trimmedLine);
                }
                else {
                    printer.newLine();
                }
            }
            // Cut paper
            printer.cut();
            // Execute print
            console.log('🖨️ Executing ESC/POS print...');
            await printer.execute();
            console.log('✅ ESC/POS print successful');
            resolve({
                success: true,
                message: 'Receipt printed successfully via ESC/POS'
            });
        }
        catch (error) {
            console.error('❌ ESC/POS print error:', error);
            reject(error);
        }
    });
}
// Print HTML content using Windows system
async function printHTMLWithWindows(htmlContent, printerName) {
    return new Promise((resolve) => {
        try {
            const fs = require('fs');
            const path = require('path');
            const { exec } = require('child_process');
            // Save HTML content to a temporary file
            const tempFile = path.join(process.cwd(), 'temp-receipt.html');
            fs.writeFileSync(tempFile, htmlContent, 'utf8');
            console.log('📝 Created HTML temp file:', tempFile);
            // Create a plain text version for thermal printer
            const textFile = tempFile.replace('.html', '.txt');
            // Extract just the body content and convert to plain text
            const bodyMatch = htmlContent.match(/<body[^>]*>([\s\S]*?)<\/body>/i);
            let textContent = bodyMatch ? bodyMatch[1] : htmlContent;
            // Remove HTML tags and clean up
            textContent = textContent
                .replace(/<[^>]*>/g, '') // Remove HTML tags
                .replace(/&nbsp;/g, ' ') // Replace HTML entities
                .replace(/&amp;/g, '&')
                .replace(/&lt;/g, '<')
                .replace(/&gt;/g, '>')
                .replace(/&quot;/g, '"')
                .replace(/&#39;/g, "'")
                .replace(/&euro;/g, '€')
                .replace(/&pound;/g, '£')
                .replace(/&dollar;/g, '$')
                .replace(/\s+/g, ' ') // Normalize whitespace
                .replace(/\n\s*\n/g, '\n') // Remove empty lines
                .trim();
            fs.writeFileSync(textFile, textContent, 'utf8');
            console.log('📝 Created text temp file:', textFile);
            // Try multiple Windows printing approaches
            const approaches = [
                // Approach 1: Print text file directly to thermal printer
                `powershell -Command "Get-Content '${textFile}' | Out-Printer -Name '${printerName}'"`,
                // Approach 2: Use copy command to print
                `copy "${textFile}" "\\\\localhost\\${printerName}"`,
                // Approach 3: Use notepad to print text file
                `notepad /p "${textFile}"`,
                // Approach 4: Use type command to print
                `type "${textFile}" > "\\\\localhost\\${printerName}"`,
                // Approach 5: Open in default browser and print
                `start "" "${tempFile}"`
            ];
            let currentApproach = 0;
            const tryNextApproach = () => {
                if (currentApproach >= approaches.length) {
                    console.log('❌ All Windows print approaches failed');
                    resolve({
                        success: false,
                        message: 'All Windows print approaches failed'
                    });
                    return;
                }
                const command = approaches[currentApproach];
                console.log(`🔄 Trying Windows print approach ${currentApproach + 1}:`, command);
                exec(command, (error, stdout, stderr) => {
                    if (error) {
                        console.log(`⚠️ Approach ${currentApproach + 1} failed:`, error.message);
                        currentApproach++;
                        tryNextApproach();
                    }
                    else {
                        console.log(`✅ Approach ${currentApproach + 1} successful`);
                        resolve({
                            success: true,
                            message: `HTML printed successfully via Windows approach ${currentApproach + 1}`
                        });
                    }
                });
            };
            // Clean up temp files after a delay
            setTimeout(() => {
                try {
                    if (fs.existsSync(tempFile)) {
                        fs.unlinkSync(tempFile);
                        console.log('🧹 Cleaned up HTML temp file');
                    }
                    if (fs.existsSync(textFile)) {
                        fs.unlinkSync(textFile);
                        console.log('🧹 Cleaned up text temp file');
                    }
                }
                catch (cleanupError) {
                    console.log('⚠️ Could not clean up temp files');
                }
            }, 10000);
            tryNextApproach();
        }
        catch (error) {
            console.error('❌ Error in Windows HTML printing:', error);
            resolve({
                success: false,
                message: 'Windows HTML print setup failed',
                error: error instanceof Error ? error.message : 'Unknown error'
            });
        }
    });
}
// Convert text receipt to HTML for better printing
function convertTextToHTML(content, qrCodeData, qrCodeUrl) {
    console.log('🔍 QR Code data received:', { qrCodeData: !!qrCodeData, qrCodeUrl, hasPlaceholder: content.includes('[QR_CODE_PLACEHOLDER]') });
    // Replace QR code placeholder with actual QR code image if available
    let htmlContent = content;
    if (qrCodeData && content.includes('[QR_CODE_PLACEHOLDER]')) {
        console.log('✅ Using QR code image data');
        const qrCodeHtml = `
      <div style="text-align: center; margin: 10px 0;">
        <img src="${qrCodeData}" alt="QR Code" style="max-width: 120px; height: auto; border: 1px solid #000;" />
      </div>`;
        htmlContent = content.replace('[QR_CODE_PLACEHOLDER]', qrCodeHtml);
    }
    else if (qrCodeUrl && content.includes('[QR_CODE_PLACEHOLDER]')) {
        console.log('✅ Using QR code URL fallback');
        // Generate QR code using a service if no image data available
        const qrCodeHtml = `
      <div style="text-align: center; margin: 10px 0;">
        <div style="border: 2px solid #000; padding: 10px; display: inline-block; font-family: monospace; font-size: 10px; background: white;">
          QR Code: ${qrCodeUrl}
        </div>
      </div>`;
        htmlContent = content.replace('[QR_CODE_PLACEHOLDER]', qrCodeHtml);
    }
    else if (content.includes('[QR_CODE_PLACEHOLDER]')) {
        console.log('⚠️ No QR code data available, using placeholder');
        // Fallback: show a placeholder
        const qrCodeHtml = `
      <div style="text-align: center; margin: 10px 0;">
        <div style="border: 2px dashed #000; padding: 20px; display: inline-block; font-family: monospace; font-size: 12px; background: #f0f0f0;">
          [QR CODE PLACEHOLDER]
        </div>
      </div>`;
        htmlContent = content.replace('[QR_CODE_PLACEHOLDER]', qrCodeHtml);
    }
    // Convert text to HTML with proper formatting
    const lines = htmlContent.split('\n');
    const htmlLines = lines.map(line => {
        // Handle separators
        if (line.includes('=')) {
            return `<div style="border-top: 1px solid #000; margin: 5px 0;"></div>`;
        }
        if (line.includes('-')) {
            return `<div style="border-top: 1px dashed #000; margin: 3px 0;"></div>`;
        }
        // Handle empty lines
        if (line.trim() === '') {
            return '<div style="height: 5px;"></div>';
        }
        // Handle header (store name)
        if (line.includes('KIWI VEGETABLES MARKET') || line.includes('MARKET')) {
            return `<div style="text-align: center; font-weight: bold; font-size: 16px; margin: 10px 0;">${line.trim()}</div>`;
        }
        // Handle bill number and date
        if (line.includes('Bill No:') || line.includes('Date:')) {
            return `<div style="font-weight: bold; margin: 5px 0;">${line}</div>`;
        }
        // Handle customer info
        if (line.includes('Customer:') || line.includes('Phone:')) {
            return `<div style="margin: 3px 0;">${line}</div>`;
        }
        // Handle item headers
        if (line.includes('ITEM') && line.includes('QTY')) {
            return `<div style="font-weight: bold; border-bottom: 1px solid #000; padding-bottom: 3px; margin: 5px 0;">${line}</div>`;
        }
        // Handle total balance
        if (line.includes('TOTAL BALANCE:')) {
            return `<div style="font-weight: bold; font-size: 14px; border-top: 2px solid #000; padding-top: 5px; margin: 10px 0;">${line}</div>`;
        }
        // Handle thank you message
        if (line.includes('Thank You!') || line.includes('💬')) {
            return `<div style="text-align: center; font-weight: bold; margin: 10px 0;">${line}</div>`;
        }
        // Handle QR code section
        if (line.includes('📱 Scan QR code')) {
            return `<div style="text-align: center; font-size: 12px; margin: 10px 0;">${line}</div>`;
        }
        // Default formatting
        return `<div style="margin: 2px 0; font-family: 'Courier New', monospace;">${line}</div>`;
    });
    return `
    <!DOCTYPE html>
    <html>
    <head>
      <title>Receipt Print</title>
      <style>
        body {
          font-family: 'Courier New', monospace;
          font-size: 10px;
          line-height: 1.1;
          margin: 0;
          padding: 2px;
          width: 80mm;
          max-width: 80mm;
          color: black;
          background: white;
        }
        @media print {
          body { 
            margin: 0; 
            padding: 1px;
            width: 80mm;
            max-width: 80mm;
            font-size: 9px;
            line-height: 1.0;
          }
          @page { 
            margin: 0;
            size: 80mm auto;
          }
        }
      </style>
    </head>
    <body>
      ${htmlLines.join('')}
    </body>
    </html>
  `;
}
// Electron print system (fallback)
async function printWithElectron(content, printerName, printOptions) {
    try {
        // Create a new window for printing
        const printWindow = new BrowserWindow({
            show: false,
            webPreferences: {
                nodeIntegration: true,
                contextIsolation: false
            }
        });
        // Check if content is already HTML or needs conversion
        let htmlContent = content;
        if (!content.includes('<!DOCTYPE html>')) {
            // Convert plain text to HTML
            htmlContent = `
      <!DOCTYPE html>
      <html>
      <head>
        <title>Receipt Print</title>
        <style>
          body {
            font-family: 'Courier New', monospace;
              font-size: 12px;
            line-height: 1.2;
            margin: 0;
              padding: 10px;
            width: 80mm;
            white-space: pre-line;
            color: black;
            background: white;
          }
          @media print {
            body { 
              margin: 0; 
                padding: 5px;
              width: 80mm;
                font-size: 11px;
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
      `;
        }
        // Load the HTML content
        await printWindow.loadURL(`data:text/html,${encodeURIComponent(htmlContent)}`);
        // Wait for content to load
        await new Promise(resolve => setTimeout(resolve, 1500));
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
// Get available printers with better detection
ipcMain.handle('get-printers', async () => {
    try {
        console.log('🔍 Getting available printers...');
        // Use Windows system command for better printer detection
        const printers = await getWindowsPrinters();
        console.log('📋 Found printers:', printers.map((p) => p.name));
        // Try to detect thermal printers specifically
        const thermalPrinters = printers.filter((printer) => printer.name.toLowerCase().includes('xprinter') ||
            printer.name.toLowerCase().includes('thermal') ||
            printer.name.toLowerCase().includes('receipt') ||
            printer.name.toLowerCase().includes('pos') ||
            printer.name.toLowerCase().includes('80mm'));
        console.log('🖨️ Thermal printers found:', thermalPrinters.map((p) => p.name));
        const recommended = thermalPrinters.length > 0 ? thermalPrinters[0].name : printers[0]?.name || 'Default';
        console.log('🎯 Recommended printer:', recommended);
        return {
            success: true,
            printers: printers,
            thermalPrinters: thermalPrinters,
            recommended: recommended
        };
    }
    catch (error) {
        console.error('❌ Error getting printers:', error);
        return {
            success: false,
            error: error instanceof Error ? error.message : 'Unknown error',
            printers: [],
            thermalPrinters: [],
            recommended: 'Default'
        };
    }
});
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
