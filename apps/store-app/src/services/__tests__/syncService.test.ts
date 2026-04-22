/**
 * Feature 016 / T036: verify syncService.ensureStoreExists implements the
 * fallback chain defined in contracts/sync-fallbacks.contract.md §2:
 *   supabaseRow.preferred_currency / accepted_currencies / country (explicit fields)
 *   → getDefaultCurrenciesForCountry(country)
 *   → throw (no literal currency substitution)
 *
 * ensureStoreExists is a private method; we enforce the contract with a
 * combination of source-level invariants and behavioural checks on the
 * country-defaults helper it delegates to.
 */

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { getDefaultCurrenciesForCountry } from '@pos-platform/shared';

const SRC_PATH = resolve(__dirname, '../syncService.ts');
const SRC = readFileSync(SRC_PATH, 'utf-8');

function extractEnsureStoreExists(): string {
  const start = SRC.indexOf('private async ensureStoreExists');
  expect(start).toBeGreaterThan(-1);
  // Find the matching closing brace for the method by counting.
  let depth = 0;
  let i = SRC.indexOf('{', start);
  const bodyStart = i;
  for (; i < SRC.length; i++) {
    const c = SRC[i];
    if (c === '{') depth++;
    else if (c === '}') {
      depth--;
      if (depth === 0) return SRC.slice(bodyStart, i + 1);
    }
  }
  throw new Error('ensureStoreExists end not found');
}

describe('syncService.ensureStoreExists — no literal currency fallback (T036, T038)', () => {
  const body = extractEnsureStoreExists();

  it('contains no hardcoded `preferred_currency: \'USD\'` assignment', () => {
    expect(body).not.toMatch(/preferred_currency\s*:\s*['"]USD['"]/);
  });

  it('contains no hardcoded `preferred_currency: \'LBP\'` assignment', () => {
    expect(body).not.toMatch(/preferred_currency\s*:\s*['"]LBP['"]/);
  });

  it('contains no `|| \'USD\'` / `|| \'LBP\'` fallback anywhere in the method', () => {
    expect(body).not.toMatch(/\|\|\s*['"]USD['"]/);
    expect(body).not.toMatch(/\|\|\s*['"]LBP['"]/);
  });

  it('contains no `?? \'USD\'` / `?? \'LBP\'` fallback anywhere in the method', () => {
    expect(body).not.toMatch(/\?\?\s*['"]USD['"]/);
    expect(body).not.toMatch(/\?\?\s*['"]LBP['"]/);
  });

  it('uses getDefaultCurrenciesForCountry as the country-fallback bridge', () => {
    expect(body).toMatch(/getDefaultCurrenciesForCountry\s*\(/);
  });

  it('reads accepted_currencies from the remote row before falling back', () => {
    expect(body).toMatch(/accepted_currencies/);
  });

  it('throws when no currency data is derivable (neither row fields nor country)', () => {
    expect(body).toMatch(/throw\s+new\s+Error\s*\(/);
  });

  it('emits a structured error log via comprehensiveLoggingService.error before the throw', () => {
    expect(body).toMatch(/comprehensiveLoggingService\.error/);
  });
});

describe('syncService.ts top-level — getDefaultCurrenciesForCountry imported', () => {
  it('imports the country-defaults helper from @pos-platform/shared', () => {
    expect(SRC).toMatch(
      /import\s+\{[^}]*getDefaultCurrenciesForCountry[^}]*\}\s+from\s+['"]@pos-platform\/shared['"]/
    );
  });
});

describe('getDefaultCurrenciesForCountry — behavioural contract used by ensureStoreExists', () => {
  it('LB → ["LBP", "USD"]', () => {
    expect(getDefaultCurrenciesForCountry('LB')).toEqual(['LBP', 'USD']);
  });

  it('AE → ["AED", "USD"]', () => {
    expect(getDefaultCurrenciesForCountry('AE')).toEqual(['AED', 'USD']);
  });

  it('US → ["USD"]', () => {
    expect(getDefaultCurrenciesForCountry('US')).toEqual(['USD']);
  });

  it('unknown country falls back to ["USD"] (the helper default — still no literal in syncService itself)', () => {
    expect(getDefaultCurrenciesForCountry('XX')).toEqual(['USD']);
  });
});
