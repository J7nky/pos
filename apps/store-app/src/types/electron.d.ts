declare global {
  interface Window {
    electronAPI: {
      // Printer API
      getPrinters: () => Promise<any>;
      printDocument: (options: any) => Promise<any>;
      testPrinter: (printerName: string) => Promise<any>;
      getPrinterStatus: (printerName: string) => Promise<any>;
      // Test functions removed - not needed in production
      
      // Update API
      checkForUpdates: () => Promise<{
        success: boolean;
        updateInfo?: {
          version: string;
          releaseDate: string;
          releaseNotes?: string;
        } | null;
        cancelled?: boolean;
        error?: string;
      }>;
      getAppVersion: () => Promise<{
        success: boolean;
        version?: string;
        error?: string;
      }>;
      quitAndInstall: () => Promise<{
        success: boolean;
        message?: string;
        error?: string;
      }>;
      getUpdateStatus: () => Promise<{
        success: boolean;
        enabled?: boolean;
        version?: string;
        updateServer?: string;
        message?: string;
        error?: string;
      }>;
      
      // Update event listeners
      onUpdateChecking: (callback: () => void) => () => void;
      onUpdateAvailable: (callback: (event: any, info: any) => void) => () => void;
      onUpdateNotAvailable: (callback: (event: any, info: any) => void) => () => void;
      onUpdateError: (callback: (event: any, error: any) => void) => () => void;
      onUpdateDownloadProgress: (callback: (event: any, progress: any) => void) => () => void;
      onUpdateDownloaded: (callback: (event: any, info: any) => void) => () => void;
    };
  }

  interface Navigator {
    serial: {
      requestPort(): Promise<SerialPort>;
    };
  }

  interface SerialPort {
    open(options: { baudRate: number }): Promise<void>;
    close(): Promise<void>;
    writable: WritableStream<Uint8Array>;
  }
}

export {};
