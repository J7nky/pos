# Tasks: Error Handling and Validation Best Practices

**Input**: Design documents from `/specs/007-error-handling-validation/`  
**Branch**: `007-error-handling-validation`  
**Date**: 2026-03-27  
**Prerequisites**: plan.md ✅, spec.md ✅, research.md ✅, data-model.md ✅, contracts/ ✅, quickstart.md ✅

**Organization**: Tasks are grouped by user story so each story can be implemented, tested, and demoed independently.

## Format: `[ID] [P?] [Story?] Description — file path`

- **[P]**: Can run in parallel (touches a different file, no dependency on an incomplete task in the same phase)
- **[US1/US2/US3]**: Maps to a user story from spec.md (setup and polish phases carry no story label)

---

## Phase 1: Setup — Core Types & i18n

**Purpose**: Establish the zero-dependency type definitions and i18n strings that every subsequent phase depends on.

**⚠️ CRITICAL**: All later phases depend on `types/errors.ts` and the i18n keys. Complete this phase first.

- [X] T001 Create `apps/store-app/src/types/errors.ts` — define `ErrorCategory`, `AppErrorCode`, `AppError`, `FieldViolation`, and `ValidationResult<T>` exactly as specified in `contracts/error-handling-contract.md §1`
- [X] T002 [P] Add `errors.*` English message keys for all 22 error codes to `apps/store-app/src/i18n/locales/en.ts` under the `errors` namespace (see `contracts/error-handling-contract.md §6` for the full key list)
- [X] T003 [P] Add `errors.*` Arabic and French message keys to `apps/store-app/src/i18n/locales/ar.ts` and `apps/store-app/src/i18n/locales/fr.ts` (English copy as fallback with `// TODO: translate` comments where translations are not available)

**Checkpoint**: Run `pnpm --filter ./apps/store-app tsc --noEmit` — zero type errors on `types/errors.ts`. All locale files compile cleanly.

---

## Phase 2: Foundational — `toAppError` Utility

**Purpose**: The `toAppError` utility function is the single building block consumed by ALL three user stories (US1 for wrapping unknown catch values, US2 for service-layer throws, US3 for token error surfacing). It must exist before any user story work begins.

**⚠️ CRITICAL**: No user story work can begin until this phase is complete.

- [X] T004 Create `apps/store-app/src/services/businessValidationService.ts` with only the `toAppError(thrown: unknown, fallbackCode?: AppErrorCode): AppError` function and the per-code `ErrorCategory` lookup map — do NOT add the validation methods yet (those are US2 work in Phase 4)
- [X] T005 Verify TypeScript compiles cleanly after T004: `pnpm --filter ./apps/store-app tsc --noEmit` — zero errors

**Checkpoint**: Foundation ready — all three user story phases can now begin.

---

## Phase 3: User Story 1 — Cashier Receives Clear, Actionable Error Feedback (Priority: P1) 🎯 MVP

**Goal**: Replace every silent `console.error()` in the 9 page files with a centralized notification channel. When any service-layer operation fails, the cashier sees a human-readable toast notification rather than a silent console log.

**Independent Test**: Submit a transaction form with an empty amount field. Confirm a user-visible error notification appears on screen. Open the browser console and confirm the error is NOT silently swallowed — `console.error` is gone from the catch block. No other story needs to be implemented first.

### Implementation for User Story 1

- [X] T006 [US1] Create `apps/store-app/src/contexts/ErrorNotificationContext.tsx` — `ErrorNotificationState` shape, `ErrorNotificationProvider`, and `useErrorNotificationContext` hook as defined in `contracts/error-handling-contract.md §4`; max 5 simultaneous notifications with auto-dismiss of the oldest when the limit is exceeded
- [X] T007 [US1] Create `apps/store-app/src/hooks/useErrorHandler.ts` — exposes `{ handleError, notifications, dismiss, dismissAll }`; calls `toAppError` from `businessValidationService.ts` for unknown thrown values; resolves `messageKey` via `getTranslatedString()` from `utils/multilingual.ts` (depends on T006)
- [X] T008 [US1] Create `apps/store-app/src/components/common/ErrorToastContainer.tsx` — reads `notifications` from `useErrorHandler`; renders one toast per active `ErrorNotification`; uses Tailwind CSS; supports RTL layout; distinguishes `'validation'` / `'system'` / `'unrecoverable'` visually (border colour / icon) (depends on T007)
- [X] T009 [US1] Add `<ErrorNotificationProvider>` to the provider composition in `apps/store-app/src/App.tsx` — insert above `<OfflineDataProvider>` per `contracts/error-handling-contract.md §4` placement rule (depends on T006)
- [X] T010 [US1] Add `<ErrorToastContainer />` to `apps/store-app/src/layouts/Layout.tsx` alongside the existing `<OfflineIndicator />` (depends on T008)
- [X] T011 [P] [US1] Replace all `console.error(...)` calls in `apps/store-app/src/pages/POS.tsx` with `const { handleError } = useErrorHandler()` and `handleError(error)` in every catch block (depends on T007)
- [X] T012 [P] [US1] Replace all `console.error(...)` calls in `apps/store-app/src/pages/Accounting.tsx` with `handleError(error)` (depends on T007)
- [X] T013 [P] [US1] Replace all `console.error(...)` calls in `apps/store-app/src/pages/Home.tsx` with `handleError(error)` (depends on T007)
- [X] T014 [P] [US1] Replace all `console.error(...)` calls in `apps/store-app/src/pages/Inventory.tsx` with `handleError(error)` (depends on T007)
- [X] T015 [P] [US1] Replace all `console.error(...)` calls in `apps/store-app/src/pages/Settings.tsx` with `handleError(error)` (depends on T007)
- [X] T016 [P] [US1] Replace all `console.error(...)` calls in `apps/store-app/src/pages/Customers.tsx` with `handleError(error)` (depends on T007)
- [X] T017 [P] [US1] Replace all `console.error(...)` calls in `apps/store-app/src/pages/Employees.tsx` with `handleError(error)` (depends on T007)
- [X] T018 [P] [US1] Replace all `console.error(...)` calls in `apps/store-app/src/pages/UnsyncedItems.tsx` with `handleError(error)` (depends on T007)
- [X] T019 [P] [US1] Replace all `console.error(...)` calls in `apps/store-app/src/pages/PublicCustomerStatement.tsx` with `handleError(error)` in the token-null catch path (depends on T007; the expired-token AppError code is wired in US3 Phase 5)
- [X] T020 [US1] Write Vitest unit tests for `useErrorHandler` in `apps/store-app/src/hooks/__tests__/useErrorHandler.test.ts` — cover: `handleError` with a typed `AppError`; `handleError` with a plain `Error`; `handleError` with an unknown value; `dismiss` by ID; `dismissAll`; max-5-notification cap

**Checkpoint**: User Story 1 is fully functional and independently testable. All 9 page files route errors to the toast container. `pnpm --filter ./apps/store-app test` passes. Manual smoke test: trigger an error in POS.tsx and confirm the toast appears.

---

## Phase 4: User Story 2 — Validation Catches Errors Before Data is Persisted (Priority: P2)

**Goal**: No invalid transaction, journal entry, or bill can reach IndexedDB. All pre-write rules live in one module (`businessValidationService`). The duplication of inline validation in `transactionService.ts` is eliminated.

**Independent Test**: Call `transactionService.createTransaction()` with `amount: 0`. Confirm the call returns an error without writing any record to IndexedDB (`getDB().transactions.count()` is unchanged). `businessValidationService.validateTransactionCreation` is the only place the "amount must be > 0" rule exists.

### Implementation for User Story 2

- [X] T021 [US2] Add `validateTransactionCreation(params: CreateTransactionParams): Promise<ValidationResult<CreateTransactionParams>>` to `apps/store-app/src/services/businessValidationService.ts` — implement all 9 transaction rules from `data-model.md §4.1`; consolidates the rules currently duplicated between `transactionService.ts`'s private `validateTransaction()` and `transactionValidationService.ts`
- [X] T022 [US2] Add `validateJournalEntryCreation(params: CreateJournalEntryParams): Promise<ValidationResult<CreateJournalEntryParams>>` to `apps/store-app/src/services/businessValidationService.ts` — implement all 4 journal rules from `data-model.md §4.2`
- [X] T023 [US2] Add `validateBillCreation(params: CreateBillParams): Promise<ValidationResult<CreateBillParams>>` to `apps/store-app/src/services/businessValidationService.ts` — implement all 3 bill rules from `data-model.md §4.3`
- [X] T024 [US2] Update `apps/store-app/src/services/transactionService.ts` — replace the private `validateTransaction()` method body with a call to `businessValidationService.validateTransactionCreation()`; replace bare `return { success: false, error: string }` patterns with `AppError` throws wrapped by `toAppError()`; keep `TransactionResult.error` populated for backward compat (copy `appError.message`)
- [X] T025 [P] [US2] Update `apps/store-app/src/services/journalService.ts` — replace `throw new Error('branchId is required...')` and amount-validation throws with typed `AppError` throws using `toAppError()` and the appropriate `AppErrorCode`; call `businessValidationService.validateJournalEntryCreation()` before any DB write
- [X] T026 [P] [US2] Update `apps/store-app/src/contexts/offlineData/operations/billOperations.ts` — add a call to `businessValidationService.validateBillCreation()` at the start of `createBill()`; surface any `ValidationResult.violations` as an `AppError` with category `'validation'` before any IndexedDB write
- [X] T027 [US2] Write Vitest unit tests in `apps/store-app/src/services/__tests__/businessValidationService.test.ts` — cover each of the 16 validation rules (one test per rule); one test for each `validateXxx` method with a valid payload (must pass); test `toAppError` with three input types (unknown, Error, AppError)

**Checkpoint**: User Story 2 is fully functional and independently testable. All 16 rules are covered by passing tests. `pnpm --filter ./apps/store-app test` passes.

---

## Phase 5: User Story 3 — Public Statement Access is Secured Server-Side (Priority: P3)

**Goal**: The `get_customer_by_token` Postgres RPC rejects expired tokens at the database level. No customer data is returned for an expired or absent token regardless of client-side behaviour.

**Independent Test**: Create a token row with `expires_at = NOW() - interval '1 day'`. Call `publicStatementService.getCustomerByToken(token)` and confirm it returns `null`. Verify the UI shows an expired-token notification (not a generic error). Confirm a token with `expires_at IS NULL` still resolves correctly.

### Implementation for User Story 3

- [X] T028 [US3] Create `apps/store-app/supabase/migrations/add_expires_at_to_public_access_tokens.sql` — add `expires_at timestamptz DEFAULT (NOW() + INTERVAL '30 days')` column to `public_access_tokens`; update `get_customer_by_token` RPC WHERE clause to add `AND (expires_at IS NULL OR expires_at > NOW())`; existing rows remain valid (NULL = no expiry)
- [X] T029 [US3] Update `apps/store-app/src/services/publicStatementService.ts` — when `getCustomerByToken` returns `null`, attempt a second lightweight query to distinguish "token never existed" (`STATEMENT_TOKEN_INVALID`) from "token expired" (`STATEMENT_TOKEN_EXPIRED`); return a typed `AppError` (or throw it) so the caller can display the correct user message; wrap the Supabase call error in `toAppError()` with `'STATEMENT_TOKEN_INVALID'` fallback
- [X] T030 [US3] Update `apps/store-app/src/pages/PublicCustomerStatement.tsx` — handle the `STATEMENT_TOKEN_EXPIRED` `AppError` code from T029 explicitly to show an "This statement link has expired" message (already uses `handleError` from T019; add a conditional render for the expired state separate from generic invalid-token state)

**Checkpoint**: User Story 3 is fully functional and independently testable. Apply the migration to a dev Supabase instance and confirm expired tokens are rejected server-side.

---

## Phase 6: Polish & Cross-Cutting Concerns

**Purpose**: Verify the complete implementation compiles, lints, and passes all tests; update the `IMPROVEMENTS_ENHANCEMENTS_REPORT.md` entry for §2.4.

- [X] T031 [P] Run full TypeScript type check: `pnpm --filter ./apps/store-app tsc --noEmit` — zero errors across all modified files
- [X] T032 [P] Run ESLint on all modified files: `pnpm --filter ./apps/store-app lint` — zero new lint errors; confirm no `console.error` calls remain in `pages/` (ESLint `no-console` rule can be tightened here)
- [X] T033 Run full Vitest suite: `pnpm --filter ./apps/store-app test` — all existing tests pass; new tests in T020 and T027 pass
- [X] T034 Run parity gate: `pnpm --filter ./apps/store-app run parity:gate` — green (confirms sync layer is unaffected)
- [X] T035 Manual smoke test per `specs/007-error-handling-validation/quickstart.md` Step 8 — (1) empty-amount transaction shows toast; (2) expired token shows expired message; (3) valid transaction shows no spurious toast
- [X] T036 [P] Update `IMPROVEMENTS_ENHANCEMENTS_REPORT.md §2.4` status from `Open` to `✅ Implemented` with implementation notes (AppError type, businessValidationService, useErrorHandler hook, expires_at migration)

---

## Dependencies & Execution Order

### Phase Dependencies

```
Phase 1 (Setup — T001–T003)
  └── Phase 2 (Foundational — T004–T005)
        ├── Phase 3 (US1 — T006–T020)       ← can start immediately after Phase 2
        ├── Phase 4 (US2 — T021–T027)        ← can start immediately after Phase 2
        └── Phase 5 (US3 — T028–T030)        ← can start immediately after Phase 2
              └── Phase 6 (Polish — T031–T036)
```

- **Phase 1**: No dependencies — start immediately
- **Phase 2**: Depends on Phase 1 (T004 imports from `types/errors.ts`)
- **Phase 3, 4, 5**: All depend on Phase 2 completion; can proceed in parallel
- **Phase 6**: Depends on all desired stories complete

### Within Phase 3 (US1)

```
T006 (Context)
  └── T007 (hook)
        ├── T008 (component) → T010 (Layout)
        ├── T009 (App.tsx provider)
        └── T011–T019 (pages, all parallel) → T020 (tests)
```

### Within Phase 4 (US2)

```
T021 (validateTransactionCreation)
T022 (validateJournalEntryCreation)   ← T021–T023 can be written in parallel
T023 (validateBillCreation)
  └── T024 (transactionService wire-up)
  └── T025 (journalService wire-up)   ← T024–T026 can be parallel once T021–T023 done
  └── T026 (billOperations wire-up)
        └── T027 (tests)
```

### User Story Independence

- **US1** uses only `types/errors.ts` and `toAppError` — no dependency on US2 or US3
- **US2** uses only `types/errors.ts` and `businessValidationService` validation methods — no dependency on US1 or US3
- **US3** uses only `types/errors.ts` and `toAppError` — no dependency on US1 or US2

---

## Parallel Opportunities

### Phase 1 (can all run in parallel)
```
T001  Create types/errors.ts
T002  Add en.ts error keys
T003  Add ar.ts + fr.ts error keys
```

### Phase 3, 4, 5 (after Phase 2 completes, all three can start in parallel)
```
Developer A → Phase 3 (US1): ErrorNotificationContext → hook → component → pages
Developer B → Phase 4 (US2): businessValidationService methods → service wire-ups
Developer C → Phase 5 (US3): SQL migration → publicStatementService → page update
```

### Within Phase 3 (once T007 is complete, pages T011–T019 all run in parallel)
```
T011 POS.tsx      T012 Accounting.tsx    T013 Home.tsx
T014 Inventory.tsx  T015 Settings.tsx    T016 Customers.tsx
T017 Employees.tsx  T018 UnsyncedItems.tsx  T019 PublicCustomerStatement.tsx
```

### Within Phase 4 (once T021–T023 are complete, wire-ups T024–T026 run in parallel)
```
T024 transactionService.ts    T025 journalService.ts    T026 billOperations.ts
```

---

## Implementation Strategy

### MVP First (User Story 1 Only)

1. Complete Phase 1 (Setup) — 3 tasks
2. Complete Phase 2 (Foundational) — 2 tasks
3. Complete Phase 3 (US1) — 15 tasks
4. **STOP and VALIDATE**: Submit an invalid transaction, confirm toast appears; `pnpm test` passes
5. Demo: cashiers now see actionable errors

### Incremental Delivery

1. Setup + Foundational → foundation ready (5 tasks)
2. US1 → toast notifications live → demo (15 tasks)
3. US2 → validation before writes → demo (7 tasks)
4. US3 → token expiry enforced → deploy (3 tasks)
5. Polish → clean CI (6 tasks)

### Parallel Team Strategy

| Developer | Phase | Tasks |
|-----------|-------|-------|
| A | Phase 1 + 2 | T001–T005 (unblocks everyone) |
| A | Phase 3 (US1) | T006–T020 |
| B | Phase 4 (US2) | T021–T027 |
| C | Phase 5 (US3) | T028–T030 |
| All | Phase 6 | T031–T036 |

---

## Task Summary

| Phase | Tasks | Notes |
|-------|-------|-------|
| Phase 1 — Setup | T001–T003 | 3 tasks; T002 and T003 parallel |
| Phase 2 — Foundational | T004–T005 | 2 tasks; sequential |
| Phase 3 — US1 (P1, MVP) | T006–T020 | 15 tasks; T011–T019 all parallel |
| Phase 4 — US2 (P2) | T021–T027 | 7 tasks; T021–T023 parallel; T024–T026 parallel |
| Phase 5 — US3 (P3) | T028–T030 | 3 tasks; sequential |
| Phase 6 — Polish | T031–T036 | 6 tasks; T031, T032, T036 parallel |
| **Total** | **T001–T036** | **36 tasks** |

---

## Notes

- Tasks marked `[P]` touch different files and have no incomplete dependencies in the same phase — safe to run concurrently
- Each user story phase ends with a checkpoint that can be demoed independently before the next story begins
- `console.error` calls in `services/` (not `pages/`) are intentionally left for a future cleanup pass — this feature targets the UI-facing call sites only
- The `transactionValidationService.ts` and `journalValidationService.ts` are NOT deleted — they serve post-hoc audit purposes; only the pre-write rules are consolidated into `businessValidationService`
- T028 (SQL migration) must be applied to the Supabase project before testing US3 locally; legacy tokens with `expires_at = NULL` continue to work unchanged
