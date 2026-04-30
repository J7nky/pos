import React, { useState, useEffect, useRef } from 'react';
import { useOfflineData } from '../contexts/OfflineDataContext';
import { cashDrawerUpdateService } from '../services/cashDrawerUpdateService';
import { useCurrency } from '../hooks/useCurrency';
import { useI18n } from '../i18n';
import { useMultilingual } from '../hooks/useMultilingual';
import { parseMultilingualString } from '../utils/multilingual';
import {
  TrendingUp,
  TrendingDown,
  Clock,
} from 'lucide-react';

interface CashDrawerStatus {
  currentBalance: number;
  lastUpdated: string;
  transactionCount: number;
}

// Module-level cache so the list survives navigation away/back to Home
// without re-rendering the empty state while the next fetch is in flight.
const cache: {
  scope: string | null;
  status: CashDrawerStatus | null;
  history: any[];
  lastLoadedAt: number;
} = { scope: null, status: null, history: [], lastLoadedAt: 0 };

export default function CashDrawerMonitor() {
  const raw = useOfflineData();
  const { formatCurrency } = useCurrency();
  const { t } = useI18n();
  const { getText } = useMultilingual();

  const scope = raw.storeId && raw.currentBranchId ? `${raw.storeId}:${raw.currentBranchId}` : null;
  const initial = scope && cache.scope === scope ? cache : null;

  const [cashDrawerStatus, setCashDrawerStatus] = useState<CashDrawerStatus | null>(initial?.status ?? null);
  const [transactionHistory, setTransactionHistory] = useState<any[]>(initial?.history ?? []);
  const [_isLoading, setIsLoading] = useState(false);
  const [range, setRange] = useState<'today' | 'week'>('today');
  const lastTxLenRef = useRef<number | null>(null);

  const loadCashDrawerStatus = async () => {
    if (!raw.storeId || !raw.currentBranchId) return;

    setIsLoading(true);
    try {
      const balance = await cashDrawerUpdateService.getCurrentCashDrawerBalance(raw.storeId, raw.currentBranchId);
      const history = await cashDrawerUpdateService.getCashDrawerTransactionHistory(raw.storeId);
      const status: CashDrawerStatus = {
        currentBalance: balance,
        lastUpdated: new Date().toISOString(),
        transactionCount: history.length,
      };
      cache.scope = `${raw.storeId}:${raw.currentBranchId}`;
      cache.status = status;
      cache.history = history;
      cache.lastLoadedAt = Date.now();
      setCashDrawerStatus(status);
      setTransactionHistory(history);
    } catch (error) {
      console.error('Error loading cash drawer status:', error);
    } finally {
      setIsLoading(false);
    }
  };

  // Initial mount + branch change: only fetch if cache is stale (>5s) or scope mismatched.
  useEffect(() => {
    if (!raw.storeId || !raw.currentBranchId) return;
    const currentScope = `${raw.storeId}:${raw.currentBranchId}`;
    const cacheFresh = cache.scope === currentScope && Date.now() - cache.lastLoadedAt < 5000;
    if (!cacheFresh) {
      loadCashDrawerStatus();
    }

    const handleCashDrawerUpdated = (e: any) => {
      if (!raw.storeId || !raw.currentBranchId || (e?.detail?.storeId && e.detail.storeId !== raw.storeId)) return;
      loadCashDrawerStatus();
    };

    if (typeof window !== 'undefined') {
      window.addEventListener('cash-drawer-updated', handleCashDrawerUpdated as any);
    }

    const interval = setInterval(() => {
      if (raw.storeId && raw.currentBranchId) {
        loadCashDrawerStatus();
      }
    }, 30000);
    return () => {
      clearInterval(interval);
      if (typeof window !== 'undefined') {
        window.removeEventListener('cash-drawer-updated', handleCashDrawerUpdated as any);
      }
    };
  }, [raw.storeId, raw.currentBranchId]);

  // Refetch only when the transactions array length actually changes after mount
  // (covers sync downloads). Skip the initial render — the mount effect handles it.
  useEffect(() => {
    if (!raw.storeId || !raw.currentBranchId) return;
    const len = raw.transactions?.length ?? 0;
    if (lastTxLenRef.current === null) {
      lastTxLenRef.current = len;
      return;
    }
    if (lastTxLenRef.current !== len) {
      lastTxLenRef.current = len;
      loadCashDrawerStatus();
    }
  }, [raw.storeId, raw.currentBranchId, raw.transactions?.length]);

  const filteredTransactions = (() => {
    if (!Array.isArray(transactionHistory)) return [];
    const now = new Date();
    if (range === 'today') {
      const start = new Date(now.getFullYear(), now.getMonth(), now.getDate());
      const end = new Date(start);
      end.setHours(23, 59, 59, 999); // Include the entire day until 23:59:59.999
      return transactionHistory.filter(t => {
        const d = new Date(t.created_at);
        return d >= start && d <= end;
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
    const t = (type || '').toLowerCase();
    if (t.includes('sale') || t.includes('payment')) {
      return <TrendingUp className="w-4 h-4 text-green-600" />;
    } else if (t.includes('expense') || t.includes('refund')) {
      return <TrendingDown className="w-4 h-4 text-red-600" />;
    }
    return <Clock className="w-4 h-4 text-gray-600" />;
  };

  const getTransactionColor = (type: string) => {
    const t = (type || '').toLowerCase();
    if (t.includes('sale') || t.includes('payment')) {
      return 'text-green-600';
    } else if (t.includes('expense') || t.includes('refund')) {
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
          
            <h2 className="text-lg font-semibold text-gray-900">{t('home.recentActions')}</h2>
            <div className="flex items-center gap-2">
              <button
                onClick={() => setRange('today')}
                className={`px-3 py-1 rounded-md text-sm border ${range === 'today' ? 'bg-blue-600 text-white border-blue-600' : 'bg-white text-gray-700 border-gray-300 hover:bg-gray-50'}`}
                aria-pressed={range === 'today'}
              >
                {t('home.today')}
              </button>
              <button
                onClick={() => setRange('week')}
                className={`px-3 py-1 rounded-md text-sm border ${range === 'week' ? 'bg-blue-600 text-white border-blue-600' : 'bg-white text-gray-700 border-gray-300 hover:bg-gray-50'}`}
                aria-pressed={range === 'week'}
              >
                {t('home.week')}
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
                        {getText(parseMultilingualString(transaction.description) as any) || ''}
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
                      {(transaction.category || '').replace(/^Cash Drawer\s*/i, '')}
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
