# Research: Local calendar dates & time zones

**Branch**: `004-local-date-timezone`  
**Date**: 2026-03-25  
**Basis**: [spec.md](./spec.md), `IMPROVEMENTS_ENHANCEMENTS_REPORT.md` §6, constitution §3.XI (CG-11), static grep of `apps/store-app`

---

## 1. Canonical API surface

### Decision: Add `getTodayLocalDate()` beside `getLocalDateString(isoString)`

**Rationale**: Constitution and report both call for a zero-argument helper so “today” is as easy to write correctly as the forbidden UTC shortcut. Implementation:

```ts
export function getTodayLocalDate(): string {
  return getLocalDateString(new Date().toISOString());
}
```

`getLocalDateString` already maps an instant to the **local** YYYY-MM-DD via `Date#getFullYear/Month/Date` (not UTC getters).

**Alternatives considered**:

- **Only document `getLocalDateString(new Date().toISOString())`**: Rejected — leaves the anti-pattern one refactor away everywhere; ergonomics caused the bug class.
- **Luxon/Day.js**: Rejected — new dependency and bundle cost; existing utility is sufficient for calendar-day extraction.

---

## 2. When to use which helper

| Intent | Helper |
|--------|--------|
| “Right now” as a local calendar day (defaults, “today” filters, snapshot label for current run) | `getTodayLocalDate()` |
| Calendar day of a **stored** ISO timestamp (bills, transactions, sessions) for display, grouping, or comparison | `getLocalDateString(isoString)` |
| Filename / export stamp where the product wants “date in local TZ” | `getTodayLocalDate()` or `getLocalDateString(new Date().toISOString())` consistently |

### Decision: Replace UTC **slice** on `new Date()` used for “today” or for deriving a day from an instant

**Rationale**: `*.toISOString().split('T')[0]` uses the UTC calendar date. That is forbidden for local business-day semantics (CG-11).

**Special case — date math**: `new Date(Date.now() - N ms).toISOString().split('T')[0]` for “7 days ago” / “30 days ago” still ends in UTC day. Prefer computing a `Date` in local time and then `getLocalDateString(thatDate.toISOString())`, or use calendar-safe helpers (local midnight ± days) to avoid off-by-one near DST (spec: local calendar date; DST edge cases follow device rules).

---

## 3. Inventory of occurrences (grep 2026-03-25)

**Priority — spec §6 / FR coverage (product behavior)**:

| Area | Files (representative) |
|------|------------------------|
| Home “today” KPIs | `pages/Home.tsx` |
| Reports / defaults | `components/reports/ProfitLossReport.tsx`, `pages/Reports.tsx`, `components/ActivityFeed.tsx`, `components/AuditDashboard.tsx`, `components/MissedProductsHistory.tsx`, `components/CashDrawerBalanceReport.tsx` |
| Public + modal statements | `pages/PublicCustomerStatement.tsx`, `components/AccountStatementModal.tsx` |
| Accounting / inventory forms | `hooks/useInventoryForms.ts`, `components/inventory/ReceiveFormModal.tsx`, `components/accountingPage/tabs/SupplierAdvances.tsx`, `pages/Accounting.tsx` (includes `today` and **timestamp→day** extractions) |
| Snapshot scheduler | `services/snapshotSchedulerService.ts` |
| Services using “today” | `entityQueryService.ts`, `posAccountingIntegration.ts`, `reportingService.ts`, `reminderMonitoringService.ts`, `inventoryPurchaseService.ts` (postedDate), `missedProductsService.ts` |
| Hooks | `hooks/useProfitLoss.ts` |
| Utils | `utils/queryHelpers.ts` |

**Secondary — filenames / download labels**: Many `a.download = ..._${new Date().toISOString().split('T')[0]}` — should use local date for consistency (optional UX polish; same helper).

**Tests**: `services/__tests__/*.test.ts` — update fixtures to use `getTodayLocalDate()` / `getLocalDateString` so tests do not encode UTC assumptions.

**Out of scope for implementation tasks unless product asks**: `src/scripts/*`, `performanceBenchmark.ts`, `comprehensivePhase6Test.ts` — dev utilities; fix only if we want zero grep matches in CI.

---

## 4. Public customer statement (clarified)

### Decision: Viewer browser local calendar for default `start` / `end` (spec Clarifications)

**Rationale**: Matches Option A — same `getTodayLocalDate()` / `getLocalDateString` in the **browser that renders** `PublicCustomerStatement.tsx`.

**Alternatives considered**: UTC defaults — rejected by product clarification.

---

## 5. Schema & migrations

### Decision: No Supabase or Dexie schema change

**Rationale**: Feature spec assumes timestamps may remain stored as full ISO instants; fixes are **derivation** and default strings, not new columns.

---

## 6. Linting / enforcement

### Decision: Rely on constitution + code review; optional follow-up: `no-restricted-syntax` or custom ESLint rule for `toISOString().split('T')[0]`

**Rationale**: CG-11 already forbids the pattern; automated rule prevents regression (can be a separate small task).

---

## 7. Risk: `Accounting.tsx` and grouping keys

Several places use `new Date(x).toISOString().split('T')[0]` to **group** by “day.” That is UTC day, not local — same bug class as defaults. Replacement with `getLocalDateString(String(createdAt))` aligns with FR-007.

---

## Open points for `/speckit.tasks` (not blocking plan)

- Exact list of files in dependency order (utils first, then services, then pages).
- Whether to add a Vitest unit test only for `getTodayLocalDate` + one boundary case (mock timezone in CI is environment-specific; may keep tests minimal).
