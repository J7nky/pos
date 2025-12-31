# Event Stream Initialization Fix - Avoiding Historical Event Replay

## Problem

When the app initializes, the event stream service was replaying **ALL historical events** from the beginning because:

1. On first app load after `fullResync()`, the `sync_state` table was empty
2. `eventStreamService.catchUp()` would default to `lastVersion = 0`
3. This caused `.gt('version', 0)` to pull ALL events from the event log
4. Each event would be fetched from Supabase and updated in IndexedDB
5. This becomes increasingly slow as events accumulate (100s or 1000s of events)

## Solution

Implemented a multi-layer fix:

### 1. Initialize Sync State After Full Resync

After `fullResync()` completes successfully, we now:
- Fetch the current max version from `branch_event_log` 
- Initialize `sync_state` with this version for all branches
- This ensures event stream only processes NEW events going forward

**File:** `apps/store-app/src/contexts/OfflineDataContext.tsx`

```typescript
// After fullResync completes
if (syncResult.success) {
  // Initialize event stream sync state for all branches
  const branches = await db.branches.where('store_id').equals(storeId).toArray();
  for (const branch of branches) {
    await eventStreamService.initializeSyncState(branch.id);
  }
}
```

### 2. New Method: `initializeSyncState()`

Added to `EventStreamService` to set initial sync state:

**File:** `apps/store-app/src/services/eventStreamService.ts`

```typescript
async initializeSyncState(branchId: string): Promise<void> {
  // Fetch current max version from branch_event_log
  const { data } = await supabase
    .from('branch_event_log')
    .select('version')
    .eq('branch_id', branchId)
    .order('version', { ascending: false })
    .limit(1)
    .single();

  const maxVersion = data?.version || 0;
  
  // Set sync state to current max version
  await this.updateSyncState(branchId, maxVersion);
}
```

### 3. Smart Initialization in catchUp()

Added optimization to `catchUp()` method:
- If no sync state exists BUT database has data
- Automatically call `initializeSyncState()` before processing
- This handles cases where sync_state got deleted but data still exists

```typescript
async catchUp(branchId: string, storeId: string) {
  const syncState = await this.getSyncState(branchId);
  let lastVersion = syncState?.last_seen_event_version || 0;

  // OPTIMIZATION: If no sync state but DB has data
  if (!syncState && lastVersion === 0) {
    const hasData = await db.products.limit(1).count() > 0 || 
                    await db.bills.limit(1).count() > 0;

    if (hasData) {
      // Initialize to current max version to avoid replay
      await this.initializeSyncState(branchId);
      const newSyncState = await this.getSyncState(branchId);
      lastVersion = newSyncState?.last_seen_event_version || 0;
    }
  }

  // Continue with catchUp using correct lastVersion
  // ...
}
```

## Expected Behavior

### Before Fix
```
App starts → fullResync() downloads all tables
           → eventStreamService.start() called
           → catchUp() with lastVersion = 0
           → Processes events 1-100 (fetching each from Supabase)
           → Processes events 101-200
           → ... continues for ALL historical events
           → Slow initial load (seconds to minutes)
```

### After Fix
```
App starts → fullResync() downloads all tables
           → Initialize sync_state to current max version (e.g., 500)
           → eventStreamService.start() called
           → catchUp() with lastVersion = 500
           → No events to process (already at latest)
           → Fast initial load (milliseconds)
```

## Testing Checklist

### Test 1: Fresh App Install
1. Clear IndexedDB completely (Dev Tools → Application → IndexedDB → Delete)
2. Clear sync_state table specifically
3. Reload app
4. **Expected:** 
   - Full resync downloads all tables
   - Console shows: "Initializing event stream sync state for all branches"
   - Event stream shows: "No new events for branch" (not replaying events)

### Test 2: Existing App with Data
1. Keep existing data in IndexedDB
2. Manually delete `sync_state` table entries
3. Reload app
4. **Expected:**
   - No full resync (data exists)
   - Event stream detects: "Database has data but no sync state"
   - Automatically initializes to current max version
   - Continues normally without replay

### Test 3: New Event Created
1. After initialization, create a new transaction/payment
2. **Expected:**
   - Event is emitted to branch_event_log
   - Realtime signal triggers catchUp()
   - Only the NEW event is processed
   - Sync state updated to new max version

### Test 4: Multiple Branches
1. Store has 3+ branches
2. Clear IndexedDB and reload
3. **Expected:**
   - Full resync completes
   - Sync state initialized for ALL branches
   - Console shows: "Initialized sync state for branch X (Branch Name)"
   - Each branch only processes new events going forward

## Monitoring

Watch for these log messages:

### Good Signs ✅
```
[EventStream] Initializing sync state for branch <id>...
[EventStream] Found max version 500 for branch <id>
[EventStream] ✅ Sync state initialized to version 500
[EventStream] Catching up from version 500 for branch <id>
[EventStream] No new events for branch <id>
```

### Warning Signs ⚠️
```
[EventStream] Catching up from version 0 for branch <id>
[EventStream] Found 100 new events for branch <id> (versions 1 to 100)
[EventStream] Starting to process event ... (version 1, index 0/100)
```
If you see this, it means sync state wasn't properly initialized.

## Performance Impact

### Before
- Initial load: **5-30 seconds** depending on event count
- Network: 100s of Supabase queries (one per event)
- Unnecessary work: Re-fetching records already synced by fullResync()

### After
- Initial load: **Instant** (no events to process)
- Network: 1 query to get max version, then done
- Efficient: Only processes truly new events

## Edge Cases Handled

1. **No events exist yet:** Initializes to version 0, works correctly
2. **Database error:** Catches error, logs warning, continues (degrades gracefully)
3. **sync_state table doesn't exist:** Returns null, system continues to work
4. **Concurrent catchUp calls:** Prevented by `isProcessing` flag
5. **Branch added after initial sync:** Will initialize on first catchUp

## Files Modified

1. `apps/store-app/src/services/eventStreamService.ts`
   - Added `initializeSyncState()` method
   - Enhanced `catchUp()` with smart initialization
   - Improved logging

2. `apps/store-app/src/contexts/OfflineDataContext.tsx`
   - Calls `initializeSyncState()` after fullResync completes
   - Initializes all branches in the store

## Future Improvements

1. **Batch Initialization:** Could fetch max version for all branches in one query
2. **Background Sync:** Initialize sync state in background while UI loads
3. **Metrics:** Track how many events would have been replayed (saved time)
4. **Migration:** Add migration to initialize sync_state for existing users














