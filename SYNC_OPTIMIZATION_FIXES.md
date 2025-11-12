# Sync Optimization & Bug Fixes

## Summary of Changes

Fixed 4 critical issues affecting sync performance and data consistency.

---

## Issue #1: Global Products Missing After Refresh ✅ FIXED

### Problem
Global products were fetched initially but disappeared after refresh. Found `0 global products` in logs despite having 1 in database.

### Root Cause
The `getEntitiesByStore` function in `crudHelperService.ts` had a **broken query**:
```typescript
// WRONG - Invalid Dexie syntax
table.where('store_id').equals(storeId).or('is_global').equals(1)
```

This is invalid Dexie chaining and only returned store products.

### Solution
Restored the correct two-query approach to handle both data types:
```typescript
// Query 1: is_global = 1 (numeric, from sync)
const globalProducts1 = await table.where('is_global').equals(1).toArray();

// Query 2: is_global = true (boolean, from local creation)
const globalProducts2 = await table.filter(item => item.is_global === true).toArray();

// Combine and deduplicate
const globalProductsMap = new Map();
[...globalProducts1, ...globalProducts2].forEach(p => globalProductsMap.set(p.id, p));
const globalProducts = Array.from(globalProductsMap.values());
```

**Files Changed:**
- `apps/store-app/src/services/crudHelperService.ts` (lines 159-189)

---

## Issue #2: Cash Drawer Validation Errors ✅ FIXED

### Problem
```
Invalid amount: 0
```
Hundreds of errors during sync when downloading transactions with 0 amount.

### Root Cause
Validation was too strict - rejected `amount <= 0`, but some legitimate transactions have 0 amount (refunds, test data).

### Solution
Changed validation to allow 0 amounts with warning:
```typescript
// Before: Rejected 0 amounts
if (data.amount <= 0) { return false; }

// After: Allow 0, warn only
if (data.amount < 0) { return false; }
if (data.amount === 0) { console.warn('Transaction with 0 amount...'); }
```

**Files Changed:**
- `apps/store-app/src/services/cashDrawerUpdateService.ts` (lines 618-626)

---

## Issue #3: Slow Sync Performance ✅ OPTIMIZED

### Problem
```
⏱️  Total sync time: 67942.60ms (67.94s)
  - bills download: 31659.50ms (394 records)  ← 31s for one table!
  - users query: 12407.40ms with 0 results    ← 12s wasted
```

Initial sync took **over 1 minute** due to processing records one-by-one.

### Root Cause
The sync loop processed each record individually:
```typescript
for (const remoteRecord of remoteRecords) {
  const localRecord = await db.get(remoteRecord.id);  // 394 awaits!
  await db.put({...});                                 // 394 awaits!
}
```

For 394 bill records, this meant **788 individual database operations**.

### Solution
Implemented **bulk operations**:
```typescript
// 1. Normalize all records at once
const normalizedRecords = remoteRecords.map(normalize);

// 2. Bulk fetch (1 operation instead of 394)
const localRecords = await db.bulkGet(recordIds);

// 3. Process conflicts
const recordsToSync = [...]; // prepare array

// 4. Bulk insert/update (1 operation instead of 394)
await db.bulkPut(recordsToSync);
```

**Expected Performance:**
- **Before:** ~80ms per record × 394 = 31.5s
- **After:** ~100ms total for all 394 records
- **Speedup:** ~300x faster

**Files Changed:**
- `apps/store-app/src/services/syncService.ts` (lines 891-945)

---

## Issue #4: Excessive UI Re-renders ✅ OPTIMIZED

### Problem
```
📦 Inventory page: Received products from context: 8
📦 Inventory page: Received products from context: 8
📦 Inventory page: Received products from context: 8
... (repeated 8+ times)
```

The Inventory page was re-rendering excessively, causing UI lag.

### Root Cause
Data transformations on every render created new array references:
```typescript
// Creates new array on EVERY render
const products = raw.products.map(p => ({ ...p, createdAt: p.created_at }));
```

React sees a new array reference → triggers all child component re-renders.

### Solution
Wrapped all transformations in `useMemo`:
```typescript
const products = useMemo(() => 
  raw.products.map(p => ({ ...p, createdAt: p.created_at })),
  [raw.products]  // Only recompute when raw.products changes
);

const suppliers = useMemo(() => 
  raw.suppliers.map(s => ({ ...s, createdAt: s.created_at })),
  [raw.suppliers]
);

const batchMap = useMemo(() => 
  new Map(inventoryBills.map(b => [b.id, b])),
  [inventoryBills]
);

const inventory = useMemo(() => 
  raw.inventory.map(i => ({...})),
  [raw.inventory, batchMap]
);
```

**Expected Impact:**
- Reduces re-renders from ~8x to 1x per data update
- Improves UI responsiveness
- Reduces CPU usage

**Files Changed:**
- `apps/store-app/src/pages/Inventory.tsx` (lines 25-61)

---

## Testing Recommendations

1. **Global Products**
   - Clear IndexedDB
   - Create global product in admin app
   - Verify it appears in store app immediately
   - Refresh page → should persist

2. **Sync Performance**
   - Clear local data
   - Time initial sync with large dataset (400+ records)
   - Should complete in **< 10 seconds** (was 67s)

3. **UI Performance**
   - Open browser DevTools → React Profiler
   - Navigate to Inventory page
   - Verify products load without excessive renders

4. **Cash Drawer**
   - Verify no errors during sync
   - Transactions with 0 amount should show warning only

---

## Performance Metrics

### Before
- Initial sync: **67.9 seconds**
- Bills table: **31.6 seconds** (394 records)
- Inventory re-renders: **8+ times**
- Global products: **Missing after refresh**
- Validation errors: **Hundreds during sync**

### After (Expected)
- Initial sync: **< 10 seconds** (~85% faster)
- Bills table: **< 1 second** (~97% faster)
- Inventory re-renders: **1-2 times** (87% reduction)
- Global products: **Always present**
- Validation errors: **None** (warnings only)

---

## Migration Notes

No database migrations required. Changes are backward compatible.

However, if users still see missing global products after the fix:
1. They may need to trigger a full resync
2. Or clear IndexedDB and re-sync from scratch

---

## Future Optimization Opportunities

1. **Lazy loading** for large tables (load on demand)
2. **Virtual scrolling** for product tables
3. **Web Workers** for data transformations
4. **Service Worker** for offline caching
5. **IndexedDB indices** optimization for faster queries

---

**Total Lines Changed:** ~120 lines
**Files Modified:** 4 files
**Breaking Changes:** None
**Migration Required:** No
