/**
 * Stable per-device / per-app-instance client identifier.
 *
 * Every event this client emits to `branch_event_log` is tagged with this id
 * (see `eventEmissionService.emitEvent`). The event stream uses it to skip
 * re-processing its OWN echoed events: when this device uploads a change it
 * already holds the resulting rows locally, so replaying the echo is pure
 * redundancy — and, worse, counting it as "processed" fires a full
 * `refreshData()` + cache-invalidation cascade after every sync (the
 * "app re-initializes from first load" slowness).
 *
 * Persisted in `localStorage` so it survives reloads on the same device.
 * Falls back to an in-memory id when storage is unavailable (private mode,
 * Electron edge cases, SSR). Other devices/instances get a different id, so
 * their events are still processed normally — this is multi-device safe.
 */

const STORAGE_KEY = 'pos:client-id';

let cachedId: string | null = null;

function generateId(): string {
  try {
    if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
      return crypto.randomUUID();
    }
  } catch {
    // fall through to non-crypto fallback
  }
  // Opaque tag only — non-crypto randomness is acceptable here.
  return `c_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
}

/**
 * Returns this client's stable id, creating and persisting one on first use.
 */
export function getClientId(): string {
  if (cachedId) return cachedId;

  try {
    if (typeof localStorage !== 'undefined') {
      const existing = localStorage.getItem(STORAGE_KEY);
      if (existing) {
        cachedId = existing;
        return cachedId;
      }
      const fresh = generateId();
      localStorage.setItem(STORAGE_KEY, fresh);
      cachedId = fresh;
      return cachedId;
    }
  } catch {
    // localStorage blocked — fall back to an in-memory id for this session.
  }

  cachedId = generateId();
  return cachedId;
}

/** Metadata key under which the origin client id is stamped on events. */
export const ORIGIN_CLIENT_METADATA_KEY = '__origin_client_id';
