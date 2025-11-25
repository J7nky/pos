/**
 * Transaction ID Migration Utility
 * 
 * Fixes transactions with old custom ID format (txn-*) to proper UUIDs
 * to resolve Supabase sync errors.
 */

import { db } from '../lib/db';

export interface MigrationResult {
  success: boolean;
  migratedCount: number;
  errors: string[];
  details: Array<{
    oldId: string;
    newId: string;
    status: 'success' | 'error';
    error?: string;
  }>;
}

export class TransactionIdMigration {
  /**
   * Migrate transactions with old ID format to proper UUIDs
   */
  static async migrateTransactionIds(storeId: string): Promise<MigrationResult> {
    const result: MigrationResult = {
      success: true,
      migratedCount: 0,
      errors: [],
      details: []
    };

    try {
      console.log('🔄 [MIGRATION] Starting transaction ID migration...');

      // Find all transactions with old ID format (starts with 'txn-')
      const oldFormatTransactions = await db.transactions
        .filter((txn: any) => 
          txn.store_id === storeId && 
          txn.id && 
          typeof txn.id === 'string' && 
          txn.id.startsWith('txn-')
        )
        .toArray();

      if (oldFormatTransactions.length === 0) {
        console.log('✅ [MIGRATION] No transactions with old ID format found');
        return result;
      }

      console.log(`🔍 [MIGRATION] Found ${oldFormatTransactions.length} transactions with old ID format`);

      // Process each transaction
      for (const transaction of oldFormatTransactions) {
        const oldId = transaction.id;
        const newId = crypto.randomUUID();

        try {
          // Create new transaction with UUID
          const updatedTransaction = {
            ...transaction,
            id: newId,
            _synced: false, // Mark as unsynced so it gets uploaded with new ID
            updated_at: new Date().toISOString()
          };

          // Use transaction to ensure atomicity
          await db.transaction('rw', [db.transactions], async () => {
            // Add new transaction with UUID
            await db.transactions.add(updatedTransaction);
            
            // Delete old transaction
            await db.transactions.delete(oldId);
          });

          result.details.push({
            oldId,
            newId,
            status: 'success'
          });
          result.migratedCount++;

          console.log(`✅ [MIGRATION] Migrated transaction ${oldId} → ${newId}`);

        } catch (error) {
          const errorMsg = error instanceof Error ? error.message : 'Unknown error';
          result.errors.push(`Failed to migrate transaction ${oldId}: ${errorMsg}`);
          result.details.push({
            oldId,
            newId,
            status: 'error',
            error: errorMsg
          });
          console.error(`❌ [MIGRATION] Failed to migrate transaction ${oldId}:`, error);
        }
      }

      if (result.errors.length > 0) {
        result.success = false;
        console.warn(`⚠️ [MIGRATION] Migration completed with ${result.errors.length} errors`);
      } else {
        console.log(`✅ [MIGRATION] Successfully migrated ${result.migratedCount} transactions`);
      }

    } catch (error) {
      result.success = false;
      const errorMsg = error instanceof Error ? error.message : 'Unknown error';
      result.errors.push(`Migration failed: ${errorMsg}`);
      console.error('❌ [MIGRATION] Transaction ID migration failed:', error);
    }

    return result;
  }

  /**
   * Check if there are any transactions with old ID format
   */
  static async hasOldFormatTransactions(storeId: string): Promise<boolean> {
    try {
      const count = await db.transactions
        .filter((txn: any) => 
          txn.store_id === storeId && 
          txn.id && 
          typeof txn.id === 'string' && 
          txn.id.startsWith('txn-')
        )
        .count();
      
      return count > 0;
    } catch (error) {
      console.error('Error checking for old format transactions:', error);
      return false;
    }
  }

  /**
   * Get count of transactions with old ID format
   */
  static async getOldFormatTransactionCount(storeId: string): Promise<number> {
    try {
      return await db.transactions
        .filter((txn: any) => 
          txn.store_id === storeId && 
          txn.id && 
          typeof txn.id === 'string' && 
          txn.id.startsWith('txn-')
        )
        .count();
    } catch (error) {
      console.error('Error counting old format transactions:', error);
      return 0;
    }
  }
}

// Export for console debugging
(window as any).transactionIdMigration = TransactionIdMigration;

// Add console helper for manual migration
(window as any).migrateTransactionIds = async (storeId: string) => {
  console.log('🔄 Starting manual transaction ID migration...');
  const result = await TransactionIdMigration.migrateTransactionIds(storeId);
  console.log('Migration result:', result);
  return result;
};
