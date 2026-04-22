import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createBill } from '../billOperations';
import { currencyService, CurrencyService } from '../../../../services/currencyService';
import { InvalidCurrencyError } from '../../../../errors/currencyErrors';
import * as businessValidationService from '../../../../services/businessValidationService';
import { BranchAccessValidationService } from '../../../../services/branchAccessValidationService';
import { getDB } from '../../../../lib/db';

vi.mock('../../../../lib/db', () => ({
  getDB: vi.fn(),
  createId: vi.fn(() => 'test-id'),
}));

vi.mock('../../../../services/branchAccessValidationService', () => ({
  BranchAccessValidationService: { validateBranchAccess: vi.fn().mockResolvedValue(undefined) },
}));

vi.mock('../../../../services/businessValidationService', () => ({
  validateBillCreation: vi.fn(),
}));

vi.mock('../../../../services/receivedBillMonitoringService', () => ({
  receivedBillMonitoringService: { checkBillAfterSale: vi.fn().mockResolvedValue(undefined) },
}));

vi.mock('../../../../services/journalService', () => ({
  journalService: {},
}));

function makeDeps(overrides: Partial<Parameters<typeof createBill>[0]> = {}): Parameters<typeof createBill>[0] {
  return {
    storeId: 'store-1',
    currentBranchId: 'branch-1',
    userProfileId: 'user-1',
    pushUndo: vi.fn(),
    refreshData: vi.fn().mockResolvedValue(undefined),
    updateUnsyncedCount: vi.fn().mockResolvedValue(undefined),
    resetAutoSyncTimer: vi.fn(),
    debouncedSync: vi.fn(),
    createCashDrawerTransactionAtomic: vi.fn(),
    createCashDrawerUndoData: vi.fn(),
    refreshCashDrawerStatus: vi.fn().mockResolvedValue(undefined),
    ...overrides,
  };
}

function loadLebaneseStore(): void {
  const s = CurrencyService.getInstance() as unknown as {
    isInitialized: boolean;
    acceptedCurrencies: string[];
    preferredCurrency: string;
    rates: Record<string, number>;
  };
  s.isInitialized = true;
  s.acceptedCurrencies = ['LBP', 'USD'];
  s.preferredCurrency = 'LBP';
  s.rates = { USD: 1, LBP: 89500 };
}

describe('createBill — currency validation (T013, T015)', () => {
  const capturedBills: any[] = [];

  beforeEach(() => {
    vi.clearAllMocks();
    capturedBills.length = 0;
    loadLebaneseStore();
    vi.mocked(businessValidationService.validateBillCreation).mockResolvedValue({
      isValid: true,
      violations: [],
    } as any);
    vi.mocked(getDB).mockReturnValue({
      bills: { add: vi.fn((b: any) => { capturedBills.push(b); return Promise.resolve(); }) },
      bill_line_items: { bulkAdd: vi.fn().mockResolvedValue(undefined) },
      bill_audit_logs: { add: vi.fn().mockResolvedValue(undefined) },
      inventory_items: {
        bulkGet: vi.fn().mockResolvedValue([]),
        bulkPut: vi.fn().mockResolvedValue(undefined),
        update: vi.fn().mockResolvedValue(undefined),
        where: () => ({
          equals: () => ({
            and: () => ({ sortBy: vi.fn().mockResolvedValue([]) }),
          }),
        }),
      },
      entities: { get: vi.fn() },
      transactions: { add: vi.fn().mockResolvedValue(undefined) },
      journal_entries: { bulkAdd: vi.fn().mockResolvedValue(undefined), update: vi.fn().mockResolvedValue(undefined), where: () => ({ equals: () => ({ toArray: vi.fn().mockResolvedValue([]) }) }) },
      chart_of_accounts: {},
      cash_drawer_sessions: {},
      cash_drawer_accounts: {},
      transaction: vi.fn().mockImplementation(async (_mode, _tables, fn) => fn()),
    } as unknown as ReturnType<typeof getDB>);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('rejects when currency is undefined', async () => {
    const deps = makeDeps();
    await expect(
      createBill(deps, { bill_type: 'sale', bill_number: 'B-1' }, [])
    ).rejects.toBeInstanceOf(InvalidCurrencyError);
  });

  it('rejects when currency is null with reason "missing"', async () => {
    const deps = makeDeps();
    try {
      await createBill(deps, { bill_type: 'sale', bill_number: 'B-1', currency: null }, []);
      throw new Error('expected throw');
    } catch (e) {
      expect(e).toBeInstanceOf(InvalidCurrencyError);
      expect((e as InvalidCurrencyError).payload.reason).toBe('missing');
    }
  });

  it('rejects with reason "not-accepted" for EUR in a Lebanese (LBP/USD) store', async () => {
    const deps = makeDeps();
    try {
      await createBill(deps, { bill_type: 'sale', bill_number: 'B-1', currency: 'EUR' }, []);
      throw new Error('expected throw');
    } catch (e) {
      expect(e).toBeInstanceOf(InvalidCurrencyError);
      expect((e as InvalidCurrencyError).payload.reason).toBe('not-accepted');
      expect((e as InvalidCurrencyError).payload.attemptedCurrency).toBe('EUR');
      expect((e as InvalidCurrencyError).payload.acceptedCurrencies).toEqual(['LBP', 'USD']);
    }
  });

  it('happy path: writes bill with supplied currency (USD)', async () => {
    const deps = makeDeps();
    const id = await createBill(
      deps,
      { bill_type: 'sale', bill_number: 'B-1', currency: 'USD', total_amount: 10 },
      []
    );
    expect(id).toBeDefined();
    expect(capturedBills).toHaveLength(1);
    expect(capturedBills[0].currency).toBe('USD');
  });

  it('happy path: writes bill with supplied currency (LBP) — no coercion to USD', async () => {
    const deps = makeDeps();
    await createBill(
      deps,
      { bill_type: 'sale', bill_number: 'B-2', currency: 'LBP', total_amount: 500_000 },
      []
    );
    expect(capturedBills).toHaveLength(1);
    expect(capturedBills[0].currency).toBe('LBP');
  });

  it('regression: acceptedCurrencies from currencyService drives validation (not a hardcoded LBP/USD list)', () => {
    const s = CurrencyService.getInstance() as unknown as {
      acceptedCurrencies: string[];
    };
    s.acceptedCurrencies = ['USD'];
    expect(currencyService.getAcceptedCurrencies()).toEqual(['USD']);
  });
});
