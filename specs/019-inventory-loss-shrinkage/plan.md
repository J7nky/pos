# Implementation Plan: Inventory Loss & Shrinkage

**Branch**: `019-inventory-loss-shrinkage` | **Date**: 2026-07-02 | **Spec**: [spec.md](./spec.md)
**Input**: Feature specification from `/specs/019-inventory-loss-shrinkage/spec.md`

## Summary

Record the three ways produce is lost between receiving and bill-close — **weight shrinkage** (auto), **lost/missing** and **spoiled/wasted** (manual) — under one lot-scoped loss ledger, keep stock quantities honest, and reflect owned-inventory losses in the books (Dr `5950` Inventory Loss / Cr `1300` Inventory) while treating commission losses as memo-only. Technical approach: a new `inventory_loss_events` Dexie+Supabase table (v70→v71), three additive `inventory_items` columns (`weight_tracked`, `weight_remaining`, `nominal_unit_weight`), a dependency-injected `lossOperations.ts` module surfaced through `OfflineDataContext`, journal posting via `transactionService` (new `INVENTORY_LOSS` category + `5950/1300` mapping), automatic shrinkage + count-reconciliation hooked into the existing bill-close flow, and sync via the upload-then-emit contract. All per-lot (no FIFO), offline-first.

## Technical Context

**Language/Version**: TypeScript 5.x, React 18, Node.js ≥18
**Primary Dependencies**: Dexie v4, Supabase JS v2, React Router 7, Tailwind CSS 3, Vite 7, Electron 38
**Storage**: Supabase (PostgreSQL — remote); IndexedDB via Dexie v4 (local, primary, schema bump **70 → 71**)
**Testing**: Vitest (service + operations layers); `pnpm parity:gate` for sync-critical changes
**Target Platform**: Web (Netlify SPA) + Electron (Windows NSIS x64)
**Project Type**: offline-first POS web-app + desktop-app
**Performance Goals**: fully offline; sync within seconds of reconnect; sub-100ms local reads; loss recording < 20s end-to-end (SC-004)
**Constraints**: offline-capable, multi-currency (USD + LBP), multilingual (en/ar/fr, RTL), RBAC per branch, atomic financial transactions, no server-side ledger RPCs
**Scale/Scope**: single-store or multi-branch; 10–100 concurrent sessions per store

## Constitution Check

*GATE: evaluated against constitution v1.5.0 (CG-01 … CG-14). Re-checked post-design.*

| Gate | Principle | Status | How this feature complies |
|---|---|---|---|
| CG-01 | Offline-First Data Flow | ✅ | Loss writes to IndexedDB first (`_synced:false`), then syncs; never writes Supabase from UI. |
| CG-02 | UI Data Access Boundary | ✅ | UI calls `useOfflineData()` delegates only; no `db`/`supabase` imports in components. |
| CG-03 | Event-Driven Sync + Upload-Then-Emit | ✅ | Operation does not emit; `syncService.uploadLocalChanges()` emits `inventory_loss_posted` after upload (R7). |
| CG-04 | Financial Atomicity via TransactionService | ✅ | Owned losses post via `transactionService.createTransaction` (`INVENTORY_LOSS`); no direct financial writes. |
| CG-05 | Client-Side Ledger Computation | ✅ | Loss report + reconciliation computed from IndexedDB; no new server RPC. |
| CG-06 | Branch-Level Isolation | ✅ | `inventory_loss_events` carries `store_id`+`branch_id`; RLS enforces isolation. |
| CG-07 | RBAC Enforcement | ✅ | `record_inventory_loss` op checked via `accessControlService`; new UI under `<ProtectedRoute>`. |
| CG-08 | Double-Entry Accounting | ✅ | Owned losses → balanced `journalService` entries (Dr 5950 / Cr 1300). Commission → no entry (no monetary movement). |
| CG-09 | Schema Consistency | ✅ | New table has `store_id/created_at/updated_at` + `_synced/_lastSyncedAt/_deleted`; Supabase migration **and** Dexie v71 bump. |
| CG-10 | Multilingual by Default | ✅ | Reason labels, descriptions, notes via multilingual utils; en/ar/fr keys added. |
| CG-11 | Local Date via getLocalDateString | ✅ | Report period/today bucketing uses `getLocalDateString`/`getTodayLocalDate`. |
| CG-12 | Testing Discipline | ✅ | New `lossOperations.ts` ships Vitest; sync-critical touches (`syncService`, `eventEmissionService`, `transactionService`, operations) run `pnpm parity:gate`. |
| CG-13 | Shared Package Source of Truth | ✅ | Store-app-only feature; no cross-app duplication; promote enums to `packages/shared` only if admin-app later needs them (R12). |
| CG-14 | Undo Payload Storage Boundary | ✅ | Reversal uses the dedicated loss lifecycle, not IndexedDB-persisted undo; any `pushUndo` use stays in sessionStorage. |

**Result**: PASS — no violations. Complexity Tracking not required.

## Project Structure

### Documentation (this feature)
```text
specs/019-inventory-loss-shrinkage/
├── plan.md              # This file
├── research.md          # Phase 0 — decisions R1..R12
├── data-model.md        # Phase 1 — schema
├── quickstart.md        # Phase 1 — build order + verification
├── contracts/
│   └── loss-operations.md   # Phase 1 — operation/context/service contracts
├── checklists/
│   └── requirements.md   # from /speckit.specify
└── tasks.md             # /speckit.tasks (NOT created here)
```

### Source Code (files to add / modify)
```text
apps/store-app/src/
├── lib/
│   ├── db.ts                         # MODIFY: version(71) + upgradeV71
│   └── dbSchema.ts                   # MODIFY: CURRENT_DB_VERSION=71; V71_STORES (inventory_loss_events)
├── types/
│   ├── index.ts                      # MODIFY: InventoryItem (+3 cols); InventoryLossEvent; OperationName (+record_inventory_loss)
│   └── database.ts                   # MODIFY: regenerated Supabase types (new table + columns)
├── constants/
│   ├── chartOfAccounts.ts            # MODIFY: +5950
│   └── transactionCategories.ts      # MODIFY: +INVENTORY_LOSS + type map
├── utils/
│   └── accountMapping.ts             # MODIFY: +INVENTORY_LOSS → 5950/1300
├── contexts/
│   ├── OfflineDataContext.tsx        # MODIFY: wire loss deps/delegates + lossEvents
│   └── offlineData/
│       ├── offlineDataContextContract.ts   # MODIFY: +loss surface, +'losses' RefreshDomain
│       ├── useLossDataLayer.ts       # NEW: hydrate lossEvents
│       └── operations/
│           ├── lossOperations.ts     # NEW: record/reverse/reconcile (+ .test.ts)
│           ├── inventoryItemOperations.ts  # MODIFY: per-lot deduct helper (weight+qty)
│           └── saleOperations.ts     # MODIFY: mandatory weight + per-lot dual decrement
├── services/
│   ├── eventEmissionService.ts       # MODIFY: emitInventoryLossPosted
│   ├── syncService.ts                # MODIFY: register table (Tier 2) + emit after upload
│   ├── auditLogService.ts            # MODIFY: +inventory_loss_recorded/_reversed
│   ├── rolePermissionService.ts      # MODIFY: grant record_inventory_loss (admin/manager)
│   └── lossReportService.ts          # NEW (or extend reportingService): getLossReport
├── components/
│   ├── inventory/ReportLossModal.tsx # NEW: manual loss modal
│   ├── accountingPage/.../ReceivedBillSalesLogsModal.tsx  # MODIFY: reconciliation panel + block-close
│   └── reports/LossReport.tsx        # NEW: loss report view
├── pages/
│   ├── Inventory.tsx                 # MODIFY: Report Loss entry point
│   └── Accounting.tsx                # MODIFY: handleCloseReceivedBill → reconcile + auto-shrinkage
└── i18n/locales/{en,ar,fr}.ts        # MODIFY: loss reasons/labels/descriptions

supabase/migrations/
└── <ts>_inventory_loss_shrinkage.sql # NEW: table + inventory_items cols + 5950 seed + RLS
```

**Structure Decision**: Follows the established offline-first layered architecture (constitution §2.3) — UI → `OfflineDataContext` → dependency-injected operation module → services → Dexie → sync. The new operation module `lossOperations.ts` mirrors `paymentOperations.ts`; no new architectural layer is introduced.

## Design highlights (from Phase 1)

- **Per-lot, no FIFO** (R4): losses and weight sales target the exact `inventory_item_id`, matching the per-supplier-bill business model. The FIFO-by-product `deductInventoryQuantity` helper is not used for weight lots.
- **Dual-measure weight lots** (Q2/Q3): `weight_remaining` (live) + `quantity` (live) + `nominal_unit_weight`. At close, leftover units are classified first (each consuming `nominal_unit_weight`), then residual weight is auto-shrinkage — single per-weight cost basis, so no double-count and the owned lot's `1300` contribution zeroes (FR-006, R5).
- **Commission = memo-only** (R6): `transaction_id=null`, no journal.
- **Reversible** (R10) via the correction lifecycle (`status`, lineage).

## Open items carried to tasks (non-blocking)
1. Confirm COGS posting timing (per-sale vs at-close in `profitLossService`) and assert the lot "zero residual" invariant with a Vitest reconciliation test (R5).
2. Pin the exact sale-creation deduction call site used by `POS.tsx`/`billOperations.ts` for the per-lot dual decrement (R4).
3. Confirm `syncService`'s table→event emission mechanism to register `inventory_loss_posted` correctly (R7).

## Phase status
- [x] Phase 0 — research.md
- [x] Phase 1 — data-model.md, contracts/, quickstart.md
- [ ] Phase 2 — tasks.md (run `/speckit.tasks`)
