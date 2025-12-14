# Event Timing Issue - FIXED ✅

## The Problem

When making a sale, you saw this error:
```
GET /rest/v1/bills?select=*&id=eq.e81bd... 406 (Not Acceptable)
[EventStream] Record bill/e81bd61b-2597-455e-b5fe-b8dbf850428c not found, skipping
```

## Root Cause

**Event was emitted BEFORE the bill was uploaded to Supabase:**

```
1. User completes sale
2. Bill saved to local IndexedDB
3. 🎯 Event emitted to Supabase ← TOO EARLY!
4. Other devices receive event
5. Other devices try to fetch bill from Supabase
6. ❌ Bill not found (hasn't been uploaded yet)
7. Bill uploads to Supabase (happens later in sync)
```

## The Fix

**Event is now emitted AFTER successful upload to Supabase:**

```
1. User completes sale
2. Bill saved to local IndexedDB
3. Sync runs (automatic after 15 seconds)
4. Bill uploads to Supabase ✅
5. 🎯 Event emitted AFTER successful upload
6. Other devices receive event
7. Other devices fetch bill from Supabase
8. ✅ Bill found and synced successfully
```

## What Changed

### Before (OfflineDataContext.tsx)
```typescript
// Event emission happened immediately after local save
await db.bills.add(bill);
await eventEmissionService.emitSalePosted(...); // ❌ Too early
```

### After (syncService.ts)
```typescript
// Event emission happens after successful upload
const { error } = await supabase.from('bills').upsert(batch);
if (!error) {
  await db.markAsSynced(tableName, record.id);
  await eventEmissionService.emitSalePosted(...); // ✅ Perfect timing
}
```

## Files Modified

1. **`OfflineDataContext.tsx`** - Removed event emission from createBill
2. **`syncService.ts`** - Added event emission after successful upload

## Testing

Now when you make a sale:

1. **On Device 1 (seller):**
   - Sale completes immediately (local save)
   - After 15 seconds, bill syncs to Supabase
   - Event emitted after successful upload
   - Console shows: `🎯 [Event] Emitted sale_posted event for bill <id>`

2. **On Device 2 (viewer):**
   - Receives event via Realtime
   - Fetches bill from Supabase
   - ✅ Bill exists and loads successfully
   - Console shows: `[EventStream] Updated bills/<id> in IndexedDB`
   - Sale appears in UI immediately

## Timing Diagram

```
Device 1                    Supabase                    Device 2
   |                            |                           |
   |--[Create Sale]------------>|                           |
   |  (Local IndexedDB)         |                           |
   |                            |                           |
   |--[Wait 15s for sync]------>|                           |
   |                            |                           |
   |--[Upload Bill]------------>|                           |
   |                            |--[Store Bill]             |
   |                            |                           |
   |--[Emit Event]------------->|                           |
   |                            |--[Write Event]            |
   |                            |                           |
   |                            |<--[Realtime Signal]-------|
   |                            |                           |
   |                            |<--[Fetch Bill]------------|
   |                            |--[Return Bill]----------->|
   |                            |                           |
   |                            |                      [Update UI]
```

## Why This is Better

✅ **No race conditions** - Bill always exists before event  
✅ **Reliable** - Other devices always find the record  
✅ **Efficient** - Event emitted in same sync cycle  
✅ **Scalable** - Works with any number of devices  

## Trade-off

**Slight delay before other devices see the sale (~15 seconds)**

This is acceptable because:
- User's own device shows sale immediately (local IndexedDB)
- 15 seconds is fast enough for POS coordination
- More reliable than instant (but broken) sync
- Configurable via `SYNC_CONFIG.syncInterval`

## If You Need Faster Sync

Reduce sync interval in `syncService.ts`:

```typescript
const SYNC_CONFIG = {
  syncInterval: 5000, // 5 seconds instead of 15
  // ... other config
};
```

But keep in mind: faster sync = more requests = higher costs.

---

## ✅ Status: FIXED

Try making a sale now - the error should be gone! 🎉

