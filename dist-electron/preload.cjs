"use strict";
const { contextBridge, ipcRenderer } = require("electron");
contextBridge.exposeInMainWorld("electronAPI", {
    // Printer API
    getPrinters: () => ipcRenderer.invoke('get-printers'),
    printDocument: (options) => ipcRenderer.invoke('print-document', options),
    testPrinter: (printerName) => ipcRenderer.invoke('test-printer', printerName),
    getPrinterStatus: (printerName) => ipcRenderer.invoke('get-printer-status', printerName),
    testArabicCodePages: (printerName) => ipcRenderer.invoke('test-arabic-codepages', printerName),
    testImageArabic: (printerName) => ipcRenderer.invoke('test-image-arabic', printerName),
});
