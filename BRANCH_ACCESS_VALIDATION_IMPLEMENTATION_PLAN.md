# Branch Access Validation Implementation Plan

## 🎯 Objective
Implement branch-based access control where:
- **Admin**: Can access all branches (`branch_id: null`)
- **Manager/Cashier**: Can only access their assigned branch (`branch_id: "branch-id-123"`)
- **Validation**: Enforced on all branch-scoped operations
- **Edge Cases**: Handled gracefully (deleted branches, reassignment, etc.)

---

## 📋 Phase 1: Database Schema Changes

### 1.1 Update Employee/User Interface
**File**: `apps/store-app/src/types/index.ts`

```typescript
export interface Employee {
  id: string;
  store_id: string;
  email: string;
  name: string;
  role: 'admin' | 'manager' | 'cashier';
  branch_id: string | null; // ✅ NEW: null for admin, branch ID for manager/cashier
  // ... existing fields
}
```

### 1.2 Update Supabase Database Schema
**File**: `apps/store-app/supabase/migrations/[timestamp]_add_branch_id_to_users.sql`

```sql
-- Add branch_id column to users table
ALTER TABLE users 
ADD COLUMN IF NOT EXISTS branch_id UUID NULL;

-- Add foreign key constraint
ALTER TABLE users
ADD CONSTRAINT fk_users_branch_id 
FOREIGN KEY (branch_id) 
REFERENCES branches(id) 
ON DELETE SET NULL; -- If branch is deleted, set branch_id to NULL

-- Add index for performance
CREATE INDEX IF NOT EXISTS idx_users_branch_id ON users(branch_id);

-- Add comment
COMMENT ON COLUMN users.branch_id IS 
  'Branch ID for manager/cashier (null for admin who can access all branches)';
```

### 1.3 Update IndexedDB Schema
**File**: `apps/store-app/src/lib/db.ts`

```typescript
// In version migration (add new version)
this.version(32).stores({
  // ... existing stores
  users: 'id, store_id, email, name, role, branch_id, updated_at, lbp_balance, usd_balance, working_hours_start, working_hours_end, working_days, _synced, _deleted',
  // ... rest
});
```

### 1.4 Update UserProfile Interface
**File**: `apps/store-app/src/contexts/SupabaseAuthContext.tsx`

```typescript
interface UserProfile {
  id: string;
  email: string;
  name: string;
  role: 'admin' | 'manager' | 'cashier';
  store_id: string;
  branch_id: string | null; // ✅ NEW
  // ... existing fields
}
```

---

## 📋 Phase 2: Branch Access Validation Service

### 2.1 Create Branch Access Validation Service
**File**: `apps/store-app/src/services/branchAccessValidationService.ts` (NEW)

```typescript
import { db } from '../lib/db';
import { Employee } from '../types';

export class BranchAccessValidationService {
  /**
   * Validates if a user can access a specific branch
   * @throws Error if access is denied
   */
  static async validateBranchAccess(
    userId: string,
    storeId: string,
    branchId: string
  ): Promise<void> {
    // Get user from database
    const user = await db.users.get(userId);
    
    if (!user) {
      throw new Error(`User not found: ${userId}`);
    }
    
    // Validate user belongs to store
    if (user.store_id !== storeId) {
      throw new Error(`User ${userId} does not belong to store ${storeId}`);
    }
    
    // Admin can access all branches
    if (user.role === 'admin') {
      return; // ✅ Access granted
    }
    
    // Manager/Cashier must have matching branch_id
    if (user.role === 'manager' || user.role === 'cashier') {
      if (!user.branch_id) {
        throw new Error(
          `User ${userId} (${user.role}) does not have a branch assigned. ` +
          `Please contact an administrator to assign a branch.`
        );
      }
      
      if (user.branch_id !== branchId) {
        throw new Error(
          `Access denied: User ${userId} (${user.role}) can only access branch ${user.branch_id}, ` +
          `but attempted to access branch ${branchId}`
        );
      }
      
      // Verify branch exists and is not deleted
      const branch = await db.branches.get(branchId);
      if (!branch) {
        throw new Error(`Branch not found: ${branchId}`);
      }
      
      if (branch._deleted) {
        throw new Error(
          `Access denied: Branch ${branchId} has been deleted. ` +
          `Please contact an administrator to reassign your branch.`
        );
      }
      
      // Verify branch belongs to store
      if (branch.store_id !== storeId) {
        throw new Error(
          `Branch ${branchId} does not belong to store ${storeId}`
        );
      }
    }
  }
  
  /**
   * Gets accessible branches for a user
   * Returns all branches for admin, single branch for manager/cashier
   */
  static async getAccessibleBranches(
    userId: string,
    storeId: string
  ): Promise<Array<{ id: string; name: string }>> {
    const user = await db.users.get(userId);
    
    if (!user || user.store_id !== storeId) {
      return [];
    }
    
    // Admin can access all branches
    if (user.role === 'admin') {
      const branches = await db.branches
        .where('store_id')
        .equals(storeId)
        .filter(b => !b._deleted)
        .toArray();
      
      return branches.map(b => ({ id: b.id, name: b.name }));
    }
    
    // Manager/Cashier can only access their assigned branch
    if (user.role === 'manager' || user.role === 'cashier') {
      if (!user.branch_id) {
        return []; // No branch assigned
      }
      
      const branch = await db.branches.get(user.branch_id);
      if (!branch || branch._deleted || branch.store_id !== storeId) {
        return []; // Branch doesn't exist or is invalid
      }
      
      return [{ id: branch.id, name: branch.name }];
    }
    
    return [];
  }
  
  /**
   * Checks if user can switch branches (only admin)
   */
  static canSwitchBranches(user: Employee): boolean {
    return user.role === 'admin';
  }
  
  /**
   * Validates branch assignment when creating/updating user
   */
  static validateBranchAssignment(
    role: 'admin' | 'manager' | 'cashier',
    branchId: string | null
  ): void {
    if (role === 'admin') {
      // Admin should have branch_id = null
      if (branchId !== null) {
        throw new Error('Admin users must have branch_id set to null');
      }
    } else if (role === 'manager' || role === 'cashier') {
      // Manager/Cashier must have a branch_id
      if (!branchId) {
        throw new Error(
          `${role} users must have a branch_id assigned. ` +
          `Please select a branch when creating this user.`
        );
      }
    }
  }
}
```

---

## 📋 Phase 3: Integration Points - Add Validation

### 3.1 Cash Drawer Operations
**File**: `apps/store-app/src/services/cashDrawerUpdateService.ts`

Add validation at the start of each method:

```typescript
// Example: openCashDrawerSession
public async openCashDrawerSession(
  storeId: string,
  branchId: string,
  openingAmount: number,
  openedBy: string,
  notes?: string
) {
  // ✅ ADD VALIDATION
  await BranchAccessValidationService.validateBranchAccess(
    openedBy,
    storeId,
    branchId
  );
  
  // ... rest of method
}
```

**Methods to update**:
- `openCashDrawerSession()`
- `closeCashDrawerSession()`
- `verifySessionOpen()`
- `getCashDrawerAccount()`

### 3.2 Transaction Operations
**File**: `apps/store-app/src/services/transactionService.ts`

Add validation in:
- `createTransaction()`
- `createCashDrawerSale()`
- `createCustomerPayment()`
- `createSupplierPayment()`
- `createCashDrawerExpense()`

```typescript
async createTransaction(
  transactionData: CreateTransactionInput,
  context: TransactionContext
): Promise<TransactionResult> {
  // ✅ ADD VALIDATION
  await BranchAccessValidationService.validateBranchAccess(
    context.userId,
    context.storeId,
    context.branchId
  );
  
  // ... rest of method
}
```

### 3.3 Bill Operations
**File**: `apps/store-app/src/contexts/OfflineDataContext.tsx`

Add validation in:
- `createBill()`
- `updateBill()`
- `addBillLineItem()`
- `processPayment()`

```typescript
const createBill = async (billData: CreateBillInput) => {
  // ✅ ADD VALIDATION
  if (!userProfile?.id || !currentBranchId) {
    throw new Error('User or branch not available');
  }
  
  await BranchAccessValidationService.validateBranchAccess(
    userProfile.id,
    storeId!,
    currentBranchId
  );
  
  // ... rest of method
}
```

### 3.4 Inventory Operations
**File**: `apps/store-app/src/contexts/OfflineDataContext.tsx`

Add validation in:
- `addInventoryItem()`
- `updateInventoryItem()`
- `createInventoryBill()`

### 3.5 Employee Operations
**File**: `apps/store-app/src/contexts/OfflineDataContext.tsx`

Add validation in:
- `processEmployeePayment()`

---

## 📋 Phase 4: Edge Case Handling

### 4.1 Branch Deletion Handler
**File**: `apps/store-app/src/services/branchDeletionHandler.ts` (NEW)

```typescript
export class BranchDeletionHandler {
  /**
   * Handles branch soft deletion
   * - Sets branch_id to null for affected users
   * - Notifies users about branch deletion
   * - Prevents operations on deleted branch
   */
  static async handleBranchDeletion(
    branchId: string,
    storeId: string
  ): Promise<void> {
    // Find all users assigned to this branch
    const affectedUsers = await db.users
      .where('store_id')
      .equals(storeId)
      .filter(u => u.branch_id === branchId && !u._deleted)
      .toArray();
    
    // Update users: set branch_id to null
    for (const user of affectedUsers) {
      await db.users.update(user.id, {
        branch_id: null,
        updated_at: new Date().toISOString(),
        _synced: false
      });
      
      // Create notification for user
      const { NotificationService } = await import('./notificationService');
      await NotificationService.createNotification(
        storeId,
        'warning',
        'Branch Access Revoked',
        `Your assigned branch has been deleted. Please contact an administrator to be reassigned to a new branch.`,
        {
          priority: 'high',
          metadata: { branchId, userId: user.id }
        }
      );
    }
  }
  
  /**
   * Validates branch is not deleted before operations
   */
  static async validateBranchNotDeleted(
    branchId: string
  ): Promise<void> {
    const branch = await db.branches.get(branchId);
    
    if (!branch) {
      throw new Error(`Branch not found: ${branchId}`);
    }
    
    if (branch._deleted) {
      throw new Error(
        `Branch ${branch.name} (${branchId}) has been deleted. ` +
        `Operations on this branch are not allowed.`
      );
    }
  }
}
```

### 4.2 User Reassignment Handler
**File**: `apps/store-app/src/services/userReassignmentHandler.ts` (NEW)

```typescript
export class UserReassignmentHandler {
  /**
   * Reassigns user to a new branch
   * - Validates new branch exists and belongs to store
   * - Updates user branch_id
   * - Closes any active sessions in old branch
   * - Creates notification
   */
  static async reassignUserBranch(
    userId: string,
    newBranchId: string,
    storeId: string,
    reassignedBy: string
  ): Promise<void> {
    const user = await db.users.get(userId);
    
    if (!user || user.store_id !== storeId) {
      throw new Error('User not found or does not belong to store');
    }
    
    if (user.role === 'admin') {
      throw new Error('Admin users cannot be reassigned to a branch');
    }
    
    // Validate new branch
    const newBranch = await db.branches.get(newBranchId);
    if (!newBranch || newBranch._deleted || newBranch.store_id !== storeId) {
      throw new Error('Invalid branch for reassignment');
    }
    
    const oldBranchId = user.branch_id;
    
    // Close any active cash drawer sessions in old branch
    if (oldBranchId) {
      const activeSessions = await db.cash_drawer_sessions
        .where(['store_id', 'branch_id'])
        .equals([storeId, oldBranchId])
        .filter(s => s.status === 'open' && s.opened_by === userId)
        .toArray();
      
      for (const session of activeSessions) {
        await db.closeCashDrawerSession(
          session.id,
          session.opening_amount, // Use opening amount as actual
          reassignedBy,
          'Session closed due to branch reassignment'
        );
      }
    }
    
    // Update user
    await db.users.update(userId, {
      branch_id: newBranchId,
      updated_at: new Date().toISOString(),
      _synced: false
    });
    
    // Create notification
    const { NotificationService } = await import('./notificationService');
    await NotificationService.createNotification(
      storeId,
      'info',
      'Branch Reassignment',
      `You have been reassigned to branch: ${newBranch.name}`,
      {
        priority: 'medium',
        metadata: { oldBranchId, newBranchId, userId }
      }
    );
  }
}
```

### 4.3 Branch Initialization on Sign-In
**File**: `apps/store-app/src/contexts/OfflineDataContext.tsx`

Update branch initialization to respect user's branch access:

```typescript
// Initialize branch - respect user's branch access
useEffect(() => {
  const initializeBranch = async () => {
    if (storeId && !currentBranchId && userProfile) {
      try {
        // Get accessible branches for user
        const accessibleBranches = await BranchAccessValidationService.getAccessibleBranches(
          userProfile.id,
          storeId
        );
        
        if (accessibleBranches.length === 0) {
          console.error('❌ No accessible branches for user');
          // Show error to user
          return;
        }
        
        // For admin: use default branch selection logic
        // For manager/cashier: use their assigned branch
        let branchId: string;
        
        if (userProfile.role === 'admin') {
          branchId = await ensureDefaultBranch(storeId);
        } else {
          // Manager/Cashier: use their assigned branch
          branchId = accessibleBranches[0].id;
        }
        
        setCurrentBranchId(branchId);
        console.log('✅ Auto-initialized branch for user:', branchId);
      } catch (error) {
        console.error('❌ Failed to auto-initialize branch:', error);
      }
    }
  };
  
  initializeBranch();
}, [storeId, currentBranchId, userProfile]);
```

---

## 📋 Phase 5: UI Components

### 5.1 Branch Selection Component
**File**: `apps/store-app/src/components/BranchSelector.tsx` (NEW)

```typescript
import { useState, useEffect } from 'react';
import { BranchAccessValidationService } from '../services/branchAccessValidationService';
import { setBranchPreference } from '../lib/branchHelpers';
import { useOfflineData } from '../contexts/OfflineDataContext';
import { useSupabaseAuth } from '../contexts/SupabaseAuthContext';

export function BranchSelector() {
  const { storeId, currentBranchId, setCurrentBranchId } = useOfflineData();
  const { userProfile } = useSupabaseAuth();
  const [accessibleBranches, setAccessibleBranches] = useState<Array<{ id: string; name: string }>>([]);
  const [loading, setLoading] = useState(true);
  
  useEffect(() => {
    const loadBranches = async () => {
      if (!storeId || !userProfile?.id) return;
      
      setLoading(true);
      try {
        const branches = await BranchAccessValidationService.getAccessibleBranches(
          userProfile.id,
          storeId
        );
        setAccessibleBranches(branches);
        
        // Auto-select if only one branch
        if (branches.length === 1 && !currentBranchId) {
          setCurrentBranchId(branches[0].id);
          setBranchPreference(storeId, branches[0].id);
        }
      } catch (error) {
        console.error('Failed to load branches:', error);
      } finally {
        setLoading(false);
      }
    };
    
    loadBranches();
  }, [storeId, userProfile]);
  
  const handleBranchChange = async (branchId: string) => {
    if (!storeId || !userProfile?.id) return;
    
    try {
      // Validate access
      await BranchAccessValidationService.validateBranchAccess(
        userProfile.id,
        storeId,
        branchId
      );
      
      // Update branch
      setCurrentBranchId(branchId);
      setBranchPreference(storeId, branchId);
    } catch (error) {
      console.error('Failed to switch branch:', error);
      alert(error instanceof Error ? error.message : 'Failed to switch branch');
    }
  };
  
  if (loading) {
    return <div>Loading branches...</div>;
  }
  
  if (accessibleBranches.length === 0) {
    return (
      <div className="error">
        No accessible branches. Please contact an administrator.
      </div>
    );
  }
  
  // Manager/Cashier: Show single branch (read-only)
  if (userProfile?.role !== 'admin') {
    return (
      <div className="branch-info">
        <span>Branch: {accessibleBranches[0]?.name}</span>
      </div>
    );
  }
  
  // Admin: Show dropdown for branch selection
  return (
    <select
      value={currentBranchId || ''}
      onChange={(e) => handleBranchChange(e.target.value)}
    >
      <option value="">Select Branch</option>
      {accessibleBranches.map(branch => (
        <option key={branch.id} value={branch.id}>
          {branch.name}
        </option>
      ))}
    </select>
  );
}
```

### 5.2 User Creation/Edit Form
**File**: `apps/admin-app/src/components/users/UserForm.tsx` (or similar)

Add branch selection field:

```typescript
// When role is manager/cashier, show branch selector
{role !== 'admin' && (
  <Select
    label="Branch"
    value={branchId || ''}
    onChange={(e) => setBranchId(e.target.value)}
    required
  >
    <option value="">Select Branch</option>
    {branches.map(branch => (
      <option key={branch.id} value={branch.id}>
        {branch.name}
      </option>
    ))}
  </Select>
)}

// Validate on submit
const handleSubmit = () => {
  try {
    BranchAccessValidationService.validateBranchAssignment(role, branchId);
    // ... submit
  } catch (error) {
    alert(error.message);
  }
};
```

---

## 📋 Phase 6: Testing Checklist

### 6.1 Validation Tests
- [ ] Admin can access all branches
- [ ] Manager can only access assigned branch
- [ ] Cashier can only access assigned branch
- [ ] Access denied error when manager/cashier tries wrong branch
- [ ] Access denied error when branch is deleted
- [ ] Access denied error when user has no branch assigned

### 6.2 Edge Case Tests
- [ ] Branch deletion sets user branch_id to null
- [ ] Branch deletion creates notification for affected users
- [ ] User reassignment closes active sessions
- [ ] User reassignment creates notification
- [ ] Operations fail on deleted branch
- [ ] Branch selector shows correct branches per role

### 6.3 Integration Tests
- [ ] Cash drawer operations validate branch access
- [ ] Transaction operations validate branch access
- [ ] Bill operations validate branch access
- [ ] Inventory operations validate branch access
- [ ] Employee payment operations validate branch access

---

## 📋 Phase 7: Migration Strategy

### 7.1 Data Migration
**File**: `apps/store-app/src/lib/db.ts` (in version migration)

```typescript
this.version(32).upgrade(async (trans) => {
  // Set branch_id to null for all existing admin users
  const adminUsers = await trans.table('users')
    .where('role')
    .equals('admin')
    .toArray();
  
  for (const user of adminUsers) {
    await trans.table('users').update(user.id, {
      branch_id: null,
      updated_at: new Date().toISOString(),
      _synced: false
    });
  }
  
  // For manager/cashier: assign to default branch if none exists
  const managers = await trans.table('users')
    .where('role')
    .anyOf(['manager', 'cashier'])
    .toArray();
  
  for (const user of managers) {
    if (!user.branch_id) {
      // Get default branch for store
      const defaultBranch = await trans.table('branches')
        .where('store_id')
        .equals(user.store_id)
        .filter(b => !b._deleted)
        .first();
      
      if (defaultBranch) {
        await trans.table('users').update(user.id, {
          branch_id: defaultBranch.id,
          updated_at: new Date().toISOString(),
          _synced: false
        });
      }
    }
  }
});
```

---

## 📋 Phase 8: Error Messages & User Experience

### 8.1 Error Messages
Create consistent error messages:
- `"Access denied: You can only access branch [Branch Name]"`
- `"Branch [Branch Name] has been deleted. Please contact an administrator."`
- `"No branch assigned. Please contact an administrator to assign a branch."`

### 8.2 User Notifications
- Show notification when branch is deleted
- Show notification when user is reassigned
- Show error toast when access is denied

---

## 🚀 Implementation Order

1. **Phase 1**: Database schema changes (types, migrations)
2. **Phase 2**: Create validation service
3. **Phase 3**: Add validation to critical operations (cash drawer, transactions)
4. **Phase 4**: Implement edge case handlers
5. **Phase 5**: Create UI components
6. **Phase 6**: Testing
7. **Phase 7**: Data migration
8. **Phase 8**: Polish error messages and UX

---

## ⚠️ Security Considerations

1. **Never trust client-side validation alone** - Always validate on server/Supabase RLS
2. **Validate on every operation** - Don't skip validation for "trusted" operations
3. **Log access denials** - Track failed access attempts
4. **Supabase RLS policies** - Update RLS policies to enforce branch access at database level

---

## 📝 Notes

- Admin users have `branch_id: null` to indicate they can access all branches
- Manager/Cashier users must have a valid `branch_id`
- Branch deletion is soft delete (`_deleted: true`), so we can handle reassignment
- All validation happens in `BranchAccessValidationService` for consistency
- UI components use validation service to determine what to show

