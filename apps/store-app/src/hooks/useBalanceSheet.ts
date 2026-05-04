import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  financialStatementService,
  type BalanceSheetReport,
} from '../services/financialStatementService';
import { getTodayLocalDate } from '../utils/dateUtils';

type UseBalanceSheetParams = {
  storeId: string;
  branchId?: string;
  asOfDate?: string;
  hideZeroBalanceAccounts?: boolean;
};

export function useBalanceSheet(params: UseBalanceSheetParams) {
  const [report, setReport] = useState<BalanceSheetReport | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const filters = useMemo(
    () => ({
      storeId: params.storeId,
      branchId: params.branchId,
      asOfDate: params.asOfDate ?? getTodayLocalDate(),
      hideZeroBalanceAccounts: params.hideZeroBalanceAccounts ?? true,
    }),
    [params.storeId, params.branchId, params.asOfDate, params.hideZeroBalanceAccounts],
  );

  const regenerate = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const nextReport = await financialStatementService.getBalanceSheet(filters);
      setReport(nextReport);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load balance sheet');
    } finally {
      setIsLoading(false);
    }
  }, [filters]);

  useEffect(() => {
    regenerate();
  }, [regenerate]);

  return { report, isLoading, error, regenerate };
}

