import { useEffect } from 'react';
import { eventStreamService } from '../../services/syncOrchestrator';
import { entityBalanceCache } from '../../services/entityBalanceCache';
import { invalidateCashDrawerBalanceCache } from '../../utils/cacheManager';
import { getDB } from '../../lib/db';
import type { EventProcessingResult } from '../../services/eventStreamService';
import type { OfflineSyncSessionState } from './offlineDataContextContract';

/**
 * Resolve which entity ledgers moved from the ids a balance-affecting event batch
 * touched: journal entries carry `entity_id` (indexed by transaction_id), and a
 * sale's customer is the bill's `entity_id`. Returns the union of affected entity
 * ids so the caller can invalidate just those balances instead of all of them.
 */
async function resolveAffectedEntityIds(
  transactionIds: string[],
  billIds: string[],
): Promise<string[]> {
  const ids = new Set<string>();
  try {
    if (transactionIds.length > 0) {
      const entries = await getDB().journal_entries
        .where('transaction_id')
        .anyOf(transactionIds)
        .toArray();
      for (const je of entries) {
        const eid = (je as { entity_id?: string | null }).entity_id;
        if (eid) ids.add(eid);
      }
    }
    if (billIds.length > 0) {
      const bills = await getDB().bills.where('id').anyOf(billIds).toArray();
      for (const b of bills) {
        const eid = (b as { entity_id?: string | null }).entity_id;
        if (eid) ids.add(eid);
      }
    }
  } catch (err) {
    console.warn('[EventStream] Failed to resolve affected entity ids; will fall back to full balance invalidation:', err);
  }
  return [...ids];
}

export interface UseEventStreamLifecycleParams {
  storeId: string | null;
  currentBranchId: string | null;
  isOnline: boolean;
  syncSession: OfflineSyncSessionState | null;
  refreshData: () => Promise<void>;
  refreshCashDrawerStatus: () => Promise<void>;
}

export function useEventStreamLifecycle({
  storeId,
  currentBranchId,
  isOnline,
  syncSession,
  refreshData,
  refreshCashDrawerStatus,
}: UseEventStreamLifecycleParams): void {
  // Hold the realtime websocket subscription during a cold-start hydration.
  // When the websocket subscribes mid-download it competes with the Tier 1/2
  // HTTP/2 streams on the same connection and causes 'subscription timed out'
  // reconnect attempts that visibly slow the cold-start sync. Catch-up events
  // are pulled by version on subscribe, so deferring loses no data.
  const holdForColdStart =
    syncSession?.isColdStart === true && syncSession.tier2Complete === false;

  useEffect(() => {
    if (!storeId || !currentBranchId || !isOnline || holdForColdStart) {
      if (holdForColdStart) {
        console.log(`⏸ [EventStream] Holding subscription until cold-start tier2 completes`);
      } else {
        console.log(`🛑 [EventStream] Conditions not met, clearing callback:`, {
          hasStoreId: !!storeId,
          hasBranchId: !!currentBranchId,
          isOnline,
        });
      }
      eventStreamService.setOnEventsProcessed(undefined);
      return;
    }

    console.log(`🎯 [EventStream] Starting event stream for branch ${currentBranchId}`);
    const callback = async (result: EventProcessingResult) => {
      if (result.processed <= 0) {
        console.log(`🔄 [EventStream] Callback invoked but no foreign events processed`);
        return;
      }

      // `affected` summarizes what the foreign events actually touched. Acting on
      // it keeps the post-sync refresh proportional to the change instead of
      // wiping every cache and recomputing everything on each sync. (Older event
      // results without a summary fall back to the previous wholesale behavior.)
      const affected = result.affected;
      console.log(
        `🔄 [EventStream] ${result.processed} foreign event(s) processed`,
        affected
          ? { balanceAffected: affected.balanceAffected, cashAffected: affected.cashAffected, entityTypes: affected.entityTypes }
          : '(no affected summary — full refresh)'
      );

      try {
        // 1. Entity-balance cache: only when a journal-affecting event occurred,
        //    and only for the entities whose ledgers actually moved. A full wipe
        //    (which forces every visible customer + supplier to refetch from
        //    journal entries) is the fallback used only when we can't resolve the
        //    affected ids or there's no summary.
        if (!affected || affected.balanceAffected) {
          let invalidated = false;
          if (affected) {
            const ids = await resolveAffectedEntityIds(affected.transactionIds, affected.billIds);
            if (ids.length > 0) {
              for (const type of ['customer', 'supplier', 'employee'] as const) {
                entityBalanceCache.invalidateMany(type, ids);
              }
              invalidated = true;
              console.log(`🔄 [EventStream] Invalidated balances for ${ids.length} affected entit(y/ies)`);
            }
          }
          if (!invalidated) {
            entityBalanceCache.invalidateAll();
          }
        }

        // 2. Pull the changed rows into context (products/entities/bills/etc.).
        await refreshData();

        // 3. Cash-drawer work only when money could have moved. Pure config /
        //    entity-metadata events don't touch account 1100, so we skip the
        //    cache wipe, the session reload, and the `data-synced` /
        //    `cash-drawer-updated` fan-out that drives several components to
        //    re-scan the cash ledger from journal entries.
        if (!affected || affected.cashAffected) {
          invalidateCashDrawerBalanceCache();
          await refreshCashDrawerStatus();
          window.dispatchEvent(
            new CustomEvent('data-synced', {
              detail: { processed: result.processed, timestamp: new Date().toISOString() },
            })
          );
          // Cash-drawer-specific listeners (CashDrawerMonitor, CurrentCashDrawerStatus,
          // etc.) predate `data-synced` and only listen for `cash-drawer-updated`.
          window.dispatchEvent(
            new CustomEvent('cash-drawer-updated', {
              detail: { event: 'remote-sync', processed: result.processed },
            })
          );
        }
        console.log(`✅ [EventStream] Post-sync refresh complete`);
      } catch (error) {
        console.error('[EventStream] ❌ Error refreshing data after events:', error);
        if (error instanceof Error) console.error('[EventStream] Error stack:', error.stack);
      }
    };
    console.log(`🎯 [EventStream] Setting callback before starting event stream`);
    eventStreamService.setOnEventsProcessed(callback);
    eventStreamService.start(currentBranchId, storeId).catch((error: unknown) => {
      console.error('[EventStream] ❌ Failed to start event stream:', error);
    });
    return () => {
      console.log(`🛑 [EventStream] Stopping event stream for branch ${currentBranchId}`);
      eventStreamService.stop(currentBranchId);
      eventStreamService.setOnEventsProcessed(undefined);
    };
  }, [storeId, currentBranchId, isOnline, holdForColdStart, refreshData, refreshCashDrawerStatus]);
}
