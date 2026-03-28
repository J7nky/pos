/**
 * Cash drawer session operations (thinning OfflineDataContext).
 * openCashDrawer, closeCashDrawer.
 */

import { getDB } from '../../../lib/db';
import { calculateCashDrawerBalance } from '../../../utils/balanceCalculation';

export interface CashDrawerSessionDeps {
  storeId: string | null | undefined;
  currentBranchId: string | null;
  cashDrawerId: string | undefined;
  setCashDrawer: (value: any) => void;
  pushUndo: (undoData: any) => void;
  updateUnsyncedCount: () => Promise<void>;
  resetAutoSyncTimer: () => void;
  debouncedSync: () => void;
}

export async function openCashDrawer(
  deps: CashDrawerSessionDeps,
  amount: number,
  openedBy: string
): Promise<void> {
  const { storeId, currentBranchId, setCashDrawer, pushUndo, updateUnsyncedCount, resetAutoSyncTimer, debouncedSync } = deps;
  if (!storeId || !currentBranchId) return;

  try {
    const { cashDrawerUpdateService } = await import('../../../services/cashDrawerUpdateService');
    const result = await cashDrawerUpdateService.openCashDrawerSession(storeId, currentBranchId, amount, openedBy);

    if (!result.success) throw new Error(result.error || 'Failed to open cash drawer session');

    const account = await getDB().getCashDrawerAccount(storeId, currentBranchId);
    if (!account) throw new Error('Failed to retrieve cash drawer account after opening session');

    const acctCurrency = (account as any)?.currency || 'USD';
    await calculateCashDrawerBalance(storeId, currentBranchId, acctCurrency);

    setCashDrawer({
      id: result.sessionId!,
      accountId: account.id,
      status: 'open',
      currentBalance: amount,
      currency: (account as any).currency,
      lastUpdated: new Date().toISOString()
    });

    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('cash-drawer-updated', {
        detail: { storeId, event: 'opened' }
      }));
    }

    pushUndo({
      type: 'open_cash_drawer',
      affected: [
        { table: 'cash_drawer_sessions', id: result.sessionId! },
        { table: 'cash_drawer_accounts', id: account.id }
      ],
      steps: [
        { op: 'delete', table: 'cash_drawer_sessions', id: result.sessionId! },
        { op: 'update', table: 'cash_drawer_accounts', id: account.id, changes: { _synced: false } }
      ]
    });

    await updateUnsyncedCount();
    resetAutoSyncTimer();
    debouncedSync();
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to open cash drawer session';
    console.error('Error opening cash drawer:', message);
    throw new Error(message);
  }
}

export async function closeCashDrawer(
  deps: CashDrawerSessionDeps,
  actualAmount: number,
  closedBy: string,
  notes?: string
): Promise<void> {
  const { storeId, currentBranchId, cashDrawerId, setCashDrawer, pushUndo, updateUnsyncedCount, resetAutoSyncTimer, debouncedSync } = deps;
  if (!cashDrawerId) return;

  try {
    const session = await getDB().cash_drawer_sessions.get(cashDrawerId);
    if (!session) return;

    if (!storeId) return;
    const account = await getDB().getCashDrawerAccount(storeId, currentBranchId!);
    if (!account) return;

    await getDB().closeCashDrawerSession(cashDrawerId, actualAmount, closedBy, notes);

    setCashDrawer(null);

    pushUndo({
      type: 'close_cash_drawer',
      affected: [
        { table: 'cash_drawer_sessions', id: cashDrawerId },
        { table: 'cash_drawer_accounts', id: account.id }
      ],
      steps: [
        {
          op: 'update', table: 'cash_drawer_sessions', id: cashDrawerId, changes: {
            status: 'open',
            closed_at: null,
            closed_by: null,
            expected_amount: null,
            actual_amount: null,
            variance: null,
            _synced: false
          }
        },
        { op: 'update', table: 'cash_drawer_accounts', id: account.id, changes: { _synced: false } }
      ]
    });

    await updateUnsyncedCount();
    resetAutoSyncTimer();
    debouncedSync();

    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('cash-drawer-updated', {
        detail: { storeId, event: 'closed', sessionId: cashDrawerId }
      }));
    }
  } catch (error) {
    console.error('Error closing cash drawer:', error);
  }
}
