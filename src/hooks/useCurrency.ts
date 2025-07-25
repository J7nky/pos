import { useOfflineData } from '../contexts/OfflineDataContext';

// Real conversion rate: 1 USD = 89,500 LBP
const USD_TO_LBP_RATE = 89500;

export function useCurrency() {
  const { currency } = useOfflineData();

  const formatCurrency = (amount: number): string => {
    if (amount == null || isNaN(amount)) {
      return currency === 'LBP' ? `0 ل.ل` : `$0`;
    }
    if (currency === 'LBP') {
      return `${amount.toLocaleString()} ل.ل`;
    }
    return `$${amount.toLocaleString()}`;
  };

  const formatCurrencyWithSymbol = (amount: number, curr: 'USD' | 'LBP'): string => {
    if (amount == null || isNaN(amount)) {
      return curr === 'LBP' ? `0 ل.ل` : `$0`;
    }
    if (curr === 'LBP') {
      return `${amount.toLocaleString()} ل.ل`;
    }
    return `$${amount.toLocaleString()}`;
  };

  const convertCurrency = (amount: number, fromCurrency: 'USD' | 'LBP', toCurrency: 'USD' | 'LBP'): number => {
    if (fromCurrency === toCurrency) return amount;
    
    if (fromCurrency === 'USD' && toCurrency === 'LBP') {
      return amount * USD_TO_LBP_RATE;
    }
    
    if (fromCurrency === 'LBP' && toCurrency === 'USD') {
      return amount / USD_TO_LBP_RATE;
    }
    
    return amount;
  };

  const getConvertedAmount = (amount: number, originalCurrency: 'USD' | 'LBP'): number => {
    return convertCurrency(amount, originalCurrency, currency);
  };
  const getCurrencySymbol = (): string => {
    return currency === 'LBP' ? 'ل.ل' : '$';
  };

  return {
    currency,
    formatCurrency,
    formatCurrencyWithSymbol,
    convertCurrency,
    getConvertedAmount,
    getCurrencySymbol
  };
}