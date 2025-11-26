// Snapshot Service Tests - Phase 4 of Accounting Foundation Migration
// Tests for balance snapshots and historical queries

import { db } from '../../lib/db';
import { snapshotService } from '../snapshotService';
import { snapshotSchedulerService } from '../snapshotSchedulerService';
import { journalService } from '../journalService';
import { entityMigrationService } from '../entityMigrationService';
import { SYSTEM_ENTITY_IDS } from '../../constants/systemEntities';

// Mock data for testing
const mockStoreId = 'test-store-snapshot-123';
const mockBranchId = 'test-branch-001';
const mockCustomerId = 'customer-snapshot-test';
const mockSupplierId = 'supplier-snapshot-test';

/**
 * Test Snapshot Service - Phase 4 Implementation
 * This tests the complete balance snapshot system
 */
export async function testSnapshotService(): Promise<void> {
  console.log('🧪 Starting Snapshot Service Tests (Phase 4)...');
  console.log('=' .repeat(60));
  
  try {
    // 1. Clean up any existing test data
    console.log('🧹 Cleaning up existing test data...');
    await cleanupTestData();
    
    // 2. Set up test data
    console.log('📝 Setting up test data...');
    await setupTestData();
    
    // 3. Create some journal entries for testing
    console.log('📊 Creating test journal entries...');
    await createTestJournalEntries();
    
    // 4. Test daily snapshot creation
    console.log('4️⃣ Testing daily snapshot creation...');
    await testDailySnapshotCreation();
    
    // 5. Test historical balance queries
    console.log('5️⃣ Testing historical balance queries...');
    await testHistoricalBalanceQueries();
    
    // 6. Test snapshot verification
    console.log('6️⃣ Testing snapshot verification...');
    await testSnapshotVerification();
    
    // 7. Test balance history
    console.log('7️⃣ Testing balance history...');
    await testBalanceHistory();
    
    // 8. Test snapshot statistics
    console.log('8️⃣ Testing snapshot statistics...');
    await testSnapshotStatistics();
    
    // 9. Test snapshot scheduler
    console.log('9️⃣ Testing snapshot scheduler...');
    await testSnapshotScheduler();
    
    console.log('✅ All Snapshot Service Tests Passed!');
    
    // Clean up test data
    console.log('🧹 Cleaning up test data...');
    await cleanupTestData();
    
    console.log('🎉 Snapshot Service Tests Completed Successfully!');
    
  } catch (error) {
    console.error('❌ Snapshot Service Test Failed:', error);
    
    // Clean up on failure
    try {
      await cleanupTestData();
    } catch (cleanupError) {
      console.error('Failed to clean up test data:', cleanupError);
    }
    
    throw error;
  }
}

/**
 * Set up test data for snapshot tests
 */
async function setupTestData(): Promise<void> {
  // Create chart of accounts
  const accounts = [
    { id: 'acc-1100', store_id: mockStoreId, account_code: '1100', account_name: 'Cash', account_type: 'asset', requires_entity: true, is_active: true },
    { id: 'acc-1200', store_id: mockStoreId, account_code: '1200', account_name: 'Accounts Receivable', account_type: 'asset', requires_entity: true, is_active: true },
    { id: 'acc-2100', store_id: mockStoreId, account_code: '2100', account_name: 'Accounts Payable', account_type: 'liability', requires_entity: true, is_active: true },
    { id: 'acc-4100', store_id: mockStoreId, account_code: '4100', account_name: 'Sales Revenue', account_type: 'revenue', requires_entity: true, is_active: true },
    { id: 'acc-1300', store_id: mockStoreId, account_code: '1300', account_name: 'Inventory', account_type: 'asset', requires_entity: false, is_active: true }
  ];
  
  await db.chart_of_accounts.bulkAdd(accounts as any);
  
  // Create test entities
  const entities = [
    {
      id: mockCustomerId,
      store_id: mockStoreId,
      branch_id: null,
      entity_type: 'customer',
      entity_code: 'CUST-SNAP',
      name: 'Test Customer Snapshot',
      phone: '+1234567890',
      lb_balance: 0,
      usd_balance: 0,
      is_system_entity: false,
      is_active: true,
      customer_data: { lb_max_balance: 5000 },
      supplier_data: null,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      _synced: false
    },
    {
      id: mockSupplierId,
      store_id: mockStoreId,
      branch_id: null,
      entity_type: 'supplier',
      entity_code: 'SUPP-SNAP',
      name: 'Test Supplier Snapshot',
      phone: '+0987654321',
      lb_balance: 0,
      usd_balance: 0,
      is_system_entity: false,
      is_active: true,
      customer_data: null,
      supplier_data: { supplier_type: 'wholesale' },
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      _synced: false
    },
    {
      id: SYSTEM_ENTITY_IDS.CASH_CUSTOMER,
      store_id: mockStoreId,
      branch_id: null,
      entity_type: 'cash',
      entity_code: 'CASH',
      name: 'Cash Customer',
      phone: null,
      lb_balance: 0,
      usd_balance: 0,
      is_system_entity: true,
      is_active: true,
      customer_data: { lb_max_balance: 0 },
      supplier_data: null,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      _synced: false
    }
  ];
  
  await db.entities.bulkAdd(entities as any);
}

/**
 * Create test journal entries for different dates
 */
async function createTestJournalEntries(): Promise<void> {
  const today = new Date().toISOString().split('T')[0];
  const yesterday = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString().split('T')[0];
  const twoDaysAgo = new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
  
  // Day 1 (two days ago): Cash sale $100
  await journalService.createJournalEntry({
    transactionId: 'txn-day1-sale',
    debitAccount: '1100', // Cash
    creditAccount: '4100', // Revenue
    amount: 100,
    currency: 'USD',
    entityId: SYSTEM_ENTITY_IDS.CASH_CUSTOMER,
    description: 'Day 1 cash sale',
    postedDate: twoDaysAgo
  });
  
  // Day 2 (yesterday): Customer payment $50, Supplier payment $30
  await journalService.createJournalEntry({
    transactionId: 'txn-day2-payment',
    debitAccount: '1100', // Cash
    creditAccount: '1200', // AR
    amount: 50,
    currency: 'USD',
    entityId: mockCustomerId,
    description: 'Day 2 customer payment',
    postedDate: yesterday
  });
  
  await journalService.createJournalEntry({
    transactionId: 'txn-day2-supplier',
    debitAccount: '2100', // AP
    creditAccount: '1100', // Cash
    amount: 30,
    currency: 'USD',
    entityId: mockSupplierId,
    description: 'Day 2 supplier payment',
    postedDate: yesterday
  });
  
  // Day 3 (today): Another cash sale $75
  await journalService.createJournalEntry({
    transactionId: 'txn-day3-sale',
    debitAccount: '1100', // Cash
    creditAccount: '4100', // Revenue
    amount: 75,
    currency: 'USD',
    entityId: SYSTEM_ENTITY_IDS.CASH_CUSTOMER,
    description: 'Day 3 cash sale',
    postedDate: today
  });
}

/**
 * Test daily snapshot creation
 */
async function testDailySnapshotCreation(): Promise<void> {
  const snapshotDate = new Date().toISOString().split('T')[0];
  
  // Create daily snapshots
  const result = await snapshotService.createDailySnapshots(mockStoreId, snapshotDate);
  
  if (!result.success) {
    throw new Error(`Snapshot creation failed: ${result.errors.join(', ')}`);
  }
  
  if (result.snapshotsCreated === 0) {
    throw new Error('No snapshots were created');
  }
  
  // Verify snapshots were created in database
  const snapshots = await db.balance_snapshots
    .where('[store_id+snapshot_date]')
    .equals([mockStoreId, snapshotDate])
    .toArray();
  
  if (snapshots.length !== result.snapshotsCreated) {
    throw new Error(`Expected ${result.snapshotsCreated} snapshots in DB, found ${snapshots.length}`);
  }
  
  // Check specific account balances
  const cashSnapshot = snapshots.find(s => 
    s.account_code === '1100' && s.entity_id === SYSTEM_ENTITY_IDS.CASH_CUSTOMER
  );
  
  if (!cashSnapshot) {
    throw new Error('Cash account snapshot not found');
  }
  
  // Expected cash balance: $100 (day 1) + $50 (day 2) - $30 (day 2) + $75 (day 3) = $195
  const expectedCashBalance = 195;
  if (Math.abs(cashSnapshot.balance_usd - expectedCashBalance) > 0.01) {
    throw new Error(`Cash balance incorrect: expected ${expectedCashBalance}, got ${cashSnapshot.balance_usd}`);
  }
  
  console.log('   ✅ Daily snapshots created successfully');
  console.log(`      - Snapshots created: ${result.snapshotsCreated}`);
  console.log(`      - Accounts processed: ${result.accountsProcessed}`);
  console.log(`      - Processing time: ${result.processingTime}ms`);
}

/**
 * Test historical balance queries
 */
async function testHistoricalBalanceQueries(): Promise<void> {
  const today = new Date().toISOString().split('T')[0];
  const yesterday = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString().split('T')[0];
  
  // Test getting balance from snapshot (today)
  const todayBalance = await snapshotService.getHistoricalBalance(
    mockStoreId,
    '1100', // Cash account
    SYSTEM_ENTITY_IDS.CASH_CUSTOMER,
    today
  );
  
  if (todayBalance.isCalculated) {
    throw new Error('Today balance should come from snapshot, not calculation');
  }
  
  if (Math.abs(todayBalance.balanceUSD - 195) > 0.01) {
    throw new Error(`Today balance incorrect: expected 195, got ${todayBalance.balanceUSD}`);
  }
  
  // Test getting balance from calculation (yesterday - no snapshot)
  const yesterdayBalance = await snapshotService.getHistoricalBalance(
    mockStoreId,
    '1100',
    SYSTEM_ENTITY_IDS.CASH_CUSTOMER,
    yesterday
  );
  
  if (!yesterdayBalance.isCalculated) {
    throw new Error('Yesterday balance should be calculated, not from snapshot');
  }
  
  // Expected yesterday balance: $100 (day 1) + $50 (day 2) - $30 (day 2) = $120
  if (Math.abs(yesterdayBalance.balanceUSD - 120) > 0.01) {
    throw new Error(`Yesterday balance incorrect: expected 120, got ${yesterdayBalance.balanceUSD}`);
  }
  
  console.log('   ✅ Historical balance queries working correctly');
  console.log(`      - Today balance (snapshot): $${todayBalance.balanceUSD}`);
  console.log(`      - Yesterday balance (calculated): $${yesterdayBalance.balanceUSD}`);
}

/**
 * Test snapshot verification
 */
async function testSnapshotVerification(): Promise<void> {
  const snapshotDate = new Date().toISOString().split('T')[0];
  
  // Verify snapshots against journal calculations
  const verification = await snapshotService.verifySnapshots(mockStoreId, snapshotDate);
  
  if (!verification.isValid) {
    console.warn('Snapshot verification found discrepancies:');
    verification.discrepancies.forEach(disc => {
      console.warn(`   - Account ${disc.accountCode}: Snapshot ${disc.snapshotBalance.USD} USD, Calculated ${disc.calculatedBalance.USD} USD`);
    });
    throw new Error(`Snapshot verification failed: ${verification.discrepancies.length} discrepancies found`);
  }
  
  if (verification.validSnapshots !== verification.totalSnapshots) {
    throw new Error(`Not all snapshots are valid: ${verification.validSnapshots}/${verification.totalSnapshots}`);
  }
  
  console.log('   ✅ Snapshot verification passed');
  console.log(`      - Total snapshots: ${verification.totalSnapshots}`);
  console.log(`      - Valid snapshots: ${verification.validSnapshots}`);
}

/**
 * Test balance history
 */
async function testBalanceHistory(): Promise<void> {
  const today = new Date().toISOString().split('T')[0];
  const yesterday = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString().split('T')[0];
  const twoDaysAgo = new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
  
  // Create snapshots for yesterday as well
  await snapshotService.createDailySnapshots(mockStoreId, yesterday);
  
  // Get balance history
  const history = await snapshotService.getBalanceHistory(
    mockStoreId,
    '1100', // Cash account
    SYSTEM_ENTITY_IDS.CASH_CUSTOMER,
    twoDaysAgo,
    today
  );
  
  if (history.length < 2) {
    throw new Error(`Expected at least 2 history entries, got ${history.length}`);
  }
  
  // Sort by date
  history.sort((a, b) => a.snapshotDate.localeCompare(b.snapshotDate));
  
  // Check that balances are increasing over time (we had sales each day)
  for (let i = 1; i < history.length; i++) {
    if (history[i].balanceUSD <= history[i-1].balanceUSD) {
      throw new Error(`Balance should increase over time: ${history[i-1].balanceUSD} -> ${history[i].balanceUSD}`);
    }
  }
  
  console.log('   ✅ Balance history working correctly');
  console.log(`      - History entries: ${history.length}`);
  console.log(`      - Date range: ${history[0].snapshotDate} to ${history[history.length-1].snapshotDate}`);
}

/**
 * Test snapshot statistics
 */
async function testSnapshotStatistics(): Promise<void> {
  const stats = await snapshotService.getSnapshotStatistics(mockStoreId);
  
  if (stats.totalSnapshots === 0) {
    throw new Error('No snapshots found in statistics');
  }
  
  if (stats.verifiedSnapshots === 0) {
    throw new Error('No verified snapshots found');
  }
  
  if (!stats.newestSnapshot || !stats.oldestSnapshot) {
    throw new Error('Missing oldest/newest snapshot dates');
  }
  
  if (Object.keys(stats.snapshotsByAccount).length === 0) {
    throw new Error('No snapshots by account found');
  }
  
  console.log('   ✅ Snapshot statistics working correctly');
  console.log(`      - Total snapshots: ${stats.totalSnapshots}`);
  console.log(`      - Verified snapshots: ${stats.verifiedSnapshots}`);
  console.log(`      - Date range: ${stats.oldestSnapshot} to ${stats.newestSnapshot}`);
  console.log(`      - Accounts with snapshots: ${Object.keys(stats.snapshotsByAccount).length}`);
}

/**
 * Test snapshot scheduler
 */
async function testSnapshotScheduler(): Promise<void> {
  // Test scheduler status
  const initialStatus = snapshotSchedulerService.getSchedulerStatus();
  
  if (initialStatus.isRunning) {
    snapshotSchedulerService.stopScheduler();
  }
  
  // Test manual trigger
  await snapshotSchedulerService.triggerSnapshotForStore(mockStoreId);
  
  // Test scheduler configuration
  await snapshotSchedulerService.startScheduler({
    enabled: true,
    scheduleTime: '23:59',
    retryAttempts: 2
  });
  
  const runningStatus = snapshotSchedulerService.getSchedulerStatus();
  
  if (!runningStatus.isRunning) {
    throw new Error('Scheduler should be running after start');
  }
  
  // Stop scheduler
  snapshotSchedulerService.stopScheduler();
  
  const stoppedStatus = snapshotSchedulerService.getSchedulerStatus();
  
  if (stoppedStatus.isRunning) {
    throw new Error('Scheduler should be stopped after stop');
  }
  
  console.log('   ✅ Snapshot scheduler working correctly');
  console.log(`      - Manual trigger: Success`);
  console.log(`      - Start/stop: Success`);
  console.log(`      - Status tracking: Success`);
}

/**
 * Clean up test data
 */
async function cleanupTestData(): Promise<void> {
  await db.transaction('rw', [
    db.balance_snapshots,
    db.journal_entries, 
    db.transactions, 
    db.entities, 
    db.chart_of_accounts
  ], async () => {
    await db.balance_snapshots.where('store_id').equals(mockStoreId).delete();
    await db.journal_entries.where('store_id').equals(mockStoreId).delete();
    await db.transactions.where('store_id').equals(mockStoreId).delete();
    await db.entities.where('store_id').equals(mockStoreId).delete();
    await db.chart_of_accounts.where('store_id').equals(mockStoreId).delete();
  });
  
  // Clean up scheduler jobs
  snapshotSchedulerService.cleanupOldJobs(0); // Clean all jobs
}

// Export test functions for manual execution
export const snapshotServiceTests = {
  testSnapshotService
};
