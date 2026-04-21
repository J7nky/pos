import type { CurrencyCode } from './currency';

export interface CountryConfig {
  code: string;
  name: string;
  localCurrency: CurrencyCode;
  defaultCurrencies: CurrencyCode[];
}

export const COUNTRY_CONFIGS: CountryConfig[] = [
  { code: 'LB', name: 'Lebanon', localCurrency: 'LBP', defaultCurrencies: ['LBP', 'USD'] },
  { code: 'US', name: 'United States', localCurrency: 'USD', defaultCurrencies: ['USD'] },
  { code: 'GB', name: 'United Kingdom', localCurrency: 'GBP', defaultCurrencies: ['GBP', 'USD'] },
  { code: 'DE', name: 'Germany', localCurrency: 'EUR', defaultCurrencies: ['EUR', 'USD'] },
  { code: 'FR', name: 'France', localCurrency: 'EUR', defaultCurrencies: ['EUR', 'USD'] },
  { code: 'SA', name: 'Saudi Arabia', localCurrency: 'SAR', defaultCurrencies: ['SAR', 'USD'] },
  { code: 'AE', name: 'UAE', localCurrency: 'AED', defaultCurrencies: ['AED', 'USD'] },
  { code: 'EG', name: 'Egypt', localCurrency: 'EGP', defaultCurrencies: ['EGP', 'USD'] },
  { code: 'JO', name: 'Jordan', localCurrency: 'JOD', defaultCurrencies: ['JOD', 'USD'] },
  { code: 'SY', name: 'Syria', localCurrency: 'SYP', defaultCurrencies: ['SYP', 'USD'] },
  { code: 'IQ', name: 'Iraq', localCurrency: 'IQD', defaultCurrencies: ['IQD', 'USD'] },
  { code: 'TR', name: 'Turkey', localCurrency: 'TRY', defaultCurrencies: ['TRY', 'USD'] },
  { code: 'MA', name: 'Morocco', localCurrency: 'MAD', defaultCurrencies: ['MAD', 'USD'] },
  { code: 'TN', name: 'Tunisia', localCurrency: 'TND', defaultCurrencies: ['TND', 'USD'] },
  { code: 'DZ', name: 'Algeria', localCurrency: 'DZD', defaultCurrencies: ['DZD', 'USD'] },
  { code: 'LY', name: 'Libya', localCurrency: 'LYD', defaultCurrencies: ['LYD', 'USD'] },
  { code: 'SD', name: 'Sudan', localCurrency: 'SDG', defaultCurrencies: ['SDG', 'USD'] },
  { code: 'YE', name: 'Yemen', localCurrency: 'YER', defaultCurrencies: ['YER', 'USD'] },
  { code: 'KW', name: 'Kuwait', localCurrency: 'KWD', defaultCurrencies: ['KWD', 'USD'] },
  { code: 'BH', name: 'Bahrain', localCurrency: 'BHD', defaultCurrencies: ['BHD', 'USD'] },
  { code: 'QA', name: 'Qatar', localCurrency: 'QAR', defaultCurrencies: ['QAR', 'USD'] },
  { code: 'OM', name: 'Oman', localCurrency: 'OMR', defaultCurrencies: ['OMR', 'USD'] },
];

export const COUNTRY_MAP: Record<string, CountryConfig> = Object.fromEntries(
  COUNTRY_CONFIGS.map((c) => [c.code, c]),
);

export function getDefaultCurrenciesForCountry(countryCode: string): CurrencyCode[] {
  return COUNTRY_MAP[countryCode]?.defaultCurrencies ?? ['USD'];
}
