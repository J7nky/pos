// Debug script for the specific unsynced inventory item
// Run this in browser console to analyze the exact record

async function debugSpecificInventoryItem() {
  console.log('🔍 Debugging specific unsynced inventory item...');
  
  const recordId = 'f8478a57-5d29-4a53-92ee-d2bc4d299349';
  const productId = 'c2fc1225-19bb-40cb-bf57-988b1a3d80f9';
  const supplierId = 'e2847632-125d-4f11-ae8f-17c2befc0af4';
  
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
    
    console.log('📋 Record details:', {
      id: record.id,
      product_id: record.product_id,
      supplier_id: record.supplier_id,
      quantity: record.quantity,
      unit: record.unit,
      weight: record.weight,
      price: record.price,
      batch_id: record.batch_id,
      _synced: record._synced,
      _deleted: record._deleted,
      created_at: record.created_at,
      store_id: record.store_id
    });
    
    // Check dependencies
    console.log('\n🔍 Checking dependencies...');
    
    // Check if product exists
    const product = await db.products.get(record.product_id);
    if (product) {
      console.log('✅ Product found:', {
        id: product.id,
        name: product.name,
        _synced: product._synced
      });
    } else {
      console.error('❌ Product not found:', record.product_id);
    }
    
    // Check if supplier exists
    const supplier = await db.suppliers.get(record.supplier_id);
    if (supplier) {
      console.log('✅ Supplier found:', {
        id: supplier.id,
        name: supplier.name,
        _synced: supplier._synced
      });
    } else {
      console.error('❌ Supplier not found:', record.supplier_id);
    }
    
    // Check if batch exists (if provided)
    if (record.batch_id) {
      const batch = await db.inventory_bills.get(record.batch_id);
      if (batch) {
        console.log('✅ Batch found:', {
          id: batch.id,
          type: batch.type,
          status: batch.status,
          _synced: batch._synced
        });
      } else {
        console.error('❌ Batch not found:', record.batch_id);
      }
    } else {
      console.log('ℹ️ No batch_id provided (optional)');
    }
    
    // Validate the record
    console.log('\n🔍 Validating record...');
    const validation = await validateInventoryItem(record, db);
    
    if (validation.valid) {
      console.log('✅ Record validation passed');
    } else {
      console.log('❌ Record validation failed:', validation.errors);
    }
    
    // Check if dependencies are synced
    console.log('\n🔍 Checking dependency sync status...');
    const dependencyCheck = await checkDependencySyncStatus(record, db);
    
    if (dependencyCheck.allSynced) {
      console.log('✅ All dependencies are synced');
    } else {
      console.log('❌ Some dependencies are not synced:', dependencyCheck.unsyncedDeps);
    }
    
    // Suggest fixes
    console.log('\n💡 Suggested fixes:');
    if (!validation.valid) {
      console.log('1. Fix validation errors:', validation.errors);
    }
    if (!dependencyCheck.allSynced) {
      console.log('2. Wait for dependencies to sync or fix dependency issues');
    }
    if (validation.valid && dependencyCheck.allSynced) {
      console.log('3. Try manual sync or check network connection');
    }
    
    return {
      record,
      validation,
      dependencyCheck
    };
    
  } catch (error) {
    console.error('❌ Error during debug:', error);
    return null;
  }
}

async function validateInventoryItem(record, db) {
  const errors = [];
  
  // Check quantity constraint
  if (record.quantity < 0) {
    errors.push('Quantity is negative');
  }
  
  // Check required fields
  if (!record.product_id) {
    errors.push('Missing product_id');
  }
  
  if (!record.supplier_id) {
    errors.push('Missing supplier_id');
  }
  
  if (record.quantity === undefined || record.quantity === null) {
    errors.push('Missing quantity');
  }
  
  // Check if product exists
  if (record.product_id) {
    const product = await db.products.get(record.product_id);
    if (!product) {
      errors.push(`Referenced product ${record.product_id} not found`);
    }
  }
  
  // Check if supplier exists
  if (record.supplier_id) {
    const supplier = await db.suppliers.get(record.supplier_id);
    if (!supplier) {
      errors.push(`Referenced supplier ${record.supplier_id} not found`);
    }
  }
  
  // Check if batch exists (if provided)
  if (record.batch_id) {
    const batch = await db.inventory_bills.get(record.batch_id);
    if (!batch) {
      errors.push(`Referenced batch ${record.batch_id} not found`);
    }
  }
  
  return {
    valid: errors.length === 0,
    errors
  };
}

async function checkDependencySyncStatus(record, db) {
  const unsyncedDeps = [];
  
  // Check product sync status
  if (record.product_id) {
    const product = await db.products.get(record.product_id);
    if (product && !product._synced) {
      unsyncedDeps.push(`Product ${product.name} (${product.id})`);
    }
  }
  
  // Check supplier sync status
  if (record.supplier_id) {
    const supplier = await db.suppliers.get(record.supplier_id);
    if (supplier && !supplier._synced) {
      unsyncedDeps.push(`Supplier ${supplier.name} (${supplier.id})`);
    }
  }
  
  // Check batch sync status (if provided)
  if (record.batch_id) {
    const batch = await db.inventory_bills.get(record.batch_id);
    if (batch && !batch._synced) {
      unsyncedDeps.push(`Batch ${batch.id} (${batch.type})`);
    }
  }
  
  return {
    allSynced: unsyncedDeps.length === 0,
    unsyncedDeps
  };
}

// Make functions available globally
window.debugSpecificInventoryItem = debugSpecificInventoryItem;
window.validateInventoryItem = validateInventoryItem;
window.checkDependencySyncStatus = checkDependencySyncStatus;

console.log('🔧 Specific item debug script loaded. Run debugSpecificInventoryItem() to analyze the unsynced record.');
