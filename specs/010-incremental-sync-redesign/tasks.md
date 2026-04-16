# Tasks: Incremental Sync Service Redesign

**Input**: Design documents from `/specs/010-incremental-sync-redesign/`
**Prerequisites**: plan.md ✓ spec.md ✓ research.md ✓ data-model.md ✓ contracts/ ✓ quickstart.md ✓

**Organization**: Tasks are grouped by user story to enable independent implementation and testing.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies on incomplete tasks)
- **[Story]**: Which user story this task belongs to (US1–US4)
- Exact file paths are specified for every task

---

## Phase 1: Setup

**Purpose**: Confirm the existing codebase baseline before modifying anything

- [x] T001 Read and confirm current Dexie schema version (must be 54) in `apps/store-app/src/lib/db.ts`
- [x] T002 [P] Read `apps/store-app/src/types/index.ts` lines ~683–700 to confirm current `SyncMetadata` and `PendingSync` shapes
- [x] T003 [P] Read `apps/store-app/src/services/syncConfig.ts` to confirm current `SYNC_TABLES` list and `SYNC_CONFIG` shape
- [x] T004 [P] Read `apps/store-app/src/contexts/offlineData/useOfflineInitialization.ts` to identify where `fullResync()` is currently called and what guards (if any) exist

**Checkpoint**: Baseline confirmed — proceed to foundational changes

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Schema migration, type extensions, and tier configuration. MUST complete before any user story work begins.

**⚠️ CRITICAL**: No user story work can begin until this phase is complete

- [x] T005 Extend `SyncMetadata` interface in `apps/store-app/src/types/index.ts` — add `last_synced_version: number`, `store_id?: string`, `hydration_complete: boolean` fields
- [x] T006 [P] Extend `PendingSync` interface in `apps/store-app/src/types/index.ts` — add `idempotency_key: string` and `status: 'pending' | 'permanently_failed'` fields
- [x] T007 Add `SYNC_TIERS` constant and `DataTierName` type to `apps/store-app/src/services/syncConfig.ts` per `data-model.md` tier classification; add `cursorPageSize: 500` to `SYNC_CONFIG`
- [x] T008 Bump Dexie schema to version 55 in `apps/store-app/src/lib/db.ts` — update index strings for `sync_metadata` and `pending_syncs`; add `upgrade()` migration block that backfills `last_synced_version = 0`, `hydration_complete = false`, `store_id = null` on existing `sync_metadata` rows, and `idempotency_key = uuidv4()`, `status = 'pending'` on existing `pending_syncs` rows
- [x] T009 Update `db.updateSyncMetadata()` in `apps/store-app/src/lib/db.ts` — extend to accept and persist `last_synced_version`, `store_id`, and `hydration_complete` alongside existing `last_synced_at`
- [x] T010 Update `db.addPendingSync()` in `apps/store-app/src/lib/db.ts` — generate `idempotency_key: uuidv4()` and set `status: 'pending'` on every new outbox entry
- [x] T011 Implement `getCheckpoint(tableName: SyncTable, storeId: string): Promise<SyncCheckpoint>` in `apps/store-app/src/services/syncService.ts` — returns `last_synced_version` and `hydration_complete` for the given table+store from `sync_metadata`
- [x] T012 Implement `saveCheckpoint(tableName, storeId, version, hydrationComplete)` in `apps/store-app/src/services/syncService.ts` — writes to `sync_metadata` atomically; called after each page upsert succeeds
- [x] T013 Implement `hasExistingData(storeId: string): Promise<boolean>` in `apps/store-app/src/services/syncService.ts` — returns true if `sync_metadata` has at least one row for this `store_id` with `last_synced_version > 0`

**Checkpoint**: Schema migrated, types updated, checkpoint API ready — user story phases can begin

---

## Phase 3: User Story 1 — Fast Return Login After First Sync (Priority: P1) 🎯 MVP

**Goal**: On returning login to a store with existing local data, UI becomes interactive within 2 seconds. Background delta sync fetches only records changed since the last checkpoint — no full re-download.

**Independent Test**: Log in a second time on a device that already has local data. Open DevTools Network tab. Confirm: (a) no full-table `.select('*')` queries without a `version` filter, (b) the UI is usable within 2 seconds, (c) sync completes silently in background.

### Implementation for User Story 1

- [x] T014 [US1] Implement `downloadTablePaged(tableName, storeId, options?)` in `apps/store-app/src/services/syncService.ts` — cursor loop: `.gt('version', lastVersion).order('version', ascending: true).limit(cursorPageSize)`, upsert each page into IndexedDB, call `saveCheckpoint()` after each page, loop until `data.length < cursorPageSize`
- [x] T015 [US1] Update warm-start path in `apps/store-app/src/contexts/offlineData/useOfflineInitialization.ts` — add `hasExistingData(storeId)` check; if true, skip `fullResync()` and instead call `downloadTablePaged()` for each Tier 1 table in background (delta sync only)
- [ ] T016 [US1] Write Vitest unit tests for `downloadTablePaged()` cursor advancement in `apps/store-app/tests/services/syncService.downloadTablePaged.test.ts` — test: correct version filter applied, checkpoint advances per page, loop exits at last page, aborts cleanly on signal
- [x] T017 [US1] Write Vitest unit tests for `hasExistingData()` in `apps/store-app/tests/services/syncService.hasExistingData.test.ts` — test: returns false on empty sync_metadata, false when version = 0, true when version > 0 for matching store_id

**Checkpoint**: US1 complete — returning login shows cached UI instantly, delta sync runs in background

---

## Phase 4: User Story 2 — Cold Start with Progressive Hydration (Priority: P2)

**Goal**: On first login with no local data, Tier 1 tables (stores, branches, products, users, accounts, entities) load first and unlock the UI. Tier 2/3 load concurrently in the background. The UI is never blocked waiting for Tier 2/3.

**Independent Test**: Open app in fresh browser profile (no IndexedDB). Log in. Confirm: (a) a bill can be created before Tier 2 data finishes loading, (b) a non-intrusive loading indicator is visible during Tier 2/3 background hydration, (c) no UI freeze at any point.

### Implementation for User Story 2

- [x] T018 [US2] Implement `downloadTier(tier: DataTierName, storeId: string, branchId: string, options?)` in `apps/store-app/src/services/syncService.ts` — iterates `SYNC_TIERS[tier]` tables in dependency order, calls `downloadTablePaged()` for each, marks `hydration_complete: true` in checkpoint after all pages exhausted
- [x] T019 [US2] Add `SyncSession` runtime state object to `apps/store-app/src/contexts/offlineData/useOfflineInitialization.ts` — tracks `{ isColdStart, tier1Complete, tier2Complete, tier3Complete, connectivity }` as React state
- [x] T020 [US2] Update cold-start path in `apps/store-app/src/contexts/offlineData/useOfflineInitialization.ts` — call `downloadTier('tier1', ...)` and `await` it before setting `isDataReady = true`; then fire `downloadTier('tier2', ...)` and `downloadTier('tier3', ...)` concurrently without awaiting
- [x] T021 [US2] Expose `syncSession` state (tier progress flags) via `OfflineDataContext` in `apps/store-app/src/contexts/offlineData/offlineDataContextContract.ts` and `OfflineDataContext.tsx` — so UI components can show non-intrusive tier progress indicator
- [x] T022 [P] [US2] Add a non-intrusive Tier 2/3 loading indicator component (e.g., subtle status bar) in `apps/store-app/src/components/SyncProgressIndicator.tsx` — displays during background hydration; hidden when tier2Complete

**Checkpoint**: US2 complete — cold start shows UI as soon as Tier 1 loads; background hydration is non-blocking

---

## Phase 5: User Story 3 — Offline Write Queuing and Later Sync (Priority: P3)

**Goal**: Records created while offline are queued in `pending_syncs` with a UUID idempotency key. On reconnect, all queued items upload without duplicates. Backend-rejected items (4xx) are marked permanently failed, the operator is alerted, and the rest of the queue continues.

**Independent Test**: (a) Go offline, create a bill, come online — bill appears in Supabase exactly once. (b) Kill app mid-upload, reconnect — no duplicate. (c) Manually corrupt a payload, come online — alert appears, next item still uploads.

### Implementation for User Story 3

- [x] T023 [US3] Update `processPendingSyncs()` in `apps/store-app/src/services/syncService.ts` — add `idempotency_key` to every upload request (as a header or payload field); only process entries where `status = 'pending'` (skip permanently_failed)
- [x] T024 [US3] Add permanent-failure detection to `processPendingSyncs()` in `apps/store-app/src/services/syncService.ts` — if backend returns a non-retryable 4xx, update `pending_syncs` entry: `status = 'permanently_failed'`, store error in `last_error`, do NOT delete the entry
- [x] T025 [US3] Emit operator alert on permanent failure in `apps/store-app/src/services/syncService.ts` — call `notificationsService` or `comprehensiveLoggingService` with a multilingual notification using `createMultilingualFromString()` so the operator sees a visible in-app alert
- [x] T026 [US3] Implement `getPermanentlyFailedItems(): Promise<PendingSync[]>` in `apps/store-app/src/services/syncService.ts` — queries `pending_syncs` where `status = 'permanently_failed'`
- [x] T027 [US3] Update `apps/store-app/src/pages/UnsyncedItems.tsx` — add a section displaying permanently failed outbox entries (via `getPermanentlyFailedItems()`); include per-item discard action; use existing i18n patterns
- [ ] T028 [US3] Write Vitest tests for outbox idempotency and permanent-failure paths in `apps/store-app/tests/services/syncService.outbox.test.ts` — test: idempotency_key present in upload payload, 4xx → permanently_failed status, queue continues after permanent failure, 5xx → retried

**Checkpoint**: US3 complete — offline writes are reliable, idempotent, and visible to operator on failure

---

## Phase 6: User Story 4 — Store-Scoped Data Persistence Across Sessions (Priority: P4)

**Goal**: Logout and re-login to the same store preserves local IndexedDB data. Only user session state is cleared. Switching to a different store correctly re-initializes data.

**Independent Test**: (a) Log out, log back in as a different user to the same store — no full resync, delta only. (b) Log in to a different store — local data from prior store not visible. (c) Return to original store — data still present.

### Implementation for User Story 4

- [x] T029 [US4] Audit `apps/store-app/src/contexts/offlineData/useStoreSwitchLifecycle.ts` — confirm it clears IndexedDB only on store switch (different `store_id`), not on logout/re-login to same store; add store_id guard if missing
- [x] T030 [US4] Confirm `useOfflineInitialization.ts` warm-start path (T015) correctly scopes `hasExistingData()` by `store_id` — returning login to same store follows delta path; different store triggers cold start + `fullResync()`
- [x] T031 [US4] Ensure `sync_metadata` checkpoints written by `saveCheckpoint()` (T012) always include the current `store_id` — verify no checkpoint can be used across stores
- [ ] T032 [US4] Write Vitest migration test for Dexie v55 upgrade block in `apps/store-app/tests/services/db.migration.v55.test.ts` — verify backfill sets correct defaults on pre-existing rows; verify new rows get idempotency_key and status fields

**Checkpoint**: US4 complete — store-scoped persistence proven; all four user stories independently functional

---

## Phase 7: Polish & Cross-Cutting Concerns

**Purpose**: RBAC revocation, observability, i18n strings, and regression validation

- [x] T033 [P] Add 403 permission-revocation detection in `apps/store-app/src/services/syncService.ts` — when any sync request returns 403, invoke the injected `onPermissionRevoked(storeId)` callback (per `contracts/sync-service-contract.ts`); wire callback in `apps/store-app/src/contexts/SupabaseAuthContext.tsx`
- [x] T034 [P] Add structured `SyncLogEntry` emission throughout `apps/store-app/src/services/syncService.ts` at key lifecycle points (`sync_started`, `tier_completed`, `page_downloaded`, `outbox_item_permanently_failed`, `permission_revoked`) — use `comprehensiveLoggingService` or equivalent
- [x] T035 [P] Add i18n strings for all new operator-facing messages (permanently failed outbox alert, permission revoked redirect, Tier 2 background sync indicator) to `apps/store-app/src/i18n/en.ts`, `ar.ts`, and `fr.ts`
- [x] T036 Remove or guard the legacy `localStorage`-based `last_synced_at` helpers (lines ~906–910 in `apps/store-app/src/services/syncService.ts`) — version-based checkpoints in IndexedDB now supersede them; either remove or keep as display-only fallback with a comment
- [x] T037 Run `pnpm parity:gate` from `apps/store-app/` — fix any sync parity golden snapshot failures caused by the tier/checkpoint changes
- [x] T038 [P] Run all Vitest tests with `pnpm test:run` from `apps/store-app/` — confirm all new and existing service tests pass
- [ ] T039 Manually execute the five test scenarios from `specs/010-incremental-sync-redesign/quickstart.md` (Cold Start, Returning Login, Outbox Idempotency, Permanent Failure, Store Switch) and document results

---

## Dependencies & Execution Order

### Phase Dependencies

- **Phase 1 (Setup)**: No dependencies — start immediately
- **Phase 2 (Foundational)**: Depends on Phase 1 — **BLOCKS all user story phases**
- **Phase 3 (US1)**: Depends on Phase 2 — uses `hasExistingData()`, `getCheckpoint()`, `saveCheckpoint()`
- **Phase 4 (US2)**: Depends on Phase 2 + Phase 3 — `downloadTier()` builds on `downloadTablePaged()`
- **Phase 5 (US3)**: Depends on Phase 2 only — outbox changes are independent of US1/US2
- **Phase 6 (US4)**: Depends on Phase 2 + Phase 3 (store_id scoping in checkpoints)
- **Phase 7 (Polish)**: Depends on all story phases complete

### User Story Dependencies

- **US1 (P1)**: Requires Phase 2 (checkpoints API). Independent of US2/US3/US4.
- **US2 (P2)**: Requires Phase 2 + US1 complete (`downloadTier` calls `downloadTablePaged`).
- **US3 (P3)**: Requires Phase 2 only. Fully independent of US1/US2/US4.
- **US4 (P4)**: Requires Phase 2 + US1 complete (store_id scoping in `hasExistingData`/`saveCheckpoint`).

### Within Each User Story

- Service-layer implementation before context/UI changes
- Checkpoint save is atomic with page upsert — never save checkpoint on partial failure
- Tests written alongside implementation (not strict TDD, but same PR)
- Complete story before advancing to next priority

### Parallel Opportunities

- T002, T003, T004 (Phase 1) can run in parallel
- T005 + T006 (type extensions, different concerns) can run in parallel
- T007 can run in parallel with T008 (config vs. schema)
- T011, T012, T013 (separate service methods, no inter-dependency) can start in parallel after T008/T009/T010
- T033, T034, T035 (Polish) can all run in parallel
- US3 (Phase 5) can be worked in parallel with US2 (Phase 4) since they touch different parts of syncService

---

## Parallel Example: Phase 2 Foundational

```
In parallel:
  T005 — extend SyncMetadata interface (types/index.ts)
  T006 — extend PendingSync interface (types/index.ts)
  T007 — add SYNC_TIERS to syncConfig.ts

Then sequentially:
  T008 — Dexie v55 bump + upgrade block (depends on T005, T006)
  T009 — update db.updateSyncMetadata() (depends on T005, T008)
  T010 — update db.addPendingSync() (depends on T006, T008)

In parallel after T008:
  T011 — getCheckpoint()
  T012 — saveCheckpoint()
  T013 — hasExistingData()
```

## Parallel Example: US3 + US2 Concurrent

```
After Phase 2 complete:
  Developer A → Phase 4 (US2): downloadTier + tiered init
  Developer B → Phase 5 (US3): outbox idempotency + permanent failure
  (No shared files between these phases)
```

---

## Implementation Strategy

### MVP First (User Story 1 Only)

1. Complete Phase 1: Setup (confirm baseline)
2. Complete Phase 2: Foundational (schema + types + checkpoint API)
3. Complete Phase 3: User Story 1 (warm login + delta sync)
4. **STOP and VALIDATE**: Returning login takes <2s, no redundant queries in Network tab
5. Ship US1 as the first increment — immediate operator value

### Incremental Delivery

1. **Phase 1 + 2 → Foundation**: Schema migrated, APIs ready
2. **+US1 → Fast Return Login**: Delta sync on warm start (P1 value delivered)
3. **+US2 → Progressive Cold Start**: Tiered hydration unlocks UI early (P2 value)
4. **+US3 → Reliable Outbox**: Idempotency + permanent failure handling (P3 value)
5. **+US4 → Store Persistence**: DB preserved across sessions (P4 value)
6. Each story is independently verifiable after completion

### Single Developer Order

```
Phase 1 → Phase 2 → US1 → US2 → US3 → US4 → Polish
```

Total: ~39 tasks across 7 phases

---

## Notes

- `[P]` tasks = different files, no shared dependencies — safe to work in parallel
- `[Story]` label maps task to specific user story for traceability
- **Never** advance `last_synced_version` checkpoint until the full page is upserted successfully
- **Never** add new `setInterval` anywhere in the sync path (CG-03)
- **Never** call `uploadOnly()` with download logic — keep upload and download paths separate (CG-03)
- `idempotency_key` is generated once at `addPendingSync()` time, never regenerated on retry
- All user-facing strings must use `createMultilingualFromString()` / `getTranslatedString()` (CG-10)
- All date display uses `getLocalDateString()` — never `new Date().toISOString().split('T')[0]` (CG-11)
- Run `pnpm parity:gate` after any sync-related changes to catch golden snapshot regressions
