import React, { useState, useMemo, useEffect } from 'react';
import { useOfflineData } from '../../../contexts/OfflineDataContext';
import { useI18n } from '../../../i18n';
import { useSupabaseAuth } from '../../../contexts/SupabaseAuthContext';
import { transactionService } from '../../../services/transactionService';
import { accountBalanceService } from '../../../services/accountBalanceService';
import { transactionValidationService } from '../../../services/transactionValidationService';
import { auditService } from '../../../services/auditService';
import { TRANSACTION_CATEGORIES } from '../../../constants/transactionCategories';
import { isPaymentCategory } from '../../../constants/paymentCategories';
import { 
  Search, 
  User,
  DollarSign,
  RefreshCw,
  X,
  Edit,
  Trash2
} from 'lucide-react';
import { Pagination } from '../../common/Pagination';
import Toast from '../../common/Toast';
import SearchableSelect from '../../common/SearchableSelect';
import type { CurrencyCode } from '@pos-platform/shared';

interface RecentPaymentsProps {
  formatCurrency: (amount: number, currency?: string) => string;
  formatCurrencyWithSymbol: (amount: number, currency: string) => string;
}

type PaymentType = 'Customer Payment' | 'Supplier Payment' | 'Employee Payment' | 'Refund';
type PaymentStatus = 'completed' | 'reversed' | 'canceled';

interface PaymentRow {
  id: string;
  date: string;
  type: PaymentType;
  entityName: string;
  entityType: 'customer' | 'supplier' | 'employee';
  entityId?: string; // Entity ID for balance calculations
  amount: number;
  currency: CurrencyCode;
  status: PaymentStatus;
  reference: string | null;
  createdByName: string;
  createdById: string;
  isReversal?: boolean;
  reversalOfTransactionId?: string | null;
  originalAmount?: number; // Original amount for corrected payments
  originalCurrency?: CurrencyCode; // Original currency for corrected payments
  isCorrected?: boolean; // Whether this is a corrected payment
}

interface DeletionDetails {
  balanceImpact?: { before: number; after: number; currency: string };
  isSynced?: boolean;
  hasReversals?: boolean;
  cashDrawerImpact?: boolean;
  warnings?: string[];
}

const ITEMS_PER_PAGE = 20;

// Helper function to get translation key for payment type
const getPaymentTypeTranslationKey = (type: PaymentType): string => {
  const typeMap: Record<PaymentType, string> = {
    'Customer Payment': 'customerPayment',
    'Supplier Payment': 'supplierPayment',
    'Employee Payment': 'employeePayment',
    'Refund': 'refund'
  };
  return `payments.${typeMap[type]}`;
};

export default function RecentPayments({
  formatCurrencyWithSymbol
}: RecentPaymentsProps) {
  const { t } = useI18n();
  const raw = useOfflineData();
  const { userProfile } = useSupabaseAuth();

  const [searchTerm, setSearchTerm] = useState('');
  const [typeFilter, setTypeFilter] = useState<string>('all');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [currencyFilter, setCurrencyFilter] = useState<string>('all');
  const [dateRange, setDateRange] = useState<{ start: string; end: string }>({
    start: '',
    end: ''
  });
  const [currentPage, setCurrentPage] = useState(1);
  const [showReversals, setShowReversals] = useState(false);
  const [userNameCache, setUserNameCache] = useState<Record<string, string>>({});
  const [editingPayment, setEditingPayment] = useState<PaymentRow | null>(null);
  const [deletingPayment, setDeletingPayment] = useState<PaymentRow | null>(null);
  const [deletionDetails, setDeletionDetails] = useState<DeletionDetails | null>(null);
  const [loadingDeletionDetails, setLoadingDeletionDetails] = useState(false);
  const [highlightedPaymentId, setHighlightedPaymentId] = useState<string | null>(null);

  // Check for payment to highlight from sessionStorage
  // Use a delay to ensure sessionStorage is set after navigation
  useEffect(() => {
    const checkHighlight = () => {
      const highlightId = sessionStorage.getItem('highlightPaymentId');
      if (highlightId) {
        setHighlightedPaymentId(highlightId);
        // Scroll to the payment
        setTimeout(() => {
          const element = document.getElementById(`payment-${highlightId}`);
          if (element) {
            element.scrollIntoView({ behavior: 'smooth', block: 'center' });
          }
        }, 300);
        // Clear after highlighting
        sessionStorage.removeItem('highlightPaymentId');
        // Stop highlighting after 3 seconds
        setTimeout(() => {
          setHighlightedPaymentId(null);
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
  }, []);
  const [editForm, setEditForm] = useState({
    amount: '',
    currency: 'USD' as CurrencyCode,
    description: '',
    reference: '',
    entityId: ''
  });
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error'; visible: boolean }>({
    message: '',
    type: 'success',
    visible: false
  });

  // Get all transactions and entities
  const transactions = raw.transactions || [];
  const entities = raw.entities || [];
  // Store's configured currencies — drives the currency dropdowns instead of a
  // hardcoded USD/LBP pair, so a store that accepts other currencies sees them.
  const acceptedCurrencies = raw.acceptedCurrencies || [];

  // Load user names into cache
  useEffect(() => {
    async function loadUserNames() {
      const userIds = new Set<string>();
      transactions.forEach(t => {
        if (t.created_by) {
          userIds.add(t.created_by);
        }
      });

      const names: Record<string, string> = {};
      await Promise.all(
        Array.from(userIds).map(async (userId) => {
          try {
            const user = await raw.getUserById(userId);
            if (user) {
              names[userId] = user.name || user.email || 'Unknown';
            } else {
              names[userId] = 'Unknown';
            }
          } catch (error) {
            names[userId] = 'Unknown';
          }
        })
      );
      setUserNameCache(names);
    }

    if (transactions.length > 0) {
      loadUserNames();
    }
  }, [transactions]);

  // Filter and process payment transactions
  const paymentRows = useMemo(() => {
    // Filter payment transactions that have entity_id for customer, supplier, or employee
    // This unified approach uses entity_id instead of separate customer_id/supplier_id/employee_id fields
    let allPaymentTransactions = transactions.filter(t => {
      // Must be a payment category OR a refund. Refunds use TRANSACTION_CATEGORIES
      // (Customer/Supplier Refund), which are not part of PAYMENT_CATEGORIES, so
      // isPaymentCategory() alone would exclude them from the payments list.
      const isRefund = t.category === TRANSACTION_CATEGORIES.CUSTOMER_REFUND ||
                       t.category === TRANSACTION_CATEGORIES.SUPPLIER_REFUND;
      if (!isPaymentCategory(t.category) && !isRefund) {
        return false;
      }

      // Must have an entity_id (unified field)
      if (!t.entity_id) {
        return false;
      }

      // Apply date range filter
      if (dateRange.start && t.created_at && new Date(t.created_at) < new Date(dateRange.start)) {
        return false;
      }
      if (dateRange.end && t.created_at && new Date(t.created_at) > new Date(dateRange.end)) {
        return false;
      }

      // Apply currency filter
      if (currencyFilter !== 'all' && t.currency !== currencyFilter) {
        return false;
      }

      return true;
    });

    // Create a map of entity_id to entity for quick lookups
    const entityMap = new Map<string, typeof entities[0]>();
    entities.forEach(e => {
      if (!e._deleted) {
        entityMap.set(e.id, e);
      }
    });

    // Filter to only include transactions with valid entity types (customer, supplier, employee)
    // We'll check entity types asynchronously in the mapping step below

    // A row is "superseded" (was corrected and replaced) when its typed status
    // says so. We OR in the legacy `metadata.corrected` flag purely as a
    // backward-compat fallback for any row that predates the v70 migration or
    // arrives from a not-yet-migrated server — the typed column is authoritative.
    const isSuperseded = (t: typeof transactions[number]): boolean =>
      t.status === 'superseded' || (t as any).metadata?.corrected === true;

    // Build a map of correction id → the superseded row's amount/currency, so a
    // correction can display the prior ("original") amount. Keyed off the typed
    // superseded_by_transaction_id, falling back to the legacy metadata pointer.
    const correctedTransactionMap = new Map<string, { amount: number; currency: CurrencyCode }>();
    transactions.forEach(t => {
      if (!isSuperseded(t)) return;
      const correctionId = (t.superseded_by_transaction_id || (t as any).metadata?.correctedTransactionId) as string | undefined;
      if (!correctionId) return;
      correctedTransactionMap.set(correctionId, {
        amount: t.amount,
        currency: t.currency as CurrencyCode
      });
    });

    // Hide superseded originals from the list — they were replaced by a correction.
    allPaymentTransactions = allPaymentTransactions.filter(t => !isSuperseded(t));

    // Map to rows with entity and user names
    // Note: We filter by entity type here since we need to check entities table
    const rows = allPaymentTransactions
      .map((transaction: any): PaymentRow | null => {
        // Get entity from entity_id
        const entityId = transaction.entity_id;
        if (!entityId) {
          return null; // Skip transactions without entity_id
        }

        const entity = entityMap.get(entityId);
        if (!entity) {
          return null; // Skip if entity not found
        }

        // Only include customer, supplier, or employee entities (exclude cash/internal)
        const entityType = entity.entity_type;
        if (entityType !== 'customer' && entityType !== 'supplier' && entityType !== 'employee') {
          return null; // Skip cash drawer and internal entities
        }

        // Determine payment type based on category and entity type
        let type: PaymentType = 'Customer Payment';
        
        if (entityType === 'employee') {
          type = 'Employee Payment';
        } else if (entityType === 'supplier') {
          if (transaction.category === TRANSACTION_CATEGORIES.SUPPLIER_REFUND ||
              transaction.category === TRANSACTION_CATEGORIES.CUSTOMER_REFUND) {
            type = 'Refund';
          } else {
            type = 'Supplier Payment';
          }
        } else if (entityType === 'customer') {
          if (transaction.category === TRANSACTION_CATEGORIES.CUSTOMER_REFUND ||
              transaction.category === TRANSACTION_CATEGORIES.SUPPLIER_REFUND) {
            type = 'Refund';
          } else {
            type = 'Customer Payment';
          }
        }

        // Get entity name from entity object
        const entityName = entity.name || 'Unknown';

        // Determine status: canceled (status='voided' / legacy metadata.deleted) > reversed (_deleted) > completed
        const transactionWithMetadata = transaction as any;
        const status: PaymentStatus = (transaction.status === 'voided' || transactionWithMetadata.metadata?.deleted === true)
          ? 'canceled'
          : transaction._deleted
            ? 'reversed'
            : 'completed';

        // Get created by name
        const createdByName = transaction.created_by 
          ? (userNameCache[transaction.created_by] || 'Unknown')
          : 'System';

        // Check if this is a corrected transaction
        const isCorrected = correctedTransactionMap.has(transaction.id);
        const originalData = isCorrected ? correctedTransactionMap.get(transaction.id) : undefined;
        const originalAmount = originalData?.amount;
        const originalCurrency = originalData?.currency;

        return {
          id: transaction.id,
          date: transaction.created_at || transaction.updated_at || '',
          type,
          entityName,
          entityType: entityType as 'customer' | 'supplier' | 'employee',
          entityId: entityId,
          amount: transaction.amount,
          currency: transaction.currency || 'USD',
          status,
          reference: transaction.reference,
          createdByName,
          createdById: transaction.created_by || '',
          isReversal: transaction.is_reversal || false,
          reversalOfTransactionId: transaction.reversal_of_transaction_id || null,
          originalAmount,
          originalCurrency,
          isCorrected: isCorrected || false
        };
      })
      .filter((row): row is PaymentRow => row !== null); // Filter out null entries

    // Separate non-reversal and reversal transactions
    const nonReversalRows = rows.filter(row => !row.isReversal);
    const reversalRows = rows.filter(row => row.isReversal);

    // Build the displayed list. When "show corrected & reversed" is on we render
    // a FLAT list where every payment and every reversal is its own top-level
    // row, so the date sort below produces a strictly chronological
    // (monotonic-date) timeline. The previous design nested each reversal under
    // its original, which pinned a recent reversal beneath a much older payment
    // and broke chronological order. Reversal rows are styled distinctly in the
    // table via row.isReversal. When the toggle is off, reversals stay hidden.
    const groupedRows: PaymentRow[] = showReversals
      ? [...nonReversalRows, ...reversalRows]
      : [...nonReversalRows];

    // Apply filters
    let filtered = groupedRows;

    // Search filter
    if (searchTerm) {
      const searchLower = searchTerm.toLowerCase();
      filtered = filtered.filter(row =>
        row.entityName.toLowerCase().includes(searchLower) ||
        row.reference?.toLowerCase().includes(searchLower) ||
        row.createdByName.toLowerCase().includes(searchLower)
      );
    }

    // Type filter
    if (typeFilter !== 'all') {
      filtered = filtered.filter(row => row.type === typeFilter);
    }

    // Status filter
    if (statusFilter !== 'all') {
      filtered = filtered.filter(row => row.status === statusFilter);
    }

    // Sort by date (newest first)
    filtered.sort((a, b) => {
      const dateA = new Date(a.date).getTime();
      const dateB = new Date(b.date).getTime();
      return dateB - dateA;
    });

    return filtered;
  }, [transactions, entities, userNameCache, searchTerm, typeFilter, statusFilter, currencyFilter, dateRange, showReversals]);

  // Pagination
  const totalPages = Math.ceil(paymentRows.length / ITEMS_PER_PAGE);
  const paginatedRows = paymentRows.slice(
    (currentPage - 1) * ITEMS_PER_PAGE,
    currentPage * ITEMS_PER_PAGE
  );

  // Reset page when filters change
  useEffect(() => {
    setCurrentPage(1);
  }, [searchTerm, typeFilter, statusFilter, currencyFilter, dateRange, showReversals]);

  const clearFilters = () => {
    setSearchTerm('');
    setTypeFilter('all');
    setStatusFilter('all');
    setCurrencyFilter('all');
    setDateRange({ start: '', end: '' });
    setShowReversals(false);
    setCurrentPage(1);
  };

  const hasActiveFilters = searchTerm || typeFilter !== 'all' || statusFilter !== 'all' || 
                          currencyFilter !== 'all' || dateRange.start || dateRange.end || showReversals;

  const showToast = (message: string, type: 'success' | 'error' = 'success') => {
    setToast({ message, type, visible: true });
    setTimeout(() => setToast(t => ({ ...t, visible: false })), 3000);
  };

  // Entities selectable when correcting a payment. Restricted to the same type
  // as the original (e.g. customer → another customer) so the transaction's
  // category — and therefore its accounting — stays valid after the change.
  const editEntityOptions = useMemo(() => {
    if (!editingPayment) return [];
    return entities
      .filter(e => !e._deleted && e.entity_type === editingPayment.entityType)
      .map(e => ({ id: e.id, label: e.name || 'Unknown', value: e.id }))
      .sort((a, b) => a.label.localeCompare(b.label));
  }, [entities, editingPayment]);

  const handleEditPayment = async (payment: PaymentRow) => {
    // Get the full transaction to populate form
    const transaction = transactions.find(t => t.id === payment.id);
    if (transaction) {
      // Get description - handle multilingual strings
      let description = '';
      if (typeof transaction.description === 'string') {
        description = transaction.description;
      } else if (transaction.description && typeof transaction.description === 'object') {
        const descObj = transaction.description as { en?: string; ar?: string; fr?: string };
        description = descObj.en || descObj.ar || descObj.fr || JSON.stringify(transaction.description);
      }

      setEditForm({
        amount: transaction.amount.toString(),
        currency: transaction.currency || 'USD',
        description,
        reference: transaction.reference || '',
        entityId: transaction.entity_id || payment.entityId || ''
      });
      setEditingPayment(payment);
    }
  };

  const handleSaveEdit = async () => {
    if (!editingPayment || !userProfile?.store_id || !userProfile?.id) return;

    const amount = parseFloat(editForm.amount);
    if (isNaN(amount) || amount <= 0) {
      showToast(t('payments.pleaseEnterValidAmount') || 'Please enter a valid amount', 'error');
      return;
    }

    if (!editForm.entityId) {
      showToast(t('payments.pleaseSelectEntity') || 'Please select an entity', 'error');
      return;
    }

    try {
      const context = {
        userId: userProfile.id,
        userEmail: userProfile.email,
        storeId: userProfile.store_id,
        branchId: raw.currentBranchId || userProfile.store_id,
        module: 'accounting',
        source: 'web' as const
      };

      // Get the original transaction
      const originalTransaction = transactions.find(t => t.id === editingPayment.id);
      if (!originalTransaction) {
        showToast(t('payments.transactionNotFound') || 'Transaction not found', 'error');
        return;
      }

      // Guard: only an ACTIVE row may be corrected. A row that was already
      // superseded, reversed or deleted must never be corrected again —
      // re-reversing an already-reversed transaction would double-count in the
      // ledger. This is the authoritative enforcement point (the source of
      // truth is the client); superseded rows are also hidden from the list, so
      // this defends against a stale/duplicate row slipping through.
      const orig = originalTransaction as any;
      const alreadyFinalized =
        orig._deleted === true ||
        orig.is_reversal === true ||
        (orig.status != null && orig.status !== 'active') ||
        orig.metadata?.corrected === true;
      if (alreadyFinalized) {
        showToast(
          t('payments.cannotCorrectNonActive') ||
          'This payment was already corrected or reversed and can no longer be edited.',
          'error'
        );
        setEditingPayment(null);
        return;
      }

      // Check if anything actually changed
      const amountChanged = originalTransaction.amount !== amount;
      const currencyChanged = originalTransaction.currency !== editForm.currency;
      const originalDescription = typeof originalTransaction.description === 'string' 
        ? originalTransaction.description 
        : (originalTransaction.description && typeof originalTransaction.description === 'object'
          ? ((originalTransaction.description as { en?: string; ar?: string; fr?: string }).en || (originalTransaction.description as { en?: string; ar?: string; fr?: string }).ar || (originalTransaction.description as { en?: string; ar?: string; fr?: string }).fr || JSON.stringify(originalTransaction.description))
          : JSON.stringify(originalTransaction.description));
      const descriptionChanged = originalDescription !== editForm.description;
      const referenceChanged = (originalTransaction.reference || '') !== (editForm.reference || '');
      const entityChanged = (originalTransaction.entity_id || '') !== (editForm.entityId || '');

      if (!amountChanged && !currencyChanged && !descriptionChanged && !referenceChanged && !entityChanged) {
        showToast(t('payments.noChangesDetected') || 'No changes detected', 'error');
        setEditingPayment(null);
        return;
      }

      // Step 1: Create reversal transaction for the original
      // This preserves history: "Mistakes are corrected, not erased. History is preserved, not rewritten"
      const reversalReason = `Correction: ${originalDescription}`;
      
      console.log('🔄 Creating reversal transaction for payment correction...');
      const reversalTransaction = await accountBalanceService.createReversalTransaction(
        editingPayment.id,
        reversalReason,
        userProfile.id
      );

      if (!reversalTransaction) {
        showToast(t('payments.failedToCreateReversal') || 'Failed to create reversal transaction', 'error');
        return;
      }

      // Step 2: Create new corrected transaction
      const correctedDescription = editForm.description || 
        `Corrected payment - Original: ${originalDescription}`;

      console.log('✅ Creating corrected transaction...');
      // Route the correction to the (possibly changed) entity. The reversal above
      // already undid the original on its previous entity, so when the entity is
      // changed the balance moves cleanly: old entity nets to zero, new entity
      // receives the payment. Keyed off entity_id + the original category rather
      // than the legacy customer_id/supplier_id/employee_id fields, which the app
      // no longer populates. updateCashDrawer is left to createTransaction's
      // category-based default so it mirrors the reversal's cash-drawer impact.
      const correctedResult = await transactionService.createTransaction({
        category: originalTransaction.category as any,
        amount,
        currency: editForm.currency,
        description: correctedDescription,
        context,
        reference: editForm.reference || undefined,
        entityId: editForm.entityId || originalTransaction.entity_id || undefined,
        // Correction lineage: point back to the row being replaced and carry the
        // chain root forward (inherited if the original was itself a correction)
        // so the whole chain is reconstructable in O(1).
        corrected_from_transaction_id: originalTransaction.id,
        chain_root_id: originalTransaction.chain_root_id || originalTransaction.id
      });

      if (correctedResult.success && reversalTransaction) {
        // Step 3: Supersede the original. The load-bearing state now lives in
        // TYPED columns (status + superseded_by_transaction_id) which the list
        // filter reads — not the mutable `metadata.corrected` flag. The metadata
        // block is kept purely as a human-readable audit trail (who/when/why).
        try {
          const originalTransactionWithMetadata = originalTransaction as any;
          const existingMetadata = originalTransactionWithMetadata.metadata || {};
          await raw.updateTransaction(editingPayment.id, {
            status: 'superseded',
            superseded_by_transaction_id: correctedResult.transactionId || null,
            metadata: {
              ...existingMetadata,
              corrected: true,
              correctedAt: new Date().toISOString(),
              correctedBy: userProfile.id,
              reversalTransactionId: reversalTransaction.id,
              correctedTransactionId: correctedResult.transactionId,
              correctionReason: 'Payment amount/currency/description/reference corrected'
            }
          });
        } catch (metadataError) {
          console.warn('Could not update transaction status/metadata:', metadataError);
          // Non-critical, continue
        }

        // Record the correction as a business-action audit row ('update'), mirroring
        // how payment creation is audited (auditService.record is best-effort and
        // never throws). The field deltas land in the audit `changes[]` array.
        const auditChanges: Array<{ field: string; old: unknown; new: unknown }> = [];
        if (amountChanged) auditChanges.push({ field: 'amount', old: originalTransaction.amount, new: amount });
        if (currencyChanged) auditChanges.push({ field: 'currency', old: originalTransaction.currency, new: editForm.currency });
        if (descriptionChanged) auditChanges.push({ field: 'description', old: originalDescription, new: editForm.description });
        if (referenceChanged) auditChanges.push({ field: 'reference', old: originalTransaction.reference || null, new: editForm.reference || null });
        if (entityChanged) auditChanges.push({ field: 'entity_id', old: originalTransaction.entity_id || null, new: editForm.entityId || null });
        await auditService.record({
          storeId: userProfile.store_id,
          branchId: raw.currentBranchId || userProfile.store_id,
          changedBy: userProfile.id,
          entityType: 'payment',
          entityId: editingPayment.id,
          action: 'update',
          changes: auditChanges,
          changeReason: `Payment corrected — reversal ${reversalTransaction.id}, correction ${correctedResult.transactionId}`,
          reference: editForm.reference || originalTransaction.reference || null,
        });

        console.log('✅ Payment correction completed successfully');
        showToast(
          t('payments.paymentCorrectedSuccessfully') || 
          'Payment corrected successfully. Original transaction preserved, reversal and correction created.',
          'success'
        );
        setEditingPayment(null);
        await raw.refreshData();
      } else {
        showToast(
          correctedResult.error || 
          t('payments.failedToCorrectPayment') || 
          'Failed to correct payment',
          'error'
        );
      }
    } catch (error: any) {
      console.error('❌ Error correcting payment:', error);
      showToast(
        error.message || 
        t('payments.failedToCorrectPayment') || 
        'Failed to correct payment',
        'error'
      );
    }
  };

  // Helper function to calculate balance impact
  const getBalanceImpact = async (payment: PaymentRow): Promise<{ before: number; after: number; currency: string } | null> => {
    // Only calculate for customer/supplier payments with valid entity ID
    if (!payment.entityId || 
        !payment.entityType || 
        (payment.entityType !== 'customer' && payment.entityType !== 'supplier')) {
      return null; // Employee payments don't affect entity balances
    }

    try {
      // Validate entityId is a non-empty string
      if (typeof payment.entityId !== 'string' || payment.entityId.trim() === '') {
        console.warn('Invalid entityId for balance calculation:', payment.entityId);
        return null;
      }

      const balanceResult = await accountBalanceService.getAccountBalance(
        payment.entityType,
        payment.entityId,
        false, // Don't verify, use cached
        undefined // No date range
      );

      const currentBalance = balanceResult.currentBalance.byCurrency[payment.currency as 'USD' | 'LBP'] ?? 0;

      // Calculate impact: deletion reverses the transaction
      // Customer payment: when received, it DECREASES customer balance (they owe us less)
      //   Deletion reverses this: balance INCREASES (they owe us more again)
      // Supplier payment: when sent, it DECREASES supplier balance (we owe them less)
      //   Deletion reverses this: balance INCREASES (we owe them more again)
      // Refund: reverses the original transaction effect
      let impactAmount = 0;
      if (payment.type === 'Customer Payment') {
        // Customer payment deletion: reverses the decrease, so balance increases
        impactAmount = payment.amount;
      } else if (payment.type === 'Supplier Payment') {
        // Supplier payment deletion: reverses the decrease, so balance increases
        impactAmount = payment.amount;
      } else if (payment.type === 'Refund') {
        // Refund deletion: reverses the refund effect
        // Customer refund deletion: reverses refund (they owe us more again)
        // Supplier refund deletion: reverses refund (we owe them more again)
        impactAmount = payment.amount;
      }

      return {
        before: currentBalance,
        after: currentBalance + impactAmount,
        currency: payment.currency
      };
    } catch (error) {
      console.error('Error calculating balance impact:', error);
      return null;
    }
  };

  // Helper function to check if transaction has related reversals
  const checkForReversals = async (transactionId: string): Promise<boolean> => {
    try {
      // Use in-memory transactions from context
      const reversalsCount = (transactions || []).filter((t: any) =>
        t.reversal_of_transaction_id === transactionId &&
        !t._deleted &&
        t.status !== 'voided' &&
        (t.metadata as any)?.deleted !== true
      ).length;
      return reversalsCount > 0;
    } catch (error) {
      console.error('Error checking for reversals:', error);
      return false;
    }
  };

  // Helper function to check if transaction affects cash drawer
  const checkCashDrawerImpact = async (payment: PaymentRow): Promise<boolean> => {
    try {
      const transaction = (transactions || []).find((t: any) => t.id === payment.id);
      if (!transaction) return false;
      
      // Check if this is a cash transaction category
      const cashCategories = [
        TRANSACTION_CATEGORIES.CUSTOMER_PAYMENT_RECEIVED,
        TRANSACTION_CATEGORIES.SUPPLIER_PAYMENT
      ];
      
      return cashCategories.includes(transaction.category as any);
    } catch (error) {
      console.error('Error checking cash drawer impact:', error);
      return false;
    }
  };

  const handleDeletePayment = async (payment: PaymentRow) => {
    setDeletingPayment(payment);
    setLoadingDeletionDetails(true);
    setDeletionDetails(null);

    try {
      // Fetch deletion details in parallel
      const [balanceImpact, hasReversals, transaction, cashDrawerImpact] = await Promise.all([
        getBalanceImpact(payment),
        checkForReversals(payment.id),
        Promise.resolve((transactions || []).find((t: any) => t.id === payment.id)),
        checkCashDrawerImpact(payment)
      ]);

      // Get validation warnings (non-blocking)
      const validationResult = await transactionValidationService.validateTransactionDeletion(
        payment.id,
        {
          enforceImmutability: false,
          allowDeletes: true
        }
      );

      const details: DeletionDetails = {
        balanceImpact: balanceImpact || undefined,
        isSynced: transaction?._synced || false,
        hasReversals,
        cashDrawerImpact,
        warnings: validationResult.warnings.length > 0 ? validationResult.warnings : undefined
      };

      setDeletionDetails(details);
    } catch (error) {
      console.error('Error fetching deletion details:', error);
      // Still allow deletion even if details fetch fails
      setDeletionDetails({});
    } finally {
      setLoadingDeletionDetails(false);
    }
  };

  const handleConfirmDelete = async () => {
    if (!deletingPayment || !userProfile?.store_id || !userProfile?.id) return;

    try {
      const context = {
        userId: userProfile.id,
        userEmail: userProfile.email,
        storeId: userProfile.store_id,
        branchId: raw.currentBranchId || userProfile.store_id,
        module: 'accounting',
        source: 'web' as const
      };

      const result = await transactionService.deleteTransaction(deletingPayment.id, context);

      if (result.success) {
        // Record the cancellation as a business-action audit row ('void' — the
        // payment is reversed but preserved, not hard-deleted). Best-effort.
        await auditService.record({
          storeId: userProfile.store_id,
          branchId: raw.currentBranchId || userProfile.store_id,
          changedBy: userProfile.id,
          entityType: 'payment',
          entityId: deletingPayment.id,
          action: 'void',
          changeReason: `Payment voided: ${formatCurrencyWithSymbol(deletingPayment.amount, deletingPayment.currency)} (${deletingPayment.entityName})`,
          reference: deletingPayment.reference || null,
        });

        showToast(t('payments.paymentDeletedSuccessfully') || 'Payment deleted successfully', 'success');
        setDeletingPayment(null);
        setDeletionDetails(null);
        await raw.refreshData();
      } else {
        showToast(result.error || t('payments.failedToDeletePayment') || 'Failed to delete payment', 'error');
      }
    } catch (error: any) {
      console.error('Error deleting payment:', error);
      showToast(error.message || t('payments.failedToDeletePayment') || 'Failed to delete payment', 'error');
    }
  };
  return (
    <div className="space-y-6">
      <Toast message={toast.message} type={toast.type} visible={toast.visible} onClose={() => setToast(t => ({ ...t, visible: false }))} />
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold text-gray-900">
            {t('payments.recentPayments') || 'Recent Payments'}
          </h2>
          <p className="text-sm text-gray-500 mt-1">
            {t('payments.paymentTransactions') || 'Payment Transactions'} ({paymentRows.length})
          </p>
        </div>
        <div className="flex items-center gap-3">
          <button
            onClick={() => raw.refreshData()}
            className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 flex items-center gap-2"
          >
            <RefreshCw className="w-4 h-4" />
            {t('dashboard.refresh') || 'Refresh'}
          </button>
        </div>
      </div>

      {/* Filters */}
      <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-4">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4">
          {/* Search */}
          <div className="lg:col-span-2">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-4 h-4" />
              <input
                type="text"
                placeholder={t('dashboard.search') || 'Search...'}
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              />
            </div>
          </div>

          {/* Type Filter */}
          <div>
            <select
              value={typeFilter}
              onChange={(e) => setTypeFilter(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            >
              <option value="all">{t('dashboard.allTypes') || 'All Types'}</option>
              <option value="Customer Payment">{t('payments.customerPayment')}</option>
              <option value="Supplier Payment">{t('payments.supplierPayment')}</option>
              <option value="Employee Payment">{t('payments.employeePayment')}</option>
              <option value="Refund">{t('payments.refund') }</option>
            </select>
          </div>

          {/* Status Filter */}
          <div>
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            >
              <option value="all">{t('dashboard.allStatuses') || 'All Statuses'}</option>
              <option value="completed">{t('payments.completed') || 'Completed'}</option>
              <option value="reversed">{t('payments.reversed') || 'Reversed'}</option>
              <option value="canceled">{t('payments.canceled') || 'Canceled'}</option>
            </select>
          </div>

          {/* Currency Filter */}
          <div>
            <select
              value={currencyFilter}
              onChange={(e) => setCurrencyFilter(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            >
              <option value="all">{t('dashboard.allCurrencies') || 'All Currencies'}</option>
              {acceptedCurrencies.map((code) => (
                <option key={code} value={code}>{t(`common.currency.${code}`) || code}</option>
              ))}
            </select>
          </div>
        </div>

        {/* Date Range and Toggle */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mt-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              {t('dashboard.startDate') || 'Start Date'}
            </label>
            <input
              type="date"
              value={dateRange.start}
              onChange={(e) => setDateRange(prev => ({ ...prev, start: e.target.value }))}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              {t('dashboard.endDate') || 'End Date'}
            </label>
            <input
              type="date"
              value={dateRange.end}
              onChange={(e) => setDateRange(prev => ({ ...prev, end: e.target.value }))}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            />
          </div>
          <div className="flex items-end gap-4">
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={showReversals}
                onChange={(e) => setShowReversals(e.target.checked)}
                className="w-4 h-4 text-blue-600 border-gray-300 rounded focus:ring-blue-500"
              />
              <span className="text-sm font-medium text-gray-700">
                {t('payments.showCorrectedReversedPayments') || 'Show corrected & reversed payments'}
              </span>
            </label>
            {hasActiveFilters && (
              <button
                onClick={clearFilters}
                className="px-4 py-2 text-sm font-medium text-gray-700 bg-gray-100 border border-gray-300 rounded-lg hover:bg-gray-200 flex items-center justify-center gap-2"
              >
                <X className="w-4 h-4" />
                {t('dashboard.clearFilters') || 'Clear Filters'}
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Table */}
      <div className="bg-white rounded-lg shadow-sm border border-gray-200 overflow-hidden">
        {paginatedRows.length === 0 ? (
          <div className="text-center py-12">
            <DollarSign className="w-12 h-12 text-gray-400 mx-auto mb-4" />
            <p className="text-lg font-medium text-gray-500">
              {t('payments.noPaymentsFound') || 'No Payments Found'}
            </p>
            <p className="text-sm text-gray-400 mt-2">
              {t('payments.noPaymentsMessage') || 'No payment transactions match your current filters.'}
            </p>
          </div>
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-gray-200">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      {t('payments.dateTime')}  
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      {t('dashboard.type')}
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      {t('payments.entity')}
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      {t('payments.amount')}
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      {t('payments.status')}
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      {t('payments.reference')}
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      {t('dashboard.createdBy')}
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      {t('payments.actions')}
                    </th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-200">
                  {paginatedRows.map((row) => {
                    const isHighlighted = highlightedPaymentId === row.id;
                    return (
                    <React.Fragment key={row.id}>
                      {/* Main transaction row */}
                      <tr
                        id={`payment-${row.id}`}
                        className={`${row.isReversal ? 'bg-gray-50 border-l-4 border-orange-400' : ''} ${
                          isHighlighted ? 'border-2 border-blue-400' : ''
                        }`}
                      >
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                          {new Date(row.date).toLocaleDateString()} {new Date(row.date).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap">
                          <span className={`inline-flex px-2 py-1 text-xs font-semibold rounded-full ${
                            row.isReversal
                              ? 'bg-orange-100 text-orange-800'
                              :
                               'bg-green-100 text-green-800'
                              
                          }`}>
                            {t(getPaymentTypeTranslationKey(row.type)) || row.type}
                            {row.isReversal ? ` (${t('payments.reversal') || 'Reversal'})` : ''}
                          </span>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap">
                          <div className="flex items-center">
                            <User className="w-4 h-4 text-gray-400 mr-2" />
                            <span className="text-sm text-gray-900">{row.entityName}</span>
                            <span className="ml-2 text-xs text-gray-500 capitalize">({row.entityType})</span>
                          </div>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap">
                          <div className="flex flex-col gap-1">
                            <span className={`text-sm font-semibold ${
                              row.isReversal
                                ? 'text-orange-600'
                                : row.type === 'Customer Payment' ? 'text-green-600' : 'text-red-600'
                            }`}>
                              {formatCurrencyWithSymbol(row.amount, row.currency)}
                            </span>
                            {row.isCorrected && row.originalAmount !== undefined && showReversals && (
                              <span className="text-xs text-gray-500 italic" title="Original amount (no effect on calculations)">
                                {t('receivedBills.original')}: {formatCurrencyWithSymbol(row.originalAmount, row.originalCurrency || row.currency)}
                              </span>
                            )}
                          </div>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap">
                          <span className={`inline-flex px-2 py-1 text-xs font-semibold rounded-full ${
                            row.status === 'completed'
                              ? 'bg-green-100 text-green-800'
                              : row.status === 'canceled'
                              ? 'bg-gray-100 text-gray-800'
                              : 'bg-red-100 text-red-800'
                          }`}>
                            {row.status === 'completed' 
                              ? (t('payments.completed') || 'Completed')
                              : row.status === 'canceled'
                              ? (t('payments.canceled') || 'Canceled')
                              : (t('payments.reversed') || 'Reversed')}
                          </span>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                          {row.reference || '-'}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                          {row.createdByName}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm font-medium">
                          <div className="flex items-center gap-2">
                            {row.status === 'completed' && !row.isReversal && (
                              <>
                                <button
                                  onClick={() => handleEditPayment(row)}
                                  className="text-blue-600 hover:text-blue-900 p-1 rounded hover:bg-blue-50"
                                  title={t('payments.editPayment') || 'Edit Payment'}
                                >
                                  <Edit className="w-4 h-4" />
                                </button>
                                <button
                                  onClick={() => handleDeletePayment(row)}
                                  className="text-red-600 hover:text-red-900 p-1 rounded hover:bg-red-50"
                                  title={t('payments.deletePayment') || 'Delete Payment'}
                                >
                                  <Trash2 className="w-4 h-4" />
                                </button>
                              </>
                            )}
                            {row.status === 'canceled' && (
                              <span className="text-xs text-gray-500 italic">
                                {t('payments.paymentCanceled') || 'Payment Canceled'}
                              </span>
                            )}
                          </div>
                        </td>
                      </tr>
                    </React.Fragment>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {/* Pagination */}
            {totalPages > 1 && (
              <div className="px-6 py-4 border-t border-gray-200">
                <Pagination
                  currentPage={currentPage}
                  totalPages={totalPages}
                  onPageChange={setCurrentPage}
                  itemsPerPage={ITEMS_PER_PAGE}
                  totalItems={paymentRows.length}
                />
              </div>
            )}
          </>
        )}
      </div>

      {/* Edit Payment Modal */}
      {editingPayment && (
        <div className="animate-modal-fade fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
          <div className="animate-modal-pop bg-white rounded-lg max-w-md w-full">
            <div className="p-6 border-b">
              <h2 className="text-xl font-semibold text-gray-900">
                {t('payments.editPayment') || 'Edit Payment'}
              </h2>
            </div>
            <div className="p-6 space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  {t('payments.entity') || 'Entity'} <span className="text-xs font-normal text-gray-400 capitalize">({editingPayment.entityType})</span> *
                </label>
                <SearchableSelect
                  options={editEntityOptions}
                  value={editForm.entityId}
                  onChange={(val) => setEditForm(prev => ({ ...prev, entityId: val as string }))}
                  placeholder={t('payments.selectEntity') || 'Select entity...'}
                  searchPlaceholder={t('dashboard.search') || 'Search...'}
                  portal
                />
                {editForm.entityId !== (editingPayment.entityId || '') && (
                  <p className="text-xs text-amber-600 mt-1">
                    {t('payments.changingEntityNote') || 'Changing the entity reverses the original on the previous entity and posts the correction to the selected one.'}
                  </p>
                )}
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  {t('payments.amount') || 'Amount'} *
                </label>
                <input
                  type="number"
                  step="0.01"
                  value={editForm.amount}
                  onChange={(e) => setEditForm(prev => ({ ...prev, amount: e.target.value }))}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  required
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  {t('dashboard.currency') || 'Currency'} *
                </label>
                <select
                  value={editForm.currency}
                  onChange={(e) => setEditForm(prev => ({ ...prev, currency: e.target.value as CurrencyCode }))}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                >
                  {/* Union with the payment's own currency so a value that's no
                      longer in the accepted list still renders as selected. */}
                  {Array.from(new Set([editForm.currency, ...acceptedCurrencies])).map((code) => (
                    <option key={code} value={code}>{t(`common.currency.${code}`) || code}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  {t('payments.description') || 'Description'}
                </label>
                <textarea
                  value={editForm.description}
                  onChange={(e) => setEditForm(prev => ({ ...prev, description: e.target.value }))}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  rows={3}
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  {t('payments.reference') || 'Reference'}
                </label>
                <input
                  type="text"
                  value={editForm.reference}
                  onChange={(e) => setEditForm(prev => ({ ...prev, reference: e.target.value }))}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                />
              </div>
            </div>
            <div className="p-6 border-t flex justify-end gap-3">
              <button
                onClick={() => setEditingPayment(null)}
                className="px-4 py-2 text-gray-700 border border-gray-300 rounded-lg hover:bg-gray-50"
              >
                {t('dashboard.cancel') || 'Cancel'}
              </button>
              <button
                onClick={handleSaveEdit}
                className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
              >
                {t('dashboard.save') || 'Save'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Delete Confirmation Modal */}
      {deletingPayment && (
        <div className="animate-modal-fade fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
          <div className="animate-modal-pop bg-white rounded-lg max-w-lg w-full max-h-[90vh] overflow-y-auto">
            <div className="p-6 border-b">
              <h2 className="text-xl font-semibold text-gray-900">
                {t('payments.deletePaymentTitle') || 'Delete Payment'}
              </h2>
            </div>
            <div className="p-6">
              {loadingDeletionDetails ? (
                <div className="flex items-center justify-center py-8">
                  <RefreshCw className="w-6 h-6 text-gray-400 animate-spin" />
                  <span className="ml-2 text-gray-600">
                    {t('payments.loadingDeletionDetails') || 'Loading deletion details...'}
                  </span>
                </div>
              ) : (
                <>
                  <p className="text-gray-700 mb-4">
                    {t('payments.deletePaymentMessage') || 'Are you sure you want to delete this payment? This action cannot be undone and will affect related balances.'}
                  </p>

                  {/* Payment Information */}
                  <div className="bg-gray-50 p-4 rounded-lg mb-4">
                    <p className="text-sm text-gray-600 mb-2">
                      <strong>{t('payments.entity') || 'Entity'}:</strong> {deletingPayment.entityName}
                    </p>
                    <p className="text-sm text-gray-600 mb-2">
                      <strong>{t('payments.amount') || 'Amount'}:</strong> {formatCurrencyWithSymbol(deletingPayment.amount, deletingPayment.currency)}
                    </p>
                    <p className="text-sm text-gray-600">
                      <strong>{t('payments.reference') || 'Reference'}:</strong> {deletingPayment.reference || '-'}
                    </p>
                  </div>

                  {/* Sync Status */}
                  {deletionDetails?.isSynced !== undefined && (
                    <div className={`p-3 rounded-lg mb-4 ${
                      deletionDetails.isSynced 
                        ? 'bg-yellow-50 border border-yellow-200' 
                        : 'bg-blue-50 border border-blue-200'
                    }`}>
                      <p className="text-sm font-medium flex items-center">
                        {deletionDetails.isSynced ? (
                          <>
                            <span className="text-yellow-800">
                              {t('payments.deletionSyncStatusSynced') || '⚠️ This payment has been synced to the server'}
                            </span>
                          </>
                        ) : (
                          <>
                            <span className="text-blue-800">
                              {t('payments.deletionSyncStatusUnsynced') || 'ℹ️ This payment has not been synced yet'}
                            </span>
                          </>
                        )}
                      </p>
                    </div>
                  )}

                  {/* Balance Impact */}
                  {deletionDetails?.balanceImpact && (
                    <div className="bg-blue-50 border border-blue-200 p-4 rounded-lg mb-4">
                      <h3 className="text-sm font-semibold text-blue-900 mb-2">
                        {t('payments.deletionBalanceImpact') || 'Balance Impact'}
                      </h3>
                      <div className="space-y-1 text-sm">
                        <p className="text-blue-800">
                          <strong>{t('payments.currentBalance') || 'Current Balance'}:</strong>{' '}
                          {formatCurrencyWithSymbol(deletionDetails.balanceImpact.before, deletionDetails.balanceImpact.currency)}
                        </p>
                        <p className="text-blue-800">
                          <strong>{t('payments.balanceAfterDeletion') || 'Balance After Deletion'}:</strong>{' '}
                          {formatCurrencyWithSymbol(deletionDetails.balanceImpact.after, deletionDetails.balanceImpact.currency)}
                        </p>
                        <p className="text-blue-700 font-medium mt-2">
                          {t('payments.balanceChange') || 'Change'}:{' '}
                          {deletionDetails.balanceImpact.after - deletionDetails.balanceImpact.before >= 0 ? '+' : ''}
                          {formatCurrencyWithSymbol(
                            deletionDetails.balanceImpact.after - deletionDetails.balanceImpact.before,
                            deletionDetails.balanceImpact.currency
                          )}
                        </p>
                      </div>
                    </div>
                  )}

                  {/* Cash Drawer Impact */}
                  {deletionDetails?.cashDrawerImpact && (
                    <div className="bg-purple-50 border border-purple-200 p-3 rounded-lg mb-4">
                      <p className="text-sm text-purple-800">
                        {t('payments.deletionCashDrawerImpact') || '💵 This deletion will also affect the cash drawer balance'}
                      </p>
                    </div>
                  )}

                  {/* Related Reversals Warning */}
                  {deletionDetails?.hasReversals && (
                    <div className="bg-orange-50 border border-orange-200 p-3 rounded-lg mb-4">
                      <p className="text-sm text-orange-800">
                        {t('payments.deletionHasReversals') || '⚠️ This payment has related reversal transactions'}
                      </p>
                    </div>
                  )}

                  {/* Validation Warnings */}
                  {deletionDetails?.warnings && deletionDetails.warnings.length > 0 && (
                    <div className="bg-yellow-50 border border-yellow-200 p-4 rounded-lg mb-4">
                      <h3 className="text-sm font-semibold text-yellow-900 mb-2">
                        {t('payments.deletionWarning') || 'Warnings'}
                      </h3>
                      <ul className="list-disc list-inside space-y-1 text-sm text-yellow-800">
                        {deletionDetails.warnings.map((warning, index) => (
                          <li key={index}>{warning}</li>
                        ))}
                      </ul>
                    </div>
                  )}
                </>
              )}
            </div>
            <div className="p-6 border-t flex justify-end gap-3">
              <button
                onClick={() => {
                  setDeletingPayment(null);
                  setDeletionDetails(null);
                }}
                className="px-4 py-2 text-gray-700 border border-gray-300 rounded-lg hover:bg-gray-50"
                disabled={loadingDeletionDetails}
              >
                {t('dashboard.cancel') || 'Cancel'}
              </button>
              <button
                onClick={handleConfirmDelete}
                className="px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 disabled:opacity-50 disabled:cursor-not-allowed"
                disabled={loadingDeletionDetails}
              >
                {t('payments.deletePaymentButton') || 'Delete Payment'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

