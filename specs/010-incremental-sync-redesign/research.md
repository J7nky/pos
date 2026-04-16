# Research: Incremental Sync Service Redesign

**Branch**: `010-incremental-sync-redesign` | **Date**: 2026-04-14

---

## Decision 1: Delta Sync Cursor — Version/Sequence Number

**Decision**: Use the existing `version` field (sequential integer, already present on Supabase tables via `branch_event_log.version`) as the primary delta sync cursor. The current `sync_metadata.last_synced_at` (ISO timestamp) is used today but is vulnerable to clock skew and sub-second write races.

**Rationale**: The codebase already maintains `last_seen_event_version` per branch in `sync_state`. Supabase's `branch_event_log` uses sequential version numbers. Extending this pattern per-table is the lowest-risk path: no new backend infrastructure needed, just an additional `last_synced_version: number` field in `sync_metadata`.

**Implementation path**:
- Add `last_synced_version: number` to `SyncMetadata` interface and `sync_metadata` Dexie table index.
- Delta download query: `.gt('version', lastSyncedVersion).order('version', { ascending: true }).limit(PAGE_SIZE)`
- `last_synced_at` is retained for human-readable display and as fallback for tables that don't yet expose `version`.
- Dexie version bump: v54 → v55.

**Alternatives considered**:
- Timestamp-based (`updated_at`): Rejected — clock skew on multi-device offline POS is a real risk; sub-second writes can be missed.
- Dedicated `sync_cursors` table: Rejected — `sync_metadata` already exists and serves the same purpose; adding a second table duplicates data.

---

## Decision 2: Outbox Idempotency — Client-Generated UUID Key

**Decision**: Add `idempotency_key: string` (UUID v4) to `PendingSync`. The key is generated at write time (when the local record is created) and sent as a header or body field on every upload attempt. The backend deduplicates on this key.

**Rationale**: The existing `pending_syncs` table already carries `id`, `record_id`, and `payload`. Adding `idempotency_key` requires a single Dexie field addition (included in the v55 bump) and a backend convention. This is the industry-standard approach for at-least-once delivery with exactly-once semantics on the server.

**Implementation path**:
- `idempotency_key` = `uuid()` assigned when `addPendingSync()` is called.
- Sent as `Idempotency-Key` header (or as `_idempotency_key` in the upsert payload if using Supabase `.upsert()` with `onConflict`).
- Backend: `pending_syncs` records use `INSERT ... ON CONFLICT (idempotency_key) DO NOTHING` or Supabase `.upsert()`.

**Alternatives considered**:
- Pre-check existence query: Rejected — adds a round-trip per record; breaks batch uploads.
- Server-assigned IDs with upsert: Rejected — Supabase RLS makes it hard to query by server ID before the record exists; UUID approach is simpler and stateless.

---

## Decision 3: Outbox Permanent Failure Handling

**Decision**: Add `status: 'pending' | 'permanently_failed'` to `PendingSync`. On a non-retryable backend error (4xx), set `status = 'permanently_failed'`, surface a visible alert to the operator, and continue processing the next queue item.

**Rationale**: Blocking the entire outbox on one bad record would halt all offline writes — unacceptable for a POS. The existing `last_error` field already stores the error message; `status` makes the permanent failure queryable.

**Implementation path**:
- `processPendingSyncs()` checks HTTP status: if 4xx → update `status = 'permanently_failed'`, emit alert via `notificationService`, continue.
- `UnsyncedItems` page (`pages/UnsyncedItems.tsx`) should be extended to display permanently failed items with retry/discard actions.

---

## Decision 4: Data Tier Classification

**Decision**: Split `SYNC_TABLES` into three tiers in `syncConfig.ts`:

| Tier | Tables | Behavior |
|------|--------|----------|
| **Tier 1** (critical, blocks UI) | `stores`, `branches`, `products`, `users`, `cash_drawer_accounts`, `chart_of_accounts`, `entities`, `cash_drawer_sessions`, `role_permissions`, `user_permissions` | Synced sequentially before UI unlocks on cold start |
| **Tier 2** (background business data) | `inventory_bills`, `inventory_items`, `transactions`, `bills`, `journal_entries`, `balance_snapshots`, `bill_line_items`, `bill_audit_logs` | Synced in background after UI is interactive |
| **Tier 3** (low-priority / on-demand) | `missed_products`, `reminders` | Synced lazily; absence doesn't block any primary workflow |

**Rationale**: Aligned with the tiered sync design already described in CLAUDE.md and the project constitution. Tier 1 matches the list in the constitution §2.4 (hydrate first — UI critical).

**Implementation path**:
- `SYNC_TIERS: Record<'tier1' | 'tier2' | 'tier3', SyncTable[]>` exported from `syncConfig.ts`.
- `useOfflineInitialization` loads Tier 1 synchronously (blocking), then dispatches Tier 2 and 3 as background tasks.
- `syncService.downloadTier(tier, storeId, branchId)` iterates over tier's table list.

---

## Decision 5: Cursor-Based Download Pagination

**Decision**: Replace the current single `.limit(maxRecordsPerSync)` query with cursor-based pagination: `.gt('version', lastVersion).order('version', { ascending: true }).limit(PAGE_SIZE)`. Continue fetching pages until the result count < PAGE_SIZE (end of data).

**Rationale**: The current `maxRecordsPerSync = 1000` hard limit silently truncates large tables — any table with >1000 records after a long offline period will have missed records. Cursor pagination is the only correct approach at scale (100k+ records per the spec).

**Implementation path**:
- Add `cursorPageSize: 500` to `SYNC_CONFIG` (safe batch size; configurable).
- `downloadTablePaged(tableName, storeId, fromVersion, cursor?)` function loops until `data.length < PAGE_SIZE`.
- Each page: upsert into IndexedDB; update checkpoint to `max(version)` of received page.
- On partial completion (network drop mid-page), the checkpoint reflects the last fully-processed version — next sync resumes from there.

**Alternatives considered**:
- Offset pagination: **Explicitly forbidden** by spec FR-003 and project plan.md (ANTI-PATTERNS).
- Single large fetch: Rejected — doesn't scale to 100k+ records; blocks UI.

---

## Decision 6: Store-Scoped DB Persistence (No Full Wipe on Logout)

**Decision**: The existing `useStoreSwitchLifecycle` hook already clears IndexedDB on **store switch**. On **logout within the same store**, only the Supabase auth session is cleared — IndexedDB is preserved. This requires verifying that `useOfflineInitialization` does not call `fullResync()` on every login, only on cold start (no local data for this store).

**Rationale**: The current `fullResync()` is called from `useOfflineInitialization` when `lastSyncAt` is null or `forceResync` is true. By checking for an existing `sync_metadata` checkpoint for the current store, the system can detect returning sessions and switch to delta-only mode.

**Implementation path**:
- Add store-scoped check in `useOfflineInitialization`: `hasExistingData(storeId)` → if true, skip full resync, run delta sync only.
- `hasExistingData(storeId)` queries `sync_metadata` for at least one record with the current `store_id` having `last_synced_version > 0`.
- `fullResync()` is only triggered when: (a) no checkpoint exists for this store, or (b) user explicitly triggers it via Settings.

---

## Decision 7: RBAC Permission Revocation on Sync

**Decision**: When `syncService.uploadOnly()` or any delta download call returns a 403 (permission denied) for the current store/branch, trigger a forced re-authentication: clear local store data via `useStoreSwitchLifecycle.clearStoreData()` and redirect to login.

**Rationale**: Specified in FR-013. The existing `useStoreSwitchLifecycle` already has store-clearing logic; the sync layer simply needs to emit an `AUTH_REVOKED` event that the auth context handles.

**Implementation path**:
- `syncService` emits a custom event or calls a provided `onPermissionRevoked` callback on 403.
- `SupabaseAuthContext` subscribes and calls `signOut()` + `clearLocalStoreData()`.

---

## Decision 8: No New Supabase Tables Required

**Decision**: The incremental sync redesign requires **only IndexedDB schema changes** (Dexie v55 bump). No new Supabase tables are needed.

**Rationale**: All required fields (`version`, `updated_at`, `deleted_at`, `store_id`) are expected to already exist on Supabase tables (confirmed by constitution §3 CG-09 — all sync tables must have these fields). The `branch_event_log` sequential version is the source of truth for event ordering. No new RPCs needed.

**Schema changes required (Dexie v55)**:
- `sync_metadata`: add `last_synced_version` field.
- `pending_syncs`: add `idempotency_key` and `status` fields.
- Index addition for `pending_syncs`: add `status` to the index string for efficient querying of pending-only items.
