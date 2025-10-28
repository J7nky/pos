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

    console.log(`🔧 CRUDHelper: Adding ${tableName} entity:`, entity);
    await (db as any)[tableName].add(entity);
    console.log(`🔧 CRUDHelper: Successfully added ${tableName} entity to IndexedDB`);
    
    console.log(`🔧 CRUDHelper: Triggering post-operation callbacks for ${tableName}`);
    await this.triggerPostOperationCallbacks();
    console.log(`🔧 CRUDHelper: Post-operation callbacks completed for ${tableName}`);
  }

  /**
   * Generic update operation for any entity
   */
  async updateEntity<T extends keyof Tables>(
    tableName: T,
    id: string,
    updates: Tables[T]['Update']
  ): Promise<void> {
    console.log(`🔧 CRUDHelper: Updating ${tableName} with ID ${id}`, updates);
    const result = await (db as any)[tableName].update(id, { ...updates, _synced: false });
    console.log(`🔧 CRUDHelper: Update result for ${tableName}:`, result);
    
    // Verify the update
    const entity = await (db as any)[tableName].get(id);
    console.log(`🔧 CRUDHelper: Entity after update:`, entity);
    
    await this.triggerPostOperationCallbacks();
  }

  /**
   * Generic delete operation (soft delete)
   */
  async deleteEntity<T extends keyof Tables>(
    tableName: T,
    id: string
  ): Promise<void> {
    console.log(`🗑️ CRUDHelper: Soft deleting ${tableName} with ID ${id}`);
    const result = await (db as any)[tableName].update(id, { _deleted: true, _synced: false });
    console.log(`🗑️ CRUDHelper: Delete result for ${tableName}:`, result);
    
    // Verify the deletion
    const entity = await (db as any)[tableName].get(id);
    console.log(`🗑️ CRUDHelper: Entity after deletion:`, entity);
    
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
    console.log('🔧 CRUDHelper: Starting post-operation callbacks');
    
    if (this.callbacks.onRefreshData) {
      console.log('🔧 CRUDHelper: Calling onRefreshData callback');
      await this.callbacks.onRefreshData();
      console.log('🔧 CRUDHelper: onRefreshData callback completed');
    } else {
      console.log('🔧 CRUDHelper: No onRefreshData callback set');
    }
    
    if (this.callbacks.onUpdateUnsyncedCount) {
      console.log('🔧 CRUDHelper: Calling onUpdateUnsyncedCount callback');
      await this.callbacks.onUpdateUnsyncedCount();
      console.log('🔧 CRUDHelper: onUpdateUnsyncedCount callback completed');
    }
    
    if (this.callbacks.onResetAutoSyncTimer) {
      console.log('🔧 CRUDHelper: Calling onResetAutoSyncTimer callback');
      this.callbacks.onResetAutoSyncTimer();
      console.log('🔧 CRUDHelper: onResetAutoSyncTimer callback completed');
    }
    
    if (this.callbacks.onDebouncedSync) {
      console.log('🔧 CRUDHelper: Calling onDebouncedSync callback');
      this.callbacks.onDebouncedSync();
      console.log('🔧 CRUDHelper: onDebouncedSync callback completed');
    }
    
    console.log('🔧 CRUDHelper: All post-operation callbacks completed');
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
      'bill_line_items', 'bill_audit_logs', 'cash_drawer_sessions'
    ];

    // Get all table references first
    const tables = tableNames.map(name => (db as any)[name]).filter(Boolean);

    // Run in a dedicated read transaction that includes all tables
    // This ensures we're not conflicting with any existing transaction
    const counts = await db.transaction('r', tables, async () => {
      return await Promise.all(
        tableNames.map(async name => {
          try {
            const table = (db as any)[name];
            if (!table) {
              return 0;
            }
            return await table.filter((item: any) => !item._synced).count();
          } catch (error) {
            console.warn(`Table ${name} not found, skipping from unsynced count`);
            return 0;
          }
        })
      );
    });

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

