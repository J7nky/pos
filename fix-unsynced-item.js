// Fix script for unsynced inventory items
// Run this in browser console to automatically fix common issues

async function fixUnsyncedInventoryItem() {
  console.log('🔧 Attempting to fix unsynced inventory item...');
  
  const recordId = 'f8478a57-5d29-4a53-92ee-d2bc4d299349';
  
  try {
    // Access database
    const db = window.db || (window.OfflineDataContext && window.OfflineDataContext.db);
    if (!db) {
      console.error('❌ Cannot access database. Make sure the app is loaded.');
      return;
    }
    
    // Get the specific record
    const record = await db.inventory_items.get(recordId);
    if (!record) {
      console.error('❌ Record not found');
      return;
    }
    
    console.log('📋 Current record:', {
      id: record.id,
      product_id: record.product_id,
      supplier_id: record.supplier_id,
      quantity: record.quantity,
      _synced: record._synced
    });
    
    let fixed = false;
    const fixes = [];
    
    // Fix 1: Check if quantity is negative and fix it
    if (record.quantity < 0) {
      console.log('🔧 Fixing negative quantity...');
      await db.inventory_items.update(recordId, { 
        quantity: 0,
        _synced: false 
      });
      fixes.push('Fixed negative quantity (set to 0)');
      fixed = true;
    }
    
    // Fix 2: Check if product exists, if not try to find a valid one
    if (record.product_id) {
      const product = await db.products.get(record.product_id);
      if (!product) {
        console.log('🔧 Product not found, looking for alternatives...');
        // Find any valid product for this store
        const validProducts = await db.products
          .where('store_id')
          .equals(record.store_id)
          .filter(p => !p._deleted && p._synced)
          .first();
        
        if (validProducts) {
          await db.inventory_items.update(recordId, { 
            product_id: validProducts.id,
            _synced: false 
          });
          fixes.push(`Updated product_id to valid product: ${validProducts.name}`);
          fixed = true;
        } else {
          console.error('❌ No valid products found for this store');
        }
      }
    }
    
    // Fix 3: Check if supplier exists, if not try to find a valid one
    if (record.supplier_id) {
      const supplier = await db.suppliers.get(record.supplier_id);
      if (!supplier) {
        console.log('🔧 Supplier not found, looking for alternatives...');
        // Find any valid supplier for this store
        const validSuppliers = await db.suppliers
          .where('store_id')
          .equals(record.store_id)
          .filter(s => !s._deleted && s._synced)
          .first();
        
        if (validSuppliers) {
          await db.inventory_items.update(recordId, { 
            supplier_id: validSuppliers.id,
            _synced: false 
          });
          fixes.push(`Updated supplier_id to valid supplier: ${validSuppliers.name}`);
          fixed = true;
        } else {
          console.error('❌ No valid suppliers found for this store');
        }
      }
    }
    
    // Fix 4: Check if batch exists, if not remove the reference
    if (record.batch_id) {
      const batch = await db.inventory_bills.get(record.batch_id);
      if (!batch) {
        console.log('🔧 Batch not found, removing reference...');
        await db.inventory_items.update(recordId, { 
          batch_id: null,
          _synced: false 
        });
        fixes.push('Removed invalid batch_id reference');
        fixed = true;
      }
    }
    
    // Fix 5: Ensure required fields are present
    const updates = {};
    if (!record.unit) {
      updates.unit = 'box';
    }
    if (record.quantity === undefined || record.quantity === null) {
      updates.quantity = 0;
    }
    
    if (Object.keys(updates).length > 0) {
      await db.inventory_items.update(recordId, { 
        ...updates,
        _synced: false 
      });
      fixes.push(`Added missing required fields: ${Object.keys(updates).join(', ')}`);
      fixed = true;
    }
    
    if (fixed) {
      console.log('✅ Fixes applied:', fixes);
      
      // Verify the record is now valid
      const updatedRecord = await db.inventory_items.get(recordId);
      console.log('📋 Updated record:', {
        id: updatedRecord.id,
        product_id: updatedRecord.product_id,
        supplier_id: updatedRecord.supplier_id,
        quantity: updatedRecord.quantity,
        unit: updatedRecord.unit,
        batch_id: updatedRecord.batch_id,
        _synced: updatedRecord._synced
      });
      
      // Try to trigger a sync
      console.log('🔄 Attempting to trigger sync...');
      try {
        // Try to access the sync function through various methods
        if (window.OfflineDataContext && window.OfflineDataContext.sync) {
          const result = await window.OfflineDataContext.sync();
          console.log('Sync result:', result);
        } else if (window.syncService) {
          const result = await window.syncService.sync(updatedRecord.store_id);
          console.log('Sync result:', result);
        } else {
          console.log('⚠️ Cannot trigger sync automatically. Please try manual sync.');
        }
      } catch (syncError) {
        console.error('❌ Sync failed:', syncError);
      }
      
    } else {
      console.log('ℹ️ No fixes needed or no fixes available');
    }
    
    return { fixed, fixes };
    
  } catch (error) {
    console.error('❌ Error during fix:', error);
    return { fixed: false, error: error.message };
  }
}

// Alternative: Force mark as synced (use with caution)
async function forceMarkAsSynced() {
  console.log('⚠️ Force marking record as synced (use with caution)...');
  
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
    
    console.log('✅ Record marked as synced');
    
    // Refresh the unsynced count
    if (window.OfflineDataContext && window.OfflineDataContext.updateUnsyncedCount) {
      await window.OfflineDataContext.updateUnsyncedCount();
    }
    
  } catch (error) {
    console.error('❌ Error force marking as synced:', error);
  }
}

// Make functions available globally
window.fixUnsyncedInventoryItem = fixUnsyncedInventoryItem;
window.forceMarkAsSynced = forceMarkAsSynced;

console.log('🔧 Fix script loaded. Run fixUnsyncedInventoryItem() to attempt automatic fixes.');
console.log('⚠️ If automatic fixes fail, you can run forceMarkAsSynced() as a last resort.');
