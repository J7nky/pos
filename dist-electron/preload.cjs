"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const electron_1 = require("electron");
electron_1.contextBridge.exposeInMainWorld("electronAPI", {
    // Thermal Printer API
    printer: {
        initialize: () => electron_1.ipcRenderer.invoke('printer:initialize'),
        print: (text) => electron_1.ipcRenderer.invoke('printer:print', text),
        openDrawer: () => electron_1.ipcRenderer.invoke('printer:openDrawer'),
        test: () => electron_1.ipcRenderer.invoke('printer:test'),
    },
    // Development API (only available in development)
    ...(process.env.NODE_ENV === 'development' || process.env.VITE_DEV_SERVER_URL ? {
        dev: {
            reloadRenderer: () => electron_1.ipcRenderer.invoke('reload-renderer'),
            restartApp: () => electron_1.ipcRenderer.invoke('restart-app'),
        }
    } : {}),
});
