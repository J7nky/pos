// Sync service orchestrator — module split from monolithic file
import { getDB } from '../lib/db';
import { supabase } from '../lib/supabase';
import { dataValidationService } from './dataValidationService';
import { universalChangeDetectionService } from './universalChangeDetectionService';
import { networkMonitorService } from './networkMonitorService';
import { eventStreamService } from './eventStreamService';
import { normalizeBillDateFromRemote } from '../utils/dateUtils';
import { createMultilingualFromString, getTranslatedString } from '../utils/multilingual';
import type { Store, PendingSync } from '../types';
import {
  SYNC_CONFIG,
  SYNC_TABLES,
  getTierWaves,
} from './syncConfig';
import type {
  SyncResult,
  DeletionState,
  DataTierName,
  DownloadPageResult,
  SyncCheckpoint,
} from './syncConfig';
export { SYNC_TABLES } from './syncConfig';
export type { SyncTable, SyncResult, DataTierName, DownloadPageResult, SyncCheckpoint } from './syncConfig';
import { uploadLocalChanges, isUnrecoverableError, deleteProblematicRecord } from './syncUpload';
import { downloadRemoteChanges, applyStoreFilter } from './syncDownload';
import { detectAndSyncDeletions } from './syncDeletionDetection';
import { comprehensiveLoggingService } from './comprehensiveLoggingService';
import { getDefaultCurrenciesForCountry } from '@pos-platform/shared';
import type { CurrencyCode } from '@pos-platform/shared';
import { notificationService } from './notificationService';

// Keep SyncTable import for use within the class
import type { SyncTable } from './syncConfig';

// Get singleton database instance
const db = getDB();

function recordMaxVersion(records: Record<string, unknown>[]): number {
  let max = 0;
  for (const r of records) {
    const v = Number((r as { version?: unknown }).version ?? 0);
    if (!Number.isNaN(v) && v > max) max = v;
  }
  return max;
}

function isNonRetryableHttpClientError(error: unknown): boolean {
  const e = error as { status?: number; code?: string };
  if (
    typeof e?.status === 'number' &&
    e.status >= 400 &&
    e.status < 500 &&
    e.status !== 408 &&
    e.status !== 429
  ) {
    return true;
  }
  const c = e?.code || '';
  if (typeof c === 'string' && c.startsWith('PGRST3')) return true;
  if (typeof c === 'string' && /^(22|23)/.test(c)) return true;
  return false;
}

function indicatesPermissionRevoked(error: unknown): boolean {
  const e = error as { status?: number; code?: string; message?: string };
  if (e?.status === 403) return true;
  const msg = (e?.message || '').toLowerCase();
  return e?.code === '42501' || msg.includes('permission denied for');
}

export class SyncService {
  private isRunning = false;
  private lastSyncAttempt: Date | null = null;
  private lastSyncCompleted: Date | null = null;
  // Persisted across page reloads so the 30-min interval is truly respected.
  private lastDeletionCheck: Date | null = SyncService.loadLastDeletionCheck();
  private deletionStateCache: Map<string, DeletionState> = new Map();
  // Static app-start timestamp — used for the startup grace period so the very
  // first sync after a cold app load never runs deletion detection immediately,
  // even if the persisted lastDeletionCheck is stale (> 30 min ago).
  private static readonly appStartTime: number = Date.now();

  private static readonly DELETION_CHECK_LS_KEY = 'pos_sync_last_deletion_check';
  // 30-second minimum gap between two consecutive sync calls to prevent
  // multiple timers (syncTriggerService, resetAutoSyncTimer, debouncedSync)
  // from stacking and each running a full deletion-detection pass.
  private static readonly MIN_SYNC_INTERVAL_MS = 30_000;

  private static loadLastDeletionCheck(): Date | null {
    try {
      const stored = localStorage.getItem(SyncService.DELETION_CHECK_LS_KEY);
      if (stored) {
        const d = new Date(stored);
        if (!isNaN(d.getTime())) return d;
      }
    } catch { /* localStorage unavailable in SSR / tests */ }
    return null;
  }

  private persistLastDeletionCheck(date: Date): void {
    this.lastDeletionCheck = date;
    try {
      localStorage.setItem(SyncService.DELETION_CHECK_LS_KEY, date.toISOString());
    } catch { /* ignore */ }
  }

  /** Parity / Vitest runs must not wait 5 minutes before deletion detection can execute. */
  private deletionStartupGraceSatisfied(): boolean {
    const isVitest =
      (typeof process !== 'undefined' && process.env?.VITEST === 'true') ||
      import.meta.env.MODE === 'test';
    if (isVitest) return true;
    return Date.now() - SyncService.appStartTime > SYNC_CONFIG.deletionDetectionStartupGrace;
  }

  private onPermissionRevoked: ((storeId: string) => Promise<void>) | null = null;

  /** Injected from `SupabaseAuthContext` — keeps sync free of direct auth imports (CG-02). */
  setOnPermissionRevoked(handler: ((storeId: string) => Promise<void>) | null): void {
    this.onPermissionRevoked = handler;
  }

  private async handleSyncTransportError(storeId: string, error: unknown): Promise<void> {
    if (error == null) return;
    if (!indicatesPermissionRevoked(error)) return;
    this.emitSyncStructuredLog('permission_revoked', storeId, undefined, {
      error: error instanceof Error ? error.message : String(error),
    });
    const cb = this.onPermissionRevoked;
    if (cb) await cb(storeId);
  }

  private emitSyncStructuredLog(
    action:
      | 'sync_started'
      | 'sync_completed'
      | 'sync_failed'
      | 'tier_started'
      | 'tier_completed'
      | 'page_downloaded'
      | 'outbox_processed'
      | 'outbox_item_permanently_failed'
      | 'checkpoint_saved'
      | 'permission_revoked',
    storeId: string,
    branchId?: string,
    metadata?: Record<string, unknown>
  ): void {
    try {
      comprehensiveLoggingService.logSystemActivity({
        action,
        description: JSON.stringify({ storeId, branchId, ...metadata }),
        context: {
          userId: 'system',
          module: 'sync',
          source: 'web',
        },
        severity: action === 'permission_revoked' || action === 'outbox_item_permanently_failed' ? 'high' : 'low',
        metadata: { storeId, branchId, ...metadata },
      });
    } catch {
      /* logging must never break sync */
    }
  }

  async sync(storeId: string, branchId?: string): Promise<SyncResult> {
    // If sync is already running, return early with a skipped result instead of throwing
    if (this.isRunning) {
      console.log('⏭️  [SYNC] Sync already in progress, skipping duplicate request');
      return {
        success: true,
        errors: [],
        synced: { uploaded: 0, downloaded: 0 },
        conflicts: 0
      };
    }

    // Prevent back-to-back syncs that arrive from multiple independent timers
    // (syncTriggerService 30s, resetAutoSyncTimer 30s, debouncedSync 30s, focus/visibility 1s)
    // all firing within the same short window.
    const isVitestRun =
      (typeof process !== 'undefined' && process.env?.VITEST === 'true') ||
      import.meta.env.MODE === 'test';

    if (
      !isVitestRun &&
      this.lastSyncCompleted &&
      Date.now() - this.lastSyncCompleted.getTime() < SyncService.MIN_SYNC_INTERVAL_MS
    ) {
      console.log('⏭️  [SYNC] Skipping: minimum sync interval not yet elapsed since last sync');
      return {
        success: true,
        errors: [],
        synced: { uploaded: 0, downloaded: 0 },
        conflicts: 0
      };
    }

    this.isRunning = true;
    this.lastSyncAttempt = new Date();
    const syncStartTime = performance.now();
    networkMonitorService.startSession(`sync @ ${new Date().toLocaleTimeString()}`);
    this.emitSyncStructuredLog('sync_started', storeId, branchId, { mode: 'full' });

    const result: SyncResult = {
      success: true,
      errors: [],
      synced: { uploaded: 0, downloaded: 0 },
      conflicts: 0
    };

    try {
      // Suspend EventStreamService so Realtime events emitted by our own
      // uploads don't trigger redundant catchUp() round-trips during sync.
      // Placed inside try so the finally block's resumeAfterSync() is
      // guaranteed to run whenever suspendForSync() has been called.
      if (branchId) eventStreamService.suspendForSync(branchId);
      const setupStart = performance.now();
      await this.ensureStoreExists(storeId);
      await this.initializeSyncMetadata(storeId);
      const setupTime = performance.now() - setupStart;
      console.log(`⏱️  Setup time: ${setupTime.toFixed(2)}ms`);

      // Check connectivity
      const connectivityStart = performance.now();
      const { error: connectivityError } = await supabase
        .from('products')
        .select('id')
        .limit(1);
      const connectivityTime = performance.now() - connectivityStart;
      console.log(`⏱️  Connectivity check: ${connectivityTime.toFixed(2)}ms`);

      if (connectivityError) {
        throw new Error(`Connection failed: ${connectivityError.message}`);
      }

      // Refresh validation cache once
      const cacheStart = performance.now();
      await dataValidationService.refreshCache(storeId, supabase);
      const cacheTime = performance.now() - cacheStart;
      console.log(`⏱️  Validation cache refresh: ${cacheTime.toFixed(2)}ms`);

      // Upload then download
      const uploadStart = performance.now();
      const uploadResult = await uploadLocalChanges(storeId, branchId);
      const uploadTime = performance.now() - uploadStart;
      console.log(`⏱️  Upload time: ${uploadTime.toFixed(2)}ms (${uploadResult.uploaded} records)`);
      result.synced.uploaded = uploadResult.uploaded;
      result.errors.push(...uploadResult.errors);

      // For tables we just uploaded to: pre-seed the change-detection cache
      // with hasChanges=true.  This tells the download phase to fetch those
      // tables (so concurrent remote changes are not missed) without first
      // issuing a redundant COUNT round-trip — we *know* changes exist because
      // we just wrote them.  Other tables continue to use their 60-second cache.
      for (const uploadedTable of uploadResult.uploadedTables) {
        universalChangeDetectionService.markTableHasChanges(uploadedTable, storeId);
      }

      const downloadStart = performance.now();
      const downloadResult = await downloadRemoteChanges(storeId);
      const downloadTime = performance.now() - downloadStart;
      console.log(`⏱️  Download time: ${downloadTime.toFixed(2)}ms (${downloadResult.downloaded} records)`);
      result.synced.downloaded = downloadResult.downloaded;
      result.conflicts += downloadResult.conflicts;
      result.errors.push(...downloadResult.errors);

      const pendingStart = performance.now();
      await this.processPendingSyncs(storeId);
      const pendingTime = performance.now() - pendingStart;
      console.log(`⏱️  Pending syncs processing: ${pendingTime.toFixed(2)}ms`);

      // Check if we should run deletion detection.
      // Two guards:
      //   1. Startup grace period — don't run on the very first sync after a
      //      cold app load; give the UI time to render before issuing 24+ extra
      //      paginated queries (each with a CORS preflight).
      //   2. Interval guard — only run once per 30-minute window (persisted in
      //      localStorage so the interval spans page reloads).
      const startupGraceElapsed = this.deletionStartupGraceSatisfied();
      const shouldCheckDeletions = SYNC_CONFIG.enableDeletionDetection &&
        startupGraceElapsed && (
          !this.lastDeletionCheck ||
          Date.now() - this.lastDeletionCheck.getTime() > SYNC_CONFIG.deletionDetectionInterval
        );

      if (shouldCheckDeletions) {
        // Stamp the time BEFORE running so that a failed/aborted detection pass
        // does not immediately retry on the very next sync — we treat this as a
        // "cooling off" timestamp rather than a "completed successfully" timestamp.
        this.persistLastDeletionCheck(new Date());
        const deletionStart = performance.now();
        const deletionResult = await detectAndSyncDeletions(storeId, this.deletionStateCache);
        const deletionTime = performance.now() - deletionStart;
        console.log(`⏱️  Deletion detection: ${deletionTime.toFixed(2)}ms (${deletionResult.deleted} records removed)`);
        result.errors.push(...deletionResult.errors);
      }

      const totalTime = performance.now() - syncStartTime;
      console.log(`⏱️  Total sync time: ${totalTime.toFixed(2)}ms (${(totalTime / 1000).toFixed(2)}s)`);

      result.success = result.errors.length === 0;

    } catch (error) {
      const totalTime = performance.now() - syncStartTime;
      console.error(`⏱️  Sync failed after ${totalTime.toFixed(2)}ms:`, error);
      result.success = false;
      result.errors.push(error instanceof Error ? error.message : 'Unknown sync error');
    } finally {
      this.isRunning = false;
      this.lastSyncCompleted = new Date();
      networkMonitorService.endSession();
      // Resume event stream — deferred catchUp will replay events that arrived
      // during the window (records already in IndexedDB, so it's idempotent).
      if (branchId) eventStreamService.resumeAfterSync(branchId, storeId);
    }

    return result;
  }

  /**
   * Push local unsynced rows to Supabase only — no table-scan download.
   * EventStreamService handles remote changes via branch_event_log + catchUp.
   * Used by performSync / auto-sync / syncTriggerService to avoid redundant
   * COUNT + select round-trips on every CRUD write.
   */
  async uploadOnly(storeId: string, branchId?: string): Promise<SyncResult> {
    if (this.isRunning) {
      console.log('⏭️  [UPLOAD-ONLY] Sync already in progress, skipping duplicate request');
      return {
        success: true,
        errors: [],
        synced: { uploaded: 0, downloaded: 0 },
        conflicts: 0,
      };
    }

    const isVitestRun =
      (typeof process !== 'undefined' && process.env?.VITEST === 'true') ||
      import.meta.env.MODE === 'test';

    if (
      !isVitestRun &&
      this.lastSyncCompleted &&
      Date.now() - this.lastSyncCompleted.getTime() < SyncService.MIN_SYNC_INTERVAL_MS
    ) {
      console.log('⏭️  [UPLOAD-ONLY] Skipping: minimum sync interval not yet elapsed since last sync');
      return {
        success: true,
        errors: [],
        synced: { uploaded: 0, downloaded: 0 },
        conflicts: 0,
      };
    }

    this.isRunning = true;
    this.lastSyncAttempt = new Date();
    const syncStartTime = performance.now();
    networkMonitorService.startSession(`uploadOnly @ ${new Date().toLocaleTimeString()}`);
    this.emitSyncStructuredLog('sync_started', storeId, branchId, { mode: 'upload_only' });

    const result: SyncResult = {
      success: true,
      errors: [],
      synced: { uploaded: 0, downloaded: 0 },
      conflicts: 0,
    };

    try {
      if (branchId) eventStreamService.suspendForSync(branchId);
      await this.initializeSyncMetadata(storeId);

      const cacheStart = performance.now();
      await dataValidationService.refreshCache(storeId, supabase);
      console.log(`⏱️  [UPLOAD-ONLY] Validation cache refresh: ${(performance.now() - cacheStart).toFixed(2)}ms`);

      const uploadStart = performance.now();
      const uploadResult = await uploadLocalChanges(storeId, branchId);
      console.log(
        `⏱️  [UPLOAD-ONLY] Upload time: ${(performance.now() - uploadStart).toFixed(2)}ms (${uploadResult.uploaded} records)`
      );
      result.synced.uploaded = uploadResult.uploaded;
      result.errors.push(...uploadResult.errors);

      const pendingStart = performance.now();
      await this.processPendingSyncs(storeId);
      console.log(`⏱️  [UPLOAD-ONLY] Pending syncs: ${(performance.now() - pendingStart).toFixed(2)}ms`);

      const startupGraceElapsed = this.deletionStartupGraceSatisfied();
      const shouldCheckDeletions =
        SYNC_CONFIG.enableDeletionDetection &&
        startupGraceElapsed &&
        (!this.lastDeletionCheck ||
          Date.now() - this.lastDeletionCheck.getTime() > SYNC_CONFIG.deletionDetectionInterval);

      if (shouldCheckDeletions) {
        this.persistLastDeletionCheck(new Date());
        const deletionStart = performance.now();
        const deletionResult = await detectAndSyncDeletions(storeId, this.deletionStateCache);
        console.log(
          `⏱️  [UPLOAD-ONLY] Deletion detection: ${(performance.now() - deletionStart).toFixed(2)}ms (${deletionResult.deleted} removed)`
        );
        result.errors.push(...deletionResult.errors);
      }

      console.log(`⏱️  [UPLOAD-ONLY] Total: ${(performance.now() - syncStartTime).toFixed(2)}ms`);
      result.success = result.errors.length === 0;
    } catch (error) {
      console.error(`⏱️  [UPLOAD-ONLY] Failed after ${(performance.now() - syncStartTime).toFixed(2)}ms:`, error);
      result.success = false;
      result.errors.push(error instanceof Error ? error.message : 'Unknown upload error');
    } finally {
      this.isRunning = false;
      this.lastSyncCompleted = new Date();
      networkMonitorService.endSession();
      if (branchId) eventStreamService.resumeAfterSync(branchId, storeId);
    }

    return result;
  }

  private async processPendingSyncs(activeStoreId: string) {
    const pendingSyncs = await getDB().getPendingSyncs();

    for (const pendingSync of pendingSyncs) {
      const outboxStoreId =
        (pendingSync.payload as { store_id?: string } | undefined)?.store_id || activeStoreId;
      try {
        if (pendingSync.retry_count >= SYNC_CONFIG.maxRetries) {
          console.error(`Max retries reached for pending sync: ${pendingSync.id}`);
          const lastError = pendingSync.last_error || '';
          await getDB().pending_syncs.update(pendingSync.id, {
            status: 'permanently_failed',
            last_error: lastError || 'Max retries exceeded',
          });
          this.emitSyncStructuredLog('outbox_item_permanently_failed', outboxStoreId, undefined, {
            pendingSyncId: pendingSync.id,
            table: pendingSync.table_name,
            reason: 'max_retries',
          });
          await this.notifyOutboxPermanentFailure(outboxStoreId, pendingSync, lastError || 'Max retries exceeded');
          continue;
        }

        let success = false;
        let error: unknown = null;

        switch (pendingSync.operation) {
          case 'create':
          case 'update': {
            const cleanedPayload = dataValidationService.cleanRecordForUpload(
              pendingSync.payload,
              pendingSync.table_name
            );
            if (cleanedPayload) {
              const idem = pendingSync.idempotency_key;
              const { error: upsertError } = await (supabase as any)
                .from(pendingSync.table_name)
                .upsert(cleanedPayload, {
                  onConflict: 'id',
                  ...(idem ? { headers: { 'Idempotency-Key': idem } } : {}),
                })
                .select();
              error = upsertError;
              success = !upsertError;
              if (upsertError) await this.handleSyncTransportError(outboxStoreId, upsertError);

              if (
                upsertError &&
                isNonRetryableHttpClientError(upsertError) &&
                !indicatesPermissionRevoked(upsertError)
              ) {
                await getDB().pending_syncs.update(pendingSync.id, {
                  status: 'permanently_failed',
                  last_error: upsertError.message || 'Client error',
                });
                this.emitSyncStructuredLog('outbox_item_permanently_failed', outboxStoreId, undefined, {
                  pendingSyncId: pendingSync.id,
                  table: pendingSync.table_name,
                  code: (upsertError as { code?: string }).code,
                });
                await this.notifyOutboxPermanentFailure(
                  outboxStoreId,
                  pendingSync,
                  upsertError.message || 'Client error'
                );
                continue;
              }

              if (upsertError && isUnrecoverableError(upsertError, pendingSync.table_name, cleanedPayload)) {
                await deleteProblematicRecord(pendingSync.table_name, pendingSync.record_id, upsertError);
                await getDB().removePendingSync(pendingSync.id);
                continue;
              }
            }
            break;
          }

          case 'delete': {
            const { error: deleteError } = await supabase
              .from(pendingSync.table_name as string)
              .delete()
              .eq('id', pendingSync.record_id);
            error = deleteError;
            success = !deleteError;
            if (deleteError) await this.handleSyncTransportError(outboxStoreId, deleteError);

            if (
              deleteError &&
              isNonRetryableHttpClientError(deleteError) &&
              !indicatesPermissionRevoked(deleteError)
            ) {
              await getDB().pending_syncs.update(pendingSync.id, {
                status: 'permanently_failed',
                last_error: deleteError.message || 'Client error',
              });
              this.emitSyncStructuredLog('outbox_item_permanently_failed', outboxStoreId, undefined, {
                pendingSyncId: pendingSync.id,
                table: pendingSync.table_name,
              });
              await this.notifyOutboxPermanentFailure(
                outboxStoreId,
                pendingSync,
                deleteError.message || 'Client error'
              );
              continue;
            }
            break;
          }
        }

        if (success) {
          await getDB().removePendingSync(pendingSync.id);
        } else if (error && isUnrecoverableError(error, pendingSync.table_name, pendingSync.payload)) {
          if (pendingSync.operation !== 'delete') {
            await deleteProblematicRecord(pendingSync.table_name, pendingSync.record_id, error);
          }
          await getDB().removePendingSync(pendingSync.id);
        } else if (error) {
          await getDB().pending_syncs.update(pendingSync.id, {
            retry_count: pendingSync.retry_count + 1,
            last_error: error instanceof Error ? error.message : (error as { message?: string })?.message || 'Retry failed',
          });
        }
      } catch (error) {
        await this.handleSyncTransportError(
          (pendingSync.payload as { store_id?: string })?.store_id || activeStoreId,
          error
        );
        if (isUnrecoverableError(error, pendingSync.table_name, pendingSync.payload)) {
          if (pendingSync.operation !== 'delete') {
            await deleteProblematicRecord(pendingSync.table_name, pendingSync.record_id, error);
          }
          await getDB().removePendingSync(pendingSync.id);
        } else {
          await getDB().pending_syncs.update(pendingSync.id, {
            retry_count: pendingSync.retry_count + 1,
            last_error: error instanceof Error ? error.message : 'Unknown error',
          });
        }
      }
    }
  }

  private async notifyOutboxPermanentFailure(
    storeId: string,
    pendingSync: PendingSync,
    technicalMessage: string
  ): Promise<void> {
    try {
      const store = await getDB().stores.get(storeId);
      const lang = (store?.preferred_language as 'en' | 'ar' | 'fr') || 'en';
      const titleMl = createMultilingualFromString('Outbox upload failed');
      const msgMl = createMultilingualFromString(
        `Could not sync ${pendingSync.table_name} (${pendingSync.operation}). ${technicalMessage}`
      );
      await notificationService.createNotification(
        storeId,
        'sync_error',
        getTranslatedString(titleMl, lang),
        getTranslatedString(msgMl, lang),
        { priority: 'high', metadata: { pendingSyncId: pendingSync.id, table: pendingSync.table_name } }
      );
    } catch (e) {
      console.warn('notifyOutboxPermanentFailure:', e);
    }
  }

  private async ensureStoreExists(storeId: string) {
    try {
      const localStore = await getDB().stores.get(storeId);
      if (localStore) return;

      const { data: remoteStore, error } = await supabase
        .from('stores')
        .select('*')
        .eq('id', storeId)
        .single();

      if (error && error.code !== 'PGRST116') {
        console.error(`❌ Error checking store on server:`, error);
        return;
      }

      if (!remoteStore) {
        const msg = `ensureStoreExists: cannot seed store ${storeId} — no remote row and no local row`;
        comprehensiveLoggingService.error(msg, { storeId });
        throw new Error(msg);
      }

      const row = remoteStore as Record<string, unknown>;
      const country = typeof row.country === 'string' ? row.country : '';
      let accepted = Array.isArray(row.accepted_currencies)
        ? (row.accepted_currencies as CurrencyCode[]).filter(Boolean)
        : [];
      if (!accepted.length) {
        if (country) {
          accepted = getDefaultCurrenciesForCountry(country);
        }
      }
      if (!accepted.length) {
        const msg = `ensureStoreExists: cannot determine accepted_currencies for store ${storeId}`;
        comprehensiveLoggingService.error(msg, { storeId });
        throw new Error(msg);
      }

      let preferred = row.preferred_currency as CurrencyCode | undefined;
      if (!preferred || !accepted.includes(preferred)) {
        preferred = accepted[0];
      }

      await getDB().stores.put({
        ...row,
        country: country || row.country,
        accepted_currencies: accepted,
        preferred_currency: preferred,
        _synced: true,
        _lastSyncedAt: new Date().toISOString(),
      } as Store);
    } catch (error) {
      console.error(`Error ensuring store exists:`, error);
      throw error;
    }
  }

  private async initializeSyncMetadata(storeId: string) {
    const hasAnySyncMetadata = await getDB().sync_metadata.count() > 0;

    const currentTime = new Date().toISOString();
    const defaults = {
      store_id: storeId,
      last_synced_version: 0,
      hydration_complete: false,
    };

    if (!hasAnySyncMetadata) {
      console.log('🔄 Initializing sync metadata for first sync...');

      for (const tableName of SYNC_TABLES) {
        try {
          await getDB().updateSyncMetadata(tableName, currentTime, defaults);
        } catch (error) {
          console.warn(`Failed to initialize sync metadata for ${tableName}:`, error);
        }
      }
    } else {
      // Ensure all tables have sync metadata rows; backfill any missing ones without overwriting existing entries
      for (const tableName of SYNC_TABLES) {
        try {
          const existing = await getDB().sync_metadata
            .where('table_name')
            .equals(tableName)
            .first();
          if (!existing) {
            await getDB().updateSyncMetadata(tableName, currentTime, defaults);
          }
        } catch (error) {
          console.warn(`Failed to backfill sync metadata for ${tableName}:`, error);
        }
      }
    }
  }

  async fullResync(storeId: string): Promise<SyncResult> {
    const result: SyncResult = {
      success: true,
      errors: [],
      synced: { uploaded: 0, downloaded: 0 },
      conflicts: 0
    };

    try {
      await getDB().transaction('rw', getDB().tables, async () => {
        for (const tableName of SYNC_TABLES) {
          await (db as any)[tableName].clear();
        }
        await getDB().sync_metadata.clear();
        await getDB().pending_syncs.clear();
      });

      for (const tableName of SYNC_TABLES) {
        console.log(`📥 Full resync: downloading ${tableName}...`);

        // Special handling for products: include both store-specific and global products
        if (tableName === 'products') {
          // Fetch store-specific products
          const storeProductsQuery = supabase
            .from('products')
            .select('*')
            .eq('store_id', storeId)
            .limit(SYNC_CONFIG.maxRecordsPerSync);

          // Fetch global products
          const globalProductsQuery = supabase
            .from('products')
            .select('*')
            .eq('is_global', true)
            .limit(SYNC_CONFIG.maxRecordsPerSync);

          // Execute both queries in parallel
          const [storeProductsResult, globalProductsResult] = await Promise.all([
            storeProductsQuery,
            globalProductsQuery
          ]);

          if (storeProductsResult.error) {
            result.errors.push(`Download failed for ${tableName} (store-specific): ${storeProductsResult.error.message}`);
          }

          if (globalProductsResult.error) {
            result.errors.push(`Download failed for ${tableName} (global): ${globalProductsResult.error.message}`);
          }

          // Combine results and remove duplicates
          const allRecords = [
            ...(storeProductsResult.data || []),
            ...(globalProductsResult.data || [])
          ] as Array<{ id: string } & Record<string, unknown>>;

          // Remove duplicates by id
          const uniqueRecords = Array.from(
            new Map(allRecords.map((record) => [record.id, record])).values()
          );

          if (uniqueRecords.length > 0) {
            // Normalize is_global field: convert boolean to 0/1 for Dexie compatibility
            const recordsWithSync = uniqueRecords.map((record) => {
              const normalized = { ...record };
              // Supabase returns boolean, but Dexie stores it as 0/1
              if (normalized.is_global !== undefined) {
                normalized.is_global = normalized.is_global === true ? 1 : 0;
              }
              return {
                ...normalized,
                _synced: true,
                _lastSyncedAt: new Date().toISOString()
              };
            });

            await (db as any)[tableName].bulkPut(recordsWithSync);
            result.synced.downloaded += uniqueRecords.length;
            console.log(`✅ Full resync: downloaded ${uniqueRecords.length} products (${storeProductsResult.data?.length || 0} store-specific + ${globalProductsResult.data?.length || 0} global)`);
          }

          const pv = uniqueRecords.length ? recordMaxVersion(uniqueRecords as Record<string, unknown>[]) : 0;
          await getDB().updateSyncMetadata(tableName, new Date().toISOString(), {
            store_id: storeId,
            last_synced_version: pv,
            hydration_complete: true,
          });
        } else {
          // For all other tables, use standard query with helper method
          let query = supabase.from(tableName as any).select('*');
          query = applyStoreFilter(query, tableName, storeId);
          query = query.limit(SYNC_CONFIG.maxRecordsPerSync);

          const { data: remoteRecords, error } = await query;

          if (error) {
            result.errors.push(`Download failed for ${tableName}: ${error.message}`);
          } else if (remoteRecords && remoteRecords.length > 0) {
            const recordsWithSync = (remoteRecords as Record<string, unknown>[]).map((record) => {
              const normalized = { ...record };
              
              // Normalize is_deleted for branches: convert to _deleted for IndexedDB
              if (tableName === 'branches' && normalized.is_deleted !== undefined) {
                normalized._deleted = normalized.is_deleted === true || normalized.is_deleted === 1;
                delete normalized.is_deleted;
                delete normalized.deleted_at;
                delete normalized.deleted_by;
              }
              
              // Normalize is_deleted for stores: convert to _deleted for IndexedDB
              if (tableName === 'stores' && normalized.is_deleted !== undefined) {
                normalized._deleted = normalized.is_deleted === true || normalized.is_deleted === 1;
                delete normalized.is_deleted;
                delete normalized.deleted_at;
                delete normalized.deleted_by;
              }

              if (tableName === 'bills') {
                normalized.bill_date = normalizeBillDateFromRemote(normalized);
              }
              
              return {
                ...normalized,
                _synced: true,
                _lastSyncedAt: new Date().toISOString()
              };
            });

            await (db as any)[tableName].bulkPut(recordsWithSync);
            result.synced.downloaded += remoteRecords.length;

            const mv = recordMaxVersion(remoteRecords as Record<string, unknown>[]);
            await getDB().updateSyncMetadata(tableName, new Date().toISOString(), {
              store_id: storeId,
              last_synced_version: mv,
              hydration_complete: true,
            });
          } else if (!error) {
            await getDB().updateSyncMetadata(tableName, new Date().toISOString(), {
              store_id: storeId,
              last_synced_version: 0,
              hydration_complete: true,
            });
          }
        }
      }

      result.success = result.errors.length === 0;

    } catch (error) {
      result.success = false;
      result.errors.push(error instanceof Error ? error.message : 'Full resync failed');
    }

    return result;
  }

  async getCheckpoint(tableName: SyncTable, storeId: string): Promise<SyncCheckpoint> {
    const row = await getDB().getSyncMetadata(tableName);
    const sid = row?.store_id ?? null;
    const version =
      !row || sid === storeId || sid === null || sid === undefined
        ? (row?.last_synced_version ?? 0)
        : 0;
    return {
      tableName,
      storeId,
      lastSyncedVersion: version,
      hydrationComplete: row?.hydration_complete ?? false,
      lastSyncedAt: row?.last_synced_at || '1970-01-01T00:00:00.000Z',
    };
  }

  async saveCheckpoint(
    tableName: SyncTable,
    storeId: string,
    version: number,
    hydrationComplete: boolean
  ): Promise<void> {
    await getDB().updateSyncMetadata(tableName, new Date().toISOString(), {
      last_synced_version: version,
      store_id: storeId,
      hydration_complete: hydrationComplete,
    });
    this.emitSyncStructuredLog('checkpoint_saved', storeId, undefined, {
      tableName,
      version,
      hydrationComplete,
    });
  }

  async hasExistingData(storeId: string): Promise<boolean> {
    const rows = await getDB().sync_metadata.toArray();
    return rows.some(
      r =>
        (r.last_synced_version ?? 0) > 0 &&
        (r.store_id === storeId || r.store_id === null || r.store_id === undefined)
    );
  }

  async getPermanentlyFailedItems(): Promise<PendingSync[]> {
    return getDB().pending_syncs.where('status').equals('permanently_failed').sortBy('created_at');
  }

  private normalizeRemoteRecordForDexie(
    tableName: SyncTable,
    record: Record<string, unknown>
  ): Record<string, unknown> {
    const normalized = { ...record };
    if (tableName === 'branches' && normalized.is_deleted !== undefined) {
      normalized._deleted = normalized.is_deleted === true || normalized.is_deleted === 1;
      delete normalized.is_deleted;
      delete normalized.deleted_at;
      delete normalized.deleted_by;
    }
    if (tableName === 'stores' && normalized.is_deleted !== undefined) {
      normalized._deleted = normalized.is_deleted === true || normalized.is_deleted === 1;
      delete normalized.is_deleted;
      delete normalized.deleted_at;
      delete normalized.deleted_by;
    }
    if (tableName === 'products' && normalized.is_global !== undefined) {
      normalized.is_global = normalized.is_global === true ? 1 : 0;
    }
    if (tableName === 'bills') {
      normalized.bill_date = normalizeBillDateFromRemote(normalized);
    }
    return {
      ...normalized,
      _synced: true,
      _lastSyncedAt: new Date().toISOString(),
    };
  }

  async downloadTablePaged(
    tableName: SyncTable,
    storeId: string,
    options?: { fromVersion?: number; signal?: AbortSignal }
  ): Promise<DownloadPageResult> {
    const pageSize = SYNC_CONFIG.cursorPageSize;
    const cp = await this.getCheckpoint(tableName, storeId);
    let cursor = options?.fromVersion ?? cp.lastSyncedVersion;
    let total = 0;
    let lastCount = 0;
    let finalMax = cursor;

    // On cold start (cursor === 0) skip version filtering — tables may not have a `version`
    // column yet, and we need all records anyway. Paginate by id offset instead.
    const useDeltaMode = cursor > 0;
    let idCursor: string | null = null; // used for cold-start id-based pagination

    let pageCount = 0;

    while (true) {
      if (options?.signal?.aborted) throw new DOMException('Aborted', 'AbortError');

      let query;
      if (tableName === 'products') {
        if (useDeltaMode) {
          query = supabase
            .from('products')
            .select('*')
            .or(`store_id.eq.${storeId},is_global.eq.true`)
            .gt('version', cursor)
            .order('version', { ascending: true })
            .limit(pageSize);
        } else {
          let q = supabase
            .from('products')
            .select('*')
            .or(`store_id.eq.${storeId},is_global.eq.true`)
            .order('id', { ascending: true })
            .limit(pageSize);
          if (idCursor) q = (q as any).gt('id', idCursor);
          query = q;
        }
      } else {
        let q = supabase.from(tableName as string).select('*');
        q = applyStoreFilter(q, tableName, storeId);
        if (useDeltaMode) {
          query = (q as any).gt('version', cursor).order('version', { ascending: true }).limit(pageSize);
        } else {
          q = (q as any).order('id', { ascending: true }).limit(pageSize);
          if (idCursor) q = (q as any).gt('id', idCursor);
          query = q;
        }
      }

      const { data: page, error } = await query;
      if (error) {
        console.error(
          `🔥 [sync] table '${tableName}' Supabase query error — pageCount=${pageCount}, idCursor=${idCursor}, cursor=${cursor}`,
          { code: (error as any).code, details: (error as any).details, hint: (error as any).hint, message: error.message }
        );
        await this.handleSyncTransportError(storeId, error);
        throw new Error(error.message);
      }

      const rows = (page || []) as Record<string, unknown>[];

      if (rows.length > 0) {
        const bulk = rows.map((r) => this.normalizeRemoteRecordForDexie(tableName, r));
        await (db as any)[tableName].bulkPut(bulk);
      }

      pageCount += 1;
      total += rows.length;
      lastCount = rows.length;
      const complete = rows.length < pageSize;

      if (useDeltaMode) {
        const maxV = rows.length ? recordMaxVersion(rows) : cursor;
        const pageMax = Math.max(cursor, maxV);

        if (rows.length > 0 && pageMax <= cursor) {
          console.warn(
            `[sync] Table "${tableName}" rows lack advancing version; stopping paged download to avoid a loop.`
          );
          await this.saveCheckpoint(tableName, storeId, cursor, true);
          break;
        }

        await this.saveCheckpoint(tableName, storeId, pageMax, complete);
        this.emitSyncStructuredLog('page_downloaded', storeId, undefined, {
          tableName, records: rows.length, cursorAfter: pageMax, complete,
        });
        if (complete) { finalMax = pageMax; break; }
        cursor = pageMax;
        finalMax = pageMax;
      } else {
        // Cold-start id-based pagination: advance idCursor to last row's id
        const lastId = rows.length ? String(rows[rows.length - 1]['id'] ?? '') : null;
        if (lastId) idCursor = lastId;
        // Save a nominal checkpoint version of 0 until delta mode is active
        await this.saveCheckpoint(tableName, storeId, 0, complete);
        this.emitSyncStructuredLog('page_downloaded', storeId, undefined, {
          tableName, records: rows.length, cursorAfter: 0, complete,
        });
        if (complete) { break; }
      }
    }

    return {
      tableName,
      recordsReceived: lastCount,
      lastVersion: finalMax,
      isComplete: true,
      totalRecordsDownloaded: total,
    };
  }

  async downloadTier(
    tier: DataTierName,
    storeId: string,
    branchId: string,
    options?: { signal?: AbortSignal }
  ): Promise<SyncResult> {
    this.emitSyncStructuredLog('tier_started', storeId, branchId, { tier });
    const tierStart = performance.now();
    const result: SyncResult = {
      success: true,
      errors: [],
      synced: { uploaded: 0, downloaded: 0 },
      conflicts: 0,
    };
    const waves = getTierWaves(tier);
    for (const wave of waves) {
      const settled = await Promise.all(
        wave.map((t) =>
          this.downloadTablePaged(t, storeId, { signal: options?.signal })
            .then((r) => ({ table: t, ok: true as const, r }))
            .catch((e) => ({ table: t, ok: false as const, e }))
        )
      );
      for (const s of settled) {
        if (s.ok) {
          result.synced.downloaded += s.r.totalRecordsDownloaded;
        } else {
          const msg = s.e instanceof Error ? s.e.message : String(s.e);
          result.errors.push(`${s.table}: ${msg}`);
          result.success = false;
          console.error(`🔥 [sync] tier '${tier}' table '${s.table}' FAILED — continuing`, s.e);
        }
      }
    }
    const tierMs = performance.now() - tierStart;
    console.log(
      `⏱️ [sync] tier ${tier}: ${tierMs.toFixed(0)}ms ` +
      `(${waves.length} waves, downloaded=${result.synced.downloaded}, success=${result.success})`
    );
    this.emitSyncStructuredLog('tier_completed', storeId, branchId, {
      tier,
      downloaded: result.synced.downloaded,
      success: result.success,
    });
    return result;
  }

  async syncTable(storeId: string, tableName: SyncTable): Promise<SyncResult> {
    const result: SyncResult = {
      success: true,
      errors: [],
      synced: { uploaded: 0, downloaded: 0 },
      conflicts: 0
    };

    try {
      // Upload unsynced records
      const unsyncedRecords = await getDB().getUnsyncedRecords(tableName);

      if (unsyncedRecords.length > 0) {
        const cleanedRecords = (unsyncedRecords as any[])
          .map((record: any) => dataValidationService.cleanRecordForUpload(record, tableName));

        const { error } = await (supabase as any)
          .from(tableName)
          .upsert(cleanedRecords, { onConflict: 'id' });

        if (error) {
          result.errors.push(`Upload failed: ${error.message}`);
        } else {
          for (const record of unsyncedRecords as any[]) {
            await getDB().markAsSynced(tableName, record.id);
          }
          result.synced.uploaded = unsyncedRecords.length;
        }
      }

      // Download remote changes with change detection
      const syncMetadata = await getDB().getSyncMetadata(tableName);
      const lastSyncAt = syncMetadata?.last_synced_at || '1970-01-01T00:00:00.000Z';
      const isFirstSync = !lastSyncAt || lastSyncAt === '1970-01-01T00:00:00.000Z';

      // Check for changes before querying
      if (!isFirstSync) {
        const changeDetection = await universalChangeDetectionService.detectChanges(
          tableName,
          storeId,
          lastSyncAt,
          isFirstSync
        );

        if (!changeDetection.hasChanges) {
          console.log(`⏭️  syncTable: Skipping ${tableName} - no changes detected`);
          return result; // Return early if no changes
        }
      }

      // Build query with store filter using helper method
      let query = supabase.from(tableName as any).select('*');
      query = applyStoreFilter(query, tableName, storeId);

      // Log query details for debugging
      console.log(`🔍 syncTable: Fetching ${tableName} for storeId=${storeId}, isFirstSync=${isFirstSync}, lastSyncAt=${lastSyncAt}`);

      const { data: remoteRecords, error } = await query;

      // Log query results for debugging
      console.log(`🔍 syncTable: Query result for ${tableName}:`, {
        hasError: !!error,
        error: error ? {
          message: error.message,
          details: error.details,
          hint: error.hint,
          code: error.code
        } : null,
        hasData: !!remoteRecords,
        dataType: Array.isArray(remoteRecords) ? 'array' : typeof remoteRecords,
        recordCount: Array.isArray(remoteRecords) ? remoteRecords.length : (remoteRecords ? 1 : 0),
        dataSample: Array.isArray(remoteRecords) && remoteRecords.length > 0 ? remoteRecords.slice(0, 2) : remoteRecords
      });

      if (error) {
        console.error(`❌ syncTable: Download failed for ${tableName}:`, error);
        result.errors.push(`Download failed: ${error.message}`);
        result.success = false;
      } else if (remoteRecords && Array.isArray(remoteRecords)) {
        if (remoteRecords.length === 0) {
          console.log(`ℹ️ syncTable: ${tableName} query returned empty array (no records found)`);
        }
        // For branches and stores, wrap writes in a transaction to ensure atomicity
        // This guarantees data is immediately queryable after sync completes
        const needsTransaction = tableName === 'branches' || tableName === 'stores';
        
        if (needsTransaction) {
          const table = (db as any)[tableName];
          await getDB().transaction('rw', [table], async () => {
            for (const record of remoteRecords as any[]) {
              const normalizedRecord = { ...record };
              
              // Normalize is_deleted for branches: convert to _deleted for IndexedDB
              if (tableName === 'branches' && normalizedRecord.is_deleted !== undefined) {
                normalizedRecord._deleted = normalizedRecord.is_deleted === true || normalizedRecord.is_deleted === 1;
                // Remove Supabase-specific fields that aren't in IndexedDB schema
                delete normalizedRecord.is_deleted;
                delete normalizedRecord.deleted_at;
                delete normalizedRecord.deleted_by;
              }
              
              // Normalize is_deleted for stores: convert to _deleted for IndexedDB
              if (tableName === 'stores' && normalizedRecord.is_deleted !== undefined) {
                normalizedRecord._deleted = normalizedRecord.is_deleted === true || normalizedRecord.is_deleted === 1;
                delete normalizedRecord.is_deleted;
                delete normalizedRecord.deleted_at;
                delete normalizedRecord.deleted_by;
              }
              
              // Ensure _deleted is always set (default to false)
              if (normalizedRecord._deleted === undefined) {
                normalizedRecord._deleted = false;
              }

              await table.put({
                ...normalizedRecord,
                _synced: true,
                _lastSyncedAt: new Date().toISOString()
              });
            }
          });
        } else {
          // For other tables, use individual puts (existing behavior)
          for (const record of remoteRecords as any[]) {
            const normalizedRecord = { ...record };

            if (tableName === 'bills') {
              normalizedRecord.bill_date = normalizeBillDateFromRemote(normalizedRecord);
            }
            
            await (db as any)[tableName].put({
              ...normalizedRecord,
              _synced: true,
              _lastSyncedAt: new Date().toISOString()
            });
          }
        }
        result.synced.downloaded = remoteRecords.length;
        console.log(`✅ syncTable: Successfully downloaded ${remoteRecords.length} records for ${tableName}`);
      } else {
        // No error but also no data - this is unexpected
        console.warn(`⚠️ syncTable: ${tableName} query returned no data and no error. Possible causes:`, {
          remoteRecords,
          storeId,
          tableName,
          isFirstSync,
          lastSyncAt
        });
        console.warn(`   - RLS policies might be blocking access`);
        console.warn(`   - Table might be empty`);
        console.warn(`   - Query filter might be too restrictive`);
        // Don't mark as error if it's just empty data, but log it
      }

      result.success = result.errors.length === 0;

    } catch (error) {
      result.success = false;
      result.errors.push(error instanceof Error ? error.message : 'Unknown error');
    }

    return result;
  }

  /**
   * Syncs stores and branches immediately (for admin users before branch selection)
   * This ensures branches are available in IndexedDB before BranchSelectionScreen tries to load them
   */
  async syncStoresAndBranches(storeId: string): Promise<SyncResult> {
    const result: SyncResult = {
      success: true,
      errors: [],
      synced: { uploaded: 0, downloaded: 0 },
      conflicts: 0
    };

    try {
      console.log('🔄 Syncing stores and branches for immediate branch selection...');
      
      // First sync stores (dependency for branches)
      const storesResult = await this.syncTable(storeId, 'stores');
      result.synced.downloaded += storesResult.synced.downloaded;
      result.synced.uploaded += storesResult.synced.uploaded;
      result.errors.push(...storesResult.errors);
      
      // Then sync branches
      const branchesResult = await this.syncTable(storeId, 'branches');
      result.synced.downloaded += branchesResult.synced.downloaded;
      result.synced.uploaded += branchesResult.synced.uploaded;
      result.errors.push(...branchesResult.errors);
      
      result.success = result.errors.length === 0;
      
      if (result.success) {
        console.log(`✅ Stores and branches synced: ${result.synced.downloaded} records downloaded`);
      } else {
        console.error(`❌ Stores and branches sync had errors:`, result.errors);
      }
    } catch (error) {
      result.success = false;
      result.errors.push(error instanceof Error ? error.message : 'Unknown error syncing stores and branches');
      console.error('❌ Error syncing stores and branches:', error);
    }

    return result;
  }

  isCurrentlyRunning(): boolean {
    return this.isRunning;
  }

  getLastSyncAttempt(): Date | null {
    return this.lastSyncAttempt;
  }
}

export const syncService = new SyncService();

export async function syncWithSupabase(storeId: string): Promise<SyncResult> {
  return syncService.sync(storeId);
}

/** Legacy display-only timestamp; version checkpoints in IndexedDB are authoritative (v55+). */
export function getLastSyncedAt(): string | null {
  return localStorage.getItem('last_synced_at');
}

/** Legacy display-only; prefer `sync_metadata` / `saveCheckpoint` for sync state. */
export function setLastSyncedAt(ts: string) {
  localStorage.setItem('last_synced_at', ts);
}
