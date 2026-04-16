# Data Model: Undo System Hardening

**Feature**: 011-undo-system-fixes
**Date**: 2026-04-16

No IndexedDB schema change. No Supabase schema change. This document defines the **in-memory / storage payload** shapes used by the undo subsystem, plus the relationship to the existing `pending_syncs` outbox table.

---

## 1. UndoAction (single value stored in `sessionStorage['last_undo_action']`)

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `type` | `string` | Yes | Semantic action identifier. Stable key used for toast label lookup (see [contracts/undo-api.md](./contracts/undo-api.md)). Examples: `delete_bill`, `update_sale`, `add_inventory_batch`. |
| `affected` | `AffectedRecordRef[]` | Yes | All records this action touches; drives the validity check. |
| `steps` | `UndoStep[]` | Yes | Ordered reversal plan. Executed inside a single Dexie transaction. |
| `timestamp` | `number` | Yes | `Date.now()` at push time. Used by `UndoToastManager` to detect a new action (not for security). |
| `metadata` | `Record<string, unknown>` | No | Optional, operation-specific extra context (e.g., `quantityDifference`, `product_id`) — not interpreted by the undo executor. |

**Lifecycle**:
- **Created** by `pushUndo()` when a reversible operation completes.
- **Overwritten** by any subsequent `pushUndo()` (single-level).
- **Cleared** when: (a) undo executes successfully, (b) `checkUndoValidity()` finds the payload invalid, (c) `checkUndoValidity()` catches any error, (d) the tab/session closes.

---

## 2. AffectedRecordRef

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `table` | `string` | Yes | Logical table name. Legacy aliases `suppliers` / `customers` are mapped via `TABLE_NAME_MAP` → `entities`. |
| `id` | `string` | Yes | Primary-key value of the affected record. |

Used only for eligibility checking. Each entry is matched against IndexedDB at validity-check time.

---

## 3. UndoStep (union over four kinds)

Shared fields:

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `op` | `'delete' \| 'restore' \| 'add' \| 'update'` | Yes | Reversal kind. |
| `table` | `string` | Yes | Target table. |
| `id` | `string` | Usually | Target record primary key. On legacy `restore` steps it may be absent; the executor falls back to `step.record?.id`. |

Kind-specific fields:

| `op` | Additional fields | Executor behavior |
|------|-------------------|-------------------|
| `delete` | `transaction_id?: string` (only for `journal_entries` cascade) | Remove the record from `step.table`. Remove **all** `pending_syncs` rows for `(step.table, step.id)`. For `journal_entries` with `transaction_id`, cascade-delete every journal entry matching that transaction id (plus their outbox rows). |
| `restore` | `record: Record<string, unknown>` | `add(step.record)` to `step.table`. Remove `pending_syncs` rows matching `(step.table, recordId, operation='delete')`. **Enqueue** a new `pending_syncs` row `(step.table, recordId, operation='create', payload=step.record)`. `recordId := step.id ?? step.record?.id`. |
| `add` | `changes: Record<string, unknown>` (full record payload despite field name — alias for `restore`) | `add(step.changes)` to `step.table`. Same pending_syncs behavior as `restore`, with `recordId := step.id ?? step.changes?.id`. |
| `update` | `changes: Record<string, unknown>` (field subset) | `update(step.id, { ...step.changes, _synced: false })`. Remove `pending_syncs` rows matching `(step.table, step.id, operation='update')`. **Preserve** any `operation='create'` row so prior unsent creations still upload. |

**Validation rules** (enforced at execution time):
- `op` MUST be one of the four literals above. Unknown ops are skipped with a dev-mode warning.
- For `restore` / `add`: the record payload MUST carry an `id` that equals the corresponding `affected[i].id`. If not, the step is skipped and the undo is considered failed.
- For `update`: `step.changes` MUST NOT contain `id`. The executor explicitly merges `_synced: false` onto the payload regardless.

**State transitions** per step:

```
(delete)   record_present ──delete──▶ record_absent, outbox rows: all cleared
(restore)  record_absent  ──add───▶ record_present (_synced:false), outbox: 'delete' removed, 'create' queued
(add)      record_absent  ──add───▶ record_present (_synced:false), outbox: 'delete' removed, 'create' queued
(update)   record_present ──update─▶ record_present (reverted, _synced:false), outbox: 'update' rows removed
```

---

## 4. Relationship to `pending_syncs` (outbox — unchanged)

The existing `pending_syncs` table (see `apps/store-app/src/lib/db.ts` lines 197–200, 216–218) has the indexes:

```
id, table_name, record_id, operation, created_at, retry_count, status
```

Where `operation ∈ {'create', 'update', 'delete'}`.

**The undo subsystem is now a writer to `pending_syncs`:**
- `restore` / `add` steps call `getDB().addPendingSync(table, id, 'create', record)` to re-queue an uploaded-create for a previously-deleted record.
- `delete` / `update` / `restore` / `add` steps perform **targeted** deletions against `pending_syncs` (by `record_id` + `operation` filter), never the blanket `.where(record_id).delete()` used today.

No new columns. No new indexes. No new enum values.

---

## 5. Toast state (in-memory, `UndoToastManager.tsx`)

| State | Type | Purpose |
|-------|------|---------|
| `visible` | `boolean` | Whether the toast is rendered. |
| `undoing` | `boolean` | True while `undoLastAction()` promise is in flight. |
| `feedback` | `string \| null` | Post-click result message; null when no feedback is active. |
| `feedbackType` | `'success' \| 'error' \| null` | **New.** Explicit success/failure flag driving toast color, replacing locale-string comparison. |
| `progress` | `number` (0–100) | Auto-hide countdown indicator. |

Refs:
- `lastUndoTimestamp` — last `action.timestamp` that produced a visible toast. Prevents duplicate toasts on `canUndo` re-renders for the same action.
- `autoHideTimer` / `progressTimer` — cleanup timers for the 8-second window.

No persistence — all of the above is volatile.

---

## 6. Constants

| Name | Value | Purpose |
|------|-------|---------|
| `UNDO_STORAGE_KEY` | `'last_undo_action'` | Key in `sessionStorage`. |
| `UNDO_TOAST_DURATION_MS` | `8000` | Auto-hide window. |
| `UNDO_FEEDBACK_DURATION_MS` | `2000` | Feedback banner display time. |
| `TABLE_NAME_MAP` | `{ suppliers: 'entities', customers: 'entities' }` | Legacy-alias → current-table. Shared by `undoOperations` and `checkUndoValidity`. |
| `CASH_DRAWER_EXEMPT_TABLE` | `'cash_drawer_accounts'` | The only table that may be undone after `_synced=true`. |

These are module-local constants, not persisted or exported outside the undo subsystem.
