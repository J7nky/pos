export function formatNumber(value: number, options?: Intl.NumberFormatOptions): string {
  return new Intl.NumberFormat(undefined, { numberingSystem: 'latn', ...options }).format(value);
}

export function formatDateTime(value: Date | string | number, options?: Intl.DateTimeFormatOptions): string {
  const d = value instanceof Date ? value : new Date(value);
  return new Intl.DateTimeFormat(undefined, { dateStyle: 'short', timeStyle: 'medium', numberingSystem: 'latn', ...options }).format(d);
}

export function formatTime(value: Date | string | number, options?: Intl.DateTimeFormatOptions): string {
  const d = value instanceof Date ? value : new Date(value);
  return new Intl.DateTimeFormat(undefined, { timeStyle: 'medium', numberingSystem: 'latn', ...options }).format(d);
}
