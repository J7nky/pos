import QRCode from 'qrcode';

export interface QRCodeData {
  customerId: string;
  billId: string;
  billNumber: string;
  customerName: string;
  timestamp: string;
}

export class QRCodeService {
  private static instance: QRCodeService;
  private baseUrl: string;

  private constructor() {
    // Get base URL from environment or use current origin
    this.baseUrl = import.meta.env.VITE_PUBLIC_URL || window.location.origin;
  }

  public static getInstance(): QRCodeService {
    if (!QRCodeService.instance) {
      QRCodeService.instance = new QRCodeService();
    }
    return QRCodeService.instance;
  }

  /**
   * Generate QR code data URL for a bill with customer account statement link
   */
  public async generateBillQRCode(
    customerId: string,
    billId: string,
    billNumber: string,
    customerName: string,
    options?: {
      size?: number;
      margin?: number;
      color?: {
        dark?: string;
        light?: string;
      };
    }
  ): Promise<string> {
    const qrData: QRCodeData = {
      customerId,
      billId,
      billNumber,
      customerName,
      timestamp: new Date().toISOString()
    };

    // Create the public URL for customer account statement
    const publicUrl = `${this.baseUrl}/public/customer-statement/${customerId}/${billId}`;
    
    // Generate QR code as data URL
    const qrCodeDataUrl = await QRCode.toDataURL(publicUrl, {
      width: options?.size || 200,
      margin: options?.margin || 2,
      color: {
        dark: options?.color?.dark || '#000000',
        light: options?.color?.light || '#FFFFFF'
      },
      errorCorrectionLevel: 'M'
    });

    return qrCodeDataUrl;
  }

  /**
   * Generate QR code as SVG string for better printing quality
   */
  public async generateBillQRCodeSVG(
    customerId: string,
    billId: string,
    billNumber: string,
    customerName: string,
    options?: {
      size?: number;
      margin?: number;
      color?: {
        dark?: string;
        light?: string;
      };
    }
  ): Promise<string> {
    const publicUrl = `${this.baseUrl}/public/customer-statement/${customerId}/${billId}`;
    
    const svgString = await QRCode.toString(publicUrl, {
      type: 'svg',
      width: options?.size || 200,
      margin: options?.margin || 2,
      color: {
        dark: options?.color?.dark || '#000000',
        light: options?.color?.light || '#FFFFFF'
      },
      errorCorrectionLevel: 'M'
    });

    return svgString;
  }

  /**
   * Generate QR code for printing (higher resolution)
   */
  public async generateBillQRCodeForPrint(
    customerId: string,
    billId: string,
    billNumber: string,
    customerName: string
  ): Promise<string> {
    return this.generateBillQRCode(customerId, billId, billNumber, customerName, {
      size: 300,
      margin: 3,
      color: {
        dark: '#000000',
        light: '#FFFFFF'
      }
    });
  }

  /**
   * Parse QR code data from URL
   */
  public parseQRCodeUrl(url: string): { customerId: string; billId: string } | null {
    try {
      const urlObj = new URL(url);
      const pathParts = urlObj.pathname.split('/');
      
      if (pathParts.length >= 4 && pathParts[1] === 'public' && pathParts[2] === 'customer-statement') {
        return {
          customerId: pathParts[3],
          billId: pathParts[4]
        };
      }
      
      return null;
    } catch (error) {
      console.error('Error parsing QR code URL:', error);
      return null;
    }
  }

  /**
   * Get the public URL for a customer account statement
   */
  public getCustomerStatementUrl(customerId: string, billId: string): string {
    return `${this.baseUrl}/public/customer-statement/${customerId}/${billId}`;
  }
}
