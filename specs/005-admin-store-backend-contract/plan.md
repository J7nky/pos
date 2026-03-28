# Implementation Plan: Admin-app and store-app shared backend data contract

**Branch**: `005-admin-store-backend-contract` | **Date**: 2026-03-25 | **Spec**: [spec.md](./spec.md)  
**Input**: Feature specification from `/specs/005-admin-store-backend-contract/spec.md`

## Summary

Align **overlapping** remote-database semantics for **stores**, **branches**, **staff users**, and **store subscriptions** so admin-app and store-app share **one normative TypeScript contract** in `@pos-platform/shared` (`packages/shared/src/types/supabase-core.ts`), with **supplementary markdown** under this feature’s `contracts/` folder that must not contradict the exports (per spec FR-001, FR-005, and clarification Option A).

**Technical approach**: (1) Treat `StoreCore`, `BranchCore`, `UserCore`, and `StoreSubscriptionCore` as the **only** authoritative definitions of overlapping columns; (2) ensure **admin** `Store` / `Branch` / `StoreUser` and **store** `Database['public']['stores']['Row']` (etc.) **extend or intersect** those cores without redefining core fields; (3) add or tighten **documentation + optional CI checks** (e.g. type tests or lint) so drift is caught before release; (4) no change to sync order, Dexie schema, or UI data-access boundaries for this feature alone.

## Technical Context

**Language/Version**: TypeScript 5.x, React 18, Node.js ≥18  
**Primary Dependencies**: `@pos-platform/shared` (workspace), Supabase JS v2 (both apps), Dexie v4 (store-app only), Vite 7, React Router 7  
**Storage**: Supabase (PostgreSQL — remote) for both apps; IndexedDB via Dexie (store-app local — not in scope for contract edits except where `types/database.ts` references cores)  
**Testing**: Vitest (store-app / shared as configured in repo)  
**Target Platform**: Web (Netlify SPA) for admin-app; web + Electron for store-app  
**Project Type**: pnpm monorepo — two SPAs + one shared types package  
**Performance Goals**: N/A for static types; no runtime hot path changed  
**Constraints**: Normative contract lives in **shared package exports** only; supplementary docs must mirror exports; store-app remains offline-first and must not gain direct Supabase usage in UI (unchanged)  
**Scale/Scope**: Four core interfaces + app-specific extensions; no requirement to move full `Database` type into shared

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-checked after Phase 1 design.*

| Gate ID | Principle | Status | Notes |
|---------|-----------|--------|--------|
| CG-01 | Offline-first (IndexedDB first) | **N/A** | Feature is shared **types** and documentation; does not add UI writes to Supabase. |
| CG-02 | UI data access boundary | **PASS** | No new `lib/db` or `lib/supabase` imports in `pages/` / `components/` / `layouts/`. |
| CG-03 | Event-driven sync + upload-then-emit | **N/A** | No changes to sync or event emission. |
| CG-04 | Financial atomicity | **N/A** | Not a financial feature. |
| CG-05 | Client-side ledger | **N/A** | |
| CG-06 | Branch isolation | **N/A** | Contract describes shapes; RLS unchanged. |
| CG-07 | RBAC | **N/A** | |
| CG-08 | Double-entry | **N/A** | |
| CG-09 | Schema consistency | **PASS** | No new Supabase tables required for this feature. If a future schema change adds columns to `stores` / `branches` / `users` / `store_subscriptions`, follow normal migration + Dexie rules **when** store-app persists those columns. |
| CG-10 | Multilingual | **N/A** | No new user-facing strings in product UI for pure type work. |
| CG-11 | Local date extraction | **N/A** | No date-default logic in scope. |

**Re-evaluation (post-design)**: No constitution violations introduced. Shared types remain in `packages/shared`; admin-app already consumes shared; store-app already imports `StoreCore` / `UserCore` in `types/database.ts`.

## Project Structure

### Documentation (this feature)

```text
specs/005-admin-store-backend-contract/
├── plan.md              # This file
├── research.md          # Phase 0
├── data-model.md        # Phase 1
├── quickstart.md        # Phase 1
└── contracts/
    └── shared-supabase-core-contract.md
```

### Source Code (repository root)

```text
packages/shared/src/types/
├── supabase-core.ts      # Normative StoreCore, BranchCore, UserCore, StoreSubscriptionCore
└── index.ts              # Re-exports cores + legacy shared interfaces

apps/admin-app/src/types/
└── index.ts              # Store, Branch, StoreUser extend *Core from shared

apps/store-app/src/types/
└── database.ts           # Database['public'] Row types intersect/extend *Core
```

**Structure Decision**: Single normative module (`supabase-core.ts`) in `@pos-platform/shared`; both apps **import cores from shared** and **declare extensions** locally. No second “canonical” copy of core field lists in either app.

## Complexity Tracking

> No constitution violations requiring justification. Complexity is intentionally **low**: documentation + alignment checks around existing exports.

| Violation | Why Needed | Simpler Alternative Rejected Because |
|-----------|------------|-------------------------------------|
| — | — | — |

## Phase 0 & Phase 1 Outputs

| Artifact | Path | Purpose |
|----------|------|---------|
| Research | [research.md](./research.md) | Decisions on drift prevention, doc location, optional verification |
| Data model | [data-model.md](./data-model.md) | Entity/field relationships for four cores + extension rules |
| Contract (human) | [contracts/shared-supabase-core-contract.md](./contracts/shared-supabase-core-contract.md) | Supplementary contract readable by reviewers; subordinate to package exports |
| Quickstart | [quickstart.md](./quickstart.md) | How to change cores, verify both apps, release checklist |

**Next step**: `/speckit.tasks` to break work into implementation tasks.
