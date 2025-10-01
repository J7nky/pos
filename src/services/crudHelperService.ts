// Generic CRUD helper to eliminate repetitive operations in OfflineDataContext
import { db, createId, createBaseEntity } from '../lib/db';
import { Database } from '../types/database';

type Tables = Database['public']['Tables'];

interface CRUDCallbacks {
  onRefreshData?: () => Promise<void>;
  onUpdateUnsyncedCount?: () => Promise<void>;
  onDebouncedSync?: () => void;
  onResetAutoSyncTimer?: () => void;
}

export class CRUDHelperService {
  private callbacks: CRUDCallbacks = {};

  setCallbacks(callbacks: CRUDCallbacks) {
    this.callbacks = callbacks;
  }

  /**
   * Generic add operation for any entity
   */
  async addEntity<T extends keyof Tables>(
    tableName: T,
    storeId: string,
    entityData: Omit<Tables[T]['Insert'], 'store_id'>
  ): Promise<void> {
    const entity = {
      ...createBaseEntity(storeId),
      ...entityData
    };

    await (db as any)[tableName].add(entity);
    await this.triggerPostOperationCallbacks();
  }

  /**
   * Generic update operation for any entity
   */
  async updateEntity<T extends keyof Tables>(
    tableName: T,
    id: string,
    updates: Tables[T]['Update']
  ): Promise<void> {
    await (db as any)[tableName].update(id, { ...updates, _synced: false });
    await this.triggerPostOperationCallbacks();
  }

  /**
   * Generic delete operation (soft delete)
   */
  async deleteEntity<T extends keyof Tables>(
    tableName: T,
    id: string
  ): Promise<void> {
    await (db as any)[tableName].update(id, { _deleted: true, _synced: false });
    await this.triggerPostOperationCallbacks();
  }

  /**
   * Generic hard delete operation
   */
  async hardDeleteEntity<T extends keyof Tables>(
    tableName: T,
    id: string
  ): Promise<void> {
    await (db as any)[tableName].delete(id);
    await this.triggerPostOperationCallbacks();
  }

  /**
   * Generic get operation
   */
  async getEntity<T extends keyof Tables>(
    tableName: T,
    id: string
  ): Promise<any | null> {
    return await (db as any)[tableName].get(id);
  }

  /**
   * Generic query by store
   */
  async getEntitiesByStore<T extends keyof Tables>(
    tableName: T,
    storeId: string,
    includeDeleted = false
  ): Promise<any[]> {
    let query = (db as any)[tableName]
      .where('store_id')
      .equals(storeId);

    if (!includeDeleted) {
      query = query.filter((item: any) => !item._deleted);
    }

    return await query.toArray();
  }

  /**
   * Generic bulk add operation
   */
  async bulkAddEntities<T extends keyof Tables>(
    tableName: T,
    storeId: string,
    entities: Array<Omit<Tables[T]['Insert'], 'store_id'>>
  ): Promise<void> {
    const now = new Date().toISOString();
    const mappedEntities = entities.map(entity => ({
      id: createId(),
      store_id: storeId,
      created_at: now,
      updated_at: now,
      _synced: false,
      ...entity
    }));

    await (db as any)[tableName].bulkAdd(mappedEntities);
    await this.triggerPostOperationCallbacks();
  }

  /**
   * Update store settings
   */
  async updateStoreSetting(
    storeId: string,
    setting: Partial<Tables['stores']['Update']>
  ): Promise<void> {
    await db.stores
      .where('id')
      .equals(storeId)
      .modify({
        ...setting,
        _synced: false,
        updated_at: new Date().toISOString()
      });

    await this.triggerPostOperationCallbacks();
  }

  /**
   * Trigger all post-operation callbacks
   */
  private async triggerPostOperationCallbacks(): Promise<void> {
    if (this.callbacks.onRefreshData) {
      await this.callbacks.onRefreshData();
    }
    if (this.callbacks.onUpdateUnsyncedCount) {
      await this.callbacks.onUpdateUnsyncedCount();
    }
    if (this.callbacks.onResetAutoSyncTimer) {
      this.callbacks.onResetAutoSyncTimer();
    }
    if (this.callbacks.onDebouncedSync) {
      this.callbacks.onDebouncedSync();
    }
  }

  /**
   * Batch query helper for loading all store data efficiently
   */
  async loadAllStoreData(storeId: string) {
    const operations = [
      () => this.getEntitiesByStore('products', storeId),
      () => this.getEntitiesByStore('suppliers', storeId),
      () => this.getEntitiesByStore('customers', storeId),
      () => this.getEntitiesByStore('inventory_items', storeId),
      () => this.getEntitiesByStore('transactions', storeId),
      () => this.getEntitiesByStore('inventory_bills', storeId),
      () => this.getEntitiesByStore('bills', storeId),
      () => this.getEntitiesByStore('bill_line_items', storeId),
      () => this.getEntitiesByStore('bill_audit_logs', storeId),
      () => this.getEntitiesByStore('cash_drawer_accounts', storeId),
      () => this.getEntitiesByStore('cash_drawer_sessions', storeId),
      () => this.getEntitiesByStore('missed_products', storeId),
    ];

    const startTime = Date.now();
    
    const results = await db.transaction('r', db.tables, async () => {
      return await Promise.all(operations.map(op => op()));
    });

    const loadTime = Date.now() - startTime;
    console.log(`⚡ IndexedDB batch load completed in ${loadTime}ms`);

    return {
      productsData: results[0],
      suppliersData: results[1],
      customersData: results[2],
      inventoryData: results[3],
      transactionsData: results[4],
      batchesData: results[5],
      billsData: results[6],
      billLineItemsData: results[7],
      billAuditLogsData: results[8],
      cashDrawerAccountsData: results[9],
      cashDrawerSessionsData: results[10],
      missedProductsData: results[11],
    };
  }

  /**
   * Get unsynced count across all tables
   */
  async getUnsyncedCount(): Promise<{ total: number; byTable: Record<string, number> }> {
    const tableNames = [
      'stores', 'products', 'suppliers', 'customers', 'cash_drawer_accounts',
      'inventory_bills', 'inventory_items', 'transactions', 'bills',
      'bill_line_items', 'bill_audit_logs', 'cash_drawer_sessions', 'missed_products'
    ];

    const counts = await Promise.all(
      tableNames.map(name => (db as any)[name].filter((item: any) => !item._synced).count())
    );

    const byTable: Record<string, number> = {};
    tableNames.forEach((name, index) => {
      byTable[name] = counts[index];
    });

    return {
      total: counts.reduce((sum, count) => sum + count, 0),
      byTable
    };
  }

  /**
   * Deduct inventory using FIFO
   */
  async deductInventoryQuantity(
    productId: string,
    supplierId: string,
    quantity: number,
    storeId: string
  ): Promise<void> {
    const inventoryRecords = await db.inventory_items
      .where('product_id')
      .equals(productId)
      .and(inv => inv.supplier_id === supplierId && inv.quantity > 0 && inv.store_id === storeId)
      .sortBy('created_at');

    let qtyToDeduct = quantity;
    for (const inv of inventoryRecords) {
      if (qtyToDeduct <= 0) break;

      const deduct = Math.min(inv.quantity, qtyToDeduct);
      const newQuantity = inv.quantity - deduct;

      await db.inventory_items.update(inv.id, {
        quantity: Math.max(0, newQuantity),
        _synced: false
      });

      qtyToDeduct -= deduct;
    }

    await this.triggerPostOperationCallbacks();
  }

  /**
   * Restore inventory using LIFO
   */
  async restoreInventoryQuantity(
    productId: string,
    supplierId: string,
    quantity: number,
    storeId: string
  ): Promise<void> {
    const existingInventory = await db.inventory_items
      .where('product_id')
      .equals(productId)
      .and(inv => inv.supplier_id === supplierId && inv.store_id === storeId)
      .sortBy('created_at');

    if (existingInventory.length > 0) {
      const mostRecent = existingInventory[existingInventory.length - 1];
      await db.inventory_items.update(mostRecent.id, {
        quantity: mostRecent.quantity + quantity,
        _synced: false
      });
    } else {
      await db.inventory_items.add({
        id: createId(),
        store_id: storeId,
        product_id: productId,
        supplier_id: supplierId,
        quantity: quantity,
        unit: 'box',
        weight: null,
        price: null,
        selling_price: null,
        received_quantity: quantity,
        created_at: new Date().toISOString(),
        batch_id: null,
        _synced: false
      });
    }

    await this.triggerPostOperationCallbacks();
  }
}

export const crudHelperService = new CRUDHelperService();

