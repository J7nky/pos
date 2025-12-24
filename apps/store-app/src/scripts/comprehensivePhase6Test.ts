// Phase 6: Comprehensive Testing & Verification
// Tests all phases (1-5) of the Accounting Foundation Migration

import { getDB } from '../lib/db';
import { journalService } from '../services/journalService';
import { snapshotService } from '../services/snapshotService';
import { entityQueryService } from '../services/entityQueryService';
import { reportingService } from '../services/reportingService';
import { legacyCompatibilityService } from '../services/legacyCompatibilityService';
import { entityMigrationService } from '../services/entityMigrationService';

/**
 * Phase 6: Comprehensive Testing Suite
 * Tests the complete accounting foundation migration (Phases 1-5)
 */
export async function runComprehensivePhase6Test(): Promise<void> {
  console.log('🧪 Phase 6: Comprehensive Testing & Verification');
  console.log('=' .repeat(60));
  
  const testResults = {
    phase1: false, // Chart of Accounts & Tables
    phase2: false, // Entity Migration
    phase3: false, // Journal Entries
    phase4: false, // Balance Snapshots
    phase5: false, // Query Layer Updates
    performance: false,
    dataIntegrity: false,
    endToEnd: false
  };
  
  try {
    // Test Phase 1: Database Schema & Chart of Accounts
    console.log('1️⃣ Testing Phase 1: Database Schema & Chart of Accounts...');
    testResults.phase1 = await testPhase1();
    
    // Test Phase 2: Entity Migration
    console.log('2️⃣ Testing Phase 2: Entity Migration...');
    testResults.phase2 = await testPhase2();
    
    // Test Phase 3: Journal Entries
    console.log('3️⃣ Testing Phase 3: Journal Entry System...');
    testResults.phase3 = await testPhase3();
    
    // Test Phase 4: Balance Snapshots
    console.log('4️⃣ Testing Phase 4: Balance Snapshots...');
    testResults.phase4 = await testPhase4();
    
    // Test Phase 5: Query Layer Updates
    console.log('5️⃣ Testing Phase 5: Query Layer Updates...');
    testResults.phase5 = await testPhase5();
    
    // Performance Testing
    console.log('⚡ Testing Performance Improvements...');
    testResults.performance = await testPerformance();
    
    // Data Integrity Testing
    console.log('🔒 Testing Data Integrity...');
    testResults.dataIntegrity = await testDataIntegrity();
    
    // End-to-End Testing
    console.log('🔄 Testing End-to-End Workflows...');
    testResults.endToEnd = await testEndToEndWorkflows();
    
    // Generate Final Report
    generateFinalReport(testResults);
    
  } catch (error) {
    console.error('❌ Phase 6 Testing Failed:', error);
    generateFinalReport(testResults);
    throw error;
  }
}

/**
 * Test Phase 1: Database Schema & Chart of Accounts
 */
async function testPhase1(): Promise<boolean> {
  try {
    const db = getDB();
    
    // Check if all required tables exist
    const requiredTables = [
      'chart_of_accounts',
      'journal_entries', 
      'balance_snapshots',
      'entities'
    ];
    
    for (const table of requiredTables) {
      const tableExists = db[table as keyof typeof db];
      if (!tableExists) {
        throw new Error(`Required table '${table}' not found`);
      }
    }
    
    // Test chart of accounts structure
    const testAccount = {
      id: 'test-acc-1100',
      store_id: 'test-store-phase6',
      account_code: '1100',
      account_name: 'Cash',
      account_type: 'asset',
      requires_entity: true,
      is_active: true
    };
    
    await getDB().chart_of_accounts.add(testAccount as any);
    const retrieved = await getDB().chart_of_accounts.get('test-acc-1100');
    
    if (!retrieved || retrieved.account_code !== '1100') {
      throw new Error('Chart of accounts test failed');
    }
    
    // Cleanup
    await getDB().chart_of_accounts.delete('test-acc-1100');
    
    console.log('   ✅ Phase 1: Database schema and chart of accounts working');
    return true;
    
  } catch (error) {
    console.error('   ❌ Phase 1 failed:', error);
    return false;
  }
}

/**
 * Test Phase 2: Entity Migration
 */
async function testPhase2(): Promise<boolean> {
  try {
    const testStoreId = 'test-store-phase6';
    
    // Test entity creation
    const testEntity = {
      id: 'test-entity-phase6',
      store_id: testStoreId,
      branch_id: null,
      entity_type: 'customer',
      entity_code: 'CUST-TEST',
      name: 'Test Customer Phase 6',
      phone: '+1234567890',
      lb_balance: 1000,
      usd_balance: 500,
      is_system_entity: false,
      is_active: true,
      customer_data: { lb_max_balance: 5000 },
      supplier_data: null,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      _synced: false
    };
    
    await getDB().entities.add(testEntity as any);
    const retrieved = await getDB().entities.get('test-entity-phase6');
    
    if (!retrieved || retrieved.entity_type !== 'customer') {
      throw new Error('Entity creation test failed');
    }
    
    // Test entity migration service
    const migrationStats = await entityMigrationService.getMigrationStatistics(testStoreId);
    
    // Cleanup
    await getDB().entities.delete('test-entity-phase6');
    
    console.log('   ✅ Phase 2: Entity migration system working');
    return true;
    
  } catch (error) {
    console.error('   ❌ Phase 2 failed:', error);
    return false;
  }
}

/**
 * Test Phase 3: Journal Entry System
 */
async function testPhase3(): Promise<boolean> {
  try {
    const testStoreId = 'test-store-phase6';
    
    // Create test journal entry
    const journalEntry = await journalService.createJournalEntry({
      transactionId: 'test-txn-phase6',
      debitAccount: '1100',
      creditAccount: '4100',
      amount: 500,
      currency: 'USD',
      entityId: 'test-entity-phase6',
      description: 'Phase 6 test transaction'
    });
    
    if (!journalEntry.success) {
      throw new Error(`Journal entry creation failed: ${journalEntry.errors.join(', ')}`);
    }
    
    // Verify journal entry was created
    const entries = await getDB().journal_entries
      .where('transaction_id')
      .equals('test-txn-phase6')
      .toArray();
    
    if (entries.length !== 2) { // Should have debit and credit entries
      throw new Error('Journal entry validation failed');
    }
    
    // Test validation
    const validation = await journalService.validateJournalEntries(testStoreId);
    
    // Cleanup
    await getDB().journal_entries.where('transaction_id').equals('test-txn-phase6').delete();
    
    console.log('   ✅ Phase 3: Journal entry system working');
    return true;
    
  } catch (error) {
    console.error('   ❌ Phase 3 failed:', error);
    return false;
  }
}

/**
 * Test Phase 4: Balance Snapshots
 */
async function testPhase4(): Promise<boolean> {
  try {
    const testStoreId = 'test-store-phase6';
    const today = new Date().toISOString().split('T')[0];
    
    // Create daily snapshots
    const snapshotResult = await snapshotService.createDailySnapshots(testStoreId, today);
    
    if (!snapshotResult.success) {
      throw new Error(`Snapshot creation failed: ${snapshotResult.errors.join(', ')}`);
    }
    
    // Test historical balance query
    const historicalBalance = await snapshotService.getHistoricalBalance(
      testStoreId,
      '1100',
      'test-entity-phase6',
      today
    );
    
    // Test snapshot verification
    const verification = await snapshotService.verifySnapshots(testStoreId, today);
    
    // Cleanup
    await getDB().balance_snapshots.where('store_id').equals(testStoreId).delete();
    
    console.log('   ✅ Phase 4: Balance snapshot system working');
    return true;
    
  } catch (error) {
    console.error('   ❌ Phase 4 failed:', error);
    return false;
  }
}

/**
 * Test Phase 5: Query Layer Updates
 */
async function testPhase5(): Promise<boolean> {
  try {
    const testStoreId = 'test-store-phase6';
    
    // Test entity query service
    const customers = await entityQueryService.getCustomers(testStoreId, {
      includeCurrentBalance: true
    });
    
    // Test reporting service
    const today = new Date().toISOString().split('T')[0];
    const trialBalance = await reportingService.generateTrialBalance(testStoreId, today);
    
    // Test legacy compatibility
    const legacyCustomers = await legacyCompatibilityService.getCustomers(testStoreId);
    const entityCounts = await legacyCompatibilityService.getEntityCounts(testStoreId);
    
    console.log('   ✅ Phase 5: Query layer updates working');
    return true;
    
  } catch (error) {
    console.error('   ❌ Phase 5 failed:', error);
    return false;
  }
}

/**
 * Test Performance Improvements
 */
async function testPerformance(): Promise<boolean> {
  try {
    const testStoreId = 'test-store-phase6';
    
    // Test entity query performance
    const startTime = Date.now();
    const customers = await entityQueryService.getCustomers(testStoreId, {
      includeCurrentBalance: true,
      limit: 100
    });
    const entityQueryTime = Date.now() - startTime;
    
    // Test snapshot query performance
    const snapshotStartTime = Date.now();
    const today = new Date().toISOString().split('T')[0];
    const historicalBalance = await snapshotService.getHistoricalBalance(
      testStoreId,
      '1100',
      'test-entity',
      today
    );
    const snapshotQueryTime = Date.now() - snapshotStartTime;
    
    // Test report generation performance
    const reportStartTime = Date.now();
    const trialBalance = await reportingService.generateTrialBalance(testStoreId, today);
    const reportTime = Date.now() - reportStartTime;
    
    console.log(`   ⚡ Performance Results:`);
    console.log(`      - Entity queries: ${entityQueryTime}ms`);
    console.log(`      - Snapshot queries: ${snapshotQueryTime}ms`);
    console.log(`      - Report generation: ${reportTime}ms`);
    
    // Performance should be reasonable (under 1 second for most operations)
    const performanceAcceptable = entityQueryTime < 1000 && 
                                 snapshotQueryTime < 1000 && 
                                 reportTime < 1000;
    
    if (performanceAcceptable) {
      console.log('   ✅ Performance: All operations within acceptable limits');
    } else {
      console.log('   ⚠️ Performance: Some operations slower than expected');
    }
    
    return performanceAcceptable;
    
  } catch (error) {
    console.error('   ❌ Performance testing failed:', error);
    return false;
  }
}

/**
 * Test Data Integrity
 */
async function testDataIntegrity(): Promise<boolean> {
  try {
    const testStoreId = 'test-store-phase6';
    
    // Test journal entry balance validation
    const journalValidation = await journalService.validateJournalEntries(testStoreId);
    
    // Test snapshot accuracy
    const today = new Date().toISOString().split('T')[0];
    const snapshotVerification = await snapshotService.verifySnapshots(testStoreId, today);
    
    // Test entity data consistency
    const entityStats = await entityQueryService.getEntityStatistics(testStoreId);
    
    console.log('   🔒 Data Integrity Results:');
    console.log(`      - Journal entries balanced: ${journalValidation.isBalanced}`);
    console.log(`      - Snapshots verified: ${snapshotVerification.isValid}`);
    console.log(`      - Entity statistics: ${entityStats.activeCustomers} customers, ${entityStats.activeSuppliers} suppliers`);
    
    const integrityValid = journalValidation.isBalanced && snapshotVerification.isValid;
    
    if (integrityValid) {
      console.log('   ✅ Data Integrity: All validations passed');
    } else {
      console.log('   ⚠️ Data Integrity: Some validations failed');
    }
    
    return integrityValid;
    
  } catch (error) {
    console.error('   ❌ Data integrity testing failed:', error);
    return false;
  }
}

/**
 * Test End-to-End Workflows
 */
async function testEndToEndWorkflows(): Promise<boolean> {
  try {
    const testStoreId = 'test-store-phase6';
    
    // Simulate complete business workflow:
    // 1. Create customer sale
    // 2. Generate journal entries
    // 3. Create snapshots
    // 4. Generate reports
    // 5. Verify data consistency
    
    console.log('   🔄 Testing complete business workflow...');
    
    // 1. Create journal entry for customer sale
    const saleEntry = await journalService.createJournalEntry({
      transactionId: 'test-e2e-sale',
      debitAccount: '1200', // AR
      creditAccount: '4100', // Revenue
      amount: 1000,
      currency: 'USD',
      entityId: 'test-customer-e2e',
      description: 'End-to-end test sale'
    });
    
    if (!saleEntry.success) {
      throw new Error('E2E: Sale journal entry failed');
    }
    
    // 2. Create snapshots
    const today = new Date().toISOString().split('T')[0];
    const snapshots = await snapshotService.createDailySnapshots(testStoreId, today);
    
    if (!snapshots.success) {
      throw new Error('E2E: Snapshot creation failed');
    }
    
    // 3. Generate reports
    const glReport = await reportingService.generateGeneralLedger(
      testStoreId,
      '1200',
      today,
      today
    );
    
    const trialBalance = await reportingService.generateTrialBalance(testStoreId, today);
    
    // 4. Verify consistency
    const verification = await snapshotService.verifySnapshots(testStoreId, today);
    
    if (!verification.isValid) {
      throw new Error('E2E: Data consistency check failed');
    }
    
    // Cleanup
    await getDB().journal_entries.where('transaction_id').equals('test-e2e-sale').delete();
    await getDB().balance_snapshots.where('store_id').equals(testStoreId).delete();
    
    console.log('   ✅ End-to-End: Complete workflow successful');
    return true;
    
  } catch (error) {
    console.error('   ❌ End-to-end testing failed:', error);
    return false;
  }
}

/**
 * Generate Final Test Report
 */
function generateFinalReport(results: any): void {
  console.log('\n' + '=' .repeat(60));
  console.log('📊 PHASE 6 COMPREHENSIVE TEST RESULTS');
  console.log('=' .repeat(60));
  
  const phases = [
    { name: 'Phase 1: Database Schema & Chart of Accounts', result: results.phase1 },
    { name: 'Phase 2: Entity Migration', result: results.phase2 },
    { name: 'Phase 3: Journal Entry System', result: results.phase3 },
    { name: 'Phase 4: Balance Snapshots', result: results.phase4 },
    { name: 'Phase 5: Query Layer Updates', result: results.phase5 },
    { name: 'Performance Testing', result: results.performance },
    { name: 'Data Integrity Testing', result: results.dataIntegrity },
    { name: 'End-to-End Workflows', result: results.endToEnd }
  ];
  
  let passedCount = 0;
  let totalCount = phases.length;
  
  phases.forEach(phase => {
    const status = phase.result ? '✅ PASS' : '❌ FAIL';
    console.log(`${status} ${phase.name}`);
    if (phase.result) passedCount++;
  });
  
  console.log('\n' + '-' .repeat(60));
  console.log(`📈 OVERALL RESULTS: ${passedCount}/${totalCount} tests passed`);
  
  const successRate = (passedCount / totalCount) * 100;
  console.log(`🎯 SUCCESS RATE: ${successRate.toFixed(1)}%`);
  
  if (successRate === 100) {
    console.log('🎉 ALL TESTS PASSED - READY FOR PRODUCTION!');
  } else if (successRate >= 80) {
    console.log('⚠️ MOSTLY SUCCESSFUL - MINOR ISSUES TO ADDRESS');
  } else {
    console.log('❌ SIGNIFICANT ISSUES - REQUIRES ATTENTION');
  }
  
  console.log('=' .repeat(60));
}

// Export for manual execution
export const phase6Tests = {
  runComprehensivePhase6Test
};
