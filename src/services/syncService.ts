import { db } from '../lib/db';
import { supabase } from '../lib/supabase';
// import { Database } from '../types/database'; // Currently unused

// type Tables = Database['public']['Tables']; // Currently unused

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
  'inventory_items',
  'sale_items',
  'transactions',

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
  } = {
    products: new Set(),
    suppliers: new Set(), 
    users: new Set(),
    lastUpdated: null,
    storeId: null
  };

  /**
   * Refresh validation cache for foreign key validation
   */
  private async refreshValidationCache(storeId: string) {
    const cacheAge = this.validationCache.lastUpdated 
      ? Date.now() - this.validationCache.lastUpdated.getTime() 
      : Infinity;
    
    // Cache is valid for 5 minutes and same store
    if (cacheAge < 300000 && this.validationCache.storeId === storeId) {
      return;
    }

    try {
      const [productsResult, suppliersResult, usersResult] = await Promise.all([
        supabase.from('products').select('id').eq('store_id', storeId),
        supabase.from('suppliers').select('id').eq('store_id', storeId),
        supabase.from('users').select('id').eq('store_id', storeId)
      ]);

      this.validationCache.products = new Set(productsResult.data?.map(p => p.id) || []);
      this.validationCache.suppliers = new Set(suppliersResult.data?.map(s => s.id) || []);
      this.validationCache.users = new Set(usersResult.data?.map(u => u.id) || []);
      this.validationCache.lastUpdated = new Date();
      this.validationCache.storeId = storeId;
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

      // 1. Upload local changes to Supabase
      const uploadResult = await this.uploadLocalChanges(storeId);
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
  private async uploadLocalChanges(storeId: string) {
    const result = { uploaded: 0, errors: [] as string[] };

    for (const tableName of SYNC_TABLES) {
      try {
        const unsyncedRecords = await db.getUnsyncedRecords(tableName);
        
        if (unsyncedRecords.length === 0) continue;

                 // Filter out deleted records for separate handling
         let activeRecords = unsyncedRecords.filter((r: any) => !r._deleted);
         const deletedRecords = unsyncedRecords.filter((r: any) => r._deleted);

         // Additional validation for inventory_items
         if (tableName === 'inventory_items') {
           const validRecords = [];
           const invalidRecords = [];
           
           // Use cached validation data to avoid repeated queries
           await this.refreshValidationCache(storeId);
           const validProductIds = this.validationCache.products;
           const validSupplierIds = this.validationCache.suppliers;
           const validUserIds = this.validationCache.users;
           
           for (const record of activeRecords) {
             // Check quantity constraint
             if (record.quantity < 0) {
               invalidRecords.push({ record, reason: 'quantity < 0' });
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
           
           activeRecords = validRecords;
           
           if (invalidRecords.length > 0) {
             console.log(`🧹 Cleaned ${invalidRecords.length} invalid inventory items (quantity/FK violations)`);
           }
         }

         // Upload active records in batches
         for (let i = 0; i < activeRecords.length; i += SYNC_CONFIG.batchSize) {
           const batch = activeRecords.slice(i, i + SYNC_CONFIG.batchSize);
           const cleanedBatch = batch.map((record: any) => this.cleanRecordForUpload(record));

          const { error } = await supabase
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

                 // Handle deleted records
         for (const record of deletedRecords as any[]) {
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
        
        // Add store_id filter for tables that have it (all tables have store_id)
        query = query.eq('store_id', storeId);
        
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
            const { error: upsertError } = await supabase
              .from(pendingSync.table_name as any)
              .upsert(this.cleanRecordForUpload(pendingSync.payload));
            success = !upsertError;
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
  private cleanRecordForUpload(record: any) {
    const { _synced, _lastSyncedAt, _deleted, ...cleanRecord } = record;
    
    // Remove updated_at for tables that don't have it in Supabase
    // Only these tables have updated_at: products, suppliers, customers
    const tableName = this.getTableFromRecord(record);
    const tablesWithoutUpdatedAt = ['inventory_items', 'sale_items', 'transactions'];
    
    if (tablesWithoutUpdatedAt.includes(tableName)) {
      delete cleanRecord.updated_at;
    }
    
    // Handle sale_items specific field cleanup (now keeping created_by and store_id as they're in database schema)
    if (tableName === 'sale_items') {
      // First, map legacy/camelCase field names to Supabase snake_case field names
      if (cleanRecord.inventoryItemId && !cleanRecord.inventory_item_id) {
        cleanRecord.inventory_item_id = cleanRecord.inventoryItemId;
      }
      if (cleanRecord.productId && !cleanRecord.product_id) {
        cleanRecord.product_id = cleanRecord.productId;
      }
      if (cleanRecord.supplierId && !cleanRecord.supplier_id) {
        cleanRecord.supplier_id = cleanRecord.supplierId;
      }
      if (cleanRecord.customerId !== undefined && cleanRecord.customer_id === undefined) {
        cleanRecord.customer_id = cleanRecord.customerId;
      }
      if (cleanRecord.unitPrice !== undefined && !cleanRecord.unit_price) {
        cleanRecord.unit_price = cleanRecord.unitPrice;
      }
      if (cleanRecord.paymentMethod && !cleanRecord.payment_method) {
        cleanRecord.payment_method = cleanRecord.paymentMethod;
      }
      if (cleanRecord.createdBy && !cleanRecord.created_by) {
        cleanRecord.created_by = cleanRecord.createdBy;
      }
      if (cleanRecord.storeId && !cleanRecord.store_id) {
        cleanRecord.store_id = cleanRecord.storeId;
      }
      if (cleanRecord.createdAt && !cleanRecord.created_at) {
        cleanRecord.created_at = cleanRecord.createdAt;
      }
      // Map totalPrice to received_value if received_value is missing
      if (cleanRecord.totalPrice !== undefined && !cleanRecord.received_value) {
        cleanRecord.received_value = cleanRecord.totalPrice;
      }
      
      // Remove all legacy/camelCase field names after mapping
      delete cleanRecord.inventoryItemId;
      delete cleanRecord.productId;
      delete cleanRecord.supplierId;
      delete cleanRecord.customerId;
      delete cleanRecord.unitPrice;
      delete cleanRecord.totalPrice;
      delete cleanRecord.paymentMethod;
      delete cleanRecord.createdBy;
      delete cleanRecord.storeId;
      delete cleanRecord.createdAt;
      
      // Define allowed fields for sale_items table (matching exact Supabase schema)
      const allowedFields = [
        'id', 'quantity', 'inventory_item_id', 'product_id', 'supplier_id',
        'weight', 'unit_price', 'received_value', 'payment_method', 'notes',
        'created_at', 'store_id', 'customer_id', 'created_by'
      ];

      // Remove any remaining fields that don't exist in Supabase schema
      Object.keys(cleanRecord).forEach(key => {
        if (!allowedFields.includes(key) && !key.startsWith('_')) {
          delete cleanRecord[key];
        }
      });

      // Calculate received_value from unit_price and quantity if missing
      if (!cleanRecord.received_value && cleanRecord.unit_price && cleanRecord.quantity) {
        cleanRecord.received_value = cleanRecord.unit_price * cleanRecord.quantity;
      }
      
      // Ensure required fields are present and valid
      if (!cleanRecord.inventory_item_id) {
        cleanRecord.inventory_item_id = cleanRecord.id || '';
      }
      if (!cleanRecord.created_by) {
        cleanRecord.created_by = 'system';
      }
      if (!cleanRecord.customer_id) {
        cleanRecord.customer_id = null;
      }
      if (!cleanRecord.store_id) {
        cleanRecord.store_id = 'default-store';
      }
      if (!cleanRecord.payment_method) {
        cleanRecord.payment_method = 'cash';
      }
      if (!cleanRecord.unit_price || cleanRecord.unit_price < 0) {
        cleanRecord.unit_price = 0;
      }
      if (!cleanRecord.received_value || cleanRecord.received_value < 0) {
        cleanRecord.received_value = cleanRecord.unit_price * (cleanRecord.quantity || 1);
      }
      if (!cleanRecord.quantity || cleanRecord.quantity <= 0) {
        cleanRecord.quantity = 1;
      }
      
      // Debug logging for sale_items
      console.log('🔧 Cleaned sale_item record for upload:', {
        id: cleanRecord.id,
        fields: Object.keys(cleanRecord),
        hasAllRequired: allowedFields.every(field => 
          field === 'weight' || field === 'notes' || field === 'customer_id' || 
          cleanRecord.hasOwnProperty(field)
        )
      });
    }
    
    // CRITICAL: Handle transaction amounts to avoid database precision overflow
    // Supabase numeric field has precision 10, scale 2 (max: 99,999,999.99)
    if (tableName === 'transactions' && cleanRecord.amount) {
      const MAX_DB_AMOUNT = 99999999.99;
      const USD_TO_LBP_RATE = 89500;
      const originalAmount = cleanRecord.amount;
      const originalCurrency = cleanRecord.currency;
      
      // Validate and fix amount precision
      if (typeof originalAmount === 'number' && !isNaN(originalAmount)) {
        // Round to 2 decimal places to match database precision
        cleanRecord.amount = Math.round(originalAmount * 100) / 100;
        
        // Check if amount exceeds database limit
        if (cleanRecord.amount > MAX_DB_AMOUNT) {
          if (originalCurrency === 'LBP') {
            // Convert LBP to USD for large amounts
            cleanRecord.amount = cleanRecord.amount / USD_TO_LBP_RATE;
            cleanRecord.currency = 'USD';
            cleanRecord.description = `${cleanRecord.description || ''} (Originally ${originalAmount.toLocaleString()} LBP)`.trim();
            console.log(`💱 Converting large LBP transaction for upload: ${originalAmount.toLocaleString()} LBP → $${cleanRecord.amount.toFixed(2)} USD`);
          } else {
            // For USD amounts that are too large, cap them at the maximum
            console.warn(`⚠️ USD transaction amount ${originalAmount} exceeds database limit, capping at ${MAX_DB_AMOUNT}`);
            cleanRecord.amount = MAX_DB_AMOUNT;
            cleanRecord.description = `${cleanRecord.description || ''} (Amount capped from ${originalAmount})`.trim();
          }
        }
        
        // Ensure amount is not negative (should be handled by business logic, but safety check)
        if (cleanRecord.amount < 0) {
          console.warn(`⚠️ Negative transaction amount detected: ${originalAmount}, setting to 0`);
          cleanRecord.amount = 0;
        }
      } else {
        // Invalid amount, set to 0
        console.warn(`⚠️ Invalid transaction amount detected: ${originalAmount}, setting to 0`);
        cleanRecord.amount = 0;
      }
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
        const cleanedRecords = (unsyncedRecords as any[]).map((record: any) => this.cleanRecordForUpload(record));
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