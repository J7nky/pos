# Entities Migration Audit Report

**Date:** December 2024  
**Purpose:** Identify all usages of legacy tables (customers, suppliers, employees) before migration

---

## Summary

**Total Files Found:**
- **Customers table:** 39 files
- **Suppliers table:** 43 files  
- **Users/Employees table:** 18 files

**Key Findings:**
1. Legacy tables are still actively used in many services
2. Dual-write pattern exists (updating both legacy and entities tables)
3. Components still rely on legacy table structure
4. Foreign key references are compatible (already use entity IDs)

---

## Critical Files Requiring Updates

### Service Layer (High Priority)

#### 1. `transactionService.ts`
**Current Usage:**
- `getEntityBalance()` - Reads from `db.customers` and `db.suppliers` (lines 954-960)
- `updateEntityBalancesAtomic()` - Updates `db.customers` and `db.suppliers` (lines 984-1030)
- Needs to be updated to use `db.entities` only

**Impact:** HIGH - Core transaction processing

#### 2. `accountBalanceService.ts`
**Current Usage:**
- `updateCachedBalance()` - Updates `db.customers` and `db.suppliers` (lines 329-333)
- `reconcileAllBalances()` - Reads from legacy tables
- Needs to be updated to use `db.entities` only

**Impact:** HIGH - Balance management

#### 3. `legacyCompatibilityService.ts`
**Current Usage:**
- Provides backward compatibility layer
- Converts entities to legacy format
- **Action:** Can be removed after migration

**Impact:** MEDIUM - Compatibility layer

#### 4. `entityMigrationService.ts`
**Current Usage:**
- Migration service that copies data to entities
- **Action:** Keep for initial migration, then can be deprecated

**Impact:** LOW - One-time migration

#### 5. `employeeService.ts`
**Current Usage:**
- `getEmployees()` - Reads from `db.users` (line 15)
- `getEmployee()` - Reads from `db.users`
- `updateEmployee()` - Updates `db.users` (line 240)
- Needs to be updated to use `db.entities` with `entity_type='employee'`

**Impact:** MEDIUM - Employee management

#### 6. `inventoryPurchaseService.ts`
**Current Usage:**
- Likely queries suppliers table
- Needs audit of specific usage

**Impact:** MEDIUM - Inventory operations

### Component Layer (High Priority)

#### 1. `OfflineDataContext.tsx`
**Current Usage:**
- State includes `customers`, `suppliers`, `employees` (lines 38-40)
- `addCustomer()`, `addSupplier()` - Create in legacy tables
- `updateCustomer()`, `updateSupplier()` - Update legacy tables
- Needs complete refactor to use `entities` table

**Impact:** CRITICAL - Core data context

#### 2. `Customers.tsx`
**Current Usage:**
- Reads from `raw.customers` (line 23)
- Uses `addCustomer`, `updateCustomer` from context
- Needs to use `entityQueryService.getCustomers()`

**Impact:** HIGH - Customer management UI

#### 3. `POS.tsx`
**Current Usage:**
- Likely references customers/suppliers
- Needs audit of specific usage

**Impact:** MEDIUM - Point of sale

### Database Layer

#### 1. `db.ts`
**Current Usage:**
- Defines `customers`, `suppliers`, `users` tables
- Multiple version migrations reference these tables
- **Action:** Remove table definitions in new version

**Impact:** CRITICAL - Database schema

#### 2. `syncService.ts`
**Current Usage:**
- Syncs `customers` and `suppliers` tables
- **Action:** Remove from sync list, keep only `entities`

**Impact:** HIGH - Data synchronization

### Type Definitions

#### 1. `types/index.ts` or `types/database.ts`
**Current Usage:**
- Defines `Customer`, `Supplier`, `Employee` interfaces
- **Action:** Mark as deprecated, keep for backward compatibility

**Impact:** MEDIUM - Type safety

---

## Foreign Key References (No Changes Needed)

These tables already reference entity IDs (same UUIDs), so no changes needed:

1. **`bills.customer_id`** - Already references entity.id
2. **`inventory_bills.supplier_id`** - Already references entity.id
3. **`transactions.customer_id`** - Already references entity.id
4. **`transactions.supplier_id`** - Already references entity.id
5. **`bill_line_items.customer_id`** - Already references entity.id
6. **`bill_line_items.supplier_id`** - Already references entity.id
7. **`journal_entries.entity_id`** - Already uses entities table

---

## Migration Strategy by File

### Phase 2.1: Service Layer Updates

**Priority Order:**

1. **`transactionService.ts`** (CRITICAL)
   - Update `getEntityBalance()` to query `db.entities`
   - Update `updateEntityBalancesAtomic()` to update `db.entities` only
   - Remove dual-write to legacy tables

2. **`accountBalanceService.ts`** (HIGH)
   - Update `updateCachedBalance()` to update `db.entities`
   - Update `reconcileAllBalances()` to use entities table

3. **`employeeService.ts`** (MEDIUM)
   - Update all methods to use `db.entities` with `entity_type='employee'`
   - Or use `entityQueryService.getEmployees()`

4. **`inventoryPurchaseService.ts`** (MEDIUM)
   - Audit and update supplier queries
   - Use `entityQueryService.getSuppliers()`

5. **`legacyCompatibilityService.ts`** (LOW)
   - Mark as deprecated
   - Remove after migration complete

### Phase 2.2: Component Layer Updates

**Priority Order:**

1. **`OfflineDataContext.tsx`** (CRITICAL)
   - Remove `customers`, `suppliers`, `employees` from state
   - Add `entities` to state
   - Update `addCustomer()`, `addSupplier()` to create entities
   - Update `updateCustomer()`, `updateSupplier()` to update entities
   - Update data loading to use `entities` table

2. **`Customers.tsx`** (HIGH)
   - Replace `raw.customers` with `entityQueryService.getCustomers()`
   - Update customer operations to use entities

3. **`POS.tsx`** (MEDIUM)
   - Audit customer/supplier references
   - Update to use entities

### Phase 2.3: Database & Sync Updates

1. **`db.ts`** (CRITICAL)
   - Create new version (v20)
   - Remove `customers` and `suppliers` table definitions
   - Keep `users` table but remove balance fields
   - Add migration to clear legacy tables

2. **`syncService.ts`** (HIGH)
   - Remove `customers` and `suppliers` from sync tables list
   - Keep only `entities` in sync

3. **Type Definitions** (MEDIUM)
   - Mark `Customer`, `Supplier` interfaces as deprecated
   - Add migration notes

---

## Testing Checklist

After each phase, verify:

- [ ] All customer operations work
- [ ] All supplier operations work
- [ ] All employee operations work
- [ ] Balance updates work correctly
- [ ] Foreign key references remain valid
- [ ] Sync operations work
- [ ] No console errors
- [ ] No data loss

---

## Risk Assessment

### High Risk Areas

1. **`transactionService.ts`** - Core transaction processing
   - **Mitigation:** Comprehensive testing of all transaction types
   - **Rollback:** Keep dual-write during transition

2. **`OfflineDataContext.tsx`** - Core data context
   - **Mitigation:** Gradual migration, test each operation
   - **Rollback:** Keep legacy state during transition

3. **Database schema changes**
   - **Mitigation:** Create backup before migration
   - **Rollback:** Version rollback capability

### Medium Risk Areas

1. **Balance calculations**
   - **Mitigation:** Verify balances match after migration
   - **Rollback:** Reconciliation script

2. **Sync operations**
   - **Mitigation:** Test sync with Supabase
   - **Rollback:** Re-enable legacy table sync if needed

---

## Next Steps

1. ✅ **Phase 1 Complete:** Audit and scripts created
2. **Phase 2:** Update service layer (start with `transactionService.ts`)
3. **Phase 2:** Update component layer (start with `OfflineDataContext.tsx`)
4. **Phase 3:** Remove legacy tables from schema
5. **Phase 4:** Testing and verification

---

## Files Reference

### Scripts Created
- `apps/store-app/src/scripts/verifyEntitiesMigration.ts` - Verification script
- `apps/store-app/src/scripts/migrateToEntitiesOnly.ts` - Migration script

### Key Files to Update
- `apps/store-app/src/services/transactionService.ts`
- `apps/store-app/src/services/accountBalanceService.ts`
- `apps/store-app/src/services/employeeService.ts`
- `apps/store-app/src/contexts/OfflineDataContext.tsx`
- `apps/store-app/src/pages/Customers.tsx`
- `apps/store-app/src/lib/db.ts`
- `apps/store-app/src/services/syncService.ts`

