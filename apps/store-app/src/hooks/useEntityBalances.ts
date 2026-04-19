/**
 * Hook for fetching entity balances from journal entries.
 *
 * Balances are derived from journal entries (never from cached entity fields),
 * via `entityBalanceService`. Results are stored in the process-level
 * `entityBalanceCache` so navigating between pages does not trigger a refetch
 * on every mount. Writes that affect a balance MUST call `refreshBalance(id)`
 * or `refreshAll()` so the cache is invalidated and repopulated.
 */

import { useCallback, useEffect, useMemo, useState } from 'react';
import { entityBalanceService } from '../services/entityBalanceService';
import { entityBalanceCache, type EntityType } from '../services/entityBalanceCache';

export interface EntityBalanceData {
  entityId: string;
  USD: number;
  LBP: number;
  isLoading: boolean;
  error: string | null;
}

export interface UseEntityBalancesResult {
  balances: Map<string, EntityBalanceData>;
  isLoading: boolean;
  getBalance: (entityId: string, currency: 'USD' | 'LBP') => number;
  getBalances: (entityId: string) => { USD: number; LBP: number } | null;
  refreshBalance: (entityId: string) => Promise<void>;
  refreshAll: () => Promise<void>;
}

type FetchResult = { USD: number; LBP: number } | { error: string };

function isError(r: FetchResult): r is { error: string } {
  return (r as { error?: string }).error !== undefined;
}

async function fetchBalance(
  entityId: string,
  entityType: EntityType,
  useSnapshot: boolean,
  accountCode: '1200' | '2100',
): Promise<FetchResult> {
  try {
    const balance =
      entityType === 'employee'
        ? await entityBalanceService.getEmployeeBalances(entityId, useSnapshot)
        : await entityBalanceService.getEntityBalances(entityId, accountCode, useSnapshot);
    entityBalanceCache.set(entityType, entityId, { USD: balance.USD, LBP: balance.LBP });
    return { USD: balance.USD, LBP: balance.LBP };
  } catch (err) {
    return { error: err instanceof Error ? err.message : 'Failed to fetch balance' };
  }
}

/**
 * Hook to get balances for multiple entities.
 *
 * @param entityIds - Array of entity IDs to fetch balances for
 * @param entityType - Type of entities ('customer' | 'supplier' | 'employee')
 * @param useSnapshot - Whether to use snapshot optimization (default: true)
 */
export function useEntityBalances(
  entityIds: string[],
  entityType: EntityType = 'customer',
  useSnapshot: boolean = true,
): UseEntityBalancesResult {
  const [balances, setBalances] = useState<Map<string, EntityBalanceData>>(new Map());
  const [isLoading, setIsLoading] = useState(true);

  const accountCode: '1200' | '2100' =
    entityType === 'supplier' ? '2100' : '1200'; // employees also use 1200 as the primary code; the service combines 1200+2200 internally

  const idsKey = entityIds.join(',');

  // Initial load + refetch when ids / type change
  useEffect(() => {
    let cancelled = false;

    async function load() {
      if (entityIds.length === 0) {
        setBalances(new Map());
        setIsLoading(false);
        return;
      }

      const hits = new Map<string, EntityBalanceData>();
      const misses: string[] = [];
      for (const id of entityIds) {
        const cached = entityBalanceCache.get(entityType, id);
        if (cached) {
          hits.set(id, { entityId: id, USD: cached.USD, LBP: cached.LBP, isLoading: false, error: null });
        } else {
          misses.push(id);
        }
      }

      const seed = new Map(hits);
      for (const id of misses) {
        seed.set(id, { entityId: id, USD: 0, LBP: 0, isLoading: true, error: null });
      }
      if (cancelled) return;
      setBalances(seed);
      setIsLoading(misses.length > 0);

      if (misses.length === 0) return;

      const results = await Promise.all(
        misses.map(async (id) => ({ id, result: await fetchBalance(id, entityType, useSnapshot, accountCode) })),
      );
      if (cancelled) return;

      setBalances((prev) => {
        const next = new Map(prev);
        for (const { id, result } of results) {
          if (isError(result)) {
            next.set(id, { entityId: id, USD: 0, LBP: 0, isLoading: false, error: result.error });
          } else {
            next.set(id, { entityId: id, USD: result.USD, LBP: result.LBP, isLoading: false, error: null });
          }
        }
        return next;
      });
      setIsLoading(false);
    }

    void load();
    return () => {
      cancelled = true;
    };
  }, [idsKey, entityType, useSnapshot, accountCode]);

  // Subscribe so external invalidations/updates (e.g. another mounted hook
  // refreshing after a payment) propagate into our state.
  useEffect(() => {
    const unsubscribe = entityBalanceCache.subscribe(() => {
      setBalances((prev) => {
        const next = new Map(prev);
        let changed = false;
        for (const id of entityIds) {
          const cached = entityBalanceCache.get(entityType, id);
          if (cached) {
            const current = next.get(id);
            if (!current || current.USD !== cached.USD || current.LBP !== cached.LBP || current.error !== null) {
              next.set(id, { entityId: id, USD: cached.USD, LBP: cached.LBP, isLoading: false, error: null });
              changed = true;
            }
          }
          // Cache miss: leave current stale value in state; a future refresh
          // will repopulate. Swapping to 0 here would be worse UX.
        }
        return changed ? next : prev;
      });
    });
    return unsubscribe;
  }, [idsKey, entityType]);

  const getBalance = useMemo(
    () =>
      (entityId: string, currency: 'USD' | 'LBP'): number => {
        const b = balances.get(entityId);
        if (!b) return 0;
        return currency === 'USD' ? b.USD : b.LBP;
      },
    [balances],
  );

  const getBalances = useMemo(
    () =>
      (entityId: string): { USD: number; LBP: number } | null => {
        const b = balances.get(entityId);
        return b ? { USD: b.USD, LBP: b.LBP } : null;
      },
    [balances],
  );

  const refreshBalance = useCallback(
    async (entityId: string) => {
      entityBalanceCache.invalidate(entityType, entityId);
      const result = await fetchBalance(entityId, entityType, useSnapshot, accountCode);
      setBalances((prev) => {
        const next = new Map(prev);
        if (isError(result)) {
          const existing = next.get(entityId);
          next.set(entityId, {
            entityId,
            USD: existing?.USD ?? 0,
            LBP: existing?.LBP ?? 0,
            isLoading: false,
            error: result.error,
          });
        } else {
          next.set(entityId, { entityId, USD: result.USD, LBP: result.LBP, isLoading: false, error: null });
        }
        return next;
      });
    },
    [entityType, useSnapshot, accountCode],
  );

  const refreshAll = useCallback(async () => {
    if (entityIds.length === 0) return;
    setIsLoading(true);
    for (const id of entityIds) {
      entityBalanceCache.invalidate(entityType, id);
    }
    const results = await Promise.all(
      entityIds.map(async (id) => ({ id, result: await fetchBalance(id, entityType, useSnapshot, accountCode) })),
    );
    setBalances(() => {
      const next = new Map<string, EntityBalanceData>();
      for (const { id, result } of results) {
        if (isError(result)) {
          next.set(id, { entityId: id, USD: 0, LBP: 0, isLoading: false, error: result.error });
        } else {
          next.set(id, { entityId: id, USD: result.USD, LBP: result.LBP, isLoading: false, error: null });
        }
      }
      return next;
    });
    setIsLoading(false);
  }, [idsKey, entityType, useSnapshot, accountCode]);

  return { balances, isLoading, getBalance, getBalances, refreshBalance, refreshAll };
}

/**
 * Hook to get balance for a single entity.
 */
export function useEntityBalance(
  entityId: string | null,
  entityType: EntityType = 'customer',
  useSnapshot: boolean = true,
): EntityBalanceData & { refresh: () => Promise<void> } {
  const [balance, setBalance] = useState<EntityBalanceData>(() => {
    if (!entityId) {
      return { entityId: '', USD: 0, LBP: 0, isLoading: false, error: null };
    }
    const cached = entityBalanceCache.get(entityType, entityId);
    if (cached) {
      return { entityId, USD: cached.USD, LBP: cached.LBP, isLoading: false, error: null };
    }
    return { entityId, USD: 0, LBP: 0, isLoading: true, error: null };
  });

  const accountCode: '1200' | '2100' = entityType === 'supplier' ? '2100' : '1200';

  useEffect(() => {
    if (!entityId) {
      setBalance({ entityId: '', USD: 0, LBP: 0, isLoading: false, error: null });
      return;
    }

    let cancelled = false;

    const cached = entityBalanceCache.get(entityType, entityId);
    if (cached) {
      setBalance({ entityId, USD: cached.USD, LBP: cached.LBP, isLoading: false, error: null });
      return;
    }

    setBalance((prev) => ({ ...prev, entityId, isLoading: true, error: null }));
    void (async () => {
      const result = await fetchBalance(entityId, entityType, useSnapshot, accountCode);
      if (cancelled) return;
      if (isError(result)) {
        setBalance({ entityId, USD: 0, LBP: 0, isLoading: false, error: result.error });
      } else {
        setBalance({ entityId, USD: result.USD, LBP: result.LBP, isLoading: false, error: null });
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [entityId, entityType, useSnapshot, accountCode]);

  // Subscribe to cache updates for this entity
  useEffect(() => {
    if (!entityId) return;
    const unsubscribe = entityBalanceCache.subscribe(() => {
      const cached = entityBalanceCache.get(entityType, entityId);
      if (cached) {
        setBalance((prev) =>
          prev.USD === cached.USD && prev.LBP === cached.LBP && prev.error === null
            ? prev
            : { entityId, USD: cached.USD, LBP: cached.LBP, isLoading: false, error: null },
        );
      }
    });
    return unsubscribe;
  }, [entityId, entityType]);

  const refresh = useCallback(async () => {
    if (!entityId) return;
    entityBalanceCache.invalidate(entityType, entityId);
    setBalance((prev) => ({ ...prev, isLoading: true, error: null }));
    const result = await fetchBalance(entityId, entityType, useSnapshot, accountCode);
    if (isError(result)) {
      setBalance({ entityId, USD: 0, LBP: 0, isLoading: false, error: result.error });
    } else {
      setBalance({ entityId, USD: result.USD, LBP: result.LBP, isLoading: false, error: null });
    }
  }, [entityId, entityType, useSnapshot, accountCode]);

  return { ...balance, refresh };
}
