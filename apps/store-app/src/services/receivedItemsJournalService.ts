// Received Items Journal Service
// Handles journal entry updates for received items (inventory items) and batches
// Ensures atomic updates with proper reversals and new entries

import { getDB } from '../lib/db';
import { JournalEntry } from '../types/accounting';
import { journalService } from './journalService';
import { accountingInitService } from './accountingInitService';
import { createId } from '../lib/db';
import { getLocalDateString } from '../utils/dateUtils';
import { getFiscalPeriodForDate } from '../utils/fiscalPeriod';

export class ReceivedItemsJournalService {
  /**
   * Find all journal entries linked to a batch via bill_id
   */
  async findJournalEntriesForBatch(batchId: string): Promise<JournalEntry[]> {
    return await getDB().journal_entries
      .where('bill_id')
      .equals(batchId)
      .and(e => e.entry_type !== 'reversal' && e.is_posted === true)
      .toArray();
  }

  /**
   * Find journal entries for a specific item (via batch)
   */
  async findJournalEntriesForItem(itemId: string, batchId: string | null): Promise<JournalEntry[]> {
    if (!batchId) {
      return [];
    }
    
    // Find entries for the batch - items share the batch's journal entries
    return await this.findJournalEntriesForBatch(batchId);
  }

  /**
   * Reverse all journal entries linked to a batch
   */
  async reverseJournalEntriesForBatch(
    batchId: string,
    reason: string,
    createdBy: string,
    storeId: string,
    branchId: string
  ): Promise<{ reversalTransactionId: string; reversalEntries: JournalEntry[] }> {
    const originalEntries = await this.findJournalEntriesForBatch(batchId);
    
    if (originalEntries.length === 0) {
      console.log(`[RECEIVED_ITEMS_JOURNAL] No journal entries found for batch ${batchId}`);
      return { reversalTransactionId: '', reversalEntries: [] };
    }

    const reversalTransactionId = createId();
    const now = new Date().toISOString();
    const postedDate = getLocalDateString(now);
    const fiscalPeriod = getFiscalPeriodForDate(now).period;

    const reversalEntries: JournalEntry[] = [];

    for (const entry of originalEntries) {
      const reversalEntry: JournalEntry = {
        id: createId(),
        store_id: entry.store_id,
        branch_id: entry.branch_id || branchId,
        transaction_id: reversalTransactionId,
        account_code: entry.account_code,
        account_name: entry.account_name,
        entity_id: entry.entity_id,
        entity_type: entry.entity_type,
        debit_usd: entry.credit_usd, // Swap: original credit becomes debit
        credit_usd: entry.debit_usd, // Swap: original debit becomes credit
        debit_lbp: entry.credit_lbp,
        credit_lbp: entry.debit_lbp,
        description: `Reversal: ${entry.description || reason}`,
        posted_date: postedDate,
        fiscal_period: fiscalPeriod,
        is_posted: true,
        created_by: createdBy,
        created_at: now,
        _synced: false,
        bill_id: batchId, // Link to batch
        entry_type: 'reversal',
        reversal_of_journal_entry_id: entry.id
      };
      reversalEntries.push(reversalEntry);
    }

    // Insert reversal entries
    if (reversalEntries.length > 0) {
      await getDB().journal_entries.bulkAdd(reversalEntries);
      console.log(`[RECEIVED_ITEMS_JOURNAL] ✅ Reversed ${reversalEntries.length} journal entries for batch ${batchId}`);
    }

    return { reversalTransactionId, reversalEntries };
  }

  /**
   * Reverse journal entries linked to an inventory item
   */
  async reverseJournalEntriesForItem(
    itemId: string,
    batchId: string | null,
    reason: string,
    createdBy: string,
    storeId: string,
    branchId: string
  ): Promise<{ reversalTransactionId: string; reversalEntries: JournalEntry[] }> {
    if (!batchId) {
      console.log(`[RECEIVED_ITEMS_JOURNAL] No batch_id for item ${itemId}, skipping journal reversal`);
      return { reversalTransactionId: '', reversalEntries: [] };
    }

    // For items, we reverse the batch entries (items share batch journal entries)
    // But we need to calculate the item's portion of the batch
    const batch = await getDB().inventory_bills.get(batchId);
    if (!batch) {
      console.log(`[RECEIVED_ITEMS_JOURNAL] Batch ${batchId} not found for item ${itemId}`);
      return { reversalTransactionId: '', reversalEntries: [] };
    }

    const item = await getDB().inventory_items.get(itemId);
    if (!item) {
      console.log(`[RECEIVED_ITEMS_JOURNAL] Item ${itemId} not found`);
      return { reversalTransactionId: '', reversalEntries: [] };
    }

    // Calculate item's portion of batch total
    const batchItems = await getDB().inventory_items
      .where('batch_id')
      .equals(batchId)
      .toArray();

    const batchTotal = batchItems.reduce((total, batchItem) => {
      const itemPrice = batchItem.price || 0;
      const itemValue = batchItem.weight && itemPrice
        ? batchItem.weight * itemPrice
        : (batchItem.quantity || 0) * itemPrice;
      return total + itemValue;
    }, 0);

    const itemValue = item.weight && item.price
      ? item.weight * item.price
      : (item.quantity || 0) * (item.price || 0);

    if (batchTotal === 0 || itemValue === 0) {
      console.log(`[RECEIVED_ITEMS_JOURNAL] Batch total or item value is zero, skipping reversal`);
      return { reversalTransactionId: '', reversalEntries: [] };
    }

    const itemRatio = itemValue / batchTotal;

    // Get original entries and create proportional reversals
    const originalEntries = await this.findJournalEntriesForBatch(batchId);
    
    if (originalEntries.length === 0) {
      console.log(`[RECEIVED_ITEMS_JOURNAL] No journal entries found for batch ${batchId}`);
      return { reversalTransactionId: '', reversalEntries: [] };
    }

    const reversalTransactionId = createId();
    const now = new Date().toISOString();
    const postedDate = getLocalDateString(now);
    const fiscalPeriod = getFiscalPeriodForDate(now).period;

    const reversalEntries: JournalEntry[] = [];

    for (const entry of originalEntries) {
      // Calculate proportional amounts
      const proportionalDebitUSD = entry.debit_usd * itemRatio;
      const proportionalCreditUSD = entry.credit_usd * itemRatio;
      const proportionalDebitLBP = entry.debit_lbp * itemRatio;
      const proportionalCreditLBP = entry.credit_lbp * itemRatio;

      // Skip if amounts are too small (rounding)
      if (proportionalDebitUSD === 0 && proportionalCreditUSD === 0 && 
          proportionalDebitLBP === 0 && proportionalCreditLBP === 0) {
        continue;
      }

      const reversalEntry: JournalEntry = {
        id: createId(),
        store_id: entry.store_id,
        branch_id: entry.branch_id || branchId,
        transaction_id: reversalTransactionId,
        account_code: entry.account_code,
        account_name: entry.account_name,
        entity_id: entry.entity_id,
        entity_type: entry.entity_type,
        debit_usd: proportionalCreditUSD, // Swap
        credit_usd: proportionalDebitUSD, // Swap
        debit_lbp: proportionalCreditLBP,
        credit_lbp: proportionalDebitLBP,
        description: `Reversal: ${entry.description || reason} (Item: ${itemId})`,
        posted_date: postedDate,
        fiscal_period: fiscalPeriod,
        is_posted: true,
        created_by: createdBy,
        created_at: now,
        _synced: false,
        bill_id: batchId,
        entry_type: 'reversal',
        reversal_of_journal_entry_id: entry.id
      };
      reversalEntries.push(reversalEntry);
    }

    // Insert reversal entries
    if (reversalEntries.length > 0) {
      await getDB().journal_entries.bulkAdd(reversalEntries);
      console.log(`[RECEIVED_ITEMS_JOURNAL] ✅ Reversed ${reversalEntries.length} journal entries for item ${itemId}`);
    }

    return { reversalTransactionId, reversalEntries };
  }

  /**
   * Create journal entries for a batch
   */
  async createJournalEntriesForBatch(
    batchId: string,
    supplierId: string,
    items: any[],
    currency: 'USD' | 'LBP',
    storeId: string,
    branchId: string,
    createdBy: string,
    batchType: 'cash' | 'credit' | 'commission'
  ): Promise<string> {
    // Calculate total amount for batch
    const totalAmount = items.reduce((total, item) => {
      const itemPrice = item.price || 0;
      const itemValue = item.weight && itemPrice
        ? item.weight * itemPrice
        : (item.quantity || 0) * itemPrice;
      return total + itemValue;
    }, 0);

    if (totalAmount === 0) {
      console.log(`[RECEIVED_ITEMS_JOURNAL] Batch ${batchId} has zero total, skipping journal entries`);
      return '';
    }

    const transactionId = createId();
    const description = `Inventory purchase - Batch ${batchId.substring(0, 8)}`;

    // Determine accounts based on batch type
    let debitAccount: string;
    let creditAccount: string;

    if (batchType === 'cash') {
      // Cash purchase: Debit Inventory (1300), Credit Cash (1100)
      debitAccount = '1300'; // Inventory
      creditAccount = '1100'; // Cash
    } else if (batchType === 'credit') {
      // Credit purchase: Debit Inventory (1300), Credit Accounts Payable (2100)
      debitAccount = '1300'; // Inventory
      creditAccount = '2100'; // Accounts Payable
    } else {
      // Commission: No inventory cost journal entries (COGS = 0)
      console.log(`[RECEIVED_ITEMS_JOURNAL] Commission batch, skipping inventory cost journal entries`);
      return '';
    }

    // Get internal entity for cash purchases, supplier entity for credit purchases
    let entityId = supplierId;
    if (batchType === 'cash') {
      const internalEntity = await accountingInitService.getSystemEntityByType(storeId, 'internal');
      if (!internalEntity) {
        throw new Error('Internal entity not found');
      }
      entityId = internalEntity.id;
    } else {
      // Verify supplier entity exists
      const supplierEntity = await getDB().entities.get(supplierId);
      if (!supplierEntity) {
        throw new Error(`Supplier entity not found: ${supplierId}`);
      }
    }

    // Create journal entries
    await journalService.createJournalEntry({
      transactionId,
      debitAccount,
      creditAccount,
      amountUSD: currency === 'USD' ? totalAmount : 0,
      amountLBP: currency === 'LBP' ? totalAmount : 0,
      entityId,
      description,
      postedDate: getLocalDateString(new Date().toISOString()),
      createdBy,
      branchId,
      // Set bill_id in the entries after creation
    });

    // Update journal entries to include bill_id
    const createdEntries = await getDB().journal_entries
      .where('transaction_id')
      .equals(transactionId)
      .toArray();

    for (const entry of createdEntries) {
      await getDB().journal_entries.update(entry.id, {
        bill_id: batchId,
        _synced: false
      });
    }

    console.log(`[RECEIVED_ITEMS_JOURNAL] ✅ Created journal entries for batch ${batchId}, amount: ${totalAmount} ${currency}`);
    return transactionId;
  }

  /**
   * Create journal entries for individual item
   */
  async createJournalEntriesForItem(
    itemId: string,
    supplierId: string,
    amount: number,
    currency: 'USD' | 'LBP',
    batchId: string | null,
    batchType: 'cash' | 'credit' | 'commission',
    storeId: string,
    branchId: string,
    createdBy: string
  ): Promise<string> {
    if (!batchId || amount === 0) {
      return '';
    }

    if (batchType === 'commission') {
      // Commission items don't have inventory cost journal entries
      return '';
    }

    const transactionId = createId();
    const description = `Inventory item adjustment - Item ${itemId.substring(0, 8)}`;

    // Determine accounts based on batch type
    let debitAccount: string;
    let creditAccount: string;
    let entityId: string;

    if (batchType === 'cash') {
      debitAccount = '1300'; // Inventory
      creditAccount = '1100'; // Cash
      const internalEntity = await accountingInitService.getSystemEntityByType(storeId, 'internal');
      if (!internalEntity) {
        throw new Error('Internal entity not found');
      }
      entityId = internalEntity.id;
    } else {
      debitAccount = '1300'; // Inventory
      creditAccount = '2100'; // Accounts Payable
      entityId = supplierId;
    }

    // Create journal entries
    await journalService.createJournalEntry({
      transactionId,
      debitAccount,
      creditAccount,
      amountUSD: currency === 'USD' ? amount : 0,
      amountLBP: currency === 'LBP' ? amount : 0,
      entityId,
      description,
      postedDate: getLocalDateString(new Date().toISOString()),
      createdBy,
      branchId
    });

    // Update journal entries to include bill_id
    const createdEntries = await getDB().journal_entries
      .where('transaction_id')
      .equals(transactionId)
      .toArray();

    for (const entry of createdEntries) {
      await getDB().journal_entries.update(entry.id, {
        bill_id: batchId,
        _synced: false
      });
    }

    return transactionId;
  }

  /**
   * Handle supplier change on batch - reverse old entries and create new ones
   */
  async updateJournalEntriesForSupplierChange(
    batchId: string,
    oldSupplierId: string,
    newSupplierId: string,
    items: any[],
    currency: 'USD' | 'LBP',
    batchType: 'cash' | 'credit' | 'commission',
    storeId: string,
    branchId: string,
    createdBy: string
  ): Promise<void> {
    // Reverse old supplier's journal entries
    await this.reverseJournalEntriesForBatch(
      batchId,
      `Supplier changed from ${oldSupplierId} to ${newSupplierId}`,
      createdBy,
      storeId,
      branchId
    );

    // Create new journal entries for new supplier
    await this.createJournalEntriesForBatch(
      batchId,
      newSupplierId,
      items,
      currency,
      storeId,
      branchId,
      createdBy,
      batchType
    );
  }

  /**
   * Calculate total amount for an item
   */
  calculateItemAmount(item: any): number {
    const price = item.price || 0;
    if (item.weight && price) {
      return item.weight * price;
    }
    return (item.quantity || 0) * price;
  }

  /**
   * Calculate old vs new amounts for item edit
   */
  calculateAmountDifference(oldItem: any, newItem: any): { oldAmount: number; newAmount: number; difference: number } {
    const oldAmount = this.calculateItemAmount(oldItem);
    const newAmount = this.calculateItemAmount(newItem);
    const difference = newAmount - oldAmount;
    return { oldAmount, newAmount, difference };
  }
}

export const receivedItemsJournalService = new ReceivedItemsJournalService();

