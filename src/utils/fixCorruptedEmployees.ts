/**
 * Utility to fix corrupted employee records in IndexedDB
 * 
 * Issue: Some employee records have role values (cashier/manager/admin) as field names
 * instead of as values in the 'role' field.
 * 
 * Run this in the browser console:
 * import { fixCorruptedEmployees } from './src/utils/fixCorruptedEmployees';
 * fixCorruptedEmployees();
 */

import { db } from '../lib/db';

export async function fixCorruptedEmployees() {
  console.log('🔧 Starting to fix corrupted employee records...');
  
  try {
    const allUsers = await db.users.toArray();
    console.log(`📊 Found ${allUsers.length} total employee records`);
    
    let fixedCount = 0;
    let corruptedCount = 0;
    
    for (const user of allUsers) {
      let needsUpdate = false;
      const updates: any = {};
      
      // Check if role field is missing or invalid
      if (!user.role || typeof user.role !== 'string') {
        corruptedCount++;
        console.warn(`❌ Corrupted employee found: ${user.id} (${user.name}) - missing role field`);
        
        // Check if there's a role value as a field name
        const userAny = user as any;
        if (userAny.cashier !== undefined) {
          updates.role = 'cashier';
          needsUpdate = true;
          console.log(`  ✅ Fixed: setting role to 'cashier'`);
        } else if (userAny.manager !== undefined) {
          updates.role = 'manager';
          needsUpdate = true;
          console.log(`  ✅ Fixed: setting role to 'manager'`);
        } else if (userAny.admin !== undefined) {
          updates.role = 'admin';
          needsUpdate = true;
          console.log(`  ✅ Fixed: setting role to 'admin'`);
        } else {
          // Default to cashier if we can't determine the role
          updates.role = 'cashier';
          needsUpdate = true;
          console.log(`  ⚠️ Fixed: defaulting role to 'cashier'`);
        }
      }
      
      // Mark as unsynced if we made changes
      if (needsUpdate) {
        updates._synced = false;
        updates.updated_at = new Date().toISOString();
        
        await db.users.update(user.id, updates);
        fixedCount++;
        console.log(`  ✅ Updated employee: ${user.id}`);
      }
    }
    
    console.log(`\n✅ Completed fixing employees:`);
    console.log(`   - Total records: ${allUsers.length}`);
    console.log(`   - Corrupted found: ${corruptedCount}`);
    console.log(`   - Fixed: ${fixedCount}`);
    
    if (fixedCount > 0) {
      console.log(`\n⚠️ ${fixedCount} employees were marked as unsynced and will be synced to Supabase`);
    }
    
    return {
      total: allUsers.length,
      corrupted: corruptedCount,
      fixed: fixedCount
    };
  } catch (error) {
    console.error('❌ Error fixing corrupted employees:', error);
    throw error;
  }
}

// Also export a function to check for corrupted records without fixing
export async function checkForCorruptedEmployees() {
  console.log('🔍 Checking for corrupted employee records...');
  
  const allUsers = await db.users.toArray();
  const corrupted = allUsers.filter(user => {
    if (!user.role || typeof user.role !== 'string') {
      return true;
    }
    const userAny = user as any;
    return userAny.cashier !== undefined || userAny.manager !== undefined || userAny.admin !== undefined;
  });
  
  console.log(`📊 Found ${corrupted.length} corrupted records out of ${allUsers.length} total`);
  
  if (corrupted.length > 0) {
    console.log('❌ Corrupted records:', corrupted);
  }
  
  return corrupted;
}




