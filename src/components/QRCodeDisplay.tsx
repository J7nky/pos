import React, { useState, useEffect } from 'react';
import { QRCodeService } from '../services/qrCodeService';

interface QRCodeDisplayProps {
  customerId: string;
  billId: string;
  billNumber: string;
  customerName: string;
  size?: number;
  showLabel?: boolean;
  className?: string;
  onError?: (error: string) => void;
}

export default function QRCodeDisplay({
  customerId,
  billId,
  billNumber,
  customerName,
  size = 200,
  showLabel = true,
  className = '',
  onError
}: QRCodeDisplayProps) {
  const [qrCodeDataUrl, setQrCodeDataUrl] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    generateQRCode();
  }, [customerId, billId, billNumber, customerName, size]);

  const generateQRCode = async () => {
    if (!customerId || !billId) {
      setError('Missing customer or bill information');
      setIsLoading(false);
      return;
    }

    try {
      setIsLoading(true);
      setError(null);

      const qrService = QRCodeService.getInstance();
      const qrCodeUrl = await qrService.generateBillQRCode(
        customerId,
        billId,
        billNumber,
        customerName,
        { size }
      );

      setQrCodeDataUrl(qrCodeUrl);
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to generate QR code';
      setError(errorMessage);
      onError?.(errorMessage);
    } finally {
      setIsLoading(false);
    }
  };

  const handleImageError = () => {
    const errorMessage = 'Failed to load QR code image';
    setError(errorMessage);
    onError?.(errorMessage);
  };

  if (isLoading) {
    return (
      <div className={`flex flex-col items-center justify-center ${className}`}>
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
        {showLabel && (
          <p className="mt-2 text-sm text-gray-500">Generating QR code...</p>
        )}
      </div>
    );
  }

  if (error) {
    return (
      <div className={`flex flex-col items-center justify-center ${className}`}>
        <div className="w-16 h-16 bg-red-100 rounded-lg flex items-center justify-center">
          <span className="text-red-600 text-xs">Error</span>
        </div>
        {showLabel && (
          <p className="mt-2 text-sm text-red-500 text-center">{error}</p>
        )}
      </div>
    );
  }

  return (
    <div className={`flex flex-col items-center ${className}`}>
      {qrCodeDataUrl && (
        <img
          src={qrCodeDataUrl}
          alt={`QR code for ${customerName} - Bill ${billNumber}`}
          width={size}
          height={size}
          onError={handleImageError}
          className="border border-gray-200 rounded-lg"
        />
      )}
      {showLabel && (
        <div className="mt-2 text-center">
          <p className="text-xs text-gray-600 font-medium">Scan for Account Statement</p>
          <p className="text-xs text-gray-500">Bill: {billNumber}</p>
        </div>
      )}
    </div>
  );
}

// Component specifically for receipt printing
export function ReceiptQRCode({
  customerId,
  billId,
  billNumber,
  customerName,
  className = ''
}: Omit<QRCodeDisplayProps, 'size' | 'showLabel'>) {
  return (
    <QRCodeDisplay
      customerId={customerId}
      billId={billId}
      billNumber={billNumber}
      customerName={customerName}
      size={120}
      showLabel={false}
      className={className}
    />
  );
}

// Component for bill display with larger QR code
export function BillQRCode({
  customerId,
  billId,
  billNumber,
  customerName,
  className = ''
}: Omit<QRCodeDisplayProps, 'size' | 'showLabel'>) {
  return (
    <QRCodeDisplay
      customerId={customerId}
      billId={billId}
      billNumber={billNumber}
      customerName={customerName}
      size={200}
      showLabel={true}
      className={className}
    />
  );
}
