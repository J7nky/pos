# Inventory Bill Fees Journal Entries - Corrected Implementation

## Overview

When creating inventory bills with fees (porterage, transfer, plastic), these fees must be recorded as separate journal entries that deduct from the cash drawer. The logic differs based on bill type:

- **Commission bills**: COGS = 0 (we're acting as agent). Fees are recorded on supplier entity (recoverable when closing bill).
- **Cash purchases**: Inventory cost deducts from cash drawer. Fees are our expense (internal entity).
- **Credit purchases**: Inventory cost increases accounts payable (no cash impact). Fees are our expense (internal entity).

## Current Implementation Issues

### 1. Cash Purchase (`processCashPurchase`)

- ❌ **Issue**: Fees are included in `totalAmount`, so they're bundled with inventory cost
- ✅ **Fix**: Separate fees from inventory cost. Create two transactions:
- Inventory purchase: Debit Inventory (1300), Credit Cash (1100) - items only
- Fees: Debit Expense (5900) with internal entity, Credit Cash (1100)

### 2. Credit Purchase (`processCreditPurchase`)

- ❌ **Issue**: Uses `createSupplierPayment` which is wrong (that's for paying suppliers)
- ✅ **Fix**: Use `SUPPLIER_CREDIT_SALE` category: Debit Inventory (1300), Credit Accounts Payable (2100)
- ✅ **Fix**: Fees should be separate: Debit Expense (5900) with internal entity, Credit Cash (1100)

### 3. Commission Purchase (`processCommissionPurchase`)

- ❌ **Issue**: Fees use internal entity via `createCashDrawerExpense`
- ✅ **Fix**: Fees should use supplier entity (we'll recover them when closing bill)
- ✅ **Fix**: No inventory cost journal entry (COGS = 0, we're acting as agent)

## Implementation Plan

### 1. Add Helper Method: `createFeeJournalEntries`

**File**: `apps/store-app/src/services/inventoryPurchaseService.ts`Create a private method that:

- Takes: fee amounts (porterage, transfer, plastic), currency, bill type, supplier_id, store_id, branch_id, created_by
- Creates separate journal entries for each fee type (if > 0)
- Uses appropriate entity:
- Commission: Supplier entity (from `supplier_id`)
- Cash/Credit: Internal entity (from `getSystemEntity` with `SYSTEM_ENTITY_CODES.INTERNAL`)
- Journal entry structure:
- Debit: Expense account (5900 - Miscellaneous Expense)
- Credit: Cash (1100)
- Returns array of transaction IDs for fee transactions
- Uses `transactionService.createTransaction` with `CASH_DRAWER_EXPENSE` category but custom entity

### 2. Add Helper Method: `createSupplierCreditPurchase`

**File**: `apps/store-app/src/services/transactionService.ts`Add a new public method:

```typescript
public async createSupplierCreditPurchase(
  supplierId: string,
  amount: number,
  currency: 'USD' | 'LBP',
  description: string,
  context: TransactionContext,
  options: { reference?: string } = {}
): Promise<TransactionResult>
```



- Uses `SUPPLIER_CREDIT_SALE` category
- Creates: Debit Inventory (1300), Credit Accounts Payable (2100)
- Does NOT affect cash drawer (`updateCashDrawer: false`)

### 3. Modify Cash Purchase Processing

**File**: `apps/store-app/src/services/inventoryPurchaseService.ts` - `processCashPurchase`Changes:

- Calculate `itemsTotal` separately (exclude fees from inventory cost)
- Create inventory purchase transaction for items only:
- Amount: `itemsTotal` (not `totalAmount`)
- Creates: Debit Inventory (1300), Credit Cash (1100)
- Call `createFeeJournalEntries` with internal entity for fees
- Update return value to reflect separate transactions

### 4. Modify Credit Purchase Processing

**File**: `apps/store-app/src/services/inventoryPurchaseService.ts` - `processCreditPurchase`Changes:

- Replace `createSupplierPayment` with `createSupplierCreditPurchase` (new method)
- Pass `itemsTotal` (not `totalAmount`) to exclude fees
- Call `createFeeJournalEntries` with internal entity for fees
- Verify cash drawer is NOT affected by inventory purchase (only fees affect it)

### 5. Modify Commission Purchase Processing

**File**: `apps/store-app/src/services/inventoryPurchaseService.ts` - `processCommissionPurchase`Changes:

- Remove `createCashDrawerExpense` call
- Call `createFeeJournalEntries` with supplier entity
- Ensure no inventory cost journal entry is created (COGS = 0)

### 6. Update Fee Journal Entry Creation Logic

**Implementation Details**:For commission fees:

- Use `transactionService.createTransaction` directly with:
- `category: TRANSACTION_CATEGORIES.CASH_DRAWER_EXPENSE`
- `supplierId: data.supplier_id` (UUID) - will be used as entityId
- `amount`, `currency`, `description`, `context`
- `updateCashDrawer: true`
- Account: Debit 5900 (Miscellaneous Expense), Credit 1100 (Cash)
- Description: "Fees for commission purchase - [fee type]"
- Entity: Supplier entity (from `supplierId`)

For cash/credit fees:

- Use `transactionService.createCashDrawerExpense` (no entity parameter)
- Will default to internal entity via `defaultEntityCode: SYSTEM_ENTITY_CODES.INTERNAL`
- Account: Debit 5900 (Miscellaneous Expense), Credit 1100 (Cash)
- Description: "Fees for [cash/credit] purchase - [fee type]"
- Entity: Internal entity (default)

**Note**: `createTransaction` accepts `supplierId` parameter. When provided, it's used as the entityId directly (transactionService detects UUID pattern). For `CASH_DRAWER_EXPENSE` category, if no `supplierId` is provided, it defaults to internal entity via account mapping.

### 7. Handle Multiple Fee Types

Create separate journal entries for each fee type (porterage, transfer, plastic) if they exist:

- Each fee gets its own transaction and journal entries
- Allows better tracking and reporting
- All fees deduct from cash drawer

## Files to Modify

1. **`apps/store-app/src/services/inventoryPurchaseService.ts`**

- Add `createFeeJournalEntries` method
- Modify `processCashPurchase` to separate fees
- Modify `processCreditPurchase` to use correct transaction type
- Modify `processCommissionPurchase` to use supplier entity

2. **`apps/store-app/src/services/transactionService.ts`**

- Add `createSupplierCreditPurchase` method

## Dependencies

- `transactionService.createTransaction` for creating transactions
- `getSystemEntity` from `constants/systemEntities.ts` to get internal entity
- `SYSTEM_ENTITY_CODES.INTERNAL` constant
- `TRANSACTION_CATEGORIES.SUPPLIER_CREDIT_SALE` for credit purchases
- `TRANSACTION_CATEGORIES.CASH_DRAWER_EXPENSE` for fees (with custom entity)

## Testing Checklist

- ✅ Commission bill: No inventory cost journal entry
- ✅ Commission bill: Fees create journal entries with supplier entity
- ✅ Commission bill: Fees deduct from cash drawer
- ✅ Cash purchase: Inventory cost creates journal entry (Inventory 1300, Cash 1100)
- ✅ Cash purchase: Fees create separate journal entries with internal entity
- ✅ Cash purchase: Both inventory and fees deduct from cash drawer
- ✅ Credit purchase: Inventory cost creates journal entry (Inventory 1300, AP 2100)
- ✅ Credit purchase: Inventory cost does NOT affect cash drawer
- ✅ Credit purchase: Fees create journal entries with internal entity
- ✅ Credit purchase: Only fees deduct from cash drawer
- ✅ All fee transactions are atomic with inventory bill creation
- ✅ Fees are properly synced to Supabase

## Notes

- Fees are recorded immediately when inventory bill is created
- For commission bills, fees will be recovered when the bill is closed (handled separately)