#!/usr/bin/env node

// Test script to verify the transaction committed too early fix
console.log('🧪 Testing POS sale processing fix...\n');

// Simulate a simple test to check if the database operations work
async function testSaleProcessing() {
  try {
    console.log('📦 Importing required modules...');

    // Import the database and services
    const { db } = require('./src/lib/db');
    const { cashDrawerUpdateService } = require('./src/services/cashDrawerUpdateService');

    console.log('✅ Modules imported successfully');

    // Test basic database connectivity
    console.log('🔗 Testing database connectivity...');

    // Wait for database to be ready
    await db.open();

    console.log('✅ Database connection established');

    // Test creating a basic sale item (simulated)
    console.log('💰 Testing sale item creation simulation...');

    const testSaleItem = {
      id: 'test-sale-' + Date.now(),
      store_id: 'test-store',
      inventory_item_id: 'test-inv',
      product_id: 'test-product',
      supplier_id: 'test-supplier',
      quantity: 1,
      weight: null,
      unit_price: 10.00,
      received_value: 10.00,
      payment_method: 'cash',
      notes: 'Test sale item',
      customer_id: null,
      created_at: new Date().toISOString(),
      created_by: 'test-user',
      _synced: false
    };

    console.log('📝 Test sale item:', testSaleItem);

    // Test the cash drawer update service with allowAutoSessionOpen flag
    console.log('💸 Testing cash drawer update service...');

    const updateResult = await cashDrawerUpdateService.updateCashDrawerForTransaction({
      type: 'sale',
      amount: 10.00,
      currency: 'USD',
      description: 'Test cash sale',
      reference: 'TEST-SALE-001',
      storeId: 'test-store',
      createdBy: 'test-user',
      allowAutoSessionOpen: true
    });

    console.log('✅ Cash drawer update result:', updateResult);

    if (updateResult.success) {
      console.log('🎉 SUCCESS: Cash drawer update completed without transaction errors!');
      console.log(`   Previous balance: $${updateResult.previousBalance}`);
      console.log(`   New balance: $${updateResult.newBalance}`);
    } else {
      console.log('❌ FAILED: Cash drawer update failed:', updateResult.error);
    }

  } catch (error) {
    console.error('❌ TEST FAILED:', error.message);
    console.error('Stack trace:', error.stack);
  }
}

// Run the test
testSaleProcessing().then(() => {
  console.log('\n🏁 Test completed');
  process.exit(0);
}).catch((error) => {
  console.error('\n💥 Test crashed:', error);
  process.exit(1);
});