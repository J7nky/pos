/**
 * Inventory domain layer for OfflineDataContext (§1.3).
 * Owns inventoryItems, inventoryBills, and transformed inventory state; hydrate + getters.
 * addInventoryItem / updateInventoryItem stay in context (complex journal/sync logic).
 */

import { useState, useCallback } from 'react';
import { getDB } from '../../lib/db';
import type { InventoryDataLayerAdapter, InventoryDataLayerResult } from './types';

export function useInventoryDataLayer(_adapter: InventoryDataLayerAdapter): InventoryDataLayerResult {
  const [inventoryItems, setInventoryItems] = useState<any[]>([]);
  const [inventoryBills, setInventoryBills] = useState<any[]>([]);
  const [inventory, setInventory] = useState<any[]>([]);

  const hydrate = useCallback((inventoryData: any[], batchesData: any[]) => {
    setInventoryItems(inventoryData || []);
    setInventoryBills(batchesData || []);

    const batchById = (batchesData || []).reduce((acc: Record<string, any>, b: any) => {
      acc[b.id] = b;
      return acc;
    }, {});

    setInventory((inventoryData || []).map((item: any) => {
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
