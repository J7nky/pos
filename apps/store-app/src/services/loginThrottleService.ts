/**
 * loginThrottleService — client-side, per-email failed-login throttling.
 *
 * Progressive lockout policy:
 *   • 5 consecutive failures             → 5-minute lockout
 *   • 5 more failures (10 total)         → 30-minute lockout
 *   • every further failure (11, 12, …)  → 30-minute lockout
 * The counter only resets on a successful sign-in.
 *
 * State lives in localStorage keyed by normalised email, so it survives page
 * reloads and works fully offline — the lockout is evaluated before either the
 * Supabase or the local-auth attempt, so it holds whether or not there's a
 * network.
 *
 * Scope is per-EMAIL, not per-device: a shared POS terminal serves many users,
 * so one account's failures must never lock another out. This is a UX /
 * defense-in-depth layer — a determined attacker can clear localStorage, so
 * server-side rate limiting (Supabase) remains the authoritative protection.
 */

const STORAGE_PREFIX = 'login_throttle_';

// Cumulative failed-attempt thresholds and their lockout durations.
const TIER1_AT = 5; //  5th failure →
const TIER1_LOCK_MS = 5 * 60 * 1000; //  5 minutes
const TIER2_AT = 10; // 10th failure (and every failure after) →
const TIER2_LOCK_MS = 30 * 60 * 1000; // 30 minutes

interface ThrottleState {
  failedCount: number;
  /** Epoch ms until which sign-in is blocked; 0 = not locked. */
  lockedUntil: number;
}

export interface LockStatus {
  locked: boolean;
  /** Epoch ms when the lock lifts (null when not locked). */
  until: number | null;
  /** Milliseconds remaining (0 when not locked). */
  remainingMs: number;
}

const NOT_LOCKED: LockStatus = { locked: false, until: null, remainingMs: 0 };

class LoginThrottleService {
  private keyFor(email: string): string {
    return STORAGE_PREFIX + email.trim().toLowerCase();
  }

  private read(email: string): ThrottleState {
    try {
      const raw = localStorage.getItem(this.keyFor(email));
      if (!raw) return { failedCount: 0, lockedUntil: 0 };
      const parsed = JSON.parse(raw) as Partial<ThrottleState>;
      return {
        failedCount: typeof parsed.failedCount === 'number' ? parsed.failedCount : 0,
        lockedUntil: typeof parsed.lockedUntil === 'number' ? parsed.lockedUntil : 0,
      };
    } catch {
      return { failedCount: 0, lockedUntil: 0 };
    }
  }

  private write(email: string, state: ThrottleState): void {
    try {
      localStorage.setItem(this.keyFor(email), JSON.stringify(state));
    } catch {
      // Storage unavailable (private mode / quota) — throttling silently degrades.
    }
  }

  /** Current lock status for an email. Pure read — does not mutate state. */
  getStatus(email: string): LockStatus {
    if (!email) return NOT_LOCKED;
    const { lockedUntil } = this.read(email);
    const remainingMs = lockedUntil - Date.now();
    if (lockedUntil && remainingMs > 0) {
      return { locked: true, until: lockedUntil, remainingMs };
    }
    return NOT_LOCKED;
  }

  /**
   * Record one failed sign-in attempt and return the resulting lock status.
   * Call ONLY for genuine auth failures — NOT for attempts that were rejected
   * because the account was already locked (those must not inflate the counter).
   */
  recordFailure(email: string): LockStatus {
    if (!email) return NOT_LOCKED;
    const prev = this.read(email);
    const failedCount = prev.failedCount + 1;

    let lockMs = 0;
    if (failedCount >= TIER2_AT) {
      lockMs = TIER2_LOCK_MS; // 10th failure and every one after → 30 min
    } else if (failedCount === TIER1_AT) {
      lockMs = TIER1_LOCK_MS; // exactly the 5th failure → 5 min
    }

    // Attempts 6–9 (between tiers) carry no new lock. Never shorten an already
    // active lock, though — keep the later of any new lock and the existing one.
    const newLock = lockMs > 0 ? Date.now() + lockMs : 0;
    const existingActive = prev.lockedUntil > Date.now() ? prev.lockedUntil : 0;
    const lockedUntil = Math.max(newLock, existingActive);
    this.write(email, { failedCount, lockedUntil });

    return lockedUntil > 0
      ? { locked: true, until: lockedUntil, remainingMs: lockedUntil - Date.now() }
      : NOT_LOCKED;
  }

  /** Clear all throttle state for an email after a successful sign-in. */
  reset(email: string): void {
    if (!email) return;
    try {
      localStorage.removeItem(this.keyFor(email));
    } catch {
      // ignore
    }
  }
}

export const loginThrottleService = new LoginThrottleService();
