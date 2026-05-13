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

import type { CurrencyCode } from '@pos-platform/shared';

export type EntityType = 'customer' | 'supplier' | 'employee';

export interface CachedBalance {
  /** Per-currency balance map (primary surface). */
  byCurrency: Partial<Record<CurrencyCode, number>>;
  /** Legacy USD shortcut equal to `byCurrency.USD ?? 0`. */
  USD: number;
  /** Legacy LBP shortcut equal to `byCurrency.LBP ?? 0`. */
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
    if (!entry) return undefined;
    return {
      byCurrency: { ...entry.byCurrency },
      USD: entry.USD,
      LBP: entry.LBP,
    };
  },

  /**
   * Accepts either the new `{ byCurrency, USD?, LBP? }` shape or the legacy
   * `{ USD, LBP }` shape. When `byCurrency` is missing it is derived from
   * the USD/LBP fields (zeros are pruned).
   */
  set(
    entityType: EntityType,
    entityId: string,
    value: { byCurrency?: Partial<Record<CurrencyCode, number>>; USD?: number; LBP?: number },
  ): void {
    const byCurrency: Partial<Record<CurrencyCode, number>> = value.byCurrency
      ? { ...value.byCurrency }
      : {};
    if (!value.byCurrency) {
      if (typeof value.USD === 'number' && value.USD !== 0) byCurrency.USD = value.USD;
      if (typeof value.LBP === 'number' && value.LBP !== 0) byCurrency.LBP = value.LBP;
    }
    const usd = byCurrency.USD ?? value.USD ?? 0;
    const lbp = byCurrency.LBP ?? value.LBP ?? 0;
    store.set(key(entityType, entityId), {
      byCurrency,
      USD: usd,
      LBP: lbp,
      fetchedAt: Date.now(),
    });
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
