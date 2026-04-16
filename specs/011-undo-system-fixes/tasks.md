---

description: "Task list for Undo System Hardening (feature 011-undo-system-fixes)"
---

# Tasks: Undo System Hardening

**Input**: Design documents from `/specs/011-undo-system-fixes/`
**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/undo-api.md, quickstart.md

**Tests**: NOT requested in the spec. Vitest unit-test tasks are listed as optional in the Polish phase only.

**Organization**: Tasks are grouped by user story (US1 – US5 from spec.md) to enable independent implementation and manual verification via the corresponding quickstart.md scenario.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no incomplete dependencies)
- **[Story]**: US1, US2, US3, US4, US5 — maps to user stories in spec.md
- All paths are absolute from repo root `/home/janky/Desktop/pos-1`

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Confirm working tree is clean for this feature and no build-time blockers exist. This feature introduces no new dependencies, directories, or tooling.

- [X] T001 Verify feature branch is `011-undo-system-fixes` and `pnpm install` runs clean at `/home/janky/Desktop/pos-1` (sanity-check — no code changes).
- [X] T002 [P] Open and skim the 6 target source files for this feature to confirm current line numbers match plan.md: `/home/janky/Desktop/pos-1/apps/store-app/src/contexts/offlineData/operations/undoOperations.ts`, `/home/janky/Desktop/pos-1/apps/store-app/src/contexts/OfflineDataContext.tsx`, `/home/janky/Desktop/pos-1/apps/store-app/src/contexts/offlineData/offlineDataContextContract.ts`, `/home/janky/Desktop/pos-1/apps/store-app/src/components/common/UndoToastManager.tsx`, `/home/janky/Desktop/pos-1/apps/store-app/src/i18n/locales/en.ts`, and `/home/janky/Desktop/pos-1/apps/store-app/src/i18n/locales/ar.ts` plus `/home/janky/Desktop/pos-1/apps/store-app/src/i18n/locales/fr.ts`.

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Shared type and constant additions that every user-story phase reads from. No behavior change yet.

**⚠️ CRITICAL**: No user story work may begin until this phase is complete.

- [X] T003 Extend the `UndoStep.op` union in `/home/janky/Desktop/pos-1/apps/store-app/src/contexts/offlineData/offlineDataContextContract.ts` from `'delete' \| 'restore' \| 'update'` to `'delete' \| 'restore' \| 'add' \| 'update'`, and add an optional `metadata?: Record<string, unknown>` field to the `UndoAction` type (see data-model.md §1, §3).
- [X] T004 Add module-level constants at the top of `/home/janky/Desktop/pos-1/apps/store-app/src/contexts/offlineData/operations/undoOperations.ts`: `UNDO_STORAGE_KEY = 'last_undo_action'`, `TABLE_NAME_MAP = { suppliers: 'entities', customers: 'entities' } as const`, and `CASH_DRAWER_EXEMPT_TABLE = 'cash_drawer_accounts'`. Export `UNDO_STORAGE_KEY` and `TABLE_NAME_MAP` as named exports so `OfflineDataContext.tsx` can import them (see data-model.md §6).

**Checkpoint**: Foundation ready — user story implementation can now begin.

---

## Phase 3: User Story 1 — Undoing a deletion actually restores and syncs the record (Priority: P1) 🎯 MVP

**Goal**: After deleting a record and clicking Undo, the record exists locally, is queued for upload, and reaches the server on the next sync. Works for both previously-synced and never-synced records. Validity check no longer rejects restores just because the record is absent.

**Independent Test**: Execute quickstart.md US1-1, US1-2, and US1-3 end-to-end. On Supabase dashboard, the restored record is present after the next sync.

### Implementation for User Story 1

- [X] T005 [US1] In `/home/janky/Desktop/pos-1/apps/store-app/src/contexts/offlineData/operations/undoOperations.ts`, build a `restoreTargetKeys: Set<string>` inside `undoLastAction()` before the validity loop, populated from `action.steps` where `op === 'restore' || op === 'add'`, using `${step.table}:${step.id ?? step.record?.id ?? step.changes?.id}` as the key. Reference this set in the validity loop and `continue` past the existence and `_synced` checks when `restoreTargetKeys.has(\`${item.table}:${item.id}\`)` is true (research.md D4, spec FR-009).
- [X] T006 [US1] In the same file, replace the `delete` step branch so: if `step.table === 'journal_entries' && step.transaction_id`, keep the existing cascade-delete path; otherwise delete the record and **all** `pending_syncs` rows whose `record_id === step.id` (unchanged from today — `delete` on a newly-created record correctly removes all outbox entries). Add a clarifying comment only if it helps future readers (data-model.md §3; research.md D2).
- [X] T007 [US1] In the same file, rewrite the `restore` step branch to: (a) `add(step.record)` to `step.table`; (b) compute `recordId = step.id ?? (step.record as any)?.id`, bail with a `console.warn` if still undefined; (c) delete `pending_syncs` rows matching `{ table_name: step.table, record_id: recordId, operation: 'delete' }`; (d) `await getDB().addPendingSync(step.table, recordId, 'create', step.record)`. (data-model.md §3; research.md D2; spec FR-003).
- [X] T008 [US1] In the same file, add a new `add` step branch (mirror of `restore` but using `step.changes` as the record payload): `add(step.changes)` to `step.table`; compute `recordId = step.id ?? (step.changes as any)?.id`; delete `pending_syncs` rows matching `{ table_name: step.table, record_id: recordId, operation: 'delete' }`; `addPendingSync(step.table, recordId, 'create', step.changes)` (research.md D3; data-model.md §3).
- [X] T009 [US1] In the same file, **remove** the final post-loop cleanup `for (const item of action.affected || [])` that blanket-deletes all `pending_syncs` rows for each affected id (previously at lines 81–84). Each step branch above now owns its outbox cleanup (research.md D2, spec FR-005).

**Checkpoint**: At this point, delete→Undo across sales, bills, inventory items, products, entities must restore the record and re-queue it for upload. Run quickstart.md US1-1, US1-2, US1-3 to verify. This is the MVP.

---

## Phase 4: User Story 2 — Undoing an edit preserves prior upload state (Priority: P1)

**Goal**: After editing a record and clicking Undo, the record reverts to original values and any pre-existing `pending_syncs.operation='create'` entry is preserved so the pre-edit record still uploads.

**Independent Test**: Execute quickstart.md US2 and US2-2. Inspect `pending_syncs` in DevTools after undo to confirm `create` row is intact; after sync, server shows the pre-edit values (or no change for previously-synced edits).

### Implementation for User Story 2

- [X] T010 [US2] In `/home/janky/Desktop/pos-1/apps/store-app/src/contexts/offlineData/operations/undoOperations.ts`, rewrite the `update` step branch to: (a) `await (getDB() as any)[step.table].update(step.id, { ...step.changes, _synced: false })` — explicitly merge `_synced: false` into the reverted values; (b) delete `pending_syncs` rows filtered by `record_id === step.id && operation === 'update'` **only** (do not touch `create` or `delete` rows). See research.md D2 + spec FR-004, FR-005.

**Checkpoint**: Create-then-edit-then-undo on an offline record now survives the next sync with its original (pre-edit) payload. Run quickstart.md US2.

---

## Phase 5: User Story 3 — Undo surface is clear, trustworthy, and predictable (Priority: P2)

**Goal**: Toast shows an action-specific label; success/failure coloring is driven by an explicit `feedbackType` state; the post-undo feedback banner actually renders; timers do not race the click.

**Independent Test**: Execute quickstart.md US3. Each action type produces a distinct toast label; green banner shows on success, red on failure; 8s auto-hide works.

### Implementation for User Story 3

- [X] T011 [P] [US3] Add i18n entries to `/home/janky/Desktop/pos-1/apps/store-app/src/i18n/locales/en.ts` under `common.labels.undoActions` with one key per action type listed in research.md D6 (`delete_bill`, `update_bill`, `complete_checkout`, `update_sale`, `delete_sale`, `add_inventory_batch`, `update_inventory_batch`, `delete_inventory_batch`, `apply_commission_rate`, `add_inventory_item`, `update_inventory_item`, `delete_inventory_item`, `add_product`, `update_product`, `delete_product`, `add_customer`, `update_customer`, `add_supplier`, `update_supplier`, `add_employee`, `update_employee`, `delete_employee`, `update_branch`, `add_transaction`, `open_cash_drawer`, `close_cash_drawer`, `cash_drawer_transaction`, `supplier_advance_review`, `supplier_advance_update`, `supplier_advance_delete`). Use the English labels from the research.md D6 table.
- [X] T012 [P] [US3] Add the same `common.labels.undoActions` key set to `/home/janky/Desktop/pos-1/apps/store-app/src/i18n/locales/ar.ts` with Arabic translations (e.g., `delete_bill: 'تم حذف الفاتورة'`, `update_bill: 'تم تعديل الفاتورة'`, etc.). Match stylistic register of existing Arabic entries in the file.
- [X] T013 [P] [US3] Add the same `common.labels.undoActions` key set to `/home/janky/Desktop/pos-1/apps/store-app/src/i18n/locales/fr.ts` with French translations (e.g., `delete_bill: 'Facture supprimée'`, `update_bill: 'Facture modifiée'`, etc.).
- [X] T014 [US3] In `/home/janky/Desktop/pos-1/apps/store-app/src/components/common/UndoToastManager.tsx`: add state `const [feedbackType, setFeedbackType] = useState<'success' \| 'error' \| null>(null)`; add state `const [actionType, setActionType] = useState<string \| null>(null)` that is set from the parsed undo payload when a new timestamp is detected.
- [X] T015 [US3] In the same file, replace `getToastMessage()` so it returns, in priority order: `feedback` if set → `t('common.labels.undoing')` if `undoing` → `t(\`common.labels.undoActions.${actionType}\`, t('common.labels.actionCompleted'))` when `actionType` is set → `t('common.labels.actionCompleted')`. The `t` fallback argument uses the existing `actionCompleted` key for unknown action types (research.md D6, spec FR-016).
- [X] T016 [US3] In the same file, replace `getToastType()` so it returns `feedbackType ?? 'success'` — remove the `feedback === t('common.labels.actionUndone')` string comparison entirely (research.md D7, spec FR-017).
- [X] T017 [US3] Rewrite `handleUndo` in the same file so the ordering is: (a) clear both timers first; (b) `setUndoing(true)`; (c) `const result = await undoLastAction()`; (d) `setUndoing(false)`; (e) `setVisible(true)` — keep toast rendered for feedback; (f) `setFeedback(result ? t('common.labels.actionUndone') : t('common.labels.actionFailed'))`; (g) `setFeedbackType(result ? 'success' : 'error')`; (h) 2s `setTimeout` clears `feedback`, `feedbackType`, `actionType`, and sets `visible=false` (research.md D8, D9; spec FR-017).
- [X] T018 [US3] In the same file, remove `visible` from the `useEffect` dependency array so it becomes `[canUndo, feedback]`. When a new timestamp is detected, also call `setActionType(parsed.type ?? null)` so the label map has input (research.md D10).

**Checkpoint**: Toast labels identify the action; success/failure coloring works correctly; feedback banner renders for 2s. Run quickstart.md US3.

---

## Phase 6: User Story 4 — Multi-tab and session safety (Priority: P2)

**Goal**: Undo state is scoped to the active tab/session. Tab B never sees Tab A's undo. Cold starts never show a stale undo.

**Independent Test**: Execute quickstart.md US4-1 (two tabs) and US4-2 (close + reopen). Zero cross-tab leakage; zero stale-startup flickers.

### Implementation for User Story 4

- [X] T019 [US4] In `/home/janky/Desktop/pos-1/apps/store-app/src/contexts/offlineData/operations/undoOperations.ts`, replace every `localStorage.getItem/setItem/removeItem('last_undo_action')` call with `sessionStorage` equivalents using the `UNDO_STORAGE_KEY` constant from T004. Confirm no `localStorage` reference to this key remains in this file (research.md D1; spec FR-013, FR-014).
- [X] T020 [US4] In `/home/janky/Desktop/pos-1/apps/store-app/src/contexts/OfflineDataContext.tsx`: (a) change `const [canUndo, setCanUndo] = useState(() => !!localStorage.getItem('last_undo_action'))` to use `sessionStorage` + `UNDO_STORAGE_KEY` imported from `undoOperations.ts`; (b) change `pushUndo` to write to `sessionStorage` using the same key; (c) change `checkUndoValidity` to read/remove from `sessionStorage` using the same key. Confirm no `localStorage` reference to `last_undo_action` remains in this file.
- [X] T021 [US4] In `/home/janky/Desktop/pos-1/apps/store-app/src/components/common/UndoToastManager.tsx`, change the `localStorage.getItem('last_undo_action')` read inside the `useEffect` to `sessionStorage.getItem(UNDO_STORAGE_KEY)` (import the constant from `../../contexts/offlineData/operations/undoOperations`). Confirm no remaining `localStorage` reference in this file.

**Checkpoint**: Multi-tab isolation and session-scope verified. Run quickstart.md US4-1 and US4-2.

---

## Phase 7: User Story 5 — Graceful handling of corrupted or unexpected undo state (Priority: P3)

**Goal**: Corrupt storage, unknown tables, or legacy table names are handled silently — no uncaught errors, undo button disables itself.

**Independent Test**: Execute quickstart.md US5-1, US5-2, US5-3. No red errors in console; `canUndo=false` after corruption.

### Implementation for User Story 5

- [X] T022 [US5] In `/home/janky/Desktop/pos-1/apps/store-app/src/contexts/OfflineDataContext.tsx`, import `TABLE_NAME_MAP` from `./offlineData/operations/undoOperations` and use it inside `checkUndoValidity`: compute `const tableName = TABLE_NAME_MAP[item.table as keyof typeof TABLE_NAME_MAP] ?? item.table` before the Dexie `get()` call (research.md D12; spec FR-006).
- [X] T023 [US5] In the same file, wrap the entire body of `checkUndoValidity` in `try { ... } catch (error) { console.error('checkUndoValidity failed:', error); sessionStorage.removeItem(UNDO_STORAGE_KEY); setCanUndo(false); }`. Also guard against an unknown table by checking `(getDB() as any)[tableName]` is truthy before calling `.get()`; on unknown table, `console.warn`, clear storage, `setCanUndo(false)`, and return (research.md D5; spec FR-012, FR-020).
- [X] T024 [US5] In `/home/janky/Desktop/pos-1/apps/store-app/src/contexts/offlineData/operations/undoOperations.ts`, make sure the existing outer `try/catch` in `undoLastAction` logs `action.type` and the affected table list (not row contents) on failure — adjust the `console.error('Undo failed:', error)` line to include `{ type: action?.type, tables: action?.affected?.map(a => a.table) }` (spec FR-020).

**Checkpoint**: Corrupt / legacy payloads no longer crash. Run quickstart.md US5.

---

## Phase 8: Polish & Cross-Cutting Concerns

**Purpose**: Finalize guards, verify no regressions, and optionally add unit tests.

- [X] T025 In `/home/janky/Desktop/pos-1/apps/store-app/src/contexts/OfflineDataContext.tsx`, guard `testUndo` with `import.meta.env.DEV`. Change the definition to `const testUndo = import.meta.env.DEV ? () => { pushUndo({ type: 'test', affected: [], steps: [] }); } : undefined;` and confirm the context value still type-checks (the contract already declares `testUndo?: () => void`). Spec FR-019, research.md D11.
- [X] T026 [P] In `/home/janky/Desktop/pos-1/apps/store-app/src/contexts/OfflineDataContext.tsx`, verify the default context value (around line 881) and the provided value (around line 1041) both still compile with the widened `UndoStep.op` union and the updated `testUndo` type. Make minimal adjustments if TypeScript complains.
- [ ] T027 [P] (Optional — add only if Vitest coverage is desired for this refactor) Create `/home/janky/Desktop/pos-1/apps/store-app/src/contexts/offlineData/operations/__tests__/undoOperations.test.ts` with focused Vitest cases covering: (a) `update` step preserves `operation='create'` row; (b) `restore` step enqueues `operation='create'` row; (c) `add` step enqueues `operation='create'` row; (d) validity check skips existence check for `restore`/`add` targets; (e) legacy `suppliers`/`customers` affected entries resolve via `TABLE_NAME_MAP`; (f) unknown table returns `false` without throwing. Use `fake-indexeddb` if already present or Dexie's in-memory mode; otherwise mark this task SKIP and document in the PR description. **SKIP** (optional; not added in this pass).
- [X] T028 Run `pnpm -C /home/janky/Desktop/pos-1/apps/store-app lint` to confirm no new ESLint errors were introduced.
- [X] T029 Run `pnpm -C /home/janky/Desktop/pos-1/apps/store-app test:run` to confirm existing tests still pass (plus any new tests from T027).
- [X] T030 Run `pnpm -C /home/janky/Desktop/pos-1/apps/store-app build` to confirm the production bundle builds cleanly with the new code (includes the `import.meta.env.DEV` guard on `testUndo`).
- [ ] T031 Execute the full quickstart.md script (US1 → US5) in a real browser against a Supabase instance. Record pass/fail per scenario. Any FAIL must be fixed before merging.
- [X] T032 Manually verify the constitution's CG-02 boundary is not breached: `UndoToastManager.tsx` imports from `contexts/` and `i18n/` only — no `lib/db` or `lib/supabase`. The undo executor in `operations/undoOperations.ts` may import `lib/db` (service layer), which is allowed.

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: No dependencies. Run T001–T002 first.
- **Foundational (Phase 2)**: Depends on Setup. T003 (type widening) and T004 (shared constants) must both complete before any user story begins.
- **US1 (Phase 3)**: Depends on Foundational. Unblocks MVP.
- **US2 (Phase 4)**: Depends on Foundational. Can run in parallel with US1 by a different engineer (they edit the same file — `undoOperations.ts` — so tasks within these two phases cannot be split between authors; serialize at the file level).
- **US3 (Phase 5)**: Depends on Foundational. i18n tasks (T011–T013) are parallel-friendly; UndoToastManager edits (T014–T018) serialize on one file.
- **US4 (Phase 6)**: Depends on Foundational **and** US1/US2 (because it touches the same functions in the same files — easiest to land after US1/US2 are done to avoid merge churn). T019, T020, T021 touch three distinct files and can run in parallel.
- **US5 (Phase 7)**: Depends on US4 (T022–T024 touch files after they've switched to `sessionStorage`).
- **Polish (Phase 8)**: Depends on all user stories being complete.

### Within Each User Story

- US1: T005 → T006 → T007 → T008 → T009 (all in the same file; serial edits to avoid conflict).
- US2: T010 (single task).
- US3: T011 / T012 / T013 in parallel, then T014 → T015 → T016 → T017 → T018 serial (same file).
- US4: T019 / T020 / T021 in parallel (three different files).
- US5: T022 → T023 (same file) → T024 (different file; can overlap with T022/T023).

### Parallel Opportunities

- **T002** is parallel-safe with T001.
- **T011, T012, T013** (i18n files) can be done concurrently.
- **T019, T020, T021** can be done concurrently (different files).
- **T026, T027** in Polish are parallel-safe with each other.
- Cross-story parallelism is limited because three phases (US1, US2, US3 [part], US4 [part], US5 [part]) all edit `undoOperations.ts` and/or `OfflineDataContext.tsx` — merge pain outweighs speed gains.

---

## Parallel Example: User Story 3 i18n tasks

```bash
# Launch the three locale edits together:
Task: "Add common.labels.undoActions key set to apps/store-app/src/i18n/locales/en.ts"
Task: "Add common.labels.undoActions key set to apps/store-app/src/i18n/locales/ar.ts"
Task: "Add common.labels.undoActions key set to apps/store-app/src/i18n/locales/fr.ts"
```

## Parallel Example: User Story 4 storage switch

```bash
# Three distinct files — switch to sessionStorage concurrently:
Task: "Switch undoOperations.ts storage reads/writes to sessionStorage"
Task: "Switch OfflineDataContext.tsx undo storage to sessionStorage"
Task: "Switch UndoToastManager.tsx storage read to sessionStorage"
```

---

## Implementation Strategy

### MVP First (US1 only)

1. Phase 1 (Setup: T001–T002).
2. Phase 2 (Foundational: T003, T004).
3. Phase 3 (US1: T005–T009).
4. **STOP and VALIDATE** against quickstart.md US1-1, US1-2, US1-3.
5. Deploy/demo if ready — this closes the most severe data-loss bug.

### Incremental Delivery

1. Setup + Foundational → foundation ready.
2. Add US1 → verify → **merge as MVP**.
3. Add US2 → verify → merge.
4. Add US3 → verify → merge.
5. Add US4 → verify → merge.
6. Add US5 → verify → merge.
7. Polish phase → lint, build, full quickstart.

### Parallel Team Strategy

- With one engineer: follow priority order strictly (US1 → US2 → US3 → US4 → US5).
- With two engineers: after Foundational, engineer A takes US1+US2 (both in `undoOperations.ts`), engineer B takes US3 (i18n + `UndoToastManager.tsx`). US4 requires coordination because it touches files owned by both. US5 picks up after US4 merges.

---

## Notes

- Tests are optional (T027). Existing codebase has no Vitest coverage of the undo subsystem; this spec does not mandate adding any, but T027 is offered for teams that want it.
- Every behavior change is traceable back to an FR-### or SC-### in spec.md and a D# decision in research.md.
- No constitution gates are triggered; no IndexedDB version bump; no Supabase migration; no new dependencies.
- Commit after each task or at logical story boundaries. Commit messages should reference the task ID (e.g., `fix(undo): restore pending_syncs outbox on restore step [T007]`).
- Stop at any checkpoint to validate the story independently before proceeding.
