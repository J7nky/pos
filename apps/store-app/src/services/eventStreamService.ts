/**
 * Event Stream Service
 * 
 * Replaces table-wide polling with event-driven sync using branch_event_log.
 * 
 * Architecture:
 * 1. Subscribe to branch_event_log via Supabase Realtime (wake-up signal)
 * 2. On event received, pull events by version (pull-based recovery)
 * 3. Process events sequentially, fetching only affected records
 * 4. Update IndexedDB and last_seen_event_version
 * 
 * Key Properties:
 * - Append-only event log (no conflicts)
 * - Monotonic versioning (sequential processing)
 * - Offline-first (queue events, catch-up on reconnect)
 * - Idempotent (safe to process same event twice)
 */

import { supabase } from '../lib/supabase';
import { db } from '../lib/db';
import { RealtimeChannel } from '@supabase/supabase-js';

export interface BranchEvent {
  id: string;
  store_id: string;
  branch_id: string;
  event_type: string;
  entity_type: string;
  entity_id: string;
  operation: 'insert' | 'update' | 'reverse';
  version: number;
  occurred_at: string;
  user_id?: string;
  metadata?: Record<string, any>;
}

export interface SyncState {
  branch_id: string;
  last_seen_event_version: number;
  updated_at: string;
}

export interface EventProcessingResult {
  processed: number;
  errors: string[];
  last_version: number;
}

export class EventStreamService {
  private channels: Map<string, RealtimeChannel> = new Map();
  private isProcessing: Map<string, boolean> = new Map();
  private eventQueue: Map<string, BranchEvent[]> = new Map();
  private catchUpInterval: Map<string, NodeJS.Timeout> = new Map();
  private onEventsProcessedCallback?: (result: EventProcessingResult) => void;
  
  // Configuration
  private readonly BATCH_SIZE = 100;
  private readonly CATCH_UP_INTERVAL_MS = 60000; // 1 minute safety net
  private readonly MAX_RETRIES = 3;
  private readonly RETRY_DELAY_MS = 2000;

  /**
   * Set callback to be notified when events are processed
   */
  setOnEventsProcessed(callback: ((result: EventProcessingResult) => void) | undefined): void {
    this.onEventsProcessedCallback = callback;
  }

  /**
   * Start event stream for a branch
   * Sets up Realtime subscription and initial catch-up
   */
  async start(branchId: string, storeId: string): Promise<void> {
    if (this.channels.has(branchId)) {
      console.log(`[EventStream] Already subscribed to branch ${branchId}`);
      return;
    }

    console.log(`[EventStream] Starting event stream for branch ${branchId}`);

    // 1. Perform initial catch-up
    await this.catchUp(branchId, storeId);

    // 2. Set up Realtime subscription
    await this.subscribeToRealtime(branchId, storeId);

    // 3. Set up periodic catch-up (safety net)
    this.schedulePeriodicCatchUp(branchId, storeId);
  }

  /**
   * Stop event stream for a branch
   */
  async stop(branchId: string): Promise<void> {
    // Unsubscribe from Realtime
    const channel = this.channels.get(branchId);
    if (channel) {
      await supabase.removeChannel(channel);
      this.channels.delete(branchId);
    }

    // Clear catch-up interval
    const interval = this.catchUpInterval.get(branchId);
    if (interval) {
      clearInterval(interval);
      this.catchUpInterval.delete(branchId);
    }

    // Clear processing flag
    this.isProcessing.delete(branchId);
    this.eventQueue.delete(branchId);

    console.log(`[EventStream] Stopped event stream for branch ${branchId}`);
  }

  /**
   * Subscribe to branch_event_log via Supabase Realtime
   * Realtime is used as a wake-up signal, not data source
   */
  private async subscribeToRealtime(branchId: string, storeId: string): Promise<void> {
    const channel = supabase
      .channel(`branch_events:${branchId}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'branch_event_log',
          filter: `branch_id=eq.${branchId}`,
        },
        async (payload) => {
          // Realtime message is just a signal
          // We'll pull the actual event by version
          const event = payload.new as BranchEvent;
          console.log(`[EventStream] Realtime signal: event ${event.id} version ${event.version}`);

          // Trigger catch-up (will pull all events > last_version)
          await this.catchUp(branchId, storeId);
        }
      )
      .subscribe((status) => {
        if (status === 'SUBSCRIBED') {
          console.log(`[EventStream] Realtime subscribed for branch ${branchId}`);
        } else if (status === 'CHANNEL_ERROR') {
          console.error(`[EventStream] Realtime error for branch ${branchId}`);
        }
      });

    this.channels.set(branchId, channel);
  }

  /**
   * Catch-up sync: pull events since last_seen_event_version
   * This is the core sync algorithm - pull-based, sequential, idempotent
   */
  async catchUp(branchId: string, storeId: string): Promise<EventProcessingResult> {
    // Prevent concurrent catch-up for same branch
    if (this.isProcessing.get(branchId)) {
      console.log(`[EventStream] Catch-up already in progress for branch ${branchId}`);
      return { processed: 0, errors: [], last_version: 0 };
    }

    this.isProcessing.set(branchId, true);

    try {
      // 1. Get last seen version from IndexedDB
      const syncState = await this.getSyncState(branchId);
      const lastVersion = syncState?.last_seen_event_version || 0;

      console.log(`[EventStream] Catching up from version ${lastVersion} for branch ${branchId}`);

      // 2. Pull events since last version
      const events = await this.pullEvents(branchId, lastVersion);

      if (events.length === 0) {
        console.log(`[EventStream] No new events for branch ${branchId}`);
        return { processed: 0, errors: [], last_version: lastVersion };
      }

      console.log(`[EventStream] Found ${events.length} new events for branch ${branchId}`);

      // 3. Process events sequentially
      console.log(`[EventStream] About to call processEvents with ${events.length} events`);
      const result = await this.processEvents(branchId, storeId, events);
      console.log(`[EventStream] processEvents returned:`, {
        processed: result.processed,
        errors: result.errors.length,
        last_version: result.last_version,
        lastVersion_before: lastVersion
      });

      // 4. Update last seen version
      if (result.last_version > lastVersion) {
        console.log(`[EventStream] Updating sync state from version ${lastVersion} to ${result.last_version}`);
        await this.updateSyncState(branchId, result.last_version);
        console.log(`[EventStream] Sync state updated successfully`);
      } else {
        console.log(`[EventStream] Not updating sync state: result.last_version (${result.last_version}) <= lastVersion (${lastVersion})`);
      }

      // 5. Notify callback if events were processed
      if (result.processed > 0 && this.onEventsProcessedCallback) {
        console.log(`[EventStream] Notifying callback: ${result.processed} events processed`);
        try {
          this.onEventsProcessedCallback(result);
          console.log(`[EventStream] Callback executed successfully`);
        } catch (callbackError) {
          console.error(`[EventStream] Error in callback:`, callbackError);
        }
      } else {
        console.log(`[EventStream] Not calling callback:`, {
          processed: result.processed,
          hasCallback: !!this.onEventsProcessedCallback
        });
      }

      return result;
    } catch (error) {
      console.error(`[EventStream] Catch-up error for branch ${branchId}:`, error);
      return {
        processed: 0,
        errors: [error instanceof Error ? error.message : 'Unknown error'],
        last_version: 0,
      };
    } finally {
      this.isProcessing.set(branchId, false);
    }
  }

  /**
   * Pull events from branch_event_log
   * Fetches events with version > lastVersion, ordered by version
   */
  private async pullEvents(branchId: string, lastVersion: number): Promise<BranchEvent[]> {
    const { data, error } = await supabase
      .from('branch_event_log')
      .select('*')
      .eq('branch_id', branchId)
      .gt('version', lastVersion)
      .order('version', { ascending: true })
      .limit(this.BATCH_SIZE);

    if (error) {
      throw new Error(`Failed to pull events: ${error.message}`);
    }

    return (data || []) as BranchEvent[];
  }

  /**
   * Process events sequentially
   * For each event, fetch the affected record and update IndexedDB
   */
  private async processEvents(
    branchId: string,
    storeId: string,
    events: BranchEvent[]
  ): Promise<EventProcessingResult> {
    const errors: string[] = [];
    let processed = 0;
    let lastVersion = 0;

    console.log(`[EventStream] Processing ${events.length} events for branch ${branchId}`);
    console.log(`[EventStream] Events array:`, events.map(e => ({ id: e.id, version: e.version, entity_type: e.entity_type, entity_id: e.entity_id })));

    if (!events || events.length === 0) {
      console.warn(`[EventStream] Events array is empty or null`);
      return { processed: 0, errors: [], last_version: 0 };
    }

    for (let i = 0; i < events.length; i++) {
      const event = events[i];
      if (!event) {
        console.warn(`[EventStream] Event at index ${i} is null or undefined`);
        continue;
      }

      try {
        console.log(`[EventStream] Starting to process event ${event.id} (version ${event.version}, index ${i}/${events.length})`);
        console.log(`[EventStream] Event details:`, {
          id: event.id,
          event_type: event.event_type,
          entity_type: event.entity_type,
          entity_id: event.entity_id,
          operation: event.operation,
          version: event.version
        });
        await this.processEvent(event, storeId);
        processed++;
        lastVersion = Math.max(lastVersion, event.version);
        console.log(`[EventStream] Successfully processed event ${event.id} (version ${event.version})`);
      } catch (error) {
        const errorMsg = `Failed to process event ${event.id} (${event.event_type}): ${
          error instanceof Error ? error.message : 'Unknown error'
        }`;
        console.error(`[EventStream] ${errorMsg}`, error);
        if (error instanceof Error) {
          console.error(`[EventStream] Error stack:`, error.stack);
        }
        errors.push(errorMsg);
        // Continue processing (don't block on one bad event)
      }
    }

    console.log(`[EventStream] Processed ${processed}/${events.length} events, last version: ${lastVersion}`);
    if (errors.length > 0) {
      console.warn(`[EventStream] ${errors.length} errors during processing:`, errors);
    }

    return { processed, errors, last_version: lastVersion };
  }

  /**
   * Process a single event
   * Fetches the affected record and updates IndexedDB
   */
  private async processEvent(event: BranchEvent, storeId: string): Promise<void> {
    console.log(
      `[EventStream] Processing event: ${event.event_type} ${event.operation} on ${event.entity_type}/${event.entity_id}`
    );

    // Handle reverse operations (deletions)
    if (event.operation === 'reverse') {
      console.log(`[EventStream] Handling reverse operation for ${event.entity_type}/${event.entity_id}`);
      await this.handleReverse(event);
      console.log(`[EventStream] Reverse operation completed for ${event.entity_type}/${event.entity_id}`);
      return;
    }

    // Fetch the affected record from Supabase
    console.log(`[EventStream] Fetching record ${event.entity_type}/${event.entity_id} from Supabase`);
    const record = await this.fetchAffectedRecord(event.entity_type, event.entity_id, storeId);

    if (!record) {
      // Record might have been deleted or doesn't exist yet
      // This is OK - we'll catch it on next sync
      console.warn(
        `[EventStream] Record ${event.entity_type}/${event.entity_id} not found, skipping`
      );
      return;
    }

    console.log(`[EventStream] Fetched record ${event.entity_type}/${event.entity_id}, updating IndexedDB`);
    // Update IndexedDB
    await this.updateIndexedDB(event.entity_type, record, event.operation === 'insert');
    console.log(`[EventStream] Completed processing event ${event.id}`);
  }

  /**
   * Fetch the affected record from Supabase
   * Only fetches the specific record, not the whole table
   */
  private async fetchAffectedRecord(
    entityType: string,
    entityId: string,
    storeId: string
  ): Promise<any | null> {
    const tableName = this.mapEntityTypeToTable(entityType);
    if (!tableName) {
      throw new Error(`Unknown entity type: ${entityType}`);
    }

    // Build query with store filter
    let query = supabase.from(tableName).select('*').eq('id', entityId).single();

    // Apply store filter if needed
    if (tableName !== 'stores' && tableName !== 'transactions') {
      if (tableName === 'products') {
        query = query.or(`store_id.eq.${storeId},is_global.eq.true`);
      } else {
        query = query.eq('store_id', storeId);
      }
    } else if (tableName === 'stores') {
      query = query.eq('id', storeId);
    }

    const { data, error } = await query;

    if (error) {
      if (error.code === 'PGRST116') {
        // Record not found - might have been deleted
        return null;
      }
      throw new Error(`Failed to fetch ${tableName}/${entityId}: ${error.message}`);
    }

    return data;
  }

  /**
   * Update IndexedDB with the fetched record
   */
  private async updateIndexedDB(entityType: string, record: any, isInsert: boolean): Promise<void> {
    const tableName = this.mapEntityTypeToTable(entityType);
    if (!tableName) {
      throw new Error(`Unknown entity type: ${entityType}`);
    }

    const table = (db as any)[tableName];
    if (!table) {
      throw new Error(`Table ${tableName} not found in IndexedDB`);
    }

    // Normalize record for IndexedDB
    const normalized = this.normalizeRecord(record, tableName);

    // Upsert to IndexedDB
    await table.put({
      ...normalized,
      _synced: true,
      _lastSyncedAt: new Date().toISOString(),
    });

    console.log(`[EventStream] Updated ${tableName}/${normalized.id} in IndexedDB`);
  }

  /**
   * Handle reverse operations (deletions/cancellations)
   */
  private async handleReverse(event: BranchEvent): Promise<void> {
    const tableName = this.mapEntityTypeToTable(event.entity_type);
    if (!tableName) {
      throw new Error(`Unknown entity type: ${event.entity_type}`);
    }

    const table = (db as any)[tableName];
    if (!table) {
      throw new Error(`Table ${tableName} not found in IndexedDB`);
    }

    // Delete from IndexedDB
    await table.delete(event.entity_id);
    console.log(`[EventStream] Reversed ${tableName}/${event.entity_id} in IndexedDB`);
  }

  /**
   * Map entity_type to table name
   */
  private mapEntityTypeToTable(entityType: string): string | null {
    const mapping: Record<string, string> = {
      bill: 'bills',
      bill_line_item: 'bill_line_items',
      transaction: 'transactions',
      journal_entry: 'journal_entries',
      inventory_item: 'inventory_items',
      inventory_bill: 'inventory_bills',
      entity: 'entities',
      cash_drawer_session: 'cash_drawer_sessions',
      cash_drawer_account: 'cash_drawer_accounts',
      product: 'products',
      reminder: 'reminders',
      missed_product: 'missed_products',
    };

    return mapping[entityType] || null;
  }

  /**
   * Normalize record for IndexedDB (handle boolean conversions, etc.)
   */
  private normalizeRecord(record: any, tableName: string): any {
    const normalized = { ...record };

    // Normalize is_global for products
    if (tableName === 'products' && normalized.is_global !== undefined) {
      normalized.is_global = normalized.is_global === true || normalized.is_global === 1 ? 1 : 0;
    }

    // Normalize is_deleted for stores/branches
    if ((tableName === 'stores' || tableName === 'branches') && normalized.is_deleted !== undefined) {
      normalized._deleted = normalized.is_deleted === true || normalized.is_deleted === 1;
      delete normalized.is_deleted;
      delete normalized.deleted_at;
      delete normalized.deleted_by;
    }

    return normalized;
  }

  /**
   * Get sync state from IndexedDB
   */
  private async getSyncState(branchId: string): Promise<SyncState | null> {
    try {
      const state = await db.sync_state.get(branchId);
      if (state) {
        return {
          branch_id: state.branch_id,
          last_seen_event_version: state.last_seen_event_version,
          updated_at: state.updated_at,
        };
      }
      return null;
    } catch (error) {
      // If sync_state table doesn't exist, return null (will start from version 0)
      console.warn(`[EventStream] Could not get sync state: ${error}`);
      return null;
    }
  }

  /**
   * Update sync state in IndexedDB
   */
  private async updateSyncState(branchId: string, lastVersion: number): Promise<void> {
    try {
      await db.sync_state.put({
        branch_id: branchId,
        last_seen_event_version: lastVersion,
        updated_at: new Date().toISOString(),
      });
    } catch (error) {
      // If sync_state table doesn't exist, log warning
      console.warn(`[EventStream] Could not update sync state: ${error}`);
    }
  }

  /**
   * Schedule periodic catch-up as safety net
   * Runs every CATCH_UP_INTERVAL_MS to catch any missed events
   */
  private schedulePeriodicCatchUp(branchId: string, storeId: string): void {
    const interval = setInterval(async () => {
      console.log(`[EventStream] Periodic catch-up for branch ${branchId}`);
      await this.catchUp(branchId, storeId);
    }, this.CATCH_UP_INTERVAL_MS);

    this.catchUpInterval.set(branchId, interval);
  }

  /**
   * Get current sync state (for debugging/monitoring)
   */
  async getCurrentState(branchId: string): Promise<SyncState | null> {
    return this.getSyncState(branchId);
  }
}

// Export singleton instance
export const eventStreamService = new EventStreamService();

