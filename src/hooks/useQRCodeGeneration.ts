import { useState, useCallback } from 'react';
import { QRCodeService } from '../services/qrCodeService';

export interface QRCodeGenerationResult {
  qrCodeDataUrl: string | null;
  qrCodeUrl: string | null;
  isLoading: boolean;
  error: string | null;
}

export function useQRCodeGeneration() {
  const [state, setState] = useState<QRCodeGenerationResult>({
    qrCodeDataUrl: null,
    qrCodeUrl: null,
    isLoading: false,
    error: null
  });

  const generateQRCode = useCallback(async (
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
  ) => {
    if (!customerId || !billId) {
      setState(prev => ({
        ...prev,
        error: 'Missing customer or bill information',
        isLoading: false
      }));
      return;
    }

    try {
      setState(prev => ({
        ...prev,
        isLoading: true,
        error: null
      }));

      const qrService = QRCodeService.getInstance();
      
      // Generate QR code data URL
      const qrCodeDataUrl = await qrService.generateBillQRCode(
        customerId,
        billId,
        billNumber,
        customerName,
        options
      );

      // Get the public URL
      const qrCodeUrl = qrService.getCustomerStatementUrl(customerId, billId);

      setState({
        qrCodeDataUrl,
        qrCodeUrl,
        isLoading: false,
        error: null
      });

      return { qrCodeDataUrl, qrCodeUrl };
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to generate QR code';
      setState(prev => ({
        ...prev,
        isLoading: false,
        error: errorMessage
      }));
      throw err;
    }
  }, []);

  const generateQRCodeForPrint = useCallback(async (
    customerId: string,
    billId: string,
    billNumber: string,
    customerName: string
  ) => {
    return generateQRCode(customerId, billId, billNumber, customerName, {
      size: 300,
      margin: 3,
      color: {
        dark: '#000000',
        light: '#FFFFFF'
      }
    });
  }, [generateQRCode]);

  const generateQRCodeForReceipt = useCallback(async (
    customerId: string,
    billId: string,
    billNumber: string,
    customerName: string
  ) => {
    return generateQRCode(customerId, billId, billNumber, customerName, {
      size: 120,
      margin: 2,
      color: {
        dark: '#000000',
        light: '#FFFFFF'
      }
    });
  }, [generateQRCode]);

  const clearQRCode = useCallback(() => {
    setState({
      qrCodeDataUrl: null,
      qrCodeUrl: null,
      isLoading: false,
      error: null
    });
  }, []);

  return {
    ...state,
    generateQRCode,
    generateQRCodeForPrint,
    generateQRCodeForReceipt,
    clearQRCode
  };
}
