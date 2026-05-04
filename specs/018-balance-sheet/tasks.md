---
description: "Task list for Balance Sheet (018-balance-sheet)"
---

# Tasks: Balance Sheet Report (Assets / Liabilities / Equity, Comparative Periods)

**Input**: Design documents from `/home/janky/Desktop/pos-1/specs/018-balance-sheet/`
**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/balance-sheet-service.md, quickstart.md

**Tests**: Required by CG-12 (Testing Discipline). Vitest tests for `getBalanceSheet` are first-class tasks below.

**Organization**: Tasks are grouped by user story so each can be implemented and tested independently.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: Which user story this task belongs to (US1, US2, US3, US4, US5)
- All file paths are absolute under `/home/janky/Desktop/pos-1/`

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Confirm the workspace is ready. The project is mature — no new tooling, no new package, no scaffolding.

- [X] T001 Verify `pnpm dev:store` boots cleanly on the current branch and the existing Reports page renders the Trial Balance report — confirms baseline before any change at `/home/janky/Desktop/pos-1/apps/store-app`.
- [X] T002 [P] Skim `/home/janky/Desktop/pos-1/apps/store-app/src/services/financialStatementService.ts`, `/home/janky/Desktop/pos-1/apps/store-app/src/hooks/useTrialBalance.ts`, and `/home/janky/Desktop/pos-1/apps/store-app/src/components/reports/TrialBalance.tsx` to internalize the patterns to mirror.

**Checkpoint**: Repository on branch `018-balance-sheet`; existing Trial Balance page renders.

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Persist the two new schema fields and update the domain types. Every user story below depends on these being in place.

**⚠️ CRITICAL**: No user-story work can begin until this phase completes.

- [X] T003 Write the Supabase SQL migration at `/home/janky/Desktop/pos-1/supabase/migrations/20260504_balance_sheet_schema.sql`: `ALTER TABLE public.chart_of_accounts ADD COLUMN sub_classification text NULL`; `ALTER TABLE public.journal_entries ADD COLUMN transfer_group_id text NULL`; partial index `CREATE INDEX idx_je_transfer_group_id ON public.journal_entries(transfer_group_id) WHERE transfer_group_id IS NOT NULL`; CHECK constraint enforcing the `sub_classification` ↔ `account_type` partition rules from `data-model.md`; idempotent backfill of `sub_classification` from `account_code` ranges per `research.md` R2.
- [X] T004 Bump Dexie schema from version 54 to 55 in `/home/janky/Desktop/pos-1/apps/store-app/src/lib/db.ts`. Declare the new compound index `[store_id+transfer_group_id]` on `journal_entries`. No row rewrite — the upgrade callback is empty by design.
- [X] T005 [P] Update domain types in `/home/janky/Desktop/pos-1/apps/store-app/src/types/accounting.ts`: add `sub_classification: AccountSubClassification | null` on `ChartOfAccounts` and `transfer_group_id?: string | null` on `JournalEntry`. Export the `AccountSubClassification`, `AssetSubClassification`, `LiabilitySubClassification`, `EquitySubClassification` unions exactly as defined in `data-model.md`. Resolve any TypeScript errors in callers that emerge from widening the literal union.
- [X] T006 [P] Add `reports.balanceSheet.*` i18n keys to `/home/janky/Desktop/pos-1/apps/store-app/src/i18n/locales/en.ts` per the list in `research.md` R13.
- [X] T007 [P] Add `reports.balanceSheet.*` i18n keys to `/home/janky/Desktop/pos-1/apps/store-app/src/i18n/locales/ar.ts`.
- [X] T008 [P] Add `reports.balanceSheet.*` i18n keys to `/home/janky/Desktop/pos-1/apps/store-app/src/i18n/locales/fr.ts`.
- [ ] T009 Apply the SQL migration to the dev Supabase project, confirm it is idempotent (re-run = no-op), and reload the store-app to verify the Dexie v54 → v55 upgrade succeeds against a populated local IndexedDB without losing data.

**Checkpoint**: Both new fields are persisted; Dexie is on v55; `accounting.ts` compiles; the i18n keys exist; the migration ran successfully against the dev environment.

---

## Phase 3: User Story 1 — Owner views the current Balance Sheet (Priority: P1) 🎯 MVP

**Goal**: Render a balanced single-column Balance Sheet for an as-of date, scoped to a branch or "All branches", with the equation strip at the bottom and a variance indicator when GL is unbalanced.

**Independent Test**: Seed a known set of journal entries, open the new Reports → Balance Sheet view with today as the as-of date, and verify totals tie to the Trial Balance for the same date and that Assets = Liabilities + Equity.

### Vitest tests for User Story 1 (CG-12)

> **Write these first, ensure they FAIL against an unimplemented `getBalanceSheet`, then proceed to implementation.**

- [ ] T010 [P] [US1] Vitest fixture + test: balanced GL → single-column report has Assets = Liabilities + Equity exactly per currency (file: `/home/janky/Desktop/pos-1/apps/store-app/src/services/__tests__/financialStatementService.balanceSheet.test.ts`).
- [ ] T011 [P] [US1] Vitest test (same file): unbalanced GL → `isBalanced=false`, `variance` populated, `gl_unbalanced` warning appended; report still renders.
- [ ] T012 [P] [US1] Vitest test (same file): soft-deleted journal entries (`_deleted=true`) are excluded from totals.
- [ ] T013 [P] [US1] Vitest test (same file): as-of date prior to first entry → all balances zero, no error, empty-state friendly result.
- [ ] T014 [P] [US1] Vitest test (same file): YTD revenue/expense rolled into a synthetic "Current Year Earnings" Equity line (FR-003).
- [ ] T015 [P] [US1] Vitest test (same file): account with `account_type` outside the allowed set → defensively included with `unmapped_subclassification` warning.
- [ ] T016 [P] [US1] Vitest test (same file): `hideZeroBalanceAccounts=true` (default) hides zero-balance lines; `false` keeps them.

### Implementation for User Story 1

- [X] T017 [US1] In `/home/janky/Desktop/pos-1/apps/store-app/src/services/financialStatementService.ts`, lift any `getTrialBalance` helpers needed by both reports into module-private functions (do not change `getTrialBalance`'s public signature). Helpers: `fetchEntries`, `addAmount`, `endOfDayIso`, `startOfDayIso`, `isDebitNormal`, `BALANCE_EPSILON`.
- [X] T018 [US1] In the same file, export the new types: `BalanceSheetSection`, `PresentationMode`, `BalanceSheetFilters`, `BalanceSheetLine`, `BalanceSheetSubtotal`, `BalanceSheetColumn`, `BalanceSheetReport`, `BalanceSheetWarning` exactly as defined in `data-model.md`.
- [X] T019 [US1] In the same file, implement `getBalanceSheet(filters)` for the single-column path: fetch journal entries up to `asOfDate`, fetch chart of accounts, group by account, compute signed native-currency balances using `amountsFromLegacyEntry` + `getDebit` / `getCredit`, classify lines by `account_type` + `sub_classification`, compute subtotals in fixed display order, populate `columns[0]` with `isBalanced` / `variance` / `currentYearEarnings` (use `getLocalDateString` for FY start).
- [X] T020 [US1] In the same file, append the namespace export: `export const financialStatementService = { getTrialBalance, getBalanceSheet };` Confirm Vitest tests T010–T016 all pass.
- [X] T021 [US1] Create `/home/janky/Desktop/pos-1/apps/store-app/src/hooks/useBalanceSheet.ts` mirroring `useTrialBalance.ts`: inputs `{ asOfDate, branchId?, hideZeroBalanceAccounts? }` for now (comparison/presentation come in later stories); outputs `{ report, isLoading, error, regenerate }`. Defaults derived using `getTodayLocalDate()` per CG-11.
- [X] T022 [US1] Create `/home/janky/Desktop/pos-1/apps/store-app/src/components/reports/BalanceSheet.tsx` mirroring the layout of `TrialBalance.tsx`: as-of date picker, branch filter, "show zero balances" toggle, sectioned table (Current Assets → Non-Current Assets → Current Liabilities → Non-Current Liabilities → Equity), subtotals, grand totals, equation strip, variance indicator. All visible text via `getTranslatedString()` against the keys added in T006/T007/T008.
- [X] T023 [US1] Wire the new component into `/home/janky/Desktop/pos-1/apps/store-app/src/pages/Reports.tsx`: add a Balance Sheet tab/button under the same RBAC gate as the Trial Balance entry (existing financial-reports operation). Verify a branch-scoped user does not see "All branches" in the branch picker (FR-019a).

**Checkpoint**: An owner can open Reports → Balance Sheet, pick today, and see a balanced statement that ties to the Trial Balance. MVP is shippable here.

---

## Phase 4: User Story 2 — Comparative period view (Priority: P1)

**Goal**: One or more comparison columns alongside the primary as-of date, with absolute and percentage variance per line, defaulting to "End of previous calendar month" on first open.

**Independent Test**: Open the report, confirm the default comparison column is end-of-previous-month, change it, add a second one, verify each column independently equals what a single-date Balance Sheet for that date would produce.

### Vitest tests for User Story 2

- [ ] T024 [P] [US2] Vitest test (same file as T010): two as-of dates → both columns produced; each column independently balances; variance columns equal arithmetic difference and percentage; zero-baseline cases handled without runtime errors.

### Implementation for User Story 2

- [ ] T025 [US2] Extend `getBalanceSheet` in `/home/janky/Desktop/pos-1/apps/store-app/src/services/financialStatementService.ts` to accept `filters.comparisons: string[]` and produce one `BalanceSheetColumn` per as-of date plus a primary column. Each column reuses the same aggregation pass with a date filter; total complexity stays `O((1 + |comparisons|) × N)`.
- [ ] T026 [US2] Update `/home/janky/Desktop/pos-1/apps/store-app/src/hooks/useBalanceSheet.ts` to accept `comparisons` and to compute the default `["end of previous calendar month"]` using `getLocalDateString(new Date(today.getFullYear(), today.getMonth(), 0))` when the user has not saved a different default.
- [ ] T027 [US2] Update `/home/janky/Desktop/pos-1/apps/store-app/src/components/reports/BalanceSheet.tsx` to render comparison columns side-by-side, an "Add comparison column" control with quick-pick presets ("End of last month", "End of same month last year", "End of last fiscal year", "Custom date") and a "Remove" affordance per column. Add an absolute + percentage variance column between primary and each comparison column (FR-009). Preserve the existing single-column layout when `comparisons` is empty.

**Checkpoint**: User can compare any two periods; default open already shows end-of-previous-month; both P1 stories are now complete.

---

## Phase 5: User Story 3 — Drill-down to journal entries (Priority: P2)

**Goal**: Clicking any non-zero amount on the report (line or subtotal) opens a list of the underlying journal entries that produced that balance, with links to the source document.

**Independent Test**: Click any non-zero amount; verify the modal opens; verify the sum of the listed entries equals the displayed amount.

### Implementation for User Story 3

- [ ] T028 [US3] In `/home/janky/Desktop/pos-1/apps/store-app/src/components/reports/BalanceSheet.tsx`, attach the existing `JournalEntryDrillDownModal` (already used by Trial Balance, file: `/home/janky/Desktop/pos-1/apps/store-app/src/components/reports/JournalEntryDrillDownModal.tsx`) to clicks on each line's amount. Pass: `account_code`, the column's `asOfDate` as the upper bound, the universe of entries from the start of time as the lower bound, and `branchId` (or undefined for All branches with the same elimination rule applied).
- [ ] T029 [US3] In the same component, attach drill-down to subtotal rows (Current Assets total, Non-Current Assets total, Current Liabilities total, Non-Current Liabilities total, Equity total): aggregate the entries from every account within that section.
- [ ] T030 [P] [US3] Vitest test (same test file as T010): for any account with non-zero balance produced by `getBalanceSheet`, the sum of the entries that the drill-down would surface equals the displayed line amount to `BALANCE_EPSILON` (tested at the data layer — service guarantees `sum(entries) == line.balance`).

**Checkpoint**: User can audit any number on the report by clicking through to the underlying postings.

---

## Phase 6: User Story 4 — Multi-currency presentation (Priority: P2)

**Goal**: USD-only / LBP-only / dual-column presentation modes; per-column "Unrealized FX Translation Adjustment" plug inside Equity that keeps every column balanced regardless of mixed-currency activity; "All branches" view eliminates inter-branch transfers via `transfer_group_id`.

**Independent Test**: With mixed-currency JEs, switch presentation mode; verify each column balances after the FX adjustment line; with "All branches", verify inter-branch transfers (paired by `transfer_group_id`) net to zero.

### Vitest tests for User Story 4

- [ ] T031 [P] [US4] Vitest test (same test file as T010): dual mode → native columns + presentation column populated; "Unrealized FX Translation Adjustment" line in Equity per column makes each column balance to the smallest currency unit.
- [ ] T032 [P] [US4] Vitest test (same file): missing FX rate for a comparison date → `fx_rate_missing` warning emitted; affected presentation values undefined; column not silently substituted.
- [ ] T033 [P] [US4] Vitest test (same file): "All branches" view with two transfer legs sharing the same `transfer_group_id` and netting to zero per currency → both legs eliminated; same legs without a `transfer_group_id` → retained AND `missing_transfer_group_id` warning emitted.
- [ ] T034 [P] [US4] Vitest test (same file): single-branch view with the same transfers → entries appear normally (FR-007a).

### Implementation for User Story 4

- [ ] T035 [US4] Extend `getBalanceSheet` in `/home/janky/Desktop/pos-1/apps/store-app/src/services/financialStatementService.ts` to honor `presentationMode` and `presentationCurrency`. For non-dual modes, translate every `nativeBalance` per line per column using the exchange rate effective on that column's `asOfDate` (read from the existing currency/exchange-rate store). Throw `Error('presentationCurrency required when presentationMode is not "dual"')` when the input is incomplete.
- [ ] T036 [US4] In the same function, compute the per-column "Unrealized FX Translation Adjustment" residual that makes Assets = Liabilities + Equity in the presentation currency, and emit it as a synthetic Equity line (FR-016/16a/16b). Recompute independently per column.
- [ ] T037 [US4] In the same function, when `branchId` is undefined, group entries by `transfer_group_id`, drop groups whose per-currency net is within `BALANCE_EPSILON`, retain non-zero-net groups AND append a `missing_transfer_group_id` warning. Single-branch path bypasses this entirely (FR-007a).
- [ ] T038 [US4] In the same function, when an exchange rate is missing for a required date, append an `fx_rate_missing` warning rather than throwing or substituting (FR-017).
- [ ] T039 [US4] In `/home/janky/Desktop/pos-1/apps/store-app/src/hooks/useBalanceSheet.ts`, accept `presentationMode` and `presentationCurrency` and default to `'dual'` + the store's primary currency.
- [ ] T040 [US4] In `/home/janky/Desktop/pos-1/apps/store-app/src/components/reports/BalanceSheet.tsx`, add a presentation-mode picker (USD / LBP / dual) and a presentation-currency dropdown (visible only when mode != 'dual'). Render the "Unrealized FX Translation Adjustment" line inside Equity with the disclosure copy from the i18n keys. Render an inline warning banner for any `fx_rate_missing` or `missing_transfer_group_id` warnings returned by the service.

**Checkpoint**: Multi-currency stores see balanced reports in every mode; consolidated "All branches" no longer double-counts inter-branch transfers.

---

## Phase 7: User Story 5 — Offline operation and persistence (Priority: P3)

**Goal**: Report works offline using local Dexie data; user view preferences persist across sessions and devices.

**Independent Test**: Disconnect network → report still renders. Change the default branch / mode / currency / zero-balance toggle → reload from another device on the same store → preferences reflect the change after sync.

### Implementation for User Story 5

- [ ] T041 [US5] Sanity-verify the offline path: with the dev tools network panel set to "Offline", open the Balance Sheet — it must render. No code change expected since the service reads only from Dexie; this task documents and confirms.
- [ ] T042 [US5] Persist user preferences (default branch, default comparison mode, default presentation currency, default zero-balance toggle, default language) per user. Use the existing user-preferences storage path already used by other reports (extend it; do not introduce a new table). File touch points: `/home/janky/Desktop/pos-1/apps/store-app/src/hooks/useBalanceSheet.ts` to read defaults on mount and to write changes; respect FR-025 (sync across devices).
- [ ] T043 [US5] Manually verify on a second device after sync that the saved preferences apply (Acceptance Scenario 2 of US5).

**Checkpoint**: Feature is complete end-to-end and matches every Functional Requirement in the spec.

---

## Phase 8: Polish & Cross-Cutting Concerns

**Purpose**: Final hardening, accessibility/RTL pass, and pre-merge gates.

- [ ] T044 [P] Add `@media print` CSS in `/home/janky/Desktop/pos-1/apps/store-app/src/components/reports/BalanceSheet.tsx` so the printer-friendly view collapses navigation chrome and renders one column per as-of date (FR-027). PDF/Excel export remains explicitly Out of Scope (FR-028).
- [ ] T045 [P] Verify RTL layout in Arabic locale: switch to Arabic, confirm headings, account names, currency formatting, variance arrows, and section subtotals all render correctly RTL on tablet (≥768 px) per FR-021/FR-023.
- [ ] T046 Surface the audit-log entry for every report generation event (user, store, branch filter, as-of date, comparison dates, presentation currency, language) per FR-029. Reuse the existing `comprehensiveLoggingService` rather than introducing new infrastructure.
- [ ] T047 Run `pnpm lint` and `pnpm build:store` from `/home/janky/Desktop/pos-1` and resolve any remaining issues.
- [ ] T048 Run `pnpm test:run` from `/home/janky/Desktop/pos-1/apps/store-app` and confirm the new Balance Sheet Vitest suite is included and green. (No `pnpm parity:gate` needed — none of the sync-critical files in §3.XII are modified.)
- [ ] T049 Walk through the manual smoke-test path in `/home/janky/Desktop/pos-1/specs/018-balance-sheet/quickstart.md` end-to-end. Capture any defects as follow-up tasks; do not merge with open P0/P1 defects (SC-008).
- [ ] T050 Update `/home/janky/Desktop/pos-1/FUTURE_IMPLEMENTATIONS.md` Phase 1 #2 to check the Balance Sheet sub-bullet and reference the merged feature branch.

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: No dependencies — start immediately.
- **Foundational (Phase 2)**: Depends on Setup. **Blocks every user story.** Schema migration (T003), Dexie bump (T004), and type additions (T005) must merge together so callers compile.
- **User Stories (Phase 3+)**: All depend on Phase 2. Within Phase 2 itself, T003 & T004 run in sequence (DB before client cache); T005 runs in parallel with T006/T007/T008; T009 runs after T003 + T004.
- **Polish (Phase 8)**: Runs after every user story you intend to ship.

### User Story Dependencies

- **US1 (P1)**: After Phase 2. No dependency on other stories. Single-column MVP.
- **US2 (P1)**: After US1. Builds on the same service function and component.
- **US3 (P2)**: After US1. Pure UI wiring + a service-level invariant test; no schema or service-shape change.
- **US4 (P2)**: After US1. The presentation-currency and inter-branch-elimination logic add to `getBalanceSheet`'s body but do not change its existing return shape for callers using the defaults.
- **US5 (P3)**: After US4. The persisted-preferences task touches the hook signature established by US4.

### Within Each User Story

- Vitest tests (where present) MUST be written and observed failing before the implementation tasks they cover.
- Service-layer tasks before hook tasks before component tasks before page-wiring tasks.
- Drill-down (US3) reuses the existing `JournalEntryDrillDownModal` — no new modal file.

### Parallel Opportunities

- T002 in Phase 1 is a read-only orientation task; runs in parallel with T001.
- T005, T006, T007, T008 in Phase 2 are file-disjoint and can land in parallel.
- T010–T016 in Phase 3 are all in the same Vitest file — run their authoring sequentially, but they can be added in any order; avoid the `[P]` interpretation as "different files" here. Marked `[P]` only because each test case is mutually independent in its setup.
- US3 and US4 implementation can be parallelized across two developers once US1 + US2 have merged.

---

## Parallel Example: User Story 1

```bash
# Foundational tasks that can land in parallel after T003/T004 merge:
Task: "Update accounting.ts types in apps/store-app/src/types/accounting.ts"
Task: "Add reports.balanceSheet.* keys to en.ts"
Task: "Add reports.balanceSheet.* keys to ar.ts"
Task: "Add reports.balanceSheet.* keys to fr.ts"

# Vitest tests for US1 — author each as an independent it() block:
Task: "Test: balanced GL → Assets = Liabilities + Equity"
Task: "Test: unbalanced GL → variance + warning"
Task: "Test: soft-deleted entries excluded"
Task: "Test: pre-history as-of date → all zeros"
Task: "Test: YTD revenue/expense roll into Current Year Earnings"
Task: "Test: account_type outside allowed set → defensive include + warning"
Task: "Test: hideZeroBalanceAccounts toggle behavior"
```

---

## Implementation Strategy

### MVP First (US1 only)

1. Phase 1: Setup.
2. Phase 2: Foundational (schema + Dexie + types + i18n keys).
3. Phase 3: US1 (single-column Balance Sheet).
4. **STOP, validate**: Trial Balance and Balance Sheet for the same as-of date produce reconcilable totals.
5. Demo to product owner. Gather feedback before proceeding to comparative columns.

### Incremental Delivery

1. Setup + Foundational ready → branch is green and shippable as a no-op.
2. Add US1 → MVP ships.
3. Add US2 → comparative columns ship.
4. Add US3 → drill-down ships.
5. Add US4 → multi-currency / consolidation ships.
6. Add US5 → preferences sync ships.

Each story is independently testable and shippable.

### Parallel Team Strategy

After Phase 2 merges:

- Developer A: US1 → US2 (P1 stack).
- Developer B: US3 (drill-down).
- Developer C: US4 (multi-currency + elimination) — coordinate with A on `getBalanceSheet` signature changes via PR review.
- US5 best done by whichever developer wraps first to avoid touching `useBalanceSheet` from two PRs at once.

---

## Notes

- `[P]` = different files OR mutually independent setup; not a license to ignore review order.
- `[Story]` label maps task to user story for traceability.
- Verify Vitest tests fail before implementing (write the test, run it, see red, then implement).
- Commit after each task or logical group. Foundational tasks (T003 + T004) should land in a single commit; type changes (T005) can be a separate commit if it keeps the diff legible.
- Stop at any checkpoint to validate the story independently.
- Avoid: vague tasks, same-file conflicts (most service work in this feature is in `financialStatementService.ts` — sequence those carefully), cross-story dependencies that break independence.
- No new RBAC operation, no new sync mechanism, no new MCP/server RPCs.
