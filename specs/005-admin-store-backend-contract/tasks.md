# Tasks: Admin-app and store-app shared backend data contract

**Input**: Design documents from `/home/janky/Desktop/pos-1/specs/005-admin-store-backend-contract/`  
**Prerequisites**: [plan.md](./plan.md), [spec.md](./spec.md), [research.md](./research.md), [data-model.md](./data-model.md), [contracts/shared-supabase-core-contract.md](./contracts/shared-supabase-core-contract.md), [quickstart.md](./quickstart.md)

**Tests**: Not requested in the feature specification — no mandatory test tasks. Optional structural check in Polish phase.

**Organization**: Phases follow user stories P1 → P2 → P3 from [spec.md](./spec.md).

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies on incomplete tasks)
- **[Story]**: [US1], [US2], [US3] for user-story phases only

## Path Conventions

Monorepo root: `/home/janky/Desktop/pos-1/`. Paths below are repo-relative from root.

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Lock scope and capture baseline before edits.

- [x] T001 Review `/home/janky/Desktop/pos-1/specs/005-admin-store-backend-contract/spec.md` and `/home/janky/Desktop/pos-1/specs/005-admin-store-backend-contract/plan.md` to confirm in-scope entities (stores, branches, staff users, store subscriptions) and normative package rule
- [x] T002 [P] Run baseline TypeScript checks from repo root: `pnpm exec tsc --noEmit -p packages/shared/tsconfig.json`, `pnpm exec tsc --noEmit -p apps/admin-app/tsconfig.json`, `pnpm exec tsc --noEmit -p apps/store-app/tsconfig.json` (record pass/fail for later comparison)

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Audit and admin-side alignment so user-story work does not repeat guesswork.

**⚠️ CRITICAL**: Complete before Phase 3 (US1).

- [x] T003 Append an **“Implementation audit (core field parity)”** subsection to `/home/janky/Desktop/pos-1/specs/005-admin-store-backend-contract/research.md` with a table comparing each field in `packages/shared/src/types/supabase-core.ts` (`StoreCore`, `BranchCore`, `UserCore`, `StoreSubscriptionCore`) to overlapping columns implied by `apps/admin-app/src/types/index.ts` and `apps/store-app/src/types/database.ts` (and `apps/store-app/src/types/index.ts` for `Branch`)
- [x] T004 Verify `apps/admin-app/src/types/index.ts` so `Store`, `Branch`, `StoreUser`, and subscription-related interfaces **extend** `StoreCore`, `BranchCore`, `UserCore`, and `StoreSubscriptionCore` from `@pos-platform/shared` without conflicting property types on shared keys; fix any drift in `apps/admin-app/src/types/index.ts`

**Checkpoint**: Audit documented; admin extensions only add non-core fields.

---

## Phase 3: User Story 1 — One source of truth (Priority: P1) 🎯 MVP

**Goal**: Normative `*Core` types in shared package match how both apps type overlapping remote rows.

**Independent Test**: `pnpm exec tsc --noEmit` passes for shared, admin, and store; no duplicate core field definitions for the same column in app layers vs `packages/shared/src/types/supabase-core.ts`.

### Implementation for User Story 1

- [x] T005 [US1] Add `branches` under `Database.public.Tables` in `apps/store-app/src/types/database.ts` with `Row` (and `Insert`/`Update` as needed) expressed as `BranchCore` plus store-app extensions (e.g. `logo`, `_synced`, `_deleted`, soft-delete metadata) consistent with `apps/store-app/src/types/index.ts` `Branch` and `apps/store-app/src/lib/db.ts` Dexie `Branch` usage
- [x] T006 [P] [US1] Reconcile legacy `Store` in `apps/store-app/src/types/index.ts` with `StoreCore`: either extend `StoreCore` where it represents the same entity, or add explicit `@deprecated` / comment directing remote row typing to `Database['public']['stores']['Row']` so the normative contract is unambiguous
- [x] T007 [US1] Audit `stores` and `users` table `Row`/`Insert`/`Update` in `apps/store-app/src/types/database.ts` for conflicting overlaps with `StoreCore` / `UserCore`; align compositions and document optional `is_active` on users per research decision

**Checkpoint**: Store-app `database.ts` and admin `types/index.ts` both respect shared cores for overlapping columns.

---

## Phase 4: User Story 2 — Shared vs app-only boundary (Priority: P2)

**Goal**: Developers can see which columns are core vs extension without reading both codebases.

**Independent Test**: `packages/shared/src/types/supabase-core.ts` header documents extension rules; `data-model.md` and `contracts/shared-supabase-core-contract.md` match.

### Implementation for User Story 2

- [x] T008 [US2] Expand module-level documentation in `packages/shared/src/types/supabase-core.ts` with an explicit **extension matrix** (sync columns, admin-only, store-only) per FR-004, without duplicating full type bodies that belong only in app-specific types
- [x] T009 [P] [US2] Update `/home/janky/Desktop/pos-1/specs/005-admin-store-backend-contract/data-model.md` so entity sections stay consistent with `supabase-core.ts` comments and extension rules
- [x] T010 [P] [US2] Update `/home/janky/Desktop/pos-1/specs/005-admin-store-backend-contract/contracts/shared-supabase-core-contract.md` with concrete admin vs store extension examples (no contradictions with TS exports)

**Checkpoint**: Supplementary docs and normative TS stay aligned.

---

## Phase 5: User Story 3 — Predictable impact when shared data evolves (Priority: P3)

**Goal**: Leads can triage releases using the contract and quickstart.

**Independent Test**: `quickstart.md` contains a triage checklist; report §1.4 points to spec + quickstart.

### Implementation for User Story 3

- [x] T011 [US3] Add a **release triage** subsection to `/home/janky/Desktop/pos-1/specs/005-admin-store-backend-contract/quickstart.md` (packages to bump, order of edits, typecheck commands, release-note bullet template)
- [x] T012 [US3] Update `/home/janky/Desktop/pos-1/IMPROVEMENTS_ENHANCEMENTS_REPORT.md` §1.4 with links to `/home/janky/Desktop/pos-1/specs/005-admin-store-backend-contract/spec.md` and `/home/janky/Desktop/pos-1/specs/005-admin-store-backend-contract/quickstart.md` for the shared contract handoff

**Checkpoint**: Onboarding and release process reference the same artifacts.

---

## Phase 6: Polish & Cross-Cutting Concerns

**Purpose**: Verify compilation and close the loop on SC-001 / SC-003 evidence.

- [x] T013 [P] Re-run TypeScript checks: `pnpm exec tsc --noEmit -p packages/shared/tsconfig.json`, `pnpm exec tsc --noEmit -p apps/admin-app/tsconfig.json`, `pnpm exec tsc --noEmit -p apps/store-app/tsconfig.json` from repo root; resolve any regressions introduced by this feature
- [x] T014 [P] Optionally run `pnpm --filter store-app lint` and `pnpm --filter admin-app lint` from repo root to catch import or unused issues after type edits in `apps/store-app/src/types/database.ts` and `apps/admin-app/src/types/index.ts`

---

## Dependencies & Execution Order

### Phase Dependencies

- **Phase 1 (Setup)**: No dependencies
- **Phase 2 (Foundational)**: Depends on Phase 1 — **blocks** all user stories
- **Phase 3 (US1)**: Depends on Phase 2
- **Phase 4 (US2)**: Depends on Phase 3 recommended (docs should reflect final `supabase-core.ts` and store `database.ts` shapes); can start comment/doc pass in parallel with late US1 only if no file conflicts
- **Phase 5 (US3)**: Depends on Phase 4 for accurate quickstart wording (or run after Phase 3 if time-boxed, then revise after Phase 4)
- **Phase 6 (Polish)**: Depends on Phases 3–5 complete

### User Story Dependencies

- **US1**: Starts after Foundational — **no** dependency on US2/US3
- **US2**: Logically after US1 (stable cores in code); documentation-only can overlap carefully
- **US3**: After US2 is ideal so quickstart references final doc set

### Within Each User Story

- US1: Prefer `database.ts` branches table (T005) before or in parallel with legacy `Store` reconciliation (T006) — if T006 depends on how `stores` is modeled, sequence T007 before T006 when conflicts appear
- US2: T008 before T009/T010 (comments drive docs)

### Parallel Opportunities

- **T002** parallel with **T001** (different activities)
- **T006** [P] parallel with **T005** after audit confirms no overlap on same lines — if merge conflicts risk, run sequentially
- **T009** and **T010** parallel after **T008**
- **T013** and **T014** parallel

---

## Parallel Example: User Story 1

```bash
# After T004 completes, different developers can:
Task T005: Add branches to apps/store-app/src/types/database.ts
Task T006: Reconcile apps/store-app/src/types/index.ts Store vs StoreCore
# T007 should follow or interleave when resolving stores/users conflicts
```

---

## Parallel Example: User Story 2

```bash
# After T008 completes:
Task T009: Update specs/005-admin-store-backend-contract/data-model.md
Task T010: Update specs/005-admin-store-backend-contract/contracts/shared-supabase-core-contract.md
```

---

## Implementation Strategy

### MVP First (User Story 1 only)

1. Complete Phase 1 and Phase 2  
2. Complete Phase 3 (US1)  
3. **STOP**: Run `tsc` for all three packages; confirm no core drift  
4. Demo / internal review before US2/US3

### Incremental Delivery

1. Setup + Foundational → audit + admin alignment  
2. US1 → compile-time single source of truth for overlapping rows  
3. US2 → documentation clarity for extensions  
4. US3 → release triage + report pointer  
5. Polish → `tsc` + optional lint

### Parallel Team Strategy

- Developer A: Phase 2 admin `types/index.ts` (T004)  
- Developer B: Phase 2 research audit appendix (T003)  
- After Phase 2: Developer A: `database.ts` branches (T005); Developer B: legacy `Store` (T006)

---

## Task Summary

| Phase | Task IDs | Count |
|-------|----------|-------|
| Setup | T001–T002 | 2 |
| Foundational | T003–T004 | 2 |
| US1 | T005–T007 | 3 |
| US2 | T008–T010 | 3 |
| US3 | T011–T012 | 2 |
| Polish | T013–T014 | 2 |
| **Total** | **T001–T014** | **14** |

### Per user story

| Story | Tasks | Count |
|-------|-------|-------|
| US1 | T005, T006, T007 | 3 |
| US2 | T008, T009, T010 | 3 |
| US3 | T011, T012 | 2 |

### Checklist format validation

All tasks use `- [ ]`, sequential `Tnnn`, optional `[P]`, story labels only on US1–US3 tasks, and include at least one concrete file path in the description.

---

## Notes

- Do not add UI imports of `lib/db` or `lib/supabase` in store-app (Constitution CG-02).  
- No new `setInterval` on sync paths (CG-03).  
- Schema migrations / Dexie bumps are **out of scope** unless a separate change adds real DB columns; this feature is primarily **types + docs**.
