# RBAC System - Quick Usage Guide

## 🎯 Overview

Your POS system now has a complete Role-Based Access Control (RBAC) system with:
- **Per-user module access** (POS, Inventory, Accounting, etc.)
- **Per-user operation limits** (Max discount %, void amounts, return amounts)
- **Cross-device sync** (Set once, works everywhere)
- **Offline support** (Works without internet)

---

## 👨‍💼 For Admins: How to Manage User Permissions

### 1. Setting Module Access for a User

**Steps**:
1. Go to **Employees** page
2. Click **Edit** on the user you want to manage
3. Click the **"Module Access"** tab
4. You'll see 6 modules:
   - **POS** - Point of Sale operations
   - **Inventory** - Stock and receiving
   - **Accounting** - Transactions and payments
   - **Reports** - Analytics
   - **Settings** - Store configuration
   - **Users** - Employee management

5. For each module:
   - **Grant** - Give access to this module
   - **Block** - Remove access to this module
   - **Reset** - Return to role default

**Example Scenarios**:
- ✅ Give cashier access to Inventory (so they can check stock)
- ✅ Block manager from Reports (sensitive financial data)
- ✅ Grant specific manager access to Settings

**Result**: Changes sync to all the user's devices!

### 2. Setting Operation Limits for a User

**Steps**:
1. Go to **Employees** page
2. Click **Edit** on the user
3. Click the **"Operation Limits"** tab
4. You'll see limits for:
   - Max Discount % (percentage)
   - Max Void Amount (USD & LBP)
   - Max Return Amount (USD & LBP)

5. Click **Edit** to set a custom limit
6. Enter the value and click **Save**
7. Click **Reset** to remove custom limit and use role default

**Example Scenarios**:
- ✅ Trusted cashier can give 25% discount (instead of default 10%)
- ✅ Senior manager can void up to $5,000 (instead of default $1,000)
- ✅ Limit specific manager to 30% discount (stricter than default 50%)

**Result**: Limits enforce across all devices!

---

## 👤 For Users: What You'll Experience

### Navigation Menu Changes

Your navigation menu will only show modules you have access to:

**Default Access by Role**:
- **Admin**: Sees all modules
- **Manager**: Sees POS, Inventory, Accounting, Reports
- **Cashier**: Sees only POS

**Custom Access**:
If your admin grants you access to additional modules, they'll appear in your menu automatically (may need to refresh).

### Operation Limits

When you try to perform operations (discounts, voids, returns), the system will check your limits:

**Example**:
```
You try to apply 15% discount
Your limit: 10%
Result: ❌ Error message - "Operation limit exceeded: max_discount_percent. 
         Maximum allowed for cashier: 10%. Attempted: 15%."
```

**If you have custom limits**:
```
You try to apply 20% discount
Your custom limit: 25%
Result: ✅ Allowed!
```

### Cross-Device Experience

All permissions sync across your devices:
- Desktop computer
- Tablet
- Mobile phone
- Any browser you log into

**No action needed** - just log in and your permissions are there!

---

## 🔧 For Developers: How to Use in Code

### Check Module Access (Route Protection)

Routes are automatically protected. Already implemented in:
- `apps/store-app/src/router.tsx` - All module routes wrapped with `<ProtectedRoute>`
- `apps/store-app/src/layouts/Layout.tsx` - Navigation menu filtered

### Check Operation Permission

```typescript
import { RolePermissionService } from '../services/rolePermissionService';

// Check if user can perform operation
try {
  await RolePermissionService.checkPermission(userId, 'void_sale');
  // Allowed - proceed with operation
} catch (error) {
  // Denied - show error message
  toast.error(error.message);
}
```

### Check Operation Limit

```typescript
import { RolePermissionService } from '../services/rolePermissionService';

// Check if discount is within limits
const handleApplyDiscount = async (discountPercent: number) => {
  try {
    await RolePermissionService.checkOperationLimit(
      userId,
      storeId,
      'max_discount_percent',
      discountPercent
    );
    // Within limit - apply discount
    applyDiscount(discountPercent);
  } catch (error) {
    // Exceeds limit - show error
    toast.error(error.message);
  }
};
```

### Use React Hook (Easier)

```typescript
import { useRolePermissions } from '../hooks/useRolePermissions';

function MyComponent() {
  const { checkLimit, canAccessModule, isAdmin } = useRolePermissions();

  const handleDiscount = async (percent: number) => {
    const { allowed, error } = await checkLimit('max_discount_percent', percent);
    if (!allowed) {
      toast.error(error);
      return;
    }
    // Apply discount...
  };

  return (
    <div>
      {canAccessModule('inventory') && <InventoryButton />}
      {isAdmin && <DeleteButton />}
    </div>
  );
}
```

---

## 📝 Configuration Examples

### Example 1: Restrict All Cashiers in a Store

```sql
-- Set low limits for all cashiers in store
INSERT INTO role_operation_limits (store_id, role, user_id, operation_type, limit_value) VALUES
  ('store-123', 'cashier', NULL, 'max_discount_percent', 5);
-- All cashiers in this store limited to 5% discount
```

### Example 2: Trust a Specific Cashier

```sql
-- Give specific cashier higher limit
INSERT INTO role_operation_limits (store_id, role, user_id, operation_type, limit_value) VALUES
  ('store-123', 'cashier', 'trusted-cashier-id', 'max_discount_percent', 20);
-- This cashier can give 20% discount (overrides 5% default)
```

### Example 3: Grant Manager Access to Settings

```sql
-- Grant specific manager access to settings module
INSERT INTO user_module_access (user_id, store_id, module, can_access) VALUES
  ('manager-id', 'store-123', 'settings', true);
-- This manager can now access settings on all devices
```

---

## 🎓 Best Practices

### 1. Start with Role Defaults
- Set up sensible defaults for each role first
- Apply custom overrides only when needed
- Don't over-customize (harder to maintain)

### 2. Use Principle of Least Privilege
- Give users minimum access needed for their job
- Add more access as needed (easier than removing)
- Regularly review and audit permissions

### 3. Document Custom Permissions
- Keep notes on why specific users have custom access
- Review custom permissions quarterly
- Remove outdated custom permissions

### 4. Test Before Deploying
- Test with actual users
- Verify cross-device sync works
- Ensure offline mode works

### 5. Monitor & Adjust
- Watch for users requesting access
- Adjust limits based on business needs
- Be responsive to operational requirements

---

## 🆘 Troubleshooting

### User Can't Access Module

**Check**:
1. User's role - does it allow this module by default?
2. Custom access - is there a blocking override?
3. Sync status - has permission synced to this device?
4. Offline data - is IndexedDB up to date?

### Operation Blocked by Limit

**Check**:
1. User-specific limit - does user have custom limit?
2. Role default - what's the role's default limit?
3. Currency mismatch - USD limit won't apply to LBP operation
4. No limit configured - if no limit exists, operation should be allowed

### Changes Not Syncing

**Check**:
1. Internet connection
2. Sync service running
3. RLS policies allow write
4. Check browser console for sync errors

---

## 📞 Support

If you encounter issues:
1. Check browser console for errors
2. Verify database records exist
3. Test in incognito mode (clear cache)
4. Check `RBAC_TESTING_GUIDE.md` for systematic testing

---

## 🎉 You're Ready!

The RBAC system is now fully functional and ready to use!

**Key Files**:
- `RBAC_IMPLEMENTATION_ANALYSIS.md` - Technical details
- `RBAC_TESTING_GUIDE.md` - Testing procedures
- `RBAC_USAGE_GUIDE.md` - This file (usage instructions)

