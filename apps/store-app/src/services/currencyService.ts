import type { CurrencyCode, CurrencyMeta } from '@pos-platform/shared';
import { CURRENCY_META } from '@pos-platform/shared';

const UNKNOWN_FORMAT_WARNED = new Set<string>();

export class CurrencyService {
  private static instance: CurrencyService;

  private preferredCurrency: CurrencyCode = 'USD';
  private acceptedCurrencies: CurrencyCode[] = ['USD'];
  private rates: Partial<Record<CurrencyCode, number>> = { USD: 1 };
  private isInitialized = false;

  private constructor() {}

  public static getInstance(): CurrencyService {
    if (!CurrencyService.instance) {
      CurrencyService.instance = new CurrencyService();
    }
    return CurrencyService.instance;
  }

  public async loadFromStore(storeId: string): Promise<void> {
    if (!storeId) return;
    try {
      const { getDB } = await import('../lib/db');
      const store = await getDB().stores.get(storeId);
      if (!store) {
        return;
      }

      const pref = (store.preferred_currency as CurrencyCode | undefined) ?? 'USD';
      this.preferredCurrency = pref;

      let accepted = (store.accepted_currencies as CurrencyCode[] | undefined)?.filter(Boolean) ?? [];
      if (!accepted.length) {
        accepted = pref === 'USD' ? ['USD'] : [pref, 'USD'];
      }

      const preferredFirst = accepted.includes(pref)
        ? [pref, ...accepted.filter(c => c !== pref)]
        : [pref, ...accepted];
      const seen = new Set<CurrencyCode>();
      this.acceptedCurrencies = preferredFirst.filter(c => {
        if (seen.has(c)) return false;
        seen.add(c);
        return true;
      });

      this.rates = { USD: 1 };
      const rate = store.exchange_rate;
      if (pref !== 'USD' && typeof rate === 'number' && rate > 0) {
        this.rates[pref] = rate;
      }
      this.isInitialized = true;
    } catch (error) {
      console.warn('CurrencyService.loadFromStore failed:', error);
    }
  }

  public convert(amount: number, from: CurrencyCode, to: CurrencyCode): number {
    if (from === to) return amount;
    if (!this.isInitialized) {
      throw new Error('CurrencyService not initialized');
    }

    const rateFrom = from === 'USD' ? 1 : this.rates[from];
    const rateTo = to === 'USD' ? 1 : this.rates[to];

    if (from !== 'USD' && (rateFrom === undefined || rateFrom <= 0)) {
      throw new Error(`No exchange rate available for ${from} → ${to}`);
    }
    if (to !== 'USD' && (rateTo === undefined || rateTo <= 0)) {
      throw new Error(`No exchange rate available for ${from} → ${to}`);
    }

    const amountUsd = from === 'USD' ? amount : amount / (rateFrom as number);
    return to === 'USD' ? amountUsd : amountUsd * (rateTo as number);
  }

  public format(amount: number, currency: CurrencyCode): string {
    const meta = CURRENCY_META[currency as keyof typeof CURRENCY_META];
    if (!meta) {
      if (!UNKNOWN_FORMAT_WARNED.has(currency)) {
        UNKNOWN_FORMAT_WARNED.add(currency);
        console.warn(`Unknown currency code for format: ${currency}`);
      }
      return new Intl.NumberFormat('en-US', {
        style: 'currency',
        currency: 'USD',
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
      }).format(amount);
    }
    return new Intl.NumberFormat(meta.locale, {
      style: 'currency',
      currency: meta.code,
      minimumFractionDigits: meta.decimals,
      maximumFractionDigits: meta.decimals,
    }).format(amount);
  }

  public getMeta(currency: CurrencyCode): CurrencyMeta {
    const meta = CURRENCY_META[currency as keyof typeof CURRENCY_META];
    if (!meta) {
      throw new Error(`Unknown currency: ${currency}`);
    }
    return meta;
  }

  public getAcceptedCurrencies(): CurrencyCode[] {
    return [...this.acceptedCurrencies];
  }

  public getPreferredCurrency(): CurrencyCode {
    return this.preferredCurrency;
  }

  public getExchangeRate(): number {
    if (!this.isInitialized) return 0;
    if (this.preferredCurrency === 'USD') return 1;
    const r = this.rates[this.preferredCurrency];
    return typeof r === 'number' && r > 0 ? r : 0;
  }

  public isReady(): boolean {
    return this.isInitialized;
  }
}

export const currencyService = CurrencyService.getInstance();
