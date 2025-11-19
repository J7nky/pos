# Auto-Sync Debugging Guide

## What Was Added

I've added comprehensive console logging to track the auto-sync mechanism in real-time. You'll now see exactly when sync triggers, what it does, and what data it fetches.

## How to Use

### 1. Open Browser Console

**In Browser:**
- Press `F12` or `Ctrl+Shift+I` (Windows/Linux)
- Press `Cmd+Option+I` (Mac)

**In Electron App:**
- Press `Ctrl+Shift+I` (Windows/Linux)
- Press `Cmd+Option+I` (Mac)

### 2. Filter Logs (Optional)

To see only sync-related logs, filter by:
- `[AUTO-SYNC]` - Auto-sync timer logs
- `[SYNC]` - Sync process logs
- `[FOCUS-SYNC]` - Window focus sync logs
- `[CONNECTION]` - Connection restore logs

### 3. What You'll See

#### When You Make a Change:

```
🔄 [AUTO-SYNC] Resetting auto-sync timer (clearing existing timer)
⏰ [AUTO-SYNC] Setting auto-sync timer (5000ms delay, 1 unsynced records)
⏰ [AUTO-SYNC] Timer will fire at: 10:52:15 PM
```

#### When Timer Fires (5-30 seconds later):

```
⏰ [AUTO-SYNC] ========================================
⏰ [AUTO-SYNC] Timer fired at: 10:52:15 PM
⏰ [AUTO-SYNC] Checking for unsynced data...
📊 [AUTO-SYNC] Current unsynced count: 1
📊 [AUTO-SYNC] Sync service running: false
📊 [AUTO-SYNC] Online status: true
📊 [AUTO-SYNC] Store ID: abc-123-def
✅ [AUTO-SYNC] Triggering auto-sync now...
```

#### During Sync:

```
🔄 [SYNC] Starting AUTO sync at 10:52:15 PM
⏱️  Setup time: 12.34ms
⏱️  Connectivity check: 45.67ms
⏱️  Validation cache refresh: 23.45ms
⏱️  Upload time: 123.45ms (1 records)
📊 Sync customers: using updated_at field (hasUpdatedAt: true)
📊 Found 0 records for customers
⏱️  Download time: 234.56ms (0 records)
✅ [SYNC] Sync completed in 456ms: {
  success: true,
  uploaded: 1,
  downloaded: 0,
  conflicts: 0,
  errors: 'none'
}
🔄 [SYNC] Refreshing local data after sync...
✅ [SYNC] Local data refreshed
🏁 [SYNC] Sync process finished at 10:52:16 PM
```

#### After Sync Completes:

```
✅ [AUTO-SYNC] Sync completed in 456 ms
✅ [AUTO-SYNC] Sync result: {
  success: true,
  uploaded: 1,
  downloaded: 0,
  conflicts: 0,
  errors: []
}
⏰ [AUTO-SYNC] ========================================
```

## Testing Multi-Device Sync

### Test Scenario 1: Device A → Device B

**Device A (Electron):**
1. Open console
2. Change a customer balance
3. Watch for:
   ```
   ⏰ [AUTO-SYNC] Setting auto-sync timer (5000ms delay, 1 unsynced records)
   ```
4. After 5 seconds:
   ```
   ✅ [AUTO-SYNC] Sync completed in XXXms
   uploaded: 1
   ```

**Device B (Browser):**
1. Open console
2. Wait for auto-sync (happens every 30 seconds when idle)
3. Watch for:
   ```
   📊 Sync customers: using updated_at field
   📊 Found 1 records for customers  ← Should see this!
   downloaded: 1
   ```
4. Verify UI updates with new balance

### Test Scenario 2: Manual Database Edit

**Supabase:**
1. Update customer balance manually:
   ```sql
   UPDATE customers SET lb_balance = 0 WHERE id = 'xxx';
   ```

**Device (Any):**
1. Open console
2. Wait up to 30 seconds for auto-sync
3. **BEFORE migration:** You'll see:
   ```
   📊 Found 0 records for customers  ← No records found!
   ```
4. **AFTER migration:** You'll see:
   ```
   📊 Found 1 records for customers  ← Record found!
   downloaded: 1
   ```

## Key Metrics to Watch

### Sync Timing:
- **Upload time:** Should be < 500ms for small changes
- **Download time:** Should be < 1000ms
- **Total sync:** Should be < 2000ms

### Sync Frequency:
- **Active changes:** Every 5 seconds
- **Idle state:** Every 30 seconds
- **Window focus:** 1 second after focus

### Data Transfer:
- **uploaded:** Number of records sent to Supabase
- **downloaded:** Number of records received from Supabase
- **conflicts:** Should be 0 (or very rare)

## Common Patterns

### Pattern 1: Successful Upload
```
uploaded: 1, downloaded: 0
```
Your change was sent to Supabase successfully.

### Pattern 2: Successful Download
```
uploaded: 0, downloaded: 1
```
You received a change from another device.

### Pattern 3: Bidirectional Sync
```
uploaded: 2, downloaded: 3
```
Both devices had changes that were synchronized.

### Pattern 4: No Changes
```
uploaded: 0, downloaded: 0
```
Sync ran but found nothing to sync (normal when idle).

## Troubleshooting

### Issue: "Found 0 records" but you made changes

**Possible causes:**
1. **Missing triggers** - Apply the migration I created
2. **Wrong store_id** - Check the store ID matches
3. **Sync metadata issue** - Clear and resync:
   ```javascript
   // In browser console
   localStorage.removeItem('last_synced_at');
   location.reload();
   ```

### Issue: Sync not triggering

**Check these logs:**
```
⏭️  [AUTO-SYNC] Not setting timer: {
  isOnline: false,  ← Should be true
  hasStoreId: false, ← Should be true
  isSyncing: true   ← Should be false
}
```

### Issue: Downloaded but UI not updating

**Look for:**
```
🔄 [SYNC] Refreshing local data after sync...
✅ [SYNC] Local data refreshed
```

If missing, there's an issue with `refreshData()`.

## Performance Monitoring

### Good Performance:
```
✅ [SYNC] Sync completed in 456ms
⏱️  Upload time: 123ms (1 records)
⏱️  Download time: 234ms (0 records)
```

### Slow Performance (investigate):
```
✅ [SYNC] Sync completed in 5000ms  ← Too slow!
⏱️  Upload time: 2000ms (1 records)  ← Too slow!
⏱️  Download time: 3000ms (0 records) ← Too slow!
```

## Expected Timeline

### Scenario: Change on Device A, View on Device B

| Time | Device A | Device B |
|------|----------|----------|
| T+0s | User changes balance | - |
| T+0s | Timer set (5s) | - |
| T+5s | Upload to Supabase | - |
| T+5s | Upload complete | - |
| T+10s | - | Timer fires (30s idle) |
| T+10s | - | Download from Supabase |
| T+10s | - | UI updates ✅ |

**Total: 5-30 seconds** depending on Device B's timer.

## Quick Test Commands

### Force Immediate Sync:
```javascript
// In browser console
// This will trigger a manual sync immediately
window.location.reload();
```

### Check Unsynced Count:
The logs will show this automatically:
```
📊 [AUTO-SYNC] Current unsynced count: 1
```

### Check Last Sync Time:
```javascript
// In browser console
localStorage.getItem('last_synced_at');
```

## What to Report

If sync isn't working, share these logs:
1. The `[AUTO-SYNC]` section showing timer setup
2. The `[SYNC]` section showing upload/download counts
3. Any error messages
4. The `📊 Found X records for customers` line

This will help identify exactly where the sync is failing.
