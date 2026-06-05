/**
 * Display helpers for the audit-log viewer. Audit rows store raw DB column
 * paths and arbitrary old/new values; these turn them into readable strings.
 * Pure (no React/i18n) so both the timeline page and the per-entity panel
 * share one formatting source.
 */

import { getTranslatedString, type SupportedLanguage } from './multilingual';

/** `customer_data.credit_limit` → `Customer Data › Credit Limit`. */
export function humanizeField(field: string): string {
  return field
    .split('.')
    .map((part) =>
      part
        .replace(/_/g, ' ')
        .replace(/\b\w/g, (c) => c.toUpperCase())
        .trim()
    )
    .join(' › ');
}

/**
 * Render an audit `old`/`new` value for display. Returns `null` for nullish or
 * empty values so the caller can substitute a localized "(empty)" marker.
 * Multilingual `{ en, ar }` objects resolve to the active language.
 */
export function formatAuditValue(value: unknown, language: SupportedLanguage): string | null {
  if (value === null || value === undefined || value === '') return null;
  if (typeof value === 'boolean') return value ? '✓' : '✗';
  if (typeof value === 'number') return String(value);
  if (typeof value === 'string') return value;

  if (typeof value === 'object') {
    const obj = value as Record<string, unknown>;
    // Multilingual string objects.
    if (typeof obj.en === 'string' || typeof obj.ar === 'string' || typeof obj.fr === 'string') {
      return getTranslatedString(obj as Record<SupportedLanguage, string>, language) || null;
    }
    // Per-currency / generic maps: render as compact key: value pairs.
    try {
      const entries = Object.entries(obj).filter(([, v]) => v !== null && v !== undefined);
      if (entries.length === 0) return null;
      return entries.map(([k, v]) => `${k}: ${String(v)}`).join(', ');
    } catch {
      return JSON.stringify(value);
    }
  }
  return String(value);
}
