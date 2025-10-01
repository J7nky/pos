export interface CurrencyConfig {
  code: 'USD' | 'LBP';
  symbol: string;
  name: string;
  exchangeRate: number; // Rate relative to USD
}

export interface CurrencyConversion {
  fromAmount: number;
  fromCurrency: 'USD' | 'LBP';
  toAmount: number;
  toCurrency: 'USD' | 'LBP';
  exchangeRate: number;
  timestamp: string;
}

export class CurrencyService {
  private static instance: CurrencyService;
  private exchangeRate: number = 89500; // Default USD to LBP rate
  private lastUpdate: string = '';
  private isInitialized: boolean = false;

  private constructor() {
    // Don't load on construction - wait for storeId to be provided
  }

  public static getInstance(): CurrencyService {
    if (!CurrencyService.instance) {
      CurrencyService.instance = new CurrencyService();
    }
    return CurrencyService.instance;
  }

  private async loadExchangeRateFromStore(storeId: string): Promise<void> {
    if (!storeId) {
      return; // Silently return if no storeId provided
    }
    
    try {
      const { db } = await import('../lib/db');
      const store = await db.stores.get(storeId);
      if (store && store.exchange_rate) {
        this.exchangeRate = store.exchange_rate;
        this.lastUpdate = store.updated_at;
        this.isInitialized = true;
      }
    } catch (error) {
      console.warn('Could not load exchange rate from store, using default:', error);
    }
  }

  public async updateExchangeRate(storeId: string, rate: number): Promise<void> {
    try {
      this.exchangeRate = rate;
      this.lastUpdate = new Date().toISOString();
      
      // Update the store's exchange rate
      const { db } = await import('../lib/db');
      await db.stores.update(storeId, { 
        exchange_rate: rate,
        updated_at: this.lastUpdate,
        _synced: false
      });
    } catch (error) {
      console.error('Failed to update exchange rate:', error);
      throw error;
    }
  }

  public convertCurrency(
    amount: number, 
    fromCurrency: 'USD' | 'LBP', 
    toCurrency: 'USD' | 'LBP'
  ): number {
    if (amount === 0) return 0;
    if (fromCurrency === toCurrency) return amount;

    if (fromCurrency === 'USD' && toCurrency === 'LBP') {
      return amount * this.exchangeRate;
    } else if (fromCurrency === 'LBP' && toCurrency === 'USD') {
      return amount / this.exchangeRate;
    }

    throw new Error(`Unsupported currency conversion: ${fromCurrency} to ${toCurrency}`);
  }

  public formatCurrency(amount: number, currency: 'USD' | 'LBP'): string {
    if (currency === 'USD') {
      return new Intl.NumberFormat('en-US', {
        style: 'currency',
        currency: 'USD',
        minimumFractionDigits: 2,
        maximumFractionDigits: 2
      }).format(amount);
    } else {
      return new Intl.NumberFormat('ar-LB', {
        style: 'currency',
        currency: 'LBP',
        minimumFractionDigits: 0,
        maximumFractionDigits: 0
      }).format(amount);
    }
  }

  public formatCurrencyWithSymbol(amount: number, currency: 'USD' | 'LBP'): string {
    const symbols = { USD: '$', LBP: 'ل.ل' };
    return `${symbols[currency]}${amount.toLocaleString()}`;
  }

  public getConvertedAmount(amount: number, currency: 'USD' | 'LBP'): number {
    return this.convertCurrency(amount, currency, 'USD');
  }

  public validateCurrencyAmount(amount: number, currency: 'USD' | 'LBP'): boolean {
    if (isNaN(amount) || !isFinite(amount)) return false;
    if (amount < 0) return false;
    
    // Additional validation for LBP (no decimals)
    if (currency === 'LBP' && amount % 1 !== 0) return false;
    
  
    return true;
  }

  public getExchangeRate(): number {
    return this.exchangeRate;
  }

  /**
   * Safely convert large amounts to fit database precision limits
   * Returns the converted amount and whether it was converted
   */
  public safeConvertForDatabase(amount: number, currency: 'USD' | 'LBP'): { amount: number; currency: 'USD' | 'LBP'; wasConverted: boolean } {
    

    
    if (currency === 'USD') {
      // Convert USD to LBP
      const convertedAmount = amount * this.exchangeRate;
      return { 
        amount: Math.round(convertedAmount * 100) / 100, // Round to 2 decimal places
        currency: 'LBP', 
        wasConverted: true 
      };
    } else {
      return { 
        amount: amount, 
        currency: 'LBP', 
        wasConverted: true 
      };
    }
  }

  public getLastUpdate(): string {
    return this.lastUpdate;
  }

  public getSupportedCurrencies(): CurrencyConfig[] {
    return [
      { code: 'USD', symbol: '$', name: 'US Dollar', exchangeRate: 1 },
      { code: 'LBP', symbol: 'ل.ل', name: 'Lebanese Pound', exchangeRate: 1/this.exchangeRate }
    ];
  }

  // Method to refresh exchange rate from store
  public async refreshExchangeRate(storeId: string): Promise<void> {
    await this.loadExchangeRateFromStore(storeId);
  }
}

export const currencyService = CurrencyService.getInstance();