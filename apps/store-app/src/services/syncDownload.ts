import { getDB } from '../lib/db';
import { supabase } from '../lib/supabase';
import { universalChangeDetectionService, TABLES_WITH_UPDATED_AT } from './universalChangeDetectionService';
import { normalizeBillDateFromRemote } from '../utils/dateUtils';
import { SYNC_CONFIG, SYNC_TABLES, SyncTable, validateDependencies } from './syncConfig';

const db = getDB();

/**
 * Helper: Get timestamp field for a table
 */
export function getTimestampField(tableName: string): 'updated_at' | 'created_at' {
  const hasUpdatedAt = (TABLES_WITH_UPDATED_AT as readonly string[]).includes(tableName);
  return hasUpdatedAt ? 'updated_at' : 'created_at';
}

/**
 * Helper: Apply store filter to query based on table type
 */
export function applyStoreFilter(query: any, tableName: string, storeId: string): any {
  let filteredQuery: any;
  
  // Special case: products - include both store-specific and global
  if (tableName === 'products') {
    filteredQuery = query.or(`store_id.eq.${storeId},is_global.eq.true`);
    console.log(`🔍 applyStoreFilter: ${tableName} - using OR filter: store_id=${storeId} OR is_global=true`);
  }
  // Special case: stores - filter by id (not store_id)
  else if (tableName === 'stores') {
    filteredQuery = query.eq('id', storeId);
    console.log(`🔍 applyStoreFilter: ${tableName} - filtering by id=${storeId}`);
  }
  // Special case: transactions - no store filter
  else if (tableName === 'transactions') {
    filteredQuery = query; // No filter
    console.log(`🔍 applyStoreFilter: ${tableName} - no filter applied`);
  }
  // Special case: role_permissions - GLOBAL table (no store_id column)
  else if (tableName === 'role_permissions') {
    filteredQuery = query; // No filter - download all global permissions
    console.log(`🔍 applyStoreFilter: ${tableName} - no filter applied (global table)`);
  }
  // Default: filter by store_id
  else {
    filteredQuery = query.eq('store_id', storeId);
    console.log(`🔍 applyStoreFilter: ${tableName} - filtering by store_id=${storeId}`);
  }
  
  return filteredQuery;
}

async function resolveCashDrawerAccountConflict(localRecord: any, remoteRecord: any): Promise<boolean> {
  // Balance is computed from journal entries - no conflict resolution needed for balance field
  // Compare other fields (name, currency, is_active, etc.) and use remote if different
  const fieldsToCompare = ['name', 'currency', 'is_active', 'account_code'];
  let hasConflict = false;

  for (const field of fieldsToCompare) {
    if (localRecord[field] !== remoteRecord[field]) {
      hasConflict = true;
      break;
    }
  }

  if (hasConflict) {
    console.warn(`💰 Cash drawer account conflict detected in non-balance fields`);
    // Use remote record for non-balance fields (balance is computed from journals, not synced)
    try {
      // Get store's preferred currency to ensure currency matches store preference
      const storeId = localRecord.store_id || remoteRecord.store_id;
      const store = storeId ? await getDB().stores.get(storeId) : null;
      const storePreferredCurrency = store?.preferred_currency || 'LBP';
      
      // Update non-balance fields only
      // Balance fields (current_balance, usd_balance, lbp_balance) are NEVER synced - computed from journal entries only
      const updateData: any = {
        name: remoteRecord.name,
        currency: storePreferredCurrency, // Use store's preferred currency instead of remote currency
        is_active: remoteRecord.is_active,
        account_code: remoteRecord.account_code,
        updated_at: new Date().toISOString(),
        _synced: true,
        _lastSyncedAt: new Date().toISOString()
      };
      // Note: current_balance, usd_balance, lbp_balance are not updated - computed from journal entries only

      await getDB().cash_drawer_accounts.update(localRecord.id, updateData);

      return true;
    } catch (error) {
      console.error('Error resolving cash drawer account conflict:', error);

      // Fallback to timestamp-based resolution
      const localTimestamp = new Date(localRecord.updated_at || localRecord.created_at);
      const remoteTimestamp = new Date(remoteRecord.updated_at || remoteRecord.created_at);

      if (remoteTimestamp >= localTimestamp) {
        // Get store's preferred currency to ensure currency matches store preference
        const storeId = localRecord.store_id || remoteRecord.store_id;
        const store = storeId ? await getDB().stores.get(storeId) : null;
        const storePreferredCurrency = store?.preferred_currency || 'LBP';
        
        // Update non-balance fields only (balance is computed from journals)
        const updateData: any = {
          ...remoteRecord,
          currency: storePreferredCurrency, // Use store's preferred currency instead of remote currency
          _synced: true,
          _lastSyncedAt: new Date().toISOString()
        };
        // Remove all balance fields from update - they're computed from journal entries, not synced
        delete updateData.current_balance;
        delete updateData.usd_balance;
        delete updateData.lbp_balance;
        await getDB().cash_drawer_accounts.put(updateData);
      } else {
        await getDB().cash_drawer_accounts.update(localRecord.id, {
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
    // Exclude balance fields from sync - they're computed from journal entries, not synced
    const syncData: any = {
      ...remoteRecord,
      _synced: true,
      _lastSyncedAt: new Date().toISOString()
    };
    // Remove all balance fields - computed from journal entries only
    delete syncData.current_balance;
    delete syncData.usd_balance;
    delete syncData.lbp_balance;
    await getDB().cash_drawer_accounts.put(syncData);
  } else {
    await getDB().cash_drawer_accounts.update(localRecord.id, {
      _synced: true,
      _lastSyncedAt: new Date().toISOString()
    });
  }

  return false;
}

async function resolveBalanceConflict(tableName: string, _localRecord: any, _remoteRecord: any): Promise<boolean> {
  // Balances are now calculated from journal entries, not stored on entities
  // No need to resolve balance conflicts for entities - balances are derived, not stored
  if (tableName === 'entities') {
    return false; // Entities don't have balance fields anymore
  }
  
  // For other tables (if any), skip balance resolution
  return false;
}

// Note: Employee balance conflict resolution removed
// Employee balances are now calculated from journal entries (account 2200)
// No balance fields to conflict - balances are always derived from journals

async function resolveTransactionConflict(localRecord: any, remoteRecord: any): Promise<boolean> {
  // Transactions are immutable - remote version is authoritative
  // If there's a conflict, it means the transaction was modified in Supabase (rare but possible)
  console.warn(`⚠️ Transaction conflict detected for ${localRecord.id} - remote version takes precedence`);
  
  await getDB().transactions.put({
    ...remoteRecord,
    _synced: true,
    _lastSyncedAt: new Date().toISOString()
  });

  return true;
}

async function resolveBillConflict(tableName: string, localRecord: any, remoteRecord: any): Promise<boolean> {
  // Bills and bill line items should prefer remote version if there's a conflict
  // This is because bill modifications are typically done through proper channels
  const localTimestamp = new Date(localRecord.updated_at || localRecord.created_at);
  const remoteTimestamp = new Date(remoteRecord.updated_at || remoteRecord.created_at);

  if (remoteTimestamp >= localTimestamp) {
    console.warn(`📄 Bill conflict: Remote version is newer, accepting remote changes for ${tableName}/${localRecord.id}`);

    const remoteForDexie =
      tableName === 'bills'
        ? { ...remoteRecord, bill_date: normalizeBillDateFromRemote(remoteRecord) }
        : remoteRecord;

    await (db as any)[tableName].put({
      ...remoteForDexie,
      _synced: true,
      _lastSyncedAt: new Date().toISOString()
    });

    // If local had changes, add to pending syncs for review
    if (!localRecord._synced) {
      await getDB().addPendingSync(tableName, localRecord.id, 'update', localRecord);
    }

    return true;
  } else {
    // Local is newer, keep local but mark as synced
    await (db as any)[tableName].update(localRecord.id, {
      _synced: true,
      _lastSyncedAt: new Date().toISOString()
    });
    return false;
  }
}

async function resolveConflict(tableName: string, localRecord: any, remoteRecord: any): Promise<boolean> {
  // Normalize is_global field if it's a product (remoteRecord is already normalized, but double-check)
  const normalizedRemote = { ...remoteRecord };
  if (tableName === 'products' && normalizedRemote.is_global !== undefined && normalizedRemote.is_global !== null) {
    // Handle boolean, string, or number values
    const isGlobal = normalizedRemote.is_global === true || 
                     normalizedRemote.is_global === 1 || 
                     normalizedRemote.is_global === '1' || 
                     normalizedRemote.is_global === 'true';
    normalizedRemote.is_global = isGlobal ? 1 : 0;
  } else if (tableName === 'products') {
    // Default to 0 if undefined or null
    normalizedRemote.is_global = 0;
  }

  if (localRecord._synced) {
    const merged =
      tableName === 'bills'
        ? {
            ...normalizedRemote,
            bill_date: normalizeBillDateFromRemote(normalizedRemote),
          }
        : normalizedRemote;
    await (db as any)[tableName].put({
      ...merged,
      _synced: true,
      _lastSyncedAt: new Date().toISOString()
    });
    return false;
  }

  // Financial-specific conflict resolution
  if (tableName === 'cash_drawer_accounts') {
    return await resolveCashDrawerAccountConflict(localRecord, normalizedRemote);
  }

  // Entity balance conflict resolution (replaces customers/suppliers)
  if (tableName === 'entities' && (localRecord.entity_type === 'customer' || localRecord.entity_type === 'supplier')) {
    return await resolveBalanceConflict(tableName, localRecord, normalizedRemote);
  }

  // Employee conflict resolution (no balance fields - balances calculated from journals)
  // Use timestamp-based resolution for users table
  if (tableName === 'users') {
    const localTimestamp = new Date(localRecord.updated_at || localRecord.created_at);
    const remoteTimestamp = new Date(normalizedRemote.updated_at || normalizedRemote.created_at);
    
    if (remoteTimestamp >= localTimestamp) {
      await getDB().users.put({
        ...normalizedRemote,
        _synced: true,
        _lastSyncedAt: new Date().toISOString()
      });
    } else {
      await getDB().users.update(localRecord.id, {
        _synced: true,
        _lastSyncedAt: new Date().toISOString()
      });
    }
    return false; // No special conflict handling needed
  }

  // Transaction conflict resolution (immutable - remote always wins)
  if (tableName === 'transactions') {
    return await resolveTransactionConflict(localRecord, normalizedRemote);
  }

  // Bill and bill line items conflict resolution
  if (tableName === 'bills' || tableName === 'bill_line_items') {
    return await resolveBillConflict(tableName, localRecord, normalizedRemote);
  }

  // Default: timestamp-based resolution
  const timestampField = getTimestampField(tableName);

  const localModifiedAt = new Date(localRecord[timestampField] || localRecord.created_at);
  const remoteModifiedAt = new Date(normalizedRemote[timestampField] || normalizedRemote.created_at);

  if (remoteModifiedAt >= localModifiedAt) {
    await getDB().addPendingSync(tableName, localRecord.id, 'update', localRecord);
    await (db as any)[tableName].put({
      ...normalizedRemote,
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

export async function downloadRemoteChanges(storeId: string) {
  const result = { downloaded: 0, conflicts: 0, errors: [] as string[] };

  for (const tableName of SYNC_TABLES) {
    const tableStart = performance.now();
    try {
      // NOTE: In fully event-driven mode, ALL tables are handled by EventStreamService
      // This sync() method is only used for:
      // 1. Initial full resync (when DB is empty)
      // 2. Manual "Force Sync" triggered by user
      // 3. Uploading local unsynced changes
      // Real-time updates happen via EventStreamService, not periodic sync

      if (!await validateDependencies(tableName, storeId)) {
        console.log(`⏳ Skipping download for ${tableName} - dependencies not met`);
        continue;
      }

      const syncMetadata = await getDB().getSyncMetadata(tableName);
      let lastSyncAt = syncMetadata?.last_synced_at || '1970-01-01T00:00:00.000Z';

      if (lastSyncAt && isNaN(Date.parse(lastSyncAt))) {
        console.warn(`Invalid lastSyncAt for ${tableName}: ${lastSyncAt}, using default`);
        lastSyncAt = '1970-01-01T00:00:00.000Z';
      }

      const isFirstSync = !lastSyncAt || lastSyncAt === '1970-01-01T00:00:00.000Z';
      const timestampField = getTimestampField(tableName);
      
      // Check if we have any non-deleted local records - if not, do a full sync to catch existing records
      // This prevents the issue where sync metadata exists but local database is empty (manually cleared, migration, etc.)
      const table = (db as any)[tableName];
      const localRecordCount = await table.filter((record: any) => !record._deleted).count();
      const shouldDoFullSync = isFirstSync || localRecordCount === 0;

      // Change detection - skip sync if no changes detected
      // In fully event-driven mode, this is only used for initial/manual sync
      if (!shouldDoFullSync) {
        const changeDetection = await universalChangeDetectionService.detectChanges(
          tableName,
          storeId,
          lastSyncAt,
          isFirstSync
        );

        if (!changeDetection.hasChanges) {
          // Still update sync metadata to track that we checked
          await getDB().updateSyncMetadata(tableName, new Date().toISOString());
          continue; // Skip to next table
        }

        console.log(`📊 Incremental sync for ${tableName} since ${lastSyncAt} (${localRecordCount} local records) - changes detected`);
      } else {
        console.log(`📊 Full sync for ${tableName} (${localRecordCount} local records)`);
      }

      // Add debug logging for branches
      if (tableName === 'branches') {
        console.log(`🔍 Branch debug: localRecordCount=${localRecordCount}, isFirstSync=${isFirstSync}, shouldDoFullSync=${shouldDoFullSync}`);
        const localBranches = await table.filter((record: any) => !record._deleted).toArray();
        console.log(`🔍 Local branches:`, localBranches.map((b: any) => ({ id: b.id, name: b.name, store_id: b.store_id, _synced: b._synced })));
      }

      // Build query with store filter
      let query = supabase.from(tableName as any).select('*');
      query = applyStoreFilter(query, tableName, storeId);

      // Log query details for debugging
      console.log(`🔍 downloadRemoteChanges: Fetching ${tableName} for storeId=${storeId}, shouldDoFullSync=${shouldDoFullSync}, lastSyncAt=${lastSyncAt}`);

      // Special handling for products: always include global products even in incremental syncs
      // Global products might not have been updated recently, so we need to fetch them separately
      let remoteRecords: any[] = [];
      let error: any = null;
      
      if (tableName === 'products' && !shouldDoFullSync) {
        // For incremental sync, fetch store-specific and global products separately
        // 1. Store-specific products updated since lastSyncAt
        const storeSpecificQuery = supabase
          .from('products')
          .select('*')
          .eq('store_id', storeId)
          .gte(timestampField, lastSyncAt)
          .order(timestampField, { ascending: true })
          .limit(SYNC_CONFIG.maxRecordsPerSync);
        
        // 2. All global products (regardless of update time)
        const globalProductsQuery = supabase
          .from('products')
          .select('*')
          .eq('is_global', true)
          .order(timestampField, { ascending: true })
          .limit(SYNC_CONFIG.maxRecordsPerSync);
        
        console.log(`📊 Incremental sync for ${tableName} since ${lastSyncAt} (${localRecordCount} local records) - fetching store-specific and global products separately`);
        
        // Execute both queries in parallel
        const [storeSpecificResult, globalProductsResult] = await Promise.all([
          storeSpecificQuery,
          globalProductsQuery
        ]);
        
        // Log detailed results for debugging
        console.log(`🔍 Store-specific products query result:`, {
          count: storeSpecificResult.data?.length || 0,
          error: storeSpecificResult.error,
          hasData: !!storeSpecificResult.data
        });
        
        console.log(`🔍 Global products query result:`, {
          count: globalProductsResult.data?.length || 0,
          error: globalProductsResult.error,
          hasData: !!globalProductsResult.data,
          data: globalProductsResult.data?.slice(0, 2) // Log first 2 for debugging
        });
        
        // Log errors but continue processing successful results
        if (storeSpecificResult.error) {
          console.error(`⚠️ Failed to fetch store-specific products:`, storeSpecificResult.error);
          result.errors.push(`Download failed for ${tableName} (store-specific): ${storeSpecificResult.error.message}`);
        }
        
        if (globalProductsResult.error) {
          console.error(`⚠️ Failed to fetch global products:`, globalProductsResult.error);
          console.error(`⚠️ Global products error details:`, {
            message: globalProductsResult.error.message,
            details: globalProductsResult.error.details,
            hint: globalProductsResult.error.hint,
            code: globalProductsResult.error.code
          });
          result.errors.push(`Download failed for ${tableName} (global): ${globalProductsResult.error.message}`);
        } else if (!globalProductsResult.data || globalProductsResult.data.length === 0) {
          // No error but no data - might be RLS blocking or no global products exist
          console.warn(`⚠️ Global products query returned no data (no error). Possible causes:`);
          console.warn(`   - RLS policies might be blocking access`);
          console.warn(`   - No global products exist in database`);
          console.warn(`   - Try running: SELECT * FROM products WHERE is_global = true;`);
        }
        
        // Set error only if both queries failed
        if (storeSpecificResult.error && globalProductsResult.error) {
          error = storeSpecificResult.error; // Use first error
        }
        
        // Combine results and remove duplicates (even if one query failed)
        const allRecords = [
          ...(storeSpecificResult.data || []),
          ...(globalProductsResult.data || [])
        ];
        
        // Remove duplicates by id and normalize is_global field
        const uniqueRecords = Array.from(
          new Map(allRecords.map((record: { id: string } & Record<string, unknown>) => {
            // Normalize is_global: convert any truthy value to 1, any falsy to 0 for Dexie compatibility
            const normalized = { ...record };
            if (normalized.is_global !== undefined && normalized.is_global !== null) {
              // Handle boolean, string, or number values
              const isGlobal = normalized.is_global === true || 
                               normalized.is_global === 1 || 
                               normalized.is_global === '1' || 
                               normalized.is_global === 'true';
              normalized.is_global = isGlobal ? 1 : 0;
            } else {
              // Default to 0 if undefined or null
              normalized.is_global = 0;
            }
            return [record.id, normalized];
          })).values()
        );
        
        remoteRecords = uniqueRecords;
      } else {
        // Apply incremental sync filter if not full sync
        if (!shouldDoFullSync) {
          query = query.gte(timestampField, lastSyncAt);
          console.log(`📊 Incremental sync for ${tableName} since ${lastSyncAt} (${localRecordCount} local records)`);
        }

        query = query
          .order(timestampField, { ascending: true })
          .limit(SYNC_CONFIG.maxRecordsPerSync);

        const queryResult = await query;
        
        // Log query results for debugging
        console.log(`🔍 downloadRemoteChanges: Query result for ${tableName}:`, {
          hasError: !!queryResult.error,
          error: queryResult.error ? {
            message: queryResult.error.message,
            details: queryResult.error.details,
            hint: queryResult.error.hint,
            code: queryResult.error.code
          } : null,
          hasData: !!queryResult.data,
          dataType: Array.isArray(queryResult.data) ? 'array' : typeof queryResult.data,
          recordCount: Array.isArray(queryResult.data) ? queryResult.data.length : (queryResult.data ? 1 : 0),
          dataSample: Array.isArray(queryResult.data) && queryResult.data.length > 0 ? queryResult.data.slice(0, 2) : queryResult.data
        });
        
        remoteRecords = queryResult.data || [];
        error = queryResult.error;
      }

      if (error) {
        result.errors.push(`Download failed for ${tableName}: ${error.message}`);
        console.error(`❌ downloadRemoteChanges: Query error for ${tableName}:`, error);
        continue;
      }

      if (!remoteRecords || remoteRecords.length === 0) {
        console.warn(`⚠️ downloadRemoteChanges: ${tableName} query returned no data. Possible causes:`, {
          storeId,
          tableName,
          shouldDoFullSync,
          lastSyncAt,
          timestampField: getTimestampField(tableName)
        });

        // For inventory_items specifically, log diagnostic info
        if (tableName === 'inventory_items') {
          const allRemoteQuery = supabase.from('inventory_items').select('id, store_id, created_at').eq('store_id', storeId).limit(5);
          const { data: sampleRecords } = await allRemoteQuery;
          console.log(`🔍 Diagnostic: Found ${sampleRecords?.length || 0} total inventory_items in Supabase for this store (sample check)`);
        }
        
        // For branches specifically, log diagnostic info
        if (tableName === 'branches') {
          const allRemoteQuery = supabase.from('branches').select('id, store_id, name, created_at').eq('store_id', storeId).limit(5);
          const { data: sampleRecords } = await allRemoteQuery;
          console.log(`🔍 Diagnostic: Found ${sampleRecords?.length || 0} total branches in Supabase for this store (sample check)`);
          if (sampleRecords && sampleRecords.length > 0) {
            console.log(`🔍 Branch sample:`, sampleRecords[0]);
          }
          
          // Also check if there are any branches at all (without store filter)
          const { data: allBranches } = await supabase.from('branches').select('id, store_id, name').limit(5);
          console.log(`🔍 Diagnostic: Found ${allBranches?.length || 0} total branches in Supabase (all stores)`);
        }
        continue;
      }

      console.log(`📊 Found ${remoteRecords.length} records for ${tableName}`);

      for (const remoteRecord of remoteRecords) {
        try {
          // Validate that record has required id field
          if (!remoteRecord || !remoteRecord.id || typeof remoteRecord.id !== 'string') {
            console.warn(`⚠️ Skipping record in ${tableName} - missing or invalid id:`, remoteRecord);
            result.errors.push(`Record in ${tableName} missing or invalid id`);
            continue;
          }

          const localRecord = await (db as any)[tableName].get(remoteRecord.id);

          // Normalize fields for Dexie compatibility
          const normalizedRecord = { ...remoteRecord };
          
          // Normalize is_global for products: convert boolean to 0/1 for Dexie
          if (tableName === 'products' && normalizedRecord.is_global !== undefined && normalizedRecord.is_global !== null) {
            // Handle boolean, string, or number values
            const isGlobal = normalizedRecord.is_global === true || 
                             normalizedRecord.is_global === 1 || 
                             normalizedRecord.is_global === '1' || 
                             normalizedRecord.is_global === 'true';
            normalizedRecord.is_global = isGlobal ? 1 : 0;
          } else if (tableName === 'products') {
            // Default to 0 if undefined or null
            normalizedRecord.is_global = 0;
          }
          
          // Normalize is_deleted for stores: convert to _deleted for IndexedDB
          if (tableName === 'stores' && normalizedRecord.is_deleted !== undefined) {
            normalizedRecord._deleted = normalizedRecord.is_deleted === true || normalizedRecord.is_deleted === 1;
            // Remove Supabase-specific fields that aren't in IndexedDB schema
            delete normalizedRecord.is_deleted;
            delete normalizedRecord.deleted_at;
            delete normalizedRecord.deleted_by;
          }
          
          // Normalize is_deleted for branches: convert to _deleted for IndexedDB
          if (tableName === 'branches' && normalizedRecord.is_deleted !== undefined) {
            normalizedRecord._deleted = normalizedRecord.is_deleted === true || normalizedRecord.is_deleted === 1;
            // Remove Supabase-specific fields that aren't in IndexedDB schema
            delete normalizedRecord.is_deleted;
            delete normalizedRecord.deleted_at;
            delete normalizedRecord.deleted_by;
          }

          if (tableName === 'bills') {
            normalizedRecord.bill_date = normalizeBillDateFromRemote(normalizedRecord);
          }

          if (!localRecord) {
            await (db as any)[tableName].put({
              ...normalizedRecord,
              _synced: true,
              _lastSyncedAt: new Date().toISOString()
            });
            result.downloaded++;
          } else {
            const conflict = await resolveConflict(tableName, localRecord, normalizedRecord);
            if (conflict) {
              result.conflicts++;
            } else {
              result.downloaded++;
            }
          }
        } catch (error) {
          const recordId = remoteRecord?.id || 'unknown';
          result.errors.push(`Record process error ${tableName}/${recordId}: ${error}`);
        }
      }

      const latestRecord = remoteRecords[remoteRecords.length - 1];
      const latestTimestamp = latestRecord?.[timestampField] || new Date().toISOString();
      await getDB().updateSyncMetadata(tableName, latestTimestamp);

      const tableTime = performance.now() - tableStart;
      console.log(`  ⏱️  ${tableName} download: ${tableTime.toFixed(2)}ms (${remoteRecords.length} records)`);

    } catch (error) {
      const tableTime = performance.now() - tableStart;
      console.error(`  ⏱️  ${tableName} download failed after ${tableTime.toFixed(2)}ms:`, error);
      result.errors.push(`Table ${tableName} download error: ${error}`);
    }
  }

  return result;
}

// Re-export SyncTable for use in syncService.ts syncTable method
export type { SyncTable };
