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
import { getDB } from '../lib/db';
import { RealtimeChannel } from '@supabase/supabase-js';

// Get singleton database instance
const db = getDB();

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
  private reconnectTimeouts: Map<string, NodeJS.Timeout> = new Map();
  private onEventsProcessedCallback?: (result: EventProcessingResult) => void | Promise<void>;
  
  // Configuration
  private readonly BATCH_SIZE = 100;
  private readonly CATCH_UP_INTERVAL_MS = 60000; // 1 minute safety net (reduced from 5 min for faster catch-up)
  private readonly MAX_RETRIES = 3;
  private readonly RETRY_DELAY_MS = 2000;

  /**
   * Set callback to be notified when events are processed
   */
  setOnEventsProcessed(callback: ((result: EventProcessingResult) => void | Promise<void>) | undefined): void {
    console.log(`[EventStream] Setting callback:`, callback ? 'callback provided' : 'callback cleared');
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
    // Clear reconnect timeout
    const reconnectTimeout = this.reconnectTimeouts.get(branchId);
    if (reconnectTimeout) {
      clearTimeout(reconnectTimeout);
      this.reconnectTimeouts.delete(branchId);
    }

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
    // Clear any existing reconnect timeout
    const existingTimeout = this.reconnectTimeouts.get(branchId);
    if (existingTimeout) {
      clearTimeout(existingTimeout);
      this.reconnectTimeouts.delete(branchId);
    }

    // Remove existing channel if it exists (to avoid duplicates)
    const existingChannel = this.channels.get(branchId);
    if (existingChannel) {
      console.log(`[EventStream] Removing existing channel for branch ${branchId} before reconnecting`);
      try {
        await supabase.removeChannel(existingChannel);
      } catch (error) {
        console.warn(`[EventStream] Error removing existing channel:`, error);
      }
      this.channels.delete(branchId);
    }

    console.log(`[EventStream] Setting up Realtime subscription for branch ${branchId}`);
    
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
        console.log(`[EventStream] Realtime subscription status for branch ${branchId}: ${status}`);
        if (status === 'SUBSCRIBED') {
          console.log(`✅ [EventStream] Realtime subscribed successfully for branch ${branchId}`);
          // Clear any reconnect timeout since we're successfully connected
          const timeout = this.reconnectTimeouts.get(branchId);
          if (timeout) {
            clearTimeout(timeout);
            this.reconnectTimeouts.delete(branchId);
          }
        } else if (status === 'CHANNEL_ERROR') {
          console.error(`❌ [EventStream] Realtime error for branch ${branchId} - attempting to reconnect...`);
          this.scheduleReconnect(branchId, storeId, 2000); // Retry after 2 seconds
        } else if (status === 'TIMED_OUT') {
          console.warn(`⏱️ [EventStream] Realtime subscription timed out for branch ${branchId} - attempting to reconnect...`);
          this.scheduleReconnect(branchId, storeId, 3000); // Retry after 3 seconds
        } else if (status === 'CLOSED') {
          console.warn(`🔒 [EventStream] Realtime subscription closed for branch ${branchId} - attempting to reconnect...`);
          // Only reconnect if we're still supposed to be connected (channel exists in map)
          if (this.channels.has(branchId)) {
            this.scheduleReconnect(branchId, storeId, 2000); // Retry after 2 seconds
          } else {
            console.log(`[EventStream] Channel was intentionally stopped, not reconnecting`);
          }
        } else {
          console.log(`ℹ️ [EventStream] Realtime subscription status changed to: ${status} for branch ${branchId}`);
        }
      });

    this.channels.set(branchId, channel);
    console.log(`[EventStream] Realtime channel created for branch ${branchId}, waiting for subscription...`);
  }

  /**
   * Schedule a reconnection attempt for a branch
   */
  private scheduleReconnect(branchId: string, storeId: string, delayMs: number): void {
    // Don't schedule multiple reconnects
    if (this.reconnectTimeouts.has(branchId)) {
      console.log(`[EventStream] Reconnect already scheduled for branch ${branchId}, skipping`);
      return;
    }

    console.log(`[EventStream] Scheduling reconnect for branch ${branchId} in ${delayMs}ms`);
    const timeout = setTimeout(async () => {
      this.reconnectTimeouts.delete(branchId);
      console.log(`[EventStream] Attempting to reconnect for branch ${branchId}...`);
      try {
        await this.subscribeToRealtime(branchId, storeId);
      } catch (error) {
        console.error(`[EventStream] Reconnection failed for branch ${branchId}:`, error);
        // Retry with exponential backoff (double the delay)
        this.scheduleReconnect(branchId, storeId, Math.min(delayMs * 2, 30000)); // Max 30 seconds
      }
    }, delayMs);

    this.reconnectTimeouts.set(branchId, timeout);
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
      let lastVersion = syncState?.last_seen_event_version || 0;

      // ✅ FIX 3: Enhanced sync state initialization
      // If no sync state exists, check if database has data and initialize accordingly
      if (!syncState && lastVersion === 0) {
        console.log(`[EventStream] No sync state found for branch ${branchId}, checking if database has data...`);
        
        // Check if database has any data (pick a table that's likely to have records)
        const hasData = await getDB().products.limit(1).count() > 0 || 
                        await getDB().bills.limit(1).count() > 0 ||
                        await getDB().transactions.limit(1).count() > 0;

        if (hasData) {
          // Database has data but no sync state - initialize to current max version
          // This prevents replaying all historical events when event stream starts
          console.log(`[EventStream] Database has data but no sync state - initializing to current max version to avoid replaying all events`);
          try {
            await this.initializeSyncState(branchId);
            
            // Fetch the newly initialized sync state
            const newSyncState = await this.getSyncState(branchId);
            lastVersion = newSyncState?.last_seen_event_version || 0;
            console.log(`[EventStream] ✅ Initialized sync state to version ${lastVersion} for branch ${branchId}`);
          } catch (initError) {
            console.warn(`[EventStream] ⚠️ Failed to initialize sync state, will start from version 0:`, initError);
            // Continue with lastVersion = 0 if initialization fails
          }
        } else {
          console.log(`[EventStream] Database is empty - will start from version 0 (expected on first sync)`);
        }
      }

      console.log(`[EventStream] Catching up from version ${lastVersion} for branch ${branchId}`);

      // 3. Pull events since last version
      const events = await this.pullEvents(branchId, lastVersion);

      if (events.length === 0) {
        console.log(`[EventStream] No new events for branch ${branchId}`);
        return { processed: 0, errors: [], last_version: lastVersion };
      }

      console.log(`[EventStream] Found ${events.length} new events for branch ${branchId} (versions ${events[0]?.version} to ${events[events.length - 1]?.version})`);

      // 4. Process events sequentially
      console.log(`[EventStream] About to call processEvents with ${events.length} events`);
      const result = await this.processEvents(branchId, storeId, events);
      console.log(`[EventStream] processEvents returned:`, {
        processed: result.processed,
        errors: result.errors.length,
        last_version: result.last_version,
        lastVersion_before: lastVersion
      });

      // 5. Update last seen version
      if (result.last_version > lastVersion) {
        console.log(`[EventStream] Updating sync state from version ${lastVersion} to ${result.last_version}`);
        await this.updateSyncState(branchId, result.last_version);
        console.log(`[EventStream] Sync state updated successfully`);
      } else {
        console.log(`[EventStream] Not updating sync state: result.last_version (${result.last_version}) <= lastVersion (${lastVersion})`);
      }

      // 5. Notify callback if events were processed
      console.log(`[EventStream] Checking callback: processed=${result.processed}, hasCallback=${!!this.onEventsProcessedCallback}`);
      if (result.processed > 0 && this.onEventsProcessedCallback) {
        console.log(`[EventStream] ✅ Notifying callback: ${result.processed} events processed`);
        try {
          await this.onEventsProcessedCallback(result);
          console.log(`[EventStream] ✅ Callback executed successfully`);
        } catch (callbackError) {
          console.error(`[EventStream] ❌ Error in callback:`, callbackError);
          if (callbackError instanceof Error) {
            console.error(`[EventStream] Callback error stack:`, callbackError.stack);
          }
        }
      } else {
        console.log(`[EventStream] ⚠️ Not calling callback:`, {
          processed: result.processed,
          hasCallback: !!this.onEventsProcessedCallback,
          reason: result.processed === 0 ? 'no events processed' : 'callback not set'
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
   * Deduplicate events by keeping only the latest version for each entity
   * This optimizes processing when the same entity has multiple updates
   * 
   * Edge cases handled:
   * - Bulk events: Not deduplicated (they're already optimized)
   * - Reverse operations: Always kept (they're deletions)
   * - Different operations: Keep latest version regardless of operation type
   */
  private deduplicateEvents(events: BranchEvent[]): BranchEvent[] {
    // Separate events into groups: bulk events, reverse operations, and regular events
    const bulkEvents: BranchEvent[] = [];
    const reverseEvents: BranchEvent[] = [];
    const regularEvents: BranchEvent[] = [];

    for (const event of events) {
      if (this.isBulkEvent(event.event_type)) {
        // Bulk events are not deduplicated
        bulkEvents.push(event);
      } else if (event.operation === 'reverse') {
        // Reverse operations are always kept (they're deletions)
        reverseEvents.push(event);
      } else {
        // Regular events can be deduplicated
        regularEvents.push(event);
      }
    }

    // Deduplicate regular events by entity (entity_type + entity_id)
    const entityMap = new Map<string, BranchEvent>();
    
    for (const event of regularEvents) {
      const key = `${event.entity_type}:${event.entity_id}`;
      const existing = entityMap.get(key);
      
      // Keep the event with the highest version for each entity
      if (!existing || event.version > existing.version) {
        entityMap.set(key, event);
      }
    }
    
    // Convert back to array, sorted by version
    const deduplicatedRegular = Array.from(entityMap.values());
    deduplicatedRegular.sort((a, b) => a.version - b.version);
    
    // Combine all events: bulk events, reverse events, and deduplicated regular events
    const deduplicated = [
      ...bulkEvents,
      ...reverseEvents,
      ...deduplicatedRegular
    ].sort((a, b) => a.version - b.version);
    
    const originalCount = events.length;
    const deduplicatedCount = deduplicated.length;
    
    if (originalCount > deduplicatedCount) {
      console.log(
        `[EventStream] Deduplicated ${originalCount} events → ${deduplicatedCount} events ` +
        `(${originalCount - deduplicatedCount} duplicates removed)`
      );
    }
    
    return deduplicated;
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

    // OPTIMIZATION: Deduplicate events for same entity
    // This reduces network calls when the same entity has multiple updates
    const deduplicatedEvents = this.deduplicateEvents(events);

    // Calculate lastVersion from original events array to ensure we don't skip versions
    // This is important for sync state tracking
    for (const event of events) {
      if (event) {
        lastVersion = Math.max(lastVersion, event.version);
      }
    }

    for (let i = 0; i < deduplicatedEvents.length; i++) {
      const event = deduplicatedEvents[i];
      if (!event) {
        console.warn(`[EventStream] Event at index ${i} is null or undefined`);
        continue;
      }

      try {
        console.log(`[EventStream] Starting to process event ${event.id} (version ${event.version}, index ${i}/${deduplicatedEvents.length})`);
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

    console.log(`[EventStream] Processed ${processed}/${deduplicatedEvents.length} deduplicated events (from ${events.length} original events), last version: ${lastVersion}`);
    if (errors.length > 0) {
      console.warn(`[EventStream] ${errors.length} errors during processing:`, errors);
    }

    return { processed, errors, last_version: lastVersion };
  }

  /**
   * Process a single event
   * Fetches the affected record and updates IndexedDB
   * Handles both single-record events and bulk events
   */
  private async processEvent(event: BranchEvent, storeId: string): Promise<void> {
    console.log(
      `[EventStream] Processing event: ${event.event_type} ${event.operation} on ${event.entity_type}/${event.entity_id}`
    );

    // Handle bulk events (products_bulk_updated, entities_bulk_updated, etc.)
    if (this.isBulkEvent(event.event_type)) {
      console.log(`[EventStream] Processing bulk event: ${event.event_type}`);
      await this.processBulkEvent(event, storeId);
      return;
    }

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
   * Check if event type is a bulk event
   */
  private isBulkEvent(eventType: string): boolean {
    const bulkEventTypes = [
      'products_bulk_updated',
      'entities_bulk_updated',
      'users_bulk_updated',
    ];
    return bulkEventTypes.includes(eventType);
  }

  /**
   * Process bulk events efficiently
   * Instead of fetching records one by one, fetch all affected records in a single query
   */
  private async processBulkEvent(event: BranchEvent, storeId: string): Promise<void> {
    const metadata = event.metadata;
    if (!metadata) {
      console.warn(`[EventStream] Bulk event ${event.id} has no metadata, skipping`);
      return;
    }

    const tableName = this.mapEntityTypeToTable(event.entity_type);
    if (!tableName) {
      throw new Error(`Unknown entity type for bulk event: ${event.entity_type}`);
    }

    let affectedIds: string[] = [];

    // Extract affected IDs based on event type
    if (event.event_type === 'products_bulk_updated' && metadata.affected_product_ids) {
      affectedIds = metadata.affected_product_ids;
    } else if (event.event_type === 'entities_bulk_updated' && metadata.affected_entity_ids) {
      affectedIds = metadata.affected_entity_ids;
    } else if (event.event_type === 'users_bulk_updated' && metadata.affected_user_ids) {
      affectedIds = metadata.affected_user_ids;
    } else {
      console.warn(`[EventStream] Bulk event ${event.id} missing affected IDs in metadata`);
      return;
    }

    if (affectedIds.length === 0) {
      console.warn(`[EventStream] Bulk event ${event.id} has empty affected IDs list`);
      return;
    }

    console.log(`[EventStream] Processing bulk event with ${affectedIds.length} affected records`);

    // Handle bulk deletions
    if (event.operation === 'reverse') {
      console.log(`[EventStream] Bulk deletion of ${affectedIds.length} ${tableName} records`);
      const table = (db as any)[tableName];
      if (table) {
        for (const id of affectedIds) {
          await table.delete(id);
          console.log(`[EventStream] Deleted ${tableName}/${id} from IndexedDB`);
        }
      }
      return;
    }

    // Fetch all affected records in a single query
    try {
      let query = supabase.from(tableName).select('*').in('id', affectedIds);

      // Apply store filter based on table type
      if (tableName === 'products') {
        query = query.or(`store_id.eq.${storeId},is_global.eq.true`);
      } else if (tableName === 'role_permissions') {
        // GLOBAL table - no store_id filter (download all global permissions)
        // No filter needed
      } else if (tableName !== 'stores' && tableName !== 'transactions') {
        query = query.eq('store_id', storeId);
      }

      const { data: records, error } = await query;

      if (error) {
        throw new Error(`Failed to fetch bulk ${tableName}: ${error.message}`);
      }

      if (!records || records.length === 0) {
        console.warn(`[EventStream] Bulk query returned no records for ${tableName}`);
        return;
      }

      console.log(`[EventStream] Fetched ${records.length} records for bulk update`);

      // Update all records in IndexedDB
      const table = (db as any)[tableName];
      if (!table) {
        throw new Error(`Table ${tableName} not found in IndexedDB`);
      }

      const normalizedRecords = records.map((record) => {
        const normalized = this.normalizeRecord(record, tableName);
        return {
          ...normalized,
          _synced: true,
          _lastSyncedAt: new Date().toISOString(),
        };
      });

      // Bulk put (upsert) all records at once
      await table.bulkPut(normalizedRecords);

      console.log(`[EventStream] Bulk updated ${normalizedRecords.length} ${tableName} records in IndexedDB`);
    } catch (error) {
      console.error(`[EventStream] Error processing bulk event:`, error);
      throw error;
    }
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
      // For stores, entityId is the store ID - no additional filter needed
      // The query already filters by id=entityId above
      console.log(`[EventStream] Fetching store ${entityId} (entityId matches store ID)`);
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
      customer: 'entities', // Customer is an entity_type = 'customer'
      supplier: 'entities', // Supplier is an entity_type = 'supplier'
      cash_drawer_session: 'cash_drawer_sessions',
      cash_drawer_account: 'cash_drawer_accounts',
      product: 'products',
      reminder: 'reminders',
      missed_product: 'missed_products',
      store: 'stores',
      branch: 'branches',
      user: 'users',
      chart_of_account: 'chart_of_accounts',
      user_module_access: 'user_module_access',
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
      const state = await getDB().sync_state.get(branchId);
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
      await getDB().sync_state.put({
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
   * Initialize sync state with current max version from branch_event_log
   * Should be called after fullResync() to avoid replaying all historical events
   */
  async initializeSyncState(branchId: string): Promise<void> {
    try {
      console.log(`[EventStream] Initializing sync state for branch ${branchId}...`);
      
      // Fetch the current max version from branch_event_log
      const { data, error } = await supabase
        .from('branch_event_log')
        .select('version')
        .eq('branch_id', branchId)
        .order('version', { ascending: false })
        .limit(1)
        .single();

      if (error) {
        // If no events exist yet, that's fine - start from version 0
        if (error.code === 'PGRST116') {
          console.log(`[EventStream] No events found for branch ${branchId}, starting from version 0`);
          await this.updateSyncState(branchId, 0);
          return;
        }
        throw error;
      }

      const maxVersion = data?.version || 0;
      console.log(`[EventStream] Found max version ${maxVersion} for branch ${branchId}`);

      // Update sync state with current max version
      await this.updateSyncState(branchId, maxVersion);
      console.log(`[EventStream] ✅ Sync state initialized to version ${maxVersion} for branch ${branchId}`);
    } catch (error) {
      console.error(`[EventStream] Failed to initialize sync state for branch ${branchId}:`, error);
      // Don't throw - let the service start anyway, it will just replay events
    }
  }

  /**
   * Get current sync state (for debugging/monitoring)
   */
  async getCurrentState(branchId: string): Promise<SyncState | null> {
    return this.getSyncState(branchId);
  }

  /**
   * Manually trigger catch-up for a branch (for debugging/manual sync)
   * Useful when Realtime subscription might have missed events
   */
  async manualCatchUp(branchId: string, storeId: string): Promise<EventProcessingResult> {
    console.log(`[EventStream] Manual catch-up triggered for branch ${branchId}`);
    return this.catchUp(branchId, storeId);
  }

  /**
   * Check if event stream is active for a branch
   */
  isActive(branchId: string): boolean {
    return this.channels.has(branchId);
  }

  /**
   * ✅ FIX 6: Check if event stream is currently processing events for a branch
   * Used for sync coordination to prevent conflicts with performSync()
   */
  isProcessingEvents(branchId: string): boolean {
    return this.isProcessing.get(branchId) === true;
  }
}

// Export singleton instance
export const eventStreamService = new EventStreamService();

