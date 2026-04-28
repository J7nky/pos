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
  private readonly DEBOUNCE_MS = 30000; // 30 seconds debounce

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

    const callbacks = (crudHelperService as any).host;

    if (!callbacks || (!callbacks.onUpdateUnsyncedCount && !callbacks.onPerformSync && !callbacks.onDebouncedSync)) {
      // Lifecycle host not bound yet — retry once after a short delay
      console.warn('⚠️ Sync trigger service: Callbacks not available yet. Retrying in 2s...');
      setTimeout(async () => {
        const retryCallbacks = (crudHelperService as any).host;
        if (retryCallbacks) {
          if (retryCallbacks.onUpdateUnsyncedCount) {
            try { await retryCallbacks.onUpdateUnsyncedCount(); } catch { /* ignore */ }
          }
          if (retryCallbacks.onPerformSync) {
            retryCallbacks.onPerformSync(true);
          } else if (retryCallbacks.onDebouncedSync) {
            retryCallbacks.onDebouncedSync();
          }
        }
      }, 2000);
      return;
    }

    console.log('🔄 [SyncTrigger] Callbacks available, executing sync');

    // Update the UI counter first so the badge is accurate before sync starts.
    if (callbacks.onUpdateUnsyncedCount) {
      try {
        console.log('🔄 [SyncTrigger] Updating unsynced count...');
        await callbacks.onUpdateUnsyncedCount();
        console.log('🔄 [SyncTrigger] Unsynced count updated');
      } catch (error) {
        console.warn('⚠️ [SyncTrigger] Failed to update unsynced count:', error);
      }
    }

    // Use onPerformSync to run the sync immediately — we have already waited 30 s
    // in the debounce timer above, so there is no reason to schedule another
    // 30-second delay via onResetAutoSyncTimer or onDebouncedSync.
    if (callbacks.onPerformSync) {
      console.log('🔄 [SyncTrigger] Triggering performSync directly');
      callbacks.onPerformSync(true);
    } else if (callbacks.onDebouncedSync) {
      // Fallback for older wiring that may not have onPerformSync registered yet
      console.warn('⚠️ [SyncTrigger] onPerformSync not available, falling back to debouncedSync');
      callbacks.onDebouncedSync();
    } else {
      console.warn('⚠️ [SyncTrigger] No sync callback available');
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

