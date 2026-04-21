import { describe, expect, it } from 'vitest';
import { COUNTRY_CONFIGS, getDefaultCurrenciesForCountry } from '../src/types/countries';
import { CURRENCY_META, type CurrencyCode } from '../src/types/currency';

describe('country and currency foundation', () => {
  it('returns LB default currencies', () => {
    expect(getDefaultCurrenciesForCountry('LB')).toEqual(['LBP', 'USD']);
  });

  it('returns US default currencies', () => {
    expect(getDefaultCurrenciesForCountry('US')).toEqual(['USD']);
  });

  it('returns USD-only fallback for unknown country without throwing', () => {
    expect(() => getDefaultCurrenciesForCountry('ZZ')).not.toThrow();
    expect(getDefaultCurrenciesForCountry('ZZ')).toEqual(['USD']);
  });

  it('includes USD in every country default list', () => {
    for (const c of COUNTRY_CONFIGS) {
      expect(c.defaultCurrencies.includes('USD')).toBe(true);
    }
  });

  it('matches ISO 4217 decimal spot checks', () => {
    expect(CURRENCY_META.LBP.decimals).toBe(0);
    expect(CURRENCY_META.USD.decimals).toBe(2);
    expect(CURRENCY_META.JOD.decimals).toBe(3);
  });

  it('keeps meta.code aligned with record keys', () => {
    for (const code of Object.keys(CURRENCY_META) as CurrencyCode[]) {
      expect(CURRENCY_META[code].code).toBe(code);
    }
  });
});
