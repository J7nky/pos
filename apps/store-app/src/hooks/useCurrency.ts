import { useOfflineData } from '../contexts/OfflineDataContext';
import { currencyService } from '../services/currencyService';
import type { CurrencyCode } from '@pos-platform/shared';

export function useCurrency() {
  const { acceptedCurrencies, preferredCurrency, formatAmount, exchangeRate, currency } = useOfflineData();

  const formatCurrency = (amount: number, fromCurrency: CurrencyCode = 'LBP'): string =>
    formatAmount(currencyService.convert(amount, fromCurrency, preferredCurrency), preferredCurrency);

  const formatCurrencyWithSymbol = (amount: number, curr: CurrencyCode): string => formatAmount(amount, curr);

  const convertCurrency = (amount: number, from: CurrencyCode, to: CurrencyCode): number =>
    currencyService.convert(amount, from, to);

  const getConvertedAmount = (amount: number, originalCurrency: CurrencyCode): number =>
    currencyService.convert(amount, originalCurrency, preferredCurrency);

  const getCurrencySymbol = (): string => currencyService.getMeta(preferredCurrency).symbol;

  return {
    currency,
    preferredCurrency,
    acceptedCurrencies,
    formatCurrency,
    formatCurrencyWithSymbol,
    formatAmount,
    convertCurrency,
    getConvertedAmount,
    getCurrencySymbol,
    exchangeRate,
  };
}
