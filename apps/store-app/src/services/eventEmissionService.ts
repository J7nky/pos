/**
 * Event Emission Service
 * 
 * Emits events to branch_event_log after business actions complete.
 * 
 * Rules:
 * - One event per completed business action (not per database row)
 * - Emit AFTER local transaction commits
 * - No events for derived data (balances, totals)
 * - Atomic: event emission is part of the same transaction
 */

import { supabase } from '../lib/supabase';

export interface EventEmissionParams {
  store_id: string;
  branch_id: string;
  event_type: string;
  entity_type: string;
  entity_id: string;
  operation: 'insert' | 'update' | 'reverse';
  user_id?: string;
  metadata?: Record<string, any>;
}

export class EventEmissionService {
  /**
   * Emit an event to branch_event_log
   * Uses Supabase RPC function for atomic version increment
   */
  async emitEvent(params: EventEmissionParams): Promise<string> {
    const { data, error } = await supabase.rpc('emit_branch_event', {
      p_store_id: params.store_id,
      p_branch_id: params.branch_id,
      p_event_type: params.event_type,
      p_entity_type: params.entity_type,
      p_entity_id: params.entity_id,
      p_operation: params.operation,
      p_user_id: params.user_id || null,
      p_metadata: params.metadata || null,
    });

    if (error) {
      throw new Error(`Failed to emit event: ${error.message}`);
    }

    return data as string; // Returns event ID
  }

  /**
   * Emit sale_posted event
   * Called after a sale is completed and saved to IndexedDB
   */
  async emitSalePosted(
    storeId: string,
    branchId: string,
    billId: string,
    userId?: string,
    metadata?: { total?: number; line_items_count?: number }
  ): Promise<void> {
    await this.emitEvent({
      store_id: storeId,
      branch_id: branchId,
      event_type: 'sale_posted',
      entity_type: 'bill',
      entity_id: billId,
      operation: 'insert',
      user_id: userId,
      metadata,
    });
  }

  /**
   * Emit payment_posted event
   * Called after a payment transaction is created
   */
  async emitPaymentPosted(
    storeId: string,
    branchId: string,
    transactionId: string,
    userId?: string,
    metadata?: { amount?: number; currency?: string; method?: string }
  ): Promise<void> {
    await this.emitEvent({
      store_id: storeId,
      branch_id: branchId,
      event_type: 'payment_posted',
      entity_type: 'transaction',
      entity_id: transactionId,
      operation: 'insert',
      user_id: userId,
      metadata,
    });
  }

  /**
   * Emit inventory_received event
   * Called after inventory receipt is completed
   * Note: One event per inventory_bill, not per inventory_item
   */
  async emitInventoryReceived(
    storeId: string,
    branchId: string,
    inventoryBillId: string,
    userId?: string,
    metadata?: { items_count?: number; total_value?: number }
  ): Promise<void> {
    await this.emitEvent({
      store_id: storeId,
      branch_id: branchId,
      event_type: 'inventory_received',
      entity_type: 'inventory_bill',
      entity_id: inventoryBillId,
      operation: 'insert',
      user_id: userId,
      metadata,
    });
  }

  /**
   * Emit transaction_reversed event
   * Called when a transaction is reversed/cancelled
   */
  async emitTransactionReversed(
    storeId: string,
    branchId: string,
    transactionId: string,
    userId?: string,
    metadata?: { reason?: string }
  ): Promise<void> {
    await this.emitEvent({
      store_id: storeId,
      branch_id: branchId,
      event_type: 'transaction_reversed',
      entity_type: 'transaction',
      entity_id: transactionId,
      operation: 'reverse',
      user_id: userId,
      metadata,
    });
  }

  /**
   * Emit journal_entry_created event
   * Called after journal entry batch is created
   * Note: One event per batch, not per journal entry
   */
  async emitJournalEntryCreated(
    storeId: string,
    branchId: string,
    journalEntryId: string,
    userId?: string,
    metadata?: { entries_count?: number; transaction_id?: string }
  ): Promise<void> {
    await this.emitEvent({
      store_id: storeId,
      branch_id: branchId,
      event_type: 'journal_entry_created',
      entity_type: 'journal_entry',
      entity_id: journalEntryId,
      operation: 'insert',
      user_id: userId,
      metadata,
    });
  }

  /**
   * Emit entity_updated event
   * Called when customer/supplier/entity is updated
   */
  async emitEntityUpdated(
    storeId: string,
    branchId: string,
    entityId: string,
    userId?: string,
    metadata?: { entity_type?: string }
  ): Promise<void> {
    await this.emitEvent({
      store_id: storeId,
      branch_id: branchId,
      event_type: 'entity_updated',
      entity_type: 'entity',
      entity_id: entityId,
      operation: 'update',
      user_id: userId,
      metadata,
    });
  }

  /**
   * Emit cash_drawer_session_opened event
   * Called when a cash drawer session is opened
   */
  async emitCashDrawerSessionOpened(
    storeId: string,
    branchId: string,
    sessionId: string,
    userId?: string
  ): Promise<void> {
    await this.emitEvent({
      store_id: storeId,
      branch_id: branchId,
      event_type: 'cash_drawer_session_opened',
      entity_type: 'cash_drawer_session',
      entity_id: sessionId,
      operation: 'insert',
      user_id: userId,
    });
  }

  /**
   * Emit cash_drawer_transaction_posted after a cash-impacting transaction is uploaded.
   */
  async emitCashDrawerTransactionPosted(
    storeId: string,
    branchId: string,
    transactionId: string,
    category: string,
    userId?: string
  ): Promise<void> {
    await this.emitEvent({
      store_id: storeId,
      branch_id: branchId,
      event_type: 'cash_drawer_transaction_posted',
      entity_type: 'transaction',
      entity_id: transactionId,
      operation: 'insert',
      user_id: userId,
      metadata: { category, branch_id: branchId },
    });
  }

  /**
   * Emit cash_drawer_session_closed event
   * Called when a cash drawer session is closed
   */
  async emitCashDrawerSessionClosed(
    storeId: string,
    branchId: string,
    sessionId: string,
    userId?: string,
    metadata?: { closing_balance?: number }
  ): Promise<void> {
    await this.emitEvent({
      store_id: storeId,
      branch_id: branchId,
      event_type: 'cash_drawer_session_closed',
      entity_type: 'cash_drawer_session',
      entity_id: sessionId,
      operation: 'update',
      user_id: userId,
      metadata,
    });
  }

  // ========================================================================
  // CONFIGURATION TABLE EVENTS (For Fully Event-Driven Sync)
  // ========================================================================

  /**
   * Emit product_updated event
   * Called when a product is created or updated
   */
  async emitProductUpdated(
    storeId: string,
    branchId: string,
    productId: string,
    userId?: string,
    metadata?: { operation?: 'create' | 'update' | 'delete'; fields_changed?: string[] }
  ): Promise<void> {
    await this.emitEvent({
      store_id: storeId,
      branch_id: branchId,
      event_type: 'product_updated',
      entity_type: 'product',
      entity_id: productId,
      operation: metadata?.operation === 'delete' ? 'reverse' : (metadata?.operation === 'create' ? 'insert' : 'update'),
      user_id: userId,
      metadata,
    });
  }

  /**
   * Emit store_updated event
   * Called when store settings are updated
   */
  async emitStoreUpdated(
    storeId: string,
    branchId: string,
    userId?: string,
    metadata?: { fields_changed?: string[] }
  ): Promise<void> {
    await this.emitEvent({
      store_id: storeId,
      branch_id: branchId,
      event_type: 'store_updated',
      entity_type: 'store',
      entity_id: storeId,
      operation: 'update',
      user_id: userId,
      metadata,
    });
  }

  /**
   * Emit branch_updated event
   * Called when branch info is updated
   */
  async emitBranchUpdated(
    storeId: string,
    branchId: string,
    userId?: string,
    metadata?: { fields_changed?: string[] }
  ): Promise<void> {
    await this.emitEvent({
      store_id: storeId,
      branch_id: branchId,
      event_type: 'branch_updated',
      entity_type: 'branch',
      entity_id: branchId,
      operation: 'update',
      user_id: userId,
      metadata,
    });
  }

  /**
   * Emit user_updated event
   * Called when user/employee info is updated
   */
  async emitUserUpdated(
    storeId: string,
    branchId: string,
    targetUserId: string,
    userId?: string,
    metadata?: { operation?: 'create' | 'update' | 'delete'; fields_changed?: string[] }
  ): Promise<void> {
    await this.emitEvent({
      store_id: storeId,
      branch_id: branchId,
      event_type: 'user_updated',
      entity_type: 'user',
      entity_id: targetUserId,
      operation: metadata?.operation === 'delete' ? 'reverse' : (metadata?.operation === 'create' ? 'insert' : 'update'),
      user_id: userId,
      metadata,
    });
  }

  /**
   * Emit chart_of_account_updated event
   * Called when chart of accounts is modified
   */
  async emitChartOfAccountUpdated(
    storeId: string,
    branchId: string,
    accountId: string,
    userId?: string,
    metadata?: { operation?: 'create' | 'update' | 'delete' }
  ): Promise<void> {
    await this.emitEvent({
      store_id: storeId,
      branch_id: branchId,
      event_type: 'chart_of_account_updated',
      entity_type: 'chart_of_account',
      entity_id: accountId,
      operation: metadata?.operation === 'delete' ? 'reverse' : (metadata?.operation === 'create' ? 'insert' : 'update'),
      user_id: userId,
      metadata,
    });
  }

  /**
   * Emit user_module_access_updated event
   * Called when user module access permissions are updated
   */
  async emitUserModuleAccessUpdated(
    storeId: string,
    branchId: string,
    accessId: string,
    userId?: string,
    metadata?: { operation?: 'create' | 'update' | 'delete'; target_user_id?: string }
  ): Promise<void> {
    await this.emitEvent({
      store_id: storeId,
      branch_id: branchId,
      event_type: 'user_module_access_updated',
      entity_type: 'user_module_access',
      entity_id: accessId,
      operation: metadata?.operation === 'delete' ? 'reverse' : (metadata?.operation === 'create' ? 'insert' : 'update'),
      user_id: userId,
      metadata,
    });
  }

  /**
   * Emit reminder_updated event
   * Called when a reminder is created or updated
   */
  async emitReminderUpdated(
    storeId: string,
    branchId: string,
    reminderId: string,
    userId?: string,
    metadata?: { operation?: 'create' | 'update' | 'delete' }
  ): Promise<void> {
    await this.emitEvent({
      store_id: storeId,
      branch_id: branchId,
      event_type: 'reminder_updated',
      entity_type: 'reminder',
      entity_id: reminderId,
      operation: metadata?.operation === 'delete' ? 'reverse' : (metadata?.operation === 'create' ? 'insert' : 'update'),
      user_id: userId,
      metadata,
    });
  }

  // ========================================================================
  // BULK OPERATIONS (Optimized for batch updates)
  // ========================================================================

  /**
   * Emit products_bulk_updated event
   * Called when multiple products are updated at once (import, bulk price update, etc.)
   * 
   * This prevents event storms by emitting ONE event for multiple product changes
   */
  async emitProductsBulkUpdated(
    storeId: string,
    branchId: string,
    productIds: string[],
    userId?: string,
    metadata?: { 
      operation?: 'create' | 'update' | 'delete';
      operation_type?: 'import' | 'price_update' | 'category_change' | 'bulk_edit';
      count?: number;
    }
  ): Promise<void> {
    if (productIds.length === 0) {
      console.warn('emitProductsBulkUpdated called with empty productIds array');
      return;
    }

    await this.emitEvent({
      store_id: storeId,
      branch_id: branchId,
      event_type: 'products_bulk_updated',
      entity_type: 'product',
      entity_id: productIds[0], // Reference first product as anchor
      operation: metadata?.operation === 'delete' ? 'reverse' : (metadata?.operation === 'create' ? 'insert' : 'update'),
      user_id: userId,
      metadata: {
        ...metadata,
        affected_product_ids: productIds,
        count: productIds.length,
      },
    });
  }

  /**
   * Emit entities_bulk_updated event
   * Called when multiple entities (customers/suppliers) are updated at once
   */
  async emitEntitiesBulkUpdated(
    storeId: string,
    branchId: string,
    entityIds: string[],
    userId?: string,
    metadata?: { 
      operation?: 'create' | 'update' | 'delete';
      operation_type?: 'import' | 'bulk_edit';
      count?: number;
    }
  ): Promise<void> {
    if (entityIds.length === 0) {
      console.warn('emitEntitiesBulkUpdated called with empty entityIds array');
      return;
    }

    await this.emitEvent({
      store_id: storeId,
      branch_id: branchId,
      event_type: 'entities_bulk_updated',
      entity_type: 'entity',
      entity_id: entityIds[0],
      operation: metadata?.operation === 'delete' ? 'reverse' : (metadata?.operation === 'create' ? 'insert' : 'update'),
      user_id: userId,
      metadata: {
        ...metadata,
        affected_entity_ids: entityIds,
        count: entityIds.length,
      },
    });
  }

  /**
   * Emit users_bulk_updated event
   * Called when multiple users are updated at once
   */
  async emitUsersBulkUpdated(
    storeId: string,
    branchId: string,
    userIds: string[],
    userId?: string,
    metadata?: { 
      operation?: 'create' | 'update' | 'delete';
      operation_type?: 'import' | 'bulk_edit';
      count?: number;
    }
  ): Promise<void> {
    if (userIds.length === 0) {
      console.warn('emitUsersBulkUpdated called with empty userIds array');
      return;
    }

    await this.emitEvent({
      store_id: storeId,
      branch_id: branchId,
      event_type: 'users_bulk_updated',
      entity_type: 'user',
      entity_id: userIds[0],
      operation: metadata?.operation === 'delete' ? 'reverse' : (metadata?.operation === 'create' ? 'insert' : 'update'),
      user_id: userId,
      metadata: {
        ...metadata,
        affected_user_ids: userIds,
        count: userIds.length,
      },
    });
  }
}

// Export singleton instance
export const eventEmissionService = new EventEmissionService();

