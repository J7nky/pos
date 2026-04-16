# Data Model: Incremental Sync Service Redesign

**Branch**: `010-incremental-sync-redesign` | **Date**: 2026-04-14

---

## Overview

This feature requires **no new Supabase tables**. All schema changes are confined to IndexedDB (Dexie). Two existing local tables (`sync_metadata`, `pending_syncs`) are extended with new fields. A Dexie version bump from **v54 → v55** is required.

---

## Extended: `SyncMetadata` (IndexedDB — `sync_metadata` table)

Stores per-table sync state for a given store. Survives logout/login within the same store.

### TypeScript Interface

```typescript
export interface SyncMetadata {
  id: string;            // Primary key = table_name (unchanged)
  table_name: string;    // Which Supabase table this checkpoint belongs to
  last_synced_at: string; // ISO timestamp — retained for display/fallback (unchanged)

  // NEW in v55
  last_synced_version: number;  // Last version/sequence number successfully synced (0 = never synced)
  store_id?: string;            // Store scope — allows multi-store checkpoint isolation
  hydration_complete: boolean;  // True once full initial download of this table is done
}
```

### Dexie Index String (v55)

```
'id, table_name, last_synced_at, last_synced_version, store_id'
```

### State Transitions

```
[not present] → last_synced_version: 0, hydration_complete: false   (first install)
             → last_synced_version: N, hydration_complete: false     (hydration in progress)
             → last_synced_version: N, hydration_complete: true      (fully hydrated)
             → last_synced_version: N+M, hydration_complete: true    (delta synced)
```

### Validation Rules

- `last_synced_version` must be ≥ 0; never decremented.
- `store_id` must match the currently logged-in store.
- `hydration_complete: false` triggers a resume-from-checkpoint download on next init.

---

## Extended: `PendingSync` (IndexedDB — `pending_syncs` table)

Outbox queue for local writes made while offline.

### TypeScript Interface

```typescript
export interface PendingSync {
  id: string;            // UUID — local queue entry ID (unchanged)
  table_name: string;    // Target Supabase table (unchanged)
  record_id: string;     // Local record ID (unchanged)
  operation: 'create' | 'update' | 'delete'; // (unchanged)
  created_at: string;    // ISO timestamp (unchanged)
  retry_count: number;   // Transient retry attempts for network errors (unchanged)
  payload?: unknown;     // Row data for create/update (unchanged)
  last_error?: string;   // Last error message on retry (unchanged)

  // NEW in v55
  idempotency_key: string;  // UUID v4 generated at write time; sent with every upload attempt
  status: 'pending' | 'permanently_failed';  // 'permanently_failed' set on non-retryable 4xx
}
```

### Dexie Index String (v55)

```
'id, table_name, record_id, operation, created_at, retry_count, status'
```
(`status` added to index for efficient `.where('status').equals('pending')` queries)

### State Transitions

```
write while offline → status: 'pending', retry_count: 0
                   → upload attempt, network error → retry_count++, status: 'pending'
                   → upload success → entry deleted from queue
                   → backend 4xx (non-retryable) → status: 'permanently_failed', operator alerted
```

### Validation Rules

- `idempotency_key` is set once at creation and never changed.
- `permanently_failed` entries are never retried automatically; require explicit operator action.
- Outbox processor only queries `status = 'pending'` entries.

---

## Logical Entities (Runtime — no new tables)

### `DataTier` Configuration

Defined in `syncConfig.ts` as a TypeScript constant (not stored in IndexedDB).

```typescript
export type DataTierName = 'tier1' | 'tier2' | 'tier3';

export const SYNC_TIERS: Record<DataTierName, readonly SyncTable[]> = {
  tier1: [
    'stores', 'branches', 'products', 'users',
    'cash_drawer_accounts', 'chart_of_accounts', 'entities',
    'cash_drawer_sessions', 'role_permissions', 'user_permissions'
  ],
  tier2: [
    'inventory_bills', 'inventory_items', 'transactions', 'bills',
    'journal_entries', 'balance_snapshots', 'bill_line_items', 'bill_audit_logs'
  ],
  tier3: [
    'missed_products', 'reminders'
  ]
} as const;
```

### `SyncSession` (Runtime State)

In-memory object maintained by `useOfflineInitialization` during app startup. Not persisted.

```typescript
interface SyncSession {
  storeId: string;
  isColdStart: boolean;           // True if no existing checkpoint for this store
  tier1Complete: boolean;         // UI may unlock once this is true
  tier2Complete: boolean;
  tier3Complete: boolean;
  connectivity: 'online' | 'offline';
  startedAt: number;              // Date.now() — for duration metrics
}
```

---

## Dexie Version Bump Summary (v54 → v55)

```typescript
// db.ts version 55
this.version(55).stores({
  // Extended indexes:
  sync_metadata: 'id, table_name, last_synced_at, last_synced_version, store_id',
  pending_syncs:  'id, table_name, record_id, operation, created_at, retry_count, status',
  // All other tables: unchanged
}).upgrade(async tx => {
  // Backfill: set defaults for all existing sync_metadata rows
  await tx.table('sync_metadata').toCollection().modify(row => {
    if (row.last_synced_version === undefined) row.last_synced_version = 0;
    if (row.store_id === undefined) row.store_id = null;
    if (row.hydration_complete === undefined) row.hydration_complete = false;
  });
  // Backfill: set defaults for all existing pending_syncs rows
  await tx.table('pending_syncs').toCollection().modify(row => {
    if (row.idempotency_key === undefined) row.idempotency_key = uuidv4();
    if (row.status === undefined) row.status = 'pending';
  });
});
```

---

## No New Supabase Tables

All Supabase tables are expected to already carry `version` (sequential integer), `updated_at`, `deleted_at`, and `store_id` per CG-09. No SQL migration file is required for this feature.

> **Note**: If any table is found to lack a `version` column during implementation, a `supabase/migrations/` file must be created to add it (per CG-09). This is treated as a prerequisite discovery task.
