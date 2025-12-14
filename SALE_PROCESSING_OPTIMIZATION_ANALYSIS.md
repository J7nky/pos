# Sale Processing Optimization Analysis

## 🔍 Current Performance Issues

### Issue #1: Individual Inventory Updates in Loop ⚠️ HIGH PRIORITY

**Location**: `OfflineDataContext.tsx:1569-1639`

**Problem**:
```typescript
// Current: Individual operations for each item
for (const item of mappedLineItems) {
  if (item.inventory_item_id) {
    const inventoryItem = await db.inventory_items.get(item.inventory_item_id);  // ❌ N awaits
    await db.inventory_items.update(item.inventory_item_id, { ... });           // ❌ N awaits
  }
}
```

**Impact**:
- For a sale with 10 items: **20 database operations** (10 gets + 10 updates)
- Each operation: ~2-5ms
- **Total time: 40-100ms** just for inventory updates
- Scales linearly: 50 items = 200-500ms

**Solution**: Use bulk operations
```typescript
// Optimized: Bulk fetch + bulk update
const inventoryIds = mappedLineItems
  .filter(item => item.inventory_item_id)
  .map(item => item.inventory_item_id);

// 1 bulk operation instead of N
const inventoryItems = await db.inventory_items.bulkGet(inventoryIds);

// Prepare all updates
const updates = inventoryItems.map(item => {
  const lineItem = mappedLineItems.find(li => li.inventory_item_id === item.id);
  const newQuantity = item.quantity - lineItem.quantity;
  return {
    id: item.id,
    updates: { 
      quantity: Math.max(0, newQuantity),
      _synced: false 
    }
  };
});

// 1 bulk operation instead of N
await batchUpdate(db.inventory_items, updates);
```

**Expected Improvement**:
- **Before**: 10 items × 4ms = 40ms
- **After**: 2 operations × 5ms = 10ms
- **Speedup: 4x faster**

---

### Issue #2: FIFO Inventory Query in Loop ⚠️ HIGH PRIORITY

**Location**: `OfflineDataContext.tsx:1604-1637`

**Problem**:
```typescript
// Current: Query for each product without inventory_item_id
for (const item of mappedLineItems) {
  if (!item.inventory_item_id) {
    // ❌ Query executed for EACH item
    const inventoryRecords = await db.inventory_items
      .where('product_id')
      .equals(item.product_id)
      .and(inv => inv.quantity > 0)
      .sortBy('received_at');
    
    // ❌ Then loop through results with individual updates
    for (const inv of inventoryRecords) {
      await db.inventory_items.update(inv.id, { ... });
    }
  }
}
```

**Impact**:
- For 5 items without `inventory_item_id`: **5 queries + N updates**
- Each query: ~5-10ms
- **Total time: 25-50ms + update time**

**Solution**: Batch queries by product_id
```typescript
// Group items by product_id
const itemsByProduct = new Map<string, typeof mappedLineItems>();
for (const item of mappedLineItems) {
  if (!item.inventory_item_id && item.product_id) {
    const key = String(item.product_id);
    if (!itemsByProduct.has(key)) {
      itemsByProduct.set(key, []);
    }
    itemsByProduct.get(key)!.push(item);
  }
}

// Fetch all inventory for needed products in parallel
const productIds = Array.from(itemsByProduct.keys());
const allInventory = await Promise.all(
  productIds.map(productId =>
    db.inventory_items
      .where('product_id')
      .equals(productId)
      .and(inv => inv.quantity > 0)
      .sortBy('received_at')
      .toArray()
  )
);

// Process FIFO logic and prepare bulk updates
const fifoUpdates: Array<{ id: string; updates: Partial<InventoryItem> }> = [];
for (let i = 0; i < productIds.length; i++) {
  const productId = productIds[i];
  const items = itemsByProduct.get(productId)!;
  const inventory = allInventory[i];
  
  for (const item of items) {
    let qtyToDeduct = item.quantity;
    for (const inv of inventory) {
      if (qtyToDeduct <= 0) break;
      const deduct = Math.min(inv.quantity, qtyToDeduct);
      fifoUpdates.push({
        id: inv.id,
        updates: {
          quantity: Math.max(0, inv.quantity - deduct),
          _synced: false
        }
      });
      qtyToDeduct -= deduct;
    }
  }
}

// Single bulk update
await batchUpdate(db.inventory_items, fifoUpdates);
```

**Expected Improvement**:
- **Before**: 5 queries × 8ms = 40ms + updates
- **After**: 1 parallel batch × 10ms = 10ms + 1 bulk update
- **Speedup: 3-4x faster**

---

### Issue #3: Cash Drawer Update Outside Transaction ⚠️ MEDIUM PRIORITY (Data Consistency)

**Location**: `OfflineDataContext.tsx:1678-1720`

**Problem**:
```typescript
// Main transaction completes
await db.transaction('rw', [...], async () => {
  // ... bill creation, inventory updates, etc.
});

// ❌ Cash drawer update happens OUTSIDE transaction
if (bill.payment_method === 'cash') {
  cashDrawerResult = await processCashDrawerTransaction({ ... });
}
```

**Impact**:
- **Data consistency risk**: If cash drawer update fails, bill is already created
- **Rollback impossible**: Can't undo bill if cash drawer fails
- **Race condition**: Multiple concurrent sales could cause issues

**Solution**: Move cash drawer update inside transaction OR use compensating transaction pattern
```typescript
// Option 1: Include in main transaction (if possible)
await db.transaction('rw', [db.bills, ..., db.cash_drawer_sessions], async () => {
  // ... existing operations ...
  
  // Cash drawer update inside transaction
  if (bill.payment_method === 'cash') {
    cashDrawerResult = await processCashDrawerTransaction({ ... });
  }
});

// Option 2: Two-phase commit pattern
let cashDrawerResult = null;
try {
  await db.transaction('rw', [...], async () => {
    // ... bill creation ...
  });
  
  // Phase 2: Cash drawer (with rollback capability)
  if (bill.payment_method === 'cash') {
    cashDrawerResult = await processCashDrawerTransaction({ ... });
  }
} catch (error) {
  // Rollback bill if cash drawer fails
  await rollbackBill(billId);
  throw error;
}
```

**Recommendation**: Option 1 if `processCashDrawerTransaction` can work within the transaction scope.

---

### Issue #4: Nested Transaction for Credit Sales ⚠️ MEDIUM PRIORITY

**Location**: `OfflineDataContext.tsx:1652`

**Problem**:
```typescript
await db.transaction('rw', [...], async () => {
  // ... bill creation ...
  
  // ❌ Nested transaction inside another transaction
  await transactionService.createTransaction({
    // This creates its own transaction
  });
});
```

**Impact**:
- **Transaction nesting**: Dexie supports this but adds overhead
- **Potential deadlocks**: If both transactions lock same resources
- **Complexity**: Harder to debug and reason about

**Solution**: Flatten transaction or use transaction context
```typescript
// Option 1: Single unified transaction
await db.transaction('rw', [
  db.bills, 
  db.bill_line_items, 
  db.inventory_items, 
  db.entities, 
  db.transactions,
  db.journal_entries,  // Add journal entries table
  db.bill_audit_logs
], async () => {
  // ... bill creation ...
  
  // Direct journal entry creation (no nested transaction)
  if (customerBalanceUpdate) {
    await createJournalEntryDirectly({
      debitAccount: '1200', // AR
      creditAccount: '4100', // Revenue
      amount: customerBalanceUpdate.amountDue,
      // ... other fields
    });
    
    // Direct entity balance update
    await db.entities.update(customerBalanceUpdate.customerId, {
      lb_balance: newBalance,
      _synced: false
    });
  }
});
```

**Expected Improvement**:
- **Before**: Nested transaction overhead (~5-10ms)
- **After**: Single transaction (~0ms overhead)
- **Speedup: 5-10ms saved**

---

### Issue #5: Multiple Sequential Refresh Calls ⚠️ LOW PRIORITY

**Location**: `OfflineDataContext.tsx:1768-1770`

**Problem**:
```typescript
await refreshData();              // ❌ Full data refresh
await refreshCashDrawerStatus();  // ❌ Separate refresh
await updateUnsyncedCount();      // ❌ Another refresh
```

**Impact**:
- **3 separate operations**: Each triggers UI updates
- **Potential race conditions**: UI might update 3 times
- **Unnecessary work**: Some data might not have changed

**Solution**: Batch refresh or selective refresh
```typescript
// Option 1: Single batched refresh
await Promise.all([
  refreshData(),
  refreshCashDrawerStatus(),
  updateUnsyncedCount()
]);

// Option 2: Selective refresh (only changed data)
await refreshData(['bills', 'bill_line_items', 'inventory_items']);
await refreshCashDrawerStatus();
await updateUnsyncedCount();
```

**Expected Improvement**:
- **Before**: 3 sequential operations (~100-200ms)
- **After**: Parallel operations (~50-100ms) or selective (~30-50ms)
- **Speedup: 2-3x faster**

---

### Issue #6: Entity Lookup in Transaction ⚠️ LOW PRIORITY

**Location**: `OfflineDataContext.tsx:1644`

**Problem**:
```typescript
// Inside transaction
const entity = await db.entities.get(customerBalanceUpdate.customerId);
```

**Impact**:
- **Single operation**: Usually fast (~1-2ms)
- **Could be pre-fetched**: If we know we need it, fetch before transaction

**Solution**: Pre-fetch entity before transaction
```typescript
// Pre-fetch entity before transaction
let entity = null;
if (customerBalanceUpdate) {
  entity = await db.entities.get(customerBalanceUpdate.customerId);
  if (!entity || (entity.entity_type !== 'customer' && entity.entity_type !== 'supplier')) {
    throw new Error('Invalid entity for balance update');
  }
}

// Then use in transaction (no await needed)
await db.transaction('rw', [...], async () => {
  // ... use pre-fetched entity ...
});
```

**Expected Improvement**:
- **Before**: 1-2ms inside transaction
- **After**: 1-2ms outside transaction (parallel with other prep work)
- **Speedup: Minimal, but cleaner code**

---

## 📊 Performance Impact Summary

| Issue | Current Time | Optimized Time | Speedup | Priority |
|-------|-------------|----------------|---------|----------|
| Individual Inventory Updates | 40-100ms (10 items) | 10-20ms | **4-5x** | 🔴 High |
| FIFO Query in Loop | 40-50ms (5 items) | 10-15ms | **3-4x** | 🔴 High |
| Cash Drawer Outside Transaction | N/A (consistency risk) | N/A | **Safer** | 🟡 Medium |
| Nested Transaction | 5-10ms overhead | 0ms | **5-10ms** | 🟡 Medium |
| Multiple Refresh Calls | 100-200ms | 30-100ms | **2-3x** | 🟢 Low |
| Entity Lookup | 1-2ms | 1-2ms | **Minimal** | 🟢 Low |

**Total Expected Improvement**:
- **Small sale (5 items)**: ~85-160ms → ~25-50ms (**3-4x faster**)
- **Medium sale (10 items)**: ~140-260ms → ~40-70ms (**3-4x faster**)
- **Large sale (50 items)**: ~500-1000ms → ~150-300ms (**3-4x faster**)

---

## 🎯 Recommended Implementation Order

1. **Phase 1 (High Impact, Low Risk)**:
   - ✅ Optimize individual inventory updates (Issue #1)
   - ✅ Optimize FIFO queries (Issue #2)
   - **Expected**: 3-4x speedup, minimal risk

2. **Phase 2 (Medium Impact, Medium Risk)**:
   - ✅ Fix cash drawer transaction consistency (Issue #3)
   - ✅ Flatten nested transaction (Issue #4)
   - **Expected**: Better consistency + 5-10ms improvement

3. **Phase 3 (Low Impact, Low Risk)**:
   - ✅ Batch refresh calls (Issue #5)
   - ✅ Pre-fetch entity (Issue #6)
   - **Expected**: 2-3x faster refreshes, cleaner code

---

## 🔧 Implementation Notes

### Using Existing Utilities

The codebase already has `batchOperations.ts` with:
- `batchUpdate()` - For bulk updates
- `batchUpsert()` - For bulk upserts
- `parallelBatch()` - For parallel operations

**Example Usage**:
```typescript
import { batchUpdate } from '../utils/batchOperations';

// Instead of:
for (const item of items) {
  await db.inventory_items.update(item.id, { quantity: newQty });
}

// Use:
await batchUpdate(
  db.inventory_items,
  items.map(item => ({
    id: item.id,
    updates: { quantity: newQty, _synced: false }
  }))
);
```

### Testing Strategy

1. **Unit Tests**: Test bulk operations with mock data
2. **Integration Tests**: Test full sale flow with various item counts
3. **Performance Tests**: Benchmark before/after improvements
4. **Edge Cases**: Test with 0 items, 100+ items, concurrent sales

---

## ✅ Conclusion

The sale processing flow has **significant optimization opportunities**, especially in:
1. **Inventory updates** (4-5x improvement possible)
2. **FIFO queries** (3-4x improvement possible)
3. **Transaction structure** (consistency + performance)

**Total potential improvement: 3-4x faster** for typical sales, with better data consistency and cleaner code.

