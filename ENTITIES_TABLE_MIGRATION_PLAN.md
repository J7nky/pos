# Entities Table Migration Plan
## Complete Replacement of Customers, Suppliers, and Employees Tables

**Date:** December 2024  
**Priority:** 🔥 HIGH - Consolidate to single source of truth  
**Estimated Effort:** 3-4 weeks  
**Risk Level:** MEDIUM (Well-tested migration path exists)

**Current Status:** 🔄 **Phase 2 In Progress** (40% Complete)
- ✅ Phase 1: Complete
- 🔄 Phase 2: Service Layer 40% (2/5 services updated)
- ⏳ Phase 2: Component Layer 0% (Pending)
- ⏳ Phase 3: Not Started
- 🔄 Phase 4: Testing 50% (Infrastructure ready, tests pending)

**Last Updated:** December 2024

---

## Executive Summary

This plan outlines the complete migration from separate `customers`, `suppliers`, and `employees` tables to the unified `entities` table. The entities table already exists and is being used alongside the legacy tables. This migration will:

1. ✅ **Eliminate data duplication** - Single source of truth for all entity data
2. ✅ **Simplify codebase** - Remove legacy table references
3. ✅ **Improve performance** - Single table with optimized indexes
4. ✅ **Enable unified features** - Consistent entity management across types
5. ✅ **Reduce sync complexity** - One table to sync instead of three

**Current State:**
- `entities` table exists and is populated
- Legacy tables (`customers`, `suppliers`, `employees`) still exist and are being updated
- Dual-write pattern in place for backward compatibility
- `entityQueryService` provides unified query interface
- `legacyCompatibilityService` provides backward compatibility layer

**Target State:**
- All entity data in `entities` table only
- Legacy tables removed from database schema
- All code references updated to use `entities` table
- No backward compatibility layer needed

---

## Migration Strategy

### Phase 1: Audit & Preparation (Week 1) ✅ COMPLETE

**Goal:** Identify all usages of legacy tables and prepare migration scripts

**Status:** ✅ **COMPLETE**
- ✅ Audit completed (39 files using customers, 43 files using suppliers, 18 files using users)
- ✅ Verification script created (`verifyEntitiesMigration.ts`)
- ✅ Migration script created (`migrateToEntitiesOnly.ts`)
- ✅ Test runner created (`runMigrationTest.ts`)
- ✅ Migration test page created (`/migration-test`)
- ✅ All entities verified as migrated (verification passed)

#### 1.1 Audit Legacy Table Usage

**Tasks:**
1. Find all direct queries to `customers`, `suppliers`, `employees` tables
2. Identify all foreign key references (e.g., `customer_id`, `supplier_id` in other tables)
3. List all services/components that use legacy tables
4. Document any table-specific fields that need migration

**Tools:**
```bash
# Find all references to customers table
grep -r "db\.customers" apps/store-app/src
grep -r "\.customers\." apps/store-app/src
grep -r "customers:" apps/store-app/src

# Find all references to suppliers table
grep -r "db\.suppliers" apps/store-app/src
grep -r "\.suppliers\." apps/store-app/src
grep -r "suppliers:" apps/store-app/src

# Find all references to employees/users table
grep -r "db\.users" apps/store-app/src
grep -r "\.users\." apps/store-app/src
grep -r "employee" apps/store-app/src --include="*.ts" --include="*.tsx"
```

**Expected Findings:**
- Direct table queries in components (e.g., `Customers.tsx`, `Suppliers.tsx`)
- Service layer queries (e.g., `transactionService.ts`, `paymentManagementService.ts`)
- Foreign key references in:
  - `bills.customer_id`
  - `inventory_bills.supplier_id`
  - `transactions.customer_id`, `transactions.supplier_id`
  - `bill_line_items.customer_id`, `bill_line_items.supplier_id`
  - `journal_entries.entity_id` (already using entities)

#### 1.2 Create Migration Verification Script

**File:** `apps/store-app/src/scripts/verifyEntitiesMigration.ts`

```typescript
/**
 * Verification script to ensure all data is properly migrated
 */
export async function verifyEntitiesMigration(storeId: string): Promise<VerificationReport> {
  const report: VerificationReport = {
    customers: { total: 0, migrated: 0, missing: [] },
    suppliers: { total: 0, migrated: 0, missing: [] },
    employees: { total: 0, migrated: 0, missing: [] },
    foreignKeys: { valid: 0, invalid: 0, issues: [] }
  };

  // Verify customers
  const customers = await db.customers.where('store_id').equals(storeId).toArray();
  report.customers.total = customers.length;
  
  for (const customer of customers) {
    const entity = await db.entities
      .where('[store_id+id]')
      .equals([storeId, customer.id])
      .first();
    
    if (entity && entity.entity_type === 'customer') {
      report.customers.migrated++;
    } else {
      report.customers.missing.push(customer.id);
    }
  }

  // Verify suppliers
  const suppliers = await db.suppliers.where('store_id').equals(storeId).toArray();
  report.suppliers.total = suppliers.length;
  
  for (const supplier of suppliers) {
    const entity = await db.entities
      .where('[store_id+id]')
      .equals([storeId, supplier.id])
      .first();
    
    if (entity && entity.entity_type === 'supplier') {
      report.suppliers.migrated++;
    } else {
      report.suppliers.missing.push(supplier.id);
    }
  }

  // Verify employees
  const employees = await db.users.where('store_id').equals(storeId).toArray();
  report.employees.total = employees.length;
  
  for (const employee of employees) {
    const entity = await db.entities
      .where('[store_id+id]')
      .equals([storeId, employee.id])
      .first();
    
    if (entity && entity.entity_type === 'employee') {
      report.employees.migrated++;
    } else {
      report.employees.missing.push(employee.id);
    }
  }

  // Verify foreign key references
  const bills = await db.bills.where('store_id').equals(storeId).toArray();
  for (const bill of bills) {
    if (bill.customer_id) {
      const entity = await db.entities.get(bill.customer_id);
      if (entity && entity.entity_type === 'customer') {
        report.foreignKeys.valid++;
      } else {
        report.foreignKeys.invalid++;
        report.foreignKeys.issues.push({
          table: 'bills',
          recordId: bill.id,
          fkField: 'customer_id',
          fkValue: bill.customer_id,
          issue: 'Entity not found or wrong type'
        });
      }
    }
  }

  return report;
}
```

#### 1.3 Create Data Migration Script

**File:** `apps/store-app/src/scripts/migrateToEntitiesOnly.ts`

```typescript
/**
 * Final migration script to ensure all data is in entities table
 * Run this before removing legacy tables
 */
export async function migrateToEntitiesOnly(storeId: string): Promise<MigrationResult> {
  const result: MigrationResult = {
    customersMigrated: 0,
    suppliersMigrated: 0,
    employeesMigrated: 0,
    errors: []
  };

  await db.transaction('rw', [db.entities, db.customers, db.suppliers, db.users], async () => {
    // Migrate any missing customers
    const customers = await db.customers.where('store_id').equals(storeId).toArray();
    for (const customer of customers) {
      const existing = await db.entities.get(customer.id);
      if (!existing) {
        await db.entities.add({
          id: customer.id,
          store_id: storeId,
          branch_id: null,
          entity_type: 'customer',
          entity_code: `CUST-${customer.id.slice(0, 8)}`,
          name: customer.name,
          phone: customer.phone || null,
          lb_balance: customer.lb_balance || 0,
          usd_balance: customer.usd_balance || 0,
          is_system_entity: false,
          is_active: customer.is_active ?? true,
          customer_data: {
            lb_max_balance: customer.lb_max_balance || 0,
            credit_limit: customer.lb_max_balance || 0
          },
          supplier_data: null,
          created_at: customer.created_at || new Date().toISOString(),
          updated_at: customer.updated_at || new Date().toISOString(),
          _synced: customer._synced ?? false
        });
        result.customersMigrated++;
      }
    }

    // Migrate any missing suppliers
    const suppliers = await db.suppliers.where('store_id').equals(storeId).toArray();
    for (const supplier of suppliers) {
      const existing = await db.entities.get(supplier.id);
      if (!existing) {
        await db.entities.add({
          id: supplier.id,
          store_id: storeId,
          branch_id: null,
          entity_type: 'supplier',
          entity_code: `SUPP-${supplier.id.slice(0, 8)}`,
          name: supplier.name,
          phone: supplier.phone || null,
          lb_balance: supplier.lb_balance || 0,
          usd_balance: supplier.usd_balance || 0,
          is_system_entity: false,
          is_active: supplier.is_active ?? true,
          customer_data: null,
          supplier_data: {
            type: supplier.type || 'standard',
            advance_lb_balance: supplier.advance_lb_balance || 0,
            advance_usd_balance: supplier.advance_usd_balance || 0
          },
          created_at: supplier.created_at || new Date().toISOString(),
          updated_at: supplier.updated_at || new Date().toISOString(),
          _synced: supplier._synced ?? false
        });
        result.suppliersMigrated++;
      }
    }

    // Migrate any missing employees
    const employees = await db.users.where('store_id').equals(storeId).toArray();
    for (const employee of employees) {
      const existing = await db.entities.get(employee.id);
      if (!existing) {
        await db.entities.add({
          id: employee.id,
          store_id: storeId,
          branch_id: null,
          entity_type: 'employee',
          entity_code: `EMP-${employee.id.slice(0, 8)}`,
          name: employee.name || employee.email,
          phone: employee.phone || null,
          lb_balance: employee.lbp_balance || 0,
          usd_balance: employee.usd_balance || 0,
          is_system_entity: false,
          is_active: employee.is_active ?? true,
          customer_data: null,
          supplier_data: null,
          created_at: employee.created_at || new Date().toISOString(),
          updated_at: employee.updated_at || new Date().toISOString(),
          _synced: employee._synced ?? false
        });
        result.employeesMigrated++;
      }
    }
  });

  return result;
}
```

---

### Phase 2: Update Code References (Week 2) 🔄 IN PROGRESS

**Goal:** Replace all legacy table references with entities table queries

**Status:** 🔄 **IN PROGRESS** (Service layer: 2/5 complete, Component layer: 0/3 complete)

#### 2.1 Update Service Layer

**Files to Update:**

1. **`transactionService.ts`** ✅ **COMPLETE**
   - ✅ `getEntityBalance()` - Now reads from `db.entities` instead of `db.customers`/`db.suppliers`
   - ✅ `updateEntityBalancesAtomic()` - Now updates `db.entities` only (removed dual-write)
   - ✅ Transaction scope updated to use `db.entities` instead of legacy tables
   - **Files:** `apps/store-app/src/services/transactionService.ts` (lines 946-1060)

2. **`accountBalanceService.ts`** ✅ **COMPLETE**
   - ✅ `getAccountBalance()` - Now reads from `db.entities`
   - ✅ `updateCachedBalance()` - Now updates `db.entities` only
   - ✅ `reconcileAllBalances()` - Now queries `db.entities` for customers and suppliers
   - **Files:** `apps/store-app/src/services/accountBalanceService.ts` (lines 45-396)

3. **`paymentManagementService.ts`** ⏳ **PENDING**
   - Remove any direct `customers`/`suppliers` table queries
   - Use `entityQueryService` instead

4. **`inventoryPurchaseService.ts`** ⏳ **PENDING**
   - Update supplier queries to use `entities` table
   - Use `entityQueryService.getSuppliers()`

5. **`cashDrawerUpdateService.ts`** ⏳ **PENDING**
   - Verify no legacy table dependencies

6. **`employeeService.ts`** ⏳ **PENDING**
   - Update to use `db.entities` with `entity_type='employee'`
   - Or use `entityQueryService.getEmployees()`

**Testing:**
- ✅ Test script created (`testServiceLayerMigration.ts`)
- ✅ Test page updated with "Service Layer Tests" tab
- ⏳ Tests need to be run to verify changes

**Example Update Pattern:**

```typescript
// BEFORE (transactionService.ts)
private async updateEntityBalancesAtomic(...) {
  if (transaction.customer_id) {
    await db.customers.update(transaction.customer_id, updateData);
    // Also update entities table
    await db.entities.update(entityId, updateData);
  }
  if (transaction.supplier_id) {
    await db.suppliers.update(transaction.supplier_id, updateData);
    // Also update entities table
    await db.entities.update(entityId, updateData);
  }
}

// AFTER
private async updateEntityBalancesAtomic(...) {
  // Get entity ID from customer_id or supplier_id
  const entityId = transaction.customer_id || transaction.supplier_id;
  if (entityId) {
    // Only update entities table
    await db.entities.update(entityId, {
      [currency === 'USD' ? 'usd_balance' : 'lb_balance']: newBalance,
      updated_at: new Date().toISOString(),
      _synced: false
    });
  }
}
```

#### 2.2 Update Component Layer ⏳ **PENDING**

**Files to Update:**

1. **`Customers.tsx`** ⏳ **PENDING**
   - Replace `raw.customers` with `entityQueryService.getCustomers()`
   - Update `addCustomer` to create entity directly
   - Update `updateCustomer` to update entity
   - **File:** `apps/store-app/src/pages/Customers.tsx`

2. **`Suppliers.tsx`** (if exists) ⏳ **PENDING**
   - Similar updates as Customers.tsx

3. **`OfflineDataContext.tsx`** ⏳ **PENDING** (CRITICAL)
   - Remove `customers`, `suppliers` from state (line 38-39)
   - Load entities instead
   - Update `addCustomer`, `addSupplier` methods
   - Update `updateCustomer`, `updateSupplier` methods
   - Remove `deleteCustomer`, `deleteSupplier` (use entity soft delete)
   - **File:** `apps/store-app/src/contexts/OfflineDataContext.tsx`

**Example Update Pattern:**

```typescript
// BEFORE (OfflineDataContext.tsx)
const [customers, setCustomers] = useState<Customer[]>([]);
const [suppliers, setSuppliers] = useState<Supplier[]>([]);

const customersData = await crudHelper.getEntitiesByStore('customers', storeId);
setCustomers(customersData || []);

// AFTER
const [entities, setEntities] = useState<Entity[]>([]);

const entitiesData = await crudHelper.getEntitiesByStoreBranch('entities', storeId, branchId);
setEntities(entitiesData || []);

// Get customers/suppliers from entities
const customers = entities.filter(e => e.entity_type === 'customer');
const suppliers = entities.filter(e => e.entity_type === 'supplier');
```

#### 2.3 Update Foreign Key References

**Tables with Foreign Keys:**

1. **`bills.customer_id`** - Keep as is (references entity.id)
2. **`inventory_bills.supplier_id`** - Keep as is (references entity.id)
3. **`transactions.customer_id`** - Keep as is (references entity.id)
4. **`transactions.supplier_id`** - Keep as is (references entity.id)
5. **`bill_line_items.customer_id`** - Keep as is (references entity.id)
6. **`bill_line_items.supplier_id`** - Keep as is (references entity.id)

**No changes needed** - These already reference entity IDs (same UUIDs)

---

### Phase 3: Remove Legacy Tables (Week 3) ⏳ **NOT STARTED**

**Goal:** Remove legacy tables from database schema and code

**Status:** ⏳ **NOT STARTED** - Waiting for Phase 2 completion

#### 3.1 Update Database Schema

**File:** `apps/store-app/src/lib/db.ts`

**Changes:**
1. Remove `customers`, `suppliers` table definitions
2. Keep `users` table (still needed for authentication, but remove employee-specific fields)
3. Update version number
4. Create migration to drop tables

**Example:**

```typescript
// BEFORE
this.version(19).stores({
  customers: 'id, store_id, name, phone, updated_at, lb_balance, usd_balance, _synced, _deleted',
  suppliers: 'id, store_id, name, type, updated_at, lb_balance, usd_balance, advance_lb_balance, advance_usd_balance, _synced, _deleted',
  users: 'id, store_id, email, name, role, updated_at, lbp_balance, usd_balance, working_hours_start, working_hours_end, working_days, _synced, _deleted',
  entities: 'id, store_id, branch_id, entity_type, entity_code, name, phone, updated_at, _synced, _deleted',
  // ...
});

// AFTER
this.version(20).stores({
  // customers table removed
  // suppliers table removed
  users: 'id, store_id, email, name, role, updated_at, _synced, _deleted', // Removed balance fields
  entities: 'id, store_id, branch_id, entity_type, entity_code, name, phone, updated_at, _synced, _deleted',
  // ...
}).upgrade(async (trans) => {
  // Migration: Drop customers and suppliers tables
  // Data already migrated to entities table
  await trans.table('customers').clear();
  await trans.table('suppliers').clear();
});
```

#### 3.2 Update Type Definitions

**File:** `apps/store-app/src/types/index.ts` (or wherever Customer/Supplier types are defined)

**Changes:**
1. Mark `Customer` and `Supplier` interfaces as deprecated
2. Add migration notes
3. Update imports to use `Entity` type

```typescript
/**
 * @deprecated Use Entity type with entity_type='customer' instead
 * This type is kept for backward compatibility during migration
 */
export interface Customer {
  // ... existing fields
}

/**
 * @deprecated Use Entity type with entity_type='supplier' instead
 * This type is kept for backward compatibility during migration
 */
export interface Supplier {
  // ... existing fields
}
```

#### 3.3 Remove Legacy Compatibility Service

**File:** `apps/store-app/src/services/legacyCompatibilityService.ts`

**Action:** Delete or mark entire file as deprecated

**Note:** This service was created for backward compatibility. Once migration is complete, it's no longer needed.

#### 3.4 Update Sync Service

**File:** `apps/store-app/src/services/syncService.ts`

**Changes:**
1. Remove `customers` and `suppliers` from sync tables list
2. Update sync order to only include `entities`
3. Remove any special handling for legacy tables

```typescript
// BEFORE
const tablesToSync = [
  'stores',
  'products',
  'customers',  // Remove
  'suppliers',  // Remove
  'entities',   // Keep
  // ...
];

// AFTER
const tablesToSync = [
  'stores',
  'products',
  'entities',   // Unified entity management
  // ...
];
```

#### 3.5 Update Supabase Schema

**File:** `supabase_accounting_foundation_migration.sql` or new migration file

**SQL Migration:**

```sql
-- Migration: Remove customers and suppliers tables
-- Data has been migrated to entities table

-- Step 1: Verify all data is migrated
DO $$
DECLARE
  customer_count INTEGER;
  supplier_count INTEGER;
  entity_customer_count INTEGER;
  entity_supplier_count INTEGER;
BEGIN
  SELECT COUNT(*) INTO customer_count FROM public.customers;
  SELECT COUNT(*) INTO supplier_count FROM public.suppliers;
  SELECT COUNT(*) INTO entity_customer_count FROM public.entities WHERE entity_type = 'customer';
  SELECT COUNT(*) INTO entity_supplier_count FROM public.entities WHERE entity_type = 'supplier';
  
  IF customer_count != entity_customer_count THEN
    RAISE EXCEPTION 'Customer migration incomplete: % customers in legacy table, % in entities table', 
      customer_count, entity_customer_count;
  END IF;
  
  IF supplier_count != entity_supplier_count THEN
    RAISE EXCEPTION 'Supplier migration incomplete: % suppliers in legacy table, % in entities table', 
      supplier_count, entity_supplier_count;
  END IF;
END $$;

-- Step 2: Drop foreign key constraints (if any)
-- Note: Most FKs already reference entities table, but check for any remaining

-- Step 3: Drop tables
DROP TABLE IF EXISTS public.customers CASCADE;
DROP TABLE IF EXISTS public.suppliers CASCADE;

-- Step 4: Update RLS policies (if any reference customers/suppliers)
-- Remove any policies that reference the dropped tables
```

---

### Phase 4: Testing & Verification (Week 4) 🔄 **IN PROGRESS**

**Goal:** Comprehensive testing to ensure migration is successful

**Status:** 🔄 **IN PROGRESS**
- ✅ Test scripts created
- ✅ Migration test page created
- ✅ Service layer test script created
- ⏳ Tests need to be run and verified
- ⏳ Manual testing checklist pending

#### 4.1 Unit Tests

**Test Files to Update/Create:**

1. **`entityQueryService.test.ts`**
   - Test all query methods
   - Verify no legacy table dependencies

2. **`transactionService.test.ts`**
   - Test balance updates use entities only
   - Verify no dual-write to legacy tables

3. **`migration.test.ts`** (NEW)
   - Test data migration script
   - Test verification script
   - Test foreign key integrity

#### 4.2 Integration Tests

**Test Scenarios:**

1. **Customer Operations**
   - Create customer → Verify in entities table only
   - Update customer → Verify entities table updated
   - Delete customer → Verify soft delete in entities
   - Customer balance updates → Verify entities table only

2. **Supplier Operations**
   - Create supplier → Verify in entities table only
   - Update supplier → Verify entities table updated
   - Delete supplier → Verify soft delete in entities
   - Supplier balance updates → Verify entities table only

3. **Employee Operations**
   - Create employee → Verify in entities table only
   - Update employee → Verify entities table updated
   - Employee balance updates → Verify entities table only

4. **Transaction Operations**
   - Customer payment → Verify balance in entities only
   - Supplier payment → Verify balance in entities only
   - Bill creation → Verify customer_id references entity
   - Inventory bill → Verify supplier_id references entity

5. **Sync Operations**
   - Sync entities table → Verify sync works
   - Verify no sync errors for removed tables

#### 4.3 Manual Testing Checklist

- [ ] Create new customer → Appears in entities table
- [ ] Update customer balance → Entities table updated
- [ ] Create bill with customer → Customer reference works
- [ ] Create new supplier → Appears in entities table
- [ ] Update supplier balance → Entities table updated
- [ ] Create inventory bill with supplier → Supplier reference works
- [ ] Search customers → Returns entities with type='customer'
- [ ] Search suppliers → Returns entities with type='supplier'
- [ ] Customer account statement → Uses entities table
- [ ] Supplier account statement → Uses entities table
- [ ] Sync to Supabase → Only entities table synced
- [ ] No console errors about missing customers/suppliers tables

---

## Rollback Plan

If issues are discovered after migration:

### Option 1: Revert Code Changes
- Restore previous version from git
- Legacy tables still exist in database (if not dropped)
- Re-enable dual-write pattern

### Option 2: Restore Tables from Backup
- Restore `customers` and `suppliers` tables from backup
- Re-run migration script to populate entities
- Fix any issues before re-attempting removal

### Option 3: Gradual Rollback
- Keep entities table as primary
- Re-create legacy tables as read-only views
- Gradually fix issues before final removal

---

## Success Criteria

✅ **Data Integrity:**
- All customers migrated to entities table
- All suppliers migrated to entities table
- All employees migrated to entities table
- No data loss during migration
- Foreign key references remain valid

✅ **Code Quality:**
- No references to `db.customers` in codebase
- No references to `db.suppliers` in codebase
- All queries use `entityQueryService` or `db.entities`
- Legacy compatibility service removed

✅ **Performance:**
- Query performance maintained or improved
- Sync performance improved (fewer tables)
- No regression in balance calculations

✅ **Testing:**
- All unit tests pass
- All integration tests pass
- Manual testing checklist complete
- No console errors or warnings

---

## Timeline Summary

| Week | Phase | Deliverable | Status |
|------|-------|-------------|--------|
| 1 | Audit & Preparation | Migration scripts, verification tools | ✅ **COMPLETE** |
| 2 | Update Code References | All services/components use entities | 🔄 **IN PROGRESS** (40% complete) |
| 3 | Remove Legacy Tables | Tables removed from schema | ⏳ **NOT STARTED** |
| 4 | Testing & Verification | All tests pass, migration verified | 🔄 **IN PROGRESS** (50% complete) |

**Current Progress:** Phase 2 - Service Layer (2/5 services updated, Component layer pending)

**Next Steps:**
1. ⏳ Test service layer changes (`transactionService.ts`, `accountBalanceService.ts`)
2. ⏳ Update remaining services (`paymentManagementService.ts`, `inventoryPurchaseService.ts`, `employeeService.ts`)
3. ⏳ Update component layer (`OfflineDataContext.tsx`, `Customers.tsx`)
4. ⏳ Remove legacy tables (Phase 3)
5. ⏳ Final testing and verification (Phase 4)

---

## Risks & Mitigation

### Risk 1: Data Loss During Migration
- **Mitigation:** Comprehensive backup before migration
- **Mitigation:** Verification script to check data integrity
- **Mitigation:** Gradual migration with rollback capability

### Risk 2: Breaking Existing Functionality
- **Mitigation:** Comprehensive testing before removal
- **Mitigation:** Keep legacy types as deprecated during transition
- **Mitigation:** Monitor error logs after deployment

### Risk 3: Performance Regression
- **Mitigation:** Performance benchmarks before/after
- **Mitigation:** Optimize entity queries with proper indexes
- **Mitigation:** Monitor query performance metrics

### Risk 4: Sync Issues
- **Mitigation:** Test sync with Supabase before removal
- **Mitigation:** Verify sync service handles removed tables gracefully
- **Mitigation:** Monitor sync errors after deployment

---

## Next Steps

1. ✅ **Review and approve this plan** - DONE
2. ✅ **Run audit script** to identify all legacy table usages - DONE
3. ✅ **Create migration scripts** (Phase 1) - DONE
4. 🔄 **Update code references** (Phase 2) - **IN PROGRESS**
   - ✅ `transactionService.ts` - DONE
   - ✅ `accountBalanceService.ts` - DONE
   - ⏳ Test service layer changes - **NEXT**
   - ⏳ Update remaining services - PENDING
   - ⏳ Update component layer - PENDING
5. ⏳ **Test thoroughly** before removing tables - PENDING
6. ⏳ **Remove legacy tables** (Phase 3) - PENDING
7. ⏳ **Verify and monitor** (Phase 4) - PENDING

## Current Status Summary

**✅ Completed:**
- Phase 1: Audit & Preparation (100%)
- Phase 2: Service Layer - `transactionService.ts` (100%)
- Phase 2: Service Layer - `accountBalanceService.ts` (100%)
- Phase 4: Test infrastructure (50%)

**🔄 In Progress:**
- Phase 2: Service Layer - Testing service changes
- Phase 4: Running tests and verification

**⏳ Pending:**
- Phase 2: Remaining services (`paymentManagementService.ts`, `inventoryPurchaseService.ts`, `employeeService.ts`)
- Phase 2: Component layer (`OfflineDataContext.tsx`, `Customers.tsx`)
- Phase 3: Remove legacy tables
- Phase 4: Final testing and verification

**Files Created:**
- `apps/store-app/src/scripts/verifyEntitiesMigration.ts`
- `apps/store-app/src/scripts/migrateToEntitiesOnly.ts`
- `apps/store-app/src/scripts/runMigrationTest.ts`
- `apps/store-app/src/scripts/testServiceLayerMigration.ts`
- `apps/store-app/src/pages/MigrationTest.tsx`
- `ENTITIES_MIGRATION_AUDIT_REPORT.md`
- `MIGRATION_TESTING_GUIDE.md`

**Files Updated:**
- `apps/store-app/src/services/transactionService.ts` (lines 946-1060)
- `apps/store-app/src/services/accountBalanceService.ts` (lines 45-396)
- `apps/store-app/src/router.tsx` (added migration-test route)

---

## Related Documents

- `ACCOUNTING_FOUNDATION_MIGRATION_PLAN.md` - Original entities table creation
- `ENTITIES_AND_CHART_OF_ACCOUNTS_GUIDE.md` - Usage guide for entities table
- `ENTITY_MIGRATION_SUMMARY.md` - Previous migration work
- `ENTITIES_CHART_OF_ACCOUNTS_OPTIMIZATION.md` - Optimization recommendations

---

## Notes

- The `users` table should be kept for authentication, but employee-specific balance fields should be removed (balances now in entities table)
- Foreign key references (`customer_id`, `supplier_id`) don't need to change - they already reference entity IDs
- The migration is reversible if issues are found early
- Consider keeping a backup of legacy tables for 1-2 months after migration for safety

