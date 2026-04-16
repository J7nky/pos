/**
 * Sync Service Contract — Incremental Sync Redesign
 * Branch: 010-incremental-sync-redesign
 *
 * This file defines the TypeScript interface contract for the redesigned sync
 * service layer. It is a design artifact, not an executable module.
 *
 * Key principles:
 * - uploadOnly() signature is UNCHANGED (performSync / auto-sync must not be modified)
 * - New download methods are additive — they do not replace existing signatures
 * - The upload-then-emit contract (CG-03) is preserved in all paths
 */

import type { SyncTable, DataTierName } from '../services/syncConfig';

// ---------------------------------------------------------------------------
// Result types
// ---------------------------------------------------------------------------

export interface SyncResult {
  success: boolean;
  errors: string[];
  synced: { uploaded: number; downloaded: number };
  conflicts: number;
}

export interface OutboxResult {
  processed: number;
  succeeded: number;
  permanentlyFailed: number;         // Count of items marked permanently_failed this run
  errors: string[];
}

export interface DownloadPageResult {
  tableName: SyncTable;
  recordsReceived: number;
  lastVersion: number;               // Max version number in the received page
  isComplete: boolean;               // True if result count < PAGE_SIZE (end of data)
}

// ---------------------------------------------------------------------------
// Checkpoint types
// ---------------------------------------------------------------------------

export interface SyncCheckpoint {
  tableName: SyncTable;
  storeId: string;
  lastSyncedVersion: number;         // 0 = never synced
  hydrationComplete: boolean;
  lastSyncedAt: string;              // ISO timestamp (display/fallback)
}

// ---------------------------------------------------------------------------
// SyncService interface (incremental additions only)
// ---------------------------------------------------------------------------

export interface ISyncService {

  // UNCHANGED — used by performSync / auto-sync (CG-03)
  uploadOnly(storeId: string, branchId?: string): Promise<SyncResult>;

  // UNCHANGED — used only for explicit full resync (Settings page)
  fullResync(storeId: string): Promise<SyncResult>;

  // NEW: Download all tables in a specific tier using version-based cursor pagination.
  // Returns when all pages for all tier tables are exhausted or an error occurs.
  // Updates SyncCheckpoint after each page.
  downloadTier(
    tier: DataTierName,
    storeId: string,
    branchId: string,
    options?: { signal?: AbortSignal }
  ): Promise<SyncResult>;

  // NEW: Download a single table from a given version using cursor pagination.
  // Resumes from the stored checkpoint if fromVersion is omitted.
  downloadTablePaged(
    tableName: SyncTable,
    storeId: string,
    options?: {
      fromVersion?: number;           // Override checkpoint version
      signal?: AbortSignal;           // Abort on connectivity loss
    }
  ): Promise<DownloadPageResult>;

  // NEW: Retrieve the current sync checkpoint for a table in a store.
  getCheckpoint(tableName: SyncTable, storeId: string): Promise<SyncCheckpoint>;

  // NEW: Persist a sync checkpoint (called after each page is fully upserted to IndexedDB).
  saveCheckpoint(
    tableName: SyncTable,
    storeId: string,
    version: number,
    hydrationComplete: boolean
  ): Promise<void>;

  // NEW: Check if this store has been synced before (used to determine cold vs. warm start).
  hasExistingData(storeId: string): Promise<boolean>;

  // NEW: Process permanently-failed outbox items (surface to operator, skip in normal flow).
  getPermanentlyFailedItems(): Promise<import('../types').PendingSync[]>;
}

// ---------------------------------------------------------------------------
// Outbox idempotency convention
// ---------------------------------------------------------------------------

/**
 * Every call to db.addPendingSync() MUST generate and store an idempotency_key.
 * The key is sent as a header on every upload attempt:
 *
 *   headers: { 'Idempotency-Key': pendingSync.idempotency_key }
 *
 * Or as a conflict-resolution key in Supabase upsert:
 *
 *   supabase.from(tableName).upsert(payload, { onConflict: 'id' })
 *
 * The `idempotency_key` ensures the backend can deduplicate retried uploads
 * when the network drops after a successful write but before the client receives
 * the response.
 */

// ---------------------------------------------------------------------------
// Callback contract for permission revocation (CG-07 + FR-013)
// ---------------------------------------------------------------------------

/**
 * When syncService receives a 403 on any sync request:
 * 1. Call onPermissionRevoked() (injected by SupabaseAuthContext on mount).
 * 2. onPermissionRevoked clears local store data and triggers sign-out.
 *
 * This keeps syncService free of direct auth context imports (CG-02).
 */
export type OnPermissionRevokedCallback = (storeId: string) => Promise<void>;

// ---------------------------------------------------------------------------
// Observability events (SC-009)
// ---------------------------------------------------------------------------

/**
 * The sync service emits structured log entries for every lifecycle event.
 * These are consumed by comprehensiveLoggingService or a dedicated syncMetricsService.
 */
export type SyncEventType =
  | 'sync_started'
  | 'sync_completed'
  | 'sync_failed'
  | 'tier_started'
  | 'tier_completed'
  | 'page_downloaded'
  | 'outbox_processed'
  | 'outbox_item_permanently_failed'
  | 'checkpoint_saved'
  | 'permission_revoked';

export interface SyncLogEntry {
  event: SyncEventType;
  storeId: string;
  branchId?: string;
  tableName?: SyncTable;
  tier?: DataTierName;
  itemCount?: number;
  version?: number;
  durationMs?: number;
  error?: string;
  timestamp: string;                 // getTodayLocalDate() or ISO — never toISOString().split('T')[0]
}
