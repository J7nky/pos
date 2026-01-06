# Testing Guide: Event Stream Initialization Fix

## Quick Verification

### Check Current Sync State
Open browser console and run:

```javascript
// Check sync_state for your current branch
const currentBranchId = localStorage.getItem('currentBranchId');
const { db } = await import('./src/lib/db');
const syncState = await db.sync_state.get(currentBranchId);
console.log('Current sync state:', syncState);

// Check max event version in Supabase
const { supabase } = await import('./src/lib/supabase');
const { data } = await supabase
  .from('branch_event_log')
  .select('version')
  .eq('branch_id', currentBranchId)
  .order('version', { ascending: false })
  .limit(1)
  .single();
console.log('Max event version in Supabase:', data?.version);
```

### Expected Results
- `syncState.last_seen_event_version` should equal or be close to the max version
- If they match, no events will be replayed on next app load ✅

## Test Scenarios

### Scenario 1: Simulate Fresh Install (Recommended)

1. **Backup your data** (optional but recommended):
   ```javascript
   // Export current data
   const { db } = await import('./src/lib/db');
   const backupData = {
     products: await db.products.toArray(),
     bills: await db.bills.toArray(),
     // Add other tables as needed
   };
   console.log('Backup:', backupData);
   ```

2. **Clear IndexedDB**:
   - Open Dev Tools → Application → IndexedDB
   - Right-click on your database → Delete
   - Or run: `indexedDB.deleteDatabase('store-app-db')`

3. **Reload the app**:
   - Watch the console for these messages:
   ```
   📥 Local database is empty, syncing from cloud...
   ✅ Initial sync completed: downloaded X records
   🔄 Initializing event stream sync state for all branches...
   ✅ Initialized sync state for branch <id> (<name>)
   [EventStream] Starting event stream for branch <id>
   [EventStream] Catching up from version <N> for branch <id>
   [EventStream] No new events for branch <id>  ← THIS IS KEY!
   ```

4. **Verify no event replay**:
   - You should NOT see logs like:
   ```
   [EventStream] Found 100 new events...
   [EventStream] Starting to process event ... (version 1, index 0/100)
   [EventStream] Fetching record transaction/...
   ```

### Scenario 2: Test with Existing Data

1. **Delete only sync_state**:
   ```javascript
   const { db } = await import('./src/lib/db');
   await db.sync_state.clear();
   console.log('Sync state cleared');
   ```

2. **Reload the app**:
   - Should NOT trigger full resync (data exists)
   - Watch for: "Database has data but no sync state"
   - Should auto-initialize to current max version

3. **Expected console output**:
   ```
   [EventStream] No sync state found for branch <id>
   [EventStream] Database has data but no sync state - initializing...
   [EventStream] Initialized sync state to version <N>
   [EventStream] Catching up from version <N>
   [EventStream] No new events for branch <id>
   ```

### Scenario 3: Test Real-Time Event Processing

1. **Ensure app is running** with sync state properly initialized

2. **Create a new transaction**:
   - Make a sale, record a payment, etc.
   - Should emit event to `branch_event_log`

3. **Watch console for**:
   ```
   [EventStream] Realtime signal: event <id> version <N+1>
   [EventStream] Catching up from version <N> for branch <id>
   [EventStream] Found 1 new events for branch <id> (versions <N+1> to <N+1>)
   [EventStream] Processing event: payment_posted insert on transaction/...
   [EventStream] Successfully processed event <id> (version <N+1>)
   ```

4. **Verify**:
   - Only 1 event processed (the new one)
   - Sync state updated to N+1

## Performance Benchmarks

### Before Fix
Run this to see how many events would be replayed:

```javascript
const currentBranchId = localStorage.getItem('currentBranchId');
const { supabase } = await import('./src/lib/supabase');
const { count } = await supabase
  .from('branch_event_log')
  .select('*', { count: 'exact', head: true })
  .eq('branch_id', currentBranchId);

console.log(`Would replay ${count} events on fresh install`);
console.log(`Estimated time: ${(count * 0.1).toFixed(1)} seconds`);
```

### After Fix
```javascript
const currentBranchId = localStorage.getItem('currentBranchId');
const { db } = await import('./src/lib/db');
const syncState = await db.sync_state.get(currentBranchId);

const { supabase } = await import('./src/lib/supabase');
const { count } = await supabase
  .from('branch_event_log')
  .select('*', { count: 'exact', head: true })
  .eq('branch_id', currentBranchId)
  .gt('version', syncState?.last_seen_event_version || 0);

console.log(`Will process ${count} new events (should be 0 on initialization)`);
```

## Common Issues & Solutions

### Issue: Still seeing event replay
**Symptoms:**
```
[EventStream] Found 100 new events...
[EventStream] Starting to process event ... (version 1, index 0/100)
```

**Solution:**
1. Check if `initializeSyncState()` was called:
   ```javascript
   const currentBranchId = localStorage.getItem('currentBranchId');
   const { db } = await import('./src/lib/db');
   const syncState = await db.sync_state.get(currentBranchId);
   console.log('Sync state exists:', !!syncState);
   console.log('Last seen version:', syncState?.last_seen_event_version);
   ```

2. If sync state is missing, manually initialize:
   ```javascript
   const { eventStreamService } = await import('./src/services/eventStreamService');
   await eventStreamService.initializeSyncState(currentBranchId);
   console.log('Sync state initialized manually');
   ```

### Issue: Sync state initialized but still replaying
**Symptoms:**
- Sync state exists with version > 0
- But events from version 1 are being processed

**Solution:**
- Check if `pullEvents()` is using correct lastVersion
- Add breakpoint in `eventStreamService.ts` line 246
- Verify `lastVersion` is not being reset to 0

### Issue: Events not processing at all
**Symptoms:**
- Create new transaction
- No event processing logs

**Solution:**
1. Check Realtime connection:
   ```javascript
   const { eventStreamService } = await import('./src/services/eventStreamService');
   const currentBranchId = localStorage.getItem('currentBranchId');
   const state = await eventStreamService.getCurrentState(currentBranchId);
   console.log('Current state:', state);
   ```

2. Verify event was emitted to Supabase:
   ```javascript
   const { supabase } = await import('./src/lib/supabase');
   const { data } = await supabase
     .from('branch_event_log')
     .select('*')
     .order('version', { ascending: false })
     .limit(5);
   console.log('Recent events:', data);
   ```

## Success Indicators

✅ **Fix is working correctly if:**
- Fresh install: No event replay on initial load
- Console shows: "Initialized sync state to version X"
- Console shows: "No new events for branch" after initialization
- Only new events are processed (1-2 events, not 100+)
- App loads quickly (< 2 seconds even with many events)

❌ **Fix needs attention if:**
- Console shows: "Found 100 new events" on fresh install
- Multiple "Processing event" logs for old versions
- Slow initial load (> 10 seconds)
- Network tab shows 100+ Supabase queries on startup

## Monitoring in Production

Add this to your monitoring/analytics:

```javascript
// Track event processing performance
const { eventStreamService } = await import('./src/services/eventStreamService');

eventStreamService.setOnEventsProcessed(async (result) => {
  if (result.processed > 50) {
    console.warn('⚠️ Processed more than 50 events at once', {
      processed: result.processed,
      last_version: result.last_version,
      errors: result.errors
    });
    
    // Send to analytics/monitoring
    // analytics.track('event_stream_bulk_processing', result);
  }
});
```

## Rollback Plan

If issues occur, you can temporarily disable event stream:

```javascript
// In OfflineDataContext.tsx, comment out event stream start:
// eventStreamService.start(currentBranchId, storeId).catch(...);

// Or stop it manually:
const { eventStreamService } = await import('./src/services/eventStreamService');
const currentBranchId = localStorage.getItem('currentBranchId');
await eventStreamService.stop(currentBranchId);
```

The app will fall back to periodic polling via `syncService.sync()`.





















