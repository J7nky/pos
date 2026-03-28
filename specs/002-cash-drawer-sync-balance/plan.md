# Implementation Plan: Cash Drawer Sync & Balance Correctness

**Branch**: `002-cash-drawer-sync-balance` | **Date**: 2026-03-24 | **Spec**: [spec.md](./spec.md)  
**Input**: Feature specification from `specs/002-cash-drawer-sync-balance/spec.md`

---

## Summary

Fix nine confirmed bugs causing the cash drawer balance to display incorrectly, freeze at the opening float, show zero on second devices after sync, show NaN for single-currency transactions, and return different values on different screens. The approach unifies all display paths onto a single session-scoped balance function, adds cache invalidation after journal writes, fixes sync download ordering, adds a new real-time event type for intra-session transactions, and patches six targeted code bugs. No schema changes are required.

---

## Technical Context

**Language/Version**: TypeScript 5.x, React 18, Node.js ≥18  
**Primary Dependencies**: Dexie v4, Supabase JS v2, React Router 7, Tailwind CSS 3, Vite 7, Electron 38  
**Storage**: Supabase (PostgreSQL — remote); IndexedDB via Dexie v4 (local, primary)  
**Testing**: Vitest (unit tests, service layer only)  
**Target Platform**: Web (Netlify SPA) + Electron (Windows NSIS x64 desktop)  
**Project Type**: offline-first POS web-app + desktop-app  
**Performance Goals**: Works fully offline; syncs within seconds of reconnect; sub-100ms local reads from IndexedDB; balance display updates within 1 second of transaction  
**Constraints**: offline-capable, multi-currency (USD + LBP), multilingual (en/ar/fr), RTL layout, RBAC per branch, atomic financial transactions, no server-side ledger RPCs  
**Scale/Scope**: Single-store or multi-branch; 10–100 concurrent sessions per store

---

## Constitution Check

*GATE: Evaluated before Phase 1 design. Re-check after implementation.*

| Gate | Principle | Status | Notes |
|------|-----------|--------|-------|
| CG-01 | Offline-First Data Flow | ✅ PASS | All fixes operate via IndexedDB + service layer. No Supabase reads from UI introduced |
| CG-02 | UI Data Access Boundary | ✅ PASS | No new `lib/db` or `lib/supabase` imports in `pages/`, `components/`, or `layouts/` |
| CG-03 | Event-Driven Sync / Upload-Then-Emit | ✅ PASS | New `cash_drawer_transaction_posted` event emitted only from `syncService.uploadLocalChanges()` after confirmed upload. No `setInterval` added |
| CG-04 | Financial Atomicity via TransactionService | ✅ PASS | No new financial records created; feature fixes calculation/display of existing data only |
| CG-05 | Client-Side Ledger Computation | ✅ PASS | All balance computation remains client-side from IndexedDB journal entries. No new server RPCs |
| CG-06 | Branch-Level Isolation | ✅ PASS | Fix 7.4 specifically corrects a branch-isolation gap (wrong account returned in multi-branch). All queries gain explicit `branch_id` filtering |
| CG-07 | RBAC Enforcement | ✅ PASS | No new user operations introduced. Existing session open/close RBAC is unchanged |
| CG-08 | Double-Entry Accounting | ✅ PASS | No new journal entries created by this feature. Fixes read paths only |
| CG-09 | Schema Consistency | ✅ PASS | No new Supabase tables or columns. No Dexie version bump required. New event type is a value in existing `branch_event_log.event_type` string column |
| CG-10 | Multilingual by Default | ✅ PASS | "Closed" status message and "Open Cash Drawer" button text must use `getTranslatedString()` / `createMultilingualFromString()`. All i18n keys already exist or will be added in the UI polish phase |
| CG-11 | Local Date Extraction | ✅ PASS | Session-window calculation uses `new Date(session.opened_at)` (parsing a stored ISO string, not extracting "today"). No `new Date().toISOString().split('T')[0]` pattern introduced |

**Post-Constitution Check**: All 11 gates pass. No Complexity Tracking entries required.

---

## Project Structure

### Documentation (this feature)

```text
specs/002-cash-drawer-sync-balance/
├── plan.md              ← This file
├── research.md          ← Phase 0 findings (all 9 bugs investigated)
├── data-model.md        ← Entity shapes, field semantics, formula
├── quickstart.md        ← Developer setup and test guide
├── contracts/
│   ├── cash-drawer-event-contract.md      ← New event type contract
│   └── balance-calculation-contract.md   ← Canonical function contract
├── checklists/
│   └── requirements.md  ← Spec quality validation
└── tasks.md             ← Phase 2 output (/speckit.tasks — not created here)
```

### Source Code (affected files only — no new files)

```text
apps/store-app/src/
├── utils/
│   └── balanceCalculation.ts          ← Fix 7.6: || 0 guards in calculateBothCurrencies
├── lib/
│   └── db.ts                          ← Fix 7.7: sort open sessions by opened_at desc
├── services/
│   ├── journalService.ts              ← Fix 7.1: invalidate balance cache after createJournalEntry
│   ├── cashDrawerUpdateService.ts     ← Fix 7.1+7.2: reduce cache TTL; standardise balance model
│   ├── eventEmissionService.ts        ← Fix 7.5: add emitCashDrawerTransactionPosted
│   └── syncService.ts                 ← Fix 7.8: add cash_drawer_sessions to SYNC_DEPENDENCIES
├── contexts/
│   ├── OfflineDataContext.tsx         ← Fix 7.4+7.2: branch_id filter; session-scoped balance
│   └── offlineData/
│       ├── useCashDrawerDataLayer.ts  ← Fix 7.3: call refreshCashDrawerStatus after openCashDrawer
│       └── useOfflineInitialization.ts ← Fix 7.9: seed current_balance as 0
└── components/
    └── CurrentCashDrawerStatus.tsx    ← Verify "Closed" state with Open button (FR-002)
```

**Structure Decision**: All changes are targeted edits to existing files. No new source files. No new test files in this feature scope (service-layer unit tests for `calculateBothCurrencies` guard and `getCurrentCashDrawerBalances` are encouraged but not blocking).

---

## Implementation Phases

### Phase 1: Foundational Correctness (Bugs 7.6, 7.7, 7.9, 7.4)

Four isolated, low-risk, single-location fixes. Each can be verified independently.

#### 1.1 — Fix NaN in `calculateBothCurrencies` (Bug 7.6)

**File**: `apps/store-app/src/utils/balanceCalculation.ts`

**Change**: In the `calculateBothCurrencies` function, add `|| 0` guards to all four currency fields:

```ts
// Before (lines 44-51):
acc.USD += e.debit_usd - e.credit_usd;
acc.LBP += e.debit_lbp - e.credit_lbp;

// After:
acc.USD += (e.debit_usd || 0) - (e.credit_usd || 0);
acc.LBP += (e.debit_lbp || 0) - (e.credit_lbp || 0);
```

Also fix `calculateExpectedCashInSession` (lines 302–303):
```ts
// Before:
const inflows  = entries.reduce((sum, e) => sum + e.debit_usd, 0);
const outflows = entries.reduce((sum, e) => sum + e.credit_usd, 0);

// After:
const inflows  = entries.reduce((sum, e) => sum + (e.debit_usd || 0), 0);
const outflows = entries.reduce((sum, e) => sum + (e.credit_usd || 0), 0);
```

**Test**: Record an LBP-only transaction. USD balance must remain a valid number (not NaN).

---

#### 1.2 — Sort open sessions deterministically (Bug 7.7)

**File**: `apps/store-app/src/lib/db.ts`

**Change**: In `getCurrentCashDrawerSession` (around line 528), sort the `open` array before returning:

```ts
// After filtering:
const open = all.filter(sess => String(sess.status).trim().toLowerCase() === 'open');
// Add sort (new line):
open.sort((a, b) => new Date(b.opened_at).getTime() - new Date(a.opened_at).getTime());
return open[0] || null;
```

**Test**: Manually insert two `status='open'` sessions with different `opened_at` timestamps into IndexedDB. Verify `getCurrentCashDrawerSession` returns the newer one.

---

#### 1.3 — Seed `current_balance` as zero (Bug 7.9)

**File**: `apps/store-app/src/contexts/offlineData/useOfflineInitialization.ts`

**Change**: In `ensureCashDrawerAccountsSynced` (around line 130), replace:
```ts
current_balance: remoteAccount.current_balance || 0,
```
with:
```ts
current_balance: 0,
```

**Test**: Clear local IndexedDB. Boot the app online. Verify the seeded account row has `current_balance: 0`.

---

#### 1.4 — Fix wrong account lookup in multi-branch stores (Bug 7.4)

**File**: `apps/store-app/src/contexts/OfflineDataContext.tsx`

**Change**: In `getCurrentCashDrawerBalance` (line 437), replace the `store_id`-only query:
```ts
// Before:
const currentAccount = await getDB().cash_drawer_accounts
  .where('store_id').equals(sid).and(account => account.is_active).first();

// After:
const currentAccount = await getDB().cash_drawer_accounts
  .where('[store_id+branch_id]').equals([sid, currentBranchId])
  .and(account => account.is_active).first();
```

**Test**: In a two-branch store, switch between branches. Verify each branch displays its own account's currency and not the other branch's.

---

### Phase 2: Balance Model Unification + Cache (Bugs 7.1, 7.2, 7.3)

These three bugs are tightly coupled: unifying the model (7.2) + adding cache invalidation (7.1) + refreshing context state (7.3) must be done together for the live balance to be correct.

#### 2.1 — Invalidate balance cache after journal writes (Bug 7.1)

**File**: `apps/store-app/src/services/journalService.ts`

**Change**: At the end of `createJournalEntry()`, after entries are written to IndexedDB, add:
```ts
import { CacheManager, CacheKeys } from '../utils/cacheManager';
// Inside createJournalEntry, after successful write:
const balKey = CacheKeys.balance(storeId, branchId);
CacheManager.invalidate(balKey);
CacheManager.invalidate(`${balKey}_both`);
```

Both the singular (`getCurrentCashDrawerBalance`) and dual-currency (`getCurrentCashDrawerBalances`) cache keys must be invalidated.

---

#### 2.2 — Reduce balance cache TTL and standardise model (Bug 7.1 + 7.2)

**File**: `apps/store-app/src/services/cashDrawerUpdateService.ts`

**Changes**:
1. In `getCurrentCashDrawerBalance` (line 234): change `CacheManager.TTL.LONG` to `CacheManager.TTL.SHORT` (1 second).
2. In `getCurrentCashDrawerBalances` (line 288): change `CacheManager.TTL.LONG` to `CacheManager.TTL.SHORT`.
3. The `getCurrentCashDrawerBalance` (singular) currently calls the all-time `calculateCashDrawerBalance`. Replace this with a call to the session-scoped `getCurrentCashDrawerBalances`, returning the currency-appropriate value based on the account's `currency` field. This unifies the two models.

---

#### 2.3 — Fix `getCurrentCashDrawerStatus` to use session-scoped model (Bug 7.2)

**File**: `apps/store-app/src/lib/db.ts`

**Change**: In `getCurrentCashDrawerStatus` (line 749), replace:
```ts
const currentBalance = await calculateCashDrawerBalance(storeId, branchId, currency);
```
with a call to `cashDrawerUpdateService.getCurrentCashDrawerBalances(storeId, branchId)`, then pick the `USD` or `LBP` value based on `account.currency`. This ensures `refreshCashDrawerStatus` (which calls `getCurrentCashDrawerStatus`) reads the session-scoped value.

> **Note**: This creates a small circular import risk (`db.ts` → `cashDrawerUpdateService.ts` → `db.ts`). To avoid it, inline the session-scoped calculation directly in `getCurrentCashDrawerStatus`, or move the status method to `cashDrawerUpdateService.ts` entirely. The preferred approach is to **move `getCurrentCashDrawerStatus` logic into `cashDrawerUpdateService.ts`** (already the better home) and have `db.ts` delegate to it. The `useCashDrawerDataLayer` import of `cashDrawerUpdateService` is already a dynamic import, so this is clean.

---

#### 2.4 — Refresh balance state immediately after session open (Bug 7.3)

**File**: `apps/store-app/src/contexts/offlineData/useCashDrawerDataLayer.ts`

**Change**: In `openCashDrawer` (line 62), after `setCashDrawer({ currentBalance: amount, ... })`, immediately call `refreshCashDrawerStatus()`:

```ts
setCashDrawer({
  id: result.sessionId!,
  accountId: account.id,
  status: 'open',
  currentBalance: amount,   // temporary; will be overwritten by refreshCashDrawerStatus
  currency: (account as any).currency,
  lastUpdated: new Date().toISOString(),
});
// Add:
await refreshCashDrawerStatus();
```

With the cache now invalidated on journal writes (2.1) and TTL reduced to 1s (2.2), all subsequent CRUD operations will also trigger a fresh read via `refreshData()` → `refreshCashDrawerStatus()`.

**Test**: Open a session, immediately record a sale. Verify the balance shown includes the sale amount without requiring a page reload.

---

### Phase 3: Cross-Device Sync Correctness (Bugs 7.5, 7.8)

#### 3.1 — Fix sync download race condition (Bug 7.8)

**File**: `apps/store-app/src/services/syncService.ts`

**Change**: In `SYNC_DEPENDENCIES`, add `'cash_drawer_sessions'` to the dependency list of `'journal_entries'`:

```ts
// Before:
'journal_entries': ['stores', 'entities', 'chart_of_accounts', 'bills'],

// After:
'journal_entries': ['stores', 'entities', 'chart_of_accounts', 'bills', 'cash_drawer_sessions'],
```

This ensures `cash_drawer_sessions` is always downloaded before `journal_entries`. When `getCurrentCashDrawerBalances` runs after sync, the session window is present.

**Test**: On Device B, delete local `cash_drawer_sessions` data, trigger a sync, and immediately call `getCurrentCashDrawerBalances`. Verify it returns the correct balance (not zero).

---

#### 3.2 — Add `emitCashDrawerTransactionPosted` event (Bug 7.5)

**File**: `apps/store-app/src/services/eventEmissionService.ts`

**Change**: Add new method:
```ts
async emitCashDrawerTransactionPosted(
  storeId: string,
  branchId: string,
  transactionId: string,
  category: string,
  userId?: string
): Promise<void> {
  await this.emitEvent({
    store_id: storeId,
    branch_id: branchId,
    event_type: 'cash_drawer_transaction_posted',
    entity_type: 'transaction',
    entity_id: transactionId,
    operation: 'insert',
    user_id: userId,
    metadata: { category, branch_id: branchId },
  });
}
```

---

#### 3.3 — Wire new event into sync upload (Bug 7.5)

**File**: `apps/store-app/src/services/syncService.ts`

**Change**: In `uploadLocalChanges()`, in the `transactions` table upload handler, after the batch is confirmed uploaded, filter for cash-drawer transactions and emit the new event:

```ts
// After transactions batch confirmed uploaded:
const cashDrawerTransactions = uploadedRows.filter((t: any) =>
  t.category?.startsWith('cash_drawer_') ||
  ['supplier_payment', 'customer_payment', 'employee_payment'].includes(t.category)
);
for (const tx of cashDrawerTransactions) {
  await eventEmissionService.emitCashDrawerTransactionPosted(
    tx.store_id, tx.branch_id, tx.id, tx.category, tx.created_by
  );
}
```

**Note**: Follow the same emit pattern used by existing events in the upload handler. Do not emit for zero-row batches.

**Test**: On Device A, post a cash sale while Device B watches the `branch_event_log` in Supabase. Within 30 seconds, Device B's balance display should update.

---

### Phase 4: UI Polish (FR-002 — Closed State Display)

#### 4.1 — Verify "Closed" state UI in `CurrentCashDrawerStatus.tsx`

**File**: `apps/store-app/src/components/CurrentCashDrawerStatus.tsx`

**Check**: When `useOfflineData().cashDrawer === null` (no active session), the component must display:
- A "Closed" status label (i18n key: existing or new)
- An "Open Cash Drawer" action button

If the component already handles this state correctly, no code change is needed. If it renders a zero balance instead, add the closed-state branch.

#### 4.2 — Verify `Home.tsx` closed state

**File**: `apps/store-app/src/pages/Home.tsx`

**Check**: The Home dashboard cash drawer widget should show the "Closed" indicator when `cashDrawer === null`. Also: remove the `setInterval` polling for `loadCashDrawerStatus` (bug 1.5 from the report — this is the right opportunity to fix it since we're already touching the balance refresh path). Replace with reactive state from `useOfflineData().cashDrawer`.

#### 4.3 — i18n keys

If any new user-facing strings are introduced (e.g., "Cash Drawer Closed", "Open Cash Drawer"), add keys to all three locale files:
- `apps/store-app/src/i18n/en.json`
- `apps/store-app/src/i18n/ar.json`
- `apps/store-app/src/i18n/fr.json`

---

## Complexity Tracking

> No Constitution Check violations. No entries required.

---

## Risk Register

| Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|
| Circular import if `db.ts` imports `cashDrawerUpdateService` | Medium | Medium | Move `getCurrentCashDrawerStatus` into `cashDrawerUpdateService` instead of changing `db.ts`'s import graph |
| Cache invalidation missed for a new transaction path | Low | Medium | Invalidation is in `journalService.createJournalEntry` — the single entry point for all journal writes (CG-08). All financial paths go through it |
| `SYNC_DEPENDENCIES` change causes `cash_drawer_sessions` to re-download more often | Low | Low | Sessions are a small table; extra download is negligible |
| New event type floods `branch_event_log` for high-volume stores | Low | Low | One event per transaction; existing `sale_posted`/`payment_posted` volume is comparable. Bulk variant can be added later |
| Phase 4.2 `setInterval` removal breaks Home dashboard polling | Low | Low | `cashDrawer` state is already updated via `refreshData()` on CRUD; reactive reads work without polling |
