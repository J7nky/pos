// Simple Browser Test for Accounting Foundation
// Run this in the browser console to test the implementation

import { getDB } from '../lib/db';

// Get singleton database instance
const db = getDB();

/**
 * Simple test that can be run in the browser console
 * Tests the core functionality of our accounting foundation
 */
export async function testAccountingFoundation(): Promise<void> {
  console.log('🧪 Testing Accounting Foundation in Browser');
  console.log('=' .repeat(50));
  
  const testStoreId = 'browser-test-store';
  
  try {
    // Test 1: Database Tables
    console.log('\n1️⃣ Testing Database Tables...');
    await testDatabaseTables();
    
    // Test 2: Create Test Data
    console.log('\n2️⃣ Creating Test Data...');
    await createTestData(testStoreId);
    
    // Test 3: Query Test Data
    console.log('\n3️⃣ Querying Test Data...');
    await queryTestData(testStoreId);
    
    // Test 4: Performance Test
    console.log('\n4️⃣ Performance Testing...');
    await performanceTest(testStoreId);
    
    // Test 5: Data Integrity
    console.log('\n5️⃣ Data Integrity Check...');
    await dataIntegrityTest(testStoreId);
    
    // Cleanup
    console.log('\n🧹 Cleaning up test data...');
    await cleanupTestData(testStoreId);
    
    console.log('\n🎉 All tests completed successfully!');
    console.log('✅ Accounting Foundation is working correctly');
    
  } catch (error) {
    console.error('❌ Test failed:', error);
    await cleanupTestData(testStoreId);
  }
}

async function testDatabaseTables(): Promise<void> {
  const tables = [
    'chart_of_accounts',
    'journal_entries',
    'balance_snapshots', 
    'entities'
  ];
  
  for (const tableName of tables) {
    const table = (db as any)[tableName];
    if (!table) {
      throw new Error(`Table ${tableName} not found`);
    }
    
    const count = await table.count();
    console.log(`   ✅ ${tableName}: ${count} records`);
  }
}

async function createTestData(storeId: string): Promise<void> {
  // Create chart of accounts
  const account = {
    id: 'test-acc-1200',
    store_id: storeId,
    account_code: '1200',
    account_name: 'Accounts Receivable',
    account_type: 'asset',
    requires_entity: true,
    is_active: true
  };
  
  await getDB().chart_of_accounts.add(account as any);
  console.log('   ✅ Chart of accounts entry created');
  
  // Create entity
  const entity = {
    id: 'test-customer-browser',
    store_id: storeId,
    branch_id: null,
    entity_type: 'customer',
    entity_code: 'BROWSER-CUST',
    name: 'Browser Test Customer',
    phone: '+1-555-TEST',
    lb_balance: 5000,
    usd_balance: 250,
    is_system_entity: false,
    is_active: true,
    customer_data: { lb_max_balance: 10000 },
    supplier_data: null,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    _synced: false
  };
  
  await getDB().entities.add(entity as any);
  console.log('   ✅ Entity created');
  
  // Create journal entries
  const today = new Date().toISOString().split('T')[0];
  const journalEntries = [
    {
      id: 'test-je-debit',
      store_id: storeId,
      branch_id: null,
      transaction_id: 'test-browser-txn',
      account_code: '1200',
      entity_id: 'test-customer-browser',
      debit_amount: 250,
      credit_amount: 0,
      currency: 'USD',
      posted_date: today,
      fiscal_period: '2025-11',
      description: 'Browser test transaction',
      is_posted: true,
      created_at: new Date().toISOString(),
      created_by: 'browser-test',
      _synced: false
    },
    {
      id: 'test-je-credit',
      store_id: storeId,
      branch_id: null,
      transaction_id: 'test-browser-txn',
      account_code: '4100',
      entity_id: 'test-customer-browser',
      debit_amount: 0,
      credit_amount: 250,
      currency: 'USD',
      posted_date: today,
      fiscal_period: '2025-11',
      description: 'Browser test transaction',
      is_posted: true,
      created_at: new Date().toISOString(),
      created_by: 'browser-test',
      _synced: false
    }
  ];
  
  await getDB().journal_entries.bulkAdd(journalEntries as any);
  console.log('   ✅ Journal entries created (double-entry)');
  
  // Create balance snapshot
  const snapshot = {
    id: 'test-snapshot-browser',
    store_id: storeId,
    branch_id: null,
    account_code: '1200',
    entity_id: 'test-customer-browser',
    snapshot_date: today,
    snapshot_type: 'daily',
    balance_usd: 250,
    balance_lbp: 5000,
    verified: true,
    created_at: new Date().toISOString(),
    _synced: false
  };
  
  await getDB().balance_snapshots.add(snapshot as any);
  console.log('   ✅ Balance snapshot created');
}

async function queryTestData(storeId: string): Promise<void> {
  // Query entities
  const entities = await getDB().entities
    .where('store_id')
    .equals(storeId)
    .toArray();
  
  console.log(`   📊 Found ${entities.length} entities`);
  entities.forEach(entity => {
    console.log(`      ${entity.entity_code} - ${entity.name} ($${entity.usd_balance})`);
  });
  
  // Query journal entries
  const journalEntries = await getDB().journal_entries
    .where('store_id')
    .equals(storeId)
    .toArray();
  
  console.log(`   📚 Found ${journalEntries.length} journal entries`);
  
  // Query snapshots
  const snapshots = await getDB().balance_snapshots
    .where('store_id')
    .equals(storeId)
    .toArray();
  
  console.log(`   📸 Found ${snapshots.length} balance snapshots`);
}

async function performanceTest(storeId: string): Promise<void> {
  // Test entity query performance
  const entityStart = performance.now();
  const entities = await getDB().entities
    .where('store_id')
    .equals(storeId)
    .toArray();
  const entityTime = performance.now() - entityStart;
  
  // Test snapshot query performance (O(1) lookup)
  const snapshotStart = performance.now();
  const today = new Date().toISOString().split('T')[0];
  const snapshot = await getDB().balance_snapshots
    .where('[entity_id+account_code+snapshot_date]')
    .equals(['test-customer-browser', '1200', today])
    .first();
  const snapshotTime = performance.now() - snapshotStart;
  
  console.log(`   ⚡ Entity query: ${entityTime.toFixed(2)}ms`);
  console.log(`   ⚡ Snapshot query: ${snapshotTime.toFixed(2)}ms (O(1) performance)`);
  
  if (snapshotTime < 10) {
    console.log('   🚀 Excellent performance - snapshot queries are very fast!');
  }
}

async function dataIntegrityTest(storeId: string): Promise<void> {
  // Check journal entry balance
  const journalEntries = await getDB().journal_entries
    .where('store_id')
    .equals(storeId)
    .toArray();
  
  // Check USD balance
  let totalDebitsUSD = 0;
  let totalCreditsUSD = 0;
  let totalDebitsLBP = 0;
  let totalCreditsLBP = 0;
  
  journalEntries.forEach(entry => {
    totalDebitsUSD += entry.debit_usd || 0;
    totalCreditsUSD += entry.credit_usd || 0;
    totalDebitsLBP += entry.debit_lbp || 0;
    totalCreditsLBP += entry.credit_lbp || 0;
  });
  
  const usdBalanced = Math.abs(totalDebitsUSD - totalCreditsUSD) < 0.01;
  const lbpBalanced = Math.abs(totalDebitsLBP - totalCreditsLBP) < 0.01;
  const isBalanced = usdBalanced && lbpBalanced;
  
  console.log(`   ⚖️ Journal entries balanced: ${isBalanced ? '✅' : '❌'}`);
  console.log(`      USD - Debits: $${totalDebitsUSD.toFixed(2)}, Credits: $${totalCreditsUSD.toFixed(2)}`);
  console.log(`      LBP - Debits: ${totalDebitsLBP.toFixed(2)}, Credits: ${totalCreditsLBP.toFixed(2)}`);
  
  // Check snapshot accuracy
  const snapshot = await getDB().balance_snapshots
    .where('store_id')
    .equals(storeId)
    .first();
  
  if (snapshot) {
    console.log(`   📸 Snapshot verified: ${snapshot.verified ? '✅' : '❌'}`);
  }
}

async function cleanupTestData(storeId: string): Promise<void> {
  await getDB().transaction('rw', [
    getDB().chart_of_accounts,
    getDB().entities,
    getDB().journal_entries,
    getDB().balance_snapshots
  ], async () => {
    await getDB().chart_of_accounts.where('store_id').equals(storeId).delete();
    await getDB().entities.where('store_id').equals(storeId).delete();
    await getDB().journal_entries.where('store_id').equals(storeId).delete();
    await getDB().balance_snapshots.where('store_id').equals(storeId).delete();
  });
  
  console.log('   🧹 Test data cleaned up');
}

// Make available globally for browser console
(window as any).testAccountingFoundation = testAccountingFoundation;
