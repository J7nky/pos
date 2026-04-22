import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { addInventoryItem, updateInventoryItem } from '../inventoryItemOperations';
import { CurrencyService } from '../../../../services/currencyService';
import { InvalidCurrencyError } from '../../../../errors/currencyErrors';
import { crudHelperService } from '../../../../services/crudHelperService';
import { getDB } from '../../../../lib/db';

vi.mock('../../../../lib/db', () => ({
  getDB: vi.fn(),
  createId: vi.fn(() => 'test-id'),
}));

vi.mock('../../../../services/crudHelperService', () => ({
  crudHelperService: { addEntity: vi.fn().mockResolvedValue(undefined) },
}));

vi.mock('../../../../services/receivedItemsJournalService', () => ({
  receivedItemsJournalService: {
    calculateItemAmount: vi.fn().mockReturnValue(0),
    reverseJournalEntriesForItem: vi.fn().mockResolvedValue(undefined),
  },
}));

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

describe('addInventoryItem — currency validation (T024, T025)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    loadLebaneseStore();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  const deps = {
    storeId: 'store-1',
    pushUndo: vi.fn(),
    resetAutoSyncTimer: vi.fn(),
  };

  it('happy path: writes row with provided currency (USD)', async () => {
    await addInventoryItem(deps, {
      product_id: 'p-1',
      quantity: 5,
      unit: 'box',
      currency: 'USD',
      selling_price: 10,
    } as any);
    expect(crudHelperService.addEntity).toHaveBeenCalledTimes(1);
    const [, , payload] = (crudHelperService.addEntity as any).mock.calls[0];
    expect(payload.currency).toBe('USD');
    expect(payload.selling_price).toBe(10);
  });

  it('rejects when currency is missing with reason "missing"', async () => {
    await expect(
      addInventoryItem(deps, { product_id: 'p-1', quantity: 1, unit: 'box' } as any)
    ).rejects.toBeInstanceOf(InvalidCurrencyError);
    expect(crudHelperService.addEntity).not.toHaveBeenCalled();
  });

  it('rejects with reason "missing" when currency is null', async () => {
    try {
      await addInventoryItem(deps, { product_id: 'p-1', quantity: 1, unit: 'box', currency: null } as any);
      throw new Error('expected throw');
    } catch (e) {
      expect(e).toBeInstanceOf(InvalidCurrencyError);
      expect((e as InvalidCurrencyError).payload.reason).toBe('missing');
    }
  });

  it('rejects EUR with reason "not-accepted" in a Lebanese store', async () => {
    try {
      await addInventoryItem(deps, { product_id: 'p-1', quantity: 1, unit: 'box', currency: 'EUR' } as any);
      throw new Error('expected throw');
    } catch (e) {
      expect(e).toBeInstanceOf(InvalidCurrencyError);
      expect((e as InvalidCurrencyError).payload.reason).toBe('not-accepted');
      expect((e as InvalidCurrencyError).payload.attemptedCurrency).toBe('EUR');
      expect((e as InvalidCurrencyError).payload.acceptedCurrencies).toEqual(['LBP', 'USD']);
    }
  });

  it('selling_price passes through unchanged (no conversion on write)', async () => {
    await addInventoryItem(deps, {
      product_id: 'p-1',
      quantity: 1,
      unit: 'box',
      currency: 'LBP',
      selling_price: 1_500_000,
    } as any);
    const [, , payload] = (crudHelperService.addEntity as any).mock.calls[0];
    expect(payload.selling_price).toBe(1_500_000);
    expect(payload.currency).toBe('LBP');
  });
});

describe('updateInventoryItem — currency validation (T024, T025)', () => {
  const inventoryUpdateSpy = vi.fn().mockResolvedValue(undefined);
  const inventoryGetSpy = vi.fn().mockResolvedValue({
    id: 'inv-1',
    product_id: 'p-1',
    quantity: 5,
    unit: 'box',
    currency: 'USD',
    selling_price: 10,
    batch_id: null,
  });

  beforeEach(() => {
    vi.clearAllMocks();
    loadLebaneseStore();
    vi.mocked(getDB).mockReturnValue({
      inventory_items: { get: inventoryGetSpy, update: inventoryUpdateSpy },
      inventory_bills: { get: vi.fn().mockResolvedValue(null) },
    } as unknown as ReturnType<typeof getDB>);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  const deps = {
    storeId: 'store-1',
    currentBranchId: 'branch-1',
    userProfileId: 'user-1',
    currency: 'LBP',
    pushUndo: vi.fn(),
    refreshData: vi.fn(),
    updateUnsyncedCount: vi.fn(),
    resetAutoSyncTimer: vi.fn(),
    debouncedSync: vi.fn(),
  };

  it('partial update without currency does NOT run currency validation', async () => {
    await expect(
      updateInventoryItem(deps, 'inv-1', { selling_price: 20 } as any)
    ).resolves.toBeUndefined();
    expect(inventoryUpdateSpy).toHaveBeenCalled();
  });

  it('partial update with valid currency passes validation', async () => {
    await expect(
      updateInventoryItem(deps, 'inv-1', { currency: 'LBP' } as any)
    ).resolves.toBeUndefined();
    expect(inventoryUpdateSpy).toHaveBeenCalled();
  });

  it('partial update with not-accepted currency throws', async () => {
    await expect(
      updateInventoryItem(deps, 'inv-1', { currency: 'EUR' } as any)
    ).rejects.toBeInstanceOf(InvalidCurrencyError);
    expect(inventoryUpdateSpy).not.toHaveBeenCalled();
  });

  it('partial update with null currency throws with reason "missing"', async () => {
    try {
      await updateInventoryItem(deps, 'inv-1', { currency: null } as any);
      throw new Error('expected throw');
    } catch (e) {
      expect(e).toBeInstanceOf(InvalidCurrencyError);
      expect((e as InvalidCurrencyError).payload.reason).toBe('missing');
    }
  });
});
