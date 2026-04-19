import { useEffect } from 'react';
import { eventStreamService } from '../../services/syncOrchestrator';

export interface UseEventStreamLifecycleParams {
  storeId: string | null;
  currentBranchId: string | null;
  isOnline: boolean;
  refreshData: () => Promise<void>;
  refreshCashDrawerStatus: () => Promise<void>;
}

export function useEventStreamLifecycle({
  storeId,
  currentBranchId,
  isOnline,
  refreshData,
  refreshCashDrawerStatus,
}: UseEventStreamLifecycleParams): void {
  useEffect(() => {
    if (!storeId || !currentBranchId || !isOnline) {
      console.log(`🛑 [EventStream] Conditions not met, clearing callback:`, {
        hasStoreId: !!storeId,
        hasBranchId: !!currentBranchId,
        isOnline,
      });
      eventStreamService.setOnEventsProcessed(undefined);
      return;
    }

    console.log(`🎯 [EventStream] Starting event stream for branch ${currentBranchId}`);
    const callback = async (result: { processed: number }) => {
      console.log(`🔄 [EventStream] Callback invoked: ${result.processed} events processed`);
      if (result.processed > 0) {
        try {
          console.log(`🔄 [EventStream] Calling refreshData() to update UI...`);
          await refreshData();
          await refreshCashDrawerStatus();
          window.dispatchEvent(
            new CustomEvent('data-synced', {
              detail: { processed: result.processed, timestamp: new Date().toISOString() },
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
  }, [storeId, currentBranchId, isOnline, refreshData, refreshCashDrawerStatus]);
}
