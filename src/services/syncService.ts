import { db } from '../lib/db';
import { supabase } from '../lib/supabase';
import { Database } from '../types/database';

type Tables = Database['public']['Tables'];

// Sync configuration
const SYNC_CONFIG = {
  batchSize: 50,
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
  'sales',
  'sale_items',
  'transactions',
  'expense_categories'
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
           
                       // Get current products and suppliers from Supabase to validate foreign keys
            const { data: remoteProducts } = await supabase.from('products').select('id').eq('store_id', storeId);
            const { data: remoteSuppliers } = await supabase.from('suppliers').select('id').eq('store_id', storeId);
            const { data: remoteUsers } = await supabase.from('users').select('id').eq('store_id', storeId);
           
           const validProductIds = new Set(remoteProducts?.map(p => p.id) || []);
           const validSupplierIds = new Set(remoteSuppliers?.map(s => s.id) || []);
           const validUserIds = new Set(remoteUsers?.map(u => u.id) || []);
           
           for (const record of activeRecords) {
             // Check quantity constraint
             if (record.quantity <= 0) {
               invalidRecords.push({ record, reason: 'quantity <= 0' });
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

          const { error, data } = await supabase
            .from(tableName as any)
            .upsert(cleanedBatch, { onConflict: 'id' });

          if (error) {
            console.error(`❌ Upload failed for ${tableName}:`, error);
            console.error('📋 Failed batch data:', cleanedBatch);
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
        // Only these tables have updated_at: products, suppliers, customers, expense_categories
        const hasUpdatedAt = ['products', 'suppliers', 'customers', 'expense_categories'].includes(tableName);
        const timestampField = hasUpdatedAt ? 'updated_at' : 'created_at';

        // Get remote changes since last sync
        let query = supabase.from(tableName as any).select('*');
        
        // Add store_id filter for tables that have it (all except sale_items)
        if (tableName !== 'sale_items') {
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
    // Only these tables have updated_at: products, suppliers, customers, expense_categories
    const hasUpdatedAt = ['products', 'suppliers', 'customers', 'expense_categories'].includes(tableName);
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
    // Only these tables have updated_at: products, suppliers, customers, expense_categories
    const tableName = this.getTableFromRecord(record);
    const tablesWithoutUpdatedAt = ['inventory_items', 'sales', 'sale_items', 'transactions'];
    
    if (tablesWithoutUpdatedAt.includes(tableName)) {
      delete cleanRecord.updated_at;
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
    
    return cleanRecord;
  }

  /**
   * Helper to determine table name from record structure
   */
  private getTableFromRecord(record: any): string {
    // Simple heuristic based on record properties
    if (record.product_id && record.supplier_id && record.received_at) return 'inventory_items';
    if (record.sale_id && record.product_name) return 'sale_items';
    if (record.customer_id !== undefined && record.subtotal !== undefined) return 'sales';
    if (record.type && record.amount && record.currency) return 'transactions';
    if (record.category && !record.amount) return 'products';
    if (record.phone && record.type) return 'suppliers';
    if (record.phone && record.current_debt !== undefined) return 'customers';
    if (record.description !== undefined) return 'expense_categories';
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