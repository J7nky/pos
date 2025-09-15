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
  private exchangeRates: Map<string, number> = new Map();
  private lastUpdate: string = '';

  private constructor() {
    this.initializeExchangeRates();
    this.loadExchangeRatesFromDatabase();
  }

  public static getInstance(): CurrencyService {
    if (!CurrencyService.instance) {
      CurrencyService.instance = new CurrencyService();
    }
    return CurrencyService.instance;
  }

  private initializeExchangeRates() {
    // Initialize with fixed rates as fallback
    this.exchangeRates.set('USD_LBP', 89500);
    this.exchangeRates.set('LBP_USD', 1 / 89500);
    this.exchangeRates.set('USD_USD', 1);
    this.exchangeRates.set('LBP_LBP', 1);
    this.lastUpdate = new Date().toISOString();
  }

  private async loadExchangeRatesFromDatabase() {
    try {
      const { db } = await import('../lib/db');
      const rates = await db.exchange_rates.toArray();
      
      // Update rates from database
      for (const rate of rates) {
        const rateKey = `${rate.from_currency}_${rate.to_currency}`;
        this.exchangeRates.set(rateKey, rate.rate);
      }
      
      if (rates.length > 0) {
        // Use the most recent update time
        const latestRate = rates.reduce((latest, current) => 
          new Date(current.updated_at) > new Date(latest.updated_at) ? current : latest
        );
        this.lastUpdate = latestRate.updated_at;
      }
      
      console.log(`💱 Loaded ${rates.length} exchange rates from database`);
    } catch (error) {
      console.warn('Failed to load exchange rates from database, using defaults:', error);
    }
  }

  public convertCurrency(
    amount: number, 
    fromCurrency: 'USD' | 'LBP', 
    toCurrency: 'USD' | 'LBP'
  ): number {
    if (amount === 0) return 0;
    if (fromCurrency === toCurrency) return amount;

    const rateKey = `${fromCurrency}_${toCurrency}`;
    const rate = this.exchangeRates.get(rateKey);
    
    if (!rate) {
      throw new Error(`Exchange rate not found for ${fromCurrency} to ${toCurrency}`);
    }

    return amount * rate;
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
    
    // Check database precision limits (max: 99,999,999.99)
    const MAX_DB_AMOUNT = 99999999.99;
    if (amount > MAX_DB_AMOUNT) {
      console.warn(`Amount ${amount} exceeds database precision limit of ${MAX_DB_AMOUNT}`);
      return false;
    }
    
    return true;
  }

  public getExchangeRate(fromCurrency: 'USD' | 'LBP', toCurrency: 'USD' | 'LBP'): number {
    const rateKey = `${fromCurrency}_${toCurrency}`;
    return this.exchangeRates.get(rateKey) || 1;
  }

  /**
   * Safely convert large amounts to fit database precision limits
   * Returns the converted amount and whether it was converted
   */
  public safeConvertForDatabase(amount: number, currency: 'USD' | 'LBP'): { amount: number; currency: 'USD' | 'LBP'; wasConverted: boolean } {
    const MAX_DB_AMOUNT = 99999999.99;
    const USD_TO_LBP_RATE = 89500;
    
    if (amount >= MAX_DB_AMOUNT) {
      return { amount, currency, wasConverted: false };
    }
    
    if (currency === 'USD') {
      // Convert  USD to LBP
      const convertedAmount = amount * USD_TO_LBP_RATE;
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

  public async updateExchangeRate(fromCurrency: 'USD' | 'LBP', toCurrency: 'USD' | 'LBP', rate: number): Promise<void> {
    const rateKey = `${fromCurrency}_${toCurrency}`;
    this.exchangeRates.set(rateKey, rate);
    this.lastUpdate = new Date().toISOString();
    
    // Update database
    try {
      const { db } = await import('../lib/db');
      const now = new Date().toISOString();
      
      // Check if rate already exists
      const existingRate = await db.exchange_rates
        .where(['from_currency', 'to_currency'])
        .equals([fromCurrency, toCurrency])
        .first();
      
      if (existingRate) {
        // Update existing rate
        await db.exchange_rates.update(existingRate.id, {
          rate,
          updated_at: now,
          _synced: false
        });
      } else {
        // Create new rate
        await db.exchange_rates.add({
          id: `rate_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
          from_currency: fromCurrency,
          to_currency: toCurrency,
          rate,
          created_at: now,
          updated_at: now,
          _synced: false
        });
      }
      
      console.log(`💱 Updated exchange rate ${rateKey}: ${rate}`);
    } catch (error) {
      console.error('Failed to update exchange rate in database:', error);
    }
  }

  public async refreshExchangeRates(): Promise<void> {
    await this.loadExchangeRatesFromDatabase();
  }

  public getLastUpdate(): string {
    return this.lastUpdate;
  }

  public getSupportedCurrencies(): CurrencyConfig[] {
    return [
      { code: 'USD', symbol: '$', name: 'US Dollar', exchangeRate: 1 },
      { code: 'LBP', symbol: 'ل.ل', name: 'Lebanese Pound', exchangeRate: 1/89500 }
    ];
  }
}

export const currencyService = CurrencyService.getInstance(); 