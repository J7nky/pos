import { db } from '../lib/db';
import { 
  Customer, 
  Supplier, 
  Transaction, 
  InventoryItem,
  Sale,
  SaleItem
} from '../types';

export interface SyncStatus {
  table: string;
  lastSync: string;
  recordCount: number;
  hasErrors: boolean;
  errorMessage?: string;
}

export interface DataIntegrityCheck {
  table: string;
  totalRecords: number;
  validRecords: number;
  orphanedRecords: number;
  issues: string[];
}

export class DataSyncService {
  private static instance: DataSyncService;
  private syncStatus: Map<string, SyncStatus> = new Map();

  private constructor() {
    this.initializeSyncStatus();
  }

  public static getInstance(): DataSyncService {
    if (!DataSyncService.instance) {
      DataSyncService.instance = new DataSyncService();
    }
    return DataSyncService.instance;
  }

  private initializeSyncStatus() {
    const tables = [
      'customers', 'suppliers', 'transactions', 
      'inventory_items', 'sales', 'sale_items'
    ];

    tables.forEach(table => {
      this.syncStatus.set(table, {
        table,
        lastSync: new Date().toISOString(),
        recordCount: 0,
        hasErrors: false
      });
    });
  }

  public async syncDataToLocalStorage(storeId: string): Promise<void> {
    try {
      console.log('🔄 Starting data synchronization...');

      // Sync customers
      await this.syncTable('customers', storeId, async () => {
        const customers = await db.customers.where('store_id').equals(storeId).toArray();
        const mappedCustomers = customers.map(c => ({
          id: c.id,
          name: c.name,
          phone: c.phone,
          email: c.email,
          address: c.address,
          balance: c.balance,
          isActive: c.is_active,
          createdAt: c.created_at
        }));
        localStorage.setItem('erp_customers', JSON.stringify(mappedCustomers));
        return mappedCustomers.length;
      });

      // Sync suppliers
      await this.syncTable('suppliers', storeId, async () => {
        const suppliers = await db.suppliers.where('store_id').equals(storeId).toArray();
        const mappedSuppliers = suppliers.map(s => ({
          id: s.id,
          name: s.name,
          phone: s.phone,
          email: s.email,
          address: s.address,
          type: s.type,
          isActive: s.is_active,
          balance: s.balance,
          createdAt: s.created_at
        }));
        localStorage.setItem('erp_suppliers', JSON.stringify(mappedSuppliers));
        return mappedSuppliers.length;
      });

      // Sync transactions
      await this.syncTable('transactions', storeId, async () => {
        const transactions = await db.transactions.where('store_id').equals(storeId).toArray();
        const mappedTransactions = transactions.map(t => ({
          id: t.id,
          type: t.type,
          category: t.category,
          amount: t.amount,
          currency: t.currency,
          description: t.description,
          reference: t.reference,
          createdAt: t.created_at,
          createdBy: t.created_by
        }));
        localStorage.setItem('erp_transactions', JSON.stringify(mappedTransactions));
        return mappedTransactions.length;
      });

      // Sync inventory items
      await this.syncTable('inventory_items', storeId, async () => {
        const inventory = await db.inventory_items.where('store_id').equals(storeId).toArray();
        const mappedInventory = inventory.map(item => ({
          id: item.id,
          productId: item.product_id,
          supplierId: item.supplier_id,
          type: item.type,
          quantity: item.quantity,
          receivedQuantity: item.received_quantity,
          unit: item.unit,
          weight: item.weight,
          porterage: item.porterage,
          transferFee: item.transfer_fee,
          price: item.price,
          commissionRate: item.commission_rate,
          notes: item.notes,
          receivedAt: item.received_at,
          receivedBy: item.received_by,
          createdAt: item.created_at
        }));
        localStorage.setItem('erp_inventory', JSON.stringify(mappedInventory));
        return mappedInventory.length;
      });

      // Sync sale_items
      await this.syncTable('sale_items', storeId, async () => {
        const saleItems = await db.sale_items.toArray();
        
        const mappedSaleItems = saleItems.map(item => ({
          id: item.id,
          inventoryItemId: item.inventory_item_id,
          productId: item.product_id,
          supplierId: item.supplier_id,
          weight: item.weight,
          unitPrice: item.unit_price,
          receivedValue: item.received_value,
          paymentMethod: item.payment_method,
          notes: item.notes,
          customerId: item.customer_id,
          createdAt: item.created_at,
          createdBy: item.created_by
        }));
        localStorage.setItem('erp_sale_items', JSON.stringify(mappedSaleItems));
        return mappedSaleItems.length;
      });

      console.log('✅ Data synchronization completed successfully');

    } catch (error) {
      console.error('❌ Data synchronization failed:', error);
      throw error;
    }
  }

  private async syncTable(
    tableName: string, 
    storeId: string, 
    syncFunction: () => Promise<number>
  ): Promise<void> {
    try {
      const recordCount = await syncFunction();
      const status = this.syncStatus.get(tableName);
      if (status) {
        status.recordCount = recordCount;
        status.lastSync = new Date().toISOString();
        status.hasErrors = false;
        status.errorMessage = undefined;
      }
      console.log(`✅ Synced ${tableName}: ${recordCount} records`);
    } catch (error) {
      const status = this.syncStatus.get(tableName);
      if (status) {
        status.hasErrors = true;
        status.errorMessage = error instanceof Error ? error.message : 'Unknown error';
      }
      console.error(`❌ Failed to sync ${tableName}:`, error);
      throw error;
    }
  }

  public getSyncStatus(): SyncStatus[] {
    return Array.from(this.syncStatus.values());
  }

  public async validateDataIntegrity(storeId: string): Promise<DataIntegrityCheck[]> {
    const checks: DataIntegrityCheck[] = [];

    try {
      // Check customers
      const customers = await db.customers.where('store_id').equals(storeId).toArray();
      const validCustomers = customers.filter(c => 
        c.name && c.phone && c.is_active !== undefined
      );
      checks.push({
        table: 'customers',
        totalRecords: customers.length,
        validRecords: validCustomers.length,
        orphanedRecords: customers.length - validCustomers.length,
        issues: customers.length - validCustomers.length > 0 ? ['Invalid customer records found'] : []
      });

      // Check suppliers
      const suppliers = await db.suppliers.where('store_id').equals(storeId).toArray();
      const validSuppliers = suppliers.filter(s => 
        s.name && s.phone && s.type && s.is_active !== undefined
      );
      checks.push({
        table: 'suppliers',
        totalRecords: suppliers.length,
        validRecords: validSuppliers.length,
        orphanedRecords: suppliers.length - validSuppliers.length,
        issues: suppliers.length - validSuppliers.length > 0 ? ['Invalid supplier records found'] : []
      });

      // Check inventory items
      const inventory = await db.inventory_items.where('store_id').equals(storeId).toArray();
      const validInventory = inventory.filter(item => 
        item.product_id && item.supplier_id && item.quantity >= 0
      );
      checks.push({
        table: 'inventory_items',
        totalRecords: inventory.length,
        validRecords: validInventory.length,
        orphanedRecords: inventory.length - validInventory.length,
        issues: inventory.length - validInventory.length > 0 ? ['Invalid inventory records found'] : []
      });

      // Check for orphaned records
      const orphanedChecks = await this.checkOrphanedRecords(storeId);
      checks.push(...orphanedChecks);

    } catch (error) {
      console.error('❌ Data integrity check failed:', error);
    }

    return checks;
  }

  private async checkOrphanedRecords(storeId: string): Promise<DataIntegrityCheck[]> {
    const checks: DataIntegrityCheck[] = [];

    try {
      // Get all related data
      const products = await db.products.where('store_id').equals(storeId).toArray();
      const suppliers = await db.suppliers.where('store_id').equals(storeId).toArray();
      const customers = await db.customers.where('store_id').equals(storeId).toArray();
      const inventory = await db.inventory_items.where('store_id').equals(storeId).toArray();
      const saleItems = await db.sale_items.toArray();

      const productIds = new Set(products.map(p => p.id));
      const supplierIds = new Set(suppliers.map(s => s.id));
      const customerIds = new Set(customers.map(c => c.id));

      // Check orphaned inventory items
      const orphanedInventory = inventory.filter(item => 
        !productIds.has(item.product_id) || !supplierIds.has(item.supplier_id)
      );
      checks.push({
        table: 'orphaned_inventory',
        totalRecords: inventory.length,
        validRecords: inventory.length - orphanedInventory.length,
        orphanedRecords: orphanedInventory.length,
        issues: orphanedInventory.length > 0 ? ['Inventory items with invalid product or supplier references'] : []
      });

      // Check orphaned sale items
      const orphanedSaleItems = saleItems.filter(item => 
        !productIds.has(item.product_id) || !supplierIds.has(item.supplier_id)
      );
      checks.push({
        table: 'orphaned_sale_items',
        totalRecords: saleItems.length,
        validRecords: saleItems.length - orphanedSaleItems.length,
        orphanedRecords: orphanedSaleItems.length,
        issues: orphanedSaleItems.length > 0 ? ['Sale items with invalid product or supplier references'] : []
      });

    } catch (error) {
      console.error('❌ Orphaned records check failed:', error);
    }

    return checks;
  }

  public async cleanupOrphanedRecords(storeId: string): Promise<number> {
    let cleanedCount = 0;

    try {
      console.log('🧹 Starting orphaned records cleanup...');

      // Get all related data
      const products = await db.products.where('store_id').equals(storeId).toArray();
      const suppliers = await db.suppliers.where('store_id').equals(storeId).toArray();
      const inventory = await db.inventory_items.where('store_id').equals(storeId).toArray();
      const saleItems = await db.sale_items.toArray();

      const productIds = new Set(products.map(p => p.id));
      const supplierIds = new Set(suppliers.map(s => s.id));

      // Clean up orphaned inventory items
      const orphanedInventory = inventory.filter(item => 
        !productIds.has(item.product_id) || !supplierIds.has(item.supplier_id)
      );
      if (orphanedInventory.length > 0) {
        await db.inventory_items.bulkDelete(orphanedInventory.map(item => item.id));
        cleanedCount += orphanedInventory.length;
        console.log(`🗑️ Removed ${orphanedInventory.length} orphaned inventory items`);
      }

      // Clean up orphaned sale items
      const orphanedSaleItems = saleItems.filter(item => 
        !productIds.has(item.product_id) || !supplierIds.has(item.supplier_id)
      );
      if (orphanedSaleItems.length > 0) {
        await db.sale_items.bulkDelete(orphanedSaleItems.map(item => item.id));
        cleanedCount += orphanedSaleItems.length;
        console.log(`🗑️ Removed ${orphanedSaleItems.length} orphaned sale items`);
      }

      console.log(`✅ Cleanup completed: ${cleanedCount} records removed`);

    } catch (error) {
      console.error('❌ Cleanup failed:', error);
      throw error;
    }

    return cleanedCount;
  }

  public async reloadAllData(storeId: string): Promise<void> {
    console.log('🔄 Reloading all data...');
    await this.syncDataToLocalStorage(storeId);
    
    // Force reload of ERP Financial Service
    const { erpFinancialService } = await import('./erpFinancialService');
    erpFinancialService.reloadData();
    
    console.log('✅ All data reloaded successfully');
  }
}

export const dataSyncService = DataSyncService.getInstance(); 