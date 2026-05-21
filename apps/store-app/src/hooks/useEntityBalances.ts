/**
 * Hook for fetching entity balances from journal entries.
 *
 * Balances are derived from journal entries (never from cached entity fields),
 * via `entityBalanceService`. Results are stored in the process-level
 * `entityBalanceCache` so navigating between pages does not trigger a refetch
 * on every mount. Writes that affect a balance MUST call `refreshBalance(id)`
 * or `refreshAll()` so the cache is invalidated and repopulated.
 *
 * Currency-agnostic: each balance row carries a per-currency `byCurrency`
 * map. Legacy USD/LBP fields are kept as shortcuts for older callers.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { entityBalanceService } from '../services/entityBalanceService';
import { entityBalanceCache, type EntityType } from '../services/entityBalanceCache';
import type { CurrencyCode } from '@pos-platform/shared';

type CurrencyTotals = Partial<Record<CurrencyCode, number>>;

export interface EntityBalanceData {
  entityId: string;
  /** Per-currency balance map. */
  byCurrency: CurrencyTotals;
  /** Legacy USD shortcut. */
  USD: number;
  /** Legacy LBP shortcut. */
  LBP: number;
  isLoading: boolean;
  error: string | null;
}

export interface UseEntityBalancesResult {
  balances: Map<string, EntityBalanceData>;
  isLoading: boolean;
  /** Read a single currency from an entity's balance map (defaults to 0). */
  getBalance: (entityId: string, currency: CurrencyCode) => number;
  /** Read the full per-currency map for an entity (null if unknown). */
  getBalances: (entityId: string) => CurrencyTotals | null;
  refreshBalance: (entityId: string) => Promise<void>;
  refreshAll: () => Promise<void>;
}

type FetchResult =
  | { byCurrency: CurrencyTotals; USD: number; LBP: number }
  | { error: string };

function isError(r: FetchResult): r is { error: string } {
  return (r as { error?: string }).error !== undefined;
}

function emptyRow(entityId: string, isLoading = false, error: string | null = null): EntityBalanceData {
  return { entityId, byCurrency: {}, USD: 0, LBP: 0, isLoading, error };
}

function rowFromMap(entityId: string, byCurrency: CurrencyTotals): EntityBalanceData {
  return {
    entityId,
    byCurrency: { ...byCurrency },
    USD: byCurrency.USD ?? 0,
    LBP: byCurrency.LBP ?? 0,
    isLoading: false,
    error: null,
  };
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

    const byCurrency = { ...balance.byCurrency };
    entityBalanceCache.set(entityType, entityId, {
      byCurrency,
      USD: byCurrency.USD ?? 0,
      LBP: byCurrency.LBP ?? 0,
    });
    return {
      byCurrency,
      USD: byCurrency.USD ?? 0,
      LBP: byCurrency.LBP ?? 0,
    };
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

      setIsLoading(true);

      const hits = new Map<string, EntityBalanceData>();
      const misses: string[] = [];
      for (const id of entityIds) {
        const cached = entityBalanceCache.get(entityType, id);
        if (cached) {
          hits.set(id, rowFromMap(id, cached.byCurrency));
        } else {
          misses.push(id);
        }
      }

      const seed = new Map<string, EntityBalanceData>(hits);
      for (const id of misses) {
        seed.set(id, emptyRow(id, true));
      }
      if (!cancelled) setBalances(seed);

      const results = await Promise.all(
        misses.map(id =>
          fetchBalance(id, entityType, useSnapshot, accountCode).then(r => ({ id, r })),
        ),
      );

      if (!cancelled) {
        setBalances(prev => {
          const next = new Map(prev);
          for (const { id, r } of results) {
            if (isError(r)) {
              next.set(id, emptyRow(id, false, r.error));
            } else {
              next.set(id, rowFromMap(id, r.byCurrency));
            }
          }
          return next;
        });
        setIsLoading(false);
      }
    }

    void load();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [idsKey, entityType, useSnapshot]);

  // Subscribe to cache invalidations for any of these IDs
  const idsRef = useRef(entityIds);
  idsRef.current = entityIds;

  useEffect(() => {
    const unsubscribe = entityBalanceCache.subscribe(() => {
      // When any cache change happens, refresh local state for our ids:
      // for each id, if cache has an entry, use it; otherwise refetch.
      const refresh = async () => {
        const idsNow = idsRef.current;
        const next = new Map(balances);

        const refetchIds: string[] = [];
        for (const id of idsNow) {
          const cached = entityBalanceCache.get(entityType, id);
          if (cached) {
            const current = next.get(id);
            if (
              !current ||
              current.USD !== cached.USD ||
              current.LBP !== cached.LBP ||
              current.error !== null
            ) {
              next.set(id, rowFromMap(id, cached.byCurrency));
            }
          } else {
            refetchIds.push(id);
          }
        }

        if (refetchIds.length === 0) {
          setBalances(next);
          return;
        }

        // Mark refetching ids as loading
        for (const id of refetchIds) {
          const existing = next.get(id);
          next.set(id, { ...emptyRow(id, true), USD: existing?.USD ?? 0, LBP: existing?.LBP ?? 0, byCurrency: { ...(existing?.byCurrency ?? {}) } });
        }
        setBalances(next);

        const results = await Promise.all(
          refetchIds.map(id =>
            fetchBalance(id, entityType, useSnapshot, accountCode).then(r => ({ id, r })),
          ),
        );

        setBalances(prev => {
          const next2 = new Map(prev);
          for (const { id, r } of results) {
            const existing = next2.get(id);
            if (isError(r)) {
              next2.set(id, {
                entityId: id,
                byCurrency: existing?.byCurrency ?? {},
                USD: existing?.USD ?? 0,
                LBP: existing?.LBP ?? 0,
                isLoading: false,
                error: r.error,
              });
            } else {
              next2.set(id, rowFromMap(id, r.byCurrency));
            }
          }
          return next2;
        });
      };
      void refresh();
    });
    return unsubscribe;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [entityType, useSnapshot, accountCode]);

  const getBalance = useCallback(
    (entityId: string, currency: CurrencyCode): number => {
      const b = balances.get(entityId);
      if (!b) return 0;
      return b.byCurrency[currency] ?? 0;
    },
    [balances],
  );

  const getBalances = useCallback(
    (entityId: string): CurrencyTotals | null => {
      const b = balances.get(entityId);
      return b ? { ...b.byCurrency } : null;
    },
    [balances],
  );

  const refreshBalance = useCallback(
    async (entityId: string): Promise<void> => {
      entityBalanceCache.invalidate(entityType, entityId);
      const result = await fetchBalance(entityId, entityType, useSnapshot, accountCode);
      setBalances(prev => {
        const next = new Map(prev);
        if (isError(result)) {
          const existing = next.get(entityId);
          next.set(entityId, {
            entityId,
            byCurrency: existing?.byCurrency ?? {},
            USD: existing?.USD ?? 0,
            LBP: existing?.LBP ?? 0,
            isLoading: false,
            error: result.error,
          });
        } else {
          next.set(entityId, rowFromMap(entityId, result.byCurrency));
        }
        return next;
      });
    },
    [entityType, useSnapshot, accountCode],
  );

  const refreshAll = useCallback(async (): Promise<void> => {
    if (entityIds.length === 0) return;
    setIsLoading(true);
    // Single batched invalidate — fires one notify() instead of N. Without
    // this, every subscriber's refresh logic would re-run N times during
    // this call, each time kicking off another fan-out of fetchBalance.
    entityBalanceCache.invalidateMany(entityType, entityIds);
    const results = await Promise.all(
      entityIds.map(id =>
        fetchBalance(id, entityType, useSnapshot, accountCode).then(r => ({ id, r })),
      ),
    );
    setBalances(prev => {
      const next = new Map(prev);
      for (const { id, r } of results) {
        if (isError(r)) {
          next.set(id, emptyRow(id, false, r.error));
        } else {
          next.set(id, rowFromMap(id, r.byCurrency));
        }
      }
      return next;
    });
    setIsLoading(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [idsKey, entityType, useSnapshot, accountCode]);

  return useMemo(
    () => ({
      balances,
      isLoading,
      getBalance,
      getBalances,
      refreshBalance,
      refreshAll,
    }),
    [balances, isLoading, getBalance, getBalances, refreshBalance, refreshAll],
  );
}

/**
 * Hook to get balance for a single entity.
 */
export function useEntityBalance(
  entityId: string | null | undefined,
  entityType: EntityType = 'customer',
  useSnapshot: boolean = true,
): EntityBalanceData {
  const [balance, setBalance] = useState<EntityBalanceData>(() => {
    if (!entityId) return emptyRow('');
    const cached = entityBalanceCache.get(entityType, entityId);
    if (cached) return rowFromMap(entityId, cached.byCurrency);
    return { ...emptyRow(entityId, true) };
  });

  const accountCode: '1200' | '2100' =
    entityType === 'supplier' ? '2100' : '1200';

  useEffect(() => {
    let cancelled = false;
    async function load() {
      if (!entityId) {
        setBalance(emptyRow(''));
        return;
      }

      const cached = entityBalanceCache.get(entityType, entityId);
      if (cached) {
        setBalance(rowFromMap(entityId, cached.byCurrency));
        return;
      }

      setBalance({ ...emptyRow(entityId, true) });
      const result = await fetchBalance(entityId, entityType, useSnapshot, accountCode);
      if (!cancelled) {
        if (isError(result)) {
          setBalance(emptyRow(entityId, false, result.error));
        } else {
          setBalance(rowFromMap(entityId, result.byCurrency));
        }
      }
    }
    void load();
    return () => {
      cancelled = true;
    };
  }, [entityId, entityType, useSnapshot, accountCode]);

  // Subscribe to cache changes for this id
  useEffect(() => {
    if (!entityId) return;
    return entityBalanceCache.subscribe(() => {
      const cached = entityBalanceCache.get(entityType, entityId);
      if (cached) {
        setBalance(prev =>
          prev.USD === cached.USD && prev.LBP === cached.LBP && prev.error === null
            ? prev
            : rowFromMap(entityId, cached.byCurrency),
        );
      } else {
        // Cache miss after invalidate → refetch
        void (async () => {
          const result = await fetchBalance(entityId, entityType, useSnapshot, accountCode);
          setBalance(
            isError(result)
              ? emptyRow(entityId, false, result.error)
              : rowFromMap(entityId, result.byCurrency),
          );
        })();
      }
    });
  }, [entityId, entityType, useSnapshot, accountCode]);

  const refresh = useCallback(async () => {
    if (!entityId) return;
    entityBalanceCache.invalidate(entityType, entityId);
    const result = await fetchBalance(entityId, entityType, useSnapshot, accountCode);
    if (isError(result)) {
      setBalance(emptyRow(entityId, false, result.error));
    } else {
      setBalance(rowFromMap(entityId, result.byCurrency));
    }
  }, [entityId, entityType, useSnapshot, accountCode]);

  return useMemo(
    () => ({
      ...balance,
      refresh,
    }) as EntityBalanceData & { refresh: () => Promise<void> },
    [balance, refresh],
  );
}
