# Implementation Plan: Unified data contract and home cash drawer updates

**Branch**: `001-shared-types-home-drawer` | **Date**: 2026-03-23 | **Spec**: `/specs/001-shared-types-home-drawer/spec.md`
**Input**: Feature specification from `/specs/001-shared-types-home-drawer/spec.md`

## Summary

Implement two tightly scoped changes from IMPROVEMENTS sections 1.4 and 1.5: (1) remove the Home screen's periodic cash-drawer polling and rely on existing event/reactive data flow, and (2) establish one shared core data contract for the v1 overlap entities (`stores`, `branches`, `users`, `store_subscriptions`) consumed by both admin-app and store-app, while permitting app-specific extension fields outside the shared core.

## Technical Context

**Language/Version**: TypeScript 5.x, React 18, Node.js >=18  
**Primary Dependencies**: React Router 7, Dexie v4, Supabase JS v2, Vite 7, `@pos-platform/shared` workspace package  
**Storage**: Supabase PostgreSQL (remote) + IndexedDB via Dexie (local, source-of-truth for store-app runtime)  
**Testing**: Vitest (`apps/store-app`), ESLint for architecture boundaries  
**Target Platform**: Web SPA + Electron desktop runtime  
**Project Type**: Monorepo with two frontend applications and one shared package  
**Performance Goals**: Home cash drawer status updates should remain parity-fast with existing reactive flows; no minute-scale timer dependency  
**Constraints**: Preserve offline-first and event-driven sync; no direct `db`/`supabase` imports in UI; no new polling intervals (except constitution-allowed event stream safety net)  
**Scale/Scope**: Single feature branch touching `apps/store-app`, `apps/admin-app`, and `packages/shared` for v1 shared entities only

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| Gate | Status (Pre-Design) | Notes |
|------|----------------------|-------|
| CG-01 Offline-first data flow | PASS | Home change keeps read path via `useOfflineData`; no UI-to-Supabase direct reads. |
| CG-02 UI data access boundary | PASS | No plan to import `lib/db` or `lib/supabase` into pages/components/layouts. |
| CG-03 Event-driven sync / no polling | PASS | Explicitly removing Home `setInterval` fallback. |
| CG-04 Financial atomicity | N/A | No new financial write path introduced. |
| CG-05 Client-side ledger only | N/A | Feature does not add statement/balance RPC logic. |
| CG-06 Branch isolation | PASS | No branch-scope broadening; uses existing branch-filtered context data. |
| CG-07 RBAC enforcement | PASS | No route or permission model change. |
| CG-08 Double-entry accounting | N/A | No new monetary posting flow. |
| CG-09 Schema consistency | PASS | Type-contract alignment only; no new tables in this feature. |
| CG-10 Multilingual defaults | PASS | No new user-facing strings required by this feature scope. |
| CG-11 Local-date extraction | PASS | Home polling removal does not add date extraction logic; existing anti-pattern cleanup is out of this feature scope. |

Post-design re-check (after research/model/contracts): all gate statuses remain unchanged and PASS/N/A as above.

## Project Structure

### Documentation (this feature)

```text
specs/001-shared-types-home-drawer/
├── plan.md
├── research.md
├── data-model.md
├── quickstart.md
├── contracts/
│   ├── shared-core-data-contract.md
│   └── home-cash-drawer-view-contract.md
└── tasks.md
```

### Source Code (repository root)

```text
apps/
├── store-app/
│   └── src/
│       ├── pages/
│       │   └── Home.tsx
│       ├── contexts/
│       │   └── OfflineDataContext.tsx
│       └── types/
│           └── database.ts
├── admin-app/
│   └── src/
│       ├── lib/
│       │   └── supabase.ts
│       └── types/
│           └── index.ts
packages/
└── shared/
    └── src/
        ├── index.ts
        └── types/
            └── index.ts
```

**Structure Decision**: Keep current monorepo structure and implement via additive shared-type exports + consumer adoption in both apps; avoid introducing new architectural layers in this feature.

## Phase 0 - Research Plan

1. Decide where the shared core entity contract lives and how both apps consume it without forcing full schema parity.
2. Decide migration sequence for type adoption to avoid broad runtime impact.
3. Decide Home refresh trigger strategy after interval removal to keep operational confidence without explicit freshness UI.

## Phase 1 - Design Plan

1. Define shared entity model (core fields, extension strategy, ownership).
2. Define contract docs for:
   - shared core data contract
   - Home cash drawer view-update contract (event/reactive behavior)
3. Create quickstart steps for implementation + validation (lint/tests/manual checks).
4. Update agent context after plan is fully populated.

## Complexity Tracking

No constitution violations requiring justification are expected for this feature.
