// Debug script to identify unsynced objects
// Run this in the browser console to debug sync issues

async function debugUnsyncedObjects() {
  console.log('🔍 Debugging unsynced objects...');
  
  const tableNames = [
    'stores', 'products', 'suppliers', 'customers', 'cash_drawer_accounts',
    'inventory_bills', 'inventory_items', 'transactions', 'bills',
    'bill_line_items', 'bill_audit_logs', 'cash_drawer_sessions'
  ];
  
  const results = {};
  let totalUnsynced = 0;
  
  for (const tableName of tableNames) {
    try {
      // Access the database through the global context
      const db = window.db || (window.OfflineDataContext && window.OfflineDataContext.db);
      if (!db) {
        console.error('❌ Database not accessible. Make sure the app is loaded.');
        return;
      }
      
      const table = db[tableName];
      if (!table) {
        console.log(`⚠️ Table ${tableName} not found`);
        continue;
      }
      
      const unsyncedRecords = await table.filter(item => !item._synced).toArray();
      const count = unsyncedRecords.length;
      
      if (count > 0) {
        results[tableName] = {
          count,
          records: unsyncedRecords
        };
        totalUnsynced += count;
        
        console.log(`📊 ${tableName}: ${count} unsynced records`);
        
        // Log details for each unsynced record
        unsyncedRecords.forEach((record, index) => {
          console.log(`  Record ${index + 1}:`, {
            id: record.id,
            _synced: record._synced,
            _deleted: record._deleted,
            created_at: record.created_at,
            // Log key fields based on table type
            ...(tableName === 'inventory_items' && {
              product_id: record.product_id,
              supplier_id: record.supplier_id,
              quantity: record.quantity,
              batch_id: record.batch_id
            }),
            ...(tableName === 'bill_line_items' && {
              bill_id: record.bill_id,
              product_id: record.product_id,
              supplier_id: record.supplier_id,
              quantity: record.quantity
            }),
            ...(tableName === 'bills' && {
              bill_number: record.bill_number,
              status: record.status,
              total_amount: record.total_amount
            }),
            ...(tableName === 'transactions' && {
              amount: record.amount,
              type: record.type,
              reference: record.reference
            })
          });
        });
      }
    } catch (error) {
      console.error(`❌ Error checking ${tableName}:`, error);
    }
  }
  
  console.log(`\n📈 Total unsynced records: ${totalUnsynced}`);
  
  if (totalUnsynced > 0) {
    console.log('\n🔍 Detailed analysis:');
    
    // Check for common issues
    for (const [tableName, data] of Object.entries(results)) {
      console.log(`\n📋 ${tableName} analysis:`);
      
      if (tableName === 'inventory_items') {
        // Check for validation issues
        for (const record of data.records) {
          const issues = [];
          
          if (record.quantity < 0) {
            issues.push('Negative quantity');
          }
          
          if (!record.product_id) {
            issues.push('Missing product_id');
          }
          
          if (!record.supplier_id) {
            issues.push('Missing supplier_id');
          }
          
          if (issues.length > 0) {
            console.log(`  ❌ Record ${record.id} has issues: ${issues.join(', ')}`);
          } else {
            console.log(`  ✅ Record ${record.id} looks valid`);
          }
        }
      }
      
      if (tableName === 'bill_line_items') {
        // Check for validation issues
        for (const record of data.records) {
          const issues = [];
          
          if (!record.bill_id) {
            issues.push('Missing bill_id');
          }
          
          if (!record.product_id) {
            issues.push('Missing product_id');
          }
          
          if (!record.supplier_id) {
            issues.push('Missing supplier_id');
          }
          
          if (!record.quantity || record.quantity <= 0) {
            issues.push('Invalid quantity');
          }
          
          if (issues.length > 0) {
            console.log(`  ❌ Record ${record.id} has issues: ${issues.join(', ')}`);
          } else {
            console.log(`  ✅ Record ${record.id} looks valid`);
          }
        }
      }
    }
  }
  
  return results;
}

// Make it available globally
window.debugUnsyncedObjects = debugUnsyncedObjects;

console.log('🔧 Debug script loaded. Run debugUnsyncedObjects() in the console to debug sync issues.');
