/**
 * Inventory batch operations (thinning OfflineDataContext §1.3).
 * addInventoryBatch, updateInventoryBatch, deleteInventoryBatch, applyCommissionRateToBatch.
 */

import { getDB, createId } from '../../../lib/db';
import { InventoryPurchaseService } from '../../../services/inventoryPurchaseService';
import { receivedItemsJournalService } from '../../../services/receivedItemsJournalService';
import { receivedBillMonitoringService } from '../../../services/receivedBillMonitoringService';
import type { Database } from '../../../types/database';

type Tables = Database['public']['Tables'];

export interface InventoryBatchDeps {
  storeId: string | null | undefined;
  currentBranchId: string | null;
  userProfileId: string | undefined;
  currency: 'USD' | 'LBP';
  pushUndo: (data: any) => void;
  refreshData: () => Promise<void>;
  updateUnsyncedCount: () => Promise<void>;
  resetAutoSyncTimer: () => void;
  debouncedSync: () => void;
}

export async function addInventoryBatch(
  deps: InventoryBatchDeps,
  args: {
    supplier_id: string;
    created_by: string;
    status?: string | null;
    porterage_fee?: number | null;
    transfer_fee?: number | null;
    received_at?: string;
    commission_rate?: number;
    type: string;
    plastic_fee?: number | null;
    currency?: 'USD' | 'LBP';
    items: Array<Omit<Tables['inventory_items']['Insert'], 'store_id' | 'received_at'>>;
  }
): Promise<{ batchId: string; financialResult?: any }> {
  const { storeId, currentBranchId, pushUndo, refreshData, updateUnsyncedCount, resetAutoSyncTimer, debouncedSync } = deps;
  const { supplier_id, created_by, status = 'Created', porterage_fee = null, transfer_fee = null, received_at, commission_rate, type, plastic_fee, currency: batchCurrency, items } = args;

  if (!storeId) throw new Error('No store ID available');
  if (!items || items.length === 0) throw new Error('No items provided');

  const batchId = createId();

  const actualSupplierId = supplier_id === 'trade'
    ? await InventoryPurchaseService.getInstance().getOrCreateTradeSupplier(storeId)
    : supplier_id;

  let financialResult = null;

  const batchRecord = {
    id: batchId,
    supplier_id: actualSupplierId,
    status: status || undefined,
    porterage_fee,
    transfer_fee,
    received_at: received_at || new Date().toISOString(),
    commission_rate: commission_rate || null,
    store_id: storeId,
    created_by,
    currency: batchCurrency || deps.currency,
    plastic_fee: plastic_fee ? String(plastic_fee) : undefined,
    type,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    branch_id: currentBranchId || '',
    _synced: false
  };

  const allProducts = await getDB().products.toArray();
  const productMap = new Map(allProducts.map(p => [p.id, p]));

  await getDB().transaction('rw', [getDB().inventory_bills, getDB().inventory_items], async () => {
    await getDB().inventory_bills.add(batchRecord);
    const now = new Date().toISOString();
    const allowedUnits = ['box', 'kg', 'piece', 'bag', 'bundle'] as const;
    const itemCurrencyDefault = batchCurrency || deps.currency;

    const mappedItems = items.map((it) => ({
      id: createId(),
      product_id: (it as any).product_id ?? '',
      quantity: (it as any).quantity ?? 0,
      unit: allowedUnits.includes((it as any).unit as any)
        ? ((it as any).unit as 'box' | 'kg' | 'piece' | 'bag' | 'bundle')
        : 'box',
      store_id: storeId,
      created_at: now,
      _synced: false,
      weight: (it as any).weight ?? null,
      price: (it as any).price ?? null,
      currency: (it as any).currency ?? itemCurrencyDefault,
      selling_price: (it as any).selling_price ?? null,
      received_quantity: (it as any).received_quantity ?? 0,
      batch_id: batchId as string | null,
      sku: (it as any).sku ?? null,
      branch_id: currentBranchId || '',
      updated_at: now
    }));

    await getDB().inventory_items.bulkAdd(mappedItems);

    for (const item of mappedItems) {
      if (!item.sku) {
        const product = productMap.get(item.product_id);
        if (product) {
          const category = (product as any).category || 'UNK';
          const categoryPrefix = category.length >= 3
            ? category.substring(0, 3).toUpperCase()
            : category.toUpperCase().padEnd(3, 'X');
          const itemIdStr = item.id;
          const itemIdPart = itemIdStr.length >= 4
            ? itemIdStr.substring(itemIdStr.length - 4)
            : itemIdStr.padStart(4, '0');
          const sku = `${categoryPrefix}-${itemIdPart}`;
          await getDB().inventory_items.update(item.id, { sku });
        }
      }
    }

    const itemIds = mappedItems.map(item => item.id);
    const undoSteps: any[] = [{ op: 'delete', table: 'inventory_bills', id: batchId }];
    const affectedRecords: any[] = [{ table: 'inventory_bills', id: batchId }];

    for (const itemId of itemIds) {
      undoSteps.push({ op: 'delete', table: 'inventory_items', id: itemId });
      affectedRecords.push({ table: 'inventory_items', id: itemId });
    }

    pushUndo({ type: 'add_inventory_batch', affected: affectedRecords, steps: undoSteps });
  });

  if (type === 'cash' || type === 'credit' || type === 'commission') {
    try {
      const { inventoryPurchaseService } = await import('../../../services/inventoryPurchaseService');
      const purchaseCurrency = batchCurrency || deps.currency;

      const purchaseData = {
        supplier_id: actualSupplierId,
        type: type as 'cash' | 'credit' | 'commission',
        currency: purchaseCurrency,
        items: items.map(item => ({
          product_id: (item as any).product_id || '',
          quantity: (item as any).quantity || 0,
          unit: (item as any).unit || '',
          weight: (item as any).weight || undefined,
          price: (item as any).price || undefined,
          selling_price: (item as any).selling_price || undefined
        })),
        porterage_fee: porterage_fee || undefined,
        transfer_fee: transfer_fee || undefined,
        plastic_fee: plastic_fee || undefined,
        commission_rate: commission_rate || undefined,
        created_by,
        store_id: storeId,
        branch_id: currentBranchId || '',
        status: status || undefined,
        batch_id: batchId
      };

      financialResult = await inventoryPurchaseService.processInventoryPurchase(purchaseData);
    } catch (error) {
      console.error(`[ADD_INVENTORY_BATCH] Error processing financial transaction:`, error);
      console.warn(`[ADD_INVENTORY_BATCH] Financial transaction failed but batch/items were created successfully`);
    }
  }

  await refreshData();
  await updateUnsyncedCount();
  resetAutoSyncTimer();
  debouncedSync();

  return { batchId, financialResult };
}

export async function updateInventoryBatch(
  deps: InventoryBatchDeps,
  id: string,
  updates: Partial<Tables['inventory_bills']['Update']>
): Promise<void> {
  const { storeId, currentBranchId, userProfileId, currency, pushUndo, refreshData, updateUnsyncedCount, resetAutoSyncTimer, debouncedSync } = deps;
  if (!storeId) throw new Error('No store ID available');
  if (!currentBranchId) throw new Error('No branch ID available');
  if (!userProfileId) throw new Error('User not authenticated');

  const originalBatch = await getDB().inventory_bills.get(id);
  if (!originalBatch) throw new Error('Inventory batch not found');

  const supplierChanged = updates.supplier_id !== undefined && updates.supplier_id !== originalBatch.supplier_id;

  const batchItems = await getDB().inventory_items.where('batch_id').equals(id).toArray();

  const calculateBatchTotal = (items: any[]) => items.reduce((total, item) => {
    const itemPrice = item.price || 0;
    const itemValue = item.weight && itemPrice ? item.weight * itemPrice : (item.quantity || 0) * itemPrice;
    return total + itemValue;
  }, 0);

  const oldBatchTotal = calculateBatchTotal(batchItems);
  const newBatchTotal = calculateBatchTotal(batchItems);
  const amountChanged = Math.abs(newBatchTotal - oldBatchTotal) > 0.01;

  const processedUpdates: any = { ...updates, _synced: false };

  if (updates.commission_rate !== undefined) {
    processedUpdates.commission_rate = typeof updates.commission_rate === 'string'
      ? parseFloat(updates.commission_rate as string) || null : updates.commission_rate;
  }
  if (updates.porterage_fee !== undefined) {
    processedUpdates.porterage_fee = typeof updates.porterage_fee === 'string'
      ? parseFloat(updates.porterage_fee as string) || null : updates.porterage_fee;
  }
  if (updates.transfer_fee !== undefined) {
    processedUpdates.transfer_fee = typeof updates.transfer_fee === 'string'
      ? parseFloat(updates.transfer_fee as string) || null : updates.transfer_fee;
  }
  if (updates.plastic_fee !== undefined) {
    processedUpdates.plastic_fee = typeof updates.plastic_fee === 'string'
      ? updates.plastic_fee : (updates.plastic_fee as any)?.toString() || null;
  }
  if (updates.received_at !== undefined) {
    processedUpdates.received_at = updates.received_at || new Date().toISOString();
  }
  if (updates.status !== undefined) {
    processedUpdates.status = updates.status || 'Created';
  } else {
    processedUpdates.status = 'Created';
  }
  if (updates.type !== undefined) {
    processedUpdates.type = updates.type || 'commission';
  }
  delete processedUpdates.plastic_count;
  delete processedUpdates.plastic_price;

  await getDB().transaction('rw', [
    getDB().inventory_bills,
    getDB().inventory_items,
    getDB().journal_entries,
    getDB().transactions,
    getDB().entities,
    getDB().chart_of_accounts
  ], async () => {
    await getDB().inventory_bills.update(id, processedUpdates);

    if (supplierChanged) {
      const batchCurrency = ((originalBatch as any).currency || currency) as 'USD' | 'LBP';
      const batchType = (processedUpdates.type || originalBatch.type) as 'cash' | 'credit' | 'commission';
      await receivedItemsJournalService.updateJournalEntriesForSupplierChange(
        id,
        originalBatch.supplier_id,
        updates.supplier_id!,
        batchItems,
        batchCurrency,
        batchType,
        storeId,
        currentBranchId,
        userProfileId
      );
    } else if (amountChanged && (originalBatch.type === 'cash' || originalBatch.type === 'credit')) {
      const difference = newBatchTotal - oldBatchTotal;
      if (Math.abs(difference) > 0.01) {
        const batchCurrency = ((originalBatch as any).currency || currency) as 'USD' | 'LBP';
        const { inventoryPurchaseService } = await import('../../../services/inventoryPurchaseService');
        const originalTransaction = await inventoryPurchaseService.findOriginalTransactionForBatch(id, storeId);
        if (originalTransaction) {
          await inventoryPurchaseService.createPriceAdjustmentTransaction(
            batchItems[0]?.id || '',
            oldBatchTotal,
            newBatchTotal,
            id,
            originalTransaction.id,
            batchCurrency,
            storeId,
            currentBranchId,
            userProfileId
          );
        }
      }
    }
  });

  if (updates.status && typeof updates.status === 'string' && updates.status.includes('[CLOSED]') && storeId) {
    const inventoryItems = await getDB().inventory_items.where('batch_id').equals(id).toArray();
    for (const item of inventoryItems) {
      receivedBillMonitoringService.markBillAsClosed(storeId, item.id).catch(err => {
        console.error('Error marking bill as closed in monitoring:', err);
      });
    }
  }

  const undoChanges: any = {};
  for (const key of Object.keys(updates)) {
    if (key !== '_synced' && key !== 'updated_at') {
      undoChanges[key] = (originalBatch as any)[key];
    }
  }

  pushUndo({
    type: 'update_inventory_batch',
    affected: [{ table: 'inventory_bills', id }],
    steps: [{ op: 'update', table: 'inventory_bills', id, changes: undoChanges }]
  });

  await refreshData();
  await updateUnsyncedCount();
  resetAutoSyncTimer();
  debouncedSync();
}

export async function deleteInventoryBatch(
  deps: InventoryBatchDeps,
  id: string
): Promise<void> {
  const { storeId, currentBranchId, userProfileId, pushUndo, refreshData, updateUnsyncedCount, resetAutoSyncTimer, debouncedSync } = deps;
  if (!storeId) throw new Error('No store ID available');
  if (!currentBranchId) throw new Error('No branch ID available');
  if (!userProfileId) throw new Error('User not authenticated');

  const originalBatch = await getDB().inventory_bills.get(id);
  if (!originalBatch) throw new Error('Inventory batch not found');

  const batchItems = await getDB().inventory_items.where('batch_id').equals(id).toArray();

  const hasReferences = batchItems.some(item =>
    item.quantity > 0 || (item as any).received_quantity > 0
  );

  await getDB().transaction('rw', [
    getDB().inventory_bills,
    getDB().inventory_items,
    getDB().journal_entries,
    getDB().transactions,
    getDB().entities,
    getDB().chart_of_accounts
  ], async () => {
    if (originalBatch.type !== 'commission') {
      await receivedItemsJournalService.reverseJournalEntriesForBatch(
        id,
        `Batch deleted: ${id}`,
        userProfileId,
        storeId,
        currentBranchId
      );
    }

    for (const item of batchItems) {
      if (hasReferences) {
        await getDB().inventory_items.update(item.id, { _deleted: true, _synced: false });
      } else {
        await getDB().inventory_items.delete(item.id);
      }
    }

    if (hasReferences) {
      await getDB().inventory_bills.update(id, { _deleted: true, _synced: false });
    } else {
      await getDB().inventory_bills.delete(id);
    }
  });

  const affectedRecords: any[] = [
    { table: 'inventory_bills', id },
    ...batchItems.map(item => ({ table: 'inventory_items', id: item.id }))
  ];

  const undoSteps: any[] = batchItems.map(item => ({
    op: hasReferences ? 'update' : 'add',
    table: 'inventory_items',
    id: item.id,
    changes: hasReferences ? { _deleted: false, _synced: false } : item
  }));

  undoSteps.push({
    op: hasReferences ? 'update' : 'add',
    table: 'inventory_bills',
    id,
    changes: hasReferences ? { _deleted: false, _synced: false } : originalBatch
  });

  pushUndo({ type: 'delete_inventory_batch', affected: affectedRecords, steps: undoSteps });

  await refreshData();
  await updateUnsyncedCount();
  resetAutoSyncTimer();
  debouncedSync();
}

export async function applyCommissionRateToBatch(
  deps: InventoryBatchDeps,
  batchId: string,
  commissionRate: number
): Promise<void> {
  const { pushUndo, refreshData, updateUnsyncedCount, resetAutoSyncTimer, debouncedSync } = deps;

  const originalBatch = await getDB().inventory_bills.get(batchId);
  if (!originalBatch) throw new Error('Inventory batch not found');

  await getDB().inventory_bills
    .where('id')
    .equals(batchId)
    .modify({ commission_rate: commissionRate, _synced: false });

  pushUndo({
    type: 'apply_commission_rate',
    affected: [{ table: 'inventory_bills', id: batchId }],
    steps: [{ op: 'update', table: 'inventory_bills', id: batchId, changes: { commission_rate: originalBatch.commission_rate, _synced: false } }]
  });

  await refreshData();
  await updateUnsyncedCount();
  resetAutoSyncTimer();
  debouncedSync();
}
