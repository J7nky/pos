# Research: Error Handling and Validation Best Practices

**Feature**: `007-error-handling-validation`  
**Phase**: 0 — Pre-design research  
**Date**: 2026-03-27

---

## 1. Current State Audit

### 1.1 Error Type Fragmentation

A static analysis of `apps/store-app/src/services/` reveals **4 distinct, incompatible error-response shapes** used across the 40+ service files:

| Pattern | Used by | Problem |
|---------|---------|---------|
| `{ success: false, error: string }` | `transactionService.ts` (12+ sites), `cashDrawerUpdateService.ts` | Error is a free-form string — no stable code for programmatic handling |
| `throw new Error('message')` | `journalService.ts`, `crudHelperService.ts`, `syncService.ts`, 35+ others | Callers must catch and inspect `.message` — no error category, no code |
| `{ isValid: boolean, errors: string[] }` | `transactionValidationService.ts`, `journalValidationService.ts` | Separate validation path, inconsistent with service error path |
| `console.error(...)` + silent return | POS.tsx, Accounting.tsx, Settings.tsx, and most other pages | Errors never reach the user — swallowed silently into the browser console |

**Key finding:** `AppError` does not exist anywhere in the codebase. `syncUpload.ts` line 659 references `error.code` — that is Supabase's own PostgreSQL error code, not an application-level error code.

### 1.2 Existing Validation Services

Two partial validation services already exist:

| Service | File | Scope | Weakness |
|---------|------|-------|---------|
| `TransactionValidationService` | `services/transactionValidationService.ts` | Validates `Transaction` shape before `createTransaction()` | Returns `string[]` errors — not linked to the service error shape |
| `JournalValidationService` | `services/journalValidationService.ts` | Validates debit=credit balance and entry integrity | Only called for post-hoc audits, not pre-write validation |

**Key finding:** `transactionService.ts` has its own internal `validateTransaction()` private method that **duplicates** some of the rules in `transactionValidationService.ts`. This is the duplication the spec's FR-004 targets.

### 1.3 UI Error Presentation Inventory

Audit of `pages/` and `components/`:

- `UndoToastManager.tsx` — exists as a toast component for undo actions; uses an inline state pattern scoped to the undo feature. **Can be the model for a generalised notification service.**
- `OfflineIndicator.tsx` — inline toast-style component already imported by Layout.tsx. Shows connectivity status.
- All 9 page files (`POS.tsx`, `Accounting.tsx`, etc.) catch errors in `try/catch` and call `console.error()`. Zero of them show a user-visible notification on most error paths.
- `alert()` is not used. Native browser dialogs are absent.

**Key finding:** No global notification channel exists. Each page handles errors independently (and almost always silently).

### 1.4 Public Statement Security Audit

- `publicStatementService.ts` calls Supabase RPC `get_customer_by_token` — token validation is therefore **server-side** (inside a Postgres function), which is correct.
- However, `public_access_tokens` table has no `expires_at` column per the constitution note (§8.O): *"URL token with unlimited lifetime and no rate limiting."*
- The `PublicCustomerStatement.tsx` page previously imported `supabase` directly (fixed in §1.1 of the improvements report). It now imports only `publicStatementService` — the isolation is correct.
- **Remaining gap:** The RPC `get_customer_by_token` returns data for any token that exists, regardless of age. No expiry is enforced at the DB level.

---

## 2. Decision Log

### Decision 1: AppError as a new shared type

**Decision**: Introduce `AppError` as a new TypeScript interface in `apps/store-app/src/types/errors.ts`.  
**Rationale**: The type must be importable by all services without creating circular dependencies. Placing it in `types/` (alongside `database.ts`, `index.ts`, `accounting.ts`) follows the existing pattern for shared type definitions in the store-app. It does not belong in `@pos-platform/shared` because it is store-app-specific (admin-app has no service error layer).  
**Alternatives considered**:
- Adding to `types/index.ts` directly — rejected: `index.ts` is already large and mixes domain types; a dedicated `errors.ts` is cleaner.
- Adding to `@pos-platform/shared` — rejected: admin-app has no service layer and would not use it; adding store-app-specific types to shared contradicts the constitution §8.H principle.

### Decision 2: Centralised validation module strategy

**Decision**: Create `services/businessValidationService.ts` as the single authoritative module for critical-path validation rules. The existing `transactionValidationService.ts` and `journalValidationService.ts` remain as **audit/integrity services** (post-hoc) while `businessValidationService.ts` owns **pre-write guards**.  
**Rationale**: Deleting the existing validation services would break callers (e.g. `DevAccountingTestPanel`). Replacing them wholesale risks regressions. The cleaner path is to extract only the pre-write rules into `businessValidationService.ts`, have `transactionService.ts` and `journalService.ts` call it, and leave audit services for their current purpose.  
**Alternatives considered**:
- Merging all validation into `transactionValidationService.ts` — rejected: that service validates `Transaction` shapes only; journal rules have a different domain.
- Adding validation inline to each service (status quo) — rejected: this is exactly the duplication FR-004 prohibits.

### Decision 3: UI notification channel

**Decision**: Introduce a `useErrorHandler` hook in `hooks/useErrorHandler.ts` that provides a `handleError(error: AppError | unknown) => void` function. The hook manages toast-style notification state via React context or a simple shared state. UI components call `const { handleError } = useErrorHandler()` in their catch blocks.  
**Rationale**: A hook is the idiomatic pattern for this codebase (see `useOfflineData`, `useCurrency`, `useSupabaseAuth`). It keeps the notification channel inside the React tree and accessible from pages and components without prop drilling. The existing `UndoToastManager` pattern (component reads from hook state, renders notifications) is reused.  
**Alternatives considered**:
- Global event emitter / pub-sub — rejected: bypasses React's render lifecycle; harder to test; not idiomatic.
- Error boundary only — rejected: React error boundaries catch rendering errors, not async operation errors. Both are needed, not either/or.
- Third-party toast library (e.g. `react-hot-toast`) — rejected: adds a dependency; the existing inline toast pattern is sufficient.

### Decision 4: Public statement token expiry

**Decision**: Add an `expires_at` column to the `public_access_tokens` table via a new SQL migration. Update the `get_customer_by_token` Postgres RPC to reject expired tokens. No change to `publicStatementService.ts` is needed beyond handling the new null-return case.  
**Rationale**: Token expiry is a server-side concern. The RPC already centralises token validation. Adding `expires_at` to the table and updating the WHERE clause in the RPC enforces expiry without any client-side logic.  
**Alternatives considered**:
- Client-side expiry check in `publicStatementService.ts` — rejected: this is exactly the "client-only filtering" anti-pattern that spec FR-005 prohibits.
- Signed JWT tokens with expiry embedded — rejected: would require a new key management system; over-engineered for a simple public statement feature.

### Decision 5: No new Dexie schema version required

**Decision**: This feature does not require an IndexedDB schema version bump.  
**Rationale**: `public_access_tokens` is a Supabase-only table (not synced to IndexedDB). `AppError`, `ValidationResult`, and `ErrorCategory` are TypeScript types — they have no persistence layer. `businessValidationService.ts` is a stateless service module.  
**Impact on CG-09**: The SQL migration for `expires_at` must still be committed to `supabase/migrations/`. No `lib/db.ts` version bump is needed.

---

## 3. Best Practices Applied

### Error taxonomy (industry standard)
Three-category error taxonomy aligns with RFC 7807 (Problem Details for HTTP APIs) and is the idiomatic TypeScript approach:
- `validation` — bad input; user can fix immediately
- `system` — transient failure; user can retry
- `unrecoverable` — data integrity issue; requires developer attention / app reload

### Validation placement
Pre-write validation at the **service boundary** (not in UI components) is the industry-standard approach for offline-first apps: it ensures the rule is enforced regardless of which UI surface triggers the operation, and it keeps business rules testable without rendering.

### Error codes as stable string constants
Using `SCREAMING_SNAKE_CASE` string constants (e.g. `'JOURNAL_DEBIT_CREDIT_MISMATCH'`) rather than numeric codes makes error logs self-documenting, avoids code-collision maintenance, and allows pattern-matching in logging pipelines without a lookup table.

---

## 4. Resolved Clarifications

All spec requirements were unambiguous. No `[NEEDS CLARIFICATION]` markers were present. This section is intentionally empty.
