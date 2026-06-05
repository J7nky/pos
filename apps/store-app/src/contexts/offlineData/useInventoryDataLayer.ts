/**
 * Inventory domain layer for OfflineDataContext (§1.3).
 * Owns inventoryItems, inventoryBills, and transformed inventory state; hydrate + getters.
 * addInventoryItem / updateInventoryItem stay in context (complex journal/sync logic).
 */

import { useState, useCallback, useRef } from 'react';
import { getDB } from '../../lib/db';
import { sameRowList } from '../../utils/rowListEquality';
import type { InventoryDataLayerAdapter, InventoryDataLayerResult } from './types';

export function useInventoryDataLayer(_adapter: InventoryDataLayerAdapter): InventoryDataLayerResult {
  const [inventoryItems, setInventoryItems] = useState<any[]>([]);
  const [inventoryBills, setInventoryBills] = useState<any[]>([]);
  const [inventory, setInventory] = useState<any[]>([]);
  // Last raw inputs, to detect no-op hydrates. The derived `inventory` depends on
  // BOTH items and batches, so it must recompute when either changes.
  const prevInputsRef = useRef<{ items: any[]; batches: any[] } | null>(null);

  const hydrate = useCallback((inventoryData: any[], batchesData: any[]) => {
    const items = inventoryData || [];
    const batches = batchesData || [];

    const prev = prevInputsRef.current;
    const itemsSame = prev ? sameRowList(prev.items, items) : false;
    const batchesSame = prev ? sameRowList(prev.batches, batches) : false;
    prevInputsRef.current = { items, batches };

    // Nothing changed — leave all three arrays (and their references) untouched.
    if (itemsSame && batchesSame) return;

    if (!itemsSame) setInventoryItems(items);
    if (!batchesSame) setInventoryBills(batches);

    const batchById = batches.reduce((acc: Record<string, any>, b: any) => {
      acc[b.id] = b;
      return acc;
    }, {});

    setInventory(items.map((item: any) => {
      const batch = item.batch_id ? batchById[item.batch_id] : null;
      return {
        ...item,
        commission_rate: batch ? batch.commission_rate : null,
        batch_type: batch ? batch.type : null,
        batch_porterage: batch ? batch.porterage_fee : null,
        batch_transfer_fee: batch ? batch.transfer_fee : null,
        batch_status: batch ? batch.status : 'Created',
      };
    }));
  }, []);

  const getInventoryBatch = useCallback(async (batchId: string): Promise<any | null> => {
    try {
      const batch = await getDB().inventory_bills.get(batchId);
      return batch || null;
    } catch (error) {
      console.error('Error getting inventory batch:', error);
      return null;
    }
  }, []);

  const getInventoryItemsForBatch = useCallback(async (batchId: string): Promise<any[]> => {
    try {
      const items = await getDB().inventory_items.where('batch_id').equals(batchId).toArray();
      return items || [];
    } catch (error) {
      console.error('Error getting inventory items for batch:', error);
      return [];
    }
  }, []);

  return {
    inventoryItems,
    inventoryBills,
    inventory,
    hydrate,
    getInventoryBatch,
    getInventoryItemsForBatch,
  };
}
