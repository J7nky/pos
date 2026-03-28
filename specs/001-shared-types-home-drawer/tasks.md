# Tasks: Unified data contract and home cash drawer updates

**Input**: Design documents from `/specs/001-shared-types-home-drawer/`  
**Prerequisites**: `plan.md`, `spec.md`, `research.md`, `data-model.md`, `contracts/`, `quickstart.md`  
**Tests**: Not requested in spec — no dedicated test tasks; verification via lint, build, and manual checks in Polish phase.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies on incomplete tasks in the same batch)
- **[Story]**: `US1` = Home cash drawer (P1), `US2` = shared core types (P2)

## Path Conventions

Monorepo: `apps/store-app/`, `apps/admin-app/`, `packages/shared/` under repository root `/home/janky/Desktop/pos-1`.

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Orient on contracts and scope before code changes.

- [x] T001 Review acceptance criteria for User Story 1 in `specs/001-shared-types-home-drawer/spec.md` and `specs/001-shared-types-home-drawer/contracts/home-cash-drawer-view-contract.md`
- [x] T002 Review shared core scope and entities in `specs/001-shared-types-home-drawer/data-model.md` and `specs/001-shared-types-home-drawer/contracts/shared-core-data-contract.md`

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Wire store-app to the shared package so User Story 2 can import core types from `@pos-platform/shared` (User Story 1 does not require imports yet, but this phase is quick and prevents mid-feature dependency churn).

**Checkpoint**: `pnpm install` succeeds and `apps/store-app/package.json` lists `@pos-platform/shared`.

- [x] T003 [P] Add `@pos-platform/shared` workspace dependency to `apps/store-app/package.json` (same pattern as `apps/admin-app/package.json`)
- [x] T004 Run `pnpm install` from `/home/janky/Desktop/pos-1`

---

## Phase 3: User Story 1 — Accurate cash drawer on Home without periodic polling (Priority: P1) — MVP

**Goal**: Remove timer-driven cash drawer refresh on Home; rely on existing reactive and event-driven updates only. Do not add a visible freshness indicator for cash drawer on Home.

**Independent Test**: From Home, trigger cash drawer open/close or a drawer-related transaction; the displayed status updates without waiting for a one-minute interval, and `Home.tsx` does not register a recurring interval for `loadCashDrawerStatus`.

### Implementation for User Story 1

- [x] T005 [US1] Remove the 60-second `setInterval` fallback that calls `loadCashDrawerStatus` in `apps/store-app/src/pages/Home.tsx`, keep initial load and existing `useEffect` / event-listener triggers, and update nearby comments so they no longer describe periodic refresh as a supported mechanism
- [x] T006 [US1] Run `pnpm --filter store-app lint` from `/home/janky/Desktop/pos-1` and fix any issues introduced in `apps/store-app/src/pages/Home.tsx`

**Checkpoint**: User Story 1 complete — Home behavior matches `contracts/home-cash-drawer-view-contract.md` for trigger sources and forbidden polling.

---

## Phase 4: User Story 2 — One business data contract for admin and store (Priority: P2)

**Goal**: Single authoritative **core** field definitions for v1 entities (`stores`, `branches`, `users`, `store_subscriptions`) in `@pos-platform/shared`, with admin and store apps composing app-specific extensions. Document v1 scope vs app-only types (FR-007).

**Independent Test**: Core interfaces live only under `packages/shared/src/types/` (exported via package entry); admin and store apps reference those cores for overlapping fields without duplicating independent core definitions.

### Implementation for User Story 2

- [x] T007 [US2] Add `StoreCore`, `BranchCore`, `UserCore`, and `StoreSubscriptionCore` interfaces plus a module-level comment listing v1 shared entities and app-only exceptions (FR-007) in `packages/shared/src/types/supabase-core.ts`
- [x] T008 [US2] Export the new core types from `packages/shared/src/types/index.ts` and confirm `packages/shared/src/index.ts` re-exports them for `@pos-platform/shared` consumers
- [x] T009 [US2] Run `pnpm --filter @pos-platform/shared build` from `/home/janky/Desktop/pos-1` to refresh `packages/shared/dist/` for dependents
- [x] T010 [P] [US2] Refactor `Store`, `Branch`, `StoreUser`, and `Subscription` (core-overlap fields only) in `apps/admin-app/src/types/index.ts` to compose or extend `StoreCore`, `BranchCore`, `UserCore`, and `StoreSubscriptionCore` from `@pos-platform/shared`
- [x] T011 [P] [US2] Refactor `public.Tables.stores.Row` and `public.Tables.users.Row` in `apps/store-app/src/types/database.ts` to intersect shared core types from `@pos-platform/shared` with store-app-only fields (sync columns, extra employee fields, etc.) without duplicating core field definitions inline
- [x] T012 [P] [US2] Refactor the `Branch` interface in `apps/store-app/src/types/index.ts` to extend `BranchCore` from `@pos-platform/shared` and keep branch-only fields as extensions

**Checkpoint**: User Story 2 complete — v1 cores centralized; both apps compile against shared cores for overlapping shapes.

---

## Phase 5: Polish & Cross-Cutting Concerns

**Purpose**: Repo-wide verification and manual acceptance per `quickstart.md`.

- [x] T013 [P] Run `pnpm --filter store-app lint` from `/home/janky/Desktop/pos-1`
- [x] T014 [P] Run `pnpm --filter admin-app lint` from `/home/janky/Desktop/pos-1`
- [x] T015 Run `pnpm --filter store-app test:run` from `/home/janky/Desktop/pos-1` (if tests fail for unrelated reasons, record and fix only failures caused by this feature’s edits)
- [x] T016 Execute manual validation steps in `specs/001-shared-types-home-drawer/quickstart.md` sections 3–4 (Home cash drawer flows + type import sanity)

---

## Dependencies & Execution Order

### Phase Dependencies

- **Phase 1 (Setup)**: No dependencies — start immediately.
- **Phase 2 (Foundational)**: Depends on Phase 1 — required before User Story 2 implementation; safe before User Story 1 (dependency add is non-breaking for Home).
- **Phase 3 (US1)**: Depends on Phase 1 only for MVP; full release order is Phase 1 → Phase 2 → Phase 3 → Phase 4 → Phase 5.
- **Phase 4 (US2)**: Depends on Phase 2 and **T007–T009** (shared types exist and `packages/shared` build succeeds). **T010–T012** depend on **T009**.
- **Phase 5 (Polish)**: Depends on Phase 3 and Phase 4 for a full feature verification.

### User Story Dependencies

- **US1 (P1)**: Independent of US2 functionally; can ship as MVP after Home edits and store-app lint.
- **US2 (P2)**: Depends on shared package wiring (Phase 2) and shared package build (**T009**).

### Parallel Opportunities

- **T003** can run in parallel with **T001** / **T002** (different concerns) after scope is read — or sequentially after Phase 1.
- After **T009**: **T010**, **T011**, **T012** may run in parallel (different files).
- **T013** and **T014** may run in parallel.

### Parallel Example: User Story 2 (after T009)

```bash
# After shared package build (T009), refactor consumers in parallel:
Task T010 → apps/admin-app/src/types/index.ts
Task T011 → apps/store-app/src/types/database.ts
Task T012 → apps/store-app/src/types/index.ts
```

---

## Implementation Strategy

### MVP First (User Story 1 only)

1. Complete Phase 1 (**T001**, **T002**).
2. Complete Phase 3 (**T005**, **T006**) — Home polling removal does not require `@pos-platform/shared` in store-app.
3. Stop and validate Home behavior and `pnpm --filter store-app lint`.
4. When ready for User Story 2, complete Phase 2 (**T003**, **T004**) then Phase 4.

### Full Feature Delivery

1. Phase 1 → Phase 2 → Phase 3 → Phase 4 → Phase 5.

### Parallel Team Strategy

- Developer A: Phase 3 (US1) on `apps/store-app/src/pages/Home.tsx`.
- Developer B: After T009, Phase 4 tasks **T010**–**T012** on admin/store types.

---

## Notes

- Every task uses an explicit file path or repo-root command path.
- No new `setInterval` for cash drawer or sync refresh on Home (constitution CG-03).
- Do not add UI that acts as an explicit “last updated” freshness indicator for cash drawer on Home (spec clarification).

---

## Task Summary

| Metric | Count |
|--------|------:|
| **Total tasks** | 16 |
| **US1 tasks** | 2 (T005–T006) |
| **US2 tasks** | 6 (T007–T012) |
| **Setup + Foundational** | 4 (T001–T004) |
| **Polish** | 4 (T013–T016) |
| **Marked [P]** | 6 (T003, T010, T011, T012, T013, T014) |
