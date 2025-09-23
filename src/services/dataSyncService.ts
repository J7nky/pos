// import { db } from '../lib/db';
// import { 
//   Customer, 
//   Supplier, 
//   Transaction, 
//   InventoryItem,
//   SaleItem
// } from '../types';

// export interface SyncStatus {
//   table: string;
//   lastSync: string;
//   recordCount: number;
//   hasErrors: boolean;
//   errorMessage?: string;
// }

// export interface DataIntegrityCheck {
//   table: string;
//   totalRecords: number;
//   validRecords: number;
//   orphanedRecords: number;
//   issues: string[];
// }

// export class DataSyncService {
//   private static instance: DataSyncService;
//   private syncStatus: Map<string, SyncStatus> = new Map();

//   private constructor() {
//     this.initializeSyncStatus();
//   }

//   public static getInstance(): DataSyncService {
//     if (!DataSyncService.instance) {
//       DataSyncService.instance = new DataSyncService();
//     }
//     return DataSyncService.instance;
//   }

//   private initializeSyncStatus() {
//     const tables = [
//       'customers', 'suppliers', 'transactions', 
//       'inventory_items', 'bill_line_items'
//     ];

//     tables.forEach(table => {
//       this.syncStatus.set(table, {
//         table,
//         lastSync: new Date().toISOString(),
//         recordCount: 0,
//         hasErrors: false
//       });
//     });
//   }

//   public async validateDataIntegrity(storeId: string): Promise<DataIntegrityCheck[]> {
//     const checks: DataIntegrityCheck[] = [];

//     try {
//       // Check customers
//       const customers = await db.customers.where('store_id').equals(storeId).toArray();
//       const validCustomers = customers.filter(c => 
//         c.name && c.phone && c.is_active !== undefined
//       );
//       checks.push({
//         table: 'customers',
//         totalRecords: customers.length,
//         validRecords: validCustomers.length,
//         orphanedRecords: customers.length - validCustomers.length,
//         issues: customers.length - validCustomers.length > 0 ? ['Invalid customer records found'] : []
//       });

//       // Check suppliers
//       const suppliers = await db.suppliers.where('store_id').equals(storeId).toArray();
//       const validSuppliers = suppliers.filter(s => 
//         s.name && s.phone 
//       );
//       checks.push({
//         table: 'suppliers',
//         totalRecords: suppliers.length,
//         validRecords: validSuppliers.length,
//         orphanedRecords: suppliers.length - validSuppliers.length,
//         issues: suppliers.length - validSuppliers.length > 0 ? ['Invalid supplier records found'] : []
//       });

//       // Check inventory items
//       const inventory = await db.inventory_items.where('store_id').equals(storeId).toArray();
//       const validInventory = inventory.filter(item => 
//         item.product_id && item.supplier_id && item.quantity >= 0
//       );
//       checks.push({
//         table: 'inventory_items',
//         totalRecords: inventory.length,
//         validRecords: validInventory.length,
//         orphanedRecords: inventory.length - validInventory.length,
//         issues: inventory.length - validInventory.length > 0 ? ['Invalid inventory records found'] : []
//       });

//       // Check for orphaned records
//       const orphanedChecks = await this.checkOrphanedRecords(storeId);
//       checks.push(...orphanedChecks);

//     } catch (error) {
//       console.error('❌ Data integrity check failed:', error);
//     }

//     return checks;
//   }


//   public getSyncStatus(): SyncStatus[] {
//     return Array.from(this.syncStatus.values());
//   }

//   public async validateDataIntegrity(storeId: string): Promise<DataIntegrityCheck[]> {
//     const checks: DataIntegrityCheck[] = [];

//     try {
//       // Check customers
//       const customers = await db.customers.where('store_id').equals(storeId).toArray();
//       const validCustomers = customers.filter(c => 
//         c.name && c.phone && c.is_active !== undefined
//       );
//       checks.push({
//         table: 'customers',
//         totalRecords: customers.length,
//         validRecords: validCustomers.length,
//         orphanedRecords: customers.length - validCustomers.length,
//         issues: customers.length - validCustomers.length > 0 ? ['Invalid customer records found'] : []
//       });

//       // Check suppliers
//       const suppliers = await db.suppliers.where('store_id').equals(storeId).toArray();
//       const validSuppliers = suppliers.filter(s => 
//         s.name && s.phone 
//       );
//       checks.push({
//         table: 'suppliers',
//         totalRecords: suppliers.length,
//         validRecords: validSuppliers.length,
//         orphanedRecords: suppliers.length - validSuppliers.length,
//         issues: suppliers.length - validSuppliers.length > 0 ? ['Invalid supplier records found'] : []
//       });

//       // Check inventory items
//       const inventory = await db.inventory_items.where('store_id').equals(storeId).toArray();
//       const validInventory = inventory.filter(item => 
//         item.product_id && item.supplier_id && item.quantity >= 0
//       );
//       checks.push({
//         table: 'inventory_items',
//         totalRecords: inventory.length,
//         validRecords: validInventory.length,
//         orphanedRecords: inventory.length - validInventory.length,
//         issues: inventory.length - validInventory.length > 0 ? ['Invalid inventory records found'] : []
//       });

//       // Check for orphaned records
//       const orphanedChecks = await this.checkOrphanedRecords(storeId);
//       checks.push(...orphanedChecks);

//     } catch (error) {
//       console.error('❌ Data integrity check failed:', error);
//     }

//     return checks;
//   }

//   private async checkOrphanedRecords(storeId: string): Promise<DataIntegrityCheck[]> {
//     const checks: DataIntegrityCheck[] = [];

//     try {
//       // Get all related data
//       const products = await db.products.where('store_id').equals(storeId).toArray();
//       const suppliers = await db.suppliers.where('store_id').equals(storeId).toArray();
//       const customers = await db.customers.where('store_id').equals(storeId).toArray();
//       const inventory = await db.inventory_items.where('store_id').equals(storeId).toArray();
//       const billLineItems = await db.bill_line_items.toArray();

//       const productIds = new Set(products.map(p => p.id));
//       const supplierIds = new Set(suppliers.map(s => s.id));
//       const customerIds = new Set(customers.map(c => c.id));

//       // Check orphaned inventory items
//       const orphanedInventory = inventory.filter(item => 
//         !productIds.has(item.product_id) || !supplierIds.has(item.supplier_id)
//       );
//       checks.push({
//         table: 'orphaned_inventory',
//         totalRecords: inventory.length,
//         validRecords: inventory.length - orphanedInventory.length,
//         orphanedRecords: orphanedInventory.length,
//         issues: orphanedInventory.length > 0 ? ['Inventory items with invalid product or supplier references'] : []
//       });

//       // Check orphaned bill line items
//       const orphanedBillLineItems = billLineItems.filter(item => 
//         !productIds.has(item.product_id) || !supplierIds.has(item.supplier_id)
//       );
//       checks.push({
//         table: 'orphaned_bill_line_items',
//         totalRecords: billLineItems.length,
//         validRecords: billLineItems.length - orphanedBillLineItems.length,
//         orphanedRecords: orphanedBillLineItems.length,
//         issues: orphanedBillLineItems.length > 0 ? ['Bill line items with invalid product or supplier references'] : []
//       });

//     } catch (error) {
//       console.error('❌ Orphaned records check failed:', error);
//     }

//     return checks;
//   }

//   public async cleanupOrphanedRecords(storeId: string): Promise<number> {
//     let cleanedCount = 0;

//     try {
//       console.log('🧹 Starting orphaned records cleanup...');

//       // Get all related data
//       const products = await db.products.where('store_id').equals(storeId).toArray();
//       const suppliers = await db.suppliers.where('store_id').equals(storeId).toArray();
//       const inventory = await db.inventory_items.where('store_id').equals(storeId).toArray();
//       const billLineItems = await db.bill_line_items.toArray();

//       const productIds = new Set(products.map(p => p.id));
//       const supplierIds = new Set(suppliers.map(s => s.id));

//       // Clean up orphaned inventory items
//       const orphanedInventory = inventory.filter(item => 
//         !productIds.has(item.product_id) || !supplierIds.has(item.supplier_id)
//       );
//       if (orphanedInventory.length > 0) {
//         await db.inventory_items.bulkDelete(orphanedInventory.map(item => item.id));
//         cleanedCount += orphanedInventory.length;
//         console.log(`🗑️ Removed ${orphanedInventory.length} orphaned inventory items`);
//       }

//       // Clean up orphaned bill line items
//       const orphanedBillLineItems = billLineItems.filter(item => 
//         !productIds.has(item.product_id) || !supplierIds.has(item.supplier_id)
//       );
//       if (orphanedBillLineItems.length > 0) {
//         await db.bill_line_items.bulkDelete(orphanedBillLineItems.map(item => item.id));
//         cleanedCount += orphanedBillLineItems.length;
//         console.log(`🗑️ Removed ${orphanedBillLineItems.length} orphaned bill line items`);
//       }

//       console.log(`✅ Cleanup completed: ${cleanedCount} records removed`);

//     } catch (error) {
//       console.error('❌ Cleanup failed:', error);
//       throw error;
//     }

//     return cleanedCount;
//   }

//   public async reloadAllData(storeId: string): Promise<void> {
//     console.log('🔄 Reloading all data...');
    
//     // Force reload of ERP Financial Service
//     const { erpFinancialService } = await import('./erpFinancialService');
//     await erpFinancialService.reloadData(storeId);
    
//     console.log('✅ All data reloaded successfully');
//   }
// }

// export const dataSyncService = DataSyncService.getInstance(); 