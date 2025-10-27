# Currency Conversion Fix

## Overview
Fixed the currency display throughout the application to properly convert between LBP (storage currency) and USD (display currency) based on the store's preferred currency setting.

## Changes Made

### 1. Home Page (`src/pages/Home.tsx`)

#### Single Source of Truth ⭐
**IMPORTANT:** Removed duplicate local state `storePreferredCurrency`

**Before (BAD - Multiple Sources):**
```typescript
const [storePreferredCurrency, setStorePreferredCurrency] = useState<'USD' | 'LBP'>('USD');
// Later: setStorePreferredCurrency(raw.currency) - creates sync issues!
```

**After (GOOD - Single Source):**
```typescript
const storePreferredCurrency = raw.currency || 'LBP'; // Direct from context
```

This ensures the currency value always comes from `OfflineDataContext`, which loads it from:
1. IndexedDB `stores` table → `preferred_currency` field
2. Synced from Supabase database
3. Configurable in Settings page

#### Added Exchange Rate
- Now retrieves `exchangeRate` from the OfflineDataContext
- Default fallback: 89,500 LBP per USD

#### Updated Cash Drawer Balance Conversion
```typescript
const getNormalizedCashDrawerBalance = useCallback((balance: number): number => {
  if (storePreferredCurrency === 'USD') {
    // Convert LBP to USD by dividing by exchange rate
    return balance / exchangeRate;
  }
  // LBP: return as-is
  return balance;
}, [storePreferredCurrency, exchangeRate]);
```

#### Improved Currency Formatting
```typescript
const formatCurrencyForStore = useCallback((amount: number): string => {
  if (storePreferredCurrency === 'LBP') {
    return `${Math.round(amount).toLocaleString()} ل.ل`;
  }
  // For USD, show 2 decimal places
  return `$${amount.toFixed(2)}`;
}, [storePreferredCurrency]);
```

#### Fixed Today's Expenses Display
- Added `convertExpenseAmount` function to convert expense amounts from LBP to USD when needed
- Applied conversion to all expense calculations in stats and fast actions

### 2. Currency Hook (`src/hooks/useCurrency.ts`)

#### Dynamic Exchange Rate
- Now uses `exchangeRate` from OfflineDataContext instead of hardcoded value
- Fallback to 89,500 if not available

#### Enhanced `formatCurrency` Function
```typescript
const formatCurrency = (amount: number, fromCurrency: 'USD' | 'LBP' = 'LBP'): string => {
  // Convert from storage currency (LBP) to display currency if needed
  let displayAmount = amount;
  if (fromCurrency === 'LBP' && currency === 'USD') {
    displayAmount = amount / USD_TO_LBP_RATE;
  } else if (fromCurrency === 'USD' && currency === 'LBP') {
    displayAmount = amount * USD_TO_LBP_RATE;
  }
  
  if (currency === 'LBP') {
    return `${Math.round(displayAmount).toLocaleString()} ل.ل`;
  }
  return `$${displayAmount.toFixed(2)}`;
};
```

**Key Features:**
- Second parameter `fromCurrency` defaults to 'LBP' (storage currency)
- Automatically converts to preferred display currency
- LBP amounts are rounded to nearest whole number
- USD amounts show 2 decimal places

#### Updated `formatCurrencyWithSymbol`
- Now shows 2 decimal places for USD
- Rounds LBP amounts to whole numbers

### 3. Components Affected

#### CashDrawerMonitor
- Automatically uses updated `formatCurrency` from `useCurrency` hook
- No code changes needed - inherits proper conversion behavior

#### StatCard
- No changes needed
- Receives already-formatted currency strings from Home page

## Architecture: Single Source of Truth

### Currency Settings Flow
```
Supabase DB (stores.preferred_currency) 
    ↓ (sync)
IndexedDB (stores.preferred_currency)
    ↓ (loadStoreData)
OfflineDataContext (raw.currency)
    ↓ (direct reference)
All Components (read-only)
```

**Key Principles:**
1. ✅ **ONE source:** `raw.currency` from OfflineDataContext
2. ❌ **NO local state:** Don't duplicate with `useState`
3. ✅ **Read-only:** Components read, don't set
4. ✅ **Update via Settings:** Only Settings page calls `updateCurrency()`

### Why Single Source of Truth Matters
- ✅ Prevents sync issues between local state and context
- ✅ Automatic updates when settings change
- ✅ No stale data from unmounted components
- ✅ Consistent display across entire app
- ✅ Follows offline-first architecture pattern [[memory:9276959]]

## How It Works

### Database Storage
- All balances, expenses, and transactions are stored in **LBP** in the database
- Cash drawer balance: LBP
- Expenses: LBP
- Transaction amounts: LBP

### Display Logic
1. **When LBP is selected as preferred currency:**
   - Display values as-is from database
   - Format: `123,456 ل.ل`

2. **When USD is selected as preferred currency:**
   - Divide LBP amounts by exchange rate
   - Format: `$1.38` (2 decimal places)

### Example Conversion
- Database value: 123,456 LBP
- Exchange rate: 89,500 LBP per USD
- USD display: $1.38

## Testing

### To Test USD Display:
1. Go to Settings page
2. Set "Preferred Currency" to USD
3. Set "Exchange Rate" to your desired rate (e.g., 89500)
4. Save settings
5. Return to Home page
6. Verify:
   - Cash drawer balance shows in USD
   - Today's expenses show in USD
   - All amounts are divided by exchange rate

### To Test LBP Display:
1. Go to Settings page
2. Set "Preferred Currency" to LBP
3. Return to Home page
4. Verify:
   - Cash drawer balance shows in LBP
   - Today's expenses show in LBP
   - All amounts are displayed as stored in database

## Future Enhancements

### Components to Update (if needed):
The following components also use `formatCurrency` and will automatically benefit from the fix:
- ReceivedBills
- SoldBills  
- PaymentsManagement
- DashboardOverview
- AccountStatementModal
- POS page
- Accounting page
- PublicCustomerStatement

All these components use the `useCurrency` hook, so they should automatically apply the conversion. However, you may need to verify that they're passing the correct `fromCurrency` parameter when calling `formatCurrency`.

## Notes

- The exchange rate is configurable in Settings
- Exchange rate is stored per store in the `stores` table
- Default exchange rate: 89,500 LBP per USD
- All database operations continue to use LBP as the storage currency
- Conversion happens only at the display layer

