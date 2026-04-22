import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest';
import { computeLineUnitPrice, changeBillCurrency } from '../saleOperations';
import { currencyService, MissingExchangeRateError, CurrencyService } from '../../../../services/currencyService';
import { LegacyCurrencyMissingError, CurrencyLockError } from '../../../../errors/currencyErrors';
import { getDB } from '../../../../lib/db';

vi.mock('../../../../lib/db', () => ({
  getDB: vi.fn(),
  createId: vi.fn(() => 'test-id'),
}));

function loadLebaneseStore(rate = 89500): void {
  const s = CurrencyService.getInstance() as unknown as {
    isInitialized: boolean;
    acceptedCurrencies: string[];
    preferredCurrency: string;
    rates: Record<string, number>;
  };
  s.isInitialized = true;
  s.acceptedCurrencies = ['LBP', 'USD'];
  s.preferredCurrency = 'LBP';
  s.rates = { USD: 1, LBP: rate };
}

describe('computeLineUnitPrice', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('returns selling_price unchanged when item currency matches bill currency', () => {
    expect(computeLineUnitPrice({ selling_price: 1500000, currency: 'LBP' }, 'LBP')).toBe(1500000);
  });

  it('throws LegacyCurrencyMissingError when inventory currency is null', () => {
    expect(() => computeLineUnitPrice({ selling_price: 10, currency: null }, 'USD')).toThrow(
      LegacyCurrencyMissingError
    );
  });

  it('converts LBP → USD at rate 89500 and bank-rounds to 16.76 (quickstart Scenario A)', () => {
    loadLebaneseStore(89500);
    const unit = computeLineUnitPrice({ selling_price: 1_500_000, currency: 'LBP' }, 'USD');
    expect(unit).toBe(16.76);
  });

  it('identity case short-circuits: same currency returns raw selling_price', () => {
    loadLebaneseStore(89500);
    const unit = computeLineUnitPrice({ selling_price: 10.5, currency: 'USD' }, 'USD');
    expect(unit).toBe(10.5);
  });

  it('converts and bank-rounds LBP → USD using currencyService.convert (mocked)', () => {
    vi.spyOn(currencyService, 'convert').mockReturnValue(16.759776);
    const unit = computeLineUnitPrice({ selling_price: 1_500_000, currency: 'LBP' }, 'USD');
    expect(unit).toBe(16.76);
    expect(currencyService.convert).toHaveBeenCalledWith(1_500_000, 'LBP', 'USD');
  });

  it('propagates MissingExchangeRateError from currencyService.convert', () => {
    vi.spyOn(currencyService, 'convert').mockImplementation(() => {
      throw new MissingExchangeRateError('LBP', 'EUR');
    });
    expect(() => computeLineUnitPrice({ selling_price: 100, currency: 'LBP' }, 'EUR')).toThrow(
      MissingExchangeRateError
    );
  });
});

describe('changeBillCurrency', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  function mockLineItemsCount(count: number): void {
    vi.mocked(getDB).mockReturnValue({
      bill_line_items: {
        where: () => ({
          equals: () => ({
            filter: () => ({
              count: vi.fn().mockResolvedValue(count),
            }),
          }),
        }),
      },
    } as unknown as ReturnType<typeof getDB>);
  }

  it('resolves when bill has zero line items', async () => {
    mockLineItemsCount(0);
    await expect(changeBillCurrency('bill-1', 'USD')).resolves.toBeUndefined();
  });

  it('throws CurrencyLockError when bill has ≥1 line item', async () => {
    mockLineItemsCount(1);
    await expect(changeBillCurrency('bill-1', 'USD')).rejects.toBeInstanceOf(CurrencyLockError);
  });

  it('CurrencyLockError payload carries bill_id and attemptedCurrency', async () => {
    mockLineItemsCount(3);
    try {
      await changeBillCurrency('bill-xyz', 'LBP');
      throw new Error('expected throw');
    } catch (e) {
      expect(e).toBeInstanceOf(CurrencyLockError);
      expect((e as CurrencyLockError).payload.bill_id).toBe('bill-xyz');
      expect((e as CurrencyLockError).payload.attemptedCurrency).toBe('LBP');
      expect((e as CurrencyLockError).payload.reason).toBe('lines-present');
    }
  });
});
