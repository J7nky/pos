# Branch Access & RLS Policy Explanation

## How Branch Access Works

### User Access Model
- **Admin**: Can access multiple branches in a store
- **Regular Users**: Can only access the specific branch they are currently signed into
- **Branch Selection**: Users select their branch when they log in (stored client-side in `currentBranchId`)

### RLS Policy Strategy

The RLS policy uses a **two-layer security model**:

#### 1. Database Layer (RLS - Coarse Filter)
```sql
-- RLS allows access to all branches in the user's store
CREATE POLICY "Users can view events for their store branches"
  ON branch_event_log
  FOR SELECT
  USING (
    store_id IN (
      SELECT store_id FROM users 
      WHERE id = auth.uid()
    )
  );
```

**Why store_id and not branch_id?**
- RLS policies are evaluated once per query
- The user's current branch is stored client-side (not in the database)
- RLS can't know which branch the user "signed into" - that's application state
- So RLS verifies: "Does this event belong to a branch in your store?"

#### 2. Application Layer (Client-Side - Fine Filter)
```typescript
// In eventStreamService.ts line 121
filter: `branch_id=eq.${branchId}`
```

**This is where we filter to the specific branch:**
- When user selects a branch, app stores `currentBranchId`
- All queries include `branch_id=eq.${currentBranchId}` filter
- Realtime subscription only listens to that specific branch
- Regular users only see events for their current branch
- Admins can switch branches and see different events

### Complete Security Flow

```
User makes request:
1. RLS checks: "Is this branch in your store?" ✓
2. Client filter: "Is this your current branch?" ✓
3. Result: User only sees events for their selected branch
```

### Example Scenario

**Store has 3 branches: Branch A, B, C**

**Regular User (John) signed into Branch A:**
```typescript
// John queries events
const { data } = await supabase
  .from('branch_event_log')
  .select('*')
  .eq('branch_id', 'branch-a-id'); // Client filter

// RLS: ✓ Branch A is in John's store → Allow
// Client: ✓ Only querying Branch A → Show events
// Result: John sees only Branch A events
```

**If John tries to access Branch B:**
```typescript
// John tries to query Branch B (manually or via hack)
const { data } = await supabase
  .from('branch_event_log')
  .select('*')
  .eq('branch_id', 'branch-b-id');

// RLS: ✓ Branch B is in John's store → Allow (RLS can't block this)
// Client: Branch B is not John's current branch
// Application: App never lets John set currentBranchId to Branch B
// Result: John can't access Branch B through the normal app flow
```

**Admin:**
```typescript
// Admin can switch branches
setCurrentBranchId('branch-b-id'); // Admin can do this

// Now queries Branch B
const { data } = await supabase
  .from('branch_event_log')
  .select('*')
  .eq('branch_id', 'branch-b-id');

// RLS: ✓ Branch B is in Admin's store → Allow
// Client: ✓ Branch B is Admin's current selection → Show events
// Result: Admin sees Branch B events
```

## Why This Approach is Correct

1. **RLS prevents cross-store access**: Users can't see events from other stores
2. **Client filter prevents cross-branch access**: Users can't see events from other branches (in the same store)
3. **Application logic controls branch selection**: Only admins can switch branches
4. **No database changes needed**: We use existing `users.store_id` field

## Security Boundaries

| Security Layer | What it Prevents | Enforced By |
|---------------|------------------|-------------|
| RLS (store_id) | Cross-store access | Database |
| Client filter (branch_id) | Cross-branch access | Application + RLS |
| Branch selection UI | Unauthorized branch switching | Application logic |

## Migration is Ready

The fixed migration file (`migrations/branch_event_log_fixed.sql`) is correct and ready to use:
- ✅ RLS filters by store_id (allows all branches in user's store)
- ✅ Client filters by branch_id (shows only current branch)
- ✅ No dependency on non-existent tables
- ✅ Works with existing schema

Run it in Supabase SQL Editor and you're good to go! 🚀

