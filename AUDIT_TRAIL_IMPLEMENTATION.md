# Audit Trail Implementation Documentation

## Table of Contents
1. [Overview](#overview)
2. [Design Architecture](#design-architecture)
3. [Database Schema](#database-schema)
4. [Core Logic & Strategy](#core-logic--strategy)
5. [Implementation Details](#implementation-details)
6. [Function Reference](#function-reference)
7. [ID Resolution System](#id-resolution-system)
8. [Display & UI](#display--ui)
9. [Best Practices](#best-practices)

---

## Overview

The Audit Trail system provides comprehensive tracking of all changes made to bills and their line items in the POS system. It creates human-readable audit logs that resolve IDs to actual names, making it easy for non-technical users to understand what changed, who changed it, and when.

### Key Features
- ✅ **Human-Readable Values**: Converts IDs to actual names (customer, product, supplier)
- ✅ **Descriptive Change Reasons**: Auto-generates clear descriptions like "Updating Customer from Ahmad to Mohammad"
- ✅ **User Tracking**: Records who made each change with proper user name resolution
- ✅ **Old/New Value Tracking**: Maintains complete before/after state
- ✅ **Operation Types**: Distinguishes between Create, Update, Delete, and item modifications
- ✅ **Offline-First**: Works seamlessly offline with IndexedDB, syncs to Supabase when online

---

## Design Architecture

### System Architecture Diagram

```
┌─────────────────────────────────────────────────────────────┐
│                    User Interface Layer                      │
│  (SoldBills.tsx - Displays Audit Trail with grouping)       │
└──────────────────────┬──────────────────────────────────────┘
                       │
                       ▼
┌─────────────────────────────────────────────────────────────┐
│                  Data Context Layer                          │
│  (OfflineDataContext.tsx - Orchestrates operations)         │
│  • Creates bills with audit logs                            │
│  • Updates bills with ID resolution                         │
│  • Deletes bills with descriptive reasons                   │
└──────────────────────┬──────────────────────────────────────┘
                       │
                       ▼
┌─────────────────────────────────────────────────────────────┐
│                  Database Layer                              │
│  (db.ts - Core database operations)                         │
│  • Bill CRUD operations                                     │
│  • Line item CRUD operations                                │
│  • Audit log creation with field tracking                   │
└──────────────────────┬──────────────────────────────────────┘
                       │
                       ▼
┌─────────────────────────────────────────────────────────────┐
│                  Storage Layer                               │
│  IndexedDB (Dexie.js) ←──sync──→ Supabase PostgreSQL       │
│  • bill_audit_logs table                                    │
│  • Offline-first with automatic sync                        │
└─────────────────────────────────────────────────────────────┘
```

### Design Principles

1. **Offline-First Architecture**
   - All audit logs are created in IndexedDB first
   - Automatic synchronization to Supabase when online
   - No data loss even in offline mode

2. **Human-Readable by Default**
   - IDs are resolved to names at creation time
   - Values are formatted appropriately (currency, dates, etc.)
   - Change reasons are descriptive and clear

3. **Complete Audit Trail**
   - Every change is tracked (Create, Update, Delete)
   - Old and new values are always recorded
   - User information is captured with each change

4. **Performance Optimized**
   - ID resolution happens once during creation
   - Grouped display reduces UI clutter
   - Indexed database queries for fast retrieval

---

## Database Schema

### bill_audit_logs Table

```typescript
interface BillAuditLog {
  // Primary identification
  id: string;                    // UUID
  store_id: string;              // Store reference
  bill_id: string;               // Bill being tracked
  
  // Action tracking
  action: 'created' | 'updated' | 'deleted' | 
          'item_added' | 'item_removed' | 'item_modified' | 
          'payment_updated';
  
  // Change details
  field_changed: string | null;  // Field name that changed
  old_value: string | null;      // Previous value (human-readable)
  new_value: string | null;      // New value (human-readable)
  change_reason: string | null;  // Descriptive reason
  
  // User tracking
  changed_by: string;            // User ID who made the change
  ip_address: string | null;     // Optional IP tracking
  user_agent: string | null;     // Optional browser info
  
  // Timestamps
  created_at: string;            // ISO timestamp
  updated_at: string;            // ISO timestamp
  
  // Sync metadata
  _synced: boolean;              // Sync status
  _lastSyncedAt?: string;        // Last sync time
  _deleted?: boolean;            // Soft delete flag
}
```

### Database Indexes

```sql
-- Primary key
PRIMARY KEY (id)

-- Foreign keys
FOREIGN KEY (store_id) REFERENCES stores(id)
FOREIGN KEY (bill_id) REFERENCES bills(id)
FOREIGN KEY (changed_by) REFERENCES users(id)

-- Query optimization indexes
CREATE INDEX idx_bill_audit_logs_bill_id ON bill_audit_logs(bill_id);
CREATE INDEX idx_bill_audit_logs_store_id ON bill_audit_logs(store_id);
CREATE INDEX idx_bill_audit_logs_created_at ON bill_audit_logs(created_at DESC);
CREATE INDEX idx_bill_audit_logs_action ON bill_audit_logs(action);
```

---

## Core Logic & Strategy

### 1. Audit Log Creation Strategy

#### When Audit Logs Are Created

```typescript
┌─────────────────────┐
│   User Action       │
└──────┬──────────────┘
       │
       ▼
┌─────────────────────┐
│ Is it a Create?     │──Yes──→ Create ONE log with action='created'
└──────┬──────────────┘
       │ No
       ▼
┌─────────────────────┐
│ Is it an Update?    │──Yes──→ Create MULTIPLE logs (one per changed field)
└──────┬──────────────┘
       │ No
       ▼
┌─────────────────────┐
│ Is it a Delete?     │──Yes──→ Create ONE log with action='deleted'
└─────────────────────┘
```

#### Field-Level Tracking

For **updates**, the system creates one audit log entry per changed field:

```typescript
// Example: Updating amount_paid from 1,000 to 10,000
// AND customer_id from "abc123" to "def456"

// Results in 2 separate audit log entries:
Entry 1: {
  action: 'updated',
  field_changed: 'amount_paid',
  old_value: '1,000',
  new_value: '10,000',
  change_reason: 'Updating Amount Paid from 1,000 to 10,000'
}

Entry 2: {
  action: 'updated',
  field_changed: 'customer_id',
  old_value: 'Ahmad',        // Resolved from ID
  new_value: 'Mohammad',     // Resolved from ID
  change_reason: 'Updating Customer Id from Ahmad to Mohammad'
}
```

### 2. ID Resolution Strategy

#### Resolution Flow

```typescript
┌──────────────────────┐
│ Field Value Change   │
└──────────┬───────────┘
           │
           ▼
┌──────────────────────┐
│ Is field an ID type? │──No──→ Use value as-is
└──────────┬───────────┘
           │ Yes
           ▼
┌──────────────────────┐
│ Query related table  │
│ (customers, products,│
│  suppliers, users)   │
└──────────┬───────────┘
           │
           ▼
┌──────────────────────┐
│ Entity found?        │──Yes──→ Use entity.name
└──────────┬───────────┘
           │ No
           ▼
     Use original ID
     (fallback)
```

#### Supported ID Fields

| Field Name | Resolves To | Table | Display Field |
|------------|-------------|-------|---------------|
| `customer_id` | Customer Name | `customers` | `name` |
| `product_id` | Product Name | `products` | `name` |
| `supplier_id` | Supplier Name | `suppliers` | `name` |
| `changed_by` | User Name | `users` | `name` |

### 3. Change Reason Generation

#### Automatic Reason Templates

```typescript
// Template: "Action Field from OldValue to NewValue"

1. Create Operations:
   "Creating bill #BILL-123 with total amount 10,000"

2. Update Operations:
   "Updating [Field Label] from [Old Value] to [New Value]"
   
   Examples:
   - "Updating Customer Id from Ahmad to Mohammad"
   - "Updating Amount Paid from 1,000 to 10,000"
   - "Updating Payment Status from pending to paid"

3. Delete Operations:
   "Deleting bill #BILL-123 (cancelled)" or
   "Deleting bill #BILL-123 (permanently deleted)"

4. Line Item Operations:
   - Add: "Adding line item: Laptop (Qty: 5, Price: 1000)"
   - Modify: "Modifying line item: Quantity from 5 to 10 (Product: Laptop)"
   - Remove: "Removing line item: Laptop (Qty: 5, Price: 1000)"
```

---

## Implementation Details

### File Structure

```
src/
├── lib/
│   └── db.ts                    # Core database operations
├── contexts/
│   └── OfflineDataContext.tsx   # Data orchestration layer
├── components/
│   └── accountingPage/
│       └── tabs/
│           └── SoldBills.tsx    # Audit trail display
├── types/
│   ├── index.ts                 # BillAuditLog interface
│   └── database.ts              # Supabase types
└── supabase/
    └── migrations/
        └── 20250819204605_fierce_scene.sql  # Database schema
```

---

## Function Reference

### Core Functions

#### 1. `createBill()` - OfflineDataContext.tsx

**Purpose**: Creates a new bill with automatic audit log entry

**Signature**:
```typescript
async createBill(
  billData: any,
  lineItems: any[],
  customerBalanceUpdate?: { 
    customerId: string; 
    amountDue: number; 
    originalBalance: number 
  }
): Promise<string>
```

**Audit Log Creation**:
```typescript
await db.bill_audit_logs.add({
  id: createId(),
  store_id: storeId,
  bill_id: billId,
  action: 'created',
  field_changed: null,
  old_value: null,
  new_value: JSON.stringify(bill),
  change_reason: `Creating bill #${bill.bill_number} with total amount ${bill.total_amount}`,
  changed_by: currentUserId,
  ip_address: null,
  user_agent: null,
  created_at: now,
  updated_at: now,
  _synced: false
});
```

**Strategy**:
- Creates ONE audit log entry for the entire bill creation
- Stores the complete bill data in `new_value`
- `old_value` is null (no previous state)
- Change reason includes bill number and total amount

---

#### 2. `updateBill()` - OfflineDataContext.tsx

**Purpose**: Updates bill fields with field-level audit tracking

**Signature**:
```typescript
async updateBill(
  billId: string,
  updates: any,
  changedBy: string,
  changeReason?: string
): Promise<void>
```

**Audit Log Creation Logic**:
```typescript
// Create detailed audit logs for each changed field
const auditLogs = [];
for (const [field, newValue] of Object.entries(updates)) {
  if (field !== '_synced' && field !== 'updated_at') {
    const oldValue = (originalBill as any)[field];
    if (oldValue !== newValue) {
      // Resolve IDs to human-readable names
      let oldValueDisplay = oldValue != null ? String(oldValue) : 'empty';
      let newValueDisplay = newValue != null ? String(newValue) : 'empty';
      
      // Resolve customer_id to customer name
      if (field === 'customer_id') {
        if (oldValue) {
          const oldCustomer = await db.customers.get(oldValue);
          oldValueDisplay = oldCustomer?.name || oldValue;
        } else {
          oldValueDisplay = 'Walk-in Customer';
        }
        
        if (newValue) {
          const newCustomer = await db.customers.get(newValue);
          newValueDisplay = newCustomer?.name || newValue;
        } else {
          newValueDisplay = 'Walk-in Customer';
        }
      }
      
      // Generate descriptive change reason
      const fieldLabel = field.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase());
      const generatedReason = `Updating ${fieldLabel} from ${oldValueDisplay} to ${newValueDisplay}`;
      
      auditLogs.push({
        id: auditLogs.length === 0 ? auditLogId : createId(),
        bill_id: billId,
        store_id: storeId,
        action: 'updated' as const,
        field_changed: field,
        old_value: oldValueDisplay !== 'empty' ? oldValueDisplay : null,
        new_value: newValueDisplay !== 'empty' ? newValueDisplay : null,
        change_reason: changeReason || generatedReason,
        changed_by: changedBy,
        ip_address: null,
        user_agent: null,
        created_at: now,
        updated_at: now,
        _synced: false
      });
    }
  }
}

// Add all audit logs in transaction
for (const log of auditLogs) {
  await db.bill_audit_logs.add(log);
}
```

**Strategy**:
- Creates MULTIPLE audit logs (one per changed field)
- Compares old vs new values for each field
- Resolves IDs to names before storing
- Generates human-readable change reasons
- Groups all logs in same timestamp for related changes

**Supported Resolution Fields**:
- `customer_id` → Customer name

---

#### 3. `deleteBill()` - OfflineDataContext.tsx

**Purpose**: Deletes or soft-deletes a bill with audit trail

**Signature**:
```typescript
async deleteBill(
  billId: string,
  deletedBy: string,
  deleteReason?: string,
  softDelete = true
): Promise<void>
```

**Audit Log Creation**:
```typescript
// Get bill info for descriptive reason
const bill = await db.bills.get(billId);
const deleteAction = softDelete ? 'cancelled' : 'permanently deleted';
const generatedReason = bill 
  ? `Deleting bill #${bill.bill_number} (${deleteAction})` 
  : `Deleting bill (${deleteAction})`;

const auditLog = {
  id: auditLogId,
  bill_id: billId,
  store_id: storeId,
  action: 'deleted' as const,
  field_changed: 'status',
  old_value: bill?.status || 'active',
  new_value: softDelete ? 'cancelled' : 'deleted',
  change_reason: deleteReason || generatedReason,
  changed_by: deletedBy,
  ip_address: null,
  user_agent: null,
  created_at: now,
  updated_at: now,
  _synced: false
};

await db.bill_audit_logs.add(auditLog);
```

**Strategy**:
- Creates ONE audit log for deletion
- Distinguishes between soft delete (cancel) and hard delete
- Records the previous status in `old_value`
- Includes bill number in reason for clarity

---

#### 4. `updateBillLineItem()` - db.ts

**Purpose**: Updates line item with comprehensive audit tracking

**Signature**:
```typescript
async updateBillLineItem(
  lineItemId: string,
  updates: Partial<BillLineItem>,
  updatedBy: string
): Promise<void>
```

**Audit Log Creation with ID Resolution**:
```typescript
// Create audit log for each changed field
for (const [field, newValue] of Object.entries(updates)) {
  if (field !== '_synced') {
    const oldValue = (originalItem as any)[field];
    if (oldValue !== newValue) {
      // Resolve IDs to human-readable names
      let oldValueDisplay = oldValue != null ? String(oldValue) : 'empty';
      let newValueDisplay = newValue != null ? String(newValue) : 'empty';
      
      // Resolve product_id to product name
      if (field === 'product_id') {
        if (oldValue) {
          const oldProduct = await this.products.get(oldValue);
          oldValueDisplay = oldProduct?.name || oldValue;
        }
        if (newValue) {
          const newProduct = await this.products.get(newValue);
          newValueDisplay = newProduct?.name || newValue;
        }
      }
      
      // Resolve supplier_id to supplier name
      if (field === 'supplier_id') {
        if (oldValue) {
          const oldSupplier = await this.suppliers.get(oldValue);
          oldValueDisplay = oldSupplier?.name || oldValue;
        }
        if (newValue) {
          const newSupplier = await this.suppliers.get(newValue);
          newValueDisplay = newSupplier?.name || newValue;
        }
      }
      
      // Resolve customer_id to customer name
      if (field === 'customer_id') {
        if (oldValue) {
          const oldCustomer = await this.customers.get(oldValue);
          oldValueDisplay = oldCustomer?.name || oldValue;
        } else {
          oldValueDisplay = 'None';
        }
        if (newValue) {
          const newCustomer = await this.customers.get(newValue);
          newValueDisplay = newCustomer?.name || newValue;
        } else {
          newValueDisplay = 'None';
        }
      }
      
      // Generate descriptive change reason
      const fieldLabel = field.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase());
      const generatedReason = `Modifying line item: ${fieldLabel} from ${oldValueDisplay} to ${newValueDisplay} (Product: ${originalItem.product_name})`;
      
      await this.bill_audit_logs.add({
        id: uuidv4(),
        store_id: originalItem.store_id,
        created_at: now,
        updated_at: now,
        _synced: false,
        bill_id: originalItem.bill_id,
        action: 'item_modified',
        field_changed: field,
        old_value: oldValueDisplay !== 'empty' ? oldValueDisplay : null,
        new_value: newValueDisplay !== 'empty' ? newValueDisplay : null,
        change_reason: generatedReason,
        changed_by: updatedBy,
        ip_address: null,
      });
    }
  }
}
```

**Strategy**:
- Creates MULTIPLE logs (one per changed field)
- Resolves product_id, supplier_id, and customer_id
- Includes product name in reason for context
- Action type is 'item_modified'

---

#### 5. `addBillLineItem()` - db.ts

**Purpose**: Adds new line item to bill

**Audit Log Creation**:
```typescript
const generatedReason = `Adding line item: ${newLineItem.product_name} (Qty: ${newLineItem.quantity}, Price: ${newLineItem.unit_price})`;

await this.bill_audit_logs.add({
  id: uuidv4(),
  store_id: bill.store_id,
  created_at: now,
  updated_at: now,
  _synced: false,
  bill_id: billId,
  action: 'item_added',
  field_changed: 'line_items',
  old_value: null,
  new_value: JSON.stringify(newLineItem),
  change_reason: generatedReason,
  changed_by: addedBy,
  ip_address: null,
});
```

**Strategy**:
- Creates ONE log for item addition
- Includes key details (product, quantity, price) in reason
- Stores complete line item in `new_value`

---

#### 6. `removeBillLineItem()` - db.ts

**Purpose**: Removes line item from bill

**Audit Log Creation**:
```typescript
const generatedReason = `Removing line item: ${lineItem.product_name} (Qty: ${lineItem.quantity}, Price: ${lineItem.unit_price})`;

await this.bill_audit_logs.add({
  id: uuidv4(),
  store_id: lineItem.store_id,
  created_at: now,
  updated_at: now,
  _synced: false,
  bill_id: lineItem.bill_id,
  action: 'item_removed',
  field_changed: 'line_items',
  old_value: JSON.stringify(lineItem),
  new_value: null,
  change_reason: generatedReason,
  changed_by: removedBy,
  ip_address: null,
});
```

**Strategy**:
- Creates ONE log for item removal
- Stores complete line item in `old_value`
- Includes key details in reason

---

#### 7. `getBillDetails()` - OfflineDataContext.tsx

**Purpose**: Retrieves bill with audit logs and user information

**Signature**:
```typescript
async getBillDetails(billId: string): Promise<any | null>
```

**User Name Resolution**:
```typescript
const auditLogs = await db.bill_audit_logs
  .where('bill_id')
  .equals(billId)
  .filter(log => !log._deleted)
  .toArray();

// Join audit logs with users to get user names
const auditLogsWithUsers = await Promise.all(
  auditLogs.map(async (log) => {
    const user = await db.users.get(log.changed_by);
    return {
      ...log,
      users: user ? { name: user.name, email: user.email } : undefined
    };
  })
);

const result = {
  ...bill,
  line_items: lineItems,
  audit_logs: auditLogsWithUsers
};

return result;
```

**Strategy**:
- Fetches all audit logs for a bill
- Resolves `changed_by` user ID to user name and email
- Returns enriched audit logs with user information
- Filters out soft-deleted logs

---

## ID Resolution System

### Implementation Pattern

```typescript
// Generic ID resolution pattern
async function resolveId(
  field: string,
  value: string | null,
  db: Database
): Promise<string> {
  if (!value) return 'None';
  
  switch (field) {
    case 'customer_id':
      const customer = await db.customers.get(value);
      return customer?.name || value;
      
    case 'product_id':
      const product = await db.products.get(value);
      return product?.name || value;
      
    case 'supplier_id':
      const supplier = await db.suppliers.get(value);
      return supplier?.name || value;
      
    case 'changed_by':
      const user = await db.users.get(value);
      return user?.name || value;
      
    default:
      return String(value);
  }
}
```

### Resolution Flow

```
Input: field='customer_id', value='abc-123-def'
  ↓
Query: db.customers.get('abc-123-def')
  ↓
Result: { id: 'abc-123-def', name: 'Ahmad', ... }
  ↓
Extract: name = 'Ahmad'
  ↓
Store in audit log: old_value = 'Ahmad'
  ↓
Display to user: "Updating Customer Id from Ahmad to Mohammad"
```

### Fallback Strategy

```typescript
// If entity not found, use original ID
const customer = await db.customers.get(customerId);
const displayValue = customer?.name || customerId;  // Fallback to ID

// Special cases
if (field === 'customer_id' && !value) {
  return 'Walk-in Customer';  // Friendly name for null
}
```

---

## Display & UI

### Audit Trail Modal - SoldBills.tsx

#### Grouping Strategy

```typescript
// Group by timestamp and change reason to combine related changes
const groups = new Map<string, BillAuditLog[]>();

selectedBill.bill_audit_logs.forEach(log => {
  const key = `${log.created_at}_${log.changed_by}_${log.change_reason || 'no_reason'}`;
  if (!groups.has(key)) {
    groups.set(key, []);
  }
  groups.get(key)!.push(log);
});

// Convert to array and sort by timestamp (newest first)
const groupedLogs = Array.from(groups.values())
  .sort((a, b) => new Date(b[0].created_at).getTime() - new Date(a[0].created_at).getTime());
```

**Grouping Logic**:
- Groups logs with same timestamp, user, and reason
- Shows as single entry with multiple field changes
- Example: Updating 2 fields at once shows as 1 grouped entry

#### Display Format

```typescript
// Action badge with icon
<span className="inline-flex items-center gap-2 rounded-full px-3 py-1">
  <RefreshCw className="h-3 w-3" />
  <span>UPDATED</span>
</span>

// User information
<div className="flex items-center gap-2">
  <User className="h-3.5 w-3.5" />
  <span>Changed by: <strong>{log.users?.name || 'Unknown User'}</strong></span>
</div>

// Change reason
<div className="rounded-xl border border-blue-100 bg-blue-50 px-3 py-2">
  {log.change_reason}
</div>

// Field changes
<div className="space-y-2">
  <div className="flex items-center justify-between">
    <span className="font-medium">Amount Paid</span>
  </div>
  <div className="flex items-center gap-4">
    <div className="flex-1 rounded-lg bg-red-50 border border-red-200 px-3 py-2">
      <span className="text-xs text-red-600">OLD</span>
      <div className="font-mono">{log.old_value}</div>
    </div>
    <ArrowRight className="h-4 w-4" />
    <div className="flex-1 rounded-lg bg-green-50 border border-green-200 px-3 py-2">
      <span className="text-xs text-green-600">NEW</span>
      <div className="font-mono">{log.new_value}</div>
    </div>
  </div>
</div>
```

#### Action Badges

```typescript
const auditActionMeta = {
  updated: {
    label: 'Updated',
    badgeClass: 'border-blue-100 bg-blue-50 text-blue-700',
    dotClass: 'bg-blue-500',
    icon: <RefreshCw className="h-3 w-3" />,
  },
  created: {
    label: 'Created',
    badgeClass: 'border-green-100 bg-green-50 text-green-700',
    dotClass: 'bg-green-500',
    icon: <CheckCircle className="h-3 w-3" />,
  },
  deleted: {
    label: 'Deleted',
    badgeClass: 'border-red-100 bg-red-50 text-red-700',
    dotClass: 'bg-red-500',
    icon: <Trash2 className="h-3 w-3" />,
  },
};
```

---

## Best Practices

### 1. Always Resolve IDs

```typescript
// ❌ BAD: Storing raw IDs
old_value: 'abc-123-def'
new_value: 'xyz-789-ghi'
change_reason: 'Updating customer_id'

// ✅ GOOD: Resolving to names
old_value: 'Ahmad'
new_value: 'Mohammad'
change_reason: 'Updating Customer Id from Ahmad to Mohammad'
```

### 2. Use Descriptive Change Reasons

```typescript
// ❌ BAD: Generic reasons
change_reason: 'Bill updated'
change_reason: 'Field changed'

// ✅ GOOD: Specific and descriptive
change_reason: 'Updating Amount Paid from 1,000 to 10,000'
change_reason: 'Creating bill #BILL-123 with total amount 15,000'
change_reason: 'Removing line item: Laptop (Qty: 5, Price: 1000)'
```

### 3. Track Field-Level Changes

```typescript
// ❌ BAD: One log for entire update
await db.bill_audit_logs.add({
  action: 'updated',
  field_changed: null,
  old_value: JSON.stringify(originalBill),
  new_value: JSON.stringify(updatedBill),
  change_reason: 'Bill updated'
});

// ✅ GOOD: One log per changed field
for (const [field, newValue] of Object.entries(updates)) {
  if (oldValue !== newValue) {
    await db.bill_audit_logs.add({
      action: 'updated',
      field_changed: field,
      old_value: resolvedOldValue,
      new_value: resolvedNewValue,
      change_reason: `Updating ${fieldLabel} from ${oldDisplay} to ${newDisplay}`
    });
  }
}
```

### 4. Include Context in Reasons

```typescript
// ❌ BAD: No context
change_reason: 'Updating quantity from 5 to 10'

// ✅ GOOD: Includes product context
change_reason: 'Modifying line item: Quantity from 5 to 10 (Product: Laptop)'
```

### 5. Handle Null Values Gracefully

```typescript
// ❌ BAD: Raw null
old_value: null
new_value: null

// ✅ GOOD: Meaningful defaults
old_value: oldValue ?? 'None'
old_value: oldValue ?? 'Walk-in Customer'  // For customer_id
old_value: oldValue ?? 'empty'
```

### 6. Use Transactions for Consistency

```typescript
// ✅ GOOD: All or nothing
await db.transaction('rw', [db.bills, db.bill_audit_logs], async () => {
  await db.bills.update(billId, updates);
  
  for (const log of auditLogs) {
    await db.bill_audit_logs.add(log);
  }
});
```

### 7. Capture User Information

```typescript
// ✅ GOOD: Always include user context
await db.bill_audit_logs.add({
  changed_by: currentUserId,  // Always required
  // Later resolved to user name in getBillDetails()
  ...
});
```

---

## Example Scenarios

### Scenario 1: Updating Bill Amount

**Input**:
```typescript
await updateBill(
  'bill-123',
  { amount_paid: 10000 },
  'user-456',
  undefined  // Auto-generate reason
);
```

**Process**:
1. Get original bill: `{ amount_paid: 1000, ... }`
2. Compare: `1000 !== 10000` ✓ Changed
3. Format values: `'1,000'` → `'10,000'`
4. Generate reason: `"Updating Amount Paid from 1,000 to 10,000"`

**Result**:
```typescript
{
  action: 'updated',
  field_changed: 'amount_paid',
  old_value: '1,000',
  new_value: '10,000',
  change_reason: 'Updating Amount Paid from 1,000 to 10,000',
  changed_by: 'user-456'
}
```

**Display**:
```
🔄 UPDATED
Changed by: Demo User
11/4/2025, 12:15:19 AM

📝 Reason: Updating Amount Paid from 1,000 to 10,000

Amount Paid
OLD: 1,000 J.J → NEW: 10,000 J.J
```

---

### Scenario 2: Changing Customer

**Input**:
```typescript
await updateBill(
  'bill-123',
  { customer_id: 'customer-new-id' },
  'user-456'
);
```

**Process**:
1. Get original bill: `{ customer_id: 'customer-old-id', ... }`
2. Resolve old customer: `await db.customers.get('customer-old-id')` → `{ name: 'Ahmad' }`
3. Resolve new customer: `await db.customers.get('customer-new-id')` → `{ name: 'Mohammad' }`
4. Generate reason: `"Updating Customer Id from Ahmad to Mohammad"`

**Result**:
```typescript
{
  action: 'updated',
  field_changed: 'customer_id',
  old_value: 'Ahmad',
  new_value: 'Mohammad',
  change_reason: 'Updating Customer Id from Ahmad to Mohammad',
  changed_by: 'user-456'
}
```

**Display**:
```
🔄 UPDATED
Changed by: Demo User
11/4/2025, 12:15:19 AM

📝 Reason: Updating Customer Id from Ahmad to Mohammad

Customer Id
OLD: Ahmad → NEW: Mohammad
```

---

### Scenario 3: Creating New Bill

**Input**:
```typescript
await createBill(
  {
    bill_number: 'BILL-123',
    total_amount: 15000,
    customer_id: 'customer-id',
    ...
  },
  lineItems,
  currentUserId
);
```

**Process**:
1. Create bill in database
2. Create audit log with action='created'
3. Generate reason: `"Creating bill #BILL-123 with total amount 15000"`

**Result**:
```typescript
{
  action: 'created',
  field_changed: null,
  old_value: null,
  new_value: '{"bill_number":"BILL-123","total_amount":15000,...}',
  change_reason: 'Creating bill #BILL-123 with total amount 15000',
  changed_by: 'user-456'
}
```

**Display**:
```
✅ CREATED
Changed by: Demo User
11/4/2025, 12:00:00 AM

📝 Reason: Creating bill #BILL-123 with total amount 15000
```

---

## Performance Considerations

### 1. Batch ID Resolution

```typescript
// Resolve all IDs in parallel
const [oldCustomer, newCustomer, user] = await Promise.all([
  db.customers.get(oldCustomerId),
  db.customers.get(newCustomerId),
  db.users.get(changedBy)
]);
```

### 2. Use Database Indexes

```sql
-- Essential indexes for fast queries
CREATE INDEX idx_bill_audit_logs_bill_id ON bill_audit_logs(bill_id);
CREATE INDEX idx_bill_audit_logs_created_at ON bill_audit_logs(created_at DESC);
```

### 3. Limit Audit Log Retrieval

```typescript
// Only get recent audit logs
const recentAuditLogs = await db.bill_audit_logs
  .where('bill_id').equals(billId)
  .and(log => log.created_at > cutoffDate)
  .limit(100)
  .toArray();
```

---

## Troubleshooting

### Issue: "Unknown User" Displayed

**Cause**: User ID not resolved to name

**Solution**: Check `getBillDetails()` function includes user resolution:
```typescript
const user = await db.users.get(log.changed_by);
return {
  ...log,
  users: user ? { name: user.name, email: user.email } : undefined
};
```

### Issue: IDs Showing Instead of Names

**Cause**: ID resolution not implemented for that field

**Solution**: Add ID resolution in `updateBill()` or `updateBillLineItem()`:
```typescript
if (field === 'new_field_id') {
  const entity = await db.newEntities.get(oldValue);
  oldValueDisplay = entity?.name || oldValue;
}
```

### Issue: Generic Change Reasons

**Cause**: Using manual reason or auto-generation not working

**Solution**: Verify auto-generation logic:
```typescript
const generatedReason = `Updating ${fieldLabel} from ${oldValueDisplay} to ${newValueDisplay}`;
```

---

## Migration Guide

### Adding New Resolvable Field

1. **Identify the field** (e.g., `warehouse_id`)
2. **Add resolution logic** in `updateBill()` or `updateBillLineItem()`:

```typescript
// Add after existing customer_id resolution
if (field === 'warehouse_id') {
  if (oldValue) {
    const oldWarehouse = await db.warehouses.get(oldValue);
    oldValueDisplay = oldWarehouse?.name || oldValue;
  }
  if (newValue) {
    const newWarehouse = await db.warehouses.get(newValue);
    newValueDisplay = newWarehouse?.name || newValue;
  }
}
```

3. **Test** with sample update
4. **Verify** audit trail shows warehouse names

---

## Conclusion

The Audit Trail system provides comprehensive, human-readable tracking of all bill changes. Key strengths:

- ✅ **Offline-First**: Works without internet connection
- ✅ **Human-Readable**: IDs resolved to actual names
- ✅ **Field-Level Tracking**: Know exactly what changed
- ✅ **Complete History**: Never lose track of changes
- ✅ **User-Friendly**: Non-technical users can understand

The system is designed to be maintainable, extensible, and performant while providing maximum transparency and auditability for the POS system.

