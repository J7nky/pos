# Description and Reference Fields - Code Locations

This document locates all code related to `description` and `reference` fields for payments and bills.

## Payment Fields

### 1. Type Definitions

**File:** `apps/store-app/src/types/index.ts`

```typescript
// Payment interface (lines 461-471)
export interface Payment {
  id: string;
  customer_id: string;
  sale_id?: string;
  amount: number;
  method: 'cash' | 'card';
  reference?: string;  // ✅ Reference field
  notes?: string;       // ✅ Notes field (similar to description)
  created_at: string;
  created_by: string;
}

// Transaction interface (lines 473-496)
export interface Transaction {
  id: string;
  type: 'income' | 'expense' | 'sale' | 'payment' | 'credit_sale';
  category: string;
  amount: number;
  currency: 'USD' | 'LBP';
  description: MultilingualString;  // ✅ Description field
  reference: string | null;         // ✅ Reference field
  // ... other fields
}
```

### 2. Payment Processing Logic

**File:** `apps/store-app/src/contexts/OfflineDataContext.tsx`

**Function:** `processPayment` (lines 4530-4784)

```typescript
// Payment parameters (lines 4530-4540)
const processPayment = async (params: {
  entityType: 'customer' | 'supplier';
  entityId: string;
  amount: string;
  currency: 'USD' | 'LBP';
  description: string;  // ✅ Description parameter
  reference: string;     // ✅ Reference parameter
  storeId: string;
  createdBy: string;
  paymentDirection: 'receive' | 'pay';
}): Promise<{ success: boolean; error?: string }>

// Description usage (line 4640)
const transactionDescription = `${paymentDirection === 'receive' ? 'Payment received from' : 'Payment sent to'} ${entity.name}${description ? ': ' + description : ''} ${currency === 'USD' ? `($${numAmount.toFixed(2)} USD)` : ''}`;

// Reference usage (lines 4665, 4678, 4698, 4711)
reference: reference || generatePaymentReference(),
```

### 3. Payment Forms (UI Components)

#### A. Pay Form (Customer/Supplier Payments)

**File:** `apps/store-app/src/components/accountingPage/forms/PayForm.tsx`

**Description Field** (lines 195-209):
```tsx
<div>
  <label className="block text-sm font-medium text-gray-700 mb-2">
    Description (optional)
  </label>
  <input
    type="text"
    value={payForm.description}
    onChange={(e) =>
      setPayForm((prev: any) => ({ ...prev, description: e.target.value }))
    }
    className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:ring-red-500 focus:border-red-500"
    placeholder="e.g., Payment for goods, Commission payment, etc."
  />
</div>
```

#### B. Receive Form (Customer Payments)

**File:** `apps/store-app/src/components/accountingPage/forms/ReceiveForm.tsx`

**Description Field** (lines 156-165):
```tsx
<div>
  <label className="block text-sm font-medium text-gray-700 mb-2">Description (optional)</label>
  <input
    type="text"
    value={receiveForm.description}
    onChange={(e) => setReceiveForm((prev: any) => ({ ...prev, description: e.target.value }))}
    className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:ring-green-500 focus:border-green-500"
    placeholder="e.g., Payment for invoice #123, Cash payment, etc."
  />
</div>
```

#### C. Recent Payments Edit Form

**File:** `apps/store-app/src/components/accountingPage/tabs/RecentPayments.tsx`

**Description Field** (lines 1116-1126):
```tsx
<div>
  <label className="block text-sm font-medium text-gray-700 mb-2">
    {t('payments.description') || 'Description'}
  </label>
  <textarea
    value={editForm.description}
    onChange={(e) => setEditForm(prev => ({ ...prev, description: e.target.value }))}
    className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
    rows={3}
  />
</div>
```

**Reference Field** (lines 1127-1137):
```tsx
<div>
  <label className="block text-sm font-medium text-gray-700 mb-2">
    {t('payments.reference') || 'Reference'}
  </label>
  <input
    type="text"
    value={editForm.reference}
    onChange={(e) => setEditForm(prev => ({ ...prev, reference: e.target.value }))}
    className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
  />
</div>
```

#### D. Customer Payment Form

**File:** `apps/store-app/src/pages/Customers.tsx`

**Description Field** (lines 1151-1160):
```tsx
<div>
  <label className="block text-sm font-medium text-gray-700 mb-2">{t('customers.paymentDescription')} (optional)</label>
  <input
    type="text"
    value={paymentForm.description}
    onChange={(e) => setPaymentForm(prev => ({ ...prev, description: e.target.value }))}
    className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:ring-green-500 focus:border-green-500"
    placeholder="e.g., Payment for invoice #123, Cash payment, etc."
  />
</div>
```

#### E. Employee Payment Form

**File:** `apps/store-app/src/components/accountingPage/tabs/EmployeePayments.tsx`

**Description Field** (lines 322-331):
```tsx
<div>
  <label className="block text-sm font-medium text-gray-700 mb-2">{t('payments.description')} </label>
  <input
    type="text"
    value={paymentForm.description}
    onChange={(e) => setPaymentForm(prev => ({ ...prev, description: e.target.value }))}
    className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:ring-blue-500 focus:border-blue-500"
    placeholder={t('payments.description')}
  />
</div>
```

## Bill Fields

### 1. Type Definitions

**File:** `apps/store-app/src/types/index.ts`

**Bill Interface** (check around line 126-148):
```typescript
export interface Bill {
  id: string;
  store_id: string;
  branch_id: string;
  bill_number: string;
  customer_id: string | null;
  payment_method: 'cash' | 'card' | 'credit';
  payment_status: 'paid' | 'partial' | 'pending';
  amount_paid: number;
  bill_date: string;
  notes: string | null;  // ✅ Notes field (similar to description)
  status: 'active' | 'cancelled' | 'refunded';
  created_by: string;
  created_at: string;
  updated_at: string;
  // ... other fields
}
```

**Note:** Bills use `notes` field instead of `description`. The `reference` for bills is stored in the `Transaction` table with format `BILL-{bill_number}`.

### 2. Bill Creation Logic

**File:** `apps/store-app/src/contexts/OfflineDataContext.tsx`

**Function:** `createBill` (lines 1840-2264)

**Bill Notes Usage** (line 1886):
```typescript
const bill = {
  id: billId,
  store_id: storeId,
  branch_id: currentBranchId,
  created_at: now,
  updated_at: now,
  _synced: false,
  ...cleanBillData  // Includes notes field
};
```

**Transaction Reference for Bills** (line 2063):
```typescript
// When creating credit sale transaction for bill
const creditSaleTransaction: Transaction = {
  // ... other fields
  description: `Credit sale - Bill ${bill.bill_number} (${entityType})`,
  reference: `BILL-${bill.bill_number}`, // ✅ Reference includes BILL- prefix
  // ... other fields
};
```

### 3. Bill Creation in POS

**File:** `apps/store-app/src/pages/POS.tsx`

**Bill Data with Notes** (lines 885-897):
```typescript
const billData = {
  bill_number: generateBillReference(),
  customer_id: activeTab.selectedCustomer || null,
  subtotal: total,
  total_amount: total,
  payment_method: activeTab.paymentMethod,
  payment_status: paymentStatus,
  amount_paid: amountReceived,
  bill_date: new Date().toISOString(),
  notes: activeTab.notes || null,  // ✅ Notes field from cart
  status: 'active',
  created_by: userProfile?.id
};
```

**Line Items Notes** (line 911):
```typescript
const lineItemsData = activeTab.cart.map(item => ({
  // ... other fields
  notes: item.notes || null,  // ✅ Notes for individual line items
  // ... other fields
}));
```

### 4. Database Schema

**File:** `apps/store-app/supabase/migrations/20250819204605_fierce_scene.sql`

**Bills Table** (lines 44-74):
```sql
CREATE TABLE IF NOT EXISTS bills (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id uuid NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
  bill_number text NOT NULL,
  customer_id uuid REFERENCES customers(id) ON DELETE SET NULL,
  -- ... other fields
  notes text,  -- ✅ Notes field (nullable)
  -- ... other fields
);
```

### 5. Database Layer

**File:** `apps/store-app/src/lib/db.ts`

**Bill Creation** (lines 3128-3145):
```typescript
const bill: Bill = {
  id: billId,
  store_id: billData.store_id!,
  branch_id: billData.branch_id!,
  created_at: now,
  updated_at: now,
  _synced: false,
  bill_number: billData.bill_number || generateBillReference(),
  customer_id: billData.customer_id || null,
  payment_method: billData.payment_method || 'cash',
  payment_status: billData.payment_status || 'paid',
  amount_paid: billData.amount_paid || 0,
  bill_date: billData.bill_date || now,
  notes: billData.notes || null,  // ✅ Notes field
  status: billData.status || 'active',
  created_by: billData.created_by!,
  last_modified_by: null
};
```

## Summary

### Payments
- **Description**: Stored in `Transaction.description` field
- **Reference**: Stored in `Transaction.reference` field
- **Forms**: PayForm, ReceiveForm, RecentPayments edit form, Customer payment form, Employee payment form
- **Processing**: `OfflineDataContext.processPayment()` function

### Bills
- **Description/Notes**: Stored in `Bill.notes` field (not `description`)
- **Reference**: Stored in `Transaction.reference` field with format `BILL-{bill_number}`
- **Creation**: `OfflineDataContext.createBill()` function
- **POS**: Notes can be added at bill level and line item level

### Key Files to Modify
1. **Payment Description/Reference**: 
   - `apps/store-app/src/contexts/OfflineDataContext.tsx` (processPayment function)
   - `apps/store-app/src/components/accountingPage/forms/PayForm.tsx`
   - `apps/store-app/src/components/accountingPage/forms/ReceiveForm.tsx`
   - `apps/store-app/src/components/accountingPage/tabs/RecentPayments.tsx`

2. **Bill Notes**:
   - `apps/store-app/src/contexts/OfflineDataContext.tsx` (createBill function)
   - `apps/store-app/src/pages/POS.tsx` (bill creation)
   - `apps/store-app/src/lib/db.ts` (database layer)

