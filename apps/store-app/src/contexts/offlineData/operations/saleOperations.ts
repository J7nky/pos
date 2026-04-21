/**
 * Sale operations (thinning OfflineDataContext).
 * updateSale, deleteSale — handle bill_line_items and inventory quantity adjustments.
 * addSale was removed (dead code — all sales go through createBill).
 */

import { getDB, createId } from '../../../lib/db';
import type { Transaction } from '../../../types';
import { BillLineItemTransforms } from '../../../types';
import { TRANSACTION_CATEGORIES } from '../../../constants/transactionCategories';
import { getLocalDateString } from '../../../utils/dateUtils';
import { getFiscalPeriodForDate } from '../../../utils/fiscalPeriod';
import type { CurrencyCode } from '@pos-platform/shared';
import { CURRENCY_META } from '@pos-platform/shared';
import { currencyService } from '../../../services/currencyService';
import { roundHalfEven } from '../../../utils/currencyRounding';
import { LegacyCurrencyMissingError, CurrencyLockError } from '../../../errors/currencyErrors';

/** Line-item unit price in `billCurrency` (identity or convert + banker's round). */
// transactionService.createTransaction uses finalized cart line `unit_price` values from the bill payload — no second conversion in the service layer.
export function computeLineUnitPrice(
  item: { selling_price: number | null | undefined; currency?: CurrencyCode | null },
  billCurrency: CurrencyCode
): number {
  if (item.currency == null) {
    throw new LegacyCurrencyMissingError({ storeId: '', reason: 'inventory-currency-null' });
  }
  const itemCurrency = item.currency as CurrencyCode;
  const rawPrice = item.selling_price ?? 0;
  if (itemCurrency === billCurrency) {
    return rawPrice;
  }
  const converted = currencyService.convert(rawPrice, itemCurrency, billCurrency);
  const decimals = CURRENCY_META[billCurrency]?.decimals ?? 2;
  return roundHalfEven(converted, decimals);
}

export async function changeBillCurrency(billId: string, newCurrency: CurrencyCode): Promise<void> {
  const lines = await getDB()
    .bill_line_items.where('bill_id')
    .equals(billId)
    .filter(r => !r._deleted)
    .count();
  if (lines >= 1) {
    throw new CurrencyLockError({
      storeId: '',
      bill_id: billId,
      attemptedCurrency: newCurrency,
      reason: 'lines-present',
    });
  }
}

export interface SaleDeps {
  storeId: string | null | undefined;
  currentBranchId: string | null;
  userProfileId: string | undefined;
  currency: string;
  pushUndo: (undoData: any) => void;
  refreshData: () => Promise<void>;
  updateUnsyncedCount: () => Promise<void>;
  resetAutoSyncTimer: () => void;
  debouncedSync: () => void;
  deductInventoryQuantity: (productId: string, quantity: number) => Promise<void>;
  restoreInventoryQuantity: (productId: string, quantity: number) => Promise<void>;
}

export async function updateSale(
  deps: SaleDeps,
  id: string,
  updates: any
): Promise<void> {
  const { storeId, currentBranchId, userProfileId, currency, pushUndo, refreshData, updateUnsyncedCount, resetAutoSyncTimer, debouncedSync, deductInventoryQuantity, restoreInventoryQuantity } = deps;
  if (!storeId) throw new Error('No store ID available');

  if (!userProfileId) throw new Error('No user ID available - user not authenticated');

  const originalSale = await getDB().bill_line_items.get(id);
  if (!originalSale) throw new Error('Sale item not found');

  const dbUpdates = BillLineItemTransforms.toDbUpdate(updates);

  const quantityChanged = updates.quantity !== undefined && updates.quantity !== originalSale.quantity;
  const quantityDifference = quantityChanged ? (updates.quantity || 0) - (originalSale.quantity || 0) : 0;
  const priceChanged = updates.unit_price !== undefined || updates.received_value !== undefined || updates.weight !== undefined;

  await getDB().updateBillLineItem(id, dbUpdates, userProfileId);

  if (quantityChanged && originalSale.product_id) {
    if (quantityDifference > 0) {
      await deductInventoryQuantity(originalSale.product_id, quantityDifference);
    } else if (quantityDifference < 0) {
      await restoreInventoryQuantity(originalSale.product_id, Math.abs(quantityDifference));
    }
  }

  if (priceChanged) {
    await getDB().updateBillsForLineItem(id);

    const bill = await getDB().bills.get(originalSale.bill_id);
    if (bill && bill.payment_method === 'credit' && bill.entity_id) {
      const allLineItems = await getDB().bill_line_items
        .where('bill_id')
        .equals(bill.id)
        .and(item => !item._deleted)
        .toArray();

      const { calculateBillTotals } = await import('../../../utils/billCalculations');

      const oldLineItems = allLineItems.map(item => item.id === id ? originalSale : item);
      const oldTotals = calculateBillTotals(oldLineItems, bill.amount_paid || 0);
      const newTotals = calculateBillTotals(allLineItems, bill.amount_paid || 0);

      const originalItemHadZeroPrice = originalSale.unit_price === 0;
      const amountDueIncrease = newTotals.amount_due - oldTotals.amount_due;

      if (originalItemHadZeroPrice && amountDueIncrease > 0 && bill.entity_id) {
        const entity = await getDB().entities.get(bill.entity_id);
        if (entity && (entity.entity_type === 'customer' || entity.entity_type === 'supplier' || entity.entity_type === 'employee')) {
          const entityType = entity.entity_type as 'customer' | 'supplier' | 'employee';
          const now = new Date().toISOString();
          const transactionId = createId();

          const creditSaleTransaction: Transaction = {
            id: transactionId,
            store_id: storeId,
            branch_id: currentBranchId || '',
            type: 'income',
            category: entityType === 'customer'
              ? TRANSACTION_CATEGORIES.CUSTOMER_CREDIT_SALE
              : entityType === 'supplier'
                ? TRANSACTION_CATEGORIES.SUPPLIER_CREDIT_SALE
                : TRANSACTION_CATEGORIES.CUSTOMER_CREDIT_SALE,
            amount: amountDueIncrease,
            currency: currency as CurrencyCode,
            description: `payments.creditSaleBill`,
            reference: `BILL-${bill.bill_number}`,
            entity_id: bill.entity_id,
            created_at: now,
            created_by: userProfileId,
            _synced: false,
            _deleted: false,
            is_reversal: false,
            reversal_of_transaction_id: null,
            metadata: {
              correlationId: createId(),
              source: 'offline',
              module: 'billing'
            }
          };

          await getDB().transactions.add(creditSaleTransaction);

          const postedDate = getLocalDateString(now);
          const fiscalPeriod = getFiscalPeriodForDate(now).period;

          const debitAccountCode = (entityType === 'customer' || entityType === 'employee') ? '1200' : '2100';
          const debitAccountName = (entityType === 'customer' || entityType === 'employee') ? 'Accounts Receivable' : 'Accounts Payable';

          const debitEntry = {
            id: createId(),
            store_id: storeId,
            branch_id: currentBranchId || '',
            transaction_id: transactionId,
            account_code: debitAccountCode,
            account_name: debitAccountName,
            entity_id: bill.entity_id,
            entity_type: entityType,
            debit: amountDueIncrease,
            credit: 0,
            currency: currency as CurrencyCode,
            description: `payments.creditSaleBill`,
            posted_date: postedDate,
            fiscal_period: fiscalPeriod,
            is_posted: true,
            created_by: userProfileId,
            created_at: now,
            _synced: false
          };

          const creditEntry = {
            id: createId(),
            store_id: storeId,
            branch_id: currentBranchId || '',
            transaction_id: transactionId,
            account_code: '4100',
            account_name: 'Revenue',
            entity_id: bill.entity_id,
            entity_type: entityType,
            debit: 0,
            credit: amountDueIncrease,
            currency: currency as CurrencyCode,
            description: `payments.creditSaleBill`,
            posted_date: postedDate,
            fiscal_period: fiscalPeriod,
            is_posted: true,
            created_by: userProfileId,
            created_at: now,
            _synced: false
          };

          await getDB().journal_entries.bulkAdd([debitEntry, creditEntry]);

          await getDB().entities.update(bill.entity_id, {
            updated_at: now,
            _synced: false
          });

          console.log(`✅ Updated ${entityType} balance for ${entity.name} (increase: ${amountDueIncrease})`);
        }
      }
    }
  }

  const undoChanges: any = {};
  for (const key of Object.keys(dbUpdates)) {
    if (key !== '_synced' && key !== 'updated_at') {
      undoChanges[key] = (originalSale as any)[key];
    }
  }

  pushUndo({
    type: 'update_sale',
    affected: [{ table: 'bill_line_items', id }],
    steps: [{ op: 'update', table: 'bill_line_items', id, changes: undoChanges }],
    metadata: {
      quantityDifference,
      product_id: originalSale.product_id
    }
  });

  await refreshData();
  await updateUnsyncedCount();
  resetAutoSyncTimer();
  debouncedSync();
}

export async function deleteSale(deps: SaleDeps, id: string): Promise<void> {
  const { storeId, currentBranchId, pushUndo, refreshData, updateUnsyncedCount, resetAutoSyncTimer, debouncedSync } = deps;
  if (!storeId) throw new Error('No store ID available');

  const saleItem = await getDB().bill_line_items.get(id);
  if (!saleItem) throw new Error('Sale item not found');

  await getDB().transaction('rw', [getDB().bill_line_items, getDB().inventory_items], async () => {
    await getDB().bill_line_items.delete(id);

    if (saleItem.quantity && saleItem.quantity > 0) {
      const existingInventory = await getDB().inventory_items
        .where('product_id')
        .equals(saleItem.product_id)
        .sortBy('received_at');

      if (existingInventory.length > 0) {
        const mostRecent = existingInventory[existingInventory.length - 1];
        await getDB().inventory_items.update(mostRecent.id, {
          quantity: mostRecent.quantity + saleItem.quantity,
          _synced: false
        });
      } else {
        await getDB().inventory_items.add({
          id: createId(),
          store_id: storeId,
          branch_id: saleItem.branch_id || currentBranchId || '',
          product_id: saleItem.product_id,
          quantity: saleItem.quantity,
          received_at: new Date().toISOString(),
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
          _synced: false,
          _deleted: false
        } as any);
      }
    }
  });

  pushUndo({
    type: 'delete_sale',
    affected: [{ table: 'bill_line_items', id }],
    steps: [{ op: 'restore', table: 'bill_line_items', record: saleItem }],
    metadata: {
      quantity: saleItem.quantity,
      product_id: saleItem.product_id
    }
  });

  await refreshData();
  await updateUnsyncedCount();
  resetAutoSyncTimer();
  debouncedSync();
}
