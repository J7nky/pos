/**
 * Process-level cache for entity balances.
 *
 * Backs `useEntityBalances` so navigating between pages does not refetch the
 * same balances on every mount. Entries survive component unmounts and are
 * shared across all consumers of the hook.
 *
 * Invalidation is explicit — write paths that change journal entries for an
 * entity call `invalidate(entityType, entityId)` (e.g. after a payment posts).
 * The cache does not auto-expire; `useStoreSwitchLifecycle` reloads the whole
 * page on store change, which clears this cache for free.
 */

export type EntityType = 'customer' | 'supplier' | 'employee';

export interface CachedBalance {
  USD: number;
  LBP: number;
}

interface CacheEntry extends CachedBalance {
  fetchedAt: number;
}

const store = new Map<string, CacheEntry>();
const subscribers = new Set<() => void>();

function key(entityType: EntityType, entityId: string): string {
  return `${entityType}:${entityId}`;
}

function notify(): void {
  for (const fn of subscribers) {
    try {
      fn();
    } catch (err) {
      console.error('[entityBalanceCache] subscriber threw:', err);
    }
  }
}

export const entityBalanceCache = {
  get(entityType: EntityType, entityId: string): CachedBalance | undefined {
    const entry = store.get(key(entityType, entityId));
    return entry ? { USD: entry.USD, LBP: entry.LBP } : undefined;
  },

  set(entityType: EntityType, entityId: string, value: CachedBalance): void {
    store.set(key(entityType, entityId), { ...value, fetchedAt: Date.now() });
    notify();
  },

  invalidate(entityType: EntityType, entityId: string): boolean {
    const removed = store.delete(key(entityType, entityId));
    if (removed) notify();
    return removed;
  },

  invalidateAll(): void {
    if (store.size === 0) return;
    store.clear();
    notify();
  },

  subscribe(fn: () => void): () => void {
    subscribers.add(fn);
    return () => {
      subscribers.delete(fn);
    };
  },

  /** @internal — test-only. */
  _reset(): void {
    store.clear();
    subscribers.clear();
  },

  /** @internal — test-only. */
  _size(): number {
    return store.size;
  },
};
