# Implementation Plan: Automatic Undo Tracking System

**Branch**: `012-auto-undo-tracking` | **Date**: 2026-04-19 | **Spec**: [Link to spec](./spec.md)
**Input**: Feature specification from `/specs/012-auto-undo-tracking/spec.md`

**Note**: This template is filled in by the `/speckit.plan` command. See `.specify/templates/plan-template.md` for the execution workflow.

## Summary

**Primary Requirement**: Implement a Dexie hook-based change tracker system that automatically captures all database writes (create/update/delete) during operation execution and builds undo data automatically, eliminating the need for manual undo construction per operation.

**Technical Approach**: Create a module-level singleton `changeTracker` service that intercepts Dexie database hooks (`creating`, `updating`, and new `deleting` hooks) to record changes during session-based tracking. Provide a `withUndoOperation()` wrapper for operations to use instead of manual `pushUndo()` calls. The system automatically reverses captured changes into undo steps and integrates seamlessly with the existing executor in `undoLastAction()`. This solves the root problem: developers no longer need to manually construct undo data, eliminating the source of incomplete undo coverage (e.g., missing transaction deletes, journal entries).

## Technical Context

**Language/Version**: TypeScript 5.x, React 18, Node.js ≥18  
**Primary Dependencies**: Dexie v4 (IndexedDB ORM), Supabase JS v2, React Router 7, Tailwind CSS 3, Vite 7 (build), Electron 38 (desktop)  
**Storage**: IndexedDB (Dexie v4 local) + Supabase PostgreSQL (remote); sync via event log pattern  
**Testing**: Vitest (unit/integration), parity:gate (sync validation)  
**Target Platform**: Web (browser IndexedDB) + Electron desktop app (Windows NSIS installer)  
**Project Type**: Offline-first POS/ERP web and desktop application (monorepo: store-app + admin-app)  
**Performance Goals**: Sync accuracy (100% event capture), undo latency <50ms, no perceptible slowdown  
**Constraints**: sessionStorage-based undo (~5-10MB limit), single undo slot (not a stack), Dexie 4 hook API, no breaking changes to existing undo executor  
**Scale/Scope**: POS system with 20+ tables, 25+ operations, ~100 employee users per store instance

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

**Official Constitution Gates (CG-01 through CG-14):**

| Gate | Principle | Verdict | Rationale |
|------|-----------|---------|-----------|
| CG-01 | Offline-First Data Flow | ✅ Pass | All writes go to IndexedDB via Dexie; no Supabase writes |
| CG-02 | UI Data Access Boundary | ✅ Pass | New files are service-layer and operations-layer only; no UI imports |
| CG-03 | Event-Driven Sync | ✅ Pass | Existing sync trigger hooks are preserved unchanged; no polling added |
| CG-04 | Financial Atomicity | ✅ Pass | Does not modify `transactionService`; tracker passively captures its writes |
| CG-05 | Client-Side Ledger | ✅ Pass | Not applicable — no ledger computation changes |
| CG-06 | Branch Isolation | ✅ Pass | Not applicable — no query changes |
| CG-07 | RBAC Enforcement | ✅ Pass | Not applicable — no permission changes |
| CG-08 | Double-Entry Accounting | ✅ Pass | Tracker captures journal entries; does not create or modify them |
| CG-09 | Schema Consistency | ✅ Pass | No Dexie schema version changes; no Supabase migrations |
| CG-10 | Multilingual | ✅ Pass | Not applicable — no user-facing strings |
| CG-11 | Local Date Extraction | ✅ Pass | Not applicable — no date logic |
| CG-12 | Testing Discipline | ✅ Pass | `changeTracker.ts` (service) and `withUndoOperation.ts` (operation) MUST ship with Vitest tests; `db.ts` changes MUST pass `pnpm parity:gate` |
| CG-13 | Shared Package | ✅ Pass | Store-app only; no cross-app utilities needed |
| CG-14 | Undo Payload Storage | ✅ Pass | Undo payloads stored in sessionStorage only; no IndexedDB/localStorage persistence |

**Gate Status**: ✅ **PASS** — All 14 gates evaluated. CG-12 compliance requires Vitest tests for new service and operations files, and `pnpm parity:gate` for db.ts changes (tasks included in implementation plan).

## Project Structure

### Documentation (this feature)

```text
specs/012-auto-undo-tracking/
├── spec.md              # ✅ Feature specification (completed)
├── plan.md              # ✅ This file (implementation plan)
├── tasks.md             # ✅ Phase 2 output (/speckit.tasks command)
├── checklists/
│   └── requirements.md  # ✅ Quality validation (completed, all pass)
├── research.md          # Skipped — no unknowns to resolve
├── data-model.md        # Skipped — entities defined inline in spec.md Key Entities
└── quickstart.md        # Skipped — integration guide deferred to post-implementation docs
```

### Source Code (repository root)

```text
apps/store-app/
├── src/
│   ├── services/
│   │   └── changeTracker.ts         # NEW: Singleton tracker service
│   ├── contexts/
│   │   ├── OfflineDataContext.tsx   # Modified: Pass pushUndo to processEmployeePayment
│   │   └── offlineData/
│   │       ├── operations/
│   │       │   ├── withUndoOperation.ts   # NEW: Wrapper + suppression utilities
│   │       │   ├── undoOperations.ts      # Modified: Add withUndoSuppressed wrapper
│   │       │   └── paymentOperations.ts   # FUTURE: Migrate to withUndoOperation (Phase 3)
│   │       └── ... (other data layers)
│   └── lib/
│       └── db.ts                    # Modified: Add tracker calls to hooks + deleting hooks
├── tests/
│   └── unit/
│       └── changeTracker.test.ts    # NEW: Unit tests for tracker
└── ... (UI components, pages, etc.)

```

**Structure Decision**: This is a monorepo with store-app (main application) and admin-app (thin SPA). The undo tracking feature is infrastructure-only, confined to the store-app's services and context layers. No new files in UI/components. No changes to admin-app. New files: `changeTracker.ts`, `withUndoOperation.ts`. Modified files: `db.ts`, `undoOperations.ts`, `OfflineDataContext.tsx`, `paymentOperations.ts` (Phase 3).

## Implementation Phases

### Phase 0: Research & Unknowns
- ✅ All technical context is known (no NEEDS CLARIFICATION markers in spec)
- ✅ Architecture decisions are clear (Dexie hooks, session-based tracking)
- ✅ Skipped — no unknowns to resolve

### Phase 1: Design & Contracts
- ✅ Skipped — entities defined inline in spec.md; interfaces are straightforward TypeScript
- **Key Design Points** (captured in spec):
  - ChangeRecord: `{ op, table, primKey, record?, before?, modifications? }`
  - Session: `{ type, changes[] }`
  - UndoAction: same interface as existing system (no breaking changes)
  - Hooks integration: minimal, non-invasive (add tracker calls to existing hooks)

### Phase 2: Implementation Tasks (see tasks.md for full breakdown)

**Infrastructure** (10 tasks — T001 through T010):
- T001-T002: Create `changeTracker.ts` service with session management + `buildUndoFromChanges()`
- T003: Create `withUndoOperation.ts` wrapper + `withUndoSuppressed()` utility
- T004-T006: Modify `db.ts` — wire tracker into `triggerSyncOnUnsynced`, `triggerSyncOnUpdate`, add `deleting` hooks
- T007: Run `pnpm parity:gate` after db.ts changes (CG-12 compliance)
- T008: Modify `undoOperations.ts` — wrap `undoLastAction()` with suppression
- T009: Fix `OfflineDataContext.tsx` — wire real `pushUndo` to `processEmployeePayment`
- T010-T012: Create Vitest tests for `changeTracker.ts` and `withUndoOperation.ts` (CG-12 compliance)

**Validation** (11 tasks — T013 through T023, parallelizable):
- T013-T015: US1 automatic undo capture validation
- T016-T017: US2 backward compatibility regression testing
- T018-T019: US3 undo-of-undo prevention verification
- T020-T021: US4 sync exclusion verification
- T022-T023: US5 complex multi-table transaction validation

**Deferred to Phase 3** (5 tasks — T024 through T028):
- Migrate `processPayment` and `processEmployeePayment` to `withUndoOperation()`
- Validate migrated operations with regression testing

**Scope**: Phase 2 focuses on infrastructure + validation. Phase 3 (deferred) migrates the two broken operations.
