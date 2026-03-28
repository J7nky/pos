# Quickstart: Local calendar dates & time zones

**Branch**: `004-local-date-timezone`  
**Date**: 2026-03-25  
**Spec**: [spec.md](./spec.md)

---

## Prerequisites

```bash
cd /home/janky/Desktop/pos-1
node --version   # ≥18
pnpm --version   # ≥8
git branch       # 004-local-date-timezone
```

---

## Implement first

1. Add `getTodayLocalDate()` to `apps/store-app/src/utils/dateUtils.ts` (see [research.md](./research.md)).
2. Replace forbidden patterns in priority paths: `Home.tsx`, report components, forms, `snapshotSchedulerService.ts`, `PublicCustomerStatement.tsx`.
3. Replace **timestamp → day** extractions that use `toISOString().split` with `getLocalDateString` (e.g. `Accounting.tsx`, `useProfitLoss.ts`, services).

---

## Run the app

```bash
pnpm install
pnpm --filter store-app dev
```

---

## Manual acceptance (spec SC-001–SC-004)

### A. UTC+2 / UTC+3 “late evening” (SC-001)

1. Set OS (or browser test profile) timezone to **Asia/Beirut** or **Asia/Riyadh** (UTC+2/+3).
2. Set clock to **23:30 local** on day **D** (ensure UTC date may already be **D+1**).
3. Record a sale or expense from the POS.
4. Open **Home** — “today” totals must include that activity on **D**, not **D+1**.

### B. After local midnight (SC-003)

1. Set clock to **00:30 local** on day **D** (UTC may still be **D−1**).
2. Open inventory receive / supplier advance / received bills flow — default business date must be **D**.
3. Submit without changing date — stored business date must be **D**.

### C. Report defaults (SC-002)

1. Create a bill at **01:00 local** on **D** (per report §6.3 scenario).
2. Open **Profit & Loss** (or Activity feed) with **default** date range — row must appear without manually extending the end date.
3. Open **Public customer statement** (token link) on a **viewer** device — default range uses **viewer** local dates; rows visible must match displayed business dates.

### D. Snapshots (SC-004)

1. Run or trigger snapshot scheduler near **local** midnight (test harness or dev hook).
2. Confirm snapshot **business date** label matches **local** day used in snapshot lookup UI.

---

## Regression guard

```bash
# Should trend to zero matches for local-day semantics (allow scripts/tests until cleaned)
rg "toISOString\(\)\.split\('T'\)\[0\]" apps/store-app/src --glob '!scripts/**'
```

---

## Reference

- [contracts/local-calendar-day-contract.md](./contracts/local-calendar-day-contract.md)  
- Constitution CG-11: `.specify/memory/constitution.md`
