/**
 * Transaction domain layer for OfflineDataContext (§1.3).
 * Owns transactions state and add/update transaction; composer calls hydrate() from refreshData.
 */

import { useState, useCallback } from 'react';
import { createId } from '../../lib/db';
import { getDB } from '../../lib/db';
import { transactionService } from '../../services/transactionService';
import { TRANSACTION_CATEGORIES } from '../../constants/transactionCategories';
import type { Transaction } from '../../types';
import type { TransactionDataLayerAdapter, TransactionDataLayerResult, Tables } from './types';

export function useTransactionDataLayer(
  adapter: TransactionDataLayerAdapter
): TransactionDataLayerResult {
  const {
    storeId,
    currentBranchId,
    userProfileId,
    pushUndo,
    resetAutoSyncTimer,
    refreshData,
    updateUnsyncedCount,
    debouncedSync,
  } = adapter;
  const [transactions, setTransactions] = useState<Tables['transactions']['Row'][]>([]);

  const hydrate = useCallback((transactionsData: Tables['transactions']['Row'][]) => {
    setTransactions(transactionsData);
  }, []);

  const addTransaction = useCallback(
    async (transactionData: Omit<Tables['transactions']['Insert'], 'store_id'>): Promise<void> => {
      if (!storeId) throw new Error('No store ID available');

      let transactionId = (transactionData as any).id || createId();
      const currentUserId = userProfileId || transactionData.created_by || 'system';

      const categoryMapping: Record<string, string> = {
        Commission: TRANSACTION_CATEGORIES.SUPPLIER_COMMISSION,
        'Customer Payment': TRANSACTION_CATEGORIES.CUSTOMER_PAYMENT_RECEIVED,
        'Supplier Payment': TRANSACTION_CATEGORIES.SUPPLIER_PAYMENT,
        'Accounts Receivable': TRANSACTION_CATEGORIES.CUSTOMER_CREDIT_SALE,
        'Accounts Payable': TRANSACTION_CATEGORIES.SUPPLIER_CREDIT_SALE,
        Porterage: TRANSACTION_CATEGORIES.SUPPLIER_PORTERAGE,
        'Transfer Fee': TRANSACTION_CATEGORIES.SUPPLIER_TRANSFER_FEE,
        'Supplier Advance': TRANSACTION_CATEGORIES.SUPPLIER_ADVANCE_GIVEN,
      };

      const mappedCategory = categoryMapping[transactionData.category as string] || (transactionData.category as string);
      const isValidCategory = Object.values(TRANSACTION_CATEGORIES).includes(mappedCategory as any);

      if (!isValidCategory) {
        const entityId = (transactionData as any).entity_id || null;
        const transaction: Transaction = {
          ...transactionData,
          id: transactionId,
          entity_id: entityId,
          store_id: storeId,
          branch_id: currentBranchId || '',
          created_at: new Date().toISOString(),
          _synced: false,
          amount: transactionData.amount,
          reference: transactionData.reference ?? null,
          is_reversal: (transactionData as any).is_reversal ?? false,
          reversal_of_transaction_id: (transactionData as any).reversal_of_transaction_id ?? null,
        };
        await getDB().transactions.add(transaction);
      } else {
        const result = await transactionService.createTransaction({
          category: mappedCategory as any,
          amount: transactionData.amount,
          currency: (transactionData.currency as 'USD' | 'LBP') || 'USD',
          description: transactionData.description || '',
          reference: transactionData.reference ?? undefined,
          entityId: transactionData.entity_id ?? undefined,
          context: {
            userId: currentUserId,
            storeId,
            module: 'accounting',
            branchId: currentBranchId || '',
            source: 'offline',
          },
          updateBalances: false,
          updateCashDrawer: false,
          createAuditLog: true,
          _synced: false,
        });
        if (result.transactionId) transactionId = result.transactionId;
      }

      pushUndo({
        type: 'add_transaction',
        affected: [{ table: 'transactions', id: transactionId }],
        steps: [{ op: 'delete', table: 'transactions', id: transactionId }],
      });

      await refreshData();
      await updateUnsyncedCount();
      resetAutoSyncTimer();
      debouncedSync();
    },
    [
      storeId,
      currentBranchId,
      userProfileId,
      pushUndo,
      resetAutoSyncTimer,
      refreshData,
      updateUnsyncedCount,
      debouncedSync,
    ]
  );

  const updateTransaction = useCallback(
    async (id: string, updates: any): Promise<void> => {
      try {
        await getDB().transactions.update(id, {
          ...updates,
          updated_at: new Date().toISOString(),
          _synced: false,
        });
        await refreshData();
        debouncedSync();
      } catch (error) {
        console.error('Error updating transaction:', error);
        throw error;
      }
    },
    [refreshData, debouncedSync]
  );

  return {
    transactions,
    addTransaction,
    updateTransaction,
    hydrate,
  };
}
