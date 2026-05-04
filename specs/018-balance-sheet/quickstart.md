# Quickstart — Balance Sheet (018-balance-sheet)

A 10-minute orientation for the implementer. Everything below assumes you've read `spec.md`, `plan.md`, `research.md`, and `data-model.md`.

---

## Where things go

| Artifact | Path | Action |
|----------|------|--------|
| Service | `apps/store-app/src/services/financialStatementService.ts` | EXTEND — add `getBalanceSheet`, share helpers with `getTrialBalance`. |
| Service test | `apps/store-app/src/services/__tests__/financialStatementService.balanceSheet.test.ts` | NEW |
| Hook | `apps/store-app/src/hooks/useBalanceSheet.ts` | NEW — mirror `useTrialBalance`. |
| Component | `apps/store-app/src/components/reports/BalanceSheet.tsx` | NEW — mirror `TrialBalance.tsx`. |
| Drill-down modal | `apps/store-app/src/components/reports/JournalEntryDrillDownModal.tsx` | REUSE — already shipped with Trial Balance. |
| Reports page wiring | `apps/store-app/src/pages/Reports.tsx` | MODIFY — add Balance Sheet entry under existing financial-reports gating. |
| Domain types | `apps/store-app/src/types/accounting.ts` | MODIFY — add `sub_classification` on `ChartOfAccounts`, `transfer_group_id?` on `JournalEntry`. |
| Dexie schema | `apps/store-app/src/lib/db.ts` | MODIFY — version bump 54 → 55, declare new compound index `[store_id+transfer_group_id]` on `journal_entries`. |
| Supabase migration | `supabase/migrations/YYYYMMDD_balance_sheet_schema.sql` | NEW — `ALTER TABLE` both columns, partial index, idempotent backfill of `sub_classification` from account-number ranges. |
| i18n strings | `apps/store-app/src/i18n/locales/{en,ar,fr}.ts` | MODIFY — add `reports.balanceSheet.*` keys (see `research.md` R13). |

---

## Implementation order

1. **Foundational schema** — write the SQL migration, run it against the dev Supabase, then bump Dexie to v55. Verify the version 55 upgrade works on a populated dev IndexedDB without data loss. (This is the only step that touches sync-adjacent surface; everything else is read-only and additive.)
2. **Domain types** — add `sub_classification` and `transfer_group_id?` to `accounting.ts`. Resolve any TypeScript errors that emerge from the literal-union widening.
3. **Service** — extend `financialStatementService.ts` with `getBalanceSheet`. Lift any existing helper that `getTrialBalance` and `getBalanceSheet` both need into module-private functions. Don't change the existing `getTrialBalance` signature.
4. **Service tests** — write the 10 Vitest cases (`research.md` R15) before wiring the UI. They are the single source of correctness for the GL math.
5. **Hook** — `useBalanceSheet` (~80 lines). Follow `useTrialBalance` line-by-line.
6. **Component** — `BalanceSheet.tsx`. Follow `TrialBalance.tsx` for layout, controls, drill-down trigger, print CSS.
7. **Reports page** — add the new tab/button in `Reports.tsx`, gated by the existing financial-reports operation. Re-test that an unauthorized user does not see it.
8. **i18n** — add the strings in all three locales. Run `pnpm lint`.

---

## Critical correctness checklist

Before opening the PR:

- [ ] Every column in the rendered report satisfies Assets = Liabilities + Equity to the smallest currency unit, with the "Unrealized FX Translation Adjustment" absorbing any translation residual (FR-016, SC-002).
- [ ] When the underlying GL is genuinely unbalanced (variance test fixture), the report renders, flags the imbalance with a visible warning, and does NOT silently rebalance (FR-004, edge case).
- [ ] Soft-deleted entries (`_deleted: true`) do not contribute to any total (FR-006).
- [ ] Inter-branch transfer entries with the same `transfer_group_id` are eliminated under "All branches"; with a single-branch filter they appear normally (FR-007/7a).
- [ ] Inter-branch entries that do NOT share a `transfer_group_id` (legacy data) emit a warning rather than being silently dropped or silently kept (FR-007b).
- [ ] Comparative column "End of previous calendar month" is the default on first open (FR-008a).
- [ ] No `setInterval` introduced anywhere (CG-03).
- [ ] No UI imports of `lib/db` or `lib/supabase` (CG-02).
- [ ] No `new Date().toISOString().split('T')[0]` for any "today" or local-date default — uses `getTodayLocalDate()` / `getLocalDateString()` (CG-11).
- [ ] All visible text goes through `getTranslatedString()` / multilingual labels (CG-10).
- [ ] Vitest suite for `getBalanceSheet` passes (CG-12).
- [ ] `pnpm lint`, `pnpm build:store`, `pnpm test:run` all green.

---

## Smoke-test path (manual, post-merge)

1. Open the Reports page, switch to **Balance Sheet**.
2. Default view: today as as-of date, end-of-previous-calendar-month comparison column pre-populated, current branch selected (or "All branches" if RBAC allows), dual-currency presentation.
3. Verify the equation strip at the bottom shows balanced totals.
4. Click any non-zero amount → drill-down modal opens with the journal entries that produced the balance.
5. Toggle "Show zero-balance accounts" → previously hidden accounts appear with all zeroes.
6. Switch to USD-only presentation → every line shows a USD-translated value AND an "Unrealized FX Translation Adjustment" line in Equity.
7. Switch language to Arabic → the entire report (headings, account names, currency formatting, RTL layout) updates.
8. Take the device offline and re-open the report → it renders identically using local Dexie data.
9. Print preview → single-column-per-as-of-date, no nav chrome.
10. As a branch-scoped user, verify "All branches" is hidden from the branch selector.

---

## What you will *not* implement here

- Cash Flow Statement (`pages/Reports.tsx` will keep its current structure with one new entry; the Cash Flow tab is a future feature).
- PDF / Excel export (deferred to the shared Financial Statements Pack export pipeline; `FR-028`).
- Period Close interactions (the virtual roll into Equity is the workaround until Phase 1 #7 ships).
- Inter-branch transfer feature itself (you only add the marker column and the elimination logic that becomes useful once that future feature populates it).
- Generating any FX gain/loss journal posting (display-only; the Out of Scope section is explicit).
- Snapshotting / persisting any rendered report.
- Any new RBAC operation (you reuse the existing financial-reports operation).
