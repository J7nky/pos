// Sync service orchestrator — module split from monolithic file
import { getDB } from '../lib/db';
import { supabase } from '../lib/supabase';
import { dataValidationService } from './dataValidationService';
import { universalChangeDetectionService } from './universalChangeDetectionService';
import { networkMonitorService } from './networkMonitorService';
import { eventStreamService } from './eventStreamService';
import { normalizeBillDateFromRemote } from '../utils/dateUtils';
import type { Store } from '../types';
import {
  SYNC_CONFIG,
  SYNC_TABLES,
} from './syncConfig';
import type { SyncResult, DeletionState } from './syncConfig';
export { SYNC_TABLES } from './syncConfig';
export type { SyncTable, SyncResult } from './syncConfig';
import { uploadLocalChanges, isUnrecoverableError, deleteProblematicRecord } from './syncUpload';
import { downloadRemoteChanges, applyStoreFilter } from './syncDownload';
import { detectAndSyncDeletions } from './syncDeletionDetection';

// Keep SyncTable import for use within the class
import type { SyncTable } from './syncConfig';

// Get singleton database instance
const db = getDB();

export class SyncService {
  private isRunning = false;
  private lastSyncAttempt: Date | null = null;
  private lastSyncCompleted: Date | null = null;
  // Persisted across page reloads so the 5-min interval is truly respected.
  private lastDeletionCheck: Date | null = SyncService.loadLastDeletionCheck();
  private deletionStateCache: Map<string, DeletionState> = new Map();

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

      // Invalidate change-detection cache for every table we just uploaded to so
      // the download phase re-checks those specific tables for concurrent remote
      // changes, while all OTHER tables benefit from the 60-second cache.
      for (const uploadedTable of uploadResult.uploadedTables) {
        universalChangeDetectionService.invalidateTable(uploadedTable, storeId);
      }

      const downloadStart = performance.now();
      const downloadResult = await downloadRemoteChanges(storeId);
      const downloadTime = performance.now() - downloadStart;
      console.log(`⏱️  Download time: ${downloadTime.toFixed(2)}ms (${downloadResult.downloaded} records)`);
      result.synced.downloaded = downloadResult.downloaded;
      result.conflicts += downloadResult.conflicts;
      result.errors.push(...downloadResult.errors);

      const pendingStart = performance.now();
      await this.processPendingSyncs();
      const pendingTime = performance.now() - pendingStart;
      console.log(`⏱️  Pending syncs processing: ${pendingTime.toFixed(2)}ms`);

      // Check if we should run deletion detection
      const shouldCheckDeletions = SYNC_CONFIG.enableDeletionDetection && (
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

  private async processPendingSyncs() {
    const pendingSyncs = await getDB().getPendingSyncs();

    for (const pendingSync of pendingSyncs) {
      try {
        if (pendingSync.retry_count >= SYNC_CONFIG.maxRetries) {
          console.error(`Max retries reached for pending sync: ${pendingSync.id}`);
          // Check if it's an unrecoverable error, if so, delete the record
          // Note: last_error might not be in the type definition but is added during updates
          const lastError = (pendingSync as any).last_error || '';
          const isUnrecoverable = lastError.includes('23503') ||
            lastError.includes('foreign key') ||
            lastError.includes('constraint') ||
            lastError.includes('violates');
          if (isUnrecoverable && pendingSync.operation !== 'delete') {
            await deleteProblematicRecord(
              pendingSync.table_name,
              pendingSync.record_id,
              { message: lastError, code: '23503' }
            );
          }
          await getDB().removePendingSync(pendingSync.id);
          continue;
        }

        let success = false;
        let error: any = null;

        switch (pendingSync.operation) {
          case 'create':
          case 'update': {
            const cleanedPayload = dataValidationService.cleanRecordForUpload(
              pendingSync.payload,
              pendingSync.table_name
            );
            if (cleanedPayload) {
              const { error: upsertError } = await supabase
                .from(pendingSync.table_name as any)
                .upsert(cleanedPayload)
                .select();
              error = upsertError;
              success = !upsertError;

              // If error is unrecoverable, delete the record
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
              .from(pendingSync.table_name as any)
              .delete()
              .eq('id', pendingSync.record_id);
            error = deleteError;
            success = !deleteError;
            break;
          }
        }

        if (success) {
          await getDB().removePendingSync(pendingSync.id);
        } else {
          // Check if error is unrecoverable
          if (error && isUnrecoverableError(error, pendingSync.table_name, pendingSync.payload)) {
            // Delete the record instead of retrying
            if (pendingSync.operation !== 'delete') {
              await deleteProblematicRecord(pendingSync.table_name, pendingSync.record_id, error);
            }
            await getDB().removePendingSync(pendingSync.id);
          } else {
            await getDB().pending_syncs.update(pendingSync.id, {
              retry_count: pendingSync.retry_count + 1,
              last_error: error instanceof Error ? error.message : (error?.message || 'Retry failed')
            });
          }
        }

      } catch (error) {
        // Check if it's an unrecoverable error
        if (isUnrecoverableError(error, pendingSync.table_name, pendingSync.payload)) {
          if (pendingSync.operation !== 'delete') {
            await deleteProblematicRecord(pendingSync.table_name, pendingSync.record_id, error);
          }
          await getDB().removePendingSync(pendingSync.id);
        } else {
          await getDB().pending_syncs.update(pendingSync.id, {
            retry_count: pendingSync.retry_count + 1,
            last_error: error instanceof Error ? error.message : 'Unknown error'
          });
        }
      }
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

      if (remoteStore) {
        await getDB().stores.put({
          ...(remoteStore as Record<string, unknown>),
          _synced: true,
          _lastSyncedAt: new Date().toISOString()
        } as Store);
      } else {
        const defaultStore = {
          id: storeId,
          name: 'Default Store',
          address: 'Default Address',
          phone: '000-000-0000',
          email: 'store@example.com',
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
          preferred_commission_rate: 0,
          preferred_language: 'en',
          preferred_currency: 'USD'
        };

        await (supabase as any).from('stores').insert(defaultStore);
        await getDB().stores.put({
          ...defaultStore,
          _synced: true,
          _lastSyncedAt: new Date().toISOString()
        } as Store);
      }
    } catch (error) {
      console.error(`Error ensuring store exists:`, error);
    }
  }

  private async initializeSyncMetadata(_storeId: string) {
    const hasAnySyncMetadata = await getDB().sync_metadata.count() > 0;

    const currentTime = new Date().toISOString();

    if (!hasAnySyncMetadata) {
      console.log('🔄 Initializing sync metadata for first sync...');

      for (const tableName of SYNC_TABLES) {
        try {
          await getDB().updateSyncMetadata(tableName, currentTime);
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
            await getDB().updateSyncMetadata(tableName, currentTime);
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

          await getDB().updateSyncMetadata(tableName, new Date().toISOString());
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

            await getDB().updateSyncMetadata(tableName, new Date().toISOString());
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
        
        // Verify branches are actually queryable after sync
        // This ensures IndexedDB transaction has committed and data is visible
        // Use multiple verification attempts with increasing delays
        try {
          // Ensure database is open before querying
          await getDB().ensureOpen();
          
          // Wait a bit for transaction to fully commit
          await new Promise(resolve => setTimeout(resolve, 200));
          
          let branchCount = 0;
          let verificationAttempts = 0;
          const maxVerificationAttempts = 5;
          
          while (verificationAttempts < maxVerificationAttempts) {
            branchCount = await getDB().branches
              .where('store_id')
              .equals(storeId)
              .filter(b => !(b._deleted === true))
              .count();
            
            if (branchCount > 0) {
              console.log(`✅ Verified ${branchCount} branches are queryable after ${verificationAttempts + 1} attempt(s)`);
              break;
            }
            
            verificationAttempts++;
            if (verificationAttempts < maxVerificationAttempts) {
              // Exponential backoff: 100ms, 200ms, 400ms, 800ms, 1600ms
              const delay = 100 * Math.pow(2, verificationAttempts - 1);
              console.log(`⏳ Branches not yet queryable, retrying verification in ${delay}ms (attempt ${verificationAttempts + 1}/${maxVerificationAttempts})...`);
              await new Promise(resolve => setTimeout(resolve, delay));
            }
          }
          
          if (branchCount === 0 && branchesResult.synced.downloaded > 0) {
            console.warn('⚠️ Branches synced but not queryable after verification attempts - data may be available shortly');
          }
        } catch (verifyError) {
          console.warn('⚠️ Failed to verify branches after sync:', verifyError);
          // Don't fail the sync if verification fails, but log the warning
        }
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

export function getLastSyncedAt(): string | null {
  return localStorage.getItem('last_synced_at');
}

export function setLastSyncedAt(ts: string) {
  localStorage.setItem('last_synced_at', ts);
}
