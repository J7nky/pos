// Test script to verify cash drawer updates for cash sales
import { db } from './src/lib/db.js';
import { v4 as uuidv4 } from 'uuid';

async function testCashDrawerUpdate() {
  console.log('🧪 Testing cash drawer update for cash sales...');

  try {
    // Initialize database
    await db.open();

    // Test store ID
    const testStoreId = 'test-store-' + Date.now();
    const testUserId = 'test-user-' + uuidv4();

    console.log(`📝 Using test store: ${testStoreId}`);

    // Step 1: Create a cash drawer account
    console.log('1️⃣ Creating cash drawer account...');
    const account = {
      id: uuidv4(),
      store_id: testStoreId,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      _synced: false,
      accountCode: '1001',
      name: 'Test Cash Drawer',
      current_balance: 0,
      currency: 'USD',
      isActive: true
    };

    await db.cash_drawer_accounts.add(account);
    console.log('✅ Cash drawer account created');

    // Step 2: Open a cash drawer session
    console.log('2️⃣ Opening cash drawer session...');
    const sessionId = await db.openCashDrawerSession(testStoreId, account.id, 100, testUserId);
    console.log(`✅ Cash drawer session opened: ${sessionId}`);

    // Step 3: Get initial balance
    console.log('3️⃣ Getting initial balance...');
    const initialBalance = await db.cash_drawer_accounts.get(account.id);
    console.log(`💰 Initial balance: $${initialBalance.current_balance}`);

    // Step 4: Create cash sale items
    console.log('4️⃣ Creating cash sale items...');
    const saleItems = [
      {
        id: uuidv4(),
        inventory_item_id: '',
        product_id: 'test-product-1',
        supplier_id: 'test-supplier-1',
        quantity: 2,
        weight: null,
        unit_price: 25,
        received_value: 50,
        payment_method: 'cash',
        notes: 'Test cash sale',
        store_id: testStoreId,
        customer_id: null,
        created_at: new Date().toISOString(),
        created_by: testUserId,
        _synced: false
      }
    ];

    // Add sale items using bulkAdd (this should trigger our manual cash drawer update)
    await db.sale_items.bulkAdd(saleItems);
    console.log('✅ Sale items added');

    // Step 5: Manually trigger cash drawer update (simulating what the addSale function does)
    console.log('5️⃣ Manually triggering cash drawer update...');
    const { cashDrawerUpdateService } = await import('./src/services/cashDrawerUpdateService.js');

    const totalCashAmount = saleItems
      .filter(item => item.payment_method === 'cash')
      .reduce((sum, item) => sum + (item.received_value || 0), 0);

    console.log(`💵 Total cash sale amount: $${totalCashAmount}`);

    const updateResult = await cashDrawerUpdateService.updateCashDrawerForTransaction({
      type: 'sale',
      amount: totalCashAmount,
      currency: 'USD',
      description: 'Test cash sale',
      reference: `TEST-SALE-${Date.now()}`,
      storeId: testStoreId,
      createdBy: testUserId,
      allowAutoSessionOpen: true
    });

    if (updateResult.success) {
      console.log('✅ Cash drawer update successful');
      console.log(`💰 New balance: $${updateResult.newBalance}`);
    } else {
      console.error('❌ Cash drawer update failed:', updateResult.error);
    }

    // Step 6: Verify the balance was updated
    console.log('6️⃣ Verifying balance update...');
    const finalBalance = await db.cash_drawer_accounts.get(account.id);
    console.log(`💰 Final balance: $${finalBalance.current_balance}`);

    const expectedBalance = initialBalance.current_balance + totalCashAmount;
    if (finalBalance.current_balance === expectedBalance) {
      console.log('✅ Test PASSED: Cash drawer balance updated correctly!');
    } else {
      console.error(`❌ Test FAILED: Expected balance $${expectedBalance}, got $${finalBalance.current_balance}`);
    }

    // Cleanup
    console.log('🧹 Cleaning up test data...');
    await db.cash_drawer_accounts.delete(account.id);
    await db.cash_drawer_sessions.where('store_id').equals(testStoreId).delete();
    await db.sale_items.where('store_id').equals(testStoreId).delete();
    await db.transactions.where('store_id').equals(testStoreId).delete();

    console.log('✅ Test completed');

  } catch (error) {
    console.error('❌ Test failed with error:', error);
  }
}

// Run the test
testCashDrawerUpdate().catch(console.error);
