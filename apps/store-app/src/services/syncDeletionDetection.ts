import { getDB } from '../lib/db';
import { supabase } from '../lib/supabase';
import { SYNC_CONFIG, SYNC_TABLES, DeletionState } from './syncConfig';
import { undoRecordEffects } from './syncUpload';

const db = getDB();

/**
 * Detects and removes records that exist locally but were deleted from Supabase.
 * OPTIMIZED: Uses pagination, incremental state tracking, and hash comparison.
 *
 * @param storeId - The store to check deletions for
 * @param deletionStateCache - Mutable cache updated in-place (Map is passed by reference)
 */
export async function detectAndSyncDeletions(
  storeId: string,
  deletionStateCache: Map<string, DeletionState>
) {
  const result = { deleted: 0, errors: [] as string[] };
  
  console.log('🔍 Starting optimized deletion detection...');
  const detectionStart = performance.now();
  
  for (const tableName of SYNC_TABLES) {
    const tableStart = performance.now();
    try {
      // NOTE: Deletion detection runs for ALL tables as a safety mechanism
      // Even though deletions are handled via events (reverse operation),
      // this catches any deletions that happened directly in Supabase

      const table = (db as any)[tableName];
      
      // Get all synced local records (only check synced records, as unsynced are local-only)
      const localRecords = await table
        .filter((record: any) => record._synced && !record._deleted)
        .toArray();
      
      if (localRecords.length === 0) {
        continue;
      }
      
      const localCount = localRecords.length;
      const isLargeTable = localCount >= SYNC_CONFIG.largeTableThreshold;
      
      // Check if we can use incremental detection
      const lastState = deletionStateCache.get(tableName);
      const shouldUseIncremental = lastState && 
        SYNC_CONFIG.deletionUseHashComparison && 
        isLargeTable;
      
      if (shouldUseIncremental) {
        // Quick check: if record count hasn't changed significantly, skip full check
        const countDiff = Math.abs(localCount - lastState.record_count);
        if (countDiff === 0) {
          console.log(`⚡ ${tableName}: No count change, skipping deletion check`);
          continue;
        }
        
        if (countDiff < 10 && localCount > 100) {
          console.log(`⚡ ${tableName}: Minor count change (${countDiff}), using targeted check`);
        }
      }
      
      // Fetch remote IDs with pagination for large tables
      const remoteIds = new Set<string>();
      let hasMore = true;
      let offset = 0;
      let totalFetched = 0;
      let queryTimedOut = false;
      
      while (hasMore) {
        let query = supabase
          .from(tableName as any)
          .select('id', { count: 'exact' });
        
        // Apply store filtering
        if (tableName === 'stores') {
          query = query.eq('id', storeId);
        } else if (tableName === 'transactions') {
          // No store filter for transactions
        } else if (tableName === 'role_permissions') {
          // GLOBAL table - no store_id filter (check all global permissions)
          // No filter needed
        } else if (tableName === 'products') {
          query = query.or(`store_id.eq.${storeId},is_global.eq.true`);
        } else {
          query = query.eq('store_id', storeId);
        }
        
        // Add pagination
        const pageSize = SYNC_CONFIG.largeTablePaginationSize;
        query = query.range(offset, offset + pageSize - 1);
        
        // Add timeout wrapper
        const queryPromise = query;
        const timeoutPromise = new Promise((_, reject) => 
          setTimeout(() => reject(new Error('Query timeout')), SYNC_CONFIG.queryTimeout)
        );
        
        let queryResult;
        try {
          queryResult = await Promise.race([queryPromise, timeoutPromise]) as any;
        } catch (_timeoutError) {
          result.errors.push(`Query timeout for ${tableName} at offset ${offset}`);
          console.error(`⏱️ Query timeout for ${tableName} at offset ${offset}`);
          queryTimedOut = true;
          break;
        }
        
        const { data: remoteRecords, error } = queryResult;
        
        if (error) {
          result.errors.push(`Failed to fetch remote IDs for ${tableName}: ${error.message}`);
          queryTimedOut = true;
          break;
        }
        
        // Add fetched IDs to set
        if (remoteRecords) {
          remoteRecords.forEach((r: any) => remoteIds.add(r.id));
          totalFetched += remoteRecords.length;
        }
        
        // Check if there are more records
        hasMore = remoteRecords && remoteRecords.length === pageSize;
        offset += pageSize;
        
        // Safety check: prevent infinite loops
        if (offset > 50000) {
          console.warn(`⚠️ ${tableName}: Reached pagination limit (50k records)`);
          break;
        }
      }
      
      // CRITICAL FIX: Skip deletion detection if query timed out or failed
      // Otherwise we'll incorrectly mark records as deleted when they're just not fetched yet
      if (queryTimedOut) {
        console.warn(`⚠️ Skipping deletion detection for ${tableName} - query timed out or failed. Will retry next sync.`);
        const tableTime = performance.now() - tableStart;
        console.log(`  ⏱️  ${tableName} deletion check: ${tableTime.toFixed(2)}ms (skipped due to timeout)`);
        continue; // Skip to next table
      }
      
      console.log(`📊 ${tableName}: Fetched ${totalFetched} remote IDs, comparing with ${localCount} local records`);
      
      // Find local records that don't exist remotely
      const deletedLocally: any[] = [];
      for (const localRecord of localRecords) {
        if (!remoteIds.has(localRecord.id)) {
          deletedLocally.push(localRecord);
        }
      }
      
      if (deletedLocally.length > 0) {
        console.log(`🗑️  Found ${deletedLocally.length} remotely deleted ${tableName} records`);
        
        for (const record of deletedLocally) {
          try {
            // Undo any side effects before deletion
            await undoRecordEffects(tableName, record);
            
            // Delete from local database
            await table.delete(record.id);
            result.deleted++;
            
            console.log(`✅ Removed remotely deleted ${tableName} record: ${record.id.substring(0, 8)}...`);
          } catch (deleteError) {
            console.error(`❌ Failed to delete ${tableName}/${record.id}:`, deleteError);
            result.errors.push(`Failed to delete ${tableName}/${record.id}: ${deleteError}`);
          }
        }
      }
      
      // Update deletion state cache (Map is passed by reference — mutation is visible to caller)
      deletionStateCache.set(tableName, {
        table_name: tableName,
        last_check_at: new Date().toISOString(),
        record_count: localCount - deletedLocally.length,
      });
      
      const tableTime = performance.now() - tableStart;
      console.log(`  ⏱️  ${tableName} deletion check: ${tableTime.toFixed(2)}ms`);
      
    } catch (error) {
      const tableTime = performance.now() - tableStart;
      console.error(`❌ Deletion detection failed for ${tableName} after ${tableTime.toFixed(2)}ms:`, error);
      result.errors.push(`Deletion detection error for ${tableName}: ${error}`);
    }
  }
  
  const totalTime = performance.now() - detectionStart;
  console.log(`🗑️  Deletion detection complete: ${result.deleted} records removed in ${totalTime.toFixed(2)}ms`);
  return result;
}
