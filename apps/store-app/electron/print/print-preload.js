// Preload script for print window
// Provides secure IPC communication for statement data

const { contextBridge, ipcRenderer } = require('electron');

// Expose protected methods to renderer
contextBridge.exposeInMainWorld('printAPI', {
  // Listen for statement data from main process
  onStatementData: (callback) => {
    ipcRenderer.on('set-statement-data', (event, data) => {
      callback(data);
    });
  },
  
  // Remove listener
  removeStatementDataListener: () => {
    ipcRenderer.removeAllListeners('set-statement-data');
  }
});

