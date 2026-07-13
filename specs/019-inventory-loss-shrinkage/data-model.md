# Phase 1 Data Model: Inventory Loss & Shrinkage

Schema changes for Dexie **v70 → v71** and the matching Supabase migration. Complies with **CG-09** (store_id/created_at/updated_at + `_synced`/`_lastSyncedAt`/`_deleted` on all sync tables).

---

## 1. New entity: `inventory_loss_events`

One row per recorded loss, scoped to a single lot (`inventory_item`).

| Field | Type | Notes |
|---|---|---|
| `id` | string (uuid) | PK |
| `store_id` | string | scope (CG-06) |
| `branch_id` | string | scope (CG-06) |
| `inventory_item_id` | string | FK → `inventory_items.id` (the lot) |
| `product_id` | string | denormalized for reporting |
| `batch_id` | string \| null | FK → `inventory_bills.id` (the delivery/bill) |
| `reason` | `'shrinkage' \| 'lost' \| 'spoiled'` | shrinkage = auto weight; lost/spoiled = manual units |
| `source` | `'auto_close' \| 'manual'` | how it was created |
| `quantity` | number | units lost (0/null for pure shrinkage) |
| `weight` | number \| null | weight lost — residual weight (shrinkage) or attributed proportional weight (unit loss) |
| `unit_cost` | number | snapshot of the lot's cost basis at time of loss |
| `currency` | CurrencyCode | the lot's currency |
| `loss_value` | number | snapshot: `weight × unit_cost/kg` or `quantity × unit_cost` |
| `is_commission` | boolean | true → memo-only, `transaction_id` null |
| `transaction_id` | string \| null | FK → `transactions.id`; null for commission (R6) |
| `status` | `'active' \| 'reversed'` | lifecycle (R10) |
| `reversal_of_id` | string \| null | set on a reversal row → original loss |
| `reversed_by_id` | string \| null | set on the original → its reversal |
| `notes` | string \| null | optional operator note |
| `created_by` | string | user id (actor) |
| `created_at` | string (ISO) | CG-09 |
| `updated_at` | string (ISO) | CG-09 |
| `_synced` | boolean | CG-09 |
| `_lastSyncedAt` | string | CG-09 |
| `_deleted` | boolean | CG-09 |

**Dexie store string (v71)**:
```
inventory_loss_events:
  'id, store_id, branch_id, inventory_item_id, batch_id, product_id, reason, source, status, transaction_id, created_at, [store_id+branch_id], _synced, _deleted'
```

**Validation rules**
- `reason='shrinkage'` ⇒ `source='auto_close'` and `weight > 0` (quantity may be 0).
- `reason∈{lost,spoiled}` ⇒ `quantity > 0` and `quantity ≤` lot on-hand `quantity` at time of record (FR-010).
- `is_commission=true` ⇒ `transaction_id IS NULL`; `is_commission=false` ⇒ `transaction_id` set (unless reversed).
- `loss_value ≥ 0`; a lot's cumulative active loss_value + COGS MUST NOT exceed received value (FR-006 no over-write-off).
- A row with `status='reversed'` cannot be reversed again (FR-018).

**State transitions**
```
(create) → active ──reverse──▶ reversed   [terminal]
```
Reversal creates a second linked row (`reason` mirrored, `reversal_of_id` set) and flips the original to `reversed` via `reversed_by_id`.

---

## 2. Extended entity: `inventory_items` (new columns)

Additive columns; existing `weight` keeps its meaning (frozen received weight); existing `quantity` remains the live on-hand unit count.

| Field | Type | Notes |
|---|---|---|
| `weight_tracked` | boolean | immutable, set at receiving (Q1). Default from unit measurement type, operator-overridable |
| `weight_remaining` | number \| null | **live** on-hand weight; init = received `weight`; decremented per sale and by loss attribution (weight-tracked lots only) |
| `nominal_unit_weight` | number \| null | `received weight ÷ received_quantity`, snapshot at receiving; used to attribute proportional weight to whole-unit losses (FR-004a) |

No index change required (queried via `[store_id+branch_id]`). Supabase: `ALTER TABLE inventory_items ADD COLUMN weight_tracked boolean NOT NULL DEFAULT false, ADD COLUMN weight_remaining numeric, ADD COLUMN nominal_unit_weight numeric;`

**Derived quantities (not stored)**
- `sold_weight(lot) = received weight − weight_remaining` (weight-tracked).
- `unaccounted_units(lot) = received_quantity − sold_units − Σ active unit-losses` — computed at close (FR-011). Blocks close while `> 0`.
- `residual_shrinkage_weight(lot) = weight_remaining − Σ(active unit-loss.weight)` — booked automatically at close for weight-tracked lots (FR-005).

---

## 3. Extended: Chart of accounts

Append to `DEFAULT_CHART_OF_ACCOUNTS` and seed into existing stores' `chart_of_accounts` idempotently:

```
{ account_code: '5950', account_name: 'Inventory Loss / Shrinkage', account_type: 'expense', requires_entity: false, is_active: true }
```

---

## 4. Extended: transaction category & mapping

- `TRANSACTION_CATEGORIES.INVENTORY_LOSS = 'Inventory Loss / Shrinkage'` → `CATEGORY_TO_TYPE_MAP[...] = EXPENSE`.
- `accountMapping[INVENTORY_LOSS] = { debitAccount: '5950', creditAccount: '1300', description: 'Inventory loss / shrinkage recorded', requiresEntity: false, defaultEntityCode: SYSTEM_ENTITY_CODES.INTERNAL }`.

---

## 5. Extended: audit action & event type

- `AuditAction` += `'inventory_loss_recorded'`, `'inventory_loss_reversed'`.
- branch event `event_type: 'inventory_loss_posted'`, `entity_type: 'transaction'` (owned) or `'inventory_loss_event'` (commission memo), emitted by `syncService` after upload (R7).

---

## 6. Relationships

```
inventory_bills (1) ──< inventory_items (1) ──< inventory_loss_events (N)
                                   │                       │
                                   │                       └──(0..1)── transactions ──< journal_entries (2, balanced)
                                   └── weight_tracked / weight_remaining / nominal_unit_weight
```
- A loss belongs to exactly one lot; a lot belongs to one bill.
- An owned loss produces exactly one transaction (two balanced journal lines: Dr 5950 / Cr 1300); a commission loss produces none.
- A reversal loss row links to its original; the reversing transaction links via `is_reversal`/`reversal_of_transaction_id`.
