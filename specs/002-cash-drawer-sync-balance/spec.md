# Feature Specification: Cash Drawer Sync & Balance Correctness

**Feature Branch**: `002-cash-drawer-sync-balance`  
**Created**: 2026-03-24  
**Status**: Draft  
**Input**: User description: "Read IMPROVEMENTS_ENHANCEMENTS_REPORT.md and create specification for the step 7. Cash Drawer Sync & Balance Correctness only"

## Overview

Cashiers and managers currently see an incorrect cash drawer balance in multiple scenarios: the balance freezes at the opening amount during a session, lags up to 30 seconds after transactions, shows zero after syncing from a second device, or displays "NaN" for certain transaction types. The balance also differs between screens and devices because two conflicting calculation methods are used. This feature establishes a single, reliable, and always-accurate cash balance that updates immediately after each transaction, propagates to all connected devices in near-real-time, and displays correctly across all branches in a multi-branch store.

---

## Clarifications

### Session 2026-03-24

- Q: When no cash drawer session is open, what should the balance display show? → A: A "Closed" status message with an "Open Cash Drawer" button — no balance figure is displayed.
- Q: When a balance calculation fails or produces an error (e.g., partial sync, corrupted data), what should the UI show? → A: Show zero — no error indicator or stale-value warning is displayed.
- Q: For cross-device real-time updates (FR-007), is adding a new event type for individual in-session transactions required, or is the existing sync cycle sufficient? → A: New event type required — second device must reflect balance changes within ~30 seconds of each transaction.
- Q: How should SC-008 ("cashiers report confidence in balance accuracy") be interpreted and validated? → A: The displayed balance must exactly reflect all recorded transactions. If physical cash differs from the displayed total, the cashier likely forgot to record a transaction — that is not a system fault. No automated test applies; cashiers validate by manual end-of-shift comparison.
- Q: Should viewing past closed session balances use the same session-scoped recalculation formula, or rely on stored fields? → A: The `cash_drawer_sessions` table stores `opening_amount`, `expected_amount` (system-calculated closing total), and `actual_amount` (physical cash counted at close). Past sessions display the stored `expected_amount` — no live recalculation. The live session-scoped formula (FR-003) applies to the current open session only. The gap between `expected_amount` and `actual_amount` is the reconciliation difference the cashier investigates at close.

---

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Live Balance After Each Transaction (Priority: P1)

A cashier completes a sale or records a cash payment. The cash drawer balance displayed on screen updates immediately to reflect the new amount — without the cashier needing to manually refresh, wait, or reopen the drawer.

**Why this priority**: This is the core reported bug. Cashiers rely on the displayed balance to verify their drawer at the end of every shift. A frozen or lagging balance leads to incorrect closeout reports and cash discrepancies.

**Independent Test**: Open a cash drawer session with a known opening float, process a sale, and verify the displayed balance equals the opening float plus the sale amount — without any manual refresh.

**Acceptance Scenarios**:

1. **Given** a cash drawer session is open with a $100 opening float, **When** a $25 sale is recorded, **Then** the balance display updates to $125 within 1 second without any manual action.
2. **Given** a cash drawer session is open, **When** a cash payment is received from a customer, **Then** the balance increases by exactly the payment amount immediately.
3. **Given** a cash drawer session is open, **When** a cash refund is issued, **Then** the balance decreases by the refund amount immediately.
4. **Given** a new session is opened, **When** the cashier views the balance, **Then** the displayed balance equals the opening float entered at session start (not zero or any stale value).

---

### User Story 2 - Consistent Balance Across All Screens (Priority: P1)

A manager viewing the cash drawer summary from the Home dashboard sees the same balance as a cashier viewing it from the POS screen. No matter which screen or report a user opens, the balance is the same number.

**Why this priority**: Multiple screens currently show different values for the same drawer because two different calculation methods are in use. This causes confusion and distrust in the system's reported figures, especially during audits and end-of-day reconciliation.

**Independent Test**: Open a session, process several transactions, then compare the balance shown on the Home dashboard against the balance on the POS screen — both must show the same amount.

**Acceptance Scenarios**:

1. **Given** a session is open and transactions have been posted, **When** a user views the balance on any screen (Home, POS, accounting), **Then** all screens show the same balance for the same session.
2. **Given** a session has been open for multiple hours with many transactions, **When** the manager views end-of-session totals, **Then** the displayed balance matches the independently calculated expected total (opening float + all cash-in − all cash-out).
3. **Given** a user opens any screen after a transaction, **Then** there is no scenario where one screen shows $0 and another shows the correct balance.

---

### User Story 3 - Correct Balance on a Second Device (Priority: P2)

A manager or supervisor opens the store app on a second device (e.g. a tablet) and views the cash drawer balance. The balance reflects all transactions recorded on the primary POS device in near-real-time — not a stale or zero value.

**Why this priority**: Store owners commonly monitor their branch from a second device. If the second device always shows zero or a stale balance, the monitoring feature is effectively broken.

**Independent Test**: On Device A, open a session with a $100 float and record a $50 sale. On Device B (connected to the same branch), view the cash drawer balance — it must show $150 within a reasonable time (under 5 minutes without manual sync, immediately after manual sync).

**Acceptance Scenarios**:

1. **Given** Device A posts a sale, **When** Device B performs a sync or catches up on events, **Then** Device B shows the updated balance reflecting that sale.
2. **Given** Device B syncs after Device A has made multiple transactions, **When** the sync completes, **Then** the balance on Device B is not zero — it reflects all synced transactions.
3. **Given** Device B comes back online after being offline, **When** it syncs, **Then** the balance resolves to the correct amount, not an intermediate or zero state.

---

### User Story 4 - Correct Balance After Returning Online (Priority: P2)

A cashier records transactions while the device is offline. When the internet connection is restored and the device syncs, the cash drawer balance reflects all offline transactions without showing a temporary zero or incorrect intermediate value.

**Why this priority**: The store operates in offline-first mode by design. If the balance becomes incorrect during the sync-and-reconnect transition, cashiers cannot trust the system during their most common workflow.

**Independent Test**: Go offline, record three transactions, come back online and sync — the balance must equal the offline starting balance plus all three transaction amounts without displaying any incorrect intermediate value.

**Acceptance Scenarios**:

1. **Given** a device is offline and records 3 cash transactions, **When** the device comes back online and syncs, **Then** the displayed balance equals the correct cumulative total of the opening float plus all 3 transactions.
2. **Given** the device syncs session and transaction data from the server, **When** the sync download includes session and transaction records, **Then** the balance does not temporarily show $0 before resolving to the correct amount.
3. **Given** two open-session records exist due to a sync conflict, **When** the system resolves which session is current, **Then** it consistently uses the most recently opened session and displays its associated balance.

---

### User Story 5 - Correct Balance Per Branch in Multi-Branch Stores (Priority: P2)

A user managing multiple branches sees each branch's cash drawer balance correctly. Branch A's balance never shows the currency or total of Branch B.

**Why this priority**: Multi-branch stores may operate in different currencies (e.g., USD for one branch, LBP for another). Displaying the wrong currency or the wrong branch's total is a financial error that affects reconciliation and trust.

**Independent Test**: In a store with two branches using different currencies, view the cash drawer for each branch — each must display its own balance in its own currency with no cross-contamination.

**Acceptance Scenarios**:

1. **Given** a store has two branches with different cash accounts, **When** a user views the cash balance for Branch A, **Then** the balance reflects Branch A's transactions and Branch A's currency only.
2. **Given** Branch B has had no transactions today, **When** viewing Branch B's balance, **Then** it shows Branch B's opening float — not Branch A's running total.

---

### User Story 6 - Balance Never Displays as Broken (Priority: P3)

The cash drawer balance always displays as a valid number. It never shows "NaN", undefined, or an empty field, even for transactions that only involve one currency (e.g., LBP-only transactions in a dual-currency store).

**Why this priority**: While less common, a "NaN" balance is a severe trust failure. It signals to users that the system is broken and makes any reconciliation impossible until the page is reloaded.

**Independent Test**: Record a cash transaction using only the secondary currency (e.g., LBP only, with no USD amount) and verify the displayed USD balance remains a valid number (zero or its prior value), not "NaN".

**Acceptance Scenarios**:

1. **Given** a transaction is recorded with an amount in only one currency, **When** the balance is displayed, **Then** the other currency shows its prior correct value (not NaN, not undefined).
2. **Given** a drawer session has processed mixed-currency and single-currency transactions, **When** any balance summary is displayed, **Then** all currency fields show valid numbers.

---

### Edge Cases

- What happens when a cash drawer session was never formally closed before a new one was opened (two "open" sessions exist in the data)?
- What happens if a device that was offline for an extended period syncs — does the balance recalculate correctly from all historical session entries?
- When there is no open session (the drawer has not been opened today), the balance display area shows a "Closed" status with an "Open Cash Drawer" button — no numeric balance is shown.
- What happens if a sync is interrupted mid-way — is the balance temporarily wrong, and does it self-correct on the next sync?
- How does a $0 opening float session behave — does the balance correctly start at $0 rather than a stale value?

---

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: The cash drawer balance displayed to the user MUST update to reflect each transaction (sale, payment, refund, cash adjustment) within 1 second of the transaction being recorded.
- **FR-002**: All screens and reports that display the cash drawer balance MUST use a single, unified balance calculation method for the current session — there must be no scenario where two screens show different totals for the same drawer. When no session is open, all balance display areas MUST show a "Closed" status and an "Open Cash Drawer" button instead of a numeric balance.
- **FR-003**: For the current **open** session, the system MUST calculate the running balance live as: `opening_amount` plus all cash received minus all cash paid out, within that session window only. For past **closed** sessions, the system MUST display the stored `expected_amount` field — no live recalculation is performed on closed sessions.
- **FR-004**: The cash drawer balance displayed at session open MUST reflect the opening float entered by the cashier — not a stale value from a previous session or a cached value from the server.
- **FR-005**: After a device syncs data from the server, the cash drawer balance MUST be recalculated and displayed correctly — it MUST NOT show zero as a result of session data arriving after transaction data during download.
- **FR-006**: In a multi-branch store, the balance displayed for a given branch MUST only include transactions and the opening float for that specific branch — no data from other branches must be mixed in.
- **FR-007**: The system MUST emit a dedicated event signal for every balance-affecting transaction (sale, payment, cash adjustment) so that a second device connected to the same branch reflects the updated balance within 30 seconds of the transaction being recorded — without requiring a full manual sync.
- **FR-008**: The cash drawer balance MUST always display as a valid number. If a transaction involves only one currency, the balance for the other currency MUST display as its prior valid value (e.g., zero), never as an invalid or missing value. If the balance calculation fails for any reason, the display MUST fall back to zero — no error indicator is shown to the user.
- **FR-009**: When multiple open session records exist for the same branch (due to a sync conflict or failed close), the system MUST deterministically select the most recently opened session as the authoritative one for balance calculation.
- **FR-010**: The system MUST NOT seed or initialise a branch's balance from a stale server-stored balance field. All balance calculations MUST be derived from live transaction and journal entry records.

### Key Entities

- **Cash Drawer Session**: Represents a single open-to-close period for a cash drawer at a branch. Key fields: `opening_amount` (the float entered when the session was opened), `expected_amount` (the system-calculated closing total written at session close — the sum of the opening float plus all recorded transactions), `actual_amount` (the physical cash count entered by the cashier at close). A session has a status of open or closed. While open, the running balance is derived live from all recorded transactions; when closed, the stored `expected_amount` is the authoritative closing balance for that session.
- **Cash Transaction**: A single balance-affecting event within a session (sale, payment received, refund, manual adjustment). Each transaction has an amount, currency, direction (in/out), and timestamp.
- **Cash Balance**: A derived value — not a stored field — representing the current net cash in the drawer for an open session. Calculated as: opening float + sum of all cash-in transactions − sum of all cash-out transactions, scoped to the current session.
- **Branch Cash Account**: Represents the cash account associated with a specific branch, including the currency it operates in. Used to scope balances to the correct branch and currency.

---

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: After any cash transaction is recorded, the balance displayed on screen updates within 1 second — measured from transaction confirmation to balance display refresh.
- **SC-002**: All screens displaying the cash drawer balance show the same value for the same session at the same point in time — zero discrepancy between screens.
- **SC-003**: After a device syncs from offline to online with 10 or more queued transactions, the displayed balance correctly reflects all 10 transactions without any manual page reload.
- **SC-004**: On a second device connected to the same branch, the cash drawer balance reflects the primary device's latest transaction within 30 seconds — no manual sync required.
- **SC-005**: In a multi-branch store, the cash balance for each branch shows only that branch's own totals — zero cross-branch data contamination in any test scenario.
- **SC-006**: The cash drawer balance never displays as "NaN", undefined, or blank in any scenario involving single-currency transactions — 100% of balance displays show a valid numeric value.
- **SC-007**: When a sync conflict results in two open sessions, the system consistently selects the same (most recent) session — the balance shown is identical across 10 consecutive page loads.
  - **SC-008**: At session close, the system-calculated `expected_amount` written to the session record exactly equals the opening float plus the sum of all transactions recorded during that session. If the cashier's physical count (`actual_amount`) differs from `expected_amount`, the cause is an unrecorded transaction — not a system calculation error. Cashiers validate this by comparing the displayed expected total to their physical cash count at end of shift.

---

## Assumptions

- The system already stores all individual cash transactions as journal or ledger entries — no new data capture is required; the fix is in how that data is read and displayed.
- "Near-real-time" for the second device is defined as: balance updates within 30 seconds of each transaction via a dedicated event signal, without requiring a manual sync.
- A "transaction" in this context refers to any event that changes the cash drawer balance: sales, payments received, refunds, and manual cash adjustments.
- The opening float value entered by the cashier when opening a session is always accurate and is the authoritative starting point for that session's balance.
- Multi-currency support (e.g., USD and LBP simultaneously) is an existing feature of the store app and must continue to work correctly after this fix.

---

## Out of Scope

- Changes to how cashiers open or close sessions (the session workflow UI is not being changed).
- Adding new types of cash transactions beyond what already exists.
- Historical balance correction for past sessions with incorrect data already stored (past sessions display the `expected_amount` written at close time — correcting historical stored values is out of scope).
- Performance optimisation of the sync process itself (only the order/dependency of what is downloaded is in scope where it affects balance correctness).

