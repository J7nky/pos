// Implementation Verification Script
// Verifies that Phases 2-4 are working correctly before proceeding to Phase 5

import { getDB } from '../lib/db';

/**
 * Comprehensive verification of our accounting foundation implementation
 */
export async function verifyImplementation(): Promise<void> {
  console.log('🔍 Verifying Accounting Foundation Implementation...');
  console.log('=' .repeat(60));
  
  try {
    // Phase 1: Verify database schema
    console.log('1️⃣ Verifying Database Schema (Phase 1)...');
    await verifyDatabaseSchema();
    
    // Phase 2: Verify entity migration service
    console.log('2️⃣ Verifying Entity Migration Service (Phase 2)...');
    await verifyEntityMigrationService();
    
    // Phase 3: Verify journal service
    console.log('3️⃣ Verifying Journal Service (Phase 3)...');
    await verifyJournalService();
    
    // Phase 4: Verify snapshot service
    console.log('4️⃣ Verifying Snapshot Service (Phase 4)...');
    await verifySnapshotService();
    
    // Integration test
    console.log('🔗 Running Integration Test...');
    await runIntegrationTest();
    
    console.log('');
    console.log('✅ All Verification Tests Passed!');
    console.log('🚀 Ready to proceed with Phase 5');
    
  } catch (error) {
    console.error('❌ Verification Failed:', error);
    throw error;
  }
}

/**
 * Verify database schema has all required tables
 */
async function verifyDatabaseSchema(): Promise<void> {
  try {
    // Check if tables exist by trying to access them
    const tableChecks = [
      { name: 'journal_entries', table: getDB().journal_entries },
      { name: 'balance_snapshots', table: getDB().balance_snapshots },
      { name: 'entities', table: getDB().entities },
      { name: 'chart_of_accounts', table: getDB().chart_of_accounts }
    ];
    
    for (const check of tableChecks) {
      try {
        await check.table.count();
        console.log(`   ✅ ${check.name} table exists`);
      } catch (error) {
        throw new Error(`Table ${check.name} not found or not accessible`);
      }
    }
    
    console.log('   ✅ All accounting tables verified');
    
  } catch (error) {
    console.error('   ❌ Database schema verification failed:', error);
    throw error;
  }
}

/**
 * Verify entity migration service can be imported and has required methods
 */
async function verifyEntityMigrationService(): Promise<void> {
  try {
    // Dynamic import to check if service exists and can be loaded
    const { entityMigrationService } = await import('../services/entityMigrationService');
    
    // Check required methods exist
    const requiredMethods = [
      'migrateToEntities',
      'verifyMigration',
      'isMigrationCompleted',
      'getEntityById',
      'getEntitiesByType'
    ];
    
    for (const method of requiredMethods) {
      if (typeof (entityMigrationService as any)[method] !== 'function') {
        throw new Error(`Method ${method} not found in entityMigrationService`);
      }
    }
    
    console.log('   ✅ Entity migration service imported successfully');
    console.log(`   ✅ All ${requiredMethods.length} required methods found`);
    
  } catch (error) {
    console.error('   ❌ Entity migration service verification failed:', error);
    throw error;
  }
}

/**
 * Verify journal service can be imported and has required methods
 */
async function verifyJournalService(): Promise<void> {
  try {
    // Dynamic import to check if service exists and can be loaded
    const { journalService } = await import('../services/journalService');
    
    // Check required methods exist
    const requiredMethods = [
      'createJournalEntry',
      'recordCashSale',
      'recordCustomerPayment',
      'recordSupplierPayment',
      'verifyTransactionBalance',
      'calculateAccountBalance'
    ];
    
    for (const method of requiredMethods) {
      if (typeof (journalService as any)[method] !== 'function') {
        throw new Error(`Method ${method} not found in journalService`);
      }
    }
    
    console.log('   ✅ Journal service imported successfully');
    console.log(`   ✅ All ${requiredMethods.length} required methods found`);
    
    // Verify journal validation service
    const { journalValidationService } = await import('../services/journalValidationService');
    
    const validationMethods = [
      'validateStoreJournalEntries',
      'validateTransactionBalances',
      'findOrphanedEntries'
    ];
    
    for (const method of validationMethods) {
      if (typeof (journalValidationService as any)[method] !== 'function') {
        throw new Error(`Method ${method} not found in journalValidationService`);
      }
    }
    
    console.log('   ✅ Journal validation service imported successfully');
    
  } catch (error) {
    console.error('   ❌ Journal service verification failed:', error);
    throw error;
  }
}

/**
 * Verify snapshot service can be imported and has required methods
 */
async function verifySnapshotService(): Promise<void> {
  try {
    // Dynamic import to check if service exists and can be loaded
    const { snapshotService } = await import('../services/snapshotService');
    
    // Check required methods exist
    const requiredMethods = [
      'createDailySnapshots',
      'getHistoricalBalance',
      'verifySnapshots',
      'getBalanceHistory',
      'getSnapshotStatistics'
    ];
    
    for (const method of requiredMethods) {
      if (typeof (snapshotService as any)[method] !== 'function') {
        throw new Error(`Method ${method} not found in snapshotService`);
      }
    }
    
    console.log('   ✅ Snapshot service imported successfully');
    console.log(`   ✅ All ${requiredMethods.length} required methods found`);
    
    // Verify snapshot scheduler service
    const { snapshotSchedulerService } = await import('../services/snapshotSchedulerService');
    
    const schedulerMethods = [
      'startScheduler',
      'stopScheduler',
      'triggerSnapshotForStore',
      'getSchedulerStatus'
    ];
    
    for (const method of schedulerMethods) {
      if (typeof (snapshotSchedulerService as any)[method] !== 'function') {
        throw new Error(`Method ${method} not found in snapshotSchedulerService`);
      }
    }
    
    console.log('   ✅ Snapshot scheduler service imported successfully');
    
  } catch (error) {
    console.error('   ❌ Snapshot service verification failed:', error);
    throw error;
  }
}

/**
 * Run a simple integration test to verify the services work together
 */
async function runIntegrationTest(): Promise<void> {
  const testStoreId = 'verification-test-store';
  
  try {
    console.log('   🧪 Running integration test...');
    
    // Clean up any existing test data
    await getDB().transaction('rw', [
      getDB().entities,
      getDB().chart_of_accounts,
      getDB().journal_entries,
      getDB().balance_snapshots
    ], async () => {
      await getDB().entities.where('store_id').equals(testStoreId).delete();
      await getDB().chart_of_accounts.where('store_id').equals(testStoreId).delete();
      await getDB().journal_entries.where('store_id').equals(testStoreId).delete();
      await getDB().balance_snapshots.where('store_id').equals(testStoreId).delete();
    });
    
    // Test 1: Create a simple chart of accounts entry
    await getDB().chart_of_accounts.add({
      id: 'test-acc-1100',
      store_id: testStoreId,
      account_code: '1100',
      account_name: 'Cash',
      account_type: 'asset',
      requires_entity: true,
      is_active: true
    } as any);
    
    // Test 2: Create a test entity
    await getDB().entities.add({
      id: 'test-entity-cash',
      store_id: testStoreId,
      branch_id: null,
      entity_type: 'cash',
      entity_code: 'CASH',
      name: 'Cash Customer',
      phone: null,
      lb_balance: 0,
      usd_balance: 0,
      is_system_entity: true,
      is_active: true,
      customer_data: null,
      supplier_data: null,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      _synced: false
    } as any);
    
    // Test 3: Create a journal entry
    const { journalService } = await import('../services/journalService');
    
    await journalService.createJournalEntry({
      transactionId: 'test-txn-001',
      debitAccount: '1100',
      creditAccount: '4100',
      amount: 100,
      currency: 'USD',
      entityId: 'test-entity-cash',
      description: 'Test journal entry'
    });
    
    // Test 4: Verify the journal entry was created
    const journalEntries = await getDB().journal_entries
      .where('transaction_id')
      .equals('test-txn-001')
      .toArray();
    
    if (journalEntries.length !== 2) {
      throw new Error(`Expected 2 journal entries, got ${journalEntries.length}`);
    }
    
    // Test 5: Verify double-entry balance
    const { journalValidationService } = await import('../services/journalValidationService');
    const validation = await journalValidationService.validateStoreJournalEntries(testStoreId);
    
    if (!validation.isValid) {
      throw new Error(`Journal validation failed: ${validation.errors.join(', ')}`);
    }
    
    // Test 6: Create a snapshot
    const { snapshotService } = await import('../services/snapshotService');
    const snapshotResult = await snapshotService.createDailySnapshots(testStoreId);
    
    if (!snapshotResult.success) {
      throw new Error(`Snapshot creation failed: ${snapshotResult.errors.join(', ')}`);
    }
    
    // Test 7: Query historical balance
    const historicalBalance = await snapshotService.getHistoricalBalance(
      testStoreId,
      '1100',
      'test-entity-cash',
      new Date().toISOString().split('T')[0]
    );
    
    if (Math.abs(historicalBalance.balanceUSD - 100) > 0.01) {
      throw new Error(`Expected balance 100, got ${historicalBalance.balanceUSD}`);
    }
    
    // Clean up test data
    await getDB().transaction('rw', [
      getDB().entities,
      getDB().chart_of_accounts,
      getDB().journal_entries,
      getDB().balance_snapshots
    ], async () => {
      await getDB().entities.where('store_id').equals(testStoreId).delete();
      await getDB().chart_of_accounts.where('store_id').equals(testStoreId).delete();
      await getDB().journal_entries.where('store_id').equals(testStoreId).delete();
      await getDB().balance_snapshots.where('store_id').equals(testStoreId).delete();
    });
    
    console.log('   ✅ Integration test passed');
    console.log('   ✅ Journal entries created correctly');
    console.log('   ✅ Double-entry validation passed');
    console.log('   ✅ Snapshots created successfully');
    console.log('   ✅ Historical queries working');
    
  } catch (error) {
    console.error('   ❌ Integration test failed:', error);
    
    // Clean up on failure
    try {
      await getDB().transaction('rw', [
        getDB().entities,
        getDB().chart_of_accounts,
        getDB().journal_entries,
        getDB().balance_snapshots
      ], async () => {
        await getDB().entities.where('store_id').equals(testStoreId).delete();
        await getDB().chart_of_accounts.where('store_id').equals(testStoreId).delete();
        await getDB().journal_entries.where('store_id').equals(testStoreId).delete();
        await getDB().balance_snapshots.where('store_id').equals(testStoreId).delete();
      });
    } catch (cleanupError) {
      console.error('Failed to clean up test data:', cleanupError);
    }
    
    throw error;
  }
}

// Export for use in console or other scripts
export const verificationScript = {
  verifyImplementation
};

// Usage in browser console:
// import { verificationScript } from './scripts/verifyImplementation';
// await verificationScript.verifyImplementation();
