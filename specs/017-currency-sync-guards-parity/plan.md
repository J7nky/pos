# Implementation Plan: Sync Upload Currency Guards, Admin Balance-Migration Cleanup, and Multi-Currency Parity Coverage

**Branch**: `017-currency-sync-guards-parity` | **Date**: 2026-04-26 | **Spec**: [spec.md](./spec.md)
**Input**: Feature specification from `/specs/017-currency-sync-guards-parity/spec.md`

## Summary

Implements Phase 8 + Phase 9 of the 008 multi-currency rollout. Three small, parallel-safe deliverables:

1. **Pre-upload currency guard in `syncUpload.ts`** — rejects `inventory_items` and `transactions` with missing or non-`CURRENCY_META` `currency` *before* the batch is sent to Supabase. Failed records stay in local Dexie (not deleted — distinct from existing `deleteProblematicRecord` for FK violations) and are recorded in a per-cycle error list with structured reason. Soft-deletes bypass the guard.
2. **Admin `balanceMigrationService` defaults to the target store's `preferred_currency`** — replaces the hardcoded `currency = 'LBP'` default. When no explicit override is supplied, the service fetches the store row from Supabase (admin-app has no Dexie), reads `preferred_currency`, and uses that. Throws if neither override nor `preferred_currency` is available. Public method signatures retype `'USD' | 'LBP'` → `CurrencyCode`. `subscriptionService.ts` keeps `'USD'` for billing but adds an inline comment marking the literal as intentional and global.
3. **Parity fixtures + UAE scenario** — every fixture store row in `apps/store-app/tests/sync-parity/` gains `country` and `accepted_currencies`. At least one new scenario exercises a UAE store (`country='AE'`, `preferred_currency='AED'`, `accepted_currencies=['AED','USD']`) with priced inventory and transaction rows in AED. The golden snapshot is regenerated and committed.

No schema changes. No new RPCs. No UI. The guard and the migration default are the only behavioural changes.

## Technical Context

**Language/Version**: TypeScript 5.x, React 18, Node.js ≥18
**Primary Dependencies**: Dexie v4, Supabase JS v2, React Router 7, Tailwind CSS 3, Vite 7, Electron 38
**Storage**: Supabase (PostgreSQL — remote); IndexedDB via Dexie v4 (local, primary). No schema changes in this feature — consumes columns introduced by spec 014 and the `CURRENCY_META` registry from spec 013.
**Testing**: Vitest (unit tests). Sync-parity gate via `pnpm parity:gate` (Vitest under `apps/store-app/tests/sync-parity/` + scripts in `apps/store-app/scripts/parity-*.mjs`).
**Target Platform**: Web (Netlify SPA) + Electron (Windows NSIS x64 desktop). Admin-app runs on web only.
**Project Type**: offline-first POS web-app + desktop-app, plus admin-app SPA
**Performance Goals**: Pre-upload guard adds at most one synchronous validation pass per record per upload batch — must not measurably increase upload latency for clean batches (target: <1ms per record). Parity gate runtime increase from one extra scenario: bounded by the same Vitest budget already in place (currently <30s).
**Constraints**: offline-capable, multi-currency (now any `CurrencyCode`, no longer USD+LBP only), multilingual (en/ar/fr), atomic financial transactions, no new server-side ledger RPCs, no UI changes.
**Scale/Scope**: Single-store or multi-branch; 10–100 concurrent sessions per store. Upload batches up to a few hundred records per cycle in practice.

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| Gate | Principle | Status | Reasoning |
|---|---|---|---|
| **CG-01** | Offline-First Data Flow | ✅ PASS | Guard runs *between* "row is in IndexedDB" and "row is sent to Supabase". IndexedDB remains the source of truth; rejected rows stay local, marked `_synced=false`, available for the user to fix. |
| **CG-02** | UI Data Access Boundary | ✅ PASS | No UI files touched. `syncUpload.ts` is in `services/` (allowed); `balanceMigrationService.ts` is admin-app `services/` (allowed). |
| **CG-03** | Event-Driven Sync | ✅ PASS | No new `setInterval`. No change to upload-then-emit ordering — the guard runs strictly before upload, and emission still happens only after confirmed Supabase upsert. The existing `record.currency || 'USD'` in the event-emission block at upload-site (line 783) is removed by the same guard (rejected rows never reach the emission path). |
| **CG-04** | Financial Atomicity | ✅ PASS | No financial transactions created in this feature. The admin-app migration still routes through the existing `migrate_opening_balance` RPC which is atomic by construction; this feature only changes what `currency` is passed to that RPC. |
| **CG-05** | Client-Side Ledger | ✅ PASS | No new server-side ledger RPC. We continue using the already-deployed `migrate_opening_balance` / `migrate_opening_balances_bulk` RPCs unchanged. |
| **CG-06** | Branch Isolation | N/A | Sync-engine internals and super-admin migration. No new user-facing branched data. |
| **CG-07** | RBAC Enforcement | N/A | No new user-facing routes or operations. The admin migration is already gated behind super-admin. |
| **CG-08** | Double-Entry Accounting | ✅ PASS | Journal entries are created by the existing RPC, which already enforces balanced debits/credits. We only change the currency code stored on those entries. |
| **CG-09** | Schema Consistency | N/A | No new tables, no schema changes. Consumes columns added in spec 014. No Dexie version bump needed. |
| **CG-10** | Multilingual | N/A | All new strings are engineer-facing log lines and error reasons (`'invalid-currency'`, `'unknown-currency'`) — not user-facing UI. No multilingual concern. |
| **CG-11** | Local Date Extraction | N/A | No date logic touched. |
| **CG-12** | Testing Discipline | ✅ PASS | New Vitest suites colocated with each modified file: `syncUpload.currency.test.ts` (currency-guard happy path + rejection + sibling-not-blocked + retry-stability), `balanceMigrationService.test.ts` (store-default + explicit-override + missing-source-throws + type signature). `pnpm parity:gate` is the explicit success gate for Phase 9 (FR-015) and is in the constitution's sync-critical file list. |
| **CG-13** | Shared Package Source of Truth | ✅ PASS | `CurrencyCode` and `CURRENCY_META` are imported from `@pos-platform/shared`. The `balanceMigrationService` retype to `CurrencyCode` is a *consolidation* (removes a duplicate literal union), strengthening this gate. |
| **CG-14** | Undo Payload Storage Boundary | N/A | No undo work. |

**Result:** All 14 gates either PASS or are explicitly N/A. No violations to track in Complexity Tracking.

## Project Structure

### Documentation (this feature)

```text
specs/017-currency-sync-guards-parity/
├── plan.md              # This file
├── research.md          # Phase 0 output
├── data-model.md        # Phase 1 output
├── quickstart.md        # Phase 1 output
├── contracts/           # Phase 1 output
│   ├── upload-currency-guard.contract.md
│   ├── balance-migration-currency.contract.md
│   └── parity-fixture.contract.md
├── checklists/
│   └── requirements.md  # Already created by /speckit.specify
└── tasks.md             # Phase 2 output (created by /speckit.tasks)
```

### Source Code (repository root)

```text
apps/store-app/
├── src/
│   └── services/
│       ├── syncUpload.ts                                ← MODIFY (add pre-upload currency guard, remove `record.currency || 'USD'` in event emission)
│       └── __tests__/
│           └── syncUpload.currency.test.ts              ← NEW (CG-12 coverage)
└── tests/
    └── sync-parity/
        ├── paritySync.scenarios.test.ts                 ← MODIFY (extend fixtures + add UAE/AED scenario)
        ├── paritySync.chaos.test.ts                     ← MODIFY (fixture: add country + accepted_currencies)
        ├── parityFieldRegistry.ts                       ← MODIFY if needed (register country + accepted_currencies for stores)
        ├── paritySupabaseMock.ts                        ← INSPECT (verify it accepts the new fields without coercion)
        ├── paritySync.scenarios.test.ts.snap            ← REGENERATE & commit (golden snapshot)
        └── (other parity files)                         ← INSPECT only

apps/admin-app/
└── src/
    └── services/
        ├── balanceMigrationService.ts                   ← MODIFY (currency default, signature retype, throw-on-missing)
        ├── subscriptionService.ts                       ← MODIFY (inline intentional-USD comment only)
        └── __tests__/
            └── balanceMigrationService.test.ts          ← NEW or EXTEND (CG-12 coverage)

packages/shared/                                          ← READ ONLY
└── (no changes — consumes CurrencyCode + CURRENCY_META)
```

**Structure Decision**: Spec 008 ships in 12 phases; this feature lands phases 8–9 only. The change set is narrow (3 production files in 2 apps + 2 test files in store-app + 1 test file in admin-app + parity fixtures). All test files are colocated under each modified service's `__tests__/` directory per the existing convention in §2.2. The parity fixtures live where the harness already keeps them (`apps/store-app/tests/sync-parity/`).

## Complexity Tracking

> No constitution gates failed. This section is intentionally empty.

| Violation | Why Needed | Simpler Alternative Rejected Because |
|-----------|------------|-------------------------------------|
| _(none)_  | _(n/a)_    | _(n/a)_ |
