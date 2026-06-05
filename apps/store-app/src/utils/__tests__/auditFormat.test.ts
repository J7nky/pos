import { describe, it, expect } from 'vitest';
import { humanizeField, formatAuditValue } from '../auditFormat';

describe('humanizeField', () => {
  it('title-cases a snake_case column', () => {
    expect(humanizeField('preferred_currency')).toBe('Preferred Currency');
  });
  it('renders a dotted path with a separator', () => {
    expect(humanizeField('customer_data.credit_limit')).toBe('Customer Data › Credit Limit');
  });
  it('handles a single word', () => {
    expect(humanizeField('phone')).toBe('Phone');
  });
});

describe('formatAuditValue', () => {
  it('returns null for nullish/empty so the caller can show "(empty)"', () => {
    expect(formatAuditValue(null, 'en')).toBeNull();
    expect(formatAuditValue(undefined, 'en')).toBeNull();
    expect(formatAuditValue('', 'en')).toBeNull();
  });
  it('passes through scalars', () => {
    expect(formatAuditValue('Apple', 'en')).toBe('Apple');
    expect(formatAuditValue(120, 'en')).toBe('120');
  });
  it('renders booleans as check/cross marks', () => {
    expect(formatAuditValue(true, 'en')).toBe('✓');
    expect(formatAuditValue(false, 'en')).toBe('✗');
  });
  it('resolves a multilingual object to the active language', () => {
    expect(formatAuditValue({ en: 'Apple', ar: 'تفاح' }, 'ar')).toBe('تفاح');
    expect(formatAuditValue({ en: 'Apple', ar: 'تفاح' }, 'en')).toBe('Apple');
  });
  it('renders a per-currency map as compact key: value pairs', () => {
    expect(formatAuditValue({ USD: 50, LBP: 12000 }, 'en')).toBe('USD: 50, LBP: 12000');
  });
});
