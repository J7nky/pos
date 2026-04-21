---
description: "Task list for 014-country-currency-schema (Phase 2 of multi-currency rollout)"
---

# Tasks: Country & Multi-Currency Schema Widening

**Input**: Design documents from `/specs/014-country-currency-schema/`
**Prerequisites**: plan.md ✓, spec.md ✓, research.md ✓, data-model.md ✓, contracts/ ✓, quickstart.md ✓

**Tests**: This phase is type-only widening with no behavior change. **No new automated tests are added.** Verification relies on the existing parity gate (`pnpm parity:gate`) and the `@pos-platform/shared` vitest suite (already green from Phase 1). Test tasks below are limited to running the existing suites.

**Organization**: Tasks are grouped by user story so each story can be implemented and verified independently. The MVP increment of this phase is **US2** (downstream readability) — once US2 is done the type-widening goal is met. US3 (inventory required currency) and US1 (backward-compat smoke) layer on top.

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Confirm prerequisites are in place. No new tooling, no new packages.

- [X] T001 Verify Phase 1 (`013-shared-currency-foundation`) is merged into the working tree by running `git log --oneline --grep="013-shared-currency-foundation"` and reading `packages/shared/src/types/currency.ts` to confirm `CurrencyCode`, `CurrencyMeta`, and `CURRENCY_META` exist; if absent, stop and rebase onto a branch that includes them.
- [X] T002 [P] Confirm baseline build is green by running `pnpm install` then `pnpm build:all` and `pnpm lint` from the repo root; record any pre-existing failures so they are not attributed to Phase 2.
- [X] T003 [P] Capture a Dexie/Supabase baseline snapshot for sync-parity comparison by running `pnpm --filter store-app parity:gate` and noting that it passes; this is the reference state Phase 2 must preserve.

**Checkpoint**: Phase 1 prerequisites confirmed; baseline known-good.

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: SQL migration plus shared-package widening. Both apps depend on these, so they must land first.

**⚠️ CRITICAL**: No US2 / US3 / US1 task can begin until this phase is complete.

- [X] T004 Create new Supabase migration file at `supabase/migrations/<YYYYMMDDHHMMSS>_add_country_accepted_currencies_to_stores.sql` with the SQL from `specs/014-country-currency-schema/data-model.md` Entity 1 (`ALTER TABLE public.stores ADD COLUMN IF NOT EXISTS country TEXT DEFAULT 'LB';` + `ADD COLUMN IF NOT EXISTS accepted_currencies TEXT[] NOT NULL DEFAULT ARRAY['LBP','USD'];` + the back-fill `UPDATE`). Use the local timestamp matching the project's existing migration naming convention.
- [ ] T005 Apply the new migration to the local/staging Supabase by running `supabase db push` (or the project's standard migration runner) and verify with `SELECT id, country, accepted_currencies FROM public.stores LIMIT 5;` that every existing row now has both fields populated per the FR-003 back-fill rules.
- [X] T006 Widen `StoreCore` and add `StoreCoreInsert` in `packages/shared/src/types/supabase-core.ts` per `specs/014-country-currency-schema/contracts/shared-types.md` §4: import `CurrencyCode`, add `country: string` and `accepted_currencies: CurrencyCode[]`, change `preferred_currency` to `CurrencyCode`, and export the new `StoreCoreInsert` interface.
- [X] T007 Re-export `StoreCoreInsert` from `packages/shared/src/types/index.ts` (add it to the existing `export type { StoreCore, BranchCore, ... } from './supabase-core'` block) and widen the local `Transaction.currency` field in the same file from `'USD' | 'LBP'` to `CurrencyCode` (FR-014, R7).
- [X] T008 Build the shared package by running `pnpm --filter @pos-platform/shared build` and confirm it emits with zero TypeScript errors; this is the gate that Foundational widening is sound before propagating to the apps.

**Checkpoint**: Database is widened with back-filled rows; shared types compile. Both apps will likely have new compile errors next — they are addressed in US2/US3.

---

## Phase 3: User Story 2 — Downstream phases can read country and accepted_currencies (Priority: P1) 🎯 MVP

**Goal**: Both Supabase and Dexie code paths in the store-app surface `country` and `accepted_currencies` as first-class, type-safe fields, so Phases 3–12 of the parent rollout can consume them without casts.

**Independent Test**: After this phase, in any store-app source file, type `store.accepted_currencies[0]` against a `StoreCore` value and confirm the inferred type is `CurrencyCode`. Open the populated IndexedDB in DevTools and confirm every `stores` row carries `country` and `accepted_currencies`.

### Implementation for User Story 2

- [X] T009 [US2] In `apps/store-app/src/types/database.ts`, replace every `'USD' | 'LBP'` literal union with `CurrencyCode` (imported from `@pos-platform/shared`) on the `stores`, `transactions`, and `cash_drawer_accounts` tables across `Row`, `Insert`, and `Update` shapes (FR-010). Do **not** modify `inventory_items` in this task — that belongs to US3 (T013).
- [X] T010 [US2] In the same `apps/store-app/src/types/database.ts`, on the `stores` table add `country: string | null` and `accepted_currencies: CurrencyCode[]` to `Row` (required), and to `Insert` and `Update` as optional fields (FR-011). Confirm the file's existing `import type` block pulls `CurrencyCode` from `@pos-platform/shared` exactly once.
- [X] T011 [US2] Bump the Dexie schema in `apps/store-app/src/lib/db.ts` to version 55: add a `this.version(55).stores({ stores: 'id, name, country, preferred_currency, preferred_language, preferred_commission_rate, exchange_rate, updated_at', /* other tables unchanged */ })` block immediately after the existing v54 block (FR-015). Do not modify any v54 definition.
- [X] T012 [US2] Add the `.upgrade(async (tx) => { ... })` hook chained to the v55 block in `apps/store-app/src/lib/db.ts` that iterates `tx.table('stores').toCollection().modify((store) => { ... })` and back-fills `country` (default `'LB'`) and `accepted_currencies` (per the FR-003 / R2 rule) only when those fields are missing/empty (FR-016, FR-018). The inventory back-fill in the same hook is added by US3 (T015).

**Checkpoint**: After this phase, `apps/store-app` and `apps/admin-app` both compile against the widened shared `StoreCore`, the Dexie store row carries the new fields locally, and downstream phases can read them without casts. The MVP slice of Phase 2 is shippable here.

> **Implementation note (T011–T012 / T015):** The repo already used Dexie **v55** (sync metadata) and **v56** (`inventory_items.is_archived`) before this feature. Country / `accepted_currencies` / inventory `currency` back-fill landed as **v57** in `apps/store-app/src/lib/dbSchema.ts` (`V57_STORES`, `upgradeV57`) instead of reusing the v55 number.

---

## Phase 4: User Story 3 — Inventory item currency is explicit and required (Priority: P2)

**Goal**: Tighten `inventory_items.currency` so the TypeScript `Row` requires it, and back-fill any locally-stored item missing a value with the parent store's `preferred_currency`.

**Independent Test**: Attempt to construct an `inventory_items.Row` literal in TypeScript with `currency` omitted — the compiler must reject it. Open IndexedDB in DevTools after the Dexie upgrade and confirm every `inventory_items` row has a non-null `currency`.

### Implementation for User Story 3

- [X] T013 [US3] In `apps/store-app/src/types/database.ts`, change `inventory_items.Row.currency` from `'USD' | 'LBP' | undefined` to a required `CurrencyCode` (FR-012). Keep `inventory_items.Insert.currency` and `inventory_items.Update.currency` as `CurrencyCode | undefined` so existing call-site insert payloads without explicit currencies continue to compile (defaults are applied at the write boundary in Phase 6).
- [X] T014 [US3] In `apps/store-app/src/types/index.ts`, replace the local `InventoryItem.currency?: 'USD' | 'LBP'` field with `currency?: CurrencyCode` (FR-013); ensure `CurrencyCode` is imported from `@pos-platform/shared` at the top of the file.
- [X] T015 [US3] Extend the v55 `.upgrade()` hook in `apps/store-app/src/lib/db.ts` (created in T012) to also iterate `inventory_items` and back-fill any row whose `currency` is missing, using the parent store's `preferred_currency` as the default (FR-017, R4). Build the parent-store lookup once via `const stores = await tx.table('stores').toArray(); const storesById = new Map(stores.map((s) => [s.id, s]));` then call `tx.table('inventory_items').toCollection().modify((item) => { if (!item.currency) item.currency = storesById.get(item.store_id)?.preferred_currency ?? 'USD'; })`.

**Checkpoint**: Inventory currency is required at the type level and uniformly populated locally. US2 and US3 are now both independently functional.

---

## Phase 5: User Story 1 — Existing Lebanon stores keep working unchanged (Priority: P1)

**Goal**: End-to-end smoke verification that backward-compat is preserved — every existing flow on a Lebanon store works identically post-migration, and no row is silently re-uploaded by sync.

**Independent Test**: On a populated store-app instance, complete the golden path (login → view inventory → ring an LBP sale → accept payment → verify in transaction history) and a sync round-trip; compare against the baseline captured in T003.

### Verification for User Story 1

- [ ] T016 [US1] Reload the store-app against an existing populated IndexedDB (started fresh from a `pnpm dev:store` instance). Confirm the Dexie upgrade prompt completes silently with no console error (FR-020). Open DevTools → Application → IndexedDB and visually verify every `stores` row has `country` and `accepted_currencies` populated and every `inventory_items` row has a non-null `currency` (SC-002).
- [ ] T017 [US1] Walk the golden path on the running store-app: log in → view inventory → ring an LBP sale on a Lebanon store → accept payment → verify the transaction appears in the transaction history page. Note any visible regression vs. the baseline in T003 (SC-004).
- [ ] T018 [US1] Trigger a sync via the store-app's sync trigger and watch the network/console: confirm that pre-existing `stores` and `inventory_items` rows are **not** re-uploaded — only rows actually modified during T017 should appear in the upload log (FR-021).
- [ ] T019 [US1] Run `SELECT id, name, preferred_currency, country, accepted_currencies FROM public.stores;` against the staging Supabase and confirm every row has the back-filled values matching the FR-003 rule for its `preferred_currency` (SC-001).

**Checkpoint**: Backward-compat verified end-to-end. The phase is functionally complete; remaining work is gating verification.

---

## Phase 6: Polish & Cross-Cutting Verification

**Purpose**: Run every gate that the constitution and spec require before this phase is considered ready to merge.

- [X] T020 [P] Run `pnpm --filter @pos-platform/shared build && pnpm --filter @pos-platform/shared test` and confirm both pass with zero new errors (Phase 1 vitest suite still green).
- [X] T021 [P] Run `pnpm --filter store-app build` and confirm zero TypeScript errors related to currency, country, or accepted_currencies (FR-019, SC-003).
- [X] T022 [P] Run `pnpm --filter admin-app build` and confirm zero TypeScript errors; no admin-app source file should have been modified (R8, SC-006). If admin-app fails to compile, the failure points to a missing widening or a removed shared symbol — fix in `packages/shared/src/types/*` rather than touching admin-app.
- [ ] T023 [P] Run `pnpm lint` from the repo root and confirm no new lint errors are introduced.
- [X] T024 Run `pnpm --filter store-app parity:gate` and confirm the parity-gate snapshot still passes with no new diffs introduced by the widening (SC-005, R5).
- [ ] T025 Run `git diff --stat main...HEAD` and confirm only the following file globs are touched: `supabase/migrations/*.sql`, `packages/shared/src/types/**`, `apps/store-app/src/types/**`, `apps/store-app/src/lib/db.ts`. If any other file appears in the diff, it has leaked from a downstream phase and must be reverted (SC-006).

  _Expected deviation in this repo: Dexie schema versions and upgrades live in `apps/store-app/src/lib/dbSchema.ts` (imported by `db.ts`), so that file is part of the Phase 2 surface area even though the task list names only `db.ts`._
- [ ] T026 Walk the rollback drill from `specs/014-country-currency-schema/quickstart.md` §4 on a scratch branch (do not push): confirm the SQL `DROP COLUMN IF EXISTS` statements complete without error and the reverted code re-compiles. Discard the scratch branch.

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1, T001–T003)**: No dependencies — start immediately.
- **Foundational (Phase 2, T004–T008)**: Requires Setup. Blocks every user story phase.
- **User Story 2 (Phase 3, T009–T012)**: Requires Foundational. Independent of US3 and US1.
- **User Story 3 (Phase 4, T013–T015)**: Requires Foundational. T015 depends on T012 because both edit the same `.upgrade()` hook in `apps/store-app/src/lib/db.ts`.
- **User Story 1 (Phase 5, T016–T019)**: Requires US2 **and** US3 to be merged into the working tree (the smoke walk depends on the full Dexie back-fill running).
- **Polish (Phase 6, T020–T026)**: Requires every prior phase complete.

### User Story Dependencies

- **US2 (P1)**: First-class delivery. Once Foundational lands, can ship alone as the MVP slice if US3 is deferred — `inventory_items.currency` would remain optional, which is non-blocking for downstream phases that have not yet started.
- **US3 (P2)**: Builds on US2's Dexie v55 hook (T015 amends what T012 created). Cannot ship without US2.
- **US1 (P1)**: Verification only — no code, just smoke walk + SQL inspection. Runs after US2 + US3.

### Within Each User Story

- US2: T009 and T010 both modify `apps/store-app/src/types/database.ts` and must run sequentially. T011 must precede T012 (the `.upgrade()` hook chains off the `.version(55).stores(...)` block).
- US3: T013 and T014 are independent files and can run in parallel. T015 must run after T012.
- US1: All four tasks are sequential verification steps in a single smoke walk.

### Parallel Opportunities

- T002 and T003 in Setup can run in parallel (different commands, no shared state).
- T013 and T014 in US3 can run in parallel (different files).
- T020, T021, T022, T023 in Polish can run in parallel (independent commands).

---

## Parallel Example: Setup baseline (T002 + T003)

```bash
# Run baseline build and parity gate in parallel — both are read-only and touch independent toolchains.
pnpm build:all & \
pnpm --filter store-app parity:gate & \
wait
```

## Parallel Example: Polish gates (T020–T023)

```bash
# Independent build + lint commands — kick off in parallel.
pnpm --filter @pos-platform/shared test & \
pnpm --filter store-app build & \
pnpm --filter admin-app build & \
pnpm lint & \
wait
```

---

## Implementation Strategy

### Recommended path (single contributor)

1. **Setup (T001–T003)** — confirm baseline. ~10 min.
2. **Foundational (T004–T008)** — write SQL migration, apply it, widen shared types, build shared package. ~30 min.
3. **US2 (T009–T012)** — propagate types into store-app, bump Dexie to v55, add stores back-fill. ~45 min.
4. **US3 (T013–T015)** — tighten inventory currency, extend Dexie hook with inventory back-fill. ~20 min.
5. **US1 (T016–T019)** — smoke verification on a populated dev instance. ~30 min.
6. **Polish (T020–T026)** — all gates and rollback drill. ~30 min.

Total: ~3 hours of focused work.

### MVP slice

If the rollout calendar requires shipping early, the MVP increment is **Setup + Foundational + US2 + Polish**. US3 (inventory required currency) and the formal smoke walk in US1 can land in a follow-up. Downstream phases (3, 4, 5) only depend on US2.

### Anti-scope

If during implementation you find yourself editing any of the following, **stop and revert** — they belong to other phases:

- `apps/store-app/src/services/currencyService.ts` → Phase 3
- `apps/admin-app/src/components/stores/StoreForm.tsx` → Phase 4
- `apps/store-app/src/contexts/OfflineDataContext.tsx` (or any context) → Phase 5
- Any file under `apps/store-app/src/services/` other than for compile-fix imports → Phase 3/6/7/8
- `journal_entries`, `balance_snapshots`, or any `_usd` / `_lbp` columns → Phase 11
- `stores.exchange_rates` JSONB → Phase 10

The `git diff --stat` check in T025 is the gate that enforces this rule.
