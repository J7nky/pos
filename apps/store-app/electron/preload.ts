const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("electronAPI", {
  // Printer API
  getPrinters: () => ipcRenderer.invoke('get-printers'),
  printDocument: (options: any) => ipcRenderer.invoke('print-document', options),
  testPrinter: (printerName: string) => ipcRenderer.invoke('test-printer', printerName),
  getPrinterStatus: (printerName: string) => ipcRenderer.invoke('get-printer-status', printerName),
  testArabicCodePages: (printerName: string) => ipcRenderer.invoke('test-arabic-codepages', printerName),
  testImageArabic: (printerName: string) => ipcRenderer.invoke('test-image-arabic', printerName),
  
  // Update API
  checkForUpdates: () => ipcRenderer.invoke('check-for-updates'),
  getAppVersion: () => ipcRenderer.invoke('get-app-version'),
  quitAndInstall: () => ipcRenderer.invoke('quit-and-install'),
  getUpdateStatus: () => ipcRenderer.invoke('get-update-status'),
  
  // Update event listeners
  onUpdateChecking: (callback: () => void) => {
    ipcRenderer.on('update-checking', callback);
    return () => ipcRenderer.removeListener('update-checking', callback);
  },
  onUpdateAvailable: (callback: (event: any, info: any) => void) => {
    ipcRenderer.on('update-available', callback);
    return () => ipcRenderer.removeListener('update-available', callback);
  },
  onUpdateNotAvailable: (callback: (event: any, info: any) => void) => {
    ipcRenderer.on('update-not-available', callback);
    return () => ipcRenderer.removeListener('update-not-available', callback);
  },
  onUpdateError: (callback: (event: any, error: any) => void) => {
    ipcRenderer.on('update-error', callback);
    return () => ipcRenderer.removeListener('update-error', callback);
  },
  onUpdateDownloadProgress: (callback: (event: any, progress: any) => void) => {
    ipcRenderer.on('update-download-progress', callback);
    return () => ipcRenderer.removeListener('update-download-progress', callback);
  },
  onUpdateDownloaded: (callback: (event: any, info: any) => void) => {
    ipcRenderer.on('update-downloaded', callback);
    return () => ipcRenderer.removeListener('update-downloaded', callback);
  },
});
