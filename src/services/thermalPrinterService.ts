/**
 * Thermal Printer Service
 * Handles thermal printer communication using ESC/POS commands
 * Supports receipt printing with proper formatting for thermal printers
 */

/// <reference path="../types/electron.d.ts" />

export interface PrinterConfig {
  printerName?: string;
  width: number; // Paper width in characters (typically 32, 42, or 48)
  encoding: 'utf8' | 'ascii';
  autoCut: boolean;
  autoOpenDrawer: boolean;
}

export interface ReceiptData {
  billNumber: string;
  billDate: string;
  customerName?: string;
  customerPhone?: string;
  items: ReceiptItem[];
  subtotal: number;
  tax?: number;
  total: number;
  amountPaid: number;
  change: number;
  paymentMethod: 'cash' | 'card' | 'credit';
  notes?: string;
  storeName?: string;
  storeAddress?: string;
  storePhone?: string;
  cashierName?: string;
}

export interface ReceiptItem {
  name: string;
  quantity: number;
  unitPrice: number;
  total: number;
  weight?: number;
  supplier?: string;
}

export class ThermalPrinterService {
  private static instance: ThermalPrinterService;
  private config: PrinterConfig;
  private isConnected: boolean = false;

  constructor(config: Partial<PrinterConfig> = {}) {
    this.config = {
      width: 42,
      encoding: 'utf8',
      autoCut: true,
      autoOpenDrawer: false,
      ...config
    };
  }

  public static getInstance(config?: Partial<PrinterConfig>): ThermalPrinterService {
    if (!ThermalPrinterService.instance) {
      ThermalPrinterService.instance = new ThermalPrinterService(config);
    }
    return ThermalPrinterService.instance;
  }

  /**
   * Initialize printer connection
   */
  public async initialize(): Promise<boolean> {
    try {
      // Check if we're in Electron environment
      if (window.electronAPI?.printer) {
        const result = await window.electronAPI.printer.initialize();
        this.isConnected = result.success || false;
        return this.isConnected;
      }
      
      // Fallback to Web Serial API for browser
      if ('serial' in navigator) {
        this.isConnected = await this.initializeWebSerial();
        return this.isConnected;
      }
      
      // In development mode, simulate success for testing
      console.info('Thermal printer not available - running in simulation mode');
      this.isConnected = true; // Allow testing in development
      return true;
    } catch (error) {
      console.error('Failed to initialize thermal printer:', error);
      this.isConnected = false;
      return false;
    }
  }

  /**
   * Initialize using Web Serial API
   */
  private async initializeWebSerial(): Promise<boolean> {
    try {
      const port = await navigator.serial.requestPort();
      await port.open({ baudRate: 9600 });
      // Store port for later use
      (this as any).serialPort = port;
      return true;
    } catch (error) {
      console.error('Web Serial API initialization failed:', error);
      return false;
    }
  }

  /**
   * Print receipt
   */
  public async printReceipt(receiptData: ReceiptData): Promise<boolean> {
    try {
      if (!this.isConnected) {
        const initialized = await this.initialize();
        if (!initialized) {
          console.warn('Printer not available - receipt not printed');
          return false;
        }
      }

      const receiptText = this.generateReceiptText(receiptData);
      const success = await this.sendToPrinter(receiptText);
      
      if (success && this.config.autoCut) {
        await this.cutPaper();
      }
      
      return success;
    } catch (error) {
      console.error('Failed to print receipt:', error);
      return false;
    }
  }

  /**
   * Generate formatted receipt text
   */
  private generateReceiptText(data: ReceiptData): string {
    const { width } = this.config;
    let receipt = '';

    // ESC/POS initialization
    receipt += '\x1B\x40'; // Initialize printer
    receipt += '\x1B\x61\x01'; // Center alignment

    // Store header
    if (data.storeName) {
      receipt += this.centerText(data.storeName.toUpperCase(), width);
      receipt += '\n';
    }
    
    if (data.storeAddress) {
      receipt += this.centerText(data.storeAddress, width);
      receipt += '\n';
    }
    
    if (data.storePhone) {
      receipt += this.centerText(data.storePhone, width);
      receipt += '\n';
    }

    // Separator line
    receipt += this.createSeparatorLine(width);
    receipt += '\n';

    // Bill information
    receipt += '\x1B\x61\x00'; // Left alignment
    receipt += `Bill #: ${data.billNumber}\n`;
    receipt += `Date: ${new Date(data.billDate).toLocaleString()}\n`;
    
    if (data.cashierName) {
      receipt += `Cashier: ${data.cashierName}\n`;
    }

    // Customer information
    if (data.customerName && data.customerName !== 'Walk-in Customer') {
      receipt += `Customer: ${data.customerName}\n`;
      if (data.customerPhone) {
        receipt += `Phone: ${data.customerPhone}\n`;
      }
    }

    receipt += '\n';

    // Items header
    receipt += this.createTableHeader(width);
    receipt += '\n';

    // Items
    data.items.forEach((item, index) => {
      receipt += this.formatItemLine(item, width, index + 1);
      receipt += '\n';
    });

    // Separator
    receipt += this.createSeparatorLine(width);
    receipt += '\n';

    // Totals
    receipt += this.formatTotalLine('Subtotal', data.subtotal, width);
    receipt += '\n';

    if (data.tax && data.tax > 0) {
      receipt += this.formatTotalLine('Tax', data.tax, width);
      receipt += '\n';
    }

    receipt += this.formatTotalLine('TOTAL', data.total, width, true);
    receipt += '\n';

    // Payment information
    receipt += this.createSeparatorLine(width);
    receipt += '\n';
    receipt += `Payment Method: ${data.paymentMethod.toUpperCase()}\n`;
    receipt += this.formatTotalLine('Amount Paid', data.amountPaid, width);
    receipt += '\n';

    if (data.change > 0) {
      receipt += this.formatTotalLine('Change', data.change, width);
      receipt += '\n';
    }

    // Notes
    if (data.notes) {
      receipt += '\n';
      receipt += `Notes: ${data.notes}\n`;
    }

    // Footer
    receipt += '\n';
    receipt += this.centerText('Thank you for your business!', width);
    receipt += '\n';
    receipt += this.centerText('Please come again', width);
    receipt += '\n\n\n';

    return receipt;
  }

  /**
   * Center text within given width
   */
  private centerText(text: string, width: number): string {
    const padding = Math.max(0, Math.floor((width - text.length) / 2));
    return ' '.repeat(padding) + text;
  }

  /**
   * Create separator line
   */
  private createSeparatorLine(width: number): string {
    return '-'.repeat(width);
  }

  /**
   * Create table header for items
   */
  private createTableHeader(width: number): string {
    const itemWidth = Math.floor(width * 0.4);
    const qtyWidth = Math.floor(width * 0.15);
    const priceWidth = Math.floor(width * 0.2);
    const totalWidth = width - itemWidth - qtyWidth - priceWidth - 3; // 3 for spaces

    return [
      'Item'.padEnd(itemWidth),
      'Qty'.padStart(qtyWidth),
      'Price'.padStart(priceWidth),
      'Total'.padStart(totalWidth)
    ].join(' ');
  }

  /**
   * Format item line
   */
  private formatItemLine(item: ReceiptItem, width: number, lineNumber: number): string {
    const itemWidth = Math.floor(width * 0.4);
    const qtyWidth = Math.floor(width * 0.15);
    const priceWidth = Math.floor(width * 0.2);
    const totalWidth = width - itemWidth - qtyWidth - priceWidth - 3;

    // Truncate item name if too long
    let itemName = item.name;
    if (itemName.length > itemWidth - 2) {
      itemName = itemName.substring(0, itemWidth - 5) + '...';
    }

    // Add weight info if available
    let qtyText = item.quantity.toString();
    if (item.weight && item.weight > 0) {
      qtyText += ` (${item.weight}kg)`;
    }

    return [
      `${lineNumber}. ${itemName}`.padEnd(itemWidth),
      qtyText.padStart(qtyWidth),
      `$${item.unitPrice.toFixed(2)}`.padStart(priceWidth),
      `$${item.total.toFixed(2)}`.padStart(totalWidth)
    ].join(' ');
  }

  /**
   * Format total line
   */
  private formatTotalLine(label: string, amount: number, width: number, isBold: boolean = false): string {
    const labelWidth = Math.floor(width * 0.6);
    const amountWidth = width - labelWidth - 1;

    const labelText = isBold ? `**${label}**` : label;
    const amountText = `$${amount.toFixed(2)}`;

    return [
      labelText.padEnd(labelWidth),
      amountText.padStart(amountWidth)
    ].join(' ');
  }

  /**
   * Send text to printer
   */
  private async sendToPrinter(text: string): Promise<boolean> {
    try {
      if (window.electronAPI?.printer) {
        const result = await window.electronAPI.printer.print(text);
        return result.success || false;
      }
      
      if ((this as any).serialPort) {
        const writer = (this as any).serialPort.writable.getWriter();
        const encoder = new TextEncoder();
        await writer.write(encoder.encode(text));
        writer.releaseLock();
        return true;
      }
      
      // In development mode, save to downloads or simulate printing
      this.saveReceiptToFile(text);
      return true;
    } catch (error) {
      console.error('Failed to send to printer:', error);
      return false;
    }
  }

  /**
   * Save receipt to file in development mode
   */
  private saveReceiptToFile(text: string): void {
    try {
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
      const filename = `receipt-${timestamp}.txt`;
      
      // Clean the text by removing ESC/POS commands for readable output
      const cleanText = this.cleanTextForDisplay(text);
      
      // Create a blob and download it
      const blob = new Blob([cleanText], { type: 'text/plain;charset=utf-8' });
      const url = URL.createObjectURL(blob);
      
      const link = document.createElement('a');
      link.href = url;
      link.download = filename;
      link.style.display = 'none';
      
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      
      URL.revokeObjectURL(url);
      
      console.info(`Receipt saved as: ${filename}`);
      console.log('Receipt content:', cleanText);
    } catch (error) {
      console.error('Failed to save receipt file:', error);
      console.log('Receipt content (fallback):', text);
    }
  }

  /**
   * Clean text by removing ESC/POS commands for readable display
   */
  private cleanTextForDisplay(text: string): string {
    return text
      .replace(/\x1B\x40/g, '') // Initialize printer
      .replace(/\x1B\x61\x01/g, '') // Center alignment
      .replace(/\x1B\x61\x00/g, '') // Left alignment
      .replace(/\x1D\x56\x00/g, '') // Cut paper
      .replace(/\x1B\x70\x00\x19\xFA/g, '') // Open drawer
      .replace(/\x1B\[[0-9;]*[mK]/g, '') // ANSI escape sequences
      .replace(/\x1B\[[0-9;]*[A-Z]/g, ''); // Other escape sequences
  }

  /**
   * Cut paper
   */
  private async cutPaper(): Promise<void> {
    const cutCommand = '\x1D\x56\x00'; // Full cut
    await this.sendToPrinter(cutCommand);
  }

  /**
   * Open cash drawer
   */
  public async openCashDrawer(): Promise<boolean> {
    try {
      if (window.electronAPI?.printer) {
        return await window.electronAPI.printer.openDrawer();
      }
      
      // ESC/POS command to open drawer
      const openDrawerCommand = '\x1B\x70\x00\x19\xFA'; // Open drawer command
      return await this.sendToPrinter(openDrawerCommand);
    } catch (error) {
      console.error('Failed to open cash drawer:', error);
      return false;
    }
  }

  /**
   * Test printer connection
   */
  public async testPrint(): Promise<boolean> {
    try {
      const testText = '\x1B\x40' + // Initialize
        '\x1B\x61\x01' + // Center alignment
        'THERMAL PRINTER TEST\n' +
        '====================\n' +
        'If you can read this,\n' +
        'your printer is working!\n' +
        '\n\n\n';
      
      return await this.sendToPrinter(testText);
    } catch (error) {
      console.error('Test print failed:', error);
      return false;
    }
  }

  /**
   * Update printer configuration
   */
  public updateConfig(newConfig: Partial<PrinterConfig>): void {
    this.config = { ...this.config, ...newConfig };
  }

  /**
   * Get current configuration
   */
  public getConfig(): PrinterConfig {
    return { ...this.config };
  }

  /**
   * Check if printer is connected
   */
  public isPrinterConnected(): boolean {
    return this.isConnected;
  }

  /**
   * Disconnect printer
   */
  public async disconnect(): Promise<void> {
    try {
      if ((this as any).serialPort) {
        await (this as any).serialPort.close();
        (this as any).serialPort = null;
      }
      this.isConnected = false;
    } catch (error) {
      console.error('Failed to disconnect printer:', error);
    }
  }
}

// Export singleton instance
export const thermalPrinter = ThermalPrinterService.getInstance();
