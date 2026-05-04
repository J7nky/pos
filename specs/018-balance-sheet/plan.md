# Implementation Plan: Balance Sheet Report (Assets / Liabilities / Equity, Comparative Periods)

**Branch**: `018-balance-sheet` | **Date**: 2026-05-04 | **Spec**: [spec.md](./spec.md)
**Input**: Feature specification from `/specs/018-balance-sheet/spec.md`

## Summary

Add a Balance Sheet financial report — the second deliverable in the Phase 1 Financial Statements Pack — that gives owners and accountants a point-in-time view of Assets, Liabilities, and Equity, with optional comparative columns, drill-down to journal entries, multi-currency presentation (with a display-only "Unrealized FX Translation Adjustment" plug to keep each column balanced), single-branch and consolidated-store views, full offline support, and reuse of the existing financial-reports RBAC operation.

The implementation extends the existing `financialStatementService.ts` (already hosting `getTrialBalance`) with `getBalanceSheet`, lifts a small amount of shared GL-aggregation logic into module-private helpers, adds two persisted schema fields (`chart_of_accounts.sub_classification` and `journal_entries.transfer_group_id`), and ships a `BalanceSheet.tsx` report component that mirrors the just-shipped Trial Balance UX. No new RBAC operation is added, no new sync mechanism is introduced, and no existing data flow is broken.

## Technical Context

**Language/Version**: TypeScript 5.x, React 18, Node.js ≥18
**Primary Dependencies**: Dexie v4, Supabase JS v2, React Router 7, Tailwind CSS 3, Vite 7, Electron 38
**Storage**: Supabase (PostgreSQL — remote); IndexedDB via Dexie v4 (local, primary, schema bump 54 → 55)
**Testing**: Vitest (unit tests, service layer)
**Target Platform**: Web (Netlify SPA) + Electron (Windows NSIS x64 desktop)
**Project Type**: offline-first POS web-app + desktop-app
**Performance Goals**: Balance Sheet renders in <3 s for stores up to 100k journal-entry lines; drill-down opens in <1 s for 95% of clicks; works fully offline; sub-100ms local reads from IndexedDB
**Constraints**: offline-capable, multi-currency (USD + LBP + others via Phase 11 JSONB), multilingual (en/ar/fr), RTL layout, RBAC per branch, atomic financial transactions, no server-side ledger RPCs, double-entry only, no UI imports of `lib/db` or `lib/supabase`
**Scale/Scope**: Single-store or multi-branch; 10–100 concurrent sessions per store; expected ~50–200 chart-of-accounts entries per store; up to 100k journal entries scanned per render

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| Gate | Status | Notes |
|------|--------|-------|
| **CG-01** Offline-First Data Flow | PASS | Report reads journal entries and chart of accounts from local Dexie via the existing pattern; no UI-side Supabase access. |
| **CG-02** UI Data Access Boundary | PASS | `BalanceSheet.tsx` consumes a new `useBalanceSheet` hook + `financialStatementService.getBalanceSheet()`. No `lib/db` or `lib/supabase` imports from UI. |
| **CG-03** Event-Driven Sync | PASS | Read-only feature. No new `setInterval`. No event emission. No call to `syncService.sync()`. |
| **CG-04** Financial Atomicity | N/A | Read-only — no financial writes. |
| **CG-05** Client-Side Ledger | PASS | Computation lives in `financialStatementService.ts` (Dexie-only), exactly mirroring the Trial Balance pattern. No new server RPCs. |
| **CG-06** Branch Isolation | PASS | `getBalanceSheet({ storeId, branchId? })` filters via the existing `[store_id+branch_id]` compound index. RBAC layer above prevents non-store-scoped users from selecting "All branches". |
| **CG-07** RBAC Enforcement | PASS | Reuses the existing financial-reports operation key (same as P&L and Trial Balance). No new operation, no new ProtectedRoute pattern. |
| **CG-08** Double-Entry Accounting | N/A | No journal entries created. The "Unrealized FX Translation Adjustment" is a display-only line and is documented as such (FR-016/16a/16b). |
| **CG-09** Schema Consistency | PASS (with explicit migration work) | Adds two columns: `chart_of_accounts.sub_classification` (nullable) and `journal_entries.transfer_group_id` (nullable). Includes Supabase SQL migration **and** Dexie version bump 54 → 55. Both tables already carry `store_id`, `created_at`, `updated_at`, `_synced`, `_lastSyncedAt`, `_deleted` per CG-09 requirements. |
| **CG-10** Multilingual | PASS | All headings/labels go through `createMultilingualFromString()` / `getTranslatedString()` and the `i18n/locales/*` keys are extended. Account names already use multilingual labels. |
| **CG-11** Local Date Extraction | PASS | "End of previous calendar month" default and any "today" defaults use `getLocalDateString()` / `getTodayLocalDate()`. No `new Date().toISOString().split('T')[0]` introduced. |
| **CG-12** Testing Discipline | PASS | `financialStatementService.getBalanceSheet` ships with Vitest coverage (success path + out-of-balance + multi-currency + comparison column). No sync-critical files (§3.XII) are touched, so `pnpm parity:gate` is not required. |
| **CG-13** Shared Package Source of Truth | N/A | No new cross-app utilities. Balance Sheet is store-app-only. The existing `CurrencyCode` import from `@pos-platform/shared` is reused. |
| **CG-14** Undo Payload Storage Boundary | N/A | No undoable user actions in this feature. |

**All gates: PASS or N/A.** No constitutional violations to justify; the Complexity Tracking table at the bottom is empty.

## Project Structure

### Documentation (this feature)

```text
specs/018-balance-sheet/
├── plan.md              # This file
├── research.md          # Phase 0 output
├── data-model.md        # Phase 1 output
├── quickstart.md        # Phase 1 output
├── contracts/
│   └── balance-sheet-service.md   # In-process contract for getBalanceSheet
├── checklists/
│   └── requirements.md  # From /speckit.specify and /speckit.clarify
├── spec.md              # Already authored
└── tasks.md             # Generated by /speckit.tasks (not by /speckit.plan)
```

### Source Code (repository root)

```text
apps/store-app/src/
├── services/
│   └── financialStatementService.ts        # EXTEND: add getBalanceSheet()
├── hooks/
│   └── useBalanceSheet.ts                  # NEW: thin reactive wrapper, mirrors useTrialBalance
├── components/reports/
│   ├── BalanceSheet.tsx                    # NEW: main report component, mirrors TrialBalance.tsx
│   └── JournalEntryDrillDownModal.tsx      # REUSE (already exists from Trial Balance)
├── lib/
│   └── db.ts                               # MODIFY: schema version bump 54 → 55, add new columns to chart_of_accounts and journal_entries (with index on transfer_group_id)
├── types/
│   └── accounting.ts                       # MODIFY: add sub_classification?, transfer_group_id?, classification helpers
├── i18n/locales/
│   ├── en.ts                               # MODIFY: balanceSheet keys
│   ├── ar.ts                               # MODIFY: balanceSheet keys
│   └── fr.ts                               # MODIFY: balanceSheet keys
└── pages/
    └── Reports.tsx                         # MODIFY: add Balance Sheet tab/section, gated by existing financial-reports permission

supabase/migrations/
└── YYYYMMDD_balance_sheet_schema.sql       # NEW: ALTER TABLE chart_of_accounts ADD COLUMN sub_classification text;
                                            #      ALTER TABLE journal_entries ADD COLUMN transfer_group_id text;
                                            #      CREATE INDEX idx_je_transfer_group_id ON journal_entries(transfer_group_id) WHERE transfer_group_id IS NOT NULL;
                                            #      Backfill chart_of_accounts.sub_classification from account_code ranges (idempotent).

apps/store-app/src/services/__tests__/
└── financialStatementService.balanceSheet.test.ts   # NEW: Vitest coverage for getBalanceSheet
```

**Structure Decision**: Extend the existing `financialStatementService` rather than create a parallel `balanceSheetService`. Rationale: the Trial Balance helpers (`fetchEntries`, `addAmount`, `endOfDayIso`, `startOfDayIso`, `isDebitNormal`, `BALANCE_EPSILON`) are needed verbatim. Splitting them into a sibling file would either duplicate or force a third helper module. The service is currently 249 lines and well within the codebase's monolith threshold (§8.C lists 1,300+ lines as the warning floor). Inside the file the new code lives behind explicit `getBalanceSheet` / private `buildBalanceSheetSection` helpers so the domain split is clear without a new file.

The UI mirrors the just-shipped Trial Balance trio — `useBalanceSheet` (hook) + `BalanceSheet.tsx` (component) + reuse of `JournalEntryDrillDownModal.tsx` — to keep the Reports page consistent for users and reviewers.

## Complexity Tracking

> No Constitution Check violations. Table intentionally empty.

| Violation | Why Needed | Simpler Alternative Rejected Because |
|-----------|------------|-------------------------------------|
| _(none)_  | _(n/a)_    | _(n/a)_                              |
