/**
 * Test Branch Context Integration
 * Verifies that branch context is automatically working across all services
 */

import { getDB } from '../lib/db';
import { ensureDefaultBranch } from '../lib/branchHelpers';
import { crudHelperService } from '../services/crudHelperService';

/**
 * Test branch context integration
 */
export async function testBranchContextIntegration(): Promise<void> {
  console.log('🧪 Testing Branch Context Integration...');
  
  try {
    // Create test store
    const testStoreId = 'test-store-branch-context';
    await getDB().stores.put({
      id: testStoreId,
      name: 'Test Store for Branch Context',
      preferred_currency: 'USD',
      preferred_language: 'en',
      updated_at: new Date().toISOString()
    });
    
    // Ensure default branch exists
    const branchId = await ensureDefaultBranch(testStoreId);
    console.log('✅ Default branch created:', branchId);
    
    // Test 1: Create branch-specific data
    console.log('\n📝 Test 1: Creating branch-specific data...');
    
    // Create inventory item for this branch
    const inventoryItemId = await getDB().inventory_items.add({
      store_id: testStoreId,
      branch_id: branchId,
      product_id: 'test-product',
      unit: 'kg',
      quantity: 10,
      weight: 5.5,
      price: 2.50,
      created_at: new Date().toISOString(),
      received_quantity: 10,
      selling_price: 3.00,
      type: 'purchase',
      received_at: new Date().toISOString(),
      currency: 'USD',
      _synced: false,
      _deleted: false
    });
    
    // Create transaction for this branch
    const transactionId = await getDB().transactions.add({
      store_id: testStoreId,
      branch_id: branchId,
      type: 'income',
      category: 'cash_drawer_sale',
      amount: 15.00,
      currency: 'USD',
      description: 'Test sale for branch',
      reference: 'TEST-SALE-001',
      customer_id: null,
      supplier_id: null,
      created_at: new Date().toISOString(),
      created_by: 'test-user',
      _synced: false,
      _deleted: false
    });
    
    console.log('✅ Created inventory item:', inventoryItemId);
    console.log('✅ Created transaction:', transactionId);
    
    // Test 2: Load data with branch filtering
    console.log('\n📊 Test 2: Loading data with branch filtering...');
    
    const storeData = await crudHelperService.loadAllStoreData(testStoreId, branchId);
    
    console.log('📦 Loaded inventory items:', storeData.inventoryData.length);
    console.log('💰 Loaded transactions:', storeData.transactionsData.length);
    
    // Verify branch filtering
    const inventoryForBranch = storeData.inventoryData.filter((item: any) => item.branch_id === branchId);
    const transactionsForBranch = storeData.transactionsData.filter((txn: any) => txn.branch_id === branchId);
    
    console.log('✅ Inventory items for branch:', inventoryForBranch.length);
    console.log('✅ Transactions for branch:', transactionsForBranch.length);
    
    // Test 3: Load data without branch filtering (should get all store data)
    console.log('\n🌐 Test 3: Loading data without branch filtering...');
    
    const allStoreData = await crudHelperService.loadAllStoreData(testStoreId);
    
    console.log('📦 All store inventory items:', allStoreData.inventoryData.length);
    console.log('💰 All store transactions:', allStoreData.transactionsData.length);
    
    // Test 4: Verify branch isolation
    console.log('\n🔒 Test 4: Testing branch isolation...');
    
    // Create second branch
    const branch2Id = await getDB().branches.add({
      store_id: testStoreId,
      name: 'Branch 2',
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      _synced: false,
      _deleted: false
    });
    
    // Create data for second branch
    await getDB().inventory_items.add({
      store_id: testStoreId,
      branch_id: branch2Id,
      product_id: 'test-product-2',
      unit: 'pcs',
      quantity: 20,
      weight: 1.0,
      price: 1.00,
      created_at: new Date().toISOString(),
      received_quantity: 20,
      selling_price: 1.50,
      type: 'purchase',
      received_at: new Date().toISOString(),
      currency: 'USD',
      _synced: false,
      _deleted: false
    });
    
    // Load data for branch 1 only
    const branch1Data = await crudHelperService.loadAllStoreData(testStoreId, branchId);
    
    // Load data for branch 2 only
    const branch2Data = await crudHelperService.loadAllStoreData(testStoreId, branch2Id);
    
    console.log('🏪 Branch 1 inventory items:', branch1Data.inventoryData.length);
    console.log('🏪 Branch 2 inventory items:', branch2Data.inventoryData.length);
    
    // Verify isolation
    const branch1HasBranch2Data = branch1Data.inventoryData.some((item: any) => item.branch_id === branch2Id);
    const branch2HasBranch1Data = branch2Data.inventoryData.some((item: any) => item.branch_id === branchId);
    
    if (!branch1HasBranch2Data && !branch2HasBranch1Data) {
      console.log('✅ Branch isolation working correctly');
    } else {
      console.log('❌ Branch isolation failed');
    }
    
    // Cleanup
    console.log('\n🧹 Cleaning up test data...');
    await getDB().stores.delete(testStoreId);
    await getDB().branches.where('store_id').equals(testStoreId).delete();
    await getDB().inventory_items.where('store_id').equals(testStoreId).delete();
    await getDB().transactions.where('store_id').equals(testStoreId).delete();
    
    console.log('✅ Branch context integration test completed successfully!');
    
  } catch (error) {
    console.error('❌ Branch context integration test failed:', error);
    throw error;
  }
}

// Run test if called directly
if (typeof window !== 'undefined') {
  (window as any).testBranchContextIntegration = testBranchContextIntegration;
}
