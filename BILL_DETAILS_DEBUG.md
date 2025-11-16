# Bill Details Missing Fields - Debugging

## Issue Report

**Symptom:** Bill Details modal shows `totalCost: 0`, `totalProfit: 0`, `totalRevenue: 0`, but Sales Logs modal shows correct values.

## Investigation

### Where Bills Are Passed to Details Modal

1. **Batch Items (Collapsed) - Lines 912-915**
   ```typescript
   handleViewReceivedBillDetails(createEnrichedBillFromGroup(group));
   ```
   ✅ Uses helper function - should have all fields

2. **Batch Items (Expanded Individual Items) - Line 1020**
   ```typescript
   handleViewReceivedBillDetails(bill)
   ```
   ⚠️ Passes `bill` directly from `group.items`

3. **From Details Modal "View Sales Logs" Button - Line 1189**
   ```typescript
   handleViewReceivedBillSalesLogs(selectedReceivedBill)
   ```
   ✅ Uses already selected bill

### Bill Object Structure

Individual bills are created with these fields (lines 320-344):
```typescript
bills.push({
  id: item.id,
  batchId: item.batch_id || null,
  productId: item.product_id,
  productName: product.name,
  supplierId: supplierId,
  supplierName: supplier.name,
  type: batchType,
  originalQuantity: validOriginalQuantity,
  remainingQuantity: validRemainingQuantity,
  totalSoldQuantity: validSoldQuantity,
  totalRevenue,        // ✅ Present
  totalCost,           // ✅ Present
  totalProfit,         // ✅ Present
  avgUnitPrice,
  estimatedTotalValue,
  progress: validProgress,
  status,
  isClosed,
  saleCount,
  receivedAt: (item as any).received_at || item.created_at,
  // ...
});
```

## 🔍 Added Debug Logging

Added console.log in `handleViewReceivedBillDetails` (lines 604-611):
```typescript
const handleViewReceivedBillDetails = (bill: any) => {
  console.log('Bill Details - Received bill:', {
    id: bill.id,
    productName: bill.productName,
    totalRevenue: bill.totalRevenue,
    totalCost: bill.totalCost,
    totalProfit: bill.totalProfit,
    batchId: bill.batchId
  });
  setSelectedReceivedBill(bill);
  setShowReceivedBillDetails(true);
};
```

## 🧪 Testing Steps

1. **Test Batch Item (Collapsed)**
   - Click "Details" on a collapsed batch row
   - Check console output
   - Verify modal shows correct totals

2. **Test Expanded Batch Item**
   - Expand a batch
   - Click "Details" on an individual item inside
   - Check console output
   - **This is likely where the issue is**

3. **Compare Console Output**
   - Batch (collapsed): Should show aggregated totals
   - Individual item: Should show item-specific totals

## 💡 Hypothesis

The issue is likely that:
1. Individual bills in expanded batches ARE created with the correct fields
2. BUT they might be getting filtered or transformed somewhere
3. OR the grouping logic might be overwriting them

## 🔧 Potential Solutions

### If Individual Bills Are Missing Fields:

The individual bills inside `group.items` should already have `totalRevenue`, `totalCost`, and `totalProfit` from the bill creation logic (lines 320-344).

**Check:** Are these fields being preserved when bills are grouped?

### If Fields Are Present But Zero:

The calculation logic (lines 273-318) might be computing zero values for individual items in a batch.

**Check:** 
- Are sales being correctly associated with individual inventory items?
- Is the cost calculation correct for batch items?

## 📊 Expected Behavior

### For Batch (Collapsed):
```javascript
{
  id: "batch-123",
  productName: "Apple",
  totalRevenue: 5000,  // Sum of all items
  totalCost: 2000,     // Sum of all items
  totalProfit: 3000,   // Sum of all items
  batchId: "batch-123"
}
```

### For Individual Item in Batch:
```javascript
{
  id: "item-456",
  productName: "Apple",
  totalRevenue: 1000,  // This item's sales
  totalCost: 400,      // This item's cost
  totalProfit: 600,    // This item's profit
  batchId: "batch-123"
}
```

## 🎯 Next Steps

1. **Run the app and test**
2. **Check console output** when clicking Details on:
   - Collapsed batch
   - Expanded individual item
3. **Compare the values** logged vs displayed
4. **Report findings** - which scenario shows zeros?

Once we see the console output, we can determine:
- Are the fields missing from the bill object?
- Are the fields present but zero?
- Is there a display issue in the modal?

---

**Debug Code Added:** Lines 604-611
**Status:** 🔍 DEBUGGING - Awaiting test results
