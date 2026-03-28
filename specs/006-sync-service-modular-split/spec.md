# Feature Specification: Modular Sync Capability Structure

**Feature Branch**: `006-sync-service-modular-split`  
**Created**: 2026-03-26  
**Status**: Draft  
**Input**: User description: "Refactor syncService.ts into modular architecture: config, upload, download, deletion detection. Maintain behavior and ensure testability. This is our plan reference IMPROVEMENTS_ENHANCEMENTS_REPORT.md"

## Clarifications

### Session 2026-03-27

- Q: For SC-001, what is the authoritative reference for “pre-change baseline” parity? → A: The project’s **parity gate** and **sync-parity** suite (coverage matrix and rules under the store-app sync-parity tests); parity gate correctness is **done** and remains the merge bar for behavioral equivalence.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - No change in what staff experience (Priority: P1)

Store staff continue to work offline and online as today: local sales and inventory changes eventually appear on the server, and changes from other devices or the back office appear locally, without new errors, extra steps, or visibly slower sync.

**Why this priority**: Revenue and operations depend on reliable synchronization; any regression directly affects trust and data accuracy.

**Independent Test**: Compare before-and-after behavior on the same scripted scenarios (create/update/delete records, force sync, reconnect after offline). Outcomes on device and server must match.

**Acceptance Scenarios**:

1. **Given** unsynced local changes exist, **When** sync runs, **Then** those changes appear on the server in the same order and with the same final data as before this work.
2. **Given** the server has new or updated rows for the branch, **When** sync runs, **Then** the device reflects those rows the same way as before this work.
3. **Given** rows were removed on the server and deletion handling applies, **When** sync runs, **Then** local state matches the prior product behavior for those removals.

---

### User Story 2 - Clear separation of sync concerns (Priority: P2)

People maintaining the product can reason about “what to sync and in what order,” “sending local changes outward,” “bringing remote changes in,” and “detecting remote removals” as separate topics, instead of one impenetrable block.

**Why this priority**: Reduces cost and risk of future fixes and audits; aligns with the improvement report’s direction for long-term maintainability.

**Independent Test**: Review or walkthrough confirms each concern has a single obvious home; changes to one concern do not require reading unrelated logic for the others.

**Acceptance Scenarios**:

1. **Given** someone needs to adjust batch sizes or table ordering rules, **When** they look for where that lives, **Then** they find it in one dedicated configuration-oriented area.
2. **Given** someone needs to trace outbound transfer of local edits, **When** they follow the code path, **Then** it does not interleave with unrelated inbound or deletion-detection logic except at defined coordination points.
3. **Given** someone needs to trace inbound application of remote data, **When** they follow the code path, **Then** it is similarly separable from upload-only and deletion-detection-only logic except at defined coordination points.
4. **Given** someone needs to trace how remote deletions are detected and applied locally, **When** they follow the code path, **Then** that logic is grouped apart from generic upload/download paths except where orchestration explicitly connects them.

---

### User Story 3 - Verifiable pieces without repeating full manual runs (Priority: P3)

Quality and engineering can confirm configuration, upload, download, and deletion-detection behavior through focused checks, so fixes in one area do not always require an end-to-end manual pass of the entire app.

**Why this priority**: Speeds safe iteration and reduces human error; supports the goal of testability stated in the input.

**Independent Test**: For each major concern, there is a defined way to exercise or observe it (repeatable scenario or check) that does not depend on manually driving unrelated screens unless the scenario inherently requires it.

**Acceptance Scenarios**:

1. **Given** a change is made only to configuration constants or ordering rules, **When** verification runs, **Then** there is a targeted way to confirm those rules without re-testing unrelated concerns.
2. **Given** a change is made only to outbound transfer logic, **When** verification runs, **Then** there is a targeted way to confirm outbound behavior against expectations.
3. **Given** a change is made only to inbound application logic, **When** verification runs, **Then** there is a targeted way to confirm inbound behavior against expectations.
4. **Given** a change is made only to remote deletion detection, **When** verification runs, **Then** there is a targeted way to confirm deletion-detection behavior against expectations.

---

### Edge Cases

- **Interrupted connectivity**: Partial failure during a sync cycle must leave data in a state consistent with existing recovery behavior (no new categories of corruption or permanent stuck state).
- **Large datasets**: Pagination and batching behavior for very large tables must remain equivalent to the prior behavior (same effective page sizes and progress semantics).
- **Overlapping sync requests**: If sync is triggered again while a run is in progress, behavior must match prior rules (e.g., skip, queue, or coalesce—unchanged from baseline).
- **Branch and store scope**: Only data intended for the current branch/store must be affected; cross-tenant or cross-branch mistakes must not increase relative to baseline verification.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: The product MUST preserve observable sync outcomes for all supported entity types: local edits eventually reconcile to the server as before, including ordering and dependency constraints between entity kinds.
- **FR-002**: Inbound reconciliation MUST preserve prior behavior for applying remote rows to the local store, including special cases already handled for specific entity kinds.
- **FR-003**: Remote deletion detection MUST preserve prior behavior for when and how local rows are removed or marked to match the server.
- **FR-004**: Tunable sync settings (such as batch sizes, pagination for large lists, and table processing order) MUST remain defined in one configuration-oriented place so operators of the codebase do not hunt through unrelated modules for conflicting values.
- **FR-005**: The way the rest of the application triggers sync and reads sync status (success, failure, in-progress) MUST remain compatible: no breaking changes to those entry points without an explicit follow-up migration plan.
- **FR-006**: The implementation MUST separate the four concerns—configuration, outbound transfer of local changes, inbound application of remote changes, and deletion detection—so each can be understood and verified on its own, with orchestration only wiring them together at well-defined boundaries.
- **FR-007**: Regression safety MUST be demonstrated: existing repeatable sync checks continue to pass, and new or extended checks can target each concern without requiring a single monolithic check for every small change.

### Assumptions

- “Prior behavior” is defined by the current production-intent sync implementation before this restructuring, including the “upload-then-emit” ordering for events where that contract already applies.
- **Parity baseline**: Behavioral equivalence for this feature is judged against the **parity gate** and documented **sync-parity** coverage (scenario matrix, golden expectations, and project rules). The gate is implemented and correct; this refactor must keep it green.
- No new user-facing sync features (manual conflict UI, selective sync by table from the POS screen, etc.) are in scope—only structure, parity, and verifiability.
- The improvement report’s section on sync maintainability (modular split) is the planning reference for naming and boundaries of the four concerns.

### Key Entities

- **Sync configuration**: Rules and constants governing table order, batch sizes, pagination for large remote sets, and related limits. Represents “how much” and “in what order,” not the data rows themselves.
- **Local pending change**: A local record or mark indicating data waiting to be sent to the server.
- **Remote row snapshot**: A view of server-side data used to compare with local state during download or deletion handling.
- **Deletion candidate**: A server-side signal or comparison result indicating that a local row should be removed or aligned because it no longer exists or is no longer visible remotely.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: The **parity gate** passes with **no regressions**: every scenario required by the sync-parity baseline (including create/update/delete, reconnect, forced sync, and coverage per the parity matrix) continues to match frozen expectations at merge time.
- **SC-002**: All existing repeatable sync-related verifications that passed before this work still pass after it, with no new failures attributed to sync behavior.
- **SC-003**: For a typical branch dataset in staging, median wall-clock time to complete one full sync cycle does not exceed the pre-change median by more than 10% across a sample of at least ten runs (same network class and dataset profile).
- **SC-004**: A reviewer (or review checklist) can locate configuration, outbound transfer, inbound application, and deletion detection in four clearly separated areas within two review sessions, without relying on tribal knowledge of a single oversized file.

