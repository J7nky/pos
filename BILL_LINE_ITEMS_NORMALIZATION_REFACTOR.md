# Bill Line Items Normalization Refactor

## Overview
Refactored the data structure to match the actual Supabase database schema where `bill_line_items` table only contains line item data, and customer/payment information is stored in the parent `bills` table.

## Database Schema Changes

### ✅ Correct Schema (Normalized)

#### `bills` table
```typescript
{
  id: string;
  store_id: string;
  bill_number: string;
  customer_id: string | null;        // ✅ Bill-level
  payment_method: 'cash' | 'card' | 'credit';  // ✅ Bill-level
  payment_status: 'paid' | 'partial' | 'pending';
  amount_paid: number;
  notes: string | null;
  status: 'active' | 'cancelled' | 'refunded';
  created_by: string;                // ✅ Bill-level
  created_at: string;
  updated_at: string;
  last_modified_by: string | null;
  bill_date: string;
}
```

#### `bill_line_items` table
```typescript
{
  id: string;
  store_id: string;
  bill_id: string;                   // ✅ Reference to parent bill
  product_id: string;
  inventory_item_id: string | null;
  quantity: number;
  unit_price: number;
  line_total: number;
  weight: number | null;
  notes: string | null;
  line_order: number;
  created_at: string;
  updated_at: string;
  received_value: number;
  // ❌ NO customer_id (get from bills table)
  // ❌ NO supplier_id (get from products/inventory_items)
  // ❌ NO payment_method (get from bills table)
  // ❌ NO created_by (get from bills table)
}
```

## Changes Made

### 1. ✅ Updated TypeScript Interfaces (`/apps/store-app/src/types/index.ts`)
- Removed `supplier_id`, `customer_id`, `payment_method`, `created_by` from `BillLineItem` interface
- Added comment explaining these fields are in the parent `bills` table
- Reordered fields to match actual database structure

### 2. ✅ Updated Dexie Schema (`/apps/store-app/src/lib/db.ts`)
- Added new migration version 28
- Updated `bills` schema to include `payment_method` index
- Updated `bill_line_items` schema to remove `supplier_id`, `customer_id`, `payment_method`, `created_by` indexes
- These fields are now accessed via JOIN with `bills` table

### 3. ✅ Refactored Account Statement Service (`/apps/store-app/src/services/accountStatementService.ts`)

#### Updated Methods:
- **`computeCustomerOpeningBalanceOptimized()`**: Now queries `bills` first, then gets line items
- **`buildCustomerPeriodTransactionsOptimized()`**: Uses JOIN pattern - queries credit bills, then fetches line items
- **`generateCustomerStatement()`**: Updated product summary query to use normalized schema

#### Query Pattern Change:
```typescript
// ❌ OLD (incorrect - fields don't exist)
const periodSales = await db.bill_line_items
  .where('customer_id')
  .equals(customer.id)
  .and(s => s.payment_method === 'credit')
  .toArray();

// ✅ NEW (correct - JOIN pattern)
// Step 1: Get credit bills for customer
const customerBills = await db.bills
  .where('customer_id')
  .equals(customer.id)
  .and(b => b.payment_method === 'credit')
  .toArray();

// Step 2: Get line items for those bills
const billIds = customerBills.map(b => b.id);
const periodSales = await db.bill_line_items
  .where('bill_id')
  .anyOf(billIds)
  .toArray();
```

## Remaining Work

### 4. ⏳ Update Other Services
Need to search and update all services that query `bill_line_items`:

- [x] `/apps/store-app/src/services/accountBalanceService.ts` - Updated customer sales query to use JOIN pattern
- [x] `/apps/store-app/src/services/enhancedTransactionService.ts` - Removed invalid fields from bill_line_items.add()
- [ ] `/apps/store-app/src/services/dataValidationService.ts`
- [ ] `/apps/store-app/src/services/productReferenceService.ts`
- [ ] `/apps/store-app/src/services/weightManagementService.ts`
- [ ] `/apps/store-app/src/services/crudHelperService.ts`
- [ ] `/apps/store-app/src/services/receivedBillMonitoringService.ts`
- [ ] `/apps/store-app/src/services/syncService.ts`

### 5. ⏳ Update Components
Need to update components that use `bill_line_items`:

- [x] `/apps/store-app/src/pages/Accounting.tsx` - Updated to get customer_id from parent bill
- [ ] `/apps/store-app/src/components/accountingPage/tabs/SoldBills.tsx`
- [ ] `/apps/store-app/src/pages/POS.tsx`
- [ ] `/apps/store-app/src/pages/PublicCustomerStatement.tsx`
- [x] `/apps/store-app/src/contexts/OfflineDataContext.tsx` - Already correct (uses bill_id queries)

### 6. ⏳ Update Utility Files
- [ ] `/apps/store-app/src/utils/billCalculations.ts`
- [ ] `/apps/store-app/src/utils/cleanupSaleItemsData.ts`

### 7. ⏳ Testing
- [ ] Test customer account statements
- [ ] Test bill creation and editing
- [ ] Test sync functionality
- [ ] Test offline data context
- [ ] Verify no TypeScript errors remain

## Benefits of This Refactor

### ✅ Data Integrity
- Single source of truth for payment method and customer
- Impossible to have conflicting payment methods within a bill
- Follows proper database normalization (3NF)

### ✅ Storage Efficiency
- No redundant data across line items
- Smaller table size
- Better for large datasets

### ✅ Consistency
- Matches actual Supabase database schema
- Prevents sync issues between local and cloud
- Easier to maintain and debug

### ✅ Query Optimization
- Can index `customer_id` and `payment_method` in `bills` table
- Faster queries for customer-specific data
- Better performance for account statements

## Migration Notes

### Database Migration
The Dexie migration (v28) only removes indexes, not actual data. The fields `supplier_id`, `customer_id`, `payment_method`, `created_by` may still exist in local IndexedDB records, but they won't be indexed or queried.

### Supabase Schema
The actual Supabase database already has the correct schema. This refactor aligns the local code with the cloud database structure.

### Backward Compatibility
Old code that tries to query `bill_line_items` by `customer_id` or `payment_method` will fail. All such queries must be updated to use the JOIN pattern shown above.

## Next Steps

1. **Complete remaining service updates** - Update all services that query `bill_line_items`
2. **Update components** - Fix components that display or manipulate bill line items
3. **Test thoroughly** - Ensure account statements, bills, and sync work correctly
4. **Deploy** - Once all tests pass, deploy to production

## Code Search Commands

To find remaining usages:
```bash
# Find direct queries on bill_line_items
grep -r "bill_line_items.where" apps/store-app/src/

# Find references to customer_id on bill_line_items
grep -r "\.customer_id" apps/store-app/src/ | grep bill_line_items

# Find references to payment_method on bill_line_items
grep -r "\.payment_method" apps/store-app/src/ | grep -v bills
```
