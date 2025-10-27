# Inventory Deletion Warning Update

## Date: October 27, 2025

## Summary of Changes

The inventory deletion process now:
1. ✅ Checks for related sales records BEFORE deletion
2. ✅ Shows warning message to user about related records
3. ✅ DELETES related sales records (bill_line_items) when deleting inventory item
4. ✅ Preserves variance records (missed_products) but removes the link
5. ✅ Displays counts of affected records in the warning

## Changes Made

### 1. Updated `OfflineDataContext.tsx`

#### Added `checkInventoryItemReferences` Method
**Location:** Lines 1391-1422

```typescript
const checkInventoryItemReferences = async (id: string): Promise<{
  salesCount: number;
  variancesCount: number;
  hasReferences: boolean;
}> => {
  const sales = await db.bill_line_items
    .where('inventory_item_id')
    .equals(id)
    .and(item => !item._deleted)
    .toArray();

  const variances = await db.missed_products
    .where('inventory_item_id')
    .equals(id)
    .and(item => !item._deleted)
    .toArray();

  return {
    salesCount: sales.length,
    variancesCount: variances.length,
    hasReferences: sales.length > 0 || variances.length > 0
  };
};
```

**Purpose:**
- Allows UI to check for related records before showing the delete confirmation
- Returns detailed counts for user information

#### Updated `deleteInventoryItem` Method
**Location:** Lines 1424-1466

**Key Changes:**
- **NOW DELETES** related sales records (bill_line_items) instead of just clearing references
- Clears `inventory_item_id` in variance records (missed_products) but keeps them
- Transaction ensures atomicity of all deletions

```typescript
const deleteInventoryItem = async (id: string): Promise<void> => {
  const sales = await db.bill_line_items
    .where('inventory_item_id')
    .equals(id)
    .and(item => !item._deleted)
    .toArray();

  const missedProducts = await db.missed_products
    .where('inventory_item_id')
    .equals(id)
    .and(item => !item._deleted)
    .toArray();

  if (sales.length > 0 || missedProducts.length > 0) {
    await db.transaction('rw', [db.bill_line_items, db.missed_products, db.inventory_items], async () => {
      // DELETE related sales records
      for (const sale of sales) {
        await crudHelperService.deleteEntity('bill_line_items', sale.id);
      }

      // Clear the link in variance records (keep for history)
      for (const missedProduct of missedProducts) {
        await db.missed_products.update(missedProduct.id, {
          inventory_item_id: null,
          _synced: false
        });
      }
      
      // Delete the inventory item
      await crudHelperService.deleteEntity('inventory_items', id);
    });
  }
};
```

### 2. Updated `DeleteInventoryConfirm.tsx`

**Location:** `src/components/inventory/DeleteInventoryConfirm.tsx`

**Changes:**
- Added `useOfflineData` hook import
- Imported `AlertTriangle` icon from lucide-react
- Added state to track related records count
- Check references on component mount
- Display warning message with exact counts

**New Features:**
```typescript
const { checkInventoryItemReferences } = useOfflineData();
const [references, setReferences] = useState({ 
  salesCount: 0, 
  variancesCount: 0, 
  hasReferences: false 
});

useEffect(() => {
  const checkReferences = async () => {
    const refs = await checkInventoryItemReferences(item.id);
    setReferences(refs);
  };
  checkReferences();
}, [item.id]);
```

**Warning Display:**
- Shows red warning box if there are related records
- Lists exact number of sales that will be deleted
- Lists exact number of variance records that will lose the link
- Prominent "This action cannot be undone!" message

### 3. Updated Sync Service

**Location:** `src/services/syncService.ts` (lines 331-337)

**Changes:**
- Added comment explaining that sales records are already deleted locally
- Sales deletions will sync automatically in next bill_line_items sync pass
- No additional sync logic needed for sales deletion

## User Experience Flow

### Step 1: User Clicks Delete

```
┌─────────────────────────────────────────┐
│ Delete Inventory Item                   │
│ This action cannot be undone            │
└─────────────────────────────────────────┘
```

### Step 2: System Checks for Related Records

**No Related Records:**
```
User sees simple confirmation dialog
```

**Has Related Records:**
```
┌─────────────────────────────────────────────┐
│ ⚠️  Warning: Related Records Will Be Deleted│
│                                             │
│ • 25 sale record(s) will be permanently    │
│   deleted                                   │
│ • 3 variance record(s) will lose the link  │
│   to this item                              │
│                                             │
│ This action cannot be undone!              │
└─────────────────────────────────────────────┘
```

### Step 3: User Confirms

**What Happens:**
1. ✅ 25 bill_line_items records are deleted
2. ✅ 3 missed_products records have their `inventory_item_id` set to null
3. ✅ Inventory item is deleted
4. ✅ All operations happen in a single transaction
5. ✅ Changes sync to Supabase automatically

## Business Logic

### Why Delete Sales Records?

**Reason:** Sales records (bill_line_items) are no longer valid if the underlying inventory item is deleted. They reference specific inventory quantities that no longer exist.

**Alternatives Considered:**
- ❌ Setting `inventory_item_id` to null: Leaves invalid sales records
- ❌ Keeping sales records: Inconsistent data state
- ✅ Deleting sales records: Clean, consistent database

### Why Keep Variance Records?

**Reason:** Variance records (missed_products) are historical audit data. The inventory item itself doesn't exist anymore, but the variance data should be preserved for reporting.

**Approach:**
- Set `inventory_item_id` to null
- Keep `product_name` field (already denormalized)
- Preserve all variance data (quantities, notes, etc.)

## Data Flow

```
┌─────────────────────────────────────────────────────────┐
│           INVENTORY DELETION FLOW                        │
└─────────────────────────────────────────────────────────┘

1. User opens delete confirmation
        │
        ↓
2. checkInventoryItemReferences(inventory_id)
   ├─→ Find bill_line_items WHERE inventory_item_id = id
   └─→ Find missed_products WHERE inventory_item_id = id
        │
        ↓
3. Display warning with counts
   "25 sale records will be deleted"
   "3 variance records will lose link"
        │
        ↓
4. User clicks Delete
        │
        ↓
5. deleteInventoryItem(inventory_id) Transaction:
   ├─→ DELETE bill_line_items WHERE inventory_item_id = id
   ├─→ UPDATE missed_products SET inventory_item_id = NULL
   └─→ DELETE inventory_items WHERE id = id
        │
        ↓
6. Sync to Supabase:
   ├─→ Deleted bill_line_items sync as deleted records
   └─→ Inventory item deleted from Supabase
```

## Benefits

### 1. Data Integrity
- ✅ No orphaned sales records
- ✅ No invalid inventory references
- ✅ Clean deletion cascade

### 2. User Awareness
- ✅ Clear warning before deletion
- ✅ Exact counts of affected records
- ✅ Informed decision making

### 3. Historical Preservation
- ✅ Variance data retained for audit
- ✅ Product names preserved
- ✅ Reporting remains accurate

### 4. Transactional Safety
- ✅ All operations in single transaction
- ✅ Atomic deletion (all or nothing)
- ✅ No partial states

## Testing Checklist

- [ ] Delete inventory item with no related records - should show simple dialog
- [ ] Delete inventory item with sales only - should warn about sales deletion
- [ ] Delete inventory item with variances only - should warn about variance unlink
- [ ] Delete inventory item with both - should show both warnings
- [ ] Verify sales records are actually deleted from database
- [ ] Verify variance records have inventory_item_id set to null
- [ ] Verify variance records still have product_name
- [ ] Verify sync completes successfully
- [ ] Test with large number of related records (performance)

## Migration Notes

This is a **breaking change** in behavior:
- **Before:** Sales records just had their `inventory_item_id` cleared
- **After:** Sales records are permanently deleted

**Impact:**
- Users should be aware that deleting inventory now deletes related sales
- Historical sales data for deleted inventory will no longer exist
- Variance data (missed_products) is preserved but loses the link

## Related Files

1. `src/contexts/OfflineDataContext.tsx` - Core deletion logic
2. `src/components/inventory/DeleteInventoryConfirm.tsx` - UI warning
3. `src/services/syncService.ts` - Sync handling
4. `INVENTORY_ITEM_DELETION_FIX.md` - Previous fix documentation

