import React, { useState, useEffect } from 'react';
import { TrendingUp, TrendingDown, DollarSign, Clock, User, BarChart3 } from 'lucide-react';
import { db } from '../lib/db';

interface CashDrawerFlowTrackerProps {
  sessionId: string | undefined;
  storeId: string;
}

interface CashFlowData {
  openingAmount: number;
  totalSales: number;
  totalPayments: number;
  totalExpenses: number;
  expectedAmount: number;
  currentBalance: number;
}

export const CashDrawerFlowTracker: React.FC<CashDrawerFlowTrackerProps> = ({ 
  sessionId, 
  storeId 
}) => {
  const [cashFlow, setCashFlow] = useState<CashFlowData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (sessionId && sessionId.trim() !== '') {
      loadCashFlow();
    }
  }, [sessionId]);

  const loadCashFlow = async () => {
    try {
      setLoading(true);
      setError(null);

      const session = await db.cash_drawer_sessions.get(sessionId);
      if (!session) {
        throw new Error('Session not found');
      }

      const sessionStartTime = new Date(session.openedAt);
      const sessionEndTime = session.closedAt ? new Date(session.closedAt) : new Date();

      // Get all cash transactions during the session period
      const [cashSales, cashPayments, cashExpenses] = await Promise.all([
        db.sale_items
          .filter(item => 
            item.payment_method === 'cash' &&
            new Date(item.created_at) >= sessionStartTime &&
            new Date(item.created_at) <= sessionEndTime
          )
          .toArray(),
        db.transactions
          .filter(trans => 
            trans.type === 'income' && 
            trans.category === 'cash_payment' &&
            new Date(trans.created_at) >= sessionStartTime &&
            new Date(trans.created_at) <= sessionEndTime
          )
          .toArray(),
        db.transactions
          .filter(trans => 
            trans.type === 'expense' && 
            trans.category === 'cash_expense' &&
            new Date(trans.created_at) >= sessionStartTime &&
            new Date(trans.created_at) <= sessionEndTime
          )
          .toArray()
      ]);

      const totalSales = cashSales.reduce((sum, item) => sum + (item.received_value || 0), 0);
      const totalPayments = cashPayments.reduce((sum, trans) => sum + trans.amount, 0);
      const totalExpenses = cashExpenses.reduce((sum, trans) => sum + trans.amount, 0);
      const expectedAmount = session.openingAmount + totalSales + totalPayments - totalExpenses;

      // Get current account balance
      const account = await db.getCashDrawerAccount(storeId);
      const currentBalance = account?.current_balance || 0;

      setCashFlow({
        openingAmount: session.openingAmount,
        totalSales,
        totalPayments,
        totalExpenses,
        expectedAmount,
        currentBalance
      });

    } catch (error) {
      console.error('Error loading cash flow:', error);
      setError(error instanceof Error ? error.message : 'Failed to load cash flow data');
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

  if (loading) {
    return (
      <div className="bg-white rounded-lg shadow-sm p-4 border border-gray-200">
        <div className="flex items-center justify-center py-4">
          <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-blue-600"></div>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="bg-white rounded-lg shadow-sm p-4 border border-gray-200">
        <div className="text-center text-red-600">
          <p>Error: {error}</p>
          <button 
            onClick={loadCashFlow}
            className="mt-2 px-3 py-1 bg-blue-600 text-white rounded text-sm hover:bg-blue-700"
          >
            Retry
          </button>
        </div>
      </div>
    );
  }

  if (!cashFlow) {
    return null;
  }

  return (
    <div className="bg-white rounded-lg shadow-sm p-6 border border-gray-200">
      <div className="flex items-center mb-4">
        <BarChart3 className="w-5 h-5 text-blue-600 mr-2" />
        <h3 className="text-lg font-semibold text-gray-900">Cash Flow Tracker</h3>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 mb-6">
        {/* Opening Amount */}
        <div className="bg-blue-50 p-4 rounded-lg border border-blue-200">
          <div className="flex items-center">
            <DollarSign className="w-5 h-5 text-blue-600 mr-2" />
            <span className="text-sm font-medium text-blue-800">Opening Amount</span>
          </div>
          <div className="mt-2 text-xl font-bold text-blue-900">
            {formatCurrency(cashFlow.openingAmount)}
          </div>
        </div>

        {/* Total Sales */}
        <div className="bg-green-50 p-4 rounded-lg border border-green-200">
          <div className="flex items-center">
            <TrendingUp className="w-5 h-5 text-green-600 mr-2" />
            <span className="text-sm font-medium text-green-800">Cash Sales</span>
          </div>
          <div className="mt-2 text-xl font-bold text-green-900">
            {formatCurrency(cashFlow.totalSales)}
          </div>
        </div>

        {/* Total Payments */}
        <div className="bg-purple-50 p-4 rounded-lg border border-purple-200">
          <div className="flex items-center">
            <TrendingUp className="w-5 h-5 text-purple-600 mr-2" />
            <span className="text-sm font-medium text-purple-800">Cash Payments</span>
          </div>
          <div className="mt-2 text-xl font-bold text-purple-900">
            {formatCurrency(cashFlow.totalPayments)}
          </div>
        </div>

        {/* Total Expenses */}
        <div className="bg-red-50 p-4 rounded-lg border border-red-200">
          <div className="flex items-center">
            <TrendingDown className="w-5 h-5 text-red-600 mr-2" />
            <span className="text-sm font-medium text-red-800">Cash Expenses</span>
          </div>
          <div className="mt-2 text-xl font-bold text-red-900">
            {formatCurrency(cashFlow.totalExpenses)}
          </div>
        </div>

        {/* Expected Amount */}
        <div className="bg-yellow-50 p-4 rounded-lg border border-yellow-200">
          <div className="flex items-center">
            <DollarSign className="w-5 h-5 text-yellow-600 mr-2" />
            <span className="text-sm font-medium text-yellow-800">Expected Amount</span>
          </div>
          <div className="mt-2 text-xl font-bold text-yellow-900">
            {formatCurrency(cashFlow.expectedAmount)}
          </div>
        </div>

        {/* Current Balance */}
        <div className="bg-indigo-50 p-4 rounded-lg border border-indigo-200">
          <div className="flex items-center">
            <DollarSign className="w-5 h-5 text-indigo-600 mr-2" />
            <span className="text-sm font-medium text-indigo-800">Current Balance</span>
          </div>
          <div className="mt-2 text-xl font-bold text-indigo-900">
            {formatCurrency(cashFlow.currentBalance)}
          </div>
        </div>
      </div>

      {/* Summary */}
      <div className="bg-gray-50 p-4 rounded-lg">
        <h4 className="text-sm font-medium text-gray-700 mb-2">Summary</h4>
        <div className="text-sm text-gray-600 space-y-1">
          <p>• Opening Amount: {formatCurrency(cashFlow.openingAmount)}</p>
          <p>• + Cash Sales: {formatCurrency(cashFlow.totalSales)}</p>
          <p>• + Cash Payments: {formatCurrency(cashFlow.totalPayments)}</p>
          <p>• - Cash Expenses: {formatCurrency(cashFlow.totalExpenses)}</p>
          <p>• = Expected Amount: {formatCurrency(cashFlow.expectedAmount)}</p>
        </div>
      </div>

      <div className="mt-4 flex justify-end">
        <button 
          onClick={loadCashFlow}
          className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 text-sm"
        >
          Refresh Data
        </button>
      </div>
    </div>
  );
};
