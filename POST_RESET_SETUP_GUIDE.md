# 🔄 Post-Database Reset Setup Guide

## What Happened

After resetting the database, all data is gone and needs to be reinitialized.

## Quick Diagnostic

Run this in console to see what you have:

```javascript
const { db } = await import('./src/lib/db.js');

console.log('📦 Database Version:', db.verno);

// Check what data exists
const counts = {
  stores: await db.stores.count(),
  branches: await db.branches.count(),
  users: await db.users.count(),
  entities: await db.entities.count(),
  products: await db.products.count(),
  transactions: await db.transactions.count(),
  journals: await db.journal_entries.count()
};

console.table(counts);

// If stores = 0, you need to create/sync your store
// If branches = 0, you need to create/sync branches
```

## Likely Issues

### Issue 1: No Store/Branches (Need Initial Sync)

**Solution:** Trigger initial sync from Supabase

```javascript
// Force a full sync
const { syncService } = await import('./src/services/syncService.js');

const storeId = 'your-store-id'; // Get from Supabase or user profile

try {
  await syncService.performFullSync(storeId, true);
  console.log('✅ Sync complete, reloading...');
  window.location.reload();
} catch (error) {
  console.error('Sync error:', error);
}
```

### Issue 2: Offline Mode (No Supabase)

If you're in offline mode, you need to create data manually:

```javascript
const { db } = await import('./src/lib/db.js');

// Create a store
const storeId = crypto.randomUUID();
await db.stores.add({
  id: storeId,
  name: 'Test Store',
  preferred_currency: 'LBP',
  preferred_language: 'en',
  exchange_rate: 89500,
  updated_at: new Date().toISOString()
});

// Create a branch
const branchId = crypto.randomUUID();
await db.branches.add({
  id: branchId,
  store_id: storeId,
  name: 'Main Branch',
  is_active: true,
  created_at: new Date().toISOString(),
  updated_at: new Date().toISOString(),
  _synced: false,
  _deleted: false
});

console.log('✅ Created store and branch');
console.log('Store ID:', storeId);
console.log('Branch ID:', branchId);

// Reload page
window.location.reload();
```

### Issue 3: User Not Linked to Store

```javascript
// Check user profile
const { db } = await import('./src/lib/db.js');

const users = await db.users.toArray();
console.log('Users:', users);

// If user doesn't have store_id, you need to add it
if (users.length > 0 && !users[0].store_id) {
  console.log('⚠️ User not linked to store');
  // You may need to update user profile
}
```


