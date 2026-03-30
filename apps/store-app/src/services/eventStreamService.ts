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
import { normalizeBillDateFromRemote } from '../utils/dateUtils';

// Get singleton database instance
const db = getDB();

/**
 * Per-event trace logs (very noisy during large catch-up).
 * Set VITE_EVENT_STREAM_VERBOSE=true in apps/store-app/.env to enable.
 */
const EVENT_STREAM_VERBOSE =
  typeof import.meta !== 'undefined' &&
  String((import.meta as ImportMeta).env?.VITE_EVENT_STREAM_VERBOSE ?? '') === 'true';

function evLog(...args: unknown[]): void {
  if (EVENT_STREAM_VERBOSE) console.log(...args);
}

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
  /** Rows not returned from Supabase (deleted, RLS, or race); not thrown errors */
  skipped_missing?: number;
}

export class EventStreamService {
  private channels: Map<string, RealtimeChannel> = new Map();
  private isProcessing: Map<string, boolean> = new Map();
  private eventQueue: Map<string, BranchEvent[]> = new Map();
  private catchUpInterval: Map<string, NodeJS.Timeout> = new Map();
  private reconnectTimeouts: Map<string, NodeJS.Timeout> = new Map();
  /** Counts consecutive reconnects while never reaching SUBSCRIBED; reset on SUBSCRIBED or stop. */
  private reconnectAttempt: Map<string, number> = new Map();
  /** Throttle reconnect console noise when Realtime keeps closing (misconfig, network, or stale callbacks). */
  private lastReconnectWarnAt: Map<string, number> = new Map();
  private onEventsProcessedCallback?: (result: EventProcessingResult) => void | Promise<void>;

  /**
   * Set of branch IDs for which event processing is suspended while a full
   * sync() is running.  During sync, uploadLocalChanges() emits events via
   * emit_branch_event RPC; those events would otherwise wake the Realtime
   * subscription and trigger catchUp() → pullEvents() → fetchAffectedRecord()
   * — re-downloading records that the sync is already uploading/downloading.
   * Suspending here eliminates that duplicate round-trip.
   */
  private syncSuspendedBranches: Set<string> = new Set();

  /**
   * Suspend event stream processing for a branch while sync() runs.
   * Called by SyncService before upload starts.
   */
  suspendForSync(branchId: string): void {
    this.syncSuspendedBranches.add(branchId);
    evLog(`[EventStream] Event processing suspended for sync on branch ${branchId}`);
  }

  /**
   * Resume event stream processing after sync() finishes.
   * Called by SyncService in the finally block.
   * Schedules a deferred catchUp so any events emitted during the suspended
   * window are replayed — but after sync has committed its own version bump,
   * making those events idempotent (records already in IndexedDB).
   */
  resumeAfterSync(branchId: string, storeId: string): void {
    this.syncSuspendedBranches.delete(branchId);
    evLog(`[EventStream] Event processing resumed after sync on branch ${branchId}`);
    // Defer so initializeSyncState (called by useSyncStateLayer after sync)
    // has a chance to advance last_seen_event_version first.
    setTimeout(() => {
      if (!this.syncSuspendedBranches.has(branchId)) {
        evLog(`[EventStream] Post-sync deferred catchUp for branch ${branchId}`);
        this.catchUp(branchId, storeId).catch(err =>
          console.warn(`[EventStream] Post-sync catchUp error:`, err)
        );
      }
    }, 500);
  }
  
  // Configuration
  private readonly BATCH_SIZE = 100;
  /** Allowed per DEVELOPER_RULES §5: single long-interval safety net for missed Realtime events only. */
  private readonly CATCH_UP_INTERVAL_MS = 300000; // 5 minutes

  /**
   * Set callback to be notified when events are processed
   */
  setOnEventsProcessed(callback: ((result: EventProcessingResult) => void | Promise<void>) | undefined): void {
    evLog(`[EventStream] Setting callback:`, callback ? 'callback provided' : 'callback cleared');
    this.onEventsProcessedCallback = callback;
  }

  /**
   * Start event stream for a branch
   * Sets up Realtime subscription and initial catch-up
   */
  async start(branchId: string, storeId: string): Promise<void> {
    if (this.channels.has(branchId)) {
      evLog(`[EventStream] Already subscribed to branch ${branchId}`);
      return;
    }

    evLog(`[EventStream] Starting event stream for branch ${branchId}`);

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
    // Clear reconnect timeout and backoff
    const reconnectTimeout = this.reconnectTimeouts.get(branchId);
    if (reconnectTimeout) {
      clearTimeout(reconnectTimeout);
      this.reconnectTimeouts.delete(branchId);
    }
    this.reconnectAttempt.delete(branchId);
    this.lastReconnectWarnAt.delete(branchId);

    // Unsubscribe from Realtime: remove from registry before removeChannel so intentional
    // teardown does not leave the old channel registered when CLOSED fires — avoids treating
    // that CLOSED as needing reconnect.
    const channel = this.channels.get(branchId);
    if (channel) {
      this.channels.delete(branchId);
      await supabase.removeChannel(channel);
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

    evLog(`[EventStream] Stopped event stream for branch ${branchId}`);
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
      evLog(`[EventStream] Removing existing channel for branch ${branchId} before reconnecting`);
      // Unregister first: Supabase may emit CLOSED during remove while the channel was still
      // registered, causing reconnect storms.
      this.channels.delete(branchId);
      try {
        await supabase.removeChannel(existingChannel);
      } catch (error) {
        console.warn(`[EventStream] Error removing existing channel:`, error);
      }
    }

    evLog(`[EventStream] Setting up Realtime subscription for branch ${branchId}`);

    const channel = supabase.channel(`branch_events:${branchId}`).on(
      'postgres_changes',
      {
        event: 'INSERT',
        schema: 'public',
        table: 'branch_event_log',
        filter: `branch_id=eq.${branchId}`,
      },
      async (payload) => {
        if (this.channels.get(branchId) !== channel) return;
        const event = payload.new as BranchEvent;
        evLog(`[EventStream] Realtime signal: event ${event.id} version ${event.version}`);
        await this.catchUp(branchId, storeId);
      }
    );

    // Register before subscribe() so synchronous status callbacks see the active channel,
    // and stale CLOSED from a replaced channel does not match this reference.
    this.channels.set(branchId, channel);

    channel.subscribe((status) => {
      if (this.channels.get(branchId) !== channel) {
        evLog(`[EventStream] Ignoring Realtime status ${status} for superseded channel branch ${branchId}`);
        return;
      }
      evLog(`[EventStream] Realtime subscription status for branch ${branchId}: ${status}`);
      if (status === 'SUBSCRIBED') {
        evLog(`✅ [EventStream] Realtime subscribed successfully for branch ${branchId}`);
        this.reconnectAttempt.delete(branchId);
        const timeout = this.reconnectTimeouts.get(branchId);
        if (timeout) {
          clearTimeout(timeout);
          this.reconnectTimeouts.delete(branchId);
        }
      } else if (status === 'CHANNEL_ERROR') {
        this.logReconnectIssue(
          branchId,
          'error',
          `❌ [EventStream] Realtime error for branch ${branchId} - attempting to reconnect...`
        );
        this.scheduleReconnect(branchId, storeId);
      } else if (status === 'TIMED_OUT') {
        this.logReconnectIssue(
          branchId,
          'timeout',
          `⏱️ [EventStream] Realtime subscription timed out for branch ${branchId} - attempting to reconnect...`
        );
        this.scheduleReconnect(branchId, storeId);
      } else if (status === 'CLOSED') {
        this.logReconnectIssue(
          branchId,
          'closed',
          `🔒 [EventStream] Realtime subscription closed for branch ${branchId} - attempting to reconnect...`
        );
        this.scheduleReconnect(branchId, storeId);
      } else {
        evLog(`ℹ️ [EventStream] Realtime subscription status changed to: ${status} for branch ${branchId}`);
      }
    });

    evLog(`[EventStream] Realtime channel created for branch ${branchId}, waiting for subscription...`);
  }

  private readonly RECONNECT_WARN_THROTTLE_MS = 15000;

  private logReconnectIssue(branchId: string, _kind: string, message: string): void {
    const now = Date.now();
    const last = this.lastReconnectWarnAt.get(branchId) ?? 0;
    if (now - last >= this.RECONNECT_WARN_THROTTLE_MS) {
      this.lastReconnectWarnAt.set(branchId, now);
      if (message.startsWith('❌')) console.error(message);
      else console.warn(message);
    } else {
      evLog(message);
    }
  }

  /**
   * Schedule a reconnection attempt for a branch (exponential backoff, max 30s).
   */
  private scheduleReconnect(branchId: string, storeId: string): void {
    if (this.reconnectTimeouts.has(branchId)) {
      evLog(`[EventStream] Reconnect already scheduled for branch ${branchId}, skipping`);
      return;
    }

    const attempt = this.reconnectAttempt.get(branchId) ?? 0;
    const delayMs = Math.min(2000 * 2 ** attempt, 30000);
    this.reconnectAttempt.set(branchId, attempt + 1);

    evLog(`[EventStream] Scheduling reconnect for branch ${branchId} in ${delayMs}ms (attempt ${attempt + 1})`);
    const timeout = setTimeout(async () => {
      this.reconnectTimeouts.delete(branchId);
      evLog(`[EventStream] Attempting to reconnect for branch ${branchId}...`);
      try {
        await this.subscribeToRealtime(branchId, storeId);
      } catch (error) {
        console.error(`[EventStream] Reconnection failed for branch ${branchId}:`, error);
        this.scheduleReconnect(branchId, storeId);
      }
    }, delayMs);

    this.reconnectTimeouts.set(branchId, timeout);
  }

  /**
   * Catch-up sync: pull events since last_seen_event_version
   * This is the core sync algorithm - pull-based, sequential, idempotent
   */
  async catchUp(branchId: string, storeId: string): Promise<EventProcessingResult> {
    // Suppress during sync — events emitted by our own upload will be
    // replayed by a deferred catchUp once sync finishes (see resumeAfterSync).
    if (this.syncSuspendedBranches.has(branchId)) {
      evLog(`[EventStream] catchUp suppressed — sync in progress for branch ${branchId}`);
      return { processed: 0, errors: [], last_version: 0 };
    }

    // Prevent concurrent catch-up for same branch
    if (this.isProcessing.get(branchId)) {
      evLog(`[EventStream] Catch-up already in progress for branch ${branchId}`);
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
        evLog(`[EventStream] No sync state found for branch ${branchId}, checking if database has data...`);
        
        // Check if database has any data (pick a table that's likely to have records)
        const hasData = await getDB().products.limit(1).count() > 0 || 
                        await getDB().bills.limit(1).count() > 0 ||
                        await getDB().transactions.limit(1).count() > 0;

        if (hasData) {
          // Database has data but no sync state - initialize to current max version
          // This prevents replaying all historical events when event stream starts
          evLog(`[EventStream] Database has data but no sync state - initializing to current max version to avoid replaying all events`);
          try {
          await this.initializeSyncState(branchId);
          
          // Fetch the newly initialized sync state
          const newSyncState = await this.getSyncState(branchId);
          lastVersion = newSyncState?.last_seen_event_version || 0;
            evLog(`[EventStream] ✅ Initialized sync state to version ${lastVersion} for branch ${branchId}`);
          } catch (initError) {
            console.warn(`[EventStream] ⚠️ Failed to initialize sync state, will start from version 0:`, initError);
            // Continue with lastVersion = 0 if initialization fails
          }
        } else {
          evLog(`[EventStream] Database is empty - will start from version 0 (expected on first sync)`);
        }
      }

      evLog(`[EventStream] Catching up from version ${lastVersion} for branch ${branchId}`);

      // 3. Pull events since last version
      const events = await this.pullEvents(branchId, lastVersion);

      if (events.length === 0) {
        evLog(`[EventStream] No new events for branch ${branchId}`);
        return { processed: 0, errors: [], last_version: lastVersion };
      }

      evLog(`[EventStream] Found ${events.length} new events for branch ${branchId} (versions ${events[0]?.version} to ${events[events.length - 1]?.version})`);

      // 4. Process events sequentially
      evLog(`[EventStream] About to call processEvents with ${events.length} events`);
      const result = await this.processEvents(branchId, storeId, events);
      evLog(`[EventStream] processEvents returned:`, {
        processed: result.processed,
        errors: result.errors.length,
        last_version: result.last_version,
        lastVersion_before: lastVersion
      });

      // 5. Update last seen version
      if (result.last_version > lastVersion) {
        evLog(`[EventStream] Updating sync state from version ${lastVersion} to ${result.last_version}`);
        await this.updateSyncState(branchId, result.last_version);
        evLog(`[EventStream] Sync state updated successfully`);
      } else {
        evLog(`[EventStream] Not updating sync state: result.last_version (${result.last_version}) <= lastVersion (${lastVersion})`);
      }

      // 5. Notify callback if events were processed
      evLog(`[EventStream] Checking callback: processed=${result.processed}, hasCallback=${!!this.onEventsProcessedCallback}`);
      if (result.processed > 0 && this.onEventsProcessedCallback) {
        evLog(`[EventStream] ✅ Notifying callback: ${result.processed} events processed`);
        try {
          await this.onEventsProcessedCallback(result);
          evLog(`[EventStream] ✅ Callback executed successfully`);
        } catch (callbackError) {
          console.error(`[EventStream] ❌ Error in callback:`, callbackError);
          if (callbackError instanceof Error) {
            console.error(`[EventStream] Callback error stack:`, callbackError.stack);
          }
        }
      } else {
        evLog(`[EventStream] ⚠️ Not calling callback:`, {
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
      evLog(
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
    let skippedMissing = 0;
    let lastVersion = 0;

    evLog(`[EventStream] Processing ${events.length} events for branch ${branchId}`);
    evLog(`[EventStream] Events array:`, events.map(e => ({ id: e.id, version: e.version, entity_type: e.entity_type, entity_id: e.entity_id })));

    if (!events || events.length === 0) {
      evLog(`[EventStream] Events array is empty or null`);
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
        evLog(`[EventStream] Event at index ${i} is null or undefined`);
        continue;
      }

      try {
        evLog(`[EventStream] Starting to process event ${event.id} (version ${event.version}, index ${i}/${deduplicatedEvents.length})`);
        evLog(`[EventStream] Event details:`, {
          id: event.id,
          event_type: event.event_type,
          entity_type: event.entity_type,
          entity_id: event.entity_id,
          operation: event.operation,
          version: event.version
        });
        const outcome = await this.processEvent(event, storeId);
        if (outcome === 'skipped_missing') skippedMissing++;
        processed++;
        evLog(
          `[EventStream] Event ${event.id} (v${event.version}) finished: ${outcome === 'skipped_missing' ? 'skipped (no row)' : 'handled'}`
        );
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

    evLog(`[EventStream] Processed ${processed}/${deduplicatedEvents.length} deduplicated events (from ${events.length} original events), last version: ${lastVersion}`);
    if (errors.length > 0) {
      console.warn(`[EventStream] ${errors.length} error(s) during processing:`, errors);
    }
    if (skippedMissing > 0) {
      console.info(
        `[EventStream] ${skippedMissing} event(s) skipped: no matching row in Supabase (RLS, deleted, or stale event log). ` +
          `Sync version advanced to ${lastVersion}. Set VITE_EVENT_STREAM_VERBOSE=true for per-event logs.`
      );
    }

    return { processed, errors, last_version: lastVersion, skipped_missing: skippedMissing };
  }

  /**
   * Sync parity baseline tests only: run a single event through the same pipeline as catch-up.
   * Not used by production UI.
   */
  async parityBaselineProcessEvent(
    storeId: string,
    event: BranchEvent
  ): Promise<'handled' | 'skipped_missing'> {
    return this.processEvent(event, storeId);
  }

  /**
   * Process a single event
   * Fetches the affected record and updates IndexedDB
   * Handles both single-record events and bulk events
   */
  private async processEvent(event: BranchEvent, storeId: string): Promise<'handled' | 'skipped_missing'> {
    evLog(
      `[EventStream] Processing event: ${event.event_type} ${event.operation} on ${event.entity_type}/${event.entity_id}`
    );

    // Handle bulk events (products_bulk_updated, entities_bulk_updated, etc.)
    if (this.isBulkEvent(event.event_type)) {
      evLog(`[EventStream] Processing bulk event: ${event.event_type}`);
      await this.processBulkEvent(event, storeId);
      return 'handled';
    }

    // Handle reverse operations (deletions)
    if (event.operation === 'reverse') {
      evLog(`[EventStream] Handling reverse operation for ${event.entity_type}/${event.entity_id}`);
      await this.handleReverse(event);
      evLog(`[EventStream] Reverse operation completed for ${event.entity_type}/${event.entity_id}`);
      return 'handled';
    }

    // Fetch the affected record from Supabase
    evLog(`[EventStream] Fetching record ${event.entity_type}/${event.entity_id} from Supabase`);
    const record = await this.fetchAffectedRecord(event.entity_type, event.entity_id, storeId);

    if (!record) {
      // Record might have been deleted or doesn't exist yet
      evLog(
        `[EventStream] Record ${event.entity_type}/${event.entity_id} not found, skipping`
      );
      return 'skipped_missing';
    }

    evLog(`[EventStream] Fetched record ${event.entity_type}/${event.entity_id}, updating IndexedDB`);
    // Update IndexedDB
    await this.updateIndexedDB(event.entity_type, record);

    // Cascade: fetch child records for parent events that own child rows
    await this.fetchAndStoreChildRecords(event, storeId, record);

    evLog(`[EventStream] Completed processing event ${event.id}`);
    return 'handled';
  }

  /**
   * Fetch and store child records for parent events.
   * The architecture rule is one event per business action — so sale_posted covers
   * both the bill and its line items; inventory_received covers the bill and its items.
   * journal_entry_created covers one event per transaction but multiple entries (debit+credit).
   * This method ensures those child rows land in IndexedDB atomically with the parent.
   */
  private async fetchAndStoreChildRecords(
    event: BranchEvent,
    storeId: string,
    parentRecord?: Record<string, unknown>
  ): Promise<void> {
    if (event.event_type === 'sale_posted') {
      try {
        const { data: lineItems, error } = await supabase
          .from('bill_line_items')
          .select('*')
          .eq('bill_id', event.entity_id);

        if (error) {
          evLog(`[EventStream] Could not fetch bill_line_items for bill ${event.entity_id}:`, error.message);
          return;
        }

        if (lineItems && lineItems.length > 0) {
          await db.bill_line_items.bulkPut(
            lineItems.map((r: any) => ({ ...r, _synced: true, _lastSyncedAt: new Date().toISOString() }))
          );
          evLog(`[EventStream] Stored ${lineItems.length} bill_line_items for bill ${event.entity_id}`);
        }
      } catch (err) {
        evLog(`[EventStream] Error fetching bill_line_items for bill ${event.entity_id}:`, err);
      }
      return;
    }

    if (event.event_type === 'inventory_received') {
      try {
        // inventory_items link to inventory_bills via batch_id (= bill id), not inventory_bill_id
        const { data: items, error } = await supabase
          .from('inventory_items')
          .select('*')
          .eq('batch_id', event.entity_id);

        if (error) {
          evLog(`[EventStream] Could not fetch inventory_items for bill ${event.entity_id}:`, error.message);
          return;
        }

        if (items && items.length > 0) {
          await db.inventory_items.bulkPut(
            items.map((r: any) => ({ ...r, _synced: true, _lastSyncedAt: new Date().toISOString() }))
          );
          evLog(`[EventStream] Stored ${items.length} inventory_items for inventory_bill ${event.entity_id}`);
        }
      } catch (err) {
        evLog(`[EventStream] Error fetching inventory_items for bill ${event.entity_id}:`, err);
      }
      return;
    }

    if (event.event_type === 'journal_entry_created') {
      try {
        const txId =
          parentRecord && typeof (parentRecord as { transaction_id?: string | null }).transaction_id === 'string'
            ? (parentRecord as { transaction_id: string }).transaction_id
            : null;
        if (!txId) {
          evLog(`[EventStream] journal_entry_created: no transaction_id on parent row, keeping single entry only`);
          return;
        }

        const { data: entries, error } = await supabase
          .from('journal_entries')
          .select('*')
          .eq('store_id', storeId)
          .eq('transaction_id', txId);

        if (error) {
          evLog(`[EventStream] Could not fetch journal_entries for transaction ${txId}:`, error.message);
          return;
        }

        if (entries && entries.length > 0) {
          await db.journal_entries.bulkPut(
            entries.map((r) => ({
              ...r,
              _synced: true,
              _lastSyncedAt: new Date().toISOString(),
            }))
          );
          evLog(`[EventStream] Stored ${entries.length} journal_entries for transaction ${txId}`);
        }
      } catch (err) {
        evLog(`[EventStream] Error fetching journal_entries for journal_entry_created:`, err);
      }
      return;
    }
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
      evLog(`[EventStream] Bulk event ${event.id} has no metadata, skipping`);
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
      evLog(`[EventStream] Bulk event ${event.id} missing affected IDs in metadata`);
      return;
    }

    if (affectedIds.length === 0) {
      evLog(`[EventStream] Bulk event ${event.id} has empty affected IDs list`);
      return;
    }

    evLog(`[EventStream] Processing bulk event with ${affectedIds.length} affected records`);

    // Handle bulk deletions
    if (event.operation === 'reverse') {
      evLog(`[EventStream] Bulk deletion of ${affectedIds.length} ${tableName} records`);
      const table = (db as any)[tableName];
      if (table) {
        for (const id of affectedIds) {
          await table.delete(id);
          evLog(`[EventStream] Deleted ${tableName}/${id} from IndexedDB`);
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
        evLog(`[EventStream] Bulk query returned no records for ${tableName}`);
        return;
      }

      evLog(`[EventStream] Fetched ${records.length} records for bulk update`);

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

      evLog(`[EventStream] Bulk updated ${normalizedRecords.length} ${tableName} records in IndexedDB`);
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

    // Build query with store filter (apply all filters before maybeSingle)
    // Use maybeSingle() to avoid 406 when record doesn't exist (event before upload, deleted, or RLS block)
    let query = supabase.from(tableName).select('*').eq('id', entityId);

    // Apply store filter if needed
    if (tableName !== 'stores' && tableName !== 'transactions') {
      if (tableName === 'products') {
        query = query.or(`store_id.eq.${storeId},is_global.eq.true`);
      } else {
        query = query.eq('store_id', storeId);
      }
    } else if (tableName === 'stores') {
      // For stores, entityId is the store ID - no additional filter needed
      evLog(`[EventStream] Fetching store ${entityId} (entityId matches store ID)`);
    }

    const { data, error } = await query.maybeSingle();

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
  private async updateIndexedDB(entityType: string, record: any): Promise<void> {
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

    evLog(`[EventStream] Updated ${tableName}/${normalized.id} in IndexedDB`);
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
    evLog(`[EventStream] Reversed ${tableName}/${event.entity_id} in IndexedDB`);
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
      role_permissions: 'role_permissions',
      user_permissions: 'user_permissions',
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

    if (tableName === 'bills') {
      normalized.bill_date = normalizeBillDateFromRemote(normalized);
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
   * Schedule periodic catch-up as safety net (DEVELOPER_RULES §5 documented exception).
   * Runs every CATCH_UP_INTERVAL_MS to catch missed Realtime events only; not "periodic polling for sync".
   */
  private schedulePeriodicCatchUp(branchId: string, storeId: string): void {
    const interval = setInterval(async () => {
      evLog(`[EventStream] Periodic catch-up for branch ${branchId}`);
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
      evLog(`[EventStream] Initializing sync state for branch ${branchId}...`);
      
      // Fetch the current max version from branch_event_log
      const { data, error } = await supabase
        .from('branch_event_log')
        .select('version')
        .eq('branch_id', branchId)
        .order('version', { ascending: false })
        .limit(1)
        .maybeSingle();

      if (error) {
        throw error;
      }

      if (data == null) {
        evLog(`[EventStream] No events found for branch ${branchId}, starting from version 0`);
        await this.updateSyncState(branchId, 0);
        return;
      }

      const maxVersion = Number((data as { version?: number }).version) || 0;
      evLog(`[EventStream] Found max version ${maxVersion} for branch ${branchId}`);

      // Update sync state with current max version
      await this.updateSyncState(branchId, maxVersion);
      evLog(`[EventStream] ✅ Sync state initialized to version ${maxVersion} for branch ${branchId}`);
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
    evLog(`[EventStream] Manual catch-up triggered for branch ${branchId}`);
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

