/**
 * Transaction operations (thinning OfflineDataContext).
 * addTransaction — handles legacy category mapping and delegates to transactionService.
 */

import { getDB, createId } from '../../../lib/db';
import type { Transaction } from '../../../types';
import type { Database } from '../../../types/database';
import { transactionService } from '../../../services/transactionService';
import { TRANSACTION_CATEGORIES } from '../../../constants/transactionCategories';

type TransactionInsert = Omit<Database['public']['Tables']['transactions']['Insert'], 'store_id'>;

export interface AddTransactionDeps {
  storeId: string | null | undefined;
  currentBranchId: string | null;
  userProfileId: string | undefined;
  pushUndo: (undoData: any) => void;
  refreshData: () => Promise<void>;
  updateUnsyncedCount: () => Promise<void>;
  resetAutoSyncTimer: () => void;
  debouncedSync: () => void;
}

const LEGACY_CATEGORY_MAP: Record<string, string> = {
  'Commission': TRANSACTION_CATEGORIES.SUPPLIER_COMMISSION,
  'Customer Payment': TRANSACTION_CATEGORIES.CUSTOMER_PAYMENT_RECEIVED,
  'Supplier Payment': TRANSACTION_CATEGORIES.SUPPLIER_PAYMENT,
  'Accounts Receivable': TRANSACTION_CATEGORIES.CUSTOMER_CREDIT_SALE,
  'Accounts Payable': TRANSACTION_CATEGORIES.SUPPLIER_CREDIT_SALE,
  'Porterage': TRANSACTION_CATEGORIES.SUPPLIER_PORTERAGE,
  'Transfer Fee': TRANSACTION_CATEGORIES.SUPPLIER_TRANSFER_FEE,
  'Supplier Advance': TRANSACTION_CATEGORIES.SUPPLIER_ADVANCE_GIVEN,
};

export async function addTransaction(
  deps: AddTransactionDeps,
  transactionData: TransactionInsert
): Promise<void> {
  const { storeId, currentBranchId, userProfileId, pushUndo, refreshData, updateUnsyncedCount, resetAutoSyncTimer, debouncedSync } = deps;
  if (!storeId) throw new Error('No store ID available');

  const transactionId = (transactionData as any).id || createId();
  const currentUserId = userProfileId || transactionData.created_by || 'system';

  const mappedCategory = LEGACY_CATEGORY_MAP[transactionData.category as string] || transactionData.category as string;
  const isValidCategory = Object.values(TRANSACTION_CATEGORIES).includes(mappedCategory as any);

  if (!isValidCategory) {
    console.warn(`⚠️ Unknown transaction category: ${transactionData.category}. Using direct DB write.`);
    const transaction: Transaction = {
      ...transactionData,
      id: transactionId,
      entity_id: (transactionData as any).entity_id || null,
      store_id: storeId,
      branch_id: currentBranchId || '',
      created_at: new Date().toISOString(),
      _synced: false,
      amount: transactionData.amount,
      reference: transactionData.reference ?? null,
      is_reversal: (transactionData as any).is_reversal ?? false,
      reversal_of_transaction_id: (transactionData as any).reversal_of_transaction_id ?? null
    };
    await getDB().transactions.add(transaction);
  } else {
    await transactionService.createTransaction({
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
        source: 'offline'
      },
      updateBalances: false,
      updateCashDrawer: false,
      createAuditLog: true,
      _synced: false
    });
  }

  pushUndo({
    type: 'add_transaction',
    affected: [{ table: 'transactions', id: transactionId }],
    steps: [{ op: 'delete', table: 'transactions', id: transactionId }]
  });

  await refreshData();
  await updateUnsyncedCount();
  resetAutoSyncTimer();
  debouncedSync();
}
