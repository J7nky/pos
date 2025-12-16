# Branch Selection Logout Fix

## Problem

When an admin user logged out and then logged back in **without reloading the page**, the app would navigate directly to the home screen with the main branch data instead of showing the `BranchSelectionScreen`.

However, when the page was **reloaded** after logout and login, it worked correctly and showed the `BranchSelectionScreen`.

## Root Cause

The issue was caused by **stale state** in React components:

1. **localStorage was cleared** ✅ (working correctly)
2. **userProfile was reset** ✅ (working correctly)
3. **BUT currentBranchId state persisted** ❌ (the bug!)

When logging out without page reload:
- React component state (`currentBranchId`) remained in memory with the old branch ID
- The `BranchAwareAppContent` component checked: `isAdmin && !currentBranchId`
- Since `currentBranchId` still had a value from the previous session, it evaluated to `false`
- Result: Skipped `BranchSelectionScreen` and went directly to the app

When reloading the page:
- React components were completely destroyed and recreated
- `currentBranchId` started fresh as `null`
- Result: Showed `BranchSelectionScreen` correctly

## Solution

### 1. Enhanced Logout Process (SupabaseAuthContext.tsx)

Added comprehensive cleanup of branch preferences:

```typescript
const signOut = async (): Promise<void> => {
  try {
    // ... attendance tracking ...
    
    // Clear branch preference for current store
    if (userProfile?.store_id) {
      const branchPreferenceKey = `branch_preference_${userProfile.store_id}`;
      localStorage.removeItem(branchPreferenceKey);
      console.log('✅ Branch preference cleared for store:', userProfile.store_id);
    }
    
    // Clear ALL branch preferences (in case multiple stores)
    Object.keys(localStorage).forEach(key => {
      if (key.startsWith('branch_preference_')) {
        localStorage.removeItem(key);
      }
    });
    
    // ... rest of logout ...
  }
};
```

### 2. Reset Branch State on Logout (OfflineDataContext.tsx)

Added a `useEffect` to reset `currentBranchId` when the user logs out:

```typescript
// Reset branch when user logs out
useEffect(() => {
  if (!userProfile) {
    // User logged out, reset currentBranchId
    setCurrentBranchId(null);
    console.log('🔄 User logged out, branch ID reset');
  }
}, [userProfile]);
```

This ensures that when `userProfile` becomes `null` (on logout), the `currentBranchId` is also reset to `null`.

### 3. Improved Branch Initialization Logic (OfflineDataContext.tsx)

Enhanced the branch initialization to be more explicit:

```typescript
useEffect(() => {
  const initializeBranch = async () => {
    // Wait for both storeId and userProfile to be available
    if (!storeId || !userProfile) {
      return;
    }
    
    // Only initialize if we don't have a branch yet
    if (currentBranchId) {
      return;
    }
    
    // Admin logic: Check localStorage, but DON'T fallback to ensureDefaultBranch
    if (userProfile.role === 'admin' && userProfile.branch_id === null) {
      const storedBranchId = localStorage.getItem(`branch_preference_${storeId}`);
      if (storedBranchId) {
        // Validate stored branch
        const branch = await db.branches.get(storedBranchId);
        if (branch && !branch._deleted && branch.store_id === storeId) {
          setCurrentBranchId(storedBranchId);
          return;
        } else {
          // Invalid stored preference, clear it
          localStorage.removeItem(`branch_preference_${storeId}`);
        }
      }
      // No valid stored preference - admin needs to select branch
      console.log('⏳ Admin: Waiting for branch selection via BranchSelectionScreen');
      return; // DON'T call ensureDefaultBranch!
    }
    
    // Manager/Cashier logic remains the same
    // ...
  };
  
  initializeBranch();
}, [storeId, currentBranchId, userProfile]);
```

## Complete Logout → Login Flow (Fixed)

### Admin User Logout:

1. User clicks logout button
2. **SupabaseAuthContext.signOut()**:
   - Records employee check-out
   - Clears `branch_preference_${storeId}` from localStorage
   - Clears all branch preferences (pattern: `branch_preference_*`)
   - Supabase auth signOut
   - Sets `userProfile = null`
3. **OfflineDataContext detects userProfile = null**:
   - Triggers useEffect that sets `currentBranchId = null`
   - Logs: "🔄 User logged out, branch ID reset"

### Admin User Login (Same Session, No Reload):

1. User enters credentials and logs in
2. **SupabaseAuthContext** loads user profile
3. **OfflineDataContext** receives new `userProfile`
4. **Branch initialization runs**:
   - Checks localStorage: `branch_preference_${storeId}` → NOT FOUND
   - User is admin with `branch_id = null`
   - Does NOT call `ensureDefaultBranch()`
   - Returns early, leaving `currentBranchId = null`
5. **BranchAwareAppContent** evaluates:
   - `isAdmin = true` (role is admin)
   - `currentBranchId = null` (was reset on logout)
   - `needsBranchSelection = true`
6. **Result**: Shows `BranchSelectionScreen` ✅

### Manager/Cashier User:

- Not affected by this change
- Always uses their assigned `branch_id` from user profile
- No localStorage dependency
- Works correctly in all scenarios

## Testing Checklist

### ✅ Test 1: Admin Logout & Login (No Page Reload)
1. Login as admin
2. Select a branch
3. Navigate around the app
4. Logout (without reloading page)
5. Login again as the same admin
6. **Expected**: `BranchSelectionScreen` appears
7. **Expected**: No branch data is pre-loaded

### ✅ Test 2: Admin Logout & Login (With Page Reload)
1. Login as admin
2. Select a branch
3. Logout
4. Reload the page
5. Login again
6. **Expected**: `BranchSelectionScreen` appears

### ✅ Test 3: Multiple Admin Logins (Shared Device)
1. Login as Admin A, select Branch 1
2. Logout
3. Login as Admin B
4. **Expected**: `BranchSelectionScreen` appears
5. **Expected**: Branch 1 is NOT pre-selected

### ✅ Test 4: Manager/Cashier Unaffected
1. Login as Manager/Cashier
2. Verify their branch loads automatically
3. Logout
4. Login again
5. **Expected**: Same branch loads automatically
6. **Expected**: No `BranchSelectionScreen` shown

## Files Modified

1. ✅ `apps/store-app/src/contexts/SupabaseAuthContext.tsx`
   - Enhanced `signOut()` to clear all branch preferences
   
2. ✅ `apps/store-app/src/contexts/OfflineDataContext.tsx`
   - Added useEffect to reset `currentBranchId` on logout
   - Improved branch initialization logic to avoid fallback

## Console Logs for Debugging

When working correctly, you should see these logs:

**On Logout:**
```
✅ Employee check-out recorded
✅ Branch preference cleared for store: [store-id]
🔄 User logged out, branch ID reset
```

**On Login (Admin):**
```
⏳ Admin: Waiting for branch selection via BranchSelectionScreen
```

**On Branch Selection:**
```
✅ Branch preference cleared for store: [store-id]
```

## Summary

The fix ensures that:
1. ✅ **localStorage is cleared** on logout (all branch preferences)
2. ✅ **React state is reset** on logout (`currentBranchId = null`)
3. ✅ **No fallback branch** is assigned for admins
4. ✅ **BranchSelectionScreen appears** every time an admin logs in
5. ✅ **Manager/Cashier behavior** remains unchanged
6. ✅ **Works with or without** page reload

The bug is now fixed! 🎉







