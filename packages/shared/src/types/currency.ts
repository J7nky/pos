export type CurrencyCode =
  | 'USD'
  | 'LBP'
  | 'EUR'
  | 'GBP'
  | 'SAR'
  | 'AED'
  | 'EGP'
  | 'JOD'
  | 'SYP'
  | 'IQD'
  | 'TRY'
  | 'MAD'
  | 'TND'
  | 'DZD'
  | 'LYD'
  | 'SDG'
  | 'YER'
  | 'KWD'
  | 'BHD'
  | 'QAR'
  | 'OMR';

export interface CurrencyMeta {
  code: CurrencyCode;
  name: string;
  symbol: string;
  decimals: number;
  locale: string;
}

export const CURRENCY_META: Record<CurrencyCode, CurrencyMeta> = {
  USD: { code: 'USD', name: 'US Dollar', symbol: '$', decimals: 2, locale: 'en-US' },
  LBP: { code: 'LBP', name: 'Lebanese Pound', symbol: 'ل.ل', decimals: 0, locale: 'ar-LB' },
  EUR: { code: 'EUR', name: 'Euro', symbol: '€', decimals: 2, locale: 'en-DE' },
  GBP: { code: 'GBP', name: 'British Pound', symbol: '£', decimals: 2, locale: 'en-GB' },
  SAR: { code: 'SAR', name: 'Saudi Riyal', symbol: '﷼', decimals: 2, locale: 'ar-SA' },
  AED: { code: 'AED', name: 'UAE Dirham', symbol: 'د.إ', decimals: 2, locale: 'ar-AE' },
  EGP: { code: 'EGP', name: 'Egyptian Pound', symbol: 'E£', decimals: 2, locale: 'ar-EG' },
  JOD: { code: 'JOD', name: 'Jordanian Dinar', symbol: 'JD', decimals: 3, locale: 'ar-JO' },
  SYP: { code: 'SYP', name: 'Syrian Pound', symbol: 'S£', decimals: 0, locale: 'ar-SY' },
  IQD: { code: 'IQD', name: 'Iraqi Dinar', symbol: 'ع.د', decimals: 0, locale: 'ar-IQ' },
  TRY: { code: 'TRY', name: 'Turkish Lira', symbol: '₺', decimals: 2, locale: 'tr-TR' },
  MAD: { code: 'MAD', name: 'Moroccan Dirham', symbol: 'MAD', decimals: 2, locale: 'fr-MA' },
  TND: { code: 'TND', name: 'Tunisian Dinar', symbol: 'DT', decimals: 3, locale: 'ar-TN' },
  DZD: { code: 'DZD', name: 'Algerian Dinar', symbol: 'دج', decimals: 2, locale: 'ar-DZ' },
  LYD: { code: 'LYD', name: 'Libyan Dinar', symbol: 'LD', decimals: 3, locale: 'ar-LY' },
  SDG: { code: 'SDG', name: 'Sudanese Pound', symbol: 'ج.س', decimals: 2, locale: 'ar-SD' },
  YER: { code: 'YER', name: 'Yemeni Rial', symbol: '﷼', decimals: 0, locale: 'ar-YE' },
  KWD: { code: 'KWD', name: 'Kuwaiti Dinar', symbol: 'KD', decimals: 3, locale: 'ar-KW' },
  BHD: { code: 'BHD', name: 'Bahraini Dinar', symbol: 'BD', decimals: 3, locale: 'ar-BH' },
  QAR: { code: 'QAR', name: 'Qatari Riyal', symbol: 'QR', decimals: 2, locale: 'ar-QA' },
  OMR: { code: 'OMR', name: 'Omani Rial', symbol: 'RO', decimals: 3, locale: 'ar-OM' },
};
