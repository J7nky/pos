/**
 * Unit tests for useErrorHandler hook and supporting utilities.
 *
 * Tests cover:
 *  - toAppError with typed AppError input (passthrough)
 *  - toAppError with standard Error input
 *  - toAppError with unknown/string input
 *  - ERROR_CATEGORIES map completeness
 *  - makeAppError factory
 */

import { describe, it, expect } from 'vitest';
import { toAppError, makeAppError } from '../../services/businessValidationService';
import type { AppError } from '../../types/errors';

describe('toAppError', () => {
  it('returns an AppError unchanged when passed a typed AppError', () => {
    const original: AppError = {
      code: 'TRANSACTION_AMOUNT_REQUIRED',
      messageKey: 'errors.transaction.amount_required',
      message: 'Amount is required.',
      category: 'validation',
    };
    const result = toAppError(original);
    expect(result).toBe(original);
  });

  it('wraps a standard Error into an AppError with UNKNOWN_ERROR code', () => {
    const err = new Error('Something broke');
    const result = toAppError(err);
    expect(result.code).toBe('UNKNOWN_ERROR');
    expect(result.category).toBe('system');
    expect(result.message).toBe('Something broke');
    expect(result.details).toBe(err);
  });

  it('uses the provided fallbackCode when wrapping a standard Error', () => {
    const err = new Error('Local write failed');
    const result = toAppError(err, 'LOCAL_WRITE_FAILED');
    expect(result.code).toBe('LOCAL_WRITE_FAILED');
    expect(result.category).toBe('system');
  });

  it('wraps a string into an AppError', () => {
    const result = toAppError('plain string error');
    expect(result.code).toBe('UNKNOWN_ERROR');
    expect(result.message).toBe('plain string error');
    expect(result.details).toBe('plain string error');
  });

  it('wraps null into an AppError with UNKNOWN_ERROR', () => {
    const result = toAppError(null);
    expect(result.code).toBe('UNKNOWN_ERROR');
    expect(result.category).toBe('system');
  });

  it('wraps undefined into an AppError with UNKNOWN_ERROR', () => {
    const result = toAppError(undefined);
    expect(result.code).toBe('UNKNOWN_ERROR');
    expect(result.category).toBe('system');
  });

  it('never throws regardless of input', () => {
    expect(() => toAppError(Symbol('weird'))).not.toThrow();
    expect(() => toAppError(42)).not.toThrow();
    expect(() => toAppError({})).not.toThrow();
  });
});

describe('makeAppError', () => {
  it('creates a well-formed AppError for a validation code', () => {
    const err = makeAppError('TRANSACTION_AMOUNT_REQUIRED');
    expect(err.code).toBe('TRANSACTION_AMOUNT_REQUIRED');
    expect(err.category).toBe('validation');
    expect(err.messageKey).toBe('errors.transaction.amount_required');
    expect(typeof err.message).toBe('string');
    expect(err.message.length).toBeGreaterThan(0);
  });

  it('creates a well-formed AppError for a system code', () => {
    const err = makeAppError('LOCAL_WRITE_FAILED');
    expect(err.code).toBe('LOCAL_WRITE_FAILED');
    expect(err.category).toBe('system');
    expect(err.messageKey).toBe('errors.system.local_write_failed');
  });

  it('stores details when provided', () => {
    const originalError = new Error('original');
    const err = makeAppError('SYNC_UPLOAD_FAILED', originalError);
    expect(err.details).toBe(originalError);
  });

  it('has no details when not provided', () => {
    const err = makeAppError('BILL_SUPPLIER_REQUIRED');
    expect(err.details).toBeUndefined();
  });
});

describe('AppErrorCode coverage', () => {
  const expectedCodes = [
    'TRANSACTION_AMOUNT_REQUIRED',
    'TRANSACTION_AMOUNT_NON_POSITIVE',
    'TRANSACTION_CURRENCY_INVALID',
    'TRANSACTION_CATEGORY_INVALID',
    'TRANSACTION_DESCRIPTION_REQUIRED',
    'TRANSACTION_STORE_ID_REQUIRED',
    'TRANSACTION_BRANCH_ID_REQUIRED',
    'TRANSACTION_ENTITY_NOT_FOUND',
    'TRANSACTION_CASH_DRAWER_MISSING',
    'JOURNAL_BRANCH_ID_REQUIRED',
    'JOURNAL_DEBIT_CREDIT_MISMATCH',
    'JOURNAL_AMOUNT_NON_POSITIVE',
    'JOURNAL_ACCOUNT_INVALID',
    'BILL_SUPPLIER_REQUIRED',
    'BILL_LINE_ITEMS_EMPTY',
    'BILL_AMOUNT_NON_POSITIVE',
    'STATEMENT_TOKEN_INVALID',
    'STATEMENT_TOKEN_EXPIRED',
    'LOCAL_WRITE_FAILED',
    'SYNC_UPLOAD_FAILED',
    'NETWORK_UNAVAILABLE',
    'UNKNOWN_ERROR',
  ] as const;

  it.each(expectedCodes)('makeAppError(%s) returns a complete AppError', (code) => {
    const err = makeAppError(code);
    expect(err.code).toBe(code);
    expect(['validation', 'system', 'unrecoverable']).toContain(err.category);
    expect(typeof err.messageKey).toBe('string');
    expect(err.messageKey.startsWith('errors.')).toBe(true);
    expect(typeof err.message).toBe('string');
    expect(err.message.length).toBeGreaterThan(0);
  });
});
