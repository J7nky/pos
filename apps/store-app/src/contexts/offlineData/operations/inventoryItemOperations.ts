/**
 * Inventory item operations (thinning OfflineDataContext).
 * updateInventoryItem, checkInventoryItemReferences, deleteInventoryItem,
 * deductInventoryQuantity, restoreInventoryQuantity.
 */

import { getDB, createId } from '../../../lib/db';
import type { Database } from '../../../types/database';
import type { InventoryItem } from '../../../types';
import { receivedItemsJournalService } from '../../../services/receivedItemsJournalService';
import { crudHelperService } from '../../../services/crudHelperService';
import type { CurrencyCode } from '@pos-platform/shared';
import { currencyService } from '../../../services/currencyService';
import { assertValidCurrency } from '../../../utils/currencyValidation';

type Tables = Database['public']['Tables'];

export interface InventoryItemDeps {
  storeId: string | null | undefined;
  currentBranchId: string | null;
  userProfileId: string | undefined;
  currency: string;
  pushUndo: (undoData: any) => void;
  refreshData: () => Promise<void>;
  updateUnsyncedCount: () => Promise<void>;
  resetAutoSyncTimer: () => void;
  debouncedSync: () => void;
}

export interface AddInventoryItemDeps {
  storeId: string | null | undefined;
  pushUndo: (undoData: any) => void;
  resetAutoSyncTimer: () => void;
}

export async function addInventoryItem(
  deps: AddInventoryItemDeps,
  itemData: Omit<Database['public']['Tables']['inventory_items']['Insert'], 'store_id'>
): Promise<void> {
  const { storeId, pushUndo, resetAutoSyncTimer } = deps;
  if (!storeId) throw new Error('No store ID available');

  const itemId = (itemData as any).id || createId();

  const rowCurrency = assertValidCurrency(
    itemData.currency,
    currencyService.getAcceptedCurrencies(),
    { storeId }
  );

  const preparedData = {
    id: itemId,
    product_id: itemData.product_id ?? '',
    quantity: itemData.quantity ?? 0,
    unit: itemData.unit ?? '',
    received_quantity: itemData.received_quantity ?? (itemData.quantity ?? 0),
    weight: itemData.weight ?? null,
    price: itemData.price ?? null,
    currency: rowCurrency,
    selling_price: (itemData as any).selling_price ?? null,
    batch_id: itemData.batch_id ?? null,
    sku: (itemData as any).sku ?? null
  } as Omit<Database['public']['Tables']['inventory_items']['Insert'], 'store_id'>;

  await crudHelperService.addEntity('inventory_items', storeId, preparedData);

  pushUndo({
    type: 'add_inventory_item',
    affected: [{ table: 'inventory_items', id: itemId }],
    steps: [{ op: 'delete', table: 'inventory_items', id: itemId }]
  });

  resetAutoSyncTimer();
}

export async function updateInventoryItem(
  deps: InventoryItemDeps,
  id: string,
  updates: Tables['inventory_items']['Update']
): Promise<void> {
  const { storeId, currentBranchId, userProfileId, pushUndo, resetAutoSyncTimer } = deps;
  if (!storeId) throw new Error('No store ID available');
  if (!currentBranchId) throw new Error('No branch ID available');

  const originalItem = await getDB().inventory_items.get(id);
  if (!originalItem) throw new Error('Inventory item not found');

  if (updates.currency !== undefined) {
    assertValidCurrency(
      updates.currency as CurrencyCode,
      currencyService.getAcceptedCurrencies(),
      { storeId }
    );
  }

  const oldAmount = receivedItemsJournalService.calculateItemAmount(originalItem);
  const newItem = { ...originalItem, ...updates };
  const newAmount = receivedItemsJournalService.calculateItemAmount(newItem);
  const amountChanged = Math.abs(newAmount - oldAmount) > 0.01;

  if (!userProfileId) throw new Error('User not authenticated');

  const updatePayload: any = { ...updates, _synced: false };

  await getDB().inventory_items.update(id, updatePayload);

  if (amountChanged && originalItem.batch_id) {
    try {
      const batch = await getDB().inventory_bills.get(originalItem.batch_id);
      if (batch) {
        if (batch.type !== 'commission') {
          const { inventoryPurchaseService } = await import('../../../services/inventoryPurchaseService');
          const originalTransaction = await inventoryPurchaseService.findOriginalTransactionForBatch(
            originalItem.batch_id,
            storeId
          );

          if (originalTransaction) {
            const batchItems = await getDB().inventory_items
              .where('batch_id')
              .equals(originalItem.batch_id)
              .toArray();

            const oldBatchTotal = batchItems.reduce((total, item) => {
              if (item.id === id) return total + oldAmount;
              return total + receivedItemsJournalService.calculateItemAmount(item);
            }, 0);

            const newBatchTotal = batchItems.reduce((total, item) => {
              return total + receivedItemsJournalService.calculateItemAmount(item);
            }, 0);

            const difference = newBatchTotal - oldBatchTotal;

            if (Math.abs(difference) > 0.01) {
              await getDB().transaction('rw', [
                getDB().inventory_items,
                getDB().inventory_bills,
                getDB().journal_entries,
                getDB().transactions,
                getDB().entities,
                getDB().chart_of_accounts
              ], async () => {
                await inventoryPurchaseService.createPriceAdjustmentTransaction(
                  id,
                  oldBatchTotal,
                  newBatchTotal,
                  originalItem.batch_id,
                  originalTransaction.id,
                  batch.currency || currency,
                  storeId,
                  currentBranchId,
                  userProfileId
                );
              });

              console.log(`[UPDATE_INVENTORY_ITEM] ✅ Adjustment transaction created for item ${id}, difference: ${difference}`);
            }
          } else {
            console.log(`[UPDATE_INVENTORY_ITEM] No original transaction found for batch ${originalItem.batch_id}, skipping adjustment`);
          }
        } else {
          console.log(`[UPDATE_INVENTORY_ITEM] Skipping commission bill adjustment (COGS = 0)`);
        }
      }
    } catch (error) {
      console.error(`[UPDATE_INVENTORY_ITEM] Error creating adjustment transaction:`, error);
      if (error instanceof Error && error.message.includes('Insufficient cash drawer balance')) {
        throw error;
      }
    }
  }

  const undoChanges: any = {};
  for (const key of Object.keys(updates)) {
    if (key !== '_synced' && key !== 'updated_at') {
      undoChanges[key] = (originalItem as any)[key];
    }
  }

  pushUndo({
    type: 'update_inventory_item',
    affected: [{ table: 'inventory_items', id }],
    steps: [{ op: 'update', table: 'inventory_items', id, changes: undoChanges }]
  });

  resetAutoSyncTimer();
}

export async function checkInventoryItemReferences(id: string): Promise<{
  salesCount: number;
  variancesCount: number;
  hasReferences: boolean;
}> {
  try {
    const sales = await getDB().bill_line_items
      .where('inventory_item_id')
      .equals(id)
      .and(item => !item._deleted)
      .toArray();

    const variances = await getDB().missed_products
      .where('inventory_item_id')
      .equals(id)
      .and(item => !item._deleted)
      .toArray();

    return {
      salesCount: sales.length,
      variancesCount: variances.length,
      hasReferences: sales.length > 0 || variances.length > 0
    };
  } catch (error) {
    console.error('Error checking inventory item references:', error);
    return { salesCount: 0, variancesCount: 0, hasReferences: false };
  }
}

export async function archiveInventoryItem(
  deps: Pick<InventoryItemDeps, 'storeId' | 'pushUndo' | 'resetAutoSyncTimer' | 'refreshData'>,
  id: string
): Promise<void> {
  const { storeId, pushUndo, resetAutoSyncTimer, refreshData } = deps;
  if (!storeId) throw new Error('No store ID available');

  const originalItem = await getDB().inventory_items.get(id);
  if (!originalItem) throw new Error('Inventory item not found');

  await getDB().inventory_items.update(id, { is_archived: true, _synced: false });

  pushUndo({
    type: 'archive_inventory_item',
    affected: [{ table: 'inventory_items', id }],
    steps: [{ op: 'update', table: 'inventory_items', id, changes: { is_archived: false, _synced: false } }],
  });

  resetAutoSyncTimer();
  await refreshData();
}

export async function unarchiveInventoryItem(
  deps: Pick<InventoryItemDeps, 'storeId' | 'pushUndo' | 'resetAutoSyncTimer' | 'refreshData'>,
  id: string
): Promise<void> {
  const { storeId, pushUndo, resetAutoSyncTimer, refreshData } = deps;
  if (!storeId) throw new Error('No store ID available');

  const originalItem = await getDB().inventory_items.get(id);
  if (!originalItem) throw new Error('Inventory item not found');

  await getDB().inventory_items.update(id, { is_archived: false, _synced: false });

  pushUndo({
    type: 'unarchive_inventory_item',
    affected: [{ table: 'inventory_items', id }],
    steps: [{ op: 'update', table: 'inventory_items', id, changes: { is_archived: true, _synced: false } }],
  });

  resetAutoSyncTimer();
  await refreshData();
}

export async function deleteInventoryItem(
  deps: InventoryItemDeps,
  id: string
): Promise<void> {
  const { storeId, currentBranchId, userProfileId, pushUndo, resetAutoSyncTimer, refreshData } = deps;
  if (!storeId) throw new Error('No store ID available');
  if (!currentBranchId) throw new Error('No branch ID available');

  try {
    console.log(`🗑️ Deleting inventory item ${id}`);

    const originalItem = await getDB().inventory_items.get(id);
    if (!originalItem) throw new Error('Inventory item not found');

    const sales = await getDB().bill_line_items
      .where('inventory_item_id')
      .equals(id)
      .and(item => !item._deleted)
      .toArray();

    if (sales.length > 0) {
      throw new Error(`HAS_SALES:${sales.length}`);
    }

    if (!userProfileId) throw new Error('User not authenticated');

    await getDB().transaction('rw', [
      getDB().inventory_items,
      getDB().inventory_bills,
      getDB().journal_entries,
      getDB().transactions,
      getDB().entities,
      getDB().chart_of_accounts
    ], async () => {
      if (originalItem.batch_id) {
        const batch = await getDB().inventory_bills.get(originalItem.batch_id);
        if (batch && batch.type !== 'commission') {
          const itemAmount = receivedItemsJournalService.calculateItemAmount(originalItem);
          if (itemAmount > 0) {
            console.log(`[DELETE_INVENTORY_ITEM] Reversing journal entries for item ${id}, amount: ${itemAmount}`);
            await receivedItemsJournalService.reverseJournalEntriesForItem(
              id,
              originalItem.batch_id,
              `Inventory item deleted: ${id}`,
              userProfileId,
              storeId,
              currentBranchId
            );
          }
        }
      }

      await getDB().inventory_items.delete(id);
    });

    pushUndo({
      type: 'delete_inventory_item',
      affected: [{ table: 'inventory_items', id }],
      steps: [{ op: 'add', table: 'inventory_items', id, changes: originalItem }],
    });

    resetAutoSyncTimer();

    console.log(`🗑️ Inventory item ${id} deleted successfully`);

    await refreshData();
  } catch (error) {
    console.error('Error deleting inventory item:', error);
    throw new Error(`Failed to delete inventory item: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}

export async function deductInventoryQuantity(
  deps: Pick<InventoryItemDeps, 'storeId' | 'refreshData' | 'updateUnsyncedCount' | 'debouncedSync'>,
  productId: string,
  quantity: number
): Promise<void> {
  console.log('deductInventoryQuantity', productId, quantity);
  if (!deps.storeId) return;

  try {
    const inventoryRecords = await getDB().inventory_items
      .where('product_id')
      .equals(productId)
      .and(inv => inv.quantity > 0)
      .sortBy('received_at');

    let qtyToDeduct = quantity;
    for (const inv of inventoryRecords) {
      if (qtyToDeduct <= 0) break;

      const deduct = Math.min(inv.quantity, qtyToDeduct);
      const newQuantity = inv.quantity - deduct;

      await getDB().inventory_items.update(inv.id, {
        quantity: newQuantity <= 0 ? 0 : newQuantity,
        _synced: false
      });
      qtyToDeduct -= deduct;
    }

    await deps.refreshData();
    await deps.updateUnsyncedCount();
    deps.debouncedSync();
  } catch (error) {
    console.error('Error deducting inventory for sale:', error);
    throw error;
  }
}

export async function restoreInventoryQuantity(
  deps: Pick<InventoryItemDeps, 'storeId' | 'currentBranchId' | 'refreshData' | 'updateUnsyncedCount' | 'debouncedSync'>,
  productId: string,
  quantity: number
): Promise<void> {
  console.log('restoreInventoryQuantity', productId, quantity);
  if (!deps.storeId) return;

  try {
    const existingInventory = await getDB().inventory_items
      .where('product_id')
      .equals(productId)
      .sortBy('received_at');

    if (existingInventory.length > 0) {
      const mostRecent = existingInventory[existingInventory.length - 1];
      await getDB().inventory_items.update(mostRecent.id, {
        quantity: mostRecent.quantity + quantity,
        _synced: false
      });
    } else {
      const newInventoryItem: InventoryItem = {
        id: createId(),
        store_id: deps.storeId,
        product_id: productId,
        quantity,
        _synced: false,
        unit: 'box',
        branch_id: deps.currentBranchId || '',
        weight: null,
        price: null,
        selling_price: null,
        received_quantity: quantity,
        created_at: new Date().toISOString(),
        batch_id: null
      };
      await getDB().inventory_items.add(newInventoryItem);
    }

    await deps.refreshData();
    await deps.updateUnsyncedCount();
    deps.debouncedSync();
  } catch (error) {
    console.error('Error restoring inventory for sale:', error);
    throw error;
  }
}
