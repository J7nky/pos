/**
 * Pre-Launch Accounting Flow Tests
 * 
 * Run these tests to verify that the accounting system is working correctly
 * before launching to production.
 */

import { getDB } from '../lib/db';
import { transactionService } from '../services/transactionService';
import { balanceVerificationService } from '../services/balanceVerificationService';
import { TRANSACTION_CATEGORIES } from '../constants/transactionCategories';
import { createId } from '../lib/db';

interface TestResult {
  testName: string;
  passed: boolean;
  details: string;
  error?: string;
}

export class AccountingFlowTester {
  private results: TestResult[] = [];
  private testStoreId: string;
  private testBranchId: string;
  private testUserId: string;
  private testCustomerId?: string;
  private testSupplierId?: string;

  constructor(storeId: string, branchId: string, userId: string) {
    this.testStoreId = storeId;
    this.testBranchId = branchId;
    this.testUserId = userId;
  }

  /**
   * Run all accounting flow tests
   */
  async runAllTests(): Promise<{
    totalTests: number;
    passed: number;
    failed: number;
    results: TestResult[];
  }> {
    console.log('🧪 Starting Accounting Flow Tests...\n');
    
    this.results = [];

    // Setup: Create test entities
    await this.setupTestEntities();

    // Test 1: Credit Sale
    await this.testCreditSale();

    // Test 2: Customer Payment
    await this.testCustomerPayment();

    // Test 3: Cash Sale
    await this.testCashSale();

    // Test 4: Supplier Payment
    await this.testSupplierPayment();

    // Test 5: Balance Verification
    await this.testBalanceVerification();

    // Test 6: Journal Entry Integrity
    await this.testJournalEntryIntegrity();

    // Test 7: Cash Drawer Balance Calculation
    await this.testCashDrawerBalance();

    // Cleanup: Remove test entities
    await this.cleanupTestEntities();

    const passed = this.results.filter(r => r.passed).length;
    const failed = this.results.filter(r => !r.passed).length;

    console.log('\n📊 Test Results Summary:');
    console.log(`   Total: ${this.results.length}`);
    console.log(`   ✅ Passed: ${passed}`);
    console.log(`   ❌ Failed: ${failed}`);
    
    this.results.forEach(result => {
      const icon = result.passed ? '✅' : '❌';
      console.log(`   ${icon} ${result.testName}: ${result.details}`);
      if (result.error) {
        console.log(`      Error: ${result.error}`);
      }
    });

    return {
      totalTests: this.results.length,
      passed,
      failed,
      results: this.results
    };
  }

  /**
   * Setup test customer and supplier
   */
  private async setupTestEntities(): Promise<void> {
    try {
      // Import createId to generate proper UUIDs
      
      // Create test customer with proper UUID
      const customerId = createId();
      await getDB().entities.add({
        id: customerId,
        store_id: this.testStoreId,
        branch_id: this.testBranchId,
        entity_type: 'customer',
        entity_code: '', // Not a system entity (empty string instead of null)
        name: 'Test Customer',
        phone: '1234567890',
        email: 'test@customer.com',
        usd_balance: 0,
        lb_balance: 0,
        is_system_entity: false, // Explicitly mark as NOT a system entity
        is_active: true,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        _synced: false
      } as any);
      this.testCustomerId = customerId;

      // Create test supplier with proper UUID
      const supplierId = createId();
      await getDB().entities.add({
        id: supplierId,
        store_id: this.testStoreId,
        branch_id: this.testBranchId,
        entity_type: 'supplier',
        entity_code: '', // Not a system entity (empty string instead of null)
        name: 'Test Supplier',
        phone: '0987654321',
        email: 'test@supplier.com',
        usd_balance: 0,
        lb_balance: 0,
        is_system_entity: false, // Explicitly mark as NOT a system entity
        is_active: true,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        _synced: false
      } as any);
      this.testSupplierId = supplierId;

      console.log('✅ Test entities created with UUIDs:', {
        customerId: customerId.substring(0, 8) + '...',
        supplierId: supplierId.substring(0, 8) + '...'
      });
    } catch (error) {
      console.error('❌ Failed to create test entities:', error);
      throw error;
    }
  }

  /**
   * Test 1: Credit Sale creates proper journal entries
   */
  private async testCreditSale(): Promise<void> {
    const testName = 'Credit Sale Flow';
    
    try {
      if (!this.testCustomerId) throw new Error('Test customer not found');

      // Get initial balance
      const initialCustomer = await getDB().entities.get(this.testCustomerId);
      const initialBalance = initialCustomer?.lb_balance || 0;

      // Create credit sale transaction
      const result = await transactionService.createTransaction({
        category: TRANSACTION_CATEGORIES.CUSTOMER_CREDIT_SALE,
        amount: 100,
        currency: 'LBP',
        description: 'Test credit sale',
        customerId: this.testCustomerId,
        context: {
          userId: this.testUserId,
          storeId: this.testStoreId,
          branchId: this.testBranchId,
          module: 'test',
          source: 'web'
        },
        updateBalances: true,
        updateCashDrawer: false,
        _synced: false
      });

      if (!result.success) {
        throw new Error(result.error || 'Transaction failed');
      }

      // Verify customer balance increased
      const updatedCustomer = await getDB().entities.get(this.testCustomerId);
      const newBalance = updatedCustomer?.lb_balance || 0;
      const expectedBalance = initialBalance + 100;
      const balanceIncreased = Math.abs(newBalance - expectedBalance) < 0.01; // Allow tiny rounding errors

      // Debug output
      console.log(`💰 Credit Sale Balance Check:`, {
        initial: initialBalance,
        expected: expectedBalance,
        actual: newBalance,
        difference: newBalance - expectedBalance,
        passed: balanceIncreased
      });

      // Verify journal entries exist
      const journals = await getDB().journal_entries
        .where('transaction_id')
        .equals(result.transactionId!)
        .toArray();

      const hasDebitAR = journals.some(j => j.account_code === '1200' && j.debit === 100);
      const hasCreditRevenue = journals.some(j => j.account_code === '4100' && j.credit === 100);

      const passed = balanceIncreased && hasDebitAR && hasCreditRevenue && journals.length === 2;

      this.results.push({
        testName,
        passed,
        details: passed 
          ? 'Balance updated, journal entries created correctly'
          : `Initial: ${initialBalance}, New: ${newBalance}, Expected: ${expectedBalance}, Debit AR: ${hasDebitAR}, Credit Revenue: ${hasCreditRevenue}, Entries: ${journals.length}`
      });

    } catch (error) {
      this.results.push({
        testName,
        passed: false,
        details: 'Test failed with error',
        error: error instanceof Error ? error.message : String(error)
      });
    }
  }

  /**
   * Test 2: Customer payment reduces AR and increases cash
   */
  private async testCustomerPayment(): Promise<void> {
    const testName = 'Customer Payment Flow';
    
    try {
      if (!this.testCustomerId) throw new Error('Test customer not found');

      // Get initial balance
      const initialCustomer = await getDB().entities.get(this.testCustomerId);
      const initialBalance = initialCustomer?.lb_balance || 0;

      // Process customer payment
      const result = await transactionService.createCustomerPayment(
        this.testCustomerId,
        50,
        'LBP',
        'Test customer payment',
        {
          userId: this.testUserId,
          storeId: this.testStoreId,
          branchId: this.testBranchId,
          module: 'test',
          source: 'web'
        },
        {
          updateCashDrawer: false // Skip cash drawer for testing
        }
      );

      if (!result.success) {
        throw new Error(result.error || 'Payment failed');
      }

      // Verify customer balance decreased
      const updatedCustomer = await getDB().entities.get(this.testCustomerId);
      const newBalance = updatedCustomer?.lb_balance || 0;
      const balanceDecreased = newBalance === initialBalance - 50;

      // Verify journal entries
      const journals = await getDB().journal_entries
        .where('transaction_id')
        .equals(result.transactionId!)
        .toArray();

      const hasDebitCash = journals.some(j => j.account_code === '1100' && j.debit === 50);
      const hasCreditAR = journals.some(j => j.account_code === '1200' && j.credit === 50);

      const passed = balanceDecreased && hasDebitCash && hasCreditAR && journals.length === 2;

      this.results.push({
        testName,
        passed,
        details: passed
          ? 'Payment processed, AR decreased, cash increased'
          : `Balance: ${balanceDecreased}, Debit Cash: ${hasDebitCash}, Credit AR: ${hasCreditAR}`
      });

    } catch (error) {
      this.results.push({
        testName,
        passed: false,
        details: 'Test failed with error',
        error: error instanceof Error ? error.message : String(error)
      });
    }
  }

  /**
   * Test 3: Cash sale
   */
  private async testCashSale(): Promise<void> {
    const testName = 'Cash Sale Flow';
    
    try {
      const result = await transactionService.createCashDrawerSale(
        75,
        'LBP',
        'Test cash sale',
        {
          userId: this.testUserId,
          storeId: this.testStoreId,
          branchId: this.testBranchId,
          module: 'test',
          source: 'web'
        },
        {}
      );

      if (!result.success) {
        throw new Error(result.error || 'Cash sale failed');
      }

      // Verify journal entries
      const journals = await getDB().journal_entries
        .where('transaction_id')
        .equals(result.transactionId!)
        .toArray();

      const hasDebitCash = journals.some(j => j.account_code === '1100' && j.debit === 75);
      const hasCreditRevenue = journals.some(j => j.account_code === '4100' && j.credit === 75);

      const passed = hasDebitCash && hasCreditRevenue && journals.length === 2;

      this.results.push({
        testName,
        passed,
        details: passed
          ? 'Cash sale recorded with proper journal entries'
          : `Debit Cash: ${hasDebitCash}, Credit Revenue: ${hasCreditRevenue}, Entries: ${journals.length}`
      });

    } catch (error) {
      this.results.push({
        testName,
        passed: false,
        details: 'Test failed with error',
        error: error instanceof Error ? error.message : String(error)
      });
    }
  }

  /**
   * Test 4: Supplier payment
   */
  private async testSupplierPayment(): Promise<void> {
    const testName = 'Supplier Payment Flow';
    
    try {
      if (!this.testSupplierId) throw new Error('Test supplier not found');

      // First create some AP
      await transactionService.createTransaction({
        category: TRANSACTION_CATEGORIES.SUPPLIER_CREDIT_SALE,
        amount: 200,
        currency: 'LBP',
        description: 'Test supplier credit purchase',
        supplierId: this.testSupplierId,
        context: {
          userId: this.testUserId,
          storeId: this.testStoreId,
          branchId: this.testBranchId,
          module: 'test',
          source: 'web'
        },
        updateBalances: true,
        updateCashDrawer: false,
        _synced: false
      });

      // Get balance before payment
      const initialSupplier = await getDB().entities.get(this.testSupplierId);
      const initialBalance = initialSupplier?.lb_balance || 0;

      // Pay supplier
      const result = await transactionService.createSupplierPayment(
        this.testSupplierId,
        100,
        'LBP',
        'Test supplier payment',
        {
          userId: this.testUserId,
          storeId: this.testStoreId,
          branchId: this.testBranchId,
          module: 'test',
          source: 'web'
        },
        {
          updateCashDrawer: false
        }
      );

      if (!result.success) {
        throw new Error(result.error || 'Payment failed');
      }

      // Verify supplier balance decreased
      const updatedSupplier = await getDB().entities.get(this.testSupplierId);
      const newBalance = updatedSupplier?.lb_balance || 0;
      const balanceDecreased = newBalance === initialBalance - 100;

      // Verify journal entries
      const journals = await getDB().journal_entries
        .where('transaction_id')
        .equals(result.transactionId!)
        .toArray();

      const hasDebitAP = journals.some(j => j.account_code === '2100' && j.debit === 100);
      const hasCreditCash = journals.some(j => j.account_code === '1100' && j.credit === 100);

      const passed = balanceDecreased && hasDebitAP && hasCreditCash && journals.length === 2;

      this.results.push({
        testName,
        passed,
        details: passed
          ? 'Supplier payment processed correctly'
          : `Balance: ${balanceDecreased}, Debit AP: ${hasDebitAP}, Credit Cash: ${hasCreditCash}`
      });

    } catch (error) {
      this.results.push({
        testName,
        passed: false,
        details: 'Test failed with error',
        error: error instanceof Error ? error.message : String(error)
      });
    }
  }

  /**
   * Test 5: Balance verification service
   */
  private async testBalanceVerification(): Promise<void> {
    const testName = 'Balance Verification Service';
    
    try {
      if (!this.testCustomerId) throw new Error('Test customer not found');

      // Verify customer balance
      const verification = await balanceVerificationService.verifyEntityBalance(this.testCustomerId);

      // Debug output
      console.log(`🔍 Balance Verification:`, {
        entity: verification.entityName,
        cachedUSD: verification.cachedUsdBalance,
        journalUSD: verification.journalUsdBalance,
        cachedLBP: verification.cachedLbpBalance,
        journalLBP: verification.journalLbpBalance,
        isValid: verification.isValid
      });

      const passed = verification.isValid;

      this.results.push({
        testName,
        passed,
        details: passed
          ? 'Cached balance matches journal-derived balance'
          : `Cached vs Journal - USD: ${verification.cachedUsdBalance} vs ${verification.journalUsdBalance} (diff: ${verification.usdDifference}), LBP: ${verification.cachedLbpBalance} vs ${verification.journalLbpBalance} (diff: ${verification.lbpDifference})`
      });

    } catch (error) {
      this.results.push({
        testName,
        passed: false,
        details: 'Test failed with error',
        error: error instanceof Error ? error.message : String(error)
      });
    }
  }

  /**
   * Test 6: Journal entry integrity (double-entry always balanced)
   */
  private async testJournalEntryIntegrity(): Promise<void> {
    const testName = 'Journal Entry Integrity (Double-Entry)';
    
    try {
      // Get all journal entries for test transactions
      const allJournals = await getDB().journal_entries
        .where('store_id')
        .equals(this.testStoreId)
        .toArray();

      // Group by transaction_id
      const transactionGroups = new Map<string, typeof allJournals>();
      allJournals.forEach(journal => {
        const group = transactionGroups.get(journal.transaction_id) || [];
        group.push(journal);
        transactionGroups.set(journal.transaction_id, group);
      });

      // Verify each transaction has balanced entries (for both USD and LBP)
      let allBalanced = true;
      const unbalancedTransactions: string[] = [];

      for (const [txnId, journals] of transactionGroups.entries()) {
        // Check USD balance
        const totalDebitsUSD = journals.reduce((sum, j) => sum + (j.debit_usd || 0), 0);
        const totalCreditsUSD = journals.reduce((sum, j) => sum + (j.credit_usd || 0), 0);
        
        // Check LBP balance
        const totalDebitsLBP = journals.reduce((sum, j) => sum + (j.debit_lbp || 0), 0);
        const totalCreditsLBP = journals.reduce((sum, j) => sum + (j.credit_lbp || 0), 0);

        // Allow for small rounding errors (0.01)
        const usdBalanced = Math.abs(totalDebitsUSD - totalCreditsUSD) < 0.01;
        const lbpBalanced = Math.abs(totalDebitsLBP - totalCreditsLBP) < 0.01;
        
        if (!usdBalanced || !lbpBalanced) {
          allBalanced = false;
          unbalancedTransactions.push(txnId);
        }
      }

      const passed = allBalanced;

      this.results.push({
        testName,
        passed,
        details: passed
          ? `All ${transactionGroups.size} transactions have balanced double-entries`
          : `${unbalancedTransactions.length} unbalanced transactions found`
      });

    } catch (error) {
      this.results.push({
        testName,
        passed: false,
        details: 'Test failed with error',
        error: error instanceof Error ? error.message : String(error)
      });
    }
  }

  /**
   * Test 7: Cash Drawer Balance Calculation from Journals
   */
  private async testCashDrawerBalance(): Promise<void> {
    const testName = 'Cash Drawer Balance (Canonical Calculation)';
    
    try {
      // Import balance calculation utilities
      const { calculateCashDrawerBalance } = await import('../utils/balanceCalculation');
      const { cashDrawerUpdateService } = await import('../services/cashDrawerUpdateService');

      // Get current cash drawer account
      const cashDrawerAccount = await getDB().cash_drawer_accounts
        .where(['store_id', 'branch_id'])
        .equals([this.testStoreId, this.testBranchId])
        .first();

      if (!cashDrawerAccount) {
        this.results.push({
          testName,
          passed: false,
          details: 'No cash drawer account found. Create one first.',
          error: 'Cash drawer account not initialized'
        });
        return;
      }

      // Get cached balance
      const cachedBalance = (cashDrawerAccount as any).current_balance || 0;

      // Calculate TRUE balance from journal entries (CANONICAL)
      const journalBalance = await calculateCashDrawerBalance(
        this.testStoreId,
        this.testBranchId,
        'LBP' // Assuming LBP for cash drawer
      );

      // Calculate difference
      const difference = Math.abs(cachedBalance - journalBalance);
      const isValid = difference < 0.01; // Allow tiny rounding errors

      console.log(`💰 Cash Drawer Balance Check:`, {
        cached: cachedBalance.toFixed(2),
        journal: journalBalance.toFixed(2),
        difference: difference.toFixed(2),
        isValid
      });

      // Also verify using the service method
      const serviceBalance = await cashDrawerUpdateService.getCurrentCashDrawerBalance(
        this.testStoreId,
        this.testBranchId
      );

      console.log(`💰 Cash Drawer Service Balance:`, serviceBalance.toFixed(2));

      const passed = isValid;

      this.results.push({
        testName,
        passed,
        details: passed
          ? `Cached balance (${cachedBalance.toFixed(2)}) matches journal balance (${journalBalance.toFixed(2)})`
          : `Discrepancy found - Cached: ${cachedBalance.toFixed(2)}, Journal: ${journalBalance.toFixed(2)}, Diff: ${difference.toFixed(2)}`
      });

    } catch (error) {
      this.results.push({
        testName,
        passed: false,
        details: 'Test failed with error',
        error: error instanceof Error ? error.message : String(error)
      });
    }
  }

  /**
   * Cleanup test entities
   */
  private async cleanupTestEntities(): Promise<void> {
    try {
      // Delete test customer
      if (this.testCustomerId) {
        await getDB().entities.delete(this.testCustomerId);
      }

      // Delete test supplier
      if (this.testSupplierId) {
        await getDB().entities.delete(this.testSupplierId);
      }

      // Delete test transactions
      const testTransactions = await getDB().transactions
        .where('store_id')
        .equals(this.testStoreId)
        .and(t => {
          const desc = typeof t.description === 'string' ? t.description : JSON.stringify(t.description);
          return desc.includes('Test');
        })
        .toArray();

      for (const txn of testTransactions) {
        await getDB().transactions.delete(txn.id);
      }

      // Delete test journal entries
      const testJournals = await getDB().journal_entries
        .where('store_id')
        .equals(this.testStoreId)
        .and(j => {
          const desc = typeof j.description === 'string' ? j.description : '';
          return desc.includes('Test');
        })
        .toArray();

      for (const journal of testJournals) {
        await getDB().journal_entries.delete(journal.id);
      }

      console.log('✅ Test entities cleaned up');
    } catch (error) {
      console.warn('⚠️ Failed to cleanup test entities:', error);
    }
  }
}

/**
 * Quick test runner for console
 */
export async function runAccountingTests(
  storeId: string,
  branchId: string,
  userId: string
): Promise<void> {
  const tester = new AccountingFlowTester(storeId, branchId, userId);
  const results = await tester.runAllTests();

  if (results.failed > 0) {
    console.error('\n❌ Some tests failed! Review the results above.');
  } else {
    console.log('\n✅ All tests passed! Your accounting system is ready for launch.');
  }

  return;
}

