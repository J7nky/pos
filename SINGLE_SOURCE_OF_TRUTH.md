# Single Source of Truth: Currency Management

## Architecture Overview

### The Problem We Fixed
**Before:** Components had duplicate local state for currency, creating sync issues:
```typescript
// ❌ BAD: Multiple sources of truth
const [storePreferredCurrency, setStorePreferredCurrency] = useState('USD');
// Gets out of sync with context, causes stale data
```

**After:** All components use the same source:
```typescript
// ✅ GOOD: Single source of truth
const storePreferredCurrency = raw.currency || 'LBP';
// Always synchronized with context
```

## Data Flow

```
┌─────────────────────────────────────────────────────────────┐
│                    SINGLE SOURCE OF TRUTH                    │
└─────────────────────────────────────────────────────────────┘

    Supabase Database
    stores.preferred_currency
           │
           ↓ (sync via syncService.ts)
           │
    IndexedDB (Local)
    stores.preferred_currency  
           │
           ↓ (loadStoreData)
           │
    OfflineDataContext
    currency: 'USD' | 'LBP'
    exchangeRate: number
           │
           ↓ (const raw = useOfflineData())
           │
    ┌──────┴──────────────────────────────┐
    │                                     │
    ↓                                     ↓
All Read Components              Settings Page (Write)
raw.currency                     tempCurrency (form state)
raw.exchangeRate                 → updateCurrency()
```

## Rules for Components

### ✅ DO: Read from Context
```typescript
export default function MyComponent() {
  const raw = useOfflineData();
  const currency = raw.currency || 'LBP';
  const exchangeRate = raw.exchangeRate || 89500;
  
  // Use these values directly
  return <div>{currency}</div>;
}
```

### ❌ DON'T: Create Local State
```typescript
export default function MyComponent() {
  const raw = useOfflineData();
  
  // ❌ NEVER DO THIS - Creates duplicate state
  const [currency, setCurrency] = useState(raw.currency);
  
  // ❌ NEVER DO THIS - Gets out of sync
  useEffect(() => {
    setCurrency(raw.currency);
  }, [raw.currency]);
}
```

### ✅ Exception: Form Editing (Settings Page Only)
```typescript
export default function Settings() {
  const { currency, updateCurrency } = useOfflineData();
  
  // ✅ OK: Temporary state for form editing
  const [tempCurrency, setTempCurrency] = useState(currency);
  
  const handleSave = async () => {
    // ✅ OK: Write back to context
    await updateCurrency(tempCurrency);
  };
}
```

## Implementation Checklist

### For Currency Display:
- [x] **Home.tsx**: Removed duplicate `storePreferredCurrency` state
- [x] **useCurrency.ts**: Uses `raw.exchangeRate` from context
- [x] **CashDrawerMonitor**: Uses `useCurrency` hook (inherits context)
- [ ] **Other components**: Audit for duplicate currency state

### For Currency Conversion:
- [x] Cash drawer balances: LBP → USD conversion
- [x] Expense amounts: LBP → USD conversion  
- [x] Currency formatting: Proper decimals (USD: 2, LBP: 0)
- [x] Exchange rate: Dynamic from store settings

## Benefits

### 1. Consistency
- All components show the same currency at the same time
- No race conditions or sync delays

### 2. Reactivity
- When Settings updates currency, ALL components update automatically
- React's context re-renders consumers when value changes

### 3. Performance
- No duplicate state = less memory
- No sync logic = less CPU
- Context memoization prevents unnecessary renders

### 4. Maintainability
- One place to update logic
- Easy to debug - single source
- Follows React best practices

### 5. Offline-First Compliance
- Matches the established pattern: Supabase → syncService.ts → IndexedDB → OfflineDataContext → UI
- See [[memory:9276959]]

## Common Mistakes to Avoid

### Mistake 1: Duplicating State
```typescript
// ❌ BAD
const { currency } = useOfflineData();
const [localCurrency, setLocalCurrency] = useState(currency);
```

**Why it's bad:**
- Creates two sources of truth
- `localCurrency` doesn't update when settings change
- Must manually sync with `useEffect`

**Fix:**
```typescript
// ✅ GOOD
const { currency } = useOfflineData();
// Use currency directly, no local state needed
```

### Mistake 2: Setting Context Values Directly
```typescript
// ❌ BAD - Context is read-only
raw.currency = 'USD'; // Won't work!
```

**Fix:**
```typescript
// ✅ GOOD - Use the provided setter
await raw.updateCurrency('USD');
```

### Mistake 3: Not Handling Loading States
```typescript
// ❌ BAD - May be undefined during load
const currency = raw.currency; // Could be undefined!
```

**Fix:**
```typescript
// ✅ GOOD - Always provide fallback
const currency = raw.currency || 'LBP';
```

## Testing the Implementation

### Manual Test Steps:

1. **Initial Load**
   - Open app
   - Verify Home page shows correct currency
   - Check console for "📦 Using cached store data"

2. **Change Currency**
   - Go to Settings
   - Change currency from LBP to USD (or vice versa)
   - Save settings
   - Return to Home page
   - Verify:
     - Cash drawer amount shows in new currency
     - Expenses show in new currency
     - Labels show correct currency name
     - Values are properly converted

3. **Refresh Test**
   - Refresh browser
   - Verify currency persists from IndexedDB
   - Check all components show same currency

4. **Multi-Tab Test**
   - Open app in two tabs
   - Change currency in Tab 1
   - Verify Tab 2 updates (may need refresh depending on sync strategy)

### Expected Behavior:

**When USD is selected (Exchange rate: 89,500):**
- Cash Drawer: 895,000 LBP → displays as "$10.00"
- Expenses: 179,000 LBP → displays as "$2.00"
- Labels: "Cash in Drawer (USD)", "Today's Expenses (USD)"

**When LBP is selected:**
- Cash Drawer: 895,000 LBP → displays as "895,000 ل.ل"
- Expenses: 179,000 LBP → displays as "179,000 ل.ل"
- Labels: "Cash in Drawer (LBP)", "Today's Expenses (LBP)"

## Related Files

### Core Files:
- `src/contexts/OfflineDataContext.tsx` - Single source of truth
- `src/hooks/useCurrency.ts` - Currency formatting and conversion
- `src/pages/Settings.tsx` - Only place to edit currency
- `src/lib/db.ts` - IndexedDB schema
- `src/services/syncService.ts` - Syncs with Supabase

### Consumer Files:
- `src/pages/Home.tsx` - Displays currency (FIXED ✅)
- `src/components/CashDrawerMonitor.tsx` - Uses currency
- All other components using `useCurrency` hook

## Future Work

### Components to Audit:
Run this command to find potential issues:
```bash
grep -r "useState.*currency" src/ --include="*.tsx" --include="*.ts"
```

If any component (except Settings) has currency state, it should be refactored to use the context directly.

### Pattern to Follow:
```typescript
// In any component that needs currency:
const { currency, exchangeRate } = useOfflineData();
const storePreferredCurrency = currency || 'LBP';
const rate = exchangeRate || 89500;
```

## Conclusion

By enforcing a single source of truth for currency settings, we:
- ✅ Eliminated sync issues
- ✅ Improved consistency across the app  
- ✅ Simplified component logic
- ✅ Followed offline-first architecture
- ✅ Made the codebase more maintainable

This pattern should be applied to ALL settings and configuration values in the application.

