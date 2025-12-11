# RBAC System - Testing & Validation Guide

## 🎯 Testing Checklist

Use this guide to systematically test all RBAC features.

---

## ✅ Test 1: Database Verification

### 1.1 Check Tables Exist

Run in Supabase SQL Editor:
```sql
SELECT table_name 
FROM information_schema.tables 
WHERE table_schema = 'public' 
AND table_name IN ('role_operation_limits', 'user_module_access');
```

**Expected**: Both tables should appear

### 1.2 Check RLS Policies

```sql
SELECT tablename, policyname 
FROM pg_policies 
WHERE tablename IN ('role_operation_limits', 'user_module_access');
```

**Expected**: Should show policies for both tables

---

## ✅ Test 2: IndexedDB Verification

### 2.1 Check Database Version

1. Open the app in browser
2. Open DevTools → Console
3. Check for migration message: `🔧 Running migration v40: Add RBAC tables`

**Expected**: Database should migrate to version 40

### 2.2 Check Tables Exist in IndexedDB

In DevTools Console, run:
```javascript
const db = await window.indexedDB.databases();
console.log(db);

// Or directly inspect:
const request = indexedDB.open('POSDatabase');
request.onsuccess = function() {
  const db = request.result;
  console.log('Object stores:', Array.from(db.objectStoreNames));
};
```

**Expected**: Should include `role_operation_limits` and `user_module_access`

---

## ✅ Test 3: Module Access Control

### 3.1 Test Default Module Access (Role-Based)

**Setup**:
1. Create 3 test users: Admin, Manager, Cashier
2. Don't set any custom module access yet

**Test Cases**:

| User Role | Should See | Should NOT See |
|-----------|------------|----------------|
| Admin | POS, Inventory, Accounting, Reports, Settings, Users | - |
| Manager | POS, Inventory, Accounting, Reports | Settings, Users |
| Cashier | POS | Inventory, Accounting, Reports, Settings, Users |

**How to Test**:
1. Log in as each user
2. Check navigation menu
3. Try accessing URLs directly (e.g., `/accounting`)
4. Should redirect to dashboard if blocked

### 3.2 Test Custom Module Access (User-Specific)

**Setup**:
1. Log in as Admin
2. Go to Employees page
3. Edit a cashier user
4. Click "Module Access" tab

**Test Cases**:

| Action | Expected Result |
|--------|----------------|
| Grant "Inventory" to cashier | Inventory appears in cashier's navigation menu |
| Block "Reports" from manager | Reports disappears from manager's navigation menu |
| Reset to default | Returns to role default (cashier loses inventory) |

**Cross-Device Test**:
1. Grant cashier access to Inventory on Desktop
2. Log in as cashier on another device/browser
3. Refresh or wait for sync
4. **Expected**: Inventory should appear in navigation

---

## ✅ Test 4: Operation Limits

### 4.1 Test Role Default Limits

**Setup**:
1. Log in as Admin
2. Add default limits via SQL or UI (when UI is ready):

```sql
-- Set default limits for a store
INSERT INTO role_operation_limits (store_id, role, user_id, operation_type, limit_value) VALUES
  ('your-store-id', 'cashier', NULL, 'max_discount_percent', 10),
  ('your-store-id', 'manager', NULL, 'max_discount_percent', 50),
  ('your-store-id', 'admin', NULL, 'max_discount_percent', 100);
```

**Test Cases**:
- Cashier tries 15% discount → Should be blocked (limit: 10%)
- Manager tries 60% discount → Should be blocked (limit: 50%)
- Admin tries 100% discount → Should be allowed

### 4.2 Test User-Specific Overrides

**Setup**:
1. Go to Employees page
2. Edit a cashier
3. Click "Operation Limits" tab
4. Set custom discount limit to 25%

**Test**:
- Cashier tries 20% discount → Should be allowed (custom limit: 25%)
- Other cashiers try 20% discount → Should be blocked (role default: 10%)

**Cross-Device Test**:
1. Set custom limit for user on Desktop
2. Log in as that user on another device
3. Try the operation
4. **Expected**: Custom limit should apply

---

## ✅ Test 5: Route Protection

### 5.1 Test Protected Routes

**Test Cases**:

| User | Navigate to | Expected Result |
|------|-------------|----------------|
| Cashier | `/accounting` | Redirect to `/dashboard` |
| Cashier | `/inventory` | Redirect to `/dashboard` |
| Manager | `/users` (employees) | Redirect to `/dashboard` |
| Manager | `/settings` | Redirect to `/dashboard` |
| Admin | Any route | Access granted |

**How to Test**:
1. Log in as cashier
2. Type `/accounting` in URL bar
3. Should redirect to dashboard
4. Check console for "Access denied" message

---

## ✅ Test 6: Navigation Menu Visibility

### 6.1 Test Dynamic Menu

**Test**:
1. Log in as different roles
2. Check which menu items appear

**Expected**:

| User Role | Visible Menu Items |
|-----------|-------------------|
| Admin | All items |
| Manager | POS, Inventory, Accounting, Reports (no Settings/Users) |
| Cashier | POS only |

### 6.2 Test After Custom Access Grant

**Test**:
1. As Admin, grant Inventory access to a cashier
2. Log out and log in as that cashier
3. **Expected**: Inventory should now appear in menu

---

## ✅ Test 7: Offline Functionality

### 7.1 Test Offline Module Access

**Test**:
1. Grant cashier access to Inventory (while online)
2. Disconnect internet
3. Refresh app
4. Log in as cashier
5. **Expected**: Inventory should still appear (cached in IndexedDB)

### 7.2 Test Offline Limit Checks

**Test**:
1. Set custom discount limit for user (while online)
2. Disconnect internet
3. Try to apply discount above/below limit
4. **Expected**: Limit should still be enforced (cached in IndexedDB)

---

## ✅ Test 8: Admin UI - Employees Page

### 8.1 Test Module Access Tab

**Test**:
1. Go to Employees page
2. Click Edit on any employee
3. Click "Module Access" tab

**Expected**:
- Should see all 6 modules (POS, Inventory, Accounting, Reports, Settings, Users)
- Should show default status for each module based on role
- Should show "Custom" badge for any overridden modules
- Grant/Block/Reset buttons should work

### 8.2 Test Operation Limits Tab

**Test**:
1. Go to Employees page
2. Click Edit on any employee
3. Click "Operation Limits" tab

**Expected**:
- Should see all operation types (Max Discount %, Max Void amounts, Max Return amounts)
- Should show role default values
- Should show "Custom" badge for overridden limits
- Edit/Save/Reset buttons should work

---

## ✅ Test 9: Cross-Device Sync

### 9.1 Test Module Access Sync

**Test**:
1. **Device A** (Admin): Grant inventory access to cashier
2. **Device B** (Cashier): Wait for sync (or manually sync)
3. Check cashier's navigation menu
4. **Expected**: Inventory should appear

### 9.2 Test Operation Limits Sync

**Test**:
1. **Device A** (Admin): Set custom discount limit for cashier (25%)
2. **Device B** (Cashier): Try to apply 20% discount
3. **Expected**: Should be allowed (custom limit synced)

---

## ✅ Test 10: Edge Cases

### 10.1 Test User Without Limits

**Test**:
- User has no custom limits
- Role has no default limits
- **Expected**: Operations should be unlimited (if permission allows)

### 10.2 Test Deleted User

**Test**:
1. Set custom access for a user
2. Delete the user
3. **Expected**: Records should be cleaned up (CASCADE delete)

### 10.3 Test Role Change

**Test**:
1. User is cashier with custom limits
2. Change user to manager
3. **Expected**: Custom limits still apply, but role defaults change

---

## 🐛 Common Issues & Solutions

### Issue 1: Menu Items Not Updating

**Solution**:
- Check browser console for errors
- Verify `getUserModuleAccess()` is being called
- Clear cache and refresh
- Check IndexedDB has records

### Issue 2: Limits Not Enforced

**Solution**:
- Verify limit records exist in database
- Check `checkOperationLimit()` is being called before operation
- Verify currency matches (USD vs LBP)

### Issue 3: Changes Not Syncing

**Solution**:
- Check sync service is running
- Verify RLS policies allow access
- Check network tab for sync errors
- Manually trigger sync with `Ctrl+S`

---

## 📊 Test Results Template

Use this template to document your testing:

```
Date: ___________
Tester: ___________

Test 1 - Database Verification: ☐ Pass ☐ Fail
Test 2 - IndexedDB Verification: ☐ Pass ☐ Fail
Test 3 - Module Access Control: ☐ Pass ☐ Fail
Test 4 - Operation Limits: ☐ Pass ☐ Fail
Test 5 - Route Protection: ☐ Pass ☐ Fail
Test 6 - Navigation Menu: ☐ Pass ☐ Fail
Test 7 - Offline Functionality: ☐ Pass ☐ Fail
Test 8 - Admin UI: ☐ Pass ☐ Fail
Test 9 - Cross-Device Sync: ☐ Pass ☐ Fail
Test 10 - Edge Cases: ☐ Pass ☐ Fail

Issues Found:
1. ___________
2. ___________

Notes:
___________
```

---

## 🎉 Testing Complete Criteria

All tests pass when:
- ✅ Database tables created and accessible
- ✅ IndexedDB migrated to version 40
- ✅ Module access enforced (role defaults + custom overrides)
- ✅ Operation limits enforced (role defaults + user overrides)
- ✅ Routes protected (redirect on access denial)
- ✅ Navigation menu dynamic (shows only accessible modules)
- ✅ Offline mode works (cached permissions)
- ✅ Admin UI works (manage module access + operation limits)
- ✅ Cross-device sync works (changes sync to all devices)
- ✅ No console errors

---

## 🚀 Ready for Production?

Once all tests pass, the RBAC system is production-ready!

**Next steps**:
1. Configure default limits for your stores
2. Set up custom access for your team
3. Train admins on using the RBAC UI
4. Monitor and adjust as needed

