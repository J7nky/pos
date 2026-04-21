import { describe, it, expect, vi, afterEach } from 'vitest';
import { computeLineUnitPrice } from '../saleOperations';
import { currencyService } from '../../../../services/currencyService';
import { LegacyCurrencyMissingError } from '../../../../errors/currencyErrors';
import { MissingExchangeRateError } from '../../../../services/currencyService';

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

  it('converts and bank-rounds LBP → USD using currencyService.convert', () => {
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
