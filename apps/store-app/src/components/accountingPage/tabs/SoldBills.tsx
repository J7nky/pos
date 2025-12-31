import { useState, useEffect, useCallback, useMemo } from 'react';
import { useSupabaseAuth } from '../../../contexts/SupabaseAuthContext';
import { useOfflineData } from '../../../contexts/OfflineDataContext';
import { useCurrency } from '../../../hooks/useCurrency';
import { useI18n } from '../../../i18n';
import { useLocalStorage } from '../../../hooks/useLocalStorage';
import { Pagination } from '../../common/Pagination';
import { calculateBillTotals, BillWithTotals, addComputedTotals } from '../../../utils/billCalculations';
import { 
  calculatePaymentStatus, 
  handleCustomerTypeChange, 
  validateCreditCustomerPayment,
  calculateBalanceAdjustments,
  resolveSupplierName,
  canEditBill 
} from '../../../utils/billBusinessRules';

import { 
  FileText, 
  Search, 
  Filter, 
  Eye, 
  Edit, 
  Trash2, 
  User, 
  DollarSign,
  Clock,
  CheckCircle,
  X,
  Save,
  RefreshCw,
  History,
  CreditCard,
  Activity,

} from 'lucide-react';

interface Bill {
  id: string;
  bill_number: string;
  customer_id: string | null;
  payment_method: 'cash' | 'card' | 'credit';
  payment_status: 'paid' | 'partial' | 'pending';
  amount_paid: number;
  bill_date: string;
  notes: string | null;
  status: 'active' | 'cancelled' | 'refunded';
  created_by: string;
  created_at: string;
  updated_at: string;
  customers?: { name: string };
  users?: { name: string };
  _synced?: boolean;
}

interface BillLineItem {
  id: string;
  product_id: string;
  inventory_item_id: string | null;
  quantity: number;
  unit_price: number;
  line_total: number;
  received_value: number;
  weight: number | null;
  notes: string | null;
  line_order: number;
}

type LineItemEditState = {
  product_id?: string;
  quantity?: string;
  unitPrice?: string;
  weight?: string;
  notes?: string;
};

interface BillAuditLog {
  id: string;
  action: string;
  field_changed: string | null;
  old_value: string | null;
  new_value: string | null;
  change_reason: string | null;
  changed_by: string;
  created_at: string;
  users?: { name: string; email: string };
}

interface BillDetails extends BillWithTotals {
  bill_line_items: BillLineItem[];
  bill_audit_logs: BillAuditLog[];
  _synced?: boolean;
}

interface SoldBillsProps {
  highlightBillNumber?: string | null;
}

export default function InventoryLogs({ highlightBillNumber }: SoldBillsProps = {}) {
  const { userProfile } = useSupabaseAuth();
  const raw = useOfflineData();
  const { formatCurrency } = useCurrency();
  const { t } = useI18n();
  const storeId = userProfile?.store_id;
  const [highlightedBillNumber, setHighlightedBillNumber] = useState<string | null>(null);

  // Check for bill to highlight from sessionStorage
  useEffect(() => {
    const checkHighlight = () => {
      const billNumber = highlightBillNumber || sessionStorage.getItem('highlightBillNumber');
      if (billNumber) {
        setHighlightedBillNumber(billNumber);
        // Scroll to the bill
        setTimeout(() => {
          const element = document.getElementById(`bill-${billNumber}`);
          if (element) {
            element.scrollIntoView({ behavior: 'smooth', block: 'center' });
          }
        }, 300);
        // Clear after highlighting
        sessionStorage.removeItem('highlightBillNumber');
        // Stop highlighting after 3 seconds
        setTimeout(() => {
          setHighlightedBillNumber(null);
        }, 1000);
        return true;
      }
      return false;
    };

    // Check immediately
    if (checkHighlight()) return;

    // Also check after a short delay to account for navigation timing
    const timeout = setTimeout(() => {
      checkHighlight();
    }, 200);

    return () => clearTimeout(timeout);
  }, [highlightBillNumber]);

  // Get data from offline context
  const customers = raw.customers.map(c => ({...c, isActive: c.is_active, createdAt: c.created_at, lb_balance: c.lb_balance || 0, usd_balance: c.usd_balance || 0}));
  const inventoryItems = raw.inventory || [];
  const inventoryBills = raw.inventoryBills || [];
  const products = raw.products || [];
  const suppliers = raw.suppliers || [];

  // Helper function to get customer name - memoized for performance
  const getCustomerName = useCallback((customerId: string | null): string => {
    if (!customerId) return 'Walk-in Customer';
    const customer = customers.find(c => c.id === customerId);
    return customer?.name || 'Walk-in Customer';
  }, [customers]);

  // State
  const [bills, setBills] = useState<Bill[]>([]);
  const [selectedBill, setSelectedBill] = useState<BillDetails | null>(null);
  const [loading, setLoading] = useState(true);
  const [isInitialLoad, setIsInitialLoad] = useState(true); // Track initial load separately
  const [showBillDetails, setShowBillDetails] = useState(false);
  const [showEditBill, setShowEditBill] = useState(false);
  const [showAuditTrail, setShowAuditTrail] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [syncStatus, setSyncStatus] = useState<'idle' | 'syncing' | 'synced' | 'error'>('idle');
  const [businessRuleWarnings, setBusinessRuleWarnings] = useState<string[]>([]);
  const [originalCustomerId, setOriginalCustomerId] = useState<string | null>(null);

  // Filters - persisted in localStorage
  const [searchTerm, setSearchTerm] = useLocalStorage('soldBills_searchTerm', '');
  const [debouncedSearchTerm, setDebouncedSearchTerm] = useState('');
  const [dateFrom, setDateFrom] = useLocalStorage('soldBills_dateFrom', '');
  const [dateTo, setDateTo] = useLocalStorage('soldBills_dateTo', '');
  const [paymentStatusFilter, setPaymentStatusFilter] = useLocalStorage('soldBills_paymentStatusFilter', '');
  const [statusFilter, setStatusFilter] = useLocalStorage('soldBills_statusFilter', '');
  const [showFilters, setShowFilters] = useLocalStorage('soldBills_showFilters', true);
  const [fastDateFilter, setFastDateFilter] = useLocalStorage<'all' | 'today' | 'week' | 'month'>('soldBills_fastDateFilter', 'today');
  const [isInitialized, setIsInitialized] = useState(false);

  // Helper function to format date in local timezone as YYYY-MM-DD
  const formatLocalDate = useCallback((date: Date): string => {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  }, []);

  // Initialize with today's date by default (only once, if not already set from localStorage)
  useEffect(() => {
    if (!storeId || isInitialized) return;
    
    // Only set default dates if not already set from localStorage
    if (!dateFrom && !dateTo) {
      const now = new Date();
      // Set to today - use local timezone
      setDateFrom(formatLocalDate(now));
      setDateTo(formatLocalDate(now));
      setFastDateFilter('today'); // Set fast filter to today as well
    }
    setIsInitialized(true);
  }, [storeId, isInitialized, dateFrom, dateTo, formatLocalDate, setDateFrom, setDateTo, setFastDateFilter]);
  
  // Pagination
  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 20;

  // Debounce search term to avoid reloading on every keystroke
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearchTerm(searchTerm);
    }, 300); // 300ms delay

    return () => clearTimeout(timer);
  }, [searchTerm]);

  // Handle fast date filter selection
  const handleFastDateFilter = (filter: 'all' | 'today' | 'week' | 'month') => {
    setFastDateFilter(filter);
    
    const now = new Date();
    let fromDate = '';
    let toDate = '';

    switch (filter) {
      case 'today':
        // Use local date, not UTC
        fromDate = formatLocalDate(now);
        toDate = formatLocalDate(now);
        break;
      case 'week':
        const startOfWeek = new Date(now);
        startOfWeek.setDate(now.getDate() - now.getDay()); // Sunday
        startOfWeek.setHours(0, 0, 0, 0);
        fromDate = formatLocalDate(startOfWeek);
        toDate = formatLocalDate(now);
        break;
      case 'month':
        const firstDayOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
        fromDate = formatLocalDate(firstDayOfMonth);
        toDate = formatLocalDate(now);
        break;
      case 'all':
        fromDate = '';
        toDate = '';
        break;
    }

    setDateFrom(fromDate);
    setDateTo(toDate);
  };

  // Edit form state
  const [editForm, setEditForm] = useState<Partial<Bill>>({});
  const [lineItemEdits, setLineItemEdits] = useState<Record<string, LineItemEditState>>({});


  // Toast state
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null);

  const inventoryItemMap = useMemo(() => {
    const map = new Map<string, any>();
    (inventoryItems || []).forEach((item: any) => {
      if (item?.id) {
        map.set(item.id, item);
      }
    });
    return map;
  }, [inventoryItems]);

  const inventoryBillStatusMap = useMemo(() => {
    const map = new Map<string, string>();
    (inventoryBills || []).forEach((bill: any) => {
      if (bill?.id) {
        const status = typeof bill.status === 'string' ? bill.status.toLowerCase() : '';
        map.set(bill.id, status);
      }
    });
    return map;
  }, [inventoryBills]);

  const billLineItems = useMemo(() => {
    if (!selectedBill) return [] as BillLineItem[];
    let items: BillLineItem[] = [];
    if (Array.isArray(selectedBill.bill_line_items)) {
      items = selectedBill.bill_line_items;
    } else {
      const fallback = (selectedBill as any)?.line_items;
      items = Array.isArray(fallback) ? fallback : [];
    }

    // Return items as-is - product/supplier names will be resolved in UI
    return items;
  }, [selectedBill]);

  const getInventoryContextForLineItem = useCallback((lineItem: BillLineItem) => {
    const inventoryItem = lineItem.inventory_item_id
      ? inventoryItemMap.get(lineItem.inventory_item_id)
      : null;
    const batchId = inventoryItem?.batch_id || null;
    const batchStatus = batchId ? inventoryBillStatusMap.get(batchId) : undefined;
    const inventoryStatus = typeof inventoryItem?.status === 'string'
      ? inventoryItem.status.toLowerCase()
      : undefined;
    const isClosed = (batchStatus && batchStatus.toLowerCase() === 'closed') || inventoryStatus === 'closed';

    return {
      inventoryItem,
      inventoryBillId: batchId,
      batchStatus: batchStatus || inventoryStatus || null,
      isEditable: !isClosed,
    };
  }, [inventoryItemMap, inventoryBillStatusMap]);

  const billFormHasChanges = useMemo(() => {
    if (!selectedBill) return false;
    
    // Check bill-level changes
    const billChanges = (
      editForm.customer_id !== selectedBill.customer_id ||
      editForm.payment_method !== selectedBill.payment_method ||
      editForm.payment_status !== selectedBill.payment_status ||
      (editForm.amount_paid !== undefined && editForm.amount_paid !== selectedBill.amount_paid) ||
      (editForm.notes !== undefined && editForm.notes !== selectedBill.notes)
    );
    
    // Check line item changes
    const hasLineItemChanges = billLineItems.some(item => {
      const edits = lineItemEdits[item.id] || {};
      if (Object.keys(edits).length === 0) return false;
      
      const quantityValue = edits.quantity ?? item.quantity.toString();
      const unitPriceValue = edits.unitPrice ?? item.unit_price.toString();
      const weightValue = edits.weight ?? (item.weight !== null && item.weight !== undefined ? item.weight.toString() : '');
      const notesValue = edits.notes ?? (item.notes ?? '');
      
      return (
        (edits.quantity !== undefined && Number(quantityValue) !== item.quantity) ||
        (edits.unitPrice !== undefined && Number(unitPriceValue) !== item.unit_price) ||
        (edits.weight !== undefined && (weightValue === '' ? null : Number(weightValue)) !== (item.weight ?? null)) ||
        (edits.notes !== undefined && notesValue !== (item.notes ?? ''))
      );
    });
    
    return billChanges || hasLineItemChanges;
  }, [selectedBill, editForm, lineItemEdits, billLineItems]);

  const getFieldLabel = useCallback((fieldName: string): string => {
    const fieldLabels: Record<string, string> = {
      customer_id: t('soldBills.customer'),
      payment_method: t('soldBills.paymentMethod'),
      payment_status: t('soldBills.paymentStatus'),
      amount_paid: t('soldBills.amountPaid'),
      notes: t('soldBills.notes'),
      subtotal: t('soldBills.subtotal'),
      total_amount: t('soldBills.total'),
      status: t('soldBills.status'),
    };
    return fieldLabels[fieldName] || fieldName;
  }, [t]);

  const renderAuditValue = useCallback((fieldName: string | null, value: string | null) => {
    if (value === null || value === undefined || value === '') {
      return <span className="italic text-slate-400">{t('soldBills.notAvailable')}</span>;
    }

    const trimmed = typeof value === 'string' ? value.trim() : value;
    const normalizedField = fieldName || '';

    // Customer ID - resolve to customer name
    if (normalizedField === 'customer_id') {
      const customerName = getCustomerName(value);
      return (
        <span className="inline-flex items-center gap-1.5">
          <User className="h-3.5 w-3.5 text-slate-400" />
          <span>{customerName}</span>
        </span>
      );
    }

    // Payment method - with icon
    if (normalizedField === 'payment_method') {
      const translatedValue = t(`soldBills.${value}`);
      return (
        <span className="inline-flex items-center gap-1.5">
          {value === 'cash' && <DollarSign className="h-3.5 w-3.5 text-green-500" />}
          {value === 'card' && <CreditCard className="h-3.5 w-3.5 text-blue-500" />}
          {value === 'credit' && <Clock className="h-3.5 w-3.5 text-amber-500" />}
          <span className="capitalize">{translatedValue}</span>
        </span>
      );
    }

    // Payment status - with badge
    if (normalizedField === 'payment_status') {
      const statusColors: Record<string, string> = {
        paid: 'bg-green-100 text-green-700 border-green-200',
        partial: 'bg-amber-100 text-amber-700 border-amber-200',
        pending: 'bg-gray-100 text-gray-700 border-gray-200',
      };
      const colorClass = statusColors[value] || 'bg-gray-100 text-gray-700 border-gray-200';
      return (
        <span className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs font-medium ${colorClass}`}>
          <span className="capitalize">{t(`soldBills.${value}`)}</span>
        </span>
      );
    }

    // Monetary amounts - with currency formatting
    if (['amount_paid', 'subtotal', 'total_amount', 'line_total'].includes(normalizedField)) {
      const numericValue = Number(value);
      if (!Number.isNaN(numericValue)) {
        return (
          <span className="inline-flex items-center gap-1.5 font-mono text-sm">
            <DollarSign className="h-3.5 w-3.5 text-slate-400" />
            <span className="font-semibold">{formatCurrency(numericValue)}</span>
          </span>
        );
      }
    }

    // Bill status - with badge
    if (normalizedField === 'status') {
      const statusColors: Record<string, string> = {
        active: 'bg-green-100 text-green-700 border-green-200',
        cancelled: 'bg-red-100 text-red-700 border-red-200',
        refunded: 'bg-purple-100 text-purple-700 border-purple-200',
      };
      
      const colorClass = statusColors[value] || 'bg-gray-100 text-gray-700 border-gray-200';
      return (
        <span className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs font-medium ${colorClass}`}>
          <span className="capitalize">{t(`soldBills.${value}`)}</span>
        </span>
      );
    }

    // Dates and timestamps - with icon
    if (normalizedField.endsWith('_at') || normalizedField.includes('date')) {
      const date = new Date(value);
      if (!Number.isNaN(date.getTime())) {
        return (
          <span className="inline-flex items-center gap-1.5 text-sm">
            <Clock className="h-3.5 w-3.5 text-slate-400" />
            <span>{date.toLocaleString()}</span>
          </span>
        );
      }
    }

    // Notes - with multiline support
    if (normalizedField === 'notes') {
      return (
        <div className="rounded-lg bg-slate-50 border border-slate-200 p-2 text-sm text-slate-700">
          {value || <span className="italic text-slate-400">{t('soldBills.noNotes')}</span>}
        </div>
      );
    }

    // Boolean values
    if (value === 'true' || value === 'false') {
      const isTrue = value === 'true';
      return (
        <span className={`inline-flex items-center gap-1.5 ${isTrue ? 'text-green-600' : 'text-red-600'}`}>
          {isTrue ? <CheckCircle className="h-3.5 w-3.5" /> : <X className="h-3.5 w-3.5" />}
          <span className="capitalize font-medium">{isTrue ? t('soldBills.yes') : t('soldBills.no')}</span>
        </span>
      );
    }

    // Hide JSON objects and arrays completely
    if (typeof trimmed === 'string' && trimmed.length > 1 && ((trimmed.startsWith('{') && trimmed.endsWith('}')) || (trimmed.startsWith('[') && trimmed.endsWith(']')))) {
      try {
        JSON.parse(trimmed);
        // If it's valid JSON, hide it with a friendly message
        return (
          <div className="rounded-lg border border-amber-100 bg-amber-50 px-3 py-2 text-xs text-amber-700">
            <div className="flex items-center gap-2">
              <Activity className="h-3.5 w-3.5" />
              <span className="font-medium">{t('soldBills.systemUpdate')}</span>
            </div>
          </div>
        );
      } catch (error) {
        // Not valid JSON, continue to show as regular value
      }
    }

    // Default - plain text
    return <span className="text-sm">{value}</span>;
  }, [formatCurrency, getCustomerName, t]);

  const groupedAuditLogs = useMemo(() => {
    if (!selectedBill?.bill_audit_logs) return [];

    // Group by timestamp and change reason to combine related changes
    const groups = new Map<string, BillAuditLog[]>();
    
    selectedBill.bill_audit_logs.forEach(log => {
      const key = `${log.created_at}_${log.changed_by}_${log.change_reason || 'no_reason'}`;
      if (!groups.has(key)) {
        groups.set(key, []);
      }
      groups.get(key)!.push(log);
    });

    // Convert to array and sort by timestamp (newest first)
    return Array.from(groups.values())
      .sort((a, b) => new Date(b[0].created_at).getTime() - new Date(a[0].created_at).getTime());
  }, [selectedBill]);

  const auditActionMeta = useMemo(() => ({
    updated: {
      label: t('soldBills.auditActionUpdated'),
      badgeClass: 'border border-blue-100 bg-blue-50 text-blue-700 shadow-sm',
      dotClass: 'bg-blue-500',
      icon: <RefreshCw className="h-3 w-3" />,
    },
    created: {
      label: t('soldBills.auditActionCreated'),
      badgeClass: 'border border-green-100 bg-green-50 text-green-700 shadow-sm',
      dotClass: 'bg-green-500',
      icon: <CheckCircle className="h-3 w-3" />,
    },
    deleted: {
      label: t('soldBills.auditActionDeleted'),
      badgeClass: 'border border-red-100 bg-red-50 text-red-700 shadow-sm',
      dotClass: 'bg-red-500',
      icon: <Trash2 className="h-3 w-3" />,
    },
  }), [t]);

  const showToast = useCallback((message: string, type: 'success' | 'error' = 'success') => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 3000);
  }, []);

  // Load bills from offline context - wrapped in useCallback to prevent re-creation
  const loadBills = useCallback(async () => {
    if (!storeId) return;

    setLoading(true);
    setSyncStatus('syncing');
    
    try {
      // Normalize search term: if it's a number, add "Bill-" prefix for matching
      let normalizedSearchTerm = debouncedSearchTerm;
      if (debouncedSearchTerm && /^\d+$/.test(debouncedSearchTerm.trim())) {
        normalizedSearchTerm = `Bill-${debouncedSearchTerm.trim()}`;
      }
      
      const filters = {
        searchTerm: normalizedSearchTerm || undefined,
        dateFrom: dateFrom || undefined,
        dateTo: dateTo || undefined,
        paymentStatus: paymentStatusFilter || undefined,
        status: statusFilter || undefined,
        limit: 100
      };

      const data = await raw.getBills(filters);
      
      // Add computed totals to each bill
      const billsWithTotals = (data || []).map(bill => {
        // Get line items for this bill from raw context
        const lineItems = raw.billLineItems.filter(li => li.bill_id === bill.id);
        const totals = calculateBillTotals(lineItems, bill.amount_paid);
        return {
          ...bill,
          ...totals
        };
      });
      
      setBills(billsWithTotals as any);
      setSyncStatus('synced');
      
      // Reset sync status after 3 seconds
      setTimeout(() => setSyncStatus('idle'), 3000);
    } catch (error) {
      console.error('Error loading bills:', error);
      showToast('Failed to load bills', 'error');
      setSyncStatus('error');
      
      // Reset sync status after 5 seconds
      setTimeout(() => setSyncStatus('idle'), 5000);
    } finally {
      setLoading(false);
      setIsInitialLoad(false); // Mark initial load as complete
    }
  }, [storeId, debouncedSearchTerm, dateFrom, dateTo, paymentStatusFilter, statusFilter, raw, showToast]);

  useEffect(() => {
    if (storeId) {
      loadBills();
      setCurrentPage(1); // Reset to first page when filters change
    }
  }, [storeId, loadBills]);

  const loadBillDetails = async (billId: string) => {
    try {
      const data = await raw.getBillDetails(billId);
      if (!data) {
        setSelectedBill(null);
        return;
      }

      const normalizedLineItems = Array.isArray((data as any).bill_line_items)
        ? (data as any).bill_line_items
        : Array.isArray((data as any).line_items)
          ? (data as any).line_items
          : [];

      const normalizedAuditLogs = Array.isArray((data as any).bill_audit_logs)
        ? (data as any).bill_audit_logs
        : Array.isArray((data as any).audit_logs)
          ? (data as any).audit_logs
          : [];

      // Add computed totals to the bill
      const billWithTotals = addComputedTotals(data as any, normalizedLineItems);
      
      const normalizedBill = {
        ...billWithTotals,
        bill_line_items: normalizedLineItems,
        bill_audit_logs: normalizedAuditLogs,
      } as BillDetails;

      setSelectedBill(normalizedBill);
      setEditForm(normalizedBill);
      setLineItemEdits({});
    } catch (error) {
      console.error('Error loading bill details:', error);
      showToast('Failed to load bill details', 'error');
    }
  };

  const handleViewBill = async (bill: Bill) => {
    await loadBillDetails(bill.id);
    setShowBillDetails(true);
  };

  const handleEditBill = async (bill: Bill) => {
    await loadBillDetails(bill.id);
    setOriginalCustomerId(bill.customer_id);
    setBusinessRuleWarnings([]);
    setShowEditBill(true);
  };

  const handleSaveBill = async () => {
    console.log('🔍 handleSaveBill called');
    console.log('🔍 selectedBill:', selectedBill);
    console.log('🔍 userProfile:', userProfile);
    
    if (!selectedBill || !userProfile?.id) {
      console.log('❌ Early return - missing selectedBill or userProfile');
      return;
    }

    setIsEditing(true);
    try {
      console.log('🔍 Starting validation...');
      // Validate all line item changes before saving
      const lineItemErrors: string[] = [];
      
      for (const item of billLineItems) {
        const edits = lineItemEdits[item.id] || {};
        if (Object.keys(edits).length === 0) continue;
        
        const quantityValue = edits.quantity ?? item.quantity.toString();
        const unitPriceValue = edits.unitPrice ?? item.unit_price.toString();
        const weightValue = edits.weight ?? (item.weight !== null && item.weight !== undefined ? item.weight.toString() : '');
        
        // Get product name for error messages
        const product = products.find(p => p.id === item.product_id);
        const productName = product?.name || 'Unknown Product';
        
        if (edits.quantity !== undefined) {
          if (quantityValue.trim() === '' || !Number.isFinite(Number(quantityValue)) || Number(quantityValue) <= 0) {
            lineItemErrors.push(`${productName}: ${t('accounting.pleaseEnterValidQuantity')}`);
          }
        }
        
        if (edits.unitPrice !== undefined) {
          if (unitPriceValue.trim() === '' || !Number.isFinite(Number(unitPriceValue)) || Number(unitPriceValue) <= 0) {
            lineItemErrors.push(`${productName}: ${t('accounting.pleaseEnterValidUnitPrice')}`);
          }
        }
        
        if (edits.weight !== undefined && weightValue !== '') {
          if (!Number.isFinite(Number(weightValue)) || Number(weightValue) < 0) {
            lineItemErrors.push(`${productName}: ${t('soldBills.invalidWeight')}`);
          }
        }
        
        // Check if line item is editable
        const { isEditable } = getInventoryContextForLineItem(item);
        if (!isEditable && Object.keys(edits).length > 0) {
          lineItemErrors.push(`${productName}: ${t('soldBills.inventoryBillClosed')}`);
        }
      }
      
      if (lineItemErrors.length > 0) {
        showToast(lineItemErrors.join('; '), 'error');
        setIsEditing(false);
        return;
      }

      // Save all line item changes first
      console.log('🔍 Starting to save line items. Total items:', billLineItems.length);
      console.log('🔍 Line item edits:', lineItemEdits);
      
      for (const item of billLineItems) {
        const edits = lineItemEdits[item.id] || {};
        const product = products.find(p => p.id === item.product_id);
        const productName = product?.name || 'Unknown Product';
        console.log(`🔍 Processing item ${item.id} (${productName}), edits:`, edits);
        
        if (Object.keys(edits).length === 0) {
          console.log(`  ⏭️ Skipping item ${item.id} - no edits`);
          continue;
        }
        
        console.log(`  ✅ Item ${item.id} has edits, proceeding to save...`);
        
        const quantityValue = edits.quantity ?? item.quantity.toString();
        const unitPriceValue = edits.unitPrice ?? item.unit_price.toString();
        const weightValue = edits.weight ?? (item.weight !== null && item.weight !== undefined ? item.weight.toString() : '');
        const notesValue = edits.notes ?? (item.notes ?? '');
        
        // ==================== ONLY UPDATE FIELDS THAT ACTUALLY CHANGED ====================
        const updates: Partial<BillLineItem> = {};
        
        // Track if quantity or price changed (affects line_total calculation)
        let quantityChanged = false;
        let unitPriceChanged = false;
        let weightChanged = false;
        
        // Only add quantity if it actually changed
        if (edits.quantity !== undefined) {
          const newQuantity = Number(quantityValue);
          if (newQuantity !== item.quantity) {
            updates.quantity = newQuantity;
            quantityChanged = true;
          }
        }
        
        // Only add unit_price if it actually changed
        if (edits.unitPrice !== undefined) {
          const newUnitPrice = Number(unitPriceValue);
          if (newUnitPrice !== item.unit_price) {
            updates.unit_price = newUnitPrice;
            unitPriceChanged = true;
          }
        }
        
        // Only add weight if it actually changed
        if (edits.weight !== undefined) {
          const newWeight = weightValue.trim() === '' ? null : Number(weightValue);
          if (newWeight !== item.weight) {
            updates.weight = newWeight;
            weightChanged = true;
          }
        }
        
        // Recalculate line_total ONLY if quantity, price, or weight changed
        if (quantityChanged || unitPriceChanged || weightChanged) {
          const finalQuantity = updates.quantity ?? item.quantity;
          const finalUnitPrice = updates.unit_price ?? item.unit_price;
          const finalWeight = updates.weight !== undefined ? updates.weight : item.weight;
          
          const lineTotal = finalWeight && finalWeight > 0 
            ? Number((finalWeight * finalUnitPrice).toFixed(2))
            : Number((finalQuantity * finalUnitPrice).toFixed(2));
          
          // Only update line_total if it actually changed
          if (lineTotal !== item.line_total) {
            updates.line_total = lineTotal;
            updates.received_value = lineTotal;
          }
        }
        
        // Add product changes if edited
        if (edits.product_id !== undefined && edits.product_id !== item.product_id) {
          updates.product_id = edits.product_id;
        }
        
        // Only add notes if it actually changed
        if (edits.notes !== undefined) {
          const newNotes = notesValue.trim() === '' ? null : notesValue.trim();
          if (newNotes !== item.notes) {
            updates.notes = newNotes;
          }
        }
        
        // Only call updateSale if there are actual changes
        if (Object.keys(updates).length > 0) {
          await raw.updateSale(item.id, updates);
        }
      }
      
      console.log('✅ Finished saving all line items');

      // Save bill-level changes - only include fields that have actually changed
      const updates: Partial<Bill> = {};
      
      // Helper function to normalize values for comparison
      const normalizeForComparison = (value: any): string => {
        if (value === null || value === undefined) return '';
        if (typeof value === 'number') return String(value);
        return String(value).trim();
      };
      
      // Track if amount_paid or payment_method changed for balance adjustments
      let amountPaidChanged = false;
      let paymentMethodChanged = false;
      let oldAmountPaid = selectedBill.amount_paid ?? 0;
      let newAmountPaid = oldAmountPaid;
      let oldPaymentMethod = selectedBill.payment_method;
      let newPaymentMethod = oldPaymentMethod;
      
      // Only include fields that have actually changed
      if (editForm.customer_id !== undefined && normalizeForComparison(editForm.customer_id) !== normalizeForComparison(selectedBill.customer_id)) {
        updates.customer_id = editForm.customer_id ?? null;
      }
      
      if (editForm.payment_method !== undefined && editForm.payment_method !== selectedBill.payment_method) {
        updates.payment_method = editForm.payment_method;
        paymentMethodChanged = true;
        newPaymentMethod = editForm.payment_method;
      }
      
      // Handle amount_paid changes
      if (editForm.amount_paid !== undefined) {
        newAmountPaid = editForm.amount_paid ?? 0;
        if (normalizeForComparison(newAmountPaid) !== normalizeForComparison(oldAmountPaid)) {
          updates.amount_paid = newAmountPaid;
          amountPaidChanged = true;
        }
      }
      
      // ENFORCE: Payment status MUST be calculated from amounts, not manually set
      const totalAmount = selectedBill.total_amount || 0;
      const calculatedPaymentStatus = calculatePaymentStatus(newAmountPaid, totalAmount);
      
      // Always update payment_status to the calculated value if it differs
      if (calculatedPaymentStatus !== selectedBill.payment_status) {
        updates.payment_status = calculatedPaymentStatus;
        console.log(`🔍 Payment status auto-calculated: ${calculatedPaymentStatus} (was: ${selectedBill.payment_status})`);
      }
      
      // VALIDATE: Walk-in customers cannot use credit payment method
      const finalPaymentMethod = updates.payment_method || selectedBill.payment_method;
      const finalCustomerId = updates.customer_id !== undefined ? updates.customer_id : selectedBill.customer_id;
      const creditValidation = validateCreditCustomerPayment(
        finalPaymentMethod,
        finalCustomerId,
        newAmountPaid,
        totalAmount,
        updates.customer_id !== undefined && updates.customer_id !== selectedBill.customer_id
      );
      
      if (!creditValidation.valid) {
        showToast(creditValidation.error || 'Invalid payment configuration', 'error');
        setIsEditing(false);
        return;
      }
      
      if (editForm.notes !== undefined && normalizeForComparison(editForm.notes) !== normalizeForComparison(selectedBill.notes)) {
        updates.notes = editForm.notes ?? null;
      }
      
      // Handle balance adjustments if amount_paid or payment_method changed
      if (amountPaidChanged || paymentMethodChanged) {
        const finalCustomerId = updates.customer_id !== undefined ? updates.customer_id : selectedBill.customer_id;
        
        // Calculate adjustments based on what changed
        let customerBalanceDelta = 0;
        let cashDrawerDelta = 0;
        
        if (amountPaidChanged && !paymentMethodChanged) {
          // Only amount changed - use new payment method
          const adjustments = calculateBalanceAdjustments(
            oldAmountPaid,
            newAmountPaid,
            newPaymentMethod
          );
          customerBalanceDelta = adjustments.customerBalanceDelta;
          cashDrawerDelta = adjustments.cashDrawerDelta;
          console.log('🔍 Amount changed - Balance adjustments:', adjustments);
        } else if (paymentMethodChanged && !amountPaidChanged) {
          // Only payment method changed - need to reverse old method and apply new method
          // Example: $100 paid via Cash → Credit means remove $100 from cash drawer
          const oldMethodAffectsCash = oldPaymentMethod === 'cash' || oldPaymentMethod === 'card';
          const newMethodAffectsCash = newPaymentMethod === 'cash' || newPaymentMethod === 'card';
          
          if (oldMethodAffectsCash && !newMethodAffectsCash) {
            // Moving FROM cash/card TO credit: remove from cash drawer
            cashDrawerDelta = -newAmountPaid;
            console.log(`💰 Payment method changed: ${oldPaymentMethod} → ${newPaymentMethod}, removing ${newAmountPaid} from cash drawer`);
          } else if (!oldMethodAffectsCash && newMethodAffectsCash) {
            // Moving FROM credit TO cash/card: add to cash drawer
            cashDrawerDelta = newAmountPaid;
            console.log(`💰 Payment method changed: ${oldPaymentMethod} → ${newPaymentMethod}, adding ${newAmountPaid} to cash drawer`);
          }
          // If both affect cash (cash ↔ card), no net change to cash drawer total
          // (though in reality, you might want to track cash vs card separately)
        } else if (amountPaidChanged && paymentMethodChanged) {
          // Both changed - need to handle carefully
          // First reverse the old payment, then apply the new one
          const oldMethodAffectsCash = oldPaymentMethod === 'cash' || oldPaymentMethod === 'card';
          const newMethodAffectsCash = newPaymentMethod === 'cash' || newPaymentMethod === 'card';
          
          if (oldMethodAffectsCash) {
            cashDrawerDelta -= oldAmountPaid; // Remove old amount
          }
          if (newMethodAffectsCash) {
            cashDrawerDelta += newAmountPaid; // Add new amount
          }
          
          // Customer balance delta
          const adjustments = calculateBalanceAdjustments(
            oldAmountPaid,
            newAmountPaid,
            newPaymentMethod
          );
          customerBalanceDelta = adjustments.customerBalanceDelta;
          
          console.log(`🔍 Both amount and payment method changed: ${oldPaymentMethod}($${oldAmountPaid}) → ${newPaymentMethod}($${newAmountPaid})`);
          console.log(`💰 Cash drawer delta: ${cashDrawerDelta}, Customer balance delta: ${customerBalanceDelta}`);
        }
        
        // Note: Customer balance is now calculated from journal entries, not updated directly
        // The balance delta is handled through journal entries created by the transaction service
        if (finalCustomerId && customerBalanceDelta !== 0) {
          const customer = customers.find(c => c.id === finalCustomerId);
          if (customer) {
            console.log(`📊 Customer balance delta: ${customerBalanceDelta} (handled via journal entries)`);
            // Balance is automatically calculated from journal entries - no direct update needed
          }
        }
        
        // Update cash drawer if there's a delta
        if (cashDrawerDelta !== 0) {
          console.log(`💰 Updating cash drawer by: ${cashDrawerDelta}`);
          
          try {
            const transactionType: 'sale' | 'payment' | 'expense' | 'refund' = cashDrawerDelta > 0 ? 'sale' : 'refund';
            const absoluteAmount = Math.abs(cashDrawerDelta);
            
            const result = await raw.processCashDrawerTransaction({
              type: transactionType,
              amount: absoluteAmount,
              currency: 'USD' as 'USD' | 'LBP', // TODO: Use bill currency
              description: `Bill #${selectedBill.bill_number} - Payment ${paymentMethodChanged ? 'method' : 'amount'} adjustment`,
              reference: `bill_${selectedBill.id}`,
              customerId: finalCustomerId || undefined,
              storeId: storeId!,
              createdBy: userProfile.id
            });
            
            if (result.success) {
              console.log(`✅ Cash drawer updated successfully: ${cashDrawerDelta > 0 ? '+' : ''}${cashDrawerDelta}`);
            }
          } catch (error) {
            console.error('❌ Failed to update cash drawer:', error);
            showToast('Bill saved but cash drawer update failed', 'error');
          }
        }
      }
      
      // Only call updateBill if there are actual changes
      if (Object.keys(updates).length > 0) {
        console.log('🔍 Bill-level updates:', updates);
        await raw.updateBill(selectedBill.id, updates, userProfile.id, 'Bill updated via Inventory Logs');
      } else {
        console.log('⏭️ No bill-level changes to save');
      }

      showToast('Bill updated successfully');
      
      // Reload bill details to show updated audit logs (before closing modal)
      if (selectedBill.id) {
        await loadBillDetails(selectedBill.id);
      }
      
      handleCloseEditBill();
      loadBills();
    } catch (error) {
      console.error('Error updating bill:', error);
      showToast('Failed to update bill', 'error');
    } finally {
      setIsEditing(false);
    }
  };

  const handleLineItemChange = (lineItemId: string, field: keyof LineItemEditState, value: string) => {
    setLineItemEdits(prev => ({
      ...prev,
      [lineItemId]: {
        ...prev[lineItemId],
        [field]: value,
      },
    }));
  };


  const handleCloseEditBill = () => {
    setShowEditBill(false);
    setLineItemEdits({});
  };

  const handleDeleteBill = async (bill: Bill, softDelete: boolean = true) => {
    if (!userProfile?.id) return;

    const confirmMessage = softDelete 
      ? `Are you sure you want to cancel bill ${bill.bill_number}? This will mark it as cancelled but keep it in the system.`
      : `Are you sure you want to permanently delete bill ${bill.bill_number}? This action cannot be undone.`;

    if (!confirm(confirmMessage)) return;

    try {
      await raw.deleteBill(bill.id, userProfile.id, softDelete ? 'Bill cancelled' : 'Bill permanently deleted', softDelete);

      showToast(`Bill ${softDelete ? 'cancelled' : 'deleted'} successfully`);
      loadBills();
    } catch (error) {
      console.error('Error deleting bill:', error);
      showToast('Failed to delete bill', 'error');
    }
  };

  // // Payment handlers
  // const handlePaymentSubmit = async (e: React.FormEvent) => {
  //   e.preventDefault();
    
  //   if (!paymentForm.amount || parseFloat(paymentForm.amount) <= 0) {
  //     showToast('Please enter a valid amount', 'error');
  //     return;
  //   }
    
  //   if (!paymentForm.entityId) {
  //     showToast(`Please select a ${paymentForm.entityType}`, 'error');
  //     return;
  //   }
    
  //   try {
  //     const amount = parseFloat(paymentForm.amount);
      
  //     if (paymentForm.entityType === 'customer') {
  //       const customer = customers.find(c => c.id === paymentForm.entityId);
  //       if (!customer) {
  //         showToast('Customer not found', 'error');
  //         return;
  //       }
        
  //       // Update customer balance
  //       const currentBalance = paymentForm.currency === 'LBP' ? customer.lb_balance : customer.usd_balance;
  //       const newBalance = Math.max(0, currentBalance - amount);
        
  //       await raw.updateCustomer(paymentForm.entityId, {
  //         [paymentForm.currency === 'LBP' ? 'lb_balance' : 'usd_balance']: newBalance
  //       });
        
  //       // Add transaction
  //       await raw.addTransaction({
  //         id: createId(),
  //         type: 'income',
  //         category: 'Customer Payment',
  //         customer_id: customer.id,
  //         amount: amount,
  //         currency: paymentForm.currency,
  //         description: `Payment from ${customer.name}: ${paymentForm.description}`,
  //         reference: paymentForm.reference,
  //         created_by: userProfile?.id || ''
  //       });
        
  //       showToast(`Payment received from ${customer.name}`, 'success');
  //     } else {
  //       const supplier = suppliers.find(s => s.id === paymentForm.entityId);
  //       if (!supplier) {
  //         showToast('Supplier not found', 'error');
  //         return;
  //       }
        
  //       // Update supplier balance
  //       const currentBalance = paymentForm.currency === 'LBP' ? (supplier.lb_balance || 0) : (supplier.usd_balance || 0);
  //       const newBalance = Math.max(0, currentBalance - amount);
        
  //       await raw.updateSupplier(paymentForm.entityId, {
  //         [paymentForm.currency === 'LBP' ? 'lb_balance' : 'usd_balance']: newBalance
  //       });
        
  //       // Add transaction
  //       await raw.addTransaction({
  //         id: createId(),
  //         type: 'expense',
  //         category: 'Supplier Payment',
  //         supplier_id: supplier.id,
  //         amount: amount,
  //         currency: paymentForm.currency,
  //         description: `Payment to ${supplier.name}: ${paymentForm.description}`,
  //         reference: paymentForm.reference,
  //         created_by: userProfile?.id || ''
  //       });
        
  //       showToast(`Payment sent to ${supplier.name}`, 'success');
  //     }
      
  //     setPaymentForm({
  //       entityId: '',
  //       entityType: 'customer',
  //       amount: '',
  //       currency: 'USD',
  //       description: '',
  //       reference: ''
  //     });
  //     setShowPaymentForm(null);
      
  //   } catch (error) {
  //     console.error('Error processing payment:', error);
  //     showToast('Failed to process payment', 'error');
  //   }
  // };

  // // Receive products handler
  // const handleReceiveSubmit = async (e: React.FormEvent) => {
  //   e.preventDefault();
    
  //   if (!receiveForm.productId || !receiveForm.supplierId || !receiveForm.quantity) {
  //     showToast('Please fill in all required fields', 'error');
  //     return;
  //   }
    
  //   try {
  //     await raw.addInventoryItem({
  //       id: createId(),
  //       product_id: receiveForm.productId,
  //       supplier_id: receiveForm.supplierId,
  //       quantity: parseInt(receiveForm.quantity),
  //       unit: receiveForm.unit,
  //       weight: receiveForm.weight ? parseFloat(receiveForm.weight) : null,
  //       price: receiveForm.price ? parseFloat(receiveForm.price) : null,
  //       received_quantity: parseInt(receiveForm.quantity),
  //     });
      
  //     const product = products.find(p => p.id === receiveForm.productId);
  //     const supplier = suppliers.find(s => s.id === receiveForm.supplierId);
      
  //     showToast(`Received ${receiveForm.quantity} ${receiveForm.unit} of ${product?.name} from ${supplier?.name}`, 'success');

  //   }
  // };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'active': return 'bg-green-100 text-green-800';
      case 'cancelled': return 'bg-red-100 text-red-800';
      case 'refunded': return 'bg-yellow-100 text-yellow-800';
      default: return 'bg-gray-100 text-gray-800';
    }
  };

  const getPaymentStatusColor = (status: string) => {
    switch (status) {
      case 'paid': return 'bg-green-100 text-green-800';
      case 'partial': return 'bg-yellow-100 text-yellow-800';
      case 'pending': return 'bg-red-100 text-red-800';
      default: return 'bg-gray-100 text-gray-800';
    }
  };

  // // Memoize expensive analytics calculations
  // const analytics = useMemo(() => {
  //   const today = new Date().toDateString();
  //   return {
  //     totalBills: bills.length,
  //     totalRevenue: bills.reduce((sum, bill) => sum + bill.total_amount, 0),
  //     paidBills: bills.filter(b => b.payment_status === 'paid').length,
  //     pendingAmount: bills.filter(b => b.payment_status !== 'paid').reduce((sum, bill) => sum + (bill.total_amount - bill.amount_paid), 0),
  //     todaysBills: bills.filter(b => new Date(b.bill_date).toDateString() === today).length,
  //     recentInventory: inventory.slice(0, 5),
  //     lowStockItems: raw.stockLevels.filter(item => item.currentStock < raw.lowStockThreshold),
  //     customerDebt: customers.reduce((sum, c) => sum + (c.lb_balance + c.usd_balance), 0),
  //     supplierDebt: suppliers.reduce((sum, s) => sum + ((s.lb_balance || 0) + (s.usd_balance || 0)), 0),
  //     syncedBills: bills.filter(b => b._synced).length,
  //     pendingSyncBills: bills.filter(b => !b._synced).length
  //   };
  // }, [bills, inventory, raw.stockLevels, raw.lowStockThreshold, customers, suppliers]);
  // // Calculate analytics


  // Only show full loading screen on initial load, not during search/filter updates
  if (isInitialLoad && loading) {
    return (
      <div className="flex items-center justify-center py-8">
        <RefreshCw className="w-6 h-6 animate-spin text-gray-400 rtl:ml-2 ltr:mr-2" />
        <span className="text-gray-500 rtl:text-right">{t('soldBills.loadingFinancialOperations')}</span>
      </div>
    );
  }
  return (
    <div>
      {/* Toast */}
      {toast && (
        <div className={`fixed top-4 right-4 px-4 py-2 rounded shadow-lg z-50 text-white ${
          toast.type === 'success' ? 'bg-green-600' : 'bg-red-600'
        }`}>
          {toast.message}
        </div>
      )}

      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center rtl:space-x-reverse">
          <Activity className="w-6 h-6 text-blue-600 rtl:ml-3 ltr:mr-3" />
          <div className="rtl:text-right">
            <h2 className="text-2xl font-bold text-gray-900">{t('soldBills.title')}</h2>
            <p className="text-gray-600">{t('soldBills.subtitle')}</p>
          </div>
        </div>
        
        <div className="flex items-center space-x-2 rtl:space-x-reverse">
          {/* Sync Status Indicator */}
          <div className="flex items-center space-x-2 px-3 py-2 rounded-lg bg-gray-100 rtl:space-x-reverse">
            <div className={`w-2 h-2 rounded-full ${
              syncStatus === 'syncing' ? 'bg-yellow-500 animate-pulse' :
              syncStatus === 'synced' ? 'bg-green-500' :
              syncStatus === 'error' ? 'bg-red-500' :
              'bg-gray-400'
            }`} />
            <span className="text-sm text-gray-600 rtl:text-right">
              {syncStatus === 'syncing' ? t('soldBills.syncing') :
               syncStatus === 'synced' ? t('soldBills.synced') :
               syncStatus === 'error' ? t('soldBills.syncError') :
               t('soldBills.offline')}
            </span>
          </div>
          
          <button
            onClick={() => setShowFilters(!showFilters)}
            className={`p-2 rounded-lg transition-colors ${
              showFilters ? 'bg-blue-100 text-blue-600' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
            }`}
          >
            <Filter className="w-4 h-4" />
          </button>
         
        </div>
      </div>

     

      {/* Search and Filters */}
      { (
        <div className="bg-white rounded-lg shadow-sm p-4">
          <div className="flex items-center space-x-4 mb-4 rtl:space-x-reverse">
            <div className="flex-1 relative">
              <Search className="w-5 h-5 absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 rtl:left-auto rtl:right-3" />
              <input
                type="text"
                placeholder={t('soldBills.searchPlaceholder')}
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                autoFocus={false}
                className="w-full pl-10 pr-10 py-2 border border-gray-300 rounded-lg focus:ring-blue-500 focus:border-blue-500 rtl:pl-10 rtl:pr-10"
              />
              {/* Show subtle loading indicator while fetching */}
              {loading && !isInitialLoad && (
                <RefreshCw className="w-4 h-4 absolute right-3 top-1/2 transform -translate-y-1/2 text-gray-400 animate-spin rtl:right-auto rtl:left-3" />
              )}
            </div>
          </div>

          {showFilters && (
            <div className="space-y-4 pt-4 border-t border-gray-200">
              {/* Fast Date Filters */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2 rtl:text-right">{t('dashboard.filters') || 'Quick Filters'}</label>
                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={() => handleFastDateFilter('all')}
                    className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                      fastDateFilter === 'all'
                        ? 'bg-blue-600 text-white'
                        : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                    }`}
                  >
                    {t('customers.allTime') || 'All Time'}
                  </button>
                  <button
                    type="button"
                    onClick={() => handleFastDateFilter('today')}
                    className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                      fastDateFilter === 'today'
                        ? 'bg-blue-600 text-white'
                        : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                    }`}
                  >
                    {t('customers.today') || 'Today'}
                  </button>
                  <button
                    type="button"
                    onClick={() => handleFastDateFilter('week')}
                    className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                      fastDateFilter === 'week'
                        ? 'bg-blue-600 text-white'
                        : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                    }`}
                  >
                    {t('customers.thisWeek') || 'This Week'}
                  </button>
                  <button
                    type="button"
                    onClick={() => handleFastDateFilter('month')}
                    className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                      fastDateFilter === 'month'
                        ? 'bg-blue-600 text-white'
                        : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                    }`}
                  >
                    {t('customers.thisMonth') || 'This Month'}
                  </button>
                </div>
              </div>

              {/* Date Range Filters */}
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1 rtl:text-right">{t('soldBills.dateFrom')}</label>
                  <input
                    type="date"
                    value={dateFrom}
                    onChange={(e) => {
                      setDateFrom(e.target.value);
                      setFastDateFilter('all'); // Reset fast filter when manually changing dates
                    }}
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:ring-blue-500 focus:border-blue-500"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1 rtl:text-right">{t('soldBills.dateTo')}</label>
                  <input
                    type="date"
                    value={dateTo}
                    onChange={(e) => {
                      setDateTo(e.target.value);
                      setFastDateFilter('all'); // Reset fast filter when manually changing dates
                    }}
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:ring-blue-500 focus:border-blue-500"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1 rtl:text-right">{t('soldBills.paymentStatus')}</label>
                  <select
                    value={paymentStatusFilter}
                    onChange={(e) => setPaymentStatusFilter(e.target.value)}
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:ring-blue-500 focus:border-blue-500"
                  >
                    <option value="">{t('soldBills.allPaymentStatus')}</option>
                    <option value="paid">{t('soldBills.paid')}</option>
                    <option value="partial">{t('soldBills.partial')}</option>
                    <option value="pending">{t('soldBills.pending')}</option>
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1 rtl:text-right">{t('soldBills.billStatus')}</label>
                  <select
                    value={statusFilter}
                    onChange={(e) => setStatusFilter(e.target.value)}
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:ring-blue-500 focus:border-blue-500"
                  >
                    <option value="">{t('soldBills.allStatus')}</option>
                    <option value="active">{t('soldBills.active')}</option>
                    <option value="cancelled">{t('soldBills.cancelled')}</option>
                    <option value="refunded">{t('soldBills.refunded')}</option>
                  </select>
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Bills Management Tab */}
      { (
        <div className="bg-white rounded-lg shadow-sm overflow-hidden">
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider rtl:text-right">
                    {t('soldBills.billDetails')}
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider rtl:text-right">
                    {t('soldBills.customer')}
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider rtl:text-right">
                    {t('soldBills.amount')}
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider rtl:text-right">
                    {t('soldBills.payment')}
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider rtl:text-right">
                    {t('soldBills.status')}
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider rtl:text-right">
                    {t('soldBills.actions')}
                  </th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {bills.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="px-6 py-8 text-center text-gray-500">
                      <FileText className="w-12 h-12 mx-auto mb-4 text-gray-300" />
                      <p className="text-lg font-medium rtl:text-right">{t('soldBills.noBillsFound')}</p>
                      <p className="text-sm rtl:text-right">{t('soldBills.noBillsMessage')}</p>
                    </td>
                  </tr>
                ) : (
                  (() => {
                    const sortedBills = [...bills].sort((a, b) => new Date(b.bill_date).getTime() - new Date(a.bill_date).getTime());
                    const startIndex = (currentPage - 1) * itemsPerPage;
                    const paginatedBills = sortedBills.slice(startIndex, startIndex + itemsPerPage);
                    return paginatedBills.map((bill) => {
                      const isHighlighted = highlightedBillNumber === bill.bill_number;
                      return (
                    <tr 
                      key={bill.id} 
                      id={`bill-${bill.bill_number}`}
                      className={`hover:bg-gray-50 ${
                        isHighlighted ? 'border-2 border-blue-400 shadow-xl bg-blue-50' : ''
                      }`}
                    >
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="rtl:text-right">
                          <div className="text-sm font-medium text-gray-900">{bill.bill_number}</div>
                          <div className="text-sm text-gray-500">
                            {new Date(bill.bill_date).toLocaleDateString()} at {new Date(bill.bill_date).toLocaleTimeString()}
                          </div>
                          <div className="text-xs text-gray-400">
                            {t('soldBills.createdBy')} {bill.users?.name || t('soldBills.unknown')}
                          </div>
                        </div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="flex items-center rtl:space-x-reverse">
                          <User className="w-4 h-4 text-gray-400 rtl:ml-2 ltr:mr-2" />
                          <span className="text-sm text-gray-900 rtl:text-right">
                            {getCustomerName(bill.customer_id)}
                          </span>
                        </div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="rtl:text-right">
                          <div className="text-sm font-medium text-gray-900">
                            {formatCurrency(bill.total_amount)}
                          </div>
                          {bill.total_amount - bill.amount_paid > 0 && (
                            <div className="text-xs text-red-600">
                              {t('soldBills.due')}: {formatCurrency(bill.total_amount - bill.amount_paid)}
                            </div>
                          )}
                        </div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="flex items-center space-x-2 rtl:space-x-reverse">
                          <span className={`px-2 py-1 text-xs rounded-full ${getPaymentStatusColor(bill.payment_status)}`}>
                            {t(`soldBills.${bill.payment_status}`)}
                          </span>
                          <div className="flex items-center text-xs text-gray-500 rtl:space-x-reverse">
                            {bill.payment_method === 'cash' && <DollarSign className="w-3 h-3" />}
                            {bill.payment_method === 'card' && <CreditCard className="w-3 h-3" />}
                            {bill.payment_method === 'credit' && <Clock className="w-3 h-3" />}
                            <span className="rtl:mr-1 ltr:ml-1 capitalize">{t(`soldBills.${bill.payment_method}`)}</span>
                          </div>
                        </div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="flex items-center space-x-2 rtl:space-x-reverse">
                          <span className={`px-2 py-1 text-xs rounded-full ${getStatusColor(bill.status)}`}>
                            {t(`soldBills.${bill.status}`)}
                          </span>
                          <div className="flex items-center space-x-1 rtl:space-x-reverse">
                            {bill._synced ? (
                              <CheckCircle className="w-3 h-3 text-green-500" />
                            ) : (
                              <Clock className="w-3 h-3 text-yellow-500" />
                            )}
                          </div>
                        </div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm font-medium">
                        <div className="flex items-center space-x-2 rtl:space-x-reverse">
                          <button
                            onClick={() => handleViewBill(bill)}
                            className="text-blue-600 hover:text-blue-900"
                            title={t('soldBills.viewDetails')}
                          >
                            <Eye className="w-4 h-4" />
                          </button>
                          {(userProfile?.role === 'admin' || userProfile?.role === 'manager') && (
                            <button
                              onClick={() => handleEditBill(bill)}
                              className="text-green-600 hover:text-green-900"
                              title={t('soldBills.editBill')}
                            >
                              <Edit className="w-4 h-4" />
                            </button>
                          )}
                          {userProfile?.role === 'admin' && (
                            <button
                              onClick={() => handleDeleteBill(bill)}
                              className="text-red-600 hover:text-red-900"
                              title={t('soldBills.cancelBill')}
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          )}
                          <button
                            onClick={async () => {
                              await loadBillDetails(bill.id);
                              setShowAuditTrail(true);
                            }}
                            className="text-purple-600 hover:text-purple-900"
                            title={t('soldBills.viewAuditTrail')}
                          >
                            <History className="w-4 h-4" />
                          </button>
                        </div>
                      </td>
                    </tr>
                    );
                  })
                  })()
                )}
              </tbody>
            </table>
          </div>
          {bills.length > itemsPerPage && (
            <Pagination
              currentPage={currentPage}
              totalPages={Math.ceil(bills.length / itemsPerPage)}
              onPageChange={(page) => {
                setCurrentPage(page);
                // Scroll to top of table when page changes
                window.scrollTo({ top: 0, behavior: 'smooth' });
              }}
              itemsPerPage={itemsPerPage}
              totalItems={bills.length}
            />
          )}
        </div>
      )}


   

      {/* Bill Details Modal */}
      {showBillDetails && selectedBill && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-lg max-w-4xl w-full max-h-[90vh] overflow-y-auto">
            <div className="p-6 border-b flex items-center justify-between">
              <div className="flex items-center space-x-3 rtl:space-x-reverse">
                <h2 className="text-xl font-semibold text-gray-900 rtl:text-right">
                  {t('soldBills.billDetails')} - {selectedBill.bill_number}
                </h2>
                <div className="flex items-center space-x-1 rtl:space-x-reverse">
                  {selectedBill._synced ? (
                    <CheckCircle className="w-5 h-5 text-green-500" />
                  ) : (
                    <Clock className="w-5 h-5 text-yellow-500" />
                  )}
                </div>
              </div>
              <button
                onClick={() => setShowBillDetails(false)}
                className="text-gray-400 hover:text-gray-600"
              >
                <X className="w-6 h-6" />
              </button>
            </div>

            <div className="p-6 space-y-6">
              {/* Bill Header */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div>
                  <h3 className="text-lg font-medium text-gray-900 mb-4 rtl:text-right">{t('soldBills.billInformation')}</h3>
                  <div className="space-y-2">
                    <div className="flex justify-between">
                      <span className="text-gray-600 rtl:text-right">{t('soldBills.billNumber')}:</span>
                      <span className="font-medium rtl:text-right">{selectedBill.bill_number}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-gray-600 rtl:text-right">{t('soldBills.date')}:</span>
                      <span className="font-medium rtl:text-right">{new Date(selectedBill.bill_date).toLocaleString()}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-gray-600 rtl:text-right">{t('soldBills.customer')}:</span>
                      <span className="font-medium rtl:text-right">{getCustomerName(selectedBill.customer_id)}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-gray-600 rtl:text-right">{t('soldBills.paymentMethod')}:</span>
                      <span className="font-medium rtl:text-right capitalize">{t(`soldBills.${selectedBill.payment_method}`)}</span>
                    </div>
                  </div>
                </div>

                <div>
                  <h3 className="text-lg font-medium text-gray-900 mb-4 rtl:text-right">{t('soldBills.paymentInformation')}</h3>
                  <div className="space-y-2">
                    <div className="flex justify-between">
                      <span className="text-gray-600 rtl:text-right">{t('soldBills.subtotal')}:</span>
                      <span className="font-medium rtl:text-right">{formatCurrency(selectedBill.subtotal)}</span>
                    </div>
                    <div className="flex justify-between border-t pt-2">
                      <span className="text-gray-900 font-semibold rtl:text-right">{t('soldBills.total')}:</span>
                      <span className="font-bold text-lg rtl:text-right">{formatCurrency(selectedBill.total_amount)}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-gray-600 rtl:text-right">{t('soldBills.amountPaid')}:</span>
                      <span className="font-medium text-green-600 rtl:text-right">{formatCurrency(selectedBill.amount_paid)}</span>
                    </div>
                    {selectedBill.total_amount - selectedBill.amount_paid > 0 && (
                      <div className="flex justify-between">
                        <span className="text-gray-600 rtl:text-right">{t('soldBills.amountDue')}:</span>
                        <span className="font-medium text-red-600 rtl:text-right">{formatCurrency(selectedBill.total_amount - selectedBill.amount_paid)}</span>
                      </div>
                    )}
                  </div>
                </div>
              </div>

              {/* Line Items */}
              <div>
                <h3 className="text-lg font-medium text-gray-900 mb-4 rtl:text-right">{t('soldBills.lineItems')}</h3>
                <div className="overflow-x-auto">
                  <table className="min-w-full divide-y divide-gray-200">
                    <thead className="bg-gray-50">
                      <tr>
                        <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase rtl:text-right">{t('soldBills.product')}</th>
                        <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase rtl:text-right">{t('soldBills.supplier')}</th>
                        <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase rtl:text-right">{t('soldBills.quantity')}</th>
                        <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase rtl:text-right">{t('soldBills.price')}</th>
                        <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase rtl:text-right">{t('soldBills.total')}</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-200">
                      {billLineItems.map((item) => {
                        const product = products.find(p => p.id === item.product_id);
                        const inventoryItem = item.inventory_item_id ? inventoryItems.find(i => i.id === item.inventory_item_id) : null;
                        const supplier = inventoryItem ? suppliers.find(s => s.id === inventoryItem.supplier_id) : null;
                        
                        return (
                          <tr key={item.id}>
                            <td className="px-4 py-3 text-sm text-gray-900">{product?.name || 'Unknown Product'}</td>
                            <td className="px-4 py-3 text-sm text-gray-600">{supplier?.name || 'Unknown Supplier'}</td>
                            <td className="px-4 py-3 text-sm text-gray-900">
                              {item.quantity}
                              {item.weight && <div className="text-xs text-gray-500">{item.weight}kg</div>}
                            </td>
                            <td className="px-4 py-3 text-sm text-gray-900">{formatCurrency(item.unit_price)}</td>
                            <td className="px-4 py-3 text-sm font-medium text-gray-900">{formatCurrency(item.line_total)}</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* Notes */}
              {selectedBill.notes && (
                <div>
                  <h3 className="text-lg font-medium text-gray-900 mb-2 rtl:text-right">{t('soldBills.notes')}</h3>
                  <p className="text-gray-600 bg-gray-50 p-3 rounded-lg rtl:text-right">{selectedBill.notes}</p>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Edit Bill Modal */}
      {showEditBill && selectedBill && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-lg max-w-5xl w-full max-h-[90vh] overflow-y-auto">
            <div className="p-6 border-b flex items-center justify-between">
              <h2 className="text-xl font-semibold text-gray-900 rtl:text-right">
                {t('soldBills.editBill')} - {selectedBill.bill_number}
              </h2>
              <button
                onClick={handleCloseEditBill}
                className="text-gray-400 hover:text-gray-600"
              >
                <X className="w-6 h-6" />
              </button>
            </div>

            <div className="p-6 space-y-6">
              {/* Business Rule Warnings */}
              {businessRuleWarnings.length > 0 && (
                <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4">
                  <div className="flex items-start">
                    <div className="flex-shrink-0">
                      <svg className="h-5 w-5 text-yellow-400" viewBox="0 0 20 20" fill="currentColor">
                        <path fillRule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
                      </svg>
                    </div>
                    <div className="ltr:ml-3 rtl:mr-3 flex-1">
                      <h3 className="text-sm font-medium text-yellow-800">Business Rule Adjustments</h3>
                      <div className="mt-2 text-sm text-yellow-700">
                        <ul className="list-disc ltr:pl-5 rtl:pr-5 space-y-1">
                          {businessRuleWarnings.map((warning, idx) => (
                            <li key={idx}>{warning}</li>
                          ))}
                        </ul>
                      </div>
                    </div>
                    <button
                      onClick={() => setBusinessRuleWarnings([])}
                      className="ltr:ml-auto rtl:mr-auto flex-shrink-0 text-yellow-400 hover:text-yellow-600"
                    >
                      <X className="w-5 h-5" />
                    </button>
                  </div>
                </div>
              )}
              
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2 rtl:text-right">{t('soldBills.customer')}</label>
                  <select
                    value={editForm.customer_id || ''}
                    onChange={(e) => {
                      const newCustomerId = e.target.value || null;
                      const totalAmount = (editForm as any).total_amount || 0;
                      
                      // Special handling for walk-in customer selection
                      if (newCustomerId === null) {
                        // Walk-in customer: auto-set payment method to cash and amount to full
                        const warnings: string[] = [];
                        if (originalCustomerId !== null) {
                          warnings.push('Changed to walk-in customer');
                          warnings.push('Payment method set to Cash, amount set to full payment');
                        }
                        
                        setEditForm(prev => ({ 
                          ...prev, 
                          customer_id: null,
                          payment_method: 'cash',
                          amount_paid: totalAmount,
                          payment_status: 'paid'
                        }));
                        
                        if (warnings.length > 0) {
                          setBusinessRuleWarnings(warnings);
                        }
                      } else {
                        // Regular customer: use standard customer type change logic
                        const result = handleCustomerTypeChange(
                          editForm,
                          newCustomerId,
                          originalCustomerId,
                          totalAmount
                        );
                        
                        // Update form with new values
                        setEditForm(prev => ({ 
                          ...prev, 
                          customer_id: newCustomerId,
                          payment_method: result.payment_method,
                          amount_paid: result.amount_paid,
                          payment_status: result.payment_status
                        }));
                        
                        // Show warnings if any
                        if (result.warnings.length > 0) {
                          setBusinessRuleWarnings(result.warnings);
                        }
                      }
                    }}
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:ring-blue-500 focus:border-blue-500"
                  >
                    <option value="">{t('soldBills.walkInCustomer')}</option>
                    {customers.map(customer => (
                      <option key={customer.id} value={customer.id}>
                        {customer.name}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2 rtl:text-right">{t('soldBills.paymentMethod')}</label>
                  <select
                    value={editForm.payment_method || 'cash'}
                    onChange={(e) => {
                      const newPaymentMethod = e.target.value as 'cash' | 'card' | 'credit';
                      
                      // Validate: Walk-in customers cannot use credit
                      const validation = validateCreditCustomerPayment(
                        newPaymentMethod,
                        editForm.customer_id || null,
                        editForm.amount_paid || 0,
                        (editForm as any).total_amount || 0,
                        false
                      );
                      
                      if (!validation.valid) {
                        showToast(validation.error || 'Invalid payment method', 'error');
                        return; // Don't update if validation fails
                      }
                      
                      setEditForm(prev => ({ ...prev, payment_method: newPaymentMethod }));
                    }}
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:ring-blue-500 focus:border-blue-500"
                  >
                    <option value="cash">{t('soldBills.cash')}</option>
                    <option value="card">{t('soldBills.card')}</option>
                    <option value="credit">{t('soldBills.credit')}</option>
                  </select>
                  {editForm.customer_id === null && (
                    <p className="text-xs text-gray-500 mt-1 rtl:text-right">
                      Walk-in customers can only use Cash or Card
                    </p>
                  )}
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2 rtl:text-right">{t('soldBills.amountPaid')}</label>
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    value={editForm.amount_paid || 0}
                    onChange={(e) => {
                      const amountPaid = parseFloat(e.target.value) || 0;
                      const totalAmount = (editForm as any).total_amount || 0;
                      
                      // Use centralized business rule for status calculation
                      const paymentStatus = calculatePaymentStatus(amountPaid, totalAmount);
                      
                      setEditForm(prev => ({ 
                        ...prev, 
                        amount_paid: amountPaid,
                        payment_status: paymentStatus
                      }));
                    }}
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:ring-blue-500 focus:border-blue-500"
                  />
                  {editForm.customer_id === null && (
                    <p className="text-xs text-gray-500 mt-1 rtl:text-right">
                      Walk-in customers must pay in full
                    </p>
                  )}
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2 rtl:text-right">{t('soldBills.paymentStatus')}</label>
                  <select
                    value={editForm.payment_status || 'pending'}
                    disabled={true}
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 bg-gray-100 cursor-not-allowed"
                    title="Payment status is automatically calculated based on amount paid"
                  >
                    <option value="paid">{t('soldBills.paid')}</option>
                    <option value="partial">{t('soldBills.partial')}</option>
                    <option value="pending">{t('soldBills.pending')}</option>
                  </select>
                  <p className="text-xs text-gray-500 mt-1 rtl:text-right">
                    Status is automatically calculated from payment amounts
                  </p>
                </div>
              </div>

              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <h3 className="text-lg font-medium text-gray-900 rtl:text-right">{t('soldBills.lineItems')}</h3>
                </div>
                {billLineItems.length > 0 ? (
                  <div className="overflow-x-auto border border-gray-200 rounded-lg">
                    <table className="min-w-full divide-y divide-gray-200">
                      <thead className="bg-gray-50">
                        <tr>
                          <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase rtl:text-right">{t('soldBills.product')}</th>
                          <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase rtl:text-right">{t('soldBills.supplier')}</th>
                          <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase rtl:text-right">{t('soldBills.quantity')}</th>
                          <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase rtl:text-right">{t('soldBills.weight')}</th>
                          <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase rtl:text-right">{t('soldBills.price')}</th>
                          <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase rtl:text-right">{t('soldBills.total')}</th>
                          <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase rtl:text-right">{t('soldBills.notes')}</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-100 bg-white">
                        {billLineItems.map((item) => {
                          const edit = lineItemEdits[item.id] || {};
                          const quantityValue = edit.quantity ?? item.quantity.toString();
                          const unitPriceValue = edit.unitPrice ?? item.unit_price.toString();
                          const weightValue = edit.weight ?? (item.weight !== null && item.weight !== undefined ? item.weight.toString() : '');
                          const notesValue = edit.notes ?? (item.notes ?? '');

                          const quantityInvalid = edit.quantity !== undefined && (quantityValue.trim() === '' || !Number.isFinite(Number(quantityValue)) || Number(quantityValue) <= 0);
                          const unitPriceInvalid = edit.unitPrice !== undefined && (unitPriceValue.trim() === '' || !Number.isFinite(Number(unitPriceValue)) || Number(unitPriceValue) <= 0);
                          const weightInvalid = edit.weight !== undefined && weightValue !== '' && (!Number.isFinite(Number(weightValue)) || Number(weightValue) < 0);

                          const numericQuantity = quantityInvalid ? null : Number(quantityValue);
                          const numericUnitPrice = unitPriceInvalid ? null : Number(unitPriceValue);
                          const numericWeight = weightValue ? Number(weightValue) : null;
                          
                          let computedTotalValue: number | string = 0;
                          if (numericQuantity !== null && numericUnitPrice !== null) {
                            if (numericWeight && numericWeight > 0) {
                              computedTotalValue = Number((numericWeight * numericUnitPrice).toFixed(2));
                            } else {
                              computedTotalValue = Number((numericQuantity * numericUnitPrice).toFixed(2));
                            }
                          }

                          const { isEditable, batchStatus } = getInventoryContextForLineItem(item);
                          
                          // Resolve product name
                          const product = products.find(p => p.id === item.product_id);

                          return (
                            <tr key={item.id} className="align-top">
                              <td className="px-4 py-3 text-sm text-gray-900">
                                <select
                                  value={edit.product_id ?? item.product_id}
                                  onChange={(e) => {
                                    handleLineItemChange(item.id, 'product_id', e.target.value);
                                  }}
                                  disabled={!isEditable || isEditing}
                                  className="w-full border border-gray-300 rounded-lg px-2 py-2 focus:ring-blue-500 focus:border-blue-500 font-medium"
                                >
                                  {raw.products.map(product => (
                                    <option key={product.id} value={product.id}>
                                      {product.name}
                                    </option>
                                  ))}
                                </select>
                                {!isEditable && (
                                  <div className="text-xs text-red-500 mt-1 rtl:text-right">
                                    {t('soldBills.inventoryBillClosed')}
                                    {batchStatus && (
                                      <span className="text-gray-400 ltr:ml-1 rtl:mr-1">({batchStatus})</span>
                                    )}
                                  </div>
                                )}
                              </td>
                              <td className="px-4 py-3 text-sm text-gray-600">
                                {/* Supplier is read-only, determined by inventory_item */}
                                {resolveSupplierName(item.inventory_item_id, inventoryItems, inventoryBills, suppliers)}
                              </td>
                              <td className="px-4 py-3">
                                <input
                                  type="number"
                                  step="0.01"
                                  min="0"
                                  value={quantityValue}
                                  onChange={(e) => handleLineItemChange(item.id, 'quantity', e.target.value)}
                                  disabled={!isEditable || isEditing}
                                  className={`w-full border rounded-lg px-2 py-2 focus:ring-blue-500 focus:border-blue-500 ${quantityInvalid ? 'border-red-400' : 'border-gray-300'}`}
                                />
                                {quantityInvalid && (
                                  <div className="text-xs text-red-500 mt-1 rtl:text-right">{t('accounting.pleaseEnterValidQuantity')}</div>
                                )}
                              </td>
                              <td className="px-4 py-3">
                                <input
                                  type="number"
                                  step="0.01"
                                  min="0"
                                  value={weightValue}
                                  onChange={(e) => handleLineItemChange(item.id, 'weight', e.target.value)}
                                  disabled={!isEditable || isEditing}
                                  className={`w-full border rounded-lg px-2 py-2 focus:ring-blue-500 focus:border-blue-500 ${weightInvalid ? 'border-red-400' : 'border-gray-300'}`}
                                  placeholder={t('soldBills.weight')}
                                />
                                {weightInvalid && (
                                  <div className="text-xs text-red-500 mt-1 rtl:text-right">{t('soldBills.invalidWeight')}</div>
                                )}
                              </td>
                              <td className="px-4 py-3">
                                <input
                                  type="number"
                                  step="0.01"
                                  min="0"
                                  value={unitPriceValue}
                                  onChange={(e) => handleLineItemChange(item.id, 'unitPrice', e.target.value)}
                                  disabled={!isEditable || isEditing}
                                  className={`w-full border rounded-lg px-2 py-2 focus:ring-blue-500 focus:border-blue-500 ${unitPriceInvalid ? 'border-red-400' : 'border-gray-300'}`}
                                />
                                {unitPriceInvalid && (
                                  <div className="text-xs text-red-500 mt-1 rtl:text-right">{t('accounting.pleaseEnterValidUnitPrice')}</div>
                                )}
                              </td>
                              <td className="px-4 py-3 text-sm font-medium text-gray-900">
                                {formatCurrency(typeof computedTotalValue === 'number' ? computedTotalValue : 0)}
                              </td>
                              <td className="px-4 py-3">
                                <textarea
                                  rows={2}
                                  value={notesValue}
                                  onChange={(e) => handleLineItemChange(item.id, 'notes', e.target.value)}
                                  disabled={!isEditable || isEditing}
                                  className="w-full border border-gray-300 rounded-lg px-2 py-2 focus:ring-blue-500 focus:border-blue-500"
                                  placeholder={t('soldBills.notes')}
                                />
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                ) : (
                  <div className="text-sm text-gray-500 bg-gray-50 rounded-lg p-4 rtl:text-right">
                    {t('soldBills.noLineItems')}
                  </div>
                )}
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2 rtl:text-right">{t('soldBills.notes')}</label>
                <textarea
                  value={editForm.notes || ''}
                  onChange={(e) => setEditForm(prev => ({ ...prev, notes: e.target.value }))}
                  rows={3}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:ring-blue-500 focus:border-blue-500"
                  placeholder={t('soldBills.addNotesPlaceholder')}
                />
              </div>

              <div className="flex justify-end space-x-3 pt-6 border-t border-gray-200 rtl:space-x-reverse">
                <button
                  onClick={handleCloseEditBill}
                  className="px-6 py-2 text-gray-700 border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors"
                  disabled={isEditing}
                >
                  {t('soldBills.cancel')}
                </button>
                <button
                  onClick={handleSaveBill}
                  disabled={isEditing || !billFormHasChanges}
                  className="px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors font-medium flex items-center disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {isEditing ? (
                    <>
                      <RefreshCw className="w-4 h-4 rtl:ml-2 ltr:mr-2 animate-spin" />
                      {t('soldBills.saving')}
                    </>
                  ) : (
                    <>
                      <Save className="w-4 h-4 rtl:ml-2 ltr:mr-2" />
                      {t('soldBills.saveChanges')}
                    </>
                  )}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Audit Trail Modal */}
      {showAuditTrail && selectedBill && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-lg max-w-3xl w-full max-h-[90vh] overflow-y-auto">
            <div className="p-6 border-b flex items-center justify-between">
              <h2 className="text-xl font-semibold text-gray-900 rtl:text-right">
                {t('soldBills.auditTrail')} - {selectedBill.bill_number}
              </h2>
              <button
                onClick={() => setShowAuditTrail(false)}
                className="text-gray-400 hover:text-gray-600"
              >
                <X className="w-6 h-6" />
              </button>
            </div>

            <div className="p-6">
              {groupedAuditLogs.length > 0 ? (
                <div className="relative">
                  <div className="absolute left-6 top-0 bottom-0 hidden w-px bg-gradient-to-b from-transparent via-slate-200 to-transparent md:block" />
                  <div className="space-y-6">
                    {groupedAuditLogs.map((logGroup, groupIndex) => {
                      const firstLog = logGroup[0];
                      const actionKey = (firstLog.action || 'updated') as keyof typeof auditActionMeta;
                      const fallbackMeta = {
                        label: firstLog.action,
                        badgeClass: 'border border-slate-200 bg-slate-100 text-slate-700',
                        dotClass: 'bg-slate-400',
                        icon: <History className="h-3 w-3 text-slate-500" />,
                      };
                      const actionMeta = auditActionMeta[actionKey] || fallbackMeta;
                      
                      // Count only logs with actual changes
                      const actualChangesCount = logGroup.filter((log) => {
                        const isGeneralChange = !log.field_changed || log.field_changed === 'bill_record';
                        if (isGeneralChange) return true;
                        return log.old_value !== null || log.new_value !== null;
                      }).length;
                      
                      const multipleChanges = actualChangesCount > 1;

                      return (
                        <div key={`group-${groupIndex}`} className="relative pl-10 md:pl-14">
                          <span className="absolute left-4 top-7 hidden h-3 w-3 -translate-x-1.5 items-center justify-center md:flex">
                            <span className={`h-3 w-3 rounded-full border-2 border-white shadow-sm ${actionMeta.dotClass}`} />
                          </span>

                          <div className="rounded-2xl border border-slate-200 bg-white shadow-sm hover:shadow-md transition-shadow">
                            <div className="flex flex-col gap-3 border-b border-slate-100 px-5 py-4 md:flex-row md:items-center md:justify-between">
                              <div className="flex flex-wrap items-center gap-3">
                                <span className={`inline-flex items-center gap-2 rounded-full px-3 py-1 text-xs font-semibold uppercase tracking-wide ${actionMeta.badgeClass}`}>
                                  {actionMeta.icon}
                                  <span>{actionMeta.label}</span>
                                </span>
                                {multipleChanges && (
                                  <span className="inline-flex items-center gap-1.5 rounded-full bg-slate-100 px-2.5 py-1 text-xs font-medium text-slate-600">
                                    <Activity className="h-3 w-3" />
                                    <span>{actualChangesCount} {t('soldBills.fieldsChanged')}</span>
                                  </span>
                                )}
                              </div>
                              <div className="flex items-center gap-3 text-right text-xs text-slate-500">
                                <div>{new Date(firstLog.created_at).toLocaleString()}</div>
                              </div>
                            </div>

                            <div className="space-y-4 px-5 py-4">
                              <div className="flex items-center gap-2 text-xs text-slate-500">
                                <User className="h-3.5 w-3.5" />
                                <span>{t('soldBills.changedBy')}: <span className="font-medium text-slate-700">{firstLog.users?.name || t('soldBills.unknownUser')}</span></span>
                              </div>

                              {firstLog.change_reason && (
                                <div className="rounded-xl border border-blue-100 bg-blue-50 px-3 py-2 text-xs text-blue-700">
                                  <div className="flex items-center gap-2">
                                    <FileText className="h-3.5 w-3.5" />
                                    <span className="font-medium">{t('soldBills.reason')}:</span>
                                    <span>{firstLog.change_reason}</span>
                                  </div>
                                </div>
                              )}

                              <div className="space-y-3">
                                {logGroup
                                  .filter((log) => {
                                    // ==================== ONLY SHOW LOGS WITH ACTUAL CHANGES ====================
                                    // Show general changes (bill creation, etc.)
                                    const isGeneralChange = !log.field_changed || log.field_changed === 'bill_record';
                                    if (isGeneralChange) return true;
                                    
                                    // Show logs where old_value or new_value exists
                                    // (indicating an actual change happened)
                                    return log.old_value !== null || log.new_value !== null;
                                  })
                                  .map((log) => {
                                  const isGeneralChange = !log.field_changed || log.field_changed === 'bill_record';
                                  
                                  if (isGeneralChange) {
                                    return (
                                      <div key={log.id} className="rounded-xl border border-amber-100 bg-amber-50 p-4">
                                        <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-amber-700">
                                          <Activity className="h-3.5 w-3.5" />
                                          <span>{t('soldBills.systemUpdate')}</span>
                                        </div>
                                      </div>
                                    );
                                  }

                                  return (
                                    <div key={log.id} className="rounded-xl border border-slate-100 bg-slate-50/50 p-4">
                                      <div className="mb-3 flex items-center gap-2 text-sm font-semibold text-slate-700">
                                        <Edit className="h-4 w-4 text-slate-400" />
                                        <span>{getFieldLabel(log.field_changed || '')}</span>
                                      </div>
                                      <div className="grid gap-3 md:grid-cols-2">
                                        <div className="rounded-lg border border-slate-200 bg-white px-3 py-2.5 shadow-sm">
                                          <div className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-slate-400">{t('soldBills.old')}</div>
                                          <div>{renderAuditValue(log.field_changed, log.old_value)}</div>
                                        </div>
                                        <div className="rounded-lg border border-blue-200 bg-blue-50 px-3 py-2.5 shadow-sm">
                                          <div className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-blue-600">{t('soldBills.new')}</div>
                                          <div>{renderAuditValue(log.field_changed, log.new_value)}</div>
                                        </div>
                                      </div>
                                    </div>
                                  );
                                })}
                              </div>
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              ) : (
                <div className="py-12 text-center">
                  <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-slate-100">
                    <History className="h-8 w-8 text-slate-400" />
                  </div>
                  <h3 className="mb-1 text-sm font-medium text-slate-900">{t('soldBills.noAuditTrailAvailable')}</h3>
                  <p className="text-xs text-slate-500">{t('soldBills.auditTrailEmptyDesc')}</p>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}