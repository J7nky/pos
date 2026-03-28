# Implementation Plan: Modular sync service split

**Branch**: `006-sync-service-modular-split` | **Date**: 2026-03-27 | **Spec**: [spec.md](./spec.md)  
**Input**: Feature specification from `/specs/006-sync-service-modular-split/spec.md`

## Summary

Split `apps/store-app/src/services/syncService.ts` into focused modules—**configuration**, **upload** (including upload-then-emit), **download**, and **deletion detection**—with a thin **orchestrator** (`SyncService` + module functions) that preserves call order and behavior. **No schema changes.** Acceptance is the existing **parity gate** (`pnpm run parity:gate` in store-app): Vitest parity suite, registry/dexie checks, and coverage matrix.

## Technical Context

**Language/Version**: TypeScript 5.x, React 18, Node.js ≥18  
**Primary Dependencies**: Dexie v4, Supabase JS v2, React Router 7, Tailwind CSS 3, Vite 7, Electron 38  
**Storage**: Supabase (PostgreSQL — remote); IndexedDB via Dexie v4 (local, primary)  
**Testing**: Vitest; parity config `vitest.parity.config.ts`; scripts `test:parity`, `parity:gate`  
**Target Platform**: Web (Netlify SPA) + Electron (Windows NSIS x64)  
**Project Type**: offline-first POS web-app + desktop-app (store-app only)  
**Performance Goals**: No regression vs baseline: median full sync cycle ≤ +10% vs pre-refactor (see spec SC-003)  
**Constraints**: Offline-capable; **upload-then-emit** (CG-03) unchanged—events only after confirmed upload; parity gate must stay green  
**Scale/Scope**: ~2.8k+ LOC today in one file; split into 4 domain modules + orchestrator without changing public exports used by context/tests

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| Gate | Principle | Evaluation |
|------|-----------|------------|
| CG-01 | Offline-first | **PASS** — Refactor does not route UI to Supabase; sync remains the bridge after local writes. |
| CG-02 | UI boundary | **PASS** — No changes to `pages/`, `components/`, `layouts/` imports; `syncService` stays under `services/`. |
| CG-03 | Event-driven sync + upload-then-emit | **PASS** — Design keeps `eventEmissionService` calls inside the **upload** path after each batch is confirmed on Supabase; no new `setInterval` in sync path. |
| CG-04 | Financial atomicity | **N/A** |
| CG-05 | Client-side ledger | **N/A** |
| CG-06 | Branch isolation | **PASS** — Preserve existing `branch_id` / `store_id` filters; no new cross-branch queries. |
| CG-07 | RBAC | **N/A** |
| CG-08 | Double-entry | **N/A** |
| CG-09 | Schema consistency | **PASS** — No new tables; no Dexie version bump required for this refactor alone. |
| CG-10 | i18n | **N/A** |
| CG-11 | Local date | **PASS** — No change to date handling; continue using existing utilities (`normalizeBillDateFromRemote`, etc.). |

**Post-design check**: Module boundaries must not split upload-then-emit across layers such that emit could run before upload confirmation.

## Project Structure

### Documentation (this feature)

```text
specs/006-sync-service-modular-split/
├── plan.md              # This file
├── research.md          # Phase 0 — module boundaries and extraction strategy
├── data-model.md        # Phase 1 — conceptual modules and orchestration flow
├── quickstart.md        # Phase 1 — verify parity locally
├── contracts/           # Phase 1 — public API stability
│   └── sync-public-api.md
└── tasks.md             # /speckit.tasks (not created by this command)
```

### Source Code (store-app)

```text
apps/store-app/src/services/
├── syncService.ts                 # SyncService class: orchestration, public API, re-exports as needed
├── syncConfig.ts                # SYNC_CONFIG, SYNC_TABLES, SYNC_DEPENDENCIES, SyncTable, SyncResult type
├── syncUpload.ts                # uploadLocalChanges + upload helpers; eventEmissionService after confirmed upload
├── syncDownload.ts              # downloadRemoteChanges + per-table download helpers
├── syncDeletionDetection.ts      # detectAndSyncDeletions, pagination/hash, deletion state
├── dataValidationService.ts     # unchanged consumer
├── eventEmissionService.ts        # unchanged; invoked from upload module only
└── universalChangeDetectionService.ts  # unchanged

apps/store-app/tests/
├── sync-parity/                   # parity gate + scenarios (unchanged contract)
└── sync-baseline/                 # golden fixtures

apps/store-app/
├── eslint.config.js               # extend targeted `no-explicit-any` override to new sync modules if split
└── vitest.parity.config.ts
```

**Structure decision**: New files live **alongside** `syncService.ts` under `src/services/` (flat, per IMPROVEMENTS_ENHANCEMENTS_REPORT §2.1). Optional later: `services/sync/` subfolder if barrel exports are needed—prefer flat first to reduce import churn.

## Complexity Tracking

> Fill only if Constitution Check has unjustified violations.

| Violation | Why Needed | Simpler Alternative Rejected Because |
|-----------|------------|-------------------------------------|
| — | — | — |

No violations.

## Phase 0: Research

Delivered in [research.md](./research.md). All technical choices for “how to split without behavior change” are resolved there (extraction order, shared context, test strategy).

## Phase 1: Design & Contracts

- [data-model.md](./data-model.md) — Conceptual modules, orchestration sequence, shared state.
- [contracts/sync-public-api.md](./contracts/sync-public-api.md) — Stable exports for `OfflineDataContext`, parity tests, and helpers.
- [quickstart.md](./quickstart.md) — Commands and merge criteria.

## Phase 2

*Task breakdown is produced by `/speckit.tasks`, not by `/speckit.plan`.*
