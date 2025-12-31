---
name: Currency handling in receive form
overview: Ensure all currencies (bill currency, fees, item prices, transactions, and journal entries) default to store preferred currency or use the selected currency consistently throughout the receive form flow.
todos:
  - id: "1"
    content: Update ReceiveFormModal to include currency in submitted items
    status: pending
  - id: "2"
    content: Update addInventoryBatch to pass currency to inventoryPurchaseService
    status: pending
  - id: "3"
    content: Update inventoryPurchaseService to accept and use currency parameter instead of hardcoded values
    status: pending
    dependencies:
      - "2"
  - id: "4"
    content: Verify fee currency consistency in ReceiveFormModal
    status: pending
  - id: "5"
    content: Ensure item currency defaults correctly in addInventoryBatch
    status: pending
    dependencies:
      - "1"
---

# Currency Handling in Receive Form

## Problem

Currently, currencies are not consistently handled:

1. Bill currency uses `porterage_currency` but fees may have different currencies
2. Item prices don't include currency when submitting
3. `inventoryPurchaseService` hardcodes USD/LBP instead of using batch currency
4. Transactions and journal entries use hardcoded currencies

## Solution

Ensure all currencies default to store preferred currency or use the selected currency consistently.

## Implementation

### 1. ReceiveFormModal.tsx - Pass Item Currency

- **File**: `apps/store-app/src/components/inventory/ReceiveFormModal.tsx`
- **Changes**:
- Include `currency` field in items when submitting (line 425-439)
- Use `item.price_currency || form.porterage_currency || preferredCurrency` for each item
- Ensure all items use the same currency as the bill by default

### 2. addInventoryBatch - Pass Currency to Service

- **File**: `apps/store-app/src/contexts/OfflineDataContext.tsx`
- **Changes**:
- Pass `currency` parameter to `inventoryPurchaseService.processInventoryPurchase()` (line 3856-3875)
- Use `batchCurrency || currency` (store preferred currency) as default

### 3. inventoryPurchaseService - Accept and Use Currency

- **File**: `apps/store-app/src/services/inventoryPurchaseService.ts`
- **Changes**:
- Add `currency: 'USD' | 'LBP'` to `InventoryPurchaseData` interface (line 16-28)
- Remove hardcoded 'USD' in `processCashPurchase` (line 174, 180)
- Remove hardcoded 'LBP' in `processCreditPurchase` (line 318)
- Remove hardcoded 'USD' for fees in credit/commission purchases (line 347, 413)
- Use `data.currency` throughout the service

### 4. Ensure Fee Currency Consistency

- **File**: `apps/store-app/src/components/inventory/ReceiveFormModal.tsx`
- **Changes**:
- When bill currency switch changes, ensure all fees use the same currency
- Already handled at line 627-632, but verify it's working correctly

### 5. Item Currency Default

- **File**: `apps/store-app/src/contexts/OfflineDataContext.tsx`
- **Changes**:
- In `addInventoryBatch`, when mapping items (line 3940-3960), use item currency or batch currency or store currency
- Line 3953 already has: `currency: (it as any).currency ?? currency`
- Ensure this uses batch currency if item currency is not provided

## Data Flow

```javascript
ReceiveFormModal
  ├─ Bill Currency Switch → form.porterage_currency (also sets transfer_currency, plastic_currency)
  ├─ Item Currency Switch → bulkItems[pid].price_currency & selling_price_currency
  └─ Submit
      ├─ Batch: currency = form.porterage_currency || preferredCurrency
      └─ Items: currency = item.price_currency || batch.currency || preferredCurrency
           │
           ↓
addInventoryBatch
  ├─ Batch Record: currency = batchCurrency || currency (store preferred)
  └─ Items: currency = item.currency ?? batchCurrency ?? currency
       │
       ↓
inventoryPurchaseService.processInventoryPurchase
  ├─ Accept currency parameter
  └─ Use currency for all transactions and journal entries
       │
       ↓
TransactionService & JournalService
  └─ Create transactions/journal entries with correct currency
```



## Testing Checklist

- [ ] Bill currency defaults to store preferred currency
- [ ] Changing bill currency updates all fees
- [ ] Item prices default to bill currency
- [ ] Cash purchase transactions use batch currency
- [ ] Credit purchase transactions use batch currency
- [ ] Fee transactions use batch currency