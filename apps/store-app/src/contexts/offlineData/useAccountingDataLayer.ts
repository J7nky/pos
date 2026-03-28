/**
 * Accounting domain layer for OfflineDataContext (§1.3).
 * Owns journal entries, chart of accounts, balance snapshots state; hydrate only.
 * Journal creation/updates stay in context (journalService, transactionService).
 */

import { useState, useCallback } from 'react';
import type { AccountingDataLayerAdapter, AccountingDataLayerResult } from './types';

export function useAccountingDataLayer(_adapter: AccountingDataLayerAdapter): AccountingDataLayerResult {
  const [journalEntries, setJournalEntries] = useState<any[]>([]);
  const [chartOfAccounts, setChartOfAccounts] = useState<any[]>([]);
  const [balanceSnapshots, setBalanceSnapshots] = useState<any[]>([]);

  const hydrate = useCallback(
    (journalEntriesData: any[], chartOfAccountsData: any[], balanceSnapshotsData: any[]) => {
      setJournalEntries(journalEntriesData || []);
      setChartOfAccounts(chartOfAccountsData || []);
      setBalanceSnapshots(balanceSnapshotsData || []);
    },
    []
  );

  return {
    journalEntries,
    chartOfAccounts,
    balanceSnapshots,
    hydrate,
  };
}
