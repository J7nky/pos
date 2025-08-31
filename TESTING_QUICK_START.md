# 🚀 Quick Start: Testing Cash Drawer Improvements

## ⚡ Immediate Testing Steps

### 1. Start the Application
```bash
npm run dev
```

### 2. Open Browser Console
- Open Developer Tools (F12)
- Go to Console tab
- Keep it open to see logs

### 3. Load Testing Utilities
Copy and paste the entire contents of `scripts/cashDrawerTestUtils.js` into the browser console.

### 4. Run Quick Test
```javascript
// Quick test to verify cash sales work
cashDrawerTest.quickTest()
```

### 5. Manual POS Test
1. Go to **POS** component
2. Add any product to cart
3. Set payment method to **Cash**
4. Enter amount received
5. Click **Complete Sale**
6. Watch console for cash drawer update messages

## 🔍 What to Look For

### ✅ Success Indicators:
- Console shows: `💰 Auto-updating cash drawer for cash sale: $[amount]`
- Console shows: `💰 Cash drawer updated: sale - $[amount] (Balance: $[old] → $[new])`
- Cash drawer balance increases by sale amount
- No error messages in console

### ❌ Failure Indicators:
- No cash drawer update messages
- Balance doesn't change after cash sale
- Error messages about missing sessions
- JavaScript errors in console

## 🧪 Advanced Testing

### Full Test Suite
```javascript
// Run comprehensive tests
cashDrawerTest.runTestSuite()
```

### Individual Tests
```javascript
// Check current balance
await cashDrawerTest.getBalance()

// Check session status
await cashDrawerTest.getSessionStatus()

// Test session opening
await cashDrawerTest.testSessionOpen(100)

// Test cash sale
await cashDrawerTest.testCashSale(50)

// View transaction history
await cashDrawerTest.getTransactionHistory()
```

### Database Inspection
```javascript
// Check cash drawer accounts
await db.cash_drawer_accounts.toArray()

// Check active sessions
await db.cash_drawer_sessions.toArray()

// Check recent transactions
await db.transactions.filter(t => t.category.startsWith('cash_drawer_')).reverse().limit(10).toArray()

// Check recent sale items
await db.sale_items.filter(s => s.payment_method === 'cash').reverse().limit(10).toArray()
```

## 🐛 Troubleshooting

### If Cash Sales Don't Update Cash Drawer:

1. **Check Console Logs**:
   - Look for hook trigger messages
   - Check for any error messages
   - Verify sale items are being created

2. **Verify Database Hooks**:
   ```javascript
   // Check if hooks are properly set
   console.log('Sale items hooks:', db.sale_items._hooks);
   ```

3. **Check Session Status**:
   ```javascript
   // Should auto-open session if none exists
   await cashDrawerTest.getSessionStatus()
   ```

4. **Manual Session Opening**:
   ```javascript
   // Try opening session manually first
   await cashDrawerTest.testSessionOpen(0)
   ```

### If Tests Fail:

1. **Check Store ID and User ID**:
   ```javascript
   console.log('Store ID:', window.raw?.storeId);
   console.log('User Profile:', window.userProfile?.id);
   ```

2. **Check Database Connection**:
   ```javascript
   // Test basic database access
   await db.products.limit(1).toArray()
   ```

3. **Check Service Import**:
   ```javascript
   // Test service import
   const { cashDrawerUpdateService } = await import('/src/services/cashDrawerUpdateService.js');
   console.log('Service loaded:', !!cashDrawerUpdateService);
   ```

## 🎯 Expected Test Results

After running `cashDrawerTest.quickTest()`, you should see:

```
⚡ Quick Cash Sale Test
=====================

🧪 Testing cash sale for $30
Using storeId: [your-store-id], userId: [your-user-id]
💰 Initial balance: $[initial-amount]
💰 Auto-updating cash drawer for cash sale: $30
💰 Cash drawer updated: sale - $30.00 (Balance: $[old] → $[new])
💰 New balance: $[new-amount]
✅ SUCCESS: Cash sale correctly updated cash drawer (+$30.00)
🎉 QUICK TEST PASSED: Cash sales are working!
```

## 🚨 If Tests Still Fail

1. **Check the fixes are applied**: Verify `src/lib/db.ts` has hooks on `creating` events
2. **Check session auto-opening**: Verify `allowAutoSessionOpen` parameter is working
3. **Check console errors**: Look for any JavaScript errors
4. **Try manual session opening**: Open session manually before testing sales
5. **Check database state**: Ensure tables exist and are accessible

## 📞 Getting Help

If tests continue to fail:
1. Copy the console output
2. Check the browser Network tab for any failed requests
3. Verify the application is running in development mode
4. Ensure you're logged in properly
5. Check that the database is initialized

---

**🎉 The cash drawer system should now work perfectly! Start with the quick test and then explore the comprehensive testing options.**
