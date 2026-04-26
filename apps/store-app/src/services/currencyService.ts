import type { CurrencyCode, CurrencyMeta } from '@pos-platform/shared';
import { CURRENCY_META } from '@pos-platform/shared';

const UNKNOWN_FORMAT_WARNED = new Set<string>();

export class MissingExchangeRateError extends Error {
  readonly from: CurrencyCode;
  readonly to: CurrencyCode;

  constructor(from: CurrencyCode, to: CurrencyCode, message?: string) {
    super(message ?? `No exchange rate available for ${from} → ${to}`);
    this.name = 'MissingExchangeRateError';
    this.from = from;
    this.to = to;
  }
}

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

      // Phase 10: hydrate the rates map from the new exchange_rates JSONB,
      // falling back to the legacy scalar exchange_rate for the primary
      // local currency when the map is empty (older synced rows).
      this.rates = { USD: 1 };
      const ratesMap = (store as { exchange_rates?: Partial<Record<CurrencyCode, number>> }).exchange_rates;
      if (ratesMap && typeof ratesMap === 'object') {
        for (const [code, value] of Object.entries(ratesMap)) {
          if (typeof value === 'number' && value > 0 && code !== 'USD') {
            this.rates[code as CurrencyCode] = value;
          }
        }
      }
      const legacyRate = store.exchange_rate;
      if (pref !== 'USD' && this.rates[pref] === undefined && typeof legacyRate === 'number' && legacyRate > 0) {
        this.rates[pref] = legacyRate;
      }
      this.isInitialized = true;
    } catch (error) {
      console.warn('CurrencyService.loadFromStore failed:', error);
    }
  }

  /**
   * Returns a defensive copy of the active per-currency rates map (units-per-USD).
   * USD is always included as 1.
   */
  public getRates(): Partial<Record<CurrencyCode, number>> {
    return { ...this.rates };
  }

  /**
   * Returns the rate for `currency` (units of `currency` per 1 USD), or undefined
   * if no rate is loaded. USD always returns 1.
   */
  public getRate(currency: CurrencyCode): number | undefined {
    if (currency === 'USD') return 1;
    return this.rates[currency];
  }

  /**
   * In-memory rate update (call after a Dexie write so subsequent
   * conversions use the new rate without a full reload).
   */
  public setRate(currency: CurrencyCode, rate: number): void {
    if (currency === 'USD') return;
    if (rate > 0) this.rates[currency] = rate;
    else delete this.rates[currency];
  }

  public convert(amount: number, from: CurrencyCode, to: CurrencyCode): number {
    if (from === to) return amount;
    if (!this.isInitialized) {
      throw new Error('CurrencyService not initialized');
    }

    const rateFrom = from === 'USD' ? 1 : this.rates[from];
    const rateTo = to === 'USD' ? 1 : this.rates[to];

    if (from !== 'USD' && (rateFrom === undefined || rateFrom <= 0)) {
      throw new MissingExchangeRateError(from, to);
    }
    if (to !== 'USD' && (rateTo === undefined || rateTo <= 0)) {
      throw new MissingExchangeRateError(from, to);
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
