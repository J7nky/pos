/**
 * Cash Drawer Testing Utilities
 * 
 * Run this script in the browser console to add testing utilities
 * Usage: Copy and paste this entire script into browser console
 */

console.log('🧪 Loading Cash Drawer Testing Utilities...');

// Add testing utilities to window object
window.cashDrawerTest = {
  
  /**
   * Test basic cash sale flow
   */
  async testCashSale(amount = 50, storeId = null, userId = null) {
    console.log(`🧪 Testing cash sale for $${amount}`);
    
    try {
      // Get current context data
      const storeIdToUse = storeId || (window.raw?.storeId) || 'test-store';
      const userIdToUse = userId || (window.userProfile?.id) || 'test-user';
      
      console.log(`Using storeId: ${storeIdToUse}, userId: ${userIdToUse}`);
      
      // Check initial balance
      const initialBalance = await window.cashDrawerTest.getBalance(storeIdToUse);
      console.log(`💰 Initial balance: $${initialBalance}`);
      
      // Create a test sale item
      const saleItem = {
        id: `test-sale-${Date.now()}`,
        inventory_item_id: 'test-inventory',
        product_id: 'test-product',
        supplier_id: 'test-supplier',
        quantity: 1,
        weight: null,
        unit_price: amount,
        received_value: amount,
        payment_method: 'cash',
        notes: 'Test cash sale',
        store_id: storeIdToUse,
        customer_id: null,
        created_at: new Date().toISOString(),
        created_by: userIdToUse,
        _synced: false
      };
      
      // Add sale item to database (this should trigger the hook)
      await db.sale_items.add(saleItem);
      
      // Wait a moment for async processing
      await new Promise(resolve => setTimeout(resolve, 1000));
      
      // Check new balance
      const newBalance = await window.cashDrawerTest.getBalance(storeIdToUse);
      console.log(`💰 New balance: $${newBalance}`);
      
      const expectedIncrease = amount;
      const actualIncrease = newBalance - initialBalance;
      
      if (Math.abs(actualIncrease - expectedIncrease) < 0.01) {
        console.log(`✅ SUCCESS: Cash sale correctly updated cash drawer (+$${actualIncrease.toFixed(2)})`);
        return { success: true, balanceIncrease: actualIncrease };
      } else {
        console.log(`❌ FAILED: Expected +$${expectedIncrease}, got +$${actualIncrease.toFixed(2)}`);
        return { success: false, expected: expectedIncrease, actual: actualIncrease };
      }
      
    } catch (error) {
      console.error('❌ Test failed with error:', error);
      return { success: false, error: error.message };
    }
  },

  /**
   * Get current cash drawer balance
   */
  async getBalance(storeId = null) {
    try {
      const storeIdToUse = storeId || (window.raw?.storeId) || 'test-store';
      
      // Import service dynamically
      const { cashDrawerUpdateService } = await import('/src/services/cashDrawerUpdateService.js');
      return await cashDrawerUpdateService.getCurrentCashDrawerBalance(storeIdToUse);
    } catch (error) {
      console.error('Error getting balance:', error);
      return 0;
    }
  },

  /**
   * Check current session status
   */
  async getSessionStatus(storeId = null) {
    try {
      const storeIdToUse = storeId || (window.raw?.storeId) || 'test-store';
      const session = await db.getCurrentCashDrawerSession(storeIdToUse);
      
      if (!session) {
        return { status: 'no_session', message: 'No active session' };
      }
      
      return {
        status: session.status,
        sessionId: session.id,
        openedBy: session.openedBy,
        openedAt: session.openedAt,
        openingAmount: session.openingAmount,
        message: `Session ${session.status} by ${session.openedBy}`
      };
    } catch (error) {
      console.error('Error getting session status:', error);
      return { status: 'error', message: error.message };
    }
  },

  /**
   * Test session opening
   */
  async testSessionOpen(openingAmount = 100, storeId = null, userId = null) {
    console.log(`🧪 Testing session opening with $${openingAmount}`);
    
    try {
      const storeIdToUse = storeId || (window.raw?.storeId) || 'test-store';
      const userIdToUse = userId || (window.userProfile?.id) || 'test-user';
      
      const { cashDrawerUpdateService } = await import('/src/services/cashDrawerUpdateService.js');
      const result = await cashDrawerUpdateService.openCashDrawerSession(
        storeIdToUse,
        openingAmount,
        userIdToUse,
        'Test session opening'
      );
      
      if (result.success) {
        console.log(`✅ Session opened successfully: ${result.sessionId}`);
      } else {
        console.log(`❌ Session opening failed: ${result.error}`);
      }
      
      return result;
    } catch (error) {
      console.error('❌ Session test failed:', error);
      return { success: false, error: error.message };
    }
  },

  /**
   * Test session closing
   */
  async testSessionClose(actualAmount, sessionId = null, userId = null) {
    console.log(`🧪 Testing session closing with actual amount $${actualAmount}`);
    
    try {
      const userIdToUse = userId || (window.userProfile?.id) || 'test-user';
      
      // Get current session if not provided
      let sessionIdToUse = sessionId;
      if (!sessionIdToUse) {
        const storeIdToUse = (window.raw?.storeId) || 'test-store';
        const session = await db.getCurrentCashDrawerSession(storeIdToUse);
        if (!session) {
          throw new Error('No active session to close');
        }
        sessionIdToUse = session.id;
      }
      
      const { cashDrawerUpdateService } = await import('/src/services/cashDrawerUpdateService.js');
      const result = await cashDrawerUpdateService.closeCashDrawer(
        sessionIdToUse,
        actualAmount,
        userIdToUse,
        'Test session closing'
      );
      
      if (result.success) {
        console.log(`✅ Session closed successfully:`);
        console.log(`   Expected: $${result.expectedAmount}`);
        console.log(`   Actual: $${result.actualAmount}`);
        console.log(`   Variance: $${result.variance}`);
      } else {
        console.log(`❌ Session closing failed: ${result.error}`);
      }
      
      return result;
    } catch (error) {
      console.error('❌ Session close test failed:', error);
      return { success: false, error: error.message };
    }
  },

  /**
   * View transaction history
   */
  async getTransactionHistory(storeId = null) {
    try {
      const storeIdToUse = storeId || (window.raw?.storeId) || 'test-store';
      
      const { cashDrawerUpdateService } = await import('/src/services/cashDrawerUpdateService.js');
      const history = await cashDrawerUpdateService.getCashDrawerTransactionHistory(storeIdToUse);
      
      console.log(`📊 Cash drawer transaction history (${history.length} transactions):`);
      history.forEach((trans, index) => {
        console.log(`${index + 1}. ${trans.type} - $${trans.amount} (${trans.description}) - ${new Date(trans.created_at).toLocaleString()}`);
      });
      
      return history;
    } catch (error) {
      console.error('Error getting transaction history:', error);
      return [];
    }
  },

  /**
   * Run comprehensive test suite
   */
  async runTestSuite(storeId = null, userId = null) {
    console.log('🧪 Running Cash Drawer Test Suite');
    console.log('==================================\n');
    
    const results = {
      sessionOpen: null,
      cashSale: null,
      balanceCheck: null,
      sessionClose: null,
      overall: false
    };
    
    try {
      const storeIdToUse = storeId || (window.raw?.storeId) || 'test-store';
      const userIdToUse = userId || (window.userProfile?.id) || 'test-user';
      
      // Test 1: Open session
      console.log('1️⃣ Testing session opening...');
      results.sessionOpen = await this.testSessionOpen(100, storeIdToUse, userIdToUse);
      
      // Test 2: Cash sale
      console.log('\n2️⃣ Testing cash sale...');
      results.cashSale = await this.testCashSale(25, storeIdToUse, userIdToUse);
      
      // Test 3: Balance check
      console.log('\n3️⃣ Testing balance calculation...');
      const balance = await this.getBalance(storeIdToUse);
      results.balanceCheck = { success: balance >= 125, balance };
      console.log(`💰 Current balance: $${balance} (Expected: ~$125)`);
      
      // Test 4: Session status
      console.log('\n4️⃣ Testing session status...');
      const sessionStatus = await this.getSessionStatus(storeIdToUse);
      console.log(`📋 Session status:`, sessionStatus);
      
      // Test 5: Transaction history
      console.log('\n5️⃣ Checking transaction history...');
      await this.getTransactionHistory(storeIdToUse);
      
      // Overall result
      results.overall = results.sessionOpen?.success && results.cashSale?.success && results.balanceCheck?.success;
      
      console.log('\n🎯 TEST SUITE RESULTS:');
      console.log(`Session Opening: ${results.sessionOpen?.success ? '✅' : '❌'}`);
      console.log(`Cash Sale: ${results.cashSale?.success ? '✅' : '❌'}`);
      console.log(`Balance Check: ${results.balanceCheck?.success ? '✅' : '❌'}`);
      console.log(`Overall: ${results.overall ? '✅ PASSED' : '❌ FAILED'}`);
      
      return results;
      
    } catch (error) {
      console.error('❌ Test suite failed:', error);
      results.overall = false;
      return results;
    }
  },

  /**
   * Quick test - just test cash sale
   */
  async quickTest() {
    console.log('⚡ Quick Cash Sale Test');
    console.log('=====================\n');
    
    const result = await this.testCashSale(30);
    
    if (result.success) {
      console.log('🎉 QUICK TEST PASSED: Cash sales are working!');
    } else {
      console.log('❌ QUICK TEST FAILED: Cash sales not working');
      console.log('💡 Try running the full test suite: cashDrawerTest.runTestSuite()');
    }
    
    return result;
  }
};

console.log('✅ Cash Drawer Testing Utilities Loaded!');
console.log('\n🚀 QUICK START:');
console.log('Run: cashDrawerTest.quickTest()');
console.log('\n🔧 FULL TESTING:');
console.log('Run: cashDrawerTest.runTestSuite()');
console.log('\n📊 OTHER UTILITIES:');
console.log('- cashDrawerTest.getBalance()');
console.log('- cashDrawerTest.getSessionStatus()');
console.log('- cashDrawerTest.getTransactionHistory()');
console.log('- cashDrawerTest.testSessionOpen(amount)');
console.log('- cashDrawerTest.testSessionClose(actualAmount)');
