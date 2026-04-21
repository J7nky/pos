import { describe, it, expect, beforeEach, vi } from 'vitest';
import { getDB } from '../../lib/db';
import { CurrencyService, currencyService } from '../currencyService';

vi.mock('../../lib/db', () => ({
  getDB: vi.fn(),
}));

function resetServiceInternals(): void {
  const s = CurrencyService.getInstance() as unknown as {
    isInitialized: boolean;
    acceptedCurrencies: string[];
    preferredCurrency: string;
    rates: Record<string, number>;
  };
  s.isInitialized = false;
  s.acceptedCurrencies = ['USD'];
  s.preferredCurrency = 'USD';
  s.rates = { USD: 1 };
}

function mockStoreGet(row: Record<string, unknown> | undefined): void {
  vi.mocked(getDB).mockReturnValue({
    stores: {
      get: vi.fn().mockResolvedValue(row),
    },
  } as unknown as ReturnType<typeof getDB>);
}

describe('CurrencyService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    resetServiceInternals();
  });

  describe('uninitialized', () => {
    it('convert(100, USD, LBP) throws before any loadFromStore', () => {
      expect(() => currencyService.convert(100, 'USD', 'LBP')).toThrow(/not initialized/i);
    });

    it('getExchangeRate returns 0 before load', () => {
      expect(currencyService.getExchangeRate()).toBe(0);
    });
  });

  describe('after loadFromStore', () => {
    it('populates state from a Lebanese store fixture', async () => {
      mockStoreGet({
        id: 'store-1',
        preferred_currency: 'LBP',
        accepted_currencies: ['LBP', 'USD'],
        exchange_rate: 89500,
      });
      await currencyService.loadFromStore('store-1');
      expect(currencyService.getPreferredCurrency()).toBe('LBP');
      expect(currencyService.getAcceptedCurrencies()).toEqual(['LBP', 'USD']);
      expect(currencyService.getExchangeRate()).toBe(89500);
      expect(currencyService.isReady()).toBe(true);
    });

    it('populates USD-only store with rates { USD: 1 }', async () => {
      mockStoreGet({
        id: 'store-2',
        preferred_currency: 'USD',
        accepted_currencies: ['USD'],
        exchange_rate: 1,
      });
      await currencyService.loadFromStore('store-2');
      expect(currencyService.getPreferredCurrency()).toBe('USD');
      expect(currencyService.getAcceptedCurrencies()).toEqual(['USD']);
      expect(currencyService.getExchangeRate()).toBe(1);
    });

    it('derives accepted_currencies when missing on row', async () => {
      mockStoreGet({
        id: 'store-3',
        preferred_currency: 'LBP',
        accepted_currencies: undefined,
        exchange_rate: 89500,
      });
      await currencyService.loadFromStore('store-3');
      expect(currencyService.getAcceptedCurrencies()).toEqual(['LBP', 'USD']);
    });

    it('convert(100, USD, LBP) returns 100 * 89500 after Lebanese load', async () => {
      mockStoreGet({
        preferred_currency: 'LBP',
        accepted_currencies: ['LBP', 'USD'],
        exchange_rate: 89500,
      });
      await currencyService.loadFromStore('s');
      expect(currencyService.convert(100, 'USD', 'LBP')).toBe(100 * 89500);
    });

    it('convert(8950000, LBP, USD) returns 100 after Lebanese load', async () => {
      mockStoreGet({
        preferred_currency: 'LBP',
        accepted_currencies: ['LBP', 'USD'],
        exchange_rate: 89500,
      });
      await currencyService.loadFromStore('s');
      expect(currencyService.convert(8950000, 'LBP', 'USD')).toBe(100);
    });

    it('convert(100, USD, USD) returns 100', async () => {
      mockStoreGet({
        preferred_currency: 'LBP',
        accepted_currencies: ['LBP', 'USD'],
        exchange_rate: 89500,
      });
      await currencyService.loadFromStore('s');
      expect(currencyService.convert(100, 'USD', 'USD')).toBe(100);
    });

    it('convert(100, USD, EUR) throws naming USD → EUR when EUR rate not loaded', async () => {
      mockStoreGet({
        preferred_currency: 'LBP',
        accepted_currencies: ['LBP', 'USD'],
        exchange_rate: 89500,
      });
      await currencyService.loadFromStore('s');
      expect(() => currencyService.convert(100, 'USD', 'EUR')).toThrow(/USD\s*→\s*EUR/);
    });

    it('getAcceptedCurrencies returns preferred first after Lebanese-store load', async () => {
      mockStoreGet({
        preferred_currency: 'LBP',
        accepted_currencies: ['USD', 'LBP'],
        exchange_rate: 89500,
      });
      await currencyService.loadFromStore('s');
      expect(currencyService.getAcceptedCurrencies()).toEqual(['LBP', 'USD']);
    });
  });

  describe('format', () => {
    it('format(10.5, USD) returns $10.50', () => {
      const out = currencyService.format(10.5, 'USD');
      expect(out).toMatch(/\$10\.50/);
    });

    it('format(1500000, LBP) uses Arabic-locale Lebanese pound with zero decimals', () => {
      const out = currencyService.format(1500000, 'LBP');
      expect(out).toContain('ل.ل');
      expect(out).not.toMatch(/[.,]\d{2}\b/);
    });

    it('format(500, JOD) shows three decimal places', () => {
      const out = currencyService.format(500, 'JOD');
      expect(out).toMatch(/٫٠{3}|\.000/);
    });
  });

  it('removed legacy methods are not on the class prototype', () => {
    const proto = CurrencyService.prototype as unknown as Record<string, unknown>;
    const legacy = [
      'getSupportedCurrencies',
      'safeConvertForDatabase',
      'formatCurrencyWithSymbol',
      'getConvertedAmount',
      'updateExchangeRate',
      'refreshExchangeRate',
      'convertCurrency',
      'formatCurrency',
      'validateCurrencyAmount',
    ] as const;
    for (const name of legacy) {
      expect(proto[name]).toBeUndefined();
    }
  });
});
