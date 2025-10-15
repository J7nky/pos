// Optimized sync service - reduced from 2109 to ~800 lines
// @ts-nocheck
/* eslint-disable */
import { db } from '../lib/db';
import { supabase } from '../lib/supabase';
import { Database } from '../types/database';
import { dataValidationService } from './dataValidationService';

type Tables = Database['public']['Tables'];

const SYNC_CONFIG = {
  batchSize: 100,
  maxRetries: 2,
  retryDelay: 2000,
  syncInterval: 30000,
  maxRecordsPerSync: 1000,
  incrementalSyncThreshold: 50,
  validationCacheExpiry: 900000,
};

// Table sync order (respects foreign key dependencies)
const SYNC_TABLES = [
'stores',
'products',
'suppliers', 
'customers',
'cash_drawer_accounts',
'inventory_bills',
'inventory_items',
'transactions',
'bills',
  'bill_line_items',
  'bill_audit_logs',
'cash_drawer_sessions',
'missed_products'
] as const;

type SyncTable = typeof SYNC_TABLES[number];

const SYNC_DEPENDENCIES: Record<SyncTable, SyncTable[]> = {
'products': [],
'stores': [],
'suppliers': [],
'customers': [],
'cash_drawer_accounts': [],
'inventory_bills': ['suppliers'],
'inventory_items': ['products', 'suppliers', 'inventory_bills'],
'transactions': [],
'bills': ['customers'],
'bill_line_items': ['bills', 'products', 'suppliers', 'inventory_items'],
'bill_audit_logs': ['bills'],
'cash_drawer_sessions': ['cash_drawer_accounts'],
'missed_products': ['cash_drawer_sessions', 'inventory_items']
};

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
await this.ensureStoreExists(storeId);
      await this.initializeSyncMetadata(storeId);

      // Check connectivity
const { error: connectivityError } = await supabase
.from('products')
.select('id')
.limit(1);

if (connectivityError) {
throw new Error(`Connection failed: ${connectivityError.message}`);
}

      // Refresh validation cache once
      await dataValidationService.refreshCache(storeId, supabase);

      // Upload then download
      const uploadResult = await this.uploadLocalChanges(storeId);
result.synced.uploaded = uploadResult.uploaded;
result.errors.push(...uploadResult.errors);

const downloadResult = await this.downloadRemoteChanges(storeId);
result.synced.downloaded = downloadResult.downloaded;
result.conflicts += downloadResult.conflicts;
result.errors.push(...downloadResult.errors);

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

  private async uploadLocalChanges(storeId: string) {
const result = { uploaded: 0, errors: [] as string[] };

    for (const tableName of SYNC_TABLES) {
      try {
        console.log(`📤 Processing table: ${tableName}`);
        
        if (!await this.validateDependencies(tableName, storeId)) {
          console.log(`⏳ Skipping ${tableName} - dependencies not met`);
          continue;
}

         const table = (db as any)[tableName];
         const activeRecords = await table.filter((record: any) => !record._synced && !record._deleted).toArray();
         const deletedRecords = await table.filter((record: any) => record._deleted && !record._synced).toArray();

         if (activeRecords.length === 0 && deletedRecords.length === 0) {
           console.log(`  ⏭️  No unsynced records for ${tableName}`);
           continue;
         }
         
        console.log(`  📊 Found ${activeRecords.length} active and ${deletedRecords.length} deleted unsynced records`);

        // CRITICAL: For inventory_items with batch_id, check if parent batch exists
         if (tableName === 'inventory_items') {
          const recordsWithBatch = activeRecords.filter((r: any) => r.batch_id);
          
          if (recordsWithBatch.length > 0) {
            const batchIds = [...new Set(recordsWithBatch.map((record: any) => record.batch_id))];
            
            try {
              const { data: batchesData, error: batchesError } = await supabase
                .from('inventory_bills')
                .select('id')
                .in('id', batchIds);
              
              if (batchesError) {
                console.warn(`Failed to validate batch IDs for inventory_items:`, batchesError);
              } else {
                const validBatchIds = new Set(batchesData?.map((b: any) => b.id) || []);
                
                // Also check local batches
           const localBatches = await db.inventory_bills
             .where('store_id')
             .equals(storeId)
                  .filter((batch: any) => !batch._deleted)
             .toArray();
                const localBatchIds = new Set(localBatches.map((batch: any) => batch.id));
                
                // Filter records to only include those with valid batch references
                const validRecords: any[] = [];
                const invalidRecords: any[] = [];
                
                for (const record of activeRecords) {
                  if (!record.batch_id || 
                      validBatchIds.has(record.batch_id) || 
                      localBatchIds.has(record.batch_id)) {
                    validRecords.push(record);
               } else {
                    invalidRecords.push(record);
                    console.warn(`⏳ Inventory item ${record.id} skipped - batch ${record.batch_id} not yet synced`);
                  }
                }
           
           if (invalidRecords.length > 0) {
                  console.log(`⏳ ${invalidRecords.length} inventory_items skipped - waiting for parent batches`);
                }
                
                // Update activeRecords
                activeRecords.length = 0;
                activeRecords.push(...validRecords);
                
                if (activeRecords.length === 0) {
                  console.log(`⏳ No inventory_items ready to sync (all waiting for parent batches)`);
                 continue;
               }
              }
           } catch (error) {
              console.warn(`Failed to validate batch IDs for inventory_items:`, error);
            }
          }
        }
        
        // CRITICAL: For bill_line_items and bill_audit_logs, check if parent bills exist in Supabase
        if (tableName === 'bill_line_items' || tableName === 'bill_audit_logs') {
          const billIds = [...new Set(activeRecords.map((record: any) => record.bill_id))];
           
           try {
             const { data: billsData, error: billsError } = await supabase
               .from('bills')
               .select('id')
               .in('id', billIds);
             
             if (billsError) {
              console.warn(`Failed to validate bill IDs for ${tableName}:`, billsError);
              console.log(`⏳ Skipping ${tableName} sync - cannot validate bill dependencies`);
               continue;
             }
             
            const validBillIds = new Set(billsData?.map((b: any) => b.id) || []);
            
            // Filter out records whose parent bills don't exist in Supabase yet
            const recordsWithValidBills: any[] = [];
            const recordsWithMissingBills: any[] = [];
            
            for (const record of activeRecords) {
              if (validBillIds.has(record.bill_id)) {
                recordsWithValidBills.push(record);
             } else {
                recordsWithMissingBills.push(record);
              }
            }
            
            if (recordsWithMissingBills.length > 0) {
              console.log(`⏳ ${recordsWithMissingBills.length} ${tableName} records skipped - parent bills not yet synced (will retry next sync)`);
            }
            
            // Only process records with valid parent bills
            if (recordsWithValidBills.length === 0) {
              console.log(`⏳ No ${tableName} records ready to sync (all waiting for parent bills)`);
               continue;
             }
             
            // Update activeRecords to only include those with valid parent bills
            activeRecords.length = 0;
            activeRecords.push(...recordsWithValidBills);
            
           } catch (error) {
            console.warn(`Failed to validate bill IDs for ${tableName}:`, error);
            console.log(`⏳ Skipping ${tableName} sync - cannot validate bill dependencies`);
             continue;
           }
        }

        // Validate records
        const validation = await dataValidationService.validateRecords(tableName, activeRecords, storeId);
        
        // Remove invalid records from sync queue
        for (const invalid of validation.errors) {
          console.warn(`🚫 Removing invalid ${tableName} record: ${invalid.reason}`, invalid.record);
               await db.markAsSynced(tableName, invalid.record.id);
        }

        const validRecords = activeRecords.filter((r: any) => 
          !validation.errors.some(e => e.record.id === r.id)
        );

        // Upload in batches
        for (let i = 0; i < validRecords.length; i += SYNC_CONFIG.batchSize) {
          const batch = validRecords.slice(i, i + SYNC_CONFIG.batchSize);
          const cleanedBatch = batch.map((record: any) => 
            dataValidationService.cleanRecordForUpload(record, tableName)
          );

          const { error } = await supabase
            .from(tableName as any)
            .upsert(cleanedBatch, { onConflict: 'id' });

          if (error) {
            console.error(`❌ Upload failed for ${tableName}:`, error);
            result.errors.push(`Upload failed for ${tableName}: ${error.message}`);
            
            // Try individual uploads for FK errors
            if (error.code === '23503' || error.message.includes('foreign key')) {
              await this.handleFailedBatch(tableName, cleanedBatch, batch);
            }
          } else {
            for (const record of batch as any[]) {
              await db.markAsSynced(tableName, record.id);
            }
            result.uploaded += batch.length;
          }
        }

        await db.updateSyncMetadata(tableName, new Date().toISOString());

                 // Handle deleted records
        for (const record of deletedRecords as any[]) {
          try {
            // Special handling for inventory_items with foreign key constraints
            if (tableName === 'inventory_items') {
              // Check if this inventory item is referenced by any bill_line_items
              const { data: referencingItems, error: refError } = await supabase
                .from('bill_line_items')
                .select('id')
                .eq('inventory_item_id', record.id)
                .limit(1);

              if (refError) {
                result.errors.push(`Failed to check references for inventory item ${record.id}: ${refError.message}`);
                continue;
              }

              if (referencingItems && referencingItems.length > 0) {
                // Clear the inventory_item_id reference in all line items first
                const { error: updateError } = await supabase
                  .from('bill_line_items')
                  .update({ inventory_item_id: null })
                  .eq('inventory_item_id', record.id);

                if (updateError) {
                  result.errors.push(`Failed to clear references for inventory item ${record.id}: ${updateError.message}`);
                  continue;
                }
              }
            }

            const { error } = await supabase
              .from(tableName as any)
              .delete()
              .eq('id', record.id);

            if (error) {
              result.errors.push(`Delete failed for ${tableName}/${record.id}: ${error.message}`);
            } else {
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

    console.log(`📊 Sync upload summary: ${result.uploaded} records uploaded`);
return result;
}

  private async handleFailedBatch(tableName: string, cleanedBatch: any[], originalBatch: any[]) {
    console.log(`🔍 Attempting individual uploads to identify problem records...`);
    for (let i = 0; i < cleanedBatch.length; i++) {
      const record = cleanedBatch[i];
      const original = originalBatch[i];
      try {
        const { error: individualError } = await supabase
          .from(tableName as any)
          .upsert([record], { onConflict: 'id' });
        
        if (individualError) {
          console.error(`❌ Individual record failed:`, record, individualError);
          await db.addPendingSync(tableName, record.id, 'update', record);
        } else {
          await db.markAsSynced(tableName, original.id);
        }
      } catch (e) {
        console.error(`❌ Critical error with record:`, record, e);
      }
    }
  }

private async downloadRemoteChanges(storeId: string) {
const result = { downloaded: 0, conflicts: 0, errors: [] as string[] };

for (const tableName of SYNC_TABLES) {
try {
        if (!await this.validateDependencies(tableName, storeId)) {
console.log(`⏳ Skipping download for ${tableName} - dependencies not met`);
continue;
}

const syncMetadata = await db.getSyncMetadata(tableName);
let lastSyncAt = syncMetadata?.last_synced_at || '1970-01-01T00:00:00.000Z';

if (lastSyncAt && isNaN(Date.parse(lastSyncAt))) {
console.warn(`Invalid lastSyncAt for ${tableName}: ${lastSyncAt}, using default`);
lastSyncAt = '1970-01-01T00:00:00.000Z';
}

const hasUpdatedAt = ['products', 'suppliers', 'customers'].includes(tableName);
const timestampField = hasUpdatedAt ? 'updated_at' : 'created_at';

let query = supabase.from(tableName as any).select('*');

if (tableName !== 'transactions' && tableName !== 'stores') {
query = query.eq('store_id', storeId);
} else if (tableName === 'stores') {
query = query.eq('id', storeId);
}

const isFirstSync = !lastSyncAt || lastSyncAt === '1970-01-01T00:00:00.000Z';

if (!isFirstSync) {
query = query.gte(timestampField, lastSyncAt);
console.log(`📊 Incremental sync for ${tableName} since ${lastSyncAt}`);
} else {
          console.log(`📊 Full sync for ${tableName} (first sync)`);
}

query = query
.order(timestampField, { ascending: true })
.limit(SYNC_CONFIG.maxRecordsPerSync);

const { data: remoteRecords, error } = await query;

if (error) {
result.errors.push(`Download failed for ${tableName}: ${error.message}`);
continue;
}

if (!remoteRecords || remoteRecords.length === 0) {
          console.log(`📊 No records found for ${tableName}`);
continue;
}

console.log(`📊 Found ${remoteRecords.length} records for ${tableName}`);

for (const remoteRecord of remoteRecords) {
try {
const localRecord = await (db as any)[tableName].get(remoteRecord.id);

if (!localRecord) {
await (db as any)[tableName].put({
...remoteRecord,
_synced: true,
_lastSyncedAt: new Date().toISOString()
});
result.downloaded++;
} else {
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

const latestRecord = remoteRecords[remoteRecords.length - 1];
const latestTimestamp = latestRecord?.[timestampField] || new Date().toISOString();
await db.updateSyncMetadata(tableName, latestTimestamp);

} catch (error) {
result.errors.push(`Table ${tableName} download error: ${error}`);
}
}

return result;
}

private async resolveConflict(tableName: string, localRecord: any, remoteRecord: any): Promise<boolean> {
if (localRecord._synced) {
await (db as any)[tableName].put({
...remoteRecord,
_synced: true,
_lastSyncedAt: new Date().toISOString()
});
      return false;
}

    // Financial-specific conflict resolution
if (tableName === 'cash_drawer_accounts') {
return await this.resolveCashDrawerAccountConflict(localRecord, remoteRecord);
}

    if (tableName === 'customers' || tableName === 'suppliers') {
      return await this.resolveBalanceConflict(tableName, localRecord, remoteRecord);
    }

    // Default: timestamp-based resolution
const hasUpdatedAt = ['products', 'suppliers', 'customers'].includes(tableName);
const timestampField = hasUpdatedAt ? 'updated_at' : 'created_at';

const localModifiedAt = new Date(localRecord[timestampField] || localRecord.created_at);
const remoteModifiedAt = new Date(remoteRecord[timestampField] || remoteRecord.created_at);

if (remoteModifiedAt >= localModifiedAt) {
await db.addPendingSync(tableName, localRecord.id, 'update', localRecord);
await (db as any)[tableName].put({
...remoteRecord,
_synced: true,
_lastSyncedAt: new Date().toISOString()
});
} else {
await (db as any)[tableName].update(localRecord.id, {
_lastSyncedAt: new Date().toISOString()
});
}

    return true;
}

private async resolveCashDrawerAccountConflict(localRecord: any, remoteRecord: any): Promise<boolean> {
const localBalance = Number(localRecord.current_balance || 0);
const remoteBalance = Number(remoteRecord.current_balance || 0);

if (Math.abs(localBalance - remoteBalance) > 0.01) {
      console.warn(`💰 Cash drawer balance conflict: Local: $${localBalance.toFixed(2)}, Remote: $${remoteBalance.toFixed(2)}`);
      
      // For cash drawer conflicts, recalculate balance from transactions instead of using max
      // This ensures accuracy and prevents balance inflation
      try {
        const { cashDrawerUpdateService } = await import('./cashDrawerUpdateService');
        const calculatedBalance = await cashDrawerUpdateService.getCurrentCashDrawerBalance(localRecord.store_id);
        
        console.log(`💰 Recalculated balance from transactions: $${calculatedBalance.toFixed(2)}`);
        
        await db.cash_drawer_accounts.update(localRecord.id, {
          current_balance: calculatedBalance,
          updated_at: new Date().toISOString(),
          _synced: true,
          _lastSyncedAt: new Date().toISOString()
        });
        
        return true;
      } catch (error) {
        console.error('Error recalculating cash drawer balance:', error);
        
        // Fallback to timestamp-based resolution
        const localTimestamp = new Date(localRecord.updated_at || localRecord.created_at);
        const remoteTimestamp = new Date(remoteRecord.updated_at || remoteRecord.created_at);
        
        if (remoteTimestamp >= localTimestamp) {
          await db.cash_drawer_accounts.put({
            ...remoteRecord,
            _synced: true,
            _lastSyncedAt: new Date().toISOString()
          });
        } else {
          await db.cash_drawer_accounts.update(localRecord.id, {
            _synced: true,
            _lastSyncedAt: new Date().toISOString()
          });
        }
        
        return true;
      }
    }

const localTimestamp = new Date(localRecord.updated_at || localRecord.created_at);
const remoteTimestamp = new Date(remoteRecord.updated_at || remoteRecord.created_at);

if (remoteTimestamp >= localTimestamp) {
      await db.cash_drawer_accounts.put({
...remoteRecord,
_synced: true,
_lastSyncedAt: new Date().toISOString()
});
} else {
      await db.cash_drawer_accounts.update(localRecord.id, {
_synced: true,
_lastSyncedAt: new Date().toISOString()
});
}

return false;
}

  private async resolveBalanceConflict(tableName: string, localRecord: any, remoteRecord: any): Promise<boolean> {
const localUsdBalance = Number(localRecord.usd_balance || 0);
const remoteUsdBalance = Number(remoteRecord.usd_balance || 0);
const localLbpBalance = Number(localRecord.lb_balance || 0);
const remoteLbpBalance = Number(remoteRecord.lb_balance || 0);

if (Math.abs(localUsdBalance - remoteUsdBalance) > 0.01 || Math.abs(localLbpBalance - remoteLbpBalance) > 0.01) {
      console.warn(`💰 Balance conflict: Local USD: $${localUsdBalance.toFixed(2)}, Remote USD: $${remoteUsdBalance.toFixed(2)}`);

const finalUsdBalance = Math.max(localUsdBalance, remoteUsdBalance);
const finalLbpBalance = Math.max(localLbpBalance, remoteLbpBalance);

      await (db as any)[tableName].put({
...remoteRecord,
usd_balance: finalUsdBalance,
lb_balance: finalLbpBalance,
_synced: true,
_lastSyncedAt: new Date().toISOString()
});

return true;
}

return false;
}

private async processPendingSyncs() {
const pendingSyncs = await db.getPendingSyncs();

for (const pendingSync of pendingSyncs) {
try {
if (pendingSync.retry_count >= SYNC_CONFIG.maxRetries) {
console.error(`Max retries reached for pending sync: ${pendingSync.id}`);
await db.removePendingSync(pendingSync.id);
continue;
}

let success = false;

switch (pendingSync.operation) {
case 'create':
case 'update':
            const cleanedPayload = dataValidationService.cleanRecordForUpload(
              pendingSync.payload, 
              pendingSync.table_name
            );
            if (cleanedPayload) {
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
await db.pending_syncs.update(pendingSync.id, {
retry_count: pendingSync.retry_count + 1,
last_error: 'Retry failed'
});
}

} catch (error) {
await db.pending_syncs.update(pendingSync.id, {
retry_count: pendingSync.retry_count + 1,
last_error: error instanceof Error ? error.message : 'Unknown error'
});
}
}
}

  private async validateDependencies(tableName: SyncTable, storeId: string): Promise<boolean> {
    const dependencies = SYNC_DEPENDENCIES[tableName];

    if (dependencies.length === 0) {
      return true;
    }

    try {
      const hasAnySyncMetadata = await db.sync_metadata.count() > 0;

      if (!hasAnySyncMetadata) {
        const tableIndex = SYNC_TABLES.indexOf(tableName);
        const dependencyIndices = dependencies.map(dep => SYNC_TABLES.indexOf(dep));
        return dependencyIndices.every(depIndex => depIndex < tableIndex);
      }

      const dependencyChecks = await Promise.all(
        dependencies.map(async (depTable) => {
          const lastSynced = await db.sync_metadata
            .where('table_name')
            .equals(depTable)
            .first();
          return !!lastSynced;
        })
      );

      return dependencyChecks.every(check => check);
    } catch (error) {
      console.error(`Error validating dependencies for ${tableName}:`, error);
      return false;
    }
  }

  private async ensureStoreExists(storeId: string) {
    try {
      const localStore = await db.stores.get(storeId);
      if (localStore) return;

      const { data: remoteStore, error } = await supabase
        .from('stores')
        .select('*')
        .eq('id', storeId)
        .single();

      if (error && error.code !== 'PGRST116') {
        console.error(`❌ Error checking store on server:`, error);
        return;
      }

      if (remoteStore) {
        await db.stores.put({
          ...remoteStore,
          _synced: true,
          _lastSyncedAt: new Date().toISOString()
        });
      } else {
        const defaultStore = {
          id: storeId,
          name: 'Default Store',
          address: 'Default Address',
          phone: '000-000-0000',
          email: 'store@example.com',
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
          preferred_commission_rate: 0,
          preferred_language: 'en',
          preferred_currency: 'USD'
        };

        await supabase.from('stores').insert(defaultStore);
        await db.stores.put({
          ...defaultStore,
          _synced: true,
          _lastSyncedAt: new Date().toISOString()
        });
      }
    } catch (error) {
      console.error(`Error ensuring store exists:`, error);
    }
  }

  private async initializeSyncMetadata(storeId: string) {
    const hasAnySyncMetadata = await db.sync_metadata.count() > 0;

    if (!hasAnySyncMetadata) {
      console.log('🔄 Initializing sync metadata for first sync...');
      const currentTime = new Date().toISOString();

      for (const tableName of SYNC_TABLES) {
        try {
          await db.updateSyncMetadata(tableName, currentTime);
        } catch (error) {
          console.warn(`Failed to initialize sync metadata for ${tableName}:`, error);
        }
      }
    }
  }

  async fullResync(storeId: string): Promise<SyncResult> {
    const result: SyncResult = {
      success: true,
      errors: [],
      synced: { uploaded: 0, downloaded: 0 },
      conflicts: 0
    };

    try {
      await db.transaction('rw', db.tables, async () => {
        for (const tableName of SYNC_TABLES) {
          await (db as any)[tableName].clear();
        }
        await db.sync_metadata.clear();
        await db.pending_syncs.clear();
      });

      for (const tableName of SYNC_TABLES) {
        console.log(`📥 Full resync: downloading ${tableName}...`);
        
        let query = supabase.from(tableName as any).select('*');
        
        if (tableName === 'stores') {
          query = query.eq('id', storeId);
        } else {
          query = query.eq('store_id', storeId);
        }
        
        query = query.limit(SYNC_CONFIG.maxRecordsPerSync);
        
        const { data: remoteRecords, error } = await query;

        if (error) {
          result.errors.push(`Download failed for ${tableName}: ${error.message}`);
        } else if (remoteRecords && remoteRecords.length > 0) {
          const recordsWithSync = remoteRecords.map(record => ({
            ...record,
            _synced: true,
            _lastSyncedAt: new Date().toISOString()
          }));
          
          await (db as any)[tableName].bulkPut(recordsWithSync);
          result.synced.downloaded += remoteRecords.length;
          
          await db.updateSyncMetadata(tableName, new Date().toISOString());
        }
      }

      result.success = result.errors.length === 0;

} catch (error) {
      result.success = false;
      result.errors.push(error instanceof Error ? error.message : 'Full resync failed');
    }

    return result;
  }

async syncTable(storeId: string, tableName: SyncTable): Promise<SyncResult> {
const result: SyncResult = {
success: true,
errors: [],
synced: { uploaded: 0, downloaded: 0 },
conflicts: 0
};

try {
const unsyncedRecords = await db.getUnsyncedRecords(tableName);
      
if (unsyncedRecords.length > 0) {
const cleanedRecords = (unsyncedRecords as any[])
          .map((record: any) => dataValidationService.cleanRecordForUpload(record, tableName));

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

      let query = supabase.from(tableName as any).select('*');

if (tableName === 'stores') {
query = query.eq('id', storeId);
} else {
query = query.eq('store_id', storeId);
}

const { data: remoteRecords, error } = await query;

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

  isCurrentlyRunning(): boolean {
    return this.isRunning;
  }

  getLastSyncAttempt(): Date | null {
    return this.lastSyncAttempt;
  }
}

export const syncService = new SyncService();

export async function syncWithSupabase(storeId: string): Promise<SyncResult> {
return syncService.sync(storeId);
}

export function getLastSyncedAt(): string | null {
return localStorage.getItem('last_synced_at');
}

export function setLastSyncedAt(ts: string) {
  localStorage.setItem('last_synced_at', ts);
}

