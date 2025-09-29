declare global {
  interface Window {
    electronAPI: {
      printer: {
        initialize: () => Promise<boolean>;
        print: (text: string) => Promise<boolean>;
        openDrawer: () => Promise<boolean>;
        test: () => Promise<boolean>;
      };
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
