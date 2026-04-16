# Implementation Plan: Undo System Hardening

**Branch**: `011-undo-system-fixes` | **Date**: 2026-04-16 | **Spec**: [spec.md](./spec.md)
**Input**: Feature specification from `/specs/011-undo-system-fixes/spec.md`

## Summary

Close the correctness, reliability, and UX gaps in the existing single-level undo subsystem of the store-app. The feature is a **pure client-side refactor** of `contexts/offlineData/operations/undoOperations.ts`, `contexts/OfflineDataContext.tsx` (undo portions), and `components/common/UndoToastManager.tsx`. It preserves the existing undo data shape (type + affected list + ordered steps) and single-level semantics, but fixes:

1. **Outbox orphaning** — `restore` / `add` / `update` undo steps currently delete `pending_syncs` rows too aggressively, so restored or reverted records can silently disappear from the upload queue.
2. **Validity check incorrectly rejects restored records** — the current check treats "record missing from IndexedDB" as invalidation, even when the undo step is specifically a restoration.
3. **Unhandled `op: 'add'` step kind** — emitted by `deleteInventoryItem` but not handled in the undo executor.
4. **Toast trust & clarity** — generic label, locale-string-equality determines success/failure color, feedback toast never re-shows after visibility was toggled off.
5. **Multi-tab / stale-session safety** — `localStorage` key is shared across tabs and persists across browser sessions.
6. **Error handling** — `checkUndoValidity` has no try/catch; a malformed entry or unknown table name throws an uncaught promise rejection in the sync post-processing path.
7. **Dev-only test hook exposed in production builds.**

No Supabase schema change, no new server RPC, no IndexedDB version bump, no new dependencies.

## Technical Context

**Language/Version**: TypeScript 5.x, React 18, Node.js ≥18
**Primary Dependencies**: Dexie v4, Supabase JS v2, React Router 7, Tailwind CSS 3, Vite 7, Electron 38
**Storage**: Supabase (PostgreSQL — remote); IndexedDB via Dexie v4 (local, primary). Undo payload lives in browser storage (sessionStorage after this change).
**Testing**: Vitest (unit tests, service layer only — see constitution §8.Q)
**Target Platform**: Web (Netlify SPA) + Electron (Windows NSIS x64 desktop)
**Project Type**: offline-first POS web-app + desktop-app
**Performance Goals**: Undo execution MUST complete within one UI frame budget (~16ms) for single-record undos, and within 200ms for multi-record undos (e.g., bill delete cascading to audit logs). Works fully offline.
**Constraints**: offline-capable, multi-currency (USD + LBP), multilingual (en/ar/fr), RTL layout, RBAC per branch, atomic financial transactions, no server-side ledger RPCs. Undo MUST be tab-scoped and session-scoped (see spec FR-013/FR-014).
**Scale/Scope**: Single-store or multi-branch; 10–100 concurrent sessions per store. Undo is strictly per-tab, at most one pending action at a time.

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

Evaluation against the 11 gates defined in constitution §13.2:

| Gate | Result | Notes |
|------|--------|-------|
| **CG-01** Offline-First Data Flow | **PASS** | All undo work happens against IndexedDB via `getDB()`; no direct Supabase read/write is introduced. Pending_syncs manipulation remains local. |
| **CG-02** UI Data Access Boundary | **PASS** | `UndoToastManager.tsx` already imports only from `contexts/OfflineDataContext` and `i18n/`. This plan does not push any `lib/db` or `lib/supabase` import into UI components. Undo-time DB access stays inside `contexts/offlineData/operations/`. |
| **CG-03** Event-Driven Sync + Upload-Then-Emit | **PASS** | No new `setInterval` is introduced. The `UndoToastManager` timer is a UI auto-hide countdown, not a sync/refresh poll. No event emission is added. Undo continues to mutate `_synced=false` only; subsequent upload happens via the normal `syncService.uploadOnly()` path. |
| **CG-04** Financial Atomicity | **N/A** | Undo reverses prior steps captured by `transactionService`-originated operations. This feature does not create new financial records. For `cash_drawer_accounts`, the existing exemption is preserved unchanged. |
| **CG-05** Client-Side Ledger | **N/A** | No ledger computation changes. |
| **CG-06** Branch Isolation | **PASS** | Undo only acts on records already in the current tab's IndexedDB (already branch-scoped). No new cross-branch data exposure. |
| **CG-07** RBAC Enforcement | **PASS** | Undo operates on records the user already has permission to act on (the original operation required the permission). No new permission surface is introduced. |
| **CG-08** Double-Entry Accounting | **N/A** | Undo steps that touch `journal_entries` continue to use the existing cascade-delete path by `transaction_id` — no new journal entries are created. |
| **CG-09** Schema Consistency | **PASS** | No new tables, no schema changes, no IndexedDB version bump, no SQL migration required. |
| **CG-10** Multilingual | **PASS** | New toast labels (e.g., "Sale deleted") are added via `i18n/locales/{en,ar,fr}.ts`. No hardcoded user-facing strings. |
| **CG-11** Local Date Extraction | **N/A** | Feature does no date derivation. |

**Overall gate status: PASS.** No `Complexity Tracking` violations to document.

## Project Structure

### Documentation (this feature)

```text
specs/011-undo-system-fixes/
├── plan.md              # This file
├── research.md          # Phase 0 output
├── data-model.md        # Phase 1 output
├── quickstart.md        # Phase 1 output
├── contracts/
│   └── undo-api.md      # Phase 1 — context-level undo contract
├── checklists/
│   └── requirements.md  # Created by /speckit.specify
└── tasks.md             # Phase 2 — /speckit.tasks
```

### Source Code (repository root)

Files that will be **modified** by this feature:

```text
apps/store-app/src/
├── contexts/
│   ├── OfflineDataContext.tsx                           ← checkUndoValidity try/catch + tableNameMap;
│   │                                                       pushUndo writes to sessionStorage;
│   │                                                       canUndo initial state from sessionStorage;
│   │                                                       testUndo dev-only guard.
│   └── offlineData/
│       ├── offlineDataContextContract.ts                ← UndoStep.op union: add 'add'; add metadata typing.
│       └── operations/
│           └── undoOperations.ts                        ← Core rewrite: op-specific pending_syncs cleanup;
│                                                           handle 'add' op; fix restore pending_syncs;
│                                                           skip-existence-check for restore/add targets;
│                                                           switch to sessionStorage.
├── components/common/
│   └── UndoToastManager.tsx                             ← feedbackType state (explicit success/fail);
│                                                           action-type label lookup; remove `visible`
│                                                           from effect deps; correct feedback
│                                                           visibility; read from sessionStorage.
└── i18n/locales/
    ├── en.ts                                            ← common.labels.undoActions.<type> map
    ├── ar.ts                                            ← common.labels.undoActions.<type> map
    └── fr.ts                                            ← common.labels.undoActions.<type> map
```

Files that will be **read but not modified** (for understanding):
- `apps/store-app/src/contexts/offlineData/operations/{bill,sale,inventoryItem,inventoryBatch,entity,product,employeeBranch,payment,transaction,cashDrawerTransaction}Operations.ts` — call sites of `pushUndo`, canonical source of `type` strings and step shapes.
- `apps/store-app/src/lib/db.ts` — `addPendingSync` / `pending_syncs` schema (no change).

**Structure Decision**: This feature is a localized refactor within three existing layers (operations, context, component). The changes respect the constitution's UI Data Access Boundary (CG-02): the UI-facing component (`UndoToastManager.tsx`) continues to consume the `useOfflineData` context and never imports `lib/db`. All database mutations stay inside `contexts/offlineData/operations/undoOperations.ts`. No new directories are introduced.

## Complexity Tracking

*No constitutional violations to justify — table intentionally empty.*

| Violation | Why Needed | Simpler Alternative Rejected Because |
|-----------|------------|-------------------------------------|
| — | — | — |
