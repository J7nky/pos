# 🚀 Quick Reference Card - New Features

## 📊 Understanding Balance Badges

### What You'll See

| Badge | Meaning | Action Needed |
|-------|---------|---------------|
| 🔴 **Owes: $X** | They owe you money | Collect payment |
| 🔵 **Credit: $X** | You owe them money or they overpaid | Apply to future purchase or refund |
| 🟢 **Paid: $0.00** | All settled, nothing owed | None - you're good! |

---

## ⚡ Quick Pay Buttons

### How to Use
1. Open payment form for customer/supplier
2. See suggested payment amounts: **25%**, **50%**, **75%**, **100%**
3. Click any button to auto-fill that amount
4. Submit payment

### Example
```
Customer owes: $500

Quick Pay Buttons Show:
[25% - $125] [50% - $250] [75% - $375] [100% - $500]

Click "50%" → Amount auto-fills with $250.00
```

**Tip**: Use 100% button for full payment, 50% for half payment, etc. No calculator needed!

---

## ⚠️ Overpayment Warning

### What It Means
When you enter a payment amount that's **more than** the current debt, you'll see:

```
⚠️ Overpayment Alert
This payment exceeds the current debt.
The customer will have a credit of $XX.XX
```

### What To Do
1. **If accidental**: Reduce the amount to match the debt
2. **If intentional** (advance payment): Proceed with payment - the customer will have a credit for future purchases

**Note**: The system allows overpayments - this is just a heads-up!

---

## 💵 Currency Display

### What Changed
- **Before**: Everything showed "USD" even if you use LBP
- **After**: Shows YOUR preferred currency

### Examples
```
If you select USD:
• Cash in Drawer (USD): $1,250.50
• Today's Expenses (USD): $450.00

If you select LBP:
• Cash in Drawer (LBP): 125,000,000 ل.ل
• Today's Expenses (LBP): 45,000,000 ل.ل
```

**Tip**: Change currency in Settings → Store Settings

---

## 🎯 Common Workflows

### Workflow 1: Receive Full Payment
```
1. Go to Customers/Suppliers tab
2. Click dollar icon ($) next to customer name
3. Click "100%" button (auto-fills full amount)
4. Add description (optional)
5. Click "Record Payment"

Result: Balance turns green with checkmark ✅
```

### Workflow 2: Receive Partial Payment
```
1. Go to Customers/Suppliers tab
2. Click dollar icon ($) next to customer name
3. Click "50%" button OR manually enter amount
4. Add description (optional)
5. Click "Record Payment"

Result: Balance reduces but stays red 🔴 until fully paid
```

### Workflow 3: Accept Advance Payment (Overpayment)
```
1. Go to Customers/Suppliers tab
2. Click dollar icon ($) next to customer name
3. Enter amount MORE than debt
4. See warning: "Credit of $XX"
5. Proceed if intentional
6. Click "Record Payment"

Result: Balance turns blue 💰 showing credit amount
```

---

## 🔍 Quick Troubleshooting

### "Balance shows Credit but should show Paid"
- **Cause**: Customer overpaid
- **Fix**: Either refund the credit OR apply it to their next purchase

### "Quick pay buttons not showing"
- **Cause**: Customer has no debt or already has credit
- **Fix**: This is normal - buttons only appear when there's debt to pay

### "Warning shows but I want to proceed"
- **Cause**: You're entering more than debt amount
- **Fix**: This is just a warning - you can still proceed if intentional

### "Currency showing wrong"
- **Cause**: Store currency preference not set
- **Fix**: Settings → Store Settings → Select your preferred currency

---

## 📱 Mobile Tips

- Swipe to see full balance badges on small screens
- Quick pay buttons wrap to multiple rows automatically
- All buttons are touch-optimized (easy to tap)
- Forms scroll to visible elements automatically

---

## 🌍 Language Support

This feature works in:
- ✅ English
- ✅ Arabic (العربية)
- ✅ French (coming soon)

Switch language in Settings → Language

---

## 💡 Pro Tips

1. **Use Quick Pay for Common Amounts**
   - 50% = half payment
   - 100% = full payment
   - Saves time, reduces errors

2. **Watch for Overpayment Warnings**
   - Yellow warning = double-check your amount
   - Proceed if intentional (e.g., advance payment)

3. **Understand the Colors**
   - Red = Action needed (collect payment)
   - Blue = Information (credit exists)
   - Green = Success (all settled)

4. **Mobile Workflow**
   - Portrait mode works best
   - Use quick-pay buttons instead of typing
   - Double-tap to zoom if needed

---

## 🆘 Need Help?

### Check Documentation
- `UI_ENHANCEMENTS_SUMMARY.md` - Detailed feature guide
- `UI_ENHANCEMENTS_VISUAL_GUIDE.md` - Visual examples
- `COMPLETE_CURRENCY_AND_UI_IMPROVEMENTS.md` - Technical details

### Common Questions

**Q: Can balances go negative?**  
A: Yes! Negative = credit (you owe them or they overpaid)

**Q: What if I enter wrong amount?**  
A: You can undo the transaction (future feature) or make an adjustment payment

**Q: Do quick-pay buttons work for all currencies?**  
A: Yes! They calculate percentages in whatever currency you're using

**Q: Why does my LBP balance not have decimals?**  
A: LBP doesn't use decimal places (like Japanese Yen), so amounts are rounded

---

**Print this card and keep it handy! 📋**

---

**Version**: 1.0  
**Last Updated**: October 27, 2025  
**Questions?** Contact your system administrator

