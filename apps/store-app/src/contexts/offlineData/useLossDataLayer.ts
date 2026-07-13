/**
 * Inventory-loss domain layer for OfflineDataContext (spec 019).
 * Owns the hydrated `lossEvents` state (one row per recorded loss against a
 * specific lot) plus a surgical upsert so lossOperations can merge freshly
 * written rows without a full-table reload (same perf pattern as
 * useTransactionDataLayer.upsertTransactions).
 */

import { useState, useCallback } from 'react';
import { sameRowList } from '../../utils/rowListEquality';
import type { InventoryLossEvent } from '../../types';

export interface LossDataLayerResult {
  lossEvents: InventoryLossEvent[];
  hydrate: (lossEventsData: InventoryLossEvent[]) => void;
  upsertLossEvents: (rows: InventoryLossEvent[]) => void;
}

export function useLossDataLayer(): LossDataLayerResult {
  const [lossEvents, setLossEvents] = useState<InventoryLossEvent[]>([]);

  const hydrate = useCallback((lossEventsData: InventoryLossEvent[]) => {
    const rows = lossEventsData || [];
    setLossEvents(prev => (sameRowList(prev, rows) ? prev : rows));
  }, []);

  // Surgical upsert: merge rows into state by id. Reversals arrive as an
  // updated original (status='reversed') plus a new reversal row — both merge
  // in one call. Soft-deleted rows drop out of state.
  const upsertLossEvents = useCallback((rows: InventoryLossEvent[]) => {
    if (!rows || rows.length === 0) return;
    setLossEvents(prev => {
      const next = new Map(prev.map(e => [e.id, e]));
      for (const row of rows) {
        if (row._deleted) next.delete(row.id);
        else next.set(row.id, row);
      }
      return Array.from(next.values());
    });
  }, []);

  return { lossEvents, hydrate, upsertLossEvents };
}
