# Phase 0 Research — Balance Sheet (018-balance-sheet)

**Date**: 2026-05-04
**Goal**: Resolve every NEEDS CLARIFICATION from `plan.md`'s Technical Context and surface every implementation-shaping decision before Phase 1 design. The five spec-level questions were already resolved in `/speckit.clarify` (see `spec.md` → Clarifications). Phase 0 below covers the remaining design-time choices that would otherwise be re-derived during implementation.

> Status: **No NEEDS CLARIFICATION markers remain in plan.md or spec.md.** Phase 0 is a record of the deliberate decisions, not a backlog of unknowns.

---

## R1 — Service location: extend `financialStatementService.ts` vs. create `balanceSheetService.ts`

- **Decision**: Extend `apps/store-app/src/services/financialStatementService.ts`. Add `getBalanceSheet`, keep the helpers (`fetchEntries`, `addAmount`, `endOfDayIso`, `startOfDayIso`, `isDebitNormal`, `BALANCE_EPSILON`) module-private and shared across `getTrialBalance` and `getBalanceSheet`.
- **Rationale**:
  - The header comment in the existing service already plans for this: *"Future home for `getBalanceSheet` / `getCashFlowStatement` (Phase 1 #2 sub-items)."*
  - All helpers are needed verbatim. A sibling file would force either duplication or a third helper-only module — both are worse than adding ~250 lines to an existing 249-line file.
  - Constitution §8.C anti-pattern threshold for "monolithic service" is ~1,300 lines. Even after this feature the file will be under 600 lines.
- **Alternatives considered**:
  - *New `balanceSheetService.ts`*: rejected — duplicates helpers, splits a deliberately-cohesive Financial Statements Pack across multiple modules, and the service header explicitly anticipates this addition.
  - *Move helpers to `accountingHelpers.ts` first, then create new service*: rejected — premature extraction; do it when the third statement (Cash Flow) lands.

## R2 — Where account classification & sub-classification live

- **Decision**: Source of truth is `chart_of_accounts`. Existing `account_type` field (`'asset' | 'liability' | 'equity' | 'revenue' | 'expense'`) handles the top-level five-way classification (already present per `apps/store-app/src/types/accounting.ts:107–115`). New nullable `sub_classification` field added with allowed values:
  - `'current_asset'`, `'non_current_asset'` (when `account_type='asset'`)
  - `'current_liability'`, `'non_current_liability'` (when `account_type='liability'`)
  - `'equity'` (when `account_type='equity'`)
  - `null` for revenue/expense and for any account where the migration could not seed a value.
- **Rationale**:
  - Resolves Q1 from the clarification session. Aligns with CG-09 (schema consistency: existing required metadata kept, new column added with both SQL migration and Dexie bump).
  - Snake-case naming matches every other column on this table.
  - Nullable instead of NOT NULL because we cannot guarantee every existing account falls into a clean range — FR-002b explicitly says out-of-range accounts get flagged for manual review rather than guessed.
- **Alternatives considered**:
  - *Hardcoded report-time mapping by account-number range* (Q1 option B): rejected during clarification.
  - *Boolean `is_current` flag*: rejected — fails for Equity (which has no Current/Non-Current distinction).
  - *Multi-row classification table*: rejected — inflates schema complexity for a single-cardinality property.

## R3 — Inter-branch transfer marker on journal entries

- **Decision**: Add nullable `transfer_group_id` (text, UUID-shaped) to `journal_entries`. All four legs of an inter-branch transfer (debit at source, credit at source, debit at destination, credit at destination — or however the transfer is journaled) share the same `transfer_group_id`. The "All branches" balance sheet view eliminates these by netting all entries with the same `transfer_group_id` to zero.
- **Rationale**:
  - Resolves Q3 from the clarification session. Heuristic detection (matching account + opposite branches) was explicitly rejected in clarification.
  - A single string column plus an index is the cheapest way to make consolidation deterministic.
  - Inter-branch transfer creation is **out of this feature's scope** (it's a future Phase 2 #11 item). For now, the field exists, is null on all existing entries, and the report's elimination logic gracefully returns zero eliminations until the inter-branch-transfer feature ships and starts populating it. FR-007b mandates a visible warning when a transfer marker is missing on what *appears* to be a transfer (no behavior change for users today; defensive infrastructure for later).
- **Alternatives considered**:
  - *Dedicated "Inter-branch clearing" GL account* (Q3 option C): rejected during clarification — relies on every future inter-branch transfer feature posting to that account perfectly. Marker-based is more robust.
  - *Heuristic detection*: rejected during clarification.

## R4 — Reading multi-currency journal entries

- **Decision**: Use the Phase 11 dual-write JSONB `amounts` map via the existing `accountingCurrencyHelpers` (`amountsFromLegacyEntry`, `getDebit`, `getCredit`). Never read the deprecated `debit_usd`/`credit_usd`/`debit_lbp`/`credit_lbp` scalar columns directly. This is exactly how the Trial Balance does it, so the two reports stay in lock-step.
- **Rationale**: The `amounts` map is the authority for new code (per `accounting.ts` `JournalEntry` doc-comment). `amountsFromLegacyEntry` falls back to the legacy scalars when `amounts` is missing, so older entries that pre-date Phase 11 still produce correct totals.
- **Alternatives considered**:
  - *Read the scalars directly*: rejected — silently breaks when stores adopt non-USD/LBP currencies (Phase 8 multi-currency).
  - *Migrate to amounts-only*: out of scope for this feature; that's Phase 11d.

## R5 — Currency presentation modes & FX translation

- **Decision**:
  - Mode `'USD'`: every line translated to USD using the rate effective on each column's as-of date (looked up from the existing exchange-rate store).
  - Mode `'LBP'`: same pattern, target currency is LBP.
  - Mode `'dual'` (the default): show every line in its native currency totals (one column per currency that appears in the data) plus a consolidated total in the user's selected presentation currency.
  - **FX translation residual** (FR-016): each column independently computes `Σ(Assets at as-of-date rate) − Σ(Liabilities at as-of-date rate) − Σ(Equity at as-of-date rate)` in the presentation currency, and the residual is rendered as a labeled "Unrealized FX Translation Adjustment (display-only)" line inside Equity. The result is that every column trivially balances. The text label and disclosure are required by FR-016b.
- **Rationale**: Resolves Q2 from clarification. This is the standard accounting treatment for unposted FX translation effects ("CTA" / Cumulative Translation Adjustment) and is the only way to keep the report in balance without writing to the GL.
- **Alternatives considered**:
  - *Read FX gain/loss only from posted JEs*: rejected during clarification — breaks the balance guarantee.
  - *Display imbalance as "Out of Balance"*: rejected during clarification — unhelpful.
- **Open data dependency**: relies on the existing exchange-rate store from Phase 8/11 (`store_settings.exchangeRate` for the in-store rate, plus historical rates from the multi-currency feature). When a rate is missing for a comparison date, FR-017 governs UX (notify, offer most-recent prior, or prompt for manual rate).

## R6 — Period-aware revenue/expense rollup into Equity

- **Decision**: At render time the service computes the net of all Revenue and Expense entries posted on or before the as-of date and within the **current open fiscal year** (heuristic: posted_date within `[YYYY-01-01, as_of_date]` for now, given that period-close is a future feature). This net is added to Equity as a pseudo-line "Current Year Earnings". Closed periods (once Period Close ships, Phase 1 #7) will already carry these earnings as posted closing JEs to Retained Earnings, so the virtual rollup will return zero for those periods and become a no-op.
- **Rationale**: Resolves the Edge Case in `spec.md` for "Unposted period." Without this, a Balance Sheet generated mid-year would understate Equity by the YTD profit/loss.
- **Alternatives considered**:
  - *Refuse to render until Period Close runs*: rejected — feature must work without the Period Close gate (per Assumptions in `spec.md`).
  - *Roll **all** revenue/expense (any age) into a single Equity line*: rejected — wrong for prior years where closing entries should already have moved them to Retained Earnings; would double-count after Period Close ships.

## R7 — Drill-down reuse from Trial Balance

- **Decision**: Reuse `apps/store-app/src/components/reports/JournalEntryDrillDownModal.tsx` unchanged. Pass the same input shape (account_code, date range — for Balance Sheet the start of the universe is the earliest journal entry; the end is the as-of date for the column being clicked, optionally scoped by branch and `transferGroupId` exclusion when "All branches"). The modal already renders the schema laid out in FR-012 (date, reference, description, debit/credit, source link).
- **Rationale**: Avoids duplicate UI; keeps the Financial Statements Pack visually consistent.
- **Alternatives considered**:
  - *New `BalanceSheetDrillDownModal.tsx`*: rejected — no Balance-Sheet-specific behavior justifies a separate modal. The same data is being shown.

## R8 — Hook & state shape: `useBalanceSheet`

- **Decision**: Mirror `useTrialBalance` exactly. Inputs: `{ asOfDate, comparisons[], branchId?, presentationMode, presentationCurrency?, includeZeroBalances }`. Outputs: `{ report, isLoading, error, regenerate }`. The hook calls `financialStatementService.getBalanceSheet(filters)` with `useEffect`-based recomputation and a `regenerate()` imperative trigger for manual refresh after sync.
- **Rationale**: Pattern is established (76 lines for `useTrialBalance.ts`); reviewers and future readers see the identical shape. Reactivity is needed because journal entries can change while the report is open (sync, new sale, etc.).
- **Alternatives considered**:
  - *No hook — call service from component directly*: rejected — couples component to data layer, makes test isolation harder, contradicts Trial Balance precedent.

## R9 — Default open state, comparison column, presentation currency

- **Decision** (per Q4/Q5 of clarification + spec FR-008a):
  - Default `asOfDate`: today (resolved with `getTodayLocalDate()` per CG-11).
  - Default `comparisons`: a single column = end-of-previous-calendar-month (resolved with `getLocalDateString` against `new Date(today.getFullYear(), today.getMonth(), 0)`).
  - Default `branchId`: the user's current branch if any; else "All branches" if their grant of the financial-reports operation is store-scoped.
  - Default `presentationMode`: `'dual'`.
  - Default `presentationCurrency`: store's primary currency from settings.
  - Default `includeZeroBalances`: `false`.
- **Rationale**: Each of these has a clarification or FR backing it. The set is also persisted in user-preferences storage (FR-025).
- **Alternatives considered**: see clarification record.

## R10 — Inter-branch elimination algorithm in `getBalanceSheet`

- **Decision** (when `branchId` is undefined, i.e. "All branches"):
  1. Fetch all journal entries up to as-of date for the store.
  2. Group by `transfer_group_id` where present.
  3. For each group, sum the per-account-per-currency debit/credit. If the sum nets to zero per currency (within `BALANCE_EPSILON`), drop all entries in that group from the aggregation. If not zero, retain them and emit a system warning (FR-007b).
  4. Aggregate the remaining entries normally.
- **Rationale**: FR-007 requires netting based on `transfer_group_id`. The "must net to zero" check guards against bad data — a transfer group that doesn't balance is suspect and should not be silently eliminated.
- **Alternatives considered**:
  - *Always drop all entries with any `transfer_group_id`*: rejected — too aggressive; loses real financial activity if a transfer is malformed.

## R11 — Schema migration sequencing

- **Decision**:
  1. **Foundational task** (must run before any Balance Sheet code): Supabase SQL migration adding `chart_of_accounts.sub_classification` (text, nullable) and `journal_entries.transfer_group_id` (text, nullable). Same migration runs the idempotent backfill of `sub_classification` from account-number ranges.
  2. **Same task**: Dexie schema bump 54 → 55. The version 55 migration adds these two columns and a Dexie index `transfer_group_id` on `journal_entries`. No data backfill in Dexie — newly synced rows arrive with the columns populated; existing rows keep them as `undefined` until they are next re-synced or until a one-time client-side seed runs (which the migration triggers from the locally-cached account-number range mapping).
- **Rationale**: Per CG-09, schema changes need both Supabase migration *and* Dexie version bump. Doing them in a single foundational task keeps the move atomic; subsequent feature tasks can rely on both fields being present.
- **Alternatives considered**:
  - *Defer the Dexie bump until each feature touches the field*: rejected — increases per-task surface area and risks two features colliding on a single Dexie version.

## R12 — Performance budget validation

- **Decision**: Establish the SC-001 performance budget (3 s for 100k JEs) by load-testing in a Vitest benchmark stub plus a one-time manual measurement on a real device with seeded data. The aggregator is a single in-memory pass over the entries (`O(N)`), with a dictionary keyed by `account_code`. No nested I/O. For 100k entries the dominant cost is the Dexie `where('store_id').toArray()` round-trip; profiling on Trial Balance shipped at ~600 ms for ~50k entries on the reference device, so 3 s for 100k is comfortable.
- **Rationale**: The Trial Balance baseline is the best estimate. The Balance Sheet does at most twice the work (one comparison column = one extra full pass) and still fits.
- **Alternatives considered**:
  - *Pre-aggregate into a balance snapshot table*: rejected for MVP — `balance_snapshots` exists but isn't yet rich enough for arbitrary comparison columns. Could be a follow-up if real-world numbers exceed budget.

## R13 — i18n keys

- **Decision**: New keys under `reports.balanceSheet.*` mirroring `reports.trialBalance.*` plus extra strings for: `currentAssets`, `nonCurrentAssets`, `currentLiabilities`, `nonCurrentLiabilities`, `equity`, `totalAssets`, `totalLiabilitiesAndEquity`, `currentYearEarnings`, `unrealizedFxTranslation`, `comparisonColumn`, `addComparison`, `removeComparison`, `presentationCurrency`, `presentationMode.{usd,lbp,dual}`, `unbalancedWarning`, `missingTransferGroupWarning`. Three locale files updated (en, ar, fr).
- **Rationale**: CG-10 enforcement; ar/fr already part of the i18n locale set.

## R14 — Print-friendly view

- **Decision**: A `@media print` CSS rule on `BalanceSheet.tsx` collapses navigation chrome and renders a single-column-per-as-of-date layout. No PDF lib is added in this feature; PDF/Excel export is explicitly Out of Scope (FR-028).
- **Rationale**: FR-027 requires a printer-friendly view, but the export pipeline is shared with the rest of the Financial Statements Pack and isn't owned here.
- **Alternatives considered**: Adding `react-to-print` or `jspdf` — rejected, scope creep.

## R15 — Test coverage targets

- **Decision** (CG-12): Vitest tests for `getBalanceSheet` covering:
  1. Single as-of date, balanced GL → Assets = Liabilities + Equity.
  2. Comparison column → both columns balance independently.
  3. Multi-currency dual mode → "Unrealized FX Translation Adjustment" computed and labeled.
  4. As-of date inside open fiscal year → revenue/expense rolled into Current Year Earnings.
  5. Out-of-balance GL → variance reported, not silently rebalanced.
  6. Inter-branch transfer entries with matching `transfer_group_id` → eliminated under "All branches".
  7. Transfer entries with missing `transfer_group_id` → warning surfaced, entries retained.
  8. Soft-deleted entries → excluded.
  9. Zero-balance accounts → hidden by default, shown when toggle is on.
  10. Pre-history as-of date → all balances zero, no errors.
- **Rationale**: One test per acceptance scenario plus the edge cases. Mirrors the test layout already used for `getTrialBalance`.

---

## Decisions summary

| # | Decision | Spec FR(s) |
|---|----------|-----------|
| R1 | Extend `financialStatementService.ts`; do not create a sibling. | FR-001 |
| R2 | New `chart_of_accounts.sub_classification` column, nullable, snake_case. | FR-002a/b/c |
| R3 | New `journal_entries.transfer_group_id` column, nullable, indexed. | FR-007/7a/7b |
| R4 | Read entries via `amountsFromLegacyEntry` JSONB helper. | FR-014/15 |
| R5 | "Unrealized FX Translation Adjustment" computed per column at render time. | FR-016/16a/16b |
| R6 | Virtual roll of YTD revenue/expense into "Current Year Earnings". | FR-003 |
| R7 | Reuse `JournalEntryDrillDownModal.tsx`. | FR-011/12/13 |
| R8 | New `useBalanceSheet` hook mirroring `useTrialBalance`. | FR-024 |
| R9 | Sensible defaults including end-of-previous-month comparison. | FR-005, FR-008a, FR-025 |
| R10 | Marker-based inter-branch elimination with zero-net validation. | FR-007 |
| R11 | One foundational schema task: SQL migration + Dexie bump 54→55. | CG-09 |
| R12 | `O(N)` in-memory aggregation; budget validated against Trial Balance baseline. | SC-001 |
| R13 | New `reports.balanceSheet.*` i18n keys in en/ar/fr. | FR-021 |
| R14 | `@media print` only; PDF/Excel out of scope. | FR-027/28 |
| R15 | Vitest coverage for 10 cases. | CG-12 |
