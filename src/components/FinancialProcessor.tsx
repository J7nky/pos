import React, { useState, useEffect } from 'react';
import { useOfflineData } from '../contexts/OfflineDataContext';
import { useSupabaseAuth } from '../contexts/SupabaseAuthContext';
import { useCurrency } from '../hooks/useCurrency';
import MoneyInput from './common/MoneyInput';
import { erpFinancialService, TransactionSummary, AccountBalance } from '../services/erpFinancialService';
import { 
  DollarSign, 
  User, 
  Truck, 
  CreditCard, 
  Receipt, 
  TrendingUp, 
  TrendingDown,
  Plus,
  Minus,
  CheckCircle,
  AlertCircle,
  Clock,
  FileText,
  Download,
  RefreshCw
} from 'lucide-react';
import Toast from './common/Toast';

interface TransactionForm {
  type: 'customer_payment' | 'customer_credit_sale' | 'supplier_payment' | 'supplier_commission' | 'cash_sale' | 'expense';
  entityId: string;
  amount: string;
  currency: 'USD' | 'LBP';
  description: string;
  reference?: string;
  commissionRate?: string;
}

export default function FinancialProcessor() {
  const raw = useOfflineData();
  const { userProfile } = useSupabaseAuth();
  const { currency, formatCurrency, formatCurrencyWithSymbol, getConvertedAmount } = useCurrency();
  
  const customers = raw.customers.map(c => ({...c, isActive: c.is_active, createdAt: c.created_at, lb_balance: c.lb_balance, usd_balance: c.usd_balance})) as Array<any>;
  const suppliers = raw.suppliers.map(s => ({...s,  createdAt: s.created_at, type: s.type || 'commission'})) as Array<any>;
  const sales = raw.sales;
  const inventory = raw.inventory;
  
  const [activeTab, setActiveTab] = useState<'process' | 'accounts' | 'reports'>('process');
  const [showForm, setShowForm] = useState<string | null>(null);
  const [transactionForm, setTransactionForm] = useState<TransactionForm>({
    type: 'customer_payment',
    entityId: '',
    amount: '',
    currency: currency,
    description: '',
    reference: '',
    commissionRate: '10'
  });
  
  const [lastTransaction, setLastTransaction] = useState<TransactionSummary | null>(null);
  const [accountBalances, setAccountBalances] = useState<AccountBalance[]>([]);
  const [transactionHistory, setTransactionHistory] = useState<any[]>([]);
  const [cashDrawerStatus, setCashDrawerStatus] = useState<any>(null);
  
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error'; visible: boolean }>({
    message: '',
    type: 'success',
    visible: false
  });

  const showToast = (message: string, type: 'success' | 'error' = 'success') => {
    setToast({ message, type, visible: true });
    setTimeout(() => setToast(t => ({ ...t, visible: false })), 5000);
  };

  useEffect(() => {
    loadData();
  }, []);

  const loadData = () => {
    setAccountBalances(erpFinancialService.getAllAccountBalances());
    setCashDrawerStatus(erpFinancialService.getCashDrawerStatus());
  };

  const handleTransactionSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!userProfile?.id) {
      showToast('User not authenticated', 'error');
      return;
    }

    try {
      let result: TransactionSummary;

      switch (transactionForm.type) {
        case 'customer_payment':
          result = erpFinancialService.processCustomerPayment(
            transactionForm.entityId,
            parseFloat(transactionForm.amount),
            transactionForm.currency,
            transactionForm.description,
            userProfile.id
          );
          break;

        case 'supplier_payment':
          result = erpFinancialService.processSupplierPayment(
            transactionForm.entityId,
            parseFloat(transactionForm.amount),
            transactionForm.currency,
            transactionForm.description,
            userProfile.id
          );
          break;

        case 'expense':
          result = erpFinancialService.processExpense(
            parseFloat(transactionForm.amount),
            transactionForm.currency,
            'General Expense',
            transactionForm.description,
            userProfile.id
          );
          break;

        default:
          showToast('Transaction type not implemented yet', 'error');
          return;
      }

      setLastTransaction(result);
      loadData();
      showToast('Transaction processed successfully!', 'success');
      setShowForm(null);
      resetForm();
    } catch (error) {
      showToast(`Error processing transaction: ${error}`, 'error');
    }
  };

  const resetForm = () => {
    setTransactionForm({
      type: 'customer_payment',
      entityId: '',
      amount: '',
      currency: currency,
      description: '',
      reference: '',
      commissionRate: '10'
    });
  };

  const getEntityOptions = () => {
    switch (transactionForm.type) {
      case 'customer_payment':
        return customers.filter(c => c.isActive).map(c => ({
          id: c.id,
          name: c.name,
          lb_balance: c.lb_balance || 0,
          usd_balance: c.usd_balance || 0
        }));
      case 'supplier_payment':
        return suppliers.filter(s => s.isActive).map(s => ({
          id: s.id,
          name: s.name,
          balance: erpFinancialService.getAccountBalance(s.id)?.currentBalance || 0
        }));
      default:
        return [];
    }
  };

  const exportTransactionReport = () => {
    const report = erpFinancialService.generateTransactionReport();
    
    const csvContent = [
      ['Transaction Report', ''].join(','),
      ['Generated', new Date().toLocaleString()].join(','),
      ['', ''].join(','),
      ['Summary', ''].join(','),
      ['Total Transactions', report.summary.totalTransactions].join(','),
      ['Total Income', report.summary.totalIncome.toFixed(2)].join(','),
      ['Total Expenses', report.summary.totalExpenses.toFixed(2)].join(','),
      ['Net Cash Flow', report.summary.netCashFlow.toFixed(2)].join(','),
      ['Customer Payments', report.summary.customerPayments.toFixed(2)].join(','),
      ['Supplier Payments', report.summary.supplierPayments.toFixed(2)].join(','),
      ['Cash Sales', report.summary.cashSales.toFixed(2)].join(','),
      ['', ''].join(','),
      ['Account Balances', ''].join(','),
      ['Entity', 'Type', 'Balance', 'Currency', 'Last Transaction'].join(','),
      ...report.accountBalances.map(ab => [
        ab.entityName,
        ab.entityType,
        ab.currentBalance.toFixed(2),
        ab.currency,
        new Date(ab.lastTransactionDate).toLocaleDateString()
      ].join(',')),
      ['', ''].join(','),
      ['Recent Transactions', ''].join(','),
      ['ID', 'Type', 'Entity', 'Amount', 'Currency', 'Status', 'Timestamp'].join(','),
      ...report.transactions.slice(-50).map(t => [
        t.id,
        t.type,
        t.entityName,
        t.amount.toFixed(2),
        t.currency,
        'completed',
        new Date(t.timestamp).toLocaleString()
      ].join(','))
    ].join('\n');

    const blob = new Blob([csvContent], { type: 'text/csv' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `financial-report-${new Date().toISOString().split('T')[0]}.csv`;
    a.click();
    window.URL.revokeObjectURL(url);
  };

  return (
    <div className="p-6">
      <Toast message={toast.message} type={toast.type} visible={toast.visible} onClose={() => setToast(t => ({ ...t, visible: false }))} />
      
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-3xl font-bold text-gray-900">ERP Financial Processor</h1>
        <div className="flex space-x-2">
          <button
            onClick={loadData}
            className="bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 transition-colors flex items-center"
          >
            <RefreshCw className="w-4 h-4 mr-2" />
            Refresh
          </button>
          <button
            onClick={exportTransactionReport}
            className="bg-green-600 text-white px-4 py-2 rounded-lg hover:bg-green-700 transition-colors flex items-center"
          >
            <Download className="w-4 h-4 mr-2" />
            Export Report
          </button>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex space-x-1 mb-6 bg-gray-100 p-1 rounded-lg w-fit">
        {[
          { id: 'process', label: 'Process Transactions', icon: Plus },
          { id: 'accounts', label: 'Account Balances', icon: User },
          { id: 'reports', label: 'Reports', icon: FileText }
        ].map(tab => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id as any)}
            className={`px-4 py-2 rounded-md transition-colors flex items-center ${
              activeTab === tab.id ? 'bg-white text-blue-600 shadow-sm' : 'text-gray-600'
            }`}
          >
            <tab.icon className="w-4 h-4 mr-2" />
            {tab.label}
          </button>
        ))}
      </div>

      {activeTab === 'process' && (
        <div className="space-y-6">
          {/* Quick Actions */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            <button
              onClick={() => { setShowForm('customer_payment'); setTransactionForm(prev => ({ ...prev, type: 'customer_payment' })); }}
              className="bg-green-100 border border-green-300 rounded-lg p-4 hover:bg-green-200 transition-colors"
            >
              <div className="flex items-center">
                <TrendingUp className="w-8 h-8 text-green-600 mr-3" />
                <div>
                  <h3 className="font-semibold text-green-900">Customer Payment</h3>
                  <p className="text-sm text-green-700">Record payment from customer</p>
                </div>
              </div>
            </button>

            <button
              onClick={() => { setShowForm('supplier_payment'); setTransactionForm(prev => ({ ...prev, type: 'supplier_payment' })); }}
              className="bg-red-100 border border-red-300 rounded-lg p-4 hover:bg-red-200 transition-colors"
            >
              <div className="flex items-center">
                <TrendingDown className="w-8 h-8 text-red-600 mr-3" />
                <div>
                  <h3 className="font-semibold text-red-900">Supplier Payment</h3>
                  <p className="text-sm text-red-700">Record payment to supplier</p>
                </div>
              </div>
            </button>

            <button
              onClick={() => { setShowForm('expense'); setTransactionForm(prev => ({ ...prev, type: 'expense' })); }}
              className="bg-amber-100 border border-amber-300 rounded-lg p-4 hover:bg-amber-200 transition-colors"
            >
              <div className="flex items-center">
                <Receipt className="w-8 h-8 text-amber-600 mr-3" />
                <div>
                  <h3 className="font-semibold text-amber-900">Expense</h3>
                  <p className="text-sm text-amber-700">Record business expense</p>
                </div>
              </div>
            </button>
          </div>

          {/* Last Transaction Result */}
          {lastTransaction && (
            <div className="bg-white rounded-lg shadow-sm p-6 border-l-4 border-green-500">
              <h2 className="text-lg font-semibold text-gray-900 mb-4 flex items-center">
                <CheckCircle className="w-5 h-5 text-green-600 mr-2" />
                Last Transaction Processed
              </h2>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                <div>
                  <p className="text-sm text-gray-600">Transaction Type</p>
                  <p className="font-semibold text-gray-900">{lastTransaction.transactionType}</p>
                </div>
                <div>
                  <p className="text-sm text-gray-600">Entity</p>
                  <p className="font-semibold text-gray-900">{lastTransaction.entityInvolved}</p>
                </div>
                <div>
                  <p className="text-sm text-gray-600">Amount</p>
                  <p className="font-semibold text-gray-900">
                    {formatCurrencyWithSymbol(lastTransaction.amount, lastTransaction.currency as 'USD' | 'LBP')}
                  </p>
                </div>
                <div>
                  <p className="text-sm text-gray-600">Balance Before</p>
                  <p className="font-semibold text-gray-900">{formatCurrency(lastTransaction.balanceBefore)}</p>
                </div>
                <div>
                  <p className="text-sm text-gray-600">Balance After</p>
                  <p className="font-semibold text-gray-900">{formatCurrency(lastTransaction.balanceAfter)}</p>
                </div>
                <div>
                  <p className="text-sm text-gray-600">Cash Drawer Impact</p>
                  <p className={`font-semibold ${lastTransaction.cashDrawerImpact >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                    {lastTransaction.cashDrawerImpact >= 0 ? '+' : ''}{formatCurrency(lastTransaction.cashDrawerImpact)}
                  </p>
                </div>
              </div>
              <div className="mt-4">
                <p className="text-sm text-gray-600">Notes</p>
                <p className="text-gray-900">{lastTransaction.notes}</p>
              </div>
            </div>
          )}

          {/* Cash Drawer Status */}
          {cashDrawerStatus && (
            <div className="bg-white rounded-lg shadow-sm p-6">
              <h2 className="text-lg font-semibold text-gray-900 mb-4 flex items-center">
                <DollarSign className="w-5 h-5 text-green-600 mr-2" />
                Cash Drawer Status
              </h2>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                <div>
                  <p className="text-sm text-gray-600">Opening Amount</p>
                  <p className="text-xl font-bold text-gray-900">{formatCurrency(cashDrawerStatus.openingAmount)}</p>
                </div>
                <div>
                  <p className="text-sm text-gray-600">Current Amount</p>
                  <p className="text-xl font-bold text-green-600">{formatCurrency(cashDrawerStatus.currentAmount)}</p>
                </div>
                <div>
                  <p className="text-sm text-gray-600">Total Cash Sales</p>
                  <p className="text-xl font-bold text-blue-600">{formatCurrency(cashDrawerStatus.totalCashSales)}</p>
                </div>
                <div>
                  <p className="text-sm text-gray-600">Total Expenses</p>
                  <p className="text-xl font-bold text-red-600">{formatCurrency(cashDrawerStatus.totalExpenses)}</p>
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {activeTab === 'accounts' && (
        <div className="space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* Customer Balances */}
            <div className="bg-white rounded-lg shadow-sm">
              <div className="p-6 border-b">
                <h2 className="text-lg font-semibold text-gray-900 flex items-center">
                  <User className="w-5 h-5 text-blue-600 mr-2" />
                  Customer Balances
                </h2>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead className="bg-gray-50">
                    <tr>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Customer</th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Balance</th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Status</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-200">
                    {accountBalances
                      .filter(ab => ab.entityType === 'customer')
                      .sort((a, b) => b.currentBalance - a.currentBalance)
                      .map(account => (
                      <tr key={account.entityId} className="hover:bg-gray-50">
                        <td className="px-6 py-4 text-gray-900">{account.entityName}</td>
                        <td className="px-6 py-4">
                          <span className={`font-semibold ${account.currentBalance > 0 ? 'text-red-600' : 'text-green-600'}`}>
                            {formatCurrency(account.currentBalance)}
                          </span>
                        </td>
                        <td className="px-6 py-4">
                          <span className={`px-2 py-1 text-xs rounded-full ${
                            account.currentBalance > 0 
                              ? 'bg-red-100 text-red-800' 
                              : 'bg-green-100 text-green-800'
                          }`}>
                            {account.currentBalance > 0 ? 'Has Debt' : 'No Debt'}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Supplier Balances */}
            <div className="bg-white rounded-lg shadow-sm">
              <div className="p-6 border-b">
                <h2 className="text-lg font-semibold text-gray-900 flex items-center">
                  <Truck className="w-5 h-5 text-green-600 mr-2" />
                  Supplier Balances
                </h2>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead className="bg-gray-50">
                    <tr>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Supplier</th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Balance</th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Status</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-200">
                    {accountBalances
                      .filter(ab => ab.entityType === 'supplier')
                      .sort((a, b) => b.currentBalance - a.currentBalance)
                      .map(account => (
                      <tr key={account.entityId} className="hover:bg-gray-50">
                        <td className="px-6 py-4 text-gray-900">{account.entityName}</td>
                        <td className="px-6 py-4">
                          <span className={`font-semibold ${account.currentBalance > 0 ? 'text-green-600' : 'text-gray-600'}`}>
                            {formatCurrency(account.currentBalance)}
                          </span>
                        </td>
                        <td className="px-6 py-4">
                          <span className={`px-2 py-1 text-xs rounded-full ${
                            account.currentBalance > 0 
                              ? 'bg-green-100 text-green-800' 
                              : 'bg-gray-100 text-gray-800'
                          }`}>
                            {account.currentBalance > 0 ? 'Owed to Supplier' : 'No Balance'}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        </div>
      )}

      {activeTab === 'reports' && (
        <div className="space-y-6">
          <div className="bg-white rounded-lg shadow-sm p-6">
            <h2 className="text-lg font-semibold text-gray-900 mb-4">Financial Summary</h2>
            {(() => {
              const report = erpFinancialService.generateTransactionReport();
              return (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                  <div className="bg-blue-50 p-4 rounded-lg">
                    <p className="text-sm text-blue-600">Total Transactions</p>
                    <p className="text-2xl font-bold text-blue-900">{report.summary.totalTransactions}</p>
                  </div>
                  <div className="bg-green-50 p-4 rounded-lg">
                    <p className="text-sm text-green-600">Total Income</p>
                    <p className="text-2xl font-bold text-green-900">{formatCurrency(report.summary.totalIncome)}</p>
                  </div>
                  <div className="bg-red-50 p-4 rounded-lg">
                    <p className="text-sm text-red-600">Total Expenses</p>
                    <p className="text-2xl font-bold text-red-900">{formatCurrency(report.summary.totalExpenses)}</p>
                  </div>
                  <div className="bg-purple-50 p-4 rounded-lg">
                    <p className="text-sm text-purple-600">Net Cash Flow</p>
                    <p className={`text-2xl font-bold ${report.summary.netCashFlow >= 0 ? 'text-green-900' : 'text-red-900'}`}>
                      {formatCurrency(report.summary.netCashFlow)}
                    </p>
                  </div>
                </div>
              );
            })()}
          </div>
        </div>
      )}

      {/* Transaction Form Modal */}
      {showForm && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-lg max-w-2xl w-full max-h-[90vh] overflow-y-auto">
            <div className="p-6 border-b">
              <h2 className="text-xl font-semibold text-gray-900">
                {transactionForm.type === 'customer_payment' && 'Process Customer Payment'}
                {transactionForm.type === 'supplier_payment' && 'Process Supplier Payment'}
                {transactionForm.type === 'expense' && 'Record Expense'}
              </h2>
            </div>

            <form onSubmit={handleTransactionSubmit} className="p-6 space-y-6">
              {transactionForm.type !== 'expense' && (
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    {transactionForm.type === 'customer_payment' ? 'Customer' : 'Supplier'} *
                  </label>
                  <select
                    value={transactionForm.entityId}
                    onChange={(e) => setTransactionForm(prev => ({ ...prev, entityId: e.target.value }))}
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:ring-blue-500 focus:border-blue-500"
                    required
                  >
                    <option value="">Select {transactionForm.type === 'customer_payment' ? 'Customer' : 'Supplier'}...</option>
                    {getEntityOptions().map(entity => (
                      <option key={entity.id} value={entity.id}>
                        {entity.name} (LBP: {formatCurrency(entity.lb_balance)}, USD: {formatCurrency(entity.usd_balance)})
                      </option>
                    ))}
                  </select>
                </div>
              )}

              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div>
                  <MoneyInput
                    label="Amount"
                    value={transactionForm.amount}
                    onChange={(value) => setTransactionForm(prev => ({ ...prev, amount: value }))}
                    placeholder="0.00"
                    step="0.01"
                    min="0"
                    required
                  />
                </div>
                
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">Currency *</label>
                  <select
                    value={transactionForm.currency}
                    onChange={(e) => setTransactionForm(prev => ({ ...prev, currency: e.target.value as 'USD' | 'LBP' }))}
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:ring-blue-500 focus:border-blue-500"
                  >
                    <option value="USD">USD ($)</option>
                    <option value="LBP">LBP (ل.ل)</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Description *</label>
                <input
                  type="text"
                  value={transactionForm.description}
                  onChange={(e) => setTransactionForm(prev => ({ ...prev, description: e.target.value }))}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:ring-blue-500 focus:border-blue-500"
                  required
                  placeholder="Enter transaction description..."
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Reference</label>
                <input
                  type="text"
                  value={transactionForm.reference || ''}
                  onChange={(e) => setTransactionForm(prev => ({ ...prev, reference: e.target.value }))}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:ring-blue-500 focus:border-blue-500"
                  placeholder="Optional reference number..."
                />
              </div>

              {transactionForm.currency !== currency && transactionForm.amount && (
                <div className="text-sm text-gray-600 bg-blue-50 p-4 rounded-lg border border-blue-200">
                  <div className="flex items-center justify-between">
                    <span className="font-medium">Conversion:</span>
                    <span className="font-semibold">
                      {formatCurrencyWithSymbol(parseFloat(transactionForm.amount), transactionForm.currency)} 
                      = {formatCurrency(getConvertedAmount(parseFloat(transactionForm.amount), transactionForm.currency))}
                    </span>
                  </div>
                  <div className="text-xs text-gray-500 mt-1">Rate: 1 USD = 89,500 LBP</div>
                </div>
              )}

              <div className="flex justify-end space-x-3 pt-6 border-t border-gray-200">
                <button
                  type="button"
                  onClick={() => { setShowForm(null); resetForm(); }}
                  className="px-6 py-2 text-gray-700 border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors font-medium"
                >
                  Process Transaction
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
} 