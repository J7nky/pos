import React from 'react';
import { useOfflineData } from '../../contexts/OfflineDataContext';

interface PrintLayoutProps {
  children: React.ReactNode;
  title: string;
  accountName?: string;
  accountNumber?: string;
  phone?: string;
  previousBalance?: { USD: number; LBP: number };
  currency?: 'USD' | 'LBP';
  dateRange?: { start: string; end: string };
  reportDate?: string;
  pageNumber?: number;
  totalPages?: number;
  showHeader?: boolean;
  showFooter?: boolean;
  showAccountInfo?: boolean;
  showOpeningBalance?: boolean;
}

export function PrintLayout({
  children,
  title,
  accountName,
  accountNumber,
  phone,
  previousBalance,
  currency = 'LBP',
  dateRange,
  reportDate,
  pageNumber = 1,
  totalPages = 1,
  showHeader = true,
  showFooter = true,
  showAccountInfo = true,
  showOpeningBalance = true,
}: PrintLayoutProps) {
  const offlineData = useOfflineData();
  const receiptSettings = offlineData?.receiptSettings || {
    storeName: 'KIWI VEGETABLES MARKET',
    address: '63-B2-Whole Sale Market, Tripoli - Lebanon',
    phone1: '+961 70 123 456',
    phone2: '03 123 456',
  };

  const formatCurrency = (amount: number, curr: 'USD' | 'LBP') => {
    if (curr === 'USD') {
      return `$${amount.toFixed(2)}`;
    } else {
      return `${Math.round(amount).toLocaleString()}`;
    }
  };

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleDateString('ar-LB', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    });
  };

  return (
    <div className="print-container" dir="rtl">
      {/* Header Section - Only on first page */}
      {showHeader && (
        <div className="print-header">
          <div className="print-company-info">
            {/* Company Logo Area */}
            <div className="print-company-logo">
              <span>Logo</span>
            </div>

            {/* Company Details */}
            <div className="print-company-details">
              <div className="print-company-name">{receiptSettings.storeName}</div>
              <div className="print-company-address">{receiptSettings.address}</div>
              <div className="print-company-contact">
                {receiptSettings.phone1} {receiptSettings.phone2 && `| ${receiptSettings.phone2}`}
              </div>
            </div>

            {/* Report Metadata */}
            <div className="print-report-metadata">
              {reportDate && (
                <div>
                  <span className="print-account-label">تاريخ التقرير:</span>{' '}
                  <span className="print-account-value">{formatDate(reportDate)}</span>
                </div>
              )}
              <div>
                <span className="print-account-label">رقم الصفحة:</span>{' '}
                <span className="print-account-value">
                  {pageNumber} {totalPages > 1 && `/ ${totalPages}`}
                </span>
              </div>
            </div>
          </div>

          {/* Report Title */}
          <div className="print-report-title">{title}</div>

          {/* Date Range */}
          {dateRange && (
            <div className="print-date-range">
              <span className="print-account-label">من تاريخ:</span>{' '}
              <span className="print-account-value">{formatDate(dateRange.start)}</span>
              {' '}
              <span className="print-account-label">إلى تاريخ:</span>{' '}
              <span className="print-account-value">{formatDate(dateRange.end)}</span>
            </div>
          )}
        </div>
      )}

      {/* Account/Customer Info Section - Only on first page */}
      {showAccountInfo && (accountName || accountNumber || phone) && (
        <div className="print-account-info print-section">
          <div>
            {accountName && (
              <div style={{ marginBottom: '6pt' }}>
                <span className="print-account-label">اسم الحساب:</span>{' '}
                <span className="print-account-value">{accountName}</span>
              </div>
            )}
            {accountNumber && (
              <div style={{ marginBottom: '6pt' }}>
                <span className="print-account-label">رقم الحساب:</span>{' '}
                <span className="print-account-value">{accountNumber}</span>
              </div>
            )}
            {phone && (
              <div>
                <span className="print-account-label">الهاتف:</span>{' '}
                <span className="print-account-value">{phone}</span>
              </div>
            )}
          </div>
          <div>
            <div>
              <span className="print-account-label">العملة:</span>{' '}
              <span className="print-currency-box">{currency === 'USD' ? '$' : 'ل.ل'}</span>
            </div>
            {showOpeningBalance && previousBalance && (
              <div style={{ marginTop: '8pt', padding: '6pt', background: '#f9f9f9', border: '1px solid #ddd' }}>
                <span className="print-account-label">الرصيد ما قبل:</span>{' '}
                <span className="print-opening-balance-value">
                  {formatCurrency(previousBalance[currency], currency)}{' '}
                  {currency === 'LBP' ? 'ل.ل' : ''}
                </span>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Page number for non-first pages */}
      {!showHeader && (
        <div className="print-header" style={{ marginBottom: '10pt', paddingBottom: '8pt', borderBottom: '1px solid #ddd' }}>
          <div className="print-report-metadata" style={{ textAlign: 'center', width: '100%' }}>
            <span className="print-account-label">رقم الصفحة:</span>{' '}
            <span className="print-account-value">
              {pageNumber} {totalPages > 1 && `/ ${totalPages}`}
            </span>
          </div>
        </div>
      )}

      {/* Content */}
      <div className="print-content">{children}</div>
    </div>
  );
}

