// Test script to verify the sync fix
// Run this in browser console after the fix is applied

async function testSyncFix() {
  console.log('🧪 Testing sync fix...');
  
  try {
    // Access the database
    const db = window.db || (window.OfflineDataContext && window.OfflineDataContext.db);
    if (!db) {
      console.error('❌ Cannot access database. Make sure the app is loaded.');
      return;
    }
    
    // Check unsynced inventory items
    const unsyncedItems = await db.inventory_items.filter(item => !item._synced).toArray();
    console.log(`📊 Found ${unsyncedItems.length} unsynced inventory items`);
    
    if (unsyncedItems.length > 0) {
      console.log('📋 Unsynced items:', unsyncedItems.map(item => ({
        id: item.id,
        product_id: item.product_id,
        supplier_id: item.supplier_id,
        quantity: item.quantity,
        batch_id: item.batch_id
      })));
      
      // Check if the problematic item is still there
      const problematicItem = unsyncedItems.find(item => item.id === 'f8478a57-5d29-4a53-92ee-d2bc4d299349');
      if (problematicItem) {
        console.log('🔍 Problematic item still exists:', problematicItem);
        
        // Try to trigger a manual sync
        console.log('🔄 Attempting manual sync...');
        try {
          // Try to access sync function through various methods
          if (window.OfflineDataContext && window.OfflineDataContext.sync) {
            const result = await window.OfflineDataContext.sync();
            console.log('✅ Manual sync completed:', result);
          } else if (window.syncService) {
            const result = await window.syncService.sync(problematicItem.store_id);
            console.log('✅ Manual sync completed:', result);
          } else {
            console.log('⚠️ Cannot access sync function directly');
          }
        } catch (syncError) {
          console.error('❌ Manual sync failed:', syncError);
        }
      } else {
        console.log('✅ Problematic item no longer exists (may have been fixed)');
      }
    } else {
      console.log('✅ No unsynced inventory items found!');
    }
    
    // Check overall unsynced count
    const tableNames = [
      'stores', 'products', 'suppliers', 'customers', 'cash_drawer_accounts',
      'inventory_bills', 'inventory_items', 'transactions', 'bills',
      'bill_line_items', 'bill_audit_logs', 'cash_drawer_sessions'
    ];
    
    let totalUnsynced = 0;
    for (const tableName of tableNames) {
      const table = db[tableName];
      if (table) {
        const count = await table.filter(item => !item._synced).count();
        if (count > 0) {
          console.log(`📊 ${tableName}: ${count} unsynced records`);
          totalUnsynced += count;
        }
      }
    }
    
    console.log(`\n📈 Total unsynced records: ${totalUnsynced}`);
    
    if (totalUnsynced === 0) {
      console.log('🎉 All records are synced! The fix worked!');
    } else {
      console.log('⚠️ Some records are still unsynced. Check the details above.');
    }
    
  } catch (error) {
    console.error('❌ Test failed:', error);
  }
}

// Make function available globally
window.testSyncFix = testSyncFix;

console.log('🧪 Test script loaded. Run testSyncFix() to verify the sync fix.');
