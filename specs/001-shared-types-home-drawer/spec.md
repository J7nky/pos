# Feature Specification: Unified data contract and home cash drawer updates

**Feature Branch**: `001-shared-types-home-drawer`  
**Created**: 2026-03-21  
**Status**: Draft  
**Input**: User description: "Read IMPROVEMENTS_ENHANCEMENTS_REPORT.md and create specification for 1.4 and 1.5 only"

**Traceability**: Aligns with IMPROVEMENTS_ENHANCEMENTS_REPORT §1.4 (admin-app vs store-app backend contract) and §1.5 (remove periodic cash drawer refresh on Home).

## Clarifications

### Session 2026-03-21

- Q: What is the fixed v1 shared-contract scope for overlapping entities? -> A: V1 shared contract MUST cover stores, branches, users, and store subscriptions wherever both apps use the same backend fields.
- Q: Should Home show an explicit freshness indicator for cash drawer status? -> A: No; Home must not display a freshness indicator.
- Q: Should the spec define a fixed seconds target for Home cash drawer update visibility? -> A: No fixed seconds target; keep relative parity with other primary screens.
- Q: How should shared entity fields be standardized across apps? -> A: Use a shared common core for overlapping fields, with app-specific extensions outside the shared core.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Accurate cash drawer on Home without periodic polling (Priority: P1)

A cashier or manager opens the store app Home screen and needs to trust that the displayed cash drawer status matches reality soon after any cash drawer activity (open, close, or transactions), without the screen relying on a hidden repeating timer to “wake up” and check.

**Why this priority**: Directly affects daily operations and trust in the dashboard; removes a pattern that conflicts with the platform’s event-driven data rules.

**Independent Test**: Open Home, perform a cash drawer action elsewhere or trigger a state change, return to Home (or stay on Home if updates propagate in place) and confirm the displayed status matches the latest known state without waiting for a one-minute cycle.

**Acceptance Scenarios**:

1. **Given** the user is on Home with cash drawer information visible, **When** cash drawer state changes due to normal business activity, **Then** the Home screen reflects that change without depending on a timed refresh loop.
2. **Given** the user is on Home, **When** they view cash drawer status, **Then** no explicit freshness indicator is shown as part of this feature.
3. **Given** the user navigates away and back to Home, **Then** cash drawer status remains consistent with the same underlying data rules as the rest of the app.

---

### User Story 2 - One business data contract for admin and store (Priority: P2)

Operations and engineering need the super-admin experience and the in-store POS experience to interpret the same business records—stores, branches, staff users, and subscription-related data where both apps touch the backend—so changes in one surface do not silently diverge from the other.

**Why this priority**: Reduces integration risk and support burden; prevents subtle mismatches between tools used by HQ and staff.

**Independent Test**: Compare how a defined set of shared records is described and validated in both applications; confirm they use the same field meanings and constraints for overlapping tables.

**Acceptance Scenarios**:

1. **Given** a record type exists in both admin and store workflows (e.g. store, branch, user), **When** a developer or reviewer checks the contract for that record, **Then** there is a single authoritative place that defines fields and types for overlapping columns.
2. **Given** the backend schema evolves, **When** the team updates the contract, **Then** both applications can be updated against the same definition without maintaining parallel, divergent copies.
3. **Given** some tables are only used by one application, **When** the shared contract is scoped, **Then** it is explicit which entities are shared vs application-specific so scope stays clear.

---

### Edge Cases

- **Connectivity loss**: Home must still show the last known cash drawer state consistent with offline-first behavior; when connectivity returns, status should align with normal sync rules without introducing new polling.
- **Rapid successive cash drawer actions**: The Home view should not show stale intermediate states longer than what users experience elsewhere in the app for the same data.
- **Partial overlap**: Admin-only or store-only tables remain documented as out of scope for the shared contract so the feature does not force unnecessary coupling.
- **Schema lag**: If one app is deployed before the other, versioning or release notes expectations are handled at planning/implementation time (outside this spec’s acceptance tests).

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: The Home experience MUST NOT rely on recurring timed checks whose only purpose is to refresh cash drawer status (must follow the platform rule that disallows such timers for sync-related refresh on this screen).
- **FR-002**: Cash drawer status shown on Home MUST derive from the same application data path used elsewhere for cash drawer state so updates follow existing refresh and sync behavior after operations.
- **FR-003**: Home MUST NOT display a freshness indicator for cash drawer status; users rely on the displayed state itself and normal app navigation behavior.
- **FR-004**: The platform MUST provide a single shared definition of data shapes for backend tables that both the admin application and the store application use for these v1 shared entities: stores, branches, users, and store subscriptions (for overlapping fields only).
- **FR-005**: That shared definition MUST be consumable by both applications from one logical source in the codebase, not duplicated as independent hand-maintained copies.
- **FR-006**: Where automated alignment with the live backend schema is practical, the team SHOULD prefer that approach; if not, the repository MUST still hold one maintained source of truth that both applications use.
- **FR-007**: Documentation or developer-facing notes MUST state which entity types are covered by the shared contract and which remain single-app-only.
- **FR-008**: For each v1 shared entity, the contract MUST define a shared core field set used by both applications; each application MAY define additional app-specific fields outside that shared core.

### Key Entities

- **Store**: Business location account; attributes shared with admin provisioning.
- **Branch**: Location under a store; referenced by staff assignment and operations.
- **User (staff)**: Person record used for access and roles in the store app; may overlap admin user lists where applicable.
- **Store subscription**: Commercial/entitlement data when both apps display or edit overlapping fields.
- **Cash drawer session / status**: Business state surfaced on Home; must stay aligned with operational reality without periodic UI polling.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: After any cash drawer state change completed through normal app flows, users viewing Home see an updated status within the same order of time they would see it on other primary screens that show cash drawer state (no extra minute-scale delay tied to a timer).
- **SC-002**: Independent verification confirms the Home screen does not schedule recurring background checks whose purpose is refreshing cash drawer or general sync status (full compliance with FR-001 for this screen).
- **SC-003**: For each overlapping record type included in scope, an audit finds no duplicate independent definitions of the same fields across the two applications after the change (zero duplicates for in-scope entities).
- **SC-003**: For each in-scope shared entity, an audit confirms one shared definition exists for the agreed core fields, with no duplicate independent core-field definitions across the two applications.
- **SC-004**: When shared entity definitions change, the team performs one coordinated update to the shared contract instead of two separate edits in two places (measurable reduction in duplicate maintenance vs the prior baseline).

## Assumptions

- **A-001**: The shared contract may live in whichever shared codebase location the technical plan selects; the requirement is one logical source, not a particular folder or product name.
- **A-002**: “Subset of tables” is sufficient: only entities both apps use need to live in the shared contract; admin-only analytics tables may remain admin-local.
- **A-003**: Cash drawer state is already updated through existing offline data flows after operations; this feature removes redundant polling rather than redesigning cash drawer business logic.

## Out of Scope

- Broader refactors of sync service, event stream, or full `OfflineDataContext` beyond what is needed for FR-001–FR-003.
- Other screens beyond Home that may use timers for unrelated purposes (unless explicitly brought into a separate spec).
- Changing Supabase RLS policies or backend APIs except where required to align types (handled in planning).
