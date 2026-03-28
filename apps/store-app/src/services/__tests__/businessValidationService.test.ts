/**
 * Unit tests for businessValidationService validation methods.
 *
 * Tests cover:
 *  - validateTransactionCreation: happy path + individual violation rules
 *  - validateJournalEntryCreation: happy path + violation rules
 *  - validateBillCreation: happy path + violation rules
 *
 * DB-dependent checks (entity existence) are skipped in unit tests.
 * Integration tests would cover those.
 */

import { describe, it, expect, vi, beforeAll } from 'vitest';
import {
  validateTransactionCreation,
  validateJournalEntryCreation,
  validateBillCreation,
} from '../businessValidationService';
import type { CreateTransactionParams } from '../transactionService';
import type { CreateJournalEntryParams } from '../../types/accounting';

// Stub getDB so the entity-existence check doesn't blow up in unit tests
vi.mock('../../lib/db', () => ({
  getDB: () => ({
    entities: {
      get: async (_id: string) => ({ id: _id, entity_type: 'customer' }),
    },
  }),
}));

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function validTransactionParams(): CreateTransactionParams {
  return {
    amount: 100,
    currency: 'USD',
    // 'Customer Payment' is a valid TRANSACTION_CATEGORIES value
    category: 'Customer Payment',
    description: 'Test payment',
    context: {
      userId: 'user-1',
      storeId: 'store-1',
      branchId: 'branch-1',
    },
  } as unknown as CreateTransactionParams;
}

function validJournalParams(): CreateJournalEntryParams {
  return {
    transactionId: 'tx-1',
    debitAccount: '1100',
    creditAccount: '2100',
    amountUSD: 50,
    amountLBP: 0,
    branchId: 'branch-1',
    description: 'Test journal entry',
    postedDate: '2026-03-27',
  } as CreateJournalEntryParams;
}

// ---------------------------------------------------------------------------
// validateTransactionCreation
// ---------------------------------------------------------------------------

describe('validateTransactionCreation', () => {
  it('returns isValid=true for a complete valid input', async () => {
    const result = await validateTransactionCreation(validTransactionParams());
    expect(result.isValid).toBe(true);
    expect(result.violations).toHaveLength(0);
    expect(result.sanitisedInput).toBeDefined();
  });

  it('rejects when amount is 0', async () => {
    const params = { ...validTransactionParams(), amount: 0 };
    const result = await validateTransactionCreation(params);
    expect(result.isValid).toBe(false);
    expect(result.violations.some(v => v.code === 'TRANSACTION_AMOUNT_NON_POSITIVE')).toBe(true);
  });

  it('rejects when amount is negative', async () => {
    const params = { ...validTransactionParams(), amount: -10 };
    const result = await validateTransactionCreation(params);
    expect(result.isValid).toBe(false);
    expect(result.violations.some(v => v.code === 'TRANSACTION_AMOUNT_NON_POSITIVE')).toBe(true);
  });

  it('rejects when amount is missing', async () => {
    const params = { ...validTransactionParams(), amount: undefined as unknown as number };
    const result = await validateTransactionCreation(params);
    expect(result.isValid).toBe(false);
    expect(result.violations.some(v => v.code === 'TRANSACTION_AMOUNT_REQUIRED')).toBe(true);
  });

  it('rejects invalid currency', async () => {
    const params = { ...validTransactionParams(), currency: 'EUR' as 'USD' };
    const result = await validateTransactionCreation(params);
    expect(result.isValid).toBe(false);
    expect(result.violations.some(v => v.code === 'TRANSACTION_CURRENCY_INVALID')).toBe(true);
  });

  it('rejects missing storeId', async () => {
    const params = {
      ...validTransactionParams(),
      context: { userId: 'u', storeId: '', branchId: 'b' },
    };
    const result = await validateTransactionCreation(params);
    expect(result.isValid).toBe(false);
    expect(result.violations.some(v => v.code === 'TRANSACTION_STORE_ID_REQUIRED')).toBe(true);
  });

  it('rejects missing branchId', async () => {
    const params = {
      ...validTransactionParams(),
      context: { userId: 'u', storeId: 's', branchId: '' },
    };
    const result = await validateTransactionCreation(params);
    expect(result.isValid).toBe(false);
    expect(result.violations.some(v => v.code === 'TRANSACTION_BRANCH_ID_REQUIRED')).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// validateJournalEntryCreation
// ---------------------------------------------------------------------------

describe('validateJournalEntryCreation', () => {
  it('returns isValid=true for complete valid input', async () => {
    const result = await validateJournalEntryCreation(validJournalParams());
    expect(result.isValid).toBe(true);
    expect(result.violations).toHaveLength(0);
  });

  it('rejects when branchId is missing', async () => {
    const params = { ...validJournalParams(), branchId: undefined };
    const result = await validateJournalEntryCreation(params as CreateJournalEntryParams);
    expect(result.isValid).toBe(false);
    expect(result.violations.some(v => v.code === 'JOURNAL_BRANCH_ID_REQUIRED')).toBe(true);
  });

  it('rejects when both amountUSD and amountLBP are zero', async () => {
    const params = { ...validJournalParams(), amountUSD: 0, amountLBP: 0 };
    const result = await validateJournalEntryCreation(params);
    expect(result.isValid).toBe(false);
    expect(result.violations.some(v => v.code === 'JOURNAL_AMOUNT_NON_POSITIVE')).toBe(true);
  });

  it('accepts entry with only LBP amount', async () => {
    const params = { ...validJournalParams(), amountUSD: 0, amountLBP: 10000 };
    const result = await validateJournalEntryCreation(params);
    expect(result.isValid).toBe(true);
  });

  it('accepts legacy amount + currency (LBP) when amountUSD/amountLBP omitted', async () => {
    const params: CreateJournalEntryParams = {
      transactionId: 'tx-legacy-lbp',
      debitAccount: '1100',
      creditAccount: '4100',
      entityId: 'entity-1',
      branchId: 'branch-1',
      amount: 75000,
      currency: 'LBP',
    };
    const result = await validateJournalEntryCreation(params);
    expect(result.isValid).toBe(true);
  });

  it('accepts legacy amount + currency (USD) when amountUSD/amountLBP omitted', async () => {
    const params: CreateJournalEntryParams = {
      transactionId: 'tx-legacy-usd',
      debitAccount: '1100',
      creditAccount: '4100',
      entityId: 'entity-1',
      branchId: 'branch-1',
      amount: 25,
      currency: 'USD',
    };
    const result = await validateJournalEntryCreation(params);
    expect(result.isValid).toBe(true);
  });

  it('rejects when debitAccount is missing', async () => {
    const params = { ...validJournalParams(), debitAccount: '' };
    const result = await validateJournalEntryCreation(params);
    expect(result.isValid).toBe(false);
    expect(result.violations.some(v => v.code === 'JOURNAL_ACCOUNT_INVALID')).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// validateBillCreation
// ---------------------------------------------------------------------------

describe('validateBillCreation', () => {
  it('returns isValid=true for valid bill with line items', async () => {
    const result = await validateBillCreation({
      requiresSupplier: true,
      supplierId: 'supplier-1',
      lineItems: [{ unit_price: 10 }, { unit_price: 20 }],
    });
    expect(result.isValid).toBe(true);
    expect(result.violations).toHaveLength(0);
  });

  it('rejects when requiresSupplier=true and no supplierId', async () => {
    const result = await validateBillCreation({
      requiresSupplier: true,
      supplierId: null,
      lineItems: [{ unit_price: 10 }],
    });
    expect(result.isValid).toBe(false);
    expect(result.violations.some(v => v.code === 'BILL_SUPPLIER_REQUIRED')).toBe(true);
  });

  it('accepts bill without supplier when requiresSupplier=false', async () => {
    const result = await validateBillCreation({
      requiresSupplier: false,
      supplierId: null,
      lineItems: [{ unit_price: 10 }],
    });
    expect(result.isValid).toBe(true);
  });

  it('rejects empty line items', async () => {
    const result = await validateBillCreation({
      requiresSupplier: false,
      supplierId: null,
      lineItems: [],
    });
    expect(result.isValid).toBe(false);
    expect(result.violations.some(v => v.code === 'BILL_LINE_ITEMS_EMPTY')).toBe(true);
  });

  it('rejects line items with zero amount', async () => {
    const result = await validateBillCreation({
      requiresSupplier: false,
      supplierId: null,
      lineItems: [{ unit_price: 0 }],
    });
    expect(result.isValid).toBe(false);
    expect(result.violations.some(v => v.code === 'BILL_AMOUNT_NON_POSITIVE')).toBe(true);
  });

  it('rejects line items with negative amount', async () => {
    const result = await validateBillCreation({
      requiresSupplier: false,
      supplierId: null,
      lineItems: [{ unit_price: -5 }],
    });
    expect(result.isValid).toBe(false);
    expect(result.violations.some(v => v.code === 'BILL_AMOUNT_NON_POSITIVE')).toBe(true);
  });
});
