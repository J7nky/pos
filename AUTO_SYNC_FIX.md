# Auto-Sync Fix - Wait for Branch Selection

**Date**: December 11, 2025  
**Issue**: Auto-sync timer was being set and triggered BEFORE admin users selected a branch

## 🔴 Problem

After the data fetching fix, auto-sync was still triggering before branch selection because:

1. ❌ `resetAutoSyncTimer()` only checked for `storeId`, not `currentBranchId`
2. ❌ `performSync()` only checked for `storeId`, not `currentBranchId`
3. ❌ `fullResync()` only checked for `storeId`, not `currentBranchId`
4. ❌ `debouncedSync()` only checked for `isOnline`, not `currentBranchId`

### Evidence (User's Logs):
```
⏰ [AUTO-SYNC] Setting auto-sync timer (30000ms delay, 0 unsynced records)
⏰ [AUTO-SYNC] Timer will fire at: 11:05:59 PM

[Before branch selection, sync triggered]

🔄 [SYNC] Starting AUTO sync at 11:05:59 PM
📊 Full sync for journal_entries...
📊 Full sync for balance_snapshots...
...
```

This happened **before** the user selected a branch, causing:
- Sync queries without `branchId`
- Store-level queries instead of branch-specific queries
- Incorrect data loaded across all branches

---

## ✅ Solution

Added `currentBranchId` checks to ALL sync-related functions:

### 1. Auto-Sync Timer (`resetAutoSyncTimer`)

**Before:**
```typescript
if (isOnline && storeId && !isSyncing) {
  // Set timer ❌ Will trigger without branch
}
```

**After:**
```typescript
if (isOnline && storeId && currentBranchId && !isSyncing) {
  // Set timer ✅ Only when branch is selected
}
```

### 2. Sync Function (`performSync`)

**Before:**
```typescript
if (!storeId || isSyncing) {
  return { success: false, errors: ['No store ID or sync in progress'] };
}
```

**After:**
```typescript
if (!storeId || !currentBranchId || isSyncing) {
  console.log('⏭️ [SYNC] Skipping sync:', { 
    hasStoreId: !!storeId, 
    hasCurrentBranchId: !!currentBranchId,
    isSyncing 
  });
  return { success: false, errors: ['No store ID, branch ID, or sync in progress'] };
}
```

### 3. Full Resync Function (`fullResync`)

**Before:**
```typescript
if (!storeId) {
  return { success: false, errors: ['No store ID available'] };
}
```

**After:**
```typescript
if (!storeId || !currentBranchId) {
  console.log('⏭️ [FULL-RESYNC] Skipping full resync:', { 
    hasStoreId: !!storeId, 
    hasCurrentBranchId: !!currentBranchId 
  });
  return { success: false, errors: ['No store ID or branch ID available'] };
}
```

### 4. Debounced Sync (`debouncedSync`)

**Before:**
```typescript
if (!isOnline || isSyncing) return;
```

**After:**
```typescript
if (!isOnline || !currentBranchId || isSyncing) return;
```

---

## 📊 New Flow

### Before Fix (Wrong):
```
Admin Login
  ↓
storeId available, branchId = null
  ↓
❌ resetAutoSyncTimer() → Timer set
  ↓
❌ Timer fires after 30 seconds
  ↓
❌ performSync() runs with branchId = null
  ↓
❌ Data synced without branch filtering
  ↓
💥 Wrong data loaded
```

### After Fix (Correct):
```
Admin Login
  ↓
storeId available, branchId = null
  ↓
✅ resetAutoSyncTimer() → Checks branchId
  ↓
✅ Log: "Not setting timer: hasCurrentBranchId: false"
  ↓
[Admin selects branch]
  ↓
currentBranchId available
  ↓
✅ resetAutoSyncTimer() → Timer set now
  ↓
✅ Timer fires after 30 seconds
  ↓
✅ performSync() runs with BOTH storeId AND branchId
  ↓
✅ Data synced with correct branch filtering
```

---

## 📂 Files Modified

1. ✅ `apps/store-app/src/contexts/OfflineDataContext.tsx`
   - Updated `resetAutoSyncTimer()` - Added `currentBranchId` check
   - Updated `performSync()` - Added `currentBranchId` validation
   - Updated `fullResync()` - Added `currentBranchId` validation
   - Updated `debouncedSync()` - Added `currentBranchId` guard
   - Updated all dependency arrays to include `currentBranchId`
   - Updated console logs to show `hasCurrentBranchId` status

---

## ✅ What You'll See Now

### Before Branch Selection:
```
⏳ Waiting for branch selection before loading data...
  hasStoreId: true
  hasCurrentBranchId: false
  userRole: admin

⏭️ [AUTO-SYNC] Not setting timer: {
  isOnline: true,
  hasStoreId: true,
  hasCurrentBranchId: false,  ← NEW
  isSyncing: false
}
```

### After Branch Selection:
```
✅ Both storeId and currentBranchId available, initializing data...
  storeId: "abc-123"
  currentBranchId: "branch-456"
  userRole: admin

⏰ [AUTO-SYNC] Setting auto-sync timer (30000ms delay, 0 unsynced records)
⏰ [AUTO-SYNC] Timer will fire at: 11:36:30 PM
```

### If Sync Attempted Without Branch:
```
⏭️ [SYNC] Skipping sync: {
  hasStoreId: true,
  hasCurrentBranchId: false,  ← Prevents sync
  isSyncing: false
}
```

---

## 🧪 Testing Checklist

### Admin User Flow:
- [ ] Login as admin
- [ ] Before selecting branch, check console
- [ ] Should see: "Not setting timer: hasCurrentBranchId: false"
- [ ] Should NOT see: "Setting auto-sync timer"
- [ ] Should NOT see: "Starting AUTO sync"
- [ ] Select a branch
- [ ] Should NOW see: "Setting auto-sync timer"
- [ ] Wait 30 seconds
- [ ] Should see: "Starting AUTO sync" (with correct branchId)

### Manager/Cashier User Flow:
- [ ] Login as manager/cashier
- [ ] Branch auto-assigned immediately
- [ ] Should see: "Setting auto-sync timer" right away
- [ ] Timer and sync work normally

### Manual Sync:
- [ ] Try manual sync button before branch selection
- [ ] Should see: "Skipping sync: hasCurrentBranchId: false"
- [ ] Select branch
- [ ] Manual sync should work

---

## 🎯 Key Improvements

1. **✅ No Premature Sync**: Auto-sync never triggers without branch selection
2. **✅ Better Logs**: All logs now show `hasCurrentBranchId` status
3. **✅ Consistent Guards**: All sync functions check for `currentBranchId`
4. **✅ Clear Feedback**: Console clearly shows why sync is skipped
5. **✅ Branch Isolation**: Data always synced with correct branch context

---

## 🔍 Related Changes

This fix complements:
1. ✅ **Data Fetching Fix** - Data loading waits for branch
2. ✅ **Branch Selection UX** - Branch selection shows immediately
3. ✅ **Auto-Sync Fix** - Auto-sync waits for branch (this fix)

Together, these ensure:
- ✅ No data loaded without branch context
- ✅ No sync triggered without branch context
- ✅ Complete branch isolation
- ✅ Proper data flow sequence

---

## 📝 Code Patterns

### When Adding New Sync Logic:

```typescript
// ✅ ALWAYS check both storeId AND currentBranchId
if (!storeId || !currentBranchId) {
  console.log('Cannot sync without both IDs');
  return;
}

// ✅ ALWAYS include both in dependency arrays
}, [storeId, currentBranchId, otherDeps]);

// ✅ ALWAYS log both states
console.log('Sync check:', {
  hasStoreId: !!storeId,
  hasCurrentBranchId: !!currentBranchId
});
```

---

## ⚠️ Important Notes

### Why This Matters:

**Without currentBranchId**, sync queries look like:
```sql
SELECT * FROM inventory_items WHERE store_id = 'abc-123'
-- Returns items from ALL branches ❌
```

**With currentBranchId**, sync queries look like:
```sql
SELECT * FROM inventory_items 
WHERE store_id = 'abc-123' AND branch_id = 'branch-456'
-- Returns items from ONLY this branch ✅
```

### Affected Tables:
All branch-specific tables:
- inventory_items
- inventory_bills
- transactions
- bills
- bill_line_items
- cash_drawer_accounts
- cash_drawer_sessions
- journal_entries
- balance_snapshots
- reminders
- employee_attendance

---

## ✅ Success Criteria

The fix is successful when:

1. ✅ No auto-sync timer set before branch selection
2. ✅ Console shows "Not setting timer: hasCurrentBranchId: false"
3. ✅ No sync triggered before branch selection
4. ✅ Timer only sets after branch selection
5. ✅ All sync functions validate currentBranchId
6. ✅ Logs clearly show branch selection status
7. ✅ Manager/cashier users unaffected (auto-assigned branch)

---

**Status**: ✅ **FIXED**

All sync functions now properly wait for branch selection before triggering.
