/**
 * Bill operations (thinning OfflineDataContext).
 * createBill, updateBill, deleteBill, reactivateBill with audit logs, undo, and sync callbacks.
 */

import { getDB, createId } from '../../../lib/db';
import type { Transaction } from '../../../types';
import { getLocalDateString } from '../../../utils/dateUtils';
import { getFiscalPeriodForDate } from '../../../utils/fiscalPeriod';
import { TRANSACTION_CATEGORIES } from '../../../constants/transactionCategories';
import { BranchAccessValidationService } from '../../../services/branchAccessValidationService';
import { receivedBillMonitoringService } from '../../../services/receivedBillMonitoringService';
import { journalService } from '../../../services/journalService';
import { validateBillCreation } from '../../../services/businessValidationService';
import type { CashDrawerAtomicResult } from './cashDrawerTransactionOperations';
import type { MultilingualString } from '../../../utils/multilingual';

export interface BillUpdateDeleteDeps {
  storeId: string | null | undefined;
  currentBranchId: string | null;
  pushUndo: (undoData: any) => void;
  refreshData: () => Promise<void>;
  updateUnsyncedCount: () => Promise<void>;
  resetAutoSyncTimer: () => void;
  debouncedSync: () => void;
}

export interface BillCreateDeps {
  storeId: string | null | undefined;
  currentBranchId: string | null;
  userProfileId: string | undefined;
  currency: 'USD' | 'LBP';
  pushUndo: (undoData: any) => void;
  refreshData: () => Promise<void>;
  updateUnsyncedCount: () => Promise<void>;
  resetAutoSyncTimer: () => void;
  debouncedSync: () => void;
  createCashDrawerTransactionAtomic: (
    amount: number,
    currency: 'USD' | 'LBP',
    description: string,
    reference: string,
    customerId: string | undefined,
    billNumber: string
  ) => Promise<CashDrawerAtomicResult>;
  createCashDrawerUndoData: (
    transactionId: string | undefined,
    previousBalance: number | undefined,
    accountId: string | undefined,
    additionalUndoData?: {
      affected: Array<{ table: string; id: string }>;
      steps: Array<{ op: string; table: string; id: string; changes?: any }>;
    }
  ) => any;
  refreshCashDrawerStatus: () => Promise<void>;
}

export interface BillReactivateDeps {
  storeId: string | null | undefined;
  currentBranchId: string | null;
  userProfileId: string | undefined;
  pushUndo: (undoData: any) => void;
  refreshData: () => Promise<void>;
  updateUnsyncedCount: () => Promise<void>;
  debouncedSync: () => void;
}

export async function updateBill(
  deps: BillUpdateDeleteDeps,
  billId: string,
  updates: any,
  changedBy: string,
  changeReason?: string
): Promise<void> {
  const { storeId, currentBranchId, pushUndo, refreshData, updateUnsyncedCount, resetAutoSyncTimer, debouncedSync } = deps;
  if (!storeId) throw new Error('No store ID available');

  const originalBill = await getDB().bills.get(billId);
  if (!originalBill) throw new Error('Bill not found');

  if (!originalBill.branch_id) {
    throw new Error('Bill does not have a branch assigned');
  }

  try {
    await BranchAccessValidationService.validateBranchAccess(changedBy, storeId, originalBill.branch_id);
  } catch (error) {
    throw new Error(error instanceof Error ? error.message : 'Access denied to this branch');
  }

  const now = new Date().toISOString();
  const auditLogs: any[] = [];
  const auditLogIds: string[] = [];

  await getDB().transaction('rw', [getDB().bills, getDB().bill_audit_logs, getDB().entities], async () => {
    await getDB().bills.update(billId, {
      ...updates,
      updated_at: now,
      _synced: false,
    });

    for (const [field, newValue] of Object.entries(updates)) {
      if (field !== '_synced' && field !== 'updated_at') {
        const oldValue = (originalBill as any)[field];
        if (oldValue !== newValue) {
          let oldValueDisplay = oldValue != null ? String(oldValue) : 'empty';
          let newValueDisplay = newValue != null ? String(newValue) : 'empty';

          if (field === 'customer_id') {
            if (oldValue) {
              const oldEntity = await getDB().entities.get(oldValue);
              oldValueDisplay = oldEntity?.name || oldValue;
            } else {
              oldValueDisplay = 'Walk-in Customer';
            }
            if (newValue) {
              const newEntity = await getDB().entities.get(newValue);
              newValueDisplay = newEntity?.name || (newValue as string);
            } else {
              newValueDisplay = 'Walk-in Customer';
            }
          }

          if (
            field === 'total_amount' ||
            field === 'amount_paid' ||
            field === 'amount_due' ||
            field === 'subtotal' ||
            field === 'tax_amount' ||
            field === 'discount_amount'
          ) {
            if (oldValue != null) oldValueDisplay = Number(oldValue).toLocaleString();
            if (newValue != null) newValueDisplay = Number(newValue).toLocaleString();
          }

          const fieldLabel = field.replace(/_/g, ' ').replace(/\b\w/g, (l: string) => l.toUpperCase());
          const generatedReason = changeReason || `Updating ${fieldLabel} from ${oldValueDisplay} to ${newValueDisplay}`;
          const auditLogId = createId();
          auditLogIds.push(auditLogId);

          const auditLog = {
            id: auditLogId,
            bill_id: billId,
            store_id: storeId,
            action: 'updated' as const,
            field_changed: field,
            old_value: oldValueDisplay !== 'empty' ? oldValueDisplay : null,
            new_value: newValueDisplay !== 'empty' ? newValueDisplay : null,
            change_reason: generatedReason,
            changed_by: changedBy,
            ip_address: null,
            user_agent: null,
            created_at: now,
            updated_at: now,
            branch_id: currentBranchId || '',
            _synced: false,
          };

          auditLogs.push(auditLog);
          await getDB().bill_audit_logs.add(auditLog);
        }
      }
    }
  });

  const undoChanges: any = {};
  for (const key of Object.keys(updates)) {
    if (key !== '_synced' && key !== 'updated_at') {
      undoChanges[key] = (originalBill as any)[key];
    }
  }

  pushUndo({
    type: 'update_bill',
    affected: [{ table: 'bills', id: billId }, ...auditLogIds.map((id) => ({ table: 'bill_audit_logs', id }))],
    steps: [
      { op: 'update', table: 'bills', id: billId, changes: undoChanges },
      ...auditLogIds.map((id) => ({ op: 'delete', table: 'bill_audit_logs', id })),
    ],
  });

  await refreshData();
  await updateUnsyncedCount();
  resetAutoSyncTimer();
  debouncedSync();
}

export async function deleteBill(
  deps: BillUpdateDeleteDeps,
  billId: string,
  deletedBy: string,
  deleteReason?: string
): Promise<void> {
  const { storeId, currentBranchId, pushUndo, refreshData, updateUnsyncedCount, debouncedSync } = deps;
  if (!storeId) throw new Error('No store ID available');

  const now = new Date().toISOString();
  const auditLogId = createId();

  const bill = await getDB().bills.get(billId);
  if (!bill) throw new Error('Bill not found');

  const lineItems = await getDB().bill_line_items.where('bill_id').equals(billId).toArray();

  const allBillTransactions = await getDB().transactions
    .where('store_id')
    .equals(storeId)
    .filter((t: any) => {
      const matchesReference =
        t.reference === bill.bill_number ||
        t.reference === `BILL-${bill.bill_number}` ||
        (bill.bill_number.startsWith('BILL-') && t.reference === bill.bill_number.replace('BILL-', ''));
      return Boolean(matchesReference && !t.is_reversal && !t._deleted);
    })
    .toArray();

  const transactionIds = allBillTransactions.map((t: any) => t.id);
  const allJournalEntries =
    transactionIds.length > 0
      ? await getDB().journal_entries
          .where('transaction_id')
          .anyOf(transactionIds)
          .and((e: any) => {
            const isOriginal = !e.entry_type || e.entry_type === 'original';
            return e.is_posted === true && isOriginal;
          })
          .toArray()
      : [];

  const entriesByTransaction = new Map<string, any[]>();
  for (const entry of allJournalEntries) {
    if (!entriesByTransaction.has(entry.transaction_id)) {
      entriesByTransaction.set(entry.transaction_id, []);
    }
    entriesByTransaction.get(entry.transaction_id)!.push(entry);
  }

  const billTransactions = allBillTransactions.filter((t: any) => {
    const entries = entriesByTransaction.get(t.id) || [];
    return entries.length > 0 && entries.some((e: any) => !e.entry_type || e.entry_type === 'original');
  });

  const journalEntries = allJournalEntries.filter((e: any) =>
    billTransactions.some((t: any) => t.id === e.transaction_id)
  );

  await getDB().transaction(
    'rw',
    [
      getDB().bills,
      getDB().bill_line_items,
      getDB().bill_audit_logs,
      getDB().journal_entries,
      getDB().transactions,
      getDB().inventory_items,
    ],
    async () => {
      await getDB().bills.update(billId, {
        status: 'cancelled',
        updated_at: now,
        last_modified_by: deletedBy,
        _synced: false,
      });

      const reversalTransactionId = createId();
      const postedDate = getLocalDateString(now);
      const fiscalPeriod = getFiscalPeriodForDate(now).period;

      const createReversalJournalEntries = (
        entries: any[],
        transactionId: string,
        includeCashDrawer: boolean = true
      ): any[] => {
        const reversalEntries: any[] = [];
        for (const entry of entries) {
          if (!includeCashDrawer && entry.account_code === '1100') continue;
          reversalEntries.push({
            id: createId(),
            store_id: entry.store_id,
            branch_id: entry.branch_id,
            transaction_id: transactionId,
            account_code: entry.account_code,
            account_name: entry.account_name,
            entity_id: entry.entity_id,
            entity_type: entry.entity_type,
            debit_usd: entry.credit_usd,
            credit_usd: entry.debit_usd,
            debit_lbp: entry.credit_lbp,
            credit_lbp: entry.debit_lbp,
            description: `payments.billCancellation`,
            posted_date: postedDate,
            fiscal_period: fiscalPeriod,
            is_posted: true,
            created_by: deletedBy,
            created_at: now,
            _synced: false,
            bill_id: billId,
            entry_type: 'reversal' as const,
            reversal_of_journal_entry_id: entry.id,
          });
        }
        return reversalEntries;
      };

      const nonCashEntries = journalEntries.filter((e: any) => e.account_code !== '1100');
      const reversalEntries = createReversalJournalEntries(nonCashEntries, reversalTransactionId, false);
      if (reversalEntries.length > 0) {
        await getDB().journal_entries.bulkAdd(reversalEntries);
      }

      if ((bill.payment_method === 'cash' || bill.payment_method === 'card') && bill.amount_paid > 0) {
        try {
          const cashTransaction = billTransactions.find((t: any) => t.category === TRANSACTION_CATEGORIES.CASH_DRAWER_SALE);
          if (cashTransaction?.id) {
            const cashReversalTransactionId = createId();
            const reversalTransaction: Transaction = {
              id: cashReversalTransactionId,
              store_id: storeId,
              branch_id: currentBranchId || '',
              type: 'expense',
              category: TRANSACTION_CATEGORIES.CASH_DRAWER_EXPENSE,
              amount: bill.amount_paid,
              currency: 'LBP',
              description: `payments.billCancellationRefund`,
              reference: bill.bill_number,
              entity_id: cashTransaction.entity_id || null,
              created_at: now,
              created_by: deletedBy,
              _synced: false,
              _deleted: false,
              is_reversal: true,
              reversal_of_transaction_id: cashTransaction.id,
              metadata: { correlationId: createId(), source: 'offline', module: 'billing' },
            };
            await getDB().transactions.add(reversalTransaction);
            const cashJournalEntries = journalEntries.filter((e: any) => e.account_code === '1100');
            const cashReversalEntries = createReversalJournalEntries(cashJournalEntries, cashReversalTransactionId, true);
            if (cashReversalEntries.length > 0) {
              await getDB().journal_entries.bulkAdd(cashReversalEntries);
            }
          }
        } catch (error) {
          console.error('❌ Error reversing cash drawer transaction:', error);
        }
      }

      for (const lineItem of lineItems) {
        if (lineItem.inventory_item_id) {
          const inventoryItem = await getDB().inventory_items.get(lineItem.inventory_item_id);
          if (inventoryItem) {
            await getDB().inventory_items.update(lineItem.inventory_item_id, {
              quantity: inventoryItem.quantity + lineItem.quantity,
              _synced: false,
            });
          }
        }
      }

      const generatedReason = bill ? `Deleting bill #${bill.bill_number} (cancelled)` : `Deleting bill (cancelled)`;
      await getDB().bill_audit_logs.add({
        id: auditLogId,
        bill_id: billId,
        store_id: storeId,
        action: 'deleted' as const,
        field_changed: 'status',
        old_value: bill?.status || 'active',
        new_value: 'cancelled',
        change_reason: deleteReason || generatedReason,
        changed_by: deletedBy,
        ip_address: null,
        user_agent: null,
        created_at: now,
        updated_at: now,
        branch_id: currentBranchId || '',
        _synced: false,
      });
    }
  );

  const undoSteps: any[] = [];
  const affectedRecords: any[] = [
    { table: 'bills', id: billId },
    { table: 'bill_audit_logs', id: auditLogId },
  ];
  undoSteps.push({ op: 'update', table: 'bills', id: billId, changes: { status: bill.status, _synced: false } });
  for (const item of lineItems) {
    affectedRecords.push({ table: 'bill_line_items', id: item.id });
  }
  undoSteps.push({ op: 'delete', table: 'bill_audit_logs', id: auditLogId });

  pushUndo({ type: 'delete_bill', affected: affectedRecords, steps: undoSteps });

  await refreshData();
  await updateUnsyncedCount();
  debouncedSync();
}

export async function createBill(
  deps: BillCreateDeps,
  billData: any,
  lineItems: any[],
  customerBalanceUpdate?: { customerId: string; amountDue: number; originalBalance: number },
  i18n?: { en: any; ar: any }
): Promise<string> {
  const {
    storeId,
    currentBranchId,
    userProfileId,
    currency,
    pushUndo,
    refreshData,
    updateUnsyncedCount,
    resetAutoSyncTimer,
    debouncedSync,
    createCashDrawerTransactionAtomic,
    createCashDrawerUndoData,
    refreshCashDrawerStatus,
  } = deps;

  if (!storeId) throw new Error('No store ID available');
  if (!userProfileId) throw new Error('No user ID available - user not authenticated');
  if (!currentBranchId) throw new Error('No branch selected. Please select a branch before creating a bill.');

  // Pre-write validation via centralized businessValidationService
  const bvsResult = await validateBillCreation({
    requiresSupplier: billData.bill_type === 'credit_purchase' || billData.bill_type === 'cash_purchase',
    supplierId: billData.entity_id ?? null,
    lineItems,
  });
  if (!bvsResult.isValid) {
    const first = bvsResult.violations[0];
    throw new Error(first?.message ?? 'Bill validation failed');
  }

  // Validate branch access before creating bill
  try {
    await BranchAccessValidationService.validateBranchAccess(userProfileId, storeId, currentBranchId);
  } catch (error) {
    throw new Error(error instanceof Error ? error.message : 'Access denied to this branch');
  }

  const billId = createId();
  const now = new Date().toISOString();

  // Ensure bill data is clean and doesn't contain line item fields
  const cleanBillData = { ...billData };
  const lineItemFields = ['inventory_item_id', 'product_id', 'supplier_id', 'quantity', 'unit_price', 'line_total', 'weight', 'line_order'];
  lineItemFields.forEach(field => {
    if (cleanBillData[field] !== undefined) {
      delete cleanBillData[field];
    }
  });

  // Pre-fetch entity for credit sales to avoid nested transactions
  let preFetchedEntity = null;
  let entityType: 'customer' | 'supplier' | 'employee' | null = null;
  let debitAccountInfo = null;
  let creditAccountInfo = null;

  if (customerBalanceUpdate && customerBalanceUpdate.amountDue > 0) {
    preFetchedEntity = await getDB().entities.get(customerBalanceUpdate.customerId);
    if (!preFetchedEntity || !['customer', 'supplier', 'employee'].includes(preFetchedEntity.entity_type)) {
      throw new Error('Invalid entity for balance update');
    }
    entityType = preFetchedEntity.entity_type as 'customer' | 'supplier' | 'employee';

    const debitAccountCode = (entityType === 'customer' || entityType === 'employee') ? '1200' : '2100';
    const creditAccountCode = '4100';

    const { accountingInitService } = await import('../../../services/accountingInitService');
    [debitAccountInfo, creditAccountInfo] = await Promise.all([
      accountingInitService.getAccount(storeId, debitAccountCode),
      accountingInitService.getAccount(storeId, creditAccountCode)
    ]);

    if (!debitAccountInfo || !creditAccountInfo) {
      throw new Error(`Invalid account codes: ${debitAccountCode} or ${creditAccountCode}. Please ensure chart of accounts is initialized.`);
    }
  }

  const billDataWithEntity = { ...cleanBillData };
  if (customerBalanceUpdate) {
    billDataWithEntity.entity_id = customerBalanceUpdate.customerId;
  } else {
    billDataWithEntity.entity_id = null;
  }

  const bill = {
    id: billId,
    store_id: storeId,
    branch_id: currentBranchId,
    created_at: now,
    updated_at: now,
    _synced: false,
    ...billDataWithEntity
  };

  const mappedLineItems = lineItems.map(item => ({
    id: createId(),
    bill_id: billId,
    store_id: storeId,
    created_at: now,
    updated_at: now,
    _synced: false,
    _deleted: false,
    ...item
  }));

  // Store inventory states for undo
  const inventoryStates: Array<{ id: string; originalQuantity: number }> = [];
  let creditSaleTransactionId: string | null = null;
  let cashDrawerTransactionId: string | null = null;
  let cashDrawerResult: CashDrawerAtomicResult | null = null;

  await getDB().transaction('rw', [
    getDB().bills,
    getDB().bill_line_items,
    getDB().inventory_items,
    getDB().entities,
    getDB().transactions,
    getDB().journal_entries,
    getDB().chart_of_accounts,
    getDB().bill_audit_logs,
    getDB().cash_drawer_sessions,
    getDB().cash_drawer_accounts
  ], async () => {
    await getDB().bills.add(bill);
    if (mappedLineItems.length > 0) {
      await getDB().bill_line_items.bulkAdd(mappedLineItems);
    }

    // Create audit log
    const generatedReason = `Creating bill #${bill.bill_number} with total amount ${bill.total_amount || 0}`;
    await getDB().bill_audit_logs.add({
      id: createId(),
      branch_id: currentBranchId || '',
      store_id: storeId,
      bill_id: billId,
      action: 'created',
      field_changed: null,
      old_value: null,
      new_value: JSON.stringify(bill),
      change_reason: generatedReason,
      changed_by: userProfileId,
      ip_address: null,
      user_agent: null,
      created_at: now,
      updated_at: now,
      _synced: false
    });

    // Deduct inventory quantities
    const itemsWithInventoryId = mappedLineItems.filter(item => item.inventory_item_id);
    if (itemsWithInventoryId.length > 0) {
      const inventoryIds = itemsWithInventoryId.map(item => item.inventory_item_id!);
      const inventoryItems = await getDB().inventory_items.bulkGet(inventoryIds);
      const inventoryMap = new Map(inventoryItems
        .filter((item): item is NonNullable<typeof item> => item !== undefined)
        .map(item => [item.id, item])
      );

      const inventoryUpdatesToSave: any[] = [];
      for (const item of itemsWithInventoryId) {
        const inventoryItem = inventoryMap.get(item.inventory_item_id!);
        if (inventoryItem && inventoryItem.quantity >= item.quantity) {
          inventoryStates.push({ id: item.inventory_item_id!, originalQuantity: inventoryItem.quantity });
          const newQuantity = Math.max(0, inventoryItem.quantity - item.quantity);
          inventoryUpdatesToSave.push({ ...inventoryItem, quantity: newQuantity, _synced: false });
        }
      }
      if (inventoryUpdatesToSave.length > 0) {
        await getDB().inventory_items.bulkPut(inventoryUpdatesToSave);
      }
    }

    // Process items without inventory_item_id (FIFO fallback)
    for (const item of mappedLineItems) {
      if (!item.inventory_item_id && item.product_id) {
        const inventoryRecords = await getDB().inventory_items
          .where('product_id')
          .equals(item.product_id)
          .and(inv => inv.quantity > 0)
          .sortBy('received_at');

        let qtyToDeduct = item.quantity || 1;
        for (const inv of inventoryRecords) {
          if (qtyToDeduct <= 0) break;
          inventoryStates.push({ id: inv.id, originalQuantity: inv.quantity });
          const deduct = Math.min(inv.quantity, qtyToDeduct);
          const newQuantity = inv.quantity - deduct;
          await getDB().inventory_items.update(inv.id, { quantity: Math.max(0, newQuantity), _synced: false });
          qtyToDeduct -= deduct;
        }
      }
    }

    // Handle credit sale transaction
    if (customerBalanceUpdate && customerBalanceUpdate.amountDue > 0 && preFetchedEntity && entityType) {
      const transactionId = createId();
      creditSaleTransactionId = transactionId;

      const enLocale = i18n?.en;
      const arLocale = i18n?.ar;

      let creditSaleDescription: MultilingualString;
      if (enLocale && arLocale) {
        const templateEn = entityType === 'customer'
          ? enLocale.payments?.creditSaleDescriptionCustomer
          : entityType === 'supplier'
            ? enLocale.payments?.creditSaleDescriptionSupplier
            : enLocale.payments?.creditSaleDescriptionCustomer;
        const templateAr = entityType === 'customer'
          ? arLocale.payments?.creditSaleDescriptionCustomer
          : entityType === 'supplier'
            ? arLocale.payments?.creditSaleDescriptionSupplier
            : arLocale.payments?.creditSaleDescriptionCustomer;
        creditSaleDescription = {
          en: templateEn?.replace('{{billNumber}}', bill.bill_number) || `Credit sale - Bill ${bill.bill_number}`,
          ar: templateAr?.replace('{{billNumber}}', bill.bill_number) || `Credit sale - Bill ${bill.bill_number}`,
        };
      } else {
        creditSaleDescription = {
          en: `Credit sale - Bill ${bill.bill_number}`,
          ar: `Credit sale - Bill ${bill.bill_number}`,
        };
      }

      const category = entityType === 'customer'
        ? TRANSACTION_CATEGORIES.CUSTOMER_CREDIT_SALE
        : entityType === 'supplier'
          ? TRANSACTION_CATEGORIES.SUPPLIER_CREDIT_SALE
          : TRANSACTION_CATEGORIES.CUSTOMER_CREDIT_SALE;

      const creditSaleTransaction: Transaction = {
        id: transactionId,
        store_id: storeId,
        branch_id: currentBranchId,
        type: 'income',
        category,
        amount: customerBalanceUpdate.amountDue,
        currency,
        description: creditSaleDescription,
        reference: bill.bill_number,
        entity_id: customerBalanceUpdate.customerId,
        created_at: now,
        created_by: userProfileId,
        _synced: false,
        _deleted: false,
        is_reversal: false,
        reversal_of_transaction_id: null,
        metadata: { correlationId: createId(), source: 'offline', module: 'billing' }
      };

      await getDB().transactions.add(creditSaleTransaction);

      const postedDate = getLocalDateString(now);
      const fiscalPeriod = getFiscalPeriodForDate(now).period;
      const debitAccountCode = (entityType === 'customer' || entityType === 'employee') ? '1200' : '2100';
      const creditAccountCode = '4100';

      const isUSD = currency === 'USD';
      const debitEntry = {
        id: createId(),
        store_id: storeId,
        branch_id: currentBranchId,
        transaction_id: transactionId,
        account_code: debitAccountCode,
        account_name: debitAccountInfo!.account_name,
        entity_id: customerBalanceUpdate.customerId,
        entity_type: entityType,
        debit_usd: isUSD ? customerBalanceUpdate.amountDue : 0,
        credit_usd: 0,
        debit_lbp: !isUSD ? customerBalanceUpdate.amountDue : 0,
        credit_lbp: 0,
        description: 'payments.creditSaleBill',
        posted_date: postedDate,
        fiscal_period: fiscalPeriod,
        is_posted: true,
        created_by: userProfileId,
        created_at: now,
        _synced: false,
        bill_id: billId,
        entry_type: 'original' as const
      };

      const creditEntry = {
        id: createId(),
        store_id: storeId,
        branch_id: currentBranchId,
        transaction_id: transactionId,
        account_code: creditAccountCode,
        account_name: creditAccountInfo!.account_name,
        entity_id: customerBalanceUpdate.customerId,
        entity_type: entityType,
        debit_usd: 0,
        credit_usd: isUSD ? customerBalanceUpdate.amountDue : 0,
        debit_lbp: 0,
        credit_lbp: !isUSD ? customerBalanceUpdate.amountDue : 0,
        description: 'payments.creditSaleBill',
        posted_date: postedDate,
        fiscal_period: fiscalPeriod,
        is_posted: true,
        created_by: userProfileId,
        created_at: now,
        _synced: false,
        bill_id: billId,
        entry_type: 'original' as const
      };

      await getDB().journal_entries.bulkAdd([debitEntry, creditEntry]);
    }

    // Process cash drawer transaction for cash sales
    if (bill.payment_method === 'cash') {
      try {
        const totalCashAmount = bill.amount_paid || bill.total_amount || 0;
        cashDrawerResult = await createCashDrawerTransactionAtomic(
          totalCashAmount,
          'LBP',
          `Cash sale - Bill ${bill.bill_number}`,
          bill.bill_number,
          undefined,
          bill.bill_number
        );
        cashDrawerTransactionId = cashDrawerResult.transactionId;

        const cashJournalEntries = await getDB().journal_entries
          .where('transaction_id')
          .equals(cashDrawerTransactionId)
          .toArray();

        for (const entry of cashJournalEntries) {
          await getDB().journal_entries.update(entry.id, { bill_id: billId, entry_type: 'original' });
        }
      } catch (error) {
        console.error('Error creating cash drawer transaction:', error);
        throw error;
      }
    }
  });

  // Store undo data
  const baseUndoData = {
    affected: [
      { table: 'bills', id: billId },
      ...mappedLineItems.map(item => ({ table: 'bill_line_items', id: item.id })),
      ...inventoryStates.map(state => ({ table: 'inventory_items', id: state.id })),
      ...(customerBalanceUpdate && creditSaleTransactionId ? [
        { table: 'entities', id: customerBalanceUpdate.customerId },
        { table: 'transactions', id: creditSaleTransactionId }
      ] : []),
      ...(cashDrawerTransactionId ? [
        { table: 'transactions', id: cashDrawerTransactionId },
        { table: 'cash_drawer_accounts', id: cashDrawerResult?.accountId || '' }
      ] : [])
    ],
    steps: [
      { op: 'delete', table: 'bills', id: billId },
      ...mappedLineItems.map(item => ({ op: 'delete', table: 'bill_line_items', id: item.id })),
      ...inventoryStates.map(state => ({
        op: 'update',
        table: 'inventory_items',
        id: state.id,
        changes: { quantity: state.originalQuantity, _synced: false }
      })),
      ...(customerBalanceUpdate && creditSaleTransactionId ? [
        { op: 'delete', table: 'transactions', id: creditSaleTransactionId },
        { op: 'delete', table: 'journal_entries', transaction_id: creditSaleTransactionId, id: `journal-entries-credit-${billId}` }
      ] : []),
      ...(cashDrawerTransactionId ? [
        { op: 'delete', table: 'transactions', id: cashDrawerTransactionId },
        { op: 'delete', table: 'journal_entries', transaction_id: cashDrawerTransactionId, id: `journal-entries-cash-${billId}` }
      ] : [])
    ]
  };

  const undoData = cashDrawerResult
    ? createCashDrawerUndoData(cashDrawerResult.transactionId, cashDrawerResult.previousBalance, cashDrawerResult.accountId, baseUndoData)
    : { type: 'complete_checkout', ...baseUndoData };

  pushUndo(undoData);

  // Notify cash drawer update
  if (cashDrawerResult && cashDrawerTransactionId) {
    try {
      const { cashDrawerUpdateService } = await import('../../../services/cashDrawerUpdateService');
      cashDrawerUpdateService.notifyCashDrawerUpdate(storeId, cashDrawerResult.newBalance, cashDrawerTransactionId);
    } catch (error) {
      console.warn('Failed to notify cash drawer update:', error);
    }
  }

  await refreshData();
  await refreshCashDrawerStatus();
  await updateUnsyncedCount();
  resetAutoSyncTimer();
  debouncedSync();

  // Check bill completion for inventory items
  for (const item of mappedLineItems) {
    if (item.inventory_item_id) {
      receivedBillMonitoringService.checkBillAfterSale(storeId, item.inventory_item_id).catch(err => {
        console.error('Error checking bill completion:', err);
      });
    }
  }

  return billId;
}

export async function reactivateBill(
  deps: BillReactivateDeps,
  billId: string,
  reactivatedBy: string,
  reactivationReason?: string
): Promise<void> {
  const { storeId, currentBranchId, userProfileId, pushUndo, refreshData, updateUnsyncedCount, debouncedSync } = deps;
  if (!storeId) throw new Error('No store ID available');

  const now = new Date().toISOString();
  const auditLogId = createId();

  const bill = await getDB().bills.get(billId);
  if (!bill) throw new Error('Bill not found');
  if (bill.status !== 'cancelled') {
    throw new Error('Bill is not cancelled. Only cancelled bills can be reactivated.');
  }

  const lineItems = await getDB().bill_line_items.where('bill_id').equals(billId).toArray();

  // Find original transactions
  const originalTransactions = await getDB().transactions
    .where('store_id')
    .equals(storeId)
    .filter(t => {
      const matchesBill = t.reference === bill.bill_number ||
        t.reference === `BILL-${bill.bill_number}` ||
        (bill.bill_number.startsWith('BILL-') && t.reference === bill.bill_number.replace('BILL-', ''));
      return matchesBill && !t.is_reversal && !t._deleted;
    })
    .toArray();

  const originalTransactionIds = originalTransactions.map(t => t.id);
  const reversalTransactions = originalTransactionIds.length > 0
    ? await getDB().transactions
      .where('reversal_of_transaction_id')
      .anyOf(originalTransactionIds)
      .and(t => !t._deleted)
      .toArray()
    : [];

  const reversalTransactionIds = reversalTransactions.map(t => t.id);
  const reversalJournalEntries = reversalTransactionIds.length > 0
    ? await getDB().journal_entries
      .where('transaction_id')
      .anyOf(reversalTransactionIds)
      .and(e => e.is_posted === true && e.entry_type === 'reversal')
      .toArray()
    : [];

  const cashReversalTransaction = reversalTransactions.find(t =>
    t.category === TRANSACTION_CATEGORIES.CASH_DRAWER_EXPENSE
  ) || null;

  await getDB().transaction('rw', [
    getDB().bills,
    getDB().bill_line_items,
    getDB().bill_audit_logs,
    getDB().journal_entries,
    getDB().transactions,
    getDB().inventory_items
  ], async () => {
    await getDB().bills.update(billId, {
      status: 'active',
      updated_at: now,
      last_modified_by: reactivatedBy,
      _synced: false
    });

    const reactivationTransactionId = createId();
    const postedDate = getLocalDateString(now);
    const fiscalPeriod = getFiscalPeriodForDate(now).period;

    const createReactivationJournalEntries = (entries: any[], transactionId: string, includeCashDrawer: boolean = true): any[] => {
      const reactivationEntries: any[] = [];
      for (const reversalEntry of entries) {
        if (!includeCashDrawer && reversalEntry.account_code === '1100') continue;
        reactivationEntries.push({
          id: createId(),
          store_id: reversalEntry.store_id,
          branch_id: reversalEntry.branch_id,
          transaction_id: transactionId,
          account_code: reversalEntry.account_code,
          account_name: reversalEntry.account_name,
          entity_id: reversalEntry.entity_id,
          entity_type: reversalEntry.entity_type,
          debit_usd: reversalEntry.credit_usd,
          credit_usd: reversalEntry.debit_usd,
          debit_lbp: reversalEntry.credit_lbp,
          credit_lbp: reversalEntry.debit_lbp,
          description: 'payments.billReactivation',
          posted_date: postedDate,
          fiscal_period: fiscalPeriod,
          is_posted: true,
          created_by: reactivatedBy,
          created_at: now,
          _synced: false,
          bill_id: billId,
          entry_type: 'reactivation' as const,
          reversal_of_journal_entry_id: reversalEntry.id
        });
      }
      return reactivationEntries;
    };

    const nonCashReversalEntries = reversalJournalEntries.filter(e => e.account_code !== '1100');
    const reactivationEntries = createReactivationJournalEntries(nonCashReversalEntries, reactivationTransactionId, false);
    if (reactivationEntries.length > 0) {
      await getDB().journal_entries.bulkAdd(reactivationEntries);
    }

    // Restore cash drawer for cash/card payments
    if ((bill.payment_method === 'cash' || bill.payment_method === 'card') && bill.amount_paid > 0) {
      try {
        if (cashReversalTransaction) {
          const cashRestorationTransactionId = createId();
          const restorationTransaction: Transaction = {
            id: cashRestorationTransactionId,
            store_id: storeId,
            branch_id: currentBranchId || '',
            type: 'income',
            category: TRANSACTION_CATEGORIES.CASH_DRAWER_SALE,
            amount: bill.amount_paid,
            currency: 'LBP',
            description: 'payments.billReactivation',
            reference: bill.bill_number,
            entity_id: cashReversalTransaction.entity_id || null,
            created_at: now,
            created_by: reactivatedBy,
            _synced: false,
            _deleted: false,
            is_reversal: false,
            reversal_of_transaction_id: null,
            metadata: { correlationId: createId(), source: 'offline', module: 'billing' }
          };

          await getDB().transactions.add(restorationTransaction);

          const cashReversalEntries = reversalJournalEntries.filter(e => e.account_code === '1100');
          const cashReactivationEntries = createReactivationJournalEntries(cashReversalEntries, cashRestorationTransactionId, true);
          if (cashReactivationEntries.length > 0) {
            await getDB().journal_entries.bulkAdd(cashReactivationEntries);
          }
        }
      } catch (error) {
        console.error('Error restoring cash drawer transaction:', error);
      }
    }

    // Re-deduct inventory quantities
    for (const lineItem of lineItems) {
      if (lineItem.inventory_item_id) {
        const inventoryItem = await getDB().inventory_items.get(lineItem.inventory_item_id);
        if (inventoryItem) {
          await getDB().inventory_items.update(lineItem.inventory_item_id, {
            quantity: Math.max(0, inventoryItem.quantity - lineItem.quantity),
            _synced: false
          });
        }
      }
    }

    // Create audit log
    const generatedReason = reactivationReason || `Reactivating bill #${bill.bill_number} - restoring accounting effects`;
    const auditLog = {
      id: auditLogId,
      bill_id: billId,
      store_id: storeId,
      action: 'updated' as const,
      field_changed: 'status',
      old_value: 'cancelled',
      new_value: 'active',
      change_reason: generatedReason,
      changed_by: reactivatedBy,
      ip_address: null,
      user_agent: null,
      created_at: now,
      updated_at: now,
      branch_id: currentBranchId || '',
      _synced: false
    };

    await getDB().bill_audit_logs.add(auditLog);
  });

  await refreshData();
  await updateUnsyncedCount();
  debouncedSync();
}
