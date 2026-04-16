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

/** Split an array into chunks of at most `size` elements. */
function chunkArray<T>(arr: T[], size: number): T[][] {
  const chunks: T[][] = [];
  for (let i = 0; i < arr.length; i += size) {
    chunks.push(arr.slice(i, i + size));
  }
  return chunks;
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

/** Pre-fetched child-record caches used to eliminate per-event child queries. */
interface ChildCaches {
  /** bill_line_items grouped by bill_id (for sale_posted events) */
  lineItemsByBillId: Map<string, unknown[]>;
  /** inventory_items grouped by batch_id (for inventory_received events) */
  inventoryItemsByBatchId: Map<string, unknown[]>;
  /** journal_entries grouped by transaction_id (for journal_entry_created events) */
  journalByTxId: Map<string, unknown[]>;
}

export interface EventProcessingResult {
  processed: number;
  errors: string[];
  last_version: number;
  /** Rows not returned from Supabase (deleted, RLS, or race); not thrown errors */
  skipped_missing?: number;
  /** true when catchUp was a no-op because another catch-up was already in progress */
  skipped?: boolean;
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
      return { processed: 0, errors: [], last_version: 0, skipped: true };
    }

    this.isProcessing.set(branchId, true);

    try {
      // 1. Get last seen version from IndexedDB
      const syncState = await this.getSyncState(branchId);
      let lastVersion = syncState?.last_seen_event_version || 0;

      // ✅ FIX 3: Enhanced sync state initialization
      // If no sync state exists, check if database has data and initialize accordingly
      if (!syncState && lastVersion === 0) {
        // Always initialize to the current max event version rather than replaying history.
        // On cold start the DB is empty, but the tiered sync (useOfflineInitialization) owns
        // bulk hydration via direct table scans. The event stream only handles events that
        // arrive from this point forward. Starting from version 0 would replay every
        // historical event and cause N+1 individual Supabase fetches per event.
        evLog(`[EventStream] No sync state — initializing to current max version for branch ${branchId}`);
        try {
          await this.initializeSyncState(branchId);
          const newSyncState = await this.getSyncState(branchId);
          lastVersion = newSyncState?.last_seen_event_version || 0;
          evLog(`[EventStream] ✅ Initialized sync state to version ${lastVersion} for branch ${branchId}`);
        } catch (initError) {
          // Do NOT fall back to version 0 — that would replay all historical events
          // and trigger N+1 individual Supabase fetches per event.
          // Re-throw so catchUp returns an error result; the stream will retry on the next cycle.
          console.error(`[EventStream] ❌ Failed to initialize sync state — cannot safely catch up:`, initError);
          throw initError;
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
          console.error(`[EventStream] ❌ Error in onEventsProcessedCallback:`, callbackError);
          // Surface to caller so it knows the post-processing step failed (M2 fix)
          result.errors.push(
            `callback: ${callbackError instanceof Error ? callbackError.message : String(callbackError)}`
          );
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

    // OPTIMIZATION: Batch-prefetch all records needed by regular (non-bulk, non-reverse) events.
    // Replaces N individual fetchAffectedRecord() calls with one .in('id',[...]) per table.
    const prefetchCache = await this.batchPrefetchRecords(deduplicatedEvents, storeId);

    // OPTIMIZATION: Batch-prefetch child records for all event types that cascade to child tables.
    // All three queries run in parallel; each replaces N individual per-event queries with one .in().
    const [lineItemsByBillId, inventoryItemsByBatchId, journalByTxId] = await Promise.all([
      this.batchPrefetchChildren(
        deduplicatedEvents, 'sale_posted', 'bill_line_items', 'bill_id',
        (e) => e.entity_id
      ),
      this.batchPrefetchChildren(
        deduplicatedEvents, 'inventory_received', 'inventory_items', 'batch_id',
        (e) => e.entity_id
      ),
      this.batchPrefetchChildren(
        deduplicatedEvents, 'journal_entry_created', 'journal_entries', 'transaction_id',
        (e) => {
          // Prefer transaction_id from event metadata (set since the N+1 fix).
          // Fall back to looking it up from the prefetchCache for older events that
          // predate the metadata field.
          const metaTxId = (e.metadata as Record<string, unknown> | undefined)?.transaction_id;
          if (typeof metaTxId === 'string' && metaTxId) return metaTxId;
          const parent = prefetchCache.get(`${e.entity_type}:${e.entity_id}`) as Record<string, unknown> | undefined;
          const txId = parent?.transaction_id;
          return typeof txId === 'string' && txId ? txId : null;
        },
        storeId
      ),
    ]);
    const childCaches: ChildCaches = { lineItemsByBillId, inventoryItemsByBatchId, journalByTxId };

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
        const outcome = await this.processEvent(event, storeId, prefetchCache, childCaches);
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
  private async processEvent(
    event: BranchEvent,
    storeId: string,
    prefetchCache?: Map<string, unknown>,
    childCaches?: ChildCaches
  ): Promise<'handled' | 'skipped_missing'> {
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

    // FAST PATH: journal_entry_created events with transaction_id in metadata can be handled
    // entirely via the pre-fetched journalByTxId batch cache — no individual record fetch needed.
    // This eliminates the N+1 pattern where batchPrefetchRecords failure caused one
    // fetchAffectedRecord call per journal entry.
    if (event.event_type === 'journal_entry_created') {
      const metaTxId = (event.metadata as Record<string, unknown> | undefined)?.transaction_id;
      if (typeof metaTxId === 'string' && metaTxId && childCaches) {
        const cached = childCaches.journalByTxId.get(metaTxId);
        if (cached !== undefined) {
          if (cached.length > 0) {
            await db.journal_entries.bulkPut(
              cached.map((r) => ({ ...(r as object), _synced: true, _lastSyncedAt: new Date().toISOString() }))
            );
            evLog(`[EventStream] journal_entry_created fast path: stored ${cached.length} entries for tx ${metaTxId}`);
          }
          return 'handled';
        }
        // Cache miss (batchPrefetchChildren returned nothing for this txId — may be a new tx).
        // Fall through to normal processing which will do a per-txId query in fetchAndStoreChildRecords.
      }
    }

    // Use prefetched record if available (batch optimisation), otherwise fall back to single fetch
    const cacheKey = `${event.entity_type}:${event.entity_id}`;
    const record = prefetchCache?.has(cacheKey)
      ? prefetchCache.get(cacheKey)
      : await this.fetchAffectedRecord(event.entity_type, event.entity_id, storeId);
    evLog(`[EventStream] Record ${event.entity_type}/${event.entity_id}: ${record ? 'from cache' : 'fetched individually'}`);

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
    await this.fetchAndStoreChildRecords(event, storeId, record, childCaches);

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
    parentRecord?: Record<string, unknown>,
    childCaches?: ChildCaches
  ): Promise<void> {
    if (event.event_type === 'sale_posted') {
      try {
        const billId = event.entity_id;
        // Use batch-prefetched line items when available; fall back to individual query
        const cached = childCaches?.lineItemsByBillId.get(billId);
        const lineItems: unknown[] | null = cached !== undefined ? cached : null;
        if (lineItems !== null) {
          if (lineItems.length > 0) {
            await db.bill_line_items.bulkPut(
              lineItems.map((r) => ({ ...(r as object), _synced: true, _lastSyncedAt: new Date().toISOString() }))
            );
            evLog(`[EventStream] Stored ${lineItems.length} bill_line_items for bill ${billId} (from batch cache)`);
          }
          return;
        }
        const { data: fetched, error } = await supabase
          .from('bill_line_items')
          .select('*')
          .eq('bill_id', billId);
        if (error) { evLog(`[EventStream] Could not fetch bill_line_items for bill ${billId}:`, error.message); return; }
        if (fetched && fetched.length > 0) {
          await db.bill_line_items.bulkPut(
            fetched.map((r: any) => ({ ...r, _synced: true, _lastSyncedAt: new Date().toISOString() }))
          );
          evLog(`[EventStream] Stored ${fetched.length} bill_line_items for bill ${billId}`);
        }
      } catch (err) {
        evLog(`[EventStream] Error fetching bill_line_items for bill ${event.entity_id}:`, err);
      }
      return;
    }

    if (event.event_type === 'inventory_received') {
      try {
        const batchId = event.entity_id;
        // Use batch-prefetched inventory items when available; fall back to individual query
        const cached = childCaches?.inventoryItemsByBatchId.get(batchId);
        const items: unknown[] | null = cached !== undefined ? cached : null;
        if (items !== null) {
          if (items.length > 0) {
            await db.inventory_items.bulkPut(
              items.map((r) => ({ ...(r as object), _synced: true, _lastSyncedAt: new Date().toISOString() }))
            );
            evLog(`[EventStream] Stored ${items.length} inventory_items for batch ${batchId} (from batch cache)`);
          }
          return;
        }
        const { data: fetched, error } = await supabase
          .from('inventory_items')
          .select('*')
          .eq('batch_id', batchId);
        if (error) { evLog(`[EventStream] Could not fetch inventory_items for batch ${batchId}:`, error.message); return; }
        if (fetched && fetched.length > 0) {
          await db.inventory_items.bulkPut(
            fetched.map((r: any) => ({ ...r, _synced: true, _lastSyncedAt: new Date().toISOString() }))
          );
          evLog(`[EventStream] Stored ${fetched.length} inventory_items for batch ${batchId}`);
        }
      } catch (err) {
        evLog(`[EventStream] Error fetching inventory_items for batch ${event.entity_id}:`, err);
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
        // Use batch-prefetched entries when available; fall back to individual query
        const cached = childCaches?.journalByTxId.get(txId);
        const entries: unknown[] | null = cached !== undefined ? cached : null;
        if (entries !== null) {
          if (entries.length > 0) {
            await db.journal_entries.bulkPut(
              entries.map((r) => ({ ...(r as object), _synced: true, _lastSyncedAt: new Date().toISOString() }))
            );
            evLog(`[EventStream] Stored ${entries.length} journal_entries for transaction ${txId} (from batch cache)`);
          }
          return;
        }
        const { data: fetched, error } = await supabase
          .from('journal_entries')
          .select('*')
          .eq('store_id', storeId)
          .eq('transaction_id', txId);
        if (error) { evLog(`[EventStream] Could not fetch journal_entries for transaction ${txId}:`, error.message); return; }
        if (fetched && fetched.length > 0) {
          await db.journal_entries.bulkPut(
            fetched.map((r) => ({ ...r, _synced: true, _lastSyncedAt: new Date().toISOString() }))
          );
          evLog(`[EventStream] Stored ${fetched.length} journal_entries for transaction ${txId}`);
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
      // M3: malformed metadata — log at error level so it's visible without verbose mode
      console.error(`[EventStream] ❌ Bulk event ${event.id} (${event.event_type}) missing affected IDs in metadata — event will be skipped`, metadata);
      return;
    }

    if (!Array.isArray(affectedIds) || affectedIds.length === 0) {
      // M3: distinguish empty-but-valid from non-array (type mismatch in metadata)
      if (!Array.isArray(affectedIds)) {
        console.error(`[EventStream] ❌ Bulk event ${event.id} affected IDs is not an array — metadata may be malformed`, metadata);
      } else {
        evLog(`[EventStream] Bulk event ${event.id} has empty affected IDs list`);
      }
      return;
    }

    evLog(`[EventStream] Processing bulk event with ${affectedIds.length} affected records`);

    // Handle bulk deletions — one bulkDelete call instead of N individual deletes
    if (event.operation === 'reverse') {
      evLog(`[EventStream] Bulk deletion of ${affectedIds.length} ${tableName} records`);
      const table = (db as any)[tableName];
      if (table) {
        await table.bulkDelete(affectedIds);
        evLog(`[EventStream] Bulk deleted ${affectedIds.length} ${tableName} records from IndexedDB`);
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
  /**
   * Batch-prefetch all records required by a deduplicated event list.
   * Groups events by table name and issues one `.in('id', [...])` query per table,
   * replacing the previous N individual fetchAffectedRecord() calls.
   *
   * Returns a Map keyed by `"entityType:entityId"` for O(1) lookup in processEvent().
   * Bulk and reverse events are excluded — they don't need individual record fetches.
   */
  /**
   * Maximum IDs per `.in()` query chunk.
   * PostgREST encodes `.in('id', ids)` as `id=in.(uuid,...)` in the URL.
   * 600 UUIDs × ~37 chars ≈ 22 KB — well over Supabase's ~8 KB URL limit.
   * Chunking at 100 keeps each request ~3.7 KB and prevents 414 errors that
   * would otherwise cause the entire batch to fail and fall back to N individual fetches.
   */
  private static readonly PREFETCH_CHUNK_SIZE = 100;

  private async batchPrefetchRecords(
    events: BranchEvent[],
    storeId: string
  ): Promise<Map<string, unknown>> {
    const cache = new Map<string, unknown>();

    // Collect IDs grouped by table, skipping bulk and reverse events.
    // Track all entity types seen per table (e.g. 'customer', 'supplier', 'entity' all → 'entities').
    const tableIds = new Map<string, { entityTypes: Set<string>; ids: string[] }>();
    for (const event of events) {
      if (!event || this.isBulkEvent(event.event_type) || event.operation === 'reverse') continue;
      const tableName = this.mapEntityTypeToTable(event.entity_type);
      if (!tableName) continue;
      if (!tableIds.has(tableName)) tableIds.set(tableName, { entityTypes: new Set(), ids: [] });
      const entry = tableIds.get(tableName)!;
      entry.entityTypes.add(event.entity_type);
      if (!entry.ids.includes(event.entity_id)) entry.ids.push(event.entity_id);
    }

    // Fire chunked queries per table (all chunks for a table run in parallel).
    // Chunking prevents URL-length overflow (414) when there are many IDs.
    for (const [tableName, { entityTypes, ids }] of tableIds) {
      if (ids.length === 0) continue;
      try {
        const chunks = chunkArray(ids, EventStreamService.PREFETCH_CHUNK_SIZE);
        const chunkResults = await Promise.all(
          chunks.map(async (chunkIds) => {
            let query = supabase.from(tableName).select('*').in('id', chunkIds);
            if (tableName === 'products') {
              query = (query as any).or(`store_id.eq.${storeId},is_global.eq.true`);
            } else if (tableName !== 'stores' && tableName !== 'transactions') {
              query = query.eq('store_id', storeId);
            }
            const { data, error } = await query;
            if (error) {
              console.warn(`[EventStream] batchPrefetch failed for ${tableName} (chunk of ${chunkIds.length}):`, error.message);
              return [] as unknown[];
            }
            return (data ?? []) as unknown[];
          })
        );
        for (const rows of chunkResults) {
          for (const row of rows) {
            const rowId = (row as Record<string, unknown>)['id'];
            // Cache under every entity type that maps to this table
            for (const entityType of entityTypes) {
              cache.set(`${entityType}:${rowId}`, row);
            }
          }
        }
      } catch (e) {
        console.warn(`[EventStream] batchPrefetch error for ${tableName}:`, e);
      }
    }

    return cache;
  }

  /**
   * Generic child-record batch prefetch.
   *
   * Collects the foreign-key value for every event matching `eventType` (via `keyExtractor`),
   * fires one `.in(foreignKey, [...keys])` query against `table`, and returns a Map keyed by
   * the foreign-key value → rows[].
   *
   * Used by processEvents to eliminate N per-event child queries:
   *   - sale_posted       → bill_line_items   grouped by bill_id
   *   - inventory_received → inventory_items  grouped by batch_id
   *   - journal_entry_created → journal_entries grouped by transaction_id
   *
   * @param storeId When provided, adds `.eq('store_id', storeId)` to scope the query.
   */
  private async batchPrefetchChildren(
    events: BranchEvent[],
    eventType: string,
    table: string,
    foreignKey: string,
    keyExtractor: (event: BranchEvent) => string | null,
    storeId?: string
  ): Promise<Map<string, unknown[]>> {
    const cache = new Map<string, unknown[]>();

    const keys = new Set<string>();
    for (const event of events) {
      if (event?.event_type !== eventType) continue;
      const key = keyExtractor(event);
      if (key) keys.add(key);
    }

    if (keys.size === 0) return cache;

    try {
      const keyArray = [...keys];
      const chunks = chunkArray(keyArray, EventStreamService.PREFETCH_CHUNK_SIZE);
      const chunkResults = await Promise.all(
        chunks.map(async (chunkKeys: string[]) => {
          let query = supabase.from(table).select('*').in(foreignKey, chunkKeys);
          if (storeId) query = query.eq('store_id', storeId);
          const { data, error } = await query;
          if (error) {
            console.warn(`[EventStream] batchPrefetchChildren(${table}) failed (chunk of ${chunkKeys.length}):`, error.message);
            return [] as unknown[];
          }
          return (data ?? []) as unknown[];
        })
      );
      for (const rows of chunkResults) {
        for (const row of rows) {
          const key = (row as Record<string, unknown>)[foreignKey] as string;
          if (!key) continue;
          if (!cache.has(key)) cache.set(key, []);
          cache.get(key)!.push(row);
        }
      }
    } catch (e) {
      console.warn(`[EventStream] batchPrefetchChildren(${table}) error:`, e);
    }

    return cache;
  }

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
      balance_snapshot: 'balance_snapshots',
      bill_audit_log: 'bill_audit_logs',
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

