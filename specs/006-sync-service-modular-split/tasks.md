---
description: "Task list for 006-sync-service-modular-split"
---

# Tasks: Modular sync service split

**Input**: Design documents from `/home/janky/Desktop/pos-1/specs/006-sync-service-modular-split/`  
**Prerequisites**: [plan.md](./plan.md), [spec.md](./spec.md), [research.md](./research.md), [data-model.md](./data-model.md), [contracts/sync-public-api.md](./contracts/sync-public-api.md), [quickstart.md](./quickstart.md)

**Tests**: Parity gate is the authoritative regression suite (spec SC-001). Optional Vitest unit tasks only where existing tests need import/path updates.

**Organization**: Phases follow research extraction order (config → upload → download → deletion). **User Story 1 [US1]** = behavioral parity (parity gate checkpoints). **User Story 2 [US2]** = physical module separation. **User Story 3 [US3]** = focused testability / legacy unit test alignment.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Parallelizable (different artifacts, no ordering dependency with incomplete work)
- **[Story]**: [US1] parity / [US2] structure / [US3] testability

## Phase 1: Setup

**Purpose**: Establish a green baseline before edits.

- [X] T001 Run `pnpm --filter ./apps/store-app run parity:gate` from repository root `/home/janky/Desktop/pos-1` and confirm exit code 0; note result for the PR description

---

## Phase 2: Foundational (blocking)

**Purpose**: Shared config module + ESLint scope for new files. **No user story work before this completes.**

- [X] T002 Update `apps/store-app/eslint.config.js` so the targeted `@typescript-eslint/no-explicit-any` override applies to `src/services/syncConfig.ts`, `src/services/syncUpload.ts`, `src/services/syncDownload.ts`, and `src/services/syncDeletionDetection.ts` in addition to `src/services/syncService.ts`
- [X] T003 Create `apps/store-app/src/services/syncConfig.ts` exporting `SYNC_CONFIG`, `SYNC_TABLES`, `SYNC_DEPENDENCIES`, and types `SyncTable` and `SyncResult`; remove the duplicated definitions from `apps/store-app/src/services/syncService.ts` and import them from `syncConfig.ts`
- [X] T004 Run `pnpm --filter ./apps/store-app exec eslint --no-error-on-unmatched-pattern "apps/store-app/src/services/syncService.ts" "apps/store-app/src/services/syncConfig.ts"` and fix reported issues; then run `pnpm --filter ./apps/store-app run parity:gate` from `/home/janky/Desktop/pos-1`

**Checkpoint**: Config extracted; parity still green — safe to start upload extraction.

---

## Phase 3: User Story 2 — Upload module (Priority: P2)

**Goal**: Outbound sync + upload-then-emit live in `syncUpload.ts` per [research.md](./research.md) §7.

**Independent test**: Code review: `eventEmissionService` imports/usages only appear in `apps/store-app/src/services/syncUpload.ts` (and `eventEmissionService.ts`), not in download/deletion modules.

- [X] T005 [US2] Extract `uploadLocalChanges` and upload-only private helpers from `apps/store-app/src/services/syncService.ts` into `apps/store-app/src/services/syncUpload.ts`; wire `SyncService` in `syncService.ts` to call the extracted functions; preserve batch confirmation before any `eventEmissionService` call (constitution CG-03)

---

## Phase 4: User Story 1 — Parity after upload (Priority: P1)

**Goal**: No observable sync regression (spec User Story 1).

**Independent test**: `parity:gate` passes.

- [X] T006 [US1] Run `pnpm --filter ./apps/store-app run parity:gate` from `/home/janky/Desktop/pos-1`; fix regressions only in `apps/store-app/src/services/syncUpload.ts` or `apps/store-app/src/services/syncService.ts` until green

---

## Phase 5: User Story 2 — Download module (Priority: P2)

**Goal**: Inbound sync in `syncDownload.ts`.

**Independent test**: No `eventEmissionService` usage in `apps/store-app/src/services/syncDownload.ts`.

- [X] T007 [US2] Extract `downloadRemoteChanges` and download-specific private helpers from `apps/store-app/src/services/syncService.ts` into `apps/store-app/src/services/syncDownload.ts`; wire orchestrator in `apps/store-app/src/services/syncService.ts`

---

## Phase 6: User Story 1 — Parity after download (Priority: P1)

- [X] T008 [US1] Run `pnpm --filter ./apps/store-app run parity:gate` from `/home/janky/Desktop/pos-1`; fix regressions until green

---

## Phase 7: User Story 2 — Deletion detection module (Priority: P2)

**Goal**: Remote deletion detection in `syncDeletionDetection.ts`; instance state (`deletionStateCache`, `lastDeletionCheck`) remains on `SyncService` per [research.md](./research.md) §2 unless a smaller change proves equivalent.

**Independent test**: Deletion/pagination logic is not duplicated in `syncUpload.ts` or `syncDownload.ts`.

- [X] T009 [US2] Extract `detectAndSyncDeletions` and deletion-specific private helpers from `apps/store-app/src/services/syncService.ts` into `apps/store-app/src/services/syncDeletionDetection.ts`; pass `SyncService` or explicit dependencies as needed; keep `apps/store-app/src/services/syncService.ts` orchestration for `sync()` / `fullResync()` / `syncTable()` calling upload → download → deletion in the same order as before

---

## Phase 8: User Story 1 — Parity after deletion (Priority: P1)

- [X] T010 [US1] Run `pnpm --filter ./apps/store-app run parity:gate` from `/home/janky/Desktop/pos-1`; fix regressions until green

---

## Phase 9: User Story 3 — Focused testability (Priority: P3)

**Goal**: Legacy unit tests and imports remain valid; parity suite remains the primary gate (spec User Story 3).

**Independent test**: `pnpm --filter ./apps/store-app run test:run` includes prior sync-related unit tests without import failures.

- [X] T011 [US3] Update `apps/store-app/src/services/__tests__/legacy/syncService.optimizations.test.ts` if `SyncService` or module paths changed; run `pnpm --filter ./apps/store-app run test:run` and ensure sync-related tests pass

---

## Phase 10: Polish & cross-cutting

**Purpose**: Public API stability, no accidental cross-layer imports, final verification per [quickstart.md](./quickstart.md).

- [X] T012 Verify `apps/store-app/src/services/syncService.ts` still exports `syncService`, `syncWithSupabase`, `getLastSyncedAt`, `setLastSyncedAt`, `SYNC_TABLES`, and `SyncResult` matching `specs/006-sync-service-modular-split/contracts/sync-public-api.md`
- [X] T013 [P] Ripgrep `apps/store-app/src/pages` and `apps/store-app/src/components` for imports from `syncUpload`, `syncDownload`, or `syncDeletionDetection` — expect zero matches; if any, refactor to use `syncService` or types from `syncConfig.ts` / `syncService.ts` only
- [X] T014 Run `pnpm --filter ./apps/store-app run lint` and `pnpm --filter ./apps/store-app run parity:gate` from `/home/janky/Desktop/pos-1`; resolve all failures

---

## Dependencies & execution order

### Phase dependencies

| Phase | Depends on |
|-------|------------|
| Phase 1 Setup | — |
| Phase 2 Foundational | Phase 1 (baseline recorded) |
| Phase 3 [US2] Upload | Phase 2 |
| Phase 4 [US1] | Phase 3 |
| Phase 5 [US2] Download | Phase 4 |
| Phase 6 [US1] | Phase 5 |
| Phase 7 [US2] Deletion | Phase 6 |
| Phase 8 [US1] | Phase 7 |
| Phase 9 [US3] | Phase 8 |
| Phase 10 Polish | Phase 9 |

### User story mapping

| Story | Tasks | Role |
|-------|-------|------|
| US1 (P1 parity) | T006, T008, T010 | Gate after each extraction |
| US2 (P2 structure) | T002–T003, T005, T007, T009 | ESLint + modules |
| US3 (P3 tests) | T011 | Legacy unit test alignment |

### Parallel opportunities

- **T013 [P]** can run anytime after `syncUpload.ts` / `syncDownload.ts` / `syncDeletionDetection.ts` exist (after Phase 7) in parallel with documentation review — it only reads the tree.

### Parallel example (after Phase 7)

```bash
# Developer A: parity gate
pnpm --filter ./apps/store-app run parity:gate

# Developer B: import boundary audit (T013)
rg "syncUpload|syncDownload|syncDeletionDetection" apps/store-app/src/pages apps/store-app/src/components
```

---

## Implementation strategy

### MVP (minimum shippable increment)

1. Complete Phase 1–2 (baseline + `syncConfig` + ESLint).
2. Complete Phase 3–4 (upload module + parity) — **stop here** if time-boxed; still incomplete vs full split but upload concern is isolated.

### Full feature (all stories)

1. Phases 1–10 in order; do not skip parity checkpoints T006, T008, T010 before proceeding to the next extraction.

### Suggested commit boundaries

- After T003–T004: `refactor(sync): extract syncConfig`
- After T005–T006: `refactor(sync): extract syncUpload`
- After T007–T008: `refactor(sync): extract syncDownload`
- After T009–T010: `refactor(sync): extract syncDeletionDetection`

---

## Notes

- Do not change `SYNC_TABLES` order without updating `apps/store-app/tests/sync-parity/sync-tables.json` and re-running parity registry scripts.
- Internal modules must not be imported from UI layers ([contracts/sync-public-api.md](./contracts/sync-public-api.md)).
