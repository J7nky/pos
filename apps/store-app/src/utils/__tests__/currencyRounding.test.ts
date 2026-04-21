import { describe, it, expect } from 'vitest';
import { roundHalfEven } from '../currencyRounding';

describe('roundHalfEven', () => {
  it('LBP 0 decimals: 16.5 -> 16, 17.5 -> 18', () => {
    expect(roundHalfEven(16.5, 0)).toBe(16);
    expect(roundHalfEven(17.5, 0)).toBe(18);
  });

  it('USD 2 decimals', () => {
    expect(roundHalfEven(16.759776, 2)).toBe(16.76);
    expect(roundHalfEven(16.745, 2)).toBe(16.74);
  });

  it('JOD 3 decimals: 0.1235 -> 0.124', () => {
    expect(roundHalfEven(0.1235, 3)).toBe(0.124);
  });

  it('negative and zero', () => {
    expect(roundHalfEven(-16.5, 0)).toBe(-16);
    expect(roundHalfEven(0, 2)).toBe(0);
  });
});
