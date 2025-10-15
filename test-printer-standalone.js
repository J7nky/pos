/**
 * Standalone Printer Test
 * Run this with: node test-printer-standalone.js
 */

const { app, BrowserWindow, ipcMain } = require('electron');
const path = require('path');

let mainWindow;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 800,
    height: 600,
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false
    }
  });

  // Load a simple HTML page
  mainWindow.loadURL(`data:text/html,${encodeURIComponent(`
    <!DOCTYPE html>
    <html>
    <head>
      <title>Printer Test</title>
      <style>
        body {
          font-family: Arial, sans-serif;
          padding: 20px;
          background: #f5f5f5;
        }
        .container {
          max-width: 600px;
          margin: 0 auto;
          background: white;
          padding: 30px;
          border-radius: 8px;
          box-shadow: 0 2px 10px rgba(0,0,0,0.1);
        }
        button {
          background: #007bff;
          color: white;
          border: none;
          padding: 12px 24px;
          border-radius: 4px;
          cursor: pointer;
          margin: 10px 5px;
          font-size: 16px;
        }
        button:hover {
          background: #0056b3;
        }
        button:disabled {
          background: #ccc;
          cursor: not-allowed;
        }
        .status {
          margin: 20px 0;
          padding: 15px;
          border-radius: 4px;
          font-weight: bold;
        }
        .success { background: #d4edda; color: #155724; border: 1px solid #c3e6cb; }
        .error { background: #f8d7da; color: #721c24; border: 1px solid #f5c6cb; }
        .info { background: #d1ecf1; color: #0c5460; border: 1px solid #bee5eb; }
        .printers {
          margin: 20px 0;
        }
        .printer-item {
          padding: 10px;
          margin: 5px 0;
          background: #f8f9fa;
          border: 1px solid #dee2e6;
          border-radius: 4px;
        }
        .printer-name {
          font-weight: bold;
        }
        .printer-details {
          font-size: 14px;
          color: #666;
        }
      </style>
    </head>
    <body>
      <div class="container">
        <h1>🖨️ Printer Test</h1>
        <p>This tool will help you test your printer functionality.</p>
        
        <div>
          <button onclick="detectPrinters()">Detect Printers</button>
          <button onclick="printTest()" id="printBtn" disabled>Print Test Document</button>
          <button onclick="clearStatus()">Clear Status</button>
        </div>

        <div id="status"></div>
        <div id="printers" class="printers"></div>
      </div>

      <script>
        // Expose API to renderer
        const { ipcRenderer } = require('electron');
        window.electronAPI = {
          getPrinters: () => ipcRenderer.invoke('get-printers'),
          printDocument: (options) => ipcRenderer.invoke('print-document', options)
        };

        let availablePrinters = [];

        function showStatus(message, type = 'info') {
          const statusDiv = document.getElementById('status');
          statusDiv.innerHTML = \`<div class="status \${type}">\${message}</div>\`;
        }

        function clearStatus() {
          document.getElementById('status').innerHTML = '';
        }

        async function detectPrinters() {
          showStatus('Detecting printers...', 'info');
          
          try {
            const printers = await window.electronAPI.getPrinters();
            availablePrinters = printers;
            
            if (printers.length === 0) {
              showStatus('No printers detected. Make sure your printer is connected and turned on.', 'error');
              return;
            }

            displayPrinters(printers);
            showStatus(\`Found \${printers.length} printer(s)\`, 'success');
            document.getElementById('printBtn').disabled = false;
          } catch (error) {
            showStatus(\`Error detecting printers: \${error.message}\`, 'error');
            console.error('Error:', error);
          }
        }

        function displayPrinters(printers) {
          const printersDiv = document.getElementById('printers');
          printersDiv.innerHTML = '<h3>Available Printers:</h3>';
          
          printers.forEach(printer => {
            const printerDiv = document.createElement('div');
            printerDiv.className = 'printer-item';
            printerDiv.innerHTML = \`
              <div class="printer-name">\${printer.displayName} \${printer.isDefault ? '(Default)' : ''}</div>
              <div class="printer-details">
                Name: \${printer.name}<br>
                \${printer.description ? \`Description: \${printer.description}\` : ''}
              </div>
            \`;
            printersDiv.appendChild(printerDiv);
          });
        }

        async function printTest() {
          if (availablePrinters.length === 0) {
            showStatus('Please detect printers first', 'error');
            return;
          }

          showStatus('Printing test document...', 'info');
          document.getElementById('printBtn').disabled = true;

          try {
            const testContent = \`
========================================
        PRINTER TEST DOCUMENT
========================================

Date: \${new Date().toLocaleString()}
Test ID: \${Math.random().toString(36).substr(2, 9)}

This is a test document to verify printer functionality.

Features tested:
✓ Printer detection
✓ Document generation  
✓ Print job submission

If you can see this document, your printer is working correctly!

========================================
POS System - Printer Test
========================================
            \`.trim();

            const result = await window.electronAPI.printDocument({
              content: testContent,
              printerName: availablePrinters[0].name,
              printOptions: {
                margins: {
                  top: 0.5,
                  bottom: 0.5,
                  left: 0.5,
                  right: 0.5
                },
                printBackground: false,
                landscape: false
              }
            });

            if (result.success) {
              showStatus(\`✅ \${result.message}\`, 'success');
            } else {
              showStatus(\`❌ \${result.message}\`, 'error');
            }
          } catch (error) {
            showStatus(\`❌ Print failed: \${error.message}\`, 'error');
            console.error('Print error:', error);
          } finally {
            document.getElementById('printBtn').disabled = false;
          }
        }

        // Auto-detect printers on load
        window.addEventListener('load', () => {
          detectPrinters();
        });
      </script>
    </body>
    </html>
  `)}`);

  mainWindow.webContents.openDevTools();
}

// Printer API handlers
ipcMain.handle('get-printers', async () => {
  try {
    const printers = await mainWindow.webContents.getPrintersAsync();
    return printers.map(printer => ({
      name: printer.name,
      displayName: printer.displayName || printer.name,
      description: printer.description || '',
      isDefault: printer.isDefault || false
    }));
  } catch (error) {
    console.error('Error getting printers:', error);
    return [];
  }
});

ipcMain.handle('print-document', async (event, options) => {
  try {
    const { content, printerName, printOptions } = options;
    
    // Create a new window for printing
    const printWindow = new BrowserWindow({
      show: false,
      webPreferences: {
        nodeIntegration: true
      }
    });

    // Load content
    await printWindow.loadURL(`data:text/html,${encodeURIComponent(`
      <!DOCTYPE html>
      <html>
      <head>
        <title>Print Test</title>
        <style>
          body {
            font-family: 'Courier New', monospace;
            font-size: 12px;
            line-height: 1.4;
            margin: 20px;
            white-space: pre-line;
          }
          @media print {
            body { margin: 0; }
            @page { margin: 0.5in; }
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

    // Print
    const printOptions_ = {
      silent: false,
      printBackground: printOptions?.printBackground || false,
      deviceName: printerName || undefined,
      ...printOptions
    };

    await printWindow.webContents.print(printOptions_);
    
    // Close the print window
    printWindow.close();

    return {
      success: true,
      message: 'Print job submitted successfully'
    };
  } catch (error) {
    console.error('Error printing document:', error);
    return {
      success: false,
      message: 'Failed to print document',
      error: error.message
    };
  }
});

// Expose API to renderer (since contextIsolation is false)
// We'll expose it through the window object

app.whenReady().then(createWindow);

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) createWindow();
});
