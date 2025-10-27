# Customer/Supplier Payment Currency Fix

## Problem Statement

When making payments to/from customers or suppliers, the system had an issue with currency handling:

### Issues Identified:
1. **Customer/Supplier Balance**: They have TWO separate balances (`usd_balance` and `lb_balance`)
2. **Payment Recording**: Payment wasn't recorded in the correct balance based on selected currency
3. **Cash Drawer Impact**: USD payments weren't converted to LBP before updating cash drawer
4. **Balance Check**: Supplier payment validation was comparing different currencies

## Solution Implemented

### Architecture Overview

```
┌─────────────────────────────────────────────────────────────┐
│                    PAYMENT CURRENCY FLOW                     │
└─────────────────────────────────────────────────────────────┘

User Selects Currency: USD or LBP
         │
         ↓
┌────────────────────────────────────┐
│  Customer/Supplier Balance Update   │
│  IF USD → Update usd_balance        │
│  IF LBP → Update lb_balance         │
└────────────────────────────────────┘
         │
         ↓
┌────────────────────────────────────┐
│  Convert to LBP for Cash Drawer     │
│  IF USD → amount × exchangeRate     │
│  IF LBP → amount (no conversion)    │
└────────────────────────────────────┘
         │
         ↓
┌────────────────────────────────────┐
│  Cash Drawer Transaction (LBP only) │
│  Always stored in LBP               │
└────────────────────────────────────┘
```

### Key Changes in `OfflineDataContext.tsx` - `processPayment` Function

#### 1. Calculate LBP Amount for Cash Drawer (Lines 2171-2175)
```typescript
// Calculate amount in LBP for cash drawer (cash drawer always works in LBP)
let amountInLBP = numAmount;
if (currency === 'USD') {
  amountInLBP = numAmount * exchangeRate;
}
```

**Why:** Cash drawer storage is always in LBP, but the payment may be in USD.

#### 2. Fixed Balance Validation (Lines 2177-2186)
```typescript
// For supplier payments, check cash drawer balance (compare in LBP)
if (!isCustomer) {
  const currentBalance = await getCurrentCashDrawerBalance(storeId);
  if (amountInLBP > currentBalance) {
    return { 
      success: false, 
      error: `Insufficient cash drawer balance. Payment: ${currency === 'USD' ? `$${numAmount.toFixed(2)}` : `${Math.round(numAmount).toLocaleString()} ل.ل`} (${Math.round(amountInLBP).toLocaleString()} LBP), Available: ${Math.round(currentBalance).toLocaleString()} LBP` 
    };
  }
}
```

**Why:** Now compares cash drawer balance in LBP (apples to apples comparison).

#### 3. Record in Correct Balance (Lines 2188-2207)
```typescript
// Update entity balance in the SELECTED currency
const currentLbBalance = entity.lb_balance || 0;
const currentUsdBalance = entity.usd_balance || 0;

if (currency === 'LBP') {
  const updateData = { lb_balance: Math.max(0, currentLbBalance - numAmount) };
  if (isCustomer) {
    await updateCustomer(entityId, updateData);
  } else {
    await updateSupplier(entityId, updateData);
  }
} else {
  // USD payment - update USD balance
  const updateData = { usd_balance: Math.max(0, currentUsdBalance - numAmount) };
  if (isCustomer) {
    await updateCustomer(entityId, updateData);
  } else {
    await updateSupplier(entityId, updateData);
  }
}
```

**Why:** Updates the correct balance field based on the selected payment currency.

#### 4. Cash Drawer Transaction in LBP (Lines 2209-2221)
```typescript
// Process cash drawer transaction in LBP (cash drawer storage is always LBP)
const cashDrawerType = isCustomer ? 'payment' : 'expense';
const cashDrawerResult = await processCashDrawerTransaction({
  type: cashDrawerType,
  amount: amountInLBP, // Always in LBP for cash drawer
  currency: 'LBP', // Cash drawer always uses LBP
  description: `${isCustomer ? 'Payment from' : 'Payment to'} ${entity.name}${description ? ': ' + description : ''} ${currency === 'USD' ? `($${numAmount.toFixed(2)} USD)` : ''}`,
  reference: reference || `PAY-${Date.now()}`,
  customerId: isCustomer ? entityId : undefined,
  supplierId: isCustomer ? undefined : entityId,
  storeId,
  createdBy
});
```

**Key Changes:**
- ✅ `amount: amountInLBP` - Converted amount
- ✅ `currency: 'LBP'` - Always LBP for cash drawer
- ✅ Description includes original USD amount for reference

## Complete Flow Examples

### Example 1: Customer Payment in USD

**Scenario:**
- Customer owes: $100 USD (in `usd_balance`)
- Exchange rate: 89,500 LBP per USD
- Customer pays: $50 USD

**Step-by-Step:**

1. **User Action:**
   ```
   Currency: USD
   Amount: $50.00
   ```

2. **Calculate LBP for Cash Drawer:**
   ```typescript
   amountInLBP = 50 * 89,500 = 4,475,000 LBP
   ```

3. **Update Customer Balance:**
   ```typescript
   // Update USD balance
   usd_balance: 100 - 50 = $50 (remaining debt)
   // lb_balance unchanged
   ```

4. **Update Cash Drawer:**
   ```typescript
   // Add to cash drawer in LBP
   current_balance + 4,475,000 LBP
   ```

5. **Transaction Record:**
   ```
   Type: payment
   Amount: 4,475,000 LBP
   Currency: LBP
   Description: "Payment from John Doe ($50.00 USD)"
   ```

**Result:**
- ✅ Customer `usd_balance`: $100 → $50
- ✅ Customer `lb_balance`: No change
- ✅ Cash drawer: +4,475,000 LBP
- ✅ Visible balance (if preferred currency is USD): Shows converted amount

### Example 2: Customer Payment in LBP

**Scenario:**
- Customer owes: 1,000,000 LBP (in `lb_balance`)
- Customer pays: 500,000 LBP

**Step-by-Step:**

1. **User Action:**
   ```
   Currency: LBP
   Amount: 500,000
   ```

2. **Calculate LBP for Cash Drawer:**
   ```typescript
   amountInLBP = 500,000 (no conversion needed)
   ```

3. **Update Customer Balance:**
   ```typescript
   // Update LBP balance
   lb_balance: 1,000,000 - 500,000 = 500,000 (remaining debt)
   // usd_balance unchanged
   ```

4. **Update Cash Drawer:**
   ```typescript
   // Add to cash drawer in LBP
   current_balance + 500,000 LBP
   ```

5. **Transaction Record:**
   ```
   Type: payment
   Amount: 500,000 LBP
   Currency: LBP
   Description: "Payment from John Doe"
   ```

**Result:**
- ✅ Customer `lb_balance`: 1,000,000 → 500,000
- ✅ Customer `usd_balance`: No change
- ✅ Cash drawer: +500,000 LBP

### Example 3: Supplier Payment in USD (Money Out)

**Scenario:**
- We owe supplier: $200 USD (in `usd_balance`)
- Cash drawer has: 18,000,000 LBP (≈ $201 USD at rate 89,500)
- We pay: $100 USD

**Step-by-Step:**

1. **User Action:**
   ```
   Currency: USD
   Amount: $100.00
   ```

2. **Calculate LBP for Cash Drawer:**
   ```typescript
   amountInLBP = 100 * 89,500 = 8,950,000 LBP
   ```

3. **Check Cash Drawer Balance:**
   ```typescript
   if (8,950,000 > 18,000,000) // false - we have enough
   ```

4. **Update Supplier Balance:**
   ```typescript
   // Update USD balance
   usd_balance: 200 - 100 = $100 (we still owe)
   // lb_balance unchanged
   ```

5. **Update Cash Drawer:**
   ```typescript
   // Subtract from cash drawer in LBP
   current_balance - 8,950,000 LBP
   = 18,000,000 - 8,950,000
   = 9,050,000 LBP remaining
   ```

6. **Transaction Record:**
   ```
   Type: expense
   Amount: 8,950,000 LBP
   Currency: LBP
   Description: "Payment to ABC Supplier ($100.00 USD)"
   ```

**Result:**
- ✅ Supplier `usd_balance`: $200 → $100
- ✅ Supplier `lb_balance`: No change
- ✅ Cash drawer: 18,000,000 → 9,050,000 LBP
- ✅ Balance check compares correctly (both in LBP)

### Example 4: Insufficient Funds (USD Payment)

**Scenario:**
- We owe supplier: $100 USD
- Cash drawer has: 1,000,000 LBP (≈ $11 USD at rate 89,500)
- We try to pay: $50 USD

**Step-by-Step:**

1. **User Action:**
   ```
   Currency: USD
   Amount: $50.00
   ```

2. **Calculate LBP for Cash Drawer:**
   ```typescript
   amountInLBP = 50 * 89,500 = 4,475,000 LBP
   ```

3. **Check Cash Drawer Balance:**
   ```typescript
   if (4,475,000 > 1,000,000) // TRUE - insufficient funds!
   ```

4. **Error Message:**
   ```
   Insufficient cash drawer balance. 
   Payment: $50.00 (4,475,000 LBP)
   Available: 1,000,000 LBP
   ```

**Result:**
- ❌ Payment rejected
- ✅ Clear error message showing both currencies
- ✅ User understands the issue

## Database Schema

### Customers Table
```sql
CREATE TABLE customers (
  id UUID PRIMARY KEY,
  name VARCHAR,
  phone VARCHAR,
  email VARCHAR,
  address VARCHAR,
  lb_balance DECIMAL(15,2) DEFAULT 0,  -- LBP balance
  usd_balance DECIMAL(15,2) DEFAULT 0, -- USD balance
  is_active BOOLEAN DEFAULT true,
  store_id UUID REFERENCES stores(id),
  created_at TIMESTAMP,
  updated_at TIMESTAMP
);
```

### Suppliers Table
```sql
CREATE TABLE suppliers (
  id UUID PRIMARY KEY,
  name VARCHAR,
  phone VARCHAR,
  email VARCHAR,
  address VARCHAR,
  lb_balance DECIMAL(15,2) DEFAULT 0,  -- LBP balance
  usd_balance DECIMAL(15,2) DEFAULT 0, -- USD balance
  store_id UUID REFERENCES stores(id),
  created_at TIMESTAMP,
  updated_at TIMESTAMP
);
```

### Cash Drawer Accounts Table
```sql
CREATE TABLE cash_drawer_accounts (
  id UUID PRIMARY KEY,
  store_id UUID REFERENCES stores(id),
  account_code VARCHAR,
  name VARCHAR,
  currency VARCHAR(3) DEFAULT 'LBP', -- Always LBP
  current_balance DECIMAL(15,2) DEFAULT 0,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMP,
  updated_at TIMESTAMP
);
```

### Transactions Table
```sql
CREATE TABLE transactions (
  id UUID PRIMARY KEY,
  store_id UUID REFERENCES stores(id),
  type VARCHAR(20), -- 'income' or 'expense'
  category VARCHAR(50), -- 'cash_drawer_payment', 'cash_drawer_expense', etc
  amount DECIMAL(15,2),
  currency VARCHAR(3), -- Always 'LBP' for cash drawer
  description TEXT,
  reference VARCHAR(100),
  customer_id UUID REFERENCES customers(id),
  supplier_id UUID REFERENCES suppliers(id),
  created_by UUID REFERENCES users(id),
  created_at TIMESTAMP
);
```

## Benefits of This Implementation

### 1. **Accurate Multi-Currency Tracking**
- ✅ Customer owes $100 USD → Tracked separately from LBP debts
- ✅ Customer owes 500,000 LBP → Tracked separately from USD debts
- ✅ No confusion about which currency is owed

### 2. **Proper Cash Drawer Management**
- ✅ Cash drawer always in LBP (single currency for physical cash)
- ✅ Automatic conversion from USD to LBP
- ✅ Accurate balance tracking

### 3. **Clear Error Messages**
- ✅ Shows payment amount in both selected currency and LBP equivalent
- ✅ Shows available balance in LBP
- ✅ User understands exactly what's wrong

### 4. **Audit Trail**
- ✅ Transaction description includes original USD amount
- ✅ Easy to track which payments were in USD vs LBP
- ✅ Helps with reconciliation

### 5. **Flexible Business Operations**
- ✅ Accept payments in customer's preferred currency
- ✅ Pay suppliers in their preferred currency
- ✅ System handles conversions automatically

## Testing Checklist

### Customer Payments:

- [ ] **Customer pays in USD:**
  - Customer has USD balance
  - Payment reduces `usd_balance`
  - Cash drawer increases by (amount × exchange_rate) in LBP
  - Transaction recorded with USD amount in description

- [ ] **Customer pays in LBP:**
  - Customer has LBP balance
  - Payment reduces `lb_balance`
  - Cash drawer increases by same amount in LBP
  - Transaction recorded normally

- [ ] **Mixed currency customer:**
  - Customer has both USD and LBP balances
  - Can pay either currency independently
  - Each payment reduces only the selected balance

### Supplier Payments:

- [ ] **Pay supplier in USD:**
  - Supplier has USD balance
  - Check cash drawer has sufficient funds (in LBP equivalent)
  - Payment reduces `usd_balance`
  - Cash drawer decreases by (amount × exchange_rate) in LBP

- [ ] **Pay supplier in LBP:**
  - Supplier has LBP balance
  - Check cash drawer has sufficient funds (in LBP)
  - Payment reduces `lb_balance`
  - Cash drawer decreases by same amount

- [ ] **Insufficient funds USD:**
  - Try to pay $100 USD with only 1,000,000 LBP in drawer
  - Should reject with clear error message
  - Shows USD amount and LBP equivalent

- [ ] **Insufficient funds LBP:**
  - Try to pay 10,000,000 LBP with only 5,000,000 in drawer
  - Should reject with clear error

### Edge Cases:

- [ ] **Exchange rate = 0:**
  - Should prevent USD payments
  - Or show error

- [ ] **Exchange rate changes mid-session:**
  - New payments use new rate
  - Old payments already recorded correctly

- [ ] **Negative balances:**
  - System uses `Math.max(0, balance - amount)`
  - Prevents negative balances

- [ ] **Very large amounts:**
  - Test with millions in both currencies
  - Check decimal precision

## Integration Points

### Files Modified:
1. `src/contexts/OfflineDataContext.tsx` - `processPayment` function

### Files Using This Function:
1. `src/pages/Customers.tsx` - Customer and supplier payment forms
2. `src/pages/Accounting.tsx` - Receive and Pay tabs
3. Any other component calling `raw.processPayment()`

### Related Services:
1. `src/services/cashDrawerUpdateService.ts` - Handles cash drawer transactions
2. `src/services/currencyService.ts` - Currency conversion utilities
3. `src/hooks/useCurrency.ts` - Currency formatting

## Future Enhancements

### 1. **Partial Payments with Currency Selection**
Allow customer to pay partially in USD and partially in LBP:
```typescript
{
  usd_amount: 50,
  lbp_amount: 1,000,000,
  // Apply to both balances
}
```

### 2. **Currency Preference Per Customer/Supplier**
Store preferred currency for each customer:
```typescript
interface Customer {
  // ... existing fields
  preferred_currency: 'USD' | 'LBP';
}
```

### 3. **Exchange Rate History**
Track exchange rates used for each transaction:
```sql
ALTER TABLE transactions 
ADD COLUMN exchange_rate_used DECIMAL(10,2);
```

### 4. **Balance Statement by Currency**
Show separate statements for USD and LBP balances.

### 5. **Currency Conversion Fees**
Add option to charge conversion fees:
```typescript
{
  amount: 100,
  currency: 'USD',
  conversionFee: 1, // 1%
  actualAmount: 99 // After fee
}
```

### 6. **Multi-Currency Cash Drawer**
Support physical separation of USD and LBP cash:
```typescript
interface CashDrawerAccount {
  usd_physical_balance: number;
  lbp_physical_balance: number;
  total_value_in_lbp: number; // For reporting
}
```

## Conclusion

The payment system now properly handles multi-currency operations:

- ✅ **Customer/Supplier Balance**: Correctly updated in selected currency
- ✅ **Cash Drawer**: Always stored in LBP with automatic USD conversion
- ✅ **Balance Validation**: Compares apples to apples (LBP to LBP)
- ✅ **Error Messages**: Clear and informative
- ✅ **Audit Trail**: Preserves original currency information

This implementation follows the single source of truth principle and maintains data integrity across currency boundaries.

