---
name: Dual Currency Cash Drawer Display
overview: Update Home page cash drawer balance card to display both USD and LBP balances separately, with an icon button to toggle between showing both currencies or a combined value in the store's preferred currency.
todos: []
---

# Dual Currency Cash Drawer

Display

## Overview

Update the Home page cash drawer balance card to show both USD and LBP balances, with a toggle button to switch between dual-currency view and combined view.

## Current State

- Home page shows cash drawer balance in a single currency (based on account currency)
- Uses `getCurrentCashDrawerBalance()` which returns a single balance
- StatCard component displays a single value

## Changes Required

### 1. Add Method to Get Both Currency Balances

**File**: `apps/store-app/src/services/cashDrawerUpdateService.ts`

- Add method `getCurrentCashDrawerBalances()` that returns `{ USD: number; LBP: number }`
- Use `calculateBothCurrencies()` from `balanceCalculation.ts` to efficiently get both balances from the same journal entries query
- Maintain caching for performance

### 2. Update CashDrawerStatus Interface

**File**: `apps/store-app/src/pages/Home.tsx`

- Update `CashDrawerStatus` interface to include:
  ```typescript
      interface CashDrawerStatus {
        currentBalance: number; // Keep for backward compatibility
        usdBalance: number;      // NEW
        lbpBalance: number;      // NEW
        lastUpdated: string;
        transactionCount: number;
        openedAt: string;
      }
  ```




### 3. Update loadCashDrawerStatus Function

**File**: `apps/store-app/src/pages/Home.tsx`

- Modify `loadCashDrawerStatus` to call `getCurrentCashDrawerBalances()` instead of `getCurrentCashDrawerBalance()`
- Update state to store both USD and LBP balances
- Update `lastCashDrawerValue` to track both currencies

### 4. Add Toggle State

**File**: `apps/store-app/src/pages/Home.tsx`

- Add state: `const [showCombinedBalance, setShowCombinedBalance] = useState(false)`
- This controls whether to show both currencies or combined value

### 5. Update Display Logic

**File**: `apps/store-app/src/pages/Home.tsx`

- Modify `getCashDrawerDisplayValue()` to:
- If `showCombinedBalance` is false: Return formatted string showing both currencies
    - Format: `($)USD: 1,000.00` on first line, `LBP: 1,000,000` on second line
- If `showCombinedBalance` is true: Return combined value in store's preferred currency
    - Convert both currencies to preferred currency and sum them
    - Format using `formatCurrencyForStore()`

### 6. Update StatCard Component

**File**: `apps/store-app/src/components/cards/StatCard.tsx`

- Add props:
- `showCombinedBalance?: boolean`
- `onToggleCombined?: () => void`
- `isCashDrawer?: boolean` (to identify cash drawer card)
- Update display to:
- Show multi-line value if `isCashDrawer` and `!showCombinedBalance`
- Show single value if `showCombinedBalance` is true
- Add icon button (e.g., `DollarSign` or `Repeat`) next to the value to toggle
- Button should be visible only for cash drawer card (index === 0)

### 7. Pass Toggle Props to StatCard

**File**: `apps/store-app/src/pages/Home.tsx`

- Update stats array to pass toggle props to cash drawer stat card
- Add toggle handler function

## Implementation Details

### Balance Calculation

Use `calculateBothCurrencies()` which efficiently calculates both USD and LBP from the same journal entries:

```typescript
const entries = await getDB().journal_entries
  .where('[store_id+account_code]')
  .equals([storeId, '1100'])
  .and(e => e.is_posted === true && e.branch_id === branchId)
  .toArray();

const balances = calculateBothCurrencies(entries);
// Returns { USD: number, LBP: number }
```



### Combined Balance Calculation

When showing combined balance:

- Convert USD to preferred currency (if preferred is LBP, multiply by exchange rate)
- Convert LBP to preferred currency (if preferred is USD, divide by exchange rate)
- Sum both values
- Display in preferred currency format

### UI Layout

**Dual Currency View:**

```javascript
($)USD: 1,000.00
LBP: 1,000,000 ل.ل
[Toggle Icon Button]
```

**Combined View:**

```javascript
$1,000.00 (or 1,000,000 ل.ل)
[Toggle Icon Button]
```



## Files to Modify

1. `apps/store-app/src/services/cashDrawerUpdateService.ts` - Add `getCurrentCashDrawerBalances()` method