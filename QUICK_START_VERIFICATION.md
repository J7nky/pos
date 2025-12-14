# Event-Driven Sync - Quick Start Verification

## ✅ Step 1: Database Migration - COMPLETE
You've run the SQL migration in Supabase SQL Editor.

## ✅ Step 2: Event Stream Integration - COMPLETE
The event stream service is now integrated into your app:
- Added import to `OfflineDataContext.tsx`
- Event stream starts when branch is selected
- Event stream stops when branch changes or user logs out

## Next Steps

### 3. Verify Database Setup in Supabase

Check that the migration created these objects:

```sql
-- Check table exists
SELECT * FROM branch_event_log LIMIT 1;

-- Check RPC function exists
SELECT proname FROM pg_proc WHERE proname = 'emit_branch_event';

-- Check indexes exist
SELECT indexname FROM pg_indexes WHERE tablename = 'branch_event_log';
```

**Expected results:**
- `branch_event_log` table exists (may be empty)
- `emit_branch_event` function exists
- Indexes: `idx_branch_event_log_branch_version`, `idx_branch_event_log_branch_occurred`, etc.

### 4. Test Event Emission

Let's add event emission to a simple business action first (sale completion).

**File to modify:** `apps/store-app/src/contexts/OfflineDataContext.tsx`

Find the `completeSale` or similar function and add event emission after the sale is saved.

### 5. Monitor Events

Once you start the app and complete a sale, check:

```sql
-- View events in Supabase
SELECT * FROM branch_event_log ORDER BY occurred_at DESC LIMIT 10;
```

### 6. Verify Event Stream in Browser Console

When you open the app, you should see:
```
🎯 [EventStream] Starting event stream for branch <branch_id>
[EventStream] Realtime subscribed for branch <branch_id>
```

When offline devices catch up:
```
[EventStream] Catching up from version <last_version> for branch <branch_id>
[EventStream] Found <N> new events for branch <branch_id>
```

---

## What's Working Now

1. **Event stream service is running** when you select a branch
2. **Realtime subscription is active** (wake-up mechanism)
3. **Catch-up sync runs on start** to pull any missed events
4. **Periodic sync still works** for configuration tables (every 60 seconds)

## What's Next

1. **Add event emission** to business actions (sales, payments, inventory)
2. **Test event processing** by completing actions on one device and seeing them on another
3. **Monitor performance** to verify reduced REST requests

---

## Testing Checklist

- [ ] App starts without errors
- [ ] Event stream logs appear when branch is selected
- [ ] Realtime subscription connects
- [ ] Initial catch-up runs (even if no events)
- [ ] Periodic sync still works for configuration tables

---

## Troubleshooting

### If event stream doesn't start:
- Check browser console for errors
- Verify `storeId` and `currentBranchId` are set
- Verify `isOnline` is true

### If Realtime doesn't connect:
- Check Supabase project settings (Realtime enabled?)
- Check RLS policies on `branch_event_log`
- Check browser console for WebSocket errors

### If no events appear:
- Events won't appear until you add event emission to business actions
- That's the next step (we'll do that next)

---

## Ready to Test?

Start your app and check the browser console. You should see event stream initialization logs when you select a branch.

