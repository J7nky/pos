const { app, BrowserWindow, ipcMain } = require("electron");
const path = require("path");
const { exec } = require("child_process");
const { ThermalPrinter, PrinterTypes } = require("node-thermal-printer");
const fs = require("fs");
const iconv = require("iconv-lite");
const { createCanvas } = require("canvas");

// Enable hot reloading in development
if (process.env.NODE_ENV === 'development') {
  try {
    require('electron-reloader')(module);
  } catch (error) {
    console.log('electron-reloader not available');
  }
}

let mainWindow: any = null;

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
  } else {
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
  if (process.platform !== "darwin") app.quit();
});

app.on("activate", () => {
  if (mainWindow === null) createWindow();
});

// Helper function to get printers using Windows system command
function getWindowsPrinters(): Promise<any[]> {
  return new Promise((resolve) => {
    try {
      exec('wmic printer get name,default /format:csv', (error: any, stdout: any) => {
        if (error) {
          console.log('❌ Windows printer detection failed:', error.message);
          resolve([]);
          return;
        }
        
        try {
          const lines = stdout.split('\n').filter((line: any) => line.trim() && !line.includes('Node'));
          const printers = lines.map((line: any) => {
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
        } catch (parseError) {
          console.error('❌ Error parsing Windows printer output:', parseError);
          resolve([]);
        }
      });
    } catch (execError) {
      console.error('❌ Error executing Windows printer command:', execError);
      resolve([]);
    }
  });
}


ipcMain.handle('print-document', async (_event: any, options: any) => {
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
    
  } catch (error) {
    console.error('Error printing document:', error);
    return {
      success: false,
      message: 'Failed to print document',
      error: error instanceof Error ? error.message : 'Unknown error'
    };
  }
});

// Helper function: Render Arabic text to bitmap image
function renderTextToBitmap(text: string, options: any = {}): Buffer {
  const {
    fontSize = 40,
    fontFamily = 'Arial, sans-serif',
    width = 576, // 72mm for 80mm paper (8 dots per mm)
    align = 'right',
    bold = true,
    padding = 10
  } = options;
  
  // Create canvas
  const canvas = createCanvas(width, 100); // Height will be adjusted
  const ctx = canvas.getContext('2d');
  
  // Set font
  ctx.font = `${bold ? 'bold ' : ''}${fontSize}px ${fontFamily}`;
  ctx.fillStyle = 'black';
  ctx.textBaseline = 'top';
  
  // Measure text
  const metrics = ctx.measureText(text);
  const textWidth = metrics.width;
  const textHeight = fontSize * 1.5; // Approximate height with padding
  
  // Resize canvas to fit text
  canvas.height = Math.ceil(textHeight + padding * 2);
  
  // Re-set font after resize (canvas clears on resize)
  ctx.font = `${bold ? 'bold ' : ''}${fontSize}px ${fontFamily}`;
  ctx.fillStyle = 'white';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.fillStyle = 'black';
  ctx.textBaseline = 'top';
  
  // Calculate X position based on alignment
  let x = padding;
  if (align === 'center') {
    x = (width - textWidth) / 2;
  } else if (align === 'right') {
    x = width - textWidth - padding;
  }
  
  // Draw text
  ctx.fillText(text, x, padding);
  
  // Convert to monochrome bitmap
  const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
  const pixels = imageData.data;
  
  // Convert to 1-bit monochrome
  const bytesPerLine = Math.ceil(canvas.width / 8);
  const bitmapData = Buffer.alloc(bytesPerLine * canvas.height);
  
  for (let y = 0; y < canvas.height; y++) {
    for (let x = 0; x < canvas.width; x++) {
      const pixelIndex = (y * canvas.width + x) * 4;
      const r = pixels[pixelIndex];
      const g = pixels[pixelIndex + 1];
      const b = pixels[pixelIndex + 2];
      
      // Convert to grayscale and threshold
      const gray = (r + g + b) / 3;
      const isBlack = gray < 128;
      
      if (isBlack) {
        const byteIndex = y * bytesPerLine + Math.floor(x / 8);
        const bitIndex = 7 - (x % 8);
        bitmapData[byteIndex] |= (1 << bitIndex);
      }
    }
  }
  
  return bitmapData;
}

// Helper function: Create ESC/POS bitmap command
function createBitmapCommand(bitmapData: Buffer, width: number, height: number): Buffer {
  const GS = '\x1D';
  const bytesPerLine = Math.ceil(width / 8);
  
  // GS v 0 command for printing raster bitmap
  // GS v 0 m xL xH yL yH d1...dk
  const xL = bytesPerLine & 0xFF;
  const xH = (bytesPerLine >> 8) & 0xFF;
  const yL = height & 0xFF;
  const yH = (height >> 8) & 0xFF;
  
  const header = Buffer.from([
    0x1D, 0x76, 0x30, 0x00, // GS v 0 m (m=0 for normal, m=1 for double width, m=2 for double height, m=3 for quad)
    xL, xH,  // Width in bytes
    yL, yH   // Height in dots
  ]);
  
  return Buffer.concat([header, bitmapData]);
}

// Test function for image-based Arabic printing
async function testImageBasedArabicPrinting(printerName: string): Promise<any> {
  console.log('');
  console.log('╔════════════════════════════════════════╗');
  console.log('║  IMAGE-BASED ARABIC PRINTING TEST      ║');
  console.log('╚════════════════════════════════════════╝');
  console.log('');
  
  const ESC = '\x1B';
  const GS = '\x1D';
  const INIT = ESC + '@';
  const ALIGN_CENTER = ESC + 'a' + '1';
  const ALIGN_LEFT = ESC + 'a' + '0';
  const CUT_PAPER = GS + 'V' + '\x00';
  const LINE_FEED = '\n';
  
  try {
    // Start ESC/POS data
    let escposData = Buffer.from(INIT, 'binary');
    escposData = Buffer.concat([escposData, Buffer.from(ALIGN_CENTER + 'IMAGE-BASED ARABIC TEST' + LINE_FEED, 'binary')]);
    escposData = Buffer.concat([escposData, Buffer.from('=' .repeat(32) + LINE_FEED + LINE_FEED, 'binary')]);
    escposData = Buffer.concat([escposData, Buffer.from(ALIGN_LEFT, 'binary')]);
    
    // Test texts
    const testTexts = [
      { text: 'مرحبا (Hello)', fontSize: 24, bold: false },
      { text: 'شكراً لك (Thank You)', fontSize: 24, bold: true },
      { text: 'متجر الخضروات', fontSize: 20, bold: false },
      { text: 'الإجمالي: 50.000 ل.ل', fontSize: 22, bold: true },
    ];
    
    for (const testItem of testTexts) {
      console.log(`📝 Rendering: "${testItem.text}" (${testItem.fontSize}px, ${testItem.bold ? 'bold' : 'normal'})`);
      
      // Render text to bitmap
      const bitmapData = renderTextToBitmap(testItem.text, {
        fontSize: testItem.fontSize,
        width: 576, // 80mm paper width
        bold: testItem.bold,
        align: 'left'
      });
      
      // Create bitmap command
      const bitmapCommand = createBitmapCommand(bitmapData, 576, Math.ceil(testItem.fontSize * 1.5 + 20));
      
      // Add to ESC/POS data
      escposData = Buffer.concat([escposData, bitmapCommand]);
      escposData = Buffer.concat([escposData, Buffer.from(LINE_FEED, 'binary')]);
      
      console.log(`✅ Rendered successfully (${bitmapData.length} bytes)`);
    }
    
    // Add footer
    escposData = Buffer.concat([escposData, Buffer.from(LINE_FEED + '=' .repeat(32) + LINE_FEED, 'binary')]);
    escposData = Buffer.concat([escposData, Buffer.from(ALIGN_CENTER + 'End of test' + LINE_FEED, 'binary')]);
    escposData = Buffer.concat([escposData, Buffer.from(LINE_FEED + LINE_FEED + LINE_FEED, 'binary')]);
    escposData = Buffer.concat([escposData, Buffer.from(CUT_PAPER, 'binary')]);
    
    // Write to file
    const tempFile = path.join(process.cwd(), 'temp-arabic-image-test.bin');
    fs.writeFileSync(tempFile, escposData);
    console.log('📝 Created test file:', tempFile);
    console.log('📦 Total size:', escposData.length, 'bytes');
    
    // Send to printer
    const copyCommand = `copy /B "${tempFile}" "\\\\localhost\\${printerName}"`;
    console.log('📤 Sending to printer...');
    
    return new Promise((resolve, reject) => {
      exec(copyCommand, (error: any) => {
        try {
          fs.unlinkSync(tempFile);
        } catch (e) {}
        
        if (error) {
          console.error('❌ Print failed:', error);
          reject(error);
        } else {
          console.log('✅ Image-based Arabic test printed successfully!');
          console.log('📋 Check the receipt - Arabic should be perfectly readable!');
          resolve({ success: true, message: 'Image-based Arabic printing test completed' });
        }
      });
    });
  } catch (error) {
    console.error('❌ Test failed:', error);
    return { success: false, message: 'Test failed', error: error instanceof Error ? error.message : 'Unknown error' };
  }
}

// Test function to print with all code pages for debugging
async function testAllArabicCodePages(printerName: string): Promise<any> {
  console.log('');
  console.log('╔════════════════════════════════════════╗');
  console.log('║  ARABIC CODE PAGE TEST MODE            ║');
  console.log('╚════════════════════════════════════════╝');
  console.log('');
  
  const testText = 'Test Arabic: مرحبا شكرا';
  const ESC = '\x1B';
  const GS = '\x1D';
  const INIT = ESC + '@';
  const ALIGN_CENTER = ESC + 'a' + '1';
  const ALIGN_LEFT = ESC + 'a' + '0';
  const CUT_PAPER = GS + 'V' + '\x00';
  
  const codePagesToTest = [
    { num: 221, hex: '\xDD', name: 'CP221 (Xprinter Arabic!)', encoding: 'win1256' },
    { num: 22, hex: '\x16', name: 'CP22 (Xprinter Arabic Alt)', encoding: 'win1256' },
    { num: 0, hex: '\x00', name: 'CP0 (Default)', encoding: 'utf8' },
    { num: 16, hex: '\x10', name: 'CP16', encoding: 'cp864' },
    { num: 17, hex: '\x11', name: 'CP17', encoding: 'cp864' },
    { num: 28, hex: '\x1C', name: 'CP28', encoding: 'iso-8859-6' },
  ];
  
  let escposData = INIT;
  escposData += ALIGN_CENTER;
  escposData += 'ARABIC CODE PAGE TEST\n';
  escposData += '====================\n\n';
  escposData += ALIGN_LEFT;
  
  for (const cp of codePagesToTest) {
    console.log(`Testing ${cp.name}...`);
    escposData += `\nCode Page ${cp.num} (${cp.name}):\n`;
    escposData += ESC + 't' + cp.hex;  // Set code page
    escposData += testText + '\n';
    escposData += '--------------------\n';
  }
  
  escposData += '\n\n\n';
  escposData += CUT_PAPER;
  
  const tempFile = path.join(process.cwd(), 'temp-test-codepages.bin');
  
  try {
    const dataToWrite = iconv.encode(escposData, 'cp864');
    fs.writeFileSync(tempFile, dataToWrite);
    
    const copyCommand = `copy /B "${tempFile}" "\\\\localhost\\${printerName}"`;
    console.log('📤 Sending test to printer...');
    
    return new Promise((resolve, reject) => {
      exec(copyCommand, (error: any) => {
        try {
          fs.unlinkSync(tempFile);
        } catch (e) {}
        
        if (error) {
          reject(error);
        } else {
          console.log('✅ Test printed! Check which code page shows Arabic correctly.');
          resolve({ success: true, message: 'Code page test completed' });
        }
      });
    });
  } catch (error) {
    console.error('❌ Test failed:', error);
    return { success: false, message: 'Test failed' };
  }
}

// Direct printing function for thermal printers using ESC/POS
async function printDirectToThermalPrinter(content: string, printerName: string, qrCodeData?: string, qrCodeUrl?: string): Promise<any> {
  try {
    console.log('🔄 Using ESC/POS thermal printing...');
    console.log('🖨️ Printer:', printerName);
    console.log('📱 QR Code available:', !!qrCodeData);
    
    // Try ESC/POS printing first
    try {
      return await printWithESCPOS(content, printerName, qrCodeData, qrCodeUrl);
    } catch (escposError) {
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
            width: 80000,   // 80mm in microns (80mm = 80,000 microns)
            height: 297000  // 297mm in microns (auto-length for thermal)
          }
        });
      } catch (electronError) {
        console.log('⚠️ Electron print failed, trying Windows print fallback...', electronError);
        // Fallback to Windows printing with HTML content
        return await printHTMLWithWindows(htmlContent, printerName);
      }
    }
  } catch (error) {
    console.error('❌ Error in thermal printing:', error);
    return {
      success: false,
      message: 'Thermal print failed',
      error: error instanceof Error ? error.message : 'Unknown error'
    };
  }
}

// Print using raw ESC/POS commands directly to Windows printer
async function printWithRawESCPOS(content: string, printerName: string, qrCodeData?: string, qrCodeUrl?: string): Promise<any> {
  return new Promise((resolve, reject) => {
    try {
      console.log('🔧 Building raw ESC/POS commands...');
      
      // ESC/POS command constants
      const ESC = '\x1B';
      const GS = '\x1D';
      const INIT = ESC + '@';  // Initialize printer
      const ALIGN_CENTER = ESC + 'a' + '1';
      const ALIGN_LEFT = ESC + 'a' + '0';
      const BOLD_ON = ESC + 'E' + '1';
      const BOLD_OFF = ESC + 'E' + '0';
      const SIZE_NORMAL = GS + '!' + '\x00';
      const SIZE_DOUBLE = GS + '!' + '\x11';
      const CUT_PAPER = GS + 'V' + '\x00';
      const LINE_FEED = '\n';
      
      // Code page selection for Arabic support
      // Try multiple code pages - Xprinter models vary
      const CODE_PAGES = {
        CP0: { cmd: ESC + 't' + '\x00', name: 'CP0 (USA/Europe)', encoding: 'ascii' },
        CP16: { cmd: ESC + 't' + '\x10', name: 'CP16 (Arabic Alt)', encoding: 'cp864' },
        CP17: { cmd: ESC + 't' + '\x11', name: 'CP17 (CP864)', encoding: 'cp864' },
        CP23: { cmd: ESC + 't' + '\x17', name: 'CP23 (Windows-1256)', encoding: 'win1256' },
        CP28: { cmd: ESC + 't' + '\x1C', name: 'CP28 (Arabic Standard)', encoding: 'iso-8859-6' },
      };
      
      // Check if content contains Arabic characters
      const hasArabic = /[\u0600-\u06FF\u0750-\u077F\u08A0-\u08FF]/.test(content);
      
      // Build ESC/POS command - using Buffer for binary data
      let escposData = Buffer.from(INIT, 'binary');
      
      // Log Arabic detection
      if (hasArabic) {
        console.log('====================================');
        console.log('🖼️ ARABIC TEXT DETECTED - USING IMAGE-BASED RENDERING');
        console.log('====================================');
        
        // Extract Arabic characters for debugging
        const arabicChars = content.match(/[\u0600-\u06FF\u0750-\u077F\u08A0-\u08FF]+/g) || [];
        console.log('📝 Arabic text found:', arabicChars.slice(0, 3).join(', ') + (arabicChars.length > 3 ? '...' : ''));
        console.log('📊 Total Arabic segments:', arabicChars.length);
        console.log('✨ Will render Arabic text as images for perfect display');
      } else {
        console.log('ℹ️  No Arabic text detected, using standard text encoding');
      }
      
      // Parse receipt content
      const lines = content.split('\n');
      
      for (const line of lines) {
        const trimmedLine = line.trim();
        
        // Skip QR code placeholder
        if (trimmedLine === '[QR_CODE_PLACEHOLDER]') {
          // Print QR code if URL is available
          if (qrCodeUrl) {
            console.log('📱 Adding QR code to ESC/POS data:', qrCodeUrl);
            escposData = Buffer.concat([escposData, Buffer.from(ALIGN_CENTER, 'binary')]);
            
            // QR Code ESC/POS command for EPSON-compatible printers
            // Model: GS ( k pL pH cn fn n1 n2
            const qrModel = GS + '(k' + '\x04\x00' + '1A' + '2\x00';  // Set model to 2
            const qrSize = GS + '(k' + '\x03\x00' + '1C' + '\x06';     // Set cell size to 6
            const qrErrorCorrection = GS + '(k' + '\x03\x00' + '1E' + '0';  // Error correction M
            
            // Store QR data
            const qrDataLength = qrCodeUrl.length + 3;
            const pL = String.fromCharCode(qrDataLength % 256);
            const pH = String.fromCharCode(Math.floor(qrDataLength / 256));
            const qrStore = GS + '(k' + pL + pH + '1P0' + qrCodeUrl;
            
            // Print QR code
            const qrPrint = GS + '(k' + '\x03\x00' + '1Q' + '0';
            
            escposData = Buffer.concat([escposData, Buffer.from(qrModel + qrSize + qrErrorCorrection + qrStore + qrPrint, 'binary')]);
            escposData = Buffer.concat([escposData, Buffer.from(LINE_FEED + LINE_FEED + ALIGN_LEFT, 'binary')]);
          }
          continue;
        }
        
        // Check if line contains Arabic
        const lineHasArabic = /[\u0600-\u06FF\u0750-\u077F\u08A0-\u08FF]/.test(trimmedLine);
        
        // Handle separators
        if (trimmedLine.match(/^=+$/)) {
          escposData = Buffer.concat([escposData, Buffer.from(ALIGN_LEFT + '================================' + LINE_FEED, 'binary')]);
          continue;
        }
        
        if (trimmedLine.match(/^-+$/)) {
          escposData = Buffer.concat([escposData, Buffer.from(ALIGN_LEFT + '--------------------------------' + LINE_FEED, 'binary')]);
          continue;
        }
        
        // If line contains Arabic, render as image
        if (lineHasArabic) {
          console.log(`🖼️ Rendering Arabic line as image: "${trimmedLine.substring(0, 50)}${trimmedLine.length > 50 ? '...' : ''}"`);
          
          // Determine styling
          const isCentered = trimmedLine.includes('MARKET') || trimmedLine.includes('VEGETABLES') || trimmedLine.includes('Scan QR code');
          const isBold = trimmedLine.includes('Bill No:') || trimmedLine.includes('Date:') || trimmedLine.includes('TOTAL') || trimmedLine.includes('Thank You');
          const isLarge = trimmedLine.includes('TOTAL BALANCE');
          
          // Render as image
          const bitmapData = renderTextToBitmap(trimmedLine, {
            fontSize: isLarge ? 28 : 22,
            width: 576,
            bold: isBold,
            align: isCentered ? 'center' : 'left'
          });
          
          const bitmapHeight = Math.ceil((isLarge ? 28 : 22) * 1.5 + 20);
          const bitmapCommand = createBitmapCommand(bitmapData, 576, bitmapHeight);
          
          escposData = Buffer.concat([escposData, bitmapCommand]);
          escposData = Buffer.concat([escposData, Buffer.from(LINE_FEED, 'binary')]);
          continue;
        }
        
        // Handle store name (centered and bold)
        if (trimmedLine.includes('MARKET') || trimmedLine.includes('VEGETABLES')) {
          escposData = Buffer.concat([escposData, Buffer.from(ALIGN_CENTER + BOLD_ON + trimmedLine + BOLD_OFF + LINE_FEED, 'binary')]);
          continue;
        }
        
        // Handle bill number and date (bold)
        if (trimmedLine.includes('Bill No:') || trimmedLine.includes('Date:')) {
          escposData = Buffer.concat([escposData, Buffer.from(ALIGN_LEFT + BOLD_ON + trimmedLine + BOLD_OFF + LINE_FEED, 'binary')]);
          continue;
        }
        
        // Handle total balance (bold and larger)
        if (trimmedLine.includes('TOTAL BALANCE:')) {
          escposData = Buffer.concat([escposData, Buffer.from(ALIGN_LEFT + BOLD_ON + SIZE_DOUBLE + trimmedLine + SIZE_NORMAL + BOLD_OFF + LINE_FEED, 'binary')]);
          continue;
        }
        
        // Handle thank you message (centered and bold)
        if (trimmedLine.includes('Thank You')) {
          escposData = Buffer.concat([escposData, Buffer.from(ALIGN_CENTER + BOLD_ON + trimmedLine + BOLD_OFF + LINE_FEED, 'binary')]);
          continue;
        }
        
        // Handle QR code section header
        if (trimmedLine.includes('Scan QR code')) {
          escposData = Buffer.concat([escposData, Buffer.from(ALIGN_CENTER + trimmedLine + LINE_FEED, 'binary')]);
          continue;
        }
        
        // Default: print line as-is
        if (trimmedLine) {
          escposData = Buffer.concat([escposData, Buffer.from(ALIGN_LEFT + trimmedLine + LINE_FEED, 'binary')]);
        } else {
          escposData = Buffer.concat([escposData, Buffer.from(LINE_FEED, 'binary')]);
        }
      }
      
      // Cut paper
      escposData = Buffer.concat([escposData, Buffer.from(LINE_FEED + LINE_FEED + LINE_FEED + CUT_PAPER, 'binary')]);
      
      // Write ESC/POS data to a temporary file
      const tempFile = path.join(process.cwd(), 'temp-receipt-escpos.bin');
      
      // For receipts with Arabic (rendered as images), no encoding needed - already binary
      console.log('');
      console.log('📦 PREPARING RECEIPT DATA...');
      console.log('====================================');
      console.log('📊 Total size:', escposData.length, 'bytes');
      
      if (hasArabic) {
        console.log('✅ Arabic text rendered as images - no encoding needed');
        console.log('🖼️  Receipt contains image-based Arabic text');
      }
      
      // Log hex dump of first 200 bytes for debugging
      console.log('');
      console.log('🔍 HEX DUMP (First 100 bytes):');
      console.log('====================================');
      const hexDump = escposData.slice(0, 100).toString('hex').match(/.{1,2}/g)?.join(' ') || '';
      console.log(hexDump);
      console.log('====================================');
      console.log('');
      
      fs.writeFileSync(tempFile, escposData);
      console.log('📝 Created ESC/POS temp file:', tempFile);
      console.log('✅ Receipt ready for printing');
      
      // Send to printer using Windows copy command
      // Try multiple printer path formats for maximum compatibility
      const printerPaths = [
        `"\\\\localhost\\${printerName}"`,  // Network printer path
        `"${printerName}"`,                  // Direct printer name
        `"\\\\${printerName}"`               // UNC path
      ];
      
      const copyCommand = `copy /B "${tempFile}" ${printerPaths[0]}`;
      console.log('🖨️ Sending to printer:', copyCommand);
      
      exec(copyCommand, (error: any, stdout: any, stderr: any) => {
        // Clean up temp file
        try {
          fs.unlinkSync(tempFile);
          console.log('🧹 Cleaned up ESC/POS temp file');
        } catch (cleanupError) {
          console.log('⚠️ Could not clean up ESC/POS temp file');
        }
        
        if (error) {
          console.error('❌ Raw ESC/POS print failed:', error.message);
          reject(error);
        } else {
          console.log('✅ Raw ESC/POS print successful');
          resolve({
            success: true,
            message: 'Receipt printed successfully via raw ESC/POS'
          });
        }
      });
      
    } catch (error) {
      console.error('❌ Raw ESC/POS error:', error);
      reject(error);
    }
  });
}

// Print using ESC/POS commands for proper thermal printing
async function printWithESCPOS(content: string, printerName: string, qrCodeData?: string, qrCodeUrl?: string): Promise<any> {
  return new Promise(async (resolve, reject) => {
    try {
      console.log('🔧 Initializing thermal printer with ESC/POS...');
      
      // Try raw ESC/POS approach first (better Windows compatibility)
      try {
        const result = await printWithRawESCPOS(content, printerName, qrCodeData, qrCodeUrl);
        resolve(result);
        return;
      } catch (rawError) {
        console.log('⚠️ Raw ESC/POS failed, trying node-thermal-printer...', rawError);
      }
      
      // Fallback to node-thermal-printer
      // Initialize thermal printer for Windows
      // On Windows, we need to use the network or file path interface
      
      // Check if content contains Arabic characters
      const hasArabic = /[\u0600-\u06FF\u0750-\u077F\u08A0-\u08FF]/.test(content);
      
      const printer = new ThermalPrinter({
        type: PrinterTypes.EPSON,  // Most thermal printers use EPSON commands
        interface: `printer:${printerName}`,  // Try simple printer name first
        characterSet: hasArabic ? 'CP864' : 'PC852_LATIN2',  // Use CP864 (Arabic DOS) for Xprinter
        removeSpecialCharacters: false,
        lineCharacter: "=",
        width: 48,  // 80mm paper is typically 48 characters wide
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
                  cellSize: 6,  // Size of QR code (1-8)
                  correction: 'M',  // Error correction level (L, M, Q, H)
                  model: 2  // QR code model
                });
              } else if (qrCodeData) {
                // If only data URL is available, extract the URL or use a fallback
                console.log('📱 QR code data available but no URL');
                printer.println('QR Code: Please scan with app');
              }
            } catch (qrError) {
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
        } else {
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
      
    } catch (error) {
      console.error('❌ ESC/POS print error:', error);
      reject(error);
    }
  });
}

// Print HTML content using Windows system
async function printHTMLWithWindows(htmlContent: string, printerName: string): Promise<any> {
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
         
         exec(command, (error: any, stdout: any, stderr: any) => {
           if (error) {
             console.log(`⚠️ Approach ${currentApproach + 1} failed:`, error.message);
             currentApproach++;
             tryNextApproach();
           } else {
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
         } catch (cleanupError) {
           console.log('⚠️ Could not clean up temp files');
         }
       }, 10000);
       
       tryNextApproach();
      
    } catch (error) {
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
function convertTextToHTML(content: string, qrCodeData?: string, qrCodeUrl?: string): string {
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
  } else if (qrCodeUrl && content.includes('[QR_CODE_PLACEHOLDER]')) {
    console.log('✅ Using QR code URL fallback');
    // Generate QR code using a service if no image data available
    const qrCodeHtml = `
      <div style="text-align: center; margin: 10px 0;">
        <div style="border: 2px solid #000; padding: 10px; display: inline-block; font-family: monospace; font-size: 10px; background: white;">
          QR Code: ${qrCodeUrl}
        </div>
      </div>`;
    htmlContent = content.replace('[QR_CODE_PLACEHOLDER]', qrCodeHtml);
  } else if (content.includes('[QR_CODE_PLACEHOLDER]')) {
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
async function printWithElectron(content: string, printerName: string, printOptions: any): Promise<any> {
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
  } catch (error) {
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
    console.log('📋 Found printers:', printers.map((p: any) => p.name));
    
    // Try to detect thermal printers specifically
    const thermalPrinters = printers.filter((printer: any) => 
      printer.name.toLowerCase().includes('xprinter') ||
      printer.name.toLowerCase().includes('thermal') ||
      printer.name.toLowerCase().includes('receipt') ||
      printer.name.toLowerCase().includes('pos') ||
      printer.name.toLowerCase().includes('80mm')
    );
    
    console.log('🖨️ Thermal printers found:', thermalPrinters.map((p: any) => p.name));
    
    const recommended = thermalPrinters.length > 0 ? thermalPrinters[0].name : printers[0]?.name || 'Default';
    console.log('🎯 Recommended printer:', recommended);
    
    return {
      success: true,
      printers: printers,
      thermalPrinters: thermalPrinters,
      recommended: recommended
    };
  } catch (error) {
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

ipcMain.handle('test-printer', async (_event: any, printerName: string) => {
  try {
    // Test if printer exists and is available
    const { webContents } = mainWindow;
    const printers = await webContents.getPrintersAsync();
    const printer = printers.find((p: any) => p.name === printerName);
    
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
  } catch (error) {
    console.error('Error testing printer:', error);
    return {
      success: false,
      message: 'Failed to test printer',
      error: error instanceof Error ? error.message : 'Unknown error'
    };
  }
});

ipcMain.handle('get-printer-status', async (_event: any, printerName: string) => {
  try {
    const { webContents } = mainWindow;
    const printers = await webContents.getPrintersAsync();
    const printer = printers.find((p: any) => p.name === printerName);
    
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
  } catch (error) {
    console.error('Error getting printer status:', error);
    return {
      isOnline: false,
      isReady: false,
      status: 'Error checking status'
    };
  }
});

// Handle Arabic code page test - prints with all code pages to find which works
ipcMain.handle('test-arabic-codepages', async (_event: any, printerName: string) => {
  try {
    console.log('🧪 Arabic code page test requested for printer:', printerName);
    return await testAllArabicCodePages(printerName);
  } catch (error) {
    console.error('❌ Test error:', error);
    return {
      success: false,
      message: 'Test failed',
      error: error instanceof Error ? error.message : 'Unknown error'
    };
  }
});

// Handle image-based Arabic printing test
ipcMain.handle('test-image-arabic', async (_event: any, printerName: string) => {
  try {
    console.log('🖼️ Image-based Arabic test requested for printer:', printerName);
    return await testImageBasedArabicPrinting(printerName);
  } catch (error) {
    console.error('❌ Test error:', error);
    return {
      success: false,
      message: 'Test failed',
      error: error instanceof Error ? error.message : 'Unknown error'
    };
  }
});

