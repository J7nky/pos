import React, { useState, useEffect } from 'react';
import { useOfflineData } from '../contexts/OfflineDataContext';
import { cashDrawerUpdateService } from '../services/cashDrawerUpdateService';
import { useCurrency } from '../hooks/useCurrency';
import { useI18n } from '../i18n';
import { 
  DollarSign, 
  TrendingUp, 
  TrendingDown, 
  Clock, 
  RefreshCw,
  Eye,
  EyeOff
} from 'lucide-react';

interface CashDrawerStatus {
  currentBalance: number;
  lastUpdated: string;
  transactionCount: number;
}

export default function CashDrawerMonitor() {
  const raw = useOfflineData();
  const { formatCurrency } = useCurrency();
  const { t } = useI18n();
  
  const [cashDrawerStatus, setCashDrawerStatus] = useState<CashDrawerStatus | null>(null);
  const [transactionHistory, setTransactionHistory] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [showHistory, setShowHistory] = useState(false);
  const [showBalance, setShowBalance] = useState(true);

  const loadCashDrawerStatus = async () => {
    if (!raw.storeId) return;
    
    setIsLoading(true);
    try {
      const balance = await cashDrawerUpdateService.getCurrentCashDrawerBalance(raw.storeId);
      const history = await cashDrawerUpdateService.getCashDrawerTransactionHistory(raw.storeId);
      
      setCashDrawerStatus({
        currentBalance: balance,
        lastUpdated: new Date().toISOString(),
        transactionCount: history.length
      });
      
      setTransactionHistory(history);
    } catch (error) {
      console.error('Error loading cash drawer status:', error);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadCashDrawerStatus();
    
    // Refresh every 30 seconds
    const interval = setInterval(loadCashDrawerStatus, 30000);
    return () => clearInterval(interval);
  }, [raw.storeId]);

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleString();
  };

  const getTransactionIcon = (type: string) => {
    if (type.includes('sale') || type.includes('payment')) {
      return <TrendingUp className="w-4 h-4 text-green-600" />;
    } else if (type.includes('expense') || type.includes('refund')) {
      return <TrendingDown className="w-4 h-4 text-red-600" />;
    }
    return <Clock className="w-4 h-4 text-gray-600" />;
  };

  const getTransactionColor = (type: string) => {
    if (type.includes('sale') || type.includes('payment')) {
      return 'text-green-600';
    } else if (type.includes('expense') || type.includes('refund')) {
      return 'text-red-600';
    }
    return 'text-gray-600';
  };

  if (!raw.storeId) {
    return null;
  }

  return (
    <div className="bg-white rounded-lg shadow-md p-6">
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-xl font-semibold text-gray-800 flex items-center gap-2">
          <DollarSign className="w-6 h-6 text-green-600" />
          Cash Drawer Monitor
        </h2>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setShowBalance(!showBalance)}
            className="p-2 text-gray-600 hover:text-gray-800 transition-colors"
            title={showBalance ? 'Hide balance' : 'Show balance'}
          >
            {showBalance ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
          </button>
          <button
            onClick={loadCashDrawerStatus}
            disabled={isLoading}
            className="p-2 text-gray-600 hover:text-gray-800 transition-colors disabled:opacity-50"
            title="Refresh"
          >
            <RefreshCw className={`w-4 h-4 ${isLoading ? 'animate-spin' : ''}`} />
          </button>
        </div>
      </div>

      {/* Current Balance */}
      {showBalance && cashDrawerStatus && (
        <div className="bg-gradient-to-r from-green-50 to-blue-50 rounded-lg p-4 mb-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-600 mb-1">Current Balance</p>
              <p className="text-3xl font-bold text-green-600">
                {formatCurrency(cashDrawerStatus.currentBalance)}
              </p>
            </div>
            <div className="text-right">
              <p className="text-sm text-gray-600 mb-1">Last Updated</p>
              <p className="text-sm font-medium text-gray-800">
                {formatDate(cashDrawerStatus.lastUpdated)}
              </p>
            </div>
          </div>
          <div className="mt-3 pt-3 border-t border-gray-200">
            <p className="text-sm text-gray-600">
              Total Transactions: {cashDrawerStatus.transactionCount}
            </p>
          </div>
        </div>
      )}

      {/* Transaction History Toggle */}
      <div className="mb-4">
        <button
          onClick={() => setShowHistory(!showHistory)}
          className="flex items-center gap-2 text-sm font-medium text-gray-700 hover:text-gray-900 transition-colors"
        >
          {showHistory ? 'Hide' : 'Show'} Transaction History
          {showHistory ? <TrendingUp className="w-4 h-4" /> : <TrendingDown className="w-4 h-4" />}
        </button>
      </div>

      {/* Transaction History */}
      {showHistory && (
        <div className="space-y-3">
          <h3 className="text-lg font-medium text-gray-800 mb-3">Recent Transactions</h3>
          {transactionHistory.length === 0 ? (
            <p className="text-gray-500 text-center py-4">No transactions found</p>
          ) : (
            <div className="space-y-2 max-h-64 overflow-y-auto">
              {transactionHistory.slice(0, 10).map((transaction) => (
                <div
                  key={transaction.id}
                  className="flex items-center justify-between p-3 bg-gray-50 rounded-lg hover:bg-gray-100 transition-colors"
                >
                  <div className="flex items-center gap-3">
                    {getTransactionIcon(transaction.category)}
                    <div>
                      <p className={`text-sm font-medium ${getTransactionColor(transaction.category)}`}>
                        {transaction.description}
                      </p>
                      <p className="text-xs text-gray-500">
                        {formatDate(transaction.created_at)}
                      </p>
                    </div>
                  </div>
                  <div className="text-right">
                    <p className={`font-medium ${getTransactionColor(transaction.category)}`}>
                      {transaction.type === 'expense' ? '-' : '+'}
                      {formatCurrency(transaction.amount)}
                    </p>
                    <p className="text-xs text-gray-500 capitalize">
                      {transaction.category.replace('cash_drawer_', '')}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Auto-update Status */}
      <div className="mt-6 pt-4 border-t border-gray-200">
        <div className="flex items-center gap-2 text-sm text-gray-600">
          <div className="w-2 h-2 bg-green-500 rounded-full animate-pulse"></div>
          Auto-updating cash drawer for all cash transactions
        </div>
        <p className="text-xs text-gray-500 mt-1">
          Cash sales, payments, and expenses automatically update the cash drawer balance
        </p>
      </div>
    </div>
  );
}
