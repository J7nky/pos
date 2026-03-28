# Contract: Canonical Balance Calculation

**Feature**: 002-cash-drawer-sync-balance  
**Date**: 2026-03-24

---

## Purpose

Establishes `cashDrawerUpdateService.getCurrentCashDrawerBalances()` as the single,
authoritative function for computing the live cash drawer balance. All display paths
MUST use this function (or `db.getCurrentCashDrawerStatus()` which delegates to it).
No other balance computation path may be used for display.

---

## Canonical Function

```ts
// services/cashDrawerUpdateService.ts
cashDrawerUpdateService.getCurrentCashDrawerBalances(
  storeId: string,
  branchId: string
): Promise<{ USD: number; LBP: number }>
```

### Behaviour contract

1. Fetches the current open session for `(storeId, branchId)` using `db.getCurrentCashDrawerSession()`.
2. If no open session exists → returns `{ USD: 0, LBP: 0 }`. **Callers that display a balance MUST show "Closed" status instead of a zero number when no session is open.**
3. Fetches all posted journal entries for account `1100` within `[session.opened_at, now)` for the branch.
4. Applies `|| 0` guards on all four currency fields before arithmetic.
5. Adds `session.opening_amount` to the currency matching `account.currency`.
6. Returns `{ USD, LBP }` — both values are always valid numbers (never `NaN`, never `undefined`).
7. Result is cached for **1 second** (TTL.SHORT). Cache is invalidated immediately whenever a new journal entry is written.

---

## Functions That MUST Use the Canonical Function

| File | Location | Required Change |
|---|---|---|
| `contexts/OfflineDataContext.tsx` | `getCurrentCashDrawerBalance` (line 434) | Replace `calculateCashDrawerBalance` call with `getCurrentCashDrawerBalances`, return the currency-appropriate value |
| `lib/db.ts` | `getCurrentCashDrawerStatus` (line 749) | Replace `calculateCashDrawerBalance` call with `cashDrawerUpdateService.getCurrentCashDrawerBalances` |

---

## Functions That Are NOT in the Display Path (No Change Required)

| Function | Use case | Notes |
|---|---|---|
| `calculateCashDrawerBalance(storeId, branchId, currency)` | Audit, reconciliation, non-display calculations | All-time model is correct for audit; do not delete |
| `calculateBothCurrencies(entries)` | Internal utility called by `getCurrentCashDrawerBalances` | Gets the `|| 0` fix but no behavioral change |
| `reconcileCashDrawerBalance(...)` | Admin reconciliation tool | Not a display path; no change |

---

## Cache Invalidation Contract

When `journalService.createJournalEntry()` writes a new journal entry, it MUST call:

```ts
CacheManager.invalidate(CacheKeys.balance(storeId, branchId));
CacheManager.invalidate(`${CacheKeys.balance(storeId, branchId)}_both`);
```

This ensures that the next balance read after any transaction reflects the new entry
within the 1-second TTL window (rather than serving a 30-second stale result).

---

## "Closed" State Display Contract (FR-002 Clarification)

When `getCurrentCashDrawerBalances` returns `{ USD: 0, LBP: 0 }` due to no open session,
the calling component MUST NOT display these zeros as a balance. Instead, it MUST display:

- A **"Closed"** status indicator
- An **"Open Cash Drawer"** button / action

This applies to all screens: Home dashboard, POS screen, accounting panels. Components
can detect the closed state via `useOfflineData().cashDrawer === null` (which is set to
`null` by `useCashDrawerDataLayer` when `refreshCashDrawerStatus` finds no active session).
