/**
 * Unified currency formatting utility
 * Handles both USD and LBP with optional symbol inclusion
 */

export interface CurrencyFormatOptions {
  includeSymbol?: boolean;
  locale?: string;
}

/**
 * Format currency amount with proper symbols and formatting
 * @param amount - The amount to format
 * @param currency - Currency type (USD or LBP)
 * @param includeSymbol - Whether to include currency symbol (default: true)
 * @param locale - Locale for number formatting (default: 'en-US')
 * @returns Formatted currency string
 */
export function formatCurrency(
  amount: number,
  currency: 'USD' | 'LBP',
  includeSymbol: boolean = true,
  locale: string = 'en-US'
): string {
  if (currency === 'USD') {
    const formatted = amount.toFixed(2);
    return includeSymbol ? `$${formatted}` : formatted;
  } else {
    // LBP - round to nearest integer and add thousand separators
    const rounded = Math.round(amount);
    const formatted = rounded.toLocaleString(locale);
    return includeSymbol ? `${formatted} ل.ل` : formatted;
  }
}

/**
 * Format currency for display in UI (always includes symbol)
 */
export function formatCurrencyDisplay(amount: number, currency: 'USD' | 'LBP'): string {
  return formatCurrency(amount, currency, true);
}

/**
 * Format currency for print (symbol only for balance columns)
 */
export function formatCurrencyForPrint(amount: number, currency: 'USD' | 'LBP', isBalanceColumn: boolean = false): string {
  return formatCurrency(amount, currency, isBalanceColumn);
}

/**
 * Parse currency string back to number
 */
export function parseCurrency(value: string): number {
  // Remove all non-numeric characters except decimal point and minus sign
  const cleaned = value.replace(/[^0-9.-]/g, '');
  const parsed = parseFloat(cleaned);
  return isNaN(parsed) ? 0 : parsed;
}
