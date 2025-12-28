# Branch Selection Implementation for Store App

## Overview

This implementation adds branch selection functionality for admin users and restricts cashiers and managers to their assigned branches.

## Changes Made

### 1. Created BranchSelectionScreen Component
**File**: `apps/store-app/src/components/BranchSelectionScreen.tsx`

A new full-screen component that appears after admin login to allow branch selection:
- **Beautiful UI**: Gradient background with card-based branch selection
- **Visual Feedback**: Selected branch is highlighted with checkmark
- **Branch Details**: Shows branch name, address, and phone
- **Validation**: Validates branch access before confirming selection
- **Persistence**: Saves branch preference to localStorage
- **Auto-select**: If only one branch exists, auto-selects it

### 2. Updated OfflineDataContext
**File**: `apps/store-app/src/contexts/OfflineDataContext.tsx`

Enhanced branch initialization logic based on user role:

#### For Admin Users (branch_id: null):
- Checks for stored branch preference in localStorage
- If valid preference exists, uses it automatically
- If no preference, waits for manual branch selection
- Does NOT auto-initialize to a default branch

#### For Manager/Cashier (branch_id: assigned):
- Automatically uses their assigned branch_id from user profile
- Validates the branch exists and is not deleted
- No manual selection allowed

#### Added to Context:
- `setCurrentBranchId`: Function to set the current branch (exposed for BranchSelectionScreen)

### 3. Updated App Component
**File**: `apps/store-app/src/App.tsx`

Created `BranchAwareAppContent` wrapper component:
- Checks if user is admin and hasn't selected a branch
- Shows `BranchSelectionScreen` when admin needs to select branch
- Shows normal app content after branch selection
- Managers/Cashiers bypass branch selection screen (auto-assigned)

## User Flows

### Admin Login Flow:
1. Admin logs in with credentials
2. System checks if branch is already selected (localStorage)
3. **If no branch selected**: Shows BranchSelectionScreen
4. Admin selects a branch from the list
5. System validates access and saves preference
6. Admin is redirected to the main app
7. Admin can later switch branches using the BranchSelector in the nav bar

### Manager/Cashier Login Flow:
1. Manager/Cashier logs in
2. System automatically uses their assigned branch_id
3. Goes directly to main app (no branch selection screen)
4. Cannot switch branches (BranchSelector shows read-only display)

## Branch Access Control

### Admin (role: 'admin', branch_id: null)
- ✅ Can access ALL branches in their store
- ✅ Must select a branch at login (if not previously selected)
- ✅ Can switch branches anytime via BranchSelector
- ✅ Branch selection persists across sessions (localStorage)

### Manager (role: 'manager', branch_id: assigned)
- ✅ Can ONLY access their assigned branch
- ✅ Automatically uses assigned branch (no selection screen)
- ❌ Cannot switch branches
- ✅ BranchSelector shows their branch name (read-only)

### Cashier (role: 'cashier', branch_id: assigned)
- ✅ Can ONLY access their assigned branch
- ✅ Automatically uses assigned branch (no selection screen)
- ❌ Cannot switch branches
- ✅ BranchSelector shows their branch name (read-only)

## Data Access

Once a branch is selected:
- All inventory operations are scoped to that branch
- All transactions are scoped to that branch
- All bills are scoped to that branch
- Cash drawer operations are scoped to that branch
- Products, Customers, and Suppliers remain store-level (shared)

## Testing Instructions

### Test 1: Admin User - First Login
1. Create an admin user with `role='admin'` and `branch_id=null`
2. Create multiple branches for the store
3. Log in with admin credentials
4. **Expected**: BranchSelectionScreen appears with all branches
5. Select a branch and click "Continue"
6. **Expected**: Main app loads with selected branch

### Test 2: Admin User - Subsequent Login
1. Log in with the same admin user (who selected branch in Test 1)
2. **Expected**: Goes directly to main app (no branch selection screen)
3. Check that the previously selected branch is active

### Test 3: Admin User - Branch Switching
1. Log in as admin
2. Look for BranchSelector in the navigation bar
3. Click on it and select a different branch
4. **Expected**: Branch switches successfully
5. All data refreshes for new branch

### Test 4: Manager/Cashier - Login
1. Create a manager/cashier user with `role='manager'` and `branch_id=<branch-id>`
2. Log in with their credentials
3. **Expected**: Goes directly to main app (no branch selection screen)
4. **Expected**: BranchSelector shows their assigned branch (read-only)
5. **Expected**: Cannot access data from other branches

### Test 5: Manager/Cashier - No Branch Assigned
1. Create a manager/cashier user with `role='manager'` and `branch_id=null`
2. Log in with their credentials
3. **Expected**: Error or warning that no branch is assigned
4. Contact admin to assign a branch

### Test 6: Branch Deletion
1. Log in as admin and select a branch
2. Have another admin delete that branch from settings
3. Refresh the app
4. **Expected**: System detects deleted branch and prompts to select another

## Files Modified

1. `apps/store-app/src/components/BranchSelectionScreen.tsx` (NEW)
2. `apps/store-app/src/contexts/OfflineDataContext.tsx` (MODIFIED)
3. `apps/store-app/src/App.tsx` (MODIFIED)

## Files Used (No Changes)

1. `apps/store-app/src/services/branchAccessValidationService.ts`
2. `apps/store-app/src/lib/branchHelpers.ts`
3. `apps/store-app/src/components/BranchSelector.tsx`
4. `apps/store-app/src/contexts/SupabaseAuthContext.tsx`

## Database Schema

The implementation relies on existing schema:

### users table:
```sql
- id: UUID
- email: STRING
- name: STRING
- role: 'admin' | 'manager' | 'cashier'
- store_id: UUID
- branch_id: UUID | NULL  -- NULL for admin, assigned for manager/cashier
```

### branches table:
```sql
- id: UUID
- store_id: UUID
- name: STRING
- address: STRING (optional)
- phone: STRING (optional)
- _deleted: BOOLEAN
```

## Edge Cases Handled

1. **Only one branch**: Auto-selects if admin has only one branch available
2. **No branches**: Shows error message
3. **Deleted branch**: Validates branch exists and is not deleted
4. **Invalid stored preference**: Clears localStorage and prompts selection
5. **Network issues**: Uses cached data and localStorage for offline operation
6. **Missing branch_id**: Managers/Cashiers without assigned branch show error

## Security Considerations

1. **Branch validation**: All branch access is validated via `BranchAccessValidationService`
2. **RLS policies**: Supabase RLS policies enforce branch-level access at database level
3. **Client-side validation**: Double-checks user role and branch access before operations
4. **Audit trail**: All branch switches are logged in console

## Future Enhancements

1. **Branch switching animation**: Add smooth transition when switching branches
2. **Recent branches**: Show recently accessed branches for quick switching
3. **Branch favorites**: Allow admins to favorite frequently used branches
4. **Branch statistics**: Show quick stats (e.g., "5 active transactions") on selection screen
5. **Branch permissions**: Fine-grained permissions per branch (e.g., read-only access)



























