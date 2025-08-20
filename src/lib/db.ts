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
  commission_rate: number;
  status: string;
  received_at: string;
  received_by: string;
  store_id: string;
  created_at: string;
  received_quantity: number;
  batch_id: string | null;
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

// Bill management interface for comprehensive bill operations
export interface Bill extends BaseEntity {
  bill_number: string;
  customer_id: string | null;
  customer_name: string | null;
  subtotal: number;
  total_amount: number;
  payment_method: 'cash' | 'card' | 'credit';
  payment_status: 'paid' | 'partial' | 'pending';
  amount_paid: number;
  amount_due: number;
  bill_date: string;
  notes: string | null;
  status: 'active' | 'cancelled' | 'refunded';
  created_by: string;
  last_modified_by: string | null;
  last_modified_at: string | null;
}

// Bill line items for detailed bill management
export interface BillLineItem extends BaseEntity {
  bill_id: string;
  product_id: string;
  product_name: string;
  supplier_id: string;
  supplier_name: string;
  inventory_item_id: string | null;
  quantity: number;
  unit_price: number;
  line_total: number;
  weight: number | null;
  notes: string | null;
  line_order: number;
}

// Bill audit trail for tracking all changes
export interface BillAuditLog extends BaseEntity {
  bill_id: string;
  action: 'created' | 'updated' | 'deleted' | 'item_added' | 'item_removed' | 'item_modified' | 'payment_updated';
  field_changed: string | null;
  old_value: string | null;
  new_value: string | null;
  change_reason: string | null;
  changed_by: string;
  ip_address: string | null;
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
export interface inventory_batches extends BaseEntity {
  id: string;
  supplier_id: string;
  status: string;
  porterage: number | null;
  transfer_fee: number | null;
  received_at: string;
  store_id: string;
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
  inventory_batches!: Table<inventory_batches, string>;

  // Bill management tables
  bills!: Table<Bill, string>;
  bill_line_items!: Table<BillLineItem, string>;
  bill_audit_logs!: Table<BillAuditLog, string>;
  // Sync management tables
  sync_metadata!: Table<SyncMetadata, string>;
  pending_syncs!: Table<PendingSync, string>;

  constructor() {
    super('POSDatabase');
    
    this.version(9).stores({
      // Core tables with enhanced indexing to match database schema
      // Tables WITH updated_at: products, suppliers, customers
      products: 'id, store_id, name, category, updated_at',
      suppliers: 'id, store_id, name, type, is_active, updated_at, lb_balance, usd_balance', // Added lb_balance index
      customers: 'id, store_id, name, phone, is_active, updated_at, lb_balance, usd_balance', // Added lb_balance index

      // Tables WITHOUT updated_at: inventory_items, sale_items, transactions
      inventory_items: 'id, store_id, product_id, supplier_id, type, received_at, created_at, received_quantity, batch_id', // Added received_quantity and batch_id index
      sale_items: 'id, inventory_item_id, product_id, supplier_id, customer_id, payment_method, created_at, created_by', // Added payment_method, customer_id and created_by indexes
      transactions: 'id, store_id, type, category, created_at, created_by, currency', // Added currency index
      inventory_batches: 'id, store_id, supplier_id, received_at, created_by',
  
      // Bill management tables
      bills: 'id, store_id, bill_number, customer_id, bill_date, payment_status, status, created_by, created_at',
      bill_line_items: 'id, bill_id, product_id, supplier_id, line_order, created_at',
      bill_audit_logs: 'id, bill_id, action, changed_by, created_at',

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

    // Tables WITHOUT updated_at: inventory_items, sale_items, transactions, inventory_batches
    this.inventory_items.hook('creating', this.addCreateFields);
    this.sale_items.hook('creating', this.addCreateFields);
    this.transactions.hook('creating', this.addCreateFields);
    this.inventory_batches.hook('creating', this.addCreateFields);

    // Only add update hooks for tables that have updated_at
    this.products.hook('updating', this.addUpdateFields);
    this.suppliers.hook('updating', this.addUpdateFields);
    this.customers.hook('updating', this.addUpdateFields);

    // Bill management hooks
    this.bills.hook('creating', this.addCreateFieldsWithUpdatedAt);
    this.bill_line_items.hook('creating', this.addCreateFields);
    this.bill_audit_logs.hook('creating', this.addCreateFields);
    this.bills.hook('updating', this.addUpdateFields);
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
    // Keep inventory items with quantity = 0 for Received Bills history.
    // Only remove truly invalid rows (negative quantities).
    const invalidItems = await this.inventory_items.filter(item => item.quantity < 0).toArray();
    
    if (invalidItems.length > 0) {
      await this.inventory_items.bulkDelete(invalidItems.map(item => item.id));
      console.log(`🧹 Cleaned up ${invalidItems.length} invalid inventory items (negative quantity)`);
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

  // Bill management methods
  async createBillFromSaleItems(saleItems: SaleItem[], billData: Partial<Bill>, useSupabase: boolean = true): Promise<string> {
    // If using Supabase, delegate to SupabaseService
    if (useSupabase) {
      console.log('Using Supabase for bill creation - delegating to SupabaseService');
      return 'supabase-handled';
    }

    // Fallback to local database creation
    const billId = createId();
    const now = new Date().toISOString();
    
    return await this.transaction('rw', [this.bills, this.bill_line_items, this.bill_audit_logs], async () => {
      // Create the bill
      const bill: Bill = {
        id: billId,
        store_id: billData.store_id!,
        created_at: now,
        updated_at: now,
        _synced: false,
        bill_number: billData.bill_number || `BILL-${Date.now()}`,
        customer_id: billData.customer_id || null,
        customer_name: billData.customer_name || null,
        subtotal: billData.subtotal || 0,
        total_amount: billData.total_amount || 0,
        payment_method: billData.payment_method || 'cash',
        payment_status: billData.payment_status || 'paid',
        amount_paid: billData.amount_paid || 0,
        amount_due: billData.amount_due || 0,
        bill_date: billData.bill_date || now,
        notes: billData.notes || null,
        status: billData.status || 'active',
        created_by: billData.created_by!,
        last_modified_by: null,
        last_modified_at: null
      };
      
      await this.bills.add(bill);
      
      // Create bill line items from sale items
      const lineItems: BillLineItem[] = saleItems.map((saleItem, index) => ({
        id: createId(),
        store_id: billData.store_id!,
        created_at: now,
        updated_at: now,
        _synced: false,
        bill_id: billId,
        product_id: saleItem.product_id,
        product_name: '', // Will be populated from product lookup
        supplier_id: saleItem.supplier_id,
        supplier_name: '', // Will be populated from supplier lookup
        inventory_item_id: saleItem.inventory_item_id,
        quantity: saleItem.quantity,
        unit_price: saleItem.unit_price,
        line_total: saleItem.received_value,
        weight: saleItem.weight,
        notes: saleItem.notes,
        line_order: index + 1
      }));
      
      await this.bill_line_items.bulkAdd(lineItems);
      
      // Create audit log entry
      await this.bill_audit_logs.add({
        id: createId(),
        store_id: billData.store_id!,
        created_at: now,
        updated_at: now,
        _synced: false,
        bill_id: billId,
        action: 'created',
        field_changed: null,
        old_value: null,
        new_value: JSON.stringify(bill),
        change_reason: 'Bill created from POS sale',
        changed_by: billData.created_by!,
        ip_address: null,
      });
      
      return billId;
    });
  }

  async updateBill(billId: string, updates: Partial<Bill>, changedBy: string, changeReason?: string): Promise<void> {
    const originalBill = await this.bills.get(billId);
    if (!originalBill) throw new Error('Bill not found');
    
    return await this.transaction('rw', [this.bills, this.bill_audit_logs], async () => {
      const now = new Date().toISOString();
      
      // Update the bill
      await this.bills.update(billId, {
        ...updates,
        last_modified_by: changedBy,
        last_modified_at: now,
        _synced: false
      });
      
      // Log each changed field
      for (const [field, newValue] of Object.entries(updates)) {
        if (field !== 'last_modified_by' && field !== 'last_modified_at' && field !== '_synced') {
          const oldValue = (originalBill as any)[field];
          if (oldValue !== newValue) {
            await this.bill_audit_logs.add({
              id: createId(),
              store_id: originalBill.store_id,
              created_at: now,
              updated_at: now,
              _synced: false,
              bill_id: billId,
              action: 'updated',
              field_changed: field,
              old_value: JSON.stringify(oldValue),
              new_value: JSON.stringify(newValue),
              change_reason: changeReason || 'Bill updated',
              changed_by: changedBy,
              ip_address: null,
            });
          }
        }
      }
    });
  }

  async deleteBill(billId: string, deletedBy: string, deleteReason?: string, softDelete: boolean = true): Promise<void> {
    const bill = await this.bills.get(billId);
    if (!bill) throw new Error('Bill not found');
    
    return await this.transaction('rw', [this.bills, this.bill_line_items, this.bill_audit_logs, this.inventory_items], async () => {
      const now = new Date().toISOString();
      
      if (softDelete) {
        // Soft delete - mark as deleted but keep in database
        await this.bills.update(billId, {
          status: 'cancelled',
          last_modified_by: deletedBy,
          last_modified_at: now,
          _synced: false,
          _deleted: true
        });
      } else {
        // Hard delete - remove from database
        await this.bills.delete(billId);
        await this.bill_line_items.where('bill_id').equals(billId).delete();
      }
      
      // Restore inventory quantities for deleted bill
      const lineItems = await this.bill_line_items.where('bill_id').equals(billId).toArray();
      for (const lineItem of lineItems) {
        if (lineItem.inventory_item_id) {
          const inventoryItem = await this.inventory_items.get(lineItem.inventory_item_id);
          if (inventoryItem) {
            await this.inventory_items.update(lineItem.inventory_item_id, {
              quantity: inventoryItem.quantity + lineItem.quantity,
              _synced: false
            });
          }
        }
      }
      
      // Create audit log entry
      await this.bill_audit_logs.add({
        id: createId(),
        store_id: bill.store_id,
        created_at: now,
        updated_at: now,
        _synced: false,
        bill_id: billId,
        action: 'deleted',
        field_changed: 'status',
        old_value: bill.status,
        new_value: softDelete ? 'cancelled' : 'deleted',
        change_reason: deleteReason || 'Bill deleted',
        changed_by: deletedBy,
        ip_address: null,
      });
    });
  }

  async getBillsWithDetails(storeId: string, includeDeleted: boolean = false): Promise<any[]> {
    const bills = await this.bills
      .where('store_id')
      .equals(storeId)
      .filter(bill => includeDeleted || !bill._deleted)
      .toArray();
    
    const billsWithDetails = await Promise.all(bills.map(async (bill) => {
      const lineItems = await this.bill_line_items.where('bill_id').equals(bill.id).toArray();
      const auditLogs = await this.bill_audit_logs.where('bill_id').equals(bill.id).toArray();
      
      return {
        ...bill,
        lineItems,
        auditLogs: auditLogs.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
      };
    }));
    
    return billsWithDetails.sort((a, b) => new Date(b.bill_date).getTime() - new Date(a.bill_date).getTime());
  }

  async addBillLineItem(billId: string, lineItem: Omit<BillLineItem, 'id' | 'bill_id' | keyof BaseEntity>, addedBy: string): Promise<void> {
    const bill = await this.bills.get(billId);
    if (!bill) throw new Error('Bill not found');
    
    return await this.transaction('rw', [this.bill_line_items, this.bills, this.bill_audit_logs], async () => {
      const now = new Date().toISOString();
      const lineItemId = createId();
      
      // Get next line order
      const existingItems = await this.bill_line_items.where('bill_id').equals(billId).toArray();
      const nextOrder = Math.max(0, ...existingItems.map(item => item.line_order)) + 1;
      
      const newLineItem: BillLineItem = {
        id: lineItemId,
        store_id: bill.store_id,
        created_at: now,
        updated_at: now,
        _synced: false,
        bill_id: billId,
        line_order: nextOrder ,
        ...lineItem
      };
      
      await this.bill_line_items.add(newLineItem);
      
      // Recalculate bill totals
      await this.recalculateBillTotals(billId);
      
      // Create audit log
      await this.bill_audit_logs.add({
        id: createId(),
        store_id: bill.store_id,
        created_at: now,
        updated_at: now,
        _synced: false,
        bill_id: billId,
        action: 'item_added',
        field_changed: 'line_items',
        old_value: null,
        new_value: JSON.stringify(newLineItem),
        change_reason: 'Line item added to bill',
        changed_by: addedBy,
        ip_address: null,
      });
    });
  }

  async updateBillLineItem(lineItemId: string, updates: Partial<BillLineItem>, updatedBy: string): Promise<void> {
    const originalItem = await this.bill_line_items.get(lineItemId);
    if (!originalItem) throw new Error('Line item not found');
    
    return await this.transaction('rw', [this.bill_line_items, this.bills, this.bill_audit_logs], async () => {
      const now = new Date().toISOString();
      
      // Update line item
      await this.bill_line_items.update(lineItemId, {
        ...updates,
        _synced: false
      });
      
      // Recalculate bill totals
      await this.recalculateBillTotals(originalItem.bill_id);
      
      // Create audit log for each changed field
      for (const [field, newValue] of Object.entries(updates)) {
        if (field !== '_synced') {
          const oldValue = (originalItem as any)[field];
          if (oldValue !== newValue) {
            await this.bill_audit_logs.add({
              id: createId(),
              store_id: originalItem.store_id,
              created_at: now,
              updated_at: now,
              _synced: false,
              bill_id: originalItem.bill_id,
              action: 'item_modified',
              field_changed: field,
              old_value: JSON.stringify(oldValue),
              new_value: JSON.stringify(newValue),
              change_reason: 'Line item updated',
              changed_by: updatedBy,
              ip_address: null,
            });
          }
        }
      }
    });
  }

  async removeBillLineItem(lineItemId: string, removedBy: string): Promise<void> {
    const lineItem = await this.bill_line_items.get(lineItemId);
    if (!lineItem) throw new Error('Line item not found');
    
    return await this.transaction('rw', [this.bill_line_items, this.bills, this.bill_audit_logs, this.inventory_items], async () => {
      const now = new Date().toISOString();
      
      // Restore inventory if applicable
      if (lineItem.inventory_item_id) {
        const inventoryItem = await this.inventory_items.get(lineItem.inventory_item_id);
        if (inventoryItem) {
          await this.inventory_items.update(lineItem.inventory_item_id, {
            quantity: inventoryItem.quantity + lineItem.quantity,
            _synced: false
          });
        }
      }
      
      // Remove line item
      await this.bill_line_items.delete(lineItemId);
      
      // Recalculate bill totals
      await this.recalculateBillTotals(lineItem.bill_id);
      
      // Create audit log
      await this.bill_audit_logs.add({
        id: createId(),
        store_id: lineItem.store_id,
        created_at: now,
        updated_at: now,
        _synced: false,
        bill_id: lineItem.bill_id,
        action: 'item_removed',
        field_changed: 'line_items',
        old_value: JSON.stringify(lineItem),
        new_value: null,
        change_reason: 'Line item removed from bill',
        changed_by: removedBy,
        ip_address: null,
      });
    });
  }

  private async recalculateBillTotals(billId: string): Promise<void> {
    const lineItems = await this.bill_line_items.where('bill_id').equals(billId).toArray();
    const subtotal = lineItems.reduce((sum, item) => sum + item.line_total, 0);
    
    const bill = await this.bills.get(billId);
    if (bill) {
      const totalAmount = subtotal;
      
      await this.bills.update(billId, {
        subtotal,
        total_amount: totalAmount,
        amount_due: totalAmount - (bill.amount_paid || 0),
        _synced: false
      });
    }
  }

  async getBillAuditTrail(billId: string): Promise<BillAuditLog[]> {
    return await this.bill_audit_logs
      .where('bill_id')
      .equals(billId)
      .reverse()
      .sortBy('created_at');
  }

  async searchBills(storeId: string, searchTerm: string, filters: {
    dateFrom?: string;
    dateTo?: string;
    paymentStatus?: string;
    customerId?: string;
    status?: string;
  } = {}): Promise<any[]> {
    let bills = await this.bills
      .where('store_id')
      .equals(storeId)
      .filter(bill => !bill._deleted)
      .toArray();
    
    // Apply search term
    if (searchTerm) {
      const searchLower = searchTerm.toLowerCase();
      bills = bills.filter(bill => 
        bill.bill_number.toLowerCase().includes(searchLower) ||
        (bill.customer_name && bill.customer_name.toLowerCase().includes(searchLower)) ||
        (bill.notes && bill.notes.toLowerCase().includes(searchLower))
      );
    }
    
    // Apply filters
    if (filters.dateFrom) {
      bills = bills.filter(bill => bill.bill_date >= filters.dateFrom!);
    }
    if (filters.dateTo) {
      bills = bills.filter(bill => bill.bill_date <= filters.dateTo!);
    }
    if (filters.paymentStatus) {
      bills = bills.filter(bill => bill.payment_status === filters.paymentStatus);
    }
    if (filters.customerId) {
      bills = bills.filter(bill => bill.customer_id === filters.customerId);
    }
    if (filters.status) {
      bills = bills.filter(bill => bill.status === filters.status);
    }
    
    // Get line items for each bill
    const billsWithDetails = await Promise.all(bills.map(async (bill) => {
      const lineItems = await this.bill_line_items.where('bill_id').equals(bill.id).toArray();
      return { ...bill, lineItems };
    }));
    
    return billsWithDetails.sort((a, b) => new Date(b.bill_date).getTime() - new Date(a.bill_date).getTime());
  }

  // Enhanced bill management methods for offline support
  async createBillWithLineItems(
    billData: Omit<Bill, 'id' | keyof BaseEntity>,
    lineItems: Omit<BillLineItem, 'id' | 'bill_id' | keyof BaseEntity>[]
  ): Promise<string> {
    const billId = createId();
    const now = new Date().toISOString();
    
    return await this.transaction('rw', [this.bills, this.bill_line_items, this.bill_audit_logs], async () => {
      // Create the bill
      const bill: Bill = {
        id: billId,
        store_id: billData.store_id,
        created_at: now,
        updated_at: now,
        _synced: false,
        ...billData
      };
      
      await this.bills.add(bill);
      
      // Create bill line items
      const billLineItems: BillLineItem[] = lineItems.map((item, index) => ({
        id: createId(),
        store_id: billData.store_id,
        created_at: now,
        updated_at: now,
        _synced: false,
        bill_id: billId,
        line_order: index + 1,
        ...item
      }));
      
      await this.bill_line_items.bulkAdd(billLineItems);
      
      // Create audit log entry
      await this.bill_audit_logs.add({
        id: createId(),
        store_id: billData.store_id,
        created_at: now,
        updated_at: now,
        _synced: false,
        bill_id: billId,
        action: 'created',
        field_changed: null,
        old_value: null,
        new_value: JSON.stringify(bill),
        change_reason: 'Bill created from POS transaction',
        changed_by: billData.created_by,
        ip_address: null,
      });
      
      return billId;
    });
  }

  async getBillsWithLineItems(storeId: string, filters?: {
    searchTerm?: string;
    dateFrom?: string;
    dateTo?: string;
    paymentStatus?: string;
    customerId?: string;
    status?: string;
    limit?: number;
    offset?: number;
  }): Promise<any[]> {
    let bills = await this.bills
      .where('store_id')
      .equals(storeId)
      .filter(bill => !bill._deleted)
      .toArray();
    
    // Apply filters
    if (filters?.searchTerm) {
      const searchLower = filters.searchTerm.toLowerCase();
      bills = bills.filter(bill => 
        bill.bill_number.toLowerCase().includes(searchLower) ||
        (bill.customer_name && bill.customer_name.toLowerCase().includes(searchLower)) ||
        (bill.notes && bill.notes.toLowerCase().includes(searchLower))
      );
    }
    
    if (filters?.dateFrom) {
      bills = bills.filter(bill => bill.bill_date >= filters.dateFrom!);
    }
    if (filters?.dateTo) {
      bills = bills.filter(bill => bill.bill_date <= filters.dateTo!);
    }
    if (filters?.paymentStatus) {
      bills = bills.filter(bill => bill.payment_status === filters.paymentStatus);
    }
    if (filters?.customerId) {
      bills = bills.filter(bill => bill.customer_id === filters.customerId);
    }
    if (filters?.status) {
      bills = bills.filter(bill => bill.status === filters.status);
    }
    
    // Sort by date
    bills.sort((a, b) => new Date(b.bill_date).getTime() - new Date(a.bill_date).getTime());
    
    // Apply pagination
    if (filters?.offset) {
      bills = bills.slice(filters.offset);
    }
    if (filters?.limit) {
      bills = bills.slice(0, filters.limit);
    }
    
    // Get line items and audit logs for each bill
    const billsWithDetails = await Promise.all(bills.map(async (bill) => {
      const [lineItems, auditLogs] = await Promise.all([
        this.bill_line_items.where('bill_id').equals(bill.id).sortBy('line_order'),
        this.bill_audit_logs.where('bill_id').equals(bill.id).reverse().sortBy('created_at')
      ]);
      
      return {
        ...bill,
        bill_line_items: lineItems,
        bill_audit_logs: auditLogs
      };
    }));
    
    return billsWithDetails;
  }

  async getBillDetails(billId: string): Promise<any | null> {
    const bill = await this.bills.get(billId);
    if (!bill) return null;
    
    const [lineItems, auditLogs] = await Promise.all([
      this.bill_line_items.where('bill_id').equals(billId).sortBy('line_order'),
      this.bill_audit_logs.where('bill_id').equals(billId).reverse().sortBy('created_at')
    ]);
    
    return {
      ...bill,
      bill_line_items: lineItems,
      bill_audit_logs: auditLogs
    };
  }

  async updateBillWithAudit(
    billId: string, 
    updates: Partial<Bill>, 
    changedBy: string, 
    changeReason?: string
  ): Promise<void> {
    const originalBill = await this.bills.get(billId);
    if (!originalBill) throw new Error('Bill not found');
    
    return await this.transaction('rw', [this.bills, this.bill_audit_logs], async () => {
      const now = new Date().toISOString();
      
      // Update the bill
      await this.bills.update(billId, {
        ...updates,
        last_modified_by: changedBy,
        last_modified_at: now,
        updated_at: now,
        _synced: false
      });
      
      // Log each changed field
      for (const [field, newValue] of Object.entries(updates)) {
        if (!['last_modified_by', 'last_modified_at', 'updated_at', '_synced'].includes(field)) {
          const oldValue = (originalBill as any)[field];
          if (oldValue !== newValue) {
            await this.bill_audit_logs.add({
              id: createId(),
              store_id: originalBill.store_id,
              created_at: now,
              updated_at: now,
              _synced: false,
              bill_id: billId,
              action: 'updated',
              field_changed: field,
              old_value: JSON.stringify(oldValue),
              new_value: JSON.stringify(newValue),
              change_reason: changeReason || 'Bill updated',
              changed_by: changedBy,
              ip_address: null,
            });
          }
        }
      }
    });
  }

  async deleteBillWithAudit(
    billId: string, 
    deletedBy: string, 
    deleteReason?: string, 
    softDelete: boolean = true
  ): Promise<void> {
    const bill = await this.bills.get(billId);
    if (!bill) throw new Error('Bill not found');
    
    return await this.transaction('rw', [this.bills, this.bill_line_items, this.bill_audit_logs, this.inventory_items], async () => {
      const now = new Date().toISOString();
      
      if (softDelete) {
        // Soft delete - mark as cancelled
        await this.bills.update(billId, {
          status: 'cancelled',
          last_modified_by: deletedBy,
          last_modified_at: now,
          updated_at: now,
          _synced: false,
          _deleted: true
        });
      } else {
        // Hard delete - remove from database
        await this.bills.delete(billId);
        await this.bill_line_items.where('bill_id').equals(billId).delete();
      }
      
      // Restore inventory quantities for deleted bill
      const lineItems = await this.bill_line_items.where('bill_id').equals(billId).toArray();
      for (const lineItem of lineItems) {
        if (lineItem.inventory_item_id) {
          const inventoryItem = await this.inventory_items.get(lineItem.inventory_item_id);
          if (inventoryItem) {
            await this.inventory_items.update(lineItem.inventory_item_id, {
              quantity: inventoryItem.quantity + lineItem.quantity,
              _synced: false
            });
          }
        }
      }
      
      // Create audit log entry
      await this.bill_audit_logs.add({
        id: createId(),
        store_id: bill.store_id,
        created_at: now,
        updated_at: now,
        _synced: false,
        bill_id: billId,
        action: 'deleted',
        field_changed: 'status',
        old_value: bill.status,
        new_value: softDelete ? 'cancelled' : 'deleted',
        change_reason: deleteReason || 'Bill deleted',
        changed_by: deletedBy,
        ip_address: null,
      });
    });
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