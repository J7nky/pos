# Implementation Plan: Local calendar dates & time zones

**Branch**: `004-local-date-timezone` | **Date**: 2026-03-25 | **Spec**: [spec.md](./spec.md)  
**Input**: Feature specification from `specs/004-local-date-timezone/spec.md` (incl. Clarifications Session 2026-03-25)

---

## Summary

Eliminate UTC calendar-day bugs for users east (and west) of UTC by standardizing on `getLocalDateString(iso)` and a new `getTodayLocalDate()` wrapper in `utils/dateUtils.ts`, per constitution **CG-11**. Replace all uses of `new Date().toISOString().split('T')[0]` (and equivalent UTC extractions) used for **local business days**—dashboard “today,” report defaults, form defaults, snapshot labels, public customer statement defaults, and timestamp→day grouping—with these helpers. **No** Supabase or Dexie schema changes. Public statement defaults use the **viewer’s** browser (spec clarification). See [research.md](./research.md) for file inventory and edge cases.

---

## Technical Context

**Language/Version**: TypeScript 5.x, React 18, Node.js ≥18  
**Primary Dependencies**: Dexie v4, Supabase JS v2, React Router 7, Tailwind CSS 3, Vite 7, Electron 38  
**Storage**: Supabase (PostgreSQL — remote); IndexedDB via Dexie v4 (local, primary); **no schema change for this feature**  
**Testing**: Vitest (unit tests, service layer); update tests that hard-code UTC day strings  
**Target Platform**: Web (Netlify SPA) + Electron (Windows NSIS x64 desktop)  
**Project Type**: offline-first POS web-app + desktop-app  
**Performance Goals**: Sub-100ms local reads unchanged; date helpers are O(1) string formatting  
**Constraints**: offline-capable; multilingual (en/ar/fr); **CG-11 local date extraction mandatory**  
**Scale/Scope**: All store-app surfaces that derive “today” or compare calendar days; optional cleanup of `src/scripts` matches deferred

---

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| Gate | Principle | Status | Notes |
|------|-----------|--------|-------|
| CG-01 | Offline-First Data Flow | ✅ PASS | Date derivation only; no new remote read/write paths |
| CG-02 | UI Data Access Boundary | ✅ PASS | Changes use `utils/dateUtils` from UI/services; no new `lib/db` / `lib/supabase` in pages beyond existing patterns |
| CG-03 | Event-Driven Sync / Upload-Then-Emit | ✅ PASS | No `setInterval` added; no event contract change |
| CG-04 | Financial Atomicity | ✅ N/A | No new transaction paths |
| CG-05 | Client-Side Ledger | ✅ PASS | No server RPCs added |
| CG-06 | Branch-Level Isolation | ✅ N/A | No branch query changes |
| CG-07 | RBAC | ✅ N/A | No new operations |
| CG-08 | Double-Entry | ✅ N/A | No new journals |
| CG-09 | Schema Consistency | ✅ PASS | No new tables/columns; no migration or Dexie bump required |
| CG-10 | Multilingual | ✅ PASS | No new user-facing strings required for date math; existing i18n unchanged |
| CG-11 | Local Date Extraction | ✅ PASS | **Feature implements CG-11** — replaces forbidden UTC slice with `getLocalDateString` / `getTodayLocalDate()` per [contracts/local-calendar-day-contract.md](./contracts/local-calendar-day-contract.md) |

**Post-design check**: Artifacts (`research.md`, `data-model.md`, `contracts/`) align with CG-11; no Complexity Tracking entries required.

---

## Project Structure

### Documentation (this feature)

```text
specs/004-local-date-timezone/
├── plan.md
├── research.md
├── data-model.md
├── quickstart.md
├── contracts/
│   └── local-calendar-day-contract.md
└── tasks.md                    ← /speckit.tasks (not created by this command)
```

### Source code (primary touchpoints)

```text
apps/store-app/src/
├── utils/
│   └── dateUtils.ts                    ← add getTodayLocalDate()
├── pages/
│   ├── Home.tsx
│   ├── PublicCustomerStatement.tsx
│   ├── Accounting.tsx
│   └── Reports.tsx
├── components/
│   ├── ActivityFeed.tsx
│   ├── reports/ProfitLossReport.tsx
│   ├── accountingPage/tabs/SupplierAdvances.tsx
│   ├── inventory/ReceiveFormModal.tsx
│   └── … (see research.md full list)
├── hooks/
│   ├── useInventoryForms.ts
│   └── useProfitLoss.ts
├── services/
│   ├── snapshotSchedulerService.ts
│   ├── reportingService.ts
│   ├── entityQueryService.ts
│   ├── reminderMonitoringService.ts
│   ├── posAccountingIntegration.ts
│   ├── inventoryPurchaseService.ts
│   ├── missedProductsService.ts
│   └── …
└── services/__tests__/               ← align test dates with local helpers
```

**Structure Decision**: Monorepo `apps/store-app` only; admin-app out of scope unless an equivalent bug is found. Shared package change **optional** — only if exporting the helper for reuse is desired later; not required for MVP.

---

## Phases (planning reference — tasks follow `/speckit.tasks`)

### Phase 0 — Research ✅

Output: [research.md](./research.md) (decisions, inventory, risks).

### Phase 1 — Design ✅

Outputs:

- [data-model.md](./data-model.md) — conceptual calendar-day model  
- [contracts/local-calendar-day-contract.md](./contracts/local-calendar-day-contract.md) — CG-11 consumer rules  
- [quickstart.md](./quickstart.md) — manual acceptance steps  

### Phase 2 — Implementation (for `tasks.md`)

Recommended order:

1. **Foundation**: `getTodayLocalDate()` + unit test (optional) in `dateUtils.ts`.  
2. **High-traffic UX**: `Home.tsx`, `ProfitLossReport`, `ActivityFeed`, `PublicCustomerStatement`, `Reports.tsx`.  
3. **Forms**: `useInventoryForms`, `ReceiveFormModal`, `SupplierAdvances`, `Accounting.tsx` (including timestamp→day lines).  
4. **Services**: `snapshotSchedulerService`, `reportingService`, `entityQueryService`, `reminderMonitoringService`, `inventoryPurchaseService`, `posAccountingIntegration`, `missedProductsService`, `queryHelpers.ts`.  
5. **Remaining components** (download filenames, `CashDrawerBalanceReport`, `AuditDashboard`, etc.).  
6. **Tests**: update Vitest files to stop encoding UTC “today.”  
7. **Optional**: ESLint rule to ban `toISOString().split('T')[0]`; optional grep cleanup of `src/scripts`.

---

## Complexity Tracking

> No constitution violations. Table empty.

| Violation | Why Needed | Simpler Alternative Rejected Because |
|-----------|------------|-------------------------------------|
| — | — | — |
