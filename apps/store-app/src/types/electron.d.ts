import { AccountStatement } from '../services/accountStatementService';
import { Customer, Supplier } from './index';

export interface FormalBillPrintPayload {
  bill: {
    bill_number: string;
    bill_date: string;
    subtotal: number;
    total_amount: number;
    payment_method: string;
    payment_status: string;
    amount_paid: number;
    notes?: string | null;
  };
  lineItems: Array<{
    productName: string;
    quantity: number;
    weight?: number | null;
    unit_price: number;
    line_total: number;
  }>;
  entity?: {
    name: string;
    phone?: string;
    lb_balance?: number;
  } | null;
  receiptSettings: {
    storeName: string;
    address: string;
    phone1: string;
    phone1Name: string;
    phone2: string;
    phone2Name: string;
    thankYouMessage: string;
    billNumberPrefix: string;
    showPreviousBalance: boolean;
    showItemCount: boolean;
  };
  logo?: string | null;
  printerName?: string;
  language?: 'en' | 'ar' | 'fr';
  currency?: string;
  exchangeRate?: number;
}

export interface AccountStatementPrintPayload {
  statement: AccountStatement;
  entity: {
    name: string;
    type: 'customer' | 'supplier' | 'employee';
  };
  viewMode: 'summary' | 'detailed';
  language: 'en' | 'ar' | 'fr';
  dateRange: {
    start: string;
    end: string;
  };
}

declare global {
  interface Window {
    electronAPI: {
      // Printer API
      getPrinters: () => Promise<any>;
      printDocument: (options: any) => Promise<any>;
      printStatement: (payload: AccountStatementPrintPayload) => Promise<{ success: boolean; message?: string; error?: string }>;
      printFormalBill: (payload: FormalBillPrintPayload) => Promise<{ success: boolean; message?: string; error?: string }>;
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
