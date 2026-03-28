# Feature Specification: Admin-app and store-app shared backend data contract

**Feature Branch**: `005-admin-store-backend-contract`  
**Created**: 2026-03-25  
**Status**: Draft  
**Input**: User description: "create specification for implementation IMPROVEMENTS_ENHANCEMENTS_REPORT.md 1.4 Admin-app vs store-app backend contract only"

## Clarifications

### Session 2026-03-25

- Q: What must count as the single “authoritative contract” for FR-001/SC-001? → A: **Option A** — **Shared workspace package exports** are the **single normative** contract; **published documentation summarizes** and **must not contradict** it.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - One source of truth for overlapping business data (Priority: P1)

A platform maintainer needs the store-facing application and the admin application to agree on what each **shared** business record means—store, branch, staff user, and subscription—when those records live in the same remote database tables. Today, each app can drift: field names, optional vs required semantics, and allowed values may diverge unless everyone references the same contract.

**Why this priority**: Misaligned interpretations cause subtle bugs (wrong displays, failed writes, support escalations) and slow down safe schema changes.

**Independent Test**: Compare the **shared workspace package’s exported contract** for in-scope entities against what each application treats as the “same” fields for those entities; there must be no duplicate, conflicting definitions for overlapping columns.

**Acceptance Scenarios**:

1. **Given** a store, branch, staff user, or subscription row in the remote database, **When** either application maps that row into its UI or validation logic for **overlapping** fields, **Then** both use the same field set and business meaning defined in the single authoritative contract.
2. **Given** a change adds or renames an **overlapping** column used by both apps, **When** the change is prepared for release, **Then** the authoritative contract is updated in the same delivery so neither app ships with a stale interpretation.

---

### User Story 2 - Clear boundary between “shared” and “app-only” fields (Priority: P2)

A developer working on either application must know which columns are part of the cross-app contract versus which exist only for offline sync, local device storage, or admin-only operations—without reading the entire codebase.

**Why this priority**: Prevents accidental coupling and avoids polluting the shared contract with concerns that only one app should own.

**Independent Test**: A reader can list, from **the shared package exports plus supplementary documentation**, which attributes are shared cores and which are extensions reserved to store-only or admin-only use.

**Acceptance Scenarios**:

1. **Given** store-only concerns (for example local sync flags or device-only columns), **When** they are documented, **Then** they are explicitly excluded from the shared overlapping-field contract or listed under an “app extension” rule, not duplicated as conflicting core definitions.
2. **Given** admin-only attributes on a table that also appears in the store app, **When** those attributes are not part of the cross-app agreement, **Then** supplementary documentation states they are admin extensions and not required for store-app parity (without contradicting the normative package cores).

---

### User Story 3 - Predictable impact when shared data evolves (Priority: P3)

A product or engineering lead plans a schema or business rule change to stores, branches, users, or subscriptions. They need to know immediately whether both applications must change together and what to verify in acceptance testing.

**Why this priority**: Reduces release risk and avoids “fixed in one app only” regressions.

**Independent Test**: For a sample change touching only overlapping fields, a short release note can be written from the contract scope (which entities and fields are shared) without guessing from code.

**Acceptance Scenarios**:

1. **Given** a planned change to an in-scope overlapping field, **When** the team triages it, **Then** they can state whether admin-app, store-app, or both must be updated before production, using the contract’s entity and field scope.
2. **Given** acceptance testing for a release that touches shared entities, **When** testers run checks on both apps, **Then** they have a checklist derived from the contract to confirm consistent behavior for overlapping data.

---

### Edge Cases

- **Store-only tables**: Many remote tables exist only for the POS/offline path. They remain **out of scope** for this contract; the contract must not imply full parity of every table between apps.
- **Historical rows**: Rows created before a contract tightening may have nulls or legacy values; validation rules in each app may still differ for edge handling—the contract defines **intended** shared semantics for overlapping columns, not a one-time data migration (unless separately specified).
- **Read-only vs read-write**: Admin may edit subscription or org fields that the store app only reads; the contract still governs **meaning** of overlapping columns both sides read, while documenting which side may write which extension fields.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: The product MUST maintain a **single authoritative contract** for overlapping remote-database entities used by **both** the admin application and the store application: **stores**, **branches**, **staff users** (users tied to a store/branch), and **store subscriptions**, limited to the fields both sides rely on for those entities. The **normative** embodiment of that contract MUST be the **shared workspace package’s exported definitions** for those overlapping cores; prose or docs alone are not sufficient as the source of truth.
- **FR-002**: For every overlapping column in FR-001’s scope, the contract MUST define a stable business meaning (including required vs optional and allowed enumerations where applicable) so both applications do not rely on divergent ad-hoc definitions.
- **FR-003**: Each application MUST align its treatment of overlapping columns with FR-001–FR-002: extensions and app-only fields are allowed, but **core overlapping fields MUST NOT be redefined** independently in a way that conflicts with the authoritative contract.
- **FR-004**: The contract MUST explicitly distinguish **core overlapping fields** from **app-specific extensions** (for example offline sync metadata, admin-only billing detail, or local-only columns), so developers and reviewers can tell which additions belong in the shared core versus a single app.
- **FR-005**: Published contract documentation MUST list **in-scope entities**, **which attributes are shared cores**, and **what is explicitly out of scope** (full store-app table catalog, local-only storage shapes, and purely admin-only analytics). Documentation is **supplementary** to the package exports, MUST **summarize** them for readers, and MUST **not contradict** their field semantics or required/optional rules; if text and exports disagree, **exports prevail** until reconciled in the same release window.
- **FR-006**: When a new overlapping column is introduced or an existing one’s semantics change, the delivery process MUST include updating the authoritative contract **in the same release window** as application changes that depend on it, so production does not ship with mismatched interpretations.

### Key Entities *(include if feature involves data)*

- **Store (shared core)**: Organization or tenant record; name, preferences such as currency and language, and timestamps as covered by the contract—not every possible admin-only column.
- **Branch**: A location under a store; shared core includes identity, store linkage, contact/active flags, and timestamps as contracted.
- **Staff user**: A user record associated with a store (and optionally a branch), including role and active state for overlapping fields.
- **Store subscription**: Plan, status, validity window, and timestamps for the overlapping subset; additional commercial or billing detail may be admin-only extensions per FR-004.
- **Authoritative contract artifact**: The **shared workspace package’s exported core definitions** for FR-001 entities—the **normative** source of truth both apps MUST align with. Published documentation summarizes boundaries (shared core vs extensions) and MUST NOT contradict the package.

### Assumptions

- **Overlap set**: The improvement report’s observation still applies: the admin application uses a subset of remote tables (`stores`, `users`, `branches`, `store_subscriptions`, etc.) without offline replication; the store application uses a broader schema plus local storage. This feature **only** governs **overlapping** remote fields, not the full POS schema.
- **Existing partial work**: Core-shaped definitions may already exist in the shared workspace package; this specification completes the **contract** (normative exports, supplementary documentation, boundaries, and alignment rules), not necessarily every possible future table.
- **Auth and RLS**: Who may read or write which row is governed by security rules elsewhere; this spec governs **consistent data shape and meaning** for shared fields, not authentication policy.

### Out of Scope

- Generating or regenerating contract artifacts from a specific tooling pipeline (implementation choice), as long as FR-001–FR-006 are satisfied.
- Dexie/IndexedDB table design, sync ordering, and event emission—covered by other work.
- Full duplication of the entire store-app remote schema inside the admin app or vice versa.
- Netlify, environment variables, and deployment topology except where they block publishing the contract (not required by this spec).

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: For **100%** of overlapping columns in scope (stores, branches, staff users, store subscriptions—per FR-001), an auditor can find **exactly one** normative definition in the **shared workspace package exports**; zero duplicate conflicting definitions for the same column name and meaning in app layers that extend those cores; supplementary documentation contains **no contradictions** of those exports.
- **SC-002**: For two consecutive releases after adoption, **zero** internal defects classified as “admin and store disagree on field meaning or presence” for in-scope entities are reported for production (tracked in the issue tracker or release retrospective).
- **SC-003**: **100%** of releases that add or change an overlapping column include an update to **the shared package exports** and **aligned supplementary documentation** in the same release window (sampled review of release notes or change records).
- **SC-004**: New engineers or contractors can answer, using **the shared package exports and supplementary documentation** (which must align per FR-005) in under **30 minutes**, whether a given field on an in-scope entity is shared core, store-only extension, or admin-only extension (validated by a short onboarding quiz or structured interview with **at least three** participants).
- **SC-005**: Stakeholder satisfaction: product/engineering leads **rate agreement clarity** on shared vs app-only fields at least **4/5** on a post-adoption survey within one quarter (qualitative, one survey round).
