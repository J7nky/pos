# Quickstart: Error Handling and Validation Best Practices

**Feature**: `007-error-handling-validation`  
**Branch**: `007-error-handling-validation`  
**Date**: 2026-03-27

---

## What This Feature Delivers

After this feature is fully implemented:

1. **Every service error carries a stable code** — `AppError` with `code`, `category`, `messageKey`, and `message`.
2. **One validation module governs critical writes** — `businessValidationService` is called by `transactionService`, `journalService`, and bill operations before any data is persisted.
3. **One UI channel surfaces errors** — `useErrorHandler()` replaces every `console.error()` in page files; `ErrorToastContainer` renders notifications.
4. **Public statements enforce token expiry** — the Supabase RPC rejects expired tokens at the DB level.

---

## Prerequisites

- Node.js ≥18, pnpm ≥8
- `pnpm install` run at repo root
- Active Supabase project with `public_access_tokens` table (existing)
- Supabase migration access to apply `add_expires_at_to_public_access_tokens.sql`

---

## Quickstart Checklist for Implementors

### Step 1 — Apply the database migration

```bash
# From repo root
supabase db push
# Or apply manually:
psql $DATABASE_URL -f supabase/migrations/add_expires_at_to_public_access_tokens.sql
```

Verify:
- `public_access_tokens` table has an `expires_at timestamptz` column
- `get_customer_by_token` RPC returns null for a token with `expires_at` in the past
- All existing tokens (with `expires_at = NULL`) still work

### Step 2 — Introduce `types/errors.ts`

Create `apps/store-app/src/types/errors.ts` with `AppErrorCode`, `ErrorCategory`, `AppError`, `FieldViolation`, `ValidationResult<T>`.

Verify with TypeScript compiler:
```bash
pnpm --filter ./apps/store-app tsc --noEmit
```
Expected: zero errors on the new file.

### Step 3 — Create `businessValidationService.ts`

Create `apps/store-app/src/services/businessValidationService.ts`.

Run existing tests to confirm no regressions:
```bash
pnpm --filter ./apps/store-app test
```

Add unit tests for:
- `validateTransactionCreation` with each invalid field
- `validateJournalEntryCreation` with mismatched debit/credit
- `validateBillCreation` with empty line items
- `toAppError` with unknown, `Error`, and existing `AppError` inputs

### Step 4 — Wire `businessValidationService` into critical services

Modify `transactionService.ts`:
- Replace internal `validateTransaction()` with a call to `businessValidationService.validateTransactionCreation()`
- Replace `return { success: false, error: string }` patterns with `AppError` throws (or keep the `TransactionResult` shape but populate `appError` alongside `error`)

Modify `journalService.ts`:
- Replace `throw new Error('branchId is required...')` with `throw toAppError(...)` using `JOURNAL_BRANCH_ID_REQUIRED`

Verify that `pnpm --filter ./apps/store-app test` still passes.

### Step 5 — Add i18n keys

Add error message keys to all three locale files (`en.ts`, `ar.ts`, `fr.ts`) under the `errors` namespace. English keys must be complete. Arabic and French translations may use English fallbacks initially with `// TODO: translate` comments.

### Step 6 — Create `ErrorNotificationContext` and `useErrorHandler`

Create:
- `apps/store-app/src/contexts/ErrorNotificationContext.tsx`
- `apps/store-app/src/hooks/useErrorHandler.ts`
- `apps/store-app/src/components/common/ErrorToastContainer.tsx`

Add `ErrorNotificationProvider` to the provider composition in `App.tsx` (above `OfflineDataProvider`).
Add `<ErrorToastContainer />` to `Layout.tsx` (alongside the existing `OfflineIndicator`).

### Step 7 — Update all page files

Replace `console.error(...)` calls in all 9 page files with `handleError(error)`:

```typescript
// Before
} catch (error) {
  console.error('Error checking cash drawer:', error);
}

// After
} catch (error) {
  handleError(error);
}
```

Files to update:
- `pages/POS.tsx`
- `pages/Accounting.tsx`
- `pages/Home.tsx`
- `pages/Inventory.tsx`
- `pages/Settings.tsx`
- `pages/Customers.tsx`
- `pages/Employees.tsx`
- `pages/UnsyncedItems.tsx`
- `pages/PublicCustomerStatement.tsx`

### Step 8 — Final verification

```bash
# TypeScript passes
pnpm --filter ./apps/store-app tsc --noEmit

# Lint passes
pnpm --filter ./apps/store-app lint

# All tests pass
pnpm --filter ./apps/store-app test

# Parity gate still green
pnpm --filter ./apps/store-app run parity:gate
```

Manual smoke test:
1. Open the store app, attempt to create a transaction with an empty amount field → verify a user-visible error message appears (not a browser console log)
2. Attempt to open a public statement URL with a token older than 30 days → verify an "expired" message appears
3. Submit a valid transaction → verify no spurious error notifications appear

---

## Release Triage

| Risk | Level | Mitigation |
|------|-------|-----------|
| `businessValidationService` rejects valid inputs (false positive) | Medium | Comprehensive unit tests before Step 4; canary deploy to test branch first |
| `get_customer_by_token` RPC rejects legacy tokens | Low | `expires_at IS NULL` check preserves all existing tokens |
| UI notification flood (too many toasts) | Low | Maximum 5 simultaneous notifications enforced by context (auto-dismiss oldest) |
| i18n keys missing for `ar`/`fr` | Low | English fallback used automatically; `// TODO: translate` markers for follow-up |

---

## Key Files Reference

| File | Purpose |
|------|---------|
| `src/types/errors.ts` | `AppError`, `AppErrorCode`, `ErrorCategory`, `ValidationResult<T>` |
| `src/services/businessValidationService.ts` | Pre-write validation rules for transactions, journals, bills |
| `src/hooks/useErrorHandler.ts` | UI hook for error notification |
| `src/contexts/ErrorNotificationContext.tsx` | React context for shared notification state |
| `src/components/common/ErrorToastContainer.tsx` | Renders active error notifications |
| `supabase/migrations/add_expires_at_to_public_access_tokens.sql` | Adds `expires_at` column + updates RPC |
| `src/i18n/locales/en.ts` | English error messages under `errors.*` |
| `src/i18n/locales/ar.ts` | Arabic error messages under `errors.*` |
| `src/i18n/locales/fr.ts` | French error messages under `errors.*` |

---

## Spec / Plan / Tasks Reference

- [spec.md](spec.md) — what and why
- [plan.md](plan.md) — technical context, constitution check, project structure
- [research.md](research.md) — decisions and rationale
- [data-model.md](data-model.md) — type definitions and schema change
- [contracts/error-handling-contract.md](contracts/error-handling-contract.md) — stable public API
- [tasks.md](tasks.md) — implementation tasks (generated by `/speckit.tasks`)
