# Accounting Foundation Migration Plan
## Journal/Ledger + Snapshots + Entity Abstraction

**Date:** November 23, 2025  
**Priority:** 🔥 CRITICAL - Foundation for SaaS Scale  
**Estimated Effort:** 4-6 weeks  
**Risk Level:** HIGH (Core financial architecture change)

---

## Executive Summary

Migrate from **implicit double-entry** to **explicit double-entry with audit trails**:

1. ✅ **Journal Entries Table** - Explicit debit/credit ledger (source of truth)
2. ✅ **Balance Snapshots Table** - Performance + historical queries
3. ✅ **Entity Abstraction** - Unified customer/supplier/cash handling
4. ✅ **No Nullable FKs** - Proper indexing + data integrity
5. ⭐ **Branch-Ready** - Add `branch_id` field (populate later)

**Key:** No `tenant_id` now, but `store_id + branch_id` structure supports future multi-branch.

---

## Relationship to Existing Plans

### **MUST Complete First:**

1. ✅ **ATOMIC_TRANSACTIONS_IMPLEMENTATION.md**
   - Wrap all methods in `db.transaction()`
   - **REQUIRED** before migration
   - **Timeline: This week**

2. ✅ **TRANSACTION_SERVICE_REFACTOR_PLAN.md (Phase 1-3 only)**
   - Phase 1: Foundation (types, constants)
   - Phase 2: OfflineDataContext migration
   - Phase 3: Service layer migration
   - **SKIP Phase 4** (atomic - already done above)
   - **SKIP Phase 5-7** (replaced by this plan)
   - **Timeline: Week 2**

### **Then Execute This Plan (Week 3-6):**

This plan supersedes the remaining phases and adds the full accounting foundation.

---

## New Schema (Branch-Ready)

### **1. journal_entries** (Source of Truth)

```typescript
interface JournalEntry {
  id: string;
  store_id: string;
  branch_id: string | null;      // ⭐ Future: multiple branches
  transaction_id: string;         // Groups debit + credit
  account_code: string;           // '1100', '1200', etc.
  account_name: string;
  debit: number;
  credit: number;
  currency: 'USD' | 'LBP';
  entity_id: string;              // ⭐ NEVER NULL
  entity_type: 'customer' | 'supplier' | 'employee' | 'cash' | 'internal';
  posted_date: string;
  fiscal_period: string;
  is_posted: boolean;
  created_at: string;
  created_by: string;
  _synced: boolean;
}
```

### **2. balance_snapshots** (Performance)

```typescript
interface BalanceSnapshot {
  id: string;
  store_id: string;
  branch_id: string | null;
  account_code: string;
  entity_id: string | null;
  balance_usd: number;
  balance_lbp: number;
  snapshot_date: string;
  snapshot_type: 'hourly' | 'daily' | 'end_of_day';
  verified: boolean;
  created_at: string;
  _synced: boolean;
}
```

### **3. entities** (Unified)

```typescript
interface Entity {
  id: string;
  store_id: string;
  branch_id: string | null;
  entity_type: 'customer' | 'supplier' | 'employee' | 'cash' | 'internal';
  entity_code: string;
  name: string;
  phone: string | null;
  lb_balance: number;             // Cached
  usd_balance: number;            // Cached
  is_system_entity: boolean;      // true for "Cash Customer"
  is_active: boolean;
  customer_data: object | null;   // Type-specific JSON
  supplier_data: object | null;
  created_at: string;
  updated_at: string;
  _synced: boolean;
}
```

### **4. chart_of_accounts** (Config)

```typescript
interface ChartOfAccounts {
  id: string;
  store_id: string;
  account_code: string;           // '1100'
  account_name: string;           // 'Cash'
  account_type: 'asset' | 'liability' | 'equity' | 'revenue' | 'expense';
  requires_entity: boolean;
  is_active: boolean;
}
```

---

## Migration Phases

### **Phase 0: Prerequisites (Week 1)** ✅

1. ✅ Complete atomic transactions implementation
2. ✅ Complete transaction service refactor Phase 1-3
3. ✅ Test thoroughly

---

### **Phase 1: Add New Tables (Week 2-3)**

**Tasks:**
1. Update `db.ts` - Add 4 new tables with indexes
2. Add interfaces to `types/accounting.ts`
3. Create `constants/chartOfAccounts.ts` - Default accounts
4. Create `constants/systemEntities.ts` - Entity IDs
5. Create `services/accountingInitService.ts` - Setup script

**Deliverables:**
- ✅ 4 new tables in database
- ✅ Default chart of accounts
- ✅ System entities (Cash Customer, Internal)
- ✅ No impact on existing code

---

### **Phase 2: Entity Migration (Week 3)**

**Tasks:**
1. Create migration script: `migrateToEntities(storeId)`
   - Copy all customers → entities (type='customer')
   - Copy all suppliers → entities (type='supplier')
   - Create system entities (Cash, Internal)
2. Keep existing customers/suppliers tables (backward compatibility)
3. Update reads to use entities table (with fallback)

**Example Migration:**
```typescript
async function migrateToEntities(storeId: string) {
  const { db } = await import('../lib/db');
  
  // Migrate customers
  const customers = await db.customers.where('store_id').equals(storeId).toArray();
  for (const c of customers) {
    await db.entities.add({
      id: c.id,
      store_id: storeId,
      branch_id: null,  // ⭐ Null for now, populate later
      entity_type: 'customer',
      entity_code: `CUST-${c.id.slice(0,8)}`,
      name: c.name,
      phone: c.phone,
      lb_balance: c.lb_balance,
      usd_balance: c.usd_balance,
      is_system_entity: false,
      is_active: c.is_active,
      customer_data: { lb_max_balance: c.lb_max_balance },
      supplier_data: null,
      created_at: c.created_at,
      updated_at: c.updated_at
    });
  }
  
  // Create system entities
  await db.entities.add({
    id: 'entity-cash-customer',
    store_id: storeId,
    entity_type: 'cash',
    entity_code: 'CASH',
    name: 'Cash Customer',
    is_system_entity: true,
    // ...
  });
}
```

**Deliverables:**
- ✅ All customers/suppliers in entities table
- ✅ System entities created
- ✅ Existing tables untouched

---

### **Phase 3: Parallel Journal Creation (Week 4)**

**Goal:** Create journal entries alongside existing transactions

**Update Transaction Methods:**
```typescript
public async processCustomerPayment(
  customerId: string | null,
  amount: number,
  currency: 'USD' | 'LBP',
  // ...
): Promise<TransactionResult> {
  const entityId = customerId || 'entity-cash-customer';
  const txnId = generateId();
  
  await db.transaction('rw', 
    [db.entities, db.journal_entries, db.transactions, db.cash_drawer_sessions],
    async () => {
      // 1. Create journal entries (NEW)
      await journalService.createEntryPair({
        transactionId: txnId,
        debitAccount: '1100',   // Cash (increases)
        creditAccount: '1200',  // AR (decreases)
        amount,
        currency,
        entityId
      });
      
      // 2. Update entity balance (cached)
      await db.entities.update(entityId, {
        [currency === 'USD' ? 'usd_balance' : 'lb_balance']: newBalance
      });
      
      // 3. Create transaction record (legacy - keep for compatibility)
      await db.transactions.add({ id: txnId, ... });
      
      // 4. Update cash drawer
      await db.cash_drawer_sessions.update(sessionId, { current_amount: newAmount });
    }
  );
}
```

**Create Journal Service:**
```typescript
// services/journalService.ts
export class JournalService {
  async createEntryPair(params: {
    transactionId: string;
    debitAccount: string;
    creditAccount: string;
    amount: number;
    currency: 'USD' | 'LBP';
    entityId: string;
  }) {
    // Create debit entry
    await db.journal_entries.add({
      id: generateId(),
      transaction_id: params.transactionId,
      account_code: params.debitAccount,
      debit: params.amount,
      credit: 0,
      entity_id: params.entityId,
      // ...
    });
    
    // Create credit entry
    await db.journal_entries.add({
      id: generateId(),
      transaction_id: params.transactionId,
      account_code: params.creditAccount,
      debit: 0,
      credit: params.amount,
      entity_id: params.entityId,
      // ...
    });
  }
  
  async verifyBooksBalance(storeId: string): Promise<boolean> {
    const entries = await db.journal_entries.where('store_id').equals(storeId).toArray();
    const debits = entries.reduce((s, e) => s + e.debit, 0);
    const credits = entries.reduce((s, e) => s + e.credit, 0);
    return Math.abs(debits - credits) < 0.01;
  }
}
```

**Deliverables:**
- ✅ All transactions create journal entries
- ✅ sum(debits) = sum(credits) enforced
- ✅ Legacy transactions table still populated
- ✅ Backward compatibility maintained

---

### **Phase 4: Snapshot Service (Week 5)**

**Create Snapshot Service:**
```typescript
// services/snapshotService.ts
export class SnapshotService {
  async createDailySnapshots(storeId: string) {
    const entities = await db.entities.where('store_id').equals(storeId).toArray();
    
    for (const entity of entities) {
      const balance = await this.calculateBalanceFromJournal(entity.id);
      
      await db.balance_snapshots.add({
        id: generateId(),
        store_id: storeId,
        branch_id: null,
        account_code: entity.entity_type === 'customer' ? '1200' : '2100',
        entity_id: entity.id,
        balance_usd: balance.USD,
        balance_lbp: balance.LBP,
        snapshot_date: new Date().toISOString().split('T')[0],
        snapshot_type: 'daily',
        verified: false
      });
    }
  }
  
  async calculateBalanceFromJournal(entityId: string): Promise<{ USD: number; LBP: number }> {
    const entries = await db.journal_entries
      .where('entity_id')
      .equals(entityId)
      .toArray();
    
    const usd = entries
      .filter(e => e.currency === 'USD')
      .reduce((sum, e) => sum + e.debit - e.credit, 0);
    
    const lbp = entries
      .filter(e => e.currency === 'LBP')
      .reduce((sum, e) => sum + e.debit - e.credit, 0);
    
    return { USD: usd, LBP: lbp };
  }
  
  async getHistoricalBalance(entityId: string, date: string): Promise<{ USD: number; LBP: number }> {
    const snapshot = await db.balance_snapshots
      .where('[entity_id+snapshot_date]')
      .equals([entityId, date])
      .first();
    
    if (snapshot) {
      return { USD: snapshot.balance_usd, LBP: snapshot.balance_lbp };
    }
    
    // Fallback: calculate from journal
    return this.calculateBalanceFromJournal(entityId);
  }
}
```

**Schedule Snapshots:**
```typescript
// Run daily at end of day
setInterval(async () => {
  await snapshotService.createDailySnapshots(storeId);
}, 24 * 60 * 60 * 1000);
```

**Deliverables:**
- ✅ Daily snapshots created
- ✅ Historical balance queries in O(1)
- ✅ Verification against journal

---

### **Phase 5: Update Query Layer (Week 5-6)**

**Tasks:**
1. Update all queries to use `entities` instead of `customers`/`suppliers`
2. Add balance verification in reports
3. Update account statements to use journal entries
4. Add general ledger report

**Example Updates:**
```typescript
// BEFORE: Query customers
const customers = await db.customers
  .where('store_id')
  .equals(storeId)
  .toArray();

// AFTER: Query entities (filtered)
const customers = await db.entities
  .where('[store_id+entity_type]')
  .equals([storeId, 'customer'])
  .toArray();
```

**Deliverables:**
- ✅ All queries updated
- ✅ Reports use journal entries
- ✅ Balance verification in place

---

### **Phase 6: Testing & Verification (Week 6)**

**Test Cases:**
1. ✅ Create payment → verify journal entries created
2. ✅ Verify sum(debits) = sum(credits)
3. ✅ Verify entity balance = journal balance
4. ✅ Historical balance queries work
5. ✅ Legacy queries still work
6. ✅ All atomic (rollback on failure)

**Verification Script:**
```typescript
async function verifyIntegrity(storeId: string) {
  // 1. Books balance
  const balanced = await journalService.verifyBooksBalance(storeId);
  console.assert(balanced, 'Books must balance');
  
  // 2. Entity balances match journal
  const entities = await db.entities.where('store_id').equals(storeId).toArray();
  for (const entity of entities) {
    const cached = { USD: entity.usd_balance, LBP: entity.lb_balance };
    const calculated = await snapshotService.calculateBalanceFromJournal(entity.id);
    
    console.assert(
      Math.abs(cached.USD - calculated.USD) < 0.01,
      `Entity ${entity.name} USD balance mismatch`
    );
  }
  
  console.log('✅ All integrity checks passed');
}
```

---

## Future: Adding Branches

When ready for multi-branch (not now):

```typescript
// 1. Add branch_id to entities
await db.entities.update(entityId, {
  branch_id: 'branch-001'
});

// 2. Add branch_id to journal entries
await db.journal_entries.add({
  // ...
  branch_id: 'branch-001'
});

// 3. Add branch_id to snapshots
await db.balance_snapshots.add({
  // ...
  branch_id: 'branch-001'
});

// 4. Update queries
const branchEntities = await db.entities
  .where('[store_id+branch_id]')
  .equals([storeId, branchId])
  .toArray();
```

**Schema is already ready - just populate the field!**

---

## Files to Create/Modify

### **New Files (8):**
1. `src/types/accounting.ts` - New interfaces
2. `src/constants/chartOfAccounts.ts` - Default accounts
3. `src/constants/systemEntities.ts` - Entity IDs
4. `src/services/journalService.ts` - Journal operations
5. `src/services/snapshotService.ts` - Snapshot operations
6. `src/services/accountingInitService.ts` - Migration scripts
7. `src/services/verificationService.ts` - Integrity checks
8. `src/utils/fiscalPeriod.ts` - Period helpers

### **Modified Files (5):**
1. `src/lib/db.ts` - Add 4 new tables
2. `src/services/transactionService.ts` - Add journal creation
3. `src/services/accountStatementService.ts` - Use journal entries
4. `src/contexts/OfflineDataContext.tsx` - Use entities
5. All query files - Update to use entities

---

## Timeline Summary

| Week | Phase | Deliverable |
|------|-------|-------------|
| 1 | Prerequisites | Atomic transactions + refactor Phase 1-3 |
| 2-3 | Add Tables + Migration | New tables + entities populated |
| 4 | Journal Creation | Parallel journal entries |
| 5 | Snapshots | Daily snapshots + historical queries |
| 5-6 | Query Updates | All queries use new tables |
| 6 | Testing | Verification + integrity checks |

**Total: 6 weeks**

---

## Success Criteria

✅ All transactions create journal entries  
✅ sum(debits) = sum(credits) always holds  
✅ Entity balances match journal calculations  
✅ Historical queries work (O(1) via snapshots)  
✅ No nullable entity IDs  
✅ Backward compatibility maintained  
✅ Branch-ready architecture  
✅ All tests pass  

---

## Rollback Plan

If issues found:

1. **Keep journal entries** but stop creating new ones
2. **Revert to cached balances** (customers/suppliers tables)
3. **Debug journal entries** in parallel
4. **Re-enable** when issues resolved

**Critical:** Never delete journal entries once created (audit trail).

---

## Next Steps

1. ✅ Review and approve this plan
2. ✅ Complete prerequisites (atomic transactions + refactor)
3. ✅ Execute Phase 1 (add tables)
4. ✅ Test each phase before proceeding
5. ✅ Document any issues/learnings

**Start with prerequisites this week!**
