import { useCallback, useEffect, useState } from 'react';
import {
  financialStatementService,
  type TrialBalanceFilters,
  type TrialBalanceReport,
} from '../services/financialStatementService';

export interface UseTrialBalanceResult {
  data: TrialBalanceReport | null;
  /** Populated only when filters.comparison is set. */
  comparison: TrialBalanceReport | null;
  isLoading: boolean;
  error: string | null;
  refresh: () => Promise<void>;
}

/**
 * Fetches a Trial Balance for the given filters. When `filters.comparison`
 * is set, the service is called twice in parallel — once for the primary
 * range and once for the comparison range — and both reports are returned.
 */
export function useTrialBalance(filters: TrialBalanceFilters): UseTrialBalanceResult {
  const [data, setData] = useState<TrialBalanceReport | null>(null);
  const [comparison, setComparison] = useState<TrialBalanceReport | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchData = useCallback(async () => {
    setIsLoading(true);
    setError(null);

    try {
      const primaryPromise = financialStatementService.getTrialBalance(filters);
      const comparisonPromise = filters.comparison
        ? financialStatementService.getTrialBalance({
            storeId: filters.storeId,
            branchId: filters.branchId,
            startDate: filters.comparison.startDate,
            endDate: filters.comparison.endDate,
            postedOnly: filters.postedOnly,
          })
        : Promise.resolve(null);

      const [primary, comparisonResult] = await Promise.all([
        primaryPromise,
        comparisonPromise,
      ]);

      setData(primary);
      setComparison(comparisonResult);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load trial balance');
      console.error('useTrialBalance: failed to load report', err);
    } finally {
      setIsLoading(false);
    }
  }, [
    filters.storeId,
    filters.branchId,
    filters.startDate,
    filters.endDate,
    filters.comparison?.startDate,
    filters.comparison?.endDate,
    filters.postedOnly,
  ]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const refresh = useCallback(async () => {
    await fetchData();
  }, [fetchData]);

  return { data, comparison, isLoading, error, refresh };
}
