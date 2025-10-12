import { contextBridge, ipcRenderer } from "electron";
contextBridge.exposeInMainWorld("electronAPI", {
    // Thermal Printer API
    printer: {
        initialize: () => ipcRenderer.invoke('printer:initialize'),
        print: (text) => ipcRenderer.invoke('printer:print', text),
        openDrawer: () => ipcRenderer.invoke('printer:openDrawer'),
        test: () => ipcRenderer.invoke('printer:test'),
    },
});
