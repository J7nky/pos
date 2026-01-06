/**
 * Hook for fetching entity balances from journal entries
 * 
 * This hook provides calculated balances for entities using journal-entry-based calculations.
 * Balances are derived from journal entries, not from cached entity fields.
 */

import { useState, useEffect, useMemo } from 'react';
import { entityBalanceService } from '../services/entityBalanceService';

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

/**
 * Hook to get balances for multiple entities
 * 
 * @param entityIds - Array of entity IDs to fetch balances for
 * @param entityType - Type of entities ('customer' | 'supplier' | 'employee')
 * @param useSnapshot - Whether to use snapshot optimization (default: true)
 * @returns Balance data and helper functions
 */
export function useEntityBalances(
  entityIds: string[],
  entityType: 'customer' | 'supplier' | 'employee' = 'customer',
  useSnapshot: boolean = true
): UseEntityBalancesResult {
  const [balances, setBalances] = useState<Map<string, EntityBalanceData>>(new Map());
  const [isLoading, setIsLoading] = useState(true);

  // Determine account code based on entity type
  const accountCode = entityType === 'supplier' ? '2100' : entityType === 'employee' ? '2200' : '1200';

  // Fetch balances for all entities
  useEffect(() => {
    let cancelled = false;

    async function fetchBalances() {
      if (entityIds.length === 0) {
        setIsLoading(false);
        return;
      }

      setIsLoading(true);
      const newBalances = new Map<string, EntityBalanceData>();

      // Initialize all entities with loading state
      for (const entityId of entityIds) {
        newBalances.set(entityId, {
          entityId,
          USD: 0,
          LBP: 0,
          isLoading: true,
          error: null
        });
      }

      setBalances(new Map(newBalances));

      // Fetch balances in parallel
      const balancePromises = entityIds.map(async (entityId) => {
        try {
          let balance;
          if (entityType === 'employee') {
            // Use employee-specific balance method
            console.log(`[USE_ENTITY_BALANCES] Fetching balance for employee: ${entityId}`);
            balance = await entityBalanceService.getEmployeeBalances(entityId, useSnapshot);
            console.log(`[USE_ENTITY_BALANCES] Balance result for employee ${entityId}:`, balance);
          } else {
            balance = await entityBalanceService.getEntityBalances(
              entityId,
              accountCode as '1200' | '2100',
              useSnapshot
            );
          }

          if (!cancelled) {
            newBalances.set(entityId, {
              entityId,
              USD: balance.USD,
              LBP: balance.LBP,
              isLoading: false,
              error: null
            });
          }
        } catch (error) {
          console.error(`[USE_ENTITY_BALANCES] Error fetching balance for ${entityId}:`, error);
          if (!cancelled) {
            newBalances.set(entityId, {
              entityId,
              USD: 0,
              LBP: 0,
              isLoading: false,
              error: error instanceof Error ? error.message : 'Failed to fetch balance'
            });
          }
        }
      });

      await Promise.all(balancePromises);

      if (!cancelled) {
        setBalances(new Map(newBalances));
        setIsLoading(false);
      }
    }

    fetchBalances();

    return () => {
      cancelled = true;
    };
  }, [entityIds.join(','), entityType, useSnapshot, accountCode]);

  // Helper function to get balance for a specific currency
  const getBalance = useMemo(() => {
    return (entityId: string, currency: 'USD' | 'LBP'): number => {
      const balanceData = balances.get(entityId);
      if (!balanceData) return 0;
      return currency === 'USD' ? balanceData.USD : balanceData.LBP;
    };
  }, [balances]);

  // Helper function to get both balances
  const getBalances = useMemo(() => {
    return (entityId: string): { USD: number; LBP: number } | null => {
      const balanceData = balances.get(entityId);
      if (!balanceData) return null;
      return { USD: balanceData.USD, LBP: balanceData.LBP };
    };
  }, [balances]);

  // Refresh a single entity's balance
  const refreshBalance = async (entityId: string) => {
    try {
      let balance;
      if (entityType === 'employee') {
        balance = await entityBalanceService.getEmployeeBalances(entityId, useSnapshot);
      } else {
        balance = await entityBalanceService.getEntityBalances(
          entityId,
          accountCode as '1200' | '2100',
          useSnapshot
        );
      }

      setBalances(prev => {
        const newMap = new Map(prev);
        newMap.set(entityId, {
          entityId,
          USD: balance.USD,
          LBP: balance.LBP,
          isLoading: false,
          error: null
        });
        return newMap;
      });
    } catch (error) {
      setBalances(prev => {
        const newMap = new Map(prev);
        const existing = newMap.get(entityId) || { entityId, USD: 0, LBP: 0, isLoading: false, error: null };
        newMap.set(entityId, {
          ...existing,
          isLoading: false,
          error: error instanceof Error ? error.message : 'Failed to refresh balance'
        });
        return newMap;
      });
    }
  };

  // Refresh all balances
  const refreshAll = async () => {
    setIsLoading(true);
    const newBalances = new Map<string, EntityBalanceData>();

    const balancePromises = entityIds.map(async (entityId) => {
      try {
        let balance;
        if (entityType === 'employee') {
          // Use employee-specific balance method
          balance = await entityBalanceService.getEmployeeBalances(entityId, useSnapshot);
        } else {
          balance = await entityBalanceService.getEntityBalances(
            entityId,
            accountCode as '1200' | '2100',
            useSnapshot
          );
        }

        newBalances.set(entityId, {
          entityId,
          USD: balance.USD,
          LBP: balance.LBP,
          isLoading: false,
          error: null
        });
      } catch (error) {
        newBalances.set(entityId, {
          entityId,
          USD: 0,
          LBP: 0,
          isLoading: false,
          error: error instanceof Error ? error.message : 'Failed to fetch balance'
        });
      }
    });

    await Promise.all(balancePromises);
    setBalances(newBalances);
    setIsLoading(false);
  };

  return {
    balances,
    isLoading,
    getBalance,
    getBalances,
    refreshBalance,
    refreshAll
  };
}

/**
 * Hook to get balance for a single entity
 * 
 * @param entityId - Entity ID
 * @param entityType - Type of entity
 * @param useSnapshot - Whether to use snapshot optimization
 * @returns Balance data
 */
export function useEntityBalance(
  entityId: string | null,
  entityType: 'customer' | 'supplier' | 'employee' = 'customer',
  useSnapshot: boolean = true
): EntityBalanceData & { refresh: () => Promise<void> } {
  const [balance, setBalance] = useState<EntityBalanceData>({
    entityId: entityId || '',
    USD: 0,
    LBP: 0,
    isLoading: true,
    error: null
  });

  const accountCode = entityType === 'supplier' ? '2100' : entityType === 'employee' ? '2200' : '1200';

  useEffect(() => {
    if (!entityId) {
      setBalance({
        entityId: '',
        USD: 0,
        LBP: 0,
        isLoading: false,
        error: null
      });
      return;
    }

    let cancelled = false;

    async function fetchBalance() {
      setBalance(prev => ({ ...prev, isLoading: true, error: null }));

      try {
        let result;
        if (entityType === 'employee') {
          // Use employee-specific balance method
          result = await entityBalanceService.getEmployeeBalances(entityId, useSnapshot);
        } else {
          result = await entityBalanceService.getEntityBalances(
            entityId,
            accountCode as '1200' | '2100',
            useSnapshot
          );
        }

        if (!cancelled) {
          setBalance({
            entityId,
            USD: result.USD,
            LBP: result.LBP,
            isLoading: false,
            error: null
          });
        }
      } catch (error) {
        if (!cancelled) {
          setBalance({
            entityId,
            USD: 0,
            LBP: 0,
            isLoading: false,
            error: error instanceof Error ? error.message : 'Failed to fetch balance'
          });
        }
      }
    }

    fetchBalance();

    return () => {
      cancelled = true;
    };
  }, [entityId, entityType, useSnapshot, accountCode]);

  const refresh = async () => {
    if (!entityId) return;

    setBalance(prev => ({ ...prev, isLoading: true, error: null }));

    try {
      let result;
      if (entityType === 'employee') {
        // Use employee-specific balance method
        result = await entityBalanceService.getEmployeeBalances(entityId, useSnapshot);
      } else {
        result = await entityBalanceService.getEntityBalances(
          entityId,
          accountCode as '1200' | '2100',
          useSnapshot
        );
      }

      setBalance({
        entityId,
        USD: result.USD,
        LBP: result.LBP,
        isLoading: false,
        error: null
      });
    } catch (error) {
      setBalance({
        entityId,
        USD: 0,
        LBP: 0,
        isLoading: false,
        error: error instanceof Error ? error.message : 'Failed to refresh balance'
      });
    }
  };

  return {
    ...balance,
    refresh
  };
}

