// Optimized sync service - reduced from 2109 to ~800 lines
// @ts-nocheck
/* eslint-disable */
import { getDB } from '../lib/db';
import { supabase } from '../lib/supabase';
import { Database } from '../types/database';
import { dataValidationService } from './dataValidationService';
import { universalChangeDetectionService, TABLES_WITH_UPDATED_AT } from './universalChangeDetectionService';
import { eventEmissionService } from './eventEmissionService';

// Get singleton database instance
const db = getDB();

type Tables = Database['public']['Tables'];

const SYNC_CONFIG = {
  batchSize: 100,
  maxRetries: 2,
  retryDelay: 2000,
  // syncInterval: REMOVED - no periodic sync in fully event-driven mode
  maxRecordsPerSync: 1000,
  incrementalSyncThreshold: 50,
  validationCacheExpiry: 900000,
  // Real-time refresh optimization
  debounceDelay: 500, // Debounce rapid sync requests
  maxConcurrentBatches: 3, // Limit concurrent batch operations
  connectionTimeout: 10000, // Connection timeout in ms
  queryTimeout: 30000, // Query timeout for individual queries (30s)
  // Deletion detection - optimized
  enableDeletionDetection: true, // Enable detection of remote deletions
  deletionDetectionInterval: 300000, // Run full deletion check every 5 minutes
  deletionBatchSize: 500, // Batch size for deletion detection queries
  deletionUseHashComparison: true, // Use hash-based comparison for large tables
  // Pagination for large tables
  largeTablPaginationSize: 500, // Page size for large table queries
  largeTableThreshold: 1000, // Tables with more records are considered "large"
};

// TABLES_WITH_UPDATED_AT is now imported from universalChangeDetectionService
// to avoid duplication and ensure consistency

// Tables that only have created_at (no updated_at)
const TABLES_WITH_CREATED_AT_ONLY = [
  // 'inventory_items', // ❌ REMOVED - it has updated_at in Supabase!
  'transactions',
  // NEW: Accounting foundation tables with created_at only
  'journal_entries',
  'balance_snapshots',
  'chart_of_accounts'
] as const;

// REMOVED: RARELY_CHANGING_TABLES - No longer needed in fully event-driven mode
// REMOVED: EVENT_DRIVEN_TABLES - ALL tables are now event-driven
// 
// In fully event-driven mode:
// - All changes emit events to branch_event_log
// - EventStreamService handles real-time sync via events
// - syncService.sync() is only used for:
//   1. Manual "Force Sync" triggered by user
//   2. Initial full resync when local DB is empty
//   3. Upload of local unsynced changes
//
// NO periodic polling happens anymore!

// Table sync order (respects foreign key dependencies)
const SYNC_TABLES = [
  'stores',
  'branches',
  'products',
  // 'suppliers', // REMOVED - migrated to entities table
  // 'customers', // REMOVED - migrated to entities table
  'users', // Employees with auth accounts - synced to Supabase
  'cash_drawer_accounts',
  // NEW: Accounting foundation tables (sync early for dependencies)
  'chart_of_accounts', // Must sync before journal_entries
  'entities', // Must sync before journal_entries and balance_snapshots (replaces customers/suppliers)
  'inventory_bills',
  'inventory_items',
  'transactions',
  'journal_entries', // Must sync after entities and chart_of_accounts
  'balance_snapshots', // Must sync after entities
  'bills',
  'bill_line_items',
  'bill_audit_logs',
  'cash_drawer_sessions',
  'missed_products',
  'reminders',
  // RBAC tables (Role-Based Access Control) - sync for cross-device permissions
  'role_permissions', // Default permissions per role (operations + module access)
  'user_permissions' // User-specific permission overrides (operations + module access)
] as const;

type SyncTable = typeof SYNC_TABLES[number];

const SYNC_DEPENDENCIES: Record<SyncTable, SyncTable[]> = {
  'products': [],
  'stores': [],
  'branches': ['stores'], // Branches belong to stores
  // 'suppliers': [], // REMOVED - migrated to entities
  // 'customers': [], // REMOVED - migrated to entities
  'users': ['stores'],
  'cash_drawer_accounts': [],
  // NEW: Accounting foundation dependencies
  'chart_of_accounts': ['stores'], // Chart of accounts belongs to stores
  'entities': ['stores'], // Entities belong to stores (replaces customers/suppliers)
  'journal_entries': ['stores', 'entities', 'chart_of_accounts'], // Journal entries reference entities and accounts
  'balance_snapshots': ['stores', 'entities'], // Balance snapshots reference entities
  'inventory_bills': ['entities'], // supplier_id references entity.id
  // supplier_id was removed from inventory_items; depend on batch linkage only
  'inventory_items': ['products', 'inventory_bills'],
  'transactions': [],
  'bills': ['entities'], // customer_id references entity.id
  'bill_line_items': ['bills', 'products', 'entities', 'inventory_items'], // supplier_id references entity.id
  'bill_audit_logs': ['bills'],
  'cash_drawer_sessions': ['cash_drawer_accounts'],
  'missed_products': ['cash_drawer_sessions', 'inventory_items'],
  'reminders': ['users'], // Reminders reference users (created_by, completed_by)
  'role_permissions': [], // RBAC: Role permissions are GLOBAL (no store_id, no dependencies)
  'user_permissions': ['stores', 'users'] // RBAC: User permissions reference stores and users
};

export interface SyncResult {
  success: boolean;
  errors: string[];
  synced: {
    uploaded: number;
    downloaded: number;
  };
  conflicts: number;
}

// Deletion state tracking for incremental deletion detection
interface DeletionState {
  table_name: string;
  last_check_at: string;
  record_count: number;
  checksum?: string; // Optional hash for quick comparison
}

export class SyncService {
  private isRunning = false;
  private lastSyncAttempt: Date | null = null;
  private lastDeletionCheck: Date | null = null;
  private deletionStateCache: Map<string, DeletionState> = new Map();

  /**
   * Wraps a query with timeout protection
   */
  private async queryWithTimeout<T>(
    queryPromise: Promise<T>,
    tableName: string,
    operation: string,
    timeoutMs: number = SYNC_CONFIG.queryTimeout
  ): Promise<T> {
    const timeoutPromise = new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error(`Query timeout: ${operation} for ${tableName}`)), timeoutMs)
    );

    try {
      return await Promise.race([queryPromise, timeoutPromise]);
    } catch (error) {
      if (error instanceof Error && error.message.includes('timeout')) {
        console.error(`⏱️ ${operation} timeout for ${tableName} after ${timeoutMs}ms`);
      }
      throw error;
    }
  }

  /**
   * Classifies errors to determine if they are unrecoverable.
   * Returns true if the error should result in record deletion.
   */
  private isUnrecoverableError(error: any, tableName: string, record: any): boolean {
    // PostgreSQL error codes for constraint violations and data validation errors
    const unrecoverableCodes = [
      '23503', // Foreign key constraint violation
      '23502', // Not null constraint violation
      '23514', // Check constraint violation
      '22003', // Numeric value out of range / numeric field overflow
      '42P01', // Undefined table
      '22P02', // Invalid text representation (bad data format)
      '23505', // Unique violation (for certain cases where we can't resolve)
    ];

    // Check error code
    if (error?.code && unrecoverableCodes.includes(error.code)) {
      return true;
    }

    // Check error message for constraint violations and validation errors
    const errorMessage = (error?.message || '').toLowerCase();
    const errorDetails = (error?.details || '').toLowerCase();
    const constraintKeywords = [
      'foreign key',
      'not null',
      'constraint',
      'violates',
      'does not exist',
      'undefined table',
      'numeric field overflow',
      'numeric value out of range',
      'value too large',
      'overflow',
      'invalid input',
      'bad value',
    ];

    if (constraintKeywords.some(keyword =>
      errorMessage.includes(keyword) || errorDetails.includes(keyword)
    )) {
      return true;
    }

    // 409 Conflict errors that aren't resolvable
    if (error?.code === '409' && errorMessage.includes('constraint')) {
      return true;
    }

    // 400 Bad Request errors that indicate data validation issues
    if (error?.code === '400' && (
      errorMessage.includes('overflow') ||
      errorMessage.includes('out of range') ||
      errorDetails.includes('precision') ||
      errorDetails.includes('scale')
    )) {
      return true;
    }

    return false;
  }

  /**
   * Attempts to fix a record by correcting data issues.
   * Returns the fixed record if fixable, null otherwise.
   */
  private tryFixRecord(tableName: string, record: any, error: any): any | null {
    const errorMessage = (error?.message || '').toLowerCase();
    const errorDetails = (error?.details || '').toLowerCase();

    // Fix foreign key violations by nullifying optional foreign keys
    if (error?.code === '23503' || errorMessage.includes('foreign key')) {
      // For bill_line_items, inventory_item_id is nullable, so we can nullify it
      if (tableName === 'bill_line_items' && record.inventory_item_id) {
        console.warn(`🔧 Attempting to fix ${tableName} record ${record.id} by nullifying inventory_item_id`);
        return {
          ...record,
          inventory_item_id: null,
        };
      }
    }

    // Fix numeric overflow by clamping values to valid ranges
    if (error?.code === '22003' || errorMessage.includes('overflow') || errorDetails.includes('precision')) {
      const fixedRecord = { ...record };
      let wasFixed = false;

      // For numeric(13,2) fields, max value is 9999999999999.99 (supports up to 10^13)
      const maxNumericValue = 10000000000000; // 10 trillion (10^13)
      const numericFields = ['unit_price', 'line_total', 'received_value', 'quantity', 'amount', 'balance'];

      for (const field of numericFields) {
        if (record[field] !== undefined && record[field] !== null) {
          const numValue = Number(record[field]);
          if (!isNaN(numValue) && Math.abs(numValue) > maxNumericValue) {
            const clamped = Math.sign(numValue) * Math.min(Math.abs(numValue), maxNumericValue);
            fixedRecord[field] = Math.round(clamped * 100) / 100; // Round to 2 decimal places
            wasFixed = true;
            console.warn(`🔧 Clamping ${field} from ${numValue} to ${fixedRecord[field]} for ${tableName} record ${record.id}`);
          }
        }
      }

      if (wasFixed) {
        return fixedRecord;
      }
    }

    return null;
  }

  /**
   * Undoes the effects of a record before deletion (restores inventory, recalculates totals, etc.)
   */
  private async undoRecordEffects(tableName: string, record: any): Promise<void> {
    try {
      if (tableName === 'bill_line_items') {
        // Use the existing removeBillLineItem logic to properly undo effects
        // This will restore inventory, recalculate bill totals, and create audit log
        const systemUserId = '00000000-0000-0000-0000-000000000000'; // System user for auto-deletions
        await getDB().removeBillLineItem(record.id, systemUserId);
        console.log(`🔄 Undone effects for bill_line_item ${record.id}: inventory restored, bill totals recalculated`);
      } else if (tableName === 'transactions') {
        // For transactions, we might need to reverse balance changes
        // This would require more context about which balances were affected
        console.warn(`⚠️ Transaction ${record.id} deleted - manual balance verification may be needed`);
      }
      // Add more undo handlers for other record types as needed
    } catch (undoError) {
      console.error(`❌ Failed to undo effects for ${tableName} record ${record.id}:`, undoError);
      // Continue with deletion even if undo fails
    }
  }

  /**
   * Deletes a problematic record from IndexedDB and undoes its effects.
   */
  private async deleteProblematicRecord(tableName: string, recordId: string, error: any): Promise<void> {
    try {
      const table = (db as any)[tableName];
      if (!table) {
        console.error(`❌ Table ${tableName} not found in database`);
        return;
      }

      const record = await table.get(recordId);
      if (!record) {
        console.log(`ℹ️ Record ${recordId} not found in local database, may already be deleted`);
        return;
      }

      // Log the error with full details
      console.error(`❌ UNRECOVERABLE ERROR - Deleting ${tableName} record ${recordId}:`, {
        code: error?.code,
        message: error?.message,
        details: error?.details,
        hint: error?.hint,
        record: {
          id: record.id,
          // Include relevant fields for debugging
          ...(tableName === 'bill_line_items' ? {
            bill_id: record.bill_id,
            product_name: record.product_name,
            quantity: record.quantity,
            unit_price: record.unit_price,
            line_total: record.line_total,
          } : {}),
        },
      });

      // Undo any side effects (restore inventory, recalc totals, etc.)
      await this.undoRecordEffects(tableName, record);

      // Delete the record from IndexedDB
      // For bill_line_items, removeBillLineItem already deleted it, so check first
      const stillExists = await table.get(recordId);
      if (stillExists) {
        await table.delete(recordId);
      }

      // Also remove from pending syncs if it exists
      const allPendingSyncs = await getDB().pending_syncs
        .where('table_name')
        .equals(tableName)
        .toArray();

      const matchingSyncs = allPendingSyncs.filter((sync: any) => sync.record_id === recordId);
      for (const pendingSync of matchingSyncs) {
        await getDB().removePendingSync(pendingSync.id);
      }

      console.warn(`✅ Successfully deleted and undone problematic record ${recordId} from ${tableName}`);
    } catch (deleteError) {
      console.error(`❌ Failed to delete problematic record ${recordId} from ${tableName}:`, deleteError);
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

    this.isRunning = true;
    this.lastSyncAttempt = new Date();
    const syncStartTime = performance.now();

    const result: SyncResult = {
      success: true,
      errors: [],
      synced: { uploaded: 0, downloaded: 0 },
      conflicts: 0
    };

    try {
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
      const uploadResult = await this.uploadLocalChanges(storeId, branchId);
      const uploadTime = performance.now() - uploadStart;
      console.log(`⏱️  Upload time: ${uploadTime.toFixed(2)}ms (${uploadResult.uploaded} records)`);
      result.synced.uploaded = uploadResult.uploaded;
      result.errors.push(...uploadResult.errors);

      const downloadStart = performance.now();
      const downloadResult = await this.downloadRemoteChanges(storeId);
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
        const deletionStart = performance.now();
        const deletionResult = await this.detectAndSyncDeletions(storeId);
        const deletionTime = performance.now() - deletionStart;
        console.log(`⏱️  Deletion detection: ${deletionTime.toFixed(2)}ms (${deletionResult.deleted} records removed)`);
        result.errors.push(...deletionResult.errors);
        this.lastDeletionCheck = new Date();
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
    }

    return result;
  }

  private async uploadLocalChanges(storeId: string, branchId?: string) {
    const result = { uploaded: 0, errors: [] as string[] };

    // Get detailed count for debugging
    const { crudHelperService } = await import('./crudHelperService');
    const detailedCount = await crudHelperService.getDetailedUnsyncedCount();
    console.log('🔍 [SYNC-DEBUG] Detailed unsynced count before sync:', detailedCount.summary);
    
    // Run detailed discrepancy analysis if there are unsynced records
    if (detailedCount.total > 0) {
      const { SyncDebugger } = await import('../utils/syncDebugger');
      await SyncDebugger.printSyncDiscrepancyReport(storeId);
    }

    for (const tableName of SYNC_TABLES) {
      const tableStart = performance.now();
      try {
        // console.log(`📤 Processing table: ${tableName}`);

        if (!await this.validateDependencies(tableName, storeId)) {
          console.log(`⏳ Skipping ${tableName} - dependencies not met`);
          continue;
        }

        const table = (db as any)[tableName];
        const activeRecords = await table.filter((record: any) => !record._synced && !record._deleted).toArray();
        const deletedRecords = await table.filter((record: any) => record._deleted && !record._synced).toArray();

        // Special logging for branches
        if (tableName === 'branches' && activeRecords.length > 0) {
          console.log(`📤 [Sync] Found ${activeRecords.length} unsynced branch record(s) to upload`);
          activeRecords.forEach((r: any) => {
            console.log(`   - Branch ${r.id}: name="${r.name}", address="${r.address}", phone="${r.phone}", _synced=${r._synced}`);
          });
        }

        if (activeRecords.length === 0 && deletedRecords.length === 0) {
          continue;
        }

        // Log when stores table has unsynced records
        if (tableName === 'stores' && activeRecords.length > 0) {
          console.log(`📤 [Sync] Found ${activeRecords.length} unsynced store record(s) to upload`);
          activeRecords.forEach((r: any) => {
            console.log(`   - Store ${r.id}: preferred_commission_rate=${r.preferred_commission_rate}, exchange_rate=${r.exchange_rate}, preferred_currency=${r.preferred_currency}`);
          });
        }

        // Debug logging for discrepancy analysis
        const tableDetail = detailedCount.byTable[tableName];
        if (tableDetail && (activeRecords.length !== tableDetail.active || deletedRecords.length !== tableDetail.deleted)) {
          console.warn(`🔍 [SYNC-DEBUG] Count mismatch for ${tableName}:`, {
            expected: tableDetail,
            found: { active: activeRecords.length, deleted: deletedRecords.length }
          });
        }

        // Process deleted records first if there are any (they don't need dependency validation)
        // This ensures deletions happen even if active records can't be synced due to dependencies
        if (deletedRecords.length > 0) {
          console.log(`  🗑️  Processing ${deletedRecords.length} deleted records for ${tableName}`);
        }

        console.log(`  📊 Found ${activeRecords.length} active and ${deletedRecords.length} deleted unsynced records`);

        // CRITICAL: For inventory_items with batch_id, check if parent batch exists
        if (tableName === 'inventory_items') {
          const recordsWithBatch = activeRecords.filter((r: any) => r.batch_id);

          if (recordsWithBatch.length > 0) {
            const batchIds = [...new Set(recordsWithBatch.map((record: any) => record.batch_id))];

            try {
              const { data: batchesData, error: batchesError } = await supabase
                .from('inventory_bills')
                .select('id')
                .in('id', batchIds);

              if (batchesError) {
                console.warn(`Failed to validate batch IDs for inventory_items:`, batchesError);
              } else {
                const validBatchIds = new Set(batchesData?.map((b: any) => b.id) || []);

                // Also check local batches
                const localBatches = await getDB().inventory_bills
                  .where('store_id')
                  .equals(storeId)
                  .filter((batch: any) => !batch._deleted)
                  .toArray();
                const localBatchIds = new Set(localBatches.map((batch: any) => batch.id));

                // Filter records to only include those with valid batch references
                const validRecords: any[] = [];
                const invalidRecords: any[] = [];

                for (const record of activeRecords) {
                  if (!record.batch_id ||
                    validBatchIds.has(record.batch_id) ||
                    localBatchIds.has(record.batch_id)) {
                    validRecords.push(record);
                  } else {
                    invalidRecords.push(record);
                    console.warn(`⏳ Inventory item ${record.id} skipped - batch ${record.batch_id} not yet synced`);
                  }
                }

                if (invalidRecords.length > 0) {
                  console.log(`⏳ ${invalidRecords.length} inventory_items skipped - waiting for parent batches`);
                }

                // Update activeRecords
                activeRecords.length = 0;
                activeRecords.push(...validRecords);

                if (activeRecords.length === 0) {
                  console.log(`⏳ No inventory_items ready to sync (all waiting for parent batches)`);
                  continue;
                }
              }
            } catch (error) {
              console.warn(`Failed to validate batch IDs for inventory_items:`, error);
            }
          }
        }

        // CRITICAL: For bill_line_items and bill_audit_logs, check if parent bills exist in Supabase
        // NOTE: Only validate activeRecords - deleted records don't need parent bill validation
        if ((tableName === 'bill_line_items' || tableName === 'bill_audit_logs') && activeRecords.length > 0) {
          const billIds = [...new Set(activeRecords.map((record: any) => record.bill_id))];

          try {
            const { data: billsData, error: billsError } = await supabase
              .from('bills')
              .select('id')
              .in('id', billIds);

            if (billsError) {
              console.warn(`Failed to validate bill IDs for ${tableName}:`, billsError);
              console.log(`⏳ Skipping ${tableName} active records sync - cannot validate bill dependencies (deleted records will still be processed)`);
              // Don't continue - still process deleted records
              activeRecords.length = 0; // Clear active records but continue to process deleted records
            } else {
              const validBillIds = new Set(billsData?.map((b: any) => b.id) || []);

              // Filter out records whose parent bills don't exist in Supabase yet
              const recordsWithValidBills: any[] = [];
              const recordsWithMissingBills: any[] = [];

              for (const record of activeRecords) {
                if (validBillIds.has(record.bill_id)) {
                  recordsWithValidBills.push(record);
                } else {
                  recordsWithMissingBills.push(record);
                }
              }

              if (recordsWithMissingBills.length > 0) {
                console.log(`⏳ ${recordsWithMissingBills.length} ${tableName} active records skipped - parent bills not yet synced (will retry next sync)`);
              }

              // Update activeRecords to only include those with valid parent bills
              // Note: We don't continue here even if no valid records - we still want to process deleted records
              activeRecords.length = 0;
              activeRecords.push(...recordsWithValidBills);
            }
          } catch (error) {
            console.warn(`Failed to validate bill IDs for ${tableName}:`, error);
            console.log(`⏳ Skipping ${tableName} active records sync - cannot validate bill dependencies (deleted records will still be processed)`);
            // Don't continue - still process deleted records
            activeRecords.length = 0; // Clear active records but continue to process deleted records
          }
        }

        // Validate records
        const validation = await dataValidationService.validateRecords(tableName, activeRecords, storeId);

        // Remove invalid records from sync queue
        for (const invalid of validation.errors) {
          console.warn(`🚫 Removing invalid ${tableName} record: ${invalid.reason}`, invalid.record);
          await getDB().markAsSynced(tableName, invalid.record.id);
        }

        const validRecords = activeRecords.filter((r: any) =>
          !validation.errors.some(e => e.record.id === r.id)
        );

        // Upload in batches
        for (let i = 0; i < validRecords.length; i += SYNC_CONFIG.batchSize) {
          const batch = validRecords.slice(i, i + SYNC_CONFIG.batchSize);
          let cleanedBatch = batch
            .map((record: any) => dataValidationService.cleanRecordForUpload(record, tableName))
            .filter((cleaned: any) => cleaned !== null); // Remove null records (invalid/missing required fields)
          
          // Skip batch if all records were filtered out
          if (cleanedBatch.length === 0) {
            console.warn(`⚠️ Skipping ${tableName} batch - all records were invalid`);
            continue;
          }

          // Preflight: for bill_line_items, nullify inventory_item_id if the referenced item doesn't exist in Supabase
          if (tableName === 'bill_line_items') {
            try {
              const inventoryItemIds = [...new Set((cleanedBatch as any[])
                .map(r => r.inventory_item_id)
                .filter((v: string | null) => !!v))] as string[];
              if (inventoryItemIds.length > 0) {
                const { data: existingItems, error: invErr } = await supabase
                  .from('inventory_items')
                  .select('id')
                  .in('id', inventoryItemIds);
                if (!invErr) {
                  const existingSet = new Set((existingItems || []).map((i: any) => i.id));
                  cleanedBatch = (cleanedBatch as any[]).map(r => (
                    r.inventory_item_id && !existingSet.has(r.inventory_item_id)
                      ? { ...r, inventory_item_id: null }
                      : r
                  ));
                }
              }
            } catch (e) {
              console.warn('Preflight check for bill_line_items inventory_item_id failed:', e);
            }
          }

          // Special handling for cash_drawer_accounts: validate store_id matches user's store
          if (tableName === 'cash_drawer_accounts') {
            // Verify all records have valid store_id and branch_id
            const invalidRecords = (cleanedBatch as any[]).filter((r: any) => 
              !r.store_id || !r.branch_id || !r.account_code
            );
            if (invalidRecords.length > 0) {
              console.error(`❌ Found ${invalidRecords.length} cash_drawer_accounts records with missing required fields:`, invalidRecords);
              // Remove invalid records from batch
              cleanedBatch = (cleanedBatch as any[]).filter((r: any) => 
                r.store_id && r.branch_id && r.account_code
              );
              if (cleanedBatch.length === 0) {
                console.warn('⚠️ Skipping cash_drawer_accounts batch - all records were invalid');
                continue;
              }
            }
          }

          // Special handling for cash_drawer_sessions: don't upload open sessions if one already exists in Supabase
          if (tableName === 'cash_drawer_sessions') {
            try {
              const openSessions = (cleanedBatch as any[]).filter(s => s.status === 'open');
              if (openSessions.length > 0) {
                const accountIds = [...new Set(openSessions.map(s => s.account_id))] as string[];
                
                // Check for existing open sessions in Supabase for these accounts
                const { data: existingOpenSessions, error: checkError } = await supabase
                  .from('cash_drawer_sessions')
                  .select('id, account_id, opened_at')
                  .in('account_id', accountIds)
                  .eq('status', 'open');
                
                if (!checkError && existingOpenSessions && existingOpenSessions.length > 0) {
                  // Don't upload local open sessions if there's already an open session in Supabase
                  // Instead, mark them as synced and let the download phase bring in the remote session
                  for (const existingSession of existingOpenSessions) {
                    const conflictingLocalSessions = openSessions.filter(
                      s => s.account_id === existingSession.account_id && s.id !== existingSession.id
                    );
                    
                    for (const conflictingLocalSession of conflictingLocalSessions) {
                      // Remove from batch to prevent upload
                      cleanedBatch = (cleanedBatch as any[]).filter(s => s.id !== conflictingLocalSession.id);
                      batch = batch.filter((r: any) => r.id !== conflictingLocalSession.id);
                      // Close the local session since there's already an open one remotely
                      // This prevents the local app from thinking it has an open session
                      await (db as any).cash_drawer_sessions.update(conflictingLocalSession.id, {
                        status: 'closed',
                        closed_at: new Date().toISOString(),
                        updated_at: new Date().toISOString(),
                        _synced: false
                      });
                      // Mark original as synced to prevent retry
                      await getDB().markAsSynced(tableName, conflictingLocalSession.id);
                    }
                  }
                }
              }
            } catch (e) {
              console.warn('Preflight check for cash_drawer_sessions failed:', e);
            }
          }

          // Special logging for branches before upload
          if (tableName === 'branches' && cleanedBatch.length > 0) {
            console.log(`📤 [Sync] Uploading ${cleanedBatch.length} branch record(s) to Supabase:`, 
              cleanedBatch.map((r: any) => ({ id: r.id, name: r.name, address: r.address, phone: r.phone }))
            );
          }

          const { error } = await supabase
            .from(tableName as any)
            .upsert(cleanedBatch, { onConflict: 'id' });

          if (error) {
            console.error(`❌ Upload failed for ${tableName}:`, error);
            if (tableName === 'branches') {
              console.error(`❌ Branch upload error details:`, { 
                errorCode: error.code, 
                errorMessage: error.message, 
                errorDetails: error.details,
                records: cleanedBatch.map((r: any) => ({ id: r.id, name: r.name }))
              });
            }
            result.errors.push(`Upload failed for ${tableName}: ${error.message}`);

            // Special handling for cash_drawer_sessions unique constraint violation
            if (tableName === 'cash_drawer_sessions' && error.code === '23505' && 
                error.message.includes('uniq_open_session_per_account')) {
              console.log('🔄 Handling cash_drawer_sessions unique constraint violation...');
              await this.handleCashDrawerSessionConflict(cleanedBatch, batch);
            } else {
              // Check if this is an unrecoverable error
              const hasUnrecoverableError = cleanedBatch.some((record, idx) =>
                this.isUnrecoverableError(error, tableName, record)
              );

              // Try individual uploads for constraint/FK errors or batch errors
              if (error.code === '23503' || error.message.includes('foreign key') || hasUnrecoverableError) {
                await this.handleFailedBatch(tableName, cleanedBatch, batch);
              } else {
                // For other errors, try individual uploads to identify the problematic records
                await this.handleFailedBatch(tableName, cleanedBatch, batch);
              }
            }
          } else {
            // Mark all records as synced
            for (const record of batch as any[]) {
              await getDB().markAsSynced(tableName, record.id);
            }
            result.uploaded += batch.length;
            console.log(`✅ [Sync] Successfully uploaded ${batch.length} ${tableName} records to Supabase`);
            
            // Special logging for branches
            if (tableName === 'branches' && batch.length > 0) {
              console.log(`✅ [Sync] Branch upload success details:`, 
                batch.map((r: any) => ({ id: r.id, name: r.name, address: r.address, phone: r.phone }))
              );
            }
            
            // 🎯 EMIT EVENTS: After successful upload to Supabase
            // This ensures the record exists when other devices receive the event
            if (tableName === 'bills') {
              for (const record of batch as any[]) {
                try {
                  await eventEmissionService.emitSalePosted(
                    record.store_id,
                    record.branch_id,
                    record.id,
                    record.created_by,
                    {
                      total: record.total_amount || 0,
                      line_items_count: 0 // We don't have line items count here, but event still useful
                    }
                  );
                  console.log(`🎯 [Event] Emitted sale_posted event for bill ${record.id}`);
                } catch (eventError) {
                  // Event emission failure is not critical
                  console.error('[Event] Failed to emit sale_posted event:', eventError);
                }
              }
            } else if (tableName === 'transactions') {
              // Emit events for transactions (affects cash drawer balance)
              for (const record of batch as any[]) {
                try {
                  await eventEmissionService.emitPaymentPosted(
                    record.store_id,
                    record.branch_id,
                    record.id,
                    record.created_by,
                    {
                      amount: record.amount || 0,
                      currency: record.currency || 'USD',
                      method: record.payment_method || 'cash'
                    }
                  );
                  console.log(`🎯 [Event] Emitted payment_posted event for transaction ${record.id}`);
                } catch (eventError) {
                  console.error('[Event] Failed to emit payment_posted event:', eventError);
                }
              }
            } else if (tableName === 'journal_entries') {
              // Emit events for journal entries (source of truth for cash drawer balance)
              // Group by transaction_id to emit one event per transaction
              const transactionGroups = new Map<string, any[]>();
              for (const record of batch as any[]) {
                const txId = record.transaction_id || 'standalone';
                if (!transactionGroups.has(txId)) {
                  transactionGroups.set(txId, []);
                }
                transactionGroups.get(txId)!.push(record);
              }
              
              for (const [txId, entries] of transactionGroups) {
                try {
                  // Use first entry for store/branch info
                  const firstEntry = entries[0];
                  await eventEmissionService.emitJournalEntryCreated(
                    firstEntry.store_id,
                    firstEntry.branch_id,
                    firstEntry.id, // Use first journal entry ID as entity_id
                    firstEntry.created_by,
                    {
                      entries_count: entries.length
                    }
                  );
                  console.log(`🎯 [Event] Emitted journal_entry_created event for ${entries.length} entries (transaction ${txId})`);
                } catch (eventError) {
                  console.error('[Event] Failed to emit journal_entry_created event:', eventError);
                }
              }
            } else if (tableName === 'cash_drawer_accounts') {
              // Emit events for cash drawer account updates (balance changes)
              for (const record of batch as any[]) {
                try {
                  await eventEmissionService.emitEvent({
                    store_id: record.store_id,
                    branch_id: record.branch_id || '',
                    event_type: 'cash_drawer_account_updated',
                    entity_type: 'cash_drawer_account',
                    entity_id: record.id,
                    operation: 'update',
                    user_id: record.updated_by || null,
                    metadata: {
                      // Note: current_balance is computed from journal entries, not stored
                      // Including for informational purposes only
                      current_balance: record.current_balance || 0
                    }
                  });
                  console.log(`🎯 [Event] Emitted cash_drawer_account_updated event for account ${record.id}`);
                } catch (eventError) {
                  console.error('[Event] Failed to emit cash_drawer_account_updated event:', eventError);
                }
              }
            } else if (tableName === 'inventory_items') {
              // Emit events for inventory item updates (quantity changes from sales)
              for (const record of batch as any[]) {
                try {
                  await eventEmissionService.emitEvent({
                    store_id: record.store_id,
                    branch_id: record.branch_id || '',
                    event_type: 'inventory_item_updated',
                    entity_type: 'inventory_item',
                    entity_id: record.id,
                    operation: 'update',
                    user_id: record.updated_by || null,
                    metadata: {
                      quantity: record.quantity || 0,
                      received_quantity: record.received_quantity || 0
                    }
                  });
                  console.log(`🎯 [Event] Emitted inventory_item_updated event for item ${record.id}`);
                } catch (eventError) {
                  console.error('[Event] Failed to emit inventory_item_updated event:', eventError);
                }
              }
            } else if (tableName === 'inventory_bills') {
              // Emit events for inventory bills (inventory receipts)
              for (const record of batch as any[]) {
                try {
                  await eventEmissionService.emitInventoryReceived(
                    record.store_id,
                    record.branch_id,
                    record.id,
                    record.created_by,
                    {
                      items_count: 0, // We don't have count here, but event still useful
                      total_value: 0
                    }
                  );
                  console.log(`🎯 [Event] Emitted inventory_received event for bill ${record.id}`);
                } catch (eventError) {
                  console.error('[Event] Failed to emit inventory_received event:', eventError);
                }
              }
            } else if (tableName === 'entities') {
              // Emit events for entity updates (customer/supplier balance changes)
              for (const record of batch as any[]) {
                try {
                  await eventEmissionService.emitEvent({
                    store_id: record.store_id,
                    branch_id: branchId || '', // Use current branch for store-level events
                    event_type: record.entity_type === 'customer' ? 'customer_updated' : 'supplier_updated',
                    entity_type: 'entity', // Database constraint requires 'entity', not 'customer' or 'supplier'
                    entity_id: record.id,
                    operation: 'update',
                    user_id: record.updated_by || null,
                    metadata: {
                      name: record.name,
                      entity_type: record.entity_type // Store actual type (customer/supplier) in metadata
                      // Note: Balances are no longer stored on entities - calculated from journal entries
                    }
                  });
                  console.log(`🎯 [Event] Emitted ${record.entity_type}_updated event for ${record.id}`);
                } catch (eventError) {
                  console.error(`[Event] Failed to emit ${record.entity_type}_updated event:`, eventError);
                }
              }
            } else if (tableName === 'stores') {
              // Emit events for store settings updates
              for (const record of batch as any[]) {
                try {
                  // Validate branch_id - must be a valid UUID for store-level events
                  if (!branchId || branchId === '') {
                    console.warn(`⚠️ [Event] Cannot emit store_updated event: branchId is missing or empty. Store: ${record.id}`);
                    console.warn('   Store-level events require a branch_id. Skipping event emission.');
                    continue;
                  }

                  console.log(`🎯 [Event] Emitting store_updated event for store ${record.id}, branch ${branchId}`);
                  await eventEmissionService.emitEvent({
                    store_id: record.id,
                    branch_id: branchId, // Use current branch for store-level events
                    event_type: 'store_updated',
                    entity_type: 'store',
                    entity_id: record.id,
                    operation: 'update',
                    user_id: record.updated_by || null,
                    metadata: {
                      name: record.name,
                      exchange_rate: record.exchange_rate,
                      preferred_currency: record.preferred_currency,
                      preferred_language: record.preferred_language,
                      preferred_commission_rate: record.preferred_commission_rate
                    }
                  });
                  console.log(`✅ [Event] Successfully emitted store_updated event for store ${record.id}`);
                } catch (eventError) {
                  console.error(`❌ [Event] Failed to emit store_updated event for store ${record.id}:`, eventError);
                  // Log the error details for debugging
                  if (eventError instanceof Error) {
                    console.error('   Error message:', eventError.message);
                    console.error('   Error stack:', eventError.stack);
                  }
                }
              }
            } else if (tableName === 'branches') {
              // Emit events for branch updates
              for (const record of batch as any[]) {
                try {
                  await eventEmissionService.emitEvent({
                    store_id: record.store_id,
                    branch_id: record.id,
                    event_type: 'branch_updated',
                    entity_type: 'branch',
                    entity_id: record.id,
                    operation: 'update',
                    user_id: record.updated_by || null,
                    metadata: {
                      name: record.name,
                      location: record.location
                    }
                  });
                  console.log(`🎯 [Event] Emitted branch_updated event for branch ${record.id}`);
                } catch (eventError) {
                  console.error('[Event] Failed to emit branch_updated event:', eventError);
                }
              }
            } else if (tableName === 'users') {
              // Emit events for user updates
              for (const record of batch as any[]) {
                try {
                  await eventEmissionService.emitEvent({
                    store_id: record.store_id,
                    branch_id: branchId || '',
                    event_type: 'user_updated',
                    entity_type: 'user',
                    entity_id: record.id,
                    operation: 'update',
                    user_id: record.updated_by || record.id,
                    metadata: {
                      name: record.name,
                      role: record.role
                    }
                  });
                  console.log(`🎯 [Event] Emitted user_updated event for user ${record.id}`);
                } catch (eventError) {
                  console.error('[Event] Failed to emit user_updated event:', eventError);
                }
              }
            } else if (tableName === 'products') {
              // Emit events for product updates
              for (const record of batch as any[]) {
                try {
                  await eventEmissionService.emitEvent({
                    store_id: record.store_id,
                    branch_id: branchId || '',
                    event_type: 'product_updated',
                    entity_type: 'product',
                    entity_id: record.id,
                    operation: 'update',
                    user_id: record.updated_by || null,
                    metadata: {
                      name: record.name,
                      barcode: record.barcode,
                      category: record.category
                    }
                  });
                  console.log(`🎯 [Event] Emitted product_updated event for product ${record.id}`);
                } catch (eventError) {
                  console.error('[Event] Failed to emit product_updated event:', eventError);
                }
              }
            } else if (tableName === 'chart_of_accounts') {
              // Emit events for chart of account updates
              for (const record of batch as any[]) {
                try {
                  await eventEmissionService.emitEvent({
                    store_id: record.store_id,
                    branch_id: branchId || '',
                    event_type: 'chart_of_account_updated',
                    entity_type: 'chart_of_account',
                    entity_id: record.id,
                    operation: 'update',
                    user_id: record.updated_by || null,
                    metadata: {
                      account_code: record.account_code,
                      account_name: record.account_name
                    }
                  });
                  console.log(`🎯 [Event] Emitted chart_of_account_updated event for ${record.account_code}`);
                } catch (eventError) {
                  console.error('[Event] Failed to emit chart_of_account_updated event:', eventError);
                }
              }
            } else if (tableName === 'role_permissions') {
              // Emit events for role permission updates
              for (const record of batch as any[]) {
                try {
                  await eventEmissionService.emitEvent({
                    store_id: record.store_id,
                    branch_id: branchId || '',
                    event_type: 'role_permission_updated',
                    entity_type: 'role_permissions',
                    entity_id: record.id,
                    operation: 'update',
                    user_id: record.updated_by || null,
                    metadata: {
                      role: record.role,
                      operation: record.operation,
                      allowed: record.allowed
                    }
                  });
                  console.log(`🎯 [Event] Emitted role_permission_updated event for ${record.id}`);
                } catch (eventError) {
                  console.error('[Event] Failed to emit role_permission_updated event:', eventError);
                }
              }
            } else if (tableName === 'user_permissions') {
              // Emit events for user permission updates
              for (const record of batch as any[]) {
                try {
                  await eventEmissionService.emitEvent({
                    store_id: record.store_id,
                    branch_id: branchId || '',
                    event_type: 'user_permission_updated',
                    entity_type: 'user_permissions',
                    entity_id: record.id,
                    operation: 'update',
                    user_id: record.updated_by || null,
                    metadata: {
                      user_id: record.user_id,
                      operation: record.operation,
                      allowed: record.allowed
                    }
                  });
                  console.log(`🎯 [Event] Emitted user_permission_updated event for ${record.id}`);
                } catch (eventError) {
                  console.error('[Event] Failed to emit user_permission_updated event:', eventError);
                }
              }
            }
          }
        }

        await getDB().updateSyncMetadata(tableName, new Date().toISOString());

        const tableTime = performance.now() - tableStart;
        console.log(`  ⏱️  ${tableName} upload: ${tableTime.toFixed(2)}ms`);

        // Handle deleted records
        for (const record of deletedRecords as any[]) {
          try {
            // Special handling for inventory_items with foreign key constraints
            if (tableName === 'inventory_items') {
              // Check if this inventory item is referenced by any bill_line_items
              const { data: referencingItems, error: refError } = await supabase
                .from('bill_line_items')
                .select('id')
                .eq('inventory_item_id', record.id)
                .limit(1);

              if (refError) {
                result.errors.push(`Failed to check references for inventory item ${record.id}: ${refError.message}`);
                continue;
              }

              if (referencingItems && referencingItems.length > 0) {
                // Clear the inventory_item_id reference in all line items first
                const { error: updateError } = await supabase
                  .from('bill_line_items')
                  .update({ inventory_item_id: null })
                  .eq('inventory_item_id', record.id);

                if (updateError) {
                  result.errors.push(`Failed to clear references for inventory item ${record.id}: ${updateError.message}`);
                  continue;
                }
              }

              // Delete missed_products references before deletion (FK constraint + NOT NULL constraint)
              try {
                const { error: deleteMissedError } = await supabase
                  .from('missed_products')
                  .delete()
                  .eq('inventory_item_id', record.id);

                if (deleteMissedError) {
                  result.errors.push(`Failed to delete missed_products references: ${deleteMissedError.message}`);
                  console.warn('Failed to delete missed_products:', deleteMissedError);
                }
              } catch (missedProductsError) {
                // Table might not exist in some schemas - ignore
                console.warn('missed_products table not accessible:', missedProductsError);
              }
            }

            const { error } = await supabase
              .from(tableName as any)
              .delete()
              .eq('id', record.id);

            if (error) {
              console.error(`❌ Delete failed for ${tableName}/${record.id}:`, error);
              result.errors.push(`Delete failed for ${tableName}/${record.id}: ${error.message}`);
            } else {
              // Mark as synced and delete from local database
              await getDB().markAsSynced(tableName, record.id);
              await table.delete(record.id);
              result.uploaded++;
              console.log(`✅ Successfully deleted ${tableName} record ${record.id.substring(0, 8)}...`);
            }
          } catch (error) {
            console.error(`❌ Delete error for ${tableName}/${record.id}:`, error);
            result.errors.push(`Delete error for ${tableName}/${record.id}: ${error}`);
          }
        }

        if (deletedRecords.length > 0) {
          const deleteTime = performance.now() - tableStart;
          console.log(`  🗑️  ${tableName} deletions processed: ${deleteTime.toFixed(2)}ms`);
        }

      } catch (error) {
        const tableTime = performance.now() - tableStart;
        console.error(`  ⏱️  ${tableName} upload failed after ${tableTime.toFixed(2)}ms:`, error);
        result.errors.push(`Table ${tableName} upload error: ${error}`);
      }
    }

    return result;
  }

  private async handleFailedBatch(tableName: string, cleanedBatch: any[], originalBatch: any[]) {
    console.log(`🔍 Attempting individual uploads to identify problem records...`);
    for (let i = 0; i < cleanedBatch.length; i++) {
      const record = cleanedBatch[i];
      const original = originalBatch[i];
      try {
        const { error: individualError } = await supabase
          .from(tableName as any)
          .upsert([record], { onConflict: 'id' });

        if (individualError) {
          // Check if error is unrecoverable
          if (this.isUnrecoverableError(individualError, tableName, record)) {
            // Try to fix the record once by nullifying optional foreign keys
            const fixedRecord = this.tryFixRecord(tableName, record, individualError);

            if (fixedRecord) {
              // Try once more with the fixed record
              const { error: retryError } = await supabase
                .from(tableName as any)
                .upsert([fixedRecord], { onConflict: 'id' });

              if (!retryError) {
                // Success! Update local record and mark as synced
                await (db as any)[tableName].update(original.id, {
                  ...fixedRecord,
                  _synced: true,
                  _lastSyncedAt: new Date().toISOString(),
                });
                console.log(`✅ Fixed and synced ${tableName} record ${original.id}`);
                continue;
              }

              // Fix didn't work, delete the record
              await this.deleteProblematicRecord(tableName, original.id, retryError || individualError);
            } else {
              // Can't fix, delete the record
              await this.deleteProblematicRecord(tableName, original.id, individualError);
            }
          } else {
            // Recoverable error - add to pending syncs for retry
            console.error(`❌ Individual record failed (will retry):`, record.id, individualError.message);
            await getDB().addPendingSync(tableName, record.id, 'update', record);
          }
        } else {
          await getDB().markAsSynced(tableName, original.id);
        }
      } catch (e) {
        console.error(`❌ Critical error with record:`, record, e);
        // For unexpected errors, check if they're unrecoverable
        if (this.isUnrecoverableError(e, tableName, record)) {
          await this.deleteProblematicRecord(tableName, original.id, e);
        } else {
          await getDB().addPendingSync(tableName, record.id, 'update', record);
        }
      }
    }
  }

  /**
   * Handle cash drawer session conflicts when unique constraint is violated
   * If there's already an open session in Supabase, don't upload the local one
   * Instead, close the local session and let the remote one be downloaded
   */
  private async handleCashDrawerSessionConflict(cleanedBatch: any[], originalBatch: any[]): Promise<void> {
    console.log(`🔍 Handling cash_drawer_sessions conflicts individually...`);
    
    for (let i = 0; i < cleanedBatch.length; i++) {
      const record = cleanedBatch[i];
      const original = originalBatch[i];
      
      // Only handle open sessions (closed sessions don't have the constraint)
      if (record.status !== 'open') {
        // Closed sessions can be uploaded normally
        try {
          const { error } = await supabase
            .from('cash_drawer_sessions')
            .upsert([record], { onConflict: 'id' });
          
          if (!error) {
            await getDB().markAsSynced('cash_drawer_sessions', original.id);
            console.log(`✅ Synced closed session ${original.id.substring(0, 8)}...`);
          } else {
            console.error(`❌ Failed to sync closed session ${original.id}:`, error);
            await getDB().addPendingSync('cash_drawer_sessions', original.id, 'update', record);
          }
        } catch (e) {
          console.error(`❌ Error syncing closed session:`, e);
          await getDB().addPendingSync('cash_drawer_sessions', original.id, 'update', record);
        }
        continue;
      }
      
      try {
        // Check if there's an existing open session in Supabase for this account
        const { data: existingSessions, error: checkError } = await supabase
          .from('cash_drawer_sessions')
          .select('id, opened_at, status')
          .eq('account_id', record.account_id)
          .eq('status', 'open')
          .limit(1);
        
        if (checkError) {
          console.error(`❌ Error checking for existing session:`, checkError);
          await getDB().addPendingSync('cash_drawer_sessions', original.id, 'update', record);
          continue;
        }
        
        const existingSession = existingSessions && existingSessions.length > 0 ? existingSessions[0] : null;
        
        if (existingSession && existingSession.id !== record.id) {
          // There's already an open session in Supabase - don't upload the local one
          
          // Close the local session since there's already an open one remotely
          // This prevents the local app from thinking it has an open session
          await (db as any).cash_drawer_sessions.update(original.id, {
            status: 'closed',
            closed_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
            _synced: false
          });
          
          // Mark as synced to prevent retry
          await getDB().markAsSynced('cash_drawer_sessions', original.id);
          continue;
        }
        
        // No conflict - try to upload the session
        const { error: uploadError } = await supabase
          .from('cash_drawer_sessions')
          .upsert([record], { onConflict: 'id' });
        
        if (!uploadError) {
          await getDB().markAsSynced('cash_drawer_sessions', original.id);
          console.log(`✅ Synced cash_drawer_session ${original.id.substring(0, 8)}...`);
        } else {
          console.error(`❌ Failed to sync session ${original.id}:`, uploadError);
          await getDB().addPendingSync('cash_drawer_sessions', original.id, 'update', record);
        }
      } catch (e) {
        console.error(`❌ Error handling session conflict:`, e);
        await getDB().addPendingSync('cash_drawer_sessions', original.id, 'update', record);
      }
    }
  }

  /**
   * Helper: Get timestamp field for a table
   */
  private getTimestampField(tableName: string): 'updated_at' | 'created_at' {
    const hasUpdatedAt = TABLES_WITH_UPDATED_AT.includes(tableName as any);
    return hasUpdatedAt ? 'updated_at' : 'created_at';
  }

  /**
   * Helper: Apply store filter to query based on table type
   */
  private applyStoreFilter(query: any, tableName: string, storeId: string): any {
    // Special case: products - include both store-specific and global
    if (tableName === 'products') {
      return query.or(`store_id.eq.${storeId},is_global.eq.true`);
    }
    // Special case: stores - filter by id (not store_id)
    if (tableName === 'stores') {
      return query.eq('id', storeId);
    }
    // Special case: transactions - no store filter
    if (tableName === 'transactions') {
      return query; // No filter
    }
    // Special case: role_permissions - GLOBAL table (no store_id column)
    if (tableName === 'role_permissions') {
      return query; // No filter - download all global permissions
    }
    // Default: filter by store_id
    return query.eq('store_id', storeId);
  }

  private async downloadRemoteChanges(storeId: string) {
    const result = { downloaded: 0, conflicts: 0, errors: [] as string[] };

    for (const tableName of SYNC_TABLES) {
      const tableStart = performance.now();
      try {
        // NOTE: In fully event-driven mode, ALL tables are handled by EventStreamService
        // This sync() method is only used for:
        // 1. Initial full resync (when DB is empty)
        // 2. Manual "Force Sync" triggered by user
        // 3. Uploading local unsynced changes
        // Real-time updates happen via EventStreamService, not periodic sync

        if (!await this.validateDependencies(tableName, storeId)) {
          console.log(`⏳ Skipping download for ${tableName} - dependencies not met`);
          continue;
        }

        const syncMetadata = await getDB().getSyncMetadata(tableName);
        let lastSyncAt = syncMetadata?.last_synced_at || '1970-01-01T00:00:00.000Z';

        if (lastSyncAt && isNaN(Date.parse(lastSyncAt))) {
          console.warn(`Invalid lastSyncAt for ${tableName}: ${lastSyncAt}, using default`);
          lastSyncAt = '1970-01-01T00:00:00.000Z';
        }

        const isFirstSync = !lastSyncAt || lastSyncAt === '1970-01-01T00:00:00.000Z';
        const timestampField = this.getTimestampField(tableName);
        
        // Check if we have any non-deleted local records - if not, do a full sync to catch existing records
        // This prevents the issue where sync metadata exists but local database is empty (manually cleared, migration, etc.)
        const table = (db as any)[tableName];
        const localRecordCount = await table.filter((record: any) => !record._deleted).count();
        const shouldDoFullSync = isFirstSync || localRecordCount === 0;

        // Change detection - skip sync if no changes detected
        // In fully event-driven mode, this is only used for initial/manual sync
        if (!shouldDoFullSync) {
          const changeDetection = await universalChangeDetectionService.detectChanges(
            tableName,
            storeId,
            lastSyncAt,
            isFirstSync
          );

          if (!changeDetection.hasChanges) {
            const detectionTime = performance.now() - tableStart;
            // Still update sync metadata to track that we checked
            await getDB().updateSyncMetadata(tableName, new Date().toISOString());
            continue; // Skip to next table
          }

          console.log(`📊 Incremental sync for ${tableName} since ${lastSyncAt} (${localRecordCount} local records) - changes detected`);
        } else {
          console.log(`📊 Full sync for ${tableName} (${localRecordCount} local records)`);
        }

        // Add debug logging for branches
        if (tableName === 'branches') {
          console.log(`🔍 Branch debug: localRecordCount=${localRecordCount}, isFirstSync=${isFirstSync}, shouldDoFullSync=${shouldDoFullSync}`);
          const localBranches = await table.filter((record: any) => !record._deleted).toArray();
          console.log(`🔍 Local branches:`, localBranches.map(b => ({ id: b.id, name: b.name, store_id: b.store_id, _synced: b._synced })));
        }

        // Build query with store filter
        let query = supabase.from(tableName as any).select('*');
        query = this.applyStoreFilter(query, tableName, storeId);

        // Special handling for products: always include global products even in incremental syncs
        // Global products might not have been updated recently, so we need to fetch them separately
        let remoteRecords: any[] = [];
        let error: any = null;
        
        if (tableName === 'products' && !shouldDoFullSync) {
          // For incremental sync, fetch store-specific and global products separately
          // 1. Store-specific products updated since lastSyncAt
          const storeSpecificQuery = supabase
            .from('products')
            .select('*')
            .eq('store_id', storeId)
            .gte(timestampField, lastSyncAt)
            .order(timestampField, { ascending: true })
            .limit(SYNC_CONFIG.maxRecordsPerSync);
          
          // 2. All global products (regardless of update time)
          const globalProductsQuery = supabase
            .from('products')
            .select('*')
            .eq('is_global', true)
            .order(timestampField, { ascending: true })
            .limit(SYNC_CONFIG.maxRecordsPerSync);
          
          console.log(`📊 Incremental sync for ${tableName} since ${lastSyncAt} (${localRecordCount} local records) - fetching store-specific and global products separately`);
          
          // Execute both queries in parallel
          const [storeSpecificResult, globalProductsResult] = await Promise.all([
            storeSpecificQuery,
            globalProductsQuery
          ]);
          
          // Log detailed results for debugging
          console.log(`🔍 Store-specific products query result:`, {
            count: storeSpecificResult.data?.length || 0,
            error: storeSpecificResult.error,
            hasData: !!storeSpecificResult.data
          });
          
          console.log(`🔍 Global products query result:`, {
            count: globalProductsResult.data?.length || 0,
            error: globalProductsResult.error,
            hasData: !!globalProductsResult.data,
            data: globalProductsResult.data?.slice(0, 2) // Log first 2 for debugging
          });
          
          // Log errors but continue processing successful results
          if (storeSpecificResult.error) {
            console.error(`⚠️ Failed to fetch store-specific products:`, storeSpecificResult.error);
            result.errors.push(`Download failed for ${tableName} (store-specific): ${storeSpecificResult.error.message}`);
          }
          
          if (globalProductsResult.error) {
            console.error(`⚠️ Failed to fetch global products:`, globalProductsResult.error);
            console.error(`⚠️ Global products error details:`, {
              message: globalProductsResult.error.message,
              details: globalProductsResult.error.details,
              hint: globalProductsResult.error.hint,
              code: globalProductsResult.error.code
            });
            result.errors.push(`Download failed for ${tableName} (global): ${globalProductsResult.error.message}`);
          } else if (!globalProductsResult.data || globalProductsResult.data.length === 0) {
            // No error but no data - might be RLS blocking or no global products exist
            console.warn(`⚠️ Global products query returned no data (no error). Possible causes:`);
            console.warn(`   - RLS policies might be blocking access`);
            console.warn(`   - No global products exist in database`);
            console.warn(`   - Try running: SELECT * FROM products WHERE is_global = true;`);
          }
          
          // Set error only if both queries failed
          if (storeSpecificResult.error && globalProductsResult.error) {
            error = storeSpecificResult.error; // Use first error
          }
          
          // Combine results and remove duplicates (even if one query failed)
          const allRecords = [
            ...(storeSpecificResult.data || []),
            ...(globalProductsResult.data || [])
          ];
          
          // Remove duplicates by id and normalize is_global field
          const uniqueRecords = Array.from(
            new Map(allRecords.map(record => {
              // Normalize is_global: convert any truthy value to 1, any falsy to 0 for Dexie compatibility
              const normalized = { ...record };
              if (normalized.is_global !== undefined && normalized.is_global !== null) {
                // Handle boolean, string, or number values
                const isGlobal = normalized.is_global === true || 
                                 normalized.is_global === 1 || 
                                 normalized.is_global === '1' || 
                                 normalized.is_global === 'true';
                normalized.is_global = isGlobal ? 1 : 0;
              } else {
                // Default to 0 if undefined or null
                normalized.is_global = 0;
              }
              return [record.id, normalized];
            })).values()
          );
          
          remoteRecords = uniqueRecords;
        } else {
          // Apply incremental sync filter if not full sync
          if (!shouldDoFullSync) {
            query = query.gte(timestampField, lastSyncAt);
            console.log(`📊 Incremental sync for ${tableName} since ${lastSyncAt} (${localRecordCount} local records)`);
          }

          query = query
            .order(timestampField, { ascending: true })
            .limit(SYNC_CONFIG.maxRecordsPerSync);

          const queryResult = await query;
          remoteRecords = queryResult.data || [];
          error = queryResult.error;
        }

        if (error) {
          result.errors.push(`Download failed for ${tableName}: ${error.message}`);
          console.error(`❌ Query error for ${tableName}:`, error);
          continue;
        }

        if (!remoteRecords || remoteRecords.length === 0) {
          const tableTime = performance.now() - tableStart;

          // For inventory_items specifically, log diagnostic info
          if (tableName === 'inventory_items') {
            const allRemoteQuery = supabase.from('inventory_items').select('id, store_id, created_at').eq('store_id', storeId).limit(5);
            const { data: sampleRecords } = await allRemoteQuery;
            console.log(`🔍 Diagnostic: Found ${sampleRecords?.length || 0} total inventory_items in Supabase for this store (sample check)`);
          }
          
          // For branches specifically, log diagnostic info
          if (tableName === 'branches') {
            const allRemoteQuery = supabase.from('branches').select('id, store_id, name, created_at').eq('store_id', storeId).limit(5);
            const { data: sampleRecords } = await allRemoteQuery;
            console.log(`🔍 Diagnostic: Found ${sampleRecords?.length || 0} total branches in Supabase for this store (sample check)`);
            if (sampleRecords && sampleRecords.length > 0) {
              console.log(`🔍 Branch sample:`, sampleRecords[0]);
            }
            
            // Also check if there are any branches at all (without store filter)
            const { data: allBranches } = await supabase.from('branches').select('id, store_id, name').limit(5);
            console.log(`🔍 Diagnostic: Found ${allBranches?.length || 0} total branches in Supabase (all stores)`);
          }
          continue;
        }

        console.log(`📊 Found ${remoteRecords.length} records for ${tableName}`);

        for (const remoteRecord of remoteRecords) {
          try {
            // Validate that record has required id field
            if (!remoteRecord || !remoteRecord.id || typeof remoteRecord.id !== 'string') {
              console.warn(`⚠️ Skipping record in ${tableName} - missing or invalid id:`, remoteRecord);
              result.errors.push(`Record in ${tableName} missing or invalid id`);
              continue;
            }

            const localRecord = await (db as any)[tableName].get(remoteRecord.id);

            // Normalize fields for Dexie compatibility
            const normalizedRecord = { ...remoteRecord };
            
            // Normalize is_global for products: convert boolean to 0/1 for Dexie
            if (tableName === 'products' && normalizedRecord.is_global !== undefined && normalizedRecord.is_global !== null) {
              // Handle boolean, string, or number values
              const isGlobal = normalizedRecord.is_global === true || 
                               normalizedRecord.is_global === 1 || 
                               normalizedRecord.is_global === '1' || 
                               normalizedRecord.is_global === 'true';
              normalizedRecord.is_global = isGlobal ? 1 : 0;
            } else if (tableName === 'products') {
              // Default to 0 if undefined or null
              normalizedRecord.is_global = 0;
            }
            
            // Normalize is_deleted for stores: convert to _deleted for IndexedDB
            if (tableName === 'stores' && normalizedRecord.is_deleted !== undefined) {
              normalizedRecord._deleted = normalizedRecord.is_deleted === true || normalizedRecord.is_deleted === 1;
              // Remove Supabase-specific fields that aren't in IndexedDB schema
              delete normalizedRecord.is_deleted;
              delete normalizedRecord.deleted_at;
              delete normalizedRecord.deleted_by;
            }
            
            // Normalize is_deleted for branches: convert to _deleted for IndexedDB
            if (tableName === 'branches' && normalizedRecord.is_deleted !== undefined) {
              normalizedRecord._deleted = normalizedRecord.is_deleted === true || normalizedRecord.is_deleted === 1;
              // Remove Supabase-specific fields that aren't in IndexedDB schema
              delete normalizedRecord.is_deleted;
              delete normalizedRecord.deleted_at;
              delete normalizedRecord.deleted_by;
            }

            if (!localRecord) {
              await (db as any)[tableName].put({
                ...normalizedRecord,
                _synced: true,
                _lastSyncedAt: new Date().toISOString()
              });
              result.downloaded++;
            } else {
              const conflict = await this.resolveConflict(tableName, localRecord, normalizedRecord);
              if (conflict) {
                result.conflicts++;
              } else {
                result.downloaded++;
              }
            }
          } catch (error) {
            const recordId = remoteRecord?.id || 'unknown';
            result.errors.push(`Record process error ${tableName}/${recordId}: ${error}`);
          }
        }

        const latestRecord = remoteRecords[remoteRecords.length - 1];
        const latestTimestamp = latestRecord?.[timestampField] || new Date().toISOString();
        await getDB().updateSyncMetadata(tableName, latestTimestamp);

        const tableTime = performance.now() - tableStart;
        console.log(`  ⏱️  ${tableName} download: ${tableTime.toFixed(2)}ms (${remoteRecords.length} records)`);

      } catch (error) {
        const tableTime = performance.now() - tableStart;
        console.error(`  ⏱️  ${tableName} download failed after ${tableTime.toFixed(2)}ms:`, error);
        result.errors.push(`Table ${tableName} download error: ${error}`);
      }
    }

    return result;
  }

  /**
   * Detects and removes records that exist locally but were deleted from Supabase
   * OPTIMIZED: Uses pagination, incremental state tracking, and hash comparison
   */
  private async detectAndSyncDeletions(storeId: string) {
    const result = { deleted: 0, errors: [] as string[] };
    
    console.log('🔍 Starting optimized deletion detection...');
    const detectionStart = performance.now();
    
    for (const tableName of SYNC_TABLES) {
      const tableStart = performance.now();
      try {
        // NOTE: Deletion detection runs for ALL tables as a safety mechanism
        // Even though deletions are handled via events (reverse operation),
        // this catches any deletions that happened directly in Supabase

        const table = (db as any)[tableName];
        
        // Get all synced local records (only check synced records, as unsynced are local-only)
        const localRecords = await table
          .filter((record: any) => record._synced && !record._deleted)
          .toArray();
        
        if (localRecords.length === 0) {
          continue;
        }
        
        const localCount = localRecords.length;
        const isLargeTable = localCount >= SYNC_CONFIG.largeTableThreshold;
        
        // Check if we can use incremental detection
        const lastState = this.deletionStateCache.get(tableName);
        const shouldUseIncremental = lastState && 
          SYNC_CONFIG.deletionUseHashComparison && 
          isLargeTable;
        
        if (shouldUseIncremental) {
          // Quick check: if record count hasn't changed significantly, skip full check
          const countDiff = Math.abs(localCount - lastState.record_count);
          if (countDiff === 0) {
            console.log(`⚡ ${tableName}: No count change, skipping deletion check`);
            continue;
          }
          
          if (countDiff < 10 && localCount > 100) {
            console.log(`⚡ ${tableName}: Minor count change (${countDiff}), using targeted check`);
          }
        }
        
        // Fetch remote IDs with pagination for large tables
        const remoteIds = new Set<string>();
        let hasMore = true;
        let offset = 0;
        let totalFetched = 0;
        let queryTimedOut = false;
        
        while (hasMore) {
          let query = supabase
            .from(tableName as any)
            .select('id', { count: 'exact' });
          
          // Apply store filtering
          if (tableName === 'stores') {
            query = query.eq('id', storeId);
          } else if (tableName === 'transactions') {
            // No store filter for transactions
          } else if (tableName === 'role_permissions') {
            // GLOBAL table - no store_id filter (check all global permissions)
            // No filter needed
          } else if (tableName === 'products') {
            query = query.or(`store_id.eq.${storeId},is_global.eq.true`);
          } else {
            query = query.eq('store_id', storeId);
          }
          
          // Add pagination
          const pageSize = SYNC_CONFIG.deletionBatchSize;
          query = query.range(offset, offset + pageSize - 1);
          
          // Add timeout wrapper
          const queryPromise = query;
          const timeoutPromise = new Promise((_, reject) => 
            setTimeout(() => reject(new Error('Query timeout')), SYNC_CONFIG.queryTimeout)
          );
          
          let queryResult;
          try {
            queryResult = await Promise.race([queryPromise, timeoutPromise]) as any;
          } catch (timeoutError) {
            result.errors.push(`Query timeout for ${tableName} at offset ${offset}`);
            console.error(`⏱️ Query timeout for ${tableName} at offset ${offset}`);
            queryTimedOut = true;
            break;
          }
          
          const { data: remoteRecords, error, count } = queryResult;
          
          if (error) {
            result.errors.push(`Failed to fetch remote IDs for ${tableName}: ${error.message}`);
            queryTimedOut = true;
            break;
          }
          
          // Add fetched IDs to set
          if (remoteRecords) {
            remoteRecords.forEach((r: any) => remoteIds.add(r.id));
            totalFetched += remoteRecords.length;
          }
          
          // Check if there are more records
          hasMore = remoteRecords && remoteRecords.length === pageSize;
          offset += pageSize;
          
          // Safety check: prevent infinite loops
          if (offset > 50000) {
            console.warn(`⚠️ ${tableName}: Reached pagination limit (50k records)`);
            break;
          }
        }
        
        // CRITICAL FIX: Skip deletion detection if query timed out or failed
        // Otherwise we'll incorrectly mark records as deleted when they're just not fetched yet
        if (queryTimedOut) {
          console.warn(`⚠️ Skipping deletion detection for ${tableName} - query timed out or failed. Will retry next sync.`);
          const tableTime = performance.now() - tableStart;
          console.log(`  ⏱️  ${tableName} deletion check: ${tableTime.toFixed(2)}ms (skipped due to timeout)`);
          continue; // Skip to next table
        }
        
        console.log(`📊 ${tableName}: Fetched ${totalFetched} remote IDs, comparing with ${localCount} local records`);
        
        // Find local records that don't exist remotely
        const deletedLocally: any[] = [];
        for (const localRecord of localRecords) {
          if (!remoteIds.has(localRecord.id)) {
            deletedLocally.push(localRecord);
          }
        }
        
        if (deletedLocally.length > 0) {
          console.log(`🗑️  Found ${deletedLocally.length} remotely deleted ${tableName} records`);
          
          for (const record of deletedLocally) {
            try {
              // Undo any side effects before deletion
              await this.undoRecordEffects(tableName, record);
              
              // Delete from local database
              await table.delete(record.id);
              result.deleted++;
              
              console.log(`✅ Removed remotely deleted ${tableName} record: ${record.id.substring(0, 8)}...`);
            } catch (deleteError) {
              console.error(`❌ Failed to delete ${tableName}/${record.id}:`, deleteError);
              result.errors.push(`Failed to delete ${tableName}/${record.id}: ${deleteError}`);
            }
          }
        }
        
        // Update deletion state cache
        this.deletionStateCache.set(tableName, {
          table_name: tableName,
          last_check_at: new Date().toISOString(),
          record_count: localCount - deletedLocally.length,
        });
        
        const tableTime = performance.now() - tableStart;
        console.log(`  ⏱️  ${tableName} deletion check: ${tableTime.toFixed(2)}ms`);
        
      } catch (error) {
        const tableTime = performance.now() - tableStart;
        console.error(`❌ Deletion detection failed for ${tableName} after ${tableTime.toFixed(2)}ms:`, error);
        result.errors.push(`Deletion detection error for ${tableName}: ${error}`);
      }
    }
    
    const totalTime = performance.now() - detectionStart;
    console.log(`🗑️  Deletion detection complete: ${result.deleted} records removed in ${totalTime.toFixed(2)}ms`);
    return result;
  }

  private async resolveConflict(tableName: string, localRecord: any, remoteRecord: any): Promise<boolean> {
    // Normalize is_global field if it's a product (remoteRecord is already normalized, but double-check)
    const normalizedRemote = { ...remoteRecord };
    if (tableName === 'products' && normalizedRemote.is_global !== undefined && normalizedRemote.is_global !== null) {
      // Handle boolean, string, or number values
      const isGlobal = normalizedRemote.is_global === true || 
                       normalizedRemote.is_global === 1 || 
                       normalizedRemote.is_global === '1' || 
                       normalizedRemote.is_global === 'true';
      normalizedRemote.is_global = isGlobal ? 1 : 0;
    } else if (tableName === 'products') {
      // Default to 0 if undefined or null
      normalizedRemote.is_global = 0;
    }

    if (localRecord._synced) {
      await (db as any)[tableName].put({
        ...normalizedRemote,
        _synced: true,
        _lastSyncedAt: new Date().toISOString()
      });
      return false;
    }

    // Financial-specific conflict resolution
    if (tableName === 'cash_drawer_accounts') {
      return await this.resolveCashDrawerAccountConflict(localRecord, normalizedRemote);
    }

    // Entity balance conflict resolution (replaces customers/suppliers)
    if (tableName === 'entities' && (localRecord.entity_type === 'customer' || localRecord.entity_type === 'supplier')) {
      return await this.resolveBalanceConflict(tableName, localRecord, normalizedRemote);
    }

    // Employee balance conflict resolution
    if (tableName === 'users') {
      return await this.resolveEmployeeBalanceConflict(localRecord, normalizedRemote);
    }

    // Transaction conflict resolution (immutable - remote always wins)
    if (tableName === 'transactions') {
      return await this.resolveTransactionConflict(localRecord, normalizedRemote);
    }

    // Bill and bill line items conflict resolution
    if (tableName === 'bills' || tableName === 'bill_line_items') {
      return await this.resolveBillConflict(tableName, localRecord, normalizedRemote);
    }

    // Default: timestamp-based resolution
    const timestampField = this.getTimestampField(tableName);

    const localModifiedAt = new Date(localRecord[timestampField] || localRecord.created_at);
    const remoteModifiedAt = new Date(normalizedRemote[timestampField] || normalizedRemote.created_at);

    if (remoteModifiedAt >= localModifiedAt) {
      await getDB().addPendingSync(tableName, localRecord.id, 'update', localRecord);
      await (db as any)[tableName].put({
        ...normalizedRemote,
        _synced: true,
        _lastSyncedAt: new Date().toISOString()
      });
    } else {
      await (db as any)[tableName].update(localRecord.id, {
        _lastSyncedAt: new Date().toISOString()
      });
    }

    return true;
  }

  private async resolveCashDrawerAccountConflict(localRecord: any, remoteRecord: any): Promise<boolean> {
    // Balance is computed from journal entries - no conflict resolution needed for balance field
    // Compare other fields (name, currency, is_active, etc.) and use remote if different
    const fieldsToCompare = ['name', 'currency', 'is_active', 'account_code'];
    let hasConflict = false;

    for (const field of fieldsToCompare) {
      if (localRecord[field] !== remoteRecord[field]) {
        hasConflict = true;
        break;
      }
    }

    if (hasConflict) {
      console.warn(`💰 Cash drawer account conflict detected in non-balance fields`);
      // Use remote record for non-balance fields (balance is computed from journals, not synced)
      try {
        // Update non-balance fields only
        // Balance fields (current_balance, usd_balance, lbp_balance) are NEVER synced - computed from journal entries only
        const updateData: any = {
          name: remoteRecord.name,
          currency: remoteRecord.currency,
          is_active: remoteRecord.is_active,
          account_code: remoteRecord.account_code,
          updated_at: new Date().toISOString(),
          _synced: true,
          _lastSyncedAt: new Date().toISOString()
        };
        // Note: current_balance, usd_balance, lbp_balance are not updated - computed from journal entries only

        await getDB().cash_drawer_accounts.update(localRecord.id, updateData);

        return true;
      } catch (error) {
        console.error('Error resolving cash drawer account conflict:', error);

        // Fallback to timestamp-based resolution
        const localTimestamp = new Date(localRecord.updated_at || localRecord.created_at);
        const remoteTimestamp = new Date(remoteRecord.updated_at || remoteRecord.created_at);

        if (remoteTimestamp >= localTimestamp) {
          // Update non-balance fields only (balance is computed from journals)
          const updateData: any = {
            ...remoteRecord,
            _synced: true,
            _lastSyncedAt: new Date().toISOString()
          };
          // Remove all balance fields from update - they're computed from journal entries, not synced
          delete updateData.current_balance;
          delete updateData.usd_balance;
          delete updateData.lbp_balance;
          await getDB().cash_drawer_accounts.put(updateData);
        } else {
          await getDB().cash_drawer_accounts.update(localRecord.id, {
            _synced: true,
            _lastSyncedAt: new Date().toISOString()
          });
        }

        return true;
      }
    }

    const localTimestamp = new Date(localRecord.updated_at || localRecord.created_at);
    const remoteTimestamp = new Date(remoteRecord.updated_at || remoteRecord.created_at);

    if (remoteTimestamp >= localTimestamp) {
      // Exclude balance fields from sync - they're computed from journal entries, not synced
      const syncData: any = {
        ...remoteRecord,
        _synced: true,
        _lastSyncedAt: new Date().toISOString()
      };
      // Remove all balance fields - computed from journal entries only
      delete syncData.current_balance;
      delete syncData.usd_balance;
      delete syncData.lbp_balance;
      await getDB().cash_drawer_accounts.put(syncData);
    } else {
      await getDB().cash_drawer_accounts.update(localRecord.id, {
        _synced: true,
        _lastSyncedAt: new Date().toISOString()
      });
    }

    return false;
  }

  private async resolveBalanceConflict(tableName: string, localRecord: any, remoteRecord: any): Promise<boolean> {
    // Balances are now calculated from journal entries, not stored on entities
    // No need to resolve balance conflicts for entities - balances are derived, not stored
    if (tableName === 'entities') {
      return false; // Entities don't have balance fields anymore
    }
    
    // For other tables (if any), skip balance resolution
    return false;
  }

  private async resolveEmployeeBalanceConflict(localRecord: any, remoteRecord: any): Promise<boolean> {
    const localUsdBalance = Number(localRecord.usd_balance || 0);
    const remoteUsdBalance = Number(remoteRecord.usd_balance || 0);
    const localLbpBalance = Number(localRecord.lbp_balance || 0);
    const remoteLbpBalance = Number(remoteRecord.lbp_balance || 0);

    if (Math.abs(localUsdBalance - remoteUsdBalance) > 0.01 || Math.abs(localLbpBalance - remoteLbpBalance) > 0.01) {
      console.warn(`💰 Employee balance conflict: Local USD: $${localUsdBalance.toFixed(2)}, Remote USD: $${remoteUsdBalance.toFixed(2)}`);

      // For employees, use max balance (similar to entities)
      const finalUsdBalance = Math.max(localUsdBalance, remoteUsdBalance);
      const finalLbpBalance = Math.max(localLbpBalance, remoteLbpBalance);

      await getDB().users.put({
        ...remoteRecord,
        usd_balance: finalUsdBalance,
        lbp_balance: finalLbpBalance,
        _synced: true,
        _lastSyncedAt: new Date().toISOString()
      });

      return true;
    }

    // No conflict, use timestamp-based resolution
    const localTimestamp = new Date(localRecord.updated_at || localRecord.created_at);
    const remoteTimestamp = new Date(remoteRecord.updated_at || remoteRecord.created_at);

    if (remoteTimestamp >= localTimestamp) {
      await getDB().users.put({
        ...remoteRecord,
        _synced: true,
        _lastSyncedAt: new Date().toISOString()
      });
    } else {
      await getDB().users.update(localRecord.id, {
        _synced: true,
        _lastSyncedAt: new Date().toISOString()
      });
    }

    return false;
  }

  private async resolveTransactionConflict(localRecord: any, remoteRecord: any): Promise<boolean> {
    // Transactions are immutable - remote version is authoritative
    // If there's a conflict, it means the transaction was modified in Supabase (rare but possible)
    console.warn(`⚠️ Transaction conflict detected for ${localRecord.id} - remote version takes precedence`);
    
    await getDB().transactions.put({
      ...remoteRecord,
      _synced: true,
      _lastSyncedAt: new Date().toISOString()
    });

    return true;
  }

  private async resolveBillConflict(tableName: string, localRecord: any, remoteRecord: any): Promise<boolean> {
    // Bills and bill line items should prefer remote version if there's a conflict
    // This is because bill modifications are typically done through proper channels
    const localTimestamp = new Date(localRecord.updated_at || localRecord.created_at);
    const remoteTimestamp = new Date(remoteRecord.updated_at || remoteRecord.created_at);

    if (remoteTimestamp >= localTimestamp) {
      console.warn(`📄 Bill conflict: Remote version is newer, accepting remote changes for ${tableName}/${localRecord.id}`);
      
      await (db as any)[tableName].put({
        ...remoteRecord,
        _synced: true,
        _lastSyncedAt: new Date().toISOString()
      });

      // If local had changes, add to pending syncs for review
      if (!localRecord._synced) {
        await getDB().addPendingSync(tableName, localRecord.id, 'update', localRecord);
      }

      return true;
    } else {
      // Local is newer, keep local but mark as synced
      await (db as any)[tableName].update(localRecord.id, {
        _synced: true,
        _lastSyncedAt: new Date().toISOString()
      });
      return false;
    }
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
            await this.deleteProblematicRecord(
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
          case 'update':
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
              if (upsertError && this.isUnrecoverableError(upsertError, pendingSync.table_name, cleanedPayload)) {
                await this.deleteProblematicRecord(pendingSync.table_name, pendingSync.record_id, upsertError);
                await getDB().removePendingSync(pendingSync.id);
                continue;
              }
            }
            break;

          case 'delete':
            const { error: deleteError } = await supabase
              .from(pendingSync.table_name as any)
              .delete()
              .eq('id', pendingSync.record_id);
            error = deleteError;
            success = !deleteError;
            break;
        }

        if (success) {
          await getDB().removePendingSync(pendingSync.id);
        } else {
          // Check if error is unrecoverable
          if (error && this.isUnrecoverableError(error, pendingSync.table_name, pendingSync.payload)) {
            // Delete the record instead of retrying
            if (pendingSync.operation !== 'delete') {
              await this.deleteProblematicRecord(pendingSync.table_name, pendingSync.record_id, error);
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
        if (this.isUnrecoverableError(error, pendingSync.table_name, pendingSync.payload)) {
          if (pendingSync.operation !== 'delete') {
            await this.deleteProblematicRecord(pendingSync.table_name, pendingSync.record_id, error);
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

  private async validateDependencies(tableName: SyncTable, storeId: string): Promise<boolean> {
    const dependencies = SYNC_DEPENDENCIES[tableName];

    if (dependencies.length === 0) {
      return true;
    }

    try {
      const hasAnySyncMetadata = await getDB().sync_metadata.count() > 0;

      if (!hasAnySyncMetadata) {
        const tableIndex = SYNC_TABLES.indexOf(tableName);
        const dependencyIndices = dependencies.map(dep => SYNC_TABLES.indexOf(dep));
        return dependencyIndices.every(depIndex => depIndex < tableIndex);
      }

      const dependencyChecks = await Promise.all(
        dependencies.map(async (depTable) => {
          const lastSynced = await getDB().sync_metadata
            .where('table_name')
            .equals(depTable)
            .first();
          return !!lastSynced;
        })
      );

      return dependencyChecks.every(check => check);
    } catch (error) {
      console.error(`Error validating dependencies for ${tableName}:`, error);
      return false;
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
          ...remoteStore,
          _synced: true,
          _lastSyncedAt: new Date().toISOString()
        });
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

        await supabase.from('stores').insert(defaultStore);
        await getDB().stores.put({
          ...defaultStore,
          _synced: true,
          _lastSyncedAt: new Date().toISOString()
        });
      }
    } catch (error) {
      console.error(`Error ensuring store exists:`, error);
    }
  }

  private async initializeSyncMetadata(storeId: string) {
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
          ];

          // Remove duplicates by id
          const uniqueRecords = Array.from(
            new Map(allRecords.map(record => [record.id, record])).values()
          );

          if (uniqueRecords.length > 0) {
            // Normalize is_global field: convert boolean to 0/1 for Dexie compatibility
            const recordsWithSync = uniqueRecords.map(record => {
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
          query = this.applyStoreFilter(query, tableName, storeId);
          query = query.limit(SYNC_CONFIG.maxRecordsPerSync);

          const { data: remoteRecords, error } = await query;

          if (error) {
            result.errors.push(`Download failed for ${tableName}: ${error.message}`);
          } else if (remoteRecords && remoteRecords.length > 0) {
            const recordsWithSync = remoteRecords.map(record => {
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

        const { error } = await supabase
          .from(tableName as any)
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
      query = this.applyStoreFilter(query, tableName, storeId);

      const { data: remoteRecords, error } = await query;

      if (error) {
        result.errors.push(`Download failed: ${error.message}`);
      } else if (remoteRecords) {
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
            
            await (db as any)[tableName].put({
              ...normalizedRecord,
              _synced: true,
              _lastSyncedAt: new Date().toISOString()
            });
          }
        }
        result.synced.downloaded = remoteRecords.length;
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

