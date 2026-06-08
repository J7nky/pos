/**
 * Payment operations (thinning OfflineDataContext §1.3).
 * processPayment, processEmployeePayment, processSupplierAdvance,
 * deleteSupplierAdvance, updateSupplierAdvance.
 */

import { getDB, createId } from '../../../lib/db';
import { transactionService } from '../../../services/transactionService';
import type { TransactionContext } from '../../../services/transactionService';
import { journalService } from '../../../services/journalService';
import { currencyService } from '../../../services/currencyService';
import { reminderMonitoringService } from '../../../services/reminderMonitoringService';
import { BranchAccessValidationService } from '../../../services/branchAccessValidationService';
import { auditService } from '../../../services/auditService';
import { getLocalDateString } from '../../../utils/dateUtils';
import { createMultilingualFromString, getTranslatedString } from '../../../utils/multilingual';
import { generatePaymentReference, generateAdvanceReference } from '@pos-platform/shared';
import type { CurrencyCode } from '@pos-platform/shared';
import { TRANSACTION_CATEGORIES } from '../../../constants/transactionCategories';
import type { CashDrawerAtomicResult } from './cashDrawerTransactionOperations';
import type { MultilingualString } from '../../../utils/multilingual';
import type { RefreshScope } from '../offlineDataContextContract';
import { withUndoOperation } from './withUndoOperation';

// ─── per-currency advance balance helpers ──────────────────────────────────

/**
 * Read the per-currency advance-balance map from a supplier's
 * `supplier_data` JSONB blob. Prefers the new `advance_balances` map and
 * falls back to legacy `advance_lb_balance` / `advance_usd_balance`
 * scalars when the map is empty (rows written before Tier 2).
 */
function getSupplierAdvanceBalanceMap(
  supplier: any
): Partial<Record<CurrencyCode, number>> {
  const supplierData = (supplier?.supplier_data as Record<string, unknown>) || {};
  const map = supplierData.advance_balances as Partial<Record<CurrencyCode, number>> | undefined;
  if (map && typeof map === 'object' && Object.keys(map).length > 0) return { ...map };

  const legacy: Partial<Record<CurrencyCode, number>> = {};
  const lbp = Number(supplierData.advance_lb_balance ?? 0) || 0;
  const usd = Number(supplierData.advance_usd_balance ?? 0) || 0;
  if (lbp !== 0) legacy.LBP = lbp;
  if (usd !== 0) legacy.USD = usd;
  return legacy;
}

/**
 * Build a `supplier_data` update object that mirrors the new map to the
 * legacy scalar fields so older readers keep working.
 */
function buildSupplierAdvanceUpdate(
  supplier: any,
  newAdvanceBalances: Partial<Record<CurrencyCode, number>>,
): Record<string, unknown> {
  const supplierData = (supplier?.supplier_data as Record<string, unknown>) || {};
  return {
    ...supplierData,
    advance_balances: newAdvanceBalances,
    advance_lb_balance: newAdvanceBalances.LBP ?? 0,
    advance_usd_balance: newAdvanceBalances.USD ?? 0,
  };
}

/**
 * Convert any source currency into the cash-drawer's canonical currency
 * for posting. Falls back to 1:1 when no rate is available (single-currency
 * stores).
 */
function toCashDrawerAmount(
  amount: number,
  fromCurrency: CurrencyCode,
  cashDrawerCurrency: CurrencyCode,
): number {
  if (fromCurrency === cashDrawerCurrency) return amount;
  return currencyService.safeConvert(amount, fromCurrency, cashDrawerCurrency);
}

// ─── Deps interfaces ────────────────────────────────────────────────────────

export interface ProcessPaymentDeps {
  currentBranchId: string | null;
  customers: any[];
  suppliers: any[];
  exchangeRate: number;
  createCashDrawerUndoData: (
    transactionId: string | undefined,
    previousBalance: number | undefined,
    accountId: string | undefined,
    additionalUndoData?: { affected: Array<{ table: string; id: string }>; steps: any[] }
  ) => any;
  pushUndo: (data: any) => void;
  refreshData: (scope?: RefreshScope) => Promise<void>;
  /** Surgically append the new payment transaction instead of reloading the whole table. */
  upsertTransactions: (rows: any[]) => void;
  updateUnsyncedCount: (optimisticDelta?: number) => Promise<void>;
  debouncedSync: () => void;
  i18n: { en: any; ar: any };
  /** Store's preferred UI language — used to localize audit summaries at write time. */
  language?: string;
}

export interface ProcessEmployeePaymentDeps {
  storeId: string | null | undefined;
  currentBranchId: string | null;
  employees: any[];
  exchangeRate: number;
  refreshData: (scope?: RefreshScope) => Promise<void>;
  /** Surgically append the new payment transaction instead of reloading the whole table. */
  upsertTransactions: (rows: any[]) => void;
  updateUnsyncedCount: (optimisticDelta?: number) => Promise<void>;
  debouncedSync: () => void;
  i18n: { en: any; ar: any };
  pushUndo: (action: any) => void;
}

export interface SupplierAdvanceDeps {
  storeId: string | null | undefined;
  currentBranchId: string | null;
  userProfileId: string | undefined;
  userStoreId: string | undefined;
  suppliers: any[];
  exchangeRate: number;
  createCashDrawerExpenseAtomic: (
    amount: number,
    currency: CurrencyCode,
    description: string,
    reference: string,
    supplierId: string | undefined
  ) => Promise<CashDrawerAtomicResult>;
  createCashDrawerPaymentAtomic: (
    amount: number,
    currency: CurrencyCode,
    description: string,
    reference: string,
    entityId: string | undefined
  ) => Promise<CashDrawerAtomicResult>;
  processCashDrawerTransaction: (data: any) => Promise<any>;
  getCurrentCashDrawerBalance: (storeId: string) => Promise<number>;
  updateSupplier: (id: string, updates: any) => Promise<void>;
  createCashDrawerUndoData: (
    transactionId: string | undefined,
    previousBalance: number | undefined,
    accountId: string | undefined,
    additionalUndoData?: { affected: Array<{ table: string; id: string }>; steps: any[] }
  ) => any;
  pushUndo: (data: any) => void;
  refreshData: (scope?: RefreshScope) => Promise<void>;
}

// ─── processPayment ─────────────────────────────────────────────────────────

export async function processPayment(
  deps: ProcessPaymentDeps,
  params: {
    entityType: 'customer' | 'supplier';
    entityId: string;
    amount: string;
    currency: CurrencyCode;
    description: string;
    reference: string;
    storeId: string;
    createdBy: string;
    paymentDirection: 'receive' | 'pay';
  }
): Promise<{ success: boolean; error?: string }> {
  try {
    const { entityType, entityId, amount, currency, description: _description, reference, storeId, createdBy, paymentDirection } = params;
    const { currentBranchId, customers, suppliers, exchangeRate, createCashDrawerUndoData, pushUndo, refreshData, upsertTransactions, updateUnsyncedCount, debouncedSync, i18n } = deps;

    if (!currentBranchId) {
      return { success: false, error: 'No branch selected. Please select a branch before processing payment.' };
    }

    try {
      await BranchAccessValidationService.validateBranchAccess(createdBy, storeId, currentBranchId);
    } catch (error) {
      return { success: false, error: error instanceof Error ? error.message : 'Access denied to this branch' };
    }

    const numAmount = parseFloat(amount);
    if (isNaN(numAmount) || numAmount <= 0) {
      return { success: false, error: 'Please enter a valid positive amount' };
    }

    const entity = entityType === 'customer'
      ? customers.find(c => c.id === entityId)
      : suppliers.find(s => s.id === entityId);

    if (!entity) {
      return { success: false, error: `${entityType.charAt(0).toUpperCase() + entityType.slice(1)} not found` };
    }

    const isCustomer = entityType === 'customer';

    // Resolve the payment reference once so the same number is used on the
    // transaction and on the audit row (powers the audit viewer's Reference
    // column / cross-navigation).
    const paymentRef = reference || generatePaymentReference();

    const transactionDescription: MultilingualString = {
      en: (paymentDirection === 'receive'
        ? i18n.en.payments?.paymentReceivedFrom
        : i18n.en.payments?.paymentSentTo)?.replace('{{entityName}}', entity.name) || `Payment ${paymentDirection === 'receive' ? 'received from' : 'sent to'} ${entity.name}`,
      ar: (paymentDirection === 'receive'
        ? i18n.ar.payments?.paymentReceivedFrom
        : i18n.ar.payments?.paymentSentTo)?.replace('{{entityName}}', entity.name) || `Payment ${paymentDirection === 'receive' ? 'received from' : 'sent to'} ${entity.name}`,
    };

    const context = {
      userId: createdBy,
      storeId,
      branchId: currentBranchId || '',
      module: 'payments' as const,
      source: 'web' as const
    };

    let paymentResult: any = null;
    await withUndoOperation('operation', pushUndo, async () => {
      let result: any;

      // skipCashDrawerImpact: this flow ignores the returned cashDrawerImpact, so
      // skip the O(history) all-1100-ledger scan. The cash-drawer session still
      // auto-opens (updateCashDrawer) and the 1100 journal entry is still posted.
      if (isCustomer) {
        if (paymentDirection === 'receive') {
          result = await transactionService.createCustomerPayment(
            entityId, numAmount, currency, transactionDescription, context,
            { reference: paymentRef, updateCashDrawer: true, skipCashDrawerImpact: true }
          );
        } else {
          result = await transactionService.createTransaction({
            category: TRANSACTION_CATEGORIES.CUSTOMER_REFUND,
            amount: numAmount, currency, description: transactionDescription,
            entityId, reference: paymentRef,
            context, updateBalances: true, updateCashDrawer: true, skipCashDrawerImpact: true, createAuditLog: true, _synced: false
          });
        }
      } else {
        if (paymentDirection === 'pay') {
          result = await transactionService.createSupplierPayment(
            entityId, numAmount, currency, transactionDescription, context,
            { reference: paymentRef, updateCashDrawer: true, skipCashDrawerImpact: true }
          );
        } else {
          result = await transactionService.createTransaction({
            category: TRANSACTION_CATEGORIES.SUPPLIER_REFUND,
            amount: numAmount, currency, description: transactionDescription,
            entityId, reference: paymentRef,
            context, updateBalances: true, updateCashDrawer: true, skipCashDrawerImpact: true, createAuditLog: true, _synced: false
          });
        }
      }

      if (!result.success) {
        throw new Error(result.error || 'Payment processing failed');
      }
      paymentResult = result;
    });

    // Localized business-action summary, e.g. "customer payment sent: 10 USD
    // (ابو احمد الفلسطيني)". Built in the store's language.
    const direction = paymentDirection === 'receive' ? 'received' : 'sent';
    const paymentDict: any = deps.language === 'ar' ? i18n?.ar : i18n?.en;
    const entityTypeLabel = paymentDict?.auditLog?.paymentSummary?.entityTypes?.[entityType] ?? entityType;
    const directionLabel = paymentDict?.auditLog?.paymentSummary?.directions?.[direction] ?? direction;
    const paymentTemplate = paymentDict?.auditLog?.paymentSummary?.entityPayment as string | undefined;
    // Bidi-isolate the name so an LTR name (e.g. "Ahmad Jank") embedded in an
    // RTL Arabic summary doesn't reorder the surrounding parentheses/segments.
    const isoName = `⁨${entity.name}⁩`;
    const paymentReason = paymentTemplate
      ? paymentTemplate
          .replace('{{entityType}}', entityTypeLabel)
          .replace('{{direction}}', directionLabel)
          .replace('{{amount}}', String(numAmount))
          .replace('{{currency}}', currency)
          .replace('{{name}}', isoName)
      : `${entityTypeLabel} payment ${direction}: **${numAmount} ${currency}** (${isoName})`;

    await auditService.record({
      storeId, branchId: currentBranchId, changedBy: createdBy,
      entityType: 'payment', entityId: paymentResult?.transactionId ?? entityId, action: 'create',
      changeReason: paymentReason,
      reference: paymentRef,
    });

    // The payment created exactly one transaction row. Surgically merge it into
    // state instead of reloading the whole transactions table (O(history) on
    // large stores). Cash-drawer status still refreshes; entity balances are
    // journal-derived independently and refreshed by the caller.
    try {
      const newTx = paymentResult?.transactionId
        ? await getDB().transactions.get(paymentResult.transactionId)
        : undefined;
      if (newTx) upsertTransactions([newTx]);
    } catch (e) { console.warn('Transaction upsert failed (non-critical):', e); }
    // Cash-drawer status recompute reads the whole 1100 ledger (O(history)) and
    // the drawer widget isn't on the payment screen — don't block on it. The
    // drawer view updates from context state when this resolves a beat later.
    void refreshData(['cashDrawer']).catch(e => console.warn('Cash drawer refresh failed (non-critical):', e));
    // The unsynced-count recount scans EVERY table (O(history)) — don't block on
    // it. Pass an optimistic +1 so the badge ticks up immediately; the background
    // recount then reconciles to the exact total.
    void updateUnsyncedCount(1).catch(e => console.warn('Unsynced count refresh failed (non-critical):', e));
    try { debouncedSync(); } catch (e) { console.warn('Debounced sync failed (non-critical):', e); }

    return { success: true };
  } catch (error) {
    console.error('Payment processing failed:', error);
    return { success: false, error: error instanceof Error ? error.message : 'Payment processing failed' };
  }
}

// ─── processEmployeePayment ─────────────────────────────────────────────────

export async function processEmployeePayment(
  deps: ProcessEmployeePaymentDeps,
  params: {
    employeeId: string;
    amount: string;
    currency: CurrencyCode;
    description: string;
    reference: string;
    storeId: string;
    createdBy: string;
  }
): Promise<{ success: boolean; error?: string }> {
  try {
    const { employeeId, amount, currency, description, reference, storeId, createdBy } = params;
    const { currentBranchId, employees, exchangeRate, refreshData, upsertTransactions, updateUnsyncedCount, debouncedSync, i18n, pushUndo } = deps;

    const numAmount = parseFloat(amount);
    if (isNaN(numAmount) || numAmount <= 0) {
      return { success: false, error: 'Please enter a valid positive amount' };
    }

    const employee = employees.find(e => e.id === employeeId);
    if (!employee) {
      return { success: false, error: 'Employee not found' };
    }

    const cashDrawerAccount = await getDB().getCashDrawerAccount(storeId, currentBranchId!);
    if (!cashDrawerAccount) {
      return { success: false, error: 'No cash drawer account found. Please create one before processing payments.' };
    }

    const descriptionPart = description ? `: ${description}` : '';
    const amountPart = ` (${currencyService.format(numAmount, currency)})`;
    const transactionDescription: MultilingualString = {
      en: i18n.en.payments?.employeePayment
        ?.replace('{{employeeName}}', employee.name)
        ?.replace('{{description}}', descriptionPart)
        ?.replace('{{amount}}', amountPart) || `Employee payment to ${employee.name}`,
      ar: i18n.ar.payments?.employeePayment
        ?.replace('{{employeeName}}', employee.name)
        ?.replace('{{description}}', descriptionPart)
        ?.replace('{{amount}}', amountPart) || `Employee payment to ${employee.name}`,
    };

    const transactionId = createId();
    const postedDate = getLocalDateString(new Date().toISOString());
    const employeeRef = reference || generatePaymentReference();

    await withUndoOperation('operation', pushUndo, async () => {
      await getDB().transaction('rw', [
        getDB().users,
        getDB().transactions,
        getDB().journal_entries,
        getDB().entities,
        getDB().chart_of_accounts,
        getDB().cash_drawer_accounts,
        getDB().cash_drawer_sessions
      ], async () => {
        let employeeEntity = await getDB().entities.get(employeeId);
        if (!employeeEntity) {
          const now = new Date().toISOString();
          const newEntity = {
            id: employeeId,
            store_id: storeId,
            branch_id: currentBranchId,
            entity_type: 'employee' as const,
            entity_code: `EMP-${employeeId.slice(0, 8).toUpperCase()}`,
            name: employee.name,
            phone: employee.phone || null,
            is_system_entity: false,
            is_active: true,
            customer_data: null,
            supplier_data: null,
            created_at: now,
            updated_at: now,
            _synced: false
          };
          await getDB().entities.add(newEntity);
          employeeEntity = newEntity;
        }

        const transactionRecord: any = {
          id: transactionId,
          store_id: storeId,
          type: 'expense' as const,
          category: TRANSACTION_CATEGORIES.EMPLOYEE_PAYMENT,
          amount: numAmount,
          currency,
          description: transactionDescription,
          reference: employeeRef,
          entity_id: employeeId,
          customer_id: null,
          supplier_id: null,
          employee_id: employeeId,
          created_by: createdBy,
          branch_id: currentBranchId || '',
          is_reversal: false,
          reversal_of_transaction_id: null,
          metadata: {
            payment_type: 'employee_salary',
            original_currency: currency,
            // Cash-drawer canonical currency is LBP in this code path —
            // convert non-LBP amounts to LBP for the metadata snapshot.
            cash_drawer_amount: toCashDrawerAmount(numAmount, currency, 'LBP'),
            exchange_rate: currency === 'LBP' ? 1 : exchangeRate
          },
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
          _synced: false
        };

        await getDB().transactions.add(transactionRecord);

        await journalService.createJournalEntry({
          transactionId,
          debitAccount: '2200',
          creditAccount: '1100',
          amount: numAmount,
          currency,
          entityId: employeeId,
          description: typeof transactionDescription === 'string'
            ? transactionDescription
            : getTranslatedString(transactionDescription, 'en', 'en'),
          postedDate,
          createdBy,
          branchId: currentBranchId!
        });
      });
    });

    await auditService.record({
      storeId, branchId: currentBranchId, changedBy: createdBy,
      entityType: 'payment', entityId: transactionId, action: 'create',
      changeReason: `Employee payment: ${numAmount} ${currency} to ${employee.name}`,
      reference: employeeRef,
    });

    // One transaction row was created (transactionId). Surgically merge it in
    // rather than reloading the whole transactions table; refresh the drawer.
    try {
      const newTx = await getDB().transactions.get(transactionId);
      if (newTx) upsertTransactions([newTx]);
    } catch (e) { console.warn('Transaction upsert failed (non-critical):', e); }
    // Both reads below are O(history) and feed off-screen widgets — fire and
    // forget so the payment returns immediately. Optimistic +1 ticks the badge
    // up at once; the recount reconciles. The drawer view updates from state.
    void refreshData(['cashDrawer']).catch(e => console.warn('Cash drawer refresh failed (non-critical):', e));
    void updateUnsyncedCount(1).catch(e => console.warn('Unsynced count refresh failed (non-critical):', e));
    try { debouncedSync(); } catch (e) { console.warn('Debounced sync failed (non-critical):', e); }

    return { success: true };
  } catch (error) {
    console.error('Employee payment processing failed:', error);
    return { success: false, error: error instanceof Error ? error.message : 'Employee payment processing failed' };
  }
}

// ─── Supplier advances ───────────────────────────────────────────────────────
//
// Advances post through the standard `transactionService` pipeline — exactly
// like every other payment — instead of hand-rolling a journal entry plus a
// separate cash-drawer expense. The old hand-rolled path double-credited cash
// (its own `C 1100` plus the cash-drawer expense's `C 1100`) and booked a
// phantom `5900` expense. Routing through `transactionService`:
//   • posts ONE balanced journal (give: `D 2100 / C 1100`, deduct: the reverse)
//     so the advance nets into the supplier's Accounts-Payable balance and shows
//     on their account statement;
//   • moves the cash drawer once;
//   • gives correct reversal for delete/edit via `deleteTransaction`.
//
// The per-supplier `advance_balances` sub-ledger (which powers the Advances tab
// stat cards) is still maintained alongside the journal.

const ADVANCE_CATEGORIES: string[] = [
  TRANSACTION_CATEGORIES.SUPPLIER_ADVANCE_GIVEN,
  TRANSACTION_CATEGORIES.SUPPLIER_ADVANCE_DEDUCTED,
];

function isAdvanceTransaction(t: { category?: string } | null | undefined): boolean {
  return !!t && ADVANCE_CATEGORIES.includes(t.category as string);
}

function advanceContext(deps: SupplierAdvanceDeps): TransactionContext {
  return {
    userId: deps.userProfileId || '',
    storeId: deps.storeId || '',
    branchId: deps.currentBranchId || '',
    module: 'payments',
    source: 'offline',
  };
}

export async function processSupplierAdvance(
  deps: SupplierAdvanceDeps,
  params: {
    supplierId: string;
    amount: number;
    currency: CurrencyCode;
    type: 'give' | 'deduct';
    description: string;
    date: string;
    reviewDate?: string;
  }
): Promise<void> {
  const { storeId, currentBranchId, userProfileId, userStoreId, suppliers, updateSupplier, pushUndo, refreshData } = deps;
  const { supplierId, amount, currency, type, description, reviewDate } = params;

  if (isNaN(amount) || amount <= 0) throw new Error('Please enter a valid positive amount');

  const supplier = suppliers.find(s => s.id === supplierId);
  if (!supplier) throw new Error('Supplier not found');

  // Advance sub-ledger (Advances tab): give increases, deduct decreases.
  const previousAdvanceMap = getSupplierAdvanceBalanceMap(supplier);
  const currentInCurrency = previousAdvanceMap[currency] ?? 0;
  const newAdvanceBalance = type === 'give' ? currentInCurrency + amount : currentInCurrency - amount;
  if (newAdvanceBalance < 0) throw new Error('Cannot deduct more than the current advance balance');
  const newAdvanceMap: Partial<Record<CurrencyCode, number>> = { ...previousAdvanceMap, [currency]: newAdvanceBalance };

  const category = type === 'give'
    ? TRANSACTION_CATEGORIES.SUPPLIER_ADVANCE_GIVEN
    : TRANSACTION_CATEGORIES.SUPPLIER_ADVANCE_DEDUCTED;
  const advanceRef = generateAdvanceReference();
  const transactionDescription: MultilingualString = createMultilingualFromString(
    description || `Supplier advance ${type === 'give' ? 'payment' : 'deduction'} - ${supplier.name}`
  );

  let transactionId: string | undefined;
  await withUndoOperation('operation', pushUndo, async () => {
    const result = await transactionService.createTransaction({
      category,
      amount,
      currency,
      description: transactionDescription,
      entityId: supplierId,
      reference: advanceRef,
      context: advanceContext(deps),
      metadata: { source: 'offline', module: 'supplier_management', advanceType: type, reviewDate },
      updateBalances: true,
      updateCashDrawer: true,
      createAuditLog: false,
      _synced: false,
    });
    if (!result.success || !result.transactionId) {
      throw new Error(result.error || 'Failed to process supplier advance');
    }
    transactionId = result.transactionId;

    // Maintain the advance sub-ledger within the same undo session.
    await updateSupplier(supplierId, { supplier_data: buildSupplierAdvanceUpdate(supplier, newAdvanceMap) });
  });

  // Optional review reminder (give only).
  if (reviewDate && type === 'give') {
    try {
      await reminderMonitoringService.createReminder({
        store_id: userStoreId || '',
        branch_id: currentBranchId || '',
        type: 'supplier_advance_review',
        entity_type: 'supplier',
        entity_id: supplierId,
        entity_name: supplier.name,
        due_date: reviewDate,
        remind_before_days: [7, 3, 1, 0],
        status: 'pending',
        title: `Review Advance for ${supplier.name}`,
        description: `Review the ${currencyService.format(amount, currency)} advance given to ${supplier.name}.`,
        priority: 'medium',
        action_url: '/accounting?tab=supplier-advances',
        metadata: { transaction_id: transactionId, supplier_id: supplierId, supplier_name: supplier.name, amount, currency, advance_date: params.date, advance_type: 'give' },
        created_by: userProfileId || ''
      });
    } catch (reminderError) {
      console.error('Error creating reminder:', reminderError);
    }
  }

  await auditService.record({
    storeId, branchId: currentBranchId, changedBy: userProfileId,
    entityType: 'payment', entityId: transactionId ?? supplierId, action: 'create',
    changeReason: `Supplier advance ${type === 'give' ? 'given' : 'deducted'}: ${amount} ${currency} (${supplier.name})`,
    reference: advanceRef,
  });

  // Advances post to transactions + cash drawer AND mutate the supplier's
  // supplier_data.advance_balances (shown on the Advances tab) → reload entities.
  await refreshData(['transactions', 'cashDrawer', 'entities']);
}

// ─── deleteSupplierAdvance ───────────────────────────────────────────────────

export async function deleteSupplierAdvance(
  deps: SupplierAdvanceDeps,
  transactionId: string
): Promise<void> {
  const { storeId, currentBranchId, userProfileId, suppliers, updateSupplier, pushUndo, refreshData } = deps;

  const transaction = await getDB().transactions.get(transactionId);
  if (!transaction) throw new Error('Transaction not found');
  if (!isAdvanceTransaction(transaction)) throw new Error('Can only delete Supplier Advance transactions from this module');
  if (!transaction.entity_id) throw new Error('Transaction missing entity ID');

  const supplier = suppliers.find(s => s.id === transaction.entity_id);
  if (!supplier) throw new Error('Supplier not found');

  const wasGiveAdvance = transaction.category === TRANSACTION_CATEGORIES.SUPPLIER_ADVANCE_GIVEN;
  const txCurrency = transaction.currency as CurrencyCode;
  const previousAdvanceMap = getSupplierAdvanceBalanceMap(supplier);
  const currentInCurrency = previousAdvanceMap[txCurrency] ?? 0;
  const newBalanceForCurrency = wasGiveAdvance
    ? currentInCurrency - transaction.amount
    : currentInCurrency + transaction.amount;
  if (newBalanceForCurrency < 0) throw new Error('Cannot delete: would result in negative advance balance');
  const newAdvanceMap: Partial<Record<CurrencyCode, number>> = { ...previousAdvanceMap, [txCurrency]: newBalanceForCurrency };

  await withUndoOperation('operation', pushUndo, async () => {
    // Reverses the journal (and cash-drawer impact) and marks the transaction deleted.
    const result = await transactionService.deleteTransaction(transactionId, advanceContext(deps));
    if (!result.success) throw new Error(result.error || 'Failed to delete supplier advance');

    await updateSupplier(transaction.entity_id!, { supplier_data: buildSupplierAdvanceUpdate(supplier, newAdvanceMap) });
  });

  await auditService.record({
    storeId, branchId: currentBranchId, changedBy: userProfileId,
    entityType: 'payment', entityId: transactionId, action: 'delete',
    changeReason: `Supplier advance deleted: ${transaction.amount} ${txCurrency} (${supplier.name})`,
    reference: transaction.reference ?? null,
  });

  // Advances post to transactions + cash drawer AND mutate the supplier's
  // supplier_data.advance_balances (shown on the Advances tab) → reload entities.
  await refreshData(['transactions', 'cashDrawer', 'entities']);
}

// ─── updateSupplierAdvance ───────────────────────────────────────────────────
//
// Reverse-and-repost: reverse the original advance (delete) and post a fresh one
// with the new values. This keeps the journal, cash drawer, and supplier balance
// all consistent without trying to mutate a posted journal entry in place.

export async function updateSupplierAdvance(
  deps: SupplierAdvanceDeps,
  transactionId: string,
  updates: {
    supplierId: string;
    amount: number;
    currency: CurrencyCode;
    type: 'give' | 'deduct';
    description: string;
    date: string;
    reviewDate?: string;
  }
): Promise<void> {
  const { storeId, currentBranchId, userProfileId, suppliers, updateSupplier, pushUndo, refreshData } = deps;

  const oldTransaction = await getDB().transactions.get(transactionId);
  if (!oldTransaction) throw new Error('Transaction not found');
  if (!isAdvanceTransaction(oldTransaction)) throw new Error('Can only update Supplier Advance transactions');
  if (!oldTransaction.entity_id) throw new Error('Transaction missing entity ID');
  if (isNaN(updates.amount) || updates.amount <= 0) throw new Error('Please enter a valid positive amount');

  const oldSupplier = suppliers.find(s => s.id === oldTransaction.entity_id);
  if (!oldSupplier) throw new Error('Old supplier not found');
  const newSupplier = suppliers.find(s => s.id === updates.supplierId);
  if (!newSupplier) throw new Error('New supplier not found');

  const oldWasGiveAdvance = oldTransaction.category === TRANSACTION_CATEGORIES.SUPPLIER_ADVANCE_GIVEN;
  const oldTxCurrency = oldTransaction.currency as CurrencyCode;
  const sameSupplier = updates.supplierId === oldTransaction.entity_id;

  // Reverse the OLD advance in the sub-ledger.
  const oldAdvanceMap = getSupplierAdvanceBalanceMap(oldSupplier);
  const oldCurrent = oldAdvanceMap[oldTxCurrency] ?? 0;
  const reversedOldBalance = oldWasGiveAdvance ? oldCurrent - oldTransaction.amount : oldCurrent + oldTransaction.amount;
  if (reversedOldBalance < 0) throw new Error('Cannot update: reversing old advance would result in negative balance');
  const reversedOldMap: Partial<Record<CurrencyCode, number>> = { ...oldAdvanceMap, [oldTxCurrency]: reversedOldBalance };

  // Post the NEW advance in the sub-ledger. When the supplier is unchanged we
  // stack the new amount on top of the reversed map so a same-supplier edit
  // nets correctly.
  const baseNewMap = sameSupplier ? reversedOldMap : getSupplierAdvanceBalanceMap(newSupplier);
  const newIsGiveAdvance = updates.type === 'give';
  const newCurrent = baseNewMap[updates.currency] ?? 0;
  const newBalance = newIsGiveAdvance ? newCurrent + updates.amount : newCurrent - updates.amount;
  if (newBalance < 0) throw new Error('Cannot update: would result in negative advance balance');
  const newMap: Partial<Record<CurrencyCode, number>> = { ...baseNewMap, [updates.currency]: newBalance };

  const newCategory = newIsGiveAdvance
    ? TRANSACTION_CATEGORIES.SUPPLIER_ADVANCE_GIVEN
    : TRANSACTION_CATEGORIES.SUPPLIER_ADVANCE_DEDUCTED;
  const newRef = oldTransaction.reference || generateAdvanceReference();
  const transactionDescription: MultilingualString = createMultilingualFromString(
    updates.description || `Supplier advance ${newIsGiveAdvance ? 'payment' : 'deduction'} - ${newSupplier.name}`
  );

  let newTransactionId: string | undefined;
  await withUndoOperation('operation', pushUndo, async () => {
    // 1. Reverse the original transaction's ledger + cash-drawer impact.
    const delResult = await transactionService.deleteTransaction(transactionId, advanceContext(deps));
    if (!delResult.success) throw new Error(delResult.error || 'Failed to reverse original advance');

    // 2. Post the new advance.
    const createResult = await transactionService.createTransaction({
      category: newCategory,
      amount: updates.amount,
      currency: updates.currency,
      description: transactionDescription,
      entityId: updates.supplierId,
      reference: newRef,
      context: advanceContext(deps),
      metadata: { source: 'offline', module: 'supplier_management', advanceType: updates.type, reviewDate: updates.reviewDate, replaces_transaction_id: transactionId },
      updateBalances: true,
      updateCashDrawer: true,
      createAuditLog: false,
      _synced: false,
    });
    if (!createResult.success || !createResult.transactionId) {
      throw new Error(createResult.error || 'Failed to post updated advance');
    }
    newTransactionId = createResult.transactionId;

    // 3. Sub-ledger: when switching suppliers, reverse the old one first.
    if (!sameSupplier) {
      await updateSupplier(oldTransaction.entity_id!, { supplier_data: buildSupplierAdvanceUpdate(oldSupplier, reversedOldMap) });
    }
    await updateSupplier(updates.supplierId, { supplier_data: buildSupplierAdvanceUpdate(sameSupplier ? oldSupplier : newSupplier, newMap) });
  });

  const advanceChanges = auditService.diff(
    { amount: oldTransaction.amount, currency: oldTxCurrency, type: oldWasGiveAdvance ? 'give' : 'deduct', supplier: oldSupplier.name },
    { amount: updates.amount, currency: updates.currency, type: updates.type, supplier: newSupplier.name },
    ['amount', 'currency', 'type', 'supplier']
  );
  await auditService.record({
    storeId, branchId: currentBranchId, changedBy: userProfileId,
    entityType: 'payment', entityId: newTransactionId ?? transactionId, action: 'update',
    changes: advanceChanges,
    changeReason: `Supplier advance updated (${newSupplier.name})`,
    reference: newRef,
  });

  // Advances post to transactions + cash drawer AND mutate the supplier's
  // supplier_data.advance_balances (shown on the Advances tab) → reload entities.
  await refreshData(['transactions', 'cashDrawer', 'entities']);
}
