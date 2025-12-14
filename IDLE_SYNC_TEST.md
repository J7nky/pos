# Testing Idle Sync (No Actions)

## Current Configuration

**Idle sync interval:** `60 seconds` (when no unsynced records)  
**Active sync interval:** `15 seconds` (when there are unsynced records)

**Location:** `apps/store-app/src/contexts/OfflineDataContext.tsx` line 1327

---

## How to Test Idle Sync

### 1. Open Browser Console

Make sure console is visible (F12) and filter logs to see sync activity.

### 2. Just Wait and Watch

Don't do anything - just let the app sit idle.

### 3. Expected Console Logs (Every 60 Seconds)

You should see this pattern repeating:

```
⏰ [AUTO-SYNC] Setting auto-sync timer (60000ms delay, 0 unsynced records)
⏰ [AUTO-SYNC] Timer will fire at: 10:45:23 AM
```

Then after 60 seconds:

```
⏰ [AUTO-SYNC] ========================================
⏰ [AUTO-SYNC] Timer fired at: 10:45:23 AM
⏰ [AUTO-SYNC] Checking for sync...
📊 [AUTO-SYNC] Current unsynced count: 0
📊 [AUTO-SYNC] Sync service running: false
📊 [AUTO-SYNC] Online status: true
📊 [AUTO-SYNC] Store ID: <your-store-id>
✅ [AUTO-SYNC] Triggering auto-sync now...
📥 [AUTO-SYNC] Will upload 0 local changes and check for remote changes

🔄 [SYNC] Starting AUTO sync at 10:45:23 AM
⏱️  Setup time: XX.XXms
⏱️  Connectivity check: XX.XXms
⏱️  Validation cache refresh: XX.XXms
⏱️  Upload time: XX.XXms (0 records)
⏱️  Download time: XX.XXms (0 records)
⏱️  Pending syncs processing: XX.XXms
⏱️  Total sync time: XX.XXms

✅ [AUTO-SYNC] Sync completed in XXX ms
✅ [AUTO-SYNC] Sync result: {
  success: true,
  uploaded: 0,
  downloaded: 0,
  conflicts: 0,
  errors: []
}
⏰ [AUTO-SYNC] ========================================
```

### 4. What's Happening

Even without any actions, the sync:
- ✅ Checks connectivity
- ✅ Downloads remote changes (configuration updates, etc.)
- ✅ Processes pending syncs (retries)
- ✅ Runs change detection (optimized, minimal requests)
- ✅ Keeps the app in sync with Supabase

---

## Expected Behavior

### Idle System (No Actions)

| Time | Action | Requests |
|------|--------|----------|
| 0:00 | Idle sync runs | ~5-10 requests (change detection) |
| 1:00 | Idle sync runs | ~5-10 requests |
| 2:00 | Idle sync runs | ~5-10 requests |

**Total: ~150-300 requests/hour** (vs. 28,800 before!)

### With Change Detection Optimization

Most tables will show:
```
📊 Found 0 records for <table_name>
```

Or with change detection:
```
⏭️  syncTable: Skipping <table_name> - no changes detected
```

---

## What to Look For

### ✅ Good Signs

1. **Timer sets every 60 seconds** when idle
2. **Sync completes successfully** with 0 uploaded, 0 downloaded
3. **No errors** in the result
4. **Change detection working** - skips tables with no changes
5. **Event stream running** in the background

### ❌ Problems to Watch For

1. **Timer not firing** - Check `isOnline`, `storeId`, `currentBranchId`
2. **Sync errors** - Check network connection, Supabase status
3. **High request count** - Change detection might not be working
4. **Memory leaks** - Timer should clean up on unmount

---

## Network Tab Verification

### Open Network Tab (F12 → Network)

Filter by: `supabase.co`

### What You Should See Every 60 Seconds

**With Change Detection (Optimized):**
```
GET /rest/v1/stores?select=id&store_id=eq.<id>&updated_at=gte.<timestamp>&limit=0
GET /rest/v1/branches?select=id&store_id=eq.<id>&updated_at=gte.<timestamp>&limit=0
GET /rest/v1/products?select=id&(store_id.eq.<id>,is_global.eq.true)&updated_at=gte.<timestamp>&limit=0
... (about 5-10 more change detection queries)
```

**Total requests per sync:** ~5-15 (mostly change detection)

### If You See Many GET Requests with Full Data

That means change detection found changes or is not working. Check:
```sql
-- In Supabase, check if there are recent updates
SELECT table_name, last_synced_at 
FROM sync_metadata;
```

---

## Event Stream Verification

During idle sync, you should also see event stream activity:

```
🎯 [EventStream] Starting event stream for branch <branch_id>
[EventStream] Realtime subscribed for branch <branch_id>
[EventStream] Catching up from version <X> for branch <branch_id>
[EventStream] No new events for branch <branch_id>
```

This runs independently of periodic sync!

---

## Adjust Sync Interval (Optional)

If you want to change the idle interval:

**File:** `apps/store-app/src/contexts/OfflineDataContext.tsx` line 1327

```typescript
// Change from 60s to something else
const syncDelay = unsyncedCount > 0 ? 15000 : 300000; // 5 minutes when idle
```

**Recommended values:**
- **60 seconds** (current) - Good balance for configuration changes
- **300 seconds** (5 minutes) - Lower load, slower config updates
- **600 seconds** (10 minutes) - Minimal load, relies more on events

---

## Success Criteria

✅ **Periodic sync runs every 60 seconds** without user action  
✅ **Change detection working** - skips tables with no changes  
✅ **Event stream running** - subscribed to branch events  
✅ **Low network usage** - ~5-15 requests per sync  
✅ **No errors** - sync completes successfully  

---

## Ready to Test?

1. Open browser console
2. Let the app sit idle
3. Watch for sync logs every 60 seconds
4. Check Network tab for request count

Let me know what you see! 🚀

