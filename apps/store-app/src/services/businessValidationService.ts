/**
 * Business Validation Service
 *
 * Single authoritative module for pre-write validation rules on critical
 * business operations (transactions, journal entries, bills).
 *
 * Contract: specs/007-error-handling-validation/contracts/error-handling-contract.md §2
 */

import type { AppError, AppErrorCode, ErrorCategory, FieldViolation, ValidationResult } from '../types/errors';
import type { CreateTransactionParams } from './transactionService';
import type { CreateJournalEntryParams } from '../types/accounting';
import { TRANSACTION_CATEGORIES } from '../constants/transactionCategories';
import { getDB } from '../lib/db';

// ---------------------------------------------------------------------------
// Category lookup map
// Every AppErrorCode maps to exactly one ErrorCategory.
// ---------------------------------------------------------------------------

const ERROR_CATEGORIES: Record<AppErrorCode, ErrorCategory> = {
  TRANSACTION_AMOUNT_REQUIRED: 'validation',
  TRANSACTION_AMOUNT_NON_POSITIVE: 'validation',
  TRANSACTION_CURRENCY_INVALID: 'validation',
  TRANSACTION_CATEGORY_INVALID: 'validation',
  TRANSACTION_DESCRIPTION_REQUIRED: 'validation',
  TRANSACTION_STORE_ID_REQUIRED: 'validation',
  TRANSACTION_BRANCH_ID_REQUIRED: 'validation',
  TRANSACTION_ENTITY_NOT_FOUND: 'validation',
  TRANSACTION_CASH_DRAWER_MISSING: 'validation',
  JOURNAL_BRANCH_ID_REQUIRED: 'validation',
  JOURNAL_DEBIT_CREDIT_MISMATCH: 'validation',
  JOURNAL_AMOUNT_NON_POSITIVE: 'validation',
  JOURNAL_ACCOUNT_INVALID: 'validation',
  BILL_SUPPLIER_REQUIRED: 'validation',
  BILL_LINE_ITEMS_EMPTY: 'validation',
  BILL_AMOUNT_NON_POSITIVE: 'validation',
  STATEMENT_TOKEN_INVALID: 'validation',
  STATEMENT_TOKEN_EXPIRED: 'validation',
  LOCAL_WRITE_FAILED: 'system',
  SYNC_UPLOAD_FAILED: 'system',
  NETWORK_UNAVAILABLE: 'system',
  UNKNOWN_ERROR: 'system',
};

// i18n key prefix map — mirrors the errors.* namespace in the locale files
const MESSAGE_KEYS: Record<AppErrorCode, string> = {
  TRANSACTION_AMOUNT_REQUIRED: 'errors.transaction.amount_required',
  TRANSACTION_AMOUNT_NON_POSITIVE: 'errors.transaction.amount_non_positive',
  TRANSACTION_CURRENCY_INVALID: 'errors.transaction.currency_invalid',
  TRANSACTION_CATEGORY_INVALID: 'errors.transaction.category_invalid',
  TRANSACTION_DESCRIPTION_REQUIRED: 'errors.transaction.description_required',
  TRANSACTION_STORE_ID_REQUIRED: 'errors.transaction.store_id_required',
  TRANSACTION_BRANCH_ID_REQUIRED: 'errors.transaction.branch_id_required',
  TRANSACTION_ENTITY_NOT_FOUND: 'errors.transaction.entity_not_found',
  TRANSACTION_CASH_DRAWER_MISSING: 'errors.transaction.cash_drawer_missing',
  JOURNAL_BRANCH_ID_REQUIRED: 'errors.journal.branch_id_required',
  JOURNAL_DEBIT_CREDIT_MISMATCH: 'errors.journal.debit_credit_mismatch',
  JOURNAL_AMOUNT_NON_POSITIVE: 'errors.journal.amount_non_positive',
  JOURNAL_ACCOUNT_INVALID: 'errors.journal.account_invalid',
  BILL_SUPPLIER_REQUIRED: 'errors.bill.supplier_required',
  BILL_LINE_ITEMS_EMPTY: 'errors.bill.line_items_empty',
  BILL_AMOUNT_NON_POSITIVE: 'errors.bill.amount_non_positive',
  STATEMENT_TOKEN_INVALID: 'errors.statement.token_invalid',
  STATEMENT_TOKEN_EXPIRED: 'errors.statement.token_expired',
  LOCAL_WRITE_FAILED: 'errors.system.local_write_failed',
  SYNC_UPLOAD_FAILED: 'errors.system.sync_upload_failed',
  NETWORK_UNAVAILABLE: 'errors.system.network_unavailable',
  UNKNOWN_ERROR: 'errors.system.unknown',
};

// English fallback messages (used when i18n is unavailable)
const FALLBACK_MESSAGES: Record<AppErrorCode, string> = {
  TRANSACTION_AMOUNT_REQUIRED: 'Amount is required.',
  TRANSACTION_AMOUNT_NON_POSITIVE: 'Amount must be greater than zero.',
  TRANSACTION_CURRENCY_INVALID: 'Currency must be USD or LBP.',
  TRANSACTION_CATEGORY_INVALID: 'Transaction category is not valid.',
  TRANSACTION_DESCRIPTION_REQUIRED: 'Description is required.',
  TRANSACTION_STORE_ID_REQUIRED: 'Store information is missing. Please reload the app.',
  TRANSACTION_BRANCH_ID_REQUIRED: 'Branch information is missing. Please reload the app.',
  TRANSACTION_ENTITY_NOT_FOUND: 'The selected customer or supplier could not be found.',
  TRANSACTION_CASH_DRAWER_MISSING: 'No cash drawer account found. Please set one up before processing this transaction.',
  JOURNAL_BRANCH_ID_REQUIRED: 'Branch information is missing from this journal entry.',
  JOURNAL_DEBIT_CREDIT_MISMATCH: 'Journal entry debits and credits must be equal.',
  JOURNAL_AMOUNT_NON_POSITIVE: 'Journal entry amount must be greater than zero.',
  JOURNAL_ACCOUNT_INVALID: 'One or more account codes in this journal entry are not recognised.',
  BILL_SUPPLIER_REQUIRED: 'A supplier must be selected before saving this bill.',
  BILL_LINE_ITEMS_EMPTY: 'This bill must have at least one line item.',
  BILL_AMOUNT_NON_POSITIVE: 'Bill line item amounts must be greater than zero.',
  STATEMENT_TOKEN_INVALID: 'This statement link is invalid or has already been used.',
  STATEMENT_TOKEN_EXPIRED: 'This statement link has expired. Please request a new one.',
  LOCAL_WRITE_FAILED: 'Could not save your changes. Please try again.',
  SYNC_UPLOAD_FAILED: 'Could not sync your changes. They will be retried automatically.',
  NETWORK_UNAVAILABLE: 'You appear to be offline. This action requires a connection.',
  UNKNOWN_ERROR: 'Something went wrong. Please try again or reload the app.',
};

// ---------------------------------------------------------------------------
// makeAppError — internal factory
// ---------------------------------------------------------------------------

export function makeAppError(code: AppErrorCode, details?: unknown): AppError {
  return {
    code,
    messageKey: MESSAGE_KEYS[code],
    message: FALLBACK_MESSAGES[code],
    category: ERROR_CATEGORIES[code],
    details,
  };
}

// ---------------------------------------------------------------------------
// Internal helper for building violations
// ---------------------------------------------------------------------------

function violation(field: string, code: AppErrorCode): FieldViolation {
  return { field, code, message: FALLBACK_MESSAGES[code] };
}

// ---------------------------------------------------------------------------
// validateTransactionCreation (T021)
// ---------------------------------------------------------------------------

/**
 * Validate all inputs for a transaction before createTransaction() is called.
 * Consolidates the rules previously duplicated between transactionService's
 * private validateTransaction() and transactionValidationService.ts.
 */
export async function validateTransactionCreation(
  params: CreateTransactionParams,
): Promise<ValidationResult<CreateTransactionParams>> {
  const violations: FieldViolation[] = [];

  if (params.amount === undefined || params.amount === null) {
    violations.push(violation('amount', 'TRANSACTION_AMOUNT_REQUIRED'));
  } else if (params.amount <= 0) {
    violations.push(violation('amount', 'TRANSACTION_AMOUNT_NON_POSITIVE'));
  }

  if (!params.currency || !['USD', 'LBP'].includes(params.currency)) {
    violations.push(violation('currency', 'TRANSACTION_CURRENCY_INVALID'));
  }

  const validCategoryValues = new Set(Object.values(TRANSACTION_CATEGORIES));
  if (!params.category || !validCategoryValues.has(params.category as string)) {
    violations.push(violation('category', 'TRANSACTION_CATEGORY_INVALID'));
  }

  const descText = typeof params.description === 'string'
    ? params.description
    : (params.description as { en?: string })?.en ?? '';
  if (!descText.trim()) {
    violations.push(violation('description', 'TRANSACTION_DESCRIPTION_REQUIRED'));
  }

  if (!params.context?.storeId) {
    violations.push(violation('context.storeId', 'TRANSACTION_STORE_ID_REQUIRED'));
  }

  if (!params.context?.branchId) {
    violations.push(violation('context.branchId', 'TRANSACTION_BRANCH_ID_REQUIRED'));
  }

  // Entity existence check (only if entity is specified and no prior violations)
  if (params.entityId && violations.length === 0) {
    try {
      const entity = await getDB().entities.get(params.entityId);
      if (!entity) {
        violations.push(violation('entityId', 'TRANSACTION_ENTITY_NOT_FOUND'));
      }
    } catch {
      // DB unavailable — skip this check rather than blocking the operation
    }
  }

  if (violations.length > 0) {
    return { isValid: false, violations };
  }
  return { isValid: true, violations: [], sanitisedInput: params };
}

// ---------------------------------------------------------------------------
// validateJournalEntryCreation (T022)
// ---------------------------------------------------------------------------

/**
 * Validate all inputs for a journal entry before createJournalEntry() is called.
 */
export async function validateJournalEntryCreation(
  params: CreateJournalEntryParams,
): Promise<ValidationResult<CreateJournalEntryParams>> {
  const violations: FieldViolation[] = [];

  if (!params.branchId) {
    violations.push(violation('branchId', 'JOURNAL_BRANCH_ID_REQUIRED'));
  }

  // Must match journalService.createJournalEntry: legacy amount + currency fills one side only
  let amountUSD = params.amountUSD ?? 0;
  let amountLBP = params.amountLBP ?? 0;
  if (params.amount !== undefined && params.currency) {
    if (params.currency === 'USD') {
      amountUSD = params.amount;
      amountLBP = 0;
    } else {
      amountUSD = 0;
      amountLBP = params.amount;
    }
  }

  if (amountUSD <= 0 && amountLBP <= 0) {
    violations.push(violation('amountUSD', 'JOURNAL_AMOUNT_NON_POSITIVE'));
  }

  if (!params.debitAccount || !params.creditAccount) {
    violations.push(violation('debitAccount', 'JOURNAL_ACCOUNT_INVALID'));
  }

  if (violations.length > 0) {
    return { isValid: false, violations };
  }
  return { isValid: true, violations: [], sanitisedInput: params };
}

// ---------------------------------------------------------------------------
// validateBillCreation (T023)
// ---------------------------------------------------------------------------

export interface BillCreationInput {
  /** Set to true for supplier (purchase) bills that require a supplier entity. */
  requiresSupplier?: boolean;
  /** Supplier entity ID — required when requiresSupplier is true. */
  supplierId?: string | null;
  lineItems: Array<{ total_price?: number; line_total?: number; unit_price?: number; [key: string]: unknown }>;
}

/**
 * Validate all inputs for a bill before createBill() is called.
 */
export async function validateBillCreation(
  input: BillCreationInput,
): Promise<ValidationResult<BillCreationInput>> {
  const violations: FieldViolation[] = [];

  if (input.requiresSupplier && !input.supplierId) {
    violations.push(violation('supplierId', 'BILL_SUPPLIER_REQUIRED'));
  }

  if (!input.lineItems || input.lineItems.length === 0) {
    violations.push(violation('lineItems', 'BILL_LINE_ITEMS_EMPTY'));
  } else {
    const hasNonPositive = input.lineItems.some(item => {
      const amount = item.total_price ?? item.line_total ?? item.unit_price ?? 0;
      return (amount as number) <= 0;
    });
    if (hasNonPositive) {
      violations.push(violation('lineItems', 'BILL_AMOUNT_NON_POSITIVE'));
    }
  }

  if (violations.length > 0) {
    return { isValid: false, violations };
  }
  return { isValid: true, violations: [], sanitisedInput: input };
}

// ---------------------------------------------------------------------------
// toAppError — public utility (used by all three user stories)
// ---------------------------------------------------------------------------

/**
 * Convert any thrown value into a typed AppError.
 *
 * - If `thrown` is already an AppError (has a stable `code` field), return it unchanged.
 * - If `thrown` is a standard Error, populate message from .message and put the
 *   original Error in details (for developer console logging only).
 * - For anything else, use UNKNOWN_ERROR.
 *
 * This function NEVER throws.
 */
export function toAppError(
  thrown: unknown,
  fallbackCode: AppErrorCode = 'UNKNOWN_ERROR',
): AppError {
  // Already an AppError
  if (
    thrown !== null &&
    typeof thrown === 'object' &&
    'code' in thrown &&
    'category' in thrown &&
    'messageKey' in thrown
  ) {
    return thrown as AppError;
  }

  // Standard Error object
  if (thrown instanceof Error) {
    return {
      code: fallbackCode,
      messageKey: MESSAGE_KEYS[fallbackCode],
      message: thrown.message || FALLBACK_MESSAGES[fallbackCode],
      category: ERROR_CATEGORIES[fallbackCode],
      details: thrown,
    };
  }

  // String thrown (legacy pattern)
  if (typeof thrown === 'string') {
    return {
      code: fallbackCode,
      messageKey: MESSAGE_KEYS[fallbackCode],
      message: thrown || FALLBACK_MESSAGES[fallbackCode],
      category: ERROR_CATEGORIES[fallbackCode],
      details: thrown,
    };
  }

  // Unknown value
  return {
    code: fallbackCode,
    messageKey: MESSAGE_KEYS[fallbackCode],
    message: FALLBACK_MESSAGES[fallbackCode],
    category: ERROR_CATEGORIES[fallbackCode],
    details: thrown,
  };
}
