---
name: Data Query and Initialization Flow Analysis
overview: Comprehensive analysis of the data-query and initialization flow, comparing intended behavior with actual implementation to identify mismatches, race conditions, and timing issues.
todos:
  - id: fix-module-access-timing
    content: Delay module access loading until data sync completes - add isDataReady state and update Layout.tsx/useAccessControl.ts
    status: completed
  - id: fix-branch-sync-race
    content: Ensure branch sync completes before showing BranchSelectionScreen - check branchSyncStatus.isComplete
    status: completed
  - id: fix-sync-state-init
    content: Initialize sync_state for all scenarios - enhance eventStreamService.catchUp() and call after performSync()
    status: completed
  - id: add-loading-states
    content: Add explicit isInitializing state to track data initialization progress
    status: completed
  - id: improve-error-handling
    content: Add explicit error handling for empty database + offline scenario with UI feedback
    status: completed
  - id: consolidate-sync-logic
    content: Add sync coordination to prevent performSync() and eventStreamService from running simultaneously
    status: completed
---

# Data Query and Initialization Flow Analysis

## 1. Intended Flow (Expected Behavior)

### Step-by-Step Sequence:

1. **User Signs In**

- User provides credentials (email/password)
- System validates credentials (Supabase or local fallback)
- If invalid: User remains logged out with explicit error message
- If valid: Proceed to initialization

2. **Pre-Main-System Data Loading**

- **Check local database state:**
    - If empty (no products, suppliers, customers): Perform `fullResync(storeId)`
    - If data exists: Fetch incremental updates using `branch_event_logs` via `eventStreamService.catchUp()`
- **This happens BEFORE entering main system**

3. **Admin Branch Selection**

- If user role is `admin` AND `users.branch_id === null`:
    - System MUST prompt user to select a branch
    - Branch selection screen appears
    - User selects branch → `setCurrentBranchId(branchId)`

4. **Store + Branch Context Initialization**

- Only AFTER branch is selected (or auto-assigned for manager/cashier):
    - Initialize store + branch context
    - Load branch-specific data

5. **Module Access Loading**

- Only AFTER store + branch context is ready:
    - Load user's permitted modules via `AccessControlService`
    - Allow normal system usage

### Constraints:

- No queries should run before authentication completes
- No data loading should happen before branch selection (for admin)
- Admin and non-admin flows must be correctly isolated
- Must handle slow networks and partial syncs gracefully

---

## 2. Actual Observed Flow (Based on Code)

### Authentication Phase (`SupabaseAuthContext.tsx`)

**Actual Behavior:**

1. User submits credentials via `signIn()`
2. If online: Tries Supabase auth first

- On success: Sets `userProfile` immediately (may use cached profile)
- On failure: Falls back to local auth

3. If offline: Uses local auth directly
4. **Issue**: `userProfile` is set BEFORE store data is loaded
5. **Issue**: Authentication success doesn't wait for data sync

**Code Location:** `apps/store-app/src/contexts/SupabaseAuthContext.tsx:488-625`

### Data Loading Phase (`OfflineDataContext.tsx`)

**Actual Behavior:**

#### For Admin Users:

1. `storeId` is set from `userProfile.store_id` (line 340)
2. **Branch sync happens BEFORE branch selection** (lines 676-855):

- `syncBranchesForAdmin()` runs when `storeId && userProfile && isOnline`
- Syncs branches to IndexedDB so BranchSelectionScreen can display them
- **This is CORRECT** - branches need to be available for selection

3. **Data initialization waits for branch selection** (lines 647-674):

- `initializeData()` only runs when `storeId && currentBranchId` are both available
- **This is CORRECT** - respects admin branch selection requirement

#### For Manager/Cashier:

1. `storeId` is set from `userProfile.store_id`
2. `currentBranchId` is auto-set from `userProfile.branch_id` (lines 856-962)
3. `initializeData()` runs immediately when both are available

**Issues Identified:**

1. **Race Condition: Module Access Loading**

- `Layout.tsx` loads module access when `userProfile` changes (line 68)
- This happens BEFORE `initializeData()` completes
- Module access queries IndexedDB for `role_permissions` and `user_permissions`
- **Problem**: These tables may not be synced yet if this is first login

2. **Full Resync vs Incremental Sync Logic**

- `initializeData()` checks if database is empty (lines 1285-1297)
- If empty AND online: Calls `fullResync(storeId)` (line 1305)
- If data exists AND online: Calls `performSync(true)` in background (line 1345)
- **Issue**: `performSync()` requires `currentBranchId`, but for admin users, this may not be set yet
- **Issue**: Incremental sync via `eventStreamService` starts AFTER branch selection (line 1722), but `performSync()` may try to run before

3. **Event Stream Service Timing**

- `eventStreamService.start()` is called when `storeId && currentBranchId && isOnline` (line 1722)
- This happens AFTER branch selection
- **Issue**: If `fullResync()` happened, `eventStreamService.catchUp()` will replay events from version 0 unless `sync_state` was initialized
- **Fix exists**: `initializeSyncState()` is called after `fullResync()` (documented in EVENT_STREAM_INITIALIZATION_FIX.md)

4. **Module Access Queries Too Early**

- `AccessControlService.loadUserPermissions()` queries:
    - `role_permissions` table (line 164)
    - `user_permissions` table (line 165)
- These queries happen in `Layout.tsx` when component mounts (line 68)
- **Problem**: If this is first login, these tables may not exist in IndexedDB yet
- **Mitigation**: Falls back to hardcoded defaults (line 232), but this is not ideal

5. **Admin Branch Selection Flow**

- `App.tsx` shows `BranchSelectionScreen` when `isAdmin && !currentBranchId` (line 67)
- `BranchSelectionScreen` queries branches from IndexedDB
- **Issue**: If admin logs in for first time, branches may not be synced yet
- **Mitigation**: `syncBranchesForAdmin()` runs in parallel, but there's a race condition

### Code Flow Summary:

```javascript
User Signs In
  ↓
userProfile set (SupabaseAuthContext)
  ↓
storeId set from userProfile.store_id (OfflineDataContext)
  ↓
[IF ADMIN] syncBranchesForAdmin() starts (parallel)
  ↓
[IF ADMIN] BranchSelectionScreen shown (App.tsx)
  ↓
[IF ADMIN] User selects branch → currentBranchId set
  ↓
[IF MANAGER/CASHIER] currentBranchId auto-set from userProfile.branch_id
  ↓
initializeData() runs (requires storeId && currentBranchId)
  ↓
[IF EMPTY DB] fullResync(storeId) → downloads all tables
  ↓
[IF DATA EXISTS] performSync(true) → incremental sync
  ↓
eventStreamService.start() → catchUp() → processes branch_event_logs
  ↓
Module access loaded (Layout.tsx) → queries role_permissions/user_permissions
```

---

## 3. Problems / Inconsistencies

### Critical Issues:

1. **Module Access Queries Before Data Sync**

- **Location**: `Layout.tsx:68`, `useAccessControl.ts:32`
- **Problem**: Module access is loaded when `userProfile` changes, which happens BEFORE `initializeData()` completes
- **Impact**: On first login, `role_permissions` and `user_permissions` tables may not exist in IndexedDB
- **Current Mitigation**: Falls back to hardcoded defaults, but this bypasses database configuration

2. **Race Condition: Admin Branch Sync**

- **Location**: `OfflineDataContext.tsx:676-855` (syncBranchesForAdmin) vs `App.tsx:73` (BranchSelectionScreen)
- **Problem**: `BranchSelectionScreen` may render before branches are synced
- **Impact**: Admin sees empty branch list, has to wait/retry
- **Current Mitigation**: `BranchSelectionScreen` has retry logic, but not ideal UX

3. **Incremental Sync Timing for Admin**

- **Location**: `OfflineDataContext.tsx:1343-1345`
- **Problem**: `performSync(true)` is called when `isOnline && unsyncedCount === 0`, but this happens in `initializeData()` which requires `currentBranchId`
- **Impact**: For admin users, incremental sync won't happen until branch is selected
- **Note**: This may be intentional, but the logic is unclear

4. **Event Stream Initialization Race**

- **Location**: `OfflineDataContext.tsx:1722` (eventStreamService.start)
- **Problem**: `eventStreamService.start()` calls `catchUp()` which may replay all events if `sync_state` wasn't initialized
- **Current Fix**: `initializeSyncState()` is called after `fullResync()`, but only if `fullResync()` happened
- **Impact**: If user has local data but no `sync_state`, events will be replayed

### Medium Priority Issues:

5. **Authentication Success Doesn't Wait for Data**

- **Location**: `SupabaseAuthContext.tsx:547`
- **Problem**: `signIn()` returns success immediately after auth, before data is loaded
- **Impact**: User can navigate to app before data is ready
- **Mitigation**: UI shows loading states, but navigation is allowed

6. **No Explicit Error Handling for Empty Database + Offline**

- **Location**: `OfflineDataContext.tsx:1337-1338`
- **Problem**: If database is empty and user is offline, system just logs a message
- **Impact**: User may see empty/broken UI without clear error message

### Low Priority Issues:

7. **Multiple Sync Mechanisms**

- `fullResync()` for empty database
- `performSync()` for incremental updates
- `eventStreamService.catchUp()` for real-time updates
- **Issue**: These may overlap or conflict
- **Impact**: Redundant queries, potential race conditions

---

## 4. Recommended Fixes

### High Priority Fixes:

#### Fix 1: Delay Module Access Loading Until Data is Ready

**Problem**: Module access queries happen before data sync completes**Solution**:

- Add a loading state in `OfflineDataContext` that tracks when initial data sync is complete
- Only load module access after `initializeData()` completes AND `loading.sync === false`
- Update `Layout.tsx` and `useAccessControl.ts` to wait for this state

**Files to Modify**:

- `apps/store-app/src/contexts/OfflineDataContext.tsx` - Add `isDataReady` state
- `apps/store-app/src/layouts/Layout.tsx` - Wait for `isDataReady` before loading modules
- `apps/store-app/src/hooks/useAccessControl.ts` - Wait for `isDataReady`

#### Fix 2: Ensure Branch Sync Completes Before Showing Selection Screen

**Problem**: Race condition between branch sync and BranchSelectionScreen**Solution**:

- `BranchSelectionScreen` should check `branchSyncStatus.isComplete` before rendering
- Show loading spinner while `branchSyncStatus.isSyncing === true`
- Only show branch list when `branchSyncStatus.isComplete === true`

**Files to Modify**:

- `apps/store-app/src/components/BranchSelectionScreen.tsx` - Check sync status
- `apps/store-app/src/App.tsx` - Pass sync status to BranchSelectionScreen

#### Fix 3: Initialize Sync State for All Scenarios

**Problem**: Event stream may replay events if `sync_state` doesn't exist**Solution**:

- Always initialize `sync_state` after any sync operation (full or incremental)
- Check for `sync_state` existence in `eventStreamService.catchUp()` and initialize if missing
- Ensure `initializeSyncState()` is called even when local data exists

**Files to Modify**:

- `apps/store-app/src/services/eventStreamService.ts` - Enhance `catchUp()` initialization
- `apps/store-app/src/contexts/OfflineDataContext.tsx` - Initialize sync state after `performSync()`

### Medium Priority Fixes:

#### Fix 4: Add Explicit Loading States

**Problem**: No clear indication when data is being loaded vs ready**Solution**:

- Add `isInitializing` state to `OfflineDataContext`
- Set to `true` when `initializeData()` starts
- Set to `false` when `initializeData()` completes
- Expose this state to components

**Files to Modify**:

- `apps/store-app/src/contexts/OfflineDataContext.tsx` - Add `isInitializing` state

#### Fix 5: Improve Error Handling for Empty Database + Offline

**Problem**: No clear error message when database is empty and offline**Solution**:

- Show explicit error message in UI when database is empty and offline
- Prevent navigation to main app until data is available
- Provide retry mechanism when connection is restored

**Files to Modify**:

- `apps/store-app/src/contexts/OfflineDataContext.tsx` - Add error state
- `apps/store-app/src/App.tsx` - Show error UI when data unavailable

### Low Priority Fixes:

#### Fix 6: Consolidate Sync Logic

**Problem**: Multiple sync mechanisms may overlap**Solution**:

- Ensure `performSync()` and `eventStreamService` don't run simultaneously
- Use a sync queue or lock mechanism
- Document the relationship between sync mechanisms

**Files to Modify**:

- `apps/store-app/src/contexts/OfflineDataContext.tsx` - Add sync coordination

---

## 5. Implementation Priority

1. **Fix 1** (Delay Module Access) - **CRITICAL** - Prevents permission queries on non-existent tables
2. **Fix 2** (Branch Sync Race) - **HIGH** - Improves admin UX
3. **Fix 3** (Sync State Init) - **HIGH** - Prevents event replay
4. **Fix 4** (Loading States) - **MEDIUM** - Improves UX clarity
5. **Fix 5** (Error Handling) - **MEDIUM** - Better error messages
6. **Fix 6** (Sync Consolidation) - **LOW** - Code quality improvement

---

## 6. Testing Scenarios

After fixes, test these scenarios:

1. **First Login (Empty Database)**

- Admin user, online
- Should: Sync branches → Select branch → Full resync → Load modules

2. **First Login (Empty Database, Offline)**

- Any user, offline
- Should: Show error message, prevent navigation

3. **Returning User (Has Data)**

- Manager/Cashier, online
- Should: Auto-assign branch → Incremental sync → Load modules

4. **Admin Branch Selection**

- Admin user, online, has data
- Should: Sync branches → Show selection → Select branch → Load modules

5. **Slow Network**

- Any user, slow connection
- Should: Show loading states, handle timeouts gracefully

6. **Partial Sync Failure**