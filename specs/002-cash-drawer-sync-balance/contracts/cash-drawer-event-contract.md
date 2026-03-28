# Contract: Cash Drawer Event — `cash_drawer_transaction_posted`

**Feature**: 002-cash-drawer-sync-balance  
**Date**: 2026-03-24  
**Table**: `branch_event_log` (existing — no schema change)

---

## Purpose

Enables second devices to receive near-real-time notification when a balance-affecting
cash drawer transaction is posted on another device, without waiting for the full
5-minute catch-up cycle.

---

## Event Schema

This event follows the standard `branch_event_log` row shape used by all existing events:

```ts
{
  store_id:    string;          // The store this transaction belongs to
  branch_id:   string;          // The branch this transaction belongs to
  event_type:  'cash_drawer_transaction_posted';
  entity_type: 'transaction';
  entity_id:   string;          // transaction.id — used by Device B to fetch the record
  operation:   'insert';
  user_id?:    string;          // Optional: who posted the transaction
  metadata?: {
    category:  string;          // e.g. 'cash_drawer_sale', 'cash_drawer_expense', 'supplier_payment'
    branch_id: string;          // Repeated for filtering convenience on Device B
  };
}
```

---

## Emit Rules (Upload-Then-Emit Contract — CG-03)

1. **Where**: Emitted exclusively from `syncService.uploadLocalChanges()`, inside the `transactions` table upload batch handler.
2. **When**: After the batch of `transactions` rows is confirmed uploaded to Supabase — never from the local write path.
3. **Which transactions**: Only rows whose `category` starts with `'cash_drawer_'` OR whose `category` is one of the known cash-impacting categories (`TRANSACTION_CATEGORIES.CASH_DRAWER_EXPENSE`, `CASH_DRAWER_SALE`, `SUPPLIER_PAYMENT`, `CUSTOMER_PAYMENT`, etc.).
4. **Frequency**: One event per transaction row in the batch. If a batch contains 5 cash drawer transactions, 5 events are emitted (or a single bulk event if `emitCashDrawerTransactionsBulkPosted` is added in future).

---

## Service Method Signature

Added to `services/eventEmissionService.ts`:

```ts
/**
 * Emit cash_drawer_transaction_posted event.
 * Called by syncService.uploadLocalChanges() AFTER the transactions
 * table batch is confirmed uploaded to Supabase — never from local writes.
 */
async emitCashDrawerTransactionPosted(
  storeId: string,
  branchId: string,
  transactionId: string,
  category: string,
  userId?: string
): Promise<void>
```

---

## Consumer Behaviour on Device B

When Device B's `eventStreamService` receives a `cash_drawer_transaction_posted` event:

1. `entity_type = 'transaction'`, `entity_id = transactionId` → fetch that transaction row from Supabase and upsert into IndexedDB.
2. Trigger `onEventsProcessed` callback → `useEventStreamLifecycle` → `refreshData()`.
3. `refreshData()` calls `refreshCashDrawerStatus()` on `useCashDrawerDataLayer`.
4. `refreshCashDrawerStatus()` calls `db.getCurrentCashDrawerStatus()` → invokes the session-scoped balance calculation → updates `cashDrawer.currentBalance` in React context.
5. All components reading `useOfflineData().cashDrawer` re-render with the updated balance.

This flow must complete within ~30 seconds of the original transaction being posted on Device A (including sync upload time + Realtime WebSocket latency + Device B's IndexedDB write).

---

## Existing Events Not Replaced

`cash_drawer_transaction_posted` supplements — it does not replace — the existing:
- `sale_posted` (entity_type: `sale`)
- `payment_posted` (entity_type: `payment`)
- `transaction_updated` / `journal_entry_created`

The existing events continue to serve their original purpose (inventory, entity balance, etc.). `cash_drawer_transaction_posted` is specifically for the cash drawer balance display path.

---

## Relationship to `eventStreamService` Entity Handling

`eventStreamService` dispatches fetches based on `entity_type`. The new `'transaction'` entity type in a `cash_drawer_transaction_posted` event resolves to fetching from the `transactions` Supabase table by `entity_id`. This matches the existing `sale_posted` fetch path — the same fetch logic applies.
