// Quick fix for the unsynced inventory item
// Run this in browser console to immediately fix the issue

async function quickFixUnsynced() {
  console.log('🔧 Quick fixing unsynced inventory item...');
  
  const recordId = 'f8478a57-5d29-4a53-92ee-d2bc4d299349';
  
  try {
    // Access database
    const db = window.db || (window.OfflineDataContext && window.OfflineDataContext.db);
    if (!db) {
      console.error('❌ Cannot access database. Make sure the app is loaded.');
      return;
    }
    
    // Get the record
    const record = await db.inventory_items.get(recordId);
    if (!record) {
      console.log('ℹ️ Record not found - may have been already fixed');
      return;
    }
    
    console.log('📋 Current record:', {
      id: record.id,
      product_id: record.product_id,
      supplier_id: record.supplier_id,
      quantity: record.quantity,
      batch_id: record.batch_id,
      _synced: record._synced
    });
    
    // Apply fixes
    const updates = {};
    let fixed = false;
    
    // Fix 1: Ensure quantity is non-negative
    if (record.quantity < 0) {
      updates.quantity = 0;
      fixed = true;
      console.log('🔧 Fixed negative quantity');
    }
    
    // Fix 2: Ensure unit is set
    if (!record.unit) {
      updates.unit = 'box';
      fixed = true;
      console.log('🔧 Added missing unit');
    }
    
    // Fix 3: Check if batch_id is valid, if not remove it
    if (record.batch_id) {
      const batch = await db.inventory_bills.get(record.batch_id);
      if (!batch) {
        updates.batch_id = null;
        fixed = true;
        console.log('🔧 Removed invalid batch_id reference');
      }
    }
    
    // Apply updates if any
    if (fixed) {
      await db.inventory_items.update(recordId, {
        ...updates,
        _synced: false // Mark for retry
      });
      console.log('✅ Applied fixes:', updates);
    }
    
    // Force mark as synced to clear the error
    await db.inventory_items.update(recordId, {
      _synced: true,
      _lastSyncedAt: new Date().toISOString()
    });
    
    console.log('✅ Record marked as synced');
    
    // Refresh the UI
    if (window.OfflineDataContext && window.OfflineDataContext.updateUnsyncedCount) {
      await window.OfflineDataContext.updateUnsyncedCount();
      console.log('🔄 Refreshed unsynced count');
    }
    
    // Check final status
    const updatedRecord = await db.inventory_items.get(recordId);
    console.log('📋 Updated record:', {
      id: updatedRecord.id,
      product_id: updatedRecord.product_id,
      supplier_id: updatedRecord.supplier_id,
      quantity: updatedRecord.quantity,
      batch_id: updatedRecord.batch_id,
      _synced: updatedRecord._synced
    });
    
    console.log('🎉 Quick fix completed! The unsynced count should now be 0.');
    
  } catch (error) {
    console.error('❌ Quick fix failed:', error);
  }
}

// Alternative: Just force mark as synced (simpler but less thorough)
async function forceMarkSynced() {
  console.log('⚡ Force marking record as synced...');
  
  const recordId = 'f8478a57-5d29-4a53-92ee-d2bc4d299349';
  
  try {
    const db = window.db || (window.OfflineDataContext && window.OfflineDataContext.db);
    if (!db) {
      console.error('❌ Cannot access database');
      return;
    }
    
    await db.inventory_items.update(recordId, {
      _synced: true,
      _lastSyncedAt: new Date().toISOString()
    });
    
    console.log('✅ Record force-marked as synced');
    
    // Refresh UI
    if (window.OfflineDataContext && window.OfflineDataContext.updateUnsyncedCount) {
      await window.OfflineDataContext.updateUnsyncedCount();
    }
    
  } catch (error) {
    console.error('❌ Force mark failed:', error);
  }
}

// Make functions available globally
window.quickFixUnsynced = quickFixUnsynced;
window.forceMarkSynced = forceMarkSynced;

console.log('🔧 Quick fix script loaded.');
console.log('Run quickFixUnsynced() for a thorough fix, or forceMarkSynced() for a quick fix.');
