import { useOfflineData } from '../contexts/OfflineDataContext';

export function useCurrency() {
  const { currency, exchangeRate } = useOfflineData();
  const USD_TO_LBP_RATE = exchangeRate || 89500; // Use store's exchange rate

  const formatCurrency = (amount: number, fromCurrency: 'USD' | 'LBP' = 'LBP'): string => {
    if (amount == null || isNaN(amount)) {
      return currency === 'LBP' ? `0 ل.ل` : `$0.00`;
    }
    
    // Convert from storage currency (LBP) to display currency if needed
    let displayAmount = amount;
    if (fromCurrency === 'LBP' && currency === 'USD') {
      displayAmount = amount / USD_TO_LBP_RATE;
    } else if (fromCurrency === 'USD' && currency === 'LBP') {
      displayAmount = amount * USD_TO_LBP_RATE;
    }
    
    if (currency === 'LBP') {
      return `${Math.round(displayAmount).toLocaleString()} ل.ل`;
    }
    return `$${displayAmount.toFixed(2)}`;
  };

  const formatCurrencyWithSymbol = (amount: number, curr: 'USD' | 'LBP'): string => {
    if (amount == null || isNaN(amount)) {
      return curr === 'LBP' ? `0 ل.ل` : `$0.00`;
    }
    if (curr === 'LBP') {
      return `${Math.round(amount).toLocaleString()} ل.ل`;
    }
    return `$${amount.toFixed(2)}`;
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