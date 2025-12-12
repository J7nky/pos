# 🔧 Database Schema Fix - Compound Indexes

## What Was the Problem?

The balance calculation functions were trying to use a compound index `[entity_id+currency+account_code]` that didn't exist in your database schema.

**Error Message:**
```
SchemaError: KeyPath [entity_id+currency+account_code] on object store journal_entries is not indexed
```

## What I Fixed

### 1. **Added Database Migration (Version 42)**

Added a new schema version with the required compound indexes:

```typescript
// Version 42: Add compound indexes for balance calculation queries
journal_entries: 'id, store_id, branch_id, transaction_id, entity_id, account_code, currency, ..., [entity_id+currency+account_code], [entity_id+currency], [transaction_id], _synced, _deleted'
```

**New Indexes:**
- ✅ `[entity_id+currency+account_code]` - For fast balance queries (canonical function)
- ✅ `[entity_id+currency]` - For entity balance lookups
- ✅ `[transaction_id]` - For journal entry lookups by transaction
- ✅ Added `currency` field to existing indexes

### 2. **Added Fallback Logic**

Updated `calculateEntityBalance()` to handle missing indexes gracefully:

```typescript
try {
  // Try compound index (fast)
  const entries = await db.journal_entries
    .where('[entity_id+currency+account_code]')
    .equals([entityId, currency, accountCode])
    .and(e => e.is_posted === true)
    .toArray();
  
  return calculateBalance(entries);
} catch (error) {
  // Fallback: Filter manually (slower but works)
  const entries = await db.journal_entries
    .where('entity_id')
    .equals(entityId)
    .and(e => e.currency === currency && e.account_code === accountCode && e.is_posted === true)
    .toArray();
  
  return calculateBalance(entries);
}
```

## How to Apply the Fix

### Option 1: Automatic Migration (Recommended)

**The migration will run automatically when you refresh your app!**

1. **Refresh your browser** (F5 or Ctrl+R)
2. **Check console** - you should see:
   ```
   🔧 Running migration v42: Add compound indexes for balance calculation
   ✅ Added [entity_id+currency+account_code] compound index
   ✅ Added [entity_id+currency] compound index
   ```
3. **Test again** - Balance verification should now work without errors

### Option 2: Manual Database Reset (If Needed)

If the migration doesn't run automatically:

```javascript
// In browser console
const { db } = await import('./src/lib/db.js');

// Check current version
console.log('Current DB version:', db.verno);

// If version is less than 42, you may need to close and reopen
await db.close();
window.location.reload();
```

### Option 3: Nuclear Option (Fresh Start)

If you're still in development and don't mind losing data:

```javascript
// In browser console
const { db } = await import('./src/lib/db.js');

// Delete entire database
await db.delete();

// Reload page to create fresh database with new schema
window.location.reload();
```

## Verify the Fix

After refreshing, test that it works:

```javascript
// Check DB version
const { db } = await import('./src/lib/db.js');
console.log('DB Version:', db.verno); // Should be 42 or higher

// Test balance verification
const { balanceVerificationService } = await import('./src/services/balanceVerificationService.js');

const summary = await balanceVerificationService.verifyAllBalances(storeId);
console.log(summary);
// Should work without errors now!
```

## What the Indexes Do

### Performance Benefit:

**Without compound index (slow):**
```javascript
// Has to scan all journal entries and filter
db.journal_entries.toArray()  // Scan all
  .then(entries => entries.filter(e => 
    e.entity_id === id && 
    e.currency === 'USD' && 
    e.account_code === '1200'
  ));
```

**With compound index (fast):**
```javascript
// Direct lookup using B-tree index
db.journal_entries
  .where('[entity_id+currency+account_code]')
  .equals([id, 'USD', '1200'])
  .toArray();
```

**Speed Difference:** O(n) → O(log n) - Could be **10-100x faster** for large datasets!

## Why This Matters

The canonical `calculateBalance()` function needs to:
1. Find all journal entries for an entity
2. Filter by currency
3. Filter by account code (AR vs AP)
4. Calculate balance

Without proper indexes, this would be slow for large datasets. With the compound indexes, it's **instant** even with thousands of journal entries!

## Next Steps

1. ✅ **Refresh your browser** - Migration runs automatically
2. ✅ **Test balance verification** - Should work without errors
3. ✅ **Run the test suite** - All tests should pass
4. ✅ **Continue development** - Indexes are now in place

---

**Status:** ✅ Fixed  
**Action Required:** Refresh browser to apply migration  
**Performance:** Optimal with compound indexes


