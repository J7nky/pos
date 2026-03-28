/**
 * Unified error types for the store-app service layer.
 *
 * This module is a dependency-free leaf: it imports nothing and is safe
 * to import from any service, hook, or context without circular-dependency risk.
 *
 * Contract: contracts/error-handling-contract.md
 * Data model: data-model.md
 */

// ---------------------------------------------------------------------------
// ErrorCategory
// ---------------------------------------------------------------------------

/**
 * Three-tier error taxonomy.
 *
 * - 'validation'    : User-correctable input problem. Show inline or toast; let the user fix.
 * - 'system'        : Transient internal failure. Show toast with retry action.
 * - 'unrecoverable' : Data integrity breach. Show persistent banner; offer app reload.
 */
export type ErrorCategory = 'validation' | 'system' | 'unrecoverable';

// ---------------------------------------------------------------------------
// AppErrorCode
// ---------------------------------------------------------------------------

/**
 * Stable, machine-readable error identifiers.
 * SCREAMING_SNAKE_CASE: DOMAIN_SPECIFIC_REASON.
 *
 * Rules:
 *  - Existing codes are NEVER renamed (breaking change).
 *  - New codes may be added freely (non-breaking).
 *  - Compared via strict equality: error.code === 'TRANSACTION_AMOUNT_REQUIRED'
 */
export type AppErrorCode =
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

// ---------------------------------------------------------------------------
// AppError
// ---------------------------------------------------------------------------

/**
 * Structured application error.
 *
 * Guarantees:
 *  - code, messageKey, message, category are always present.
 *  - message is always a complete, non-technical sentence (English fallback).
 *  - details is NEVER shown in the UI — developer console only.
 *  - AppError is a plain object, NOT a subclass of Error.
 */
export interface AppError {
  /** Stable machine-readable identifier. */
  code: AppErrorCode;
  /**
   * i18n translation key, e.g. 'errors.transaction.amount_required'.
   * Resolved to the active language by useErrorHandler via getTranslatedString().
   */
  messageKey: string;
  /** Pre-resolved plain-language English fallback message. */
  message: string;
  /** Determines UI presentation style and retry affordance. */
  category: ErrorCategory;
  /** Developer-only context. Strip before any user-facing serialisation. */
  details?: unknown;
}

// ---------------------------------------------------------------------------
// ValidationResult
// ---------------------------------------------------------------------------

/** A single field-level rule violation returned by businessValidationService. */
export interface FieldViolation {
  /** Name of the field that failed validation. */
  field: string;
  /** The specific rule that was violated. */
  code: AppErrorCode;
  /** Human-readable description of the violation. */
  message: string;
}

/**
 * Result of a pre-write validation check.
 *
 * Guarantees:
 *  - When isValid is true,  violations is always [].
 *  - When isValid is false, violations has at least one entry.
 *  - sanitisedInput is only present when isValid is true.
 */
export interface ValidationResult<T = unknown> {
  isValid: boolean;
  violations: FieldViolation[];
  sanitisedInput?: T;
}

// ---------------------------------------------------------------------------
// ErrorNotification (used by ErrorNotificationContext)
// ---------------------------------------------------------------------------

export interface ErrorNotification {
  /** Unique per notification instance — used for dismissal. */
  id: string;
  error: AppError;
  timestamp: number;
  dismissed: boolean;
}
