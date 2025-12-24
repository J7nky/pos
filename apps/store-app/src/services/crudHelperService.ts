// Generic CRUD helper to eliminate repetitive operations in OfflineDataContext
import { getDB, createId, createBaseEntity } from '../lib/db';
import { Database } from '../types/database';

// Get singleton database instance
const db = getDB();

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
    
    // Create base entity with guaranteed ID
    const baseEntity = createBaseEntity(storeId);
    
    // Ensure ID is valid - use base entity ID if cleaned data has invalid ID
    const finalId = (cleanedEntityData.id && typeof cleanedEntityData.id === 'string' && cleanedEntityData.id.trim() !== '')
      ? cleanedEntityData.id
      : baseEntity.id;
    
    const entity = {
      ...baseEntity,
      ...cleanedEntityData,
      id: finalId // Ensure ID is always valid
    };

    // Final validation before adding
    if (!entity.id || typeof entity.id !== 'string' || entity.id.trim() === '') {
      throw new Error(`Cannot add ${tableName} entity: invalid or missing id field`);
    }

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
   * Generic query by store and branch for operational tables
   * Filters by both store_id and branch_id for branch-scoped data
   */
  async getEntitiesByStoreBranch<T extends keyof Tables>(
    tableName: T,
    storeId: string,
    branchId?: string | null,
    includeDeleted = false
  ): Promise<any[]> {
    
    try {
      const table = (db as any)[tableName];
      if (!table) {
        console.error(`❌ Table ${tableName} does not exist in IndexedDB`);
        return [];
      }

      // If no branchId provided, fall back to store-only filtering
      if (!branchId) {
        return this.getEntitiesByStore(tableName, storeId, includeDeleted);
      }

      // Query by store_id and branch_id
      let query = table.where('[store_id+branch_id]').equals([storeId, branchId]);
      
      if (!includeDeleted) {
        query = query.filter((item: any) => !item._deleted);
      }

      const results = await query.toArray();
      
      return results;
    } catch (error) {
      console.error(`❌ Error querying ${tableName} by store and branch:`, error);
      return [];
    }
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

        // Get global products - use a more defensive approach
        // The is_global field could be boolean, 0/1, or even string "true"/"false"
        // We'll query by index first, then filter to catch all possible truthy values
        let globalProductsQuery = table.where('is_global').anyOf(1, true, '1', 'true');
        if (!includeDeleted) {
          globalProductsQuery = globalProductsQuery.filter((item: any) => !item._deleted);
        }
        const globalProducts = await globalProductsQuery.toArray();

        // Additional fallback: check entire table for any missed global products
        // This handles edge cases where is_global might have unexpected values
        const allProducts = await table.toArray();
        const missedGlobalProducts = allProducts.filter((p: any) => {
          // Check if it's global and not already in our results
          const isTrulyGlobal = p.is_global === 1 || p.is_global === true || p.is_global === '1' || p.is_global === 'true';
          const notInStoreProducts = !storeProducts.find((sp: any) => sp.id === p.id);
          const notInGlobalProducts = !globalProducts.find((gp: any) => gp.id === p.id);
          const notDeleted = includeDeleted || !p._deleted;
          return isTrulyGlobal && notInStoreProducts && notInGlobalProducts && notDeleted;
        });

        // Combine all results
        const results = [...storeProducts, ...globalProducts, ...missedGlobalProducts];
        
        if (missedGlobalProducts.length > 0) {
          console.warn(`⚠️ Found ${missedGlobalProducts.length} global products with unexpected is_global values:`, 
            missedGlobalProducts.map((p: any) => ({ id: p.id, name: p.name, is_global: p.is_global, typeof: typeof p.is_global })));
        }
        
        return results;
      }

      // For all other tables, use standard query
      let query = table.where('store_id').equals(storeId);

      if (!includeDeleted) {
        query = query.filter((item: any) => !item._deleted);
      }

      const results = await query.toArray();
      
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
    await getDB().stores
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
   * Now supports branch filtering for operational tables
   */
  async loadAllStoreData(storeId: string, branchId?: string | null) {
    const operations = [
      // Store-level data (no branch filtering)
      () => this.getEntitiesByStore('products', storeId),
      () => this.getEntitiesByStore('suppliers', storeId), // Legacy - will be empty after migration
      () => this.getEntitiesByStore('customers', storeId), // Legacy - will be empty after migration
      () => this.getEntitiesByStore('users', storeId),
      () => this.getEntitiesByStore('chart_of_accounts', storeId),
      
      // Branch-specific data (filtered by branch if provided)
      () => this.getEntitiesByStoreBranch('inventory_items', storeId, branchId),
      () => this.getEntitiesByStoreBranch('transactions', storeId, branchId),
      () => this.getEntitiesByStoreBranch('inventory_bills', storeId, branchId),
      () => this.getEntitiesByStoreBranch('bills', storeId, branchId),
      () => this.getEntitiesByStoreBranch('bill_line_items', storeId, branchId),
      () => this.getEntitiesByStoreBranch('bill_audit_logs', storeId, branchId),
      () => this.getEntitiesByStoreBranch('cash_drawer_accounts', storeId, branchId),
      () => this.getEntitiesByStoreBranch('cash_drawer_sessions', storeId, branchId),
      () => this.getEntitiesByStoreBranch('missed_products', storeId, branchId),
      () => this.getEntitiesByStoreBranch('journal_entries', storeId, branchId),
      // Entities are store-level (not branch-specific) - customers/suppliers have branch_id: null
      () => this.getEntitiesByStore('entities', storeId),
      () => this.getEntitiesByStoreBranch('balance_snapshots', storeId, branchId),
    ];

    const startTime = Date.now();
    
    const results = await getDB().transaction('r', getDB().tables, async () => {
      return await Promise.all(operations.map(op => op()));
    });

    const loadTime = Date.now() - startTime;
    console.log(`⚡ IndexedDB batch load completed in ${loadTime}ms`);
    console.log(`📦 Loaded ${results[15]?.length || 0} entities for store ${storeId}`);

    return {
      productsData: results[0],
      suppliersData: results[1],
      customersData: results[2],
      employeesData: results[3],
      chartOfAccountsData: results[4] || [],
      // Branch-specific data
      inventoryData: results[5],
      transactionsData: results[6],
      batchesData: results[7],
      billsData: results[8],
      billLineItemsData: results[9],
      billAuditLogsData: results[10],
      cashDrawerAccountsData: results[11],
      cashDrawerSessionsData: results[12],
      missedProductsData: results[13],
      journalEntriesData: results[14] || [],
      entitiesData: results[15] || [],
      balanceSnapshotsData: results[16] || [],
    };
    
  }

  /**
   * Get unsynced count across all tables
   */
  async getUnsyncedCount(): Promise<{ total: number; byTable: Record<string, number> }> {
    const tableNames = [
      'stores', 'branches', 'products', 'suppliers', 'customers', 'users',
      'cash_drawer_accounts',
      'inventory_bills', 'inventory_items', 'transactions', 'bills',
      'bill_line_items', 'bill_audit_logs', 'cash_drawer_sessions',
      'missed_products', 'reminders' // Include all tables that sync processes
    ];

    // Get all table references first
    const tables = tableNames.map(name => (db as any)[name]).filter(Boolean);

    // Run in a dedicated read transaction that includes all tables
    // This ensures we're not conflicting with any existing transaction
    const counts = await getDB().transaction('r', tables, async () => {
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
   * Get detailed unsynced count that matches sync logic more closely
   */
  async getDetailedUnsyncedCount(): Promise<{ 
    total: number; 
    byTable: Record<string, { active: number; deleted: number; total: number }>;
    summary: string;
  }> {
    const tableNames = [
      'stores', 'branches', 'products', 'suppliers', 'customers', 'users',
      'cash_drawer_accounts',
      'inventory_bills', 'inventory_items', 'transactions', 'bills',
      'bill_line_items', 'bill_audit_logs', 'cash_drawer_sessions',
      'missed_products', 'reminders'
    ];

    const tables = tableNames.map(name => (db as any)[name]).filter(Boolean);

    const results = await getDB().transaction('r', tables, async () => {
      return await Promise.all(
        tableNames.map(async name => {
          try {
            const table = (db as any)[name];
            if (!table) {
              return { active: 0, deleted: 0, total: 0 };
            }
            
            // Match sync logic: separate active and deleted records
            const activeCount = await table.filter((item: any) => !item._synced && !item._deleted).count();
            const deletedCount = await table.filter((item: any) => !item._synced && item._deleted).count();
            
            return {
              active: activeCount,
              deleted: deletedCount,
              total: activeCount + deletedCount
            };
          } catch (error) {
            console.warn(`Table ${name} not found, skipping from detailed unsynced count`);
            return { active: 0, deleted: 0, total: 0 };
          }
        })
      );
    });

    const byTable: Record<string, { active: number; deleted: number; total: number }> = {};
    let totalActive = 0;
    let totalDeleted = 0;

    tableNames.forEach((name, index) => {
      byTable[name] = results[index];
      totalActive += results[index].active;
      totalDeleted += results[index].deleted;
    });

    // Generate summary
    const nonZeroTables = Object.entries(byTable)
      .filter(([_, counts]) => counts.total > 0)
      .map(([table, counts]) => {
        if (counts.deleted > 0) {
          return `${table}: ${counts.active} active + ${counts.deleted} deleted = ${counts.total}`;
        }
        return `${table}: ${counts.total}`;
      });

    const summary = nonZeroTables.length > 0 
      ? `Unsynced records: ${nonZeroTables.join(', ')}`
      : 'No unsynced records';

    return {
      total: totalActive + totalDeleted,
      byTable,
      summary
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
    const allItems = await getDB().inventory_items
      .where('product_id')
      .equals(productId)
      .and(inv => inv.quantity > 0 && inv.store_id === storeId)
      .toArray();

    // Get batches for all items
    const batchIds = [...new Set(allItems.map(item => item.batch_id).filter(Boolean))];
    const batches = await getDB().inventory_bills.where('id').anyOf(batchIds).toArray();
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

      await getDB().inventory_items.update(inv.id, {
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
    const allItems = await getDB().inventory_items
      .where('product_id')
      .equals(productId)
      .and(inv => inv.store_id === storeId)
      .toArray();

    // Get batches for all items
    const batchIds = [...new Set(allItems.map(item => item.batch_id).filter(Boolean))];
    const batches = await getDB().inventory_bills.where('id').anyOf(batchIds).toArray();
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
      await getDB().inventory_items.update(mostRecent.id, {
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

