import React, { useState, useEffect } from 'react';
import { Clock, User, AlertTriangle, CheckCircle, Wallet, X } from 'lucide-react';
import { useSupabaseAuth } from '../contexts/SupabaseAuthContext';
import { useOfflineData } from '../contexts/OfflineDataContext';
import { InventoryVerificationModal } from './accountingPage/modals/InventoryVerificationModal';
import { MissedProductsSummary } from './MissedProductsSummary';
import { missedProductsService } from '../services/missedProductsService';
import { useI18n } from '../i18n';
import { EmployeeService } from '../services/employeeService';
import { Employee } from '../types';

interface CurrentCashDrawerStatusProps {
  storeId: string;
  getCurrentStatus: () => Promise<any>;
}


// Simple Cash Balance Modal
const CashBalanceModal: React.FC<{
  isOpen: boolean;
  onClose: () => void;
  onConfirm: (actualAmount: number) => void;
  expectedAmount: number;
  loading: boolean;
  error?: string;
}> = ({ isOpen, onClose, onConfirm, expectedAmount, loading, error }) => {
  const { t } = useI18n();
  const [actualAmount, setActualAmount] = useState(expectedAmount);

  useEffect(() => {
    if (isOpen) {
      setActualAmount(expectedAmount);
    }
  }, [isOpen, expectedAmount]);

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD'
    }).format(amount);
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg p-6 w-full max-w-md mx-4">
        <div className="flex items-center justify-between mb-4 rtl:flex-row-reverse">
          <h3 className="text-lg font-semibold text-gray-900 rtl:text-right">{t('cashDrawer.verifyCashBalance')}</h3>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {error && (
          <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg">
            <div className="flex items-center rtl:space-x-reverse">
              <AlertTriangle className="w-5 h-5 text-red-600 rtl:ml-2 ltr:mr-2" />
              <span className="text-sm text-red-800 rtl:text-right">{error}</span>
            </div>
          </div>
        )}

        <div className="mb-4">
          <div className="bg-blue-50 p-3 rounded-lg mb-4">
            <p className="text-sm text-blue-800 rtl:text-right">
              <strong>{t('cashDrawer.expectedAmount')}:</strong> {formatCurrency(expectedAmount)}
            </p>
            <p className="text-sm text-blue-600 mt-1 rtl:text-right">
              {t('cashDrawer.countCashInstructions')}
            </p>
          </div>

          <div className="mb-4">
            <label className="block text-sm font-medium text-gray-700 mb-2 rtl:text-right">
              {t('cashDrawer.actualAmountInDrawer')}
            </label>
            <input
              type="number"
              step="0.01"
              value={actualAmount}
              onChange={(e) => setActualAmount(parseFloat(e.target.value) || 0)}
              className={`w-full px-3 py-2 border rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent ${
                actualAmount <= 0 ? 'border-red-300' : 'border-gray-300'
              }`}
              placeholder={t('cashDrawer.enterActualAmount')}
            />
            {actualAmount <= 0 && (
              <p className="mt-1 text-sm text-red-600 rtl:text-right">
                {t('cashDrawer.validAmountRequired')}
              </p>
            )}
          </div>

          {actualAmount !== expectedAmount && (
            <div className={`p-3 rounded-lg mb-4 ${
              actualAmount > expectedAmount 
                ? 'bg-green-50 border border-green-200' 
                : 'bg-red-50 border border-red-200'
            }`}>
              <p className={`text-sm rtl:text-right ${
                actualAmount > expectedAmount ? 'text-green-800' : 'text-red-800'
              }`}>
                <strong>{t('cashDrawer.variance')}:</strong> {formatCurrency(Math.abs(actualAmount - expectedAmount))}
                {actualAmount > expectedAmount ? ` (${t('cashDrawer.over')})` : ` (${t('cashDrawer.short')})`}
              </p>
            </div>
          )}
        </div>

        <div className="flex justify-end space-x-3 rtl:space-x-reverse">
          <button
            onClick={onClose}
            disabled={loading}
            className="px-4 py-2 text-gray-700 bg-gray-200 rounded-md hover:bg-gray-300 disabled:opacity-50"
          >
            {t('cashDrawer.cancel')}
          </button>
          <button
            onClick={() => onConfirm(actualAmount)}
            disabled={loading || actualAmount <= 0}
            className={`px-4 py-2 rounded-md text-sm ${
              actualAmount <= 0 
                ? 'bg-gray-400 text-gray-600 cursor-not-allowed' 
                : 'bg-red-600 text-white hover:bg-red-700'
            }`}
          >
            {loading ? t('cashDrawer.closing') : t('cashDrawer.closeDrawer')}
          </button>
        </div>
      </div>
    </div>
  );
};

export const CurrentCashDrawerStatus: React.FC<CurrentCashDrawerStatusProps> = ({ 
  storeId, 
  getCurrentStatus 
}) => {
  const { t } = useI18n();
  const [status, setStatus] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [showInventoryModal, setShowInventoryModal] = useState(false);
  const [showCashBalanceModal, setShowCashBalanceModal] = useState(false);
  const [closingLoading, setClosingLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [inventoryVerificationData, setInventoryVerificationData] = useState<any>(null);
  const [openedByEmployee, setOpenedByEmployee] = useState<Employee | null>(null);
  const { userProfile } = useSupabaseAuth();
  const { closeCashDrawer: contextCloseCashDrawer } = useOfflineData();

  useEffect(() => {
    loadStatus();
  }, [storeId]);

  const loadStatus = async () => {
    setLoading(true);
    try {
      const currentStatus = await getCurrentStatus();
      console.log(currentStatus,12312312);
      setStatus(currentStatus);
      
      // Fetch employee information if session is active and openedBy exists
      if (currentStatus?.status === 'active' && currentStatus?.openedBy) {
        try {
          const employee = await EmployeeService.getEmployee(currentStatus.openedBy);
          if (employee) {
            // Handle legacy data structure where 'cashier' field contains the role
            // Some old records might have 'cashier' instead of 'role'
            if (!employee.role && (employee as any).cashier) {
              (employee as any).role = (employee as any).cashier;
              console.log('Fixed employee role from cashier field:', employee);
            }
          }
          setOpenedByEmployee(employee || null);
        } catch (error) {
          console.error('Error loading employee info:', error);
          setOpenedByEmployee(null);
        }
      } else {
        setOpenedByEmployee(null);
      }
    } catch (error) {
      console.error('Error loading cash drawer status:', error);
      setStatus({ status: 'error', message: 'Error loading status' });
      setOpenedByEmployee(null);
    } finally {
      setLoading(false);
    }
  };

  const handleCloseCashDrawer = async (actualAmount: number) => {
    if (!status?.sessionId) return;
    
    setClosingLoading(true);
    setError(null); // Clear previous errors
    try {
      // Get current user ID from auth context
      const currentUserId = userProfile?.id || 'unknown-user';
      
      // Process inventory verification data if available
      if (inventoryVerificationData) {
        console.log('📊 Processing inventory verification data for session:', status.sessionId);
        try {
          const missedProductsResult = await missedProductsService.recordMissedProducts(
            status.sessionId, 
            storeId,
            inventoryVerificationData
          );
          
          if (missedProductsResult.success) {
            console.log(`📊 Recorded ${missedProductsResult.recordedCount} missed products for session ${status.sessionId}`);
          } else {
            console.error('Failed to record missed products:', missedProductsResult.error);
          }
        } catch (error) {
          console.error('Error recording missed products:', error);
        }
      }
      
      // Use the context method to close cash drawer (follows offline-first architecture)
      await contextCloseCashDrawer(
        actualAmount,
        currentUserId,
        'Cash drawer closed by user'
      );
      
      // Refresh the status
      await loadStatus();
      
      // Clear the verification data since it's been processed
      setInventoryVerificationData(null);
      
      console.log('Cash drawer closed successfully');
      
    } catch (error) {
      console.error('Error closing cash drawer:', error);
      setError('An unexpected error occurred while closing the cash drawer.');
    } finally {
      setClosingLoading(false);
    }
  };


  const handleInventoryVerificationComplete = async (verificationData: any) => {
    // Store verification data for later processing when cash drawer is actually closed
    setInventoryVerificationData(verificationData);
    
    setShowInventoryModal(false);
    setShowCashBalanceModal(true); // Move to cash balance step
    console.log('Inventory verification completed, moving to cash balance verification:', verificationData);
  };

  const handleInventoryModalClose = () => {
    setShowInventoryModal(false);
    // Clear verification data if user cancels the process
    setInventoryVerificationData(null);
  };

  const handleCashBalanceComplete = (actualAmount: number) => {
    setShowCashBalanceModal(false);
    handleCloseCashDrawer(actualAmount);
  };

  const handleCashBalanceModalClose = () => {
    setShowCashBalanceModal(false);
    // Clear verification data if user cancels the process
    setInventoryVerificationData(null);
  };

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD'
    }).format(amount);
  };

  const formatDuration = (milliseconds: number) => {
    const hours = Math.floor(milliseconds / (1000 * 60 * 60));
    const minutes = Math.floor((milliseconds % (1000 * 60 * 60)) / (1000 * 60));
    return `${hours}h ${minutes}m`;
  };

  const getRoleDisplayName = (role: string | undefined | null): string => {
    if (!role) return 'Employee'; // Default fallback
    const roleMap: Record<string, string> = {
      'admin': 'Admin',
      'manager': 'Manager',
      'cashier': 'Employee'
    };
    return roleMap[role] || 'Employee';
  };

  if (loading) {
    return (
      <div className="bg-white rounded-lg shadow-sm p-6 border border-gray-200">
        <div className="flex items-center justify-center py-8">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
        </div>
      </div>
    );
  }

  if (!status) {
    return null;
  }

  return (
    <>
      <div className="bg-white rounded-lg shadow-sm p-6 border border-gray-200">
        <h4 className="text-lg font-semibold text-gray-900 mb-4 rtl:text-right">{t('cashDrawer.currentStatus')}</h4>
        
        {status.status === 'active' ? (
          <>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              <div className="bg-green-50 p-4 rounded-lg border border-green-200">
                <div className="flex items-center rtl:space-x-reverse">
                  <CheckCircle className="w-5 h-5 text-green-600 rtl:ml-2 ltr:mr-2" />
                  <span className="text-sm font-medium text-green-800 rtl:text-right">{t('cashDrawer.activeSession')}</span>
                </div>
                <div className="mt-2 text-2xl font-bold text-green-900 rtl:text-right">
                  {formatCurrency(status.currentBalance)}
                </div>
                <div className="text-sm text-green-600 rtl:text-right">{t('cashDrawer.currentBalance')}</div>
              </div>
              
              <div className="bg-blue-50 p-4 rounded-lg border border-blue-200">
                <div className="flex items-center rtl:space-x-reverse">
                  <User className="w-5 h-5 text-blue-600 rtl:ml-2 ltr:mr-2" />
                  <span className="text-sm font-medium text-blue-800 rtl:text-right">{t('cashDrawer.openedBy')}</span>
                </div>
                <div className="mt-2 text-lg font-semibold text-blue-900 rtl:text-right">
                  {openedByEmployee 
                    ? `${openedByEmployee.name}`
                    : status.openedBy}
                </div>
                <div className="text-sm text-blue-600 rtl:text-right">{`${getRoleDisplayName(openedByEmployee?.role || (openedByEmployee as any)?.cashier)}`}</div>
              </div>
              
              <div className="bg-purple-50 p-4 rounded-lg border border-purple-200">
                <div className="flex items-center rtl:space-x-reverse">
                  <Clock className="w-5 h-5 text-purple-600 rtl:ml-2 ltr:mr-2" />
                  <span className="text-sm font-medium text-purple-800 rtl:text-right">{t('cashDrawer.sessionDuration')}</span>
                </div>
                <div className="mt-2 text-lg font-semibold text-purple-900 rtl:text-right">
                  {formatDuration(status.sessionDuration)}
                </div>
                <div className="text-sm text-purple-600 rtl:text-right">{t('cashDrawer.timeOpen')}</div>
              </div>
            </div>
            
            <div className="mt-6 p-4 bg-gray-50 rounded-lg">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
               
                <div className="rtl:text-right">
                  <span className="text-sm font-medium text-gray-600">{t('cashDrawer.openedAt')}:</span>
                  <span className="rtl:mr-2 ltr:ml-2 text-sm text-gray-900">
                    {new Date(status.openedAt).toLocaleString()}
                  </span>
                </div>
                <div className="rtl:text-right">
                  <span className="text-sm font-medium text-gray-600">{t('cashDrawer.openingAmount')}:</span>
                  <span className="rtl:mr-2 ltr:ml-2 text-sm text-gray-900 font-semibold">
                    {formatCurrency(status.openingAmount)}
                  </span>
                </div>
              </div>
            </div>

            {/* Missed Products Summary */}
            <MissedProductsSummary sessionId={status.sessionId} storeId={storeId} />
            
            {/* Process Status Indicator */}
            <div className="mt-4 p-4 bg-blue-50 border border-blue-200 rounded-lg">
              <h4 className="text-sm font-medium text-blue-800 mb-2 rtl:text-right">{t('cashDrawer.closingProcess')}</h4>
              <div className="flex items-center space-x-6 rtl:space-x-reverse">
                <div className={`flex items-center rtl:space-x-reverse ${inventoryVerificationData ? 'text-green-600' : 'text-gray-500'}`}>
                  <div className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold ${
                    inventoryVerificationData ? 'bg-green-100 text-green-600' : 'bg-gray-100 text-gray-500'
                  }`}>
                    {inventoryVerificationData ? '✓' : '1'}
                  </div>
                  <span className="rtl:mr-2 ltr:ml-2 text-sm font-medium rtl:text-right">{t('cashDrawer.inventoryCheck')}</span>
                </div>
                <div className="text-gray-300 rtl:rotate-180">→</div>
                <div className={`flex items-center rtl:space-x-reverse ${inventoryVerificationData ? 'text-blue-600' : 'text-gray-400'}`}>
                  <div className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold ${
                    inventoryVerificationData ? 'bg-blue-100 text-blue-600' : 'bg-gray-100 text-gray-400'
                  }`}>
                    2
                  </div>
                  <span className="rtl:mr-2 ltr:ml-2 text-sm font-medium rtl:text-right">{t('cashDrawer.cashBalance')}</span>
                </div>
                <div className="text-gray-300 rtl:rotate-180">→</div>
                <div className="flex items-center text-gray-400 rtl:space-x-reverse">
                  <div className="w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold bg-gray-100 text-gray-400">
                    3
                  </div>
                  <span className="rtl:mr-2 ltr:ml-2 text-sm font-medium rtl:text-right">{t('cashDrawer.closeDrawer')}</span>
                </div>
              </div>
              {inventoryVerificationData && (
                <p className="mt-2 text-xs text-blue-600 rtl:text-right">✓ {t('cashDrawer.inventoryVerificationCompleted')}</p>
              )}
            </div>
            
            {/* Close Cash Drawer Button */}
            <div className="mt-6 flex justify-between items-center ">
                <button
                  onClick={async () => {
                    // Check if inventory verification has already been completed for this session
                    if (inventoryVerificationData) {
                      console.log('⚠️ Inventory verification already completed for this session, proceeding to cash balance');
                      setShowCashBalanceModal(true);
                    } else {
                      setShowInventoryModal(true); // Start with inventory verification
                    }
                  }}
                  className="bg-red-600 text-white px-6 py-2 rounded-md hover:bg-red-700 text-sm font-medium"
                >
                  {inventoryVerificationData ? t('cashDrawer.continueToCashBalance') : t('cashDrawer.startClosingProcess')}
                </button>
              
              <button
                onClick={loadStatus}
                className="bg-blue-600 text-white px-4 py-2 rounded-md hover:bg-blue-700 text-sm"
              >
                {t('cashDrawer.refreshStatus')}
              </button>
            </div>
          </>
        ) : (
          <div className="text-center py-8">
            <div className="mb-4">
              <Wallet className="w-16 h-16 text-gray-300 mx-auto" />
            </div>
            <p className="text-lg font-medium text-gray-900 mb-2 rtl:text-right">{t('cashDrawer.noActiveSession')}</p>
            <p className="text-gray-600 mb-4 rtl:text-right">{status.message}</p>
            <div className="bg-yellow-50 p-4 rounded-lg border border-yellow-200">
              <div className="flex items-center rtl:space-x-reverse">
                <AlertTriangle className="w-5 h-5 text-yellow-600 rtl:ml-2 ltr:mr-2" />
                <span className="text-sm text-yellow-800 rtl:text-right">
                  {t('cashDrawer.mustBeOpenedMessage')}
                </span>
              </div>
            </div>
            
            <div className="mt-6">
              <button
                onClick={loadStatus}
                className="bg-blue-600 text-white px-4 py-2 rounded-md hover:bg-blue-700 text-sm"
              >
                {t('cashDrawer.refreshStatus')}
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Inventory Verification Modal */}
      <InventoryVerificationModal
        isOpen={showInventoryModal}
        onClose={handleInventoryModalClose}
        onConfirm={handleInventoryVerificationComplete}
        loading={false}
      />

      {/* Cash Balance Modal */}
      <CashBalanceModal
        isOpen={showCashBalanceModal}
        onClose={handleCashBalanceModalClose}
        onConfirm={handleCashBalanceComplete}
        expectedAmount={status.currentBalance || 0}
        loading={closingLoading}
        error={error || undefined}
      />
    </>
  );
};




