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

}) => {
  const [cashFlow, setCashFlow] = useState<CashFlowData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);


  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD'
    }).format(amount);
  };





};
