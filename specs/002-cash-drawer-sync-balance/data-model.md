# Data Model: Cash Drawer Sync & Balance Correctness

**Branch**: `002-cash-drawer-sync-balance`  
**Date**: 2026-03-24

> No new Supabase tables or Dexie tables are introduced by this feature.
> All existing tables are used as-is. This document records the canonical
> shape of affected entities and clarifies field semantics that this feature
> depends on or corrects.

---

## 1. `cash_drawer_sessions`

**Supabase table** / **Dexie table** (schema v54, `lib/db.ts:167`)

```
Dexie index string:
  'id, store_id, branch_id, opened_by, opened_at, closed_at, status,
   [store_id+branch_id], [store_id+branch_id+status], _synced, _deleted'
```

| Field | Type | Semantics |
|---|---|---|
| `id` | `string` (UUID) | Primary key |
| `store_id` | `string` | Owning store |
| `branch_id` | `string` | Owning branch — **required for all queries** |
| `account_id` | `string` | FK → `cash_drawer_accounts.id` |
| `status` | `'open' \| 'closed'` | Session lifecycle state |
| `opened_at` | ISO-8601 string | When the session was started |
| `opened_by` | `string` | User ID who opened |
| `opening_amount` | `number` | Cash float entered at open — **the authoritative starting point for balance calculation** |
| `closed_at` | ISO-8601 string \| `null` | When the session was closed |
| `closed_by` | `string \| null` | User ID who closed |
| `expected_amount` | `number \| null` | Written at close: `opening_amount` + sum of all session transactions. **The authoritative closing balance for past sessions.** |
| `actual_amount` | `number \| null` | Physical cash count entered by cashier at close |
| `variance` | `number \| null` | `actual_amount - expected_amount`. Non-zero means unrecorded transactions |
| `_synced` | `boolean` | Offline sync flag |
| `_deleted` | `boolean` | Soft-delete flag |

### Invariants enforced by this feature

- At any point in time, at most **one** session per `(store_id, branch_id)` should have `status = 'open'`. If two exist (sync conflict), the system deterministically selects the one with the **latest `opened_at`** (fix 7.7).
- `expected_amount` is only meaningful on closed sessions. It is computed at close time from `opening_amount + Σ(session journals)`, not from any stored balance field.
- Live balance for an open session = `opening_amount + Σ(posted journal entries for account 1100, created_at ∈ [opened_at, now))`.

---

## 2. `cash_drawer_accounts`

**Supabase table** / **Dexie table** (schema v54, `lib/db.ts:167`)

```
Dexie index string:
  'id, store_id, branch_id, currency, created_at, updated_at,
   [store_id+branch_id], [store_id+branch_id+currency], _synced, _deleted'
```

| Field | Type | Semantics |
|---|---|---|
| `id` | `string` (UUID) | Primary key |
| `store_id` | `string` | Owning store |
| `branch_id` | `string` | Owning branch — **required for all queries; use `[store_id+branch_id]` index** |
| `account_code` | `string` | Always `'1100'` for cash accounts |
| `name` | multilingual object | Human-readable account name |
| `currency` | `'USD' \| 'LBP'` | The primary currency this account operates in. Used to determine which currency the `opening_amount` applies to in dual-currency balance calculation |
| `is_active` | `boolean` | Whether the account is in use |
| `current_balance` | `number` | **LEGACY FIELD — do not use for balance display or atomics.** Was a cached running total; now always stale. All balance reads go through live journal-entry calculation |
| `_synced` | `boolean` | Offline sync flag |
| `_deleted` | `boolean` | Soft-delete flag |

### Constraints enforced by this feature

- Account lookup MUST use the `[store_id+branch_id]` compound index (not `store_id` alone). Queries using only `store_id` return the wrong branch's account in multi-branch stores (fix 7.4).
- When seeding a local account from Supabase (first boot, no local row), `current_balance` is seeded as `0`, not from the remote `current_balance` value (fix 7.9).

---

## 3. `journal_entries` (cash drawer subset)

Only entries with `account_code = '1100'` affect the cash drawer balance. This feature does not modify the journal entry schema; it corrects how these entries are queried.

| Field | Usage in balance calculation |
|---|---|
| `store_id` | Filter — must equal the current store |
| `branch_id` | Filter — must equal the current branch |
| `account_code` | Filter — must equal `'1100'` (cash) |
| `is_posted` | Filter — must be `true` |
| `created_at` | Session-window filter — must be `≥ session.opened_at` and `≤ session.closed_at` (or `now` if open) |
| `debit_usd` | Must be read as `debit_usd \|\| 0` to guard against `undefined` |
| `credit_usd` | Must be read as `credit_usd \|\| 0` |
| `debit_lbp` | Must be read as `debit_lbp \|\| 0` |
| `credit_lbp` | Must be read as `credit_lbp \|\| 0` |

The `|| 0` guard is required because LBP-only transactions may omit the USD fields entirely, producing `undefined` which propagates as `NaN` through arithmetic (fix 7.6).

---

## 4. `branch_event_log` (new event type)

**Existing Supabase table** (see `supabase/migrations/branch_event_log.sql`). No schema change required. A new `event_type` value is added:

| Field | New value |
|---|---|
| `event_type` | `'cash_drawer_transaction_posted'` |
| `entity_type` | `'transaction'` |
| `entity_id` | The `transaction.id` of the cash drawer transaction |
| `operation` | `'insert'` |
| `payload` | `{ transaction_id, branch_id, category }` — enough context for Device B to fetch the record |

This event is emitted from `syncService.uploadLocalChanges()` after the `transactions` table batch is confirmed uploaded, following the existing upload-then-emit contract (CG-03).

---

## 5. Canonical Balance Calculation Formula

### Live balance for an open session (display-time calculation)

```
live_balance(storeId, branchId, currency) =
  session.opening_amount  [if account.currency === currency, else 0]
  + Σ (entry.debit_{currency} || 0) - (entry.credit_{currency} || 0)
    for each journal_entry where:
      entry.store_id    = storeId
      entry.branch_id   = branchId
      entry.account_code = '1100'
      entry.is_posted   = true
      entry.created_at  ∈ [session.opened_at, now)
```

This is implemented by `cashDrawerUpdateService.getCurrentCashDrawerBalances()` (the canonical function).

### Closing balance for a past session (read from stored field)

```
past_balance = session.expected_amount
```

Written by `closeCashDrawerSession()` at close time; never recalculated after close.

---

## 6. No Schema Migration Required

| Check | Result |
|---|---|
| New Supabase tables | None |
| New Supabase columns | None |
| New Dexie tables | None |
| New Dexie indexes | None (all required indexes exist in v54) |
| Dexie version bump | **Not required** |
| SQL migration file | **Not required** |
| `crudHelperService` SYNC_TABLES addition | Not required (no new sync-enabled table) |
