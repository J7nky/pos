"use strict";
const { contextBridge, ipcRenderer } = require("electron");
contextBridge.exposeInMainWorld("electronAPI", {
    // Printer API
    getPrinters: () => ipcRenderer.invoke('get-printers'),
    printDocument: (options) => ipcRenderer.invoke('print-document', options),
    printStatement: (payload) => ipcRenderer.invoke('print-statement', payload),
    testPrinter: (printerName) => ipcRenderer.invoke('test-printer', printerName),
    getPrinterStatus: (printerName) => ipcRenderer.invoke('get-printer-status', printerName),
    // Test functions removed - not needed in production
    // Update API
    checkForUpdates: () => ipcRenderer.invoke('check-for-updates'),
    getAppVersion: () => ipcRenderer.invoke('get-app-version'),
    quitAndInstall: () => ipcRenderer.invoke('quit-and-install'),
    getUpdateStatus: () => ipcRenderer.invoke('get-update-status'),
    // Update event listeners
    onUpdateChecking: (callback) => {
        ipcRenderer.on('update-checking', callback);
        return () => ipcRenderer.removeListener('update-checking', callback);
    },
    onUpdateAvailable: (callback) => {
        ipcRenderer.on('update-available', callback);
        return () => ipcRenderer.removeListener('update-available', callback);
    },
    onUpdateNotAvailable: (callback) => {
        ipcRenderer.on('update-not-available', callback);
        return () => ipcRenderer.removeListener('update-not-available', callback);
    },
    onUpdateError: (callback) => {
        ipcRenderer.on('update-error', callback);
        return () => ipcRenderer.removeListener('update-error', callback);
    },
    onUpdateDownloadProgress: (callback) => {
        ipcRenderer.on('update-download-progress', callback);
        return () => ipcRenderer.removeListener('update-download-progress', callback);
    },
    onUpdateDownloaded: (callback) => {
        ipcRenderer.on('update-downloaded', callback);
        return () => ipcRenderer.removeListener('update-downloaded', callback);
    },
});
