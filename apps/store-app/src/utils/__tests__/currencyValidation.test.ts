import { describe, it, expect } from 'vitest';
import { assertValidCurrency } from '../currencyValidation';
import { InvalidCurrencyError } from '../../errors/currencyErrors';

describe('assertValidCurrency', () => {
  it('throws missing for null/undefined', () => {
    expect(() => assertValidCurrency(null, ['USD'], { storeId: 's1' })).toThrow(InvalidCurrencyError);
    try {
      assertValidCurrency(undefined, ['USD'], { storeId: 's1' });
    } catch (e) {
      expect(e).toBeInstanceOf(InvalidCurrencyError);
      expect((e as InvalidCurrencyError).payload.reason).toBe('missing');
    }
  });

  it('throws not-accepted with accepted list in payload', () => {
    try {
      assertValidCurrency('EUR', ['USD'], { storeId: 's1' });
    } catch (e) {
      expect(e).toBeInstanceOf(InvalidCurrencyError);
      expect((e as InvalidCurrencyError).payload.reason).toBe('not-accepted');
      expect((e as InvalidCurrencyError).payload.acceptedCurrencies).toEqual(['USD']);
    }
  });

  it('accepts valid member for USD-only', () => {
    expect(assertValidCurrency('USD', ['USD'], { storeId: 's1' })).toBe('USD');
  });

  it('accepts valid member for LBP/USD', () => {
    expect(assertValidCurrency('LBP', ['LBP', 'USD'], { storeId: 's1' })).toBe('LBP');
    expect(assertValidCurrency('USD', ['LBP', 'USD'], { storeId: 's1' })).toBe('USD');
  });

  it('accepts valid member for AED/USD/EUR', () => {
    const set = ['AED', 'USD', 'EUR'] as const;
    expect(assertValidCurrency('AED', [...set], { storeId: 's1' })).toBe('AED');
    expect(assertValidCurrency('EUR', [...set], { storeId: 's1' })).toBe('EUR');
  });
});
