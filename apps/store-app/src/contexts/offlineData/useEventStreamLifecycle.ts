import { useEffect } from 'react';
import { eventStreamService } from '../../services/syncOrchestrator';
import { entityBalanceCache } from '../../services/entityBalanceCache';
import { invalidateCashDrawerBalanceCache } from '../../utils/cacheManager';
import type { OfflineSyncSessionState } from './offlineDataContextContract';

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
    const callback = async (result: { processed: number }) => {
      console.log(`🔄 [EventStream] Callback invoked: ${result.processed} events processed`);
      if (result.processed > 0) {
        try {
          console.log(`🔄 [EventStream] Calling refreshData() to update UI...`);
          // Invalidate derived-balance caches before downstream consumers refetch.
          // Remote events (payments, journal entries from other devices) change
          // entity balances and cash drawer totals, but their caches are not
          // mutation-driven — without this, consumers read stale values until TTL.
          entityBalanceCache.invalidateAll();
          invalidateCashDrawerBalanceCache();
          await refreshData();
          await refreshCashDrawerStatus();
          window.dispatchEvent(
            new CustomEvent('data-synced', {
              detail: { processed: result.processed, timestamp: new Date().toISOString() },
            })
          );
          // Also notify cash-drawer-specific listeners (CashDrawerMonitor,
          // CashDrawerBalanceReport, etc.) — they predate `data-synced` and only
          // listen for `cash-drawer-updated`.
          window.dispatchEvent(
            new CustomEvent('cash-drawer-updated', {
              detail: { event: 'remote-sync', processed: result.processed },
            })
          );
          console.log(`✅ [EventStream] Data and cash drawer status refreshed`);
        } catch (error) {
          console.error('[EventStream] ❌ Error refreshing data after events:', error);
          if (error instanceof Error) console.error('[EventStream] Error stack:', error.stack);
        }
      } else {
        console.log(`🔄 [EventStream] Callback invoked but no events processed (processed=${result.processed})`);
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
