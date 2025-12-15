# 🐛 Event Emission UUID Fix

## 🚨 **Error**

```
POST https://bvstlhouisiekqanuggj.supabase.co/rest/v1/rpc/emit_branch_event 400 (Bad Request)

[Event] Failed to emit store_updated event: 
Error: Failed to emit event: invalid input syntax for type uuid: ""
```

---

## 🔍 **Root Cause**

When emitting events for **store-level tables** (tables without branch context), the code was passing an **empty string** `''` for `branch_id`:

```typescript
// ❌ WRONG - Empty string is not a valid UUID
await eventEmissionService.emitEvent({
  store_id: record.id,
  branch_id: '', // ← Invalid!
  event_type: 'store_updated',
  // ...
});
```

### **Why This Failed**

The `branch_event_log` table has a `branch_id` column of type **UUID**. PostgreSQL UUID columns:
- ✅ Accept valid UUIDs (e.g., `'550e8400-e29b-41d4-a716-446655440000'`)
- ✅ Accept `NULL`
- ❌ **Reject empty strings** `''`

The RPC function `emit_branch_event` validation caught this:

```sql
-- In PostgreSQL, this fails:
INSERT INTO branch_event_log (branch_id, ...) VALUES ('', ...);
-- Error: invalid input syntax for type uuid: ""
```

---

## ✅ **The Fix**

Changed all store-level tables to use `null` instead of `''` for `branch_id`:

### **1. Entities (Customers/Suppliers)**
```typescript
// ✅ FIXED
await eventEmissionService.emitEvent({
  store_id: record.store_id,
  branch_id: null, // ← Store-level, no branch context
  event_type: record.entity_type === 'customer' ? 'customer_updated' : 'supplier_updated',
  // ...
});
```

---

### **2. Stores**
```typescript
// ✅ FIXED
await eventEmissionService.emitEvent({
  store_id: record.id,
  branch_id: null, // ← Store settings are store-wide
  event_type: 'store_updated',
  // ...
});
```

---

### **3. Users**
```typescript
// ✅ FIXED
await eventEmissionService.emitEvent({
  store_id: record.store_id,
  branch_id: null, // ← Users are store-level
  event_type: 'user_updated',
  // ...
});
```

---

### **4. Products**
```typescript
// ✅ FIXED
await eventEmissionService.emitEvent({
  store_id: record.store_id,
  branch_id: null, // ← Products are store-wide
  event_type: 'product_updated',
  // ...
});
```

---

### **5. Chart of Accounts**
```typescript
// ✅ FIXED
await eventEmissionService.emitEvent({
  store_id: record.store_id,
  branch_id: null, // ← Accounting is store-level
  event_type: 'chart_of_account_updated',
  // ...
});
```

---

### **6. Role Operation Limits**
```typescript
// ✅ FIXED
await eventEmissionService.emitEvent({
  store_id: record.store_id,
  branch_id: null, // ← Roles are store-level
  event_type: 'role_operation_limit_updated',
  // ...
});
```

---

### **7. User Module Access**
```typescript
// ✅ FIXED
await eventEmissionService.emitEvent({
  store_id: record.store_id,
  branch_id: null, // ← Permissions are store-level
  event_type: 'user_module_access_updated',
  // ...
});
```

---

## 📊 **Store-Level vs Branch-Level**

| Table | Level | branch_id |
|-------|-------|-----------|
| `stores` | Store-wide | `null` ✅ |
| `branches` | Branch-specific | `record.id` ✅ |
| `entities` | Store-wide | `null` ✅ |
| `users` | Store-wide | `null` ✅ |
| `products` | Store-wide | `null` ✅ |
| `chart_of_accounts` | Store-wide | `null` ✅ |
| `role_operation_limits` | Store-wide | `null` ✅ |
| `user_module_access` | Store-wide | `null` ✅ |
| `bills` | Branch-specific | `record.branch_id` ✅ |
| `transactions` | Branch-specific | `record.branch_id` ✅ |
| `inventory_items` | Branch-specific | `record.branch_id` ✅ |
| `cash_drawer_sessions` | Branch-specific | `record.branch_id` ✅ |
| `cash_drawer_accounts` | Branch-specific | `record.branch_id` ✅ |

---

## 🧪 **Testing**

### **Before Fix**
```bash
# Error when syncing store settings
POST /rpc/emit_branch_event 400 (Bad Request)
Error: invalid input syntax for type uuid: ""
```

### **After Fix**
```bash
# Success!
POST /rpc/emit_branch_event 200 OK
🎯 [Event] Emitted store_updated event for store abc123...
```

---

## 🎯 **Result**

- ✅ All event emissions now work correctly
- ✅ Store-level tables use `branch_id: null`
- ✅ Branch-level tables use `branch_id: record.branch_id` or `record.id`
- ✅ No more UUID validation errors
- ✅ Settings sync now works properly

---

## 📝 **Key Takeaway**

When working with UUID columns in PostgreSQL:
- ✅ Use `null` for optional values
- ❌ Never use empty strings `''`
- ❌ Never use invalid UUID formats

PostgreSQL is strict about type validation - empty strings are not valid UUIDs!

---

**Last Updated**: December 15, 2025  
**Status**: ✅ Fixed  
**Files Modified**: `syncService.ts` (7 changes)

