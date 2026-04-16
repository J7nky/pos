# Quickstart: Verifying the Undo System Hardening

**Feature**: 011-undo-system-fixes
**Date**: 2026-04-16

This is a manual verification guide. Run it end-to-end after `/speckit.implement` completes to validate the spec's acceptance scenarios and success criteria.

---

## Prereqs

```bash
# From repo root
pnpm install
pnpm dev:store         # or pnpm dev:electron
```

Open two Chromium-based browser tabs at `http://localhost:5173` (Tab A and Tab B) and sign in to the same store in both.

---

## US1 — Undoing a deletion actually restores and syncs the record (P1)

### US1-1 — Restore a previously-synced sale line

1. In Tab A, create a bill with one line. Click **Sync Now** and wait for the unsynced count to hit 0.
2. Delete that bill's line item.
3. Within 8s, click **Undo** in the toast.
4. **Expect**: The line item reappears in the UI; the unsynced count becomes ≥1.
5. Click **Sync Now**.
6. Open the Supabase dashboard → `bill_line_items` → confirm the restored row is present with the original data.

### US1-2 — Restore an unsynced, just-created inventory item

1. Go offline (DevTools → Network → Offline).
2. Add an inventory item via Inventory → Receive.
3. Delete the item you just added.
4. Click **Undo**.
5. **Expect**: Item present locally; `pending_syncs` (inspect via DevTools → Application → IndexedDB → `pending_syncs`) contains one row for this item with `operation='create'`.
6. Go online and **Sync Now**.
7. **Expect**: Item appears in Supabase.

### US1-3 — Undo button is enabled even when the record was removed

1. Delete any record.
2. **Expect**: The undo toast appears and the **Undo** button is clickable. Clicking it does **not** show "Action failed".

---

## US2 — Undoing an edit preserves prior upload state (P1)

1. Go offline.
2. Create a product (never synced).
3. Edit the product's price.
4. Click **Undo** on the edit.
5. **Expect**: The product reverts to its original price. In IndexedDB → `pending_syncs`, there is still a `create` row for this product (the `update` row was removed).
6. Go online and **Sync Now**.
7. **Expect**: The product appears in Supabase with the **original** (pre-edit) values.

### US2-2 — Revert a synced edit

1. Create and sync a product.
2. Edit its name.
3. Click **Undo**.
4. **Expect**: Product reverts to the synced name; `_synced=false`; a `pending_syncs` row with `operation='update'` is **absent** (we removed it, and there should be no new one because the values match what's on the server). *(Implementation may leave a no-op update row — see acceptance criteria: the observable outcome is that after next sync, the server value is unchanged.)*
5. **Sync Now**.
6. **Expect**: Server value is unchanged from the originally-synced value.

---

## US3 — Undo surface is clear, trustworthy, and predictable (P2)

1. Perform each of the following operations and record the toast text:
   - Delete a bill → **Expect**: "Bill deleted"
   - Edit a bill → **Expect**: "Bill edited"
   - Delete a sale line → **Expect**: "Sale deleted"
   - Add an inventory batch → **Expect**: "Inventory batch added"
   - Edit a product → **Expect**: "Product edited"
   - Open cash drawer → **Expect**: "Cash drawer opened"
2. Switch language to Arabic via Settings. Repeat step 1. **Expect**: All labels render in Arabic.
3. Click **Undo** on any action; immediately after, a green banner reads "Action undone" and auto-hides in ~2s.
4. Force a failure: corrupt `sessionStorage['last_undo_action']` (set it to `"{not json"` in DevTools), then click **Undo** via a stale toast instance if possible; or: create a state where the affected record is synced (not cash drawer). **Expect**: Red banner "Action failed" for ~2s.
5. Perform an action, wait 8s without clicking. **Expect**: Toast auto-hides; **Undo** button no longer offered for that action.

---

## US4 — Multi-tab and session safety (P2)

### US4-1 — Tab isolation

1. In Tab A, delete a product. **Expect**: Toast in Tab A.
2. Switch to Tab B (without refreshing). **Expect**: No toast in Tab B. If there is an Undo surface elsewhere (e.g., if the app renders `canUndo` anywhere), Tab B's `canUndo` is `false`.
3. Attempting to invoke undo from Tab B (e.g., via a stale React render) **must not** fire any rollback — Tab B's `sessionStorage` is empty.

### US4-2 — Session isolation

1. In Tab A, perform a deletion. Do **not** click Undo.
2. Close the browser completely (all windows).
3. Reopen the browser and navigate to the app.
4. **Expect**: No undo toast flickers on startup; `canUndo=false` from the first frame.

---

## US5 — Graceful handling of corrupted or unexpected undo state (P3)

### US5-1 — Malformed JSON

1. DevTools → Application → Session Storage → set `last_undo_action = {not json`.
2. Trigger a sync (click **Sync Now**).
3. **Expect**: No uncaught error in the console. Toast does not appear. `canUndo=false`. The sync completes normally.

### US5-2 — Unknown table

1. DevTools → Application → Session Storage → set
   ```json
   {"type":"test","affected":[{"table":"nonexistent","id":"x"}],"steps":[],"timestamp":0}
   ```
2. Trigger a sync.
3. **Expect**: Console warn `Undo action references unknown table: nonexistent`. `canUndo=false`. No further errors.

### US5-3 — Legacy table alias

1. DevTools → Application → Session Storage → set
   ```json
   {"type":"update_customer","affected":[{"table":"customers","id":"<real entity id>"}],"steps":[{"op":"update","table":"entities","id":"<real entity id>","changes":{"name":"old"}}],"timestamp":0}
   ```
   (Use an actual unsynced entity id.)
2. Click the in-UI **Undo**.
3. **Expect**: Undo completes successfully — the `suppliers`/`customers` alias in `affected` is transparently mapped to `entities`.

---

## Success criteria checklist

| Criterion | How to verify |
|-----------|---------------|
| SC-001 | US1-1 and US1-2 both land the record on the server. |
| SC-002 | US2 shows pre-edit values on the server. |
| SC-003 | Across all scenarios, no inventory item / product / bill remains locally present with zero `pending_syncs` rows when it hasn't been synced. |
| SC-004 | US3 step 1 toast labels match the action-type map. |
| SC-005 | US4-1 passes over 20 interleaved tab actions. |
| SC-006 | US4-2 passes over 20 cold starts. |
| SC-007 | US5-1 shows no uncaught errors. |
| SC-008 | Force a mid-undo exception (e.g., rename a table via DevTools) — IndexedDB is not left half-modified. |
| SC-009 | Ask 3 cashiers to walk through US3 blind and report clarity. |

---

## Automated tests (optional)

If unit tests are added for `undoOperations.ts`:

```bash
cd apps/store-app
pnpm test:run         # or pnpm test for watch mode
```

Recommended targets (Vitest — service-layer only per constitution §9):
- `undoLastAction` — each op kind, empty affected, missing step.id on restore, unknown table, cash drawer exemption.
- `checkUndoValidity` — malformed JSON, legacy alias, restore-target skip.

No test harness changes required; existing Vitest config in `apps/store-app/vite.config.ts` is sufficient.
