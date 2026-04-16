# Feature Specification: Undo System Hardening

**Feature Branch**: `011-undo-system-fixes`
**Created**: 2026-04-16
**Status**: Draft
**Input**: User description: "Review the existing undo feature and close the correctness, reliability, and UX gaps identified during QA — so that every undoable action can be safely reversed without orphaning data, breaking sync, or confusing the cashier."

## User Scenarios & Testing *(mandatory)*

### User Story 1 — Undoing a deletion actually restores and syncs the record (Priority: P1)

A cashier deletes a sale line, a product, or an inventory item by mistake and clicks **Undo**. The record reappears in the UI, and the next sync uploads it to the server. Later, when the store is viewed from another device, the record is present there too.

**Why this priority**: This is the most severe gap in the current system — today, undoing a delete can silently leave the record out of the upload queue, so the local device "recovers" it but the server never sees it. A subsequent full resync deletes the local copy, so data is lost.

**Independent Test**: Delete a previously-synced record, click Undo, then force a sync and observe the server; the restored record must reach the server. Independently, delete an unsynced record, click Undo, and confirm the record exists locally with a pending upload entry.

**Acceptance Scenarios**:

1. **Given** a synced sale line, **When** the cashier deletes it and clicks Undo, **Then** the sale line exists locally, is queued for upload, and reaches the server on the next sync.
2. **Given** an unsynced inventory item that was just created and then deleted, **When** the cashier clicks Undo, **Then** the item exists locally and is queued as a create, not orphaned.
3. **Given** a deleted record, **When** Undo is attempted, **Then** the Undo button is enabled and does not fail validation just because the record was removed from the local database.

---

### User Story 2 — Undoing an edit preserves prior upload state (Priority: P1)

A cashier edits a newly-created product (not yet synced), realizes the edit is wrong, and clicks **Undo**. The product reverts to its original values and is still queued for upload as a new product. The next sync uploads the original version to the server.

**Why this priority**: Today, undoing an edit on an unsynced record can remove both the "update" and the original "create" entry from the upload queue, orphaning the record so it never uploads.

**Independent Test**: Create a record locally while offline, edit it, click Undo, go online, sync — confirm the original version of the record appears on the server.

**Acceptance Scenarios**:

1. **Given** an unsynced newly-created product with a pending upload, **When** the cashier edits then undoes the edit, **Then** the product still has a pending upload entry so it will sync.
2. **Given** a synced product that is edited locally, **When** the cashier clicks Undo, **Then** the product reverts to original values, remains marked as needing upload, and the server receives no further updates for it.

---

### User Story 3 — Undo surface is clear, trustworthy, and predictable (Priority: P2)

A cashier performs an action and a toast appears. The toast tells them what they just did (e.g., "Sale deleted"), gives them an 8-second window to undo, and — after clicking Undo — shows clear success or failure feedback.

**Why this priority**: Undo is a high-trust control; cashiers must be able to tell at a glance what they are undoing and whether the undo succeeded. Currently the toast is generic ("Action completed") and the success/failure state is determined by comparing translated strings, which is fragile.

**Independent Test**: Perform each type of undoable action and confirm the toast shows a human-readable label specific to that action. Trigger a failing undo (e.g., after storage is cleared) and confirm the feedback banner is red and says "Action failed."

**Acceptance Scenarios**:

1. **Given** the cashier deletes a bill, **When** the toast appears, **Then** the message identifies the action (e.g., "Bill deleted") rather than a generic label.
2. **Given** the cashier clicks Undo successfully, **When** the undo completes, **Then** a green "Action undone" confirmation appears for ~2 seconds.
3. **Given** an undo that fails, **When** the cashier clicks Undo, **Then** a red "Action failed" banner appears instead of a green one.
4. **Given** the undo toast is visible, **When** 8 seconds elapse without interaction, **Then** the toast auto-dismisses and Undo is no longer offered for that action.

---

### User Story 4 — Multi-tab and session safety (Priority: P2)

A cashier has the POS open in two browser tabs on the same device. They perform an action in Tab A. Tab B does not accidentally show or trigger an undo for Tab A's action. If the cashier closes and reopens the app, they are not shown a stale undo from a previous session.

**Why this priority**: Shared per-origin storage causes undo actions to leak across tabs, which can make one tab roll back an action that was never performed in that tab. Stale undo data from prior sessions can also be applied to records that no longer match.

**Independent Test**: Open two tabs; perform an action in Tab A; confirm Tab B shows no undo toast and its Undo button is disabled. Close the browser, reopen, confirm no undo toast flickers on startup.

**Acceptance Scenarios**:

1. **Given** two tabs of the POS are open, **When** an action is performed in Tab A, **Then** Tab B's Undo control remains disabled and no toast appears in Tab B.
2. **Given** an undo action existed when the browser was closed, **When** the app is reopened in a new session, **Then** the old undo is not offered.

---

### User Story 5 — Graceful handling of corrupted or unexpected undo state (Priority: P3)

If the undo storage is corrupted, references an unknown table, or references legacy table names, the app quietly discards it and disables the Undo button rather than crashing or throwing uncaught errors.

**Why this priority**: Rare but real when schema changes ship or when storage is manually edited. The app must not expose these errors to the cashier.

**Independent Test**: Seed the undo storage with malformed JSON and with references to a removed table, then trigger a sync (which re-validates undo). Confirm no uncaught errors and that the Undo control is disabled.

**Acceptance Scenarios**:

1. **Given** corrupt undo storage, **When** the app re-validates the undo after a sync, **Then** the undo is cleared and the Undo button is disabled, with no visible error.
2. **Given** undo data referencing a legacy table name (e.g., "suppliers", "customers"), **When** validity is checked, **Then** the system correctly maps to the current table and either validates or clears the undo without crashing.

---

### Edge Cases

- **Record referenced by foreign keys after undo**: If a deleted record has been referenced by other records since deletion, undo must either restore without violating relationships or cleanly refuse with an error feedback toast.
- **Undo during active sync**: If the cashier clicks Undo while a sync is in flight, the undo must either wait for the sync to finish, execute on a consistent snapshot, or refuse with a clear message — never interleave with sync writes in a way that corrupts the outbox.
- **Undo after the record was uploaded**: For all tables except cash drawer accounts, undo is not offered once the record has been synced. For cash drawer accounts, undo is permitted because balance integrity requires reversibility regardless of sync state.
- **Toast auto-hide vs. in-flight undo**: If the cashier clicks Undo just as the 8-second timer expires, the click must still trigger the undo and show its feedback.
- **Multiple rapid actions**: Only the most recent action is undoable. A second action supersedes the first — the toast for the first is dismissed and no longer triggers when clicked.
- **Tab focus switch mid-undo**: Clicking Undo in one tab must not fire the same undo in another tab when focus switches.
- **System clock drift**: Timestamps attached to the undo record are treated as opaque identifiers for "new action since last toast" — they are not used for security or ordering decisions.

## Requirements *(mandatory)*

### Functional Requirements

#### Correctness of rollback

- **FR-001**: The system MUST support four categories of reversible step: removing a just-created record, restoring a deleted record, re-creating a hard-deleted record, and reverting field changes on an existing record.
- **FR-002**: When undoing the creation of a record, the system MUST remove the record from local storage and MUST remove all pending upload entries associated with that record so it does not upload after rollback.
- **FR-003**: When undoing the deletion of a record, the system MUST restore the record's data locally, MUST remove any pending "delete" upload entry for that record, AND MUST add a pending "create" upload entry so the restored record reaches the server on the next sync.
- **FR-004**: When undoing an edit, the system MUST revert the record to its prior field values, MUST mark the record as needing upload, AND MUST remove only the pending "edit" upload entry — never a pending "create" entry — so that prior unsent creations still reach the server.
- **FR-005**: The system MUST NOT perform a blanket deletion of all pending upload entries associated with a reverted record; each step kind is responsible for the precise outbox cleanup it requires.
- **FR-006**: The system MUST support legacy table-name aliases (e.g., customer/supplier references that predate the unified entity table) consistently in both undo execution and undo validity checks.

#### Validity & eligibility

- **FR-007**: The Undo control MUST be enabled only when a valid, recent undo action exists for the current session and store.
- **FR-008**: Before executing an undo, the system MUST validate that every affected record is still in an undoable state: either present and unsynced for edits, or expected-absent for deletions being restored.
- **FR-009**: The validity check MUST NOT fail for records that the undo is explicitly restoring — i.e., it must recognize that a record is supposed to be missing when the undo step is a restoration.
- **FR-010**: For records other than cash drawer accounts, once a record is synced to the server, undo MUST no longer be offered for that record.
- **FR-011**: For cash drawer accounts, undo MUST remain available even after sync, because balance reversibility is required by the accounting model.
- **FR-012**: The validity check MUST handle errors (including malformed stored data, unknown or removed tables, and unexpected exceptions) by quietly discarding the undo and disabling the Undo control — without surfacing a technical error to the cashier.

#### Scope, session, and multi-tab safety

- **FR-013**: Undo state MUST be scoped to the active browser session and tab; undo actions performed in one tab MUST NOT appear or fire in another tab of the same browser on the same device.
- **FR-014**: Undo state MUST NOT persist across browser sessions: if the cashier closes the app and reopens it, no undo from the prior session may be offered.
- **FR-015**: The system MUST support at most one pending undo at a time. A newer action supersedes any older pending undo.

#### Toast and feedback UX

- **FR-016**: The post-action toast MUST display a human-readable description of the action that was performed (e.g., "Sale deleted", "Product edited", "Inventory received"), derived from the action type, in the active language (English, Arabic, French).
- **FR-017**: After the cashier clicks Undo, the system MUST show a result banner — green for success, red for failure — for approximately 2 seconds, and this styling MUST be driven by an explicit success/failure flag rather than by comparing translated strings.
- **FR-018**: The undo toast MUST auto-dismiss after approximately 8 seconds if not interacted with, and the countdown MUST be visible via a progress indicator.
- **FR-019**: The development-only test-undo hook MUST NOT be callable in production builds.

#### Diagnostics

- **FR-020**: When a validity failure or undo failure occurs, the system MUST log enough context (action type, affected tables, reason) to diagnose the issue from developer logs, without leaking sensitive customer or financial data.

### Key Entities *(include if feature involves data)*

- **Undo Action**: A single pending reversal for the most recent cashier operation. Includes the action's semantic type (e.g., "delete_sale"), the list of records it touches, an ordered list of reversal steps, the timestamp it was captured, and optional metadata used for display.
- **Reversal Step**: One atomic operation in an undo plan. Four kinds: *remove-created-record*, *restore-deleted-record*, *recreate-hard-deleted-record*, and *revert-field-values*. Each names a table and a target record identifier, plus the data needed to perform the reversal.
- **Upload Queue Entry ("pending sync")**: An outbox row representing a create, update, or delete that must still be pushed to the server. The undo system must add, remove, or preserve these entries according to the precise semantics of each reversal step.
- **Affected Record Reference**: The `(table, id)` pair used by the validity check to confirm that each touched record is still eligible for undo at the moment the cashier clicks.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: 100% of successful undos of a *delete* result in the restored record being present on the server after the next sync — verified on both previously-synced and never-synced records.
- **SC-002**: 100% of successful undos of an *edit* on a never-synced record result in the original (pre-edit) version of the record being present on the server after the next sync.
- **SC-003**: Zero records end up locally present but permanently un-uploadable as a result of any single undo action, measured across the full regression suite.
- **SC-004**: The Undo toast correctly identifies the action being undone for every undoable operation in the app; reviewers can tell what they are undoing without reading code.
- **SC-005**: Opening two tabs of the app and performing actions in one tab never enables or fires an undo in the other tab across 20 manual interleavings.
- **SC-006**: Closing and reopening the app never surfaces an undo from a prior session (0 flickers of a stale undo toast during startup across 20 cold starts).
- **SC-007**: When undo storage is intentionally corrupted, the app never shows an uncaught error, and the Undo control is correctly disabled within one sync cycle.
- **SC-008**: Every undo execution that passes the validity check either fully completes or fully rolls back; there are no partial rollbacks that leave the local database internally inconsistent.
- **SC-009**: Cashiers describe the Undo experience as "clear" or "very clear" in qualitative testing — specifically confirming they always know what they are undoing and whether the undo worked.

## Assumptions

- The existing undo data shape (type + affected list + ordered steps) is retained; only the semantics of step handling and the storage scope change.
- The system continues to support only a single-level undo (most recent action). Multi-level undo history is explicitly out of scope for this feature.
- Cash drawer accounts retain their exemption from the "no undo after sync" rule, because reversing cash balance is an accounting requirement.
- Undo lifetime ends when either (a) the 8-second toast expires and the cashier does not click, (b) a newer action replaces it, (c) a sync confirms the record was uploaded, or (d) the browser tab/session ends.
- Labels for the action toast are derived from a fixed map keyed by action type; unknown types fall back to the current generic label so forward-compatibility is preserved.
- No changes are required to the server-side sync protocol; the fix is entirely client-side.

## Out of Scope

- Multi-level undo history (a stack of reversible actions).
- Redo functionality.
- Cross-device undo (undoing on Device B an action performed on Device A).
- Conflict resolution when the server has changed the record since the undo was captured — undo remains disabled in that case.
- Audit-log visibility into undo events beyond developer-level logs.
