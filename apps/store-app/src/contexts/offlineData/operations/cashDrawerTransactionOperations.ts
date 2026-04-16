/**
 * Cash drawer transaction atomic operations (thinning OfflineDataContext).
 * Creates expense, payment, and sale transactions with journal entries without nested Dexie transactions.
 */

import { getDB, createId } from '../../../lib/db';
import type { Transaction } from '../../../types';
import { journalService } from '../../../services/journalService';
import { currencyService } from '../../../services/currencyService';
import { getLocalDateString } from '../../../utils/dateUtils';
import { createMultilingualFromString } from '../../../utils/multilingual';
import {
  getEntityCodeForTransaction,
  getAccountMapping,
  getJournalDescription,
} from '../../../utils/accountMapping';
import { getSystemEntity } from '../../../constants/systemEntities';
import { TRANSACTION_CATEGORIES } from '../../../constants/transactionCategories';

export interface CashDrawerAtomicsDeps {
  storeId: string | null | undefined;
  currentBranchId: string | null;
  userProfileId: string | undefined;
}

export interface CashDrawerAtomicResult {
  transactionId: string;
  previousBalance: number;
  newBalance: number;
  accountId: string | null;
  accountWasSynced: boolean;
}

export function createCashDrawerAtomics(deps: CashDrawerAtomicsDeps) {
  const { storeId, currentBranchId, userProfileId } = deps;

  async function createCashDrawerExpenseAtomic(
    amount: number,
    currency: 'USD' | 'LBP',
    description: string,
    reference: string,
    supplierId: string | undefined
  ): Promise<CashDrawerAtomicResult> {
    if (!storeId || !currentBranchId || !userProfileId) {
      throw new Error('Store ID, branch ID, or user ID not available');
    }

    const multilingualDescription = createMultilingualFromString(description);
    const account = await getDB().getCashDrawerAccount(storeId, currentBranchId);
    if (!account) {
      throw new Error('No cash drawer account found. Please create one before processing expenses.');
    }

    const previousBalance = Number((account as any)?.current_balance || 0);
    const transactionId = createId();
    const timestamp = new Date().toISOString();
    const entityCode = getEntityCodeForTransaction(TRANSACTION_CATEGORIES.CASH_DRAWER_EXPENSE, supplierId);

    let entity;
    if (supplierId) {
      entity = await getDB().entities.get(supplierId);
      if (!entity) throw new Error(`Supplier entity not found: ${supplierId}`);
    } else {
      entity = await getSystemEntity(getDB(), storeId, entityCode);
      if (!entity) throw new Error(`System entity not found: ${entityCode} for store ${storeId}.`);
    }

    const accountMapping = getAccountMapping(TRANSACTION_CATEGORIES.CASH_DRAWER_EXPENSE);
    const journalDesc = getJournalDescription(
      TRANSACTION_CATEGORIES.CASH_DRAWER_EXPENSE,
      entity.name,
      multilingualDescription
    );

    const transaction: Transaction = {
      id: transactionId,
      store_id: storeId,
      branch_id: currentBranchId,
      type: 'expense',
      category: TRANSACTION_CATEGORIES.CASH_DRAWER_EXPENSE,
      amount,
      currency,
      description: multilingualDescription,
      reference,
      entity_id: supplierId || null,
      created_at: timestamp,
      created_by: userProfileId,
      _synced: false,
      _deleted: false,
      is_reversal: false,
      reversal_of_transaction_id: null,
      metadata: { correlationId: createId(), source: 'offline', module: 'supplier_management' },
    };

    await getDB().transactions.add(transaction);
    const postedDate = getLocalDateString(timestamp);

    await journalService.createJournalEntry({
      transactionId,
      debitAccount: accountMapping.debitAccount,
      creditAccount: accountMapping.creditAccount,
      amount,
      currency,
      entityId: entity.id,
      description: journalDesc,
      postedDate,
      createdBy: userProfileId,
      branchId: currentBranchId,
    });

    const cashJournalEntries = await getDB().journal_entries
      .where('transaction_id')
      .equals(transactionId)
      .and((entry: any) => entry.account_code === '1100' && entry.is_posted === true)
      .toArray();

    let balanceChange = 0;
    for (const entry of cashJournalEntries) {
      const usdChange = (entry.debit_usd || 0) - (entry.credit_usd || 0);
      const lbpChange = (entry.debit_lbp || 0) - (entry.credit_lbp || 0);
      if (usdChange !== 0) balanceChange += currencyService.convertCurrency(usdChange, 'USD', 'LBP');
      balanceChange += lbpChange;
    }

    return {
      transactionId,
      previousBalance,
      newBalance: previousBalance + balanceChange,
      accountId: account.id || null,
      accountWasSynced: !!(account as any)._synced,
    };
  }

  async function createCashDrawerPaymentAtomic(
    amount: number,
    currency: 'USD' | 'LBP',
    description: string,
    reference: string,
    supplierId: string | undefined
  ): Promise<CashDrawerAtomicResult> {
    if (!storeId || !currentBranchId || !userProfileId) {
      throw new Error('Store ID, branch ID, or user ID not available');
    }

    const multilingualDescription = createMultilingualFromString(description);
    const account = await getDB().getCashDrawerAccount(storeId, currentBranchId);
    if (!account) {
      throw new Error('No cash drawer account found. Please create one before processing payments.');
    }

    const previousBalance = Number((account as any)?.current_balance || 0);
    const transactionId = createId();
    const timestamp = new Date().toISOString();
    const entityCode = getEntityCodeForTransaction(TRANSACTION_CATEGORIES.SUPPLIER_PAYMENT, supplierId);

    let entity;
    if (supplierId) {
      entity = await getDB().entities.get(supplierId);
      if (!entity) throw new Error(`Supplier entity not found: ${supplierId}`);
    } else {
      entity = await getSystemEntity(getDB(), storeId, entityCode);
      if (!entity) throw new Error(`System entity not found: ${entityCode} for store ${storeId}.`);
    }

    const accountMapping = getAccountMapping(TRANSACTION_CATEGORIES.SUPPLIER_PAYMENT);
    const journalDesc = getJournalDescription(
      TRANSACTION_CATEGORIES.SUPPLIER_PAYMENT,
      entity.name,
      multilingualDescription
    );

    const transaction: Transaction = {
      id: transactionId,
      store_id: storeId,
      branch_id: currentBranchId,
      type: 'income',
      category: TRANSACTION_CATEGORIES.SUPPLIER_PAYMENT,
      amount,
      currency,
      description: multilingualDescription,
      reference,
      entity_id: supplierId || null,
      created_at: timestamp,
      created_by: userProfileId,
      _synced: false,
      _deleted: false,
      is_reversal: false,
      reversal_of_transaction_id: null,
      metadata: { correlationId: createId(), source: 'offline', module: 'supplier_management' },
    };

    await getDB().transactions.add(transaction);
    const postedDate = getLocalDateString(timestamp);

    await journalService.createJournalEntry({
      transactionId,
      debitAccount: accountMapping.debitAccount,
      creditAccount: accountMapping.creditAccount,
      amount,
      currency,
      entityId: entity.id,
      description: journalDesc,
      postedDate,
      createdBy: userProfileId,
      branchId: currentBranchId,
    });

    const cashJournalEntries = await getDB().journal_entries
      .where('transaction_id')
      .equals(transactionId)
      .and((entry: any) => entry.account_code === '1100' && entry.is_posted === true)
      .toArray();

    let balanceChange = 0;
    for (const entry of cashJournalEntries) {
      const usdChange = (entry.debit_usd || 0) - (entry.credit_usd || 0);
      const lbpChange = (entry.debit_lbp || 0) - (entry.credit_lbp || 0);
      if (usdChange !== 0) balanceChange += currencyService.convertCurrency(usdChange, 'USD', 'LBP');
      balanceChange += lbpChange;
    }

    return {
      transactionId,
      previousBalance,
      newBalance: previousBalance + balanceChange,
      accountId: account.id || null,
      accountWasSynced: !!(account as any)._synced,
    };
  }

  async function createCashDrawerTransactionAtomic(
    amount: number,
    currency: 'USD' | 'LBP',
    description: string,
    reference: string,
    customerId: string | undefined,
    _billNumber: string
  ): Promise<CashDrawerAtomicResult> {
    if (!storeId || !currentBranchId || !userProfileId) {
      throw new Error('Store ID, branch ID, or user ID not available');
    }

    const multilingualDescription = createMultilingualFromString(description);
    const account = await getDB().getCashDrawerAccount(storeId, currentBranchId);
    if (!account) {
      throw new Error('No cash drawer account found. Please create one before processing cash sales.');
    }

    const previousBalance = Number((account as any)?.current_balance || 0);
    const transactionId = createId();
    const timestamp = new Date().toISOString();
    const entityCode = getEntityCodeForTransaction(TRANSACTION_CATEGORIES.CASH_DRAWER_SALE, customerId);

    const entity = await getSystemEntity(getDB(), storeId, entityCode);
    if (!entity) {
      throw new Error(`System entity not found: ${entityCode} for store ${storeId}. Make sure system entities are initialized.`);
    }

    const accountMapping = getAccountMapping(TRANSACTION_CATEGORIES.CASH_DRAWER_SALE);
    const journalDesc = getJournalDescription(
      TRANSACTION_CATEGORIES.CASH_DRAWER_SALE,
      entity.name,
      multilingualDescription
    );

    const transaction: Transaction = {
      id: transactionId,
      store_id: storeId,
      branch_id: currentBranchId,
      type: 'income',
      category: TRANSACTION_CATEGORIES.CASH_DRAWER_SALE,
      amount,
      currency,
      description: multilingualDescription,
      reference,
      entity_id: customerId || null,
      created_at: timestamp,
      created_by: userProfileId,
      _synced: false,
      _deleted: false,
      is_reversal: false,
      reversal_of_transaction_id: null,
      metadata: { correlationId: createId(), source: 'offline', module: 'billing' },
    };

    await getDB().transactions.add(transaction);
    const postedDate = getLocalDateString(timestamp);

    await journalService.createJournalEntry({
      transactionId,
      debitAccount: accountMapping.debitAccount,
      creditAccount: accountMapping.creditAccount,
      amount,
      currency,
      entityId: entity.id,
      description: journalDesc,
      postedDate,
      createdBy: userProfileId,
      branchId: currentBranchId,
    });

    const cashJournalEntries = await getDB().journal_entries
      .where('transaction_id')
      .equals(transactionId)
      .and((entry: any) => entry.account_code === '1100' && entry.is_posted === true)
      .toArray();

    let balanceChange = 0;
    for (const entry of cashJournalEntries) {
      const usdChange = (entry.debit_usd || 0) - (entry.credit_usd || 0);
      const lbpChange = (entry.debit_lbp || 0) - (entry.credit_lbp || 0);
      if (usdChange !== 0) balanceChange += currencyService.convertCurrency(usdChange, 'USD', 'LBP');
      balanceChange += lbpChange;
    }

    return {
      transactionId,
      previousBalance,
      newBalance: previousBalance + balanceChange,
      accountId: account.id || null,
      accountWasSynced: !!(account as any)._synced,
    };
  }

  return {
    createCashDrawerExpenseAtomic,
    createCashDrawerPaymentAtomic,
    createCashDrawerTransactionAtomic,
  };
}

// ── Standalone helpers ──────────────────────────────────────────────────────

export interface ProcessCashDrawerTransactionDeps {
  storeId: string | null | undefined;
  currentBranchId: string | null;
  userProfileId: string | undefined;
}

export interface ProcessCashDrawerTransactionParams {
  type: 'sale' | 'payment' | 'expense' | 'refund';
  amount: number;
  currency: 'USD' | 'LBP';
  description: string;
  reference: string;
  customerId?: string;
  supplierId?: string;
  entityId?: string;
  category?: string;
}

export interface ProcessCashDrawerTransactionResult {
  success: boolean;
  transactionId: string | undefined;
  previousBalance: number | undefined;
  newBalance: number | undefined;
  accountId: string | undefined;
}

export async function processCashDrawerTransaction(
  deps: ProcessCashDrawerTransactionDeps,
  transactionData: ProcessCashDrawerTransactionParams
): Promise<ProcessCashDrawerTransactionResult> {
  const { storeId, currentBranchId, userProfileId } = deps;
  if (!storeId || !userProfileId) throw new Error('Store ID or user ID not available');

  try {
    const { transactionService } = await import('../../../services/transactionService');
    const { cashDrawerUpdateService } = await import('../../../services/cashDrawerUpdateService');

    const session = await cashDrawerUpdateService.verifySessionOpen(
      storeId,
      currentBranchId || '',
      true,
      userProfileId,
      transactionData.type
    );

    if (!session) throw new Error('No active cash drawer session');

    const context = {
      userId: userProfileId,
      storeId,
      branchId: currentBranchId || '',
      module: 'cash_drawer',
      source: 'web' as const
    };

    let result;

    if (transactionData.type === 'sale') {
      result = await transactionService.createCashDrawerSale(
        transactionData.amount,
        transactionData.currency,
        transactionData.description,
        context,
        { reference: transactionData.reference, entityId: transactionData.entityId || transactionData.customerId }
      );
    } else if (transactionData.type === 'payment') {
      const entityId = transactionData.entityId || transactionData.customerId || transactionData.supplierId;
      if (!entityId) throw new Error('Entity ID is required for payment transactions');

      const entity = await getDB().entities.get(entityId);
      if (!entity) throw new Error(`Entity not found: ${entityId}`);

      if (entity.entity_type === 'customer') {
        result = await transactionService.createCustomerPayment(
          entityId,
          transactionData.amount,
          transactionData.currency,
          transactionData.description,
          context,
          { reference: transactionData.reference, updateCashDrawer: true }
        );
      } else if (entity.entity_type === 'supplier') {
        result = await transactionService.createSupplierPayment(
          entityId,
          transactionData.amount,
          transactionData.currency,
          transactionData.description,
          context,
          { reference: transactionData.reference, updateCashDrawer: true }
        );
      } else {
        throw new Error('Payment type requires either customerId or supplierId');
      }
    } else if (transactionData.type === 'expense') {
      result = await transactionService.createCashDrawerExpense(
        transactionData.amount,
        transactionData.currency,
        transactionData.description,
        context,
        { reference: transactionData.reference }
      );
    } else if (transactionData.type === 'refund') {
      result = await transactionService.createCashDrawerExpense(
        transactionData.amount,
        transactionData.currency,
        `Refund: ${transactionData.description}`,
        context,
        { reference: transactionData.reference, category: 'refund' }
      );
    } else {
      throw new Error(`Unsupported transaction type: ${transactionData.type}`);
    }

    if (!result.success) throw new Error(result.error || 'Failed to create transaction');

    const account = await getDB().getCashDrawerAccount(storeId, currentBranchId!);
    const accountId = account?.id;

    if (result.cashDrawerImpact) {
      cashDrawerUpdateService.notifyCashDrawerUpdate(
        storeId,
        result.cashDrawerImpact.newBalance,
        result.transactionId || ''
      );
    }

    return {
      success: true,
      transactionId: result.transactionId,
      previousBalance: result.balanceBefore,
      newBalance: result.balanceAfter,
      accountId
    };
  } catch (error) {
    console.error('Cash drawer transaction failed:', error);
    throw error;
  }
}

export function createCashDrawerUndoData(
  transactionId: string | undefined,
  previousBalance: number | undefined,
  accountId: string | undefined,
  additionalUndoData?: {
    affected: Array<{ table: string; id: string }>;
    steps: Array<{ op: string; table: string; id: string; changes?: any }>;
  },
  /** Original _synced state of the cash drawer account before this action. Defaults to true. */
  accountWasSynced?: boolean
): any {
  console.log('🔧 Creating cash drawer undo data:', { transactionId, previousBalance, accountId, additionalUndoData });

  const undoData = {
    type: 'cash_drawer_transaction',
    affected: [
      ...(additionalUndoData?.affected || []),
      ...(transactionId ? [{ table: 'transactions', id: transactionId }] : []),
      ...(accountId ? [{ table: 'cash_drawer_accounts', id: accountId }] : [])
    ],
    steps: [
      ...(additionalUndoData?.steps || []),
      ...(transactionId ? [{ op: 'delete', table: 'transactions', id: transactionId }] : []),
      ...(previousBalance !== undefined && accountId ? [{
        op: 'update',
        table: 'cash_drawer_accounts',
        id: accountId,
        changes: { current_balance: previousBalance, _synced: accountWasSynced ?? true }
      }] : [])
    ]
  };

  console.log('🔧 Created undo data:', undoData);
  return undoData;
}
