/**
 * Transaction domain layer for OfflineDataContext (§1.3).
 * Owns transactions state and add/update transaction; composer calls hydrate() from refreshData.
 *
 * Caller audit (Feature 016):
 * - `pages/Accounting.tsx`: addTransaction calls include `currency` (USD after conversion).
 * - `billOperations.createBill`: writes transactions with `billCurrency` from validated bill header.
 * - `saleOperations.updateSale`: passes `deps.currency` from context (`preferredCurrency`); bill-level settlement should match bill row when extended.
 */

import { useState, useCallback } from 'react';
import { createId } from '../../lib/db';
import { getDB } from '../../lib/db';
import { transactionService } from '../../services/transactionService';
import { TRANSACTION_CATEGORIES } from '../../constants/transactionCategories';
import type { TransactionDataLayerAdapter, TransactionDataLayerResult, Tables } from './types';
import { currencyService } from '../../services/currencyService';
import { sameRowList } from '../../utils/rowListEquality';
import { assertValidCurrency } from '../../utils/currencyValidation';
import { notificationService } from '../../services/notificationService';
import { InvalidCurrencyError } from '../../errors/currencyErrors';
import enLocale from '../../i18n/locales/en';
import arLocale from '../../i18n/locales/ar';
import frLocale from '../../i18n/locales/fr';

async function notifyCurrencyError(
  storeId: string,
  reason: 'missing' | 'not-accepted' | string | undefined,
  acceptedCurrencies: readonly string[] | undefined
): Promise<void> {
  try {
    const store = await getDB().stores.get(storeId);
    const lang = (store?.preferred_language as 'en' | 'ar' | 'fr') || 'en';
    const locale = lang === 'ar' ? arLocale : lang === 'fr' ? frLocale : enLocale;
    const key = reason === 'missing' ? 'currencyMissing' : 'currencyNotAccepted';
    const title = locale.transaction?.[key] ?? enLocale.transaction[key];
    const message =
      reason === 'missing'
        ? title
        : `${title} (${(acceptedCurrencies ?? []).join(', ')})`;
    await notificationService.createNotification(storeId, 'sync_error', title, message, {
      priority: 'high',
    });
  } catch {
    /* non-fatal */
  }
}

export function useTransactionDataLayer(
  adapter: TransactionDataLayerAdapter
): TransactionDataLayerResult {
  const {
    storeId,
    currentBranchId,
    userProfileId,
    pushUndo,
    resetAutoSyncTimer,
    updateUnsyncedCount,
    debouncedSync,
  } = adapter;
  const [transactions, setTransactions] = useState<Tables['transactions']['Row'][]>([]);

  const hydrate = useCallback((transactionsData: Tables['transactions']['Row'][]) => {
    setTransactions(prev => (sameRowList(prev, transactionsData) ? prev : transactionsData));
  }, []);

  // Surgical upsert: merge rows into state by id without re-reading the whole
  // transactions table. Drops rows now flagged _deleted so a reversal/void is
  // reflected too. Consumers sort themselves, so insertion order is irrelevant.
  const upsertTransactions = useCallback((rows: Tables['transactions']['Row'][]) => {
    if (!rows || rows.length === 0) return;
    setTransactions(prev => {
      const next = new Map(prev.map(t => [t.id, t]));
      for (const row of rows) {
        if ((row as { _deleted?: boolean })._deleted) next.delete(row.id);
        else next.set(row.id, row);
      }
      return Array.from(next.values());
    });
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

      // Enforce double-entry: every transaction MUST post through
      // transactionService so it creates balanced journal entries. An unknown
      // category previously fell back to a direct db.transactions.add with NO
      // journal entries — a transaction with zero ledger impact that silently
      // violated the accounting invariant. Reject instead of writing it.
      if (!isValidCategory) {
        throw new Error(
          `Cannot record transaction: unknown category "${transactionData.category}". ` +
          `All transactions must use a valid TRANSACTION_CATEGORIES value so double-entry journal entries are posted.`
        );
      }

      let txnCurrency: Tables['transactions']['Insert']['currency'];
      try {
        txnCurrency = assertValidCurrency(
          transactionData.currency,
          currencyService.getAcceptedCurrencies(),
          { storeId }
        );
      } catch (e) {
        if (e instanceof InvalidCurrencyError && storeId) {
          await notifyCurrencyError(storeId, e.payload.reason, e.payload.acceptedCurrencies);
        }
        throw e;
      }

      const result = await transactionService.createTransaction({
        category: mappedCategory as any,
        amount: transactionData.amount,
        currency: txnCurrency,
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

      pushUndo({
        type: 'add_transaction',
        affected: [{ table: 'transactions', id: transactionId }],
        steps: [{ op: 'delete', table: 'transactions', id: transactionId }],
      });

      // Surgically merge the one new row into state instead of a full ~18-table
      // reload. This path writes a single transaction with updateBalances:false
      // and updateCashDrawer:false, so no other domain changed.
      try {
        const newTxs = (await getDB().transactions.bulkGet([transactionId])).filter(Boolean);
        if (newTxs.length) upsertTransactions(newTxs as Tables['transactions']['Row'][]);
      } catch (e) {
        console.warn('Transaction upsert failed (non-critical):', e);
      }
      void updateUnsyncedCount(1).catch(e => console.warn('Unsynced count update failed (non-critical):', e));
      resetAutoSyncTimer();
      debouncedSync();
    },
    [
      storeId,
      currentBranchId,
      userProfileId,
      pushUndo,
      resetAutoSyncTimer,
      upsertTransactions,
      updateUnsyncedCount,
      debouncedSync,
    ]
  );

  // NOTE: a raw `updateTransaction` (unguarded db.transactions.update of any
  // field on any row, including synced ones) used to live here. It was an
  // immutability escape hatch and became dead once payment correction moved to
  // transactionService.correctTransaction(). Removed — synced transactions are
  // corrected via reversal+replacement, never edited in place.

  return {
    transactions,
    addTransaction,
    hydrate,
    upsertTransactions,
  };
}
