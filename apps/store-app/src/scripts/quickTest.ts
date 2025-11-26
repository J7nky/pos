// Quick Test Script - Verify Key Functionality
// Run this in browser console to quickly test our implementation

/**
 * Quick test of account mapping functionality
 */
export async function testAccountMapping(): Promise<void> {
  console.log('🧪 Testing Account Mapping...');
  
  try {
    const { getAccountMapping, getEntityIdForTransaction } = await import('../utils/accountMapping');
    const { TRANSACTION_CATEGORIES } = await import('../constants/transactionCategories');
    
    // Test customer payment mapping
    const customerPaymentMapping = getAccountMapping(TRANSACTION_CATEGORIES.CUSTOMER_PAYMENT);
    console.log('Customer Payment Mapping:', customerPaymentMapping);
    
    if (customerPaymentMapping.debitAccount !== '1100' || customerPaymentMapping.creditAccount !== '1200') {
      throw new Error('Customer payment mapping incorrect');
    }
    
    // Test cash sale mapping
    const cashSaleMapping = getAccountMapping(TRANSACTION_CATEGORIES.CASH_DRAWER_SALE);
    console.log('Cash Sale Mapping:', cashSaleMapping);
    
    if (cashSaleMapping.debitAccount !== '1100' || cashSaleMapping.creditAccount !== '4100') {
      throw new Error('Cash sale mapping incorrect');
    }
    
    // Test entity ID resolution
    const entityId = getEntityIdForTransaction(TRANSACTION_CATEGORIES.CASH_DRAWER_SALE, null);
    console.log('Cash Sale Entity ID:', entityId);
    
    console.log('✅ Account mapping tests passed');
    
  } catch (error) {
    console.error('❌ Account mapping test failed:', error);
    throw error;
  }
}

/**
 * Quick test of service imports
 */
export async function testServiceImports(): Promise<void> {
  console.log('🧪 Testing Service Imports...');
  
  try {
    // Test entity migration service
    const { entityMigrationService } = await import('../services/entityMigrationService');
    console.log('✅ Entity migration service imported');
    
    // Test journal service
    const { journalService } = await import('../services/journalService');
    console.log('✅ Journal service imported');
    
    // Test journal validation service
    const { journalValidationService } = await import('../services/journalValidationService');
    console.log('✅ Journal validation service imported');
    
    // Test snapshot service
    const { snapshotService } = await import('../services/snapshotService');
    console.log('✅ Snapshot service imported');
    
    // Test snapshot scheduler service
    const { snapshotSchedulerService } = await import('../services/snapshotSchedulerService');
    console.log('✅ Snapshot scheduler service imported');
    
    console.log('✅ All service imports successful');
    
  } catch (error) {
    console.error('❌ Service import test failed:', error);
    throw error;
  }
}

/**
 * Quick test of database tables
 */
export async function testDatabaseTables(): Promise<void> {
  console.log('🧪 Testing Database Tables...');
  
  try {
    const { db } = await import('../lib/db');
    
    // Test journal_entries table
    const journalCount = await db.journal_entries.count();
    console.log(`✅ journal_entries table accessible (${journalCount} entries)`);
    
    // Test balance_snapshots table
    const snapshotCount = await db.balance_snapshots.count();
    console.log(`✅ balance_snapshots table accessible (${snapshotCount} snapshots)`);
    
    // Test entities table
    const entityCount = await db.entities.count();
    console.log(`✅ entities table accessible (${entityCount} entities)`);
    
    // Test chart_of_accounts table
    const accountCount = await db.chart_of_accounts.count();
    console.log(`✅ chart_of_accounts table accessible (${accountCount} accounts)`);
    
    console.log('✅ All database tables accessible');
    
  } catch (error) {
    console.error('❌ Database table test failed:', error);
    throw error;
  }
}

/**
 * Run all quick tests
 */
export async function runQuickTests(): Promise<void> {
  console.log('🚀 Running Quick Implementation Tests...');
  console.log('=' .repeat(50));
  
  try {
    await testServiceImports();
    console.log('');
    
    await testDatabaseTables();
    console.log('');
    
    await testAccountMapping();
    console.log('');
    
    console.log('✅ All Quick Tests Passed!');
    console.log('🎉 Implementation appears to be working correctly');
    
  } catch (error) {
    console.error('❌ Quick tests failed:', error);
    throw error;
  }
}

// Export for console use
export const quickTests = {
  runQuickTests,
  testServiceImports,
  testDatabaseTables,
  testAccountMapping
};

// Usage in browser console:
// import { quickTests } from './scripts/quickTest';
// await quickTests.runQuickTests();
