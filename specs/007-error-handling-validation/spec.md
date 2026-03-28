# Feature Specification: Error Handling and Validation Best Practices

**Feature Branch**: `007-error-handling-validation`  
**Created**: 2026-03-27  
**Status**: Draft  
**Input**: User description: "Create the specification for 2.4 Error handling and validation only use the best practice"

---

## Context

This specification addresses the open item identified in section **2.4** of the Improvements & Enhancements Report:

> Services throw strings or `new Error(...)` with varying messages; no shared error code or type. Validation is spread across transactionService, journalService, crudHelperService, and the UI. Recommendation: introduce a unified `AppError` type, handle errors in a single place in the UI, consolidate validation for critical paths in one module, and harden public statement security.

---

## User Scenarios & Testing *(mandatory)*

### User Story 1 — Cashier Receives Clear, Actionable Error Feedback (Priority: P1)

A cashier attempting an invalid operation — such as creating a transaction with a missing amount, selecting a non-existent account, or submitting a bill without a supplier — currently sees either a silent failure or a raw technical message (e.g., `"TypeError: Cannot read property 'id' of undefined"`). After this feature, the cashier sees a brief, specific message that tells them exactly what went wrong and, where possible, what to do next (e.g., *"Amount is required."* or *"This bill is missing a supplier — please select one before saving."*).

**Why this priority**: Cashiers interact with critical financial operations dozens of times per shift. Unhelpful or missing error feedback directly causes data quality issues (incomplete records) and user frustration. This is the highest-value outcome.

**Independent Test**: Can be fully tested by submitting a transaction form with a missing required field and confirming the user sees a specific, non-technical error message — without any other story being implemented.

**Acceptance Scenarios**:

1. **Given** a cashier is creating a new transaction and leaves the amount field empty, **When** they submit the form, **Then** they see a clear inline or pop-up notification identifying "Amount is required" before any data is saved.
2. **Given** a service-layer operation fails due to a business rule violation (e.g., balance would go negative), **When** the UI receives the error, **Then** the user sees a human-readable message — no raw stack trace, no database error codes, no `undefined` references are shown.
3. **Given** a technical system error occurs (e.g., the local data store fails to write), **When** the UI receives the error, **Then** the user sees a generic "Something went wrong — please try again" message, and the full error details are logged for developers (not displayed to the user).

---

### User Story 2 — Validation Catches Errors Before Data is Persisted (Priority: P2)

Currently, validation logic is duplicated or missing across `transactionService`, `journalService`, `crudHelperService`, and individual UI components. Some invalid records are silently written to the local database, causing downstream balance calculation errors or sync conflicts. After this feature, all inputs for critical business operations (transaction creation, journal entry creation, bill creation) are validated in one authoritative place before any persistence is attempted.

**Why this priority**: Silent persistence of invalid records is the root cause of several downstream bugs (incorrect balances, failed sync, journal entry mismatches). Centralising validation before write is a prerequisite for trust in the financial data layer.

**Independent Test**: Can be fully tested by invoking a transaction creation with an intentionally malformed payload and verifying that validation rejects the input with a structured error — without the record appearing in the local database.

**Acceptance Scenarios**:

1. **Given** a transaction creation is triggered with a zero or negative amount, **When** the validation step runs, **Then** the operation is rejected before any database write with a structured error identifying the failing rule.
2. **Given** a journal entry creation is triggered with mismatched debit and credit totals, **When** the validation step runs, **Then** the operation is rejected before any database write, and the caller receives a structured error.
3. **Given** the same business rule is enforced in two or more service files today (e.g., "amount must be positive" in both `transactionService` and `journalService`), **When** the validation module is introduced, **Then** that rule exists in exactly one location and both services delegate to it.
4. **Given** a valid payload for a critical operation, **When** validation runs, **Then** the operation proceeds as normal with no performance degradation visible to the user.

---

### User Story 3 — Public Statement Access is Secured Server-Side (Priority: P3)

The public customer statement page currently fetches data using client-side filtering on a token or customer identifier. A technically savvy customer could manipulate the client-side request to view another customer's account data. After this feature, access to public statements is enforced at the server level — no statement data is returned unless the server validates the access token, regardless of what the client sends.

**Why this priority**: This is a security and compliance requirement. Customer financial data exposed to unauthorized parties creates legal and reputational risk. It is lower priority than P1/P2 only because it requires backend policy changes in addition to frontend work.

**Independent Test**: Can be fully tested by crafting a direct API request that bypasses the client-side token check and confirming that the server returns no customer data (empty result or access-denied response).

**Acceptance Scenarios**:

1. **Given** a valid, unexpired access token for Customer A, **When** the public statement page loads, **Then** only Customer A's data is returned.
2. **Given** a manipulated or missing access token, **When** a request is made to the public statement endpoint, **Then** the server returns no customer data — the response contains either an empty result or an explicit access-denied indicator.
3. **Given** an expired access token, **When** the public statement page loads, **Then** the user sees a clear message that the statement link has expired or is no longer valid, with no customer data exposed.

---

### Edge Cases

- What happens when an error occurs during an **offline operation** (no network)? The error must still be surfaced to the user immediately — offline state must not swallow errors silently.
- What happens when a **bulk operation** partially fails (e.g., 8 of 10 records succeed)? The user must be informed of both the successes and the failures; partial results must not be silently discarded.
- What happens when **multiple errors occur simultaneously** (e.g., concurrent form submissions)? The error presentation must not flood the UI; errors should be deduplicated or queued gracefully.
- What happens when **validation fails on a field the user hasn't interacted with yet**? Validation feedback should be deferred until the user submits or moves away from a field — not shown preemptively on page load.
- What happens when a **sync error** occurs in the background? The user should be notified non-intrusively (e.g., a status indicator) without blocking foreground operations.

---

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: The system MUST use a single, shared error type across all service layers that carries at minimum: an error code (machine-readable, stable string), a user-facing message (human-readable, non-technical), and optional contextual details (for developer logging only).
- **FR-002**: The system MUST present all service-layer errors to the user through a single, centralized UI notification channel — individual service callers MUST NOT implement their own ad-hoc alert or developer-console-based error display.
- **FR-003**: The system MUST validate all inputs for the following critical business operations before any data is persisted: transaction creation, journal entry creation, and bill creation.
- **FR-004**: Validation logic for any given business rule MUST exist in exactly one module — rule duplication across services is not permitted.
- **FR-005**: Public statement data MUST be access-controlled at the server level; client-side token filtering alone is not a sufficient access control mechanism.
- **FR-006**: Error messages presented to end-users MUST be written in plain language; raw stack traces, database error strings, internal record IDs, and technical exception names MUST NOT be shown to end-users.
- **FR-007**: The system MUST distinguish between at least three error categories in error responses: **validation errors** (user-correctable input problems), **system errors** (transient failures the user can retry), and **unrecoverable errors** (data integrity issues requiring developer attention).
- **FR-008**: Errors that occur during offline operations MUST be surfaced to the user immediately and MUST NOT be silently swallowed because network connectivity is unavailable.
- **FR-009**: The shared error type and validation module MUST be usable from any service in the application without creating circular dependencies.

### Key Entities

- **AppError**: A structured error value carrying an error code, a user-facing message, and optional developer-facing details. Its properties are consistently defined and stable across the entire codebase.
- **ValidationResult**: The outcome of a validation check for a business operation, containing a pass/fail indicator and, on failure, a list of specific rule violations (field name + violation message).
- **ErrorCategory**: An enumeration classifying errors as `validation`, `system`, or `unrecoverable` — determines how the UI presents the error and whether a retry action is offered.

---

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: All service-layer errors across `transactionService`, `journalService`, `crudHelperService`, and `inventoryPurchaseService` carry a structured error code — zero service errors are thrown as plain strings after this feature is complete.
- **SC-002**: End-users never see raw technical content (stack traces, database messages, `undefined`, internal IDs) in error notifications — 100% of user-visible error messages are human-readable plain-language strings.
- **SC-003**: Invalid inputs for transaction creation, journal entry creation, and bill creation are rejected before any local data is written in 100% of tested invalid-input scenarios.
- **SC-004**: Any business validation rule that previously existed in more than one service file exists in exactly one validation module after this feature — duplication count drops to zero for covered critical paths.
- **SC-005**: The public statement endpoint returns no customer data when provided with an invalid, expired, or absent access token — verified by a direct API test that bypasses client-side token handling.
- **SC-006**: All user-visible errors from critical operations (transaction, bill, journal) are presented to the user within 2 seconds of the operation completing.
- **SC-007**: The introduction of the validation module does not increase the median time for a successful transaction creation by more than 50 milliseconds as measured on a mid-range device.
