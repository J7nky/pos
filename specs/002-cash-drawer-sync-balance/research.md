# Research: Cash Drawer Sync & Balance Correctness

**Branch**: `002-cash-drawer-sync-balance`  
**Date**: 2026-03-24  
**Basis**: Static analysis of store-app source + IMPROVEMENTS_ENHANCEMENTS_REPORT.md §7

---

## 1. Current State — Balance Calculation Paths

### Decision: Two models currently exist; `getCurrentCashDrawerBalances` is canonical

**Rationale**: Two separate functions produce different numbers for "current balance":

| Function | File | Model | Used By |
|---|---|---|---|
| `calculateCashDrawerBalance(storeId, branchId, currency)` | `utils/balanceCalculation.ts:203` | All-time — sums ALL posted journal entries for account `1100`, no session filter | `db.getCurrentCashDrawerStatus`, `OfflineDataContext.getCurrentCashDrawerBalance`, `Accounting.tsx` |
| `getCurrentCashDrawerBalances(storeId, branchId)` | `services/cashDrawerUpdateService.ts:288` | Session-scoped — sums journals within current session window, adds opening float | `Home.tsx:194`, `CurrentCashDrawerStatus.tsx:166` |

`getCurrentCashDrawerBalances` (session-scoped model) is **correct** per spec FR-003 and the clarified data model (`cash_drawer_sessions.opening_amount` + session-windowed journal entries). It is the canonical model.

**Alternatives considered**:
- Keeping the all-time model as canonical: rejected. The all-time model accumulates across sessions — it would show a sum of all transactions ever recorded for account 1100, which is not the "current session balance" a cashier needs.
- Computing balance from `opening_amount` stored field: rejected. `opening_amount` exists and is the correct seed for session-scoped calculation, but the running balance within the session must still come from live journal entries.

---

## 2. Bug-by-Bug Findings

### 7.1 — Balance cache not invalidated (30-second stale)

**Finding**: `cashDrawerUpdateService.getCurrentCashDrawerBalance` and `getCurrentCashDrawerBalances` both use `CacheManager.withCache(key, CacheManager.TTL.LONG, ...)` where `TTL.LONG = 30_000 ms`. The balance cache keys are `CacheKeys.balance(storeId, branchId)` and that key + `_both`. `CacheManager.invalidate(key)` exists and works (`utils/cacheManager.ts:216`), but is never called from `journalService.createJournalEntry()` or any transaction commit path.

**Fix approach**: Call `CacheManager.invalidate` for both balance cache keys inside `journalService.createJournalEntry()` immediately after the entries are written. Alternatively reduce TTL to `TTL.SHORT` (1 s). Both together is safest.

**Decision**: Invalidate cache keys after each journal write AND reduce balance TTL from `TTL.LONG` to `TTL.SHORT` (1 s). The calculation is a fast IndexedDB indexed query; 1 second provides de-duplication for burst writes without meaningful lag.

---

### 7.2 — Two inconsistent balance models

**Finding**: Confirmed — see §1 above. `db.getCurrentCashDrawerStatus` (used by `useCashDrawerDataLayer.refreshCashDrawerStatus`) calls the all-time `calculateCashDrawerBalance`. `Home.tsx` and `CurrentCashDrawerStatus.tsx` call the session-scoped `getCurrentCashDrawerBalances`.

**Fix approach**: Replace all calls to `calculateCashDrawerBalance` in the balance-display path with `getCurrentCashDrawerBalances` (or a session-scoped equivalent). Specifically:
- `db.getCurrentCashDrawerStatus` at `lib/db.ts:749` → call `cashDrawerUpdateService.getCurrentCashDrawerBalances` (or inline the session-scoped logic).
- `OfflineDataContext.getCurrentCashDrawerBalance` at `OfflineDataContext.tsx:434` → replace with session-scoped call.

Note: `calculateCashDrawerBalance` is still valid for non-display uses (e.g. audit reconciliation). It should not be deleted, just removed from the live-balance display path.

---

### 7.3 — `cashDrawer.currentBalance` frozen at opening float

**Finding**: In `useCashDrawerDataLayer.ts`, `openCashDrawer` (line 62) sets context state directly: `setCashDrawer({ currentBalance: amount, ... })`. The `amount` here is the opening float. `refreshCashDrawerStatus` IS called by `refreshData()`, which IS triggered by post-CRUD callbacks. However:
1. The 30-second cache (7.1) means the refreshed value is still stale.
2. If `refreshData()` is not called (e.g. second device viewing balance, or immediately after `openCashDrawer`), the context state stays frozen.

**Fix approach**: After `openCashDrawer` sets the initial state, immediately call `refreshCashDrawerStatus()` to replace the frozen value with the live-calculated opening balance. Combined with fix 7.1 (cache invalidation), subsequent CRUD ops will also update the value within 1 second.

---

### 7.4 — Wrong account used in multi-branch stores

**Finding**: `OfflineDataContext.tsx:434-441`:
```ts
const currentAccount = await getDB().cash_drawer_accounts
  .where('store_id').equals(sid).and(account => account.is_active).first();
```
This uses the `store_id` index only. In a multi-branch store, it returns whichever active account appears first in iteration order — potentially a different branch's account. The `[store_id+branch_id]` compound index exists in the Dexie schema (`lib/db.ts:167`).

**Fix approach**: Replace the query with:
```ts
.where('[store_id+branch_id]').equals([sid, currentBranchId])
.and(account => account.is_active).first()
```

---

### 7.5 — No real-time event for intra-session cash transactions

**Finding**: `eventEmissionService.ts` has 18 event types. Cash drawer-specific events are only `cash_drawer_session_opened` and `cash_drawer_session_closed`. There is no event emitted when a sale, payment, or cash adjustment changes the balance within an active session. Second devices receive the balance change only when the `transactions` table syncs, which goes through the 5-minute catch-up interval.

The constitution (§III, CG-03) mandates: events emitted by `syncService.uploadLocalChanges()` AFTER confirmed upload only. A new event type `cash_drawer_transaction_posted` must be added and wired into the upload batch for the `transactions` table.

**Fix approach**:
1. Add `emitCashDrawerTransactionPosted(storeId, branchId, transactionId, userId?)` to `eventEmissionService.ts`.
2. In `syncService.uploadLocalChanges()`, after the `transactions` table batch is confirmed uploaded, filter for cash-drawer transactions (`category.startsWith('cash_drawer_')`) and emit `cash_drawer_transaction_posted` for each (or one bulk event per batch).
3. On Device B: `eventStreamService` processes the event, fetches the transaction from Supabase, upserts into IndexedDB, then calls `refreshData()` → `refreshCashDrawerStatus()` → live balance recalculated.

**Note on 30-second target**: The event is emitted after the next `syncService.sync()` run on Device A (debounced, typically within a few seconds of the transaction). Device B receives it via Realtime WebSocket within 1-2 seconds. Total end-to-end: typically under 10 seconds for online devices. The 30-second target from the spec is conservative and achievable.

---

### 7.6 — NaN balance from missing `|| 0` guards

**Finding**: `balanceCalculation.ts:44-51` (`calculateBothCurrencies`):
```ts
acc.USD += e.debit_usd - e.credit_usd;
acc.LBP += e.debit_lbp - e.credit_lbp;
```
No `|| 0` guards. A journal entry with `debit_usd: undefined` produces `NaN`. By contrast, `calculateBalance` (line 24) correctly uses `(e.debit_usd || 0)`.

Also found: `calculateExpectedCashInSession` (line 302):
```ts
const inflows = entries.reduce((sum, e) => sum + e.debit_usd, 0);
```
Same issue.

**Fix approach**: Add `|| 0` to all four fields in `calculateBothCurrencies` and in `calculateExpectedCashInSession`. Smallest, safest fix — 4 lines.

---

### 7.7 — Non-deterministic session selection with duplicate open sessions

**Finding**: `db.getCurrentCashDrawerSession` (`lib/db.ts:528-531`):
```ts
const open = all.filter(sess => String(sess.status).trim().toLowerCase() === 'open');
return open[0] || null;
```
`all` is retrieved via `[store_id+branch_id]` compound index — iteration order is by insertion into IndexedDB, not by `opened_at`. If two `open` sessions exist (sync conflict), `open[0]` may return the older one.

**Fix approach**: Sort `open` by `opened_at` descending before taking `[0]`:
```ts
open.sort((a, b) => new Date(b.opened_at).getTime() - new Date(a.opened_at).getTime());
return open[0] || null;
```
This is a one-line insertion. No schema change needed.

---

### 7.8 — Sync download race: journal entries arrive before session row

**Finding**: In `SYNC_TABLES` (`syncService.ts:52-77`):
- `journal_entries` is at index 15.
- `cash_drawer_sessions` is at index 19.

`SYNC_DEPENDENCIES` for `journal_entries`: `['stores', 'entities', 'chart_of_accounts', 'bills']`. `cash_drawer_sessions` is NOT listed as a dependency of `journal_entries`. So sessions always download after journals.

When `getCurrentCashDrawerBalances` runs after sync, it looks for an open session first. If `cash_drawer_sessions` hasn't arrived yet, it returns `{ USD: 0, LBP: 0 }`.

**Fix approach**: Add `'cash_drawer_sessions'` to the SYNC_DEPENDENCIES entry for `'journal_entries'`. This ensures sessions are downloaded before journals in every sync run, so the session window is available when balance is calculated.

```ts
'journal_entries': ['stores', 'entities', 'chart_of_accounts', 'bills', 'cash_drawer_sessions'],
```

---

### 7.9 — Stale `current_balance` seeded from Supabase

**Finding**: `useOfflineInitialization.ts:124-137` builds the local account row from Supabase:
```ts
current_balance: remoteAccount.current_balance || 0,
```
`remoteAccount.current_balance` is whatever was last uploaded from a previous device — it may be hours or days old. Undo atomics and some balance paths read `account.current_balance` as a baseline.

**Fix approach**: Seed with `current_balance: 0`. The running balance is always derived from journal entries; the `current_balance` field on the account row is a legacy field that should not be used for display or atomics.

---

## 3. Schema Analysis

**No new Supabase tables or IndexedDB tables required.** All changes are:
- Code-level fixes in service, utility, and context files.
- One new event type (`cash_drawer_transaction_posted`) in `branch_event_log` — the table already exists and accepts any `event_type` string.
- No Dexie version bump needed (no new tables or indexes; existing `[store_id+branch_id]` index on `cash_drawer_accounts` is already in schema v54).

---

## 4. Affected Files Summary

| File | Changes | Bug(s) |
|---|---|---|
| `utils/balanceCalculation.ts` | Add `|| 0` guards in `calculateBothCurrencies` and `calculateExpectedCashInSession` | 7.6 |
| `lib/db.ts` | Sort open sessions by `opened_at` desc in `getCurrentCashDrawerSession` | 7.7 |
| `services/journalService.ts` | Invalidate balance cache keys after `createJournalEntry` | 7.1 |
| `services/cashDrawerUpdateService.ts` | Reduce balance cache TTL from `LONG` to `SHORT`; replace all-time model with session-scoped in `getCurrentCashDrawerBalance` | 7.1, 7.2 |
| `services/eventEmissionService.ts` | Add `emitCashDrawerTransactionPosted` method | 7.5 |
| `services/syncService.ts` | Add `cash_drawer_sessions` to SYNC_DEPENDENCIES of `journal_entries` | 7.8 |
| `contexts/OfflineDataContext.tsx` | Fix account query to use `[store_id+branch_id]` index; replace singular balance call with session-scoped | 7.4, 7.2 |
| `contexts/offlineData/useCashDrawerDataLayer.ts` | Call `refreshCashDrawerStatus` immediately after `openCashDrawer` sets state | 7.3 |
| `contexts/offlineData/useOfflineInitialization.ts` | Seed `current_balance: 0` instead of remote stale value | 7.9 |
| `components/CurrentCashDrawerStatus.tsx` | Verify "Closed" state shows status message + "Open Cash Drawer" button | FR-002 |

No new files need to be created. `eventEmissionService.ts` gets one new method; `syncService.ts` gets one new event emission call for cash drawer transactions.

---

## 5. Decisions Log

| Decision | Rationale | Alternative Rejected |
|---|---|---|
| `getCurrentCashDrawerBalances` (session-scoped) is the single canonical model | Matches FR-003: balance = opening float + session transactions only | All-time model: accumulates across sessions, wrong for active-session display |
| Invalidate cache after each journal write + reduce TTL to 1s | Ensures balance is fresh within 1 second after any transaction; balanceCalculation is a fast IndexedDB indexed query | Remove cache entirely: acceptable but adds minor CPU cost for very rapid transactions |
| Move `cash_drawer_sessions` earlier in sync dependency chain | Ensures sessions always precede journals in download; prevents zero-balance on sync | Trigger refreshData after all sync tables complete: would work but is a larger change to sync orchestration |
| New event emitted from `syncService` after upload (upload-then-emit) | Follows CG-03; guarantees the transaction row exists in Supabase when Device B fetches it | Emit from local write: violates CG-03; race condition if Device B fetches before upload |
| No Dexie schema version bump | No new tables or indexes needed; all required indexes already exist in v54 | Adding new indexes for session-time queries: unnecessary given existing `[store_id+branch_id]` compound index |
