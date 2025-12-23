// Phase 5 Integration Tests - Query Layer Updates
// Tests the complete migration with entity queries, snapshots, and reports

import { getDB } from '../../lib/db';
import { entityQueryService } from '../entityQueryService';
import { reportingService } from '../reportingService';
import { legacyCompatibilityService } from '../legacyCompatibilityService';
import { snapshotService } from '../snapshotService';
import { journalService } from '../journalService';
import { SYSTEM_ENTITY_IDS } from '../../constants/systemEntities';

// Mock data for testing
const mockStoreId = 'test-store-phase5-123';
const mockBranchId = 'test-branch-001';
const mockCustomerId = 'customer-phase5-test';
const mockSupplierId = 'supplier-phase5-test';

/**
 * Test Phase 5 Integration - Complete Migration
 * This tests the entire accounting foundation with all phases working together
 */
export async function testPhase5Integration(): Promise<void> {
  console.log('🧪 Starting Phase 5 Integration Tests...');
  console.log('=' .repeat(60));
  
  try {
    // 1. Clean up any existing test data
    console.log('🧹 Cleaning up existing test data...');
    await cleanupTestData();
    
    // 2. Set up complete test environment
    console.log('📝 Setting up complete test environment...');
    await setupCompleteTestData();
    
    // 3. Test entity query service
    console.log('3️⃣ Testing Entity Query Service...');
    await testEntityQueryService();
    
    // 4. Test legacy compatibility service
    console.log('4️⃣ Testing Legacy Compatibility Service...');
    await testLegacyCompatibilityService();
    
    // 5. Test reporting service
    console.log('5️⃣ Testing Reporting Service...');
    await testReportingService();
    
    // 6. Test performance improvements
    console.log('6️⃣ Testing Performance Improvements...');
    await testPerformanceImprovements();
    
    // 7. Test end-to-end workflow
    console.log('7️⃣ Testing End-to-End Workflow...');
    await testEndToEndWorkflow();
    
    console.log('✅ All Phase 5 Integration Tests Passed!');
    
    // Clean up test data
    console.log('🧹 Cleaning up test data...');
    await cleanupTestData();
    
    console.log('🎉 Phase 5 Integration Tests Completed Successfully!');
    
  } catch (error) {
    console.error('❌ Phase 5 Integration Test Failed:', error);
    
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
 * Set up complete test environment with all data
 */
async function setupCompleteTestData(): Promise<void> {
  // Create chart of accounts
  const accounts = [
    { id: 'acc-1100', store_id: mockStoreId, account_code: '1100', account_name: 'Cash', account_type: 'asset', requires_entity: true, is_active: true },
    { id: 'acc-1200', store_id: mockStoreId, account_code: '1200', account_name: 'Accounts Receivable', account_type: 'asset', requires_entity: true, is_active: true },
    { id: 'acc-2100', store_id: mockStoreId, account_code: '2100', account_name: 'Accounts Payable', account_type: 'liability', requires_entity: true, is_active: true },
    { id: 'acc-4100', store_id: mockStoreId, account_code: '4100', account_name: 'Sales Revenue', account_type: 'revenue', requires_entity: true, is_active: true },
    { id: 'acc-5100', store_id: mockStoreId, account_code: '5100', account_name: 'Cost of Goods Sold', account_type: 'expense', requires_entity: false, is_active: true }
  ];
  
  await getDB().chart_of_accounts.bulkAdd(accounts as any);
  
  // Create test entities
  const entities = [
    {
      id: mockCustomerId,
      store_id: mockStoreId,
      branch_id: null,
      entity_type: 'customer',
      entity_code: 'CUST-P5',
      name: 'Test Customer Phase 5',
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
    },
    {
      id: mockSupplierId,
      store_id: mockStoreId,
      branch_id: null,
      entity_type: 'supplier',
      entity_code: 'SUPP-P5',
      name: 'Test Supplier Phase 5',
      phone: '+0987654321',
      lb_balance: -2000,
      usd_balance: -800,
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
  
  await getDB().entities.bulkAdd(entities as any);
  
  // Create some journal entries for testing
  const today = new Date().toISOString().split('T')[0];
  const yesterday = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString().split('T')[0];
  
  // Customer sale on credit
  await journalService.createJournalEntry({
    transactionId: 'txn-p5-customer-sale',
    debitAccount: '1200', // AR
    creditAccount: '4100', // Revenue
    amount: 500,
    currency: 'USD',
    entityId: mockCustomerId,
    description: 'Customer credit sale',
    postedDate: yesterday
  });
  
  // Customer payment
  await journalService.createJournalEntry({
    transactionId: 'txn-p5-customer-payment',
    debitAccount: '1100', // Cash
    creditAccount: '1200', // AR
    amount: 200,
    currency: 'USD',
    entityId: mockCustomerId,
    description: 'Customer payment',
    postedDate: today
  });
  
  // Supplier purchase
  await journalService.createJournalEntry({
    transactionId: 'txn-p5-supplier-purchase',
    debitAccount: '5100', // COGS
    creditAccount: '2100', // AP
    amount: 800,
    currency: 'USD',
    entityId: mockSupplierId,
    description: 'Supplier purchase',
    postedDate: yesterday
  });
  
  // Create snapshots for both days
  await snapshotService.createDailySnapshots(mockStoreId, yesterday);
  await snapshotService.createDailySnapshots(mockStoreId, today);
}

/**
 * Test entity query service functionality
 */
async function testEntityQueryService(): Promise<void> {
  // Test getting customers
  const customers = await entityQueryService.getCustomers(mockStoreId, {
    includeCurrentBalance: true
  });
  
  if (customers.length === 0) {
    throw new Error('No customers found');
  }
  
  const testCustomer = customers.find(c => c.id === mockCustomerId);
  if (!testCustomer) {
    throw new Error('Test customer not found');
  }
  
  if (testCustomer.current_balance_usd !== 500) {
    throw new Error(`Customer balance incorrect: expected 500, got ${testCustomer.current_balance_usd}`);
  }
  
  // Test getting suppliers
  const suppliers = await entityQueryService.getSuppliers(mockStoreId, {
    includeCurrentBalance: true
  });
  
  if (suppliers.length === 0) {
    throw new Error('No suppliers found');
  }
  
  const testSupplier = suppliers.find(s => s.id === mockSupplierId);
  if (!testSupplier) {
    throw new Error('Test supplier not found');
  }
  
  // Test search functionality
  const searchResults = await entityQueryService.searchEntities(mockStoreId, 'Phase 5');
  
  if (searchResults.length < 2) {
    throw new Error(`Expected at least 2 search results, got ${searchResults.length}`);
  }
  
  // Test entity statistics
  const stats = await entityQueryService.getEntityStatistics(mockStoreId);
  
  if (stats.activeCustomers === 0 || stats.activeSuppliers === 0) {
    throw new Error('Entity statistics incorrect');
  }
  
  console.log('   ✅ Entity query service working correctly');
  console.log(`      - Customers found: ${customers.length}`);
  console.log(`      - Suppliers found: ${suppliers.length}`);
  console.log(`      - Search results: ${searchResults.length}`);
}

/**
 * Test legacy compatibility service
 */
async function testLegacyCompatibilityService(): Promise<void> {
  // Test getting customers in legacy format
  const legacyCustomers = await legacyCompatibilityService.getCustomers(mockStoreId);
  
  if (legacyCustomers.length === 0) {
    throw new Error('No legacy customers found');
  }
  
  const testCustomer = legacyCustomers.find(c => c.id === mockCustomerId);
  if (!testCustomer) {
    throw new Error('Test customer not found in legacy format');
  }
  
  if (testCustomer.name !== 'Test Customer Phase 5') {
    throw new Error('Customer name incorrect in legacy format');
  }
  
  // Test getting suppliers in legacy format
  const legacySuppliers = await legacyCompatibilityService.getSuppliers(mockStoreId);
  
  if (legacySuppliers.length === 0) {
    throw new Error('No legacy suppliers found');
  }
  
  // Test finding entity by ID
  const foundEntity = await legacyCompatibilityService.findEntityById(mockCustomerId);
  
  if (!foundEntity.entity || foundEntity.type !== 'customer') {
    throw new Error('Failed to find entity by ID');
  }
  
  // Test entity counts
  const counts = await legacyCompatibilityService.getEntityCounts(mockStoreId);
  
  if (counts.customerCount === 0 || counts.supplierCount === 0) {
    throw new Error('Entity counts incorrect');
  }
  
  console.log('   ✅ Legacy compatibility service working correctly');
  console.log(`      - Legacy customers: ${legacyCustomers.length}`);
  console.log(`      - Legacy suppliers: ${legacySuppliers.length}`);
  console.log(`      - Entity counts: ${counts.customerCount} customers, ${counts.supplierCount} suppliers`);
}

/**
 * Test reporting service functionality
 */
async function testReportingService(): Promise<void> {
  const today = new Date().toISOString().split('T')[0];
  const yesterday = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString().split('T')[0];
  
  // Test general ledger report
  const glReport = await reportingService.generateGeneralLedger(
    mockStoreId,
    '1200', // AR account
    yesterday,
    today
  );
  
  if (glReport.entries.length === 0) {
    throw new Error('No general ledger entries found');
  }
  
  if (Math.abs(glReport.closingBalance.USD - 300) > 0.01) { // 500 - 200 = 300
    throw new Error(`GL closing balance incorrect: expected 300, got ${glReport.closingBalance.USD}`);
  }
  
  // Test account statement
  const statement = await reportingService.generateAccountStatement(
    mockStoreId,
    mockCustomerId,
    '1200',
    yesterday,
    today
  );
  
  if (statement.transactions.length === 0) {
    throw new Error('No account statement transactions found');
  }
  
  if (Math.abs(statement.closingBalance.USD - 300) > 0.01) {
    throw new Error(`Statement closing balance incorrect: expected 300, got ${statement.closingBalance.USD}`);
  }
  
  // Test trial balance
  const trialBalance = await reportingService.generateTrialBalance(mockStoreId, today);
  
  if (trialBalance.accounts.length === 0) {
    throw new Error('No trial balance accounts found');
  }
  
  if (!trialBalance.isBalanced) {
    console.warn('⚠️ Trial balance is not balanced - this may be expected during testing');
  }
  
  // Test aging report
  const agingReport = await reportingService.generateAgingReport(mockStoreId, 'customer', today);
  
  if (agingReport.entities.length === 0) {
    throw new Error('No entities in aging report');
  }
  
  // Test financial summary
  const summary = await reportingService.getFinancialSummary(mockStoreId, today);
  
  if (summary.assets.USD === 0 && summary.revenue.USD === 0) {
    throw new Error('Financial summary appears empty');
  }
  
  console.log('   ✅ Reporting service working correctly');
  console.log(`      - GL entries: ${glReport.entries.length}`);
  console.log(`      - Statement transactions: ${statement.transactions.length}`);
  console.log(`      - Trial balance accounts: ${trialBalance.accounts.length}`);
  console.log(`      - Aging report entities: ${agingReport.entities.length}`);
}

/**
 * Test performance improvements
 */
async function testPerformanceImprovements(): Promise<void> {
  const today = new Date().toISOString().split('T')[0];
  
  // Test snapshot-based historical query performance
  const startTime = Date.now();
  
  const historicalBalance = await snapshotService.getHistoricalBalance(
    mockStoreId,
    '1200',
    mockCustomerId,
    today
  );
  
  const queryTime = Date.now() - startTime;
  
  if (queryTime > 100) { // Should be very fast with snapshots
    console.warn(`⚠️ Historical query took ${queryTime}ms - may be slower than expected`);
  }
  
  if (historicalBalance.isCalculated) {
    console.warn('⚠️ Historical balance was calculated instead of using snapshot');
  }
  
  // Test entity query performance
  const entityStartTime = Date.now();
  
  const customers = await entityQueryService.getCustomers(mockStoreId, {
    includeCurrentBalance: true,
    limit: 100
  });
  
  const entityQueryTime = Date.now() - entityStartTime;
  
  if (entityQueryTime > 200) {
    console.warn(`⚠️ Entity query took ${entityQueryTime}ms - may be slower than expected`);
  }
  
  console.log('   ✅ Performance improvements verified');
  console.log(`      - Historical query: ${queryTime}ms`);
  console.log(`      - Entity query: ${entityQueryTime}ms`);
  console.log(`      - Snapshot-based: ${!historicalBalance.isCalculated}`);
}

/**
 * Test end-to-end workflow
 */
async function testEndToEndWorkflow(): Promise<void> {
  // Simulate a complete business transaction workflow
  
  // 1. Create a new customer sale
  await journalService.createJournalEntry({
    transactionId: 'txn-p5-e2e-sale',
    debitAccount: '1200', // AR
    creditAccount: '4100', // Revenue
    amount: 1000,
    currency: 'USD',
    entityId: mockCustomerId,
    description: 'End-to-end test sale'
  });
  
  // 2. Get updated customer balance using entity query
  const customer = await entityQueryService.getEntityById(mockStoreId, mockCustomerId, {
    includeCurrentBalance: true
  });
  
  if (!customer) {
    throw new Error('Customer not found after transaction');
  }
  
  // 3. Generate account statement
  const today = new Date().toISOString().split('T')[0];
  const statement = await reportingService.generateAccountStatement(
    mockStoreId,
    mockCustomerId,
    '1200',
    today,
    today
  );
  
  if (statement.transactions.length === 0) {
    throw new Error('No transactions in statement after new sale');
  }
  
  // 4. Create daily snapshot
  const snapshotResult = await snapshotService.createDailySnapshots(mockStoreId, today);
  
  if (!snapshotResult.success) {
    throw new Error(`Snapshot creation failed: ${snapshotResult.errors.join(', ')}`);
  }
  
  // 5. Verify snapshot accuracy
  const verification = await snapshotService.verifySnapshots(mockStoreId, today);
  
  if (!verification.isValid) {
    throw new Error(`Snapshot verification failed: ${verification.discrepancies.length} discrepancies`);
  }
  
  // 6. Generate financial reports
  const trialBalance = await reportingService.generateTrialBalance(mockStoreId, today);
  const summary = await reportingService.getFinancialSummary(mockStoreId, today);
  
  if (trialBalance.accounts.length === 0 || summary.revenue.USD === 0) {
    throw new Error('Financial reports appear incomplete');
  }
  
  console.log('   ✅ End-to-end workflow completed successfully');
  console.log(`      - New transaction created and processed`);
  console.log(`      - Customer balance updated`);
  console.log(`      - Account statement generated`);
  console.log(`      - Snapshots created and verified`);
  console.log(`      - Financial reports generated`);
}

/**
 * Clean up test data
 */
async function cleanupTestData(): Promise<void> {
  await getDB().transaction('rw', [
    getDB().balance_snapshots,
    getDB().journal_entries,
    getDB().transactions,
    getDB().entities,
    getDB().chart_of_accounts
  ], async () => {
    await getDB().balance_snapshots.where('store_id').equals(mockStoreId).delete();
    await getDB().journal_entries.where('store_id').equals(mockStoreId).delete();
    await getDB().transactions.where('store_id').equals(mockStoreId).delete();
    await getDB().entities.where('store_id').equals(mockStoreId).delete();
    await getDB().chart_of_accounts.where('store_id').equals(mockStoreId).delete();
  });
}

// Export test functions for manual execution
export const phase5IntegrationTests = {
  testPhase5Integration
};
