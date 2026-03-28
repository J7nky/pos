# Error Handling & Validation — Public API Contract

**Feature**: `007-error-handling-validation`  
**Version**: 1.0.0  
**Status**: Proposed  
**Date**: 2026-03-27

---

## Purpose

This contract defines the stable public interfaces introduced by this feature. Any code that produces or consumes errors, validation results, or error notifications MUST conform to these interfaces. Breaking changes require a version bump here and a corresponding entry in the Complexity Tracking table of `plan.md`.

---

## 1. `types/errors.ts` — Core Error Types

This module is the leaf of the dependency graph. It has zero runtime imports. It is safe to import from anywhere in the store-app.

### 1.1 `ErrorCategory`

```typescript
type ErrorCategory = 'validation' | 'system' | 'unrecoverable';
```

| Value | When to use |
|-------|-------------|
| `'validation'` | Input does not satisfy a business rule. User can fix by correcting the input. |
| `'system'` | Transient internal failure (IndexedDB write, network timeout). User can retry. |
| `'unrecoverable'` | Data integrity breach or unexpected state that cannot be self-healed. Requires developer action or full app reload. |

### 1.2 `AppErrorCode`

```typescript
type AppErrorCode = 
  | 'TRANSACTION_AMOUNT_REQUIRED' | 'TRANSACTION_AMOUNT_NON_POSITIVE'
  | 'TRANSACTION_CURRENCY_INVALID' | 'TRANSACTION_CATEGORY_INVALID'
  | 'TRANSACTION_DESCRIPTION_REQUIRED' | 'TRANSACTION_STORE_ID_REQUIRED'
  | 'TRANSACTION_BRANCH_ID_REQUIRED' | 'TRANSACTION_ENTITY_NOT_FOUND'
  | 'TRANSACTION_CASH_DRAWER_MISSING'
  | 'JOURNAL_BRANCH_ID_REQUIRED' | 'JOURNAL_DEBIT_CREDIT_MISMATCH'
  | 'JOURNAL_AMOUNT_NON_POSITIVE' | 'JOURNAL_ACCOUNT_INVALID'
  | 'BILL_SUPPLIER_REQUIRED' | 'BILL_LINE_ITEMS_EMPTY' | 'BILL_AMOUNT_NON_POSITIVE'
  | 'STATEMENT_TOKEN_INVALID' | 'STATEMENT_TOKEN_EXPIRED'
  | 'LOCAL_WRITE_FAILED' | 'SYNC_UPLOAD_FAILED'
  | 'NETWORK_UNAVAILABLE' | 'UNKNOWN_ERROR';
```

**Stability rules:**
- Existing codes are **never renamed** (breaking change).
- New codes may be added at any time (non-breaking).
- Codes are checked via strict equality (`error.code === 'TRANSACTION_AMOUNT_REQUIRED'`) — no numeric comparisons.

### 1.3 `AppError`

```typescript
interface AppError {
  code: AppErrorCode;
  messageKey: string;   // i18n key, e.g. 'errors.transaction.amount_required'
  message: string;      // Pre-resolved plain-language fallback
  category: ErrorCategory;
  details?: unknown;    // Developer-only; MUST NOT be shown in UI
}
```

**Contract guarantees:**
- `code`, `messageKey`, `message`, and `category` are always present.
- `message` is always a complete, non-technical sentence in English (the i18n system resolves `messageKey` for other languages).
- `details` is stripped or masked before any user-facing serialisation.
- `AppError` is a plain object — it is NOT a subclass of `Error`.

### 1.4 `ValidationResult<T>`

```typescript
interface FieldViolation {
  field: string;
  code: AppErrorCode;
  message: string;
}

interface ValidationResult<T = unknown> {
  isValid: boolean;
  violations: FieldViolation[];
  sanitisedInput?: T;
}
```

**Contract guarantees:**
- When `isValid` is `true`, `violations` is always an empty array.
- When `isValid` is `false`, `violations` contains at least one entry.
- `sanitisedInput` is only present when `isValid` is `true` (never present on failure).

---

## 2. `services/businessValidationService.ts` — Validation Service Interface

Stateless service. All methods are pure (no side effects, no IndexedDB writes).

```typescript
interface BusinessValidationService {
  /**
   * Validate all inputs for a transaction before createTransaction() is called.
   * Replaces the duplicated inline validation in transactionService.ts.
   */
  validateTransactionCreation(
    params: CreateTransactionParams
  ): Promise<ValidationResult<CreateTransactionParams>>;

  /**
   * Validate all inputs for a journal entry before createJournalEntry() is called.
   */
  validateJournalEntryCreation(
    params: CreateJournalEntryParams
  ): Promise<ValidationResult<CreateJournalEntryParams>>;

  /**
   * Validate all inputs for a bill before createBill() is called.
   */
  validateBillCreation(
    params: CreateBillParams
  ): Promise<ValidationResult<CreateBillParams>>;

  /**
   * Convert any unknown thrown value into a typed AppError.
   * Use in catch blocks: catch (e) { throw toAppError(e); }
   */
  toAppError(
    thrown: unknown,
    fallbackCode?: AppErrorCode
  ): AppError;
}
```

**Behaviour rules:**
- `validateTransactionCreation` and `validateJournalEntryCreation` may read from IndexedDB (for entity/account existence checks) but MUST NOT write to it.
- `toAppError` NEVER throws. It always returns a valid `AppError`.
- If `thrown` is already an `AppError`, it is returned unchanged.
- If `thrown` is a standard `Error`, its `.message` populates `AppError.message`; its stack goes to `AppError.details`.
- If `thrown` is anything else, `AppError.code` is `'UNKNOWN_ERROR'` and `category` is `'system'`.

---

## 3. `hooks/useErrorHandler` — UI Notification Hook

```typescript
interface UseErrorHandlerReturn {
  /**
   * Present an error to the user via the centralized notification channel.
   * Accepts either a typed AppError or any unknown thrown value.
   * When given an unknown value, wraps it via businessValidationService.toAppError().
   */
  handleError: (error: AppError | unknown) => void;

  /**
   * Current list of undismissed notifications (read-only).
   * Primarily for use by ErrorToastContainer; pages should only call handleError.
   */
  notifications: ReadonlyArray<ErrorNotification>;

  /**
   * Dismiss a single notification by ID.
   */
  dismiss: (id: string) => void;

  /**
   * Dismiss all current notifications.
   */
  dismissAll: () => void;
}

function useErrorHandler(): UseErrorHandlerReturn;
```

**Usage contract:**

```typescript
// In a page component:
const { handleError } = useErrorHandler();

try {
  await processPayment(...);
} catch (error) {
  handleError(error);  // replaces console.error(error)
}
```

**Guarantee:** `handleError` never throws. If it receives an `AppError` with `category: 'unrecoverable'`, it still surfaces a notification — it does not crash the app.

---

## 4. `contexts/ErrorNotificationContext` — Provider Contract

```typescript
interface ErrorNotificationContextValue extends ErrorNotificationState {
  // ErrorNotificationState (push, dismiss, dismissAll, notifications)
  // No additional fields.
}

// The provider must be composed inside OfflineDataProvider and outside all pages.
// Recommended position in App.tsx provider tree:
// SupabaseAuthProvider
//   └── ErrorNotificationProvider   ← NEW: wraps the data provider
//       └── OfflineDataProvider
//           └── I18nProvider
//               └── ...
```

**Contract guarantees:**
- `ErrorNotificationProvider` is safe to render before data is loaded (it has no data dependencies).
- Notifications survive page navigation (they persist until explicitly dismissed or TTL expires).
- Maximum of 5 simultaneous notifications are shown; older ones are automatically dismissed when the limit is exceeded.

---

## 5. Supabase `get_customer_by_token` RPC — Updated Contract

**Previous contract:**  
Returns one row for any token that exists in `public_access_tokens`.

**New contract:**  
Returns one row only when:
1. Token exists in `public_access_tokens`, AND
2. `expires_at IS NULL` (legacy token, no expiry), OR `expires_at > NOW()`

**Zero-row response handling** (unchanged): `publicStatementService.getCustomerByToken()` returns `null` when zero rows are returned. The UI page then shows an "invalid token" message. The new `STATEMENT_TOKEN_EXPIRED` error code is returned via `AppError` when the service can determine the token existed but was expired (based on a separate check if needed).

**Backward compatibility:** All existing valid tokens (those with `expires_at IS NULL`) continue to work. New tokens created after migration have a default 30-day expiry.

---

## 6. i18n Key Namespace

All error message keys must use the `errors.` namespace:

```
errors.transaction.amount_required
errors.transaction.amount_non_positive
errors.transaction.currency_invalid
errors.transaction.category_invalid
errors.transaction.description_required
errors.transaction.store_id_required
errors.transaction.branch_id_required
errors.transaction.entity_not_found
errors.transaction.cash_drawer_missing
errors.journal.branch_id_required
errors.journal.debit_credit_mismatch
errors.journal.amount_non_positive
errors.journal.account_invalid
errors.bill.supplier_required
errors.bill.line_items_empty
errors.bill.amount_non_positive
errors.statement.token_invalid
errors.statement.token_expired
errors.system.local_write_failed
errors.system.sync_upload_failed
errors.system.network_unavailable
errors.system.unknown
```

All keys must be present in `en.ts`, `ar.ts`, and `fr.ts` before merge.

---

## 7. Breaking-Change Policy

| Change type | Allowed without version bump? |
|-------------|-------------------------------|
| Add new `AppErrorCode` | Yes |
| Add new optional field to `AppError` | Yes |
| Rename existing `AppErrorCode` | No |
| Remove field from `AppError` | No |
| Change `ErrorCategory` values | No |
| Change `ValidationResult` shape | No |
| Change `businessValidationService` method signature | No |
