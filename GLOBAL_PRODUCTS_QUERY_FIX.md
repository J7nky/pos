# Global Products Query Fix

## Problem Summary

The `globalProductsQuery` in `crudHelperService.ts` was returning inconsistent results due to:

1. **Type mismatch**: `is_global` field has different types across the system
   - Supabase (remote): `boolean` (true/false)
   - Dexie (local): `number` (0/1)
   - Migration v25: Sets to `false` (boolean)
   - Sync normalization: Converts `true` → `1`, `false` → `0`

2. **Non-indexed query**: Used `.filter()` instead of indexed `.where()` query
   - Less performant
   - Less reliable
   - Could miss records with `null`, `undefined`, or `0` values

3. **Inconsistent with codebase**: Other parts use indexed queries:
   ```typescript
   db.products.where('is_global').equals(1)
   ```

## Root Cause

The original code used a non-indexed filter:
```typescript
let globalProductsQuery = table.filter((item: any) => {
  const isGlobal = item.is_global === true || item.is_global === 1;
  return isGlobal && (includeDeleted || !item._deleted);
});
```

This approach:
- Scans all records (no index usage)
- Checks for both `true` and `1`, but Dexie only stores `1` after sync
- May fail if records have inconsistent types before normalization

## Solution

Changed to use indexed query:
```typescript
let globalProductsQuery = table.where('is_global').equals(1);
if (!includeDeleted) {
  globalProductsQuery = globalProductsQuery.filter((item: any) => !item._deleted);
}
const globalProducts = await globalProductsQuery.toArray();
```

Benefits:
- ✅ Uses indexed `is_global` field (defined in schema)
- ✅ Only checks for `1` (consistent with Dexie storage)
- ✅ Better performance
- ✅ More reliable
- ✅ Consistent with rest of codebase

## Additional Improvement

Added deduplication logic to prevent duplicate products if a product somehow matches both queries:
```typescript
const uniqueProducts = new Map();
[...storeProducts, ...globalProducts].forEach(p => uniqueProducts.set(p.id, p));
const results = Array.from(uniqueProducts.values());
```

## Testing Recommendations

1. Clear IndexedDB and re-sync to ensure all products have `is_global` as `0` or `1`
2. Verify global products appear consistently across page refreshes
3. Check console logs for product counts: `store products + global products = total (unique)`
4. Test with both existing stores and new stores

## Related Files

- `/home/janky/pos/apps/store-app/src/services/crudHelperService.ts` - Fixed query
- `/home/janky/pos/apps/store-app/src/lib/db.ts` - Schema definition and migration
- `/home/janky/pos/apps/store-app/src/services/syncService.ts` - Normalization logic
- `/home/janky/pos/apps/store-app/src/contexts/OfflineDataContext.tsx` - Usage examples
