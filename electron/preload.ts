const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("electronAPI", {
  // Printer API
  getPrinters: () => ipcRenderer.invoke('get-printers'),
  printDocument: (options: any) => ipcRenderer.invoke('print-document', options),
  testPrinter: (printerName: string) => ipcRenderer.invoke('test-printer', printerName),
  getPrinterStatus: (printerName: string) => ipcRenderer.invoke('get-printer-status', printerName),
});
