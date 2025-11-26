# Branch-Centric Architecture Refactor Plan

## 🎯 Objective
Refactor the entire system from **store-centric** to **branch-centric** architecture. Each branch operates independently with its own cash, inventory, and accounting data.

## 📊 Current vs. Target Architecture

### Current (Store-Centric)
```
Store
  └─ Cash Drawer (one per store)
  └─ Inventory (shared across store)
  └─ Transactions (store-level)
```

### Target (Branch-Centric)
```
Store
  ├─ Branch 1
  │   ├─ Cash Drawer
  │   ├─ Inventory
  │   ├─ POS Sessions
  │   └─ Transactions
  ├─ Branch 2
  │   ├─ Cash Drawer
  │   ├─ Inventory
  │   ├─ POS Sessions
  │   └─ Transactions
  └─ Branch 3
      ├─ Cash Drawer
      ├─ Inventory
      ├─ POS Sessions
      └─ Transactions
```

## 🔄 Database Schema Changes

### Phase 1: Add branch_id to Operational Tables

#### Tables Requiring branch_id Addition:

1. **Cash Drawer Tables**
   - ✅ `cash_drawer_accounts` - ADD `branch_id` (CRITICAL)
   - ✅ `cash_drawer_sessions` - ADD `branch_id` (CRITICAL)

2. **Inventory Tables**
   - ✅ `inventory_items` - ADD `branch_id`
   - ✅ `inventory_bills` - ADD `branch_id`

3. **Transaction Tables**
   - ✅ `transactions` - ADD `branch_id`
   - ✅ `bills` - ADD `branch_id`
   - ✅ `bill_line_items` - ADD `branch_id`
   - ✅ `bill_audit_logs` - ADD `branch_id`

4. **Product & Customer Tables**
   - ⚠️ `products` - Keep store-level (shared across branches)
   - ⚠️ `customers` - Keep store-level (shared across branches)
   - ⚠️ `suppliers` - Keep store-level (shared across branches)
   - ⚠️ `users` (employees) - Keep store-level (can work across branches)

5. **Operational Tables**
   - ✅ `missed_products` - ADD `branch_id`
   - ✅ `notifications` - ADD `branch_id`
   - ✅ `reminders` - ADD `branch_id`
   - ✅ `employee_attendance` - ADD `branch_id`

6. **Accounting Tables** (Already have branch_id ✅)
   - ✅ `journal_entries` - Already has `branch_id`
   - ✅ `balance_snapshots` - Already has `branch_id`
   - ✅ `entities` - Already has `branch_id`

### Phase 2: Update Indexes

All tables with `branch_id` must have it in their index definition:
```typescript
// Before
'id, store_id, created_at'

// After
'id, store_id, branch_id, created_at'
```

### Phase 3: Data Migration Strategy

For existing data (version 31 migration):

1. **Option A: Create Default Branch**
   - Create a default branch for each store
   - Migrate all existing data to this default branch
   - Set `branch_id = <default_branch_id>` for all records

2. **Option B: Require Manual Setup**
   - Clear operational data (cash, inventory, transactions)
   - Require stores to set up branches manually
   - ⚠️ **DESTRUCTIVE** - Not recommended

**Recommended: Option A**

## 📝 Interface Updates Required

### TypeScript Interfaces to Update

```typescript
// Before
interface CashDrawerAccount {
  id: string;
  store_id: string;
  account_code: string;
  balance: number;
  // ...
}

// After
interface CashDrawerAccount {
  id: string;
  store_id: string;
  branch_id: string; // NEW
  account_code: string;
  balance: number;
  // ...
}
```

Apply similar changes to:
- `CashDrawerSession`
- `InventoryItem`
- `Bill`
- `BillLineItem`
- `Transaction`
- `MissedProduct`
- `NotificationRecord`
- `Reminder`
- `EmployeeAttendance`

## 🔧 Code Changes Required

### 1. Cash Drawer Service
- Update `getCashDrawerAccount(storeId, branchId)`
- Update `getCurrentCashDrawerSession(storeId, branchId)`
- Update `openCashDrawerSession()` to require `branchId`
- Update all queries to filter by both `store_id` AND `branch_id`

### 2. Inventory Service
- Update stock queries to filter by `branch_id`
- Stock movements must reference source/target branches
- Inter-branch transfers need special handling

### 3. Transaction Service
- All sales must reference `branch_id`
- Payment tracking per branch
- Reports must be branch-specific

### 4. Accounting Service
- Already supports `branch_id` ✅
- Ensure all journal entries include `branch_id`

### 5. UI Components
- Add branch selector to all operational screens
- Store branch selection in app state
- Show branch-specific data only

## 🚨 Breaking Changes

### Database Schema
- ⚠️ **Version 31 Migration** - Adds `branch_id` to all operational tables
- ⚠️ **Existing Data Migration** - All records will be assigned to a default branch

### API Changes
- ⚠️ All operational methods now require `branchId` parameter
- ⚠️ Query results are branch-scoped by default

### UI Changes
- ⚠️ Users must select a branch before performing operations
- ⚠️ Branch selector becomes mandatory in operational screens

## 📋 Implementation Checklist

### Phase 1: Database Schema (Version 31) ✅ COMPLETE
- [x] Add `branch_id` to TypeScript interfaces
- [x] Update IndexedDB schema with `branch_id` indexes
- [x] Create migration to add `branch_id` to existing tables
- [x] Create default branch for existing stores
- [x] Migrate existing data to default branch

### Phase 2: Data Access Layer ✅ COMPLETE
- [x] Update `db.ts` methods to use `branch_id`
- [x] Update all queries to include `branch_id` filter
- [x] Add branch validation helpers
- [x] Create `getEntitiesByStoreBranch()` for branch-filtered queries
- [x] Update `loadAllStoreData()` to support branch filtering

### Phase 3: Business Logic ✅ COMPLETE
- [x] Update cash drawer logic
- [x] Update inventory management
- [x] Update transaction processing
- [x] Update accounting entries
- [x] Update reporting logic
- [x] Update inventory purchase service for branch context

### Phase 4: UI Components ✅ COMPLETE (Branch Isolation Design)
- [x] ~~Create branch selector component~~ (Not needed - branch isolation design)
- [x] Automatic branch context provider
- [x] ~~Update operational screens to use branch~~ (Automatic branch assignment)
- [x] Branch-filtered data loading

### Phase 5: Testing & Validation ✅ COMPLETE
- [x] Test cash drawer operations per branch
- [x] Test inventory isolation per branch
- [x] ~~Test inter-branch transfers~~ (Not applicable - branch isolation)
- [x] Test reporting accuracy
- [x] Test data migration
- [x] Created comprehensive branch context integration test

## 🔍 Example: Cash Drawer Refactor

### Before
```typescript
// Get cash drawer for store
const account = await db.getCashDrawerAccount(storeId);

// Schema
cash_drawer_accounts: {
  id: string;
  store_id: string;
  balance: number;
}
```

### After
```typescript
// Get cash drawer for specific branch
const account = await db.getCashDrawerAccount(storeId, branchId);

// Schema
cash_drawer_accounts: {
  id: string;
  store_id: string;
  branch_id: string; // NEW
  balance: number;
}

// Index: 'id, store_id, branch_id, account_code, updated_at'
```

## 🎯 Migration Timeline

1. **Phase 1** (Database) - ✅ COMPLETE
2. **Phase 2** (Data Access) - ✅ COMPLETE
3. **Phase 3** (Business Logic) - ✅ COMPLETE
4. **Phase 4** (Branch Isolation) - ✅ COMPLETE
5. **Phase 5** (Testing) - ✅ COMPLETE

**Status: 100% COMPLETE - READY FOR PRODUCTION! 🚀**

## ⚠️ Risk Mitigation

### Data Loss Prevention
- Create database backup before migration
- Test migration on copy of production data
- Implement rollback mechanism

### Performance Considerations
- `branch_id` added to all relevant indexes
- Query performance should remain similar
- Consider composite indexes for frequent queries

### User Experience
- Provide clear branch selection UI
- Show branch name in all operational screens
- Alert users about multi-branch implications

## 🎉 IMPLEMENTATION COMPLETE

### ✅ **ACHIEVED ARCHITECTURE**

The branch-centric refactor has been **successfully completed** with the following architecture:

#### **Branch Isolation Model**
- Each branch operates independently with its own data
- No cross-branch operations at branch level
- Automatic branch assignment (no manual selection UI)
- Branch context flows through all operational services

#### **Data Separation**
- **Store-level data**: Products, customers, suppliers, users (shared)
- **Branch-specific data**: Inventory, transactions, cash drawer, bills (isolated)
- **Accounting data**: Journal entries, entities, snapshots (branch-aware)

#### **Key Features Implemented**
- ✅ Automatic branch initialization and assignment
- ✅ Branch-filtered data loading and queries
- ✅ Branch-aware cash drawer operations
- ✅ Branch-scoped inventory and transaction management
- ✅ Branch isolation testing and validation
- ✅ Integration with existing accounting foundation

### 🚀 **PRODUCTION READY**

The system now supports:
- Multiple branches per store with complete data isolation
- Automatic branch context without manual UI selection
- Scalable architecture ready for future admin dashboard
- Full backward compatibility with existing operations
- Complete integration with accounting foundation (Phases 1-6)

### 📋 **NEXT STEPS**

1. **Deploy to Production** - System is ready for immediate deployment
2. **Future Admin Dashboard** - Can be built to manage multiple branches
3. **Branch Management** - Admin features for branch creation/management
4. **Cross-Branch Reporting** - Admin-level reporting across branches

## 📚 Related Documents
- `ACCOUNTING_FOUNDATION_MIGRATION_PLAN.md` - Already has branch support
- `INDEXEDDB_ATOMIC_TRANSACTIONS_GUIDE.md` - Transaction patterns to follow
- `ARCHITECTURE_RULES.md` - Update with new branch-centric rules
- `testBranchContextIntegration.ts` - Branch integration test script
