# Contract: Sync public API (store-app)

**Consumers**: `OfflineDataContext`, `useSyncStateLayer`, `useOfflineInitialization`, `useOfflineSyncLifecycle`, `useBranchBootstrapEffects`, parity tests (`paritySync.*.test.ts`), `snapshotHelpers.ts`, `offlineDataContextContract.ts` (type-only).

## Stable entry points

These MUST remain importable from `../../services/syncService` (or equivalent path) with the same semantics:

| Export | Kind | Notes |
|--------|------|--------|
| `syncService` | Singleton instance | `sync()`, `fullResync()`, `syncTable()`, `syncStoresAndBranches()`, `isCurrentlyRunning()`, `getLastSyncAttempt()` |
| `syncWithSupabase(storeId)` | Function | Delegates to singleton; same `SyncResult` |
| `getLastSyncedAt()` / `setLastSyncedAt(ts)` | Functions | Global last-sync display |
| `SYNC_TABLES` | Readonly array constant | Must match `tests/sync-parity/sync-tables.json` and parity registry checks |
| `SyncResult` | Type `{ success, errors, synced: { uploaded, downloaded }, conflicts }` | Used by context and tests |

## Internal modules (non-contract)

Callers MUST NOT import `syncUpload`, `syncDownload`, or `syncDeletionDetection` from outside `services/` unless a future ADR promotes them. Prefer **only** `syncService` + types/constants above for app code.

## Upload-then-emit invariant

Any batch that emits `branch_event_log` events MUST have been **confirmed written** to Supabase in that upload batch first. This is unchanged from constitution CG-03.

## Versioning

Breaking changes to this contract require a spec update, parity fixture updates, and a migration plan for any renamed exports.
