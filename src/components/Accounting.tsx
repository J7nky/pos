import React, { useState } from 'react';
import { useOfflineData } from '../contexts/OfflineDataContext';
import { useSupabaseAuth } from '../contexts/SupabaseAuthContext';
import { useCurrency } from '../hooks/useCurrency';
import SearchableSelect from './common/SearchableSelect';
import { useLocalStorage } from '../hooks/useLocalStorage';
import { 
  Calculator,
  DollarSign,
  CreditCard,
  Receipt,
  TrendingUp,
  TrendingDown,
  Plus,
  Search,
  Calendar,
  FileText,
  AlertCircle,
  CheckCircle,
  Clock,
  Edit,
  Trash2
} from 'lucide-react';

export default function Accounting() {
  const raw = useOfflineData();
  // Stubs for AR/AP/Journal
  const accountsReceivable: any[] = [];
  const accountsPayable: any[] = [];
  const journalEntries: any[] = [];
  const addAccountsReceivable = (..._args: any[]) => {};
  const addAccountsPayable = (..._args: any[]) => {};
  const addJournalEntry = (..._args: any[]) => {};
  const updateAccountsReceivable = (..._args: any[]) => {};
  const updateAccountsPayable = (..._args: any[]) => {};
  const addExpenseCategory = raw.addExpenseCategory;
  const addTransaction = raw.addTransaction;
  const transactions = raw.transactions.map(t => ({...t, createdAt: t.created_at})) as Array<any>;
  const customers = raw.customers.map(c => ({...c, isActive: c.is_active, createdAt: c.created_at, currentDebt: c.current_debt})) as Array<any>;
  const suppliers = raw.suppliers.map(s => ({...s, isActive: s.is_active, createdAt: s.created_at})) as Array<any>;
  const expenseCategories = raw.expenseCategories.map(c => ({...c, isActive: c.is_active, createdAt: c.created_at})) as Array<any>;
  
  const { userProfile } = useSupabaseAuth();
  
  const { currency, formatCurrency, formatCurrencyWithSymbol, getConvertedAmount } = useCurrency();
  
  const [recentCustomers, setRecentCustomers] = useLocalStorage<string[]>('accounting_recent_customers', []);
  const [recentSuppliers, setRecentSuppliers] = useLocalStorage<string[]>('accounting_recent_suppliers', []);
  const [recentCategories, setRecentCategories] = useLocalStorage<string[]>('accounting_recent_categories', []);
  
  const [activeTab, setActiveTab] = useState<'overview' | 'receivables' | 'payables' | 'expenses' | 'journal'>('overview');
  const [showForm, setShowForm] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [showAddCustomerForm, setShowAddCustomerForm] = useState(false);
  const [showAddSupplierForm, setShowAddSupplierForm] = useState(false);
  const [showAddCategoryForm, setShowAddCategoryForm] = useState(false);

  // Form states
  const [receivableForm, setReceivableForm] = useState({
    customerId: '',
    invoiceNumber: '',
    amount: '',
    dueDate: '',
    description: ''
  });

  const [payableForm, setPayableForm] = useState({
    supplierId: '',
    invoiceNumber: '',
    amount: '',
    dueDate: '',
    description: ''
  });

  const [expenseForm, setExpenseForm] = useState({
    categoryId: '',
    amount: '',
    currency: currency,
    description: '',
    reference: ''
  });

  const [journalForm, setJournalForm] = useState({
    date: new Date().toISOString().split('T')[0],
    reference: '',
    description: '',
    entries: [
      { account: '', debit: 0, credit: 0 },
      { account: '', debit: 0, credit: 0 }
    ]
  });

  // Calculate totals
  const totalReceivables = accountsReceivable.reduce((sum, ar) => sum + ar.amountDue, 0);
  const overdueReceivables = accountsReceivable.filter(ar => 
    new Date(ar.dueDate) < new Date() && ar.status !== 'paid'
  );
  const totalPayables = accountsPayable.reduce((sum, ap) => sum + ap.amountDue, 0);
  const overduePayables = accountsPayable.filter(ap => 
    new Date(ap.dueDate) < new Date() && ap.status !== 'paid'
  );

  const today = new Date().toISOString().split('T')[0];

  // Calculate today's expenses with currency conversion
  const todayExpenses = transactions
    .filter(t => t.type === 'expense' && t.createdAt.split('T')[0] === today)
    .reduce((sum, t) => {
      const convertedAmount = getConvertedAmount(t.amount, t.currency || 'USD');
      return sum + convertedAmount;
    }, 0);

  const todayIncome = transactions
    .filter(t => t.type === 'income' && t.createdAt.split('T')[0] === today)
    .reduce((sum, t) => {
      const convertedAmount = getConvertedAmount(t.amount, t.currency || 'USD');
      return sum + convertedAmount;
    }, 0);

  // Form handlers
  const handleReceivableSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const customer = customers.find(c => c.id === receivableForm.customerId);
    if (!customer) return;

    addAccountsReceivable({
      customerId: receivableForm.customerId,
      customerName: customer.name,
      invoiceNumber: receivableForm.invoiceNumber,
      amount: parseFloat(receivableForm.amount),
      amountPaid: 0,
      amountDue: parseFloat(receivableForm.amount),
      dueDate: receivableForm.dueDate,
      status: 'pending'
    });

    setReceivableForm({
      customerId: '',
      invoiceNumber: '',
      amount: '',
      dueDate: '',
      description: ''
    });
    setShowForm(null);
  };

  const handlePayableSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const supplier = suppliers.find(s => s.id === payableForm.supplierId);
    if (!supplier) return;

    addAccountsPayable({
      supplierId: payableForm.supplierId,
      supplierName: supplier.name,
      invoiceNumber: payableForm.invoiceNumber,
      amount: parseFloat(payableForm.amount),
      amountPaid: 0,
      amountDue: parseFloat(payableForm.amount),
      dueDate: payableForm.dueDate,
      status: 'pending',
      description: payableForm.description
    });

    setPayableForm({
      supplierId: '',
      invoiceNumber: '',
      amount: '',
      dueDate: '',
      description: ''
    });
    setShowForm(null);
  };

  const handleExpenseSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const category = expenseCategories.find(c => c.id === expenseForm.categoryId);
    if (!category) return;

    addTransaction({
      type: 'expense',
      category: category.name,
      amount: parseFloat(expenseForm.amount),
      currency: expenseForm.currency as 'USD' | 'LBP',
      description: expenseForm.description,
      reference: expenseForm.reference,
      created_by: userProfile?.id || ''
    });

    setExpenseForm({
      categoryId: '',
      amount: '',
      currency: currency,
      description: '',
      reference: ''
    });
    setShowForm(null);
  };

  const handleJournalSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const totalDebit = journalForm.entries.reduce((sum, entry) => sum + entry.debit, 0);
    const totalCredit = journalForm.entries.reduce((sum, entry) => sum + entry.credit, 0);

    if (totalDebit !== totalCredit) {
      alert('Total debits must equal total credits');
      return;
    }

    addJournalEntry({
      date: journalForm.date,
      reference: journalForm.reference,
      description: journalForm.description,
      entries: journalForm.entries,
      totalDebit,
      totalCredit,
      createdBy: userProfile?.id || ''
    });

    setJournalForm({
      date: new Date().toISOString().split('T')[0],
      reference: '',
      description: '',
      entries: [
        { account: '', debit: 0, credit: 0 },
        { account: '', debit: 0, credit: 0 }
      ]
    });
    setShowForm(null);
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'paid': return 'bg-green-100 text-green-800';
      case 'overdue': return 'bg-red-100 text-red-800';
      case 'partial': return 'bg-yellow-100 text-yellow-800';
      default: return 'bg-gray-100 text-gray-800';
    }
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'paid': return <CheckCircle className="w-4 h-4" />;
      case 'overdue': return <AlertCircle className="w-4 h-4" />;
      case 'partial': return <Clock className="w-4 h-4" />;
      default: return <Clock className="w-4 h-4" />;
    }
  };

  return (
    <div className="p-6">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-3xl font-bold text-gray-900">Accounting</h1>
        <div className="flex space-x-2">
          <button
            onClick={() => setShowForm('receivable')}
            className="bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 transition-colors flex items-center"
          >
            <Plus className="w-5 h-5 mr-2" />
            Add Receivable
          </button>
          <button
            onClick={() => setShowForm('payable')}
            className="bg-green-600 text-white px-4 py-2 rounded-lg hover:bg-green-700 transition-colors flex items-center"
          >
            <Plus className="w-5 h-5 mr-2" />
            Add Payable
          </button>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex space-x-1 mb-6 bg-gray-100 p-1 rounded-lg w-fit">
        {[
          { id: 'overview', label: 'Overview', icon: Calculator },
          { id: 'receivables', label: 'Receivables', icon: TrendingUp },
          { id: 'payables', label: 'Payables', icon: TrendingDown },
          { id: 'expenses', label: 'Expenses', icon: Receipt }
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

      {activeTab === 'overview' && (
        <div className="space-y-6">
          {/* Financial Overview Cards */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
            <div className="bg-white rounded-lg shadow-sm p-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-gray-600">Accounts Receivable</p>
                  <p className="text-2xl font-bold text-gray-900">${totalReceivables.toLocaleString()}</p>
                  <p className="text-sm text-red-600">{overdueReceivables.length} overdue</p>
                </div>
                <TrendingUp className="w-8 h-8 text-green-500" />
              </div>
            </div>

            <div className="bg-white rounded-lg shadow-sm p-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-gray-600">Accounts Payable</p>
                  <p className="text-2xl font-bold text-gray-900">${totalPayables.toLocaleString()}</p>
                  <p className="text-sm text-red-600">{overduePayables.length} overdue</p>
                </div>
                <TrendingDown className="w-8 h-8 text-red-500" />
              </div>
            </div>

            <div className="bg-white rounded-lg shadow-sm p-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-gray-600">Today's Income</p>
                  <p className="text-2xl font-bold text-gray-900">${todayIncome.toLocaleString()}</p>
                  <p className="text-sm text-green-600">Today</p>
                </div>
                <DollarSign className="w-8 h-8 text-green-500" />
              </div>
            </div>

            <div className="bg-white rounded-lg shadow-sm p-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-gray-600">Today's Expenses</p>
                  <p className="text-2xl font-bold text-gray-900">${todayExpenses.toLocaleString()}</p>
                  <p className="text-sm text-gray-600">Today</p>
                </div>
                <Receipt className="w-8 h-8 text-amber-500" />
              </div>
            </div>
          </div>

          {/* Quick Actions */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="bg-white rounded-lg shadow-sm p-6">
              <h2 className="text-lg font-semibold text-gray-900 mb-4">Overdue Receivables</h2>
              {overdueReceivables.length > 0 ? (
                <div className="space-y-3">
                  {overdueReceivables.slice(0, 5).map(ar => (
                    <div key={ar.id} className="flex items-center justify-between p-3 bg-red-50 rounded-lg">
                      <div>
                        <p className="font-medium text-gray-900">{ar.customerName}</p>
                        <p className="text-sm text-gray-600">Invoice: {ar.invoiceNumber}</p>
                        <p className="text-sm text-red-600">Due: {new Date(ar.dueDate).toLocaleDateString()}</p>
                      </div>
                      <span className="font-semibold text-red-600">${ar.amountDue.toFixed(2)}</span>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-gray-500 text-center py-4">No overdue receivables</p>
              )}
            </div>

            <div className="bg-white rounded-lg shadow-sm p-6">
              <h2 className="text-lg font-semibold text-gray-900 mb-4">Overdue Payables</h2>
              {overduePayables.length > 0 ? (
                <div className="space-y-3">
                  {overduePayables.slice(0, 5).map(ap => (
                    <div key={ap.id} className="flex items-center justify-between p-3 bg-red-50 rounded-lg">
                      <div>
                        <p className="font-medium text-gray-900">{ap.supplierName}</p>
                        <p className="text-sm text-gray-600">Invoice: {ap.invoiceNumber}</p>
                        <p className="text-sm text-red-600">Due: {new Date(ap.dueDate).toLocaleDateString()}</p>
                      </div>
                      <span className="font-semibold text-red-600">${ap.amountDue.toFixed(2)}</span>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-gray-500 text-center py-4">No overdue payables</p>
              )}
            </div>
          </div>
        </div>
      )}

      {activeTab === 'receivables' && (
        <div className="space-y-6">
          {/* Search */}
          <div className="bg-white p-4 rounded-lg shadow-sm">
            <div className="relative">
              <Search className="w-5 h-5 absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400" />
              <input
                type="text"
                placeholder="Search receivables..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-blue-500 focus:border-blue-500"
              />
            </div>
          </div>

          {/* Receivables Table */}
          <div className="bg-white rounded-lg shadow-sm">
            <div className="p-6 border-b">
              <h2 className="text-lg font-semibold text-gray-900">Accounts Receivable</h2>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Customer</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Invoice</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Amount</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Due Date</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Status</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-200">
                  {accountsReceivable
                    .filter(ar => ar.customerName.toLowerCase().includes(searchTerm.toLowerCase()))
                    .map(ar => (
                    <tr key={ar.id} className="hover:bg-gray-50">
                      <td className="px-6 py-4 text-gray-900">{ar.customerName}</td>
                      <td className="px-6 py-4 text-gray-900">{ar.invoiceNumber}</td>
                      <td className="px-6 py-4 text-gray-900">${ar.amountDue.toFixed(2)}</td>
                      <td className="px-6 py-4 text-gray-900">{new Date(ar.dueDate).toLocaleDateString()}</td>
                      <td className="px-6 py-4">
                        <span className={`px-2 py-1 text-xs rounded-full flex items-center w-fit ${getStatusColor(ar.status)}`}>
                          {getStatusIcon(ar.status)}
                          <span className="ml-1 capitalize">{ar.status}</span>
                        </span>
                      </td>
                      <td className="px-6 py-4">
                        <div className="flex space-x-2">
                          <button className="text-blue-600 hover:text-blue-800">
                            <Edit className="w-4 h-4" />
                          </button>
                          <button className="text-red-600 hover:text-red-800">
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {activeTab === 'payables' && (
        <div className="space-y-6">
          {/* Search */}
          <div className="bg-white p-4 rounded-lg shadow-sm">
            <div className="relative">
              <Search className="w-5 h-5 absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400" />
              <input
                type="text"
                placeholder="Search payables..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-blue-500 focus:border-blue-500"
              />
            </div>
          </div>

          {/* Payables Table */}
          <div className="bg-white rounded-lg shadow-sm">
            <div className="p-6 border-b">
              <h2 className="text-lg font-semibold text-gray-900">Accounts Payable</h2>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Supplier</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Invoice</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Amount</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Due Date</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Status</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-200">
                  {accountsPayable
                    .filter(ap => ap.supplierName.toLowerCase().includes(searchTerm.toLowerCase()))
                    .map(ap => (
                    <tr key={ap.id} className="hover:bg-gray-50">
                      <td className="px-6 py-4 text-gray-900">{ap.supplierName}</td>
                      <td className="px-6 py-4 text-gray-900">{ap.invoiceNumber}</td>
                      <td className="px-6 py-4 text-gray-900">${ap.amountDue.toFixed(2)}</td>
                      <td className="px-6 py-4 text-gray-900">{new Date(ap.dueDate).toLocaleDateString()}</td>
                      <td className="px-6 py-4">
                        <span className={`px-2 py-1 text-xs rounded-full flex items-center w-fit ${getStatusColor(ap.status)}`}>
                          {getStatusIcon(ap.status)}
                          <span className="ml-1 capitalize">{ap.status}</span>
                        </span>
                      </td>
                      <td className="px-6 py-4">
                        <div className="flex space-x-2">
                          <button className="text-blue-600 hover:text-blue-800">
                            <Edit className="w-4 h-4" />
                          </button>
                          <button className="text-red-600 hover:text-red-800">
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {activeTab === 'expenses' && (
        <div className="space-y-6">
          <div className="flex justify-between items-center">
            <h2 className="text-xl font-semibold text-gray-900">Expense Management</h2>
            <button
              onClick={() => setShowForm('expense')}
              className="bg-amber-600 text-white px-4 py-2 rounded-lg hover:bg-amber-700 transition-colors flex items-center"
            >
              <Plus className="w-5 h-5 mr-2" />
              Add Expense
            </button>
          </div>

          {/* Expense Categories */}
          <div className="bg-white rounded-lg shadow-sm p-6">
            <h3 className="text-lg font-semibold text-gray-900 mb-4">Expense Categories</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {expenseCategories.filter(c => c.isActive).map(category => {
                const todayCategoryExpenses = transactions.filter(t => 
                  t.type === 'expense' && t.category === category.name && t.createdAt.split('T')[0] === today
                );
                const todayAmount = todayCategoryExpenses.reduce((sum, t) => {
                  const convertedAmount = getConvertedAmount(t.amount, t.currency || 'USD');
                  return sum + convertedAmount;
                }, 0);
                
                return (
                  <div key={category.id} className="border border-gray-200 rounded-lg p-4">
                    <h4 className="font-medium text-gray-900">{category.name}</h4>
                    <p className="text-sm text-gray-600 mb-2">{category.description}</p>
                    <p className="text-lg font-semibold text-gray-900">{formatCurrency(todayAmount)}</p>
                    <p className="text-sm text-gray-500">{todayCategoryExpenses.length} today</p>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Recent Expenses */}
          <div className="bg-white rounded-lg shadow-sm">
            <div className="p-6 border-b">
              <h3 className="text-lg font-semibold text-gray-900">Today's Expenses</h3>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Date</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Category</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Description</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Amount</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Reference</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-200">
                  {transactions
                    .filter(t => t.type === 'expense')
                    .filter(t => t.createdAt.split('T')[0] === today)
                    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
                    .map(transaction => (
                    <tr key={transaction.id} className="hover:bg-gray-50">
                      <td className="px-6 py-4 text-gray-900">
                        {new Date(transaction.createdAt).toLocaleTimeString()}
                      </td>
                      <td className="px-6 py-4 text-gray-900">{transaction.category}</td>
                      <td className="px-6 py-4 text-gray-900">{transaction.description}</td>
                      <td className="px-6 py-4 text-gray-900">
                        {formatCurrencyWithSymbol(transaction.amount, transaction.currency || 'USD')}
                        {transaction.currency !== currency && (
                          <div className="text-xs text-gray-500">
                            ≈ {formatCurrency(getConvertedAmount(transaction.amount, transaction.currency || 'USD'))}
                          </div>
                        )}
                      </td>
                      <td className="px-6 py-4 text-gray-500">{transaction.reference || '-'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* Forms Modal */}
      {showForm && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-lg max-w-2xl w-full max-h-[90vh] overflow-y-auto">
            <div className="p-6 border-b">
              <h2 className="text-xl font-semibold text-gray-900">
                {showForm === 'receivable' && 'Add Accounts Receivable'}
                {showForm === 'payable' && 'Add Accounts Payable'}
                {showForm === 'expense' && 'Add Expense'}
              </h2>
            </div>

            {showForm === 'receivable' && (
              <form onSubmit={handleReceivableSubmit} className="p-6 space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <SearchableSelect
                      options={customers.filter(c => c.isActive).map(customer => ({
                        id: customer.id,
                        label: customer.name,
                        value: customer.id,
                        category: 'Customer'
                      }))}
                      value={receivableForm.customerId}
                      onChange={(value) => setReceivableForm(prev => ({ ...prev, customerId: value as string }))}
                      placeholder="Select Customer *"
                      searchPlaceholder="Search customers..."
                      recentSelections={recentCustomers}
                      onRecentUpdate={setRecentCustomers}
                      showAddOption={true}
                      addOptionText="Add New Customer"
                      onAddNew={() => setShowAddCustomerForm(true)}
                      className="w-full"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">Invoice Number *</label>
                    <input
                      type="text"
                      value={receivableForm.invoiceNumber}
                      onChange={(e) => setReceivableForm(prev => ({ ...prev, invoiceNumber: e.target.value }))}
                      className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:ring-blue-500 focus:border-blue-500"
                      required
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">Amount *</label>
                    <input
                      type="number"
                      step="0.01"
                      value={receivableForm.amount}
                      onChange={(e) => setReceivableForm(prev => ({ ...prev, amount: e.target.value }))}
                      className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:ring-blue-500 focus:border-blue-500"
                      required
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">Due Date *</label>
                    <input
                      type="date"
                      value={receivableForm.dueDate}
                      onChange={(e) => setReceivableForm(prev => ({ ...prev, dueDate: e.target.value }))}
                      className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:ring-blue-500 focus:border-blue-500"
                      required
                    />
                  </div>
                </div>
                <div className="flex justify-end space-x-3 pt-4">
                  <button
                    type="button"
                    onClick={() => setShowForm(null)}
                    className="px-4 py-2 text-gray-700 border border-gray-300 rounded-lg hover:bg-gray-50"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
                  >
                    Add Receivable
                  </button>
                </div>
              </form>
            )}

            {showForm === 'payable' && (
              <form onSubmit={handlePayableSubmit} className="p-6 space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <SearchableSelect
                      options={suppliers.filter(s => s.isActive).map(supplier => ({
                        id: supplier.id,
                        label: supplier.name,
                        value: supplier.id,
                        category: supplier.type === 'commission' ? 'Commission' : 'Cash'
                      }))}
                      value={payableForm.supplierId}
                      onChange={(value) => setPayableForm(prev => ({ ...prev, supplierId: value as string }))}
                      placeholder="Select Supplier *"
                      searchPlaceholder="Search suppliers..."
                      categories={['Commission', 'Cash']}
                      recentSelections={recentSuppliers}
                      onRecentUpdate={setRecentSuppliers}
                      showAddOption={true}
                      addOptionText="Add New Supplier"
                      onAddNew={() => setShowAddSupplierForm(true)}
                      className="w-full"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">Invoice Number *</label>
                    <input
                      type="text"
                      value={payableForm.invoiceNumber}
                      onChange={(e) => setPayableForm(prev => ({ ...prev, invoiceNumber: e.target.value }))}
                      className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:ring-blue-500 focus:border-blue-500"
                      required
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">Amount *</label>
                    <input
                      type="number"
                      step="0.01"
                      value={payableForm.amount}
                      onChange={(e) => setPayableForm(prev => ({ ...prev, amount: e.target.value }))}
                      className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:ring-blue-500 focus:border-blue-500"
                      required
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">Due Date *</label>
                    <input
                      type="date"
                      value={payableForm.dueDate}
                      onChange={(e) => setPayableForm(prev => ({ ...prev, dueDate: e.target.value }))}
                      className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:ring-blue-500 focus:border-blue-500"
                      required
                    />
                  </div>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">Description</label>
                  <textarea
                    value={payableForm.description}
                    onChange={(e) => setPayableForm(prev => ({ ...prev, description: e.target.value }))}
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:ring-blue-500 focus:border-blue-500"
                    rows={3}
                  />
                </div>
                <div className="flex justify-end space-x-3 pt-4">
                  <button
                    type="button"
                    onClick={() => setShowForm(null)}
                    className="px-4 py-2 text-gray-700 border border-gray-300 rounded-lg hover:bg-gray-50"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700"
                  >
                    Add Payable
                  </button>
                </div>
              </form>
            )}

            {showForm === 'expense' && (
              <form onSubmit={handleExpenseSubmit} className="p-6 space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <SearchableSelect
                      options={expenseCategories.filter(c => c.isActive).map(category => ({
                        id: category.id,
                        label: category.name,
                        value: category.id,
                        category: 'Expense Category'
                      }))}
                      value={expenseForm.categoryId}
                      onChange={(value) => setExpenseForm(prev => ({ ...prev, categoryId: value as string }))}
                      placeholder="Select Category *"
                      searchPlaceholder="Search categories..."
                      recentSelections={recentCategories}
                      onRecentUpdate={setRecentCategories}
                      showAddOption={true}
                      addOptionText="Add New Category"
                      onAddNew={() => setShowAddCategoryForm(true)}
                      className="w-full"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">Currency *</label>
                    <select
                      value={expenseForm.currency}
                      onChange={(e) => setExpenseForm(prev => ({ ...prev, currency: e.target.value as 'USD' | 'LBP' }))}
                      className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:ring-blue-500 focus:border-blue-500"
                    >
                      <option value="USD">USD ($)</option>
                      <option value="LBP">LBP (ل.ل)</option>
                    </select>
                  </div>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">Amount *</label>
                  <input
                    type="number"
                    step="0.01"
                    value={expenseForm.amount}
                    onChange={(e) => setExpenseForm(prev => ({ ...prev, amount: e.target.value }))}
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:ring-blue-500 focus:border-blue-500"
                    required
                    placeholder={`Enter amount in ${expenseForm.currency}`}
                  />
                </div>
                {expenseForm.currency !== currency && expenseForm.amount && (
                  <div className="text-sm text-gray-600 bg-blue-50 p-3 rounded-lg">
                    <strong>Conversion:</strong> {formatCurrencyWithSymbol(parseFloat(expenseForm.amount), expenseForm.currency)} 
                    = {formatCurrency(getConvertedAmount(parseFloat(expenseForm.amount), expenseForm.currency))}
                    <div className="text-xs text-gray-500 mt-1">Rate: 1 USD = 89,500 LBP</div>
                  </div>
                )}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">Description *</label>
                  <input
                    type="text"
                    value={expenseForm.description}
                    onChange={(e) => setExpenseForm(prev => ({ ...prev, description: e.target.value }))}
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:ring-blue-500 focus:border-blue-500"
                    required
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">Reference</label>
                  <input
                    type="text"
                    value={expenseForm.reference}
                    onChange={(e) => setExpenseForm(prev => ({ ...prev, reference: e.target.value }))}
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:ring-blue-500 focus:border-blue-500"
                  />
                </div>
                <div className="flex justify-end space-x-3 pt-4">
                  <button
                    type="button"
                    onClick={() => setShowForm(null)}
                    className="px-4 py-2 text-gray-700 border border-gray-300 rounded-lg hover:bg-gray-50"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    className="px-4 py-2 bg-amber-600 text-white rounded-lg hover:bg-amber-700"
                  >
                    Add Expense
                  </button>
                </div>
              </form>
            )}
          </div>
        </div>
      )}
    </div>
  );
}