import { app, BrowserWindow, ipcMain } from "electron";
import * as path from "path";
import * as fs from "fs";

let mainWindow: BrowserWindow | null = null;

const createWindow = () => {
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
    },
  });

  if (process.env.VITE_DEV_SERVER_URL) {
    // Dev: load Vite server
    mainWindow.loadURL(process.env.VITE_DEV_SERVER_URL);
  } else {
    // Prod: load built index.html
    mainWindow.loadFile(path.join(__dirname, "../dist/index.html"));
  }
};

app.on("ready", createWindow);

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});

app.on("activate", () => {
  if (mainWindow === null) createWindow();
});

// Thermal Printer IPC handlers
ipcMain.handle('printer:initialize', async () => {
  try {
    // Check if printer is available (this would need actual printer detection)
    // For now, we'll simulate success
    return { success: true, message: 'Printer initialized successfully' };
  } catch (error) {
    return { success: false, message: `Failed to initialize printer: ${error}` };
  }
});

ipcMain.handle('printer:print', async (event, text: string) => {
  try {
    // In a real implementation, this would send the text to the thermal printer
    // For now, we'll save it to a file for testing
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const filename = `receipt-${timestamp}.txt`;
    const filepath = path.join(process.cwd(), 'receipts', filename);
    
    // Ensure receipts directory exists
    const receiptsDir = path.join(process.cwd(), 'receipts');
    if (!fs.existsSync(receiptsDir)) {
      fs.mkdirSync(receiptsDir, { recursive: true });
    }
    
    fs.writeFileSync(filepath, text, 'utf8');
    console.log(`Receipt saved to: ${filepath}`);
    
    return { success: true, message: 'Receipt printed successfully' };
  } catch (error) {
    return { success: false, message: `Failed to print: ${error}` };
  }
});

ipcMain.handle('printer:openDrawer', async () => {
  try {
    // In a real implementation, this would send the ESC/POS command to open the cash drawer
    console.log('Cash drawer opened');
    return { success: true, message: 'Cash drawer opened successfully' };
  } catch (error) {
    return { success: false, message: `Failed to open cash drawer: ${error}` };
  }
});

ipcMain.handle('printer:test', async () => {
  try {
    const testText = 'THERMAL PRINTER TEST\n====================\nIf you can read this,\nyour printer is working!\n\n\n';
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const filename = `test-${timestamp}.txt`;
    const filepath = path.join(process.cwd(), 'receipts', filename);
    
    // Ensure receipts directory exists
    const receiptsDir = path.join(process.cwd(), 'receipts');
    if (!fs.existsSync(receiptsDir)) {
      fs.mkdirSync(receiptsDir, { recursive: true });
    }
    
    fs.writeFileSync(filepath, testText, 'utf8');
    console.log(`Test print saved to: ${filepath}`);
    
    return { success: true, message: 'Test print completed' };
  } catch (error) {
    return { success: false, message: `Test print failed: ${error}` };
  }
});
