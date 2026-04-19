import { getDB } from '../lib/db';
import { supabase } from '../lib/supabase';
import { dataValidationService } from './dataValidationService';
import { eventEmissionService } from './eventEmissionService';
import { SYNC_CONFIG, SYNC_TABLES, validateDependencies } from './syncConfig';

const db = getDB();

/**
 * Classifies errors to determine if they are unrecoverable.
 * Returns true if the error should result in record deletion.
 */
export function isUnrecoverableError(error: any, _tableName: string, _record: any): boolean {
  // PostgreSQL error codes for constraint violations and data validation errors
  const unrecoverableCodes = [
    '23503', // Foreign key constraint violation
    '23502', // Not null constraint violation
    '23514', // Check constraint violation
    '22003', // Numeric value out of range / numeric field overflow
    '42P01', // Undefined table
    '22P02', // Invalid text representation (bad data format)
    '23505', // Unique violation (for certain cases where we can't resolve)
  ];

  // Check error code
  if (error?.code && unrecoverableCodes.includes(error.code)) {
    return true;
  }

  // Check error message for constraint violations and validation errors
  const errorMessage = (error?.message || '').toLowerCase();
  const errorDetails = (error?.details || '').toLowerCase();
  const constraintKeywords = [
    'foreign key',
    'not null',
    'constraint',
    'violates',
    'does not exist',
    'undefined table',
    'numeric field overflow',
    'numeric value out of range',
    'value too large',
    'overflow',
    'invalid input',
    'bad value',
  ];

  if (constraintKeywords.some(keyword =>
    errorMessage.includes(keyword) || errorDetails.includes(keyword)
  )) {
    return true;
  }

  // 409 Conflict errors that aren't resolvable
  if (error?.code === '409' && errorMessage.includes('constraint')) {
    return true;
  }

  // 400 Bad Request errors that indicate data validation issues
  if (error?.code === '400' && (
    errorMessage.includes('overflow') ||
    errorMessage.includes('out of range') ||
    errorDetails.includes('precision') ||
    errorDetails.includes('scale')
  )) {
    return true;
  }

  return false;
}

/**
 * Attempts to fix a record by correcting data issues.
 * Returns the fixed record if fixable, null otherwise.
 */
export function tryFixRecord(tableName: string, record: any, error: any): any | null {
  const errorMessage = (error?.message || '').toLowerCase();
  const errorDetails = (error?.details || '').toLowerCase();

  // Fix foreign key violations by nullifying optional foreign keys
  if (error?.code === '23503' || errorMessage.includes('foreign key')) {
    // For bill_line_items, inventory_item_id is nullable, so we can nullify it
    if (tableName === 'bill_line_items' && record.inventory_item_id) {
      console.warn(`🔧 Attempting to fix ${tableName} record ${record.id} by nullifying inventory_item_id`);
      return {
        ...record,
        inventory_item_id: null,
      };
    }
  }

  // Fix numeric overflow by clamping values to valid ranges
  if (error?.code === '22003' || errorMessage.includes('overflow') || errorDetails.includes('precision')) {
    const fixedRecord = { ...record };
    let wasFixed = false;

    // For numeric(13,2) fields, max value is 9999999999999.99 (supports up to 10^13)
    const maxNumericValue = 10000000000000; // 10 trillion (10^13)
    const numericFields = ['unit_price', 'line_total', 'received_value', 'quantity', 'amount', 'balance'];

    for (const field of numericFields) {
      if (record[field] !== undefined && record[field] !== null) {
        const numValue = Number(record[field]);
        if (!isNaN(numValue) && Math.abs(numValue) > maxNumericValue) {
          const clamped = Math.sign(numValue) * Math.min(Math.abs(numValue), maxNumericValue);
          fixedRecord[field] = Math.round(clamped * 100) / 100; // Round to 2 decimal places
          wasFixed = true;
          console.warn(`🔧 Clamping ${field} from ${numValue} to ${fixedRecord[field]} for ${tableName} record ${record.id}`);
        }
      }
    }

    if (wasFixed) {
      return fixedRecord;
    }
  }

  return null;
}

/**
 * Undoes the effects of a record before deletion (restores inventory, recalculates totals, etc.)
 */
export async function undoRecordEffects(tableName: string, record: any): Promise<void> {
  try {
    if (tableName === 'bill_line_items') {
      // Use the existing removeBillLineItem logic to properly undo effects
      // This will restore inventory, recalculate bill totals, and create audit log
      const systemUserId = '00000000-0000-0000-0000-000000000000'; // System user for auto-deletions
      await getDB().removeBillLineItem(record.id, systemUserId);
      console.log(`🔄 Undone effects for bill_line_item ${record.id}: inventory restored, bill totals recalculated`);
    } else if (tableName === 'transactions') {
      // For transactions, we might need to reverse balance changes
      // This would require more context about which balances were affected
      console.warn(`⚠️ Transaction ${record.id} deleted - manual balance verification may be needed`);
    }
    // Add more undo handlers for other record types as needed
  } catch (undoError) {
    console.error(`❌ Failed to undo effects for ${tableName} record ${record.id}:`, undoError);
    // Continue with deletion even if undo fails
  }
}

/**
 * Deletes a problematic record from IndexedDB and undoes its effects.
 */
export async function deleteProblematicRecord(tableName: string, recordId: string, error: any): Promise<void> {
  try {
    const table = (db as any)[tableName];
    if (!table) {
      console.error(`❌ Table ${tableName} not found in database`);
      return;
    }

    const record = await table.get(recordId);
    if (!record) {
      console.log(`ℹ️ Record ${recordId} not found in local database, may already be deleted`);
      return;
    }

    // Log the error with full details
    console.error(`❌ UNRECOVERABLE ERROR - Deleting ${tableName} record ${recordId}:`, {
      code: error?.code,
      message: error?.message,
      details: error?.details,
      hint: error?.hint,
      record: {
        id: record.id,
        // Include relevant fields for debugging
        ...(tableName === 'bill_line_items' ? {
          bill_id: record.bill_id,
          product_name: record.product_name,
          quantity: record.quantity,
          unit_price: record.unit_price,
          line_total: record.line_total,
        } : {}),
      },
    });

    // Undo any side effects (restore inventory, recalc totals, etc.)
    await undoRecordEffects(tableName, record);

    // Delete the record from IndexedDB
    // For bill_line_items, removeBillLineItem already deleted it, so check first
    const stillExists = await table.get(recordId);
    if (stillExists) {
      await table.delete(recordId);
    }

    // Also remove from pending syncs if it exists
    const allPendingSyncs = await getDB().pending_syncs
      .where('table_name')
      .equals(tableName)
      .toArray();

    const matchingSyncs = allPendingSyncs.filter((sync: any) => sync.record_id === recordId);
    for (const pendingSync of matchingSyncs) {
      await getDB().removePendingSync(pendingSync.id);
    }

    console.warn(`✅ Successfully deleted and undone problematic record ${recordId} from ${tableName}`);
  } catch (deleteError) {
    console.error(`❌ Failed to delete problematic record ${recordId} from ${tableName}:`, deleteError);
  }
}

async function handleFailedBatch(tableName: string, cleanedBatch: any[], originalBatch: any[]) {
  console.log(`🔍 Attempting individual uploads to identify problem records...`);
  for (let i = 0; i < cleanedBatch.length; i++) {
    const record = cleanedBatch[i];
    const original = originalBatch[i];
    try {
      const { error: individualError } = await (supabase as any)
        .from(tableName)
        .upsert([record], { onConflict: 'id' });

      if (individualError) {
        // Check if error is unrecoverable
        if (isUnrecoverableError(individualError, tableName, record)) {
          // Try to fix the record once by nullifying optional foreign keys
          const fixedRecord = tryFixRecord(tableName, record, individualError);

          if (fixedRecord) {
            // Try once more with the fixed record
            const { error: retryError } = await (supabase as any)
              .from(tableName)
              .upsert([fixedRecord], { onConflict: 'id' });

            if (!retryError) {
              // Success! Update local record and mark as synced
              await (db as any)[tableName].update(original.id, {
                ...fixedRecord,
                _synced: true,
                _lastSyncedAt: new Date().toISOString(),
              });
              console.log(`✅ Fixed and synced ${tableName} record ${original.id}`);
              continue;
            }

            // Fix didn't work, delete the record
            await deleteProblematicRecord(tableName, original.id, retryError || individualError);
          } else {
            // Can't fix, delete the record
            await deleteProblematicRecord(tableName, original.id, individualError);
          }
        } else {
          // Recoverable error - add to pending syncs for retry
          console.error(`❌ Individual record failed (will retry):`, record.id, individualError.message);
          await getDB().addPendingSync(tableName, record.id, 'update', record);
        }
      } else {
        await getDB().markAsSynced(tableName, original.id);
      }
    } catch (e) {
      console.error(`❌ Critical error with record:`, record, e);
      // For unexpected errors, check if they're unrecoverable
      if (isUnrecoverableError(e, tableName, record)) {
        await deleteProblematicRecord(tableName, original.id, e);
      } else {
        await getDB().addPendingSync(tableName, record.id, 'update', record);
      }
    }
  }
}

/**
 * Handle cash drawer session conflicts when unique constraint is violated
 * If there's already an open session in Supabase, don't upload the local one
 * Instead, close the local session and let the remote one be downloaded
 */
async function handleCashDrawerSessionConflict(cleanedBatch: any[], originalBatch: any[]): Promise<void> {
  console.log(`🔍 Handling cash_drawer_sessions conflicts individually...`);
  
  for (let i = 0; i < cleanedBatch.length; i++) {
    const record = cleanedBatch[i];
    const original = originalBatch[i];
    
    // Only handle open sessions (closed sessions don't have the constraint)
    if (record.status !== 'open') {
      // Closed sessions can be uploaded normally
      try {
        const { error } = await (supabase as any)
          .from('cash_drawer_sessions')
          .upsert([record], { onConflict: 'id' });
        
        if (!error) {
          await getDB().markAsSynced('cash_drawer_sessions', original.id);
          console.log(`✅ Synced closed session ${original.id.substring(0, 8)}...`);
        } else {
          console.error(`❌ Failed to sync closed session ${original.id}:`, error);
          await getDB().addPendingSync('cash_drawer_sessions', original.id, 'update', record);
        }
      } catch (e) {
        console.error(`❌ Error syncing closed session:`, e);
        await getDB().addPendingSync('cash_drawer_sessions', original.id, 'update', record);
      }
      continue;
    }
    
    try {
      // Check if there's an existing open session in Supabase for this account
      const { data: existingSessions, error: checkError } = await supabase
        .from('cash_drawer_sessions')
        .select('id, opened_at, status')
        .eq('account_id', record.account_id)
        .eq('status', 'open')
        .limit(1);
      
      if (checkError) {
        console.error(`❌ Error checking for existing session:`, checkError);
        await getDB().addPendingSync('cash_drawer_sessions', original.id, 'update', record);
        continue;
      }
      
      const sessionRows = (existingSessions ?? []) as { id: string }[];
      const existingSession = sessionRows.length > 0 ? sessionRows[0] : null;
      
      if (existingSession && existingSession.id !== (record as { id: string }).id) {
        // There's already an open session in Supabase - don't upload the local one
        
        // Close the local session since there's already an open one remotely
        // This prevents the local app from thinking it has an open session
        // Update local session to closed state. Do NOT set _synced: false here —
        // that would fire the triggerSyncOnUpdate hook and schedule an extra sync cycle
        // before markAsSynced sets it back to true, creating unnecessary churn.
        await (db as any).cash_drawer_sessions.update(original.id, {
          status: 'closed',
          closed_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        });

        // Mark as synced to prevent retry
        await getDB().markAsSynced('cash_drawer_sessions', original.id);
        continue;
      }
      
      // No conflict - try to upload the session
      const { error: uploadError } = await (supabase as any)
        .from('cash_drawer_sessions')
        .upsert([record], { onConflict: 'id' });
      
      if (!uploadError) {
        await getDB().markAsSynced('cash_drawer_sessions', original.id);
        console.log(`✅ Synced cash_drawer_session ${original.id.substring(0, 8)}...`);
      } else {
        console.error(`❌ Failed to sync session ${original.id}:`, uploadError);
        await getDB().addPendingSync('cash_drawer_sessions', original.id, 'update', record);
      }
    } catch (e) {
      console.error(`❌ Error handling session conflict:`, e);
      await getDB().addPendingSync('cash_drawer_sessions', original.id, 'update', record);
    }
  }
}

export async function uploadLocalChanges(storeId: string, branchId?: string) {
  const result = { uploaded: 0, errors: [] as string[], uploadedTables: new Set<string>() };

  // Get detailed count for debugging (M6: wrapped in try-catch — debug utilities must not abort sync)
  let detailedCount: { total: number; summary: unknown; byTable: Record<string, { active: number; deleted: number }> } | null = null;
  try {
    const { crudHelperService } = await import('./crudHelperService');
    detailedCount = await crudHelperService.getDetailedUnsyncedCount();
    console.log('🔍 [SYNC-DEBUG] Detailed unsynced count before sync:', detailedCount.summary);
    if (detailedCount.total > 0) {
      const { SyncDebugger } = await import('../utils/syncDebugger');
      await SyncDebugger.printSyncDiscrepancyReport(storeId);
    }
  } catch (debugErr) {
    console.warn('⚠️ [SYNC-DEBUG] Debug pre-flight failed (non-fatal):', debugErr);
  }

  // Caches confirmed-existing remote IDs per table within this sync pass.
  // Prevents duplicate Supabase validation queries (e.g. bills checked for both
  // bill_line_items and bill_audit_logs with the same IDs).
  const parentExistenceCache = new Map<string, Set<string>>();

  for (const tableName of SYNC_TABLES) {
    const tableStart = performance.now();
    try {
      // console.log(`📤 Processing table: ${tableName}`);

      if (!await validateDependencies(tableName, storeId)) {
        console.log(`⏳ Skipping ${tableName} - dependencies not met`);
        continue;
      }

      const table = (db as any)[tableName];
      if (!table) {
        console.error(`❌ [syncUpload] Table '${tableName}' not found in local DB — skipping`);
        continue;
      }
      const activeRecords = await table.filter((record: any) => !record._synced && !record._deleted).toArray();
      const deletedRecords = await table.filter((record: any) => record._deleted && !record._synced).toArray();

      // Special logging for branches
      if (tableName === 'branches' && activeRecords.length > 0) {
        console.log(`📤 [Sync] Found ${activeRecords.length} unsynced branch record(s) to upload`);
        activeRecords.forEach((r: any) => {
          console.log(`   - Branch ${r.id}: name="${r.name}", address="${r.address}", phone="${r.phone}", _synced=${r._synced}`);
        });
      }

      if (activeRecords.length === 0 && deletedRecords.length === 0) {
        continue;
      }

      // Log when stores table has unsynced records
      if (tableName === 'stores' && activeRecords.length > 0) {
        console.log(`📤 [Sync] Found ${activeRecords.length} unsynced store record(s) to upload`);
        activeRecords.forEach((r: any) => {
          console.log(`   - Store ${r.id}: preferred_commission_rate=${r.preferred_commission_rate}, exchange_rate=${r.exchange_rate}, preferred_currency=${r.preferred_currency}`);
        });
      }

      // Debug logging for discrepancy analysis
      const tableDetail = detailedCount?.byTable[tableName];
      if (tableDetail && (activeRecords.length !== tableDetail.active || deletedRecords.length !== tableDetail.deleted)) {
        console.warn(`🔍 [SYNC-DEBUG] Count mismatch for ${tableName}:`, {
          expected: tableDetail,
          found: { active: activeRecords.length, deleted: deletedRecords.length }
        });
      }

      // Process deleted records first if there are any (they don't need dependency validation)
      // This ensures deletions happen even if active records can't be synced due to dependencies
      if (deletedRecords.length > 0) {
        console.log(`  🗑️  Processing ${deletedRecords.length} deleted records for ${tableName}`);
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
              const localBatches = await getDB().inventory_bills
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

      // CRITICAL: For bill_line_items and bill_audit_logs, check if parent bills exist in Supabase.
      // Uses parentExistenceCache so the query fires at most once per sync pass even though
      // both tables share the same bill IDs.
      // NOTE: Only validate activeRecords - deleted records don't need parent bill validation.
      if ((tableName === 'bill_line_items' || tableName === 'bill_audit_logs') && activeRecords.length > 0) {
        const billIds = [...new Set(activeRecords.map((record: any) => record.bill_id))] as string[];

        try {
          // Only query for IDs not already confirmed from a previous iteration.
          const cachedBillIds = parentExistenceCache.get('bills') ?? new Set<string>();
          const unknownBillIds = billIds.filter(id => !cachedBillIds.has(id));

          if (unknownBillIds.length > 0) {
            const { data: billsData, error: billsError } = await supabase
              .from('bills')
              .select('id')
              .in('id', unknownBillIds);

            if (billsError) {
              console.warn(`Failed to validate bill IDs for ${tableName}:`, billsError);
              console.log(`⏳ Skipping ${tableName} active records sync - cannot validate bill dependencies (deleted records will still be processed)`);
              activeRecords.length = 0;
            } else {
              const newlyValid = new Set((billsData ?? []).map((b: any) => b.id));
              const merged = new Set([...cachedBillIds, ...newlyValid]);
              parentExistenceCache.set('bills', merged);
            }
          }

          if (activeRecords.length > 0) {
            const validBillIds = parentExistenceCache.get('bills') ?? new Set<string>();
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
              console.log(`⏳ ${recordsWithMissingBills.length} ${tableName} active records skipped - parent bills not yet synced (will retry next sync)`);
            }

            activeRecords.length = 0;
            activeRecords.push(...recordsWithValidBills);
          }
        } catch (error) {
          console.warn(`Failed to validate bill IDs for ${tableName}:`, error);
          console.log(`⏳ Skipping ${tableName} active records sync - cannot validate bill dependencies (deleted records will still be processed)`);
          activeRecords.length = 0;
        }
      }

      // Validate records
      const validation = await dataValidationService.validateRecords(tableName, activeRecords, storeId);

      // Remove invalid records from sync queue
      for (const invalid of validation.errors) {
        console.warn(`🚫 Removing invalid ${tableName} record: ${invalid.reason}`, invalid.record);
        await getDB().markAsSynced(tableName, invalid.record.id);
      }

      const validRecords = activeRecords.filter((r: any) =>
        !validation.errors.some(e => e.record.id === r.id)
      );

      // Upload in batches
      for (let i = 0; i < validRecords.length; i += SYNC_CONFIG.batchSize) {
        let batch = validRecords.slice(i, i + SYNC_CONFIG.batchSize);
        let cleanedBatch = batch
          .map((record: any) => dataValidationService.cleanRecordForUpload(record, tableName))
          .filter((cleaned: any) => cleaned !== null); // Remove null records (invalid/missing required fields)
        
        // Skip batch if all records were filtered out
        if (cleanedBatch.length === 0) {
          console.warn(`⚠️ Skipping ${tableName} batch - all records were invalid`);
          continue;
        }

        // Preflight: for bill_line_items, nullify inventory_item_id if the referenced item doesn't exist in Supabase.
        // Uses parentExistenceCache to avoid a Supabase round-trip for IDs already confirmed this sync.
        if (tableName === 'bill_line_items') {
          try {
            const inventoryItemIds = [...new Set((cleanedBatch as any[])
              .map(r => r.inventory_item_id)
              .filter((v: string | null) => !!v))] as string[];
            if (inventoryItemIds.length > 0) {
              const cachedInvIds = parentExistenceCache.get('inventory_items') ?? new Set<string>();
              const unknownInvIds = inventoryItemIds.filter(id => !cachedInvIds.has(id));

              if (unknownInvIds.length > 0) {
                const { data: existingItems, error: invErr } = await supabase
                  .from('inventory_items')
                  .select('id')
                  .in('id', unknownInvIds);
                if (!invErr) {
                  const newlyValid = new Set((existingItems || []).map((i: any) => i.id));
                  parentExistenceCache.set('inventory_items', new Set([...cachedInvIds, ...newlyValid]));
                }
              }

              const existingSet = parentExistenceCache.get('inventory_items') ?? new Set<string>();
              cleanedBatch = (cleanedBatch as any[]).map(r => (
                r.inventory_item_id && !existingSet.has(r.inventory_item_id)
                  ? { ...r, inventory_item_id: null }
                  : r
              ));
            }
          } catch (e) {
            console.warn('Preflight check for bill_line_items inventory_item_id failed:', e);
          }
        }

        // Special handling for cash_drawer_accounts: validate store_id matches user's store
        if (tableName === 'cash_drawer_accounts') {
          // Verify all records have valid store_id and branch_id
          const invalidRecords = (cleanedBatch as any[]).filter((r: any) => 
            !r.store_id || !r.branch_id || !r.account_code
          );
          if (invalidRecords.length > 0) {
            console.error(`❌ Found ${invalidRecords.length} cash_drawer_accounts records with missing required fields:`, invalidRecords);
            // Remove invalid records from batch
            cleanedBatch = (cleanedBatch as any[]).filter((r: any) => 
              r.store_id && r.branch_id && r.account_code
            );
            if (cleanedBatch.length === 0) {
              console.warn('⚠️ Skipping cash_drawer_accounts batch - all records were invalid');
              continue;
            }
          }
        }

        // Special handling for cash_drawer_sessions: don't upload open sessions if one already exists in Supabase
        if (tableName === 'cash_drawer_sessions') {
          try {
            const openSessions = (cleanedBatch as any[]).filter(s => s.status === 'open');
            if (openSessions.length > 0) {
              const accountIds = [...new Set(openSessions.map(s => s.account_id))] as string[];
              
              // Check for existing open sessions in Supabase for these accounts
              const { data: existingOpenSessions, error: checkError } = await supabase
                .from('cash_drawer_sessions')
                .select('id, account_id, opened_at')
                .in('account_id', accountIds)
                .eq('status', 'open');
              
              if (!checkError && existingOpenSessions && existingOpenSessions.length > 0) {
                // Don't upload local open sessions if there's already an open session in Supabase
                // Instead, mark them as synced and let the download phase bring in the remote session
                const sessionsList = existingOpenSessions as { id: string; account_id: string }[];
                for (const existingSession of sessionsList) {
                  const conflictingLocalSessions = openSessions.filter(
                    (s: { id: string; account_id: string }) =>
                      s.account_id === existingSession.account_id && s.id !== existingSession.id
                  );
                  
                  for (const conflictingLocalSession of conflictingLocalSessions) {
                    // Remove from batch to prevent upload
                    cleanedBatch = (cleanedBatch as any[]).filter(s => s.id !== conflictingLocalSession.id);
                    batch = batch.filter((r: any) => r.id !== conflictingLocalSession.id);
                    // Close the local session since there's already an open one remotely
                    // This prevents the local app from thinking it has an open session
                    await (db as any).cash_drawer_sessions.update(conflictingLocalSession.id, {
                      status: 'closed',
                      closed_at: new Date().toISOString(),
                      updated_at: new Date().toISOString(),
                      _synced: false
                    });
                    // Mark original as synced to prevent retry
                    await getDB().markAsSynced(tableName, conflictingLocalSession.id);
                  }
                }
              }
            }
          } catch (e) {
            console.warn('Preflight check for cash_drawer_sessions failed:', e);
          }
        }

        // Special logging for branches before upload
        if (tableName === 'branches' && cleanedBatch.length > 0) {
          console.log(`📤 [Sync] Uploading ${cleanedBatch.length} branch record(s) to Supabase:`, 
            cleanedBatch.map((r: any) => ({ id: r.id, name: r.name, address: r.address, phone: r.phone }))
          );
        }

        const { error } = await supabase
          .from(tableName as any)
          .upsert(cleanedBatch, { onConflict: 'id' });

        if (error) {
          console.error(`❌ Upload failed for ${tableName}:`, error);
          if (tableName === 'branches') {
            console.error(`❌ Branch upload error details:`, { 
              errorCode: error.code, 
              errorMessage: error.message, 
              errorDetails: error.details,
              records: cleanedBatch.map((r: any) => ({ id: r.id, name: r.name }))
            });
          }
          result.errors.push(`Upload failed for ${tableName}: ${error.message}`);

          // Special handling for cash_drawer_sessions unique constraint violation
          if (tableName === 'cash_drawer_sessions' && error.code === '23505' && 
              error.message.includes('uniq_open_session_per_account')) {
            console.log('🔄 Handling cash_drawer_sessions unique constraint violation...');
            await handleCashDrawerSessionConflict(cleanedBatch, batch);
          } else {
            // Check if this is an unrecoverable error
            const hasUnrecoverableError = cleanedBatch.some((record: any) =>
              isUnrecoverableError(error, tableName, record)
            );

            // Try individual uploads for constraint/FK errors or batch errors
            if (error.code === '23503' || error.message.includes('foreign key') || hasUnrecoverableError) {
              await handleFailedBatch(tableName, cleanedBatch, batch);
            } else {
              // For other errors, try individual uploads to identify the problematic records
              await handleFailedBatch(tableName, cleanedBatch, batch);
            }
          }
        } else {
          // Mark all records as synced
          for (const record of batch as any[]) {
            await getDB().markAsSynced(tableName, record.id);
          }
          result.uploaded += batch.length;
          result.uploadedTables.add(tableName);
          // Warm the parentExistenceCache so later tables can skip validation queries.
          const cached = parentExistenceCache.get(tableName) ?? new Set<string>();
          for (const record of batch as any[]) {
            if (record.id) cached.add(record.id as string);
          }
          parentExistenceCache.set(tableName, cached);
          console.log(`✅ [Sync] Successfully uploaded ${batch.length} ${tableName} records to Supabase`);
          
          // Special logging for branches
          if (tableName === 'branches' && batch.length > 0) {
            console.log(`✅ [Sync] Branch upload success details:`, 
              batch.map((r: any) => ({ id: r.id, name: r.name, address: r.address, phone: r.phone }))
            );
          }
          
          // 🎯 EMIT EVENTS: After successful upload to Supabase
          // This ensures the record exists when other devices receive the event
          if (tableName === 'bills') {
            await Promise.allSettled((batch as any[]).map(async (record) => {
              try {
                await eventEmissionService.emitSalePosted(
                  record.store_id,
                  record.branch_id,
                  record.id,
                  record.created_by,
                  {
                    total: record.total_amount || 0,
                    line_items_count: 0
                  }
                );
                console.log(`🎯 [Event] Emitted sale_posted event for bill ${record.id}`);
              } catch (eventError) {
                console.error('[Event] Failed to emit sale_posted event:', eventError);
              }
            }));
          } else if (tableName === 'transactions') {
            // Emit events for transactions (affects cash drawer balance).
            // Each record may emit up to two RPCs (payment + cash drawer); per-record
            // work stays sequential so the cash-drawer event is only attempted if the
            // payment event succeeded.
            await Promise.allSettled((batch as any[]).map(async (record) => {
              try {
                if (record.is_reversal) {
                  await eventEmissionService.emitTransactionReversed(
                    record.store_id,
                    record.branch_id,
                    record.id,
                    record.created_by,
                    { reason: 'reversal' }
                  );
                  console.log(`🎯 [Event] Emitted transaction_reversed event for transaction ${record.id}`);
                } else {
                  await eventEmissionService.emitPaymentPosted(
                    record.store_id,
                    record.branch_id,
                    record.id,
                    record.created_by,
                    {
                      amount: record.amount || 0,
                      currency: record.currency || 'USD',
                      method: record.payment_method || 'cash'
                    }
                  );
                  console.log(`🎯 [Event] Emitted payment_posted event for transaction ${record.id}`);
                  const cat = record.category as string | undefined;
                  const cashDrawerAffecting =
                    (typeof cat === 'string' && cat.startsWith('cash_drawer_')) ||
                    ['supplier_payment', 'customer_payment', 'employee_payment'].includes(cat || '');
                  if (cashDrawerAffecting) {
                    await eventEmissionService.emitCashDrawerTransactionPosted(
                      record.store_id,
                      record.branch_id,
                      record.id,
                      cat || '',
                      record.created_by
                    );
                    console.log(`🎯 [Event] Emitted cash_drawer_transaction_posted for transaction ${record.id}`);
                  }
                }
              } catch (eventError) {
                console.error('[Event] Failed to emit transaction event:', eventError);
              }
            }));
          } else if (tableName === 'journal_entries') {
            // Emit events for journal entries (source of truth for cash drawer balance)
            // Group by transaction_id to emit one event per transaction
            const transactionGroups = new Map<string, any[]>();
            for (const record of batch as any[]) {
              const txId = record.transaction_id || 'standalone';
              if (!transactionGroups.has(txId)) {
                transactionGroups.set(txId, []);
              }
              transactionGroups.get(txId)!.push(record);
            }
            
            await Promise.allSettled(Array.from(transactionGroups).map(async ([txId, entries]) => {
              try {
                const firstEntry = entries[0];
                await eventEmissionService.emitJournalEntryCreated(
                  firstEntry.store_id,
                  firstEntry.branch_id,
                  firstEntry.id,
                  firstEntry.created_by,
                  {
                    entries_count: entries.length,
                    transaction_id: txId === 'standalone' ? undefined : txId,
                  }
                );
                console.log(`🎯 [Event] Emitted journal_entry_created event for ${entries.length} entries (transaction ${txId})`);
              } catch (eventError) {
                console.error('[Event] Failed to emit journal_entry_created event:', eventError);
              }
            }));
          } else if (tableName === 'cash_drawer_accounts') {
            await Promise.allSettled((batch as any[]).map(async (record) => {
              try {
                await eventEmissionService.emitEvent({
                  store_id: record.store_id,
                  branch_id: record.branch_id || '',
                  event_type: 'cash_drawer_account_updated',
                  entity_type: 'cash_drawer_account',
                  entity_id: record.id,
                  operation: 'update',
                  user_id: record.updated_by || null,
                  metadata: {
                    current_balance: record.current_balance || 0
                  }
                });
                console.log(`🎯 [Event] Emitted cash_drawer_account_updated event for account ${record.id}`);
              } catch (eventError) {
                console.error('[Event] Failed to emit cash_drawer_account_updated event:', eventError);
              }
            }));
          } else if (tableName === 'inventory_items') {
            await Promise.allSettled((batch as any[]).map(async (record) => {
              try {
                await eventEmissionService.emitEvent({
                  store_id: record.store_id,
                  branch_id: record.branch_id || '',
                  event_type: 'inventory_item_updated',
                  entity_type: 'inventory_item',
                  entity_id: record.id,
                  operation: 'update',
                  user_id: record.updated_by || null,
                  metadata: {
                    quantity: record.quantity || 0,
                    received_quantity: record.received_quantity || 0
                  }
                });
                console.log(`🎯 [Event] Emitted inventory_item_updated event for item ${record.id}`);
              } catch (eventError) {
                console.error('[Event] Failed to emit inventory_item_updated event:', eventError);
              }
            }));
          } else if (tableName === 'inventory_bills') {
            await Promise.allSettled((batch as any[]).map(async (record) => {
              try {
                await eventEmissionService.emitInventoryReceived(
                  record.store_id,
                  record.branch_id,
                  record.id,
                  record.created_by,
                  {
                    items_count: 0,
                    total_value: 0
                  }
                );
                console.log(`🎯 [Event] Emitted inventory_received event for bill ${record.id}`);
              } catch (eventError) {
                console.error('[Event] Failed to emit inventory_received event:', eventError);
              }
            }));
          } else if (tableName === 'entities') {
            // Emit events for entity updates (customer/supplier balance changes).
            // Batches of 2+ collapse into a single bulk event to avoid RPC storms;
            // single-record batches keep the per-entity event so existing consumers
            // (which may look for customer_updated vs supplier_updated) still match.
            const batchRecords = batch as any[];
            if (batchRecords.length > 1) {
              try {
                const anchor = batchRecords[0];
                const entityIds = batchRecords.map(r => r.id);
                await eventEmissionService.emitEntitiesBulkUpdated(
                  anchor.store_id,
                  branchId || '',
                  entityIds,
                  anchor.updated_by || undefined,
                  {
                    operation: 'update',
                    operation_type: 'bulk_edit',
                    count: entityIds.length,
                  }
                );
                console.log(`🎯 [Event] Emitted entities_bulk_updated for ${entityIds.length} entities`);
              } catch (eventError) {
                console.error('[Event] Failed to emit entities_bulk_updated event:', eventError);
              }
            } else {
              for (const record of batchRecords) {
                try {
                  await eventEmissionService.emitEvent({
                    store_id: record.store_id,
                    branch_id: branchId || '',
                    event_type: record.entity_type === 'customer' ? 'customer_updated' : 'supplier_updated',
                    entity_type: 'entity',
                    entity_id: record.id,
                    operation: 'update',
                    user_id: record.updated_by || null,
                    metadata: {
                      name: record.name,
                      entity_type: record.entity_type
                    }
                  });
                  console.log(`🎯 [Event] Emitted ${record.entity_type}_updated event for ${record.id}`);
                } catch (eventError) {
                  console.error(`[Event] Failed to emit ${record.entity_type}_updated event:`, eventError);
                }
              }
            }
          } else if (tableName === 'stores') {
            await Promise.allSettled((batch as any[]).map(async (record) => {
              try {
                if (!branchId || branchId === '') {
                  console.warn(`⚠️ [Event] Cannot emit store_updated event: branchId is missing or empty. Store: ${record.id}`);
                  return;
                }
                console.log(`🎯 [Event] Emitting store_updated event for store ${record.id}, branch ${branchId}`);
                await eventEmissionService.emitEvent({
                  store_id: record.id,
                  branch_id: branchId,
                  event_type: 'store_updated',
                  entity_type: 'store',
                  entity_id: record.id,
                  operation: 'update',
                  user_id: record.updated_by || null,
                  metadata: {
                    name: record.name,
                    exchange_rate: record.exchange_rate,
                    preferred_currency: record.preferred_currency,
                    preferred_language: record.preferred_language,
                    preferred_commission_rate: record.preferred_commission_rate
                  }
                });
                console.log(`✅ [Event] Successfully emitted store_updated event for store ${record.id}`);
              } catch (eventError) {
                console.error(`❌ [Event] Failed to emit store_updated event for store ${record.id}:`, eventError);
                if (eventError instanceof Error) {
                  console.error('   Error message:', eventError.message);
                  console.error('   Error stack:', eventError.stack);
                }
              }
            }));
          } else if (tableName === 'branches') {
            await Promise.allSettled((batch as any[]).map(async (record) => {
              try {
                await eventEmissionService.emitEvent({
                  store_id: record.store_id,
                  branch_id: record.id,
                  event_type: 'branch_updated',
                  entity_type: 'branch',
                  entity_id: record.id,
                  operation: 'update',
                  user_id: record.updated_by || null,
                  metadata: {
                    name: record.name,
                    location: record.location
                  }
                });
                console.log(`🎯 [Event] Emitted branch_updated event for branch ${record.id}`);
              } catch (eventError) {
                console.error('[Event] Failed to emit branch_updated event:', eventError);
              }
            }));
          } else if (tableName === 'users') {
            // Emit events for user updates — collapse to bulk event for batches of 2+.
            const batchRecords = batch as any[];
            if (batchRecords.length > 1) {
              try {
                const anchor = batchRecords[0];
                const userIds = batchRecords.map(r => r.id);
                await eventEmissionService.emitUsersBulkUpdated(
                  anchor.store_id,
                  branchId || '',
                  userIds,
                  anchor.updated_by || anchor.id || undefined,
                  {
                    operation: 'update',
                    operation_type: 'bulk_edit',
                    count: userIds.length,
                  }
                );
                console.log(`🎯 [Event] Emitted users_bulk_updated for ${userIds.length} users`);
              } catch (eventError) {
                console.error('[Event] Failed to emit users_bulk_updated event:', eventError);
              }
            } else {
              for (const record of batchRecords) {
                try {
                  await eventEmissionService.emitEvent({
                    store_id: record.store_id,
                    branch_id: branchId || '',
                    event_type: 'user_updated',
                    entity_type: 'user',
                    entity_id: record.id,
                    operation: 'update',
                    user_id: record.updated_by || record.id,
                    metadata: {
                      name: record.name,
                      role: record.role
                    }
                  });
                  console.log(`🎯 [Event] Emitted user_updated event for user ${record.id}`);
                } catch (eventError) {
                  console.error('[Event] Failed to emit user_updated event:', eventError);
                }
              }
            }
          } else if (tableName === 'products') {
            // Emit events for product updates — collapse to bulk event for batches of 2+.
            const batchRecords = batch as any[];
            if (batchRecords.length > 1) {
              try {
                const anchor = batchRecords[0];
                const productIds = batchRecords.map(r => r.id);
                await eventEmissionService.emitProductsBulkUpdated(
                  anchor.store_id,
                  branchId || '',
                  productIds,
                  anchor.updated_by || undefined,
                  {
                    operation: 'update',
                    operation_type: 'bulk_edit',
                    count: productIds.length,
                  }
                );
                console.log(`🎯 [Event] Emitted products_bulk_updated for ${productIds.length} products`);
              } catch (eventError) {
                console.error('[Event] Failed to emit products_bulk_updated event:', eventError);
              }
            } else {
              for (const record of batchRecords) {
                try {
                  await eventEmissionService.emitEvent({
                    store_id: record.store_id,
                    branch_id: branchId || '',
                    event_type: 'product_updated',
                    entity_type: 'product',
                    entity_id: record.id,
                    operation: 'update',
                    user_id: record.updated_by || null,
                    metadata: {
                      name: record.name,
                      barcode: record.barcode,
                      category: record.category
                    }
                  });
                  console.log(`🎯 [Event] Emitted product_updated event for product ${record.id}`);
                } catch (eventError) {
                  console.error('[Event] Failed to emit product_updated event:', eventError);
                }
              }
            }
          } else if (tableName === 'chart_of_accounts') {
            await Promise.allSettled((batch as any[]).map(async (record) => {
              try {
                await eventEmissionService.emitEvent({
                  store_id: record.store_id,
                  branch_id: branchId || '',
                  event_type: 'chart_of_account_updated',
                  entity_type: 'chart_of_account',
                  entity_id: record.id,
                  operation: 'update',
                  user_id: record.updated_by || null,
                  metadata: {
                    account_code: record.account_code,
                    account_name: record.account_name
                  }
                });
                console.log(`🎯 [Event] Emitted chart_of_account_updated event for ${record.account_code}`);
              } catch (eventError) {
                console.error('[Event] Failed to emit chart_of_account_updated event:', eventError);
              }
            }));
          } else if (tableName === 'role_permissions') {
            await Promise.allSettled((batch as any[]).map(async (record) => {
              try {
                await eventEmissionService.emitEvent({
                  store_id: record.store_id,
                  branch_id: branchId || '',
                  event_type: 'role_permission_updated',
                  entity_type: 'role_permissions',
                  entity_id: record.id,
                  operation: 'update',
                  user_id: record.updated_by || null,
                  metadata: {
                    role: record.role,
                    operation: record.operation,
                    allowed: record.allowed
                  }
                });
                console.log(`🎯 [Event] Emitted role_permission_updated event for ${record.id}`);
              } catch (eventError) {
                console.error('[Event] Failed to emit role_permission_updated event:', eventError);
              }
            }));
          } else if (tableName === 'user_permissions') {
            await Promise.allSettled((batch as any[]).map(async (record) => {
              try {
                await eventEmissionService.emitEvent({
                  store_id: record.store_id,
                  branch_id: branchId || '',
                  event_type: 'user_permission_updated',
                  entity_type: 'user_permissions',
                  entity_id: record.id,
                  operation: 'update',
                  user_id: record.updated_by || null,
                  metadata: {
                    user_id: record.user_id,
                    operation: record.operation,
                    allowed: record.allowed
                  }
                });
                console.log(`🎯 [Event] Emitted user_permission_updated event for ${record.id}`);
              } catch (eventError) {
                console.error('[Event] Failed to emit user_permission_updated event:', eventError);
              }
            }));
          } else if (tableName === 'cash_drawer_sessions') {
            await Promise.allSettled((batch as any[]).map(async (record) => {
              try {
                const eventType = record.status === 'open'
                  ? 'cash_drawer_session_opened'
                  : 'cash_drawer_session_closed';
                const operation = record.status === 'open' ? 'insert' : 'update';
                await eventEmissionService.emitEvent({
                  store_id: record.store_id,
                  branch_id: record.branch_id || branchId || '',
                  event_type: eventType,
                  entity_type: 'cash_drawer_session',
                  entity_id: record.id,
                  operation,
                  user_id: record.opened_by || record.closed_by || null,
                  metadata: {
                    status: record.status,
                    opening_balance: record.opening_balance,
                    closing_balance: record.closing_balance
                  }
                });
                console.log(`🎯 [Event] Emitted ${eventType} event for session ${record.id}`);
              } catch (eventError) {
                console.error('[Event] Failed to emit cash_drawer_session event:', eventError);
              }
            }));
          } else if (tableName === 'reminders') {
            await Promise.allSettled((batch as any[]).map(async (record) => {
              try {
                await eventEmissionService.emitEvent({
                  store_id: record.store_id,
                  branch_id: record.branch_id || branchId || '',
                  event_type: 'reminder_updated',
                  entity_type: 'reminder',
                  entity_id: record.id,
                  operation: record._deleted ? 'reverse' : 'update',
                  user_id: record.created_by || null,
                  metadata: {
                    type: record.type,
                    status: record.status,
                    due_date: record.due_date
                  }
                });
                console.log(`🎯 [Event] Emitted reminder_updated event for reminder ${record.id}`);
              } catch (eventError) {
                console.error('[Event] Failed to emit reminder_updated event:', eventError);
              }
            }));
          }
        }
      }

      await getDB().updateSyncMetadata(tableName, new Date().toISOString());

      const tableTime = performance.now() - tableStart;
      console.log(`  ⏱️  ${tableName} upload: ${tableTime.toFixed(2)}ms`);

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
              const { error: updateError } = await (supabase as any)
                .from('bill_line_items')
                .update({ inventory_item_id: null })
                .eq('inventory_item_id', record.id);

              if (updateError) {
                result.errors.push(`Failed to clear references for inventory item ${record.id}: ${updateError.message}`);
                continue;
              }
            }

            // Delete missed_products references before deletion (FK constraint + NOT NULL constraint)
            try {
              const { error: deleteMissedError } = await supabase
                .from('missed_products')
                .delete()
                .eq('inventory_item_id', record.id);

              if (deleteMissedError) {
                result.errors.push(`Failed to delete missed_products references: ${deleteMissedError.message}`);
                console.warn('Failed to delete missed_products:', deleteMissedError);
              }
            } catch (missedProductsError) {
              // Table might not exist in some schemas - ignore
              console.warn('missed_products table not accessible:', missedProductsError);
            }
          }

          const { error } = await supabase
            .from(tableName as any)
            .delete()
            .eq('id', record.id);

          if (error) {
            console.error(`❌ Delete failed for ${tableName}/${record.id}:`, error);
            result.errors.push(`Delete failed for ${tableName}/${record.id}: ${error.message}`);
          } else {
            // Mark as synced and delete from local database
            await getDB().markAsSynced(tableName, record.id);
            await table.delete(record.id);
            result.uploaded++;
            result.uploadedTables.add(tableName);
            console.log(`✅ Successfully deleted ${tableName} record ${record.id.substring(0, 8)}...`);
          }
        } catch (error) {
          console.error(`❌ Delete error for ${tableName}/${record.id}:`, error);
          result.errors.push(`Delete error for ${tableName}/${record.id}: ${error}`);
        }
      }

      if (deletedRecords.length > 0) {
        const deleteTime = performance.now() - tableStart;
        console.log(`  🗑️  ${tableName} deletions processed: ${deleteTime.toFixed(2)}ms`);
      }

    } catch (error) {
      const tableTime = performance.now() - tableStart;
      console.error(`  ⏱️  ${tableName} upload failed after ${tableTime.toFixed(2)}ms:`, error);
      result.errors.push(`Table ${tableName} upload error: ${error}`);
    }
  }

  return result;
}
