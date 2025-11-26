// Entity Migration Service Tests
// Tests for Phase 2 of Accounting Foundation Migration

import { db } from '../../lib/db';
import { entityMigrationService } from '../entityMigrationService';
import { SYSTEM_ENTITY_IDS } from '../../constants/systemEntities';

// Mock data for testing
const mockStoreId = 'test-store-123';
const mockCustomers = [
  {
    id: 'customer-1',
    store_id: mockStoreId,
    name: 'John Doe',
    phone: '+1234567890',
    lb_balance: 1000,
    usd_balance: 50,
    lb_max_balance: 5000,
    is_active: true,
    created_at: '2024-01-01T00:00:00Z',
    updated_at: '2024-01-01T00:00:00Z',
    _synced: false
  },
  {
    id: 'customer-2',
    store_id: mockStoreId,
    name: 'Jane Smith',
    phone: '+0987654321',
    lb_balance: 2000,
    usd_balance: 100,
    lb_max_balance: 10000,
    is_active: true,
    created_at: '2024-01-02T00:00:00Z',
    updated_at: '2024-01-02T00:00:00Z',
    _synced: false
  }
];

const mockSuppliers = [
  {
    id: 'supplier-1',
    store_id: mockStoreId,
    name: 'ABC Supplies',
    phone: '+1111111111',
    type: 'wholesale',
    lb_balance: 3000,
    usd_balance: 150,
    advance_lb_balance: 500,
    advance_usd_balance: 25,
    is_active: true,
    created_at: '2024-01-01T00:00:00Z',
    updated_at: '2024-01-01T00:00:00Z',
    _synced: false
  }
];

const mockEmployees = [
  {
    id: 'employee-1',
    store_id: mockStoreId,
    name: 'Alice Manager',
    email: 'alice@example.com',
    phone: '+2222222222',
    role: 'manager',
    lbp_balance: 500,
    usd_balance: 25,
    is_active: true,
    created_at: '2024-01-01T00:00:00Z',
    updated_at: '2024-01-01T00:00:00Z',
    _synced: false
  }
];

/**
 * Test Entity Migration Service
 * This is a manual test function that can be called to verify migration works
 */
export async function testEntityMigration(): Promise<void> {
  console.log('🧪 Starting Entity Migration Tests...');
  
  try {
    // 1. Clean up any existing test data
    console.log('🧹 Cleaning up existing test data...');
    await db.transaction('rw', [db.customers, db.suppliers, db.users, db.entities], async () => {
      await db.customers.where('store_id').equals(mockStoreId).delete();
      await db.suppliers.where('store_id').equals(mockStoreId).delete();
      await db.users.where('store_id').equals(mockStoreId).delete();
      await db.entities.where('store_id').equals(mockStoreId).delete();
    });
    
    // 2. Insert mock data
    console.log('📝 Inserting mock data...');
    await db.transaction('rw', [db.customers, db.suppliers, db.users], async () => {
      await db.customers.bulkAdd(mockCustomers);
      await db.suppliers.bulkAdd(mockSuppliers);
      await db.users.bulkAdd(mockEmployees);
    });
    
    // 3. Verify initial state
    console.log('🔍 Verifying initial state...');
    const initialCounts = {
      customers: await db.customers.where('store_id').equals(mockStoreId).count(),
      suppliers: await db.suppliers.where('store_id').equals(mockStoreId).count(),
      employees: await db.users.where('store_id').equals(mockStoreId).count(),
      entities: await db.entities.where('store_id').equals(mockStoreId).count()
    };
    
    console.log('Initial counts:', initialCounts);
    
    if (initialCounts.customers !== 2 || initialCounts.suppliers !== 1 || initialCounts.employees !== 1) {
      throw new Error('Failed to insert mock data correctly');
    }
    
    if (initialCounts.entities !== 0) {
      throw new Error('Entities table should be empty before migration');
    }
    
    // 4. Check migration status (should be false)
    console.log('📊 Checking migration status...');
    const isInitiallyMigrated = await entityMigrationService.isMigrationCompleted(mockStoreId);
    if (isInitiallyMigrated) {
      throw new Error('Migration should not be completed initially');
    }
    
    // 5. Run migration
    console.log('🚀 Running entity migration...');
    const migrationResult = await entityMigrationService.migrateToEntities(mockStoreId);
    
    console.log('Migration result:', migrationResult);
    
    if (!migrationResult.success) {
      throw new Error(`Migration failed: ${migrationResult.errors.join(', ')}`);
    }
    
    // 6. Verify migration results
    console.log('✅ Verifying migration results...');
    
    if (migrationResult.customersCount !== 2) {
      throw new Error(`Expected 2 customers migrated, got ${migrationResult.customersCount}`);
    }
    
    if (migrationResult.suppliersCount !== 1) {
      throw new Error(`Expected 1 supplier migrated, got ${migrationResult.suppliersCount}`);
    }
    
    if (migrationResult.employeesCount !== 1) {
      throw new Error(`Expected 1 employee migrated, got ${migrationResult.employeesCount}`);
    }
    
    if (migrationResult.systemEntitiesCount < 4) {
      throw new Error(`Expected at least 4 system entities, got ${migrationResult.systemEntitiesCount}`);
    }
    
    // 7. Check migration status (should be true now)
    const isMigratedAfter = await entityMigrationService.isMigrationCompleted(mockStoreId);
    if (!isMigratedAfter) {
      throw new Error('Migration should be completed after running migration');
    }
    
    // 8. Verify entity data integrity
    console.log('🔍 Verifying entity data integrity...');
    const verification = await entityMigrationService.verifyMigration(mockStoreId);
    
    console.log('Verification result:', verification);
    
    if (!verification.success) {
      throw new Error(`Verification failed: ${verification.issues.join(', ')}`);
    }
    
    // 9. Test specific entity retrieval
    console.log('🎯 Testing entity retrieval...');
    
    // Test customer entity
    const customerEntity = await entityMigrationService.getEntityById('customer-1');
    if (!customerEntity || customerEntity.entity_type !== 'customer' || customerEntity.name !== 'John Doe') {
      throw new Error('Customer entity not found or incorrect');
    }
    
    // Test supplier entity (balance should be negative)
    const supplierEntity = await entityMigrationService.getEntityById('supplier-1');
    if (!supplierEntity || supplierEntity.entity_type !== 'supplier' || supplierEntity.lb_balance !== -3000) {
      throw new Error('Supplier entity not found or balance incorrect');
    }
    
    // Test system entity
    const cashEntity = await db.entities.get(SYSTEM_ENTITY_IDS.CASH_CUSTOMER);
    if (!cashEntity || !cashEntity.is_system_entity || cashEntity.entity_code !== 'CASH') {
      throw new Error('Cash system entity not found or incorrect');
    }
    
    // 10. Test entities by type
    console.log('📋 Testing entities by type...');
    const customers = await entityMigrationService.getEntitiesByType(mockStoreId, 'customer');
    const suppliers = await entityMigrationService.getEntitiesByType(mockStoreId, 'supplier');
    const employees = await entityMigrationService.getEntitiesByType(mockStoreId, 'employee');
    
    if (customers.length !== 2 || suppliers.length !== 1 || employees.length !== 1) {
      throw new Error('Incorrect entity counts by type');
    }
    
    // 11. Test duplicate migration (should not create duplicates)
    console.log('🔄 Testing duplicate migration prevention...');
    const duplicateMigration = await entityMigrationService.migrateToEntities(mockStoreId);
    
    if (!duplicateMigration.success || !duplicateMigration.errors.includes('Migration already completed for this store')) {
      throw new Error('Duplicate migration should be prevented');
    }
    
    console.log('✅ All Entity Migration Tests Passed!');
    
    // Clean up test data
    console.log('🧹 Cleaning up test data...');
    await db.transaction('rw', [db.customers, db.suppliers, db.users, db.entities], async () => {
      await db.customers.where('store_id').equals(mockStoreId).delete();
      await db.suppliers.where('store_id').equals(mockStoreId).delete();
      await db.users.where('store_id').equals(mockStoreId).delete();
      await db.entities.where('store_id').equals(mockStoreId).delete();
    });
    
    console.log('🎉 Entity Migration Service Tests Completed Successfully!');
    
  } catch (error) {
    console.error('❌ Entity Migration Test Failed:', error);
    
    // Clean up on failure
    try {
      await db.transaction('rw', [db.customers, db.suppliers, db.users, db.entities], async () => {
        await db.customers.where('store_id').equals(mockStoreId).delete();
        await db.suppliers.where('store_id').equals(mockStoreId).delete();
        await db.users.where('store_id').equals(mockStoreId).delete();
        await db.entities.where('store_id').equals(mockStoreId).delete();
      });
    } catch (cleanupError) {
      console.error('Failed to clean up test data:', cleanupError);
    }
    
    throw error;
  }
}

/**
 * Test Branch-Aware Cash Drawer Operations
 * This tests that cash drawer operations work correctly with branch IDs
 */
export async function testBranchAwareCashDrawer(): Promise<void> {
  console.log('🧪 Starting Branch-Aware Cash Drawer Tests...');
  
  try {
    const testStoreId = 'test-store-cash-drawer';
    const testBranchId = 'test-branch-001';
    
    // Clean up any existing test data
    await db.transaction('rw', [db.cash_drawer_accounts, db.cash_drawer_sessions], async () => {
      await db.cash_drawer_accounts.where('store_id').equals(testStoreId).delete();
      await db.cash_drawer_sessions.where('store_id').equals(testStoreId).delete();
    });
    
    // Test 1: Get cash drawer account (should not exist initially)
    console.log('🔍 Testing cash drawer account retrieval...');
    const initialAccount = await db.getCashDrawerAccount(testStoreId, testBranchId);
    if (initialAccount) {
      throw new Error('Cash drawer account should not exist initially');
    }
    
    // Test 2: Get current session (should not exist initially)
    console.log('🔍 Testing cash drawer session retrieval...');
    const initialSession = await db.getCurrentCashDrawerSession(testStoreId, testBranchId);
    if (initialSession) {
      throw new Error('Cash drawer session should not exist initially');
    }
    
    // Test 3: Get current status (should return null)
    console.log('🔍 Testing cash drawer status...');
    const initialStatus = await db.getCurrentCashDrawerStatus(testStoreId, testBranchId);
    if (initialStatus) {
      throw new Error('Cash drawer status should be null initially');
    }
    
    console.log('✅ Branch-Aware Cash Drawer Tests Passed!');
    
    // Clean up
    await db.transaction('rw', [db.cash_drawer_accounts, db.cash_drawer_sessions], async () => {
      await db.cash_drawer_accounts.where('store_id').equals(testStoreId).delete();
      await db.cash_drawer_sessions.where('store_id').equals(testStoreId).delete();
    });
    
    console.log('🎉 Branch-Aware Cash Drawer Tests Completed Successfully!');
    
  } catch (error) {
    console.error('❌ Branch-Aware Cash Drawer Test Failed:', error);
    throw error;
  }
}

// Export test functions for manual execution
export const entityMigrationTests = {
  testEntityMigration,
  testBranchAwareCashDrawer
};
