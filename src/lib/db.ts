import Dexie, { Table } from 'dexie';
import { v4 as uuidv4 } from 'uuid';

// Base interface for all entities with sync support
interface BaseEntity {
  id: string;
  store_id: string;
  created_at: string;
  updated_at: string;
  _synced: boolean;
  _lastSyncedAt?: string;
  _deleted?: boolean;
}

// Entity interfaces matching Supabase schema exactly
export interface Product extends BaseEntity {
  name: string;
  category: string;
  image: string;
}

export interface Supplier extends BaseEntity {
  name: string;
  phone: string;
  email: string | null;
  address: string;
  type: 'commission' | 'cash'; // Added to match database schema
  is_active: boolean;
  lb_balance: number | null; // Added balance field to match Supabase schema
  usd_balance: number | null; // Added balance field to match Supabase schema
}

export interface  Customer extends BaseEntity {
  name: string;
  phone: string;
  email: string | null;
  address: string | null;
  lb_balance: number; // Changed from current_debt to balance to match Supabase schema
  usd_balance: number; // Changed from current_debt to balance to match Supabase schema
  is_active: boolean;
}

export interface InventoryItem extends Omit<BaseEntity, 'updated_at'> {
  id: string;
  product_id: string;
  supplier_id: string;
  type: string;
  quantity: number;
  unit: string;
  weight: number | null;
  porterage: number | null;
  transfer_fee: number | null;
  price: number | null;
  commission_rate: number | null;
  notes: string | null;
  received_at: string;
  received_by: string;
  store_id: string;
  created_at: string;
  received_quantity: number;
}



export interface SaleItem extends Omit<BaseEntity, 'updated_at'> {
  inventory_item_id: string; // Added to match Supabase schema
  product_id: string;
  supplier_id: string;
  quantity: number;
  weight: number | null;
  unit_price: number;
  received_value: number; // Added to match Supabase schema
  payment_method: string; // Added payment method field
  notes: string | null;
  customer_id: string | null; // Added to match Supabase schema
  created_by: string; // Added to match Supabase schema
}

export interface Transaction extends Omit<BaseEntity, 'updated_at'> {
  type: 'income' | 'expense';
  category: string;
  amount: number;
  currency: 'USD' | 'LBP';
  description: string;
  reference: string | null;
  store_id: string;
  created_by: string;
}

export interface ExpenseCategory extends BaseEntity {
  name: string;
  description: string | null;
  is_active: boolean;
}

// Sync metadata interface
export interface SyncMetadata {
  id: string;
  table_name: string;
  last_synced_at: string;
  sync_token?: string;
}

// Pending sync operation
export interface PendingSync {
  id: string;
  table_name: string;
  record_id: string;
  operation: 'create' | 'update' | 'delete';
  payload: any;
  created_at: string;
  retry_count: number;
  last_error?: string;
}

export interface JournalEntry extends BaseEntity {
  date: string;
  reference: string;
  description: string;
  entries: Array<{
    account: string;
    debit: number;
    credit: number;
  }>;
  total_debit: number;
  total_credit: number;
  created_by: string;
}

class POSDatabase extends Dexie {
  // Core tables
  products!: Table<Product, string>;
  suppliers!: Table<Supplier, string>;
  customers!: Table<Customer, string>;
  inventory_items!: Table<InventoryItem, string>;
  sale_items!: Table<SaleItem, string>;
  transactions!: Table<Transaction, string>;

  // Sync management tables
  sync_metadata!: Table<SyncMetadata, string>;
  pending_syncs!: Table<PendingSync, string>;

  constructor() {
    super('POSDatabase');
    
    this.version(7).stores({
      // Core tables with enhanced indexing to match database schema
      // Tables WITH updated_at: products, suppliers, customers
      products: 'id, store_id, name, category, updated_at',
      suppliers: 'id, store_id, name, type, is_active, updated_at, lb_balance, usd_balance', // Added lb_balance index
      customers: 'id, store_id, name, phone, is_active, updated_at, lb_balance, usd_balance', // Added lb_balance index

      // Tables WITHOUT updated_at: inventory_items, sale_items, transactions
      inventory_items: 'id, store_id, product_id, supplier_id, type, received_at, created_at, received_quantity', // Added received_quantity index
      sale_items: 'id, inventory_item_id, product_id, supplier_id, customer_id, payment_method, created_at, created_by', // Added payment_method, customer_id and created_by indexes
      transactions: 'id, store_id, type, category, created_at, created_by, currency', // Added currency index
  
      // Sync management
      sync_metadata: 'id, table_name, last_synced_at',
      pending_syncs: 'id, table_name, record_id, operation, created_at, retry_count'
    });

    // Migration for version 5 - update existing records to match new schema
    this.version(5).upgrade(trans => {
      // Update suppliers to ensure type field exists
      trans.table('suppliers').toCollection().modify(supplier => {
        if (!supplier.type) {
          supplier.type = 'commission'; // Default to commission for existing suppliers
        }
        if (supplier.lb_balance === undefined || supplier.lb_balance === null) {
          supplier.lb_balance = 0; // Default balance for existing suppliers
        }
        if (supplier.usd_balance === undefined || supplier.usd_balance === null) {
          supplier.usd_balance = 0; // Default balance for existing suppliers
        }
      });

      // Update customers to ensure balance field exists  
      trans.table('customers').toCollection().modify(customer => {
        if (customer.lb_balance === undefined || customer.lb_balance === null) {
          customer.lb_balance = 0; // Default balance for existing customers
        }
        if (customer.usd_balance === undefined || customer.usd_balance === null) {
          customer.usd_balance = 0; // Default balance for existing customers
        }
      });

      // Update sale_items to ensure all required fields exist
      trans.table('sale_items').toCollection().modify(saleItem => {
        if (!saleItem.inventory_item_id) {
          saleItem.inventory_item_id = ''; // Default empty string for missing inventory_item_id
        }
        if (saleItem.received_value === undefined || saleItem.received_value === null) {
          saleItem.received_value = saleItem.total_price || 0; // Migrate from total_price to received_value
        }
        if (!saleItem.customer_id) {
          saleItem.customer_id = null; // Default null for customer_id
        }
        if (!saleItem.created_by) {
          saleItem.created_by = ''; // Default empty string for created_by
        }
        if (!saleItem.payment_method) {
          saleItem.payment_method = 'cash'; // Default payment method for existing sale items
        }
      });

      // Update inventory_items to ensure received_quantity exists
      trans.table('inventory_items').toCollection().modify(inventoryItem => {
        if (inventoryItem.received_quantity === undefined || inventoryItem.received_quantity === null) {
          inventoryItem.received_quantity = inventoryItem.quantity || 0; // Default to quantity value
        }
      });
    });

    // Migration for version 6 - add payment_method to sale_items
    this.version(6).upgrade(trans => {
      // Update sale_items to ensure payment_method field exists
      trans.table('sale_items').toCollection().modify(saleItem => {
        if (!saleItem.payment_method) {
          saleItem.payment_method = 'cash'; // Default payment method for existing sale items
        }
      });
    });

    // Migration for version 7 - remove sales table (no longer needed)
    this.version(7).upgrade(trans => {
      // The sales table will be automatically removed from the schema
      // Any existing sales data will be lost, but this matches the backend schema
      console.log('Removing sales table to match backend schema');
    });

    // Add hooks for automatic timestamping and ID generation
    // Tables WITH updated_at: products, suppliers, customers
    this.products.hook('creating', this.addCreateFieldsWithUpdatedAt);
    this.suppliers.hook('creating', this.addCreateFieldsWithUpdatedAt);
    this.customers.hook('creating', this.addCreateFieldsWithUpdatedAt);

    // Tables WITHOUT updated_at: inventory_items, sale_items, transactions
    this.inventory_items.hook('creating', this.addCreateFields);
    this.sale_items.hook('creating', this.addCreateFields);
    this.transactions.hook('creating', this.addCreateFields);

    // Only add update hooks for tables that have updated_at
    this.products.hook('updating', this.addUpdateFields);
    this.suppliers.hook('updating', this.addUpdateFields);
    this.customers.hook('updating', this.addUpdateFields);
  }

  private addCreateFields = (primKey: any, obj: any, trans: any) => {
    const now = new Date().toISOString();
    if (!obj.id) obj.id = uuidv4();
    if (!obj.created_at) obj.created_at = now;
    if (obj._synced === undefined) obj._synced = false;
  };

  private addCreateFieldsWithUpdatedAt = (primKey: any, obj: any, trans: any) => {
    const now = new Date().toISOString();
    if (!obj.id) obj.id = uuidv4();
    if (!obj.created_at) obj.created_at = now;
    if (obj.updated_at === undefined) obj.updated_at = now;
    if (obj._synced === undefined) obj._synced = false;
  };

  private addUpdateFields = (modifications: any, primKey: any, obj: any, trans: any) => {
    modifications.updated_at = new Date().toISOString();
    if (modifications._synced === undefined) modifications._synced = false;
  };

  // Utility methods for sync management
  async markAsSynced(tableName: string, recordId: string) {
    const table = (this as any)[tableName];
    if (table) {
      await table.update(recordId, { 
        _synced: true, 
        _lastSyncedAt: new Date().toISOString() 
      });
    }
  }

  async getUnsyncedRecords(tableName: string) {
    const table = (this as any)[tableName];
    if (table) {
      return await table.filter((record: any) => record._synced === false).toArray();
    }
    return [];
  }

  async softDelete(tableName: string, recordId: string) {
    const table = (this as any)[tableName];
    if (table) {
      await table.update(recordId, { 
        _deleted: true, 
        _synced: false,
        updated_at: new Date().toISOString()
      });
    }
  }

  async addPendingSync(tableName: string, recordId: string, operation: 'create' | 'update' | 'delete', payload: any) {
    await this.pending_syncs.add({
      id: uuidv4(),
      table_name: tableName,
      record_id: recordId,
      operation,
      payload,
      created_at: new Date().toISOString(),
      retry_count: 0
    });
  }

  async getPendingSyncs() {
    return await this.pending_syncs.orderBy('created_at').toArray();
  }

  async removePendingSync(id: string) {
    await this.pending_syncs.delete(id);
  }

  async updateSyncMetadata(tableName: string, lastSyncedAt: string, syncToken?: string) {
    await this.sync_metadata.put({
      id: tableName,
      table_name: tableName,
      last_synced_at: lastSyncedAt,
      sync_token: syncToken
    });
  }

  async getSyncMetadata(tableName: string) {
    return await this.sync_metadata.get(tableName);
  }

  async cleanupInvalidInventoryItems(): Promise<number> {
    // Remove inventory items with quantity <= 0
    const invalidItems = await this.inventory_items.filter(item => item.quantity <= 0).toArray();
    
    if (invalidItems.length > 0) {
      await this.inventory_items.bulkDelete(invalidItems.map(item => item.id));
      console.log(`🧹 Cleaned up ${invalidItems.length} invalid inventory items`);
    }
    
    return invalidItems.length;
  }

  async validateDataIntegrity(storeId: string): Promise<{
    orphanedInventory: any[];
    orphanedSaleItems: any[];
    orphanedTransactions: any[];
  }> {
    console.log('🔍 Validating data integrity...');
    
    // Get all data
    const products = await this.products.where('store_id').equals(storeId).toArray();
    const suppliers = await this.suppliers.where('store_id').equals(storeId).toArray();
    const customers = await this.customers.where('store_id').equals(storeId).toArray();
    const inventory = await this.inventory_items.where('store_id').equals(storeId).toArray();
    const saleItems = await this.sale_items.toArray();
    const transactions = await this.transactions.where('store_id').equals(storeId).toArray();
    
    const productIds = new Set(products.map(p => p.id));
    const supplierIds = new Set(suppliers.map(s => s.id));
    const customerIds = new Set(customers.map(c => c.id));
    
    // Find orphaned records
    const orphanedInventory = inventory.filter(item => 
      !productIds.has(item.product_id) || !supplierIds.has(item.supplier_id)
    );
    
    const orphanedSaleItems = saleItems.filter(item => 
      !productIds.has(item.product_id) || !supplierIds.has(item.supplier_id)
    );
    
    const orphanedTransactions = transactions.filter(transaction => 
      // Add any transaction-specific validations here
      false
    );
    
    console.log('📊 Data integrity report:', {
      orphanedInventory: orphanedInventory.length,
      orphanedSaleItems: orphanedSaleItems.length,
      orphanedTransactions: orphanedTransactions.length
    });
    
    return {
      orphanedInventory,
      orphanedSaleItems,
      orphanedTransactions
    };
  }

  async cleanupOrphanedRecords(storeId: string): Promise<number> {
    const integrity = await this.validateDataIntegrity(storeId);
    let cleaned = 0;
    
    // Clean up orphaned inventory items
    if (integrity.orphanedInventory.length > 0) {
      await this.inventory_items.bulkDelete(integrity.orphanedInventory.map(item => item.id));
      cleaned += integrity.orphanedInventory.length;
      console.log(`🗑️ Removed ${integrity.orphanedInventory.length} orphaned inventory items`);
    }
    
    // Clean up orphaned sale items
    if (integrity.orphanedSaleItems.length > 0) {
      await this.sale_items.bulkDelete(integrity.orphanedSaleItems.map(item => item.id));
      cleaned += integrity.orphanedSaleItems.length;
      console.log(`🗑️ Removed ${integrity.orphanedSaleItems.length} orphaned sale items`);
    }
    
    return cleaned;
  }
}

export const db = new POSDatabase();

// Export utility functions
export const createId = () => uuidv4();

export const createBaseEntity = (storeId: string, data: Partial<BaseEntity> = {}): Partial<BaseEntity> => {
  const now = new Date().toISOString();
  return {
    id: createId(),
    store_id: storeId,
    created_at: now,
    updated_at: now,
    _synced: false,
    ...data
  };
};