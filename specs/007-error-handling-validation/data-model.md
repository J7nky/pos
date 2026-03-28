# Data Model: Error Handling and Validation Best Practices

**Feature**: `007-error-handling-validation`  
**Phase**: 1 — Design  
**Date**: 2026-03-27

---

## Overview

This feature introduces **TypeScript type definitions only** — no new IndexedDB tables, no new Supabase tables (except one column addition). The data model describes the shape of the new types and the schema change.

---

## 1. New TypeScript Types (`apps/store-app/src/types/errors.ts`)

### 1.1 `ErrorCategory`

```typescript
type ErrorCategory = 'validation' | 'system' | 'unrecoverable';
```

| Value | Meaning | UI behaviour |
|-------|---------|--------------|
| `'validation'` | User-correctable input problem (e.g. missing required field) | Show inline or toast; offer "fix" action |
| `'system'` | Transient failure the user can retry (e.g. local DB write failed) | Show toast with retry action |
| `'unrecoverable'` | Data integrity issue requiring developer attention | Show persistent banner; offer app reload |

---

### 1.2 `AppErrorCode`

String literal union of all stable error codes. Codes follow `DOMAIN_SPECIFIC_REASON` naming.

```typescript
type AppErrorCode =
  // Transaction validation
  | 'TRANSACTION_AMOUNT_REQUIRED'
  | 'TRANSACTION_AMOUNT_NON_POSITIVE'
  | 'TRANSACTION_CURRENCY_INVALID'
  | 'TRANSACTION_CATEGORY_INVALID'
  | 'TRANSACTION_DESCRIPTION_REQUIRED'
  | 'TRANSACTION_STORE_ID_REQUIRED'
  | 'TRANSACTION_BRANCH_ID_REQUIRED'
  | 'TRANSACTION_ENTITY_NOT_FOUND'
  | 'TRANSACTION_CASH_DRAWER_MISSING'
  // Journal entry validation
  | 'JOURNAL_BRANCH_ID_REQUIRED'
  | 'JOURNAL_DEBIT_CREDIT_MISMATCH'
  | 'JOURNAL_AMOUNT_NON_POSITIVE'
  | 'JOURNAL_ACCOUNT_INVALID'
  // Bill validation
  | 'BILL_SUPPLIER_REQUIRED'
  | 'BILL_LINE_ITEMS_EMPTY'
  | 'BILL_AMOUNT_NON_POSITIVE'
  // Public statement
  | 'STATEMENT_TOKEN_INVALID'
  | 'STATEMENT_TOKEN_EXPIRED'
  // System / generic
  | 'LOCAL_WRITE_FAILED'
  | 'SYNC_UPLOAD_FAILED'
  | 'NETWORK_UNAVAILABLE'
  | 'UNKNOWN_ERROR';
```

**Design rules:**
- Codes are `readonly` string constants — never computed at runtime.
- Every code maps to exactly one `ErrorCategory` (see `businessValidationService.ts` constant map).
- New codes can be added; existing codes are never renamed (breaking change).

---

### 1.3 `AppError`

```typescript
interface AppError {
  /**
   * Stable machine-readable identifier. Never changes once introduced.
   * Used by callers for programmatic handling and by logging pipelines.
   */
  code: AppErrorCode;

  /**
   * i18n translation key for the user-facing message.
   * Resolved to the active language by useErrorHandler via getTranslatedString().
   * Example: 'errors.transaction.amount_required'
   */
  messageKey: string;

  /**
   * Pre-resolved human-readable message (fallback if i18n is unavailable).
   * MUST be plain language. MUST NOT contain stack traces, IDs, or technical terms.
   */
  message: string;

  /**
   * Classification used by the UI to decide presentation style and retry logic.
   */
  category: ErrorCategory;

  /**
   * Optional developer-facing detail. NEVER shown in the UI.
   * Logged to the developer console only.
   * May contain the original Error object, a stack trace, or raw DB error.
   */
  details?: unknown;
}
```

**Key invariants:**
- `AppError` is NOT a subclass of `Error`. It is a plain data object.
- `details` is never serialised into user-visible output.
- `messageKey` and `message` are always present (even for system errors, a generic key is used).

---

### 1.4 `ValidationResult<T>`

```typescript
interface FieldViolation {
  field: string;          // Name of the invalid field (e.g. 'amount', 'currency')
  code: AppErrorCode;     // Error code for this specific violation
  message: string;        // Human-readable description of the violation
}

interface ValidationResult<T = unknown> {
  isValid: boolean;
  violations: FieldViolation[];    // Empty when isValid = true
  sanitisedInput?: T;              // Cleaned/coerced input when isValid = true
}
```

**Distinction from existing `TransactionValidationResult` / `ValidationResult` in services:**

| Existing type | Location | Purpose after this feature |
|---------------|----------|---------------------------|
| `TransactionValidationResult` | `transactionValidationService.ts` | Retained for audit/immutability checks (post-hoc) |
| `ValidationResult` (journal) | `journalValidationService.ts` | Retained for store-wide ledger balance audits (post-hoc) |
| `ValidationResult<T>` (new) | `types/errors.ts` | Pre-write guard in `businessValidationService.ts` |

---

### 1.5 `ErrorNotificationState`

Internal state managed by `ErrorNotificationContext`:

```typescript
interface ErrorNotification {
  id: string;           // unique per notification instance (for dismissal)
  error: AppError;
  timestamp: number;
  dismissed: boolean;
}

interface ErrorNotificationState {
  notifications: ErrorNotification[];
  push: (error: AppError | unknown) => void;
  dismiss: (id: string) => void;
  dismissAll: () => void;
}
```

---

## 2. Supabase Schema Change

### 2.1 `public_access_tokens` — Add `expires_at`

**Table**: `public_access_tokens` (existing, Supabase-only — not synced to IndexedDB)

| Column | Type | Nullable | Default | Notes |
|--------|------|----------|---------|-------|
| `expires_at` | `timestamptz` | YES | `(now() + interval '30 days')` | NULL = no expiry (legacy rows remain valid until explicitly migrated) |

**Migration strategy**: All existing rows will have `expires_at = NULL`. The RPC `get_customer_by_token` will treat `NULL expires_at` as non-expired (backward-compatible). New tokens created after migration will have a default 30-day expiry.

### 2.2 Updated RPC `get_customer_by_token`

The existing RPC logic gains one additional WHERE clause condition:

```sql
-- Added to WHERE in get_customer_by_token:
AND (expires_at IS NULL OR expires_at > NOW())
```

When this condition fails, the RPC returns zero rows. `publicStatementService.ts` already handles zero-rows as "invalid token" — no service layer change needed. The UI (`PublicCustomerStatement.tsx`) will receive `null` from `getCustomerByToken()` and show the existing "invalid token" message path, which is extended to distinguish "expired" from "not found" using the new `AppError` with code `STATEMENT_TOKEN_EXPIRED`.

---

## 3. Type Dependency Graph

```
types/errors.ts
├── AppErrorCode (string literal union — no imports)
├── ErrorCategory (string literal union — no imports)
├── AppError (references AppErrorCode, ErrorCategory)
├── FieldViolation (references AppErrorCode)
└── ValidationResult<T> (references FieldViolation)

services/businessValidationService.ts
├── imports: types/errors.ts (AppError, ValidationResult, AppErrorCode)
├── imports: types/index.ts (Transaction, Bill)
├── imports: types/accounting.ts (CreateJournalEntryParams)
└── imports: lib/db.ts (getDB) — for entity existence checks only

hooks/useErrorHandler.ts
├── imports: contexts/ErrorNotificationContext.tsx
└── imports: utils/multilingual.ts (getTranslatedString)

contexts/ErrorNotificationContext.tsx
├── imports: types/errors.ts (AppError, ErrorNotification, ErrorNotificationState)
└── imports: React

components/common/ErrorToastContainer.tsx
├── imports: hooks/useErrorHandler.ts
└── imports: i18n hook (useTranslation / getTranslatedString)
```

**No circular dependencies**: `types/errors.ts` has zero imports; it is the leaf node.

---

## 4. Validation Rules Inventory

The following rules are consolidated into `businessValidationService.ts`. Each rule maps to one `AppErrorCode`.

### 4.1 Transaction creation (`validateTransactionCreation`)

| Rule | Code | Category |
|------|------|----------|
| `amount` must be present | `TRANSACTION_AMOUNT_REQUIRED` | validation |
| `amount` must be > 0 | `TRANSACTION_AMOUNT_NON_POSITIVE` | validation |
| `currency` must be `'USD'` or `'LBP'` | `TRANSACTION_CURRENCY_INVALID` | validation |
| `category` must be a known `TRANSACTION_CATEGORIES` key | `TRANSACTION_CATEGORY_INVALID` | validation |
| `description` must be present and non-empty | `TRANSACTION_DESCRIPTION_REQUIRED` | validation |
| `context.storeId` must be present | `TRANSACTION_STORE_ID_REQUIRED` | validation |
| `context.branchId` must be present | `TRANSACTION_BRANCH_ID_REQUIRED` | validation |
| Referenced entity (customer/supplier) must exist in IndexedDB | `TRANSACTION_ENTITY_NOT_FOUND` | validation |
| Cash drawer account must exist for cash-category transactions | `TRANSACTION_CASH_DRAWER_MISSING` | validation |

### 4.2 Journal entry creation (`validateJournalEntryCreation`)

| Rule | Code | Category |
|------|------|----------|
| `branchId` must be present | `JOURNAL_BRANCH_ID_REQUIRED` | validation |
| `amountUSD + amountLBP` must be > 0 | `JOURNAL_AMOUNT_NON_POSITIVE` | validation |
| `debitAccount` and `creditAccount` must be recognised account codes | `JOURNAL_ACCOUNT_INVALID` | validation |
| Debit and credit amounts must be equal (per currency) | `JOURNAL_DEBIT_CREDIT_MISMATCH` | validation |

### 4.3 Bill creation (`validateBillCreation`)

| Rule | Code | Category |
|------|------|----------|
| `supplier_id` must be present for supplier bills | `BILL_SUPPLIER_REQUIRED` | validation |
| `line_items` array must contain at least one item | `BILL_LINE_ITEMS_EMPTY` | validation |
| Each line item `amount` must be > 0 | `BILL_AMOUNT_NON_POSITIVE` | validation |
