# Implementation Plan: Currency Service & Context Wiring

**Branch**: `015-currency-service-wiring` | **Date**: 2026-04-21 | **Spec**: [spec.md](./spec.md)
**Input**: Feature specification from `/specs/015-currency-service-wiring/spec.md`

## Summary

Wire the multi-currency foundation (spec 013) and country/accepted-currencies schema (spec 014) into three live surfaces that currently still treat `USD | LBP` as the only possible currencies: (1) the store-app's `CurrencyService`, (2) the admin-app's `StoreForm` + store type/service layer, and (3) the store-app's `OfflineDataContext`. After this feature, a super-admin can onboard a store in any of the 22 ISO countries registered in `COUNTRY_CONFIGS`, cashier-facing screens format amounts correctly for every `CurrencyCode` the store accepts, and the context re-renders automatically when a sync pulls a new currency configuration.

The refactor replaces `CurrencyService`'s two-currency methods (`getSupportedCurrencies`, `safeConvertForDatabase`, `formatCurrencyWithSymbol`, `getConvertedAmount`) with generic `format()`, `convert()`, `getMeta()`, `getAcceptedCurrencies()`, `getPreferredCurrency()` calls backed by the shared `CURRENCY_META` registry. The admin form gains a country selector + accepted-currencies multi-select with a hard-block guard against removing currencies that have live data in Supabase. The offline-data context holds `acceptedCurrencies` / `preferredCurrency` / `formatAmount` as reactive React state, invalidating on boot and after every sync cycle that touches the `stores` table.

## Technical Context

**Language/Version**: TypeScript 5.x, React 18, Node.js ≥18
**Primary Dependencies**: Dexie v4, Supabase JS v2, React Router 7, Tailwind CSS 3, Vite 7, Electron 38
**Storage**: Supabase (PostgreSQL — remote); IndexedDB via Dexie v4 (local, primary)
**Testing**: Vitest (unit tests for `packages/shared` and `apps/store-app` services; legacy tests in `apps/store-app/src/services/__tests__/legacy/` remain as regression harness)
**Target Platform**: Web (Netlify SPA) + Electron (Windows NSIS x64 desktop)
**Project Type**: offline-first POS web-app + desktop-app (monorepo with `apps/store-app`, `apps/admin-app`, `packages/shared`)
**Performance Goals**: No regression vs current rendering cost; Intl.NumberFormat per render is acceptable at POS UI scale
**Constraints**: offline-capable, multi-currency, multilingual (en/ar/fr), RTL, RBAC per branch, atomic financial transactions, no server-side ledger RPCs. Parity gate (`pnpm parity:gate`) MUST pass
**Scale/Scope**: Touches 1 shared service (`currencyService.ts`), 1 admin form (`StoreForm.tsx`), 1 admin type file, 1 admin service, 1 store-app context (`OfflineDataContext.tsx`), 1 hook (`useCurrency.ts`), and 14+ downstream call sites that consume `formatCurrencyWithSymbol`/`getConvertedAmount` via the hook

## Constitution Check

*Gate: all gates below must pass before Phase 0 research; re-checked after Phase 1 design.*

| Gate | Principle | Status | Evidence |
|------|-----------|--------|----------|
| **CG-01** | Offline-first data flow | ✅ Pass | All writes stay Dexie-first. `loadFromStore` reads from `getDB().stores`. Admin-app is exempt (Supabase-only SPA per §2.3). |
| **CG-02** | UI data access boundary | ✅ Pass | UI continues consuming only `hooks/useCurrency` and `contexts/OfflineDataContext`. No new direct `lib/db` or `lib/supabase` imports added to UI. Admin form's Supabase usage-count query goes through `storeService`, not direct client. |
| **CG-03** | Event-driven sync | ✅ Pass | No polling introduced. `loadFromStore` re-run is triggered by existing post-sync hook in `OfflineDataContext`. |
| **CG-04** | Atomic transactions via `transactionService` | ✅ Pass | Feature does not write to `transactions`/`journal_entries`. |
| **CG-05** | RBAC scoping | ✅ Pass | Admin form is super-admin-only (existing `ProtectedRoute`); store-app context inherits current `store_id` scope. |
| **CG-06** | Multilingual storage | ✅ Pass | No multilingual string fields added. Currency `name` in `CURRENCY_META` is a display constant, not a stored multilingual field. |
| **CG-07** | Dexie schema discipline | ✅ Pass | No new Dexie version bump required — spec 014 already added `country`/`accepted_currencies` indexes in v55. |
| **CG-08** | Supabase RLS | ✅ Pass | No new tables/columns added by this feature (spec 014 owns the schema). |
| **CG-09** | Netlify deploy safety | ✅ Pass | No build-target routing or env-var changes. |
| **CG-10** | Electron parity | ✅ Pass | All code runs identically in web and Electron. No peripheral-dependent paths. |
| **CG-11** | i18n RTL | ✅ Pass | `CURRENCY_META[code].locale` drives `Intl.NumberFormat`, which handles RTL correctly per locale. |
| **CG-12** | Testing discipline | ✅ Pass | Vitest coverage added for the new `CurrencyService` public API (convert/format/loadFromStore) in `apps/store-app/src/services/__tests__/currencyService.test.ts`. Parity gate run after refactor. |
| **CG-13** | Shared package as source of truth | ✅ Pass | All currency + country constants consumed from `@pos-platform/shared` (introduced in specs 013/014). No duplication in app packages. |
| **CG-14** | Undo payload storage boundary | ✅ Pass | Feature does not touch undo state. |

**Gate decision**: PASS — proceed to Phase 0. No Complexity Tracking entries required.

## Project Structure

### Documentation (this feature)

```text
specs/015-currency-service-wiring/
├── plan.md              # This file (/speckit.plan output)
├── spec.md              # Feature spec (already authored + clarified)
├── research.md          # Phase 0 output
├── data-model.md        # Phase 1 output
├── quickstart.md        # Phase 1 output
├── contracts/           # Phase 1 output
│   ├── currencyService.contract.md
│   ├── storeForm.contract.md
│   └── offlineDataContext.contract.md
├── checklists/
│   └── requirements.md  # Created during /speckit.specify
└── tasks.md             # Phase 2 output (/speckit.tasks)
```

### Source Code (repository root)

```text
apps/
├── store-app/src/
│   ├── services/
│   │   ├── currencyService.ts                  ← REWRITE: multi-currency, rate map
│   │   └── __tests__/
│   │       └── currencyService.test.ts         ← NEW: Vitest unit tests
│   ├── hooks/
│   │   └── useCurrency.ts                      ← REWRITE: thin wrapper over context
│   ├── contexts/
│   │   ├── OfflineDataContext.tsx              ← EDIT: add acceptedCurrencies/preferredCurrency/formatAmount state + post-sync loadFromStore hook
│   │   └── offlineData/
│   │       └── useStoreSettingsDataLayer.ts    ← EDIT: replace refreshExchangeRate call with loadFromStore
│   └── (14+ downstream callers of useCurrency — no direct edits expected; hook remains backward-compatible)
├── admin-app/src/
│   ├── components/stores/
│   │   └── StoreForm.tsx                       ← REWRITE: country selector, accepted-currencies multi-select, validation, usage-count guard
│   ├── services/
│   │   └── storeService.ts                     ← EDIT: include country/accepted_currencies on insert/update/select; add usage-count helper
│   └── types/
│       └── index.ts                            ← EDIT: widen Store, CreateStoreInput, UpdateStoreInput
packages/shared/
    └── (no changes — all consumed from 013/014 artifacts)
```

**Structure Decision**: Monorepo. This feature edits all three packages but adds no new files outside the spec directory beyond one new Vitest suite and three contract documents. No Dexie migration — spec 014 already landed v55. No Supabase migration — spec 014 already added the `country` / `accepted_currencies` columns.

## Phase 0: Outline & Research

See `research.md`. Research confirms five design decisions:

1. **Rate map pivot model** (spec FR-003): store a `Partial<Record<CurrencyCode, number>>` with `USD=1` always present; convert via USD as pivot. Forward-compatible with Phase 10's per-currency rates.
2. **Context reactivity** (spec clarification #3): hold currency state in `useState` inside `OfflineDataContext`; provide `formatAmount` via `useCallback` for reference stability.
3. **Country-change merge rule** (spec clarification #1): additive merge — new country's `localCurrency` is added, never removes manually-added currencies.
4. **Usage-count guard** (spec clarification #2): three `count()` queries (inventory_items, transactions, bills) per removed currency at form-submit time; block on any non-zero.
5. **Legacy-method removal boundary** (spec FR-007): remove methods from `CurrencyService` class, rewrite `useCurrency` hook to back legacy callers via new primitives. No UI file refactor required in this feature.

## Phase 1: Design & Contracts

### Data Model

See `data-model.md`. No new entities; this feature defines the **runtime shape** of currency state held in memory by the service + context. Columns on `stores` already exist per spec 014.

### Contracts

See `contracts/`:
- `currencyService.contract.md` — new public API of `CurrencyService`
- `storeForm.contract.md` — admin form input/output contract, validation rules, submit payload
- `offlineDataContext.contract.md` — new context surface (`acceptedCurrencies`, `preferredCurrency`, `formatAmount`)

### Quickstart

See `quickstart.md` — step-by-step developer walkthrough for verifying Phase 3/4/5 behaviour end-to-end.

### Post-design Constitution re-check

All 14 gates remain PASS. No gate flipped as a consequence of Phase 1 design choices.

## Complexity Tracking

> No constitution violations to justify. Section intentionally empty.
