# Feature Specification: Incremental Sync Service Redesign

**Feature Branch**: `010-incremental-sync-redesign`
**Created**: 2026-04-14
**Status**: Draft
**Input**: User description: "Redesign the SyncService to use incremental delta-based sync, progressive hydration, store-scoped persistence, cursor-based pagination, and offline outbox — replacing the current full-sync-on-launch behavior"

## User Scenarios & Testing *(mandatory)*

### User Story 1 — Fast Return Login After First Sync (Priority: P1)

A cashier who has already used the POS on a device closes the session and returns the next day. Upon login, the app loads instantly from the local database without waiting for a remote sync, then silently catches up on any missed changes in the background.

**Why this priority**: This is the most common real-world scenario and directly impacts daily operator experience. If the app blocks on launch, it erodes trust and slows down operations.

**Independent Test**: Can be fully tested by logging in a second time on a device that already has local data, verifying the UI is usable immediately and sync completes in the background without interrupting work.

**Acceptance Scenarios**:

1. **Given** a device with an existing local database from a prior session, **When** the user logs in to the same store, **Then** the UI becomes interactive within 2 seconds without waiting for remote data.
2. **Given** the app is online after a returning login, **When** background sync runs, **Then** only records changed since the last sync checkpoint are fetched — not the full dataset.
3. **Given** the app is offline at login, **When** the user proceeds to use the app, **Then** all previously synced local data is available and no error prevents operation.

---

### User Story 2 — First Login Cold Start with Progressive Hydration (Priority: P2)

A cashier logs in to a store on a brand-new device (no local data). The app loads a minimal critical dataset first so the user can begin working quickly, then continues loading secondary data in the background.

**Why this priority**: Cold-start performance determines first impressions and whether operators can begin working quickly in time-sensitive environments.

**Independent Test**: Can be fully tested by performing a fresh login on a device with no local data, confirming the UI becomes usable as soon as Tier 1 data is loaded — before Tier 2/3 data finishes.

**Acceptance Scenarios**:

1. **Given** a device with no local data, **When** the user logs in for the first time, **Then** Tier 1 critical data (products, entities, accounts) is loaded and the UI is usable before background hydration completes.
2. **Given** a cold-start sync is in progress, **When** Tier 2 background data is still loading, **Then** the user can create transactions using the already-loaded Tier 1 data.
3. **Given** a large remote dataset (100k+ records), **When** the initial sync runs, **Then** the UI is never blocked — progress is indicated non-intrusively.

---

### User Story 3 — Offline Write Queuing and Later Sync (Priority: P3)

A cashier creates transactions or updates records while the device is offline. When connectivity is restored, all queued changes are uploaded to the remote backend automatically without data loss.

**Why this priority**: Offline write reliability is a core promise of offline-first POS. Without it, operators cannot trust the system during connectivity gaps.

**Independent Test**: Can be fully tested by creating records while offline, restoring connectivity, and verifying all queued items appear correctly on the remote backend.

**Acceptance Scenarios**:

1. **Given** the device is offline, **When** the user creates a bill or transaction, **Then** the record is saved locally and added to the outbox queue.
2. **Given** the device comes back online with a non-empty outbox, **When** the outbox processor runs, **Then** all queued records are uploaded in order without duplicates.
3. **Given** an outbox upload fails (e.g., network timeout), **When** the system retries, **Then** the item is retried with backoff and does not result in duplicate records on the backend.

---

### User Story 4 — Store-Scoped Data Persistence Across Sessions (Priority: P4)

When an operator logs out and another operator logs in to the **same store**, the local database is preserved — only user-specific session state is cleared. A full re-sync is not triggered.

**Why this priority**: Clearing and re-syncing the full database on every login/logout cycle makes the system unusable with large datasets and destroys incremental sync value.

**Independent Test**: Can be tested by logging out and back in as a different user to the same store, confirming local data remains and no full re-sync is initiated.

**Acceptance Scenarios**:

1. **Given** user A is logged out from a store, **When** user B logs in to the same store, **Then** local store data is retained and delta sync only fetches changes since the last checkpoint.
2. **Given** a user logs in to a **different store**, **When** the app initializes, **Then** the local database is scoped and re-initialized for the new store context.

---

### Edge Cases

- What happens when a sync checkpoint is corrupted or missing? System falls back to a safe full-sync for only the affected table, not the entire dataset.
- What happens when the backend returns a gap in version numbers? System detects the gap, flags the affected data tier for re-sync, and logs the inconsistency.
- What happens if the outbox grows very large (device offline for days)? Outbox processing uses batching and prioritization to upload high-priority items first.
- What happens when two devices make conflicting offline changes to the same record? Last-write-wins based on `updated_at` timestamp; conflicts are logged for operator review.
- What happens when a sync cursor reaches end of dataset? Sync marks the table as fully hydrated and transitions to delta-only mode.
- What happens when the backend permanently rejects an outbox entry? Entry is marked permanently failed, operator is alerted, and the remaining queue continues processing unblocked.
- What happens when a user's store access is revoked between sync cycles? On the next sync attempt, a permission error response triggers local store data clearance and forced re-authentication.

---

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: System MUST persist store-scoped local data across user sessions within the same store without triggering a full re-sync on logout/login.
- **FR-002**: System MUST perform delta sync using a per-table checkpoint based on a monotonic **version/sequence number** to fetch only records changed since the last sync. Timestamps MUST NOT be used as the primary sync cursor.
- **FR-003**: System MUST use cursor-based pagination (limit + cursor) for all data fetching — offset pagination is strictly forbidden.
- **FR-004**: System MUST load Tier 1 critical data before allowing user interaction on cold start, and load Tier 2+ data progressively in the background.
- **FR-005**: System MUST never block the UI while Tier 2 or Tier 3 background sync is in progress.
- **FR-006**: System MUST maintain an outbox queue for writes made while offline, and process it automatically when connectivity is restored.
- **FR-007**: Outbox processor MUST retry uploads that fail due to transient errors (network timeouts, server errors) with exponential backoff. Each outbox entry MUST carry a client-generated UUID as an idempotency key sent with every upload attempt; the backend MUST deduplicate by this key to guarantee no duplicate records are created. If the backend returns a permanent rejection (e.g., a non-retryable 4xx error), the entry MUST be marked as permanently failed, the operator MUST be alerted with a visible notification, and the processor MUST continue with the remaining queue — it MUST NOT block subsequent outbox entries.
- **FR-008**: System MUST store per-table sync checkpoints that survive app restarts and logout/login cycles for the same store.
- **FR-009**: System MUST propagate remote soft-deletions to the local database via a `deleted_at` field on synced records.
- **FR-010**: System MUST scope all local data by store identity so that switching stores triggers correct re-initialization without contaminating data across stores.
- **FR-011**: System MUST handle connectivity transitions (online/offline) gracefully — pausing sync on disconnect and resuming on reconnect without data loss.
- **FR-013**: If a delta sync request is rejected due to a permission error (access revoked server-side), the system MUST clear the local store data for that store and force the user back to the login screen.
- **FR-012**: System MUST classify tables into data tiers (Tier 1: critical/UI-blocking, Tier 2: background business data, Tier 3: on-demand) and hydrate in tier order.

### Key Entities

- **SyncCheckpoint**: Per-table metadata record storing the last synced **version/sequence number** and hydration status for a given store. Survives session changes.
- **OutboxEntry**: A queued local write operation (create/update/delete) with payload, target table, retry count, status, creation timestamp, and a **client-generated UUID idempotency key** that is sent with every upload attempt to prevent backend duplicates.
- **DataTier**: Classification of each synced table into Tier 1 (critical, blocks UI on cold start), Tier 2 (background, non-blocking), or Tier 3 (on-demand).
- **SyncSession**: A runtime object representing the current sync lifecycle — tracking which tiers are complete, whether a cold start is in progress, and current connectivity state.

---

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: After first login (cold start), the app UI is interactive within 5 seconds on a standard connection once Tier 1 data is loaded.
- **SC-002**: On returning login (local data present), the app UI is interactive within 2 seconds regardless of remote connectivity.
- **SC-003**: A delta sync transfers zero redundant records — only records changed since the last checkpoint are fetched.
- **SC-004**: The system handles 100,000+ local records without observable degradation in login time or UI responsiveness.
- **SC-005**: Offline write operations queued in the outbox are uploaded with 100% fidelity (no data loss, no duplicates) when connectivity is restored.
- **SC-006**: Logout and re-login to the same store does not trigger a full re-sync — only delta changes since the last checkpoint are fetched.
- **SC-007**: Background sync does not interrupt or visibly degrade any active user workflow (no UI freezes, no blocking dialogs).
- **SC-008**: All sync progress and errors are surfaced through non-intrusive status indicators visible to the operator.
- **SC-009**: The sync system emits structured logs and named metrics for every sync lifecycle event (start, complete, error, items transferred, duration) sufficient to diagnose data divergence and failure patterns without a code deployment.

---

## Clarifications

### Session 2026-04-14

- Q: What is the canonical delta sync mechanism — timestamp-based or version/sequence number? → A: Version/sequence number (monotonic, gap-detectable, consistent with existing event log design).
- Q: How should outbox duplicate prevention be enforced? → A: Client-generated UUID idempotency key per outbox entry; backend deduplicates by key.
- Q: What happens when a backend permanently rejects an outbox entry (non-retryable error)? → A: Mark as permanently failed, alert operator with visible notification, skip and continue processing remaining queue.
- Q: How should RBAC permission revocation be handled between sync cycles? → A: On next sync, a permission error triggers local store data clearance and forced re-authentication.
- Q: What observability scope is required for the sync system? → A: Structured logs + named metrics covering sync events, error rates, items transferred, and duration.

---

## Assumptions

- The remote backend can be extended to support delta sync endpoints with a `since_version` parameter (monotonic sequence number) and cursor-based pagination.
- Each syncable table exposes at minimum `id`, `version`, `updated_at`, and `deleted_at` fields from the backend. The `version` field is a monotonic sequence number maintained by the backend.
- Store identity is known at login time and is stable for the duration of a session.
- The existing local database schema can be extended to add a sync checkpoints table without breaking existing data.
- Conflict resolution uses last-write-wins (by `updated_at`) as the default strategy; no operational transforms or CRDTs are required at this stage.
- Tier classification for each table will follow the existing tiered sync definition already established in the project (Tier 1: stores, branches, products, users, accounts, entities; Tier 2: bills, transactions, inventory, journal entries, balance snapshots).
