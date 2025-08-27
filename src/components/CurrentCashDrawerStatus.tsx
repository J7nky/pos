import React, { useState, useEffect } from 'react';
import { Clock, User, DollarSign, AlertTriangle, CheckCircle, Wallet } from 'lucide-react';

interface CurrentCashDrawerStatusProps {
  storeId: string;
  getCurrentStatus: () => Promise<any>;
}

export const CurrentCashDrawerStatus: React.FC<CurrentCashDrawerStatusProps> = ({ 
  storeId, 
  getCurrentStatus 
}) => {
  const [status, setStatus] = useState<any>(null);
  const [loading, setLoading] = useState(true);

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
    <div className="bg-white rounded-lg shadow-sm p-6 border border-gray-200">
      <h4 className="text-lg font-semibold text-gray-900 mb-4">Current Status</h4>
      
      {status.status === 'active' ? (
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
        </div>
      )}
      
      <div className="mt-6 flex justify-end">
        <button
          onClick={loadStatus}
          className="bg-blue-600 text-white px-4 py-2 rounded-md hover:bg-blue-700 text-sm"
        >
          Refresh Status
        </button>
      </div>
    </div>
  );
};