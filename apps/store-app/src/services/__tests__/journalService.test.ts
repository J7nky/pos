// Journal Service Tests - Phase 3 of Accounting Foundation Migration
// Tests for double-entry bookkeeping and journal entry creation

import { db } from '../../lib/db';
import { journalService } from '../journalService';
import { journalValidationService } from '../journalValidationService';
import { transactionService } from '../transactionService';
import { entityMigrationService } from '../entityMigrationService';
import { TRANSACTION_CATEGORIES } from '../../constants/transactionCategories';
import { SYSTEM_ENTITY_IDS } from '../../constants/systemEntities';

// Mock data for testing
const mockStoreId = 'test-store-journal-123';
const mockBranchId = 'test-branch-001';
const mockCustomerId = 'customer-journal-test';
const mockSupplierId = 'supplier-journal-test';

/**
 * Test Journal Service - Phase 3 Implementation
 * This tests the complete double-entry bookkeeping system
 */
export async function testJournalService(): Promise<void> {
  console.log('🧪 Starting Journal Service Tests (Phase 3)...');
  console.log('=' .repeat(60));
  
  try {
    // 1. Clean up any existing test data
    console.log('🧹 Cleaning up existing test data...');
    await db.transaction('rw', [
      db.journal_entries, 
      db.transactions, 
      db.entities, 
      db.customers, 
      db.suppliers,
      db.chart_of_accounts
    ], async () => {
      await db.journal_entries.where('store_id').equals(mockStoreId).delete();
      await db.transactions.where('store_id').equals(mockStoreId).delete();
      await db.entities.where('store_id').equals(mockStoreId).delete();
      await db.customers.where('store_id').equals(mockStoreId).delete();
      await db.suppliers.where('store_id').equals(mockStoreId).delete();
      await db.chart_of_accounts.where('store_id').equals(mockStoreId).delete();
    });
    
    // 2. Set up test data
    console.log('📝 Setting up test data...');
    await setupTestData();
    
    // 3. Test direct journal entry creation
    console.log('3️⃣ Testing direct journal entry creation...');
    await testDirectJournalEntries();
    
    // 4. Test transaction service integration
    console.log('4️⃣ Testing transaction service integration...');
    await testTransactionServiceIntegration();
    
    // 5. Test journal validation
    console.log('5️⃣ Testing journal validation...');
    await testJournalValidation();
    
    // 6. Test double-entry integrity
    console.log('6️⃣ Testing double-entry integrity...');
    await testDoubleEntryIntegrity();
    
    // 7. Test account balances
    console.log('7️⃣ Testing account balance calculations...');
    await testAccountBalances();
    
    console.log('✅ All Journal Service Tests Passed!');
    
    // Clean up test data
    console.log('🧹 Cleaning up test data...');
    await cleanupTestData();
    
    console.log('🎉 Journal Service Tests Completed Successfully!');
    
  } catch (error) {
    console.error('❌ Journal Service Test Failed:', error);
    
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
 * Set up test data for journal tests
 */
async function setupTestData(): Promise<void> {
  // Create chart of accounts
  const accounts = [
    { id: 'acc-1100', store_id: mockStoreId, account_code: '1100', account_name: 'Cash', account_type: 'asset', requires_entity: true, is_active: true },
    { id: 'acc-1200', store_id: mockStoreId, account_code: '1200', account_name: 'Accounts Receivable', account_type: 'asset', requires_entity: true, is_active: true },
    { id: 'acc-2100', store_id: mockStoreId, account_code: '2100', account_name: 'Accounts Payable', account_type: 'liability', requires_entity: true, is_active: true },
    { id: 'acc-4100', store_id: mockStoreId, account_code: '4100', account_name: 'Sales Revenue', account_type: 'revenue', requires_entity: true, is_active: true },
    { id: 'acc-5200', store_id: mockStoreId, account_code: '5200', account_name: 'Salaries Expense', account_type: 'expense', requires_entity: true, is_active: true }
  ];
  
  await db.chart_of_accounts.bulkAdd(accounts as any);
  
  // Create test entities
  const entities = [
    {
      id: mockCustomerId,
      store_id: mockStoreId,
      branch_id: null,
      entity_type: 'customer',
      entity_code: 'CUST-TEST',
      name: 'Test Customer',
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
      entity_code: 'SUPP-TEST',
      name: 'Test Supplier',
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
 * Test direct journal entry creation
 */
async function testDirectJournalEntries(): Promise<void> {
  // Test cash sale
  const saleTransactionId = await journalService.recordCashSale(
    100,
    'USD',
    SYSTEM_ENTITY_IDS.CASH_CUSTOMER,
    'Test cash sale'
  );
  
  // Verify journal entries were created
  const saleEntries = await db.journal_entries
    .where('transaction_id')
    .equals(saleTransactionId)
    .toArray();
  
  if (saleEntries.length !== 2) {
    throw new Error(`Expected 2 journal entries for cash sale, got ${saleEntries.length}`);
  }
  
  // Check debit entry (Cash)
  const debitEntry = saleEntries.find(e => e.debit > 0);
  if (!debitEntry || debitEntry.account_code !== '1100' || debitEntry.debit !== 100) {
    throw new Error('Invalid debit entry for cash sale');
  }
  
  // Check credit entry (Sales Revenue)
  const creditEntry = saleEntries.find(e => e.credit > 0);
  if (!creditEntry || creditEntry.account_code !== '4100' || creditEntry.credit !== 100) {
    throw new Error('Invalid credit entry for cash sale');
  }
  
  // Test customer payment
  const paymentTransactionId = await journalService.recordCustomerPayment(
    mockCustomerId,
    50,
    'USD',
    'Test customer payment'
  );
  
  const paymentEntries = await db.journal_entries
    .where('transaction_id')
    .equals(paymentTransactionId)
    .toArray();
  
  if (paymentEntries.length !== 2) {
    throw new Error(`Expected 2 journal entries for customer payment, got ${paymentEntries.length}`);
  }
  
  console.log('   ✅ Direct journal entries created correctly');
}

/**
 * Test transaction service integration
 */
async function testTransactionServiceIntegration(): Promise<void> {
  const context = {
    userId: 'test-user',
    storeId: mockStoreId,
    branchId: mockBranchId,
    module: 'test'
  };
  
  // Test customer payment through transaction service
  const result = await transactionService.createTransaction({
    category: TRANSACTION_CATEGORIES.CUSTOMER_PAYMENT,
    amount: 75,
    currency: 'USD',
    description: 'Customer payment via transaction service',
    customerId: mockCustomerId,
    context
  });
  
  if (!result.success || !result.transactionId) {
    throw new Error('Transaction service failed to create transaction');
  }
  
  // Verify journal entries were created automatically
  const journalEntries = await db.journal_entries
    .where('transaction_id')
    .equals(result.transactionId)
    .toArray();
  
  if (journalEntries.length !== 2) {
    throw new Error(`Expected 2 journal entries from transaction service, got ${journalEntries.length}`);
  }
  
  // Verify the entries are correct
  const debitEntry = journalEntries.find(e => e.debit > 0);
  const creditEntry = journalEntries.find(e => e.credit > 0);
  
  if (!debitEntry || debitEntry.account_code !== '1100' || debitEntry.debit !== 75) {
    throw new Error('Invalid debit entry from transaction service');
  }
  
  if (!creditEntry || creditEntry.account_code !== '1200' || creditEntry.credit !== 75) {
    throw new Error('Invalid credit entry from transaction service');
  }
  
  console.log('   ✅ Transaction service integration working correctly');
}

/**
 * Test journal validation
 */
async function testJournalValidation(): Promise<void> {
  // Validate all journal entries for the store
  const validation = await journalValidationService.validateStoreJournalEntries(mockStoreId);
  
  if (!validation.isValid) {
    throw new Error(`Journal validation failed: ${validation.errors.join(', ')}`);
  }
  
  // Check that debits equal credits
  const { totalDebits, totalCredits } = validation.summary;
  
  if (Math.abs(totalDebits.USD - totalCredits.USD) > 0.01) {
    throw new Error(`USD debits (${totalDebits.USD}) do not equal credits (${totalCredits.USD})`);
  }
  
  if (Math.abs(totalDebits.LBP - totalCredits.LBP) > 0.01) {
    throw new Error(`LBP debits (${totalDebits.LBP}) do not equal credits (${totalCredits.LBP})`);
  }
  
  console.log('   ✅ Journal validation passed');
  console.log(`      - Total entries: ${validation.summary.entryCount}`);
  console.log(`      - Total transactions: ${validation.summary.transactionCount}`);
  console.log(`      - USD: Debits ${totalDebits.USD} = Credits ${totalCredits.USD}`);
  console.log(`      - LBP: Debits ${totalDebits.LBP} = Credits ${totalCredits.LBP}`);
}

/**
 * Test double-entry integrity
 */
async function testDoubleEntryIntegrity(): Promise<void> {
  // Get all transactions and verify each is balanced
  const transactions = await db.transactions
    .where('store_id')
    .equals(mockStoreId)
    .toArray();
  
  for (const transaction of transactions) {
    const isBalanced = await journalService.verifyTransactionBalance(transaction.id);
    if (!isBalanced) {
      throw new Error(`Transaction ${transaction.id} is not balanced`);
    }
  }
  
  console.log(`   ✅ All ${transactions.length} transactions are balanced`);
}

/**
 * Test account balance calculations
 */
async function testAccountBalances(): Promise<void> {
  // Calculate cash account balance (should be positive from sales and payments)
  const cashBalance = await journalService.calculateAccountBalance(mockStoreId, '1100');
  
  // We had: $100 cash sale + $75 customer payment = $175 in cash
  const expectedCashUSD = 100 + 75; // From our test transactions
  
  if (Math.abs(cashBalance.USD - expectedCashUSD) > 0.01) {
    throw new Error(`Cash balance incorrect: expected ${expectedCashUSD}, got ${cashBalance.USD}`);
  }
  
  // Calculate accounts receivable balance (should be negative from customer payment)
  const arBalance = await journalService.calculateAccountBalance(mockStoreId, '1200');
  
  // We had: -$75 from customer payment (credit to AR)
  const expectedARUSD = -75;
  
  if (Math.abs(arBalance.USD - expectedARUSD) > 0.01) {
    throw new Error(`AR balance incorrect: expected ${expectedARUSD}, got ${arBalance.USD}`);
  }
  
  console.log('   ✅ Account balances calculated correctly');
  console.log(`      - Cash (1100): $${cashBalance.USD}`);
  console.log(`      - AR (1200): $${arBalance.USD}`);
}

/**
 * Clean up test data
 */
async function cleanupTestData(): Promise<void> {
  await db.transaction('rw', [
    db.journal_entries, 
    db.transactions, 
    db.entities, 
    db.customers, 
    db.suppliers,
    db.chart_of_accounts
  ], async () => {
    await db.journal_entries.where('store_id').equals(mockStoreId).delete();
    await db.transactions.where('store_id').equals(mockStoreId).delete();
    await db.entities.where('store_id').equals(mockStoreId).delete();
    await db.customers.where('store_id').equals(mockStoreId).delete();
    await db.suppliers.where('store_id').equals(mockStoreId).delete();
    await db.chart_of_accounts.where('store_id').equals(mockStoreId).delete();
  });
}

// Export test functions for manual execution
export const journalServiceTests = {
  testJournalService
};
