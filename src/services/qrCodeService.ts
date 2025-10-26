import QRCode from 'qrcode';
import { supabase } from '../lib/supabase';

export interface QRCodeData {
  customerId: string;
  billId: string;
  billNumber: string;
  customerName: string;
  timestamp: string;
}

export interface AccessTokenData {
  token: string;
  expires_at: string;
  customer_id: string;
  bill_id: string;
}

export interface QRCodeResult {
  qrCodeDataUrl: string;  // Base64 image data
  publicUrl: string;       // Actual URL in the QR code
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
   * Generate a secure access token for a customer bill
   */
  private async generateAccessToken(
    customerId: string,
    billId?: string | null
  ): Promise<string> {
    try {
      console.log('🔐 Generating secure access token...');
      console.log('   - Customer ID:', customerId);
      console.log('   - Bill ID:', billId || 'Not provided (customer-level access)');
      
      // Generate token in Supabase
      // Type assertion needed as public_access_tokens table type will be available after migration
      const insertData: any = {
        customer_id: customerId,
        // Only include bill_id if it's provided and not null
        // This allows tokens to work even if bill hasn't synced to Supabase yet
      };
      
      // Only add bill_id if provided (to avoid foreign key constraint issues)
      if (billId) {
        insertData.bill_id = billId;
      }
      
      const { data, error } = await (supabase as any)
        .from('public_access_tokens')
        .insert(insertData)
        .select('token')
        .single();
      
      if (error) {
        console.error('❌ Error generating access token:', error);
        throw new Error(`Failed to generate access token: ${error.message}`);
      }
      
      if (!data || !data.token) {
        throw new Error('No token returned from database');
      }
      
      console.log('✅ Access token generated successfully');
      return data.token as string;
    } catch (error) {
      console.error('❌ Failed to generate access token:', error);
      throw error;
    }
  }

  /**
   * Generate QR code data URL for a bill with customer account statement link
   * Uses secure token-based access
   * Note: billId is optional - if not provided or bill hasn't synced yet, creates customer-level token
   */
  public async generateBillQRCode(
    customerId: string,
    billId?: string | null,
    _billNumber?: string,
    _customerName?: string,
    options?: {
      size?: number;
      margin?: number;
      color?: {
        dark?: string;
        light?: string;
      };
    }
  ): Promise<QRCodeResult> {
    // Generate secure access token (billId is optional)
    const token = await this.generateAccessToken(customerId, billId);
    
    // Create the public URL with token
    const publicUrl = `${this.baseUrl}/public/statement/${token}`;
    
    // Debug logging
    console.log('🔍 QR Code URL Generation:');
    console.log('   - Public URL:', this.baseUrl);
    console.log('   - Customer ID:', customerId);
    console.log('   - Bill ID:', billId || 'Not provided');
    console.log('   - Token:', `${token.substring(0, 10)}...`);
    console.log('   - Generated QR URL:', `${this.baseUrl}/public/statement/${token.substring(0, 10)}...`);
    
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

    console.log('✅ QR Code generated successfully');
    console.log('   - Full URL in QR code:', publicUrl);

    return {
      qrCodeDataUrl,
      publicUrl
    };
  }

  /**
   * Generate QR code as SVG string for better printing quality
   * Uses secure token-based access
   * Note: billId is optional - if not provided or bill hasn't synced yet, creates customer-level token
   */
  public async generateBillQRCodeSVG(
    customerId: string,
    billId?: string | null,
    _billNumber?: string,
    _customerName?: string,
    options?: {
      size?: number;
      margin?: number;
      color?: {
        dark?: string;
        light?: string;
      };
    }
  ): Promise<string> {
    // Generate secure access token (billId is optional)
    const token = await this.generateAccessToken(customerId, billId);
    
    // Create the public URL with token
    const publicUrl = `${this.baseUrl}/public/statement/${token}`;
    
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
   * Note: billId is optional - if not provided or bill hasn't synced yet, creates customer-level token
   */
  public async generateBillQRCodeForPrint(
    customerId: string,
    billId?: string | null,
    billNumber?: string,
    customerName?: string
  ): Promise<QRCodeResult> {
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
   * Supports both old format (customerId/billId) and new format (token)
   */
  public parseQRCodeUrl(url: string): { token?: string; customerId?: string; billId?: string } | null {
    try {
      const urlObj = new URL(url);
      const pathParts = urlObj.pathname.split('/');
      
      // New format: /public/statement/token
      if (pathParts.length >= 3 && pathParts[1] === 'public' && pathParts[2] === 'statement') {
        return {
          token: pathParts[3]
        };
      }
      
      // Old format (deprecated): /public/customer-statement/customerId/billId
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
   * Get the public URL for a customer account statement (requires generating token first)
   * @deprecated Use generateBillQRCode instead to automatically generate token
   */
  public getCustomerStatementUrl(token: string): string {
    return `${this.baseUrl}/public/statement/${token}`;
  }

  /**
   * Get the current base URL being used
   */
  public getBaseUrl(): string {
    return this.baseUrl;
  }
}
