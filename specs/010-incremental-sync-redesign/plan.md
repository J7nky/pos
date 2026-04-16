# Implementation Plan: Incremental Sync Service Redesign

**Branch**: `010-incremental-sync-redesign` | **Date**: 2026-04-14 | **Spec**: [spec.md](./spec.md)
**Input**: Feature specification from `/specs/010-incremental-sync-redesign/spec.md`

## Summary

Replace the full-table-scan-on-every-launch sync with a tiered, version-cursor-based incremental sync. Tier 1 tables (stores, branches, products, users, accounts, entities) load synchronously on cold start; Tier 2/3 load in background. Delta sync uses per-table `last_synced_version` checkpoints (integer sequence numbers) instead of timestamps. The outbox (`pending_syncs`) gains idempotency keys and permanent-failure handling. Store-scoped checkpoints survive logout/login within the same store, eliminating redundant full resyncs.

## Technical Context

**Language/Version**: TypeScript 5.x, React 18, Node.js ≥18
**Primary Dependencies**: Dexie v4, Supabase JS v2, React Router 7, Tailwind CSS 3, Vite 7, Electron 38
**Storage**: Supabase (PostgreSQL — remote); IndexedDB via Dexie v4 (local, primary)
**Testing**: Vitest (unit tests, service layer only)
**Target Platform**: Web (Netlify SPA) + Electron (Windows NSIS x64 desktop)
**Project Type**: offline-first POS web-app + desktop-app
**Performance Goals**: Works fully offline; syncs within seconds of reconnect; sub-100ms local reads from IndexedDB; UI interactive within 2s on returning login
**Constraints**: offline-capable, multi-currency (USD + LBP), multilingual (en/ar/fr), RTL layout, RBAC per branch, atomic financial transactions, no server-side ledger RPCs
**Scale/Scope**: Single-store or multi-branch; 10–100 concurrent sessions; 100k+ records per store

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-checked after Phase 1 design — all gates still pass.*

| Gate | Principle | Result | Notes |
|------|-----------|--------|-------|
| CG-01 | Offline-First Data Flow | **PASS** | All sync changes are in service layer only. No UI reads/writes Supabase. |
| CG-02 | UI Data Access Boundary | **PASS** | No new UI components introduced. Service-layer refactor only. |
| CG-03 | Event-Driven Sync | **PASS** | `uploadOnly()` signature unchanged for performSync/auto-sync. No new setInterval. Upload-then-emit contract preserved. New `downloadTier()` is called from `useOfflineInitialization`, not a timer. |
| CG-04 | Financial Atomicity | **N/A** | No financial transactions created by sync redesign. |
| CG-05 | Client-Side Ledger | **N/A** | No ledger RPCs introduced. |
| CG-06 | Branch Isolation | **PASS** | All download queries include `store_id` and `branch_id` filters. Checkpoint table scoped by `store_id`. |
| CG-07 | RBAC Enforcement | **PASS** | FR-013 adds 403 detection → forced re-auth, strengthening RBAC enforcement. |
| CG-08 | Double-Entry Accounting | **N/A** | Sync does not create accounting records. |
| CG-09 | Schema Consistency | **PASS** | Dexie v54 → v55 with migration upgrade block (see data-model.md). No new Supabase tables. All existing tables already carry required fields per constitution §3 CG-09. |
| CG-10 | Multilingual | **PASS** | Operator-facing status/alert strings must use `createMultilingualFromString()`. |
| CG-11 | Local Date Extraction | **PASS** | Sync uses integer version numbers. Any date display in status indicators must use `getLocalDateString()` — never `toISOString().split('T')[0]`. |

## Project Structure

### Documentation (this feature)

```text
specs/010-incremental-sync-redesign/
├── plan.md              # This file
├── research.md          # Phase 0 — decisions and rationale
├── data-model.md        # Phase 1 — schema changes (Dexie v55)
├── quickstart.md        # Phase 1 — developer guide + test scenarios
├── contracts/
│   └── sync-service-contract.ts   # TypeScript interface contracts
└── tasks.md             # Phase 2 output (/speckit.tasks — not yet created)
```

### Source Code (repository root)

```text
apps/store-app/src/
├── lib/
│   └── db.ts                          ← Dexie v55 bump + SyncMetadata/PendingSync migration
├── types/
│   └── index.ts                       ← Extend SyncMetadata + PendingSync interfaces
├── services/
│   ├── syncConfig.ts                  ← Add SYNC_TIERS, cursorPageSize; keep SYNC_TABLES
│   └── syncService.ts                 ← Add downloadTier(), downloadTablePaged(),
│                                         getCheckpoint(), saveCheckpoint(),
│                                         hasExistingData(); update processPendingSyncs()
└── contexts/
    └── offlineData/
        ├── useOfflineInitialization.ts ← Replace unconditional fullResync with
        │                                  hasExistingData() → tier-based init
        └── useStoreSwitchLifecycle.ts  ← Verify (no change expected)

apps/store-app/src/pages/
└── UnsyncedItems.tsx                  ← Extend to show permanently_failed outbox items

apps/store-app/tests/ (new Vitest tests)
└── services/
    ├── syncService.downloadTablePaged.test.ts
    ├── syncService.hasExistingData.test.ts
    ├── syncService.outbox.test.ts
    └── db.migration.v55.test.ts
```

**Structure Decision**: Service-layer-only refactor within the existing monorepo structure. No new top-level directories. Changes are confined to `apps/store-app` — `admin-app` and `packages/shared` are unaffected.

## Complexity Tracking

> No constitution gate violations. No entries required.
