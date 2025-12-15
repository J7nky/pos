/**
 * Sync Trigger Service
 * 
 * Generic service to automatically trigger sync for all database write operations.
 * This ensures that any operation that marks a record as _synced: false will
 * automatically trigger a debounced sync, eliminating the need to manually call
 * debouncedSync() in every function.
 * 
 * Usage:
 * - Called automatically from Dexie hooks when _synced: false is detected
 * - Can also be called manually if needed
 * - Uses callbacks from crudHelperService (which are set up in OfflineDataContext)
 */

import { crudHelperService } from './crudHelperService';

class SyncTriggerService {
  private syncTriggered = false;
  private syncTimeout: NodeJS.Timeout | null = null;
  private readonly DEBOUNCE_MS = 1000; // 1 second debounce

  /**
   * Trigger sync (debounced)
   * This is safe to call from Dexie hooks as it defers execution
   */
  triggerSync(): void {
    console.log('🔄 [SyncTrigger] triggerSync() called');
    
    // Clear existing timeout
    if (this.syncTimeout) {
      clearTimeout(this.syncTimeout);
    }

    // Mark that sync was triggered
    this.syncTriggered = true;

    // Defer execution to after current transaction completes
    // This is safe to call from Dexie hooks
    this.syncTimeout = setTimeout(async () => {
      console.log('🔄 [SyncTrigger] Executing sync after debounce');
      await this.executeSync();
      this.syncTimeout = null;
    }, this.DEBOUNCE_MS);
  }

  /**
   * Execute sync using callbacks from crudHelperService
   */
  private async executeSync(): Promise<void> {
    if (!this.syncTriggered) {
      return;
    }

    this.syncTriggered = false;

    // Get callbacks from crudHelperService
    // These are set up in OfflineDataContext and include:
    // - onResetAutoSyncTimer
    // - onDebouncedSync
    // - onUpdateUnsyncedCount (important: update count before triggering sync)
    const callbacks = (crudHelperService as any).callbacks;

    // If callbacks are available, use them
    if (callbacks?.onResetAutoSyncTimer || callbacks?.onDebouncedSync) {
      console.log('🔄 [SyncTrigger] Callbacks available, executing sync');
      
      // CRITICAL: Update unsynced count first, then trigger sync
      // This ensures debouncedSync sees the correct unsynced count
      if (callbacks.onUpdateUnsyncedCount) {
        try {
          console.log('🔄 [SyncTrigger] Updating unsynced count...');
          await callbacks.onUpdateUnsyncedCount();
          console.log('🔄 [SyncTrigger] Unsynced count updated');
        } catch (error) {
          console.warn('⚠️ [SyncTrigger] Failed to update unsynced count:', error);
        }
      }

      if (callbacks.onResetAutoSyncTimer) {
        console.log('🔄 [SyncTrigger] Resetting auto-sync timer');
        callbacks.onResetAutoSyncTimer();
      }

      if (callbacks.onDebouncedSync) {
        console.log('🔄 [SyncTrigger] Triggering debounced sync');
        callbacks.onDebouncedSync();
      } else {
        console.warn('⚠️ [SyncTrigger] onDebouncedSync callback not available');
      }
    } else {
      // Fallback: If callbacks aren't set up yet, log a warning
      // This can happen if hooks fire before OfflineDataContext initializes
      console.warn('⚠️ Sync trigger service: Callbacks not available yet. Sync will be triggered when callbacks are set up.');
      // Re-trigger sync after a delay to give callbacks time to be set up
      setTimeout(async () => {
        const retryCallbacks = (crudHelperService as any).callbacks;
        if (retryCallbacks) {
          if (retryCallbacks.onUpdateUnsyncedCount) {
            try {
              await retryCallbacks.onUpdateUnsyncedCount();
            } catch (error) {
              console.warn('Failed to update unsynced count on retry:', error);
            }
          }
          if (retryCallbacks.onDebouncedSync) {
            retryCallbacks.onDebouncedSync();
          }
        }
      }, 2000);
    }
  }

  /**
   * Clear any pending sync triggers
   */
  clear(): void {
    if (this.syncTimeout) {
      clearTimeout(this.syncTimeout);
      this.syncTimeout = null;
    }
    this.syncTriggered = false;
  }
}

export const syncTriggerService = new SyncTriggerService();

