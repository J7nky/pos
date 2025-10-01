# Debug Sync Helper

## Quick Sync Test

Open your browser console and run these commands:

### 1. Check Status
```javascript
// Copy this entire block and paste in console:
(async () => {
  const { db } = await import('./lib/db');
  const { syncService } = await import('./services/syncService.optimized');
  
  console.log('=== SYNC DEBUG INFO ===');
  console.log('Online?', navigator.onLine);
  console.log('Sync running?', syncService.isCurrentlyRunning());
  
  // Count unsynced records
  const bills = await db.bills.filter(b => !b._synced).count();
  const lineItems = await db.bill_line_items.filter(b => !b._synced).count();
  
  console.log('Unsynced bills:', bills);
  console.log('Unsynced line items:', lineItems);
  console.log('===================');
})();
```

### 2. Force Manual Sync
```javascript
// Copy and paste this:
(async () => {
  const { syncService } = await import('./services/syncService.optimized');
  
  // Get store ID from localStorage or your auth context
  const storeId = 'YOUR_STORE_ID_HERE'; // Replace with actual ID
  
  console.log('🔄 Starting manual sync...');
  const result = await syncService.sync(storeId);
  
  console.log('✅ Sync completed!');
  console.log('Result:', result);
  console.log('Uploaded:', result.synced.uploaded);
  console.log('Downloaded:', result.synced.downloaded);
  console.log('Errors:', result.errors);
})();
```

### 3. Check Specific Unsynced Records
```javascript
// See what's waiting to sync:
(async () => {
  const { db } = await import('./lib/db');
  
  const unsyncedBills = await db.bills.filter(b => !b._synced).toArray();
  const unsyncedLineItems = await db.bill_line_items.filter(b => !b._synced).toArray();
  
  console.log('📋 Unsynced Bills:', unsyncedBills);
  console.log('📋 Unsynced Line Items:', unsyncedLineItems);
  
  // Check if they have proper IDs
  unsyncedLineItems.forEach(item => {
    console.log(`Line item ${item.id} -> bill_id: ${item.bill_id}`);
  });
})();
```

## Common Issues & Fixes

### Issue 1: Auto-sync not triggering
**Symptoms**: Timer message never appears in console
**Causes**:
- Not online
- No store ID
- Sync already running (stuck)

**Fix**:
```javascript
// Check online status
if (!navigator.onLine) {
  console.log('❌ You are offline');
}

// Check store ID in context
// Look in your React DevTools -> Components -> OfflineDataProvider
// Should have storeId prop
```

### Issue 2: Sync runs but records stay unsynced
**Symptoms**: Sync completes but records remain `_synced: false`
**Causes**:
- Sync errors (check console for red errors)
- Foreign key violations
- Validation failures

**Fix**: Check sync result errors
```javascript
const result = await syncService.sync(storeId);
if (result.errors.length > 0) {
  console.log('❌ Sync errors:', result.errors);
}
```

### Issue 3: Timer resets before firing
**Symptoms**: Timer keeps resetting, never reaches 30 seconds
**Causes**:
- Frequent data updates triggering `resetAutoSyncTimer()`
- This is by design to give you 30 seconds to undo

**Fix**: This is normal! Wait 30 seconds WITHOUT making changes.
Or trigger manual sync.

## Recommended Quick Test

1. **Create a sale**
2. **WAIT 30 seconds without touching anything**
3. **Watch console** - should see:
   ```
   ⏰ Auto-sync timer fired, checking for unsynced data...
   📊 Current unsynced count: 2
   ⏰ Auto-sync triggered after 30-second delay
   📤 Processing table: bills
   ```

4. If nothing happens after 30 seconds, **manually sync**:
   - Click sync button in UI, OR
   - Run manual sync command above

## Get Your Store ID

If you don't know your store ID:

```javascript
// In console:
const authContext = document.querySelector('[data-testid="app"]')?.__reactFiber$?.memoizedProps?.children?.props?.value;
console.log('Store ID:', authContext?.userProfile?.store_id);

// OR simpler:
localStorage.getItem('user_profile_' + localStorage.getItem('supabase.auth.token'))
```

## Emergency: Force Sync All Tables

If nothing works, force a complete sync:

```javascript
(async () => {
  const { syncService } = await import('./services/syncService.optimized');
  const storeId = 'YOUR_STORE_ID';
  
  console.log('🚨 FORCE SYNCING ALL TABLES...');
  
  // Sync each table individually
  const tables = ['bills', 'bill_line_items'];
  
  for (const table of tables) {
    console.log(`📤 Syncing ${table}...`);
    const result = await syncService.syncTable(storeId, table);
    console.log(`✅ ${table} result:`, result);
  }
  
  console.log('🎉 Force sync complete!');
})();
```

