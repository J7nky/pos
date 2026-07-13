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
import { getTranslatedString, type MultilingualString, type SupportedLanguage } from '../../../utils/multilingual';
import {
  Search,
  User,
  DollarSign,
  RefreshCw,
  X,
  Edit,
  Trash2,
  ChevronRight
} from 'lucide-react';
import { Pagination } from '../../common/Pagination';
import Toast from '../../common/Toast';
import UnifiedPaymentModal from '../../common/UnifiedPaymentModal';
import type { CurrencyCode } from '@pos-platform/shared';

interface RecentPaymentsProps {
  formatCurrency: (amount: number, currency?: string) => string;
  formatCurrencyWithSymbol: (amount: number, currency: string) => string;
}

type PaymentType = 'Customer Payment' | 'Supplier Payment' | 'Employee Payment' | 'Refund';
type PaymentStatus = 'completed' | 'reversed' | 'canceled' | 'superseded';

// A payment row's role within its correction chain. Drives both grouping and the
// row's visual treatment:
//   active     — the live head of the chain (a normal payment or the latest
//                correction); the only role that is edit/deletable.
//   superseded — an original that was replaced by a correction; nested + dimmed.
//   reversal   — the offsetting entry created when a payment is corrected or
//                voided; nested + dimmed, amount in red.
//   voided     — a payment that was deleted/canceled (a chain tail with no active
//                correction); shown as a canceled head once corrections revealed.
type PaymentRole = 'active' | 'superseded' | 'reversal' | 'voided';

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
  role: PaymentRole;
  chainRootId: string; // id of the chain's first original — the grouping key
}

// One correction chain, collapsed to a single head row plus the previous
// ("original") payments that nest beneath it when corrections are revealed.
// Reversals are excluded from display — they stay in the ledger only.
interface PaymentGroup {
  head: PaymentRow;        // active (or voided) tail of the chain
  nested: PaymentRow[];    // previous originals (superseded), chronological
  correctionCount: number; // number of correction cycles (= superseded originals)
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

// Map a payment's transaction category to its UI "direction" (receive = they pay
// us, pay = we pay them) and back. Editing the direction re-posts the correction
// under the opposite category, so these must stay in lockstep with the
// create-flow mapping in paymentOperations.ts / transactionService. The chosen
// categories are also the only ones the list's payment/refund filter renders.
const directionFromCategory = (
  entityType: 'customer' | 'supplier' | 'employee',
  category: string
): 'receive' | 'pay' => {
  if (entityType === 'customer') {
    return category === TRANSACTION_CATEGORIES.CUSTOMER_REFUND ? 'pay' : 'receive';
  }
  if (entityType === 'supplier') {
    return category === TRANSACTION_CATEGORIES.SUPPLIER_REFUND ? 'receive' : 'pay';
  }
  return category === TRANSACTION_CATEGORIES.EMPLOYEE_PAYMENT_RECEIVED ? 'receive' : 'pay';
};

const categoryFromDirection = (
  entityType: 'customer' | 'supplier' | 'employee',
  direction: 'receive' | 'pay'
): string => {
  if (entityType === 'customer') {
    return direction === 'receive'
      ? TRANSACTION_CATEGORIES.CUSTOMER_PAYMENT
      : TRANSACTION_CATEGORIES.CUSTOMER_REFUND;
  }
  if (entityType === 'supplier') {
    return direction === 'pay'
      ? TRANSACTION_CATEGORIES.SUPPLIER_PAYMENT
      : TRANSACTION_CATEGORIES.SUPPLIER_REFUND;
  }
  return direction === 'pay'
    ? TRANSACTION_CATEGORIES.EMPLOYEE_PAYMENT
    : TRANSACTION_CATEGORIES.EMPLOYEE_PAYMENT_RECEIVED;
};

export default function RecentPayments({
  formatCurrencyWithSymbol
}: RecentPaymentsProps) {
  const { t, language } = useI18n();
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
  const [showCorrected, setShowCorrected] = useState(false);
  // Expanded correction chains, keyed by head transaction id. Collapsed by default.
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(new Set());
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
    entityId: '',
    direction: 'receive' as 'receive' | 'pay'
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

  // Localized entity-type label. The table previously rendered the raw code
  // (`customer`/`supplier`/`employee`) and merely CSS-capitalized it, so it
  // stayed English ("Customer") even in an Arabic/French UI. Routes the code
  // through t() — mirrors the labels UnifiedPaymentModal uses.
  const entityTypeLabel = (entityType: 'customer' | 'supplier' | 'employee'): string =>
    entityType === 'customer'
      ? (t('customers.customer') || 'Customer')
      : entityType === 'supplier'
        ? (t('customers.supplier') || 'Supplier')
        : (t('customers.employee') || 'Employee');

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

  // Build the correction-chain groups shown in the table. Each chain collapses to
  // one head row (the live payment, or — once corrections are revealed — a voided
  // tail) with its superseded originals and reversals nested beneath it.
  const paymentGroups = useMemo<PaymentGroup[]>(() => {
    type Tx = (typeof transactions)[number];
    // Structural filter: payment/refund categories that carry an entity_id. Date,
    // currency, search, type and status filters are applied per-CHAIN below (on
    // the head row) so a filter can't split a chain by hiding one of its members.
    const paymentTx = transactions.filter(t => {
      // Reversals are accounting machinery — the offsetting entry emitted when a
      // payment is corrected or deleted. They stay in the ledger (the
      // correction/deletion flows still create them so double-entry balances) but
      // are never shown here: the user sees only the original/canceled payment,
      // not the reversal that nets it out.
      if (t.is_reversal) return false;
      // Refunds use TRANSACTION_CATEGORIES (Customer/Supplier Refund), which are
      // not part of PAYMENT_CATEGORIES, so isPaymentCategory() alone would exclude
      // them from the payments list.
      const isRefund = t.category === TRANSACTION_CATEGORIES.CUSTOMER_REFUND ||
                       t.category === TRANSACTION_CATEGORIES.SUPPLIER_REFUND;
      if (!isPaymentCategory(t.category) && !isRefund) return false;
      if (!t.entity_id) return false;
      return true;
    });

    // Entity lookup (skip soft-deleted entities).
    const entityMap = new Map<string, typeof entities[0]>();
    entities.forEach(e => { if (!e._deleted) entityMap.set(e.id, e); });

    // Role predicates. `superseded`/`voided` come from the typed status column
    // (authoritative since the v70 migration); the legacy metadata flags and
    // `_deleted` are OR'd in as a back-compat fallback for rows that predate the
    // migration or arrive from a not-yet-migrated server.
    const isSuperseded = (t: Tx): boolean =>
      t.status === 'superseded' || (t as any).metadata?.corrected === true;
    const isVoided = (t: Tx): boolean =>
      t.status === 'voided' || (t as any).metadata?.deleted === true || (t as any)._deleted === true;

    // O(1) chain-root resolution. A correction carries chain_root_id forward, so
    // it resolves directly; a reversal has no chain_root_id of its own and is
    // resolved through the original it reverses; a first original (or a
    // never-corrected payment) is its own root.
    const allById = new Map(transactions.map(t => [t.id, t]));
    const rootCache = new Map<string, string>();
    const rootOf = (t: Tx, seen: Set<string> = new Set()): string => {
      const cached = rootCache.get(t.id);
      if (cached) return cached;
      if (seen.has(t.id)) return t.id; // defensive cycle guard
      seen.add(t.id);
      let root: string;
      if (t.is_reversal && t.reversal_of_transaction_id) {
        const target = allById.get(t.reversal_of_transaction_id);
        root = target ? rootOf(target, seen) : (t.chain_root_id || t.id);
      } else if (t.chain_root_id) {
        root = t.chain_root_id;
      } else if (t.reversal_of_transaction_id) {
        const target = allById.get(t.reversal_of_transaction_id);
        root = target ? rootOf(target, seen) : t.id;
      } else {
        root = t.id;
      }
      rootCache.set(t.id, root);
      return root;
    };

    // Map a transaction to a row, resolving its entity and chain role. Returns
    // null for rows whose entity isn't a customer/supplier/employee (cash/internal
    // entities never appear in the payments list).
    const mapToRow = (transaction: Tx): PaymentRow | null => {
      const entity = entityMap.get(transaction.entity_id || '');
      if (!entity) return null;
      const entityType = entity.entity_type;
      if (entityType !== 'customer' && entityType !== 'supplier' && entityType !== 'employee') {
        return null;
      }

      let type: PaymentType = 'Customer Payment';
      if (entityType === 'employee') {
        type = 'Employee Payment';
      } else if (entityType === 'supplier') {
        type = (transaction.category === TRANSACTION_CATEGORIES.SUPPLIER_REFUND ||
                transaction.category === TRANSACTION_CATEGORIES.CUSTOMER_REFUND)
          ? 'Refund' : 'Supplier Payment';
      } else {
        type = (transaction.category === TRANSACTION_CATEGORIES.CUSTOMER_REFUND ||
                transaction.category === TRANSACTION_CATEGORIES.SUPPLIER_REFUND)
          ? 'Refund' : 'Customer Payment';
      }

      // Role precedence: a reversal is always a reversal; otherwise a superseded
      // original; otherwise a voided/canceled tail; otherwise the live head.
      const role: PaymentRole = transaction.is_reversal
        ? 'reversal'
        : isSuperseded(transaction)
          ? 'superseded'
          : isVoided(transaction)
            ? 'voided'
            : 'active';
      const status: PaymentStatus = role === 'reversal'
        ? 'reversed'
        : role === 'voided'
          ? 'canceled'
          : role === 'superseded'
            ? 'superseded'
            : 'completed';

      return {
        id: transaction.id,
        date: transaction.created_at || (transaction as any).updated_at || '',
        type,
        entityName: entity.name || 'Unknown',
        entityType: entityType as 'customer' | 'supplier' | 'employee',
        entityId: transaction.entity_id || undefined,
        amount: transaction.amount,
        currency: transaction.currency || 'USD',
        status,
        reference: transaction.reference,
        createdByName: transaction.created_by
          ? (userNameCache[transaction.created_by] || 'Unknown')
          : 'System',
        createdById: transaction.created_by || '',
        isReversal: transaction.is_reversal || false,
        reversalOfTransactionId: transaction.reversal_of_transaction_id || null,
        role,
        chainRootId: rootOf(transaction),
      };
    };

    // Group every payment row by its chain root.
    const groupsMap = new Map<string, PaymentRow[]>();
    for (const transaction of paymentTx) {
      const row = mapToRow(transaction);
      if (!row) continue;
      const existing = groupsMap.get(row.chainRootId);
      if (existing) existing.push(row);
      else groupsMap.set(row.chainRootId, [row]);
    }

    const byDateAsc = (a: PaymentRow, b: PaymentRow) =>
      new Date(a.date).getTime() - new Date(b.date).getTime();

    // Collapse each chain to a head + its previous originals. Reversals never
    // reach this point (filtered above), so the only nested rows are the prior
    // ("original") payments that corrections replaced.
    const groups: PaymentGroup[] = [];
    for (const rows of groupsMap.values()) {
      const superseded = rows.filter(r => r.role === 'superseded');

      // The head is the chain's tail: the one row that wasn't superseded — active
      // when live, voided when the payment was deleted/canceled.
      const head = rows.find(r => r.role === 'active')
                || rows.find(r => r.role === 'voided')
                || rows.find(r => r.role !== 'superseded');
      if (!head) continue; // chain of only superseded rows — nothing live to show

      // Previous originals, oldest first → multiple correction cycles read
      // chronologically beneath the head.
      const nested = [...superseded].sort(byDateAsc);
      groups.push({ head, nested, correctionCount: superseded.length });
    }

    // Per-chain (head-level) filters.
    const searchLower = searchTerm.toLowerCase();
    const filtered = groups.filter(({ head }) => {
      // Default view shows only live (active) chains; corrected/voided/reversed
      // chains appear only when "show corrected & reversed" is on.
      if (!showCorrected && head.role !== 'active') return false;

      if (dateRange.start && head.date && new Date(head.date) < new Date(dateRange.start)) return false;
      if (dateRange.end && head.date && new Date(head.date) > new Date(dateRange.end)) return false;
      if (currencyFilter !== 'all' && head.currency !== currencyFilter) return false;

      if (searchTerm) {
        const matches = head.entityName.toLowerCase().includes(searchLower) ||
          head.reference?.toLowerCase().includes(searchLower) ||
          head.createdByName.toLowerCase().includes(searchLower);
        if (!matches) return false;
      }
      if (typeFilter !== 'all' && head.type !== typeFilter) return false;
      if (statusFilter !== 'all' && head.status !== statusFilter) return false;
      return true;
    });

    // Newest chain first (by head date).
    filtered.sort((a, b) => new Date(b.head.date).getTime() - new Date(a.head.date).getTime());

    return filtered;
  }, [transactions, entities, userNameCache, searchTerm, typeFilter, statusFilter, currencyFilter, dateRange, showCorrected]);

  // Pagination — one item per chain (the head row).
  const totalPages = Math.ceil(paymentGroups.length / ITEMS_PER_PAGE);
  const paginatedGroups = paymentGroups.slice(
    (currentPage - 1) * ITEMS_PER_PAGE,
    currentPage * ITEMS_PER_PAGE
  );

  // Reset page when filters change
  useEffect(() => {
    setCurrentPage(1);
  }, [searchTerm, typeFilter, statusFilter, currencyFilter, dateRange, showCorrected]);

  const clearFilters = () => {
    setSearchTerm('');
    setTypeFilter('all');
    setStatusFilter('all');
    setCurrencyFilter('all');
    setDateRange({ start: '', end: '' });
    setShowCorrected(false);
    setCurrentPage(1);
  };

  const hasActiveFilters = searchTerm || typeFilter !== 'all' || statusFilter !== 'all' ||
                          currencyFilter !== 'all' || dateRange.start || dateRange.end || showCorrected;

  // Expand/collapse a correction chain (keyed by its head id).
  const toggleGroup = (headId: string) => {
    setExpandedGroups(prev => {
      const next = new Set(prev);
      if (next.has(headId)) next.delete(headId);
      else next.add(headId);
      return next;
    });
  };

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

  // The original payment's direction — used to show the "direction changed" note
  // and detect a direction change on save. Memoized so it doesn't recompute on
  // every keystroke in the edit form.
  const editOriginalDirection = useMemo<'receive' | 'pay'>(() => {
    if (!editingPayment) return 'receive';
    const tx = transactions.find(t => t.id === editingPayment.id);
    return tx ? directionFromCategory(editingPayment.entityType, tx.category) : 'receive';
  }, [editingPayment, transactions]);

  const handleEditPayment = async (payment: PaymentRow) => {
    // Get the full transaction to populate form
    const transaction = transactions.find(t => t.id === payment.id);
    if (transaction) {
      // Show the description in the ACTIVE UI language — an Arabic UI must show
      // the Arabic text, not the English fallback (the read-only field would
      // otherwise read "Payment received from X" under an Arabic label).
      // getTranslatedString handles both plain-string (legacy) and
      // multilingual-object descriptions, falling back across languages when a
      // given translation is missing.
      const description = getTranslatedString(
        transaction.description as MultilingualString,
        language as SupportedLanguage
      );

      setEditForm({
        amount: transaction.amount.toString(),
        currency: transaction.currency || 'USD',
        description,
        reference: transaction.reference || '',
        entityId: transaction.entity_id || payment.entityId || '',
        direction: directionFromCategory(payment.entityType, transaction.category)
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
      // Description is read-only in the correction modal, so it can never change —
      // it is carried forward verbatim (see correctedDescription below) and is not
      // part of the change-detection or audit deltas.
      const entityChanged = (originalTransaction.entity_id || '') !== (editForm.entityId || '');

      // Direction edit: re-post the correction under the category that matches the
      // chosen direction (receive ⇆ pay). When the direction is unchanged we keep
      // the original category verbatim so an existing 'Customer Payment' row isn't
      // silently rewritten to a synonym category.
      const originalDirection = directionFromCategory(editingPayment.entityType, originalTransaction.category);
      const directionChanged = editForm.direction !== originalDirection;
      const correctedCategory = directionChanged
        ? categoryFromDirection(editingPayment.entityType, editForm.direction)
        : originalTransaction.category;

      if (!amountChanged && !currencyChanged && !entityChanged && !directionChanged) {
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

      // Step 2: Create new corrected transaction. The description is read-only in
      // the correction modal, so carry the original's (multilingual) description
      // object forward unchanged rather than flattening it to a single-language
      // string. createTransaction accepts string | MultilingualString.
      const correctedDescription = originalTransaction.description ||
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
        category: correctedCategory as any,
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
              correctionReason: 'Payment amount/currency/description/entity/direction corrected'
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
        if (entityChanged) auditChanges.push({ field: 'entity_id', old: originalTransaction.entity_id || null, new: editForm.entityId || null });
        if (directionChanged) auditChanges.push({ field: 'direction', old: originalDirection, new: editForm.direction });
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

  // A previous ("original") payment that a correction replaced, rendered beneath
  // its head when the chain is expanded. Dimmed + italic, indented with a ↳, with
  // an amber left-border accent. Carries no action buttons — it's history.
  const renderNested = (row: PaymentRow) => (
    <tr
      key={row.id}
      className="opacity-60 italic border-l-4 border-amber-400 bg-amber-50"
    >
      <td className="px-6 py-3 whitespace-nowrap text-sm text-gray-700">
        <div className="flex items-center gap-2 pl-6">
          <span className="text-gray-400">↳</span>
          <span>
            {new Date(row.date).toLocaleDateString()} {new Date(row.date).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
          </span>
        </div>
      </td>
      <td className="px-6 py-3 whitespace-nowrap">
        <span className="inline-flex px-2 py-1 text-xs font-semibold rounded-full bg-gray-100 text-gray-600">
          {t(getPaymentTypeTranslationKey(row.type)) || row.type} ({t('payments.original') || 'Original'})
        </span>
      </td>
      <td className="px-6 py-3 whitespace-nowrap">
        <div className="flex items-center">
          <User className="w-4 h-4 text-gray-400 mr-2" />
          <span className="text-sm text-gray-700">{row.entityName}</span>
          <span className="ml-2 text-xs text-gray-500">({entityTypeLabel(row.entityType)})</span>
        </div>
      </td>
      <td className="px-6 py-3 whitespace-nowrap">
        <span className="text-sm font-semibold text-gray-600">
          {formatCurrencyWithSymbol(row.amount, row.currency)}
        </span>
      </td>
      <td className="px-6 py-3 whitespace-nowrap">
        <span className="inline-flex px-2 py-1 text-xs font-semibold rounded-full bg-amber-100 text-amber-800">
          {t('payments.superseded') || 'Superseded'}
        </span>
      </td>
      <td className="px-6 py-3 whitespace-nowrap text-sm text-gray-500">
        {row.reference || '-'}
      </td>
      <td className="px-6 py-3 whitespace-nowrap text-sm text-gray-700">
        {row.createdByName}
      </td>
      <td className="px-6 py-3 whitespace-nowrap" />
    </tr>
  );

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
            {t('payments.paymentTransactions') || 'Payment Transactions'} ({paymentGroups.length})
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
                checked={showCorrected}
                onChange={(e) => setShowCorrected(e.target.checked)}
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
        {paginatedGroups.length === 0 ? (
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
                  {paginatedGroups.map((group) => {
                    const head = group.head;
                    const hasNested = group.nested.length > 0;
                    const isExpanded = expandedGroups.has(head.id);
                    // Chevron + nested rows only surface when corrections are
                    // revealed; the default view stays one clean row per chain.
                    const showChevron = showCorrected && hasNested;
                    const isHighlighted = highlightedPaymentId === head.id;
                    const isVoidedHead = head.role === 'voided';
                    return (
                    <React.Fragment key={head.id}>
                      {/* Head row — the live payment, or a voided/canceled tail */}
                      <tr
                        id={`payment-${head.id}`}
                        className={`${isVoidedHead ? 'bg-gray-50' : ''} ${
                          isHighlighted ? 'border-2 border-blue-400' : ''
                        }`}
                      >
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                          <div className="flex items-center gap-2">
                            {showChevron ? (
                              <button
                                onClick={() => toggleGroup(head.id)}
                                className="p-0.5 rounded hover:bg-gray-100 text-gray-500"
                                aria-expanded={isExpanded}
                                title={isExpanded ? (t('dashboard.collapse') || 'Collapse') : (t('dashboard.expand') || 'Expand')}
                              >
                                <ChevronRight className={`w-4 h-4 transition-transform ${isExpanded ? 'rotate-90' : ''}`} />
                              </button>
                            ) : (
                              <span className="inline-block w-5" />
                            )}
                            <span>
                              {new Date(head.date).toLocaleDateString()} {new Date(head.date).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                            </span>
                          </div>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap">
                          <div className="flex items-center gap-2">
                            <span className={`inline-flex px-2 py-1 text-xs font-semibold rounded-full ${
                              isVoidedHead ? 'bg-gray-100 text-gray-700' : 'bg-green-100 text-green-800'
                            }`}>
                              {t(getPaymentTypeTranslationKey(head.type)) || head.type}
                            </span>
                            {group.correctionCount > 0 && (
                              <span
                                className="inline-flex items-center px-2 py-0.5 text-xs font-medium rounded-full bg-amber-100 text-amber-800"
                                title={t('payments.correctedBadgeTitle') || 'This payment was corrected'}
                              >
                                ✎ {t('payments.corrected') || 'corrected'}{group.correctionCount > 1 ? ` ×${group.correctionCount}` : ''}
                              </span>
                            )}
                          </div>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap">
                          <div className="flex items-center">
                            <User className="w-4 h-4 text-gray-400 mr-2" />
                            <span className="text-sm text-gray-900">{head.entityName}</span>
                            <span className="ml-2 text-xs text-gray-500">({entityTypeLabel(head.entityType)})</span>
                          </div>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap">
                          <span className={`text-sm font-semibold ${
                            head.type === 'Customer Payment' ? 'text-green-600' : 'text-red-600'
                          }`}>
                            {formatCurrencyWithSymbol(head.amount, head.currency)}
                          </span>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap">
                          <span className={`inline-flex px-2 py-1 text-xs font-semibold rounded-full ${
                            head.status === 'completed'
                              ? 'bg-green-100 text-green-800'
                              : head.status === 'canceled'
                              ? 'bg-gray-100 text-gray-800'
                              : 'bg-red-100 text-red-800'
                          }`}>
                            {head.status === 'completed'
                              ? (t('payments.completed') || 'Completed')
                              : head.status === 'canceled'
                              ? (t('payments.canceled') || 'Canceled')
                              : (t('payments.reversed') || 'Reversed')}
                          </span>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                          {head.reference || '-'}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                          {head.createdByName}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm font-medium">
                          <div className="flex items-center gap-2">
                            {head.role === 'active' && (
                              <>
                                <button
                                  onClick={() => handleEditPayment(head)}
                                  className="text-blue-600 hover:text-blue-900 p-1 rounded hover:bg-blue-50"
                                  title={t('payments.editPayment') || 'Edit Payment'}
                                >
                                  <Edit className="w-4 h-4" />
                                </button>
                                <button
                                  onClick={() => handleDeletePayment(head)}
                                  className="text-red-600 hover:text-red-900 p-1 rounded hover:bg-red-50"
                                  title={t('payments.deletePayment') || 'Delete Payment'}
                                >
                                  <Trash2 className="w-4 h-4" />
                                </button>
                              </>
                            )}
                            {isVoidedHead && (
                              <span className="text-xs text-gray-500 italic">
                                {t('payments.paymentCanceled') || 'Payment Canceled'}
                              </span>
                            )}
                          </div>
                        </td>
                      </tr>
                      {/* Nested superseded originals + reversals (chronological) */}
                      {showCorrected && isExpanded && group.nested.map(renderNested)}
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
                  totalItems={paymentGroups.length}
                />
              </div>
            )}
          </>
        )}
      </div>

      {/* Edit Payment Modal — reuses the UnifiedPaymentModal in edit mode so the
          correction form matches the record-payment UI elsewhere in the app. */}
      {editingPayment && (
        <UnifiedPaymentModal
          isEditing
          entityType={editingPayment.entityType}
          editEntityOptions={editEntityOptions}
          selectedEntityId={editForm.entityId}
          onEntityChange={(id) => setEditForm(prev => ({ ...prev, entityId: id }))}
          originalEntityId={editingPayment.entityId || ''}
          // Direction is only editable for customer/supplier payments — employee
          // payments have no displayable "received" category, so the toggle is
          // hidden for them.
          allowDirectionEdit={editingPayment.entityType !== 'employee'}
          paymentDirection={editForm.direction}
          setPaymentDirection={(dir) => setEditForm(prev => ({ ...prev, direction: dir }))}
          originalDirection={editOriginalDirection}
          paymentForm={{
            amount: editForm.amount,
            currency: editForm.currency,
            description: editForm.description,
            reference: editForm.reference,
          }}
          setPaymentForm={(action) => setEditForm(prev => {
            const slice = {
              amount: prev.amount,
              currency: prev.currency,
              description: prev.description,
              reference: prev.reference,
            };
            const next = typeof action === 'function' ? action(slice) : action;
            return { ...prev, ...next };
          })}
          onSubmit={(e) => { e.preventDefault(); handleSaveEdit(); }}
          onClose={() => setEditingPayment(null)}
        />
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

