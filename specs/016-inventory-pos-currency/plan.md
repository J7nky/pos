# Implementation Plan: Inventory Multi-Currency Pricing & POS Sell-Flow Currency Enforcement

**Branch**: `016-inventory-pos-currency` | **Date**: 2026-04-21 | **Spec**: [spec.md](./spec.md)
**Input**: Feature specification from `/specs/016-inventory-pos-currency/spec.md`

## Summary

Enforce currency correctness in the two hottest write paths of the store-app — **inventory creation** and **POS bill settlement** — now that specs 013/014/015 have landed the shared `CurrencyCode` union, the `country`/`accepted_currencies` columns, and the multi-currency-aware `CurrencyService` + offline-data context. This feature tightens `inventory_items.currency` and `bills.currency` from optional/loose types to required `CurrencyCode`, adds accepted-currency guards on every write, converts mixed-currency cart lines into the bill's settlement currency using `currencyService.convert` (banker's-rounded to the bill currency's decimals), adds a cashier-facing settlement-currency picker to the POS (today the bill implicitly takes `preferredCurrency`), and deletes the three remaining silent fallbacks in the selling/transaction/sync path (`|| 'USD'` in `useTransactionDataLayer`, `|| 'LBP'` in `syncDownload`, `preferred_currency: 'USD'` default in `syncService.ensureStoreExists`).

No Supabase migrations and no Dexie schema bump are required — the underlying columns already exist (spec 014) and are already indexed where needed. This feature is **type-tightening + write-path validation + UI wiring + three fallback removals**, plus the conversion arithmetic on the sell flow.

## Technical Context

**Language/Version**: TypeScript 5.x, React 18, Node.js ≥18
**Primary Dependencies**: Dexie v4, Supabase JS v2, React Router 7, Tailwind CSS 3, Vite 7, Electron 38
**Storage**: Supabase (PostgreSQL — remote); IndexedDB via Dexie v4 (local, primary). No schema changes in this feature — consumes columns introduced by spec 014.
**Testing**: Vitest (unit tests for operations modules, service layer, and the sync fallbacks). `pnpm parity:gate` MUST pass — sync-critical files (`syncDownload.ts`, `syncService.ts`) are touched.
**Target Platform**: Web (Netlify SPA) + Electron (Windows NSIS x64 desktop)
**Project Type**: offline-first POS web-app + desktop-app (monorepo with `apps/store-app`, `apps/admin-app`, `packages/shared`)
**Performance Goals**: Adding one line item to a bill must not exceed 16 ms of conversion + validation overhead at p95 on reference Electron hardware (NFR-004). No regression vs current single-currency baseline.
**Constraints**: offline-capable, multi-currency, multilingual (en/ar/fr), RTL, RBAC per branch, atomic financial transactions via `transactionService`. No server-side ledger RPCs. Journal-entry columns (`debit_usd/credit_usd/debit_lbp/credit_lbp`) remain unchanged — stores operating outside LBP/USD continue to map journal amounts into those two columns via existing conversion; Phase 11 owns the JSONB generalization.
**Scale/Scope**: Touches the store-app only (admin-app untouched in this feature). Affected files: 2 type files, 3 operations modules, 2 hooks, 1 context file, 1 POS page, 1 inventory form component, 2 sync service files. 0 shared-package files (all consumed).

## Constitution Check

*Gate: all gates below must pass before Phase 0 research; re-checked after Phase 1 design.*

| Gate | Principle | Status | Evidence |
|------|-----------|--------|----------|
| **CG-01** | Offline-First Data Flow | ✅ Pass | All writes continue to land in Dexie first (via operations modules), then sync. No UI code writes to Supabase directly. |
| **CG-02** | UI Data Access Boundary | ✅ Pass | POS + Inventory UI consume only `hooks/useCurrency` and `contexts/OfflineDataContext`. No new imports of `lib/db` or `lib/supabase` from UI. Settlement-currency picker reads state from context, not Dexie. |
| **CG-03** | Event-Driven Sync + Upload-Then-Emit | ✅ Pass | No new timers or polling. `syncService.ensureStoreExists` and `syncDownload` paths are modified in-place; the event pipeline is unchanged. |
| **CG-04** | Financial Atomicity via `transactionService` | ✅ Pass | Bill + line-item writes continue through `transactionService.createTransaction()` — the per-line unit-price conversion happens **before** the service call, so the atomic unit of work is unchanged. |
| **CG-05** | Client-Side Ledger Computation | ✅ Pass | No new server RPCs. Conversion happens client-side using the already-loaded `currencyService` rate map. |
| **CG-06** | Branch-Level Isolation | ✅ Pass | `branch_id` is already carried on all inventory and bill writes; this feature does not change scoping. |
| **CG-07** | RBAC Enforcement | ✅ Pass | POS and Inventory routes remain behind their existing `ProtectedRoute` wrappers. No new operations are exposed. |
| **CG-08** | Double-Entry Accounting | ✅ Pass | `journalService` still produces balanced debits=credits per entry. Journal columns unchanged by this feature (see Technical Context note on Phase 11). |
| **CG-09** | Schema Consistency | ✅ Pass | No schema changes. Only TypeScript tightening of existing `Row`/`Insert`/`Update` types for `inventory_items.currency` and `bills.currency`. Spec 014's migration already added the underlying columns. No Dexie version bump needed — `inventory_items.currency` is indexed in v56, and `bills.currency` is a non-indexed column whose indexing is explicitly **not** required by any new query in this feature (reports-by-currency are out of scope). |
| **CG-10** | Multilingual by Default | ✅ Pass | All new user-facing error messages (FR-002, FR-010, FR-014, FR-015) are added via `createMultilingualFromString` / the i18n locale files in all three languages (en/ar/fr) — see SC-005. |
| **CG-11** | Local Date Extraction | ✅ Pass | No new date derivations. |
| **CG-12** | Testing Discipline | ✅ Pass | New/updated Vitest suites ship alongside every touched operations module (inventory, bill, sale) and the transaction data layer; the two sync files trigger the parity gate. See "Tests" section below. |
| **CG-13** | Shared Package as Source of Truth | ✅ Pass | Every currency constant (`CurrencyCode`, `CURRENCY_META`, `getDefaultCurrenciesForCountry`) is imported from `@pos-platform/shared`. No duplication in `apps/store-app`. |
| **CG-14** | Undo Payload Storage Boundary | ✅ Pass | This feature does not touch undo state. |

**Gate decision**: PASS — proceed to Phase 0. No Complexity Tracking entries required.

## Project Structure

### Documentation (this feature)

```text
specs/016-inventory-pos-currency/
├── plan.md              # This file (/speckit.plan output)
├── spec.md              # Feature spec (authored + validated)
├── research.md          # Phase 0 output
├── data-model.md        # Phase 1 output
├── quickstart.md        # Phase 1 output
├── contracts/           # Phase 1 output
│   ├── inventory-write.contract.md
│   ├── pos-sell-flow.contract.md
│   ├── transaction-data-layer.contract.md
│   └── sync-fallbacks.contract.md
├── checklists/
│   └── requirements.md  # Created during /speckit.specify
└── tasks.md             # Phase 2 output (/speckit.tasks — NOT created by this command)
```

### Source Code (repository root)

```text
apps/
└── store-app/src/
    ├── types/
    │   ├── inventory.ts                                              ← EDIT: currency?: 'USD'|'LBP' → currency: CurrencyCode (required)
    │   └── database.ts                                               ← EDIT: inventory_items.Row/Insert/Update.currency → required CurrencyCode; bills.Row/Insert/Update.currency → CurrencyCode
    ├── contexts/
    │   ├── OfflineDataContext.tsx                                    ← EDIT: thread settlementCurrency from POS picker into createBill/updateSale; keep preferredCurrency as the picker default
    │   └── offlineData/
    │       ├── useTransactionDataLayer.ts                            ← EDIT: remove `|| 'USD'` fallback at line 74; throw on missing/invalid currency with descriptive error
    │       └── operations/
    │           ├── inventoryItemOperations.ts                        ← EDIT: add `assertAcceptedCurrency` guard on addInventoryItem/updateInventoryItem; propagate error to UI
    │           ├── billOperations.ts                                 ← EDIT: require currency param; guard against non-accepted currency at createBill
    │           ├── saleOperations.ts                                 ← EDIT: convert each line's unit_price from item.currency → bill.currency via currencyService; round to bill currency decimals
    │           └── __tests__/
    │               ├── inventoryItemOperations.test.ts               ← NEW or EXTEND: happy path + non-accepted currency rejection
    │               ├── billOperations.test.ts                        ← NEW or EXTEND: happy path + non-accepted currency rejection
    │               └── saleOperations.test.ts                        ← NEW or EXTEND: mixed-currency line conversion + rounding
    ├── pages/
    │   ├── POS.tsx                                                   ← EDIT: add settlement-currency picker at new-bill start; pass selection into context; block mid-bill change when lines exist
    │   └── Inventory.tsx                                             ← EDIT: currency dropdown sourced from useCurrency().acceptedCurrencies, default preferredCurrency, symbol shown beside price input
    ├── components/inventory/
    │   └── ReceiveFormModal.tsx (or equivalent)                      ← EDIT: currency selector wiring (same as Inventory.tsx for the alt-form path)
    ├── services/
    │   ├── syncDownload.ts                                           ← EDIT: replace `|| 'LBP'` at lines 72/101 with structured warning + skip currency-dependent operation when store row absent
    │   └── syncService.ts                                            ← EDIT: ensureStoreExists (line 621) seeds country/preferred_currency/accepted_currencies from Supabase row; remove hardcoded 'USD' fallback; fall back to getDefaultCurrenciesForCountry only when Supabase row truly lacks the fields
    └── locales/
        ├── en.json                                                   ← EDIT: new keys for currency validation errors (inventory.currencyNotAccepted, bill.settlementNotAccepted, bill.conversionRateMissing, transaction.currencyMissing)
        ├── ar.json                                                   ← EDIT: Arabic translations of new keys
        └── fr.json                                                   ← EDIT: French translations of new keys

apps/admin-app/                                                       ← UNCHANGED (admin form wiring lives in spec 015)
packages/shared/                                                      ← UNCHANGED (all constants already exported by specs 013/014)
supabase/migrations/                                                  ← UNCHANGED (no schema changes)
```

**Structure Decision**: Monorepo. This feature edits the `store-app` only. No new files outside the spec directory except the three Vitest suites and the i18n key additions. No schema changes of any kind. No Dexie bump — the existing v56 indexing is sufficient (inventory_items.currency is indexed; bills.currency is queried only by parent-bill-id, never filtered by currency alone).

## Phase 0: Outline & Research

See [`research.md`](./research.md). Five design decisions are resolved:

1. **Banker's rounding implementation** (spec FR-021): use a small in-repo helper `roundHalfEven(value, decimals)` rather than pulling in a dependency. Rationale: tiny, predictable, auditable.
2. **Conversion timing** (spec FR-011): convert each line eagerly at add-to-cart, not lazily at bill save. Rationale: the rounded `unit_price` is what the cashier sees on-screen and what must match the receipt; deferring conversion means the cashier sees approximate totals until save, which erodes trust.
3. **Settlement-currency picker placement** (spec FR-009, User Story 1): picker lives on the new-bill / new-tab initiator in `POS.tsx`, defaulting to `preferredCurrency`. For backward compatibility, stores whose `acceptedCurrencies.length === 1` skip the picker (deterministic selection).
4. **Legacy bill grandfathering** (spec edge-case): no migration is written for in-flight bills. The enforcement guards only fire on **new** bill creation; existing unsettled bills retain whatever `currency` the old `|| 'USD'` fallback wrote.
5. **Sync-download warning channel** (spec FR-016): emit via `comprehensiveLoggingService` at `WARN` level with a structured payload `{ op: 'syncDownload.*', expectedStoreId, action: 'skip' }`. Rationale: the project already has a logging service (§4.5); do not introduce console.warn.

## Phase 1: Design & Contracts

**Prerequisites**: `research.md` complete (see Phase 0).

### Data Model

See [`data-model.md`](./data-model.md). This feature introduces **no new entities and no schema changes**. The data-model doc captures the **tightened runtime shapes** for `InventoryItem`, `Bill`, and `BillLineItem`, plus the invariants this feature enforces.

### Contracts

See [`contracts/`](./contracts). Four contract documents capture the inbound/outbound behaviour of the touched modules:

- `inventory-write.contract.md` — preconditions, postconditions, and error modes of `addInventoryItem` / `updateInventoryItem`.
- `pos-sell-flow.contract.md` — settlement-currency picker contract, line-item conversion contract, bill persistence contract.
- `transaction-data-layer.contract.md` — `useTransactionDataLayer`'s hardened input contract (no more silent currency fallback).
- `sync-fallbacks.contract.md` — the new behaviours of `syncDownload` and `syncService.ensureStoreExists` when the local store row is absent or remote fields are missing.

### Quickstart

See [`quickstart.md`](./quickstart.md) — developer walkthrough for verifying Phase 6 + Phase 7 behaviour end-to-end: (a) Lebanese store mixed-currency bill, (b) programmatic rejection of invalid currency, (c) empty-stores sync-download warning path.

### Agent context update

Run `.specify/scripts/bash/update-agent-context.sh claude` after Phase 1 files are committed.

### Post-design Constitution re-check

All 14 gates re-evaluated after Phase 1 design choices; all remain PASS. The key thing worth re-confirming is CG-04 (transaction atomicity): the pre-save conversion of line-item unit prices happens inside the context's `updateSale` orchestration before `transactionService.createTransaction` is invoked, keeping the atomic unit of work unchanged. Gate remains PASS.

## Complexity Tracking

> No constitution violations to justify. Section intentionally empty.
