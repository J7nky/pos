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
  const [range, setRange] = useState<'today' | 'week'>('today');

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

  const filteredTransactions = (() => {
    if (!Array.isArray(transactionHistory)) return [];
    const now = new Date();
    if (range === 'today') {
      const start = new Date(now.getFullYear(), now.getMonth(), now.getDate());
      const end = new Date(start);
      end.setDate(start.getDate() + 1);
      return transactionHistory.filter(t => {
        const d = new Date(t.created_at);
        return d >= start && d < end;
      });
    } else {
      // last 7 days including today
      const start = new Date(now);
      start.setDate(now.getDate() - 6);
      start.setHours(0,0,0,0);
      const end = new Date(now);
      end.setHours(23,59,59,999);
      return transactionHistory.filter(t => {
        const d = new Date(t.created_at);
        return d >= start && d <= end;
      });
    }
  })();

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
    <div >
      <div >
      
      </div>

       {/* Recent Sales */}
       <div className="bg-white rounded-lg shadow-sm p-6">
          <div className="flex items-center justify-between mb-4">
          
            <h2 className="text-lg font-semibold text-gray-900">{t('home.recentSales')}</h2>
            <div className="flex items-center gap-2">
              <button
                onClick={() => setRange('today')}
                className={`px-3 py-1 rounded-md text-sm border ${range === 'today' ? 'bg-blue-600 text-white border-blue-600' : 'bg-white text-gray-700 border-gray-300 hover:bg-gray-50'}`}
                aria-pressed={range === 'today'}
              >
                Today
              </button>
              <button
                onClick={() => setRange('week')}
                className={`px-3 py-1 rounded-md text-sm border ${range === 'week' ? 'bg-blue-600 text-white border-blue-600' : 'bg-white text-gray-700 border-gray-300 hover:bg-gray-50'}`}
                aria-pressed={range === 'week'}
              >
                Week
              </button>
              <Clock className="w-5 h-5 text-gray-400" />
            </div>
            
          </div>
          {filteredTransactions.length > 0 ? (
            <div className="space-y-2 max-h-64 overflow-y-auto">
              {filteredTransactions.map(transaction => (
                <div key={transaction.id} className="flex items-center justify-between p-3 bg-gray-50 rounded-lg hover:bg-gray-100 transition-colors">
                 <div
                  key={transaction.id}
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
          ) : (
            <p className="text-gray-500 text-center py-4">{t('home.noRecentSales')}</p>
          )}
        </div>
      

 
      


    </div>
  );
}
