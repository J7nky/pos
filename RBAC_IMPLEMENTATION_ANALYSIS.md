# RBAC Implementation Analysis & Best Practices (Optimized)

## Executive Summary

**Simplified, pragmatic approach** to implementing Enhanced Role-Based Access Control (RBAC) in the POS system. This plan leverages existing structures and avoids over-engineering with unnecessary tables.

**Key Optimization**: Use existing `users.role` field + 2 new tables:
1. `role_operation_limits` - Operation limits (discount, void, return amounts)
2. `user_module_access` - Per-user module permissions (syncs across devices)

---

## ✅ YES - Full Per-User, Per-Store, Per-Branch Management

### What You Can Control:

| Level | Feature | Implementation | Example | Syncs Across Devices? |
|-------|---------|----------------|---------|----------------------|
| **Per-User** | Role assignment | Existing `users.role` | John = manager, Sarah = cashier | ✅ Yes |
| **Per-User** | Branch access | Existing `users.branch_id` | John = Branch A, Sarah = Branch B | ✅ Yes |
| **Per-User** | Module access | New `user_module_access` table | Eve (cashier) can access inventory | ✅ **Yes** |
| **Per-User** | Custom limits | New `user_id` in limits table | John can give 75% discount (override) | ✅ **Yes** |
| **Per-Store** | Role limits | `store_id` in limits table | Store A: managers 50%, Store B: managers 30% | ✅ Yes |
| **Per-Branch** | Access control | `BranchAccessValidationService` | Managers/cashiers locked to assigned branch | ✅ Yes |
| **Per-Role** | Permissions | Hardcoded in service | Admins can delete, cashiers cannot | N/A (in code) |

### Answer to Your Question:
**YES**, you will be able to:
- ✅ Allow user to access **POS** but not **Accounting** ← **New!**
- ✅ Allow user to access **POS + Inventory** but not **Reports** ← **New!**
- ✅ Block user from specific modules (even if their role normally allows it) ← **New!**
- ✅ **Works across ALL devices** - permissions sync via Supabase ← **Key Feature!**
- ✅ Set different limits for **each store**
- ✅ Set different limits for **each role** (admin/manager/cashier)
- ✅ Override limits for **specific users** (e.g., trusted cashier gets higher discount)
- ✅ Control **branch access** (managers/cashiers only access their branch)
- ✅ Control **operation permissions** (who can void, delete, override prices)

---

## Current State Analysis

### 1. Existing Authentication & Authorization Patterns

#### **Current Role System** ✅ (Keep as-is)
- **Roles**: `'admin' | 'manager' | 'cashier' | 'super_admin'`
- **Location**: `users` table → `role` column (already exists)
- **Storage**: 
  - Supabase `users` table with `role` column
  - IndexedDB `users` store (offline-first)
  - User profile in `SupabaseAuthContext`

#### **Existing Access Control Patterns**

**1. Branch Access Validation Service** (`apps/store-app/src/services/branchAccessValidationService.ts`)
- ✅ **Pattern**: Service-based validation with static methods
- ✅ **Approach**: Throws descriptive errors on access denial
- ✅ **Usage**: Called before branch-scoped operations
- ✅ **Best Practice**: Centralized validation logic

```typescript
// Pattern to follow:
BranchAccessValidationService.validateBranchAccess(userId, storeId, branchId);
```

**2. RLS Policies** (`apps/store-app/supabase/migrations/20251201120000_users_rls_policies.sql`)
- ✅ **Pattern**: Database-level security with helper functions
- ✅ **Functions**: `is_current_user_super_admin()`, `is_current_user_store_admin()`, `is_current_user_store_manager()`
- ✅ **Best Practice**: Security at database layer

**3. Context-Based Auth** (`apps/store-app/src/contexts/SupabaseAuthContext.tsx`)
- ✅ **Pattern**: React Context for user state
- ✅ **User Profile**: Includes `role`, `store_id`, `branch_id`
- ✅ **Best Practice**: Single source of truth for user data

---

## Optimized Implementation Architecture

### Phase 1: Minimal Database Schema (1 Table Only)

#### 1.1 Simplified Database Schema

**Strategy**: Use existing `users.role` field + 2 new tables (operation limits + module access)

**Table 1: Operation Limits**
```sql
-- Operation-level restrictions (max discount, max return, etc.)
-- Supports both role-level defaults AND per-user overrides
CREATE TABLE role_operation_limits (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  store_id UUID REFERENCES stores(id) ON DELETE CASCADE,
  role VARCHAR(20) NOT NULL, -- 'admin', 'manager', 'cashier' (no FK, just string)
  user_id UUID REFERENCES users(id) ON DELETE CASCADE NULL, -- NULL = applies to all users with this role, NOT NULL = specific user override
  operation_type VARCHAR(50) NOT NULL, -- 'max_discount_percent', 'max_return_amount', etc.
  limit_value NUMERIC(10,2) NOT NULL,
  limit_currency VARCHAR(3), -- 'USD' or 'LBP' for amount-based limits (NULL for percentages)
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(store_id, role, operation_type, user_id) -- Allows one default per role + one per user
);

COMMENT ON TABLE role_operation_limits IS 'Operation limits per role per store, with optional per-user overrides';
COMMENT ON COLUMN role_operation_limits.role IS 'User role: admin, manager, or cashier';
COMMENT ON COLUMN role_operation_limits.user_id IS 'NULL = default for all users with this role, NOT NULL = override for specific user';
COMMENT ON COLUMN role_operation_limits.operation_type IS 'Type: max_discount_percent, max_return_amount_usd, max_return_amount_lbp, etc.';
```

**Table 2: User Module Access (Cross-Device Sync)**
```sql
-- Module-level access control per user
-- Syncs across all devices via Supabase
CREATE TABLE user_module_access (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  store_id UUID NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
  module VARCHAR(50) NOT NULL, -- 'pos', 'inventory', 'accounting', 'reports', 'settings', 'users'
  can_access BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(user_id, store_id, module)
);

COMMENT ON TABLE user_module_access IS 'Per-user module access control - syncs across all devices';
COMMENT ON COLUMN user_module_access.module IS 'Module name: pos, inventory, accounting, reports, settings, users';
COMMENT ON COLUMN user_module_access.can_access IS 'true = user can access this module, false = blocked';

-- If no record exists for a user+module, fall back to role defaults (hardcoded)
```

**Indexes:**
```sql
-- Operation Limits Indexes
CREATE INDEX idx_role_operation_limits_store_role ON role_operation_limits(store_id, role);
CREATE INDEX idx_role_operation_limits_role_lookup ON role_operation_limits(store_id, role, operation_type) WHERE user_id IS NULL;
CREATE INDEX idx_role_operation_limits_user_lookup ON role_operation_limits(store_id, user_id, operation_type) WHERE user_id IS NOT NULL;

-- Module Access Indexes
CREATE INDEX idx_user_module_access_user ON user_module_access(user_id, store_id);
CREATE INDEX idx_user_module_access_lookup ON user_module_access(user_id, store_id, module);
```

**How It Works:**

**Operation Limits:**
1. **Role-level limits** (default): Set `user_id = NULL` → applies to all users with that role
2. **User-specific overrides**: Set `user_id = specific-user-id` → overrides role default for that user
3. **Priority**: User-specific override > Role default > Unlimited

**Module Access:**
1. **User has record**: Check `can_access` column → if true, allow; if false, block
2. **No record exists**: Fall back to role defaults (hardcoded)
3. **Syncs across devices**: Stored in Supabase, synced to IndexedDB on all user's devices

**RLS Policies:**
```sql
-- RLS for Operation Limits
ALTER TABLE role_operation_limits ENABLE ROW LEVEL SECURITY;

-- Admins can manage operation limits for their store
CREATE POLICY "Admins can manage role operation limits"
ON role_operation_limits FOR ALL
TO authenticated
USING (
  store_id IN (
    SELECT store_id FROM users WHERE id = auth.uid() AND role = 'admin'
  )
);

-- All authenticated users can view limits for their store
CREATE POLICY "Users can view role operation limits"
ON role_operation_limits FOR SELECT
TO authenticated
USING (
  store_id IN (
    SELECT store_id FROM users WHERE id = auth.uid()
  )
);

-- RLS for Module Access
ALTER TABLE user_module_access ENABLE ROW LEVEL SECURITY;

-- Admins can manage module access for users in their store
CREATE POLICY "Admins can manage user module access"
ON user_module_access FOR ALL
TO authenticated
USING (
  store_id IN (
    SELECT store_id FROM users WHERE id = auth.uid() AND role = 'admin'
  )
);

-- Users can view their own module access
CREATE POLICY "Users can view their own module access"
ON user_module_access FOR SELECT
TO authenticated
USING (
  user_id = auth.uid()
);
```

#### 1.2 TypeScript Type Definitions (Simplified)

**Add to existing**: `apps/store-app/src/types/index.ts`

```typescript
// Module names
export type ModuleName = 'pos' | 'inventory' | 'accounting' | 'reports' | 'settings' | 'users';

// Operation limit types
export type OperationType = 
  | 'max_discount_percent'
  | 'max_return_amount_usd'
  | 'max_return_amount_lbp'
  | 'max_void_amount_usd'
  | 'max_void_amount_lbp';

export interface RoleOperationLimit {
  id: string;
  store_id: string;
  role: 'admin' | 'manager' | 'cashier'; // Reuse existing role type
  user_id: string | null; // NULL = role default, NOT NULL = user-specific override
  operation_type: OperationType;
  limit_value: number;
  limit_currency?: 'USD' | 'LBP';
  created_at: string;
  updated_at: string;
  _synced?: boolean;
  _deleted?: boolean;
}

export interface UserModuleAccess {
  id: string;
  user_id: string;
  store_id: string;
  module: ModuleName;
  can_access: boolean;
  created_at: string;
  updated_at: string;
  _synced?: boolean;
  _deleted?: boolean;
}
```

**Update**: `apps/store-app/src/types/database.ts`

```typescript
// Add to Database.public.Tables interface

// Operation Limits
role_operation_limits: {
  Row: {
    id: string;
    store_id: string;
    role: 'admin' | 'manager' | 'cashier';
    user_id: string | null; // NULL = role default, NOT NULL = user override
    operation_type: string;
    limit_value: number;
    limit_currency: string | null;
    created_at: string;
    updated_at: string;
  };
  Insert: {
    id?: string;
    store_id: string;
    role: 'admin' | 'manager' | 'cashier';
    user_id?: string | null;
    operation_type: string;
    limit_value: number;
    limit_currency?: string | null;
    created_at?: string;
    updated_at?: string;
  };
  Update: {
    id?: string;
    store_id?: string;
    role?: 'admin' | 'manager' | 'cashier';
    user_id?: string | null;
    operation_type?: string;
    limit_value?: number;
    limit_currency?: string | null;
    updated_at?: string;
  };
};

// User Module Access
user_module_access: {
  Row: {
    id: string;
    user_id: string;
    store_id: string;
    module: string;
    can_access: boolean;
    created_at: string;
    updated_at: string;
  };
  Insert: {
    id?: string;
    user_id: string;
    store_id: string;
    module: string;
    can_access?: boolean;
    created_at?: string;
    updated_at?: string;
  };
  Update: {
    id?: string;
    user_id?: string;
    store_id?: string;
    module?: string;
    can_access?: boolean;
    updated_at?: string;
  };
};
```

---

### Phase 2: Simplified Permission Service

#### 2.1 Role-Based Permission Service (Hardcoded Permissions)

**File**: `apps/store-app/src/services/rolePermissionService.ts` (NEW)

**Pattern**: Follow `BranchAccessValidationService` - simple, static validation

```typescript
/**
 * Role Permission Service
 * 
 * Validates permissions based on user role (admin/manager/cashier).
 * Checks operation limits from database for configurable restrictions.
 * 
 * Pattern: Similar to BranchAccessValidationService
 * - Static methods for validation
 * - Throws descriptive errors on denial
 * - Hardcoded role permissions (no database lookup needed)
 * - Database lookup only for operation limits
 */

import { db } from '../lib/db';
import { OperationType } from '../types';

export class RolePermissionService {
  /**
   * Check if user can access a specific module
   * Syncs across all devices via Supabase
   * @param userId - User ID
   * @param storeId - Store ID
   * @param module - Module name (pos, inventory, accounting, etc.)
   * @throws Error if access denied
   */
  static async checkModuleAccess(
    userId: string,
    storeId: string,
    module: ModuleName
  ): Promise<void> {
    const user = await db.users.get(userId);
    if (!user) {
      throw new Error(`User not found: ${userId}`);
    }

    // Check for user-specific module access record
    const moduleAccess = await db.user_module_access
      .where('[user_id+store_id+module]')
      .equals([userId, storeId, module])
      .first();

    if (moduleAccess) {
      // User has specific access record
      if (!moduleAccess.can_access) {
        throw new Error(
          `Access denied: You do not have access to the ${module} module. ` +
          `Contact an administrator if you need access.`
        );
      }
      return; // Access granted
    }

    // No specific record - fall back to role defaults
    const hasRoleAccess = this.roleHasModuleAccess(user.role, module);
    if (!hasRoleAccess) {
      throw new Error(
        `Access denied: Your role (${user.role}) does not have access to the ${module} module. ` +
        `Contact an administrator if you need access.`
      );
    }
  }

  /**
   * Check if user's role allows a specific operation
   * @param userId - User ID
   * @param operation - Operation key (e.g., 'void_sale', 'delete_product')
   * @throws Error if permission denied
   */
  static async checkPermission(
    userId: string,
    operation: string
  ): Promise<void> {
    const user = await db.users.get(userId);
    if (!user) {
      throw new Error(`User not found: ${userId}`);
    }

    const allowed = this.isOperationAllowed(user.role, operation);
    
    if (!allowed) {
      throw new Error(
        `Permission denied: ${operation}. ` +
        `Your role (${user.role}) does not have access to this operation. ` +
        `Contact an administrator if you need access.`
      );
    }
  }

  /**
   * Check if operation value is within user's configured limits
   * Priority: User-specific override > Role default > Unlimited
   * @param userId - User ID
   * @param storeId - Store ID
   * @param operationType - Operation type (e.g., 'max_discount_percent')
   * @param value - Value to check against limit
   * @param currency - Currency for amount-based limits
   * @throws Error if limit exceeded
   */
  static async checkOperationLimit(
    userId: string,
    storeId: string,
    operationType: OperationType,
    value: number,
    currency?: 'USD' | 'LBP'
  ): Promise<void> {
    const user = await db.users.get(userId);
    if (!user) {
      throw new Error(`User not found: ${userId}`);
    }

    // Priority 1: Check for user-specific override
    const userLimits = await db.role_operation_limits
      .where('[store_id+user_id+operation_type]')
      .equals([storeId, userId, operationType])
      .toArray();

    let limit = userLimits[0];
    let isUserOverride = !!limit;

    // Priority 2: If no user override, check role default
    if (!limit) {
      const roleLimits = await db.role_operation_limits
        .where('[store_id+role+operation_type]')
        .equals([storeId, user.role, operationType])
        .filter(l => !l.user_id) // Only role defaults (user_id is NULL)
        .toArray();

      limit = roleLimits[0];
    }

    if (!limit) {
      // No limit configured = unlimited
      return;
    }

    // Check currency match for amount-based limits
    if (limit.limit_currency && currency && limit.limit_currency !== currency) {
      return; // Different currency, not applicable
    }

    if (value > limit.limit_value) {
      throw new Error(
        `Operation limit exceeded: ${operationType}. ` +
        `Maximum allowed${isUserOverride ? ' for you' : ` for ${user.role}`}: ${limit.limit_value}${currency ? ' ' + currency : '%'}. ` +
        `Attempted: ${value}${currency ? ' ' + currency : '%'}.`
      );
    }
  }

  /**
   * Hardcoded module access by role (fallback if no user-specific record)
   */
  private static roleHasModuleAccess(
    role: 'admin' | 'manager' | 'cashier' | 'super_admin',
    module: ModuleName
  ): boolean {
    const roleModuleAccess: Record<string, ModuleName[]> = {
      super_admin: ['pos', 'inventory', 'accounting', 'reports', 'settings', 'users'],
      admin: ['pos', 'inventory', 'accounting', 'reports', 'settings', 'users'],
      manager: ['pos', 'inventory', 'accounting', 'reports'], // No settings or users
      cashier: ['pos'] // Only POS access by default
    };

    return roleModuleAccess[role]?.includes(module) || false;
  }

  /**
   * Hardcoded operation permissions (no database needed)
   * Based on business requirements from FUTURE_IMPLEMENTATIONS.md
   */
  private static isOperationAllowed(
    role: 'admin' | 'manager' | 'cashier' | 'super_admin',
    operation: string
  ): boolean {
    const rolePermissions: Record<string, string[]> = {
      super_admin: ['*'], // Super admin has all permissions
      
      admin: [
        // POS
        'create_sale', 'edit_sale', 'delete_sale', 'void_sale', 'refund_sale',
        'apply_discount', 'override_price', 'access_cash_drawer',
        // Inventory
        'create_product', 'edit_product', 'delete_product',
        'receive_inventory', 'adjust_inventory',
        // Accounting
        'create_transaction', 'edit_transaction', 'delete_transaction',
        'view_reports',
        // Users
        'create_user', 'edit_user', 'delete_user'
      ],
      
      manager: [
        // POS
        'create_sale', 'edit_sale', 'void_sale', 'refund_sale',
        'apply_discount', 'access_cash_drawer',
        // Inventory
        'create_product', 'edit_product', 'receive_inventory',
        // Accounting
        'create_transaction', 'view_reports',
        // Users (view only)
        'view_users'
      ],
      
      cashier: [
        // POS (limited)
        'create_sale', 'apply_discount', 'access_cash_drawer',
        // Inventory (view only)
        'view_products',
        // No delete, void, or administrative operations
      ]
    };

    const permissions = rolePermissions[role] || [];
    
    // Super admin wildcard
    if (permissions.includes('*')) return true;
    
    return permissions.includes(operation);
  }

  /**
   * Get all configured operation limits for a role in a store
   */
  static async getRoleLimits(
    storeId: string,
    role: 'admin' | 'manager' | 'cashier'
  ): Promise<RoleOperationLimit[]> {
    return await db.role_operation_limits
      .where('[store_id+role]')
      .equals([storeId, role])
      .toArray();
  }
}
```

---

### Phase 3: Simple UI Helpers (Optional - Can Use Role Directly)

#### 3.1 Simple React Hook (Optional)

**File**: `apps/store-app/src/hooks/useRolePermissions.ts` (NEW - Optional)

**Note**: You can also just use `userProfile.role` directly in components. This hook is optional.

```typescript
import { useSupabaseAuth } from '../contexts/SupabaseAuthContext';

export function useRolePermissions() {
  const { userProfile } = useSupabaseAuth();

  const canPerform = (operation: string): boolean => {
    if (!userProfile?.role) return false;
    
    // Simple hardcoded check based on role
    const rolePermissions: Record<string, string[]> = {
      super_admin: ['*'],
      admin: [
        'create_sale', 'edit_sale', 'delete_sale', 'void_sale', 'refund_sale',
        'apply_discount', 'override_price', 'access_cash_drawer',
        'create_product', 'edit_product', 'delete_product',
        'create_user', 'edit_user', 'delete_user'
      ],
      manager: [
        'create_sale', 'edit_sale', 'void_sale', 'refund_sale',
        'apply_discount', 'access_cash_drawer',
        'create_product', 'edit_product'
      ],
      cashier: [
        'create_sale', 'apply_discount', 'access_cash_drawer'
      ]
    };

    const permissions = rolePermissions[userProfile.role] || [];
    return permissions.includes('*') || permissions.includes(operation);
  };

  const isAdmin = userProfile?.role === 'admin' || userProfile?.role === 'super_admin';
  const isManager = userProfile?.role === 'manager' || isAdmin;
  const isCashier = userProfile?.role === 'cashier';

  return {
    role: userProfile?.role,
    canPerform,
    isAdmin,
    isManager,
    isCashier
  };
}
```

#### 3.2 Simple Role Guard Component (Optional)

**File**: `apps/store-app/src/components/RoleGuard.tsx` (NEW - Optional)

```typescript
import { ReactNode } from 'react';
import { useSupabaseAuth } from '../contexts/SupabaseAuthContext';

interface RoleGuardProps {
  allowedRoles: ('admin' | 'manager' | 'cashier' | 'super_admin')[];
  fallback?: ReactNode;
  children: ReactNode;
}

export function RoleGuard({
  allowedRoles,
  fallback = null,
  children
}: RoleGuardProps) {
  const { userProfile } = useSupabaseAuth();

  if (!userProfile?.role || !allowedRoles.includes(userProfile.role)) {
    return <>{fallback}</>;
  }

  return <>{children}</>;
}

// Usage example:
// <RoleGuard allowedRoles={['admin', 'manager']}>
//   <DeleteButton />
// </RoleGuard>
```

---

### Phase 4: Integration Points (Simplified)

#### 4.1 Module Access Check (App-Level)

**File**: `apps/store-app/src/App.tsx` or router

```typescript
import { RolePermissionService } from '../services/rolePermissionService';

// Check module access when user navigates to a route
const ProtectedRoute = ({ module, children }: { module: ModuleName, children: ReactNode }) => {
  const { userProfile } = useSupabaseAuth();
  const [canAccess, setCanAccess] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const checkAccess = async () => {
      if (!userProfile) {
        setCanAccess(false);
        setLoading(false);
        return;
      }

      try {
        await RolePermissionService.checkModuleAccess(
          userProfile.id,
          userProfile.store_id,
          module
        );
        setCanAccess(true);
      } catch (error) {
        setCanAccess(false);
        toast.error(error.message);
      } finally {
        setLoading(false);
      }
    };

    checkAccess();
  }, [userProfile, module]);

  if (loading) return <LoadingSpinner />;
  if (!canAccess) return <Navigate to="/dashboard" replace />;
  
  return <>{children}</>;
};

// Usage in router:
<Route path="/pos" element={
  <ProtectedRoute module="pos">
    <POSPage />
  </ProtectedRoute>
} />

<Route path="/inventory" element={
  <ProtectedRoute module="inventory">
    <InventoryPage />
  </ProtectedRoute>
} />

<Route path="/accounting" element={
  <ProtectedRoute module="accounting">
    <AccountingPage />
  </ProtectedRoute>
} />
```

#### 4.2 Operation-Level Checks (Within Module)

**File**: `apps/store-app/src/pages/POS.tsx`

```typescript
import { RolePermissionService } from '../services/rolePermissionService';

// Before applying discount - check permission + limit
const handleApplyDiscount = async (discountPercent: number) => {
  try {
    // Check if role allows discounts
    await RolePermissionService.checkPermission(userProfile.id, 'apply_discount');
    
    // Check if discount is within limit for this role
    await RolePermissionService.checkOperationLimit(
      userProfile.id,
      userProfile.store_id,
      'max_discount_percent',
      discountPercent
    );
    
    // Apply discount...
  } catch (error) {
    toast.error(error.message);
  }
};

// Before voiding transaction
const handleVoidTransaction = async (billId: string, amount: number, currency: 'USD' | 'LBP') => {
  try {
    await RolePermissionService.checkPermission(userProfile.id, 'void_sale');
    
    // Check void amount limit
    const operationType = currency === 'USD' ? 'max_void_amount_usd' : 'max_void_amount_lbp';
    await RolePermissionService.checkOperationLimit(
      userProfile.id,
      userProfile.store_id,
      operationType,
      amount,
      currency
    );
    
    // Void transaction...
  } catch (error) {
    toast.error(error.message);
  }
};
```

#### 4.3 Navigation Menu (Module Access)

**File**: `apps/store-app/src/components/Navigation.tsx`

```typescript
import { useState, useEffect } from 'react';
import { RolePermissionService } from '../services/rolePermissionService';

function Navigation() {
  const { userProfile } = useSupabaseAuth();
  const [moduleAccess, setModuleAccess] = useState<Record<ModuleName, boolean>>({
    pos: false,
    inventory: false,
    accounting: false,
    reports: false,
    settings: false,
    users: false
  });

  useEffect(() => {
    const loadModuleAccess = async () => {
      if (!userProfile) return;

      const modules: ModuleName[] = ['pos', 'inventory', 'accounting', 'reports', 'settings', 'users'];
      const access: Record<ModuleName, boolean> = {} as any;

      for (const module of modules) {
        try {
          await RolePermissionService.checkModuleAccess(
            userProfile.id,
            userProfile.store_id,
            module
          );
          access[module] = true;
        } catch {
          access[module] = false;
        }
      }

      setModuleAccess(access);
    };

    loadModuleAccess();
  }, [userProfile]);

  return (
    <nav>
      {moduleAccess.pos && <NavLink to="/pos">POS</NavLink>}
      {moduleAccess.inventory && <NavLink to="/inventory">Inventory</NavLink>}
      {moduleAccess.accounting && <NavLink to="/accounting">Accounting</NavLink>}
      {moduleAccess.reports && <NavLink to="/reports">Reports</NavLink>}
      {moduleAccess.settings && <NavLink to="/settings">Settings</NavLink>}
      {moduleAccess.users && <NavLink to="/users">Users</NavLink>}
    </nav>
  );
}
```

#### 4.4 UI-Level Operation Guards

**Pattern**: Hide/show buttons based on operation permissions

```typescript
// In any component
import { useSupabaseAuth } from '../contexts/SupabaseAuthContext';

function ProductActions() {
  const { userProfile } = useSupabaseAuth();
  
  // Simple role checks - no service needed
  const canDelete = userProfile?.role === 'admin' || userProfile?.role === 'super_admin';
  const canEdit = userProfile?.role !== 'cashier';
  
  return (
    <div>
      {canEdit && <EditButton />}
      {canDelete && <DeleteButton />}
    </div>
  );
}
```

---

### Phase 5: Database Schema Updates (Minimal)

#### 5.1 IndexedDB Schema Updates

**File**: `apps/store-app/src/lib/db.ts`

Add only ONE new store for operation limits:

```typescript
this.version(XX).stores({
  // ... existing stores
  role_operation_limits: 'id, [store_id+role], [store_id+role+operation_type], [store_id+user_id+operation_type], user_id, updated_at, _synced, _deleted',
  user_module_access: 'id, [user_id+store_id], [user_id+store_id+module], user_id, store_id, updated_at, _synced, _deleted'
});
```

**Note**: 
- **Operation Limits**: Supports role defaults + user overrides
- **Module Access**: Per-user module permissions, syncs across all devices

#### 5.2 Sync Service Integration

**File**: `apps/store-app/src/services/syncService.ts`

Add these tables to sync (following existing pattern):
- `role_operation_limits` - Operation limits (syncs across devices)
- `user_module_access` - Module access permissions (syncs across devices)

**Critical**: Both tables MUST sync to enable cross-device access control

---

### Phase 6: Admin UI for Operation Limits Configuration

#### 6.1 User Permissions Management Page (Comprehensive)

**File**: `apps/store-app/src/pages/admin/UserPermissions.tsx` (NEW)

**Complete UI for managing module access + operation limits per user:**

```typescript
function UserPermissionsPage() {
  const { userProfile } = useSupabaseAuth();
  const [users, setUsers] = useState<User[]>([]);
  const [selectedUser, setSelectedUser] = useState<User | null>(null);

  return (
    <div>
      <h1>User Permissions Management</h1>
      
      {/* User Selection */}
      <section>
        <h2>Select User</h2>
        <UserSelector users={users} onSelect={setSelectedUser} />
      </section>

      {selectedUser && (
        <>
          {/* Section 1: Module Access (Syncs Across Devices) */}
          <section>
            <h2>Module Access for {selectedUser.name}</h2>
            <p className="text-sm text-gray-600">
              These permissions sync across all devices
            </p>
            
            <ModuleAccessTable userId={selectedUser.id} storeId={userProfile.store_id}>
              {/* Example:
                  Module         | Default (Role) | Custom Access | Status
                  POS            | ✓ Allowed      | -             | ✓ Can Access
                  Inventory      | ✗ Blocked      | ✓ Grant       | ✓ Can Access
                  Accounting     | ✓ Allowed      | ✗ Block       | ✗ Blocked
                  Reports        | ✓ Allowed      | -             | ✓ Can Access
                  Settings       | ✗ Blocked      | -             | ✗ Blocked
                  Users          | ✗ Blocked      | -             | ✗ Blocked
              */}
            </ModuleAccessTable>
          </section>

          {/* Section 2: Operation Limits */}
          <section>
            <h2>Operation Limits for {selectedUser.name}</h2>
            
            <OperationLimitsTable userId={selectedUser.id} role={selectedUser.role}>
              {/* Example:
                  Operation            | Role Default | Custom Limit | Active
                  Max Discount %       | 50%          | 75%          | 75% (Custom)
                  Max Void (USD)       | $1,000       | -            | $1,000 (Default)
                  Max Return (USD)     | $1,000       | $2,000       | $2,000 (Custom)
              */}
            </OperationLimitsTable>
          </section>
        </>
      )}
    </div>
  );
}

// Component: Module Access Management
function ModuleAccessTable({ userId, storeId }) {
  const modules: ModuleName[] = ['pos', 'inventory', 'accounting', 'reports', 'settings', 'users'];
  const [moduleAccess, setModuleAccess] = useState<Record<ModuleName, UserModuleAccess | null>>({});

  const toggleModuleAccess = async (module: ModuleName, canAccess: boolean) => {
    // Save to database - syncs to all devices
    await db.user_module_access.put({
      id: `${userId}-${module}`,
      user_id: userId,
      store_id: storeId,
      module,
      can_access: canAccess,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      _synced: false
    });

    // Trigger sync
    syncService.syncTable('user_module_access');
  };

  return (
    <table>
      <thead>
        <tr>
          <th>Module</th>
          <th>Default (Role)</th>
          <th>Custom Access</th>
          <th>Final Status</th>
          <th>Actions</th>
        </tr>
      </thead>
      <tbody>
        {modules.map(module => (
          <ModuleAccessRow 
            key={module}
            module={module}
            userId={userId}
            onToggle={toggleModuleAccess}
          />
        ))}
      </tbody>
    </table>
  );
}
```

**Pattern**: Single page to manage all permissions (module access + operation limits) per user

---

## Implementation Checklist (Optimized - 2 Tables)

### Database Layer (2 Tables)
- [ ] Create `role_operation_limits` table migration
- [ ] Create `user_module_access` table migration
- [ ] Add RLS policies for both tables
- [ ] Seed default operation limits for each role (optional)

### TypeScript Types (Minimal Updates)
- [ ] Add `ModuleName`, `OperationType`, `RoleOperationLimit`, and `UserModuleAccess` types to `apps/store-app/src/types/index.ts`
- [ ] Update `apps/store-app/src/types/database.ts` with both new tables

### Services (1 Enhanced Service)
- [ ] Create `RolePermissionService` with:
  - [ ] `checkModuleAccess()` - Check if user can access module (syncs across devices)
  - [ ] `checkPermission()` - Check if user can perform operation
  - [ ] `checkOperationLimit()` - Check if operation within limits
  - [ ] Hardcoded role defaults for fallback

### UI Integration
- [ ] Add `ProtectedRoute` component for module access checks
- [ ] Update navigation menu to show/hide based on module access
- [ ] Update POS page to check operation limits
- [ ] Add role-based operation permission checks

### IndexedDB (2 Stores)
- [ ] Add `role_operation_limits` store to `db.ts`
- [ ] Add `user_module_access` store to `db.ts`
- [ ] Update sync service to sync both tables

### Admin UI (User Permissions Page)
- [ ] Create comprehensive user permissions management page:
  - [ ] User selection/search
  - [ ] Module access management (per user)
  - [ ] Operation limits management (per user)
  - [ ] Visual indicators for defaults vs overrides
- [ ] Follow existing admin page patterns

### Testing
- [ ] Test module access enforcement (POS, Inventory, Accounting, etc.)
- [ ] Test module access syncs across devices
- [ ] Test operation limits enforcement (discount, void, return)
- [ ] Test user-specific overrides work correctly
- [ ] Test offline functionality (cached permissions)
- [ ] Test admin can configure all permissions

---

## Key Design Decisions (Optimized)

### 1. **Use Existing `users.role` Field** ✅
- No new roles table needed
- Use existing: `admin`, `manager`, `cashier`, `super_admin`
- Role already synced and available offline
- Simplest possible implementation

### 2. **Hardcoded Permissions** ✅
- No permissions table or database lookups
- Permissions defined in code (fast, no DB queries)
- Easy to understand and maintain
- Can be updated without database migrations

### 3. **Two Simple Tables** ✅
- `role_operation_limits` - Operation limits (discount, void, return)
- `user_module_access` - Module permissions (POS, Inventory, etc.)
- Both sync via Supabase (works across all devices)
- Minimal sync overhead
- Easy to maintain

### 4. **Operation-Level Limits** ✅
- Configurable per store and role
- Supports both percentage and amount limits
- Currency-aware limits (USD/LBP)
- Easy admin UI to configure

### 5. **No Audit Trail** ✅
- Removed unnecessary complexity
- Audit logs already exist in `bill_audit_logs`
- Can add later if really needed
- Focus on core functionality first

### 6. **Offline-First + Cross-Device Sync** ✅
- Permissions stored in IndexedDB (offline access)
- Permission checks work offline (hardcoded + cached)
- **Syncs across ALL devices via Supabase**
- Change permissions on desktop → instantly available on tablet/mobile
- Follows existing architecture pattern

---

## 🌐 Cross-Device Sync: How It Works

### Scenario: Admin Grants Cashier Access to Inventory

1. **Admin on Desktop**: Opens user permissions page, grants Eve (cashier) access to Inventory module
2. **Save to Database**: Record saved to `user_module_access` table in Supabase
3. **Sync to Eve's Devices**:
   - Eve's tablet: Next sync pulls new permission → Inventory appears in navigation
   - Eve's phone: Next sync pulls new permission → Inventory appears in navigation  
   - Eve's other computer: Next sync pulls new permission → Inventory appears in navigation

**Result**: Eve can now access Inventory on **ANY device** she logs into! 🎉

### Offline Support:
- Permissions cached in IndexedDB
- Works offline with last synced permissions
- Changes sync when device comes back online
- No interruption to user experience

---

## Migration Strategy (Simplified)

### Step 1: Database Setup (15 minutes)
1. Create `role_operation_limits` migration file
2. Run migration on Supabase
3. Seed default limits (optional - can configure via UI)

### Step 2: Type System (10 minutes)
1. Add `OperationType` and `RoleOperationLimit` to types
2. Update `database.ts` with new table
3. Done!

### Step 3: Service Implementation (30 minutes)
1. Create `RolePermissionService` with hardcoded permissions
2. Add `checkPermission()` and `checkOperationLimit()` methods
3. Test locally

### Step 4: POS Integration (30 minutes)
1. Add permission checks before critical operations:
   - Apply discount
   - Void sale
   - Delete record
   - Price override
2. Add error handling with toast messages

### Step 5: UI Updates (30 minutes)
1. Hide/show UI elements based on `userProfile.role`
2. Disable buttons for unauthorized operations
3. Show appropriate error messages

### Step 6: Admin UI (1 hour)
1. Create simple settings page for operation limits
2. Forms to configure limits per role
3. Save to `role_operation_limits` table

### Step 7: Testing (30 minutes)
1. Test each role (admin, manager, cashier)
2. Test operation limits enforcement
3. Test offline functionality

**Total Time: ~4 hours** (vs days with the complex approach)

---

## Security Considerations (Simplified)

1. **Database-Level Security**: RLS policies on `role_operation_limits` table
2. **Client-Side Validation**: Permission checks in services before operations
3. **Role in User Table**: Already secured by existing RLS policies
4. **Offline Security**: Limits cached securely in IndexedDB (read-only for non-admins)

---

## Performance Considerations (Optimized)

1. **Zero DB Queries for Permissions**: Hardcoded = instant checks
2. **Minimal DB Queries**: Only load limits once per session
3. **IndexedDB Compound Index**: Fast lookups with `[store_id+role+operation_type]`
4. **No Complex Joins**: Single table, simple queries

---

## Conclusion

**Optimized RBAC Implementation - Simple & Pragmatic**

### What We're Building:
1. **Use existing `users.role`** - No new roles table
2. **Hardcoded permissions** - Fast, no DB queries  
3. **Two tables:**
   - `role_operation_limits` - Operation limits (discount, void, return)
   - `user_module_access` - Per-user module permissions (**syncs across devices**)
4. **Simple service: `RolePermissionService`** - Follows existing patterns
5. **Cross-device sync** - All permissions sync via Supabase
6. **No audit trail** - Removed unnecessary complexity

### Why This Is Better:
- ✅ **~5 hours vs days** of implementation time
- ✅ **2 tables vs 6 tables** - Minimal schema changes
- ✅ **Zero performance overhead** - Hardcoded permission checks
- ✅ **Cross-device sync** - Change permissions once, works everywhere
- ✅ **Easy to maintain** - Simple, clear code
- ✅ **Offline-first** - Works perfectly offline
- ✅ **Follows existing patterns** - Consistent with codebase

### What You Get:
- ✅ **Per-user module access** (POS, Inventory, Accounting, Reports, etc.) ← **NEW!**
- ✅ **Cross-device sync** (permissions work on desktop, tablet, mobile) ← **KEY!**
- ✅ **Role-based permissions** (admin/manager/cashier)
- ✅ **Per-store operation limits** (different limits per store)
- ✅ **Per-role default limits** (managers, cashiers have different limits)
- ✅ **Per-user override limits** (trusted users get custom limits)
- ✅ **Per-branch access control** (users locked to assigned branch)
- ✅ **Currency-aware limits** (USD/LBP)
- ✅ **Easy admin configuration** - UI for module access + operation limits
- ✅ **Proper error messages** - User-friendly feedback

### Implementation Order:
1. Database migrations (20 min - 2 tables)
2. Types (15 min)
3. Service (45 min - module access + operation limits)
4. Route guards (30 min)
5. Navigation updates (20 min)
6. POS integration (30 min)
7. Admin UI (1.5 hours)
8. Testing (45 min)

**Total: ~5 hours** 🎉

---

## Per-User Management Examples

### Example 1: Role-Level Defaults (Most Common)

```sql
-- Role-level limits (user_id = NULL)
INSERT INTO role_operation_limits (store_id, role, user_id, operation_type, limit_value, limit_currency) VALUES
  -- Admin limits (high limits)
  ('store-123', 'admin', NULL, 'max_discount_percent', 100, NULL),
  ('store-123', 'admin', NULL, 'max_void_amount_usd', 10000, 'USD'),
  
  -- Manager limits (moderate limits)
  ('store-123', 'manager', NULL, 'max_discount_percent', 50, NULL),
  ('store-123', 'manager', NULL, 'max_void_amount_usd', 1000, 'USD'),
  
  -- Cashier limits (low limits)
  ('store-123', 'cashier', NULL, 'max_discount_percent', 10, NULL);
```

### Example 2: User-Specific Operation Limit Overrides

```sql
-- User "john-manager-id" is a manager but needs higher discount limit
INSERT INTO role_operation_limits (store_id, role, user_id, operation_type, limit_value, limit_currency) VALUES
  ('store-123', 'manager', 'john-manager-id', 'max_discount_percent', 75, NULL);
  -- John can now give 75% discount instead of manager default (50%)

-- User "sarah-cashier-id" is a trusted cashier with higher limit
INSERT INTO role_operation_limits (store_id, role, user_id, operation_type, limit_value, limit_currency) VALUES
  ('store-123', 'cashier', 'sarah-cashier-id', 'max_discount_percent', 20, NULL);
  -- Sarah can now give 20% discount instead of cashier default (10%)
```

### Example 3: Per-User Module Access (Cross-Device)

```sql
-- Give cashier "eve-cashier-id" access to inventory module (not typical for cashiers)
INSERT INTO user_module_access (user_id, store_id, module, can_access) VALUES
  ('eve-cashier-id', 'store-123', 'inventory', true);
  -- Eve can now access inventory on ANY device she logs in

-- Give manager "bob-manager-id" access to accounting module
INSERT INTO user_module_access (user_id, store_id, module, can_access) VALUES
  ('bob-manager-id', 'store-123', 'accounting', true);
  -- Bob can now access accounting on ANY device

-- Block manager "david-manager-id" from reports module
INSERT INTO user_module_access (user_id, store_id, module, can_access) VALUES
  ('david-manager-id', 'store-123', 'reports', false);
  -- David CANNOT access reports on ANY device (even though managers normally can)
```

### How Lookup Priority Works:

1. **Check for user-specific override**: `user_id = 'specific-user'`
   - If found → use this limit
2. **If no user override, check role default**: `role = 'manager' AND user_id IS NULL`
   - If found → use this limit
3. **If no limit configured**: Unlimited (or block based on hardcoded permissions)

### Management Scenarios:

✅ **Store-level limits**: Different stores have different limits  
✅ **Role-level limits**: Managers in same store have same limits  
✅ **User-level overrides**: Specific users get custom limits  
✅ **Branch-level access**: Already handled by `branch_id` in users table  
✅ **Per-user permissions**: Role determines base permissions (hardcoded)

---

## Visual Example: Multi-Level Access Control

```
Store A (store-123)
├── Branch 1 (branch-A1)
│   ├── Admin (Alice)
│   │   ├── Branch access: All branches ✓
│   │   ├── Modules: POS, Inventory, Accounting, Reports, Settings, Users (all)
│   │   ├── Max discount: 100% (role default)
│   │   └── Max void: $10,000 USD (role default)
│   │
│   ├── Manager (Bob)
│   │   ├── Branch access: Branch 1 only ✓
│   │   ├── Modules: POS, Inventory, Accounting ✓, Reports ✗ (BLOCKED by admin)
│   │   ├── Max discount: 75% (USER OVERRIDE - normally 50%)
│   │   └── Max void: $1,000 USD (role default)
│   │
│   └── Cashier (Carol)
│       ├── Branch access: Branch 1 only ✓
│       ├── Modules: POS only ✓ (role default)
│       ├── Max discount: 10% (role default)
│       └── Max void: Not allowed (no limit = blocked)
│
└── Branch 2 (branch-A2)
    ├── Manager (David)
    │   ├── Branch access: Branch 2 only ✓
    │   ├── Modules: POS, Inventory, Accounting, Reports (role default)
    │   ├── Max discount: 50% (role default)
    │   └── Max void: $1,000 USD (role default)
    │
    └── Cashier (Eve)
        ├── Branch access: Branch 2 only ✓
        ├── Modules: POS ✓, Inventory ✓ (GRANTED by admin - unusual for cashier!)
        ├── Max discount: 20% (USER OVERRIDE - normally 10%)
        └── Syncs to: Desktop, Tablet, Mobile ✅

Store B (store-456)
└── Branch 1 (branch-B1)
    ├── Admin (Frank)
    │   ├── Modules: All modules
    │   ├── Max discount: 50% (STORE OVERRIDE - Store B is more strict)
    │   └── Max void: $5,000 USD (STORE OVERRIDE)
    │
    └── Manager (Grace)
        ├── Modules: POS ✓, Inventory ✓, Accounting ✗ (BLOCKED - Store B policy)
        ├── Max discount: 30% (STORE OVERRIDE - Store B managers more limited)
        └── Max void: $500 USD (STORE OVERRIDE)
```

**Key Takeaway**: 
- ✅ Full control at **store**, **branch**, **role**, and **user** levels
- ✅ **Module access** syncs across ALL devices (Desktop, Tablet, Mobile)
- ✅ **Operation limits** sync across ALL devices
- ✅ Admins can grant/block access to individual modules per user 🎉

