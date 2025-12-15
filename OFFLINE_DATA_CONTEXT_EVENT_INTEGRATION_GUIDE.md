# OfflineDataContext Event Integration Guide

## 🎯 Goal

Integrate event emission into `OfflineDataContext.tsx` so that all configuration table updates emit events to `branch_event_log`, enabling real-time sync across all devices.

---

## 📋 Tables That Need Event Emission

| Table | Methods to Update | Priority |
|-------|------------------|----------|
| `products` | addProduct, updateProduct, deleteProduct, bulkImportProducts | HIGH |
| `entities` | addEntity, updateEntity, deleteEntity, bulkImportEntities | HIGH |
| `users` | addEmployee, updateEmployee, deleteEmployee | MEDIUM |
| `stores` | updateStoreSettings | MEDIUM |
| `branches` | updateBranch | MEDIUM |
| `reminders` | addReminder, updateReminder, deleteReminder | LOW |
| `chart_of_accounts` | (if exists) | LOW |

---

## 🔧 Step-by-Step Integration

### Step 1: Import Event Helper

At the top of `OfflineDataContext.tsx`:

```typescript
// Add this import
import {
  emitProductEvent,
  emitProductsBulkEvent,
  emitEntityEvent,
  emitEntitiesBulkEvent,
  emitUserEvent,
  emitUsersBulkEvent,
  emitStoreEvent,
  emitBranchEvent,
  emitReminderEvent,
  buildEventOptions,
} from '../services/eventEmissionHelper';
```

### Step 2: Update Product Methods

#### 2.1 Add Product (Single)

**Find this pattern:**
```typescript
const addProduct = async (productData: any) => {
  const productId = generateId();
  await db.products.add({
    ...productData,
    id: productId,
    store_id: storeId,
    _synced: false,
  });
  
  await refreshData();
  await syncService.sync(storeId); // Might be called elsewhere
};
```

**Update to:**
```typescript
const addProduct = async (productData: any) => {
  const productId = generateId();
  await db.products.add({
    ...productData,
    id: productId,
    store_id: storeId,
    _synced: false,
  });
  
  // Trigger sync to upload to Supabase
  await syncService.sync(storeId);
  
  // NEW: Emit event after successful sync
  await emitProductEvent(productId, buildEventOptions(
    storeId,
    currentBranchId,
    userProfile?.id,
    'create'
  ));
  
  await refreshData();
};
```

#### 2.2 Update Product (Single)

**Find this pattern:**
```typescript
const updateProduct = async (productId: string, updates: any) => {
  await db.products.update(productId, {
    ...updates,
    updated_at: new Date().toISOString(),
    _synced: false,
  });
  
  await refreshData();
};
```

**Update to:**
```typescript
const updateProduct = async (productId: string, updates: any) => {
  await db.products.update(productId, {
    ...updates,
    updated_at: new Date().toISOString(),
    _synced: false,
  });
  
  // Trigger sync
  await syncService.sync(storeId);
  
  // NEW: Emit event with changed fields
  await emitProductEvent(productId, buildEventOptions(
    storeId,
    currentBranchId,
    userProfile?.id,
    'update',
    { fields_changed: Object.keys(updates) }
  ));
  
  await refreshData();
};
```

#### 2.3 Delete Product

**Find this pattern:**
```typescript
const deleteProduct = async (productId: string) => {
  await db.products.delete(productId);
  await refreshData();
};
```

**Update to:**
```typescript
const deleteProduct = async (productId: string) => {
  await db.products.delete(productId);
  
  // NEW: Emit deletion event
  await emitProductEvent(productId, buildEventOptions(
    storeId,
    currentBranchId,
    userProfile?.id,
    'delete'
  ));
  
  await refreshData();
};
```

#### 2.4 Bulk Import Products

**Find this pattern:**
```typescript
const bulkImportProducts = async (productsData: any[]) => {
  for (const productData of productsData) {
    const productId = generateId();
    await db.products.add({ ...productData, id: productId, _synced: false });
  }
  
  await syncService.sync(storeId);
  await refreshData();
};
```

**Update to:**
```typescript
const bulkImportProducts = async (productsData: any[]) => {
  const productIds: string[] = [];
  
  // Save all products
  for (const productData of productsData) {
    const productId = generateId();
    await db.products.add({ ...productData, id: productId, _synced: false });
    productIds.push(productId);
  }
  
  // Sync to Supabase
  await syncService.sync(storeId);
  
  // NEW: Emit ONE bulk event (not 100 individual events!)
  await emitProductsBulkEvent(productIds, buildEventOptions(
    storeId,
    currentBranchId,
    userProfile?.id,
    'create',
    { operationType: 'import' }
  ));
  
  await refreshData();
};
```

---

### Step 3: Update Entity (Customer/Supplier) Methods

#### 3.1 Add Entity

```typescript
const addEntity = async (entityData: any) => {
  const entityId = generateId();
  await db.entities.add({
    ...entityData,
    id: entityId,
    store_id: storeId,
    _synced: false,
  });
  
  await syncService.sync(storeId);
  
  // NEW: Emit event
  await emitEntityEvent(entityId, buildEventOptions(
    storeId,
    currentBranchId,
    userProfile?.id,
    'create'
  ));
  
  await refreshData();
};
```

#### 3.2 Update Entity

```typescript
const updateEntity = async (entityId: string, updates: any) => {
  await db.entities.update(entityId, {
    ...updates,
    updated_at: new Date().toISOString(),
    _synced: false,
  });
  
  await syncService.sync(storeId);
  
  // NEW: Emit event
  await emitEntityEvent(entityId, buildEventOptions(
    storeId,
    currentBranchId,
    userProfile?.id,
    'update',
    { fields_changed: Object.keys(updates) }
  ));
  
  await refreshData();
};
```

#### 3.3 Delete Entity

```typescript
const deleteEntity = async (entityId: string) => {
  await db.entities.delete(entityId);
  
  // NEW: Emit event
  await emitEntityEvent(entityId, buildEventOptions(
    storeId,
    currentBranchId,
    userProfile?.id,
    'delete'
  ));
  
  await refreshData();
};
```

#### 3.4 Bulk Import Entities

```typescript
const bulkImportEntities = async (entitiesData: any[]) => {
  const entityIds: string[] = [];
  
  for (const entityData of entitiesData) {
    const entityId = generateId();
    await db.entities.add({ ...entityData, id: entityId, _synced: false });
    entityIds.push(entityId);
  }
  
  await syncService.sync(storeId);
  
  // NEW: Emit bulk event
  await emitEntitiesBulkEvent(entityIds, buildEventOptions(
    storeId,
    currentBranchId,
    userProfile?.id,
    'create',
    { operationType: 'import' }
  ));
  
  await refreshData();
};
```

---

### Step 4: Update User (Employee) Methods

#### 4.1 Add Employee

```typescript
const addEmployee = async (userData: any) => {
  const userId = generateId();
  await db.users.add({
    ...userData,
    id: userId,
    store_id: storeId,
    _synced: false,
  });
  
  await syncService.sync(storeId);
  
  // NEW: Emit event
  await emitUserEvent(userId, buildEventOptions(
    storeId,
    currentBranchId,
    userProfile?.id,
    'create'
  ));
  
  await refreshData();
};
```

#### 4.2 Update Employee

```typescript
const updateEmployee = async (userId: string, updates: any) => {
  await db.users.update(userId, {
    ...updates,
    updated_at: new Date().toISOString(),
    _synced: false,
  });
  
  await syncService.sync(storeId);
  
  // NEW: Emit event
  await emitUserEvent(userId, buildEventOptions(
    storeId,
    currentBranchId,
    userProfile?.id,
    'update',
    { fields_changed: Object.keys(updates) }
  ));
  
  await refreshData();
};
```

---

### Step 5: Update Store Settings

```typescript
const updateStoreSettings = async (updates: any) => {
  await db.stores.update(storeId, {
    ...updates,
    updated_at: new Date().toISOString(),
    _synced: false,
  });
  
  await syncService.sync(storeId);
  
  // NEW: Emit event
  await emitStoreEvent(buildEventOptions(
    storeId,
    currentBranchId,
    userProfile?.id,
    undefined,
    { fields_changed: Object.keys(updates) }
  ));
  
  await refreshData();
};
```

**Example Use Cases:**
- Update commission rate
- Update exchange rate
- Update store name
- Update store settings

---

### Step 6: Update Branch Info

```typescript
const updateBranch = async (branchId: string, updates: any) => {
  await db.branches.update(branchId, {
    ...updates,
    updated_at: new Date().toISOString(),
    _synced: false,
  });
  
  await syncService.sync(storeId);
  
  // NEW: Emit event
  await emitBranchEvent(buildEventOptions(
    storeId,
    currentBranchId,
    userProfile?.id,
    undefined,
    { fields_changed: Object.keys(updates) }
  ));
  
  await refreshData();
};
```

---

### Step 7: Update Reminder Methods (If Applicable)

```typescript
const addReminder = async (reminderData: any) => {
  const reminderId = generateId();
  await db.reminders.add({
    ...reminderData,
    id: reminderId,
    store_id: storeId,
    _synced: false,
  });
  
  await syncService.sync(storeId);
  
  // NEW: Emit event
  await emitReminderEvent(reminderId, buildEventOptions(
    storeId,
    currentBranchId,
    userProfile?.id,
    'create'
  ));
  
  await refreshData();
};

const updateReminder = async (reminderId: string, updates: any) => {
  await db.reminders.update(reminderId, {
    ...updates,
    updated_at: new Date().toISOString(),
    _synced: false,
  });
  
  await syncService.sync(storeId);
  
  // NEW: Emit event
  await emitReminderEvent(reminderId, buildEventOptions(
    storeId,
    currentBranchId,
    userProfile?.id,
    'update'
  ));
  
  await refreshData();
};
```

---

## 🎯 Common Patterns

### Pattern 1: Simple Create/Update/Delete

```typescript
// 1. Modify IndexedDB
await db.TABLE.operation(...);

// 2. Sync to Supabase
await syncService.sync(storeId);

// 3. Emit event
await emitXXXEvent(id, buildEventOptions(
  storeId,
  currentBranchId,
  userProfile?.id,
  'create' | 'update' | 'delete'
));

// 4. Refresh UI
await refreshData();
```

### Pattern 2: Bulk Operations

```typescript
const ids: string[] = [];

// 1. Modify IndexedDB (loop)
for (const item of items) {
  const id = generateId();
  await db.TABLE.add({ ...item, id, _synced: false });
  ids.push(id);
}

// 2. Sync to Supabase
await syncService.sync(storeId);

// 3. Emit ONE bulk event
await emitXXXBulkEvent(ids, buildEventOptions(
  storeId,
  currentBranchId,
  userProfile?.id,
  'create',
  { operationType: 'import' }
));

// 4. Refresh UI
await refreshData();
```

---

## ⚠️ Important Rules

### 1. Always Emit AFTER Successful Sync

```typescript
// ✅ CORRECT
await syncService.sync(storeId);  // Upload to Supabase first
await emitEvent(...);              // Then emit event

// ❌ WRONG
await emitEvent(...);              // Event emitted first
await syncService.sync(storeId);  // But upload might fail!
```

**Why?** Other devices will receive the event and try to fetch the record from Supabase. If the record doesn't exist yet, they'll get an error.

### 2. Use Bulk Events for Multiple Records

```typescript
// ✅ CORRECT - Bulk event
await emitProductsBulkEvent([id1, id2, id3, ...]);

// ❌ WRONG - Event storm
for (const id of ids) {
  await emitProductEvent(id, ...);
}
```

**Why?** 100 individual events = 100 network requests for other devices. 1 bulk event = 1 network request.

### 3. Handle Missing branchId Gracefully

```typescript
// ✅ CORRECT - Helper handles this
await emitProductEvent(productId, buildEventOptions(
  storeId,
  currentBranchId,  // Might be null
  userProfile?.id,
  'create'
));

// Helper will log warning and skip emission if branchId is null
```

### 4. Event Emission Failures Should Not Block Operations

The helper already handles this, but be aware:

```typescript
// Event emission failures are logged but don't throw
// The main operation (create/update/delete) completes successfully
await emitProductEvent(...); // Might fail, but doesn't throw
```

---

## 🧪 Testing After Integration

### Test 1: Single Product Create

1. Open app on Device A
2. Create a product
3. Verify product appears on Device B instantly (< 1 second)
4. Check console logs for event emission success

### Test 2: Bulk Product Import

1. Import 100 products on Device A
2. Verify all 100 appear on Device B
3. Check branch_event_log table - should have only 1 event (not 100)

### Test 3: Store Settings Update

1. Update commission rate on Device A
2. Verify new rate on Device B instantly
3. Confirm NO 5-minute delay

### Test 4: Network Idle Check

1. Leave system idle for 10 minutes
2. Open browser DevTools Network tab
3. Verify ZERO REST API requests
4. Only WebSocket connection should be active

---

## 📊 Expected Event Volume

After full integration, expected events per day for typical store:

```
Business events (existing):
- Sales: ~100 events/day
- Inventory: ~50 events/day
- Transactions: ~50 events/day
- Cash drawer: ~20 events/day
Subtotal: ~220 events/day

Configuration events (NEW):
- Products: ~20 events/day
- Entities: ~10 events/day
- Users: ~5 events/day
- Store settings: ~5 events/day
- Other: ~5 events/day
Subtotal: ~45 events/day

Total: ~265 events/day (well within acceptable range)
```

---

## 🎯 Integration Checklist

Use this checklist to track your progress:

- [ ] Import event helpers at top of OfflineDataContext.tsx
- [ ] Update `addProduct()` with event emission
- [ ] Update `updateProduct()` with event emission
- [ ] Update `deleteProduct()` with event emission
- [ ] Update `bulkImportProducts()` with bulk event emission
- [ ] Update `addEntity()` with event emission
- [ ] Update `updateEntity()` with event emission
- [ ] Update `deleteEntity()` with event emission
- [ ] Update `bulkImportEntities()` with bulk event emission
- [ ] Update `addEmployee()` with event emission
- [ ] Update `updateEmployee()` with event emission
- [ ] Update `updateStoreSettings()` with event emission
- [ ] Update `updateBranch()` with event emission (if applicable)
- [ ] Update reminder methods with event emission (if applicable)
- [ ] Test single product create/update/delete
- [ ] Test bulk product import
- [ ] Test entity operations
- [ ] Test store settings update
- [ ] Verify network idle state (no polling)
- [ ] Check event log for storms (should be none)
- [ ] Monitor event log growth over 1 week

---

## 🚀 Next Steps

After completing integration:

1. **Test thoroughly** with 2-3 devices
2. **Monitor** event log size and network usage
3. **Deploy** to production gradually
4. **Document** any edge cases discovered
5. **Set up** event log archival (optional, for long-term)

---

## 📚 Related Files

- `eventEmissionHelper.ts` - Event emission utilities
- `eventEmissionService.ts` - Core event emission service
- `eventStreamService.ts` - Event processing service
- `FULLY_EVENT_DRIVEN_MIGRATION_COMPLETE.md` - Migration overview
- `HYBRID_VS_FULLY_EVENT_DRIVEN_COMPARISON.md` - Comparison analysis

---

## ❓ Questions or Issues?

If you encounter any issues during integration:

1. Check console logs for event emission failures
2. Verify branchId is available in context
3. Check branch_event_log table in Supabase
4. Ensure sync happens before event emission
5. Review this guide's common patterns section

Good luck with the integration! 🚀

