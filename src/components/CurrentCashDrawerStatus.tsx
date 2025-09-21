import React, { useState, useEffect } from 'react';
import { Clock, User, AlertTriangle, CheckCircle, Wallet, X } from 'lucide-react';
import { db } from '../lib/db';
import { useSupabaseAuth } from '../contexts/SupabaseAuthContext';
import { cashDrawerUpdateService } from '../services/cashDrawerUpdateService';
import { CashDrawerFlowTracker } from './CashDrawerFlowTracker';
import { InventoryVerificationModal } from './InventoryVerificationModal';

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
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-semibold text-gray-900">Verify Cash Balance</h3>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {error && (
          <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg">
            <div className="flex items-center">
              <AlertTriangle className="w-5 h-5 text-red-600 mr-2" />
              <span className="text-sm text-red-800">{error}</span>
            </div>
          </div>
        )}

        <div className="mb-4">
          <div className="bg-blue-50 p-3 rounded-lg mb-4">
            <p className="text-sm text-blue-800">
              <strong>Expected Amount:</strong> {formatCurrency(expectedAmount)}
            </p>
            <p className="text-sm text-blue-600 mt-1">
              Count the actual cash in the drawer and enter the amount below.
            </p>
          </div>

          <div className="mb-4">
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Actual Amount in Drawer
            </label>
            <input
              type="number"
              step="0.01"
              value={actualAmount}
              onChange={(e) => setActualAmount(parseFloat(e.target.value) || 0)}
              className={`w-full px-3 py-2 border rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent ${
                actualAmount <= 0 ? 'border-red-300' : 'border-gray-300'
              }`}
              placeholder="Enter actual amount"
            />
            {actualAmount <= 0 && (
              <p className="mt-1 text-sm text-red-600">
                Please enter a valid amount greater than 0
              </p>
            )}
          </div>

          {actualAmount !== expectedAmount && (
            <div className={`p-3 rounded-lg mb-4 ${
              actualAmount > expectedAmount 
                ? 'bg-green-50 border border-green-200' 
                : 'bg-red-50 border border-red-200'
            }`}>
              <p className={`text-sm ${
                actualAmount > expectedAmount ? 'text-green-800' : 'text-red-800'
              }`}>
                <strong>Variance:</strong> {formatCurrency(Math.abs(actualAmount - expectedAmount))}
                {actualAmount > expectedAmount ? ' (Over)' : ' (Short)'}
              </p>
            </div>
          )}
        </div>

        <div className="flex justify-end space-x-3">
          <button
            onClick={onClose}
            disabled={loading}
            className="px-4 py-2 text-gray-700 bg-gray-200 rounded-md hover:bg-gray-300 disabled:opacity-50"
          >
            Cancel
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
            {loading ? 'Closing...' : 'Close Drawer'}
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
  const [status, setStatus] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [showInventoryModal, setShowInventoryModal] = useState(false);
  const [showCashBalanceModal, setShowCashBalanceModal] = useState(false);
  const [closingLoading, setClosingLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [, setInventoryVerificationData] = useState<any>(null);
  const { userProfile } = useSupabaseAuth();

  useEffect(() => {
    loadStatus();
  }, [storeId]);

  const loadStatus = async () => {
    setLoading(true);
    try {
      const currentStatus = await getCurrentStatus();
      setStatus(currentStatus);
    } catch (error) {
      console.error('Error loading cash drawer status:', error);
      setStatus({ status: 'error', message: 'Error loading status' });
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
      
      // Close the cash drawer session using the service
      const result = await cashDrawerUpdateService.closeCashDrawer(
        status.sessionId,
        actualAmount,
        currentUserId,
        'Cash drawer closed by user'
      );
      
      if (result.success) {
        // After closing, ensure the account balance is set to the actual value
        const account = await db.getCashDrawerAccount(storeId);
        if (account && account.current_balance !== actualAmount) {
          await db.cash_drawer_accounts.update(account.id, {
            current_balance: actualAmount,
            _synced: false
          });
        }
        // Closing successful
        
        // Refresh the status
        await loadStatus();
        
        // Show success message with variance information
        console.log('Cash drawer closed successfully', {
          expectedAmount: result.expectedAmount,
          actualAmount: result.actualAmount,
          variance: result.variance
        });
      } else {
        console.error('Failed to close cash drawer:', result.error);
        setError(result.error || 'Failed to close cash drawer.');
      }
      
    } catch (error) {
      console.error('Error closing cash drawer:', error);
      setError('An unexpected error occurred while closing the cash drawer.');
    } finally {
      setClosingLoading(false);
    }
  };


  const handleInventoryVerificationComplete = (verificationData: any) => {
    setInventoryVerificationData(verificationData);
    setShowInventoryModal(false);
    setShowCashBalanceModal(true); // Move to cash balance step
    console.log('Inventory verification completed:', verificationData);
  };

  const handleInventoryModalClose = () => {
    setShowInventoryModal(false);
  };

  const handleCashBalanceComplete = (actualAmount: number) => {
    setShowCashBalanceModal(false);
    handleCloseCashDrawer(actualAmount);
  };

  const handleCashBalanceModalClose = () => {
    setShowCashBalanceModal(false);
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
        <h4 className="text-lg font-semibold text-gray-900 mb-4">Current Status</h4>
        
        {status.status === 'active' ? (
          <>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              <div className="bg-green-50 p-4 rounded-lg border border-green-200">
                <div className="flex items-center">
                  <CheckCircle className="w-5 h-5 text-green-600 mr-2" />
                  <span className="text-sm font-medium text-green-800">Active Session</span>
                </div>
                <div className="mt-2 text-2xl font-bold text-green-900">
                  {formatCurrency(status.currentBalance)}
                </div>
                <div className="text-sm text-green-600">Current Balance</div>
              </div>
              
              <div className="bg-blue-50 p-4 rounded-lg border border-blue-200">
                <div className="flex items-center">
                  <User className="w-5 h-5 text-blue-600 mr-2" />
                  <span className="text-sm font-medium text-blue-800">Opened By</span>
                </div>
                <div className="mt-2 text-lg font-semibold text-blue-900">
                  {status.openedBy}
                </div>
                <div className="text-sm text-blue-600">Employee</div>
              </div>
              
              <div className="bg-purple-50 p-4 rounded-lg border border-purple-200">
                <div className="flex items-center">
                  <Clock className="w-5 h-5 text-purple-600 mr-2" />
                  <span className="text-sm font-medium text-purple-800">Session Duration</span>
                </div>
                <div className="mt-2 text-lg font-semibold text-purple-900">
                  {formatDuration(status.sessionDuration)}
                </div>
                <div className="text-sm text-purple-600">Time Open</div>
              </div>
            </div>
            
            <div className="mt-6 p-4 bg-gray-50 rounded-lg">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <span className="text-sm font-medium text-gray-600">Session ID:</span>
                  <span className="ml-2 text-sm text-gray-900 font-mono">{status.sessionId}</span>
                </div>
                <div>
                  <span className="text-sm font-medium text-gray-600">Opened At:</span>
                  <span className="ml-2 text-sm text-gray-900">
                    {new Date(status.openedAt).toLocaleString()}
                  </span>
                </div>
                <div>
                  <span className="text-sm font-medium text-gray-600">Opening Amount:</span>
                  <span className="ml-2 text-sm text-gray-900 font-semibold">
                    {formatCurrency(status.openingAmount)}
                  </span>
                </div>
              </div>
            </div>
            
            {/* Close Cash Drawer Button */}
            <div className="mt-6 flex justify-between items-center">
              <button
                onClick={() => {
                  setShowInventoryModal(true); // Start with inventory verification
                }}
                className="bg-red-600 text-white px-6 py-2 rounded-md hover:bg-red-700 text-sm font-medium"
              >
                Close Cash Drawer
              </button>
              
              <button
                onClick={loadStatus}
                className="bg-blue-600 text-white px-4 py-2 rounded-md hover:bg-blue-700 text-sm"
              >
                Refresh Status
              </button>
            </div>
          </>
        ) : (
          <div className="text-center py-8">
            <div className="mb-4">
              <Wallet className="w-16 h-16 text-gray-300 mx-auto" />
            </div>
            <p className="text-lg font-medium text-gray-900 mb-2">No Active Session</p>
            <p className="text-gray-600 mb-4">{status.message}</p>
            <div className="bg-yellow-50 p-4 rounded-lg border border-yellow-200">
              <div className="flex items-center">
                <AlertTriangle className="w-5 h-5 text-yellow-600 mr-2" />
                <span className="text-sm text-yellow-800">
                  Cash drawer must be opened to start tracking transactions
                </span>
              </div>
            </div>
            
            <div className="mt-6">
              <button
                onClick={loadStatus}
                className="bg-blue-600 text-white px-4 py-2 rounded-md hover:bg-blue-700 text-sm"
              >
                Refresh Status
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Cash Flow Tracker - Show when there's an active session */}
      {status.status === 'active' && status.sessionId && (
        <div className="mt-6">
          <CashDrawerFlowTracker 
            sessionId={status.sessionId} 
            storeId={storeId} 
          />
        </div>
      )}

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




