// @ts-nocheck
/* eslint-disable */
import { db } from '../lib/db';
import { supabase } from '../lib/supabase';
import { Database } from '../types/database';

type Tables = Database['public']['Tables'];

// Sync configuration
const SYNC_CONFIG = {
  batchSize: 100, // Increased from 50 for fewer round trips
  maxRetries: 3,
  retryDelay: 1000, // ms
  syncInterval: 30000, // 30 seconds
};

// Table mapping for sync operations
const SYNC_TABLES = [
  'products',
  'suppliers', 
  'customers',
  'inventory_batches',
  'inventory_items',
  'sale_items',
  'transactions',
  'bills',
  'bill_line_items',
  'bill_audit_logs',
  'cash_drawer_accounts',
  'cash_drawer_sessions'
] as const;

type SyncTable = typeof SYNC_TABLES[number];

export interface SyncResult {
  success: boolean;
  errors: string[];
  synced: {
    uploaded: number;
    downloaded: number;
  };
  conflicts: number;
}

export class SyncService {
  private isRunning = false;
  private lastSyncAttempt: Date | null = null;
  private validationCache: {
    products: Set<string>;
    suppliers: Set<string>;
    users: Set<string>;
    lastUpdated: Date | null;
    storeId: string | null;
    batches:Set<string>
  } = {
    products: new Set(),
    suppliers: new Set(), 
    users: new Set(),
    lastUpdated: null,
    storeId: null,
    batches: new Set()
  };

  /**
   * Refresh validation cache for foreign key validation
   */
  private async refreshValidationCache(storeId: any) {
    const cacheAge = this.validationCache.lastUpdated 
      ? Date.now() - this.validationCache.lastUpdated.getTime() 
      : Infinity;
    
    // Cache is valid for 5 minutes and same store
    if (cacheAge < 300000 && this.validationCache.storeId === storeId) {
      console.log(`💾 Using cached validation data (age: ${Math.round(cacheAge / 1000)}s)`);
      return;
    }
    
    console.log(`🔄 Refreshing validation cache for store: ${storeId}`);

    try {
      const [productsResult, suppliersResult, usersResult,batchesResult] = await Promise.all([
        supabase.from('products').select('id').eq('store_id', storeId),
        supabase.from('suppliers').select('id').eq('store_id', storeId),
        supabase.from('users').select('id').eq('store_id', storeId),
        supabase
  .from('inventory_batches')
  .select('id')
  .eq('store_id', storeId)
      ]);

      this.validationCache.products = new Set(productsResult.data?.map(p => p.id) || []);
      this.validationCache.suppliers = new Set(suppliersResult.data?.map(s => s.id) || []);
      this.validationCache.users = new Set(usersResult.data?.map(u => u.id) || []);
      this.validationCache.batches = new Set(batchesResult.data?.map(b => b.id) || []);
      this.validationCache.lastUpdated = new Date();
      this.validationCache.storeId = storeId;
      
      console.log(`✅ Validation cache updated: ${this.validationCache.products.size} products, ${this.validationCache.suppliers.size} suppliers, ${this.validationCache.users.size} users, ${this.validationCache.batches.size} batches`);

    } catch (error) {
      console.warn('Failed to refresh validation cache:', error);
    }
  }

  /**
   * Main sync function - performs bi-directional sync
   */
  async sync(storeId: string): Promise<SyncResult> {
    if (this.isRunning) {
      throw new Error('Sync already in progress');
    }

    this.isRunning = true;
    this.lastSyncAttempt = new Date();

    const result: SyncResult = {
      success: true,
      errors: [],
      synced: { uploaded: 0, downloaded: 0 },
      conflicts: 0
    };

    try {
      // Check connectivity
      const { error: connectionError } = await supabase.from('products').select('id').limit(1);
      if (connectionError) {
        throw new Error(`Connection failed: ${connectionError.message}`);
      }

      // Track table dependencies to ensure proper sync order
      const tableDependencies: { [key: string]: string[] } = {
        'bill_line_items': ['bills'],
        'bill_audit_logs': ['bills'],
        'cash_drawer_sessions': ['cash_drawer_accounts']
      };

      // 1. Upload local changes to Supabase
      const uploadResult = await this.uploadLocalChanges(storeId, tableDependencies);
      result.synced.uploaded = uploadResult.uploaded;
      result.errors.push(...uploadResult.errors);

      // 2. Download remote changes from Supabase  
      const downloadResult = await this.downloadRemoteChanges(storeId);
      result.synced.downloaded = downloadResult.downloaded;
      result.conflicts += downloadResult.conflicts;
      result.errors.push(...downloadResult.errors);

      // 3. Process pending sync operations
      await this.processPendingSyncs();

      result.success = result.errors.length === 0;

    } catch (error) {
      result.success = false;
      result.errors.push(error instanceof Error ? error.message : 'Unknown sync error');
    } finally {
      this.isRunning = false;
    }

    return result;
  }

  /**
   * Upload local unsynced changes to Supabase
   */
  private async uploadLocalChanges(storeId: string, tableDependencies: { [key: string]: string[] }) {
    const result = { uploaded: 0, errors: [] as string[] };

    for (const tableName of SYNC_TABLES) {
      try {
        console.log(`📤 Processing table: ${tableName} (${SYNC_TABLES.indexOf(tableName) + 1}/${SYNC_TABLES.length})`);
        
        // Check if this table has dependencies that need to be processed first
        const dependencies = tableDependencies[tableName] || [];
        if (dependencies.length > 0) {
          console.log(`🔗 Table ${tableName} has dependencies: ${dependencies.join(', ')}`);
          
          // Check if all dependencies have been processed in this sync cycle
          let depsReady = true;
          for (const depTable of dependencies) {
            const depMetadata = await db.getSyncMetadata(depTable);
            if (!depMetadata?.last_synced_at || 
                new Date(depMetadata.last_synced_at) < this.lastSyncAttempt!) {
              depsReady = false;
              console.log(`⏳ Skipping ${tableName} - dependency ${depTable} not yet processed in this sync cycle`);
              break;
            }
          }
          if (!depsReady) {
            continue; // Skip uploading this table for now
          }
        }
        
                 // Get unsynced records for this table
         const table = (db as any)[tableName];
         const activeRecords = await table.filter((record: any) => !record._synced && !record._deleted).toArray();
         const deletedRecords = await table.filter((record: any) => record._deleted && !record._synced).toArray();

         if (activeRecords.length === 0 && deletedRecords.length === 0) {
           console.log(`  ⏭️  No unsynced records for ${tableName}`);
           continue;
         }
         
         console.log(`  📊 Found ${activeRecords.length} active and ${deletedRecords.length} deleted unsynced records for ${tableName}`);

        // Filter out deleted records for separate handling
        let activeRecordsFiltered = activeRecords.filter((r: any) => !r._deleted);
        const deletedRecordsFiltered = deletedRecords.filter((r: any) => r._deleted);

         // Additional validation for inventory_items
         if (tableName === 'inventory_items') {
           const validRecords = [];
           const invalidRecords = [];
           
           // Use cached validation data to avoid repeated queries
           await this.refreshValidationCache(storeId);
           const validProductIds = this.validationCache.products;
           const validSupplierIds = this.validationCache.suppliers;
           const validUserIds = this.validationCache.users;
           const validBatchIds = this.validationCache.batches;
           
           // Get local batch IDs to check against first (since batches are synced before items)
           let localBatchIds: Set<string>;
           try {
             const localBatches = await db.inventory_batches.toArray();
             localBatchIds = new Set(localBatches.map(b => b.id));
             console.log(`🔍 Found ${localBatchIds.size} local batch IDs for validation`);
           } catch (error) {
             console.warn('Failed to get local batch IDs for validation:', error);
             localBatchIds = new Set();
           }
           
           for (const record of activeRecordsFiltered) {
             // Check quantity constraint
             if (record.quantity < 0) {
               // Allow quantity = 0 to preserve historical inventory entries
               invalidRecords.push({ record, reason: 'quantity < 0' });
               continue;
             }
             
             // Check batch_id constraint - first check local, then server
             if (record.batch_id) {
               if (!localBatchIds.has(record.batch_id) && !validBatchIds.has(record.batch_id)) {
                 invalidRecords.push({ record, reason: `invalid batch_id: ${record.batch_id} (not found locally or on server)` });
                 continue;
               } else {
                 console.log(`✅ Batch ID ${record.batch_id} validated successfully (found ${localBatchIds.has(record.batch_id) ? 'locally' : 'on server'})`);
               }
             }
             
             // Check foreign key constraints
             if (!validProductIds.has(record.product_id)) {
               invalidRecords.push({ record, reason: `invalid product_id: ${record.product_id}` });
               continue;
             }
             
             if (!validSupplierIds.has(record.supplier_id)) {
               invalidRecords.push({ record, reason: `invalid supplier_id: ${record.supplier_id}` });
               continue;
             }
             
             if (!validUserIds.has(record.received_by)) {
               invalidRecords.push({ record, reason: `invalid received_by: ${record.received_by}` });
               continue;
             }
             
             validRecords.push(record);
           }
           
           // Delete invalid inventory items locally and remove from sync queue
           for (const invalid of invalidRecords) {
             console.warn(`🚫 Removing invalid inventory item: ${invalid.reason}`, invalid.record);
             await db.inventory_items.delete(invalid.record.id);
           }
           
           activeRecordsFiltered = validRecords;
           
           if (invalidRecords.length > 0) {
             console.log(`🧹 Cleaned ${invalidRecords.length} invalid inventory items (quantity/FK violations)`);
           }
         }

         // Additional validation for bills
         if (tableName === 'bills') {
           const validRecords = [];
           const invalidRecords = [];
           
           // Use cached validation data to avoid repeated queries
           await this.refreshValidationCache(storeId);
           const validCustomerIds = new Set();
           const validUserIds = this.validationCache.users;
           
           // Get valid customer IDs
           try {
             const { data: customers } = await supabase
               .from('customers')
               .select('id')
               .eq('store_id', storeId);
             customers?.forEach(c => validCustomerIds.add(c.id));
           } catch (error) {
             console.warn('Failed to get customer IDs for validation:', error);
           }
           
           for (const record of activeRecordsFiltered) {
             // Check required fields
             if (!record.bill_number || !record.total_amount || !record.payment_method) {
               invalidRecords.push({ record, reason: 'missing required fields' });
               continue;
             }
             
             // Check foreign key constraints
             if (record.customer_id && !validCustomerIds.has(record.customer_id)) {
               invalidRecords.push({ record, reason: `invalid customer_id: ${record.customer_id}` });
               continue;
             }
             
             if (!validUserIds.has(record.created_by)) {
               invalidRecords.push({ record, reason: `invalid created_by: ${record.created_by}` });
               continue;
             }
             
             // CRITICAL: Ensure bills don't contain line item fields
             const lineItemFields = ['inventory_item_id', 'product_id', 'supplier_id', 'quantity', 'unit_price', 'line_total', 'weight', 'line_order'];
             const foundLineItemFields = lineItemFields.filter(field => record[field] !== undefined);
             
             if (foundLineItemFields.length > 0) {
               console.warn(`🚫 Bill ${record.id} contains line item fields: ${foundLineItemFields.join(', ')}`);
               console.warn(`🚫 Bill data before cleaning:`, Object.keys(record));
               
               // Remove line item fields that shouldn't be in bills
               foundLineItemFields.forEach(field => {
                 console.warn(`🚫 Removing field '${field}' with value:`, record[field]);
                 delete record[field];
               });
               
               console.warn(`🚫 Bill data after cleaning:`, Object.keys(record));
             }
             
             validRecords.push(record);
           }
           
           // Remove invalid bills from sync queue
           for (const invalid of invalidRecords) {
             console.warn(`🚫 Removing invalid bill from sync: ${invalid.reason}`, invalid.record);
             await db.markAsSynced(tableName, invalid.record.id);
           }
           
           activeRecordsFiltered = validRecords;
           
           if (invalidRecords.length > 0) {
             console.log(`🧹 Cleaned ${invalidRecords.length} invalid bills (validation violations)`);
           }
         }

         // Additional validation for bill_line_items
         if (tableName === 'bill_line_items') {
           const validRecords = [];
           const invalidRecords = [];
           
           // Use cached validation data to avoid repeated queries
           await this.refreshValidationCache(storeId);
           const validProductIds = this.validationCache.products;
           const validSupplierIds = this.validationCache.suppliers;
           
           // CRITICAL: Check if referenced bills exist in Supabase before uploading bill_line_items
           const billIds = [...new Set(activeRecordsFiltered.map(record => record.bill_id))];
           let validBillIds: Set<string>;
           
           try {
             const { data: billsData, error: billsError } = await supabase
               .from('bills')
               .select('id')
               .in('id', billIds);
             
             if (billsError) {
               console.warn('Failed to validate bill IDs:', billsError);
               // If we can't validate bills, skip this table for now
               console.log(`⏳ Skipping bill_line_items sync - cannot validate bill dependencies`);
               continue;
             }
             
             validBillIds = new Set(billsData?.map(b => b.id) || []);
           } catch (error) {
             console.warn('Failed to validate bill IDs:', error);
             // If we can't validate bills, skip this table for now
             console.log(`⏳ Skipping bill_line_items sync - cannot validate bill dependencies`);
             continue;
           }
           
           for (const record of activeRecordsFiltered) {
             // Check required fields
             if (!record.bill_id || !record.product_id || !record.supplier_id || !record.quantity) {
               invalidRecords.push({ record, reason: 'missing required fields' });
               continue;
             }
             
             // Check if referenced bill exists in Supabase
             if (!validBillIds.has(record.bill_id)) {
               invalidRecords.push({ record, reason: `referenced bill_id ${record.bill_id} does not exist in Supabase` });
               continue;
             }
             
             // Check foreign key constraints
             if (!validProductIds.has(record.product_id)) {
               invalidRecords.push({ record, reason: `invalid product_id: ${record.product_id}` });
               continue;
             }
             
             if (!validSupplierIds.has(record.supplier_id)) {
               invalidRecords.push({ record, reason: `invalid supplier_id: ${record.supplier_id}` });
               continue;
             }
             
             validRecords.push(record);
           }
           
           // Remove invalid bill line items from sync queue
           for (const invalid of invalidRecords) {
             console.warn(`🚫 Removing invalid bill line item from sync: ${invalid.reason}`, invalid.record);
             
             // If the record was skipped due to missing bill dependency, mark it for retry
             if (invalid.reason.includes('does not exist in Supabase')) {
               console.log(`🔄 Marking bill line item for retry due to missing bill dependency: ${invalid.record.id}`);
               // Don't mark as synced - let it be retried in the next sync cycle
             } else {
               // Mark as synced only for truly invalid records
               await db.markAsSynced(tableName, invalid.record.id);
             }
           }
           
           activeRecordsFiltered = validRecords;
           
           if (invalidRecords.length > 0) {
             console.log(`🧹 Cleaned ${invalidRecords.length} invalid bill line items (validation violations)`);
             
             // Log summary of skipped records
             const skippedForDependency = invalidRecords.filter(r => r.reason.includes('does not exist in Supabase'));
             const skippedForValidation = invalidRecords.filter(r => !r.reason.includes('does not exist in Supabase'));
             
             if (skippedForDependency.length > 0) {
               console.log(`⏳ ${skippedForDependency.length} bill line items skipped due to missing bill dependencies (will retry next sync)`);
             }
             if (skippedForValidation.length > 0) {
               console.log(`❌ ${skippedForValidation.length} bill line items skipped due to validation errors (marked as synced)`);
             }
           }
         }

         // Additional validation for bill_audit_logs
         if (tableName === 'bill_audit_logs') {
           const validRecords = [];
           const invalidRecords = [];
           
           // Use cached validation data to avoid repeated queries
           await this.refreshValidationCache(storeId);
           const validUserIds = this.validationCache.users;
           
           // CRITICAL: Check if referenced bills exist in Supabase before uploading bill_audit_logs
           const billIds = [...new Set(activeRecordsFiltered.map(record => record.bill_id))];
           let validBillIds: Set<string>;
           
           try {
             const { data: billsData, error: billsError } = await supabase
               .from('bills')
               .select('id')
               .in('id', billIds);
             
             if (billsError) {
               console.warn('Failed to validate bill IDs:', billsError);
               // If we can't validate bills, skip this table for now
               console.log(`⏳ Skipping bill_audit_logs sync - cannot validate bill dependencies`);
               continue;
             }
             
             validBillIds = new Set(billsData?.map(b => b.id) || []);
           } catch (error) {
             console.warn('Failed to validate bill IDs:', error);
             // If we can't validate bills, skip this table for now
             console.log(`⏳ Skipping bill_audit_logs sync - cannot validate bill dependencies`);
             continue;
           }
           
           for (const record of activeRecordsFiltered) {
             // Check required fields
             if (!record.bill_id || !record.action || !record.changed_by) {
               invalidRecords.push({ record, reason: 'missing required fields' });
               continue;
             }
             
             // Check if referenced bill exists in Supabase
             if (!validBillIds.has(record.bill_id)) {
               invalidRecords.push({ record, reason: `referenced bill_id ${record.bill_id} does not exist in Supabase` });
               continue;
             }
             
             // Check foreign key constraints
             if (!validUserIds.has(record.changed_by)) {
               invalidRecords.push({ record, reason: `invalid changed_by: ${record.changed_by}` });
               continue;
             }
             
             validRecords.push(record);
           }
           
           // Remove invalid bill audit logs from sync queue
           for (const invalid of invalidRecords) {
             console.warn(`🚫 Removing invalid bill audit log from sync: ${invalid.reason}`, invalid.record);
             
             // If the record was skipped due to missing bill dependency, mark it for retry
             if (invalid.reason.includes('does not exist in Supabase')) {
               console.log(`🔄 Marking bill audit log for retry due to missing bill dependency: ${invalid.record.id}`);
               // Don't mark as synced - let it be retried in the next sync cycle
             } else {
               // Mark as synced only for truly invalid records
               await db.markAsSynced(tableName, invalid.record.id);
             }
           }
           
           activeRecordsFiltered = validRecords;
           
           if (invalidRecords.length > 0) {
             console.log(`🧹 Cleaned ${invalidRecords.length} invalid bill audit logs (validation violations)`);
             
             // Log summary of skipped records
             const skippedForDependency = invalidRecords.filter(r => r.reason.includes('does not exist in Supabase'));
             const skippedForValidation = invalidRecords.filter(r => !r.reason.includes('does not exist in Supabase'));
             
             if (skippedForDependency.length > 0) {
               console.log(`⏳ ${skippedForDependency.length} bill audit logs skipped due to missing bill dependencies (will retry next sync)`);
             }
             if (skippedForValidation.length > 0) {
               console.log(`❌ ${skippedForValidation.length} bill audit logs skipped due to validation errors (marked as synced)`);
             }
           }
         }

         // Upload active records in batches
         for (let i = 0; i < activeRecordsFiltered.length; i += SYNC_CONFIG.batchSize) {
           const batch = activeRecordsFiltered.slice(i, i + SYNC_CONFIG.batchSize);
          
          // Debug: Log the first record to see what fields it has before cleaning
          if (tableName === 'bills' && batch.length > 0) {
            console.log(`🔍 Before cleaning - First bill record fields:`, Object.keys(batch[0]));
            console.log(`🔍 Before cleaning - First bill record has _synced:`, batch[0].hasOwnProperty('_synced'));
          }
          
          // Clean the batch data before upload
          const cleanedBatch = batch.map((record: any) => this.cleanRecordForUpload(record, tableName));
          
          // Debug: Log the first cleaned record to see what fields it has after cleaning
          if (tableName === 'bills' && cleanedBatch.length > 0) {
            console.log(`🧹 After cleaning - First bill record fields:`, Object.keys(cleanedBatch[0]));
            console.log(`🧹 After cleaning - First bill record has _synced:`, cleanedBatch[0].hasOwnProperty('_synced'));
          }

          const { error, data } = await supabase
            .from(tableName as any)
            .upsert(cleanedBatch, { onConflict: 'id' });

          if (error) {
            console.error(`❌ Upload failed for ${tableName}:`, error);
            console.error('📋 Failed batch data:', cleanedBatch); 
            console.error('🔍 First record fields:', Object.keys(cleanedBatch[0] || {}));
            result.errors.push(`Upload failed for ${tableName}: ${error.message}`);
            
            // For 409 conflicts, try individual uploads to identify problematic records
            if (error.code === '23503' || error.message.includes('foreign key') || error.message.includes('violates')) {
              console.log(`🔍 Attempting individual uploads to identify problem records...`);
              for (const record of cleanedBatch) {
                try {
                  const { error: individualError } = await supabase
                    .from(tableName as any)
                    .upsert([record], { onConflict: 'id' });
                  
                                     if (individualError) {
                     console.error(`❌ Individual record failed:`, record, individualError);
                     // Mark this record as problematic
                     await db.addPendingSync(tableName, record.id, 'update', record);
                   } else {
                    // Mark successful individual record as synced
                    await db.markAsSynced(tableName, record.id);
                  }
                } catch (e) {
                  console.error(`❌ Critical error with record:`, record, e);
                }
              }
            }
          } else {
            // Mark records as synced
            for (const record of batch as any[]) {
              await db.markAsSynced(tableName, record.id);
            }
            result.uploaded += batch.length;
          }
        }

        // Mark table as processed in this cycle to satisfy dependencies
        await db.updateSyncMetadata(tableName, new Date().toISOString());

                 // Handle deleted records
         for (const record of deletedRecordsFiltered as any[]) {
          try {
            const { error } = await supabase
              .from(tableName as any)
              .delete()
              .eq('id', record.id);

            if (error) {
              result.errors.push(`Delete failed for ${tableName}/${record.id}: ${error.message}`);
            } else {
              // Actually delete from local DB
              const table = (db as any)[tableName];
              await table.delete(record.id);
              result.uploaded++;
            }
          } catch (error) {
            result.errors.push(`Delete error for ${tableName}/${record.id}: ${error}`);
          }
        }

      } catch (error) {
        result.errors.push(`Table ${tableName} upload error: ${error}`);
      }
    }

    console.log(`📊 Sync upload summary: ${result.uploaded} records uploaded, ${result.errors.length} errors`);
    return result;
  }

  /**
   * Download remote changes from Supabase
   */
  private async downloadRemoteChanges(storeId: string) {
    const result = { downloaded: 0, conflicts: 0, errors: [] as string[] };

    for (const tableName of SYNC_TABLES) {
      try {
        const syncMetadata = await db.getSyncMetadata(tableName);
        let lastSyncAt = syncMetadata?.last_synced_at || '1970-01-01T00:00:00.000Z';
        
        // Validate the timestamp format
        if (lastSyncAt && isNaN(Date.parse(lastSyncAt))) {
          console.warn(`Invalid lastSyncAt for ${tableName}: ${lastSyncAt}, using default`);
          lastSyncAt = '1970-01-01T00:00:00.000Z';
        }

        // Determine the timestamp field for each table
            // Only these tables have updated_at: products, suppliers, customers
    const hasUpdatedAt = ['products', 'suppliers', 'customers'].includes(tableName);
        const timestampField = hasUpdatedAt ? 'updated_at' : 'created_at';

        // Get remote changes since last sync
        let query = supabase.from(tableName as any).select('*');
        
        // Add store_id filter for tables that have it (all except transactions)
        if (tableName !== 'transactions') {
          query = query.eq('store_id', storeId);
        }
        
        const { data: remoteRecords, error } = await query
          .gt(timestampField, lastSyncAt)
          .order(timestampField, { ascending: true });

        if (error) {
          result.errors.push(`Download failed for ${tableName}: ${error.message}`);
          continue;
        }

        if (!remoteRecords || remoteRecords.length === 0) continue;

        // Process each remote record
        for (const remoteRecord of remoteRecords) {
          try {
            const localRecord = await (db as any)[tableName].get(remoteRecord.id);
            
            if (!localRecord) {
              // New record - just insert
              await (db as any)[tableName].put({
                ...remoteRecord,
                _synced: true,
                _lastSyncedAt: new Date().toISOString()
              });
              result.downloaded++;
            } else {
              // Existing record - check for conflicts
              const conflict = await this.resolveConflict(tableName, localRecord, remoteRecord);
              if (conflict) {
                result.conflicts++;
              } else {
                result.downloaded++;
              }
            }
          } catch (error) {
            result.errors.push(`Record process error ${tableName}/${remoteRecord.id}: ${error}`);
          }
        }

        // Update sync metadata
        const latestRecord = remoteRecords[remoteRecords.length - 1];
        const latestTimestamp = latestRecord?.[timestampField] || new Date().toISOString();
        await db.updateSyncMetadata(tableName, latestTimestamp);

      } catch (error) {
        result.errors.push(`Table ${tableName} download error: ${error}`);
      }
    }

    return result;
  }

  /**
   * Resolve conflicts between local and remote records
   */
  private async resolveConflict(tableName: string, localRecord: any, remoteRecord: any): Promise<boolean> {
    // If local record is not modified (synced), use remote version
    if (localRecord._synced) {
      await (db as any)[tableName].put({
        ...remoteRecord,
        _synced: true,
        _lastSyncedAt: new Date().toISOString()
      });
      return false; // No conflict
    }

    // Determine the timestamp field for this table
    // Only these tables have updated_at: products, suppliers, customers
    const hasUpdatedAt = ['products', 'suppliers', 'customers'].includes(tableName);
    const timestampField = hasUpdatedAt ? 'updated_at' : 'created_at';

    // If local record is modified, apply conflict resolution strategy
    const localModifiedAt = new Date(localRecord[timestampField] || localRecord.created_at);
    const remoteModifiedAt = new Date(remoteRecord[timestampField] || remoteRecord.created_at);

    // Strategy: Last write wins (server preference)
    if (remoteModifiedAt >= localModifiedAt) {
      // Keep remote version, mark local changes as pending sync
      await db.addPendingSync(tableName, localRecord.id, 'update', localRecord);
      
      await (db as any)[tableName].put({
        ...remoteRecord,
        _synced: true,
        _lastSyncedAt: new Date().toISOString()
      });
    } else {
      // Keep local version, it will be uploaded in next sync
      // Just update the sync metadata
      await (db as any)[tableName].update(localRecord.id, {
        _lastSyncedAt: new Date().toISOString()
      });
    }

    return true; // Conflict occurred
  }

  /**
   * Process any pending sync operations
   */
  private async processPendingSyncs() {
    const pendingSyncs = await db.getPendingSyncs();
    
    for (const pendingSync of pendingSyncs) {
      try {
        if (pendingSync.retry_count >= SYNC_CONFIG.maxRetries) {
          // Max retries reached - log and remove
          console.error(`Max retries reached for pending sync: ${pendingSync.id}`);
          await db.removePendingSync(pendingSync.id);
          continue;
        }

        // Attempt to process the pending sync
        let success = false;
        
        switch (pendingSync.operation) {
          case 'create':
          case 'update':
            const cleanedPayload = this.cleanRecordForUpload(pendingSync.payload, pendingSync.table_name);
            if (!cleanedPayload) {
              console.warn(`⚠️ Skipping pending sync ${pendingSync.id} - invalid payload`);
              success = false;
            } else {
              const { error } = await supabase
                .from(pendingSync.table_name as any)
                .upsert(cleanedPayload)
                .select();
              success = !error;
            }
            break;
            
          case 'delete':
            const { error: deleteError } = await supabase
              .from(pendingSync.table_name as any)
              .delete()
              .eq('id', pendingSync.record_id);
            success = !deleteError;
            break;
        }

        if (success) {
          await db.removePendingSync(pendingSync.id);
        } else {
          // Increment retry count
          await db.pending_syncs.update(pendingSync.id, {
            retry_count: pendingSync.retry_count + 1,
            last_error: 'Retry failed'
          });
        }

      } catch (error) {
        // Update error info
        await db.pending_syncs.update(pendingSync.id, {
          retry_count: pendingSync.retry_count + 1,
          last_error: error instanceof Error ? error.message : 'Unknown error'
        });
      }
    }
  }

  /**
   * Clean record for upload by removing sync-specific fields
   */
  private cleanRecordForUpload(record: any, tableNameOverride?: string) {
    // Remove all sync-related fields that don't exist in Supabase
    const { 
      _synced, 
      _lastSyncedAt, 
      _deleted, 
      _pendingSync,
      _syncError,
      _retryCount,
      ...cleanRecord 
    } = record;
    
    // Double-check that no sync fields remain
    const syncFields = ['_synced', '_lastSyncedAt', '_deleted', '_pendingSync', '_syncError', '_retryCount'];
    syncFields.forEach(field => {
      if (cleanRecord.hasOwnProperty(field)) {
        console.warn(`⚠️ Found sync field ${field} in cleaned record, removing it`);
        delete cleanRecord[field];
      }
    });
    
    // Remove updated_at for tables that don't have it in Supabase
    // Only these tables have updated_at: products, suppliers, customers
    const tableName = tableNameOverride || this.getTableFromRecord(record);
    // Handle cash drawer tables field mapping (camelCase -> snake_case for Supabase)
    if (tableName === 'cash_drawer_accounts') {
      if (cleanRecord.accountCode !== undefined) {
        cleanRecord.account_code = cleanRecord.accountCode;
        delete cleanRecord.accountCode;
      }
      if (cleanRecord.currentBalance !== undefined) {
        cleanRecord.current_balance = cleanRecord.currentBalance;
        delete cleanRecord.currentBalance;
      }
      if (cleanRecord.isActive !== undefined) {
        cleanRecord.is_active = cleanRecord.isActive;
        delete cleanRecord.isActive;
      }
    }

    if (tableName === 'cash_drawer_sessions') {
      if (cleanRecord.accountId !== undefined) {
        cleanRecord.account_id = cleanRecord.accountId;
        delete cleanRecord.accountId;
      }
      if (cleanRecord.openedBy !== undefined) {
        cleanRecord.opened_by = cleanRecord.openedBy;
        delete cleanRecord.openedBy;
      }
      if (cleanRecord.openedAt !== undefined) {
        cleanRecord.opened_at = cleanRecord.openedAt;
        delete cleanRecord.openedAt;
      }
      if (cleanRecord.closedAt !== undefined) {
        cleanRecord.closed_at = cleanRecord.closedAt;
        delete cleanRecord.closedAt;
      }
      if (cleanRecord.closedBy !== undefined) {
        cleanRecord.closed_by = cleanRecord.closedBy;
        delete cleanRecord.closedBy;
      }
      if (cleanRecord.openingAmount !== undefined) {
        cleanRecord.opening_amount = cleanRecord.openingAmount;
        delete cleanRecord.openingAmount;
      }
      if (cleanRecord.expectedAmount !== undefined) {
        cleanRecord.expected_amount = cleanRecord.expectedAmount;
        delete cleanRecord.expectedAmount;
      }
      if (cleanRecord.actualAmount !== undefined) {
        cleanRecord.actual_amount = cleanRecord.actualAmount;
        delete cleanRecord.actualAmount;
      }
    }

    const tablesWithoutUpdatedAt = ['inventory_items', 'sale_items', 'transactions', 'inventory_batches'];
    
    if (tablesWithoutUpdatedAt.includes(tableName)) {
      delete cleanRecord.updated_at;
    }
    
    // Handle sale_items specific field cleanup
    if (tableName === 'sale_items') {
      // Ensure required fields are present and valid
      if (!cleanRecord.inventory_item_id) {
        cleanRecord.inventory_item_id = null; // Use null for UUID fields, not empty string
      }
      if (!cleanRecord.created_by) {
        // Instead of filtering out, log the issue and use a fallback
        console.warn(`⚠️ Sale item ${cleanRecord.id} missing created_by field, using fallback`);
        cleanRecord.created_by = '00000000-0000-0000-0000-000000000000'; // Fallback UUID
      }
      if (!cleanRecord.customer_id) {
        cleanRecord.customer_id = null;
      }
      // Keep store_id as it's part of the database schema
    }
    
    // Handle bill-related tables
    if (tableName === 'bills') {
      // Ensure required fields for bills
      // Remove fields that don't exist in Supabase schema
      delete cleanRecord.tax_amount;
      delete cleanRecord.discount_amount;
      delete cleanRecord.inventory_item_id; // Remove this field as it doesn't exist in bills table
      delete cleanRecord.due_date;
      delete cleanRecord.status;
      delete cleanRecord.last_modified_by;
      delete cleanRecord.last_modified_at;
      
      // CRITICAL: Remove any line item fields that might have been incorrectly added to bills
      const lineItemFields = ['product_id', 'supplier_id', 'quantity', 'unit_price', 'line_total', 'weight', 'line_order'];
      lineItemFields.forEach(field => {
        if (cleanRecord[field] !== undefined) {
          console.warn(`🚫 Removing line item field '${field}' from bills data:`, cleanRecord[field]);
          delete cleanRecord[field];
        }
      });
      
      if (!cleanRecord.created_by) {
        // Instead of filtering out, log the issue and use a fallback
        console.warn(`⚠️ Bill ${cleanRecord.id} missing created_by field, using fallback`);
        cleanRecord.created_by = '00000000-0000-0000-0000-000000000000'; // Fallback UUID
      }
      if (!cleanRecord.bill_number) {
        cleanRecord.bill_number = `BILL-${Date.now()}`;
      }
    }
    
    if (tableName === 'bill_line_items') {
      // Ensure required fields for bill line items
      // Remove fields that don't exist in Supabase schema
      delete cleanRecord.created_by;
      delete cleanRecord.customer_id;
      
      if (!cleanRecord.product_name) {
        cleanRecord.product_name = 'Unknown Product';
      }
      if (!cleanRecord.supplier_name) {
        cleanRecord.supplier_name = 'Unknown Supplier';
      }
    }
    
    if (tableName === 'bill_audit_logs') {
      // Ensure required fields for bill audit logs
      // Remove fields that don't exist in Supabase schema
      delete cleanRecord.ip_address;
      delete cleanRecord.user_agent;
      delete cleanRecord.updated_at;
      
      if (!cleanRecord.changed_by) {
        // Instead of filtering out, log the issue and use a fallback
        console.warn(`⚠️ Bill audit log ${cleanRecord.id} missing changed_by field, using fallback`);
        cleanRecord.changed_by = '00000000-0000-0000-0000-000000000000'; // Fallback UUID
      }
      if (!cleanRecord.action) {
        cleanRecord.action = 'updated';
      }
    }
    
    // CRITICAL: Convert LBP transaction amounts to USD before upload to avoid precision overflow
    // Supabase numeric field has precision 10, scale 2 (max: 99,999,999.99)
    // Only convert LBP amounts that exceed the database precision limit
    if (tableName === 'transactions' && cleanRecord.currency === 'LBP' && cleanRecord.amount) {
      const USD_TO_LBP_RATE = 89500;
      const originalAmount = cleanRecord.amount;
      
      // Only convert if amount exceeds database precision limit
      if (originalAmount > 99999999) {
        cleanRecord.amount = originalAmount / USD_TO_LBP_RATE;
        // Change currency to USD for the converted amount
        cleanRecord.currency = 'USD';
        // Add a note in the description about the conversion
        cleanRecord.description = `${cleanRecord.description} (Originally ${originalAmount.toLocaleString()} LBP)`;
        console.log(`💱 Converting large LBP transaction for upload: ${originalAmount.toLocaleString()} LBP → $${cleanRecord.amount.toFixed(2)} USD`);
      }
    }
    
    // Log the cleaned record for debugging (only for bills to avoid spam)
    if (tableName === 'bills') {
      console.log(`🧹 Cleaned bill record for upload:`, {
        id: cleanRecord.id,
        fields: Object.keys(cleanRecord),
        hasSyncedField: cleanRecord.hasOwnProperty('_synced')
      });
    }
    
    return cleanRecord;
  }

  /**
   * Helper to determine table name from record structure
   */
  private getTableFromRecord(record: any): string {
    // Simple heuristic based on record properties
    if (record.product_id && record.supplier_id && record.received_at) return 'inventory_items';
    if (record.inventory_item_id && record.product_id && record.supplier_id) return 'sale_items';
    if (record.customer_id !== undefined && record.subtotal !== undefined) return 'sale_items'; // Assuming 'sale_items' for sales
    if (record.type && record.amount && record.currency) return 'transactions';
    if (record.category && !record.amount) return 'products';
    // Updated supplier detection to handle new type field and distinguish from transactions
    if (record.phone && record.type && (record.type === 'commission' || record.type === 'cash') && !record.amount) return 'suppliers';
    if (record.phone && record.balance !== undefined && !record.type) return 'customers';
    if (record.supplier_id && record.received_at && record.created_by && !record.product_id) return 'inventory_batches';

    return 'unknown';
  }

  /**
   * Check if sync is currently running
   */
  isCurrentlyRunning(): boolean {
    return this.isRunning;
  }

  /**
   * Get last sync attempt timestamp
   */
  getLastSyncAttempt(): Date | null {
    return this.lastSyncAttempt;
  }

  /**
   * Force sync specific table
   */
  async syncTable(storeId: string, tableName: SyncTable): Promise<SyncResult> {
    const result: SyncResult = {
      success: true,
      errors: [],
      synced: { uploaded: 0, downloaded: 0 },
      conflicts: 0
    };

    try {
      // Upload unsynced records
      const unsyncedRecords = await db.getUnsyncedRecords(tableName);
      if (unsyncedRecords.length > 0) {
        // Clean records for upload
        const cleanedRecords = (unsyncedRecords as any[])
          .map((record: any) => this.cleanRecordForUpload(record, tableName));
        
        // Log the cleaned records for debugging
        console.log(`📤 Uploading ${cleanedRecords.length} ${tableName} records to Supabase`);
        if (tableName === 'bills' && cleanedRecords.length > 0) {
          console.log('🔍 Bills data fields:', cleanedRecords[0] ? Object.keys(cleanedRecords[0]) : 'No records');
        }

        const { error } = await supabase
          .from(tableName as any)
          .upsert(cleanedRecords, { onConflict: 'id' });

        if (error) {
          result.errors.push(`Upload failed: ${error.message}`);
        } else {
          for (const record of unsyncedRecords as any[]) {
            await db.markAsSynced(tableName, record.id);
          }
          result.synced.uploaded = unsyncedRecords.length;
        }
      }

      // Download latest data
      const { data: remoteRecords, error } = await supabase
        .from(tableName as any)
        .select('*')
        .eq('store_id', storeId);

      if (error) {
        result.errors.push(`Download failed: ${error.message}`);
      } else if (remoteRecords) {
        for (const record of remoteRecords as any[]) {
          await (db as any)[tableName].put({
            ...record,
            _synced: true,
            _lastSyncedAt: new Date().toISOString()
          });
        }
        result.synced.downloaded = remoteRecords.length;
      }

      result.success = result.errors.length === 0;

    } catch (error) {
      result.success = false;
      result.errors.push(error instanceof Error ? error.message : 'Unknown error');
    }

    return result;
  }

  /**
   * Clear all local data and re-sync from server
   */
  async fullResync(storeId: string): Promise<SyncResult> {
    const result: SyncResult = {
      success: true,
      errors: [],
      synced: { uploaded: 0, downloaded: 0 },
      conflicts: 0
    };

    try {
      // Clear all local data
      await db.transaction('rw', db.tables, async () => {
        for (const tableName of SYNC_TABLES) {
          await (db as any)[tableName].clear();
        }
        await db.sync_metadata.clear();
        await db.pending_syncs.clear();
      });

      // Download all data from server
      for (const tableName of SYNC_TABLES) {
        const { data: remoteRecords, error } = await supabase
          .from(tableName as any)
          .select('*')
          .eq('store_id', storeId);

        if (error) {
          result.errors.push(`Download failed for ${tableName}: ${error.message}`);
        } else if (remoteRecords) {
          const recordsWithSync = remoteRecords.map(record => ({
            ...record,
            _synced: true,
            _lastSyncedAt: new Date().toISOString()
          }));
          
          await (db as any)[tableName].bulkPut(recordsWithSync);
          result.synced.downloaded += remoteRecords.length;
        }
      }

      result.success = result.errors.length === 0;

    } catch (error) {
      result.success = false;
      result.errors.push(error instanceof Error ? error.message : 'Full resync failed');
    }

    return result;
  }
}

// Export singleton instance
export const syncService = new SyncService();

// Legacy functions for backward compatibility
export async function syncWithSupabase(storeId: string): Promise<SyncResult> {
  return syncService.sync(storeId);
}

export function getLastSyncedAt(): string | null {
  return localStorage.getItem('last_synced_at');
}

export function setLastSyncedAt(ts: string) {
  localStorage.setItem('last_synced_at', ts);
} 