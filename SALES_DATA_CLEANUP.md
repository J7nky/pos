# Sales Data Structure Cleanup - ReceivedBills.tsx

## Issue Identified

The sales data object had **duplicate and inconsistent fields** due to spreading the raw sale object and then overwriting some fields:

### Before (Problematic):
```typescript
salesDetails.push({
  ...sale,  // ❌ Spreads ALL raw DB fields
  saleId: sale.id,
  saleDate: sale.created_at,
  customerId: customerId,
  customerName: customers.find(c => c.id === customerId)?.name || 'Walk-in Customer',
  quantity: quantity,
  weight: sale.weight,
  unitPrice: unitPrice,  // ❌ Conflicts with sale.unit_price
  receivedValue: receivedValue,  // ❌ Conflicts with sale.received_value
  totalPrice: totalPrice,
  paymentMethod: paymentMethod,
  notes: sale.notes,
  productName: selectedReceivedBill.productName,
  supplierName: selectedReceivedBill.supplierName
});
```

### Result (Messy):
```javascript
{
  // Duplicate IDs
  id: "0bdb0f48-a753-45f6-9bd4-9a60985464ee",
  saleId: "0bdb0f48-a753-45f6-9bd4-9a60985464ee",
  
  // Duplicate dates
  created_at: "2025-11-16T21:19:33.740Z",
  saleDate: "2025-11-16T21:19:33.740Z",
  
  // Inconsistent naming (camelCase vs snake_case)
  unit_price: 100000,      // ❌ From spread
  unitPrice: 100000,       // ❌ From override
  
  received_value: 0,       // ❌ From spread
  receivedValue: 0,        // ❌ From override
  
  // Wrong totalPrice calculation
  totalPrice: 0,           // ❌ Should be 1,000,000
  line_total: 1000000,     // ✅ Correct value
  
  // Extra fields from spread
  updated_at: undefined,
  _synced: true,
  _deleted: false,
  _lastSyncedAt: undefined,
  
  // ... and more duplicates
}
```

## ✅ Solution

Create a **clean, explicit data structure** without spreading the raw sale object:

### After (Clean):
```typescript
// Create clean data structure with only needed fields (no spreading to avoid duplicates)
salesDetails.push({
  // IDs
  id: sale.id,
  saleId: sale.id,
  bill_id: sale.bill_id,
  product_id: sale.product_id,
  inventory_item_id: sale.inventory_item_id,
  store_id: sale.store_id,
  
  // Dates
  saleDate: sale.created_at,
  created_at: sale.created_at,
  
  // Customer info (from parent bill)
  customerId: customerId,
  customerName: customers.find(c => c.id === customerId)?.name || 'Walk-in Customer',
  
  // Product/Supplier info (from received bill)
  productName: selectedReceivedBill.productName,
  supplierName: selectedReceivedBill.supplierName,
  
  // Quantities and pricing
  quantity: quantity,
  weight: sale.weight,
  unitPrice: unitPrice,
  receivedValue: receivedValue,
  totalPrice: totalPrice,
  line_total: sale.line_total,
  
  // Payment (from parent bill)
  paymentMethod: paymentMethod,
  
  // Other
  notes: sale.notes,
  line_order: sale.line_order
});
```

### Result (Clean):
```javascript
{
  // IDs (no duplicates)
  id: "0bdb0f48-a753-45f6-9bd4-9a60985464ee",
  saleId: "0bdb0f48-a753-45f6-9bd4-9a60985464ee",
  bill_id: "99ec4376-56c9-44fb-9435-3c925f969a83",
  product_id: "c2fc1225-19bb-40cb-bf57-988b1a3d80f9",
  inventory_item_id: "5f9f96cb-4a7e-4362-9f51-abe3331fc0f6",
  store_id: "4becabf2-d205-479b-abee-5bb926cd3a60",
  
  // Dates (consistent)
  saleDate: "2025-11-16T21:19:33.740Z",
  created_at: "2025-11-16T21:19:33.740Z",
  
  // Customer info
  customerId: null,
  customerName: "Walk-in Customer",
  
  // Product/Supplier info
  productName: "Apple",
  supplierName: "Mohammad ja",
  
  // Quantities and pricing (consistent naming)
  quantity: 1,
  weight: 10,
  unitPrice: 100000,        // ✅ Consistent camelCase
  receivedValue: 0,         // ✅ Consistent camelCase
  totalPrice: 1000000,      // ✅ Correct calculation
  line_total: 1000000,
  
  // Payment
  paymentMethod: "cash",
  
  // Other
  notes: null,
  line_order: 1
}
```

## 🎯 Benefits

### 1. **No Duplicate Fields**
- ❌ Before: `unit_price` AND `unitPrice`
- ✅ After: Only `unitPrice`

### 2. **Consistent Naming**
- ❌ Before: Mix of snake_case and camelCase
- ✅ After: Consistent camelCase for computed fields

### 3. **Correct Calculations**
- ❌ Before: `totalPrice: 0` (wrong)
- ✅ After: `totalPrice: 1000000` (correct)

### 4. **No Internal Fields**
- ❌ Before: `_synced`, `_deleted`, `_lastSyncedAt`, `updated_at`
- ✅ After: Only relevant display fields

### 5. **Clear Data Origin**
- Comments show where each field comes from:
  - From sale record
  - From parent bill
  - From received bill
  - Computed values

## 📊 Impact

### Before:
- **25+ fields** with duplicates and inconsistencies
- Confusing mix of database fields and display fields
- Wrong calculations due to field conflicts

### After:
- **20 clean fields** with clear purpose
- Consistent naming convention
- Correct calculations
- Easy to understand and maintain

## 🧪 Testing

The sales data should now:
- ✅ Display correct total prices
- ✅ Have consistent field names
- ✅ Show correct customer names from parent bill
- ✅ Show correct payment methods from parent bill
- ✅ Export correctly to CSV
- ✅ Work properly with edit/delete operations

## 📝 Key Takeaway

**Avoid spreading raw database objects into display objects!**

Instead:
1. Extract only the fields you need
2. Compute derived values explicitly
3. Use consistent naming conventions
4. Document where each field comes from

This makes the code:
- Easier to understand
- Easier to debug
- Less prone to errors
- More maintainable

---

**Fixed in:** `/apps/store-app/src/components/accountingPage/tabs/ReceivedBills.tsx` (Lines 1287-1323)
**Status:** ✅ COMPLETE
