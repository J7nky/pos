import { useOfflineData } from '../contexts/OfflineDataContext';
import { currencyService } from '../services/currencyService';
import type { CurrencyCode } from '@pos-platform/shared';

export function useCurrency() {
  const { acceptedCurrencies, preferredCurrency, formatAmount, exchangeRate, currency } = useOfflineData();

  const formatCurrency = (amount: number, fromCurrency?: CurrencyCode): string => {
    const from = fromCurrency ?? preferredCurrency;
    if (from === preferredCurrency) {
      return formatAmount(amount, preferredCurrency);
    }
    if (!currencyService.canConvert(from, preferredCurrency)) {
      return formatAmount(amount, preferredCurrency);
    }
    return formatAmount(currencyService.convert(amount, from, preferredCurrency), preferredCurrency);
  };

  const formatCurrencyWithSymbol = (amount: number, curr: CurrencyCode): string => formatAmount(amount, curr);

  const convertCurrency = (amount: number, from: CurrencyCode, to: CurrencyCode): number =>
    currencyService.safeConvert(amount, from, to);

  const getConvertedAmount = (amount: number, originalCurrency: CurrencyCode): number =>
    currencyService.safeConvert(amount, originalCurrency, preferredCurrency);

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
