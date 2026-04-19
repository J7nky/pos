/**
 * Hook for fetching entity balances from journal entries.
 *
 * Balances are derived from journal entries (never from cached entity fields),
 * via `entityBalanceService`. Results are stored in the process-level
 * `entityBalanceCache` so navigating between pages does not trigger a refetch
 * on every mount. Writes that affect a balance MUST call `refreshBalance(id)`
 * or `refreshAll()` so the cache is invalidated and repopulated.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
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

  // Ref so the subscription closure always sees current fetch params
  // without needing to be recreated when useSnapshot/accountCode change.
  const fetchParamsRef = useRef({ entityIds, entityType, useSnapshot, accountCode });
  fetchParamsRef.current = { entityIds, entityType, useSnapshot, accountCode };

  // Subscribe so external invalidations/updates (e.g. undo, another mounted hook
  // refreshing after a payment) propagate into our state.
  useEffect(() => {
    const unsubscribe = entityBalanceCache.subscribe(() => {
      const { entityIds: ids, entityType: type, useSnapshot: snap, accountCode: ac } = fetchParamsRef.current;
      const toRefetch: string[] = [];

      setBalances((prev) => {
        const next = new Map(prev);
        let changed = false;
        for (const id of ids) {
          const cached = entityBalanceCache.get(type, id);
          if (cached) {
            const current = next.get(id);
            if (!current || current.USD !== cached.USD || current.LBP !== cached.LBP || current.error !== null) {
              next.set(id, { entityId: id, USD: cached.USD, LBP: cached.LBP, isLoading: false, error: null });
              changed = true;
            }
          } else {
            // Cache miss after a notification means the entry was invalidated.
            // If we have a non-loading balance for this entity, schedule a re-fetch.
            const current = prev.get(id);
            if (current && !current.isLoading) {
              next.set(id, { ...current, isLoading: true });
              toRefetch.push(id);
              changed = true;
            }
          }
        }
        return changed ? next : prev;
      });

      if (toRefetch.length > 0) {
        void Promise.all(
          toRefetch.map(async (id) => ({ id, result: await fetchBalance(id, type, snap, ac) })),
        ).then((results) => {
          setBalances((prev) => {
            const next = new Map(prev);
            for (const { id, result } of results) {
              if (isError(result)) {
                const existing = prev.get(id);
                next.set(id, { entityId: id, USD: existing?.USD ?? 0, LBP: existing?.LBP ?? 0, isLoading: false, error: result.error });
              } else {
                next.set(id, { entityId: id, USD: result.USD, LBP: result.LBP, isLoading: false, error: null });
              }
            }
            return next;
          });
        });
      }
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

  // Ref so the subscription closure always sees the current fetch params.
  const singleFetchParamsRef = useRef({ entityId, entityType, useSnapshot, accountCode });
  singleFetchParamsRef.current = { entityId, entityType, useSnapshot, accountCode };

  // Subscribe to cache updates for this entity
  useEffect(() => {
    if (!entityId) return;
    const unsubscribe = entityBalanceCache.subscribe(() => {
      const { entityId: eid, entityType: type, useSnapshot: snap, accountCode: ac } = singleFetchParamsRef.current;
      if (!eid) return;
      const cached = entityBalanceCache.get(type, eid);
      if (cached) {
        setBalance((prev) =>
          prev.USD === cached.USD && prev.LBP === cached.LBP && prev.error === null
            ? prev
            : { entityId: eid, USD: cached.USD, LBP: cached.LBP, isLoading: false, error: null },
        );
      } else {
        // Cache miss after notification: entry was invalidated — re-fetch.
        setBalance((prev) => {
          if (prev.isLoading) return prev; // already fetching
          void fetchBalance(eid, type, snap, ac).then((result) => {
            setBalance(
              isError(result)
                ? { entityId: eid, USD: 0, LBP: 0, isLoading: false, error: result.error }
                : { entityId: eid, USD: result.USD, LBP: result.LBP, isLoading: false, error: null },
            );
          });
          return { ...prev, isLoading: true, error: null };
        });
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
