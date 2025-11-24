# Phase 6: Manual Testing Checklist

**Date:** 2024-11-24  
**Phase:** 6 of 6 - Transaction Service Refactor  
**Purpose:** Verify all transaction operations work correctly after refactoring

---

## Pre-Testing Setup

### 1. Environment Preparation
- [ ] Clear browser cache and IndexedDB
- [ ] Start application in development mode
- [ ] Open browser console to monitor logs
- [ ] Prepare test data (customers, suppliers, products)

### 2. Console Monitoring
Watch for these expected warnings:
- ⚠️ `applyTransactionImpact is deprecated` - Expected during payment updates
- ⚠️ `revertTransactionImpact is deprecated` - Expected during payment deletes

Watch for unexpected errors:
- ❌ Any errors about missing balance updates
- ❌ Any errors about undefined methods
- ❌ Any duplicate transaction creation

---

## Test Scenarios

### A. Customer Payment Flow ✅

#### Test 1: Create Customer Payment
**Steps:**
1. Navigate to Accounting page
2. Go to Payments Management tab
3. Create a new customer payment:
   - Select a customer
   - Enter amount: $100 USD
   - Add description: "Test payment"
   - Submit

**Expected Results:**
- ✅ Payment created successfully
- ✅ Customer balance decreased by $100
- ✅ Transaction appears in transactions list
- ✅ Audit log created
- ✅ No duplicate balance updates
- ✅ Console shows no errors

**Verification:**
- [ ] Check customer balance in database
- [ ] Verify transaction record exists
- [ ] Check audit log entry
- [ ] Confirm no duplicate transactions

---

#### Test 2: Update Customer Payment
**Steps:**
1. Find the payment created in Test 1
2. Click Edit
3. Change amount to $150 USD
4. Save changes

**Expected Results:**
- ✅ Payment updated successfully
- ✅ Customer balance adjusted correctly (additional -$50)
- ✅ Deprecation warning appears in console
- ✅ Audit log created for update
- ✅ No errors

**Verification:**
- [ ] Check updated transaction amount
- [ ] Verify customer balance is correct
- [ ] Check console for deprecation warning
- [ ] Verify audit log entry

---

#### Test 3: Delete Customer Payment
**Steps:**
1. Find the payment from Test 2
2. Click Delete
3. Confirm deletion

**Expected Results:**
- ✅ Payment deleted successfully
- ✅ Customer balance reverted (back to original)
- ✅ Deprecation warning appears in console
- ✅ Transaction marked as deleted
- ✅ Audit log created for deletion

**Verification:**
- [ ] Check transaction is marked _deleted
- [ ] Verify customer balance restored
- [ ] Check console for deprecation warning
- [ ] Verify audit log entry

---

### B. Supplier Payment Flow ✅

#### Test 4: Create Supplier Payment
**Steps:**
1. Navigate to Accounting page
2. Go to Payments Management tab
3. Create a new supplier payment:
   - Select a supplier
   - Enter amount: $200 USD
   - Add description: "Test supplier payment"
   - Submit

**Expected Results:**
- ✅ Payment created successfully
- ✅ Supplier balance decreased by $200
- ✅ Transaction appears in transactions list
- ✅ Audit log created
- ✅ No duplicate balance updates

**Verification:**
- [ ] Check supplier balance in database
- [ ] Verify transaction record exists
- [ ] Check audit log entry
- [ ] Confirm no duplicate transactions

---

#### Test 5: Update Supplier Payment
**Steps:**
1. Find the payment created in Test 4
2. Click Edit
3. Change amount to $250 USD
4. Save changes

**Expected Results:**
- ✅ Payment updated successfully
- ✅ Supplier balance adjusted correctly
- ✅ Deprecation warning appears in console
- ✅ No errors

**Verification:**
- [ ] Check updated transaction amount
- [ ] Verify supplier balance is correct
- [ ] Check console for deprecation warning

---

### C. Credit Sale Flow ✅

#### Test 6: Create Credit Sale
**Steps:**
1. Navigate to POS page
2. Add products to cart
3. Select a customer
4. Choose "Credit" payment method
5. Complete sale

**Expected Results:**
- ✅ Sale created successfully
- ✅ Customer balance increased (debt)
- ✅ Inventory decreased
- ✅ Transaction created via transactionService
- ✅ No duplicate balance updates
- ✅ Audit log created

**Verification:**
- [ ] Check customer balance increased
- [ ] Verify inventory quantities decreased
- [ ] Check sale record exists
- [ ] Verify transaction record
- [ ] Check audit log entry

---

#### Test 7: Customer Pays Credit Balance
**Steps:**
1. Navigate to Accounting page
2. Create customer payment for the amount from Test 6
3. Submit payment

**Expected Results:**
- ✅ Payment created successfully
- ✅ Customer balance decreased (debt reduced)
- ✅ Balance matches expected amount
- ✅ No errors

**Verification:**
- [ ] Check customer balance is correct
- [ ] Verify payment transaction exists
- [ ] Confirm balance calculation is accurate

---

### D. Cash Drawer Operations ✅

#### Test 8: Cash Sale
**Steps:**
1. Navigate to POS page
2. Add products to cart
3. Choose "Cash" payment method
4. Complete sale

**Expected Results:**
- ✅ Sale created successfully
- ✅ Cash drawer balance increased
- ✅ Inventory decreased
- ✅ Transaction created
- ✅ Audit log created

**Verification:**
- [ ] Check cash drawer balance increased
- [ ] Verify inventory decreased
- [ ] Check sale record
- [ ] Verify transaction record

---

#### Test 9: Cash Expense
**Steps:**
1. Navigate to Accounting page
2. Create a cash expense:
   - Enter amount: $50 USD
   - Add description: "Test expense"
   - Submit

**Expected Results:**
- ✅ Expense created successfully
- ✅ Cash drawer balance decreased
- ✅ Transaction created
- ✅ Audit log created

**Verification:**
- [ ] Check cash drawer balance decreased
- [ ] Verify expense transaction exists
- [ ] Check audit log entry

---

### E. Currency Conversion ✅

#### Test 10: Multi-Currency Payment
**Steps:**
1. Create a customer payment in LBP
2. Enter amount: 89,500 LBP
3. Submit payment

**Expected Results:**
- ✅ Payment created successfully
- ✅ Currency conversion handled by currencyService
- ✅ Customer balance updated in USD equivalent
- ✅ No hardcoded conversion rates used

**Verification:**
- [ ] Check payment currency is LBP
- [ ] Verify customer balance updated correctly
- [ ] Confirm conversion rate used from currencyService
- [ ] Check no hardcoded `* 89500` in code

---

### F. Edge Cases & Error Handling ✅

#### Test 11: Invalid Transaction
**Steps:**
1. Try to create a payment with:
   - Negative amount
   - Missing customer/supplier
   - Invalid currency

**Expected Results:**
- ✅ Validation errors shown
- ✅ Transaction not created
- ✅ No database changes
- ✅ User-friendly error messages

**Verification:**
- [ ] Check validation works
- [ ] Verify no partial updates
- [ ] Confirm error messages are clear

---

#### Test 12: Concurrent Updates
**Steps:**
1. Open two browser tabs
2. In both tabs, try to update the same payment
3. Submit changes in both tabs

**Expected Results:**
- ✅ One update succeeds
- ✅ Other update shows error or refreshes
- ✅ No data corruption
- ✅ Balance remains consistent

**Verification:**
- [ ] Check only one update applied
- [ ] Verify data consistency
- [ ] Confirm no duplicate transactions

---

### G. Audit Trail Verification ✅

#### Test 13: Audit Log Completeness
**Steps:**
1. Perform various operations (create, update, delete)
2. Navigate to audit logs
3. Review log entries

**Expected Results:**
- ✅ All operations logged
- ✅ Logs include:
  - User ID
  - Timestamp
  - Action type
  - Before/after values
  - Correlation IDs
- ✅ Logs are searchable

**Verification:**
- [ ] Check all operations have audit logs
- [ ] Verify log details are complete
- [ ] Confirm correlation IDs link related operations

---

### H. Performance Testing ✅

#### Test 14: Bulk Operations
**Steps:**
1. Create 50 customer payments rapidly
2. Monitor performance
3. Check database size

**Expected Results:**
- ✅ All payments created successfully
- ✅ No performance degradation
- ✅ No memory leaks
- ✅ Database remains responsive

**Verification:**
- [ ] Check all 50 payments exist
- [ ] Verify balances are correct
- [ ] Monitor browser memory usage
- [ ] Check database query performance

---

#### Test 15: Large Transaction History
**Steps:**
1. Create 100+ transactions
2. Navigate to transaction list
3. Filter and search transactions

**Expected Results:**
- ✅ List loads quickly
- ✅ Filtering works correctly
- ✅ Search is responsive
- ✅ Pagination works

**Verification:**
- [ ] Check list performance
- [ ] Verify filtering accuracy
- [ ] Test search functionality
- [ ] Confirm pagination

---

## Data Integrity Checks

### Database Verification
After completing all tests, verify:

#### Customer Balances
```sql
-- Check customer balances match transaction history
SELECT 
  c.id,
  c.name,
  c.usd_balance,
  SUM(CASE WHEN t.type = 'income' THEN -t.amount ELSE t.amount END) as calculated_balance
FROM customers c
LEFT JOIN transactions t ON t.customer_id = c.id AND t._deleted = false
GROUP BY c.id
HAVING c.usd_balance != calculated_balance;
```
- [ ] No discrepancies found

#### Supplier Balances
```sql
-- Check supplier balances match transaction history
SELECT 
  s.id,
  s.name,
  s.usd_balance,
  SUM(CASE WHEN t.type = 'expense' THEN -t.amount ELSE t.amount END) as calculated_balance
FROM suppliers s
LEFT JOIN transactions t ON t.supplier_id = s.id AND t._deleted = false
GROUP BY s.id
HAVING s.usd_balance != calculated_balance;
```
- [ ] No discrepancies found

#### Transaction Integrity
- [ ] No orphaned transactions (transactions without valid customer/supplier)
- [ ] All transactions have valid categories
- [ ] All transactions have references
- [ ] No duplicate transactions (same reference, amount, timestamp)

#### Audit Logs
- [ ] Every transaction has corresponding audit log
- [ ] Audit logs have valid correlation IDs
- [ ] No missing audit entries

---

## Console Log Review

### Expected Warnings (OK)
- ⚠️ `applyTransactionImpact is deprecated` - During payment updates
- ⚠️ `revertTransactionImpact is deprecated` - During payment deletes

### Unexpected Issues (INVESTIGATE)
- ❌ Any errors about missing methods
- ❌ Any errors about undefined properties
- ❌ Any duplicate transaction warnings
- ❌ Any balance calculation errors

---

## Regression Testing

### Verify No Breaking Changes
- [ ] Existing payment update flow works
- [ ] Existing payment delete flow works
- [ ] POS sales still work
- [ ] Customer payments still work
- [ ] Supplier payments still work
- [ ] Cash drawer operations still work
- [ ] Inventory updates still work
- [ ] Audit logs still created

---

## Sign-Off

### Test Results Summary

**Total Tests:** 15  
**Passed:** ___  
**Failed:** ___  
**Blocked:** ___  

### Critical Issues Found
List any critical issues that block release:
1. 
2. 
3. 

### Non-Critical Issues Found
List any minor issues for future fixes:
1. 
2. 
3. 

### Performance Notes
Any performance concerns:
- 
- 

### Recommendations
- 
- 

---

**Tested By:** _______________  
**Date:** _______________  
**Sign-Off:** _______________  

**Status:** [ ] APPROVED FOR PRODUCTION  [ ] NEEDS FIXES

---

## Next Steps After Testing

If all tests pass:
1. ✅ Mark Phase 6 as complete
2. ✅ Create final refactor summary document
3. ✅ Update documentation
4. ✅ Plan deployment
5. ✅ Monitor production after deployment

If tests fail:
1. ❌ Document failures
2. ❌ Create bug tickets
3. ❌ Fix issues
4. ❌ Re-test
5. ❌ Repeat until all pass
