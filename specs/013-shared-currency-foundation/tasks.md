---

description: "Task list for Phase 1 — Shared Currency & Country Foundation"
---

# Tasks: Shared Currency & Country Foundation (Phase 1 of Multi-Currency)

**Input**: Design documents from `/specs/013-shared-currency-foundation/`
**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/shared-exports.md, quickstart.md
**Tests**: Included — FR-015 in `spec.md` explicitly requires a test covering `getDefaultCurrenciesForCountry` contract.

**Organization**: Tasks grouped by user story. US1 (currency vocabulary) and US2 (country map) are both P1 and independent — either can ship alone and still compile.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Different files, no dependencies on incomplete tasks — can run in parallel.
- **[Story]**: `US1` = currency vocabulary; `US2` = country map.

## Path Conventions

Monorepo — all paths rooted at repo root `C:/Users/User/Desktop/pos/`:

- Shared package source: `packages/shared/src/types/`
- Shared package tests: `packages/shared/tests/`
- No changes in `apps/store-app/` or `apps/admin-app/` in this phase.

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Verify the shared-package build/test toolchain is functional before adding new files. No project initialization needed — the shared package already exists at v1.0.0.

- [X] T001 Verify baseline build works: run `pnpm install && pnpm --filter @pos-platform/shared build` from repo root and confirm exit 0 with no new type errors before any code changes.
- [X] T002 [P] Confirm Vitest is resolvable from the shared package workspace. If `packages/shared/package.json` lacks a `test` script, add one that runs `vitest run` (dev-dependency inheritance from root workspace is already expected; do not add Vitest to `packages/shared/package.json` unless resolution fails).
- [X] T003 [P] Create the `packages/shared/tests/` directory if it does not already exist (no file content yet — just the directory so T015 has a home).

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: None. This feature IS the foundation for Phases 2–12 of the parent `008-multi-currency-country` plan. There are no blocking prerequisites inside Phase 1 itself.

**Checkpoint**: Skip to user stories.

---

## Phase 3: User Story 1 — Canonical currency vocabulary (Priority: P1) 🎯 MVP

**Goal**: Introduce `CurrencyCode`, `CurrencyMeta`, and the exhaustive `CURRENCY_META` registry in `@pos-platform/shared` so all later phases have a single source of truth for supported currencies.

**Independent Test**: After T004 + T005 merge, `pnpm --filter @pos-platform/shared build` passes. Importing `CurrencyCode` and `CURRENCY_META` from `@pos-platform/shared` works in both apps. Both `'USD'` and `'LBP'` remain valid `CurrencyCode` members so every existing `'USD' | 'LBP'` union in the repo still compiles.

### Implementation for User Story 1

- [X] T004 [US1] Create `packages/shared/src/types/currency.ts` with the `CurrencyCode` union (21 ISO 4217 codes: USD, LBP, EUR, GBP, SAR, AED, EGP, JOD, SYP, IQD, TRY, MAD, TND, DZD, LYD, SDG, YER, KWD, BHD, QAR, OMR), the `CurrencyMeta` interface (fields: `code`, `name`, `symbol`, `decimals`, `locale`), and the `CURRENCY_META: Record<CurrencyCode, CurrencyMeta>` constant populated per the table in `data-model.md §Entity 3`. Use `Record<CurrencyCode, CurrencyMeta>` — not `Partial<...>` — so exhaustiveness is compile-time enforced (SC-004).
- [X] T005 [US1] Edit `packages/shared/src/types/index.ts` to add barrel re-exports: `export type { CurrencyCode, CurrencyMeta } from './currency';` and `export { CURRENCY_META } from './currency';`. Do NOT remove, rename, or reorder any existing export (FR-011).

**Checkpoint (US1 standalone)**: Running `pnpm --filter @pos-platform/shared build`, `pnpm build:store`, and `pnpm build:admin` all exit 0. A spot check that `import { CURRENCY_META } from '@pos-platform/shared'` resolves and `CURRENCY_META.LBP.decimals === 0` holds. At this point US1 is independently shippable — US2 is not yet merged and nothing depends on it.

---

## Phase 4: User Story 2 — Country-to-currency defaults (Priority: P1)

**Goal**: Introduce `CountryConfig`, `COUNTRY_CONFIGS`, `COUNTRY_MAP`, and `getDefaultCurrenciesForCountry()` so Phase 4 (admin `StoreForm`) and Phase 8 (sync / store creation) have a deterministic lookup for which currencies a country should use by default.

**Independent Test**: `getDefaultCurrenciesForCountry('LB')` returns `['LBP','USD']`; `getDefaultCurrenciesForCountry('US')` returns `['USD']`; `getDefaultCurrenciesForCountry('ZZ')` returns `['USD']` without throwing (FR-015).

**Depends on US1**: Must land after T004 because `CountryConfig.localCurrency` and `CountryConfig.defaultCurrencies` reference `CurrencyCode`.

### Implementation for User Story 2

- [X] T006 [US2] Create `packages/shared/src/types/countries.ts` with the `CountryConfig` interface (fields: `code`, `name`, `localCurrency: CurrencyCode`, `defaultCurrencies: CurrencyCode[]`), the `COUNTRY_CONFIGS: CountryConfig[]` array populated per `data-model.md §Entity 5` (22 entries: LB, US, GB, DE, FR, SA, AE, EG, JO, SY, IQ, TR, MA, TN, DZ, LY, SD, YE, KW, BH, QA, OM), the derived `COUNTRY_MAP: Record<string, CountryConfig>` via `Object.fromEntries(COUNTRY_CONFIGS.map(c => [c.code, c]))`, and the `getDefaultCurrenciesForCountry(countryCode: string): CurrencyCode[]` function that returns `COUNTRY_MAP[countryCode]?.defaultCurrencies ?? ['USD']`. Import `CurrencyCode` from `./currency`.
- [X] T007 [US2] Edit `packages/shared/src/types/index.ts` to add barrel re-exports: `export type { CountryConfig } from './countries';` and `export { COUNTRY_CONFIGS, COUNTRY_MAP, getDefaultCurrenciesForCountry } from './countries';`. Place after the US1 re-exports from T005; preserve all existing exports (FR-011).

**Checkpoint (US2 standalone, assumes US1 merged)**: `pnpm --filter @pos-platform/shared build` passes. A spot check that `getDefaultCurrenciesForCountry('AE')` returns `['AED','USD']` and that every entry in `COUNTRY_CONFIGS` satisfies `defaultCurrencies.includes('USD')`.

---

## Phase 5: Tests & Invariants (covers both user stories)

**Purpose**: Encode the FR-015 contract test, the invariant from SC-003 (every country has USD), and the exhaustiveness sanity from SC-004.

- [X] T008 [P] Create `packages/shared/tests/currency-country.test.ts` with Vitest test cases: (1) `getDefaultCurrenciesForCountry('LB')` returns `['LBP','USD']`; (2) `getDefaultCurrenciesForCountry('US')` returns `['USD']`; (3) `getDefaultCurrenciesForCountry('ZZ')` returns `['USD']` and does not throw; (4) iterating `COUNTRY_CONFIGS` asserts `defaultCurrencies.includes('USD')` for every entry (SC-003); (5) `CURRENCY_META['LBP'].decimals === 0` and `CURRENCY_META['USD'].decimals === 2` and `CURRENCY_META['JOD'].decimals === 3` as ISO 4217 spot checks (R-3); (6) `CURRENCY_META[c].code === c` for every `c` in `Object.keys(CURRENCY_META)` (structural sanity).

---

## Phase 6: Polish & Cross-Cutting Concerns

**Purpose**: Backward-compatibility verification and end-to-end validation per the quickstart. No production code in this phase.

- [X] T009 [P] Run `pnpm -r build` from repo root and confirm zero new type errors in both `apps/store-app` and `apps/admin-app` (SC-002, FR-014). Every existing `'USD' | 'LBP'` union must still compile because both codes are in the `CurrencyCode` union. Do NOT migrate any call sites in this phase — that is Phase 2 of the parent plan.
- [X] T010 [P] Run `pnpm --filter @pos-platform/shared test` and confirm the test file added in T008 exits 0 with all six cases passing.
- [X] T011 [P] Run `pnpm lint` and confirm no new lint warnings/errors introduced by `currency.ts`, `countries.ts`, `index.ts`, or the test file.
- [X] T012 Grep the repository for competing definitions: confirm `CurrencyCode` appears only inside `packages/shared/src/types/currency.ts` and its re-exports in `packages/shared/src/types/index.ts` — no redefinitions elsewhere (SC-001). Use Grep across all of `apps/` and `packages/`.
- [X] T013 Walk through `quickstart.md §1` commands manually (build + test) and `§4` (backward-compat grep sanity). Record any deviation in a one-line note at the bottom of `quickstart.md` under a new `## Validation log` heading (or leave unchanged if everything passes).

---

## Dependencies & Execution Order

### Phase Dependencies

- **Phase 1 (Setup)** → no external deps; T001 must pass before any code is added.
- **Phase 2 (Foundational)** → empty; skip.
- **Phase 3 (US1)** → depends on Phase 1.
- **Phase 4 (US2)** → depends on Phase 3 (T004 exports `CurrencyCode`, which US2 consumes).
- **Phase 5 (Tests)** → depends on Phase 3 and Phase 4 (test file imports from both).
- **Phase 6 (Polish)** → depends on Phase 5.

### Task-level Dependencies

- T005 depends on T004 (barrel references `./currency`).
- T006 depends on T004 (imports `CurrencyCode`).
- T007 depends on T005 and T006 (appends to the barrel after US1, imports from `./countries`).
- T008 depends on T004 and T006.
- T009, T010, T011 all depend on T008 completing and T007 committing.
- T012 depends on T007.
- T013 depends on T009–T012.

### Parallel Opportunities

- **Phase 1**: T002 and T003 are [P] against each other.
- **Phase 3 vs Phase 4**: US2 (T006) *cannot* start before T004 finishes, because `CountryConfig.localCurrency: CurrencyCode` imports from `./currency`. Therefore US1 must complete before US2 can begin. This deviates from the generic "stories run in parallel" template and is called out explicitly.
- **Within Phase 5**: T008 is the only task — nothing to parallelize.
- **Phase 6**: T009, T010, T011 are all [P] (independent commands against independent outputs). T012 can run in parallel with T009–T011. T013 is the final rollup.

### Story Independence Note

The generic template expects user stories to be fully independent. Here, both stories are P1 but US2 has a one-way type dependency on US1 (`CurrencyCode`). Despite that:
- **US1 alone is shippable** — it delivers a complete, useful vocabulary and is a valid MVP.
- **US2 is not meaningfully shippable without US1** because its types reference `CurrencyCode`.
- If schedule forces a split, merge US1 first and leave US2 on the branch; US1 still unblocks Phase 2 (schema widening) of the parent plan.

---

## Parallel Example: Phase 6 polish pass

```bash
# Three terminals, all starting after T007 + T008 land:
Task: "Run pnpm -r build and confirm zero new type errors"                # T009
Task: "Run pnpm --filter @pos-platform/shared test"                        # T010
Task: "Run pnpm lint"                                                      # T011
```

---

## Implementation Strategy

### MVP First (US1 Only)

1. Complete Phase 1 (T001–T003).
2. Complete Phase 3 (T004, T005) → merge.
3. Validate: `pnpm -r build` passes; `CurrencyCode` importable from both apps.
4. Phase 2 of the parent plan (`008-multi-currency-country`) can now start in parallel while US2 lands here.

### Full Phase 1 Delivery

1. Phase 1 → Phase 3 → Phase 4 → Phase 5 → Phase 6.
2. Single PR is acceptable given the total surface (~150 LOC + 1 test file).
3. Do **not** bundle any migration of existing `'USD' | 'LBP'` call sites into this PR — those belong to the next parent-plan phase.

### Parallel Team Strategy

Not applicable — total scope is <200 LOC and US2 depends on US1's types. One developer, one PR.

---

## Notes

- Zero changes in `apps/store-app/`, `apps/admin-app/`, `supabase/migrations/`, or `lib/db.ts` during Phase 1. Any task that proposes touching those files is out of scope and belongs to a later parent-plan phase.
- Do not add runtime formatting, conversion, or I/O logic in `packages/shared` (FR-004). The only function added is `getDefaultCurrenciesForCountry`, which is pure.
- Constitution gate status: CG-13 is the load-bearing gate for this phase (shared-package source of truth). All other gates are N/A — see `plan.md §Constitution Check`.
- FR-015 test coverage lives in T008; SC-001 spot check lives in T012; SC-002/FR-014 verification lives in T009; FR-013/SC-004 exhaustiveness is compile-time enforced by T004's `Record<CurrencyCode, CurrencyMeta>` typing.
- Commit granularity: one commit per task is ideal; at minimum one commit per phase.
