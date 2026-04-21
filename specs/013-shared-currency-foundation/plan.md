# Implementation Plan: Shared Currency & Country Foundation (Phase 1 of Multi-Currency)

**Branch**: `013-shared-currency-foundation` | **Date**: 2026-04-21 | **Spec**: [spec.md](./spec.md)
**Input**: Feature specification from `/specs/013-shared-currency-foundation/spec.md`

## Summary

Introduce the canonical multi-currency vocabulary in `@pos-platform/shared`: a `CurrencyCode` union of 21 ISO 4217 codes, an exhaustive `CURRENCY_META` registry, a `CountryConfig` structure with 22 ISO 3166-1 alpha-2 entries, a `COUNTRY_MAP` keyed lookup, and a `getDefaultCurrenciesForCountry()` helper. Everything is pure types and constants — no runtime behavior changes in either app. Both `'USD'` and `'LBP'` remain valid members of `CurrencyCode`, so every existing `'USD' | 'LBP'` literal in the repo continues to compile unchanged. This phase is a leaf node whose only job is to unblock Phases 2–12 of the parent `008-multi-currency-country` initiative.

## Technical Context

**Language/Version**: TypeScript 5.x, React 18, Node.js ≥18
**Primary Dependencies**: Dexie v4, Supabase JS v2, React Router 7, Tailwind CSS 3, Vite 7, Electron 38 *(none of these are touched by Phase 1; listed for constitution alignment)*
**Storage**: N/A for this phase — Phase 1 adds no storage. Future phases: Supabase (PostgreSQL — remote); IndexedDB via Dexie v4 (local, primary).
**Testing**: Vitest — a single type-level / unit test file covering `getDefaultCurrenciesForCountry` and the `CURRENCY_META` exhaustiveness invariant.
**Target Platform**: N/A at runtime. The shared package is a build-time dependency for both Web (Netlify SPA) and Electron (Windows NSIS x64) targets.
**Project Type**: offline-first POS web-app + desktop-app — but this phase ships only to the shared package, consumed by both apps.
**Performance Goals**: N/A — constants and one O(1) lookup.
**Constraints**: Zero behavior change. Existing `'USD' | 'LBP'` unions across the codebase MUST remain valid. No new `any` types. No runtime logic beyond the single helper function.
**Scale/Scope**: ~150 lines of new code across two new files in `packages/shared/src/types/` plus barrel re-exports in `packages/shared/src/types/index.ts`.

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

Evaluated against the 14 gates in §12.2 of the constitution (v1.5.0):

| Gate | Principle | Status | Notes |
|---|---|---|---|
| CG-01 | Offline-First Data Flow | **N/A** | Phase 1 adds no data flow. No Supabase or IndexedDB reads/writes. |
| CG-02 | UI Data Access Boundary | **N/A** | Phase 1 adds no UI code. No new imports in `pages/`, `components/`, or `layouts/`. |
| CG-03 | Event-Driven Sync | **N/A** | Phase 1 touches no sync code. No `setInterval`, no event emission. |
| CG-04 | Financial Atomicity | **N/A** | No financial writes. Pure types/constants. |
| CG-05 | Client-Side Ledger | **N/A** | No ledger computation added. |
| CG-06 | Branch Isolation | **N/A** | No queries added. |
| CG-07 | RBAC Enforcement | **N/A** | No user-facing operations. |
| CG-08 | Double-Entry Accounting | **N/A** | No monetary records. |
| CG-09 | Schema Consistency | **N/A** | No Supabase tables or Dexie versions added. (Phase 2 of parent plan will add `country` + `accepted_currencies` to `stores` — explicitly out of scope here.) |
| CG-10 | Multilingual | **PASS** | The `name` field on `CountryConfig` / `CurrencyMeta` is an English display label intended for admin tooling and debug surfaces only; the parent-plan spec (Task 1, Task 8) describes these as admin-form vocabulary where a single English label is acceptable. No UI-facing user strings are introduced in Phase 1. Any store-facing UI consuming these labels (Phases 4, 5, 12) will wrap them with `createMultilingualFromString()` at the call site. |
| CG-11 | Local Date Extraction | **N/A** | No date handling. |
| CG-12 | Testing Discipline | **PASS** | New files live under `packages/shared/src/types/`, not under `apps/store-app/src/services/` or `contexts/offlineData/operations/`, so the mandatory-Vitest clause does not formally apply. Regardless, one Vitest test file is included voluntarily to pin the helper function's contract and the `CURRENCY_META` exhaustiveness invariant. No sync-critical file is touched, so `pnpm parity:gate` is not required. |
| CG-13 | Shared Package Source of Truth | **PASS** | Phase 1 IS the embodiment of CG-13: the `CurrencyCode` union and country map are deliberately placed in `@pos-platform/shared` so both apps consume a single definition. No duplication across apps is created; later phases will migrate existing `'USD' \| 'LBP'` usages to import from shared. |
| CG-14 | Undo Payload Storage | **N/A** | No undo state. |

**Gate decision**: PASS on all applicable gates. No violations, no entries required in the Complexity Tracking section below.

## Project Structure

### Documentation (this feature)

```text
specs/013-shared-currency-foundation/
├── plan.md              # This file
├── spec.md              # Feature specification
├── research.md          # Phase 0 output — prior art, ISO source verification, exhaustiveness pattern
├── data-model.md        # Phase 1 output — CurrencyCode, CurrencyMeta, CountryConfig entity shapes
├── quickstart.md        # Phase 1 output — how to consume the new exports + how to extend
├── contracts/
│   └── shared-exports.md   # The public TypeScript export surface added to @pos-platform/shared
├── checklists/
│   └── requirements.md  # (created by /speckit.specify)
└── tasks.md             # Phase 2 output (/speckit.tasks)
```

### Source Code (repository root)

```text
packages/shared/
├── src/
│   ├── types/
│   │   ├── index.ts               # MODIFIED — re-export new symbols
│   │   ├── supabase-core.ts       # UNCHANGED (Phase 2 widens it)
│   │   ├── currency.ts            # NEW — CurrencyCode union + CurrencyMeta + CURRENCY_META
│   │   └── countries.ts           # NEW — CountryConfig + COUNTRY_CONFIGS + COUNTRY_MAP +
│   │                              #       getDefaultCurrenciesForCountry()
│   ├── utils/                     # UNCHANGED
│   └── constants/                 # UNCHANGED
├── tests/                         # NEW directory (if not already present in shared)
│   └── currency-country.test.ts   # Vitest coverage for getDefaultCurrenciesForCountry + invariants
├── package.json                   # UNCHANGED — Vitest already transitively available via root workspace
└── tsconfig.json                  # UNCHANGED

apps/store-app/                    # UNCHANGED in Phase 1
apps/admin-app/                    # UNCHANGED in Phase 1
supabase/migrations/               # UNCHANGED in Phase 1
```

**Structure Decision**: Additive-only changes under `packages/shared/src/types/`. Two new files (`currency.ts`, `countries.ts`) plus re-export lines in the existing `packages/shared/src/types/index.ts` barrel. One new test file under `packages/shared/tests/`. No other directory in the repository is modified. This matches constitution §2.2 (monorepo layout) and §3.XIII (CG-13 shared-package-as-source-of-truth).

**Why not a new top-level package?** The shared package already exists (`@pos-platform/shared` v1.0.0) and is the explicit deduplication boundary per CG-13. Creating a `@pos-platform/currency` package would fragment the source of truth and make later phases import from two shared packages instead of one.

**Why not add the types to `apps/store-app/src/types/` first and promote later?** That is the exact pattern §8.H (Anti-Patterns) warns against. The parent plan's phase ordering relies on both apps consuming the same types from day one so admin-form work (Phase 4) can proceed in parallel with store-app work (Phases 3/5/6).

## Complexity Tracking

> **Fill ONLY if Constitution Check has violations that must be justified.**

*No violations. Table intentionally empty.*

| Violation | Why Needed | Simpler Alternative Rejected Because |
|---|---|---|
| — | — | — |
