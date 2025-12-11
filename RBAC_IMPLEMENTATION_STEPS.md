# RBAC Implementation - Step-by-Step Guide

**Estimated Time**: ~5 hours total  
**Current Status**: 📋 Ready to start

---

## ✅ Step 1: Database Migrations (20 minutes)

### 1.1 Run the Migration

**File created**: `apps/store-app/supabase/migrations/20250215000000_create_rbac_tables.sql`

**Option A: Using Supabase CLI** (Recommended)
```bash
cd apps/store-app
npx supabase db push
```

**Option B: Using Supabase Dashboard**
1. Go to your Supabase project dashboard
2. Navigate to SQL Editor
3. Copy the contents of `20250215000000_create_rbac_tables.sql`
4. Paste and run

**Option C: Direct psql**
```bash
psql $DATABASE_URL -f apps/store-app/supabase/migrations/20250215000000_create_rbac_tables.sql
```

### 1.2 Verify Migration

Run this query in Supabase SQL Editor to verify tables were created:
```sql
SELECT table_name 
FROM information_schema.tables 
WHERE table_schema = 'public' 
AND table_name IN ('role_operation_limits', 'user_module_access');
```

**Expected output**: Should show both tables

### 1.3 Optional: Seed Default Limits

```sql
-- Example: Set default limits for a store
-- Replace 'your-store-id' with actual store ID

-- Admin defaults (high limits)
INSERT INTO role_operation_limits (store_id, role, user_id, operation_type, limit_value, limit_currency) VALUES
  ('your-store-id', 'admin', NULL, 'max_discount_percent', 100, NULL),
  ('your-store-id', 'admin', NULL, 'max_void_amount_usd', 10000, 'USD'),
  ('your-store-id', 'admin', NULL, 'max_void_amount_lbp', 150000000, 'LBP');

-- Manager defaults (moderate limits)
INSERT INTO role_operation_limits (store_id, role, user_id, operation_type, limit_value, limit_currency) VALUES
  ('your-store-id', 'manager', NULL, 'max_discount_percent', 50, NULL),
  ('your-store-id', 'manager', NULL, 'max_void_amount_usd', 1000, 'USD'),
  ('your-store-id', 'manager', NULL, 'max_void_amount_lbp', 15000000, 'LBP');

-- Cashier defaults (low limits)
INSERT INTO role_operation_limits (store_id, role, user_id, operation_type, limit_value, limit_currency) VALUES
  ('your-store-id', 'cashier', NULL, 'max_discount_percent', 10, NULL);
```

**✅ Checkpoint**: Tables created and RLS policies active

---

## ✅ Step 2: TypeScript Types (15 minutes)

### 2.1 Update `apps/store-app/src/types/index.ts`

Add these types to the existing file:

```typescript
// Add at the top with other type definitions
export type ModuleName = 'pos' | 'inventory' | 'accounting' | 'reports' | 'settings' | 'users';

export type OperationType = 
  | 'max_discount_percent'
  | 'max_return_amount_usd'
  | 'max_return_amount_lbp'
  | 'max_void_amount_usd'
  | 'max_void_amount_lbp';

// Add with other interfaces
export interface RoleOperationLimit {
  id: string;
  store_id: string;
  role: 'admin' | 'manager' | 'cashier';
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

### 2.2 Update `apps/store-app/src/types/database.ts`

Add these table definitions to `Database.public.Tables`:

```typescript
// Add inside Database.public.Tables interface

role_operation_limits: {
  Row: {
    id: string;
    store_id: string;
    role: 'admin' | 'manager' | 'cashier';
    user_id: string | null;
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

**✅ Checkpoint**: TypeScript types updated, no compilation errors

---

## ✅ Step 3: IndexedDB Schema (10 minutes)

### 3.1 Update `apps/store-app/src/lib/db.ts`

Find the latest version number and add a new version with these two stores:

```typescript
// Find the latest version() call and add a new one
this.version(XX).stores({ // Replace XX with next version number (e.g., 39)
  // ... keep all existing stores
  role_operation_limits: 'id, [store_id+role], [store_id+role+operation_type], [store_id+user_id+operation_type], user_id, updated_at, _synced, _deleted',
  user_module_access: 'id, [user_id+store_id], [user_id+store_id+module], user_id, store_id, updated_at, _synced, _deleted'
});
```

### 3.2 Add Table Declarations

Add to the class properties:

```typescript
// Add with other table declarations
role_operation_limits!: Dexie.Table<RoleOperationLimit, string>;
user_module_access!: Dexie.Table<UserModuleAccess, string>;
```

**✅ Checkpoint**: IndexedDB schema updated, app still runs

---

## ✅ Step 4: Sync Service Integration (15 minutes)

### 4.1 Update `apps/store-app/src/services/syncService.ts`

Add both tables to the sync configuration:

```typescript
// Find the SYNC_TABLES array and add these two tables
private static readonly SYNC_TABLES = [
  // ... existing tables
  'role_operation_limits',
  'user_module_access',
];
```

**✅ Checkpoint**: Tables now sync between Supabase and IndexedDB

---

## ✅ Step 5: Permission Service Implementation (45 minutes)

### 5.1 Create `apps/store-app/src/services/rolePermissionService.ts`

This is the main service file. I'll provide it in the next message due to length.

**✅ Checkpoint**: Service created and importable

---

## ✅ Step 6: Route Protection (30 minutes)

### 6.1 Create Protected Route Component

**File**: `apps/store-app/src/components/ProtectedRoute.tsx`

### 6.2 Update Router

Add protection to routes in `apps/store-app/src/router.tsx`

**✅ Checkpoint**: Routes protected by module access

---

## ✅ Step 7: Navigation Updates (20 minutes)

### 7.1 Update Navigation Component

Make navigation menu dynamic based on module access

**✅ Checkpoint**: Menu shows/hides based on permissions

---

## ✅ Step 8: POS Integration (30 minutes)

### 8.1 Add Permission Checks to POS Operations

**File**: `apps/store-app/src/pages/POS.tsx`

**✅ Checkpoint**: POS operations check limits before executing

---

## ✅ Step 9: Admin UI (1.5 hours)

### 9.1 Create User Permissions Management Page

**File**: `apps/store-app/src/pages/admin/UserPermissions.tsx`

**✅ Checkpoint**: Admin can manage all permissions via UI

---

## ✅ Step 10: Testing (45 minutes)

### 10.1 Test Checklist

- [ ] Module access enforcement works
- [ ] Module access syncs across devices
- [ ] Operation limits work correctly
- [ ] User overrides work correctly
- [ ] Offline mode works
- [ ] Admin UI works
- [ ] Navigation menu updates dynamically
- [ ] Protected routes redirect correctly

**✅ Checkpoint**: All features tested and working

---

## 🎉 Implementation Complete!

### What You Now Have:

✅ Per-user module access (POS, Inventory, Accounting, etc.)  
✅ Cross-device sync (works on desktop, tablet, mobile)  
✅ Operation limits (discount, void, return amounts)  
✅ Per-user overrides  
✅ Admin UI for management  
✅ Offline support  

---

## Next Steps After Implementation:

1. **Configure default limits** for your stores
2. **Set up user module access** for your team
3. **Test with real users** on multiple devices
4. **Monitor and adjust** limits as needed

---

## Need Help?

- Refer to `RBAC_IMPLEMENTATION_ANALYSIS.md` for detailed examples
- Check existing patterns in `branchAccessValidationService.ts`
- Test incrementally after each step

**Ready to start? Let's begin with Step 1! 🚀**

