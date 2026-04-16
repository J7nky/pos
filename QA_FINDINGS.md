# QA Findings — Branch `010-incremental-sync-redesign`

**Date**: 2026-04-15  
**Reviewer**: Claude (professional QA pass)  
**Scope**: All modified/new files on the branch

---

## Severity Legend

- 🔴 **CRITICAL** — Data loss, permanent broken state, or feature non-functional
- 🟠 **HIGH** — Significant behavioral bug or missing core feature
- 🟡 **MEDIUM** — Degraded UX, silent failure, type safety bypass
- 🔵 **LOW** — Code quality, minor edge case, missing test coverage

---

## Priority Fix Order

| # | Issue | Severity | File |
|---|---|---|---|
| 1 | `setIsDataReady` fires before `initializeSyncState` | 🔴 C1 | useOfflineInitialization.ts |
| 2 | `setIsDataReady` double-call masks tier 1 failures | 🔴 C2 | useOfflineInitialization.ts |
| 3 | Event stream silent fallback to version 0 | 🔴 C3 | eventStreamService.ts |
| 4 | Cash drawer session permanent retry loop | 🔴 C4 | syncUpload.ts |
| 5 | Fire-and-forget tier 2/3 — no abort or cancellation | 🟠 H1 | useOfflineInitialization.ts |
| 6 | Store change can leak data mid-tier-1 sync | 🟠 H2 | useOfflineInitialization.ts |
| 7 | `expenseCategories` declared but never hydrated | 🟠 H3 | OfflineDataContext.tsx |
| 8 | Batch prefetch failure cascades to N+1 individual fetches | 🟠 H4 | eventStreamService.ts |
| 9 | Three missing test files (T016, T028, T032) | 🟠 H5 | tests/services/ |
| 10 | `getUnsyncedRecords` context export unverified | 🟠 H6 | UnsyncedItems.tsx |

---

## 🔴 CRITICAL Issues

### C1. `setIsDataReady(true)` fires before `initializeSyncState` completes

**File**: `apps/store-app/src/contexts/offlineData/useOfflineInitialization.ts` (~lines 247–258)

**Issue**: After tier 1 hydration completes, `setIsDataReady(true)` is called immediately, and then `eventStreamService.initializeSyncState(currentBranchId)` is awaited afterward. UI components that respond to `isDataReady=true` can start consuming events before the sync state version is stamped. This means `catchUp()` may find no sync state, fall back to version 0, and replay all historical events.

**Impact**: Data duplication or N+1 Supabase request cascade on cold start.

**Fix**: Move `initializeSyncState()` to BEFORE `setIsDataReady(true)`.

---

### C2. `setIsDataReady(true)` double-call masks tier 1 failures

**File**: `apps/store-app/src/contexts/offlineData/useOfflineInitialization.ts` (~lines 247 and 341)

**Issue**: `setIsDataReady(true)` is called in the tier 1 success path AND again in the `finally` block. If tier 1 throws and the success handler is never reached, the `finally` block still sets `isDataReady=true`. The UI renders as if data is ready when it is not.

**Impact**: UI renders with incomplete (or zero) data after a tier 1 sync failure, with no visible error.

**Fix**: Remove `setIsDataReady(true)` from the `finally` block. Only set it after confirmed tier 1 success.

---

### C3. Event stream silently falls back to version 0 on `initializeSyncState` failure

**File**: `apps/store-app/src/services/eventStreamService.ts` (~lines 381–393)

**Issue**: When no sync state exists, `catchUp()` calls `initializeSyncState()`. If that call throws, the catch block logs a warning and continues with `lastVersion = 0`. This causes `pullEvents()` to fetch all events from the beginning of time, and since `batchPrefetchChildren` may also fail, each event then falls back to an individual `fetchAffectedRecord()` Supabase call — the N+1 cascade.

**Impact**: Hundreds of individual Supabase REST calls (`id=eq.<uuid>`) on any transient failure during initialization.

**Fix**: On `initializeSyncState` failure, retry with backoff or propagate the error. Never silently degrade to version 0.

---

### C4. Cash drawer session permanently stuck in unsynced retry loop

**File**: `apps/store-app/src/services/syncUpload.ts` (~lines 319–332)

**Issue**: When a local cash drawer session conflicts with a remote record, the conflict resolution updates the local record with `_synced: false`. This flags it for re-upload, which will hit the same remote conflict on the next sync cycle, creating an infinite retry loop that never resolves.

**Impact**: Cash drawer sessions with conflicts can never finalize. Every subsequent sync attempts and fails on the same records.

**Fix**: Mark conflicted sessions as `_synced: true` (remote wins) or route them to a dedicated conflict resolution queue.

---

## 🟠 HIGH Issues

### H1. Fire-and-forget tier 2/3 syncs — no abort, no cancellation

**File**: `apps/store-app/src/contexts/offlineData/useOfflineInitialization.ts` (~lines 260–277)

**Issue**: Tier 2 and tier 3 background syncs are launched with `void (async () => { ... })()`. There is no AbortController, no cleanup if the component unmounts, no cancellation if the user logs out or switches stores mid-sync, and errors are silently caught with only a `console.warn`.

**Impact**: If tier 2/3 fail, the user loads the app with incomplete business data (bills, transactions, inventory) and has no indication anything went wrong. If the user switches stores, the in-progress sync continues writing to IndexedDB for the old store.

**Fix**: Create an AbortController per init. Pass its signal into sync functions. Register `abort()` in the effect cleanup function (`return () => controller.abort()`).

---

### H2. No storeId guard mid-tier-1 sync

**File**: `apps/store-app/src/contexts/offlineData/useOfflineInitialization.ts` (~lines 161–323)

**Issue**: `initializeData` runs a long async tier 1 sync. After it completes, the success handler calls `refreshData()` and sets state — but never checks whether `storeId` changed since initialization started. If the user switches stores while tier 1 is running, data from the old store flows into the new store's initialized context.

**Impact**: Data cross-contamination between stores.

**Fix**: Capture `const capturedStoreId = storeId` at the start of `initializeData`. Before any post-sync state updates, check `if (capturedStoreId !== storeId) return`.

---

### H3. `expenseCategories` declared but never hydrated

**File**: `apps/store-app/src/contexts/OfflineDataContext.tsx` (~line 115)

**Issue**: `const [expenseCategories] = useState<any[]>([])` — the array is initialized as empty and is never populated in `refreshData()`, never added to the tier sync flow, and never fetched from the DB. The setter isn't even destructured.

**Impact**: Expense categories is entirely non-functional. Any UI that renders from this list will always show empty.

**Fix**: Add `expense_categories` to the appropriate sync tier in `syncConfig.ts`, hydrate the state in `refreshData()`, and type the array correctly.

---

### H4. Batch prefetch failure cascades to N individual Supabase requests

**File**: `apps/store-app/src/services/eventStreamService.ts` (~lines 1004–1040)

**Issue**: `batchPrefetchChildren()` returns an empty array on any network error (silently caught). Each event in the batch then falls back to an individual `fetchAffectedRecord()` call — one round-trip per event ID. During reconnect catch-up with many events this is the N+1 pattern.

**Impact**: Reconnect catch-up degrades from O(1) bulk queries to O(n) individual REST calls when batching fails.

**Fix**: On batch prefetch failure, do not silently return `[]`. Log an error, retry once, or surface the failure to the caller's error list. Do not make individual fetches the implicit fallback path for batch errors.

---

### H5. Three test files missing (T016, T028, T032)

**Files to create**:
- `apps/store-app/tests/services/syncService.downloadTablePaged.test.ts` (T016)
- `apps/store-app/tests/services/syncService.outbox.test.ts` (T028)
- `apps/store-app/tests/services/db.migration.v55.test.ts` (T032)

**Issue**: These were planned tasks in `specs/010-incremental-sync-redesign/tasks.md` but the test files were never written.

**Impact**: The core features of this branch — cursor pagination, outbox idempotency, permanent failure handling, and the Dexie v55 migration — have zero unit test coverage.

**Required test cases**:

*T016 — `downloadTablePaged`*:
- Version filter uses `.gt('version', lastVersion)`
- Checkpoint saved after each page
- Loop exits when returned page size < `cursorPageSize`
- Abort signal cancels the loop cleanly

*T028 — Outbox*:
- `idempotency_key` is included in every upload payload
- 4xx response transitions record to `status = 'permanently_failed'`
- Queue continues processing subsequent records after a permanent failure
- 5xx response leaves record in `pending` state (retried next cycle)

*T032 — Dexie v55 migration*:
- Pre-existing `sync_metadata` rows are backfilled with `last_synced_version = 0`, `hydration_complete = false`, `store_id = null`
- Pre-existing `pending_syncs` rows are backfilled with `idempotency_key = uuidv4()`, `status = 'pending'`
- New rows created post-migration carry all required fields

---

### H6. `getUnsyncedRecords` context export unverified

**File**: `apps/store-app/src/pages/UnsyncedItems.tsx` (~line 93)

**Issue**: The page destructures `getUnsyncedRecords` from `useOfflineData()`. It's not confirmed that `OfflineDataContext.tsx` includes this function in its value object. If it's missing, the page crashes at runtime with a "not a function" error.

**Impact**: UnsyncedItems page is broken in production if the export is missing.

**Fix**: Verify `OfflineDataContext` provides `getUnsyncedRecords` (should delegate to `syncService.getUnsyncedRecords()` or equivalent). Add it if absent, and add it to `offlineDataContextContract.ts`.

---

## 🟡 MEDIUM Issues

### M1. `isProcessing` guard return value is ambiguous

**File**: `apps/store-app/src/services/eventStreamService.ts` (~lines 368–371)

**Issue**: When a second `catchUp()` fires while one is already running, the guard returns `{ processed: 0, errors: [], last_version: 0 }`. This is identical to the return value for "no events to process," so callers cannot distinguish between "sync was deferred" and "sync ran and found nothing."

**Fix**: Return a distinct value such as `{ skipped: true, processed: 0, errors: [], last_version: 0 }` or throw a typed error.

---

### M2. `onEventsProcessedCallback` errors swallowed — caller gets false success

**File**: `apps/store-app/src/services/eventStreamService.ts` (~lines 506–518)

**Issue**: If `onEventsProcessedCallback` throws, the error is caught and logged but `catchUp()` returns the normal success result. If this callback drives UI state updates or follow-up sync triggers, the caller has no way to know it failed.

**Fix**: Either propagate the error or add a `callbackError?: Error` field to the return type.

---

### M3. Bulk event validation silently skips on malformed metadata

**File**: `apps/store-app/src/services/eventStreamService.ts` (~lines 920–950)

**Issue**: If a bulk event has no `affected_*_ids` field in its metadata (or the array is not actually an array), the handler logs and returns without processing. The event version advances, so the event is considered "seen," but no local records are updated.

**Impact**: Silent data inconsistency — a bulk update is acknowledged but never applied locally.

**Fix**: Distinguish "legitimately empty bulk" from "malformed metadata." Log at `console.error` for the malformed case and consider flagging the sync state for re-hydration.

---

### M4. Child record fetch failures silently orphan parent records

**File**: `apps/store-app/src/services/eventStreamService.ts` (~lines 754–836)

**Issue**: In `sale_posted`, `inventory_received`, and `journal_entry_created` handlers, errors fetching child records (bill_line_items, journal entries) are caught, logged, and the function returns. The parent record gets written to IndexedDB but its children are missing.

**Impact**: Parent-child data inconsistency — bills with no line items, journal entries with missing legs.

**Fix**: At minimum, mark the parent record with a `_needsRefetch: true` flag. Ideally, add the failed record to the catch-up error list to trigger a re-fetch on the next sync cycle.

---

### M5. `profileLoadPromises` not cleared after a failed `forceRefresh`

**File**: `apps/store-app/src/contexts/SupabaseAuthContext.tsx` (~lines 195–206)

**Issue**: The Map that deduplicates concurrent profile loads caches the in-flight promise. When `forceRefresh=true` and the request fails, the failed/rejected promise remains in the Map. All subsequent `loadUserProfile` calls for that user reuse the rejected promise.

**Impact**: After one failed background profile refresh, subsequent profile loads silently hang or reject without ever retrying.

**Fix**: In the catch block for `forceRefresh=true`, delete the entry from `profileLoadPromises` before rethrowing.

---

### M6. Debug utility dynamic imports not wrapped in try-catch

**File**: `apps/store-app/src/services/syncUpload.ts` (~lines 358–366)

**Issue**: Dynamic `import('./crudHelperService')` and `import('../utils/syncDebugger')` are called inside the upload hot path without a try-catch. If either module fails to load (missing file, bundler issue), the exception propagates and aborts the entire sync.

**Impact**: Sync failure caused by an unrelated debug utility, not by data or network issues.

**Fix**: Wrap both dynamic imports in try-catch. Treat all debug logging in this block as non-fatal (`catch (e) { /* best-effort */ }`).

---

### M7. `(db as any)[tableName]` has no existence check

**File**: `apps/store-app/src/services/syncUpload.ts` (~line 149)

**Issue**: Table access via `(db as any)[tableName]` will produce `undefined` if `tableName` is not a valid Dexie table key. There is no guard before using the result, so the error surfaces far from its cause.

**Fix**: Add `if (!(tableName in db)) throw new Error(\`Unknown table: \${tableName}\`)` before the cast.

---

### M8. Deduplication does not re-sort by version after grouping

**File**: `apps/store-app/src/services/eventStreamService.ts` (~lines 474–509)

**Issue**: Events are sorted into bulk, reverse, and regular buckets, then concatenated. The final array is not re-sorted by version. If mixed-version events land across groups, they may execute out of order relative to the server's event log.

**Example**: A bulk_updated(v5) following a reverse(v3) for the same entity would process the bulk first, then undo it — the opposite of the intended order if v3 < v5.

**Fix**: Sort the final `deduplicatedEvents` array by `version` (ascending) before the processing loop.

---

### M9. Store switch triggers reload without aborting active operations

**File**: `apps/store-app/src/contexts/offlineData/useStoreSwitchLifecycle.ts` (~lines 24–41)

**Issue**: On store ID change, `getDB().delete()` is called and then `window.location.reload()` fires immediately. Any in-flight Supabase fetches or pending IndexedDB write transactions are abruptly interrupted.

**Impact**: Potential for partial writes or corrupted IndexedDB state if a sync was mid-flight during store switch.

**Fix**: Before clearing the DB, broadcast an abort signal (or set a global `isSwitchingStore` flag) that all sync and fetch operations check, then wait for them to drain before proceeding.

---

## 🔵 LOW Issues

### L1. T039 manual test scenarios not executed or documented

**Spec**: `specs/010-incremental-sync-redesign/quickstart.md`

The five end-to-end manual test scenarios (cold start, returning login, offline write, permanent failure, store switch) were planned but there is no record of them being run. Should be executed and results noted before merging.

---

### L2. Undo validity check uses an arbitrary 1000ms timeout

**File**: `apps/store-app/src/contexts/offlineData/useOfflineInitialization.ts` (~line 357)

`setTimeout(..., 1000)` has no documented justification. If initialization takes longer than 1 second, the undo check runs against a partially-initialized state. Should be tied to an initialization-complete event instead.

---

### L3. `Promise.all` in cleanup has no partial failure handling

**File**: `apps/store-app/src/contexts/offlineData/useOfflineInitialization.ts` (~lines 207–213)

`Promise.all([cleanupInvalidInventoryItems(), cleanupOrphanedRecords()])` — if one cleanup fails, both results are discarded. Use `Promise.allSettled` and process each result independently.

---

### L4. `expenseCategories`, `billAuditLogs`, `missedProducts` typed as `any[]`

**File**: `apps/store-app/src/contexts/OfflineDataContext.tsx` (~lines 115–117)

These state arrays bypass TypeScript type checking. Should be typed to the corresponding Dexie table types.

---

### L5. Persistent reconnect failures invisible when verbose mode is off

**File**: `apps/store-app/src/services/eventStreamService.ts` (~lines 319–342)

Repeated reconnect failures are throttled to one `console.warn` per 60 seconds. Between windows, failures are routed through `evLog` (which is a no-op when `VITE_EVENT_STREAM_VERBOSE` is not set). In production, a realtime subscription that is continuously failing produces no observable signal.

**Fix**: Always emit `console.warn` for reconnect failures regardless of verbose mode; reserve throttling for noisy informational logs only.

---

## Translation Coverage

**Status**: ✅ 100% complete — all new keys verified present across EN, AR, and FR.

---

## Test Coverage Summary

| Test File | Status |
|---|---|
| `syncConfig.tiers.test.ts` | ✅ Present |
| `syncService.hasExistingData.test.ts` | ✅ Present |
| `syncService.downloadTablePaged.test.ts` | ❌ Missing (T016) |
| `syncService.outbox.test.ts` | ❌ Missing (T028) |
| `db.migration.v55.test.ts` | ❌ Missing (T032) |
| 13 golden snapshot parity files | ✅ All present |

---

## Verification Checklist (after fixes)

```bash
# Automated
pnpm test:run        # All Vitest unit tests must pass, including new T016/T028/T032
pnpm parity:gate     # Golden snapshot regression — must report 0 regressions
pnpm lint            # Zero ESLint errors

# Manual (T039) — execute each scenario and record pass/fail
# 1. Cold start:        Clear app storage → login → tier 1 blocks UI → tier 2/3 progress bar shows non-blocking
# 2. Returning login:   Log out → log back in to same store → UI ready in <2s → delta sync only (no full re-fetch)
# 3. Offline writes:    Go offline → create a record → reconnect → verify no duplicates after sync
# 4. Permanent failure: Inject a malformed payload → confirm record shows as permanently_failed in UnsyncedItems
# 5. Store switch:      Log out → log in to a different store → confirm IndexedDB cleared and fresh cold-start runs
```
