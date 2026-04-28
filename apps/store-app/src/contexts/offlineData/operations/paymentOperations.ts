/**
 * Payment operations (thinning OfflineDataContext §1.3).
 * processPayment, processEmployeePayment, processSupplierAdvance,
 * deleteSupplierAdvance, updateSupplierAdvance.
 */

import { getDB, createId } from '../../../lib/db';
import type { Transaction } from '../../../types';
import { transactionService } from '../../../services/transactionService';
import { journalService } from '../../../services/journalService';
import { reminderMonitoringService } from '../../../services/reminderMonitoringService';
import { BranchAccessValidationService } from '../../../services/branchAccessValidationService';
import { getAccountMapping, getJournalDescription } from '../../../utils/accountMapping';
import { getLocalDateString } from '../../../utils/dateUtils';
import { createMultilingualFromString, getTranslatedString } from '../../../utils/multilingual';
import { generatePaymentReference, generateAdvanceReference, generateReversalReference } from '@pos-platform/shared';
import type { CurrencyCode } from '@pos-platform/shared';
import { TRANSACTION_CATEGORIES } from '../../../constants/transactionCategories';
import type { CashDrawerAtomicResult } from './cashDrawerTransactionOperations';
import type { MultilingualString } from '../../../utils/multilingual';
import { withUndoOperation } from './withUndoOperation';

// ─── helper (used only in supplier advance functions) ──────────────────────
function getSupplierAdvanceBalances(supplier: any) {
  const supplierData = (supplier.supplier_data as any) || {};
  return {
    advance_lb_balance: supplierData.advance_lb_balance || 0,
    advance_usd_balance: supplierData.advance_usd_balance || 0
  };
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
  refreshData: () => Promise<void>;
  updateUnsyncedCount: () => Promise<void>;
  debouncedSync: () => void;
  i18n: { en: any; ar: any };
}

export interface ProcessEmployeePaymentDeps {
  storeId: string | null | undefined;
  currentBranchId: string | null;
  employees: any[];
  exchangeRate: number;
  refreshData: () => Promise<void>;
  updateUnsyncedCount: () => Promise<void>;
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
  refreshData: () => Promise<void>;
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
    const { currentBranchId, customers, suppliers, exchangeRate, createCashDrawerUndoData, pushUndo, refreshData, updateUnsyncedCount, debouncedSync, i18n } = deps;

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

    await withUndoOperation('operation', pushUndo, async () => {
      let result: any;

      if (isCustomer) {
        if (paymentDirection === 'receive') {
          result = await transactionService.createCustomerPayment(
            entityId, numAmount, currency, transactionDescription, context,
            { reference: reference || generatePaymentReference(), updateCashDrawer: true }
          );
        } else {
          result = await transactionService.createTransaction({
            category: TRANSACTION_CATEGORIES.CUSTOMER_REFUND,
            amount: numAmount, currency, description: transactionDescription,
            entityId, reference: reference || generatePaymentReference(),
            context, updateBalances: true, updateCashDrawer: true, createAuditLog: true, _synced: false
          });
        }
      } else {
        if (paymentDirection === 'pay') {
          result = await transactionService.createSupplierPayment(
            entityId, numAmount, currency, transactionDescription, context,
            { reference: reference || generatePaymentReference(), updateCashDrawer: true }
          );
        } else {
          result = await transactionService.createTransaction({
            category: TRANSACTION_CATEGORIES.SUPPLIER_REFUND,
            amount: numAmount, currency, description: transactionDescription,
            entityId, reference: reference || generatePaymentReference(),
            context, updateBalances: true, updateCashDrawer: true, createAuditLog: true, _synced: false
          });
        }
      }

      if (!result.success) {
        throw new Error(result.error || 'Payment processing failed');
      }
    });

    try { await refreshData(); } catch (e) { console.warn('Data refresh failed (non-critical):', e); }
    try { await updateUnsyncedCount(); } catch (e) { console.warn('Unsynced count refresh failed (non-critical):', e); }
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
    const { currentBranchId, employees, exchangeRate, refreshData, updateUnsyncedCount, debouncedSync, i18n, pushUndo } = deps;

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
    const amountPart = currency === 'USD' ? ` ($${numAmount.toFixed(2)} USD)` : '';
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
          reference: reference || generatePaymentReference(),
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
            cash_drawer_amount: currency === 'USD' ? numAmount * exchangeRate : numAmount,
            exchange_rate: currency === 'USD' ? exchangeRate : 1
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
          amountUSD: currency === 'USD' ? numAmount : 0,
          amountLBP: currency === 'LBP' ? numAmount : 0,
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

    try { await refreshData(); } catch (e) { console.warn('Data refresh failed (non-critical):', e); }
    try { await updateUnsyncedCount(); } catch (e) { console.warn('Unsynced count refresh failed (non-critical):', e); }
    try { debouncedSync(); } catch (e) { console.warn('Debounced sync failed (non-critical):', e); }

    return { success: true };
  } catch (error) {
    console.error('Employee payment processing failed:', error);
    return { success: false, error: error instanceof Error ? error.message : 'Employee payment processing failed' };
  }
}

// ─── processSupplierAdvance ──────────────────────────────────────────────────

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
  const {
    storeId, currentBranchId, userProfileId, userStoreId, suppliers, exchangeRate,
    createCashDrawerExpenseAtomic, createCashDrawerUndoData, pushUndo, refreshData
  } = deps;
  const { supplierId, amount, currency, type, description, reviewDate } = params;

  if (isNaN(amount) || amount <= 0) throw new Error('Please enter a valid positive amount');

  const supplier = suppliers.find(s => s.id === supplierId);
  if (!supplier) throw new Error('Supplier not found');

  const { advance_lb_balance: currentAdvanceLBP, advance_usd_balance: currentAdvanceUSD } = getSupplierAdvanceBalances(supplier);

  let newAdvanceBalance = 0;
  let updateData: any = {};

  if (currency === 'LBP') {
    newAdvanceBalance = type === 'give' ? currentAdvanceLBP + amount : currentAdvanceLBP - amount;
    if (newAdvanceBalance < 0) throw new Error('Cannot deduct more than the current advance balance');
    updateData.supplier_data = { ...(supplier.supplier_data as any || {}), advance_lb_balance: newAdvanceBalance };
  } else {
    newAdvanceBalance = type === 'give' ? currentAdvanceUSD + amount : currentAdvanceUSD - amount;
    if (newAdvanceBalance < 0) throw new Error('Cannot deduct more than the current advance balance');
    updateData.supplier_data = { ...(supplier.supplier_data as any || {}), advance_usd_balance: newAdvanceBalance };
  }

  const previousAdvanceLBP = currentAdvanceLBP;
  const previousAdvanceUSD = currentAdvanceUSD;

  let previousCashDrawerBalance: number | undefined;
  if (type === 'give') {
    previousCashDrawerBalance = await deps.getCurrentCashDrawerBalance(userStoreId || '');
  }

  const transactionId = createId();
  const now = new Date().toISOString();
  let cashDrawerResult: CashDrawerAtomicResult | null = null;
  let cashDrawerAccountId: string | undefined;

  await getDB().transaction('rw', [
    getDB().entities,
    getDB().transactions,
    getDB().journal_entries,
    getDB().chart_of_accounts,
    getDB().cash_drawer_sessions,
    getDB().cash_drawer_accounts
  ], async () => {
    await getDB().entities.update(supplierId, updateData);

    const transactionDescription: MultilingualString = createMultilingualFromString(
      `${description || `Supplier advance ${type === 'give' ? 'payment' : 'deduction'} - ${supplier.name}`}`
    );

    const advanceTransaction: Transaction = {
      id: transactionId,
      store_id: storeId!,
      branch_id: currentBranchId || '',
      type: type === 'give' ? 'expense' : 'income',
      category: type === 'give' ? TRANSACTION_CATEGORIES.SUPPLIER_ADVANCE_GIVEN : TRANSACTION_CATEGORIES.SUPPLIER_ADVANCE_DEDUCTED,
      amount,
      currency,
      description: transactionDescription,
      reference: generateAdvanceReference(),
      entity_id: supplierId,
      created_at: now,
      created_by: userProfileId || '',
      _synced: false,
      _deleted: false,
      is_reversal: false,
      reversal_of_transaction_id: null,
      metadata: {
        correlationId: createId(), source: 'offline', module: 'supplier_management',
        advanceType: type, reviewDate: params.reviewDate, previousAdvanceLBP, previousAdvanceUSD, newAdvanceBalance
      }
    };

    await getDB().transactions.add(advanceTransaction);

    const supplierEntity = await getDB().entities.get(supplierId);
    if (!supplierEntity) throw new Error('Supplier entity not found');

    const category = type === 'give' ? TRANSACTION_CATEGORIES.SUPPLIER_ADVANCE_GIVEN : TRANSACTION_CATEGORIES.SUPPLIER_ADVANCE_DEDUCTED;
    const accountMapping = getAccountMapping(category);
    const journalDesc = getJournalDescription(category, supplierEntity.name, transactionDescription);
    const postedDate = getLocalDateString(now);

    await journalService.createJournalEntry({
      transactionId,
      debitAccount: accountMapping.debitAccount,
      creditAccount: accountMapping.creditAccount,
      amount, currency,
      entityId: supplierId,
      description: journalDesc,
      postedDate,
      createdBy: userProfileId || '',
      branchId: currentBranchId || ''
    });

    if (type === 'give') {
      const amountInLBP = currency === 'USD' ? amount * exchangeRate : amount;
      cashDrawerResult = await createCashDrawerExpenseAtomic(
        amountInLBP, 'LBP',
        `Advance payment to ${supplier.name}${currency === 'USD' ? ` ($${amount.toFixed(2)} USD)` : ''}`,
        generateAdvanceReference(),
        supplierId
      );
      cashDrawerAccountId = cashDrawerResult.accountId || undefined;
    }
  });

  if (params.reviewDate && type === 'give') {
    try {
      await reminderMonitoringService.createReminder({
        store_id: userStoreId || '',
        branch_id: currentBranchId || '',
        type: 'supplier_advance_review',
        entity_type: 'supplier',
        entity_id: supplierId,
        entity_name: supplier.name,
        due_date: params.reviewDate,
        remind_before_days: [7, 3, 1, 0],
        status: 'pending',
        title: `Review Advance for ${supplier.name}`,
        description: `Review the ${currency === 'USD' ? `$${amount.toFixed(2)}` : `${Math.round(amount).toLocaleString()} ل.ل`} advance given to ${supplier.name}.`,
        priority: 'medium',
        action_url: '/accounting?tab=supplier-advances',
        metadata: { transaction_id: transactionId, supplier_id: supplierId, supplier_name: supplier.name, amount, currency, advance_date: params.date, advance_type: 'give' },
        created_by: userProfileId || ''
      });
    } catch (reminderError) {
      console.error('Error creating reminder:', reminderError);
    }
  }

  const baseUndoData = {
    affected: [{ table: 'entities', id: supplierId }, { table: 'transactions', id: transactionId }],
    steps: [
      { op: 'delete', table: 'transactions', id: transactionId },
      {
        op: 'update', table: 'entities', id: supplierId,
        changes: {
          supplier_data: {
            ...(supplier.supplier_data as any || {}),
            ...(currency === 'LBP' ? { advance_lb_balance: previousAdvanceLBP } : { advance_usd_balance: previousAdvanceUSD })
          },
          _synced: false
        }
      }
    ]
  };

  const undoData = type === 'give' && cashDrawerResult
    ? createCashDrawerUndoData((cashDrawerResult as CashDrawerAtomicResult).transactionId, previousCashDrawerBalance, cashDrawerAccountId, baseUndoData)
    : baseUndoData;

  pushUndo(undoData);
  await refreshData();
}

// ─── deleteSupplierAdvance ───────────────────────────────────────────────────

export async function deleteSupplierAdvance(
  deps: SupplierAdvanceDeps,
  transactionId: string
): Promise<void> {
  const {
    storeId, currentBranchId, userStoreId, suppliers, exchangeRate,
    createCashDrawerPaymentAtomic, createCashDrawerUndoData, pushUndo, refreshData
  } = deps;

  const transaction = await getDB().transactions.get(transactionId);
  if (!transaction) throw new Error('Transaction not found');
  if (transaction.category !== 'Supplier Advance') throw new Error('Can only delete Supplier Advance transactions from this module');
  if (!transaction.entity_id) throw new Error('Transaction missing entity ID');

  const supplier = suppliers.find(s => s.id === transaction.entity_id);
  if (!supplier) throw new Error('Supplier not found');

  const wasGiveAdvance = transaction.type === 'expense';
  const { advance_lb_balance: previousAdvanceLBP, advance_usd_balance: previousAdvanceUSD } = getSupplierAdvanceBalances(supplier);
  const { advance_lb_balance: currentAdvanceLBP, advance_usd_balance: currentAdvanceUSD } = getSupplierAdvanceBalances(supplier);
  let updateData: any = {};

  if (transaction.currency === 'LBP') {
    const newBalance = wasGiveAdvance ? currentAdvanceLBP - transaction.amount : currentAdvanceLBP + transaction.amount;
    if (newBalance < 0) throw new Error('Cannot delete: would result in negative advance balance');
    updateData.supplier_data = { ...(supplier.supplier_data as any || {}), advance_lb_balance: newBalance };
  } else {
    const newBalance = wasGiveAdvance ? currentAdvanceUSD - transaction.amount : currentAdvanceUSD + transaction.amount;
    if (newBalance < 0) throw new Error('Cannot delete: would result in negative advance balance');
    updateData.supplier_data = { ...(supplier.supplier_data as any || {}), advance_usd_balance: newBalance };
  }

  let previousCashDrawerBalance: number | undefined;
  if (wasGiveAdvance) {
    previousCashDrawerBalance = await deps.getCurrentCashDrawerBalance(userStoreId || '');
  }

  let cashDrawerResult: CashDrawerAtomicResult | null = null;
  let cashDrawerAccountId: string | undefined;

  await getDB().transaction('rw', [
    getDB().entities, getDB().transactions, getDB().journal_entries,
    getDB().chart_of_accounts, getDB().cash_drawer_sessions, getDB().cash_drawer_accounts
  ], async () => {
    await getDB().entities.update(transaction.entity_id!, updateData);
    await getDB().transactions.update(transactionId, { _deleted: true, _synced: false });

    if (wasGiveAdvance) {
      const amountInLBP = transaction.currency === 'USD' ? transaction.amount * exchangeRate : transaction.amount;
      cashDrawerResult = await createCashDrawerPaymentAtomic(
        amountInLBP, 'LBP',
        `Reversal: Deleted advance payment to ${supplier.name}`,
        generateReversalReference(),
        transaction.entity_id!
      );
      cashDrawerAccountId = cashDrawerResult.accountId || undefined;
    }
  });

  const baseUndoData = {
    affected: [
      { table: 'entities', id: transaction.entity_id! },
      { table: 'transactions', id: transactionId }
    ],
    steps: [
      { op: 'update', table: 'transactions', id: transactionId, changes: { _deleted: false, _synced: false } },
      {
        op: 'update', table: 'entities', id: transaction.entity_id!,
        changes: {
          supplier_data: {
            ...(supplier.supplier_data as any || {}),
            ...(transaction.currency === 'LBP' ? { advance_lb_balance: previousAdvanceLBP } : { advance_usd_balance: previousAdvanceUSD })
          },
          _synced: false
        }
      }
    ]
  };

  let undoData: any;
  if (wasGiveAdvance && cashDrawerResult) {
    const cdResult = cashDrawerResult as CashDrawerAtomicResult;
    undoData = {
      type: 'supplier_advance_delete',
      affected: [
        ...baseUndoData.affected,
        ...(cdResult.transactionId ? [{ table: 'transactions', id: cdResult.transactionId }] : []),
        ...(cashDrawerAccountId ? [{ table: 'cash_drawer_accounts', id: cashDrawerAccountId }] : [])
      ],
      steps: [
        ...baseUndoData.steps,
        ...(cdResult.transactionId ? [{ op: 'delete', table: 'transactions', id: cdResult.transactionId }] : []),
        ...(previousCashDrawerBalance !== undefined && cashDrawerAccountId ? [{
          op: 'update', table: 'cash_drawer_accounts', id: cashDrawerAccountId,
          changes: { current_balance: previousCashDrawerBalance, _synced: false }
        }] : [])
      ]
    };
  } else {
    undoData = baseUndoData;
  }

  pushUndo(undoData);
  await refreshData();
}

// ─── updateSupplierAdvance ───────────────────────────────────────────────────

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
  const {
    storeId, currentBranchId, userProfileId, userStoreId, suppliers, exchangeRate,
    processCashDrawerTransaction, getCurrentCashDrawerBalance, updateSupplier,
    pushUndo, refreshData
  } = deps;

  const oldTransaction = await getDB().transactions.get(transactionId);
  if (!oldTransaction) throw new Error('Transaction not found');
  if (oldTransaction.category !== 'Supplier Advance') throw new Error('Can only update Supplier Advance transactions');
  if (!(oldTransaction as any).supplier_id) throw new Error('Transaction missing supplier ID');
  if (isNaN(updates.amount) || updates.amount <= 0) throw new Error('Please enter a valid positive amount');

  const oldSupplier = suppliers.find(s => s.id === (oldTransaction as any).supplier_id);
  if (!oldSupplier) throw new Error('Old supplier not found');
  const newSupplier = suppliers.find(s => s.id === updates.supplierId);
  if (!newSupplier) throw new Error('New supplier not found');

  const oldWasGiveAdvance = oldTransaction.type === 'expense';
  const newIsGiveAdvance = updates.type === 'give';

  const { advance_lb_balance: oldPreviousAdvanceLBP, advance_usd_balance: oldPreviousAdvanceUSD } = getSupplierAdvanceBalances(oldSupplier);
  const newSupplierBalances = getSupplierAdvanceBalances(newSupplier);
  const newPreviousAdvanceLBP = updates.supplierId !== oldTransaction.entity_id ? newSupplierBalances.advance_lb_balance : oldPreviousAdvanceLBP;
  const newPreviousAdvanceUSD = updates.supplierId !== oldTransaction.entity_id ? newSupplierBalances.advance_usd_balance : oldPreviousAdvanceUSD;

  const { advance_lb_balance: oldCurrentAdvanceLBP, advance_usd_balance: oldCurrentAdvanceUSD } = getSupplierAdvanceBalances(oldSupplier);
  let oldReverseData: any = {};

  if (oldTransaction.currency === 'LBP') {
    const reversedBalance = oldWasGiveAdvance ? oldCurrentAdvanceLBP - oldTransaction.amount : oldCurrentAdvanceLBP + oldTransaction.amount;
    if (reversedBalance < 0) throw new Error('Cannot update: reversing old transaction would result in negative balance');
    oldReverseData.supplier_data = { ...(oldSupplier.supplier_data as any || {}), advance_lb_balance: reversedBalance };
  } else {
    const reversedBalance = oldWasGiveAdvance ? oldCurrentAdvanceUSD - oldTransaction.amount : oldCurrentAdvanceUSD + oldTransaction.amount;
    if (reversedBalance < 0) throw new Error('Cannot update: reversing old transaction would result in negative balance');
    oldReverseData.supplier_data = { ...(oldSupplier.supplier_data as any || {}), advance_usd_balance: reversedBalance };
  }

  let oldCashDrawerResult: any = null;
  let oldPreviousCashDrawerBalance: number | undefined;
  let oldCashDrawerAccountId: string | undefined;

  if (oldWasGiveAdvance) {
    const oldAmountInLBP = oldTransaction.currency === 'USD' ? oldTransaction.amount * exchangeRate : oldTransaction.amount;
    oldPreviousCashDrawerBalance = await getCurrentCashDrawerBalance(userStoreId || '');
    oldCashDrawerResult = await processCashDrawerTransaction({
      type: 'payment', amount: oldAmountInLBP, currency: 'LBP',
      description: 'payments.reversalUpdatedAdvancePayment',
      reference: generateReversalReference(),
      supplierId: oldTransaction.entity_id!,
      storeId: userStoreId || '',
      createdBy: userProfileId || '',
    });
    oldCashDrawerAccountId = oldCashDrawerResult?.accountId;
  }

  const supplierToUpdate = updates.supplierId === oldTransaction.entity_id
    ? { ...oldSupplier, ...oldReverseData }
    : newSupplier;

  const { advance_lb_balance: newCurrentAdvanceLBP, advance_usd_balance: newCurrentAdvanceUSD } = getSupplierAdvanceBalances(supplierToUpdate);
  let newUpdateData: any = {};

  if (updates.currency === 'LBP') {
    const newBalance = newIsGiveAdvance ? newCurrentAdvanceLBP + updates.amount : newCurrentAdvanceLBP - updates.amount;
    if (newBalance < 0) throw new Error('Cannot update: would result in negative advance balance');
    newUpdateData.supplier_data = { ...(supplierToUpdate.supplier_data as any || {}), advance_lb_balance: newBalance };
  } else {
    const newBalance = newIsGiveAdvance ? newCurrentAdvanceUSD + updates.amount : newCurrentAdvanceUSD - updates.amount;
    if (newBalance < 0) throw new Error('Cannot update: would result in negative advance balance');
    newUpdateData.supplier_data = { ...(supplierToUpdate.supplier_data as any || {}), advance_usd_balance: newBalance };
  }

  if (updates.supplierId !== oldTransaction.entity_id) {
    await updateSupplier(oldTransaction.entity_id!, oldReverseData);
  }
  await updateSupplier(updates.supplierId, newUpdateData);

  let newCashDrawerResult: any = null;
  let newPreviousCashDrawerBalance: number | undefined;
  let newCashDrawerAccountId: string | undefined;

  if (newIsGiveAdvance) {
    const newAmountInLBP = updates.currency === 'USD' ? updates.amount * exchangeRate : updates.amount;
    newPreviousCashDrawerBalance = await getCurrentCashDrawerBalance(userStoreId || '');
    newCashDrawerResult = await processCashDrawerTransaction({
      type: 'expense', amount: newAmountInLBP, currency: 'LBP',
      description: 'payments.advancePayment',
      reference: generateAdvanceReference(),
      supplierId: updates.supplierId,
      storeId: userStoreId || '',
      createdBy: userProfileId || '',
    });
    newCashDrawerAccountId = newCashDrawerResult?.accountId;
  }

  const transactionUpdate: any = {
    type: newIsGiveAdvance ? 'expense' : 'income',
    category: TRANSACTION_CATEGORIES.SUPPLIER_ADVANCE_GIVEN,
    amount: updates.amount,
    currency: updates.currency,
    description: updates.description || `payments.supplierAdvance`,
    supplier_id: updates.supplierId,
    created_at: updates.date,
    _synced: false,
  };

  const oldTransactionData = {
    type: oldTransaction.type,
    category: oldTransaction.category,
    amount: oldTransaction.amount,
    currency: oldTransaction.currency,
    description: oldTransaction.description,
    entity_id: oldTransaction.entity_id!,
    created_at: oldTransaction.created_at,
    _synced: oldTransaction._synced
  };

  await getDB().transactions.update(transactionId, transactionUpdate);

  const affectedTables: any[] = [
    { table: 'transactions', id: transactionId },
    { table: 'entities', id: oldTransaction.entity_id! }
  ];
  const undoSteps: any[] = [
    { op: 'update', table: 'transactions', id: transactionId, changes: oldTransactionData },
    {
      op: 'update', table: 'entities', id: oldTransaction.entity_id!,
      changes: {
        supplier_data: {
          ...(oldSupplier.supplier_data as any || {}),
          ...(oldTransaction.currency === 'LBP' ? { advance_lb_balance: oldPreviousAdvanceLBP } : { advance_usd_balance: oldPreviousAdvanceUSD })
        },
        _synced: false
      }
    }
  ];

  if (updates.supplierId !== oldTransaction.entity_id) {
    affectedTables.push({ table: 'entities', id: updates.supplierId });
    undoSteps.push({
      op: 'update', table: 'entities', id: updates.supplierId,
      changes: {
        supplier_data: {
          ...(newSupplier.supplier_data as any || {}),
          ...(updates.currency === 'LBP' ? { advance_lb_balance: newPreviousAdvanceLBP } : { advance_usd_balance: newPreviousAdvanceUSD })
        },
        _synced: false
      }
    });
  }

  const cashDrawerAccountId = oldCashDrawerAccountId || newCashDrawerAccountId;
  const previousCashDrawerBalance = oldWasGiveAdvance && oldCashDrawerResult
    ? oldPreviousCashDrawerBalance
    : (newIsGiveAdvance && newCashDrawerResult ? newPreviousCashDrawerBalance : undefined);

  let undoData: any;
  if ((oldWasGiveAdvance && oldCashDrawerResult) || (newIsGiveAdvance && newCashDrawerResult)) {
    const cashDrawerTransactionIds: string[] = [];
    if (oldCashDrawerResult?.transactionId) cashDrawerTransactionIds.push(oldCashDrawerResult.transactionId);
    if (newCashDrawerResult?.transactionId) cashDrawerTransactionIds.push(newCashDrawerResult.transactionId);

    undoData = {
      type: 'supplier_advance_update',
      affected: [
        ...affectedTables,
        ...(cashDrawerTransactionIds.map(id => ({ table: 'transactions', id }))),
        ...(cashDrawerAccountId ? [{ table: 'cash_drawer_accounts', id: cashDrawerAccountId }] : [])
      ],
      steps: [
        ...undoSteps,
        ...(cashDrawerTransactionIds.map(id => ({ op: 'delete', table: 'transactions', id }))),
        ...(previousCashDrawerBalance !== undefined && cashDrawerAccountId ? [{
          op: 'update', table: 'cash_drawer_accounts', id: cashDrawerAccountId,
          changes: { current_balance: previousCashDrawerBalance, _synced: false }
        }] : [])
      ]
    };
  } else {
    undoData = { type: 'supplier_advance_update', affected: affectedTables, steps: undoSteps };
  }

  pushUndo(undoData);
  await refreshData();
}
