# Contract: Undo API

**Feature**: 011-undo-system-fixes
**Date**: 2026-04-16

This file defines the contract between (a) operation modules that write undo payloads, (b) the `useOfflineData()` context that exposes undo state and actions, and (c) the `UndoToastManager` component that renders the UI.

No external (HTTP / RPC) interface is introduced or changed. All contracts below are internal TypeScript interfaces.

---

## 1. Context-exposed API (from `useOfflineData()`)

```ts
interface OfflineDataContextType_UndoSubset {
  /** True when a valid, undoable action exists in this tab/session. */
  canUndo: boolean;

  /**
   * Execute the pending undo. Returns true on success, false on any failure
   * (no pending action, validity failure, execution failure). Never throws.
   */
  undoLastAction(): Promise<boolean>;

  /**
   * Capture a reversible action as the new pending undo. Overwrites any prior
   * pending undo. Called from operation modules after the forward operation
   * commits.
   */
  pushUndo(action: UndoActionInput): void;

  /**
   * Development-only hook. `undefined` in production builds.
   */
  testUndo?: () => void;
}
```

**Preconditions on `pushUndo`**:
- Must be called **after** the forward operation has committed to IndexedDB — never before.
- `action.affected` MUST list every `(table, id)` the forward operation touched.
- `action.steps` MUST, when executed in order inside a single Dexie transaction, return IndexedDB to the state before the forward operation (to the extent any unsynced state can be returned — the contract does not cover already-uploaded records except `cash_drawer_accounts`).
- `action.type` SHOULD be one of the recognized types listed in `research.md` §D6. Unrecognized types are accepted and fall back to a generic toast label.

**Guarantees of `undoLastAction`**:
- Atomic: all steps apply inside one Dexie `rw` transaction across all tables + `pending_syncs`, or none do.
- Returns `false` (no throw) for: missing payload, validity failure, caught error in transaction body, unknown table reference.
- On success: local IndexedDB is reverted; `pending_syncs` is updated per step semantics (see `data-model.md` §3); `sessionStorage[UNDO_STORAGE_KEY]` is cleared; `refreshData()` and `updateUnsyncedCount()` are invoked; `CustomEvent('cash-drawer-updated')` and `CustomEvent('undo-completed')` are dispatched when a cash-drawer account is touched.

---

## 2. Input shape (what operation modules pass to `pushUndo`)

```ts
type UndoActionInput = {
  type: string; // semantic type — see §D6 research
  affected: Array<{ table: string; id: string }>;
  steps: UndoStep[];
  metadata?: Record<string, unknown>;
};

type UndoStep =
  | { op: 'delete'; table: string; id: string; transaction_id?: string }
  | { op: 'restore'; table: string; id?: string; record: Record<string, unknown> }
  | { op: 'add';     table: string; id: string; changes: Record<string, unknown> }
  | { op: 'update';  table: string; id: string; changes: Record<string, unknown> };
```

`timestamp` is attached automatically by `pushUndo`; callers do not provide it.

**Backward compatibility**: Operation files may emit steps typed as `any[]` today (e.g., `saleOperations.ts` emits `{ op: 'restore', table, record }` without `id`). The executor tolerates a missing `id` on `restore`/`add` by falling back to `step.record?.id` / `step.changes?.id`. The type is widened in `offlineDataContextContract.ts` to include `'add'` so new call sites can use it.

---

## 3. Toast component contract (`UndoToastManager`)

`UndoToastManager` renders at most one of four UI states:

| State | Trigger | Controls | Duration |
|-------|---------|----------|----------|
| **Hidden** | `canUndo=false` OR auto-hide elapsed OR no pending action | — | indefinite |
| **Offering Undo** | New action pushed (new `timestamp`) | Message: action-type label. Button: "Undo". Progress bar: 8s countdown. | 8000 ms |
| **Undoing** | Click on "Undo" while action in flight | Message: "Undoing…". No button. | until `undoLastAction()` resolves |
| **Feedback** | Undo resolved | Message: "Action undone" (green, `feedbackType='success'`) OR "Action failed" (red, `feedbackType='error'`). | 2000 ms |

**Transition rules**:
- **Hidden → Offering**: `canUndo === true` AND `action.timestamp !== lastUndoTimestamp.current`.
- **Offering → Undoing**: user clicks the Undo button. Timers cleared **before** awaiting `undoLastAction()`.
- **Undoing → Feedback**: promise resolves. `visible` set to `true` together with `feedback` and `feedbackType`.
- **Feedback → Hidden**: 2s timer fires. Both `feedback` and `feedbackType` cleared; `visible=false`.

**Accessibility**: The Toast component already sets `role="alert"`. No changes required.

---

## 4. Storage contract

| Key | Storage | Value shape |
|-----|---------|-------------|
| `last_undo_action` | `sessionStorage` (per tab, cleared at tab close) | JSON-serialized `UndoAction` (see `data-model.md` §1). |

Removed: `localStorage['last_undo_action']`. Any legacy payload in `localStorage` is ignored and not migrated — losing a pending undo from a previous browser session is the desired behavior (FR-014).

---

## 5. i18n contract

New i18n keys under `common.labels.undoActions.<actionType>` in `en.ts`, `ar.ts`, `fr.ts`. Fallback chain in the component:

```
t('common.labels.undoActions.' + action.type)  // primary
  ?? t('common.labels.actionCompleted')         // fallback (existing key)
```

A missing key for a given action type MUST NOT break rendering; the component falls through to the existing generic label.

---

## 6. Error semantics

| Situation | Observable behavior |
|-----------|---------------------|
| `sessionStorage` read throws | `canUndo=false`; toast never shows. No console error above warning level. |
| `JSON.parse` throws on read | `sessionStorage[UNDO_STORAGE_KEY]` cleared; `canUndo=false`; one `console.error` with the parse error. |
| Validity check references unknown table | Undo cleared; `canUndo=false`; one `console.warn` naming the table. |
| Dexie transaction throws inside `undoLastAction` | Returns `false`; one `console.error` with error; **no partial state** (Dexie rolls back). |
| Undo returns `false` | `UndoToastManager` shows red "Action failed" feedback for 2s. |

No uncaught promise rejections are permitted in any path.
