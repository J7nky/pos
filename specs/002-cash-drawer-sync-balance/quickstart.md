# Quickstart: Cash Drawer Sync & Balance Correctness

**Branch**: `002-cash-drawer-sync-balance`  
**Date**: 2026-03-24

---

## Prerequisites

```bash
# From repo root
node --version   # must be ≥18
pnpm --version   # must be ≥8
git branch       # must be on 002-cash-drawer-sync-balance
```

---

## Running the Store App

```bash
# Install dependencies (if not already done)
pnpm install

# Start the store-app dev server
pnpm --filter store-app dev
```

Open `http://localhost:5173` (or the port shown in terminal).

---

## Manual Test Checklist

Run these in order after implementing each phase.

### Phase 1 tests

**NaN guard (Fix 7.6)**
1. Open a cash drawer session with a USD account.
2. Record a payment using **LBP only** (leave USD amount at 0 or blank).
3. Verify the displayed USD balance shows `0.00` — not `NaN` and not blank.

**Session sort (Fix 7.7)**
1. Open browser DevTools → Application → IndexedDB → `cash_drawer_sessions`.
2. Manually insert a second row with `status: 'open'` and an `opened_at` older than the real session.
3. Reload the app. Verify it picks the **newer** session (the real one you opened through the UI).

**Stale seed (Fix 7.9)**
1. Open the app online for the first time (no local `cash_drawer_accounts`).
2. In IndexedDB, find the seeded `cash_drawer_accounts` row.
3. Verify `current_balance` is `0`, regardless of what Supabase stored.

**Multi-branch balance isolation (Fix 7.4)**
1. Log in to a store with two branches, each with a cash account.
2. Switch to Branch A. Record a $50 sale. Note the balance.
3. Switch to Branch B. Verify Branch B shows its own balance — not Branch A's total.

---

### Phase 2 tests

**Live balance after transaction (Fixes 7.1, 7.2, 7.3)**
1. Open a cash drawer session with $100.
2. Verify the displayed balance is `$100.00` immediately (not frozen after a page reload).
3. Record a $25 cash sale.
4. Verify the balance updates to `$125.00` within 1 second — no page reload.
5. Open the Home dashboard in another browser tab (same session).
6. Verify both tabs show `$125.00` — identical balances.
7. Record a $10 cash expense.
8. Verify both tabs show `$115.00` within 1 second.

**Screen consistency (Fix 7.2)**
1. Navigate to the Accounting page and to the Home dashboard with an active session.
2. Record a transaction on POS.
3. Verify the balance shown on Accounting and on Home are identical within 1 second.

---

### Phase 3 tests

**Sync download order (Fix 7.8)**
1. On Device B (second browser/incognito), log in and select the same branch.
2. On Device B, clear IndexedDB (DevTools → Application → Clear site data).
3. On Device B, reload and trigger a full sync.
4. Immediately after sync completes, verify the cash drawer balance is NOT zero — it shows the correct session-scoped balance.

**Real-time second device update (Fix 7.5)**
1. Open the app on Device A and Device B, both on the same branch.
2. On Device A, record a $30 sale.
3. On Device B, watch the cash drawer balance widget.
4. Within 30 seconds (without manual sync on Device B), the balance should update to reflect the $30 sale.
5. Confirm `branch_event_log` in Supabase has a row with `event_type = 'cash_drawer_transaction_posted'`.

---

### Phase 4 tests

**Closed state display**
1. Close the cash drawer session (or open the app with no active session).
2. On the Home dashboard, verify the cash drawer widget shows a **"Closed"** label and an **"Open Cash Drawer"** button — NOT a zero balance.
3. On any other screen showing the cash balance, verify the same closed state is displayed.

---

## Running Unit Tests

```bash
# From store-app directory
pnpm --filter store-app test

# Run only balance-related tests
pnpm --filter store-app test -- balanceCalculation
```

Key test files to check/add:
- `apps/store-app/src/utils/__tests__/balanceCalculation.test.ts` — add a test for `calculateBothCurrencies` with `undefined` fields producing `0`, not `NaN`.

---

## Debugging Balance Issues

### Check which balance function is being called

In browser DevTools → Sources, add breakpoints to:
- `cashDrawerUpdateService.ts` → `getCurrentCashDrawerBalances` (session-scoped — should be the only display path)
- `balanceCalculation.ts` → `calculateCashDrawerBalance` (all-time — should NOT appear in display paths after the fix)

### Inspect cache state

```js
// In browser console:
window.__SPECIFY_DEBUG__ = true;
// Then trigger a balance read and look for CacheManager logs
```

### Inspect IndexedDB session data

1. DevTools → Application → IndexedDB → `POS_DATABASE` → `cash_drawer_sessions`
2. Check `status`, `opened_at`, `opening_amount`, `expected_amount` for the current session.
3. Check `cash_drawer_accounts` for `branch_id` and `current_balance` (should be `0` after fix 7.9).

### Check event log

```sql
-- In Supabase SQL Editor:
SELECT event_type, entity_id, created_at
FROM branch_event_log
WHERE branch_id = '<your_branch_id>'
  AND event_type = 'cash_drawer_transaction_posted'
ORDER BY created_at DESC
LIMIT 20;
```

---

## Key Files Reference

| File | Role in this feature |
|---|---|
| `utils/balanceCalculation.ts` | `calculateBothCurrencies` — NaN fix here |
| `lib/db.ts` | `getCurrentCashDrawerSession` — session sort fix here |
| `services/journalService.ts` | Cache invalidation added here |
| `services/cashDrawerUpdateService.ts` | Canonical balance function; TTL fix |
| `services/eventEmissionService.ts` | New `emitCashDrawerTransactionPosted` |
| `services/syncService.ts` | SYNC_DEPENDENCIES fix + new event wire |
| `contexts/OfflineDataContext.tsx` | Branch filter fix |
| `contexts/offlineData/useCashDrawerDataLayer.ts` | Frozen balance fix |
| `contexts/offlineData/useOfflineInitialization.ts` | Stale seed fix |
| `components/CurrentCashDrawerStatus.tsx` | Closed-state UI |
