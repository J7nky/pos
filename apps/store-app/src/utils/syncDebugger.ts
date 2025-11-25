/**
 * Sync Debugging Utility
 * 
 * This utility helps identify discrepancies between unsynced record counts
 * and actual records processed during sync.
 */

import { db } from '../lib/db';

export interface SyncDiscrepancy {
  tableName: string;
  countedRecords: number;
  syncableRecords: number;
  deletedRecords: number;
  skippedRecords: Array<{
    id: string;
    reason: string;
    record: any;
  }>;
}

export class SyncDebugger {
  /**
   * Analyze sync discrepancies for all tables
   */
  static async analyzeSyncDiscrepancies(storeId: string): Promise<SyncDiscrepancy[]> {
    const SYNC_TABLES = [
      'stores', 'products', 'suppliers', 'customers', 'users',
      'cash_drawer_accounts', 'inventory_bills', 'inventory_items', 
      'transactions', 'bills', 'bill_line_items', 'bill_audit_logs', 
      'cash_drawer_sessions', 'missed_products', 'reminders'
    ];

    const discrepancies: SyncDiscrepancy[] = [];

    for (const tableName of SYNC_TABLES) {
      try {
        const table = (db as any)[tableName];
        if (!table) continue;

        // Get all unsynced records (matching count logic)
        const allUnsyncedRecords = await table.filter((item: any) => !item._synced).toArray();
        
        // Get records that would be processed by sync (matching sync logic)
        const activeRecords = await table.filter((record: any) => !record._synced && !record._deleted).toArray();
        const deletedRecords = await table.filter((record: any) => record._deleted && !record._synced).toArray();
        
        const syncableRecords = activeRecords.length + deletedRecords.length;
        
        if (allUnsyncedRecords.length !== syncableRecords) {
          // Find the skipped records
          const syncableIds = new Set([
            ...activeRecords.map(r => r.id),
            ...deletedRecords.map(r => r.id)
          ]);
          
          const skippedRecords = allUnsyncedRecords
            .filter(record => !syncableIds.has(record.id))
            .map(record => ({
              id: record.id,
              reason: this.determineSkipReason(record),
              record: {
                id: record.id,
                _synced: record._synced,
                _deleted: record._deleted,
                created_at: record.created_at,
                updated_at: record.updated_at
              }
            }));

          discrepancies.push({
            tableName,
            countedRecords: allUnsyncedRecords.length,
            syncableRecords,
            deletedRecords: deletedRecords.length,
            skippedRecords
          });
        }
      } catch (error) {
        console.warn(`Failed to analyze ${tableName}:`, error);
      }
    }

    return discrepancies;
  }

  /**
   * Determine why a record is being skipped
   */
  private static determineSkipReason(record: any): string {
    if (record._synced) return 'Already synced';
    if (record._deleted === true) return 'Deleted record (processed separately)';
    if (record._deleted === false) return 'Active record (should be processed)';
    if (record._deleted === undefined || record._deleted === null) {
      return 'Missing _deleted field (treated as active)';
    }
    return `Unknown _deleted value: ${record._deleted}`;
  }

  /**
   * Print a detailed report of sync discrepancies
   */
  static async printSyncDiscrepancyReport(storeId: string): Promise<void> {
    console.log('🔍 [SYNC-DEBUG] Starting sync discrepancy analysis...');
    
    const discrepancies = await this.analyzeSyncDiscrepancies(storeId);
    
    if (discrepancies.length === 0) {
      console.log('✅ [SYNC-DEBUG] No discrepancies found - counts match sync logic');
      return;
    }

    console.log(`🚨 [SYNC-DEBUG] Found ${discrepancies.length} tables with discrepancies:`);
    
    for (const discrepancy of discrepancies) {
      console.log(`\n📊 [SYNC-DEBUG] Table: ${discrepancy.tableName}`);
      console.log(`   Counted: ${discrepancy.countedRecords} records`);
      console.log(`   Syncable: ${discrepancy.syncableRecords} records (${discrepancy.syncableRecords - discrepancy.deletedRecords} active + ${discrepancy.deletedRecords} deleted)`);
      console.log(`   Skipped: ${discrepancy.skippedRecords.length} records`);
      
      if (discrepancy.skippedRecords.length > 0) {
        console.log(`   Skipped records:`);
        for (const skipped of discrepancy.skippedRecords) {
          console.log(`     - ${skipped.id}: ${skipped.reason}`);
        }
      }
    }
    
    console.log('\n🔍 [SYNC-DEBUG] Analysis complete');
  }

  /**
   * Quick check for current sync status
   */
  static async quickSyncCheck(storeId: string): Promise<{
    totalCounted: number;
    totalSyncable: number;
    discrepancyCount: number;
  }> {
    const discrepancies = await this.analyzeSyncDiscrepancies(storeId);
    
    const totalCounted = discrepancies.reduce((sum, d) => sum + d.countedRecords, 0);
    const totalSyncable = discrepancies.reduce((sum, d) => sum + d.syncableRecords, 0);
    
    return {
      totalCounted,
      totalSyncable,
      discrepancyCount: discrepancies.length
    };
  }
}

// Export for console debugging
(window as any).syncDebugger = SyncDebugger;
