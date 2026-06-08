import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { loginThrottleService } from '../loginThrottleService';

const EMAIL = 'user@test.com';
const FIVE_MIN = 5 * 60 * 1000;
const THIRTY_MIN = 30 * 60 * 1000;

/** Drive N consecutive failures, returning the last lock status. */
function failN(email: string, n: number) {
  let status = loginThrottleService.getStatus(email);
  for (let i = 0; i < n; i++) status = loginThrottleService.recordFailure(email);
  return status;
}

describe('loginThrottleService — progressive lockout', () => {
  beforeEach(() => {
    localStorage.clear();
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-06-07T00:00:00Z'));
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('does not lock for the first four failures', () => {
    for (let i = 0; i < 4; i++) {
      expect(loginThrottleService.recordFailure(EMAIL).locked).toBe(false);
    }
    expect(loginThrottleService.getStatus(EMAIL).locked).toBe(false);
  });

  it('locks for ~5 minutes on the 5th failure', () => {
    const s = failN(EMAIL, 5);
    expect(s.locked).toBe(true);
    expect(s.remainingMs).toBeGreaterThan(FIVE_MIN - 1000);
    expect(s.remainingMs).toBeLessThanOrEqual(FIVE_MIN);
  });

  it('reopens after the 5-min lock, allows 4 more, then locks 30 min on the 10th', () => {
    failN(EMAIL, 5);
    expect(loginThrottleService.getStatus(EMAIL).locked).toBe(true);

    vi.advanceTimersByTime(FIVE_MIN + 1000);
    expect(loginThrottleService.getStatus(EMAIL).locked).toBe(false);

    // Failures 6–9 do not lock.
    for (let i = 6; i <= 9; i++) {
      expect(loginThrottleService.recordFailure(EMAIL).locked).toBe(false);
    }
    // The 10th locks for ~30 minutes.
    const s = loginThrottleService.recordFailure(EMAIL);
    expect(s.locked).toBe(true);
    expect(s.remainingMs).toBeGreaterThan(THIRTY_MIN - 1000);
    expect(s.remainingMs).toBeLessThanOrEqual(THIRTY_MIN);
  });

  it('after 10, every further failure locks 30 minutes', () => {
    failN(EMAIL, 10);
    vi.advanceTimersByTime(THIRTY_MIN + 1000);

    const s11 = loginThrottleService.recordFailure(EMAIL);
    expect(s11.locked).toBe(true);
    expect(s11.remainingMs).toBeGreaterThan(THIRTY_MIN - 1000);

    vi.advanceTimersByTime(THIRTY_MIN + 1000);
    const s12 = loginThrottleService.recordFailure(EMAIL);
    expect(s12.locked).toBe(true);
  });

  it('reset clears the counter and any lock', () => {
    failN(EMAIL, 5);
    loginThrottleService.reset(EMAIL);
    expect(loginThrottleService.getStatus(EMAIL).locked).toBe(false);
    // Counter is back to zero: the next four failures must not lock.
    for (let i = 0; i < 4; i++) {
      expect(loginThrottleService.recordFailure(EMAIL).locked).toBe(false);
    }
  });

  it('is per-email — one account never locks another', () => {
    failN('a@test.com', 5);
    expect(loginThrottleService.getStatus('a@test.com').locked).toBe(true);
    expect(loginThrottleService.getStatus('b@test.com').locked).toBe(false);
  });

  it('normalises email case and surrounding whitespace', () => {
    failN('  User@Test.com ', 5);
    expect(loginThrottleService.getStatus('user@test.com').locked).toBe(true);
  });

  it('the lock persists across reloads (state lives in localStorage)', () => {
    failN(EMAIL, 5);
    // getStatus reads straight from localStorage, simulating a fresh page load.
    const s = loginThrottleService.getStatus(EMAIL);
    expect(s.locked).toBe(true);
    expect(s.until).toBeGreaterThan(Date.now());
  });
});
