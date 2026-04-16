# Research: Undo System Hardening

**Feature**: 011-undo-system-fixes
**Date**: 2026-04-16

## Scope

Resolve all unknowns in the plan's Technical Context and decide the approach for each contentious design choice. Everything below is grounded in the current codebase (reviewed against files listed in `plan.md` → Source Code) — no external research was required because this is a pure client-side refactor of existing code.

---

## D1. Storage scope for the pending undo payload

**Decision**: Use `sessionStorage` (per tab, per session) for the key `last_undo_action`.

**Rationale**:
- The current `localStorage` key is shared across all tabs on the same origin, which lets Tab A's action trigger an undo in Tab B (spec edge case "Tab focus switch mid-undo"; FR-013).
- `localStorage` persists indefinitely across browser sessions, causing a stale undo toast to flicker on startup (FR-014) until `checkUndoValidity` clears it. For records whose state changed between sessions, this briefly exposes the user to an inconsistent control.
- `sessionStorage` is (a) tab-scoped — isolates tabs by default; (b) session-scoped — cleared automatically when the tab closes.
- The existing `canUndo` initialization (`useState(() => !!localStorage.getItem(...))`) and all three read/write sites use a single key. Switching is a one-line change at each site.
- POS ergonomics: losing undo on page refresh is acceptable for a POS tab; cashiers reload rarely, and an action meaningfully predating the reload is almost always no longer the "last thing they meant to undo."

**Alternatives considered**:
- **Keep `localStorage` + add session marker + age check**: Adds complexity without fully solving the multi-tab case (two tabs opened in the same session would still share storage).
- **Use `BroadcastChannel` to coordinate across tabs**: Solves multi-tab notification but not storage scope; undo execution in the non-originating tab would still need to read the shared payload, which reintroduces the race. Higher complexity, no additional upside.
- **Use IndexedDB (Dexie) with a dedicated `undo_state` table**: Over-engineered for a single-key blob; adds a schema migration (violates "no schema change" in this plan) and synchronous-read performance is worse than `sessionStorage`.

---

## D2. Pending-sync (outbox) cleanup semantics per undo step

**Decision**: Each step kind performs its own targeted pending_syncs cleanup. Remove the current catch-all affected-items loop.

**Rationale**:
- `pending_syncs` is a true outbox with one row per `(record_id, operation)` pair (constitution §4.6; `db.ts` lines 197–200, 216–218). Operations are `create | update | delete`.
- Current behavior (`undoOperations.ts:69–84`) deletes *all* pending_syncs rows for each affected record at the end of the transaction — this destroys the pending `create` entry when we're only undoing a subsequent `update` or `delete`, leaving the record orphaned from upload (spec FR-004, FR-005).
- Correct per-step behavior:
  - **`delete` step** (undoing a creation): delete all pending_syncs rows for this record — we are fully withdrawing the record.
  - **`update` step** (undoing an edit): delete only `operation='update'` rows for this record — preserve any `operation='create'` row so the pre-edit record still uploads.
  - **`restore` step** (undoing a delete, full record payload in `step.record`): delete any `operation='delete'` rows, then enqueue a fresh `operation='create'` row with the restored record as payload.
  - **`add` step** (undoing a hard-delete, full record payload in `step.changes`): same as `restore`, just with a different field name carrying the record.

**Alternatives considered**:
- **Mark pending_syncs rows with an `undoable` flag at creation time**: would require schema change (new column) + migration. Over-engineered.
- **Retain the catch-all loop but exclude step IDs**: harder to reason about — two separate cleanup layers with partial overlap is exactly how the current bug slipped in.

---

## D3. `op: 'add'` step kind handling

**Decision**: Treat `'add'` as a sibling of `'restore'`. Both put a full record back; they differ only in which field carries the payload (`record` vs `changes`). Add `'add'` to the `UndoStep.op` union in the contract type.

**Rationale**:
- `inventoryItemOperations.ts:268` already emits `{ op: 'add', table, id, changes: originalItem }` but the undo executor only branches on `'delete' | 'restore' | 'update'`. Today this step silently drops — the inventory item stays deleted after "Undo".
- The contract type (`offlineDataContextContract.ts:89`) currently lists only three ops; TypeScript does not catch the miss because the emit site uses `any[]` for steps.
- Widening the union to `'delete' | 'restore' | 'add' | 'update'` and handling `'add'` in the executor (same logic as `'restore'` but using `step.changes` as the record payload) closes the gap with minimal surface change. Callers already emit this shape.

**Alternatives considered**:
- **Rewrite emit sites to use `'restore'` with `record`**: touches more files and risks regression; the dual alias with a shared handler is cheaper and backward-compatible for any in-flight session state.

---

## D4. Validity check: handling records that are expected to be absent

**Decision**: Build a set of `(table, id)` keys that are the targets of a `restore` or `add` step and skip existence/sync checks for those entries only. All other entries continue to require `present AND (not _synced OR table='cash_drawer_accounts')`.

**Rationale**:
- Current validity check (`undoOperations.ts:29–49`, mirrored in `OfflineDataContext.tsx:248–252`) rejects any undo whose `affected` contains a missing record. For `delete_sale` / hard-delete inventory, the deleted record is *supposed* to be missing, so undo always fails validation today (spec FR-009, acceptance scenario US1-3).
- Building the skip-set is O(steps) and the check runs rarely (button render + post-sync). Performance impact negligible.
- Step IDs may be absent on restore steps in legacy call sites (`saleOperations.ts:240` emits `{ op: 'restore', table, record }` with no explicit `id`). The skip-set must therefore derive the ID from `step.id ?? step.record?.id ?? step.changes?.id` to match what is in `affected`.

**Alternatives considered**:
- **Require every `restore` step to set `step.id` and break legacy callers**: higher blast radius. Not worth it when the fallback is trivial.

---

## D5. Error handling in `checkUndoValidity`

**Decision**: Wrap the body of `checkUndoValidity` in a try/catch. On any caught error: clear the storage key, `setCanUndo(false)`, log once at `console.error` with action type + reason. Never rethrow.

**Rationale**:
- `checkUndoValidity` runs from three places: `useOfflineInitialization.ts:395` after init, `useSyncStateLayer.ts:116` after every sync, and (indirectly) at component mount via `canUndo` state. A thrown error in any of these paths becomes an unhandled promise rejection that surfaces in DevTools and breaks the post-sync callback chain (spec FR-012).
- The only correct recovery is to treat the undo as invalid and discard it — we cannot safely attempt it with unknown state.
- Logging is still needed for diagnostics (FR-020) but must not leak record-level data.

**Alternatives considered**:
- **Pre-validate JSON shape with a schema**: overkill for one key. A try/catch around the read is smaller and catches more failure modes (unknown table, Dexie open errors, malformed rows).

---

## D6. Toast action-type label strategy

**Decision**: Map `action.type` (e.g., `'delete_bill'`, `'update_sale'`) → an i18n key (e.g., `common.labels.undoActions.delete_bill`) via a small lookup in `UndoToastManager.tsx`. Unknown types fall back to `common.labels.actionCompleted`.

**Rationale**:
- Spec FR-016 requires a human-readable description per action type.
- Action types are enumerable from the operation files (`billOperations`, `saleOperations`, etc.) and are stable identifiers (not UI strings). They are the correct i18n lookup keys.
- Fallback ensures forward-compatibility when a new operation ships without its label yet.
- Translations live in `i18n/locales/{en,ar,fr}.ts`, matching existing conventions (constitution §10).

**Action-type → label mapping** (English shown; `ar` and `fr` mirror):

| Action type | Label |
|-------------|-------|
| `delete_bill` | Bill deleted |
| `update_bill` | Bill edited |
| `complete_checkout` | Sale completed |
| `update_sale` | Sale edited |
| `delete_sale` | Sale deleted |
| `add_inventory_batch` | Inventory batch added |
| `update_inventory_batch` | Inventory batch edited |
| `delete_inventory_batch` | Inventory batch deleted |
| `apply_commission_rate` | Commission rate applied |
| `add_inventory_item` | Inventory item added |
| `update_inventory_item` | Inventory item edited |
| `delete_inventory_item` | Inventory item deleted |
| `add_product` | Product added |
| `update_product` | Product edited |
| `delete_product` | Product deleted |
| `add_customer` | Customer added |
| `update_customer` | Customer edited |
| `add_supplier` | Supplier added |
| `update_supplier` | Supplier edited |
| `add_employee` | Employee added |
| `update_employee` | Employee edited |
| `delete_employee` | Employee deleted |
| `update_branch` | Branch edited |
| `add_transaction` | Transaction added |
| `open_cash_drawer` | Cash drawer opened |
| `close_cash_drawer` | Cash drawer closed |
| `cash_drawer_transaction` | Cash drawer transaction |
| `supplier_advance_review` | Supplier advance recorded |
| `supplier_advance_update` | Supplier advance edited |
| `supplier_advance_delete` | Supplier advance deleted |

---

## D7. Explicit success/failure flag for feedback toast

**Decision**: Add a `feedbackType: 'success' | 'error' | null` state to `UndoToastManager`. `handleUndo` sets it alongside `feedback`. `getToastType()` reads it directly.

**Rationale**:
- Current code (`UndoToastManager.tsx:142`) compares the translated feedback string with `t('common.labels.actionUndone')` to decide the toast color. If translation ordering or key changes, this breaks silently (FR-017).
- A boolean/enum source of truth is trivial and removes the string dependency.

**Alternatives considered**: none worth noting.

---

## D8. Feedback toast visibility fix

**Decision**: When entering the feedback state in `handleUndo`, set `visible=true` and include a timer that clears both `feedback` and `visible` together after ~2s.

**Rationale**:
- Current flow sets `visible=false` then `setFeedback(...)` — the `Toast` returns `null` on `!visible`, so the green/red feedback banner **never renders** today. Spec FR-017 requires it. This is an existing latent bug, not introduced by us; the spec captures it under US3.

**Alternatives considered**:
- **Render a separate feedback toast overlay**: more DOM churn for no gain.

---

## D9. Auto-hide timer vs. in-flight undo

**Decision**: Keep the existing 8-second auto-hide. Clear the timer as the first action in `handleUndo` before awaiting `undoLastAction()`, so a click at t=7999ms still completes without racing the timer.

**Rationale**:
- Current code already clears the timer in `handleUndo` (lines 115–122), but clears *after* `await undoLastAction()`. If the timer fires during the await, visibility flickers. Move the clear to before the await.

**Alternatives considered**: none.

---

## D10. Dependency array hygiene in the visibility effect

**Decision**: Drop `visible` from the effect dependency array (`UndoToastManager.tsx:94`). Keep only `[canUndo, feedback]`.

**Rationale**:
- `visible` is written exclusively *within* the effect and in `handleUndo`; it is never read in a way that should re-trigger the effect. Including it makes the effect re-run on every open/close, creating unnecessary work and obscuring control flow. The `lastUndoTimestamp` guard makes this a no-op today, but the dep is still misleading.

**Alternatives considered**: refactor to useReducer — more churn than warranted for the bug at hand.

---

## D11. Dev-only `testUndo`

**Decision**: Guard `testUndo` with `import.meta.env.DEV` at its definition in `OfflineDataContext.tsx`. In production, the exported value is `undefined` (the type is already `testUndo?: () => void`).

**Rationale**:
- FR-019. The current function calls `pushUndo` with empty `affected: []` and `steps: []` — it passes validity (empty loop), triggers a toast, and runs `refreshData()` needlessly in production. Also, it is registered in the public context contract but is dev-only.

**Alternatives considered**:
- **Remove entirely**: blocks manual QA. Keeping it behind `DEV` is the right trade.

---

## D12. Table-name mapping consistency

**Decision**: Extract the `tableNameMap` (`{ suppliers: 'entities', customers: 'entities' }`) into a single module-level constant at the top of `undoOperations.ts` and import/reuse it from `checkUndoValidity` in `OfflineDataContext.tsx`.

**Rationale**:
- The map exists in `undoOperations.ts:24–27` but `checkUndoValidity` (OfflineDataContext.tsx:248) uses raw `item.table` and will throw at `db['suppliers']` for any legacy payload. Spec FR-006.
- A single source of truth guarantees the two code paths stay in sync.

**Alternatives considered**:
- **Delete the map entirely and require migration of legacy payloads**: breaks still-pending undo actions from before the schema unification. Cheap to keep.

---

## D13. No IndexedDB version bump required

**Decision**: No schema change. `pending_syncs` already has the `operation` index needed to filter by operation.

**Rationale**:
- Index `table_name, record_id, operation` already exists (`db.ts:197–200, 216–218`). Our new filter `.where('table_name').equals(x).filter(row => row.record_id === y && row.operation === z)` executes against existing indexes.
- Constitution §3.IX / CG-09 only fires when *new* tables/indexes are added.

**Alternatives considered**: none.

---

## D14. Performance: validity check cost

**Decision**: Keep existing per-affected Dexie `get()` calls. Do not batch.

**Rationale**:
- Typical `affected` list is 1–5 records. The validity check runs on button render and post-sync, not in a tight loop. Dexie indexed `get()` is sub-millisecond on local IndexedDB.
- Batching would complicate the skip-set logic for minimal gain.

**Alternatives considered**: `bulkGet()` — gain is negligible and code clarity suffers.

---

## D15. Non-goals confirmation

Re-confirmed out of scope (from spec):
- **Multi-level undo history**: explicitly rejected. Preserves current single-level overwrite semantics.
- **Redo**: not required; no state to support it is captured.
- **Cross-device undo**: impossible without a server-side coordination table; not requested.
- **Server-changed record conflict resolution**: handled by existing "record was synced" rejection path; we do not re-open this question.

---

## Unknowns after research

**None.** All plan Technical Context fields are resolved and every design choice has a decision with rationale.
