---
description: "Task list for feature 017 — Sync Upload Currency Guards, Admin Balance-Migration Cleanup, and Multi-Currency Parity Coverage"
---

# Tasks: Sync Upload Currency Guards, Admin Balance-Migration Cleanup, and Multi-Currency Parity Coverage

**Input**: Design documents from `/specs/017-currency-sync-guards-parity/`
**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/ (all present)
**Tests**: Vitest tasks are MANDATORY because (a) constitution CG-12 requires test coverage for any new/modified file under `services/` and `contexts/offlineData/operations/`, (b) `syncUpload.ts` is on the constitution's sync-critical file list and any change requires `pnpm parity:gate` to pass at merge, and (c) the spec's measurable success criteria (SC-001…SC-007) name the test types directly.
**Organization**: Tasks are grouped by user story so each story can be implemented, tested, and reviewed independently. US1 (sync guard) and US2 (parity fixtures) are both P1 and can run in parallel after Phase 1.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies on incomplete tasks).
- **[Story]**: Which user story this task belongs to (US1, US2, US3, US4). Setup, Foundational, and Polish tasks have no story label.
- File paths are absolute from repo root at `C:/Users/User/Desktop/pos/` (use forward slashes; Bash on Windows).

## Path Conventions

- Monorepo with three workspaces. This feature touches:
  - **store-app**: `apps/store-app/src/services/` + `apps/store-app/tests/sync-parity/`
  - **admin-app**: `apps/admin-app/src/services/`
  - **shared package**: `packages/shared/` — read-only consumption (CurrencyCode, CURRENCY_META).
- Vitest tests are colocated under each modified service's `__tests__/` directory per the existing convention.

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Verify the prerequisite specs (013/014/015 plus phase 6/7 of spec 016) are merged on this branch and the consumed APIs exist. No new dependencies needed.

- [X] T001 Verify `@pos-platform/shared` exports `CurrencyCode` and `CURRENCY_META` from `packages/shared/src/types/index.ts`. Fail the feature early if either is missing. Record the verification as a one-line "Pre-flight" comment at the top of `specs/017-currency-sync-guards-parity/research.md` (the heading already exists from spec authorship).
- [X] T002 [P] Verify `apps/store-app/src/types/database.ts` declares `inventory_items.Insert.currency: CurrencyCode` and `transactions.Insert.currency: CurrencyCode` (both required, both `CurrencyCode`). Fail early if a `CurrencyCode | undefined` or legacy `'USD' | 'LBP'` literal remains.
- [X] T003 [P] Verify `apps/admin-app/src/services/storeService.ts` exposes a function (any name — likely `getStoreById` or equivalent) that returns a store row including `preferred_currency`. Document the exact import path discovered in a one-line note appended to `research.md` under R2, so US3's resolver implementation has zero ambiguity at coding time.
- [X] T004 [P] Run `pnpm parity:gate` once on the unchanged branch and record the result (pass/fail, runtime) in a "Pre-flight" line in `research.md`. This establishes the green baseline that US2 must preserve and US1 must not regress.

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Inspect the parity-test infrastructure so US2 has zero surprises during fixture extension. No production code touched in this phase.

**⚠️ CRITICAL**: US2 may not begin until T005 + T006 are complete. US1, US3, US4 do not depend on this phase and may begin immediately after Phase 1.

- [X] T005 Inspect `apps/store-app/tests/sync-parity/parityFieldRegistry.ts` to confirm `country` and `accepted_currencies` are listed (or can be added) for the `stores` table without changing the registry's structural contract. If they are absent, add them to the registry as a separate small commit *before* T013 (US2 fixture extension) runs. Record the outcome in `research.md` under a new "Phase 2 inspection" subsection.
- [X] T006 [P] Inspect `apps/store-app/tests/sync-parity/paritySupabaseMock.ts` and `parityNormalizer.ts`. Confirm neither strips `country` or `accepted_currencies` from store-row payloads on round-trip. If either does, file the exact line number and required fix in `research.md` "Phase 2 inspection" — but do not edit the file in this task; the fix lands in T013 if needed.

**Checkpoint**: Parity infrastructure verified. US2 can now safely extend fixtures without regression risk.

---

## Phase 3: User Story 1 — Sync upload refuses to publish records with missing or unknown currency (Priority: P1) 🎯 MVP

**Goal**: A pre-upload validator rejects `inventory_items` and `transactions` records whose `currency` is missing or not in `CURRENCY_META`, before they reach Supabase. Failed records stay in local Dexie (preserved, not deleted), are recorded in a per-cycle in-memory error list, are logged via `comprehensiveLoggingService.warn`, and never enter a retry loop. The existing `record.currency || 'USD'` fallback at the event-emission site is removed.

**Independent Test**: Per quickstart Scenario A — insert a poisoned `inventory_items` row with `currency: undefined`, trigger `syncService.uploadOnly()`, observe zero Supabase requests for that row, observe one warn-log entry with `reason: 'invalid-currency'`, and observe Dexie row preserved with `_synced: false`.

### Tests for User Story 1 ⚠️

> Write tests FIRST; ensure they FAIL before implementation.

- [X] T007 [P] [US1] Add Vitest suite `apps/store-app/tests/syncUpload.currency.test.ts` covering the pure `validateRecordCurrency(tableName, record)` helper: (a) `tableName='inventory_items'` + `currency: undefined` → `{ ok: false, reason: 'invalid-currency', attemptedValue: undefined }`; (b) `tableName='transactions'` + `currency: 'XYZ'` → `{ ok: false, reason: 'unknown-currency', attemptedValue: 'XYZ' }`; (c) `tableName='inventory_items'` + `currency: 'USD'` → `{ ok: true }`; (d) `tableName='transactions'` + `currency: 'AED'` → `{ ok: true }`; (e) `tableName='bills'` (not guarded) + `currency: undefined` → `{ ok: true }`; (f) soft-delete bypass: `tableName='inventory_items'` + `currency: undefined` + `is_deleted: true` → `{ ok: true }`; (g) soft-delete bypass via `_deleted: 1`. Pure-function semantics: assertion that no Dexie/Supabase imports are used.
- [X] T008 [P] [US1] In the same suite, add the batch-partition tests: (a) batch of one valid + one missing-currency `inventory_items` row → exactly one Supabase upsert request received by mock, error list contains exactly one entry referencing the corrupt row's id, both Dexie rows still queryable; (b) batch of three records (one valid, one missing, one unknown) → one upsert, two error-list entries with distinct reasons; (c) cross-table: a poisoned `transactions` row and a clean `inventory_items` row in the same cycle → both tables process independently, only the poisoned row is rejected.
- [X] T009 [P] [US1] In the same suite, add the stability-and-recovery tests: (a) invoke `uploadOnly()` three times against the same poisoned row; assert zero Supabase upserts for that row across all three; assert error list has exactly one entry per invocation (cleared and rebuilt each cycle); assert no `setTimeout`/retry-queue entries are added. (b) Between cycles, fix the row (`db.inventory_items.update(id, { currency: 'USD' })`); next `uploadOnly()` produces one successful upsert and `_synced: true`.

### Implementation for User Story 1

- [X] T010 [US1] Add the `validateRecordCurrency(tableName, record)` pure function to `apps/store-app/src/services/syncUpload.ts`, colocated with `isUnrecoverableError`. Implement per `contracts/upload-currency-guard.contract.md` §1: synchronous, no I/O, returns `{ ok: true }` for non-guarded tables and soft-deletes; returns `{ ok: false, reason, attemptedValue }` otherwise. Export only as needed for tests via a clearly test-named accessor.
- [X] T011 [US1] Add the per-cycle error list as a module-level `let currencyErrorList: UploadCurrencyError[] = []` reset at the top of `uploadOnly()` in the same file. Add an internal-only getter `getCurrencyErrorListForTesting()` (named to make any production import a code-smell) returning a defensive copy. Define the `UploadCurrencyError` type per `data-model.md`.
- [X] T012 [US1] Wire the validator into the upload pipeline in `syncUpload.ts`: before each batch's `cleanedBatch.upsert` call, partition `cleanedBatch` against `validateRecordCurrency`. For invalid records: append to `currencyErrorList`, emit one `comprehensiveLoggingService.warn(...)` line with `{ table, recordId, reason, attemptedValue }`, do NOT call `deleteProblematicRecord`, do NOT call `addPendingSync`, leave the Dexie row untouched. Continue the upload pipeline with only the valid partition. Apply this wiring to both `inventory_items` and `transactions` upload paths only — other tables are unaffected.
- [X] T013 [US1] In the same `syncUpload.ts`, locate the event-emission block at line ~783 reading `record.currency || 'USD'`. Replace the `|| 'USD'` fallback by reading `record.currency` directly. The guard upstream (T012) ensures only validated records reach this point; the fallback is dead code. If the TypeScript compiler cannot prove the narrowing through the partition pattern, add a runtime `if (!record.currency) throw new Error(...)` immediately before the emission line — that throw must never fire in practice and exists solely to give the type-checker the narrowing.
- [X] T014 [US1] Run the new Vitest suite (T007–T009) and confirm it now passes (turn-the-test-from-red-to-green checkpoint per CG-12). If any test fails, fix the implementation in T010–T013 (do not weaken the test).

**Checkpoint**: Sync upload guard fully functional. Quickstart Scenarios A, B, C should pass against a local dev build.

---

## Phase 4: User Story 2 — QA gate covers non-Lebanon stores (Priority: P1)

**Goal**: Every parity-test fixture store row carries `country` and `accepted_currencies`; at least one new scenario exercises a UAE store with `country='AE'`, `preferred_currency='AED'`, `accepted_currencies=['AED','USD']`, and inventory + transaction rows priced in AED. The golden snapshot is regenerated, reviewed, and committed in a single atomic commit before US1 implementation lands.

**Independent Test**: Per quickstart Scenario G — `pnpm parity:gate` exits 0; the new UAE scenario is visible in `paritySync.scenarios.test.ts`; the golden snapshot contains AED entries; injecting a hypothetical AED→USD coercion in `syncUpload.ts` makes the gate fail at exactly the UAE scenario.

### Implementation for User Story 2

> US2 has no Vitest unit tests — its tests are the parity scenarios themselves, which are added in T015–T017. Per research.md R3, the fixture changes and golden regeneration ship as a single commit *before* US1 production code lands so any subsequent gate diff is attributable.

- [X] T015 [P] [US2] Extend the fixture builder in `apps/store-app/tests/sync-parity/paritySync.scenarios.test.ts` to set `country` and `accepted_currencies` on every existing `db.stores.put({...})` call. Defaults: if existing fixture has `preferred_currency: 'LBP'` → `country='LB'`, `accepted_currencies=['LBP','USD']`; if it has `preferred_currency: 'USD'` → `country='LB'`, `accepted_currencies=['LBP','USD']` (per research.md R3 — preserve historic Lebanese-by-implication semantic). Apply identical treatment to `apps/store-app/tests/sync-parity/paritySync.chaos.test.ts` and any other parity test that constructs store rows.
- [X] T016 [P] [US2] Apply the same fixture extension to any helper that constructs store rows (e.g. `tests/sync-parity/parityEnv.ts`, `setup.ts`, or shared scenario factories — discovered during T015). The contract is that no fixture-built store row anywhere in `tests/sync-parity/` may omit `country` or `accepted_currencies`.
- [X] T017 [US2] Add a new scenario to `apps/store-app/tests/sync-parity/paritySync.scenarios.test.ts` named clearly (e.g. `it('round-trips a UAE store with AED inventory and transactions', ...)`). The scenario MUST: (a) seed a store fixture with `country='AE'`, `preferred_currency='AED'`, `accepted_currencies=['AED','USD']`, `exchange_rate=3.6725`; (b) seed at least one `inventory_items` row with `currency='AED'`, `selling_price=18.50`; (c) seed at least one `transactions` row with `currency='AED'`, non-trivial `amount`; (d) execute the same upload-then-snapshot flow as the existing scenarios; (e) include a hardcoded assertion `expect(snapshot.inventory_items[0].currency).toBe('AED')` so a future "everything-to-USD" coercion fails as a clear single-line test failure (not noisy snapshot diff). See `contracts/parity-fixture.contract.md` §3 + §6.
- [X] T018 [US2] Regenerate the golden snapshot. Run the project's parity update command (likely `pnpm parity:gate -- -u` or `pnpm parity:gate -- --update-snapshots`; confirm the exact flag from `apps/store-app/scripts/parity-check-*.mjs` and document it in `research.md` Phase 2 inspection). Inspect the diff: existing scenarios should only gain `country`/`accepted_currencies` fields; existing `inventory_items`/`transactions` rows must be byte-identical. The new UAE scenario adds entirely new entries. Any *unexpected* diff in existing rows is a red flag — investigate before committing.
- [X] T019 [US2] Run `pnpm parity:gate` (no update flag) and confirm it exits 0 against the regenerated golden. This is the binding gate per FR-015.
- [ ] T020 [US2] Commit T015–T019 as a single atomic commit titled e.g. "Phase 9 — multi-currency parity fixtures + UAE scenario (017)". This commit lands *before* the US1 production code commits so the parity diff is isolated to fixture changes (research.md R3).

**Checkpoint**: Parity gate now exercises a non-Lebanon store. Quickstart Scenario G should pass against this commit.

---

## Phase 5: User Story 3 — Admin opening-balance migration uses target store's currency (Priority: P2)

**Goal**: `balanceMigrationService.executeMigration()` resolves the migration currency from (1) explicit override, then (2) the cached `session.preferredCurrency`, then (3) a one-time fetch of the store row from Supabase reading `preferred_currency`, then (4) a thrown descriptive error. The hardcoded `currency = 'LBP'` default is removed. Public method signatures retype `currency: 'USD' | 'LBP'` → `currency: CurrencyCode` (or `currency?: CurrencyCode` where the resolver fills the gap). After this story, no `'USD' | 'LBP'` literal type union appears anywhere in the file.

**Independent Test**: Per quickstart Scenarios D and E — for a UAE store (`preferred_currency='AED'`), migration without an override produces `journal_entries` rows with `currency='AED'`; for a store with `preferred_currency=null`, migration throws a descriptive error before any RPC call.

### Tests for User Story 3 ⚠️

> Write tests FIRST; ensure they FAIL before implementation.

- [X] T021 [P] [US3] Add or extend Vitest suite `apps/admin-app/src/services/__tests__/balanceMigrationService.test.ts` covering `resolveMigrationCurrency`: (a) explicit override path: pass `currency: 'USD'` even when session/store says AED → returns `'USD'`; store fetch is NOT called. (b) cached path: pre-set `session.preferredCurrency = 'AED'`, call without override → returns `'AED'`; store fetch is NOT called. (c) lazy-fetch path: clean session, stub `storeService.getStoreById` to return `{ preferred_currency: 'AED' }` → returns `'AED'`, populates `session.preferredCurrency = 'AED'`; second call within same session triggers zero additional store fetches.
- [X] T022 [P] [US3] In the same suite, add the throw-path test: clean session, stub `storeService.getStoreById` to return `{ preferred_currency: null }` (or omit the field) → `resolveMigrationCurrency` rejects with an Error whose message names both the store id and the missing-`preferred_currency` reason. `session.preferredCurrency` remains unset (so a subsequent retry re-attempts).
- [X] T023 [P] [US3] Add the end-to-end migration tests: (a) `executeMigration()` for a UAE store fixture with no override → every `migrate_opening_balance` RPC stub call receives `p_currency: 'AED'`; (b) same with explicit override `currency: 'USD'` → every RPC call receives `p_currency: 'USD'`; (c) executeMigration for a store with `preferred_currency: null` → rejects with the descriptive error from T022, no RPC calls made (check call count = 0 on the stub), no `journal_entries` side-effects.
- [X] T024 [P] [US3] Add a TypeScript-level signature test to the same file: use `expectTypeOf` (from Vitest) or a structural type-only check to assert that the `options.currency` parameter on `executeMigration` is `CurrencyCode | undefined`, not `'USD' | 'LBP'`. This is a compile-time assertion that catches signature regressions even if runtime tests pass.

### Implementation for User Story 3

- [X] T025 [US3] In `apps/admin-app/src/services/balanceMigrationService.ts`, add the private helper `private async resolveMigrationCurrency(session: MigrationSession, override: CurrencyCode | undefined): Promise<CurrencyCode>` per `contracts/balance-migration-currency.contract.md` §1. Resolution order: override → cached → fetch + cache → throw. Implement using whichever store-fetching API was identified in T003.
- [X] T026 [US3] In the `MigrationSession` interface (same file), add the optional `preferredCurrency?: CurrencyCode` cache field per `data-model.md`. Do NOT add it to the persisted `getStoredSessions()`/`saveSessions()` shape — the cache is in-memory only.
- [X] T027 [US3] Replace every public-method signature in `balanceMigrationService.ts` that currently uses `'USD' | 'LBP'` with `CurrencyCode`. Specifically: `executeMigration(...).options.currency`, `executeBulkMigration(..., currency, ...)`, `migrateOpeningBalance(..., currency, ...)`, and the `MigrationRPCResult.currency` field if so typed. Import `CurrencyCode` from `@pos-platform/shared`.
- [X] T028 [US3] In `executeMigration`, remove the destructuring default `currency = 'LBP'`. The new line reads `const { useBulk = false } = options;`. Immediately after, call `const resolvedCurrency = await this.resolveMigrationCurrency(session, options.currency);` and pass `resolvedCurrency` to all downstream calls (`executeBulkMigration`, `migrateOpeningBalance`).
- [X] T029 [US3] Run the new Vitest suite (T021–T024) and confirm green. Address any failures by fixing the implementation, not the tests.

**Checkpoint**: Admin migration auto-resolves the correct currency per store. Quickstart Scenarios D and E should pass.

---

## Phase 6: User Story 4 — Subscription-billing literal documented as intentional (Priority: P3)

**Goal**: A comment immediately above `subscriptionService.ts:117` (`currency: 'USD',`) names "subscription"/"subscriptions", "always USD" or equivalent ("global"/"intentional"), and references either spec 008 Task 15 or feature 017. No behavior changes.

**Independent Test**: Per quickstart Scenario F — the line is found by grep, the comment above it satisfies all three content invariants, admin-app tests still pass.

### Implementation for User Story 4

- [X] T030 [US4] In `apps/admin-app/src/services/subscriptionService.ts`, locate the line containing `currency: 'USD',` (around line 117). Add a 1–2 line comment immediately above it per `contracts/balance-migration-currency.contract.md` §6. Suggested wording: `// Subscriptions are billed in USD globally regardless of the store's local currency. Intentional — see spec 008 Task 15 / feature 017.` (Wording is non-prescriptive — the contract enforces the *content* invariants only.)

**Checkpoint**: Subscription literal is now self-documenting against future "cleanup" PRs. Quickstart Scenario F should pass.

---

## Phase 7: Polish & Cross-Cutting Concerns

**Purpose**: Repository-wide audits, build/lint gates, parity-gate final run, and quickstart execution. These run after all user stories are complete.

- [X] T031 [P] Repository grep audit (FR-017, SC-006): from repo root, run `grep -nE "\\|\\| 'USD'|\\|\\| 'LBP'|\\?\\? 'USD'|\\?\\? 'LBP'" apps/store-app/src/services/syncUpload.ts apps/admin-app/src/services/balanceMigrationService.ts`. Expected: empty. If non-empty, fix the offending line and re-run. Record the empty-grep result in a new "Audit log" section at the bottom of `research.md`.
- [X] T032 [P] Repository grep audit (FR-018): from repo root, run `grep -nE "'USD' \\| 'LBP'" apps/admin-app/src/services/balanceMigrationService.ts`. Expected: empty. If hits remain, replace with `CurrencyCode` import in-place.
- [X] T033 [P] Run `pnpm --filter store-app build` and confirm zero new TypeScript errors (SC-009 gate). Pre-existing warnings in untouched files are out of scope.
- [X] T034 [P] Run `pnpm --filter admin-app build` and confirm zero new TypeScript errors (SC-009 gate).
- [X] T035 [P] Run `pnpm --filter store-app test:run` (or the project's equivalent single-run command) and confirm all Vitest suites pass — including the three new/extended suites at T007–T009 and T021–T024.
- [X] T036 Run `pnpm parity:gate` one final time after all production code changes have landed. Confirm exit 0 (FR-015 / SC-005). If the gate fails: the regression is in US1 production code (US2 was committed atomically before US1). Investigate and fix before merging.
- [ ] T037 Execute every quickstart scenario (A–H) against a local dev build per `specs/017-currency-sync-guards-parity/quickstart.md`. Tick the verification table in that file as each scenario completes. Any failure opens a sub-task; do not merge with an unticked cell.
- [ ] T038 [P] Run `pnpm lint` and resolve any new lint errors introduced by this feature. Existing warnings in untouched files are out of scope. _(2026-04-26: `tests/syncUpload.currency.test.ts` is clean; full `pnpm --filter store-app lint` still reports many pre-existing issues repo-wide.)_
- [ ] T039 Commit the polish/audit changes (if any beyond doc updates) with a descriptive message referencing Feature 017 and phases 8/9 of Task 008. Push the branch. Open the PR with the description cross-linking specs 013/014/015/016 as merged prerequisites and noting that Phase 9 fixtures shipped in an earlier atomic commit on this same branch.

---

## Dependencies & Execution Order

### Phase Dependencies

- **Phase 1 (Setup)**: No dependencies. Can start immediately.
- **Phase 2 (Foundational)**: Depends on Phase 1. Blocks **only US2**; US1, US3, US4 do not depend on Phase 2.
- **Phase 3 (US1)**: Depends on Phase 1. Independent of US2 / US3 / US4.
- **Phase 4 (US2)**: Depends on Phase 1 + Phase 2. **Must commit before** Phase 3's production code lands (research.md R3) so the parity-gate diff is attributable.
- **Phase 5 (US3)**: Depends on Phase 1. Independent of US1 / US2 / US4. Touches admin-app only.
- **Phase 6 (US4)**: Depends on Phase 1. Trivial; can land at any time.
- **Phase 7 (Polish)**: Depends on all desired user stories complete.

### User Story Dependencies

- **US1** and **US2** both P1. Independent. US2 lands first (atomic commit) per the research-driven sequencing in plan.md.
- **US3** P2, fully independent — different app workspace.
- **US4** P3, trivial — comment-only.

### Within Each User Story

- Tests (T007–T009 for US1; T021–T024 for US3) MUST be written and FAIL before implementation tasks (T010–T013, T025–T028) are run. CG-12 binding.
- For US2, the "test" is the parity gate itself (T019). Fixture extension (T015–T017) precedes golden regen (T018) precedes gate verification (T019) precedes commit (T020).
- For US4, the "test" is the manual verification in quickstart Scenario F (T037 picks this up).

### Parallel Opportunities

- T002, T003, T004 (Phase 1) can run in parallel with each other.
- T005 + T006 (Phase 2) can run in parallel.
- T007, T008, T009 (US1 tests) can run in parallel — different file regions but same suite; if your editor doesn't conflict, they can be authored together.
- T015, T016 (US2 fixture extension) can run in parallel — different files.
- T021, T022, T023, T024 (US3 tests) can run in parallel — different test cases in the same file.
- T031, T032, T033, T034, T035, T038 (polish audits) can all run in parallel.
- After Phase 1: US1, US3, US4 can be worked on in parallel by different developers. US2 can run in parallel after Phase 2.

---

## Parallel Example: User Story 1 tests

```bash
# After T010–T013 implementation lands, all three test tasks operate on the same suite file
# but cover different test groups (validator, batch, stability). Author them in one editor
# session for cohesion, then run together:
pnpm --filter store-app test:run -- syncUpload.currency
```

## Parallel Example: Polish phase

```bash
# All audit/build/test gates can run in parallel terminals on a multi-core dev machine:
pnpm --filter store-app build &
pnpm --filter admin-app build &
pnpm --filter store-app test:run &
pnpm parity:gate &
wait
```

---

## Implementation Strategy

### MVP (single-developer path)

If shipping minimum viable: ship **US2 (Phase 4) + US1 (Phase 3)** as the MVP. The other two stories (US3 admin-app correctness, US4 subscription comment) are P2/P3 and can land in a follow-up PR without weakening the multi-currency invariants this feature is gating against. The MVP is roughly 12 tasks (T001 + T004 + T005–T020) and should be completable in one focused session.

### Full feature (recommended)

Sequence: T001 → T002/T003/T004 (parallel) → T005/T006 (parallel) → US2 (T015–T020) **as one atomic commit** → US1 (T007–T014) **as one or two commits** → US3 (T021–T029) → US4 (T030) → Polish (T031–T039). This sequencing isolates the parity-snapshot diff to fixture changes only, makes any post-US1 parity failure attributable to real sync regressions, and keeps each commit reviewable in isolation.

### Parallel team path

If staffed across two developers: Dev A takes US1 + US4 (sync-engine + subscription comment, store-app focus). Dev B takes US2 + US3 (parity fixtures + admin migration). They synchronize at T036 (final parity gate run) and T037 (quickstart). Polish phase (T031–T039) is a final shared sweep.

---

## Format Validation

Confirm before merging:

- [ ] Every task above starts with `- [ ]` checkbox.
- [ ] Every task has a sequential ID (T001…T039).
- [ ] [P] markers are present only where two tasks operate on different files with no incomplete-task dependency.
- [ ] [Story] labels (`[US1]`, `[US2]`, `[US3]`, `[US4]`) are present on every task within Phase 3–6, and absent from Phase 1, 2, and 7.
- [ ] Every task description includes an exact file path (or absence is justified — e.g. T001 records into `research.md`).
- [ ] Every user story phase has at least one independent-test mechanism (Vitest suite for US1/US3, parity scenario for US2, manual quickstart for US4).
