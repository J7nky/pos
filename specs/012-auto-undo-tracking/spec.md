# Feature Specification: Automatic Undo Tracking System

**Feature Branch**: `012-auto-undo-tracking`  
**Created**: 2026-04-19  
**Status**: Draft  
**Input**: User description: "Implement a Dexie hook-based change tracker system that automatically captures all database writes (create/update/delete) during an operation session, builds undo data from the captures, and provides a withUndoOperation wrapper to eliminate manual undo construction."

## User Scenarios & Testing

### User Story 1 - Developer Creates New Operation with Automatic Undo (Priority: P1)

When a developer creates a new operation (e.g., payment processing, inventory adjustment) that modifies the database, they should not need to manually construct undo data. Instead, they wrap their operation logic with the automatic tracking wrapper, and the system captures all database changes and registers them for undo.

**Why this priority**: This is the core value proposition. Without automatic tracking, developers continue to manually construct undo data (the current broken pattern). This unblocks all future operations to have correct undo support without per-operation manual work.

**Independent Test**: A new operation can be wrapped with `withUndoOperation()`, executed, and when undone via the UI, all database changes (including nested table writes from services) are fully reverted. This can be tested by implementing a single new operation with the wrapper.

**Acceptance Scenarios**:

1. **Given** a database operation that creates a transaction and journal entries, **When** the operation is wrapped with `withUndoOperation('operation_type', pushUndo, async () => { ... })`, **Then** all created records are tracked and included in the undo payload
2. **Given** a database operation that updates multiple records in a transaction, **When** the operation completes and undo is triggered, **Then** all records are restored to their pre-operation state in reverse order
3. **Given** a database operation that deletes records, **When** the operation is undone, **Then** deleted records are restored with their original data
4. **Given** a database operation that fails or throws an error, **When** the error occurs, **Then** no undo entry is registered and the pre-operation undo slot remains unchanged

---

### User Story 2 - Backward Compatibility with Existing Manual Operations (Priority: P1)

Existing operations that already have manual `pushUndo()` calls should continue to work without modification. The system must not interfere with or conflict with manual undo registration.

**Why this priority**: This ensures a non-breaking change. Teams can migrate operations to the new system incrementally without requiring a big-bang rewrite.

**Independent Test**: An existing operation (e.g., createBill) that uses manual `pushUndo()` can execute and undo without any changes, producing identical undo results as before. The change tracker does not interfere because it is only active inside `withUndoOperation()` sessions.

**Acceptance Scenarios**:

1. **Given** an existing operation that calls `pushUndo()` directly, **When** that operation executes, **Then** the tracker is not active and does not capture changes
2. **Given** an existing operation that has already been tested and verified, **When** no code changes are made to that operation, **Then** its undo behavior remains identical

---

### User Story 3 - System Prevents Undo-of-Undo Infinite Loop (Priority: P1)

When the user triggers undo (via the UI's undo button), the execution of `undoLastAction()` itself should not create a new undo entry. This prevents the undo system from creating recursive undo states.

**Why this priority**: Without this safeguard, undoing an action could register a new undo entry, creating an infinite loop or confusion about the undo stack state.

**Independent Test**: An operation is performed (creating a database change), undo is triggered in the UI, the undoLastAction function completes, and the undo slot is cleared. If the user triggers undo again, nothing happens because the slot was cleared (not a new entry). This can be verified by checking sessionStorage before and after undo.

**Acceptance Scenarios**:

1. **Given** a performed operation with an active undo entry, **When** the user triggers undo, **Then** the undoLastAction function executes without the change tracker being active
2. **Given** undoLastAction is executing, **When** database writes occur (rolling back records), **Then** those writes are not tracked as new changes
3. **Given** undoLastAction completes successfully, **When** the undo entry is cleared from sessionStorage, **Then** no new undo entry is created to track the undoLastAction itself

---

### User Story 4 - Sync Operations Are Excluded from Undo Tracking (Priority: P2)

When the sync system downloads records from the server and marks them as `_synced: true`, or when sync operations run, these should not be tracked for undo. Only user-initiated operations (marked with `_synced: false`) should generate undo entries.

**Why this priority**: Undo is a user action recovery mechanism. Server-synced data represents server truth and should not be undoable at the local level. This prevents users from accidentally creating conflicts with server state.

**Independent Test**: A server-pushed update sets `_synced: true` on a record. The change tracker does not capture this change because no `withUndoOperation()` session was started. If a user operation sets `_synced: false` on the same record, that change is tracked. Undo should only affect the user-initiated change.

**Acceptance Scenarios**:

1. **Given** a record with `_synced: true` being updated by the sync service, **When** the update occurs outside any `withUndoOperation()` session, **Then** no undo entry is created
2. **Given** a user operation that sets `_synced: false` on a record, **When** undo is triggered, **Then** only the user changes are reverted, not the sync state

---

### User Story 5 - Change Tracking Handles Complex Multi-Table Transactions (Priority: P2)

When an operation writes to multiple tables within a single `getDB().transaction()` block (e.g., creating a bill, bill line items, transactions, and journal entries), the change tracker captures all changes in the correct sequence and builds undo steps that reverse them in the opposite order.

**Why this priority**: Complex operations are the reason manual undo construction is error-prone. Demonstrating that the tracker handles multi-table atomicity correctly is critical for building confidence in the solution.

**Independent Test**: A bill creation operation (which writes to bills, bill_line_items, transactions, journal_entries, and inventory_items tables) is performed, undo is triggered, and all records across all tables are reverted. This can be verified by querying each table before/after undo.

**Acceptance Scenarios**:

1. **Given** an operation that creates 10 records across 4 tables in a single transaction, **When** undo is triggered, **Then** all 10 records are deleted in reverse creation order
2. **Given** an operation that updates 5 records across 3 tables, **When** undo is triggered, **Then** all original field values are restored

---

### Edge Cases

- What happens when a database write occurs outside any transaction scope and the record is not in Dexie's cache when the `deleting` hook fires? → The tracker records the delete without a full record snapshot; buildUndoFromChanges skips the restore step for that record and logs a warning
- How does the system handle nested operations (operation A calls operation B, both wrapped with `withUndoOperation()`)? → The inner `startSession()` call finds an active session and logs a warning; changes from B are merged into A's session; when A completes, all changes (A+B) are committed as one undo entry
- What if an operation partially fails (some writes commit before an error is thrown outside the Dexie transaction)? → The Dexie transaction's writes are atomically rolled back; the tracker's endSession() in the catch block discards the changes; no undo entry is created
- What if `pushUndo()` is called manually during a `withUndoOperation()` session? → Both the manual pushUndo and the automatic tracker would register undo data; the sessionStorage would contain the last-written value (tracker's); this is an edge case indicating mixed usage, which should be avoided

## Requirements

### Functional Requirements

- **FR-001**: System MUST provide a `changeTracker` singleton service that manages session-based change tracking
- **FR-002**: System MUST provide a `startSession(type: string)` method that begins tracking database changes with a named operation type
- **FR-003**: System MUST provide an `endSession()` method that returns an array of all changes captured during the session
- **FR-004**: System MUST provide `trackCreate(table, primKey, obj)`, `trackUpdate(table, primKey, modifications, before)`, and `trackDelete(table, primKey, obj)` methods called by Dexie hooks
- **FR-005**: System MUST exclude changes to `pending_syncs`, `bill_audit_logs`, `sync_metadata`, and `sync_state` tables from tracking (operational tables, not domain data)
- **FR-006**: System MUST merge duplicate updates to the same record within a single session (if both `addUpdateFields` hook and `triggerSyncOnUpdate` hook fire for a table, combine modifications into a single change record, keeping the earliest `before` snapshot as the authoritative pre-operation state)
- **FR-007**: System MUST provide a `buildUndoFromChanges(type, changes)` function that converts a forward-order change log into a reversed sequence of undo steps
- **FR-008**: System MUST build undo steps that reverse creates as deletes, deletes as restores, and updates as reverse-value updates (restoring original field values)
- **FR-009**: System MUST integrate with existing Dexie hooks in `db.ts` by adding `changeTracker` calls to `triggerSyncOnUnsynced` and `triggerSyncOnUpdate` hooks
- **FR-010**: System MUST add new `deleting` hooks to all syncable tables to capture delete operations
- **FR-011**: System MUST provide a `withUndoOperation(type, pushUndo, operation)` wrapper function that operations call to automatically track changes
- **FR-012**: System MUST provide a `withUndoSuppressed(fn)` wrapper that suppresses change tracking during undo execution to prevent undo-of-undo
- **FR-013**: System MUST call `withUndoSuppressed()` inside `undoLastAction()` to ensure undo execution itself is not tracked
- **FR-014**: System MUST only track changes when a session is active (initiated by `withUndoOperation()`); all other database writes are untracked
- **FR-015**: System MUST not push undo data if the operation fails or throws an error (changes are discarded on failure)
- **FR-016**: System MUST be transparent to existing operations that do not use `withUndoOperation()` (they continue to use manual `pushUndo()` without interference)

### Key Entities

- **ChangeRecord**: Represents a single database change event with operation type (create/update/delete), table name, primary key, and relevant snapshots (record for create/delete, modifications and before-state for update)
- **UndoAction**: The payload written to sessionStorage containing operation type, affected records list (table+id pairs), and reversed undo steps
- **Session**: Active change tracking context with a type label and accumulating changes array

## Success Criteria

### Measurable Outcomes

- **SC-001**: All database writes (creates, updates, deletes) during a `withUndoOperation()` session are captured with 100% accuracy (testable by comparing changes array size to actual DB modifications)
- **SC-002**: Undo execution for operations using automatic tracking produces identical results to manual undo construction (zero regression in undo correctness)
- **SC-003**: Existing operations using manual `pushUndo()` are not affected by the new system and continue to work identically (backward compatibility maintained)
- **SC-004**: The two currently broken operations (processPayment and processEmployeePayment) can be migrated to use `withUndoOperation()` and immediately gain correct undo coverage for all tables they modify
- **SC-005**: Undo-of-undo is prevented; `undoLastAction()` execution does not create a new undo entry (verifiable by checking sessionStorage state before/after)
- **SC-006**: Developer cognitive load for undo implementation is reduced; new operations require only one wrapper call instead of manually constructing undo data structures
- **SC-007**: No performance degradation compared to manual undo construction; change tracking overhead is negligible (measured by operation execution time comparison)
- **SC-008**: Edge cases are handled gracefully without breaking undo functionality; missing record snapshots result in informative logs but not failed undos

## Assumptions

- All user-initiated database operations that need undo support will be wrapped with `withUndoOperation()` (either immediately or in a later migration phase)
- The existing Dexie hook mechanism (which already uses `trans?.table?.name` to access table names) will continue to work with the new tracker calls
- `getDB().transaction('rw', [tables], async () => { ... })` blocks are the primary transaction scope; nested or inline writes outside transaction blocks are rare and acceptable edge cases
- The `_synced` flag on records correctly identifies user-initiated changes (false) vs. server-synced data (true)
- sessionStorage is available in the browser environment (verified at hook registration time)
- Records that are deleted are typically fetched before deletion within the same transaction scope, making `obj` available in the `deleting` hook for most operations

## Constraints

- Change tracking is session-based; only one active session per application state (nested sessions merge into the outer session, not stacked)
- The tracker is synchronous (called from Dexie hooks which are synchronous); no async operations within tracking
- sessionStorage is limited to ~5-10MB per origin; the undo payload (JSON) must remain small (this is why undo is single-slot, not a stack)
- The solution must not modify the `UndoAction` interface or `undoLastAction()` executor logic (they continue to work as-is)

**Feature Branch**: `[###-feature-name]`  
**Created**: [DATE]  
**Status**: Draft  
**Input**: User description: "$ARGUMENTS"

## User Scenarios & Testing *(mandatory)*

<!--
  IMPORTANT: User stories should be PRIORITIZED as user journeys ordered by importance.
  Each user story/journey must be INDEPENDENTLY TESTABLE - meaning if you implement just ONE of them,
  you should still have a viable MVP (Minimum Viable Product) that delivers value.
  
  Assign priorities (P1, P2, P3, etc.) to each story, where P1 is the most critical.
  Think of each story as a standalone slice of functionality that can be:
  - Developed independently
  - Tested independently
  - Deployed independently
  - Demonstrated to users independently
-->

### User Story 1 - [Brief Title] (Priority: P1)

[Describe this user journey in plain language]

**Why this priority**: [Explain the value and why it has this priority level]

**Independent Test**: [Describe how this can be tested independently - e.g., "Can be fully tested by [specific action] and delivers [specific value]"]

**Acceptance Scenarios**:

1. **Given** [initial state], **When** [action], **Then** [expected outcome]
2. **Given** [initial state], **When** [action], **Then** [expected outcome]

---

### User Story 2 - [Brief Title] (Priority: P2)

[Describe this user journey in plain language]

**Why this priority**: [Explain the value and why it has this priority level]

**Independent Test**: [Describe how this can be tested independently]

**Acceptance Scenarios**:

1. **Given** [initial state], **When** [action], **Then** [expected outcome]

---

### User Story 3 - [Brief Title] (Priority: P3)

[Describe this user journey in plain language]

**Why this priority**: [Explain the value and why it has this priority level]

**Independent Test**: [Describe how this can be tested independently]

**Acceptance Scenarios**:

1. **Given** [initial state], **When** [action], **Then** [expected outcome]

---

[Add more user stories as needed, each with an assigned priority]

### Edge Cases

<!--
  ACTION REQUIRED: The content in this section represents placeholders.
  Fill them out with the right edge cases.
-->

- What happens when [boundary condition]?
- How does system handle [error scenario]?

## Requirements *(mandatory)*

<!--
  ACTION REQUIRED: The content in this section represents placeholders.
  Fill them out with the right functional requirements.
-->

### Functional Requirements

- **FR-001**: System MUST [specific capability, e.g., "allow users to create accounts"]
- **FR-002**: System MUST [specific capability, e.g., "validate email addresses"]  
- **FR-003**: Users MUST be able to [key interaction, e.g., "reset their password"]
- **FR-004**: System MUST [data requirement, e.g., "persist user preferences"]
- **FR-005**: System MUST [behavior, e.g., "log all security events"]

*Example of marking unclear requirements:*

- **FR-006**: System MUST authenticate users via [NEEDS CLARIFICATION: auth method not specified - email/password, SSO, OAuth?]
- **FR-007**: System MUST retain user data for [NEEDS CLARIFICATION: retention period not specified]

### Key Entities *(include if feature involves data)*

- **[Entity 1]**: [What it represents, key attributes without implementation]
- **[Entity 2]**: [What it represents, relationships to other entities]

## Success Criteria *(mandatory)*

<!--
  ACTION REQUIRED: Define measurable success criteria.
  These must be technology-agnostic and measurable.
-->

### Measurable Outcomes

- **SC-001**: [Measurable metric, e.g., "Users can complete account creation in under 2 minutes"]
- **SC-002**: [Measurable metric, e.g., "System handles 1000 concurrent users without degradation"]
- **SC-003**: [User satisfaction metric, e.g., "90% of users successfully complete primary task on first attempt"]
- **SC-004**: [Business metric, e.g., "Reduce support tickets related to [X] by 50%"]
