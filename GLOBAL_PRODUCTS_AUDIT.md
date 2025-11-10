# Global Products Handling Audit

## Overview
This document audits all functions that query products from IndexedDB to ensure they properly handle global products (`is_global = 1`).

## Problem Identified
Global products were disappearing after sync because some functions only queried store-specific products.

## Functions Audited

### ✅ CORRECT: Functions that handle global products properly

#### 1. `crudHelperService.getEntitiesByStore('products')`
**Location:** `/home/janky/pos/apps/store-app/src/services/crudHelperService.ts:160-180`

```typescript
// Get store-specific products
let storeProductsQuery = table.where('store_id').equals(storeId);
const storeProducts = await storeProductsQuery.toArray();

// Get global products using indexed query (is_global = 1)
let globalProductsQuery = table.where('is_global').equals(1);
const globalProducts = await globalProductsQuery.toArray();

// Combine and return
const results = [...storeProducts, ...globalProducts];
```

**Status:** ✅ Correct - Queries both store and global products

---

#### 2. `crudHelperService.loadAllStoreData()`
**Location:** `/home/janky/pos/apps/store-app/src/services/crudHelperService.ts:279-320`

```typescript
async loadAllStoreData(storeId: string) {
  const operations = [
    () => this.getEntitiesByStore('products', storeId),
    // ... other tables
  ];
  // ...
}
```

**Status:** ✅ Correct - Uses `getEntitiesByStore()` internally

---

#### 3. `OfflineDataContext.refreshData()`
**Location:** `/home/janky/pos/apps/store-app/src/contexts/OfflineDataContext.tsx:490-569`

```typescript
const {
  productsData,
  // ... other data
} = await crudHelperService.loadAllStoreData(storeId);

setProducts(productsData as Tables['products']['Row'][]);
```

**Status:** ✅ Correct - Uses `loadAllStoreData()` internally

---

#### 4. Product Count Queries
**Location:** `/home/janky/pos/apps/store-app/src/contexts/OfflineDataContext.tsx:677-678, 770-771`

```typescript
const [storeProductCount, globalProductCount, supplierCount, customerCount] = await Promise.all([
  db.products.where('store_id').equals(storeId).filter(item => !item._deleted).count(),
  db.products.where('is_global').equals(1).filter(item => !item._deleted).count(),
  // ...
]);
```

**Status:** ✅ Correct - Counts both store and global products separately

---

#### 5. `dataValidationService.refreshCache()`
**Location:** `/home/janky/pos/apps/store-app/src/services/dataValidationService.ts:105-124`

```typescript
const [productsData, ...] = await Promise.all([
  // Include both store-specific and global products
  supabase.from('products').select('id').or(`store_id.eq.${storeId},is_global.eq.true`).limit(10000),
  // ...
]);
```

**Status:** ✅ Correct - Queries Supabase with OR condition for global products

---

#### 6. `syncService.downloadFromSupabase()` - Products Table
**Location:** `/home/janky/pos/apps/store-app/src/services/syncService.ts:784-852`

```typescript
// Store-specific products
const storeSpecificResult = await supabase
  .from('products')
  .select('*')
  .eq('store_id', storeId)
  .gte(timestampField, lastSyncAt);

// Global products
const globalProductsResult = await supabase
  .from('products')
  .select('*')
  .eq('is_global', true)
  .gte(timestampField, lastSyncAt);

// Combine results
const allRecords = [
  ...(storeSpecificResult.data || []),
  ...(globalProductsResult.data || [])
];
```

**Status:** ✅ Correct - Fetches both store and global products from Supabase

---

### ❌ FIXED: Functions that were missing global products

#### 7. `dataValidationService.autoFixRecord()` - Fix Orphaned Inventory Items
**Location:** `/home/janky/pos/apps/store-app/src/services/dataValidationService.ts:235-258`

**Before (BUG):**
```typescript
// Fix missing product - use first available
if (!await db.products.get(record.product_id)) {
  const validProduct = await db.products
    .where('store_id')
    .equals(storeId)
    .filter(p => !p._deleted)
    .first();
  // ❌ Only checked store products, not global products
}
```

**After (FIXED):**
```typescript
// Fix missing product - use first available (include global products)
if (!await db.products.get(record.product_id)) {
  // Try store-specific products first
  let validProduct = await db.products
    .where('store_id')
    .equals(storeId)
    .filter(p => !p._deleted)
    .first();
  
  // If no store products, try global products
  if (!validProduct) {
    validProduct = await db.products
      .where('is_global')
      .equals(1)
      .filter(p => !p._deleted)
      .first();
  }
  // ✅ Now checks both store and global products
}
```

**Status:** ✅ Fixed

---

### 📝 Other Product Queries (Not Store-Specific)

#### 8. SKU Generation Query
**Location:** `/home/janky/pos/apps/store-app/src/contexts/OfflineDataContext.tsx:2206`

```typescript
const allProducts = await db.products.toArray();
```

**Status:** ✅ Correct - Gets ALL products (including global) for SKU generation

---

#### 9. Individual Product Lookups
**Location:** Multiple places using `db.products.get(id)`

```typescript
const product = await db.products.get(productId);
```

**Status:** ✅ Correct - Direct ID lookup works for both store and global products

---

## Summary

### Total Functions Audited: 9

- ✅ **Correct from start:** 8 functions
- ❌ **Had bugs (now fixed):** 1 function

### Key Findings:

1. **Main data loading path is correct:** The primary data flow through `refreshData()` → `loadAllStoreData()` → `getEntitiesByStore()` properly handles global products.

2. **Sync service is correct:** The sync service correctly fetches and normalizes global products from Supabase.

3. **One validation bug fixed:** The `autoFixRecord()` function in `dataValidationService` was only checking store-specific products when trying to fix orphaned inventory items. This has been fixed to also check global products.

4. **Stringified JSON handling:** The multilingual product name issue (stringified JSON) is handled separately through:
   - `parseMultilingualString()` utility function
   - `useProductMultilingual()` hook
   - Filter logic in Inventory page

## Recommendations

1. ✅ **All critical paths now handle global products correctly**
2. ✅ **Validation service bug has been fixed**
3. 🔍 **Monitor logs for the warning added to `crudHelperService`** to detect any future issues with global products not being found by indexed queries

## Testing Checklist

- [ ] Verify global products appear in product list
- [ ] Verify global products can be used in inventory receives
- [ ] Verify global products persist after sync
- [ ] Verify multilingual names display correctly for global products
- [ ] Verify orphaned inventory items can be fixed using global products
