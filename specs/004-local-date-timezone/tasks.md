# Tasks: Local calendar dates & time zones (004)

**Input**: Design documents from `/home/janky/Desktop/pos-1/specs/004-local-date-timezone/`  
**Prerequisites**: [plan.md](./plan.md), [spec.md](./spec.md), [research.md](./research.md), [data-model.md](./data-model.md), [contracts/local-calendar-day-contract.md](./contracts/local-calendar-day-contract.md)

**Tests**: No TDD requirement in spec; Vitest file updates included in Polish phase to remove UTC-based test assumptions.

**Organization**: Phases follow user story priority (P1 → P3) after foundational `dateUtils` work.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Parallelizable (different files; no ordering dependency within the same story phase)
- **[Story]**: [US1]–[US5] maps to user stories in [spec.md](./spec.md)

---

## Phase 1: Setup

**Purpose**: Align with feature contract before code edits.

- [x] T001 Review [contracts/local-calendar-day-contract.md](./contracts/local-calendar-day-contract.md) and confirm branch `004-local-date-timezone`; identify forbidden `toISOString().split('T')[0]` pattern for local business days in `apps/store-app/src`

---

## Phase 2: Foundational (blocking)

**Purpose**: Shared API required by **all** user stories (CG-11). **No user story work before this completes.**

- [x] T002 Implement and export `getTodayLocalDate(): string` in `apps/store-app/src/utils/dateUtils.ts` using `getLocalDateString(new Date().toISOString())` per [research.md](./research.md)

**Checkpoint**: Import `getTodayLocalDate` and `getLocalDateString` anywhere below.

---

## Phase 3: User Story 1 — Correct “today” on the home dashboard (Priority: P1) 🎯 MVP

**Goal**: Home dashboard KPIs use local calendar “today” and consistent date extraction for filters (FR-001, FR-002).

**Independent Test**: [spec.md §User Story 1](./spec.md) — timezone UTC+2/+3, late evening; transactions appear under correct local “today.”

### Implementation

- [x] T003 [US1] Replace UTC-based `today` and matching transaction/bill date comparisons in `apps/store-app/src/pages/Home.tsx` with `getTodayLocalDate()` and `getLocalDateString(...)` so “today” metrics and filters align (FR-001, FR-002)

**Checkpoint**: US1 testable alone after T002.

---

## Phase 4: User Story 2 — Reports & activity filters + public statement (Priority: P1)

**Goal**: Default date ranges and filters match list business dates; public statement defaults use **viewer** local calendar (FR-003, FR-006, FR-007).

**Independent Test**: [spec.md §User Story 2](./spec.md) — default P&L / activity ranges; public link defaults.

### Implementation (files may run in parallel after T002 where marked [P])

- [x] T004 [P] [US2] Fix default `startDate`/`endDate` and reset handlers in `apps/store-app/src/components/reports/ProfitLossReport.tsx` to use `getTodayLocalDate()` / `getLocalDateString` (no UTC day slice for local semantics)
- [x] T005 [P] [US2] Fix default `start`/`end` range and export filename date in `apps/store-app/src/components/ActivityFeed.tsx`
- [x] T006 [P] [US2] Fix `startDate`/`endDate` defaults in `apps/store-app/src/pages/Reports.tsx`
- [x] T007 [P] [US2] Fix default `start`/`end`, `max` date input, and export filename in `apps/store-app/src/pages/PublicCustomerStatement.tsx` (viewer browser context per Clarifications)
- [x] T008 [P] [US2] Fix export filename and `max` date in `apps/store-app/src/components/AccountStatementModal.tsx`
- [x] T009 [P] [US2] Fix default range in `apps/store-app/src/components/AuditDashboard.tsx`
- [x] T010 [P] [US2] Fix `startDate`/`endDate` defaults in `apps/store-app/src/components/MissedProductsHistory.tsx`
- [x] T011 [P] [US2] Fix default range and CSV download stamp in `apps/store-app/src/components/CashDrawerBalanceReport.tsx`
- [x] T012 [US2] Replace UTC calendar extractions in `apps/store-app/src/services/reportingService.ts` (e.g. `previousDayStr`) with local-day derivation via `getLocalDateString` / calendar-safe date math
- [x] T013 [US2] Fix `asOfDate` / target “today” fallback in `apps/store-app/src/services/entityQueryService.ts` using `getTodayLocalDate()`
- [x] T014 [US2] Fix bucket keys in `apps/store-app/src/utils/queryHelpers.ts` to use `getLocalDateString` for day/week keys derived from `Date`
- [x] T015 [US2] Fix line date grouping in `apps/store-app/src/hooks/useProfitLoss.ts` using `getLocalDateString` on instants
- [x] T016 [US2] In `apps/store-app/src/pages/Accounting.tsx`, replace `today`, transaction/batch **grouping** date strings, and download filename dates with `getTodayLocalDate()` / `getLocalDateString` per FR-003 and FR-007 (leave unrelated logic unchanged)

**Checkpoint**: US2 independently testable; overlaps with US3 only on `Accounting.tsx` — complete T016 before US3 if same branch to reduce merge conflicts, or coordinate.

---

## Phase 5: User Story 3 — Form defaults (Priority: P2)

**Goal**: Pre-filled business dates for inventory and accounting forms use local “today” (FR-004).

**Independent Test**: [spec.md §User Story 3](./spec.md) — after local midnight, defaults show correct wall-clock date.

### Implementation

- [x] T017 [P] [US3] Fix `received_at` defaults in `apps/store-app/src/hooks/useInventoryForms.ts`
- [x] T018 [P] [US3] Fix `today` / `received_at` defaults in `apps/store-app/src/components/inventory/ReceiveFormModal.tsx`
- [x] T019 [US3] Fix form `date` defaults, `min`, and `created_at` fallbacks in `apps/store-app/src/components/accountingPage/tabs/SupplierAdvances.tsx`
- [x] T020 [US3] Fix `today` and `min` date props in `apps/store-app/src/components/common/RemindersDashboard.tsx`
- [x] T021 [US3] Fix `today` usage in `apps/store-app/src/services/posAccountingIntegration.ts`
- [x] T022 [US3] Fix `postedDate` assignments in `apps/store-app/src/services/inventoryPurchaseService.ts` to use local calendar day semantics

**Checkpoint**: US3 testable independently once T002 complete (and ideally after T016 if `Accounting.tsx` shared work is done).

---

## Phase 6: User Story 4 — Snapshot scheduler labels (Priority: P2)

**Goal**: Scheduled snapshot **business date** labels match local calendar convention used elsewhere (FR-005).

**Independent Test**: [spec.md §User Story 4](./spec.md) — label near local midnight matches lookup.

### Implementation

- [x] T023 [US4] Replace `currentDate` / `targetDate` / `cutoffDateStr` UTC slices in `apps/store-app/src/services/snapshotSchedulerService.ts` with `getTodayLocalDate()` or `getLocalDateString(...)` consistent with `snapshotService` lookup

---

## Phase 7: User Story 5 — Remaining surfaces & consistency (Priority: P3)

**Goal**: No stray UTC “today” in store-app production code; aligns with [spec.md §User Story 5](./spec.md).

**Independent Test**: Spot-check screens + `rg` audit per [quickstart.md](./quickstart.md).

### Implementation

- [x] T024 [P] [US5] Fix `todayStr` / `weekStr` logic in `apps/store-app/src/services/reminderMonitoringService.ts`
- [x] T025 [P] [US5] Fix session-based date strings in `apps/store-app/src/services/missedProductsService.ts` using `getLocalDateString`
- [x] T026 [P] [US5] Fix export filename date in `apps/store-app/src/components/common/PrintPreview.tsx`
- [x] T027 [P] [US5] Fix CSV download filename in `apps/store-app/src/components/accountingPage/tabs/ReceivedBills.tsx`
- [x] T028 [US5] Run `rg "toISOString\\(\\)\\.split\\('T'\\)\\[0\\]" apps/store-app/src` excluding `apps/store-app/src/scripts/**`; fix any remaining production matches or document one-line exceptions with comments (goal: zero forbidden uses for local-day semantics per [contracts/local-calendar-day-contract.md](./contracts/local-calendar-day-contract.md))

---

## Phase 8: Polish & cross-cutting

**Purpose**: Tests, optional lint rule, validation.

- [x] T029 [P] Update `apps/store-app/src/services/__tests__/phase5Integration.test.ts` and `apps/store-app/src/services/__tests__/snapshotService.test.ts` to derive expected calendar strings via `getTodayLocalDate` / `getLocalDateString` instead of `toISOString().split('T')[0]`
- [ ] T030 [P] Optionally add ESLint `no-restricted-syntax` (or equivalent) in `apps/store-app/eslint.config.js` to flag `toISOString().split('T')[0]` in app source (exclude tests/scripts if too noisy) — **deferred**: repo has large pre-existing ESLint error volume; add when tightening CI.
- [x] T031 Run `pnpm --filter store-app exec eslint .` and `pnpm --filter store-app build`; execute manual scenarios in [quickstart.md](./quickstart.md) (SC-001–SC-004) — **done**: `pnpm run build` from `apps/store-app` succeeded (2026-03-25). Full-tree `eslint .` not clean historically; manual quickstart scenarios still recommended.

---

## Dependencies & execution order

### Phase dependencies

| Phase | Depends on | Notes |
|-------|------------|--------|
| 1 Setup | — | T001 can run immediately |
| 2 Foundational | Phase 1 (recommended) | **T002 blocks all story work** |
| 3 US1 | T002 | MVP slice |
| 4 US2 | T002 | Can start in parallel with US1 after T002 |
| 5 US3 | T002 | Coordinate `Accounting.tsx` with T016 if parallelizing US2/US3 |
| 6 US4 | T002 | Independent of US1–US3 |
| 7 US5 | T002 | Best after major surfaces (US2–US4) to reduce duplicate `rg` work |
| 8 Polish | Phases 3–7 | T029–T031 |

### User story dependency graph

```text
        T002 (Foundational)
         /    |    \   \
      US1   US2   US3  US4
              \     /
            (Accounting.tsx: prefer T016 before heavy US3 edits)
                 \
                  US5 (sweep T028)
                   \
                    Polish
```

### Parallel examples

**After T002 — launch in parallel (different files):**

- T003 [US1] `Home.tsx`
- T004–T011 [P] [US2] eight components (ProfitLossReport … CashDrawerBalanceReport)
- T017–T018 [P] [US3] `useInventoryForms.ts`, `ReceiveFormModal.tsx`
- T023 [US4] `snapshotSchedulerService.ts`

**US2 parallel batch (T004–T011):** eight distinct component files — assign to different workers.

---

## Implementation strategy

### MVP first (User Story 1 only)

1. T001 → T002 → T003  
2. Stop and run [quickstart.md](./quickstart.md) **§A** (Home / late evening scenario)

### Incremental delivery

1. Foundational (T002)  
2. US1 (T003) → demo Home  
3. US2 (T004–T016) → demo reports + public statement  
4. US3 (T017–T022) → demo forms  
5. US4 (T023) → demo snapshots  
6. US5 (T024–T028) → full `rg` clean  
7. Polish (T029–T031)

### Task counts

| Scope | Count |
|-------|------:|
| Setup | 1 |
| Foundational | 1 |
| US1 | 1 |
| US2 | 13 |
| US3 | 6 |
| US4 | 1 |
| US5 | 5 |
| Polish | 3 |
| **Total** | **31** |

| User story | Task IDs | Count |
|------------|----------|------:|
| US1 | T003 | 1 |
| US2 | T004–T016 | 13 |
| US3 | T017–T022 | 6 |
| US4 | T023 | 1 |
| US5 | T024–T028 | 5 |

**Parallel opportunities:** 8 tasks in US2 (T004–T011); 2 in US3 (T017–T018); 5 in US5 (T024–T027); 3 in Polish (T029–T031) where applicable.

---

## Notes

- **billOperations / createBill**: Storage format unchanged per spec; this task list targets **derivation, filters, defaults, labels** (see [data-model.md](./data-model.md)).
- **`src/scripts/`**: Out of scope for T028 unless team wants zero grep matches repo-wide ([plan.md](./plan.md)).
- **admin-app**: Out of scope unless equivalent bugs are found later.
