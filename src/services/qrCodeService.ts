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
    // Use public URL from environment (set by Vite config)
    this.baseUrl = import.meta.env.VITE_PUBLIC_URL || window.location.origin;
    
    // Debug logging to show which URL is being used
    console.log('🔧 QR Code Service Initialization:');
    console.log('   - Environment VITE_PUBLIC_URL:', import.meta.env.VITE_PUBLIC_URL || 'Not set');
    console.log('   - Current origin:', window.location.origin);
    console.log('   - Selected base URL:', this.baseUrl);
    console.log('   - Is production URL?', this.baseUrl.includes('souq-trablous.com'));
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
    _billNumber: string,
    _customerName: string,
    options?: {
      size?: number;
      margin?: number;
      color?: {
        dark?: string;
        light?: string;
      };
    }
  ): Promise<string> {
    // Create the public URL for customer account statement
    const publicUrl = `${this.baseUrl}/public/customer-statement/${customerId}/${billId}`;
    
    // Debug logging
    console.log('🔍 QR Code URL Generation:');
    console.log('   - Public URL:', this.baseUrl);
    console.log('   - Customer ID:', customerId);
    console.log('   - Bill ID:', billId);
    console.log('   - Generated QR URL:', publicUrl);
    
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
    _billNumber: string,
    _customerName: string,
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

  /**
   * Get the current base URL being used
   */
  public getBaseUrl(): string {
    return this.baseUrl;
  }
}
