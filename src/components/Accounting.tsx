import React, { useState, useEffect } from 'react';
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
import Toast from './common/Toast';
import { AccountsReceivable, AccountsPayable } from '../lib/db';

export default function Accounting() {
  const raw = useOfflineData();
  const {
    accountsReceivable,
    accountsPayable,
    addAccountsReceivable,
    updateAccountsReceivable,
    deleteAccountsReceivable,
    addAccountsPayable,
    updateAccountsPayable,
    deleteAccountsPayable,
  } = raw;
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
  
  const [activeTab, setActiveTab] = useState<'overview' | 'receivables' | 'payables' | 'expenses' | 'journal' | 'nonpriced'>('overview');
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

  // Toast state
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error'; visible: boolean }>({
    message: '',
    type: 'success',
    visible: false
  });
  const showToast = (message: string, type: 'success' | 'error' = 'success') => {
    setToast({ message, type, visible: true });
    setTimeout(() => setToast(t => ({ ...t, visible: false })), 3000);
  };
  const hideToast = () => setToast(t => ({ ...t, visible: false }));

  // Filtering, sorting, and pagination state for AR/AP
  const [arStatusFilter, setArStatusFilter] = useState('');
  const [arSort, setArSort] = useState<'dueDate' | 'amount' | 'status'>('dueDate');
  const [arSortDir, setArSortDir] = useState<'asc' | 'desc'>('asc');
  const [arPage, setArPage] = useState(1);
  const AR_PAGE_SIZE = 10;

  const [apStatusFilter, setApStatusFilter] = useState('');
  const [apSort, setApSort] = useState<'dueDate' | 'amount' | 'status'>('dueDate');
  const [apSortDir, setApSortDir] = useState<'asc' | 'desc'>('asc');
  const [apPage, setApPage] = useState(1);
  const AP_PAGE_SIZE = 10;

  // Filtering, sorting, and pagination logic for AR
  const filteredAR = accountsReceivable
    .filter(ar => ((ar.customerName || ar.customer_name || '').toLowerCase().includes(searchTerm.toLowerCase())))
    .filter(ar => !arStatusFilter || ar.status === arStatusFilter)
  ;
  const sortedAR = [...filteredAR].sort((a, b) => {
    if (arSort === 'dueDate') {
      const aDate = new Date(a.dueDate).getTime();
      const bDate = new Date(b.dueDate).getTime();
      return arSortDir === 'asc' ? aDate - bDate : bDate - aDate;
    } else if (arSort === 'amount') {
      return arSortDir === 'asc' ? a.amountDue - b.amountDue : b.amountDue - a.amountDue;
    } else if (arSort === 'status') {
      return arSortDir === 'asc' ? a.status.localeCompare(b.status) : b.status.localeCompare(a.status);
    }
    return 0;
  });
  const arTotalPages = Math.ceil(sortedAR.length / AR_PAGE_SIZE);
  const pagedAR = sortedAR.slice((arPage - 1) * AR_PAGE_SIZE, arPage * AR_PAGE_SIZE);

  // Filtering, sorting, and pagination logic for AP
  const filteredAP = accountsPayable
    .filter(ap => ((ap.supplierName || ap.supplier_name || '').toLowerCase().includes(searchTerm.toLowerCase())))
    .filter(ap => !apStatusFilter || ap.status === apStatusFilter)
  ;
  const sortedAP = [...filteredAP].sort((a, b) => {
    if (apSort === 'dueDate') {
      const aDate = new Date(a.dueDate).getTime();
      const bDate = new Date(b.dueDate).getTime();
      return apSortDir === 'asc' ? aDate - bDate : bDate - aDate;
    } else if (apSort === 'amount') {
      return apSortDir === 'asc' ? a.amountDue - b.amountDue : b.amountDue - a.amountDue;
    } else if (apSort === 'status') {
      return apSortDir === 'asc' ? a.status.localeCompare(b.status) : b.status.localeCompare(a.status);
    }
    return 0;
  });
  const apTotalPages = Math.ceil(sortedAP.length / AP_PAGE_SIZE);
  const pagedAP = sortedAP.slice((apPage - 1) * AP_PAGE_SIZE, apPage * AP_PAGE_SIZE);

  // Form handlers
  const handleReceivableSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const customer = customers.find(c => c.id === receivableForm.customerId);
    if (!customer) return;
    try {
      await addAccountsReceivable({
        customer_id: receivableForm.customerId,
        customer_name: customer.name,
        invoice_number: receivableForm.invoiceNumber,
        amount: parseFloat(receivableForm.amount),
        amount_paid: 0,
        amount_due: parseFloat(receivableForm.amount),
        due_date: receivableForm.dueDate,
        status: 'pending',
        description: receivableForm.description,
      });
      showToast('Receivable added!', 'success');
    } catch (err) {
      showToast('Failed to add receivable.', 'error');
    }
    setReceivableForm({
      customerId: '',
      invoiceNumber: '',
      amount: '',
      dueDate: '',
      description: ''
    });
    setShowForm(null);
  };

  const handlePayableSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const supplier = suppliers.find(s => s.id === payableForm.supplierId);
    if (!supplier) return;
    try {
      await addAccountsPayable({
        supplier_id: payableForm.supplierId,
        supplier_name: supplier.name,
        invoice_number: payableForm.invoiceNumber,
        amount: parseFloat(payableForm.amount),
        amount_paid: 0,
        amount_due: parseFloat(payableForm.amount),
        due_date: payableForm.dueDate,
        status: 'pending',
        description: payableForm.description,
      });
      showToast('Payable added!', 'success');
    } catch (err) {
      showToast('Failed to add payable.', 'error');
    }
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

    // Remove addJournalEntry reference for now

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

  // Enhance getStatusColor and getStatusIcon for better contrast and accessibility
  const getStatusColor = (status: string) => {
    switch (status) {
      case 'paid': return 'bg-green-100 text-green-900 border border-green-400';
      case 'overdue': return 'bg-red-100 text-red-900 border border-red-400';
      case 'partial': return 'bg-yellow-100 text-yellow-900 border border-yellow-400';
      default: return 'bg-gray-100 text-gray-900 border border-gray-300';
    }
  };
  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'paid': return <CheckCircle className="w-4 h-4" aria-label="Paid" />;
      case 'overdue': return <AlertCircle className="w-4 h-4" aria-label="Overdue" />;
      case 'partial': return <Clock className="w-4 h-4" aria-label="Partial" />;
      default: return <Clock className="w-4 h-4" aria-label="Pending" />;
    }
  };

  // Add edit/delete handlers for AR/AP
  const handleEditReceivable = async (ar: AccountsReceivable) => {
    // For now, just prompt for new amount (future: modal form)
    const newAmount = prompt('Edit amount:', String(ar.amount_due));
    if (newAmount !== null) {
      try {
        await updateAccountsReceivable(ar.id, { amount_due: parseFloat(newAmount) });
        showToast('Receivable updated!', 'success');
      } catch {
        showToast('Failed to update receivable.', 'error');
      }
    }
  };
  const handleDeleteReceivable = async (ar: AccountsReceivable) => {
    if (window.confirm('Delete this receivable?')) {
      try {
        await deleteAccountsReceivable(ar.id);
        showToast('Receivable deleted!', 'success');
      } catch {
        showToast('Failed to delete receivable.', 'error');
      }
    }
  };
  const handleEditPayable = async (ap: AccountsPayable) => {
    const newAmount = prompt('Edit amount:', String(ap.amount_due));
    if (newAmount !== null) {
      try {
        await updateAccountsPayable(ap.id, { amount_due: parseFloat(newAmount) });
        showToast('Payable updated!', 'success');
      } catch {
        showToast('Failed to update payable.', 'error');
      }
    }
  };
  const handleDeletePayable = async (ap: AccountsPayable) => {
    if (window.confirm('Delete this payable?')) {
      try {
        await deleteAccountsPayable(ap.id);
        showToast('Payable deleted!', 'success');
      } catch {
        showToast('Failed to delete payable.', 'error');
      }
    }
  };

  // --- ReceivablesTable component ---
  function ReceivablesTable({
    data, page, totalPages, onPageChange, onEdit, onDelete, statusFilter, onStatusFilter, sort, sortDir, onSort, searchTerm
  }: {
    data: AccountsReceivable[];
    page: number;
    totalPages: number;
    onPageChange: (page: number) => void;
    onEdit: (ar: AccountsReceivable) => void;
    onDelete: (ar: AccountsReceivable) => void;
    statusFilter: string;
    onStatusFilter: (status: string) => void;
    sort: 'dueDate' | 'amount' | 'status';
    sortDir: 'asc' | 'desc';
    onSort: (sort: 'dueDate' | 'amount' | 'status') => void;
    searchTerm: string;
  }) {
    return (
      <div className="bg-white rounded-lg shadow-sm">
        <div className="p-6 border-b">
          <h2 className="text-lg font-semibold text-gray-900">Accounts Receivable</h2>
        </div>
        <div className="overflow-x-auto">
          <div className="flex flex-wrap gap-2 mb-2">
            <select value={statusFilter} onChange={e => { onStatusFilter(e.target.value); onPageChange(1); }} className="border rounded px-2 py-1">
              <option value="">All Statuses</option>
              <option value="pending">Pending</option>
              <option value="paid">Paid</option>
              <option value="overdue">Overdue</option>
              <option value="partial">Partial</option>
            </select>
            <button onClick={() => onSort('dueDate')} className={`border rounded px-2 py-1 ${sort === 'dueDate' ? 'font-bold' : ''}`}>Due Date {sort === 'dueDate' ? (sortDir === 'asc' ? '↑' : '↓') : ''}</button>
            <button onClick={() => onSort('amount')} className={`border rounded px-2 py-1 ${sort === 'amount' ? 'font-bold' : ''}`}>Amount {sort === 'amount' ? (sortDir === 'asc' ? '↑' : '↓') : ''}</button>
            <button onClick={() => onSort('status')} className={`border rounded px-2 py-1 ${sort === 'status' ? 'font-bold' : ''}`}>Status {sort === 'status' ? (sortDir === 'asc' ? '↑' : '↓') : ''}</button>
          </div>
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
              {data.length === 0 ? (
                <tr><td colSpan={6} className="text-center text-gray-500 py-8">
                  <div className="flex flex-col items-center">
                    <AlertCircle className="w-8 h-8 text-gray-400 mb-2" aria-label="No receivables" />
                    <span className="font-semibold">No receivables found</span>
                    <span className="text-sm text-gray-400">Try adjusting your filters or add a new receivable.</span>
                  </div>
                </td></tr>
              ) : data.map(ar => (
                <tr key={ar.id} className="hover:bg-gray-50">
                  <td className="px-6 py-4 text-gray-900">{ar.customer_name}</td>
                  <td className="px-6 py-4 text-gray-900">{ar.invoice_number}</td>
                  <td className="px-6 py-4 text-gray-900">${ar.amount_due.toFixed(2)}</td>
                  <td className="px-6 py-4 text-gray-900">
                    {new Date(ar.due_date).toLocaleDateString()}
                    {ar.status === 'overdue' && (
                      <span className="ml-2 text-xs text-red-700 font-semibold" aria-label="Days overdue">
                        ({Math.max(0, Math.floor((Date.now() - new Date(ar.due_date).getTime()) / (1000 * 60 * 60 * 24)))} days overdue)
                      </span>
                    )}
                  </td>
                  <td className="px-6 py-4">
                    <span className={`px-2 py-1 text-xs rounded-full flex items-center w-fit ${getStatusColor(ar.status)}`} aria-label={`Status: ${ar.status}`}>
                      {getStatusIcon(ar.status)}
                      <span className="ml-1 capitalize">{ar.status}</span>
                    </span>
                  </td>
                  <td className="px-6 py-4">
                    <div className="flex space-x-2">
                      <button className="text-blue-600 hover:text-blue-800" onClick={() => onEdit(ar)}>
                        <Edit className="w-4 h-4" />
                      </button>
                      <button className="text-red-600 hover:text-red-800" onClick={() => onDelete(ar)}>
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <div className="flex justify-end gap-2 mt-2">
            <button disabled={page === 1} onClick={() => onPageChange(Math.max(1, page - 1))} className="px-2 py-1 border rounded disabled:opacity-50">Prev</button>
            <span>Page {page} of {totalPages || 1}</span>
            <button disabled={page === totalPages || totalPages === 0} onClick={() => onPageChange(Math.min(totalPages, page + 1))} className="px-2 py-1 border rounded disabled:opacity-50">Next</button>
          </div>
        </div>
      </div>
    );
  }

  // --- PayablesTable component ---
  function PayablesTable({
    data, page, totalPages, onPageChange, onEdit, onDelete, statusFilter, onStatusFilter, sort, sortDir, onSort, searchTerm
  }: {
    data: AccountsPayable[];
    page: number;
    totalPages: number;
    onPageChange: (page: number) => void;
    onEdit: (ap: AccountsPayable) => void;
    onDelete: (ap: AccountsPayable) => void;
    statusFilter: string;
    onStatusFilter: (status: string) => void;
    sort: 'dueDate' | 'amount' | 'status';
    sortDir: 'asc' | 'desc';
    onSort: (sort: 'dueDate' | 'amount' | 'status') => void;
    searchTerm: string;
  }) {
    return (
      <div className="bg-white rounded-lg shadow-sm">
        <div className="p-6 border-b">
          <h2 className="text-lg font-semibold text-gray-900">Accounts Payable</h2>
        </div>
        <div className="overflow-x-auto">
          <div className="flex flex-wrap gap-2 mb-2">
            <select value={statusFilter} onChange={e => { onStatusFilter(e.target.value); onPageChange(1); }} className="border rounded px-2 py-1">
              <option value="">All Statuses</option>
              <option value="pending">Pending</option>
              <option value="paid">Paid</option>
              <option value="overdue">Overdue</option>
              <option value="partial">Partial</option>
            </select>
            <button onClick={() => onSort('dueDate')} className={`border rounded px-2 py-1 ${sort === 'dueDate' ? 'font-bold' : ''}`}>Due Date {sort === 'dueDate' ? (sortDir === 'asc' ? '↑' : '↓') : ''}</button>
            <button onClick={() => onSort('amount')} className={`border rounded px-2 py-1 ${sort === 'amount' ? 'font-bold' : ''}`}>Amount {sort === 'amount' ? (sortDir === 'asc' ? '↑' : '↓') : ''}</button>
            <button onClick={() => onSort('status')} className={`border rounded px-2 py-1 ${sort === 'status' ? 'font-bold' : ''}`}>Status {sort === 'status' ? (sortDir === 'asc' ? '↑' : '↓') : ''}</button>
          </div>
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
              {data.length === 0 ? (
                <tr><td colSpan={6} className="text-center text-gray-500 py-8">
                  <div className="flex flex-col items-center">
                    <AlertCircle className="w-8 h-8 text-gray-400 mb-2" aria-label="No payables" />
                    <span className="font-semibold">No payables found</span>
                    <span className="text-sm text-gray-400">Try adjusting your filters or add a new payable.</span>
                  </div>
                </td></tr>
              ) : data.map(ap => (
                <tr key={ap.id} className="hover:bg-gray-50">
                  <td className="px-6 py-4 text-gray-900">{ap.supplier_name}</td>
                  <td className="px-6 py-4 text-gray-900">{ap.invoice_number}</td>
                  <td className="px-6 py-4 text-gray-900">${ap.amount_due.toFixed(2)}</td>
                  <td className="px-6 py-4 text-gray-900">
                    {new Date(ap.due_date).toLocaleDateString()}
                    {ap.status === 'overdue' && (
                      <span className="ml-2 text-xs text-red-700 font-semibold" aria-label="Days overdue">
                        ({Math.max(0, Math.floor((Date.now() - new Date(ap.due_date).getTime()) / (1000 * 60 * 60 * 24)))} days overdue)
                      </span>
                    )}
                  </td>
                  <td className="px-6 py-4">
                    <span className={`px-2 py-1 text-xs rounded-full flex items-center w-fit ${getStatusColor(ap.status)}`} aria-label={`Status: ${ap.status}`}>
                      {getStatusIcon(ap.status)}
                      <span className="ml-1 capitalize">{ap.status}</span>
                    </span>
                  </td>
                  <td className="px-6 py-4">
                    <div className="flex space-x-2">
                      <button className="text-blue-600 hover:text-blue-800" onClick={() => onEdit(ap)}>
                        <Edit className="w-4 h-4" />
                      </button>
                      <button className="text-red-600 hover:text-red-800" onClick={() => onDelete(ap)}>
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <div className="flex justify-end gap-2 mt-2">
            <button disabled={page === 1} onClick={() => onPageChange(Math.max(1, page - 1))} className="px-2 py-1 border rounded disabled:opacity-50">Prev</button>
            <span>Page {page} of {totalPages || 1}</span>
            <button disabled={page === totalPages || totalPages === 0} onClick={() => onPageChange(Math.min(totalPages, page + 1))} className="px-2 py-1 border rounded disabled:opacity-50">Next</button>
          </div>
        </div>
      </div>
    );
  }

  // Add to Accounting component state:
  const [nonPricedItems, setNonPricedItems] = useState<any[]>([]);
  const [showEditNonPriced, setShowEditNonPriced] = useState<any | null>(null);
  const [nonPricedSearch, setNonPricedSearch] = useState('');
  const [nonPricedSort, setNonPricedSort] = useState<'customer'|'product'|'date'|'value'>('date');
  const [nonPricedSortDir, setNonPricedSortDir] = useState<'asc'|'desc'>('desc');
  const [nonPricedPage, setNonPricedPage] = useState(1);

  const [selectedNonPriced, setSelectedNonPriced] = useState<string[]>([]);
  const [showBulkActions, setShowBulkActions] = useState(false);
  const NON_PRICED_PAGE_SIZE = 10;

  // Load non-priced items from localStorage
  useEffect(() => {
    const key = 'erp_non_priced_items';
    setNonPricedItems(JSON.parse(localStorage.getItem(key) || '[]'));
  }, [showEditNonPriced, activeTab]);

  const handleEditNonPriced = (item: any) => setShowEditNonPriced(item);
  const handleSaveNonPriced = async (updated: any) => {
    if (!updated.unitPrice || updated.unitPrice <= 0) {
      showToast('Please enter a valid unit price', 'error');
      return;
    }
    if (!updated.quantity || updated.quantity <= 0) {
      showToast('Please enter a valid quantity', 'error');
      return;
    }
    
    const key = 'erp_non_priced_items';
    const items = JSON.parse(localStorage.getItem(key) || '[]');
    const newItems = items.map((i: any) => i.id === updated.id ? { ...updated, updatedAt: new Date().toISOString() } : i);
    localStorage.setItem(key, JSON.stringify(newItems));
    setShowEditNonPriced(null);
    setNonPricedItems(newItems);
    showToast('Item updated successfully', 'success');
  };
  
  const handleMarkPriced = async (item: any) => {
    if (!item.unitPrice || item.unitPrice <= 0) {
      showToast('Set a valid price before marking as priced.', 'error');
      return;
    }
    if (!item.quantity || item.quantity <= 0) {
      showToast('Set a valid quantity before marking as priced.', 'error');
      return;
    }
    
    const key = 'erp_non_priced_items';
    const items = JSON.parse(localStorage.getItem(key) || '[]');
    const newItems = items.filter((i: any) => i.id !== item.id);
    localStorage.setItem(key, JSON.stringify(newItems));
    setNonPricedItems(newItems);
    
    // Add to receivables
    const totalAmount = item.unitPrice * (item.weight || item.quantity);
    try {
      const customer = customers.find(c => c.id === item.customerId);
      if (customer) {
        await addAccountsReceivable({
          customer_id: item.customerId,
          customer_name: customer.name,
          invoice_number: 'NP-' + item.id.slice(-6).toUpperCase(),
          amount: totalAmount,
          amount_paid: 0,
          amount_due: totalAmount,
          due_date: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0], // 30 days from now
          status: 'pending',
          description: `${item.productName} (${item.weight || item.quantity} ${item.weight ? 'kg' : 'units'})`,
        });
        showToast('Moved to receivables successfully!', 'success');
      } else {
        showToast('Customer not found', 'error');
      }
    } catch (error) {
      showToast('Failed to move to receivables', 'error');
    }
  };

  const handleBulkMarkPriced = async () => {
    const validItems = selectedNonPriced
      .map(id => nonPricedItems.find(item => item.id === id))
      .filter(item => item && item.unitPrice > 0 && item.quantity > 0);
    
    if (validItems.length === 0) {
      showToast('No valid items selected (items must have price and quantity)', 'error');
      return;
    }
    
    for (const item of validItems) {
      await handleMarkPriced(item);
    }
    setSelectedNonPriced([]);
    setShowBulkActions(false);
  };

  const handleDeleteNonPriced = (item: any) => {
    if (window.confirm('Are you sure you want to delete this item?')) {
      const key = 'erp_non_priced_items';
      const items = JSON.parse(localStorage.getItem(key) || '[]');
      const newItems = items.filter((i: any) => i.id !== item.id);
      localStorage.setItem(key, JSON.stringify(newItems));
      setNonPricedItems(newItems);
      showToast('Item deleted successfully', 'success');
    }
  };

  const handleBulkDelete = () => {
    if (window.confirm(`Are you sure you want to delete ${selectedNonPriced.length} items?`)) {
      const key = 'erp_non_priced_items';
      const items = JSON.parse(localStorage.getItem(key) || '[]');
      const newItems = items.filter((i: any) => !selectedNonPriced.includes(i.id));
      localStorage.setItem(key, JSON.stringify(newItems));
      setNonPricedItems(newItems);
      setSelectedNonPriced([]);
      setShowBulkActions(false);
      showToast('Items deleted successfully', 'success');
    }
  };

  const exportNonPricedItems = () => {
    const csvContent = [
      ['Customer', 'Product', 'Supplier', 'Quantity', 'Weight', 'Unit Price', 'Total Value', 'Date Added', 'Notes'].join(','),
      ...displayNonPricedItems.map(item => [
        item.customerName,
        item.productName,
        item.supplierName,
        item.quantity || '',
        item.weight || '',
        item.unitPrice || '',
        item.unitPrice && (item.weight || item.quantity) ? (item.unitPrice * (item.weight || item.quantity)).toFixed(2) : '',
        item.date ? new Date(item.date).toLocaleDateString() : '',
        (item.notes || '').replace(/,/g, ';')
      ].join(','))
    ].join('\n');

    const blob = new Blob([csvContent], { type: 'text/csv' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `non-priced-items-${new Date().toISOString().split('T')[0]}.csv`;
    a.click();
    window.URL.revokeObjectURL(url);
  };

  // Enhanced nonPricedItems for display: filter, sort, and resolve customer name
  const filteredNonPricedItems = nonPricedItems
    .map(item => ({
      ...item,
      customerName: customers.find(c => c.id === item.customerId)?.name || item.customerId,
      supplierName: suppliers.find(s => s.id === item.supplierId)?.name || item.supplierName || 'Unknown',
      date: item.createdAt || '',
      totalValue: item.unitPrice && (item.weight || item.quantity) ? item.unitPrice * (item.weight || item.quantity) : 0,
      status: item.unitPrice > 0 && (item.quantity > 0 || item.weight > 0) ? 'ready' : 'incomplete'
    }))
    .filter(item => {
      const q = nonPricedSearch.toLowerCase();
      return (
        item.customerName.toLowerCase().includes(q) ||
        item.productName.toLowerCase().includes(q) ||
        item.supplierName.toLowerCase().includes(q) ||
        (item.notes || '').toLowerCase().includes(q)
      );
    })
    .sort((a, b) => {
      let cmp = 0;
      if (nonPricedSort === 'customer') cmp = a.customerName.localeCompare(b.customerName);
      if (nonPricedSort === 'product') cmp = a.productName.localeCompare(b.productName);
      if (nonPricedSort === 'date') cmp = new Date(a.date).getTime() - new Date(b.date).getTime();
      if (nonPricedSort === 'value') cmp = a.totalValue - b.totalValue;
      return nonPricedSortDir === 'asc' ? cmp : -cmp;
    });

  const displayNonPricedItems = filteredNonPricedItems;
  const nonPricedTotalPages = Math.ceil(filteredNonPricedItems.length / NON_PRICED_PAGE_SIZE);
  const pagedNonPricedItems = filteredNonPricedItems.slice(
    (nonPricedPage - 1) * NON_PRICED_PAGE_SIZE,
    nonPricedPage * NON_PRICED_PAGE_SIZE
  );



  return (
    <div className="p-6">
      <Toast message={toast.message} type={toast.type} visible={toast.visible} onClose={hideToast} />
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
          { id: 'expenses', label: 'Expenses', icon: Receipt },
          { id: 'nonpriced', label: 'Non Priced Items', icon: AlertCircle }
        ].map(tab => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id as any)}
            className={`px-4 py-2 rounded-md transition-colors flex items-center relative ${
              activeTab === tab.id ? 'bg-white text-blue-600 shadow-sm' : 'text-gray-600'
            }`}
          >
            <tab.icon className="w-4 h-4 mr-2" />
            {tab.label}
            {tab.id === 'nonpriced' && filteredNonPricedItems.length > 0 && (
              <span className="ml-2 bg-red-500 text-white text-xs rounded-full px-2 py-1 min-w-[20px] h-5 flex items-center justify-center">
                {filteredNonPricedItems.length}
              </span>
            )}
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
          <ReceivablesTable
            data={pagedAR}
            page={arPage}
            totalPages={arTotalPages}
            onPageChange={setArPage}
            onEdit={handleEditReceivable}
            onDelete={handleDeleteReceivable}
            statusFilter={arStatusFilter}
            onStatusFilter={setArStatusFilter}
            sort={arSort}
            sortDir={arSortDir}
            onSort={s => { setArSort(s); setArSortDir(arSortDir === 'asc' ? 'desc' : 'asc'); }}
            searchTerm={searchTerm}
          />
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
          <PayablesTable
            data={pagedAP}
            page={apPage}
            totalPages={apTotalPages}
            onPageChange={setApPage}
            onEdit={handleEditPayable}
            onDelete={handleDeletePayable}
            statusFilter={apStatusFilter}
            onStatusFilter={setApStatusFilter}
            sort={apSort}
            sortDir={apSortDir}
            onSort={s => { setApSort(s); setApSortDir(apSortDir === 'asc' ? 'desc' : 'asc'); }}
            searchTerm={searchTerm}
          />
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

      {activeTab === 'nonpriced' && (
        <div className="space-y-6">
          <div className="flex justify-between items-center">
            <div className="flex items-center">
              <h2 className="text-xl font-semibold text-gray-900">Non Priced Items</h2>
              {filteredNonPricedItems.length > 0 && (
                <span className="ml-3 bg-red-500 text-white text-sm rounded-full px-3 py-1">
                  {filteredNonPricedItems.length}
                </span>
              )}
            </div>
            <div className="flex space-x-2">
              <button
                onClick={exportNonPricedItems}
                className="bg-green-600 text-white px-4 py-2 rounded-lg hover:bg-green-700 transition-colors flex items-center"
              >
                <FileText className="w-4 h-4 mr-2" />
                Export CSV
              </button>
              {selectedNonPriced.length > 0 && (
                <button
                  onClick={() => setShowBulkActions(!showBulkActions)}
                  className="bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 transition-colors flex items-center"
                >
                  Bulk Actions ({selectedNonPriced.length})
                </button>
              )}
            </div>
          </div>

          {/* Bulk Actions */}
          {showBulkActions && selectedNonPriced.length > 0 && (
            <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium text-blue-900">
                  {selectedNonPriced.length} items selected
                </span>
                <div className="flex space-x-2">
                  <button
                    onClick={handleBulkMarkPriced}
                    className="bg-green-600 text-white px-3 py-1 rounded text-sm hover:bg-green-700"
                  >
                    Mark as Priced
                  </button>
                  <button
                    onClick={handleBulkDelete}
                    className="bg-red-600 text-white px-3 py-1 rounded text-sm hover:bg-red-700"
                  >
                    Delete
                  </button>
                  <button
                    onClick={() => setSelectedNonPriced([])}
                    className="bg-gray-600 text-white px-3 py-1 rounded text-sm hover:bg-gray-700"
                  >
                    Clear Selection
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* Search */}
          <div className="bg-white rounded-lg shadow-sm p-4">
            <div className="relative">
              <Search className="w-5 h-5 absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400" />
              <input
                type="text"
                value={nonPricedSearch}
                onChange={e => setNonPricedSearch(e.target.value)}
                placeholder="Search by customer, product, supplier, or notes..."
                className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-blue-500 focus:border-blue-500"
              />
            </div>
          </div>

          {/* Sort Controls */}
          <div className="flex flex-wrap gap-2 mb-4">
            <button 
              onClick={() => { setNonPricedSort('date'); setNonPricedSortDir(nonPricedSort === 'date' && nonPricedSortDir === 'asc' ? 'desc' : 'asc'); }}
              className={`px-3 py-1 border rounded-lg ${nonPricedSort === 'date' ? 'bg-blue-100 border-blue-500' : 'border-gray-300'}`}
            >
              Date {nonPricedSort === 'date' ? (nonPricedSortDir === 'asc' ? '↑' : '↓') : ''}
            </button>
            <button 
              onClick={() => { setNonPricedSort('customer'); setNonPricedSortDir(nonPricedSort === 'customer' && nonPricedSortDir === 'asc' ? 'desc' : 'asc'); }}
              className={`px-3 py-1 border rounded-lg ${nonPricedSort === 'customer' ? 'bg-blue-100 border-blue-500' : 'border-gray-300'}`}
            >
              Customer {nonPricedSort === 'customer' ? (nonPricedSortDir === 'asc' ? '↑' : '↓') : ''}
            </button>
            <button 
              onClick={() => { setNonPricedSort('product'); setNonPricedSortDir(nonPricedSort === 'product' && nonPricedSortDir === 'asc' ? 'desc' : 'asc'); }}
              className={`px-3 py-1 border rounded-lg ${nonPricedSort === 'product' ? 'bg-blue-100 border-blue-500' : 'border-gray-300'}`}
            >
              Product {nonPricedSort === 'product' ? (nonPricedSortDir === 'asc' ? '↑' : '↓') : ''}
            </button>
            <button 
              onClick={() => { setNonPricedSort('value'); setNonPricedSortDir(nonPricedSort === 'value' && nonPricedSortDir === 'asc' ? 'desc' : 'asc'); }}
              className={`px-3 py-1 border rounded-lg ${nonPricedSort === 'value' ? 'bg-blue-100 border-blue-500' : 'border-gray-300'}`}
            >
              Value {nonPricedSort === 'value' ? (nonPricedSortDir === 'asc' ? '↑' : '↓') : ''}
            </button>
          </div>

          {/* Enhanced Table */}
          <div className="bg-white rounded-lg shadow-sm">
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-4 py-3 text-left">
                      <input
                        type="checkbox"
                        checked={selectedNonPriced.length === pagedNonPricedItems.length && pagedNonPricedItems.length > 0}
                        onChange={e => {
                          if (e.target.checked) {
                            setSelectedNonPriced(pagedNonPricedItems.map(item => item.id));
                          } else {
                            setSelectedNonPriced([]);
                          }
                        }}
                        className="rounded border-gray-300"
                      />
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Status</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Customer</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Product</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Supplier</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Qty</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Weight (kg)</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Unit Price</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Total Value</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Date Added</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-200">
                  {pagedNonPricedItems.length === 0 ? (
                    <tr>
                      <td colSpan={11} className="text-center text-gray-500 py-8">
                        <div className="flex flex-col items-center">
                          <AlertCircle className="w-8 h-8 text-gray-400 mb-2" />
                          <span className="font-semibold">No non-priced items found</span>
                          <span className="text-sm text-gray-400">Items will appear here when they need pricing.</span>
                        </div>
                      </td>
                    </tr>
                  ) : pagedNonPricedItems.map(item => (
                    <tr key={item.id} className="hover:bg-gray-50">
                      <td className="px-4 py-3">
                        <input
                          type="checkbox"
                          checked={selectedNonPriced.includes(item.id)}
                          onChange={e => {
                            if (e.target.checked) {
                              setSelectedNonPriced(prev => [...prev, item.id]);
                            } else {
                              setSelectedNonPriced(prev => prev.filter(id => id !== item.id));
                            }
                          }}
                          className="rounded border-gray-300"
                        />
                      </td>
                      <td className="px-4 py-3">
                        <span className={`px-2 py-1 text-xs rounded-full ${
                          item.status === 'ready' 
                            ? 'bg-green-100 text-green-800' 
                            : 'bg-yellow-100 text-yellow-800'
                        }`}>
                          {item.status === 'ready' ? 'Ready' : 'Incomplete'}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-gray-900">{item.customerName}</td>
                      <td className="px-4 py-3 text-gray-900 font-medium">{item.productName}</td>
                      <td className="px-4 py-3 text-gray-900">{item.supplierName}</td>
                      <td className="px-4 py-3">
                        <input 
                          type="number" 
                          className="w-16 border rounded px-2 py-1 text-sm" 
                          value={item.quantity || ''} 
                          min={1} 
                          onChange={e => {
                            const newQuantity = parseInt(e.target.value) || 0;
                            handleSaveNonPriced({ ...item, quantity: newQuantity });
                          }}
                          placeholder="0"
                        />
                      </td>
                      <td className="px-4 py-3">
                        <input 
                          type="number" 
                          className="w-20 border rounded px-2 py-1 text-sm" 
                          value={item.weight || ''} 
                          min={0} 
                          step={0.01} 
                          onChange={e => {
                            const newWeight = parseFloat(e.target.value) || 0;
                            handleSaveNonPriced({ ...item, weight: newWeight });
                          }}
                          placeholder="0.00"
                        />
                      </td>
                      <td className="px-4 py-3">
                        <input 
                          type="number" 
                          className="w-24 border rounded px-2 py-1 text-sm" 
                          value={item.unitPrice || ''} 
                          min={0} 
                          step={0.01} 
                          onChange={e => {
                            const newPrice = parseFloat(e.target.value) || 0;
                            handleSaveNonPriced({ ...item, unitPrice: newPrice });
                          }}
                          placeholder="0.00"
                        />
                      </td>
                      <td className="px-4 py-3 font-semibold text-gray-900">
                        ${item.totalValue.toFixed(2)}
                      </td>
                      <td className="px-4 py-3 text-gray-500 text-sm">
                        {item.date ? new Date(item.date).toLocaleDateString() : '-'}
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex space-x-2">
                          <button 
                            onClick={() => setShowEditNonPriced(item)}
                            className="text-blue-600 hover:text-blue-800"
                            title="Edit details"
                          >
                            <Edit className="w-4 h-4" />
                          </button>
                          <button 
                            onClick={() => handleMarkPriced(item)}
                            disabled={item.status !== 'ready'}
                            className={`${
                              item.status === 'ready' 
                                ? 'text-green-600 hover:text-green-800' 
                                : 'text-gray-400 cursor-not-allowed'
                            }`}
                            title="Mark as priced"
                          >
                            <CheckCircle className="w-4 h-4" />
                          </button>
                          <button 
                            onClick={() => handleDeleteNonPriced(item)}
                            className="text-red-600 hover:text-red-800"
                            title="Delete item"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Pagination */}
            <div className="px-6 py-4 border-t border-gray-200 flex items-center justify-between">
              <div className="text-sm text-gray-700">
                Showing {((nonPricedPage - 1) * NON_PRICED_PAGE_SIZE) + 1} to {Math.min(nonPricedPage * NON_PRICED_PAGE_SIZE, filteredNonPricedItems.length)} of {filteredNonPricedItems.length} items
              </div>
              <div className="flex space-x-2">
                <button
                  onClick={() => setNonPricedPage(Math.max(1, nonPricedPage - 1))}
                  disabled={nonPricedPage === 1}
                  className="px-3 py-1 border border-gray-300 rounded text-sm disabled:opacity-50 disabled:cursor-not-allowed hover:bg-gray-50"
                >
                  Previous
                </button>
                <span className="px-3 py-1 text-sm text-gray-700">
                  Page {nonPricedPage} of {nonPricedTotalPages || 1}
                </span>
                <button
                  onClick={() => setNonPricedPage(Math.min(nonPricedTotalPages, nonPricedPage + 1))}
                  disabled={nonPricedPage === nonPricedTotalPages || nonPricedTotalPages === 0}
                  className="px-3 py-1 border border-gray-300 rounded text-sm disabled:opacity-50 disabled:cursor-not-allowed hover:bg-gray-50"
                >
                  Next
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Enhanced Edit Modal for Non-Priced Items */}
      {showEditNonPriced && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-lg max-w-2xl w-full max-h-[90vh] overflow-y-auto">
            <div className="p-6 border-b">
              <h2 className="text-xl font-semibold text-gray-900">Edit Non-Priced Item</h2>
            </div>
            <div className="p-6">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">Customer</label>
                                     <select
                     value={showEditNonPriced.customerId}
                     onChange={e => setShowEditNonPriced((prev: any) => ({ ...prev, customerId: e.target.value }))}
                     className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:ring-blue-500 focus:border-blue-500"
                   >
                     {customers.map(customer => (
                       <option key={customer.id} value={customer.id}>{customer.name}</option>
                     ))}
                   </select>
                 </div>
                 <div>
                   <label className="block text-sm font-medium text-gray-700 mb-2">Product Name</label>
                   <input
                     type="text"
                     value={showEditNonPriced.productName}
                     onChange={e => setShowEditNonPriced((prev: any) => ({ ...prev, productName: e.target.value }))}
                     className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:ring-blue-500 focus:border-blue-500"
                   />
                 </div>
                 <div>
                   <label className="block text-sm font-medium text-gray-700 mb-2">Supplier</label>
                   <select
                     value={showEditNonPriced.supplierId || ''}
                     onChange={e => setShowEditNonPriced((prev: any) => ({ ...prev, supplierId: e.target.value }))}
                     className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:ring-blue-500 focus:border-blue-500"
                   >
                     <option value="">Select supplier...</option>
                     {suppliers.map(supplier => (
                       <option key={supplier.id} value={supplier.id}>{supplier.name}</option>
                     ))}
                   </select>
                 </div>
                 <div>
                   <label className="block text-sm font-medium text-gray-700 mb-2">Quantity</label>
                   <input
                     type="number"
                     min="1"
                     value={showEditNonPriced.quantity || ''}
                     onChange={e => setShowEditNonPriced((prev: any) => ({ ...prev, quantity: parseInt(e.target.value) || 0 }))}
                     className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:ring-blue-500 focus:border-blue-500"
                   />
                 </div>
                 <div>
                   <label className="block text-sm font-medium text-gray-700 mb-2">Weight (kg)</label>
                   <input
                     type="number"
                     min="0"
                     step="0.01"
                     value={showEditNonPriced.weight || ''}
                     onChange={e => setShowEditNonPriced((prev: any) => ({ ...prev, weight: parseFloat(e.target.value) || 0 }))}
                     className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:ring-blue-500 focus:border-blue-500"
                   />
                 </div>
                 <div>
                   <label className="block text-sm font-medium text-gray-700 mb-2">Unit Price ($)</label>
                   <input
                     type="number"
                     min="0"
                     step="0.01"
                     value={showEditNonPriced.unitPrice || ''}
                     onChange={e => setShowEditNonPriced((prev: any) => ({ ...prev, unitPrice: parseFloat(e.target.value) || 0 }))}
                     className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:ring-blue-500 focus:border-blue-500"
                   />
                 </div>
               </div>
               <div className="mt-4">
                 <label className="block text-sm font-medium text-gray-700 mb-2">Notes</label>
                 <textarea
                   value={showEditNonPriced.notes || ''}
                   onChange={e => setShowEditNonPriced((prev: any) => ({ ...prev, notes: e.target.value }))}
                  rows={3}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:ring-blue-500 focus:border-blue-500"
                  placeholder="Add any notes or comments..."
                />
              </div>
              {showEditNonPriced.unitPrice > 0 && (showEditNonPriced.quantity > 0 || showEditNonPriced.weight > 0) && (
                <div className="mt-4 p-4 bg-green-50 border border-green-200 rounded-lg">
                  <p className="text-sm font-medium text-green-800">Total Value</p>
                  <p className="text-2xl font-bold text-green-900">
                    ${(showEditNonPriced.unitPrice * (showEditNonPriced.weight || showEditNonPriced.quantity)).toFixed(2)}
                  </p>
                </div>
              )}
            </div>
            <div className="p-6 border-t flex justify-end space-x-3">
              <button
                onClick={() => setShowEditNonPriced(null)}
                className="px-4 py-2 text-gray-700 border border-gray-300 rounded-lg hover:bg-gray-50"
              >
                Cancel
              </button>
              <button
                onClick={() => handleSaveNonPriced(showEditNonPriced)}
                className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
              >
                Save Changes
              </button>
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