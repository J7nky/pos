/**
 * Cash drawer domain layer for OfflineDataContext (§1.3).
 * Owns cashDrawer state, refreshCashDrawerStatus, open/close, and getters.
 */

import { useState, useCallback } from 'react';
import { getDB } from '../../lib/db';
import { calculateCashDrawerBalance } from '../../utils/balanceCalculation';
import type { CashDrawerDataLayerAdapter, CashDrawerDataLayerResult } from './types';

export function useCashDrawerDataLayer(adapter: CashDrawerDataLayerAdapter): CashDrawerDataLayerResult {
  const {
    storeId,
    currentBranchId,
    currency,
    exchangeRate,
    pushUndo,
    updateUnsyncedCount,
    resetAutoSyncTimer,
    debouncedSync,
  } = adapter;

  const [cashDrawer, setCashDrawer] = useState<any>(null);

  const refreshCashDrawerStatus = useCallback(async () => {
    if (!storeId || !currentBranchId) return;

    try {
      const status = await getDB().getCurrentCashDrawerStatus(storeId, currentBranchId);
      if (status && status.status === 'active') {
        setCashDrawer({
          id: status.sessionId,
          accountId: status.accountId,
          status: 'open',
          currentBalance: status.currentBalance,
          currency: currency,
          lastUpdated: new Date().toISOString(),
        });
      } else {
        setCashDrawer(null);
      }
    } catch (error) {
      console.error('Error refreshing cash drawer status:', error);
    }
  }, [storeId, currentBranchId, currency]);

  const openCashDrawer = useCallback(
    async (amount: number, openedBy: string) => {
      if (!storeId || !currentBranchId) return;

      try {
        const { cashDrawerUpdateService } = await import('../../services/cashDrawerUpdateService');
        const result = await cashDrawerUpdateService.openCashDrawerSession(
          storeId,
          currentBranchId,
          amount,
          openedBy
        );

        if (!result.success) {
          throw new Error(result.error || 'Failed to open cash drawer session');
        }

        const account = await getDB().getCashDrawerAccount(storeId, currentBranchId);
        if (!account) {
          throw new Error('Failed to retrieve cash drawer account after opening session');
        }

        setCashDrawer({
          id: result.sessionId!,
          accountId: account.id,
          status: 'open',
          currentBalance: amount,
          currency: (account as any).currency,
          lastUpdated: new Date().toISOString(),
        });

        await refreshCashDrawerStatus();

        if (typeof window !== 'undefined') {
          window.dispatchEvent(
            new CustomEvent('cash-drawer-updated', {
              detail: { storeId, event: 'opened' },
            })
          );
        }

        pushUndo({
          type: 'open_cash_drawer',
          affected: [
            { table: 'cash_drawer_sessions', id: result.sessionId! },
            { table: 'cash_drawer_accounts', id: account.id },
          ],
          steps: [
            { op: 'delete', table: 'cash_drawer_sessions', id: result.sessionId! },
            { op: 'update', table: 'cash_drawer_accounts', id: account.id, changes: { _synced: false } },
          ],
        });

        await updateUnsyncedCount();
        resetAutoSyncTimer();
        debouncedSync();
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Failed to open cash drawer session';
        console.error('Error opening cash drawer:', message);
        throw new Error(message);
      }
    },
    [
      storeId,
      currentBranchId,
      refreshCashDrawerStatus,
      pushUndo,
      updateUnsyncedCount,
      resetAutoSyncTimer,
      debouncedSync,
    ]
  );

  const closeCashDrawer = useCallback(
    async (actualAmount: number, closedBy: string, notes?: string) => {
      if (!cashDrawer?.id) return;

      try {
        const session = await getDB().cash_drawer_sessions.get(cashDrawer.id);
        if (!session) return;

        if (!storeId || !currentBranchId) return;
        const account = await getDB().getCashDrawerAccount(storeId, currentBranchId);
        if (!account) return;

        await getDB().closeCashDrawerSession(cashDrawer.id, actualAmount, closedBy, notes);

        setCashDrawer(null);

        pushUndo({
          type: 'close_cash_drawer',
          affected: [
            { table: 'cash_drawer_sessions', id: cashDrawer.id },
            { table: 'cash_drawer_accounts', id: account.id },
          ],
          steps: [
            {
              op: 'update',
              table: 'cash_drawer_sessions',
              id: cashDrawer.id,
              changes: {
                status: 'open',
                closed_at: null,
                closed_by: null,
                expected_amount: null,
                actual_amount: null,
                variance: null,
                _synced: false,
              },
            },
            { op: 'update', table: 'cash_drawer_accounts', id: account.id, changes: { _synced: false } },
          ],
        });

        await updateUnsyncedCount();
        resetAutoSyncTimer();
        debouncedSync();

        if (typeof window !== 'undefined') {
          window.dispatchEvent(
            new CustomEvent('cash-drawer-updated', {
              detail: {
                storeId,
                event: 'closed',
                sessionId: cashDrawer.id,
              },
            })
          );
        }
      } catch (error) {
        console.error('Error closing cash drawer:', error);
      }
    },
    [
      cashDrawer,
      storeId,
      currentBranchId,
      pushUndo,
      updateUnsyncedCount,
      resetAutoSyncTimer,
      debouncedSync,
    ]
  );

  const getCashDrawerBalanceReport = useCallback(
    async (startDate?: string, endDate?: string) => {
      if (!storeId || !currentBranchId) return [];
      return await getDB().getCashDrawerBalanceReport(storeId, currentBranchId, startDate, endDate);
    },
    [storeId, currentBranchId]
  );

  const getCurrentCashDrawerStatus = useCallback(async () => {
    if (!storeId || !currentBranchId) return null;
    return await getDB().getCurrentCashDrawerStatus(storeId, currentBranchId);
  }, [storeId, currentBranchId]);

  const getCashDrawerSessionDetails = useCallback(async (sessionId: string) => {
    if (!storeId) return null;
    return await getDB().getCashDrawerSessionDetails(sessionId);
  }, [storeId]);

  const getRecommendedOpeningAmount = useCallback(async () => {
    if (!storeId) return { amount: 0, source: 'default' as const };

    try {
      const closedSessions = await getDB().cash_drawer_sessions
        .where('store_id')
        .equals(storeId)
        .filter((sess: any) => sess.status === 'closed')
        .toArray();

      if (closedSessions.length > 0) {
        closedSessions.sort(
          (a: any, b: any) => new Date(b.closed_at).getTime() - new Date(a.closed_at).getTime()
        );
        const lastSession = closedSessions[0];

        let recommendedAmount = lastSession.actual_amount || 0;

        if (currency === 'USD' && exchangeRate > 0) {
          recommendedAmount = recommendedAmount / exchangeRate;
        }

        return {
          amount: recommendedAmount,
          source: 'previous_session' as const,
          previousSessionId: lastSession.id,
          previousEmployee: lastSession.closed_by,
        };
      }

      return { amount: 0, source: 'default' as const };
    } catch (error) {
      console.error('Error getting recommended opening amount:', error);
      return { amount: 0, source: 'default' as const };
    }
  }, [storeId, currency, exchangeRate]);

  return {
    cashDrawer,
    refreshCashDrawerStatus,
    openCashDrawer,
    closeCashDrawer,
    getCashDrawerBalanceReport,
    getCurrentCashDrawerStatus,
    getCashDrawerSessionDetails,
    getRecommendedOpeningAmount,
  };
}
