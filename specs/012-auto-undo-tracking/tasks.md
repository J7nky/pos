# Implementation Tasks: Automatic Undo Tracking System

**Feature**: `012-auto-undo-tracking` | **Branch**: `012-auto-undo-tracking`  
**Specification**: [spec.md](./spec.md) | **Plan**: [plan.md](./plan.md)  
**Total Tasks**: 28 (12 infrastructure, 11 validation, 5 deferred to Phase 3 migration)

---

## Phase 1: Infrastructure Foundation

**Objective**: Implement the core change tracker service, integrate with Dexie hooks, and satisfy CG-12 testing requirements. These tasks are sequential and blocking for all validation.

### Core Service

- [x] T001 Create `changeTracker` singleton service in `apps/store-app/src/services/changeTracker.ts` with session management (`startSession`, `endSession`, `suppress`, `resume`, `isActive`), change tracking methods (`trackCreate`, `trackUpdate` with duplicate-merge keeping earliest `before`, `trackDelete`), and `EXCLUDED_TABLES` set (`pending_syncs`, `bill_audit_logs`, `sync_metadata`, `sync_state`)
- [x] T002 Create `buildUndoFromChanges(type, changes)` function in `apps/store-app/src/services/changeTracker.ts` that reverses changes into undo steps (create→delete, delete→restore, update→revert-to-before), builds deduplicated `affected` list, and logs warning for delete steps with missing record snapshots

### Wrapper Utilities

- [x] T003 Create `withUndoOperation(type, pushUndo, operation)` wrapper and `withUndoSuppressed(fn)` utility in `apps/store-app/src/contexts/offlineData/operations/withUndoOperation.ts` — wrapper starts session, runs operation, builds undo on success, discards on failure; suppression increments/decrements depth counter

### Dexie Hook Integration

- [x] T004 Modify `apps/store-app/src/lib/db.ts` — import `changeTracker` and add `changeTracker.trackCreate()` call inside `triggerSyncOnUnsynced` hook (fires for all syncable tables on create with `_synced: false`)
- [x] T005 Modify `apps/store-app/src/lib/db.ts` — add `changeTracker.trackUpdate()` call inside `triggerSyncOnUpdate` hook (fires for all syncable tables on update when `_synced` transitions to false)
- [x] T006 Add new `deleting` hooks to all syncable tables in `apps/store-app/src/lib/db.ts` constructor — use `makeDeleteTracker(tableName)` factory pattern to bind table name via closure; register in existing `syncableTables` for-loop

### Sync Parity Verification (CG-12)

- [x] T007 Run `pnpm parity:gate` from `apps/store-app/` after db.ts hook modifications and confirm pass — db.ts is a sync-critical file per CG-12

### Undo Suppression & Context Wiring

- [x] T008 Modify `apps/store-app/src/contexts/offlineData/operations/undoOperations.ts` — import `withUndoSuppressed` from `./withUndoOperation` and wrap the entire `undoLastAction()` function body with it to prevent undo-of-undo tracking
- [x] T009 Fix `apps/store-app/src/contexts/OfflineDataContext.tsx` — pass real `stablePushUndo` instead of no-op `() => {}` to `processEmployeePayment` deps object

### Vitest Coverage (CG-12)

- [x] T010 Create unit tests in `apps/store-app/src/services/__tests__/changeTracker.test.ts` for session management: `startSession` creates session, `endSession` returns changes and clears session, double `startSession` logs warning and merges into outer session, `suppress`/`resume` prevents tracking, `isActive` returns correct state
- [x] T011 Create unit tests in `apps/store-app/src/services/__tests__/changeTracker.test.ts` for change tracking: `trackCreate` records create with full snapshot, `trackUpdate` records update with before/modifications, `trackUpdate` merges duplicate updates for same `(table, primKey)` keeping earliest `before`, `trackDelete` records delete with snapshot, `trackDelete` handles undefined `obj` gracefully, all track methods are no-op when session inactive or suppressed, changes to `EXCLUDED_TABLES` (`pending_syncs`, `bill_audit_logs`, `sync_metadata`, `sync_state`) are silently ignored (FR-005), `buildUndoFromChanges` produces correct reversed steps
- [x] T012 Create unit tests in `apps/store-app/src/contexts/offlineData/operations/__tests__/withUndoOperation.test.ts` for wrapper behavior: `withUndoOperation` starts session and calls `pushUndo` on success, `withUndoOperation` discards changes and does not call `pushUndo` on operation failure (FR-015), `withUndoOperation` does not call `pushUndo` when operation produces zero changes, `withUndoSuppressed` prevents tracking during execution, nested `withUndoOperation` merges into outer session

---

## Phase 2: Validation & Testing

**Objective**: Verify the change tracker system works correctly for all user story requirements. These tasks can run in parallel after Phase 1 completes.

### User Story 1 — Automatic Undo Capture (P1)

- [x] T013 [P] [US1] Manual test: Execute `createBill` operation (creates bill + line items + transaction + journal entries + inventory updates), check `sessionStorage.getItem('last_undo_action')` has undo data with entries for all 5 table types, trigger undo in UI, verify all records deleted across all tables
- [x] T014 [P] [US1] Manual test: Execute multi-table operation (payment with transaction + journal entries), undo, verify in DevTools that sessionStorage reflects correct undo steps in reverse chronological order (last-created record is first step)
- [x] T015 [P] [US1] Create integration test in `apps/store-app/src/__tests__/integration/changeTracker.integration.test.ts` that wraps a test operation with `withUndoOperation()`, performs multiple DB writes via Dexie, captures changes, and asserts `buildUndoFromChanges` produces matching undo steps

### User Story 2 — Backward Compatibility (P1)

- [x] T016 [P] [US2] Manual test: Execute existing operation that uses manual `pushUndo()` (e.g., `deleteSale`), verify undo still works identically, verify `changeTracker.isActive()` returns false during operation
- [x] T017 [P] [US2] Regression test: Run `pnpm test:run` from `apps/store-app/` — all existing tests MUST pass with zero changes to existing operation files

### User Story 3 — Prevent Undo-of-Undo (P1)

- [x] T018 [P] [US3] Manual test: Perform operation → check sessionStorage for undo entry → trigger undo → verify sessionStorage cleared → trigger undo again → verify nothing happens (no new undo entry created)
- [x] T019 [P] [US3] Manual test: Add temporary `console.log` in `changeTracker.trackCreate` → perform operation → trigger undo → verify no tracker logs appear during undo execution (suppression working)

### User Story 4 — Sync Operations Excluded (P2)

- [x] T020 [P] [US4] Manual test: Open DevTools Console → trigger a sync download (reconnect to network) → verify no `changeTracker` activity during sync → perform a user operation inside `withUndoOperation()` → verify only user changes are tracked
- [x] T021 [P] [US4] Code inspection: Verify in `db.ts` that `triggerSyncOnUnsynced` only calls `changeTracker.trackCreate()` inside the `if (obj._synced === false)` guard, and `triggerSyncOnUpdate` only calls `changeTracker.trackUpdate()` inside the `_synced` check

### User Story 5 — Complex Multi-Table Transactions (P2)

- [ ] T022 [P] [US5] Manual test: Execute `addInventoryBatch` operation (writes to `inventory_bills` + multiple `inventory_items` + `transactions` + `journal_entries`) inside `withUndoOperation()`, verify undo array has entries for all tables, verify undo steps are in reverse order
- [x] T023 [P] [US5] Create test helper in `apps/store-app/src/__tests__/helpers/trackingTestHelper.ts` that provides `captureChanges(operationFn)` utility for asserting tracked change counts per table in future tests

---

## Phase 3: Future Migration (Deferred)

**Objective**: Migrate the two broken operations to use automatic tracking (out of scope for Phase 2). These tasks will be completed after Phase 2 validation confirms the system works.

- [x] T024 [US1] Migrate `processPayment()` in `apps/store-app/src/contexts/offlineData/operations/paymentOperations.ts` to use `withUndoOperation()` wrapper — remove manual undo data construction, remove `createCashDrawerUndoData` usage for this function
- [x] T025 [US1] Migrate `processEmployeePayment()` in `apps/store-app/src/contexts/offlineData/operations/paymentOperations.ts` to use `withUndoOperation()` wrapper — remove manual undo data construction
- [x] T026 Manual test: Execute customer payment → undo → verify transaction + journal entries + entity balance all reverted; execute supplier payment → undo → verify same
- [x] T027 Manual test: Execute employee payment → undo → verify transaction + journal entries + employee entity all reverted (including entity deletion if it was newly created)
- [x] T028 Regression test: Run full payment undo test suite (`processPayment`, `processEmployeePayment`, `processSupplierAdvance`) — all should pass with no regressions

---

## Dependencies

```
Phase 1 (Foundational — Sequential)
├─ T001-T002: changeTracker service + buildUndoFromChanges
├─ T003: withUndoOperation wrapper
├─ T004-T006: db.ts hook integration
├─ T007: pnpm parity:gate (CG-12, blocks further work if fails)
├─ T008-T009: undoOperations suppression + context fix
└─ T010-T012: Vitest tests (CG-12)

Phase 2 (Validation — Parallel after Phase 1)
├─ T013-T015: User Story 1 (parallel with all below)
├─ T016-T017: User Story 2 (parallel with all)
├─ T018-T019: User Story 3 (parallel with all)
├─ T020-T021: User Story 4 (parallel with all)
└─ T022-T023: User Story 5 (parallel with all)

Phase 3 (Deferred — Sequential after Phase 2)
├─ T024-T025: Migrate operations
└─ T026-T028: Validate migrations
```

---

## Implementation Strategy

### MVP Scope (Minimum Viable)

**Scope 1 (Critical)**: Infrastructure + Core Validation
- Complete Phase 1: All 12 infrastructure tasks (T001-T012)
- Complete Phase 2: Validation for US1-US3 (T013-T019)
- **Result**: Automatic undo system proven; undo-of-undo prevented; backward compatibility confirmed

### Expansion Scopes

**Scope 2 (Full Validation)**:
- Add Phase 2: Validation for US4-US5 (T020-T023)
- **Result**: Complete feature validation; ready for production

**Scope 3 (Migration — separate sprint)**:
- Complete Phase 3: All 5 migration tasks (T024-T028)
- **Result**: Both broken operations use automatic undo; zero manual construction

### Parallel Execution

After Phase 1 completes, Phase 2 validation tasks run in parallel:

| Stream | Tasks | Estimated Duration |
|--------|-------|--------------------|
| US1 Automatic Capture | T013, T014, T015 | ~40 min |
| US2 Backward Compat | T016, T017 | ~20 min |
| US3 Undo Prevention | T018, T019 | ~20 min |
| US4 Sync Exclusion | T020, T021 | ~20 min |
| US5 Multi-Table | T022, T023 | ~30 min |

---

## Success Criteria

| Task Range | Success Condition | Verification Method |
|------------|-------------------|---------------------|
| T001-T006 | Code compiles, no lint errors, imports resolve | `pnpm lint` on modified files |
| T007 | Sync parity gate passes | `pnpm parity:gate` exit code 0 |
| T008-T009 | Code compiles, pushUndo wired correctly | `pnpm lint` + inspect OfflineDataContext |
| T010-T012 | All Vitest tests pass, >80% coverage of new files | `pnpm test:run` for test files |
| T013-T014 | All record types in undo payload; undo fully reverts | Browser DevTools sessionStorage + IndexedDB |
| T015 | Integration test passes | `pnpm test:run` integration suite |
| T016-T017 | Existing undos work; no test regressions | `pnpm test:run` full suite |
| T018-T019 | sessionStorage cleared after undo; no new entry | Browser DevTools step-through |
| T020-T021 | Only `_synced=false` changes tracked | DevTools console + code inspection |
| T022-T023 | Multi-table changes captured; reverse order verified | DevTools + IndexedDB inspection |
| T024-T028 | Operations use wrapper; undo reverts all tables | Regression test suite pass |

---

## Requirement Coverage Matrix

| Requirement | Task(s) | Coverage |
|-------------|---------|----------|
| FR-001 singleton service | T001 | Full |
| FR-002 startSession | T001, T010 | Full (impl + test) |
| FR-003 endSession | T001, T010 | Full (impl + test) |
| FR-004 track methods | T001, T011 | Full (impl + test) |
| FR-005 exclude tables | T001, T011 | Full (impl + test) |
| FR-006 merge duplicates | T001, T011 | Full (impl + test, earliest `before`) |
| FR-007 buildUndoFromChanges | T002, T011 | Full (impl + test) |
| FR-008 reverse steps | T002, T011, T014 | Full (impl + test + manual) |
| FR-009 hook creating/updating | T004, T005 | Full |
| FR-010 hook deleting | T006 | Full |
| FR-011 withUndoOperation | T003, T012 | Full (impl + test) |
| FR-012 withUndoSuppressed | T003, T012 | Full (impl + test) |
| FR-013 suppress in undoLastAction | T008 | Full |
| FR-014 only active session | T001, T011, T016 | Full (impl + test + manual) |
| FR-015 discard on failure | T003, T012 | Full (impl + test) |
| FR-016 backward compatible | T016, T017 | Full (manual + regression) |

---

## Notes

- **CG-12 compliance**: T007 runs `pnpm parity:gate` for db.ts changes; T010-T012 provide Vitest coverage for new service and operations files
- **CG-14 compliance**: Undo payloads use sessionStorage only (verified by design; no IndexedDB persistence)
- **Phase 1 is critical path**: All 12 infrastructure tasks must complete before Phase 2
- **Phase 2 is independently testable**: Each user story validation runs in parallel
- **Existing code unaffected**: No modifications to existing operation files in Phase 1-2
- **Test file paths**: Colocated under `__tests__/` directories adjacent to source (`services/__tests__/`, `operations/__tests__/`)
