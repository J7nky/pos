import React, { useState, useEffect } from 'react';
import { useOfflineData } from '../../contexts/OfflineDataContext';
import { useI18n } from '../../i18n';
import { useSupabaseAuth } from '../../contexts/SupabaseAuthContext';
import { getDB } from '../../lib/db';
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
  const { t } = useI18n();
  const offlineData = useOfflineData();
  const { userProfile } = useSupabaseAuth();
  const [receiptSettings, setReceiptSettings] = useState<any>(offlineData?.receiptSettings || {
    storeName: '',
    address: '',
    phone1: '',
    phone2: '',
  });
  const [logo, setLogo] = useState<string | null>(null);

  // Fetch store data and logo if receipt settings are missing store info
  useEffect(() => {
    const fetchStoreData = async () => {
      // If receipt settings already have store name, use them
      if (offlineData?.receiptSettings?.storeName) {
        setReceiptSettings(offlineData.receiptSettings);
      } else {
        // Otherwise, try to fetch from store
        const storeId = userProfile?.store_id;
        if (storeId) {
          try {
            const store = await getDB().stores.get(storeId);
            if (store) {
              setReceiptSettings({
                storeName: store.name || '',
                address: store.address || '',
                phone1: store.phone || '',
                phone2: '',
              });
            } else if (offlineData?.receiptSettings) {
              // Fallback to receipt settings even if empty
              setReceiptSettings(offlineData.receiptSettings);
            }
          } catch (error) {
            console.error('Error fetching store data for print layout:', error);
            if (offlineData?.receiptSettings) {
              setReceiptSettings(offlineData.receiptSettings);
            }
          }
        } else if (offlineData?.receiptSettings) {
          setReceiptSettings(offlineData.receiptSettings);
        }
      }

      // Fetch logo
      const storeId = userProfile?.store_id;
      const branchId = offlineData?.currentBranchId;
      if (storeId && branchId && offlineData?.getBranchLogo) {
        try {
          const branchLogo = await offlineData.getBranchLogo(branchId, storeId);
          setLogo(branchLogo);
        } catch (error) {
          console.error('Error fetching logo for print layout:', error);
        }
      }
    };

    fetchStoreData();
  }, [offlineData?.receiptSettings, offlineData?.currentBranchId, offlineData?.getBranchLogo, userProfile?.store_id]);

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
              {logo ? (
                <img 
                  src={logo} 
                  alt="Company Logo" 
                  style={{ 
                    maxWidth: '100%', 
                    maxHeight: '100%', 
                    objectFit: 'contain' 
                  }} 
                />
              ) : (
                <span>Logo</span>
              )}
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
                  <span className="print-account-label">{t('receipt.date')}:</span>{' '}
                  <span className="print-account-value">{formatDate(reportDate)}</span>
                </div>
              )}
              <div>
                <span className="print-account-label">{t('receipt.pageNumber')}:</span>{' '}
                <span className="print-account-value">
                  {pageNumber} {totalPages > 1 && `/ ${totalPages}`}
                </span>
              </div>
            </div>
          </div>

          {/* Report Title */}
          <div className="print-report-title">{title}</div>
        </div>
      )}

      {/* Account/Customer Info Section - Only on first page */}
      {showAccountInfo && (accountName || accountNumber || phone) && (
        <div className="print-account-info print-section">
          {/* First Row: Account Name, Account Number, Phone */}
          <div className="print-account-info-row center-items">
            <div className="print-account-info-col">
              {accountName && (
                <div>
                  <span className="print-account-label">{t('receipt.accountName')}:</span>{' '}
                  <span className="print-account-value">{accountName}</span>
                </div>
              )}
            </div>
            <div className="print-account-info-col">
              {accountNumber && (
                <div>
                  <span className="print-account-label">{t('receipt.accountNumber')}:</span>{' '}
                  <span className="print-account-value">{accountNumber}</span>
                </div>
              )}
            </div>
            <div className="print-account-info-col">
              {phone && (
                <div>
                  <span className="print-account-label">{t('receipt.phone')}:</span>{' '}
                  <span className="print-account-value">{phone}</span>
                </div>
              )}
            </div>
          </div>
          {/* Second Row: Date Range, Balance Before, Currency */}
          <div className="print-account-info-row">
            <div className="print-account-info-col">
              {dateRange && (
                <div>
                  <span className="print-account-label">{t('receipt.fromDate')}:</span>{' '}
                  <span className="print-account-value">{formatDate(dateRange.start)}</span>
                  {' '}
                  <span className="print-account-label">{t('receipt.toDate')}:</span>{' '}
                  <span className="print-account-value">{formatDate(dateRange.end)}</span>
                </div>
              )}
            </div>
            <div className="print-account-info-col">
              {showOpeningBalance && previousBalance && (
                <div>
                  <span className="print-account-label">{t('receipt.previousBalance')}:</span>{' '}
                  <span className="print-opening-balance-value">
                    {formatCurrency(previousBalance[currency], currency)}{' '}
                    {currency === 'LBP' ? 'ل.ل' : ''}
                  </span>
                </div>
              )}
            </div>
            <div className="print-account-info-col">
              <div>
                <span className="print-account-label">{t('receipt.currency')}:</span>{' '}
                <span className="print-currency-box">{currency === 'USD' ? '$' : 'ل.ل'}</span>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Page number for non-first pages */}
      {!showHeader && (
        <div className="print-header" style={{ marginBottom: '10pt', paddingBottom: '8pt', borderBottom: '1px solid #ddd' }}>
          <div className="print-report-metadata" style={{ textAlign: 'center', width: '100%' }}>
            <span className="print-account-label">{t('receipt.pageNumber')}:</span>{' '}
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

