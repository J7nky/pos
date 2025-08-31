# Cash Drawer System Testing Guide

## 🧪 How to Test the Cash Drawer Improvements

This guide provides step-by-step instructions for testing all the cash drawer improvements and validating that cash sales properly update the cash drawer.

## 🚀 Quick Start Testing

### 1. Start the Development Server

```bash
npm run dev
```

### 2. Access the Application
- Open your browser to the development server URL (usually `http://localhost:5173`)
- Log in to the system

### 3. Basic Cash Sales Test

#### Step 1: Check Initial Cash Drawer Status
1. Navigate to **Home** or **Cash Drawer Monitor**
2. Note the current cash drawer balance
3. Check if there's an active session

#### Step 2: Make a Cash Sale
1. Go to **POS** component
2. Add products to cart
3. Set **Payment Method** to **Cash**
4. Enter **Amount Received** (equal to or greater than total)
5. Click **Complete Sale**

#### Step 3: Verify Cash Drawer Update
1. Check that cash drawer balance increased by the sale amount
2. Look for console messages like:
   ```
   💰 Auto-updating cash drawer for cash sale: $[amount]
   💰 Cash drawer updated: sale - $[amount] (Balance: $[old] → $[new])
   ```

## 🔍 Detailed Testing Scenarios

### Scenario 1: Session Management Testing

#### Test Auto Session Opening
1. **Ensure no active session**: Check cash drawer status
2. **Make a cash sale**: Process should auto-open session
3. **Verify session creation**: Check that session was created with 0 opening amount
4. **Check console logs**: Look for "Auto-opened for sale" message

#### Test Explicit Session Opening
1. **Open session manually**: Use cash drawer controls to open session with specific amount
2. **Make cash sales**: Verify they use existing session
3. **Close session**: Use cash drawer controls to close with actual count
4. **Verify variance calculation**: Check expected vs actual amounts

### Scenario 2: Balance Calculation Testing

#### Test Single Source of Truth
1. **Open browser console** to see detailed logs
2. **Make multiple cash transactions**: Sales, payments, expenses
3. **Check balance consistency**: Balance should always match transaction history
4. **Look for reconciliation messages**: Any discrepancies should auto-correct

#### Test Balance Reconciliation
1. **Simulate balance discrepancy**: (This would require database manipulation)
2. **Access cash drawer balance**: Should trigger automatic reconciliation
3. **Verify reconciliation transaction**: Check transaction history for reconciliation entries

### Scenario 3: Error Handling Testing

#### Test Missing Session (Direct API)
1. **Use browser console** to call service directly:
   ```javascript
   // This should fail without allowAutoSessionOpen
   await window.cashDrawerUpdateService.updateCashDrawerForTransaction({
     type: 'sale',
     amount: 50,
     currency: 'USD',
     description: 'Direct test',
     reference: 'TEST-123',
     storeId: '[your-store-id]',
     createdBy: '[your-user-id]'
   });
   ```
2. **Expect error**: "No active cash drawer session. Please open cash drawer session before processing transactions."

#### Test Concurrent Operations
1. **Open browser console**
2. **Execute multiple operations simultaneously**:
   ```javascript
   // These should be handled sequentially due to locking
   Promise.all([
     window.cashDrawerService.updateForSale(...),
     window.cashDrawerService.updateForSale(...)
   ]);
   ```

### Scenario 4: Synchronization Testing

#### Test Offline/Online Sync
1. **Go offline**: Disconnect internet
2. **Make cash sales**: Should work offline
3. **Go online**: Reconnect internet
4. **Trigger sync**: Check that cash drawer data syncs properly
5. **Verify conflict resolution**: Check logs for any conflicts resolved

## 🛠️ Testing Utilities

### Browser Console Testing

Add these to browser console for manual testing:

```javascript
// Test cash drawer service directly
window.testCashDrawer = {
  // Test session opening
  async openSession(storeId, amount, userId) {
    const service = await import('./src/services/cashDrawerUpdateService.js');
    return await service.cashDrawerUpdateService.openCashDrawerSession(storeId, amount, userId);
  },
  
  // Test balance calculation
  async getBalance(storeId) {
    const service = await import('./src/services/cashDrawerUpdateService.js');
    return await service.cashDrawerUpdateService.getCurrentCashDrawerBalance(storeId);
  },
  
  // Test transaction processing
  async processTransaction(data) {
    const service = await import('./src/services/cashDrawerUpdateService.js');
    return await service.cashDrawerUpdateService.updateCashDrawerForTransaction(data);
  }
};
```

### Database Inspection

Check database state in browser console:

```javascript
// Check cash drawer accounts
await db.cash_drawer_accounts.toArray();

// Check active sessions
await db.getCurrentCashDrawerSession('[store-id]');

// Check transaction history
await db.transactions.filter(t => t.category.startsWith('cash_drawer_')).toArray();

// Check sale items
await db.sale_items.filter(s => s.payment_method === 'cash').toArray();
```

## 📋 Test Checklist

### ✅ Basic Functionality
- [ ] Cash sales increase cash drawer balance
- [ ] Card/credit sales don't affect cash drawer
- [ ] Cash payments increase cash drawer balance
- [ ] Cash expenses decrease cash drawer balance
- [ ] Cash refunds decrease cash drawer balance

### ✅ Session Management
- [ ] Sessions auto-open when needed for sales
- [ ] Manual session opening works
- [ ] Session closing calculates variance correctly
- [ ] Multiple session prevention works
- [ ] Session state synchronizes across devices

### ✅ Balance Integrity
- [ ] Balance calculation matches transaction history
- [ ] Balance discrepancies auto-reconcile
- [ ] Reconciliation transactions are created
- [ ] Currency conversion works properly

### ✅ Error Handling
- [ ] Missing session errors are clear
- [ ] Transaction failures roll back properly
- [ ] Invalid data is rejected gracefully
- [ ] Network errors are handled properly

### ✅ Synchronization
- [ ] Cash drawer data syncs between devices
- [ ] Balance conflicts resolve correctly
- [ ] Session conflicts prioritize closed sessions
- [ ] Financial data is preserved during conflicts

### ✅ Race Conditions
- [ ] Concurrent operations don't corrupt data
- [ ] Operation locking works properly
- [ ] Database transactions are atomic
- [ ] UI updates reflect changes correctly

## 🐛 Common Issues & Solutions

### Issue: "No active cash drawer session"
**Solution**: 
- For POS sales: Should auto-open session (check console logs)
- For direct API calls: Open session manually first

### Issue: Balance doesn't update
**Check**:
1. Payment method is set to "cash"
2. Console logs show hook triggering
3. No JavaScript errors in console
4. Database hooks are properly set up

### Issue: Double transactions
**Check**:
1. Hooks have infinite loop prevention
2. Only one update method is being called
3. Transaction categories are properly filtered

## 🔧 Debugging Tools

### Enable Detailed Logging
Add this to browser console:
```javascript
// Enable verbose cash drawer logging
localStorage.setItem('cashDrawer_debug', 'true');

// Check hook execution
window.addEventListener('cash-drawer-updated', (e) => {
  console.log('Cash drawer updated:', e.detail);
});
```

### Monitor Database Changes
```javascript
// Watch database changes
db.cash_drawer_accounts.hook('updating', (primKey, obj, trans) => {
  console.log('Account updated:', primKey, obj);
});

db.cash_drawer_sessions.hook('creating', (primKey, obj, trans) => {
  console.log('Session created:', primKey, obj);
});
```

## 🚀 Advanced Testing

### Load Testing
```javascript
// Test concurrent operations
const promises = [];
for (let i = 0; i < 10; i++) {
  promises.push(
    // Simulate concurrent cash sales
    // Add products and complete sales rapidly
  );
}
await Promise.all(promises);
```

### Sync Testing
1. **Use multiple browser tabs** to simulate multiple devices
2. **Make changes in each tab**
3. **Trigger sync** and verify conflict resolution
4. **Check that balances remain consistent**

## 📊 Success Indicators

### ✅ Working Correctly When:
- Cash sales immediately update cash drawer balance
- Console shows "💰 Auto-updating cash drawer for cash sale" messages
- Transaction history includes cash_drawer_sale entries
- Sessions auto-open when needed
- Balance always matches transaction history
- No JavaScript errors in console

### ❌ Issues If:
- Cash sales don't update balance
- Console shows session errors
- Balance calculations are inconsistent
- JavaScript errors appear
- Transactions are duplicated
- Sync conflicts aren't resolved

## 🎯 Next Steps

After basic testing works:
1. **Test with real data** and multiple users
2. **Perform load testing** with concurrent operations
3. **Test offline/online transitions**
4. **Validate with accounting requirements**
5. **Test with actual cash drawer hardware** (if applicable)

---

**🎉 The cash drawer system should now work perfectly with all improvements implemented!**