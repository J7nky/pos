import React, { useState, useMemo, useEffect } from 'react';
import { useOfflineData } from '../../../contexts/OfflineDataContext';
import { useI18n } from '../../../i18n';
import { useSupabaseAuth } from '../../../contexts/SupabaseAuthContext';
import { transactionService } from '../../../services/transactionService';
import { accountBalanceService } from '../../../services/accountBalanceService';
import { transactionValidationService } from '../../../services/transactionValidationService';
import { TRANSACTION_CATEGORIES } from '../../../constants/transactionCategories';
import { getDB } from '../../../lib/db';
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
  currency: 'USD' | 'LBP';
  status: PaymentStatus;
  reference: string | null;
  createdByName: string;
  createdById: string;
  isReversal?: boolean;
  reversalOfTransactionId?: string | null;
  reversalTransactions?: PaymentRow[]; // Child reversals for this transaction
  originalAmount?: number; // Original amount for corrected payments
  originalCurrency?: 'USD' | 'LBP'; // Original currency for corrected payments
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
    currency: 'USD' as 'USD' | 'LBP',
    description: '',
    reference: ''
  });
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error'; visible: boolean }>({
    message: '',
    type: 'success',
    visible: false
  });

  // Get all transactions and entities
  const transactions = raw.transactions || [];
  const entities = raw.entities || [];

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
            const user = await getDB().users.get(userId);
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
      // Must be a payment category
      if (!isPaymentCategory(t.category)) {
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

    // Build a map of corrected transaction IDs to their original amounts and currencies
    // This helps us identify which transactions are corrections and what their original amounts were
    const correctedTransactionMap = new Map<string, { amount: number; currency: 'USD' | 'LBP' }>();
    transactions.forEach(t => {
      const transactionWithMetadata = t as any;
      if (transactionWithMetadata.metadata?.corrected === true && transactionWithMetadata.metadata?.correctedTransactionId) {
        // This is the original transaction that was corrected
        // Store the original amount and currency for the corrected transaction
        const correctedTransactionId = transactionWithMetadata.metadata.correctedTransactionId as string;
        correctedTransactionMap.set(correctedTransactionId, {
          amount: t.amount,
          currency: t.currency as 'USD' | 'LBP'
        });
      }
    });

    // Filter out original transactions that were corrected (metadata.corrected === true)
    // These should not appear in the list
    allPaymentTransactions = allPaymentTransactions.filter(t => {
      const transactionWithMetadata = t as any;
      // Hide original transactions that were corrected
      if (transactionWithMetadata.metadata?.corrected === true) {
        return false;
      }
      return true;
    });

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

        // Determine status: canceled (metadata.deleted) > reversed (_deleted) > completed
        const transactionWithMetadata = transaction as any;
        const status: PaymentStatus = transactionWithMetadata.metadata?.deleted === true
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
          reversalTransactions: [],
          originalAmount,
          originalCurrency,
          isCorrected: isCorrected || false
        };
      })
      .filter((row): row is PaymentRow => row !== null); // Filter out null entries

    // Separate non-reversal and reversal transactions
    const nonReversalRows = rows.filter(row => !row.isReversal);
    const reversalRows = rows.filter(row => row.isReversal);

    // Group reversals under their original transactions (for non-corrected originals)
    const groupedRows: PaymentRow[] = [];
    const reversalMap = new Map<string, PaymentRow[]>();
    
    // Collect reversals grouped by their original transaction ID
    reversalRows.forEach(row => {
      if (row.reversalOfTransactionId) {
        if (!reversalMap.has(row.reversalOfTransactionId)) {
          reversalMap.set(row.reversalOfTransactionId, []);
        }
        reversalMap.get(row.reversalOfTransactionId)!.push(row);
      }
    });

    // Build the final list with reversals nested under their originals (if originals exist)
    nonReversalRows.forEach(row => {
      const reversals = reversalMap.get(row.id) || [];
      if (reversals.length > 0 && showReversals) {
        // Original transaction with reversals - include reversals as children
        groupedRows.push({
          ...row,
          reversalTransactions: reversals
        });
      } else {
        // Original transaction without reversals, or showReversals is false
        groupedRows.push(row);
      }
    });

    // Add standalone reversal transactions (reversals whose originals were filtered out)
    // These are reversals that point to transactions with metadata.corrected === true
    if (showReversals) {
      reversalRows.forEach(row => {
        // Check if this reversal is already included as a child
        const alreadyIncluded = groupedRows.some(gr => 
          gr.reversalTransactions?.some(rt => rt.id === row.id)
        );
        if (!alreadyIncluded) {
          // This is a standalone reversal (its original was filtered out)
          groupedRows.push(row);
        }
      });
    }

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
        reference: transaction.reference || ''
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

      if (!amountChanged && !currencyChanged && !descriptionChanged && !referenceChanged) {
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
      let correctedResult;

      if (originalTransaction.customer_id) {
        // Customer payment
        correctedResult = await transactionService.createCustomerPayment(
          originalTransaction.customer_id,
          amount,
          editForm.currency,
          correctedDescription,
          context,
          {
            reference: editForm.reference || undefined,
            updateCashDrawer: originalTransaction.category === TRANSACTION_CATEGORIES.CUSTOMER_PAYMENT_RECEIVED ||
                             originalTransaction.category === TRANSACTION_CATEGORIES.CUSTOMER_PAYMENT
          }
        );
      } else if (originalTransaction.supplier_id) {
        // Supplier payment
        correctedResult = await transactionService.createSupplierPayment(
          originalTransaction.supplier_id,
          amount,
          editForm.currency,
          correctedDescription,
          context,
          {
            reference: editForm.reference || undefined,
            updateCashDrawer: originalTransaction.category === TRANSACTION_CATEGORIES.SUPPLIER_PAYMENT
          }
        );
      } else if (originalTransaction.employee_id) {
        // Employee payment
        correctedResult = await transactionService.createEmployeePayment(
          originalTransaction.employee_id,
          amount,
          editForm.currency,
          correctedDescription,
          context,
          {
            reference: editForm.reference || undefined,
            updateCashDrawer: false
          }
        );
      } else {
        // General transaction - use createTransaction
        correctedResult = await transactionService.createTransaction({
          category: originalTransaction.category as any,
          amount,
          currency: editForm.currency,
          description: correctedDescription,
          context,
          reference: editForm.reference || undefined,
          entityId: originalTransaction.entity_id || undefined
        });
      }

      if (correctedResult.success && reversalTransaction) {
        // Step 3: Mark original transaction with metadata for audit trail
        // This links the original, reversal, and correction together
        try {
          const originalTransactionWithMetadata = originalTransaction as any;
          const existingMetadata = originalTransactionWithMetadata.metadata || {};
          await getDB().transactions.update(editingPayment.id, {
            metadata: {
              ...existingMetadata,
              corrected: true,
              correctedAt: new Date().toISOString(),
              correctedBy: userProfile.id,
              reversalTransactionId: reversalTransaction.id,
              correctedTransactionId: correctedResult.transactionId,
              correctionReason: 'Payment amount/currency/description/reference corrected'
            },
            _synced: false
          });
        } catch (metadataError) {
          console.warn('Could not update transaction metadata:', metadataError);
          // Non-critical, continue
        }

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

      const currentBalance = payment.currency === 'USD' 
        ? balanceResult.currentBalance.USD 
        : balanceResult.currentBalance.LBP;

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
      // Use filter instead of where to avoid index requirements
      // Check both _deleted and metadata.deleted
      const reversals = await getDB().transactions
        .filter(t => 
          t.reversal_of_transaction_id === transactionId && 
          !t._deleted && 
          (t.metadata as any)?.deleted !== true
        )
        .count();
      return reversals > 0;
    } catch (error) {
      console.error('Error checking for reversals:', error);
      return false;
    }
  };

  // Helper function to check if transaction affects cash drawer
  const checkCashDrawerImpact = async (payment: PaymentRow): Promise<boolean> => {
    try {
      const transaction = await getDB().transactions.get(payment.id);
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
        getDB().transactions.get(payment.id),
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
              <option value="USD">{t('common.currency.USD') || 'USD'}</option>
              <option value="LBP">{t('common.currency.LBP') || 'LBP'}</option>
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
                        className={`${
                          isHighlighted ? 'border-2 border-blue-400' : ''
                        }`}
                      >
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                          {new Date(row.date).toLocaleDateString()} {new Date(row.date).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap">
                          <span className={`inline-flex px-2 py-1 text-xs font-semibold rounded-full ${
                            row.type === 'Customer Payment' 
                              ? 'bg-green-100 text-green-800'
                              : row.type === 'Supplier Payment'
                              ? 'bg-blue-100 text-blue-800'
                              : row.type === 'Employee Payment'
                              ? 'bg-purple-100 text-purple-800'
                              : 'bg-orange-100 text-orange-800'
                          }`}>
                            {t(getPaymentTypeTranslationKey(row.type)) || row.type}
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
                              row.type === 'Customer Payment' ? 'text-green-600' : 'text-red-600'
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
                      {/* Reversal transactions nested under original */}
                      {row.reversalTransactions && row.reversalTransactions.length > 0 && row.reversalTransactions.map((reversal) => {
                        const isReversalHighlighted = highlightedPaymentId === reversal.id;
                        return (
                        <tr 
                          key={reversal.id} 
                          id={`payment-${reversal.id}`}
                          className={`hover:bg-gray-50 bg-gray-50 border-l-4 border-orange-400 transition-all duration-500 ${
                            isReversalHighlighted ? 'border-2 border-blue-400 shadow-xl animate-pulse bg-blue-50' : ''
                          }`}
                        >
                          <td className="px-6 py-3 whitespace-nowrap text-sm text-gray-600 pl-12">
                            {new Date(reversal.date).toLocaleDateString()} {new Date(reversal.date).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                          </td>
                          <td className="px-6 py-3 whitespace-nowrap">
                            <span className="inline-flex px-2 py-1 text-xs font-semibold rounded-full bg-orange-100 text-orange-800">
                              {t(getPaymentTypeTranslationKey(reversal.type)) || reversal.type} ({t('payments.reversal') || 'Reversal'})
                            </span>
                          </td>
                          <td className="px-6 py-3 whitespace-nowrap">
                            <div className="flex items-center">
                              <User className="w-4 h-4 text-gray-400 mr-2" />
                              <span className="text-sm text-gray-600">{reversal.entityName}</span>
                              <span className="ml-2 text-xs text-gray-500 capitalize">({reversal.entityType})</span>
                            </div>
                          </td>
                          <td className="px-6 py-3 whitespace-nowrap">
                            <span className="text-sm font-semibold text-orange-600">
                              {formatCurrencyWithSymbol(reversal.amount, reversal.currency)}
                            </span>
                          </td>
                          <td className="px-6 py-3 whitespace-nowrap">
                            <div className="flex items-center gap-2">
                              <span className="inline-flex px-2 py-1 text-xs font-semibold rounded-full bg-orange-100 text-orange-800">
                                {t('payments.reversal') || 'Reversal'}
                              </span>
                              {reversal.status === 'reversed' && (
                                <span className="inline-flex px-2 py-1 text-xs font-semibold rounded-full bg-gray-100 text-gray-800">
                                  {t('payments.canceled') || 'Canceled'}
                                </span>
                              )}
                            </div>
                          </td>
                          <td className="px-6 py-3 whitespace-nowrap text-sm text-gray-500">
                            {reversal.reference || '-'}
                          </td>
                          <td className="px-6 py-3 whitespace-nowrap text-sm text-gray-600">
                            {reversal.createdByName}
                          </td>
                          <td className="px-6 py-3 whitespace-nowrap text-sm font-medium">
                            {/* Reversals typically don't have actions */}
                          </td>
                        </tr>
                        );
                      })}
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
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-lg max-w-md w-full">
            <div className="p-6 border-b">
              <h2 className="text-xl font-semibold text-gray-900">
                {t('payments.editPayment') || 'Edit Payment'}
              </h2>
            </div>
            <div className="p-6 space-y-4">
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
                  onChange={(e) => setEditForm(prev => ({ ...prev, currency: e.target.value as 'USD' | 'LBP' }))}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                >
                  <option value="USD">USD</option>
                  <option value="LBP">LBP</option>
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
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-lg max-w-lg w-full max-h-[90vh] overflow-y-auto">
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

