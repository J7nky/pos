/**
 * Feature 016 / T035: verify syncDownload emits structured `warn` and no literal
 * currency fallbacks when a store row is absent during conflict resolution.
 *
 * The target function `resolveCashDrawerAccountConflict` is not exported; these
 * tests therefore operate on the source file contents — a regression gate that
 * enforces the contract from `contracts/sync-fallbacks.contract.md §1`.
 */

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const SRC_PATH = resolve(__dirname, '../syncDownload.ts');
const SRC = readFileSync(SRC_PATH, 'utf-8');

describe('syncDownload.ts — no literal currency fallbacks (T035, T037)', () => {
  it('contains no `|| \'LBP\'` fallback', () => {
    expect(SRC).not.toMatch(/\|\|\s*['"]LBP['"]/);
  });

  it('contains no `?? \'LBP\'` fallback', () => {
    expect(SRC).not.toMatch(/\?\?\s*['"]LBP['"]/);
  });

  it('contains no `|| \'USD\'` fallback', () => {
    expect(SRC).not.toMatch(/\|\|\s*['"]USD['"]/);
  });

  it('contains no `?? \'USD\'` fallback', () => {
    expect(SRC).not.toMatch(/\?\?\s*['"]USD['"]/);
  });
});

describe('syncDownload.ts — structured warn on missing store (T035)', () => {
  it('emits comprehensiveLoggingService.warn with reason: "store-row-absent"', () => {
    expect(SRC).toMatch(/comprehensiveLoggingService\.warn/);
    expect(SRC).toMatch(/reason:\s*['"]store-row-absent['"]/);
  });

  it('emits comprehensiveLoggingService.warn with action: "skip"', () => {
    expect(SRC).toMatch(/action:\s*['"]skip['"]/);
  });

  it('warn payload carries operation name prefixed with "syncDownload."', () => {
    expect(SRC).toMatch(/operation:\s*['"]syncDownload\./);
  });

  it('at least two distinct warn call sites exist (the two plan lines 72 and 101)', () => {
    const matches = SRC.match(/comprehensiveLoggingService\.warn\(/g) ?? [];
    expect(matches.length).toBeGreaterThanOrEqual(2);
  });
});
