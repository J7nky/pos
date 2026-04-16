# Developer Quickstart: Incremental Sync Redesign

**Branch**: `010-incremental-sync-redesign`

This guide explains what changed, what to keep in mind while implementing, and how to verify the new sync behavior locally.

---

## What's Changing (Summary)

| Area | Before | After |
|------|--------|-------|
| Delta cursor | `last_synced_at` (timestamp) | `last_synced_version` (integer) |
| Download pagination | Single `.limit(1000)` | Cursor-based pages of 500 |
| Table loading order | Flat sequential | Tier 1 (blocking) → Tier 2/3 (background) |
| Returning login | Full resync every time | Delta sync from checkpoint |
| Outbox failure | Retry indefinitely | Permanent failure with operator alert |
| Idempotency | None | UUID `idempotency_key` per outbox entry |
| Permission revocation | Not handled | 403 → clear + re-auth |

---

## Files to Touch

| File | Change |
|------|--------|
| `apps/store-app/src/lib/db.ts` | Version bump v54 → v55; extend `SyncMetadata` and `PendingSync` interfaces; add migration upgrade block |
| `apps/store-app/src/types/index.ts` | Add `last_synced_version`, `store_id`, `hydration_complete` to `SyncMetadata`; add `idempotency_key`, `status` to `PendingSync` |
| `apps/store-app/src/services/syncConfig.ts` | Add `SYNC_TIERS`, `cursorPageSize: 500`; keep `SYNC_TABLES` for upload dependency ordering |
| `apps/store-app/src/services/syncService.ts` | Add `downloadTier()`, `downloadTablePaged()`, `getCheckpoint()`, `saveCheckpoint()`, `hasExistingData()`; update `processPendingSyncs()` for idempotency + permanent failure |
| `apps/store-app/src/contexts/offlineData/useOfflineInitialization.ts` | Switch from unconditional `fullResync()` to `hasExistingData()` check → tier-based init |

---

## Critical Rules to Follow

### 1. Never break uploadOnly()
`performSync` and auto-sync call `syncService.uploadOnly()`. Its signature must not change. Do not add download logic inside `uploadOnly()`.

### 2. Upload-then-emit is sacred (CG-03)
Events are emitted from `syncService.uploadLocalChanges()` **after** each batch is confirmed uploaded. Never emit before upload. Never emit from local write operations.

### 3. Dexie version bumps require upgrade logic
When bumping v54 → v55, include the `upgrade()` block that backfills `last_synced_version = 0`, `status = 'pending'`, and `idempotency_key = uuid()` for existing rows. Missing this will break existing installations.

### 4. Tier 1 must complete before UI unlocks
`useOfflineInitialization` must not set `isDataReady = true` until `tier1Complete === true`. Tier 2 and 3 downloads run concurrently after that.

### 5. Checkpoint saves are atomic with the page upsert
Save the checkpoint **only after** the full page is upserted into IndexedDB. If the upsert fails, the checkpoint must not be advanced (so the page is re-fetched on next sync).

### 6. No setInterval (CG-03)
Background Tier 2/3 sync must be triggered by `useOfflineInitialization` after Tier 1 completes — not by a timer. The only allowed interval remains in `eventStreamService`.

---

## Testing the New Behavior

### Cold Start Test
1. Open the app in a fresh browser profile (or clear IndexedDB via DevTools).
2. Log in → observe that products, entities, and accounts load first, then background tables appear.
3. Verify you can create a bill before the background sync finishes.

### Returning Login Test
1. Log in and let full sync complete.
2. Log out and log back in to the **same store**.
3. Open Network tab → confirm no full-table downloads occur on second login (only delta queries with `version > N`).

### Outbox Idempotency Test
1. Go offline (DevTools → Network → Offline).
2. Create a bill.
3. Come back online.
4. Check Supabase dashboard — bill should appear exactly once.
5. Kill the app mid-upload → reconnect → verify no duplicate.

### Permanent Failure Test
1. Manually corrupt a `pending_syncs` payload in IndexedDB.
2. Come online → the corrupted item should be marked `permanently_failed`.
3. An in-app alert should appear.
4. The next pending item should still upload successfully (queue is not blocked).

### Store Switch Test
1. Log in to Store A, let sync complete.
2. Log out, log in to Store B.
3. Verify Store A data is not visible in Store B.
4. Log out, log back in to Store A → data should still be there, no full re-sync.

---

## Running Tests

```bash
# From apps/store-app/
pnpm test:run           # Vitest single run
pnpm parity:gate        # Sync parity snapshot check
```

New Vitest tests should be added for:
- `syncService.downloadTablePaged()` — verify cursor advances correctly
- `syncService.hasExistingData()` — verify cold vs. warm detection
- `processPendingSyncs()` — verify permanent failure path and idempotency key usage
- `SyncMetadata` upgrade migration — verify backfill logic
