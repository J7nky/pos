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
   * Clean entity data - convert empty strings to null for optional fields
   * This prevents "invalid input syntax for type numeric" errors in Supabase
   */
  private cleanEntityData(data: any): any {
    const cleaned: any = {};
    for (const [key, value] of Object.entries(data)) {
      if (value === '' && key !== 'name' && key !== 'email' && key !== 'role') {
        // Convert empty strings to null for optional fields
        cleaned[key] = null;
      } else {
        cleaned[key] = value;
      }
    }
    return cleaned;
  }

  /**
   * Generic add operation for any entity
   */
  async addEntity<T extends keyof Tables>(
    tableName: T,
    storeId: string,
    entityData: Omit<Tables[T]['Insert'], 'store_id'>
  ): Promise<void> {
    // Clean entity data - convert empty strings to null for numeric fields
    const cleanedEntityData = this.cleanEntityData(entityData);
    
    const entity = {
      ...createBaseEntity(storeId),
      ...cleanedEntityData
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
    
    // Clean update data - convert empty strings to null for numeric fields
    const cleanedUpdates = this.cleanEntityData(updates);
    
    // Prepare update payload with sync flag
    const updatePayload: any = {
      ...cleanedUpdates,
      _synced: false
    };
    
    // Add updated_at for tables that have it (customers, suppliers, products, stores)
    const tablesWithUpdatedAt = ['customers', 'suppliers', 'products', 'stores', 'users'];
    if (tablesWithUpdatedAt.includes(tableName)) {
      updatePayload.updated_at = new Date().toISOString();
    }
    
    // Perform the update in IndexedDB
    const result = await (db as any)[tableName].update(id, updatePayload);
    console.log(`🔧 CRUDHelper: Update result for ${tableName}:`, result);
    
    // Verify the update
    const entity = await (db as any)[tableName].get(id);
    console.log(`🔧 CRUDHelper: Entity after update:`, entity);
    
    if (!entity) {
      console.error(`❌ CRUDHelper: Entity ${id} not found after update in ${tableName}`);
      throw new Error(`Failed to update ${tableName} with ID ${id}`);
    }
    
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
   * Special handling for products: includes both store-specific and global products
   */
  async getEntitiesByStore<T extends keyof Tables>(
    tableName: T,
    storeId: string,
    includeDeleted = false
  ): Promise<any[]> {
    try {
      const table = (db as any)[tableName];
      if (!table) {
        console.error(`❌ Table ${tableName} does not exist in IndexedDB`);
        return [];
      }

      // Special handling for products: include both store-specific and global products
      if (tableName === 'products') {
        // Get store-specific products
        let storeProductsQuery = table.where('store_id').equals(storeId);
        if (!includeDeleted) {
          storeProductsQuery = storeProductsQuery.filter((item: any) => !item._deleted);
        }
        const storeProducts = await storeProductsQuery.toArray();

        // Get global products using indexed query (is_global = 1)
        // Note: Dexie stores boolean as 0/1, and syncService normalizes true -> 1
        // Using indexed query for better performance and reliability
        let globalProductsQuery = table.where('is_global').equals(1);
        if (!includeDeleted) {
          globalProductsQuery = globalProductsQuery.filter((item: any) => !item._deleted);
        }
        const globalProducts = await globalProductsQuery.toArray();

        // Combine and return
        const results = [...storeProducts, ...globalProducts];
        console.log(`📦 getEntitiesByStore: ${tableName} - found ${storeProducts.length} store products + ${globalProducts.length} global products = ${results.length} total for store ${storeId}`);
        return results;
      }

      // For all other tables, use standard query
      let query = table.where('store_id').equals(storeId);

      if (!includeDeleted) {
        query = query.filter((item: any) => !item._deleted);
      }

      const results = await query.toArray();
      console.log(`📦 getEntitiesByStore: ${tableName} - found ${results.length} records for store ${storeId}`);
      
      return results;
    } catch (error) {
      console.error(`❌ Error fetching ${tableName} for store ${storeId}:`, error);
      return [];
    }
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
      () => this.getEntitiesByStore('users', storeId),
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
      employeesData: results[3],
      inventoryData: results[4],
      transactionsData: results[5],
      batchesData: results[6],
      billsData: results[7],
      billLineItemsData: results[8],
      billAuditLogsData: results[9],
      cashDrawerAccountsData: results[10],
      cashDrawerSessionsData: results[11],
      missedProductsData: results[12],
    };
  }

  /**
   * Get unsynced count across all tables
   */
  async getUnsyncedCount(): Promise<{ total: number; byTable: Record<string, number> }> {
    const tableNames = [
      'stores', 'products', 'suppliers', 'customers', 'users',
      'cash_drawer_accounts',
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
    // Get all items for this product, then filter by batch supplier_id
    const allItems = await db.inventory_items
      .where('product_id')
      .equals(productId)
      .and(inv => inv.quantity > 0 && inv.store_id === storeId)
      .toArray();

    // Get batches for all items
    const batchIds = [...new Set(allItems.map(item => item.batch_id).filter(Boolean))];
    const batches = await db.inventory_bills.where('id').anyOf(batchIds).toArray();
    const batchMap = new Map(batches.map(b => [b.id, b]));

    // Filter items by supplier_id from batch
    const inventoryRecords = allItems
      .filter(inv => {
        if (!inv.batch_id) return false;
        const batch = batchMap.get(inv.batch_id);
        return batch?.supplier_id === supplierId;
      })
      .sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime());

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
    // Get all items for this product, then filter by batch supplier_id
    const allItems = await db.inventory_items
      .where('product_id')
      .equals(productId)
      .and(inv => inv.store_id === storeId)
      .toArray();

    // Get batches for all items
    const batchIds = [...new Set(allItems.map(item => item.batch_id).filter(Boolean))];
    const batches = await db.inventory_bills.where('id').anyOf(batchIds).toArray();
    const batchMap = new Map(batches.map(b => [b.id, b]));

    // Filter items by supplier_id from batch
    const existingInventory = allItems
      .filter(inv => {
        if (!inv.batch_id) return false;
        const batch = batchMap.get(inv.batch_id);
        return batch?.supplier_id === supplierId;
      })
      .sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime());

    if (existingInventory.length > 0) {
      const mostRecent = existingInventory[existingInventory.length - 1];
      await db.inventory_items.update(mostRecent.id, {
        quantity: mostRecent.quantity + quantity,
        _synced: false
      });
    } else {
      // Cannot create new inventory item without batch_id
      throw new Error('Cannot restore inventory: Items must have a batch_id. Use addInventoryBatch to create new inventory.');
    }

    await this.triggerPostOperationCallbacks();
  }
}

export const crudHelperService = new CRUDHelperService();

